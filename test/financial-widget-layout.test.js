import {it,expect} from 'vitest'
import {financialPopoverPosition} from '../scripts/lib/financial-widget-client.mjs'
import {createResearchGrid} from '../packages/dsh-research-task-runtime/research-grid.js'
import {financialWidgetDefaults,financialWidgetDimensions} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'

it('标准整理保留跨列指数和同行两列，拉齐同行底边并让独行新闻铺满',()=>{
 const grid=createResearchGrid(),nodes=['indices','watchlist','quote','news'].map(widget=>({id:widget,kind:'generated-container',containerSpec:financialWidgetDefaults(widget),preferred:financialWidgetDimensions(financialWidgetDefaults(widget))}));
 const original=[{id:'indices',x:0,y:0,w:40,h:7},{id:'watchlist',x:0,y:18,w:20,h:9},{id:'quote',x:20,y:18,w:20,h:24},{id:'news',x:0,y:40,w:20,h:12}];
 const next=grid.arrange(nodes,original,1081,800),at=id=>next.find(c=>c.id===id);
 expect(at('indices')).toMatchObject({x:0,y:0,w:40});expect(at('watchlist')).toMatchObject({x:0,w:20,y:at('indices').h,h:at('quote').h});expect(at('quote')).toMatchObject({x:20,w:20,y:at('indices').h});expect(at('news')).toMatchObject({x:0,w:40,y:at('watchlist').y+at('watchlist').h});
 expect(next.every((c,i)=>next.every((p,j)=>i===j||!grid.overlap(c,p)))).toBe(true);
 const measured=nodes.map(n=>({...n,preferred:{height:n.preferred.height}}));expect(grid.arrange(measured,next,1081,800)).toEqual(next);
})

it('标准整理延续当前同行不等宽比例，独行组件铺满而不挤入前行',()=>{
 const grid=createResearchGrid(),nodes=['watchlist','quote','news'].map(widget=>({id:widget,kind:'generated-container',containerSpec:financialWidgetDefaults(widget),preferred:financialWidgetDimensions(financialWidgetDefaults(widget))}));
 const next=grid.arrange(nodes,[{id:'watchlist',x:0,y:0,w:14,h:10},{id:'quote',x:14,y:0,w:26,h:24},{id:'news',x:0,y:40,w:14,h:12}],1280,800);
 expect(next.map(c=>[c.id,c.x,c.w])).toEqual([['watchlist',0,14],['quote',14,26],['news',0,40]]);
 const single=grid.arrange(nodes,nodes.map((n,i)=>({id:n.id,x:0,y:i*40,w:40,h:12})),1280,800);expect(single.every(c=>c.x===0&&c.w===40)).toBe(true);
})

it('五个固定组件复用通用组件最小尺寸，没有独立宽高限制',()=>{
 const grid=createResearchGrid(),m=grid.metrics(1280),base=grid.minimum({kind:'generated-container',containerSpec:{type:'text'}},m);
 for(const widget of ['watchlist','quote','indices','news','announcements'])expect(grid.minimum({kind:'generated-container',containerSpec:financialWidgetDefaults(widget)},m)).toEqual(base);
})

it('底部联想向上展开，避开输入框和看板外的聊天面板',()=>{
 const anchor={left:630,right:780,top:560,bottom:584},bounds={left:300,right:800,top:60,bottom:600}
 const p=financialPopoverPosition(anchor,{width:300,height:220},bounds)
 expect(p.left).toBeGreaterThanOrEqual(308);expect(p.left+p.width).toBeLessThanOrEqual(792)
 expect(p.top+p.maxHeight).toBeLessThanOrEqual(anchor.top-8)
})
it('狭窄和低矮看板中的菜单仍在安全边距内，内容可滚动',()=>{
 const bounds={left:400,right:600,top:80,bottom:280},p=financialPopoverPosition({left:570,right:592,top:240,bottom:264},{width:264,height:216},bounds,false)
 expect(p.width).toBe(184);expect(p.top).toBeGreaterThanOrEqual(88)
 expect(p.top+p.maxHeight).toBeLessThanOrEqual(232)
})
