import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { validateWorkbench, layoutWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js';
import { renderMarketArtifact } from '../packages/dsh-research-task-runtime/market-artifact.js';
import { renderInteractiveArtifact } from '../packages/dsh-research-task-runtime/interactive-artifact.js';

const fixtures = JSON.parse(readFileSync(new URL('../test/fixtures/research-workbench-parity-mock.json', import.meta.url), 'utf8'));
const request = {
  requestId: 'parity-benchmark', title: '跨场景模拟工作台', dataMode: 'simulated',
  panels: fixtures.map(({ id, artifact }) => ({
    title: artifact.title, type: artifact.type, size: 'small', artifact,
    prompt: `用模拟数据展示 ${id}${artifact.type === 'market' ? `；variant: ${artifact.variant}` : ''}`
  }))
};

function renderBatch() {
  const panels = layoutWorkbench(validateWorkbench(request).panels);
  const rendered = panels.map(panel => panel.type === 'market'
    ? renderMarketArtifact(panel.artifact) : renderInteractiveArtifact(panel.artifact));
  if (rendered.length !== fixtures.length || rendered.some(result => !result?.html)) {
    throw Error('One or more mock panels did not render.');
  }
  return { count: rendered.length, htmlBytes: rendered.reduce((sum, result) => sum + Buffer.byteLength(result.html, 'utf8'), 0) };
}

for (let i = 0; i < 5; i++) renderBatch();
const iterations = 100;
const started = performance.now();
let output;
for (let i = 0; i < iterations; i++) output = renderBatch();
const totalMs = performance.now() - started;
console.log(JSON.stringify({ ...output, iterations, totalMs: Number(totalMs.toFixed(1)), perBatchMs: Number((totalMs / iterations).toFixed(2)) }));
