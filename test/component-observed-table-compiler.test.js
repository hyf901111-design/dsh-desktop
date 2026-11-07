import {expect,it} from 'vitest'
import fixture from './fixtures/component-native-table-scope-20261108.json' with {type:'json'}
import {resolveComponentSnapshot} from '../packages/dsh-research-task-runtime/component-source-binding.js'
it('compiles the actual native rejected table using observed list scope and an exact omitted source field',()=>{
 const before=structuredClone(fixture),result=resolveComponentSnapshot(JSON.stringify({version:1,type:'data-bound',...fixture.draft}),fixture.records)
 expect(result).not.toBeNull()
 expect(result.data.rows).toHaveLength(2)
 expect(result.data.rows[0][1]).toBe('110.9')
 expect(result.data.rows[1][1]).toBe('560')
 expect(result.data.rows[0][4]).toBe('9495.71')
 expect(fixture).toEqual(before)
})
import {normalizeObservedTableMapping} from '../packages/dsh-research-task-runtime/table-projection.js'
import {materializeComponentProjection} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
const records=[{day:'20261106',a:1,b:2,close:0},{day:'20261105',a:3,b:4,close:10}],responses={q:{records}}
const pick=path=>({$from:'q',$filter:{day:'20261106'},$single:true,$path:path})
const table={version:1,type:'table',title:'来源字段',columns:[{key:'a',label:'A'},{key:'b',label:'B'},{key:'close',label:'收盘价'}],rows:[{a:pick('a'),b:pick('b')}]}
it('keeps zero and persists the exact selection, without mutating source data',()=>{
 const result=materializeComponentProjection(table,responses)
 expect(result.data.rows).toEqual([['1','2','0']])
 expect(materializeComponentProjection(result.mapping,responses).data).toEqual(result.data)
 expect(table.rows[0]).not.toHaveProperty('close')
})
it('does not invent field aliases, choose among conflicting scopes or use inferred siblings as proof',()=>{
 for(const row of [{a:pick('a')},{a:pick('a'),b:pick('a')},{a:pick('a'),b:{...pick('b'),$filter:{day:'20261105'}}}])expect(normalizeObservedTableMapping({...table,rows:[row]},responses).rows[0]).not.toHaveProperty('close')
 expect(normalizeObservedTableMapping({...table,columns:[...table.columns,{key:'price',label:'最新价'}]},responses).rows[0]).not.toHaveProperty('price')
 expect(normalizeObservedTableMapping(table,{q:{records:records.map(({close,...row})=>row)}}).rows[0]).not.toHaveProperty('close')
})
it('does not guess an omitted collection when another row list or root field exists',()=>{
 for(const source of [{records,items:[...records]},{records,a:123}])expect(normalizeObservedTableMapping(table,{q:source}).rows[0].a).not.toHaveProperty('$each')
})
it('retains cardinality and source filtering failures rather than taking the first record',()=>{
 const row={a:{...pick('a'),$filter:{day:'20990101'}},b:{...pick('b'),$filter:{day:'20990101'}}}
 expect(()=>materializeComponentProjection({...table,rows:[row]},responses)).toThrow('单值')
 const duplicated={q:{records:[records[0],{...records[0],close:9}]}}
 expect(()=>materializeComponentProjection(table,duplicated)).toThrow('单值')
})
