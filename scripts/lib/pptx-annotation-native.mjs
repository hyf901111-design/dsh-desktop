import {createHash} from 'node:crypto'
import {createPptxAnnotationRevealController,openPptxAnnotationPreview} from './pptx-annotation-reveal.mjs'
import {PPTX_ANNOTATION_INPUT_DEFINITIONS,parsePptxAnnotationLocator,annotationAdmission,annotationAdmissionCurrent} from './pptx-annotation-input.mjs'
import {createPptxAnnotationCoordinator} from './pptx-annotation-coordinator.mjs'

export function annotationTargetVisible(target,win){
 if(!target?.isConnected||target.disabled||target.readOnly||target.closest('[hidden],[inert]'))return false
 const rect=target.getBoundingClientRect();let left=Math.max(0,rect.left),top=Math.max(0,rect.top),right=Math.min(win.innerWidth,rect.right),bottom=Math.min(win.innerHeight,rect.bottom)
 for(let node=target;node;node=node.parentElement){const style=win.getComputedStyle(node);if(style.display==='none'||['hidden','collapse'].includes(style.visibility)||Number.parseFloat(style.opacity)===0)return false
  if(node!==target){const box=node.getBoundingClientRect();if(/hidden|clip|auto|scroll/.test(style.overflowX||style.overflow)){left=Math.max(left,box.left);right=Math.min(right,box.right)}if(/hidden|clip|auto|scroll/.test(style.overflowY||style.overflow)){top=Math.max(top,box.top);bottom=Math.min(bottom,box.bottom)}}
 }
 return right>left&&bottom>top
}
export function annotationSkillRequest(win,action,args,valid,signal){
 return new Promise((resolve,reject)=>{
  const requestId=win.crypto.randomUUID();let timer
  const clean=()=>{win.clearTimeout(timer);win.removeEventListener('sherlock:skill-menu-reply',receive);signal?.removeEventListener('abort',abort)}
  const abort=()=>{clean();win.dispatchEvent(new win.CustomEvent('sherlock:skill-menu-request',{detail:{requestId,action:'cancel'}}));reject(new DOMException('技能操作已取消。','AbortError'))}
  const receive=event=>{const value=event.detail;if(value?.requestId!==requestId)return;clean();try{valid();if(!value.ok)throw Error(value.error||'PPT 技能暂不可用。');resolve(value.result)}catch(reason){reject(reason)}}
  if(signal?.aborted){abort();return}
  timer=win.setTimeout(()=>{clean();reject(Error('PPT 技能尚未就绪，请稍后重试。'))},6000)
  win.addEventListener('sherlock:skill-menu-reply',receive);signal?.addEventListener('abort',abort,{once:true})
  try{valid();win.dispatchEvent(new win.CustomEvent('sherlock:skill-menu-request',{detail:{requestId,action,...args}}))}catch(reason){clean();reject(reason)}
 })
}
export function createPptxAnnotationNativeRuntime(options){
 const win=options.window,doc=options.document,key=Symbol.for('sherlock:pptx-annotation-input')
 if(win[key])throw Error('PPT 标注输入协调器已安装。')
 const roots=new Map(),composing=new WeakSet(),controller=new win.AbortController();let stopped=false,epoch=0
 const changed=()=>new DOMException('当前会话或可见输入已变化。','AbortError')
 const entry=()=>{const id=options.sessions.list.getSnapshot().current,root=roots.get(id);if(stopped||!id||!root||root.subagentPanel||options.sessions.subagentAddress?.(id)!==undefined)throw changed();if(doc.documentElement.dataset.homeGuidePointerRun)throw Error('请先结束演示，再使用普通 PPT 标注。');return root}
 const inputFor=root=>{
  const headers=[...doc.querySelectorAll('[data-srb-session-header][data-ework-notes-session]')].filter(node=>node.dataset.eworkNotesSession===root.sessionId&&!node.closest('[data-odyssey-subagent-panel]'))
  if(headers.length!==1)return null
  const center=headers[0].closest('.pI_x6G_centerCol'),inputs=[...(center?.querySelectorAll('.uV2eYG_root textarea')??[])].filter(node=>!node.closest('[data-odyssey-subagent-panel]')&&annotationTargetVisible(node,win))
  return inputs.length===1?inputs[0]:null
 }
 const valid=identity=>{try{const root=entry(),shell=options.inputHub.shell(root.sessionId);return !doc.hidden&&identity.epoch===epoch&&root.sessionId===identity.sessionId&&root.view==='chat'&&!options.inputHub.researchActiveSessions?.has(root.sessionId)&&shell===identity.shell&&!shell.disposed&&(!options.activeInput||options.activeInput(root.sessionId,shell)===shell)&&inputFor(root)===identity.input}catch{return false}}
 const resolveInput=async({switchToChat,signal}={})=>{
  let root=entry();const sessionId=root.sessionId,startEpoch=epoch
  if(root.view!=='chat'){if(!switchToChat||!['notes','research'].includes(root.view)||typeof root.actions?.setView!=='function')throw changed();root.actions.setView('chat')}
  const deadline=win.performance.now()+1800
  for(;;){if(signal?.aborted||stopped||startEpoch!==epoch)throw changed();root=entry();if(root.sessionId!==sessionId)throw changed()
   const shell=options.inputHub.shell(sessionId),input=inputFor(root)
   if(root.view==='chat'&&!options.inputHub.researchActiveSessions?.has(sessionId)&&input&&shell&&!shell.disposed&&(!options.activeInput||options.activeInput(sessionId,shell)===shell))return{sessionId,shell,input,ordinary:true,epoch:startEpoch}
   if(win.performance.now()>=deadline)throw Error('请在当前会话的可见对话输入框中继续标注。')
   await new Promise(resolve=>win.setTimeout(resolve,16))
  }
 }
 const bridge=options.bridge??win.sherlockPptAnnotations
 const coordinator=createPptxAnnotationCoordinator({bridge,resolveInput,isCurrent:valid,subscribeEnvelopes:notify=>options.api.subscribeEnvelopes(notify),
  getSelection:identity=>doc.activeElement===identity.input&&identity.input.value.length===identity.shell.snapshot.draft.length?{start:identity.input.selectionStart,end:identity.input.selectionEnd}:undefined,
  isComposing:identity=>composing.has(identity.input),
  validateRetry:async(identity,before,parts)=>{for(const occurrence of before.occurrences)if(occurrence.source==='ework-managed-skill'){
   const check=()=>{if(!valid(identity))throw changed()},reference=JSON.parse(occurrence.ref),result=await annotationSkillRequest(win,'resolve',{reference},check,controller.signal)
   if('/'+result.invocationName!==parts.find(value=>value.offset===occurrence.offset)?.text)throw Error('原技能已变化，请重新确认修改请求。')
  }},
  serializeReference:(source,ref,identity)=>{
   if(source==='conversation-component'&&options.serializeComponent)return options.serializeComponent(ref,identity.sessionId)
   const triggers=identity.shell.deps.inputTriggers?.();if(!triggers)throw Error('输入引用序列化尚未就绪。');return triggers.serializeReference(source,ref,controller.signal)
  }})
 const reveal=createPptxAnnotationRevealController({bridge,resolveInput,isCurrent:valid,parseReference:parsePptxAnnotationLocator,openPreview:(identity,value,options)=>{if(!valid(identity))throw changed();return openPptxAnnotationPreview(entry().researchSidebar,identity,value,options)}})
 const captureSelection=event=>{try{const root=entry(),input=inputFor(root),shell=options.inputHub.shell(root.sessionId);if(event.target===input&&input.value.length===shell.snapshot.draft.length)coordinator.getShellBinding(shell)?.setSelection({start:input.selectionStart,end:input.selectionEnd})}catch{}}
 const compositionStart=event=>{if(event.target?.matches?.('.uV2eYG_root textarea')){captureSelection(event);composing.add(event.target)}}
 const compositionEnd=event=>{composing.delete(event.target);win.setTimeout(()=>{if(stopped)return;try{const root=entry();if(inputFor(root)===event.target)coordinator.getShellBinding(options.inputHub.shell(root.sessionId))?.flush()}catch{}},0)}
 const refresh=()=>win.queueMicrotask(()=>{if(stopped)return;coordinator.refreshIdentity();try{const root=entry(),shell=options.inputHub.shell(root.sessionId),identity={sessionId:root.sessionId,shell,input:inputFor(root),ordinary:true,epoch};if(valid(identity)){coordinator.adoptInput(identity);coordinator.getShellBinding(shell)?.flush()}}catch{}}),offSessions=options.sessions.list.subscribe?.(refresh)??(()=>{})
 const reset=()=>{epoch++;refresh()},pagehide=()=>runtime.dispose()
 doc.addEventListener('beforeinput',captureSelection,true);doc.addEventListener('compositionstart',compositionStart,true);doc.addEventListener('compositionend',compositionEnd,true);win.addEventListener('sherlock:skill-menu-reset',reset);doc.addEventListener('sherlock:notes-reset',reset);win.addEventListener('pagehide',pagehide)
 const runtime={...coordinator,...reveal,registerView(value){if(stopped||!value.sessionId||value.subagentPanel)return()=>{};const ticket={...value};roots.set(value.sessionId,ticket);refresh();return()=>{if(roots.get(value.sessionId)===ticket){roots.delete(value.sessionId);refresh()}}},dispose(){if(stopped)return;stopped=true;controller.abort();offSessions();reveal.dispose();coordinator.dispose();roots.clear();doc.removeEventListener('beforeinput',captureSelection,true);doc.removeEventListener('compositionstart',compositionStart,true);doc.removeEventListener('compositionend',compositionEnd,true);win.removeEventListener('sherlock:skill-menu-reset',reset);doc.removeEventListener('sherlock:notes-reset',reset);win.removeEventListener('pagehide',pagehide);if(win[key]===runtime)delete win[key]}}
 win[key]=runtime;return runtime
}
function PptxAnnotationNativePortal(props){
 const view=props.useStore?.(state=>state.view??'chat')??'chat'
 react.useEffect(()=>PptxAnnotationNativeRuntime?.registerView({sessionId:props.sessionId,subagentPanel:props.subagentPanel,view,actions:props.actions,researchSidebar:props.researchSidebar??defaultResearchSidebar}),[props.sessionId,props.subagentPanel,view,props.actions,props.researchSidebar])
 return null
}
function pptxAnnotationReferenceSource(){return{trigger:'@',name:'pptx-annotation',order:99,candidates:async()=>[],onPick:()=>undefined,codec:{clipboardText:ref=>{parsePptxAnnotationLocator(ref);return'PPT 标注'},serialize:async()=>{throw Error('请在当前普通输入框中整批发送 PPT 标注。')}}}}

const START='/* sherlock:pptx-annotation-input:start:v1 */',END='/* sherlock:pptx-annotation-input:end:v1 */'
const DEFINITIONS=[...PPTX_ANNOTATION_INPUT_DEFINITIONS,createPptxAnnotationCoordinator,createPptxAnnotationRevealController,openPptxAnnotationPreview,annotationTargetVisible,annotationSkillRequest,createPptxAnnotationNativeRuntime,PptxAnnotationNativePortal,pptxAnnotationReferenceSource]
const BLOCK='\n'+START+'\n'+DEFINITIONS.map(value=>value.toString()).join('\n')+'\nlet PptxAnnotationNativeRuntime=null;\nconst PptxAnnotationOriginalRoot=ConversationRoot;\nConversationRoot=function(props){return react.createElement(react.Fragment,null,react.createElement(PptxAnnotationOriginalRoot,props),react.createElement(PptxAnnotationNativePortal,props))};\n'+END+'\n'
// Accept only the complete previous serialized block, never a partial installed definition.
const NOTICE_INTERCEPT=`  interceptSend(shell,draft,mode){
   if(!shell.snapshot.occurrences.some(value=>value.source==='pptx-annotation'))return false
   const previous=submissionNotices.get(shell)
   watch(submit(shell,mode).then(()=>{
    if(previous&&shell.notices?.getSnapshot()===previous)shell.notices.set(null)
    if(submissionNotices.get(shell)===previous)submissionNotices.delete(shell)
   },reason=>{
    shell.notify('error',error(reason).message)
    const notice=shell.notices?.getSnapshot();if(notice)submissionNotices.set(shell,notice)
   }));return true
  },`
const LEGACY_BLOCK=BLOCK.replace(',submissionNotices=new WeakMap()','').replace(NOTICE_INTERCEPT,"  interceptSend(shell,draft,mode){if(!shell.snapshot.occurrences.some(value=>value.source==='pptx-annotation'))return false;watch(submit(shell,mode).catch(reason=>shell.notify('error',error(reason).message)));return true},")
const ROOT_HOOK='const conversationController = new ConversationController(ctx, { input: inputHub, blocks: composerBlocks });'
const INSTALL='\n/* sherlock:pptx-annotation-input:install:v1 */\nctx.effect(()=>{if(window.top!==window||!window.sherlockPptAnnotations)return;const runtime=createPptxAnnotationNativeRuntime({window,document,sessions,inputHub,activeInput:eworkActiveInput,api:ctx.get("connection").api,serializeComponent:(ref,sessionId)=>serializeConversationComponentReference(ref,new AbortController().signal,sessionId)});PptxAnnotationNativeRuntime=runtime;return()=>{if(PptxAnnotationNativeRuntime===runtime)PptxAnnotationNativeRuntime=null;runtime.dispose()}},"PPT annotation native input");\nctx.inject(["inputTriggers"],scope=>scope.effect(()=>scope.get("inputTriggers").registerSource(pptxAnnotationReferenceSource()),"PPT annotation reference codec"));\n'
const SINK='sinkSerialized(draft, mode) {'
const SEND='\n/* sherlock:pptx-annotation-input:send:v1 */\nif(window[Symbol.for("sherlock:pptx-annotation-input")]?.interceptSend(this,draft,mode))return;\n'
const DEFAULT='defaultSink: (text, imageIds, mode) => {\n\t\t\t\t\t\tthis.sink(session, text, imageIds, mode);'
const ADMITTED='defaultSink: (text, imageIds, mode, annotationAdmission) => {\n\t\t\t\t\t\treturn this.sink(session, text, imageIds, mode, annotationAdmission?.pptxAnnotation===true?annotationAdmission:undefined);'
const TRANSACTIONS=[[SINK,SINK+SEND],[ROOT_HOOK,ROOT_HOOK+INSTALL],[DEFAULT,ADMITTED],['async sink(session, text, imageIds, mode) {','async sink(session, text, imageIds, mode, annotationAdmission) {'],['const shellSnapshot = shell?.snapshot;','const shellSnapshot = annotationAdmission?.pptxAnnotation===true?annotationAdmission:shell?.snapshot;']]
const exactly=(source,from,to)=>{if(source.split(from).length!==2)throw Error('PPT annotation native source drifted: '+from.slice(0,80));return source.replace(from,to)}
export function stripPptxAnnotationInput(source){
 if(!source.includes('sherlock:pptx-annotation-input:'))return source
 if(LEGACY_BLOCK===BLOCK||LEGACY_BLOCK.includes('submissionNotices'))throw Error('PPT annotation legacy notice adapter drifted')
 const start=source.indexOf('\n'+START),finish=source.indexOf(END,start),installed=start>=0&&finish>=0?source.slice(start,finish+END.length+1):''
 const knownPrior=['1449ab328137c2250b31a4dc36105cab365330a4a29d8187a95ade22d1d7a701','e29163c847d85ba75b4a41f079acf92ce7325323cd3640491739e40b6dbb1dcd','4aeef32cf0bb0c909e8a9d8a85c877211d5d1873b290c36781d2b9ae0b981a2b','8608bedd8a8e505c9bd7f54c89530e5aa75a91f2e09400172ed61d25f6c1540d','5fb255a72243b72715a0d686c878e7236606cd41fa21e52b538b254de1e18cd7','6cdea5bd6d2e13d65143f832a2ad9a62cc9eae948742e9af73778f9f74394adc'].includes(createHash('sha256').update(installed).digest('hex'))
 const block=source.includes(BLOCK)?BLOCK:source.includes(LEGACY_BLOCK)?LEGACY_BLOCK:knownPrior?installed:null
 if(source.split(START).length!==2||source.split(END).length!==2||!block)throw Error('PPT annotation installed source drifted')
 let result=source.replace(block,'');for(const[from,to]of TRANSACTIONS)result=exactly(result,to,from)
 if(result.includes('sherlock:pptx-annotation-input:'))throw Error('PPT annotation unknown or duplicate installed block')
 return result
}
export function patchPptxAnnotationInput(source){
 let result=stripPptxAnnotationInput(source)
 for(const[from,to]of TRANSACTIONS)result=exactly(result,from,to)
 return exactly(result,'function apply(ctx) {',BLOCK+'function apply(ctx) {')
}
