import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry, { isModelInvocable, isUserInvocable } from '@deepseek-ai/dsh-skill'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'
import { apply as registerSkillTool } from '@deepseek-ai/dsh-tool-skill'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import { IntegrationService } from '../src/main/integrations/service'
import { startIntegrationBridge } from '../src/main/integrations/runtime-bridge'
import { resolveIntegrationContext } from '../src/main/integrations/context'
import { createIntegrationRuntime } from '../packages/dsh-integration-runtime/index.js'
import { managedSkillInvocationName } from '../packages/dsh-integration-runtime/skill-policy.js'
import { registerManagedSkillProvider } from '../packages/dsh-integration-runtime/skill-provider.js'

const cleanups = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
const encryption = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() }
const bundledContent = '---\nname: efund-ppt-maker\ndescription: Builtin PPT fixture\n---\n\n# 内置 1.1.1 正文\n\n必须使用本目录的模板。\n'
const personalContent = '---\nname: efund-ppt-maker\ndescription: Personal PPT fixture\n---\n\n个人同名技能，内容与内置完全不同。\n'

async function fixture(personal = false, finance = false, equity = false) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'ework-bundled-runtime-')))
    const bundledRoot = join(root, 'bundled'), skillRoot = join(bundledRoot, 'efund-ppt-maker'), personalRoot = join(root, 'personal'), workspace = join(root, 'workspace')
    let service, bridge, runtime
    const ctx = new Context()
    cleanups.push(async () => {
        await runtime?.dispose(); await ctx.fiber.dispose(); await bridge?.dispose(); await service?.dispose()
        await rm(root, { recursive: true, force: true })
    })
    await mkdir(skillRoot, { recursive: true }); await mkdir(workspace)
    await writeFile(join(skillRoot, 'SKILL.md'), bundledContent)
    await writeFile(join(skillRoot, '_meta.json'), JSON.stringify({ slug: 'efund-ppt-maker', cnName: 'PPT制作助手', version: 'v1.1.1', source: 'eSkill' }))
    if(finance){
        const financeRoot=join(bundledRoot,'ework-finance-analysis');await mkdir(financeRoot)
        await writeFile(join(financeRoot,'SKILL.md'),bundledContent.replace('efund-ppt-maker','ework-finance-analysis'))
        await writeFile(join(financeRoot,'_meta.json'),JSON.stringify({slug:'ework-finance-analysis',cnName:'基础金融分析逻辑',version:'v1.7.3',source:'eSkill'}))
    }
    if(equity){
        const equityRoot=join(bundledRoot,'ework-equity-research');await mkdir(equityRoot)
        await writeFile(join(equityRoot,'SKILL.md'),bundledContent.replace('efund-ppt-maker','ework-equity-research'))
        await writeFile(join(equityRoot,'_meta.json'),JSON.stringify({slug:'ework-equity-research',cnName:'研报写作',version:'v1.0.0',source:'eSkill'}))
    }
    if (personal) {
        await mkdir(join(personalRoot, 'efund-ppt-maker'), { recursive: true })
        await writeFile(join(personalRoot, 'efund-ppt-maker', 'SKILL.md'), personalContent)
    }
    new SessionStore(ctx); new AgentRegistry(ctx); new LlmRuntime(ctx); new SystemPrompt(ctx, {}); new ToolRuntime(ctx); new SkillRegistry(ctx)
    new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 })
    ctx.provide('workspaceRegistry', { resolveByPath: async path => path === workspace ? { id: 'workspace', path } : undefined })
    const agent = (await ctx.agents.create({ sessionId: 'bundled-agent', meta: { cwd: workspace }, agentOptions: {} })).agent
    service = await IntegrationService.open({ root: join(root, 'registry'), encryption, getOwnerId: () => 'owner', bundledSkillDirectory: bundledRoot,
        resolveContext: context => resolveIntegrationContext(context, { ownerId: 'owner', tasks: [], workspaces: async () => [{ workspaceId: 'workspace', path: workspace }], sessions: async () => [{ sessionId: agent.session.id, cwd: agent.session.header.cwd }] }) })
    bridge = await startIntegrationBridge(service)
    runtime = createIntegrationRuntime(ctx, { env: { EWORK_INTEGRATION_BRIDGE: JSON.stringify({ url: bridge.url, token: bridge.token }) }, pollIntervalMs: 0, requestTimeoutMs: 2000 })
    ctx.skills.registerProvider(control => new FileSystemSkillProvider(ctx, control, { includeDefaultRoots: false, bundledSkillDir: bundledRoot, customSkillDirs: personal ? [personalRoot] : [], watch: false }))
    registerSkillTool(ctx)
    await runtime.ready
    const lookup = { cwd: workspace, scope: agent }
    return { ctx, agent, service, runtime, skillRoot, lookup }
}

it('marks only bundled aliases user-only in both the real registry summaries and loaded definitions', async () => {
    const ctx = new Context(); new SkillRegistry(ctx)
    cleanups.push(() => ctx.fiber.dispose())
    const bundled = { id: 'builtin:efund-ppt-maker', name: 'PPT制作助手', description: 'PPT', provider: 'bundled', source: 'EWork 内置', sourceId: 'bundled:efund-ppt-maker', resourceRoot: '/tmp/bundled-ppt', revision: 1, enabled: true }
    const managed = { ...bundled, id: 'personal-report', name: '个人技能', provider: 'managed', source: '个人', sourceId: 'personal-report', resourceRoot: '/tmp/personal-report' }
    const finance = {...bundled,id:'builtin:ework-finance-analysis',name:'基础金融分析逻辑',resourceRoot:'/tmp/bundled-finance'}
    const snapshot = { runtimeEpoch: 'test', ownerAccountId: 'owner', skills: [bundled, managed, finance], plugins: [] }
    registerManagedSkillProvider(ctx, { snapshot, sync: async () => {}, onChange: () => () => {}, contextFor: async () => ({}), request: async (_path, { id }) => {
        const skill = snapshot.skills.find(value => value.id === id)
        return { name: skill.name, description: skill.description, content: '真实provider读路径', directory: skill.resourceRoot }
    } })
    const listed = await ctx.skills.list()
    expect(listed.find(value => value.name === managedSkillInvocationName(bundled)).invocation).toEqual({ modelInvocable: false, userInvocable: true })
    expect((await ctx.skills.get(managedSkillInvocationName(bundled))).invocation).toEqual({ modelInvocable: false, userInvocable: true })
    expect(listed.find(value => value.name === managedSkillInvocationName(managed)).invocation).toEqual({ modelInvocable: true, userInvocable: true })
    expect((await ctx.skills.get(managedSkillInvocationName(managed))).invocation).toEqual({ modelInvocable: true, userInvocable: true })
    expect(listed.find(value => value.name === managedSkillInvocationName(finance)).invocation).toEqual({ modelInvocable: true, userInvocable: true })
    expect((await ctx.skills.get(managedSkillInvocationName(finance))).invocation).toEqual({ modelInvocable: true, userInvocable: true })
})

it('loads the virtual builtin through the real bridge/provider with exact bundled bytes and resource base', async () => {
    const f = await fixture()
    const skill = f.service.runtimeSnapshot().skills.find(value => value.id === 'builtin:efund-ppt-maker')
    expect(skill).toMatchObject({ provider: 'bundled', enabled: true, resourceRoot: f.skillRoot, sourceId: 'bundled:efund-ppt-maker' })
    expect(f.service.store.snapshot().skills).not.toHaveProperty(skill.id)
    const alias = managedSkillInvocationName(skill)
    const detail = await f.service.request({ type: 'skill-detail', id: skill.id, revision: skill.revision })
    expect(detail).toMatchObject({ content: bundledContent, invocationName: alias, enabled: true })
    const loaded = await f.ctx.skills.get(alias, f.lookup)
    expect(loaded).toMatchObject({ name: alias, provider: 'ework-managed-skills', path: join(f.skillRoot, 'SKILL.md'), resourceBase: { kind: 'directory', path: f.skillRoot }, content: bundledContent, invocation: { modelInvocable: false, userInvocable: true } })
    expect(loaded.content).toBe(await readFile(join(f.skillRoot, 'SKILL.md'), 'utf8'))
    const result = await f.ctx.tools.execute({ name: 'skill', arguments: { name: alias }, callId: 'builtin-load', agent: f.agent, signal: new AbortController().signal })
    expect(result.isError).toBe(true)
})

it('disabling a builtin removes its native filesystem name and pinned alias from actual Harness consumers', async () => {
    const f = await fixture(true), id = 'builtin:efund-ppt-maker'
    const skill = f.service.runtimeSnapshot().skills.find(s => s.id === id), alias = managedSkillInvocationName(skill)
    const reply = await f.service.request({type:'set-enabled',kind:'skill',id,enabled:false,meta:{requestId:'disable-builtin',expectedRevision:skill.revision}})
    await f.service.operations.wait(reply.operation.id); await f.runtime.sync()
    expect(await f.ctx.skills.get(alias, f.lookup)).toBeUndefined()
    // A separately authored same-name personal skill still works.
    expect((await f.ctx.skills.get('efund-ppt-maker', f.lookup)).content).toBe('个人同名技能，内容与内置完全不同。')
    f.ctx.skills.registerProvider(control => new FileSystemSkillProvider(f.ctx, control, {providerName:'only-bundled',includeDefaultRoots:false,bundledSkillDir:join(f.skillRoot,'..'),watch:false}))
    const candidates = await f.ctx.skills.list(f.lookup)
    expect(candidates.find(s=>s.name===alias)).toBeUndefined()
    const native = await f.ctx.tools.execute({name:'skill',arguments:{name:alias},callId:'disabled-builtin',agent:f.agent,signal:new AbortController().signal})
    expect(native.isError).toBe(true)
})

it('a disabled builtin has no native model or slash route when there is no personal override',async()=>{
    const f=await fixture(),id='builtin:efund-ppt-maker',skill=f.service.runtimeSnapshot().skills[0]
    const reply=await f.service.request({type:'set-enabled',kind:'skill',id,enabled:false,meta:{requestId:'disabled-native',expectedRevision:skill.revision}})
    await f.service.operations.wait(reply.operation.id);await f.runtime.sync()
    expect(await f.ctx.skills.get('efund-ppt-maker',f.lookup)).toBeUndefined()
    expect((await f.ctx.skills.list(f.lookup)).filter(isModelInvocable)).toEqual([])
    expect((await f.ctx.skills.list(f.lookup)).filter(isUserInvocable)).toEqual([])
})

it('the actual model prompt prioritizes the finance alias and removes it immediately after disabling',async()=>{
    const f=await fixture(false,true),id='builtin:ework-finance-analysis',skill=f.service.runtimeSnapshot().skills.find(s=>s.id===id),alias=managedSkillInvocationName(skill)
    const before=await f.ctx.systemPrompt.assemble({agent:f.agent,scope:f.agent})
    expect(before.contexts.find(c=>c.name==='ework:finance-skill').text).toContain(alias)
    expect((await f.ctx.skills.list(f.lookup)).find(s=>s.name===alias).invocation.modelInvocable).toBe(true)
    const reply=await f.service.request({type:'set-enabled',kind:'skill',id,enabled:false,meta:{requestId:'disable-finance',expectedRevision:skill.revision}})
    await f.service.operations.wait(reply.operation.id)
    const after=await f.ctx.systemPrompt.assemble({agent:f.agent,scope:f.agent})
    expect(after.contexts.find(c=>c.name==='ework:finance-skill')).toBeUndefined()
    expect(await f.ctx.skills.get(alias,f.lookup)).toBeUndefined()
})

it('preserves the existing native builtin and exposes only that one in automatic model discovery', async () => {
    const f = await fixture()
    const skill = f.service.runtimeSnapshot().skills.find(value => value.id === 'builtin:efund-ppt-maker')
    expect(skill).toBeDefined()
    const skills = await f.ctx.skills.list(f.lookup)
    expect(skills.filter(isModelInvocable).map(value => value.name)).toEqual(['efund-ppt-maker'])
    expect(skills.filter(isUserInvocable).map(value => value.name).sort()).toEqual(['efund-ppt-maker', managedSkillInvocationName(skill)].sort())
    expect((await f.ctx.skills.get('efund-ppt-maker', f.lookup)).resourceBase).toEqual({ kind: 'directory', path: f.skillRoot })
})

it('keeps an independent same-name personal skill while the builtin alias still loads the builtin', async () => {
    const f = await fixture(true)
    const skill = f.service.runtimeSnapshot().skills.find(value => value.id === 'builtin:efund-ppt-maker')
    expect(skill).toBeDefined()
    const alias = managedSkillInvocationName(skill)
    expect((await f.ctx.skills.list(f.lookup)).map(value => value.name).sort()).toEqual(['efund-ppt-maker', alias].sort())
    expect((await f.ctx.skills.get('efund-ppt-maker', f.lookup)).content).toContain('个人同名技能')
    expect((await f.ctx.skills.get(alias, f.lookup)).content).toBe(bundledContent)
    const messages = [createUserMessage({ content: [{ type: 'text', text: `/${alias} 编制汇报` }], source: { kind: 'user' } })]
    const expanded = await f.ctx.waterfall(scopeTarget(f.ctx, f.agent), 'agent/pre-step', { agent: f.agent, messages, turn: 0, step: 0, signal: new AbortController().signal }, () => Promise.resolve({ kind: 'enter', messages }))
    expect(JSON.stringify(expanded)).toContain('内置 1.1.1 正文')
    expect(JSON.stringify(expanded)).not.toContain('个人同名技能')
})

it('a copied readable finance slash name loads the same pinned builtin and respects its toggle',async()=>{
 const f=await fixture(false,true),id='builtin:ework-finance-analysis',skill=f.service.runtimeSnapshot().skills.find(s=>s.id===id)
 const name='ework-finance-analysis',messages=[createUserMessage({content:[{type:'text',text:'/'+name+' 核验资料'}],source:{kind:'user'}})]
 const step=()=>f.ctx.waterfall(scopeTarget(f.ctx,f.agent),'agent/pre-step',{agent:f.agent,messages,turn:0,step:0,signal:new AbortController().signal},()=>Promise.resolve({kind:'enter',messages}))
 expect((await step()).messages.find(m=>m.source.kind==='skill-invocation')?.content[0].text).toContain('内置 1.1.1 正文')
 expect((await f.ctx.skills.get(name,f.lookup)).resourceBase.path).toBe(skill.resourceRoot)
 const reply=await f.service.request({type:'set-enabled',kind:'skill',id,enabled:false,meta:{requestId:'disable-readable-alias',expectedRevision:skill.revision}});await f.service.operations.wait(reply.operation.id)
 await expect(step()).rejects.toThrow('所选技能未能加载')
})

it('assembles report routing and expands both pinned slash names, then blocks both immediately after disabling',async()=>{
 const f=await fixture(false,false,true),id='builtin:ework-equity-research',skill=f.service.runtimeSnapshot().skills.find(s=>s.id===id),alias=managedSkillInvocationName(skill)
 const before=await f.ctx.systemPrompt.assemble({agent:f.agent,scope:f.agent})
 expect(before.contexts.find(c=>c.name==='ework:equity-research-skill')?.text).toContain(alias)
 const step=name=>{const messages=[createUserMessage({content:[{type:'text',text:'/'+name+' 撰写公司研报'}],source:{kind:'user'}})];return f.ctx.waterfall(scopeTarget(f.ctx,f.agent),'agent/pre-step',{agent:f.agent,messages,turn:0,step:0,signal:new AbortController().signal},()=>Promise.resolve({kind:'enter',messages}))}
 for(const name of [alias,'ework-equity-research']) expect((await step(name)).messages.find(m=>m.source.kind==='skill-invocation')?.content[0].text).toContain('内置 1.1.1 正文')
 const reply=await f.service.request({type:'set-enabled',kind:'skill',id,enabled:false,meta:{requestId:'disable-equity-route',expectedRevision:skill.revision}});await f.service.operations.wait(reply.operation.id)
 const after=await f.ctx.systemPrompt.assemble({agent:f.agent,scope:f.agent})
 expect(after.contexts.find(c=>c.name==='ework:equity-research-skill')).toBeUndefined()
 for(const name of [alias,'ework-equity-research']) await expect(step(name)).rejects.toThrow('所选技能未能加载')
})
