import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'
import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry, { isUserInvocable } from '@deepseek-ai/dsh-skill'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import { apply as registerSkillTool } from '@deepseek-ai/dsh-tool-skill'
import { createIntegrationRuntime } from '../packages/dsh-integration-runtime/index.js'
import { managedSkillInvocationName } from '../packages/dsh-integration-runtime/skill-policy.js'
const managedAlias = managedSkillInvocationName({ id: 'skill-1' })

const cleanups = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })

async function fixture() {
  const snapshot = { revision: 1, runtimeEpoch: 'epoch-1', ownerAccountId: 'owner-1', connections: [], tools: [], plugins: [{ id: 'plugin-1', enabled: true }], skills: [{ id: 'skill-1', name: 'research-report', description: '整理研究报告', enabled: true, revision: 1, source: 'user', resourceRoot: '/tmp/managed-skills/research-report', ownerPluginId: 'plugin-1' }] }
  const reads = [], sockets = new Set(), controls = { unavailable: false, read: undefined }
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== 'Bearer skill-token') { response.writeHead(401); response.end('{}'); return }
    if (controls.unavailable) { response.writeHead(503); response.end('{}'); return }
    if (request.url === '/snapshot') { response.end(JSON.stringify(snapshot)); return }
    if (request.url === '/skills/read') {
      let body = ''; for await (const chunk of request) body += chunk
      const payload = JSON.parse(body); reads.push(payload)
      const value = controls.read ? await controls.read(payload) : { name: 'research-report', description: '整理研究报告', content: '先核实资料来源，再编写报告。', directory: '/tmp/managed-skills/research-report' }
      response.end(JSON.stringify(value)); return
    }
    response.writeHead(404); response.end('{}')
  })
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const ctx = new Context()
  new SessionStore(ctx); new AgentRegistry(ctx); new LlmRuntime(ctx); new SystemPrompt(ctx, {}); new ToolRuntime(ctx); new SkillRegistry(ctx)
  new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 })
  ctx.provide('workspaceRegistry', { resolveByPath: async path => ({ id: 'workspace-1', path }) })
  const agent = (await ctx.agents.create({ sessionId: 'skill-agent', meta: { cwd: '/tmp/skill-workspace' }, agentOptions: {} })).agent
  const runtime = createIntegrationRuntime(ctx, { env: { EWORK_INTEGRATION_BRIDGE: JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, token: 'skill-token' }) }, pollIntervalMs: 0, requestTimeoutMs: 1000 })
  registerSkillTool(ctx)
  cleanups.push(async () => { await runtime.dispose(); await ctx.fiber.dispose(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)) })
  await runtime.ready
  const lookup = { cwd: agent.session.header.cwd, scope: agent }
  const load = () => ctx.tools.execute({ name: 'skill', arguments: { name: managedAlias }, callId: 'skill-call', agent, signal: new AbortController().signal })
  const step = messages => ctx.waterfall(scopeTarget(ctx, agent), 'agent/pre-step', { agent, messages, turn: 0, step: 0, signal: new AbortController().signal }, () => Promise.resolve({ kind: 'enter', messages }))
  return { ctx, agent, runtime, snapshot, reads, controls, lookup, load, step }
}

describe('managed skill enablement through actual Harness consumers', () => {
  it('blocks a migrated filesystem source across list/get/slash without hiding another same-name source', async () => {
    const f = await fixture()
    const root = await mkdtemp(join(tmpdir(), 'ework-legacy-skills-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const original = join(root, 'original'), unrelated = join(root, 'other')
    await mkdir(join(original, 'report'), { recursive: true })
    await mkdir(join(unrelated, 'report'), { recursive: true })
    await writeFile(join(original, 'report', 'SKILL.md'), '---\nname: research-report\ndescription: original legacy\n---\nLegacy source must not reappear')
    await writeFile(join(unrelated, 'report', 'SKILL.md'), '---\nname: research-report\ndescription: unrelated source\n---\nIndependent personal version')
    f.agent.ctx.skills.registerProvider(control => new FileSystemSkillProvider(f.agent.ctx, control, { providerName: 'legacy-original', includeDefaultRoots: false, customSkillDirs: [original], watch: false }))
    const sourceId = `local:${createHash('sha256').update(await realpath(join(original, 'report'))).digest('hex')}`
    f.snapshot.skills[0].sourceId = sourceId
    f.snapshot.managedSkillSources = [sourceId]
    f.snapshot.skills[0].enabled = false; f.snapshot.revision++
    await f.runtime.sync()
    expect((await f.ctx.skills.list(f.lookup)).map(skill => skill.name)).toEqual([])
    expect(await f.ctx.skills.get('research-report', f.lookup)).toBeUndefined()
    expect((await f.load()).isError).toBe(true)
    f.ctx.skills.registerProvider(control => new FileSystemSkillProvider(f.ctx, control, { providerName: 'unrelated-version', includeDefaultRoots: false, customSkillDirs: [unrelated], watch: false }))
    expect((await f.ctx.skills.get('research-report', f.lookup)).content).toBe('Independent personal version')
    f.snapshot.skills = []; f.snapshot.revision++
    await f.runtime.sync()
    expect((await f.ctx.skills.get('research-report', f.lookup)).content).toBe('Independent personal version')
  })

  it('supports localized and duplicate display names through stable managed invocation aliases', async () => {
    const f = await fixture()
    f.snapshot.skills[0].name = '研究报告'
    f.snapshot.skills.push({ ...f.snapshot.skills[0], id: 'skill-2', resourceRoot: '/tmp/managed-skills/other' })
    f.snapshot.revision++
    f.controls.read = payload => ({ name: '研究报告', description: '整理研究报告', content: '中文技能正文', directory: payload.id === 'skill-1' ? '/tmp/managed-skills/research-report' : '/tmp/managed-skills/other' })
    await f.runtime.sync()
    const skills = await f.ctx.skills.list(f.lookup)
    expect(skills).toHaveLength(2)
    expect(new Set(skills.map(skill => skill.name)).size).toBe(2)
    for (const skill of skills) expect((await f.ctx.skills.get(skill.name, f.lookup)).content).toBe('中文技能正文')
  })
  it('serves enabled skills to model catalog, real skill tool and the slash loader', async () => {
    const f = await fixture()
    expect((await f.ctx.skills.snapshot(f.lookup)).skills.map(skill => skill.name)).toContain(managedAlias)
    expect((await f.ctx.skills.list(f.lookup)).filter(isUserInvocable).map(skill => skill.name)).toContain(managedAlias)
    expect((await f.load()).content[0].text).toContain('先核实资料来源')
    const messages = [createUserMessage({ content: [{ type: 'text', text: `/${managedAlias} 写一份报告` }], source: { kind: 'user' } })]
    const decision = await f.step(messages)
    expect(decision.messages.some(message => message.source?.kind === 'skill-invocation')).toBe(true)
    expect(f.reads.every(read => read.context.sessionId === 'skill-agent' && read.context.workspaceId === 'workspace-1')).toBe(true)
  })

  it('removes disabled skills from catalog and slash suggestions and refuses stale model/slash loads', async () => {
    const f = await fixture()
    await f.load()
    const before = f.reads.length
    f.snapshot.skills[0].enabled = false; f.snapshot.skills[0].revision++; f.snapshot.revision++
    await f.runtime.sync()
    expect((await f.ctx.skills.snapshot(f.lookup)).skills).toEqual([])
    expect((await f.ctx.skills.list(f.lookup)).filter(isUserInvocable)).toEqual([])
    expect(await f.ctx.skills.get(managedAlias, f.lookup)).toBeUndefined()
    expect((await f.load()).isError).toBe(true)
    await expect(f.step([createUserMessage({ content: [{ type: 'text', text: `/${managedAlias} 写报告` }], source: { kind: 'user' } })])).rejects.toThrow('所选技能未能加载')
    expect(f.reads).toHaveLength(before)
  })

  it('revokes a plugin skill while preserving an unrelated legacy skill', async () => {
    const f = await fixture()
    f.ctx.skills.register({ name: 'legacy-note', description: '原有技能', content: '已有正文', source: 'runtime' })
    f.snapshot.plugins[0].enabled = false; f.snapshot.revision++
    await f.runtime.sync()
    expect((await f.ctx.skills.list(f.lookup)).map(skill => skill.name)).toEqual(['legacy-note'])
    expect(await f.ctx.skills.get(managedAlias, f.lookup)).toBeUndefined()
    expect((await f.ctx.skills.get('legacy-note', f.lookup)).content).toBe('已有正文')
  })

  it('does not reveal a body if the skill is disabled while the response is in flight', async () => {
    const f = await fixture()
    let entered, release
    const entry = new Promise(resolve => { entered = resolve }), gate = new Promise(resolve => { release = resolve })
    f.controls.read = async () => { entered(); await gate; return { name: 'research-report', description: '整理研究报告', content: '不应被读取的旧正文', directory: '/tmp/managed-skills/research-report' } }
    const loading = f.ctx.skills.get(managedAlias, f.lookup)
    await entry
    f.snapshot.skills[0].enabled = false; f.snapshot.skills[0].revision++; f.snapshot.revision++
    await f.runtime.sync(); release()
    expect(await loading).toBeUndefined()
  })

  it('fails closed when the bridge disappears and unloads the provider on disposal', async () => {
    const f = await fixture()
    expect((await f.ctx.skills.list(f.lookup)).length).toBe(1)
    f.controls.unavailable = true; await f.runtime.sync()
    expect((await f.ctx.skills.list(f.lookup)).length).toBe(0)
    expect((await f.load()).isError).toBe(true)
    f.controls.unavailable = false; await f.runtime.sync()
    expect((await f.ctx.skills.list(f.lookup)).length).toBe(1)
    await f.runtime.dispose()
    expect((await f.ctx.skills.list(f.lookup)).length).toBe(0)
  })
})

it('rejects a removed explicitly selected skill before entering the model, including a still-cached alias',async()=>{const f=await fixture();await f.load();f.snapshot.skills=[];f.snapshot.revision++;await expect(f.step([createUserMessage({content:[{type:'text',text:`/${managedAlias} 分析`}],source:{kind:'user'}})])).rejects.toThrow('所选技能未能加载')})
