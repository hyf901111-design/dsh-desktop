import { afterEach, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import TokenMeter from '@deepseek-ai/dsh-token-meter'

const runtimeModule = await import('../packages/dsh-memory-runtime/index.js').catch(() => ({}))
const patchModule = await import('../scripts/lib/memory-request-context.mjs').catch(() => ({}))
const cleanup = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })

async function fixture(options = {}) {
  expect(runtimeModule.createMemoryRuntime, 'memory runtime implementation').toBeTypeOf('function')
  expect(patchModule.patchMemoryRequestContext, 'request extension implementation').toBeTypeOf('function')
  const root = await mkdtemp(join(tmpdir(), 'ework-memory-runtime-'))
  await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'))
  const source = await readFile('node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js', 'utf8')
  const patched = patchModule.patchMemoryRequestContext(source)
  expect(patchModule.patchMemoryRequestContext(patched)).toBe(patched)
  await writeFile(join(root, 'loop.mjs'), patched)
  const { default: AgentLoop } = await import(pathToFileURL(join(root, 'loop.mjs')).href)
  const calls = [], wire = [], warnings = [], attempts = new Map(), control = { revision: 1, memory: '默认使用简体中文。', failModel: false, invalidEvidence: false, denyAttempt: false, contextWindow: options.contextWindow ?? 16000, beforeValidate: undefined, delayExtract: undefined }
  const sockets = new Set()
  const server = createServer(async (request, response) => {
    expect(request.headers.authorization).toBe('Bearer memory-test-token')
    let text = ''; for await (const chunk of request) text += chunk
    const body = JSON.parse(text); wire.push({ path: request.url, body })
    let value
    if (request.url === '/pending') value = { items: options.pending ?? [] }
    if (request.url === '/recall') value = { enabled: !body.sessionId.includes('shared'), autoEnabled: true, ownerEpoch: 'owner-1', scopeEpoch: 1, revision: control.revision, entries: body.sessionId.includes('shared') || !control.memory ? [] : [{ id: 'memory-1', revision: control.revision, title: '回答语言', content: control.memory, reason: '相关偏好' }], block: body.sessionId.includes('shared') ? '' : control.memory }
    if (request.url === '/validate') { await control.beforeValidate?.(body); value = { valid: body.revision === control.revision } }
    if (request.url === '/capture') value = { captureId: body.sessionId.includes('shared') ? '' : `${body.sessionId}/${body.turnId}`, enabled: !body.sessionId.includes('shared'), ownerEpoch: 'owner-1', revision: control.revision }
    if (request.url === '/attempt') { const count = attempts.get(body.captureId) ?? 0; const allowed = !control.denyAttempt && count < 2; if (allowed) attempts.set(body.captureId, count + 1); value = { allowed } }
    if (request.url === '/usage' || request.url === '/commit' || request.url === '/failure') value = { ok: true }
    response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value ?? {}))
  })
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const ctx = new Context(), errors = []
  ctx.on('agent/error', payload => errors.push(payload.error?.stack ?? payload.error))
  new SessionStore(ctx); new AgentRegistry(ctx); new LlmRuntime(ctx); new SystemPrompt(ctx, {}); new ToolRuntime(ctx); new TokenMeter(ctx)
  new JsonlSessionPersistence(ctx, { root: join(root, 'sessions'), compression: 'none', packChunks: false, writeBatchMaxDelayMs: 1 })
  new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 })
  class Adapter extends LlmAdapter {
    async resolveModel(provider, model) { return { provider, id: model, name: model, context: { contextWindow: control.contextWindow }, defaultMaxTokens: 256 } }
    async *stream(request) {
      calls.push(request)
      if (request.purpose === 'memory-extraction') await control.delayExtract?.()
      const input = request.messages.map(message => message.content.filter(block => block.type === 'text').map(block => block.text).join('')).join('')
      let answer = '已理解本轮请求。'
      if (request.purpose === 'memory-extraction') {
        const events = JSON.parse(input).events
        const source = events.find(item => item.role === 'user')
        answer = control.failModel ? 'not valid JSON' : JSON.stringify({ candidates: [{ title: '表达偏好', content: source.text, kind: 'preference', scope: 'global', semanticKey: 'preference.response.language', sourceSeq: source.seq, evidence: control.invalidEvidence ? '这句原文不存在' : source.text, explicit: true }] })
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: answer }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: answer } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  const registration = ctx.llm.registerAdapter(['selected-provider'], new Adapter())
  const runtime = runtimeModule.createMemoryRuntime(ctx, { env: { EWORK_MEMORY_BRIDGE: JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, token: 'memory-test-token' }) }, requestTimeoutMs: 1000, onWarning: message => warnings.push(message) })
  cleanup.push(async () => { await runtime.dispose(); await ctx.fiber.dispose(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }) })
  await runtime.ready
  const createAgent = async (id, meta = {}) => (await ctx.agents.create({ sessionId: id, meta: { cwd: '/tmp/memory-project', ...meta }, agentOptions: { provider: 'selected-provider', model: 'selected-model', maxTokens: 256 } })).agent
  const agent = await createAgent('memory-parent')
  const turn = async (text, target = agent) => { target.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })); await target.whenIdle(); await runtime.idle(); expect(errors).toEqual([]) }
  return { ctx, agent, runtime, calls, wire, control, warnings, turn, createAgent, root, registration }
}

it('injects memory into the real prepared request while durable history and headers remain clean', async () => {
  const f = await fixture()
  await f.turn('请记住，我今后默认用中文回答。')
  const request = f.calls.find(call => call.purpose !== 'memory-extraction')
  expect(request.provider).toBe('selected-provider'); expect(request.model).toBe('selected-model')
  expect(request.messages.at(-1).source.plugin).toBe('dsh-memory-runtime')
  expect(request.messages.at(-1).content[0].text).toContain('默认使用简体中文。')
  expect(Object.isFrozen(request)).toBe(true)
  expect(JSON.stringify(f.agent.session.events)).not.toContain('默认使用简体中文。')
  expect(JSON.stringify(f.agent.session.deriveMessages())).not.toContain('默认使用简体中文。')
  const durable = await f.ctx.sessionPersistence.readRaw(f.agent.id)
  expect(durable.content).not.toContain('默认使用简体中文。')
  expect(f.wire.find(call => call.path === '/usage').body.entries[0]).toMatchObject({ id: 'memory-1', revision: 1 })
})

it('reselects a snapshot deleted between preparation and the final dispatch', async () => {
  const f = await fixture()
  let deleted = false
  f.control.beforeValidate = () => { if (!deleted) { deleted = true; f.control.revision++; f.control.memory = '' } }
  await f.turn('继续这个项目')
  expect(f.wire.filter(call => call.path === '/recall').length).toBeGreaterThanOrEqual(2)
  expect(f.calls[0].messages.some(message => message.source.plugin === 'dsh-memory-runtime')).toBe(false)
})

it('charges the transient context against actual request capacity and omits the whole block when it cannot fit', async () => {
  const f = await fixture({ contextWindow: 266 })
  await f.turn('继续这个项目')
  expect(f.calls[0].messages.some(message => message.source.plugin === 'dsh-memory-runtime')).toBe(false)
  expect(f.wire.find(call => call.path === '/usage' && call.body.warning).body.warning).toBe('记忆背景超出当前模型容量，本轮未使用。')
})

it('extracts only persisted direct parent text with exact evidence using the selected model and no tools', async () => {
  const f = await fixture()
  await f.turn('请记住，我今后默认用中文回答。')
  const captures = f.wire.filter(call => call.path === '/capture')
  expect(captures).toHaveLength(1)
  expect(captures[0].body.events.map(event => event.role)).toEqual(['user', 'assistant'])
  const stored = await f.ctx.sessionPersistence.readFrom(f.agent.id, 0)
  for (const event of captures[0].body.events) expect(stored.events[event.seq]?.type).toBe(event.role === 'user' ? 'user/message' : 'assistant/message')
  const extraction = f.calls.filter(call => call.purpose === 'memory-extraction')
  expect(extraction).toHaveLength(1)
  expect(extraction[0]).toMatchObject({ provider: 'selected-provider', model: 'selected-model', tools: [], maxTokens: 1000 })
  expect(f.wire.find(call => call.path === '/commit').body.candidates[0]).toMatchObject({ sourceSeq: captures[0].body.events[0].seq, evidence: '请记住，我今后默认用中文回答。' })
  expect(f.agent.session.events.filter(event => event.type === 'turn/start')).toHaveLength(1)
})

it('does not extract shared, child, scheduled, or plugin-origin turns', async () => {
  const f = await fixture()
  const shared = await f.createAgent('shared-session')
  const child = await f.createAgent('child-session', { parentSession: f.agent.id, origin: 'subagent', delegationDepth: 1 })
  await f.turn('请记住这个项目默认用中文。', shared)
  await f.turn('请记住这个项目默认用中文。', child)
  f.agent.followup(createUserMessage({ content: [{ type: 'text', text: '请记住这个网页引用命令。' }], source: { kind: 'plugin', plugin: 'cron' } }))
  await f.agent.whenIdle(); await f.runtime.idle()
  expect(f.calls.filter(call => call.purpose === 'memory-extraction')).toHaveLength(0)
  expect(f.calls.filter(call => call.sessionId === 'shared-session' || call.sessionId === 'child-session').some(call => call.messages.some(message => message.source.plugin === 'dsh-memory-runtime'))).toBe(false)
  expect(f.warnings).toEqual([])
})

it('bounds one failed extraction to one retry and reports a non-plaintext failure without commit', async () => {
  const f = await fixture(); f.control.failModel = true
  await f.turn('请记住，我今后默认用中文回答。')
  expect(f.calls.filter(call => call.purpose === 'memory-extraction')).toHaveLength(2)
  expect(f.wire.some(call => call.path === '/commit')).toBe(false)
  const failure = f.wire.find(call => call.path === '/failure')
  expect(failure.body.message).not.toContain('not valid JSON')
  expect(failure.body.message).toContain('整理')
})

it('serializes extraction across turns and does not resubmit duplicate turn-end notifications', async () => {
  const f = await fixture()
  let release, active = 0, maximum = 0
  f.control.delayExtract = async () => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => { release = resolve }); active-- }
  f.agent.followup(createUserMessage({ content: [{ type: 'text', text: '请记住，我今后默认用中文回答。' }], source: { kind: 'user' } }))
  await f.agent.whenIdle()
  while (!release) await new Promise(resolve => setImmediate(resolve))
  const end = f.agent.session.events.find(event => event.type === 'turn/end')
  f.ctx.emit('session/event', f.agent.session, end)
  const other = await f.createAgent('memory-other')
  other.followup(createUserMessage({ content: [{ type: 'text', text: '请记住，我今后先看结论。' }], source: { kind: 'user' } }))
  await other.whenIdle(); release(); f.control.delayExtract = undefined
  await f.runtime.idle()
  expect(maximum).toBe(1)
  expect(f.wire.filter(call => call.path === '/capture')).toHaveLength(2)
})

it('rejects bridge configuration outside authenticated local loopback', () => {
  expect(runtimeModule.createMemoryRuntime).toBeTypeOf('function')
  expect(() => runtimeModule.createMemoryRuntime({}, { env: { EWORK_MEMORY_BRIDGE: '{"url":"https://remote.example/","token":"x"}' } })).toThrow()
})

it('bounds durable capture excerpts and extraction model input without losing source sequence', async () => {
  const f = await fixture()
  await f.turn('请记住，我今后默认用中文回答。' + '很长的来源文本'.repeat(3000))
  const capture = f.wire.find(call => call.path === '/capture').body
  expect(Buffer.byteLength(JSON.stringify(capture.events))).toBeLessThan(4000)
  const extraction = f.calls.find(call => call.purpose === 'memory-extraction')
  expect(Buffer.byteLength(extraction.system + JSON.stringify(extraction.messages))).toBeLessThanOrEqual(4000)
  expect(capture.events[0].seq).toBe(f.agent.session.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user').seq)
  expect(capture.events[0].text.startsWith('请记住，我今后默认用中文回答。')).toBe(true)
})

it('recovers only persisted pending extraction jobs through a fresh capture authorization', async () => {
  const turn = { sessionId: 'recover-parent', turnId: '7', events: [{ seq: 15, role: 'user', text: '请记住，我今后默认用中文回答。' }], route: { provider: 'selected-provider', model: 'selected-model' } }
  const f = await fixture({ pending: [{ turn }] })
  const capture = f.wire.find(call => call.path === '/capture')
  expect(capture.body.sessionId).toBe('recover-parent')
  expect(f.wire.find(call => call.path === '/commit').body.captureId).toBe('recover-parent/7')
  expect(f.calls).toHaveLength(1)
  expect(f.agent.session.events).toHaveLength(0)
})

it('rejects model evidence that is absent from the exact source rather than committing a plausible fact', async () => {
  const f = await fixture(); f.control.invalidEvidence = true
  await f.turn('请记住，我今后默认用中文回答。')
  expect(f.wire.some(call => call.path === '/commit')).toBe(false)
  expect(f.wire.filter(call => call.path === '/failure')).toHaveLength(1)
  expect(f.warnings).toEqual(['记忆整理未完成，请稍后重试。'])
})

it('retains the adapter prepared before memory dispatch even when another adapter replaces that route', async () => {
  const f = await fixture(), replacements = []
  class Replacement extends LlmAdapter {
    async resolveModel(provider, model) { return { provider, id: model, name: model } }
    async *stream(request) { replacements.push(request); yield { type: 'finish', reason: { kind: 'stop' } } }
  }
  f.ctx.on('agent/request-context', async (_event, next) => {
    const request = await next()
    f.registration()
    f.ctx.llm.registerAdapter(['selected-provider'], new Replacement())
    return request
  })
  await f.turn('你好')
  expect(f.calls).toHaveLength(1)
  expect(replacements).toHaveLength(0)
})

it('captures only the immediate previous turn for a short confirmation and leaves its proposal as a candidate', async () => {
  const f = await fixture()
  await f.turn('这个项目有什么建议方案？')
  const previous = f.agent.session.events.find(event => event.type === 'assistant/message').seq
  await f.turn('好的')
  const captures = f.wire.filter(call => call.path === '/capture')
  expect(captures).toHaveLength(2)
  expect(captures[1].body.events.some(event => event.role === 'assistant' && event.seq === previous)).toBe(true)
  const commits = f.wire.filter(call => call.path === '/commit')
  expect(commits[1].body.candidates[0].explicit).toBe(false)
})

it('applies the persisted patch to real rc.7 source and rejects version drift in the packaging helper', async () => {
  expect(patchModule.patchMemoryRequestContext).toBeTypeOf('function')
  const root = await mkdtemp(join(tmpdir(), 'ework-memory-patch-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const { mkdir } = await import('node:fs/promises')
  const target = join(root, 'node_modules/@deepseek-ai/dsh-agent-loop')
  await mkdir(join(target, 'lib'), { recursive: true })
  const installed = await readFile('node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js', 'utf8')
  const expected = patchModule.patchMemoryRequestContext(installed)
  await writeFile(join(target, 'lib/index.js'), expected)
  const patch = await readFile('patches/@deepseek-ai+dsh-agent-loop+0.1.0-rc.7.patch', 'utf8')
  await writeFile(join(root, 'patch.diff'), patch)
  execFileSync('git', ['apply', '--reverse', '--include=node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js', 'patch.diff'], { cwd: root })
  execFileSync('git', ['apply', '--include=node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js', 'patch.diff'], { cwd: root })
  expect(await readFile(join(target, 'lib/index.js'), 'utf8')).toBe(expected)
  await writeFile(join(target, 'package.json'), '{"version":"0.1.0-rc.7"}')
  expect(await patchModule.applyMemoryRequestContextPatch(join(root, 'node_modules'))).toBe(false)
  await writeFile(join(target, 'package.json'), '{"version":"0.1.0-rc.8"}')
  await expect(patchModule.applyMemoryRequestContextPatch(join(root, 'node_modules'))).rejects.toThrow('0.1.0-rc.7')
})

it('keeps normal app startup working when the optional memory bridge is unavailable', async () => {
  const prior = process.env.EWORK_MEMORY_BRIDGE, warnings = []
  delete process.env.EWORK_MEMORY_BRIDGE
  try {
    await expect(runtimeModule.apply({ logger: () => ({ warn: message => warnings.push(message) }) })).resolves.toBeUndefined()
    expect(warnings).toEqual(['记忆暂不可用，本轮未使用。'])
  } finally { if (prior === undefined) delete process.env.EWORK_MEMORY_BRIDGE; else process.env.EWORK_MEMORY_BRIDGE = prior }
})

it('does not dispatch extraction when the persisted attempt budget is denied', async () => {
  const f = await fixture(); f.control.denyAttempt = true
  await f.turn('请记住，我今后默认用中文回答。')
  expect(f.wire.filter(call => call.path === '/attempt')).toHaveLength(1)
  expect(f.calls.filter(call => call.purpose === 'memory-extraction')).toHaveLength(0)
  expect(f.wire.some(call => call.path === '/commit')).toBe(false)
  expect(f.wire.some(call => call.path === '/failure')).toBe(true)
})

it('retains the routed model on subsequent turns whose unchanged request header is not logged again', async () => {
  const f = await fixture()
  await f.turn('请记住，我今后默认用中文回答。')
  await f.turn('请记住，我今后优先看结论。')
  expect(f.agent.session.events.filter(event => event.type === 'request/header')).toHaveLength(1)
  expect(f.wire.filter(call => call.path === '/capture').map(call => call.body.route)).toEqual([{ provider: 'selected-provider', model: 'selected-model' }, { provider: 'selected-provider', model: 'selected-model' }])
  expect(f.calls.filter(call => call.purpose === 'memory-extraction')).toHaveLength(2)
})
