import { describe, it, expect } from 'vitest'
import { createResearchGrid } from '../packages/dsh-research-task-runtime/research-grid.js'

const item = (id,x,y,w=20,h=6) => ({id,x,y,w,h})
it('创建、投影和吸附共同使用实时正方形格位',()=>{
 const grid=createResearchGrid()
 for(const width of [824,1000,1376]){
  const m=grid.metrics(width)
  expect(m.rowStep).toBe(m.step)
  const c=grid.draw({x:12+m.step*3,y:12+m.step*4},{x:12+m.step*15-10,y:12+m.step*13-10},m)
  expect(c).toMatchObject({x:3,y:4,w:Math.max(12,m.minDraftColumns),h:Math.max(9,m.minDraftRows)})
  const n=grid.project([{id:c.id}],[c],width)[0]
  expect(n.x-n.width/2).toBeCloseTo(12+c.x*m.step)
  expect(n.y-n.height/2).toBeCloseTo(12+c.y*m.step)
  expect(n.width+10).toBeCloseTo(c.w*m.step)
  expect(n.height+10).toBeCloseTo(c.h*m.step)
 }
})
describe('研究工作台网格事务',()=>{
 it('插入拉框占位时向下让位并保持原有宽度',()=>{
  const grid=createResearchGrid(), before=[item('a',0,0),item('b',20,0),item('c',0,6)]
  const next=grid.place(before,item('new',0,0,20,8),'new')
  expect(next.find(n=>n.id==='new')).toMatchObject({x:0,y:0,w:20,h:8})
  expect(next.find(n=>n.id==='a').y).toBe(8)
  expect(next.find(n=>n.id==='c').y).toBe(14)
  expect(next.find(n=>n.id==='b').y).toBe(0)
  expect(before[0].y).toBe(0)
  expect(next.every((a,i)=>next.every((b,j)=>i===j||!grid.overlap(a,b)))).toBe(true)
 })
 it('向上拖动交换占位，松手补上原空位',()=>{
  const grid=createResearchGrid(), before=[item('a',0,0),item('b',0,6),item('c',20,0)]
  const next=grid.place(before,item('b',0,0),'b')
  expect(next.find(n=>n.id==='b').y).toBe(0)
  expect(next.find(n=>n.id==='a').y).toBe(6)
  expect(next.find(n=>n.id==='c').y).toBe(0)
 })
 it('删除和缩小组件后纵向补位，不横向挤成等大卡片',()=>{
  const grid=createResearchGrid()
  expect(grid.compact([item('a',0,0,13,4),item('b',13,8,27,9)])[1]).toMatchObject({x:13,y:0,w:27,h:9})
  expect(grid.compact([item('a',0,0,20,4),item('b',0,9)])[1].y).toBe(4)
 })
 it('前后反向拉框使用相同最近格位，且不超过40列',()=>{
  const grid=createResearchGrid(), metrics=grid.metrics(1224)
  const a=grid.draw({x:1220,y:320},{x:620,y:40},metrics)
  const b=grid.draw({x:620,y:40},{x:1220,y:320},metrics)
  expect(a).toEqual(b);expect(a.x+a.w).toBeLessThanOrEqual(40)
  expect(a.w).toBeGreaterThanOrEqual(4);expect(a.h).toBeGreaterThanOrEqual(3)
 })
 it('链接和语音在所有组件之后追加，即使前排有空格',()=>{
  const grid=createResearchGrid(), before=[item('a',0,0,20,6),item('b',0,6,40,8)]
  expect(grid.append(before,'link')).toMatchObject({x:0,y:14,w:20,h:7})
  expect(grid.append([...before,grid.append(before,'link')],'voice').y).toBe(21)
 })
 it('迁移保留内容标识、阅读顺序、不等大尺寸，宽度变化仅重排几何',()=>{
  const grid=createResearchGrid(), nodes=[{id:'a',x:300,y:200,width:560,height:320,title:'真实数据'}, {id:'b',x:920,y:200,width:560,height:520}]
  const cells=grid.migrate(nodes,1224), large=grid.project(nodes,cells,1224), narrow=grid.project(nodes,cells,824)
  expect(large.map(n=>n.id)).toEqual(['a','b']);expect(large[0].title).toBe('真实数据')
  expect(cells.find(n=>n.id==='b').h).toBeGreaterThan(cells.find(n=>n.id==='a').h)
  expect(narrow[0].width).toBeLessThan(large[0].width)
  expect((narrow[0].height+10)/(large[0].height+10)).toBeCloseTo(grid.metrics(824).step/grid.metrics(1224).step)
  expect(narrow[0].sizeMode).toBe('manual')
 })
})

it('整理填满可用宽度，按内容分配独立高度和不等宽模块并保持稳定',()=>{
 const g=createResearchGrid(),nodes=[{id:'a',preferred:{width:640,height:290}},{id:'b',preferred:{width:340,height:200}},{id:'c',preferred:{width:600,height:460}}],before=[item('a',6,0,10,6),item('b',30,20,10,5),item('c',5,45,15,13)]
 const next=g.arrange(nodes,before,1000,700),bottom=Math.max(...next.map(c=>c.y+c.h))
 expect(next.map(c=>c.id)).toEqual(['a','b','c']);expect(new Set(next.map(c=>c.w)).size).toBeGreaterThan(1)
 expect(Math.max(...next.map(c=>c.x+c.w))).toBe(40)
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 expect(g.project(nodes,next,1000).map(n=>n.height)).toEqual(nodes.map(n=>expect.closeTo(Math.ceil((n.preferred.height+10)/g.metrics(1000).step)*g.metrics(1000).step-10)))
 expect(g.arrange(nodes,next,1000,700)).toEqual(next)
 expect(Math.min(...next.map(c=>c.w*g.metrics(1000).step-10))).toBeGreaterThanOrEqual(280)
})

it('整理智能草稿仍满足输入区最小尺寸，三个草稿不会挤入不足宽的一行',()=>{
 const g=createResearchGrid(),nodes=['a','b','c'].map(id=>({id,kind:'generated-container',width:320,height:220})),before=nodes.map((n,i)=>item(n.id,i*12,0,12,3))
 const next=g.arrange(nodes,before,1000),shown=g.project(nodes,next,1000)
 expect(shown.every(n=>n.width>=320&&n.height>=220)).toBe(true)
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 expect(new Set(next.map(n=>n.y)).size).toBeGreaterThan(1)
})

it('整理短图表不拉高到视口或同排长内容，长文章保持内容高度',()=>{
 const g=createResearchGrid(),nodes=[{id:'chart',preferred:{width:480,height:280}},{id:'article',preferred:{width:480,height:3400}}],before=[item('chart',0,0,20,25),item('article',20,0,20,25)]
 const shown=g.project(nodes,g.arrange(nodes,before,1000,1600),1000)
 expect(shown.find(n=>n.id==='chart').height).toBeGreaterThanOrEqual(280)
 expect(shown.find(n=>n.id==='chart').height).toBeLessThan(315)
 expect(shown.find(n=>n.id==='article').height).toBeGreaterThanOrEqual(3400)
})

it('整理同排不等高卡片各自贴合内容，下面组件补入较短列',()=>{
 const g=createResearchGrid(),nodes=[{id:'a',preferred:{width:480,height:280}},{id:'b',preferred:{width:480,height:460}},{id:'c',preferred:{width:480,height:220}},{id:'d',preferred:{width:480,height:330}}],before=nodes.map((n,i)=>item(n.id,i%2*20,Math.floor(i/2)*24,20,24))
 const next=g.arrange(nodes,before,1000,1400),shown=g.project(nodes,next,1000)
 expect(shown.find(n=>n.id==='a').height).toBeLessThan(315)
 expect(shown.find(n=>n.id==='b').height).toBeGreaterThanOrEqual(460)
 expect(next.find(n=>n.id==='c').y).toBe(next.find(n=>n.id==='a').h)
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 expect(g.arrange(nodes,next,1000,1400)).toEqual(next)
})

it('移动按邻居中线插入，覆盖下半部时落到其后，空槽在预览阶段补位',()=>{
 const g=createResearchGrid(),before=[item('a',0,0,20,6),item('b',0,6,20,9),item('c',20,0,20,5)]
 expect(g.move(before,item('a',0,3,20,6)).find(c=>c.id==='a').y).toBe(0)
 const next=g.move(before,item('a',0,12,20,6))
 expect(next.find(c=>c.id==='b').y).toBe(0)
 expect(next.find(c=>c.id==='a').y).toBe(9)
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 expect(g.move(before,item('a',0,0,20,6))).toEqual(before)
 expect(g.move([item('a',0,0)],item('a',0,14)).find(c=>c.id==='a').y).toBe(0)
})

it('整理时宽表格缩至可用短列，不跳过短指标下方可容纳的空位',()=>{
 const g=createResearchGrid(),nodes=[
  {id:'metrics',preferred:{width:480,height:240}},
  {id:'chart',preferred:{width:480,height:460}},
  {id:'table',preferred:{width:600,height:260}},
  {id:'article',preferred:{width:480,height:660}}
 ],before=nodes.map((n,i)=>item(n.id,i%2*20,Math.floor(i/2)*24,20,24))
 const next=g.arrange(nodes,before,1148),a=next.find(c=>c.id==='metrics'),table=next.find(c=>c.id==='table')
 expect(table).toMatchObject({x:a.x,y:a.y+a.h,w:a.w})
 expect(table.w*g.metrics(1148).step-g.metrics(1148).gap).toBeGreaterThanOrEqual(280)
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 expect(g.arrange(nodes,next,1148)).toEqual(next)
})

it('多选调高共用尺寸增量，底下未选卡片让位且最小尺寸统一限制',()=>{
 const g=createResearchGrid(),before=[item('a',0,0,20,8),item('b',20,0,20,10),item('c',0,10,40,6)],nodes=before.map(c=>({id:c.id}))
 const next=g.resizeSelection(before,['a','b'],'y',3,nodes,1000)
 expect(next.find(c=>c.id==='a')).toMatchObject({h:11,y:0})
 expect(next.find(c=>c.id==='b')).toMatchObject({h:13,y:0})
 expect(next.find(c=>c.id==='c').y).toBe(13)
 const shrink=g.resizeSelection(before,['a','b'],'y',-99,nodes,1000)
 expect(shrink.find(c=>c.id==='a').h).toBe(g.metrics(1000).minRows)
 expect(shrink.find(c=>c.id==='b').h-shrink.find(c=>c.id==='a').h).toBe(2)
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 expect(g.resizeSelection(before,['a','b'],'y',0,nodes,1000)).toEqual(before)
})

it('多选调宽同步增量，保留未选同排组件的最小宽度',()=>{
 const g=createResearchGrid(),before=[item('a',0,0,14,8),item('b',14,0,26,10),item('c',0,10,14,8),item('d',14,10,26,10)],nodes=before.map(c=>({id:c.id}))
 const next=g.resizeSelection(before,['a','c'],'x',7,nodes,1000)
 expect(next.find(c=>c.id==='a')).toMatchObject({w:21,x:0})
 expect(next.find(c=>c.id==='c')).toMatchObject({w:21,x:0})
 expect(next.find(c=>c.id==='b')).toMatchObject({w:19,x:21})
 expect(next.find(c=>c.id==='d')).toMatchObject({w:19,x:21})
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 const limit=g.resizeSelection(before,['a','c'],'x',99,nodes,1000)
 expect(limit.filter(c=>['b','d'].includes(c.id)).every(c=>c.w*g.metrics(1000).step-10>=280)).toBe(true)
 expect(limit.find(c=>c.id==='a').w).toBe(limit.find(c=>c.id==='c').w)
})

it('并排组件调宽先压缩右侧到最小宽度，再让无法容纳的组件换行',()=>{
 const g=createResearchGrid(),before=[item('a',0,0,20,8),item('b',20,0,20,10),item('c',0,10,40,6)],nodes=before.map(c=>({id:c.id,kind:'generated-container',containerSpec:{}}))
 const next=g.resize(before,{...before[0],w:26},nodes,1000)
 expect(next.find(c=>c.id==='a')).toMatchObject({x:0,y:0,w:26,h:8})
 expect(next.find(c=>c.id==='b')).toMatchObject({x:26,y:0,w:14,h:10})
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
 const limit=g.resize(before,{...before[0],w:30},nodes,1000)
 expect(limit.find(c=>c.id==='b').y).toBeGreaterThanOrEqual(8)
 expect(limit.find(c=>c.id==='b').w).toBe(20)
 expect(g.resize(before,{...before[0]},nodes,1000)).toEqual(before)
})
it('三列调宽逐个压缩，智能草稿最小宽度保持且规范高度不变',()=>{
 const g=createResearchGrid(),before=[item('a',0,0,12,6),item('b',12,0,14,7),item('c',26,0,14,8)]
 const next=g.resize(before,{...before[0],w:16},[{id:'b',kind:'generated-container'},{id:'c'}],1400),m=g.metrics(1400)
 expect(next.find(c=>c.id==='b').w*m.step-m.gap).toBeGreaterThanOrEqual(320)
 expect(next.map(c=>c.h)).toEqual([6,7,8]);expect(next.map(c=>c.y)).toEqual([0,0,0])
 expect(next.every((a,i)=>next.every((b,j)=>i===j||!g.overlap(a,b)))).toBe(true)
})
