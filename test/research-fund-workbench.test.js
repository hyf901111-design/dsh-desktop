import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { validateWorkbench, layoutWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js';
import { renderMarketArtifact } from '../packages/dsh-research-task-runtime/market-artifact.js';
import { researchMarketDimensions, researchBentoLayout } from '../packages/dsh-research-task-runtime/bento-layout.js';
import { parseResearchMarketNativeTable } from '../scripts/lib/research-market-native-table.mjs';

const panel = (title, artifact) => ({ title, type: 'market', prompt: title, size: 'large', artifact });
const input = () => ({ requestId: 'fund-source-parity', title: '基金持仓穿透工作台', dataMode: 'simulated', panels: [
  panel('【模拟】组合风险与持仓概览', { variant: 'metrics', asOf: '模拟数据 · 2026-02-06 15:00', items: [
    { label: '穿透基金', value: '8只', detail: '权益核心组' },
    { label: '穿透覆盖率', value: '92.6%', detail: '其余暂未披露' },
    { label: '底层证券', value: '186', detail: '按证券代码合并' },
    { label: '前十大集中度', value: '38.4%', detail: '已披露权益持仓' }
  ] }),
  panel('【模拟】基金穿透持仓明细', { variant: 'table', asOf: '模拟数据 · 2026-02-06 15:00',
    columns: ['证券 / 模拟简称', '穿透权重', '持有基金', '较上期', '拥挤度'],
    rows: [['华芯科技 S001','6.42%','6 / 8','+0.82%','偏高'],['恒康医药 S003','4.86%','5 / 8','-0.24%','中等']] }),
  panel('【模拟】行业暴露与主动偏离', { variant: 'metrics', asOf: '模拟数据 · 2026-02-06 15:00', items: [
    { label: '电子', value: '+8.2%', detail: '组合权重 24.6% / 基准 16.4% / 偏离 +8.2%' },
    { label: '医药生物', value: '+2.1%', detail: '组合权重 18.8% / 基准 16.7% / 偏离 +2.1%' }
  ] })
] });

describe('Fund72 source-contracted workbench', () => {
  it('normalizes a real planner-shaped batch without a second model call', () => {
    const planned = layoutWorkbench(validateWorkbench(input()).panels);
    expect(planned.map(item => item.artifact.variant)).toEqual(['fund-kpi','fund-holdings','fund-industry']);
    expect(planned.map(item => [item.width,item.height,item.x,item.y])).toEqual([
      [896,132,0,0], [556,400,0,148], [328,400,572,148]
    ]);
    for (const item of planned) {
      const rendered = renderMarketArtifact(item.artifact);
      expect(rendered?.html).toContain('data-sherlock-design="21m-20260923-v1"');
      expect(researchMarketDimensions({ containerSpec: rendered })).toEqual({width:item.width,height:item.height});
    }
  });

  it('retains source structure, sharp native table text, and meaningful controls', () => {
    const planned = layoutWorkbench(validateWorkbench(input()).panels);
    const [kpi, holdings, industry] = planned.map(item => {
      const doc = new Window().document;
      doc.write(renderMarketArtifact(item.artifact).html);
      return doc;
    });
    expect(kpi.querySelectorAll('.fund-kpi')).toHaveLength(4);
    expect(kpi.querySelector('.fund-kpis').getAttribute('style')).toContain('--fund-count:4');
    expect(holdings.querySelector('.fund-search')).not.toBeNull();
    expect(holdings.querySelectorAll('thead button')).toHaveLength(5);
    expect(parseResearchMarketNativeTable(renderMarketArtifact(planned[1].artifact).html, new Window().document)).toMatchObject({
      variant:'fund-holdings', columns:planned[1].artifact.columns
    });
    expect(industry.querySelectorAll('.fund-industry')).toHaveLength(2);
    expect(industry.querySelector('.fund-callout').textContent).toContain('电子超配 +8.2%');
    expect(industry.querySelector('.fund-bar').getAttribute('style')).toContain('width:83.0%');
    const nodes = planned.map((item, index) => ({
      id:String(index), kind:'generated-container', sizeMode:'auto', generationStatus:'completed',
      containerSpec:renderMarketArtifact(item.artifact)
    }));
    const packed = researchBentoLayout(nodes, {width:1024,height:768});
    expect(packed.nodes.map(node => [node.width,node.height])).toEqual([[896,132],[556,400],[328,400]]);
  });

  it('rejects industry cards without comparable weights', () => {
    const bad = input();
    bad.panels[2].artifact.items[0].detail = '仅有 +8.2% 偏离';
    expect(() => validateWorkbench(bad)).toThrow('组合权重或基准权重');
  });
});
