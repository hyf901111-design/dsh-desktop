import {createHash} from 'node:crypto'
import {mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

/** Transport fixture only. It is never installed as the real K3-created report. */
export async function homeReportAssetsFixture({schemaVersion=1}={}){
 const directory=await mkdtemp(join(tmpdir(),'home-report-assets-'))
 const deliveryNames=schemaVersion===2?{html:'测试公司 专业投资研究报告 20261023 v1.html',pdf:'测试公司 专业投资研究报告 20261023 v1.pdf'}:undefined
 const auditFiles=schemaVersion===2?['evidence.json','calculations.json','validation.json','run.json']:[]
 const auditLinks=auditFiles.map(name=>`<a href="./${name}">${name}</a>`).join('')
 const html=Buffer.from('<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>测试报告</title></head><body><h1>测试报告</h1><section>测试研究材料，不是实际投资报告。</section>'+auditLinks+'</body></html>')
 // Reuse a valid PDF container; no claim is made that this fixture is a generated report.
 const pdf=await readFile('packages/dsh-research-task-runtime/assets/home-presentation/source-report.pdf')
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
 const auditBytes=Object.fromEntries(auditFiles.filter(name=>name!=='run.json').map(name=>[name,Buffer.from(JSON.stringify({fixture:true,kind:name,report:'transport-only'}))]))
 if(schemaVersion===2)auditBytes['run.json']=Buffer.from(JSON.stringify({fixture:true,kind:'run.json',artifacts:deliveryNames,outputs:{[deliveryNames.html]:hash(html),[deliveryNames.pdf]:hash(pdf),...Object.fromEntries(Object.entries(auditBytes).map(([name,bytes])=>[name,hash(bytes)])),'report-quality.json':'e'.repeat(64)}}))
 const metadata={schemaVersion,reportTitle:'测试公司研究报告',companyName:'测试公司',companyCode:'TEST',researchAsOf:'2026-10-23',reportPages:28,
  htmlFile:'research-report.html',pdfFile:'research-report.pdf',htmlSha256:hash(html),pdfSha256:hash(pdf),localPresetOnly:true,
  ...schemaVersion===2?{deliveryNames,audit:Object.fromEntries(Object.entries(auditBytes).map(([name,bytes])=>[name,hash(bytes)]))}:{},
  chapters:['投资要点','公司与行业','财务分析','估值分析','风险因素'].map((title,index)=>({id:'section-'+index,title})),
  sources:[{id:'s1',title:'测试年报',url:'https://example.test/annual',asOf:'2026-10-23'},{id:'s2',title:'测试公告',url:'https://example.test/announcement',asOf:'2026-10-23'}],
  chartCatalog:['收入变化','利润构成','估值比较'].map((title,index)=>({id:'chart-'+index,title,sourceIds:['s1'],asOf:'2026-10-23'})),
  keyFindings:['测试结论一：按公开披露区分历史业绩和预测。','测试结论二：估值比较应使用一致口径。','测试结论三：情景测算不能视为收益承诺。'],
  provenance:{product:'EWork Odyssey',sessionId:'session-253912dd-cf7d-4669-9da7-361d4bf24166',model:'Kimi K3',generatedAt:'2026-10-25T08:00:00Z'},
 }
 await Promise.all([writeFile(join(directory,metadata.htmlFile),html),writeFile(join(directory,metadata.pdfFile),pdf),writeFile(join(directory,'source-metadata.json'),JSON.stringify(metadata)),...Object.entries(auditBytes).map(([name,bytes])=>writeFile(join(directory,name),bytes))])
 return{directory,html,pdf,metadata,auditBytes,deliveryNames}
}
