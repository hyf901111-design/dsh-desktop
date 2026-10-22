export const NEWS_EMPTY_NOTE='本次未取得与用户主题相关的新闻；未用全市场或其他主题内容补齐。'
const capacity='【新闻容量适配】',original='【原始工作台需求】'
// Source requests are already bounded by the acquisition layer. Apply these
// display budgets only after relevance/deduplication; leave room below the
// host's 200 KB HTML limit for the controlled reading UI and coverage notice.
const NEWS_HTML_ARTICLES=2000,NEWS_HTML_BODY_BYTES=180000
const semiconductor=['半导体','semiconductor','semiconductors']
const semiconductorTopics=[
 ['芯片','chip','chips','集成电路','integrated circuit','integrated circuits'],
 ['晶圆','wafer','wafers'],
 ['光刻','光刻机','光刻设备','lithography','photolithography','EUV','DUV','极紫外','深紫外']
]
const aliases=[
 ['比特币','bitcoin','btc','xbt'],['以太坊','ethereum','eth','ether'],
 ['加密货币','加密市场','加密资产','数字资产','crypto','cryptocurrency','cryptocurrencies','区块链','blockchain','稳定币','stablecoin'],
 semiconductor,...semiconductorTopics,
 ['古籍','古籍保护','古籍修复','纸张脱酸','脱酸','馆藏保护'],['黄金','gold']
]
const unique=values=>[...new Set(values)]
const contains=(text,term)=>/[a-z]/iu.test(term)?new RegExp('(?:^|[^a-z0-9])'+term.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&').replace(/\s+/gu,'\\s+')+'(?:$|[^a-z0-9])','iu').test(text):text.includes(term)
const englishNoise=/^(?:the|news|latest|recent|research|dashboard|monitor|show|display|source|articles?|reports?|updates?|and|with|for|only|all|please|in|within|of|on|from|about|at|to|industr(?:y|ies)|sectors?)$/iu
function newsEntities(human){
 const entities=[]
 const keep=value=>{const name=value.trim().replace(/\s+/gu,' ');if(name.length>=2&&name.length<=64)entities.push(name);return ' '}
 // Quoting is an explicit entity boundary, including names that are also
 // ordinary instruction words. Never split a protected name into generic OR terms.
 let text=human.replace(/[“"‘']([^”"’'\n]{2,64})[”"’']/gu,(match,value)=>/[a-z]/iu.test(value)?keep(value):match)
 text=text.replace(/\b[A-Za-z][A-Za-z0-9&.'-]*(?:[ \t]+[A-Za-z][A-Za-z0-9&.'-]*)*\b/gu,(span,offset)=>span.split(/\s+(\b(?:and|or)\b)\s+/iu).map((part,index,parts)=>{
  const words=part.split(/\s+/u)
  while(words.length>1&&(/^(?:please|show|display|monitor|all)$/iu.test(words[0])||/^(?:only|research)$/iu.test(words[0])&&englishNoise.test(words[1])))words.shift()
  while(words.length>1&&englishNoise.test(words.at(-1)))words.pop()
  const topics=words.every(word=>englishNoise.test(word)||aliases.some(group=>group.some(term=>term.toLocaleLowerCase()===word.toLocaleLowerCase())))
  const explicit=index===parts.length-1&&words.length===1&&/^\s*(?:品牌|公司|企业|集团)/u.test(text.slice(offset+span.length))
  const named=explicit||!topics&&words.length>1&&(words.some(word=>/^[A-Z]/u.test(word)&&!englishNoise.test(word))||/^(?:corp(?:oration)?|inc|ltd|llc|plc|holdings|group|company)\.?$/iu.test(words.at(-1)))
  return named?keep(words.join(' ')):part
 }).join(' '))
 return {text,entities:unique(entities)}
}
function independentParentScope(human,parent,children){
 human=human.replace(/[“”"‘’']/gu,'')
 const childTerms=children.flat(),has=(text,group)=>group.some(term=>contains(text,term))
 // A parent mentioned only as context for a child does not authorize siblings.
 if(human.split(/[。；;，,\n]/u).some(clause=>has(clause,parent)&&!has(clause,childTerms)&&/(?:新闻|资讯|报道|动态|\b(?:news|reports?|coverage|updates?)\b)/iu.test(clause)))return true
 const pattern=group=>group.map(term=>term.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')).join('|')
 const qualifier='(?:\\s*(?:行业|产业|领域|新闻|industry|sector|news))*\\s*',join='(?:以及|和|与|及|、|&|\\band\\b|\\bincluding\\b|包括|涵盖)\\s*'
 return new RegExp(`(?:${pattern(parent)})${qualifier}${join}(?:${pattern(childTerms)})|(?:${pattern(childTerms)})${qualifier}${join}(?:${pattern(parent)})`,'iu').test(human)
}

// Only the captured human request can override a legacy panel's scope. Query
// terms, returned headlines and model-authored titles never supply authority.
export function newsHumanScope(requirement=''){
 let text=String(requirement)
 if(text.includes(original))text=text.split(original).at(-1).replace(/^\s*以下原始用户需求[^\n]*\n/u,'')
 else if(/^工作台：/u.test(text))text=text.split('\n仅生成本面板，')[0].split('\n【新闻主题约束】')[0]
 return text.split(/\n【|\n仅生成本面板，/u)[0].replace(/(?:不要|不需要|不得|排除|不含|\bwithout\b|\bexclude\b)[^。；;，,\n]*/giu,'').trim()
}
export function newsTopicTerms(requirement){
 const human=newsHumanScope(requirement),{text,entities}=newsEntities(human)
 let known=aliases.filter(group=>group.some(term=>contains(text,term)||entities.some(name=>name.toLocaleLowerCase()===term.toLocaleLowerCase())))
 // Broader sector intent may admit its subtopics. A child topic never expands
 // to its parent or siblings merely because they share an industry.
 const children=semiconductorTopics.filter(group=>known.includes(group))
 if(known.includes(semiconductor)&&children.length&&!independentParentScope(human,semiconductor,children))known=known.filter(group=>group!==semiconductor)
 if(known.includes(semiconductor))known.push(...semiconductorTopics)
 // Named coins are narrower than the general crypto industry. A broad human
 // crypto request additionally admits actual sector/regulatory coverage.
 if(known.includes(aliases[2]))return unique([...entities,...aliases.slice(0,3).flat()])
 if(known.some(group=>group===aliases[0]||group===aliases[1]))return unique([...entities,...known.flat()])
 const cleaned=text.replace(/(?:工作台|本面板|新闻资讯|最新资讯|最新新闻|新闻列表|相关新闻|相关报道|新闻|资讯|报道|动态|监控|行情|研究|工作|展示|生成|创建|建立|搭建|检索|查询|读取|保留|标注|提供|获取|显示|只|仅|请|为|一个|关于|围绕|实时|最新|近期|最近|重要|原文|链接|摘要|标题|来源|日期|时间|记录|内容|数据|自动|刷新|更新|完整|全部|每分钟|最多|实际|相关|行业|产业|领域|公司|企业|品牌)/gu,' ')
  .replace(/\b[a-z]+\b/giu,word=>englishNoise.test(word)?' ':word)
 const pieces=cleaned.split(/[\s，,。；;：:/、()（）“”"\d]+|以及|或者|与|和|及/u).filter(Boolean)
 const terms=pieces.flatMap(piece=>{
  if(/^[\p{Script=Han}]{2,12}$/u.test(piece))return[piece]
  return [...new Intl.Segmenter('zh-CN',{granularity:'word'}).segment(piece)].filter(s=>s.isWordLike&&s.segment.length>=2).map(s=>s.segment)
 })
 const inherited=children.length&&!known.includes(semiconductor)?new Set(semiconductor):new Set()
 return unique([...entities,...known.flat(),...terms]).filter(term=>!inherited.has(term.toLocaleLowerCase())&&term.length>=2&&term.length<=64).slice(0,48)
}
const related=(value,terms)=>terms.some(term=>contains(value,term))
// A ticker alone is ambiguous. Exclude only explicitly identified alternate
// meanings, never a research institution's genuine crypto research or a mixed
// medical/crypto article. The source title and readable evidence decide this;
// provider names, URLs and the model's selected search query do not.
const cryptoNames='(?:比特币|以太坊|以太币|加密(?:货币|资产|市场|行业)|数字资产|稳定币|区块链|\\b(?:bitcoin|ethereum|cryptocurrenc(?:y|ies)|crypto|blockchain|stablecoins?)\\b)'
const cryptoEvidence=new RegExp(cryptoNames+'|链上|币价|代币|挖矿|质押|\\b(?:BTC|XBT|ETH)\\s*[/:-]?\\s*(?:USDT|USDC|USD|EUR)\\b|\\b(?:BTC|XBT|ETH)\\s+(?:ETF|staking|futures)\\b|(?:捐赠|捐款|支付|转账|买入|购入|卖出|持仓|持有|\\b(?:donat\\w*|purchas\\w*|bought|sold|paid|holdings?)\\b)[^。；;\\n]{0,24}\\d+(?:[.,]\\d+)*\\s*枚?\\s*(?:BTC|XBT|ETH)\\b','iu')
const negatedCryptoEvidence=new RegExp('(?:与|跟|和)?'+cryptoNames+'(?:[、/或和与\\s]+'+cryptoNames+')*\\s*(?:无关|不相关|没有关系)|(?:不是|并非|不指|不代表|不涉及|非)\\s*'+cryptoNames+'|\\b(?:unrelated\\s+to|not\\s+(?:(?:about|related\\s+to|a|an)\\s+)?|no\\s+relation\\s+to|nothing\\s+to\\s+do\\s+with)\\s*'+cryptoNames,'giu')
const substantiveCrypto=value=>cryptoEvidence.test(value.replace(negatedCryptoEvidence,' '))
function explicitCryptoHomonym(value){
 return contains(value,'btc')&&/(?:胆道癌|胆管癌|胆道(?:系统)?(?:恶性)?肿瘤|\bbiliary[\s-]+tract[\s-]+(?:cancers?|carcinomas?)\b|\bbile[\s-]+duct[\s-]+cancers?\b)/iu.test(value)
  ||contains(value,'eth')&&/(?:苏黎世联邦理工(?:学院|大学)?|\bETH[\s-]+(?:Z[üu]rich|Zuerich)\b|\bSwiss Federal Institute of Technology\b|\bEidgenössische Technische Hochschule\b)/iu.test(value)
}
function newsMatcher(terms,requirement){
 // Alternate meanings in exclusions or a mixed request must not disable an
 // explicit crypto scope. Only an alternate-meaning-only request opts out.
 const human=newsHumanScope(requirement),cryptoScope=terms.some(term=>aliases.slice(0,3).some(group=>group.includes(term.toLocaleLowerCase())))&&(!explicitCryptoHomonym(human)||substantiveCrypto(human))
 return value=>related(value,terms)&&(!cryptoScope||!explicitCryptoHomonym(value)||substantiveCrypto(value))
}
const textOf=item=>[item?.title,item?.summary,item?.content,...(Array.isArray(item?.excerpts)?item.excerpts:[])].filter(v=>typeof v==='string').join(' ')
const esc=value=>String(value??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const safeUrl=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}}
const sourceRows=records=>records.filter(record=>record.purpose!=='discovery').flatMap(record=>Array.isArray(record.snapshotRows)?record.snapshotRows.map(row=>({...row,title:row.sourceTitle??row.title,url:row.urls?.find(safeUrl)})):Array.isArray(record.response?.records)?record.response.records:Array.isArray(record.response?.sources)?record.response.sources:[]).filter(row=>typeof row?.title==='string')
const note=(prior,count)=>[prior, count?`宿主按用户原需求核对主题，已剔除 ${count} 条不相关记录。`:null].filter(Boolean).join('\n').slice(0,2000)
const isScopedNews=(data,requirement)=>data?.type==='news'||String(requirement).includes(capacity)&&(['html','table'].includes(data?.type)||data?.type==='market'&&data.variant==='table')

export function controlledNewsHtml(title,items,empty=NEWS_EMPTY_NOTE){
 const shown=[];let bytes=0
 for(const item of items){
  const article=`<article><time>${esc(item.date??item.time??'来源未提供日期')}</time><h2>${safeUrl(item.url)?`<a href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a>`:esc(item.title)}</h2><p>${esc(item.summary??'来源未提供摘要')}</p>${item.publisher?`<small>${esc(item.publisher)}</small>`:''}</article>`,size=new TextEncoder().encode(article).length
  if(shown.length<NEWS_HTML_ARTICLES&&bytes+size<=NEWS_HTML_BODY_BYTES){shown.push(article);bytes+=size}
 }
 const articles=shown.join(''),omitted=items.length-shown.length
 const coverage=omitted?`<p class="note" role="status">已取得 ${items.length} 条相关记录，当前展示 ${shown.length} 条；另 ${omitted} 条超过组件展示容量，尚未展示。请缩小时间范围或拆分组件查看。</p>`:''
 const emptyText=items.length?(shown.length?'当前筛选条件下没有匹配新闻。':'已取得相关新闻，但内容超出组件展示容量；请缩小范围或拆分组件。'):empty
 const script=`const rows=Array.from(document.querySelectorAll('article')),search=document.querySelector('input'),previous=document.getElementById('previous'),next=document.getElementById('next');const shared=window.sherlockShared.register({initialState:{query:'',page:0},reduce:(state,action)=>action.type==='search'?{query:String(action.query).slice(0,256),page:0}:action.type==='page'?{...state,page:Math.max(0,state.page+action.delta)}:state,render:(state,context)=>{const found=rows.filter(row=>row.textContent.toLocaleLowerCase().includes(state.query.toLocaleLowerCase())),page=Math.min(state.page,Math.max(0,Math.ceil(found.length/20)-1)),disabled=context.readOnly||!context.connected;search.value=state.query;search.disabled=disabled;rows.forEach(row=>row.hidden=true);found.forEach((row,i)=>row.hidden=Math.floor(i/20)!==page);previous.disabled=disabled||page===0;next.disabled=disabled||(page+1)*20>=found.length;document.getElementById('count').textContent=found.length+' / '+rows.length;document.getElementById('empty').hidden=found.length>0;}});search.oninput=()=>shared.dispatch({type:'search',query:search.value});previous.onclick=()=>shared.dispatch({type:'page',delta:-1});next.onclick=()=>shared.dispatch({type:'page',delta:1});`
 return {version:1,type:'html',title,html:`<style>body{margin:0;padding:10px;color:var(--sherlock-text);background:var(--sherlock-surface);font:13px/1.6 var(--sherlock-font-sans)}header{display:flex;gap:8px;align-items:center}input{flex:1;min-width:80px}input,button{font:inherit;color:inherit;background:var(--sherlock-surface-muted);border:1px solid var(--sherlock-border);border-radius:4px;padding:4px 8px}article{padding:10px 0;border-bottom:1px solid var(--sherlock-border)}article[hidden],[hidden]{display:none}h2{font-size:13px;margin:4px 0}p{margin:4px 0}a{color:var(--sherlock-link)}time,small,.note{font-size:11px;color:var(--sherlock-muted)}</style><header><input aria-label="搜索新闻" placeholder="搜索新闻"><button id="previous">上一页</button><button id="next">下一页</button><span id="count" role="status"></span></header><p class="note">按用户主题筛选的已取得来源快照；未绑定自动更新。</p>${coverage}<p id="empty" role="status">${esc(emptyText)}</p><main>${articles}</main><script>${script}</script>`}
}

/** Filtering never treats a provider's search response as proof of relevance. */
export function filterScopedNewsArtifact(data,records=[],requirement='',{general=false}={}){
 if(!isScopedNews(data,requirement)||general)return data
 const terms=newsTopicTerms(requirement),matches=newsMatcher(terms,requirement)
 if(data.type==='html'){
  // Never execute or surgically patch model scripts. Rebuild this news-only
  // capacity route from actual source rows into a small host-owned reading UI.
  // Use all actual source rows: an incomplete model page cannot truncate a
  // second retrieved company or the final page. Model HTML supplies no data.
  const kept=sourceRows(records).filter(row=>matches(textOf(row))),seen=new Set()
  return controlledNewsHtml(data.title,kept.filter(row=>{const address=safeUrl(row.url),key=JSON.stringify(address?[address,row.title]:[row.title,row.date??row.time??'',row.publisher??'',row.id??row.articleId??'']);if(seen.has(key))return false;seen.add(key);return true}))
 }
 if(data.type==='news'&&Array.isArray(data.items)){
  const sources=sourceRows(records)
  const items=data.items.filter(item=>{
   const observed=sources.filter(row=>safeUrl(item.url)&&safeUrl(row.url)===safeUrl(item.url)&&row.title===item.title)
   // Once an article is observed, its source text decides relevance. Model
   // summaries cannot add a requested company to an unrelated source article.
   return observed.length?observed.some(row=>matches(textOf(row))):matches(textOf(item))
  }),removed=data.items.length-items.length
  return {...data,items,note:items.length?note(data.note,removed)||undefined:NEWS_EMPTY_NOTE}
 }
 if(Array.isArray(data.rows)){
  const selected=data.rows.flatMap((row,i)=>matches(row.map(cell=>String(cell??'')).join(' '))?[i]:[]),rows=selected.map(i=>data.rows[i])
  const aligned=Object.fromEntries(['rowLinks','tones'].filter(key=>Array.isArray(data[key])&&data[key].length===data.rows.length).map(key=>[key,selected.map(i=>data[key][i])]))
  return {...data,...aligned,rows,note:rows.length?note(data.note,data.rows.length-rows.length)||undefined:NEWS_EMPTY_NOTE}
 }
 return data
}
