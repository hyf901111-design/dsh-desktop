import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { acceptArtifactOutput } from '../packages/dsh-research-task-runtime/artifact-output.js'
import { readTemplateModel } from '../packages/dsh-research-task-runtime/component-template-registry.js'
import { ResearchTaskRuntime } from '../packages/dsh-research-task-runtime/index.js'

// Public delivery and its successful business response from the native run.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/workbench-valuation-note-only.json', import.meta.url), 'utf8'))

it('preserves the observed valuation rows, notes and native table interaction without guessing provenance', () => {
  const artifact = structuredClone(fixture.artifact)
  const output = acceptArtifactOutput(JSON.stringify(artifact))
  expect(output).toBeDefined()
  const model = readTemplateModel(JSON.parse(output))
  expect(model.data.type).toBe('market')
  expect(model.data.variant).toBe('table')
  expect(model.data.rows).toEqual(artifact.rows)
  expect(model.data.columns).toEqual(artifact.columns)
  expect(model.data.note).toBe(artifact.note)
  expect(model.data.asOf).toBe('静态快照 · 来源与时点见表格及说明')
  expect(JSON.parse(output).html).toContain('data-sherlock-market="table"')
  expect(JSON.parse(output).html).toContain('data-market-search')
  expect(JSON.parse(output).html).toContain('data-column="0"')
  expect(artifact).toEqual(fixture.artifact)
})

it('does not salvage unknown metadata, invalid notes or malformed row data into a sourced table', () => {
  for (const mutate of [
    a => { a.unrecognized = 'unvalidated' },
    a => { a.note = '' },
    a => { a.note = { source: 'guessed' } },
    a => { a.note = 'x'.repeat(2001) },
    a => { a.asOf = null },
    a => { a.rows[0].pop() },
    a => { a.rows[0][0] = { guessed: 1 } },
    a => { a.rows = [] }
  ]) {
    const artifact = structuredClone(fixture.artifact); mutate(artifact)
    expect(acceptArtifactOutput(JSON.stringify(artifact))).toBeUndefined()
  }
})

it('delivers an observed note-only valuation table in the first generation without fetching or binding again', async () => {
  const start = vi.fn(async () => ({ childSessionId: 'child', dispose: async () => {}, result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: JSON.stringify(fixture.artifact) }], sourceRecords: [fixture.sourceRecord] }) }))
  const bindData = vi.fn(async () => {})
  const runtime = new ResearchTaskRuntime({ adapter: { start, bindData, dispose: async () => {} }, storage: { load: async () => ({ version: 1, tasks: [] }), save: async () => {} }, createId: () => 'task' })
  try {
    await runtime.start({ parentSessionId: 'parent', canvasNodeId: 'node', kind: 'container', prompt: '工作台：真实估值研究\n本面板：估值水平对比（PE / PB / 市值）\n通过通联真实数据取得中际旭创、新易盛、工业富联估值、日期、来源与单位，保留全部真实行和计算口径，支持搜索和排序。\n仅生成本面板，优先使用 table 类型。' })
    await vi.waitFor(() => expect(runtime.inspect({ parentSessionId: 'parent', taskId: 'task' }).state).toBe('completed'))
    const output = JSON.parse(runtime.inspect({ parentSessionId: 'parent', taskId: 'task' }).finalOutput)
    const model = readTemplateModel(output)
    expect(model.data.rows).toEqual(fixture.artifact.rows)
    expect(model.data.note).toBe(fixture.artifact.note)
    expect(output.type).toBe('html')
    expect(output.html).not.toContain('交互视图暂未完成')
    expect(start).toHaveBeenCalledOnce()
    expect(bindData).not.toHaveBeenCalled()
  } finally { await runtime.dispose() }
})
