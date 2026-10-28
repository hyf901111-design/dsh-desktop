import {readFileSync} from 'node:fs'
import {Script} from 'node:vm'

/** One dictation owns a bounded speech span, never the user's complete draft. */
export function createComposerVoiceSession(options){
 const {bridge,keyboard,document:doc,onChange=()=>{},onError=()=>{}}=options,win=doc.defaultView
 let request=null,disposed=false,writing=false,caret=null,caretFrame=0,observer,state={active:false,state:null,levels:Array(12).fill(0)}
 const publish=patch=>{state={...state,...patch};onChange(state)}
 const clearCaret=()=>{caret=null;win.cancelAnimationFrame(caretFrame);caretFrame=0}
 const interaction=()=>{clearCaret();if(request)request.follow=false}
 const queueCaret=(req,selection)=>{
  clearCaret();if(doc.activeElement!==req.input)return
  caret={input:req.input,text:req.text,revision:req.revision,selection,request:req,observed:[req.input.selectionStart,req.input.selectionEnd]}
  caretFrame=win.requestAnimationFrame(()=>{
   const ticket=caret;caret=null;caretFrame=0
   if(!ticket||disposed||options.blocked?.()||options.input()!==ticket.input||doc.activeElement!==ticket.input||!visible(ticket.input)||keyboard.snapshot.draftRev!==ticket.revision||keyboard.snapshot.draft!==ticket.text||ticket.input.value!==ticket.text)return
   const actual=[ticket.input.selectionStart,ticket.input.selectionEnd]
   if(!actual.every((value,index)=>value===ticket.observed[index])&&!actual.every(value=>value===ticket.text.length)&&!actual.every((value,index)=>value===ticket.selection[index]))return
   ticket.request.selection=ticket.selection;ticket.input.setSelectionRange(...ticket.selection)
  })
 }
 const cancel=req=>{try{Promise.resolve(bridge?.cancel(req.identity)).catch(()=>{})}catch{}}
 const stop=(cancelNative=true)=>{
  if(cancelNative)clearCaret()
  const req=request;if(!req)return false
  request=null;win.clearTimeout(req.compositionTimer);win.clearTimeout(req.editTimer);observer?.disconnect();publish({active:false,state:null,levels:Array(12).fill(0)})
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
  return !disposed&&request===req&&!keyboard?.disposed&&!options.blocked?.()&&options.input()===req.input&&visible(req.input)&&current?.phase==='plain'&&!current.imageIds?.length
 }
 const detach=(req,text)=>{if(req.end>req.start)req.base=req.transcript;req.start=req.end=text.length}
 const acceptEdit=(req,current)=>{
  const next=current.draft,previous=req.text;let start=0,end=previous.length,nextEnd=next.length
  while(start<end&&start<nextEnd&&previous[start]===next[start])start++
  while(end>start&&nextEnd>start&&previous[end-1]===next[nextEnd-1]){end--;nextEnd--}
  if(end<=req.start){const shift=nextEnd-end;req.start+=shift;req.end+=shift}
  else if(start<req.end)detach(req,next)
  req.text=next;req.revision=current.draftRev;req.edit=null;req.follow=false;clearCaret()
 }
 const reconcile=()=>{
  const req=request;if(!req)return
  if(!valid(req)){stop();return}
  const current=keyboard.snapshot
  if(current.draft!==req.text||current.draftRev!==req.revision){
   if(req.edit&&req.edit.text===req.input.value&&current.draft===req.edit.text)acceptEdit(req,current)
   else stop()
  }
 }
 // After the user edits speech, a stable suffix of the old transcript anchors
 // only its new tail. Ambiguous wholesale ASR corrections are frozen rather
 // than guessing and resurrecting words that the user has already removed.
 const tail=(base,text)=>{
  if(text.startsWith(base))return text.slice(base.length)
  const points=Array.from(base)
  for(let count=Math.min(512,points.length);count>=Math.min(2,points.length);count--){
   const suffix=points.slice(-count).join(''),index=text.lastIndexOf(suffix)
   if(index>=0)return text.slice(index+suffix.length)
  }
  return null
 }
 const applyTranscript=(req,event)=>{
  const transcript=typeof event.text==='string'?event.text.slice(0,12000):''
  if(transcript){
   const speech=tail(req.base,transcript)
   if(speech===null){if(event.type==='final')stop(false);return}
   else{
    const text=req.text.slice(0,req.start)+speech+req.text.slice(req.end)
    if(text!==req.text){
     const map=offset=>offset<=req.start?offset:offset>=req.end?offset+speech.length-(req.end-req.start):Math.min(offset,req.start+speech.length)
     const selection=req.follow?[text.length,text.length]:[map(req.input.selectionStart),map(req.input.selectionEnd)]
     writing=true
     try{keyboard.setDraft(text)}finally{writing=false}
     const next=keyboard.snapshot
     if(next.draft!==text){stop();return}
     req.text=next.draft;req.revision=next.draftRev;req.end=req.start+speech.length;queueCaret(req,selection)
    }
   }
   req.transcript=transcript
  }
  if(event.type==='final')stop(false)
 }
 const flushComposition=req=>{
  win.clearTimeout(req.compositionTimer);req.compositionTimer=0
  if(request!==req)return
  if(req.composing||options.composing?.()){req.compositionTimer=win.setTimeout(()=>flushComposition(req),16);return}
  reconcile();if(request!==req)return
  const pending=req.pending;req.pending=null;if(pending)applyTranscript(req,pending)
 }
 const receive=event=>{
  const req=request
  if(!req||event?.sessionId!==req.identity.sessionId||event.requestId!==req.identity.requestId)return
  reconcile();if(request!==req)return
  if(event.type==='partial'||event.type==='final'){
   if(req.composing||req.compositionTimer||options.composing?.()){if(req.pending?.type!=='final')req.pending=event;return}
   applyTranscript(req,event)
  }else if(event.type==='state'&&['authorizing','listening','transcribing'].includes(event.state))publish({state:event.state})
  else if(event.type==='level'&&Number.isFinite(event.level))publish({levels:[...state.levels.slice(1),Math.max(0,Math.min(1,event.level))]})
  else if(event.type==='cancelled')stop(false)
  else if(event.type==='error'){stop(false);onError(event.message||'语音识别失败，请重试。')}
 }
 const unsubscribe=bridge?.subscribe?.(receive)||(()=>{})
 const unsubscribeDraft=keyboard?.state?.subscribe?.(()=>{if(!writing)reconcile()})||(()=>{})
 const key=event=>{
  interaction()
  if(!request)return
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();stop();return}
  if(event.target===request.input&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229&&!request.composing&&!options.composing?.()){event.preventDefault();event.stopPropagation()}
 }
 const blur=event=>{if(event.target===request?.input)interaction()}
 const beforeEdit=event=>{if(event.target===request?.input)interaction()}
 const input=event=>{
  const req=request;if(event.target!==req?.input)return
  interaction();if(!event.isTrusted){stop();return}
  const ticket={text:req.input.value};req.edit=ticket
  if(req.compositionTimer){win.clearTimeout(req.compositionTimer);req.compositionTimer=win.setTimeout(()=>flushComposition(req),16)}
  win.clearTimeout(req.editTimer);req.editTimer=win.setTimeout(()=>{req.editTimer=0;if(request!==req||req.edit!==ticket)return;reconcile();req.edit=null},0)
 }
 const compositionStart=event=>{if(event.target===request?.input){interaction();request.composing=true}}
 const compositionEnd=event=>{
  const req=request;if(event.target!==req?.input)return
  req.composing=false;win.clearTimeout(req.compositionTimer)
  // React's composition-end handler and the final native input commit run
  // before this task; its composingRef itself settles on a short timer.
  req.compositionTimer=win.setTimeout(()=>flushComposition(req),16)
 }
 const selection=event=>{const req=request;if(req&&event.target===req.input&&req.follow&&!writing&&!caret&&req.input.value===req.text&&(req.input.selectionStart!==req.selection[0]||req.input.selectionEnd!==req.selection[1]))interaction()}
 doc.addEventListener('keydown',key,true);doc.addEventListener('blur',blur,true)
 doc.addEventListener('beforeinput',beforeEdit,true);doc.addEventListener('input',input,true);doc.addEventListener('compositionstart',compositionStart,true);doc.addEventListener('compositionend',compositionEnd,true);doc.addEventListener('select',selection,true)
 doc.addEventListener('pointerdown',interaction,true);win.addEventListener('blur',interaction)
 observer=new win.MutationObserver(reconcile)
 return{
  async start(){
   if(disposed||request||options.blocked?.()||keyboard?.disposed)return
   const input=options.input(),current=keyboard?.snapshot
   if(!visible(input)||current?.phase!=='plain'||current.draft.trim()||current.imageIds?.length)return
   if(typeof bridge?.startComposer!=='function'){onError('当前客户端暂不支持语音输入，请使用 macOS 本地客户端。');return}
   input.focus({preventScroll:true});if(doc.activeElement!==input)return
   clearCaret()
   const identity={sessionId:'composer-'+win.crypto.randomUUID(),requestId:'dictation-'+win.crypto.randomUUID()}
   const req={identity,input,text:current.draft,revision:current.draftRev,started:true,transcript:'',base:'',start:0,end:0,follow:true,selection:[input.selectionStart,input.selectionEnd],composing:false,pending:null,compositionTimer:0,editTimer:0,edit:null};request=req
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
  dispose(){if(disposed)return;stop();disposed=true;unsubscribe();unsubscribeDraft();observer.disconnect();doc.removeEventListener('keydown',key,true);doc.removeEventListener('blur',blur,true);doc.removeEventListener('beforeinput',beforeEdit,true);doc.removeEventListener('input',input,true);doc.removeEventListener('compositionstart',compositionStart,true);doc.removeEventListener('compositionend',compositionEnd,true);doc.removeEventListener('select',selection,true);doc.removeEventListener('pointerdown',interaction,true);win.removeEventListener('blur',interaction)}
 }
}

function useComposerVoice(react,options){
 const latest=react.useRef(options);latest.current=options
 const controller=react.useRef(null),[state,setState]=react.useState({active:false,present:false,state:null,levels:Array(12).fill(0)})
 const bridge=window.dshDesktop?.researchVoice
 react.useLayoutEffect(()=>{
  const {keyboard,sessionId}=options;let mounted=true,exitTimer=0
  const change=value=>{
   if(!mounted)return
   window.clearTimeout(exitTimer);exitTimer=0
   if(value.active){setState({...value,present:true});return}
   const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
   setState(previous=>({...value,present:!reduced&&previous.present,levels:previous.levels}))
   if(!reduced)exitTimer=window.setTimeout(()=>{exitTimer=0;if(mounted)setState(previous=>previous.active?previous:{...previous,present:false})},240)
  }
  const owned=createComposerVoiceSession({bridge,keyboard,document:document,input:()=>latest.current.inputRef.current,
   blocked:()=>latest.current.blocked||latest.current.keyboard!==keyboard||latest.current.sessionId!==sessionId,
   composing:()=>latest.current.composingRef.current,onChange:change,onError:text=>latest.current.showToast(text)})
  controller.current=owned;setState({active:false,present:false,state:null,levels:Array(12).fill(0)})
  return()=>{mounted=false;window.clearTimeout(exitTimer);owned.dispose();if(controller.current===owned)controller.current=null}
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
 if(!voice.present)return null
 const label=voice.state==='authorizing'?'等待麦克风权限':voice.state==='transcribing'?'正在识别':'正在聆听'
 return react.createElement('div',{'data-composer-voice-pill':'','data-open':String(voice.active),role:voice.active?'group':undefined,'aria-label':voice.active?label:undefined,'aria-hidden':!voice.active||undefined},
  react.createElement('div',{'data-composer-voice-content':''},
  react.createElement('span',{'data-composer-voice-wave':'','data-level':voice.levels.at(-1),'aria-hidden':true},voice.levels.map((level,index)=>react.createElement('i',{key:index,style:{height:2+level*14+'px',opacity:.3+level*.7}}))),
  react.createElement('button',{type:'button',disabled:!voice.active,tabIndex:voice.active?undefined:-1,'aria-label':voice.active?'停止语音输入':undefined,title:voice.active?'停止语音输入':undefined,onPointerDown:voice.active?event=>{event.preventDefault();event.stopPropagation()}:undefined,onMouseDown:voice.active?event=>event.preventDefault():undefined,onClick:voice.active?event=>{event.preventDefault();event.stopPropagation();voice.stop()}:undefined},react.createElement('svg',{viewBox:'0 0 16 16',width:14,height:14,'aria-hidden':true},react.createElement('rect',{x:3,y:3,width:10,height:10,rx:1,fill:'currentColor'})))))
}
const START='/* sherlock:composer-voice:v1 */',END='/* sherlock:composer-voice:end */'
const exportAnchor='exports.ConversationRoot = ConversationRoot;'
const css=readFileSync(new URL('./composer-voice.css',import.meta.url),'utf8')
const definition=START+'\nconst composerVoiceCss='+JSON.stringify(css)+';\n'+[createComposerVoiceSession,useComposerVoice,composerVoiceIcon,renderComposerVoicePill].map(fn=>fn.toString()).join('\n')+'\n'+END+'\n'
const hooks=[
 ['const interruptible = running && continuable;',"const composerVoice=useComposerVoice(react,{keyboard,sessionId,inputRef,draftRev:input?.draftRev,empty:empty&&!input?.imageIds?.length,blocked:locked||machineBusy||running||canvasRunning||workspaceTrigger,composingRef,showToast});\nconst interruptible = running && continuable;"],
 ['const primaryLabel = primaryStops ? t("input.stop") : t("input.send");','const primaryLabel = composerVoice.idle ? "语音输入" : composerVoice.active ? "请先停止语音输入再发送" : primaryStops ? t("input.stop") : t("input.send");'],
 ['const onPrimary = () => {','const onPrimary = () => {\nif(composerVoice.idle){void composerVoice.start();return}\nif(composerVoice.active)return;'],
 ['"aria-label": primaryLabel,','"aria-label": primaryLabel,\n"data-composer-voice-trigger":composerVoice.idle?"true":undefined,\nonPointerDown:composerVoice.idle?event=>{event.preventDefault();inputRef.current?.focus({preventScroll:true})}:undefined,'],
 ['disabled: primaryStops ? stop === void 0 : empty || disabled || machineBusy,','disabled: composerVoice.active ? true : composerVoice.idle ? false : primaryStops ? stop === void 0 : empty || disabled || machineBusy,'],
 ['children: primaryStops ? (0, react_jsx_runtime.jsx)("svg", {','children: composerVoice.idle ? composerVoiceIcon(react) : primaryStops ? (0, react_jsx_runtime.jsx)("svg", {']
]
const previousHooks=new Map([
 [hooks[1][0],'const primaryLabel = composerVoice.idle ? "语音输入" : primaryStops ? t("input.stop") : t("input.send");'],
 [hooks[2][0],'const onPrimary = () => {\nif(composerVoice.idle){void composerVoice.start();return}\nif(composerVoice.active)composerVoice.stop();'],
 [hooks[4][0],'disabled: composerVoice.idle ? false : primaryStops ? stop === void 0 : empty || disabled || machineBusy,']
])
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
 for(const[before,after]of hooks)if(before!==after)source=one(source,source.includes(after)?after:previousHooks.get(before)||after,before)
 return source
}
export function patchComposerVoice(source){
 source=stripComposerVoice(source)
 for(const[before,after]of hooks)if(before!==after)source=one(source,before,after)
 source=one(source,pillAnchor,'renderComposerVoicePill(react,composerVoice),'+pillAnchor)
 return one(source,exportAnchor,definition+exportAnchor)
}
