import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { researchBentoLayout } from '../packages/dsh-research-task-runtime/bento-layout.js';
import { patchFigmaFinalCanvas } from '../scripts/lib/figma-canvas-client.mjs';
const nodes = ['large','large','small','small','small'].map((size,index)=>({id:String(index),containerSizePreset:size,content:'原始数据'+index}));
describe('Figma 46 chooses grid columns from the actual visible canvas',()=>{
  it('preserves the viewport and component coordinates when Figma 66 panes resize',async()=>{
    const source=patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'));
    const extract=name=>{const start=source.indexOf('function '+name+'(');let at=source.indexOf('{',start),depth=1;for(at++;depth;at++){if(source[at]==='{')depth++;if(source[at]==='}')depth--;}return source.slice(start,at);};
    const fit=runInNewContext(extract('researchWorkbenchViewport')+'\n'+extract('researchCanvasViewportForAreaChange')+'\nresearchCanvasViewportForAreaChange',{RESEARCH_CANVAS_MIN_SCALE:.1});
    const snapshot={canvasSize:{width:1508,height:844,availableWidth:1508},viewport:{x:100,y:80,scale:1},files:[],artifacts:[{x:400,y:300,width:656,height:456},{x:1060,y:300,width:320,height:220}]};
    const before=JSON.stringify(snapshot.artifacts);
    for(const availableWidth of [1090,388,728]){
      const result=fit(snapshot,{width:1508,height:844,availableWidth});
      expect(result).toBe(snapshot.viewport);
    }
    expect(JSON.stringify(snapshot.artifacts)).toBe(before);
    expect(fit(snapshot,snapshot.canvasSize)).toBe(snapshot.viewport);
    expect(source).toContain("querySelector('.t8lSSG_panel:not(.t8lSSG_panelHidden)')");
  });
  it('opens an empty container as S without resizing existing content',async()=>{
    const source=patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'));
    let descriptor;runInNewContext(source,{window:{__ModuleLoader__:{load:value=>descriptor=value}},URL,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout});
    let fallback;fallback=new Proxy(function(){},{get:()=>fallback,apply:()=>fallback});const client=descriptor.factory(()=>fallback);
    const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
    const workspace=client.createResearchWorkspaceSession(storage,'small-draft');workspace.setCanvasSize({width:1088,availableWidth:728,height:800});
    const first=workspace.createContainerDraft();
    expect(first).toMatchObject({width:320,height:220,containerSizePreset:'small',generationStatus:'draft'});
    workspace.updateNodeGeometry(first.id,{width:656,height:456,sizeMode:'manual'});
    const before=JSON.stringify(workspace.getSnapshot().artifacts[0]);
    expect(workspace.createContainerDraft()).toMatchObject({width:320,height:220,containerSizePreset:'small'});
    expect(JSON.stringify(workspace.getSnapshot().artifacts[0])).toBe(before);
  });
  it('packs two L and three S into two visible columns when the right panel covers the third',()=>{
    const result=researchBentoLayout(nodes,{width:1088,availableWidth:728,height:800});
    expect(result.width).toBe(656);
    expect(result.nodes.map(({x,y,width,height})=>({x,y,width,height}))).toEqual([
      {x:0,y:0,width:656,height:456},{x:0,y:472,width:656,height:456},
      {x:0,y:944,width:320,height:220},{x:336,y:944,width:320,height:220},{x:0,y:1180,width:320,height:220}
    ]);
    expect(result.nodes.map(n=>n.content)).toEqual(nodes.map(n=>n.content));
    for(const node of result.nodes){
      expect(node.x*result.viewport.scale+result.viewport.x).toBeGreaterThanOrEqual(32-1e-6);
      expect((node.x+node.width)*result.viewport.scale+result.viewport.x).toBeLessThanOrEqual(728-32+1e-6);
      expect(node.y*result.viewport.scale+result.viewport.y).toBeGreaterThanOrEqual(32-1e-6);
      expect((node.y+node.height)*result.viewport.scale+result.viewport.y).toBeLessThanOrEqual(800-32+1e-6);
    }
  });
  it('restores the third column only when that space is visible, retaining same-size order',()=>{
    const result=researchBentoLayout(nodes,{width:1088,availableWidth:1088,height:800});
    expect(result.width).toBe(992);expect(result.nodes.map(n=>n.id)).toEqual(nodes.map(n=>n.id));
    expect(result.nodes.slice(2).map(({x,y})=>({x,y}))).toEqual([{x:672,y:0},{x:672,y:236},{x:672,y:472}]);
    expect(researchBentoLayout(nodes,{width:1088,height:800})).toEqual(result);
    expect(researchBentoLayout(nodes,{width:1088,availableWidth:4000,height:800})).toEqual(result);
  });
  it('keeps L world geometry on a narrow viewport and fits the canvas instead of shrinking content',()=>{
    const result=researchBentoLayout(nodes.slice(0,1),{width:1088,availableWidth:520,height:800});
    expect(result.nodes[0]).toMatchObject({width:656,height:456});
    expect(result.viewport.scale).toBeCloseTo((520-64)/656);
  });
  it('fits organize within the visible area while the default generation policy remains unchanged',async()=>{
    const source=patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'));
    let descriptor;runInNewContext(source,{window:{__ModuleLoader__:{load:value=>descriptor=value}},URL,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout});
    let fallback;fallback=new Proxy(function(){},{get:()=>fallback,apply:()=>fallback});const client=descriptor.factory(()=>fallback);
    const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
    const artifacts=nodes.map((node,index)=>({...node,kind:'generated-container',messageId:node.id,title:'内容'+index,excerpt:node.content,containerPrompt:'内容',refreshMinutes:0,sourceNodeIds:[],generationStatus:'completed',containerSpec:{version:1,type:'markdown',title:'内容',content:node.content},x:500,y:500,width:index<2?656:320,height:index<2?456:220,sizeMode:'auto'}));
    storage.setItem('sherlock.research.canvas.artifacts.v1:visible',JSON.stringify(artifacts));const workspace=client.createResearchWorkspaceSession(storage,'visible');workspace.setCanvasSize({width:1088,availableWidth:728,height:800});
    workspace.organizeCanvas();const arranged=workspace.getSnapshot().artifacts;
    const {viewport}=workspace.getSnapshot();
    expect(viewport.scale).toBeGreaterThan(researchBentoLayout(nodes,{width:728,height:800-88}).viewport.scale);
    for(const n of arranged){
      expect(viewport.x+(n.x-n.width/2)*viewport.scale).toBeGreaterThanOrEqual(32-1e-6);
      expect(viewport.x+(n.x+n.width/2)*viewport.scale).toBeLessThanOrEqual(728-32+1e-6);
      expect(viewport.y+(n.y+n.height/2)*viewport.scale).toBeLessThanOrEqual(800-88-32+1e-6);
    }
    expect(arranged.map(n=>n.containerSpec.content)).toEqual(nodes.map(n=>n.content));
    const before=JSON.stringify(arranged);workspace.organizeCanvas();expect(JSON.stringify(workspace.getSnapshot().artifacts)).toBe(before);
  });
});
