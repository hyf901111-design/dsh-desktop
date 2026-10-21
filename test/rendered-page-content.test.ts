import { afterEach, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { renderedPageContentScript } from '../src/main/search/rendered-page-content'
let window: Window

afterEach(async () => { await window?.happyDOM.abort(); vi.useRealTimers() })
it('retains unmounted chapters in order while traversing a nested virtual document', async () => {
  window = new Window()
  window.document.body.innerHTML = '<nav><a href="#chapter3">3. 后续操作</a></nav><div id="scroll" style="overflow-y:auto"><div class="docx-page-block"></div></div>'
  const scroller = window.document.getElementById('scroll')!
  const doc = scroller.firstElementChild!
  let top = 0
  const render = () => {
    const n = Math.min(3, Math.floor(top / 300) + 1)
    doc.innerHTML = `<div data-block-id="${n}" data-record-id="chapter${n}" data-block-type="heading1">${n}. ${n === 3 ? '后续操作' : '章节'}</div><div data-block-id="${n + 10}" data-record-id="text${n}" data-block-type="text">${('第' + n + '章操作步骤。').repeat(20)}</div>`
  }
  Object.defineProperties(scroller, {
    clientHeight: { value: 400 }, scrollHeight: { value: 1300 },
    scrollTop: { get: () => top, set: value => { top = Math.min(900, value); render() } }
  })
  render()
  const result = await window.eval(renderedPageContentScript(10_000))
  expect(result.complete).toBe(true)
  expect(result.sourceText).toContain('第1章操作步骤')
  expect(result.sourceText).toContain('第2章操作步骤')
  expect(result.sourceText).toContain('第3章操作步骤')
  expect(result.blockCount).toBe(6)
  expect(top).toBe(900)
})
it('reports missing outline chapters and a bounded incomplete traversal', async () => {
  window = new Window()
  window.document.body.innerHTML = '<a href="#missing">3. 缺失章节</a><div class="docx-page-block"><div data-block-id="1" data-record-id="intro" data-block-type="text">首章正文</div></div>'
  const result = await window.eval(renderedPageContentScript(400))
  expect(result.complete).toBe(false)
  expect(result.missingHeadings).toBe(1)
  expect(result.sourceText).toContain('首章正文')
})

it('does not certify a loading Feishu shell as the full document', async () => {
  window = new Window({url:'https://efund.feishu.cn/wiki/document'})
  window.document.body.innerHTML = '<main>' + '正在载入文档'.repeat(40) + '</main>'
  const result = await window.eval(renderedPageContentScript(400))
  expect(result.complete).toBe(false)
  expect(result.sourceText).toBe('')
})

it('retains the observed news headline, adjacent publication date and original anchor URL',async()=>{
  window=new Window({url:'https://vip.stock.finance.sina.com.cn/corp/go.php/vCB_AllNewsStock/symbol/sh600011.phtml'})
  window.document.body.innerHTML=`<nav><a href="https://example.test/navigation">导航入口</a></nav><main><div class="datelist"><ul>
    &nbsp;&nbsp;2026-10-20&nbsp;17:37&nbsp;<a href="https://finance.sina.com.cn/stock/bxjj/2026-10-20/doc-inivwitp6520843.shtml">华能国际(600011.SH)：完成30亿元超短期融资券发行</a><br>
    &nbsp;&nbsp;2026-10-18&nbsp;20:04&nbsp;<a href="https://finance.sina.com.cn/stock/hkstock/ggscyd/2026-10-18/doc-inivrzvp7254319.shtml">华能国际电力股份完成发行20亿元中期票据</a><br>
    <li><a href="/article/no-date">没有日期的真实链接仍应保留，但不能借用前一条的日期</a></li>
    <li><a href="/article/next-date">下一条有独立发布日期的公司公告</a><span>2026-10-17 08:00</span></li>
    <li>2026-10-15 <a href="/article/ambiguous">日期不唯一时不得指定发布日期</a> 2026-10-16</li>
    <a href="#chapter">页内锚点</a><a href="javascript:alert(1)">脚本地址</a><a href="https://user:pass@example.test/private">带凭据地址</a>
    <a hidden href="https://example.test/hidden">隐藏链接</a>
  </ul></div></main>`
  const result=await window.eval(renderedPageContentScript(500))
  expect(result.links).toEqual([
    {title:'华能国际(600011.SH)：完成30亿元超短期融资券发行',url:'https://finance.sina.com.cn/stock/bxjj/2026-10-20/doc-inivwitp6520843.shtml',date:'2026-10-20'},
    {title:'华能国际电力股份完成发行20亿元中期票据',url:'https://finance.sina.com.cn/stock/hkstock/ggscyd/2026-10-18/doc-inivrzvp7254319.shtml',date:'2026-10-18'},
    {title:'下一条有独立发布日期的公司公告',url:'https://vip.stock.finance.sina.com.cn/article/next-date',date:'2026-10-17'},
    {title:'没有日期的真实链接仍应保留，但不能借用前一条的日期',url:'https://vip.stock.finance.sina.com.cn/article/no-date'},
    {title:'日期不唯一时不得指定发布日期',url:'https://vip.stock.finance.sina.com.cn/article/ambiguous'}
  ])
  expect(result.sourceText).toContain('完成30亿元超短期融资券发行')
})

it('prioritizes dated source records over long nonsemantic navigation menus within the link budget',async()=>{
  window=new Window({url:'https://example.org/news'})
  window.document.body.innerHTML='<div>'+Array.from({length:250},(_,i)=>`<a href="/nav/${i}">站点入口${i}</a>`).join('')+'</div><main><ul>2026-10-20 <a href="/story/real">公司最新财务与经营差异公告</a><br></ul></main>'
  // A legacy page without a semantic main includes all its utility links.
  window.document.querySelector('main')!.outerHTML=window.document.querySelector('main')!.outerHTML.replace(/main/g,'section')
  const result=await window.eval(renderedPageContentScript(500))
  expect(result.links).toHaveLength(200)
  expect(result.links[0]).toEqual({title:'公司最新财务与经营差异公告',url:'https://example.org/story/real',date:'2026-10-20'})
})

it.each(['div','section','article'])('associates the only explicit date with its local %s news card',async tag=>{
  window=new Window({url:'https://example.org/search'})
  window.document.body.innerHTML=`<main><${tag}><h2><a href="/story">公司发布经营公告</a></h2><div><span>新闻来源</span><span>2026-10-20 18:06:00</span></div></${tag}></main>`
  const pending=window.eval(renderedPageContentScript(400))
  expect((await pending).links).toEqual([{title:'公司发布经营公告',url:'https://example.org/story',date:'2026-10-20'}])
})

it('reads the observed div title and separate metadata branches without including a neighboring relative-time story',async()=>{
  window=new Window({url:'https://example.org/search'})
  window.document.body.innerHTML=`<main><div class="result-content-wrapper"><a href="/dated"><img alt=""></a><div class="result-text"><div class="result-title"><a href="/dated">公司<font color="red">公告</font>标题</a></div><div class="result-intro">新闻摘要。</div><div class="result-meta"><span class="source">新闻来源</span><span class="time">2026-10-20 18:06:00</span></div></div></div><div class="result-text"><div class="result-title"><a href="/2026-10-21/relative">另一条新闻</a></div><div class="result-meta"><span>新闻来源</span><span>4小时前</span></div></div></main>`
  const pending=window.eval(renderedPageContentScript(400))
  expect((await pending).links).toEqual([
    {title:'公司公告标题',url:'https://example.org/dated',date:'2026-10-20'},
    {title:'另一条新闻',url:'https://example.org/2026-10-21/relative'}
  ])
})

it.each([
  ['neighboring card','<div><h2><a href="/story">新闻标题</a></h2></div><div><h2><a href="/other">另一条新闻</a></h2><span>2026-10-20</span></div>'],
  ['outer page wrapper','<div><div><h2><a href="/story">新闻标题</a></h2></div><div>2026-10-20</div></div>'],
  ['page clock','<header>2026-10-20</header><div><h2><a href="/story">新闻标题</a></h2></div>'],
  ['footer date','<div><h2><a href="/story">新闻标题</a></h2><footer><span>2026-10-20</span></footer></div>'],
  ['adjacent footer','<a href="/story">新闻标题</a><footer><span>2026-10-20</span></footer>'],
  ['adjacent section','<a href="/story">新闻标题</a><section><span>2026-10-20</span></section>'],
  ['heading date','<div><h2><span>2026-10-20</span><a href="/story">新闻标题</a></h2><div>4小时前</div></div>'],
  ['multiple dates','<div><h2><a href="/story">新闻标题</a></h2><span>2026-10-20</span><span>2026-10-19</span></div>'],
  ['multiple records','<div><h2><a href="/story">新闻标题</a></h2><span>2026-10-20</span><a href="/other">另一条新闻</a></div>'],
  ['duplicate links','<div><h2><a href="/story">新闻标题</a></h2><span>2026-10-20</span><a href="/story">查看原文</a></div>'],
  ['source link','<div><h2><a href="/story">新闻标题</a></h2><div><a href="/publisher">新闻来源</a><span>2026-10-20</span></div></div>'],
  ['hidden date','<div><h2><a href="/story">新闻标题</a></h2><div hidden><span>2026-10-20</span></div></div>'],
  ['aria-hidden date','<div><h2><a href="/story">新闻标题</a></h2><div aria-hidden="true"><span>2026-10-20</span></div></div>'],
  ['display-none date','<div><h2><a href="/story">新闻标题</a></h2><div style="display:none"><span>2026-10-20</span></div></div>'],
  ['invisible date','<div><h2><a href="/story">新闻标题</a></h2><span style="visibility:hidden">2026-10-20</span></div>'],
  ['relative time with an excerpt date','<div><h2><a href="/story">新闻标题</a></h2><p>本文回顾2026-10-20的事件。</p><span>4小时前</span></div>'],
  ['invalid calendar date','<div><h2><a href="/story">新闻标题</a></h2><span>2026-02-30</span></div>'],
  ['deep wrapper','<div><h2><a href="/story">新闻标题</a></h2><div><div><div><div><div><span>2026-10-20</span></div></div></div></div></div></div>'],
  ['deep headline','<div><h2><span><span><span><span><a href="/story">新闻标题</a></span></span></span></span></h2><span>2026-10-20</span></div>'],
  ['oversized card',`<div><h2><a href="/story">新闻标题</a></h2><span>${'摘要'.repeat(400)}</span><span>2026-10-20</span></div>`],
  ['many descendants',`<div><h2><a href="/story">新闻标题</a></h2>${'<span>摘要</span>'.repeat(80)}<span>2026-10-20</span></div>`]
])('keeps a card date unknown for %s',async(_name,html)=>{
  window=new Window({url:'https://example.org/search'})
  window.document.body.innerHTML='<main>'+html+'</main>'
  const pending=window.eval(renderedPageContentScript(400))
  expect((await pending).links.find((link:{title:string})=>link.title==='新闻标题')).toEqual({title:'新闻标题',url:'https://example.org/story'})
})

it.each(['hidden','aria-hidden="true"','style="display:none"','style="visibility:hidden"'])('excludes %s dates from legacy rows and card captions',async hidden=>{
  window=new Window({url:'https://example.org/search'})
  window.document.body.innerHTML=`<main><ul><li><a href="/row">旧列表新闻</a><span ${hidden}>2026-10-19</span><span>2026-10-20</span></li></ul><div><h2><a href="/card">卡片新闻</a></h2><div ${hidden}><span>2026-10-19</span></div><div><span>2026-10-20</span></div></div><a ${hidden} href="/hidden">隐藏新闻</a></main>`
  const pending=window.eval(renderedPageContentScript(400))
  expect((await pending).links).toEqual([
    {title:'旧列表新闻',url:'https://example.org/row',date:'2026-10-20'},
    {title:'卡片新闻',url:'https://example.org/card',date:'2026-10-20'}
  ])
})

it.each(['title','excerpt'])('does not treat a standalone date inside a %s as the publication caption',async mode=>{
  window=new Window({url:'https://example.org/search'})
  const title=mode==='title'?'<span>2026-10-20</span>新闻标题':'新闻标题'
  const excerpt=mode==='excerpt'?'<p>新闻回顾<span>2026-10-20</span></p>':''
  window.document.body.innerHTML=`<main><div><h2><a href="/story">${title}</a></h2>${excerpt}<div><span>4小时前</span></div></div></main>`
  const result=await window.eval(renderedPageContentScript(400))
  expect(result.links).toEqual([{title:mode==='title'?'2026-10-20新闻标题':'新闻标题',url:'https://example.org/story'}])
})

it.each(['li','tr','p'])('preserves the publication date in a single-link %s row',async tag=>{
  window=new Window({url:'https://example.org/search'})
  const content='2026-10-20 <a href="/story">旧列表新闻</a>'
  const row=`<${tag}>${tag==='tr'?'<td>'+content+'</td>':content}</${tag}>`
  window.document.body.innerHTML='<main>'+(tag==='tr'?'<table><tbody>'+row+'</tbody></table>':row)+'</main>'
  const pending=window.eval(renderedPageContentScript(400))
  expect((await pending).links).toEqual([{title:'旧列表新闻',url:'https://example.org/story',date:'2026-10-20'}])
})


it('returns primary article metadata from its own H1 and publication metadata, not recommended stories or arbitrary body dates',async()=>{
 window=new Window({url:'https://example.org/policy/main'})
 window.document.head.innerHTML='<title>页面标题 - 网站</title><meta property="og:type" content="article"><meta property="og:title" content="煤电容量电价机制政策解读"><meta property="article:published_time" content="2026-01-30T16:27:00+08:00">'
 window.document.body.innerHTML='<article><h1>煤电容量电价机制政策解读</h1><p>该政策介绍2023-11-10以来的制度变化。</p><li>2026-10-20 <a href="/recommended">另一条推荐新闻，不能替换主文日期</a></li></article>'
 const result=await window.eval(renderedPageContentScript(400))
 expect(result.article).toEqual({title:'煤电容量电价机制政策解读',date:'2026-01-30'})
 expect(result.links[0].date).toBe('2026-10-20')
})

it.each(['matched','linked-heading','different-heading','hidden-heading','conflicting-titles'])('matches explicit ArticleTitle metadata to its visible H2 without borrowing related articles: %s',async mode=>{
 window=new Window({url:'https://example.org/policy/main'})
 const title='国家发展改革委、国家能源局完善发电侧容量电价机制'
 window.document.head.innerHTML=`<meta name="ArticleTitle" content="${title}"><meta name="PubDate" content="2026-01-30 11:23:28">`
 let heading=`<h2>${title}</h2>`
 if(mode==='linked-heading')heading=`<h2><a href="/related">${title}</a></h2>`
 if(mode==='different-heading')heading='<h2>另一篇不同标题的原文</h2>'
 if(mode==='hidden-heading')heading=`<div hidden>${heading}</div>`
 if(mode==='conflicting-titles')window.document.head.innerHTML+='<meta name="ArticleTitle" content="另一篇不同标题的原文">'
 window.document.body.innerHTML=`<div>${heading}<div><div>发布时间：2026/01/30</div><div>来源：价格司</div></div><p>正文引用2023-11-10，不能当作发布日期。</p></div><aside><h2><a href="/related">另一条推荐新闻</a></h2><p>2026-10-16</p></aside>`
 const result=await window.eval(renderedPageContentScript(400))
 if(mode==='matched')expect(result.article).toEqual({title,date:'2026-01-30'})
 else expect(result.article).toBeUndefined()
})

it.each(['body-only-date','conflicting-published','recommended-jsonld','multiple-h1'])('does not invent main article identity from %s',async mode=>{
 window=new Window({url:'https://example.org/policy/main'})
 window.document.head.innerHTML='<title>页面标题 - 网站</title>'
 window.document.body.innerHTML='<article><h1>煤电容量电价机制政策解读</h1><p>这是正文日期2026-01-30，不能自动认定为发布日期。</p></article>'
 if(mode==='conflicting-published')window.document.head.innerHTML+='<meta property="article:published_time" content="2026-01-30"><meta name="publishdate" content="2026-02-01">'
 if(mode==='recommended-jsonld')window.document.head.innerHTML+='<script type="application/ld+json">{"@type":"NewsArticle","headline":"另一篇标题不匹配的推荐文章","datePublished":"2026-01-30","url":"https://example.org/recommended"}</script>'
 if(mode==='multiple-h1'){window.document.body.innerHTML+='<h1>另一个不同的主标题</h1>';window.document.head.innerHTML+='<meta property="article:published_time" content="2026-01-30">'}
 const result=await window.eval(renderedPageContentScript(400))
 expect(result.article).toBeUndefined()
})

it('accepts same-page Article JSON-LD only when its headline matches the unique visible H1',async()=>{
 window=new Window({url:'https://example.org/policy/main'})
 window.document.head.innerHTML='<title>页面标题 - 网站</title><script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","headline":"煤电容量电价机制政策解读","datePublished":"2026-01-30T16:27:00+08:00","url":"https://example.org/policy/main"},{"@type":"NewsArticle","headline":"推荐文章","datePublished":"2026-10-20","url":"https://example.org/another"}]}</script>'
 window.document.body.innerHTML='<article><h1>煤电容量电价机制政策解读</h1><p>原文正文</p></article>'
 const result=await window.eval(renderedPageContentScript(400))
 expect(result.article).toEqual({title:'煤电容量电价机制政策解读',date:'2026-01-30'})
})


it('supports a short primary headline and an article with explicit OpenGraph identity but no visible H1',async()=>{
 window=new Window({url:'https://example.org/story/price'})
 window.document.head.innerHTML='<meta property="og:type" content="article"><meta property="og:title" content="煤价上涨"><meta property="article:published_time" content="2026-10-20">'
 window.document.body.innerHTML='<main><p>原文正文，不以正文中的2026-01-30当发布日期。</p></main>'
 const result=await window.eval(renderedPageContentScript(400))
 expect(result.article).toEqual({title:'煤价上涨',date:'2026-10-20'})
})


it('reads a legacy publication caption from the primary H1 adjacent metadata block without borrowing the page clock or article-body dates',async()=>{
 window=new Window({url:'https://www.cctd.com.cn/show-176-257515-1.html'})
 window.document.head.innerHTML='<title>国家发展改革委、国家能源局等部门在山西召开加快煤矿复产增产保供工作推进会 - 煤炭产业综合 - CCTD中国煤炭市场网</title>'
 window.document.body.innerHTML='<header>2026-10-21 05:59 星期三</header><div class="news_show"><h1>国家发展改革委、国家能源局等部门在山西召开加快煤矿复产增产保供工作推进会</h1><div class="news_tool"><ul><li>来源：国家能源局</li><li>发布时间：2026-10-16 15:42:32</li><li><a href="#font">字号</a></li></ul></div><script>/* no execution needed */</script><div id="zoom"><p>文件正文提到2026-07-06和2023-11-10，这些不是网页发布时间。</p></div></div><aside><h2>相关阅读</h2>发布时间：2026-10-20</aside>'
 const result=await window.eval(renderedPageContentScript(400))
 expect(result.article).toEqual({title:'国家发展改革委、国家能源局等部门在山西召开加快煤矿复产增产保供工作推进会',date:'2026-10-16'})
})

it.each(['body-paragraph','related-heading','hidden-metadata','conflicting-captions'])('does not take a legacy primary publication date from %s',async mode=>{
 window=new Window({url:'https://example.org/main'})
 let sibling='<p>发布时间：2026-10-16 是正文中的引用。</p>'
 if(mode==='related-heading')sibling='<div><h2>推荐文章</h2>发布时间：2026-10-16</div>'
 if(mode==='hidden-metadata')sibling='<div hidden>发布时间：2026-10-16</div>'
 if(mode==='conflicting-captions')sibling='<div>发布时间：2026-10-16<br>发布日期：2026-10-17</div>'
 window.document.body.innerHTML='<h1>这是一篇主文的实际完整标题</h1>'+sibling+'<main>主文正文2026-08-10</main>'
 const result=await window.eval(renderedPageContentScript(400))
 expect(result.article).toBeUndefined()
})
