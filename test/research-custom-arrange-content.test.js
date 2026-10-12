import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { measureWorkbenchContents } from '../scripts/lib/research-grid-ui.mjs';
import { researchCandleTemplate } from '../packages/dsh-research-task-runtime/bento-layout.js';

const html = '<body><ol><li>原始审批时间轴</li></ol></body>';
const node = { id: 'offscreen-timeline', kind: 'generated-container', width: 640, height: 880,
  containerSpec: { type: 'html', html } };
function measure(input = node, cached) {
  return runInNewContext('(' + measureWorkbenchContents.toString().replace(/__vite_ssr_import_\d+__\.researchCandleTemplate/g,'researchCandleTemplate') + ')(root,[node])', {
    root: { __eworkContentMeasurements: new Map(cached ? [[input.id, cached]] : []), querySelector: () => null },
    node: input, CSS: { escape: value => value },
    researchCandleTemplate,
    researchOptimalDimensions: () => ({ width: 640, height: 260 }),
    workbenchMeasuredDimensions: (item, value) => ({ width: 640, height: value.height + 58 })
  }).get(input.id);
}

describe('Arrange preserves unmounted custom HTML reading space', () => {
  it('keeps the existing timeline height until an offscreen frame can measure its content', () => {
    expect(measure()).toEqual({ width: 640, height: 880 });
  });
  it('uses the readable default when the unmeasured frame was manually made too short', () => {
    expect(measure({ ...node, height: 180 })).toEqual({ width: 640, height: 260 });
  });
  it('replaces the fallback with current intrinsic measurement when it is available', () => {
    expect(measure(node, { html, width: 640, height: 500 })).toEqual({ width: 640, height: 558 });
  });
  it('does not reuse measurements belonging to a previous HTML document', () => {
    expect(measure(node, { html: '<body>旧内容</body>', width: 640, height: 90 })).toEqual({ width: 640, height: 880 });
  });
  it('keeps native market templates on their existing template sizing path', () => {
    expect(measure({ ...node, containerSpec: { type: 'html', html: '<body data-sherlock-market="metrics"></body>' } })).toBeUndefined();
  });
});
