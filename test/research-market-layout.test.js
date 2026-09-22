import {describe,it,expect} from 'vitest';
import {researchBentoLayout} from '../packages/dsh-research-task-runtime/bento-layout.js';
const market=(variant,extra='')=>({version:1,type:'html',html:`<body data-sherlock-market="${variant}">${extra}</body>`});
const node=(id,spec)=>({id,kind:'generated-container',sizeMode:'auto',generationStatus:'completed',containerSpec:spec});
describe('source market workbench completion layout',()=>{
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
    const r=researchBentoLayout([pending],{width:740,height:736});expect(r.nodes[0]).toMatchObject({width:280,height:200});
    const manual={...node('manual',market('metrics')),sizeMode:'manual',width:656,height:456};
    expect(researchBentoLayout([manual],{width:740,height:736}).nodes[0]).toMatchObject({width:656,height:456});
  });
});
