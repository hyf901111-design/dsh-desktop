import { describe, it, expect } from 'vitest'
import { createCanvasActionController } from '../packages/dsh-research-task-runtime/canvas-actions.js'
function fixture() {
 let state = { files: [], artifacts: [{ id:'a', title:'A', excerpt:'old', x:0, y:0, width:300, height:200 },{id:'b',title:'B',x:400,y:0,width:300,height:200}], selection:{selectedNodeIds:['a'],orderedFileIds:[]} }, writable=true, history=[], commits=0
 const controller=createCanvasActionController({snapshot:()=>state,canWrite:()=>writable,describe:n=>({title:{type:'string',maxLength:512},...(typeof n.excerpt==='string'?{excerpt:{type:'string',maxLength:1000}}:{})}),validate:n=>n,commit:next=>{history.push(state);state=next;commits++},undo:()=>{state=history.pop();return true},arrange:s=>({...s,artifacts:s.artifacts.map((n,i)=>({...n,x:i*350}))})})
 return {controller,read:()=>state,commits:()=>commits,edit:()=>{state={...state,artifacts:state.artifacts.map(n=>({...n,title:'manual'}))}},deny:()=>{writable=false}}
}
describe('画布统一操作协议',()=>{
 it('validates an entire batch before any mutation',async()=>{const f=fixture(),s=await f.controller.inspect({});await expect(f.controller.apply({requestId:'1',revision:s.revision,changes:[{op:'remove',ids:['a']},{op:'update',id:'b',fields:{authorizationId:'bad'}}]})).rejects.toThrow();expect(f.commits()).toBe(0);expect(f.read().artifacts).toHaveLength(2)})
 it('rejects coordinates combined with arrange before changing any card',async()=>{const f=fixture(),s=await f.controller.inspect({});await expect(f.controller.apply({requestId:'mixed',revision:s.revision,changes:[{op:'update',id:'a',fields:{x:448}},{op:'arrange'}]})).rejects.toThrow(/不能与坐标/);expect(f.commits()).toBe(0);expect(f.read().artifacts[0].x).toBe(0)})
 it('combines changes, retries idempotently and undoes a single transaction',async()=>{const f=fixture(),s=await f.controller.inspect({});const args={requestId:'1',revision:s.revision,changes:[{op:'update',id:'a',fields:{excerpt:'new'}},{op:'remove',ids:['b']}]};const r=await f.controller.apply(args);expect(f.read().artifacts[0].excerpt).toBe('new');expect(await f.controller.apply(args)).toEqual(r);expect(f.commits()).toBe(1);await f.controller.undo({requestId:'2',revision:r.revision,actionId:r.actionId});expect(f.read().artifacts).toHaveLength(2);expect(f.read().artifacts[0].excerpt).toBe('old')})
 it('refuses stale revisions, readonly access and changed retry payloads',async()=>{const f=fixture(),s=await f.controller.inspect({});f.edit();await expect(f.controller.apply({requestId:'1',revision:s.revision,changes:[{op:'remove',ids:['a']}]})).rejects.toThrow(/变化/);const fresh=await f.controller.inspect({});f.deny();await expect(f.controller.apply({requestId:'2',revision:fresh.revision,changes:[{op:'remove',ids:['a']}]})).rejects.toThrow(/编辑/)})
 it('discovers fields for an unknown component without a type switch',async()=>{const f=fixture(),s=await f.controller.inspect({ids:['a']});expect(s.nodes[0].capabilities.fields.excerpt).toEqual({type:'string',maxLength:1000});expect(s.nodes[0].content.excerpt).toBe('old');expect(s.selectedIds).toEqual(['a']);expect((await f.controller.inspect({})).nodes[0].content).toBeUndefined()})
 it('does not undo a subsequent manual change',async()=>{const f=fixture(),s=await f.controller.inspect({});const r=await f.controller.apply({requestId:'1',revision:s.revision,changes:[{op:'remove',ids:['b']}]});f.edit();await expect(f.controller.undo({requestId:'2',revision:r.revision,actionId:r.actionId})).rejects.toThrow(/变化/)})
})
it('does not mutate after cancellation while waiting for collaborative readiness',async()=>{
 let cancel=false,release,committed=false
 const c=createCanvasActionController({snapshot:()=>({files:[],artifacts:[{id:'a',title:'A'}],selection:{selectedNodeIds:[],orderedFileIds:[]}}),canWrite:()=>true,describe:()=>({}),ready:()=>new Promise(r=>release=r),commit:()=>{committed=true}})
 const s=await c.inspect({}),pending=c.apply({requestId:'cancel',revision:s.revision,changes:[{op:'remove',ids:['a']}]},{isCancelled:()=>cancel})
 cancel=true;release()
 await expect(pending).rejects.toThrow(/取消/);expect(committed).toBe(false)
})
it('keeps duplicate receipts pending until collaborative synchronization is confirmed',async()=>{
 let state={files:[],artifacts:[{id:'a',title:'A'}],selection:{selectedNodeIds:[],orderedFileIds:[]}},finish
 const c=createCanvasActionController({snapshot:()=>state,canWrite:()=>true,describe:()=>({}),commit:n=>{state=n},flush:()=>new Promise(r=>finish=r)})
 const s=await c.inspect({}),args={requestId:'sync',revision:s.revision,changes:[{op:'remove',ids:['a']}]},pending=c.apply(args)
 await new Promise(r=>setTimeout(r,0))
 expect((await c.apply(args)).status).toBe('pending');finish();expect((await pending).status).toBe('applied')
})
