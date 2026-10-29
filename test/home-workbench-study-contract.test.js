import {describe,it,expect} from 'vitest'
import {homeWorkbenchStudySpec,parseHomeWorkbenchStudySpec,synchronizeHomeWorkbenchStudies,homeWorkbenchStudyModel} from '../packages/dsh-research-task-runtime/home-workbench-study-contract.js'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
const symbols=[{market:'SH',code:'600519',name:'贵州茅台'},{market:'SZ',code:'000858',name:'五粮液'},{market:'SZ',code:'000568',name:'泸州老窖'}]
const watch=id=>({id,containerSpec:{...financialWidgetDefaults('watchlist'),symbols,selectedSymbol:'SH:600519'}})
const card=(id,role,source)=>({id,title:role,containerSpec:homeWorkbenchStudySpec(role,'600519',{linkedSourceId:source})})
const graph=()=>[watch('w1'),watch('w2'),watch('w3'),card('disclosure','disclosure','w1'),card('performance','performance','w1'),card('valuation','valuation','w2'),card('matrix','matrix','valuation'),card('dividend','dividend','w2'),card('cash','cashflow','w2'),card('directory','directory','w3'),card('reader','reader','directory'),card('analysis','analysis','directory'),card('peers','peers'),card('news','news')]
const get=(a,id)=>a.find(n=>n.id===id).containerSpec
const model=(a,id)=>homeWorkbenchStudyModel(get(a,id))
describe('第五用例真实研究合同',()=>{
 it('严格校验证券、角色、参数及依赖，拒绝不合法快照字段',()=>{
  const value=homeWorkbenchStudySpec('valuation','600519')
  expect(parseHomeWorkbenchStudySpec(value)).toMatchObject({type:'research-study',studyRole:'valuation',security:'600519'})
  expect(parseHomeWorkbenchStudySpec({...value,security:'fake'})).toBeNull()
  expect(parseHomeWorkbenchStudySpec({...value,html:'<script/>'})).toBeNull()
  expect(parseHomeWorkbenchStudySpec({...value,scenarios:{'600519':{pe:1000,epsChange:0}}})).toBeNull()
  expect(parseHomeWorkbenchStudySpec({...value,linkedSourceId:'\n'})).toBeNull()
  expect(parseHomeWorkbenchStudySpec({...value,studyRole:'peers',linkedSourceId:'w1'})).toBeNull()
 })
 it('任一页签自选驱动相关公司的全部内容，固定同业与资讯不参与联动',()=>{
  let a=graph();const fixed=a.slice(-2);a[1].containerSpec.selectedSymbol='SZ:000858'
  a=synchronizeHomeWorkbenchStudies(a,'w2')
  for(const id of ['w1','w2','w3'])expect(get(a,id).selectedSymbol).toBe('SZ:000858')
  for(const id of ['disclosure','performance','valuation','matrix','dividend','cash','directory','reader','analysis'])expect(get(a,id).security).toBe('000858')
  expect(model(a,'valuation').company.eps).toBe(2.3068)
  expect(model(a,'disclosure').company.revenue[2]).toBe(40528509770.23)
  expect(a.slice(-2)).toEqual(fixed)
 })
 it('资料目录同时驱动阅读和解读，跨证券保留报告类型和真实文件',()=>{
  let a=graph();a.find(n=>n.id==='directory').containerSpec.reportKind='quarter';a=synchronizeHomeWorkbenchStudies(a,'directory')
  expect(get(a,'reader').reportKind).toBe('quarter');expect(get(a,'analysis').reportKind).toBe('quarter')
  a.find(n=>n.id==='w3').containerSpec.selectedSymbol='SZ:000568';a=synchronizeHomeWorkbenchStudies(a,'w3')
  expect(model(a,'reader').document.url).toContain('c29b6875-da2b-4d57-a40a-4e268d5adbe4')
  expect(model(a,'analysis').analysis[2].fact).toContain('27.94')
  expect(get(a,'reader').reportKind).toBe('quarter')
 })
 it('估值参数重算矩阵，不修改历史分红及现金；按证券保留参数',()=>{
  let a=graph();a[1].containerSpec.selectedSymbol='SZ:000858';a=synchronizeHomeWorkbenchStudies(a,'w2')
  const beforeDiv=model(a,'dividend'),beforeCash=model(a,'cash')
  get(a,'valuation').scenarios['000858']={pe:25,epsChange:5};a=synchronizeHomeWorkbenchStudies(a,'valuation')
  expect(model(a,'matrix').valuation.price).toBeCloseTo(60.5535,6)
  expect(model(a,'dividend').company.dividend).toBe(beforeDiv.company.dividend)
  expect(model(a,'cash').company.cash).toEqual(beforeCash.company.cash)
  a[0].containerSpec.selectedSymbol='SH:600519';a=synchronizeHomeWorkbenchStudies(a,'w1')
  expect(model(a,'matrix').valuation.pe).toBe(20)
  a[0].containerSpec.selectedSymbol='SZ:000858';a=synchronizeHomeWorkbenchStudies(a,'w1')
  expect(model(a,'matrix').valuation.pe).toBe(25)
 })
 it('父组件删除或循环依赖时清空下游，不展示上一公司的旧内容',()=>{
  let a=graph().filter(n=>n.id!=='directory');a=synchronizeHomeWorkbenchStudies(a)
  expect(get(a,'reader').security).toBeNull();expect(model(a,'reader').available).toBe(false)
  a=graph();get(a,'valuation').linkedSourceId='matrix';a=synchronizeHomeWorkbenchStudies(a)
  expect(get(a,'matrix').security).toBeNull()
 })
 it('财务及分红只使用冻结真实数据、明确预案口径和全文来源',()=>{
  const a=graph(),r=model(a,'reader'),d=model(a,'dividend')
  expect(r.document.url).toBe('https://static.cninfo.com.cn/finalpage/2026-04-17/1225114741.PDF#page=6')
  expect(d.dividend.combined).toBe(51.95)
  expect(d.dividend.pendingYield).toBeCloseTo(2.02146173788)
  expect(d.dividend.payout).toBeCloseTo(79.1197075845)
  expect(r.snapshot).toBe('2026-04-30')
 })
})

it('不把错误交易所的同码股票解释成冻结标的',()=>{
 const watch={id:'invalid-market',containerSpec:{type:'financial-widget',widget:'watchlist',symbols:[{market:'SZ',code:'600519'}],selectedSymbol:'SZ:600519'}}
 const child={id:'invalid-child',containerSpec:homeWorkbenchStudySpec('disclosure','600519',{linkedSourceId:watch.id})}
 const result=synchronizeHomeWorkbenchStudies([watch,child])
 expect(result[1].containerSpec.security).toBe(null)
})

it('季度比较基期、披露同比和年度单季合计自洽，五粮液明确使用更正后基期',()=>{
 for(const code of ['600519','000858','000568']){
  const m=homeWorkbenchStudyModel(homeWorkbenchStudySpec('reader',code,{reportKind:'quarter'})),c=m.company
  for(const row of m.reportRows){const fromValues=row[4]==='pct'?row[1]-row[2]:(row[1]/row[2]-1)*100;expect(Number(row[3].toFixed(2)),code+' '+row[0]).toBe(Number(fromValues.toFixed(2)))}
  expect(c.quartersRevenue.slice(0,4).reduce((a,b)=>a+b,0)).toBeCloseTo(c.revenue[2],3)
  expect(c.quartersProfit.slice(0,4).reduce((a,b)=>a+b,0)).toBeCloseTo(c.profit[2],3)
 }
 const w=homeWorkbenchStudyModel(homeWorkbenchStudySpec('reader','000858',{reportKind:'quarter'}))
 expect(w.reportRows[0][2]).toBeCloseTo(170.8576565795,8)
 expect(w.reportRows[1][2]).toBeCloseTo(44.1631304841,8)
 expect(w.analysisNote).toContain('更正')
})
