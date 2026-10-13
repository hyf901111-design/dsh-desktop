import { expect, it } from 'vitest'
import { generateNoteSuggestion } from '../packages/dsh-research-task-runtime/notes-ai.js'
function context(text, kind = 'stop') {
  let options
  return { apiProxy: { sessions: { models: async () => ({ result: { ok: true, value: { current: { provider: 'session-provider', model: 'session-model' }, routable: true } } }) } }, llm: { stream: async function* (value) { options = value; yield { type: 'text-delta', text }; yield { type: 'finish', reason: { kind } } } }, options: () => options }
}
const input = { sessionId: 'session', title: '笔记', markdown: '正文资料', selection: '选中文字', prompt: '改写为简洁文字', mode: 'write' }
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
