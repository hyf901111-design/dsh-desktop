import {describe,it,expect} from 'vitest';
import {researchBentoLayout,researchMarketDimensions} from '../packages/dsh-research-task-runtime/bento-layout.js';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {Window} from 'happy-dom';
import {patchFigmaFinalCanvas} from '../scripts/lib/figma-canvas-client.mjs';
const market=(variant,extra='')=>({version:1,type:'html',html:`<body data-sherlock-market="${variant}">${extra}</body>`});
const node=(id,spec)=>({id,kind:'generated-container',sizeMode:'auto',generationStatus:'completed',containerSpec:spec});
describe('source market workbench completion layout',()=>{
  it('upgrades an already patched client so fund cards keep their 132px resize minimum',async()=>{
    const current=patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'));
    const old=current.replace(/\/\* ODYSSEY_MARKET_METRICS_RESIZE \*\/[\s\S]*?(?=function normalizeResearchCanvasNodeGeometry)/,
      '/* ODYSSEY_MARKET_METRICS_RESIZE */\nfunction researchCanvasMinimumHeight(node,policy){return policy.minHeight}\n');
    const upgraded=patchFigmaFinalCanvas(old);
    expect(patchFigmaFinalCanvas(upgraded)).toBe(upgraded);
    const start=upgraded.indexOf('function researchCanvasMinimumHeight');
    const end=upgraded.indexOf('function normalizeResearchCanvasNodeGeometry',start);
    const minimum=new Function('researchMarketDimensions',upgraded.slice(start,end)+'\nreturn researchCanvasMinimumHeight')(researchMarketDimensions);
    const fund=node('fund',{type:'html',html:'<body data-sherlock-market="fund-kpi" data-sherlock-design="21m-20260923-v1"><div class="fund-kpi"></div></body>'});
    expect(minimum(fund,{minHeight:220})).toBe(132);
    expect(minimum({...fund,containerSpec:{type:'html',html:'<body data-sherlock-market="fund-kpi" data-sherlock-design="21m-20260923-v1">'+Array(6).fill('<div class="fund-kpi"></div>').join('')+'</body>'}},{minHeight:220})).toBe(208);
  });
  it('keeps later workbench cards fixed when a source card is manually enlarged',async()=>{
    const source=patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'));
    let descriptor;const win=new Window();
    runInNewContext(source,{document:win.document,window:{__ModuleLoader__:{load:d=>descriptor=d}},URL,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout});
    let fallback;fallback=new Proxy(function(){},{get:()=>fallback,apply:()=>fallback});
    const values=new Map(),store={getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);return true}};
    const workspace=descriptor.factory(()=>fallback).createResearchWorkspaceSession(store,'fund-resize-reflow');
    const spec={version:1,type:'html',title:'概览',html:'<body data-sherlock-market="fund-kpi" data-sherlock-design="21m-20260923-v1"><div class="fund-kpi"></div></body>'};
    const top={...node('top',spec),title:'概览',messageId:'top',sourceNodeIds:[],excerpt:'模拟数据',containerPrompt:'基金概览',refreshMinutes:0,workbenchId:'fund',workbenchIndex:0,x:448,y:66,width:896,height:132};
    const lower={...node('lower',{version:1,type:'html',title:'持仓',html:'<body data-sherlock-market="fund-holdings" data-sherlock-design="21m-20260923-v1"><table><thead><tr><th>名称</th></tr></thead><tbody><tr><td>基金</td></tr></tbody></table></body>'}),title:'持仓',messageId:'lower',sourceNodeIds:[],excerpt:'模拟数据',containerPrompt:'基金持仓',refreshMinutes:0,workbenchId:'fund',workbenchIndex:1,x:278,y:348,width:556,height:400};
    workspace.setArtifacts([top,lower]);
    const before=workspace.getSnapshot().artifacts;
    expect(before.map(n=>n.id)).toEqual(['top','lower']);
    const first=before.find(n=>n.id==='top'),second=before.find(n=>n.id==='lower');
    workspace.applyPointerGeometry([{...first,y:first.y+44,height:first.height+88,sizeMode:'manual'}]);
    const after=workspace.getSnapshot().artifacts;
    const resized=after.find(n=>n.id==='top'),shifted=after.find(n=>n.id==='lower');
    expect(resized.height).toBe(220);
    expect(shifted).toMatchObject({x:second.x,y:second.y,width:second.width,height:second.height});
    win.happyDOM.abort();
  });
  it('persists the source dimensions through the real workspace normalization and arrange path',async()=>{
    const source=patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'));
    expect(patchFigmaFinalCanvas(source)).toBe(source);
    let descriptor;const win=new Window();runInNewContext(source,{document:win.document,window:{__ModuleLoader__:{load:d=>descriptor=d}},URL,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout});
    let fallback;fallback=new Proxy(function(){},{get:()=>fallback,apply:()=>fallback});
    const values=new Map(),store={getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);return true}};
    const workspace=descriptor.factory(()=>fallback).createResearchWorkspaceSession(store,'market-regression');
    workspace.setCanvasSize({width:740,height:824});
    const nodes=[node('kpi',{version:1,type:'kpi',title:'指标',items:Array.from({length:6},()=>({label:'数据',value:'1'}))}),node('breadth',{...market('breadth'),title:'广度'})].map(n=>({...n,messageId:n.id,title:n.id,sourceNodeIds:[],excerpt:'样式对照',containerPrompt:'保留原稿',refreshMinutes:0,x:400,y:400,width:656,height:220}));
    workspace.setArtifacts(nodes);expect(workspace.getSnapshot().artifacts).toHaveLength(2);expect(workspace.organizeCanvas()).toBe(true);
    workspace.setArtifacts(workspace.getSnapshot().artifacts);
    expect(workspace.getSnapshot().artifacts.map(n=>[n.width,n.height,n.sizeMode])).toEqual([[896,144,'auto'],[896,110,'auto']]);
    expect(workspace.fitHtmlContent('breadth',nodes[1].containerSpec.html,{width:896,height:110})).toBe(false);
    expect(workspace.getSnapshot().artifacts[1]).toMatchObject({width:896,height:110});
    workspace.organizeCanvas();expect(workspace.getSnapshot().artifacts.map(n=>[n.width,n.height])).toEqual([[896,144],[896,110]]);
    win.happyDOM.abort();
  });
  it('keeps the six source panels at their source dimensions and 12px gaps',()=>{
    const nodes=[node('metrics',market('metrics')),node('candle',market('candlestick')),node('quotes',market('table','<thead><tr><th></th><th></th><th></th><th></th></tr></thead>')),node('heat',market('heatmap')),node('trades',market('table','<thead><tr><th></th><th></th><th></th><th></th><th></th></tr></thead>')),node('breadth',market('breadth'))];
    const r=researchBentoLayout(nodes,{width:740,height:736});
    expect(r.nodes.map(n=>[n.x,n.y,n.width,n.height])).toEqual([[0,0,896,144],[0,156,562,264],[574,156,322,264],[0,432,434,258],[446,432,450,258],[0,702,896,110]]);
    expect(r.width).toBe(896);expect(r.height).toBe(812);
    expect(r.nodes.map(n=>n.containerSpec)).toEqual(nodes.map(n=>n.containerSpec));
  });
  it('uses a single six-metric strip when the model returns native KPI alongside market panels',()=>{
    const nodes=[node('kpi',{type:'kpi',items:Array.from({length:6},()=>({label:'数据',value:'1'}))}),node('table',market('table','<thead><th></th><th></th><th></th><th></th></thead>'))];
    const r=researchBentoLayout(nodes,{width:740,height:736});
    expect(r.nodes.map(n=>[n.width,n.height])).toEqual([[896,144],[322,264]]);
    expect(researchBentoLayout(r.nodes,{width:740,height:736})).toEqual(r);
  });
  it('does not apply a completed market layout to pending or user-drawn cards',()=>{
    const pending={...node('pending',null),generationStatus:'running'};
    const r=researchBentoLayout([pending],{width:740,height:736});expect(r.nodes[0]).toMatchObject({width:320,height:220});
    const manual={...node('manual',market('metrics')),sizeMode:'manual',width:656,height:456};
    expect(researchBentoLayout([manual],{width:740,height:736}).nodes[0]).toMatchObject({width:656,height:456});
  });
});
