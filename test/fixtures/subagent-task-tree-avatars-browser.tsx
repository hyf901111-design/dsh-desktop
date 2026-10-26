import React,{useSyncExternalStore} from 'react'
import {createRoot} from 'react-dom/client'
import * as ReactDOMClient from 'react-dom/client'
import * as jsx from 'react/jsx-runtime'

declare global{interface Window{taskAvatarInput:any;taskAvatarFixture:any;__ModuleLoader__:any}}
const input=window.taskAvatarInput,ids=['session-1b68c91d-e219-4675-bcf1-a043f520df51','session-e1f517f2-72b1-4213-96d7-9adf5ab5daa4','session-3456caf8-4f25-4a18-b548-b57fdad201ac']
const initial=()=>({byId:{parent:{id:'parent',displayTitle:'A股算力产业链金融分析工作台',running:false},[ids[0]]:{id:ids[0],origin:'subagent',parentId:'parent',displayTitle:'核对公告披露',running:true},[ids[1]]:{id:ids[1],origin:'subagent',parentId:'parent',displayTitle:'研究交付',running:false},[ids[2]]:{id:ids[2],origin:'subagent',parentId:ids[0],displayTitle:'财务口径',running:false}},subagentsByParent:{parent:{state:'ready',entries:[{kind:'child',id:ids[0],mode:'one-shot',activity:'running',hasChildren:true,label:'画布生成任务：很长的研究标题需要在窄任务管理侧栏中保持省略并保留完整名称'},{kind:'child',id:ids[1],mode:'continuable',activity:'inactive',hasChildren:false,label:'画布生成任务'},{kind:'diagnostic',id:'broken',reason:'corrupt'}]},[ids[0]]:{state:'ready',entries:[{kind:'child',id:ids[2],mode:'one-shot',activity:'inactive',hasChildren:false,label:'嵌套财务核验'}]}},jobsBySession:{parent:[{id:'job-1',kind:'bash',label:'财务数据整理',status:'running',startedAt:Date.now()-1000}]}})
let snapshot:any=initial(),current='parent',active=true,mount=0,locale='zh'
const listeners=new Set<()=>void>(),events:any[]=[],subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}}
const publish=()=>{snapshot={...snapshot};for(const fn of listeners)fn()}
const primitives=new Proxy({},{get:(_target,key)=>({state,...props}:any)=>React.createElement('span',{...props,'data-native-icon':String(key),'data-state':state})})
const requireNative=(name:string)=>name==='react'?React:name==='react/jsx-runtime'?jsx:name==='react-dom/client'?ReactDOMClient:primitives
let native:any
window.__ModuleLoader__={load:({factory}:any)=>{native=factory(requireNative)}}
new Function(input.sidebar.replace('exports.apply = apply;','exports.testTaskAvatar={builtinTabs,attachLocale};exports.apply = apply;'))()
const task=native.testTaskAvatar
task.attachLocale({getSnapshot:()=>({active:locale})})
let catalog:any
window.__ModuleLoader__={load:({factory}:any)=>{catalog=factory(requireNative)}}
new Function(input.catalog.replace('exports.apply = apply;','exports.testAvatar=OdysseySubagentAvatar;exports.apply = apply;'))()
const sessions={list:{getSnapshot:()=>snapshot,subscribe},setSubagentCatalogOpen:(id:string,open:boolean)=>events.push({type:'observe',id,open}),openSubagentPanel:(address:any)=>events.push({type:'open',address}),open:(id:string)=>events.push({type:'main',id}),refreshSubagents:(id:string)=>events.push({type:'refresh',id})}
const ctx={sessions,connection:{api:{subagents:{history:async()=>({result:{ok:true,value:{events:[]}}})}}}}
const descriptor=task.builtinTabs(ctx).find((entry:any)=>entry.id==='subagent')
const root=createRoot(document.getElementById('root')!)
function App(){useSyncExternalStore(subscribe,()=>snapshot,()=>snapshot);return <><aside className="catalog-reference"><catalog.testAvatar sessionId={ids[0]} activity={snapshot.byId[ids[0]].running?'running':'inactive'}/><span>目录中的同一子代理</span></aside><main className="task-pane" hidden={!active}>{descriptor.component({ctx,scope:{sessionId:current},visible:active})}</main></>}
const render=()=>root.render(<App key={mount}/>);render()
window.taskAvatarFixture={ids,events,reorder(){snapshot.subagentsByParent.parent={...snapshot.subagentsByParent.parent,entries:[...snapshot.subagentsByParent.parent.entries].reverse()};publish()},select(id:string){current=id;publish()},loading(){snapshot.subagentsByParent={parent:{state:'loading',entries:[]}};publish()},ready(){snapshot={...initial()};publish()},idle(){snapshot.byId={...snapshot.byId,[ids[0]]:{...snapshot.byId[ids[0]],running:false}};snapshot.subagentsByParent.parent={...snapshot.subagentsByParent.parent,entries:snapshot.subagentsByParent.parent.entries.map((entry:any)=>entry.id===ids[0]?{...entry,activity:'inactive'}:entry)};publish()},hide(){active=false;publish()},show(){active=true;publish()},remount(){mount++;render()},locale(value:string){locale=value;publish()}}
