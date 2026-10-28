import {expect,it,vi} from 'vitest'
import {Session} from '@deepseek-ai/dsh-session'
import {generateNoteSuggestion} from '../packages/dsh-research-task-runtime/notes-ai.js'

const input={sessionId:'note-output',requestId:'ordinary-writing',entryPoint:'inline',insertionAnchor:{documentId:'doc',blockId:'blank',position:{}},clientContext:{documentId:'doc'},title:'',markdown:'',selection:'',prompt:'写一段文字',mode:'write'}
function context(outputs,finish='stop'){
 const calls=[],session=Session.create(input.sessionId)
 const ctx={sessions:{get:()=>session},sessionTitle:{rename:(s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}}},apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'selected-provider',model:'selected-model'},routable:true}}})}},llm:{stream:vi.fn(async function*(options){const index=calls.push(options)-1,value=outputs[Math.min(index,outputs.length-1)];if(typeof value==='function'){yield* value(options);return}yield{type:'text-delta',text:value};yield{type:'finish',reason:{kind:finish}}})}}
 return{ctx,calls,session}
}
// Explicit real-operation fixtures echo the host transport marker. Example and recovery fixtures do not.
function operation(value){return async function*(options){yield{type:'text-delta',text:JSON.stringify({...value,wireToken:/wireToken=([a-f0-9-]+)/.exec(options.system)[1]})};yield{type:'finish',reason:{kind:'stop'}}}}
const receipt={requestId:'chart-created',capability:'notes.components.create',status:'succeeded',message:'已创建图表',effect:{type:'document',documentId:'doc'}}
it.each(['这是一段完整的文字，先记录想法，再把想法变成行动。','# 观察\n\n保留**原始资料**。\n\n- 第一项\n- 第二项'])('inserts a normally stopped public text/Markdown response without asking the user to change their request',async text=>{
 const {ctx,calls}=context([text]);expect(await generateNoteSuggestion(ctx,input)).toMatchObject({kind:'text',markdown:text});expect(calls).toHaveLength(1)
})
it.each(['text','content'])('normalizes the unambiguous %s field without rewriting its content',async field=>{
 const {ctx,calls}=context([JSON.stringify({kind:'text',[field]:'保留金额0、-20以及来源未提供。'})]);expect(await generateNoteSuggestion(ctx,input)).toMatchObject({kind:'text',markdown:'保留金额0、-20以及来源未提供。'});expect(calls).toHaveLength(1)
})
it('retains JSON code examples as Markdown rather than mistaking inner objects for a note envelope',async()=>{
 const fence=String.fromCharCode(96).repeat(3),text='接口示例：\n\n'+fence+'json\n{"name":"甲","value":0}\n'+fence
 const {ctx}=context([text]);expect(await generateNoteSuggestion(ctx,input)).toMatchObject({kind:'text',markdown:text})
})
it('preserves a Markdown code example even when the JSON matches the private note envelope',async()=>{
 const fence=String.fromCharCode(96).repeat(3),text='JSON接口示例：\n\n'+fence+'json\n{"kind":"text","markdown":"示例字段"}\n'+fence
 const {ctx,calls}=context([text]);expect(await generateNoteSuggestion(ctx,input)).toMatchObject({kind:'text',markdown:text});expect(calls).toHaveLength(1)
})
it('keeps an ordinary complete JSON document that is not a private envelope',async()=>{
 const text='{"name":"甲","value":0,"items":[1,2]}',{ctx,calls}=context([text])
 expect(await generateNoteSuggestion(ctx,input)).toMatchObject({kind:'text',markdown:text});expect(calls).toHaveLength(1)
})
it('recovers an unknown envelope once with the selected model and no client tools or replayed writes',async()=>{
 const raw='{"kind":"document","body":"用户真正需要的段落"}',{ctx,calls}=context([raw,'{"kind":"text","markdown":"用户真正需要的段落"}'])
 expect(await generateNoteSuggestion(ctx,input)).toMatchObject({kind:'text',markdown:'用户真正需要的段落'});expect(calls).toHaveLength(2)
 expect(calls[1]).toMatchObject({provider:'selected-provider',model:'selected-model'});expect(calls[1].tools).toBeUndefined();expect(calls[1].system).toContain('格式')
 expect(JSON.parse(calls[1].messages[1].content[0].text).publicOutput).toBe(raw);expect(JSON.stringify(calls[1].messages)).toContain('写一段文字')
})
it('does not silently discard an earlier piece of mixed document output',async()=>{
 const {ctx,calls}=context(['{"kind":"text","markdown":"上段"}\n{"kind":"text","markdown":"下段"}','{"kind":"text","markdown":"上段\\n\\n下段"}'])
 expect(await generateNoteSuggestion(ctx,input)).toMatchObject({kind:'text',markdown:'上段\n\n下段'});expect(calls).toHaveLength(2)
})
it('keeps an explicitly typed new paragraph after a component has already been saved',async()=>{
 const {ctx,calls}=context(['{"kind":"text","markdown":"图表说明：先增长，再回落。"}'])
 expect(await generateNoteSuggestion(ctx,{...input,clientReceipts:[receipt]})).toMatchObject({kind:'text',markdown:'图表说明：先增长，再回落。',capabilityReceipts:[receipt]});expect(calls).toHaveLength(1)
})
it('asks recovery to identify remaining prose after saved effects rather than dropping all public final text',async()=>{
 const {ctx,calls}=context(['图表已经保存。\n\n观察：数据先增长，再回落。','{"kind":"text","markdown":"观察：数据先增长，再回落。"}'])
 expect(await generateNoteSuggestion(ctx,{...input,clientReceipts:[receipt]})).toMatchObject({kind:'text',markdown:'观察：数据先增长，再回落。',capabilityReceipts:[receipt]});expect(calls).toHaveLength(2)
 expect(JSON.stringify(calls[1].messages)).toContain('chart-created')
})
it('uses confirmed receipts for an operation-only explanation without inserting it as document prose',async()=>{
 const {ctx,calls}=context(['已创建图表，保留其它原文。','{"kind":"conversation","markdown":""}'])
 const result=await generateNoteSuggestion(ctx,{...input,clientReceipts:[receipt]});expect(result).toMatchObject({kind:'conversation',capabilityReceipts:[receipt]});expect(result.markdown).toContain('已创建图表');expect(calls).toHaveLength(2)
})
it('retains a new answer after a read-only query receipt',async()=>{
 const read={requestId:'observed-table',capability:'notes.components.inspect',status:'succeeded',data:{value:123}},{ctx,calls}=context(['查询结果为123。','{"kind":"text","markdown":"当前记录的值为123。"}'])
 expect(await generateNoteSuggestion(ctx,{...input,clientReceipts:[read]})).toMatchObject({kind:'text',markdown:'当前记录的值为123。'});expect(calls).toHaveLength(2)
})
it('never promotes invalid structured components or recovery tool requests into plain document text',async()=>{
 const {ctx,calls}=context(['{"kind":"component","artifact":{"type":"unknown"}}','{"kind":"capabilities","calls":[{"requestId":"new-write","capability":"notes.components.create","arguments":{"prompt":"未知写入"}}]}'])
 await expect(generateNoteSuggestion(ctx,input)).rejects.toThrow();expect(calls).toHaveLength(2)
})
it('honors cancellation during the single formatting recovery',async()=>{
 const controller=new AbortController(),{ctx,calls}=context(['{"kind":"unknown"}',async function*(options){controller.abort();options.signal.throwIfAborted()}])
 await expect(generateNoteSuggestion(ctx,input,controller.signal)).rejects.toThrow();expect(calls).toHaveLength(2)
})
it('never accepts a truncated public response as a complete document',async()=>{
 const {ctx,calls}=context(['文字未结束'],'max-tokens');await expect(generateNoteSuggestion(ctx,input)).rejects.toThrow();expect(calls).toHaveLength(1)
})
it('records bounded public final and finish diagnostics on a real format failure without hidden reasoning',async()=>{
 const {ctx,session}=context(['{"kind":"unknown","body":"公开输出"}'])
 await expect(generateNoteSuggestion(ctx,input)).rejects.toThrow()
 const failure=session.events.filter(row=>row.type==='workspace-note/conversation'&&row.data.phase==='failed').at(-1)
 expect(failure.data.diagnostic).toMatchObject({finish:'stop',publicText:'{"kind":"unknown","body":"公开输出"}'});expect(failure.data).not.toHaveProperty('reasoning')
 expect(failure.data.error).not.toContain('调整需求')
})
it.each(['[查看资料](https://example.com)\n\n正文说明。','[x] 记录已核对的项目。','{"id":"A","text":"说明","amount":0,"source":"资料A"}'])('preserves complete business JSON and square-bracket Markdown without losing fields: %s',async text=>{
 const {ctx,calls}=context([text]);expect(await generateNoteSuggestion(ctx,input)).toMatchObject({kind:'text',markdown:text});expect(calls).toHaveLength(1)
})
it.each(['写一段文字','给出JSON字段示例'])('disambiguates a whole JSON fence using the original intent: %s',async prompt=>{
 const fence=String.fromCharCode(96).repeat(3),wrapped=fence+'json\n{"kind":"text","markdown":"正文字段示例"}\n'+fence,markdown=prompt==='写一段文字'?'正文字段示例':wrapped
 const {ctx,calls}=context([wrapped,JSON.stringify({kind:'text',markdown})]);expect(await generateNoteSuggestion(ctx,{...input,prompt})).toMatchObject({kind:'text',markdown});expect(calls).toHaveLength(2)
})
it('cannot create or replace a component during a text-only formatting recovery, even after a real saved effect',async()=>{
 const component={kind:'component',targetBlockId:'different',artifact:{version:1,type:'table',title:'不得重复写入',columns:['值'],rows:[[2]]}},{ctx}=context(['{"kind":"unknown"}',JSON.stringify(component)])
 await expect(generateNoteSuggestion(ctx,{...input,clientReceipts:[receipt]})).rejects.toThrow()
})
it('cannot redirect a component recovery to another selected block or change its business values',async()=>{
 const initial={kind:'component',targetBlockId:'selected',artifact:{version:1,type:'table',title:'缺字段',rows:[[0]]}},other={kind:'component',targetBlockId:'other',artifact:{version:1,type:'table',title:'其它目标',columns:['值'],rows:[[999]]}},{ctx}=context([operation(initial),JSON.stringify(other)])
 await expect(generateNoteSuggestion(ctx,{...input,context:{scope:'selection',components:[{blockId:'selected',type:'research',title:'已选',content:'0'},{blockId:'other',type:'research',title:'另一个',content:'999'}]}})).rejects.toThrow()
})
it('keeps multiple component effects exactly once and then inserts the genuinely remaining paragraph through the real capability loop',async()=>{
 const {runClientCapabilityLoop}=await import('../packages/dsh-research-task-runtime/client-capability-loop.js')
 const calls=[{requestId:'first-chart',capability:'notes.components.create',arguments:{prompt:'演示图表一'}},{requestId:'second-chart',capability:'notes.components.create',arguments:{prompt:'演示图表二'}}],writes=[],{ctx}=context([operation({kind:'capabilities',calls}),'两张图表已保存。\n\n结论：先增长，再回落。','{"kind":"text","markdown":"结论：先增长，再回落。"}'])
 const result=await runClientCapabilityLoop({preserveRemainingReply:true,generate:receipts=>generateNoteSuggestion(ctx,{...input,prompt:'写结论并创建两张演示图表',clientCapabilities:[{id:'notes.components.create',available:true}],clientReceipts:receipts}),execute:async call=>{writes.push(call.requestId);return{...receipt,requestId:call.requestId}}})
 expect(writes).toEqual(['first-chart','second-chart']);expect(result).toMatchObject({kind:'text',markdown:'结论：先增长，再回落。'});expect(result.capabilityReceipts).toHaveLength(2)
})
it('preserves a classified necessary reply after saved effects through the actual Notes loop',async()=>{
 const {runClientCapabilityLoop}=await import('../packages/dsh-research-task-runtime/client-capability-loop.js'),writes=[],{ctx}=context([operation({kind:'capabilities',calls:[{requestId:'chart-created',capability:'notes.components.create',arguments:{prompt:'创建演示图表'}}]}),'{"kind":"conversation","markdown":"请给出开始日期。"}','{"kind":"conversation","markdown":"请给出开始日期。","replyRole":"remaining"}'])
 const result=await runClientCapabilityLoop({preserveRemainingReply:true,generate:receipts=>generateNoteSuggestion(ctx,{...input,entryPoint:undefined,clientCapabilities:[{id:'notes.components.create',available:true}],clientReceipts:receipts}),execute:async call=>{writes.push(call.requestId);return receipt}})
 expect(result).toMatchObject({kind:'conversation',requiresReply:true});expect(result.markdown).toContain('请给出开始日期');expect(writes).toEqual(['chart-created'])
})
it('keeps other hosts authoritative completion behavior when Notes remaining-reply preservation is not enabled',async()=>{
 const {runClientCapabilityLoop}=await import('../packages/dsh-research-task-runtime/client-capability-loop.js');let generated=0
 const result=await runClientCapabilityLoop({generate:async()=>++generated===1?{kind:'capabilities',calls:[{requestId:'one'}]}:{kind:'conversation',markdown:'无回执的完成宣告',requiresReply:true},execute:async()=>receipt})
 expect(result.markdown).toContain('已创建图表');expect(result.markdown).not.toContain('无回执');expect(result).not.toHaveProperty('requiresReply')
})
it.each([{kind:'text',text:'客户原文',amount:128,source:'原始台账'},{text:'用户要求的单字段JSON'},[{requestId:'example-call',capability:'notes.components.create',arguments:{prompt:'图表'}}]])('disambiguates JSON business fields and host-call examples without discarding fields or executing examples (%#)',async data=>{
 const raw=JSON.stringify(data),{ctx,calls}=context([raw,JSON.stringify({kind:'text',markdown:raw})]);expect(await generateNoteSuggestion(ctx,{...input,prompt:'给出完整JSON代码示例，保留所有字段'})).toMatchObject({kind:'text',markdown:raw});expect(calls).toHaveLength(2)
})
it('fulfills broad inline writing after an old-style clarification instead of returning the question to the input box',async()=>{
 const {ctx}=context(['{"kind":"conversation","markdown":"你希望写什么主题？"}','{"kind":"text","markdown":"把眼前的观察记录下来，为明天留下一条清晰的线索。"}'])
 const result=await generateNoteSuggestion(ctx,input);expect(result).toMatchObject({kind:'text',markdown:'把眼前的观察记录下来，为明天留下一条清晰的线索。'});expect(result.markdown).not.toContain('主题')
})
it.each([{kind:'text',markdown:'业务字段值'},{kind:'component',artifact:{version:1,type:'table',title:'JSON示例',columns:['值'],rows:[[0]]}}])('treats a whole private-shaped JSON example as user content after original-intent recovery (%#)',async data=>{
 const raw=JSON.stringify(data),{ctx,calls}=context([raw,JSON.stringify({kind:'text',markdown:raw})]);expect(await generateNoteSuggestion(ctx,{...input,prompt:'给出JSON代码示例，保留全部字段，不生成真实组件'})).toMatchObject({kind:'text',markdown:raw});expect(calls).toHaveLength(2)
})

it.each([{kind:'capabilities',calls:[{requestId:'example-call',capability:'notes.components.create',arguments:{prompt:'演示图表'}}]},{kind:'conversation',markdown:'示例中的对话字段'}])('keeps an explicitly non-executing private-shaped code example as complete content (%#)',async data=>{
 const raw=JSON.stringify(data),{ctx,calls}=context([raw,JSON.stringify({kind:'text',markdown:raw})]);expect(await generateNoteSuggestion(ctx,{...input,prompt:'给出JSON代码示例，展示如何创建组件，只展示，不执行',clientCapabilities:[{id:'notes.components.create',available:true}]})).toMatchObject({kind:'text',markdown:raw});expect(calls).toHaveLength(2)
})
it('does not disable explicitly requested real component creation when JSON examples are also requested',async()=>{
 const calls=[{requestId:'real-chart',capability:'notes.components.create',arguments:{prompt:'创建真实演示图表'}}],f=context([async function*(options){const wireToken=/wireToken=([a-f0-9-]+)/.exec(options.system)[1];yield{type:'text-delta',text:JSON.stringify({kind:'capabilities',calls,wireToken})};yield{type:'finish',reason:{kind:'stop'}}}]);expect(await generateNoteSuggestion(f.ctx,{...input,prompt:'先创建真实图表，再给JSON示例',clientCapabilities:[{id:'notes.components.create',available:true}]})).toEqual({kind:'capabilities',calls});expect(f.calls).toHaveLength(1)
})

it('does not execute a whole capabilities-shaped JSON example even without an explicit negative command',async()=>{
 const data={kind:'capabilities',calls:[{requestId:'only-example',capability:'notes.components.create',arguments:{prompt:'示例图表'}}]},raw=JSON.stringify(data),f=context([raw,JSON.stringify({kind:'text',markdown:raw})]);expect(await generateNoteSuggestion(f.ctx,{...input,prompt:'给出JSON代码示例',clientCapabilities:[{id:'notes.components.create',available:true}]})).toMatchObject({kind:'text',markdown:raw});expect(f.calls).toHaveLength(2)
})
it.each([{kind:'component',artifact:{version:1,type:'table',title:'字段示例',columns:['值'],rows:[[0]]},amount:128,source:'原始台账'},{kind:'capabilities',calls:[],customer:'甲'}])('preserves business fields on other private-shaped objects through recovery (%#)',async data=>{
 const raw=JSON.stringify(data),f=context([raw,JSON.stringify({kind:'text',markdown:raw})]);expect(await generateNoteSuggestion(f.ctx,{...input,prompt:'保留原始资料所有字段'})).toMatchObject({kind:'text',markdown:raw});expect(f.calls).toHaveLength(2)
})

it('turns a read-only receipt with an empty final into useful inline body instead of claiming it has already been written',async()=>{
 const read={requestId:'read-table',capability:'notes.components.inspect',status:'succeeded',data:{rows:[['值',123]]}},f=context(['{"kind":"conversation","markdown":""}','{"kind":"text","markdown":"表格中记录的值为123。"}']);expect(await generateNoteSuggestion(f.ctx,{...input,clientReceipts:[read]})).toMatchObject({kind:'text',markdown:'表格中记录的值为123。'});expect(f.calls).toHaveLength(2)
})

it('accepts a whole fenced real operation only with its current host transport marker, without executing a displayed fence',async()=>{
 const calls=[{requestId:'fenced-real',capability:'notes.components.create',arguments:{prompt:'真实演示图表'}}],f=context([async function*(options){const wireToken=/wireToken=([a-f0-9-]+)/.exec(options.system)[1];yield{type:'text-delta',text:'```json\n'+JSON.stringify({kind:'capabilities',calls,wireToken})+'\n```'};yield{type:'finish',reason:{kind:'stop'}}}]);expect(await generateNoteSuggestion(f.ctx,{...input,prompt:'创建真实图表',clientCapabilities:[{id:'notes.components.create',available:true}]})).toEqual({kind:'capabilities',calls});expect(f.calls).toHaveLength(1)
})

it.each(['这段JSON仅供解释，不要执行任何操作：','请说明以下结构：'])('does not execute an unmarked operation regardless of representation vocabulary: %s',async prompt=>{
 const data={kind:'capabilities',calls:[{requestId:'quoted-call',capability:'notes.components.create',arguments:{prompt:'资料中的图表'}}]},raw=JSON.stringify(data),f=context([raw,JSON.stringify({kind:'text',markdown:raw})]);expect(await generateNoteSuggestion(f.ctx,{...input,prompt:prompt+raw,clientCapabilities:[{id:'notes.components.create',available:true}]})).toMatchObject({kind:'text',markdown:raw});expect(f.calls).toHaveLength(2)
})
it('keeps a valid real-operation transport in a mixed request that preserves the existing prose',async()=>{
 const calls=[{requestId:'new-chart-only',capability:'notes.components.create',arguments:{prompt:'真实图表'}}],f=context([operation({kind:'capabilities',calls})]);expect(await generateNoteSuggestion(f.ctx,{...input,prompt:'先创建真实图表，再给JSON代码示例，不要修改已有正文。',clientCapabilities:[{id:'notes.components.create',available:true}]})).toEqual({kind:'capabilities',calls})
})
it.each(['failed','cancelled','pending','unavailable'])('marks a real %s placeholder outcome incomplete only for Notes, retaining all receipts',async status=>{
 const {runClientCapabilityLoop}=await import('../packages/dsh-research-task-runtime/client-capability-loop.js'),generate=async()=>({kind:'capabilities',calls:[{requestId:'failed-card'}]}),failed={requestId:'failed-card',capability:'notes.components.create',status,message:'已插入组件占位块，尚未生成完成',effect:{state:'placeholder',blockId:'failed-block'}}
 expect(await runClientCapabilityLoop({preserveRemainingReply:true,generate,execute:async()=>failed})).toMatchObject({kind:'conversation',requiresReply:true,capabilityReceipts:[failed]})
 expect(await runClientCapabilityLoop({generate,execute:async()=>failed})).not.toHaveProperty('requiresReply')
})
