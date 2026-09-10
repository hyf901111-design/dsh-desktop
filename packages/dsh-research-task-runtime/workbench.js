import {assertPrivateResearchSession} from './board-runtime.js'
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
export const WORKBENCH_PATH = '/sherlock/research-workbenches/list';
import {validateWorkbench, layoutWorkbench, workbenchPanelPrompt} from './workbench-plan.js';
export {validateWorkbench, layoutWorkbench, PANEL_SIZES} from './workbench-plan.js';
const types = ['markdown', 'table', 'chart', 'kpi', 'html', 'news', 'reports', 'calendar', 'dashboard'];
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
// Only a host-started, leased board child can register this in-process sink.
// Planning captures validated data; cloud writes still require current edit authority.
const sharedPlans = new Map();
export function captureSharedWorkbenchPlan(sessionId, accept) {
    if (sharedPlans.has(sessionId)) throw Error('PLANNER_ALREADY_REGISTERED');
    sharedPlans.set(sessionId, accept);
    return () => { if (sharedPlans.get(sessionId) === accept) sharedPlans.delete(sessionId); };
}
export async function registerWorkbench(ctx, runtime, { filePath, isTrustedRequest, readJsonBody }) {
    let plans = [];
    try {
        plans = JSON.parse(await readFile(filePath, 'utf8'));
        if (!Array.isArray(plans))
            throw Error('工作台存储无效');
    }
    catch (e) {
        if (e.code !== 'ENOENT')
            throw e;
    }
    for (const p of plans)
        if (!p.ready) {
            p.ready = true;
            for (const panel of p.panels)
                if (!panel.taskId) {
                    const task = [...(runtime.tasks?.values() ?? [])].find(t => t.parentSessionId === p.parentSessionId && t.canvasNodeId === panel.nodeId);
                    if (task)
                        panel.taskId = task.taskId;
                    else
                        panel.error = '任务启动时中断，请重试。';
                }
        }
    let chain = Promise.resolve();
    const persist = async () => {
        await mkdir(dirname(filePath), { recursive: true });
        const tmp = `${filePath}.${randomUUID()}.tmp`;
        await writeFile(tmp, JSON.stringify(plans), 'utf8');
        await rename(tmp, filePath);
    };
    const create = (args, exec) => {
        const capture = sharedPlans.get(exec.agent?.session?.id);
        if (capture) {
            exec.signal?.throwIfAborted();
            return capture(validateWorkbench(args));
        }
        const run = async () => {
            const input = validateWorkbench(args);
            const parentSessionId = exec.agent?.session?.id;
            if (!str(parentSessionId, 256) || !ctx.agents.get(parentSessionId))
                throw Error('研究会话不可用');
            exec.signal?.throwIfAborted();
            await assertPrivateResearchSession(parentSessionId);
            const old = plans.find(p => p.parentSessionId === parentSessionId && p.requestId === input.requestId);
            if (old) {
                if (JSON.stringify(validateWorkbench(old.input ?? old)) !== JSON.stringify(input))
                    throw Error('该 requestId 已用于另一份规划，新需求请使用新的标识。');
                return { planId: old.id, panels: old.panels.map(p => p.title), status: 'accepted' };
            }
            const id = randomUUID();
            const plan = { ...input, input, id, parentSessionId, createdAt: Date.now(), panels: layoutWorkbench(input.panels).map((p, i) => ({ ...p, nodeId: `${id}-${i}` })) };
            if (plans.length >= 200)
                plans = plans.filter(p => !p.applied || p.createdAt > Date.now() - 30 * 86400000);
            if (plans.length >= 1000)
                throw Error('工作台记录过多，暂时无法创建新的工作台。');
            plans.push(plan);
            // Save identities before starting children. A partial failure remains visible and retryable.
            try {
                await persist();
            }
            catch (error) {
                plans = plans.filter(p => p.id !== id);
                throw error;
            }
            await Promise.all(plan.panels.map(async (p) => {
                try {
                    const receipt = await runtime.start({ parentSessionId, canvasNodeId: p.nodeId, kind: 'container', prompt: workbenchPanelPrompt(input, p) });
                    p.taskId = receipt.taskId;
                }
                catch {
                    p.error = '面板任务未能启动，请重试。';
                }
            }));
            plan.ready = true;
            await persist();
            return { planId: id, panels: plan.panels.map(p => p.title), status: 'accepted' };
        };
        const pending = chain.then(run);
        chain = pending.catch(() => { });
        return pending;
    };
    const disposeTool = ctx.tools.register(defineTool({
        name: 'research_workbench_create',
        description: '在研究画布一次创建由独立面板组成的工作台，各面板自动并发生成。仅用于需要多个研究维度的工作台需求；简单问答直接回复。先判断最少必要面板数（2–10），分别指定用途、范围、内容类型和高度。按使用目的选择交互：新闻/政策/交易动态用 news，报告库用 reports，日历用 calendar，指标监控快照用 dashboard，趋势用 chart，对比才用 table；综合工作台通常包含至少三种有意义的形式，避免清一色表格或长文。尊重用户明确要求的形式，不要在主会话先重复完成所有检索与报告。相同请求重试使用相同 requestId。返回 accepted 仅表示任务已提交，不表示数据已生成或监控已启用。',
        parameters: {
            requestId: { type: 'string', required: true, description: '本轮需求的唯一稳定标识，重试保持一致。' },
            title: { type: 'string', required: true },
            panels: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
                        title: { type: 'string', required: true }, prompt: { type: 'string', required: true, description: '该面板独立的问题、内容边界、数据与来源，以及用户可执行的交互（筛选、日期选择、展开、跳转）；避免重复。' },
                        type: { type: 'string', enum: types, required: true }, size: { type: 'string', enum: ['small', 'medium', 'large'], required: true, description: '初始规格：small 720×360、medium 720×600、large 720×840。按信息量选择，首屏只呈现核心内容；容器可按内容增高，避免固定高度的内部滚动区。' }
                    } } }
        },
        output: { schema: { type: 'object', additionalProperties: false, properties: { planId: { type: 'string', required: true }, panels: { type: 'array', items: { type: 'string' }, required: true }, status: { type: 'string', required: true } } }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
        execute: create
    }));
    const disposeRoute = ctx.webServer.register({ kind: 'exact', path: WORKBENCH_PATH, handler: async (req, res) => {
            const send = (status, data) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };
            if (req.method !== 'POST')
                return send(405, { error: 'Method not allowed' });
            if (!isTrustedRequest(req, true))
                return send(403, { error: 'Request rejected' });
            try {
                const { parentSessionId, acknowledged = [] } = await readJsonBody(req);
                await assertPrivateResearchSession(parentSessionId);
                if (!str(parentSessionId, 256))
                    return send(400, { error: '会话无效' });
                if (!Array.isArray(acknowledged) || acknowledged.length > 100)
                    return send(400, { error: '请求无效' });
                if (acknowledged.length) {
                    const pending = chain.then(async () => { for (const p of plans)
                        if (p.parentSessionId === parentSessionId && acknowledged.includes(p.id))
                            p.applied = true; await persist(); });
                    chain = pending.catch(() => { });
                    await pending;
                }
                send(200, { plans: plans.filter(p => p.parentSessionId === parentSessionId && p.ready && !p.applied).map(p => ({ ...p, panels: p.panels.map(panel => ({ ...panel })) })) });
            }
            catch {
                send(400, { error: '工作台读取失败' });
            }
        } });
    return async () => { disposeTool(); disposeRoute(); await chain; };
}
