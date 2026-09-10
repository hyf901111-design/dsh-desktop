import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ResearchBoardIntegration } from '../src/main/research-board-integration'

const roots: string[] = []
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
  return { integration, runtimeRequest, commands, canvas }
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

it('shows the same terminal failure on peer components and preserves previous successful content', async () => {
  const { integration, canvas } = await fixture([{ taskId: 'task', targetId: 'node', status: 'failed', failureCode: 'EMPTY_OUTPUT' }])
  const result = await integration.materialize({ accountId: 'user', boardId: 'board', epoch: 1, localSessionId: 'local', canvas, signal: new AbortController().signal })
  expect(result.artifacts[0]).toMatchObject({ generationStatus: 'failed', generationError: '模型没有返回可展示的内容，自动恢复仍未完成。', refreshError: '模型没有返回可展示的内容，自动恢复仍未完成。', containerSpec: canvas.artifacts[0]!.containerSpec })
})
