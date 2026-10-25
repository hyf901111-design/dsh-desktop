import { expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import { patchHomeGuideSessionCatalog } from '../scripts/lib/home-guide-session-catalog.mjs'

const reload = String.raw`
import assert from 'node:assert/strict'
import { registerHooks, createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdtemp, rm, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const require = createRequire(join(process.cwd(), 'package.json')), sessionUrl = process.argv[2]
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === '@deepseek-ai/dsh-session') return { url: sessionUrl, shortCircuit: true }
  if (context.parentURL === sessionUrl && !specifier.startsWith('.') && !specifier.startsWith('node:')) return { url: pathToFileURL(require.resolve(specifier)).href, shortCircuit: true }
  return nextResolve(specifier, context)
} })
const [{Context,Service},{default:Storage},{JsonStorageBackend},{DomainFacility},{default:WorkspaceRegistry},{SessionStore},{default:Persistence},{default:AgentRegistry},{default:AgentLoop},{default:LlmRuntime},{default:ToolRuntime},{default:SystemPrompt},{default:UserQuestionService},{createApiProxy,InProcessApiClient,toFetchHandler}] = await Promise.all([
  import('@deepseek-ai/cordis'), import('@deepseek-ai/dsh-storage'), import('@deepseek-ai/dsh-storage-json'), import('@deepseek-ai/dsh-storage-domain'), import('@deepseek-ai/dsh-workspace'), import('@deepseek-ai/dsh-session'), import('@deepseek-ai/dsh-session-persistence-jsonl'), import('@deepseek-ai/dsh-agent'), import('@deepseek-ai/dsh-agent-loop'), import('@deepseek-ai/dsh-llm'), import('@deepseek-ai/dsh-tools'), import('@deepseek-ai/dsh-system-prompt'), import('@deepseek-ai/dsh-user-questions'), import('@deepseek-ai/dsh-host-apiproxy')
])
const root=await realpath(await mkdtemp(join(tmpdir(),'home-guide-catalog-disk-'))),ctx=new Context()
new Storage(ctx)
const backend=new JsonStorageBackend(join(root,'storage'));ctx.storage.backend.register('json',backend)
const domain=new DomainFacility(ctx,{backend:'json'});ctx.provide('storageDomain',domain)
new SessionStore(ctx);new Persistence(ctx,{root:join(root,'sessions'),compression:'none'});new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1});new UserQuestionService(ctx)
try {
  const fixtures=[{id:'saved-presentation',type:'home-guide/presentation',data:{version:2,runId:'saved-run',purpose:'offline-investment-report-presentation',cwd:root}},{id:'saved-report',type:'home-guide/report',data:{version:1,runId:'report-run',purpose:'offline-professional-investment-report',cwd:root,htmlFile:'公司研究报告.html',pdfFile:'公司研究报告.pdf',htmlSha256:'a'.repeat(64),pdfSha256:'b'.repeat(64),researchAsOf:'2026-10-25',provenance:{executor:'EWork Odyssey',model:'Kimi K3 High'}}}]
  for(const item of fixtures){const original=await ctx.agents.create({sessionId:item.id,meta:{cwd:root},agentOptions:{}});original.agent.session.append(item.type,item.data);await ctx.sessions.flush(original.agent.session);await original.dispose();assert.equal(ctx.agents.get(item.id),undefined)}
  const registry=new WorkspaceRegistry(ctx);await registry[Service.init]()
  const wire=new InProcessApiClient(toFetchHandler(createApiProxy(ctx,{cwd:root,defaultModelSelection:()=>({provider:'unused',model:'unused'})})))
  const created=await wire.workspace.create({path:root});assert.equal(created.result.ok,true)
  for(const item of fixtures){const reply=await wire.sessions.create({workspaceId:created.result.value.workspace.workspaceId,sessionId:item.id});assert.equal(reply.result.ok,true,JSON.stringify(reply.result));assert.equal(reply.result.value.sessionId,item.id);assert.deepEqual(ctx.agents.get(item.id).session.events.find(e=>e.type===item.type).data,item.data)}
  assert.deepEqual((await registry.resolveByPath(root)).sessionIds.sort(),['saved-presentation','saved-report'])
  const unknown=await ctx.agents.create({sessionId:'unknown-required',meta:{cwd:root},agentOptions:{}})
  unknown.agent.session.append('unknown/required',{value:'preserve safety fence'})
  await ctx.sessions.flush(unknown.agent.session);await unknown.dispose()
  const refused=await wire.sessions.create({workspaceId:created.result.value.workspace.workspaceId,sessionId:'unknown-required'})
  assert.equal(refused.result.ok,false);assert.match(refused.result.error.message,/unknown\/required/)
  assert.equal(ctx.agents.get('unknown-required'),undefined)
} finally {await ctx.fiber.dispose();await domain.closeAll();await backend.close();await rm(root,{recursive:true,force:true})}
`

it('cold-restores presentation and report ownership with exact typed metadata and binds both Sessions to the actual Host workspace', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'home-guide-catalog-package-'))
  try {
    const source = await readFile('node_modules/@deepseek-ai/dsh-session/lib/index.js', 'utf8')
    const artifact = join(dir, 'packaged-session.mjs')
    await writeFile(artifact, patchHomeGuideSessionCatalog(source))
    const result = spawnSync(resolve('node_modules/node/bin/node'), ['--input-type=module', '-', pathToFileURL(artifact).href], { input: reload, cwd: process.cwd(), encoding: 'utf8', timeout: 20000 })
    expect(result.error?.message ?? result.stderr).toBe('')
    expect(result.status, result.stderr).toBe(0)
  } finally { await rm(dir, { recursive: true, force: true }) }
}, 25000)

it('updates both packaged and unbundled readers idempotently and fails closed when the native catalog changes', async () => {
  for (const path of ['lib/index.js', 'lib/types/known-event-types.js']) {
    const source = await readFile('node_modules/@deepseek-ai/dsh-session/' + path, 'utf8')
    const patched = patchHomeGuideSessionCatalog(source)
    expect(patchHomeGuideSessionCatalog(patched)).toBe(patched)
    const declaration = patched.match(/const KNOWN_SESSION_EVENT_TYPES = new Set\(\[[\s\S]*?\]\);/)[0]
    const catalog = runInNewContext(declaration + '; KNOWN_SESSION_EVENT_TYPES')
    expect(catalog.has('home-guide/presentation')).toBe(true)
    expect(catalog.has('home-guide/report')).toBe(true)
    expect(catalog.has('unknown/required')).toBe(false)
  }
  expect(() => patchHomeGuideSessionCatalog('const changed = new Set([])')).toThrow('无法定位')
})
it('strictly upgrades the existing v1 catalog and rejects duplicate or damaged ownership blocks',()=>{
 const base='export const KNOWN_SESSION_EVENT_TYPES = new Set(["turn/start","turn/end"]);',legacy=base.replace('Set([','Set([\n/* sherlock:home-guide-session-catalog:v1 */\n"home-guide/presentation",'),upgraded=patchHomeGuideSessionCatalog(legacy)
 expect(upgraded).toBe(patchHomeGuideSessionCatalog(base));expect(patchHomeGuideSessionCatalog(upgraded)).toBe(upgraded)
 for(const damaged of [upgraded+'\n/* sherlock:home-guide-session-catalog:v2 */',upgraded.replace('"home-guide/report",','"changed/report",'),legacy.replace('"home-guide/presentation",',''),base+'\n/* sherlock:home-guide-session-catalog:v9 */'])expect(()=>patchHomeGuideSessionCatalog(damaged)).toThrow(/目录/)
})
