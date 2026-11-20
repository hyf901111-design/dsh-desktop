import { notifyModelDirectory, presentHomeGuideReplayRoute } from './home-guide-replay-route.js'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import { lstat, readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { homeGuideSessionTitle, isHomeGuideSessionTitle } from './home-guide-session-titles.js'
const occupiedEvents = new Set(['user/message', 'assistant/message', 'tool/call', 'turn/start'])
const isId = value => typeof value === 'string' && /^[\w:-]{1,128}$/.test(value)
const cancelled = () => new DOMException('演示已结束。', 'AbortError')
function deferred() {
  let resolve, reject
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject })
  promise.catch(() => {})
  return { promise, resolve, reject }
}

function waitFor(promise, signal) {
  if (!signal) return promise
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => reject(cancelled())
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

/** Native turns yield their final text only after the corresponding document edit is committed. */
export function createWorkspaceGuideChat(ctx, spec, { env = process.env } = {}) {
  const { provider, stages, kind, label } = spec
  const runs = new Map()
  const preparing = new Map()
  const closed = new Map()
  const lateSubmissions = new Map()
  let stopped = false
  const runKey = ({ sessionId, runId }) => JSON.stringify([sessionId, runId])
  const humanMessages = run => run.agent.session.events
    .filter(event => event.type === 'user/message' && event.data.source?.kind === 'user')
  const isReplayPrompt = (run, index, message) => {
    const content = message?.data?.content
    if (!Array.isArray(content) || !content.every(block => block.type === 'text')) return false
    const text = content.map(block => block.text).join('')
    return spec.matches(run.turns[index], text, run.locale, index)
  }
  const empty = agent => agent && agent.status !== 'running' &&
    !agent.session.events.some(event => occupiedEvents.has(event.type))
  const current = input => {
    const run = runs.get(input.sessionId)
    if (stopped || !run || run.runId !== input.runId || run.closing ||
        ctx.agents.get(run.sessionId) !== run.agent || run.agent.session.header.cwd !== run.cwd) throw cancelled()
    return run
  }

  function restoreRoute(run) {
    if (run.routeRestored) return run.routeRestored
    return run.routeRestored = Promise.resolve().then(() => {
      for (const off of run.off.splice(0)) off()
      const session = run.agent.session
      const header = session.requestHeader()
      if (ctx.agents.get(run.sessionId) === run.agent && header?.config.provider === provider &&
          run.originalHeader.config.provider && run.originalHeader.config.model) {
        session.append('request/header', { header: run.originalHeader, reason: 'change' })
        notifyModelDirectory(ctx)
      }
    })
  }

  function guardLateSubmission(run) {
    // A native button's send can still be preparing when navigation cancels
    // the guide. Contain its captured prompt through the first dispatched turn.
    const index = run.index
    if (!run.turns[index]?.armed || humanMessages(run).length !== index || stopped) return
    const remove = () => {
      off()
      lateSubmissions.delete(run.sessionId)
    }
    const off = run.agent.ctx.on('agent/request', (_request, next) => {
      const message = humanMessages(run)[index]
      if (message) remove()
      if (isReplayPrompt(run, index, message)) throw cancelled()
      return next()
    }, { prepend: true })
    lateSubmissions.get(run.sessionId)?.()
    lateSubmissions.set(run.sessionId, remove)
    if (lateSubmissions.size > 256) lateSubmissions.values().next().value()
  }

  function stopWaiting(run, error) {
    run.failure = error
    for (const turn of run.turns) {
      turn.acceptance.reject(error)
      turn.saved.reject(error)
      turn.replied.reject(error)
    }
  }

  async function flushSession(run) {
    if (await ctx.sessions.flush(run.agent.session) !== true) throw Error('演示会话尚未保存，请重试。')
    return { saved: true }
  }

  class WorkspaceGuideReplay extends LlmAdapter {
    async resolveModel(provider, model) {
      return { provider, id: model, name: label + '演示', context: { contextWindow: 32768 }, defaultMaxTokens: 1024 }
    }

    async *stream(request) {
      const run = current({ sessionId: request.sessionId, runId: runs.get(request.sessionId)?.runId })
      request.signal?.throwIfAborted()
      if (request.purpose !== undefined) {
        if (!['session-title', 'compaction'].includes(request.purpose)) throw Error('演示不支持此辅助请求。')
        const text = request.purpose === 'session-title'
          ? homeGuideSessionTitle(kind)
          : spec.summary
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text }
        yield { type: 'block-end', index: 0, block: { type: 'text', text } }
        yield { type: 'finish', reason: { kind: 'stop' } }
        return
      }
      const index = run.index
      const turn = run.turns[index]
      const users = humanMessages(run)
      if (!turn?.armed || turn.started || users.length !== index + 1 || !isReplayPrompt(run, index, users[index])) {
        throw Error('演示只接受本次示例需求和指定选区。')
      }

      turn.started = true
      turn.acceptance.resolve()
      const intro = spec.intro(run.locale, index)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      if (intro) yield { type: 'text-delta', index: 0, text: intro }
      const update = await waitFor(turn.saved.promise, request.signal)
      request.signal?.throwIfAborted()
      current(run)
      yield { type: 'text-delta', index: 0, text: update }
      turn.replied.resolve()
      yield { type: 'block-end', index: 0, block: { type: 'text', text: intro + update } }
      turn.finished = true
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  const offAdapter = ctx.llm.registerAdapter([provider], new WorkspaceGuideReplay())

  async function disposeRun(input) {
    const key = runKey(input)
    if (closed.has(key)) return closed.get(key)
    const run = runs.get(input.sessionId)
    const close = (async () => {
      if (run?.runId !== input.runId) return { saved: true }
      run.closing = true
      stopWaiting(run, cancelled())
      try {
        guardLateSubmission(run)
        if (!run.turns[run.index]?.finished && run.agent.status === 'running') {
          await run.agent.cancel({ kind: 'user' })
          await run.agent.whenIdle()
        }
        await restoreRoute(run)
        return await flushSession(run)
      } finally {
        await restoreRoute(run)
        if (runs.get(input.sessionId) === run) runs.delete(input.sessionId)
      }
    })()
    closed.set(key, close)
    if (closed.size > 256) closed.delete(closed.keys().next().value)
    return close
  }

  return {
    async prepare(input) {
      if (stopped || closed.has(runKey(input))) throw cancelled()
      if (!isId(input.sessionId) || !isId(input.runId) || input.fresh !== true ||
          typeof input.cwd !== 'string' || !isAbsolute(input.cwd) || !['zh', 'en'].includes(input.locale) ||
          preparing.has(input.sessionId) || typeof env.DSH_HOME !== 'string') throw Error('演示准备参数无效。')
      if (runs.has(input.sessionId)) {
        const run = current(input)
        if (run.cwd !== input.cwd || run.locale !== input.locale) throw cancelled()
        return { ready: true }
      }

      const agent = ctx.agents.get(input.sessionId)
      const session = agent?.session
      if (!empty(agent) || session.header.cwd !== input.cwd || session.header.parentSession ||
          session.header.origin === 'subagent') throw Error('请从探索打开独立的空白演示会话。')
      const ticket = {}
      preparing.set(input.sessionId, ticket)
      try {
        const directories = JSON.parse(await readFile(join(env.DSH_HOME, 'research-board-directories.json'), 'utf8'))
        if (!Object.values(directories).some(row => row?.sessionId === input.sessionId && row.path === input.cwd &&
            isHomeGuideSessionTitle(kind, row.title)) || !(await lstat(input.cwd)).isDirectory()) {
          throw Error('演示尚未登记专属目录。')
        }
        if (stopped || closed.has(runKey(input)) || ctx.agents.get(input.sessionId) !== agent ||
            session.header.cwd !== input.cwd || !empty(agent)) throw cancelled()

        lateSubmissions.get(input.sessionId)?.()
        const originalHeader = session.requestHeader() ?? { config: {
          provider: agent.options.provider, model: agent.options.model,
          ...(agent.options.maxTokens === undefined ? {} : { maxTokens: agent.options.maxTokens })
        } }
        const run = { ...input, agent, originalHeader, off: [], index: 0,
          turns: stages.map(() => ({ acceptance: deferred(), saved: deferred(), replied: deferred() })) }
        runs.set(input.sessionId, run)
        // Prevent hosted credential and quota routing from using an actual model.
        run.off.push(agent.ctx.on('agent/request', () => {
          current(run)
          return { provider, model: 'v1', maxTokens: 1024 }
        }, { prepend: true }))
        run.off.push(ctx.on('session/event', (owner, event) => {
          if (owner !== session || event.type !== 'turn/end') return
          if (!run.turns[run.index]?.finished || event.data.reason?.kind !== 'completed') {
            stopWaiting(run, Error(event.data.reason?.error?.message || '演示已停止。'))
            return restoreRoute(run)
          }
        }))
        presentHomeGuideReplayRoute(ctx, run, provider, 1024)
        return { ready: true }
      } finally {
        if (preparing.get(input.sessionId) === ticket) preparing.delete(input.sessionId)
      }
    },

    async arm(input) {
      const run = current(input)
      const turn = run.turns[run.index]
      if (run.failure || !turn || turn.started || run.agent.status === 'running' ||
          humanMessages(run).length !== run.index || (run.index === 0 && !empty(run.agent))) {
        throw Error('原生会话已接收其他消息。')
      }
      spec.arm?.(turn, input, run.index)
      turn.armed = true
      return { armed: true }
    },

    async accepted(input) {
      const run = current(input)
      await run.turns[run.index]?.acceptance.promise
      current(input)
      if (run.failure) throw run.failure
      return { accepted: true }
    },

    async advance(input) {
      const run = current(input)
      const turn = run.turns[run.index]
      if (run.failure) throw run.failure
      if (!turn?.started || input.stage !== stages[run.index]) throw Error('演示步骤顺序已变化。')
      turn.saved.resolve(spec.update(input, run.locale, run.index))
      await turn.replied.promise
      current(input)
      return { stage: input.stage }
    },

    async flush(input) {
      const run = current(input)
      const turn = run.turns[run.index]
      if (turn?.started) {
        await run.agent.whenIdle()
        if (run.failure) throw run.failure
        current(input)
        if (turn === run.turns[run.index] && ++run.index === stages.length) await restoreRoute(run)
      }
      return flushSession(run)
    },

    disposeRun,
    async dispose() {
      if (stopped) return
      stopped = true
      try { await Promise.allSettled([...runs.values()].map(disposeRun)) }
      finally {
        for (const remove of lateSubmissions.values()) remove()
        offAdapter()
      }
    }
  }
}

export function registerWorkspaceGuideChat(ctx, spec, { isTrustedRequest, readJsonBody, env = process.env }) {
  const runtime = createWorkspaceGuideChat(ctx, spec, { env })
  const fieldsByAction = { prepare: ['cwd', 'fresh', 'locale'], arm: spec.armFields ?? [], accepted: [],
    advance: ['stage', ...(spec.advanceFields ?? [])], flush: [], dispose: [] }
  const off = ctx.webServer.register({ kind: 'exact', path: spec.path, handler: async (req, res) => {
    let status = 200, result
    try {
      if (req.method !== 'POST' || !isTrustedRequest(req, true)) {
        status = 403
        throw Error('演示请求未授权。')
      }
      const input = await readJsonBody(req)
      if (!input || !Object.hasOwn(fieldsByAction, input.action) || !isId(input.sessionId) || !isId(input.runId) ||
          Object.keys(input).some(key => !['action', 'sessionId', 'runId', ...fieldsByAction[input.action]].includes(key))) {
        throw Error('演示命令无效。')
      }
      const method = input.action === 'dispose' ? 'disposeRun' : input.action
      result = { ok: true, ...await runtime[method](input) }
    } catch (error) {
      if (status === 200) status = 409
      result = { ok: false, message: error.message || '演示暂未就绪。' }
    }
    if (!res.destroyed) {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(result))
    }
  } })
  return async () => { off(); await runtime.dispose() }
}
