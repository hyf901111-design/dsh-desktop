import {createRequire} from 'node:module';
import {stripConversationLiveUi} from './fixtures/strip-conversation-live-ui.mjs';
import {stripWorkbenchReplay} from './fixtures/strip-workbench-replay.mjs';
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';
import { researchBentoLayout } from '../packages/dsh-research-task-runtime/bento-layout.js';
import { patchFigmaFinalCanvas } from '../scripts/lib/figma-canvas-client.mjs';
import { restoreResearchGridWorkbench } from '../scripts/lib/research-grid-workbench.mjs';

const makeNodes = sizes => sizes.map((size, index) => ({ id:String(index), containerSizePreset:size, content:'内容'+index, sourceNodeIds:['reference'], x:500+index,y:500+index }));
const figma = makeNodes(['large','small','small','medium','small']);
const native = makeNodes(['large','medium','medium','large','small','large']);
const screenBounds = result => result.nodes.map(n=>({left:result.viewport.x+n.x*result.viewport.scale,top:result.viewport.y+n.y*result.viewport.scale,right:result.viewport.x+(n.x+n.width)*result.viewport.scale,bottom:result.viewport.y+(n.y+n.height)*result.viewport.scale}));

async function patchedWorkspace() {
  const require=createRequire(import.meta.url);
  let installed=stripConversationLiveUi(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'));
  for(const [file,strip] of [['board-tabs-client','stripBoardTabsClient'],['conversation-history-page','stripConversationHistoryClient'],['conversation-submission','stripConversationSubmission'],['conversation-response-progress','stripConversationResponseProgress'],['plain-slash-input','stripPlainSlashInput'],['sidebar-new-note','stripSidebarNewNoteConversation'],['pptx-annotation-message','stripPptxAnnotationMessages'],['pptx-annotation-native','stripPptxAnnotationInput'],['home-guide-presentation-native','stripHomeGuidePresentationNative'],['home-guide-native','stripHomeGuideNative']]){if(file==='home-guide-presentation-native')installed=stripWorkbenchReplay(installed);installed=require('../scripts/lib/'+file+'.mjs')[strip](installed)}

  const source=patchFigmaFinalCanvas(restoreResearchGridWorkbench(installed));
  // Simulate an installed old final-marker wrapper, not only fresh source.
  const old=source.replace('researchBentoLayout(nodes, researchCanvasVisibleArea({canvasSize}), measured, {fitColumns:true})','researchBentoLayout(nodes, canvasSize, measured)');
  const upgraded=patchFigmaFinalCanvas(old);
  expect(patchFigmaFinalCanvas(upgraded)).toBe(upgraded);
  const window=new Window();
  let descriptor;window.__ModuleLoader__={load:v=>descriptor=v};runInNewContext(upgraded,{WorkbenchIcon:()=>null,document:window.document,window,Event:window.Event,CustomEvent:window.CustomEvent,URL,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout});
  let fallback;fallback=new Proxy(function(){},{get:()=>fallback,apply:()=>fallback});
  const client=descriptor.factory(()=>fallback);
  const values=new Map(), storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);return true}};
  return client.createResearchWorkspaceSession(storage,'fit');
}

describe('D69 arrange fits columns in the unobstructed viewport',()=>{
  it('fits the Figma five cards into three world columns even though 992 exceeds the 940px pane',()=>{
    const result=researchBentoLayout(figma,{width:940,height:736},new Map(),{fitColumns:true});
    expect(result.width).toBe(992);expect(result.height).toBe(692);
    expect(result.viewport.scale).toBeCloseTo(876/992);
    expect(result.nodes.map(n=>[n.x,n.y])).toEqual([[0,0],[672,0],[672,236],[0,472],[672,472]]);
    expect(result.nodes.map(n=>n.id)).toEqual(figma.map(n=>n.id));
  });
  it('selects four columns for native six cards, improving fit without hardcoding three columns',()=>{
    const result=researchBentoLayout(native,{width:740,height:736},new Map(),{fitColumns:true});
    expect(result.width).toBe(1328);expect(result.height).toBe(1164);
    expect(result.viewport.scale).toBeCloseTo(676/1328);
    expect(Math.max(...screenBounds(result).map(r=>r.bottom))).toBeLessThan(824-72);
    expect(result.nodes.map(n=>n.content)).toEqual(native.map(n=>n.content));
    expect(result.nodes.every(n=>n.sourceNodeIds===native[Number(n.id)].sourceNodeIds)).toBe(true);
  });
  it('keeps the default generation policy unchanged and never changes world sizes or overlaps cards',()=>{
    expect(researchBentoLayout(figma,{width:940,height:824})).toMatchObject({width:656,height:1164});
    for(const width of [520,740,940,1280]) for(const height of [440,736]) {
      const result=researchBentoLayout(native,{width:1380,availableWidth:width,height},new Map(),{fitColumns:true});
      for(const rect of screenBounds(result)){expect(rect.left).toBeGreaterThanOrEqual(32-1e-6);expect(rect.right).toBeLessThanOrEqual(width-32+1e-6);expect(rect.top).toBeGreaterThanOrEqual(32-1e-6);expect(rect.bottom).toBeLessThanOrEqual(height-32+1e-6);}
      for(const a of result.nodes) for(const b of result.nodes) if(a!==b) expect(a.x+a.width+16<=b.x||b.x+b.width+16<=a.x||a.y+a.height+16<=b.y||b.y+b.height+16<=a.y).toBe(true);
      expect(result.nodes.map(n=>[n.width,n.height])).toEqual([[656,456],[656,220],[656,220],[656,456],[320,220],[656,456]]);
      expect(researchBentoLayout(result.nodes,{width:1380,availableWidth:width,height},new Map(),{fitColumns:true})).toEqual(result);
    }
  });
  it('upgrades old final-marker wrappers, reserves the toolbar once, and preserves selection and one-step undo',async()=>{
    const workspace=await patchedWorkspace();
    workspace.setCanvasSize({width:740,height:824});
    workspace.setArtifacts(native.map(n=>({...n,kind:'generated-container',creationMode:'selection',messageId:n.id,title:n.id,excerpt:n.content,containerPrompt:'内容',refreshMinutes:0,generationStatus:'completed',containerSpec:{version:1,type:'markdown',title:n.id,content:n.content},width:n.containerSizePreset==='small'?320:656,height:n.containerSizePreset==='large'?456:220,sizeMode:'manual'})));
    workspace.updateSelection(['0','3'],'replace');
    const before=JSON.parse(JSON.stringify(workspace.getSnapshot()));
    expect(before.artifacts.every(n=>n.sourceNodeIds?.[0]==='reference')).toBe(true);
    expect(workspace.organizeCanvas()).toBe(true);
    const after=workspace.getSnapshot();
    const expected=researchBentoLayout(before.artifacts,{width:740,height:736},new Map(),{fitColumns:true});
    expect(after.viewport).toEqual(expected.viewport);
    expect(after.selection).toEqual(before.selection);
    expect(after.artifacts.map(n=>[n.id,n.excerpt,n.sourceNodeIds])).toEqual(before.artifacts.map(n=>[n.id,n.excerpt,n.sourceNodeIds]));
    workspace.undo();expect(workspace.getSnapshot().artifacts).toEqual(before.artifacts);
  });
  it('leaves an empty organize inert and repeat organize stable',async()=>{
    const workspace=await patchedWorkspace();expect(workspace.organizeCanvas()).toBe(false);
    workspace.setCanvasSize({width:940,height:824});
    workspace.setArtifacts(figma.map(n=>({...n,kind:'generated-container',creationMode:'selection',messageId:n.id,title:n.id,excerpt:n.content,containerPrompt:'内容',refreshMinutes:0,generationStatus:'completed',containerSpec:{version:1,type:'markdown',title:n.id,content:n.content},width:n.containerSizePreset==='small'?320:656,height:n.containerSizePreset==='large'?456:220,sizeMode:'manual'})));
    workspace.organizeCanvas();const before=JSON.stringify(workspace.getSnapshot().artifacts),view={...workspace.getSnapshot().viewport};
    workspace.organizeCanvas();expect(JSON.stringify(workspace.getSnapshot().artifacts)).toBe(before);expect(workspace.getSnapshot().viewport).toEqual(view);
  });
});
