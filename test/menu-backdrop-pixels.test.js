import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {patchSkillCommandLabels,patchSkillCommandPopup} from '../scripts/lib/skill-command-menu.mjs'
const {PNG}=createRequire(import.meta.url)('pngjs')
let browser,css
beforeAll(async()=>{
 const {chromium}=await import(/* @vite-ignore */ pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 const native=[patchSkillCommandLabels(await readFile('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8')),patchSkillCommandPopup(await readFile('node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js','utf8'))].map(source=>JSON.parse(source.match(/const css = ("[^\n]+");/u)[1])).join('\n')
 css=await readFile('src/preload/figma-refinements.css','utf8')+native
})
afterAll(async()=>{await browser?.close()})
function roi(p,x,y,width,height){const values=[];for(let j=y;j<y+height;j++)for(let i=x;i<x+width;i++)values.push(p.data[(j*p.width+i)*4]);const mean=values.reduce((a,b)=>a+b,0)/values.length;return {mean,std:Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/values.length)}}
for(const dark of [false,true])it(`blurs fine details while visibly transmitting background colors in ${dark?'dark':'light'} menus`,async()=>{
 const page=await browser.newPage({viewport:{width:640,height:500},deviceScaleFactor:1})
 try{
  for(const [name,attrs] of [['workspace','role="menu"'],['account','class="sherlock-account-menu"'],['model','role="menu"'],['permission','role="menu"'],['more','class="st-menu"'],['notifications','class="srb-notifications"'],['slash','class="_3e4SsG_menu" data-ework-expanded-command'],['skills','class="mufS8W_card" data-ework-expanded-command']]){
   await page.setContent(`<style>${css}html,body{margin:0}.colors{position:fixed;inset:0;background:linear-gradient(90deg,#13517d 0 49%,#97dce7 51% 100%)}.details{position:fixed;top:280px;left:0;right:0;height:220px;background:repeating-conic-gradient(#fff 0% 25%,#000 0% 50%) 0/8px 8px}#menu{position:fixed!important;left:80px!important;top:60px!important;width:480px!important;height:380px!important;margin:0!important;padding:0!important;z-index:3000}</style><body ${dark?'data-ds-dark-theme':''}><div class="colors"></div><div class="details"></div><div id="menu" ${attrs}></div></body>`)
   if(name==='slash'||name==='skills')await page.locator('#menu').evaluate(el=>{el.setAttribute('popover','manual');el.showPopover()})
   const p=PNG.sync.read(await page.screenshot())
   const left=roi(p,150,150,30,30),right=roi(p,480,150,30,30),details=roi(p,150,340,100,50)
   expect(right.mean-left.mean,`${name}: background color remains visible`).toBeGreaterThan(dark?35:25)
   expect(details.std,`${name}: fine background detail is blurred`).toBeLessThan(1.5)
  }
 }finally{await page.close()}
},15000)
