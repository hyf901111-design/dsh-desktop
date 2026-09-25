import { describe, expect, it } from 'vitest';
import { validateWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js';
import { acceptArtifactOutput } from '../packages/dsh-research-task-runtime/artifact-output.js';
import { generateSimulatedPanel } from '../packages/dsh-research-task-runtime/simulated-workbench-generator.js';

const panel = (title, type, artifact) => ({ title, type, size: 'large', prompt: `展示${title}的模拟数据`, artifact });
const plan = (first, second) => ({
  requestId: 'medical-mock-20260206', title: '医药行业观察工作台（模拟）', dataMode: 'simulated',
  panels: [first, second]
});
const metric = panel('医药行业核心指标（模拟）', 'market', {
  asOf: '2026-02-06 15:00', variant: 'metrics', items: [{ label: '医药指数', value: '8246.31' }]
});

describe('真实客户端模拟工作台输入修复', () => {
  it('批量准备量价和盘口固定模板，不在规划后因模拟样本缺失而失败', () => {
    const price = generateSimulatedPanel({ title: '贵州茅台量价联动', prompt: 'variant: price-volume；模拟价格与成交量', type: 'market', size: 'large' }, '证券量价与盘口工作台');
    const book = generateSimulatedPanel({ title: '贵州茅台买卖盘口', prompt: '同时生成 market.price-volume 与 market.order-book；模拟买卖十档', type: 'market', size: 'large' }, '证券量价与盘口工作台');
    expect(price.artifact.labels).toHaveLength(65);
    expect(book.artifact.bids).toHaveLength(10);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(price.artifact))).html).toContain('data-sherlock-market="price-volume"');
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(book.artifact))).html).toContain('data-sherlock-market="order-book"');
    const prepared = validateWorkbench({ requestId: 'market-two-new', title: '证券量价与盘口工作台', dataMode: 'simulated', panels: [price, book] });
    expect(prepared.panels.map(item => item.artifact.variant)).toEqual(['price-volume', 'order-book']);
  });
  it('为资金流向模板准备可按时段与行业筛选的本地模拟样本', () => {
    const flow = generateSimulatedPanel({ title: '行业资金流向', prompt: 'variant: fund-flow', type: 'market', size: 'large' }, '行业观察工作台');
    expect(flow.artifact.records).toHaveLength(10);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(flow.artifact))).html).toContain('data-flow-industry');
  });
  it('为估值分位带准备完整时点与单调分位阈值', () => {
    const valuation = generateSimulatedPanel({ title: '估值分位带', prompt: 'variant: valuation-band', type: 'market', size: 'large' }, '白酒行业观察工作台');
    expect(valuation.artifact.values).toHaveLength(65);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(valuation.artifact))).html).toContain('valuation-band-middle');
  });
  it('为基金净值回撤模板准备同长净值与基准序列', () => {
    const panel = generateSimulatedPanel({ title: '基金净值与回撤', prompt: 'variant: equity-drawdown', type: 'market', size: 'large' }, '基金组合观察工作台');
    expect(panel.artifact.equity).toHaveLength(65);
    expect(panel.artifact.benchmark).toHaveLength(65);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(panel.artifact))).html).toContain('drawdown-controls');
  });
  it('为配置占比模板准备合计为100的本地模拟样本', () => {
    const panel = generateSimulatedPanel({ title: '资产配置占比', prompt: 'variant: allocation-donut', type: 'market', size: 'large' }, '基金组合观察工作台');
    expect(panel.artifact.items.reduce((sum, item) => sum + item.value, 0)).toBe(100);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(panel.artifact))).html).toContain('allocation-legend');
  });
  it('为增减瀑布模板准备可推导期末余额的本地模拟样本', () => {
    const panel = generateSimulatedPanel({ title: '利润增减瀑布图', prompt: 'variant: waterfall', type: 'market', size: 'large' }, '经营观察工作台');
    expect(panel.artifact.changes.reduce((sum, item) => sum + item.value, panel.artifact.start)).toBe(116);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(panel.artifact))).html).toContain('waterfall-readout');
  });
  it('将仅多包一层的表格单元格展开为完整列，保留原始文字', () => {
    const table = panel('重点覆盖估值与盈利预期（模拟）', 'market', {
      asOf: '2026-02-06 15:00', columns: ['公司', '代码', '收盘', '涨跌', 'PE', 'EPS'],
      rows: [
        ['恒瑞医药', '600276.SH', '46.85', '+1.24', '32.15', '1.46'],
        [['药明康德', '603259.SH'], '58.32', '-0.86', '27.43', '2.13']
      ]
    });
    const artifact = validateWorkbench(plan(metric, table)).panels[1].artifact;
    expect(artifact.rows[1]).toEqual(['药明康德', '603259.SH', '58.32', '-0.86', '27.43', '2.13']);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(artifact))).html).toContain('药明康德');
  });

  it('对演示趋势中仅短一个的序列等距补点并标明补点，保持首尾数值', () => {
    const trend = panel('行业表现与相对收益（模拟）', 'market', {
      asOf: '2026-02-06 15:00', variant: 'trend',
      labels: Array.from({ length: 12 }, (_, i) => `第${i + 1}日`),
      series: [{ name: '医药生物', values: Array.from({ length: 12 }, (_, i) => 100 + i) },
        { name: '创新药', values: Array.from({ length: 11 }, (_, i) => 100 + i * 2) }]
    });
    const artifact = validateWorkbench(plan(metric, trend)).panels[1].artifact;
    expect(artifact.series[1].values).toHaveLength(12);
    expect(artifact.series[1].values[0]).toBe(100);
    expect(artifact.series[1].values[1]).toBeCloseTo(101.81818, 4);
    expect(artifact.series[1].values.at(-1)).toBe(120);
    expect(artifact.note).toContain('创新药');
    expect(artifact.note).toContain('线性插值');
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(artifact))).html).toContain('完整趋势数据');
  });

  it('将事件对象和观察重点整理为日历摘要，拆出日期中的时间', () => {
    const calendar = panel('催化日历与研究跟进（模拟）', 'calendar', {
      items: [{ title: 'III 期数据读出', date: '2026-02-10 09:00', object: '恒瑞医药',
        observation_focus: 'PFS/OS 与安全性', impact_window: '1–2 周', status: '待发布', category: '临床数据' }]
    });
    const artifact = validateWorkbench(plan(metric, calendar)).panels[1].artifact;
    expect(artifact.items[0].date).toBe('2026-02-10');
    expect(artifact.items[0].time).toBe('09:00');
    expect(artifact.items[0].summary).toContain('恒瑞医药');
    expect(artifact.items[0].summary).toContain('PFS/OS 与安全性');
    expect(artifact.items[0].summary).toContain('1–2 周');
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(artifact))).html).toContain('09:00');
  });

  it('无法安全补点时指出具体序列及横轴长度，供模型定点修正', () => {
    const trend = panel('行业表现与相对收益（模拟）', 'market', {
      asOf: '2026-02-06 15:00', variant: 'trend',
      labels: Array.from({ length: 12 }, (_, i) => `第${i + 1}日`),
      series: [{ name: '创新药', values: [100, 105, 110] }]
    });
    expect(() => validateWorkbench(plan(metric, trend))).toThrow(/创新药.*3.*12/);
  });

  it('无法确定如何拆分的表格行指出行列数量，不猜测单元格', () => {
    const table = panel('重点覆盖估值与盈利预期（模拟）', 'market', {
      asOf: '2026-02-06 15:00', columns: ['公司', '代码', '收盘'],
      rows: [['恒瑞医药', '600276.SH', '46.85'], ['药明康德', '603259.SH']]
    });
    expect(() => validateWorkbench(plan(metric, table))).toThrow(/第2行.*2.*3/);
  });
});
