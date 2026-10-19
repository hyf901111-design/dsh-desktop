import {beforeAll,afterAll,it,expect} from 'vitest'
import {pathToFileURL} from 'node:url'
import {readFileSync} from 'node:fs'
import {canvasCss} from '../scripts/lib/figma-canvas-client.mjs'
import {generationCss} from '../scripts/lib/figma-generation-client.mjs'
import {researchPlanningCss} from '../scripts/lib/research-creation-progress.mjs'
const gridCss=['research-grid-workbench.css','workbench-style.css'].map(name=>readFileSync(new URL('../scripts/lib/'+name,import.meta.url),'utf8')).join('\n')
let browser
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},15000)
afterAll(async()=>browser?.close())
it('keeps retry and dismiss separate and clickable in all four themes at narrow and expanded widths',async()=>{
 const page=await browser.newPage({viewport:{width:800,height:600}})
 try{
  for(const theme of ['light','dark','openterminal','enterprise'])for(const state of ['failed','stopped'])for(const width of [220,320,448]){
   await page.setContent(`<style>${canvasCss}\n${generationCss}\n${researchPlanningCss}\n${gridCss}</style><body ${['dark','openterminal'].includes(theme)?'data-ds-dark-theme':''}><main data-research-canvas data-ework-grid data-workbench-style="${theme}"><section class="odyssey-creation-planning-card" data-research-node-id="planning" data-research-compact-chrome data-workbench-style="${theme}" data-research-creation-planning="${state}" style="left:30px;top:30px;width:${width}px;height:220px"><button class="odyssey-planning-dismiss" aria-label="关闭生成提示">×</button><div class="odyssey-generation-surface"><time data-research-generation-elapsed>12:28</time><div class="odyssey-generation-actions"><span class="odyssey-generation-action"><button aria-label="重试生成">重试</button></span></div></div></section></main></body>`)
   const geometry=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}};const retry=document.querySelector('.odyssey-generation-action>button'),close=document.querySelector('.odyssey-planning-dismiss');retry.onclick=()=>document.body.dataset.clicked='retry';close.onclick=()=>document.body.dataset.clicked='close';return {retry:box('.odyssey-generation-action>button'),close:box('.odyssey-planning-dismiss'),time:box('time'),opacity:getComputedStyle(retry.parentElement.parentElement).opacity}})
   expect(geometry.close.left-geometry.retry.right).toBeGreaterThanOrEqual(10)
   expect(geometry.retry.left).toBeGreaterThan(geometry.time.right+8)
   expect(geometry.opacity).toBe('1')
   await page.getByRole('button',{name:'重试生成',exact:true}).click()
   expect(await page.locator('body').getAttribute('data-clicked')).toBe('retry')
   await page.getByRole('button',{name:'关闭生成提示',exact:true}).click()
   expect(await page.locator('body').getAttribute('data-clicked')).toBe('close')
  }
 }finally{await page.close()}
},20000)
