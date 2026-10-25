import {attachPptxDirectEditor} from './pptx-direct-editor.mjs'
import {attachPptxAnnotationViewer,pptxAnnotationSource} from './pptx-annotation-viewer.mjs'
import {pptxAnnotationAssets,pptxAnnotationStyle} from './pptx-annotation-assets.mjs'
/** Keep the live slide tree and its media until its replacement is ready. */
export function createStablePptxViewer(initial,initialBytes){
 if(!initial.container?.parentElement||!initial.viewerOptions||typeof initial.constructor!=='function')return initial
 let active=initial,disposeActive=initial.destroy.bind(initial),disposed=false,revision=0,activeBytes=initialBytes,versionJob=null
 const pending=new Set()
 const destroy=()=>{if(disposed)return;disposed=true;revision++;activeBytes=null;versionJob=null;for(const job of pending){job.abort.abort();job.dispose();job.mount.remove()}pending.clear();disposeActive();if(active!==initial)active.container.remove()}
 initial.destroy=destroy
 return{
  get currentSlideIndex(){return active.currentSlideIndex},
  get listOptions(){return active.listOptions},
  get viewerOptions(){return active.viewerOptions},
  get zoomPercent(){return active.zoomPercent},
  goToSlide:(...args)=>active.goToSlide?.(...args),
  setZoom:(...args)=>active.setZoom?.(...args),
  async getFileVersion(){
   const bytes=activeBytes,viewer=active;if(!bytes)return null
   if(versionJob?.bytes!==bytes){const crypto=viewer.container.ownerDocument.defaultView.crypto;versionJob={bytes,promise:crypto.subtle.digest('SHA-256',bytes).then(result=>Array.from(new Uint8Array(result),value=>value.toString(16).padStart(2,'0')).join(''))}}
   const version=await versionJob.promise;return!disposed&&viewer===active&&bytes===activeBytes?version:null
  },
  destroy,
  async open(bytes,options={},canCommit=()=>true){
   if(disposed)return false
   const expected=++revision,previous=active,mount=previous.container,parent=mount.parentElement
   if(!parent)return false
   const scroll=previous.viewerOptions.scrollContainer
   const stage=mount.cloneNode(false),shell=parent.ownerDocument.createElement('div'),position=parent.style.position,needsPosition=parent.ownerDocument.defaultView.getComputedStyle(parent).position==='static'
   if(needsPosition)parent.style.position='relative'
   // The renderer changes its container to position:relative. Keep a separate
   // shell out of flow so neither parsing nor list layout affects live scrolling.
   shell.dataset.pptxStaging='';shell.setAttribute('aria-hidden','true');shell.inert=true
   Object.assign(shell.style,{position:'absolute',left:mount.offsetLeft+'px',top:mount.offsetTop+'px',width:mount.clientWidth?mount.clientWidth+'px':'100%',visibility:'hidden',pointerEvents:'none'})
   shell.appendChild(stage);parent.appendChild(shell)
   const abort=new AbortController(),next=new previous.constructor(stage,{...previous.viewerOptions,zoomPercent:previous.zoomPercent}),job={abort,mount:shell,dispose:next.destroy.bind(next)}
   pending.add(job);let committed=false
   try{
    await next.open(bytes,{...options,signal:abort.signal})
    if(disposed||expected!==revision||!canCommit())return false
    const viewport=()=>({top:scroll?.scrollTop,left:scroll?.scrollLeft,index:previous.currentSlideIndex,slides:Array.from(mount.querySelectorAll('[data-slide-index]')).filter(item=>item.firstElementChild?.dataset.mounted==='1').map(item=>Number(item.dataset.slideIndex))})
    // Navigation may continue while parsing or media decoding. Prepare its latest window.
    while(true){
     const visible=viewport(),indices=new Set([...visible.slides,visible.index])
     for(const index of indices)next.ensureListSlideMountedFn?.(index)
     await Promise.all(Array.from(indices,index=>next.slideHandles?.get(index)?.ready))
     await Promise.all(Array.from(stage.querySelectorAll('img'),img=>img.decode?.().catch(()=>{})))
     if(disposed||expected!==revision||!canCommit())return false
     if(JSON.stringify(visible)!==JSON.stringify(viewport()))continue
     stage.style.cssText=mount.style.cssText;next.currentSlide=visible.index
     // No asynchronous work occurs between removal of the old tree and its replacement.
     mount.replaceWith(stage);const disposePrevious=disposeActive;active=next;activeBytes=bytes;versionJob=null;disposeActive=job.dispose;committed=true;disposePrevious()
     if(scroll){scroll.scrollTop=visible.top;scroll.scrollLeft=visible.left}
     return true
    }
   }finally{
    pending.delete(job);if(!committed)job.dispose();shell.remove()
    if(needsPosition&&parent.style.position==='relative')parent.style.position=position
   }
  }
 }
}
/** Self-contained factory embedded in the pinned Office client bundle. */
export function createPptxEditorComponent(React,Preview,download,createPortal,annotationAssets=pptxAnnotationAssets,annotationStyle=pptxAnnotationStyle){
 const h=React.createElement,drafts=new Map(),shortcutOwnerKey=Symbol.for('sherlock:pptx-shortcut-owner'),clone=value=>JSON.parse(JSON.stringify(value))
 // Invalidation of already-authorized readers only; never an edit authority.
 const refreshIdentity=value=>{
  if(!value||typeof value.path!=='string'||!value.path||typeof value.sessionId!=='string')return null
  let path=value.path.replace(/\\/g,'/'),cwd=typeof value.cwd==='string'?value.cwd.replace(/\\/g,'/'):''
  const absolute=value=>value.startsWith('/')||/^[A-Za-z]:\//.test(value)
  if(!absolute(path)&&absolute(cwd))path=cwd+'/'+path
  const rooted=absolute(path),prefix=path.startsWith('/')?'/':/^[A-Za-z]:\//.test(path)?path.slice(0,3):'',parts=[]
  for(const part of path.slice(prefix.length).split('/')){if(!part||part==='.')continue;if(part==='..'&&parts.length&&parts[parts.length-1]!=='..')parts.pop();else if(part!=='..'||!rooted)parts.push(part)}
  path=prefix+parts.join('/');return JSON.stringify(rooted?{path}:{sessionId:value.sessionId,path})
 }
 const fields=entry=>entry.document.slides.flatMap(s=>s.fields)
 const dirty=entry=>JSON.stringify(snapshot(entry))!==JSON.stringify(entry.savedState||{values:Object.fromEntries(fields(entry).map(f=>[f.id,f.text])),objects:{}})
 const emit=(entry,redraw=false)=>entry.listeners.forEach(fn=>fn(redraw))
 const snapshot=entry=>({values:{...entry.values},objects:clone(entry.objects)})
 const persist=entry=>{try{const key='sherlock:pptx-draft:'+entry.document.id;if(dirty(entry))entry.environment.window.sessionStorage.setItem(key,JSON.stringify({document:entry.document,savedState:entry.savedState,textStyles:entry.textStyles,formatTouched:entry.formatTouched,...snapshot(entry)}));else entry.environment.window.sessionStorage.removeItem(key)}catch{entry.error='无法保留本地编辑稿，请保存文件后再关闭。'}}
 const request=(entry,source)=>({...(entry.document.editToken?{editToken:entry.document.editToken}:source),version:entry.document.version,...(entry.document.basisToken?{basisToken:entry.document.basisToken}:{}),edits:fields(entry).filter(f=>entry.values[f.id]!==f.text).map(f=>({id:f.id,text:entry.values[f.id]})),objects:Object.entries(entry.objects).map(([id,change])=>({id,...change}))})
 const commit=current=>{if(!current?.pending)return;if(JSON.stringify(current.pending)!==JSON.stringify(snapshot(current))){current.undo.push(current.pending);if(current.undo.length>100)current.undo.shift();current.redo=[]}current.pending=null}
 const scheduleAuto=(current,target,delay=300)=>{if(!current||current.discarded)return;if(target?.canWrite?.()===false)return;current.autoTarget=target;clearTimeout(current.autoTimer);if(dirty(current))current.autoTimer=setTimeout(()=>{current.autoTimer=null;void saveEntry(current,current.autoTarget)},delay)}
 const saveEntry=async(current,target)=>{
  clearTimeout(current?.autoTimer);if(!current||current.discarded||!target||target.canWrite?.()===false||current.saving||current.composing||current.gesture||!dirty(current))return
  commit(current);const savedState=snapshot(current),input=request(current,target.source);current.saving=true;current.status='saving';current.error='';emit(current)
  try{const result=await target.bridge.save(input);if(!result.ok)throw Error(result.error);current.document=result.document;current.savedState=savedState;current.status='saved';persist(current);current.environment.document.dispatchEvent(new current.environment.window.CustomEvent('sherlock:pptx-saved',{detail:{id:current.document.id,origin:target.origin,source:{...target.source},refreshSource:target.refreshSource}}))}
  catch(failure){current.status='failed';current.error=failure.message||'自动保存失败，修改稿已保留。'}
  finally{current.saving=false;emit(current);if(!current.discarded&&dirty(current)&&current.status!=='failed')scheduleAuto(current,current.autoTarget||target)}
 }
 return function PptxView(props){
  const {scope,path,toolbar,onToolbarState,onToolbarControls}=props,root=React.useRef(null),previewHost=React.useRef(null),entryRef=React.useRef(null),viewerRef=React.useRef(null),viewerSourceKeyRef=React.useRef(null),controller=React.useRef(null),generation=React.useRef(0),opening=React.useRef(null),token=React.useRef(null),pageRef=React.useRef(0),selectionRef=React.useRef(null),zoomRef=React.useRef(100),draftGeneration=React.useRef(0),renderTimer=React.useRef(null),renderJob=React.useRef(null),pendingRender=React.useRef(false),gestureRef=React.useRef(false),floatingToolbar=React.useRef(null),anchorRect=React.useRef(null),toolbarDrag=React.useRef(null),manualPosition=React.useRef(false),toolbarPosition=React.useRef(null),previewPath=React.useRef(null),sourceRef=React.useRef(null),sourceKeyRef=React.useRef(null),entrySourceKey=React.useRef(null),instance=React.useRef({}),keyboardRef=React.useRef(null),modeRef=React.useRef('preview'),modeJob=React.useRef(null),readOnlyRef=React.useRef(!!props.readOnly),composingRef=React.useRef(false),noticeTimer=React.useRef(null),scrollRef=React.useRef(null),writePermit=React.useRef(null),refreshKeyRef=React.useRef(null)
  const [entry,setEntry]=React.useState(null),[page,setPage]=React.useState(0),[zoom,setZoom]=React.useState(100),[loading,setLoading]=React.useState(false),[error,setError]=React.useState(''),[revision,setRevision]=React.useState(0),[selection,setSelection]=React.useState(null),[chart,setChart]=React.useState(null),[,tick]=React.useState(0)
  const [mode,updateMode]=React.useState('preview'),[modeBusy,setModeBusy]=React.useState(false),[notice,setNotice]=React.useState('')
  const annotation=React.useRef(null),annotationJob=React.useRef(null),annotationEpoch=React.useRef(0),annotationOwnerRef=React.useRef(null),viewerWaiters=React.useRef(new Set()),annotationRevealRef=React.useRef(null)
  const [annotationUi,setAnnotationUi]=React.useState({active:false,busy:false,count:0,tool:'rect'})
  modeRef.current=mode;readOnlyRef.current=!!props.readOnly
  pageRef.current=page;selectionRef.current=selection;zoomRef.current=zoom
  const bridge=window.sherlockPptEditor,available=typeof bridge?.open==='function'&&typeof bridge?.save==='function'
  const source=String(path).startsWith('sherlock-preview:')?{sourceUrl:path}:{sessionId:scope.sessionId,path},sourceKey=JSON.stringify(source)
  sourceRef.current=source;sourceKeyRef.current=sourceKey
  const annotationSource=pptxAnnotationSource(props),annotationSupported=!!annotationSource&&typeof window[Symbol.for('sherlock:pptx-annotation-input')]?.open==='function'
  const annotationOwnerKey=JSON.stringify([sourceKey,scope?.sessionId,annotationSource]);annotationOwnerRef.current=annotationOwnerKey
  const stopAnnotations=(publish=true)=>{annotationEpoch.current++;annotationJob.current?.controller.abort();annotationJob.current=null;const prior=annotation.current;annotation.current=null;prior?.controller?.abort();prior?.layer?.destroy();prior?.handle?.dispose();if(publish)setAnnotationUi({active:false,busy:false,count:0,tool:'rect'})}
  const refreshSource=props.refreshSource||{...source,...(scope?.cwd?{cwd:scope.cwd}:{})};refreshKeyRef.current=refreshIdentity(refreshSource)
  // Queued autosaves keep their original source permission when the pane changes files.
  if(writePermit.current?.key!==sourceKey)writePermit.current={key:sourceKey,writable:!props.readOnly};else writePermit.current.writable=!props.readOnly
  const begin=()=>{const current=entryRef.current;if(current&&!current.pending)current.pending=snapshot(current)}
  const autoTarget=()=>{const permit=writePermit.current;return{source:{...sourceRef.current},bridge,origin:instance.current,refreshSource:{...refreshSource},canWrite:()=>permit.writable}}
  const end=()=>{const current=entryRef.current;commit(current);if(current){current.composing=false;emit(current);if(!readOnlyRef.current)scheduleAuto(current,autoTarget())}}
  const changeText=(id,value,committed=true)=>{if(modeRef.current!=='edit'||readOnlyRef.current&&!composingRef.current&&!entryRef.current?.composing)return;const current=entryRef.current;if(!current)return;begin();current.values[id]=value;current.composing=!committed;current.status='idle';emit(current);persist(current);if(committed)scheduleAuto(current,autoTarget());else clearTimeout(current.autoTimer)}
  const changeObject=(id,change,committed=true)=>{if(modeRef.current!=='edit'||readOnlyRef.current&&!gestureRef.current&&!composingRef.current&&!entryRef.current?.composing)return;const current=entryRef.current;if(!current)return;current.objects[id]={...current.objects[id],...change};current.status='idle';emit(current);persist(current);if(committed)scheduleAuto(current,autoTarget());else clearTimeout(current.autoTimer)}
  const renderDraft=()=>{
   const expected=++draftGeneration.current
   pendingRender.current=true;clearTimeout(renderTimer.current)
   renderTimer.current=setTimeout(async()=>{
    const current=entryRef.current,viewer=viewerRef.current;if(!current||entrySourceKey.current!==sourceKeyRef.current||!viewer||typeof bridge?.preview!=='function')return
    if(gestureRef.current||(previewHost.current?.contains(document.activeElement)&&document.activeElement?.getAttribute('contenteditable')==='true'))return
    if(renderJob.current)return
    const viewGeneration=generation.current,index=viewer.currentSlideIndex??pageRef.current,job={expected,viewGeneration};renderJob.current=job
    try{const input=request(current,sourceRef.current),result=await bridge.preview(input);if(expected!==draftGeneration.current||viewGeneration!==generation.current||viewer!==viewerRef.current)return;if(!result.ok){if(current.document.version!==input.version){renderDraft();return}throw Error(result.error)}
     // Typing always wins over an asynchronous preview response.
     if(gestureRef.current||(previewHost.current?.contains(document.activeElement)&&document.activeElement?.getAttribute('contenteditable')==='true')){pendingRender.current=true;return}
     const committed=await viewer.open(new Uint8Array(result.bytes),{renderMode:'list',lazySlides:true,lazyMedia:true,listOptions:{...viewer.listOptions,windowed:true,showSlideLabels:false}},()=>expected===draftGeneration.current&&viewGeneration===generation.current&&viewer===viewerRef.current&&!gestureRef.current&&!(previewHost.current?.contains(document.activeElement)&&document.activeElement?.getAttribute('contenteditable')==='true'))
     if(committed===false){pendingRender.current=true;return}
     if(viewer!==viewerRef.current)return;if(committed!==true)await viewer.goToSlide?.(index,{behavior:'auto',block:'nearest'});pendingRender.current=false;controller.current?.refresh();const selected=selectionRef.current?.id;if(selected)controller.current?.selectId(selected)
    }catch(failure){if(expected===draftGeneration.current&&viewGeneration===generation.current){pendingRender.current=false;current.error=failure.message||'草稿预览失败，修改已保留。';emit(current)}}finally{if(renderJob.current===job){renderJob.current=null;if(expected!==draftGeneration.current&&viewGeneration===generation.current&&pendingRender.current)renderDraft()}}
   },180)
  }
  const open=async()=>{
   if(readOnlyRef.current)return null
   if(entryRef.current)return entryRef.current;if(opening.current)return opening.current
   const expected=generation.current;setLoading(true);setError('')
   const operation=(async()=>{try{
    if(!available)throw Error('PPTX 编辑服务不可用，请重新打开应用。')
    const result=await bridge.open({...sourceRef.current,...(token.current?{editToken:token.current}:{})});if(expected!==generation.current||readOnlyRef.current)return null;if(!result.ok)throw Error(result.error)
    let current=drafts.get(result.document.id)
    if(!current){let restored;try{restored=JSON.parse(window.sessionStorage.getItem('sherlock:pptx-draft:'+result.document.id)||'null')}catch{}if(restored?.document?.id!==result.document.id||!restored.values)restored=null
     current={document:restored?.document||result.document,values:restored?.values||Object.fromEntries(result.document.slides.flatMap(s=>s.fields.map(f=>[f.id,f.text]))),objects:restored?.objects||{},textStyles:restored?.textStyles||{},formatTouched:restored?.formatTouched||{},undo:[],redo:[],pending:null,saving:false,status:'idle',error:'',savedState:restored?.savedState||{values:Object.fromEntries(result.document.slides.flatMap(s=>s.fields.map(f=>[f.id,f.text]))),objects:{}},environment:{window,document},listeners:new Set()};drafts.set(result.document.id,current)}
    if(current.document.version!==result.document.version){if(dirty(current))current.error='原 PPTX 已变化，当前编辑稿已保留。请核对内容后重新读取文件。';else{current.document=result.document;current.values=Object.fromEntries(fields(current).map(f=>[f.id,f.text]));current.objects={};current.savedState=snapshot(current);current.error=''}}
    // A remounted component receives a new live token. Renew it while the
    // draft is still relative to the unchanged file; a cumulative saved basis
    // must stay intact so undo can restore content from before earlier saves.
    const originalState={values:Object.fromEntries(fields(current).map(f=>[f.id,f.text])),objects:{}}
    if(current.document.version===result.document.version&&result.document.basisToken&&JSON.stringify(current.savedState)===JSON.stringify(originalState))current.document.basisToken=result.document.basisToken
    if(result.document.editToken)current.document.editToken=result.document.editToken;token.current=current.document.editToken||null;entryRef.current=current;entrySourceKey.current=sourceKey;previewPath.current=result.document.previewUrl||props.path;setEntry(current);if(dirty(current))scheduleAuto(current,autoTarget());return current
   }catch(failure){if(expected===generation.current)setError(failure.message||'无法读取 PPTX。');return null}finally{if(expected===generation.current){setLoading(false);opening.current=null}}})();opening.current=operation;return operation
  }
  const save=()=>{const current=entryRef.current;if(sourceKey!==sourceKeyRef.current||readOnlyRef.current||!current||entrySourceKey.current!==sourceKeyRef.current)return;return saveEntry(current,autoTarget())}
  const captureViewport=(retain=false,key=sourceKeyRef.current)=>{const viewer=viewerRef.current,scroll=viewer?.viewerOptions?.scrollContainer;if(viewer){pageRef.current=viewer.currentSlideIndex??pageRef.current;if(Number.isFinite(viewer.zoomPercent))zoomRef.current=viewer.zoomPercent;if(retain){setPage(pageRef.current);setZoom(zoomRef.current)}}if(scroll)scrollRef.current={key,top:scroll.scrollTop,left:scroll.scrollLeft}}
  const setMode=async next=>{
   if(sourceKey!==sourceKeyRef.current||!['preview','edit'].includes(next)||modeJob.current)return false
   if(next==='edit'&&(!available||readOnlyRef.current))return false
   if(modeRef.current===next)return true
   const current=entryRef.current
   if(composingRef.current||current?.composing||current?.saving||gestureRef.current)return false
   if(next==='edit')stopAnnotations()
   const job={generation:generation.current,key:sourceKeyRef.current};modeJob.current=job;setModeBusy(true)
   const valid=()=>job.generation===generation.current&&job.key===sourceKeyRef.current&&modeJob.current===job
   try{
    if(next==='edit'){captureViewport(true);if(!await open()||!valid()||readOnlyRef.current)return false}
    else{
     const active=document.activeElement;if(previewHost.current?.contains(active)||root.current?.querySelector('.sherlock-ppt-chart')?.contains(active))active?.blur?.()
     commit(current);if(current){persist(current);if(dirty(current))await saveEntry(current,autoTarget());if(dirty(current)||current.composing||current.saving||gestureRef.current)return false}
     if(!valid())return false
     captureViewport(true);controller.current?.clearSelection();selectionRef.current=null;setSelection(null);setChart(null);toolbarDrag.current=null;anchorRect.current=null
     if(document[shortcutOwnerKey]===instance.current)delete document[shortcutOwnerKey]
     if(pendingRender.current||renderJob.current){draftGeneration.current++;pendingRender.current=false;clearTimeout(renderTimer.current);setRevision(v=>v+1)}
    }
    if(!valid())return false
    modeRef.current=next;updateMode(next);if(next==='edit'&&entryRef.current&&dirty(entryRef.current))scheduleAuto(entryRef.current,autoTarget());clearTimeout(noticeTimer.current);setNotice(next==='edit'?'已进入编辑模式':'已切换到预览模式');noticeTimer.current=setTimeout(()=>setNotice(''),2000);return true
   }finally{if(modeJob.current===job){modeJob.current=null;setModeBusy(false)}}
  }
  const toggleMode=()=>setMode(modeRef.current==='edit'?'preview':'edit')
  const nextViewer=(previous,signal)=>new Promise((resolve,reject)=>{
   const finish=(value,failure)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);viewerWaiters.current.delete(ready);if(failure)reject(failure);else resolve(value)}
   const ready=viewer=>{if(viewer&&viewer!==previous)finish(viewer)},abort=()=>finish(null,new DOMException('标注已关闭。','AbortError'))
   const timer=setTimeout(()=>finish(null,Error('预览尚未更新，请重新打开预览后标注。')),10000)
   if(signal.aborted){abort();return}signal.addEventListener('abort',abort,{once:true});viewerWaiters.current.add(ready)
  })
  const setAnnotations=async(active,request={})=>{
   if(request.signal?.aborted)return false
   if(!active){stopAnnotations();return true}
   if(annotation.current?.key===annotationOwnerKey)return true
   if(!annotationSupported||annotationJob.current||modeJob.current)return false
   const job={key:annotationOwnerKey,epoch:++annotationEpoch.current,controller:new AbortController()};annotationJob.current=job;setAnnotationUi(old=>({...old,busy:true}))
   const valid=()=>annotationJob.current===job&&job.key===annotationOwnerRef.current&&job.epoch===annotationEpoch.current&&!job.controller.signal.aborted
   let handle,record
   const abort=()=>job.controller.abort();request.signal?.addEventListener("abort",abort,{once:true})
   try{
    if(modeRef.current==='edit'&&!await setMode('preview'))return false
    if(!valid())return false
    handle=await window[Symbol.for('sherlock:pptx-annotation-input')].open(annotationSource,{signal:job.controller.signal,viewerKey:annotationOwnerKey})
    if(!valid()){handle.dispose();return false}
    let viewer=viewerRef.current;if(!viewer)viewer=await nextViewer(null,job.controller.signal)
    let fileVersion=await viewer.getFileVersion?.()
    if(!valid()){handle.dispose();return false}
    if(fileVersion!==handle.getSnapshot().basis.fileVersion){
     const ready=nextViewer(viewer,job.controller.signal);captureViewport(true);setRevision(value=>value+1);viewer=await ready;fileVersion=await viewer.getFileVersion?.()
    }
    if(!valid()){handle.dispose();return false}
    if(!fileVersion||fileVersion!==handle.getSnapshot().basis.fileVersion)throw Error('预览与文件版本不一致，请重新打开后标注。')
    record={key:annotationOwnerKey,handle,viewer,layer:null,controller:job.controller};annotation.current=record
    record.layer=attachPptxAnnotationViewer(previewHost.current,{uiRoot:root.current,handle,assets:annotationAssets,style:annotationStyle,signal:job.controller.signal,viewerKey:annotationOwnerKey,getViewer:()=>viewerRef.current,onInactive:message=>{if(annotation.current===record){stopAnnotations();setError(message)}},isCurrent:()=>annotation.current===record&&record.key===annotationOwnerRef.current,onState:next=>{if(annotation.current===record){setError(value=>value===(next.error||'')?value:next.error||'');setAnnotationUi(old=>{const value={active:true,busy:!!next.busy,count:next.count,tool:next.tool};return JSON.stringify(old)===JSON.stringify(value)?old:value})}}})
    if(!valid()||annotation.current!==record){record.layer?.destroy();return false}
    setAnnotationUi(old=>({...old,active:true,busy:false}));return true
   }catch(failure){if(valid())setError(failure.message||'标注暂不可用，原草稿已保留。');job.controller.abort();if(annotation.current===record){annotation.current=null;record?.layer?.destroy()}handle?.dispose();return false}
   finally{request.signal?.removeEventListener("abort",abort);if(annotationJob.current===job){annotationJob.current=null;if(!annotation.current)setAnnotationUi({active:false,busy:false,count:0,tool:'rect'})}}
  }
  annotationRevealRef.current=async(reference,{signal})=>{
   const owner=annotationOwnerKey,assert=()=>{if(signal.aborted||annotationOwnerRef.current!==owner||!root.current?.isConnected)throw Error('PPT 预览已切换，请重新定位。')}
   assert()
   const before=annotation.current?.handle.getSnapshot().basis
   if(before&&(before.documentId!==reference.documentId||before.fileVersion!==reference.fileVersion))stopAnnotations()
   if(!await setAnnotations(true,{signal}))throw Error('暂不能开启标注，请确认编辑已保存或稍后重试。')
   assert();const record=annotation.current,snapshot=record?.handle.getSnapshot()
   if(!record||snapshot.active===false||snapshot.basis.documentId!==reference.documentId||snapshot.basis.fileVersion!==reference.fileVersion){if(record)stopAnnotations();throw Error('原文件身份或版本已变化，请重新打开后定位。')}
   const mark=snapshot.marks.find(mark=>mark.id===reference.markId)
   if(!mark||mark.stale||mark.fileVersion!==reference.fileVersion){stopAnnotations();throw Error('标记已删除或需要重新定位。')}
   return{cancel(){if(annotation.current===record&&annotationOwnerRef.current===owner)stopAnnotations()},select(){assert();if(annotation.current!==record||record.handle.getSnapshot().active===false)throw Error('标注视图已关闭，请重新定位。');record.handle.select(reference.markId)}}
  }
  React.useEffect(()=>{
   const api=window[Symbol.for('sherlock:pptx-annotation-input')]
   if(!annotationSupported||typeof api?.registerViewer!=='function')return
   const isAvailable=()=>{
    const target=root.current;if(!target?.isConnected||!target.closest('#odyssey-right-workspace-panel')||target.closest('[hidden],[inert]'))return false
    const rect=target.getBoundingClientRect();if(rect.width<=0||rect.height<=0||rect.bottom<=0||rect.right<=0||rect.top>=window.innerHeight||rect.left>=window.innerWidth)return false
    for(let element=target;element;element=element.parentElement){const style=window.getComputedStyle(element);if(style.display==='none'||style.visibility==='hidden'||Number.parseFloat(style.opacity)===0)return false}
    return true
   }
   return api.registerViewer({source:annotationSource,path:String(path),canonicalPath:props.annotationCanonicalPath??String(path),canReuse:()=>!!(root.current?.isConnected&&annotationOwnerRef.current===annotationOwnerKey&&((viewerRef.current&&viewerSourceKeyRef.current===sourceKey)||(entryRef.current&&entrySourceKey.current===sourceKey))),isAvailable,activate:(...args)=>annotationRevealRef.current(...args)})
  },[annotationOwnerKey,annotationSupported])
  const toggleAnnotations=()=>setAnnotations(!annotation.current)
  React.useEffect(()=>{setAnnotationUi({active:false,busy:false,count:0,tool:'rect'});return()=>stopAnnotations(false)},[annotationOwnerKey])

  const history=direction=>{if(previewHost.current?.contains(document.activeElement))document.activeElement?.blur?.();end();const current=entryRef.current;if(!current)return;const stack=current[direction];if(!stack.length)return;current[direction==='undo'?'redo':'undo'].push(snapshot(current));const next=stack.pop();current.values=next.values;current.objects=next.objects;setSelection(old=>old?{...current.document.slides.flatMap(s=>s.nodes).find(n=>n.id===old.id),...next.objects[old.id]}:null);setChart(old=>old?{...old,value:clone(next.objects[old.id]?.chart||current.document.slides.flatMap(slide=>slide.nodes).find(node=>node.id===old.id)?.chart||old.value)}:null);current.status='idle';persist(current);emit(current,true);controller.current?.refresh();renderDraft();scheduleAuto(current,autoTarget())}
  const positionToolbar=(rect,remember=false)=>{
   if(rect!==undefined)anchorRect.current=rect
   const bar=floatingToolbar.current,r=anchorRect.current;if(!bar)return;if(!r){bar.style.visibility='hidden';return}
   // Object visibility is clipped by the reader before reaching this callback.
   // Its floating toolbar can escape the card and uses the client window.
   const viewport={left:0,top:0,right:window.innerWidth,bottom:window.innerHeight},spaceX=viewport.right-viewport.left,spaceY=viewport.bottom-viewport.top
   bar.style.maxWidth=Math.max(0,spaceX-16)+'px'
   const width=bar.offsetWidth||Math.min(620,spaceX-16),height=bar.offsetHeight||40
   if(width+16>spaceX||height+16>spaceY){bar.style.visibility='hidden';return}
   const clamp=(value,min,max)=>Math.max(min,Math.min(value,Math.max(min,max)))
   const desired=manualPosition.current&&!remember&&toolbarPosition.current
   bar.style.left=clamp(manualPosition.current?desired?.left??(parseFloat(bar.style.left)||r.left):r.left,viewport.left+8,viewport.right-width-8)+'px'
   bar.style.top=clamp(manualPosition.current?desired?.top??(parseFloat(bar.style.top)||r.top-height-40):r.top-height-40,viewport.top+8,viewport.bottom-height-8)+'px'
   if(!manualPosition.current||remember)toolbarPosition.current={left:parseFloat(bar.style.left),top:parseFloat(bar.style.top)}
   bar.style.visibility='visible'
  }
  instance.current.clearSelection=()=>controller.current?.clearSelection()
  const ownShortcuts=()=>{if(modeRef.current!=='edit'||!entryRef.current)return;const previous=document[shortcutOwnerKey];if(previous!==instance.current){previous?.clearSelection?.();document[shortcutOwnerKey]=instance.current}}
  const selectNode=node=>{if(node)ownShortcuts();else if(document[shortcutOwnerKey]===instance.current)delete document[shortcutOwnerKey];if(selectionRef.current?.id!==node?.id)manualPosition.current=false;selectionRef.current=node;setSelection(node)}
  const dragToolbar=event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();const bar=floatingToolbar.current;if(!bar)return;manualPosition.current=true;toolbarDrag.current={x:event.clientX,y:event.clientY,left:parseFloat(bar.style.left)||0,top:parseFloat(bar.style.top)||0};event.currentTarget.setPointerCapture?.(event.pointerId)}
  React.useLayoutEffect(()=>positionToolbar(),[selection,chart,mode])
  React.useEffect(()=>{const move=event=>{const drag=toolbarDrag.current,bar=floatingToolbar.current;if(!drag||!bar)return;event.preventDefault();bar.style.left=drag.left+event.clientX-drag.x+'px';bar.style.top=drag.top+event.clientY-drag.y+'px';positionToolbar(undefined,true)},end=()=>{toolbarDrag.current=null},resize=()=>positionToolbar();document.addEventListener('pointermove',move);document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);window.addEventListener('resize',resize);return()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',end);window.removeEventListener('resize',resize)}},[])
  React.useEffect(()=>{const shortcut=event=>{if(modeRef.current==='edit'&&document.activeElement===document.body&&document[shortcutOwnerKey]===instance.current&&entryRef.current&&entrySourceKey.current===sourceKeyRef.current){keyboardRef.current?.(event);if(event.defaultPrevented)event.stopImmediatePropagation()}},focus=event=>{if(event.target!==document.body&&document[shortcutOwnerKey]===instance.current&&!root.current?.contains(event.target)&&!floatingToolbar.current?.contains(event.target))controller.current?.clearSelection()};document.addEventListener('keydown',shortcut,true);document.addEventListener('focusin',focus,true);return()=>{document.removeEventListener('keydown',shortcut,true);document.removeEventListener('focusin',focus,true);if(document[shortcutOwnerKey]===instance.current)delete document[shortcutOwnerKey]}},[])
  const attachViewer=React.useCallback((viewer,bytes)=>{if(!viewer){if(annotation.current)stopAnnotations();captureViewport(false,sourceKey);viewerRef.current=null;viewerSourceKeyRef.current=null;return}viewerRef.current=createStablePptxViewer(viewer,bytes);viewerSourceKeyRef.current=sourceKey;for(const notify of [...viewerWaiters.current])notify(viewerRef.current);if(zoomRef.current!==100)void viewerRef.current.setZoom?.(zoomRef.current);Promise.resolve(viewerRef.current.goToSlide?.(pageRef.current,{behavior:'auto',block:'nearest'})).then(()=>{const saved=scrollRef.current,scroll=viewer.viewerOptions?.scrollContainer;if(saved?.key===sourceKey&&scroll){scroll.scrollTop=saved.top;scroll.scrollLeft=saved.left}});if(pendingRender.current)renderDraft()},[sourceKey])
  React.useEffect(()=>{generation.current++;entryRef.current=null;opening.current=null;token.current=null;setEntry(null);setPage(0);setSelection(null);setChart(null);gestureRef.current=false;manualPosition.current=false;toolbarDrag.current=null;pendingRender.current=false;renderJob.current=null;entrySourceKey.current=null;clearTimeout(renderTimer.current);previewPath.current=props.path;setError('');modeRef.current='preview';updateMode('preview');modeJob.current=null;setModeBusy(false);composingRef.current=false;clearTimeout(noticeTimer.current);setNotice('');setLoading(false);return()=>{generation.current++;modeJob.current=null;clearTimeout(noticeTimer.current);draftGeneration.current++;entryRef.current=null;clearTimeout(renderTimer.current);if(document[shortcutOwnerKey]===instance.current)delete document[shortcutOwnerKey]}},[sourceKey])
  React.useEffect(()=>{if(mode!=='edit'||!entry||entrySourceKey.current!==sourceKey||!previewHost.current)return;controller.current=attachPptxDirectEditor(previewHost.current,{getEntry:()=>entryRef.current,changeText,changeObject,begin,end,render:renderDraft,renderPending:()=>{if(pendingRender.current)renderDraft()},select:selectNode,position:positionToolbar,isToolTarget:target=>floatingToolbar.current?.contains(target)||root.current?.querySelector('.sherlock-ppt-chart')?.contains(target),interaction:value=>{gestureRef.current=value;if(entryRef.current){entryRef.current.gesture=value;if(value)clearTimeout(entryRef.current.autoTimer);emit(entryRef.current)}},editChart:node=>setChart({id:node.id,value:clone(node.chart),documentId:entryRef.current.document.id,generation:generation.current})});controller.current.setEnabled(mode==='edit');if(dirty(entry))renderDraft();return()=>{controller.current?.destroy();controller.current=null}},[entry,mode,sourceKey])
  React.useEffect(()=>controller.current?.setEnabled(mode==='edit'),[mode])
  React.useEffect(()=>{const host=root.current;if(!host||mode!=='edit')return;const start=()=>{composingRef.current=true;const current=entryRef.current;if(current){begin();current.composing=true;clearTimeout(current.autoTimer);emit(current)}},finish=()=>{composingRef.current=false;const current=entryRef.current;Promise.resolve().then(()=>{if(current===entryRef.current&&modeRef.current==='edit')end()})};host.addEventListener('compositionstart',start,true);host.addEventListener('compositionend',finish,true);return()=>{host.removeEventListener('compositionstart',start,true);host.removeEventListener('compositionend',finish,true)}},[mode,entry])
  React.useEffect(()=>{void viewerRef.current?.setZoom?.(zoom)},[zoom])
  React.useEffect(()=>{void viewerRef.current?.goToSlide?.(page,{behavior:'auto',block:'nearest'})},[page])
  React.useEffect(()=>{if(!entry)return;const listener=redraw=>{tick(v=>v+1);controller.current?.refresh();if(redraw&&modeRef.current==='edit')renderDraft()},leave=event=>{if(dirty(entry)){event.preventDefault();event.returnValue=''}};entry.listeners.add(listener);window.addEventListener('beforeunload',leave);return()=>{entry.listeners.delete(listener);window.removeEventListener('beforeunload',leave)}},[entry])
  React.useEffect(()=>{const saved=event=>{if(event.detail?.origin===instance.current)return;const current=entryRef.current;if(!(current&&event.detail?.id===current.document.id)&&JSON.stringify(event.detail?.source)!==sourceKeyRef.current&&!(refreshKeyRef.current&&refreshIdentity(event.detail?.refreshSource||event.detail?.source)===refreshKeyRef.current))return;if(modeRef.current==='edit'&&current){controller.current?.refresh();renderDraft()}else{stopAnnotations();captureViewport(true);setRevision(v=>v+1)}};document.addEventListener('sherlock:pptx-saved',saved);return()=>document.removeEventListener('sherlock:pptx-saved',saved)},[sourceKey])
  React.useEffect(()=>{if(!props.readOnly||mode!=='edit'||composingRef.current||entry?.composing||gestureRef.current)return;if(entry){commit(entry);persist(entry);if(entry.autoTarget?.canWrite?.()===false)clearTimeout(entry.autoTimer)}controller.current?.clearSelection();selectionRef.current=null;setSelection(null);setChart(null);modeRef.current='preview';updateMode('preview');modeJob.current=null;setModeBusy(false);clearTimeout(noticeTimer.current);setNotice('')},[props.readOnly,mode,entry?.saving,entry?.composing,entry?.gesture])
  React.useEffect(()=>{if(toolbar==='host')onToolbarState?.({modes:true,mode,modeBusy:modeBusy||loading||!!entry?.saving||!!entry?.composing||gestureRef.current,dirty:!!entry&&dirty(entry),editable:available&&!props.readOnly,saveState:entry?.status||'idle',annotations:annotationSupported,annotationActive:annotation.current?.key===annotationOwnerKey&&annotationUi.active,annotationBusy:annotationUi.busy,annotationCount:annotationUi.count,annotationIcon:annotationAssets[annotationUi.active?'mark16-selected':'mark16-normal'],downloadUrl:download?download(scope,path):String(path).startsWith('sherlock-preview:')?path:undefined});onToolbarControls?.({save,setMode,toggleMode,setAnnotations,toggleAnnotations})})
  const reload=async()=>{if(entryRef.current?.saving||entryRef.current?.composing||composingRef.current||gestureRef.current)return;if(entryRef.current&&dirty(entryRef.current)&&!window.confirm('重新读取会放弃当前编辑稿，是否继续？'))return;stopAnnotations();if(entryRef.current){clearTimeout(entryRef.current.autoTimer);entryRef.current.discarded=true;drafts.delete(entryRef.current.document.id);try{window.sessionStorage.removeItem('sherlock:pptx-draft:'+entryRef.current.document.id)}catch{}}draftGeneration.current++;renderJob.current=null;pendingRender.current=false;clearTimeout(renderTimer.current);entryRef.current=null;setEntry(null);setSelection(null);setChart(null);generation.current++;setError('');if(modeRef.current==='edit'&&!readOnlyRef.current)await open();setRevision(v=>v+1)}
  const format=(key,value)=>{if(modeRef.current!=='edit'||readOnlyRef.current||!selection)return;begin();changeObject(selection.id,{[key]:value});end();setSelection(old=>({...old,[key]:value}));renderDraft()}
  const button=(text,action,disabled=false)=>h('button',{type:'button',onClick:action,disabled},text)
  const input=(label,value,onChange,type='text',extra={})=>h('label',null,h('span',null,label),h('input',{'aria-label':label,type,value,onChange:event=>onChange(event.target.value),...extra}))
  const selectedNode=selection&&{...selection,...entry?.objects[selection.id]},message=error||entry?.error
  const fontNames=Array.from(new Set([selectedNode?.fontFamily,...(entry?.document.slides.flatMap(s=>s.nodes.map(n=>n.fontFamily))||[]),'华文黑体_易方达','PingFang SC','Songti SC','Heiti SC','Microsoft YaHei','SimSun','SimHei','Noto Sans SC','Arial','Calibri','Helvetica','Times New Roman','Georgia'].filter(Boolean)))
  const fontLabels={'PingFang SC':'苹方','Songti SC':'宋体（Songti SC）','Heiti SC':'黑体（Heiti SC）','Microsoft YaHei':'微软雅黑','SimSun':'宋体（SimSun）','SimHei':'黑体（SimHei）','Noto Sans SC':'思源黑体'}
  const keyboard=event=>{if(modeRef.current!=='edit'||readOnlyRef.current)return;if(event.isComposing||entryRef.current?.composing)return;if(event.key==='Escape'&&chart){event.preventDefault();event.stopPropagation();setChart(null);return}if(event.key==='Escape'&&!chart&&selectionRef.current){event.preventDefault();event.stopPropagation();controller.current?.clearSelection();return}if((event.metaKey||event.ctrlKey)&&!event.isComposing){const key=event.key.toLowerCase();if(['s','z','y'].includes(key)){event.preventDefault();event.stopPropagation();if(key==='s')void save();else history(key==='y'||event.shiftKey?'redo':'undo')}}}
  keyboardRef.current=keyboard
  const updateChart=mutate=>{if(modeRef.current!=='edit'||readOnlyRef.current||!chart||chart.documentId!==entryRef.current?.document.id||chart.generation!==generation.current)return;const next=clone(chart);mutate(next.value);const composing=entryRef.current.composing;begin();changeObject(next.id,{chart:next.value},!composing);if(!composing)end();setChart(next);if(!composing)renderDraft()}
  const chartDialog=mode==='edit'&&chart&&h('section',{className:'sherlock-ppt-chart',role:'dialog','aria-label':'图表数据编辑',onCompositionStart:()=>{const current=entryRef.current;if(current){begin();current.composing=true;clearTimeout(current.autoTimer)}},onCompositionEnd:()=>{end();renderDraft()}},h('header',null,h('b',null,'图表数据'),button('关闭',()=>setChart(null))),input('图表标题',chart.value.title,value=>updateChart(next=>{next.title=value})),h('label',null,h('input',{type:'checkbox',checked:chart.value.legend,onChange:event=>updateChart(next=>{next.legend=event.target.checked})}),'显示图例'),h('div',{className:'sherlock-ppt-chart-table'},h('table',null,h('thead',null,h('tr',null,h('th',null,'类别'),chart.value.series.map((s,i)=>h('th',{key:i},input('系列 '+(i+1)+' 名称',s.name,value=>updateChart(next=>{next.series[i].name=value})),input('系列 '+(i+1)+' 颜色','#'+(s.color||'5470C6'),value=>updateChart(next=>{next.series[i].color=value.slice(1)}),'color'))))),h('tbody',null,chart.value.categories.map((category,row)=>h('tr',{key:row},h('td',null,input('类别 '+(row+1),category,value=>updateChart(next=>{next.categories[row]=value}))),chart.value.series.map((s,col)=>h('td',{key:col},input('数值 '+(row+1)+'-'+(col+1),s.values[row]??'',value=>updateChart(next=>{next.series[col].values[row]=value===''?null:Number(value)}),'number',{step:'any'})))))))),h('p',null,'数据会同步保存到 PPTX 的图表和内嵌工作簿。'))
  const formatToolbar=selectedNode&&mode==='edit'&&!chart&&h('div',{ref:floatingToolbar,className:'sherlock-ppt-format',role:'toolbar','aria-label':'对象格式',onPointerDown:event=>event.stopPropagation(),onMouseDown:event=>event.stopPropagation(),onDoubleClick:event=>event.stopPropagation(),onKeyDown:event=>event.stopPropagation(),onKeyDownCapture:keyboard},h('button',{type:'button',className:'sherlock-ppt-toolbar-handle','aria-label':'拖动格式工具栏',title:'拖动格式工具栏',onPointerDown:dragToolbar,onKeyDown:event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const bar=floatingToolbar.current,step=event.shiftKey?10:1;manualPosition.current=true;bar.style.left=(parseFloat(bar.style.left)||0)+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0)+'px';bar.style.top=(parseFloat(bar.style.top)||0)+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)+'px';positionToolbar(undefined,true)}}},'⠿'),h('span',{className:'sherlock-ppt-object-name',title:selectedNode.name},selectedNode.name),selectedNode.type!=='picture'&&selectedNode.type!=='group'&&selectedNode.type!=='chart'&&h(React.Fragment,null,h('label',null,h('span',null,'字体'),h('select',{'aria-label':'字体',className:'sherlock-ppt-font',value:selectedNode.fontFamily||'',onChange:event=>format('fontFamily',event.target.value)},!selectedNode.fontFamily&&h('option',{value:'',disabled:true},'默认字体'),fontNames.map(name=>h('option',{key:name,value:name},fontLabels[name]||name)))),input('字号',selectedNode.fontSize||18,value=>format('fontSize',Number(value)),'number',{min:1,max:400}),button(selectedNode.bold?'取消加粗':'加粗',()=>format('bold',!selectedNode.bold)),input('文字色','#'+(selectedNode.color||'000000'),value=>format('color',value.slice(1)),'color')),selectedNode.type==='shape'&&h(React.Fragment,null,input('填充','#'+(selectedNode.fill||'FFFFFF'),value=>format('fill',value.slice(1)),'color'),button('无填充',()=>format('fill','none')),input('边框','#'+(selectedNode.stroke||'000000'),value=>format('stroke',value.slice(1)),'color'),h('select',{'aria-label':'图形形状',value:selectedNode.preset||'rect',onChange:event=>format('preset',event.target.value)},['rect','roundRect','ellipse','triangle','diamond','rightArrow','star5'].map((v,i)=>h('option',{key:v,value:v},['矩形','圆角矩形','椭圆','三角形','菱形','箭头','星形'][i])))),selectedNode.geometry&&input('旋转',Math.round(selectedNode.geometry.rotation),value=>format('geometry',{...selectedNode.geometry,rotation:Number(value)}),'number'),selectedNode.chartWarning&&h('span',{className:'sherlock-ppt-hint'},selectedNode.chartWarning),selectedNode.chart&&button('编辑图表数据',()=>setChart({id:selectedNode.id,value:clone(selectedNode.chart),documentId:entryRef.current.document.id,generation:generation.current})),h('button',{type:'button','aria-label':'关闭格式工具栏',onClick:()=>controller.current?.clearSelection()},'×'))
  const floatingFormat=formatToolbar&&(createPortal?createPortal(formatToolbar,document.body):formatToolbar)
  return h('div',{ref:root,className:'sherlock-ppt-editor','data-ppt-editor':'',onFocusCapture:ownShortcuts,onKeyDownCapture:keyboard},
   h('style',null,`.sherlock-ppt-editor,.sherlock-ppt-format{--ppt-ink:#292929;--ppt-border:#dedede;--ppt-control:#f5f5f5;--ppt-bg:#fff;color:var(--ppt-ink);font-size:12px}.sherlock-ppt-editor{height:100%;min-height:0;min-width:0;display:flex;flex-direction:column;position:relative;font-size:12px}[data-ds-dark-theme] .sherlock-ppt-editor,[data-ds-dark-theme] .sherlock-ppt-format{--ppt-ink:#ededed;--ppt-border:#484848;--ppt-control:#333;--ppt-bg:#242424}.sherlock-ppt-format{position:fixed;z-index:100002;width:max-content;max-width:calc(100vw - 16px);box-sizing:border-box;border:1px solid var(--ppt-border);border-radius:8px;box-shadow:0 4px 18px #0002;display:flex;align-items:center;gap:6px;padding:6px 8px;flex-wrap:wrap;flex-shrink:0;background:var(--ppt-bg)}.sherlock-ppt-editor button,.sherlock-ppt-editor select,.sherlock-ppt-editor input,.sherlock-ppt-format button,.sherlock-ppt-format select,.sherlock-ppt-format input{font:inherit;color:inherit;background:var(--ppt-control);border:1px solid var(--ppt-border);border-radius:4px;padding:4px 7px;min-width:0}.sherlock-ppt-editor button,.sherlock-ppt-format button{cursor:pointer}.sherlock-ppt-format .sherlock-ppt-toolbar-handle{cursor:grab;touch-action:none;font-size:16px;padding:2px 4px}.sherlock-ppt-status{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.sherlock-ppt-editor button:disabled{opacity:.4;cursor:default}.sherlock-ppt-editor button:focus-visible,.sherlock-ppt-editor input:focus-visible,.sherlock-ppt-editor select:focus-visible{outline:2px solid #526fff}.sherlock-ppt-preview{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;overflow:hidden}.sherlock-ppt-preview [contenteditable=true]:focus{outline:1px dashed #526fff;outline-offset:2px;user-select:text}.sherlock-ppt-object-name{max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sherlock-ppt-format label{display:flex;align-items:center;gap:4px}.sherlock-ppt-format .sherlock-ppt-font{width:135px;max-width:180px}.sherlock-ppt-format input[type=number]{width:52px}.sherlock-ppt-format input[type=color]{width:27px;height:26px;padding:2px}.sherlock-ppt-error{color:#cf664f;padding:8px}.sherlock-ppt-error button{margin-left:8px}.sherlock-ppt-hint{opacity:.65;font-size:11px}.sherlock-ppt-chart{position:absolute;z-index:100001;inset:8% 4%;background:var(--ppt-bg);border:1px solid var(--ppt-border);border-radius:10px;padding:14px;box-shadow:0 6px 30px #0003;overflow:auto}.sherlock-ppt-chart header{display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap}.sherlock-ppt-chart header b{flex:1}.sherlock-ppt-chart label{display:flex;align-items:center;gap:6px;margin:4px 0}.sherlock-ppt-chart-table{overflow:auto;margin-top:10px}.sherlock-ppt-chart table{border-collapse:collapse;white-space:nowrap}.sherlock-ppt-chart td,.sherlock-ppt-chart th{border:1px solid var(--ppt-border);padding:5px}.sherlock-ppt-chart-table input[type=text],.sherlock-ppt-chart-table input[type=number]{width:110px}.sherlock-ppt-chart-table label span{display:none}`),
   h('span',{className:'sherlock-ppt-status','aria-live':'polite'},loading?'正在准备编辑…':entry&&dirty(entry)?'未保存':entry?.status==='saved'?'已保存':''),
   notice&&h('div',{role:'status','aria-live':'polite',className:'sherlock-ppt-mode-notice','data-note-export-omit':'',style:{position:'absolute',bottom:20,left:'50%',transform:'translateX(-50%)',zIndex:100003,pointerEvents:'none',background:'var(--ppt-bg)',border:'1px solid var(--ppt-border)',borderRadius:8,padding:'8px 14px',boxShadow:'0 2px 10px #0002'}},notice),
   floatingFormat,
   message&&h('div',{className:'sherlock-ppt-error',role:'alert'},message,entry&&button('重试自动保存',save,!!entry?.saving),button('重新读取文件',reload,!!entry?.saving)),
   h('div',{ref:previewHost,className:'sherlock-ppt-preview'},h(Preview,{...props,path:entrySourceKey.current===sourceKey?previewPath.current||props.path:props.path,key:sourceKey+':'+revision,onToolbarState:undefined,onToolbarControls:undefined,onPptxViewer:attachViewer,toolbar:'host'})),chartDialog)
 }
}
const officeModeProps='...(kind === "pptx" ? { toolbar: "host" } : {})'
const legacyForwardedOfficeModeProps='...(kind === "pptx" ? { toolbar: "host", readOnly: props.readOnly, refreshSource: props.refreshSource, onToolbarState: props.onToolbarState, onToolbarControls: props.onToolbarControls } : {})'
const forwardedOfficeModeProps='...(kind === "pptx" ? { toolbar: "host", readOnly: props.readOnly, refreshSource: props.refreshSource, annotationSource: props.annotationSource, onToolbarState: props.onToolbarState, onToolbarControls: props.onToolbarControls } : {})'
const annotations=[
 ['function yo(t, n) {',`function yo(t, n) { const element=renderPptxNode(t,n); Object.assign(element.dataset,{pptxNodeId:t.id,pptxPart:n.partPath,pptxType:t.nodeType,pptxWidth:String(t.size.w),pptxHeight:String(t.size.h),pptxFlipH:String(!!t.flipH),pptxFlipV:String(!!t.flipV),pptxPositionScaleX:String(t.sherlockPositionScaleX??1),pptxPositionScaleY:String(t.sherlockPositionScaleY??1),pptxPositionWidth:String(t.sherlockPositionWidth??0),pptxPositionHeight:String(t.sherlockPositionHeight??0)});return element; }
function renderPptxNode(t, n) {`],
 ['for (const [m, b] of t.paragraphs.entries()) {\n\t\t\t\tconst M = document.createElement("div");','for (const [m, b] of t.paragraphs.entries()) {\n\t\t\t\tconst M = document.createElement("div"); M.dataset.pptxParagraph=String(m);'],
 ['const b = c / r.w, M = l / r.h, L = Cf(y.rotation), v = y.position, k = y.size;', 'const b = c / r.w, M = l / r.h, L = Cf(y.rotation), v = y.position, k = y.size; y.sherlockPositionScaleX=t.flipH?-b:b; y.sherlockPositionScaleY=t.flipV?-M:M; y.sherlockPositionWidth=(t.flipH?-(L?(b-M)/2:0)-(L?M:b):(L?(b-M)/2:0)); y.sherlockPositionHeight=(t.flipV?-(L?(M-b)/2:0)-(L?b:M):(L?(M-b)/2:0));'],
 ['G.textContent = I + " ";','G.textContent = I + " "; G.dataset.pptxBullet="";'],
 ['const f = document.createElement("td");\n\t\t\t\t\tf.style.overflow', 'const f = document.createElement("td"); f.dataset.pptxRow=String(x); f.dataset.pptxColumn=String(u);\n\t\t\t\t\tf.style.overflow']
]
const marker='/* sherlock:pptx-content-editor:v9 */'
const endMarker='/* sherlock:pptx-content-editor:end */\n'
const viewerAttach='viewerRef.current = viewer;'
const legacyAttached=viewerAttach+' props.onPptxViewer?.(viewer);'
const attached=viewerAttach+' props.onPptxViewer?.(viewer,bytes);'
const viewerDetach='viewerRef.current = null;'
const detached='props.onPptxViewer?.(null); '+viewerDetach
export function stripPptxEditorPatch(source) {
 const start=source.search(/\/\* sherlock:pptx-content-editor:v\d+ \*\//)
 if(start<0)return source
 const end=source.indexOf(endMarker,start)
 if(end<0)throw Error('PPT content editor patch end missing')
 source=source.slice(0,start)+source.slice(end+endMarker.length)
 source=source.replace(forwardedOfficeModeProps,officeModeProps)
 source=source.replace(legacyForwardedOfficeModeProps,officeModeProps)
 for(const [original,patched]of annotations)source=source.replace(patched,original)
 return source.replace('function PptxPreview(props) {','function PptxView(props) {').replace(attached,viewerAttach).replace(legacyAttached,viewerAttach).split(detached).join(viewerDetach)
}
export function patchPptxEditor(source) {
 if(source.includes(marker)){if(source.split(marker).length!==2||source.split('function attachPptxAnnotationViewer(').length!==2||source.split('const pptxAnnotationAssets = ').length!==2||source.split(attached).length!==2)throw Error('PPT annotation editor installation drifted');return source}
 source=stripPptxEditorPatch(source)
 source=source.replace(officeModeProps,forwardedOfficeModeProps)
 const anchor='function PptxView(props) {'
 if(source.split(anchor).length!==2)throw Error('PPT content editor anchor drifted')
 if(source.split(viewerAttach).length!==2||source.split(viewerDetach).length!==3)throw Error('PPT viewer callback anchors drifted')
 for(const [original,patched]of annotations){if(source.split(original).length!==2)throw Error('PPT direct editor renderer anchor drifted: '+original.slice(0,55));source=source.replace(original,patched)}
 return source.replace(viewerAttach,attached).split(viewerDetach).join(detached).replace(anchor,marker+'\nconst pptxAnnotationAssets = '+JSON.stringify(pptxAnnotationAssets)+';\nconst pptxAnnotationStyle = '+JSON.stringify(pptxAnnotationStyle)+';\n'+pptxAnnotationSource.toString()+'\n'+attachPptxAnnotationViewer.toString()+'\n'+attachPptxDirectEditor.toString()+'\n'+createStablePptxViewer.toString()+'\n'+createPptxEditorComponent.toString()+'\nconst PptxView = createPptxEditorComponent(react$1, PptxPreview, downloadUrl, react_dom.createPortal);\n'+endMarker+'function PptxPreview(props) {')
}
