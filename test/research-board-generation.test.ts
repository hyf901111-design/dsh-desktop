import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ResearchBoardIntegration } from '../src/main/research-board-integration'
import { createDocument, projectDocument, mergeDocumentUpdate, encodeDocument } from '../packages/dsh-research-collaboration/document.js'
import { fromBase64, toBase64 } from '../packages/dsh-research-collaboration/protocol.js'

const roots: string[] = []
async function clientArtifacts(nodes: any[]) {
  const require = createRequire(import.meta.url)
  let descriptor: any
  const win = new Window()
  const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  runInNewContext(source, { window: { __ModuleLoader__: { load: (d: any) => { descriptor = d } } }, document: win.document, TextEncoder, AbortController, URL, setTimeout, clearTimeout })
  const fake: any = new Proxy(function () {}, { get: () => fake, apply: () => fake, construct: () => ({}) })
  const client = descriptor.factory((id: string) => ['react', 'react/jsx-runtime'].includes(id) ? require(id) : fake)
  try { return client.parseResearchCanvasArtifactNodes(JSON.stringify(nodes)) } finally { await win.happyDOM.abort() }
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
it('creates a leased workbench for an editor from the shared composer, reusing the request and preserving peer nodes', async () => {
  const { integration, service, canvas, runtimeRequest } = await fixture()
  Object.assign(canvas.artifacts[0]!, { stackOrder: 970 })
  const doc = createDocument(canvas), messages: any[] = [], tasks: any[] = [], commands: any[] = []
  service.taskAuthority = vi.fn(() => ({ localSessionId: 'local', signal: new AbortController().signal, snapshot: { board: { sharingEpoch: 3 }, tasks, snapshot: { canvas: projectDocument(doc) } } })) as any
  ;(integration as any).options.client.request = async ({ body }: any) => {
    commands.push(body)
    const reply: any = { action: body.action, operationId: body.operationId, seq: commands.length }
    if (body.action === 'update') mergeDocumentUpdate(doc, fromBase64(body.update), new Set())
    if (body.action === 'message') { reply.message = { id: 'request', text: body.text, context: body.context }; messages.push(reply.message) }
    if (body.action === 'taskCreate') { reply.task = { ...body, taskId: 'task-' + tasks.length }; tasks.push(reply.task) }
    if (body.action === 'taskClaim') { reply.leaseToken = 'lease'; reply.task = { conversation: true, contextSnapshot: { canvas: projectDocument(doc), messages, history: [] } } }
    return reply
  }
  const plan = { requestId: 'planner-id', title: '医药工作台', panels: [
    { title: '行业概览', type: 'dashboard', size: 'small', prompt: '生成行业概览，注明数据日期' },
    { title: '政策动态', type: 'news', size: 'medium', prompt: '生成政策动态，附可点击来源' }
  ] }
  runtimeRequest.mockImplementation(async (_action, body) => ({ status: 'completed', text: body.kind === 'board' ? JSON.stringify({ type: 'workbench-plan', plan }) : JSON.stringify({ version: 1, type: 'markdown', title: '面板结果', content: '带来源的研究结果' }) }) as any)
  const input = { accountId: 'editor', boardId: 'board', clientMutationId: 'workbench-request', text: '构建医药行业研究工作台', context: { scope: 'board', references: [] }, signal: new AbortController().signal }
  await integration.submit(input)
  await vi.waitFor(() => expect(commands.filter(c => c.action === 'taskResult')).toHaveLength(3))
  expect(runtimeRequest.mock.calls[0]![1]).toMatchObject({ kind: 'board', query: input.text })
  expect(messages).toHaveLength(1)
  expect(tasks).toHaveLength(3)
  expect(tasks.every(t => t.requestMessageId === 'request')).toBe(true)
  const created = projectDocument(doc).artifacts.filter((n: any) => n.workbenchId)
  expect(created).toHaveLength(2)
  expect(created.every(n => Number(n.stackOrder) > 970)).toBe(true)
  expect((await clientArtifacts(created)).every((n: any) => Number(n.stackOrder) > 970)).toBe(true)
  expect((await clientArtifacts(created)).map((n: any) => n.id)).toEqual(created.map((n: any) => n.id))
  // Mixed S/M panels may wrap in the bento layout; their rectangles must not overlap.
  const [a,b] = created as any[]
  expect(Math.abs(a.x-b.x)>=(a.width+b.width)/2 || Math.abs(a.y-b.y)>=(a.height+b.height)/2).toBe(true)
  expect(projectDocument(doc).artifacts.find(n => n.id === 'node')).toEqual(canvas.artifacts[0])
  const results = commands.filter(c => c.action === 'taskResult' && c.node)
  expect(results).toHaveLength(2)
  expect(results.every(c => c.leaseToken === 'lease' && c.node.generationStatus === 'completed')).toBe(true)
  await integration.submit(input)
  expect(runtimeRequest).toHaveBeenCalledTimes(3)
  doc.destroy()
})

async function fixture(tasks: any[] = []) {
  const root = await mkdtemp(join(tmpdir(), 'board-generation-')); roots.push(root)
  const node = { id: 'node', kind: 'generated-container', generationStatus: 'completed', containerSpec: { version: 1, type: 'markdown', title: '已有内容', content: '上一次成功生成的研究内容。' } }
  const canvas = { files: [], artifacts: [node] }
  const contextSnapshot = { canvas, history: [], messages: [{ id: 'message', text: '比特币实时监控面板', context: { scope: 'board', references: [] } }, { id: 'old', text: '计数器无需联网' }] }
  const commands: any[] = []
  const service = { taskAuthority: () => ({ localSessionId: 'local', signal: new AbortController().signal, snapshot: { tasks, snapshot: { canvas } } }), invoke: vi.fn(async () => {}) }
  const runtimeRequest = vi.fn(async (_action: string, _body: any, _signal: AbortSignal): Promise<any> => ({ status: 'failed', errorCode: 'EMPTY_OUTPUT', error: '模型没有返回可展示的内容' }))
  const integration = new ResearchBoardIntegration({ root, storage: {}, registry: {}, clipboard: () => undefined,
    service: () => service, runtimeRequest, runtimeUrl: () => null, runtimeToken: 'test', revealFile() {}, invalidate() {},
    client: { request: async ({ body }: any) => { commands.push(body); return { action: body.action, operationId: body.operationId, seq: commands.length, ...(body.action === 'taskClaim' ? { leaseToken: 'lease', task: { conversation: true, contextSnapshot } } : {}) } } }
  } as any)
  return { integration, runtimeRequest, commands, canvas, service }
}

it('keeps an acknowledged result completed when refreshing the board fails', async () => {
  const task = { taskId: 'task', targetId: 'node', targetCollection: 'artifacts', requestMessageId: 'message', status: 'running' }
  const { integration, runtimeRequest, commands, service } = await fixture([task])
  runtimeRequest.mockResolvedValue({ status: 'completed', text: JSON.stringify({ version: 1, type: 'markdown', title: '结果', content: '已生成' }) })
  service.invoke.mockRejectedValue(Error('NETWORK_UNAVAILABLE'))
  const key = integration.journal.prepare('user', 'board', 'refresh-failed', { text: '生成内容' }, 1)
  await (integration as any).execute(key, task, new AbortController().signal)
  expect(integration.journal.get(key).runtimeState).toBe('completed')
  expect(commands.some(c => c.action === 'taskStop')).toBe(false)
})

it('does not publish stale renderer execution indicators back to a shared node', async () => {
  const task = { taskId: 'task', targetId: 'node', status: 'completed', resultState: 'applied' }
  const { integration, canvas } = await fixture([task])
  Object.assign(canvas.artifacts[0]!, { excerpt: '已有内容' })
  const local = structuredClone(canvas)
  Object.assign(local.artifacts[0]!, { x: 500, excerpt: '画板更改尚未确认', generationStatus: 'failed', generationError: '私有轮询器的旧状态' })
  const projected = await integration.project({ accountId: 'user', accountGeneration: 1, boardId: 'board', epoch: 1, localSessionId: 'local', canvas: local, signal: new AbortController().signal })
  expect(projected.artifacts[0]).toMatchObject({ x: 500, excerpt: '已有内容', generationStatus: 'completed' })
  expect(projected.artifacts[0]!.generationError).toBeUndefined()
})

it('rechecks edit authority after planning and never creates panels after access is revoked', async () => {
  const { integration, service, runtimeRequest, commands } = await fixture()
  const task = { taskId: 'planner', requestMessageId: 'message', status: 'running' }
  const key = integration.journal.prepare('editor', 'board', 'revoked-plan', { text: '创建工作台' }, 1)
  runtimeRequest.mockImplementation(async () => {
    service.taskAuthority = () => { throw Error('ACCESS_REVOKED') }
    return { status: 'completed', text: JSON.stringify({ type: 'workbench-plan', plan: { requestId: 'p', title: '工作台', panels: [0,1].map(i => ({ title: `面板${i}`, prompt: '创建离线组件', type: 'html', size: 'small' })) } }) }
  })
  await (integration as any).execute(key, task, new AbortController().signal)
  expect(commands.some(c => c.action === 'update' || c.action === 'taskCreate' || c.action === 'taskResult')).toBe(false)
  expect(integration.journal.get(key).runtimeError).toBe('ACCESS_REVOKED')
})

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
  service.taskAuthority = vi.fn(() => ({ localSessionId: 'local', signal: new AbortController().signal, snapshot: { board: { sharingEpoch: 3 }, tasks: [], snapshot: { canvas: { files: [], artifacts: [] } } } })) as any
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
  service.taskAuthority = vi.fn(() => ({ localSessionId: 'local', signal: new AbortController().signal, snapshot: { board: { sharingEpoch: 3 }, tasks: [], snapshot: { canvas: projectDocument(doc) } } })) as any
  ;(integration as any).options.client.request = async ({ body }: any) => {
    commands.push(body)
    const reply: any = { action: body.action, operationId: body.operationId, seq: commands.length }
    if (body.action === 'update') mergeDocumentUpdate(doc, fromBase64(body.update), new Set())
    if (body.action === 'message') reply.message = { id: 'new-message', text: body.text, context: body.context }
    if (body.action === 'taskCreate') reply.task = { taskId: 'new-task', requestMessageId: body.requestMessageId, targetId: body.targetId, targetCollection: body.targetCollection }
    if (body.action === 'taskClaim') reply.leaseToken = 'lease', reply.task = { conversation: true, contextSnapshot: { canvas: projectDocument(doc), history: [], messages: [{ id: 'new-message', text: '重新生成计数器', context: { scope: 'board', references: [] } }] } }
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
  service.taskAuthority = vi.fn(() => ({ localSessionId: 'local', signal: new AbortController().signal, snapshot: { board: { sharingEpoch: 3 }, tasks: [], snapshot: { canvas } } })) as any
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
    return { localSessionId: 'local', signal: new AbortController().signal, snapshot: { board: { sharingEpoch: 3 }, tasks: [], snapshot: { canvas: { files: [], artifacts: [] } } } }
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

it('distinguishes a live message-to-task submission from one interrupted by restart', async () => {
  const { integration, service } = await fixture()
  service.taskAuthority = () => ({localSessionId:'local', snapshot:{board:{sharingEpoch:1},tasks:[],snapshot:{canvas:{files:[],artifacts:[]}}}}) as any
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  ;(integration as any).options.client.request = async ({body}: any) => {
    if(body.action === 'message') return {action:body.action,operationId:body.operationId,seq:1,message:{id:'request'}}
    if(body.action === 'taskCreate') { await gate; throw Object.assign(Error('creation failed'),{status:400}) }
    return {}
  }
  const work = integration.submit({accountId:'user',boardId:'board',clientMutationId:'slow',text:'你好',context:{scope:'board',references:[]},signal:new AbortController().signal})
  await vi.waitFor(() => expect(integration.requests('user','board')[0]).toMatchObject({state:'messageAccepted',submissionState:'creating'}))
  release()
  expect(await work).toMatchObject({state:'taskCreateFailed'})
  expect(integration.requests('user','board')[0]).toMatchObject({state:'taskCreateFailed'})
  const key = integration.journal.prepare('user','board','orphan',{text:'尚未创建任务'},1)
  integration.journal.update(key,{reply:{accepted:true,clientMutationId:'orphan',requestMessageId:'orphan-message',taskId:null,state:'messageAccepted'}})
  expect(integration.requests('user','board').find(r=>r.clientMutationId==='orphan')).toMatchObject({submissionState:'interrupted'})
})

it('reports an old collaboration service before starting the main agent', async () => {
  const { integration, runtimeRequest, commands } = await fixture()
  const client = (integration as any).options.client
  const request = client.request
  client.request = async (input: any) => {
    const reply = await request(input)
    if (input.body.action === 'taskClaim') delete reply.task.conversation
    return reply
  }
  const key = integration.journal.prepare('user', 'board', 'old-service', { text: '整理画板' }, 1)
  await (integration as any).execute(key, { taskId: 'task', requestMessageId: 'message' }, new AbortController().signal)
  expect(runtimeRequest).not.toHaveBeenCalled()
  expect(commands.find(c => c.action === 'taskStop')).toMatchObject({ failureCode: 'GENERATION_FAILED' })
  expect(integration.journal.get(key)).toMatchObject({ failureCode: 'COLLABORATION_UPGRADE_REQUIRED', runtimeState: 'interrupted' })
})
it('checkpoints a promoted-away conversation and continues it automatically with a fresh execution id', async () => {
  const task: any = { taskId: 'original', requestMessageId: 'message', status: 'running', conversation: true, yieldRequested: true }
  const { integration, runtimeRequest, commands, service } = await fixture([task])
  const key = integration.journal.prepare('user', 'board', 'original-mutation', { text: '完成原任务' }, 1)
  integration.journal.update(key, { reply: { taskId: task.taskId } })
  runtimeRequest.mockImplementation(async action => action === 'start' ? { status: 'running' } : { status: 'interrupted' })
  await (integration as any).execute(key, task, new AbortController().signal)
  expect(commands.some(c => c.action === 'taskStop')).toBe(false)
  expect(commands.find(c => c.action === 'taskYield')).toMatchObject({ taskId: 'original', executorStopped: true })
  expect(integration.journal.get(key).runtimeState).toBe('paused')
  task.status = 'pending'; task.resumeCount = 1; task.initiatorId = 'user'; delete task.yieldRequested
  service.taskAuthority = () => ({ localSessionId: 'local', signal: new AbortController().signal, snapshot: { tasks: [task], board: { sharingEpoch: 1 }, snapshot: { canvas: { files: [], artifacts: [] } } } } as any)
  runtimeRequest.mockResolvedValue({ status: 'completed', text: '原任务继续完成' })
  integration.requests('user', 'board')
  await vi.waitFor(() => expect(integration.journal.get(key).runtimeState).toBe('completed'))
  const starts = runtimeRequest.mock.calls.filter(([a]) => a === 'start').map(([, body]) => body)
  expect(starts[1].taskId).not.toBe(starts[0].taskId)
  expect(starts[1].sessionId).toBe(starts[0].sessionId)
  expect(starts[1].prompt).toContain('继续此前暂存的任务')
  expect(integration.journal.get(key).runtimeState).toBe('completed')
  expect(commands.filter(c => c.action === 'taskClaim')).toHaveLength(2)
  expect(service.invoke).toHaveBeenCalled()
})
it('workbench component signals are independent of the planning conversation', async () => {
  const { integration, service, canvas } = await fixture()
  const boardLifetime = new AbortController(), planner = new AbortController()
  service.taskAuthority = () => ({ localSessionId: 'local', signal: boardLifetime.signal, snapshot: { board: { sharingEpoch: 1 }, tasks: [], snapshot: { canvas } } } as any)
  const submit = vi.spyOn(integration, 'submit').mockResolvedValue({} as any)
  const key = integration.journal.prepare('user', 'board', 'signal-scope', { text: '工作台' }, 1)
  await (integration as any).createSharedWorkbench(key, 'request', { requestId: 'p', title: '工作台', panels: [0,1].map(i => ({ title: `面板${i}`, prompt: '创建离线组件', type: 'html', size: 'small' })) }, { references: [] }, planner.signal)
  planner.abort()
  expect(submit.mock.calls).toHaveLength(2)
  for (const [request] of submit.mock.calls) expect(request.signal.aborted).toBe(false)
  boardLifetime.abort()
  for (const [request] of submit.mock.calls) expect(request.signal.aborted).toBe(true)
})
it('keeps the planner wide-reading contract on newly created shared workbench nodes',async()=>{
  const {integration,service,canvas}=await fixture();
  service.taskAuthority=()=>({localSessionId:'local',signal:new AbortController().signal,snapshot:{board:{sharingEpoch:1},tasks:[],snapshot:{canvas}}} as any);
  vi.spyOn(integration,'submit').mockResolvedValue({} as any);
  const key=integration.journal.prepare('user','board','wide-scope',{text:'宽比较'},1);
  await (integration as any).createSharedWorkbench(key,'request',{requestId:'wide',title:'交接分析',panels:[{title:'交接比较',prompt:'演练对象比较',type:'html',size:'large',layout:'wide'},{title:'执行清单',prompt:'演练任务',type:'html',size:'small'}]},{references:[]},new AbortController().signal);
  const nodes=integration.journal.get(key).workbench.panels.map((p:any)=>p.node);
  expect(nodes[0]).toMatchObject({workbenchSpan:true,workbenchLayoutVersion:1});expect(nodes[1].y-nodes[1].height/2).toBeGreaterThan(nodes[0].y+nodes[0].height/2);
  integration.stop();
});
it.each([[undefined, 0], ['interrupted', 0], ['paused', 0], [undefined, 1], ['interrupted', 1], ['paused', 1]])('recovers a drained yield after reconnect (state=%s, attempt=%s)', async (runtimeState, attempt) => {
  const task: any = { taskId: 'original', requestMessageId: 'message', initiatorId: 'user', status: 'running', conversation: true, yieldRequested: true, executorId: 'original-executor' }
  const { integration, service, runtimeRequest, commands } = await fixture([task])
  service.taskAuthority = () => ({ localSessionId: 'local', signal: new AbortController().signal, snapshot: { board: { sharingEpoch: 1 }, tasks: [task], snapshot: { canvas: { files: [], artifacts: [] } } } } as any)
  const key = integration.journal.prepare('user', 'board', 'lost-ack', { text: '原任务' }, 1)
  if (attempt) await integration.journal.step(key, 'taskYield', 'taskYield', { taskId: task.taskId, executorId: 'previous-executor', executorStopped: true }, async body => ({ action: body.action, operationId: body.operationId, seq: 1 }))
  integration.journal.update(key, { reply: { taskId: task.taskId }, runtimeState, attempt: 0, executorAttempt: attempt, executorId: 'original-executor', localTaskId: 'original' })
  runtimeRequest.mockResolvedValue({ status: 'interrupted' })
  integration.requests('user', 'board')
  await vi.waitFor(() => expect(commands.some(c => c.action === 'taskYield')).toBe(true))
  expect(runtimeRequest.mock.calls.map(([a]) => a)).toEqual(['cancel'])
  expect(runtimeRequest.mock.calls[0]?.[1]).toEqual({ taskId: attempt ? 'original:resume:1' : 'original', drain: true })
  expect(commands.find(c => c.action === 'taskYield')).toMatchObject({ executorId: 'original-executor', executorStopped: true })
  integration.stop()
})

it('installs native library cards and links atomically with shared tabs, dispatching only missing research',async()=>{
 const {integration,service,canvas,commands}=await fixture();const doc=createDocument(canvas)
 service.taskAuthority=()=>({localSessionId:'local',signal:new AbortController().signal,snapshot:{documentUpdate:toBase64(encodeDocument(doc)),board:{sharingEpoch:1},tasks:[],snapshot:{canvas:projectDocument(doc)}}} as any)
 const submit=vi.spyOn(integration,'submit').mockResolvedValue({} as any)
 const key=integration.journal.prepare('user','board','native-library',{text:'自选行情和财务'},1)
 const native=(widget:string,options:any={})=>({title:widget,prompt:'按所选股票展示',type:'financial-widget',library:{id:'builtin-'+widget,options}})
 const plan={requestId:'native-library',title:'芯片投研',panels:[native('watchlist',{symbols:[{market:'SH',code:'688981',name:'中芯国际'}]}),native('quote'),native('news'),{title:'财务',prompt:'对比真实财务记录',type:'table'}],links:[{sourcePanel:0,targetPanel:1},{sourcePanel:1,targetPanel:2}],tabs:[{name:'监控',panelIndexes:[0,1,2]},{name:'财务',panelIndexes:[3]}]}
 try{
  await (integration as any).createSharedWorkbench(key,'request',plan,{references:[]},new AbortController().signal)
  const update=commands.find((c:any)=>c.action==='update');mergeDocumentUpdate(doc,fromBase64(update.update),new Set())
  const after=projectDocument(doc),nodes=integration.journal.get(key).workbench.panels.map((p:any)=>p.node)
  expect(submit).toHaveBeenCalledTimes(1);expect(submit.mock.calls[0]![0].targetId).toBe(nodes[3].id)
  expect(after.artifacts.find((n:any)=>n.id==='node')).toEqual(canvas.artifacts[0])
  expect(nodes[1].containerSpec.linkedWatchlistId).toBe(nodes[0].id)
  expect(nodes[2].containerSpec.linkedSourceId).toBe(nodes[1].id)
  expect(nodes[2].containerSpec.symbols).toEqual(nodes[0].containerSpec.symbols)
  const nav=after.artifacts.find((n:any)=>n.containerSpec?.type==='board-tabs') as any
  expect(nav.containerSpec.tabs.map((t:any)=>t.name)).toEqual(['原有内容','监控','财务'])
  expect(nav.containerSpec.tabs[1].nodeIds).toEqual(nodes.slice(0,3).map((n:any)=>n.id))
  // Replay uses the reserved update and stable IDs, without duplicate cards.
  mergeDocumentUpdate(doc,fromBase64(update.update),new Set());expect(projectDocument(doc).artifacts).toHaveLength(6)
 }finally{integration.stop();doc.destroy()}
})
