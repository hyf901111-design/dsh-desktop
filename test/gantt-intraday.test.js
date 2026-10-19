import { describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'
import { renderGanttArtifact } from '../packages/dsh-research-task-runtime/gantt-artifact.js'
import { acceptArtifactOutput } from '../packages/dsh-research-task-runtime/artifact-output.js'
import { prepareSimulatedArtifact } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { readTemplateModel, templateFor } from '../packages/dsh-research-task-runtime/component-template-registry.js'
import { GANTT_GUIDANCE, ganttDataIssue } from '../packages/dsh-research-task-runtime/gantt-template-contract.js'
import { buildResearchTaskPrompt } from '../packages/dsh-research-task-runtime/index.js'

const input = items => ({ version: 1, type: 'gantt', title: '完整节目排期（模拟）', asOf: '模拟排期', items })
const doc = spec => { const w = new Window(); w.document.write(renderGanttArtifact(spec).html); w.eval(w.document.querySelector('script').textContent); return w.document }
describe('Gantt 日内及完整排期', () => {
  it('uses the same schema for discovery and child generation and reports exact invalid fields', () => {
    const spec = input([{ label: '跨夜场', start: '2026-10-19T23:00', end: '2026-10-19T01:00' }])
    expect(templateFor(spec).schema).toBe(GANTT_GUIDANCE)
    expect(buildResearchTaskPrompt({ kind: 'container', parentSessionId: 'p', canvasNodeId: 'n', prompt: '工作台：活动\n本面板：排期\n仅生成本面板，优先使用 gantt 类型。' })).toContain(GANTT_GUIDANCE)
    expect(ganttDataIssue(spec)).toContain('gantt.items[0] 的end早于start')
    expect(() => prepareSimulatedArtifact({ title: spec.title, type: 'gantt', artifact: spec })).toThrow('跨午夜请明确次日日期')
  })
  it('keeps the inclusive whole-day geometry for existing date-only records', () => {
    const d = doc(input([{ label: '第一阶段', start: '2026-10-19', end: '2026-10-19' }, { label: '第二阶段', start: '2026-10-20', end: '2026-10-21' }]))
    expect(d.querySelector('.gantt-note').textContent).toContain('3 天')
    expect(d.querySelector('.gantt-bar').style.width).toBe('33.333%')
    expect(d.querySelector('.gantt-axis').textContent).not.toContain(':')
  })
  it.each(['', '+08:00', 'Z'])('uses elapsed minutes for same-day ISO schedules with offset %s', zone => {
    const d = doc(input([{ label: '首场', start: '2026-10-19T18:00' + zone, end: '2026-10-19T19:00' + zone }, { label: '末场', start: '2026-10-19T20:00' + zone, end: '2026-10-19T22:00' + zone }]))
    expect([...d.querySelectorAll('.gantt-bar')].map(b => [parseFloat(b.style.left), parseFloat(b.style.width)])).toEqual([[0, 25], [50, 50]])
    expect(d.querySelector('.gantt-axis').textContent).toContain('18:00')
    expect(d.querySelector('.gantt-axis').textContent).toContain('22:00')
    expect(d.querySelector('.gantt-note').textContent).toContain('4 小时')
  })
  it('keeps midnight, original offsets and full details in click and keyboard readouts', () => {
    const items = [{ label: '晚场', start: '2026-10-19T21:00+08:00', end: '2026-10-19T23:00+08:00' }, { label: '跨夜场', start: '2026-10-19T23:00+08:00', end: '2026-10-20T01:00+08:00', owner: '执行组', detail: '完整换场、设备和撤场要求', progress: 25 }]
    const d = doc(input(items)), tasks = [...d.querySelectorAll('.gantt-task')]
    expect([...d.querySelectorAll('.gantt-bar')].map(b => parseFloat(b.style.width))).toEqual([50, 50])
    tasks[1].click()
    expect(d.querySelector('.gantt-readout').textContent).toContain('2026-10-19T23:00+08:00 至 2026-10-20T01:00+08:00')
    expect(d.querySelector('.gantt-readout').textContent).toContain(items[1].detail)
    tasks[1].dispatchEvent(new d.defaultView.KeyboardEvent('keydown', { key: 'Home' }))
    expect(tasks[0].getAttribute('aria-pressed')).toBe('true')
    tasks[0].dispatchEvent(new d.defaultView.KeyboardEvent('keydown', { key: 'End' }))
    expect(tasks[1].getAttribute('aria-pressed')).toBe('true')
    expect(d.querySelector('.gantt-axis').textContent).toContain('01:00')
  })
  it('preserves all 26 observed rows and allows up to 120 complete schedule rows without truncation', () => {
    for (const count of [26, 120]) {
      const spec = input(Array.from({ length: count }, (_, i) => ({ label: '节目' + i, start: '2026-10-19', end: '2026-10-19', detail: '设备与到场条件' + i })))
      const prepared = prepareSimulatedArtifact({ title: spec.title, type: 'gantt', artifact: spec })
      const rendered = JSON.parse(acceptArtifactOutput(JSON.stringify(prepared)))
      expect(readTemplateModel(rendered).data.items).toEqual(spec.items)
      const d = doc(prepared)
      expect(d.querySelectorAll('.gantt-task')).toHaveLength(count)
      d.querySelectorAll('.gantt-task')[count - 1].click()
      expect(d.querySelector('.gantt-readout').textContent).toContain('设备与到场条件' + (count - 1))
    }
    expect(renderGanttArtifact(input(Array.from({ length: 121 }, () => ({ label: '超限', start: '2026-10-19', end: '2026-10-19' }))))).toBeNull()
  })
  it.each([
    ['2026-02-30T18:00', '2026-03-01T19:00'], ['2026-10-19T24:00', '2026-10-20T01:00'],
    ['2026-10-19T18:60', '2026-10-19T19:00'], ['2026-10-19T18:00+14:30', '2026-10-19T19:00+14:30'],
    ['2026-10-19T21:00', '2026-10-19T20:00'], ['2026-10-19T23:00+08:00', '2026-10-19T01:00+08:00'],
    ['2026-10-19T18:00', '2026-10-19'], ['2026-10-19T18:00+08:00', '2026-10-19T19:00']
  ])('rejects illegal or ambiguous time range %s → %s without repairing dates', (start, end) => {
    expect(renderGanttArtifact(input([{ label: '不可猜造', start, end }]))).toBeNull()
  })
})
