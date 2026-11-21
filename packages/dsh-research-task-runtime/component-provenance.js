const native=new Set(['timeline','chart','table','market','kpi'])
const fields=new Set(['label','name','title','url','text','fetchedAt'])
const esc=value=>String(value).replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))

export function tableSourceHref(label, value) {
 if (!/链接|网址|^(?:原文|检索入口|url|link)$/iu.test(label.trim()) || typeof value !== 'string') return null
 const href = value.trim()
 if (!/^https?:\/\/[^\s\u0000-\u001f\u007f]+$/iu.test(href) || href.length > 8192) return null
 try {
  const url = new URL(href)
  if (url.username || url.password) return null
 } catch { return null }
 return href
}

export function tableSourceLink(label, value) {
 const href = tableSourceHref(label, value)
 if (href === null) return null
 return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="打开链接：${esc(href)}">${esc(value)}</a>`
}

// Provenance is not a business column or a renderer-specific schema. Retain
// every supplied alias and retrieval date in the common inert source footer.
// Never interpret a retrieval timestamp as the original data's asOf.
export function nativeProvenance(spec){
 if(!native.has(spec?.type)||spec.source===undefined&&spec.sources===undefined||typeof spec.source==='string')return {data:spec}
 const rows=[...(spec.source===undefined?[]:[spec.source]),...(Array.isArray(spec.sources)?spec.sources:[])]
 if(spec.sources!==undefined&&!Array.isArray(spec.sources)||rows.length>100||Buffer.byteLength(JSON.stringify(rows))>32000)return {invalid:true}
 const {source,sources,...data}=spec
 if(!rows.length)return {data,metadata:{sources}}
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||!Object.keys(row).length)return {invalid:true}
  // A named internal source may have no public link. It still identifies
  // the data provider in the client source panel.
  const named=[row.label,row.name,row.title].some(value=>typeof value==='string'&&value.trim())
  for(const [key,value] of Object.entries(row)){
   if(key==='url'&&value===''&&named)continue
   if(!fields.has(key)||typeof value!=='string'||!value.trim()||value.length>8000)return {invalid:true}
  }
  if(row.url){try{const url=new URL(row.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||/[\u0000-\u0020\u007f]/u.test(row.url))return {invalid:true}}catch{return {invalid:true}}}
 }
 const html='<aside hidden data-component-source-info>'+rows.map(row=>{
  const labels=[...new Set([row.label,row.name,row.title].filter(Boolean))]
  return '<p>'+labels.map(esc).join(' · ')+(row.url?' <a href="'+esc(row.url)+'">'+esc(row.url)+'</a>':'')+'</p>'+(row.text?'<p>'+esc(row.text)+'</p>':'')+(row.fetchedAt?'<p>取得时间：'+esc(row.fetchedAt)+'</p>':'')
 }).join('')+'</aside>'
 return {data:data.type==='table'?{...data,type:'market',variant:'table',asOf:data.asOf??'静态快照 · 来源信息见底栏'}:data,metadata:{...(source===undefined?{}:{source}),...(sources===undefined?{}:{sources})},html}
}

export function appendProvenance(spec,html){
 if(!html||spec?.type!=='html')return spec
 return {...spec,html:spec.html.replace(/<\/body\s*>/iu,html+'$&')}
}
