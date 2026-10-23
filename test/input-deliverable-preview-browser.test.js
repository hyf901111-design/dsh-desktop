import {readFileSync} from 'node:fs'
import {mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {patchComposerDeliverablePreview} from '../scripts/lib/figma-composer-deliverable-preview.mjs'

let browser,runtime
let nativeSource=patchComposerDeliverablePreview(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
const runtimeSource=readFileSync('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
nativeSource=nativeSource.replace('\t\texports.apply = apply;','\t\texports.apply = apply;\nexports.__testInputBar = InputBar;')
const evidence='/tmp/ework-input-deliverable-preview-20261024'
beforeAll(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
 import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import {createRoot} from 'react-dom/client';
 const empty=()=>null;
 const primitives=new Proxy({Tooltip:({children})=>children},{get:(target,key)=>target[key]??empty});
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?ReactDOM:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{DropOverlay:empty,AttachmentRail:empty}:fake;
 const clientRuntime=window.__nativeDescriptors[0].factory(modules);
 const native=window.__nativeDescriptors[1].factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?clientRuntime:modules(id));
 const shell=new native.SessionInputShell({actx:{},defaultSink:()=>{window.submissions++}});
 window.submissions=0;
 const label={ppt:'efund-ppt-maker',report:'ework-equity-research'};
 const props={useSession:select=>select({running:false,promptError:null,subagent:null,removed:false}),
  useInput:select=>React.useSyncExternalStore(shell.state.subscribe,()=>select(shell.snapshot),()=>select(shell.snapshot)),
  inputActions:shell.actions,keyboard:shell,renderSlot:()=>null,useNotices:select=>select(null),useLexicon:select=>select(new Map()),useMenuLauncher:select=>select(null),useProjection:(_key,select)=>select?.(undefined),sessionId:'native-preview',t:key=>key,variant:'hero'};
 const root=createRoot(document.querySelector('#fixture'));root.render(React.createElement(native.__testInputBar,props));
 window.previewFixture={shell,dispose:()=>root.unmount(),
  add(kind,source='ework-managed-skill',id){const name=label[kind];return shell.insertReference({source,ref:JSON.stringify({id:id??'builtin:'+name,revision:1,invocationName:'ework-skill-0123456789abcdef',label:name}),label:'/'+name,clipboardText:'/'+name},{start:shell.snapshot.draft.length,end:shell.snapshot.draft.length,draftRev:shell.snapshot.draftRev})},
  text(value){shell.setDraft(value,{start:0,end:shell.snapshot.draft.length,insertedLength:value.length})},
  append(value){shell.insertText(value,{start:shell.snapshot.draft.length,end:shell.snapshot.draft.length,draftRev:shell.snapshot.draftRev})},
  removeLast(){const occurrence=shell.snapshot.occurrences.at(-1);if(occurrence)shell.setDraft(shell.snapshot.draft.slice(0,occurrence.offset)+shell.snapshot.draft.slice(occurrence.offset+1),{start:occurrence.offset,end:occurrence.offset+1,insertedLength:0})}
 };
 `},bundle:true,write:false,format:'iife',platform:'browser'});runtime=result.outputFiles[0].text
 const {chromium}=await import(/* @vite-ignore */ pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())
async function fixture({width=780,dark=false,mode='home'}={}){
 const page=await browser.newPage({viewport:{width:Math.max(860,width+40),height:800},deviceScaleFactor:2})
 const errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message))
 // Reading seats retain their existing 16px native clearance on both sides.
 await page.setContent(`<body ${dark?'data-ds-dark-theme':''}><div class="pI_x6G_centerCol"><div class="wSkVaW_root" data-odyssey-page="${mode}"><main id="fixture" data-center-composer-host style="width:${width+(mode==='conversation'?32:0)}px"></main></div></div></body>`)
 await page.evaluate(()=>{window.__nativeDescriptors=[];window.__ModuleLoader__={load:descriptor=>window.__nativeDescriptors.push(descriptor)}})
 await page.addScriptTag({content:runtimeSource})
 await page.addScriptTag({content:nativeSource})
 // Preserve the production cascade order from shell-style.ts, including the
 // reading overrides that come after inline-reference/deliverable styles.
 const styles=['figma-final-shell.css','figma-home.css','figma-panels.css','figma-file-panel.css','figma-trajectory.css','figma-inline-references.css','figma-motion.css','figma-refinements.css','figma-reading.css','figma-welcome.css','focus-style.css','client-typography.css'].map(name=>readFileSync('src/preload/'+name,'utf8')).join('\n')
 await page.addStyleTag({content:styles+'\nbody{margin:20px;--dsh-composer-side-clearance:0;--dsh-composer-card-max-width:780px;--dsw-font-family:system-ui;--odyssey-font-ui:system-ui;--odyssey-home-input:rgba(255,255,255,.5);--dsw-alias-label-primary:#252525}body[data-ds-dark-theme]{--odyssey-home-input:rgba(0,0,0,.49);--dsw-alias-label-primary:#e5e5e5}.wSkVaW_root{display:block;height:auto}.uV2eYG_root{width:100%}#fixture{margin:0}'});
 await page.addScriptTag({content:runtime})
 await page.waitForSelector('textarea',{timeout:3000}).catch(error=>{throw Error(errors.join('\n')||error.message)})
 return page
}

it('shows a decorative delivery preview from a real native skill occurrence without sending or replacing the input',async()=>{
 const page=await fixture()
 try{
  await page.evaluate(()=>{window.savedInput=document.querySelector('textarea');window.previewFixture.add('ppt')})
  await expect.poll(()=>page.locator('[data-odyssey-deliverable-preview="ppt"]').count()).toBe(1)
  expect(await page.locator('[data-odyssey-deliverable-art="ppt"]').count()).toBe(1)
  expect(await page.evaluate(()=>window.savedInput===document.querySelector('textarea'))).toBe(true)
  expect(await page.evaluate(()=>window.submissions)).toBe(0)
 }finally{await page.close()}
},15000)

it.each([{kind:'ppt',dark:false},{kind:'ppt',dark:true},{kind:'report',dark:false},{kind:'report',dark:true},{kind:'ppt',dark:true,mode:'conversation'},{kind:'report',dark:false,mode:'conversation'}])('matches the accepted native input layout and real assets ($kind dark=$dark mode=$mode)',async({kind,dark,mode})=>{
 const page=await fixture({dark,mode})
 try{
  await page.evaluate(kind=>{window.previewFixture.add(kind);window.previewFixture.append('请围绕研究主题填写需求。\n先核对资料，再交付可编辑文件。')},kind)
  await page.waitForSelector('[data-odyssey-deliverable-art]')
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-odyssey-deliverable-art] img')].every(image=>image.complete&&image.naturalWidth>0))
  const geometry=await page.evaluate(()=>{
   const rect=element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}}
   const card=document.querySelector('[data-composer-card]'),art=document.querySelector('[data-odyssey-deliverable-art]'),board=art.firstElementChild,cover=board.firstElementChild;
   return{card:rect(card),surface:getComputedStyle(card).backgroundColor,blur:getComputedStyle(card).backdropFilter,art:rect(art),board:rect(board),cover:{width:parseFloat(getComputedStyle(cover).width),height:parseFloat(getComputedStyle(cover).height)},row:rect(document.querySelector('.uV2eYG_row')),
    layers:['textarea','[data-input-backdrop]','[data-input-mirror]'].map(selector=>{const element=document.querySelector(selector),style=getComputedStyle(element);return{...rect(element),left:style.paddingLeft,right:style.paddingRight,top:style.paddingTop,bottom:style.paddingBottom,font:style.fontSize,lineHeight:style.lineHeight}}),
    hidden:art.getAttribute('aria-hidden'),interactive:getComputedStyle(art).pointerEvents,images:[...art.querySelectorAll('img')].map(image=>({width:image.naturalWidth,height:image.naturalHeight,src:image.src.slice(0,22)}))}
  })
  expect(geometry.card.width).toBeCloseTo(780,1);expect(geometry.card.height).toBeCloseTo(199,1)
  expect(geometry.surface).toBe(dark?'rgba(0, 0, 0, 0.49)':'rgba(255, 255, 255, 0.5)');expect(geometry.blur).toBe('blur(12px)')
  expect(geometry.board.y-geometry.card.y).toBeCloseTo(23,1)
  expect(geometry.art.width).toBeCloseTo(128,1);expect(geometry.art.height).toBeCloseTo(128,1)
  expect(geometry.row.height).toBeCloseTo(48,1)
  for(const layer of geometry.layers){expect(layer.left).toBe('165px');expect(layer.right).toBe('17px');expect(layer.top).toBe('15px');expect(layer.bottom).toBe('8px');expect(layer.font).toBe('16px');expect(layer.lineHeight).toBe('24px')}
  expect(geometry.cover.width).toBeCloseTo(kind==='ppt'?116:80,2);expect(Math.abs(geometry.cover.height-(kind==='ppt'?65.25:107.273))).toBeLessThan(.02)
  expect(geometry.hidden).toBe('true');expect(geometry.interactive).toBe('none')
  expect(geometry.images.map(image=>[image.width,image.height])).toEqual([[1206,676],[456,99]])
  expect(geometry.images.every(image=>image.src.startsWith('data:image/png;base64,'))).toBe(true)
  await page.locator('[data-composer-card]').screenshot({path:evidence+'/'+kind+'-'+(dark?'dark':'light')+'.png'})
 }finally{await page.close()}
},15000)

it('uses the last actual target reference, and native deletion restores text layout without replacing or blurring the textarea',async()=>{
 const page=await fixture({mode:'conversation'})
 try{
  await page.evaluate(()=>{window.previewFixture.add('ppt');window.previewFixture.add('report');window.previewFixture.append('保留的正文');window.savedInput=document.querySelector('textarea')})
  await expect.poll(()=>page.locator('[data-odyssey-deliverable-art="report"]').count()).toBe(1)
  await page.evaluate(()=>window.previewFixture.removeLast())
  await expect.poll(()=>page.locator('[data-odyssey-deliverable-art="ppt"]').count()).toBe(1)
  await page.locator('textarea').focus()
  await page.locator('textarea').evaluate(input=>input.setSelectionRange(1,1))
  await page.locator('textarea').press('Backspace')
  await expect.poll(()=>page.locator('[data-odyssey-deliverable-art]').count()).toBe(0)
  expect(await page.evaluate(()=>window.previewFixture.shell.snapshot.draft)).toContain('保留的正文')
  expect(await page.evaluate(()=>window.savedInput===document.querySelector('textarea')&&document.activeElement===window.savedInput)).toBe(true)
  expect(await page.locator('textarea').evaluate(input=>input.selectionStart)).toBe(0)
  expect(await page.locator('textarea').evaluate(input=>getComputedStyle(input).paddingLeft)).toBe('17px')
  expect(await page.locator('[data-composer-card]').evaluate(card=>getComputedStyle(card).backgroundColor)).toBe('rgb(249, 249, 249)')
  expect(await page.evaluate(()=>window.submissions)).toBe(0)
 }finally{await page.close()}
},15000)

it('does not decorate typed tag-like text or an unrelated skill that shares the label',async()=>{
 const page=await fixture()
 try{
  await page.evaluate(()=>window.previewFixture.text('/efund-ppt-maker 这只是文字 /ework-equity-research'))
  expect(await page.locator('[data-odyssey-deliverable-art]').count()).toBe(0)
  await page.evaluate(()=>window.previewFixture.add('ppt','ework-managed-skill','imported:efund-ppt-maker'))
  expect(await page.locator('[data-odyssey-deliverable-art]').count()).toBe(0)
 }finally{await page.close()}
},15000)

it.each(['home','conversation'])('keeps the cover fixed while only long native text scrolls above the independent toolbar (%s)',async mode=>{
 const page=await fixture({mode})
 try{
  await page.evaluate(()=>{window.previewFixture.add('report');window.previewFixture.append('需要保留的正文\n'.repeat(90))})
  await page.waitForSelector('[data-odyssey-deliverable-art]',{state:'attached'})
  const metrics=()=>page.evaluate(()=>{const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{y:r.y,height:r.height,bottom:r.bottom}};const scroll=document.querySelector('[data-input-scroll]');return{card:rect('[data-composer-card]'),art:rect('.odyssey-deliverable-artboard'),row:rect('.uV2eYG_row'),scroll:rect('[data-input-scroll]'),scrollTop:scroll.scrollTop,scrollHeight:scroll.scrollHeight}})
  const before=await metrics()
  expect(before.card.height).toBeCloseTo(384,1);expect(before.scroll.height).toBeCloseTo(336,1)
  expect(before.scrollHeight).toBeGreaterThan(before.scroll.height)
  await page.locator('[data-input-scroll]').evaluate(element=>{element.scrollTop=120})
  const after=await metrics()
  expect(after.scrollTop).toBe(120);expect(after.art.y).toBeCloseTo(before.art.y,2);expect(after.row.y).toBeCloseTo(before.row.y,2)
  expect(after.row.bottom).toBeCloseTo(after.card.bottom,1)
  await page.locator('[data-composer-card]').screenshot({path:evidence+'/report-expanded.png'})
 }finally{await page.close()}
},15000)

it.each([520,400,280])('preserves a usable native input in a %spx pane',async width=>{
 const page=await fixture({width})
 try{
  await page.evaluate(()=>{window.previewFixture.add('ppt');window.previewFixture.append('窄窗继续编辑');window.savedInput=document.querySelector('textarea')})
  await page.waitForSelector('[data-odyssey-deliverable-art]',{state:'attached'})
  const actual=await page.locator('textarea').evaluate(input=>{const style=getComputedStyle(input);return{available:input.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),padding:style.paddingLeft,rootWidth:input.closest('[data-composer-card]').getBoundingClientRect().width,overflow:input.closest('[data-composer-card]').scrollWidth}})
  expect(actual.available).toBeGreaterThanOrEqual(240);expect(actual.rootWidth).toBeCloseTo(width,1);expect(actual.overflow).toBeLessThanOrEqual(width+1)
  expect(await page.locator('[data-odyssey-deliverable-art]').evaluate(element=>getComputedStyle(element).display)).toBe(width<=410?'none':'block')
  await page.locator('textarea').focus();await page.keyboard.press('End');await page.keyboard.insertText('补充')
  expect(await page.evaluate(()=>window.previewFixture.shell.snapshot.draft)).toContain('补充')
  expect(await page.evaluate(()=>window.savedInput===document.querySelector('textarea'))).toBe(true)
  await page.locator('[data-composer-card]').screenshot({path:evidence+'/pane-'+width+'.png'})
 }finally{await page.close()}
},15000)
