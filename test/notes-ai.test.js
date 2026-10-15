import { expect, it } from 'vitest'
import { generateNoteSuggestion } from '../packages/dsh-research-task-runtime/notes-ai.js'
function context(text, kind = 'stop') {
  let options
  return { apiProxy: { sessions: { models: async () => ({ result: { ok: true, value: { current: { provider: 'session-provider', model: 'session-model' }, routable: true } } }) } }, llm: { stream: async function* (value) { options = value; yield { type: 'text-delta', text }; yield { type: 'finish', reason: { kind } } } }, options: () => options }
}
const input = { sessionId: 'session', title: '笔记', markdown: '正文资料', selection: '选中文字', prompt: '改写为简洁文字', mode: 'write' }
it('passes the selected component data to the model and excludes the note when opted out',async()=>{
 const ctx=context('{"kind":"conversation","markdown":"说明"}')
 const selected={scope:'selection',components:[{blockId:'chart',title:'收入表',type:'research',content:'甲收入123'}]}
 await generateNoteSuggestion(ctx,{...input,selection:'',markdown:'',context:selected})
 expect(JSON.parse(ctx.options().messages[0].content[0].text).references).toEqual(selected)
 await generateNoteSuggestion(ctx,{...input,context:{scope:'none',components:[]}})
 const sent=JSON.parse(ctx.options().messages[0].content[0].text);expect(sent.document).toBe('');expect(sent.selection).toBe('');expect(sent.title).toBe('')
})
it('permits updates only to an explicitly selected research component',async()=>{
 const ctx=context('{"kind":"component","targetBlockId":"chart","artifact":{"version":1,"type":"table","title":"调整后收入","columns":["项目","收入"],"rows":[["甲",456]]}}')
 const selected={scope:'selection',components:[{blockId:'chart',title:'收入表',type:'research',content:'甲收入123'}]}
 expect(await generateNoteSuggestion(ctx,{...input,context:selected})).toMatchObject({kind:'component',targetBlockId:'chart',node:{containerSpec:{title:'调整后收入'}}})
 await expect(generateNoteSuggestion(ctx,{...input,context:{scope:'note',components:selected.components}})).rejects.toThrow('引用')
})
it('reports actual model reasoning and writing progress while returning the document only in the final result',async()=>{
 const ctx=context(''),seen=[]
 ctx.llm.stream=async function*(){yield{type:'reasoning-delta',index:0,text:'先保留原意，再整理段落。'};yield{type:'text-delta',index:1,text:'{"kind":"text","markdown":"新正文"}'};yield{type:'finish',reason:{kind:'stop'}}}
 expect(await generateNoteSuggestion(ctx,input,undefined,value=>seen.push(value))).toEqual({kind:'text',markdown:'新正文'})
 expect(seen.some(row=>row.reasoning.includes('保留原意'))).toBe(true);expect(seen.at(-1)).toMatchObject({stage:'validating',reasoning:'先保留原意，再整理段落。'})
 expect(seen.every(row=>!('markdown' in row))).toBe(true)
})
it('declares the attachment dependency used by the real notes HTTP handler',async()=>{
 const {inject}=await import('../packages/dsh-research-task-runtime/index.js')
 expect(inject).toContain('attachments')
})
it('uses the selected session model and returns a preview without writing the document', async () => {
  const ctx = context('{"kind":"text","markdown":"简洁的新内容"}')
  expect(await generateNoteSuggestion(ctx, input)).toEqual({ kind: 'text', markdown: '简洁的新内容' })
  expect(ctx.options()).toMatchObject({ provider: 'session-provider', model: 'session-model' })
  expect(ctx.options().tools).toBeUndefined()
  expect(ctx.options().messages[0].content[0].text).toContain('选中文字')
})
it('rejects a truncated answer instead of offering it for acceptance', async () => {
  await expect(generateNoteSuggestion(context('{"kind":"text","markdown":"不完整"}', 'max-tokens'), input)).rejects.toThrow()
})
it('validates a created component before returning it', async () => {
  const ctx = context('{"kind":"component","artifact":{"version":1,"type":"table","title":"比较","columns":["项目","结果"],"rows":[["A","待验证"]]}}')
  expect(await generateNoteSuggestion(ctx, { ...input, mode: 'component' })).toMatchObject({ kind: 'component', node: { kind: 'generated-container', containerSpec: { type: 'table', title: '比较' } } })
  await expect(generateNoteSuggestion(context('{"kind":"component","artifact":{"type":"unknown"}}'), input)).rejects.toThrow()
})
it('uses the accepted native chart contract in its prompt and component output', async () => {
  const ctx = context('{"kind":"component","artifact":{"version":1,"type":"chart","title":"趋势","variant":"line","labels":["一月","二月"],"series":[{"name":"收入","values":[10,20]}]}}')
  expect(await generateNoteSuggestion(ctx, { ...input, mode: 'component' })).toMatchObject({ kind: 'component', node: { containerSpec: { variant: 'line' } } })
  expect(ctx.options().system).toContain('variant:"line"')
  expect(ctx.options().system).not.toContain('chartType')
})
it('honors cancellation and refuses missing models', async () => {
  const cancelled = new AbortController(); cancelled.abort()
  await expect(generateNoteSuggestion(context('hello'), input, cancelled.signal)).rejects.toThrow()
  const ctx = context('hello'); ctx.apiProxy.sessions.models = async () => ({ result: { ok: true, value: { current: null, routable: false } } })
  await expect(generateNoteSuggestion(ctx, input)).rejects.toThrow()
})
it('uses the native attachment store for uploaded images and refuses malformed or oversized images',async()=>{
 const ctx=context('{"kind":"text","markdown":"图片说明"}');let saved
 ctx.attachments={imageLimits:{maxImagesPerMessage:1,maxImageBytes:16,maxMessageImageBytes:16,mediaTypes:['image/png']},saveImages:async inputs=>{saved=inputs;return[{attachmentId:'owned-image',mediaType:'image/png',bytes:3,width:1,height:1}]}}
 await generateNoteSuggestion(ctx,{...input,images:[{type:'image',mediaType:'image/png',data:'AQID'}]});expect(saved[0].data).toEqual(Buffer.from([1,2,3]));expect(ctx.options().messages[0].content[0]).toMatchObject({type:'image',attachment:{attachmentId:'owned-image'}})
 await expect(generateNoteSuggestion(ctx,{...input,images:[{type:'image',mediaType:'image/png',data:'bad!'}]})).rejects.toThrow('格式')
 await expect(generateNoteSuggestion(ctx,{...input,images:[{type:'image',mediaType:'image/png',data:Buffer.alloc(17).toString('base64')}]})).rejects.toThrow('大小')
})

it('uses the shared native conversation as context for note writing and durably records the result',async()=>{
 const {Session}=await import('@deepseek-ai/dsh-session'),{noteConversationRows}=await import('../packages/dsh-research-task-runtime/notes-session.js')
 const session=Session.create('session');session.append('user/message',{id:'u',role:'user',source:{kind:'user'},content:[{type:'text',text:'讨论里的验收目标'}]},{surfaceOp:'append'})
 const ctx=context('{"kind":"text","markdown":"基于讨论的新正文"}');ctx.sessions={get:()=>session};ctx.sessionTitle={rename:(s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}}}
 await generateNoteSuggestion(ctx,{...input,requestId:'shared-request'});expect(ctx.options().messages[0].content[0].text).toContain('讨论里的验收目标');expect(noteConversationRows(session)[0]).toMatchObject({phase:'ready',prompt:input.prompt,result:{markdown:'基于讨论的新正文'}})
})

it('routes a clarification as a durable conversation reply instead of a document suggestion',async()=>{
 const {Session}=await import('@deepseek-ai/dsh-session'),{noteConversationRows,sharedNoteConversationContext}=await import('../packages/dsh-research-task-runtime/notes-session.js')
 const session=Session.create('session'),ctx=context('{"kind":"conversation","markdown":"你想写什么主题？大约多少字？"}')
 ctx.sessions={get:()=>session};ctx.sessionTitle={rename:(s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}}}
 expect(await generateNoteSuggestion(ctx,{...input,requestId:'clarification',title:'',markdown:'',selection:'',prompt:'写一篇文章'})).toEqual({kind:'conversation',markdown:'你想写什么主题？大约多少字？'})
 expect(ctx.options().system).toContain('澄清');expect(ctx.options().system).toContain('"kind":"conversation"')
 expect(noteConversationRows(session)[0]).toMatchObject({phase:'replied',result:{kind:'conversation'}})
 expect(sharedNoteConversationContext(session)[0]).toMatchObject({reply:'你想写什么主题？大约多少字？'})
 await expect(generateNoteSuggestion(context('{"kind":"conversation","markdown":""}'),input)).rejects.toThrow('格式')
})
