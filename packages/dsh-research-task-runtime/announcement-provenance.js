// Fixed-adapter facts are retained as facts, never re-authored as an article
// summary. Other feeds and unmatched URLs keep their existing content.
export function normalizeAnnouncementFeed(data,records=[]) {
 if(!['news','reports'].includes(data?.type)||!Array.isArray(data.items))return data
 const sources=records.filter(record=>record?.tool==='public_data_query'&&record.purpose!=='discovery'&&record.args?.operation==='query'&&record.args.source==='eastmoney-announcements'&&record.response?.sourceId==='eastmoney-announcements'&&Array.isArray(record.response.records))
 if(!sources.length)return data
 const safeUrl=value=>{try{const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='data.eastmoney.com'||url.username||url.password)return null;url.hash='';return url.href}catch{return null}}
 const caption='公告来源与范围：东方财富证券公告列表，仅本次实际取得的首页记录，不代表完整披露范围；公告日期与列表展示时间分别保留，来源未提供原文摘要。'
 let changed=false,matched=false
 const items=data.items.map(item=>{
  const url=safeUrl(item?.url)
  if(!url)return item
  const matches=sources.flatMap(source=>source.response.records.filter(row=>safeUrl(row?.url)===url).map(row=>({row,source})))
  if(!matches.length||new Set(matches.map(({row})=>row.title)).size!==1)return item
  const {row,source}=matches.at(-1)
  if(typeof row.title!=='string'||!row.title.trim()||row.title.length>256||typeof row.code!=='string'||!/^\d{6}$/.test(row.code)||typeof row.name!=='string'||!row.name.trim()||row.name.length>128||!new URL(url).pathname.match(new RegExp(`^/notices/detail/${row.code}/AN\\d{12,24}\\.html$`)))return item
  const notice=typeof row.noticeDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.noticeDate)?row.noticeDate:null
  const displayed=typeof row.time==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+08:00$/.test(row.time)&&Number.isFinite(Date.parse(row.time))?row.time.replace('T',' ').replace('+08:00','（上海时间）'):null
  const company=`${row.name} · ${row.code}`
  const summary=[displayed?`列表展示：${displayed}`:'列表展示时间未提供',`公告日期：${notice??'来源未提供'}`,row.category?`原始分类：${row.category}`:'',`来源未提供原文摘要；以上为首页列表元数据，详情请打开原文。`].filter(Boolean).join('；')
  if(summary.length>2000)return item
  const restored={...item,title:row.title,date:notice??'公告日期未提供',time:'公告日',category:company,publisher:`${source.response.source??'东方财富证券公告列表'} · ${company}`,summary}
  matched=true
  if(JSON.stringify(restored)===JSON.stringify(item))return item
  changed=true;return restored
 })
 let note=data.note
 if(matched&&!(typeof note==='string'&&note.includes(caption))){const next=[note,caption].filter(Boolean).join('\n');if(next.length<=2000){note=next;changed=true}}
 return changed?{...data,items,...(note?{note}:{})}:data
}
