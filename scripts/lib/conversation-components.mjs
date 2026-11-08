import {readFileSync} from 'node:fs'
import {WORKBENCH_TABLE_COLUMNS_CSS} from '../../packages/dsh-research-task-runtime/workbench-table-columns.js'
import {parseConversationComponentManifest,parseConversationComponentReference} from '../../packages/dsh-research-task-runtime/conversation-component-contract.js'
import * as references from './conversation-component-reference.mjs'
import {componentPptxModeHost,useComponentPptxMode} from './component-pptx-mode.mjs'
import {createConversationHtmlInteraction} from './conversation-html-interaction.mjs'
import {patchComponentSurfaceMenu} from './component-surface-menu.mjs'
export {conversationComponentReferenceSource,insertConversationComponentReference,serializeConversationComponentReference} from './conversation-component-reference.mjs'

export function conversationComponentNodeTurn(node){
 const location=node?.location
 if(['turn','step'].includes(location?.kind)&&Number.isFinite(location.turn?.turn))return location.turn.turn
 return Number.isFinite(node?.data?.turn)?node.data.turn:null
}

// Read the native tool event only. Assistant prose and arbitrary JSON fences
// never grant storage, source access or a successful rendering receipt.
export function conversationComponentReceiptManifests(nodes,sessionId,readTurn=conversationComponentNodeTurn){
 const manifests=new Map()
 for(const node of nodes??[]){
  if(node?.kind!=='tool-call')continue
  const pending=[node.data?.root],seen=new Set(),turn=readTurn(node)
  while(pending.length&&seen.size<128){
   const root=pending.pop();if(!root||typeof root!=='object'||seen.has(root))continue;seen.add(root)
   if(Array.isArray(root.subCalls))pending.push(...root.subCalls.slice().reverse())
   if(root.kind!=='tool-result'||root.call?.name!=='client_action')continue
   let call;try{if(typeof root.call.argsRaw!=='string'||root.call.argsRaw.length>1500000)continue;call=JSON.parse(root.call.argsRaw)}catch{continue}
   if(call?.capability!=='conversation.components.create'||typeof call.requestId!=='string')continue
   for(const block of root.content??[]){
    if(block?.type!=='text'||typeof block.text!=='string'||block.text.length>16384)continue
    let result;try{result=JSON.parse(block.text)}catch{continue}
    if(root.isError===true||root.error!=null){
     // ToolRuntime preserves its ABORTED outer envelope after cancellation.
     // Only its Host-recovered, canonical saved fact may still render a card.
     const keys=['requestId','capability','status','effect','data','message','cancelledAfterSave']
     if(root.isError!==true||root.error?.name!=='AbortError'||root.error?.code!=='ABORTED'||result?.cancelledAfterSave!==true||result.message!=='组件已保存，后续操作已取消。'||Object.keys(result).length!==keys.length||!keys.every(key=>Object.hasOwn(result,key))||!result.effect||Object.keys(result.effect).length!==3||!result.data||Object.keys(result.data).length!==1)continue
    }
    const manifest=parseConversationComponentManifest(result?.data?.renderManifest)
    if(!manifest||manifest.sessionId!==sessionId||turn!=null&&manifest.turnId!==String(turn)||result.capability!==call.capability||result.requestId!==call.requestId||manifest.requestId!==call.requestId||result.status!=='succeeded'||result.effect?.kind!=='conversation-component'||result.effect.state!=='saved'||result.effect.componentId!==manifest.componentId)continue
    if(!manifests.has(manifest.componentId))manifests.set(manifest.componentId,manifest)
   }
  }
 }
 return [...manifests.values()]
}

export function conversationComponentReceiptAnchors(flow,nodeStore,sessionId,readTurn=conversationComponentNodeTurn){
 const anchors=new Map(),owners=new Set()
 for(const entry of flow??[]){
  for(const key of entry.kind==='execution'?entry.nodeKeys??[]:entry.kind==='node'?[entry.key]:[]){
   for(const manifest of conversationComponentReceiptManifests([nodeStore?.get?.(key)],sessionId,readTurn)){
    if(entry.kind==='execution'&&entry.turn!=null&&manifest.turnId!==String(entry.turn)||owners.has(manifest.componentId))continue
    owners.add(manifest.componentId);const items=anchors.get(key)??[];items.push(manifest);anchors.set(key,items)
   }
  }
 }
 return anchors
}

// Native compaction normally hides short intermediate public steps in one
// execution group. A genuine saved receipt makes that turn a narrative stream:
// preserve native node order, expose public blocks, and insert each card at its
// immutable tool-call node. No generated/model-provided anchor is trusted.
export function conversationComponentRenderFlow(flow,nodeStore,sessionId,readTurn=conversationComponentNodeTurn){
 const anchors=conversationComponentReceiptAnchors(flow,nodeStore,sessionId,readTurn)
 if(!anchors.size)return flow
 const scopes=new Map(),componentScopes=new Set();let scope=0
 for(const entry of flow??[]){
  const node=entry.kind==='node'?nodeStore?.get?.(entry.key):null
  if(entry.kind==='pending-steering'||['user','steering'].includes(node?.kind))scope++
  scopes.set(entry,scope)
  for(const key of entry.kind==='execution'?entry.nodeKeys??[]:entry.kind==='node'?[entry.key]:[]){
   for(const manifest of anchors.get(key)??[])componentScopes.add(scope+':'+manifest.turnId)
  }
 }
 const result=[],rendered=new Set()
 const publicStep=node=>node?.kind==='assistant-step'&&node.data?.blocks?.some(block=>block?.kind==='image'||block?.kind==='text'&&typeof block.text==='string'&&block.text.trim())
 const cards=key=>{for(const manifest of anchors.get(key)??[]){if(rendered.has(manifest.componentId))continue;rendered.add(manifest.componentId);result.push({kind:'conversation-component',key:'conversation-component:'+manifest.componentId,manifests:[manifest]})}}
 for(const entry of flow??[]){
  const ownScope=scopes.get(entry)
  if(entry.kind==='execution'&&(componentScopes.has(ownScope+':'+entry.turn)||entry.nodeKeys?.some(key=>anchors.has(key)))){
   let keys=[]
   const flush=()=>{if(!keys.length)return;const nodeKeys=keys;keys=[];const running=Boolean(entry.running&&nodeKeys.some(key=>{const node=nodeStore?.get?.(key);return node?.kind==='tool-call'&&!node.data?.root?.kind||node?.kind==='compaction'&&node.data?.running===true||node?.data?.status==='running'}));result.push({...entry,key:entry.key+':component-segment:'+nodeKeys[0],nodeKeys,running})}
   for(const key of entry.nodeKeys??[]){
    const node=nodeStore?.get?.(key)
    if(publicStep(node)){flush();result.push({kind:'node',key,conversationComponentPublic:true})}else keys.push(key)
    if(anchors.has(key)){flush();cards(key)}
   }
   flush()
  }else{
   const node=entry.kind==='node'?nodeStore?.get?.(entry.key):null
   result.push(publicStep(node)&&componentScopes.has(ownScope+':'+readTurn(node))?{...entry,conversationComponentPublic:true}:entry)
   if(entry.kind==='node')cards(entry.key)
  }
 }
 return result
}

export function conversationComponentCopyAllowed(root,event){
 const doc=root?.ownerDocument,active=doc?.activeElement,target=event.target
 if(!root?.isConnected||root.dataset.selected!=='true'||!root.contains(active))return false
 if(doc.getSelection?.()?.toString())return false
 const blocked='input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),iframe,[role=menu],[role=dialog],[data-conversation-component-menu]'
 return !active?.closest?.(blocked)&&!target?.closest?.(blocked)
}
export function installConversationComponentCopy(root,copy){
 const doc=root.ownerDocument;let lastKey=-Infinity
 const onKey=event=>{if(event.defaultPrevented||event.altKey||!(event.metaKey||event.ctrlKey)||event.key?.toLowerCase()!=='c'||!conversationComponentCopyAllowed(root,event))return;event.preventDefault();lastKey=Date.now();void copy()}
 const onCopy=event=>{if(event.defaultPrevented||!conversationComponentCopyAllowed(root,event))return;event.preventDefault();if(Date.now()-lastKey<150)return;void copy()}
 doc.addEventListener('keydown',onKey,true);doc.addEventListener('copy',onCopy,true)
 return()=>{doc.removeEventListener('keydown',onKey,true);doc.removeEventListener('copy',onCopy,true)}
}
export function conversationComponentError(error){return String(error?.message??error??'组件操作失败，请重试。').replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/,'').replace(/^Error:\s*/,'')}

export function ConversationComponentCard({sessionId,manifest}){
 const {jsx,jsxs}=react_jsx_runtime,root=react.useRef(null),menuRef=react.useRef(null),current=react.useRef(null),scope=react.useRef(0),mutating=react.useRef(false),tableColumns=react.useRef(new Map()),[view,setView]=react.useState(null),[selected,setSelected]=react.useState(false),[menu,setMenu]=react.useState(false),[indices,setIndices]=react.useState(false),[notice,setNotice]=react.useState(null),[busy,setBusy]=react.useState(false),[height,setHeight]=react.useState(null),[visible,setVisible]=react.useState(true),[theme,setTheme]=react.useState(()=>document.body.hasAttribute('data-ds-dark-theme')?'dark':'light')
 const bridge=window.dshDesktop?.conversationComponents,componentId=manifest.componentId
 const menuCapabilities=react.useRef(undefined),[renameOpen,setRenameOpen]=react.useState(false),[dataOpen,setDataOpen]=react.useState(false),reading=eworkComponentSurfaceUi.useReading(root)
 if(view?.menuCapabilities)menuCapabilities.current=view.menuCapabilities
 const canCopy=typeof bridge?.copy==='function'&&menuCapabilities.current?.copy!==false,canSave=typeof bridge?.saveLibrary==='function'&&menuCapabilities.current?.saveLibrary!==false&&view?.readOnly!==true,canUpdate=typeof bridge?.updateNativeSpec==='function'&&view?.readOnly!==true,canQuery=typeof bridge?.queryNative==='function',canReference=typeof bridge?.reference==='function'&&typeof conversationComponentInputs?.inputHub?.shell==='function'&&conversationComponentInputs?.sessions?.list?.getSnapshot?.()?.current===sessionId
 // Account state only invalidates displayed content; Host still owns authorization.
 const ownerKey=react.useSyncExternalStore(listener=>sherlockBoardsAdapter?.subscribe?.(listener)??(()=>{}),()=>{const account=sherlockBoardsAdapter?.getState?.()?.account;return JSON.stringify([account?.generation,account?.user?.userId])})
 const binding=react.useSyncExternalStore(react.useCallback(listener=>componentDataStatusStore.subscribe(sessionId,componentId,listener,'conversation'),[sessionId,componentId]),react.useCallback(()=>componentDataStatusStore.read(sessionId,componentId,'conversation'),[sessionId,componentId]))
 react.useEffect(()=>{const observer=new MutationObserver(()=>setTheme(document.body.hasAttribute('data-ds-dark-theme')?'dark':'light'));observer.observe(document.body,{attributes:true,attributeFilter:['data-ds-dark-theme']});return()=>observer.disconnect()},[])
 current.current=view
 react.useEffect(()=>{
  const own=++scope.current;reading.close();setRenameOpen(false);setDataOpen(false);menuCapabilities.current=undefined;current.current=null;setView(null);setSelected(false);setMenu(false);setIndices(false);setNotice(null);setHeight(null);mutating.current=false;tableColumns.current.clear()
  if(manifest.sessionId!==sessionId)return
  Promise.resolve().then(()=>{if(typeof bridge?.read!=='function')throw Error('组件服务暂不可用');return bridge.read({sessionId,componentId})}).then(next=>{if(scope.current===own){if(next?.id!==componentId||next.sessionId!==sessionId)throw Error('组件身份不一致');current.current=next;setView(next)}}).catch(error=>{if(scope.current===own)setNotice({error:true,text:conversationComponentError(error)})})
  return()=>{scope.current++}
 },[sessionId,componentId,bridge,ownerKey])
 const notify=(text,error=false)=>setNotice({text,error})
 const menuEpoch=react.useRef(0),menuPending=react.useRef(false),closeMenu=()=>{menuEpoch.current++;menuPending.current=false;setMenu(false)}
 const openMenu=async()=>{if(menu||menuPending.current){closeMenu();return}const own=scope.current,ticket=++menuEpoch.current,owner=eworkComponentSurfaceUi.captureMenuOwner(root.current?.querySelector('[data-conversation-action=more]'));menuPending.current=true;const active=()=>scope.current===own&&ticket===menuEpoch.current&&owner.current();try{const next=await bridge.read({sessionId,componentId});if(!active())return;if(next?.id!==componentId||next.sessionId!==sessionId||next.revision<(current.current?.revision??0))throw Error('组件已变化，请重新打开菜单。');if(next.menuCapabilities)menuCapabilities.current=next.menuCapabilities;current.current=next;setView(next);setMenu(true)}catch(error){if(active())notify(conversationComponentError(error),true)}finally{owner.dispose();if(ticket===menuEpoch.current)menuPending.current=false}}
 const html=view?.node?.containerSpec?.type==='html'?view.node.containerSpec.html:undefined
 const htmlHost=react.useMemo(()=>{
  if(typeof html!=='string')return null
  const own=scope.current
  return createConversationHtmlInteraction({bridge,sessionId,componentId,html,initial:view.node.config,read:()=>current.current,update:next=>{current.current=next;setView(next)},current:()=>scope.current===own,createJournal:eworkCreateNoteHtmlInteraction,createShared:eworkCreateNoteHtmlSharedState,status:(state,error)=>{if(scope.current!==own)return;setNotice(state==='error'?{error:true,text:conversationComponentError(error)}:{error:false,text:state==='saving'?'正在保存交互…':'交互已保存'})}})
 },[bridge,sessionId,componentId,ownerKey,html])
 const journalState=react.useSyncExternalStore(htmlHost?.bridge.subscribe??(()=>()=>{}),htmlHost?.bridge.snapshot??(()=>undefined)),sharedState=react.useSyncExternalStore(htmlHost?.sharedBridge.subscribe??(()=>()=>{}),htmlHost?.sharedBridge.snapshot??(()=>undefined))
 react.useLayoutEffect(()=>{htmlHost?.observe(view?.node?.config)},[htmlHost,view?.node?.config])
 react.useEffect(()=>()=>htmlHost?.dispose(),[htmlHost])
 // The regular HTML callback grows a canvas card and includes its chrome.
 // Conversation uses the existing sandbox's intrinsic content measurement,
 // including shrink, without changing the document or its persisted node.
 react.useLayoutEffect(()=>{
  if(typeof html!=='string')return
  const host=root.current,own=scope.current
  const receive=event=>{
   const live=current.current,frame=host?.querySelector('iframe[data-research-html-artifact]'),data=event.data
   if(scope.current!==own||!host?.isConnected||!frame?.isConnected||event.source!==frame.contentWindow||live?.id!==componentId||live.sessionId!==sessionId||live.node?.containerSpec?.html!==html)return
   if(!data||typeof data!=='object'||Array.isArray(data)||data.type!=='sherlock-workbench-content-size'||![3,4].includes(Object.keys(data).length)||!Object.hasOwn(data,'width')||!Object.hasOwn(data,'height')||Object.keys(data).length===4&&data.intrinsicMetrics!==true&&data.intrinsicTable!==true||!Number.isInteger(data.width)||data.width<1||data.width>2400||!Number.isInteger(data.height)||data.height<1||data.height>12000)return
   setHeight(previous=>previous===data.height?previous:data.height)
  }
  window.addEventListener('message',receive)
  return()=>window.removeEventListener('message',receive)
 },[sessionId,componentId,ownerKey,html])
 const action=async name=>{
  const live=current.current,method={copy:'copy',save:'saveLibrary',reference:'reference'}[name]
  if(!live||live.id!==componentId||live.sessionId!==sessionId||!method||typeof bridge?.[method]!=='function'||name==='reference'&&!canReference){notify('当前组件操作不可用。',true);return}
  const own=scope.current,target={sessionId,componentId};setBusy(true);setNotice(null)
  try{
   if(name==='copy'){const result=await bridge.copy(target);if(!result?.ok)throw Error(result?.error||'复制失败，请重试。');if(scope.current===own)notify('已复制组件，可粘贴到研究或笔记。')}
   else if(name==='save'){const saved=await bridge.saveLibrary(target);if(typeof saved?.id!=='string'||!saved.id)throw Error('组件库未返回保存确认。');if(scope.current===own){window.dispatchEvent(new CustomEvent('ework-component-library-changed'));window.dispatchEvent(new CustomEvent('ework-component-library-saved',{detail:{sessionId}}));notify('已添加至组件库')}}
   else if(name==='reference'){
    const deps=conversationComponentInputs
    if(deps?.sessions?.list?.getSnapshot?.()?.current!==sessionId)throw Error('请回到组件所在会话后引用，原草稿已保留。')
    const shell=deps.inputHub.shell(sessionId),input=document.querySelector('textarea.uV2eYG_input')
    await insertConversationComponentReference({bridge,sessionId,componentId,shell,input,isCurrent:()=>scope.current===own&&deps.sessions.list.getSnapshot().current===sessionId});if(scope.current===own)notify('已加入当前输入框')
   }
   if(scope.current===own)setMenu(false)
  }catch(error){if(scope.current===own)notify(conversationComponentError(error),true)}finally{if(scope.current===own)setBusy(false)}
 }
 const copyRef=react.useRef(null);copyRef.current=()=>action('copy')
 react.useEffect(()=>root.current&&canCopy?installConversationComponentCopy(root.current,()=>copyRef.current?.()):undefined,[sessionId,componentId,Boolean(view),canCopy])
 react.useLayoutEffect(()=>root.current?installWorkbenchTableColumns(root.current,{load:(_owner,index,labels)=>tableColumns.current.get(JSON.stringify([index,labels])),save:(_owner,index,labels,state)=>tableColumns.current.set(JSON.stringify([index,labels]),state)}):undefined,[sessionId,componentId,Boolean(view)])
 react.useEffect(()=>{const Observer=window.IntersectionObserver;if(!root.current||typeof Observer!=='function')return;const observer=new Observer(entries=>setVisible(entries[0]?.isIntersecting!==false));observer.observe(root.current);return()=>observer.disconnect()},[sessionId,componentId,Boolean(view)])
 react.useEffect(()=>{
  const outside=e=>{if(!root.current?.contains(e.target)&&!root.current?.contains(e.target?.closest?.('[data-component-menu-surface]')?.__eworkMenuTrigger)){setSelected(false);setMenu(false)}},other=e=>{if(e.detail!==root.current)setSelected(false)},key=e=>{if(e.key==='Escape'){setMenu(false);setIndices(false);if(root.current?.contains(e.target))root.current.focus({preventScroll:true})}}
  document.addEventListener('pointerdown',outside,true);document.addEventListener('sherlock:conversation-component-select',other);document.addEventListener('keydown',key)
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('sherlock:conversation-component-select',other);document.removeEventListener('keydown',key)}
 },[sessionId,componentId])
 react.useEffect(()=>{if(menu)menuRef.current?.querySelector('button')?.focus({preventScroll:true})},[menu])
 const revision=view?.revision
 const pptx=useComponentPptxMode(root,Boolean(view))
 const dataProvider=react.useMemo(()=>({request:async query=>{
  if(typeof bridge?.queryNative!=='function')throw Error('当前组件数据服务不可用。')
  const own=scope.current,input={sessionId,componentId,expectedRevision:revision,query};let result
  try{
   result=await bridge.queryNative(input)
   const usable=query.action==='quotes'?result?.quotes?.some(row=>Number.isFinite(row.price)):query.action==='history'?result?.bars?.length:query.action==='news'?result?.news?.length:result?.announcements?.length
   const failure=result?.error||(result?.errors??[]).map(row=>row.error||row.message||'获取失败').join('；')
   if(failure&&!usable)throw Error(String(failure))
  }catch(error){
   if(scope.current!==own||current.current?.revision!==revision||typeof bridge.readNativeSnapshot!=='function')throw error
   let snapshot;try{snapshot=await bridge.readNativeSnapshot(input)}catch{throw error}
   if(scope.current!==own||current.current?.revision!==revision||snapshot?.specRevision!==revision||!Number.isFinite(snapshot.receivedAt)||!snapshot.result||typeof snapshot.result!=='object'||Array.isArray(snapshot.result))throw error
   result={...snapshot.result,stale:true,error:'刷新失败，保留上次数据：'+conversationComponentError(error)}
  }
  if(scope.current===own)try{const latest=await bridge.read({sessionId,componentId});if(scope.current===own&&current.current?.revision===revision&&latest.revision===revision){current.current=latest;setView(latest)}}catch{/* The verified query result remains usable if a later metadata read fails. */}
  return result
 }}),[bridge,sessionId,componentId,revision])
 const save=(expected,next)=>{
  const before=current.current,parsed=financialWidgetSpec(next)
  if(typeof bridge?.updateNativeSpec!=='function'||mutating.current||!before||before.id!==componentId||before.sessionId!==sessionId||!parsed||parsed.widget!==before.node.containerSpec.widget||JSON.stringify(expected)!==JSON.stringify(before.node.containerSpec))return false
  const own=scope.current;mutating.current=true;setNotice(null)
  void bridge.updateNativeSpec({sessionId,componentId,expectedRevision:before.revision,spec:parsed}).then(latest=>{if(scope.current===own){current.current=latest;setView(latest)}}).catch(error=>{if(scope.current===own)notify(conversationComponentError(error),true)}).finally(()=>{if(scope.current===own)mutating.current=false})
  return true
 }
 const refresh=async()=>{if(busy||typeof bridge?.queryNative!=='function'||current.current?.id!==componentId||current.current?.sessionId!==sessionId)return;const own=scope.current;setBusy(true);try{const native=root.current?.querySelector('[data-financial-widget]');if(typeof native?.__eworkRefreshFinancial!=='function')throw Error('组件尚未就绪');const result=await native.__eworkRefreshFinancial();if(result?.error)throw Error(result.error);if(scope.current===own)notify(result?.message||'已刷新数据')}catch(error){if(scope.current===own)notify(conversationComponentError(error),true)}finally{if(scope.current===own)setBusy(false)}}
 const componentTheme=['light','dark','enterprise','openterminal'].includes(view?.node?.componentTheme)?view.node.componentTheme:theme
 eworkComponentSurfaceUi.useComponentTheme(root,componentTheme,!!view)
 if(!view)return notice?jsx('div',{role:'alert',className:'ew-conversation-component-notice',children:notice.text}):null
 const node=view.node,spec=node.containerSpec,native=spec.type==='financial-widget',derived=['summary','mind-map'].includes(spec.type)&&spec.source
 // A detached derived snapshot has no canvas editor/focus adapter. Reuse the
 // native markdown/mind-map body and expose its provided source as read-only.
 const bodyNode=derived?{...node,containerSpec:{...spec,type:spec.type==='summary'?'markdown':'mind-map',source:undefined}}:node
 const select=e=>{if(e.button!==0||e.target.closest?.('button,input,textarea,select,a,[contenteditable],iframe,[role=menu]'))return;if(e.target!==root.current&&!e.target.closest?.('.ew-conversation-component-header'))return;document.dispatchEvent(new CustomEvent('sherlock:conversation-component-select',{detail:root.current}));setSelected(true);root.current.focus({preventScroll:true})}
 const refreshing=busy||binding?.status==='refreshing'
 const button=(name,label,handler,icon=name)=>jsx('button',{type:'button','data-conversation-action':name,...(name==='refresh'?{'data-conversation-component-refresh':componentId}:{}),'aria-label':label,title:label,'aria-haspopup':name==='more'?'menu':undefined,'aria-expanded':name==='more'?menu:undefined,'aria-busy':name==='refresh'&&refreshing||undefined,'data-busy':name==='refresh'&&refreshing||undefined,disabled:name==='refresh'?refreshing:busy,onClick:handler,children:jsx(WorkbenchIcon,{name:icon})})
 const openData=()=>{reading.close();if(native){requestAnimationFrame(()=>root.current?.querySelector('.ew-financial-provenance')?.click())}else setDataOpen(true)}
 const exportContent=async format=>{const live=current.current,own=scope.current;if(!live||typeof bridge?.exportContent!=='function'||menuCapabilities.current?.exportContent===false)throw Error('组件导出当前不可用。');const result=await exportWorkbenchContent(root.current,live.node,format,{body:root.current.querySelector('.ew-conversation-component-body'),save:request=>{if(scope.current!==own||current.current?.revision!==live.revision)throw Error('组件已变化，请重新导出。');const{kind,format,content,base64}=request;return bridge.exportContent({sessionId,componentId,expectedRevision:live.revision,kind,format,...kind==='text'?{content}:{base64}})}});if(scope.current===own&&result?.status==='saved')notify('已导出组件');return result}
 const rename=async title=>{const live=current.current,own=scope.current;if(!live||live.readOnly===true||typeof bridge?.rename!=='function'||menuCapabilities.current?.rename===false)throw Error('组件当前不可重命名。');const next=await bridge.rename({sessionId,componentId,expectedRevision:live.revision,title});if(scope.current!==own)throw Error('组件宿主已变化，确认已取消。');current.current=next;setView(next);notify('名称已保存')}
 const changeTheme=async theme=>{const own=scope.current;if(mutating.current)throw Error('组件正在保存，请稍后重试。');mutating.current=true;const write=async()=>{const live=current.current;if(scope.current!==own||!live||live.readOnly===true||typeof bridge?.setTheme!=='function'||menuCapabilities.current?.theme===false)throw Error('组件模式当前不可修改。');const next=await bridge.setTheme({sessionId,componentId,expectedRevision:live.revision,theme});if(scope.current!==own||next?.id!==componentId||next.sessionId!==sessionId)throw Error('组件宿主已变化，确认已取消。');current.current=next;setView(next);notify('组件模式已保存')};try{if(htmlHost)await htmlHost.commitPresentation(write);else await write()}finally{if(scope.current===own)mutating.current=false}}
 const menuActions=[typeof bridge?.setTheme==='function'&&eworkComponentSurfaceUi.themeAction(node.componentTheme,changeTheme,view.readOnly===true||menuCapabilities.current?.theme===false,theme),{id:'expand',icon:'expand',label:'放大阅读',run:reading.toggle},canCopy&&{id:'copy',icon:'duplicate',label:'复制组件',run:()=>action('copy')},typeof bridge?.rename==='function'&&menuCapabilities.current?.rename!==false&&view.readOnly!==true&&{id:'rename',icon:'rename',label:'重命名',run:()=>{reading.close();setRenameOpen(true)}},canSave&&{id:'library',icon:'library-add',label:'添加至组件库',run:()=>action('save')},typeof bridge?.exportContent==='function'&&menuCapabilities.current?.exportContent!==false&&{id:'export',icon:'download',label:'导出',children:['svg','png','jpg'].map(format=>({id:format,label:format.toUpperCase(),run:()=>exportContent(format)}))},{id:'data',icon:'data',label:'数据源与自动更新',run:openData},pptx?.editable&&{id:'pptx-mode',icon:'edit',label:pptx.mode==='edit'?'关闭编辑模式':'编辑',disabled:pptx.modeBusy,run:()=>pptx.toggleMode()},native&&canUpdate&&spec.widget==='indices'&&{id:'indices',icon:'settings',label:'配置指数',run:()=>{reading.close();setIndices(true)}}]
 const contentHeight=spec.type==='html'?Math.max(48,height??Math.min(480,Math.max(160,node.height??320))):undefined
 const provenance=view.provenance??{},source=provenance.sourceNames?.length?provenance.sourceNames.join('、'):'来源未提供'
 const hasMenu=true
 return jsxs('section',{ref:root,tabIndex:0,'aria-label':node.displayName||node.title||'对话组件','data-conversation-component-id':componentId,'data-research-node-id':componentId,'data-selected':selected?'true':undefined,'data-financial-theme':componentTheme,'data-workbench-style':componentTheme,className:'ew-conversation-component',onPointerDown:select,onFocus:e=>{if(e.target===e.currentTarget){document.dispatchEvent(new CustomEvent('sherlock:conversation-component-select',{detail:root.current}));setSelected(true)}},children:[
  jsxs('header',{className:'ew-grid-header ew-conversation-component-header',children:[native&&canQuery&&button('refresh','刷新组件',refresh,'refresh'),jsxs('span',{className:'ew-conversation-component-title',children:[jsx(WorkbenchTitle,{title:node.displayName||node.title||'组件'}),native&&['quote','announcements'].includes(spec.widget)&&jsx(FinancialQuoteSelector,{node,sessionId,readOnly:!canUpdate,onSpecChange:canUpdate?save:undefined}),native&&spec.widget==='news'&&jsx(FinancialNewsSearch,{node,sessionId,surface:'conversation',readOnly:!canUpdate,onSpecChange:canUpdate?save:undefined})]}),canReference&&button('reference','引用到对话',()=>action('reference'),'ask'),hasMenu&&button('more','组件更多操作',()=>void openMenu(),'more')]}),
  menu&&jsx(eworkComponentSurfaceUi.Menu,{surface:'conversation',trigger:root.current?.querySelector('[data-conversation-action=more]'),actions:menuActions,onClose:closeMenu}),
  renameOpen&&jsx(eworkComponentSurfaceUi.Rename,{title:node.displayName||node.title||'组件',onRename:rename,onClose:()=>setRenameOpen(false)}),
  dataOpen&&jsx(eworkComponentSurfaceUi.Data,{title:node.displayName||node.title,provenance:view.provenance,onClose:()=>setDataOpen(false)}),reading.control,
  jsx('div',{className:'rScV5Q_containerBody rScV5Q_containerContent ew-conversation-component-body','data-conversation-content':spec.type,style:{height:contentHeight},children:native?jsx(FinancialWidget,{node,sessionId,visible,surface:'conversation',dataProvider:canQuery?dataProvider:undefined,onSpecChange:canUpdate?save:undefined}):htmlHost?jsx(eworkNoteHtmlInteractionContext.Provider,{value:{surface:'conversation',bridge:htmlHost.bridge,state:journalState,sharedBridge:htmlHost.sharedBridge,sharedState,readOnly:view.readOnly===true||typeof bridge?.commitHtmlInteraction!=='function'},children:jsx(ResearchContainerContent,{node:bodyNode,sessionId,visible:true,preserveHeading:true,onHtmlSize:()=>false})}):jsx(ResearchContainerContent,{node:bodyNode,sessionId,visible:true,preserveHeading:true,onHtmlSize:()=>false})}),
  derived&&jsxs('details',{className:'ew-conversation-component-source',children:[jsx('summary',{children:spec.source.title||'来源原文'}),jsx('pre',{children:spec.source.text})]}),
  !native&&jsxs('footer',{className:'ew-conversation-component-footer',children:[jsx('span',{children:source}),provenance.dataAsOf&&jsx('span',{children:'数据时点：'+provenance.dataAsOf}),provenance.fetchedAt&&jsx('time',{dateTime:new Date(provenance.fetchedAt).toISOString(),children:'获取：'+new Date(provenance.fetchedAt).toLocaleString('zh-CN',{hour12:false})})]}),
  notice&&jsx('div',{role:notice.error?'alert':'status','aria-live':'polite',className:'ew-conversation-component-notice',children:notice.text}),indices&&canUpdate&&jsx(FinancialIndicesSettings,{node,sessionId,rootRef:root,readOnly:false,onClose:()=>setIndices(false),onChange:save})
 ]})
}
export function ConversationComponentsReply({sessionId,manifests}){
 const key='conversation-component:'+manifests.map(manifest=>manifest.componentId).join(':')
 return react_jsx_runtime.jsx('div',{className:'ew-conversation-components-reply','data-chat-anchor-key':key,'data-chat-flow-key':key,'data-chat-flow-kind':'conversation-component',children:manifests.map(manifest=>react_jsx_runtime.jsx(ConversationComponentCard,{sessionId,manifest},sessionId+':'+manifest.componentId))})
}

export function stripConversationComponents(source){
 const markers=['/* ework:conversation-components:v1 */','/* ework:conversation-components:v2 */'].filter(marker=>source.includes(marker)),owned=['function ConversationComponentCard(','function ConversationComponentsReply(','conversationComponentSessionId:id']
 if(!markers.length){if(owned.some(anchor=>source.includes(anchor)))throw Error('Conversation component partial installed anchor drifted');return source}
 if(markers.length!==1)throw Error('Conversation component installed version anchor ambiguous')
 const marker=markers[0],streaming=marker.includes(':v2 ')
 for(const anchor of [marker,...owned])if(source.split(anchor).length!==2)throw Error('Conversation component installed anchor missing or ambiguous: '+anchor)
 const tail='const renderedWorkbenchEntry=renderWorkbenchEntry(),receiptPlans=workbenchReceiptAnchors.get(entry.key);return receiptPlans?.length ? [renderedWorkbenchEntry,react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:receiptPlans,footer:true},sessionId+":workbench:"+entry.key)] : [renderedWorkbenchEntry];'
 const installedTail='const renderedWorkbenchEntry=renderWorkbenchEntry(),receiptPlans=workbenchReceiptAnchors.get(entry.key),componentManifests=conversationComponentAnchors.get(entry.key);return [...(receiptPlans?.length ? [renderedWorkbenchEntry,react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:receiptPlans,footer:true},sessionId+":workbench:"+entry.key)] : [renderedWorkbenchEntry]),...(componentManifests?.length?[react_jsx_runtime.jsx(ConversationComponentsReply,{sessionId,manifests:componentManifests},sessionId+":components:"+entry.key)]:[])];'
 const replacements=[...(streaming?[
  ['const conversationComponentChat=useSession(snapshot=>snapshot.chat);const conversationComponentFlow=react.useMemo(()=>conversationComponentRenderFlow(renderFlow,nodeStore,sessionId,conversationNodeTurn),[renderFlow,nodeStore,sessionId,conversationComponentChat]);\n',''],
  ['conversationComponentFlow.flatMap((entry) => {const renderWorkbenchEntry=()=>{if(entry.kind==="conversation-component")return react_jsx_runtime.jsx(ConversationComponentsReply,{sessionId,manifests:entry.manifests},entry.key);','renderFlow.flatMap((entry) => {const renderWorkbenchEntry=()=>{'],
  ['nodeKey: entry.key, conversationComponentPublic:entry.conversationComponentPublic===true,\n','nodeKey: entry.key,\n'],
  ['function ChatNodeSeat({ nodeKey, conversationComponentPublic=false,','function ChatNodeSeat({ nodeKey,'],
  ['const conversationComponentNode = useSession((snapshot) => snapshot.chat.nodes.get(nodeKey));\nconst node=react.useMemo(()=>conversationComponentPublic&&conversationComponentNode?.kind==="assistant-step"?{...conversationComponentNode,data:{...conversationComponentNode.data,blocks:conversationComponentNode.data.blocks.filter(block=>block.kind==="text"||block.kind==="image")}}:conversationComponentNode,[conversationComponentNode,conversationComponentPublic]);','const node = useSession((snapshot) => snapshot.chat.nodes.get(nodeKey));'],
  [tail,tail]
 ]:[
  ['const conversationComponentAnchors=conversationComponentReceiptAnchors(renderFlow,nodeStore,sessionId,conversationNodeTurn);\n',''],
  [installedTail,tail]
 ]),
  ['function projectUserText(text, openFile) {\nconst componentProjection=projectConversationComponentUserText(text,openFile);if(componentProjection!==null)return componentProjection;','function projectUserText(text, openFile) {'],
  ['const inputHub = new InputHub(ctx, t, researchWorkspaces);\nctx.effect(()=>{const binding={inputHub,sessions};conversationComponentInputs=binding;return()=>{if(conversationComponentInputs===binding)conversationComponentInputs=null}},"Conversation component input binding");','const inputHub = new InputHub(ctx, t, researchWorkspaces);'],
  ['\ninputScope.effect(() => inputScope.inputTriggers.registerSource(conversationComponentReferenceSource()), "ui-conversation: Conversation component references");',''],
  ['const shell = new SessionInputShell({\n\t\t\t\t\tactx, conversationComponentSessionId:id,','const shell = new SessionInputShell({\n\t\t\t\t\tactx,'],
  ['text: await (o.source==="conversation-component"?serializeConversationComponentReference(o.ref,controller.signal,this.deps.conversationComponentSessionId):inputTriggers.serializeReference(o.source, o.ref, controller.signal))','text: await inputTriggers.serializeReference(o.source, o.ref, controller.signal)']
 ]
 for(const [installed,native] of replacements){if(source.split(installed).length!==2)throw Error('Conversation component installed anchor missing or ambiguous: '+installed.slice(0,90));source=source.replace(installed,native)}
 const start=source.indexOf(marker),end=source.indexOf('const ExecutionStatusGroup =',start)
 if(end<0)throw Error('Conversation component helper boundary anchor missing')
 return source.slice(0,start)+source.slice(end)
}

export function patchConversationComponents(source){
 source=patchComponentSurfaceMenu(source)
 const marker='/* ework:conversation-components:v2 */'
 source=stripConversationComponents(source)
 const exact=(before,after)=>{if(source.split(before).length!==2)throw Error('Conversation component anchor missing or ambiguous: '+before.slice(0,100));source=source.replace(before,after)}
 const modeHelpers=source.includes('function useComponentPptxMode(')?[]:[componentPptxModeHost,useComponentPptxMode]
 const helpers=[...modeHelpers,parseConversationComponentManifest,parseConversationComponentReference,...Object.values(references),conversationComponentNodeTurn,conversationComponentReceiptManifests,conversationComponentReceiptAnchors,conversationComponentRenderFlow,conversationComponentCopyAllowed,installConversationComponentCopy,conversationComponentError,createConversationHtmlInteraction,ConversationComponentCard,ConversationComponentsReply].map(fn=>fn.toString()).join('\n')
 const css=readFileSync(new URL('./conversation-components.css',import.meta.url),'utf8')+'\n'+WORKBENCH_TABLE_COLUMNS_CSS.replaceAll('body ','body .ew-conversation-component ')
 exact('const ExecutionStatusGroup =',marker+'\nlet conversationComponentInputs=null;\n'+helpers+'\nif(typeof document!=="undefined"){let style=document.getElementById("ework-conversation-components-style");if(!style){style=document.createElement("style");style.id="ework-conversation-components-style";document.head.appendChild(style)}style.textContent='+JSON.stringify(css)+';}\nconst ExecutionStatusGroup =')
 const start=source.indexOf('function ChatView('),end=source.indexOf('//#region lib/types/client/contract/slots.js',start)
 if(start<0||end<0)throw Error('Conversation component ChatView anchor missing')
 let chat=source.slice(start,end)
// The SDK node store mutates in place on a live tool result. Subscribe to the
 // immutable chat snapshot so ready receipts publish before another step arrives.
 const seat='const seatProps = (0, react.useMemo)'
 if(chat.split(seat).length!==2)throw Error('Conversation component ChatView seat anchor missing')
 chat=chat.replace(seat,'const conversationComponentChat=useSession(snapshot=>snapshot.chat);const conversationComponentFlow=react.useMemo(()=>conversationComponentRenderFlow(renderFlow,nodeStore,sessionId,conversationNodeTurn),[renderFlow,nodeStore,sessionId,conversationComponentChat]);\n'+seat)
 const tail='const renderedWorkbenchEntry=renderWorkbenchEntry(),receiptPlans=workbenchReceiptAnchors.get(entry.key);return receiptPlans?.length ? [renderedWorkbenchEntry,react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:receiptPlans,footer:true},sessionId+":workbench:"+entry.key)] : [renderedWorkbenchEntry];'
 if(chat.split(tail).length!==2)throw Error('Conversation component receipt tail anchor missing')
 const flow='renderFlow.flatMap((entry) => {const renderWorkbenchEntry=()=>{',node='nodeKey: entry.key,\n'
 if(chat.split(flow).length!==2||chat.split(node).length!==2)throw Error('Conversation component render flow anchor missing or ambiguous')
 chat=chat.replace(flow,'conversationComponentFlow.flatMap((entry) => {const renderWorkbenchEntry=()=>{if(entry.kind==="conversation-component")return react_jsx_runtime.jsx(ConversationComponentsReply,{sessionId,manifests:entry.manifests},entry.key);').replace(node,'nodeKey: entry.key, conversationComponentPublic:entry.conversationComponentPublic===true,\n')
 source=source.slice(0,start)+chat+source.slice(end)
 exact('function ChatNodeSeat({ nodeKey,','function ChatNodeSeat({ nodeKey, conversationComponentPublic=false,')
 exact('const node = useSession((snapshot) => snapshot.chat.nodes.get(nodeKey));','const conversationComponentNode = useSession((snapshot) => snapshot.chat.nodes.get(nodeKey));\nconst node=react.useMemo(()=>conversationComponentPublic&&conversationComponentNode?.kind==="assistant-step"?{...conversationComponentNode,data:{...conversationComponentNode.data,blocks:conversationComponentNode.data.blocks.filter(block=>block.kind==="text"||block.kind==="image")}}:conversationComponentNode,[conversationComponentNode,conversationComponentPublic]);')
 exact('function projectUserText(text, openFile) {','function projectUserText(text, openFile) {\nconst componentProjection=projectConversationComponentUserText(text,openFile);if(componentProjection!==null)return componentProjection;')
 exact('const inputHub = new InputHub(ctx, t, researchWorkspaces);','const inputHub = new InputHub(ctx, t, researchWorkspaces);\nctx.effect(()=>{const binding={inputHub,sessions};conversationComponentInputs=binding;return()=>{if(conversationComponentInputs===binding)conversationComponentInputs=null}},"Conversation component input binding");')
 exact('inputScope.effect(() => inputScope.inputTriggers.registerSource(researchArtifactInputSource), "ui-conversation: Research inline assistant references");','inputScope.effect(() => inputScope.inputTriggers.registerSource(researchArtifactInputSource), "ui-conversation: Research inline assistant references");\ninputScope.effect(() => inputScope.inputTriggers.registerSource(conversationComponentReferenceSource()), "ui-conversation: Conversation component references");')
 exact('const shell = new SessionInputShell({\n\t\t\t\t\tactx,','const shell = new SessionInputShell({\n\t\t\t\t\tactx, conversationComponentSessionId:id,')
 exact('text: await inputTriggers.serializeReference(o.source, o.ref, controller.signal)','text: await (o.source==="conversation-component"?serializeConversationComponentReference(o.ref,controller.signal,this.deps.conversationComponentSessionId):inputTriggers.serializeReference(o.source, o.ref, controller.signal))')
 return source
}
