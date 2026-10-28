import {readFileSync} from 'node:fs'
import {Script} from 'node:vm'

/** One dictation owns one exact native input-machine revision; it never submits. */
export function createComposerVoiceSession(options){
 const {bridge,keyboard,document:doc,onChange=()=>{},onError=()=>{}}=options,win=doc.defaultView
 let request=null,disposed=false,writing=false,caret=null,caretFrame=0,interruptedInput=null,observer,state={active:false,state:null,levels:Array(12).fill(0)}
 const publish=patch=>{state={...state,...patch};onChange(state)}
 const clearCaret=()=>{caret=null;win.cancelAnimationFrame(caretFrame);caretFrame=0}
 const queueCaret=req=>{
  clearCaret();caret={input:req.input,text:req.text,revision:req.revision}
  caretFrame=win.requestAnimationFrame(()=>{
   const ticket=caret;caret=null;caretFrame=0
   if(!ticket||disposed||options.blocked?.()||options.input()!==ticket.input||doc.activeElement!==ticket.input||!visible(ticket.input)||keyboard.snapshot.draftRev!==ticket.revision||keyboard.snapshot.draft!==ticket.text||ticket.input.value!==ticket.text)return
   ticket.input.setSelectionRange(ticket.text.length,ticket.text.length)
  })
 }
 const cancel=req=>{try{Promise.resolve(bridge?.cancel(req.identity)).catch(()=>{})}catch{}}
 const stop=(cancelNative=true)=>{
  if(cancelNative)clearCaret()
  const req=request;if(!req)return false
  request=null;observer?.disconnect();publish({active:false,state:null,levels:Array(12).fill(0)})
  if(cancelNative&&req.started)cancel(req)
  return true
 }
 const visible=input=>{
  if(!input?.isConnected||input.disabled||input.readOnly||input.closest('[hidden],[inert],[aria-hidden="true"]'))return false
  for(let node=input;node;node=node.parentElement){const style=win.getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')return false}
  return true
 }
 const valid=req=>{
  const current=keyboard?.snapshot
  return !disposed&&request===req&&!keyboard?.disposed&&!options.blocked?.()&&options.input()===req.input&&visible(req.input)&&doc.activeElement===req.input&&current?.draft===req.text&&current.draftRev===req.revision&&current.phase==='plain'&&!current.imageIds?.length
 }
 const reconcile=()=>{if(request&&!valid(request))stop()}
 const receive=event=>{
  const req=request
  if(!req||event?.sessionId!==req.identity.sessionId||event.requestId!==req.identity.requestId)return
  if(!valid(req)){stop();return}
  if(event.type==='partial'||event.type==='final'){
   const text=typeof event.text==='string'?event.text.slice(0,12000):''
   if(text&&text!==req.text){
    writing=true
    try{keyboard.setDraft(text)}finally{writing=false}
    const next=keyboard.snapshot
    if(next.draft!==text){stop();return}
    req.text=next.draft;req.revision=next.draftRev
    queueCaret(req)
   }
   if(event.type==='final')stop(false)
  }else if(event.type==='state'&&['authorizing','listening','transcribing'].includes(event.state))publish({state:event.state})
  else if(event.type==='level'&&Number.isFinite(event.level))publish({levels:[...state.levels.slice(1),Math.max(0,Math.min(1,event.level))]})
  else if(event.type==='cancelled')stop(false)
  else if(event.type==='error'){stop(false);onError(event.message||'语音识别失败，请重试。')}
 }
 const unsubscribe=bridge?.subscribe?.(receive)||(()=>{})
 const unsubscribeDraft=keyboard?.state?.subscribe?.(()=>{if(!writing)reconcile()})||(()=>{})
 const modifier=key=>['Meta','Control','Alt','Shift'].includes(key)
 const key=event=>{
  clearCaret()
  if(request){
   const input=request.input;stop();interruptedInput=modifier(event.key)?input:null
  }else{
   if(!interruptedInput||modifier(event.key))return
   const input=interruptedInput;interruptedInput=null
   if(event.target!==input||doc.activeElement!==input||!visible(input))return
  }
  // A chord starts with its modifier keydown. Guard its first Enter after capture
  // stops, while preserving Shift newlines, IME commits and all later shortcuts.
  if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229&&!options.composing?.()){event.preventDefault();event.stopPropagation()}
 }
 const keyup=event=>{if(modifier(event.key))interruptedInput=null}
 const blur=event=>{if(event.target===interruptedInput)interruptedInput=null;if(event.target===caret?.input)clearCaret();if(request&&event.target===request.input)stop()}
 const edit=event=>{if(event.target===interruptedInput)interruptedInput=null;if(event.target===caret?.input)clearCaret();if(request&&event.target===request.input)stop()}
 const clearInteraction=()=>{interruptedInput=null;clearCaret()}
 doc.addEventListener('keydown',key,true);doc.addEventListener('keyup',keyup,true);doc.addEventListener('blur',blur,true)
 doc.addEventListener('beforeinput',edit,true);doc.addEventListener('compositionstart',edit,true)
 doc.addEventListener('pointerdown',clearInteraction,true)
 win.addEventListener('blur',clearInteraction)
 // Window blur only clears transient input work. Recording and permission-sheet
 // grace remain owned by the shared main controller.
 observer=new win.MutationObserver(reconcile)
 return{
  async start(){
   if(disposed||request||options.blocked?.()||keyboard?.disposed)return
   const input=options.input(),current=keyboard?.snapshot
   if(!visible(input)||current?.phase!=='plain'||current.draft.trim()||current.imageIds?.length)return
   if(typeof bridge?.startComposer!=='function'){onError('当前客户端暂不支持语音输入，请使用 macOS 本地客户端。');return}
   input.focus({preventScroll:true});if(doc.activeElement!==input)return
   clearCaret();interruptedInput=null
   const identity={sessionId:'composer-'+win.crypto.randomUUID(),requestId:'dictation-'+win.crypto.randomUUID()}
   const req={identity,input,text:current.draft,revision:current.draftRev,started:true};request=req
   observer.observe(doc.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','inert','aria-hidden','data-workspace-surface','data-research-active','class','style']})
   publish({active:true,state:'authorizing',levels:Array(12).fill(0)})
   try{
    const result=await bridge.startComposer(identity)
    if(request!==req){if(result?.ok)cancel(req);return}
    if(!result?.ok){stop();onError(result?.error||'无法开始语音输入，请重试。')}
    else reconcile()
   }catch(error){if(request===req){stop();onError('无法开始语音输入，请重试。')}}
  },
  stop,reconcile,
  dispose(){if(disposed)return;stop();interruptedInput=null;disposed=true;unsubscribe();unsubscribeDraft();observer.disconnect();doc.removeEventListener('keydown',key,true);doc.removeEventListener('keyup',keyup,true);doc.removeEventListener('blur',blur,true);doc.removeEventListener('beforeinput',edit,true);doc.removeEventListener('compositionstart',edit,true);doc.removeEventListener('pointerdown',clearInteraction,true);win.removeEventListener('blur',clearInteraction)}
 }
}

function useComposerVoice(react,options){
 const latest=react.useRef(options);latest.current=options
 const controller=react.useRef(null),[state,setState]=react.useState({active:false,state:null,levels:Array(12).fill(0)})
 const bridge=window.dshDesktop?.researchVoice
 react.useLayoutEffect(()=>{
  const {keyboard,sessionId}=options;let mounted=true
  const owned=createComposerVoiceSession({bridge,keyboard,document:document,input:()=>latest.current.inputRef.current,
   blocked:()=>latest.current.blocked||latest.current.keyboard!==keyboard||latest.current.sessionId!==sessionId,
   composing:()=>latest.current.composingRef.current,onChange:value=>{if(mounted)setState(value)},onError:text=>latest.current.showToast(text)})
  controller.current=owned;setState({active:false,state:null,levels:Array(12).fill(0)})
  return()=>{mounted=false;owned.dispose();if(controller.current===owned)controller.current=null}
 },[bridge,options.keyboard,options.sessionId])
 react.useLayoutEffect(()=>{controller.current?.reconcile()},[options.blocked,options.draftRev])
 react.useEffect(()=>{
  if(document.querySelector('[data-composer-voice-style]'))return
  const style=document.createElement('style');style.dataset.composerVoiceStyle='';style.textContent=composerVoiceCss;document.head.append(style)
 },[])
 return{...state,idle:options.empty&&!options.blocked&&!state.active,start:()=>controller.current?.start(),stop:()=>controller.current?.stop()}
}
function composerVoiceIcon(react){
 return react.createElement('svg',{viewBox:'0 0 18 18',width:18,height:18,'aria-hidden':true},react.createElement('path',{d:'M3 7v4M6 4v10M9 6v6M12 3v12M15 7v4',fill:'none',stroke:'currentColor',strokeWidth:1.5,strokeLinecap:'round'}))
}
function renderComposerVoicePill(react,voice){
 if(!voice.active)return null
 const label=voice.state==='authorizing'?'等待麦克风权限':voice.state==='transcribing'?'正在识别':'正在聆听'
 return react.createElement('div',{'data-composer-voice-pill':'',role:'group','aria-label':label},
  react.createElement('span',{'data-composer-voice-wave':'','data-level':voice.levels.at(-1),'aria-hidden':true},voice.levels.map((level,index)=>react.createElement('i',{key:index,style:{height:2+level*14+'px',opacity:.3+level*.7}}))),
  react.createElement('button',{type:'button','aria-label':'停止语音输入',title:'停止语音输入',onPointerDown:event=>{event.preventDefault();event.stopPropagation()},onMouseDown:event=>event.preventDefault(),onClick:event=>{event.preventDefault();event.stopPropagation();voice.stop()}},react.createElement('svg',{viewBox:'0 0 16 16',width:14,height:14,'aria-hidden':true},react.createElement('rect',{x:3,y:3,width:10,height:10,rx:1,fill:'currentColor'}))))
}
const START='/* sherlock:composer-voice:v1 */',END='/* sherlock:composer-voice:end */'
const exportAnchor='exports.ConversationRoot = ConversationRoot;'
const css=readFileSync(new URL('./composer-voice.css',import.meta.url),'utf8')
const definition=START+'\nconst composerVoiceCss='+JSON.stringify(css)+';\n'+[createComposerVoiceSession,useComposerVoice,composerVoiceIcon,renderComposerVoicePill].map(fn=>fn.toString()).join('\n')+'\n'+END+'\n'
const hooks=[
 ['const interruptible = running && continuable;',"const composerVoice=useComposerVoice(react,{keyboard,sessionId,inputRef,draftRev:input?.draftRev,empty:empty&&!input?.imageIds?.length,blocked:locked||machineBusy||running||canvasRunning||workspaceTrigger,composingRef,showToast});\nconst interruptible = running && continuable;"],
 ['const primaryLabel = primaryStops ? t("input.stop") : t("input.send");','const primaryLabel = composerVoice.idle ? "语音输入" : primaryStops ? t("input.stop") : t("input.send");'],
 ['const onPrimary = () => {','const onPrimary = () => {\nif(composerVoice.idle){void composerVoice.start();return}\nif(composerVoice.active)composerVoice.stop();'],
 ['"aria-label": primaryLabel,','"aria-label": primaryLabel,\n"data-composer-voice-trigger":composerVoice.idle?"true":undefined,\nonPointerDown:composerVoice.idle?event=>{event.preventDefault();inputRef.current?.focus({preventScroll:true})}:undefined,'],
 ['disabled: primaryStops ? stop === void 0 : empty || disabled || machineBusy,','disabled: composerVoice.idle ? false : primaryStops ? stop === void 0 : empty || disabled || machineBusy,'],
 ['children: primaryStops ? (0, react_jsx_runtime.jsx)("svg", {','children: composerVoice.idle ? composerVoiceIcon(react) : primaryStops ? (0, react_jsx_runtime.jsx)("svg", {']
]
const pillAnchor='(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {\n\t\t\t\t\t\t\t\t\t\t\tlabel: primaryLabel,'
const one=(source,before,after)=>{if(source.split(before).length!==2)throw Error('Composer voice anchor drifted: '+before.slice(0,90));return source.replace(before,after)}
export function stripComposerVoice(source){
 if(!source.includes(START)){if(source.includes('composerVoice.idle')||source.includes(END))throw Error('Composer voice orphan drifted');return source}
 // Runtime implementation evolves between installs. Own its unique, bounded
 // region while keeping the export boundary and every external hook strict.
 const start=source.indexOf(START),end=source.indexOf(END)
 if(source.split(START).length!==2||source.split(END).length!==2||end<start||!source.slice(end+END.length).startsWith('\n'+exportAnchor))throw Error('Composer voice runtime boundary drifted')
 const body=source.slice(start+START.length,end)
 let previous=-1
 for(const declaration of ['const composerVoiceCss=','function createComposerVoiceSession(','function useComposerVoice(','function composerVoiceIcon(','function renderComposerVoicePill(']){
  const position=body.indexOf(declaration)
  if(body.split(declaration).length!==2||position<=previous)throw Error('Composer voice runtime declaration drifted: '+declaration)
  previous=position
 }
 try{new Script(body)}catch(cause){throw Error('Composer voice runtime syntax drifted',{cause})}
 source=source.slice(0,start)+source.slice(end+END.length+1)
 source=one(source,'renderComposerVoicePill(react,composerVoice),'+pillAnchor,pillAnchor)
 for(const[before,after]of hooks)if(before!==after)source=one(source,after,before)
 return source
}
export function patchComposerVoice(source){
 source=stripComposerVoice(source)
 for(const[before,after]of hooks)if(before!==after)source=one(source,before,after)
 source=one(source,pillAnchor,'renderComposerVoicePill(react,composerVoice),'+pillAnchor)
 return one(source,exportAnchor,definition+exportAnchor)
}
