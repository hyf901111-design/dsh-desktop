import {beforeAll,afterAll,it,expect} from 'vitest'
import {pathToFileURL} from 'node:url'
import {execFileSync} from 'node:child_process'
let browser,previews
beforeAll(async()=>{
 // Production serializes native functions; use Node to avoid Vitest import
 // wrappers becoming free variables inside the generated browser script.
 previews=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`
 import {acceptArtifactOutput} from './packages/dsh-research-task-runtime/artifact-output.js';
 import {buildResearchHtmlPreview} from './packages/dsh-research-task-runtime/html-artifact.js';
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'note',title:'原始材料',asOf:'用户附件',content:'保留原文 0、-5 与来源。'})));
 console.log(JSON.stringify(Object.fromEntries(['dark','light'].map(theme=>[theme,buildResearchHtmlPreview(spec.html,spec.title,theme,{workbench:true,notoFont:'runtime'})]))));
 `],{encoding:'utf8'}))
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.default??pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(async()=>{await browser?.close()})
it.each([656,340])('keeps all note icons concentric with hover/selected backgrounds across themes at %ipx',async width=>{
 const page=await browser.newPage({viewport:{width,height:420}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 const note={version:1,type:'note',title:'原始材料',asOf:'用户附件',content:'保留原文 0、-5 与来源。'}
 try{
  for(const style of ['dark','light','enterprise','openterminal']){
   const html=previews[style==='dark'?'dark':'light']
   await page.setContent('<iframe id="host" style="border:0;width:100%;height:400px" sandbox="allow-scripts" srcdoc="'+html.replaceAll('&','&amp;').replaceAll('"','&quot;')+'"></iframe>')
   const frame=page.frameLocator('#host').frameLocator('iframe');await frame.locator('.note-toolbar').waitFor();expect(errors).toEqual([])
   await page.evaluate(()=>document.querySelector('#host').contentWindow.postMessage({type:'sherlock-component-context',shared:false,online:true,readOnly:false,userId:'local'},'*'))
   await frame.locator('body').evaluate((_body,style)=>{document.documentElement.dataset.workbenchStyle=style},style)
   await frame.locator('[data-note-view="edit"]').click();await frame.locator('[data-note-format="center"]').click()
   await frame.locator('[data-note-format="bold"]').hover()
   const metrics=await frame.locator('.note-toolbar button').evaluateAll(buttons=>buttons.map(b=>{const a=b.getBoundingClientRect(),r=b.querySelector('img').getBoundingClientRect();return {w:a.width,h:a.height,dx:r.x+r.width/2-a.x-a.width/2,dy:r.y+r.height/2-a.y-a.height/2}}))
   expect(metrics).toHaveLength(11)
   for(const m of metrics){expect(m.w).toBe(24);expect(m.h).toBe(24);expect(Math.abs(m.dx)).toBeLessThan(.1);expect(Math.abs(m.dy)).toBeLessThan(.1)}
   expect(await frame.locator('[data-note-format="center"]').getAttribute('aria-pressed')).toBe('true')
   expect(await frame.locator('#note-editor').inputValue()).toBe(note.content)
  }
  expect(errors).toEqual([])
 }finally{await page.close()}
},20000)
