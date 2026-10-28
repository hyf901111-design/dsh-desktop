import {expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {ResearchTaskRuntime,createSubagentAdapter} from '../packages/dsh-research-task-runtime/index.js'
import {generateNoteComponent} from '../packages/dsh-research-task-runtime/notes-component-generation.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
const captured=JSON.parse(readFileSync(new URL('./fixtures/notes-real-chart-missing-variant.json',import.meta.url),'utf8'))
const prompt='创建一个折线图组件，仅用演示数据10月1日10、10月2日20、10月3日15，不联网、不查行情。'
function context(output){
 const parent={id:'research-contract-parent',session:{events:[]}},children=[]
 const ctx={agents:{get:id=>id===parent.id?parent:undefined},tools:{schemas:()=>[]},on:()=>()=>{},llm:{stream:vi.fn()},apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'fixture',model:'fixture'},routable:true}}})}},subagents:{start:vi.fn(async()=>{
  const id='research-contract-child-'+(children.length+1),child={id,session:{id,events:[]}};children.push(child)
  return{id,localAgent:child,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:typeof output==='string'?output:JSON.stringify(output)}]}),dispose:vi.fn(async()=>{})}
 })}}
 return{ctx,children}
}
async function research(output,request=prompt,hostContext){
 const f=context(output);let finish
 const done=new Promise(resolve=>{finish=resolve}),runtime=new ResearchTaskRuntime({retryDelayMs:0,createId:()=> 'research-contract-task',adapter:createSubagentAdapter(f.ctx),storage:{load:async()=>undefined,save:async document=>{const task=document.tasks.find(t=>t.taskId==='research-contract-task');if(task&&['completed','failed','cancelled','interrupted'].includes(task.state))finish(task)}}})
 try{await runtime.start({parentSessionId:'research-contract-parent',canvasNodeId:'research-contract-node',kind:'container',prompt:request},hostContext);return{...f,result:await done}}finally{await runtime.dispose()}
}
const data=result=>readTemplateModel(JSON.parse(result.finalOutput))?.data??JSON.parse(result.finalOutput)
it.each([0,1])('accepts actual captured missing-variant final %i through the real Research runtime in one original child',async index=>{
 const raw=captured[index],before=JSON.stringify(raw),f=await research(raw)
 expect(f.result.state).toBe('completed');expect(data(f.result)).toEqual({...raw,variant:'line'});expect(JSON.stringify(raw)).toBe(before)
 expect(f.children).toHaveLength(1);expect(f.ctx.subagents.start).toHaveBeenCalledOnce();expect(f.ctx.llm.stream).not.toHaveBeenCalled()
 const sent=f.ctx.subagents.start.mock.calls[0][1].prompt.map(part=>part.text??'').join('\n');expect(sent).toContain('"variant":"line"')
 const notes=context(raw),note=await generateNoteComponent(notes.ctx,{sessionId:'research-contract-parent',prompt,sourceInstruction:prompt,references:{scope:'none',components:[]}})
 expect(readTemplateModel(note.node.containerSpec)?.data??note.node.containerSpec).toEqual(data(f.result));expect(notes.children).toHaveLength(1)
})
it.each(['line','bar'])('does not replace an already explicit valid %s variant',async variant=>{
 const raw={...captured[0],variant},f=await research(raw);expect(f.result.state).toBe('completed');expect(data(f.result)).toEqual(raw);expect(f.children).toHaveLength(1)
})
it.each([null,'','not-registered'])('does not fill an explicitly present invalid variant %s',async variant=>{
 const raw={...captured[0],variant},f=await research(raw);expect(f.result.state).toBe('failed');expect(f.result.finalOutput).toBeUndefined();expect(f.children).toHaveLength(2);expect(raw.variant).toBe(variant)
})
it.each([{unit:''},{extra:1},{labels:[]},{series:[{name:'演示',values:[10,20]}]},{series:[{name:'演示',values:['10',20,15]}]}])('retains the original schema failure for %j instead of repairing other fields',async invalid=>{
 const raw={...captured[0],...invalid},before=JSON.stringify(raw),f=await research(raw);expect(f.result.state).toBe('failed');expect(f.result.finalOutput).toBeUndefined();expect(f.children).toHaveLength(2);expect(JSON.stringify(raw)).toBe(before)
})
it('does not choose a variant when the host schema allows multiple chart variants',async()=>{
 const f=await research(captured[0],'创建一个原生图表组件，仅使用明确演示分类A、B、C的数据，不联网。');expect(f.result.state).toBe('failed');expect(f.result.finalOutput).toBeUndefined();expect(f.children).toHaveLength(2)
})
it('does not choose between multiple raw chart objects',async()=>{
 const f=await research(JSON.stringify(captured[0])+'\n'+JSON.stringify(captured[1]));expect(f.result.state).toBe('failed');expect(f.children).toHaveLength(2)
})
it('keeps the actual required-source evidence gate after supplying only the discriminator',async()=>{
 const f=await research(captured[0],prompt,{sourceRequirement:prompt,sourcePolicy:{pluginRequired:true,pluginProhibited:false,preferenceRequest:'该组件指定通联 DataYes 来源'}})
 expect(f.result.state).toBe('failed');expect(f.result.error).toContain('必须实际取得业务响应');expect(f.result.finalOutput).toBeUndefined();expect(f.children.length).toBeLessThanOrEqual(2)
})

it('does not reinterpret a required custom HTML component as a chart contract',async()=>{
 const f=await research(captured[0],'创建一个自包含离线 HTML 折线图组件，并提供备注输入，不查询外部数据。');expect(f.result.state).toBe('failed');expect(f.result.finalOutput).toBeUndefined();expect(f.children).toHaveLength(2)
})
