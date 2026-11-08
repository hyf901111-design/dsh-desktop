// Persist observed component retrievals and cited document provenance. This survives custom HTML
// without asking the model to copy paths or invent a source label.
export function retainObservedComponentProvenance(output,documents=[],records=[]){
 let spec;try{spec=JSON.parse(output)}catch{return output}
 if(spec?.type!=='html'||typeof spec.html!=='string')return output
 const sources=[],seen=new Set(),text=spec.html
 const add=row=>{const key=JSON.stringify(row);if(!seen.has(key)){seen.add(key);sources.push(row)}}
 for(const doc of documents){
  const cited=doc.blocks?.some(block=>new RegExp('(?<![\\p{L}\\p{N}_])'+block.id+'(?!\\d)','u').test(text))||doc.pages?.some(page=>new RegExp('第\\s*'+page.page+'\\s*页').test(text))
  if(typeof doc.name==='string'&&(text.includes(doc.name)||cited))add({label:doc.name})
 }
 for(const record of records){
  if(record.purpose==='discovery')continue
  if(!(record.response&&typeof record.response==='object'&&!record.response.error||record.snapshotRows?.length))continue
  const raw=record.response?.sourceUrl??(record.tool==='web_fetch'?record.args?.url:undefined)
  if(typeof raw!=='string')continue
  try{const url=new URL(raw);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||[...url.searchParams.keys()].some(key=>/token|secret|credential|auth|signature|api[_-]?key/iu.test(key)))continue;add({label:url.hostname,url:url.href})}catch{}
 }
 if(!sources.length)return output
 const encoded=JSON.stringify(sources).replace(/</g,'\\u003c')
 const metadata=`<script id="sherlock-observed-provenance" type="application/json">${encoded}</script>`
 const html=text.replace(/<script id="sherlock-observed-provenance" type="application\/json">[\s\S]*?<\/script>/gu,'')
 return JSON.stringify({...spec,html:html.includes('</body>')?html.replace('</body>',metadata+'</body>'):html+metadata})
}
