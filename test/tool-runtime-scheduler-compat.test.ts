import { describe, expect, it, vi } from 'vitest'
import { resolveToolRuntimeScheduler } from '@deepseek-ai/dsh-agent-loop'

function scheduler() {
  return {
    prepare: vi.fn(),
    dispatch: vi.fn(),
    finalize: vi.fn(),
    finish: vi.fn()
  }
}

describe('agent loop tool scheduler compatibility', () => {
  it('uses a scheduler published by another dsh-tools module instance', () => {
    const foreignScheduler = scheduler()
    const registry = {
      [Symbol('@deepseek-ai/dsh-tools.scheduler')]: foreignScheduler
    }

    expect(resolveToolRuntimeScheduler(registry)).toBe(foreignScheduler)
  })

  it('fails explicitly when no compatible scheduler is available', () => {
    expect(() => resolveToolRuntimeScheduler({})).toThrow(
      'tool runtime scheduler is unavailable'
    )
  })
})
