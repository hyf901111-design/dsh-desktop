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


it('returns primary article metadata from its own H1 and publication metadata, not recommended stories or arbitrary body dates',async()=>{
 window=new Window({url:'https://example.org/policy/main'})
 window.document.head.innerHTML='<title>页面标题 - 网站</title><meta property="og:type" content="article"><meta property="og:title" content="煤电容量电价机制政策解读"><meta property="article:published_time" content="2026-01-30T16:27:00+08:00">'
 window.document.body.innerHTML='<article><h1>煤电容量电价机制政策解读</h1><p>该政策介绍2023-11-10以来的制度变化。</p><li>2026-10-20 <a href="/recommended">另一条推荐新闻，不能替换主文日期</a></li></article>'
 const result=await window.eval(renderedPageContentScript(400))
 expect(result.article).toEqual({title:'煤电容量电价机制政策解读',date:'2026-01-30'})
 expect(result.links[0].date).toBe('2026-10-20')
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
