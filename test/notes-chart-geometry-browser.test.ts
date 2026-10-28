import {afterAll,beforeAll,expect,it} from 'vitest'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build,type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {notesResidentProductionSource} from './helpers/notes-resident-production-source.mjs'

let browser:any,script=''
const entry='\0notes-chart-geometry-fixture',evidence=process.env.SHERLOCK_NOTES_CHART_GEOMETRY_EVIDENCE
const captured=JSON.parse(readFileSync(resolve('test/fixtures/notes-real-third-offline-line-html.json'),'utf8')).at(-1)

beforeAll(async()=>{
 const accepted=acceptArtifactOutput(JSON.stringify(captured))
 if(!accepted)throw Error('The captured chart must pass the actual artifact acceptance path')
 const spec=JSON.parse(accepted),patched=notesResidentProductionSource()
 const native=patched.replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__NoteViews=EWorkNoteComponentViews;')
 const config=(await resolveConfig({configFile:resolve('electron.vite.config.ts'),logLevel:'silent'},'build','production')).config!.preload!
 const fixture:Plugin={name:'notes-chart-geometry-fixture',resolveId:id=>id===entry?entry:undefined,load:id=>id===entry?`
 import React from 'react';import * as JSX from 'react/jsx-runtime';import * as DOM from 'react-dom';import {createRoot} from 'react-dom/client';
 import {NotesApp} from ${JSON.stringify(resolve('src/preload/notes/editor.tsx'))};
 import blockStyles from '@blocknote/mantine/style.css?inline';import noteStyles from ${JSON.stringify(resolve('src/preload/notes/style.css')+'?inline')};import challengeStyles from ${JSON.stringify(resolve('src/preload/notes/challenge.css')+'?inline')};
 const style=document.createElement('style');style.textContent=[blockStyles,noteStyles,challengeStyles].join(String.fromCharCode(10));document.head.append(style);
 const factories=new Map();window.__ModuleLoader__={load:d=>factories.set(d.id,d.factory)};new Function(${JSON.stringify(native)})();class Service{};const noop=()=>null,primitives=new Proxy({},{get:()=>noop});
 const library=factories.get('@deepseek-ai/dsh-client-ui-conversation')(id=>id==='react'?React:id==='react/jsx-runtime'?JSX:id==='react-dom'?DOM:id==='@deepseek-ai/cordis'?{Service}:primitives);
 const spec=window.fixtureLegacy?${JSON.stringify(captured)}:${JSON.stringify(spec)};
 window.fixtureSource=spec.html;window.noteSaved={title:'图表几何合成验收',blocks:[{id:'upper',type:'paragraph',content:'上文保留'},{id:'chart',type:'research',props:{payload:JSON.stringify({id:'note-chart',title:spec.title,kind:'generated-container',noteLibrary:true,containerSpec:spec,noteSize:{width:656,height:550}})}},{id:'tail',type:'paragraph',content:'下文保留'}],yjs:'',revision:0,updatedAt:0};
 window.noteRequests=[];window.noteAcks=[];window.noteActions=[];
 document.addEventListener('sherlock:notes-component-ack',e=>window.noteAcks.push(e.detail));document.addEventListener('sherlock:notes-component-action',e=>window.noteActions.push(e.detail));
 const bridge={request:async(method,input)=>{window.noteRequests.push({method,input});if(method==='load')return {saved:window.noteSaved};if(method==='save'){window.noteSaved={...input.content,revision:input.revision+1};return {status:'saved',saved:window.noteSaved}}return {ok:true}},draft:async()=>{}};
 let flush=async()=>{};const saveBinding={ready:value=>{flush=value},dispose:value=>{if(flush===value)flush=async()=>{}}};window.flushNote=()=>flush();
 window.createNoteRoot=()=>{const root=createRoot(document.querySelector('#notes'));root.render(React.createElement(NotesApp,{sessionId:'chart-geometry',bridge,dark:window.fixtureDark,active:true,saveBinding,navigate:()=>{}}));return root};window.notesRoot=window.createNoteRoot();
 createRoot(document.querySelector('#views')).render(React.createElement(library.__NoteViews,{sessionId:'chart-geometry',active:true}));
 `:undefined,transform(code,id){if(id.endsWith('/preload/notes/editor.tsx'))return code.replace('  const slashMenu = useMemo','  window.noteEditor=editor; const slashMenu = useMemo')}}
 const output=await build({...config,configFile:false,plugins:[...(config.plugins||[]),fixture],build:{...config.build,write:false,rollupOptions:{...config.build?.rollupOptions,input:entry}}})
 script=(Array.isArray(output)?output:[output]).flatMap(value=>'output'in value?value.output:[]).filter(chunk=>chunk.type==='chunk').map(chunk=>chunk.code).join('\n')
 // Browser plugin is not available; use the repository's production Playwright fixture.
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 if(evidence)mkdirSync(evidence,{recursive:true})
},90000)
afterAll(async()=>browser?.close())

async function fixture(width=1100,dark=false,legacy=false){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors:string[]=[]
 page.setDefaultTimeout(4000);page.on('pageerror',(error:Error)=>errors.push(error.message));page.on('console',(message:any)=>{if(message.type()==='error')errors.push(message.text())})
 await page.route('http://127.0.0.1/notes-chart-geometry',(route:any)=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-odyssey-locale="zh"><head><title>Notes chart geometry fixture</title></head><body><section class="en-root" data-dark="${dark}" style="position:fixed;inset:0"><div id="notes" class="en-editor-host"></div></section><div id="views"></div></body></html>`}))
 await page.route('**/fonts/NotoSansSC.woff2',(route:any)=>route.fulfill({contentType:'font/woff2',path:resolve('build/fonts/NotoSansSC.woff2')}))
 await page.goto('http://127.0.0.1/notes-chart-geometry')
 await page.evaluate(({dark,legacy}:any)=>{const w=window as any;w.fixtureDark=dark;w.fixtureLegacy=legacy;if(dark)document.body.dataset.dsDarkTheme='true'},{dark,legacy})
 await page.addScriptTag({content:'var exports={};\n'+script})
 const frame=page.frameLocator('iframe[data-research-html-artifact]').frameLocator('iframe#preview')
 try{
  await page.locator('.en-title').waitFor()
  // Persist a real Yjs snapshot before exercising the production HTML view.
  await page.evaluate(()=>{const w=window as any;w.noteEditor.replaceBlocks(w.noteEditor.document,w.noteSaved.blocks)})
  await page.evaluate(()=>(window as any).flushNote())
  await frame.getByText('查看全部数据',{exact:true}).waitFor()
  await expect.poll(()=>page.locator('iframe[data-research-html-artifact]').getAttribute('data-research-font-status')).toBe('loaded')
  expect(page.url()).toBe('http://127.0.0.1/notes-chart-geometry');expect(await page.title()).toBe('Notes chart geometry fixture')
  expect(await page.locator('vite-error-overlay').count()).toBe(0)
  return {context,page,frame,errors}
 }catch(error){const diagnostic={errors,cause:String(error),body:await page.locator('body').textContent()};await context.close();throw Error(JSON.stringify(diagnostic))}
}

async function geometry(frame:any){return frame.locator('svg').evaluate((svg:SVGSVGElement)=>{
 const ticks=Array.from(svg.children).filter(el=>el.tagName==='text'&&el.getAttribute('text-anchor')==='end').map(el=>({value:Number(el.textContent),y:Number(el.getAttribute('y'))-4}))
 const points=Array.from(svg.querySelectorAll('[data-series-group="0"] circle')).map(el=>({x:Number(el.getAttribute('cx')),y:Number(el.getAttribute('cy')),title:el.textContent}))
 const rect=svg.getBoundingClientRect(),body=svg.ownerDocument.body
 return {ticks,points,polyline:svg.querySelector('polyline')!.getAttribute('points'),width:rect.width,height:rect.height,bodyWidth:body.clientWidth,theme:svg.ownerDocument.documentElement.dataset.sherlockTheme,caption:svg.parentElement!.querySelector('figcaption')!.textContent}
})}
async function savedNode(page:any){return page.evaluate(()=>JSON.parse((window as any).noteSaved.blocks.find((block:any)=>block.id==='chart').props.payload))}
async function reopen(page:any){
 await page.evaluate(()=>(window as any).flushNote())
 await page.evaluate(()=>{const w=window as any;w.notesRoot.unmount();w.notesRoot=w.createNoteRoot()})
 await page.locator('.en-title').waitFor()
}
async function assertGeometry(frame:any,dark:boolean){
 const result=await geometry(frame)
 expect(result.ticks.map((tick:any)=>tick.value)).toEqual([9.5,12.25,15,17.75,20.5])
 expect(result.points.map((point:any)=>point.x)).toEqual([145,325,505])
 expect(result.points.map((point:any)=>point.y)).toEqual([250,50,150])
 expect(result.polyline).toBe('145,250 325,50 505,150')
 const low=result.ticks[0],high=result.ticks.at(-1)
 for(const [index,point]of result.points.entries()){
  const plotted=low.value+(low.y-point.y)/(low.y-high.y)*(high.value-low.value)
  expect(plotted).toBeCloseTo([10,20,15][index]!,9)
 }
 expect(result.width).toBeGreaterThan(200);expect(result.width).toBeLessThanOrEqual(result.bodyWidth+1)
 expect(result.height/result.width).toBeCloseTo(305/660,3)
 expect(result.theme).toBe(dark?'dark':'light')
 expect(result.caption).toContain('仅演示数据，无真实数据来源，未查询、不引入任何行情或外部数据')
 return result
}

it.each([{width:1100,dark:false},{width:480,dark:true}])('reprojects the captured chart from declared values and preserves Notes interactions at $width px dark=$dark',async({width,dark})=>{
 const f=await fixture(width,dark);try{
  if(evidence){await f.page.screenshot({path:resolve(evidence,`geometry-initial-${width}-${dark?'dark':'light'}.png`)});writeFileSync(resolve(evidence,`geometry-initial-${width}.json`),JSON.stringify(await geometry(f.frame),null,2))}
  const result=await assertGeometry(f.frame,dark)
  await f.page.getByRole('button',{name:'选中组件并操作内容',exact:true}).click()
  const svg=f.frame.locator('svg'),readout=f.frame.locator('.chart-readout')
  await svg.press('End');await expect.poll(()=>readout.textContent()).toContain('10月3日 · 演示数据 15（演示数据）')
  expect(await f.frame.locator('.chart-cursor').getAttribute('x1')).toBe('505')
  await svg.press('ArrowLeft');await expect.poll(()=>readout.textContent()).toContain('10月2日 · 演示数据 20（演示数据）')
  expect(await f.frame.locator('.chart-cursor').getAttribute('x1')).toBe('325')
  await svg.press('Home');await expect.poll(()=>readout.textContent()).toContain('10月1日 · 演示数据 10（演示数据）')
  await svg.hover({position:{x:result.width*505/660,y:result.height*150/305}})
  await expect.poll(()=>readout.textContent()).toContain('10月3日 · 演示数据 15（演示数据）')
  expect(await f.frame.locator('.chart-cursor').getAttribute('x1')).toBe('505')
  const legend=f.frame.locator('[data-chart-series="0"]');await legend.click()
  expect(await legend.getAttribute('aria-pressed')).toBe('true');expect(await f.frame.locator('[data-series-group="0"]').evaluate((element:SVGGElement)=>element.style.display)).not.toBe('none')
  if(evidence){await f.page.screenshot({path:resolve(evidence,`geometry-${width}-${dark?'dark':'light'}.png`)});writeFileSync(resolve(evidence,`geometry-${width}.json`),JSON.stringify(result,null,2))}
  await f.frame.getByText('查看全部数据',{exact:true}).click()
  expect(await f.frame.locator('tbody td').allTextContents()).toEqual(['10月1日','10','10月2日','20','10月3日','15'])
  const note=f.frame.locator('#note-input');await expect.poll(()=>note.isEditable()).toBe(true)
  expect(await f.frame.locator('.note-status').textContent()).toBe('备注随组件保存')
  const memo='真实备注保存 · '+width;await note.fill(memo)
  await expect.poll(async()=>(await savedNode(f.page)).config?.sharedComponentState?.state?.note).toBe(memo)
  await expect.poll(()=>f.page.evaluate(()=>(window as any).noteAcks.some((ack:any)=>ack.requestId?.includes(':shared-state:')&&ack.ok===true))).toBe(true)
  const saved=await savedNode(f.page);expect(saved.containerSpec.html).toBe(await f.page.evaluate(()=>(window as any).fixtureSource))
  expect(saved.containerSpec.html.match(/<script>[\s\S]*?<\/script>/)?.[0]).toBe(captured.html.match(/<script>[\s\S]*?<\/script>/)?.[0])
  await reopen(f.page)
  await expect.poll(()=>f.frame.locator('#note-input').inputValue()).toBe(memo)
  expect(await f.frame.locator('.note-status').textContent()).toBe('备注随组件保存')
  await expect.poll(()=>f.frame.locator('details').evaluate((element:HTMLDetailsElement)=>element.open)).toBe(true)
  await assertGeometry(f.frame,dark)
  expect(await f.frame.locator('tbody td').allTextContents()).toEqual(['10月1日','10','10月2日','20','10月3日','15'])
  expect(await f.page.locator('.bn-editor').textContent()).toContain('上文保留');expect(await f.page.locator('.bn-editor').textContent()).toContain('下文保留')
  expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},30000)

it('renders and reopens an already saved raw chart without silently migrating its HTML or geometry',async()=>{
 const f=await fixture(1100,false,true);try{
  const initial=await geometry(f.frame)
  // Only acceptance of a new artifact repairs geometry. Rendering an old card
  // must not rewrite its persisted source, business DOM or interaction state.
  expect(initial.ticks.map((tick:any)=>tick.value)).toEqual([11.3,13.1,15,16.9,18.8])
  expect(initial.points.map((point:any)=>point.y)).toEqual([213.1578947368421,39.99999999999998,150])
  expect((await savedNode(f.page)).containerSpec.html).toBe(captured.html)
  await reopen(f.page)
  await expect.poll(async()=>(await geometry(f.frame)).polyline).toBe(initial.polyline)
  expect((await geometry(f.frame)).ticks).toEqual(initial.ticks)
  expect((await savedNode(f.page)).containerSpec.html).toBe(captured.html)
  expect(await f.frame.locator('#note-input').count()).toBe(1);expect(await f.frame.getByText('查看全部数据',{exact:true}).count()).toBe(1)
  expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
