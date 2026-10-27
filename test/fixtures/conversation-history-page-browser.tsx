// @ts-nocheck
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import * as dom from 'react-dom'
import {createRoot} from 'react-dom/client'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import {historyLog} from './conversation-history-log.js'
const w=window as any
let fake:any;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
const modules=(id:string)=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{ImageGallery:()=>null}:id==='@deepseek-ai/cordis'?{Service:class{constructor(public ctx:any){}}}:fake
const rt=w.runtimeDescriptor.factory(modules),native=w.historyDescriptor.factory((id:string)=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id));native.__historyBind()
const ctx={get:()=>undefined,reflect:{provide(){}},effect:(fn:any)=>fn()??(()=>{})},events=new rt.ConversationEventRegistry(ctx),views=new rt.ConversationViewRegistry(ctx);native.__historyRegister({...ctx,conversationEvents:events,conversationViews:views})
const paginate=new Function('MESSAGE_TYPES','isAppendSurfaceEvent',w.paginateSource+';return paginate')(new Set(['user/message','assistant/message']),rt.isAppendSurfaceEvent)
const logs={a:historyLog(16,65),b:historyLog(2,1)},calls:any[]=[],pending:any[]=[]
for(const event of logs.a){if(event.type==='assistant/message'&&event.data.message.content[0].text)event.data.message.content[0].text+='\n\n'+Array.from({length:16},(_,i)=>'研究段落'+(i+1)+'：保留完整公开回复、资料核验与结论，便于在真实滚动窗口内连续阅读。').join('\n\n')}
const api={sessions:{async history(input:any){
 calls.push({...input})
 const load=()=>{const page=paginate(logs[input.sessionId],input.beforeSeq,input.maxMessages??50);return{result:{ok:true,value:{...page,events:page.events.map((event:any)=>({event}))}}}}
 if(w.historyMode==='defer'&&input.beforeSeq!==undefined)return new Promise(resolve=>pending.push(()=>resolve(load())))
 if(w.historyMode==='error'&&input.beforeSeq!==undefined)return{result:{ok:false,error:{code:'unavailable',message:'History temporarily unavailable'}}}
 await new Promise(resolve=>setTimeout(resolve,30));return load()
}}}
const manager=new rt.SessionRuntime(ctx,api,{},{events,views}).manager
const root=createRoot(document.querySelector('#app')!),sessions={a:manager.get('a'),b:manager.get('b')},useOwner=Object.fromEntries(Object.entries(sessions).map(([id,session]:any)=>[id,(select:any)=>select(React.useSyncExternalStore((fn:any)=>session.subscribe(fn),()=>session.getSnapshot(),()=>session.getSnapshot()))])),store=(select:any)=>select({view:'chat',selection:null}),useSessions=(select:any)=>select({byId:{a:{cwd:'/tmp/history-a'},b:{cwd:'/tmp/history-b'}}}),positions=new Map();let selected='a'
const t=(key:string,args:any={})=>String(native.__historyDictionaries.zh[key]??key).replace(/\{(\w+)\}/g,(_all,name)=>String(args[name]??''))
const renderSlot=(name:string,props:any,scope:any)=>name==='conversation.chat.node'?props.node.kind==='user'?React.createElement(native.__historyUser,{...props,t}):props.node.kind==='assistant-step'?React.createElement(native.__historyAssistant,{...props,t,useTurnData:()=>null}):props.node.kind==='turn-tail'?React.createElement(native.__historyTail,{...props,t,useSession:useOwner[selected],renderSlot:()=>null,renderSlotChain:()=>null}):null:null
const loaders=Object.fromEntries(Object.entries(sessions).map(([id,session]:any)=>[id,(options:any)=>native.ConversationController.prototype.loadOlder.call({scopedSession:()=>session},options)]))
function App(){return React.createElement(native.__historyChat,{sessionId:selected,useSession:useOwner[selected],useSessions,useStore:store,renderSlot,openFile:()=>{},loadOlder:loaders[selected],loadImage:()=>Promise.resolve(null),inspectCall:()=>{},chatScroll:{read:()=>positions.get(selected)??null,save:(value:any)=>positions.set(selected,value)},forkAt:()=>{},fileMentions:()=>[],t})}
w.historyProbe={sessions,calls,pending,positions,mode:(mode:string)=>w.historyMode=mode,release:()=>{for(const done of pending.splice(0))done()},switch:async(id:string)=>{selected=id;await sessions[id].open();root.render(React.createElement(App))},dispose:()=>root.unmount(),live:()=>{const session=sessions.a,last=session.events.at(-1);session.acceptLiveEvent({seq:last.seq+1,time:Date.now(),type:'llm/requested',data:{}})}}
sessions.a.open().then(()=>root.render(React.createElement(App)))
