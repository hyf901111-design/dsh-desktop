import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {readPptxScene} from '../src/main/pptx/scene'
// Packaging serializes these functions. Use Node's original modules so Vite's
// import rewrites never become references inside the deployed browser bundle.
const requireModule=createRequire(import.meta.url)
const {patchSherlockOfficePreviewClient}=requireModule('../scripts/lib/patch-sherlock-office-preview.mjs')
const {patchPptxResize,stripPptxResizePatch,createPptxScrollWindow}=requireModule('../scripts/lib/pptx-resize-settle.mjs')
const {patchPptxEditor}=requireModule('../scripts/lib/pptx-editor-ui.mjs')

let browser,hostScript,officeScript,bytes,documentModel,resizeScript,upgradedResizeScript
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),contents:`
  import React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot} from 'react-dom/client';
  window.__ModuleLoader__={load:descriptor=>{window.office=descriptor.factory(id=>({'react':React,'react/jsx-runtime':jsx,'react-dom':dom}[id]))}};
  window.mountPpt=()=>createRoot(document.getElementById('surface')).render(React.createElement(window.office.officePreviewService.Component,{kind:'pptx',sourceUrl:'sherlock-preview://viewport-fixture/',title:'多页演示.pptx'}));
 `},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}})
 hostScript=output.outputFiles[0].text
 const raw=await readFile('build/sherlock-plugin-profile/vendor/@huanlin/dsh-plugin-better-sidebar-plugin-office/lib/client.js','utf8')
 resizeScript=patchPptxResize(patchSherlockOfficePreviewClient(stripPptxResizePatch(raw)))
 // Exercise the installed v5 upgrade before running the actual renderer. Its
 // old implementation must be removed rather than preserved by a marker guard.
 const legacy=resizeScript.replace('/* sherlock:pptx-resize-settle:v6 */','/* sherlock:pptx-resize-settle:v5 */').replace(createPptxScrollWindow.toString(),'function createPptxScrollWindow(){throw Error("legacy scheduler was retained")}')
 upgradedResizeScript=patchPptxResize(legacy)
 officeScript=patchPptxEditor(upgradedResizeScript)
  .replace('function Re(t, n, e) {','window.__axisFromXml=(axis,xml)=>{const node=new ve(new DOMParser().parseFromString(xml,"text/xml").documentElement),source=So(node,{theme:{colorScheme:new Map()},colorCache:new Map()});Re(axis,source,axis.type==="category"?"category":"value");return axis};function Re(t, n, e) {')
  .replace('Qt(), Yt(), ((Ut = document.fonts)','window.__fitJobs.push({element:e,paragraph:N,signal:n.signal,run:Qt});Qt(), Yt(), ((Ut = document.fonts)')
 bytes=await readFile('skills/efund-ppt-maker/assets/efund-ai-platform-v21.pptx')
 documentModel={...readPptxScene(bytes),id:'viewport-fixture',name:'多页演示.pptx',version:'1'.repeat(64)}
 const runtime=process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
 const imported=await import(/* @vite-ignore */pathToFileURL(runtime).href)
 browser=await (imported.chromium||imported.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(async()=>{await browser?.close()})

it('upgrades an installed v5 scheduler and keeps the next application and pinned input identical',()=>{
 expect(upgradedResizeScript).toBe(resizeScript)
 expect(patchPptxResize(upgradedResizeScript)).toBe(upgradedResizeScript)
 expect(stripPptxResizePatch(upgradedResizeScript)).toBe(stripPptxResizePatch(resizeScript))
})

for(const width of [360,820])it(`keeps the ${width}px editable PPT viewport bounded and scrolls only nearby slides`,async()=>{
 const context=await browser.newContext({viewport:{width:1100,height:800}}),page=await context.newPage()
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.route('http://127.0.0.1/pptx-viewport-fixture',route=>route.fulfill({contentType:'text/html',body:`<style>body{margin:0}#outer{height:700px;overflow:auto}#surface{width:${width}px;height:520px;display:flex;flex-direction:column;overflow:hidden}</style><main id="outer"><div id="surface"></div><div style="height:1000px"></div></main>`}))
  await page.route('http://127.0.0.1/fixture.pptx',route=>route.fulfill({body:bytes}))
  await page.goto('http://127.0.0.1/pptx-viewport-fixture')
  await page.evaluate(model=>{
   window.__fitJobs=[]
   window.sherlockPptEditor={open:async()=>({ok:true,document:model}),save:async()=>({ok:false,error:'只读回归样本'})}
   const original=window.fetch;window.fetch=(url,options)=>original(String(url).startsWith('sherlock-preview:')?'/fixture.pptx':url,options)
  },documentModel)
  await page.addScriptTag({content:hostScript});await page.addScriptTag({content:officeScript});await page.evaluate(()=>window.mountPpt())
  try{await page.locator('[data-pptx-paragraph][contenteditable=true]').first().waitFor({timeout:5000})}catch(error){console.log({errors,body:await page.locator('body').innerText(),paragraphs:await page.locator('[data-pptx-paragraph]').count()});throw error}
  const viewport=page.locator('.dsh_32k8zk_editorPptxHost')
  const intervals=await page.evaluate(()=>{
   const xml=children=>{const tag=children.includes('tickLblSkip')?'catAx':'dateAx';return'<c:'+tag+' xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">'+children+'</c:'+tag+'>'}
   return[[1155,'<c:auto val="1"/>'],[1155,'<c:auto val="0"/>'],[1155,'<c:auto val="1"/><c:tickLblSkip val="1"/>'],[1155,'<c:auto val="1"/><c:tickLblSkip val="3"/>'],[4,'<c:auto val="1"/>']].map(([count,children])=>{
    const data=Array.from({length:count},(_,i)=>String(i)),axis={type:'category',data,axisLabel:{interval:0,rotate:30}}
    window.__axisFromXml(axis,xml(children));return{interval:axis.axisLabel.interval,count:axis.data.length,sameData:axis.data===data,rotate:axis.axisLabel.rotate}
   })
  })
  expect.soft(intervals).toEqual([{interval:'auto',count:1155,sameData:true,rotate:30},{interval:0,count:1155,sameData:true,rotate:30},{interval:0,count:1155,sameData:true,rotate:30},{interval:2,count:1155,sameData:true,rotate:30},{interval:0,count:4,sameData:true,rotate:30}])
  const annualAxis=await page.evaluate(()=>{
   const data=Array.from({length:1155},(_,index)=>String(43831+index)),xml=children=>'<c:dateAx xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:auto val="1"/>'+children+'</c:dateAx>'
   const primary={type:'category',data,axisLabel:{interval:0}},secondary={type:'category',data,axisLabel:{interval:0}},formatted={type:'category',data:data.map((value,index)=>new Date((Number(value)-25569)*86400000).toISOString().slice(0,10).replaceAll('-',index%2?'/':'-')),axisLabel:{interval:0}},unknown={type:'category',data,axisLabel:{interval:0}}
   window.__axisFromXml(primary,xml('<c:majorUnit val="12"/><c:majorTimeUnit val="months"/>'))
   window.__axisFromXml(secondary,xml('<c:delete val="1"/><c:majorUnit val="1"/><c:majorTimeUnit val="days"/>'))
   window.__axisFromXml(formatted,xml('<c:majorUnit val="12"/><c:majorTimeUnit val="months"/>'))
   window.__axisFromXml(unknown,xml('<c:majorUnit val="12"/><c:majorTimeUnit val="unsupported"/>'))
   const labels=axis=>typeof axis.axisLabel.interval==='function'?axis.data.map((value,index)=>axis.axisLabel.interval(index,value)?index:-1).filter(index=>index>=0):axis.axisLabel.interval
   return{labels:labels(primary),repeated:labels(primary),formatted:labels(formatted),fallback:unknown.axisLabel.interval,hidden:secondary.axisLabel.show===false,count:primary.data.length,sameData:primary.data===data}
  })
  expect.soft(annualAxis).toEqual({labels:[0,366,731,1096],repeated:[0,366,731,1096],formatted:[0,366,731,1096],fallback:'auto',hidden:true,count:1155,sameData:true})
  expect(await viewport.evaluate(element=>element.clientHeight)).toBe(520)
  expect(await viewport.evaluate(element=>element.scrollHeight)).toBeGreaterThan(3000)
  await expect.poll(()=>page.locator('[data-slide-index]>[data-mounted="1"]').count()).toBeLessThan(10)
  await page.locator('[data-pptx-paragraph][contenteditable=true]').first().click()
  await page.getByRole('toolbar',{name:'对象格式'}).waitFor()
  const selectedName=await page.locator('.sherlock-ppt-object-name').textContent()
  await viewport.hover()
  await page.evaluate(()=>{window.__lastRapidWheel=performance.now();window.__rapidWheel=()=>{window.__lastRapidWheel=performance.now()};document.addEventListener('wheel',window.__rapidWheel,true)})
  const deltas=[...Array(18).fill(260),...Array(18).fill(-260),...Array(18).fill(420),...Array(18).fill(-420)]
  // Real compositor input, continuously queued every 8ms with reversals; never
  // await a frame or a settled screenshot between individual wheel events.
  await Promise.all(deltas.map((delta,index)=>new Promise((resolve,reject)=>setTimeout(()=>page.mouse.wheel(1,delta).then(resolve,reject),index*8))))
  // Input ACK can precede delivery of coalesced compositor tail events. Wait
  // for the actual scroller and wheel stream to share one scheduler quiet period.
  await viewport.evaluate(root=>new Promise(resolve=>{let top=root.scrollTop,stable=performance.now();const tick=()=>{const now=performance.now();if(root.scrollTop!==top){top=root.scrollTop;stable=now}if(now-stable>=80&&now-window.__lastRapidWheel>=80){document.removeEventListener('wheel',window.__rapidWheel,true);resolve()}else requestAnimationFrame(tick)};requestAnimationFrame(tick)}))
  await viewport.evaluate(root=>{root.scrollTop=0})
  await expect.poll(()=>page.locator('.sherlock-ppt-format').evaluate(el=>getComputedStyle(el).visibility)).toBe('visible')
  expect(await page.locator('.sherlock-ppt-object-name').textContent()).toBe(selectedName)
  expect(await page.locator('[data-pptx-paragraph][contenteditable=true]').count()).toBeGreaterThan(0)
  await expect.poll(()=>page.locator('[data-slide-index]>[data-mounted="1"]').count()).toBeLessThan(15)
  await viewport.hover();await page.mouse.wheel(0,1100)
  await expect.poll(()=>viewport.evaluate(element=>element.scrollTop)).toBeGreaterThan(600)
  expect(await page.locator('#outer').evaluate(element=>element.scrollTop)).toBe(0)
  // A narrow pane can show more short slides within the two-viewport overscan.
  await expect.poll(()=>page.locator('[data-slide-index]>[data-mounted="1"]').count()).toBeLessThan(15)
  expect(await page.locator('[data-pptx-paragraph][contenteditable=true]').count()).toBeGreaterThan(0)
  // A native compositor can scroll before the main-thread scroll/IO/RAF callbacks.
  // Dispatch a cancelable cold wheel and inspect before any of those callbacks.
  const coldWheel=await viewport.evaluate(root=>{
   const item=root.querySelector('[data-slide-index="20"]'),before=root.scrollTop
   const cold=!item.querySelector('[data-pptx-node-id]'),delta=item.offsetTop-before
   const defaults=[{ctrlKey:true},{metaKey:true},{shiftKey:true},{deltaX:1},{deltaMode:1}].map(options=>{
    const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:delta,...options});root.dispatchEvent(event)
    return !event.defaultPrevented&&root.scrollTop===before&&!item.querySelector('[data-pptx-node-id]')
   })
   const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:delta})
   root.dispatchEvent(event)
   const bounds=root.getBoundingClientRect()
   const visible=[...root.querySelectorAll('[data-slide-index]')].filter(item=>{const box=item.getBoundingClientRect();return box.bottom>bounds.top&&box.top<bounds.bottom})
   const burstItem=root.querySelector('[data-slide-index="30"]'),burstBefore=root.scrollTop,burstCold=!burstItem.querySelector('[data-pptx-node-id]')
   const burstEvent=new WheelEvent('wheel',{bubbles:true,cancelable:false,deltaY:burstItem.offsetTop-root.scrollTop});root.dispatchEvent(burstEvent)
   const burst={cold:burstCold,unchanged:root.scrollTop===burstBefore,prevented:burstEvent.defaultPrevented,ready:!!burstItem.querySelector('[data-pptx-node-id]')}
   return{cold,defaults,burst,prevented:event.defaultPrevented,moved:root.scrollTop-before,delta,blank:visible.filter(item=>!item.querySelector('[data-pptx-node-id]')).map(item=>item.dataset.slideIndex),mounted:root.querySelectorAll('[data-mounted="1"]').length}
  })
  expect(coldWheel.cold).toBe(true)
  expect(coldWheel.defaults).toEqual([true,true,true,true,true])
  expect(coldWheel.burst).toEqual({cold:true,unchanged:true,prevented:false,ready:true})
  expect(coldWheel.prevented).toBe(true)
  expect(coldWheel.moved).toBeCloseTo(coldWheel.delta,0)
  expect(coldWheel.blank).toEqual([])
  expect(coldWheel.mounted).toBeLessThan(15)
  // IO runs after paint. A cold three-page jump must have its visible slide
  // content in the scroll frame itself, before a white placeholder is painted.
  const frames=await page.evaluate(async()=>{
   const viewport=document.querySelector('.dsh_32k8zk_editorPptxHost'),results=[]
   for(const index of [12,20,28]){
    await new Promise(resolve=>{
     viewport.addEventListener('scroll',()=>requestAnimationFrame(()=>{
      const bounds=viewport.getBoundingClientRect()
      const visible=[...viewport.querySelectorAll('[data-slide-index]')].filter(item=>{const box=item.getBoundingClientRect();return box.bottom>bounds.top&&box.top<bounds.bottom})
      results.push({index,blank:visible.filter(item=>!item.querySelector('[data-pptx-node-id]')).map(item=>item.dataset.slideIndex)})
      resolve()
     }),{once:true})
     viewport.scrollTop=viewport.querySelector('[data-slide-index="'+index+'"]').offsetTop
    })
   }
   return results
  })
  expect(frames.map(frame=>frame.blank)).toEqual([[],[],[]])
  // An embedded note reader below the window must stop warming invisible pages.
  await page.locator('#surface').evaluate(element=>{element.style.marginTop='1000px'})
  await expect.poll(()=>page.locator('[data-slide-index]>[data-mounted="1"]').count()).toBe(0)
  await page.locator('#surface').evaluate(element=>{element.style.marginTop='0px'})
  await expect.poll(()=>page.locator('[data-pptx-paragraph][contenteditable=true]').count()).toBeGreaterThan(0)
  const fits=await page.evaluate(()=>{
   const live=window.__fitJobs.find(job=>!job.signal.aborted&&job.element.isConnected),disposed=window.__fitJobs.filter(job=>job.signal.aborted).slice(0,3)
   const before=live.paragraph.getBoundingClientRect();live.run();const after=live.paragraph.getBoundingClientRect()
   const observer=new MutationObserver(()=>{});observer.observe(document.body,{childList:true})
   for(const job of disposed)job.run()
   const resurrected=observer.takeRecords().reduce((n,record)=>n+record.addedNodes.length,0);observer.disconnect()
   return{live:!!live,disposed:disposed.length,resurrected,before:[before.width,before.height],after:[after.width,after.height]}
  })
  expect(fits.live).toBe(true);expect(fits.disposed).toBeGreaterThan(0)
  expect(fits.resurrected).toBe(0);expect(fits.after).toEqual(fits.before)


 }finally{await context.close()}
},20000)
