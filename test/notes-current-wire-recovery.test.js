import {expect,it,vi} from 'vitest'
import {Session} from '@deepseek-ai/dsh-session'
import {parseNotePublicOutput} from '../packages/dsh-research-task-runtime/notes-output.js'
import {generateNoteSuggestion} from '../packages/dsh-research-task-runtime/notes-ai.js'
import {runClientCapabilityLoop} from '../packages/dsh-research-task-runtime/client-capability-loop.js'
import {noteConversationRows} from '../packages/dsh-research-task-runtime/notes-session.js'
import {createCapabilityExecutor,createClientCapabilityRegistry} from '../packages/dsh-research-task-runtime/client-capabilities.js'
import {createNoteCapabilityActions} from '../src/preload/notes/client-capability-actions'
import {createInlineComponentGeneration} from '../src/preload/notes/use-inline-component-generation'

const instruction='在此处写两句简短总结，说明本次仅核对用户提供的三条演示数据，不代表真实行情。随后插入一个两列表格，列名是“日期”和“演示值”，三行依次为10月1日10、10月2日20、10月3日15。只生成这段正文和表格，不修改标题或其他内容。'
const prose='本次仅核对用户提供的三条演示数据，不代表真实行情。下表仅整理本次演示值，不引入其他数据。'
const table='| 日期 | 演示值 |\n| --- | --- |\n| 10月1日 | 10 |\n| 10月2日 | 20 |\n| 10月3日 | 15 |'
const call={requestId:'req-notes-demo-table-01',capability:'notes.components.create',arguments:{prompt:'创建两列表格，列名“日期”“演示值”；三行：10月1日10、10月2日20、10月3日15。仅演示数据，无真实行情，不修改其他内容。'}}
const input={sessionId:'current-wire',requestId:'mixed-note',entryPoint:'inline',insertionAnchor:{documentId:'doc',blockId:'blank',position:{}},clientContext:{documentId:'doc'},title:'原标题',markdown:'已有正文必须保留',selection:'',prompt:instruction,mode:'write',clientCapabilities:[{id:'notes.components.create',available:true,parameters:createClientCapabilityRegistry().get('notes.components.create').parameters}]}
const composite=wireToken=>({wireToken,text:{kind:'text',markdown:prose},capabilities:{kind:'capabilities',calls:[call]}})
function context(outputs){
 const calls=[],session=Session.create(input.sessionId)
 const ctx={sessions:{get:()=>session},sessionTitle:{rename:(session,title)=>{session.append('session/title',{title,source:{kind:'user'}});return{title}}},apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'selected',model:'selected'},routable:true}}})}},llm:{stream:vi.fn(async function*(options){const i=calls.push(options)-1,source=outputs[Math.min(i,outputs.length-1)],value=typeof source==='function'?source(options):source;yield{type:'text-delta',text:typeof value==='string'?value:JSON.stringify(value)};yield{type:'finish',reason:{kind:'stop'}}})}}
 return{ctx,calls,session}
}
const token=options=>/wireToken=([a-f0-9-]+)/u.exec(options.system)?.[1]
const combined=options=>composite(token(options))
const actual=value=>options=>({...value,wireToken:token(options)})

function realComponentEffects(f){
 const artifact={version:1,type:'table',title:'用户提供的演示数据',columns:['日期','演示值'],rows:[['10月1日',10],['10月2日',20],['10月3日',15]]},child={id:'component-child',session:{id:'component-child',events:[]}},agent={id:input.sessionId,session:f.session},created=[],effects=[],blocks=[{id:'blank',type:'paragraph',props:{},content:[]}]
 f.ctx.agents={get:id=>id===input.sessionId?agent:undefined};f.ctx.tools={schemas:()=>[]};f.ctx.on=()=>()=>{};f.ctx.subagents={start:vi.fn(async()=>({id:child.id,localAgent:child,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(artifact)}]}),dispose:async()=>{}}))}
 const editor={isEditable:true,get document(){return blocks},getBlock:id=>blocks.find(block=>block.id===id),updateBlock:(id,patch)=>Object.assign(editor.getBlock(id),patch)}
 const current=()=>true,persist=async()=>{},controller=createInlineComponentGeneration({sessionId:input.sessionId,editor,current,persist,bridge:{request:(method,value)=>method==='generate'?generateNoteSuggestion(f.ctx,value):Promise.resolve({})}})
 const actions=createNoteCapabilityActions({editor,current,generationId:()=>input.requestId,documentId:'doc',snapshot:()=>({title:input.title,blocks,yjs:''}),selectedBlockIds:()=>[],persist,settle:async()=>{},reportEffect:async(requestId,effect)=>effects.push({requestId,...effect}),createComponent:async(args,_current,requestId,report)=>{
  const id='block-'+requestId;created.push(requestId);blocks.unshift({id,type:'research',props:{payload:JSON.stringify({id,noteDraft:'smart',generationStatus:'draft'})}});await report({state:'placeholder',blockId:id});return controller.startAndWait(id,args.prompt)
 }})
 const host={owner:'fixture-owner',sessionId:input.sessionId,documentId:'doc',mode:'notes',editable:true,selectedBlockIds:[]},registry=createClientCapabilityRegistry({createComponent:(args,_context,_signal,requestId)=>actions({generationId:input.requestId,requestId,action:'notes.components.create',args,context:host})}),executor=createCapabilityExecutor(registry,()=>host)
 return{artifact,created,effects,blocks,catalog:registry.catalog(host),execute:call=>executor.execute(call,host),dispose:()=>controller.dispose()}
}

it.each([false,true])('routes a current marked composite to recovery rather than literal Markdown, fenced=%s',fenced=>{
 const raw=JSON.stringify(composite('current-token')),value=fenced?'```json\n'+raw+'\n```':raw
 expect(parseNotePublicOutput(value,{wireToken:'current-token'})).toBeUndefined()
 expect(parseNotePublicOutput(value,{wireToken:'unrelated-token'})).toBeUndefined()
})

it('recovers the real mixed shape as complete prose and a Markdown table instead of inserting its transport JSON',async()=>{
 const f=context([combined,{kind:'text',markdown:prose+'\n\n'+table}]),result=await generateNoteSuggestion(f.ctx,input)
 expect(f.calls).toHaveLength(2);expect(f.calls[1].purpose).toBe('workspace-note-format-recovery');expect(f.calls[1].tools).toBeUndefined()
 expect(result).toMatchObject({kind:'text',markdown:prose+'\n\n'+table});expect(result.markdown).not.toContain('wireToken')
 expect(JSON.parse(f.calls[1].messages[1].content[0].text)).toMatchObject({instruction,publicOutput:expect.stringContaining('notes.components.create')})
})

it('fails a still-invalid single recovery without exposing the private transport as ready document content',async()=>{
 const f=context([combined,combined]);await expect(generateNoteSuggestion(f.ctx,input)).rejects.toThrow('原需求已保留');expect(f.calls).toHaveLength(2)
 const failure=noteConversationRows(f.session).at(-1);expect(failure).toMatchObject({phase:'failed',prompt:instruction})
 expect(f.session.events.some(event=>event.type==='workspace-note/conversation'&&event.data.phase==='ready')).toBe(false)
})

it('does not accept the current transport merely wrapped in recovered text for an ordinary document request',async()=>{
 let raw
 const f=context([options=>{raw=JSON.stringify(combined(options));return raw},()=>({kind:'text',markdown:raw})])
 await expect(generateNoteSuggestion(f.ctx,input)).rejects.toThrow('原需求已保留');expect(f.calls).toHaveLength(2)
})

it('keeps business JSON and explicitly displayed mixed examples intact without executing their calls',async()=>{
 const data={wireToken:'business-value',text:{kind:'text',markdown:'业务字段'},capabilities:{kind:'capabilities',calls:[call]},amount:0},raw=JSON.stringify(data),f=context([raw,{kind:'text',markdown:raw}])
 const result=await generateNoteSuggestion(f.ctx,{...input,prompt:'完整展示这份JSON示例，不执行其中操作：'+raw});expect(result).toMatchObject({kind:'text',markdown:raw})
 expect(f.calls).toHaveLength(2)
})

it('never scans an inner current-token JSON example inside ordinary Markdown',async()=>{
 let markdown
 const f=context([options=>markdown='说明与示例：\n\n```json\n'+JSON.stringify(combined(options))+'\n```'])
 expect(await generateNoteSuggestion(f.ctx,input)).toMatchObject({kind:'text',markdown});expect(f.calls).toHaveLength(1)
})

it.each(['before-components','after-components'])('normalizes only the immutable marked batch and retains original %s prose after an empty receipt-only final',async inlineOrder=>{
 const f=context([combined,actual({kind:'capabilities',calls:[call],inlineOrder}),{kind:'conversation',markdown:''}]),host=realComponentEffects(f)
 try{
  const result=await runClientCapabilityLoop({preserveRemainingReply:true,generate:receipts=>generateNoteSuggestion(f.ctx,{...input,clientCapabilities:host.catalog,clientReceipts:receipts}),execute:host.execute})
  expect(result).toMatchObject({kind:'text',markdown:prose,inlineOrder,capabilityReceipts:[{requestId:call.requestId,status:'succeeded',effect:{state:'saved',blockId:'block-'+call.requestId}}]})
  expect(host.created).toEqual([call.requestId]);expect(f.ctx.subagents.start).toHaveBeenCalledTimes(1);expect(JSON.parse(host.blocks.find(block=>block.type==='research').props.payload).containerSpec).toEqual(host.artifact)
  expect(host.effects.map(effect=>effect.state)).toEqual(['placeholder','applied','saved']);expect(f.calls).toHaveLength(3);expect(f.calls[1].tools).toBeUndefined()
  expect(JSON.parse(f.calls[2].messages[0].content[0].text).pendingInlineContent).toMatchObject({kind:'text',markdown:prose,inlineOrder,sessionId:input.sessionId,requestId:input.requestId,documentId:'doc'})
  expect(noteConversationRows(f.session).find(row=>row.requestId===input.requestId).pendingInlineContent).toBeNull()
 }finally{host.dispose()}
})

it('does not complete a receipt-only final when retained prose still has no trustworthy placement',async()=>{
 const f=context([combined,actual({kind:'capabilities',calls:[call]}),{kind:'conversation',markdown:''}]),host=realComponentEffects(f)
 try{
  const result=await runClientCapabilityLoop({preserveRemainingReply:true,generate:receipts=>generateNoteSuggestion(f.ctx,{...input,clientCapabilities:host.catalog,clientReceipts:receipts}),execute:host.execute})
  expect(result).toMatchObject({kind:'conversation',requiresReply:true});expect(host.created).toEqual([call.requestId]);expect(noteConversationRows(f.session).find(row=>row.requestId===input.requestId).pendingInlineContent.markdown).toBe(prose)
 }finally{host.dispose()}
})

it.each(['succeeded','failed','cancelled','pending','unavailable'])('does not replay a processed %s receipt while repairing the same mixed batch',async status=>{
 const old={...call,requestId:'already-handled'},f=context([options=>({...combined(options),capabilities:{kind:'capabilities',calls:[old,call]}}),actual({kind:'capabilities',calls:[call]})]),previous={requestId:old.requestId,capability:old.capability,status}
 expect(await generateNoteSuggestion(f.ctx,{...input,clientReceipts:[previous]})).toEqual({kind:'capabilities',calls:[call]});expect(f.calls).toHaveLength(2)
})

it.each(['before-components','after-components'])('retains %s prose when the whole original batch has already really completed',async inlineOrder=>{
 const f=context([options=>({...combined(options),text:{kind:'text',markdown:prose,inlineOrder}}),{kind:'conversation',markdown:''}]),host=realComponentEffects(f)
 try{
  const receipt=await host.execute(call),execute=vi.fn(host.execute)
  const result=await runClientCapabilityLoop({preserveRemainingReply:true,generate:()=>generateNoteSuggestion(f.ctx,{...input,clientCapabilities:host.catalog,clientReceipts:[receipt]}),execute})
  expect(result).toMatchObject({kind:'text',markdown:prose,inlineOrder});expect(execute).not.toHaveBeenCalled();expect(host.created).toEqual([call.requestId]);expect(f.ctx.subagents.start).toHaveBeenCalledTimes(1);expect(f.calls).toHaveLength(2)
 }finally{host.dispose()}
})

it.each(['failed','cancelled'])('keeps uninserted prose when an entirely handled original batch contains a %s receipt',async status=>{
 const f=context([options=>({...combined(options),text:{kind:'text',markdown:prose,inlineOrder:'before-components'}}),{kind:'conversation',markdown:''}]),receipt={requestId:call.requestId,capability:call.capability,status}
 expect(await generateNoteSuggestion(f.ctx,{...input,clientReceipts:[receipt]})).toMatchObject({kind:'conversation',requiresReply:true})
 expect(noteConversationRows(f.session).find(row=>row.requestId===input.requestId).pendingInlineContent).toMatchObject({markdown:prose,calls:[{requestId:call.requestId,capability:call.capability}]});expect(f.calls).toHaveLength(2)
})

it('keeps the original whole-batch dependency rather than treating only the remaining call as the prose dependency',async()=>{
 const old={...call,requestId:'previous-failed'},f=context([options=>({...combined(options),text:{kind:'text',markdown:prose,inlineOrder:'before-components'},capabilities:{kind:'capabilities',calls:[old,call]}}),actual({kind:'capabilities',calls:[call],inlineOrder:'before-components'}),{kind:'conversation',markdown:''}]),host=realComponentEffects(f)
 try{
  const prior={requestId:old.requestId,capability:old.capability,status:'failed'}
  await generateNoteSuggestion(f.ctx,{...input,clientCapabilities:host.catalog,clientReceipts:[prior]});const receipt=await host.execute(call)
  expect(await generateNoteSuggestion(f.ctx,{...input,clientCapabilities:host.catalog,clientReceipts:[prior,receipt]})).toMatchObject({kind:'conversation',requiresReply:true})
  expect(noteConversationRows(f.session).find(row=>row.requestId===input.requestId).pendingInlineContent.calls).toHaveLength(2)
 }finally{host.dispose()}
})

it.each([undefined,'before-components','after-components'])('retains a legal main capabilities placement hint, hint=%s',async inlineOrder=>{
 const f=context([actual({kind:'capabilities',calls:[call],...inlineOrder?{inlineOrder}:{}}),{kind:'text',markdown:prose},{kind:'text',markdown:prose,inlineOrder:'before-components'}]),host=realComponentEffects(f)
 try{
  const result=await runClientCapabilityLoop({preserveRemainingReply:true,generate:receipts=>generateNoteSuggestion(f.ctx,{...input,clientCapabilities:host.catalog,clientReceipts:receipts}),execute:host.execute})
  expect(result).toMatchObject({kind:'text',markdown:prose,inlineOrder:inlineOrder||'before-components'});expect(f.calls).toHaveLength(inlineOrder?2:3);expect(host.created).toEqual([call.requestId]);expect(f.ctx.subagents.start).toHaveBeenCalledTimes(1)
 }finally{host.dispose()}
})

it('does not silently default mixed prose placement after a legal main create when one format recovery still omits placement',async()=>{
 const f=context([actual({kind:'capabilities',calls:[call]}),{kind:'text',markdown:prose}]),host=realComponentEffects(f)
 try{
  expect(await runClientCapabilityLoop({preserveRemainingReply:true,generate:receipts=>generateNoteSuggestion(f.ctx,{...input,clientCapabilities:host.catalog,clientReceipts:receipts}),execute:host.execute})).toMatchObject({kind:'conversation',requiresReply:true})
  expect(host.created).toEqual([call.requestId]);expect(f.calls).toHaveLength(3)
 }finally{host.dispose()}
})

it.each([undefined,'before-components'])('retains prose after a real earlier batch and a repeated entirely handled composite, order=%s',async inlineOrder=>{
 const f=context([actual({kind:'capabilities',calls:[call]}),options=>({...combined(options),text:{kind:'text',markdown:prose,...inlineOrder?{inlineOrder}:{}}}),{kind:'conversation',markdown:''}]),host=realComponentEffects(f)
 try{
  const result=await runClientCapabilityLoop({preserveRemainingReply:true,generate:receipts=>generateNoteSuggestion(f.ctx,{...input,clientCapabilities:host.catalog,clientReceipts:receipts}),execute:host.execute})
  expect(result).toMatchObject(inlineOrder?{kind:'text',markdown:prose,inlineOrder}:{kind:'conversation',requiresReply:true});expect(host.created).toEqual([call.requestId]);expect(f.ctx.subagents.start).toHaveBeenCalledTimes(1);expect(f.calls).toHaveLength(3)
  if(!inlineOrder)expect(noteConversationRows(f.session).find(row=>row.requestId===input.requestId).pendingInlineContent.markdown).toBe(prose)
 }finally{host.dispose()}
})

it('retains main text rather than completing only receipts when placement recovery returns an empty conversation',async()=>{
 const f=context([actual({kind:'capabilities',calls:[call]}),{kind:'text',markdown:prose},{kind:'conversation',markdown:''}]),host=realComponentEffects(f)
 try{
  expect(await runClientCapabilityLoop({preserveRemainingReply:true,generate:receipts=>generateNoteSuggestion(f.ctx,{...input,clientCapabilities:host.catalog,clientReceipts:receipts}),execute:host.execute})).toMatchObject({kind:'conversation',requiresReply:true})
  expect(noteConversationRows(f.session).find(row=>row.requestId===input.requestId).pendingInlineContent.markdown).toBe(prose);expect(host.created).toEqual([call.requestId]);expect(f.calls).toHaveLength(3)
 }finally{host.dispose()}
})

it('does not consume an example text slot or its placement when the complete marked composite is explicitly displayed',async()=>{
 let raw
 const f=context([options=>raw=JSON.stringify({...combined(options),text:{kind:'text',markdown:prose,inlineOrder:'before-components'}}),()=>({kind:'text',markdown:raw,inlineOrder:'after-components'})]),receipt={requestId:call.requestId,capability:call.capability,status:'succeeded',effect:{state:'saved',blockId:'actual-created'}}
 expect(await generateNoteSuggestion(f.ctx,{...input,prompt:'先插入组件，然后完整展示JSON示例，不执行示例中的操作。',clientReceipts:[receipt]})).toMatchObject({kind:'text',markdown:expect.any(String),inlineOrder:'after-components'})
 expect(noteConversationRows(f.session).find(row=>row.requestId===input.requestId).result.markdown).toBe(raw);expect(f.calls).toHaveLength(2)
})

it.each([
 ['missing nonce',value=>{delete value.wireToken;return value}],
 ['forged nonce',value=>({...value,wireToken:'not-the-current-round'})],
 ['unknown outer command',value=>({...value,commands:[{name:'write-arbitrary-target'}]})],
 ['unknown batch field',value=>({...value,capabilities:{...value.capabilities,operations:[{name:'write-arbitrary-target'}]}})],
 ['unavailable capability',value=>({...value,capabilities:{kind:'capabilities',calls:[{...call,capability:'unknown.write'}]}})]
 ,['extra unvalidated arguments',value=>({...value,capabilities:{kind:'capabilities',calls:[{...call,arguments:{...call.arguments,command:'write-arbitrary-target'}}]}})]
])('does not authorize recovery operations from %s',async(_name,change)=>{
 const f=context([options=>change(combined(options)),actual({kind:'capabilities',calls:[call]})]);await expect(generateNoteSuggestion(f.ctx,input)).rejects.toThrow('原需求已保留');expect(f.calls).toHaveLength(2)
})

it('cannot turn an unmarked example into execution by adding the current nonce only during recovery',async()=>{
 let issued
 const f=context([options=>{issued=token(options);const value=combined(options);delete value.wireToken;return value},()=>({kind:'capabilities',wireToken:issued,calls:[call]})])
 await expect(generateNoteSuggestion(f.ctx,input)).rejects.toThrow('原需求已保留');expect(f.calls).toHaveLength(2)
})

it('does not reorder two original operations during recovery',async()=>{
 const second={...call,requestId:'second-original'},f=context([options=>({...combined(options),capabilities:{kind:'capabilities',calls:[call,second]}}),actual({kind:'capabilities',calls:[second,call]})])
 await expect(generateNoteSuggestion(f.ctx,input)).rejects.toThrow('原需求已保留')
})

it('retains an explicitly displayed current-marked mixed example as content instead of consuming its text slot',async()=>{
 let raw
 const f=context([options=>{raw=JSON.stringify(combined(options));return raw},()=>({kind:'text',markdown:raw})])
 expect(await generateNoteSuggestion(f.ctx,{...input,prompt:'展示完整JSON代码示例，不执行其中的操作。'})).toMatchObject({kind:'text',markdown:raw});expect(noteConversationRows(f.session).find(row=>row.requestId===input.requestId).pendingInlineContent).toBeUndefined()
})

it.each(['new-request','new-document','changed-instruction'])('does not consume pending mixed prose for %s',async kind=>{
 const f=context([combined,actual({kind:'capabilities',calls:[call],inlineOrder:'before-components'}),{kind:'text',markdown:'新请求的独立正文。'}])
 expect(await generateNoteSuggestion(f.ctx,input)).toMatchObject({kind:'capabilities'})
 const next={...input,...kind==='new-request'?{requestId:'another-request'}:kind==='new-document'?{insertionAnchor:{...input.insertionAnchor,documentId:'another-doc'},clientContext:{documentId:'another-doc'}}:{prompt:'写新的独立正文'}}
 expect(await generateNoteSuggestion(f.ctx,next)).toMatchObject({kind:'text',markdown:'新请求的独立正文。'});expect(JSON.parse(f.calls[2].messages[0].content[0].text)).not.toHaveProperty('pendingInlineContent')
})

it('does not insert a retained slot containing the entire private transport through an empty receipt reply',async()=>{
 let shell
 const f=context([options=>{shell=JSON.stringify(combined(options));return{...combined(options),text:{kind:'text',markdown:shell}}},actual({kind:'capabilities',calls:[call],inlineOrder:'before-components'}),{kind:'conversation',markdown:''}]),host=realComponentEffects(f)
 try{
  const result=await runClientCapabilityLoop({preserveRemainingReply:true,generate:receipts=>generateNoteSuggestion(f.ctx,{...input,clientCapabilities:host.catalog,clientReceipts:receipts}),execute:host.execute})
  expect(result).toMatchObject({kind:'conversation',requiresReply:true});expect(host.created).toEqual([call.requestId]);expect(result.markdown).not.toContain(shell)
 }finally{host.dispose()}
})

it.each([
 ['request identity',value=>({...value,calls:[{...call,requestId:'another-id'}]})],
 ['capability',value=>({...value,calls:[{...call,capability:'notes.export'}]})],
 ['arguments',value=>({...value,calls:[{...call,arguments:{prompt:'改写其它旧正文'}}]})],
 ['extra operation',value=>({...value,calls:[call,{...call,requestId:'extra-write'}]})]
])('rejects a recovery that changes the original batch %s',async(_name,change)=>{
 const f=context([combined,actual(change({kind:'capabilities',calls:[call]}))]);await expect(generateNoteSuggestion(f.ctx,input)).rejects.toThrow('原需求已保留');expect(f.calls).toHaveLength(2)
})
