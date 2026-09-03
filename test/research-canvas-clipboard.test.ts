import { mkdtemp, writeFile, unlink, rm, readdir, readFile, symlink, truncate } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { FileResearchPreviewAuthorizationStorage, ResearchFilePreviewRegistry } from '../src/main/state/research-file-preview'
import { ResearchCanvasClipboard, RESEARCH_CLIPBOARD_FORMAT, registerResearchClipboardHandlers } from '../src/main/state/research-canvas-clipboard'

const dirs: string[] = []
const pdf = Buffer.from('%PDF-1.7\nclipboard-owned bytes\n%%EOF')
const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
class NativeClipboard {
  formats = new Map<string, Buffer>()
  text = ''
  html = ''
  image = Buffer.alloc(0)
  availableFormats() { return [...this.formats.keys()] }
  readBuffer(format: string) { return this.formats.get(format) ?? Buffer.alloc(0) }
  readText() { return this.text }
  readHTML() { return this.html }
  readImage() { return { isEmpty: () => this.image.length === 0, toPNG: () => this.image, getSize: () => ({ width: 10, height: 10 }) } }
  write(value: { text: string; html: string }) {
    this.formats.clear(); this.image = Buffer.alloc(0); this.text = value.text; this.html = value.html
  }
  writeBuffer(format: string, bytes: Buffer) { this.formats.set(format, bytes) }
}
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'sherlock-clipboard-')); dirs.push(root)
  const storage = new FileResearchPreviewAuthorizationStorage(root)
  const registry = new ResearchFilePreviewRegistry({ storage })
  const clipboard = new NativeClipboard()
  const opened: string[] = []
  const options = { userDataPath: root, clipboard, registry, revealFile: (target: string) => { opened.push(target) } }
  return { root, registry, storage, clipboard, opened, options, service: new ResearchCanvasClipboard(options) }
}
async function source(f: Awaited<ReturnType<typeof fixture>>, name = 'report.pdf', bytes = pdf) {
  const target = path.join(f.root, name); await writeFile(target, bytes)
  const preview = await f.registry.admitFinder({ path: target, sessionId: 'source', nodeId: 'original' })
  expect(preview).not.toBeNull()
  return { target, preview: preview!, node: { id: 'original', kind: 'file', name, x: 4, y: 9, width: 400, height: 500, authorizationId: preview!.authorizationId } }
}
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))) })

describe('durable research clipboard', () => {
  it('keeps a maximum-size text component readable after HTML fallback escaping expands it', async () => {
    const f = await fixture(); const content = '<'.repeat(1024 * 1024)
    expect(await f.service.copy({ sessionId: 's', nodes: [{ id: 'text', kind: 'pasted-text', title: 'text', excerpt: content, x: 0, y: 0 }] })).toEqual({ ok: true })
    expect(await f.service.read()).toMatchObject({ kind: 'components', nodes: [{ excerpt: content }] })
  })
  it('bounds the published snapshot including added file metadata, preserving the previous clipboard on overflow', async () => {
    const f = await fixture(); const s = await source(f)
    const text = { id: 'text', kind: 'pasted-text', title: 'large', excerpt: '', sourceText: '', x: 0, y: 0 }
    const nodes = [text, s.node]
    const remaining = 2 * 1024 * 1024 - Buffer.byteLength(JSON.stringify(nodes)) - 5
    text.excerpt = 'x'.repeat(Math.floor(remaining / 2))
    text.sourceText = 'x'.repeat(Math.ceil(remaining / 2))
    f.clipboard.text = 'previous clipboard'
    expect((await f.service.copy({ sessionId: 'source', nodes })).ok).toBe(false)
    expect(f.clipboard.text).toBe('previous clipboard')
  })
  it('preserves a source filename that collides with the internal manifest name', async () => {
    const f = await fixture(); const target = path.join(f.root, 'manifest.json')
    await writeFile(target, '{"document":"user data"}')
    f.clipboard.formats.set('public.file-url', Buffer.from(pathToFileURL(target).href))
    const payload = await f.service.read(); if (payload.kind !== 'files') throw new Error()
    expect(payload.files[0]?.name).toBe('manifest.json')
    const preview = await f.service.admit({ assetId: payload.files[0]!.assetId, sessionId: 'target', nodeId: 'new' })
    expect(preview?.name).toBe('manifest.json')
    expect(await (await f.registry.handle(new Request(preview!.url))).text()).toBe('{"document":"user data"}')
  })
  it('preserves the renderer canonical chart version/variant and pasted-text without credential-bearing provenance', async () => {
    const f = await fixture()
    const nodes = [
      { id: 'chart', kind: 'generated-container', title: '指标', x: 0, y: 0, creationMode: 'selection', containerPrompt: '比较', sourceNodeIds: ['file-source'], generationSources: [{ id: 'file-source', type: 'file', title: '来源', path: '/private/secret.pdf', authorizationId: 'secret' }], containerSpec: { version: 1, type: 'chart', title: '指标', variant: 'line', labels: ['2026'], series: [{ name: '收入', values: [5] }] } },
      { id: 'text', kind: 'pasted-text', title: '粘贴文本', excerpt: 'text'.repeat(20_000), x: 10, y: 20 }
    ]
    expect(await f.service.copy({ sessionId: 's', nodes })).toEqual({ ok: true })
    const result = await f.service.read()
    expect(result).toMatchObject({ kind: 'components', nodes: [{ creationMode: 'selection', sourceNodeIds: ['file-source'], generationSources: [{ id: 'file-source', title: '来源', type: 'file' }], containerSpec: { version: 1, variant: 'line' } }, { kind: 'pasted-text', excerpt: 'text'.repeat(20_000) }] })
    expect(JSON.stringify(result)).not.toMatch(/private|authorizationId|secret/)
  })
  it('writes opaque HTML and useful escaped external text atomically', async () => {
    const f = await fixture()
    expect(await f.service.copy({ sessionId: 's', nodes: [{ id: 'n', kind: 'pasted-text', title: '标签', excerpt: '<img src=x onerror=alert(1)> & text', x: 0, y: 0 }] })).toEqual({ ok: true })
    expect(f.clipboard.readText()).toBe('<img src=x onerror=alert(1)> & text')
    expect(f.clipboard.readHTML()).toMatch(/content="[a-f0-9]{48}"/)
    expect(f.clipboard.readHTML()).not.toContain('<img')
    f.clipboard.html = '<meta name="sherlock-research-clipboard" content="../../private">'
    await expect(f.service.read()).rejects.toThrow(/引用无效/)
    f.clipboard.html = `<meta name="sherlock-research-clipboard" content="${'a'.repeat(48)}">`
    await expect(f.service.read()).rejects.toThrow()
  })
  it.skipIf(process.platform !== 'darwin')('reads Finder binary plist lists, including non-ASCII names', async () => {
    const f = await fixture(); const a = path.join(f.root, '报告.pdf'); const b = path.join(f.root, 'second.pdf')
    await writeFile(a, pdf); await writeFile(b, pdf)
    const result = spawnSync('/usr/bin/plutil', ['-convert', 'binary1', '-o', '-', '-'], { input: `<plist version="1.0"><array><string>${a}</string><string>${b}</string></array></plist>` })
    expect(result.status).toBe(0)
    f.clipboard.formats.set('NSFilenamesPboardType', result.stdout)
    expect(await f.service.read()).toMatchObject({ kind: 'files', files: [{ name: '报告.pdf' }, { name: 'second.pdf' }] })
  })
  it('rejects oversize real files before reading bytes and cleans partial failed batches', async () => {
    const f = await fixture(); const a = path.join(f.root, 'ok.pdf'); const b = path.join(f.root, 'oversize.pdf')
    await writeFile(a, pdf); await writeFile(b, pdf); await truncate(b, 64 * 1024 * 1024 + 1)
    f.clipboard.formats.set('text/uri-list', Buffer.from([pathToFileURL(a).href, pathToFileURL(b).href].join('\n')))
    await expect(f.service.read()).rejects.toThrow(/64 MiB/)
    expect(await readdir(path.join(f.root, 'research-clipboard', 'assets'))).toEqual([])
    expect(f.storage.load()).toEqual([])
  })
  it('never issues previews for an invalid Office package or follows an asset-manifest path escape', async () => {
    const f = await fixture(); const target = path.join(f.root, 'fake.pptx'); await writeFile(target, Buffer.from('PK\x03\x04broken'))
    f.clipboard.formats.set('public.file-url', Buffer.from(pathToFileURL(target).href))
    const payload = await f.service.read(); if (payload.kind !== 'files') throw new Error()
    const assetId = payload.files[0]!.assetId
    expect(payload.files[0]?.previewable).toBe(false)
    expect(await f.service.admit({ assetId, sessionId: 's', nodeId: 'n' })).toBeNull()
    const manifestPath = path.join(f.root, 'research-clipboard', 'assets', assetId, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')); manifest.name = '../../../fake.pptx'
    await writeFile(manifestPath, JSON.stringify(manifest))
    expect(await f.service.admit({ assetId, sessionId: 's', nodeId: 'n' })).toBeNull()
    expect(await f.service.open({ assetId })).toEqual({ ok: false })
    expect(f.opened).toEqual([])
  })
  it('snapshots verified file bytes before publishing and survives deletion, revocation and restart', async () => {
    const f = await fixture(); const s = await source(f)
    expect(await f.service.copy({ sessionId: 'source', nodes: [s.node] })).toEqual({ ok: true })
    await unlink(s.target); f.registry.revokeSession('source')
    const registry = new ResearchFilePreviewRegistry({ storage: f.storage })
    const restarted = new ResearchCanvasClipboard({ ...f.options, registry })
    const payload = await restarted.read()
    expect(payload.kind).toBe('components')
    if (payload.kind !== 'components') throw new Error('components required')
    expect(payload.nodes[0]).toMatchObject({ name: 'report.pdf', width: 400, height: 500, x: 4, y: 9, previewable: true })
    expect(JSON.stringify(payload)).not.toMatch(/authorizationId|capabilityToken|sherlock-preview|clipboard-owned|"path"/)
    expect(f.storage.load()).toHaveLength(0)
    const preview = await restarted.admit({ assetId: payload.nodes[0]!.assetId, sessionId: 'target', nodeId: 'new' })
    expect(preview?.contentType).toBe('application/pdf')
    expect(preview?.authorizationId).not.toBe(s.preview.authorizationId)
    expect(await (await registry.handle(new Request(preview!.url))).text()).toBe(pdf.toString())
  })
  it('copies only an allowlisted immutable artifact and drops live task and refresh state', async () => {
    const f = await fixture()
    const node = { id: 'n', kind: 'generated-container', title: '表格', excerpt: '', messageId: 'm', x: 1, y: 2, containerPrompt: '比较', containerSpec: { type: 'table', title: '结果', columns: ['A'], rows: [['value']] }, generationStatus: 'running', generationTaskId: 'secret-task', refreshMinutes: 5, path: '/secret' }
    expect(await f.service.copy({ sessionId: 's', nodes: [node] })).toEqual({ ok: true })
    node.containerSpec.rows[0]![0] = 'changed'
    const payload = await f.service.read()
    expect(payload).toMatchObject({ kind: 'components', nodes: [{ containerSpec: { rows: [['value']] }, generationStatus: 'completed', refreshMinutes: 0 }] })
    expect(JSON.stringify(payload)).not.toMatch(/secret-task|secret|generationTaskId/)
  })
  it('rejects unauthorized paths and identities without changing the existing clipboard', async () => {
    const f = await fixture(); const s = await source(f); f.clipboard.text = 'keep me'
    for (const node of [{ ...s.node, authorizationId: '0'.repeat(48), path: s.target }, { ...s.node, authorizationId: undefined, path: s.target }, { ...s.node, id: 'wrong' }]) {
      expect((await f.service.copy({ sessionId: 'source', nodes: [node] })).ok).toBe(false)
      expect(await f.service.read()).toEqual({ kind: 'text', text: 'keep me' })
    }
    expect(await f.service.admit({ assetId: s.target, sessionId: 's', nodeId: 'n' })).toBeNull()
    expect(await f.service.open({ assetId: s.target })).toEqual({ ok: false })
    expect(f.opened).toEqual([])
  })
  it('reports empty and text without treating ordinary path text as file admission', async () => {
    const f = await fixture()
    expect(await f.service.inspect()).toEqual({ available: false })
    expect(await f.service.read()).toEqual({ kind: 'empty' })
    f.clipboard.text = path.join(f.root, 'private.pdf')
    expect(await f.service.inspect()).toEqual({ available: true })
    expect(await f.service.read()).toEqual({ kind: 'text', text: f.clipboard.text })
    expect(f.storage.load()).toEqual([])
  })
  it('treats an ordinary browser URI-list link as text, not a native file grant', async () => {
    const f = await fixture(); f.clipboard.text = 'https://example.com/report'
    f.clipboard.formats.set('text/uri-list', Buffer.from('https://example.com/report'))
    expect(await f.service.read()).toEqual({ kind: 'text', text: 'https://example.com/report' })
    expect(f.storage.load()).toEqual([])
  })
  it.each(['text/uri-list', 'public.file-url', 'NSFilenamesPboardType'])('imports multiple real native file URLs through %s before image and text', async (format) => {
    const f = await fixture(); const a = path.join(f.root, 'a b.pdf'); const b = path.join(f.root, 'b.pdf')
    await writeFile(a, pdf); await writeFile(b, pdf)
    const encoded = format === 'NSFilenamesPboardType' ? `<?xml version="1.0"?><plist version="1.0"><array><string>${a}</string><string>${b}</string></array></plist>` : [pathToFileURL(a).href, pathToFileURL(b).href].join('\r\n')
    f.clipboard.formats.set(format, Buffer.from(encoded)); f.clipboard.image = png; f.clipboard.text = 'fallback'
    expect(await f.service.inspect()).toEqual({ available: true })
    expect(f.storage.load()).toEqual([])
    const payload = await f.service.read()
    expect(payload).toMatchObject({ kind: 'files', files: [{ name: 'a b.pdf', mimeType: 'application/pdf', previewable: true }, { name: 'b.pdf' }] })
    expect(f.storage.load()).toEqual([])
  })
  it('prefers a valid component reference over native files, then images over text', async () => {
    const f = await fixture()
    await f.service.copy({ sessionId: 's', nodes: [{ id: 'n', kind: 'assistant-excerpt', title: 'hello', excerpt: 'body', x: 0, y: 0 }] })
    f.clipboard.formats.set('public.file-url', Buffer.from('file:///does-not-exist.pdf')); f.clipboard.image = png
    expect((await f.service.read()).kind).toBe('components')
    f.clipboard.formats.clear(); f.clipboard.html = ''; f.clipboard.text = 'text fallback'
    const payload = await f.service.read()
    expect(payload).toMatchObject({ kind: 'files', files: [{ name: '剪贴板图片.png', mimeType: 'image/png', previewable: true }] })
    expect(f.storage.load()).toEqual([])
  })
  it('keeps unsupported binary files as persistent explicit-open cards without preview grants', async () => {
    const f = await fixture(); const target = path.join(f.root, 'archive.custom'); await writeFile(target, Buffer.from([0, 255, 0, 255]))
    f.clipboard.formats.set('public.file-url', Buffer.from(pathToFileURL(target).href))
    const payload = await f.service.read()
    if (payload.kind !== 'files') throw new Error('files required')
    expect(payload.files[0]).toMatchObject({ name: 'archive.custom', mimeType: 'application/octet-stream', size: 4, previewable: false })
    await unlink(target)
    expect(await f.service.admit({ assetId: payload.files[0]!.assetId, sessionId: 'target', nodeId: 'new' })).toBeNull()
    expect(await f.service.open({ assetId: payload.files[0]!.assetId })).toEqual({ ok: true })
    expect(await readFile(f.opened[0]!)).toEqual(Buffer.from([0, 255, 0, 255]))
    expect(f.storage.load()).toEqual([])
  })
  it('rejects malformed references, oversized nodes/text, symlinks and hostile asset IDs', async () => {
    const f = await fixture(); f.clipboard.text = 'previous'
    const node = { id: 'n', kind: 'assistant-excerpt', title: 'a', excerpt: 'x'.repeat(1024 * 1024 + 1), x: 0, y: 0 }
    expect((await f.service.copy({ sessionId: 's', nodes: [node] })).ok).toBe(false)
    expect((await f.service.copy({ sessionId: 's', nodes: Array.from({ length: 101 }, (_, i) => ({ ...node, id: String(i), excerpt: '' })) })).ok).toBe(false)
    expect(f.clipboard.text).toBe('previous')
    f.clipboard.formats.set(RESEARCH_CLIPBOARD_FORMAT, Buffer.from('../../secret'))
    await expect(f.service.read()).rejects.toThrow()
    f.clipboard.formats.clear(); f.clipboard.text = 'x'.repeat(1024 * 1024 + 1)
    await expect(f.service.read()).rejects.toThrow()
    const target = path.join(f.root, 'actual.pdf'); const link = path.join(f.root, 'link.pdf')
    await writeFile(target, pdf); await symlink(target, link)
    f.clipboard.formats.set('public.file-url', Buffer.from(pathToFileURL(link).href))
    await expect(f.service.read()).rejects.toThrow()
    expect(await f.service.admit({ assetId: '../escape', sessionId: 's', nodeId: 'n' })).toBeNull()
  })
  it('revalidates stored asset bytes on every read and admission', async () => {
    const f = await fixture(); const s = await source(f)
    await f.service.copy({ sessionId: 'source', nodes: [s.node] })
    const payload = await f.service.read(); if (payload.kind !== 'components') throw new Error()
    const assetId = payload.nodes[0]!.assetId as string
    const files = await readdir(path.join(f.root, 'research-clipboard', 'assets', assetId, 'content'))
    const owned = files.find((name) => name.endsWith('.pdf'))!
    await writeFile(path.join(f.root, 'research-clipboard', 'assets', assetId, 'content', owned), '%PDF-1.7\ntampered')
    await expect(f.service.read()).rejects.toThrow()
    expect(await f.service.admit({ assetId, sessionId: 's', nodeId: 'n' })).toBeNull()
  })
  it('blocks every clipboard IPC operation from a hostile child or foreign window', async () => {
    const f = await fixture(); const handlers = new Map<string, (event: any, value?: unknown) => any>()
    const window = { isDestroyed: () => false, webContents: { mainFrame: { processId: 1, routingId: 2 } } }
    registerResearchClipboardHandlers({ ipcMain: { removeHandler: () => {}, handle: (channel, handler) => { handlers.set(channel, handler) } }, getMainWindow: () => window, service: f.service })
    expect(handlers.size).toBe(5)
    for (const handler of handlers.values()) {
      expect(() => handler({ sender: window.webContents, senderFrame: { processId: 1, routingId: 3 } })).toThrow(/main Sherlock window/)
      expect(() => handler({ sender: {}, senderFrame: window.webContents.mainFrame })).toThrow(/main Sherlock window/)
    }
    expect(await handlers.get('research:clipboard:read')!({ sender: window.webContents, senderFrame: window.webContents.mainFrame })).toEqual({ kind: 'empty' })
  })
})
