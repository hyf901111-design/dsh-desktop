import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import { inject as runtimeDependencies } from '../packages/dsh-research-task-runtime/index.js'
import { Session } from '@deepseek-ai/dsh-session'
import { BoardDirectories } from '../packages/dsh-research-task-runtime/board-directories.js'
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'board-directories-')), sessions = new Map(), persisted = new Map(), workspaces = new Map()
  let observe
  const ctx = {
    on: (_name, fn) => { observe = fn; return () => {} },
    agents: { get: () => undefined },
    sessions: { get: id => sessions.get(id), flush: async session => { persisted.set(session.id, session); return true },
      prepare: (id, options) => Session.create(id, options.seed, { version: 0, id, createdAt: Date.now(), ...options.meta }),
      enter: session => { sessions.set(session.id, session); return () => sessions.delete(session.id) },
      announce: () => {},
      create: (id, options) => { const session=ctx.sessions.prepare(id, options);ctx.sessions.enter(session);return session } },
    sessionPersistence: { inspect: async id => { const s = sessions.get(id) ?? persisted.get(id); if (!s) throw Error('MISSING'); return { meta: s.header, events: s.events } } },
    workspaceRegistry: { resolveByPath: async p => workspaces.get(p), create: async p => {
      const workspace = { id: 'workspace-' + workspaces.size, path: p, title: '', sessionIds: [], setTitle: async title => { workspace.title = title }, attachSession: async id => {
        if ((sessions.get(id) ?? persisted.get(id)).header.cwd !== p || !existsSync(p)) throw Error('INVALID_CWD')
        if (!workspace.sessionIds.includes(id)) workspace.sessionIds.push(id)
      } }; workspaces.set(p, workspace); return workspace
    } }
  }
  const directories = new BoardDirectories(ctx, root)
  return { root, sessions, persisted, directories, workspaces, ctx, observe: (...args) => observe(...args), close: () => { directories.dispose(); rmSync(root, { recursive: true, force: true }) } }
}
describe('research board directories', () => {
  it('can return a board through the real scoped Host service container', async () => {
    const f = fixture(), root = new Context()
    try {
      for (const name of runtimeDependencies) root.provide(name, f.ctx[name] ?? {})
      // Register it even when missing from inject so Cordis, rather than the fake
      // service object, validates the production plugin dependency boundary.
      if (!runtimeDependencies.includes('workspaceRegistry')) root.provide('workspaceRegistry', f.ctx.workspaceRegistry)
      const row = f.directories.reserve(f.root, '宿主依赖验收')
      f.ctx.sessions.create('scoped-board', { meta: { cwd: row.path } })
      await f.directories.run({ mode: 'bind', directoryId: row.directoryId, sessionId: 'scoped-board' })
      const result = await new Promise((resolve, reject) => {
        root.plugin({ inject: runtimeDependencies, apply(ctx) {
          const directories = new BoardDirectories(ctx, f.root)
          directories.run({ mode: 'workspace', sessionId: 'scoped-board', title: row.title, basePath: f.root }).then(resolve, reject).finally(() => directories.dispose())
        } })
      })
      expect(result.localSessionId).toBe('scoped-board')
      expect(f.workspaces.get(row.path).sessionIds).toEqual(['scoped-board'])
    } finally { f.close() }
  })
  it('resolves one reusable app session per board in its own file workspace',async()=>{
    const f=fixture()
    try {
      const board=f.directories.reserve(f.root,'协作看板')
      f.ctx.sessions.create('board',{meta:{cwd:board.path}})
      await f.directories.run({mode:'bind',directoryId:board.directoryId,sessionId:'board'})
      const input={mode:'app-workspace',sessionId:'board'}
      const result=await f.directories.run(input)
      expect(result).toMatchObject({path:board.path,workspaceId:'workspace-0',appSessionId:expect.stringMatching(/^board-app-/)})
      expect(f.workspaces.get(board.path).sessionIds).toEqual([])
      expect(await f.directories.run(input)).toEqual(result)
      expect(f.sessions.has(result.appSessionId)).toBe(false)

      const another=f.directories.reserve(f.root,'个人看板')
      f.ctx.sessions.create('another',{meta:{cwd:another.path}})
      await f.directories.run({mode:'bind',directoryId:another.directoryId,sessionId:'another'})
      const second=await f.directories.run({...input,sessionId:'another'})
      expect(second.path).toBe(another.path)
      expect(second.appSessionId).not.toBe(result.appSessionId)
    } finally {f.close()}
  })
  it('keeps blank boards virtual across restart and materializes only their own path for file tools', async () => {
    const f = fixture()
    try {
      const row = await f.directories.run({ mode: 'reserve', basePath: f.root, title: '空看板' })
      expect(existsSync(row.path)).toBe(false)
      mkdirSync(row.path, { recursive: true })
      const s = f.ctx.sessions.create('new-board', { meta: { cwd: row.path } })
      await f.directories.run({ mode: 'bind', directoryId: row.directoryId, sessionId: s.id })
      expect(existsSync(row.path)).toBe(false)
      f.directories.dispose()
      f.directories = new BoardDirectories(f.ctx, f.root)
      f.observe(s, { type: 'assistant/message' })
      expect(existsSync(row.path)).toBe(false)
      f.observe(s, { type: 'tool/call', data: { name: 'web_search' } })
      expect(existsSync(row.path)).toBe(false)
      f.observe(s, { type: 'tool/call', data: { name: 'write' } })
      expect(existsSync(row.path)).toBe(true)
      writeFileSync(join(row.path, 'result.txt'), '保留资料')
      await f.directories.run({ mode: 'bind', directoryId: row.directoryId, sessionId: s.id })
      expect(readFileSync(join(row.path, 'result.txt'), 'utf8')).toBe('保留资料')
      const moved = await f.directories.run({ mode: 'workspace', sessionId: s.id, title: '空看板', basePath: f.root })
      expect(moved.localSessionId).toBe(s.id)
      expect(f.workspaces.get(row.path).sessionIds).toEqual([s.id])
    } finally { f.close() }
  })
  it('relocates legacy sessions without changing their immutable source, reuses failed-attempt destination, and rejects a busy source', async () => {
    const f = fixture()
    try {
      const original = f.ctx.sessions.create('legacy', { meta: { cwd: f.root } })
      original.append('session/title', { title: '研究上下文' })
      const input = { mode: 'workspace', sessionId: original.id, basePath: f.root, title: '新工作区' }
      const moved = await f.directories.run(input)
      expect(moved.localSessionId).not.toBe(original.id)
      expect(f.persisted.get(moved.localSessionId).events.slice(0, original.events.length)).toEqual(original.events)
      expect(f.persisted.get(moved.localSessionId).events.at(-1).type).toBe('session/end-seed')
      expect(original.header.cwd).toBe(f.root)
      expect((await f.directories.run(input)).localSessionId).toBe(moved.localSessionId)
      f.ctx.agents.get = () => ({ status: 'running' })
      await expect(f.directories.run(input)).rejects.toThrow('BOARD_BUSY')
    } finally { f.close() }
  })
})

it('associates a blank board without creating a workspace and retains its unique directory across switches', async () => {
  const f = fixture()
  try {
    const a = f.directories.reserve(f.root, '同名看板'), b = f.directories.reserve(f.root, '同名看板')
    expect(a.path).not.toBe(b.path)
    f.ctx.sessions.create('board', { meta: { cwd: a.path } })
    await f.directories.run({ mode: 'bind', sessionId: 'board', directoryId: a.directoryId })
    const project = join(f.root, 'project')
    f.ctx.sessions.create('associated', { meta: { cwd: project } })
    const changed = await f.directories.run({ mode: 'associate', sessionId: 'board', targetSessionId: 'associated' })
    expect(changed).toEqual({ localSessionId: 'associated', path: project, directoryPath: a.path })
    expect(f.workspaces.size).toBe(0)
    f.directories.dispose(); f.directories = new BoardDirectories(f.ctx, f.root)
    f.ctx.sessions.create('returned', { meta: { cwd: a.path } })
    expect((await f.directories.run({ mode: 'associate', sessionId: 'associated', targetSessionId: 'returned' })).directoryPath).toBe(a.path)
    f.ctx.sessions.get('returned').append('user/message', { content: [] }, { surfaceOp: 'append' })
    await expect(f.directories.run({ mode: 'associate', sessionId: 'returned', targetSessionId: 'associated' })).rejects.toThrow('BOARD_HAS_CONVERSATION')
  } finally { f.close() }
})

it('materializes a shared board directory idempotently without replacing its files', async () => {
  const f = fixture()
  try {
    const row = f.directories.reserve(f.root, '协作看板')
    f.ctx.sessions.create('shared', { meta: { cwd: row.path } })
    await f.directories.run({mode:'bind',directoryId:row.directoryId,sessionId:'shared'})
    expect(existsSync(row.path)).toBe(false)
    expect(await f.directories.run({mode:'ensure',sessionId:'shared'})).toEqual({path:row.path})
    writeFileSync(join(row.path,'资料.txt'),'保留')
    f.directories.dispose(); f.directories = new BoardDirectories(f.ctx,f.root)
    await f.directories.run({mode:'ensure',sessionId:'shared'})
    expect(readFileSync(join(row.path,'资料.txt'),'utf8')).toBe('保留')
    f.ctx.sessions.create('unrelated',{meta:{cwd:f.root}})
    await expect(f.directories.run({mode:'ensure',sessionId:'unrelated'})).rejects.toThrow('DIRECTORY_BINDING_CONFLICT')
  } finally {f.close()}
})

it('prepares a virtual board directory as a durable project before forking, without copying the source', async () => {
  const f = fixture()
  try {
    const row = f.directories.reserve(f.root, '研究项目')
    const source = f.ctx.sessions.create('board', { meta: { cwd: row.path } })
    await f.directories.run({mode:'bind',directoryId:row.directoryId,sessionId:source.id})
    const result = await f.directories.run({mode:'fork',sessionId:source.id,title:'研究项目'})
    expect(result.localSessionId).toBe(source.id)
    expect(existsSync(row.path)).toBe(true)
    expect(f.workspaces.get(row.path).sessionIds).toEqual([source.id])
    await f.workspaces.get(row.path).setTitle('用户自定义项目名')
    await f.directories.run({mode:'fork',sessionId:source.id,title:'研究项目'})
    expect(f.workspaces.size).toBe(1)
    expect(f.workspaces.get(row.path).title).toBe('用户自定义项目名')
    expect(source.header.cwd).toBe(row.path)
  } finally { f.close() }
})

it('keeps a fork project directory when a blank board binds again', async () => {
  const f = fixture()
  try {
    const row = f.directories.reserve(f.root, '分叉项目')
    f.ctx.sessions.create('board', { meta: { cwd: row.path } })
    const bind = { mode: 'bind', sessionId: 'board', directoryId: row.directoryId }
    await f.directories.run(bind)
    await f.directories.run({ mode: 'fork', sessionId: 'board' })
    await f.directories.run(bind)
    expect(existsSync(row.path)).toBe(true)
  } finally { f.close() }
})
