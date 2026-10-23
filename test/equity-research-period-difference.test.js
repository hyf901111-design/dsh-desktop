import {describe,it,expect} from 'vitest'
import {runCalculations} from '../skills/ework-equity-research/scripts/lib/calculations.mjs'
const fact=(id,period,value,extra={})=>({id,period,normalizedValue:value,normalizedUnit:'CNY',metric:'revenue',scope:'合并',sourceId:id+'Source',status:'verified',...extra})
const run=(facts,calculations)=>{const diagnostics=[];const values=runCalculations({calculations},facts,diagnostics);return{values,diagnostics}}
const op=(id,inputs)=>({id,op:'periodDifference',inputs})
describe('explicit comparable-period amount differences',()=>{
 it('preserves cents and dates the signed result to the newer year in either order',()=>{
  const facts=[fact('a','FY2025','120.02'),fact('b','FY2024','100.01')]
  const result=run(facts,[op('change',['a','b']),op('reverse',['b','a'])])
  expect(result.diagnostics).toEqual([])
  expect(result.values.map(v=>[v.value,v.period,v.unit,v.formula])).toEqual([['20.01','FY2025','CNY','a - b'],['-20.01','FY2025','CNY','b - a']])
  expect(result.values[0].sourceIds).toEqual(['aSource','bSource'])
 })
 it.each([['2026H1','2025H1'],['2026Q1','2025Q1'],['2026H2','2025H2']])('compares identical fiscal cadence %s to %s',(current,previous)=>{
  const result=run([fact('a',current,'-20'),fact('b',previous,'0')],[op('change',['a','b'])])
  expect(result.diagnostics).toEqual([]);expect(result.values[0].value).toBe('-20');expect(result.values[0].period).toBe(current)
 })
 it.each([['FY2025','FY2025'],['FY2025','FY2023'],['FY2025','2024H1'],['2026Q2','2025H1'],['2026-06-30','2025-06-30']])('rejects incomparable periods %s and %s',(a,b)=>{
  const result=run([fact('a',a,'120'),fact('b',b,'100')],[op('bad',['a','b'])])
  expect(result.values[0].status).toBe('blocked');expect(result.diagnostics[0].code).toBe('CALC_PERIOD')
 })
 it('rejects different indicators, scopes or monetary dimensions',()=>{
  for(const extra of [{metric:'costOfRevenue'},{scope:'母公司'},{normalizedUnit:'ratio'}]){
   const result=run([fact('a','FY2025','120'),fact('b','FY2024','100',extra)],[op('bad',['a','b'])])
   expect(result.values[0].status).toBe('blocked');expect(result.diagnostics).toHaveLength(1)
  }
  expect(run([fact('a','FY2025','.2',{normalizedUnit:'ratio'}),fact('b','FY2024','.1',{normalizedUnit:'ratio'})],[op('bad',['a','b'])]).diagnostics[0].code).toBe('CALC_UNIT')
 })
 it('chains exact signed changes into a same-period arithmetic bridge',()=>{
  const result=run([fact('r25','FY2025','100.00000000000000000001'),fact('r24','FY2024','100'),fact('c25','FY2025','50',{metric:'costOfRevenue'}),fact('c24','FY2024','49',{metric:'costOfRevenue'})],[op('revenueChange',['r25','r24']),op('costEffect',['c24','c25']),{id:'total',op:'sum',inputs:['revenueChange','costEffect']}])
  expect(result.diagnostics).toEqual([]);expect(result.values[2].value).toBe('-0.99999999999999999999');expect(result.values[2].period).toBe('FY2025')
 })
 it('rejects derived op labels that hide different economic indicators',()=>{
  const result=run([fact('r25','FY2025','100'),fact('c25','FY2025','40',{metric:'costOfRevenue'}),fact('cash24','FY2024','70',{metric:'cash'}),fact('debt24','FY2024','20',{metric:'debt'})],[{id:'gross','op':'difference',inputs:['r25','c25']},{id:'netCash','op':'difference',inputs:['cash24','debt24']},op('invalid',['gross','netCash'])])
  expect(result.values[2].status).toBe('blocked');expect(result.diagnostics[0].code).toBe('CALC_INPUT')
 })
 it('preserves the stricter same-period contract of ordinary difference',()=>{
  const result=run([fact('a','FY2025','120'),fact('b','FY2024','100')],[{id:'old',op:'difference',inputs:['a','b']}])
  expect(result.diagnostics[0].code).toBe('CALC_PERIOD')
 })
})
