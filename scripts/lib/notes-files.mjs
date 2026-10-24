export function createNoteFileViewStore(doc){
 const entries=new Map(),listeners=new Set();let snapshot=[]
 const notify=()=>{snapshot=[...entries.values()];for(const listener of listeners)listener()}
 const update=event=>{const value=event.detail;if(typeof value?.instanceId!=='string')return
  if(value.remove){entries.delete(value.instanceId);notify();return}
  const host=doc.getElementById(value.hostId),header=doc.getElementById(value.headerId)
  if(!host?.matches('.en-file-host')||host.dataset.noteFile!==value.node?.id||host.dataset.noteSession!==value.sessionId||!host.closest('.en-root')||!header?.closest('.en-note-file')?.contains(host)||typeof value.node.authorizationId!=='string')return
  entries.set(value.instanceId,{...value,host,header});notify()
 }
 const reset=()=>{entries.clear();notify()}
 doc?.addEventListener('sherlock:notes-file-view',update);doc?.addEventListener('sherlock:notes-reset',reset)
 return {snapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},dispose:()=>{doc?.removeEventListener('sherlock:notes-file-view',update);doc?.removeEventListener('sherlock:notes-reset',reset);reset()}}
}
/** Reuse the authorized research reader; inline documents omit the workbench chrome. */
export function EWorkNoteFileView({entry,officePreview}){
 const inline=entry.inline===true&&!/\.pptx$/i.test(entry.node.name)
 const pptx=useComponentPptxMode(entry.host)
 const [pdfStatus,setPdfStatus]=react.useState(null),[inlineState,setInlineState]=react.useState('loading'),[editing,setEditing]=react.useState(false),[name,setName]=react.useState(entry.node.displayName||entry.node.name),[refresh,setRefresh]=react.useState(0),[menu,setMenu]=react.useState(null),menuRef=react.useRef(null),input=react.useRef(null)
 const action=(action,value={})=>document.dispatchEvent(new CustomEvent('sherlock:notes-file-action',{detail:{instanceId:entry.instanceId,sessionId:entry.sessionId,action,...value}}))
 react.useLayoutEffect(()=>{
  entry.host.dataset.noteFileRendered='true';entry.header.dataset.noteFileRendered='true'
  return()=>{delete entry.host.dataset.noteFileRendered;delete entry.header.dataset.noteFileRendered}
 },[entry.host,entry.header])
 react.useLayoutEffect(()=>{
  if(!inline)return
  const update=()=>{
   const failed=entry.host.querySelector('[data-research-preview-unavailable],[data-research-pdf-error],[data-sherlock-office-preview-unavailable],[role=alert]'),loading=entry.host.querySelector('[data-research-preview-loading],[data-research-offscreen-placeholder]'),ready=entry.host.querySelector('[data-research-preview-interactive],iframe,canvas')
   const state=failed?'failed':loading||!ready?'loading':'ready'
   if(entry.host.dataset.noteInlineState!==state)entry.host.dataset.noteInlineState=state
   setInlineState(state)
  }
  update();const observer=new MutationObserver(update);observer.observe(entry.host,{childList:true,subtree:true,attributes:true,attributeFilter:['data-research-preview-loading','data-research-preview-interactive','data-research-preview-unavailable','data-research-pdf-error','data-sherlock-office-preview-unavailable','role']})
  return()=>{observer.disconnect();delete entry.host.dataset.noteInlineState}
 },[entry.host,inline,refresh])
 react.useEffect(()=>{
  if(!menu)return
  const outside=e=>{if(!menuRef.current?.contains(e.target))setMenu(null)},key=e=>{if(e.key==='Escape')setMenu(null)}
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key)
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key)}
 },[menu])
 react.useLayoutEffect(()=>{if(editing){input.current?.focus();input.current?.select()}},[editing])
 const commit=()=>{setEditing(false);action('rename',{name})}
 const header=inline?react.createElement('div',{className:'en-inline-document-caption'},react.createElement('button',{type:'button',title:'在访达中显示',onClick:()=>action('reveal')},react.createElement(WorkbenchIcon,{name:'file'}),react.createElement('span',null,entry.node.displayName||entry.node.name)),pdfStatus?.total>0?react.createElement('span',{className:'en-file-page-count','aria-label':'PDF 页码'},pdfStatus.page+' / '+pdfStatus.total):null,inlineState==='failed'?react.createElement('button',{type:'button',className:'en-inline-file-retry',onClick:()=>setRefresh(value=>value+1)},'重试'):null):editing?react.createElement('form',{className:'en-file-rename',onSubmit:e=>{e.preventDefault();commit()}},react.createElement('input',{ref:input,value:name,maxLength:512,'aria-label':'文件组件名称',onChange:e=>setName(e.target.value),onBlur:commit,onKeyDown:e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();setEditing(false)}}})):react.createElement(WorkbenchChrome,{node:{...entry.node,noteDocument:true},sessionId:entry.sessionId,readOnly:entry.readOnly,onAsk:/\.pptx$/i.test(entry.node.name)?()=>action('reference'):undefined,titleExtra:pdfStatus?.total>0?react.createElement('span',{className:'en-file-page-count','aria-label':'PDF 页码'},pdfStatus.page+' / '+pdfStatus.total):null,
  onReload:async()=>{setRefresh(value=>value+1);return {message:'已请求重新载入原文件预览'}},
  onMore:(_node,e)=>{const box=e.currentTarget.getBoundingClientRect();setMenu({left:Math.max(8,Math.min(box.right-206,window.innerWidth-214)),top:Math.max(8,Math.min(box.bottom+5,window.innerHeight-118))})},onRemove:()=>action('remove')})
 const item=(label,icon,click,disabled=false)=>react.createElement('button',{type:'button',role:'menuitem',disabled,onClick:()=>{setMenu(null);click()}},react.createElement(WorkbenchIcon,{name:icon}),label)
 return react.createElement(react.Fragment,null,
  react_dom.createPortal(header,entry.header),
  react_dom.createPortal(react.createElement('div',{className:'en-file-native-reader',key:refresh},react.createElement(ResearchAttachmentLocalPreview,{item:entry.node,nodeId:entry.node.id,sessionId:entry.node.previewSessionId,visible:true,officePreview,noteDocument:true,readOnly:entry.readOnly,onPageStatus:setPdfStatus})),entry.host,entry.instanceId),
  menu&&react_dom.createPortal(react.createElement('div',{ref:menuRef,role:'menu','aria-label':'文件组件操作','data-note-file-menu':entry.header.id,className:'en-file-menu','data-dark':entry.dark,style:menu},!entry.readOnly&&pptx?.editable&&item(pptx.mode==='edit'?'关闭编辑模式':'编辑','edit',()=>pptx.toggleMode(),pptx.modeBusy),item('修改名称','rename',()=>{setName(entry.node.displayName||entry.node.name);setEditing(true)},entry.readOnly),item('在访达中显示','folder',()=>action('reveal')),item('移除文件','remove',()=>action('remove'),entry.readOnly)),document.body)
 )
}
export function EWorkNoteFileViews({sessionId,active}){
 const entries=react.useSyncExternalStore(eworkNoteFileViews.subscribe,eworkNoteFileViews.snapshot),officePreview=react.useSyncExternalStore(eworkNoteOfficePreview.subscribe,eworkNoteOfficePreview.getSnapshot)
 react.useEffect(()=>{if(active)document.dispatchEvent(new CustomEvent('sherlock:notes-files-sync-request',{detail:{sessionId}}))},[sessionId,active])
 return active?react.createElement(react.Fragment,null,entries.filter(entry=>entry.sessionId===sessionId&&entry.host.isConnected).map(entry=>react.createElement(EWorkNoteFileView,{key:entry.instanceId,entry,officePreview}))):null
}
export function noteFileClientHelpers(){return [createNoteFileViewStore,EWorkNoteFileView,EWorkNoteFileViews].map(fn=>fn.toString()).join('\n')+"\nconst eworkNoteFileViews=createNoteFileViewStore(typeof document==='undefined'?undefined:document);const eworkNoteOfficePreview=new ResearchOfficePreviewCoordinator();\n"}
export function patchNotesFiles(source){
 if(!source.includes('/* ework:notes-native-files:v1 */')){
  const portal='composerPortal, researchConversationPortal,',office='officeCtx.effect(() => researchOfficePreview.attach(officeCtx.officePreview),'
  if(source.split(portal).length!==2||source.split(office).length!==2)throw Error('无法定位笔记原生文件预览。')
  source=source.replace(portal,"/* ework:notes-native-files:v1 */ react.createElement(EWorkNoteFileViews,{sessionId,active:activeView==='notes'}), "+portal)
  source=source.replace(office,'officeCtx.effect(() => {const original=researchOfficePreview.attach(officeCtx.officePreview),notes=eworkNoteOfficePreview.attach(officeCtx.officePreview);return()=>{original();notes()}},')
 }
 return source
}
