import {expect,it} from 'vitest'
import {evaluateMapping,materializeComponentMapping,ComponentDataRefresh} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {resolveComponentSnapshot,resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'

const responses={q:{source:'Fixture',records:[{date:'2026-11-03',close:99},{date:'2026-11-01',close:100},{date:'2026-11-02',close:110}]},a:{close:200},b:{close:250}}
const prices={$from:'q',$each:'records',$sortBy:'date',$order:'asc',$map:{$path:'close'}}
const calc=(op)=>({$calc:{op,args:[{$from:'a',$path:'close'},{$from:'b',$path:'close'}]},$digits:2})

it.each([['first',100],['last',99],['min',99],['max',110],['sum',309],['mean',103],['change',-1],['pctChange',-1],['maxDrawdown',-10],['returnStdDev',14.14]])('derives %s from selected chronological observations, not model values',(kind,want)=>{
 expect(evaluateMapping({...prices,$reduce:kind,$digits:2},responses)).toBe(want)
})
it('accepts nested source calculations and never treats numeric defaults or display labels as operands',()=>{
 const nested={$calc:{op:'subtract',args:[calc('pctChange'),{...prices,$reduce:'pctChange'}]},$digits:2}
 expect(evaluateMapping(nested,responses)).toBe(26)
 for(const operand of [{$path:'missing',$default:20},{$path:'missing',$default:'20'},{$path:'close',$prefix:'2'},{$date:{format:'yyyyMMdd'}},{$calc:{op:'add',args:[10,20]}},{$path:'close',ignored:100}]){
  expect(()=>evaluateMapping({$calc:{op:'add',args:[operand,{$from:'b',$path:'close'}]}},responses)).toThrow()
 }
})
it('retains calculation provenance for a scalar snapshot and a table beyond compact capacity',()=>{
 const args={},record={tool:'ework__t_aabb',args,response:{source:'Fixture',start:100,end:125,records:Array.from({length:101},(_,i)=>({name:'标的'+i,start:100,end:100+i}))}}
 const delta={$calc:{op:'pctChange',args:[{$from:'q',$path:'start'},{$from:'q',$path:'end'}]}}
 const draft={version:1,type:'data-bound',requests:[{key:'q',tool:record.tool,args}],mapping:{version:1,type:'kpi',title:'区间表现',items:[{label:'涨跌幅',value:delta,unit:'%'}]}}
 expect(resolveComponentSnapshot(JSON.stringify(draft),[record])?.data.items[0].value).toBe('25')
 draft.mapping={version:1,type:'table',title:'对比明细',columns:['名称','涨跌幅（%）'],rows:{$from:'q',$each:'records',$map:[{$path:'name'},{$calc:{op:'pctChange',args:[{$path:'start'},{$path:'end'}]},$digits:2}]}}
 const snapshot=resolveComponentSnapshot(JSON.stringify(draft),[record])
 expect(snapshot?.capacitySnapshot).toBe(true)
 expect(snapshot?.data.rows).toHaveLength(101)
 expect(snapshot?.data.rows.at(-1)).toEqual(['标的100','100'])
})
it('refreshes a bound derived metric from new observations without regenerating the component',async()=>{
 const args={},record={tool:'ework__t_aabb',args,response:{start:100,end:125}}
 const draft={version:1,type:'data-bound',requests:[{key:'q',tool:record.tool,args}],mapping:{version:1,type:'kpi',title:'区间表现',items:[{label:'涨跌幅',value:{$calc:{op:'pctChange',args:[{$from:'q',$path:'start'},{$from:'q',$path:'end'}]},$digits:2},unit:'%'}]}}
 const resolved=resolveBoundComponent(JSON.stringify(draft),[record]);let spec=JSON.parse(resolved.output)
 const service=new ComponentDataRefresh({owner:()=> 'owner',load:async()=>[],save:async()=>{},execute:async()=>({start:100,end:80}),inspect:async()=>({revision:'r1',spec,writable:true}),apply:async(_b,_r,value)=>{spec=value},validateRequest:async r=>({...r,connectionId:'c',connectionRevision:1,schemaDigest:'d'})})
 try{
  await service.load()
  const binding=await service.bind({sessionId:'s',nodeId:'n',workspaceId:'w',requests:[{key:'q',toolId:'t_aabb',args}],mapping:draft.mapping,intervalMinutes:0})
  await service.refresh(binding.id)
  expect(readTemplateModel(spec).data.items[0].value).toBe('-20')
 }finally{await service.dispose()}
})
it.each([['add',450],['subtract',-50],['multiply',50000],['divide',.8],['pctChange',25]])('calculates %s from two exact source operands',(op,want)=>{
 expect(evaluateMapping(calc(op),responses)).toBe(want)
})
it('recomputes derived fields from updated responses and preserves row scope',()=>{
 const mapping={version:1,type:'table',title:'变化',columns:['日期','相对起点变化'],rows:{...prices,$map:[{$path:'date'},{$calc:{op:'pctChange',args:[{$from:'a',$path:'close'},{$path:'close'}]},$digits:2}]}}
 expect(materializeComponentMapping(mapping,responses).rows).toEqual([['2026-11-01','-50'],['2026-11-02','-45'],['2026-11-03','-50.5']])
 expect(evaluateMapping(calc('pctChange'),{...responses,b:{close:160}})).toBe(-20)
})
it.each(['literal','missing','zero','unknown','overflow','null'])('rejects %s arithmetic rather than inventing a derived value',kind=>{
 const expression=calc('divide'),sources=structuredClone(responses)
 if(kind==='literal')expression.$calc.args[0]=200
 if(kind==='missing')expression.$calc.args[0].$path='unknown'
 if(kind==='zero')sources.b.close=0
 if(kind==='unknown')expression.$calc.op='eval'
 if(kind==='overflow'){sources.a.close=1e308;sources.b.close=1e-308}
 if(kind==='null')sources.a.close=null
 expect(()=>evaluateMapping(expression,sources)).toThrow()
})
it.each(['missing-sort','descending','duplicate-date','missing-value','zero-base','empty','literal-map','too-short'])('rejects %s temporal statistics without filling or reordering observations silently',kind=>{
 const expression={...prices,$reduce:'pctChange'},sources=structuredClone(responses)
 if(kind==='missing-sort')delete expression.$sortBy
 if(kind==='descending')expression.$order='desc'
 if(kind==='duplicate-date')sources.q.records[0].date='2026-11-02'
 if(kind==='missing-value')sources.q.records[0].close=null
 if(kind==='zero-base')sources.q.records[1].close=0
 if(kind==='empty')sources.q.records=[]
 if(kind==='literal-map')expression.$map=10
 if(kind==='too-short'){expression.$reduce='returnStdDev';sources.q.records=sources.q.records.slice(0,2)}
 expect(()=>evaluateMapping(expression,sources)).toThrow()
})
it('keeps source-derived comparison values through both snapshot and bound component delivery',()=>{
 const args={intent:'history',symbols:['000300.SH'],interval:'1d'},mapping={version:1,type:'chart',variant:'horizontal',title:'区间表现',unit:'%',labels:['沪深300'],series:[{name:'区间涨跌幅',values:[{...prices,$reduce:'pctChange',$digits:2}]}]}
 const record={tool:'financial_query',purpose:'snapshot',args,response:{...responses.q,schema_version:'financial-1',status:'complete'}}
 const draft={version:1,type:'data-bound',requests:[{key:'q',tool:record.tool,args}],mapping}
 expect(resolveComponentSnapshot(JSON.stringify(draft),[record])?.data.series[0].values).toEqual([-1])
 record.tool='ework__t_aabb';delete record.purpose;draft.requests[0].tool=record.tool
 expect(resolveBoundComponent(JSON.stringify(draft),[record]).data.series[0].values).toEqual([-1])
})
it.each(['invalid-date','mixed-offset-order','invalid-reduction','conflicting-transform','scale-overflow'])('rejects %s instead of producing misleading statistics',kind=>{
 const expression={...prices,$reduce:'pctChange'},sources=structuredClone(responses)
 if(kind==='invalid-date')sources.q.records[0].date='2026-11-31'
 if(kind==='mixed-offset-order')sources.q.records=[{date:'2026-11-01T01:00:00+00:00',close:100},{date:'2026-11-01T02:00:00+08:00',close:110}]
 if(kind==='invalid-reduction')expression.$reduce='annualizedReturn'
 if(kind==='conflicting-transform')expression.$normalize='base100'
 if(kind==='scale-overflow'){expression.$reduce='sum';expression.$scale=1e308}
 expect(()=>evaluateMapping(expression,sources)).toThrow()
})
