export const NEWS_EMPTY_NOTE='本次未取得与用户主题相关的新闻；未用全市场或其他主题内容补齐。'
const capacity='【新闻容量适配】',original='【原始工作台需求】'
const aliases=[
 ['比特币','bitcoin','btc','xbt'],['以太坊','ethereum','eth','ether'],
 ['加密货币','加密市场','加密资产','数字资产','crypto','cryptocurrency','cryptocurrencies','区块链','blockchain','稳定币','stablecoin'],
 ['半导体','芯片','晶圆','光刻','semiconductor','semiconductors'],
 ['古籍','古籍保护','古籍修复','纸张脱酸','脱酸','馆藏保护'],['黄金','gold']
]
const unique=values=>[...new Set(values)]
const contains=(text,term)=>/[a-z]/iu.test(term)?new RegExp('(?:^|[^a-z0-9])'+term.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')+'(?:$|[^a-z0-9])','iu').test(text):text.includes(term)

// Only the captured human request can override a legacy panel's scope. Query
// terms, returned headlines and model-authored titles never supply authority.
export function newsHumanScope(requirement=''){
 let text=String(requirement)
 if(text.includes(original))text=text.split(original).at(-1).replace(/^\s*以下原始用户需求[^\n]*\n/u,'')
 else if(/^工作台：/u.test(text))text=text.split('\n仅生成本面板，')[0].split('\n【新闻主题约束】')[0]
 return text.split(/\n【|\n仅生成本面板，/u)[0].replace(/(?:不要|不需要|不得|排除|不含|\bwithout\b|\bexclude\b)[^。；;，,\n]*/giu,'').trim()
}
export function newsTopicTerms(requirement){
 const human=newsHumanScope(requirement),known=aliases.filter(group=>group.some(term=>contains(human,term)))
 // Named coins are narrower than the general crypto industry. A broad human
 // crypto request additionally admits actual sector/regulatory coverage.
 if(known.includes(aliases[2]))return unique(aliases.slice(0,3).flat())
 if(known.some(group=>group===aliases[0]||group===aliases[1]))return unique(known.flat())
 const cleaned=human.replace(/(?:工作台|本面板|新闻资讯|最新资讯|最新新闻|新闻列表|相关新闻|相关报道|新闻|资讯|报道|动态|监控|行情|研究|工作|展示|生成|创建|建立|搭建|检索|查询|读取|保留|标注|提供|获取|显示|只|仅|请|为|一个|关于|围绕|实时|最新|近期|最近|重要|原文|链接|摘要|标题|来源|日期|时间|记录|内容|数据|自动|刷新|更新|完整|全部|每分钟|最多|实际|相关|the|news|latest|recent|research|dashboard|monitor|show|display|source|articles?|reports?|updates?|and|with|for)/giu,' ')
 const pieces=cleaned.split(/[\s，,。；;：:/、()（）“”"\d]+|以及|或者|与|和|及/u).filter(Boolean)
 const terms=pieces.flatMap(piece=>{
  if(/^[\p{Script=Han}]{2,12}$/u.test(piece))return[piece]
  return [...new Intl.Segmenter('zh-CN',{granularity:'word'}).segment(piece)].filter(s=>s.isWordLike&&s.segment.length>=2).map(s=>s.segment)
 })
 return unique([...known.flat(),...terms]).filter(term=>term.length>=2&&term.length<=64).slice(0,48)
}
const related=(value,terms)=>terms.some(term=>contains(value,term))
const textOf=item=>[item?.title,item?.summary,item?.content,...(Array.isArray(item?.excerpts)?item.excerpts:[])].filter(v=>typeof v==='string').join(' ')
const esc=value=>String(value??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const safeUrl=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}}
const sourceRows=records=>records.filter(record=>record.purpose!=='discovery').flatMap(record=>Array.isArray(record.snapshotRows)?record.snapshotRows.map(row=>({...row,title:row.sourceTitle??row.title,url:row.urls?.find(safeUrl)})):Array.isArray(record.response?.records)?record.response.records:Array.isArray(record.response?.sources)?record.response.sources:[]).filter(row=>typeof row?.title==='string').slice(0,2000)
const note=(prior,count)=>[prior, count?`宿主按用户原需求核对主题，已剔除 ${count} 条不相关记录。`:null].filter(Boolean).join('\n').slice(0,2000)
const isScopedNews=(data,requirement)=>data?.type==='news'||String(requirement).includes(capacity)&&(['html','table'].includes(data?.type)||data?.type==='market'&&data.variant==='table')

export function controlledNewsHtml(title,items,empty=NEWS_EMPTY_NOTE){
 const articles=items.map(item=>`<article><time>${esc(item.date??item.time??'来源未提供日期')}</time><h2>${safeUrl(item.url)?`<a href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a>`:esc(item.title)}</h2><p>${esc(item.summary??'来源未提供摘要')}</p>${item.publisher?`<small>${esc(item.publisher)}</small>`:''}</article>`).join('')
 const script=`const rows=Array.from(document.querySelectorAll('article')),search=document.querySelector('input'),previous=document.getElementById('previous'),next=document.getElementById('next');const shared=window.sherlockShared.register({initialState:{query:'',page:0},reduce:(state,action)=>action.type==='search'?{query:String(action.query).slice(0,256),page:0}:action.type==='page'?{...state,page:Math.max(0,state.page+action.delta)}:state,render:(state,context)=>{const found=rows.filter(row=>row.textContent.toLocaleLowerCase().includes(state.query.toLocaleLowerCase())),page=Math.min(state.page,Math.max(0,Math.ceil(found.length/20)-1)),disabled=context.readOnly||!context.connected;search.value=state.query;search.disabled=disabled;rows.forEach(row=>row.hidden=true);found.forEach((row,i)=>row.hidden=Math.floor(i/20)!==page);previous.disabled=disabled||page===0;next.disabled=disabled||(page+1)*20>=found.length;document.getElementById('count').textContent=found.length+' / '+rows.length;document.getElementById('empty').hidden=found.length>0;}});search.oninput=()=>shared.dispatch({type:'search',query:search.value});previous.onclick=()=>shared.dispatch({type:'page',delta:-1});next.onclick=()=>shared.dispatch({type:'page',delta:1});`
 return {version:1,type:'html',title,html:`<style>body{margin:0;padding:10px;color:var(--sherlock-text);background:var(--sherlock-surface);font:13px/1.6 var(--sherlock-font-sans)}header{display:flex;gap:8px;align-items:center}input{flex:1;min-width:80px}input,button{font:inherit;color:inherit;background:var(--sherlock-surface-muted);border:1px solid var(--sherlock-border);border-radius:4px;padding:4px 8px}article{padding:10px 0;border-bottom:1px solid var(--sherlock-border)}article[hidden],[hidden]{display:none}h2{font-size:13px;margin:4px 0}p{margin:4px 0}a{color:var(--sherlock-link)}time,small,.note{font-size:11px;color:var(--sherlock-muted)}</style><header><input aria-label="搜索新闻" placeholder="搜索新闻"><button id="previous">上一页</button><button id="next">下一页</button><span id="count" role="status"></span></header><p class="note">按用户主题筛选的已取得来源快照；未绑定自动更新。</p><p id="empty" role="status">${esc(empty)}</p><main>${articles}</main><script>${script}</script>`}
}

/** Filtering never treats a provider's search response as proof of relevance. */
export function filterScopedNewsArtifact(data,records=[],requirement='',{general=false}={}){
 if(!isScopedNews(data,requirement)||general)return data
 const terms=newsTopicTerms(requirement)
 if(data.type==='html'){
  // Never execute or surgically patch model scripts. Rebuild this news-only
  // capacity route from actual source rows into a small host-owned reading UI.
  // Use all actual source rows: an incomplete model page cannot truncate a
  // second retrieved company or the final page. Model HTML supplies no data.
  const kept=sourceRows(records).filter(row=>related(textOf(row),terms)),seen=new Set()
  return controlledNewsHtml(data.title,kept.filter(row=>{const key=row.url??row.title;if(seen.has(key))return false;seen.add(key);return true}))
 }
 if(data.type==='news'&&Array.isArray(data.items)){
  const sources=sourceRows(records)
  const items=data.items.filter(item=>related(textOf(item)+' '+textOf(sources.find(row=>safeUrl(item.url)&&safeUrl(row.url)===safeUrl(item.url)&&row.title===item.title)),terms)),removed=data.items.length-items.length
  return {...data,items,note:items.length?note(data.note,removed)||undefined:NEWS_EMPTY_NOTE}
 }
 if(Array.isArray(data.rows)){
  const selected=data.rows.flatMap((row,i)=>related(row.map(cell=>String(cell??'')).join(' '),terms)?[i]:[]),rows=selected.map(i=>data.rows[i])
  const aligned=Object.fromEntries(['rowLinks','tones'].filter(key=>Array.isArray(data[key])&&data[key].length===data.rows.length).map(key=>[key,selected.map(i=>data[key][i])]))
  return {...data,...aligned,rows,note:rows.length?note(data.note,data.rows.length-rows.length)||undefined:NEWS_EMPTY_NOTE}
 }
 return data
}
