import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import * as dom from 'react-dom'
import {createRoot} from 'react-dom/client'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'

const w=window as any
let fallback:any;fallback=new Proxy(function(){},{get:()=>fallback,apply:()=>fallback,construct:()=>({})})
const moduleFor=(id:string)=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{ImageGallery:()=>null}:id==='@deepseek-ai/cordis'?{Service:class{constructor(public ctx:any){}}}:fallback
const native=w.notesProgressDescriptor.factory(moduleFor),h=React.createElement
const t=(key:string,values:any={})=>String(native.__notesProgressDictionary[key]??key).replace(/\{(\w+)\}/g,(_all,name)=>String(values[name]??''))
const UserBubble=({content}:any)=>h('p',{'data-note-prompt':''},content.map((item:any)=>item.text).join(''))
const Markdown=({blocks}:any)=>h('p',{'data-note-markdown':''},blocks.map((item:any)=>item.text).join(''))
function App(){
 const rows=native.__notesProgressRows('test-session')
 return h(React.Fragment,null,...rows.map((row:any)=>h(native.__notesProgressRow,{key:row.requestId,row,sessionId:'test-session',t,UserBubble,Markdown,Actions:null})),
  h(native.__notesProgressExecution,{entry:{key:'canvas:1',running:true,canvasTask:{createdAt:Date.now()-20000,state:'waiting',reason:'正在观察画布',history:[{reason:'画布任务公开阶段'}]}},activityNodes:[],startTime:Date.now()-20000,endTime:null,seatProps:{},t}))
}
const root=createRoot(document.getElementById('app')!);root.render(h(App))
w.notesProgressFixture={
 send(phase:string,extra:any={}){document.dispatchEvent(new CustomEvent('sherlock:notes-task-state',{detail:{sessionId:'test-session',requestId:'live',phase,...extra}}))},
 replay(rows:any[]){document.dispatchEvent(new CustomEvent('sherlock:notes-history',{detail:{sessionId:'test-session',rows}}))},
 reset(){document.dispatchEvent(new Event('sherlock:notes-reset'))}
}
