import {emitHomeGuideEntryDiagnostic,type HomeGuideEntryDenial} from '../shared/home-guide-entry-diagnostics'
export type HomeGuideEntryKind='board'|'workbench'|'note'|'ppt'|'report'
export type HomeGuideEntryAction='home-input'|'home-chat'|'home-research'|'home-notes'|'new-chat'|'new-research'|'new-note'|'sidebar-home'
export type HomeGuideEntrySession={sessionId:string;cwd:string;title:string;fresh?:boolean}
export type HomeGuideEntryContext={owner:string;generation:number;identityRevision:number;sessionId?:string;selectionRevision?:number;input?:any;eligible?:boolean}
type NativeDependencies={
 document:Document;context():HomeGuideEntryContext;subscribe(listener:()=>void):()=>void
 prepare(kind:HomeGuideEntryKind,runId:string,check:()=>void,signal:AbortSignal):Promise<HomeGuideEntrySession>
 open(entry:HomeGuideEntrySession,kind:HomeGuideEntryKind,check:()=>void):void
 beforeOpen?(signal:AbortSignal):Promise<void>
 ttlMs?:number
}
const REQUEST='sherlock:home-guide-entry-request',REPLY='sherlock:home-guide-entry-reply',CANCELLED='sherlock:home-guide-entry-cancelled'
const TARGET='data-home-guide-entry-target',CLICK='data-home-guide-entry-click'
const kinds=['board','workbench','note','ppt','report'],actions=['home-input','home-chat','home-research','home-notes','new-chat','new-research','new-note','sidebar-home']
const modeOf=(kind:HomeGuideEntryKind)=>kind==='board'||kind==='workbench'?'research':kind==='note'?'notes':'chat'
const cancelled=()=>new DOMException('演示入口已取消，请重新打开探索。','AbortError')
const id=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=200
const snapshot=(shell:any)=>{
 const s=shell?.snapshot
 if(!s)return null
 if(shell.disposed||s.phase!=='plain'||s.researchContextPreparing||s.composing||s.isComposing||s.compositionActive||!Number.isSafeInteger(s.draftRev)||s.draftRev<0)throw cancelled()
 return JSON.stringify([s.draft,s.draftRev,s.imageIds??[],s.occurrences??[],s.phase,s.researchContextPreparing??false,s.composing??false,s.isComposing??false,s.compositionActive??false])
}
function available(document:Document,target:HTMLElement){
 const win=document.defaultView!,rect=target.getBoundingClientRect()
 if(target.ownerDocument!==document||!target.isConnected||target.closest('[inert],[hidden],[aria-hidden="true"],[aria-disabled="true"],[data-odyssey-subagent-panel]')||(target as HTMLButtonElement).disabled||rect.width<=0||rect.height<=0)return false
 let left=Math.max(0,rect.left),top=Math.max(0,rect.top),right=Math.min(win.innerWidth,rect.right),bottom=Math.min(win.innerHeight,rect.bottom)
 for(let node:HTMLElement|null=target;node;node=node.parentElement){
  const style=win.getComputedStyle(node)
  if(node.inert||style.display==='none'||['hidden','collapse'].includes(style.visibility)||style.opacity==='0')return false
  if(node!==target){const clip=node.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(style.overflowX||style.overflow)){left=Math.max(left,clip.left);right=Math.min(right,clip.right)}if(/hidden|auto|scroll|clip/.test(style.overflowY||style.overflow)){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom)}}
 }
 if(right<=left||bottom<=top)return false
 const hit=document.elementFromPoint?.((left+right)/2,(top+bottom)/2)
 return !hit||hit===target||target.contains(hit)
}
function matches(document:Document,target:HTMLElement,action:HomeGuideEntryAction,kind:HomeGuideEntryKind){
 if(!available(document,target))return false
 if(action==='sidebar-home')return target.matches('[data-dsh-sidebar-root] button[data-sidebar-home]')
 const mode=modeOf(kind)
 if(action.startsWith('home-')&&action!=='home-input')return action==='home-'+mode&&target.matches('[data-srb-tabs] button[data-conversation-view-id="'+mode+'"]')&&!!target.closest('.pI_x6G_centerCol .wSkVaW_root[data-odyssey-page="home"]')
 if(action==='home-input'){
  const root=target.closest('.pI_x6G_centerCol .wSkVaW_root[data-odyssey-page="home"]')??(target.closest('[data-research-composer-host]')?document.querySelector('.pI_x6G_centerCol .wSkVaW_root[data-odyssey-page="home"]'):null)
  return target.matches('textarea')&&!!root?.querySelector('[data-srb-tabs] [data-conversation-view-id="'+mode+'"][aria-selected="true"]')&&!(target as HTMLTextAreaElement).readOnly&&!(target as HTMLTextAreaElement).value.trim()
 }
 const expected='new-'+(mode==='notes'?'note':mode)
 if(action!==expected)return false
 const label=target.getAttribute('aria-label')||target.textContent?.trim()||''
 const names=action==='new-note'?['新笔记','新建笔记','New note','New Note']:action==='new-research'?['新建研究','新研究','New research','New Research']:['新建对话','新对话','New chat','New Chat']
 return (target.matches('button,[role="menuitem"]')&&names.includes(label)||action==='new-note'&&target.hasAttribute('data-sidebar-new-note'))&&!!target.closest('[data-dsh-sidebar-root],[role="menu"],.st-menu[data-sidebar-more="true"]')
}

/** Renderer actor. Authority is held by the page-world installer, never a shared expando. */
export async function createHomeGuideEntryClient(document:Document,options:{runId:string;kind:HomeGuideEntryKind;signal:AbortSignal;sourceSessionId?:string}){
 const win=document.defaultView!;let disposed=false,committed=false,token='',homeEmpty=false,prepared:HomeGuideEntrySession|undefined,target:HTMLElement|undefined,action:HomeGuideEntryAction|undefined
 const waiting=new Map<string,(error:Error)=>void>(),abort=()=>dispose()
 const sendCancel=()=>win.dispatchEvent(new win.CustomEvent(REQUEST,{detail:{phase:'cancel',requestId:win.crypto.randomUUID(),runId:options.runId,...token?{token}:{}}}))
 function dispose(){if(disposed)return;disposed=true;sendCancel();for(const reject of [...waiting.values()])reject(cancelled());waiting.clear();options.signal.removeEventListener('abort',abort);win.removeEventListener(CANCELLED,onCancelled);if(target?.getAttribute(TARGET)?.startsWith(options.runId+':'))target.removeAttribute(TARGET);target?.removeAttribute(CLICK)}
 const trace=(reason:HomeGuideEntryDenial)=>emitHomeGuideEntryDiagnostic({runId:options.runId,sessionId:options.sourceSessionId,kind:options.kind,phase:'cancel',reason})
 const check=()=>{if(disposed||options.signal.aborted)throw cancelled()}
 const onCancelled=(event:Event)=>{if((event as CustomEvent).detail?.runId===options.runId)dispose()}
 function exchange(phase:'arm'|'prepare',extra:Record<string,unknown>={}){
  check();const requestId=win.crypto.randomUUID()
  return new Promise<any>((resolve,reject)=>{
   const cleanup=()=>{win.clearTimeout(timer);waiting.delete(requestId);win.removeEventListener(REPLY,receive)}
   const stop=(error:Error)=>{cleanup();reject(error)}
   const receive=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.requestId!==requestId||d.runId!==options.runId)return;cleanup();if(d.ok!==true){reject(d.cancelled?cancelled():Error(d.message||'演示入口尚未就绪。'));return}try{check();resolve(d)}catch(error){reject(error)}}
   const timer=win.setTimeout(()=>{trace('timeout');stop(Error('演示入口准备超时。'));dispose()},30000)
   waiting.set(requestId,stop);win.addEventListener(REPLY,receive)
   win.dispatchEvent(new win.CustomEvent(REQUEST,{detail:{phase,requestId,runId:options.runId,kind:options.kind,...options.sourceSessionId?{sourceSessionId:options.sourceSessionId}:{},...token?{token}:{},...extra}}))
  })
 }
 options.signal.addEventListener('abort',abort,{once:true});win.addEventListener(CANCELLED,onCancelled)
 try{const armed=await exchange('arm');check();if(!id(armed.token))throw cancelled();token=armed.token;homeEmpty=armed.homeEmpty===true}catch(error){dispose();throw error}
 return{
  get homeEmpty(){return homeEmpty},
  async prepare(element:HTMLElement,next:HomeGuideEntryAction){
   check();if(target||!matches(document,element,next,options.kind)){trace('target');throw cancelled()}
   target=element;action=next;const targetKey=options.runId+':'+win.crypto.randomUUID();element.setAttribute(TARGET,targetKey)
   try{const value=await exchange('prepare',{targetKey,action:next});check();if(!id(value.sessionId)||typeof value.cwd!=='string'||typeof value.title!=='string')throw cancelled();prepared={sessionId:value.sessionId,cwd:value.cwd,title:value.title,fresh:value.fresh};return prepared}catch(error){dispose();throw error}
  },
  commit(element:HTMLElement):Promise<HomeGuideEntrySession>{
   check();if(committed||!prepared||element!==target||!action||!matches(document,element,action,options.kind)){trace('target');throw cancelled()};committed=true
   const requestId=win.crypto.randomUUID()
   // Install the acknowledgment listener before the unique real DOM click.
   const result=new Promise<HomeGuideEntrySession>((resolve,reject)=>{
    const cleanup=()=>{win.clearTimeout(timer);waiting.delete(requestId);win.removeEventListener(REPLY,receive)}
    const stop=(error:Error)=>{cleanup();reject(error)}
    const receive=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.requestId!==requestId||d.runId!==options.runId)return;cleanup();if(d.ok!==true){reject(d.cancelled?cancelled():Error(d.message||'演示入口未能打开。'));return}try{check();if(d.sessionId!==prepared!.sessionId)throw cancelled();resolve(prepared!)}catch(error){reject(error)}}
    const timer=win.setTimeout(()=>{trace('timeout');stop(Error('演示入口打开超时。'));dispose()},30000)
    waiting.set(requestId,stop);win.addEventListener(REPLY,receive)
   })
   element.setAttribute(CLICK,JSON.stringify({runId:options.runId,token,requestId}))
   try{element.click()}catch(error){waiting.get(requestId)?.(error as Error);dispose()}finally{element.removeAttribute(CLICK)}
   return result
  },dispose
 }
}

/** Page-world owner. One lease can reserve and open exactly one dedicated session. */
export function installHomeGuideEntryNative(deps:NativeDependencies){
 const document=deps.document,win=document.defaultView!,runs=new Map<string,any>(),closedRuns=new Set<string>(),closedNotes=new Set<string>(),composing=new Set<Element>();let stopped=false,selectionRevision=0,selected=deps.context().sessionId,opening:any,activeNote:any
 const sourceComposing=()=>{
  // Chromium may retire or blur an IME owner without delivering compositionend.
  // A retained, hidden composer must not block a later Explore entry forever.
  for(const el of composing)if(!el.isConnected||!el.contains(document.activeElement))composing.delete(el)
  return [...composing].some(el=>!el.closest('[data-odyssey-subagent-panel]')&&!!el.closest('.pI_x6G_centerCol,[data-ework-notes-composer-host]'))
 }
 const retain=(set:Set<string>,value:string)=>{set.add(value);if(set.size>256)set.delete(set.values().next().value!)}
 const retire=(run:any)=>{runs.delete(run.runId);retain(closedRuns,run.runId);if(run.noteToken)retain(closedNotes,run.noteToken)}
 const reply=(run:any,requestId:string,value:Record<string,unknown>)=>win.dispatchEvent(new win.CustomEvent(REPLY,{detail:{requestId,runId:run.runId,...value}}))
 const trace=(run:any,phase:'arm'|'prepare'|'commit'|'cancel',reason:HomeGuideEntryDenial)=>emitHomeGuideEntryDiagnostic({runId:run.runId,sessionId:run.context?.sessionId,kind:run.kind,phase,reason})
 const revoke=(run:any,reason:HomeGuideEntryDenial=run.denial??'cancelled',failed=false)=>{if(run.cancelled||run.phase==='done')return;trace(run,'cancel',reason);run.cancelled=true;run.controller.abort();win.clearTimeout(run.timer);retire(run);for(const requestId of run.pending)reply(run,requestId,failed?{ok:false,message:'演示准备未完成，请重新打开探索后重试。'}:{ok:false,cancelled:true});run.pending.clear();win.dispatchEvent(new win.CustomEvent(CANCELLED,{detail:{runId:run.runId}}))}
 function current(run:any){
  const now=deps.context(),initial=run.context
  const deny=(reason:HomeGuideEntryDenial):never=>{run.denial=reason;throw cancelled()}
  if(stopped)deny('stopped');if(run.cancelled||run.controller.signal.aborted)deny('cancelled');if(Date.now()>=run.expires)deny('expired')
  if(now.owner!==initial.owner)deny('owner');if(now.generation!==initial.generation)deny('generation');if(now.identityRevision!==initial.identityRevision)deny('identity');if(now.eligible===false)deny('ineligible');if(sourceComposing())deny('composition')
  if(run.opened){if(now.sessionId!==run.entry.sessionId)deny('session');if(selectionRevision!==run.openedRevision)deny('selection');return}
  if(now.sessionId!==initial.sessionId)deny('session');if(selectionRevision!==run.selectionRevision||now.selectionRevision!==initial.selectionRevision)deny('selection');if(now.input!==initial.input)deny('input')
  let fingerprint;try{fingerprint=snapshot(initial.input)}catch{deny('phase')}
  if(fingerprint!==run.fingerprint){const before=JSON.parse(run.fingerprint??'null'),after=JSON.parse(fingerprint??'null');if(before&&after){if(before[0]!==after[0])deny('draft');if(before[1]!==after[1])deny('draft-revision');if(JSON.stringify(before[2])!==JSON.stringify(after[2]))deny('images');if(JSON.stringify(before[3])!==JSON.stringify(after[3]))deny('occurrences')}deny('snapshot')}
 }
 const refresh=()=>{
  const next=deps.context().sessionId
  if(next!==selected){selected=next;selectionRevision++;if(opening&&next===opening.entry.sessionId){opening.opened=true;opening.openedRevision=selectionRevision}}
  for(const run of runs.values())if(!run.cancelled&&run.phase!=='done')try{current(run)}catch{revoke(run)}
 }
 const unsubscribe=deps.subscribe(refresh)
 function pin(run:any){if(!run.target||run.target.getAttribute(TARGET)!==run.targetKey||!matches(document,run.target,run.action,run.kind))throw cancelled()}
 async function open(run:any){
  current(run)
  if(deps.beforeOpen){await deps.beforeOpen(run.controller.signal);current(run)}
  current(run);opening=run
  try{deps.open(run.entry,run.kind,()=>current(run))}finally{opening=undefined}
  if(!run.opened&&deps.context().sessionId===run.entry.sessionId){run.opened=true;run.openedRevision=selectionRevision}
  current(run);if(!run.opened)throw cancelled()
  trace(run,'commit','opened');run.phase='done';win.clearTimeout(run.timer);retire(run);reply(run,run.commitId,{ok:true,...run.entry});run.pending.delete(run.commitId)
 }
 const consume=(run:any,requestId:string)=>{
  current(run);pin(run);if(run.phase!=='prepared')throw cancelled();run.phase='committing';run.commitId=requestId;run.pending.add(requestId)
 }
 const click=(event:Event)=>{
  const target=event.target instanceof win.Element?(event.target as Element).closest<HTMLElement>('['+CLICK+']'):null
  if(event.isTrusted){for(const run of runs.values())revoke(run,'trusted-input');return}
  if(!target){for(const run of runs.values())if(run.target&&(event.target===run.target||run.target.contains(event.target as Node)))revoke(run);return}
  let marker:any;try{marker=JSON.parse(target.getAttribute(CLICK)||'')}catch{return}
  const run=runs.get(marker?.runId)
  if(!run||run.target!==target||run.token!==marker.token||!id(marker.requestId))return
  try{
   consume(run,marker.requestId)
   if(run.action==='new-note'){
    // Let the actual More menu close via its own handler; its native prepare
    // request below is the only normal callback replaced by this lease.
    activeNote=run;win.queueMicrotask(()=>{if(activeNote===run){activeNote=undefined;if(!run.noteToken)revoke(run)}});return
   }
   event.preventDefault();event.stopImmediatePropagation();void open(run).catch(()=>revoke(run))
  }catch{event.preventDefault();event.stopImmediatePropagation();revoke(run)}
 }
 const note=(event:Event)=>{
  const d=(event as CustomEvent).detail
  if(d?.kind==='spreadsheet')return
  let run=activeNote
  if(d?.phase!=='prepare')run=[...runs.values()].find(value=>value.noteToken===d?.token)
  if(!run&&closedNotes.has(d?.token)){event.stopImmediatePropagation();win.dispatchEvent(new win.CustomEvent('sherlock:sidebar-new-note-reply',{detail:{requestId:d.requestId,ok:false,cancelled:true}}));return}
  if(!run||!id(d?.requestId))return
  if(d.phase==='prepare'&&(!run.target?.hasAttribute(CLICK)||run.phase!=='committing'))return
  event.stopImmediatePropagation()
  const nativeReply=(value:Record<string,unknown>)=>win.dispatchEvent(new win.CustomEvent('sherlock:sidebar-new-note-reply',{detail:{requestId:d.requestId,...value}}))
  if(d.phase==='cancel'){revoke(run);nativeReply({ok:true});return}
  try{current(run)
   if(d.phase==='prepare'){run.noteToken=win.crypto.randomUUID();activeNote=undefined;nativeReply({ok:true,token:run.noteToken});return}
   if(d.phase!=='create'||run.noteCreating)throw cancelled();run.noteCreating=true
   void open(run).then(()=>nativeReply({ok:true,sessionId:run.entry.sessionId}),()=>{revoke(run);nativeReply({ok:false,cancelled:true})})
  }catch{revoke(run);nativeReply({ok:false,cancelled:true})}
 }
 const input=(event:Event)=>{if(!event.isTrusted)return;if(event.target instanceof win.Element){if(event.type==='compositionstart')composing.add(event.target);if(event.type==='compositionend'||event.type==='input'&&event instanceof win.InputEvent&&!event.isComposing)composing.delete(event.target)}for(const run of runs.values())revoke(run,'trusted-input')}
 const blur=(event:Event)=>{if(event.isTrusted&&event.target instanceof win.Element)composing.delete(event.target)}
 const receive=(event:Event)=>{
  const d=(event as CustomEvent).detail;if(stopped||!d||!id(d.requestId)||!id(d.runId))return
  if(d.phase==='cancel'){const run=runs.get(d.runId);if(run&&(!d.token||d.token===run.token))revoke(run,'client-cancel');return}
  let run=runs.get(d.runId)
  if(d.phase==='arm'){
   if(run||closedRuns.has(d.runId)||runs.size>=128||!kinds.includes(d.kind)||Object.keys(d).some(key=>!['phase','requestId','runId','kind','sourceSessionId'].includes(key)))return reply({runId:d.runId},d.requestId,{ok:false,cancelled:true})
   const context=deps.context();let denial:HomeGuideEntryDenial='operation-failed'
   const deny=(reason:HomeGuideEntryDenial):never=>{denial=reason;throw cancelled()}
   try{
    if(context.eligible===false)deny('ineligible')
    if(sourceComposing())deny('composition')
    if(d.sourceSessionId!==undefined&&d.sourceSessionId!==context.sessionId)deny('session')
    if(context.sessionId&&!context.input)deny('input')
    const fingerprint=(()=>{try{return snapshot(context.input)}catch{return deny('phase')}})()
    run={runId:d.runId,kind:d.kind,token:win.crypto.randomUUID(),context:{...context},selectionRevision,fingerprint,controller:new win.AbortController(),phase:'armed',pending:new Set<string>(),expires:Date.now()+(deps.ttlMs??30000)};runs.set(d.runId,run);run.timer=win.setTimeout(()=>revoke(run,'expired'),deps.ttlMs??30000);current(run);trace(run,'arm','armed');const source=context.input?.snapshot;reply(run,d.requestId,{ok:true,token:run.token,homeEmpty:!source||!source.draft?.trim()&&!source.imageIds?.length&&!source.occurrences?.length})
   }catch{
    // A denied arm has no registered lease in the usual case. Record the
    // closed reason here; otherwise the renderer can only report operation-failed.
    trace(run??{runId:d.runId,kind:d.kind,context},'arm',run?.denial??denial)
    return reply({runId:d.runId},d.requestId,{ok:false,cancelled:true})
   }
   return
  }
  if(!run||d.token!==run.token||d.kind!==run.kind||d.phase!=='prepare'||!actions.includes(d.action)||!id(d.targetKey)||Object.keys(d).some(key=>!['phase','requestId','runId','kind','sourceSessionId','token','targetKey','action'].includes(key)))return reply({runId:d.runId},d.requestId,{ok:false,cancelled:true})
  if(run.phase!=='armed')return reply(run,d.requestId,{ok:false,cancelled:true})
  try{current(run);const source=run.context.input?.snapshot;if(d.action.startsWith('home-')&&source&&(source.draft?.trim()||source.imageIds?.length||source.occurrences?.length))throw cancelled();const targets=[...document.querySelectorAll<HTMLElement>('['+TARGET+']')].filter(el=>el.getAttribute(TARGET)===d.targetKey),target=targets[0];if(targets.length!==1||!target||!matches(document,target,d.action,run.kind))throw cancelled();run.target=target;run.targetKey=d.targetKey;run.action=d.action;run.phase='preparing';run.pending.add(d.requestId)
   void(async()=>{current(run);const entry=await deps.prepare(run.kind,run.runId,()=>current(run),run.controller.signal);current(run);pin(run);if(!entry||!id(entry.sessionId)||typeof entry.cwd!=='string'||typeof entry.title!=='string')throw cancelled();run.entry=entry;run.phase='prepared';trace(run,'prepare','prepared');reply(run,d.requestId,{ok:true,...entry});run.pending.delete(d.requestId)})().catch(error=>{if(run.cancelled)return;try{current(run)}catch{revoke(run);return}revoke(run,run.denial??'operation-failed',error?.name!=='AbortError')})
  }catch{revoke(run)}
 }
 win.addEventListener(REQUEST,receive);win.addEventListener('sherlock:sidebar-new-note-request',note,true);document.addEventListener('click',click,true)
 for(const type of ['pointerdown','keydown','beforeinput','input','compositionstart','compositionend'])document.addEventListener(type,input,true)
 document.addEventListener('focusout',blur,true)
 return()=>{if(stopped)return;for(const run of runs.values())revoke(run,'disposed');stopped=true;unsubscribe();win.removeEventListener(REQUEST,receive);win.removeEventListener('sherlock:sidebar-new-note-request',note,true);document.removeEventListener('click',click,true);for(const type of ['pointerdown','keydown','beforeinput','input','compositionstart','compositionend'])document.removeEventListener(type,input,true);document.removeEventListener('focusout',blur,true);composing.clear()}
}
