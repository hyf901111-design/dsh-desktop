import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {patchFinancialWidgetClient} from '../scripts/lib/financial-widget-client.mjs'
import {patchResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
import {installWorkbenchScrollbars,isWorkbenchScrollbarMessage} from '../packages/dsh-research-task-runtime/workbench-scrollbars.js'

let browser,css
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 const client=patchResearchGridWorkbench(patchFinancialWidgetClient(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')))
 const start=client.indexOf('/* EWORK_GRID_WORKBENCH_BEGIN */'),block=client.slice(start,client.indexOf('/* EWORK_GRID_WORKBENCH_END */',start))
 css=JSON.parse(block.match(/style\.textContent=("(?:\\.|[^"\\])*")/)[1])+'\n'+await readFile('src/preload/figma-refinements.css','utf8')
},30000)
afterAll(async()=>browser?.close())

it('switches both component scrollbar axes with the board palette independently of the app theme and preserves scrolling',async()=>{
 const page=await browser.newPage({viewport:{width:1000,height:700},reducedMotion:'reduce'})
 try{
  await page.setContent('<main data-research-canvas data-ework-grid data-workbench-style="dark"><article data-research-node-id="scroll" data-selected="true"><header class="ew-grid-header">表格与明细</header><div data-research-preview-body><div style="width:1600px;height:1600px">完整内容</div></div></article></main>')
  await page.addStyleTag({content:css+'\nhtml,body{margin:0;height:100%}[data-ework-grid]{margin:0!important;height:100%!important;position:relative}[data-research-node-id]{position:absolute;left:50px;top:50px;width:600px;height:300px;display:flex;flex-direction:column}'})
  await page.addScriptTag({content:'const isWorkbenchScrollbarMessage='+isWorkbenchScrollbarMessage.toString()+';const installWorkbenchScrollbars='+installWorkbenchScrollbars.toString()+';const card=document.querySelector("article"),port=card.querySelector("[data-research-preview-body]");window.scrollbars=installWorkbenchScrollbars(card,()=>port,()=>card.dataset.selected==="true",()=>[port]);port.scrollLeft=120;port.scrollTop=160;'})
  await page.waitForSelector('[data-workbench-scrollbar="x"] > span')
  await page.waitForSelector('[data-workbench-scrollbar="y"] > span')
  const port=page.locator('[data-research-preview-body]')
  const before=await port.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}))
  expect(before.x).toBeGreaterThan(0);expect(before.y).toBeGreaterThan(0)
  for(const appDark of [false,true])for(const mode of ['light','dark','enterprise','openterminal','light']){
   await page.evaluate(({appDark,mode})=>{document.body.toggleAttribute('data-ds-dark-theme',appDark);document.querySelector('main').dataset.workbenchStyle=mode},{appDark,mode})
   const colors=await page.locator('[data-workbench-scrollbar] > span').evaluateAll(els=>els.map(el=>getComputedStyle(el).backgroundColor))
   expect(colors).toHaveLength(2)
   for(const color of colors){
    if(['dark','openterminal'].includes(mode))expect(color,JSON.stringify({appDark,mode})).toBe('rgb(51, 51, 51)')
    else{
     expect(color,JSON.stringify({appDark,mode})).toMatch(/^rgba\(0, 0, 0, /)
     expect(Number(color.match(/, ([\d.]+)\)$/)[1])).toBeCloseTo(.1,2)
    }
   }
   expect(await port.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}))).toEqual(before)
  }
  await page.locator('[data-workbench-scrollbar="y"]').focus()
  await page.keyboard.press('ArrowDown')
  expect(await port.evaluate(el=>el.scrollTop)).toBeGreaterThan(before.y)
  await page.locator('article').evaluate(el=>el.dataset.selected='false')
  await expect.poll(()=>page.locator('[data-workbench-scroll-overlay]').evaluate(el=>el.hidden)).toBe(true)
  await page.evaluate(()=>window.scrollbars.destroy())
 }finally{await page.close()}
},20000)
