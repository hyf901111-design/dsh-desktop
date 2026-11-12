import {expect,it} from 'vitest'
import {evaluateMapping} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js'

const now=new Date('2026-11-11T00:00:00Z'),tool='ework__t_abcdef'
const page=(key)=>({$from:key,$path:'records'})
const select=(field,extra={})=>({$concat:[page('newer'),page('older')],$each:'',$sortBy:'date',$order:'asc',$map:{$path:field},...extra})
const responses={newer:{records:[{date:'2026-11-03',nav:110},{date:'2026-11-04',nav:121}]},older:{records:[{date:'2026-11-01',nav:100},{date:'2026-11-02',nav:99}]}}
it('merges observed pages before sorting, period filtering, normalization and risk calculations',()=>{
 expect(evaluateMapping(select('date'),responses)).toEqual(['2026-11-01','2026-11-02','2026-11-03','2026-11-04'])
 expect(evaluateMapping(select('nav',{$normalize:'base100',$digits:2}),responses)).toEqual([100,99,110,121])
 expect(evaluateMapping(select('nav',{$filter:{date:{$gte:'2026-11-02',$lte:'2026-11-03'}}}),responses)).toEqual([99,110])
 expect(evaluateMapping(select('nav',{$reduce:'maxDrawdown'}),responses)).toBeCloseTo(-1)
 expect(evaluateMapping(select('nav',{$reduce:'pctChange'}),responses)).toBeCloseTo(21)
 expect(evaluateMapping({$calc:{op:'subtract',args:[select('nav',{$reduce:'last'}),select('nav',{$reduce:'first'})]}},responses)).toBe(21)
})
it('does not fabricate pages, silently skip missing pages, accept scalar lists or override the merged origin',()=>{
 for(const change of [{$concat:[page('unknown'),page('older')]},{$concat:[page('newer'),[123]]},{$concat:[{$from:'newer',$path:'missing'},page('older')]},{$from:'newer'},{$path:'records'},{$concat:[{$from:'newer',$path:'records',$default:[]},page('older')]}]){
  expect(()=>evaluateMapping({...select('nav'),...change},responses)).toThrow()
 }
 expect(()=>evaluateMapping(select('nav'),{...responses,older:{records:[1,2]}})).toThrow()
 expect(()=>evaluateMapping(select('nav',{$reduce:'pctChange'}),{...responses,older:responses.newer})).toThrow('严格递增')
})
it('retains every observed point and a usable chart when many full paginated series exceed native capacity',()=>{
 const requests=[],records=[],series=[]
 for(let s=0;s<8;s++){
  for(let p=0;p<2;p++){
   const key=`s${s}p${p}`,args={dataset:'observed',symbol:`F${s}`,offset:p*200,limit:200}
   const response={records:Array.from({length:p===0?200:44},(_,i)=>{const n=p*200+i;return {date:new Date(Date.UTC(2026,0,1+n)).toISOString().slice(0,10),nav:100+s+n/100}})}
   requests.push({key,tool,args});records.push({tool,args,response})
  }
  series.push({name:`实际标的${s}`,values:{$concat:[page(`s${s}p0`),page(`s${s}p1`)],$each:'',$sortBy:'date',$order:'asc',$map:{$path:'nav'},$normalize:'base100'}})
 }
 const draft={version:1,type:'data-bound',requests,mapping:{version:1,type:'chart',variant:'line',title:'全部观察记录',unit:'基期100',labels:{$concat:[page('s0p0'),page('s0p1')],$each:'',$sortBy:'date',$order:'asc',$map:{$path:'date'}},series}}
 const result=resolveBoundComponent(JSON.stringify(draft),records,now,{staticSnapshot:true})
 expect(result.capacitySnapshot).toBe(true)
 expect(result.data.labels).toHaveLength(244)
 expect(result.data.series).toHaveLength(8)
 expect(result.data.series.every(s=>s.values.length===244&&s.values[0]===100)).toBe(true)
 expect(result.output).toContain('data-readable-trend')
 expect(result.output).toContain('2026-09-01')
 expect(result.output).toContain('实际标的7')
 expect(()=>resolveBoundComponent(JSON.stringify(draft),records.slice(0,-1),now,{staticSnapshot:true})).toThrow('未匹配')
 // A differently dated last page cannot be paired by row count.
 const changed=structuredClone(records);changed.at(-1).response.records[0].date='2026-10-01'
 expect(()=>resolveBoundComponent(JSON.stringify(draft),changed,now,{staticSnapshot:true})).toThrow('真实日期')
})
