import {expect,it} from 'vitest'
import {Window} from 'happy-dom'
import vm from 'node:vm'
import {sharedComponentRuntime} from '../packages/dsh-research-task-runtime/shared-component-runtime.js'
import {createNoteHtmlSharedStateBridge} from '../scripts/lib/notes-html-interaction.mjs'

function fixture(){
 const w=new Window({settings:{disableJavaScriptEvaluation:true}}),out=[],parent={postMessage:value=>out.push(value)},receive=data=>w.dispatchEvent(new w.MessageEvent('message',{source:parent,data}))
 vm.runInNewContext('('+sharedComponentRuntime.toString()+')()',{window:w,document:w.document,parent,crypto:{randomUUID:()=>crypto.randomUUID()},TextEncoder,Date,CustomEvent:w.CustomEvent,addEventListener:w.addEventListener.bind(w),setInterval:()=>0,clearInterval:()=>{}})
 const handle=w.sherlockShared.register({initialState:{count:0},reduce:s=>({count:s.count+1}),render:()=>{}})
 const context=saved=>receive({type:'sherlock-component-context',shared:false,localAck:true,readOnly:false,saved})
 const latest=()=>out.filter(value=>value.message.op==='localCommit').at(-1)?.message
 const ack=(message,ok=true)=>receive({type:'sherlock-component-receive',message:{peerId:message.peerId,kind:'local-commit',commitId:message.commitId,revision:message.revision,state:message.state,ok}})
 context();return{w,handle,context,latest,ack}
}

it('serializes semantic actions behind durable ACKs and rejects stale ACKs without accepting a failed state',()=>{
 const f=fixture();expect(f.handle.dispatch({type:'count'})).toBe(true);const first=f.latest()
 expect(f.handle.getStatus().saving).toBe(true);expect(f.handle.dispatch({type:'count'})).toBe(true)
 expect(f.latest()).toEqual(first);f.ack(first);const second=f.latest()
 expect(second.revision).toBe(2);expect(second.state).toEqual({count:2})
 f.ack(first);expect(f.handle.getStatus().saving).toBe(true)
 f.ack(second,false);expect(f.handle.getState()).toEqual({count:1});expect(f.handle.getStatus().saving).toBe(false)
 expect(f.w.document.querySelector('[role=alert]').textContent).toContain('未保存')
})

it('restores a durable snapshot and follows a later genuine Notes undo which removes that snapshot',()=>{
 const f=fixture();f.context({revision:4,state:{count:7}});expect(f.handle.getState()).toEqual({count:7})
 f.context();expect(f.handle.getState()).toEqual({count:0});expect(f.handle.getStatus().revision).toBe(0)
})

it.each([{count:42},null])('keeps a newer authoritative Notes state which arrived while an older semantic save was pending: %j',state=>{
 const f=fixture();f.handle.dispatch({type:'count'});const pending=f.latest()
 f.context({revision:9,state});f.ack(pending,false)
 expect(f.handle.getState()).toEqual(state);expect(f.handle.getStatus().revision).toBe(9)
})

it('bounds queued Notes semantic actions while persistence is pending instead of silently accumulating unlimited work',()=>{
 const f=fixture();f.handle.dispatch({type:'count'})
 for(let i=0;i<32;i++)expect(f.handle.dispatch({type:'count'})).toBe(true)
 expect(f.handle.dispatch({type:'count'})).toBe(false)
 expect(f.w.document.querySelector('[role=alert]').textContent).toContain('繁忙')
})

it('publishes a successful state only after ACK, filters stale observations and still allows a matched later Undo',async()=>{
 let resolve;const bridge=createNoteHtmlSharedStateBridge(undefined,()=>new Promise(yes=>{resolve=yes})),saved={version:'v',revision:1,state:{note:'已保存'}}
 const pending=bridge.commit('v',1,saved.state);bridge.observe(saved);expect(bridge.snapshot()).toBeUndefined()
 resolve(saved);expect(await pending).toEqual(saved);expect(bridge.snapshot()).toEqual(saved)
 bridge.observe(undefined);expect(bridge.snapshot()).toBeUndefined()
})

it('never publishes an optimistically observed semantic snapshot whose actual save failed',async()=>{
 let reject;const bridge=createNoteHtmlSharedStateBridge(undefined,()=>new Promise((_yes,no)=>{reject=no})),value={version:'v',revision:1,state:{note:'未保存'}}
 const pending=bridge.commit('v',1,value.state);bridge.observe(value);reject(Error('磁盘失败'))
 expect(await pending).toBeUndefined();bridge.observe(value);expect(bridge.snapshot()).toBeUndefined()
})
