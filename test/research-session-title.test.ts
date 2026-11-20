import { expect, it, vi } from 'vitest'
import { watchResearchSessionTitle } from '../src/preload/research-session-title'

it('sends component titles after manual insertion and generation, ignoring canvas-only movements', async () => {
  vi.useFakeTimers()
  let artifacts: Array<Record<string, unknown>> = []
  let changed = () => {}
  const fetch = vi.fn(async (_url: string, options: RequestInit) => ({
    ok: true,
    json: async () => ({ automatic: true, body: options.body })
  }))
  const win = {
    fetch, setTimeout, clearTimeout,
    document: { documentElement: { dataset: { odysseyLocale: 'zh' } } }
  } as unknown as Window
  const stop = watchResearchSessionTitle(win, 'board', {
    getSnapshot: () => ({ files: [], artifacts }),
    subscribe(listener) { changed = listener; return () => {} }
  }, () => true)
  const sent = () => fetch.mock.calls.map(([, options]) => JSON.parse(String(options.body)).components)
  try {
    await vi.advanceTimersByTimeAsync(250)
    expect(sent()).toEqual([[]])

    artifacts = [{ kind: 'generated-container', title: '沪深300行情', containerSpec: { type: 'financial-widget' } }]
    changed()
    await vi.advanceTimersByTimeAsync(250)
    expect(sent()).toEqual([[], ['沪深300行情']])

    artifacts = [...artifacts.map(node => ({ ...node, x: 12 })), { kind: 'generated-container', title: '智能容器', generationStatus: 'running' }]
    changed()
    await vi.advanceTimersByTimeAsync(250)
    expect(fetch).toHaveBeenCalledTimes(2)

    artifacts = [...artifacts.slice(0, -1), {
      kind: 'generated-container', title: '智能容器', generationStatus: 'completed',
      containerSpec: { type: 'chart', title: '股息率趋势' }
    }]
    changed()
    await vi.advanceTimersByTimeAsync(250)
    expect(sent()).toEqual([[], ['沪深300行情'], ['沪深300行情', '股息率趋势']])
  } finally {
    stop()
    vi.useRealTimers()
  }
})
