import {afterEach,expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {createNoteComponentDataActions} from '../src/preload/notes/component-data-actions'

const spec=(title='原数据')=>({version:1,type:'table',title,columns:['月份','收入'],rows:[['一月',10]]})
const revision=(payload:string)=>createHash('sha256').update(payload).digest('hex')
let requestSequence=0
function fixture(options:{update?:boolean}={}){
 const node={id:'node-a',kind:'generated-container',title:'保留标题',excerpt:'保留摘要',containerSpec:spec(),generationStatus:'completed',noteSize:{width:320,height:240},config:{interactionState:{sort:'desc'}},privateState:'不得导出'}
 const block:any={id:'block-a',type:'research',props:{payload:JSON.stringify(node),textAlignment:'right',noteIndent:2,custom:'保留属性'}}
 const other:any={id:'other',type:'research',props:{payload:JSON.stringify({...node,id:'node-b',containerSpec:spec('其它组件')})}},parent:any={id:'parent',type:'paragraph',content:[{type:'text',text:'私有笔记正文'}],children:[block]}
 let current=true
 const editor:any={isEditable:true,document:[parent,other],getBlock:vi.fn((id:string)=>[parent,block,other].find(value=>value.id===id)),updateBlock:vi.fn((id:string,value:any)=>{const target=editor.getBlock(id);Object.assign(target,{...value,props:{...target.props,...value.props}})})}
 const update=vi.fn((id:string,next:any)=>editor.updateBlock(id,{props:{payload:JSON.stringify(next)}}))
 const handle=createNoteComponentDataActions({sessionId:'notes-session',editor,current:()=>current,...options.update?{update}:{}})
 const packet=(method='inspect',args:any={ids:['node-a']},overrides:any={})=>({requestId:'transport-'+(++requestSequence),sessionId:'notes-session',selectedIds:['node-a'],expiresAt:Date.now()+35000,method,args,...overrides})
 const apply=(before:string,changes:any=[{op:'update',id:'node-a',fields:{containerSpec:spec('新数据')}}],operationId='operation-'+(++requestSequence))=>packet('apply',{requestId:operationId,revision:before,changes})
 return {node,block,other,parent,editor,update,handle,packet,apply,deactivate:()=>{current=false}}
}
afterEach(()=>vi.restoreAllMocks())

it('inspects only the selected component with a payload revision and no note or other component content',async()=>{
 const f=fixture();Object.defineProperty(f.parent,'content',{get(){throw Error('must not read note text')}})
 const reply:any=await f.handle(f.packet())
 expect(reply).toMatchObject({sessionId:'notes-session',result:{revision:revision(f.block.props.payload),writable:true,nodes:[{id:'node-a',kind:'generated-container',content:{containerSpec:spec()},capabilities:{fields:{containerSpec:true}}}]}})
 expect(reply.result.nodes).toHaveLength(1);expect(JSON.stringify(reply)).not.toContain('不得导出');expect(JSON.stringify(reply)).not.toContain('其它组件');expect(reply.result.nodes[0].content).toEqual({containerSpec:spec()});expect(f.editor.updateBlock).not.toHaveBeenCalled()
})

it.each([false,true])('applies only containerSpec and preserves node state, geometry and block props (custom update=%s)',async custom=>{
 const f=fixture({update:custom}),before=JSON.parse(f.block.props.payload),props={...f.block.props},request=f.apply(revision(f.block.props.payload)),reply:any=await f.handle(request)
 expect(reply).toMatchObject({requestId:request.requestId,sessionId:'notes-session',result:{status:'applied',revision:revision(f.block.props.payload)}})
 expect(JSON.parse(f.block.props.payload)).toEqual({...before,containerSpec:spec('新数据')});expect(f.block.props).toEqual({...props,payload:f.block.props.payload});expect(f.editor.updateBlock).toHaveBeenCalledOnce();expect(f.update).toHaveBeenCalledTimes(custom?1:0)
})

it('ignores other sessions and explicit cancellations without reading the editor',async()=>{
 const f=fixture(),read=vi.fn(()=>{throw Error('must not read editor')});Object.defineProperty(f.editor,'document',{get:read})
 expect(await f.handle(f.packet('inspect',{}, {sessionId:'elsewhere'}))).toBeUndefined()
 expect(await f.handle({requestId:'cancelled',cancel:true})).toBeUndefined()
 expect(read).not.toHaveBeenCalled();expect(f.editor.updateBlock).not.toHaveBeenCalled()
})

it.each([
 {selectedIds:[]},{selectedIds:['node-a','node-b']},{selectedIds:['unknown']},{method:'remove'},
 {args:{ids:['node-b']}},{args:{ids:['node-a','node-b']}},{args:{ids:['node-a'],includeContent:true}},
 {expiresAt:0},{expiresAt:Infinity},{expiresAt:undefined}
])('rejects an invalid or expired scope without side effects: %j',async overrides=>{
 const f=fixture(),before=f.block.props.payload,reply:any=await f.handle(f.packet('inspect',{ids:['node-a']},overrides))
 expect(reply?.error).toEqual(expect.any(String));expect(reply?.result).toBeUndefined();expect(f.block.props.payload).toBe(before);expect(f.editor.updateBlock).not.toHaveBeenCalled()
})

it.each(['draft','queued','running','retrying'])('refuses a %s component',async generationStatus=>{
 const f=fixture();f.block.props.payload=JSON.stringify({...f.node,generationStatus})
 expect((await f.handle(f.packet()) as any)?.error).toEqual(expect.any(String));expect(f.editor.updateBlock).not.toHaveBeenCalled()
})
it('refuses a note draft or a non-research target',async()=>{
 const f=fixture();f.block.props.payload=JSON.stringify({...f.node,noteDraft:'smart'})
 expect((await f.handle(f.packet()) as any)?.error).toEqual(expect.any(String));f.block.type='attachment'
 expect((await f.handle(f.packet()) as any)?.error).toEqual(expect.any(String));expect(f.editor.updateBlock).not.toHaveBeenCalled()
})
it('reports read-only inspection and rejects read-only writes',async()=>{
 const f=fixture();f.editor.isEditable=false
 expect(await f.handle(f.packet())).toMatchObject({result:{writable:false,nodes:[{capabilities:{fields:{containerSpec:false}}}]}})
 expect(await f.handle(f.apply(revision(f.block.props.payload)))).toMatchObject({error:expect.any(String)});expect(f.editor.updateBlock).not.toHaveBeenCalled()
})

it.each([
 [{op:'remove',id:'node-a',fields:{containerSpec:spec()}}],
 [{op:'update',id:'node-b',fields:{containerSpec:spec()}}],
 [{op:'update',id:'node-a',fields:{containerSpec:spec(),title:'不能改'}}],
 [{op:'update',id:'node-a',fields:{noteSize:{width:100}}}],
 [{op:'update',id:'node-a',fields:{containerSpec:{version:1,type:'table',title:'坏数据',columns:[],rows:[]}}}],
 [{op:'update',id:'node-a',fields:{containerSpec:spec()},extra:true}],
 [{op:'update',id:'node-a',fields:{containerSpec:spec()}},{op:'update',id:'node-a',fields:{containerSpec:spec()}}],[]
].map(changes=>({changes})))('rejects unvalidated or out-of-scope changes without touching the node: %j',async({changes})=>{
 const f=fixture(),before=f.block.props.payload,reply:any=await f.handle(f.apply(revision(before),changes))
 expect(reply?.error).toEqual(expect.any(String));expect(f.block.props.payload).toBe(before);expect(f.editor.updateBlock).not.toHaveBeenCalled()
})

it('rejects a stale payload revision instead of overwriting newer state',async()=>{
 const f=fixture(),before=revision(f.block.props.payload);f.block.props.payload=JSON.stringify({...f.node,noteSize:{width:500,height:300}})
 expect(await f.handle(f.apply(before))).toMatchObject({error:expect.any(String)});expect(JSON.parse(f.block.props.payload).noteSize.width).toBe(500);expect(f.editor.updateBlock).not.toHaveBeenCalled()
})

it.each(['inspect','apply'])('detects a payload change during the asynchronous %s digest',async method=>{
 const f=fixture(),before=revision(f.block.props.payload),digest=crypto.subtle.digest.bind(crypto.subtle);let release!:()=>void
 const gate=new Promise<void>(resolve=>{release=resolve});vi.spyOn(crypto.subtle,'digest').mockImplementationOnce(async(...args)=>{await gate;return digest(...args)})
 const pending=f.handle(method==='inspect'?f.packet():f.apply(before));f.block.props.payload=JSON.stringify({...f.node,title:'较新标题'});release()
 expect(await pending).toMatchObject({error:expect.any(String)});expect(JSON.parse(f.block.props.payload).title).toBe('较新标题');expect(f.editor.updateBlock).not.toHaveBeenCalled()
})
it('checks CAS again after hashing the proposed payload and preserves newer edits',async()=>{
 const f=fixture(),before=revision(f.block.props.payload),digest=crypto.subtle.digest.bind(crypto.subtle);let calls=0,release!:()=>void
 const gate=new Promise<void>(resolve=>{release=resolve});vi.spyOn(crypto.subtle,'digest').mockImplementation(async(...args)=>{if(++calls===2)await gate;return digest(...args)})
 const pending=f.handle(f.apply(before));await vi.waitFor(()=>expect(calls).toBe(2));f.block.props.payload=JSON.stringify({...f.node,noteSize:{width:600,height:400}});release()
 expect(await pending).toMatchObject({error:expect.any(String)});expect(JSON.parse(f.block.props.payload).noteSize.width).toBe(600);expect(f.editor.updateBlock).not.toHaveBeenCalled()
})
it.each(['identity','cancel','expiry'])('does not expose or apply a result after %s changes during hashing',async reason=>{
 const f=fixture(),digest=crypto.subtle.digest.bind(crypto.subtle);let release!:()=>void,cancelled=false
 const request=f.apply(revision(f.block.props.payload));request.isCancelled=()=>cancelled
 const gate=new Promise<void>(resolve=>{release=resolve});vi.spyOn(crypto.subtle,'digest').mockImplementationOnce(async(...args)=>{await gate;return digest(...args)})
 const pending=f.handle(request);if(reason==='identity')f.deactivate();else if(reason==='cancel')cancelled=true;else vi.spyOn(Date,'now').mockReturnValue(request.expiresAt+1);release()
 const reply:any=await pending;expect(reply?.result).toBeUndefined();expect(reply?.error).toEqual(expect.any(String));expect(f.editor.updateBlock).not.toHaveBeenCalled()
})
it('honors the trusted cancellation packet while an apply digest is pending',async()=>{
 const f=fixture(),digest=crypto.subtle.digest.bind(crypto.subtle),request=f.apply(revision(f.block.props.payload));let release!:()=>void
 const gate=new Promise<void>(resolve=>{release=resolve});vi.spyOn(crypto.subtle,'digest').mockImplementationOnce(async(...args)=>{await gate;return digest(...args)})
 const pending=f.handle(request);expect(await f.handle({requestId:request.requestId,cancel:true})).toBeUndefined();release()
 expect(await pending).toMatchObject({error:expect.any(String)});expect(f.editor.updateBlock).not.toHaveBeenCalled()
})

it('deduplicates concurrent and retried apply operations across transport request IDs',async()=>{
 const f=fixture(),request=f.apply(revision(f.block.props.payload)),first=f.handle(request),second=f.handle({...request}),replies=await Promise.all([first,second])
 expect(replies[0]).toEqual(replies[1]);expect(replies[0]).toMatchObject({result:{status:'applied'}});expect(f.editor.updateBlock).toHaveBeenCalledOnce()
 expect(await f.handle({...request,requestId:'retry-transport'})).toMatchObject({requestId:'retry-transport',result:{status:'applied'}});expect(f.editor.updateBlock).toHaveBeenCalledOnce()
 const changed={...request,requestId:'changed-transport',args:{...request.args,changes:[{op:'update',id:'node-a',fields:{containerSpec:spec('偷换参数')}}]}}
 expect(await f.handle(changed)).toMatchObject({error:expect.any(String)});expect(f.editor.updateBlock).toHaveBeenCalledOnce()
})
it('rejects reuse of a transport request ID with different arguments',async()=>{
 const f=fixture(),request=f.packet();await f.handle(request)
 expect(await f.handle({...request,args:{ids:['node-b']}})).toMatchObject({error:expect.any(String)});expect(f.editor.updateBlock).not.toHaveBeenCalled()
})
it('lets only one concurrent operation commit against the same revision',async()=>{
 const f=fixture(),before=revision(f.block.props.payload),replies=await Promise.all([f.handle(f.apply(before)),f.handle(f.apply(before,[{op:'update',id:'node-a',fields:{containerSpec:spec('另一批数据')}}]))])
 expect(replies.filter(reply=>reply?.result?.status==='applied')).toHaveLength(1);expect(replies.filter(reply=>reply?.error)).toHaveLength(1);expect(f.editor.updateBlock).toHaveBeenCalledOnce()
})
it('does not replay a cached inspection after the active identity changes',async()=>{
 const f=fixture(),request=f.packet();expect(await f.handle(request)).toMatchObject({result:{writable:true}});f.deactivate()
 const reply=await f.handle(request);expect(reply).toMatchObject({error:expect.any(String)});expect(reply?.result).toBeUndefined()
})
