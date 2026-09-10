import { readFile } from 'node:fs/promises'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { patchBetterSidebarClient, sherlockResearchGenerationOwnsFocus } from '../scripts/lib/patch-sherlock-better-sidebar.mjs'

const source = await readFile(new URL('../build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js', import.meta.url), 'utf8')
const patched = patchBetterSidebarClient(source)
const start = patched.indexOf('const listBaselineRef = ')
const end = patched.indexOf('\n\t\t\t/**', start)
if (start < 0 || end < 0) throw Error('Better Sidebar automatic subagent effect missing')
const effect = new Function('react', 'sessionId', 'sessionList', 'store', 'ctx', 't', 'detectNewDirectSubagent', 'firstLeaf', 'togglePanel', 'sherlockResearchGenerationOwnsFocus', patched.slice(start, end))

function scenario(status: string | null, pinned = true, hasNewChild = true) {
  const win = new Window()
  if (status) win.document.body.innerHTML = `<div data-research-canvas><article data-research-generation-state="${status}"></article></div>`
  let state: any = { panelOpen: true, activePane: 'right', splits: { kind: 'leaf', id: 'right', active: 'sherlock-research-conversation', tabs: [{ id: 'sherlock-research-conversation', meta: { sherlockPinned: pinned } }] } }
  const previous = { byId: {} }, next = { byId: { child: { origin: 'subagent', parentId: 'parent' } } }
  const baseline = { current: previous }
  const openTab = vi.fn(tab => { state.splits.active = tab.type })
  const store = { getSnapshot: () => ({ state }), getPrefs: () => ({ autoOpenSubagent: true }), reduce: vi.fn(reducer => { state = reducer(state) }) }
  const ctx = { betterSidebar: { isTabEnabled: () => true, openTab } }
  effect({ useRef: () => baseline, useEffect: (fn: () => void) => fn() }, 'parent', next, store, ctx, (key: string) => key, () => hasNewChild, (tree: any) => tree, (s: any) => ({ ...s, panelOpen: !s.panelOpen }), (s: any) => sherlockResearchGenerationOwnsFocus(s, win.document))
  return { state, openTab, store, baseline, next, win }
}

describe('Research generation preserves conversation during automatic subagent detection', () => {
  it.each(['queued', 'running'])('keeps the dialogue/input tab for a %s canvas task while manual Tasks still opens', async status => {
    const s = scenario(status)
    expect(s.state.splits.active).toBe('sherlock-research-conversation')
    expect(s.openTab).not.toHaveBeenCalled()
    expect(s.store.reduce).not.toHaveBeenCalled()
    expect(s.baseline.current).toBe(s.next)
    s.openTab({ type: 'subagent' })
    expect(s.state.splits.active).toBe('subagent')
    await s.win.happyDOM.close()
  })

  it.each([null, 'draft', 'completed', 'failed', 'cancelled'])('preserves ordinary subagent auto-open without an active canvas task (%s)', async status => {
    const s = scenario(status)
    expect(s.openTab).toHaveBeenCalledOnce()
    expect(s.state.splits.active).toBe('subagent')
    await s.win.happyDOM.close()
  })

  it('does not suppress normal conversation after Research has released its pinned tab', async () => {
    const s = scenario('running', false)
    expect(s.openTab).toHaveBeenCalledOnce()
    await s.win.happyDOM.close()
  })

  it('keeps the existing no-new-child baseline behavior and patches idempotently', async () => {
    const s = scenario(null, true, false)
    expect(s.openTab).not.toHaveBeenCalled()
    expect(patchBetterSidebarClient(patched)).toBe(patched)
    expect(patched.match(/if \(sherlockResearchGenerationOwnsFocus\(store.getSnapshot\(\).state\)\) return;/g)).toHaveLength(1)
    await s.win.happyDOM.close()
  })
})
