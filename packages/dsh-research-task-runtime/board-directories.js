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
    if (input.mode === 'bind') {
      const row = this.records[input.directoryId]
      const source = await this.inspect(input.sessionId)
      if (!row || source.meta.cwd !== row.path || (row.sessionId && row.sessionId !== input.sessionId)) throw Error('DIRECTORY_BINDING_CONFLICT')
      row.sessionId = input.sessionId
      this.save()
      // The Host creates cwd while initializing the session. Keep generated files;
      // remove only a still-empty directory, never recursively or after tool use.
      if (!source.events.some(e => e.type === 'tool/call')) {
        try { rmdirSync(row.path) } catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error }
      }
      return row
    }
    if (input.mode !== 'workspace') throw Error('INVALID_REQUEST')
    const source = await this.inspect(input.sessionId)
    if (this.ctx.agents?.get(input.sessionId)?.status === 'running') throw Error('BOARD_BUSY')
    let row = Object.values(this.records).find(r => r.sessionId === input.sessionId)
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
