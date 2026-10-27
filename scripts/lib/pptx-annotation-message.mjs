import {createHash} from 'node:crypto'
import {parsePptxAnnotationLocator} from './pptx-annotation-input.mjs'
import {pptxAnnotationAssets} from './pptx-annotation-assets.mjs'

/** The embedded path is only a lookup hint; Main authorizes the complete human event. */
export function pptxAnnotationMessageRequest(text,sessionId,source,userSeq){
 if(typeof text!=='string'||!text||text.length>1048576||text.includes('\0')||typeof sessionId!=='string'||!sessionId||sessionId.length>1024||/[\u0000-\u001f]/.test(sessionId)||source?.kind!=='user'||typeof source.rpcId!=='string'||!source.rpcId||source.rpcId.length>1024||/[\u0000-\u001f]/.test(source.rpcId)||!Number.isSafeInteger(userSeq)||userSeq<0)return null
 const ids=new Set([...text.matchAll(/\.ework\/pptx-annotations\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\/manifest\.json/g)].map(match=>match[1]))
 if(ids.size!==1)return null
 return{sendingSessionId:sessionId,preparedId:[...ids][0],userSeq,submissionId:source.rpcId,text}
}

/** Qualify a short bounded loading hint, never a label or an authorization. */
export function pptxAnnotationMessageLoadingCandidate(input){
 if(!input||typeof input.text!=='string'||typeof input.preparedId!=='string'||!(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/).test(input.preparedId))return false
 const id=input.preparedId,lines=input.text.split('\n'),manifest='修改清单：`.ework/pptx-annotations/'+id+'/manifest.json`',source='输入副本：`.ework/pptx-annotations/'+id+'/',destination='必须另存到：`PPT标注修改/'+id+'/'
 return lines.some((line,index)=>{
  const instruction='按清单里的物理页、位置和备注完成真实 PPT 修改；保留原件。'
  if(!/^\[PPT 标注 [1-9]\d* · 第 [1-9]\d* 页\]$/.test(line)||lines[index+1]!==manifest||!lines[index+2]?.startsWith(source)||!lines[index+3]?.startsWith(destination)||!(lines[index+4]===instruction||lines[index+4]?.startsWith(instruction+' ')))return false
  const inputName=lines[index+2].slice(source.length),outputName=lines[index+3].slice(destination.length)
  return /^[1-9]\d*-source\.pptx`$/.test(inputName)&&outputName.endsWith('.pptx`')&&!/[`\r]/.test(outputName.slice(0,-1))
 })
}

/** Never infer ranges or labels from the message: consume only the exact readonly receipt. */
export function pptxAnnotationMessageSegments(input,value){
 if(!input||!value||typeof value!=='object'||value.preparedId!==input.preparedId||value.submissionId!==input.submissionId||value.userSeq!==input.userSeq||value.text!==input.text||!Array.isArray(value.spans)||!value.spans.length||value.spans.length>1024)return null
 const replacements=[],references=new Set()
 for(const span of value.spans){
  if(span?.kind!=='pptx-annotation'||!Number.isSafeInteger(span.ordinal)||span.ordinal<1||typeof span.label!=='string'||!span.label||span.label.length>1024||typeof span.comment!=='string')return null
  let reference;try{reference=parsePptxAnnotationLocator(span.reference)}catch{return null}
  const referenceKey=JSON.stringify(reference)
  if(reference.sessionId!==input.sendingSessionId||references.has(referenceKey))return null
  references.add(referenceKey)
  replacements.push({...span,reference})
 }
 if(value.skill!==undefined){
  const skill=value.skill
  if(!skill||skill.id!=='builtin:efund-ppt-maker'||typeof skill.label!=='string'||!skill.label||skill.label.length>1024||typeof skill.text!=='string'||!/^\/(?:ework-skill-[a-f0-9]{16}|efund-ppt-maker)$/.test(skill.text))return null
  replacements.push({...skill,kind:'skill'})
 }
 replacements.sort((a,b)=>a.start-b.start)
 const parts=[];let cursor=0
 for(const span of replacements){
  if(!Number.isSafeInteger(span.start)||!Number.isSafeInteger(span.end)||span.start<cursor||span.end<=span.start||span.end>input.text.length||typeof span.text!=='string'||input.text.slice(span.start,span.end)!==span.text)return null
  if(span.start>cursor)parts.push({kind:'text',text:input.text.slice(cursor,span.start)})
  parts.push(span);cursor=span.end
 }
 if(cursor<input.text.length)parts.push({kind:'text',text:input.text.slice(cursor)})
 // Only a live, exact submitted ticket may retain its display numbers across admission.
 // Cold historical messages keep the frozen Main ordinals; no history is rewritten.
 let display;try{display=globalThis.window?.[Symbol.for('sherlock:pptx-annotation-input')]?.messageDisplayOrdinals?.({sessionId:input.sendingSessionId,preparedId:input.preparedId,submissionId:input.submissionId,text:input.text})}catch{}
 if(display?.sessionId===input.sendingSessionId&&display.preparedId===input.preparedId&&display.submissionId===input.submissionId&&display.text===input.text&&Array.isArray(display.marks)){
  const numbers=new Map();try{for(const mark of display.marks){const key=JSON.stringify(parsePptxAnnotationLocator(mark.reference));if(numbers.has(key)||!Number.isSafeInteger(mark.ordinal)||mark.ordinal<1)throw Error('Invalid display ordinal');numbers.set(key,mark)}}catch{return parts}
  if(numbers.size===references.size&&parts.filter(part=>part.kind==='pptx-annotation').every(part=>numbers.get(JSON.stringify(part.reference))?.canonicalOrdinal===part.ordinal))return parts.map(part=>part.kind==='pptx-annotation'?{...part,canonicalOrdinal:part.ordinal,ordinal:numbers.get(JSON.stringify(part.reference)).ordinal}:part)
 }
 return parts
}

/** No content cache crosses the native account boundary. Listen only while a candidate is mounted. */
export function createPptxAnnotationMessageScope(target){
 let epoch=0,owner=null;const listeners=new Set()
 const notify=()=>{epoch++;for(const listener of listeners)listener()}
 const reset=()=>{owner=null;notify()}
 const presentation=event=>{const next=event.detail?.owner;if(typeof next==='string'){const changed=owner!==null&&next!==owner;owner=next;if(changed)notify()}}
 return{getSnapshot:()=>epoch,subscribe(listener){
  if(!listeners.size){target.addEventListener('sherlock:skill-menu-reset',reset);target.addEventListener('sherlock:skill-presentation',presentation)}
  listeners.add(listener)
  return()=>{listeners.delete(listener);if(!listeners.size){target.removeEventListener('sherlock:skill-menu-reset',reset);target.removeEventListener('sherlock:skill-presentation',presentation)}}
 }}
}

export function usePptxAnnotationMessage(text,identity,userSeq){
 const sessionId=identity?.sessionId,kind=identity?.source?.kind,rpcId=identity?.source?.rpcId
 const input=react.useMemo(()=>pptxAnnotationMessageRequest(text,sessionId,{kind,rpcId},userSeq),[text,sessionId,kind,rpcId,userSeq])
 const loadingCandidate=react.useMemo(()=>pptxAnnotationMessageLoadingCandidate(input),[input])
 const epoch=react.useSyncExternalStore(input?messageScope.subscribe:messageNoopSubscribe,input?messageScope.getSnapshot:messageZero,input?messageScope.getSnapshot:messageZero)
 const skills=typeof skillPresentationStore==='function'?skillPresentationStore():null
 const skillRevision=react.useSyncExternalStore(input&&skills?skills.subscribe:messageNoopSubscribe,input&&skills?skills.version:messageZero,input&&skills?skills.version:messageZero)
 const available=typeof window.sherlockPptAnnotations?.messagePresentation==='function'
 const key=input?JSON.stringify([epoch,input.sendingSessionId,input.preparedId,input.userSeq,input.submissionId,input.text]):null
 const [state,setState]=react.useState(null),owned=key!==null&&state?.key===key?state:null
 react.useEffect(()=>{
  if(!input||!available||owned?.parts?.some(part=>part.kind==='skill'))return
  let current=true,timer=null
  const initial=owned??{key,parts:null,pending:loadingCandidate,loadingUntil:loadingCandidate?Date.now()+2500:0,requesting:true}
  if(!owned)setState(initial)
  if(initial.pending)timer=window.setTimeout(()=>{
   if(current&&messageScope.getSnapshot()===epoch)setState(value=>value?.key===key?{...value,pending:false,loadingUntil:0}:value)
  },Math.max(0,initial.loadingUntil-Date.now()))
  const finish=parts=>{
   if(!current||messageScope.getSnapshot()!==epoch)return
   if(timer!==null)window.clearTimeout(timer)
   setState({key,parts,pending:false,loadingUntil:0,requesting:false})
  }
  Promise.resolve().then(()=>current&&messageScope.getSnapshot()===epoch?window.sherlockPptAnnotations.messagePresentation(input):null).then(result=>finish(result?.ok===true?pptxAnnotationMessageSegments(input,result.value):null)).catch(()=>finish(null))
  return()=>{current=false;if(timer!==null)window.clearTimeout(timer)}
 },[key,skillRevision,available])
 if(key===null)return null
 if(owned)return owned.parts??(owned.pending?messagePending:owned.requesting?messageLookupPending:null)
 return available?(loadingCandidate?messagePending:messageLookupPending):null
}

export function PptxAnnotationSentReference({part}){
 const [error,setError]=react.useState(null),[busy,setBusy]=react.useState(false),owner=react.useRef(null)
 const key=JSON.stringify(part.reference);owner.current=key
 react.useEffect(()=>{owner.current=key;setError(null);setBusy(false);return()=>{owner.current=null}},[key])
 const label='标注 '+part.ordinal+' · '+part.label
 const reveal=async()=>{
  const expected=key;setError(null);setBusy(true)
  try{
   const api=window[Symbol.for('sherlock:pptx-annotation-input')]
   if(typeof api?.revealReference!=='function')throw Error('PPT 标注尚未就绪，请稍后重新打开。')
   if(await api.revealReference(key)!==true)throw Error('未能打开原文件标注，请重试。')
  }catch(reason){if(owner.current===expected)setError(reason?.message||'原文件暂不可用，请重新打开。')}
  finally{if(owner.current===expected)setBusy(false)}
 }
 return react.createElement(react.Fragment,null,
  react.createElement('button',{type:'button',className:MessageItem_module_css_default.refChip+' pptxa-sent-reference','data-ref-chip':'pptx-annotation','data-pptx-sent-reference':part.reference.markId,'aria-label':label,title:label,'aria-busy':busy||undefined,disabled:busy,onClick:reveal},react.createElement('span',{className:'pptxa-reference-pin','aria-hidden':true},react.createElement('img',{src:messagePinAsset,width:18,height:18,alt:'',draggable:false}),react.createElement('span',{className:'pptxa-reference-number'},String(part.ordinal))),react.createElement('span',{className:'pptxa-sent-label'},part.label)),
  error&&react.createElement('small',{role:'alert','data-pptx-sent-reveal-error':'',style:{display:'block',fontSize:12,marginTop:6}},error))
}
export function renderPptxAnnotationMessage(parts,raw,original,research,openFile){
 // Existing structured Research headers have their own hidden-context/offset protocol.
 if(!parts||original.text!==raw||original.files.length||(original.artifacts?.length??0)||(original.occurrences?.length??0)||(original.artifactOccurrences?.length??0))return projectResearchUserText(research,openFile)
 if(parts.pending===true)return parts.passthrough?projectResearchUserText(research,openFile):react.createElement('span',{'data-pptx-sent-loading':'',role:'status'},'正在载入标注…')
 return react.createElement(react.Fragment,null,...parts.map((part,index)=>{
  if(part.kind==='text')return react.createElement(react.Fragment,{key:index},projectUserText(part.text,openFile))
  if(part.kind==='skill')return react.createElement('span',{key:index,className:MessageItem_module_css_default.refChip,'data-ref-chip':'skill','data-pptx-sent-skill':'',title:part.label},part.label)
  return react.createElement(PptxAnnotationSentReference,{key:index,part})
 }))
}

const begin='/* sherlock:pptx-annotation-message:begin:v1 */',end='/* sherlock:pptx-annotation-message:end:v1 */'
const restore='/* SHERLOCK_PPTX_ANNOTATION_MESSAGE_RESTORE '
const hooks=[
 ['const seatProps = (0, react.useMemo)(() => ({\n\t\t\t\tuseSession,','const seatProps = (0, react.useMemo)(() => ({\n\t\t\t\tannotationSessionId: sessionId,\n\t\t\t\tuseSession,'],
 ['}), [\n\t\t\t\tuseSession,\n\t\t\t\tresearchTaskIdentity,','}), [\n\t\t\t\tsessionId,\n\t\t\t\tuseSession,\n\t\t\t\tresearchTaskIdentity,'],
 ['const routedOwner = {\n\t\t\t\teworkRevealOwner:useSession,','const routedOwner = {\n\t\t\t\tannotationSessionId: arguments[0].annotationSessionId,\n\t\t\t\teworkRevealOwner:useSession,'],
 ['eventSeq: data.seq,\n\t\t\t\tcontent: data.content,','eventSeq: data.seq,\n\t\t\t\tannotationIdentity: { sessionId: arguments[0].annotationSessionId, source: data.source },\n\t\t\t\tcontent: data.content,'],
 ['const { text, images, rest } = contentParts(content);\n\t\t\tconst originalResearch','const { text, images, rest } = contentParts(content);\nconst annotationPresentation=pptxAnnotationMessageRuntime.usePresentation(text,arguments[0].annotationIdentity,eventSeq);\n\t\t\tconst originalResearch'],
 ['projectResearchUserText(research, openFile), rest.map','pptxAnnotationMessageRuntime.render(annotationPresentation,text,originalResearch,research,openFile), rest.map'],
]
const runtime=()=>begin+'\nconst pptxAnnotationMessageRuntime=(()=>{\n'+[parsePptxAnnotationLocator,pptxAnnotationMessageRequest,pptxAnnotationMessageLoadingCandidate,pptxAnnotationMessageSegments,createPptxAnnotationMessageScope,usePptxAnnotationMessage,PptxAnnotationSentReference,renderPptxAnnotationMessage].map(fn=>fn.toString()).join('\n')+'\nconst messageScope=createPptxAnnotationMessageScope(window),messageNoopSubscribe=()=>()=>{},messageZero=()=>0,messagePending=Object.freeze({pending:true}),messageLookupPending=Object.freeze({pending:true,passthrough:true}),messagePinAsset='+JSON.stringify(pptxAnnotationAssets['pin18-normal'])+';\nreturn{usePresentation:usePptxAnnotationMessage,render:renderPptxAnnotationMessage};\n})();\n'+end+'\n'
function priorMessageRuntime(source){
 const start=source.indexOf(begin),finish=source.indexOf(end,start);if(start<0||finish<0)return null
 const value=source.slice(start,finish+end.length+1)
 return ['0e37ceacc17787da54a64c0143820bafa75ae5ca13e72f7d8a3c8d293ad82f67','7dbc94c52c9517a1b035d35dc22dac3c62b619ce0e38ed9836f4d17c5bd8f5fe','a304f6269b6d0e9f18ea2ea6d2b047b43801a48bef8792c04a8885f202839cd9'].includes(createHash('sha256').update(value).digest('hex'))?value:null
}
function once(source,before,after){if(source.split(before).length!==2)throw Error('PPT annotation message anchor drifted');return source.replace(before,after)}
export function stripPptxAnnotationMessages(source){
 if(!source.includes(begin)&&!source.includes(restore)){
  if(source.includes('pptxAnnotationMessageRuntime.')||source.includes('annotationIdentity: { sessionId: arguments[0].annotationSessionId'))throw Error('PPT annotation message orphan drifted')
  return source
 }
 const marker=source.match(/\/\* SHERLOCK_PPTX_ANNOTATION_MESSAGE_RESTORE ([^\n]+) \*\//g)
 if(!marker||marker.length!==1||source.split(begin).length!==2||source.split(end).length!==2)throw Error('PPT annotation message metadata drifted')
 const metadata=JSON.parse(marker[0].slice(restore.length,-3))
 if(JSON.stringify(metadata)!==JSON.stringify(hooks))throw Error('PPT annotation message restore drifted')
 let next=source.replace('\n'+marker[0]+'\n','')
 next=once(next,priorMessageRuntime(next)??runtime(),'')
 for(const [before,after]of [...hooks].reverse())next=once(next,after,before)
 return next
}
export function patchPptxAnnotationMessages(source){
 const base=stripPptxAnnotationMessages(source)
 let next=base
 for(const [before,after]of hooks)next=once(next,before,after)
 const anchor='function UserStyleBubble('
 next=once(next,anchor,runtime()+anchor)
 next+='\n'+restore+JSON.stringify(hooks)+' */\n'
 if(base!==source&&next!==source&&!priorMessageRuntime(source))throw Error('PPT annotation message installed state drifted')
 return next
}
