import {createHash} from 'node:crypto'

export function createNativeConversationSubmissions(){
 const entries=new Map(),seen=new Set(),listeners=new Set(),knownRejections=new WeakSet(),retired=new Set();let revision=0,stopCurrent=null,annotationReader=()=>null,sequence=0
 const notify=()=>{revision++;for(const listener of listeners)listener()}
 const clear=entry=>{if(entries.get(entry.rpcId)!==entry)return;entries.delete(entry.rpcId);entry.off?.();notify()}
 const all=sessionId=>[...entries.values()].filter(entry=>entry.sessionId===sessionId&&entry.current())
 const turnOf=node=>{const turn=node?.location?.turn?.turn??node?.data?.turn;return Number.isSafeInteger(turn)?turn:null}
 const identity=(sessionId,key)=>sessionId+'\0'+key
 const remember=(sessionId,key)=>{retired.add(identity(sessionId,key));if(retired.size>512)retired.delete(retired.values().next().value)}
 const retire=entry=>{remember(entry.sessionId,'rpc:'+entry.rpcId);if(entry.messageId)remember(entry.sessionId,'id:'+entry.messageId)}
 const settle=(entry,node)=>{if(entries.get(entry.rpcId)!==entry)return;const turn=turnOf(node);for(const other of entries.values())if(other.sessionId===entry.sessionId&&other.predecessors.includes(entry.rpcId)&&turn!==null)other.barrierTurn=Math.max(other.barrierTurn,turn);retire(entry);clear(entry)}
 return{
  subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},version:()=>revision,
  read:sessionId=>all(sessionId)[0]??null,all,consume(entry,node){if(['user','steering'].includes(node?.kind)&&node.data?.source?.kind==='user'&&node.data.source.rpcId===entry.rpcId)settle(entry,node);else clear(entry)},
  annotation(sessionId,rpcId,text){return annotationReader(sessionId,rpcId,text)},
  queue(sessionId,inbox,nodeStore){
   const received=new Set([...nodeStore?.values()??[]].filter(node=>['user','steering'].includes(node?.kind)&&node.data?.source?.kind==='user'&&typeof node.data.source.rpcId==='string').map(node=>node.data.source.rpcId))
   return inbox.flatMap(row=>{
    if(row.placement!=='queued')return[row]
    const entry=entries.get(row.source?.rpcId),owned=entry?.sessionId===sessionId
    if(owned&&(entry.initialImmediate||entry.admitted||entry.mode==='steer')||received.has(row.source?.rpcId)||retired.has(identity(sessionId,'rpc:'+row.source?.rpcId))||retired.has(identity(sessionId,'id:'+(row.messageId??row.id))))return[]
    // An older queue replay cannot undo an edit already observed durably.
    if(owned&&Number.isSafeInteger(row.anchorSeq)&&row.anchorSeq<entry.queueAnchor){const text=entry.content.every(part=>part.type==='text')?entry.content.map(part=>part.text).join(''):null,preview=entry.content.map(part=>part.type==='text'?part.text:'['+part.type+']').join(' ').replace(/\s+/g,' ').trim(),chars=Array.from(preview);return[{...row,content:entry.content,text,preview:chars.length>200?chars.slice(0,200).join('')+'…':preview}]}
    return[row]
   })
  },
  watch({api,sessions,inputHub}){
   stopCurrent?.()
   if(typeof api?.subscribeEnvelopes!=='function'||!sessions?.list)return()=>{}
   let closed=false,off=()=>{},offList=()=>{},owner=sessions.list.getSnapshot().current
   const inboxes=new Map(),updates=new Map()
   const stop=()=>{if(closed)return;closed=true;off();offList();for(const entry of [...entries.values()])clear(entry);inboxes.clear();updates.clear();retired.clear();if(stopCurrent===stop)stopCurrent=null}
   stopCurrent=stop
   const current=entry=>{try{return!closed&&sessions.list.getSnapshot().current===entry.sessionId&&sessions.binding(entry.sessionId)?.session===entry.session&&inputHub.shells.get(entry.sessionId)===entry.shell&&!entry.shell.disposed&&!entry.session.getSnapshot().removed}catch{return false}}
   annotationReader=(sessionId,rpcId,text)=>{
    try{
     const session=sessions.binding(sessionId)?.session,shell=inputHub.shells.get(sessionId),subject={sessionId,session,shell},annotations=typeof window==='object'?window[Symbol.for('sherlock:pptx-annotation-input')]:null,query={sessionId,shell,submissionId:rpcId,text}
     if(!session||!shell||!current(subject))return null
     const proof=annotations?.pendingMessagePresentation?.(query)
     return proof?.text===text&&proof.submissionId===rpcId&&Array.isArray(proof.parts)?{...proof,sessionId,current:()=>current(subject)&&window[Symbol.for('sherlock:pptx-annotation-input')]===annotations&&annotations.pendingMessagePresentation(query)?.preparedId===proof.preparedId}:null
    }catch{return null}
   }
   const contentOf=(entry,content)=>{if(JSON.stringify(entry.content)!==JSON.stringify(content))entry.annotation=null;entry.content=structuredClone(content)}
   const observeQueue=(sessionId,items)=>{
    let changed=false
    for(const row of items??[]){const message=row.message??row,rpcId=message.source?.rpcId,entry=entries.get(rpcId);if(!entry||entry.sessionId!==sessionId||!entry.current())continue
     const anchor=row.anchorSeq??-1;if(anchor<entry.queueAnchor)continue
     entry.queueAnchor=anchor;entry.messageId=message.id??row.messageId??row.id
     if(Array.isArray(message.content))contentOf(entry,message.content)
     if(row.placement==='steering')entry.mode='steer'
     changed=true
    }
    if(changed)notify()
   }
   const observeEvent=(sessionId,event)=>{
    if(sessionId!==sessions.list.getSnapshot().current||!Number.isSafeInteger(event?.seq))return
    let state=inboxes.get(sessionId);if(!state)inboxes.set(sessionId,state={seq:null,turn:null,lists:{'next-turn':new Map(),'next-step':new Map()}})
    if(state.seq!==null&&event.seq<=state.seq)return
    // A missing event invalidates sparse positions. Never infer admission from
    // a queue snapshot disappearing or from a different request's new turn.
    if(state.seq!==null&&event.seq!==state.seq+1){state.lists['next-turn'].clear();state.lists['next-step'].clear()}
    state.seq=event.seq
    if(event.type==='turn/start')state.turn=event.data.turn
    if(event.type!=='agent/inbox/spliced')return
    const splice=event.data,list=state.lists[splice.target];if(!list)return
    const start=splice.start,count=splice.removedCount??0,inserted=splice.inserted??[],end=start+count,next=new Map(),kept=new Set(inserted.map(message=>message.id));let changed=false
    for(const [position,message]of list){
     if(position<start)next.set(position,message)
     else if(position>=end)next.set(position+inserted.length-count,message)
     else if(!kept.has(message.id)){
      const entry=entries.get(message.source?.rpcId)
      if(entry?.sessionId===sessionId&&entry.current()){
       entry.messageId=message.id
       if(splice.outcome==='canceled'){retire(entry);clear(entry)}
       else{entry.admitted=true;entry.admittedTurn=state.turn;if(splice.target==='next-step')entry.mode='steer';retire(entry);changed=true}
      }
     }
    }
    inserted.forEach((message,index)=>{next.set(start+index,message);const entry=entries.get(message.source?.rpcId);if(entry?.sessionId===sessionId&&entry.current()){entry.messageId=message.id;entry.queueAnchor=event.seq;contentOf(entry,message.content);if(splice.target==='next-step')entry.mode='steer';changed=true}})
    state.lists[splice.target]=next;if(changed)notify()
   }
   off=api.subscribeEnvelopes(batch=>{
    if(closed)return
    for(const envelope of batch){
     if(envelope.type==='client-request'&&envelope.method==='session.prompt'){
      const sessionId=envelope.payload?.sessionId,rpcId=envelope.rpcId,content=envelope.payload?.content
      if(typeof sessionId!=='string'||typeof rpcId!=='string'||!rpcId||entries.has(rpcId)||seen.has(rpcId)||all(sessionId).length>=16||!Array.isArray(content)||!content.length)continue
      let session,shell,snapshot
      try{if(sessions.list.getSnapshot().current!==sessionId||sessions.subagentAddress?.(sessionId))continue;session=sessions.binding(sessionId)?.session;shell=inputHub.shells.get(sessionId);if(!session||!shell||shell.disposed)continue;snapshot=session.getSnapshot()}catch{continue}
      const turns=[...(snapshot.chat?.timeline?.turns?.keys()??[])].filter(Number.isSafeInteger),previous=all(sessionId)
      const barrierTurn=Math.max(0,...turns),latest=snapshot.chat?.timeline?.turns?.get(barrierTurn),openTurn=latest&&latest.status!=='closed'&&latest.end==null
      const entry={sessionId,rpcId,session,shell,content:structuredClone(content),mode:envelope.payload.mode,observedAt:Date.now(),sequence:++sequence,wasRunning:snapshot.running===true,initialImmediate:snapshot.running!==true&&!openTurn&&!previous.length&&!snapshot.queue?.some(row=>row.placement==='queued'),admitted:false,admittedTurn:null,messageId:null,queueAnchor:-1,barrierTurn,predecessors:previous.map(value=>value.rpcId),accepted:false,current:()=>current(entry),off:null,lastError:snapshot.promptError}
      entry.annotation=annotationReader(sessionId,rpcId,content.filter(part=>part?.type==='text'&&typeof part.text==='string').map(part=>part.text).join(''))
      if(!entry.current())continue
      seen.add(rpcId);if(seen.size>256)seen.delete(seen.values().next().value)
      entries.set(rpcId,entry)
      entry.off=session.subscribe(()=>{
       if(!entry.current()){clear(entry);return}
       const state=session.getSnapshot(),node=state.chat?.order?.map(key=>state.chat.nodes.get(key)).find(node=>['user','steering'].includes(node?.kind)&&node.data?.source?.kind==='user'&&node.data.source.rpcId===rpcId)
       if(node){settle(entry,node);return}
       if(state.promptError!==entry.lastError){entry.lastError=state.promptError;if(state.promptError?.op==='send'&&!knownRejections.has(state.promptError.error)&&!entry.accepted)clear(entry)}
      })
      notify()
     }else if(envelope.type==='client-request'&&envelope.method==='session.updateQueue'){
      const {sessionId,itemId,action}=envelope.payload??{},entry=[...entries.values()].find(value=>value.sessionId===sessionId&&value.messageId===itemId)
      if(entry&&['edit','remove','steer'].includes(action?.kind))updates.set(envelope.rpcId,{entry,action})
     }else if(envelope.type==='server-response'){
      const update=updates.get(envelope.rpcId);updates.delete(envelope.rpcId)
      if(update&&entries.get(update.entry.rpcId)===update.entry&&envelope.result?.ok===true&&envelope.result.value?.accepted===true){const {entry,action}=update;if(action.kind==='remove'){retire(entry);clear(entry)}else{if(action.kind==='steer'){entry.mode='steer';retire(entry)}else{entry.content=structuredClone(action.content);entry.annotation=null}notify()}}
      const entry=entries.get(envelope.rpcId)
      if(envelope.result?.ok!==true||envelope.result.value?.accepted!==true){if(envelope.result?.error&&typeof envelope.result.error==='object')knownRejections.add(envelope.result.error);if(entry)clear(entry)}
      else if(entry){entry.accepted=true;notify()}
     }else if(envelope.type==='client-request'&&envelope.method==='session.cancel'){
      for(const entry of [...entries.values()])if(entry.sessionId===envelope.payload?.sessionId&&(entry.initialImmediate||entry.admitted||entry.mode==='steer'))clear(entry)
     }else if(envelope.type==='server-request'){
      const frame=envelope.payload
      if(frame?.type==='session/event')observeEvent(frame.sessionId,frame.event)
      else if(frame?.type==='session/queue')observeQueue(frame.sessionId,frame.items)
     }
    }
   })
   offList=sessions.list.subscribe(()=>{for(const entry of [...entries.values()])if(!entry.current())clear(entry);const next=sessions.list.getSnapshot().current;if(next!==owner){owner=next;inboxes.clear();updates.clear();retired.clear()}})
   return stop
  }
 }
}
function useNativeSubmittedQueue(sessionId,inbox,useSession){
 const revision=react.useSyncExternalStore(NativeConversationSubmissions.subscribe,NativeConversationSubmissions.version,NativeConversationSubmissions.version),nodes=useSession(state=>state.chat?.nodes)
 return react.useMemo(()=>NativeConversationSubmissions.queue(sessionId,inbox??[],nodes),[sessionId,inbox,nodes,revision])
}
function useNativeConversationSubmission(sessionId,order,nodeStore,useSession){
 const revision=react.useSyncExternalStore(NativeConversationSubmissions.subscribe,NativeConversationSubmissions.version,NativeConversationSubmissions.version)
 const snapshot=useSession(value=>value),preset=typeof HomePresentationSubmissions!=='undefined'&&!!HomePresentationSubmissions.read(sessionId)
 const entries=NativeConversationSubmissions.all(sessionId),received=entries.filter(entry=>order.some(key=>{const node=nodeStore.get(key);return['user','steering'].includes(node?.kind)&&node.data?.source?.kind==='user'&&node.data.source.rpcId===entry.rpcId}))
 react.useLayoutEffect(()=>{for(const entry of entries)if(preset||received.includes(entry))NativeConversationSubmissions.consume(entry,preset?undefined:order.map(key=>nodeStore.get(key)).find(node=>['user','steering'].includes(node?.kind)&&node.data?.source?.kind==='user'&&node.data.source.rpcId===entry.rpcId))},[revision,snapshot,preset])
 return react.useMemo(()=>({snapshot,entries:preset?[]:entries.filter(entry=>!received.includes(entry))}),[revision,snapshot,preset])
}
export function projectNativeConversationSubmissions(flow,pending,nodeStore){
 if(!pending?.entries?.length)return flow
 const turnOf=entry=>{const node=entry.kind==='node'?nodeStore.get(entry.key):null,value=entry.kind==='execution'?entry.turn:node?.location?.turn?.turn??node?.data?.turn;return Number.isSafeInteger(value)?value:null}
 const mirrors=new Map(),requests=new Map(pending.entries.map(entry=>[entry.rpcId,entry]));
 let result=flow.filter(entry=>{const rpcId=entry.kind==='pending-steering'?entry.item?.source?.rpcId:null;if(rpcId&&requests.has(rpcId)){mirrors.set(rpcId,entry);return false}return true}),previousTarget=0,activePending=false
 for(const submission of pending.entries){
  if(submission.mode!=='steer'&&!submission.initialImmediate&&!submission.admitted&&!mirrors.has(submission.rpcId))continue
  let barrier=submission.barrierTurn,foreign=false
  if(submission.mode!=='steer')barrier=Math.max(barrier,previousTarget)
  // A different durable human already owns its turn; never attach this request to it.
  for(const entry of result){const node=entry.kind==='node'?nodeStore.get(entry.key):null,turn=turnOf(entry);if(turn!==null&&turn>barrier&&['user','steering'].includes(node?.kind)&&node.data?.source?.kind==='user'&&node.data.source.rpcId!==submission.rpcId){barrier=turn;foreign=true}}
  if(foreign&&submission.mode!=='steer'&&!submission.admitted)continue
  const target=Number.isSafeInteger(submission.admittedTurn)?submission.admittedTurn:null,index=submission.mode==='steer'&&submission.wasRunning?-1:result.findIndex(entry=>{const turn=turnOf(entry);return turn!==null&&(target!==null?turn===target:turn>barrier)})
  if(target!==null&&index<0&&result.some(entry=>(turnOf(entry)??0)>target))continue
  const user=mirrors.get(submission.rpcId)??{kind:'native-submitted-user',key:'submitted:'+submission.rpcId,submission}
  if(index>=0){previousTarget=turnOf(result[index])??barrier;result.splice(index,0,user);activePending=true;continue}
  const latest=pending.snapshot?.chat?.timeline?.turns?.get(barrier),closed=latest?.status==='closed'||latest?.end!=null
  const preTurn=pending.snapshot?.running&&!activePending&&((!submission.wasRunning&&!submission.predecessors.length&&barrier===submission.barrierTurn)||closed)
  if(preTurn){
   const reusable=result.find(entry=>entry.kind==='execution'&&entry.running&&entry.turn===null&&!entry.nodeKeys?.length)
   if(reusable)result=result.filter(entry=>entry!==reusable)
   result=result.map(entry=>entry.kind==='execution'&&entry.running&&turnOf(entry)!==null&&turnOf(entry)<=barrier?{...entry,running:false}:entry)
   result.push(user,reusable?{...reusable,pendingSubmission:true,observedAt:submission.observedAt}:{kind:'execution',key:'submitted-execution:'+submission.rpcId,turn:null,nodeKeys:[],running:true,pendingSubmission:true,observedAt:submission.observedAt});activePending=true
  }else if(submission.mode==='steer'&&submission.wasRunning){
   result=result.filter(entry=>entry.kind!=='native-steering-status').map(entry=>entry.kind==='execution'&&entry.running?{...entry,running:false,pausedForSteering:true}:entry)
   result.push(user,{kind:'native-steering-status',key:'steering-status:'+submission.rpcId,submission})
  }else result.push(user)
 }
 return result
}
function useNativeSubmittedAnnotation(text,identity,authoritative,provided){
 const retained=react.useRef(null),sessionId=identity?.source?.kind==='user'?identity.sessionId:null,rpcId=identity?.source?.rpcId,key=sessionId?JSON.stringify([sessionId,rpcId,text]):null
 const proof=provided??(key?NativeConversationSubmissions.annotation(sessionId,rpcId,text):null)
 if(proof?.current())retained.current={key,proof}
 if(provided)return provided.current()?provided.parts:authoritative
 // The exact local snapshot bridges only the readonly request's pending state.
 // A null/rejected durable receipt still restores the original message as before.
 if(authoritative?.pending===true&&retained.current?.key===key&&retained.current.proof.current())return retained.current.proof.parts
 return authoritative
}
function NativeConversationSubmittedUser({entry,loadImage,openFile,t}){
 const [metadata,setMetadata]=react.useState(null)
 react.useEffect(()=>{
  let live=true;const readers=[]
  entry.content.forEach((part,index)=>{
   if(part?.type!=='image'||typeof part.data!=='string'||!['image/png','image/jpeg','image/webp','image/gif'].includes(part.mediaType))return
   const image=new Image();readers.push(image)
   image.onload=()=>{if(live&&image.naturalWidth>0&&image.naturalHeight>0)setMetadata(previous=>{const sizes=new Map(previous?.entry===entry?previous.sizes:[]);sizes.set(index,{width:image.naturalWidth,height:image.naturalHeight});return{entry,sizes}})}
   image.src='data:'+part.mediaType+';base64,'+part.data
  })
  return()=>{live=false;for(const image of readers)image.onload=null}
 },[entry])
 const projected=react.useMemo(()=>{
  const urls=new Map(),content=entry.content.map((part,index)=>{
   if(part?.type!=='image'||typeof part.data!=='string'||!['image/png','image/jpeg','image/webp','image/gif'].includes(part.mediaType))return part
   // A bounded loading tile is replaced by the actual decoded image dimensions.
   const size=(metadata?.entry===entry&&metadata.sizes.get(index))||{width:240,height:240}
   const attachment={attachmentId:'submitted:'+entry.rpcId+':'+index,name:part.name,mediaType:part.mediaType,...size}
   urls.set(attachment,'data:'+part.mediaType+';base64,'+part.data)
   return{type:'image',attachment}
  })
  return{content,urls}
 },[entry,metadata])
 const imageLoader=react.useCallback(attachment=>projected.urls.has(attachment)?Promise.resolve(projected.urls.get(attachment)):loadImage(attachment),[projected,loadImage])
 return react.createElement('div',{className:ChatView_module_css_default.flowItem,'data-chat-anchor-key':'submitted:'+entry.rpcId,'data-chat-flow-key':'submitted:'+entry.rpcId,'data-chat-flow-kind':'user','data-native-submitted-user':entry.rpcId},react.createElement(UserStyleBubble,{content:projected.content,imageLoader,openFile,t,nativeSubmittedAnnotation:entry.annotation}))
}
const START='/* sherlock:conversation-submission:v6 */',END='/* sherlock:conversation-submission:end */'
const definition=START+'\n'+[createNativeConversationSubmissions,useNativeConversationSubmission,useNativeSubmittedQueue,projectNativeConversationSubmissions,useNativeSubmittedAnnotation,NativeConversationSubmittedUser].map(fn=>fn.toString()).join('\n')+'\nconst NativeConversationSubmissions=createNativeConversationSubmissions();\n'+END+'\n'
const queueTail='\n\t\t\tconst queue = (0, react.useMemo)(() => userQueuedMessages(inbox).map',queueBefore='const inbox = useSession((s) => s.queue);'+queueTail,queueAfter='const nativeSubmittedInbox = useSession((s) => s.queue);\nconst inbox = useNativeSubmittedQueue(arguments[0].sessionId,nativeSubmittedInbox,useSession);'+queueTail
const bind='\nctx.effect(()=>NativeConversationSubmissions.watch({api:ctx.get("connection").api,sessions,inputHub}),"Native first submitted user");'
const oldHook='\nconst nativeConversationSubmission=useNativeConversationSubmission(sessionId,order,nodeStore);'
const hook='\nconst nativeConversationSubmission=useNativeConversationSubmission(sessionId,order,nodeStore,useSession);'
const oldRender='nativeConversationSubmission&&react.createElement(NativeConversationSubmittedUser,{entry:nativeConversationSubmission,loadImage,openFile,t}),\n'
const flowNames=['conversationComponentFlow','renderFlow']
const flowLine=name=>'const nativeSubmittedFlow=projectNativeConversationSubmissions('+name+',nativeConversationSubmission,nodeStore);\n'
const previousRender='nativeSubmittedFlow.flatMap((entry) => {if(entry.kind==="native-submitted-user")return react.createElement(NativeConversationSubmittedUser,{key:entry.key,entry:entry.submission,loadImage,openFile,t});'
const render=previousRender+'if(entry.kind==="native-steering-status")return react.createElement("div",{key:entry.key,role:"status","aria-live":"polite","data-steering-receipt":entry.submission.rpcId,className:ChatView_module_css_default.flowItem,style:{fontSize:12,color:"var(--sherlock-text-secondary)",paddingBlock:8}},entry.submission.accepted?"补充已收到，正在切换到这条消息…":"正在发送补充消息…");'
const annotationHooks=[
 ['const annotationPresentation=pptxAnnotationMessageRuntime.usePresentation(text,arguments[0].annotationIdentity,eventSeq);','const annotationPresentation=pptxAnnotationMessageRuntime.usePresentation(text,arguments[0].annotationIdentity,eventSeq);\nconst nativeSubmittedAnnotationParts=useNativeSubmittedAnnotation(text,arguments[0].annotationIdentity,annotationPresentation,arguments[0].nativeSubmittedAnnotation);'],
 ['pptxAnnotationMessageRuntime.render(annotationPresentation,text,originalResearch,research,openFile)','pptxAnnotationMessageRuntime.render(nativeSubmittedAnnotationParts,text,originalResearch,research,openFile)']
]
const count=(source,value)=>source.split(value).length-1
const one=(source,before,after)=>{if(count(source,before)!==1)throw Error('Native submitted user anchor drifted: '+before.slice(0,70));return source.replace(before,after)}
const annotationSwap=(source,before,after)=>{
 const anchor='\nfunction UserStyleBubble(',start=source.indexOf(anchor),end=source.indexOf('\n\t\t}',start)
 if(count(source,anchor)!==1||end<start)throw Error('Native submitted annotation bubble drifted')
 const finish=end+4
 return source.slice(0,start)+one(source.slice(start,finish),before,after)+source.slice(finish)
}
const traces=['NativeConversationSubmissions','nativeConversationSubmission','NativeConversationSubmittedUser','useNativeConversationSubmission','nativeSubmittedAnnotationParts','useNativeSubmittedAnnotation','nativeSubmittedFlow','projectNativeConversationSubmissions','useNativeSubmittedQueue','nativeSubmittedInbox','sherlock:conversation-submission:']
export function stripConversationSubmission(source){
 const markers=[...source.matchAll(/\/\* sherlock:conversation-submission:v(\d+) \*\//g)]
 if(!markers.length){if(source.includes(END)||traces.some(value=>source.includes(value)))throw Error('Native submitted user orphan drifted');return source}
 if(markers.length!==1||count(source,END)!==1)throw Error('Native submitted user installation drifted')
 const version=Number(markers[0][1]),start=markers[0].index,end=source.indexOf(END,start),installed=source.slice(start,end+END.length+1),known={1:'2f25f60df2b1aa7ed6f6e622f94c3d036a28e59ee8bd72c795d0402b63fe3a04',2:'c823118b5dc585aae7171ea1d84cd5e234ccf7c32f768bd4f9703d69891887f2',3:'099a5dc57968ca2bb19813ad7afb2125da6fdf4497ffab6899718ebac7efd045',4:'b0f4430a7ec60047379e1c16a0dfd872e58540afc1c1ffc465452514bbb287be',5:'e56b95764899cf1fec5ccb46ccf1c37ee159d7d77795fda9e59e9c15db6f7bf2'}
 if(version===6?installed!==definition:!known[version]||createHash('sha256').update(installed).digest('hex')!==known[version])throw Error('Native submitted user installation drifted')
 let restored=one(source,installed,'');restored=one(restored,bind,'');restored=one(restored,version>=3?hook:oldHook,'')
 if(version>=4)restored=one(restored,queueAfter,queueBefore)
 if(version>=3){
  const names=flowNames.filter(name=>restored.includes(flowLine(name)));if(names.length!==1)throw Error('Native submitted user flow inverse drifted')
  const name=names[0];restored=one(restored,flowLine(name),'');restored=one(restored,version>=5?render:previousRender,name+'.flatMap((entry) => {')
  const progress='useConversationResponseProgress(nativeSubmittedFlow,';if(count(restored,progress)>1)throw Error('Native submitted progress inverse drifted');if(restored.includes(progress))restored=one(restored,progress,'useConversationResponseProgress('+name+',')
 }else restored=one(restored,oldRender,'')
 if(version!==1&&restored.includes('\nconst pptxAnnotationMessageRuntime='))for(const [before,after]of annotationHooks)restored=annotationSwap(restored,after,before)
 if(restored.includes(END)||traces.some(value=>restored.includes(value)))throw Error('Native submitted user inverse drifted')
 return restored
}
export function patchConversationSubmission(source){
 source=stripConversationSubmission(source)
 source=one(source,'const inputHub = new InputHub(ctx, t, researchWorkspaces);','const inputHub = new InputHub(ctx, t, researchWorkspaces);'+bind)
 source=one(source,'const nodeStore = useSession((s) => s.chat.nodes);','const nodeStore = useSession((s) => s.chat.nodes);'+hook)
 source=one(source,queueBefore,queueAfter)
 const names=flowNames.filter(name=>source.includes(name+'.flatMap((entry) => {'));if(names.length!==1)throw Error('Native submitted user flow drifted')
 const name=names[0],progress='const eworkResponseProgressByTurn=',anchor=source.includes(progress)?progress:'const seatProps = (0, react.useMemo)(() => ({'
 source=one(source,anchor,flowLine(name)+anchor);source=one(source,name+'.flatMap((entry) => {',render)
 const oldProgress='useConversationResponseProgress('+name+',';if(count(source,oldProgress)>1)throw Error('Native submitted progress anchor drifted');if(source.includes(oldProgress))source=one(source,oldProgress,'useConversationResponseProgress(nativeSubmittedFlow,')
 if(source.includes('\nconst pptxAnnotationMessageRuntime='))for(const [before,after]of annotationHooks)source=annotationSwap(source,before,after)
 return one(source,'exports.ConversationRoot = ConversationRoot;',definition+'exports.ConversationRoot = ConversationRoot;')
}
