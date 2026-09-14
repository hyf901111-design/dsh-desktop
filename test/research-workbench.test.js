import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, it, expect, vi } from 'vitest';
import { validateWorkbench, layoutWorkbench, registerWorkbench } from '../packages/dsh-research-task-runtime/workbench.js';
import { researchBentoLayout } from '../packages/dsh-research-task-runtime/bento-layout.js';
import { publicEventFromSessionEvent } from '../packages/dsh-research-task-runtime/index.js';
import { settleWorkbenchLayout, patchResearchWorkbenchGrowth } from '../scripts/lib/research-workbench-growth.mjs';
const panel = (n) => ({ title: `面板${n}`, prompt: `研究独立维度${n}`, type: n % 2 ? 'table' : 'markdown', height: 480 + n * 40 });
function toolPanel(n) { const {height, ...p} = panel(n); return {...p, size: height <= 600 ? 'medium' : 'large'}; }
function fake() { const f = new Proxy(function () { }, { get: () => f, apply: () => f }); return f; }
async function bundle() {
    let descriptor;
    runInNewContext(patchResearchWorkbenchGrowth(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')), { window: { __ModuleLoader__: { load: (d) => descriptor = d } }, URL, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout });
    return descriptor.factory(() => fake());
}
function store() { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); return true; } }; }
describe('研究工作台', () => {
    it('validates independent panels and rejects oversized or duplicate plans', () => {
        expect(validateWorkbench({ requestId: 'a', title: '行业', panels: [panel(1), panel(2)] }).panels).toHaveLength(2);
        for (const panels of [[panel(1)], [panel(1), panel(1)], Array.from({ length: 11 }, (_, i) => panel(i)), [panel(1), { ...panel(2), height: 99999 }]])
            expect(() => validateWorkbench({ requestId: 'a', title: '行业', panels })).toThrow();
    });
    it('packs large cards first and fills the remaining cells without changing same-size order', () => {
        const panels = layoutWorkbench(['small','large','medium','small','small'].map((size,i)=>({...panel(i),size})));
        expect(panels.map(({x,y,width,height})=>({x,y,width,height}))).toEqual([
            {x:672,y:236,width:320,height:220}, {x:0,y:0,width:656,height:456},
            {x:672,y:0,width:656,height:220}, {x:1008,y:236,width:320,height:220},
            {x:0,y:472,width:320,height:220}
        ]);
        expect(panels.map(p=>p.title)).toEqual(Array.from({length:5},(_,i)=>`面板${i}`));
        for(let i=0;i<panels.length;i++)for(const b of panels.slice(i+1)) {
            const a=panels[i];expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true);
        }
    });
    it('fits the whole workbench rather than only the nearest panel, leaving the designed outer margin', async () => {
        const client = await bundle();
        const panels = layoutWorkbench(Array.from({ length: 4 }, (_, i) => panel(i))).map(p => ({ ...p, x: p.x + p.width / 2, y: p.y + p.height / 2 }));
        const viewport = client.researchWorkbenchViewport(panels, { x: 0, y: 0, scale: 1 }, { width: 658, height: 824 });
        for (const p of panels) {
            expect((p.x - p.width / 2) * viewport.scale + viewport.x).toBeGreaterThanOrEqual(31);
            expect((p.x + p.width / 2) * viewport.scale + viewport.x).toBeLessThanOrEqual(627);
            expect((p.y + p.height / 2) * viewport.scale + viewport.y).toBeLessThanOrEqual(792);
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
        expect(workspace.getSnapshot().artifacts[0].width).toBe(656);
        expect(workspace.getSnapshot().artifacts[0].height).toBe(456);
        workspace.applyGenerationInspection('n0', { taskId: 't0', canvasNodeId: 'n0', state: 'completed', lastSeq: 2, events: [], finalOutput: JSON.stringify({ type: 'markdown', title: '内容', markdown: '# 标题\n正文' }) });
        const nodes = workspace.getSnapshot().artifacts;
        expect(nodes[0].width).toBe(656);
        expect(nodes.every(n=>n.width===656&&[220,456].includes(n.height))).toBe(true);
    });
    it('uses S M L sizes and retains full content while capping arranged frames at L', async () => {
        const input = { requestId: 'sizes', title: '工作台', panels: [0,1,2,3].map((n) => ({ ...panel(n), size: n === 0 ? 'small' : n === 1 ? 'medium' : 'large' })) };
        const planned = layoutWorkbench(validateWorkbench(input).panels);
        expect(planned.map(p => p.height)).toEqual([220,220,456,456]);
        const client = await bundle(), workspace = client.createResearchWorkspaceSession(store(), 'sizes');
        workspace.applyWorkbench({ id: 'sizes', panels: planned.map((p,i) => ({ ...p, nodeId: `s${i}`, taskId: `t${i}` })) });
        workspace.updateNodeGeometry('s0', { height: 3500, sizeMode: 'auto' });
        // A tall automatic S card upgrades both axes to L; 320×456 is not a valid preset.
        expect(workspace.getSnapshot().artifacts[0]).toMatchObject({ width: 656, height: 456, containerSizePreset: 'large', sizeMode: 'auto' });
        const times = workspace.getSnapshot().artifacts.map(p => p.workbenchRevealAt);
        expect(times[1]-times[0]).toBeGreaterThanOrEqual(500);
        workspace.organizeCanvas(new Map([['s0', {width: 720, height: 3500}]]));
        const nodes = workspace.getSnapshot().artifacts;
        expect(nodes.map(n=>n.height)).toEqual([456,220,456,456]);
        expect(nodes[0].containerPrompt).toBe(planned[0].prompt);
        expect(nodes.every(n=>n.width<=656&&n.height<=456)).toBe(true);
        workspace.updateNodeGeometry('s0', { width: 420, height: 3500, sizeMode: 'manual' });
        expect(workspace.getSnapshot().artifacts[0]).toMatchObject({ width: 420, height: 3500, sizeMode: 'manual' });
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

it('upgrades a preset HTML card to L and moves following rows without exceeding L', async () => {
    const client = await bundle(), storage = store();
    const html = '<main>可核验的内容</main>';
    const nodes = [0,1,2,3].map(i => ({id:`fit${i}`,kind:'generated-container',messageId:`fit${i}`,title:'面板',excerpt:'内容',generationStatus:'completed',sourceNodeIds:[],containerPrompt:'监控',refreshMinutes:0,width:656,height:220,x:(i%2)*672+328,y:i<2?142:378,sizeMode:'auto',containerSizePreset:'medium',workbenchId:'fit',containerSpec:{version:1,type:'html',title:'面板',html}}));
    storage.setItem('sherlock.research.canvas.artifacts.v1:fit', JSON.stringify(nodes));
    const workspace = client.createResearchWorkspaceSession(storage,'fit');
    expect(workspace.fitHtmlContent('fit0',html,{width:656,height:400})).toBe(true);
    expect(workspace.getSnapshot().artifacts.map(n=>n.y)).toEqual([260,142,614,614]);
    expect(workspace.fitHtmlContent('fit1',html,{width:656,height:300})).toBe(true);
    expect(workspace.getSnapshot().artifacts[2].y).toBe(614);
    workspace.resizeNode('fit0','se',{x:0,y:-200},1);
    expect(workspace.fitHtmlContent('fit0',html,{width:656,height:1100})).toBe(false);
    expect(workspace.getSnapshot().artifacts[0].height).toBe(256);
});

it('arranges links, text and many generated panels together without an empty vertical region', async () => {
    const client = await bundle(), storage = store();
    const nodes = Array.from({length: 14}, (_, i) => ({id:`mixed-${i}`,kind:'generated-container',messageId:`m${i}`,title:`面板${i}`,excerpt:'已生成',generationStatus:'completed',sourceNodeIds:[],containerPrompt:'研究',refreshMinutes:0,width:720,height:840,x:360+(i%3)*752,y:4000+Math.floor(i/3)*872,sizeMode:'auto',containerSizePreset:'large',containerSpec:{version:1,type:'html',title:'面板',html:'<p>有效内容</p>'}}));
    nodes.push({id:'link',kind:'web-link',messageId:'link',title:'网页',url:'https://example.org',excerpt:'网页',x:300,y:420,width:600,height:400});
    nodes.push({id:'text',kind:'pasted-text',messageId:'text',title:'文字',excerpt:'协作测试记录',x:1866,y:3036,width:724,height:140});
    storage.setItem('sherlock.research.canvas.artifacts.v1:mixed', JSON.stringify(nodes));
    const workspace = client.createResearchWorkspaceSession(storage,'mixed');
    workspace.organizeCanvas();
    const arranged = workspace.getSnapshot().artifacts;
    const bands = arranged.map(n=>[n.y-n.height/2,n.y+n.height/2]).sort((a,b)=>a[0]-b[0]);
    let bottom=bands[0][1];
    for(const [top,end] of bands.slice(1)){expect(top-bottom).toBeLessThanOrEqual(48);bottom=Math.max(bottom,end);}
    for(let i=0;i<arranged.length;i++)for(const b of arranged.slice(i+1)){
        const a=arranged[i]; expect(Math.abs(a.x-b.x)>=(a.width+b.width)/2 || Math.abs(a.y-b.y)>=(a.height+b.height)/2).toBe(true);
    }
    expect(arranged.find(n=>n.id==='link').url).toBe('https://example.org/');
    workspace.organizeCanvas();
    expect(workspace.getSnapshot().artifacts.map(({id,x,y,width,height})=>({id,x,y,width,height}))).toEqual(arranged.map(({id,x,y,width,height})=>({id,x,y,width,height})));
});

it('keeps mixed workbench cards apart when several completed panels grow in both dimensions', async () => {
    const client = await bundle(), workspace = client.createResearchWorkspaceSession(store(), 'growth');
    workspace.setCanvasSize({width:740,height:820});
    workspace.applyWorkbench({id:'growth',panels:layoutWorkbench([
        {title:'指标',type:'kpi',size:'small'}, {title:'表格',type:'table',size:'small'},
        {title:'图表',type:'chart',size:'medium'}, {title:'计数器',type:'html',size:'small'}
    ]).map((p,i)=>({...p,prompt:'演示内容',nodeId:`grow${i}`,taskId:`task${i}`}))});
    workspace.setViewport(client.researchWorkbenchViewport(workspace.getSnapshot().artifacts,workspace.getSnapshot().viewport,workspace.getSnapshot().canvasSize));
    for (const [id,width,height] of [['grow0',656,220],['grow1',656,456],['grow3',656,456]]) {
        workspace.updateNodeGeometry(id,{width,height,sizeMode:'auto'});
        const {artifacts,viewport}=workspace.getSnapshot();
        for(let i=0;i<artifacts.length;i++)for(const b of artifacts.slice(i+1)) {
            const a=artifacts[i];expect(Math.abs(a.x-b.x)>=(a.width+b.width)/2 || Math.abs(a.y-b.y)>=(a.height+b.height)/2,`${a.id} overlaps ${b.id}`).toBe(true);
        }
        if(id==='grow3') for(const n of artifacts) {
            expect((n.x-n.width/2)*viewport.scale+viewport.x).toBeGreaterThanOrEqual(30);
            expect((n.x+n.width/2)*viewport.scale+viewport.x).toBeLessThanOrEqual(710);
        }
    }
});

it('does not pull the user back to a growing workbench after they pan away', async () => {
    const client=await bundle(),workspace=client.createResearchWorkspaceSession(store(),'panned');
    workspace.setCanvasSize({width:740,height:820});
    workspace.applyWorkbench({id:'panned',panels:layoutWorkbench([panel(0),panel(1)]).map((p,i)=>({...p,nodeId:`pan${i}`,taskId:`t${i}`}))});
    workspace.setViewport({x:-4000,y:-3000,scale:.7});
    workspace.updateNodeGeometry('pan0',{width:656,height:456,sizeMode:'auto'});
    expect(workspace.getSnapshot().viewport).toEqual({x:-4000,y:-3000,scale:.7});
});

it('preserves manually positioned neighbors and puts an expanding card in free space', async () => {
    const client=await bundle(),storage=store();
    const nodes=[0,1].map(i=>({id:`manual${i}`,kind:'generated-container',messageId:`m${i}`,title:'面板',excerpt:'内容',generationStatus:'completed',sourceNodeIds:[],containerPrompt:'演示',refreshMinutes:0,width:320,height:220,x:160+i*336,y:142,sizeMode:i?'manual':'auto',containerSizePreset:'small',workbenchId:'manual',containerSpec:{version:1,type:'markdown',title:'面板',content:'内容'}}));
    storage.setItem('sherlock.research.canvas.artifacts.v1:manual',JSON.stringify(nodes));
    const workspace=client.createResearchWorkspaceSession(storage,'manual');
    workspace.updateNodeGeometry('manual0',{width:656,height:456,sizeMode:'auto'});
    const [grown,manual]=workspace.getSnapshot().artifacts;
    expect(manual).toMatchObject({x:496,y:142,width:320,height:220,sizeMode:'manual'});
    expect(Math.abs(grown.x-manual.x)>=(grown.width+manual.width)/2||Math.abs(grown.y-manual.y)>=(grown.height+manual.height)/2).toBe(true);
});

it('settles a workbench once after the last active component finishes, including failures', () => {
  const nodes=Array.from({length:6},(_,i)=>({id:String(i),workbenchId:'w',workbenchIndex:i,generationStatus:i===5?'running':'completed',x:328,y:i*472+228,width:656,height:456,size:'large'}));
  const before={artifacts:nodes,canvasSize:{width:1000,height:800}};
  const after={...before,artifacts:nodes.map(n=>({...n,generationStatus:n.id==='5'?'failed':'completed'}))};
  const pack=vi.fn(researchBentoLayout);
  const settled=settleWorkbenchLayout(before,after,pack);
  expect(pack).toHaveBeenCalledTimes(1);
  expect(settled.viewport.scale).toBeLessThan(1);
  expect(new Set(settled.artifacts.map(n=>n.x)).size).toBeGreaterThan(1);
  expect(new Set(settled.artifacts.map(n=>n.y)).size).toBeGreaterThan(1);
  expect(settleWorkbenchLayout(settled,settled,pack)).toBe(settled);
  expect(pack).toHaveBeenCalledTimes(1);
  expect(settleWorkbenchLayout(before,before,pack)).toBe(before);
});
