import {describe,it,expect} from 'vitest';
import {researchBentoLayout} from '../packages/dsh-research-task-runtime/bento-layout.js';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {Window} from 'happy-dom';
import {patchFigmaFinalCanvas} from '../scripts/lib/figma-canvas-client.mjs';
const market=(variant,extra='')=>({version:1,type:'html',html:`<body data-sherlock-market="${variant}">${extra}</body>`});
const node=(id,spec)=>({id,kind:'generated-container',sizeMode:'auto',generationStatus:'completed',containerSpec:spec});
describe('source market workbench completion layout',()=>{
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
