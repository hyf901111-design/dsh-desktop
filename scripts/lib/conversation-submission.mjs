import {createHash} from 'node:crypto'

/** Ephemeral presentation of a real first prompt, until its authoritative row arrives. */
export function createNativeConversationSubmissions(){
 const entries=new Map(),listeners=new Set();let revision=0,stopCurrent=null,annotationReader=()=>null
 const notify=()=>{revision++;for(const listener of listeners)listener()}
 const clear=entry=>{if(entries.get(entry.sessionId)!==entry)return;entries.delete(entry.sessionId);entry.off?.();notify()}
 return{
  subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},version:()=>revision,
  read(sessionId){const entry=entries.get(sessionId);return entry?.current()?entry:null},consume:clear,
  annotation(sessionId,rpcId,text){return annotationReader(sessionId,rpcId,text)},
  watch({api,sessions,inputHub}){
   stopCurrent?.()
   if(typeof api?.subscribeEnvelopes!=='function'||!sessions?.list)return()=>{}
   let closed=false,off=()=>{},offList=()=>{}
   const stop=()=>{if(closed)return;closed=true;off();offList();for(const entry of [...entries.values()])clear(entry);if(stopCurrent===stop)stopCurrent=null}
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
   off=api.subscribeEnvelopes(batch=>{
    if(closed)return
    for(const envelope of batch){
     if(envelope.type==='client-request'&&envelope.method==='session.prompt'){
      const sessionId=envelope.payload?.sessionId,rpcId=envelope.rpcId,content=envelope.payload?.content
      if(typeof sessionId!=='string'||typeof rpcId!=='string'||!rpcId||entries.has(sessionId)||sessions.list.getSnapshot().current!==sessionId||sessions.subagentAddress?.(sessionId)||!Array.isArray(content)||!content.length)continue
      let session,shell
      try{session=sessions.binding(sessionId)?.session;shell=inputHub.shells.get(sessionId);if(!session||!shell||shell.disposed||session.getSnapshot().blank!==true)continue}catch{continue}
      const entry={sessionId,rpcId,session,shell,content:structuredClone(content),current:()=>current(entry),off:null}
      // This can only consume a local prepared ticket, never infer labels from transport prose.
      entry.annotation=annotationReader(sessionId,rpcId,content.filter(part=>part?.type==='text'&&typeof part.text==='string').map(part=>part.text).join(''))
      if(!entry.current())continue
      entries.set(sessionId,entry)
      entry.off=session.subscribe(()=>{if(!entry.current()||session.getSnapshot().promptError?.op==='send')clear(entry)})
      notify()
     }else if(envelope.type==='server-response'){
      for(const entry of [...entries.values()])if(envelope.rpcId===entry.rpcId&&(envelope.result?.ok!==true||envelope.result.value?.accepted!==true))clear(entry)
     }else if(envelope.type==='client-request'&&envelope.method==='session.cancel'){
      const entry=entries.get(envelope.payload?.sessionId);if(entry)clear(entry)
     }
    }
   })
   offList=sessions.list.subscribe(()=>{for(const entry of [...entries.values()])if(!entry.current())clear(entry)})
   return stop
  }
 }
}
function useNativeConversationSubmission(sessionId,order,nodeStore){
 react.useSyncExternalStore(NativeConversationSubmissions.subscribe,NativeConversationSubmissions.version,NativeConversationSubmissions.version)
 const entry=NativeConversationSubmissions.read(sessionId)
 const received=!!entry&&order.some(key=>{const node=nodeStore.get(key);return node?.kind==='user'&&node.data?.source?.kind==='user'&&node.data.source.rpcId===entry.rpcId})
 // A live preset owns its existing projection. It is replaced atomically too.
 const preset=typeof HomePresentationSubmissions!=='undefined'&&!!HomePresentationSubmissions.read(sessionId)
 react.useLayoutEffect(()=>{if(entry&&(received||preset))NativeConversationSubmissions.consume(entry)},[entry,received,preset])
 return received||preset?null:entry
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
 return react.createElement('div',{className:ChatView_module_css_default.flowItem,'data-chat-flow-key':'submitted:'+entry.rpcId,'data-chat-flow-kind':'user','data-native-submitted-user':entry.rpcId},react.createElement(UserStyleBubble,{content:projected.content,imageLoader,openFile,t,nativeSubmittedAnnotation:entry.annotation}))
}
const START='/* sherlock:conversation-submission:v2 */',LEGACY='/* sherlock:conversation-submission:v1 */',END='/* sherlock:conversation-submission:end */'
const definition=START+'\n'+[createNativeConversationSubmissions,useNativeConversationSubmission,useNativeSubmittedAnnotation,NativeConversationSubmittedUser].map(fn=>fn.toString()).join('\n')+'\nconst NativeConversationSubmissions=createNativeConversationSubmissions();\n'+END+'\n'
const bind='\nctx.effect(()=>NativeConversationSubmissions.watch({api:ctx.get("connection").api,sessions,inputHub}),"Native first submitted user");'
const hook='\nconst nativeConversationSubmission=useNativeConversationSubmission(sessionId,order,nodeStore);'
const render='nativeConversationSubmission&&react.createElement(NativeConversationSubmittedUser,{entry:nativeConversationSubmission,loadImage,openFile,t}),\n'
const annotationHooks=[
 ['const annotationPresentation=pptxAnnotationMessageRuntime.usePresentation(text,arguments[0].annotationIdentity,eventSeq);','const annotationPresentation=pptxAnnotationMessageRuntime.usePresentation(text,arguments[0].annotationIdentity,eventSeq);\nconst nativeSubmittedAnnotationParts=useNativeSubmittedAnnotation(text,arguments[0].annotationIdentity,annotationPresentation,arguments[0].nativeSubmittedAnnotation);'],
 ['pptxAnnotationMessageRuntime.render(annotationPresentation,text,originalResearch,research,openFile)','pptxAnnotationMessageRuntime.render(nativeSubmittedAnnotationParts,text,originalResearch,research,openFile)']
]
const one=(source,before,after)=>{if(source.split(before).length!==2)throw Error('Native submitted user anchor drifted: '+before.slice(0,70));return source.replace(before,after)}
const annotationSwap=(source,before,after)=>{
 const anchor='\nfunction UserStyleBubble(',start=source.indexOf(anchor),end=source.indexOf('\n\t\t}',start)
 if(source.split(anchor).length!==2||end<start)throw Error('Native submitted annotation bubble drifted')
 const finish=end+4
 return source.slice(0,start)+one(source.slice(start,finish),before,after)+source.slice(finish)
}
export function stripConversationSubmission(source){
 if(!source.includes(START)&&!source.includes(LEGACY)){
  if([END,'NativeConversationSubmissions','nativeConversationSubmission','NativeConversationSubmittedUser','useNativeConversationSubmission','nativeSubmittedAnnotationParts','useNativeSubmittedAnnotation'].some(value=>source.includes(value)))throw Error('Native submitted user orphan drifted')
  return source
 }
 const legacy=source.includes(LEGACY),start=source.indexOf(legacy?LEGACY:START),end=source.indexOf(END,start),installed=end<0?'':source.slice(start,end+END.length+1)
 if(source.split(legacy?LEGACY:START).length!==2||source.includes(legacy?START:LEGACY)||(legacy?createHash('sha256').update(installed).digest('hex')!=='2f25f60df2b1aa7ed6f6e622f94c3d036a28e59ee8bd72c795d0402b63fe3a04':installed!==definition)||[END,bind,hook,render].some(value=>source.split(value).length!==2))throw Error('Native submitted user installation drifted')
 let restored=source.replace(installed,'').replace(bind,'').replace(hook,'').replace(render,'')
 if(!legacy&&restored.includes('\nconst pptxAnnotationMessageRuntime='))for(const [before,after]of annotationHooks)restored=annotationSwap(restored,after,before)
 if([START,LEGACY,END,'NativeConversationSubmissions','nativeConversationSubmission','NativeConversationSubmittedUser','useNativeConversationSubmission','nativeSubmittedAnnotationParts','useNativeSubmittedAnnotation'].some(value=>restored.includes(value)))throw Error('Native submitted user inverse drifted')
 return restored
}
export function patchConversationSubmission(source){
 source=stripConversationSubmission(source)
 source=one(source,'const inputHub = new InputHub(ctx, t, researchWorkspaces);','const inputHub = new InputHub(ctx, t, researchWorkspaces);'+bind)
 source=one(source,'const nodeStore = useSession((s) => s.chat.nodes);','const nodeStore = useSession((s) => s.chat.nodes);'+hook)
 const anchors=['conversationComponentFlow.flatMap((entry) => {','renderFlow.flatMap((entry) => {'].filter(value=>source.includes(value))
 if(anchors.length!==1)throw Error('Native submitted user flow drifted')
 source=one(source,anchors[0],render+anchors[0])
 if(source.includes('\nconst pptxAnnotationMessageRuntime='))for(const [before,after]of annotationHooks)source=annotationSwap(source,before,after)
 return one(source,'exports.ConversationRoot = ConversationRoot;',definition+'exports.ConversationRoot = ConversationRoot;')
}
