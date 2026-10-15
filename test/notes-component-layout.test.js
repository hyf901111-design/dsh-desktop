import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {renderMarketArtifact} from '../packages/dsh-research-task-runtime/market-artifact.js'
import {patchNotesActivity} from '../scripts/lib/notes-activity.mjs'

let browser,script,css,researchCss,font
const artifact=renderMarketArtifact({version:1,type:'market',variant:'heatmap',title:'布局验收',asOf:'模拟数据',items:[{label:'BTC',weight:57.4,change:1.9},{label:'ETH',weight:13.1,change:2.6},{label:'L1',weight:9.6,change:-.8},{label:'Stable',weight:6.8,change:0},{label:'Meme',weight:3.1,change:-2.4},{label:'DeFi',weight:2.9,change:3.2},{label:'L2',weight:2.5,change:-1.7},{label:'AI',weight:2.2,change:5.1},{label:'Storage',weight:1.3,change:1.4},{label:'NFT',weight:1.1,change:-3.2}]})
beforeAll(async()=>{
 const original=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const client=patchNotesActivity(original).replace('exports.ResearchCanvas = ResearchCanvas;','exports.NoteBody=ResearchContainerBody;exports.NoteViews=EWorkNoteComponentViews;exports.ResearchCanvas = ResearchCanvas;')
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import * as JSX from 'react/jsx-runtime';import * as DOM from 'react-dom';import {createRoot} from 'react-dom/client';import {NotesApp} from './src/preload/notes/editor';import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';
 let descriptor;window.__ModuleLoader__={load:value=>descriptor=value};(0,eval)(${JSON.stringify(client)});
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});const library=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?JSX:id==='react-dom'?DOM:id==='@deepseek-ai/dsh-client-ui-primitives'?new Proxy({MarkdownText:({text})=><div>{text}</div>},{get:(t,k)=>t[k]||(String(k).startsWith('Icon')?()=>null:fake)}):fake);
 window.savedPayload=null;window.savedNote=null;window.noteNode={id:'heat',title:'布局验收',kind:'generated-container',generationStatus:'completed',sizeMode:'manual',width:656,height:320,noteLibrary:true,containerSpec:${JSON.stringify(artifact)}};
 const bridge={request:async(method,input)=>{if(method==='load')return {saved:window.savedNote||{title:'组件布局验收',blocks:[{id:'heat-block',type:'research',props:{payload:JSON.stringify(window.noteNode)},children:[]}],yjs:'',revision:0}};if(method==='save'){window.savedNote={...input.content,revision:input.revision+1};return {status:'saved',saved:window.savedNote}};if(method==='library-list')return [];return {}},draft:async()=>{}};
 const root=createRoot(document.querySelector('#notes'));window.reopen=()=>root.render(<NotesApp key={Math.random()} sessionId="layout-test" bridge={bridge} dark={false} navigate={()=>{}}/>);window.reopen();createRoot(document.querySelector('#portals')).render(<library.NoteViews sessionId="layout-test" active={true}/>);
 const research=createRoot(document.querySelector('#research-body'));research.render(<library.NoteBody node={window.noteNode} sessionId="layout-test" visible={true}/>);
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'layout-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('  const slashMenu = useMemo','  window.noteEditor=editor; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(f=>f.path.endsWith('.js')).text;css=output.outputFiles.find(f=>f.path.endsWith('.css')).text
 researchCss=await readFile('scripts/lib/research-grid-workbench.css','utf8');font=await readFile('build/fonts/NotoSansSC.woff2')
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>browser?.close())
it('aligns the entire narrowed component without losing its payload, frame or saved alignment',async()=>{
 const f=await fixture();try{
  await f.notes.locator('.en-native-component-heading strong').click()
  await f.notes.getByRole('separator',{name:'调整组件宽度',exact:true}).press('Home')
  await f.frame.evaluate(el=>el.dataset.identity='aligned')
  const positions=[]
  for(const [label,alignment] of [['左对齐','left'],['居中','center'],['右对齐','right']]){
   await f.notes.locator('header').first().hover();await f.page.getByRole('button',{name:'段落操作',exact:true}).click();await f.page.locator('.en-block-menu').getByRole('button',{name:label,exact:true}).click()
   expect(await f.page.evaluate(()=>window.noteEditor.getBlock('heat-block').props.textAlignment)).toBe(alignment)
   positions.push((await f.notes.boundingBox()).x)
   expect(await f.frame.getAttribute('data-identity')).toBe('aligned')
   expect(await f.page.evaluate(()=>JSON.parse(window.noteEditor.getBlock('heat-block').props.payload).containerSpec.title)).toBe('布局验收')
  }
  expect(positions[1]).toBeGreaterThan(positions[0]+100);expect(positions[2]).toBeGreaterThan(positions[1]+100)
  await expect.poll(()=>f.page.evaluate(()=>window.savedNote?.blocks[0].props.textAlignment)).toBe('right')
  await f.page.evaluate(()=>window.reopen());await expect.poll(()=>f.notes.boundingBox().then(r=>r.x)).toBe(positions[2])
 }finally{await f.context.close()}
},15000)
async function fixture(){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage()
 page.on('pageerror',e=>console.error('layout-browser-error:',e.message))
 await page.route('http://127.0.0.1/notes-layout',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><section id="notes" class="en-root" style="position:absolute;inset:0 auto 0 0;width:820px"></section><div id="portals"></div><div data-ework-grid style="position:absolute;left:860px;top:80px;width:500px"><section data-research-node-id="control" style="height:320px"><div id="research-body" style="display:flex;flex-direction:column;height:278px"></div></section></div>'}))
 await page.route('**/fonts/NotoSansSC.woff2',r=>r.fulfill({contentType:'font/woff2',body:font}));await page.goto('http://127.0.0.1/notes-layout');await page.addStyleTag({content:researchCss+'\n'+css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor()
 await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'heat-block',type:'research',props:{payload:JSON.stringify(window.noteNode)},children:[]}]))
 await page.locator('.en-native-component-host iframe').waitFor({timeout:4000})
 const notes=page.locator('.en-native-component'),frame=notes.locator('iframe'),reference=page.locator('#research-body iframe')
 return {page,context,notes,frame,reference}
}
it('fills the note component viewport like the original research HTML renderer instead of the iframe default height',async()=>{
 const f=await fixture();try{
  const host=await f.page.locator('.en-native-component-host').boundingBox(),note=await f.frame.boundingBox(),research=await f.reference.boundingBox()
  expect(host.height).toBe(278);expect(research.height).toBe(278);expect(note.height).toBe(278)
  expect(note.width).toBe(host.width)
 }finally{await f.context.close()}
},15000)
it('keeps the original iframe and its content responsive when note width and height are manually changed',async()=>{
 const f=await fixture();try{
  await f.notes.locator('.en-native-component-heading strong').click();await f.frame.evaluate(el=>el.dataset.identity='preserved')
  await f.notes.getByRole('separator',{name:'调整组件宽度',exact:true}).press('ArrowLeft')
  await f.notes.getByRole('separator',{name:'调整组件高度',exact:true}).press('ArrowDown')
  await expect.poll(()=>f.frame.boundingBox().then(r=>r.height)).toBe(294)
  expect(await f.frame.getAttribute('data-identity')).toBe('preserved')
  const host=await f.page.locator('.en-native-component-host').boundingBox(),frame=await f.frame.boundingBox();expect(frame.width).toBe(host.width)
  const payload=await f.page.evaluate(()=>JSON.parse(window.noteEditor.getBlock('heat-block').props.payload))
  expect(payload.noteSize.height).toBe(294);expect(payload.width).toBe(656);expect(payload.height).toBe(320)
 }finally{await f.context.close()}
},15000)
it('fits a narrower note column and restores saved component dimensions on reopening',async()=>{
 const f=await fixture();try{
  await f.notes.locator('.en-native-component-heading strong').click()
  await f.notes.getByRole('separator',{name:'调整组件宽度',exact:true}).press('ArrowLeft')
  await f.notes.getByRole('separator',{name:'调整组件高度',exact:true}).press('ArrowDown')
  await expect.poll(()=>f.page.evaluate(()=>window.savedNote?.blocks?.find(b=>b.id==='heat-block')?.props.payload)).toContain('"height":294')
  const wide=await f.notes.boundingBox();await f.frame.evaluate(el=>el.dataset.identity='preserved')
  await f.page.evaluate(()=>document.querySelector('#notes').style.width='500px')
  // 500px column minus 144px document margins and the two card border pixels.
  await expect.poll(()=>f.frame.boundingBox().then(r=>r.width)).toBe(354)
  expect(await f.frame.getAttribute('data-identity')).toBe('preserved')
  await f.page.evaluate(()=>document.querySelector('#notes').style.width='820px')
  await expect.poll(()=>f.notes.boundingBox().then(r=>r.width)).toBe(wide.width)
  await f.page.evaluate(()=>window.reopen())
  await expect.poll(()=>f.frame.getAttribute('data-identity')).toBe(null)
  await expect.poll(()=>f.frame.boundingBox().then(r=>r?.height)).toBe(294)
  expect((await f.notes.boundingBox()).width).toBe(wide.width)
 }finally{await f.context.close()}
},15000)
