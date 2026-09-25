import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { acceptArtifactOutput } from '../packages/dsh-research-task-runtime/artifact-output.js';
import { layoutWorkbench, validateWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/research-workbench-parity-mock.json', import.meta.url), 'utf8'));
const expectedSizes = [
  [896, 144], [536, 258], [536, 264], [536, 264], [434, 258],
  [896, 220], [656, 456], [656, 456], [536, 316], [656, 280]
];

describe('ten simulated workbench scenarios', () => {
  it('prepares every type in one batch and renders all supplied data with host templates', () => {
    const input = validateWorkbench({
      requestId: 'figma-multi-scenario', title: '跨场景模拟工作台', dataMode: 'simulated',
      panels: fixtures.map(({ id, artifact }) => ({
        title: artifact.title, type: artifact.type, size: 'small',
        prompt: `用模拟数据展示 ${id}${artifact.type === 'market' ? `；variant: ${artifact.variant}` : ''}`,
        artifact
      }))
    });
    const panels = layoutWorkbench(input.panels);
    expect(panels.map(panel => [panel.width, panel.height])).toEqual(expectedSizes);
    for (const [index, panel] of panels.entries()) {
      const output = acceptArtifactOutput(JSON.stringify(panel.artifact));
      expect(output, fixtures[index].id).toBeDefined();
      const rendered = JSON.parse(output);
      expect(rendered.type).toBe('html');
      expect(rendered.html).toContain('模拟');
      if (panel.type === 'market') {
        expect(rendered.html).toContain(`data-sherlock-market="${panel.artifact.variant}"`);
        if (panel.artifact.variant === 'candlestick') {
          expect(rendered.html).toContain('完整行情数据');
          expect(rendered.html).toContain(panel.artifact.candles.at(-1).date);
        }
      } else if (panel.type === 'calendar') {
        expect(rendered.html).toContain('grid-template-columns:minmax(0,1fr) 180px');
        expect(rendered.html).toContain('按日期筛选');
      } else {
        expect(rendered.html).toContain(panel.artifact.items[0].label ?? panel.artifact.items[0].title);
      }
    }
  });
});
