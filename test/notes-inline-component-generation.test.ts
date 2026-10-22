import {afterEach,expect,it,vi} from 'vitest'
import {createInlineComponentGeneration} from '../src/preload/notes/use-inline-component-generation'
const managers:any[]=[]
afterEach(()=>{for(const manager of managers.splice(0))manager.dispose();vi.useRealTimers()})
const result=(title='result')=>({kind:'component',node:{kind:'generated-container',title,containerSpec:{version:1,type:'table',title,columns:['value'],rows:[[1]]}}})
async function flush(){for(let i=0;i<8;i++)await Promise.resolve()}
function fixture(){
 const blocks=new Map<string,any>(),pending=new Map<string,{resolve(value:any):void;reject(error:Error):void}>(),calls:any[]=[],updates:any[]=[],save=vi.fn(async()=>{});let live=true
 for(const id of ['a','b','c','d'])blocks.set(id,{id,type:'research',props:{payload:JSON.stringify({id:'note-component-'+id,noteDraft:'smart',containerPrompt:'Create '+id,generationStatus:'draft',noteSize:{height:260}})}})
 const editor={isEditable:true,getBlock:(id:string)=>blocks.get(id),updateBlock:(id:string,value:any)=>{const block=blocks.get(id);blocks.set(id,{...block,props:{...block.props,...value.props}});updates.push({id,payload:value.props.payload})}}
 const bridge={request:vi.fn((method:string,input:any)=>{calls.push({method,input});if(method==='generate')return new Promise((resolve,reject)=>pending.set(input.requestId,{resolve,reject}));return Promise.resolve({enabled:true})})}
 const manager=createInlineComponentGeneration({sessionId:'notes',bridge,editor,current:()=>live,persist:save,changed:vi.fn(),update:(id:string,node:any)=>editor.updateBlock(id,{props:{payload:JSON.stringify(node)}})});managers.push(manager)
 return {manager,bridge,editor,blocks,pending,calls,updates,save,node:(id:string)=>JSON.parse(blocks.get(id).props.payload),resolve:(id:string,value:any)=>{const request=calls.find(call=>call.method==='generate'&&call.input.prompt==='Create '+id);pending.get(request.input.requestId)!.resolve(value)},inactive:()=>{live=false}}
}
it('starts three isolated silent component jobs and rejects a fourth without coupling to the conversation',()=>{
 const f=fixture();for(const id of ['a','b','c'])expect(f.manager.start(id,'Create '+id)).toMatchObject({ok:true});expect(f.manager.start('d','Create d')).toMatchObject({ok:false});expect(f.manager.start('a','duplicate')).toMatchObject({ok:false})
 expect(f.calls).toHaveLength(3);for(const call of f.calls)expect(call).toMatchObject({method:'generate',input:{sessionId:'notes',mode:'component',entryPoint:'component',context:{scope:'none',components:[]},selection:'',markdown:'',title:''}})
 expect(new Set(f.calls.map(call=>call.input.requestId)).size).toBe(3);expect(f.manager.isGenerating('a')).toBe(true)
})
it('routes child progress to the matching card and preserves an independently resized frame',()=>{
 const f=fixture();f.manager.start('a','Create a');f.manager.start('b','Create b');const requestId=f.calls[0].input.requestId,node=f.node('a');f.editor.updateBlock('a',{props:{payload:JSON.stringify({...node,noteSize:{height:400}})}})
 f.manager.progress({sessionId:'other',requestId,componentTask:{generationPartialText:'ignore'}});f.manager.progress({sessionId:'notes',requestId,componentTask:{generationTaskId:'child-task',childSessionId:'child-session',generationEvents:[{type:'tool-started',tool:'read'}],generationPartialText:'reading'}})
 expect(f.node('a')).toMatchObject({generationTaskId:'child-task',generationChildSessionId:'child-session',generationPartialText:'reading',noteSize:{height:400}});expect(f.node('b').generationPartialText).toBe('')
})
it('keeps the live job identity valid during synchronous editor rendering of its own updates',()=>{
 const f=fixture(),update=f.editor.updateBlock,active:boolean[]=[];f.editor.updateBlock=(id,value)=>{update(id,value);active.push(f.manager.isGenerating(id))}
 f.manager.start('a','Create a');f.manager.progress({sessionId:'notes',requestId:f.calls[0].input.requestId,componentTask:{generationPartialText:'progress'}})
 expect(active).toEqual([true,true])
})
it('stops only the chosen card, ignores its late result and accepts another card result in place',async()=>{
 const f=fixture();f.manager.start('a','Create a');f.manager.start('b','Create b');const a=f.calls[0].input.requestId;expect(f.manager.stop('a')).toMatchObject({ok:true});expect(f.node('a').generationStatus).toBe('interrupted');expect(f.manager.isGenerating('b')).toBe(true)
 expect(f.calls.filter(call=>call.method==='stop').map(call=>call.input.requestId)).toEqual([a]);f.resolve('a',result('late'));f.resolve('b',result('accepted'));await flush()
 expect(f.node('a').containerSpec).toBeUndefined();expect(f.node('b')).toMatchObject({id:'note-component-b',title:'accepted',noteSize:{height:260},noteLibrary:true});expect(f.node('b').noteDraft).toBeUndefined();expect(f.manager.isGenerating('b')).toBe(false)
})
it('keeps a newer user component intact through progress, stop and late completion',async()=>{
 const f=fixture();f.manager.start('a','Create a');const requestId=f.calls[0].input.requestId,newer={id:'note-component-a',title:'newer',containerSpec:{type:'table',columns:['x'],rows:[[2]]}};f.editor.updateBlock('a',{props:{payload:JSON.stringify(newer)}})
 f.manager.progress({sessionId:'notes',requestId,componentTask:{generationPartialText:'stale'}});f.manager.stop('a');f.resolve('a',result('late'));await flush();expect(f.node('a')).toEqual(newer)
})
it('keeps clarification and errors inside their own draft cards',async()=>{
 const f=fixture();f.manager.start('a','Create a');f.manager.start('b','Create b');f.resolve('a',{kind:'conversation',markdown:'请补充数据。'});const request=f.calls.find(call=>call.method==='generate'&&call.input.prompt==='Create b');f.pending.get(request.input.requestId)!.reject(Error('local failure'));await flush()
 expect(f.node('a')).toMatchObject({noteDraft:'smart',generationStatus:'draft',generationDetail:'请补充数据。'});expect(f.node('b')).toMatchObject({generationStatus:'failed',generationError:'local failure'});expect(f.calls.some(call=>['conversation-state','engage'].includes(call.method))).toBe(false)
})
it('persists a verified result before binding it and keeps its latest dimensions',async()=>{
 const f=fixture();let release:()=>void=()=>{};f.save.mockImplementation(()=>new Promise<void>(done=>{release=done}));f.manager.start('a','Create a');f.resolve('a',{...result(),sourceResult:{status:'verified',recipe:{requests:[]}}});await flush()
 expect(f.save).toHaveBeenCalledOnce();expect(f.calls.some(call=>call.method==='component-data')).toBe(false);f.editor.updateBlock('a',{props:{payload:JSON.stringify({...f.node('a'),noteSize:{width:500,height:360}})}});release();await flush()
 expect(f.calls.find(call=>call.method==='component-data')).toMatchObject({input:{action:'bind-generated',nodeId:'note-component-a'}});expect(f.node('a')).toMatchObject({noteDataBound:true,noteSize:{width:500,height:360}})
})
it('times out each job independently and stops all transports on disposal without late writes',async()=>{
 vi.useFakeTimers();const f=fixture();f.manager.start('a','Create a');await vi.advanceTimersByTimeAsync(1000);f.manager.start('b','Create b');await vi.advanceTimersByTimeAsync(239000)
 expect(f.node('a')).toMatchObject({generationStatus:'failed'});expect(f.manager.isGenerating('a')).toBe(false);expect(f.manager.isGenerating('b')).toBe(true)
 const before=f.updates.length;f.manager.dispose();f.resolve('a',result('a'));f.resolve('b',result('b'));await flush();expect(f.updates).toHaveLength(before);expect(f.calls.filter(call=>call.method==='stop')).toHaveLength(2)
})
it('exposes an awaitable receipt only after the real generated component is available',async()=>{
 const module=await import('../src/preload/notes/use-inline-component-generation')
 let complete:any;const blocks:any[]=[{id:'card',props:{payload:JSON.stringify({id:'node',noteDraft:'smart'})}}]
 const editor:any={isEditable:true,getBlock:(id:string)=>blocks.find(b=>b.id===id),updateBlock:(id:string,p:any)=>Object.assign(blocks.find(b=>b.id===id).props,p.props)}
 const controller=module.createInlineComponentGeneration({sessionId:'s',editor,current:()=>true,persist:async()=>{},bridge:{request:async(method:string)=>method==='generate'?new Promise(resolve=>{complete=resolve}):{ok:true}}})
 expect(controller.startAndWait,'awaitable component receipt is missing').toBeTypeOf('function')
 const pending=controller.startAndWait('card','创建表格');let settled=false;void pending.then(()=>{settled=true});await Promise.resolve();expect(settled).toBe(false)
 complete({kind:'component',node:{id:'generated',generationStatus:'completed',containerSpec:{version:1,type:'table',title:'完成',columns:['值'],rows:[[1]]}}})
 expect(await pending).toMatchObject({status:'succeeded',blockId:'card'});expect(JSON.parse(blocks[0].props.payload).containerSpec.rows).toEqual([[1]]);controller.dispose()
})

it('reports generated and durably saved phases before cancellation during data binding',async()=>{
 const f=fixture(),effects:string[]=[]
 const pending=f.manager.startAndWait('a','Create a',undefined,async state=>{effects.push(state);if(state==='saved')f.manager.stop('a')})
 f.resolve('a',{...result(),sourceResult:{status:'verified',recipe:{requests:[]}}})
 expect(await pending).toMatchObject({status:'cancelled',blockId:'a'});expect(effects).toEqual(['applied','saved']);expect(f.save).toHaveBeenCalledOnce();expect(f.node('a').containerSpec).toBeDefined();expect(f.calls.some(call=>call.method==='component-data')).toBe(false)
})
