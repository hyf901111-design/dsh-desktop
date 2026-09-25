import { describe, expect, it } from 'vitest';
import { renderMarketArtifact } from '../packages/dsh-research-task-runtime/market-artifact.js';
import { renderInteractiveArtifact } from '../packages/dsh-research-task-runtime/interactive-artifact.js';
import { researchBentoLayout, researchMarketDimensions } from '../packages/dsh-research-task-runtime/bento-layout.js';
import { layoutWorkbench, validateWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js';

const base = { version: 1, type: 'market', asOf: '模拟数据 · 2026-02-06' };
const artifact = (variant, data) => ({ ...base, variant, title: `${variant}（模拟）`, ...data });
const node = (id, spec) => ({ id, kind: 'generated-container', generationStatus: 'completed', sizeMode: 'auto', containerSpec: spec });
const medical = [
  artifact('metrics', { items: Array.from({ length: 6 }, (_, i) => ({ label: `指标${i}`, value: String(i) })) }),
  artifact('trend', { labels: ['02-01', '02-02'], series: [{ name: '医药', values: [100, 102] }] }),
  artifact('scatter', { xLabel: 'PE 2027E', yLabel: 'EPS CAGR', items: [{ label: 'A1', x: 10, y: 30, size: 1 }, { label: 'B2', x: 28, y: 52, size: 2 }] }),
  artifact('table', { columns: ['证券', '代码', '最新', '涨跌', 'PE', 'EPS'], rows: Array.from({ length: 7 }, (_, i) => [`公司${i}`, '600276.SH', '52.86', '+2.16', '42.6', '1.24']) }),
  artifact('pipeline', { stages: ['I', 'II', 'III', 'NDA'], items: [{ name: 'HR-01', target: 'ADC', stage: 2, nextDate: '09.25' }, { name: 'BG-06', target: 'BCL-2', stage: 1, nextDate: '11.18' }] }),
  artifact('events', { items: [{ date: '02-10 09:00', object: '创新药', event: '学术会议', focus: '临床数据', window: '1–3D', status: '重点' }, { date: '02-18 14:00', object: '器械', event: '经营交流', focus: '国内设备更新', window: '1W', status: '待跟进' }] })
];

describe('21H medical source composition', () => {
  it('renders the side plot, pipeline and event strip as host-owned text and vector cards', () => {
    const [scatter, pipeline, events] = [medical[2], medical[4], medical[5]].map(renderMarketArtifact);
    expect(scatter?.html).toContain('role="img"');
    expect(scatter?.html).toContain('A1');
    expect(scatter?.html).toContain('sample-legend');
    expect(pipeline?.html).toContain('HR-01');
    expect(pipeline?.html).toContain('NDA');
    expect(events?.html).toContain('临床数据');
    expect(events?.html).toContain('待跟进');
    expect(renderMarketArtifact({ ...medical[2], items: [{ label: 'bad', x: NaN, y: 20 }] })).toBeNull();
    expect(renderMarketArtifact({ ...medical[4], items: [{ name: 'bad', target: 'ADC', stage: 5, nextDate: '09.25' }] })).toBeNull();
  });

  it('keeps a six-column source table at 536 pixels with scrollable text', () => {
    const spec = renderMarketArtifact(medical[3]);
    expect(researchMarketDimensions({ containerSpec: spec })).toEqual({ width: 536, height: 258 });
    expect(spec.html).toContain('market-table-wrap');
    expect(spec.html).toContain('<td');
  });

  it('packs six completed cards into the Figma 896-pixel reading order', () => {
    const nodes = medical.map((entry, i) => node(String(i), renderMarketArtifact(entry)));
    const result = researchBentoLayout(nodes, { width: 940, height: 840 });
    expect(result.nodes.map(n => [n.x, n.y, n.width, n.height])).toEqual([
      [0, 0, 896, 144], [0, 156, 536, 264], [548, 156, 348, 264],
      [0, 432, 536, 258], [548, 432, 348, 258], [0, 702, 896, 110]
    ]);
    expect(result.viewport.scale).toBeGreaterThan(.9);
  });

  it('preserves the source calendar geometry after HTML rendering and canvas arrange', () => {
    const calendar = renderInteractiveArtifact({ version: 1, type: 'calendar', title: '研究日历（模拟）', items: [{ title: '会议', summary: '模拟研究', date: '2026-02-10' }] });
    expect(researchMarketDimensions(node('calendar', calendar))).toEqual({ width: 536, height: 316 });
    expect(researchMarketDimensions(node('legacy-calendar', { ...calendar, html: calendar.html.replace('data-research-kind="calendar" ', '') }))).toEqual({ width: 536, height: 316 });
  });

  it('keeps long pipeline and event descriptions readable in their source cards', () => {
    const pipeline = renderMarketArtifact({ ...medical[4], items: [{ name: 'HR-1701', target: 'PD-1/VEGF 双抗', stage: 2, nextDate: '2026-03-15' }] });
    const events = renderMarketArtifact({ ...medical[5], items: [{ date: '2026-03-15', object: 'HR-1701 双抗', event: 'III 期临床数据读出', focus: '重点关注 PFS 和 OS 是否达到统计学显著性', window: '2026-03-15 至 2026-03-20', status: '待公布' }] });
    expect(pipeline.html).toContain('pipeline-primary');
    expect(pipeline.html).toContain('PD-1/VEGF 双抗');
    expect(pipeline.html).toContain('2026-03-15');
    expect(events.html).toContain('重点关注 PFS 和 OS 是否达到统计学显著性');
    expect(events.html).toContain('white-space:normal;overflow-wrap:anywhere');
  });

  it('grows only the source side card whose legend or pipeline needs more rows', () => {
    const scatter = artifact('scatter', { xLabel: 'PE', yLabel: 'CAGR', items: Array.from({ length: 12 }, (_, i) => ({ label: `完整样本${i}`, x: i + 1, y: i + 2 })) });
    const pipeline = artifact('pipeline', { stages: ['I', 'II', 'III', 'NDA'], items: Array.from({ length: 8 }, (_, i) => ({ name: `药物${i}`, target: '长靶点名称', stage: 2, nextDate: '2026-03-15' })) });
    expect(researchMarketDimensions(node('scatter', renderMarketArtifact(scatter)))).toEqual({ width: 348, height: 288 });
    expect(researchMarketDimensions(node('pipeline', renderMarketArtifact(pipeline)))).toEqual({ width: 348, height: 316 });
  });

  it('prepares six simulated variants and plans paired positions', () => {
    const prepared = validateWorkbench({ requestId: 'medical-six', title: '医药行业工作台', dataMode: 'simulated', panels: medical.map(entry => ({ title: entry.title, prompt: `variant: ${entry.variant}`, type: 'market', size: 'large', artifact: entry })) });
    const plan = layoutWorkbench(prepared.panels);
    expect(plan.map(p => [p.x, p.y, p.width, p.height])).toEqual([
      [0, 0, 896, 144], [0, 160, 536, 264], [552, 160, 348, 264],
      [0, 440, 536, 258], [552, 440, 348, 258], [0, 714, 896, 110]
    ]);
  });

  it('infers the three medical source variants from simulated data when the model omits their names', () => {
    const panels = [medical[2], medical[4], medical[5]].map(entry => {
      const { variant, ...artifact } = entry;
      return { title: entry.title, prompt: '使用已提供的医药源稿数据', type: 'market', size: 'large', artifact };
    });
    const prepared = validateWorkbench({ requestId: 'medical-infer', title: '医药工作台', dataMode: 'simulated', panels });
    expect(prepared.panels.map(panel => panel.artifact.variant)).toEqual(['scatter', 'pipeline', 'events']);
  });

  it('builds the complete six-card medical demo from a short host preset call', () => {
    const prepared = validateWorkbench({ requestId: 'medical-preset', title: '医药行业研究工作台', dataMode: 'simulated', preset: 'medical-21h' });
    expect(prepared.panels.map(panel => panel.artifact.variant)).toEqual(['metrics', 'trend', 'scatter', 'table', 'pipeline', 'events']);
    expect(layoutWorkbench(prepared.panels).map(panel => [panel.width, panel.height])).toEqual([
      [896, 144], [536, 264], [348, 264], [536, 258], [348, 258], [896, 110]
    ]);
    for (const panel of prepared.panels) {
      expect(panel.artifact.asOf).toContain('模拟');
      expect(renderMarketArtifact(panel.artifact)?.html).toContain('data-sherlock-market');
    }
    expect(() => validateWorkbench({ requestId: 'mixed', title: '医药', dataMode: 'simulated', preset: 'medical-21h', panels: [] })).toThrow(/不能混用/);
  });

  it('normalizes common simulated side-card field names without changing values', () => {
    const samples = [
      { title: '散点', artifact: { asOf: '2026-06-30 模拟', xLabel: '估值', yLabel: '增长', items: [{ name: '样本甲', x: '22.5', y: '18' }] } },
      { title: '管线', artifact: { asOf: '2026-06-30 模拟', phases: ['I 期', 'II 期'], items: [{ project: '项目甲', targetName: 'HER2', phase: 'II期', date: '2026-07-15' }] } },
      { title: '事件', artifact: { asOf: '2026-06-30 模拟', items: [{ date: '07-15', subject: '项目甲', event: '数据读出', observation_focus: '主要终点', impact_window: '一周', state: '待公布' }] } }
    ];
    const prepared = validateWorkbench({ requestId: 'aliases', title: '医药行业模拟', dataMode: 'simulated', panels: samples.map(({title, artifact}) => ({ title, prompt: '使用已有模拟数据', type: 'market', size: 'large', artifact })) });
    expect(prepared.panels.map(panel => panel.artifact.variant)).toEqual(['scatter', 'pipeline', 'events']);
    expect(prepared.panels[0].artifact.items[0]).toMatchObject({ label: '样本甲', x: 22.5, y: 18 });
    expect(prepared.panels[1].artifact.items[0]).toMatchObject({ name: '项目甲', target: 'HER2', stage: 2, nextDate: '2026-07-15' });
    expect(prepared.panels[2].artifact.items[0]).toMatchObject({ object: '项目甲', focus: '主要终点', window: '一周', status: '待公布' });
  });
});
