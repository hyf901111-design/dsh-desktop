import { expect, it, vi } from 'vitest';
import { buildResearchTaskPrompt, ResearchTaskRuntime } from '../packages/dsh-research-task-runtime/index.js';
import { renderInteractiveArtifact } from '../packages/dsh-research-task-runtime/interactive-artifact.js';
import { compactHostDashboardHtml } from '../packages/dsh-research-task-runtime/html-artifact.js';

const panelPrompt = '工作台：合同管理工作台\n本面板：核心指标\n合同管理核心指标：在履行合同数量、30天内到期合同数、回款逾期金额、本年新签合同金额。每个指标给出计算口径；数值使用示例数据并标注示例口径。\n仅生成本面板，优先使用 kpi 类型；生成中的320×220是临时占位。';
const request = { parentSessionId: 'parent', canvasNodeId: 'node', kind: 'container', prompt: panelPrompt };

it('gives a planned workbench panel a bounded format-specific prompt', () => {
  const prompt = buildResearchTaskPrompt(request);
  expect(prompt.length).toBeLessThan(5000);
  expect(prompt).toContain('在履行合同数量');
  expect(prompt).toContain('示例口径');
  expect(prompt).toContain('"type":"dashboard"');
  expect(prompt).not.toContain('"type": "mind-map"');
});

it('restores the original workbench contract when an older card is retried from its saved content prompt', async () => {
  const prompts = [];
  let nextId = 0;
  let persisted;
  const options = {
    adapter: { start: async ({ prompt }) => {
      prompts.push(prompt);
      return { childSessionId: `child-${prompts.length}`, dispose: async () => {}, result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: '{"version":1,"type":"kpi","title":"核心指标","items":[{"label":"合同","value":"86 份"}]}' }] }) };
    } },
    storage: { save: async document => { persisted = document; }, load: async () => persisted }, createId: () => `task-${++nextId}`
  };
  const runtime = new ResearchTaskRuntime(options);
  try {
    await runtime.start(request);
    await vi.waitFor(() => expect(runtime.inspect({ parentSessionId: 'parent', taskId: 'task-1' }).state).toBe('completed'));
    await runtime.dispose();
    const reopened = new ResearchTaskRuntime(options);
    try {
      await reopened.restore();
      await reopened.start({ ...request, prompt: '合同管理核心指标：在履行合同数量、30天内到期合同数、回款逾期金额、本年新签合同金额。每个指标给出计算口径；数值使用示例数据并标注示例口径。\n组件初始尺寸 320×220px；自动布局按内容密度选择规格。' });
      await vi.waitFor(() => expect(reopened.inspect({ parentSessionId: 'parent', taskId: 'task-2' }).state).toBe('completed'));
    } finally { await reopened.dispose(); }
    expect(prompts[1]).toContain('唯一交付格式：');
    expect(prompts[1]).toContain('工作台：合同管理工作台');
    expect(prompts[1].length).toBeLessThan(5000);
  } finally { await runtime.dispose(); }
});

it('recovers a timed-out workbench panel with no public output once, without private reasoning', async () => {
  const output = JSON.stringify({ version: 1, type: 'kpi', title: '核心指标', items: [{ label: '在履行合同', value: '示例 100 份' }] });
  const start = vi.fn(async () => ({
    childSessionId: `child-${start.mock.calls.length}`,
    dispose: async () => {},
    result: Promise.resolve(start.mock.calls.length === 1
      ? { stopReason: 'timeout', localDeadlineExceeded: true, output: [{ type: 'reasoning', text: 'PRIVATE' }] }
      : { stopReason: 'completed', output: [{ type: 'text', text: output }] })
  }));
  const runtime = new ResearchTaskRuntime({ adapter: { start }, storage: { save: async () => {} }, createId: () => 'task' });
  try {
    await runtime.start(request);
    await vi.waitFor(() => expect(runtime.inspect({ parentSessionId: 'parent', taskId: 'task' }).state).toBe('completed'));
    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[1][0].synthesisOnly).toBe(true);
    expect(start.mock.calls[1][0].prompt).not.toContain('PRIVATE');
  } finally { await runtime.dispose(); }
});

it('keeps long dashboard explanations accessible but out of the value grid', () => {
  const explanation = '示例数据。监控口径：在履约合同共 100 份，回款逾期超过 30 天或者存在履约争议时评为高风险。';
  const artifact = renderInteractiveArtifact({ version: 1, type: 'dashboard', title: '风险监控', asOf: '2026-09-22 示例口径', items: [
    { label: '高风险', value: '12 份', detail: explanation },
    { label: '中风险', value: '31 份', detail: explanation },
    { label: '低风险', value: '57 份', detail: explanation },
    { label: '逾期', value: '2,345 万元', detail: explanation },
    { label: '待归档', value: '9 份', detail: explanation },
    { label: '争议', value: '15 份', detail: explanation }
  ] });
  expect(artifact.html).toContain('grid-template-columns:repeat(3,minmax(0,1fr))');
  expect(artifact.html).not.toContain(`<p class="research-metric-detail">${explanation}</p>`);
  expect(artifact.html).toContain(`<details><summary>查看口径</summary><p>${explanation}</p>`);
});

it('compacts saved host dashboards at display time without changing their data', () => {
  const detail = '示例数据。监控口径包含风险分级、逾期天数和告警阈值，完整说明必须保留在详情中。';
  const old = `<!doctype html><html><style>.list{grid-template-columns:repeat(auto-fit,minmax(min(120px,100%),1fr))}</style><body aria-label="风险监控"><main class="list research-metrics">${Array.from({length:6},()=>`<article class="research-metric"><p class="research-metric-detail">${detail}</p><details><summary>详情</summary><p>${detail}</p></details></article>`).join('')}</main><script>const all=Array.from(document.querySelectorAll('article'));</script></body></html>`;
  const compact = compactHostDashboardHtml(old);
  expect(compact).toContain('grid-template-columns:repeat(3,minmax(0,1fr))');
  expect(compact).not.toContain(`<p class="research-metric-detail">${detail}</p>`);
  expect(compact).toContain(`<details><summary>查看口径</summary><p>${detail}</p>`);
  expect(compact.split(detail)).toHaveLength(7);
  expect(compactHostDashboardHtml('<main class="list research-metrics">user-authored</main>')).toBe('<main class="list research-metrics">user-authored</main>');
});

it('prepares more than ten workbench cards in one durable batch', async () => {
  const start = vi.fn();
  const save = vi.fn(async () => {});
  const runtime = new ResearchTaskRuntime({ adapter: { start }, storage: { save } });
  const panels = Array.from({ length: 11 }, (_, index) => ({
    canvasNodeId: 'card-' + index, prompt: '阅读已有材料',
    artifact: { version: 1, type: 'markdown', title: '材料 ' + index, content: '已核对原文内容' }
  }));
  try {
    const tasks = await runtime.startPreparedBatch({ parentSessionId: 'parent', panels });
    expect(tasks.map(task => task.state)).toEqual(Array(11).fill('completed'));
    expect(save).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  } finally { await runtime.dispose(); }
});
