import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

const requireModule = createRequire(import.meta.url)
const react = requireModule('react')
const { createElement, act } = react
const { createRoot } = requireModule('react-dom/client')
class Storage {
  values = new Map<string, string>()
  fail = ''
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { if (this.fail && key.includes(this.fail)) return false; this.values.set(key, value); return true }
}
function fakeModule(): any {
  const fake: any = new Proxy(function () {}, { get: () => fake, apply: () => fake, construct: () => ({}) })
  return fake
}
async function fixture(desktop: any = {}, win?: Window) {
  let descriptor: any
  const window: any = win ?? {}
  Object.assign(window, { dshDesktop: desktop, __ModuleLoader__: { load: (value: any) => { descriptor = value } } })
  const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  runInNewContext(source, { window, document: win?.document, localStorage: win?.localStorage, navigator: win?.navigator, HTMLElement: win?.HTMLElement, HTMLTextAreaElement: win?.HTMLTextAreaElement, Text: win?.Text, ResizeObserver: win?.ResizeObserver, requestAnimationFrame: win?.requestAnimationFrame.bind(win), cancelAnimationFrame: win?.cancelAnimationFrame.bind(win), AbortController, TextDecoder, TextEncoder, setTimeout, clearTimeout })
  const bundle = descriptor.factory((id: string) => {
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return requireModule(id)
    if (id === 'react-dom') return requireModule(id)
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return new Proxy({ MarkdownText: ({ text }: any) => createElement('div', null, text) }, { get: (target, key) => Reflect.get(target, key) ?? fakeModule() })
    return fakeModule()
  })
  const storage = new Storage()
  return { bundle, storage, workspace: bundle.createResearchWorkspaceSession(storage, 'target') }
}
const textNode = (id = 'source', x = 10, y = 20) => ({ id, kind: 'pasted-text', messageId: 'old-message', title: '研究文字', excerpt: '# 事实\n内容', x, y, width: 600, height: 360, sizeMode: 'manual' })
const file = { assetId: 'a'.repeat(48), name: 'report.pdf', mimeType: 'application/pdf', size: 22, previewable: true }
const grant = (nodeId: string) => ({ nodeId, sessionId: 'target', authorizationId: `auth-${nodeId}`, capabilityToken: 'runtime-only', url: 'sherlock-research-file://preview', name: 'report.pdf', contentType: 'application/pdf', path: '/managed/report.pdf' })
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function mounted(desktop: any = {}, configure?: (win: Window) => void) {
  const win = new Window({ url: 'https://sherlock.local/' })
  configure?.(win)
  const keys = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']
  const originals = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key))
  const globals = [win, win.document, win.navigator, true]
  keys.forEach((key, i) => Object.defineProperty(globalThis, key, { configurable: true, value: globals[i] }))
  const f = await fixture(desktop, win)
  const registry = new f.bundle.ResearchWorkspaceRegistry(f.storage)
  const workspace = registry.for('target')
  const host = win.document.createElement('div'); win.document.body.append(host)
  const root = createRoot(host)
  let unmounted = false
  const render = async (sessionId = 'target') => { await act(async () => root.render(createElement(f.bundle.ResearchCanvas, { sessionId, t: (key: string) => key, researchWorkspaces: registry }))) }
  const unmount = async () => { if (!unmounted) { await act(async () => root.unmount()); unmounted = true } }
  cleanups.push(async () => { await unmount(); await win.happyDOM.abort(); keys.forEach((key, i) => { if (originals[i]) Object.defineProperty(globalThis, key, originals[i]!); else delete (globalThis as any)[key] }) })
  await render()
  const canvas = host.querySelector('[data-research-canvas]')! as any
  canvas.getBoundingClientRect = () => ({ left: 50, top: 60, width: 1000, height: 700, right: 1050, bottom: 760 })
  await act(async () => workspace.setCanvasSize({ width: 1000, height: 700 }))
  const event = async (type: string, target: any = canvas, props: any = {}) => {
    const value = new win.Event(type, { bubbles: true, cancelable: true }); Object.defineProperties(value, Object.fromEntries(Object.entries(props).map(([key, value]) => [key, { value }])))
    await act(async () => { target.dispatchEvent(value); await new Promise((resolve) => setTimeout(resolve, 0)) })
    return value
  }
  const query = (selector: string) => host.querySelector(selector) as any
  return { ...f, win, workspace, registry, host, canvas, query, event, render, unmount }
}

describe('real workspace clipboard transactions', () => {
  it('inserts independent identities, preserves relative/manual geometry and remaps provenance in one undo/redo', async () => {
    const { workspace, storage, bundle } = await fixture()
    const result = { ...textNode('result', 710, 50), kind: 'generated-container', creationMode: 'selection', containerPrompt: '比较', generationStatus: 'completed', sourceNodeIds: ['source'], generationSources: [{ id: 'source', type: 'artifact', title: '研究文字', text: '# 事实\n内容' }], containerSpec: { version: 1, type: 'markdown', title: '结果', content: '结论' }, refreshMinutes: 5, generationTaskId: 'old-task', generationChildSessionId: 'old-child' }
    let published = 0; workspace.subscribe(() => published++)
    await workspace.insertClipboardNodes({ kind: 'components', nodes: [textNode(), result] }, { x: 100, y: 200 })
    const nodes = workspace.getSnapshot().artifacts
    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({ x: 100, y: 200, width: 600, height: 360, sizeMode: 'manual' })
    expect(nodes[1]).toMatchObject({ x: 800, y: 230, refreshMinutes: 0, sourceNodeIds: [nodes[0].id], generationSources: [{ id: nodes[0].id, text: '# 事实\n内容' }] })
    expect(nodes.map((node: any) => node.id)).not.toContain('source')
    expect(new Set(nodes.map((node: any) => node.messageId)).size).toBe(2)
    expect(JSON.stringify(nodes)).not.toMatch(/old-message|old-task|old-child/)
    expect(workspace.getSnapshot().selection.selectedNodeIds).toHaveLength(2)
    expect(published).toBe(1)
    workspace.undo(); expect(workspace.getSnapshot().artifacts).toHaveLength(0)
    workspace.redo(); expect(workspace.getSnapshot().artifacts).toEqual(nodes)
    expect(bundle.createResearchWorkspaceSession(storage, 'target').getSnapshot().artifacts).toEqual(nodes)
  })
  it('keeps native text above the old assistant limit editable and rejects byte overflow visibly', async () => {
    const { workspace, bundle, storage } = await fixture()
    const text = '文'.repeat(100_000)
    await workspace.insertClipboardNodes({ kind: 'text', text }, { x: 12, y: 30 })
    const node = workspace.getSnapshot().artifacts[0]
    expect(node).toMatchObject({ kind: 'pasted-text', excerpt: text })
    expect(node.generationStatus).toBeUndefined()
    expect(bundle.createResearchWorkspaceSession(storage, 'target').getSnapshot().artifacts[0].excerpt).toBe(text)
    expect(workspace.updateArtifactContent(node.id, text + '修改')).toBe(true)
    await expect(workspace.insertClipboardNodes({ kind: 'text', text: '文'.repeat(400_000) }, { x: 0, y: 0 })).rejects.toThrow(/过大|上限/)
    expect(workspace.getSnapshot().artifacts).toHaveLength(1)
  })
  it('journals before admission, uses fresh grants and permits repeated asset paths across reload', async () => {
    let workspace: any
    const admit = vi.fn(async ({ nodeId }: any) => { expect(workspace.pendingOrphanRevocations()).toContain(nodeId); return grant(nodeId) })
    const f = await fixture({ researchClipboard: { admit } }); workspace = f.workspace
    await workspace.insertClipboardNodes({ kind: 'files', files: [file] }, { x: 0, y: 0 })
    await workspace.insertClipboardNodes({ kind: 'files', files: [file] }, { x: 30, y: 30 })
    const files = workspace.getSnapshot().files
    expect(files).toHaveLength(2)
    expect(files[0]).toMatchObject({ assetId: file.assetId, path: '/managed/report.pdf' })
    expect(files[0].id).not.toBe(files[1].id)
    expect(files[0].authorizationId).not.toBe(files[1].authorizationId)
    expect(JSON.stringify(files)).not.toMatch(/capabilityToken|runtime-only/)
    expect(f.bundle.createResearchWorkspaceSession(f.storage, 'target').getSnapshot().files).toHaveLength(2)
    expect(f.bundle.researchGenerationSources(workspace.getSnapshot(), [files[1].id], true)).toMatchObject([{ type: 'file', path: '/managed/report.pdf' }])
    expect(workspace.pendingOrphanRevocations()).toHaveLength(0)
  })
  it('rolls back a mixed batch on artifact persistence failure without history or dangling grants', async () => {
    const revokeNode = vi.fn(async () => ({ ok: true }))
    const { workspace, storage } = await fixture({ researchClipboard: { admit: async ({ nodeId }: any) => grant(nodeId) }, researchPreview: { revokeNode } })
    storage.fail = 'artifacts'
    await expect(workspace.insertClipboardNodes({ kind: 'components', nodes: [{ ...file, id: 'old-file', kind: 'file', x: 0, y: 0 }, textNode()] }, { x: 0, y: 0 })).rejects.toThrow(/存储/)
    expect(workspace.getSnapshot().files).toHaveLength(0)
    expect(workspace.getSnapshot().artifacts).toHaveLength(0)
    expect(workspace.undo()).toBe(false)
    expect(revokeNode).toHaveBeenCalledOnce()
    expect([...storage.values.entries()].filter(([key]) => key.includes(':files:')).every(([, value]) => value === '[]')).toBe(true)
  })
  it('revokes a grant resolving after cancellation and never inserts into another session', async () => {
    let resolve!: (value: any) => void; let admittedId = ''
    const revokeNode = vi.fn(async () => ({ ok: true }))
    const { workspace } = await fixture({ researchClipboard: { admit: ({ nodeId }: any) => { admittedId = nodeId; return new Promise((done) => { resolve = done }) } }, researchPreview: { revokeNode } })
    const pending = workspace.insertClipboardNodes({ kind: 'files', files: [file] }, { x: 0, y: 0 })
    await vi.waitFor(() => expect(admittedId).not.toBe(''))
    workspace.cancelTransient()
    resolve(grant(admittedId))
    await expect(pending).rejects.toThrow(/取消|切换/)
    expect(workspace.getSnapshot().files).toHaveLength(0)
    expect(revokeNode).toHaveBeenCalledWith({ sessionId: 'target', nodeId: admittedId })
    expect(workspace.pendingOrphanRevocations()).toHaveLength(0)
  })
  it('omits audit-only file generation evidence and never resurrects running tasks', async () => {
    const { workspace } = await fixture()
    await workspace.insertClipboardNodes({ kind: 'components', nodes: [{ ...textNode(), kind: 'generated-container', creationMode: 'selection', containerPrompt: '分析', generationStatus: 'running', sourceNodeIds: ['outside-file'], generationSources: [{ id: 'outside-file', type: 'file', title: '文件' }], refreshMinutes: 5, generationTaskId: 'live-task' }] }, { x: 0, y: 0 })
    const node = workspace.getSnapshot().artifacts[0]
    expect(node.generationStatus).toBe('interrupted')
    expect(node.generationSources).toBeUndefined()
    expect(node.generationTaskId).toBeUndefined()
  })
  it('keeps long pasted-text reference tags valid without pretending the excerpt is complete', async () => {
    const { workspace, bundle } = await fixture()
    await workspace.insertClipboardNodes({ kind: 'text', text: '长文'.repeat(100_000) }, { x: 0, y: 0 })
    const reference = bundle.researchArtifactReference(workspace.getSnapshot().artifacts[0])
    expect(JSON.parse(reference.ref)).toMatchObject({ kind: 'pasted-text', truncated: true })
    const evidence = bundle.researchGenerationSources(workspace.getSnapshot(), workspace.getSnapshot().selection.selectedNodeIds, true)
    expect(evidence[0].text).toContain('截断')
    expect(bundle.researchCanvasExportDescriptor(workspace.getSnapshot().artifacts[0], 'target')).toMatchObject({ kind: 'text', format: 'md' })
  })
  it('releases the unused initial preview capability while retaining its persistent authorization', async () => {
    const release = vi.fn(async () => ({ ok: true }))
    const { workspace } = await fixture({ researchClipboard: { admit: async ({ nodeId }: any) => grant(nodeId) }, researchPreview: { release } })
    await workspace.insertClipboardNodes({ kind: 'files', files: [file] }, { x: 0, y: 0 })
    const node = workspace.getSnapshot().files[0]
    expect(release).toHaveBeenCalledWith({ sessionId: 'target', nodeId: node.id, authorizationId: node.authorizationId, capabilityToken: 'runtime-only' })
    expect(node.authorizationId).toBe(`auth-${node.id}`)
  })
  it.each(['generated-summary', 'generated-mind-map'])('preserves completed %s with audit-only sources and reports missing evidence on retry', async (kind) => {
    const { workspace } = await fixture()
    await workspace.insertClipboardNodes({ kind: 'components', nodes: [{ ...textNode(), kind, generationStatus: 'completed', generationDetail: 'standard', sourceNodeIds: ['outside-file'], generationSources: [{ id: 'outside-file', type: 'file', title: '文件' }] }] }, { x: 0, y: 0 })
    const node = workspace.getSnapshot().artifacts[0]
    expect(node).toMatchObject({ kind, generationStatus: 'completed', excerpt: '# 事实\n内容', sourceNodeIds: ['outside-file'] })
    expect(node.generationSources).toBeUndefined()
    workspace.setArtifacts([{ ...node, generationStatus: 'interrupted' }])
    expect(workspace.retryGeneration(node.id)).toBeNull()
    expect(workspace.getSnapshot().artifacts[0].generationError).toMatch(/来源|材料/)
  })
  it('cleans the whole batch when a second admission fails and continues the serial queue afterward', async () => {
    let attempts = 0
    const revoked: string[] = []
    const { workspace } = await fixture({ researchClipboard: { admit: async ({ nodeId }: any) => ++attempts === 2 ? null : grant(nodeId) }, researchPreview: { revokeNode: async ({ nodeId }: any) => { revoked.push(nodeId); return { ok: true } } } })
    await expect(workspace.insertClipboardNodes({ kind: 'files', files: [file, { ...file, assetId: 'b'.repeat(48) }] }, { x: 0, y: 0 })).rejects.toThrow(/导入失败/)
    expect(workspace.getSnapshot().files).toHaveLength(0)
    expect(new Set(revoked).size).toBe(2)
    expect(workspace.undo()).toBe(false)
    await workspace.insertClipboardNodes({ kind: 'text', text: '恢复后的粘贴' }, { x: 0, y: 0 })
    expect(workspace.getSnapshot().artifacts[0].excerpt).toBe('恢复后的粘贴')
  })
  it('rechecks capacity after asynchronous admission and preserves unrelated imports', async () => {
    let resolve!: (value: any) => void; let nodeId = ''
    const revokeNode = vi.fn(async () => ({ ok: true }))
    const { workspace } = await fixture({ researchClipboard: { admit: (request: any) => { nodeId = request.nodeId; return new Promise((done) => { resolve = done }) } }, researchPreview: { revokeNode } })
    const pending = workspace.insertClipboardNodes({ kind: 'files', files: [file] }, { x: 0, y: 0 })
    await vi.waitFor(() => expect(nodeId).not.toBe(''))
    const ordinary = Array.from({ length: 256 }, (_, i) => ({ id: `ordinary-${i}`, name: `${i}.bin`, path: `/user/${i}.bin`, source: 'computer', x: i, y: 0 }))
    workspace.setFiles(ordinary)
    const length = workspace.getSnapshot().files.length
    resolve(grant(nodeId))
    await expect(pending).rejects.toThrow(/容量/)
    expect(workspace.getSnapshot().files).toHaveLength(length)
    expect(workspace.getSnapshot().files.every((node: any) => node.id.startsWith('ordinary-'))).toBe(true)
    expect(revokeNode).toHaveBeenCalledWith({ sessionId: 'target', nodeId })
  })
  it('does not create grants when undo cancels a pending native read', async () => {
    let resolve!: (value: any) => void
    const admit = vi.fn(async ({ nodeId }: any) => grant(nodeId))
    const { workspace } = await fixture({ researchClipboard: { read: () => new Promise((done) => { resolve = done }), admit } })
    const pending = workspace.pasteClipboardNodes({ x: 0, y: 0 })
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
    workspace.undo(); resolve({ kind: 'files', files: [file] })
    await expect(pending).rejects.toThrow(/取消/)
    expect(admit).not.toHaveBeenCalled()
  })
  it('does not revoke a pending admission when an unrelated edit records history', async () => {
    let resolve!: (value: any) => void; let nodeId = ''
    const revokeNode = vi.fn(async () => ({ ok: true }))
    const { workspace } = await fixture({ researchClipboard: { admit: (request: any) => { nodeId = request.nodeId; return new Promise((done) => { resolve = done }) } }, researchPreview: { revokeNode } })
    const pending = workspace.insertClipboardNodes({ kind: 'files', files: [file] }, { x: 0, y: 0 })
    await vi.waitFor(() => expect(nodeId).not.toBe(''))
    workspace.setArtifacts([textNode()])
    await new Promise((done) => setTimeout(done, 0))
    expect(revokeNode).not.toHaveBeenCalled()
    expect(workspace.pendingOrphanRevocations()).toContain(nodeId)
    resolve(grant(nodeId)); await pending
    expect(workspace.getSnapshot().files).toHaveLength(1)
    expect(workspace.getSnapshot().artifacts).toHaveLength(1)
  })
  it('refuses admission if a full durable cleanup journal cannot record the new identity', async () => {
    const admit = vi.fn(async ({ nodeId }: any) => grant(nodeId))
    const { workspace } = await fixture({ researchClipboard: { admit } })
    workspace.queueOrphanRevocations(Array.from({ length: 256 }, (_, i) => `pending-${i}`))
    await expect(workspace.insertClipboardNodes({ kind: 'files', files: [file] }, { x: 0, y: 0 })).rejects.toThrow(/清理记录/)
    expect(admit).not.toHaveBeenCalled()
  })
  it('restores earlier disk keys on a one-shot middle-write failure and leaves no new undo entry', async () => {
    const revokeNode = vi.fn(async () => ({ ok: true }))
    const { workspace, storage, bundle } = await fixture({ researchClipboard: { admit: async ({ nodeId }: any) => grant(nodeId) }, researchPreview: { revokeNode } })
    const originalWrite = storage.setItem.bind(storage)
    let failed = false
    storage.setItem = (key, value) => { if (!failed && key.includes('artifacts')) { failed = true; return false }; return originalWrite(key, value) }
    await expect(workspace.insertClipboardNodes({ kind: 'components', nodes: [{ ...file, id: 'f', kind: 'file', x: 0, y: 0 }, textNode()] }, { x: 0, y: 0 })).rejects.toThrow(/存储失败/)
    const restored = bundle.createResearchWorkspaceSession(storage, 'target').getSnapshot()
    expect(restored.files).toHaveLength(0); expect(restored.artifacts).toHaveLength(0)
    expect(workspace.undo()).toBe(false)
    expect(workspace.pendingOrphanRevocations()).toHaveLength(0)
    expect(revokeNode).toHaveBeenCalledOnce()
  })
})

describe('rendered canvas clipboard ownership', () => {
  it('measures pasted text intrinsically without a parent-height feedback loop or late observer reads', async () => {
    const observers: Array<() => void> = []
    const m = await mounted({}, (win) => {
      Object.defineProperty(win, 'ResizeObserver', { configurable: true, value: class { constructor(private callback: () => void) {} observe(target: any) { if (target.hasAttribute('data-research-artifact-content')) observers.push(this.callback) } disconnect() {} } })
      Object.defineProperty(win.HTMLElement.prototype, 'scrollHeight', { configurable: true, get() {
        if (!this.hasAttribute('data-research-artifact-content')) return 0
        // Model the real CSS min-height:100% relationship. Intrinsic sizing breaks this feedback.
        if (this.style.minHeight === '0px' || this.style.minHeight === '0') return 150
        return Number.parseFloat(this.closest('[data-research-node-id]')?.style.height ?? '280') + 2
      } })
    })
    await act(async () => { await m.workspace.insertClipboardNodes({ kind: 'text', text: '内容' }, { x: 200, y: 200 }) })
    const node = m.workspace.getSnapshot().artifacts[0]
    expect(node.height).toBeLessThan(300)
    let updates = 0; m.workspace.subscribe(() => updates++)
    await act(async () => { for (const observer of observers) observer() })
    expect(updates).toBe(0)
    await m.unmount()
    expect(() => { for (const observer of observers) observer() }).not.toThrow()
  })
  it('handles native events dispatched at document while the canvas owns focus, not at external inputs', async () => {
    const copy = vi.fn(async () => ({ ok: true }))
    const read = vi.fn(async () => ({ kind: 'text', text: 'native paste' }))
    const m = await mounted({ researchClipboard: { copy, read } })
    m.canvas.focus()
    await m.event('paste', m.win.document)
    expect(m.workspace.getSnapshot().artifacts).toHaveLength(1)
    await m.event('copy', m.win.document)
    expect(copy).toHaveBeenCalledOnce()
    const input = m.win.document.createElement('input'); m.win.document.body.append(input); input.focus()
    expect((await m.event('paste', m.win.document)).defaultPrevented).toBe(false)
    expect(read).toHaveBeenCalledOnce()
  })
  it('restores and renders a pasted image with a new preview capability and preserves it through undo/redo', async () => {
    const release = vi.fn(async () => ({ ok: true }))
    const restore = vi.fn(async ({ nodeId }: any) => ({ ...grant(nodeId), name: 'image.png', contentType: 'image/png', url: 'sherlock-preview://restored-image/', capabilityToken: 'restored-cap' }))
    const m = await mounted({ researchClipboard: { admit: async ({ nodeId }: any) => ({ ...grant(nodeId), name: 'image.png', contentType: 'image/png', path: '/managed/image.png' }) }, researchPreview: { restore, release } })
    await act(async () => { await m.workspace.insertClipboardNodes({ kind: 'files', files: [{ ...file, name: 'image.png', mimeType: 'image/png' }] }, { x: 300, y: 300 }) })
    expect(m.query('img').getAttribute('src')).toBe('sherlock-preview://restored-image/')
    const id = m.workspace.getSnapshot().files[0].id
    expect(restore).toHaveBeenCalledWith({ sessionId: 'target', nodeId: id, authorizationId: `auth-${id}` })
    await act(async () => { m.workspace.undo() })
    expect(m.query('img')).toBeNull()
    await act(async () => { m.workspace.redo() })
    expect(m.query('img').getAttribute('src')).toBe('sherlock-preview://restored-image/')
  })
  it('handles keyboard plus native copy/paste exactly once, places with viewport coordinates and offsets repeats', async () => {
    const read = vi.fn(async () => ({ kind: 'text', text: '# 粘贴原生文字\n事实' }))
    const copy = vi.fn(async () => ({ ok: true }))
    const m = await mounted({ researchClipboard: { read, copy } })
    await act(async () => m.workspace.setViewport({ scale: 2, x: 20, y: 40 }))
    m.canvas.focus()
    await m.event('pointermove', m.canvas, { clientX: 270, clientY: 300 })
    expect((await m.event('keydown', m.canvas, { key: 'v', code: 'KeyV', metaKey: true })).defaultPrevented).toBe(true)
    await m.event('paste')
    expect(read).toHaveBeenCalledOnce()
    expect(m.workspace.getSnapshot().artifacts[0]).toMatchObject({ x: 100, y: 100, kind: 'pasted-text' })
    expect(m.host.textContent).toContain('# 粘贴原生文字')
    expect(m.host.textContent).not.toContain('助手回复')
    await m.event('keydown', m.canvas, { key: 'c', code: 'KeyC', ctrlKey: true }); await m.event('copy')
    expect(copy).toHaveBeenCalledOnce()
    await m.event('keydown', m.canvas, { key: 'v', code: 'KeyV', ctrlKey: true })
    expect(m.workspace.getSnapshot().artifacts[1]).toMatchObject({ x: 124, y: 124 })
    await act(async () => { m.workspace.undo() })
    expect(m.workspace.getSnapshot().artifacts).toHaveLength(1)
  })
  it('leaves editor, native iframe and rendered text selection copy/paste untouched', async () => {
    const read = vi.fn(async () => ({ kind: 'text', text: 'clipboard' })); const copy = vi.fn(async () => ({ ok: true }))
    const m = await mounted({ researchClipboard: { read, copy } })
    for (const tag of ['input', 'textarea', 'iframe', 'div']) {
      const control = m.win.document.createElement(tag); if (tag === 'div') control.setAttribute('contenteditable', 'true')
      m.canvas.append(control); control.focus()
      expect((await m.event('paste', control)).defaultPrevented).toBe(false)
      expect((await m.event('keydown', control, { key: 'v', code: 'KeyV', metaKey: true })).defaultPrevented).toBe(false)
      control.remove()
    }
    await act(async () => { await m.workspace.insertClipboardNodes({ kind: 'text', text: '选择这段文字' }, { x: 50, y: 50 }) })
    m.canvas.focus()
    const range = m.win.document.createRange(); range.selectNodeContents(m.query('[data-research-artifact-content]'))
    m.win.getSelection()!.addRange(range)
    expect((await m.event('copy')).defaultPrevented).toBe(false)
    expect((await m.event('contextmenu', m.query('[data-research-artifact-content]'), { clientX: 100, clientY: 100 })).defaultPrevented).toBe(false)
    expect(copy).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled()
  })
  it('inspects paste availability only on background menu open and keeps its world point fixed', async () => {
    let available = false
    const inspect = vi.fn(async () => ({ available })); const read = vi.fn(async () => ({ kind: 'text', text: '菜单粘贴' }))
    const m = await mounted({ researchClipboard: { inspect, read } })
    expect(inspect).not.toHaveBeenCalled()
    await m.event('contextmenu', m.canvas, { clientX: 250, clientY: 260 })
    expect(m.query('[data-research-context-paste]').disabled).toBe(true)
    available = true
    await m.event('contextmenu', m.canvas, { clientX: 250, clientY: 260 })
    expect(m.query('[data-research-context-paste]').disabled).toBe(false)
    await act(async () => m.workspace.setViewport({ scale: 2, x: 40, y: 60 }))
    await m.event('pointermove', m.canvas, { clientX: 900, clientY: 600 })
    await m.event('click', m.query('[data-research-context-paste]'))
    expect(m.workspace.getSnapshot().artifacts[0]).toMatchObject({ x: 200, y: 200 })
    expect(inspect).toHaveBeenCalledTimes(2)
  })
  it('copies the selected group on right-click and selects an unselected clicked node', async () => {
    const copy = vi.fn(async (_request: any) => ({ ok: true }))
    const m = await mounted({ researchClipboard: { copy } })
    await act(async () => { await m.workspace.insertClipboardNodes({ kind: 'components', nodes: [textNode('a'), textNode('b', 710, 20), textNode('c', 1410, 20)] }, { x: 10, y: 10 }) })
    const ids = m.workspace.getSnapshot().artifacts.map((node: any) => node.id)
    await act(async () => m.workspace.updateSelection(ids.slice(0, 2), 'replace'))
    await m.event('contextmenu', m.query(`[data-research-node-id="${ids[0]}"]`), { clientX: 100, clientY: 100 })
    await m.event('click', m.query('[data-research-context-copy]'))
    expect(copy.mock.calls[0]![0].nodes).toHaveLength(2)
    await m.event('contextmenu', m.query(`[data-research-node-id="${ids[2]}"]`), { clientX: 100, clientY: 100 })
    await m.event('click', m.query('[data-research-context-copy]'))
    expect(copy.mock.calls[1]![0].nodes.map((node: any) => node.id)).toEqual([ids[2]])
  })
  it('renders native text editing and an unsupported asset card with safe folder reveal', async () => {
    const open = vi.fn(async () => ({ ok: true }))
    const m = await mounted({ researchClipboard: { open } })
    await act(async () => { await m.workspace.insertClipboardNodes({ kind: 'text', text: '# 原文' }, { x: 30, y: 30 }); await m.workspace.insertClipboardNodes({ kind: 'files', files: [{ ...file, name: 'archive.bin', previewable: false }] }, { x: 700, y: 30 }) })
    await m.event('dblclick', m.query('[data-research-artifact-content]'))
    const editor = m.query('textarea')
    expect(editor).not.toBeNull()
    editor.value = '# 修改文字'
    await m.event('keydown', editor, { key: 'Enter', code: 'Enter', metaKey: true })
    expect(m.workspace.getSnapshot().artifacts[0].excerpt).toBe('# 修改文字')
    expect(m.workspace.getSnapshot().pendingMessageJump).toBeNull()
    expect(m.host.textContent).toContain('暂不支持预览')
    await m.event('click', m.query('[data-research-clipboard-open]'))
    expect(open).toHaveBeenCalledWith({ assetId: file.assetId })
  })
  it('reports native text edit overflow and failed storage without dismissing or losing the draft', async () => {
    const m = await mounted()
    await act(async () => { await m.workspace.insertClipboardNodes({ kind: 'text', text: '原文' }, { x: 30, y: 30 }) })
    await m.event('dblclick', m.query('[data-research-artifact-content]'))
    const editor = m.query('textarea'); editor.value = '文'.repeat(400_000)
    await m.event('keydown', editor, { key: 'Enter', metaKey: true })
    expect(m.query('[data-research-clipboard-feedback]').textContent).toMatch(/上限|过大/)
    expect(m.query('textarea')).toBe(editor)
    editor.value = '有效修改'; m.storage.fail = 'artifacts'
    await m.event('keydown', editor, { key: 'Enter', metaKey: true })
    expect(m.query('[data-research-clipboard-feedback]').textContent).toMatch(/存储/)
    expect(m.workspace.getSnapshot().artifacts[0].excerpt).toBe('原文')
    m.storage.fail = ''
    await m.event('keydown', editor, { key: 'Enter', metaKey: true })
    expect(m.workspace.getSnapshot().artifacts[0].excerpt).toBe('有效修改')
    expect(m.query('textarea')).toBeNull()
  })
  it.each(['unmount', 'switch'])('cleans a late file admission after canvas %s', async (action) => {
    let resolve!: (value: any) => void; let nodeId = ''
    const revokeNode = vi.fn(async () => ({ ok: true }))
    const m = await mounted({ researchClipboard: { read: async () => ({ kind: 'files', files: [file] }), admit: (request: any) => { nodeId = request.nodeId; return new Promise((done) => { resolve = done }) } }, researchPreview: { revokeNode } })
    m.canvas.focus(); await m.event('paste')
    expect(nodeId).not.toBe('')
    if (action === 'unmount') await m.unmount(); else await m.render('another')
    await act(async () => { resolve(grant(nodeId)); await new Promise((done) => setTimeout(done, 0)) })
    expect(m.workspace.getSnapshot().files).toHaveLength(0)
    expect(m.registry.for('another').getSnapshot().files).toHaveLength(0)
    expect(revokeNode).toHaveBeenCalledWith({ sessionId: 'target', nodeId })
  })
})
