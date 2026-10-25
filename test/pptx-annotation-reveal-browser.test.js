import{readFile,mkdir}from'node:fs/promises'
import{createHash}from'node:crypto'
import{createRequire}from'node:module'
import{pathToFileURL}from'node:url'
import{build}from'esbuild'
import{afterAll,beforeAll,expect,it}from'vitest'
import{readPptxScene}from'../src/main/pptx/scene'
import{annotationMessageFixture}from'./fixtures/pptx-annotation-message.js'
const require=createRequire(import.meta.url)
let browser,client,runtime,office,boot,bytes,model,version
beforeAll(async()=>{
 const {patchPptxAnnotationMessages}=require('../scripts/lib/pptx-annotation-message.mjs'),{patchPptxEditor}=require('../scripts/lib/pptx-editor-ui.mjs'),{patchSherlockOfficePreviewClient}=require('../scripts/lib/patch-sherlock-office-preview.mjs'),{patchPptxResize,stripPptxResizePatch}=require('../scripts/lib/pptx-resize-settle.mjs')
 client=patchPptxAnnotationMessages(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.__Sent=UserStyleBubble;')
 runtime=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 office=patchPptxEditor(patchPptxResize(patchSherlockOfficePreviewClient(stripPptxResizePatch(await readFile('build/sherlock-plugin-profile/vendor/@huanlin/dsh-plugin-better-sidebar-plugin-office/lib/client.js','utf8'))))).replace('mountListSlide(n, e, o, s, i) {','mountListSlide(n, e, o, s, i) {window.actualAnnotationViewer=this;')
 bytes=await readFile('skills/efund-ppt-maker/assets/efund-ai-platform-v21.pptx');model=readPptxScene(bytes);version=createHash('sha256').update(bytes).digest('hex')
 boot=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import * as React from'react';import * as jsx from'react/jsx-runtime';import * as dom from'react-dom';import{createRoot}from'react-dom/client';
 import{createPptxAnnotationCoordinator}from'./scripts/lib/pptx-annotation-coordinator.mjs';import{parsePptxAnnotationLocator}from'./scripts/lib/pptx-annotation-input.mjs';import{createPptxAnnotationRevealController,openPptxAnnotationPreview}from'./scripts/lib/pptx-annotation-reveal.mjs';import{sidebarPptxAnnotationProps}from'./scripts/lib/sidebar-pptx-toolbar.mjs';
 const payload=window.payload,empty=()=>null,fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 const primitives=new Proxy({Tooltip:({children})=>children,writeClipboard:async()=>true},{get:(t,k)=>t[k]??empty});
 const modules=id=>({'react':React,'react/jsx-runtime':jsx,'react-dom':dom,'@deepseek-ai/cordis':{Service:class{}},'@deepseek-ai/dsh-client-ui-primitives':primitives,'@deepseek-ai/dsh-client-ui-attachment':{ImageGallery:empty}}[id]??fake);
 const rt=window.runtimeDescriptor.factory(modules),native=window.nativeDescriptor.factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id)),office=window.officeDescriptor.factory(modules),Viewer=office.officeViewers().find(value=>value.id==='pptx').component;
 const shell=new native.SessionInputShell({actx:{},defaultSink(){window.probe.sends++}});shell.setDraft('保留当前整体要求 📈 和未发送草稿');
 const identity={sessionId:payload.sessionId,shell,ordinary:true},source={sessionId:payload.sessionId,source:payload.managed?{kind:'note-file',nodeId:'managed-node',authorizationId:'managed-auth'}:{kind:'workspace',relativePath:'review.pptx'}},path=payload.managed?'/managed/review.pptx':'/work/review.pptx';
 window.probe={resolveCalls:[],opens:[],editCalls:0,saves:0,sends:0,fetches:0,activeSession:payload.sessionId,shell,before:JSON.stringify(shell.snapshot),status:'ready'};
 const marks=payload.proof.spans.map((span,i)=>({id:span.reference.markId,ordinal:span.ordinal,revision:1,fileVersion:payload.version,stale:false,slideIndex:i===0?0:2,slidePart:payload.model.slides[i===0?0:2].part,kind:i===0?'point':'rect',region:i===0?{x:.3,y:.4}:{x:.15,y:.15,width:.35,height:.2},nodeIds:[],comment:span.comment}));
 const ready=reference=>({status:'ready',reference,source,path,name:'原始演示文稿.pptx',fileVersion:payload.version,...(payload.managed?{sourceUrl:'sherlock-preview://grant_'+window.probe.resolveCalls.length+'/'}:{}),mark:{id:reference.markId,ordinal:marks.find(m=>m.id===reference.markId).ordinal,slideIndex:marks.find(m=>m.id===reference.markId).slideIndex,slidePart:marks.find(m=>m.id===reference.markId).slidePart}});
 const bridge={messagePresentation:async()=>({ok:true,value:payload.proof}),resolveReference:async input=>{window.probe.resolveCalls.push(input);return{ok:true,value:window.probe.status==='ready'?ready(input.reference):{status:window.probe.status,error:'原标记需要重新定位。'}}},open:async()=>({ok:true,value:{documentId:payload.proof.spans[0].reference.documentId,version:payload.version,name:'原始演示文稿.pptx',slideSize:payload.model.slideSize,slides:payload.model.slides,state:{revision:1,nextOrdinal:3,marks}}})};window.sherlockPptAnnotations=bridge;
 window.sherlockPptEditor={open:async()=>{window.probe.editCalls++;if(!payload.managed)throw Error('不得自动进入编辑');return{ok:true,document:{...payload.model,id:'editable',version:payload.version,editToken:'authorized-existing-editor'}}},save:async()=>{window.probe.saves++;return{ok:false,error:'保留用户未保存的编辑'}}};
 const resolveInput=async()=>identity,isCurrent=()=>window.probe.activeSession===identity.sessionId;
 const coordinator=createPptxAnnotationCoordinator({bridge,resolveInput,isCurrent}),snapshot={sessionId:identity.sessionId,state:{splits:{kind:'leaf',tabs:payload.persistedGrant?[{type:'editor',id:'editor:'+path,path,title:'旧会话恢复的原文件',meta:{sherlockPanel:'right',sherlockPptAnnotationPreview:{source,sourceUrl:'sherlock-preview://expired/'}}}]:[]}}};let changePreview;
 const service={getSnapshot:()=>snapshot,openTab(seed){window.probe.opens.push(structuredClone(seed));let tab=snapshot.state.splits.tabs.find(t=>t.path===seed.path);if(!tab){tab=structuredClone(seed);snapshot.state.splits.tabs.push(tab)}changePreview({...tab})},updateTab(id,patch){const tab=snapshot.state.splits.tabs.find(t=>t.id===id);Object.assign(tab,patch);changePreview({...tab})},setPanelState(){}};
 const reveal=createPptxAnnotationRevealController({bridge,resolveInput,isCurrent,parseReference:parsePptxAnnotationLocator,openPreview:(identity,value,options)=>openPptxAnnotationPreview({service},identity,value,options)});
 window[Symbol.for('sherlock:pptx-annotation-input')]={...coordinator,...reveal};window.probe.close=()=>{changePreview(null);snapshot.state.splits.tabs=[]};
 const fetch=window.fetch;window.fetch=(url,opts)=>{if(String(url).includes('/sidebar/file?'))window.probe.fetches++;if(String(url).startsWith('sherlock-preview:')){window.probe.fetches++;if(String(url)==='sherlock-preview://expired/')return Promise.resolve(new Response('',{status:403}));return fetch('/sidebar/file?fixture=managed',opts)}return fetch(url,opts)};
 function App(){const [tab,setTab]=React.useState(null);changePreview=setTab;const scope={sessionId:payload.sessionId,cwd:'/work'},props=tab?sidebarPptxAnnotationProps(tab,scope):null;
 return <><section id="messages"><native.__Sent content={[{type:'text',text:payload.text}]} annotationIdentity={{sessionId:payload.sessionId,source:{kind:'user',rpcId:payload.rpcId}}} eventSeq={9} imageLoader={async()=>null} actions={()=>null} openFile={()=>{throw Error('不能从原文猜路径')}} t={key=>key}/></section><aside id="odyssey-right-workspace-panel">{tab&&<Viewer scope={scope} path={props?.path??tab.path} annotationSource={props?.annotationSource} title={tab.title} annotationCanonicalPath={props?.annotationCanonicalPath} toolbar="host" onToolbarState={state=>window.probe.toolbar=state} onToolbarControls={controls=>window.probe.controls=controls}/>}</aside></>}
 const root=createRoot(document.querySelector('#root'));dom.flushSync(()=>root.render(<App/>));window.probe.dispose=()=>{root.unmount();reveal.dispose();coordinator.dispose();shell.dispose()};
 `},bundle:true,write:false,platform:'browser',format:'iife'})).outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(()=>browser?.close())
async function fixture(options={}){
 const payload={...annotationMessageFixture(),version,model,...options};payload.proof.spans.forEach(span=>span.reference.fileVersion=version)
 const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.route('https://sent-reveal.test/**',route=>route.fulfill(new URL(route.request().url()).pathname==='/sidebar/file'?{body:bytes}:{contentType:'text/html',body:'<style>body{font-family:system-ui;margin:0}#messages{width:470px;padding:16px}#odyssey-right-workspace-panel{position:absolute;right:0;top:0;width:740px;height:840px;display:flex;flex-direction:column;overflow:hidden}.pptxa-sent-reference{display:inline-flex;gap:5px;align-items:center}.pptxa-reference-pin{position:relative;display:inline-flex}.pptxa-reference-number{position:absolute;inset:0;text-align:center;font-size:10px}</style><main id="root"></main>'}))
 await page.goto('https://sent-reveal.test/')
 await page.evaluate(payload=>{window.payload=payload;window.__ModuleLoader__={load:d=>window.descriptor=d}},payload)
 for(const [script,name]of[[runtime,'runtimeDescriptor'],[client,'nativeDescriptor'],[office,'officeDescriptor']]){await page.addScriptTag({content:script});await page.evaluate(name=>window[name]=window.descriptor,name)}
 await page.addScriptTag({content:boot});await page.locator('[data-pptx-sent-reference]').first().waitFor()
 return{page,errors,close:async()=>{await page.evaluate(()=>window.probe.dispose());await page.close()}}
}
it('cold and reopened native sent tags open the authorized original, activate preview annotations, jump real windowed pages and reveal the comment',async()=>{
 const f=await fixture();try{
  expect(await f.page.evaluate(()=>({opens:window.probe.opens.length,fetches:window.probe.fetches,edit:window.probe.editCalls}))).toEqual({opens:0,fetches:0,edit:0})
  const second=f.page.locator('[data-pptx-sent-reference="mark-2"]');await second.click()
  await f.page.locator('.pptxa-bubble:not([hidden])').waitFor({timeout:12000})
  expect(await f.page.locator('.pptxa-comment').inputValue()).toBe(annotationMessageFixture().comments[1])
  await expect.poll(()=>f.page.evaluate(()=>window.actualAnnotationViewer?.currentSlideIndex)).toBe(2)
  expect(await f.page.locator('[data-slide-index="2"]>[data-mounted="1"]').count()).toBeGreaterThan(0)
  expect(await f.page.evaluate(()=>({saves:window.probe.saves,edit:window.probe.editCalls,sends:window.probe.sends,same:JSON.stringify(window.probe.shell.snapshot)===window.probe.before}))).toEqual({saves:0,edit:0,sends:0,same:true})
  await f.page.locator('[data-pptx-sent-reference="mark-1"]').click();await expect.poll(()=>f.page.evaluate(()=>window.actualAnnotationViewer.currentSlideIndex)).toBe(0)
  await f.page.evaluate(()=>window.probe.close());await expect.poll(()=>f.page.locator('[data-ppt-editor]').count()).toBe(0)
  await second.click();await f.page.locator('.pptxa-bubble:not([hidden])').waitFor({timeout:12000});await expect.poll(()=>f.page.evaluate(()=>window.actualAnnotationViewer.currentSlideIndex)).toBe(2)
  expect(await f.page.evaluate(()=>window.probe.opens.every(value=>value.path==='/work/review.pptx'&&!value.path.includes('.ework/')))).toBe(true)
  expect(await f.page.getByRole('alert').count()).toBe(0);expect(f.errors).toEqual([])
  await mkdir('/tmp/pptx-sent-reveal-native-browser-20261026',{recursive:true});await f.page.screenshot({path:'/tmp/pptx-sent-reveal-native-browser-20261026/cold-third-page-comment.png'})
 }finally{await f.close()}
},30000)
it('shows a stale original-reference explanation without opening an output copy or changing the actual draft',async()=>{
 const f=await fixture();try{await f.page.evaluate(()=>window.probe.status='stale');await f.page.locator('[data-pptx-sent-reference="mark-2"]').click();await expect.poll(()=>f.page.getByRole('alert').innerText()).toBe('原标记需要重新定位。');expect(await f.page.evaluate(()=>window.probe.opens)).toEqual([]);expect(await f.page.evaluate(()=>JSON.stringify(window.probe.shell.snapshot)===window.probe.before)).toBe(true);expect(f.errors).toEqual([])}finally{await f.close()}
},15000)

it('preserves the mounted managed reader and unsaved native edit when Main renews the same source capability',async()=>{
 const f=await fixture({managed:true});try{
  await f.page.locator('[data-pptx-sent-reference="mark-1"]').click();await f.page.locator('.pptxa-bubble:not([hidden])').waitFor({timeout:12000})
  expect(await f.page.evaluate(()=>window.probe.controls.setMode('edit'))).toBe(true)
  const field=f.page.locator('[data-pptx-paragraph][contenteditable="true"]').first();await field.fill('保留这段尚未保存的实际PPT编辑',{timeout:4000})
  await expect.poll(()=>f.page.evaluate(()=>window.probe.toolbar.dirty)).toBe(true)
  await f.page.locator('[data-pptx-sent-reference="mark-2"]').click()
  await f.page.waitForFunction(()=>window.probe.resolveCalls.length>=3&&!document.querySelector('[data-pptx-sent-reference="mark-2"]')?.getAttribute('aria-busy'),null,{timeout:7000})
  expect(await f.page.evaluate(()=>({mode:window.probe.toolbar.mode,dirty:window.probe.toolbar.dirty,reader:window.probe.opens.at(-1).meta.sherlockPptAnnotationPreview.sourceUrl}))).toEqual({mode:'edit',dirty:true,reader:'sherlock-preview://grant_1/'})
  expect(await f.page.locator('[data-pptx-sent-reveal-error]').allTextContents()).toEqual([expect.stringMatching(/保存|开启标注/)])
  expect(await f.page.locator('[data-ppt-editor] [role=alert]').allTextContents()).toEqual([expect.stringContaining('保留用户未保存的编辑')])
  expect(await field.innerText()).toBe('保留这段尚未保存的实际PPT编辑');expect(await f.page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe('保留当前整体要求 📈 和未发送草稿');expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)

it('replaces an expired persisted managed capability only when no loaded editor instance remains',async()=>{
 const f=await fixture({managed:true,persistedGrant:true});try{
  await f.page.locator('[data-pptx-sent-reference="mark-2"]').click()
  await expect.poll(()=>f.page.evaluate(()=>window.probe.opens.length)).toBe(1)
  expect(await f.page.evaluate(()=>window.probe.opens[0].meta.sherlockPptAnnotationPreview.sourceUrl)).toBe('sherlock-preview://grant_1/')
  await f.page.locator('.pptxa-bubble:not([hidden])').waitFor({timeout:10000});await expect.poll(()=>f.page.evaluate(()=>window.actualAnnotationViewer?.currentSlideIndex)).toBe(2)
  expect(await f.page.evaluate(()=>({edit:window.probe.editCalls,saves:window.probe.saves,sends:window.probe.sends,same:JSON.stringify(window.probe.shell.snapshot)===window.probe.before}))).toEqual({edit:0,saves:0,sends:0,same:true});expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
