import { it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ResearchBoardIntegration } from '../src/main/research-board-integration'
import { omitUnchangedTabRecovery, preserveSharedBoardTabMembership, restoreUnassignedSharedBoardCards } from '../src/main/state/research-board-tab-membership'

it('materializes a legacy shared workbench with its original card assignments', async () => {
  const nav = { id: 'new-nav', kind: 'generated-container', containerSpec: {
    version: 1, type: 'board-tabs', title: '页签', revision: 1,
    tabs: [{ id: 'market', name: '市场', nodeIds: ['plan-0', 'unchanged'] },
      { id: 'competitors', name: '竞品', nodeIds: ['plan-1'] },
      { id: 'notes', name: '备注', nodeIds: ['other-0'] }]
  } }
  const canvas = { files: [], artifacts: [nav,
    { id: 'new-peers', workbenchId: 'plan', workbenchIndex: 1 },
    { id: 'new-summary', workbenchId: 'plan', workbenchIndex: 0 },
    { id: 'unchanged', workbenchId: 'other', workbenchIndex: 0 }
  ] }
  const integration: any = Object.create(ResearchBoardIntegration.prototype)
  integration.authority = () => ({ snapshot: { tasks: [] } })
  integration.active = new Map()
  integration.schedules = {}
  const rendered = await integration.materialize({
    accountId: 'a', boardId: 'b', epoch: 1, localSessionId: 's', canvas, signal: new AbortController().signal
  })
  expect(rendered.artifacts[0].containerSpec.tabs.map((tab: any) => tab.nodeIds))
    .toEqual([['new-summary', 'unchanged'], ['new-peers'], ['other-0']])
  expect(nav.containerSpec.tabs[0]!.nodeIds).toEqual(['plan-0', 'unchanged'])
})

it('renders recoverable cards when every saved tab is empty and there is no linked personal source', async () => {
  const canvas = { files: [], artifacts: [
    { id: 'tabs', kind: 'generated-container', containerSpec: {
      version: 1, type: 'board-tabs', title: '页签', revision: 1,
      tabs: [{ id: 'market', name: '市场面', nodeIds: [] }, { id: 'channels', name: '渠道', nodeIds: [] }]
    } },
    { id: 'later', kind: 'generated-container', workbenchId: 'plan', workbenchIndex: 1 },
    { id: 'first', kind: 'generated-container', workbenchId: 'plan', workbenchIndex: 0 }
  ] }
  const integration: any = Object.create(ResearchBoardIntegration.prototype)
  integration.authority = () => ({ snapshot: { tasks: [] } })
  integration.active = new Map()
  integration.schedules = {}
  const rendered = await integration.materialize({
    accountId: 'a', boardId: 'b', epoch: 1, localSessionId: 's', canvas, signal: new AbortController().signal
  })
  expect(rendered.artifacts[0].containerSpec.tabs.map((tab: any) => tab.nodeIds)).toEqual([[], [], ['first', 'later']])
  expect(canvas.artifacts[0]!.containerSpec!.tabs.map(tab => tab.nodeIds)).toEqual([[], []])
})

it('keeps inferred placements local while allowing an explicit move to another tab', () => {
  const base = { files: [], artifacts: [
    { id: 'tabs', containerSpec: { version: 1, type: 'board-tabs', title: '页签', revision: 1,
      tabs: [{ id: 'one', name: '一', nodeIds: ['assigned'] }, { id: 'two', name: '二', nodeIds: [] as string[] }] } },
    { id: 'assigned' }, { id: 'orphan', title: '业务组件' }, { id: 'another' }
  ] }
  const visible = structuredClone(base)
  restoreUnassignedSharedBoardCards(visible)
  const edit = structuredClone(visible)
  edit.artifacts[2]!.title = '更新内容'
  omitUnchangedTabRecovery(edit, base, visible)
  expect(edit.artifacts[0]!.containerSpec).toEqual(base.artifacts[0]!.containerSpec)
  expect(edit.artifacts[2]!.title).toBe('更新内容')
  const moved = structuredClone(visible)
  const [, two, recovery] = moved.artifacts[0]!.containerSpec!.tabs
  recovery!.nodeIds = recovery!.nodeIds.filter(id => id !== 'orphan'); two!.nodeIds.push('orphan')
  omitUnchangedTabRecovery(moved, base, visible)
  expect(moved.artifacts[0]!.containerSpec!.tabs.map(t => t.nodeIds)).toEqual([['assigned'], ['orphan']])
})

it('preserves membership on a stale submission and accepts explicit moves', () => {
  const base = { files: [], artifacts: [
    { id: 'tabs', containerSpec: { version: 1, type: 'board-tabs', title: '页签', revision: 1,
      tabs: [{ id: 'one', name: '一', nodeIds: ['keep', 'move', 'delete'] }, { id: 'two', name: '二', nodeIds: [] as string[] }] } },
    { id: 'keep' }, { id: 'move' }, { id: 'delete' }
  ] }
  const next = structuredClone(base)
  next.artifacts.pop()
  const tabs = next.artifacts[0]!.containerSpec!.tabs
  tabs[0]!.nodeIds = []
  tabs[1]!.nodeIds = ['move']
  preserveSharedBoardTabMembership(next, base)
  expect(next.artifacts[0]!.containerSpec!.tabs.map(tab => tab.nodeIds)).toEqual([['keep'], ['move']])
})

it('restores missing shared component coordinates without changing the stored snapshot', async () => {
  const canvas = { files: [], artifacts: [
    { id: 'tabs', kind: 'generated-container', x: 112, width: 200, height: 34,
      containerSpec: { version: 1, type: 'board-tabs', title: '页签', revision: 1,
        tabs: [{ id: 'market', name: '市场', nodeIds: ['first', 'later'] }] } },
    { id: 'later', kind: 'generated-container', workbenchId: 'plan', workbenchIndex: 2 },
    { id: 'first', kind: 'generated-container', workbenchId: 'plan', workbenchIndex: 1 },
    { id: 'placed', kind: 'generated-container', x: 280, y: 240, width: 320, height: 220 }
  ] }
  const integration: any = Object.create(ResearchBoardIntegration.prototype)
  integration.authority = () => ({ snapshot: { tasks: [] } })
  integration.active = new Map()
  integration.schedules = {}
  const rendered = await integration.materialize({
    accountId: 'a', boardId: 'b', epoch: 1, localSessionId: 's', canvas, signal: new AbortController().signal
  })
  const [tabs, later, first, placed] = rendered.artifacts
  expect(tabs).toMatchObject({ x: 112, y: expect.any(Number), width: 200, height: 34 })
  expect(first.y).toBeLessThan(later.y)
  expect(first).toMatchObject({ x: expect.any(Number), width: expect.any(Number), height: expect.any(Number) })
  expect(placed).toMatchObject({ x: 280, y: 240, width: 320, height: 220 })
  expect(canvas.artifacts[0]).not.toHaveProperty('y')
  expect(canvas.artifacts[1]).not.toHaveProperty('x')
})

it('recovers empty legacy tabs from the verified local source with the same workbench cards', async () => {
  const tabs = (nodeIds: string[]) => ({
    version: 1, type: 'board-tabs', title: '页签', revision: 1,
    tabs: [{ id: 'market', name: '市场', nodeIds }]
  })
  const canvas = { files: [], artifacts: [
    { id: 'shared-tabs', kind: 'generated-container', containerSpec: tabs([]) },
    { id: 'shared-card', kind: 'generated-container', workbenchId: 'plan', workbenchIndex: 0 }
  ] }
  const source = { files: [], artifacts: [
    { id: 'local-tabs', containerSpec: tabs(['local-card']) },
    { id: 'local-card', workbenchId: 'plan', workbenchIndex: 0, x: 300, y: 240 }
  ] }
  const integration: any = Object.create(ResearchBoardIntegration.prototype)
  integration.authority = () => ({ snapshot: { tasks: [] }, sourceSessionId: 'verified-source' })
  integration.readOriginal = (sessionId: string) => {
    expect(sessionId).toBe('verified-source')
    return source
  }
  integration.active = new Map()
  integration.schedules = {}
  const input = {
    accountId: 'a', boardId: 'b', epoch: 1, localSessionId: 's', canvas, signal: new AbortController().signal
  }
  const rendered = await integration.materialize(input)
  expect(rendered.artifacts[0].containerSpec.tabs[0].nodeIds).toEqual(['shared-card'])
  expect(rendered.artifacts[1]).toMatchObject({ x: 300, y: 240 })
  expect(canvas.artifacts[0]!.containerSpec!.tabs[0]!.nodeIds).toEqual([])
  const positioned = structuredClone(canvas)
  Object.assign(positioned.artifacts[0]!, { x: 112, y: 29 })
  Object.assign(positioned.artifacts[1]!, { x: 300, y: 240 })
  const current = await integration.materialize({ ...input, canvas: positioned })
  expect(current.artifacts[0].containerSpec.tabs[0].nodeIds).toEqual(['shared-card'])
  expect(current.artifacts[0].x).toBe(112)
})

it.each([false, true])('copies canvas and generation sources into the project, including unchanged sessions (%s)', async changed => {
  const temp = await mkdtemp(join(tmpdir(), 'board-materials-'))
  try {
    const root = await realpath(temp), target = join(root, '看板目录')
    await mkdir(target)
    const source = join(root, '资料.txt'); await writeFile(source, 'board evidence')
    let canvas: any = { files: [{ id: 'f', name: '资料.txt', path: source }], artifacts: [{ id: 'a', generationSources: [{ type: 'file', path: source }] }] }
    const integration: any = Object.create(ResearchBoardIntegration.prototype)
    integration.runtime = async () => ({ path: target, localSessionId: changed ? 'new' : 'original' })
    integration.snapshots = { cloneLocalImport: async () => {} }
    integration.readOriginal = () => canvas
    integration.resolveSource = async (_id: string, node: any) => ({ path: node.path })
    integration.options = { service: () => ({ isSharedSession: () => false }), registry: { admitFinder: async () => ({ authorizationId: 'grant', contentType: 'text/plain' }) }, storage: { setItem: (key: string, value: string) => { canvas[key.includes('.files.') ? 'files' : 'artifacts'] = JSON.parse(value); return true } } }
    await integration.directory({ mode: 'workspace', sessionId: 'original' }, new AbortController().signal)
    const paths = [canvas.files[0].path, canvas.artifacts[0].generationSources[0].path]
    for (const path of paths) { expect(path.startsWith(target + '/')).toBe(true); expect(await readFile(path, 'utf8')).toBe('board evidence') }
    await integration.directory({ mode: 'workspace', sessionId: 'original' }, new AbortController().signal)
    expect([canvas.files[0].path, canvas.artifacts[0].generationSources[0].path]).toEqual(paths)
    expect(await readFile(source, 'utf8')).toBe('board evidence')
  } finally { await rm(temp, { recursive: true, force: true }) }
})

it('canonicalizes an aliased runtime directory before freezing shared files', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'board-alias-'))
  try {
    const real = await realpath(temp), data = join(real, 'data'), alias = join(real, 'alias')
    await mkdir(data); await symlink(data, alias)
    const source = join(real, 'evidence.txt'); await writeFile(source, 'shared evidence')
    const integration: any = new ResearchBoardIntegration({ root: alias, storage: {}, registry: {}, clipboard: () => undefined, service: () => ({}), runtimeUrl: () => null, runtimeToken: 'test', revealFile() {}, invalidate() {}, client: {} } as any)
    const frozen = await integration.cache.freeze(source, 'evidence.txt', new AbortController().signal)
    expect(await integration.cache.verify(frozen)).toBe(true)
    expect(integration.cache.path(frozen).startsWith(data + '/')).toBe(true)
  } finally { await rm(temp, { recursive: true, force: true }) }
})
