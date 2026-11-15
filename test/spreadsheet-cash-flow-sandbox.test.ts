import {afterAll,beforeAll,expect,it} from 'vitest'
import {pathToFileURL} from 'node:url'
import {buildResearchHtmlPreview} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {applyOperations} from '../src/shared/spreadsheet/workbook'
import {cashFlowGuideAnalysisOperations,cashFlowGuideComponent,createCashFlowGuideWorkbook} from '../src/shared/spreadsheet/cash-flow-guide'
let browser:any
beforeAll(async()=>{
 const module=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (module.default??module).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(async()=>browser?.close())

async function preview(localSimulation:boolean){
 const raw=createCashFlowGuideWorkbook('sandbox-fixture')
 const {node}=cashFlowGuideComponent(applyOperations(raw,cashFlowGuideAnalysisOperations(raw)))
 const page=await browser.newPage({viewport:{width:400,height:655}})
 try{
  await page.setContent('<iframe id="outer" sandbox="allow-scripts" style="width:360px;height:620px;border:0"></iframe>')
  await page.evaluate(({srcDoc,localSimulation}:{srcDoc:string;localSimulation:boolean})=>{
   const outer=document.querySelector<HTMLIFrameElement>('#outer')!
   document.body.dataset.journal='0'
   window.addEventListener('message',event=>{
    if(event.source!==outer.contentWindow)return
    if(event.data?.type==='sherlock-interaction-ready'){
     outer.contentWindow?.postMessage({type:'sherlock-interaction-state',readOnly:true,localSimulation},'*')
     document.body.dataset.ready='true'
    }
    if(event.data?.type==='sherlock-interaction-event')document.body.dataset.journal=String(Number(document.body.dataset.journal)+1)
   })
   outer.srcdoc=srcDoc
  },{srcDoc:buildResearchHtmlPreview(String(node.containerSpec.html),node.title,'dark',{workbench:true,notoFont:'runtime'}),localSimulation})
  await page.locator('body[data-ready="true"]').waitFor()
  return {page,frame:page.frameLocator('#outer').frameLocator('#preview')}
 }catch(error){await page.close();throw error}
}

it('uses trusted keyboard input and clickable waterfall marks without journaling the simulation',async()=>{
 const {page,frame}=await preview(true)
 try{
  const slider=frame.locator('#cash-flow-collections')
  await slider.press('Home')
  for(let step=0;step<30;step++)await slider.press('ArrowRight')
  await expect.poll(()=>frame.locator('[data-ratio]').textContent()).toBe('76%')
  expect(await frame.locator('[data-flow]').textContent()).toBe('1.90')
  expect(await frame.locator('[data-actual-flow]').textContent()).toContain('1.60')
  const receivables=frame.locator('button[data-adjustment="receivables"]')
  expect(await receivables.evaluate((button:HTMLElement)=>getComputedStyle(button).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  await frame.locator('button[data-adjustment="inventory"]').click()
  await expect.poll(()=>frame.locator('[data-source-detail]').textContent()).toContain('原材料')
  expect(await page.locator('body').getAttribute('data-journal')).toBe('0')
 }finally{await page.close()}
},15000)

it('keeps ordinary read-only spreadsheet previews from applying artifact handlers',async()=>{
 const {page,frame}=await preview(false)
 try{
  await frame.locator('#cash-flow-collections').press('ArrowRight')
  await frame.locator('button[data-adjustment="inventory"]').click()
  expect(await frame.locator('[data-ratio]').textContent()).toBe('64%')
  expect(await frame.locator('[data-source-title]').textContent()).toBe('应收增加')
  expect(await page.locator('body').getAttribute('data-journal')).toBe('0')
 }finally{await page.close()}
},15000)
