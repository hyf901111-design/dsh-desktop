import { Window } from 'happy-dom';
import { patchFigmaFinalCanvas, patchWorkbenchPanelGuard } from '../scripts/lib/figma-canvas-client.mjs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, it, expect, vi } from 'vitest';
import { validateWorkbench, layoutWorkbench, registerWorkbench } from '../packages/dsh-research-task-runtime/workbench.js';
import { researchBentoLayout } from '../packages/dsh-research-task-runtime/bento-layout.js';
import { publicEventFromSessionEvent } from '../packages/dsh-research-task-runtime/index.js';
import { readableWorkbenchViewport, settleWorkbenchLayout, researchWorkbenchMatrixNodes, patchResearchWorkbenchGrowth } from '../scripts/lib/research-workbench-growth.mjs';
import { acceptArtifactOutput } from '../packages/dsh-research-task-runtime/artifact-output.js';
import { renderMarketArtifact } from '../packages/dsh-research-task-runtime/market-artifact.js';
import { prepareSimulatedArtifact } from '../packages/dsh-research-task-runtime/workbench-plan.js';
import { marketVariant } from '../packages/dsh-research-task-runtime/workbench-design-contract.js';
const panel = (n) => ({ title: `面板${n}`, prompt: `研究独立维度${n}`, type: n % 2 ? 'table' : 'markdown', height: 480 + n * 40 });
function toolPanel(n) { const {height, ...p} = panel(n); return {...p, size: height <= 600 ? 'medium' : 'large'}; }
function fake() { const f = new Proxy(function () { }, { get: () => f, apply: () => f }); return f; }
async function bundle() {
    let descriptor;const win=new Window();
    runInNewContext(patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')), { document:win.document, window: { __ModuleLoader__: { load: (d) => descriptor = d } }, URL, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout });
    return descriptor.factory(() => fake());
}
it('passes the actual on-screen canvas height through the packaged resize path', async () => {
    const patched=patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'));
    expect(patched).toContain('previous.visibleHeight!==visibleHeight');
    expect(patched).toContain('const next={width:bounds.width,height:bounds.height,visibleHeight,availableWidth}');
});
function store() { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); return true; } }; }
it('deals six cards into a strict two-column matrix despite a saved leading-strip hint',()=>{
 const nodes=Array.from({length:6},(_,i)=>({id:`strict-${i}`,workbenchIndex:i,workbenchSpan:i===0,width:320,height:220,generationStatus:'queued'}));
 const matrix=researchWorkbenchMatrixNodes(nodes,24,40);
 expect(matrix.map(n=>[n.x-n.width/2,n.y-n.height/2])).toEqual([[24,40],[360,40],[24,276],[360,276],[24,512],[360,512]]);
 const plan=layoutWorkbench(nodes.map((_,i)=>({title:i?'资讯'+i:'核心指标',prompt:i?'行业资讯':'六项指标',type:i?'news':'market',size:'large'})));
 expect(plan[0].y).toBe(plan[1].y);
 expect(plan[2].y).toBe(plan[3].y);
 expect(plan[4].y).toBe(plan[5].y);
 expect(plan[0].workbenchSpan).not.toBe(true);
});
describe('研究工作台', () => {
    it('returns an actionable preset receipt contract for title-only calls without creating placeholder data', () => {
        for (const dataMode of [undefined, 'simulated', 'source']) {
            expect(() => validateWorkbench({ requestId:'missing-content', title:'医药复验', dataMode }))
                .toThrow('缺少工作台内容参数');
        }
        const prepared = validateWorkbench({requestId:'preset-retry',title:'医药复验',dataMode:'simulated',preset:'medical-21h'});
        expect(prepared.panels.map(p=>p.artifact.variant)).toEqual(['metrics','trend','scatter','table','pipeline','events']);
        expect(validateWorkbench({requestId:'preset-retry',title:'医药复验',dataMode:'simulated',preset:'medical-21h',panels:[]}).panels).toEqual(prepared.panels);
        expect(()=>validateWorkbench({requestId:'preset-retry',title:'医药复验',dataMode:'simulated',preset:'medical-21h',panels:[toolPanel(0)]})).toThrow('混用');
        expect(() => validateWorkbench({requestId:'source',title:'真实医药',dataMode:'source',preset:'medical-21h'})).toThrow();
    });
    it('schedules an empty market template draft for fetching without dropping any supplied observations', () => {
        const draft={version:1,type:'market',variant:'metrics',title:'行情快照',asOf:'',items:[]};
        const p={title:'行情快照',prompt:'使用通联获取宁德时代行情',type:'market',size:'medium',artifact:draft};
        const input={requestId:'empty-draft',title:'真实行情工作台',dataMode:'source',panels:[p]};
        const result=validateWorkbench(input).panels[0];
        expect(result.artifact).toBeUndefined();
        expect(marketVariant(result)).toBe('metrics');
        expect(result.prompt).toContain(p.prompt);
        expect(p.artifact).toBe(draft);
        for(const artifact of [{...draft,items:[{label:'最新价',value:'0'}]},{...draft,note:'已有数据来源'},{...draft,asOf:'2026-09-25'},{...draft,extra:true}])
            expect(()=>validateWorkbench({...input,panels:[{...p,artifact}]})).toThrow();
    });
    it('uses the panel title to distinguish a metrics strip from trends mentioned in its scope', () => {
        expect(marketVariant({ title:'核心指标（模拟）', prompt:'展示六项指标，并说明近期趋势' })).toBe('metrics');
        expect(marketVariant({ title:'行业热力图', prompt:'对比行业指标趋势' })).toBe('heatmap');
        expect(marketVariant({ title:'K 线图', prompt:'展示成交量趋势' })).toBe('candlestick');
        expect(marketVariant({ title:'核心指标', prompt:'variant: trend；明确展示趋势图' })).toBe('trend');
        expect(marketVariant({ title:'热门白酒股行情看板', prompt:'展示十只股票的最新价、成交额和市值，支持按涨跌幅排序，点击个股查看K线详情' })).toBe('table');
        expect(marketVariant({ title:'主要指数实时行情', prompt:'展示最新价与涨跌幅' })).toBe('metrics');
        expect(validateWorkbench({ requestId:'variant-inference', title:'金融模拟工作台', dataMode:'simulated', generationMode:'parallel', panels:[
            {title:'K 线图',prompt:'展示日 K 线和成交量',type:'market',size:'large'},
            {title:'行业热力图',prompt:'按行业涨跌幅展示热力图',type:'market',size:'large'}
        ] }).panels).toHaveLength(2);
    });
    it('accepts an explicitly requested single panel and rejects empty, oversized or duplicate plans', () => {
        const single = validateWorkbench({ requestId: 'single', title: '单面板', panels: [panel(1)] });
        expect(single.panels).toHaveLength(1);
        expect(layoutWorkbench(single.panels)[0]).toMatchObject({ x: 0, y: 0 });
        expect(validateWorkbench({ requestId: 'a', title: '行业', panels: [panel(1), panel(2)] }).panels).toHaveLength(2);
        for (const panels of [[], [panel(1), panel(1)], Array.from({ length: 31 }, (_, i) => panel(i)), [panel(1), { ...panel(2), height: 99999 }]])
            expect(() => validateWorkbench({ requestId: 'a', title: '行业', panels })).toThrow();
    });
    it('patches the shipped canvas mount guard so a single prepared panel can appear', async () => {
        const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8');
        const guard = 'if (!plan || !Array.isArray(plan.panels) || plan.panels.length < 1 || plan.panels.length > 30) return false;';
        const older = source.replace(/if \(!plan \|\| !Array.isArray\(plan.panels\) \|\| plan.panels.length < [12] \|\| plan.panels.length > (?:10|30)\) return false;/, guard.replace('length < 1', 'length < 2').replace('> 30','> 10'));
        expect(patchWorkbenchPanelGuard(older)).toContain(guard);
        expect(patchWorkbenchPanelGuard(patchWorkbenchPanelGuard(older))).toContain(guard);
    });
    it('keeps Figma template sizes and non-overlapping source order',()=>{
        const panels=layoutWorkbench(['small','large','medium','small','small','large','medium','small','large'].map((size,i)=>({...panel(i),size})));
        expect(panels[0]).toMatchObject({width:320,height:220,x:0,y:0});
        expect(panels[1]).toMatchObject({width:656,height:352,x:672,y:0});
        expect(panels[2]).toMatchObject({width:656,height:220,x:0,y:368});
        for (const [i,a] of panels.entries()) for (const b of panels.slice(i+1))
            expect(a.x+a.width+16<=b.x || b.x+b.width+16<=a.x || a.y+a.height+16<=b.y || b.y+b.height+16<=a.y).toBe(true);
        expect(panels.map(p=>p.title)).toEqual(Array.from({length:9},(_,i)=>`面板${i}`));
    });
    it('packs a mixed six-card research plan into three aligned rows',()=>{
        const cards=[
            {title:'贵州茅台 K 线图',prompt:'日 K 线',type:'market',size:'large'},
            {title:'白酒龙头走势对比',prompt:'价格走势',type:'market',size:'large'},
            {title:'白酒行情表格',prompt:'股票行情',type:'market',size:'large'},
            {title:'白酒行业资讯',prompt:'真实资讯',type:'news',size:'large'},
            {title:'行业研报精选',prompt:'真实研报',type:'reports',size:'large'},
            {title:'板块估值明细',prompt:'variant: table',type:'market',size:'large'}
        ];
        const placed=layoutWorkbench(cards);
        expect([...new Set(placed.map(p=>p.y))]).toHaveLength(3);
        expect([placed[0].x,placed[2].x,placed[4].x]).toEqual([0,0,0]);
        for(const [i,a] of placed.entries()) for(const b of placed.slice(i+1))
            expect(a.x+a.width+16<=b.x || b.x+b.width+16<=a.x || a.y+a.height+16<=b.y || b.y+b.height+16<=a.y).toBe(true);
    });
    it('keeps seven pending cards in a compact two-column matrix as one card grows', () => {
        const pending = Array.from({length:7},(_,i)=>({id:`card-${i}`,workbenchIndex:i,width:320,height:220,x:i*400,y:i*250}));
        const dealt = researchWorkbenchMatrixNodes(pending, 24, 40);
        expect(dealt.map(n=>[n.x,n.y])).toEqual([
            [184,150],[520,150],[184,386],[520,386],[184,622],[520,622],[184,858]
        ]);
        const grown = researchWorkbenchMatrixNodes(dealt.map((n,i)=>i===0?{...n,width:656,height:456}:n),24,40);
        expect(grown[0].y-grown[0].height/2).toBe(grown[1].y-grown[1].height/2);
        expect(grown[2].y-grown[2].height/2).toBe(grown[3].y-grown[3].height/2);
        expect(grown[2].y-grown[2].height/2).toBe(grown[0].y+grown[0].height/2+16);
        expect(grown[1].x-grown[1].width/2).toBe(grown[0].x+grown[0].width/2+16);
    });
    it('keeps a wide leading indicator in the same two-column ETF matrix', () => {
        const plan = layoutWorkbench([
            {title:'主要指数实时行情',prompt:'指数行情',type:'market',size:'large'},
            {title:'行业板块热力图',prompt:'热力图',type:'market',size:'large'},
            {title:'ETF 行情排行',prompt:'表格明细',type:'table',size:'large'},
            {title:'重点 ETF K 线走势',prompt:'K 线',type:'market',size:'large'},
            {title:'ETF 资金流向监控',prompt:'资金监控',type:'chart',size:'large'},
            {title:'ETF 溢价率预警',prompt:'预警',type:'table',size:'large'},
            {title:'ETF 市场要闻',prompt:'要闻',type:'news',size:'large'}
        ]);
        expect(plan[0].workbenchSpan).not.toBe(true);
        expect(plan[0].y).toBe(plan[1].y);
        expect(plan[2].y).toBe(plan[3].y);
        expect(plan[4].y).toBe(plan[5].y);
        expect(new Set([plan[1].x,plan[3].x,plan[5].x]).size).toBe(1);
        const pending = researchWorkbenchMatrixNodes(plan.map((p,i)=>({id:`etf-${i}`,workbenchIndex:i,workbenchSpan:p.workbenchSpan===true,width:320,height:220})),0,0);
        expect(pending[0].x).toBe(160);
        expect(pending[1].x).toBe(496);
        expect(pending[2].x).toBe(160);
        expect(pending[3].y-pending[3].height/2).toBe(236);
    });
    it('keeps a six-card medical preset in a compact matrix as source-sized cards complete', () => {
        const pending = Array.from({length:6},(_,index)=>({
            id:`medical-${index}`,workbenchId:'medical',workbenchIndex:index,
            workbenchSpan:index===0,width:320,height:220,generationStatus:'queued'
        }));
        const initial=researchWorkbenchMatrixNodes(pending,0,0);
        expect(initial.map(node=>[node.x-node.width/2,node.y-node.height/2])).toEqual([
            [0,0],[336,0],[0,236],[336,236],[0,472],[336,472]
        ]);
        const sizes=[[896,144],[536,264],[348,264],[536,258],[348,258],[896,110]];
        const before={artifacts:initial,canvasSize:{width:897,height:740}};
        const after={...before,artifacts:initial.map((node,index)=>({...node,
            width:sizes[index][0],height:sizes[index][1],generationStatus:'completed',
            ...(index===5?{containerSpec:{type:'html',html:'<body data-sherlock-market="events">'}}:{})
        }))};
        const settled=settleWorkbenchLayout(before,after).artifacts;
        expect(settled.map(node=>[node.x-node.width/2,node.y-node.height/2])).toEqual([
            [0,0],[908,0],[0,276],[908,276],[0,552],[908,552]
        ]);
        const viewport=readableWorkbenchViewport(settled,{x:0,y:0,scale:1},before.canvasSize);
        expect((settled[5].x+settled[5].width/2)*viewport.scale+viewport.x).toBeLessThanOrEqual(897);
    });
    it('resizes a 144px market metrics card smoothly while preserving generic minimums', async () => {
        const client = await bundle();
        const html = renderMarketArtifact({version:1,type:'market',variant:'metrics',title:'模拟指标',asOf:'模拟',
            items:Array.from({length:6},(_,i)=>({label:`指标${i}`,value:String(i)}))}).html;
        const metrics = { id:'metrics', kind:'generated-container', title:'模拟指标', x:448, y:192,
            width:896, height:144, sizeMode:'auto', containerSpec:{version:1,type:'html',html} };
        expect(client.normalizeResearchCanvasNodeGeometry(metrics)).toMatchObject({width:896,height:144});
        const taller = client.resizeResearchCanvasNode(metrics,'se',{x:4,y:2},1);
        expect(taller).toMatchObject({width:900,height:146,sizeMode:'manual'});
        expect(client.resizeResearchCanvasNode(taller,'se',{x:-4,y:-2},1)).toMatchObject({width:896,height:146});
        expect(client.resizeResearchCanvasNode(metrics,'se',{x:0,y:-40},1).height).toBe(144);
        const dense = {...metrics,height:232,containerSpec:{version:1,type:'html',html:renderMarketArtifact({version:1,type:'market',variant:'metrics',title:'指标',asOf:'模拟',items:Array.from({length:9},(_,i)=>({label:`指标${i}`,value:String(i)}))}).html}};
        expect(client.resizeResearchCanvasNode(dense,'se',{x:0,y:-40},1).height).toBe(232);
        const generic = {...metrics,id:'generic',width:320,height:220,containerSpec:{version:1,type:'markdown',title:'普通卡片',content:'内容'}};
        expect(client.resizeResearchCanvasNode(generic,'se',{x:0,y:-40},1).height).toBe(220);
    });
    it('uses one readable-width rule across generated market cards without a first-drag jump', async () => {
        const client=await bundle();
        const specs=[
            {variant:'metrics',width:896,height:144,items:Array.from({length:6},(_,i)=>({label:`指标${i}`,value:String(i)}))},
            {variant:'breadth',width:896,height:220,advancing:318,flat:18,declining:164,metrics:[{label:'上涨占比',value:'63.6%'}]},
            {variant:'heatmap',width:434,height:258,items:[{label:'医药',weight:60,change:1.2},{label:'银行',weight:40,change:-.4}]}
        ];
        for(const [index,{width,height,...data}] of specs.entries()){
            const rendered=renderMarketArtifact({version:1,type:'market',title:'模拟',asOf:'模拟数据',...data});
            const node={id:`readable-${index}`,kind:'generated-container',x:width/2,y:height/2,width,height,sizeMode:'auto',containerSpec:rendered};
            expect(client.resizeResearchCanvasNode(node,'se',{x:0,y:0},1)).toMatchObject({width,height});
            const minimum=Math.min(width,472);
            expect(client.resizeResearchCanvasNode(node,'se',{x:-1000,y:-1000},1)).toMatchObject({width:minimum,height:Math.min(height,[212,200,320][index])});
            const legacy={...node,width:Math.max(200,minimum-30),height:Math.max(80,height-30),sizeMode:'manual'};
            expect(client.resizeResearchCanvasNode(legacy,'se',{x:0,y:0},1)).toMatchObject({width:legacy.width,height:legacy.height});
        }
    });
    it('keeps a compact event card at its generated minimum on first resize', async () => {
        const client = await bundle();
        const event = (i) => ({date:`07-${15+i} 09:00`,object:'华辰医药',event:'III 期数据读出',focus:'关注主要终点',window:'7 月中旬',status:'待公布'});
        const makeNode = (items, height) => ({id:'events',kind:'generated-container',title:'近期行业事件（模拟）',
            x:448,y:760,width:896,height,sizeMode:'auto',containerSpec:renderMarketArtifact({
                version:1,type:'market',variant:'events',title:'近期行业事件（模拟）',asOf:'模拟数据',items
            })});
        const compact = makeNode([event(0)],110);
        expect(client.normalizeResearchCanvasNodeGeometry(compact)).toMatchObject({width:896,height:110});
        expect(client.resizeResearchCanvasNode(compact,'se',{x:0,y:0},1).height).toBe(110);
        expect(client.resizeResearchCanvasNode(compact,'se',{x:0,y:2},1).height).toBe(112);
        expect(client.resizeResearchCanvasNode(compact,'se',{x:0,y:-10},1).height).toBe(110);
        const threeRows = makeNode([event(0),event(1),event(2)],138);
        expect(client.resizeResearchCanvasNode(threeRows,'se',{x:0,y:-10},1).height).toBe(138);
    });
    it('preserves content-sized dashboard and Gantt frames through canvas normalization and first resize', async () => {
        const client = await bundle();
        const panels = layoutWorkbench(validateWorkbench({requestId:'ops-frame-test',title:'运营验证',
            dataMode:'simulated',preset:'research-operations-21m'}).panels);
        for (const [index,height] of [[0,280],[2,316]]) {
            const panel=panels[index];
            const node={id:`ops-${index}`,kind:'generated-container',title:panel.title,x:448,y:192,
                width:panel.width,height,sizeMode:'auto',containerSpec:JSON.parse(acceptArtifactOutput(JSON.stringify(panel.artifact)))};
            expect(client.normalizeResearchCanvasNodeGeometry(node)).toMatchObject({width:656,height});
            expect(client.resizeResearchCanvasNode(node,'se',{x:0,y:0},1).height).toBe(height);
            expect(client.resizeResearchCanvasNode(node,'se',{x:0,y:2},1).height).toBe(height+2);
            expect(client.resizeResearchCanvasNode(node,'se',{x:0,y:-10},1).height).toBe(height);
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
    it('restores a saved canvas viewport after reload without changing component geometry', async () => {
        const client=await bundle(), storage=store();
        const workspace=client.createResearchWorkspaceSession(storage,'viewport-reload');
        workspace.setCanvasSize({width:1088,availableWidth:728,height:800});
        workspace.setViewport({x:96,y:100,scale:.85});
        workspace.persist();
        const saved=storage.getItem('sherlock.research.canvas.viewport.v1:viewport-reload');
        expect(JSON.parse(saved)).toEqual({scale:.85,x:96,y:100,mode:'manual'});
        const reopened=client.createResearchWorkspaceSession(storage,'viewport-reload');
        reopened.setCanvasSize({width:1088,availableWidth:728,height:800});
        expect(reopened.getSnapshot().viewport).toEqual({x:96,y:100,scale:.85});
        expect(reopened.getSnapshot().artifacts).toEqual(workspace.getSnapshot().artifacts);
        expect(client.createResearchWorkspaceSession(storage,'another-board').getSnapshot().viewport).toEqual({x:0,y:0,scale:1});
    });
    it('fits existing workbench cards on first open when no viewport was saved', async () => {
        const client=await bundle(), storage=store();
        const cards=[
            {id:'kpi',x:448,y:66,width:896,height:132},
            {id:'holdings',x:278,y:384,width:556,height:400},
            {id:'industry',x:732,y:384,width:328,height:400}
        ].map((node,index)=>({...node,kind:'generated-container',messageId:'m'+index,title:node.id,
            excerpt:'模拟数据',generationStatus:'completed',sourceNodeIds:[],containerPrompt:'模拟数据',
            refreshMinutes:0,sizeMode:'manual',workbenchId:'fund-board',workbenchIndex:index,
            containerSpec:{version:1,type:'markdown',title:node.id,content:'模拟数据'}}));
        storage.setItem('sherlock.research.canvas.artifacts.v1:legacy-board',JSON.stringify(cards));
        const workspace=client.createResearchWorkspaceSession(storage,'legacy-board');
        workspace.setCanvasSize({width:1088,availableWidth:728,height:800});
        const {viewport,artifacts}=workspace.getSnapshot();
        expect(artifacts.map(({id,x,y,width,height})=>({id,x,y,width,height}))).toEqual(cards.map(({id,x,y,width,height})=>({id,x,y,width,height})));
        for(const node of artifacts){
            expect((node.x-node.width/2)*viewport.scale+viewport.x).toBeGreaterThanOrEqual(31);
            expect((node.x+node.width/2)*viewport.scale+viewport.x).toBeLessThanOrEqual(697);
        }
        workspace.persist();
        expect(client.createResearchWorkspaceSession(storage,'legacy-board').getSnapshot().viewport).toEqual(viewport);
        const fullFit=client.researchWorkbenchViewport(cards,{x:0,y:0,scale:1},{width:1088,height:712});
        storage.setItem('sherlock.research.canvas.artifacts.v1:legacy-prefit',JSON.stringify(cards));
        storage.setItem('sherlock.research.canvas.viewport.v1:legacy-prefit',JSON.stringify(fullFit));
        const prefit=client.createResearchWorkspaceSession(storage,'legacy-prefit');
        prefit.setCanvasSize({width:1088,availableWidth:728,height:800});
        expect(prefit.getSnapshot().viewport).toEqual(client.researchWorkbenchViewport(cards,fullFit,{width:728,height:712}));

        // A fit saved in a wide window must fit again after the window narrows.
        const wideFit=client.researchWorkbenchViewport(cards,{x:0,y:0,scale:1},{width:955,height:800});
        storage.setItem('sherlock.research.canvas.artifacts.v1:narrow-window',JSON.stringify(cards));
        storage.setItem('sherlock.research.canvas.viewport.v1:narrow-window',JSON.stringify(wideFit));
        const narrowed=client.createResearchWorkspaceSession(storage,'narrow-window');
        narrowed.setCanvasSize({width:820,availableWidth:820,height:800});
        expect(narrowed.getSnapshot().viewport).toEqual(client.researchWorkbenchViewport(cards,wideFit,{width:820,height:712}));
        for(const node of narrowed.getSnapshot().artifacts){
            const view=narrowed.getSnapshot().viewport;
            expect(view.x+(node.x+node.width/2)*view.scale).toBeLessThanOrEqual(820-31);
        }

        // The first measurement can precede the chat panel's opening animation.
        storage.setItem('sherlock.research.canvas.artifacts.v1:late-panel',JSON.stringify(cards));
        storage.setItem('sherlock.research.canvas.viewport.v1:late-panel',JSON.stringify(wideFit));
        const latePanel=client.createResearchWorkspaceSession(storage,'late-panel');
        latePanel.setCanvasSize({width:1155,availableWidth:1155,height:800});
        expect(latePanel.getSnapshot().viewport).toEqual(client.researchWorkbenchViewport(cards,wideFit,{width:1155,height:712}));
        latePanel.setCanvasSize({width:997,availableWidth:997,height:800});
        expect(latePanel.getSnapshot().viewport).toEqual(client.researchWorkbenchViewport(cards,wideFit,{width:997,height:712}));
        latePanel.setCanvasSize({width:820,availableWidth:820,height:800});
        expect(latePanel.getSnapshot().viewport).toEqual(client.researchWorkbenchViewport(cards,wideFit,{width:820,height:712}));
        latePanel.setCanvasSize({width:733,availableWidth:733,height:800});
        expect(latePanel.getSnapshot().viewport.scale).toBeLessThan(.8);
        latePanel.setCanvasSize({width:820,availableWidth:820,height:800});
        expect(latePanel.getSnapshot().viewport).toEqual(client.researchWorkbenchViewport(cards,wideFit,{width:820,height:712}));
        latePanel.persist();
        expect(JSON.parse(storage.getItem('sherlock.research.canvas.viewport.v1:late-panel')).mode).toBe('auto');

        // A user's offset is intentional even when some content is off-screen.
        const manual={x:96,y:100,scale:.85};
        storage.setItem('sherlock.research.canvas.artifacts.v1:manual-window',JSON.stringify(cards));
        storage.setItem('sherlock.research.canvas.viewport.v1:manual-window',JSON.stringify(manual));
        const reopenedManual=client.createResearchWorkspaceSession(storage,'manual-window');
        reopenedManual.setCanvasSize({width:820,availableWidth:820,height:800});
        expect(reopenedManual.getSnapshot().viewport).toEqual(manual);
        latePanel.setViewport({x:32});
        const userView=latePanel.getSnapshot().viewport;
        latePanel.persist();
        expect(JSON.parse(storage.getItem('sherlock.research.canvas.viewport.v1:late-panel')).mode).toBe('manual');
        latePanel.setCanvasSize({width:700,availableWidth:700,height:800});
        expect(latePanel.getSnapshot().viewport).toEqual(userView);
        const userReload=client.createResearchWorkspaceSession(storage,'late-panel');
        userReload.setCanvasSize({width:700,availableWidth:700,height:800});
        expect(userReload.getSnapshot().viewport).toEqual(userView);
        latePanel.setViewport(wideFit,true);
        latePanel.setCanvasSize({width:820,availableWidth:820,height:800});
        expect(latePanel.getSnapshot().viewport).toEqual(client.researchWorkbenchViewport(cards,wideFit,{width:820,height:712}));
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
            const tabs=[{name:'临床与经营',panelIndexes:[0,1,2,3,4]},{name:'市场与政策',panelIndexes:[5,6,7,8,9]}];
            const args = { requestId: 'one', title: '医药行业研究', tabs, panels: Array.from({ length: 10 }, (_, i) => toolPanel(i)) };
            const exec = { agent: { session: { id: 'parent' } }, signal: new AbortController().signal };
            const [first, repeated] = await Promise.all([tool.execute(args, exec), tool.execute(args, exec)]);
            expect(repeated.planId).toBe(first.planId);
            expect(first.tabs).toEqual(tabs.map(t=>t.name));
            expect(start).toHaveBeenCalledTimes(10);
            expect((await tool.execute(args, exec)).planId).toBe(first.planId);
            expect(start).toHaveBeenCalledTimes(10);
            await expect(tool.execute({ ...args, title: '另一个需求' }, exec)).rejects.toThrow('requestId');
            await dispose();
            dispose = await registerWorkbench(ctx, { start }, options);
            let result;
            await handler({ method: 'POST' }, { writeHead: vi.fn(), end: (body) => { result = JSON.parse(body); } });
            expect(result.plans[0].createdAt).toEqual(expect.any(Number));
            expect(result.plans[0].tabs).toEqual(tabs);
            expect(result.plans[0].panels).toHaveLength(10);
            expect(result.plans[0].panels.every((p) => p.taskId)).toBe(true);
        }
        finally {
            await dispose?.();
            await rm(dir, { recursive: true, force: true });
        }
    });
    it('generates a stable omitted request id per human message and keeps retries idempotent', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'sherlock-workbench-auto-id-'));
        let tool;
        const ctx = { agents: { get: () => ({}) }, tools: { register: t => { tool = t; return () => {}; } }, webServer: { register: () => () => {} } };
        const start = vi.fn(async request => ({ taskId: request.canvasNodeId }));
        const dispose = await registerWorkbench(ctx, { start }, { filePath: join(dir, 'plans.json'), isTrustedRequest: () => true, readJsonBody: async () => ({}) });
        const args = { title: '个股工作台', panels: [toolPanel(0)] };
        const session = { id: 'parent', events: [{ type: 'user/message', data: { id: 'human-1', source: { kind: 'user' }, content: [{ type: 'text', text: '创建工作台' }] } }] };
        try {
            expect(tool.parameters.required ?? []).not.toContain('requestId');
            expect(tool.parameters.required).toContain('panels');
            const first = await tool.execute(args, { agent: { session } });
            expect((await tool.execute(args, { agent: { session } })).planId).toBe(first.planId);
            expect(start).toHaveBeenCalledTimes(1);
            session.events.push({ type: 'user/message', data: { ...session.events[0].data, id: 'human-2' } });
            expect((await tool.execute(args, { agent: { session } })).planId).not.toBe(first.planId);
            expect(start).toHaveBeenCalledTimes(2);
            await expect(tool.execute(args, { agent: { session: { id: 'parent' } } })).rejects.toThrow();
        } finally { await dispose(); await rm(dir, { recursive: true, force: true }); }
    });
    it('publishes the exact panel plan before preparation and waits for canvas mounting', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'sherlock-workbench-plan-'));
        let tool, handler, body = { parentSessionId: 'parent' }, prepare;
        const ctx = { agents: { get: () => ({}) }, tools: { register: t => { tool = t; return () => {}; } }, webServer: { register: r => { handler = r.handler; return () => {}; } } };
        const runtime = { startPreparedBatch: vi.fn(() => new Promise(resolve => { prepare = resolve; })), inspect: vi.fn(() => ({ finalOutput: '{}' })) };
        const dispose = await registerWorkbench(ctx, runtime, { filePath: join(dir, 'plans.json'), isTrustedRequest: () => true, readJsonBody: async () => body });
        const read = async () => { let result; await handler({ method: 'POST' }, { writeHead: () => {}, end: text => { result = JSON.parse(text); } }); return result; };
        let pending;
        try {
            pending = tool.execute({ requestId:'staged', title:'五组件工作台', dataMode:'simulated', panels:['kpi','chart','table','news','reports'].map((type,i)=>({title:`面板${i}`,prompt:`展示面板${i}的模拟内容`,type,size:'medium',...(type==='chart'?{artifact:{version:1,type:'chart',title:`模拟面板${i}`,variant:'bar',labels:['A','B'],series:[{name:'样本',values:[12,18]}]}}:{})})) }, {agent:{session:{id:'parent'}}});
            let announced;
            for (let attempt = 0; attempt < 40 && !announced; attempt++) {
                announced = (await read()).plans[0];
                if (!announced) await new Promise(resolve => setTimeout(resolve, 25));
            }
            expect(announced?.panels).toHaveLength(5);
            expect(announced.ready).toBe(false);
            expect(announced.panels.every(p => p.pending === true && !p.taskId)).toBe(true);
            expect(runtime.startPreparedBatch).not.toHaveBeenCalled();
            body = { parentSessionId:'parent', mounted:[announced.id] };
            await read();
            await vi.waitFor(() => expect(runtime.startPreparedBatch).toHaveBeenCalledTimes(1));
            prepare(Array.from({length:5},(_,i)=>({taskId:`prepared-${i}`})));
            await pending;
            body = { parentSessionId:'parent' };
            expect((await read()).plans[0].panels.map(p=>p.taskId)).toEqual(Array.from({length:5},(_,i)=>`prepared-${i}`));
        } finally { prepare?.(Array.from({length:5},(_,i)=>({taskId:`prepared-${i}`}))); if (prepare) await pending?.catch(()=>{}); await dispose(); await rm(dir,{recursive:true,force:true}); }
    }, 10000);
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
    it('hydrates all five planned cards with their real task ids before completion', async () => {
        const client = await bundle(), workspace = client.createResearchWorkspaceSession(store(), 'five-planned');
        const panels = layoutWorkbench(Array.from({length:5},(_,i)=>({title:`面板${i}`,prompt:`独立研究${i}`,type:'table',size:'medium'})))
            .map((panel,i)=>({...panel,nodeId:`planned-${i}`,pending:true}));
        expect(workspace.applyWorkbench({id:'five-planned',createdAt:1000,ready:false,panels})).toBe(true);
        expect(workspace.getSnapshot().artifacts).toHaveLength(5);
        expect(workspace.getSnapshot().artifacts.every(node=>node.generationStatus==='queued' && !node.generationTaskId)).toBe(true);
        const launched = panels.map((panel,i)=>({...panel,pending:false,taskId:`task-${i}`}));
        expect(workspace.applyWorkbench({id:'five-planned',createdAt:1000,ready:true,panels:launched})).toBe(true);
        expect(workspace.getSnapshot().artifacts.map(node=>node.generationTaskId)).toEqual(Array.from({length:5},(_,i)=>`task-${i}`));
        const output=JSON.stringify({version:1,type:'table',title:'面板0',columns:['项目','值'],rows:[['样本','100']]});
        expect(workspace.applyGenerationInspection('planned-0',{taskId:'task-0',canvasNodeId:'planned-0',state:'completed',lastSeq:1,events:[],finalOutput:output})).toBe(true);
        expect(workspace.getSnapshot().artifacts.map(node=>node.generationStatus)).toEqual(['completed','queued','queued','queued','queued']);
    });
    it('completes every already mounted simulated card from its prepared output', async () => {
        const client = await bundle(), workspace = client.createResearchWorkspaceSession(store(), 'five-prepared');
        const panels = layoutWorkbench(Array.from({length:5},(_,i)=>({title:`模拟面板${i}`,prompt:`展示模拟面板${i}`,type:'table',size:'medium'})))
            .map((panel,i)=>({...panel,nodeId:`prepared-${i}`,pending:true}));
        expect(workspace.applyWorkbench({id:'five-prepared',createdAt:1000,ready:false,panels})).toBe(true);
        const prepared = panels.map((panel,i)=>({...panel,pending:false,taskId:`task-${i}`,preparedOutput:JSON.stringify({
            version:1,type:'table',title:panel.title,columns:['项目','值'],rows:[[panel.title,String(i)]]
        })}));
        expect(workspace.applyWorkbench({id:'five-prepared',createdAt:1000,ready:true,panels:prepared})).toBe(true);
        const nodes = workspace.getSnapshot().artifacts;
        expect(nodes).toHaveLength(5);
        expect(nodes.map(node=>node.generationStatus)).toEqual(Array(5).fill('completed'));
        expect(nodes.map(node=>node.generationTaskId)).toEqual(Array.from({length:5},(_,i)=>`task-${i}`));
    });
    it('packs all completed generic panels at content dimensions immediately', async () => {
        const client=await bundle(), workspace=client.createResearchWorkspaceSession(store(),'prepared-generic');
        workspace.setCanvasSize({width:1200,availableWidth:1200,height:900});
        const specs=[
            {version:1,type:'markdown',title:'简短结论',content:'市场温和上涨。'},
            {version:1,type:'table',title:'覆盖样本',columns:['公司','价格','涨跌','成交额','状态'],rows:Array.from({length:8},()=>['模拟','100','+1%','10','观察'])},
            {version:1,type:'news',title:'资讯',items:Array.from({length:7},(_,i)=>({title:`资讯${i}`,summary:'模拟内容',date:'2026-06-30',category:'市场'}))}
        ];
        const panels=layoutWorkbench(specs.map((spec,i)=>({title:spec.title,prompt:`面板 ${i}`,type:spec.type,size:'large'})))
            .map((panel,i)=>({...panel,nodeId:`generic-${i}`,taskId:`task-${i}`,preparedOutput:acceptArtifactOutput(JSON.stringify(specs[i]))}));
        expect(workspace.applyWorkbench({id:'prepared-generic',panels})).toBe(true);
        const nodes=workspace.getSnapshot().artifacts;
        expect(nodes.map(n=>[n.width,n.height])).toEqual([[320,220],[656,280],[656,316]]);
        for(const [i,a] of nodes.entries())for(const b of nodes.slice(i+1))
            expect(a.x+a.width/2+12<=b.x-b.width/2||b.x+b.width/2+12<=a.x-a.width/2||a.y+a.height/2+12<=b.y-b.height/2||b.y+b.height/2+12<=a.y-a.height/2).toBe(true);
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
        expect(workspace.getSnapshot().artifacts[0]).toMatchObject({width:320,height:220,sizeMode:'auto'});
        workspace.resizeNode('n1','se',{x:1,y:1},1);
        expect(workspace.getSnapshot().artifacts[1]).toMatchObject({width:321,height:221,sizeMode:'manual'});
        workspace.resizeNode('n1','se',{x:-200,y:-200},1);
        expect(workspace.getSnapshot().artifacts[1]).toMatchObject({width:320,height:220,sizeMode:'manual'});
        workspace.applyGenerationInspection('n0', { taskId: 't0', canvasNodeId: 'n0', state: 'completed', lastSeq: 2, events: [], finalOutput: JSON.stringify({ version:1, type: 'markdown', title: '内容', content: '# 标题\n正文' }) });
        const nodes = workspace.getSnapshot().artifacts;
        expect(nodes[0].width).toBe(320);
        expect(nodes[0].height).toBe(220);
        expect(nodes.slice(1).every(n=>n.width===320&&n.height===220)).toBe(true);
    });
    it('mounts all prepared financial panels completed at their Figma dimensions without polling', async () => {
        const specs = [
            {variant:'metrics',items:[{label:'指数',value:'100 点'}]},
            {variant:'trend',labels:['02-01','02-02'],series:[{name:'行业',values:[100,102]}]},
            {variant:'table',columns:['标的','价格'],rows:[['模拟 A','100.00']]}
        ].map((data,i)=>({version:1,type:'market',title:`金融面板${i}（模拟）`,asOf:'模拟数据 · 2026-02-06',...data}));
        const planned=layoutWorkbench(specs.map((artifact,i)=>({title:artifact.title,prompt:`variant: ${artifact.variant}`,type:'market',size:'large',artifact})))
            .map((p,i)=>({...p,nodeId:`prepared-${i}`,taskId:`task-${i}`,preparedOutput:acceptArtifactOutput(JSON.stringify(specs[i]))}));
        const client=await bundle(),workspace=client.createResearchWorkspaceSession(store(),'prepared');
        workspace.setCanvasSize({width:896,height:824});
        expect(workspace.applyWorkbench({id:'prepared',panels:planned})).toBe(true);
        expect(workspace.getSnapshot().artifacts.map(n=>[n.generationStatus,n.width,n.height])).toEqual([
            ['completed',656,316],['completed',656,316],['completed',656,316]
        ]);
        const placed=workspace.getSnapshot().artifacts;
        expect(placed.map(n=>[n.x,n.y])).toEqual([[328,206],[1000,206],[328,538]]);
        expect(placed[0].y-placed[0].height/2).toBe(placed[1].y-placed[1].height/2);
        expect(placed[2].x-placed[2].width/2).toBe(placed[0].x-placed[0].width/2);
        const viewport=workspace.getSnapshot().viewport;
        for (const node of placed) {
            expect((node.x-node.width/2)*viewport.scale+viewport.x).toBeGreaterThanOrEqual(31);
            expect((node.x+node.width/2)*viewport.scale+viewport.x).toBeLessThanOrEqual(865);
            expect((node.y-node.height/2)*viewport.scale+viewport.y).toBeGreaterThanOrEqual(31);
            expect((node.y+node.height/2)*viewport.scale+viewport.y).toBeLessThanOrEqual(705);
        }
        expect(workspace.getSnapshot().artifacts.every(n=>n.containerSpec?.type==='html')).toBe(true);
    });
    it('keeps the six-card medical preset clear of the floating toolbar after the left sidebar closes', async () => {
        const panels=validateWorkbench({requestId:'medical-viewport',title:'医药',dataMode:'simulated',preset:'medical-21h'}).panels;
        const planned=layoutWorkbench(panels).map((p,i)=>({
            ...p,nodeId:`medical-${i}`,taskId:`medical-task-${i}`,
            preparedOutput:acceptArtifactOutput(JSON.stringify(prepareSimulatedArtifact(p)))
        }));
        const client=await bundle(), storage=store(), workspace=client.createResearchWorkspaceSession(storage,'medical-viewport');
        workspace.setCanvasSize({width:679,availableWidth:679,height:906,visibleHeight:828});
        expect(workspace.applyWorkbench({id:'medical-viewport',panels:planned})).toBe(true);
        workspace.setCanvasSize({width:899,availableWidth:899,height:906,visibleHeight:828});
        const {artifacts,viewport}=workspace.getSnapshot();
        expect(artifacts).toHaveLength(6);
        expect(artifacts[5].containerSpec.html).toContain('data-sherlock-market="events"');
        for(const n of artifacts)expect((n.x+n.width/2)*viewport.scale+viewport.x).toBeLessThanOrEqual(867);
        expect((artifacts[5].y+artifacts[5].height/2)*viewport.scale+viewport.y).toBeLessThanOrEqual(742);
        // Prior builds stored an automatic prepared layout as "manual". Restore
        // that exact top-left fit, then verify it is upgraded on the next open.
        const left=Math.min(...artifacts.map(n=>n.x-n.width/2));
        const top=Math.min(...artifacts.map(n=>n.y-n.height/2));
        const legacyScale=.9319196428571429;
        workspace.setViewport({scale:legacyScale,x:32-left*legacyScale,y:32-top*legacyScale});
        workspace.persist();
        expect(JSON.parse(storage.getItem('sherlock.research.canvas.viewport.v1:medical-viewport')).mode).toBe('manual');
        const reopened=client.createResearchWorkspaceSession(storage,'medical-viewport');
        reopened.setCanvasSize({width:899,availableWidth:899,height:906,visibleHeight:828});
        const restored=reopened.getSnapshot();
        for(const n of restored.artifacts)expect((n.x+n.width/2)*restored.viewport.scale+restored.viewport.x).toBeLessThanOrEqual(867);
        expect((restored.artifacts[5].y+restored.artifacts[5].height/2)*restored.viewport.scale+restored.viewport.y).toBeLessThanOrEqual(742);
        const manual={...restored.viewport,x:restored.viewport.x+40};
        reopened.setViewport(manual);
        reopened.persist();
        const deliberate=client.createResearchWorkspaceSession(storage,'medical-viewport');
        deliberate.setCanvasSize({width:899,availableWidth:899,height:906,visibleHeight:828});
        expect(deliberate.getSnapshot().viewport).toEqual(manual);
    });
    it('uses S M L sizes and retains full content while capping arranged frames at L', async () => {
        const input = { requestId: 'sizes', title: '工作台', panels: [0,1,2,3].map((n) => ({ ...panel(n), size: n === 0 ? 'small' : n === 1 ? 'medium' : 'large' })) };
        const planned = layoutWorkbench(validateWorkbench(input).panels);
        expect(planned.map(p => p.height)).toEqual([220,352,456,352]);
        const client = await bundle(), workspace = client.createResearchWorkspaceSession(store(), 'sizes');
        workspace.applyWorkbench({ id: 'sizes', panels: planned.map((p,i) => ({ ...p, nodeId: `s${i}`, taskId: `t${i}` })) });
        workspace.updateNodeGeometry('s0', { height: 3500, sizeMode: 'auto' });
        // A tall automatic S card upgrades both axes to L; 320×456 is not a valid preset.
        expect(workspace.getSnapshot().artifacts[0]).toMatchObject({ width: 320, height: 220, sizeMode: 'auto' });
        const times = workspace.getSnapshot().artifacts.map(p => p.workbenchRevealAt);
        expect(times[1]-times[0]).toBeGreaterThanOrEqual(120);
        workspace.organizeCanvas(new Map([['s0', {width: 720, height: 3500}]]));
        const nodes = workspace.getSnapshot().artifacts;
        expect(nodes.map(n=>n.height)).toEqual([220,220,220,220]);
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

it('fits measured HTML content and moves following rows while preserving manual resize', async () => {
    const client = await bundle(), storage = store();
    const html = '<main>可核验的内容</main>';
    const nodes = [0,1,2,3].map(i => ({id:`fit${i}`,kind:'generated-container',messageId:`fit${i}`,title:'面板',excerpt:'内容',generationStatus:'completed',sourceNodeIds:[],containerPrompt:'监控',refreshMinutes:0,width:656,height:220,x:(i%2)*672+328,y:i<2?142:378,sizeMode:'auto',containerSizePreset:'medium',workbenchId:'fit',containerSpec:{version:1,type:'html',title:'面板',html}}));
    storage.setItem('sherlock.research.canvas.artifacts.v1:fit', JSON.stringify(nodes));
    const workspace = client.createResearchWorkspaceSession(storage,'fit');
    expect(workspace.fitHtmlContent('fit0',html,{width:656,height:400})).toBe(true);
    expect(workspace.getSnapshot().artifacts.map(n=>n.y)).toEqual([232,142,558,558]);
    expect(workspace.fitHtmlContent('fit1',html,{width:656,height:300})).toBe(true);
    expect(workspace.getSnapshot().artifacts[2].y).toBe(558);
    workspace.resizeNode('fit0','se',{x:0,y:-200},1);
    expect(workspace.fitHtmlContent('fit0',html,{width:656,height:1100})).toBe(false);
    expect(workspace.getSnapshot().artifacts[0].height).toBe(220);
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

it('aligns a workbench into two columns as each component finishes, including failures', () => {
  const nodes=Array.from({length:6},(_,i)=>({id:String(i),workbenchId:'w',workbenchIndex:i,generationStatus:i===5?'running':'completed',x:328,y:i*472+228,width:656,height:456,size:'large'}));
  const before={artifacts:nodes,canvasSize:{width:1000,height:800}};
  const after={...before,artifacts:nodes.map(n=>({...n,generationStatus:n.id==='5'?'failed':'completed'}))};
  const settled=settleWorkbenchLayout(before,after);
  expect(new Set(settled.artifacts.map(n=>n.x))).toEqual(new Set([328,1000]));
  expect(new Set(settled.artifacts.map(n=>n.y)).size).toBe(3);
  expect(settleWorkbenchLayout(settled,settled)).toBe(settled);
  expect(settleWorkbenchLayout(before,before)).toBe(before);
});

it('opens a dense Figma-sized workbench at readable scale while leaving later cards pannable', () => {
  const nodes=Array.from({length:10},(_,i)=>({workbenchIndex:i,x:448,y:72+i*160,width:896,height:144}));
  const viewport=readableWorkbenchViewport(nodes,{x:0,y:0,scale:1},{width:1088,height:800});
  expect(viewport.scale).toBe(1);
  expect(nodes[0].x*viewport.scale+viewport.x).toBeCloseTo(544);
  expect((nodes[0].y-72)*viewport.scale+viewport.y).toBeCloseTo(64);
  expect((nodes.at(-1).y+72)*viewport.scale+viewport.y).toBeGreaterThan(800);
  expect(nodes.every(n=>n.width===896&&n.height===144)).toBe(true);
});

it('shows all three source-sized financial cards when they fit at readable scale', () => {
  const marker='<body data-sherlock-design="21m-20260923-v1">';
  const nodes=[
    {workbenchIndex:0,x:448,y:72,width:896,height:144},
    {workbenchIndex:1,x:268,y:292,width:536,height:264},
    {workbenchIndex:2,x:820,y:289,width:536,height:258}
  ].map(n=>({...n,containerSpec:{type:'html',html:marker}}));
  const viewport=readableWorkbenchViewport(nodes,{x:0,y:0,scale:1},{width:896,height:760});
  expect(viewport.scale).toBeGreaterThan(.7);
  expect((nodes[0].x-nodes[0].width/2)*viewport.scale+viewport.x).toBeGreaterThanOrEqual(31);
  expect((nodes[2].x+nodes[2].width/2)*viewport.scale+viewport.x).toBeLessThanOrEqual(865);
});

it('keeps a complete event strip above the floating canvas toolbar', () => {
  const marker='<body data-sherlock-design="21m-20260923-v1">';
  const nodes=[
    {workbenchIndex:0,x:448,y:72,width:896,height:144},
    {workbenchIndex:1,x:268,y:288,width:536,height:264},
    {workbenchIndex:2,x:722,y:288,width:348,height:264},
    {workbenchIndex:3,x:268,y:561,width:536,height:258},
    {workbenchIndex:4,x:722,y:561,width:348,height:258},
    {workbenchIndex:5,x:448,y:757,width:896,height:110}
  ].map((n,i)=>({...n,containerSpec:{type:'html',html:marker+(i===5?'<section data-sherlock-market="events">':'')}}));
  // The host has already removed the toolbar's 88px from the on-screen canvas.
  const viewport=readableWorkbenchViewport(nodes,{x:0,y:0,scale:1},{width:897,height:740});
  expect(viewport.scale).toBeGreaterThanOrEqual(.81);
  expect((nodes[0].y-nodes[0].height/2)*viewport.scale+viewport.y).toBeGreaterThanOrEqual(31);
  expect((nodes[5].y+nodes[5].height/2)*viewport.scale+viewport.y).toBeLessThanOrEqual(728);
  const compact=readableWorkbenchViewport(nodes,{x:0,y:0,scale:1},{width:820,height:658});
  expect(compact.scale).toBeGreaterThan(.70);
  expect((nodes[5].y+nodes[5].height/2)*compact.scale+compact.y).toBeLessThanOrEqual(642);
});


it('桥接计划只携带用户明确选择的主题，不遗漏也不泄漏原始文件路径',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sherlock-workbench-theme-'));let tool,handler
 const ctx={agents:{get:()=>({})},tools:{register:t=>{tool=t;return()=>{}}},webServer:{register:r=>{handler=r.handler;return()=>{}}}}
 const dispose=await registerWorkbench(ctx,{start:async request=>({taskId:request.canvasNodeId})},{filePath:join(dir,'plans.json'),isTrustedRequest:()=>true,readJsonBody:async()=>({parentSessionId:'parent'})})
 try{
 const session={id:'parent',events:[{type:'user/message',data:{id:'human-style',source:{kind:'user'},content:[{type:'text',text:'做一个部门结构工作台，用易方达模式。'}]}}]}
 await tool.execute({title:'主题测试',panels:[toolPanel(0),toolPanel(1)],requestedStyle:'dark'},{agent:{session}})
 let result;await handler({method:'POST'},{writeHead:()=>{},end:body=>result=JSON.parse(body)})
 expect(result.plans[0].requestedStyle).toBe('enterprise')
 expect(result.plans[0]).not.toHaveProperty('originalRequest')
 }finally{await dispose();await rm(dir,{recursive:true,force:true})}
},10000)
