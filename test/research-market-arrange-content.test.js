import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';
import { researchBentoLayout } from '../packages/dsh-research-task-runtime/bento-layout.js';
import { patchFigmaFinalCanvas } from '../scripts/lib/figma-canvas-client.mjs';

const html = (variant, extra = '') => `<body data-sherlock-market="${variant}" data-sherlock-design="21m-20260923-v1">${extra}</body>`;
const panel = (id, variant, width, height, extra = '') => ({
  id, kind: 'generated-container', sizeMode: 'auto', generationStatus: 'completed',
  containerSpec: { version: 1, type: 'html', title:id, html: html(variant, extra) },
  x: 500, y: 500, width, height
});

const panels = [
  panel('metrics', 'metrics', 896, 144),
  panel('candlestick', 'candlestick', 536, 264),
  panel('heatmap', 'heatmap', 434, 258),
  panel('breadth', 'breadth', 896, 220),
  panel('table', 'table', 536, 258, '<thead><tr><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr></thead>'),
  panel('trend', 'trend', 536, 264)
];

describe('financial workbench arrange keeps content-sized frames', () => {
  it('keeps source dimensions for auto cards when one peer was manually resized', () => {
    const input = panels.map(node => node.id === 'heatmap' ? { ...node, sizeMode: 'manual' } : node);
    const result = researchBentoLayout(input, { width: 1200, height: 1200 }, new Map(), { fitColumns: true });
    expect(result.nodes.map(({ id, x, y, width, height }) => [id, x, y, width, height])).toEqual([
      ['metrics', 0, 0, 896, 144],
      ['candlestick', 0, 156, 536, 304],
      ['heatmap', 548, 156, 434, 258],
      ['breadth', 0, 472, 896, 220],
      ['table', 0, 704, 536, 258],
      ['trend', 548, 704, 536, 264]
    ]);
    expect(result.nodes.find(node => node.id === 'heatmap').sizeMode).toBe('manual');
    expect(researchBentoLayout(result.nodes, { width: 1200, height: 1200 }, new Map(), { fitColumns: true })).toEqual(result);
  });

  it('restores auto card proportions after a previous generic-grid arrange', () => {
    const inflated = panels.map(node => ({...node,width:656,height:456}));
    const result = researchBentoLayout(inflated, {width:1200,height:1200}, new Map(), {fitColumns:true});
    expect(result.nodes.map(({width,height})=>[width,height])).toEqual([
      [896,144],[536,304],[434,258],[896,220],[536,258],[536,264]
    ]);
  });

  it('removes excess space from previously resized generated workbench panels', () => {
    const input = panels.map((node,index) => ({...node,workbenchId:'market-board',workbenchIndex:index,
      ...(node.id === 'metrics' ? {width:755.5,height:359.1,sizeMode:'manual'} : {}),
      ...(node.id === 'breadth' ? {width:744.9,height:240.9,sizeMode:'manual'} : {})}));
    const result = researchBentoLayout(input,{width:1200,height:1200},new Map(),{fitColumns:true});
    expect(result.nodes.map(({width,height})=>[width,height])).toEqual([
      [896,144],[536,304],[434,258],[896,220],[536,258],[536,264]
    ]);
    expect(result.nodes.map(node=>node.sizeMode)).toEqual(Array(6).fill('auto'));
  });

  it('applies the same content sizing through the real arrange action with measured cards', async () => {
    const source = patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'));
    const window = new Window();
    let descriptor;
    runInNewContext(source, { document: window.document, window: { __ModuleLoader__: { load: value => { descriptor = value; } } }, URL, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout });
    let fallback;
    fallback = new Proxy(function () {}, { get: () => fallback, apply: () => fallback });
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); return true; } };
    const workspace = descriptor.factory(() => fallback).createResearchWorkspaceSession(storage, 'mixed-market-arrange');
    workspace.setCanvasSize({ width: 1200, height: 1288 });
    workspace.setArtifacts(panels.map((node, index) => ({ ...node, messageId:node.id, title:node.id, excerpt:'模拟数据',
      containerPrompt:'模拟工作台', refreshMinutes:0, sourceNodeIds:[], workbenchId:'market', workbenchIndex:index,
      ...(node.id === 'heatmap' ? {sizeMode:'manual'} : {}) })));
    expect(workspace.getSnapshot().artifacts).toHaveLength(6);
    const measured = new Map(panels.map(node => [node.id, {width:656,height:456,sizeMode:'manual'}]));
    expect(workspace.organizeCanvas(measured)).toBe(true);
    const arranged = workspace.getSnapshot().artifacts;
    expect(arranged.map(({id,width,height})=>[id,width,height])).toEqual([
      ['metrics',896,144],['candlestick',536,304],['heatmap',434,258],
      ['breadth',896,220],['table',536,258],['trend',536,264]
    ]);
    expect(arranged.find(node => node.id === 'heatmap').sizeMode).toBe('manual');
    expect(arranged.find(node => node.id === 'metrics').sizeMode).toBe('auto');
    window.happyDOM.abort();
  });
});
