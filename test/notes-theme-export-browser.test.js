import {beforeAll,afterAll,expect,it} from 'vitest'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),{build}=require('esbuild');let browser,script
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`import {freezeNoteSnapshotElement} from './src/shared/note-component-snapshot';import {installWorkbenchStyleMessages,WORKBENCH_MODE_CSS} from './packages/dsh-research-task-runtime/workbench-style.js';Object.assign(window,{freezeNoteSnapshotElement,installWorkbenchStyleMessages,WORKBENCH_MODE_CSS});`},bundle:true,format:'iife',platform:'browser',write:false})
 script=output.outputFiles[0].text
 const pw=await import(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js')
 browser=await(pw.default||pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>browser?.close())
async function fixture(reducedMotion='no-preference',offscreen=false){
 const context=await browser.newContext({reducedMotion}),page=await context.newPage()
 await page.setContent('<iframe style="width:500px;height:220px" srcdoc="<!doctype html><html data-workbench-style=light><body>ready</body></html>"></iframe>')
 if(offscreen)await page.locator('iframe').evaluate(frame=>{frame.style.marginTop='3000px'})
 const frame=page.frames()[1];await frame.waitForLoadState();await frame.addScriptTag({content:script})
 await frame.evaluate(()=>{const style=document.createElement('style');style.textContent=window.WORKBENCH_MODE_CSS+'body{margin:0;width:500px;height:220px}th{width:300px;height:100px;background:var(--sherlock-control-bg)}@keyframes forever{from{opacity:.9}to{opacity:1}}span{animation:forever 1s infinite}';document.head.append(style);document.body.innerHTML='<table><tr><th>真实表格颜色<span>无限装饰动画</span></th></tr></table>';window.installWorkbenchStyleMessages();getComputedStyle(document.querySelector('th')).backgroundColor})
 await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-workbench-style',mode:'enterprise',controlTheme:'light'},'*'))
 await frame.waitForFunction(()=>document.documentElement.dataset.workbenchStyle==='enterprise')
 return{context,frame}
}
it.each(['no-preference','reduce'])('freezes the final shared palette when exporting immediately after a mounted iframe theme change (%s)',async motion=>{
 const {context,frame}=await fixture(motion)
 try{
  const result=await frame.evaluate(async()=>{
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
   const before=getComputedStyle(document.querySelector('th')).backgroundColor,start=performance.now()
   const frozen=await window.freezeNoteSnapshotElement(document.body,'theme',{width:500,height:220})
   const parsed=new DOMParser().parseFromString(frozen.html,'text/html')
   return{before,color:parsed.querySelector('th').style.backgroundColor,elapsed:performance.now()-start}
  })
  if(motion==='no-preference')expect(result.before).not.toBe('rgb(30, 185, 225)')
  expect(result.color).toBe('rgb(30, 185, 225)');expect(result.elapsed).toBeLessThan(1200)
 }finally{await context.close()}
})
it('interrupts a pending theme barrier without freezing the already-applied style',async()=>{
 const {context,frame}=await fixture()
 try{const result=await frame.evaluate(async()=>{let cancelled=false;setTimeout(()=>{cancelled=true},10);try{await window.freezeNoteSnapshotElement(document.body,'cancel-theme',{width:500,height:220},()=>cancelled);return 'unexpected snapshot'}catch(error){return error.message}});expect(result).toContain('已取消');expect(await frame.evaluate(()=>document.documentElement.dataset.workbenchStyle)).toBe('enterprise')}finally{await context.close()}
})

it('bounds a stalled shared transition marker instead of waiting for unlimited animation',async()=>{
 const {context,frame}=await fixture('reduce')
 try{const result=await frame.evaluate(async()=>{document.documentElement.dataset.workbenchTransition='stalled';const start=performance.now();try{await window.freezeNoteSnapshotElement(document.body,'stalled',{width:500,height:220});return{error:'unexpected snapshot',elapsed:performance.now()-start}}catch(error){return{error:error.message,elapsed:performance.now()-start}}});expect(result.error).toContain('主题尚未稳定');expect(result.elapsed).toBeLessThan(1600)}finally{await context.close()}
})

it('can freeze final theme colors for an off-screen mounted iframe',async()=>{
 const {context,frame}=await fixture('no-preference',true)
 try{const frozen=await frame.evaluate(()=>window.freezeNoteSnapshotElement(document.body,'offscreen-theme',{width:500,height:220}));expect(frozen.html).toContain('rgb(30, 185, 225)')}finally{await context.close()}
})
