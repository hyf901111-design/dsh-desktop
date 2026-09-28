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

it('整理铺满可用网格，按内容分配不等宽模块并保持稳定',()=>{
 const g=createResearchGrid(),nodes=[{id:'a',preferred:{width:640,height:290}},{id:'b',preferred:{width:340,height:200}},{id:'c',preferred:{width:600,height:460}}],before=[item('a',6,0,10,6),item('b',30,20,10,5),item('c',5,45,15,13)]
 const next=g.arrange(nodes,before,1000,700),bottom=Math.max(...next.map(c=>c.y+c.h))
 expect(next.map(c=>c.id)).toEqual(['a','b','c']);expect(new Set(next.map(c=>c.w)).size).toBeGreaterThan(1)
 for(let y=0;y<bottom;y++)for(let x=0;x<40;x++)expect(next.filter(c=>x>=c.x&&x<c.x+c.w&&y>=c.y&&y<c.y+c.h)).toHaveLength(1)
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
