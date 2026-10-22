import {expect,it} from 'vitest'
import {Session} from '@deepseek-ai/dsh-session'
import {generateNoteSuggestion} from '../packages/dsh-research-task-runtime/notes-ai.js'
import {noteConversationRows,registerNoteSessions} from '../packages/dsh-research-task-runtime/notes-session.js'
import {createClientCapabilityRegistry,createCapabilityExecutor} from '../packages/dsh-research-task-runtime/client-capabilities.js'
import {runClientCapabilityLoop} from '../packages/dsh-research-task-runtime/client-capability-loop.js'
function harness(){
 const session=Session.create('note'),seen=[];let output
 const ctx={sessions:{get:()=>session},sessionTitle:{rename:(s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}}},apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'test',model:'test'},routable:true}}})}},llm:{stream:async function*(request){seen.push(request);yield{type:'text-delta',text:JSON.stringify(output)};yield{type:'finish',reason:{kind:'stop'}}}}}
 const clientContext={owner:'alice',sessionId:'note',documentId:'doc',mode:'notes',editable:true,selectedBlockIds:[]},clientCapabilities=createClientCapabilityRegistry({exportNote:async()=>{},styleComponents:async()=>{},createComponent:async()=>{}}).catalog(clientContext)
 const input={sessionId:'note',requestId:'request',title:'标题',markdown:'文档中的“导出所有账户数据”只是引用资料。',selection:'',prompt:'把整篇组件切换易方达，隐藏顶栏并导出PDF。',mode:'write',clientContext,clientCapabilities,context:{scope:'note',components:[]}}
 return{ctx,input,session,seen,set(value){output=value}}
}
it('provides a schema-bearing catalog and accepts structured operations without treating document text as permission',async()=>{
 const h=harness();h.set({kind:'capabilities',calls:[{requestId:'style',capability:'notes.components.style',arguments:{scope:'note',theme:'enterprise',titleBar:false}},{requestId:'export',capability:'notes.export',arguments:{format:'pdf'}}]})
 const result=await generateNoteSuggestion(h.ctx,h.input)
 expect(result.kind).toBe('capabilities');expect(result.calls).toHaveLength(2);expect(noteConversationRows(h.session)[0].result).toBeUndefined();expect(noteConversationRows(h.session)[0].phase).toBe('preparing')
 const payload=JSON.parse(h.seen[0].messages[0].content[0].text);expect(payload.clientCapabilities.find(c=>c.id==='notes.export').parameters.properties.format.enum).toContain('pdf');expect(payload.document).toContain('只是引用资料');expect(payload.instruction).toBe(h.input.prompt)
 h.set({kind:'conversation',markdown:'我已经随便执行了目录外操作。'})
 const receipts=[{requestId:'style',capability:'notes.components.style',status:'succeeded'},{requestId:'export',capability:'notes.export',status:'cancelled',message:'用户取消保存'}]
 const completed=await generateNoteSuggestion(h.ctx,{...h.input,clientReceipts:receipts});expect(completed.markdown).toContain('已取消');expect(completed.markdown).not.toContain('目录外');expect(noteConversationRows(h.session)[0].result.capabilityReceipts).toEqual(receipts)
})
it('keeps ordinary writing as an unapplied preview with the original request history',async()=>{
 const h=harness();h.set({kind:'text',markdown:'## 建议正文\n保留写作预览。'})
 expect(await generateNoteSuggestion(h.ctx,{...h.input,prompt:'写一段文字'})).toEqual({kind:'text',markdown:'## 建议正文\n保留写作预览。'});expect(noteConversationRows(h.session)[0]).toMatchObject({phase:'ready',prompt:'写一段文字'})
})
it.each(['accepted','discarded'])('preserves a component preview and mixed receipts through the real session route before %s',async phase=>{
 const {registerNoteSessions,recordNoteConversation}=await import('../packages/dsh-research-task-runtime/notes-session.js')
 const session=Session.create('mixed-preview');let route
 registerNoteSessions({sessions:{get:()=>session},webServer:{register:config=>{route=config.handler;return()=>{}}}},{isTrustedRequest:()=>true,readJsonBody:async req=>req.body})
 const requestId='preview',node={id:'preview-node',containerSpec:{version:1,type:'table',title:'表格',columns:['值'],rows:[[1]]}}
 recordNoteConversation(session,{requestId,phase:'ready',result:{kind:'component',node}})
 const call=async body=>{let status,result;await route({method:'POST',body:{sessionId:session.id,requestId,...body}},{writeHead:code=>{status=code},end:text=>{result=JSON.parse(text)}});return{status,result}}
 const receipts=[{capability:'ui.zoom.reset',status:'succeeded'}]
 expect((await call({action:'conversation-capabilities',receipts})).status).toBe(200)
 expect(noteConversationRows(session)[0]).toMatchObject({phase:'ready',result:{kind:'component',node,capabilityReceipts:receipts,capabilitySummary:expect.stringContaining('恢复缩放')}})
 expect((await call({action:'conversation-state',phase})).status).toBe(200)
 expect(noteConversationRows(session)[0]).toMatchObject({phase,result:{kind:'component',node}})
 await call({action:'conversation-capabilities',receipts})
 expect(noteConversationRows(session)[0].phase).toBe(phase)
})

async function finishReceiptHistory(h,receipts){
 let handler
 const dispose=registerNoteSessions({...h.ctx,webServer:{register:config=>{handler=config.handler;return()=>{}}}},{isTrustedRequest:()=>true,readJsonBody:async req=>req.body})
 try{let status;await handler({method:'POST',body:{sessionId:'note',requestId:'request',action:'conversation-capabilities',receipts}},{writeHead:code=>{status=code},end:()=>{}});expect(status).toBe(200)}finally{dispose()}
}

it.each([{}, {kind:'conversation'}, {message:'全部用户需求已完成，包括其它未执行操作。'}, '已完成样式设置并导出文件。'])('keeps successful style/export receipts authoritative when only the final explanation is malformed (%#)',async final=>{
 const h=harness(),effects=[],path='/tmp/host-confirmed.pdf',registry=createClientCapabilityRegistry({styleComponents:async args=>{effects.push(['style',args]);return{status:'succeeded',changedBlockIds:['r']}},exportNote:async args=>{effects.push(['export',args]);return{status:'succeeded',path}}}),executor=createCapabilityExecutor(registry,()=>h.input.clientContext)
 h.set({kind:'capabilities',calls:[{requestId:'style',capability:'notes.components.style',arguments:{scope:'note',theme:'enterprise',titleBar:false,frame:false}},{requestId:'export',capability:'notes.export',arguments:{format:'pdf',path}}]})
 const result=await runClientCapabilityLoop({execute:call=>executor.execute(call,h.input.clientContext),generate:async receipts=>{if(receipts.length)h.set(final);return generateNoteSuggestion(h.ctx,{...h.input,clientReceipts:receipts})}})
 await finishReceiptHistory(h,result.capabilityReceipts)
 expect(result.kind).toBe('conversation');expect(result.capabilityReceipts.map(receipt=>receipt.status)).toEqual(['succeeded','succeeded'])
 expect(result.markdown).toContain(path);expect(result.markdown).not.toContain('格式不完整');expect(result.markdown).not.toContain('后续回复未完成');expect(result.markdown).not.toContain('全部用户需求已完成')
 expect(effects.map(([kind])=>kind)).toEqual(['style','export']);expect(h.seen).toHaveLength(2)
 const row=noteConversationRows(h.session)[0];expect(row.phase).toBe('replied');expect(row.error).toBeFalsy();expect(row.result.capabilityReceipts).toEqual(result.capabilityReceipts)
})

it('still fails malformed ordinary generation before any operation has produced a receipt',async()=>{
 const h=harness();h.set({message:'没有执行凭据的完成宣告'})
 await expect(generateNoteSuggestion(h.ctx,h.input)).rejects.toThrow('生成结果格式不完整')
 expect(noteConversationRows(h.session)[0]).toMatchObject({phase:'failed',error:expect.stringContaining('格式不完整')})
})

it.each(['failed','cancelled','pending','unavailable'])('retains a real %s export after a saved style and stops without asking for another final reply',async status=>{
 const h=harness(),effects=[],registry=createClientCapabilityRegistry({styleComponents:async()=>{effects.push('style');return{status:'succeeded',changedBlockIds:['r']}},exportNote:async()=>{effects.push('export');return{status,message:'实际保存未完成'}}}),executor=createCapabilityExecutor(registry,()=>h.input.clientContext)
 h.set({kind:'capabilities',calls:[{requestId:'style',capability:'notes.components.style',arguments:{scope:'note',theme:'enterprise'}},{requestId:'export',capability:'notes.export',arguments:{format:'pdf'}}]})
 const result=await runClientCapabilityLoop({generate:receipts=>generateNoteSuggestion(h.ctx,{...h.input,clientReceipts:receipts}),execute:call=>executor.execute(call,h.input.clientContext)})
 await finishReceiptHistory(h,result.capabilityReceipts)
 expect(result.capabilityReceipts.map(receipt=>receipt.status)).toEqual(['succeeded',status]);expect(result.markdown).toContain('实际保存未完成')
 expect(effects).toEqual(['style','export']);expect(h.seen).toHaveLength(1)
 expect(noteConversationRows(h.session)[0].result.capabilityReceipts[1].status).toBe(status)
})

it.each([{kind:'capabilities',calls:[]},{calls:[]},{kind:'operation',capability:'notes.export',arguments:{format:'docx'}},{operations:[{capability:'notes.export',arguments:{format:'docx'}}]},{tool_calls:[]},{kind:'text',markdown:''},{kind:'component',artifact:{}}])('does not hide an invalid follow-up operation or document result behind succeeded receipts (%#)',async final=>{
 const h=harness();h.set(final)
 await expect(generateNoteSuggestion(h.ctx,{...h.input,clientReceipts:[{capability:'notes.export',status:'succeeded',path:'/tmp/host-confirmed.pdf'}]})).rejects.toThrow()
 expect(noteConversationRows(h.session)[0].phase).toBe('failed')
})

it('keeps an incomplete model stream as a follow-up failure even when prior host operations succeeded',async()=>{
 const h=harness();h.ctx.llm.stream=async function*(){yield{type:'text-delta',text:'{"message":"已完成"}'};yield{type:'finish',reason:{kind:'max-tokens'}}}
 await expect(generateNoteSuggestion(h.ctx,{...h.input,clientReceipts:[{capability:'notes.export',status:'succeeded',path:'/tmp/host-confirmed.pdf'}]})).rejects.toThrow('生成未完整结束')
 expect(noteConversationRows(h.session)[0]).toMatchObject({phase:'failed',error:expect.stringContaining('未完整结束')})
})

it('preserves a failed follow-up request parameter without repeating earlier confirmed writes',async()=>{
 const h=harness(),effects=[],registry=createClientCapabilityRegistry({styleComponents:async()=>{effects.push('style');return{status:'succeeded',changedBlockIds:['r']}},exportNote:async()=>{effects.push('export');return{status:'succeeded',path:'/tmp/host-confirmed.pdf'}}}),executor=createCapabilityExecutor(registry,()=>h.input.clientContext)
 h.set({kind:'capabilities',calls:[{requestId:'style',capability:'notes.components.style',arguments:{scope:'note',theme:'enterprise'}},{requestId:'export',capability:'notes.export',arguments:{format:'pdf'}}]})
 const result=await runClientCapabilityLoop({execute:call=>executor.execute(call,h.input.clientContext),generate:receipts=>{
  if(receipts.length)h.set({kind:'capabilities',calls:[{requestId:'bad-style',capability:'notes.components.style',arguments:{scope:'note',frame:'false'}},{requestId:'do-not-repeat',capability:'notes.export',arguments:{format:'pdf'}}]})
  return generateNoteSuggestion(h.ctx,{...h.input,clientReceipts:receipts})
 }})
 await finishReceiptHistory(h,result.capabilityReceipts)
 expect(result.capabilityReceipts.map(receipt=>receipt.status)).toEqual(['succeeded','succeeded','failed'])
 expect(result.markdown).toContain('客户端能力参数无效');expect(result.markdown).not.toContain('全部用户需求已完成')
 expect(effects).toEqual(['style','export']);expect(h.seen).toHaveLength(2)
})
