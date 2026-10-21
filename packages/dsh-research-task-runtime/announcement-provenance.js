// Only the fixed adapter's observed business responses can restore announcement
// metadata. A URL identifies a candidate; it never resolves conflicting facts.
function sources(records=[]) {
 return records.filter(record=>record?.tool==='public_data_query'&&record.purpose!=='discovery'&&record.args?.operation==='query'&&record.args.source==='eastmoney-announcements'&&record.response?.sourceId==='eastmoney-announcements'&&Array.isArray(record.response.records))
}
function safeUrl(value) {
 try{const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='data.eastmoney.com'||url.username||url.password)return null;url.hash='';return url.href}catch{return null}
}
export function noticeDay(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(value)||value.startsWith('0000'))return null
 return Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:null
}
function displayTime(row) {
 return typeof row.time==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+08:00$/u.test(row.time)&&noticeDay(row.time.slice(0,10))&&Number.isFinite(Date.parse(row.time))?row.time:null
}
function announcementTitle(value) {
 return typeof value==='string'?value.normalize('NFKC').replace(/\s/gu,'').toLowerCase():''
}
function sameAnnouncementTitle(value,row) {
 // Prove the business heading before restoring anything. Only explicit display
 // metadata can differ: width/spacing, this issuer's prefix, its legal company
 // header, and a category annotation that matches the observed category.
 const category=value=>announcementTitle(value).split('·').map(part=>part.replace(/(?:公告|情况)$/u,'')).join('·')
 const heading=value=>{
  let title=announcementTitle(value),issuer=announcementTitle(row.name)+':'
  if(title.startsWith(issuer))title=title.slice(issuer.length)
  const codedIssuer=announcementTitle(row.code+row.name)
  if(title.startsWith(codedIssuer))title=title.slice(codedIssuer.length)
  const annotation=title.match(/\(类型:([^()]*)\)$/u)
  if(annotation&&category(annotation[1])===category(row.category))title=title.slice(0,annotation.index)
  return title
 }
 const title=heading(value),original=heading(row.title)
 if(!title)return false
 if(title===original)return true
 // The source itself may prefix the heading with a formal issuer designation.
 // Never strip arbitrary title words or a company prefix supplied by the model.
 const legal=original.match(/^([^:()\d]{2,64}股份有限公司)(?=关于|20\d{2}年)/u)
 return Boolean(legal&&!/关于|收购|出售|投资|计划|公告|报告|未|不/u.test(legal[1])&&title===original.slice(legal[1].length))
}
function observed(item,records) {
 const url=safeUrl(item?.url)
 if(!url)return {issue:'原文链接未对应已取得公告'}
 const matches=sources(records).flatMap(source=>source.response.records.filter(row=>safeUrl(row?.url)===url).map(row=>({row,source})))
 if(!matches.length)return {issue:'原文链接未对应已取得公告'}
 const identities=new Set(matches.map(({row})=>JSON.stringify([row.title,row.code,row.name,row.noticeDate,row.time])))
 if(identities.size!==1)return {issue:'同一原文链接的来源身份或日期存在冲突歧义'}
 const {row,source}=matches[0]
 if(typeof row.title!=='string'||!row.title.trim()||row.title.length>256||typeof row.code!=='string'||!/^\d{6}$/u.test(row.code)||typeof row.name!=='string'||!row.name.trim()||row.name.length>128||!new URL(url).pathname.match(new RegExp(`^/notices/detail/${row.code}/AN\\d{12,24}\\.html$`)))return {issue:'公告公司与原文链接身份不一致'}
 const companyFields=[item.actor,item.object,item.category,item.publisher].filter(v=>typeof v==='string')
 const otherNames=sources(records).flatMap(s=>s.response.records).filter(r=>r.code!==row.code).map(r=>r.name).filter(Boolean)
 const wrongHeadlineCompany=typeof item.title==='string'&&otherNames.some(name=>item.title.normalize('NFKC').startsWith(name+':')&&!row.title.normalize('NFKC').startsWith(name+':'))
 if(wrongHeadlineCompany||(item.actor!==undefined&&item.actor!==row.name)||companyFields.some(v=>(v.match(/(?<!\d)\d{6}(?!\d)/gu)??[]).some(code=>code!==row.code)||otherNames.some(name=>v.includes(name))))return {issue:'展示公司与同条已取得公告公司不一致'}
 if(!sameAnnouncementTitle(item.title,row))return {issue:'标题未对应同条已取得公告，不能用原文链接替换另一事件或公司'}
 return {row,source}
}
export function announcementItemRequired(data,item,records=[],options={}) {
 if(!sources(records).length)return false
 if(data?.type==='timeline')return /公告/u.test([data.title,data.subject,options.panelRequest].filter(Boolean).join('\n'))||data.items?.some(i=>safeUrl(i?.url)&&/^\/notices\/detail\//u.test(new URL(i.url).pathname))
 const url=safeUrl(item?.url)
 return ['news','reports'].includes(data?.type)&&Boolean(url&&/^\/notices\/detail\//u.test(new URL(url).pathname))
}
export function explicitWindows(value) {
 if(typeof value!=='string')return []
 // Deliberately bounded grammar: no dates inferred from “recent”, month lengths,
 // retrieval timestamps, URL identifiers, or model-supplied asOf metadata.
 return [...value.matchAll(/(?<!\d)(\d{4}-\d{2}-\d{2})\s*(?:至|到|[~～—–])\s*(\d{4}-\d{2}-\d{2})(?!\d)/gu)].map(m=>({start:m[1],end:m[2]}))
}
export function announcementEvidenceIssue(data,records=[],options={}) {
 const items=Array.isArray(data?.items)?data.items:[]
 if(!items.length&&announcementItemRequired(data,null,records,options))return '公告时间线至少需要1条已核验记录；没有有效记录不能伪装为成功快照。'
 if(!items.some(item=>announcementItemRequired(data,item,records,options)))return null
 const windows=[...explicitWindows(options.panelRequest),...explicitWindows(data.range)]
 if(windows.some(w=>!noticeDay(w.start)||!noticeDay(w.end)||w.start>w.end))return '公告日期窗口无效；请保留真实请求范围，不补造日期。'
 const invalid=[],outside=[]
 items.forEach((item,index)=>{
  if(!announcementItemRequired(data,item,records,options))return
  const match=observed(item,records)
  if(match.issue){invalid.push(`第${index+1}条：${match.issue}`);return}
  const notice=noticeDay(match.row.noticeDate),raw=data.type==='timeline'?item.time:item.date
  const title=value=>typeof value==='string'?value.normalize('NFKC').replace(/\s/gu,'').toLowerCase():''
  if(title(item.title)!==title(match.row.title)){invalid.push(`第${index+1}条：标题未对应同条已取得公告`);return}
  if(notice?raw!==notice:raw!==undefined&&raw!==null){invalid.push(`第${index+1}条：公告日期必须使用同条 noticeDate，不能借用列表展示日期`);return}
  if(windows.length&&(!notice||windows.some(w=>notice<w.start||notice>w.end)))outside.push(index+1)
 })
 return [invalid.length?`公告来源核验：${invalid.join('；')}。`:null,outside.length?`公告第 ${outside.join('、')} 条的公告日期未知或超出明确日期窗口／范围。`:null,
  invalid.length||outside.length?'逐条保留已取得原始标题、公司、noticeDate与原文链接；范围外或未知日期不得作为窗口内公告。保留有效记录和全部研究对象，缺口与原因写入 note，不通过扩大范围标签或静默删条保留旧计数来绕过校验。':null].filter(Boolean).join('\n')||null
}
export function normalizeAnnouncementFeed(data,records=[]) {
 if(!['news','reports','timeline'].includes(data?.type)||!Array.isArray(data.items))return data
 if(!sources(records).length)return data
 const caption='公告来源与范围：东方财富证券公告列表，仅本次实际取得的首页记录，不代表完整披露范围；公告日期与列表展示时间分别保留，来源未提供原文摘要。'
 let changed=false,matched=false
 const items=data.items.map(item=>{
  if(!announcementItemRequired(data,item,records))return item
  const {row,source}=observed(item,records)
  if(!row)return item
  const notice=noticeDay(row.noticeDate),displayed=displayTime(row)
  const company=`${row.name} · ${row.code}`
  const summary=[displayed?`列表展示：${displayed.replace('T',' ').replace('+08:00','（上海时间）')}`:'列表展示时间未提供',`公告日期：${notice??'来源未提供'}`,row.category?`原始分类：${row.category}`:'',`来源未提供原文摘要；以上为首页列表元数据，详情请打开原文。`].filter(Boolean).join('；')
  if(summary.length>2000)return item
  const restored=data.type==='timeline'?{...item,title:row.title,time:notice,actor:row.name,object:`${row.name} ${row.code}`,source:source.response.source??'东方财富证券公告列表',summary,...(!notice?{timeMissing:'来源未提供有效公告日期（noticeDate），不以列表展示时间补齐'}:{})}:{...item,title:row.title,date:notice??undefined,time:'公告日',category:company,publisher:`${source.response.source??'东方财富证券公告列表'} · ${company}`,summary}
  matched=true
  if(JSON.stringify(restored)===JSON.stringify(item))return item
  changed=true;return restored
 })
 let note=data.note
 if(matched&&!(typeof note==='string'&&note.includes(caption))){const next=[note,caption].filter(Boolean).join('\n');if(next.length<=2000){note=next;changed=true}}
 return changed?{...data,items,...(note?{note}:{})}:data
}
