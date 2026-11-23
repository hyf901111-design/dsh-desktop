import type {WebContents} from 'electron'
import {randomUUID} from 'node:crypto'
// @ts-ignore Finite DOM interaction API shared with the conversation browser.
import {createCanvasUseSurface} from '../../../packages/dsh-research-task-runtime/canvas-use-surface.js'

export type BrowserPageTarget={tabId:string;url:string;title:string;webContents:WebContents}
export type BrowserPageText={ref:string;text:string;tag:string}
export type BrowserPageContext={tabId:string;url:string;title:string;revision:string;documentRevision:string;text:string;textNodes:BrowserPageText[];elements:any[];canUndo:boolean;localOnly:true;truncated:boolean;textOffset:number;hasMoreText:boolean;nextTextOffset?:number;totalTextNodes:number;unsupportedTextNodes:number;size:{width:number;height:number}}
export type BrowserPageResult={observation:BrowserPageContext;screenshot?:string;edit?:{changed:number;localOnly:true};undone?:boolean}

// This function is serialized into an isolated Chromium world. Only this finite
// host-authored API runs there; neither page HTML nor model-authored JS is run.
function createPageSurface(createSurface:any,token:string,cancelled:Set<string>){
 const ids=new WeakMap<Node,string>(),refs=new Map<string,Text>();let sequence=0,scopeKey='',latest:any,request:any
 let visibility=new WeakMap<Element,boolean>(),candidates:Element[]=[],labels=new WeakMap<Element,string>(),pageHash=''
 type Change={node:Text;before:string;after:string}
 let undo:Change[]|undefined
 const forbidden='script,style,noscript,template,iframe,object,embed,canvas,svg,head,input,textarea,select,option,datalist,output,[contenteditable]:not([contenteditable=false]),[role=textbox],[data-canvas-use-cursor],[data-odyssey-browser-cursor]'
 const selector='button,a,input,textarea,select,[role],[tabindex],canvas,svg,[contenteditable=true]'
 const check=(expected=request)=>{
  if(!expected||request!==expected||cancelled.has(expected.operationId)||location.href!==expected.expectedUrl||Date.now()>expected.deadline)throw Error('网页已变化、操作已取消或已过期，请重新观察。')
 }
 const pause=async(expected:any)=>{await new Promise(resolve=>setTimeout(resolve,0));check(expected)}
 const eligible=(node:Text)=>{
  const parent=node.parentElement
  if(!parent||!node.isConnected||!document.body.contains(node)||parent.closest(forbidden)||!node.data.trim())return false
  let depth=0
  for(let el:Element|null=parent;el;el=el.parentElement){
   if(++depth>128)throw Error('网页结构过于复杂，已超过安全遍历上限。')
   const cached=visibility.get(el);if(cached===false)return false;if(cached===true)continue
   const style=getComputedStyle(el),shown=!(el.hasAttribute('hidden')||el.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0');visibility.set(el,shown);if(!shown)return false
  }
  const bounds=parent.getBoundingClientRect();return bounds.width>0&&bounds.height>0
 }
 const hashInto=(value:number,text:string)=>{for(let i=0;i<text.length;i++)value=Math.imul(value^text.charCodeAt(i),16777619);return value}
 const surface=createSurface(document.body,()=>({connected:true,readOnly:false}),(el:Element,event:Event)=>event instanceof KeyboardEvent?true:el.dispatchEvent(event),{
  viewport:true,checkpoint:()=>check(),candidates:()=>candidates,text:()=>pageHash,
  label:(el:Element)=>(el.getAttribute('aria-label')||el.getAttribute('placeholder')||labels.get(el)||el.tagName.toLowerCase()).slice(0,240)
 })
 const scan=async(expected:any,textOffset:number,scanDeadline:number,yieldToPage:boolean)=>{
  const textNodes:BrowserPageText[]=[]
  let dirty=false
  const mutations=new MutationObserver(()=>{dirty=true})
  mutations.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true})
  try{
  refs.clear();visibility=new WeakMap();labels=new WeakMap();candidates=[]
  let visited=0,characters=0,length=0,totalTextNodes=0,unsupportedTextNodes=0,fullHash=2166136261,pageFull=false
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_ALL)
  for(let node=walker.nextNode();node;node=walker.nextNode()){
   check(expected)
   if(++visited>12000||Date.now()>scanDeadline)throw Error('网页过于复杂，已超过安全观察预算；请缩小页面范围或使用原生刷新。')
   if(yieldToPage&&visited%128===0){
    await pause(expected)
    if(dirty||mutations.takeRecords().length)return
   }
   if(node.nodeType===Node.ELEMENT_NODE){
    const el=node as Element
    if(candidates.length<200&&el.matches(selector)){
     const r=el.getBoundingClientRect(),style=getComputedStyle(el)
     if(r.width>0&&r.height>0&&style.visibility!=='hidden'&&style.display!=='none'&&!el.closest('[data-canvas-use-cursor]')&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth)candidates.push(el)
    }
    continue
   }
   if(node.nodeType!==Node.TEXT_NODE)continue
   const text=node as Text
   if(!eligible(text))continue
   characters+=text.length
   if(characters>1000000)throw Error('网页文字过多，已超过安全观察预算。')
   let ref=ids.get(text);if(!ref){ref='t'+ ++sequence;ids.set(text,ref)}
   fullHash=hashInto(fullHash,ref+'\u0000'+text.data+'\u0000')
   for(let el=text.parentElement;el;el=el.parentElement){const label=labels.get(el)||'';if(label.length<240)labels.set(el,(label+text.data.slice(0,240-label.length)+' ').slice(0,240))}
   if(text.data.length>8000){unsupportedTextNodes++;continue}
   if(totalTextNodes++<textOffset)continue
   const addedLength=text.data.length+(textNodes.length?1:0)
   if(pageFull||textNodes.length>=1000||length+addedLength>60000){pageFull=true;continue}
   refs.set(ref,text);textNodes.push({ref,text:text.data,tag:text.parentElement!.tagName.toLowerCase()});length+=addedLength
  }
  check(expected);pageHash=String(fullHash)
  const base=await surface({op:'observe',images:false});check(expected)
  if(Date.now()>scanDeadline)throw Error('网页观察已超过安全时间预算，请使用原生刷新后重试。')
  if(dirty||mutations.takeRecords().length)return
  // Form values and editable drafts are deliberately excluded from page context.
  const elements=base.elements.map((element:any)=>{const {value,checked,...safe}=element;safe.label=safe.label.trim();return safe})
  const revision=token+':'+(hashInto(fullHash,JSON.stringify({scopeKey,url:location.href,elements,interactionRevision:base.revision}))>>>0).toString(36)
  const hasMoreText=textOffset+textNodes.length<totalTextNodes
  latest={revision,interactionRevision:base.revision,textOffset}
  return {revision,documentRevision:revision,text:textNodes.map(n=>n.text).join('\n'),textNodes,elements,canUndo:!!undo,localOnly:true,truncated:hasMoreText||textOffset>0||unsupportedTextNodes>0,textOffset,hasMoreText,...(hasMoreText?{nextTextOffset:textOffset+textNodes.length}:{}),totalTextNodes,unsupportedTextNodes,size:base.size,url:location.href}
  }finally{mutations.disconnect()}
 }
 const observe=async(textOffset=0)=>{
  const expected=request,scanDeadline=Math.min(expected.deadline,Date.now()+3000)
  let snapshot=await scan(expected,textOffset,scanDeadline,true)
  if(!snapshot&&expected.op==='observe'){
   // A carousel or ticker may change on every yield. Discard the partial scan
   // and read once in one renderer task, within the original time/node budgets.
   await pause(expected)
   snapshot=await scan(expected,textOffset,scanDeadline,false)
  }
  if(!snapshot)throw Error('网页在观察期间发生变化，请重新观察。')
  return snapshot
 }
 // A batch stays small and synchronous so website observers cannot interleave
 // between its writes. Task boundaries before/after let revocations run.
 const apply=async(changes:Change[],nextUndo:Change[]|undefined,args:any)=>{
  const oldUndo=undo,applied:Change[]=[]
  await pause(args)
  try{
   for(const change of changes){check(args);if(!change.node.isConnected||!document.body.contains(change.node)||change.node.data!==change.before)throw Error('网站已更新文字，已停止本地修改。');change.node.data=change.after;applied.push(change)}
   undo=nextUndo
   await pause(args)
   return await observe(latest.textOffset)
  }catch(error){
   let restored=0
   // Roll back only our own unchanged writes in this same document. A website's
   // concurrent changes are never overwritten to make rollback appear atomic.
   for(const change of applied)if(location.href===args.expectedUrl&&change.node.isConnected&&document.body.contains(change.node)&&change.node.data===change.after){change.node.data=change.before;restored++}
   if(restored===applied.length)undo=oldUndo
   throw Error(String((error as Error).message)+(restored===applied.length?' 本批已恢复。':' 部分本地修改可能保留，请重新观察或使用原生刷新恢复。'))
  }
 }
 let running:Promise<unknown>=Promise.resolve()
 const invoke=async(args:any)=>{
  if(cancelled.has(args.operationId)||Date.now()>args.deadline)throw Error('网页操作已取消或已过期。')
  check(args)
  if(args.scopeKey!==scopeKey){scopeKey=args.scopeKey;latest=undefined;undo=undefined;refs.clear()}
  if(args.op==='observe')return {observation:await observe(args.textOffset??0)}
  if(!latest||args.revision!==latest.revision)throw Error('请先 observe 并使用当前网页的最新 revision。')
  const fresh=await observe(latest.textOffset)
  if(fresh.revision!==args.revision)throw Error('网页状态已变化，请重新观察后操作。')
  check(args)
  if(args.op==='edit'){
   const seen=new Set<string>(),changes:Change[]=[],baseline=new Map<Text,Change>(undo?.map(change=>[change.node,change]))
   for(const patch of args.patches){
    const node=refs.get(patch.ref)
    if(seen.has(patch.ref)||!node||!eligible(node)||node.data!==patch.expectedText)throw Error('文字引用或原文已变化，整批修改未执行，请重新观察。')
    const previous=baseline.get(node)
    if(previous&&previous.after!==node.data)throw Error('网站已更新先前修改的文字，不能覆盖旧撤销快照，请刷新网页恢复后重试。')
    seen.add(patch.ref)
    if(node.data!==patch.replacementText)changes.push({node,before:node.data,after:patch.replacementText})
   }
   for(const change of changes){const before=baseline.get(change.node)?.before??change.before;if(before===change.after)baseline.delete(change.node);else baseline.set(change.node,{node:change.node,before,after:change.after})}
   if(baseline.size>1000)throw Error('本地修改已达到安全撤销预算，请先撤销或刷新网页。')
   const observation=await apply(changes,baseline.size?[...baseline.values()]:undefined,args)
   return {observation,edit:{changed:changes.length,localOnly:true}}
  }
  if(args.op==='undo'){
   if(!undo?.length)throw Error('当前网页没有可撤销的本地修改。')
   if(undo.some(change=>!change.node.isConnected||!document.body.contains(change.node)||change.node.data!==change.after||change.node.parentElement?.closest(forbidden)))throw Error('网站已更新被修改的文字，无法安全撤销，请刷新网页恢复原站内容。')
   return {observation:await apply(undo.map(change=>({node:change.node,before:change.after,after:change.before})),undefined,args),undone:true}
  }
  await surface({...args,revision:latest.interactionRevision,externalCursor:true,images:false});check(args)
  return {observation:await observe(latest.textOffset)}
 }
 return (args:any)=>{
  if(cancelled.has(args.operationId)||Date.now()>args.deadline)return Promise.reject(Error('网页操作已取消或已过期。'))
  // A replacement request invalidates the old scan at its next checkpoint,
  // then waits for its rollback before reading or changing the same document.
  request=args
  const pending=running.catch(()=>{}).then(()=>invoke(args));running=pending
  return pending
 }
}

const operations=new Set(['observe','click','input','scroll','key','select','back','edit','undo'])
const fields=new Set(['op','tabId','url','revision','documentRevision','ref','text','key','value','x','y','patches','textOffset','sessionId'])
function validate(input:any){
 if(!input||typeof input!=='object'||Array.isArray(input)||!operations.has(input.op)||Object.keys(input).some(key=>!fields.has(key))||Buffer.byteLength(JSON.stringify(input),'utf8')>14000)throw Error('浏览器操作参数无效或超过 14000 字节，请拆成较小批次。')
 if(input.textOffset!==undefined&&(input.op!=='observe'||!Number.isSafeInteger(input.textOffset)||input.textOffset<0||input.textOffset>1000000))throw Error('textOffset 仅用于 observe，且必须是有效文字节点偏移。')
 if(input.op!=='observe'&&(typeof input.revision!=='string'||!input.revision||input.revision.length>200))throw Error('请先观察当前网页并提供最新 revision。')
 if(input.documentRevision!==undefined&&input.documentRevision!==input.revision)throw Error('网页文档版本不一致，请重新观察。')
 if(input.op==='edit'||input.op==='undo'){
  if(typeof input.tabId!=='string'||!input.tabId||typeof input.url!=='string'||Object.keys(input).some(key=>!['op','tabId','url','revision','documentRevision','patches','sessionId'].includes(key)))throw Error('本地修改必须绑定观察到的当前页签、网址和版本。')
 }
 if(input.op==='edit'){
  if(!Array.isArray(input.patches)||input.patches.length<1||input.patches.length>100)throw Error('文字修改每批须包含 1–100 项，请拆成较小批次。')
  let length=0
  for(const patch of input.patches){
   if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).length!==3||Object.keys(patch).some(key=>!['ref','expectedText','replacementText'].includes(key))||typeof patch.ref!=='string'||!/^t[1-9]\d*$/.test(patch.ref)||typeof patch.expectedText!=='string'||typeof patch.replacementText!=='string'||patch.expectedText.length>8000||patch.replacementText.length>8000||patch.replacementText.includes('\u0000'))throw Error('仅支持按文字引用和原文替换纯文字，每项最多 8000 字。')
   length+=patch.expectedText.length+patch.replacementText.length
  }
  if(length>120000)throw Error('本批文字修改过大，请分批处理。')
 }
 if(input.op==='input'&&(typeof input.text!=='string'||input.text.length>10000))throw Error('输入文字无效。')
 if(input.op==='key'&&(typeof input.key!=='string'||!(/^[a-zA-Z0-9 ]$/.test(input.key)||['Enter','Escape','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Backspace','Delete'].includes(input.key))))throw Error('按键无效。')
 if(input.op==='scroll'&&![input.x??0,input.y??0].every(n=>Number.isFinite(n)&&Math.abs(n)<=4000))throw Error('滚动距离无效。')
 return input
}

/** getActive is the service's authority for visible application/session ownership.
 * Call invalidate on selection/ownership changes, even when switching away and
 * back without a tool call, so previous grants and undo records cannot survive.
 * Per-request authorize callbacks must capture the requesting session/grant;
 * they are checked inside the queue and around every asynchronous host step.
 */
export function createBrowserPageAgent(getActive:()=>BrowserPageTarget|undefined){
 type State={epoch:number;onNavigate:(...args:any[])=>void;onDestroyed:()=>void}
 const states=new Map<WebContents,State>(),controllers=new Set<AbortController>(),pendingRenderer=new Map<WebContents,Set<(error:Error)=>void>>()
 let active:BrowserPageTarget|undefined,version=0,tail:Promise<unknown>=Promise.resolve()
 const revoke=(wc:WebContents,error:Error)=>{for(const cancel of pendingRenderer.get(wc)??[])cancel(error)}
 const invalidate=()=>{version++;active=undefined;for(const controller of controllers)controller.abort(Error('当前页签或会话已变化，旧操作已取消。'))}
 const current=()=>{
  const next=getActive()
  if(next?.webContents.isDestroyed())throw Error('当前网页已关闭。')
  if(next?.tabId!==active?.tabId||next?.webContents!==active?.webContents){version++;active=next}
  return next
 }
 const stateFor=(wc:WebContents)=>{
  let state=states.get(wc);if(state)return state
  state={epoch:0,onNavigate:(_event,_url,_inPlace,isMain)=>{if(isMain){state!.epoch++;revoke(wc,Error('网页已开始导航，旧操作已取消。'))}},onDestroyed:()=>{revoke(wc,Error('当前网页已关闭。'));states.delete(wc)}}
  wc.on('did-start-navigation',state.onNavigate);wc.once('destroyed',state.onDestroyed);states.set(wc,state);return state
 }
 const serial=<T>(run:(signal:AbortSignal,deadline:number)=>Promise<T>,signal?:AbortSignal)=>{
  const controller=new AbortController(),deadline=Date.now()+15000
  const abort=()=>controller.abort(signal?.reason??Error('网页操作已取消。'))
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();controllers.add(controller)
  const timer=setTimeout(()=>controller.abort(Error('网页操作超时；部分本地修改可能已生效，请重新观察或使用原生刷新恢复。')),Math.max(0,deadline-Date.now()))
  const invoke=()=>{controller.signal.throwIfAborted();return run(controller.signal,deadline)}
  const pending=tail.then(invoke,invoke);tail=pending.catch(()=>{})
  return new Promise<T>((resolve,reject)=>{
   const cancelled=()=>reject(controller.signal.reason)
   controller.signal.addEventListener('abort',cancelled,{once:true});if(controller.signal.aborted)cancelled()
   pending.then(resolve,reject)
  }).finally(()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);controllers.delete(controller)})
 }
 const perform=async(input:any,signal?:AbortSignal,withScreenshot=true,authorize?:()=>void,deadline=Date.now()+15000):Promise<BrowserPageResult|undefined>=>{
  const checkAuthority=()=>{signal?.throwIfAborted();authorize?.();if(Date.now()>deadline)throw Error('网页操作已过期；部分本地修改可能已生效，请重新观察或使用原生刷新。')}
  // The authority belongs to the caller captured when its request was made,
  // never to whichever session happens to own getActive when the queue drains.
  checkAuthority()
  const target=current();if(!target){if(!input)return undefined;throw Error('请先打开当前会话的浏览器网页。')}
  const wc=target.webContents,url=wc.getURL(),parsed=new URL(url)
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||target.url!==url)throw Error('当前网页尚未就绪，请重新观察。')
  if(wc.isLoadingMainFrame())throw Error('当前网页正在导航，请载入完成后重新观察。')
  const args=validate(input??{op:'observe'}),state=stateFor(wc),epoch=state.epoch,grant=version
  if(args.tabId!==undefined&&args.tabId!==target.tabId||args.url!==undefined&&args.url!==url)throw Error('当前页签或网址已变化，请重新观察。')
  const guard=()=>{
   checkAuthority();const now=current()
   if(!now||now.tabId!==target.tabId||now.webContents!==wc||now.url!==url||wc.isDestroyed()||wc.getURL()!==url||state.epoch!==epoch||grant!==version)throw Error('当前页签、会话或网页已变化，旧操作已拒绝。')
  }
  const bounded=<T>(promise:Promise<T>,cancel?:()=>void)=>new Promise<T>((resolve,reject)=>{
   const abort=()=>{cleanup();cancel?.();reject(signal?.reason??Error('浏览器操作已取消。'))}
   const timer=setTimeout(()=>{cleanup();cancel?.();reject(Error('网页响应超时；部分本地修改可能已生效，请重新观察或使用原生刷新恢复。'))},Math.max(0,deadline-Date.now()))
   const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
   signal?.addEventListener('abort',abort,{once:true});promise.then(result=>{cleanup();resolve(result)},error=>{cleanup();reject(error)});if(signal?.aborted)abort()
  })
  const execute=async(value:any)=>{
   guard()
   const operationId=randomUUID(),request={...value,operationId,scopeKey:target.tabId+':'+grant+':'+epoch,expectedUrl:url,deadline}
   let revoked=false,rejectPending!:(error:Error)=>void
   const cancelRenderer=()=>{
    if(revoked||wc.isDestroyed())return;revoked=true
    // This also records revocation before a delayed first request installs its
    // surface. Expiry remains a second guard if the renderer cannot run at all.
    void wc.executeJavaScriptInIsolatedWorld(996,[{code:`globalThis.__ewBrowserPageCancelled ??= new Set();globalThis.__ewBrowserPageCancelled.add(${JSON.stringify(operationId)});setTimeout(()=>globalThis.__ewBrowserPageCancelled.delete(${JSON.stringify(operationId)}),30000)`}]).catch(()=>{})
   }
   const cancel=(error:Error)=>{cancelRenderer();rejectPending(error)},waiting=pendingRenderer.get(wc)??new Set<(error:Error)=>void>();pendingRenderer.set(wc,waiting)
   const pending=new Promise<any>((resolve,reject)=>{rejectPending=reject;waiting.add(cancel)
    wc.executeJavaScriptInIsolatedWorld(996,[{code:`globalThis.__ewBrowserPageCancelled ??= new Set();globalThis.__ewBrowserPageAgent ??= (${createPageSurface.toString()})(${createCanvasUseSurface.toString()},${JSON.stringify(randomUUID())},globalThis.__ewBrowserPageCancelled);globalThis.__ewBrowserPageAgent(${JSON.stringify(request)})`}],['click','input','key','select'].includes(value.op)).then(resolve,reject)
   })
   try{const result=await bounded(pending,cancelRenderer);guard();return result}finally{waiting.delete(cancel);if(!waiting.size)pendingRenderer.delete(wc)}
  }
  const waitForNavigation=async(trigger?:()=>void)=>{
   checkAuthority()
   if(!trigger&&!wc.isLoadingMainFrame())return
   let done:(()=>void)|undefined
   const stopped=new Promise<void>(resolve=>{done=resolve;wc.once('did-stop-loading',resolve);if(trigger){guard();trigger()}else if(!wc.isLoadingMainFrame())resolve()})
   try{await bounded(stopped);checkAuthority()}finally{if(done)wc.removeListener('did-stop-loading',done)}
  }
  const sameOwner=()=>{checkAuthority();const now=current();return !!now&&now.tabId===target.tabId&&now.webContents===wc&&version===grant&&!wc.isDestroyed()}
  try{
  let result:any
  if(args.op==='back'){
   // Validate the observation in the renderer before using native history.
   result=await execute({...args,op:'scroll',x:0,y:0});guard()
   if(wc.navigationHistory.canGoBack()){
    await waitForNavigation(()=>wc.navigationHistory.goBack())
    if(!sameOwner())throw Error('当前页签或会话已变化，旧操作已拒绝。')
    const followed=await perform({op:'observe'},signal,withScreenshot,authorize,deadline);checkAuthority();return followed
   }
  }else{
   result=await execute(args);guard()
   if(args.op==='key'){guard();wc.sendInputEvent({type:'keyDown',keyCode:args.key});guard();wc.sendInputEvent({type:'keyUp',keyCode:args.key});result=await execute({op:'observe'});guard()}
  }
  const observation:BrowserPageContext={...result.observation,tabId:target.tabId,url,title:wc.getTitle()||target.title}
  let screenshot:string|undefined
  if(withScreenshot&&typeof wc.capturePage==='function'){
   // DOM writes can reach the main process before Chromium paints them. Let a
   // rendering frame complete so the model sees the result of this operation.
   await bounded(Promise.race([wc.executeJavaScriptInIsolatedWorld(996,[{code:'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'}]).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,120))]));guard()
   const image=await bounded(wc.capturePage()).catch(()=>undefined);guard()
   if(image&&!image.isEmpty())screenshot='data:image/jpeg;base64,'+image.resize({width:Math.min(1400,image.getSize().width)}).toJPEG(70).toString('base64')
  }
  guard();return {...result,observation,...(screenshot?{screenshot}:{})}
  }catch(error){
   checkAuthority()
   // Clicking links and pressing Enter can legitimately replace the document.
   // Follow that result only inside the very same active ownership grant; the
   // old refs still become unusable, and an edit never follows a navigation.
   if(['click','input','key','select','scroll','back'].includes(args.op)&&sameOwner()&&(state.epoch!==epoch||wc.getURL()!==url)){
    await waitForNavigation();if(!sameOwner())throw Error('当前页签或会话已变化，旧操作已拒绝。')
    const followed=await perform({op:'observe'},signal,withScreenshot,authorize,deadline);checkAuthority();return followed
   }
   throw error
  }
 }
 return {
  context:(authorize?:()=>void)=>serial(async(signal,deadline)=>{authorize?.();const result=await perform(undefined,signal,false,authorize,deadline);authorize?.();return result?.observation}),
  run:(input:any,signal?:AbortSignal,authorize?:()=>void)=>serial(async(signal,deadline)=>{authorize?.();const result=await perform(validate(input),signal,true,authorize,deadline);authorize?.();return result!},signal),
  invalidate,
  dispose:()=>{invalidate();for(const [wc,state]of states){wc.removeListener('did-start-navigation',state.onNavigate);wc.removeListener('destroyed',state.onDestroyed)}states.clear()}
 }
}
