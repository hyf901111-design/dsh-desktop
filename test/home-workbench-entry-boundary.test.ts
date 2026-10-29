import { readFile, realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { afterEach, expect, it, vi } from 'vitest'
import * as cordis from '@deepseek-ai/cordis'
import * as slots from '@deepseek-ai/dsh-client-ui-slots'
import Storage from '@deepseek-ai/dsh-storage'
import { JsonStorageBackend } from '@deepseek-ai/dsh-storage-json'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import SessionTitleService from '@deepseek-ai/dsh-session-title'
import { createApiProxy, toFetchHandler } from '@deepseek-ai/dsh-host-apiproxy'
// @ts-expect-error Production JavaScript runtime.
import { BoardDirectories } from '../packages/dsh-research-task-runtime/board-directories.js'
// @ts-expect-error Production JavaScript actor.
import { NativeHomeWorkbenchPortal } from '../scripts/lib/home-guide-workbench-native.mjs'
// @ts-expect-error Shared real Host fixture.
import { workbenchRuntimeFixture } from './fixtures/home-workbench-runtime.js'
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => Object.fromEntries(['StateDot', 'Modal', 'Button', 'IconTrashOutline16', 'Menu', 'IconPlusOutline16', 'IconEllipsisOutline16', 'IconSearchOutline16', 'IconFolderOpenOutline16', 'IconEditOutline16', 'IconTriangleRightFill14'].map(name => [name, () => null])))
import { createResearchBoardsPage } from '../src/preload/research-boards-ui'

const require = createRequire(import.meta.url)
const cleanup: Array<() => unknown | Promise<unknown>> = []
afterEach(async () => { for (const stop of cleanup.splice(0).reverse()) await stop() })

/** No registry/session-list doubles: create/open/rename/attach traverse the Host carrier. */
async function fixture() {
  const host = await workbenchRuntimeFixture()
  cleanup.push(() => host.dispose())
  const base = await realpath(dirname(host.input.cwd)), ctx = host.ctx
  new Storage(ctx)
  const backend = new JsonStorageBackend(join(base, 'workspace-storage'))
  ctx.storage.backend.register('json', backend)
  const domain = new DomainFacility(ctx, { backend: 'json' })
  ctx.provide('storageDomain', domain)
  new SkillRegistry(ctx); new UserQuestionService(ctx)
  new SessionTitleService(ctx, { fallbackMaxWords: 10, fallbackMaxBytes: 100, maxTitleBytes: 256 })
  const hostWorkspaces = new WorkspaceRegistry(ctx)
  await hostWorkspaces[cordis.Service.init]()
  const directories = new BoardDirectories(ctx, join(base, 'profile'))
  cleanup.push(async () => { directories.dispose(); await ctx.fiber.dispose(); await domain.closeAll(); await backend.close() })

  const win = new Window({ url: 'http://localhost:43210' }), doc = win.document
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const oldEvent = Object.getOwnPropertyDescriptor(globalThis, 'Event')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc })
  Object.defineProperty(globalThis, 'Event', { configurable: true, value: win.Event })
  cleanup.push(async () => { await win.happyDOM.abort(); if (oldEvent) Object.defineProperty(globalThis, 'Event', oldEvent); if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else delete (globalThis as any).document })
  const disk = new Map<string, string>()
  ;(win as any).dshDesktop = { researchCanvasStorage: {
    getItem: (key: string) => disk.get(key) ?? null,
    setItem: (key: string, value: string) => { disk.set(key, value); return true }
  } }
  const effectStops: Array<() => void> = []
  const react = new Proxy(require('react'), { get(target, key) {
    // This test stops at Host preparation; full canvas/input rendering is covered in Chromium.
    if (key === 'useEffect') return (fn: () => (() => void) | undefined) => { const stop = fn(); if (stop) effectStops.push(stop) }
    if (key === 'useLayoutEffect') return () => {}
    if (key === 'useState') return (value: unknown) => [value, () => {}]
    return target[key]
  } })
  const fake: any = new Proxy(function () {}, { get: () => fake, apply: () => fake, construct: () => ({}) })
  const preparations: any[] = []
  const vm = {
    window: win, document: doc, localStorage: win.localStorage, navigator: win.navigator,
    CSS: win.CSS, DOMParser: win.DOMParser, HTMLElement: win.HTMLElement,
    HTMLInputElement: win.HTMLInputElement, HTMLTextAreaElement: win.HTMLTextAreaElement,
    CustomEvent: win.CustomEvent, Event: win.Event, MutationObserver: win.MutationObserver,
    ResizeObserver: win.ResizeObserver, requestAnimationFrame: win.requestAnimationFrame.bind(win),
    cancelAnimationFrame: win.cancelAnimationFrame.bind(win), structuredClone, AbortController,
    AbortSignal, Response, Error, DOMException, TextEncoder, TextDecoder, URL, crypto, console, queueMicrotask,
    setTimeout, clearTimeout, setInterval, clearInterval,
    async fetch(_url: string, init: RequestInit) {
      const input = JSON.parse(String(init.body))
      if (input.action === 'prepare') {
        preparations.push({ input, result: await host.runtime.prepare(input) })
        // Terminate only after the genuine Host has accepted this actual registered session.
        throw Error('ENTRY_BOUNDARY_HOST_ACCEPTED')
      }
      if (input.action === 'dispose') await host.runtime.disposeRun(input)
      return Response.json({ ok: true })
    }
  }
  async function load(name: string, dependencies: Record<string, unknown>, transform = (s: string) => s) {
    let descriptor: any
    ;(win as any).__ModuleLoader__ = { load: (value: any) => { descriptor = value } }
    runInNewContext(transform(await readFile('node_modules/@deepseek-ai/' + name + '/lib/client.js', 'utf8')), vm)
    return descriptor.factory((id: string) => dependencies[id] ?? fake)
  }
  const connection = await load('dsh-client-connection', {})
  const runtime = await load('dsh-client-runtime', { '@deepseek-ai/cordis': cordis, '@deepseek-ai/dsh-client-ui-slots': slots })
  const carrier = toFetchHandler(createApiProxy(ctx, { cwd: base, defaultModelSelection: () => ({ provider: 'outside', model: 'normal' }) }))
  class HostClient extends connection.AbstractApiClient { doFetch(input: URL, init: RequestInit) { return carrier.fetch(input, init) } }
  const wire = new HostClient(), clientCtx = new cordis.Context()
  cleanup.push(() => clientCtx.fiber.dispose())
  const sessions = new runtime.SessionRuntime(clientCtx, wire, {})
  const workspaces = new runtime.WorkspaceRuntime(clientCtx, wire, sessions)
  const actorSource = await readFile('scripts/lib/home-guide-workbench-native.mjs', 'utf8')
  const effectSource = actorSource.match(/^const EFFECT=(.+)$/m)?.[1]
  if (typeof effectSource !== 'string') throw Error('Native workbench dependency effect is not declared')
  const effect = runInNewContext(effectSource)
  const native = await load('dsh-client-ui-conversation', {
    react, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-dom': require('react-dom'),
    '@deepseek-ai/cordis': cordis, '@deepseek-ai/dsh-client-runtime/client': runtime
  }, source => {
    const start = source.indexOf('function NativeHomeWorkbenchPortal(')
    const end = source.indexOf('\nfunction NativeHomeWorkbenchGenerationProcess(', start)
    if (start < 0 || end < start) throw Error('Native workbench actor is not installed')
    source = source.slice(0, start) + NativeHomeWorkbenchPortal.toString() + source.slice(end)
    return source.replace('exports.apply = apply;', `exports.apply = apply;exports.__setPage=page=>sherlockBoardsAdapter=page;exports.__bindRoot=(ctx,{sessions,inputHub})=>{${effect}};`)
  })
  const researchWorkspaces = new native.ResearchWorkspaceRegistry((win as any).dshDesktop.researchCanvasStorage)
  const inputHub = new native.InputHub(clientCtx, (key: string) => key)
  const state: any = { version: 1, eventSeq: 1, account: { status: 'ready', generation: 1, user: { userId: 'entry-owner' } }, favorites: [], boards: [], current: null, recoveries: [], notifications: { cursor: 0, unreadCount: 0, pendingCount: 0, notifications: [] } }
  const page = createResearchBoardsPage({ document: doc as unknown as Document, sessions, workspaces, inputHub, researchWorkspaces,
    bridge: { isSharedSession: () => false, getSnapshot: async () => state, subscribe: () => () => {}, invoke: async (action: string, input: any) => {
      if (action === 'local.directory') return { ok: true, value: await directories.run(input) }
      if (action === 'favorite.add') { const favorite = { ...input.identity, favoriteId: 'entry-favorite', dedicated: true }; state.favorites.push(favorite); return { ok: true, value: favorite } }
      return { ok: true, value: null }
    } } } as any)
  cleanup.push(() => { effectStops.reverse().forEach(stop => stop()); page.dispose(); for (const shell of inputHub.shells.values()) shell.dispose() })
  native.__setPage(page)
  // Run the exact production Cordis effect, not a direct assignment or fixed getter.
  native.__bindRoot(clientCtx, { sessions, inputHub })
  let seq = 0
  const exchange = async (channel: string, input: Record<string, unknown>) => {
    const requestId = 'entry-request-' + ++seq
    let result: any
    const receive = (event: any) => { if (event.detail?.requestId === requestId) result = event.detail }
    win.addEventListener(channel + '-reply', receive)
    try {
      win.dispatchEvent(new win.CustomEvent(channel + '-request', { detail: { requestId, ...input } }))
      await expect.poll(() => result, { timeout: 6000 }).toBeTruthy()
      return result
    } finally { win.removeEventListener(channel + '-reply', receive) }
  }
  return { host, sessions, page, inputHub, researchWorkspaces, native, win, doc, preparations, exchange }
}

it('preserves a real registered workbench through prepare/open/research and reaches native Host preparation', async () => {
  const f = await fixture()
  const entry = await f.exchange('sherlock:home-guide-session', { kind: 'workbench', command: 'prepare' })
  expect(entry.ok, entry.message).toBe(true)
  expect(f.page.getHomeGuideSession(entry.sessionId)).toMatchObject({ kind: 'workbench', cwd: entry.cwd })
  const opened = await f.exchange('sherlock:home-guide-session', { kind: 'workbench', command: 'open', sessionId: entry.sessionId })
  expect(opened.ok, opened.message).toBe(true)
  expect(f.sessions.list.getSnapshot().current).toBe(entry.sessionId)
  expect(f.sessions.list.getSnapshot().byId[entry.sessionId].cwd).toBe(entry.cwd)
  expect(f.doc.documentElement.dataset.srbSelectedSession).toBe(entry.sessionId)
  expect(f.page.getHomeGuideSession(entry.sessionId)).toMatchObject({ kind: 'workbench', cwd: entry.cwd })

  f.doc.body.innerHTML = `<main class="pI_x6G_centerCol"><section class="wSkVaW_root"><header data-srb-session-header data-ework-notes-session="${entry.sessionId}"></header></section><section data-home-guide="entry-run" data-kind="workbench"><div id="entry-host"></div></section></main>`
  const shell = new f.native.SessionInputShell({ actx: {}, defaultSink: async () => {} })
  f.inputHub.shells.set(entry.sessionId, shell)
  f.native.NativeHomeWorkbenchPortal({ sessionId: entry.sessionId, researchWorkspaces: f.researchWorkspaces })
  const request = { kind: 'workbench', command: 'mount', runId: 'entry-run', sessionId: entry.sessionId, hostId: 'entry-host', cwd: entry.cwd, fresh: true }
  const rejected = await f.exchange('sherlock:home-guide-workbench', { ...request, cwd: join(entry.cwd, 'not-the-registered-directory') })
  expect(rejected.ok).toBe(false)
  expect(rejected.message).toContain('HWB_DIRECTORY_MISMATCH')
  expect(f.preparations).toHaveLength(0)
  const result = await f.exchange('sherlock:home-guide-workbench', request)
  expect(result.message).toBe('ENTRY_BOUNDARY_HOST_ACCEPTED')
  expect(f.preparations).toHaveLength(1)
  expect(f.preparations[0].input).toMatchObject({ action: 'prepare', runId: 'entry-run', sessionId: entry.sessionId, cwd: entry.cwd, fresh: true })
  expect(f.preparations[0].result).toBeTruthy()
  // The actor must ask the live page again; a cached/fixed entry would wrongly pass.
  f.page.dispose()
  const retired = await f.exchange('sherlock:home-guide-workbench', request)
  expect(retired.ok).toBe(false)
  expect(retired.message).toContain('HWB_REGISTRATION_UNAVAILABLE')
  expect(f.preparations).toHaveLength(1)
}, 15000)
