export function createNoteFileViewStore(doc){
 const entries=new Map(),listeners=new Set();let snapshot=[]
 const notify=()=>{snapshot=[...entries.values()];for(const listener of listeners)listener()}
 const update=event=>{const value=event.detail;if(typeof value?.instanceId!=='string')return
  if(value.remove){entries.delete(value.instanceId);notify();return}
  const host=doc.getElementById(value.hostId)
  if(!host?.matches('.en-file-host')||host.dataset.noteFile!==value.node?.id||host.dataset.noteSession!==value.sessionId||!host.closest('.en-root')||typeof value.node.authorizationId!=='string')return
  entries.set(value.instanceId,{...value,host});notify()
 }
 const reset=()=>{entries.clear();notify()}
 doc?.addEventListener('sherlock:notes-file-view',update);doc?.addEventListener('sherlock:notes-reset',reset)
 return {snapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},dispose:()=>{doc?.removeEventListener('sherlock:notes-file-view',update);doc?.removeEventListener('sherlock:notes-reset',reset);reset()}}
}
export function EWorkNoteFileView({entry,officePreview}){
 const [editing,setEditing]=react.useState(false),[width,setWidth]=react.useState(()=>entry.host.clientWidth||640)
 const action=(name,value={})=>document.dispatchEvent(new CustomEvent('sherlock:notes-file-action',{detail:{instanceId:entry.instanceId,sessionId:entry.sessionId,action:name,...value}}))
 react.useLayoutEffect(()=>{
  entry.host.dataset.noteFileRendered='true'
  const measure=()=>setWidth(entry.host.clientWidth||640),observer=new ResizeObserver(measure);observer.observe(entry.host);measure()
  return()=>{observer.disconnect();delete entry.host.dataset.noteFileRendered}
 },[entry.host])
 return react_dom.createPortal(react.createElement(ResearchCanvasFileCard,{sessionId:entry.node.previewSessionId,node:{...entry.node,x:0,y:0,width,height:entry.node.height||520,noteDocument:true},visible:true,officePreview,editing,
  onRenameCommit:name=>{setEditing(false);action('rename',{name})},onRenameCancel:()=>setEditing(false),
  onNaturalSize:(_id,size)=>{if(size?.height)action('size',{height:size.height})},
  onFrameAction:name=>{if(name==='rename')setEditing(true);else if(name==='remove')action('remove')}
 }),entry.host,entry.instanceId)
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
