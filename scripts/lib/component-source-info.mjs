// Source details are inert saved content. Never execute a generated document to
// discover provenance, and never guess a file path or a network provider.
export function componentRecordedProvenance(node){
 const html=node?.containerSpec?.html
 const raw=typeof html==='string'&&html.match(/<script id="sherlock-observed-provenance" type="application\/json">([^<]*)<\/script>/)?.[1]
 if(!raw||raw.length>256000)return []
 try{const rows=JSON.parse(raw);return Array.isArray(rows)&&rows.length<=128?rows.filter(row=>row&&typeof row==='object'&&!Array.isArray(row)):[]}catch{return []}
}
export function getComponentSourceInfo(node){
 const spec=node?.containerSpec||{},records=[],notes=[],seen=new Set();let data=spec
 if(typeof spec.html==='string'){
  const raw=spec.html.match(/<script id="sherlock-template-data" type="application\/json">([^<]*)<\/script>/)?.[1]
  if(raw){try{data=JSON.parse(raw).data||spec}catch{}}
 }
 const add=value=>{
  if(!value)return
  const row=typeof value==='string'?{label:value}:value
  if(typeof row!=='object')return
  const label=[row.label,row.name,row.title,row.provider].find(v=>typeof v==='string'&&v.trim())?.trim()||''
  let url='';try{const u=new URL(row.url||row.sourceUrl||(/^https?:\/\//i.test(label)?label:''));if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)url=u.href}catch{}
  const explicit=typeof row.path==='string'?row.path:typeof row.filePath==='string'?row.filePath:''
  const fileLabel=label.replace(/^(?:(?:来源文件|参考文件|整理文档|来源文档|文档|文件|附件)\s*[:：]\s*)+/u,'')
  const filename=fileLabel.match(/(?:^|[：:\s])([^/\\\n]+\.(?:pdf|docx?|pptx?|xlsx?|csv|txt|md|html?))(?=$|[\s·（(])/i)?.[1]?.trim()||(/^[^/\\\n]+\.(?:pdf|docx?|pptx?|xlsx?|csv|txt|md|html?)$/i.test(fileLabel)?fileLabel:'')
  const path=explicit&&!explicit.includes('\0')?explicit:''
  const text=typeof row.text==='string'?row.text:''
  const key=JSON.stringify([label,url,path,text]);if(seen.has(key)||!label&&!url&&!path&&!text)return;seen.add(key)
  records.push({label:label||url||path.split(/[\\/]/).pop()||'来源',url,path,filename:path?path.split(/[\\/]/).pop():filename,text})
 }
 for(const row of Array.isArray(data.sources)?data.sources:[])add(row)
 add(data.source)
 for(const row of node?.generationSources||[])add(row)
 for(const row of componentRecordedProvenance(node))add(row)
 // Feeds and articles retain every recorded original URL, not just a hostname.
 for(const row of [...(Array.isArray(data.feeds)?data.feeds:[]),...(Array.isArray(data.items)?data.items:[])]){
  if(row.url)add({label:row.title||row.source?.name||row.source||row.url,url:row.url})
 }
 if(typeof data.note==='string'&&data.note.trim())notes.push(data.note)
 if(typeof spec.html==='string'&&typeof DOMParser!=='undefined'){
  const doc=new DOMParser().parseFromString(spec.html,'text/html')
  for(const el of doc.querySelectorAll('[data-component-source-info],.market-footer,.indicator-method,.trend-provenance,.chart-source,.source-info,.src,footer')){
   // An attribute value is metadata, not a request to collect/hide its owner.
   // The owner can be the entire graph, table, or interactive application.
   const annotation=el.getAttribute('data-component-source-info')?.trim()
   const business=el.querySelector('table,svg,canvas,button,input,select,textarea,[data-sherlock-structure],[data-node-id]')
   if(!annotation&&business&&el.matches('[data-component-source-info],.source-info,.chart-source'))continue
   const text=annotation||el.textContent?.trim();if(el.matches('.src,footer')&&!annotation&&!/^(?:来源|资料来源|数据来源|参考来源|口径|Sources?\s*[:：])/iu.test(text||''))continue;const modeled=data!==spec&&el.matches('.market-footer,.indicator-method');if(text&&!modeled&&!notes.includes(text))notes.push(text)
   if(annotation)continue
   for(const a of el.querySelectorAll('a[href]'))add({label:a.textContent,url:a.getAttribute('href')})
  }
 }
 return {records,notes,asOf:typeof data.asOf==='string'?data.asOf:'',range:typeof data.range==='string'?data.range:''}
}
export function openComponentSource(sessionId,node,mode,trigger,info=getComponentSourceInfo(node)){
 const owner=trigger?.closest?.('[data-research-node-id]')
 if(!owner||owner.dataset.researchNodeId!==node.id||!['details','files'].includes(mode))return false
 window.dispatchEvent(new CustomEvent('sherlock:component-source-open',{detail:{sessionId,nodeId:node.id,title:node.title||node.containerSpec?.title||'组件',mode,info,owner,trigger}}));return true
}
export function ComponentSourceDetailsTab({tab,scope,coordinator}){
 const {jsx,jsxs}=react_jsx_runtime,info=tab.meta.sourceInfo||{records:[],notes:[]},sessionId=scope.sessionId
 const [error,setError]=react.useState('');const open=e=>{e.preventDefault();const url=e.currentTarget.href;setError('');Promise.resolve().then(()=>{if(!window.dshDesktop?.conversationBrowser?.openSource)throw Error('浏览器暂不可用');return window.dshDesktop.conversationBrowser.openSource({sessionId,url})}).catch(e=>setError(e.message||'来源网页暂时无法打开'))}
 return jsxs('section',{className:'ew-component-source-details','aria-label':'查看来源信息',children:[
  jsx('h3',{children:tab.meta.componentTitle}),error&&jsx('p',{role:'alert',children:error}),
  (info.asOf||info.range)&&jsxs('dl',{children:[info.asOf&&jsxs(react.Fragment,{children:[jsx('dt',{children:'数据时点'}),jsx('dd',{children:info.asOf})]}),info.range&&jsxs(react.Fragment,{children:[jsx('dt',{children:'数据范围'}),jsx('dd',{children:info.range})]})]}),
  !info.records.length&&!info.notes.length&&jsx('p',{children:'此组件尚未记录来源信息。'}),
  info.records.map((row,i)=>jsxs('section',{children:[jsx('h4',{children:row.label}),row.url&&jsx('a',{href:row.url,onClick:open,children:row.url}),row.text&&jsx('pre',{children:row.text})]},String(i))),
  info.notes.map((text,i)=>jsx('pre',{children:text},'note:'+i))
 ]})
}
export function componentSourceReferencedFiles(snapshot,filename,parsePrompt){
 const paths=new Set(),nodes=snapshot?.chat?.nodes
 if(!nodes?.values)return []
 const add=path=>{if(typeof path==='string'&&!path.includes('\0')&&path.split(/[\\/]/).pop()===filename)paths.add(path)}
 for(const node of nodes.values()){
  if(!['user','steering'].includes(node?.kind)||node.data?.source?.kind!=='user')continue
  for(const part of Array.isArray(node.data.content)?node.data.content:[]){
   if(part.type!=='text'||typeof part.text!=='string')continue
   if(parsePrompt){for(const file of parsePrompt(part.text)?.files||[])add(file.path)}
   for(const match of part.text.matchAll(/📎\s*文件：`((?:\\`|[^`])+)`/g))add(match[1].replace(/\\`/g,'`'))
  }
 }
 return [...paths]
}
export function ComponentSourceFilesPopup({target,coordinator,onClose}){
 const {jsx,jsxs}=react_jsx_runtime,[state,setState]=react.useState({loading:true,paths:[],missing:[],error:''}),close=react.useRef(null)
 const sessionId=target.sessionId,cwd=coordinator.sessions.list.getSnapshot().byId[sessionId]?.cwd
 react.useEffect(()=>{
  const request=new AbortController(),previous=target.trigger;setState({loading:true,paths:[],missing:[],error:''});close.current?.focus()
  void (async()=>{
   const paths=new Set(),missing=[]
   for(const row of target.info.records){
    if(!row.filename&&!row.path)continue
    if(row.path){paths.add(row.path);continue}
    const references=componentSourceReferencedFiles(coordinator.sessions.binding?.(sessionId)?.session.getSnapshot(),row.filename,typeof parseResearchPrompt==='function'?parseResearchPrompt:null)
    if(references.length){for(const path of references)paths.add(path);continue}
    const response=await fetch('/sidebar/api/fs.search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,cwd,query:row.filename}),signal:request.signal}),payload=await response.json()
    if(!response.ok||!payload.ok)throw Error(payload.error?.message||'无法查找来源文件')
    const matches=payload.value.matches.filter(path=>path.split(/[\\/]/).pop()===row.filename)
    for(const path of matches)paths.add(path)
    if(!matches.length||payload.value.truncated)missing.push(row.filename+(payload.value.truncated?'（搜索未完整返回，请核对文件）':'（当前工作目录中未找到）'))
   }
   if(!request.signal.aborted)setState({loading:false,paths:[...paths],missing,error:''})
  })().catch(e=>{if(!request.signal.aborted)setState({loading:false,paths:[],missing:[],error:e.message})})
  return()=>{request.abort();if(previous?.isConnected)previous.focus?.({preventScroll:true})}
 },[target])
 const openFile=path=>{coordinator.service.openFile({sessionId,cwd},path);coordinator.service.setPanelState({open:true},{sessionId});onClose()}
 return react_dom.createPortal(jsx('div',{className:'odyssey-data-backdrop',onPointerDown:e=>e.stopPropagation(),onClick:e=>{e.stopPropagation();if(e.target===e.currentTarget)onClose()},children:jsxs('section',{className:'odyssey-data-settings ew-component-source-files',role:'dialog','aria-modal':true,'aria-label':'来源文件',onKeyDown:e=>{e.stopPropagation();if(e.key==='Escape')onClose();if(e.key==='Tab'){const all=[...e.currentTarget.querySelectorAll('button:not(:disabled),[tabindex="0"]')],first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}},children:[
  jsxs('header',{children:[jsx('h3',{children:'来源文件'}),jsx('button',{ref:close,type:'button',className:'odyssey-data-close','aria-label':'关闭来源文件',onClick:onClose,children:'×'})]}),
  state.loading&&jsx('p',{role:'status',children:'正在定位来源文件…'}),state.error&&jsx('p',{role:'alert',children:state.error}),
  jsx('div',{className:'ew-delivery',children:state.paths.map(path=>jsx(DeliveryFileCard,{path,sessionId,openFile,openSystemFile:coordinator.sourceWorkspaces?path=>coordinator.sourceWorkspaces.openPath(path):undefined,canOpenSystem:!!coordinator.sourceWorkspaces,localFiles:true},path))}),
  state.missing.map(text=>jsx('p',{role:'status',children:text},text))
 ]})}),document.body)
}
export function ComponentSourceHost({coordinator}){
 const [target,setTarget]=react.useState(null)
 const active=react.useSyncExternalStore(fn=>coordinator.sessions.list.subscribe?.(fn)||(()=>{}),()=>coordinator.sessions.list.getSnapshot().current)
 react.useEffect(()=>{if(target&&target.sessionId!==active)setTarget(null)},[active,target])
 react.useEffect(()=>{
  const open=event=>{
   const d=event.detail;if(!d||coordinator.sessions.list.getSnapshot().current!==d.sessionId||!d.owner?.isConnected||d.owner.dataset.researchNodeId!==d.nodeId||!d.owner.contains(d.trigger))return
   if(d.mode==='files')setTarget(d)
   else{const scope={sessionId:d.sessionId};coordinator.service.openTab({id:'component-source:'+d.sessionId+':'+d.nodeId,type:'sherlock-component-sources',title:'来源信息',meta:{sherlockPanel:'right',sourceInfo:d.info,componentTitle:d.title}},scope);coordinator.service.setPanelState({open:true},scope)}
  }
  window.addEventListener('sherlock:component-source-open',open);return()=>window.removeEventListener('sherlock:component-source-open',open)
 },[coordinator])
 return target?react_jsx_runtime.jsx(ComponentSourceFilesPopup,{target,coordinator,onClose:()=>setTarget(null)}):null
}
export const componentSourceCss=`
[data-research-node-id]:has(.odyssey-data-stamp .ew-source-actions) [data-sherlock-market-native="table"]>.terminal-native-context{display:none!important}
.odyssey-data-stamp .ew-source-actions{display:flex;align-items:center;gap:8px;flex:none}
.odyssey-data-stamp button{border:0;background:transparent;color:inherit;font:inherit;padding:0;cursor:pointer;line-height:16px;text-align:left}
.odyssey-data-stamp .ew-source-file{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.odyssey-data-stamp .ew-source-actions button{white-space:nowrap}.odyssey-data-stamp button:hover{text-decoration:underline}
.ew-component-source-details{padding:20px;color:var(--dsw-alias-label-primary);font:13px/1.65 var(--odyssey-font-ui,system-ui);overflow:auto;height:100%;box-sizing:border-box}
.ew-component-source-details h3{margin:0 0 16px;font-size:15px}.ew-component-source-details h4{font-size:13px;margin:16px 0 6px}.ew-component-source-details pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 18px}.ew-component-source-details a{color:var(--grid-accent,#168fff);overflow-wrap:anywhere}.ew-component-source-details dl{display:grid;grid-template-columns:auto 1fr;gap:8px}.ew-component-source-details dd{margin:0}
.ew-component-source-files .ew-delivery-open{background:transparent;border:0;padding:0;font:inherit;color:inherit}.ew-component-source-files .ew-delivery-options{padding:3px 7px;font:400 11px/20px var(--odyssey-font-ui,system-ui);background:var(--dsw-alias-bg-base,#fff)}.ew-component-source-files .ew-delivery-menu button{display:block;width:100%;padding:7px 10px;border:0;border-radius:6px;background:transparent;color:inherit;text-align:left;font:400 13px/20px var(--odyssey-font-ui,system-ui)}
.ew-component-source-files .ew-delivery-card:hover{background:var(--dsw-alias-interactive-bg-hover,#f2f3f5)}.ew-component-source-files .ew-delivery-card .ew-delivery-open:hover{background:transparent}.ew-component-source-files .ew-delivery-card:hover .ew-delivery-options{background:transparent}
.ew-component-source-files{overflow:visible;max-width:600px}.ew-component-source-files .ew-delivery{max-height:60vh;overflow:auto}.ew-component-source-files{background:var(--dsw-alias-bg-base,#242424);color:var(--dsw-alias-label-primary,#eee)}
`
export function componentSourceDefinitions(){return [componentRecordedProvenance,getComponentSourceInfo,openComponentSource,ComponentSourceDetailsTab,componentSourceReferencedFiles,ComponentSourceFilesPopup,ComponentSourceHost].map(fn=>fn.toString()).join('\n')}
export function patchComponentSourceHost(source){
 const marker='/* EWORK_COMPONENT_SOURCE_HOST */'
 if(source.includes(marker))return source.replace('children:[react_jsx_runtime.jsx(ComponentSourceHost,{coordinator:researchSidebar})','children:[!subagentPanel&&react_jsx_runtime.jsx(ComponentSourceHost,{coordinator:researchSidebar})')
 const exact=(a,b)=>{if(source.split(a).length!==2)throw Error('Component source host anchor missing: '+a);source=source.replace(a,b)}
 exact('attach(service, t, sessions) {','attach(service, t, sessions, sourceWorkspaces) { this.sourceWorkspaces=sourceWorkspaces;')
 exact('researchSidebar.attach(sidebarCtx.betterSidebar, t, sessions)','researchSidebar.attach(sidebarCtx.betterSidebar, t, sessions, ctx.get("workspaces"))')
 exact("const unregisterGenerated=service.registerTab(",marker+"\nconst unregisterSources=service.registerTab({id:'sherlock-component-sources',title:()=> '来源信息',hidden:true,single:false,component:props=>react_jsx_runtime.jsx(ComponentSourceDetailsTab,{...props,coordinator})});\nconst unregisterGenerated=service.registerTab(")
 exact('notesChallengeSidebar.dispose();unregisterGenerated?.();','unregisterSources?.();notesChallengeSidebar.dispose();unregisterGenerated?.();')
 exact('react_jsx_runtime.jsx(OdysseySubagentPortals,{snapshot:researchSidebarSnapshot,renderSlot,renderSlotChain})','react_jsx_runtime.jsxs(react.Fragment,{children:[!subagentPanel&&react_jsx_runtime.jsx(ComponentSourceHost,{coordinator:researchSidebar}),react_jsx_runtime.jsx(OdysseySubagentPortals,{snapshot:researchSidebarSnapshot,renderSlot,renderSlotChain})]})')
 return source
}
