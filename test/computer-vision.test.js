import { describe, expect, it, vi } from 'vitest'
import { requireComputerVision } from '../packages/dsh-research-task-runtime/computer-use-tools.js'

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
