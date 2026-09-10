import { BoardDirectories } from './board-directories.js'
import { createHash, timingSafeEqual } from 'node:crypto'
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { exportHumanHistory } from '../dsh-research-collaboration/context.js'
import { taskFailureMessage } from '../dsh-research-collaboration/protocol.js'
const hash = (v) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex')
export class SharedExecutionRuntime {
  constructor({ storage, execute }) {
    this.storage = storage
    this.execute = execute
    this.tasks = {}
    this.controllers = new Map()
    this.flights = new Map()
    this.disposed = false
  }
  async restore() {
    this.tasks = (await this.storage.load()) ?? {}
    for (const t of Object.values(this.tasks))
      if (['running', 'queued'].includes(t.status)) {
        t.status = 'interrupted'
        t.error = '运行时已重启；不会自动重复执行模型。'
      }
    await this.storage.save(this.tasks)
  }
  async start(request) {
    if (this.disposed) throw Error('RUNTIME_STOPPED')
    const { taskId, sessionId, kind, prompt } = request
    if (
      !/^[\w:.-]{1,128}$/.test(taskId) ||
      typeof sessionId !== 'string' ||
      !['qa', 'board', 'container', 'create', 'summary', 'mind-map'].includes(kind) ||
      typeof prompt !== 'string' ||
      (request.query !== undefined && (typeof request.query !== 'string' || !request.query.trim() || Buffer.byteLength(request.query) > 16384)) ||
      !prompt.trim() ||
      Buffer.byteLength(prompt) > 1600000
    )
      throw Error('INVALID_REQUEST')
    const fingerprint = hash(request),
      old = this.tasks[taskId]
    if (old) {
      if (old.fingerprint !== fingerprint) throw Error('REQUEST_ID_REUSED')
      return this.inspect(taskId)
    }
    const task = { taskId, sessionId, kind, fingerprint, status: 'queued' }
    const controller = new AbortController()
    this.tasks[taskId] = task
    this.controllers.set(taskId, controller)
    const owns = (status) =>
      !this.disposed &&
      !controller.signal.aborted &&
      this.tasks[taskId] === task &&
      this.controllers.get(taskId) === controller &&
      task.status === status
    let launched = false
    try {
      await this.storage.save(this.tasks)
      if (!owns('queued')) return this.inspect(taskId)
      task.status = 'running'
      await this.storage.save(this.tasks)
      if (!owns('running')) return this.inspect(taskId)
      const run = (async () => {
        try {
          const text = await this.execute(request, controller.signal)
          if (!owns('running')) return
          if (typeof text !== 'string' || !text.trim())
            throw Error('EMPTY_OUTPUT')
          task.text = text
          task.status = 'completed'
        } catch (error) {
          if (owns('running')) {
            task.status = 'failed'
            task.error = error instanceof Error ? error.message : '执行失败'
            task.errorCode = taskFailureMessage(error?.code) ? error.code : 'GENERATION_FAILED'
          }
        } finally {
          if (this.controllers.get(taskId) === controller)
            this.controllers.delete(taskId)
          await this.storage.save(this.tasks)
        }
      })()
      launched = true
      this.flights.set(taskId, run)
      void run.finally(() => this.flights.delete(taskId))
      return this.inspect(taskId)
    } finally {
      if (!launched && this.controllers.get(taskId) === controller)
        this.controllers.delete(taskId)
    }
  }
  inspect(id) {
    const t = this.tasks[id]
    if (!t) throw Error('TASK_NOT_FOUND')
    return structuredClone(t)
  }
  async cancel(id) {
    const t = this.tasks[id]
    if (!t) return
    this.controllers.get(id)?.abort()
    if (['running', 'queued'].includes(t.status)) {
      t.status = 'interrupted'
      t.error = '执行已停止'
      await this.storage.save(this.tasks)
    }
    return this.inspect(id)
  }
  async dispose() {
    this.disposed = true
    for (const id of this.controllers.keys()) await this.cancel(id)
    await Promise.allSettled(this.flights.values())
  }
}
export function fileExecutionStorage(path) {
  let queue = Promise.resolve()
  return {
    async load() {
      try {
        return JSON.parse(await readFile(path, 'utf8'))
      } catch (e) {
        if (e.code === 'ENOENT') return {}
        throw e
      }
    },
    save(value) {
      const frozen = JSON.stringify(value)
      queue = queue.then(async () => {
        await mkdir(dirname(path), { recursive: true, mode: 0o700 })
        await writeFile(path + '.tmp', frozen, { mode: 0o600 })
        await rename(path + '.tmp', path)
      })
      return queue
    }
  }
}
export async function assertPrivateResearchSession(
  sessionId,
  env = process.env
) {
  if (!env.SHERLOCK_RESEARCH_CONTEXT_URL) return
  const response = await fetch(
    env.SHERLOCK_RESEARCH_CONTEXT_URL + '/board-authority',
    {
      method: 'POST',
      redirect: 'error',
      headers: {
        authorization: `Bearer ${env.SHERLOCK_RESEARCH_CONTEXT_TOKEN}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ sessionId }),
      signal: AbortSignal.timeout(5000)
    }
  )
  if (!response.ok) throw Error('BOARD_AUTHORITY_UNAVAILABLE')
  const value = await response.json()
  if (value.shared) throw Error('SHARED_EXECUTION_REQUIRES_LEASE')
}
export function registerBoardRuntime(
  ctx,
  runtime,
  { token = process.env.SHERLOCK_RESEARCH_BOARDS_TOKEN, directoryRoot = process.env.DSH_HOME } = {}
) {
  const directories = directoryRoot ? new BoardDirectories(ctx, directoryRoot) : null
  const reservations = new Map()
  const release = (copyId) => {
    const r = reservations.get(copyId)
    if (!r) return
    clearTimeout(r.timer)
    if (r.live) {
      if (r.descriptor) Object.defineProperty(r.live, 'append', r.descriptor)
      else delete r.live.append
    }
    reservations.delete(copyId)
  }

  const paths = [
    'directory',
    'history',
    'fresh',
    'fresh-check',
    'fresh-release',
    'start',
    'inspect',
    'cancel'
  ]
  const disposed = [() => directories?.dispose()]
  for (const action of paths)
    disposed.push(
      ctx.webServer.register({
        kind: 'exact',
        path: '/sherlock/research-boards/' + action,
        handler: async (req, res) => {
          const send = (status, value) => {
            res.writeHead(status, {
              'content-type': 'application/json',
              'cache-control': 'no-store'
            })
            res.end(JSON.stringify(value))
          }
          const actual = Buffer.from(String(req.headers.authorization ?? '')),
            expected = Buffer.from('Bearer ' + token)
          if (
            !token ||
            req.method !== 'POST' ||
            !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
              req.socket.remoteAddress
            ) ||
            req.headers.forwarded ||
            req.headers['x-forwarded-for'] ||
            req.headers['x-forwarded-host'] ||
            req.headers['x-real-ip'] ||
            (req.headers.origin &&
              req.headers.origin !== 'http://' + req.headers.host) ||
            actual.length !== expected.length ||
            !timingSafeEqual(actual, expected)
          )
            return send(403, { error: 'REQUEST_REJECTED' })
          try {
            let size = 0
            const chunks = []
            for await (const part of req) {
              size += part.length
              if (size > 1800000) throw Error('REQUEST_TOO_LARGE')
              chunks.push(part)
            }
            const input = JSON.parse(Buffer.concat(chunks).toString())
            let result
            if (action === 'directory') {
              if (!directories) throw Error('DIRECTORY_UNAVAILABLE')
              result = await directories.run(input)
            } else if (action === 'fresh-release') {
              const r = reservations.get(input.copyId)
              if (r && r.sessionId !== input.sessionId)
                throw Error('DESTINATION_CHANGED')
              release(input.copyId)
              result = { released: true }
            } else if (['history', 'fresh', 'fresh-check'].includes(action)) {
              if (
                typeof input.sessionId !== 'string' ||
                input.sessionId.length > 256
              )
                throw Error('INVALID_REQUEST')
              const live = ctx.sessions.get(input.sessionId)
              if (live && !(await ctx.sessions.flush(live)))
                throw Error('HISTORY_UNSAVED')
              const inspected = live
                ? { meta: live.header ?? live.meta, events: live.events }
                : await ctx.sessionPersistence.inspect(input.sessionId)
              const revision = hash(inspected.events)
              if (action === 'history')
                result = {
                  history: exportHumanHistory(inspected.events),
                  revision
                }
              else {
                if (
                  inspected.events.some((e) =>
                    /^(?:user\/message|assistant\/message|turn\/start|agent\/inbox\/spliced|tool\/)/.test(
                      e.type
                    )
                  )
                )
                  throw Error('DESTINATION_NOT_EMPTY')
                if (action === 'fresh') {
                  if (
                    !Number.isFinite(inspected.meta?.createdAt) ||
                    inspected.meta.createdAt < input.createdAfter ||
                    inspected.meta.parentSession ||
                    inspected.meta.seedLength
                  )
                    throw Error('DESTINATION_NOT_FRESH')
                  const prior = reservations.get(input.copyId)
                  if (prior?.live) throw Error('COPY_FINALIZING')
                  reservations.set(input.copyId, {
                    sessionId: input.sessionId,
                    revision
                  })
                  result = { revision }
                } else {
                  const old = reservations.get(input.copyId)
                  if (
                    !old ||
                    old.sessionId !== input.sessionId ||
                    old.revision !== revision
                  )
                    throw Error('DESTINATION_CHANGED')
                  if (!live || typeof live.append !== 'function')
                    throw Error('DESTINATION_NOT_LIVE')
                  if (!old.live) {
                    if (
                      [...reservations.values()].some((r) => r.live === live)
                    )
                      throw Error('COPY_FINALIZING')
                    old.live = live
                    old.descriptor = Object.getOwnPropertyDescriptor(
                      live,
                      'append'
                    )
                    Object.defineProperty(live, 'append', {
                      configurable: true,
                      value: () => {
                        throw Error('COPY_FINALIZING')
                      }
                    })
                    old.timer = setTimeout(() => release(input.copyId), 30000)
                    old.timer.unref?.()
                  }
                  result = { revision }
                }
              }
            } else if (action === 'start') result = await runtime.start(input)
            else if (action === 'inspect')
              result = runtime.inspect(input.taskId)
            else result = await runtime.cancel(input.taskId)
            send(200, result)
          } catch (e) {
            send(400, { error: e.message ?? 'INVALID_REQUEST' })
          }
        }
      })
    )
  return () => {
    for (const id of reservations.keys()) release(id)
    for (const d of disposed) d()
    return runtime.dispose()
  }
}
