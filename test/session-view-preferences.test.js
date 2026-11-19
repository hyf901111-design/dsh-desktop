import { readFile } from 'node:fs/promises'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { patchSessionViewPreferences, patchNewChatSessionRuntime, patchNewChatSidebar } from '../scripts/lib/session-view-preferences.mjs'
import { installKnowledgeSourceNavigation } from '../scripts/lib/knowledge-client.mjs'
import { ResearchCanvasStorage } from '../src/main/state/research-canvas-storage'

const require = createRequire(import.meta.url)
const React = require('react'), { act, createElement: h } = React
const { createRoot } = require('react-dom/client')
const directories = []
afterEach(() => { vi.unstubAllGlobals(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function desktopStorage() {
  const directory = mkdtempSync(join(tmpdir(), 'ework-session-tabs-'))
  directories.push(directory)
  return { directory, storage: new ResearchCanvasStorage(directory) }
}

async function fixture({ storage, port = 4100, local = {} } = {}) {
  const win = new Window({ url: `http://127.0.0.1:${port}/` })
  for (const [key, value] of Object.entries(local)) win.localStorage.setItem(key, value)
  if (storage) Object.assign(win, { dshDesktop: { researchCanvasStorage: storage } })
  for (const [key, value] of Object.entries({ window: win, document: win.document, HTMLElement: win.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value)
  const fake = new Proxy(function () {}, { get: () => fake, apply: () => fake, construct: () => ({}) })
  let runtime
  async function load(name, expose = []) {
    let source = await readFile(`node_modules/@deepseek-ai/${name}/lib/client.js`, 'utf8')
    if (name === 'dsh-client-ui-conversation') source = patchSessionViewPreferences(source)
    source = source.replace('\t\texports.apply = apply;', '\t\texports.apply = apply;\n' + expose.map(name => `exports.${name}=${name};`).join('\n'))
    let descriptor
    win.__ModuleLoader__ = { load: value => { descriptor = value } }
    runInNewContext(source, { window: win, document: win.document, navigator: win.navigator, localStorage: win.localStorage, sessionStorage: win.sessionStorage, CustomEvent: win.CustomEvent, MutationObserver: win.MutationObserver, TextEncoder, TextDecoder, URL, AbortController, queueMicrotask, setTimeout, clearTimeout, console })
    return descriptor.factory(id => {
      if (id === '@deepseek-ai/dsh-client-runtime/client') return runtime
      if (['react', 'react-dom', 'react/jsx-runtime'].includes(id)) return require(id)
      return fake
    })
  }
  runtime = await load('dsh-client-runtime')
  const client = await load('dsh-client-ui-conversation', ['createChatStore', 'ConversationSession', 'ConversationSessionHeader'])
  const handle = client.createChatStore(), instances = new Map()
  const get = id => { if (!instances.has(id)) instances.set(id, handle.create(id)); return instances.get(id) }
  const host = win.document.createElement('main'); win.document.body.append(host)
  const root = createRoot(host)
  const tabs = ['chat', 'research', 'notes', 'trajectory', 'spreadsheet']
  const views = { subscribe: () => () => {}, version: () => 1, list: () => tabs.map(id => ({ id, label: id })) }
  const useSession = select => select({ blank: true, composerPhase: 'blank' })
  const renderSlot = (_name, _props, options) => options ? h('div', { 'data-rendered-view': options.only }) : null
  const input = { draft: 'unsent composer draft', imageIds: ['draft-image'] }
  const inputActions = { setDraft: value => { input.draft = value } }
  const bindDraftMirror = () => () => {}
  const release = () => {}
  function Screen({ id }) {
    const store = get(id)
    const useStore = select => select(React.useSyncExternalStore(store.subscribe, store.getSnapshot))
    const props = { sessionId: id, useStore, actions: store.actions, useSession, views, renderSlot }
    return h(React.Fragment, null,
      h(client.ConversationSessionHeader, { ...props, useSessions: select => select({ byId: { [id]: { id, displayTitle: id, origin: 'root', updatedAt: 123 } } }), open: () => {}, rename: () => {}, t: key => key }),
      h(client.ConversationSession, { ...props, useInput: select => select(input), inputActions, bindDraftMirror, releaseSessionImages: release, releaseResearchWorkspace: release }))
  }
  let recencyEvents = 0
  win.document.addEventListener('sherlock-sidebar-recency', () => recencyEvents++)
  return {
    win, host, handle, get, input,
    open: async id => { await act(async () => root.render(h(Screen, { id, key: id }))) },
    select: async id => { await act(async () => host.querySelector(`[data-conversation-view-id="${id}"]`).click()); await win.happyDOM.whenAsyncComplete() },
    active: () => host.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-conversation-view-id'),
    recency: () => recencyEvents,
    close: async () => { win.dispatchEvent(new win.Event('pagehide')); await act(async () => root.unmount()); win.happyDOM.abort() }
  }
}

it('opens knowledge modes on their retained native view before exposing the session', async () => {
  const f = await fixture()
  const { win } = f
  const byId = { A: { title: '可跨模式打开的会话' }, B: { title: '其他会话' } }
  const modesAtOpen = []
  let rendering
  const dispose = installKnowledgeSourceNavigation({
    document: win.document,
    sessions: {
      list: { getSnapshot: () => ({ byId }) }, subagentAddress: () => undefined,
      open: id => { modesAtOpen.push(f.get(id).getSnapshot().view); rendering = f.open(id) }
    },
    selectView: (id, view) => f.get(id).actions.setView(view)
  })
  try {
    await f.open('A')
    await f.select('notes')
    await f.open('B')
    for (const view of ['research', 'spreadsheet', 'notes', 'research']) {
      const request = new win.CustomEvent('sherlock:knowledge-source-open', {
        detail: { id: 'A', requestId: 'category-' + view, view }, cancelable: true
      })
      win.document.dispatchEvent(request)
      await rendering
      expect(modesAtOpen.at(-1)).toBe(view)
      expect(f.active()).toBe(view)
      expect(f.host.querySelector('[data-rendered-view]')?.getAttribute('data-rendered-view')).toBe(view)
    }
    expect(f.get('B').getSnapshot().view).toBeNull()
    expect(f.input.draft).toBe('unsent composer draft')
  } finally { dispose(); await f.close() }
})

it.each(['chat', 'research', 'notes', 'trajectory'])('restores %s for A after B, new Chat and new Research without changing drafts or activity', async tab => {
  const { storage } = desktopStorage(), f = await fixture({ storage })
  try {
    await f.open('A'); await f.select(tab)
    f.get('A').actions.setDraft('A saved draft')
    await f.open('B'); await f.select('trajectory'); await f.open('A'); expect(f.active()).toBe(tab)
    await f.open('new-chat'); expect(f.active()).toBe('chat')
    await f.open('A'); expect(f.active()).toBe(tab)
    f.win.sessionStorage.setItem('sherlock.conversation.initial-research-session.v1', 'new-research')
    await f.open('new-research'); expect(f.active()).toBe('research')
    await f.open('A'); expect(f.active()).toBe(tab)
    expect(f.get('A').getSnapshot().draft).toBe('A saved draft')
    expect(f.input).toEqual({ draft: 'unsent composer draft', imageIds: ['draft-image'] })
    expect(f.recency()).toBe(0)
  } finally { await f.close() }
})

it.each(['chat', 'notes', 'trajectory'])('does not overwrite the explicit saved %s tab with a blank Research recovery default', async tab => {
  const f = await fixture({ local: {
    'ework.session.view.v1:A': tab,
    'dsh.conversation.chat.A': JSON.stringify({ view: tab, draft: 'preserved', selection: null }),
    'sherlock.research.session-engaged.v1:A': '1'
  } })
  try {
    await f.open('A')
    expect(f.active()).toBe(tab)
    expect(f.get('A').getSnapshot().view).toBe(tab)
    expect(f.get('A').getSnapshot().draft).toBe('preserved')
  } finally { await f.close() }
})

it('recovers a legacy Research canvas when chat was only the old native default', async () => {
  const { storage } = desktopStorage()
  storage.setItem('sherlock.research.session-engaged.v1:A', '1')
  const f = await fixture({ storage, local: {
    'dsh.conversation.chat.A': JSON.stringify({ view: 'chat', draft: 'untouched draft', selection: null })
  } })
  try {
    expect(f.get('A').getSnapshot().view).toBe('chat')
    expect(storage.getItem('ework.session.view.v1:A')).toBeNull()
    await f.open('A'); expect(f.active()).toBe('research')
    expect(f.get('A').getSnapshot().draft).toBe('untouched draft')
    await f.select('chat'); await f.open('B'); await f.open('A')
    expect(f.active()).toBe('chat')
    expect(storage.getItem('ework.session.view.v1:A')).toBe('chat')
  } finally { await f.close() }
})

it('restores independent tabs after a desktop restart on a different origin', async () => {
  const { directory, storage } = desktopStorage(), first = await fixture({ storage })
  try { await first.open('A'); await first.select('notes'); await first.open('B'); await first.select('trajectory') } finally { await first.close() }
  const restarted = await fixture({ storage: new ResearchCanvasStorage(directory), port: 5200 })
  try {
    await restarted.open('B'); expect(restarted.active()).toBe('spreadsheet')
    await restarted.open('A'); expect(restarted.active()).toBe('notes')
    await restarted.open('fresh'); expect(restarted.active()).toBe('chat')
  } finally { await restarted.close() }
})

it('migrates the native session preference without copying drafts or a root-global tab into other sessions', async () => {
  const { directory, storage } = desktopStorage()
  const original = { view: 'notes', draft: 'keep this draft', selection: { callId: 'saved-call' }, inspect: { callId: 'inspect-call' } }
  const first = await fixture({ storage, local: {
    'dsh.conversation.chat.A': JSON.stringify(original),
    'dsh.conversation.chat': JSON.stringify({ view: 'trajectory' })
  } })
  try {
    expect(first.get('A').getSnapshot()).toEqual(original)
    await first.open('new-chat'); expect(first.active()).toBe('chat')
    const key = 'dsh.conversation.chat.A'
    expect(JSON.parse(first.win.localStorage.getItem(key))).toEqual(original)
  } finally { await first.close() }
  const restarted = await fixture({ storage: new ResearchCanvasStorage(directory), port: 5300 })
  try { await restarted.open('A'); expect(restarted.active()).toBe('notes') } finally { await restarted.close() }
})

it('migrates an origin-only tab when desktop storage becomes available', async () => {
  const { directory, storage } = desktopStorage(), key = 'ework.session.view.v1:A'
  const first = await fixture({ storage, local: { [key]: 'notes' } })
  try { await first.open('A'); expect(first.active()).toBe('notes'); expect(storage.getItem(key)).toBe('notes') } finally { await first.close() }
  const restarted = await fixture({ storage: new ResearchCanvasStorage(directory), port: 5400 })
  try { await restarted.open('A'); expect(restarted.active()).toBe('notes') } finally { await restarted.close() }
})

it('does not resurrect a cleared preference from another origin stale native snapshot', async () => {
  const { storage } = desktopStorage(), key = 'ework.session.view.v1:A'
  storage.setItem(key, '')
  const f = await fixture({ storage, local: { 'dsh.conversation.chat.A': JSON.stringify({ view: 'notes', draft: 'preserved draft' }) } })
  try {
    expect(f.get('A').getSnapshot().view).toBeNull()
    expect(f.get('A').getSnapshot().draft).toBe('preserved draft')
    expect(storage.getItem(key)).toBe('')
  } finally { await f.close() }
})

it('migrates an origin-only clearing marker before a later port can restore an old tab', async () => {
  const { directory, storage } = desktopStorage(), key = 'ework.session.view.v1:A'
  const first = await fixture({ storage, local: { [key]: '' } })
  try { first.get('A'); expect(storage.getItem(key)).toBe('') } finally { await first.close() }
  const restarted = await fixture({ storage: new ResearchCanvasStorage(directory), port: 5500,
    local: { 'dsh.conversation.chat.A': JSON.stringify({ view: 'notes', draft: 'keep draft' }) } })
  try { expect(restarted.get('A').getSnapshot()).toEqual({ view: null, draft: 'keep draft' }) } finally { await restarted.close() }
})

it('keeps navigation available on storage failure and clears only the removed session preference', async () => {
  const failure = () => { throw Error('disk unavailable') }
  const f = await fixture({ storage: { getItem: failure, setItem: failure } })
  try {
    await f.open('A'); await f.select('notes'); await f.open('B'); await f.select('trajectory')
    expect(f.handle.create('A').getSnapshot().view).toBe('notes')
    f.get('A').clearPersisted()
    expect(f.handle.create('A').getSnapshot().view).toBeNull()
    expect(f.handle.create('B').getSnapshot().view).toBe('trajectory')
    expect(f.recency()).toBe(0)
  } finally { await f.close() }
})

it.each(['reject', 'throw'])('retains the newer choice when desktop saving %s with an older preference present', async failure => {
  const { storage } = desktopStorage(), key = 'ework.session.view.v1:A'
  storage.setItem(key, 'chat')
  let unavailable = true
  const bridge = {
    getItem: key => storage.getItem(key),
    setItem: (key, value) => { if (!unavailable) return storage.setItem(key, value); if (failure === 'throw') throw Error('disk unavailable'); return false }
  }
  const first = await fixture({ storage: bridge })
  let local
  try {
    await first.open('A'); await first.select('notes')
    expect(first.handle.create('A').getSnapshot().view).toBe('notes')
    local = Object.fromEntries(Array.from({ length: first.win.localStorage.length }, (_, index) => {
      const key = first.win.localStorage.key(index); return [key, first.win.localStorage.getItem(key)]
    }))
  } finally { await first.close() }
  unavailable = false
  const reopened = await fixture({ storage: bridge, local })
  try { await reopened.open('A'); expect(reopened.active()).toBe('notes'); expect(storage.getItem(key)).toBe('notes') } finally { await reopened.close() }
  storage.setItem(key, 'trajectory')
  const otherWindow = await fixture({ storage: bridge, local })
  try { await otherWindow.open('A'); expect(otherWindow.active()).toBe('trajectory') } finally { await otherWindow.close() }
})

it('keeps existing defaults and lets an explicit new Research request win over a stored tab', async () => {
  const f = await fixture({ local: { 'sherlock.research.session-engaged.v1:old-research': '1' } })
  try {
    await f.open('old-research'); expect(f.active()).toBe('research')
    f.get('new-research').actions.setView('notes')
    f.win.sessionStorage.setItem('sherlock.conversation.initial-research-session.v1', 'new-research')
    await f.open('new-research'); expect(f.active()).toBe('research')
    await f.select('trajectory'); await f.open('other'); await f.open('new-research')
    expect(f.active()).toBe('trajectory')
  } finally { await f.close() }
})

it('applies the production bundle patch idempotently and rejects missing recovery anchors', async () => {
  const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  const patched = patchSessionViewPreferences(source)
  expect(patchSessionViewPreferences(patched)).toBe(patched)
  expect(() => patchSessionViewPreferences('function createChatStore() {}')).toThrow('recovery anchors')
})

it('paints rapid tab choices before a coalesced desktop save and flushes the last choice on page exit', async () => {
  const { storage } = desktopStorage(), set = vi.spyOn(storage,'setItem');
  const f = await fixture({storage});
  try {
    await f.open('A'); const instance=f.get('A'); set.mockClear();
    await act(async()=>{instance.actions.setView('notes');instance.actions.setView('research');instance.actions.setView('chat')});
    expect(f.active()).toBe('chat');expect(set).not.toHaveBeenCalled();
    expect(JSON.parse(f.win.localStorage.getItem('ework.session.view.v1:A.pending-native')).view).toBe('chat');
    await f.win.happyDOM.whenAsyncComplete();expect(set).toHaveBeenCalledTimes(1);expect(storage.getItem('ework.session.view.v1:A')).toBe('chat');
    await act(async()=>instance.actions.setView('notes'));
    expect(JSON.parse(f.win.localStorage.getItem('ework.session.view.v1:A.pending-native')).previous).toBe('chat');
    f.win.dispatchEvent(new f.win.Event('pagehide'));expect(storage.getItem('ework.session.view.v1:A')).toBe('notes');
    await act(async()=>instance.actions.setView('research'));
    storage.setItem('ework.session.view.v1:A','trajectory');
    expect(f.handle.create('A').getSnapshot().view).toBe('trajectory');
    await f.win.happyDOM.whenAsyncComplete();expect(storage.getItem('ework.session.view.v1:A')).toBe('trajectory');
  } finally { await f.close() }
})

it('installs one lifecycle-owned Chat intent and strictly preserves each real scoped projection on reentry', async () => {
  const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),patched=patchSessionViewPreferences(source)
  expect(patchSessionViewPreferences(patched)).toBe(patched)
  expect(patched.split('/* ework:initial-chat-view-intent:v1 */')).toHaveLength(2)
  expect(patched.split('const storedView = useInitialChatSessionView(sessionId, useStore((s) => s.view), actions);')).toHaveLength(3)
  expect(()=>patchSessionViewPreferences(patched+'\n/* ework:initial-chat-view-intent:v1 */')).toThrow(/intent hook drifted/)
  const broken = patched.replace(
    'installInitialChatViewIntent(chatStore, sessions, researchWorkspaces, recordNewChatActivity), "ui-conversation:',
    'installInitialChatViewIntent(chatStore, missing, researchWorkspaces, recordNewChatActivity), "ui-conversation:'
  )
  expect(broken).not.toBe(patched)
  expect(() => patchSessionViewPreferences(broken)).toThrow(/intent hook drifted/)
})

it('filters only explicit New Chat reuse in native entry/runtime installers and rejects partial reentry',async()=>{
 const runtime=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'),sidebar=await readFile('node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js','utf8')
 const r=patchNewChatSessionRuntime(runtime),s=patchNewChatSidebar(sidebar)
 expect(patchNewChatSessionRuntime(r)).toBe(r);expect(patchNewChatSidebar(s)).toBe(s)
 expect(s).toContain('new CustomEvent("sherlock:conversation-initial-research", { detail: { sessionId, newResearch: true } })')
 expect(()=>patchNewChatSessionRuntime(r+'\n/* ework:new-chat-reuse-filter:v1 */')).toThrow(/hook drifted/)
 expect(()=>patchNewChatSessionRuntime(r.replace('typeof canReuse !== "function"','typeof missingReuse !== "function"'))).toThrow(/hook drifted/)
 expect(()=>patchNewChatSidebar(s+'\n/* ework:sidebar-new-chat-reuse:v1 */')).toThrow(/hook drifted/)
 expect(()=>patchNewChatSidebar(s.replace('canReuse(id) === true','canReuse(id) !== false'))).toThrow(/hook drifted/)
})
