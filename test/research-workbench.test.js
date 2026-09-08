import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, it, expect, vi } from 'vitest';
import { validateWorkbench, layoutWorkbench, registerWorkbench } from '../packages/dsh-research-task-runtime/workbench.js';
import { publicEventFromSessionEvent } from '../packages/dsh-research-task-runtime/index.js';
const panel = (n) => ({ title: `面板${n}`, prompt: `研究独立维度${n}`, type: n % 2 ? 'table' : 'markdown', height: 480 + n * 40 });
function toolPanel(n) { const {height, ...p} = panel(n); return {...p, size: height <= 600 ? 'medium' : 'large'}; }
function fake() { const f = new Proxy(function () { }, { get: () => f, apply: () => f }); return f; }
async function bundle() {
    let descriptor;
    runInNewContext(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'), { window: { __ModuleLoader__: { load: (d) => descriptor = d } }, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout });
    return descriptor.factory(() => fake());
}
function store() { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); return true; } }; }
describe('研究工作台', () => {
    it('validates independent panels and rejects oversized or duplicate plans', () => {
        expect(validateWorkbench({ requestId: 'a', title: '行业', panels: [panel(1), panel(2)] }).panels).toHaveLength(2);
        for (const panels of [[panel(1)], [panel(1), panel(1)], Array.from({ length: 11 }, (_, i) => panel(i)), [panel(1), { ...panel(2), height: 99999 }]])
            expect(() => validateWorkbench({ requestId: 'a', title: '行业', panels })).toThrow();
    });
    it('plans aligned rows using the tallest panel in each row', () => {
        const panels = layoutWorkbench(Array.from({ length: 7 }, (_, i) => panel(i)));
        expect(panels.slice(0, 3).map(p => p.y)).toEqual([0, 0, 0]);
        expect(panels[3].y).toBe(632);
        expect(panels.every(p => p.width === 720)).toBe(true);
    });
    it('fits the whole workbench rather than only the nearest panel, leaving room for the composer', async () => {
        const client = await bundle();
        const panels = layoutWorkbench(Array.from({ length: 4 }, (_, i) => panel(i))).map(p => ({ ...p, x: p.x + p.width / 2, y: p.y + p.height / 2 }));
        const viewport = client.researchWorkbenchViewport(panels, { x: 0, y: 0, scale: 1 }, { width: 658, height: 824 });
        for (const p of panels) {
            expect((p.x - p.width / 2) * viewport.scale + viewport.x).toBeGreaterThanOrEqual(31);
            expect((p.x + p.width / 2) * viewport.scale + viewport.x).toBeLessThanOrEqual(627);
            expect((p.y + p.height / 2) * viewport.scale + viewport.y).toBeLessThanOrEqual(644);
        }
    });
    it('starts all panels, deduplicates a repeated request, and restores unclaimed plans', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'sherlock-workbench-'));
        let tool, handler;
        const ctx = { agents: { get: () => ({}) }, tools: { register: (t) => { tool = t; return () => { }; } }, webServer: { register: (r) => { handler = r.handler; return () => { }; } } };
        const start = vi.fn(async (request) => ({ taskId: `task-${request.canvasNodeId}` }));
        const options = { filePath: join(dir, 'plans.json'), isTrustedRequest: () => true, readJsonBody: async () => ({ parentSessionId: 'parent' }) };
        let dispose;
        try {
            dispose = await registerWorkbench(ctx, { start }, options);
            const args = { requestId: 'one', title: '医药行业研究', panels: Array.from({ length: 10 }, (_, i) => toolPanel(i)) };
            const exec = { agent: { session: { id: 'parent' } }, signal: new AbortController().signal };
            const [first, repeated] = await Promise.all([tool.execute(args, exec), tool.execute(args, exec)]);
            expect(repeated.planId).toBe(first.planId);
            expect(start).toHaveBeenCalledTimes(10);
            expect((await tool.execute(args, exec)).planId).toBe(first.planId);
            expect(start).toHaveBeenCalledTimes(10);
            await expect(tool.execute({ ...args, title: '另一个需求' }, exec)).rejects.toThrow('requestId');
            await dispose();
            dispose = await registerWorkbench(ctx, { start }, options);
            let result;
            await handler({ method: 'POST' }, { writeHead: vi.fn(), end: (body) => { result = JSON.parse(body); } });
            expect(result.plans[0].panels).toHaveLength(10);
            expect(result.plans[0].panels.every((p) => p.taskId)).toBe(true);
        }
        finally {
            await dispose?.();
            await rm(dir, { recursive: true, force: true });
        }
    });
    it('isolates partial start failures and only acknowledges plans belonging to the requested session', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'sherlock-workbench-'));
        let tool, handler, body = { parentSessionId: 'parent' }, trusted = true;
        const ctx = { agents: { get: () => ({}) }, tools: { register: t => { tool = t; return () => { }; } }, webServer: { register: r => { handler = r.handler; return () => { }; } } };
        const start = vi.fn(async (request) => { if (request.canvasNodeId.endsWith('-1'))
            throw Error('private internal failure'); return { taskId: 'successful-task' }; });
        const dispose = await registerWorkbench(ctx, { start }, { filePath: join(dir, 'plans.json'), isTrustedRequest: () => trusted, readJsonBody: async () => body });
        const read = async () => { let result, status; await handler({ method: 'POST' }, { writeHead: s => { status = s; }, end: text => { result = JSON.parse(text); } }); return { status, ...result }; };
        try {
            const result = await tool.execute({ requestId: 'partial', title: '工作台', panels: [toolPanel(0), toolPanel(1)] }, { agent: { session: { id: 'parent' } } });
            const pending = await read();
            expect(pending.plans[0].panels[0].taskId).toBe('successful-task');
            expect(pending.plans[0].panels[1].error).toBe('面板任务未能启动，请重试。');
            body = { parentSessionId: 'other', acknowledged: [result.planId] };
            expect((await read()).plans).toEqual([]);
            body = { parentSessionId: 'parent' };
            expect((await read()).plans).toHaveLength(1);
            trusted = false;
            expect((await read()).status).toBe(403);
            trusted = true;
            body = { parentSessionId: 'parent', acknowledged: [result.planId] };
            expect((await read()).plans).toEqual([]);
        }
        finally {
            await dispose();
            await rm(dir, { recursive: true, force: true });
        }
    });
    it('inserts one persistent batch without duplicates, preserves planned sizes during progress and reflows on completion', async () => {
        const client = await bundle(), storage = store(), workspace = client.createResearchWorkspaceSession(storage, 's');
        const plan = { id: 'board', panels: layoutWorkbench(Array.from({ length: 4 }, (_, i) => ({ ...panel(i), nodeId: `n${i}`, taskId: `t${i}` }))) };
        expect(workspace.applyWorkbench(plan)).toBe(true);
        expect(workspace.getSnapshot().artifacts).toHaveLength(4);
        expect(workspace.applyWorkbench(plan)).toBe(true);
        expect(workspace.getSnapshot().artifacts).toHaveLength(4);
        expect(client.createResearchWorkspaceSession(storage, 's').getSnapshot().artifacts[0].workbenchId).toBe('board');
        workspace.applyGenerationInspection('n0', { taskId: 't0', canvasNodeId: 'n0', state: 'running', lastSeq: 1, events: [] });
        expect(workspace.getSnapshot().artifacts[0].width).toBe(720);
        expect(workspace.getSnapshot().artifacts[0].height).toBe(600);
        workspace.applyGenerationInspection('n0', { taskId: 't0', canvasNodeId: 'n0', state: 'completed', lastSeq: 2, events: [], finalOutput: JSON.stringify({ type: 'markdown', title: '内容', markdown: '# 标题\n正文' }) });
        const nodes = workspace.getSnapshot().artifacts;
        expect(nodes[0].width).toBe(720);
        expect(nodes[3].y - nodes[3].height / 2).toBeGreaterThanOrEqual(Math.max(...nodes.slice(0, 2).map((n) => n.y + n.height / 2)) + 31);
    });
    it('uses presets as initial sizes and preserves measured content when arranging', async () => {
        const input = { requestId: 'sizes', title: '工作台', panels: [0,1,2,3].map((n) => ({ ...panel(n), size: n === 0 ? 'small' : n === 1 ? 'medium' : 'large' })) };
        const planned = layoutWorkbench(validateWorkbench(input).panels);
        expect(planned.map(p => p.height)).toEqual([600,600,840,840]);
        const client = await bundle(), workspace = client.createResearchWorkspaceSession(store(), 'sizes');
        workspace.applyWorkbench({ id: 'sizes', panels: planned.map((p,i) => ({ ...p, nodeId: `s${i}`, taskId: `t${i}` })) });
        workspace.updateNodeGeometry('s0', { height: 3500, sizeMode: 'auto' });
        expect(workspace.getSnapshot().artifacts[0].height).toBe(3500);
        const times = workspace.getSnapshot().artifacts.map(p => p.workbenchRevealAt);
        expect(times[1]-times[0]).toBeGreaterThanOrEqual(500);
        workspace.organizeCanvas(new Map([['s0', {width: 720, height: 3500}]]));
        const nodes = workspace.getSnapshot().artifacts;
        expect(nodes.map(n=>n.height)).toEqual([3500,3500,840,840]);
        expect(nodes[0].y).toBe(nodes[1].y);
        expect(nodes[2].y).toBe(nodes[3].y);
    });
    it('surfaces real search topics and public reports, omitting private reasoning and raw artifact code', async () => {
        const event = publicEventFromSessionEvent({ type: 'tool/call', data: { name: 'web_search', arguments: JSON.stringify({ query: 'CDE 医药审批进展', token: 'private-token' }) } });
        expect(event).toEqual({ type: 'tool-started', tool: '搜索资料', detail: 'CDE 医药审批进展' });
        expect(publicEventFromSessionEvent({ type: 'assistant/chunk', data: { chunk: { type: 'reasoning-delta', text: 'private' } } })).toBeNull();
        const client = await bundle();
        const rows = client.researchGenerationLog({ generationEvents: [event, { type: 'assistant-delta', text: '已找到三项审批变化，正在核对发布日期。\n' }, { type: 'tool-started', tool: '读取网页', detail: '药监局审批公告' }, { type: 'assistant-delta', text: '{"type":"html","html":"<html><style>private-code</style></html>"}' }] });
        const text = rows.map((r) => r.text).join('\n');
        expect(text).toContain('CDE 医药审批进展');
        expect(text).toContain('已找到三项审批变化');
        expect(text).toContain('编排页面布局与配色');
        expect(text).not.toContain('private-code');
        expect(text).not.toContain('检索响应已返回');
    });
});

it('grows a preset HTML card and moves subsequent rows only by the additional row height', async () => {
    const client = await bundle(), storage = store();
    const html = '<main>可核验的内容</main>';
    const nodes = [0,1,2,3].map(i => ({id:`fit${i}`,kind:'generated-container',messageId:`fit${i}`,title:'面板',excerpt:'内容',generationStatus:'completed',sourceNodeIds:[],containerPrompt:'监控',refreshMinutes:0,width:720,height:600,x:(i%2)*752+360,y:i<2?348:980,sizeMode:'auto',containerSizePreset:'medium',workbenchId:'fit',containerSpec:{version:1,type:'html',title:'面板',html}}));
    storage.setItem('sherlock.research.canvas.artifacts.v1:fit', JSON.stringify(nodes));
    const workspace = client.createResearchWorkspaceSession(storage,'fit');
    expect(workspace.fitHtmlContent('fit0',html,{width:720,height:1000})).toBe(true);
    expect(workspace.getSnapshot().artifacts.map(n=>n.y)).toEqual([548,348,1380,1380]);
    expect(workspace.fitHtmlContent('fit1',html,{width:720,height:900})).toBe(true);
    expect(workspace.getSnapshot().artifacts[2].y).toBe(1380);
    workspace.resizeNode('fit0','se',{x:0,y:-200},1);
    expect(workspace.fitHtmlContent('fit0',html,{width:720,height:1100})).toBe(false);
    expect(workspace.getSnapshot().artifacts[0].height).toBe(800);
});
