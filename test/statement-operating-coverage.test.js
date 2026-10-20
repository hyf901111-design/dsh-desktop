import {it,expect,vi} from 'vitest'
import {componentSourceCollector} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {statementOperatingCoverageIssue,statementOperatingRequested} from '../packages/dsh-research-task-runtime/statement-operating-coverage.js'

const tool='ework__business',codes=['600011.SH','600027.SH','600795.SH']
const names=['华能国际','华电国际','国电电力']
const request='工作台：火电利润弹性观察\n本面板：最新已披露财务与经营指标对比\n检索三家公司（600011.SH、600027.SH、600795.SH）最新已披露的营业收入、归母净利润和装机容量/发电量等经营数据。以实际披露字段为准，未取得逐项说明，不缩小研究范围。\n仅生成本面板，优先使用 table 类型。\n【原始工作台需求】\n研究三家公司，以沪深300为参考，最多4个组件，不补模拟值。'
const income={tool,args:{http_method:'GET',nameEn:'getFdmtISLT2018',url_params:{ticker:'600011|600027|600795'}},response:{retCode:1,data:codes.map((code,i)=>({ticker:code.slice(0,6),secID:code.slice(0,6)+'.XSHG',exchangeCD:'XSHG',secShortName:names[i],endDate:'2026-06-30',revenue:100+i}))}}
const operating=(tickers=codes.map(c=>c.slice(0,6)))=>({tool,args:{http_method:'GET',nameEn:'getEquOperData',url_params:{ticker:tickers.join('|'),beginDate:'20260101',endDate:'20260630'}},response:{retCode:1,data:tickers.map(ticker=>({ticker,secID:ticker+'.XSHG',exchangeCD:'XSHG',itemName:'累计发电量',value:110,unit:'亿千瓦时',endDate:'2026-06-30'}))}})
const card=(complete=false)=>({version:1,type:'table',title:'财务与经营对比',columns:['公司（代码）','营业收入（元）','经营数据'],rows:codes.map((code,i)=>[names[i]+'（'+code+'）',100+i,complete?'累计发电量 110 亿千瓦时（2026-06-30）':'本次未取得（利润表接口未覆盖，标注缺失）']),note:'来源：本次实际取得的接口。未取得的经营数据不补模拟值。'})
const event=(id,value,isError=false)=>({type:'tool/result',data:{message:{source:{callId:id},content:[{type:'tool-result',isError,content:[{type:'text',text:JSON.stringify(value)}]}]}}})
const collect=(collector,id,args,value,isError=false)=>{collector.accept({type:'tool/call',data:{callId:id,name:tool,arguments:JSON.stringify(args)}});collector.accept(event(id,value,isError))}

it('distinguishes rejected parameters, real unavailable queries and empty successful queries without promoting failures to data evidence',()=>{
 const collector=componentSourceCollector([tool])
 collect(collector,'bad',{...operating().args,url_params:{ticker:'600011',mergedFlag:'1'}},{error:'unsupported parameter',code:'INVALID_API_PARAMETERS'})
 collect(collector,'blocked',{...operating().args,url_params:{ticker:'600027'}},{error:'access denied',code:'PERMISSION_DENIED'},true)
 collect(collector,'empty',{...operating().args,url_params:{ticker:'600795'}},{retCode:1,data:[]})
 expect(collector.attempts).toEqual([
  {tool,api:'getEquOperData',entities:['600011'],status:'invalid_request',code:'INVALID_API_PARAMETERS'},
  {tool,api:'getEquOperData',entities:['600027'],status:'unavailable',code:'PERMISSION_DENIED'},
  {tool,api:'getEquOperData',entities:['600795'],status:'empty'}
 ])
 expect(collector.records).toEqual([expect.objectContaining({response:{retCode:1,data:[]}})])
})

it('continues only the missing operating acquisition with tools while preserving the original scope and existing income data',async()=>{
 const calls=[]
 const runtime=new ResearchTaskRuntime({adapter:{start:async options=>{calls.push(options);return {childSessionId:'operating-'+calls.length,dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(card(calls.length>1))}],sourceRecords:calls.length===1?[income]:[operating()]})}},dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:request})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('completed'))
  expect(calls).toHaveLength(2)
  expect(calls[1].synthesisOnly).toBe(false)
  for(const code of codes)expect(calls[1].prompt).toContain(code)
  expect(calls[1].prompt).toContain('经营数据尚未实际查询')
  expect(calls[1].prompt).toContain('不重新查询已取得的利润表')
  expect(calls[1].prompt).toContain('【原始工作台需求】')
  const final=readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'task'}).finalOutput)).data
  expect(final.rows.map(row=>row[1])).toEqual([100,101,102])
  expect(final.rows.every(row=>row[2].includes('110 亿千瓦时'))).toBe(true)
 }finally{await runtime.dispose()}
})

it.each(['metadata','invalid_request','unverified','wrong-company'])('does not count %s as operating retrieval for all requested entities',mode=>{
 const source=operating(['600011','600027'])
 const attempts=mode==='wrong-company'?[{tool,api:'getEquOperData',entities:['000001'],status:'empty'}]:[{tool,api:'getEquOperData',entities:['600795'],status:mode}]
 if(mode==='metadata')source.purpose='discovery'
 const issue=statementOperatingCoverageIssue(card(),request,[income,source],attempts)
 expect(issue).toContain('600795.SH')
 if(mode!=='metadata'){expect(issue).not.toContain('600011.SH');expect(issue).not.toContain('600027.SH')}
})

it.each(['empty','unavailable'])('accepts a genuine %s only with the actual per-company missing reason',status=>{
 const partial=operating(['600011','600027']),attempts=[{tool,api:'getEquOperData',entities:['600795'],status}]
 expect(statementOperatingCoverageIssue(card(),request,[income,partial],attempts)).toContain('600795.SH')
 const unavailable=card();unavailable.rows[2][2]=status==='empty'?'经营数据：来源未返回记录':'经营数据：查询失败（权限不足）'
 expect(statementOperatingCoverageIssue(unavailable,request,[income,partial],attempts)).toBeUndefined()
})

it('allows a fetched primary company report while rejecting a recommendation with the same title',()=>{
 const primary={tool:'web_fetch',snapshotRows:[{sourceTitle:'国电电力2026年三季度电量情况公告',primary:true}]}
 expect(statementOperatingCoverageIssue(card(),request,[income,operating(['600011','600027']),primary])).toBeUndefined()
 delete primary.snapshotRows[0].primary
 expect(statementOperatingCoverageIssue(card(),request,[income,operating(['600011','600027']),primary])).toContain('600795.SH')
})

it('keeps unrelated panel intent, explicit exclusions and static template selection separate from whole-board scope',()=>{
 expect(statementOperatingRequested('营业收入和发电量对比')).toBe(true)
 expect(statementOperatingRequested('营业收入对比。不要查询装机和发电量等经营数据。')).toBe(false)
 expect(statementOperatingCoverageIssue(card(),'本面板：煤电政策与行业动态',[income])).toBeUndefined()
 expect(statementOperatingCoverageIssue(card(),'财务与经营对比；仅用模拟数据',[income])).toBeUndefined()
 const other={...income,response:{retCode:1,data:income.response.data.map(row=>({...row,exchangeCD:'XSHE'}))}}
 expect(statementOperatingCoverageIssue(card(),request,[other])).toBeUndefined()
 expect(statementOperatingCoverageIssue({...card(),type:'market',variant:'table'},request,[income,operating()])).toBeUndefined()
})

it('does not force a table layout for an honest source failure or borrow a financial-column error as an operating reason',()=>{
 const sources=[income,operating(['600011','600027'])],attempts=[{tool,api:'getEquOperData',entities:['600795'],status:'unavailable'}]
 const kpi={version:1,type:'kpi',items:[{label:'国电电力 600795.SH 发电量',value:'来源不可用（权限不足）'}]}
 expect(statementOperatingCoverageIssue(kpi,request,sources,attempts)).toBeUndefined()
 const note={version:1,type:'note',note:'600795.SH 经营数据查询失败（权限不足），财务数据保留。'}
 expect(statementOperatingCoverageIssue(note,request,sources,attempts)).toBeUndefined()
 const wrong=card();wrong.rows[2][1]='查询失败（权限不足）'
 expect(statementOperatingCoverageIssue(wrong,request,sources,attempts)).toContain('600795.SH')
})

it('never records directory calls, rejected transport payloads or unapproved tools as operating results',()=>{
 const collector=componentSourceCollector([tool],[{name:tool,description:'接口发现，不是业务数据'}])
 collect(collector,'directory',operating().args,operating().response)
 expect(collector.attempts).toEqual([])
 const failed=componentSourceCollector([tool])
 collect(failed,'transport',operating().args,{retCode:1,data:[]},true)
 expect(failed.records).toEqual([])
 expect(failed.attempts[0].status).toBe('unverified')
 collect(failed,'secret',{...operating().args,token:'not-persisted'},{error:'private error not-persisted',code:'PERMISSION_DENIED'},true)
 expect(JSON.stringify(failed.attempts)).not.toContain('not-persisted')
})

it('does not accept the same unqueried missing-data draft after the single bounded continuation',async()=>{
 let starts=0
 const runtime=new ResearchTaskRuntime({adapter:{start:async()=>({childSessionId:'unqueried-'+ ++starts,dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(card())}],sourceRecords:[income]})}),dispose:async()=>{}},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'task'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:request})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).state).toBe('failed'))
  expect(starts).toBe(2)
  expect(runtime.inspect({parentSessionId:'parent',taskId:'task'}).error).toContain('经营数据尚未实际查询')
 }finally{await runtime.dispose()}
})
