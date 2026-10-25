import {createHash} from 'node:crypto'
import {mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

/** Transport fixture only. It is never installed as the real K3-created report. */
export async function homeReportAssetsFixture(){
 const directory=await mkdtemp(join(tmpdir(),'home-report-assets-'))
 const html=Buffer.from('<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>测试报告</title></head><body><h1>测试报告</h1><section>测试研究材料，不是实际投资报告。</section></body></html>')
 // Reuse a valid PDF container; no claim is made that this fixture is a generated report.
 const pdf=await readFile('packages/dsh-research-task-runtime/assets/home-presentation/source-report.pdf')
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
 const metadata={schemaVersion:1,reportTitle:'测试公司研究报告',companyName:'测试公司',companyCode:'TEST',researchAsOf:'2026-10-23',reportPages:28,
  htmlFile:'research-report.html',pdfFile:'research-report.pdf',htmlSha256:hash(html),pdfSha256:hash(pdf),localPresetOnly:true,
  chapters:['投资要点','公司与行业','财务分析','估值分析','风险因素'].map((title,index)=>({id:'section-'+index,title})),
  sources:[{id:'s1',title:'测试年报',url:'https://example.test/annual',asOf:'2026-10-23'},{id:'s2',title:'测试公告',url:'https://example.test/announcement',asOf:'2026-10-23'}],
  chartCatalog:['收入变化','利润构成','估值比较'].map((title,index)=>({id:'chart-'+index,title,sourceIds:['s1'],asOf:'2026-10-23'})),
  keyFindings:['测试结论一：按公开披露区分历史业绩和预测。','测试结论二：估值比较应使用一致口径。','测试结论三：情景测算不能视为收益承诺。'],
  provenance:{product:'EWork Odyssey',sessionId:'session-253912dd-cf7d-4669-9da7-361d4bf24166',model:'Kimi K3',generatedAt:'2026-10-25T08:00:00Z'},
 }
 await Promise.all([writeFile(join(directory,metadata.htmlFile),html),writeFile(join(directory,metadata.pdfFile),pdf),writeFile(join(directory,'source-metadata.json'),JSON.stringify(metadata))])
 return{directory,html,pdf,metadata}
}
