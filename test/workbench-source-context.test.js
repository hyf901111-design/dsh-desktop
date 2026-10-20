import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerWorkbench } from '../packages/dsh-research-task-runtime/workbench.js'
import { validateWorkbench, workbenchPanelPrompt } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { ResearchTaskRuntime, buildResearchTaskPrompt, validateResearchTaskStart } from '../packages/dsh-research-task-runtime/index.js'

const cleanup = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
const human = (text, id = 'current-request') => ({ type: 'user/message', data: { id, source: { kind: 'user' }, content: [{ type: 'text', text }] } })
const original = '创建真实数据金融工作台：中际旭创(sz300308)、新易盛(sz300502)、工业富联(sh601138)，基准沪深300(sh000300)。近一个月约20个交易日；禁止模拟值，保留来源、日期、单位和原文链接。共8卡，走势另用chart.bar，公告用news。'
const panels = ['table', 'timeline', 'news'].map((type, index) => ({ title: `独立问题${index}`, prompt: '仅比较三家公司的本卡真实记录，取不到明确标注缺失。', type, size: 'large' }))
async function fixture(batch = true, events = [human(original)]) {
  const dir = await mkdtemp(join(tmpdir(), 'source-workbench-context-'))
  let tool
  const ctx = { agents: { get: () => ({}) }, tools: { register: value => { tool = value; return () => {} } }, webServer: { register: () => () => {} } }
  const runtime = batch ? { startBatch: vi.fn(async ({ panels }) => panels.map((_, i) => ({ taskId: `task-${i}` }))) } : { start: vi.fn(async request => ({ taskId: request.canvasNodeId })) }
  const filePath = join(dir, 'plans.json'), dispose = await registerWorkbench(ctx, runtime, { filePath })
  cleanup.push(async () => { await dispose(); await rm(dir, { recursive: true, force: true }) })
  const session = { id: 'parent', events }, exec = { agent: { session } }
  return { tool, runtime, session, exec, filePath }
}

it.each([true, false])('passes the current original scope through real creation and keeps a retry idempotent (batch=%s)', async batch => {
  const f = await fixture(batch, [human('创建寒武纪与浪潮信息工作台', 'old-request'), { type: 'user/message', data: { source: { kind: 'plugin' }, content: [{ type: 'text', text: '记忆对象：中科曙光' }] } }, human(original)])
  const args = { requestId: 'scope', title: '行业研究', dataMode: 'source', panels }
  const pending = f.tool.execute(args, f.exec)
  f.session.events.push(human('只读检查当前生成状态，不要新增。', 'later-status'))
  const receipt = await pending
  const saved = JSON.parse(await readFile(f.filePath, 'utf8'))[0]
  expect(saved.input.originalRequest).toBe(original)
  const requests = batch ? f.runtime.startBatch.mock.calls[0][0].panels : f.runtime.start.mock.calls.map(call => call[0])
  expect(requests).toHaveLength(3)
  for (const [index, request] of requests.entries()) {
    expect(request.prompt).toContain(original)
    expect(request.prompt).not.toContain('记忆对象：中科曙光')
    expect(request.prompt).not.toContain('只读检查当前生成状态')
    const built = buildResearchTaskPrompt({ ...request, kind: 'container', parentSessionId: 'parent' })
    expect(built.split('唯一交付格式：')[1].split('\n')[0]).toContain(panels[index].type === 'timeline' ? 'type:"timeline"' : `"type":"${panels[index].type}"`)
    expect(built).toContain('只完成本面板')
  }
  expect(f.tool.parameters.properties).not.toHaveProperty('originalRequest')
  expect((await f.tool.execute(args, f.exec)).planId).toBe(receipt.planId)
  expect(batch ? f.runtime.startBatch.mock.calls.length : f.runtime.start.mock.calls.length).toBe(batch ? 1 : 3)
})

it('does not attach a read-only interruption or recover an unrelated historical creation as the new scope', async () => {
  const f = await fixture(true, [human('创建旧的药品工作台', 'old'), human('只读查看已有工作台的生成状态，不要创建。', 'status')])
  await f.tool.execute({ requestId: 'no-invented-scope', title: '已有规划', dataMode: 'source', panels }, f.exec)
  const saved = JSON.parse(await readFile(f.filePath, 'utf8'))[0]
  expect(saved.input).not.toHaveProperty('originalRequest')
  expect(f.runtime.startBatch.mock.calls[0][0].panels[0].prompt).not.toContain('创建旧的药品工作台')
  expect(f.runtime.startBatch.mock.calls[0][0].panels[0].prompt).not.toContain('只读查看已有工作台')
})

it('preserves nonfinancial entities, time windows and constraints without changing the current template', () => {
  const request = '创建河西遗址和南山遗址的考古研究工作台，范围2026-01-01至2026-10-20。仅真实发掘资料，禁止补造出土数量；另一个图表参考chart.bar。'
  const plan = validateWorkbench({ requestId: 'archaeology', title: '遗址研究', dataMode: 'source', originalRequest: request, panels })
  expect(plan.originalRequest).toBe(request)
  for (const p of plan.panels) {
    const prompt = workbenchPanelPrompt(plan, p)
    expect(buildResearchTaskPrompt({ kind: 'container', parentSessionId: 'p', canvasNodeId: p.title, prompt }).split('唯一交付格式：')[1].split('\n')[0]).toContain(p.type === 'timeline' ? 'type:"timeline"' : `"type":"${p.type}"`)
    expect(prompt).toContain(request)
  }
})

it('bounds the host scope without truncating its constraints or expanding ordinary manual prompt limits', () => {
  const plan = validateWorkbench({ requestId: 'long-scope', title: '长需求', dataMode: 'source', originalRequest: '创建真实数据工作台。' + '材料范围与来源约束。'.repeat(700), panels: [{ ...panels[0], prompt: panels[0].prompt + '字段说明。'.repeat(400) }] })
  const prompt = workbenchPanelPrompt(plan, plan.panels[0])
  expect(prompt.length).toBeGreaterThan(9000)
  expect(validateResearchTaskStart({ kind: 'container', parentSessionId: 'p', canvasNodeId: 'c', prompt }).prompt).toBe(prompt)
  expect(() => validateWorkbench({ ...plan, originalRequest: 'x'.repeat(8001) })).toThrow('原始工作台需求')
  expect(() => validateResearchTaskStart({ kind: 'container', parentSessionId: 'p', canvasNodeId: 'manual', prompt: 'x'.repeat(9001) })).toThrow('容器内容提示无效')
})

it('restores a persisted failed card with its original scope when retrying the unchanged short requirement', async () => {
  const plan = validateWorkbench({ requestId: 'restore-scope', title: '研究', dataMode: 'source', originalRequest: original, panels: [panels[0]] })
  const prompt = workbenchPanelPrompt(plan, plan.panels[0])
  const stored = { version: 1, tasks: [{ taskId: 'old', parentSessionId: 'p', canvasNodeId: 'c', kind: 'container', prompt, state: 'failed', createdAt: 1, completedAt: 2, lastSeq: 0, error: '旧生成失败' }] }
  const adapter = { start: vi.fn(async request => ({ childSessionId: 'child', result: new Promise(resolve => { request.signal.addEventListener('abort', () => resolve({ stopReason: 'aborted', output: [] }), { once: true }) }), dispose: async () => {} })) }
  const runtime = new ResearchTaskRuntime({ adapter, storage: { load: async () => stored, save: async () => {} } })
  cleanup.push(() => runtime.dispose())
  await runtime.restore()
  await runtime.start({ kind: 'container', parentSessionId: 'p', canvasNodeId: 'c', prompt: panels[0].prompt })
  await vi.waitFor(() => expect(adapter.start).toHaveBeenCalledTimes(1))
  expect(adapter.start.mock.calls[0][0].query).toBe(prompt)
  expect(adapter.start.mock.calls[0][0].prompt).toContain(original)
})

it.each([
  ['每分钟自动更新，查询最新真实记录。','另一张公告卡仅手动刷新。',1,true],
  ['仅手动刷新，查询最新真实记录。','另一张价格卡每分钟自动更新。',0,true],
  ['每分钟自动更新，查询最新真实记录。','另一张回测卡固定日期截至2025-01-01。',1,true]
])('keeps refresh recipe settings on the current card: %s',async(own,other,interval,rolling)=>{
  const now=Date.parse('2026-10-20T04:00:00Z'),args={endDate:'20261020'},records=[{tool:'ework__t_abc123',args,response:{date:'2026-10-20',value:12}}]
  const mapped={version:1,type:'data-bound',requests:[{key:'q',tool:'ework__t_abc123',args}],mapping:{version:1,type:'table',title:'真实记录',columns:['数值'],rows:{$from:'q',$map:[{$path:'value',$as:'string'}],$single:true}}}
  mapped.mapping.rows=[mapped.mapping.rows]
  const bindData=vi.fn(async()=>{}),start=vi.fn(async()=>({childSessionId:'child',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(mapped)}],sourceRecords:records}),dispose:async()=>{}}))
  const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{save:async()=>{}},now:()=>now})
  cleanup.push(()=>runtime.dispose())
  const plan=validateWorkbench({requestId:'recipe-scope',title:'真实研究',dataMode:'source',originalRequest:'创建真实记录工作台。'+other,panels:[{title:'真实记录',type:'table',size:'large',prompt:own}]})
  const task=await runtime.start({kind:'container',parentSessionId:'p',canvasNodeId:'recipe',prompt:workbenchPanelPrompt(plan,plan.panels[0])})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'p',taskId:task.taskId}).state).toBe('completed'))
  expect(start).toHaveBeenCalledTimes(1)
  expect(bindData).toHaveBeenCalledOnce()
  const recipe=bindData.mock.calls[0][1]
  expect(recipe.intervalMinutes).toBe(interval)
  expect(typeof recipe.requests[0].args.endDate==='object').toBe(rolling)
})

it("does not require another card's named source when accepting this card's observed news snapshot",async()=>{
  const output={version:1,type:'news',title:'近期新闻',asOf:'2026-10-20 · 新浪财经',items:[{title:'已取得的公司新闻',summary:'本次真实来源正文',date:'2026-10-20',category:'公司',url:'https://example.com/company-news'}]}
  const start=vi.fn(async()=>({childSessionId:'news',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(output)}],sourceRecords:[{tool:'public_data_query',args:{operation:'query',source:'sina-news',parameters_json:'{"limit":12}'},response:{records:output.items}}]}),dispose:async()=>{}}))
  const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}}})
  cleanup.push(()=>runtime.dispose())
  const plan=validateWorkbench({requestId:'news-accept',title:'公司研究',dataMode:'source',originalRequest:'创建中际旭创、新易盛、工业富联研究工作台。估值卡使用通联DataYes。',panels:[{title:'近期新闻',type:'news',size:'large',prompt:'实际检索三家公司新闻，只取本次快照，保留原文链接。'}]})
  const task=await runtime.start({kind:'container',parentSessionId:'p',canvasNodeId:'news',prompt:workbenchPanelPrompt(plan,plan.panels[0])})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'p',taskId:task.taskId}).state).toBe('completed'))
  expect(start).toHaveBeenCalledTimes(1)
})
