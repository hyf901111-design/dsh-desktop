import {describe,it,expect} from 'vitest'
import {createResearchGrid} from '../packages/dsh-research-task-runtime/research-grid.js'

const names=['indices','watchlist','quote','news','announcements','calendar','smart']
const nodes=()=>names.map((name,index)=>({id:name,kind:'generated-container',workbenchId:'home-guide:owned-example',workbenchIndex:index,workbenchLayoutVersion:1,preserveGenerationSize:true,sizeMode:'manual',preferred:{width:100,height:index===1?238:200},containerSpec:index<5?{type:'financial-widget',widget:name}:index===5?{type:'calendar-tool'}:{type:'table',rows:[[1]]}}))
const adding=()=>names.map((id,index)=>({id,x:0,y:index*30,w:id==='watchlist'?10:40,h:10}))
describe('原生整理与延迟测量共用演示行规划',()=>{
 it.each([446,624,817,906,1400])('is idempotent at actual canvas width %s without shrinking reading frames',width=>{
  const grid=createResearchGrid(),source=nodes(),before=adding(),m=grid.metrics(width),first=grid.arrange(source,before,width,0,'standard',{authoredBoard:true})
  expect(grid.arrange(source.map(node=>({...node,preferred:{height:99}})),first,width,0,'standard',{authoredBoard:true})).toEqual(first)
  expect(before).toEqual(adding())
  expect(first.every((a,i)=>first.every((b,j)=>i===j||!grid.overlap(a,b)))).toBe(true)
  for(const id of ['watchlist','quote'])expect(first.find(c=>c.id===id).h*m.rowStep-m.gap).toBeGreaterThanOrEqual(600)
  expect(first.find(c=>c.id==='indices').h*m.rowStep-m.gap).toBeGreaterThanOrEqual(width-48<=520?420:340)
  const watch=first.find(c=>c.id==='watchlist'),quote=first.find(c=>c.id==='quote')
  if(m.minColumns<=20){expect(watch.y).toBe(quote.y);expect(watch.w+quote.w).toBe(40);if(m.minColumns<=16)expect(watch.w).toBeLessThan(quote.w)}else expect(watch.y).toBeLessThan(quote.y)
 })
 it('later news and announcement insertions leave the settled foundation untouched',()=>{
  const grid=createResearchGrid(),source=nodes(),before=adding(),foundation=grid.arrange(source.slice(0,3),before.slice(0,3),906,0,'standard',{authoredBoard:true})
  for(const count of [4,5,6,7]){
   const planned=grid.authoredBoardPlan(source.slice(0,count),[...foundation,...before.slice(3,count)],906)
   expect(planned.slice(0,3)).toEqual(foundation)
  }
 })
 it('does not alter ordinary Standard rows, other authored groups, explicit column choices or malformed metadata',()=>{
  const grid=createResearchGrid(),source=nodes(),before=adding()
  for(const changed of [source.map(({workbenchId,...node})=>node),source.map(n=>({...n,workbenchId:'hwb:real-user'})),source.map(n=>({...n,workbenchIndex:0})),source.map(n=>({...n,workbenchLayoutVersion:2})),[...source,{id:'foreign'}]])expect(grid.authoredBoardPlan(changed,before,906)).toBeUndefined()
  const ordinary=source.map(({workbenchId,...node})=>node),arranged=grid.arrange(ordinary,before,906)
  expect(arranged.find(c=>c.id==='watchlist').y).not.toBe(arranged.find(c=>c.id==='quote').y)
  const completed=grid.arrange(source,before,906)
  expect(completed.find(c=>c.id==='watchlist').y).not.toBe(completed.find(c=>c.id==='quote').y)
  expect(grid.arrange(source,before,906,900,'one').every(c=>c.w===40)).toBe(true)
  const mixed=source.map(n=>n.id==='smart'?{...n,containerSpec:{type:'web'}}:n)
  expect(grid.authoredBoardPlan(mixed,before,906)).toBeUndefined()
 })
})
