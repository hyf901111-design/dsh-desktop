import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import * as dom from 'react-dom'
import {createRoot} from 'react-dom/client'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'

const w=window as any
let fallback:any;fallback=new Proxy(function(){},{get:()=>fallback,apply:()=>fallback,construct:()=>({})})
const moduleFor=(id:string)=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{ImageGallery:()=>null}:id==='@deepseek-ai/cordis'?{Service:class{constructor(public ctx:any){}}}:fallback
const native=w.responseDescriptor.factory(moduleFor)
native.__responseBind()
const h=React.createElement,root=createRoot(document.getElementById('app')!)
const state=(initial:any)=>{let value=initial;const listeners=new Set<()=>void>();return{subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn)},getSnapshot:()=>value,set:(next:any)=>{value=next;for(const fn of listeners)fn()}}}
const start=Date.now()-20_000;let firstTurnStart=start
let turn=1,ended=false,step=1
const location=(id=turn)=>({kind:'step',turn:{turn:id,status:id===turn&&!ended?'open':'closed'}})
const text='这是来自真实原生消息投影的阶段正文，保留文字、段落以及所有已完成的研究过程。'.repeat(6)
const groupNode=(id:number,key:string)=>({key,kind:'tool-call',anchorSeq:id*10,location:location(id),data:{root:{kind:'tool-call',call:{name:'web_search',argsRaw:JSON.stringify({query:'阶段资料核验'})},status:'completed'},status:'completed'}})
const first=groupNode(1,'tool:1:a'),prose={key:'assistant:1',kind:'assistant-step',anchorSeq:12,location:location(1),data:{status:'settled',blocks:[{kind:'text',text}],finalNode:{seq:12}}},second=groupNode(1,'tool:1:b')
const rows:any[]=[first,prose,second]
const projection=state({chat:{order:rows.map(n=>n.key),nodes:new Map(rows.map(n=>[n.key,n])),timeline:{turns:new Map([[1,{turn:1,status:'open',start:{time:start},end:null}]])}},queue:[],running:true,openState:'open',hasMore:false,loadingOlder:false,subagent:null})
const view=state({view:'chat',selection:null}),sessions=state({byId:{demo:{cwd:'/tmp/response-progress'}}})
const use=(store:any)=>(select:any)=>select(React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot))
const useSession=use(projection),useStore=use(view),useSessions=use(sessions)
const en=w.responseLocale==='en'
const t=(key:string,values:any={})=>{
 const labels=native.__responseDictionaries[en?'en':'zh']
 return String(labels[key]??key).replace(/\{(\w+)\}/g,(_all,name)=>String(values[name]??''))
}
const renderSlot=(name:string,props:any)=>{
 if(name!=='conversation.chat.node')return null
 const node=props.node
 if(node.kind==='assistant-step')return h(native.__responseAssistant,{...props,t,useTurnData:()=>undefined,fileMentions:()=>[]})
 return h('pre',{'data-response-original-detail':node.key},node.data?.root?.call?.argsRaw??node.kind)
}
let activeSessionId='demo',activeOwner=useSession
function App(){return h(native.__responseChat,{sessionId:activeSessionId,useSession:activeOwner,useSessions,useStore,renderSlot,openFile:()=>{},loadOlder:()=>{},loadImage:()=>Promise.resolve(''),inspectCall:()=>{},chatScroll:{read:()=>null,save(){}},forkAt:()=>{},fileMentions:()=>[],t})}
function SharedApp(){const current=useSession((value:any)=>value),chat=current.chat,nodes=new Map(chat.nodes);nodes.set('shared-user',{key:'shared-user',id:'shared-board-task:shared',kind:'user',data:{content:[{type:'text',text:'共享任务原始输入'}]}});return h(native.__responseShared,{group:{rows:[{id:'request',role:'user',createdAt:start,text:'共享任务原始输入',author:{username:'成员',userId:'self'}}]},tasks:[{taskId:'shared',conversation:true,status:current.running?'running':'completed',createdAt:start}],nativeProps:{sessionId:'demo',currentUserId:'self',sharedSnapshot:{order:['shared-user',...chat.order],nodeStore:nodes,timeline:chat.timeline},useSession,renderSlot,t,openFile:()=>{},loadImage:()=>Promise.resolve(''),fileMentions:()=>[]}})}
function Standalone(){return h(React.Fragment,null,h(native.__responseExecution,{entry:{key:'note:1',running:true,noteTask:{status:'正在整理笔记',reasoning:'笔记任务原始详情'}},activityNodes:[],startTime:start,endTime:null,seatProps:{},t}),h(native.__responseExecution,{entry:{key:'canvas:1',running:true,canvasTask:{createdAt:start,state:'waiting',reason:'正在观察画布',history:[{reason:'画布任务原始详情'}]}},activityNodes:[],startTime:start,endTime:null,seatProps:{},t}))}
let pendingObservedAt=0,admittedPending=false
function PendingAfterHistory(){
 const snapshot=React.useSyncExternalStore(projection.subscribe,projection.getSnapshot),now=Date.now(),old={kind:'execution',key:'old',turn:1,running:false,nodeKeys:[]},pending=admittedPending?{kind:'execution',key:'new',turn:2,running:true,nodeKeys:[]}:{kind:'execution',key:'pending',turn:null,running:true,nodeKeys:[],pendingSubmission:true,observedAt:pendingObservedAt}
 const timeline={turns:new Map([[1,{start:{time:start},end:{time:start+10000}}],...admittedPending?[[2,{start:{time:now},end:null}]]:[]])},flow=[old,pending],timings=native.__responseUseProgress(flow,admittedPending?2:1,timeline,true,'pending-after-history',useSession)
 return h(React.Fragment,null,...flow.map(entry=>h(native.__responseExecution,{key:entry.key,entry,activityNodes:[],startTime:timeline.turns.get(entry.turn)?.start?.time??null,endTime:timeline.turns.get(entry.turn)?.end?.time??null,seatProps:{},t,responseTiming:timings.get(entry.key)})))
}
const publish=()=>{const previous=projection.getSnapshot(),turns=new Map(previous.chat.timeline.turns);turns.set(turn,{turn,status:ended?'closed':'open',start:{time:turn===1?firstTurnStart:Date.now()-5_000},end:ended?{time:Date.now()}:null});projection.set({...previous,running:!ended,chat:{order:rows.map(n=>n.key),nodes:new Map(rows.map(n=>[n.key,n])),timeline:{turns}}})}
const completedHistories=new Map<string,{end:number,duration:number}>()
function historySession(id:string,duration:number,loaded=false){
 let history=completedHistories.get(id)
 if(!history){history={end:Date.now()-3600000,duration};completedHistories.set(id,history)}
 activeSessionId=id;ended=true
 const node=groupNode(1,'tool:'+id),previous=projection.getSnapshot()
 projection.set({...previous,running:false,hasMore:!loaded,loadingOlder:false,chat:{order:[node.key],nodes:new Map([[node.key,node]]),timeline:{turns:new Map([[1,{turn:1,status:'closed',...(loaded?{start:{time:history.end-history.duration}}:{}),end:{time:history.end}}]])}}})
 root.render(h(App))
}
w.responseFixture={
 statusSequence(phase:string){
  const current=projection.getSnapshot(),position={kind:'step',turn:{turn:3,status:phase==='done'?'closed':'open'}},items:any[]=[{key:'status-user',kind:'user',location:position,data:{content:[{type:'text',text:'核对这项资料'}]}},{key:'status-reasoning',kind:'assistant-step',location:position,data:{status:'settled',blocks:[{kind:'reasoning',text:'private hidden'}]}}]
  if(phase!=='initial')items.push({key:'status-ack',kind:'assistant-step',location:position,data:{status:phase==='ack'?'streaming':'settled',blocks:[{kind:'reasoning',text:'private mixed reasoning'},{kind:'text',text:'我先核对资料来源，再整理关键变化。'}],finalNode:{seq:31}}})
  if(['tools','done'].includes(phase))items.push({key:'status-search',kind:'tool-call',location:position,data:{root:{kind:'tool-call',call:{name:'web_search',argsRaw:JSON.stringify({query:'公开资料来源'})},status:'completed'}}},{key:'status-read',kind:'tool-call',location:position,data:{root:phase==='done'?{kind:'tool-call',call:{name:'read_file',argsRaw:'{}'},status:'completed'}:{name:'read_file',argsRaw:'{}'}}})
  projection.set({...current,running:phase!=='done',chat:{order:items.map(item=>item.key),nodes:new Map(items.map(item=>[item.key,item])),timeline:{turns:new Map([[3,{turn:3,status:phase==='done'?'closed':'open',start:{time:Date.now()-20000},end:phase==='done'?{time:Date.now()}:null}]])}}})
 },
 historySession,
 loadHistory(){const history=completedHistories.get(activeSessionId)!;historySession(activeSessionId,history.duration,true)},
 activity(kind:string,context=false){
  const current=projection.getSnapshot(),position={kind:'step',turn:{turn:2,status:'open'}},node:any={key:'activity-current',kind:'tool-call',location:position,data:{root:{name:'read_file',argsRaw:'{}'}}}
  if(kind==='reply'){node.kind='assistant-step';node.data={status:'streaming',blocks:[{kind:'text',text:'正在整理可用的结果。'}]}}
  if(kind==='thinking'){node.kind='assistant-step';node.data={status:'streaming',blocks:[{kind:'reasoning',text:'private never shown'}]}}
  if(kind==='compact'){node.kind='compaction';node.data={running:true}}
  if(kind==='retry'){node.kind='model-retry';node.data={}}
  if(kind==='waiting')node.data.root.name='request_user_input'
  const activityRows=context?[first,prose,node]:[node]
  projection.set({...current,running:kind!=='done',chat:{order:activityRows.map(item=>item.key),nodes:new Map(activityRows.map(item=>[item.key,item])),timeline:{turns:new Map([[2,{turn:2,status:kind==='done'?'closed':'open',start:{time:Date.now()-20000},end:kind==='done'?{time:Date.now()}:null}]])}}})
 },
 pendingAfterHistory(){pendingObservedAt=Date.now()-3000;admittedPending=false;root.render(h(PendingAfterHistory))},
 admitAfterHistory(){admittedPending=true;projection.set({...projection.getSnapshot()})},
 switchSession(){activeSessionId='other';root.render(h(App))},
 switchOwner(){activeOwner=(select:any)=>useSession(select);root.render(h(App))},
 pending(keepHistory=false){const previous=projection.getSnapshot(),node={...groupNode(1,'tool:pending'),location:{kind:'session'}};projection.set({...previous,running:true,chat:{order:[node.key],nodes:new Map([[node.key,node]]),timeline:{turns:keepHistory?new Map([[0,{turn:0,status:'closed',start:{time:start-10000},end:{time:start-5000}}]]):new Map()}}})},
 failPending(){const previous=projection.getSnapshot();projection.set({...previous,running:false})},
 admit(){firstTurnStart=Date.now();publish()},
 completeAdmit(){firstTurnStart=Date.now();ended=true;publish()},
 shared(){root.render(h(SharedApp))},
 standalone(){root.render(h(Standalone))},
 step(){step++;rows.push(groupNode(turn,'tool:'+turn+':'+step));publish()},
 finish(){ended=true;publish()},
 next(){ended=false;turn++;rows.push(groupNode(turn,'tool:'+turn+':a'));publish()},
 snapshot:()=>projection.getSnapshot(),
 dispose:()=>root.unmount()
}
root.render(h(App))
