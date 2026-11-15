import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import { lstat, readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { homeGuideSessionTitle, isHomeGuideSessionTitle } from './home-guide-session-titles.js'
import { HOME_SPREADSHEET_GUIDE_PATH, HOME_SPREADSHEET_GUIDE_PROMPTS } from './home-spreadsheet-guide-contract.js'

const provider = 'sherlock-home-spreadsheet'
const stages = ['analysis', 'trend', 'complete']
const occupiedEvents = new Set(['user/message', 'assistant/message', 'tool/call', 'turn/start'])
const isId = value => typeof value === 'string' && /^[\w:-]{1,128}$/.test(value)
const cancelled = () => new DOMException('表格演示已结束。', 'AbortError')
const narration = {
  zh: [
    '我先按公司和季度检查重复记录，再计算同比。',
    '\n\n已去掉 1 条重复记录。24 条季度数据和同比公式已写入「季度分析」，原始数据已保留。',
    '\n\n趋势图里，澄川制造 2026 年第三季度的背离最明显。净利润同比增长 **25%**，经营现金流同比下降 **20%**。',
    '\n\n「现金流拆解台」已放到工作簿侧栏。从 2.50 亿元净利润拆到 1.60 亿元经营现金流，可以点开调整项核对来源，再拖动滑杆做回款试算。'
  ],
  en: [
    'I’ll check for duplicate company-quarter rows before calculating year-over-year changes.',
    '\n\nI removed one duplicate and wrote 24 quarterly records and year-over-year formulas to Quarterly Analysis. The original data is preserved.',
    '\n\nChengchuan Manufacturing shows the widest gap in Q3 2026. Net profit rose **25%** year over year, while operating cash flow fell **20%**.',
    '\n\nCash Flow Bridge is open in the workbook sidebar. It reconciles CNY 250 million in net profit to CNY 160 million in operating cash flow. Select an adjustment to inspect the source, or drag the slider to model additional collections.'
  ]
}

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

/** The native Agent persists the chat. The demo adapter waits for committed workbook checkpoints. */
export function createHomeSpreadsheetRuntime(ctx, { env = process.env } = {}) {
  const runs = new Map()
  const preparing = new Map()
  const closed = new Map()
  const lateSubmissions = new Map()
  let stopped = false
  const runKey = ({ sessionId, runId }) => JSON.stringify([sessionId, runId])
  const humanMessages = run => run.agent.session.events
    .filter(event => event.type === 'user/message' && event.data.source?.kind === 'user')
  const isReplayPrompt = (run, message) => {
    const content = message?.data?.content
    return Array.isArray(content) && content.every(block => block.type === 'text') &&
      content.map(block => block.text).join('') === HOME_SPREADSHEET_GUIDE_PROMPTS[run.locale]
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
      }
    })
  }

  function guardLateSubmission(run) {
    // A native button's send can still be preparing when navigation cancels
    // the guide. Contain its captured prompt through the first dispatched turn.
    if (!run.armed || humanMessages(run).length || stopped) return
    const remove = () => {
      off()
      lateSubmissions.delete(run.sessionId)
    }
    const off = run.agent.ctx.on('agent/request', (_request, next) => {
      const [first] = humanMessages(run)
      if (first) remove()
      if (isReplayPrompt(run, first)) throw cancelled()
      return next()
    }, { prepend: true })
    lateSubmissions.get(run.sessionId)?.()
    lateSubmissions.set(run.sessionId, remove)
    if (lateSubmissions.size > 256) lateSubmissions.values().next().value()
  }

  function stopWaiting(run, error) {
    run.failure = error
    run.acceptance.reject(error)
    for (const stage of run.checkpoints) {
      stage.saved.reject(error)
      stage.replied.reject(error)
    }
  }

  async function flushSession(run) {
    if (await ctx.sessions.flush(run.agent.session) !== true) throw Error('表格演示会话尚未保存，请重试。')
    return { saved: true }
  }

  class SpreadsheetReplay extends LlmAdapter {
    async resolveModel(provider, model) {
      return { provider, id: model, name: '表格演示', context: { contextWindow: 32768 }, defaultMaxTokens: 1024 }
    }

    async *stream(request) {
      const run = current({ sessionId: request.sessionId, runId: runs.get(request.sessionId)?.runId })
      request.signal?.throwIfAborted()
      if (request.purpose !== undefined) {
        if (!['session-title', 'compaction'].includes(request.purpose)) throw Error('表格演示不支持此辅助请求。')
        const text = request.purpose === 'session-title'
          ? homeGuideSessionTitle('spreadsheet')
          : '表格模式示例使用固定的虚构季度财报，并在原生工作簿中保存分析结果。'
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text }
        yield { type: 'block-end', index: 0, block: { type: 'text', text } }
        yield { type: 'finish', reason: { kind: 'stop' } }
        return
      }
      const users = humanMessages(run)
      if (!run.armed || run.started || users.length !== 1 || !isReplayPrompt(run, users[0])) {
        throw Error('表格演示只接受本次示例需求。')
      }

      run.started = true
      run.acceptance.resolve()
      const [intro, ...updates] = narration[run.locale]
      let text = intro
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: intro }
      for (const [index, checkpoint] of run.checkpoints.entries()) {
        await waitFor(checkpoint.saved.promise, request.signal)
        request.signal?.throwIfAborted()
        current(run)
        text += updates[index]
        yield { type: 'text-delta', index: 0, text: updates[index] }
        checkpoint.replied.resolve()
      }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      run.finishedReply = true
    }
  }
  const offAdapter = ctx.llm.registerAdapter([provider], new SpreadsheetReplay())

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
        if (!run.finishedReply && run.agent.status === 'running') {
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
          typeof input.cwd !== 'string' || !isAbsolute(input.cwd) || !Object.hasOwn(narration, input.locale) ||
          preparing.has(input.sessionId) || typeof env.DSH_HOME !== 'string') throw Error('表格演示准备参数无效。')
      if (runs.has(input.sessionId)) {
        const run = current(input)
        if (run.cwd !== input.cwd || run.locale !== input.locale) throw cancelled()
        return { ready: true }
      }

      const agent = ctx.agents.get(input.sessionId)
      const session = agent?.session
      if (!empty(agent) || session.header.cwd !== input.cwd || session.header.parentSession ||
          session.header.origin === 'subagent') throw Error('请从探索打开独立的空白表格演示。')
      const ticket = {}
      preparing.set(input.sessionId, ticket)
      try {
        const directories = JSON.parse(await readFile(join(env.DSH_HOME, 'research-board-directories.json'), 'utf8'))
        if (!Object.values(directories).some(row => row?.sessionId === input.sessionId && row.path === input.cwd &&
            isHomeGuideSessionTitle('spreadsheet', row.title)) || !(await lstat(input.cwd)).isDirectory()) {
          throw Error('表格演示尚未登记专属目录。')
        }
        if (stopped || closed.has(runKey(input)) || ctx.agents.get(input.sessionId) !== agent ||
            session.header.cwd !== input.cwd || !empty(agent)) throw cancelled()

        lateSubmissions.get(input.sessionId)?.()
        const originalHeader = session.requestHeader() ?? { config: {
          provider: agent.options.provider, model: agent.options.model,
          ...(agent.options.maxTokens === undefined ? {} : { maxTokens: agent.options.maxTokens })
        } }
        const run = { ...input, agent, originalHeader, off: [], acceptance: deferred(), allowed: -1,
          checkpoints: stages.map(() => ({ saved: deferred(), replied: deferred() })) }
        runs.set(input.sessionId, run)
        // Prevent hosted credential and quota routing from using an actual model.
        run.off.push(agent.ctx.on('agent/request', () => {
          current(run)
          return { provider, model: 'v1', maxTokens: 1024 }
        }, { prepend: true }))
        run.off.push(ctx.on('session/event', (owner, event) => {
          if (owner !== session || event.type !== 'turn/end') return
          if (!run.finishedReply || event.data.reason?.kind !== 'completed') {
            stopWaiting(run, Error(event.data.reason?.error?.message || '表格演示已停止。'))
          }
          return restoreRoute(run)
        }))
        return { ready: true }
      } finally {
        if (preparing.get(input.sessionId) === ticket) preparing.delete(input.sessionId)
      }
    },

    async arm(input) {
      const run = current(input)
      if (!empty(run.agent)) throw Error('原生表格会话已接收其他消息。')
      run.armed = true
      return { armed: true }
    },

    async accepted(input) {
      const run = current(input)
      await run.acceptance.promise
      current(input)
      if (run.failure) throw run.failure
      return { accepted: true }
    },

    async advance(input) {
      const run = current(input)
      if (run.failure) throw run.failure
      const index = stages.indexOf(input.stage)
      if (!run.started || index < 0 || index > run.allowed + 1) throw Error('表格演示步骤顺序已变化。')
      run.allowed = Math.max(run.allowed, index)
      const checkpoint = run.checkpoints[index]
      checkpoint.saved.resolve()
      await checkpoint.replied.promise
      current(input)
      return { stage: input.stage }
    },

    async flush(input) {
      const run = current(input)
      if (run.allowed === stages.length - 1) {
        await run.agent.whenIdle()
        if (run.failure) throw run.failure
        await restoreRoute(run)
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

const fieldsByAction = {
  prepare: ['cwd', 'fresh', 'locale'],
  arm: [],
  accepted: [],
  advance: ['stage'],
  flush: [],
  dispose: []
}

export function registerHomeSpreadsheetRuntime(ctx, { isTrustedRequest, readJsonBody, env = process.env }) {
  const runtime = createHomeSpreadsheetRuntime(ctx, { env })
  const off = ctx.webServer.register({ kind: 'exact', path: HOME_SPREADSHEET_GUIDE_PATH, handler: async (req, res) => {
    let status = 200, result
    try {
      if (req.method !== 'POST' || !isTrustedRequest(req, true)) {
        status = 403
        throw Error('表格演示请求未授权。')
      }
      const input = await readJsonBody(req)
      if (!input || !Object.hasOwn(fieldsByAction, input.action) || !isId(input.sessionId) || !isId(input.runId) ||
          Object.keys(input).some(key => !['action', 'sessionId', 'runId', ...fieldsByAction[input.action]].includes(key))) {
        throw Error('表格演示命令无效。')
      }
      const method = input.action === 'dispose' ? 'disposeRun' : input.action
      result = { ok: true, ...await runtime[method](input) }
    } catch (error) {
      if (status === 200) status = 409
      result = { ok: false, message: error.message || '表格演示暂未就绪。' }
    }
    if (!res.destroyed) {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(result))
    }
  } })
  return async () => { off(); await runtime.dispose() }
}
