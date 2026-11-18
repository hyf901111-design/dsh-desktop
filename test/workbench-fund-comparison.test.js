import {describe,expect,it,vi} from 'vitest'
import {acquireFundComparison,fundComparisonArtifacts,fundComparisonCount,fundComparisonReader,isFundComparisonRead,parseFundComparisonCatalog} from '../packages/dsh-research-task-runtime/workbench-fund-comparison.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {createToolProxy} from '../packages/dsh-integration-runtime/tool-proxy.js'

const original='给固收投委会搭个纯债基金比较工作台。至少比较8只中长期纯债基金的近一年收益、近半年最大回撤、年化波动率、最新净值和规模，保留管理人、统计区间及来源，便于筛选和排序。'
const now=new Date('2026-11-11T03:00:00Z')
const code=i=>String(i).padStart(6,'0')
const choices=Array.from({length:8},(_,i)=>({code:code(i+1),name:`基金${i+1}纯债`}))
const observations=Array.from({length:366},(_,i)=>new Date(Date.UTC(2025,10,10+i)).toISOString().slice(0,10).replaceAll('-','')).filter(d=>![0,6].includes(new Date(d.replace(/(\d{4})(\d{2})(\d{2})/u,'$1-$2-$3')).getUTCDay()))
const scope=new AbortController().signal
const response=(records,offset=0,next=null)=>({records,pagination:{returned:records.length,offset,possiblyMore:next!==null,nextOffset:next}})
function fixture({missing,overflow=false}={}){
 return vi.fn(async ({api_name,params,limit,offset=0})=>{
  const ts_code=params.ts_code, index=Number(ts_code.slice(0,6))
  if(api_name==='fund_basic') {
   expect(params.market).toBe('O')
   return response(index===missing?[]:[{ts_code,name:`样本${index}`,management:'真实测试管理人',fund_type:'债券型',status:'L',found_date:'20200101'}])
  }
  const all=observations.map((nav_date,i)=>({ts_code,nav_date,unit_nav:1+i/10000,adj_nav:1+((i%30)-i/index)/1000,net_asset:i===200?1.6e8:null,ann_date:i===200?'20260915':null}))
  if(overflow&&limit===300)throw Error('Too large',{cause:{code:'RESPONSE_TOO_LARGE'}})
  return response(all.slice(offset,offset+limit),offset,offset+limit<all.length?offset+limit:null)
 })
}
describe('same-cohort bond-fund workbench',()=>{
 it('routes only supported direct-source comparison and parses a non-executable directory',()=>{
  expect(fundComparisonCount(original)).toBe(8)
 const followup=original+' 请额外做一张原生 KPI 卡「样本概览指标」，计算近一年收益率中位数。'
 expect(fundComparisonCount(followup)).toBe(8)
 expect(fundComparisonCount(followup+'不要联网。')).toBeNull()
  for(const prefix of ['禁止联网，','只用附件，','用Tushare，','做个演示，'])expect(fundComparisonCount(prefix+original)).toBeNull()
  const row=(code,name,category)=>[code,'',name,category,'']
  expect(parseFundComparisonCatalog('var r = '+JSON.stringify([
   row('000001','某纯债A','债券型-长债'),row('000002','某纯债C','债券型-长债'),row('000003','另一纯债','债券型-中短债'),row('000004','二级债','债券型-长债')
  ])+';')).toEqual([{code:'000001',name:'某纯债A'}])
  expect(()=>parseFundComparisonCatalog('var r = []; fetch("https://example.org");')).toThrow()
 })
 it('uses the exact granted provider through ordinary tool policy, with only a per-dispatch planning exception',async()=>{
  const mark=Symbol.for('ework.builtin-tushare.read')
  const binding={id:'test',connectionId:'builtin:tushare-mcp:0123456789abcdef',rawName:'tushare_query',effect:'read',description:'managed query',schemaDigest:'hash',enabled:true,inputSchema:{type:'object',properties:{}}}
  const proxy=createToolProxy(binding,{})
  expect(proxy[mark]).toBe(true)
  expect(createToolProxy({...binding,connectionId:'custom'}, {})[mark]).toBeUndefined()
  const catalog = {...binding,rawName:'tushare_catalog'}
  const catalogMark=Symbol.for('ework.builtin-tushare.catalog')
  expect(createToolProxy(catalog,{})[catalogMark]).toBe(true)
  expect(createToolProxy({...catalog,connectionId:'custom'}, {})[catalogMark]).toBeUndefined()
  expect(createToolProxy({...catalog,effect:'unknown'}, {})[catalogMark]).toBeUndefined()
  const agent={},token={},name=proxy.name
  let dispatch
  const ctx={tools:{schemas:()=>[{name:'public_data_query'},{name}],get:()=>proxy,execute:async value=>{
   dispatch=value
   expect(isFundComparisonRead(value)).toBe(true)
   expect(isFundComparisonRead({...value,parent:{}})).toBe(false)
   expect(isFundComparisonRead({...value,agent:{}})).toBe(false)
   return {isError:false,value:{content:[{type:'text',text:JSON.stringify({source:'Tushare',api:'fund_basic',...response([])})}]}}
  }}}
  const query=fundComparisonReader(ctx,agent)
  await expect(query({api_name:'fund_basic'},{token,rootCallId:'planning'},scope)).resolves.toMatchObject({records:[]})
  expect(isFundComparisonRead(dispatch)).toBe(false)
 })
 it('joins eight complete products once, uses the actual half-year window, and passes the real native validators',async()=>{
  const query=fixture()
  const result=await acquireFundComparison({count:8,query,signal:scope,now,catalog:async()=>choices})
  expect(query).toHaveBeenCalledTimes(16)
  expect(result.rows).toHaveLength(8)
  expect(result.end).toBe('20261110')
  expect(result.halfStart).toBe('20260510')
  expect(result.rows.every(row=>row.manager&&row.scale===1.6&&row.drawdown<0&&row.volatility>0)).toBe(true)
  expect(result.rows.map(r=>r.gain)).toEqual(result.rows.map(r=>r.gain).sort((a,b)=>b-a))
  const artifacts=fundComparisonArtifacts(result)
  const [table]=artifacts
  const navDate=table.columns.indexOf('最新净值数据日'),scaleDate=table.columns.indexOf('规模数据日')
  expect(table.rows.every(row=>row[navDate]==='2026-11-10'&&row[navDate]!==row[scaleDate])).toBe(true)
  expect(artifacts[1].labels).toEqual(artifacts[2].labels)
  expect(artifacts[0].rows.map(r=>r[0])).toEqual(artifacts[1].labels)
  expect(validateWorkbench({requestId:'fund-test',title:'基金比较',panels:artifacts.map(artifact=>({title:artifact.title,type:artifact.type,prompt:'同批数据',artifact}))}).panels).toHaveLength(3)
 })
 it('preserves managed-provider failures and stops instead of treating every failed call as an empty fund',async()=>{
  const name='managed_query',agent={},token={},signal=new AbortController().signal
  const execute=vi.fn(async()=>({isError:true,error:{message:'接口读取被策略阻止',info:{code:'ACCESS_DENIED'}},content:[]}))
  const read=fundComparisonReader({tools:{schemas:()=>[{name:'public_data_query'},{name}],get:()=>({[Symbol.for('ework.builtin-tushare.read')]:true}),execute}},agent)
  await expect(acquireFundComparison({count:8,query:(args,s)=>read(args,{token},s),signal,now,catalog:async()=>choices})).rejects.toMatchObject({message:'接口读取被策略阻止',code:'ACCESS_DENIED'})
  expect(execute).toHaveBeenCalledTimes(1)
 })
 it('serializes shared acquisition across the full cohort',async()=>{
  let active=0,max=0
  const data=fixture()
  await acquireFundComparison({count:8,signal:scope,now,catalog:async()=>choices,query:async args=>{
   active++;max=Math.max(max,active)
   await Promise.resolve()
   const result=await data(args)
   active--;return result
  }})
  expect(max).toBe(1)
 })
 it('repaginates from the same offset and fails closed when one of eight profiles is missing',async()=>{
  const query=fixture({overflow:true})
  await expect(acquireFundComparison({count:8,query,signal:scope,now,catalog:async()=>choices})).resolves.toMatchObject({rows:Array(8).fill(expect.any(Object))})
  expect(query.mock.calls.some(([args])=>args.api_name==='fund_nav'&&args.limit===100&&args.offset===200)).toBe(true)
  await expect(acquireFundComparison({count:8,query:fixture({missing:8}),signal:scope,now,catalog:async()=>choices})).rejects.toThrow('至少 8 只')
 })
})
