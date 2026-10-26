import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {runInNewContext} from 'node:vm'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {createHash} from 'node:crypto'
import {readPptxScene} from '../src/main/pptx/scene'
import {PptxAnnotationService} from '../src/main/pptx/annotations'
import {createPptxAnnotationCoordinator} from '../scripts/lib/pptx-annotation-coordinator.mjs'
const req=createRequire(import.meta.url)
const artifactRoot=process.env.PPTX_ANNOTATION_VIEWER_ARTIFACTS||'output/ppt-markup-design-20261025'
const {patchSherlockOfficePreviewClient}=req('../scripts/lib/patch-sherlock-office-preview.mjs')
const {patchPptxResize,stripPptxResizePatch}=req('../scripts/lib/pptx-resize-settle.mjs')
const {patchPptxEditor}=req('../scripts/lib/pptx-editor-ui.mjs')
let browser,hostScript,officeScript,bytes,model,fileVersion
beforeAll(async()=>{
 hostScript=(await build({stdin:{resolveDir:process.cwd(),contents:`
 import React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import{createRoot}from'react-dom/client';
 window.__ModuleLoader__={load:d=>window.office=d.factory(id=>({'react':React,'react/jsx-runtime':jsx,'react-dom':dom}[id]))};
 window.mount=()=>{window.root=createRoot(document.querySelector('#surface'));window.root.render(React.createElement(window.office.officePreviewService.Component,{kind:'pptx',sourceUrl:'sherlock-preview://annotation-fixture/',title:'标注回归.pptx',annotationSource:window.annotationSource||{sessionId:'source-owner',source:{kind:'workspace',relativePath:'review.pptx'}},onToolbarState:s=>window.toolbar=s,onToolbarControls:c=>window.controls=c}))};
 `},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
 const raw=await readFile('build/sherlock-plugin-profile/vendor/@huanlin/dsh-plugin-better-sidebar-plugin-office/lib/client.js','utf8')
 officeScript=patchPptxEditor(patchPptxResize(patchSherlockOfficePreviewClient(stripPptxResizePatch(raw))))
  .replace('mountListSlide(n, e, o, s, i) {','mountListSlide(n, e, o, s, i) {window.nativeViewer=this;')
 bytes=await readFile('skills/efund-ppt-maker/assets/efund-ai-platform-v21.pptx');model=readPptxScene(bytes);fileVersion=createHash('sha256').update(bytes).digest('hex')
 const runtime=process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
 const imported=await import(/* @vite-ignore */pathToFileURL(runtime).href)
 browser=await(imported.chromium||imported.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(async()=>browser?.close())
async function fixture(width=620,dark=false,backend){
 const context=await browser.newContext({viewport:{width:1100,height:820},deviceScaleFactor:1}),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('http://127.0.0.1/annotations',r=>r.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>body{margin:0;background:${dark?'#222':'#f4f4f4'}}#surface{position:absolute;right:0;top:40px;width:${width}px;height:650px;display:flex;flex-direction:column;overflow:hidden}#outside{margin:20px}</style><button id=outside>中央其他控件</button><main id=surface></main>`}))
 await page.route('http://127.0.0.1/review.pptx',r=>r.fulfill({body:bytes}))
 await page.goto('http://127.0.0.1/annotations')
 await page.evaluate(({model,dark,fileVersion})=>{
  if(dark)document.body.dataset.dsDarkTheme='true'
  window.digestCalls=0;window.pptFetches=0;const digest=window.crypto.subtle.digest.bind(window.crypto.subtle);window.crypto.subtle.digest=(...args)=>{window.digestCalls++;return digest(...args)};window.editCalls=0;window.saveCalls=0;window.openCalls=0;window.locations=[];window.subscribers=new Set();window.deleted=[]
  window.sherlockPptEditor={open:async()=>{window.editCalls++;return{ok:true,document:{...model,id:'editor',version:'1'.repeat(64)}}},save:async()=>{window.saveCalls++;return{ok:false,error:'只读测试'}}}
  window.snapshot={scene:{slideSize:model.slideSize,slides:model.slides},basis:{sessionId:'actual-session',documentId:'doc',fileVersion,name:'review.pptx'},marks:[],selectedId:null,revealSeq:0,revision:0,stale:false,busy:false,error:null}
  const publish=()=>{for(const f of window.subscribers)f()},next=patch=>{window.snapshot={...window.snapshot,...patch,revision:window.snapshot.revision+1};publish()}
  let ordinal=0
  window.handle={getSnapshot:()=>window.snapshot,subscribe:f=>{window.subscribers.add(f);return()=>window.subscribers.delete(f)},select:id=>next({selectedId:id,revealSeq:window.snapshot.revealSeq+1}),
   add:async location=>{window.locations.push(location);const mark={...location,id:'m'+(++ordinal),ordinal,revision:1,fileVersion:window.snapshot.basis.fileVersion,stale:false,comment:'',referenced:true};next({marks:[...window.snapshot.marks,mark],selectedId:mark.id,revealSeq:window.snapshot.revealSeq+1})},
   updateComment:async(id,text)=>next({marks:window.snapshot.marks.map(m=>m.id===id?{...m,comment:text}:m)}),
   remove:async id=>{window.deleted.push(window.snapshot.marks.find(m=>m.id===id));next({marks:window.snapshot.marks.filter(m=>m.id!==id),selectedId:null})},
   readd:async id=>next({marks:window.snapshot.marks.map(m=>m.id===id?{...m,referenced:true}:m),selectedId:id,revealSeq:window.snapshot.revealSeq+1}),undo:async()=>{const mark=window.deleted.pop();next({marks:[...window.snapshot.marks,mark],selectedId:mark.id,revealSeq:window.snapshot.revealSeq+1})},reanchor:async(id,location)=>next({marks:window.snapshot.marks.map(m=>m.id===id?{...m,...location,stale:false,referenced:true,fileVersion:window.snapshot.basis.fileVersion}:m),selectedId:id,revealSeq:window.snapshot.revealSeq+1}),dispose:()=>{window.disposed=(window.disposed||0)+1}}
  window[Symbol.for('sherlock:pptx-annotation-input')]={open:async source=>{window.openCalls++;window.openSource=source;return window.handle}}
  const fetch=window.fetch;window.fetch=(url,options)=>{if(String(url).startsWith('sherlock-preview:')){window.pptFetches++;return fetch('/review.pptx',options)}return fetch(url,options)}
 },{model,dark,fileVersion})
 if(backend){
  await page.exposeFunction('annotationAction',async(method,args)=>{await backend.handle[method](...args);return backend.handle.getSnapshot()})
  await page.evaluate(({source,snapshot})=>{
   window.annotationSource=source;window.snapshot=snapshot
   for(const method of ['add','select','updateComment','remove','readd','undo','reanchor'])window.handle[method]=async(...args)=>{const value=await window.annotationAction(method,args);window.snapshot=value;for(const fn of window.subscribers)fn()}
  },{source:backend.source,snapshot:backend.handle.getSnapshot()})
 }
 await page.addScriptTag({content:hostScript});await page.addScriptTag({content:officeScript});await page.evaluate(()=>window.mount())
 await page.locator('[data-pptx-paragraph]').first().waitFor({timeout:8000})
 return{context,page,errors,close:()=>context.close(),activate:async()=>{expect(await page.evaluate(()=>window.controls.setAnnotations(true))).toBe(true);await page.locator('[data-pptx-annotation-toolbar]').waitFor()}}
}
async function durableBackend(){
 const root=await mkdtemp(path.join(tmpdir(),'pptxa-bubble-delete-')),workspace=path.join(root,'workspace');await mkdir(workspace);await writeFile(path.join(workspace,'review.pptx'),bytes)
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
 const load=async(name,deps={})=>{let descriptor;runInNewContext(await readFile('node_modules/@deepseek-ai/'+name+'/lib/client.js','utf8'),{window:{__ModuleLoader__:{load:value=>descriptor=value}},AbortController,AbortSignal,queueMicrotask,setTimeout,clearTimeout,console,crypto});return descriptor.factory(id=>deps[id]??fake)}
 const runtime=await load('dsh-client-runtime'),native=await load('dsh-client-ui-conversation',{'@deepseek-ai/dsh-client-runtime/client':runtime})
 const shell=new native.SessionInputShell({actx:{},defaultSink(){throw Error('Deleting a mark must never send a prompt')}})
 shell.setDraft('整体要求📌与用户正文保持不变');shell.insertReference({source:'chat-file',ref:'foreign-file',label:'原附件',clipboardText:'原附件'},{start:0,end:0,draftRev:shell.snapshot.draftRev})
 let allowed=true
 const options={root:path.join(root,'state'),owner:()=> 'test-owner',resolveWorkspace:async id=>allowed&&id==='actual-session'?workspace:null,resolveAuthorizedSource:async()=>null,readHistory:async()=>({events:[],hasMore:false})}
 const service=new PptxAnnotationService(options),source={sessionId:'actual-session',source:{kind:'workspace',relativePath:'review.pptx'}},identity={sessionId:'actual-session',shell,ordinary:true}
 const coordinator=createPptxAnnotationCoordinator({bridge:service,resolveInput:async()=>identity,isCurrent:()=>true}),handle=await coordinator.open(source,{viewerKey:'actual-viewer'})
 return{root,workspace,options,service,source,shell,coordinator,handle,deny(){allowed=false},async close(){coordinator.dispose();shell.dispose();await rm(root,{recursive:true,force:true})}}
}
for(const english of [false,true])it(`deletes only the open mark from the ${english?'English dark':'Chinese light'} bubble through durable Main and the real native input transaction`,async()=>{
 const backend=await durableBackend(),f=await fixture(620,english,backend)
 try{
  await f.page.evaluate(english=>document.documentElement.dataset.odysseyLocale=english?'en':'zh',english);await f.activate();await point(f.page,.2,.3)
  await f.page.getByRole('textbox',{name:'标注备注'}).fill('第一条独立意见📌')
  await expect.poll(()=>backend.handle.getSnapshot().marks[0]?.comment).toBe('第一条独立意见📌')
  await f.page.getByRole('button',{name:'关闭标注气泡'}).click();await f.page.getByRole('button',{name:'框选',exact:true}).click()
  const r=await contentBox(f.page);await f.page.mouse.move(r.x+r.width*.55,r.y+r.height*.45);await f.page.mouse.down();await f.page.mouse.move(r.x+r.width*.8,r.y+r.height*.6,{steps:4});await f.page.mouse.up()
  await f.page.getByRole('textbox',{name:'标注备注'}).fill('只删除这一处框选')
  await expect.poll(()=>backend.handle.getSnapshot().marks[1]?.comment).toBe('只删除这一处框选')
  await backend.coordinator.whenIdle()
  const before=backend.handle.getSnapshot(),[first,second]=before.marks,nativeBefore=structuredClone(backend.shell.snapshot),reference={version:1,sessionId:'actual-session',documentId:before.basis.documentId,fileVersion:before.basis.fileVersion,markId:second.id}
  const prepared=await backend.service.prepare({sendingSessionId:'actual-session',sendId:'frozen-before-delete',expectedDraftRev:nativeBefore.draftRev,references:[{...reference,expectedStateRevision:before.revision}]});expect(prepared.ok,JSON.stringify(prepared)).toBe(true)
  const manifest=path.join(backend.workspace,prepared.value.manifestRelativePath),frozen=await readFile(manifest)
  const button=f.page.getByRole('button',{name:english?'Delete mark':'删除标记',exact:true})
  await button.waitFor({state:'visible',timeout:1500})
  await f.page.evaluate(english=>document.documentElement.dataset.odysseyLocale=english?'zh':'en',english)
  await f.page.getByRole('button',{name:english?'删除标记':'Delete mark',exact:true}).waitFor();expect(await f.page.getByRole('textbox',{name:'标注备注'}).inputValue()).toBe('只删除这一处框选')
  await f.page.evaluate(english=>document.documentElement.dataset.odysseyLocale=english?'en':'zh',english);await button.waitFor()
  const placement=await button.evaluate(el=>{const b=el.getBoundingClientRect(),p=el.closest('.pptxa-bubble').getBoundingClientRect();return{right:p.right-b.right,bottom:p.bottom-b.bottom}});expect(placement.right).toBeLessThan(16);expect(placement.bottom).toBeLessThan(16)
  await mkdir('/tmp/ppt-annotation-bubble-delete-20261026',{recursive:true});await f.page.locator('.pptxa-bubble').screenshot({path:`/tmp/ppt-annotation-bubble-delete-20261026/${english?'dark-en':'light-zh'}.png`})
  await button.click();await expect.poll(()=>backend.handle.getSnapshot().marks.map(mark=>mark.id)).toEqual([first.id])
  await expect.poll(()=>f.page.locator('.pptxa-bubble:visible').count()).toBe(0)
  expect(await f.page.locator(`[data-pptx-annotation-pin="${second.id}"]`).count()).toBe(0);expect(await f.page.locator(`[data-pptx-annotation-pin="${first.id}"]`).count()).toBe(1);expect(await f.page.locator('.pptxa-region:visible').count()).toBe(0)
  const nativeAfter=backend.shell.snapshot;expect(nativeAfter.draft).toContain('整体要求📌与用户正文保持不变');expect(nativeAfter.draft).toContain('第一条独立意见📌');expect(nativeAfter.draft).not.toContain('只删除这一处框选');expect(nativeAfter.occurrences.filter(value=>value.source==='chat-file')).toEqual(nativeBefore.occurrences.filter(value=>value.source==='chat-file'));expect(nativeAfter.occurrences.filter(value=>value.source==='pptx-annotation').map(value=>JSON.parse(value.ref).markId)).toEqual([first.id])
  const cold=await new PptxAnnotationService(backend.options).open(backend.source);expect(cold.ok).toBe(true);expect(cold.value.state.marks.map(mark=>mark.id)).toEqual([first.id]);expect(await backend.service.resolveReference({sendingSessionId:'actual-session',reference})).toMatchObject({ok:true,value:{status:'deleted'}})
  expect(await readFile(manifest)).toEqual(frozen);expect(await readFile(path.join(backend.workspace,'review.pptx'))).toEqual(bytes)
  await f.page.getByRole('button',{name:'撤销',exact:true}).click();await expect.poll(()=>backend.handle.getSnapshot().marks.map(mark=>mark.ordinal)).toEqual([1,2]);expect(backend.shell.snapshot.draft).toBe(nativeBefore.draft);expect(f.errors).toEqual([])
  await f.page.locator(`[data-pptx-annotation-pin="${first.id}"]`).click();await expect.poll(()=>f.page.getByRole('textbox',{name:'标注备注'}).inputValue()).toBe('第一条独立意见📌')
  await button.click();await expect.poll(()=>backend.handle.getSnapshot().marks.map(mark=>mark.id)).toEqual([second.id]);expect(await f.page.locator('.pptxa-region:visible').count()).toBe(1);expect(backend.shell.snapshot.draft).not.toContain('第一条独立意见📌');expect(backend.shell.snapshot.draft).toContain('只删除这一处框选')
 }finally{await f.close();await backend.close()}
},25000)
it('keeps the bubble, mark and the native draft when Main rejects its delete',async()=>{
 const backend=await durableBackend(),f=await fixture(620,false,backend)
 try{
  await f.activate();await point(f.page);await f.page.getByRole('textbox',{name:'标注备注'}).fill('不能丢失的修改意见')
  await expect.poll(()=>backend.handle.getSnapshot().marks[0]?.comment).toBe('不能丢失的修改意见');await backend.coordinator.whenIdle();const before=structuredClone(backend.shell.snapshot),marks=backend.handle.getSnapshot().marks
  backend.deny();await f.page.getByRole('button',{name:'删除标记',exact:true}).click({timeout:1500})
  await expect.poll(()=>f.page.locator('.pptxa-error').innerText()).toContain('工作区');expect(await f.page.locator('.pptxa-bubble:visible').count()).toBe(1);expect(backend.handle.getSnapshot().marks).toEqual(marks);expect(backend.shell.snapshot.draft).toBe(before.draft);expect(backend.shell.snapshot.occurrences).toEqual(before.occurrences);expect(f.errors).toEqual([])
 }finally{await f.close();await backend.close()}
},20000)
async function contentBox(page,index=0){
 return page.locator(`[data-slide-index="${index}"]>[data-mounted="1"]`).first().evaluate(e=>{const r=e.firstElementChild.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})
}
async function point(page,x=.5,y=.45,index=0){const r=await contentBox(page,index);await page.getByRole('button',{name:'点选',exact:true}).click();await page.mouse.click(r.x+r.width*x,r.y+r.height*y)}
it('adds an object pin through the real native renderer without retargeting its node after DOM pointer capture',async()=>{
 const f=await fixture();try{
  expect(await f.page.evaluate(()=>[window.editCalls,window.openCalls,window.saveCalls,window.digestCalls,window.pptFetches])).toEqual([0,0,0,0,1]);await f.activate();expect(await f.page.evaluate(()=>[window.digestCalls,window.pptFetches])).toEqual([1,1])
  const target=await f.page.locator('[data-slide-index="0"] [data-pptx-node-id]').evaluateAll(nodes=>{const el=nodes.find(el=>{const r=el.getBoundingClientRect();return el.dataset.pptxPart==='ppt/slides/slide1.xml'&&r.width>80&&r.height>20&&r.height<180});const r=el.getBoundingClientRect();return{id:el.dataset.pptxNodeId,x:r.x+r.width/2,y:r.y+r.height/2}})
  await f.page.getByRole('button',{name:'点选',exact:true}).click();await f.page.mouse.click(target.x,target.y)
  await expect.poll(()=>f.page.evaluate(()=>window.locations.length)).toBe(1)
  expect(await f.page.evaluate(()=>window.locations[0].nodeIds)).toEqual([model.slides[0].nodes.find(n=>n.nodeId===target.id).id])
  expect(await f.page.evaluate(()=>[window.editCalls,window.saveCalls])).toEqual([0,0]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it('keeps normalized regions and numbered pins through native windowing, zoom and a narrow resize; repeated selection reopens the simple bubble',async()=>{
 const f=await fixture();try{
  await f.activate();const r=await contentBox(f.page)
  await f.page.mouse.move(r.x+r.width*.25,r.y+r.height*.25);await f.page.mouse.down();await f.page.mouse.move(r.x+r.width*.65,r.y+r.height*.6,{steps:4});await f.page.mouse.up()
  await expect.poll(()=>f.page.evaluate(()=>window.locations.length)).toBe(1)
  const region=await f.page.evaluate(()=>window.locations[0].region);expect(region.x).toBeCloseTo(.25,2);expect(region.y).toBeCloseTo(.25,2);expect(region.width).toBeCloseTo(.4,2);expect(region.height).toBeCloseTo(.35,2)
  await f.page.getByRole('textbox',{name:'标注备注'}).fill('调整这一处，整体提示词由协调器独立保留。')
  await f.page.getByRole('button',{name:'关闭标注气泡'}).click();expect(await f.page.locator('.pptxa-bubble:visible').count()).toBe(0)
  await f.page.evaluate(()=>window.handle.select('m1'));await f.page.locator('.pptxa-bubble:visible').waitFor();expect(await f.page.getByRole('textbox',{name:'标注备注'}).inputValue()).toContain('调整这一处')
  await f.page.keyboard.press('Escape');await f.page.evaluate(()=>window.nativeViewer.goToSlide(10,{behavior:'auto',block:'nearest'}));await f.page.locator('[data-slide-index="10"]>[data-mounted="1"]').waitFor()
  await expect.poll(()=>f.page.locator('[data-slide-index="0"] [data-pptx-annotation-pin]').count()).toBe(0)
  await point(f.page,.4,.4,10);await expect.poll(()=>f.page.evaluate(()=>window.locations.length)).toBe(2)
  expect(await f.page.evaluate(()=>window.locations[1].slideIndex)).toBe(10)
  await f.page.evaluate(()=>{document.querySelector('#surface').style.width='360px';window.nativeViewer.setZoom(80);window.handle.select('m1')})
  await f.page.locator('[data-slide-index="0"] [data-pptx-annotation-pin="m1"]').waitFor();await f.page.locator('.pptxa-bubble:visible').waitFor()
  await f.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  const geometry=await f.page.locator('[data-slide-index="0"] [data-pptx-annotation-pin="m1"]').evaluate(el=>{const slide=el.closest('[data-slide-index]').firstElementChild.firstElementChild.getBoundingClientRect(),pin=el.getBoundingClientRect();return{relativeX:(pin.left+pin.width/2-slide.left)/slide.width,relativeY:(pin.bottom-slide.top)/slide.height,width:pin.width,height:pin.height}})
  expect(geometry.relativeX).toBeCloseTo(.25,1);expect(geometry.relativeY).toBeCloseTo(.25,1);expect([geometry.width,geometry.height]).toEqual([28,28]);expect(await f.page.evaluate(()=>window.snapshot.marks.map(m=>m.ordinal))).toEqual([1,2]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},25000)
it('releases every local gesture on cancel, capture loss, blur, source-owner loss and disposal without swallowing wheel or outside controls',async()=>{
 const f=await fixture();try{
  await f.activate();const r=await contentBox(f.page)
  for(const type of ['pointercancel','lostpointercapture','blur']){
   await f.page.mouse.move(r.x+r.width*.3,r.y+r.height*.4);await f.page.mouse.down();await f.page.mouse.move(r.x+r.width*.6,r.y+r.height*.6)
   expect(await f.page.locator('[data-pptx-annotation-drawing]').count()).toBe(1);expect(await f.page.locator('[data-slide-index="0"]>[data-mounted="1"]').first().evaluate(e=>e.firstElementChild.hasPointerCapture(1))).toBe(true)
   await f.page.evaluate(type=>{const el=document.querySelector('[data-slide-index="0"]>[data-mounted="1"]').firstElementChild;if(type==='blur')window.dispatchEvent(new Event('blur'));else el.dispatchEvent(new PointerEvent(type,{pointerId:1,bubbles:true}))},type)
   await f.page.mouse.up();expect(await f.page.locator('[data-pptx-annotation-drawing]').count()).toBe(0);expect(await f.page.locator('[data-slide-index="0"]>[data-mounted="1"]').first().evaluate(e=>e.firstElementChild.hasPointerCapture(1))).toBe(false)
  }
  expect(await f.page.evaluate(()=>window.locations.length)).toBe(0)
  const fresh=await contentBox(f.page);await f.page.mouse.move(fresh.x+fresh.width*.3,fresh.y+fresh.height*.35);await f.page.mouse.down();await f.page.mouse.move(fresh.x+fresh.width*.6,fresh.y+fresh.height*.6)
  await f.page.evaluate(()=>{window.nativeViewer.viewerOptions.scrollContainer.scrollTop+=80});await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
  expect(await f.page.locator('[data-pptx-annotation-drawing]').count()).toBe(0);await f.page.mouse.up();expect(await f.page.evaluate(()=>window.locations.length)).toBe(0)
  await f.page.evaluate(()=>{window.nativeViewer.viewerOptions.scrollContainer.scrollTop=0});await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
  expect(await f.page.evaluate(()=>{const e=new WheelEvent('wheel',{deltaY:80,cancelable:true,bubbles:true});document.querySelector('[data-slide-index="0"]').dispatchEvent(e);return e.defaultPrevented})).toBe(false)
  await f.page.mouse.move(r.x+r.width*.3,r.y+r.height*.4);await f.page.mouse.down();await f.page.evaluate(()=>{window.snapshot={...window.snapshot,active:false,error:'实际会话或输入已切换，请重新开启标注。'};for(const f of window.subscribers)f()});await expect.poll(()=>f.page.locator('[data-pptx-annotation-drawing]').count()).toBe(0);await f.page.mouse.up()
  expect(await f.page.locator('[data-pptx-annotation-drawing],.pptxa-bubble,.pptxa-layer').count()).toBe(0)
  expect(await f.page.evaluate(()=>[window.subscribers.size,window.locations.length,window.editCalls,window.saveCalls])).toEqual([0,0,0,0]);await f.page.locator('#outside').click();expect(await f.page.locator('#outside').evaluate(e=>e===document.activeElement)).toBe(true);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
for(const dark of [false,true])it(`renders local original pin assets and a concise ${dark?'dark':'light'} bubble at their 28/20px slots`,async()=>{
 const f=await fixture(620,dark);try{
  await f.activate();await point(f.page);await f.page.locator('.pptxa-bubble:visible').waitFor()
  await f.page.getByRole('textbox',{name:'标注备注'}).fill('请把这一处的标题改得更简洁。')
  const slots=await f.page.locator('.pptxa-pin img,.pptxa-bubble-pin img').evaluateAll(els=>els.map(e=>({width:e.width,height:e.height,naturalWidth:e.naturalWidth,src:e.src.startsWith('data:image/svg+xml;base64,')})))
  expect(slots.sort((a,b)=>a.width-b.width)).toEqual([{width:20,height:20,naturalWidth:20,src:true},{width:28,height:28,naturalWidth:28,src:true}])
  expect(await f.page.locator('.pptxa-bubble button:visible').allTextContents()).toEqual(['','删除标记'])
  await mkdir(artifactRoot+'/ui-validation',{recursive:true});await f.page.screenshot({path:`${artifactRoot}/ui-validation/viewer-${dark?'dark':'light'}.png`})
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it('keeps persistent pin numbering through delete/undo/readd and requires explicit reanchor before drawing stale coordinates',async()=>{
 const f=await fixture();try{
  await f.activate();await point(f.page);await f.page.locator('.pptxa-bubble:visible').waitFor()
  await f.page.getByRole('textbox',{name:'标注备注'}).fill('保留这一条意见')
  await f.page.locator('[data-pptx-annotation-pin="m1"]').click({button:'right'});await f.page.getByRole('button',{name:'删除标注',exact:true}).click()
  await expect.poll(()=>f.page.locator('[data-pptx-annotation-pin]').count()).toBe(0);await f.page.getByRole('button',{name:'撤销',exact:true}).click()
  await f.page.locator('.pptxa-bubble:visible').waitFor();expect(await f.page.getByRole('textbox',{name:'标注备注'}).inputValue()).toBe('保留这一条意见');expect(await f.page.locator('.pptxa-pin-number').textContent()).toBe('1')
  await f.page.evaluate(()=>{window.snapshot={...window.snapshot,marks:window.snapshot.marks.map(m=>({...m,referenced:false})),revealSeq:window.snapshot.revealSeq+1};for(const f of window.subscribers)f()})
  await f.page.getByRole('button',{name:'重新加入输入框'}).click();await expect.poll(()=>f.page.evaluate(()=>window.snapshot.marks[0].referenced)).toBe(true)
  await f.page.evaluate(()=>{window.snapshot={...window.snapshot,marks:window.snapshot.marks.map(m=>({...m,fileVersion:'0'.repeat(64),stale:true})),revealSeq:window.snapshot.revealSeq+1};for(const f of window.subscribers)f()})
  await expect.poll(()=>f.page.locator('[data-pptx-annotation-pin]').count()).toBe(0);await f.page.getByRole('button',{name:'重新定位',exact:true}).click()
  await f.page.evaluate(()=>window.dispatchEvent(new Event('resize')));await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
  expect(await f.page.locator('.pptxa-bubble:visible').count()).toBe(0)
  const r=await contentBox(f.page);await f.page.mouse.click(r.x+r.width*.35,r.y+r.height*.35)
  await expect.poll(()=>f.page.evaluate(()=>window.snapshot.marks[0].stale)).toBe(false);expect(await f.page.locator('.pptxa-pin-number').textContent()).toBe('1');expect(await f.page.evaluate(()=>window.snapshot.marks[0].comment)).toBe('保留这一条意见');expect(await f.page.evaluate(()=>[window.editCalls,window.saveCalls])).toEqual([0,0]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it('reopens cold persisted stale marks from the count without old tags or selected pins and explicitly reanchors the same ordinal',async()=>{
 const f=await fixture(360,true);try{
  await f.page.evaluate(()=>{
   const mark=(id,ordinal,slideIndex,comment)=>({id,ordinal,revision:2,fileVersion:'0'.repeat(64),stale:true,slideIndex,slidePart:window.snapshot.scene.slides[slideIndex].part,kind:'point',region:{x:.25,y:.3},nodeIds:[],comment,referenced:false})
   window.snapshot={...window.snapshot,marks:[mark('old-seven',7,10,'旧第七条，保留整段备注'),mark('old-two',2,0,'旧第二条')],selectedId:null,revealSeq:0,stale:true}
  })
  await f.activate();expect(await f.page.locator('[data-pptx-annotation-pin],.pptxa-bubble:visible,[data-inline-reference-chip]').count()).toBe(0)
  const count=f.page.getByRole('button',{name:'标注列表',exact:true});await expect.poll(()=>count.count()).toBe(1)
  await count.click();const list=f.page.getByRole('menu',{name:'标注列表',exact:true});await list.waitFor()
  expect(await list.getByRole('menuitem').allTextContents()).toEqual(['标注2 · 第1页 · 位置 · 需重新定位','标注7 · 第11页 · 位置 · 需重新定位'])
  await list.getByRole('menuitem').nth(1).click();await f.page.locator('.pptxa-bubble:visible').waitFor()
  expect(await f.page.getByRole('textbox',{name:'标注备注'}).inputValue()).toBe('旧第七条，保留整段备注')
  expect(await f.page.getByRole('textbox',{name:'标注备注'}).isDisabled()).toBe(true)
  expect(await f.page.evaluate(()=>window.snapshot.marks.map(m=>[m.id,m.ordinal,m.stale]))).toEqual([['old-seven',7,true],['old-two',2,true]])
  expect(await f.page.locator('[data-pptx-annotation-pin]').count()).toBe(0)
  await f.page.getByRole('button',{name:'重新定位',exact:true}).click();const r=await contentBox(f.page)
  await f.page.mouse.click(r.x+r.width*.45,r.y+r.height*.45)
  await expect.poll(()=>f.page.evaluate(()=>window.snapshot.marks.find(m=>m.id==='old-seven').stale)).toBe(false)
  expect(await f.page.locator('[data-pptx-annotation-pin="old-seven"] .pptxa-pin-number').textContent()).toBe('7')
  expect(await f.page.evaluate(()=>window.snapshot.marks.find(m=>m.id==='old-seven').comment)).toBe('旧第七条，保留整段备注')
  expect(await f.page.evaluate(()=>window.snapshot.marks.find(m=>m.id==='old-two').stale)).toBe(true)
  expect(await f.page.evaluate(()=>[window.editCalls,window.saveCalls])).toEqual([0,0]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it.each([false,true])('keeps the cold mark list keyboard accessible, bounded and disposable in dark mode %s',async dark=>{
 const f=await fixture(dark?360:620,dark);try{
  await f.page.evaluate(()=>{window.snapshot={...window.snapshot,marks:[2,7].map(ordinal=>({id:'old-'+ordinal,ordinal,revision:1,fileVersion:'0'.repeat(64),stale:true,slideIndex:0,slidePart:window.snapshot.scene.slides[0].part,kind:'point',region:{x:.2,y:.3},nodeIds:[],comment:'持久备注'+ordinal,referenced:false})),selectedId:null,revealSeq:0,stale:true}})
  await f.activate();const count=f.page.getByRole('button',{name:'标注列表',exact:true});await count.focus();await f.page.keyboard.press('ArrowDown')
  const list=f.page.getByRole('menu',{name:'标注列表',exact:true});await list.waitFor();expect(await list.getByRole('menuitem').nth(0).evaluate(el=>el===document.activeElement)).toBe(true)
  await f.page.keyboard.press('ArrowDown');expect(await list.getByRole('menuitem').nth(1).evaluate(el=>el===document.activeElement)).toBe(true)
  await f.page.evaluate(()=>{window.snapshot={...window.snapshot,revision:window.snapshot.revision+1,marks:window.snapshot.marks.map(m=>({...m,comment:m.comment+'保持焦点'}))};for(const f of window.subscribers)f()})
  await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));expect(await list.getByRole('menuitem').nth(1).evaluate(el=>el===document.activeElement)).toBe(true)
  const geometry=await list.evaluate(el=>{const r=el.getBoundingClientRect(),host=document.querySelector('#surface').getBoundingClientRect();return{left:r.left,right:r.right,bottom:r.bottom,hostLeft:host.left,hostRight:host.right,windowBottom:innerHeight}})
  expect(geometry.left).toBeGreaterThanOrEqual(geometry.hostLeft);expect(geometry.right).toBeLessThanOrEqual(geometry.hostRight);expect(geometry.bottom).toBeLessThanOrEqual(geometry.windowBottom-8)
  const directory=artifactRoot+'/cold-stale-validation';await mkdir(directory,{recursive:true});await f.page.screenshot({path:directory+'/mark-list-'+(dark?'dark':'light')+'.png'})
  await f.page.keyboard.press('Escape');expect(await list.count()).toBe(0);expect(await count.evaluate(el=>el===document.activeElement)).toBe(true)
  await count.click();await list.waitFor();await f.page.keyboard.press('End');await f.page.keyboard.press('Enter');await f.page.locator('.pptxa-bubble:visible').waitFor();expect(await f.page.evaluate(()=>window.snapshot.selectedId)).toBe('old-7')
  await count.click();await list.waitFor();await f.page.getByRole('button',{name:'中央其他控件',exact:true}).click();expect(await list.count()).toBe(0)
  await count.click();await list.waitFor();await f.page.evaluate(()=>window.controls.setAnnotations(false));expect(await f.page.locator('.pptxa-mark-list,.pptxa-bubble,[data-pptx-annotation-toolbar]').count()).toBe(0);expect(await f.page.evaluate(()=>window.subscribers.size)).toBe(0)
  expect(await f.page.evaluate(()=>[window.editCalls,window.saveCalls,window.openCalls])).toEqual([0,0,1]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it('closes a comment on a blank slide click and commits one complete IME remark without stealing the central focus',async()=>{
 const f=await fixture();try{
  await f.activate();await point(f.page);await f.page.locator('.pptxa-bubble:visible').waitFor()
  const r=await contentBox(f.page);await f.page.mouse.click(r.x+r.width*.45,r.y+r.height*.1)
  await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
  expect(await f.page.locator('.pptxa-bubble:visible').count()).toBe(0);expect(await f.page.evaluate(()=>window.snapshot.marks.length)).toBe(1)
  await f.page.evaluate(()=>window.handle.select('m1'));await f.page.locator('.pptxa-bubble:visible').waitFor()
  await f.page.evaluate(()=>{window.commentWrites=[];const original=window.handle.updateComment;window.handle.updateComment=(id,text)=>{window.commentWrites.push(text);return original(id,text)}})
  const input=f.page.getByRole('textbox',{name:'标注备注'});await input.focus()
  await input.evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='正在组合';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}))})
  expect(await f.page.evaluate(()=>window.commentWrites)).toEqual([])
  await input.evaluate(el=>{el.value='确定的意见';el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'确定的意见'}));el.dispatchEvent(new InputEvent('input',{bubbles:true,data:'确定的意见'}))})
  expect(await f.page.evaluate(()=>window.commentWrites)).toEqual(['确定的意见']);expect(await input.inputValue()).toBe('确定的意见');expect(await input.evaluate(el=>el===document.activeElement)).toBe(true);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('binds pins to the exact native preview bytes and refuses a concurrent Main version even after one real reader refresh',async()=>{
 const f=await fixture();try{
  await f.page.evaluate(()=>{window.snapshot={...window.snapshot,basis:{...window.snapshot.basis,fileVersion:'f'.repeat(64)}}})
  expect(await f.page.evaluate(()=>window.controls.setAnnotations(true))).toBe(false)
  expect(await f.page.locator('[data-pptx-annotation-toolbar],.pptxa-layer').count()).toBe(0);expect(await f.page.evaluate(()=>[window.editCalls,window.saveCalls,window.digestCalls,window.pptFetches])).toEqual([0,0,2,2])
  await f.page.evaluate(version=>{window.snapshot={...window.snapshot,basis:{...window.snapshot.basis,fileVersion:version}}},fileVersion);await f.activate();await point(f.page);await f.page.locator('.pptxa-bubble:visible').waitFor()
  await f.page.evaluate(()=>{window.snapshot={...window.snapshot,basis:{...window.snapshot.basis,fileVersion:'e'.repeat(64)}};for(const f of window.subscribers)f()})
  await expect.poll(()=>f.page.locator('[data-pptx-annotation-toolbar],.pptxa-layer').count()).toBe(0);expect(await f.page.evaluate(()=>window.snapshot.marks.length)).toBe(1);expect(await f.page.evaluate(()=>window.digestCalls)).toBe(2);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('does not turn a held point gesture into a different-position mark with its original object metadata',async()=>{
 const f=await fixture();try{
  await f.activate();await f.page.getByRole('button',{name:'点选',exact:true}).click();const r=await contentBox(f.page)
  await f.page.mouse.move(r.x+r.width*.3,r.y+r.height*.3);await f.page.mouse.down();await f.page.mouse.move(r.x+r.width*.7,r.y+r.height*.5,{steps:3});await f.page.mouse.up()
  expect(await f.page.evaluate(()=>window.locations.length)).toBe(0);expect(await f.page.locator('[data-pptx-annotation-drawing]').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
