import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveBoundComponent } from '../packages/dsh-research-task-runtime/component-source-binding.js'
import { readTemplateModel } from '../packages/dsh-research-task-runtime/component-template-registry.js'
import { ResearchTaskRuntime } from '../packages/dsh-research-task-runtime/index.js'
import { acceptArtifactOutput } from '../packages/dsh-research-task-runtime/artifact-output.js'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/workbench-quote-binding-failure.json', import.meta.url), 'utf8'))
const prompt = '工作台：真实金融研究\n本面板：最新行情对比（三股+沪深300）\n对比中际旭创(sz300308)、新易盛(sz300502)、工业富联(sh601138)和沪深300(sh000300)，用腾讯真实报价、证券代码、价格单位、最后报价时间，缺失明确标注；支持搜索排序。价格自动刷新。\n仅生成本面板，优先使用 table 类型。'
const corrected = () => {
  const data = structuredClone(fixture.repair)
  delete data.mapping.variant
  delete data.mapping.notes
  data.mapping.note = '腾讯财经公开报价；证券价格单位CNY，指数单位points；成交量/成交额本次未取得。仅依据完整响应说明缺失。'
  return data
}

it('keeps the malformed first JSON rejected and diagnoses the actual repair table metadata precisely', () => {
  expect(() => JSON.parse(fixture.firstText)).toThrow()
  expect(acceptArtifactOutput(fixture.firstText)).toBeUndefined()
  expect(() => resolveBoundComponent(JSON.stringify(fixture.repair), [fixture.sourceRecord])).toThrow(/table.*variant.*notes.*note/u)
})

it.each([true, false])('repairs observed quotes once without dropping the fourth real record (binding=%s)', async binding => {
  const fixed = corrected()
  const staticData = { version: 1, type: 'table', title: fixed.mapping.title, columns: ['证券代码', '名称', '最新价', '单位', '报价时间'], rows: fixture.sourceRecord.response.records.map(row => [row.symbol, row.name, String(row.price), row.priceUnit, row.time]), note: fixed.mapping.note }
  const start = vi.fn(async () => ({ childSessionId: 'child-' + start.mock.calls.length, dispose: async () => {}, result: Promise.resolve(start.mock.calls.length === 1
    ? { stopReason: 'completed', output: [{ type: 'text', text: fixture.firstText }], sourceRecords: [fixture.sourceRecord] }
    : { stopReason: 'completed', output: [{ type: 'text', text: JSON.stringify(binding ? fixed : staticData) }], sourceRecords: [] }) }))
  const bindData = vi.fn(async () => {})
  const runtime = new ResearchTaskRuntime({ adapter: { start, bindData, dispose: async () => {} }, storage: { load: async () => ({ version: 1, tasks: [] }), save: async () => {} }, createId: () => 'task' })
  try {
    await runtime.start({ parentSessionId: 'parent', canvasNodeId: 'node', kind: 'container', prompt: binding ? prompt : prompt.replace('价格自动刷新。', '只取本次快照。') })
    await vi.waitFor(() => expect(runtime.inspect({ parentSessionId: 'parent', taskId: 'task' }).state).toBe('completed'))
    expect(start).toHaveBeenCalledTimes(2)
    const repair = start.mock.calls[1][0]
    expect(repair.synthesisOnly).toBe(true)
    expect(repair.prompt).toContain('仅支持 version/type/title/columns/rows/asOf/note')
    expect(repair.prompt).toContain('证券代码、名称、单位和报价时间必须引用各行真实字段')
    expect(repair.prompt).toContain('不能根据 responseSample 推断缺失')
    const evidence = repair.prompt.split('\n').filter(line => line.startsWith('{')).map(line => { try { return JSON.parse(line) } catch { return null } }).find(value => value?.responseSample)
    expect(evidence.responseSample.records).toHaveLength(3)
    expect(evidence.responseArrayLengths).toEqual({ records: 4, missingSymbols: 0 })
    const output = readTemplateModel(JSON.parse(runtime.inspect({ parentSessionId: 'parent', taskId: 'task' }).finalOutput)).data
    expect(output.rows).toHaveLength(4)
    expect(output.rows[3][0]).toBe('sh000300')
    expect(output.rows[3]).toContain('points')
    expect(output.note).not.toContain('沪深300行本次未取得')
    expect(output.rows[1].join(' ')).not.toContain('sz300308')
    if (binding) {
      expect(bindData).toHaveBeenCalledOnce()
      expect(bindData.mock.calls[0][1].requests[0].args).toEqual(fixture.sourceRecord.args)
    } else expect(bindData).not.toHaveBeenCalled()
  } finally { await runtime.dispose() }
})

it.each(['request', 'field'])('does not relax the observed request or source field validation after metadata repair: %s', mode => {
  const draft = corrected()
  if (mode === 'request') draft.requests[0].args.parameters_json = '{"symbols":["sh000300"]}'
  else draft.mapping.rows.$map[2].$path = 'inventedPrice'
  expect(() => resolveBoundComponent(JSON.stringify(draft), [fixture.sourceRecord])).toThrow(mode === 'request' ? /参数一致/ : /inventedPrice/)
})
