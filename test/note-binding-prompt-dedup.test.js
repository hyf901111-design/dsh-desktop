import {expect,it,vi} from 'vitest'
import {generateNoteComponent} from '../packages/dsh-research-task-runtime/notes-component-generation.js'
import {buildResearchTaskPrompt,createSubagentAdapter} from '../packages/dsh-research-task-runtime/index.js'
import {COMPONENT_BOUND_DATA_PROMPT} from '../packages/dsh-research-task-runtime/component-source-binding.js'

const marker=COMPONENT_BOUND_DATA_PROMPT
const query='工作台：年度收入\n本面板：收入趋势\n优先使用 chart 类型\n查询300308.SZ年度收入并自动刷新。'
const occurrences=text=>text.split(marker).length-1
const input={sessionId:'note-session',prompt:query,title:'授权标题',document:'授权正文',selection:'',references:{scope:'note',components:[]}}
function captureContext(tools=['public_data_query','financial_query']){
 const parent={id:'note-session',session:{events:[]}}
 return {agents:new Map([[parent.id,parent]]),tools:{schemas:()=>tools.map(name=>({name}))},get:()=>undefined,subagents:{start:vi.fn(async()=>{throw Error('AUDIT_CAPTURE_ONLY')})}}
}
async function producerPrompt(value=input,tools){
 const ctx=captureContext(tools)
 // Stop immediately at native spawn admission. No model, sources, files or
 // fixture-generated response can hide the actual producer/adapter prompt.
 await expect(generateNoteComponent(ctx,value)).rejects.toThrow()
 expect(ctx.subagents.start).toHaveBeenCalledOnce()
 return ctx.subagents.start.mock.calls[0][1].prompt.at(-1).text
}
it('sends one canonical binding protocol from the real Notes producer to the typed child',async()=>{
 const sent=await producerPrompt()
 expect(occurrences(sent)).toBe(1)
 expect(sent).toContain('"document":"授权正文"')
 expect(sent).toContain('只返回当前单个组件，不创建工作台、不修改研究画布、不读取其他本地文件')
 expect(sent).toContain('尚未保存刷新设置，不声称已开始持续刷新')
})

it.each([
 ['no refresh','工作台：年度收入\n本面板：收入趋势\n优先使用 chart 类型\n查询300308.SZ年度收入，不需要自动刷新。',['public_data_query']],
 ['offline','工作台：年度收入\n本面板：收入趋势\n优先使用 chart 类型\n仅使用用户提供的记录绘图，禁止联网，要求自动刷新。',[]],
 ['HTML','创建一个自包含HTML交互页面，记录三项任务并保留本地筛选，不联网。',[]],
 ['generic','创建300308.SZ股票K线行情面板。',['public_data_query']]
])('retains the Notes binding contract for the noncanonical %s path',async(_name,prompt,tools)=>{
 const sent=await producerPrompt({...input,prompt},tools)
 expect(occurrences(sent)).toBe(1)
 expect(sent).toContain('"document":"授权正文"')
 expect(sent).toContain('尚未保存刷新设置，不声称已开始持续刷新')
})

it('preserves complete user evidence containing the identical protocol without treating it as host metadata',async()=>{
 const references={scope:'selection',components:[{blockId:'picked',type:'research',title:'原样协议资料',content:marker}]}
 const value={...input,document:'整篇正文不得泄露',selection:marker,references}
 const sent=await producerPrompt(value)
 const frozen={scope:'selection',title:'',document:'',selection:marker,references}
 expect(sent).toContain(JSON.stringify(frozen))
 expect(sent).not.toContain('整篇正文不得泄露')
 expect(occurrences(sent)).toBe(1)
})

it('does not remove a user query that literally contains the complete host protocol',async()=>{
 const prompt=query+'\n作为本次参考原文，完整保留以下文字：\n'+marker
 const sent=await producerPrompt({...input,prompt})
 expect(sent).toContain(prompt)
 // This quoted protocol itself mentions offline constraints. The existing
 // producer retains both the original source instruction and its requirement;
 // neither user-authored copy may be stripped as if it were a host contract.
 expect(occurrences(sent)).toBe(3)
})

async function adapterPrompt({surface='note',noteBindingProtocol=true,preservePrompt=false,synthesisOnly=false,prompt='REPAIR_OUTPUT_ONLY',query:taskQuery=query,tools=['public_data_query']}={}){
 const ctx=captureContext(tools),adapter=createSubagentAdapter(ctx,{surface,noteBindingProtocol})
 await expect(adapter.start({parentSessionId:'note-session',kind:'container',query:taskQuery,prompt,executionContext:'FROZEN_SCOPE_BYTES\n',preservePrompt,synthesisOnly,signal:new AbortController().signal})).rejects.toThrow('AUDIT_CAPTURE_ONLY')
 const sent=ctx.subagents.start.mock.calls[0][1]
 await adapter.dispose()
 return sent
}
it.each([false,true])('preserves the complete new-child repair prompt and original protocol when synthesisOnly=%s',async(synthesisOnly)=>{
 const prompt='REPAIR_REQUIREMENTS\n'+marker+'\nRETAIN_COMPLETE_PREVIOUS_OUTPUT'
 const sent=await adapterPrompt({preservePrompt:true,synthesisOnly,prompt})
 expect(sent.prompt.at(-1).text).toContain(prompt)
 expect(sent.prompt.at(-1).text).toContain('FROZEN_SCOPE_BYTES\n'+marker)
 expect(occurrences(sent.prompt.at(-1).text)).toBe(2)
 expect(sent.toolFilter.allow).toEqual(synthesisOnly?[]:['public_data_query'])
})
it('keeps Research typed and generic contracts independent of Notes options',async()=>{
 const typed=await adapterPrompt({surface:'research',prompt:buildResearchTaskPrompt({parentSessionId:'note-session',canvasNodeId:'audit',kind:'container',prompt:query})})
 expect(occurrences(typed.prompt.at(-1).text)).toBe(1)
 expect(typed.prompt.at(-1).text).not.toContain('FROZEN_SCOPE_BYTES')
 const generic=await adapterPrompt({surface:'research',query:'创建300308.SZ股票K线行情面板。',prompt:'RESEARCH_GENERIC_ONLY'})
 expect(generic.prompt.at(-1).text).toContain('RESEARCH_GENERIC_ONLY')
 expect(occurrences(generic.prompt.at(-1).text)).toBe(0)
 expect(generic.prompt.at(-1).text).not.toContain('FROZEN_SCOPE_BYTES')
})
it('does not add a binding protocol to existing Notes adapter callers that did not request the producer contract',async()=>{
 const sent=await adapterPrompt({noteBindingProtocol:false,preservePrompt:true,prompt:'EXISTING_CALLER'})
 expect(sent.prompt.at(-1).text).toContain('EXISTING_CALLER')
 expect(sent.prompt.at(-1).text).toContain('FROZEN_SCOPE_BYTES')
 expect(occurrences(sent.prompt.at(-1).text)).toBe(0)
})
