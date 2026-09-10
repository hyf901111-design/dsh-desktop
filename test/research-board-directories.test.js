import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Session } from '@deepseek-ai/dsh-session'
import { BoardDirectories } from '../packages/dsh-research-task-runtime/board-directories.js'
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'board-directories-')), sessions = new Map(), workspaces = new Map()
  let observe
  const ctx = {
    on: (_name, fn) => { observe = fn; return () => {} },
    agents: { get: () => undefined },
    sessions: { get: id => sessions.get(id), flush: async () => true,
      create: (id, options) => { const s = Session.create(id, options.seed, { version: 0, id, createdAt: Date.now(), ...options.meta }); sessions.set(id, s); return s } },
    sessionPersistence: { inspect: async id => { const s = sessions.get(id); if (!s) throw Error('MISSING'); return { meta: s.header, events: s.events } } },
    workspaceRegistry: { resolveByPath: async p => workspaces.get(p), create: async p => {
      const workspace = { id: 'workspace-' + workspaces.size, path: p, title: '', sessionIds: [], setTitle: async title => { workspace.title = title }, attachSession: async id => {
        if (sessions.get(id).header.cwd !== p || !existsSync(p)) throw Error('INVALID_CWD')
        if (!workspace.sessionIds.includes(id)) workspace.sessionIds.push(id)
      } }; workspaces.set(p, workspace); return workspace
    } }
  }
  const directories = new BoardDirectories(ctx, root)
  return { root, sessions, directories, workspaces, ctx, observe: (...args) => observe(...args), close: () => { directories.dispose(); rmSync(root, { recursive: true, force: true }) } }
}
describe('research board directories', () => {
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
      expect(f.sessions.get(moved.localSessionId).events.slice(0, original.events.length)).toEqual(original.events)
      expect(f.sessions.get(moved.localSessionId).events.at(-1).type).toBe('session/end-seed')
      expect(original.header.cwd).toBe(f.root)
      expect((await f.directories.run(input)).localSessionId).toBe(moved.localSessionId)
      f.ctx.agents.get = () => ({ status: 'running' })
      await expect(f.directories.run(input)).rejects.toThrow('BOARD_BUSY')
    } finally { f.close() }
  })
})
