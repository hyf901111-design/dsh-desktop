import { it, expect } from 'vitest'
import { ComponentRooms } from '../services/collaboration/component-room.js'
import { componentData, componentVersion, validateComponentMessage } from '../packages/dsh-research-collaboration/component-state.js'
import { sharedComponentRuntime } from '../packages/dsh-research-task-runtime/shared-component-runtime.js'
import { Window } from 'happy-dom'
import vm from 'node:vm'
const clone = x => structuredClone(x)
function fixture() {
  let now = 1000
  const data = new Map(), storage = { get: async k => clone(data.get(k)), put: async (k,v) => data.set(k,clone(v)) }
  const hub = new ComponentRooms(storage, () => now), out = {}, live = {}
  const actor = (id, canWrite=true) => ({ userId:id, canWrite, epoch:1, connection:id, alive:()=>live[id] !== false, send:m=>(out[id]??=[]).push(clone(m)) })
  const ids = {}
  const send = (id, op, rest={}, writable=true) => {
    if(op==='input') { const list=ids[id]??=[]; if(!list.includes(rest.inputId))list.push(rest.inputId); rest={...rest,sequence:list.indexOf(rest.inputId)+1} }
    return hub.receive({nodeId:'node',version:'v1',peerId:id,op,...rest}, actor(id,writable))
  }
  const latest = id => out[id]?.filter(m=>m.kind==='snapshot').at(-1)
  return {hub,storage,data,send,latest,out,live,advance:n=>now+=n}
}
it('validates data, identities, state sizes and revisions without executable payloads',()=>{
  expect(componentData({x:[1,true,null,'a']})).toBe(true)
  for(const value of [{x:NaN}, {x:()=>{}}, JSON.parse('{"__proto__":{}}'), new Date(), {huge:'x'.repeat(65536)}]) expect(componentData(value)).toBe(false)
  expect(()=>validateComponentMessage({nodeId:'n',peerId:'p',version:'v',op:'commit',revision:1,token:'x',ack:[],state:{}})).not.toThrow()
  expect(()=>validateComponentMessage({nodeId:'n',peerId:'p',version:'v',op:'input',inputId:'x',payload:{},script:'x'})).toThrow()
  expect(componentVersion('one')).not.toBe(componentVersion('two'))
})
it('shares committed snapshots, preserves late joins, rejects viewers and fences old executors',async()=>{
  const f=fixture();await f.send('a','join');await f.send('b','join');
  let a=f.latest('a');expect(a.isHost).toBe(true);expect(f.latest('b').isHost).toBe(false)
  await f.send('b','input',{inputId:'edit-1',payload:{type:'set',value:7}})
  await f.send('a','commit',{token:a.token,revision:1,state:{value:7},ack:['edit-1']})
  expect(f.latest('a').state).toEqual(f.latest('b').state)
  await f.send('c','join',{},false);expect(f.latest('c').state).toEqual({value:7});expect(f.latest('c').readOnly).toBe(true)
  await expect(f.send('c','input',{inputId:'bad',payload:{}},false)).rejects.toThrow('ACCESS_DENIED')
  await f.send('b','input',{inputId:'edit-2',payload:{type:'increment'}})
  f.live.a=false;await f.send('b','join');const b=f.latest('b');expect(b.isHost).toBe(true);expect(b.token).not.toBe(a.token)
  expect(f.out.b.at(-1).inputs.map(x=>x.id)).toEqual(['edit-2'])
  await f.send('b','commit',{token:a.token,revision:2,state:{value:999},ack:[]});expect(f.latest('b').state.value).toBe(7)
  await f.send('b','commit',{token:b.token,revision:2,state:{value:8},ack:['edit-2']});expect(f.latest('c').state.value).toBe(8)
  // A delayed duplicate input must not be applied a second time.
  await f.send('b','input',{inputId:'edit-2',payload:{type:'increment'}})
  expect([...f.data.values()][0].pending).toEqual([])
  const restarted=new ComponentRooms(f.storage);const messages=[]
  await restarted.receive({nodeId:'node',version:'v1',peerId:'d',op:'join'},{userId:'d',canWrite:true,epoch:1,connection:'d',alive:()=>true,send:x=>messages.push(x)})
  expect(messages[0].state).toEqual({value:8})
})
it('rejects cross-connection peer forgery and skipped input acknowledgments',async()=>{
  const f=fixture();await f.send('a','join');await f.send('b','join');
  await expect(f.hub.receive({nodeId:'node',version:'v1',peerId:'a',op:'join'},{userId:'b',connection:'b',canWrite:true,epoch:1,alive:()=>true,send:()=>{}})).rejects.toThrow('COMPONENT_PEER_CONFLICT')
  await f.send('b','input',{inputId:'first',payload:{}})
  await expect(f.send('a','commit',{token:f.latest('a').token,revision:1,state:{},ack:['second']})).rejects.toThrow('INVALID_COMPONENT_ACK')
})
// Execute the actual sandbox SDK in two separate JS realms. No component-specific
// game adapter: the same transport handles forms, counters, dragging and timers.
it('two SDK clients converge for simultaneous edits, positions, random simulation ticks and reconnect',async()=>{
  const f=fixture(), queue=[], clients={}, actors={};let serial=0, now=1000
  const receive=(c,m)=>c.w.dispatchEvent(new c.w.MessageEvent('message',{source:c.parent,data:m}))
  const make=(id,readonly=false)=>{
    const w=new Window({settings:{disableJavaScriptEvaluation:true}}), intervals=[]
    const parent={postMessage:m=>queue.push({id,m})};const c={w,parent,intervals,paints:[]};clients[id]=c
    const DateShim=class extends Date {static now(){return now}}
    vm.runInNewContext('('+sharedComponentRuntime.toString()+')()', {window:w,document:w.document,parent,crypto:{randomUUID:()=>`${id}-${++serial}`},TextEncoder,Date:DateShim,CustomEvent:w.CustomEvent,addEventListener:w.addEventListener.bind(w),setInterval:fn=>(intervals.push(fn),intervals.length),clearInterval:()=>{}})
    c.handle=w.sherlockShared.register({initialState:{count:0,fields:{},position:{x:0,y:0},ticks:0,random:0},
      reduce:(s,a)=>a.type==='count'?{...s,count:s.count+1}:a.type==='field'?{...s,fields:{...s.fields,[a.key]:a.value}}:{...s,position:a.position},
      tick:s=>({...s,ticks:s.ticks+1,random:Math.random()}),tickMs:100,
      render:(s,status)=>c.paints.push({s,status})})
    actors[id]={userId:id,canWrite:!readonly,epoch:1,connection:id,alive:()=>f.live[id]!==false,send:m=>receive(c,{type:'sherlock-component-receive',message:clone(m)})}
    return c
  }
  const flush=async()=>{
    let n=0;while(queue.length){if(++n>200)throw Error('message loop');const {id,m}=queue.shift();if(f.live[id]===false)continue
      if(m.message.op==='join')receive(clients[id],{type:'sherlock-component-context',shared:true,online:true,readOnly:!actors[id].canWrite,userId:id})
      await f.hub.receive(JSON.parse(JSON.stringify({...m.message,nodeId:'node',version:'v1'})),actors[id])
    }
  }
  const a=make('a'),b=make('b');await flush()
  a.handle.dispatch({type:'field',key:'name',value:'Alice'});b.handle.dispatch({type:'field',key:'city',value:'上海'});a.handle.dispatch({type:'count'});b.handle.dispatch({type:'count'});await flush()
  b.handle.dispatch({type:'move',position:{x:120,y:350}});await flush()
  expect(a.handle.getState()).toEqual(b.handle.getState());expect(a.handle.getState().fields).toEqual({name:'Alice',city:'上海'});expect(a.handle.getState().count).toBe(2)
  for(let i=0;i<5;i++){now+=140;a.intervals[1]();b.intervals[1]();await flush()}
  expect(a.handle.getState()).toEqual(b.handle.getState());expect(a.handle.getState().ticks).toBe(5)
  const viewer=make('viewer',true);await flush();expect(viewer.handle.getState()).toEqual(a.handle.getState());expect(viewer.handle.dispatch({type:'count'})).toBe(false)
  f.live.a=false;receive(a,{type:'sherlock-component-context',shared:true,online:false,readOnly:false,userId:'a'});b.intervals[0]();await flush()
  expect(a.handle.dispatch({type:'count'})).toBe(false);expect(b.handle.getStatus().isHost).toBe(true)
  now+=140;b.intervals[1]();await flush();expect(b.handle.getState().ticks).toBe(6);expect(viewer.handle.getState()).toEqual(b.handle.getState())
})
it('personal boards persist semantic state and restore without replaying actions',()=>{
 const create=(saved)=>{
  const w=new Window({settings:{disableJavaScriptEvaluation:true}}),out=[],parent={postMessage:m=>out.push(m)}
  vm.runInNewContext('('+sharedComponentRuntime.toString()+')()', {window:w,document:w.document,parent,crypto:{randomUUID:()=>crypto.randomUUID()},TextEncoder,Date,CustomEvent:w.CustomEvent,addEventListener:w.addEventListener.bind(w),setInterval:()=>0,clearInterval:()=>{}})
  const h=w.sherlockShared.register({initialState:{count:0},reduce:s=>({count:s.count+1}),render:()=>{}})
  w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{type:'sherlock-component-context',shared:false,readOnly:false,saved}}))
  return {h,out}
 }
 const a=create();a.h.dispatch({type:'increment'});a.h.dispatch({type:'increment'});
 const saved=a.out.at(-1).message;expect(saved.op).toBe('localCommit');expect(saved.state.count).toBe(2)
 const b=create(saved);expect(b.h.getState()).toEqual({count:2});b.h.dispatch({type:'increment'});expect(b.h.getState()).toEqual({count:3})
})

function localSdk(options, saved, semantic) {
 const w=new Window({settings:{disableJavaScriptEvaluation:true}}),out=[],parent={postMessage:m=>out.push(clone(m))}
 vm.runInNewContext('('+sharedComponentRuntime.toString()+')(semantic)', {semantic,window:w,document:w.document,parent,crypto:{randomUUID:()=>crypto.randomUUID()},TextEncoder,Date,CustomEvent:w.CustomEvent,addEventListener:w.addEventListener.bind(w),setInterval:()=>0,clearInterval:()=>{}})
 const h=w.sherlockShared.register(options)
 const context=()=>w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{type:'sherlock-component-context',shared:false,readOnly:false,saved}}))
 context()
 return {w,out,h,context}
}
it('admits equal checkbox actions once across event phases but retains distinct actions and independent activations',()=>{
 const target={},click={target},input={target},change={target},semantic={events:new WeakSet(),current:click,activation:{target,event:click,actions:new Map()}}
 const sdk=localSdk({initialState:{count:0},reduce:s=>({count:s.count+1}),render:()=>{}},undefined,semantic)
 expect(sdk.h.dispatch({type:'check',index:0})).toBe(true)
 semantic.current=input;expect(sdk.h.dispatch({index:0,type:'check'})).toBe(true)
 semantic.current=change;expect(sdk.h.dispatch({type:'check',index:0})).toBe(true)
 expect(sdk.h.getState()).toEqual({count:1});expect(semantic.events.has(click)).toBe(true)
 expect(sdk.h.dispatch({type:'audit'})).toBe(true);expect(sdk.h.dispatch({type:'audit'})).toBe(true)
 expect(sdk.h.getState()).toEqual({count:3})
 const next={target};semantic.current=next;semantic.activation={target,event:next,actions:new Map()}
 expect(sdk.h.dispatch({type:'check',index:0})).toBe(true);expect(sdk.h.getState()).toEqual({count:4})
 expect(sdk.out.filter(row=>row.message?.op==='localCommit')).toHaveLength(4)
})
it('does not cache failed admission or let a removable DOM marker bypass private replay protection',()=>{
 const target={},click={target},semantic={events:new WeakSet(),current:click,activation:{target,event:click,actions:new Map()}}
 let fail=true,displayed=0
 const sdk=localSdk({initialState:{count:0},reduce:s=>{if(fail)throw Error('not admitted');return{count:s.count+1}},render:s=>{displayed=s.count}},undefined,semantic)
 expect(sdk.h.dispatch({type:'check'})).toBe(false)
 semantic.current={target};fail=false;expect(sdk.h.dispatch({type:'check'})).toBe(true);expect(sdk.h.getState()).toEqual({count:1})
 semantic.replaying=true;sdk.w.document.documentElement.removeAttribute('data-sherlock-interaction-replaying')
 expect(sdk.h.dispatch({type:'check'})).toBe(false);semantic.restoreShared()
 expect(sdk.h.getState()).toEqual({count:1});expect(displayed).toBe(1)
 expect(sdk.out.filter(row=>row.message?.op==='localCommit')).toHaveLength(1)
 semantic.replaying=false;semantic.activation=undefined;semantic.current={target}
 expect(sdk.h.dispatch({type:'check'})).toBe(true);expect(sdk.h.getState()).toEqual({count:2})
})
it('does not persist an operation whose rendered state fails and allows a later valid operation',()=>{
 let displayed=''
 const sdk=localSdk({initialState:{order:['B01','B02'],selected:null},reduce:(s,a)=>a.type==='brokenMove'?{...s,order:[null,'B01']}:{...s,selected:a.id},render:s=>{displayed=s.order.map(id=>({B01:'一',B02:'二'})[id].toString()).join('')}})
 expect(sdk.h.dispatch({type:'select',id:'B01'})).toBe(true)
 const successful=clone(sdk.out.at(-1))
 expect(sdk.h.dispatch({type:'brokenMove'})).toBe(false)
 expect(sdk.h.getState()).toEqual({order:['B01','B02'],selected:'B01'})
 expect(sdk.h.getStatus()).toMatchObject({connected:true,readOnly:false,revision:1})
 expect(displayed).toBe('一二')
 expect(sdk.out.at(-1)).toEqual(successful)
 expect(sdk.w.document.querySelector('[data-sherlock-operation-error]')?.textContent).toContain('已保留')
 expect(sdk.h.dispatch({type:'select',id:'B02'})).toBe(true)
 expect(sdk.out.at(-1).message).toMatchObject({op:'localCommit',revision:2,state:{order:['B01','B02'],selected:'B02'}})
 expect(sdk.w.document.querySelector('[data-sherlock-operation-error]')).toBeNull()
})
it('rejects reducer errors without disabling otherwise valid local interactions',()=>{
 const sdk=localSdk({initialState:{count:1},reduce:(s,a)=>{if(a.type==='broken')throw Error('private source details');return {count:s.count+1}},render:()=>{}})
 expect(sdk.h.dispatch({type:'broken'})).toBe(false)
 expect(sdk.h.getState()).toEqual({count:1})
 expect(sdk.h.getStatus()).toMatchObject({connected:true,readOnly:false,revision:0})
 expect(sdk.w.document.body.textContent).not.toContain('private source details')
 expect(sdk.out.some(m=>m.message?.op==='localCommit')).toBe(false)
 expect(sdk.h.dispatch({type:'increment'})).toBe(true)
 expect(sdk.h.getState()).toEqual({count:2})
})
it('keeps an unreadable saved snapshot intact and shows recoverable initial content',()=>{
 const saved={revision:7,state:{order:[null,'B01']}}
 let displayed=''
 const sdk=localSdk({initialState:{order:['B01','B02']},reduce:s=>({order:[...s.order].reverse()}),render:s=>{displayed=s.order.map(id=>id.toLowerCase()).join(',')}},saved)
 expect(sdk.h.getState()).toEqual({order:['B01','B02']})
 expect(sdk.h.getStatus()).toMatchObject({connected:true,readOnly:false,revision:7})
 expect(displayed).toBe('b01,b02')
 expect(saved).toEqual({revision:7,state:{order:[null,'B01']}})
 expect(sdk.out.some(m=>m.message?.op==='localCommit')).toBe(false)
 expect(sdk.w.document.querySelector('[data-sherlock-operation-error]')?.textContent).toContain('先前')
 expect(sdk.h.dispatch({type:'reverse'})).toBe(true)
 expect(sdk.out.at(-1).message).toMatchObject({op:'localCommit',revision:8,state:{order:['B02','B01']}})
})
it('never writes oversized or undefined local reducer output and preserves the last rendered state',()=>{
 for(const bad of [undefined,{text:'x'.repeat(65537)}]){
  let displayed=''
  const sdk=localSdk({initialState:{text:'原始内容'},reduce:()=>bad,render:s=>{displayed=s.text}})
  expect(sdk.h.dispatch({type:'edit'})).toBe(false)
  expect(sdk.h.getState()).toEqual({text:'原始内容'})
  expect(displayed).toBe('原始内容')
  expect(sdk.h.getStatus()).toMatchObject({connected:true,readOnly:false,revision:0})
  expect(sdk.out.some(m=>m.message?.op==='localCommit')).toBe(false)
 }
})
