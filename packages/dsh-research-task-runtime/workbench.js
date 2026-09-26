import {assertPrivateResearchSession} from './board-runtime.js'
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
export const WORKBENCH_PATH = '/sherlock/research-workbenches/list';
import {validateWorkbench, layoutWorkbench, workbenchPanelPrompt} from './workbench-plan.js';
import {SIMULATED_WORKBENCH_PRESETS} from './simulated-workbench-presets.js';
import {generateSimulatedPanel} from './simulated-workbench-generator.js';
import {marketVariant} from './workbench-design-contract.js';
export {validateWorkbench, layoutWorkbench, PANEL_SIZES} from './workbench-plan.js';
const types = ['markdown', 'table', 'chart', 'kpi', 'html', 'news', 'reports', 'calendar', 'dashboard', 'market', 'gantt'];
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const templateIds = panels => panels.map(panel => panel.type === 'market'
    ? `market.${panel.artifact?.variant ?? marketVariant(panel) ?? 'unspecified'}`
    : panel.type === 'chart' ? `chart.${panel.artifact?.variant ?? 'unspecified'}` : panel.type);
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
    const mountWaiters = new Map();
    const mountedPlans = new Set();
    const waitForCanvas = (id) => new Promise(resolve => {
        if (mountedPlans.delete(id)) return resolve();
        const timer = setTimeout(() => { mountWaiters.delete(id); resolve(); }, 1800);
        mountWaiters.set(id, () => { clearTimeout(timer); mountWaiters.delete(id); mountedPlans.delete(id); resolve(); });
    });
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
            const plan = validateWorkbench(args);
            if (plan.dataMode === 'simulated') throw Error('共享画板的模拟数据快路径尚未启用，请使用现有面板生成流程。');
            return capture(plan);
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
                return { planId: old.id, panels: old.panels.map(p => p.title), templateIds: templateIds(old.panels), status: old.ready ? input.dataMode === 'simulated' || input.panels.every(p=>p.artifact) ? 'prepared' : 'accepted' : 'preparing' };
            }
            const id = randomUUID();
            const plan = { ...input, input, id, parentSessionId, createdAt: Date.now(), ready: false,
                panels: layoutWorkbench(input.panels).map((p, i) => ({ ...p, nodeId: `${id}-${i}` })) };
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
            // Let the canvas mount the exact validated plan before any panel
            // preparation starts. The bounded fallback also supports headless
            // sessions without an open renderer.
            await waitForCanvas(id);
            if (input.dataMode === 'simulated') {
                try {
                    if (input.panels.some(p => !p.artifact)) {
                        const content = validateWorkbench({ ...input, generationMode: undefined,
                            panels: input.panels.map(p => generateSimulatedPanel(p, input.title)) });
                        for (let index = 0; index < plan.panels.length; index++)
                            Object.assign(plan.panels[index], { title: content.panels[index].title,
                                prompt: content.panels[index].prompt, type: content.panels[index].type,
                                artifact: content.panels[index].artifact });
                    }
                    const receipts = await runtime.startPreparedBatch({ parentSessionId, panels: plan.panels.map(p => ({ canvasNodeId: p.nodeId, prompt: workbenchPanelPrompt(input, p), artifact: p.artifact })) });
                    for (let index = 0; index < plan.panels.length; index++) plan.panels[index].taskId = receipts[index].taskId;
                } catch (error) {
                    for (const panel of plan.panels) panel.error = `模拟数据准备失败：${error.message}`;
                    plan.ready = true;
                    await persist();
                    throw error;
                }
            } else {
                const prepared = plan.panels.filter(p => p.artifact);
                const pending = plan.panels.filter(p => !p.artifact);
                try {
                    if (prepared.length) {
                        const receipts = await runtime.startPreparedBatch({parentSessionId, panels:prepared.map(p => ({canvasNodeId:p.nodeId,prompt:workbenchPanelPrompt(input,p),artifact:p.artifact}))});
                        prepared.forEach((p,i) => {p.taskId=receipts[i].taskId;p.prepared=true;});
                    }
                    if (pending.length && typeof runtime.startBatch === 'function') {
                        const receipts = await runtime.startBatch({parentSessionId, panels:pending.map(p => ({canvasNodeId:p.nodeId,kind:'container',prompt:workbenchPanelPrompt(input,p)}))});
                        pending.forEach((p,i) => {p.taskId=receipts[i].taskId;});
                    } else for (const p of pending) {
                        try { p.taskId=(await runtime.start({parentSessionId,canvasNodeId:p.nodeId,kind:'container',prompt:workbenchPanelPrompt(input,p)})).taskId; } catch { p.error='面板任务未能启动，请重试。'; }
                    }
                } catch(error) {
                    for(const p of plan.panels) if(!p.taskId)p.error='面板任务未能启动，请重试。';
                }
            }
            plan.ready = true;
            mountedPlans.delete(id);
            await persist();
            return { planId: id, panels: plan.panels.map(p => p.title), templateIds: templateIds(plan.panels), status: input.dataMode === 'simulated' || input.panels.every(p=>p.artifact) ? 'prepared' : 'accepted' };
        };
        const pending = chain.then(run);
        chain = pending.catch(() => { });
        return pending;
    };
    const disposeTool = ctx.tools.register(defineTool({
        name: 'research_workbench_create',
        description: '在研究画布新增 1–10 个独立面板；此工具不会替换、刷新或删除已有组件。用户要求更新已有组件时，先 research_canvas_inspect；金融模板用 research_canvas_update_market 直接提交结构化数据，其他组件用 research_canvas_apply 修改其 containerSpec；不要把新增结果称为替换。用户指定数量时严格遵守，不额外增加配套面板。自定义模拟工作台提交 dataMode:"simulated" 和只含 title/prompt/type/size 的 panels；宿主用设计模板一次性生成模拟内容，无需每张面板启动模型，也无需编写 artifact。标准模拟预设：medical-21h、market-overview-21h、research-operations-21m，可只提交 preset。已有完整模拟数据时可提交 artifact。真实数据已取到时直接将完整结构化数据放入各 panel.artifact，宿主即刻填充预置模板，不启动逐卡模型；仅尚未取到数据的面板走子任务。不可把模拟数据标为真实来源。面板子任务不继承主对话的工具返回；如果主对话已取数，必须在对应 prompt 中传递实际数值、日期、单位及真实调用来源，不能只列待查字段或说“已取得”，否则子任务会重复检索。仅调用 financial_query 的记录不得标为通联；不同来源分别标注。返回 accepted 仅表示面板任务已启动，回复应说生成中，不能声称全部完成；prepared 才表示宿主已准备好内容。同一请求重试保持 requestId。返回的 templateIds 与 panels 按顺序对应，回复用户时以最终 templateIds 为准。所有模拟值显著标注；不可虚构链接或声称连接真实行情。',
        parameters: {
            requestId: { type: 'string', required: true, description: '本轮需求的唯一稳定标识，重试保持一致。' },
            title: { type: 'string', required: true },
            dataMode: { type: 'string', enum: ['simulated', 'source'], description: '用户允许演示数据且个人看板时使用 simulated；真实来源或共享画板省略。' },
            generationMode: { type: 'string', enum: ['parallel'], description: '兼容旧调用；模拟数据即使传 parallel 也由宿主本地生成，不启动面板模型。新调用可省略。' },
            preset: { type: 'string', enum: SIMULATED_WORKBENCH_PRESETS, description: '宿主内置的完整模拟工作台。设置后不要传 panels。' },
            panels: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
                        title: { type: 'string', required: true }, prompt: { type: 'string', required: true, description: '该面板独立的问题与内容边界；主对话已有的数据必须完整带入实际记录、日期、单位与来源，子任务看不到主对话工具返回。以及用户可执行的交互（筛选、日期选择、展开、跳转）；避免重复。' },
                        type: { type: 'string', enum: types, required: true }, size: { type: 'string', enum: ['small', 'medium', 'large'], required: true, description: '通用组件初始规格：small 320×220、medium 656×220、large 656×456；金融 market 组件由宿主以 Figma 源节点为基线按内容密度确定几何，此字段只作画布预设。按内容密度选规格，内容放不下则拆分组件或提供完整阅读入口。字体不缩小。' },
                        artifact: { type: 'object', additionalProperties: true, description: '可选。已取得的真实数据或明确模拟数据，按 template 数据契约填写 version:1、type、title 及数据字段；无需 HTML。真实来源/时点就近标注。' }
                    } } }
        },
        output: { schema: { type: 'object', additionalProperties: false, properties: { planId: { type: 'string', required: true }, panels: { type: 'array', items: { type: 'string' }, required: true }, templateIds: { type: 'array', items: { type: 'string' }, required: true }, status: { type: 'string', required: true } } }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] },
        execute: create
    }));
    const disposeRoute = ctx.webServer.register({ kind: 'exact', path: WORKBENCH_PATH, handler: async (req, res) => {
            const send = (status, data) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };
            if (req.method !== 'POST')
                return send(405, { error: 'Method not allowed' });
            if (!isTrustedRequest(req, true))
                return send(403, { error: 'Request rejected' });
            try {
                const { parentSessionId, acknowledged = [], mounted = [] } = await readJsonBody(req);
                await assertPrivateResearchSession(parentSessionId);
                if (!str(parentSessionId, 256))
                    return send(400, { error: '会话无效' });
                if (!Array.isArray(acknowledged) || acknowledged.length > 100 || !Array.isArray(mounted) || mounted.length > 100)
                    return send(400, { error: '请求无效' });
                for (const p of plans) if (p.parentSessionId === parentSessionId && !p.ready && mounted.includes(p.id)) {
                    mountedPlans.add(p.id);
                    mountWaiters.get(p.id)?.();
                }
                if (acknowledged.length) {
                    const pending = chain.then(async () => { for (const p of plans)
                        if (p.parentSessionId === parentSessionId && p.ready && acknowledged.includes(p.id))
                            p.applied = true; await persist(); });
                    chain = pending.catch(() => { });
                    await pending;
                }
                send(200, { plans: plans.filter(p => p.parentSessionId === parentSessionId && !p.applied).map(p => ({ id: p.id, title: p.title, createdAt: p.createdAt, ready: p.ready, panels: p.panels.map(({ artifact, ...panel }) => ({
                    ...panel,
                    ...(!p.ready && !panel.taskId && !panel.error ? { pending: true } : {}),
                    // A completed prepared plan can also be mounted after the
                    // preparation finishes, such as when the renderer reloads.
                    ...((p.dataMode === 'simulated' || panel.prepared) && panel.taskId ? { preparedOutput: runtime.inspect({ parentSessionId, taskId: panel.taskId, afterSeq: 0 }).finalOutput } : {})
                })) })) });
            }
            catch {
                send(400, { error: '工作台读取失败' });
            }
        } });
    return async () => { disposeTool(); disposeRoute(); await chain; };
}
