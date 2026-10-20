import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createSubagentAdapter, ResearchTaskRuntime } from '../packages/dsh-research-task-runtime/index.js'
import { readTemplateModel } from '../packages/dsh-research-task-runtime/component-template-registry.js'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/workbench-web-announcements-repair.json', import.meta.url), 'utf8'))
const prompt = '工作台：真实公司研究\n本面板：近期公司公告\n整理中际旭创、新易盛、工业富联近30天公告标题、日期、已核实来源链接。没有单条原文URL时说明限制，不猜链接；只用真实数据，保留公司筛选。\n仅生成本面板，优先使用 reports 类型。'
const reports = { version: 1, type: 'reports', title: '近期公司公告', items: fixture.pages.map(page => ({ title: page.title, date: page.date, category: page.title.split('：')[0], summary: '新浪财经公司公告列表已核实标题和日期；单条公告原文URL本次未取得，链接仅打开已读取的公司列表页。', url: page.url })) }
const empty = { version: 1, type: 'dashboard', title: '近期公司公告', asOf: '公告列表缺失·来源不可用', items: [{ label: '三家公司公告', value: '—', detail: '尚未取得业务记录' }] }

function adapterContext(events, output = []) {
  const parent = { id: 'parent', session: { events: [] } }, child = { id: 'child', session: { events } }, listeners = new Set()
  const run = { id: child.id, localAgent: child, result: Promise.resolve({ stopReason: 'completed', output }), dispose: vi.fn(async () => {}) }
  const ctx = { agents: { get: () => parent }, tools: { schemas: () => [{ name: 'public_data_query' }, { name: 'web_search' }, { name: 'web_fetch' }, { name: 'read' }] }, subagents: { start: vi.fn(async () => run) }, on: (_name, fn) => { listeners.add(fn); return () => listeners.delete(fn) } }
  return { ctx, child, emit: event => { for (const fn of listeners) fn(child, event) } }
}
async function acquired(events = fixture.events, output = []) {
  const { ctx } = adapterContext(events, output)
  const adapter = createSubagentAdapter(ctx)
  const handle = await adapter.start({ parentSessionId: 'parent', kind: 'container', query: prompt, prompt, signal: new AbortController().signal, onSessionEvent: () => {} })
  try { return await handle.result } finally { await handle.dispose() }
}

it('retains all three observed announcement pages and URLs despite earlier large unrelated tool results', async () => {
  const result = await acquired()
  for (const page of fixture.pages) {
    expect(result.researchEvidence).toContain(page.url)
    expect(result.researchEvidence).toContain(page.title)
    expect(result.researchEvidence).toContain(page.date)
  }
  expect(Buffer.byteLength(result.researchEvidence)).toBeLessThanOrEqual(48000)
})

it.each([{binding:false,missing:false},{binding:false,missing:true},{binding:true,missing:false}])('carries bounded public web evidence into a structured repair while preserving the data gate: %j', async ({binding,missing}) => {
  const first = await acquired(), save = vi.fn(async () => {})
  const unboundWebRecipe={version:1,type:'data-bound',requests:[{key:'web',tool:'web_fetch',args:{url:fixture.pages[0].url}}],mapping:reports}
  const start = vi.fn(async () => ({ childSessionId: 'child-' + start.mock.calls.length, dispose: async () => {}, result: Promise.resolve(start.mock.calls.length === 1 ? first : { stopReason: 'completed', output: [{ type: 'text', text: JSON.stringify(binding?unboundWebRecipe:missing ? empty : reports) }], sourceRecords: [] }) }))
  const bindData = vi.fn(async () => {})
  const runtime = new ResearchTaskRuntime({ adapter: { start, bindData, dispose: async () => {} }, storage: { load: async () => ({ version: 1, tasks: [] }), save }, createId: () => 'task' })
  try {
    await runtime.start({ parentSessionId: 'parent', canvasNodeId: 'node', kind: 'container', prompt:binding?prompt.replace('\n仅生成本面板，','每分钟自动刷新。\n仅生成本面板，'):prompt })
    await vi.waitFor(() => expect(runtime.inspect({ parentSessionId: 'parent', taskId: 'task' }).state).toBe(missing||binding ? 'failed' : 'completed'))
    expect(start).toHaveBeenCalledTimes(2)
    const repair = start.mock.calls[1][0]
    expect(repair.synthesisOnly).toBe(true)
    for (const page of fixture.pages) {
      expect(repair.prompt).toContain(page.url)
      expect(repair.prompt).toContain(page.title)
      expect(repair.prompt).toContain(page.date)
    }
    expect(repair.prompt).toContain('没有单条原文URL时明确说明限制')
    expect(repair.prompt).toContain('接口文档、请求样例和无关新闻不能作为业务数据')
    expect(bindData).not.toHaveBeenCalled()
    if (!missing&&!binding) expect(readTemplateModel(JSON.parse(runtime.inspect({ parentSessionId: 'parent', taskId: 'task' }).finalOutput)).data.items).toEqual(reports.items)
    // Repair evidence stays in memory; only the resulting artifact is stored.
    expect(JSON.stringify(save.mock.calls)).not.toContain('Copyright © 1996-2013 SINA Corporation')
  } finally { await runtime.dispose() }
})

it('bounds public web excerpts per source and in total while excluding failed, credentialed and non-public evidence', async () => {
  const events=structuredClone(fixture.events)
  for(const event of events)if(event.type==='tool/result'&&fixture.pages.some(page=>event.data.message.content.some(c=>c.content?.some(b=>b.type==='text'&&b.text.startsWith('Fetched '+page.url)))))for(const block of event.data.message.content[0].content)if(block.type==='text')block.text=block.text.repeat(10)
  for(const [id,url,body,isError] of [['credentialed','https://user:password@example.org/private','credentialed-body',false],['token','https://example.org/private?access_token=sensitive','token-body',false],['failed','https://example.org/failure','failed-body',true]])events.push({type:'tool/call',data:{callId:id,name:'web_fetch',arguments:JSON.stringify({url})}},{type:'tool/result',data:{message:{source:{callId:id},content:[{type:'tool-result',toolCallId:id,isError,content:[{type:'text',text:body}]}]}}})
  events.push({type:'assistant/chunk',data:{chunk:{type:'reasoning-delta',text:'private-reasoning-marker'}}},{type:'tool/call',data:{callId:'local',name:'read',arguments:'{"path":"private-file"}'}},{type:'tool/result',data:{message:{source:{callId:'local'},content:[{type:'tool-result',toolCallId:'local',content:[{type:'text',text:'private-file-body'}]}]}}})
  const result=await acquired(events), evidence=result.researchEvidence
  expect(Buffer.byteLength(evidence)).toBeLessThanOrEqual(48000)
  const pages=evidence.split('已读取网页URL：').slice(1)
  expect(pages).toHaveLength(3)
  for(const page of pages)expect(Buffer.byteLength(('已读取网页URL：'+page.split('\n\n【其他已取得')[0]).trimEnd())).toBeLessThanOrEqual(14000)
  for(const marker of ['credentialed-body','user:password','token-body','access_token=sensitive','failed-body','private-reasoning-marker','private-file-body'])expect(evidence).not.toContain(marker)
})

it('keeps fetched documentation and request examples from becoming business evidence', async () => {
  const events = fixture.events.filter(e => e.type === 'tool/call' && JSON.parse(e.data.arguments).operation === 'catalog' || e.type === 'tool/result' && e.data.message.content.some(c => c.content?.some(b => b.type === 'text' && b.text.includes('"reviewedOn"'))))
  const url = 'https://example.org/api-documentation', body = JSON.stringify({ documentation: true, examples: [{ title: '文档中的示例公告并非真实记录', date: '2026-10-15', url: 'https://example.org/guessed-article' }] })
  events.push({ type: 'tool/call', data: { callId: 'docs', name: 'web_fetch', arguments: JSON.stringify({ url }) } }, { type: 'tool/result', data: { message: { source: { callId: 'docs' }, content: [{ type: 'tool-result', toolCallId: 'docs', content: [{ type: 'text', text: body }] }] } } })
  const sample = { version: 1, type: 'reports', title: '公告', items: [{ title: '文档中的示例公告并非真实记录', date: '2026-10-15', summary: '接口样例', category: '样例', url: 'https://example.org/guessed-article' }] }
  const first = await acquired(events, [{ type: 'text', text: JSON.stringify(sample) }])
  const start = vi.fn(async () => ({ childSessionId: 'child-' + start.mock.calls.length, dispose: async () => {}, result: Promise.resolve(first) }))
  const runtime = new ResearchTaskRuntime({ adapter: { start, bindData: vi.fn(), dispose: async () => {} }, storage: { load: async () => ({ version: 1, tasks: [] }), save: async () => {} }, createId: () => 'task' })
  try {
    await runtime.start({ parentSessionId: 'parent', canvasNodeId: 'node', kind: 'container', prompt })
    await vi.waitFor(() => expect(runtime.inspect({ parentSessionId: 'parent', taskId: 'task' }).state).toBe('failed'))
    expect(start.mock.calls[1][0].synthesisOnly).toBe(false)
    expect(runtime.inspect({ parentSessionId: 'parent', taskId: 'task' }).finalOutput).toBeUndefined()
  } finally { await runtime.dispose() }
})
