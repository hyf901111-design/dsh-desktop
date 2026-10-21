import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import * as Y from 'yjs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NotesStore } from '../src/main/notes/store'
import { noteOutline, canApplySuggestion, restoreNoteDraft, noteSuggestionPreview } from '../src/shared/workspace-notes'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
const setup = () => { const root = mkdtempSync(join(tmpdir(), 'ework-notes-test-')); roots.push(root); return { root, store: new NotesStore(root) } }
const content = (text: string) => ({ title: '每周研究笔记', blocks: [{ id: 'p1', type: 'paragraph', content: [{ type: 'text', text, styles: {} }], children: [] }], yjs: '' })

it('persists rich blocks and comments across a fresh store instance', () => {
  const { root, store } = setup()
  const rich = { ...content('已保存'), yjs: 'AQID', blocks: [...content('已保存').blocks, { id: 'chart1', type: 'research', props: { payload: '{"kind":"generated-container","containerSpec":{"type":"chart"}}' } }] }
  const saved = store.save('owner', 'session', 0, rich)
  expect(saved.status).toBe('saved')
  const loaded = new NotesStore(root).load('owner', 'session')
  expect(loaded.saved).toMatchObject({ revision: 1, ...rich })
})

it('keeps separate accounts and sessions separate even when identifiers contain paths', () => {
  const { store } = setup()
  store.save('owner1', '../session', 0, content('A'))
  expect(store.load('owner2', '../session').saved.blocks).toEqual([])
  expect(store.load('owner1', 'session2').saved.blocks).toEqual([])
  expect(store.load('owner1', '../session').saved.title).toBe('每周研究笔记')
})

it('rejects stale saves without replacing the newer document or losing the stale draft', () => {
  const { store } = setup()
  store.save('owner', 'session', 0, content('较新内容'))
  store.draft('owner', 'session', 'window-a', 0, content('旧窗口修改'))
  const result = store.save('owner', 'session', 0, content('旧窗口修改'), 'window-a')
  expect(result.status).toBe('conflict')
  expect(store.load('owner', 'session').saved.blocks).toEqual(content('较新内容').blocks)
  expect(store.load('owner', 'session').draft?.blocks).toEqual(content('旧窗口修改').blocks)
})

it('recovers an interrupted edit and removes only its matching draft after saving', () => {
  const { root, store } = setup()
  store.draft('owner', 'session', 'window-a', 0, content('尚未保存'))
  expect(new NotesStore(root).load('owner', 'session').draft?.title).toBe('每周研究笔记')
  store.save('owner', 'session', 0, content('尚未保存'), 'window-a')
  expect(store.load('owner', 'session').draft).toBeUndefined()
})

it('cannot clear another window recovery draft when saving a different edit', () => {
  const { store } = setup()
  store.draft('owner', 'session', 'window-a', 0, content('A'))
  store.draft('owner', 'session', 'window-b', 0, content('B'))
  store.save('owner', 'session', 0, content('A'), 'window-a')
  expect(store.load('owner', 'session').draft?.blocks).toEqual(content('B').blocks)
})

it('rejects malformed or excessively large documents before altering saved data', () => {
  const { store } = setup()
  store.save('owner', 'session', 0, content('保留'))
  expect(() => store.save('owner', 'session', 1, { ...content('x'), blocks: 'invalid' } as any)).toThrow()
  expect(() => store.save('owner', 'session', 1, content('x'.repeat(5 * 1024 * 1024)))).toThrow()
  expect(store.load('owner', 'session').saved.blocks).toEqual(content('保留').blocks)
})

it('updates the directory from nested headings and retains stable block identities', () => {
  const blocks = [{ id: 'a', type: 'heading', props: { level: 1 }, content: [{ text: '本周观察' }], children: [{ id: 'b', type: 'heading', props: { level: 4 }, content: [{ text: '来源记录' }] }] }, { id: 'c', type: 'paragraph', content: [{ text: '正文' }] }]
  expect(noteOutline(blocks)).toEqual([{ id: 'a', level: 1, text: '本周观察' }, { id: 'b', level: 4, text: '来源记录' }])
})

it('does not apply late AI suggestions to another session or an edited selection', () => {
  const captured = { documentId: 'one', fingerprint: 'old' }
  expect(canApplySuggestion(captured, { documentId: 'one', fingerprint: 'old' })).toBe(true)
  expect(canApplySuggestion(captured, { documentId: 'two', fingerprint: 'old' })).toBe(false)
  expect(canApplySuggestion(captured, { documentId: 'one', fingerprint: 'new' })).toBe(false)
})

it('promotes a recovered draft to the saved revision before reporting recovery complete', async () => {
  const { root, store } = setup()
  store.save('owner', 'session', 0, content('旧正文'))
  store.draft('owner', 'session', 'window-a', 1, content('恢复正文'))
  const bridge = { request: async (_method: string, input: any) => store.save('owner', input.sessionId, input.revision, input.content, input.clientId), draft: async () => {} }
  const restored = await restoreNoteDraft(bridge, 'session', store.load('owner', 'session'))
  expect(restored.saved.revision).toBe(2)
  expect(new NotesStore(root).load('owner', 'session')).toEqual(restored)
  expect(restored.saved.blocks).toEqual(content('恢复正文').blocks)
  expect(restored.draft).toBeUndefined()
})

it('does not silently restore over a save that arrived after the recovery comparison', async () => {
  const { store } = setup()
  store.draft('owner', 'session', 'window-a', 0, content('草稿'))
  const comparison = store.load('owner', 'session')
  store.save('owner', 'session', 0, content('另一窗口的新正文'))
  const bridge = { request: async (_method: string, input: any) => store.save('owner', input.sessionId, input.revision, input.content, input.clientId), draft: async () => {} }
  await expect(restoreNoteDraft(bridge, 'session', comparison)).rejects.toThrow('较新')
  expect(store.load('owner', 'session').draft?.blocks).toEqual(content('草稿').blocks)
})

it('keeps the original selection baseline when a component request falls back to text', () => {
  const captured = { fingerprint: 'original', text: '选区', from: 12, to: 14, cursor: 'p1' }
  const preview = noteSuggestionPreview({ kind: 'text', markdown: '资料不足' }, captured)
  expect(preview).toMatchObject({ from: 12, to: 14, selectedText: '选区' })
  expect(canApplySuggestion({ documentId: 'session', fingerprint: preview.fingerprint }, { documentId: 'session', fingerprint: 'edited while creating component' })).toBe(false)
})

function challengeMetadataSnapshots() {
  const doc = new Y.Doc(), threads = doc.getMap<Y.Map<any>>('threads'), thread = new Y.Map<any>()
  doc.getMap('note-challenge').set('level', 2)
  thread.set('metadata', { kind:'ework-challenge-v1', draft:'' }); threads.set('math', thread)
  let observed = ''
  const encode = () => Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')
  const collect = () => { observed = encode() }
  threads.observeDeep(collect)
  thread.set('metadata', { kind:'ework-challenge-v1', draft:'保留这份未发送回复' })
  threads.unobserveDeep(collect)
  const settled = encode()
  return { doc, thread, observed, settled, encode }
}

it('clears a matching comment draft after autosave even when observer and settled Yjs encodings differ', () => {
  const { root, store } = setup(), state = challengeMetadataSnapshots()
  try {
    expect(state.observed).not.toBe(state.settled)
    store.draft('owner','session','window-a',0,{...content('正文未改变'),yjs:state.observed})
    store.save('owner','session',0,{...content('正文未改变'),yjs:state.settled},'window-a')
    const persisted = JSON.parse(readFileSync(join(root,readdirSync(root)[0]!), 'utf8'))
    expect(persisted.drafts).toEqual([])
    expect(new NotesStore(root).load('owner','session').draft).toBeUndefined()
    expect(persisted.saved.yjs).toBe(state.settled)
  } finally { state.doc.destroy() }
})

it('ignores an older equivalent raw Yjs draft on restart without rewriting stored notes', () => {
  const { root, store } = setup(), state = challengeMetadataSnapshots()
  try {
    store.save('owner','session',0,{...content('正文未改变'),yjs:state.settled})
    store.draft('owner','session','old-window',0,{...content('正文未改变'),yjs:state.observed})
    const path = join(root,readdirSync(root)[0]!), before = readFileSync(path, 'utf8')
    const loaded = new NotesStore(root).load('owner','session')
    expect(loaded.draft).toBeUndefined()
    expect(loaded.saved.yjs).toBe(state.settled)
    expect(readFileSync(path, 'utf8')).toBe(before)
  } finally { state.doc.destroy() }
})

it.each(['reply','level','body'] as const)('retains genuine %s changes in a recovery draft despite matching other note state', change => {
  const { root, store } = setup(), state = challengeMetadataSnapshots()
  try {
    store.save('owner','session',0,{...content('正文未改变'),yjs:state.settled})
    if (change === 'reply') state.thread.set('metadata',{kind:'ework-challenge-v1',draft:'另一份不能丢失的回复'})
    if (change === 'level') state.doc.getMap('note-challenge').set('level',3)
    const changed = {...content(change === 'body' ? '正文真实改变' : '正文未改变'), yjs:state.encode()}
    store.draft('owner','session','window-a',1,changed)
    expect(new NotesStore(root).load('owner','session').draft).toMatchObject(changed)
  } finally { state.doc.destroy() }
})

it('preserves a differing opaque Yjs draft if its update cannot be decoded safely', () => {
  const { store } = setup()
  store.save('owner','session',0,{...content('正文未改变'),yjs:'AQID'})
  store.draft('owner','session','window-a',1,{...content('正文未改变'),yjs:'BAUG'})
  expect(store.load('owner','session').draft?.yjs).toBe('BAUG')
})
