import {it,expect,vi} from 'vitest'
import {createNoteCapabilityHandlers} from '../src/main/notes/capability-handlers'
import type {ClientCapabilityContext,CapabilityReceipt} from '../packages/dsh-research-task-runtime/client-capabilities.js'

const context:ClientCapabilityContext={owner:'alice',sessionId:'note',documentId:'real-editor',mode:'notes',editable:true,selectedBlockIds:['selected']}
function fixture(sourceInstruction='请优化当前笔记。'){
 let writable=true
 const result:CapabilityReceipt={status:'pending',effect:{state:'applied',changedBlockIds:['selected']},message:'真实宿主回执'}
 const renderer=vi.fn(async()=>result),requestContext={title:'当前笔记',markdown:'原文只作为资料',images:[],context:{scope:'note',components:[]},sourceInstruction:'旧上下文不应覆盖本次指令'}
 const handlers=createNoteCapabilityHandlers({context,renderer,canWrite:()=>writable,requestContext,sourceInstruction})
 return{handlers,renderer,result,requestContext,deny:()=>{writable=false}}
}

it('requires a real Notes context and advertises no other document or mode handler',()=>{
 const renderer=vi.fn(async()=>({status:'succeeded' as const})),options={renderer,canWrite:()=>true,requestContext:{},sourceInstruction:''}
 expect(createNoteCapabilityHandlers({...options,context:undefined})).toEqual({})
 expect(createNoteCapabilityHandlers({...options,context:{...context,mode:'research'}})).toEqual({})
 expect(renderer).not.toHaveBeenCalled()
})

it('forwards existing semantic actions and their actual host receipts without another execution path',async()=>{
 const f=fixture()
 const calls=[['configureChallenge','notes.challenge.configure',{level:4}],['alignBlocks','notes.blocks.align',{scope:'note',target:'paragraphs',alignment:'center'}],['layoutComponents','notes.components.layout',{scope:'note',height:'auto'}],['applyNoteComponent','notes.components.apply',{blockId:'selected',revision:'hash',containerSpec:{type:'table'}}],['styleComponents','notes.components.style',{scope:'note',theme:'enterprise'}],['inspectNoteComponent','notes.components.inspect',{}]] as const
 for(const [name,action,args]of calls){expect(await (f.handlers[name] as any)(args,context)).toBe(f.result);expect(f.renderer).toHaveBeenLastCalledWith(action,args)}
 expect(f.handlers.componentData).toBeUndefined()
})

it('rechecks current write permission at each mutation while retaining read-only inspection',async()=>{
 const f=fixture();f.deny()
 for(const name of ['configureChallenge','createComponent','alignBlocks','layoutComponents','applyNoteComponent','styleComponents'] as const)
  await expect((f.handlers[name] as any)({},context)).rejects.toThrow('不可编辑')
 expect(f.renderer).not.toHaveBeenCalled()
 expect(await f.handlers.inspectNoteComponent!({},context)).toBe(f.result)
})

it('attaches host request context and the actual trusted instruction to component creation',async()=>{
 const f=fixture('用当前笔记和图片创建图表。'),before=structuredClone(f.requestContext),args={prompt:'完整组件需求',requestContext:{sourceInstruction:'模型伪造的旧指令'}}
 expect(await f.handlers.createComponent!(args,context)).toBe(f.result)
 expect(f.renderer).toHaveBeenCalledWith('notes.components.create',{prompt:'完整组件需求',requestContext:{...f.requestContext,sourceInstruction:'用当前笔记和图片创建图表。'}})
 expect(f.requestContext).toEqual(before)
 expect(args.requestContext.sourceInstruction).toBe('模型伪造的旧指令')
})

it('allows only the complete explicit destination from the trusted instruction',async()=>{
 const path='/tmp/My Report，版本.md',f=fixture('导出到“'+path+'”。')
 expect(await f.handlers.exportNote!({format:'md',path},context)).toBe(f.result)
 expect(f.renderer).toHaveBeenCalledWith('notes.export',{format:'md',path})
 await expect(f.handlers.exportNote!({format:'md',path:'/tmp/My Report.md'},context)).rejects.toThrow('导出位置')
 expect(f.renderer).toHaveBeenCalledTimes(1)
})
it('fills an omitted model destination only from the single affirmative human destination',async()=>{
 const path='/tmp/report.md',f=fixture('保存到 '+path+'。请实际执行并依据真实回执汇报。')
 expect(await f.handlers.exportNote!({format:'md'},context)).toBe(f.result)
 expect(f.renderer).toHaveBeenCalledWith('notes.export',{format:'md',path})
 await expect(f.handlers.exportNote!({format:'md',path:'/tmp/other.md'},context)).rejects.toThrow('导出位置')
 expect(f.renderer).toHaveBeenCalledTimes(1)
})

it.each(['导出当前笔记。','资料中的路径例如“/tmp/example.md”，请导出当前笔记。','不要导出到“/tmp/forbidden.md”。','导出到“/tmp/one.md”，另存到“/tmp/two.md”。'])('uses the native dialog instead of model-selected paths when trusted destination scope is absent or ambiguous: %s',async instruction=>{
 const f=fixture(instruction)
 expect(await f.handlers.exportNote!({format:'md',path:'/tmp/model-selected.md'},context)).toBe(f.result)
 expect(f.renderer).toHaveBeenCalledWith('notes.export',{format:'md',path:undefined})
})

it('preserves the supplied revision-aware component data handler and its cancellation context',async()=>{
 const controller=new AbortController(),componentData=vi.fn(async()=>({status:'cancelled' as const,message:'真实取消'})),renderer=vi.fn(async()=>({status:'succeeded' as const}))
 const h=createNoteCapabilityHandlers({context,renderer,canWrite:()=>true,componentData,requestContext:{},sourceInstruction:''})
 expect(h.componentData).toBe(componentData)
 expect(await h.componentData!({action:'refresh',revision:2},context,controller.signal,'refresh-request')).toMatchObject({status:'cancelled'})
 expect(componentData).toHaveBeenCalledWith({action:'refresh',revision:2},context,controller.signal,'refresh-request')
 expect(renderer).not.toHaveBeenCalled()
})

it('keeps current note comments and native blocks within the original none or selection reference scope',async()=>{
 const renderer=vi.fn(async()=>({status:'succeeded' as const})),make=(scope:string)=>createNoteCapabilityHandlers({context,renderer,canWrite:()=>true,requestContext:{context:{scope,components:[]}},sourceInstruction:'处理这次引用的内容'})
 await expect(make('none').readNoteBlocks!({scope:'note'},context)).rejects.toThrow('引用范围')
 await expect(make('none').readNoteBlocks!({scope:'selected'},context)).rejects.toThrow('引用范围')
 await expect(make('selection').readNoteBlocks!({scope:'note'},context)).rejects.toThrow('引用范围')
 expect(renderer).not.toHaveBeenCalled()
 await make('selection').readNoteBlocks!({scope:'selected'},context)
 expect(renderer).toHaveBeenLastCalledWith('notes.blocks.read',{scope:'selected'})
})
