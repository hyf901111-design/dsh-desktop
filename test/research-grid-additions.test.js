import {expect,it} from 'vitest'
import {createResearchGrid} from '../packages/dsh-research-task-runtime/research-grid.js'
import {financialWidgetDefaults,financialWidgetDimensions} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
import {createWorkbenchGridState} from '../scripts/lib/research-grid-state.mjs'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'

it('fills the remaining row width before creating a new row without moving existing cards',()=>{
 const grid=createResearchGrid(),before=[{id:'watch',x:0,y:0,w:14,h:23}],saved=structuredClone(before)
 const quote=grid.append(before,'quote',30,25,12)
 expect(quote).toMatchObject({x:14,y:0,w:26,h:25});expect(before).toEqual(saved)
 const news=grid.append([...before,quote],'news',26,14,12)
 expect(news).toMatchObject({x:0,y:23,w:14});expect([before[0],quote].some(c=>grid.overlap(c,news))).toBe(false)
})
it('checks the whole new card against lower rows and only uses gaps that meet its minimum width',()=>{
 const grid=createResearchGrid(),before=[{id:'a',x:0,y:0,w:14,h:23},{id:'b',x:14,y:10,w:26,h:10}]
 const next=grid.append(before,'next',30,25,12)
 expect(next.y).toBe(20);expect(before.some(c=>grid.overlap(c,next))).toBe(false)
 expect(grid.append([{id:'a',x:0,y:0,w:30,h:8}],'next',20,7,12)).toMatchObject({x:0,y:8,w:20})
})
it('uses row filling in the persisted workspace transaction and keeps existing geometry unchanged',()=>{
 let saved
 const storage={getItem:()=>saved,setItem:(_key,value)=>{saved=value}},state=createWorkbenchGridState(storage,'row-first')
 state.enable(1000)
 let snapshot=state.reconcile({files:[],artifacts:[],viewport:{x:0,y:0,scale:1}})
 snapshot=state.reconcile({...snapshot,artifacts:[{id:'watch',kind:'generated-container',x:180,y:280,width:320,height:560,containerSpec:financialWidgetDefaults('watchlist')}]})
 const watch={...state.get()[0]}
 snapshot=state.reconcile({...snapshot,artifacts:[...snapshot.artifacts,{id:'quote',kind:'generated-container',x:400,y:400,width:716,height:600,containerSpec:financialWidgetDefaults('quote')}]})
 expect(state.get()[0]).toEqual(watch)
 expect(state.get()[1]).toMatchObject({x:watch.w,y:0,w:40-watch.w})
 state.save();const restored=createWorkbenchGridState(storage,'row-first');restored.enable(1000);restored.reconcile(snapshot)
 expect(restored.get()).toEqual(state.get())
})
it('reserves the visible minimum frame of a saved narrow card before filling its row',()=>{
 const saved=JSON.stringify({version:2,cells:[{id:'old',x:30,y:0,w:10,h:8}]})
 const state=createWorkbenchGridState({getItem:()=>saved},'minimum-frame');state.enable(1000)
 let snapshot=state.reconcile({files:[],artifacts:[{id:'old',kind:'generated-container',x:800,y:100,width:240,height:180,containerSpec:{type:'text'}}],viewport:{x:0,y:0,scale:1}})
 const existing={...snapshot.artifacts[0]},metrics=createResearchGrid().metrics(1000)
 const occupiedLeft=Math.round((existing.x-existing.width/2-metrics.inset)/metrics.step)
 snapshot=state.reconcile({...snapshot,artifacts:[...snapshot.artifacts,{id:'new',kind:'generated-container',x:400,y:400,width:716,height:600,containerSpec:financialWidgetDefaults('quote')}]})
 expect(snapshot.artifacts.find(c=>c.id==='old')).toEqual(existing)
 expect(state.get().find(c=>c.id==='new')).toMatchObject({x:0,y:0,w:occupiedLeft})
})
it('gives a newly inserted watchlist the quote panel height while retaining content-based Arrange sizing',async()=>{
 const f=await financialClientFixture({financialWidget:{request:async()=>({quotes:[]})}},{refreshState:true})
 try{
  let watch,quote
  await f.act(async()=>{watch=f.workspace.createFinancialWidget('watchlist');quote=f.workspace.createFinancialWidget('quote')})
  expect(watch.height).toBe(quote.height)
  expect(financialWidgetDimensions(financialWidgetDefaults('watchlist'),true).height).toBe(600)
  expect(financialWidgetDimensions(financialWidgetDefaults('watchlist')).height).toBe(202)
 }finally{await f.dispose()}
})
