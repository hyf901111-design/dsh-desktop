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

  it('expands long fund indicator definitions without truncating their source text', () => {
    const detail = '组合权重 24.6% / 基准 16.4% / 偏离 +8.2%，按已披露权益持仓统计';
    const doc = new Window().document;
    doc.write(renderMarketArtifact({version:1,type:'market',variant:'fund-kpi',title:'组合概览',asOf:'2026-02-06',items:[
      {label:'行业偏离',value:'+8.2%',detail},
      {label:'覆盖率',value:'92.6%',detail:'已披露持仓'}
    ]}).html);
    const disclosure = doc.querySelector('.fund-detail-disclosure');
    expect(disclosure.querySelector('p').textContent).toBe(detail);
    expect(disclosure.open).toBe(false);
    disclosure.querySelector('summary').click();
    expect(disclosure.open).toBe(true);
    expect(doc.querySelectorAll('.fund-kpi')[1].querySelector('details')).toBeNull();
  });

  it('rejects industry cards without comparable weights', () => {
    const bad = input();
    bad.panels[2].artifact.items[0].detail = '仅有 +8.2% 偏离';
    expect(() => validateWorkbench(bad)).toThrow('组合权重或基准权重');
  });

  it('filters and sorts industry exposure and updates the comparison readout', () => {
    const artifact = { version:1, type:'market', variant:'fund-industry', title:'行业配置', asOf:'模拟数据 · 2026-02-06', items:[
      {label:'医药',weight:18.8,benchmark:16.7},
      {label:'电子',weight:24.6,benchmark:16.4},
      {label:'银行',weight:12.1,benchmark:14.5}
    ] };
    const doc = new Window().document;
    doc.write(renderMarketArtifact(artifact).html);
    doc.defaultView.eval(doc.querySelector('script').textContent);
    const rows = [...doc.querySelectorAll('.fund-industry')];
    expect(rows).toHaveLength(3);
    expect(rows.every(row => row.tagName === 'BUTTON')).toBe(true);
    expect(doc.querySelector('.fund-industry-count').textContent).toBe('3 / 3 个行业');
    const filter = doc.querySelector('.fund-industry-filter');
    filter.value = 'under';
    filter.dispatchEvent(new doc.defaultView.Event('change'));
    expect(doc.querySelector('.fund-industry-count').textContent).toBe('1 / 3 个行业');
    expect(doc.querySelector('.fund-industry-readout').textContent).toContain('银行 · 组合 12.1% · 基准 14.5% · 低配 2.4 个百分点');
    expect(doc.querySelector('.fund-callout strong').textContent).toBe('银行低配 2.4%');
    filter.value = 'all';
    filter.dispatchEvent(new doc.defaultView.Event('change'));
    const sort = doc.querySelector('.fund-industry-sort');
    sort.value = 'name';
    sort.dispatchEvent(new doc.defaultView.Event('change'));
    expect([...doc.querySelectorAll('.fund-industry')].map(row => row.dataset.label)).toEqual(['电子','医药','银行']);
    const medical = rows.find(row => row.dataset.label === '医药');
    medical.click();
    expect(medical.getAttribute('aria-pressed')).toBe('true');
    expect(doc.querySelector('.fund-industry-readout').textContent).toContain('医药 · 组合 18.8%');
  });
});
