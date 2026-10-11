import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';

describe('research canvas pointer resize', () => {
  it('changes only the dragged card, even when it grows into the next workbench row', async () => {
    const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8');
    expect(source).toContain('applyPointerGeometry');
    const window = new Window();
    let descriptor;
    runInNewContext(source, { document:window.document, window:{__ModuleLoader__:{load:value=>{descriptor=value;}}},
      URL, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout });
    let fallback;
    fallback = new Proxy(function () {}, { get:() => fallback, apply:() => fallback });
    const values = new Map();
    const storage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);return true;}};
    const workspace = descriptor.factory(() => fallback).createResearchWorkspaceSession(storage, 'pointer-resize-isolated');
    const artifact = (id, index, x, y, width, height) => ({
      id, messageId:id, kind:'generated-container', title:id, excerpt:'模拟数据', containerPrompt:id,
      generationStatus:'completed', generationCompletedAt:1, refreshMinutes:0, sourceNodeIds:[],
      containerSpec:{version:1,type:'html',title:id,html:`<body data-sherlock-market="${index?'candlestick':'metrics'}" data-sherlock-design="21m-20260923-v1"></body>`},
      workbenchId:'market-board',workbenchIndex:index,x,y,width,height,sizeMode:'auto'
    });
    workspace.setArtifacts([artifact('metrics',0,448,72,896,144),artifact('candlestick',1,268,288,536,264)]);
    const before = workspace.getSnapshot().artifacts;
    const first = before[0], peer = before[1];
    for (const growth of [40,80,120])
      workspace.applyPointerGeometry([{...first,x:first.x+growth/2,y:first.y+growth/2,
        width:first.width+growth,height:first.height+growth,sizeMode:'manual'}]);
    const after = workspace.getSnapshot().artifacts;
    expect(after[0]).toMatchObject({width:first.width+120,height:first.height+120,sizeMode:'manual'});
    expect(after[1]).toMatchObject({x:peer.x,y:peer.y,width:peer.width,height:peer.height});
    expect(workspace.fitHtmlContent(first.id, first.containerSpec.html, {width:1000,height:500})).toBe(false);
    expect(workspace.getSnapshot().artifacts[1]).toMatchObject({x:peer.x,y:peer.y});
    window.happyDOM.abort();
  });
});
