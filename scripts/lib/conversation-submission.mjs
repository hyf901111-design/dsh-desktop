/** Ephemeral presentation of a real first prompt, until its authoritative row arrives. */
export function createNativeConversationSubmissions(){
 const entries=new Map(),listeners=new Set();let revision=0,stopCurrent=null
 const notify=()=>{revision++;for(const listener of listeners)listener()}
 const clear=entry=>{if(entries.get(entry.sessionId)!==entry)return;entries.delete(entry.sessionId);entry.off?.();notify()}
 return{
  subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},version:()=>revision,
  read(sessionId){const entry=entries.get(sessionId);return entry?.current()?entry:null},consume:clear,
  watch({api,sessions,inputHub}){
   stopCurrent?.()
   if(typeof api?.subscribeEnvelopes!=='function'||!sessions?.list)return()=>{}
   let closed=false,off=()=>{},offList=()=>{}
   const stop=()=>{if(closed)return;closed=true;off();offList();for(const entry of [...entries.values()])clear(entry);if(stopCurrent===stop)stopCurrent=null}
   stopCurrent=stop
   const current=entry=>{try{return!closed&&sessions.list.getSnapshot().current===entry.sessionId&&sessions.binding(entry.sessionId)?.session===entry.session&&inputHub.shells.get(entry.sessionId)===entry.shell&&!entry.shell.disposed&&!entry.session.getSnapshot().removed}catch{return false}}
   off=api.subscribeEnvelopes(batch=>{
    if(closed)return
    for(const envelope of batch){
     if(envelope.type==='client-request'&&envelope.method==='session.prompt'){
      const sessionId=envelope.payload?.sessionId,rpcId=envelope.rpcId,content=envelope.payload?.content
      if(typeof sessionId!=='string'||typeof rpcId!=='string'||!rpcId||entries.has(sessionId)||sessions.list.getSnapshot().current!==sessionId||sessions.subagentAddress?.(sessionId)||!Array.isArray(content)||!content.length)continue
      let session,shell
      try{session=sessions.binding(sessionId)?.session;shell=inputHub.shells.get(sessionId);if(!session||!shell||shell.disposed||session.getSnapshot().blank!==true)continue}catch{continue}
      const entry={sessionId,rpcId,session,shell,content:structuredClone(content),current:()=>current(entry),off:null}
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
 return react.createElement('div',{className:ChatView_module_css_default.flowItem,'data-chat-flow-key':'submitted:'+entry.rpcId,'data-chat-flow-kind':'user','data-native-submitted-user':entry.rpcId},react.createElement(UserStyleBubble,{content:projected.content,imageLoader,openFile,t}))
}
const START='/* sherlock:conversation-submission:v1 */',END='/* sherlock:conversation-submission:end */'
const definition=START+'\n'+[createNativeConversationSubmissions,useNativeConversationSubmission,NativeConversationSubmittedUser].map(fn=>fn.toString()).join('\n')+'\nconst NativeConversationSubmissions=createNativeConversationSubmissions();\n'+END+'\n'
const bind='\nctx.effect(()=>NativeConversationSubmissions.watch({api:ctx.get("connection").api,sessions,inputHub}),"Native first submitted user");'
const hook='\nconst nativeConversationSubmission=useNativeConversationSubmission(sessionId,order,nodeStore);'
const render='nativeConversationSubmission&&react.createElement(NativeConversationSubmittedUser,{entry:nativeConversationSubmission,loadImage,openFile,t}),\n'
const one=(source,before,after)=>{if(source.split(before).length!==2)throw Error('Native submitted user anchor drifted: '+before.slice(0,70));return source.replace(before,after)}
export function stripConversationSubmission(source){
 if(!source.includes(START)){
  if([END,'NativeConversationSubmissions','nativeConversationSubmission','NativeConversationSubmittedUser','useNativeConversationSubmission'].some(value=>source.includes(value)))throw Error('Native submitted user orphan drifted')
  return source
 }
 if(source.split(definition).length!==2||[START,END,bind,hook,render].some(value=>source.split(value).length!==2))throw Error('Native submitted user installation drifted')
 const restored=source.replace(definition,'').replace(bind,'').replace(hook,'').replace(render,'')
 if([START,END,'NativeConversationSubmissions','nativeConversationSubmission','NativeConversationSubmittedUser','useNativeConversationSubmission'].some(value=>restored.includes(value)))throw Error('Native submitted user inverse drifted')
 return restored
}
export function patchConversationSubmission(source){
 source=stripConversationSubmission(source)
 source=one(source,'const inputHub = new InputHub(ctx, t, researchWorkspaces);','const inputHub = new InputHub(ctx, t, researchWorkspaces);'+bind)
 source=one(source,'const nodeStore = useSession((s) => s.chat.nodes);','const nodeStore = useSession((s) => s.chat.nodes);'+hook)
 const anchors=['conversationComponentFlow.flatMap((entry) => {','renderFlow.flatMap((entry) => {'].filter(value=>source.includes(value))
 if(anchors.length!==1)throw Error('Native submitted user flow drifted')
 source=one(source,anchors[0],render+anchors[0])
 return one(source,'exports.ConversationRoot = ConversationRoot;',definition+'exports.ConversationRoot = ConversationRoot;')
}
