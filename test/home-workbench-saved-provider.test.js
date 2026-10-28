import {afterEach,expect,it} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'

let fixture
const symbol={market:'SH',code:'600519',name:'贵州茅台'}
afterEach(async()=>{await fixture?.dispose();fixture=null})

async function mountSavedCanvas(kind){
 const calls=[]
 fixture=await financialClientFixture({financialWidget:{request:async input=>{
  calls.push(input)
  if(input.action==='search')return {symbols:[{market:'US',code:'AAPL',name:'苹果'}]}
  return {source:'普通会话测试行情桥',receivedAt:'2026-10-29T01:00:00Z',quotes:input.action==='quotes'?[{...symbol,price:321,quoteTime:'2026-10-29T01:00:00Z'}]:[],bars:[]}
 }}},{sourceTransform:source=>source.replace('exports.ResearchCanvas = ResearchCanvas;','exports.__setSavedGuidePage=page=>sherlockBoardsAdapter=page;exports.ResearchCanvas = ResearchCanvas;')})
 const f=fixture
 f.bundle.__setSavedGuidePage({
  getState:()=>({account:{status:'ready',user:null}}),
  getHomeGuideSession:id=>kind==='workbench'&&id==='financial-test'?{kind,sessionId:id}:undefined,
  homeGuideSessionsReady:()=>true,version:()=>0,subscribe:()=>()=>{},getView:()=>undefined,
  isLoading:()=>false,activationError:()=>null,editorError:()=>null,
  finishGesture(){},clearPresence(){},presence(){}
 })
 const spec={...financialWidgetDefaults('quote'),symbols:[symbol],refreshMinutes:0,refreshEnabled:false}
 await f.act(()=>{
  expect(f.workspace.applyWorkbench({id:'saved-provider',panels:[{nodeId:'saved-quote',title:spec.title,prompt:spec.title,pending:true,width:800,height:600,x:0,y:0}]})).toBe(true)
  expect(f.workspace.applyWorkbench({id:'saved-provider',panels:[{nodeId:'saved-quote',taskId:'saved-quote',preparedOutput:JSON.stringify(spec)}]})).toBe(true)
 })
 // No tutorial portal or inherited runId is mounted: this is the normal saved
 // workspace surface used after completion or a later visit.
 await f.render()
 const search=()=>f.host.querySelector('.ew-financial-header-selector input')
 expect(search()).not.toBeNull()
 return {f,calls,async query(text){await f.input(search(),text);await f.act(async()=>{await new Promise(resolve=>setTimeout(resolve,240))})}}
}

it('reopened workbench header search stays inside the recorded stock universe',async()=>{
 const {f,calls,query}=await mountSavedCanvas('workbench')
 expect(f.host.textContent).toContain('历史快照')
 expect(calls).toEqual([])
 await query('AAPL')
 expect(calls).toEqual([])
 expect(f.document.querySelectorAll('[aria-label="匹配标的"] [role="option"]')).toHaveLength(0)
 expect(f.document.querySelector('[aria-label="匹配标的"]').textContent).toContain('无匹配结果')
 await query('五粮液')
 expect(calls).toEqual([])
 const options=[...f.document.querySelectorAll('[aria-label="匹配标的"] [role="option"]')]
 expect(options).toHaveLength(1)
 expect(options[0].textContent).toContain('五粮液')
 expect(options[0].textContent).toContain('000858')
})

it('ordinary saved workspace header search continues using the live bridge',async()=>{
 const {f,calls,query}=await mountSavedCanvas('ordinary')
 await query('AAPL')
 expect(calls.filter(input=>input.action==='search')).toEqual([{action:'search',query:'AAPL'}])
 const options=[...f.document.querySelectorAll('[aria-label="匹配标的"] [role="option"]')]
 expect(options).toHaveLength(1)
 expect(options[0].textContent).toContain('苹果')
 expect(f.host.textContent).not.toContain('历史快照')
})
