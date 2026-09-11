// Execute the production canvas geometry observer in Chromium with real CSS
// transitions. Figma 66 now resizes the actual canvas and preserves its view.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import playwright from '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
import { patchFigmaFinalCanvas } from './lib/figma-canvas-client.mjs'
const source=patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
const start=source.lastIndexOf('const root = rootRef.current;',source.indexOf('const syncSize = () => {'))
assert(start>=0)
const end=source.indexOf('}, [workspace]);',start)
const effect=source.slice(start,end)
const css=await readFile('src/preload/figma-motion.css','utf8')
const browser=await playwright.chromium.launch({executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
try {
 const page=await browser.newPage({viewport:{width:1380,height:900}})
 await page.setContent(`<style>body{margin:0}.canvas{position:absolute;left:280px;top:92px;right:calc(10px + var(--reserve,0px));bottom:10px}body:has(.t8lSSG_panel:not(.t8lSSG_panelHidden)){--reserve:350px}.t8lSSG_panel{position:absolute;right:10px;top:10px;bottom:10px;width:340px}.toolbar{position:absolute;width:272px;height:48px;bottom:24px;transform:translateX(-50%)}</style><style>${css}</style><div class="canvas"><div class="toolbar"></div></div><aside class="t8lSSG_panel t8lSSG_panelHidden"></aside>`)
 await page.evaluate(effect=>{
   document.documentElement.dataset.odysseyMotionReady='true'
   window.snapshot={canvasSize:{width:0,height:0,availableWidth:0},viewport:{x:0,y:0,scale:1},files:[],artifacts:[]}
   window.updates=0
   const workspace={getSnapshot:()=>window.snapshot,setCanvasSize:next=>{window.snapshot.canvasSize=next;window.updates++;document.querySelector('.toolbar').style.left=next.availableWidth/2+'px'},setViewport:()=>{}}
   window.dispose=new Function('rootRef','workspace','researchCanvasViewportForAreaChange',effect)({current:document.querySelector('.canvas')},workspace,s=>s.viewport)
 },effect)
 const settle=async()=>{
   await page.waitForFunction(()=>!document.querySelector('.t8lSSG_panel').getAnimations().some(a=>a.playState==='running'))
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
 }
 const check=async open=>{
   await settle()
   const r=await page.evaluate(()=>{const c=document.querySelector('.canvas').getBoundingClientRect(),p=document.querySelector('.t8lSSG_panel').getBoundingClientRect(),t=document.querySelector('.toolbar').getBoundingClientRect();return {available:window.snapshot.canvasSize.availableWidth,expected:p.left-c.left-8,full:c.width,center:t.left+t.width/2-c.left}})
   const expected=r.full
   assert(Math.abs(r.full-(open?(await page.viewportSize()).width-640:(await page.viewportSize()).width-290))<.1,JSON.stringify(r))
   assert(Math.abs(r.available-expected)<.1,JSON.stringify(r))
   assert(Math.abs(r.center-expected/2)<.1,JSON.stringify(r))
 }
 await check(false)
 for(let i=0;i<3;i++){
   await page.evaluate(()=>document.querySelector('.t8lSSG_panel').classList.remove('t8lSSG_panelHidden'));await check(true)
   await page.evaluate(()=>document.querySelector('.t8lSSG_panel').classList.add('t8lSSG_panelHidden'));await check(false)
 }
 // Reverse before the closing transition has finished.
 await page.evaluate(()=>document.querySelector('.t8lSSG_panel').classList.remove('t8lSSG_panelHidden'));await check(true)
 await page.evaluate(()=>document.querySelector('.t8lSSG_panel').classList.add('t8lSSG_panelHidden'))
 await page.waitForTimeout(60)
 await page.evaluate(()=>document.querySelector('.t8lSSG_panel').classList.remove('t8lSSG_panelHidden'));await check(true)
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.setViewportSize({width:900,height:640});await check(true)
 await page.evaluate(()=>document.querySelector('.t8lSSG_panel').classList.add('t8lSSG_panelHidden'));await check(false)
 await page.evaluate(()=>document.querySelector('.t8lSSG_panel').classList.remove('t8lSSG_panelHidden'));await check(true)
 await page.evaluate(()=>window.dispose())
 const updates=await page.evaluate(()=>window.updates)
 await page.evaluate(()=>document.querySelector('.t8lSSG_panel').classList.add('t8lSSG_panelHidden'));await settle()
 assert.equal(await page.evaluate(()=>window.updates),updates,'disposed observer must stop updates')
 console.log('PASS: 3 reopen cycles, interrupted reversal, narrow window, reduced motion and disposal; toolbar centered within 0.1px')
}finally{await browser.close()}
