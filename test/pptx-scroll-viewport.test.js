import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {readPptxScene,editPptxScene} from '../src/main/pptx/scene'
import {editPptxContent} from '../src/main/pptx/content'
import {unzipSync,zipSync,strToU8,strFromU8} from 'fflate'
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
  window.mountPpt=()=>createRoot(document.getElementById('surface')).render(React.createElement(window.office.officePreviewService.Component,{kind:'pptx',sourceUrl:'sherlock-preview://viewport-fixture/',title:'多页演示.pptx',onToolbarState:state=>{window.pptModeState=state},onToolbarControls:controls=>{window.pptModeControls=controls}}));
 `},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}})
 hostScript=output.outputFiles[0].text
 const raw=await readFile('build/sherlock-plugin-profile/vendor/@huanlin/dsh-plugin-better-sidebar-plugin-office/lib/client.js','utf8')
 resizeScript=patchPptxResize(patchSherlockOfficePreviewClient(stripPptxResizePatch(raw)))
 // Exercise the installed v6 upgrade before running the actual renderer. Its
 // old implementation must be removed rather than preserved by a marker guard.
 const legacy=resizeScript.replace('/* sherlock:pptx-resize-settle:v8 */','/* sherlock:pptx-resize-settle:v6 */').replace(createPptxScrollWindow.toString(),'function createPptxScrollWindow(){throw Error("legacy scheduler was retained")}')
 upgradedResizeScript=patchPptxResize(legacy)
 officeScript=patchPptxEditor(upgradedResizeScript)
  .replace('exports.officePreviewService = officePreviewService;','window.__initSafeXml=()=>init_aiden0z_pptx_renderer_es();exports.officePreviewService = officePreviewService;')
  .replace('const o = init(t);','const o = init(t);if(window.__chartResizeCalls){const resize=o.resize.bind(o);o.resize=(...args)=>{window.__chartResizeCalls.push(args);return resize(...args)};window.__chartInstances.push(o)}')
  .replace('js = class js extends EventTarget {','js = window.__PptxViewer = class js extends EventTarget {')
  .replace('o.setOption(n), e?.add(o)','window.__chartOptions?.push(n),o.setOption(n), e?.add(o)')
  .replace('ve = class ve {','ve = window.__SafeXmlNode = class ve {')
  .replace('mountListSlide(n, e, o, s, i) {','mountListSlide(n, e, o, s, i) {window.__pptxViewer=this;')
  .replace('function Re(t, n, e) {','window.__axisFromXml=(axis,xml)=>{const node=new ve(new DOMParser().parseFromString(xml,"text/xml").documentElement),source=So(node,{theme:{colorScheme:new Map()},colorCache:new Map()});Re(axis,source,axis.type==="category"?"category":"value");return axis};function Re(t, n, e) {')
  .replace('Qt(), Yt(), ((Ut = document.fonts)','window.__fitJobs.push({element:e,paragraph:N,signal:n.signal,run:Qt});Qt(), Yt(), ((Ut = document.fonts)')
 bytes=await readFile('skills/efund-ppt-maker/assets/efund-ai-platform-v21.pptx')
 documentModel={...readPptxScene(bytes),id:'viewport-fixture',name:'多页演示.pptx',version:'1'.repeat(64)}
 const runtime=process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
 const imported=await import(/* @vite-ignore */pathToFileURL(runtime).href)
 browser=await (imported.chromium||imported.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(async()=>{await browser?.close()})

async function enterEditor(page){
 await page.locator('[data-pptx-paragraph]').first().waitFor({timeout:5000})
 expect(await page.evaluate(()=>window.pptModeState?.mode)).toBe('preview')
 expect(await page.evaluate(()=>window.pptOpenCalls)).toBe(0)
 expect(await page.locator('[data-pptx-paragraph][contenteditable=true]').count()).toBe(0)
 expect(await page.locator('.sherlock-ppt-selection').count()).toBe(0)
 // Exercise the same host control exposed to the production toolbar, explicitly.
 expect(await page.evaluate(()=>window.pptModeControls.setMode('edit'))).toBe(true)
 await page.locator('[data-pptx-paragraph][contenteditable=true]').first().waitFor({timeout:5000})
 expect(await page.evaluate(()=>window.pptOpenCalls)).toBe(1)
 expect(await page.evaluate(()=>window.pptModeState?.mode)).toBe('edit')
}


it('upgrades an installed v6 scheduler and keeps the next application and pinned input identical',()=>{
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
   window.__fitJobs=[];window.pptOpenCalls=0
   window.sherlockPptEditor={open:async()=>{window.pptOpenCalls++;return{ok:true,document:model}},save:async()=>({ok:false,error:'只读回归样本'})}
   const original=window.fetch;window.fetch=(url,options)=>original(String(url).startsWith('sherlock-preview:')?'/fixture.pptx':url,options)
  },documentModel)
  await page.addScriptTag({content:hostScript});await page.addScriptTag({content:officeScript});await page.evaluate(()=>window.mountPpt())
  try{await enterEditor(page)}catch(error){console.log({errors,body:await page.locator('body').innerText(),paragraphs:await page.locator('[data-pptx-paragraph]').count()});throw error}
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


it('keeps warm scroll notifications free of display metric reads before the next cold mount',async()=>{
 const context=await browser.newContext({viewport:{width:1100,height:800}}),page=await context.newPage()
 try{
  await page.route('http://127.0.0.1/warm-scroll-fixture',route=>route.fulfill({contentType:'text/html',body:'<style>body{margin:0}#surface{width:723px;height:520px;display:flex;flex-direction:column;overflow:hidden}</style><main id="surface"></main>'}))
  await page.route('http://127.0.0.1/fixture.pptx',route=>route.fulfill({body:bytes}))
  await page.goto('http://127.0.0.1/warm-scroll-fixture')
  await page.evaluate(model=>{
   window.__fitJobs=[];window.pptOpenCalls=0;window.sherlockPptEditor={open:async()=>{window.pptOpenCalls++;return{ok:true,document:model}},save:async()=>({ok:false,error:'只读回归样本'})}
   const original=window.fetch;window.fetch=(url,options)=>original(String(url).startsWith('sherlock-preview:')?'/fixture.pptx':url,options)
  },documentModel)
  await page.addScriptTag({content:hostScript});await page.addScriptTag({content:officeScript});await page.evaluate(()=>window.mountPpt())
  await enterEditor(page)
  const result=await page.evaluate(()=>{
   const viewer=window.__pptxViewer,root=document.querySelector('.dsh_32k8zk_editorPptxHost'),original=viewer.getDisplayMetrics
   let reads=0;viewer.getDisplayMetrics=function(){reads++;return original.call(this)}
   const first=root.querySelector('[data-pptx-node-id]')
   for(let index=0;index<20;index++)root.dispatchEvent(new Event('scroll'))
   const warmReads=reads,unchanged=first===root.querySelector('[data-pptx-node-id]')
   root.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:6000}))
   const bounds=root.getBoundingClientRect(),visible=[...root.querySelectorAll('[data-slide-index]')].filter(item=>{const box=item.getBoundingClientRect();return box.bottom>bounds.top&&box.top<bounds.bottom})
   viewer.getDisplayMetrics=original
   return{warmReads,unchanged,coldReads:reads-warmReads,blank:visible.filter(item=>!item.querySelector('[data-pptx-node-id]')).length}
  })
  expect(result.warmReads).toBe(0);expect(result.unchanged).toBe(true)
  expect(result.coldReads).toBeGreaterThan(0);expect(result.blank).toBe(0)
 }finally{await context.close()}
},20000)


it('reuses immutable XML attribute and child lookups while respecting namespaces and new document identity',async()=>{
 const context=await browser.newContext(),page=await context.newPage()
 try{
  await page.goto('about:blank');await page.addScriptTag({content:hostScript});await page.addScriptTag({content:officeScript})
  const result=await page.evaluate(()=>{
   window.__initSafeXml();const parse=text=>new DOMParser().parseFromString(text,'text/xml').documentElement
   const xml=parse('<p:root xmlns:p="urn:p" xmlns:q="urn:q" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" val="0" q:id="other" r:id="link"><p:first val="A"/><q:first val="B"/></p:root>')
   const node=new window.__SafeXmlNode(xml),originalAttribute=xml.getAttribute.bind(xml),childrenGetter=Object.getOwnPropertyDescriptor(Element.prototype,'children').get,attributesGetter=Object.getOwnPropertyDescriptor(Element.prototype,'attributes').get
   let direct=0,attributes=0,children=0
   xml.getAttribute=name=>{direct++;return originalAttribute(name)}
   Object.defineProperty(xml,'children',{get(){children++;return childrenGetter.call(this)}})
   Object.defineProperty(xml,'attributes',{get(){attributes++;return attributesGetter.call(this)}})
   const values=[]
   for(let index=0;index<20;index++){
    const copy=new window.__SafeXmlNode(xml)
    values.push([copy.numAttr('val'),copy.attr('r:id'),copy.attr('absent'),copy.child('first').numAttr('val'),copy.child('missing').exists(),copy.attr('id'),copy.attr('unknown:id')])
   }
   const fresh=new window.__SafeXmlNode(parse('<p:root xmlns:p="urn:p" val="7"><p:first val="9"/></p:root>'))
   return{values,direct,attributes,children,fresh:[fresh.numAttr('val'),fresh.child('first').numAttr('val')],empty:[new window.__SafeXmlNode(null).attr('val'),new window.__SafeXmlNode(null).child('first').exists()]}
  })
  expect(result.values).toEqual(Array(20).fill([0,'link',undefined,undefined,false,'other','other']))
  expect(result.fresh).toEqual([7,9]);expect(result.empty).toEqual([undefined,false])
  expect(result.direct).toBeLessThanOrEqual(2);expect(result.attributes).toBe(33);expect(result.children).toBe(2)
 }finally{await context.close()}
},20000)


it('renders fresh text, fonts, geometry and chart data after editing and reparsing the same PPTX',async()=>{
 const parts=unzipSync(bytes),part=documentModel.slides[0].part,C='http://schemas.openxmlformats.org/drawingml/2006/chart',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
 parts[part]=strToU8(strFromU8(parts[part]).replace('</p:spTree>',`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9999" name="缓存重读图表"/></p:nvGraphicFramePr><p:xfrm><a:off x="190500" y="952500"/><a:ext cx="2857500" cy="1333500"/></p:xfrm><a:graphic><a:graphicData uri="${C}"><c:chart xmlns:c="${C}" xmlns:r="${R}" r:id="sherlockReloadChart"/></a:graphicData></a:graphic></p:graphicFrame></p:spTree>`))
 const rels=part.replace('slides/','slides/_rels/')+'.rels'
 parts[rels]=strToU8(strFromU8(parts[rels]).replace('</Relationships>',`<Relationship Id="sherlockReloadChart" Target="../charts/sherlock-reload.xml" Type="${R}/chart"/></Relationships>`))
 parts['ppt/charts/sherlock-reload.xml']=strToU8(`<c:chartSpace xmlns:c="${C}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>原始系列</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:strRef><c:f>Sheet1!$A$2:$A$3</c:f><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>原始一</c:v></c:pt><c:pt idx="1"><c:v>原始二</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>Sheet1!$B$2:$B$3</c:f><c:numCache><c:ptCount val="2"/><c:pt idx="0"><c:v>10</c:v></c:pt><c:pt idx="1"><c:v>20</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart><c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:crossAx val="2"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:crossAx val="1"/></c:valAx></c:plotArea></c:chart></c:chartSpace>`)
 const original=zipSync(parts,{level:0}),model=readPptxScene(original),field=model.slides[0].fields[0],node=model.slides[0].nodes.find(node=>node.nodeId===field.nodeId),chart=model.slides[0].nodes.find(node=>node.nodeId==='9999')
 const changed=editPptxScene(editPptxContent(original,[{id:field.id,text:'缓存重读后的正文'}]),[{id:node.id,geometry:{x:30,y:40,width:240,height:150,rotation:0},fontFamily:'Songti SC',fontSize:24},{id:chart.id,chart:{...chart.chart,title:'修改后的图表',categories:['Q1','Q2'],series:[{name:'修改后的系列',values:[30,50]}]}}])
 const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.route('http://127.0.0.1/reparse-fixture',route=>route.fulfill({contentType:'text/html',body:'<style>body{margin:0}#root{width:723px;height:520px;overflow:auto}</style><main id="root"><div id="mount"></div></main>'}))
  await page.route('http://127.0.0.1/original.pptx',route=>route.fulfill({body:Buffer.from(original)}))
  await page.route('http://127.0.0.1/changed.pptx',route=>route.fulfill({body:Buffer.from(changed)}))
  await page.goto('http://127.0.0.1/reparse-fixture')
  await page.addScriptTag({content:hostScript});await page.addScriptTag({content:officeScript})
  const before=await page.evaluate(async(nodeId)=>{
   window.__fitJobs=[];window.__chartOptions=[];window.__chartResizeCalls=[];window.__chartInstances=[];window.__initSafeXml()
   window.__reloadViewer=await window.__PptxViewer.open(await(await fetch('/original.pptx')).arrayBuffer(),document.getElementById('mount'),{scrollContainer:document.getElementById('root'),listOptions:{windowed:true,initialSlides:2,overscanViewport:1}})
   await Promise.all([...window.__reloadViewer.slideHandles.values()].map(handle=>handle.ready))
   const shape=document.querySelector('[data-pptx-node-id="'+nodeId+'"]')
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
   return{text:shape.textContent,resizes:window.__chartResizeCalls.length,finished:window.__chartInstances.at(-1).getZr().animation.isFinished(),series:window.__chartOptions.at(-1).series[0].data.map(item=>item.value??item)}
  },node.nodeId)
  expect(before.finished).toBe(true);expect(before.resizes).toBe(0);expect(before.series).toEqual([10,20]);expect(before.text).not.toContain('缓存重读后的正文')
  const after=await page.evaluate(async(nodeId)=>{
   window.__chartOptions=[];await window.__reloadViewer.open(await(await fetch('/changed.pptx')).arrayBuffer(),{listOptions:{windowed:true,initialSlides:2,overscanViewport:1}})
   await Promise.all([...window.__reloadViewer.slideHandles.values()].map(handle=>handle.ready))
   const shape=document.querySelector('[data-pptx-node-id="'+nodeId+'"]'),span=shape.querySelector('[data-pptx-paragraph] span:not([data-pptx-bullet])'),option=window.__chartOptions.at(-1)
   return{text:shape.textContent,font:getComputedStyle(span).fontFamily,geometry:[shape.style.left,shape.style.top,shape.style.width,shape.style.height],series:option.series[0].data.map(item=>item.value??item),name:option.series[0].name,categories:[option.xAxis].flat()[0].data,title:[option.title].flat()[0].text}
  },node.nodeId)
  expect(after).toMatchObject({text:'缓存重读后的正文',geometry:['30px','40px','240px','150px'],series:[30,50],name:'修改后的系列',categories:['Q1','Q2'],title:'修改后的图表'})
  expect(after.font).toContain('Songti SC');expect(errors).toEqual([])
  const resized=await page.evaluate(async()=>{
   const chartElement=document.querySelector('[data-pptx-node-id="9999"]'),chart=window.__chartInstances.at(-1),before=window.__chartResizeCalls.length
   chartElement.style.width='320px';await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
   return{width:chart.getWidth(),calls:window.__chartResizeCalls.length-before}
  })
  expect(resized).toEqual({width:320,calls:1})
  await page.evaluate(()=>window.__reloadViewer.destroy())
 }finally{await context.close()}
},20000)
