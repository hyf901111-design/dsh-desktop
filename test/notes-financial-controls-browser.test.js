import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {execFileSync} from 'node:child_process'
import {EWorkNoteComponentView} from '../scripts/lib/notes-components.mjs'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'

let browser,client,runtime,notesCss,evidence
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
 import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot} from 'react-dom/client';import {mountUiLocalization} from './src/preload/ui-localization';
 window.noteFinancialRuntime={React,jsx,dom,createRoot,mountUiLocalization};
 `},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}})
 runtime=output.outputFiles[0].text
 // Production serializes native functions. Keep Vitest's SSR import wrappers
 // out of those function bodies while still exercising the current patcher.
 client=execFileSync(process.execPath,['--input-type=module','-e',`
 import {readFileSync} from 'node:fs';import {patchFinancialWidgetClient} from './scripts/lib/financial-widget-client.mjs';
 process.stdout.write(patchFinancialWidgetClient(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')));
 `],{encoding:'utf8',maxBuffer:32_000_000})
 const start=client.indexOf('function EWorkNoteComponentView('),end=client.indexOf('function EWorkNoteComponentViews(',start)
 if(start<0||end<0)throw Error('Actual note component portal is missing')
 client=client.slice(0,start)+EWorkNoteComponentView.toString()+'\n'+client.slice(end)
 client=client.replace('exports.ResearchCanvas = ResearchCanvas;','exports.EWorkNoteComponentViews=EWorkNoteComponentViews;exports.ResearchCanvas = ResearchCanvas;')
 notesCss=await readFile('src/preload/notes/style.css','utf8')
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 evidence=await mkdtemp(join(tmpdir(),'odyssey-note-watchlist-'))
},30000)
afterAll(async()=>browser?.close())

async function fixture(){
 const page=await browser.newPage({viewport:{width:1000,height:660}})
 page.setDefaultTimeout(5000)
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.setContent('<div id="outlet"></div><section class="en-root en-editor-host" data-dark="true"><section class="en-research en-native-component" data-research-node-id="watch" data-financial-theme="dark" style="width:856px"><header id="watch-title" class="en-research-header"></header><div id="watch-host" class="en-native-component-host" data-note-component="watch" data-note-session="note-watchlist" style="height:300px"></div></section></section>')
 await page.addStyleTag({content:notesCss+'\nbody{margin:20px;background:#888}.en-root{max-width:856px}.en-research{margin:0}'})
 await page.addScriptTag({content:runtime})
 await page.evaluate(()=>{window.__ModuleLoader__={load:descriptor=>window.noteFinancialDescriptor=descriptor}})
 await page.addScriptTag({content:client})
 const spec={...financialWidgetDefaults('watchlist'),symbols:[{market:'SH',code:'600519',name:'沪市测试'},{market:'HK',code:'00700',name:'港股测试'}]}
 await page.evaluate(spec=>{
  const {React,jsx,dom,createRoot,mountUiLocalization}=window.noteFinancialRuntime
  const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
  const bundle=window.noteFinancialDescriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/dsh-client-ui-primitives'?new Proxy({MarkdownText:({text})=>React.createElement('div',null,text)},{get:(t,k)=>t[k]||(String(k).startsWith('Icon')?()=>null:fake)}):fake)
  window.dshDesktop={financialWidget:{request:async input=>input.action==='search'?{symbols:[{market:'SZ',code:'000001',name:'新增测试'}]}:{quotes:(input.symbols||[]).map(symbol=>({...symbol,price:100,changePercent:1})),source:'聚焦验证来源'}}}
  window.watchEntry={instanceId:'watch-view',hostId:'watch-host',headerId:'watch-title',sessionId:'note-watchlist',node:{id:'watch',title:'自选股',noteLibrary:true,containerSpec:spec},dark:true,refresh:0}
  window.watchActions=[]
  window.publishWatch=()=>document.dispatchEvent(new CustomEvent('sherlock:notes-component-view',{detail:structuredClone(window.watchEntry)}))
  document.addEventListener('sherlock:notes-component-action',event=>{const action=event.detail;if(action.action!=='spec')return;window.watchActions.push(structuredClone(action));window.watchEntry.node.containerSpec=action.next;window.publishWatch();document.dispatchEvent(new CustomEvent('sherlock:notes-component-ack',{detail:{instanceId:action.instanceId,sessionId:action.sessionId,requestId:action.requestId,ok:true}}))})
  mountUiLocalization(document)
  createRoot(document.getElementById('outlet')).render(React.createElement(bundle.EWorkNoteComponentViews,{sessionId:'note-watchlist',active:true}))
 },spec)
 await page.waitForTimeout(25)
 await page.evaluate(()=>window.publishWatch())
 await page.locator('#watch-host .ew-watch-meta select').waitFor().catch(error=>{throw Error(errors.join('\n')||error.message)})
 return page
}

it('keeps the note watchlist market label, chevron and add control separate in both themes and narrow widths',async()=>{
 const page=await fixture(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 try{
  const results=[]
  for(const dark of [true,false])for(const locale of ['zh','en'])for(const width of [856,320,220,160]){
   await page.evaluate(({dark,locale,width})=>{document.documentElement.dataset.odysseyLocale=locale;const root=document.querySelector('.en-root'),card=root.querySelector('.en-research');root.dataset.dark=String(dark);card.dataset.financialTheme=dark?'dark':'light';card.style.width=width+'px'}, {dark,locale,width})
   await page.waitForTimeout(20)
   const metrics=await page.locator('.ew-watch-meta').evaluate(meta=>{
    const select=meta.querySelector('select'),add=meta.querySelector('button'),s=getComputedStyle(select),r=select.getBoundingClientRect(),a=add.getBoundingClientRect(),m=meta.getBoundingClientRect(),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=s.font
    const icon=add.querySelector('.ew-financial-icon').getBoundingClientRect()
    return {appearance:s.appearance,paddingRight:parseFloat(s.paddingRight),paddingLeft:parseFloat(s.paddingLeft),background:s.backgroundImage,textWidth:ctx.measureText(select.selectedOptions[0].textContent).width,contentWidth:r.width-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),gap:a.left-r.right,addWidth:a.width,addHeight:a.height,iconOffset:Math.abs(icon.left+icon.width/2-a.left-a.width/2),metaOverflow:Math.max(0,a.right-m.right),color:s.color,selected:select.selectedOptions[0].textContent}
   })
   results.push({dark,locale,width,...metrics})
   expect(metrics.appearance).toBe('none')
   expect(metrics.background).toContain('data:image/svg+xml')
   expect(metrics.paddingRight).toBeGreaterThanOrEqual(22)
   expect(metrics.contentWidth+.5).toBeGreaterThanOrEqual(metrics.textWidth)
   expect(metrics.gap).toBeGreaterThanOrEqual(8)
   expect(metrics.addWidth).toBe(24);expect(metrics.addHeight).toBe(24)
   expect(metrics.iconOffset).toBeLessThanOrEqual(.5)
   expect(metrics.metaOverflow).toBeLessThanOrEqual(.5)
   expect(metrics.color).toBe(dark?'rgb(157, 165, 178)':'rgb(102, 112, 133)')
  }
  await page.screenshot({path:join(evidence,'watchlist-narrow-english.png')})
  await page.evaluate(()=>{document.querySelector('.en-research').style.width='856px';document.documentElement.dataset.odysseyLocale='zh'})
  await page.screenshot({path:join(evidence,'watchlist-light.png')})
  await page.evaluate(()=>{document.querySelector('.en-root').dataset.dark='true';document.querySelector('.en-research').dataset.financialTheme='dark'})
  await page.screenshot({path:join(evidence,'watchlist-dark.png')})
  await writeFile(join(evidence,'layout.json'),JSON.stringify(results,null,2))
  expect(errors).toEqual([]);console.log('Note watchlist evidence:',evidence)
 }finally{await page.close()}
},30000)

it('preserves market filtering, keyboard focus and adding a stock through the actual note component portal',async()=>{
 const page=await fixture()
 try{
  const market=page.locator('.ew-watch-meta select')
  await market.selectOption('HK')
  await expect.poll(()=>page.locator('[data-stock-code]').count()).toBe(1)
  expect(await page.locator('[data-stock-code]').getAttribute('data-stock-code')).toBe('00700')
  expect(await page.evaluate(()=>window.watchEntry.node.containerSpec.market)).toBe('HK')
  await market.selectOption('all');await expect.poll(()=>page.locator('[data-stock-code]').count()).toBe(2)
  await market.focus();await page.keyboard.press('Tab')
  expect(await page.evaluate(()=>document.activeElement.getAttribute('aria-label'))).toBe('添加自选股')
  await page.keyboard.press('Enter');await page.locator('.ew-financial-search-line input').fill('000001')
  await page.locator('.ew-financial-suggestions [role=option]').waitFor()
  await page.locator('.ew-financial-suggestions [role=option]').click()
  await expect.poll(()=>page.locator('[data-stock-code]').count()).toBe(3)
  expect(await page.evaluate(()=>window.watchEntry.node.containerSpec.symbols.some(s=>s.code==='000001'&&s.market==='SZ'))).toBe(true)
  expect(await page.locator('.ew-watch-meta select').inputValue()).toBe('all')
  expect(await page.locator('.ew-financial-search-line').count()).toBe(0)
 }finally{await page.close()}
},15000)
