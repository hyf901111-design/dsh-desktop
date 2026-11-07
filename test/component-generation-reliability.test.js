import {expect,it,vi} from 'vitest'
import {validateWorkbench,layoutWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {evaluateMapping,materializeComponentMapping} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {resolveBoundComponent,resolveComponentSnapshot} from '../packages/dsh-research-task-runtime/component-source-binding.js'

it('mounts both single-security native K-line configurations without dispatching a model task',async()=>{
 const symbols=[{code:'688981',market:'SH',name:'中芯国际'},{code:'600519',market:'SH',name:'贵州茅台'}]
 const plan=validateWorkbench({requestId:'native-kline',title:'双行业研究',dataMode:'source',panels:symbols.map(s=>({title:s.name+'K线',type:'financial-widget',prompt:'显示分时和日K，支持MA/VOL/MACD及证券搜索',library:{id:'builtin-quote',options:{symbols:[s],selectedSymbol:s.market+':'+s.code,period:'1d',indicators:['MA','VOL','MACD']}}}))})
 expect(plan.panels.map(p=>p.artifact?.widget)).toEqual(['quote','quote'])
 const start=vi.fn(),runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}}})
 try{
  const receipts=await runtime.startPreparedBatch({parentSessionId:'reliability',panels:layoutWorkbench(plan.panels).map((p,i)=>({canvasNodeId:'native-'+i,prompt:workbenchPanelPrompt(plan,p),artifact:p.artifact}))})
  expect(receipts.map(r=>r.state)).toEqual(['completed','completed']);expect(start).not.toHaveBeenCalled()
  expect(plan.panels.map(p=>p.artifact.symbols)).toEqual(symbols.map(s=>[s]))
 }finally{await runtime.dispose()}
})

const row={ts_code:'001234.SZ',end_date:'20260930',ann_date:'20261030',report_type:'1',revenue:123000000,n_income:0}
const select={$from:'income',$each:'records',$filter:{end_date:'20260930'},$single:true,$map:{$path:'n_income'}}
it('treats identical source records as one only for explicit scalar selection without mutating source rows',()=>{
 const responses={income:{records:[{...row},{...row}]}},original=structuredClone(responses)
 expect(evaluateMapping(select,responses)).toBe(0);expect(responses).toEqual(original)
 expect(evaluateMapping({...select,$single:false},responses)).toEqual([0,0])
 const {$single,...list}=select
 expect(evaluateMapping({...list,$map:{$path:'revenue'},$reduce:'sum'},responses)).toBe(246000000)
})
it('keeps distinct financial records ambiguous even if the selected value happens to match',()=>{
 for(const other of [{...row,revenue:200000000},{...row,ts_code:'005678.SZ'},{...row,ann_date:'20261101'}])expect(()=>evaluateMapping(select,{income:{records:[row,other]}})).toThrow(/单值/)
 expect(()=>evaluateMapping(select,{income:{records:[]}})).toThrow(/单值/)
 expect(evaluateMapping({...select,$optional:true},{income:{records:[]}})).toBeNull()
})

const tool='ework__t_123abc',args={api_name:'daily',params:{ts_code:'001234.SZ'}}
const source={source:'Fixture',records:[{trade_date:'20261105',open:10,high:12,low:9,close:11,vol:0},{trade_date:'20261106',open:11,high:13,low:10,close:12,vol:200}]}
const chart={version:1,type:'chart',variant:'candlestick',title:'原始日线',unit:'元',volumeUnit:'手',asOf:{$from:'q',$each:'records',$sortBy:'trade_date',$order:'asc',$take:-1,$single:true,$map:{$path:'trade_date'}},candles:{$from:'q',$each:'records',$sortBy:'trade_date',$order:'asc',$map:Object.fromEntries(['date','open','high','low','close','volume'].map(k=>[k,{$path:k==='date'?'trade_date':k==='volume'?'vol':k}]))}}
it.each(['chart','market'])('renders observed compact trading dates through both static and bound %s paths without rewriting prices',type=>{
 const records=[{tool,args,response:structuredClone(source)}],mapping={...chart,type},draft={version:1,type:'data-bound',requests:[{key:'q',tool,args}],mapping}
 for(const resolve of [resolveBoundComponent,resolveComponentSnapshot]){
  const result=resolve(JSON.stringify(draft),records)
  expect(result?.data.candles).toEqual([{date:'2026-11-05',open:10,high:12,low:9,close:11,volume:0},{date:'2026-11-06',open:11,high:13,low:10,close:12,volume:200}])
 }
 expect(records[0].response).toEqual(source)
 const refreshed=materializeComponentMapping(mapping,{q:{...source,records:[...source.records,{trade_date:'20261109',open:12,high:14,low:11,close:13,vol:300}]}})
 expect(refreshed.candles.at(-1)).toEqual({date:'2026-11-09',open:12,high:14,low:11,close:13,volume:300})
})
it('rejects impossible trading dates and retains strict OHLC validation',()=>{
 const draft={version:1,type:'data-bound',requests:[{key:'q',tool,args}],mapping:chart}
 for(const bad of [{...source.records[0],trade_date:'20260230'},{...source.records[0],high:5}]){
  const records=[{tool,args,response:{...source,records:[bad]}}]
  expect(()=>resolveBoundComponent(JSON.stringify(draft),records)).toThrow()
  expect(resolveComponentSnapshot(JSON.stringify(draft),records)).toBeNull()
 }
})
