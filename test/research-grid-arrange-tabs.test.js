import {afterEach,expect,it,vi} from 'vitest'
import {createRequire} from 'node:module'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'

const require=createRequire(import.meta.url)

let f
afterEach(async()=>{await f?.dispose();f=null})
const text=id=>({id,kind:'pasted-text',messageId:id,title:id,excerpt:'研究资料正文',x:260,y:160,width:480,height:280,sizeMode:'manual'})
const html=id=>({...text(id),kind:'generated-container',containerPrompt:'非当前页研究资料',generationStatus:'completed',refreshMinutes:0,containerSpec:{version:1,type:'html',title:id,html:'<!doctype html><html><body><p>非当前页资料</p></body></html>'}})
const fixture=async()=>f=await financialClientFixture({}, {boardTabs:true,sourceTransform:source=>{
 // Replace only the production serializer under test; retain the resident
 // workspace and page-grid integration without unwinding unrelated hooks.
 const start=source.indexOf('function arrangeWorkbenchContents('),end=source.indexOf('\nfunction ',start+10)
 if(start<0||end<0)throw Error('Arrange serializer anchor missing')
 source=source.slice(0,start)+require('../scripts/lib/research-grid-ui.mjs').arrangeWorkbenchContents.toString()+'\n'+source.slice(end)
 return source.replace('exports.ResearchCanvas = ResearchCanvas;','exports.__arrangeWorkbenchContents=arrangeWorkbenchContents;exports.__setPlanningIntent=value=>odysseyCreationIntents.set("financial-test",value);exports.ResearchCanvas = ResearchCanvas;')
}})
const geometry=(w,id)=>{const {x,y,width,height}=w.getSnapshot().artifacts.find(n=>n.id===id);return {x,y,width,height}}

it.each(['standard','three','two','one'])('%s整理只回填当前页组件，隐藏页与页签导航不参与测量且保留布局',async mode=>{
 await fixture();const w=f.workspace;let tabs
 await f.act(()=>{
  w.setArtifacts([text('first'),text('offscreen')]);tabs=w.createBoardTabs().containerSpec.tabs
  w.selectBoardTab(tabs[1].id)
  w.setArtifacts([...w.getSnapshot().artifacts,html('hidden')])
  w.applyWorkbenchCells([{id:'hidden',x:4,y:80,w:24,h:32}],true)
 })
 const hiddenCells=w.getWorkbenchCells(),hiddenGeometry=geometry(w,'hidden')
 await f.act(()=>{w.selectBoardTab(tabs[0].id);w.applyWorkbenchCells([{id:'first',x:0,y:0,w:20,h:16},{id:'offscreen',x:0,y:100,w:20,h:16}],true)})
 const before=w.getWorkbenchCells(),onFinish=vi.fn(),preview=vi.fn()
 f.win.addEventListener('ework:arrange-preview',preview)
 await f.act(()=>expect(f.bundle.__arrangeWorkbenchContents(f.canvas,w,new Map(),mode,{onFinish})).toBe(true))
 expect(new Set(f.canvas.__eworkContentFit.ids)).toEqual(new Set(['first','offscreen']))
 await f.act(async()=>{await vi.waitFor(()=>expect(onFinish).toHaveBeenCalledWith(true),{timeout:2200})})
 expect(f.canvas.__eworkContentFit).toBeUndefined()
 expect(w.getWorkbenchCells().map(c=>c.id).sort()).toEqual(['first','offscreen'])
 expect(w.getWorkbenchCells().find(c=>c.id==='offscreen').y).toBeLessThan(100)
 expect(geometry(w,'hidden')).toEqual(hiddenGeometry)
 expect(preview.mock.calls.every(([event])=>event.detail.ids.every(id=>id==='first'||id==='offscreen'))).toBe(true)
 await f.act(()=>w.selectBoardTab(tabs[1].id))
 expect(w.getWorkbenchCells()).toEqual(hiddenCells)
 await f.act(()=>w.selectBoardTab(tabs[0].id))
 await f.event('keydown',f.canvas,{metaKey:true,key:'z',code:'KeyZ'})
 expect(w.getWorkbenchCells()).toEqual(before)
 expect(geometry(w,'hidden')).toEqual(hiddenGeometry)
})

it('整理中切换页签会终止旧页回填，不写入新页栅格',async()=>{
 await fixture();const w=f.workspace;let tabs
 await f.act(()=>{
  w.setArtifacts([text('first')]);tabs=w.createBoardTabs().containerSpec.tabs
  w.selectBoardTab(tabs[1].id);w.setArtifacts([...w.getSnapshot().artifacts,text('second')])
  w.applyWorkbenchCells([{id:'second',x:7,y:31,w:20,h:20}],true)
 })
 const onFinish=vi.fn()
 await f.act(()=>w.selectBoardTab(tabs[0].id))
 await f.act(()=>{
  expect(f.bundle.__arrangeWorkbenchContents(f.canvas,w,new Map(),'one',{onFinish})).toBe(true)
 })
 await f.act(()=>w.selectBoardTab(tabs[1].id))
 const second=w.getWorkbenchCells(),secondGeometry=geometry(w,'second'),apply=vi.spyOn(w,'applyWorkbenchCells')
 await f.act(async()=>{await vi.waitFor(()=>expect(onFinish).toHaveBeenCalledWith(false),{timeout:1500})})
 expect(apply).not.toHaveBeenCalled()
 expect(w.getWorkbenchCells()).toEqual(second)
 expect(geometry(w,'second')).toEqual(secondGeometry)
 expect(f.canvas.__eworkContentFit).toBeUndefined()
})

it('无页签看板从工具栏整理包含视野外组件，并保留当前规划占位',async()=>{
 await fixture();const w=f.workspace
 await f.act(()=>{
  w.setArtifacts([text('first'),text('offscreen')])
  w.applyWorkbenchCells([{id:'first',x:0,y:0,w:20,h:16},{id:'offscreen',x:0,y:100,w:20,h:16}],true)
  f.bundle.__setPlanningIntent({id:'planning',kind:'workbench',state:'planning',startedAt:1000})
  w.reserveWorkbenchPlanning({id:'planning',startedAt:1000},{x:100,y:2800})
 })
 await f.event('click',f.document.querySelector('[data-research-global-arrange]'))
 expect(new Set(f.canvas.__eworkContentFit.ids)).toEqual(new Set(['first','offscreen','planning']))
 await f.act(async()=>{await vi.waitFor(()=>expect(f.canvas.__eworkContentFit).toBeUndefined(),{timeout:2200})})
 const cells=w.getWorkbenchCells()
 expect(cells.map(c=>c.id).sort()).toEqual(['first','offscreen','planning'])
 expect(cells.find(c=>c.id==='offscreen').y).toBeLessThan(100)
 expect(w.getWorkbenchPlanningNodes()).toHaveLength(1)
 expect(cells.every(c=>['x','y','w','h'].every(key=>Number.isFinite(c[key])))).toBe(true)
})
