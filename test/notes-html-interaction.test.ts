import {expect,it} from 'vitest'
import {createNoteHtmlInteraction} from '../src/preload/notes/html-interaction'

const event=(id='event-one',clock=1)=>({id,clock,targetRoute:[0],tag:'BUTTON',type:'click'})
function fixture(){
 const original={id:'component-one',kind:'generated-container',title:'保留组件标题',noteLibrary:true,noteSize:{width:480,height:320},config:{personalChartView:{series:['演示']},sharedComponentState:{version:'other',revision:3,state:{selection:'kept'}}},containerSpec:{version:1,type:'html',title:'合成按钮',html:'<button>合成操作</button>'}}
 let block:any={id:'block-one',type:'research',props:{payload:JSON.stringify(original),textAlignment:'center'}},active=true
 const updates:string[]=[],saved:string[]=[],gates:Array<{promise:Promise<void>;started:()=>void}>=[]
 const editor={isEditable:true,getBlock:(id:string)=>block?.id===id?block:undefined,updateBlock(id:string,value:any){if(!block||id!==block.id)throw Error('Block missing');block={...block,props:{...block.props,...value.props}};updates.push(block.props.payload)}}
 const persist=async()=>{const payload=block?.props.payload,gate=gates.shift();gate?.started();await gate?.promise;saved.push(payload)}
 const controller=createNoteHtmlInteraction({editor,current:()=>active,persist})
 const packet=(entry=event())=>({blockId:'block-one',nodeId:'component-one',html:original.containerSpec.html,version:'v1',event:entry})
 const hold=()=>{let resolve!:()=>void,reject!:(error:Error)=>void,started!:()=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no}),entered=new Promise<void>(yes=>{started=yes});gates.push({promise,started});return {resolve,reject,entered}}
 return {controller,editor,original,updates,saved,packet,hold,payload:()=>block?.props.payload,node:()=>JSON.parse(block.props.payload),edit:(change:(node:any)=>any)=>{block={...block,props:{...block.props,payload:JSON.stringify(change(JSON.parse(block.props.payload)))}}},replaceBlock:(value:any)=>{block=value},remove:()=>{block=undefined},deactivate:()=>{active=false}}
}

it('persists a journal in the exact note block while preserving component config, size and spec',async()=>{
 const f=fixture(),state=await f.controller.commit(f.packet())
 expect(state).toEqual({version:'v1',events:{'event-one':event()}})
 expect(f.node()).toEqual({...f.original,config:{...f.original.config,interactionState:state}})
 expect(f.saved).toEqual([f.payload()]);expect(f.updates).toHaveLength(1)
})

it('never resolves the commit until its persistence promise confirms success',async()=>{
 const f=fixture(),gate=f.hold(),result=f.controller.commit(f.packet());let settled=false
 void result.then(()=>{settled=true})
 await gate.entered;await Promise.resolve()
 expect(settled).toBe(false);expect(f.saved).toEqual([])
 expect(f.node().config.interactionState.events['event-one']).toEqual(event())
 gate.resolve();expect(await result).toMatchObject({events:{'event-one':event()}});expect(f.saved).toHaveLength(1)
})

it('serializes events through persistence and merges the latest payload instead of overwriting earlier events',async()=>{
 const f=fixture(),first=f.hold(),second=f.hold(),a=f.controller.commit(f.packet()),b=f.controller.commit(f.packet(event('event-two',2)))
 await first.entered;expect(f.updates).toHaveLength(1)
 f.edit(node=>({...node,title:'异步保留的新标题'}));first.resolve();await a
 await second.entered;expect(f.updates).toHaveLength(2);expect(f.node().title).toBe('异步保留的新标题')
 expect(Object.keys(f.node().config.interactionState.events)).toEqual(['event-one','event-two'])
 second.resolve();expect(await b).toEqual({version:'v1',events:{'event-one':event(),'event-two':event('event-two',2)}})
})

it('deduplicates a retried event but still waits for a new durable confirmation',async()=>{
 const f=fixture();await f.controller.commit(f.packet())
 const gate=f.hold(),duplicate=f.controller.commit(f.packet());let settled=false;void duplicate.then(()=>{settled=true})
 await gate.entered;await Promise.resolve();expect(settled).toBe(false);expect(f.updates).toHaveLength(1)
 gate.resolve();expect(await duplicate).toEqual({version:'v1',events:{'event-one':event()}});expect(f.saved).toHaveLength(2)
})

it('rejects a conflicting event ID without changing the existing journal',async()=>{
 const f=fixture();await f.controller.commit(f.packet())
 await expect(f.controller.commit(f.packet({...event(),tag:'INPUT'}))).rejects.toThrow()
 expect(f.updates).toHaveLength(1);expect(f.node().config.interactionState.events['event-one']).toEqual(event())
})

it('rolls back its unchanged payload when saving fails and accepts a later retry',async()=>{
 const f=fixture(),before=f.payload(),gate=f.hold(),result=f.controller.commit(f.packet())
 const failure=expect(result).rejects.toThrow('合成磁盘错误')
 await gate.entered;gate.reject(Error('合成磁盘错误'));await failure
 expect(f.payload()).toBe(before)
 expect(await f.controller.commit(f.packet())).toEqual({version:'v1',events:{'event-one':event()}})
})

it('preserves newer edits if persistence fails after this controller wrote its event',async()=>{
 const f=fixture(),gate=f.hold(),result=f.controller.commit(f.packet()),failure=expect(result).rejects.toThrow('合成保存冲突')
 await gate.entered;f.edit(node=>({...node,noteSize:{width:600,height:400},title:'较新标题'}));const newer=f.payload()
 gate.reject(Error('合成保存冲突'));await failure
 expect(f.payload()).toBe(newer);expect(f.updates).toHaveLength(1)
})

it.each(['readonly','session','removed','html','guard','node','block-type'])('rejects %s before touching the editor or persistence',async reason=>{
 const f=fixture();let live=true
 if(reason==='readonly')f.editor.isEditable=false
 if(reason==='session')f.deactivate()
 if(reason==='removed')f.remove()
 if(reason==='html')f.edit(node=>({...node,containerSpec:{...node.containerSpec,html:'<button>替换内容</button>'}}))
 if(reason==='node')f.edit(node=>({...node,id:'different-node'}))
 if(reason==='block-type')f.replaceBlock({id:'block-one',type:'attachment',props:{payload:JSON.stringify(f.original)}})
 if(reason==='guard')live=false
 await expect(f.controller.commit(f.packet(),()=>live)).rejects.toThrow()
 expect(f.updates).toEqual([]);expect(f.saved).toEqual([])
})

it.each(['readonly','session','removed','html','guard','node','event'])('never acknowledges after %s changes while persistence is pending',async reason=>{
 const f=fixture(),gate=f.hold();let live=true
 const result=f.controller.commit(f.packet(),()=>live),failure=expect(result).rejects.toThrow()
 await gate.entered
 if(reason==='readonly')f.editor.isEditable=false
 if(reason==='session')f.deactivate()
 if(reason==='removed')f.remove()
 if(reason==='html')f.edit(node=>({...node,containerSpec:{...node.containerSpec,html:'<button>新HTML</button>'}}))
 if(reason==='node')f.edit(node=>({...node,id:'replacement-node'}))
 if(reason==='guard')live=false
 if(reason==='event')f.edit(node=>({...node,config:{...node.config,interactionState:{version:'v1',events:{}}}}))
 const newer=f.payload();gate.resolve();await failure
 expect(f.saved).toHaveLength(1);expect(f.payload()).toBe(newer)
})

it('rechecks a queued event before applying it after the session closes',async()=>{
 const f=fixture(),gate=f.hold(),first=f.controller.commit(f.packet()),second=f.controller.commit(f.packet(event('event-two',2)))
 const failures=Promise.all([expect(first).rejects.toThrow(),expect(second).rejects.toThrow()])
 await gate.entered;f.deactivate();gate.resolve();await failures
 expect(f.saved).toHaveLength(1);expect(Object.keys(f.node().config.interactionState.events)).toEqual(['event-one']);expect(f.updates).toHaveLength(1)
})

it.each([{version:''},{version:'x'.repeat(81)},{event:{...event(),clock:0}},{event:{...event(),targetRoute:[]}},{event:{...event(),extra:true}}])('rejects invalid journal input %j without updating the note',async invalid=>{
 const f=fixture();await expect(f.controller.commit({...f.packet(),...invalid})).rejects.toThrow()
 expect(f.updates).toEqual([]);expect(f.saved).toEqual([])
})

it('rejects a malformed saved journal rather than silently discarding its data',async()=>{
 const f=fixture();f.edit(node=>({...node,config:{...node.config,interactionState:{version:'v1',events:{bad:{id:'bad'}}}}}))
 const before=f.payload();await expect(f.controller.commit(f.packet())).rejects.toThrow()
 expect(f.payload()).toBe(before);expect(f.updates).toEqual([])
})

it('starts a new journal for a different valid saved version without changing unrelated config',async()=>{
 const f=fixture();f.edit(node=>({...node,config:{...node.config,interactionState:{version:'older',events:{old:event('old')}}}}))
 expect(await f.controller.commit(f.packet())).toEqual({version:'v1',events:{'event-one':event()}})
 expect(f.node().config.personalChartView).toEqual(f.original.config.personalChartView)
})

it('refuses an aggregate journal exceeding the existing event limit without losing prior state',async()=>{
 const f=fixture(),events=Object.fromEntries(Array.from({length:2048},(_,i)=>['entry-'+i,event('entry-'+i,i+1)]))
 f.edit(node=>({...node,config:{...node.config,interactionState:{version:'v1',events}}}));const before=f.payload()
 await expect(f.controller.commit(f.packet())).rejects.toThrow();expect(f.payload()).toBe(before);expect(f.updates).toEqual([])
})

it('captures admitted event data so a queued caller cannot replace it while another save is pending',async()=>{
 const f=fixture(),gate=f.hold(),first=f.controller.commit(f.packet()),input=f.packet(event('event-two',2)),second=f.controller.commit(input)
 await gate.entered;input.event.tag='INPUT';gate.resolve();await first
 expect((await second).events['event-two']).toEqual(event('event-two',2))
})

it.each(['constructor','toString'])('preserves a valid event ID %s that matches an inherited object name',async id=>{
 const f=fixture(),state=await f.controller.commit(f.packet(event(id)))
 expect(Object.hasOwn(state.events,id)).toBe(true);expect(state.events[id]).toEqual(event(id))
})
