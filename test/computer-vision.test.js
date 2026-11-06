import { describe, expect, it, vi } from 'vitest'
import { requireComputerVision } from '../packages/dsh-integration-runtime/computer-use-tools.js'

function fixture(modalities) {
  const resolveModelInfo = vi.fn(async () => ({ inputModalities: modalities }))
  const ctx = { get: (key) => key === 'llm' ? { resolveModelInfo } : {} }
  const exec = { agent: { session: { requestHeader: () => ({ config: { provider: 'current-provider', model: 'current-model' } }) }, options: { provider: 'old-provider', model: 'old-model' } }, signal: new AbortController().signal }
  return { ctx, exec, resolveModelInfo }
}
describe('computer use image admission', () => {
  it.each([undefined, ['text']])('rejects absent or text-only capability before desktop actions', async modalities => {
    const { ctx, exec } = fixture(modalities)
    await expect(requireComputerVision(ctx, exec)).rejects.toThrow('不支持图片输入')
  })
  it('uses the latest session route after a model switch', async () => {
    const { ctx, exec, resolveModelInfo } = fixture(['text', 'image'])
    await requireComputerVision(ctx, exec)
    expect(resolveModelInfo).toHaveBeenCalledWith('current-provider', 'current-model', exec.signal)
  })
  it('does not admit a canceled invocation', async () => {
    const { ctx, exec } = fixture(['image'])
    exec.signal = AbortSignal.abort()
    await expect(requireComputerVision(ctx, exec)).rejects.toThrow()
  })
})

it('registers valid stroke schemas and stops model waiting at the absolute deadline', async () => {
  vi.useFakeTimers()
  const { registerComputerUseTool } = await import('../packages/dsh-integration-runtime/computer-use-tools.js')
  let tool, onEvent
  const cancel = vi.fn()
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ screenshots: [] }) }))
  vi.stubGlobal('fetch', fetcher)
  vi.stubEnv('SHERLOCK_LOCAL_SEARCH_URL', 'http://127.0.0.1:1234')
  vi.stubEnv('SHERLOCK_LOCAL_SEARCH_TOKEN', 'test-only-token')
  const ctx = { on: (_name, cb) => { onEvent = cb; return () => {} }, tools: { register: t => { tool = t; return () => {} } }, get: name => name === 'llm' ? { resolveModelInfo: async () => ({ inputModalities: ['image'] }) } : {} }
  const dispose = registerComputerUseTool(ctx)
  const exec = { signal: new AbortController().signal, agent: { cancel, session: { id: 'test', requestHeader: () => ({ config: { provider: 'test', model: 'test' } }) } } }
  try {
    await tool.execute({ op: 'stroke', revision: 'view-1', strokes: [[{ x: 10, y: 20 }, { x: 30, y: 40 }]] }, exec)
    expect(JSON.parse(fetcher.mock.calls[0][1].body).strokes).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(600001)
    expect(cancel).toHaveBeenCalledWith(expect.objectContaining({ kind: 'hook' }), { keepInbox: true })
    expect(JSON.parse(fetcher.mock.calls.at(-1)[1].body).op).toBe('finish')
    onEvent({ id: 'test' }, { type: 'turn/end' })
    cancel.mockClear()
    await vi.advanceTimersByTimeAsync(600001)
    expect(cancel).not.toHaveBeenCalled()
  } finally { await dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() }
})
