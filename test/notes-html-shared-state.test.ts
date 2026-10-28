import {expect,it} from 'vitest'
import {createNoteHtmlInteraction} from '../src/preload/notes/html-interaction'
import {researchInteractionVersion} from '../packages/dsh-research-task-runtime/html-artifact.js'

function fixture(){
 const html='<details><summary>数据</summary><p>10 / 20 / 15</p></details><input aria-label="备注">',version=researchInteractionVersion(html)
 let block:any={id:'chart',type:'research',props:{payload:JSON.stringify({id:'offline-chart',containerSpec:{version:1,type:'html',title:'演示',html},config:{kept:true}})}},active=true,fail=false
 const saved:any[]=[],gates:Array<()=>Promise<void>>=[]
 const editor={isEditable:true,getBlock:(id:string)=>id==='chart'?block:undefined,updateBlock:(_id:string,value:any)=>{block={...block,props:{...block.props,...value.props}}}}
 const controller=createNoteHtmlInteraction({editor,current:()=>active,persist:async()=>{await gates.shift()?.();if(fail)throw Error('磁盘失败');saved.push(JSON.parse(block.props.payload))}})
 const shared=(revision=1,state:any={note:'保留备注',selected:1})=>({blockId:'chart',nodeId:'offline-chart',html,version,sharedState:{revision,state}} as any)
 const journal={blockId:'chart',nodeId:'offline-chart',html,version,event:{id:'open',clock:1,targetRoute:[0],tag:'SUMMARY',type:'click'}}
 const hold=()=>{let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve}),started=new Promise<void>(resolve=>{entered=resolve});gates.push(async()=>{entered();await gate});return{started,release}}
 return{controller,editor,shared,journal,version,saved,hold,node:()=>JSON.parse(block.props.payload),edit:(fn:any)=>{block={...block,props:{payload:JSON.stringify(fn(JSON.parse(block.props.payload)))}}},fail:()=>{fail=true},leave:()=>{active=false}}
}

it('persists semantic Notes state only after its real save and merges native journal operations in one queue',async()=>{
 const f=fixture(),gate=f.hold();let settled=false
 const semantic=f.controller.commit(f.shared()).then(value=>{settled=true;return value}),native=f.controller.commit(f.journal)
 await Promise.race([gate.started,semantic]);expect(settled).toBe(false);expect(f.saved).toEqual([])
 f.edit((node:any)=>({...node,title:'并发人工标题'}));gate.release()
 expect(await semantic).toEqual({version:f.version,revision:1,state:{note:'保留备注',selected:1}})
 await native;expect(f.node().config).toMatchObject({kept:true,sharedComponentState:{revision:1,state:{note:'保留备注',selected:1}},interactionState:{events:{open:{id:'open'}}}})
 expect(f.node().title).toBe('并发人工标题');expect(f.saved).toHaveLength(2)
})

it('rejects stale or conflicting semantic revisions without overwriting a saved newer state',async()=>{
 const f=fixture();await f.controller.commit(f.shared(2))
 await expect(f.controller.commit(f.shared(1,{note:'旧备注'}))).rejects.toThrow()
 await expect(f.controller.commit(f.shared(2,{note:'冒用版本'}))).rejects.toThrow()
 expect(f.node().config.sharedComponentState.state.note).toBe('保留备注');expect(f.saved).toHaveLength(1)
})

it('rolls back only its own unsaved semantic payload and preserves later human edits on save failure',async()=>{
 const f=fixture(),gate=f.hold(),pending=f.controller.commit(f.shared()),failure=pending.catch(error=>error)
 await Promise.race([gate.started,failure.then(error=>{throw error})]);f.edit((node:any)=>({...node,title:'较新编辑'}));f.fail();gate.release();expect(await failure).toMatchObject({message:'磁盘失败'})
 expect(f.node().title).toBe('较新编辑');expect(f.saved).toEqual([])
})

it.each(['readonly','session','html','invalid','version-override'] as const)('rejects invalid or stale Notes shared writes: %s',async kind=>{
 const f=fixture(),packet=f.shared()
 if(kind==='readonly')f.editor.isEditable=false
 if(kind==='session')f.leave()
 if(kind==='html')packet.html='<p>过期网页</p>'
 if(kind==='invalid')packet.sharedState.state={oversized:'x'.repeat(66000)}
 if(kind==='version-override')packet.sharedState.version='forged-version'
 await expect(f.controller.commit(packet)).rejects.toThrow();expect(f.saved).toEqual([])
})

it.each(['readonly','session','html'] as const)('does not ACK a saved semantic write after its owner view becomes stale: %s',async kind=>{
 const f=fixture(),gate=f.hold(),pending=f.controller.commit(f.shared()),failure=pending.catch(error=>error)
 await Promise.race([gate.started,failure.then(error=>{throw error})])
 if(kind==='readonly')f.editor.isEditable=false
 if(kind==='session')f.leave()
 if(kind==='html')f.edit((node:any)=>({...node,containerSpec:{...node.containerSpec,html:'<p>人工替换的新组件</p>'}}))
 gate.release();expect(await failure).toBeInstanceOf(Error);expect(f.saved).toHaveLength(1)
 if(kind==='html')expect(f.node().containerSpec.html).toBe('<p>人工替换的新组件</p>')
 else expect(f.node().config.sharedComponentState.state.note).toBe('保留备注')
})
