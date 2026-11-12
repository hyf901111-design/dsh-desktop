import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {renderMarketArtifact,marketPanelSchema,MARKET_ARTIFACT_PROMPT} from '../packages/dsh-research-task-runtime/market-artifact.js'
import {templateDataIssue,TABLE_GUIDANCE} from '../packages/dsh-research-task-runtime/template-data-contract.js'

// Frozen observed output: rendering evidence, never a fresh quote retrieval.
const observed=JSON.parse(readFileSync(new URL('./fixtures/workbench-quote-13-columns.json',import.meta.url),'utf8'))
const accept=data=>acceptArtifactOutput(JSON.stringify(data))
const model=data=>readTemplateModel(JSON.parse(accept(data))).data
const synthetic=(columns=32,rows=1)=>({version:1,type:'table',title:'合成边界',asOf:'合成数据，不是在线报价',columns:Array.from({length:columns},(_,i)=>'字段'+i),rows:Array.from({length:rows},()=>Array.from({length:columns},(_,i)=>i===0?0:i===1?-1.234567890123:i===2?'0001.2300':'合成值'))})

it('accepts the observed 13-column quote as interactive HTML and retains every source field exactly',()=>{
 const output=accept(observed)
 expect(output).toBeDefined()
 const spec=JSON.parse(output)
 expect(spec.type).toBe('html')
 expect(spec.html).toContain('data-market-search')
 expect(spec.html).toContain('2026-10-21 16:14:48（北京时间）')
 expect(readTemplateModel(spec).data).toEqual({...observed,type:'market',variant:'table'})
})

describe('bounded sourced table route',()=>{
 it.each([[32,1],[1,100]])('retains all %i columns and %i rows without coercing values',(columns,rows)=>{
  const data=synthetic(columns,rows)
  expect(model(data)).toEqual({...data,type:'market',variant:'table'})
  const market={...data,type:'market',variant:'table'}
  expect(renderMarketArtifact(market)).not.toBeNull()
  expect(templateDataIssue(market)).toBeNull()
 })
 it.each([[33,1],[1,101]])('switches %i columns and %i rows to complete readable delivery',(columns,rows)=>{
  const data=synthetic(columns,rows),market={...data,type:'market',variant:'table'}
  expect(model(data).columns).toEqual(data.columns)
  expect(model(data).rows).toEqual(data.rows)
  expect(JSON.parse(accept(data)).html).toContain('data-readable-page-size')
  expect(renderMarketArtifact(market)).toBeNull()
  expect(templateDataIssue(data)).toMatch(/32|100/)
  expect(templateDataIssue(market)).toMatch(/32|100/)
 })
 it('uses readable delivery above native capacity and preserves small native tables',()=>{
  const {asOf,...ordinary}=synthetic(13)
  expect(model(ordinary).rows).toEqual(ordinary.rows)
  const twelve={...ordinary,columns:ordinary.columns.slice(0,12),rows:ordinary.rows.map(row=>row.slice(0,12))}
  expect(JSON.parse(accept(twelve))).toEqual(twelve)
  expect(model(synthetic(3)).columns).toHaveLength(3)
  const {asOf:date,...noteOnly}=synthetic(13)
  expect(model({...noteOnly,note:'来源与时点记录在行内'}).asOf).toBe('静态快照 · 来源与时点见表格及说明')
 })
 it('preserves indexed object rows and explicit unique keyed market rows',()=>{
  const data=synthetic(13)
  expect(model({...data,rows:data.rows.map(row=>Object.fromEntries(row.map((value,i)=>[i,value])))}).rows).toEqual(data.rows)
  const market={...data,type:'market',variant:'table',columns:data.columns.map((label,i)=>({key:'c'+i,label})),rows:data.rows.map(row=>Object.fromEntries(row.map((value,i)=>['c'+i,value])))}
  expect(model(market).rows).toEqual(data.rows)
  expect(model(market).columns).toEqual(data.columns)
 })
 it('accepts generic text and numeric capacity boundaries without rewriting their values',()=>{
  const data={...synthetic(3),title:'题'.repeat(256),columns:['列'.repeat(128),'负数','文本精度'],rows:[['值'.repeat(512),-1e15,'0001.230000']],asOf:'时'.repeat(2000),note:'注'.repeat(2000)}
  expect(model(data)).toEqual({...data,type:'market',variant:'table'})
 })
 it('preserves the existing wider market text/scalar contract independently of generic capacities',()=>{
  const data={...synthetic(3),type:'market',variant:'table',columns:['列'.repeat(2000),'空字符串','大数'],rows:[['值'.repeat(513),'',1e16]]}
  expect(templateDataIssue(data)).toBeNull()
  expect(model(data)).toEqual({...data,rows:[['值'.repeat(513),'—',1e16]]})
  for(const patch of [{columns:['列'.repeat(2001),'空字符串','大数']},{asOf:'时'.repeat(2001)},{note:'注'.repeat(2001)}]){
   expect(renderMarketArtifact({...data,...patch})).toBeNull()
   expect(templateDataIssue({...data,...patch})).toBeTruthy()
  }
 })
 const invalids={
  version:a=>{a.version=2},extra:a=>{a.extra=true},variant:a=>{a.variant='table'},
  emptyColumns:a=>{a.columns=[]},emptyRows:a=>{a.rows=[]},wrongWidth:a=>{a.rows[0].pop()},
  emptyTitle:a=>{a.title=' '},longTitle:a=>{a.title='x'.repeat(257)},
  emptyLabel:a=>{a.columns[0]=''},longLabel:a=>{a.columns[0]='x'.repeat(129)},
  booleanCell:a=>{a.rows[0][0]=false},objectCell:a=>{a.rows[0][0]={x:1}},largeNumber:a=>{a.rows[0][0]=1e15+1},
  badDate:a=>{a.asOf=4},emptyDate:a=>{a.asOf=''},longDate:a=>{a.asOf='x'.repeat(2001)},
  badNote:a=>{a.note={source:'x'}},emptyNote:a=>{a.note=' '},longNote:a=>{a.note='x'.repeat(2001)}
 }
 it.each(Object.entries(invalids))('rejects previously invalid generic input: %s',(_,mutate)=>{
  const data=synthetic(13);mutate(data)
  expect(accept(data)).toBeUndefined()
  expect(templateDataIssue(data)).toBeTruthy()
 })
 it('rejects nonfinite and nonscalar cells before market rendering',()=>{
  for(const value of [NaN,Infinity,null,false,{x:1}]){
   const data={...synthetic(13),type:'market',variant:'table'};data.rows[0][0]=value
   expect(renderMarketArtifact(data)).toBeNull()
   expect(templateDataIssue(data)).toBeTruthy()
  }
 })
 it.each([' ',null,'x'.repeat(513)])('preserves incomplete or long cells without rejecting other acquired records',value=>{
  const data=synthetic(13);data.rows[0][0]=value
  const output=JSON.parse(accept(data))
  if(value!==' ')expect(output.html).toContain('data-readable-snapshot')
  expect(model(data).rows[0].slice(1)).toEqual(data.rows[0].slice(1))
  if(typeof value==='string'&&value.trim())expect(model(data).rows[0][0]).toBe(value)
  else expect(output.html).toContain(value===null?'来源未提供':'—')
 })
 it('states the interactive limits in both generic and market generation guidance',()=>{
  for(const prompt of [TABLE_GUIDANCE,MARKET_ARTIFACT_PROMPT,marketPanelSchema('table')]){
   expect(prompt).toContain('1–32列');expect(prompt).toContain('1–100行')
  }
 })
 it('continues enforcing rendered HTML capacity instead of truncating a valid table',()=>{
  const full=synthetic(32,100),market={...full,type:'market',variant:'table'}
  expect(templateDataIssue(full)).toBeNull();expect(templateDataIssue(market)).toBeNull()
  expect(renderMarketArtifact(market)).not.toBeNull()
  // Host HTML now supports this complete 3,200-cell table, not only 200 KB.
  expect(model(full).rows).toEqual(full.rows)
  const data=synthetic(32,100);data.rows=data.rows.map(row=>row.map(()=>'<'.repeat(512)))
  expect(accept(data)).toBeUndefined()
 })
})
