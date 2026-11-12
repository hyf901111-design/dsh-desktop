import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {prepareFinancialClientSource} from './helpers/financial-widget-client-fixture.js'
import {installWorkbenchScrollbars,isWorkbenchScrollbarMessage} from '../packages/dsh-research-task-runtime/workbench-scrollbars.js'
import {generationCss} from '../scripts/lib/figma-generation-client.mjs'

let browser,css
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 const client=await prepareFinancialClientSource({refreshState:true})
 const start=client.indexOf('/* EWORK_GRID_WORKBENCH_BEGIN */'),block=client.slice(start,client.indexOf('/* EWORK_GRID_WORKBENCH_END */',start))
 css=JSON.parse(block.match(/style\.textContent=("(?:\\.|[^"\\])*")/)[1])+'\n'+await readFile('src/preload/figma-refinements.css','utf8')
},30000)
afterAll(async()=>browser?.close())

it('uses the same square refresh glyph and ring loading in note headers',async()=>{
 const page=await browser.newPage({viewport:{width:600,height:240}})
 try{
  await page.setContent('<article class="en-native-component"><header class="en-research-header"><div class="en-native-component-heading"><span class="ew-grid-refresh"><button class="en-component-refresh" data-workbench-refresh="note" data-refresh-state="scheduled"><span class="ew-grid-icon ew-grid-icon-refresh"></span></button></span><strong>笔记中的数据组件</strong></div></header></article>')
  await page.addStyleTag({content:css+'\n'+await readFile('src/preload/notes/style.css','utf8')})
  const button=page.locator('button'),icon=button.locator('span')
  for(const [state,color] of [['scheduled','rgb(34, 160, 107)'],['error','rgb(197, 128, 79)'],['manual','rgb(133, 139, 149)']]){
   await button.evaluate((el,state)=>el.dataset.refreshState=state,state)
   expect(await button.evaluate(el=>getComputedStyle(el).color)).toBe(color)
   const box=await icon.boundingBox();expect(box.width).toBe(16);expect(box.height).toBe(16)
  }
  await button.evaluate(el=>el.dataset.busy='true')
  expect(await icon.evaluate(el=>getComputedStyle(el).visibility)).toBe('hidden')
  const ring=await button.evaluate(el=>{const style=getComputedStyle(el,'::after');return {width:style.width,height:style.height,radius:style.borderRadius,animation:style.animationName}})
  expect(ring).toEqual({width:'14px',height:'14px',radius:'50%',animation:'ew-grid-spin'})
 }finally{await page.close()}
})

it('keeps the existing component actions visible after an update fails while leaving empty planning cards on their own controls',async()=>{
 const page=await browser.newPage({viewport:{width:1000,height:700}})
 try{
  await page.setContent('<main data-research-canvas data-ework-grid><article style="height:300px;width:500px;display:flex;flex-direction:column" data-research-compact-chrome data-research-artifact-card data-research-node-id="retained" data-research-generation-state="failed"><div class="rScV5Q_nodeTitle">标题预留空间</div><div class="rScV5Q_previewBody" data-research-preview-body>上一次成功生成的图表</div><div class="ew-grid-chrome-host"><header class="ew-grid-header"><button>组件更多操作</button></header></div></article></main>')
  await page.addStyleTag({content:css+'\n'+generationCss})
  expect(await page.locator('.ew-grid-header button').isVisible()).toBe(true)
  expect(await page.locator('.rScV5Q_nodeTitle').evaluate(el=>el.getBoundingClientRect().height)).toBe(34)
  await page.locator('article').evaluate(el=>el.setAttribute('data-research-generation-empty',''))
  expect(await page.locator('.ew-grid-header button').isVisible()).toBe(false)
  expect(await page.locator('.rScV5Q_nodeTitle').evaluate(el=>el.getBoundingClientRect().height)).toBe(0)
 }finally{await page.close()}
})

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
