import { readFileSync } from 'node:fs'
import { runInNewContext, Script } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { patchBetterSidebarEditor as patch } from '../scripts/lib/patch-sherlock-better-sidebar.mjs'

const original = readFileSync('build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client-editor.js', 'utf8')
const source = patch(original)
const start = source.indexOf('const save = () => {'), end = source.indexOf('\n\t\tconst markdown =', start)
if (start < 0 || end < start) throw Error('Real TextEditor save boundary missing')

function fixture() {
  const state = { draft: 'original\nmarker' as string | null, dirty: true, saveState: 'idle' }
  let document = 'original\nmarker'
  const view = { state: { doc: { toString: () => document } } }
  const viewRef = { current: view as typeof view | null }, savingRef = { current: false }
  const writes: Array<{ text: string; resolve(): void; reject(error: Error): void }> = []
  const save = runInNewContext(source.slice(start, end) + '\nsave', {
    viewRef, savingRef, scope: { sessionId: 'session-a' }, path: 'a.md',
    props: {},
    setDraft: (value: string | null) => { state.draft = value },
    setDirty: (value: boolean) => { state.dirty = value },
    setSaveState: (value: string) => { state.saveState = value },
    api: { fsWrite: (_scope: unknown, _path: string, text: string) => new Promise<void>((resolve, reject) => writes.push({ text, resolve, reject })) }
  }) as () => void
  return { state, viewRef, savingRef, writes, save,
    edit(text: string) { document = text; state.draft = text; state.dirty = true },
    preview: () => runInNewContext('draft ?? content ?? \"\"', { draft: state.draft, content: 'original' }) }
}
const settle = async () => { await Promise.resolve(); await Promise.resolve() }

describe('Files TextEditor save and preview', () => {
  it('previews the successfully saved document without reopening, and permits a later save', async () => {
    const f = fixture(); f.save(); f.save()
    expect(f.writes).toHaveLength(1)
    f.writes[0]!.resolve(); await settle()
    expect(f.preview()).toBe(f.writes[0]!.text)
    expect(f.state).toMatchObject({ dirty: false, saveState: 'saved' })
    f.edit('second save'); f.save(); f.writes[1]!.resolve(); await settle()
    expect(f.preview()).toBe('second save')
    expect(f.state.dirty).toBe(false)
  })
  it('preserves edits made while the saved snapshot is in flight', async () => {
    const f = fixture(); f.save(); f.edit('original\nmarker\nnew unsaved text')
    f.writes[0]!.resolve(); await settle()
    expect(f.writes[0]!.text).toBe('original\nmarker')
    expect(f.preview()).toBe('original\nmarker\nnew unsaved text')
    expect(f.state).toMatchObject({ dirty: true, saveState: 'idle' })
  })
  it('retains draft and dirty state on failure and allows retry', async () => {
    const f = fixture(); f.save(); f.writes[0]!.reject(Error('disk unavailable')); await settle()
    expect(f.state).toEqual({ draft: 'original\nmarker', dirty: true, saveState: 'failed' })
    f.save(); expect(f.writes).toHaveLength(2)
  })
  it.each(['resolve', 'reject'] as const)('ignores an old file completion (%s), including its save lock', async (outcome) => {
    const f = fixture(); f.save()
    f.viewRef.current = { state: { doc: { toString: () => 'new file' } } }
    Object.assign(f.state, { draft: 'new file', dirty: true, saveState: 'saving' })
    // The replacement editor has started its own save; the old completion
    // must neither unlock it nor change its draft/toolbar state.
    if (outcome === 'resolve') f.writes[0]!.resolve(); else f.writes[0]!.reject(Error('old write failed'))
    await settle()
    expect(f.state).toEqual({ draft: 'new file', dirty: true, saveState: 'saving' })
    expect(f.savingRef.current).toBe(true)
  })
  it('keeps the real chunk parseable and the installation transform idempotent', () => {
    expect(() => new Script(source)).not.toThrow()
    expect(patch(source)).toBe(source)
    expect(source.includes('savingRef.current = false;\n\t\t\t\tviewRef.current = null;')).toBe(true)
  })
  it('releases a destroyed editor lock before the next file can save', () => {
    const at = source.indexOf('view.destroy();\n\t\t\t\tsavingRef.current = false;')
    const end = source.indexOf('\n\t\t\t};', at)
    const f = fixture(); f.save()
    let destroyed = false
    runInNewContext(source.slice(at, end), {
      view: { destroy: () => { destroyed = true } },
      viewRef: f.viewRef, savingRef: f.savingRef, themeCompRef: { current: {} }
    })
    expect(destroyed).toBe(true)
    expect(f.viewRef.current).toBeNull()
    expect(f.savingRef.current).toBe(false)
  })
})
