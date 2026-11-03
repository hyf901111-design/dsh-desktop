import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'

let browser:any,script:string,challengeCss:string
const evidence=process.env.SHERLOCK_HEADER_PILL_EVIDENCE||'/tmp/sherlock-menu-theme-follow-20261103/header-evidence'
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {ResearchBoardHeader} from './src/preload/research-boards-ui';import {installBoardUiStyles} from './src/preload/research-board-dialogs';
 import {ChallengePicker} from './src/preload/notes/challenge-ui';import {mountUiLocalization} from './src/preload/ui-localization';
 import {createResearchPreviewModeState} from './scripts/lib/research-preview-mode.mjs';
 mountUiLocalization(document);installBoardUiStyles(document);
 const listeners=new Set(),ownership={get:()=>window.locked,subscribe:(_id,_read,listener)=>{listeners.add(listener);return()=>listeners.delete(listener)}};
 window.locked=false;const mode=createResearchPreviewModeState(localStorage,'pill-board',ownership),workspace={getPreviewMode:mode.get,setPreviewMode:mode.set,subscribePreviewMode:mode.subscribe,getPreviewModeLocked:mode.isLocked,subscribePreviewModeLock:mode.subscribe};
 const page={workspaceFor:()=>workspace,getState:()=>({account:{user:{userId:'self'}},favorites:[],boards:[]}),subscribe:()=>()=>{},version:()=>0,getView:()=>null,isResearch:()=>true,showError:error=>{throw error},favorite:async()=>{}};
 window.levelChanges=[];let setDisabled,setDark;
 function App(){const [value,setValue]=React.useState(0),[disabled,updateDisabled]=React.useState(false),[dark,updateDark]=React.useState(false);setDisabled=updateDisabled;setDark=updateDark;return <main><header id="research"><ResearchBoardHeader page={page} sessionId="pill-board" active/></header><header id="notes" data-ework-notes-session="pill-note"><div className="en-challenge-tools" data-dark={dark} data-header="true"><ChallengePicker value={value} dark={dark} disabled={disabled} onChange={next=>{window.levelChanges.push(next);setValue(next)}}/></div></header></main>}
 createRoot(document.getElementById('root')).render(<App/>);window.fixture={workspace,setDisabled(value){window.locked=value;listeners.forEach(listener=>listener());setDisabled(value)},setDark(value){document.body.toggleAttribute('data-ds-dark-theme',value);setDark(value)}};
 `},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty','.svg':'dataurl'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'})
 script=output.outputFiles[0]!.text;challengeCss=await readFile('src/preload/notes/challenge.css','utf8')
 const pw=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(async()=>browser?.close())

const style=(control:any)=>control.evaluate((el:HTMLElement)=>{const s=getComputedStyle(el),box=el.getBoundingClientRect();return{color:s.color,background:s.backgroundColor,opacity:s.opacity,cursor:s.cursor,border:s.borderTopWidth,radius:s.borderTopLeftRadius,outline:s.outlineStyle,width:box.width,height:box.height,scroll:el.scrollWidth,client:el.clientWidth,iconOpacity:getComputedStyle(el.querySelector('img,svg')!).opacity,contentFits:[...el.children].every(child=>{const r=child.getBoundingClientRect();return r.left>=box.left-.01&&r.right<=box.right+.01})}})
for(const dark of [false,true])for(const locale of ['zh','en'])it(`keeps mode and Copilot header pills visibly interactive in ${dark?'dark':'light'} ${locale}`,async()=>{
 const context=await browser.newContext({viewport:{width:1040,height:360},reducedMotion:'reduce'}),page=await context.newPage(),errors:string[]=[]
 page.on('pageerror',(error:Error)=>errors.push(error.message));page.setDefaultTimeout(5000)
 try{
  await page.route('https://header-pills.test/',(route:any)=>route.fulfill({contentType:'text/html',body:`<html data-odyssey-locale="${locale}"><meta charset="utf-8"><style>html,body{margin:0;font:13px/20px system-ui;background:#f2f2f2}body[data-ds-dark-theme]{background:#1f1f1f}header{display:flex;justify-content:flex-end;align-items:center;height:54px;padding:0 24px;margin:20px}button{font:inherit}</style><div id="root"></div></html>`}))
  await page.goto('https://header-pills.test/');await page.addStyleTag({content:challengeCss});await page.addScriptTag({content:script});await page.locator('[data-research-preview-toggle]').waitFor();await page.evaluate((dark:boolean)=>(window as any).fixture.setDark(dark),dark)
  const research=page.locator('[data-research-preview-toggle]'),notes=page.locator('.en-challenge-trigger'),records:any[]=[]
  expect(await notes.isEnabled()).toBe(true);expect(await notes.getAttribute('aria-label')).toBe(locale==='en'?'AI Copilot mode: Off':'随航模式，当前关闭')
  for(const [name,control]of [['research',research],['notes',notes]]as const){
   await page.mouse.move(4,4);const idle=await style(control)
   expect(idle.opacity).toBe('1');expect(idle.cursor).toBe('pointer');expect(idle.iconOpacity).toBe('1');expect(idle.border).toBe('0px');expect(parseFloat(idle.radius)).toBeGreaterThanOrEqual(15);expect(idle.height).toBe(30);expect(idle.scroll).toBeLessThanOrEqual(idle.client+1);expect(idle.contentFits).toBe(true)
   // The existing masked busy perimeter extends 1px beyond the pill; actual label/icon bounds must fit.
   await control.screenshot({path:`${evidence}/${dark?'dark':'light'}-${locale}-${name}-normal.png`})
   const primary=await control.evaluate((el:HTMLElement,name:string)=>getComputedStyle(el).getPropertyValue(name==='research'?'--srb-label':'--en-challenge-ink').trim(),name)
   const foreground=await control.evaluate((el:HTMLElement,primary:string)=>{const probe=document.createElement('span');probe.style.color=primary;el.append(probe);const color=getComputedStyle(probe).color;probe.remove();return color},primary)
   expect(idle.color).toBe(foreground)
   await control.hover();await page.waitForTimeout(180);const hover=await style(control);expect(hover.background).not.toBe(idle.background);await control.screenshot({path:`${evidence}/${dark?'dark':'light'}-${locale}-${name}-hover.png`})
   await page.mouse.down();await page.waitForTimeout(180);const pressed=await style(control);expect(pressed.background).not.toBe(hover.background);await page.mouse.move(4,4);await page.mouse.up()
   records.push({name,idle,hover,pressed})
  }
  await research.click();await expect.poll(()=>research.getAttribute('aria-pressed')).toBe('true');await expect.poll(()=>research.textContent()).toBe(locale==='en'?'Preview mode':'预览模式')
  await notes.click();const slider=page.getByRole('slider');await slider.waitFor();expect(await notes.getAttribute('aria-expanded')).toBe('true');await slider.press('End');await expect.poll(()=>page.evaluate(()=>(window as any).levelChanges)).toEqual([4]);await slider.press('Escape')
  await page.evaluate(()=>(window as any).fixture.setDisabled(true));await expect.poll(()=>research.isDisabled()).toBe(true);await expect.poll(()=>notes.isDisabled()).toBe(true)
  for(const control of [research,notes]){const disabled=await style(control);expect(disabled.opacity).toBe('0.5');expect(disabled.cursor).toBe('default')}
  await page.screenshot({path:`${evidence}/${dark?'dark':'light'}-${locale}-disabled.png`});await page.evaluate(()=>(window as any).fixture.setDisabled(false));await page.mouse.move(4,4);await page.screenshot({path:`${evidence}/${dark?'dark':'light'}-${locale}.png`});await writeFile(`${evidence}/${dark?'dark':'light'}-${locale}.json`,JSON.stringify(records,null,2))
  expect(errors).toEqual([])
 }finally{await context.close()}
},20000)
