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
it('honors cancellation and refuses missing models', async () => {
  const cancelled = new AbortController(); cancelled.abort()
  await expect(generateNoteSuggestion(context('hello'), input, cancelled.signal)).rejects.toThrow()
  const ctx = context('hello'); ctx.apiProxy.sessions.models = async () => ({ result: { ok: true, value: { current: null, routable: false } } })
  await expect(generateNoteSuggestion(ctx, input)).rejects.toThrow()
})
