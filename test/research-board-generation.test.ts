import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ResearchBoardIntegration } from '../src/main/research-board-integration'
import { createDocument, projectDocument, mergeDocumentUpdate } from '../packages/dsh-research-collaboration/document.js'
import { fromBase64 } from '../packages/dsh-research-collaboration/protocol.js'

const roots: string[] = []
async function clientArtifacts(nodes: any[]) {
  const require = createRequire(import.meta.url)
  let descriptor: any
  const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  runInNewContext(source, { window: { __ModuleLoader__: { load: (d: any) => { descriptor = d } } }, document: undefined, TextEncoder, AbortController, URL, setTimeout, clearTimeout })
  const fake: any = new Proxy(function () {}, { get: () => fake, apply: () => fake, construct: () => ({}) })
  const client = descriptor.factory((id: string) => ['react', 'react/jsx-runtime'].includes(id) ? require(id) : fake)
  return client.parseResearchCanvasArtifactNodes(JSON.stringify(nodes))
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture(tasks: any[] = []) {
  const root = await mkdtemp(join(tmpdir(), 'board-generation-')); roots.push(root)
  const node = { id: 'node', kind: 'generated-container', generationStatus: 'completed', containerSpec: { version: 1, type: 'markdown', title: '已有内容', content: '上一次成功生成的研究内容。' } }
  const canvas = { files: [], artifacts: [node] }
  const contextSnapshot = { canvas, history: [], messages: [{ id: 'message', text: '比特币实时监控面板', context: { scope: 'board', references: [] } }, { id: 'old', text: '计数器无需联网' }] }
  const commands: any[] = []
  const service = { taskAuthority: () => ({ localSessionId: 'local', snapshot: { tasks, snapshot: { canvas } } }), invoke: vi.fn(async () => {}) }
  const runtimeRequest = vi.fn(async (_action: string, _body: any, _signal: AbortSignal) => ({ status: 'failed', errorCode: 'EMPTY_OUTPUT', error: '模型没有返回可展示的内容' }))
  const integration = new ResearchBoardIntegration({ root, storage: {}, registry: {}, clipboard: () => undefined,
    service: () => service, runtimeRequest, runtimeUrl: () => null, runtimeToken: 'test', revealFile() {}, invalidate() {},
    client: { request: async ({ body }: any) => { commands.push(body); return { action: body.action, operationId: body.operationId, seq: commands.length, ...(body.action === 'taskClaim' ? { leaseToken: 'lease', task: { contextSnapshot } } : {}) } } }
  } as any)
  return { integration, runtimeRequest, commands, canvas, service }
}

it('sends only the current request as the retrieval query and publishes typed failure without raw error text', async () => {
  const task = { taskId: 'task', targetId: 'node', targetCollection: 'artifacts', requestMessageId: 'message', status: 'running' }
  const { integration, runtimeRequest, commands } = await fixture([task])
  const key = integration.journal.prepare('user', 'board', 'request', { text: '比特币实时监控面板' }, 1)
  integration.journal.update(key, { reply: { taskId: 'task' } })
  await (integration as any).execute(key, task, new AbortController().signal)
  expect(runtimeRequest.mock.calls[0]![1]).toMatchObject({ query: '比特币实时监控面板' })
  expect(commands.find(c => c.action === 'taskStop')).toMatchObject({ failureCode: 'EMPTY_OUTPUT' })
  expect(commands.find(c => c.action === 'taskStop').error).toBeUndefined()
})

it('restarts an explicitly retried request under current authority after sharing was reopened', async () => {
  const { integration, service } = await fixture()
  service.taskAuthority = vi.fn(() => ({ localSessionId: 'local', snapshot: { board: { sharingEpoch: 3 }, tasks: [], snapshot: { canvas: { files: [], artifacts: [] } } } })) as any
  const intent = { text: '重新生成计数器', context: { scope: 'board', references: [] }, targetId: 'removed', targetCollection: 'artifacts', source: 'manual' }
  const key = integration.journal.prepare('user', 'board', 'old', intent, 1)
  integration.journal.update(key, { runtimeState: 'superseded', reply: { taskId: 'old-task', requestMessageId: 'old-message' }, restart: { epoch: 3, mutation: 'previous-chat-retry', intent: { text: intent.text, context: intent.context, source: 'manual' } } })
  expect(integration.requests('user', 'board')[0]!.runtimeState).toBe('interrupted')
  const submit = vi.spyOn(integration, 'submit').mockImplementation(async i => ({ accepted: true, clientMutationId: i.clientMutationId, taskId: 'new-task' }))
  await integration.retry('user', 'board', 'old', new AbortController().signal)
  await integration.retry('user', 'board', 'old', new AbortController().signal)
  const first = submit.mock.calls[0]![0], second = submit.mock.calls[1]![0]
  expect(first).toMatchObject({ accountId: 'user', boardId: 'board', text: intent.text, source: 'manual' })
  expect(first.targetId).toBeTruthy()
  expect(first.targetId).not.toBe('removed')
  expect(first.replacementUpdate).toBeTruthy()
  expect(first.clientMutationId).not.toBe('old')
  expect(second.clientMutationId).toBe(first.clientMutationId)
  expect(integration.journal.get(key)).toMatchObject({ epoch: 1, runtimeState: 'superseded' })
  expect(integration.requests('user', 'board')[0]!.runtimeState).toBe('superseded')
  expect(service.taskAuthority).toHaveBeenCalledWith('user', 'board', undefined, true)
})

it('creates and fills a new canvas component when the old retry target was deleted, preserving existing components', async () => {
  const { integration, service, canvas, runtimeRequest } = await fixture()
  const doc = createDocument(canvas)
  const commands: any[] = []
  service.taskAuthority = vi.fn(() => ({ localSessionId: 'local', snapshot: { board: { sharingEpoch: 3 }, tasks: [], snapshot: { canvas: projectDocument(doc) } } })) as any
  ;(integration as any).options.client.request = async ({ body }: any) => {
    commands.push(body)
    const reply: any = { action: body.action, operationId: body.operationId, seq: commands.length }
    if (body.action === 'update') mergeDocumentUpdate(doc, fromBase64(body.update), new Set())
    if (body.action === 'message') reply.message = { id: 'new-message', text: body.text, context: body.context }
    if (body.action === 'taskCreate') reply.task = { taskId: 'new-task', requestMessageId: body.requestMessageId, targetId: body.targetId, targetCollection: body.targetCollection }
    if (body.action === 'taskClaim') reply.leaseToken = 'lease', reply.task = { contextSnapshot: { canvas: projectDocument(doc), history: [], messages: [{ id: 'new-message', text: '重新生成计数器', context: { scope: 'board', references: [] } }] } }
    return reply
  }
  runtimeRequest.mockResolvedValue({ status: 'completed', text: JSON.stringify({ version: 1, type: 'html', title: '计数器', html: '<button>加一</button>' }) } as any)
  const key = integration.journal.prepare('user', 'board', 'old', { text: '重新生成计数器', context: { scope: 'board', references: [] }, targetId: 'removed', targetCollection: 'artifacts', source: 'manual' }, 1)
  integration.journal.update(key, { runtimeState: 'interrupted', reply: { taskId: 'old-task' } })
  await integration.retry('user', 'board', 'old', new AbortController().signal)
  await vi.waitFor(() => expect(commands.some(c => c.action === 'taskResult')).toBe(true))
  expect(runtimeRequest.mock.calls[0]![1]).toMatchObject({ kind: 'container', query: '重新生成计数器' })
  const result = commands.find(c => c.action === 'taskResult')
  expect(result.node).toMatchObject({ kind: 'generated-container', generationStatus: 'completed', containerSpec: { type: 'html', title: '计数器' } })
  expect(result.node.id).not.toBe('removed')
  expect((await clientArtifacts([result.node])).map((n: any) => n.id)).toEqual([result.node.id])
  expect((await clientArtifacts(projectDocument(doc).artifacts)).some((n: any) => n.id === result.node.id)).toBe(true)
  expect(projectDocument(doc).artifacts.find((n: any) => n.id === 'node')).toEqual(canvas.artifacts[0])
  expect(commands.filter(c => c.action === 'update')).toHaveLength(1)
  doc.destroy()
})

it('restores already generated legacy components to the actual client renderer without rerunning the model', async () => {
  const { integration, runtimeRequest } = await fixture()
  const legacy = { id: 'legacy', kind: 'generated-container', title: '智能容器', x: 40, y: 800, width: 520, height: 380, containerPrompt: '生成计数器', generationStatus: 'completed', containerSpec: { version: 1, type: 'html', title: '计数器', html: '<button>加一</button>' } }
  expect(await clientArtifacts([legacy])).toEqual([])
  const repaired = await integration.materialize({ accountId: 'user', boardId: 'board', epoch: 3, localSessionId: 'local', canvas: { files: [], artifacts: [legacy] }, signal: new AbortController().signal })
  expect((await clientArtifacts(repaired.artifacts)).map((n: any) => n.id)).toEqual(['legacy'])
  expect(repaired.artifacts[0]!.containerSpec).toEqual(legacy.containerSpec)
  expect(runtimeRequest).not.toHaveBeenCalled()
})

it('does not restart old requests after current edit access is revoked', async () => {
  const { integration, service } = await fixture()
  service.taskAuthority = vi.fn(() => { throw Error('ACCESS_REVOKED') })
  const key = integration.journal.prepare('user', 'board', 'old', { text: '计数器', context: { scope: 'board', references: [] } }, 1)
  integration.journal.update(key, { runtimeState: 'interrupted', reply: { taskId: 'old-task' } })
  const submit = vi.spyOn(integration, 'submit')
  await expect(integration.retry('user', 'board', 'old', new AbortController().signal)).rejects.toThrow('ACCESS_REVOKED')
  expect(submit).not.toHaveBeenCalled()
})

it('resumes the same reserved request after a lost reply, retaining an existing target and never restoring a refresh schedule', async () => {
  const { integration, service, canvas, commands } = await fixture()
  service.taskAuthority = vi.fn(() => ({ localSessionId: 'local', snapshot: { board: { sharingEpoch: 3 }, tasks: [], snapshot: { canvas } } })) as any
  const key = integration.journal.prepare('user', 'board', 'old', { text: '刷新计数器', context: { scope: 'board', references: [] }, targetId: 'node', targetCollection: 'artifacts', source: 'refresh', refreshScheduleId: 'stale-schedule' }, 1)
  integration.journal.update(key, { runtimeState: 'interrupted', reply: { taskId: 'old-task' } })
  const submit = vi.spyOn(integration, 'submit').mockRejectedValueOnce(Error('connection lost')).mockResolvedValue({ accepted: true, taskId: 'new-task' })
  await expect(integration.retry('user', 'board', 'old', new AbortController().signal)).rejects.toThrow('connection lost')
  canvas.artifacts.splice(0)
  await integration.retry('user', 'board', 'old', new AbortController().signal)
  const first = submit.mock.calls[0]![0], second = submit.mock.calls[1]![0]
  expect(first).toMatchObject({ targetId: 'node', targetCollection: 'artifacts', source: 'manual', expectedEpoch: 3 })
  expect(first.refreshScheduleId).toBeUndefined()
  expect({ ...first, signal: null }).toEqual({ ...second, signal: null })
  expect(commands).toEqual([])
  expect(integration.journal.get(key)).toMatchObject({ epoch: 1, steps: {}, runtimeState: 'superseded' })
})

it('deduplicates concurrent explicit retries before issuing a new task and rejects another epoch change', async () => {
  const { integration, service } = await fixture()
  service.taskAuthority = vi.fn((_a: string, _b: string, epoch?: number) => {
    if (epoch !== undefined && epoch !== 3) throw Error('BOARD_ACCESS_CHANGED')
    return { localSessionId: 'local', snapshot: { board: { sharingEpoch: 3 }, tasks: [], snapshot: { canvas: { files: [], artifacts: [] } } } }
  }) as any
  const key = integration.journal.prepare('user', 'board', 'old', { text: '计数器', context: { scope: 'board', references: [] } }, 1)
  integration.journal.update(key, { runtimeState: 'interrupted', reply: { taskId: 'old-task' } })
  let finish!: (reply: any) => void
  const submitOnce = vi.spyOn(integration as any, 'submitOnce').mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const retries = [integration.retry('user', 'board', 'old', new AbortController().signal), integration.retry('user', 'board', 'old', new AbortController().signal)]
  expect(submitOnce).toHaveBeenCalledTimes(1)
  finish({ accepted: true, taskId: 'new-task' })
  await Promise.all(retries)
  await expect(integration.submit({ accountId: 'user', boardId: 'board', clientMutationId: 'race', expectedEpoch: 2, context: { scope: 'board', references: [] } })).rejects.toThrow('BOARD_ACCESS_CHANGED')
  expect(submitOnce).toHaveBeenCalledTimes(1)
})

it('shows the same terminal failure on peer components and preserves previous successful content', async () => {
  const { integration, canvas } = await fixture([{ taskId: 'task', targetId: 'node', status: 'failed', failureCode: 'EMPTY_OUTPUT' }])
  const result = await integration.materialize({ accountId: 'user', boardId: 'board', epoch: 1, localSessionId: 'local', canvas, signal: new AbortController().signal })
  expect(result.artifacts[0]).toMatchObject({ generationStatus: 'failed', generationError: '模型没有返回可展示的内容，自动恢复仍未完成。', refreshError: '模型没有返回可展示的内容，自动恢复仍未完成。', containerSpec: canvas.artifacts[0]!.containerSpec })
})
