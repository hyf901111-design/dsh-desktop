import {expect,it} from 'vitest'
import {Session} from '@deepseek-ai/dsh-session'
import {generateNoteSuggestion} from '../packages/dsh-research-task-runtime/notes-ai.js'
import {noteConversationRows} from '../packages/dsh-research-task-runtime/notes-session.js'
import {createClientCapabilityRegistry} from '../packages/dsh-research-task-runtime/client-capabilities.js'
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
