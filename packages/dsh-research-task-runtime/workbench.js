import {assertPrivateResearchSession} from './board-runtime.js'
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
export const WORKBENCH_PATH = '/sherlock/research-workbenches/list';
export const PANEL_SIZES = { small: 360, medium: 600, large: 840 };
const panelSize = p => Object.hasOwn(PANEL_SIZES, p.size) ? p.size : p.height <= 360 ? 'small' : p.height <= 600 ? 'medium' : 'large';
const types = ['markdown', 'table', 'chart', 'kpi', 'html', 'news', 'reports', 'calendar', 'dashboard'];
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
export function validateWorkbench(value) {
    if (!value || !str(value.requestId, 100) || !str(value.title, 100) || !Array.isArray(value.panels) || value.panels.length < 2 || value.panels.length > 10)
        throw Error('工作台需要 2–10 个独立面板。');
    const seen = new Set();
    const panels = value.panels.map(p => {
        if (!p || !str(p.title, 80) || !str(p.prompt, 5000) || !types.includes(p.type) || (!Object.hasOwn(PANEL_SIZES, p.size) && (!Number.isInteger(p.height) || p.height < 320 || p.height > 1200)) || seen.has(p.title.trim()))
            throw Error('面板标题、内容类型或规划尺寸无效。');
        seen.add(p.title.trim());
        return { title: p.title.trim(), prompt: p.prompt.trim(), type: p.type, size: panelSize(p), height: PANEL_SIZES[panelSize(p)] };
    });
    return { requestId: value.requestId.trim(), title: value.title.trim(), panels };
}
export function layoutWorkbench(panels) {
    const columns = panels.length === 2 || panels.length === 4 ? 2 : 3;
    let y = 0;
    const result = [];
    for (let offset = 0; offset < panels.length; offset += columns) {
        const row = panels.slice(offset, offset + columns);
        const height = Math.max(...row.map(p => PANEL_SIZES[panelSize(p)]));
        const size = Object.keys(PANEL_SIZES).find(key => PANEL_SIZES[key] === height);
        row.forEach((p, index) => result.push({ ...p, size, height, x: index * 752, y, width: 720 }));
        y += height + 32;
    }
    return result;
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
                    const receipt = await runtime.start({ parentSessionId, canvasNodeId: p.nodeId, kind: 'container', prompt: `工作台：${input.title}\n本面板：${p.title}\n${p.prompt}\n仅生成本面板，优先使用 ${p.type} 类型；框宽 ${p.width}px，建议初始高度 ${p.height}px，使用自然高度和响应式布局，不设置固定高度的内部滚动区；必要时画布按实际内容增高。首屏表格最多${p.size === "small" ? 4 : p.size === "medium" ? 6 : 8}行、最多4个主要列（更多字段用默认折叠的详情），不得压缩成逐字换行；来源必须短标签可点击；文字最多${p.size === "small" ? 250 : p.size === "medium" ? 450 : 650}字，优先核心数据和结论，使用简短来源链接，细节可用折叠区。内容简洁完整，遵守用户指定的行数、条数和范围，不额外扩写背景、摘要。标题简短，来源和日期放在正文，避免重复其他面板内容。数据注明来源和日期，无法获得的数据明确标注缺失；不得伪造实时数据或声称已开启持续监控。` });
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
