import {describe,expect,it} from 'vitest';
import {researchBentoLayout,researchMarketContentDimensions,researchMarketDimensions,researchOptimalDimensions} from '../packages/dsh-research-task-runtime/bento-layout.js';

const node=(id,spec,width=656,height=456)=>({id,kind:'generated-container',generationStatus:'completed',sizeMode:'auto',containerSpec:spec,width,height,x:500,y:500,workbenchId:'demo'});
const feed=rows=>node('feed',{type:'html',html:`<body data-research-kind="news">${'<article class="research-feed-item"></article>'.repeat(rows)}</body>`});

describe('content-sized workbench arrangement',()=>{
  it('gives old saved metrics the current enterprise row space and accounts for narrow columns',()=>{
    const html='<body data-sherlock-market="metrics"><div class="market-metrics">'+ '<div class="market-metric"></div>'.repeat(6)+'</div><footer class="market-footer"><span>2026-09-30</span><span>完整来源和单位说明</span></footer></body>';
    const old=node('old',{type:'html',html});
    expect(researchMarketDimensions(old)).toEqual({width:656,height:368});
    expect(researchMarketDimensions(old,true,320)).toEqual({width:656,height:486});
    old.sizeMode='manual';expect(researchMarketDimensions(old)).toBeNull();
    expect(researchMarketDimensions(old,true).height).toBe(368);
  });
  it('sizes short and long components from actual content without the old large-card height cap',()=>{
    expect(researchOptimalDimensions(node('short',{type:'markdown',content:'简短结论'}))).toEqual({width:320,height:220});
    expect(researchOptimalDimensions(node('news',{type:'news',items:Array.from({length:9},()=>({title:'资讯'}))}))).toEqual({width:656,height:356});
    expect(researchMarketDimensions(feed(9))).toEqual({width:656,height:356});
    expect(researchMarketContentDimensions('table',{columnCount:7,rowCount:20}).height).toBeGreaterThanOrEqual(20*26+58);
    expect(researchOptimalDimensions(node('long',{type:'markdown',content:'正文'.repeat(1800)})).height).toBeGreaterThan(2000);
  });

  it('restores oversized completed cards to their optimal frame and fills matrix holes',()=>{
    const input=[
      node('chart',{type:'chart'},900,700),
      node('short',{type:'markdown',content:'简短结论'},656,456),
      feed(8),
      node('table',{type:'table',columns:['公司','价格','涨跌','成交额','状态'],rows:Array.from({length:12},()=>['A','1','2','3','4'])}),
      node('metric',{type:'kpi',items:Array.from({length:6},()=>({label:'指标',value:'1'}))})
    ];
    const result=researchBentoLayout(input,{width:1200,height:900},new Map(),{fitColumns:true});
    expect(result.nodes.map(({id,width,height})=>[id,width,height])).toEqual([
      ['chart',656,320],['short',320,220],['feed',656,356],['table',656,380],['metric',656,212]
    ]);
    expect(result.nodes.every(n=>n.sizeMode==='auto')).toBe(true);
    for(const a of result.nodes)for(const b of result.nodes)if(a!==b)
      expect(a.x+a.width+12<=b.x||b.x+b.width+12<=a.x||a.y+a.height+12<=b.y||b.y+b.height+12<=a.y).toBe(true);
    expect(result.nodes.some(n=>n.x===0&&n.y>0)).toBe(true);
    expect(researchBentoLayout(result.nodes,{width:1200,height:900},new Map(),{fitColumns:true})).toEqual(result);
  });

  it('uses measured intrinsic height when native content needs more room',()=>{
    const short=node('short',{type:'markdown',content:'简短结论'});
    expect(researchOptimalDimensions(short,{width:320,height:470,intrinsic:true})).toEqual({width:320,height:470});
    expect(researchBentoLayout([short],{width:800,height:700},new Map([['short',{width:320,height:470,intrinsic:true}]]),{fitColumns:true}).nodes[0].height).toBe(470);
  });

  it('keeps the six-metric financial strip beside market panels',()=>{
    const metrics=node('metrics',{type:'kpi',items:Array.from({length:6},()=>({label:'指标',value:'1'}))});
    const market=node('market',{type:'html',html:'<body data-sherlock-market="breadth"></body>'});
    expect(researchBentoLayout([metrics,market],{width:1200,height:900},new Map(),{fitColumns:true}).nodes.map(n=>[n.width,n.height]))
      .toEqual([[896,144],[896,110]]);
  });

  it('keeps large canvases fast and aligned without overlapping cards',()=>{
    const cards=Array.from({length:100},(_,i)=>node(`card-${i}`,{type:'table',columns:['A','B','C','D'],rows:Array.from({length:i%10+1},()=>['1','2','3','4'])}));
    const started=performance.now();
    const {nodes:placed}=researchBentoLayout(cards,{width:1200,height:900},new Map(),{fitColumns:true});
    expect(performance.now()-started).toBeLessThan(1000);
    expect(placed).toHaveLength(100);
    for(const [i,a] of placed.entries())for(const b of placed.slice(i+1))
      expect(a.x+a.width+16<=b.x||b.x+b.width+16<=a.x||a.y+a.height+16<=b.y||b.y+b.height+16<=a.y).toBe(true);
  });
});
