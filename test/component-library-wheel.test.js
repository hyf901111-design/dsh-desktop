import {afterEach,it,expect} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
let f
afterEach(async()=>{await f?.dispose();f=undefined})
const desktop={financialWidget:{request:async()=>({quotes:[],news:[]})},calendarTool:{request:async()=>({events:[],notices:[]}),subscribe:()=>()=>{}}}
function scrollable(element){
 Object.defineProperties(element,{clientHeight:{configurable:true,value:100},scrollHeight:{configurable:true,value:600}})
 element.style.overflowY='auto';element.scrollTop=80
 Object.defineProperty(f.canvas,'scrollHeight',{configurable:true,value:2000});f.canvas.scrollTop=40
}
async function verifyGate(node,element){
 await f.act(async()=>f.workspace.applyWorkbenchCells(f.workspace.getWorkbenchCells().map(c=>c.id===node.id?{...c,h:60}:c),true))
 scrollable(element)
 await f.act(async()=>f.workspace.updateSelection([],'replace'))
 f.canvas.scrollTop=40
 const unselected=await f.event('wheel',element,{deltaY:60,deltaMode:0})
 expect(unselected.defaultPrevented).toBe(true);expect(f.canvas.scrollTop).toBe(100);expect(element.scrollTop).toBe(80)
 await f.act(async()=>f.workspace.updateSelection([node.id],'replace'))
 f.canvas.scrollTop=100
 const selected=await f.event('wheel',element,{deltaY:60,deltaMode:0})
 expect(selected.defaultPrevented).toBe(false);expect(f.canvas.scrollTop).toBe(100)
 element.scrollTop=500
 const boundary=await f.event('wheel',element,{deltaY:60,deltaMode:0})
 expect(boundary.defaultPrevented).toBe(true);expect(f.canvas.scrollTop).toBe(160)
 await f.act(async()=>f.workspace.updateSelection([],'replace'))
 f.canvas.scrollTop=160
 element.scrollTop=80
 const deselected=await f.event('wheel',element,{deltaY:60,deltaMode:0})
 expect(deselected.defaultPrevented).toBe(true);expect(f.canvas.scrollTop).toBe(220);expect(element.scrollTop).toBe(80)
}
it('市场指数只有选中后才消费组件内滚轮，到达边界后继续滚动画布',async()=>{
 f=await financialClientFixture(desktop);let node
 await f.act(async()=>{node=f.workspace.createFinancialWidget('indices')})
 await verifyGate(node,f.host.querySelector('.ew-indices-grid'))
})
it('自选股、行情、新闻和公告复用相同的选中后滚动规则',async()=>{
 f=await financialClientFixture(desktop)
 for(const kind of ['watchlist','quote','news','announcements']){
  let node;await f.act(async()=>{node=f.workspace.createFinancialWidget(kind)})
  const element=f.host.querySelector('[data-research-node-id="'+node.id+'"] [data-financial-widget]')
  await verifyGate(node,element)
 }
})
it('日历月历和事项列表只有选中后才消费组件内滚轮',async()=>{
 f=await financialClientFixture(desktop);let node
 await f.act(async()=>{node=f.workspace.createCalendarTool()})
 for(const selector of ['.ew-calendar-month','.ew-calendar-scroll'])await verifyGate(node,f.host.querySelector(selector))
})
