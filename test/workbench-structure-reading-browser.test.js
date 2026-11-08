import {afterAll,beforeAll,expect,it} from 'vitest'
import {pathToFileURL} from 'node:url'
import {installWorkbenchStructureReading} from '../packages/dsh-research-task-runtime/workbench-structure-reading.js'
import {buildResearchHtmlPreview} from '../packages/dsh-research-task-runtime/html-artifact.js'
let browser
beforeAll(async()=>{
 const {chromium}=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
afterAll(()=>browser?.close())
it('keeps structure node text legible in short fixed SVG boxes and adapts wider without changing nodes, edges or click handlers',async()=>{
 const page=await browser.newPage({viewport:{width:1600,height:1000}})
 try{
  await page.setContent(`<style>.box{width:800px;height:318px;overflow:hidden}svg{width:100%;height:100%}text{font-size:11px}</style><div class="box"><svg viewBox="0 0 1000 700"><path d="M0 0L900 600"/><g data-sherlock-structure="primary"><rect width="170" height="52"/><text x="10" y="30">完整根节点</text></g><g data-sherlock-structure="node" transform="translate(760 600)"><rect width="170" height="52"/><text x="10" y="30">末端完整节点</text></g></svg></div><div id="plot" style="height:100px"><svg viewBox="0 0 1000 700"><text>普通量化图</text></svg></div>`)
  await page.addScriptTag({content:`document.querySelector('[data-sherlock-structure="node"]').onclick=()=>window.clicked=true;(${installWorkbenchStructureReading.toString()})(document.documentElement)`})
  const metrics=()=>page.locator('.box').evaluate(box=>{const svg=box.querySelector('svg'),text=svg.querySelector('text'),m=text.getScreenCTM();return {box:box.clientWidth,width:svg.getBoundingClientRect().width,height:svg.getBoundingClientRect().height,font:parseFloat(getComputedStyle(text).fontSize)*Math.hypot(m.a,m.b),scroll:box.scrollWidth,nodes:svg.querySelectorAll('g').length,path:svg.querySelector('path').getAttribute('d')}})
  await expect.poll(async()=>(await metrics()).font).toBeGreaterThanOrEqual(10.99)
  expect(await metrics()).toMatchObject({width:1000,height:700,nodes:2,path:'M0 0L900 600'})
  await page.locator('.box').evaluate(el=>el.style.width='1400px');await expect.poll(async()=>(await metrics()).width).toBe(1400)
  await page.locator('.box').evaluate(el=>el.style.width='360px');await expect.poll(async()=>(await metrics()).box).toBe(360)
  expect((await metrics()).font).toBeGreaterThanOrEqual(10.99)
  await page.locator('[data-sherlock-structure="node"]').click();expect(await page.evaluate(()=>window.clicked)).toBe(true)
  expect(await page.locator('#plot svg').evaluate(el=>el.getBoundingClientRect().height)).toBe(100)
 }finally{await page.close()}
})
it('ships the geometry guard in the sandbox wrapper without requiring generated scripts to implement it',()=>{
 const wrapper=buildResearchHtmlPreview('<p>正文</p>','测试','dark',{workbench:true})
 expect(wrapper).toContain('installWorkbenchStructureReading');expect(wrapper).toContain('getScreenCTM')
})
it('runs the reading guard inside the actual sandbox wrapper and keeps the complete graph reachable',async()=>{
 const page=await browser.newPage({viewport:{width:820,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 try{
  const html='<style>.graphbox{height:318px;overflow:hidden}svg{width:100%;height:100%;display:block}text{font-size:11px}</style><div class="graphbox"><svg viewBox="0 0 1000 700"><g data-sherlock-structure="primary"><text x="10" y="30">根节点</text></g><g data-sherlock-structure="node" transform="translate(760 600)"><text x="10" y="30">完整末端</text></g></svg></div>'
  await page.route('http://127.0.0.1/reading',route=>route.fulfill({contentType:'text/html',body:buildResearchHtmlPreview(html,'架构阅读','dark',{workbench:true})}))
  await page.goto('http://127.0.0.1/reading')
  const frame=page.frameLocator('#preview'),svg=frame.locator('.graphbox svg')
  await expect.poll(()=>svg.evaluate(el=>el.getBoundingClientRect().height)).toBe(700)
  expect(await frame.locator('[data-sherlock-structure] text').allTextContents()).toEqual(['根节点','完整末端'])
  await frame.getByText('完整末端',{exact:true}).scrollIntoViewIfNeeded();expect(await frame.getByText('完整末端',{exact:true}).isVisible()).toBe(true)
  expect(errors).toEqual([])
 }finally{await page.close()}
})
