import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { acceptArtifactOutput } from '../packages/dsh-research-task-runtime/artifact-output.js';
import { layoutWorkbench, validateWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js';
import { renderGanttArtifact } from '../packages/dsh-research-task-runtime/gantt-artifact.js';
import { researchBentoLayout } from '../packages/dsh-research-task-runtime/bento-layout.js';

const prepared = (preset) => {
  const plan = validateWorkbench({requestId:`verify-${preset}`,title:`${preset} 验证`,dataMode:'simulated',preset});
  return layoutWorkbench(plan.panels);
};

describe('complete simulated workbenches', () => {
  it('prepares a financial board with true candles and heatmap alongside the other market cards', () => {
    const panels = prepared('market-overview-21h');
    expect(panels.map(p => p.artifact.variant)).toEqual(['metrics','candlestick','heatmap','breadth','table','trend']);
    expect(panels.every(p => p.width >= 320 && p.height >= 110)).toBe(true);
    for (const panel of panels) {
      const output = JSON.parse(acceptArtifactOutput(JSON.stringify(panel.artifact)));
      expect(output.type).toBe('html');
      expect(output.html).toContain('data-sherlock-design="21m-20260923-v1"');
      expect(output.html).toContain('模拟');
    }
    const candles = panels[1].artifact.candles;
    expect(candles.length).toBeGreaterThanOrEqual(8);
    expect(candles.every(c => c.low <= Math.min(c.open,c.close) && c.high >= Math.max(c.open,c.close) && c.volume >= 0)).toBe(true);
  });

  it('prepares an operations board with bar chart, dated Gantt, reports and news', () => {
    const panels = prepared('research-operations-21m');
    expect(panels.map(p => p.type)).toEqual(['dashboard','chart','gantt','reports','news','calendar']);
    expect(panels[1].artifact.variant).toBe('bar');
    for (const panel of panels) expect(acceptArtifactOutput(JSON.stringify(panel.artifact)),panel.title).toBeDefined();
    const gantt = JSON.parse(acceptArtifactOutput(JSON.stringify(panels[2].artifact)));
    expect(gantt.type).toBe('html');
    expect(gantt.html).toContain('data-research-kind="gantt"');
    expect(gantt.html).toContain('研究计划');
    expect(gantt.html).toContain('2026-07-');
    expect(gantt.html).toContain('class="gantt-bar"');
    expect(panels[3].artifact.items.length).toBeGreaterThanOrEqual(5);
    expect(panels[4].artifact.items.length).toBeGreaterThanOrEqual(5);
  });

  it('keeps dashboard and Gantt content heights after the completed board is arranged', () => {
    const panels = prepared('research-operations-21m');
    const nodes = panels.map((panel,index) => ({...panel,id:`ops-${index}`,kind:'generated-container',
      sizeMode:'auto',containerSizePreset:panel.size,containerSpec:JSON.parse(acceptArtifactOutput(JSON.stringify(panel.artifact)))}));
    const arranged = researchBentoLayout(nodes,{width:1088,availableWidth:1088,height:850});
    expect(panels[0].height).toBe(280);
    expect(panels[2].height).toBe(320);
    expect(arranged.nodes[0].height).toBe(280);
    expect(arranged.nodes[2].height).toBe(320);
    expect(arranged.nodes[5].height).toBe(316);
    expect(arranged.viewport.scale).toBeGreaterThanOrEqual(.68);
    expect(arranged.viewport.y).toBe(32);
    expect((arranged.nodes[3].y+arranged.nodes[3].height)*arranged.viewport.scale+arranged.viewport.y).toBeGreaterThan(850);
  });

  it('rejects invalid Gantt dates and escapes user supplied labels', () => {
    const input = {version:1,type:'gantt',title:'模拟排期',asOf:'模拟数据',items:[
      {label:'<script>alert(1)</script>',start:'2026-07-01',end:'2026-07-03',progress:25}
    ]};
    const html = renderGanttArtifact(input).html;
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(renderGanttArtifact({...input,items:[{...input.items[0],start:'2026-02-30'}]})).toBeNull();
    expect(renderGanttArtifact({...input,items:[{...input.items[0],end:'2026-06-30'}]})).toBeNull();
  });

  it('lets readers select Gantt tasks and inspect dates, owner, and progress', () => {
    const doc = new Window().document;
    doc.write(renderGanttArtifact({version:1,type:'gantt',title:'模拟计划',asOf:'模拟数据',items:[
      {label:'资料梳理',owner:'行业组',start:'2026-07-01',end:'2026-07-10',progress:75},
      {label:'报告复核',owner:'复核组',start:'2026-07-11',end:'2026-07-20',progress:30}
    ]}).html);
    doc.defaultView.eval(doc.querySelector('script').textContent);
    const tasks = [...doc.querySelectorAll('.gantt-task')];
    expect(tasks).toHaveLength(2);
    expect(doc.querySelector('.gantt-readout').textContent).toBe('资料梳理 · 2026-07-01 至 2026-07-10 · 完成 75% · 负责人 行业组');
    tasks[0].dispatchEvent(new doc.defaultView.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
    expect(tasks[1].getAttribute('aria-pressed')).toBe('true');
    expect(doc.querySelector('.gantt-readout').textContent).toBe('报告复核 · 2026-07-11 至 2026-07-20 · 完成 30% · 负责人 复核组');
  });
});
