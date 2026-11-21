// @vitest-environment happy-dom
import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {getComponentSourceInfo} from '../scripts/lib/component-source-info.mjs'
import {workbenchOfflineRequest} from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'
import {initialWorkbenchInformationPlan} from '../packages/dsh-research-task-runtime/workbench-planning-context.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'

const rawFixture=name=>readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8')
const fixture=name=>JSON.parse(rawFixture(name))
const requests=fixture('workbench-public-table-requests.json')
const etf=fixture('workbench-etf-holdings-first-call.json')
const management={
  requestId:'annual-flows',title:'资金流复盘',dataMode:'source',sharedDatasets:[{
    id:'flows',label:'BlackRock 2024 Form 10-K',fields:[
      ['client','客户及产品类别'],['aum24','2024年末AUM'],['aum23','2023年末AUM'],['net24','2024全年净流入'],['net23','2023全年净流入']
    ].map(([key,label])=>({key,label})),pastedTable:{block:1,header:true,identity:'client',numericFields:['aum24','aum23','net24','net23']}
  }],panels:[
    {title:'净流入',type:'chart',view:{dataset:'flows',variant:'groupedBar',unit:'百万美元',sections:[{kind:'records',label:'client',fields:['net24','net23']}]}},
    {title:'完整明细',type:'view',view:{dataset:'flows',sections:[{kind:'records',fields:['client','aum24','aum23','net24','net23']}]}}
  ]
}
it.each([['ETF持仓',etf],['资管经营',management]])('keeps the original %s disclosure actionable in each native card', (role,plan)=>{
  const originalRequest=requests[role]
  const url=originalRequest.split('\n').find(line=>line.startsWith('https://'))
  const result=validateWorkbench({...plan,originalRequest})
  for(const {artifact} of result.panels){
    const containerSpec=JSON.parse(acceptArtifactOutput(JSON.stringify(artifact)))
    const details=getComponentSourceInfo({containerSpec})
    expect(new Set(details.records.map(row=>row.url).filter(Boolean))).toEqual(new Set([url]))
  }
  if(role==='ETF持仓')expect(result.sharedDatasets[0].asOf).toBe('2025-12-31')
  expect(result.panels[0].artifact.sources[0].url).toBe(url)
  expect(validateWorkbench(result).panels).toEqual(result.panels)
})
it('does not attribute unrelated, competing, local or credential-bearing URLs to a pasted table',()=>{
  const request=requests.ETF持仓
  const url=request.split('\n').find(line=>line.startsWith('https://'))
  for(const originalRequest of [
    request.replace('来源为上海证券交易所披露的基金季报。','如需帮助请参考以下页面。'),
    request.replace(url,url+'\nhttps://www.sse.com.cn/another.pdf'),
    request.replace('来源为','来源为其他报告。来源为'),request.replace('来源为上海证券交易所披露的基金季报','来源为两份年报和季报'),
    request.replace(url,url+'?X-Amz-Signature=example'),request.replace(url,url+'#access_token=example'),
    request.replace(url,'https://user:example@www.sse.com.cn/report.pdf'),request.replace(url,'http://127.0.0.1/report.pdf'),
    request.replace(url,'file:///tmp/report.pdf'),request.replace(url,'2025-12-31'),
    request.replace(url,'/资料/报告.pdf'),request.replace(url,url+'\n说明\t仅供参考\n\n另一张未注明出处的表。'), request+'\n\n类别\t收入\n甲\t3'
  ]){
    const result=validateWorkbench({...etf,originalRequest})
    expect(result.panels[0].artifact.sources[0].url).toBeUndefined()
    expect(result.panels[1].artifact.dataset.sourceUrl).toBeUndefined()
  }
})

it('accepts first dashboard submissions with a single flow section and original year-prefixed field names',()=>{
  const first=fixture('workbench-public-table-plans.json')
  const compile=(role,changes={})=>validateWorkbench({requestId:'chart-first',...structuredClone(first[role]),originalRequest:requests[role],...changes})
  const etf=compile('ETF持仓')
  expect(etf.panels[0].artifact).toMatchObject({variant:'horizontal',labels:['宁德时代','贵州茅台','中国平安','中际旭创','紫金矿业'],series:[{values:[3.81,3.38,2.86,2.66,2.23]}]})
  expect(compile('ETF持仓',{originalRequest:requests.ETF持仓.replace('持仓条形图','持仓柱状图')}).panels[0].artifact.variant).toBe('bar')
  expect(()=>compile('ETF持仓',{panels:first.ETF持仓.panels.map((p,i)=>i?p:{...p,view:{...p.view,navigation:'tabs'}})})).toThrow()
  const blk=compile('资管经营')
  expect(blk.panels[0].artifact).toMatchObject({variant:'groupedBar',series:[{values:[24367,390433,64447,9374,152730]},{values:[-8473,185942,87106,-55125,79245]}]})
  const table=blk.panels[1].artifact.dataset
  for(const label of ['2024年末AUM','2023年末AUM','2024全年净流入','2023全年净流入'])expect(table.fields.filter(f=>f.label===label)).toHaveLength(1)
  expect(validateWorkbench(blk).panels).toEqual(blk.panels)
  const raw=structuredClone(first.资管经营.sharedDatasets[0])
  raw.pastedTable.numericFields[0]='不存在的列'
  expect(()=>compile('资管经营',{sharedDatasets:[raw]})).toThrow(/数值列/)
  expect(()=>compile('资管经营',{originalRequest:requests.资管经营.replace('2023年末AUM\t','2024年末AUM\t')})).toThrow(/表头|列键/)
  const source=first.资管经营.sharedDatasets[0].id
  const total={id:'totals',label:'总流入',aggregate:{dataset:source,groupBy:[],measures:[{key:'amount',label:'全年净流入',op:'sum',field:'2024全年净流入'}]}}
  const aggregated=compile('资管经营',{sharedDatasets:[...first.资管经营.sharedDatasets,total],panels:[{title:'合计',type:'kpi',view:{dataset:'totals',sections:[{kind:'records',fields:['amount']}]}}]})
  expect(aggregated.panels[0].artifact.items[0].value).toBe(641351)

})

it('retains the one official locator for a finalized historical table and avoids re-fetching its full period',()=>{
  const originalRequest=rawFixture('workbench-treasury-dated-snapshot.txt').trim()
  const url=originalRequest.match(/^https:\/\/[^\n]+/mu)[0]
  const input={requestId:'historical',title:'三日复核',sharedDatasets:[{id:'history',label:'日期与收益率',pastedTable:{block:1,header:true,identity:'日期',numericFields:['10年期收益率']}}],
    panels:[{title:'历史读数',type:'chart',view:{dataset:'history',variant:'line',unit:'%',sections:[{kind:'records',label:'日期',fields:['10年期收益率']}]}}]}
  const output=validateWorkbench({...input,originalRequest})
  expect(output.panels[0].artifact).toMatchObject({variant:'line',unit:'%',sources:[{url}],series:[{values:[4.62,4.55,4.58]}]})
  expect(workbenchOfflineRequest(originalRequest)).toBe(true)
  expect(workbenchOfflineRequest(originalRequest+'\n请去官网核实原始数据。')).toBe(false)
  for(const altered of [originalRequest.replace(url,'https://example.org/unrelated'),originalRequest.replace(url,url+'&token=abc'),originalRequest.replace(url,url+'?token=abc'),originalRequest.replace('数据已定稿','这里给出帮助网址。数据已定稿')]){
    expect(validateWorkbench({...input,originalRequest:altered}).sharedDatasets[0].sourceUrl).toBeUndefined()
  }
  const parts=requests.ETF持仓
  expect(initialWorkbenchInformationPlan(parts)).toContain('按这次要求组织图表和明细')
  expect(initialWorkbenchInformationPlan(parts,true)).toContain('arrange the charts and details as requested')
})

it.each(fixture('workbench-etf-unit-header-first-calls.json').map((args,i)=>[i+1,args]))('binds literal unit headers from ETF submission %s to the exact original columns',(_,args)=>{
  const originalRequest=requests.ETF持仓
  const {sharedDatasets,panels}=validateWorkbench({...args,requestId:'unit-headers',originalRequest})
  const sourceRows=originalRequest.trim().split('\n').slice(-5).map(line=>line.split('\t'))
  const url=originalRequest.split('\n').find(line=>line.startsWith('https://'))
  const dataset=sharedDatasets[0]
  expect(dataset.sourceUrl).toBe(url)
  expect(dataset.fields.filter(field=>field.key!=='id').map(field=>field.label)).toEqual(originalRequest.trim().split('\n').at(-6).split('\t'))
  const [rank,code,name,qty,amount,weight]=dataset.fields.filter(field=>field.key!=='id')
  expect(amount.minimumFractionDigits).toBe(2)
  expect(dataset.records.map(row=>[row[rank.key],row[code.key],row[name.key],row[qty.key],row[amount.key],row[weight.key]])).toEqual(
    sourceRows.map(([rank,code,name,qty,amount,weight])=>[rank,code,name,Number(qty),Number(amount),Number(weight)]))
  expect(panels[0].artifact).toMatchObject({type:'chart',variant:'horizontal',unit:'%',labels:sourceRows.map(row=>row[2]),series:[{values:sourceRows.map(row=>Number(row[5]))}],sources:[{url}]})
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(panels[1].artifact)))
  const doc=new DOMParser().parseFromString(spec.html,'text/html')
  const cells=[...doc.querySelectorAll('table tbody td')].map(cell=>cell.textContent.replaceAll(',',''))
  expect(cells.some(cell=>cell.includes('8589675214.80'))).toBe(true)
  expect(cells.some(cell=>cell.includes('7984305860.00'))).toBe(true)
  expect(getComponentSourceInfo({containerSpec:spec}).records.some(row=>row.url===url)).toBe(true)
  const malformed=structuredClone(args)
  if(malformed.sharedDatasets[0].fields)malformed.sharedDatasets[0].fields[4].label='其他金额（元）'
  else malformed.sharedDatasets[0].pastedTable.numericFields[1]='其他金额（元）'
  expect(()=>validateWorkbench({...malformed,requestId:'wrong-header',originalRequest})).toThrow()
  expect(()=>validateWorkbench({...args,requestId:'duplicate-header',originalRequest:originalRequest.replace('数量（股）\t公允价值（元）','公允价值（元）\t公允价值（元）')})).toThrow()
})

it('restores only a uniquely matched first ordinal from a real ETF disclosure and its full detail view',()=>{
 const args=fixture('workbench-etf-omitted-ordinal-first-call.json'),originalRequest=requests.ETF持仓
 const validate=(raw=originalRequest,call=args)=>validateWorkbench({...call,requestId:'source-ordinal',originalRequest:raw})
 const {sharedDatasets:[source],panels:[chart,detail]}=validate()
 const original=originalRequest.trim().split('\n').slice(-6).map(row=>row.split('\t'))
 expect(source.fields.filter(f=>f.key!=='id').map(f=>f.label)).toEqual(original[0])
 expect(source.records.map(row=>row['序号'])).toEqual(original.slice(1).map(row=>row[0]))
 expect(source.records.map(row=>row.id)).toEqual(original.slice(1).map(row=>row[1]))
 expect(chart.artifact.series[0].values).toEqual([3.81,3.38,2.86,2.66,2.23])
 expect(detail.artifact.view.sections[0].fields[0]).toBe('序号')
 expect(source.fields.find(f=>f.key==='fairValue').minimumFractionDigits).toBe(2)
 expect(source.sourceUrl).toContain('sse.com.cn')
 expect(validate(originalRequest.replace('全部字段','字段，不含序号')).panels[1].artifact.view.sections[0].fields).not.toContain('序号')
 for(const raw of [
  originalRequest.replace('序号\t','排名\t'),originalRequest.replace('序号\t股票代码','股票代码\t序号'),
  originalRequest.replace('股票代码\t股票名称','股票名称\t股票名称'),originalRequest.replace('2\t600519','9\t600519'),
  originalRequest.replace('数量（股）\t公允价值（元）','公允价值（元）\t数量（股）'),
 ])expect(()=>validate(raw)).toThrow()
 const partial=structuredClone(args);partial.sharedDatasets[0].fields.splice(1,1)
 expect(()=>validate(originalRequest,partial)).toThrow()
})

it('binds the dataset-level date identity in the original Treasury chart request to its disclosed rows', () => {
  const plan = fixture('workbench-treasury-identity-first-call.json')
  const originalRequest = rawFixture('workbench-treasury-dated-snapshot.txt').trim()
  const compile = (input, request = originalRequest) => validateWorkbench({...input, originalRequest:request})
  const canonical = structuredClone(plan)
  const source = canonical.sharedDatasets[0]
  source.pastedTable.identity = source.identity
  delete source.identity

  expect(compile(plan)).toEqual(compile(canonical))
  const result = compile(plan)
  const dates = ['2024-12-27','2024-12-30','2024-12-31']
  expect(result.sharedDatasets[0].records.map(row => row.id)).toEqual(dates)
  expect(result.panels[0].artifact).toMatchObject({
    type:'chart', variant:'line', labels:dates, series:[{values:[4.62,4.55,4.58]}], unit:'%',
    sources:[{url:originalRequest.split('\n')[1]}]
  })
  for (const alter of [
    draft => { draft.pastedTable.identity = 'y10' },
    draft => { draft.identity = 'missingDate' },
    draft => { draft.records = [{date:'2024-12-27',y10:4.62}] },
    draft => { draft.identity = 'y10' }
  ]) {
    const invalid = structuredClone(plan)
    alter(invalid.sharedDatasets[0])
    expect(() => compile(invalid)).toThrow()
  }
  expect(() => compile(plan, originalRequest.replace('2024-12-30\t','2024-12-27\t'))).toThrow()
})
