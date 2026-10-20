import { expect, it, vi } from 'vitest'
import { ResearchTaskRuntime } from '../packages/dsh-research-task-runtime/index.js'
import { readTemplateModel } from '../packages/dsh-research-task-runtime/component-template-registry.js'

// The real calendar failure had three successful disclosure responses and an
// empty first delivery. The no-tool repair was incorrectly asked for a binding.
const tool = 'ework__t_cea057132bf7c47c5a4fc6b2f32ee323'
const records = [
  ['300308', '中际旭创', '2026-10-24'],
  ['300502', '新易盛', '2026-10-30'],
  ['601138', '工业富联', '2026-10-30']
].map(([ticker, secShortName, preDate]) => ({
  tool,
  args: { http_method: 'GET', nameEn: 'getEquReportPredisclo', url: 'https://gw.datayes.com/aladdin_proxy/data_api/api/equity/getEquReportPredisclo.json', url_params: { endDate: '20261231', beginDate: '20261020', ticker } },
  response: { retCode: 1, retMsg: 'Success', data: [{ ticker, secShortName, preDate, endDate: '2026-09-30' }] }
}))
const calendar = { version: 1, type: 'calendar', title: '后续重要事件日历', asOf: '2026-10-20 · 通联预约披露', items: records.map(({ response }) => ({ title: response.data[0].secShortName, date: response.data[0].preDate, category: '财报披露预约', summary: '通联 getEquReportPredisclo；除权除息与股东大会日期本次未取得' })) }
const prompt = '工作台：真实公司研究\n本面板：后续重要事件日历\n整理中际旭创、新易盛、工业富联下一个财报预约披露日，保留真实日期、来源；未核实日期明确缺失。\n仅生成本面板，优先使用 calendar 类型。'

it.each(['empty', 'invalid-mapping'])('recovers an unrequested-refresh calendar as a native snapshot after %s delivery', async mode => {
  const broken = { version: 1, type: 'data-bound', requests: [{ key: 'q', tool, args: records[0].args }], mapping: { ...calendar, items: [{ title: { $from: 'q', $path: 'data.0.secShortName' }, date: { $from: 'q', $path: 'data.0.preDate' }, summary: { $map: [{ $path: 'preDate' }] } }] } }
  const start = vi.fn(async () => ({ childSessionId: 'child-' + start.mock.calls.length, dispose: async () => {}, result: Promise.resolve(start.mock.calls.length === 1
    ? { stopReason: 'completed', output: mode === 'empty' ? [] : [{ type: 'text', text: JSON.stringify(broken) }], sourceRecords: records }
    : { stopReason: 'completed', output: [{ type: 'text', text: JSON.stringify(calendar) }], sourceRecords: [] }) }))
  const bindData = vi.fn(async () => {})
  const runtime = new ResearchTaskRuntime({ adapter: { start, bindData, dispose: async () => {} }, storage: { load: async () => ({ version: 1, tasks: [] }), save: async () => {} }, createId: () => 'task' })
  try {
    await runtime.start({ parentSessionId: 'parent', canvasNodeId: 'node', kind: 'container', prompt })
    await vi.waitFor(() => expect(runtime.inspect({ parentSessionId: 'parent', taskId: 'task' }).state).toBe('completed'))
    expect(start).toHaveBeenCalledTimes(2)
    const repair = start.mock.calls[1][0]
    expect(repair.synthesisOnly).toBe(true)
    expect(repair.prompt).not.toContain('缺少自动更新映射')
    expect(repair.prompt).not.toContain('请用 data-bound 包装当前模板')
    expect(repair.prompt).toContain('优先直接交付原生模板 JSON')
    expect(repair.prompt).toContain('需要展示完整记录时允许 data-bound')
    for (const record of records) expect(repair.prompt).toContain(JSON.stringify(record.response.data[0]))
    expect(readTemplateModel(JSON.parse(runtime.inspect({ parentSessionId: 'parent', taskId: 'task' }).finalOutput)).data.items).toEqual(calendar.items)
    expect(bindData).not.toHaveBeenCalled()
  } finally { await runtime.dispose() }
})

it('delivers a source-backed native calendar without a mapping or another generation', async () => {
  const start = vi.fn(async () => ({ childSessionId: 'child', dispose: async () => {}, result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: JSON.stringify(calendar) }], sourceRecords: records }) }))
  const bindData = vi.fn(async () => {})
  const runtime = new ResearchTaskRuntime({ adapter: { start, bindData, dispose: async () => {} }, storage: { load: async () => ({ version: 1, tasks: [] }), save: async () => {} }, createId: () => 'task' })
  try {
    await runtime.start({ parentSessionId: 'parent', canvasNodeId: 'node', kind: 'container', prompt })
    await vi.waitFor(() => expect(runtime.inspect({ parentSessionId: 'parent', taskId: 'task' }).state).toBe('completed'))
    expect(start).toHaveBeenCalledOnce()
    expect(bindData).not.toHaveBeenCalled()
    expect(readTemplateModel(JSON.parse(runtime.inspect({ parentSessionId: 'parent', taskId: 'task' }).finalOutput)).data.items).toEqual(calendar.items)
  } finally { await runtime.dispose() }
})

it.each([['每分钟自动更新。', 1], ['仅手动刷新。', 0]])('keeps an explicitly requested calendar binding strict: %s', async (refresh, interval) => {
  const mapped = { version: 1, type: 'data-bound', requests: records.map((record, i) => ({ key: 'q' + i, tool, args: record.args })), mapping: { version: 1, type: 'calendar', title: calendar.title, items: records.map((_, i) => ({ title: { $from: 'q' + i, $path: 'data.0.secShortName' }, date: { $from: 'q' + i, $path: 'data.0.preDate' }, summary: '通联预约披露；其他日期本次未取得', category: '财报披露预约' })) } }
  const start = vi.fn(async () => ({ childSessionId: 'child-' + start.mock.calls.length, dispose: async () => {}, result: Promise.resolve(start.mock.calls.length === 1
    ? { stopReason: 'completed', output: [{ type: 'text', text: JSON.stringify(calendar) }], sourceRecords: records }
    : { stopReason: 'completed', output: [{ type: 'text', text: JSON.stringify(mapped) }], sourceRecords: [] }) }))
  const bindData = vi.fn(async () => {})
  const runtime = new ResearchTaskRuntime({ adapter: { start, bindData, dispose: async () => {} }, storage: { load: async () => ({ version: 1, tasks: [] }), save: async () => {} }, createId: () => 'task' })
  try {
    await runtime.start({ parentSessionId: 'parent', canvasNodeId: 'node', kind: 'container', prompt: prompt.replace('\n仅生成本面板，', refresh + '\n仅生成本面板，') })
    await vi.waitFor(() => expect(runtime.inspect({ parentSessionId: 'parent', taskId: 'task' }).state).toBe('completed'))
    expect(start).toHaveBeenCalledTimes(2)
    const repair = start.mock.calls[1][0]
    expect(repair.synthesisOnly).toBe(true)
    expect(repair.prompt).toContain('缺少自动更新映射')
    expect(repair.prompt).toContain('自动绑定数据交付协议')
    expect(repair.prompt).not.toContain('本卡未要求刷新绑定')
    expect(bindData).toHaveBeenCalledOnce()
    expect(bindData.mock.calls[0][1].intervalMinutes).toBe(interval)
  } finally { await runtime.dispose() }
})
