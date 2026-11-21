// @vitest-environment happy-dom
import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {getComponentSourceInfo} from '../scripts/lib/component-source-info.mjs'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'

const fixture=name=>JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'))
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
