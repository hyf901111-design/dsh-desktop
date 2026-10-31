// @ts-nocheck
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import * as dom from 'react-dom'
import {createRoot} from 'react-dom/client'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
const w=window as any
let fake:any;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
const modules=(id:string)=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{ImageGallery:()=>null}:id==='@deepseek-ai/cordis'?{Service:class{constructor(public ctx:any){}}}:fake
const rt=w.runtimeDescriptor.factory(modules),native=w.orderDescriptor.factory((id:string)=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id));native.__orderBind()
const ctx={get:()=>undefined,reflect:{provide(){}},effect:(fn:any)=>fn()??(()=>{})},events=new rt.ConversationEventRegistry(ctx),views=new rt.ConversationViewRegistry(ctx);native.__orderRegister({...ctx,conversationEvents:events,conversationViews:views})
let log=w.orderEvents
const api={sessions:{history:async()=>({result:{ok:true,value:{events:log.map((event:any)=>({event})),hasMore:false}}})}}
const session=new rt.SessionRuntime(ctx,api,{},{events,views}).manager.get('order-browser'),useSession=(select:any)=>select(React.useSyncExternalStore((fn:any)=>session.subscribe(fn),()=>session.getSnapshot(),()=>session.getSnapshot())),useStore=(select:any)=>select({view:'chat',selection:null}),useSessions=(select:any)=>select({byId:{'order-browser':{cwd:'/tmp/turn-order-browser'}}})
const t=(key:string,args:any={})=>String(native.__orderDictionaries.zh[key]??key).replace(/\{(\w+)\}/g,(_all,name)=>String(args[name]??''))
const renderSlot=(name:string,props:any)=>{
 if(name!=='conversation.chat.node')return null
 if(['user','steering'].includes(props.node.kind))return React.createElement(native.__orderUser,{...props,t})
 if(props.node.kind==='assistant-step')return React.createElement(native.__orderAssistant,{...props,t,useTurnData:()=>null,fileMentions:()=>[]})
 if(props.node.kind==='turn-tail')return React.createElement(native.__orderTail,{...props,t,useSession,renderSlot:()=>null,renderSlotChain:()=>null})
 return React.createElement('div',{'data-original-context':props.node.key},props.node.kind)
}
const root=createRoot(document.querySelector('#app')!)
function App(){return React.createElement(native.__orderChat,{sessionId:'order-browser',useSession,useSessions,useStore,renderSlot,openFile:()=>{},loadOlder:()=>{},loadImage:()=>Promise.resolve(null),inspectCall:()=>{},chatScroll:{read:()=>null,save(){}},forkAt:()=>{},fileMentions:()=>[],t})}
session.handleRunning(log.at(-1)?.type!=='turn/end')
w.turnOrderProbe={session,replace:(value:any)=>{log=value;session.installWindow(value.map((event:any)=>({event})),false)},append:(events:any[])=>{log=[...log,...events];for(const event of events)session.acceptLiveEvent(event);session.handleRunning(log.at(-1)?.type!=='turn/end')},reopen:()=>session.resync(),note:(row:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-task-state',{detail:{sessionId:'order-browser',...row}})),dispose:()=>root.unmount()}
session.open().then(()=>root.render(React.createElement(App)))
