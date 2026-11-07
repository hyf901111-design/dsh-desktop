import {expect,it} from 'vitest'
import fixture from './fixtures/component-native-unit-table-20261108.json' with {type:'json'}
import {resolveComponentSnapshot} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {materializeComponentProjection} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
it('renders the real accepted native table with correct monetary units and persists the conversion',()=>{
 const original=structuredClone(fixture),result=resolveComponentSnapshot(JSON.stringify({version:1,type:'data-bound',...fixture.draft}),fixture.records)
 expect(result.data.columns).toContain('总市值（亿元）')
 const index=label=>result.data.columns.indexOf(label)
 expect(result.data.rows[0][index('总市值（亿元）')]).toBe('18163.69')
 expect(result.data.rows[0][index('营业总收入（亿元）')]).toBe('1332.84')
 expect(result.data.rows[1][index('总市值（亿元）')]).toBe('2924.4')
 expect(fixture).toEqual(original)
})
const r={source:'Tushare',api:'daily_basic',fieldInfo:{total_mv:'总市值（万元）'},records:[{code:'A',total_mv:123456},{code:'B',total_mv:0}]},observed=[{tool:'unit-test',args:{},response:r}]
const cell={$path:'total_mv',$scale:10000,$digits:2}
it.each(['keyed','positional'])('compiles units for %s table collection mappings and reuses the corrected recipe',kind=>{
 const keyed=kind==='keyed',mapping={version:1,type:'table',title:'真实市值',columns:keyed?[{key:'code',label:'证券'},{key:'mv',label:'总市值（亿元）'}]:['证券','总市值（亿元）'],rows:{$from:'q',$each:'records',$map:keyed?{code:{$path:'code'},mv:cell}:[{$path:'code'},cell]}}
 const result=materializeComponentProjection(mapping,{q:r},new Date(),observed)
 expect(result.data.rows).toEqual([['A','12.35'],['B','0']])
 expect(materializeComponentProjection(result.mapping,{q:r},new Date(),observed).data).toEqual(result.data)
})
it('keeps the same compiled recipe correct on refresh without altering source records',()=>{
 const mapping={version:1,type:'table',title:'市值',columns:['市值（亿元）'],rows:[[{$from:'q',$path:'records.0.total_mv',$scale:10000,$digits:2}]]}
 const first=materializeComponentProjection(mapping,{q:r},new Date(),observed)
 const next={...r,records:[{code:'A',total_mv:300000}]}
 expect(materializeComponentProjection(first.mapping,{q:next},new Date(),[{...observed[0],response:next}]).data.rows).toEqual([['30']])
 expect(mapping.rows[0][0].$scale).toBe(10000)
})
it('does not infer unknown provider units or rewrite arithmetic, but rejects incompatible dimensions',()=>{
 const mapping={version:1,type:'table',title:'市值',columns:['市值（亿元）'],rows:[[{$from:'q',$path:'records.0.total_mv',$scale:10000}]]}
 for(const source of [{...r,source:'Other'}, {...r,fieldInfo:{total_mv:'原字段'}}]){
  expect(materializeComponentProjection(mapping,{q:source},new Date(),[{...observed[0],response:source}]).mapping).toEqual(mapping)
 }
 expect(()=>materializeComponentProjection({...mapping,columns:['市值（亿股）']},{q:r},new Date(),observed)).toThrow('来源单位是万元')
 for(const $scale of [0,-1])expect(()=>materializeComponentProjection({...mapping,rows:[[{$from:'q',$path:'records.0.total_mv',$scale}]]},{q:r},new Date(),observed)).toThrow('换算系数')
})
