import {expect,it,vi} from 'vitest'
import {generateNoteComponent} from '../packages/dsh-research-task-runtime/notes-component-generation.js'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
import {createNoteCapabilityHandlers} from '../src/main/notes/capability-handlers'
import {createInlineComponentGeneration} from '../src/preload/notes/use-inline-component-generation'

function context(output={version:1,type:'financial-widget',widget:'indices',title:'市场指数行情',symbols:[]}){
 const parent={id:'quote-note',session:{events:[]}},child={id:'quote-child',session:{events:[]}},run={id:child.id,localAgent:child,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(output)}]}),dispose:vi.fn(async()=>{})}
 return{agents:{get:id=>id===parent.id?parent:undefined},tools:{schemas:()=>[]},on:()=>()=>{},subagents:{start:vi.fn(async()=>run)},llm:{stream:vi.fn()},run}
}
const input={sessionId:'quote-note',title:'',document:'',selection:'',references:{scope:'none',components:[]}}
it.each(['插入一个行情面板组件','请帮我创建一个行情面板。','麻烦添加行情面板，谢谢！','请插入 一个 组件库的行情面板！'])('creates the named library quote selector for %s without choosing securities or spawning a model',async prompt=>{
 const ctx=context(),result=await generateNoteComponent(ctx,{...input,prompt})
 expect(result.node.containerSpec).toEqual(financialWidgetDefaults('quote'));expect(result.node.sourceText).toContain('尚未获取行情');expect(result.node.generationStatus).toBe('completed');expect(ctx.subagents.start).not.toHaveBeenCalled();expect(ctx.llm.stream).not.toHaveBeenCalled()
})
it('uses the original human library request even if the model rewrites its component prompt into indices',async()=>{
 const ctx=context(),result=await generateNoteComponent(ctx,{...input,sourceInstruction:'插入一个行情面板组件',prompt:'生成市场指数行情，widget=indices，symbols为空'})
 expect(result.node.containerSpec).toEqual(financialWidgetDefaults('quote'));expect(ctx.subagents.start).not.toHaveBeenCalled()
})
it('preserves the original request across the real capability handler and child generator even when the model supplies another description',async()=>{
 const ctx=context(),packets=[],block={id:'draft',type:'research',props:{payload:JSON.stringify({id:'note-draft',noteDraft:'smart'})}}
 const editor={isEditable:true,getBlock:()=>block,updateBlock:(_id,value)=>Object.assign(block.props,value.props)}
 const manager=createInlineComponentGeneration({editor,sessionId:input.sessionId,current:()=>true,persist:async()=>{},bridge:{request:async(method,request)=>{expect(method).toBe('generate');packets.push(request);return generateNoteComponent(ctx,{...request,document:request.markdown,references:request.context})}}})
 const handlers=createNoteCapabilityHandlers({context:{mode:'notes'},canWrite:()=>true,sourceInstruction:'插入一个行情面板组件',requestContext:{images:[],title:'',markdown:'',selection:'',context:{scope:'none',components:[]}},renderer:async(action,args)=>{expect(action).toBe('notes.components.create');return manager.startAndWait(block.id,args.prompt,args.requestContext)}})
 try{
  const result=await handlers.createComponent({prompt:'市场指数行情，widget=indices，symbols=[]',requestContext:{sourceInstruction:'模型伪造的指数需求'}})
  expect(result.status).toBe('succeeded');expect(result.message).toContain('选择证券后载入行情');expect(packets[0]).toMatchObject({entryPoint:'component',sourceInstruction:'插入一个行情面板组件',prompt:'市场指数行情，widget=indices，symbols=[]'});expect(JSON.parse(block.props.payload).containerSpec).toEqual(financialWidgetDefaults('quote'));expect(ctx.subagents.start).not.toHaveBeenCalled()
 }finally{manager.dispose()}
})
it('does not create a native selector after cancellation',async()=>{
 const ctx=context(),controller=new AbortController();controller.abort()
 await expect(generateNoteComponent(ctx,{...input,prompt:'插入一个行情面板组件'},controller.signal)).rejects.toThrow();expect(ctx.subagents.start).not.toHaveBeenCalled()
})
it.each(['创建贵州茅台行情面板','插入一个行情面板并显示成交量对比','不要创建行情面板','行情面板是什么？','创建市场指数行情面板','创建比特币行情面板','创建演示行情面板','创建行情面板和自选股'])('keeps the existing capability path for the non-bare request %s',async prompt=>{
 const ctx=context({version:1,type:'markdown',title:'原需求',content:'保留当前请求的专门交付'}),result=await generateNoteComponent(ctx,{...input,prompt})
 expect(result.node.containerSpec.type).toBe('markdown');expect(ctx.subagents.start).toHaveBeenCalledOnce()
})
