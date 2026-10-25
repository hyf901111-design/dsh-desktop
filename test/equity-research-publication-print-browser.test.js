import {afterAll,beforeAll,expect,it} from 'vitest'
import {mkdir,writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {join} from 'node:path'
import {createForecastDcfFixture} from './fixtures/equity-research-forecast-dcf.fixture.mjs'
import {runForecastDCF} from '../skills/ework-equity-research/scripts/lib/forecast-dcf.mjs'
import {renderReport} from '../skills/ework-equity-research/scripts/lib/report.mjs'

const artifacts=process.env.SHERLOCK_TEST_ARTIFACT_DIR||'/tmp/equity-renderer-task15-print-20261025'
let browser
beforeAll(async()=>{
 const pw=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(artifacts,{recursive:true})
},20000)
afterAll(()=>browser?.close())
function fixture(model=false){
 const f=createForecastDcfFixture();f.packet.report={profile:'brief',title:'研究判断与验证条件',summary:[{text:'以公开披露和固定研究条件核对经营与价值，不把测试结果冒充市场共识。'}],sections:[]}
 const diagnostics=[],calculation={ok:true,calculations:[],diagnostics,...model?{dcf:runForecastDCF(f.packet,f.facts,[],diagnostics,f.observations)}:{}}
 return{...f,validation:{ok:true,facts:f.facts,observations:f.observations,diagnostics:[]},calculation}
}
async function load(html){
 const page=await browser.newPage({viewport:{width:681,height:1120}})
 await page.route('**/*',route=>route.abort());await page.emulateMedia({media:'print'});await page.setContent(html);await page.evaluate(()=>document.fonts.ready)
 return page
}
async function print(page,name){
 const file=join(artifacts,name+'.pdf');await page.pdf({path:file,format:'A4',preferCSSPageSize:true,printBackground:true})
 return execFileSync(process.env.SHERLOCK_TEST_PDFTOTEXT||'/opt/homebrew/bin/pdftotext',['-layout',file,'-'],{encoding:'utf8'}).split('\f').filter(text=>text.trim())
}
it('keeps short rationale indices on one line at actual A4 content width without preventing Chinese reasons from wrapping',async()=>{
 const f=fixture(true);f.calculation.dcf.assumptions.forEach((row,index)=>row.reason='原文依据与经营判断须分开核对。'.repeat(18)+'条件'+String.fromCharCode(65+index))
 const html=renderReport(f.packet,f.validation,f.calculation),page=await load(html)
 try{
  const table=page.locator('.model-table').filter({has:page.locator('h3',{hasText:'研究依据全文索引'})})
  const geometry=await table.locator('tbody tr').nth(3).evaluate(row=>{const cell=row.cells[0],reason=row.cells[1],range=document.createRange();range.selectNodeContents(cell);const lines=[...new Set([...range.getClientRects()].filter(rect=>rect.width>0).map(rect=>Math.round(rect.top)))];return{code:cell.textContent,lines:lines.length,indexWidth:cell.getBoundingClientRect().width,reasonWidth:reason.getBoundingClientRect().width,text:reason.textContent,tableWidth:row.parentElement.parentElement.getBoundingClientRect().width}})
  await writeFile(join(artifacts,'rationale-geometry.json'),JSON.stringify(geometry,null,2));await table.screenshot({path:join(artifacts,'rationale.png')})
  expect(geometry.code).toBe('R04');expect(geometry.lines).toBe(1);expect(geometry.indexWidth).toBeGreaterThan(32);expect(geometry.reasonWidth).toBeGreaterThan(400)
  expect(geometry.text).toContain('原文依据与经营判断须分开核对。'.repeat(18));expect(geometry.tableWidth).toBeLessThanOrEqual(682)
 }finally{await page.close()}
},20000)
it('prints each ordinary-sized thesis with its final monitoring paragraph on the same page',async()=>{
 const f=fixture(),names=['ALPHA','BETA','GAMMA','DELTA','EPSILON','ZETA']
 f.packet.report.theses=names.map(name=>({statement:name+'START 核心论点保持可证伪。'+('先区分原文事实、研究推论与条件。'.repeat(4)),inference:'解释经营变化而非仅复述数字。'.repeat(5),assumption:'明确哪些判断需要后续资料验证。'.repeat(4),falsifier:'若关键经营证据反转，应及时调整判断。'.repeat(4),monitoring:'跟踪后续披露和现金回笼。'.repeat(6)+name+'WATCH',evidenceRefs:['base-revenue']}))
 const html=renderReport(f.packet,f.validation,f.calculation),page=await load(html)
 try{
  const pages=await print(page,'theses'),positions=names.map(name=>({name,start:pages.findIndex(text=>text.includes(name+'START')),watch:pages.findIndex(text=>text.includes(name+'WATCH'))}))
  await writeFile(join(artifacts,'thesis-pages.json'),JSON.stringify(positions,null,2))
  for(const row of positions){expect(row.start).toBeGreaterThanOrEqual(0);expect(row.watch,row.name).toBe(row.start)}
  expect(pages.join('')).toContain('下次观察')
 }finally{await page.close()}
},20000)
it('lets a long cover finish naturally so its financial summary and following contents can share the continuation page',async()=>{
 const f=fixture();f.packet.report.summary=Array.from({length:7},()=>({text:'公开披露需要结合经营背景、现金流与风险条件阅读。'.repeat(9)}))
 f.packet.report.theses=[{statement:'READINGSTART 研究结论应由证据约束。',inference:'区分事实和判断。',assumption:'保留研究假设。',falsifier:'出现反证时更新判断。',monitoring:'跟踪下次披露。',evidenceRefs:['base-revenue']}]
 const html=renderReport(f.packet,f.validation,f.calculation),page=await load(html)
 try{
  const pages=await print(page,'long-cover'),financial=pages.findIndex(text=>text.includes('历史财务摘要与预测状态')),contents=pages.findIndex(text=>text.includes('图表索引'))
  await writeFile(join(artifacts,'cover-pages.json'),JSON.stringify({pageCount:pages.length,financial,contents},null,2))
  expect(financial).toBeGreaterThan(0);expect(contents).toBe(financial);expect(pages[financial]).toContain('历史财务摘要')
  const navigation=html.split('<nav class="publication-contents"')[1].split('</nav>')[0],labels=[...navigation.matchAll(/<span class="toc-label">([^<]+)<\/span>/g)].map(match=>match[1].replace(/\s+/g,'')),lastIndexPage=pages.findIndex(text=>text.replace(/\s+/g,'').includes(labels.at(-1)))
  expect(lastIndexPage).toBeGreaterThanOrEqual(contents);expect(pages.findIndex(text=>text.includes('READINGSTART'))).toBe(lastIndexPage)
  expect(pages.join('')).toContain('财务事实与证据');expect(pages.join('')).toContain('确定性计算')
 }finally{await page.close()}
},20000)
