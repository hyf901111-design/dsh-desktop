import {readFileSync} from 'node:fs'
import {WORKBENCH_TABLE_COLUMNS_CSS} from '../../packages/dsh-research-task-runtime/workbench-table-columns.js'
import {parseConversationComponentManifest,parseConversationComponentReference} from '../../packages/dsh-research-task-runtime/conversation-component-contract.js'
import * as references from './conversation-component-reference.mjs'
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
   if(Array.isArray(root.subCalls))pending.push(...root.subCalls)
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
 const anchors=new Map(),owners=new Map(),tails=new Map(),scopes=new Map();let scope=0
 for(const entry of flow??[]){
  const node=entry.kind==='node'?nodeStore?.get?.(entry.key):null
  if(entry.kind==='pending-steering'||['user','steering'].includes(node?.kind))scope++
  scopes.set(entry.key,scope)
  if(entry.kind!=='execution'&&!['assistant-step','turn-tail','turn-error','turn-max-tokens'].includes(node?.kind))continue
  if(entry.kind==='execution'&&!entry.nodeKeys?.length)continue
  const turn=entry.kind==='execution'?entry.turn:readTurn(node)
  if(turn==null)continue
  const group=tails.get(scope)??new Map();group.set(String(turn),entry.key);tails.set(scope,group)
 }
 for(const entry of flow??[]){
  const nodes=(entry.kind==='execution'?entry.nodeKeys:entry.kind==='node'?[entry.key]:[]).map(key=>nodeStore?.get?.(key))
  for(const manifest of conversationComponentReceiptManifests(nodes,sessionId,readTurn)){
   if(entry.kind==='execution'&&entry.turn!=null&&manifest.turnId!==String(entry.turn))continue
   if(owners.has(manifest.componentId))continue
   const anchor=tails.get(scopes.get(entry.key))?.get(manifest.turnId)??entry.key,items=anchors.get(anchor)??[]
   owners.set(manifest.componentId,anchor);items.push(manifest);anchors.set(anchor,items)
  }
 }
 return anchors
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
 // Account state only invalidates displayed content; Host still owns authorization.
 const ownerKey=react.useSyncExternalStore(listener=>sherlockBoardsAdapter?.subscribe?.(listener)??(()=>{}),()=>{const account=sherlockBoardsAdapter?.getState?.()?.account;return JSON.stringify([account?.generation,account?.user?.userId])})
 const binding=react.useSyncExternalStore(react.useCallback(listener=>componentDataStatusStore.subscribe(sessionId,componentId,listener),[sessionId,componentId]),react.useCallback(()=>componentDataStatusStore.read(sessionId,componentId),[sessionId,componentId]))
 react.useEffect(()=>{const observer=new MutationObserver(()=>setTheme(document.body.hasAttribute('data-ds-dark-theme')?'dark':'light'));observer.observe(document.body,{attributes:true,attributeFilter:['data-ds-dark-theme']});return()=>observer.disconnect()},[])
 current.current=view
 react.useEffect(()=>{
  const own=++scope.current;current.current=null;setView(null);setSelected(false);setMenu(false);setIndices(false);setNotice(null);setHeight(null);mutating.current=false;tableColumns.current.clear()
  if(manifest.sessionId!==sessionId)return
  Promise.resolve().then(()=>{if(typeof bridge?.read!=='function')throw Error('组件服务暂不可用');return bridge.read({sessionId,componentId})}).then(next=>{if(scope.current===own){if(next?.id!==componentId||next.sessionId!==sessionId)throw Error('组件身份不一致');current.current=next;setView(next)}}).catch(error=>{if(scope.current===own)setNotice({error:true,text:conversationComponentError(error)})})
  return()=>{scope.current++}
 },[sessionId,componentId,bridge,ownerKey])
 const notify=(text,error=false)=>setNotice({text,error})
 const action=async name=>{
  const own=scope.current,target={sessionId,componentId};setBusy(true);setNotice(null)
  try{
   if(name==='copy'){const result=await bridge.copy(target);if(!result?.ok)throw Error(result?.error||'复制失败，请重试。');if(scope.current===own)notify('已复制组件，可粘贴到研究或笔记。')}
   else if(name==='save'){await bridge.saveLibrary(target);if(scope.current===own){window.dispatchEvent(new CustomEvent('ework-component-library-changed'));window.dispatchEvent(new CustomEvent('ework-component-library-saved',{detail:{sessionId}}));notify('已添加至组件库')}}
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
 react.useEffect(()=>root.current?installConversationComponentCopy(root.current,()=>copyRef.current?.()):undefined,[sessionId,componentId,Boolean(view)])
 react.useLayoutEffect(()=>root.current?installWorkbenchTableColumns(root.current,{load:(_owner,index,labels)=>tableColumns.current.get(JSON.stringify([index,labels])),save:(_owner,index,labels,state)=>tableColumns.current.set(JSON.stringify([index,labels]),state)}):undefined,[sessionId,componentId,Boolean(view)])
 react.useEffect(()=>{const Observer=window.IntersectionObserver;if(!root.current||typeof Observer!=='function')return;const observer=new Observer(entries=>setVisible(entries[0]?.isIntersecting!==false));observer.observe(root.current);return()=>observer.disconnect()},[sessionId,componentId,Boolean(view)])
 react.useEffect(()=>{
  const outside=e=>{if(!root.current?.contains(e.target)){setSelected(false);setMenu(false)}},other=e=>{if(e.detail!==root.current)setSelected(false)},key=e=>{if(e.key==='Escape'){setMenu(false);setIndices(false);if(root.current?.contains(e.target))root.current.focus({preventScroll:true})}}
  document.addEventListener('pointerdown',outside,true);document.addEventListener('sherlock:conversation-component-select',other);document.addEventListener('keydown',key)
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('sherlock:conversation-component-select',other);document.removeEventListener('keydown',key)}
 },[sessionId,componentId])
 react.useEffect(()=>{if(menu)menuRef.current?.querySelector('button')?.focus({preventScroll:true})},[menu])
 const revision=view?.revision
 const dataProvider=react.useMemo(()=>({request:async query=>{
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
  if(mutating.current||!before||!parsed||parsed.widget!==before.node.containerSpec.widget||JSON.stringify(expected)!==JSON.stringify(before.node.containerSpec))return false
  const own=scope.current;mutating.current=true;setNotice(null)
  void bridge.updateNativeSpec({sessionId,componentId,expectedRevision:before.revision,spec:parsed}).then(latest=>{if(scope.current===own){current.current=latest;setView(latest)}}).catch(error=>{if(scope.current===own)notify(conversationComponentError(error),true)}).finally(()=>{if(scope.current===own)mutating.current=false})
  return true
 }
 const refresh=async()=>{if(busy)return;const own=scope.current;setBusy(true);try{const native=root.current?.querySelector('[data-financial-widget]');if(typeof native?.__eworkRefreshFinancial!=='function')throw Error('组件尚未就绪');const result=await native.__eworkRefreshFinancial();if(result?.error)throw Error(result.error);if(scope.current===own)notify(result?.message||'已刷新数据')}catch(error){if(scope.current===own)notify(conversationComponentError(error),true)}finally{if(scope.current===own)setBusy(false)}}
 if(!view)return notice?jsx('div',{role:'alert',className:'ew-conversation-component-notice',children:notice.text}):null
 const node=view.node,spec=node.containerSpec,native=spec.type==='financial-widget',derived=['summary','mind-map'].includes(spec.type)&&spec.source
 // A detached derived snapshot has no canvas editor/focus adapter. Reuse the
 // native markdown/mind-map body and expose its provided source as read-only.
 const bodyNode=derived?{...node,containerSpec:{...spec,type:spec.type==='summary'?'markdown':'mind-map',source:undefined}}:node
 const select=e=>{if(e.button!==0||e.target.closest?.('button,input,textarea,select,a,[contenteditable],iframe,[role=menu]'))return;if(e.target!==root.current&&!e.target.closest?.('.ew-conversation-component-header'))return;document.dispatchEvent(new CustomEvent('sherlock:conversation-component-select',{detail:root.current}));setSelected(true);root.current.focus({preventScroll:true})}
 const refreshing=busy||binding?.status==='refreshing'
 const button=(name,label,handler,icon=name)=>jsx('button',{type:'button','data-conversation-action':name,...(name==='refresh'?{'data-conversation-component-refresh':componentId}:{}),'aria-label':label,title:label,'aria-haspopup':name==='more'?'menu':undefined,'aria-expanded':name==='more'?menu:undefined,'aria-busy':name==='refresh'&&refreshing||undefined,'data-busy':name==='refresh'&&refreshing||undefined,disabled:name==='refresh'?refreshing:busy,onClick:handler,children:jsx(WorkbenchIcon,{name:icon})})
 const fixedHeight=native||['html','chart'].includes(spec.type)?Math.min(720,Math.max(native?300:180,height??node.height??420)):undefined
 const provenance=view.provenance??{},source=provenance.sourceNames?.length?provenance.sourceNames.join('、'):'来源未提供'
 return jsxs('section',{ref:root,tabIndex:0,'aria-label':node.title||'对话组件','data-conversation-component-id':componentId,'data-research-node-id':componentId,'data-selected':selected?'true':undefined,'data-financial-theme':theme,className:'ew-conversation-component',onPointerDown:select,onFocus:e=>{if(e.target===e.currentTarget){document.dispatchEvent(new CustomEvent('sherlock:conversation-component-select',{detail:root.current}));setSelected(true)}},children:[
  jsxs('header',{className:'ew-grid-header ew-conversation-component-header',children:[native&&button('refresh','刷新组件',refresh,'refresh'),jsxs('span',{className:'ew-conversation-component-title',children:[jsx(WorkbenchTitle,{title:node.title||'组件'}),native&&['quote','announcements'].includes(spec.widget)&&jsx(FinancialQuoteSelector,{node,sessionId,readOnly:false,onSpecChange:save}),native&&spec.widget==='news'&&jsx(FinancialNewsSearch,{node,sessionId,readOnly:false,onSpecChange:save})]}),button('reference','引用到对话',()=>action('reference'),'ask'),button('more','组件更多操作',()=>setMenu(value=>!value),'more')]}),
  menu&&jsxs('div',{ref:menuRef,role:'menu','aria-label':'组件更多操作','data-conversation-component-menu':'',className:'ew-conversation-component-menu',onKeyDown:e=>{const items=[...menuRef.current.querySelectorAll('button')],at=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(at+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus()}},children:[jsx('button',{type:'button',role:'menuitem','data-conversation-action':'copy',disabled:busy,onClick:()=>action('copy'),children:'复制'}),jsx('button',{type:'button',role:'menuitem','data-conversation-action':'save',disabled:busy,onClick:()=>action('save'),children:'保存到组件库'}),native&&jsx('button',{type:'button',role:'menuitem',onClick:()=>{root.current.querySelector('.ew-financial-provenance')?.click();setMenu(false)},children:'数据源与更新'}),native&&spec.widget==='indices'&&jsx('button',{type:'button',role:'menuitem',onClick:()=>{setIndices(true);setMenu(false)},children:'配置指数'})]}),
  jsx('div',{className:'rScV5Q_containerBody rScV5Q_containerContent ew-conversation-component-body',style:{height:fixedHeight},children:native?jsx(FinancialWidget,{node,sessionId,visible,surface:'conversation',dataProvider,onSpecChange:save}):jsx(ResearchContainerContent,{node:bodyNode,sessionId,visible:true,preserveHeading:true,onHtmlSize:(_id,size)=>{if(Number.isFinite(size?.height))setHeight(size.height)}})}),
  derived&&jsxs('details',{className:'ew-conversation-component-source',children:[jsx('summary',{children:spec.source.title||'来源原文'}),jsx('pre',{children:spec.source.text})]}),
  !native&&jsxs('footer',{className:'ew-conversation-component-footer',children:[jsx('span',{children:source}),provenance.dataAsOf&&jsx('span',{children:'数据时点：'+provenance.dataAsOf}),provenance.fetchedAt&&jsx('time',{dateTime:new Date(provenance.fetchedAt).toISOString(),children:'获取：'+new Date(provenance.fetchedAt).toLocaleString('zh-CN',{hour12:false})})]}),
  notice&&jsx('div',{role:notice.error?'alert':'status','aria-live':'polite',className:'ew-conversation-component-notice',children:notice.text}),indices&&jsx(FinancialIndicesSettings,{node,sessionId,rootRef:root,readOnly:false,onClose:()=>setIndices(false),onChange:save})
 ]})
}
export function ConversationComponentsReply({sessionId,manifests}){
 return react_jsx_runtime.jsx('div',{className:'ew-conversation-components-reply',children:manifests.map(manifest=>react_jsx_runtime.jsx(ConversationComponentCard,{sessionId,manifest},sessionId+':'+manifest.componentId))})
}

export function stripConversationComponents(source){
 const marker='/* ework:conversation-components:v1 */',owned=['function ConversationComponentCard(','function ConversationComponentsReply(','conversationComponentSessionId:id']
 if(!source.includes(marker)){if(owned.some(anchor=>source.includes(anchor)))throw Error('Conversation component partial installed anchor drifted');return source}
 for(const anchor of [marker,...owned])if(source.split(anchor).length!==2)throw Error('Conversation component installed anchor missing or ambiguous: '+anchor)
 const tail='const renderedWorkbenchEntry=renderWorkbenchEntry(),receiptPlans=workbenchReceiptAnchors.get(entry.key);return receiptPlans?.length ? [renderedWorkbenchEntry,react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:receiptPlans,footer:true},sessionId+":workbench:"+entry.key)] : [renderedWorkbenchEntry];'
 const installedTail='const renderedWorkbenchEntry=renderWorkbenchEntry(),receiptPlans=workbenchReceiptAnchors.get(entry.key),componentManifests=conversationComponentAnchors.get(entry.key);return [...(receiptPlans?.length ? [renderedWorkbenchEntry,react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:receiptPlans,footer:true},sessionId+":workbench:"+entry.key)] : [renderedWorkbenchEntry]),...(componentManifests?.length?[react_jsx_runtime.jsx(ConversationComponentsReply,{sessionId,manifests:componentManifests},sessionId+":components:"+entry.key)]:[])];'
 const replacements=[
  ['const conversationComponentAnchors=conversationComponentReceiptAnchors(renderFlow,nodeStore,sessionId,conversationNodeTurn);\n',''],
  [installedTail,tail],
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
 const marker='/* ework:conversation-components:v1 */'
 source=stripConversationComponents(source)
 const exact=(before,after)=>{if(source.split(before).length!==2)throw Error('Conversation component anchor missing or ambiguous: '+before.slice(0,100));source=source.replace(before,after)}
 const helpers=[parseConversationComponentManifest,parseConversationComponentReference,...Object.values(references),conversationComponentNodeTurn,conversationComponentReceiptManifests,conversationComponentReceiptAnchors,conversationComponentCopyAllowed,installConversationComponentCopy,conversationComponentError,ConversationComponentCard,ConversationComponentsReply].map(fn=>fn.toString()).join('\n')
 const css=readFileSync(new URL('./conversation-components.css',import.meta.url),'utf8')+'\n'+WORKBENCH_TABLE_COLUMNS_CSS.replaceAll('body ','body .ew-conversation-component ')
 exact('const ExecutionStatusGroup =',marker+'\nlet conversationComponentInputs=null;\n'+helpers+'\nif(typeof document!=="undefined"){let style=document.getElementById("ework-conversation-components-style");if(!style){style=document.createElement("style");style.id="ework-conversation-components-style";document.head.appendChild(style)}style.textContent='+JSON.stringify(css)+';}\nconst ExecutionStatusGroup =')
 const start=source.indexOf('function ChatView('),end=source.indexOf('//#region lib/types/client/contract/slots.js',start)
 if(start<0||end<0)throw Error('Conversation component ChatView anchor missing')
 let chat=source.slice(start,end)
 const seat='const seatProps = (0, react.useMemo)'
 if(chat.split(seat).length!==2)throw Error('Conversation component ChatView seat anchor missing')
 chat=chat.replace(seat,'const conversationComponentAnchors=conversationComponentReceiptAnchors(renderFlow,nodeStore,sessionId,conversationNodeTurn);\n'+seat)
 const tail='const renderedWorkbenchEntry=renderWorkbenchEntry(),receiptPlans=workbenchReceiptAnchors.get(entry.key);return receiptPlans?.length ? [renderedWorkbenchEntry,react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:receiptPlans,footer:true},sessionId+":workbench:"+entry.key)] : [renderedWorkbenchEntry];'
 if(chat.split(tail).length!==2)throw Error('Conversation component receipt tail anchor missing')
 chat=chat.replace(tail,'const renderedWorkbenchEntry=renderWorkbenchEntry(),receiptPlans=workbenchReceiptAnchors.get(entry.key),componentManifests=conversationComponentAnchors.get(entry.key);return [...(receiptPlans?.length ? [renderedWorkbenchEntry,react_jsx_runtime.jsx(ResearchWorkbenchProgress,{sessionId,plans:receiptPlans,footer:true},sessionId+":workbench:"+entry.key)] : [renderedWorkbenchEntry]),...(componentManifests?.length?[react_jsx_runtime.jsx(ConversationComponentsReply,{sessionId,manifests:componentManifests},sessionId+":components:"+entry.key)]:[])];')
 source=source.slice(0,start)+chat+source.slice(end)
 exact('function projectUserText(text, openFile) {','function projectUserText(text, openFile) {\nconst componentProjection=projectConversationComponentUserText(text,openFile);if(componentProjection!==null)return componentProjection;')
 exact('const inputHub = new InputHub(ctx, t, researchWorkspaces);','const inputHub = new InputHub(ctx, t, researchWorkspaces);\nctx.effect(()=>{const binding={inputHub,sessions};conversationComponentInputs=binding;return()=>{if(conversationComponentInputs===binding)conversationComponentInputs=null}},"Conversation component input binding");')
 exact('inputScope.effect(() => inputScope.inputTriggers.registerSource(researchArtifactInputSource), "ui-conversation: Research inline assistant references");','inputScope.effect(() => inputScope.inputTriggers.registerSource(researchArtifactInputSource), "ui-conversation: Research inline assistant references");\ninputScope.effect(() => inputScope.inputTriggers.registerSource(conversationComponentReferenceSource()), "ui-conversation: Conversation component references");')
 exact('const shell = new SessionInputShell({\n\t\t\t\t\tactx,','const shell = new SessionInputShell({\n\t\t\t\t\tactx, conversationComponentSessionId:id,')
 exact('text: await inputTriggers.serializeReference(o.source, o.ref, controller.signal)','text: await (o.source==="conversation-component"?serializeConversationComponentReference(o.ref,controller.signal,this.deps.conversationComponentSessionId):inputTriggers.serializeReference(o.source, o.ref, controller.signal))')
 return source
}
