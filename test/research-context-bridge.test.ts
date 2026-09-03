import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ResearchContextBridge, readStoredResearchCanvas, registerResearchContextHandlers } from '../src/main/state/research-context-bridge'
import { ResearchCanvasStorage } from '../src/main/state/research-canvas-storage'
import { FileResearchPreviewAuthorizationStorage, ResearchFilePreviewRegistry } from '../src/main/state/research-file-preview'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function fixture(options = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'research-context-')))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const file = join(root, 'report.md')
  await writeFile(file, '失效边界：现金流下降。')
  const registry = new ResearchFilePreviewRegistry({ storage: new FileResearchPreviewAuthorizationStorage(root) })
  const descriptor = await registry.admitFinder({ sessionId: 'parent', nodeId: 'file', path: file })
  expect(descriptor).not.toBeNull()
  const storage = new ResearchCanvasStorage(root)
  const files = [{ id: 'file', name: 'report.md', path: '/attacker/private.txt', authorizationId: descriptor!.authorizationId }, { id: 'unauthorized', name: 'missing.md', path: file }]
  storage.setItem('sherlock.research.canvas.files.v1:parent', JSON.stringify(files))
  storage.setItem('sherlock.research.canvas.artifacts.v1:parent', JSON.stringify([
    { id: 'report', kind: 'assistant-result', title: '结论', excerpt: '旧的研究结论', token: 'private-secret' },
    { id: 'web', kind: 'web-link', title: '网页', url: 'https://user:secret@example.com/article?token=private-secret#private', sourceText: '网页证据', excerpt: 'https://not-evidence.test' },
    { id: 'map', kind: 'generated-mind-map', title: '导图', generationStatus: 'completed', excerpt: '# 核心\n- 现金流', sourceNodeIds: ['file'] },
    { id: 'failed', kind: 'generated-summary', title: '失败', generationStatus: 'failed', excerpt: '失败时的内部路径 /private/token' },
    { id: 'empty', kind: 'generated-container', title: '空容器', generationStatus: 'draft', excerpt: '这只是生成提示词' },
    { id: 'container', kind: 'generated-container', title: '表格', generationStatus: 'completed', containerSpec: { type: 'table', title: '指标', columns: ['项目', '值'], rows: [['收入', '100']] } },
    { id: 'stale', kind: 'generated-container', title: '旧表格', generationStatus: 'failed', refreshError: '/private/error', lastSuccessfulAt: 1000, containerSpec: { type: 'table', title: '旧指标', columns: ['项目'], rows: [['仍保留的证据']] } }
  ]))
  const bridge = new ResearchContextBridge({ readCanvas: (sessionId) => readStoredResearchCanvas(storage, sessionId), resolveFile: (identity) => registry.resolveExportSource(identity), ...options })
  const endpoint = await bridge.start()
  cleanups.push(() => bridge.stop())
  const snapshot = (body: unknown, headers = {}) => fetch(`${endpoint.url}/snapshot`, { method: 'POST', headers: { authorization: `Bearer ${endpoint.token}`, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  return { root, file, storage, registry, bridge, endpoint, snapshot }
}

describe('trusted research canvas capture', () => {
  it('captures static HTML body evidence without executing or indexing scripts and styles', async () => {
    const f = await fixture()
    f.storage.setItem('sherlock.research.canvas.files.v1:parent', '[]')
    f.storage.setItem('sherlock.research.canvas.artifacts.v1:parent', JSON.stringify([{ id: 'html', kind: 'generated-container', title: '用户体验地图', generationStatus: 'completed', containerSpec: { version: 1, type: 'html', title: '用户体验地图', html: '<style>secretStyle</style><h1>用户体验地图</h1><p>触点：发现 &amp; 试用</p><script>secretCode</script>' } }]))
    const capture = await f.bridge.capture({ sessionId: 'parent' })
    const { sources } = await (await f.snapshot({ sessionId: 'parent', captureId: capture.captureId })).json()
    expect(sources[0].text).toContain('触点：发现 & 试用')
    expect(sources[0].text).not.toMatch(/secretStyle|secretCode|<h1/)
  })
  it('captures native pasted-text and explicitly marks long evidence truncation', async () => {
    const f = await fixture()
    f.storage.setItem('sherlock.research.canvas.files.v1:parent', '[]')
    f.storage.setItem('sherlock.research.canvas.artifacts.v1:parent', JSON.stringify([{ id: 'paste', kind: 'pasted-text', title: '原生文字', excerpt: '甲'.repeat(150_000) }]))
    const capture = await f.bridge.capture({ sessionId: 'parent' })
    const { sources } = await (await f.snapshot({ sessionId: 'parent', captureId: capture.captureId })).json()
    expect(sources[0]).toMatchObject({ kind: 'pasted-text', status: 'ready', truncated: true })
    expect(sources[0].text).toHaveLength(120_000)
  })
  it('reads native mind-map content as evidence in right-side conversation', async () => {
    const f = await fixture()
    f.storage.setItem('sherlock.research.canvas.files.v1:parent', '[]')
    f.storage.setItem('sherlock.research.canvas.artifacts.v1:parent', JSON.stringify([
      { id: 'map-native', kind: 'generated-container', title: '结果', generationStatus: 'completed', containerPrompt: '秘密提示词', containerSpec: { version: 1, type: 'mind-map', title: '现金流', content: '# 现金流\n- 库存增长' } }
    ]))
    const capture = await f.bridge.capture({ sessionId: 'parent' })
    const { sources } = await (await f.snapshot({ sessionId: 'parent', captureId: capture.captureId })).json()
    expect(sources[0].text).toContain('- 库存增长')
    expect(sources[0].text).not.toContain('秘密提示词')
  })
  it('freezes stored sources, resolves only authorized files, and normalizes evidence without private fields', async () => {
    const f = await fixture()
    const capture = await f.bridge.capture({ sessionId: 'parent' })
    expect(Object.keys(capture).sort()).toEqual(['captureId', 'totalSources'])
    expect(capture.totalSources).toBe(9)
    f.storage.setItem('sherlock.research.canvas.artifacts.v1:parent', '[]')
    const response = await f.snapshot({ sessionId: 'parent', captureId: capture.captureId })
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    const { sources } = await response.json() as { sources: Array<Record<string, any>> }
    expect(sources.find((s) => s.id === 'file')).toMatchObject({ path: f.file, revision: { size: expect.any(Number), mtimeMs: expect.any(Number) }, truncated: true })
    expect(sources.find((s) => s.id === 'unauthorized')).toMatchObject({ status: 'unavailable' })
    expect(sources.find((s) => s.id === 'unauthorized')!.path).toBeUndefined()
    expect(sources.find((s) => s.id === 'report')!.text).toBe('旧的研究结论')
    expect(sources.find((s) => s.id === 'web')).toMatchObject({ text: '网页证据', sourceUrl: 'https://example.com/article' })
    expect(sources.find((s) => s.id === 'map')!.sourceNodeIds).toEqual(['file'])
    expect(sources.find((s) => s.id === 'failed')).toMatchObject({ status: 'failed', text: '' })
    expect(sources.find((s) => s.id === 'empty')).toMatchObject({ status: 'draft', text: '' })
    expect(sources.find((s) => s.id === 'container')!.text).toContain('收入')
    expect(sources.find((s) => s.id === 'stale')!.text).toContain('刷新失败')
    expect(sources.find((s) => s.id === 'stale')!.text).toContain('仍保留的证据')
    expect(JSON.stringify(sources.filter((s) => s.kind !== 'file'))).not.toMatch(/private-secret|\/private\/|authorizationId|not-evidence/)
  })
  it('rejects hostile IPC payloads, wrong owners, browser Origins, credentials and oversized bodies', async () => {
    const f = await fixture()
    await expect(f.bridge.capture({ sessionId: 'parent', path: f.file })).rejects.toThrow()
    const capture = await f.bridge.capture({ sessionId: 'parent' })
    const body = { sessionId: 'parent', captureId: capture.captureId }
    for (const [request, headers] of [[{ ...body, sessionId: 'other' }, {}], [body, { origin: f.endpoint.url }], [body, { authorization: 'Bearer wrong' }], [{ ...body, path: f.file }, {}], [{ ...body, query: 'x'.repeat(20_000) }, {}]] as const) {
      const response = await f.snapshot(request, headers)
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(await response.text()).not.toContain(f.file)
    }
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const mainFrame = { processId: 1, routingId: 2 }
    const window = { isDestroyed: () => false, webContents: { mainFrame } }
    const dispose = registerResearchContextHandlers({ ipcMain: { handle: (name, handler) => handlers.set(name, handler), removeHandler: (name) => { handlers.delete(name) } }, getMainWindow: () => window, bridge: f.bridge })
    const invoke = handlers.get('research:context:capture')!
    expect(() => invoke({ sender: window.webContents, senderFrame: { processId: 1, routingId: 3 } }, { sessionId: 'parent' })).toThrow()
    expect(await invoke({ sender: window.webContents, senderFrame: mainFrame }, { sessionId: 'parent' })).toMatchObject({ totalSources: 9 })
    dispose()
    expect(handlers.size).toBe(0)
  })
  it('bounds captures by count, bytes, TTL and refuses stale completion after stop', async () => {
    let now = 0
    const f = await fixture({ now: () => now, maxCaptures: 1 })
    const old = await f.bridge.capture({ sessionId: 'parent' })
    const latest = await f.bridge.capture({ sessionId: 'parent' })
    expect((await f.snapshot({ sessionId: 'parent', captureId: old.captureId })).status).toBe(404)
    now = 600_001
    expect((await f.snapshot({ sessionId: 'parent', captureId: latest.captureId })).status).toBe(404)
    const tiny = await fixture({ maxStoredBytes: 100 })
    await expect(tiny.bridge.capture({ sessionId: 'parent' })).rejects.toThrow()
    await f.bridge.stop()
    await expect(f.bridge.capture({ sessionId: 'parent' })).rejects.toThrow()
  })
  it('serializes native chart values and markdown/KPI evidence but not empty component scaffolding', async () => {
    const f = await fixture()
    f.storage.setItem('sherlock.research.canvas.files.v1:parent', '[]')
    f.storage.setItem('sherlock.research.canvas.artifacts.v1:parent', JSON.stringify([
      { id: 'chart', kind: 'generated-container', title: '图表', generationStatus: 'completed', containerSpec: { version: 1, type: 'chart', title: '收入', variant: 'bar', labels: ['2025', '2026'], series: [{ name: '营收', values: [20, 30] }] } },
      { id: 'markdown', kind: 'generated-container', title: '分析', generationStatus: 'completed', containerSpec: { version: 1, type: 'markdown', title: '研报', content: '保留的正文' } },
      { id: 'kpi', kind: 'generated-container', title: '指标', generationStatus: 'completed', containerSpec: { version: 1, type: 'kpi', title: '收益率', items: [{ label: '收益', value: '5%', change: '+1%' }] } },
      { id: 'web', kind: 'generated-container', title: '网页容器', generationStatus: 'completed', containerSpec: { version: 1, type: 'web', title: '网站', url: 'https://example.com/?token=secret', description: '不是抓取正文' } },
      { id: 'empty', kind: 'generated-container', title: '空表', generationStatus: 'completed', containerSpec: { version: 1, type: 'table', title: '空', columns: ['待填写'], rows: [] } }
    ]))
    const capture = await f.bridge.capture({ sessionId: 'parent' })
    const { sources } = await (await f.snapshot({ sessionId: 'parent', captureId: capture.captureId })).json()
    expect(sources[0].text).toContain('2026：30')
    expect(sources[1].text).toContain('保留的正文')
    expect(sources[2].text).toContain('收益：5%（+1%）')
    expect(sources[3].text).toBe('')
    expect(sources[4].text).toBe('')
  })
  it('does not turn invalid native component skeletons into evidence', async () => {
    const f = await fixture()
    f.storage.setItem('sherlock.research.canvas.files.v1:parent', '[]')
    f.storage.setItem('sherlock.research.canvas.artifacts.v1:parent', JSON.stringify([
      { id: 'kpi', kind: 'generated-container', title: '空指标', containerSpec: { version: 1, type: 'kpi', title: '空', items: [{}] } },
      { id: 'chart', kind: 'generated-container', title: '空图', containerSpec: { version: 1, type: 'chart', title: '空', labels: ['a'], series: [{ name: '空', values: [] }] } },
      { id: 'table', kind: 'generated-container', title: '空表', containerSpec: { version: 1, type: 'table', title: '空', columns: ['a', 'b'], rows: [['', '']] } }
    ]))
    const capture = await f.bridge.capture({ sessionId: 'parent' })
    const { sources } = await (await f.snapshot({ sessionId: 'parent', captureId: capture.captureId })).json()
    expect(sources.map((source: any) => source.text)).toEqual(['', '', ''])
  })
  it('marks row, column and cell serialization caps even when the final native text fits', async () => {
    const f = await fixture()
    f.storage.setItem('sherlock.research.canvas.files.v1:parent', '[]')
    f.storage.setItem('sherlock.research.canvas.artifacts.v1:parent', JSON.stringify([
      { id: 'rows', rows: Array.from({ length: 501 }, () => ['value']), columns: ['项目'] },
      { id: 'columns', rows: [Array.from({ length: 41 }, () => 'value')], columns: Array.from({ length: 41 }, () => '项目') },
      { id: 'cell', rows: [['x'.repeat(4001)]], columns: ['项目'] }
    ].map(({ id, ...table }) => ({ id, title: id, kind: 'generated-container', generationStatus: 'completed', containerSpec: { version: 1, type: 'table', title: id, ...table } }))))
    const capture = await f.bridge.capture({ sessionId: 'parent' })
    const { sources } = await (await f.snapshot({ sessionId: 'parent', captureId: capture.captureId })).json()
    expect(sources.map((source: any) => source.truncated)).toEqual([true, true, true])
    expect(sources.every((source: any) => source.text.length < 120000)).toBe(true)
  })
  it('stops in-flight capture insertion and sanitizes upstream errors', async () => {
    let finish!: (value: any) => void
    const f = await fixture({ readCanvas: () => new Promise((resolve) => { finish = resolve }) })
    const capture = f.bridge.capture({ sessionId: 'parent' })
    await f.bridge.stop()
    finish({ files: [], artifacts: [] })
    await expect(capture).rejects.toThrow()
    const broken = await fixture({ readCanvas: () => { throw new Error('/private/token secret') } })
    await expect(broken.bridge.capture({ sessionId: 'parent' })).rejects.not.toThrow('/private')
  })
})
