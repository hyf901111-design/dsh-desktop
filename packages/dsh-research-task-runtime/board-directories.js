import { randomUUID, createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmdirSync } from 'node:fs'
import { join, dirname, isAbsolute } from 'node:path'

// Only paths reserved by this client are eligible for deferred creation.
export class BoardDirectories {
  constructor(ctx, root) {
    this.ctx = ctx
    this.file = join(root, 'research-board-directories.json')
    this.records = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : {}
    this.off = ctx.on('session/event', (session, event) => {
      if (event.type !== 'tool/call' || !['write', 'edit', 'bash', 'write_file', 'edit_file', 'apply_patch'].includes(event.data?.name)) return
      const row = Object.values(this.records).find(r => r.sessionId === session.id)
      if (row && session.header.cwd === row.path) mkdirSync(row.path, { recursive: true })
    })
  }
  save() {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file + '.tmp', JSON.stringify(this.records), { mode: 0o600 })
    renameSync(this.file + '.tmp', this.file)
  }
  async inspect(id) {
    const live = this.ctx.sessions.get(id)
    if (live) {
      if (!(await this.ctx.sessions.flush(live))) throw Error('HISTORY_UNSAVED')
      return { meta: live.header, events: live.events }
    }
    return this.ctx.sessionPersistence.inspect(id)
  }
  reserve(basePath, title) {
    if (typeof basePath !== 'string' || !isAbsolute(basePath) || typeof title !== 'string' || !title.trim()) throw Error('INVALID_REQUEST')
    const directoryId = randomUUID()
    const name = title.trim().replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 60) || '新研究看板'
    const row = { directoryId, path: join(basePath, '研究看板', name + '-' + directoryId.slice(0, 8)), title }
    this.records[directoryId] = row
    this.save()
    return row
  }
  async run(input) {
    if (input.mode === 'reserve') return this.reserve(input.basePath, input.title)
    if (typeof input.sessionId !== 'string' || input.sessionId.length > 256) throw Error('INVALID_REQUEST')
    if (input.mode === 'ensure') {
      const row=Object.values(this.records).find(r=>r.sessionId===input.sessionId);
      const source=await this.inspect(input.sessionId);
      if(!row || source.meta.cwd!==row.path)throw Error('DIRECTORY_BINDING_CONFLICT');
      mkdirSync(row.path,{recursive:true});
      return {path:row.path};
    }
    if (input.mode === 'bind') {
      const row = this.records[input.directoryId]
      const source = await this.inspect(input.sessionId)
      if (!row || source.meta.cwd !== row.path || (row.sessionId && row.sessionId !== input.sessionId)) throw Error('DIRECTORY_BINDING_CONFLICT')
      row.sessionId = input.sessionId
      this.save()
      // The Host creates cwd while initializing the session. Keep generated files;
      // remove only a still-empty directory, never recursively or after tool use.
      if (!source.events.some(e => e.type === 'tool/call') && !(await this.ctx.workspaceRegistry.resolveByPath(row.path))) {
        try { rmdirSync(row.path) } catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error }
      }
      return row
    }
    if (input.mode === 'fork' || input.mode === 'app-workspace') {
      const source = await this.inspect(input.sessionId)
      const path = source.meta.cwd
      if (typeof path !== 'string' || !isAbsolute(path)) throw Error('DIRECTORY_BINDING_CONFLICT')
      const row = Object.values(this.records).find(r => r.sessionId === input.sessionId)
      // Only create a missing directory when this client reserved that exact path.
      if (row?.path === path) mkdirSync(path, { recursive: true })
      else if (!existsSync(path)) throw Error('DIRECTORY_BINDING_CONFLICT')
      let workspace = await this.ctx.workspaceRegistry.resolveByPath(path)
      if (!workspace) {
        workspace = await this.ctx.workspaceRegistry.create(path)
        if (row?.path === path) await workspace.setTitle(row.title)
      }
      if (input.mode === 'app-workspace') {
        const sessionKey = createHash('sha256').update(input.sessionId).digest('hex')
        return { workspaceId: workspace.id, path, appSessionId: 'board-app-' + sessionKey }
      }
      // The normal Host fork inherits project membership from its source.
      await workspace.attachSession(input.sessionId)
      return { localSessionId: input.sessionId, workspaceId: workspace.id, path }
    }
    if (input.mode === 'associate') {
      const row = Object.values(this.records).find(r => r.sessionId === input.sessionId || r.previousSessionId === input.sessionId)
      if (!row || typeof input.targetSessionId !== 'string') throw Error('DIRECTORY_BINDING_CONFLICT')
      if (this.ctx.agents?.get(input.sessionId)?.status === 'running') throw Error('BOARD_BUSY')
      const source = await this.inspect(input.sessionId)
      const target = await this.inspect(input.targetSessionId)
      if (source.events.some(e => ['user/message', 'assistant/message', 'tool/call'].includes(e.type)) || target.events.some(e => ['user/message', 'assistant/message', 'tool/call'].includes(e.type))) throw Error('BOARD_HAS_CONVERSATION')
      if (!isAbsolute(target.meta.cwd)) throw Error('INVALID_REQUEST')
      row.previousSessionId = input.sessionId
      row.sessionId = input.targetSessionId
      this.save()
      return { localSessionId: input.targetSessionId, path: target.meta.cwd, directoryPath: row.path }
    }
    if (input.mode !== 'workspace') throw Error('INVALID_REQUEST')
    const source = await this.inspect(input.sessionId)
    if (this.ctx.agents?.get(input.sessionId)?.status === 'running') throw Error('BOARD_BUSY')
    let row = Object.values(this.records).find(r => r.sessionId === input.sessionId)
    if (row && row.path !== source.meta.cwd) {
      const workspace = await this.ctx.workspaceRegistry.resolveByPath(source.meta.cwd) ?? await this.ctx.workspaceRegistry.create(source.meta.cwd)
      await workspace.attachSession(input.sessionId)
      return { localSessionId: input.sessionId, workspaceId: workspace.id, path: source.meta.cwd }
    }
    if (!row && existsSync(source.meta.cwd)) {
      const existing = await this.ctx.workspaceRegistry.resolveByPath(source.meta.cwd)
      if (existing) {
        await existing.attachSession(input.sessionId)
        return { localSessionId: input.sessionId, workspaceId: existing.id, path: source.meta.cwd }
      }
    }
    let localSessionId = input.sessionId
    if (!row) {
      // Immutable session cwd requires a new session for legacy board entries.
      // Preserve all durable events and retain the source until the caller has
      // copied canvas/file grants and switched the visible entry successfully.
      row = Object.values(this.records).find(r => r.sourceSessionId === input.sessionId)
      const sourceRevision = createHash('sha256').update(JSON.stringify(source.events)).digest('hex')
      if (row && row.sourceRevision !== sourceRevision) {
        // Retry against current content without overwriting any earlier destination.
        delete row.sourceSessionId
        row = undefined
      }
      if (!row) {
        row = this.reserve(input.basePath, input.title)
        row.sourceSessionId = input.sessionId
        row.sourceRevision = sourceRevision
        row.sessionId = 'session-' + randomUUID()
        this.save()
      }
      localSessionId = row.sessionId
      mkdirSync(row.path, { recursive: true })
      let releaseTarget
      try {
        let target = this.ctx.sessions.get(localSessionId)
        if (!target) {
          const persisted = await this.ctx.sessionPersistence.inspect(localSessionId).catch(() => null)
          if (!persisted) {
            target = this.ctx.sessions.prepare(localSessionId, { seed: source.events, meta: {
              cwd: row.path, parentSession: input.sessionId, seedLength: source.events.length,
              ...(source.meta.agentPreset ? { agentPreset: source.meta.agentPreset } : {})
            } })
            // Persist the copied history under a temporary attachment. Leaving a
            // Session without an Agent live would block the normal cold resume.
            releaseTarget = this.ctx.sessions.enter(target)
            this.ctx.sessions.announce(target)
          }
        }
        if (target && !(await this.ctx.sessions.flush(target))) throw Error('HISTORY_UNSAVED')
      } finally {
        // Only release the attachment owned here, never a pre-existing Agent's.
        releaseTarget?.()
      }
    }
    mkdirSync(row.path, { recursive: true })
    const workspace = await this.ctx.workspaceRegistry.resolveByPath(row.path) ?? await this.ctx.workspaceRegistry.create(row.path)
    await workspace.setTitle(input.title)
    await workspace.attachSession(localSessionId)
    return { localSessionId, workspaceId: workspace.id, path: row.path }
  }
  dispose() { this.off?.() }
}
