// @ts-expect-error Test-only pre-integration compatibility helper.
import {notesChartNavigationCompatibilitySource} from './helpers/notes-chart-navigation-compatibility.mjs'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {readFileSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {build,type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'
import {notesResidentProductionSource} from './helpers/notes-resident-production-source.mjs'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'

let browser:any,script=''
const entry='\0notes-inline-result-fixture',evidence=process.env.SHERLOCK_NOTES_RESULT_EVIDENCE
const picture='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120"><rect width="400" height="120" fill="#adc0cf"/><text x="20" y="65" fill="#263441" font-size="22">Synthetic image fixture</text></svg>'
beforeAll(async()=>{
 const source=notesResidentProductionSource().replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__NoteViews=EWorkNoteComponentViews;')
 const config=(await resolveConfig({configFile:resolve('electron.vite.config.ts'),logLevel:'silent'},'build','production')).config!.preload!
 const fixture:Plugin={name:'notes-inline-result-fixture',resolveId:id=>id===entry?entry:undefined,load:id=>id===entry?`
 import * as Y from 'yjs';import React from 'react';import * as JSX from 'react/jsx-runtime';import * as DOM from 'react-dom';import {createRoot} from 'react-dom/client';
 import {mountNotes} from ${JSON.stringify(resolve('src/preload/notes/mount.tsx'))};import {WorkspaceSurfaceHost} from ${JSON.stringify(resolve('src/preload/workspace-surface-host.ts'))};
 import {noteChartNavigationAllowed} from ${JSON.stringify(resolve('src/preload/notes/chart-navigation.ts'))};window.navigationAllowed=noteChartNavigationAllowed;
 const factories=new Map();window.__ModuleLoader__={load:d=>factories.set(d.id,d.factory)};new Function(${JSON.stringify(source)})();class Service{};const noop=()=>null,primitives=new Proxy({},{get:()=>noop});
 const library=factories.get('@deepseek-ai/dsh-client-ui-conversation')(id=>id==='react'?React:id==='react/jsx-runtime'?JSX:id==='react-dom'?DOM:id==='@deepseek-ai/cordis'?{Service}:primitives);
 createRoot(document.querySelector('#portals')).render(React.createElement(library.__NoteViews,{sessionId:'inline-result',active:true}));
 window.calls=[];window.jobs={};window.replies=[];const bridge={request:async(method,input)=>{window.calls.push({method,input});if(method==='load')return{owner:'result-fixture',saved:window.saved,draft:window.pendingDraft};if(method==='save'){if(window.holdSaves)await new Promise(resolve=>(window.saveWaiters??=[]).push(resolve));if(window.failSaves)throw Error('合成保存确认失败');window.pendingDraft=undefined;window.saved={...input.content,revision:input.revision+1};return{status:'saved',saved:window.saved}}if(method==='component-data'&&input.action==='bind-generated'&&window.holdBinding)return new Promise(resolve=>window.finishBinding=resolve);if(method==='generate')return new Promise((resolve,reject)=>window.jobs[input.requestId]={input,resolve,reject});if(method==='library-list')return[];if(method==='capability-reply'){window.replies.push(input);if(window.holdPlaceholder&&input.effect?.state==='placeholder')return new Promise(resolve=>window.releasePlaceholder=resolve)}return{}},draft:async input=>{window.pendingDraft={...input.content,baseRevision:input.revision,clientId:input.clientId,updatedAt:Date.now()}}};window.proposalDraft=()=>{if(!window.pendingDraft)return[];const doc=new Y.Doc;Y.applyUpdate(doc,Uint8Array.from(atob(window.pendingDraft.yjs),c=>c.charCodeAt(0)));return [...doc.getMap('note-inline-proposals').values()]};
 const host=new WorkspaceSurfaceHost(document);let mounted=mountNotes(document,bridge,host);window.fixture={flush:()=>mounted.flushCurrent(),reopen:()=>{mounted.dispose();mounted=mountNotes(document,bridge,host)}};
 `:undefined,transform(code,id){if(id.endsWith('/preload/notes/editor.tsx'))return code.replace('  const slashMenu = useMemo','  window.editor=editor;window.noteDoc=doc; const slashMenu = useMemo')}}
 const output=await build({...config,configFile:false,plugins:[{name:'accepted-9b-guard-compatibility',enforce:'pre',load:id=>id.endsWith('/preload/notes/chart-navigation.ts')?notesChartNavigationCompatibilitySource():undefined},...(config.plugins||[]),fixture],build:{...config.build,write:false,rollupOptions:{...config.build?.rollupOptions,input:entry}}})
 script=(Array.isArray(output)?output:[output]).flatMap(item=>'output'in item?item.output:[]).filter(chunk=>chunk.type==='chunk').map(chunk=>chunk.code).join('\n')
 if(evidence){const modules=(Array.isArray(output)?output:[output]).flatMap(item=>'output'in item?item.output:[]).filter(chunk=>chunk.type==='chunk').flatMap((chunk:any)=>Object.entries(chunk.modules??{}).map(([id,value]:any)=>({id,renderedLength:value.renderedLength})));writeFileSync(resolve(evidence,'bundle-modules.json'),JSON.stringify({bytes:new TextEncoder().encode(script).length,parserModules:modules.filter(row=>row.id.includes('@babel/parser')),parse5Modules:modules.filter(row=>row.id.includes('parse5')),navigationModules:modules.filter(row=>/chart-navigation|fixed-chart-runtime|cartesian-chart-artifact\.js\?raw/.test(row.id))},null,2))}
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},90000)
afterAll(async()=>browser?.close())
async function open(dark=false,width=1100,empty=false){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors:string[]=[];page.setDefaultTimeout(4000);page.on('pageerror',(error:Error)=>errors.push(error.message))
 await page.route('**/fonts/NotoSansSC.woff2',(route:any)=>route.fulfill({path:resolve('build/fonts/NotoSansSC.woff2'),contentType:'font/woff2'}))
 await page.route('http://127.0.0.1/inline-result',(route:any)=>route.fulfill({contentType:'text/html',body:'<!doctype html><html data-odyssey-locale="zh"><body><header data-ework-notes-session="inline-result"></header><div data-ework-note-view="inline-result"></div><div id="portals"></div></body></html>'}));await page.goto('http://127.0.0.1/inline-result')
 await page.evaluate(({dark,empty}:any)=>{(window as any).saved={title:empty?'':'原位结果确认',blocks:empty?[]:[{id:'before',type:'paragraph',content:'已有前段'},{id:'anchor',type:'paragraph'},{id:'after',type:'paragraph',content:'用户自己写的市场观察段落'}],yjs:'',revision:0};if(dark)document.body.dataset.dsDarkTheme='true'},{dark,empty})
 await page.addScriptTag({content:'var exports={};\n'+script});await page.locator('.en-title').waitFor();await page.evaluate(()=>{const w=window as any;if(w.saved.blocks.length)w.editor.replaceBlocks(w.editor.document,w.saved.blocks)});return{context,page,errors}
}
async function launch(page:any,prompt='写一段市场分析文字',anchor='anchor'){
 await page.evaluate((anchor:string)=>{const e=(window as any).editor;e.focus();e.setTextCursorPosition(anchor,'start')},anchor);await page.keyboard.press('Space');await page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).fill(prompt);await page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).press('Enter')
 await expect.poll(()=>page.evaluate(()=>Object.keys((window as any).jobs).length)).toBe(1)
}
async function generate(page:any,result:any,prompt='写一段市场分析文字'){
 await launch(page,prompt)
 await page.evaluate((result:any)=>{const w=window as any;w.editor.updateBlock('after',{content:'用户后来补写的市场观察，必须保留'});(Object.values(w.jobs)[0] as any).resolve(result)},result)
}
async function pendingBoundary(page:any,card:any,dark:boolean){
 const rect=await card.boundingBox(),png=(await page.screenshot()).toString('base64')
 return page.evaluate(async({rect,png,dark}:any)=>{
  const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d')!;context.drawImage(image,0,0);const data=context.getImageData(0,0,image.width,image.height).data,color=dark?[108,176,217]:[107,165,212]
  const blue=(x:number,y:number)=>{const i=(y*image.width+x)*4;return x>=0&&y>=0&&x<image.width&&y<image.height&&Math.abs(data[i]!-color[0]!)+Math.abs(data[i+1]!-color[1]!)+Math.abs(data[i+2]!-color[2]!)<32}
  const {x,y,width,height}=rect,result={top:0,bottom:0,left:0,right:0}
  for(let column=Math.ceil(x)+2;column<Math.floor(x+width)-2;column++){if([Math.floor(y)-1,Math.floor(y),Math.ceil(y)].some(row=>blue(column,row)))result.top++;if([Math.floor(y+height)-1,Math.floor(y+height),Math.ceil(y+height)].some(row=>blue(column,row)))result.bottom++}
  for(let row=Math.ceil(y)+2;row<Math.floor(y+height)-2;row++){if([Math.floor(x)-1,Math.floor(x),Math.ceil(x)].some(column=>blue(column,row)))result.left++;if([Math.floor(x+width)-1,Math.floor(x+width),Math.ceil(x+width)].some(column=>blue(column,row)))result.right++}
  return result
 },{rect,png,dark})
}
async function childCapability(page:any,parent:any,id:string,prompt:string){
 const previous=await page.evaluate(()=>Object.keys((window as any).jobs))
 await page.evaluate(({parent,id,prompt}:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:{sessionId:'inline-result',generationId:parent.requestId,requestId:id,context:{documentId:parent.insertionAnchor.documentId},action:'notes.components.create',args:{prompt}}})),{parent,id,prompt})
 await expect.poll(()=>page.evaluate((previous:string[])=>Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='component'&&!previous.includes(job.input.requestId)).length,previous)).toBe(1)
 return page.evaluate((previous:string[])=>(Object.values((window as any).jobs).find((job:any)=>job.input.entryPoint==='component'&&!previous.includes(job.input.requestId)) as any).input,previous)
}
async function capabilityReceipt(page:any,id:string){
 await expect.poll(()=>page.evaluate((id:string)=>(window as any).replies.some((reply:any)=>reply.requestId===id&&reply.result),id)).toBe(true)
 return page.evaluate((id:string)=>({requestId:id,capability:'notes.components.create',...(window as any).replies.find((reply:any)=>reply.requestId===id&&reply.result).result}),id)
}
const resultTable={id:'retry-table',kind:'generated-container',noteLibrary:true,title:'合成重试表',generationStatus:'completed',containerSpec:{version:1,type:'table',title:'合成重试表',columns:['项目','值'],rows:[['甲',0],['乙',-2]]}}
const mixedProse='本次仅核对用户提供的三条演示数据。\n\n这些演示值不代表真实行情。'
const interactiveMixedNode={id:'mixed-chart',kind:'generated-container',noteLibrary:true,title:'用户提供的交互演示图',generationStatus:'completed',containerSpec:JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'chart',variant:'line',title:'用户提供的交互演示图',unit:'演示值',asOf:'仅用户提供演示数据，无真实行情',labels:['10月1日','10月2日','10月3日'],series:[{name:'演示值',values:[10,20,15]}]}))!)}
const capturedNavigationNode={...interactiveMixedNode,title:'原位图表验收',containerSpec:{version:1,type:'html',title:'原位图表验收',html:readFileSync(resolve('test/fixtures/notes-native-chart-navigation.html'),'utf8')}}
const canonicalNavigationNode={...interactiveMixedNode,containerSpec:JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',"import{readFileSync}from'node:fs';import{acceptArtifactOutput}from'./packages/dsh-research-task-runtime/artifact-output.js';process.stdout.write(acceptArtifactOutput(readFileSync(0,'utf8')))"],{input:JSON.stringify({version:1,type:'chart',variant:'line',title:'用户提供的交互演示图',unit:'演示值',asOf:'仅用户提供演示数据，无真实行情',labels:['10月1日','10月2日','10月3日'],series:[{name:'演示值',values:[10,20,15]}]}),encoding:'utf8'}))}
it.each([{name:'captured-native',node:capturedNavigationNode},{name:'canonical',node:canonicalNavigationNode}])('keeps pending HTML chart review undoable after trusted point navigation and reopen ($name)',async({node})=>{
 const f=await open();try{
  await generate(f.page,{kind:'component',node},'仅插入用户提供的三条演示数据交互折线图')
  const undo=f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}),chart=f.page.frameLocator('iframe[data-research-html-artifact]').frameLocator('iframe#preview')
  await undo.waitFor();await chart.locator('svg').waitFor();await f.page.getByRole('button',{name:'选中组件并操作内容',exact:true}).click()
  await chart.locator('svg').press('ArrowRight');await expect.poll(()=>chart.locator('.chart-readout').textContent()).toContain('10月2日')
  await expect.poll(()=>f.page.evaluate(()=>{const block=(window as any).editor.document.find((b:any)=>b.type==='research');return Object.values(JSON.parse(block.props.payload).config?.interactionState?.events??{}).filter((event:any)=>event.tag==='SVG'&&event.key==='ArrowRight').length})).toBe(1)
  if(evidence)writeFileSync(resolve(evidence,'navigation-diagnostic-'+node.title+'.json'),JSON.stringify(await f.page.evaluate(()=>{const w=window as any,block=w.editor.document.find((b:any)=>b.type==='research'),node=JSON.parse(block.props.payload),event=Object.values(node.config.interactionState.events)[0],record=[...w.noteDoc.getMap('note-inline-proposals').values()][0],entry=record.changes.find((c:any)=>c.id===block.id);return{allowed:w.navigationAllowed(node.containerSpec.html,event),event,dirty:entry.dirty,expected:entry.after,actual:block}}),null,2))
  await expect.poll(()=>undo.isEnabled()).toBe(true)
  await f.page.evaluate(()=>(window as any).fixture.flush());await f.page.evaluate(()=>(window as any).fixture.reopen())
  await expect.poll(()=>chart.locator('.chart-readout').textContent()).toContain('10月2日');await expect.poll(()=>undo.isEnabled()).toBe(true)
  await undo.click();await expect.poll(()=>f.page.locator('.en-native-component').count()).toBe(0)
  expect(await f.page.evaluate(()=>(window as any).editor.document.map((b:any)=>b.id))).toEqual(['before','anchor','after'])
  expect(await f.page.locator('.bn-editor').textContent()).toContain('用户后来补写的市场观察，必须保留');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},25000)
it('keeps compact daily chart first, middle and last points undoable at three actual widths through disclosure and reopen',async()=>{
 const node=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',"import{homeNotesGuideChart}from'./packages/dsh-research-task-runtime/home-notes-guide-artifacts.js';process.stdout.write(JSON.stringify(homeNotesGuideChart('pending-daily').node))"],{encoding:'utf8'})),f=await open(false,1500)
 try{
  await generate(f.page,{kind:'component',node},'插入中际旭创与沪深300的真实一年历史价格图')
  const undo=f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}),card=f.page.locator('.en-native-component'),chart=f.page.frameLocator('iframe[data-research-html-artifact]').frameLocator('iframe#preview')
  await undo.waitFor();await chart.locator('svg').waitFor();await f.page.locator('.en-document').evaluate((node:HTMLElement)=>node.style.maxWidth='1200px');await f.page.getByRole('button',{name:'选中组件并操作内容',exact:true}).click()
  const dates=await chart.locator('table tbody tr td:first-child').allTextContents();expect(dates).toHaveLength(243)
  for(const width of [476,676,862]){
   await card.evaluate((node:HTMLElement,width:number)=>node.style.width=width+'px',width);await expect.poll(()=>card.evaluate((node:HTMLElement)=>Math.round(node.getBoundingClientRect().width))).toBe(width)
   await expect.poll(()=>chart.locator('svg').evaluate((node:HTMLElement)=>Math.round(node.getBoundingClientRect().width))).toBeGreaterThan(width-64)
   expect(await chart.locator('svg > text > title').count()).toBe(5)
   for(const index of [0,80,242]){await chart.locator('rect.hit[data-point="'+index+'"]').click();await expect.poll(()=>chart.locator('.chart-readout').textContent()).toContain(dates[index]);await expect.poll(()=>undo.isEnabled()).toBe(true)}
   await chart.locator('svg').press('ArrowLeft');await expect.poll(()=>chart.locator('.chart-readout').textContent()).toContain(dates[241])
   await chart.locator('summary').click();expect(await chart.locator('details').getAttribute('open')).not.toBeNull();expect(await chart.locator('tbody tr').count()).toBe(243);await chart.locator('summary').click()
   await f.page.evaluate(()=>(window as any).fixture.flush());await expect.poll(()=>undo.isEnabled()).toBe(true);expect(await f.page.locator('.en-component-error').count()).toBe(0)
  }
  await f.page.evaluate(()=>(window as any).fixture.reopen());await undo.waitFor();await chart.locator('svg').waitFor();await expect.poll(()=>undo.isEnabled()).toBe(true);await undo.click();await expect.poll(()=>card.count()).toBe(0)
  expect(await f.page.locator('.bn-editor').textContent()).toContain('用户后来补写的市场观察，必须保留');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},45000)
it('keeps a real HTML memo edit protected instead of rebasing it as chart navigation',async()=>{
 const f=await open();try{
  const node={...capturedNavigationNode,containerSpec:{...capturedNavigationNode.containerSpec,html:capturedNavigationNode.containerSpec.html+'<label>备注<textarea aria-label="人工备注"></textarea></label>'}}
  await generate(f.page,{kind:'component',node});const undo=f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}),chart=f.page.frameLocator('iframe[data-research-html-artifact]').frameLocator('iframe#preview');await undo.waitFor()
  await f.page.getByRole('button',{name:'选中组件并操作内容',exact:true}).click();await chart.getByRole('textbox',{name:'人工备注',exact:true}).fill('用户实际输入的备注')
  await expect.poll(()=>f.page.evaluate(()=>{const block=(window as any).editor.document.find((b:any)=>b.type==='research');return Object.values(JSON.parse(block.props.payload).config?.interactionState?.events??{}).some((event:any)=>event.value==='用户实际输入的备注')})).toBe(true)
  await expect.poll(()=>undo.isEnabled()).toBe(false);expect(await f.page.locator('.en-native-component').count()).toBe(1);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
it('restores the exact pending review after a trusted chart navigation save fails',async()=>{
 const f=await open();try{
  await generate(f.page,{kind:'component',node:capturedNavigationNode});const undo=f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}),chart=f.page.frameLocator('iframe[data-research-html-artifact]').frameLocator('iframe#preview');await undo.waitFor();await f.page.evaluate(()=>(window as any).fixture.flush())
  await f.page.getByRole('button',{name:'选中组件并操作内容',exact:true}).click();await f.page.evaluate(()=>{const w=window as any;w.chartAcks=[];w.failSaves=true;document.addEventListener('sherlock:notes-component-ack',(event:any)=>w.chartAcks.push(event.detail))})
  await chart.locator('svg').press('ArrowRight');await expect.poll(()=>f.page.evaluate(()=>(window as any).chartAcks.some((ack:any)=>ack.requestId.includes(':interaction:')&&ack.ok===false))).toBe(true)
  await expect.poll(()=>undo.isEnabled()).toBe(true);expect(await f.page.evaluate(()=>{const block=(window as any).editor.document.find((b:any)=>b.type==='research');return JSON.parse(block.props.payload).config?.interactionState})).toBeUndefined()
  await f.page.evaluate(async()=>{const w=window as any;w.failSaves=false;await w.fixture.flush()});await undo.click();await expect.poll(()=>f.page.locator('.en-native-component').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
it('does not rebase chart navigation after an identical block ID is rebuilt with a new Y node',async()=>{
 const f=await open();try{
  await generate(f.page,{kind:'component',node:capturedNavigationNode});const undo=f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}),chart=f.page.frameLocator('iframe[data-research-html-artifact]').frameLocator('iframe#preview');await undo.waitFor()
  const identities=await f.page.evaluate(()=>{const w=window as any,e=w.editor,block=e.document.find((b:any)=>b.type==='research'),identity=()=>{let found:string|undefined;const visit=(node:any)=>{if(node.getAttribute?.('id')===block.id)found=node._item.id.client+':'+node._item.id.clock;for(const child of node.toArray?.()??[])visit(child)};visit(w.noteDoc.getXmlFragment('note'));return found},before=identity();e.removeBlocks([block.id]);e.insertBlocks([block],'after','before');return{before,after:identity()}});expect(identities.after).not.toBe(identities.before);await chart.locator('svg').waitFor();await f.page.getByRole('button',{name:'选中组件并操作内容',exact:true}).click()
  await chart.locator('svg').press('ArrowRight');await expect.poll(()=>chart.locator('.chart-readout').textContent()).toContain('10月2日');await expect.poll(()=>undo.isEnabled()).toBe(false);expect(await f.page.locator('.en-native-component').count()).toBe(1);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
async function mixedChild(page:any,parent:any,id='mixed-chart-call',node:any=interactiveMixedNode){
 const child=await childCapability(page,parent,id,'仅用用户提供的10月1日10、10月2日20、10月3日15创建可交互演示组件，不修改旧内容')
 await page.evaluate(({requestId,node}:any)=>(window as any).jobs[requestId].resolve({kind:'component',node}),{requestId:child.requestId,node})
 return capabilityReceipt(page,id)
}
it.each(['before-components','after-components'])('places mixed prose in actual $0 order around two real components and undoes only this request',async inlineOrder=>{
 const f=await open();try{
  await f.page.route('**/fonts/NotoSansSC.woff2',(route:any)=>route.fulfill({contentType:'font/woff2',path:resolve('build/fonts/NotoSansSC.woff2')}))
  await launch(f.page,inlineOrder==='before-components'?'先写两句演示数据总结，再插入交互图和表格':'先插入交互图和表格，随后附两句演示数据总结')
  const parent=await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input),first=await mixedChild(f.page,parent),second=await mixedChild(f.page,parent,'mixed-table-call',resultTable)
  await f.page.evaluate(({id,receipts,inlineOrder,markdown}:any)=>(window as any).jobs[id].resolve({kind:'text',markdown,inlineOrder,capabilityReceipts:receipts}),{id:parent.requestId,receipts:[first,second],inlineOrder,markdown:mixedProse})
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).waitFor()
  const ordered=await f.page.evaluate(()=>(window as any).editor.document.map((block:any)=>block.type==='research'?'component':block.content?.map((part:any)=>part.text||'').join('')))
  expect(ordered).toEqual(inlineOrder==='before-components'?['已有前段','本次仅核对用户提供的三条演示数据。','这些演示值不代表真实行情。','component','component','用户自己写的市场观察段落']:['已有前段','component','component','本次仅核对用户提供的三条演示数据。','这些演示值不代表真实行情。','用户自己写的市场观察段落'])
  const identities=await f.page.evaluate(()=>{const w=window as any,visit=(type:any,id:string):string|undefined=>{if(type.getAttribute?.('id')===id)return type._item.id.client+':'+type._item.id.clock;for(const child of type.toArray?.()||[]){const found=visit(child,id);if(found)return found}},value=[...w.noteDoc.getMap('note-inline-proposals').values()][0] as any;return value.changes.filter((change:any)=>change.after?.type==='research').map((change:any)=>({expected:change.identity,actual:visit(w.noteDoc.getXmlFragment('note'),change.id)}))})
  for(const identity of identities)expect(identity.actual).toBe(identity.expected)
  const chart=f.page.frameLocator('iframe[data-research-html-artifact]').frameLocator('iframe#preview');await chart.locator('svg').press('End');await expect.poll(()=>chart.locator('.chart-readout').textContent()).toContain('10月3日')
  await f.page.evaluate(()=>(window as any).editor.updateBlock('after',{content:'人工尾段必须保留'}));await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click()
  await expect.poll(()=>f.page.locator('.en-native-component').count()).toBe(0);expect(await f.page.evaluate(()=>(window as any).editor.document.map((block:any)=>block.id))).toEqual(['before','anchor','after']);expect(await f.page.locator('.bn-editor').textContent()).toContain('人工尾段必须保留');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},25000)

it.each(['edit-component','replace-component-id','remove-anchor','cancel'])('does not insert late mixed prose after $0 invalidates its request-owned placement',async kind=>{
 const f=await open();try{
  await launch(f.page,'先写总结，再创建交互图组件');const parent=await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input),receipt=await mixedChild(f.page,parent)
  await f.page.evaluate(({kind,blockId}:any)=>{const e=(window as any).editor,b=e.getBlock(blockId);if(kind==='edit-component')e.updateBlock(blockId,{props:{payload:JSON.stringify({...JSON.parse(b.props.payload),displayName:'用户手动改名'})}});if(kind==='replace-component-id'){e.removeBlocks([blockId]);e.insertBlocks([{...b,id:blockId}],'anchor','before')}if(kind==='remove-anchor')e.removeBlocks(['anchor'])},{kind,blockId:receipt.blockId})
  if(kind==='cancel')await f.page.getByRole('button',{name:'停止',exact:true}).click()
  await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'text',markdown:'本次迟到正文不可误插。',inlineOrder:'before-components',capabilityReceipts:[receipt]}),{id:parent.requestId,receipt})
  if(kind!=='cancel')await expect.poll(()=>f.page.evaluate(()=>[...(window as any).noteDoc.getMap('note-inline-proposals').values()].map((value:any)=>value.error||'').join('；'))).toMatch(/变化|删除/)
  expect(await f.page.locator('.bn-editor').textContent()).not.toContain('本次迟到正文不可误插');expect(await f.page.locator('.en-native-component').count()).toBe(1);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)

it('preserves text typed into the original anchor while placing mixed prose before its own component',async()=>{
 const f=await open();try{
  await launch(f.page,'先写总结再创建演示图');const parent=await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input),receipt=await mixedChild(f.page,parent)
  await f.page.evaluate(()=>(window as any).editor.updateBlock('anchor',{content:'生成期间用户在原空行输入的文字'}))
  await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'text',markdown:'本次原位总结。',inlineOrder:'before-components',capabilityReceipts:[receipt]}),{id:parent.requestId,receipt})
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).waitFor();expect(await f.page.evaluate(()=>(window as any).editor.document.map((block:any)=>block.type==='research'?'component':block.content?.map((part:any)=>part.text||'').join('')))).toEqual(['已有前段','本次原位总结。','component','生成期间用户在原空行输入的文字','用户自己写的市场观察段落'])
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click();expect(await f.page.locator('.bn-block-outer[data-id="anchor"]').textContent()).toContain('生成期间用户在原空行输入的文字');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)

it('ignores a stray component-order hint for a normal text-only response',async()=>{
 const f=await open();try{await generate(f.page,{kind:'text',markdown:'普通文字仍应直接写入。',inlineOrder:'before-components'});await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).waitFor();expect(await f.page.locator('.bn-editor').textContent()).toContain('普通文字仍应直接写入。');expect(f.errors).toEqual([])}finally{await f.context.close()}
},20000)
it.each([{count:1000,characters:4,action:'undo'},{count:1200,characters:81,action:'confirm'}])('keeps complete long review for $count paragraphs through save/reopen and $action',async({count,characters,action})=>{
 const f=await open();try{
  const markdown=Array.from({length:count},(_,i)=>'文'.repeat(characters-String(i).length)+i).join('\n\n');expect(markdown.length).toBeLessThanOrEqual(100000)
  await generate(f.page,{kind:'text',markdown},'逐段生成并保留全部 '+count+' 项内容')
  const confirm=f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true});await confirm.waitFor({timeout:10000})
  expect(await f.page.locator('.en-inline-ai-pending').count()).toBe(count)
  await f.page.evaluate(()=>(window as any).fixture.flush())
  const saved=await f.page.evaluate(()=>{const w=window as any,value=[...w.noteDoc.getMap('note-inline-proposals').values()][0] as any;return{blocks:w.saved.blocks.length,bytes:new TextEncoder().encode(JSON.stringify({title:w.saved.title,blocks:w.saved.blocks,yjs:w.saved.yjs})).length,chunks:value.changeEncoding?.chunks.length}})
  expect(saved.blocks).toBe(count+2);expect(saved.bytes).toBeLessThanOrEqual(4*1024*1024);expect(saved.chunks).toBeGreaterThan(1)
  if(action==='undo'){
   await f.page.evaluate(()=>(window as any).failSaves=true);await confirm.click()
   await expect.poll(()=>f.page.evaluate(()=>[...(window as any).noteDoc.getMap('note-inline-proposals').values()].map((value:any)=>value.error||'').join('；'))).toContain('保存');expect(await f.page.locator('.en-space-ai [role="alert"]').count()).toBe(0)
   expect(await f.page.evaluate(()=>(window as any).proposalDraft()[0]?.changeEncoding.chunks.length)).toBeGreaterThan(1)
   await f.page.evaluate(()=>(window as any).failSaves=false)
  }
  await f.page.evaluate(()=>(window as any).fixture.reopen());await confirm.waitFor({timeout:10000})
  expect(await f.page.locator('.en-inline-ai-pending').count()).toBe(count)
  if(action==='undo'){
   await f.page.evaluate(()=>{const e=(window as any).editor,block=e.document[Math.floor(e.document.length/2)];e.updateBlock(block.id,{content:'人工修改长结果必须保留'})})
   await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click()
   await expect.poll(()=>f.page.locator('.bn-block-outer[data-id]').count()).toBe(3)
   expect(await f.page.locator('.bn-editor').textContent()).toContain('人工修改长结果必须保留');await confirm.click()
  }else await confirm.click()
  await expect.poll(()=>f.page.locator('.en-space-ai').count()).toBe(0);await f.page.evaluate(()=>(window as any).fixture.flush());await f.page.evaluate(()=>(window as any).fixture.reopen())
  await expect.poll(()=>f.page.locator('.bn-block-outer[data-id]').count()).toBe(action==='undo'?3:count+2)
  expect(await f.page.locator('.bn-editor').textContent()).toContain('用户后来补写的市场观察，必须保留');expect(await f.page.locator('.en-inline-ai-pending').count()).toBe(0);expect(f.errors).toEqual([])
  if(evidence)writeFileSync(resolve(evidence,'long-review-'+count+'.json'),JSON.stringify({markdownLength:markdown.length,...saved},null,2))
 }finally{await f.context.close()}
},40000)
it('undoes only this generated result and preserves the user market paragraph and subsequent edits',async()=>{
 const f=await open();try{
  await generate(f.page,{kind:'text',markdown:'本次生成的新正文。'})
  const undo=f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true});await undo.waitFor()
  expect(await f.page.locator('.en-space-ai textarea').count()).toBe(0);expect(await f.page.locator('.en-inline-ai-pending').count()).toBeGreaterThan(0)
  await f.page.evaluate(()=>(window as any).editor.updateBlock('before',{content:'用户同时修改的前段'}));await undo.click()
  await expect.poll(()=>f.page.locator('.bn-editor').textContent()).not.toContain('本次生成的新正文。');expect(await f.page.locator('.bn-editor').textContent()).toContain('用户后来补写的市场观察，必须保留');expect(await f.page.locator('.bn-editor').textContent()).toContain('用户同时修改的前段')
  expect(await f.page.locator('.en-inline-ai-pending').count()).toBe(0);await f.page.evaluate(()=>(window as any).fixture.flush());await f.page.evaluate(()=>(window as any).fixture.reopen());await expect.poll(()=>f.page.locator('.bn-editor').textContent()).toContain('用户后来补写的市场观察，必须保留');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
it.each([false,true])('confirms rich content below the result row, clears its marks and saves in dark=%s',async dark=>{
 const f=await open(dark,dark?640:1100);try{
  await f.page.route('http://127.0.0.1/result.svg',(route:any)=>route.fulfill({contentType:'image/svg+xml',body:picture}))
  await generate(f.page,{kind:'text',markdown:'## 新增研判\n\n本次 AI 正文。\n\n```js\nconst price = 0\n```\n\n![合成验收图片](http://127.0.0.1/result.svg)'},'写正文并提供代码和图片')
  const confirm=f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true});await confirm.waitFor()
  const summary=f.page.locator('.en-space-ai-summary');expect((await summary.textContent()).trim()).not.toBe('');expect(await f.page.locator('.en-space-ai textarea').count()).toBe(0)
  const mark=f.page.locator('.en-inline-ai-pending').first(),blue=await mark.evaluate((el:HTMLElement)=>getComputedStyle(el).backgroundColor);expect(blue).toBe(dark?'rgba(70, 160, 230, 0.22)':'rgba(40, 140, 235, 0.16)');expect(await mark.evaluate((el:HTMLElement)=>getComputedStyle(el).boxShadow)).toBe('none')
  expect(await mark.evaluate((el:HTMLElement)=>getComputedStyle(el).backgroundClip)).toBe('content-box')
  const content=mark.locator('.bn-block-content').first(),box=(await f.page.locator('.en-space-ai').boundingBox())!,result=await content.count()?await content.boundingBox():await mark.boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(result!.y+1);expect(box.height).toBeLessThanOrEqual(56)
  expect(await f.page.locator('.bn-block-outer[data-id="after"].en-inline-ai-pending').count()).toBe(0);expect(await f.page.locator('.bn-editor pre').textContent()).toContain('const price = 0')
  await expect.poll(()=>f.page.locator('.bn-editor img').evaluateAll((images:HTMLImageElement[])=>images.length>0&&images.every(image=>image.complete&&image.naturalWidth===400))).toBe(true)
  if(evidence){await f.page.screenshot({path:resolve(evidence,`pending-rich-${dark?'dark':'light'}.png`)});writeFileSync(resolve(evidence,`pending-rich-${dark?'dark':'light'}.json`),JSON.stringify({box,result,blue,summary:await summary.textContent()},null,2))}
  await confirm.click();await expect.poll(()=>f.page.locator('.en-space-ai').count()).toBe(0);expect(await f.page.locator('.en-inline-ai-pending').count()).toBe(0)
  await f.page.evaluate(()=>(window as any).fixture.flush());expect(await f.page.evaluate(()=>JSON.stringify((window as any).saved.blocks))).not.toMatch(/en-space-ai|en-inline-ai-pending/)
  await f.page.evaluate(()=>(window as any).fixture.reopen());await expect.poll(()=>f.page.locator('.bn-editor').textContent()).toContain('本次 AI 正文。');expect(await f.page.locator('.en-inline-ai-pending').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
it('keeps user edits to a generated result when that review can no longer be undone safely',async()=>{
 const f=await open();try{
  await generate(f.page,{kind:'text',markdown:'用于验证冲突保护的 AI 初稿。'});const undo=f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true});await undo.waitFor()
  await f.page.evaluate(()=>{const e=(window as any).editor,block=e.document.find((b:any)=>b.content?.some((part:any)=>part.text?.includes('冲突保护的 AI 初稿')));e.updateBlock(block.id,{content:'用户已经编辑这份结果，不得删除'})})
  expect(await undo.isDisabled()).toBe(true)
  expect(await f.page.locator('.bn-editor').textContent()).toContain('用户已经编辑这份结果，不得删除');expect(await f.page.locator('.bn-editor').textContent()).toContain('用户后来补写的市场观察，必须保留')
  await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).click();await expect.poll(()=>f.page.locator('.en-space-ai').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
it('retains pending marks when feedback is dismissed and restores its real undo after reopening',async()=>{
 const f=await open();try{
  await generate(f.page,{kind:'text',markdown:'等待确认的本次结果。'});await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).waitFor()
  await f.page.locator('.en-space-ai').press('Escape');expect(await f.page.locator('.en-space-ai').count()).toBe(0);expect(await f.page.locator('.en-inline-ai-pending').count()).toBeGreaterThan(0)
  await f.page.locator('.en-inline-ai-pending .bn-block-content').first().click();await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).waitFor();await f.page.locator('.en-space-ai').press('Escape')
  await f.page.evaluate(()=>(window as any).fixture.flush());await f.page.evaluate(()=>(window as any).fixture.reopen());await f.page.locator('.en-inline-ai-pending .bn-block-content').first().click()
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click();await expect.poll(()=>f.page.locator('.bn-editor').textContent()).not.toContain('等待确认的本次结果。');expect(await f.page.locator('.bn-editor').textContent()).toContain('用户后来补写的市场观察，必须保留');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
it.each([false,true])('click-away confirms a completed wrapped result without moving its mouse gesture or typed paragraph, dark=%s',async dark=>{
 const f=await open(dark,dark?640:1100);try{
  const markdown='本次生成的多行研判保留为正文。'+('用户提供的数据需要结合实际情况核对，保留原始来源与单位。'.repeat(8));await generate(f.page,{kind:'text',markdown});await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).waitFor()
  const mark=f.page.locator('.en-inline-ai-pending').first(),id=await mark.getAttribute('data-en-inline-proposal-id'),style=await mark.evaluate((element:HTMLElement)=>{const css=getComputedStyle(element);return{background:css.backgroundColor,shadow:css.boxShadow,textDecoration:css.textDecorationLine,border:css.borderBottomWidth,height:element.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(element.querySelector('.bn-inline-content')!).lineHeight)}})
  if(evidence){await f.page.screenshot({path:resolve(evidence,'click-away-pending-'+(dark?'dark':'light')+'.png')});writeFileSync(resolve(evidence,'click-away-style-'+(dark?'dark':'light')+'.json'),JSON.stringify(style,null,2))}
  await f.page.evaluate(()=>{const w=window as any;w.holdSaves=true;w.awayGesture=[];for(const type of ['pointerdown','pointerup'])document.addEventListener(type,()=>w.awayGesture.push({type,top:document.querySelector('.bn-block-outer[data-id="after"]')!.getBoundingClientRect().top}),{capture:true,once:true})})
  await f.page.locator('.bn-block-outer[data-id="after"] .bn-inline-content').click();await f.page.keyboard.type('【接续输入】')
  expect(await f.page.evaluate(()=>(window as any).editor.getTextCursorPosition().block.id)).toBe('after');expect(await f.page.locator('.bn-block-outer[data-id="after"]').textContent()).toContain('【接续输入】')
  const gesture=await f.page.evaluate(()=>(window as any).awayGesture);expect(gesture.map((value:any)=>value.type)).toEqual(['pointerdown','pointerup']);expect(Math.abs(gesture[0].top-gesture[1].top)).toBeLessThanOrEqual(1)
  expect(await f.page.evaluate((id:string)=>(window as any).calls.filter((call:any)=>call.method==='conversation-state'&&call.input.requestId===id&&call.input.phase==='accepted').length,id)).toBe(0)
  await f.page.evaluate(()=>{const w=window as any;w.holdSaves=false;(w.saveWaiters??[]).splice(0).forEach((release:any)=>release())});await expect.poll(()=>f.page.locator('.en-inline-ai-pending,.en-space-ai[data-review]').count()).toBe(0)
  await expect.poll(()=>f.page.evaluate((id:string)=>(window as any).calls.filter((call:any)=>call.method==='conversation-state'&&call.input.requestId===id&&call.input.phase==='accepted').length,id)).toBe(1)
  expect(style.shadow).toBe('none');expect(style.textDecoration).toBe('none');expect(style.background).toBe(dark?'rgba(70, 160, 230, 0.22)':'rgba(40, 140, 235, 0.16)');expect(style.height).toBeGreaterThan(style.lineHeight*2)
  await f.page.evaluate(()=>(window as any).fixture.flush());await f.page.evaluate(()=>(window as any).fixture.reopen());await expect.poll(()=>f.page.locator('.bn-editor').textContent()).toContain(markdown);expect(await f.page.locator('.bn-block-outer[data-id="after"]').textContent()).toContain('【接续输入】');expect(await f.page.locator('.en-inline-ai-pending,.en-space-ai[data-review]').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},25000)
it('click-away accepts into an empty paragraph and preserves the new caret and text',async()=>{
 const f=await open();try{
  await generate(f.page,{kind:'text',markdown:'空段落验收前的已完成结果。'});await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).waitFor();await f.page.evaluate(()=>{const w=window as any;w.editor.insertBlocks([{id:'away-empty',type:'paragraph'}],'after','after');w.emptyCaretTrace=[];const read=(type:string,event?:Event)=>{const selection=getSelection();w.emptyCaretTrace.push({type,target:(event?.target as Element)?.closest?.('.bn-block-outer')?.getAttribute('data-id'),dom:selection?.anchorNode?.parentElement?.closest('.bn-block-outer')?.getAttribute('data-id'),pm:w.editor.getTextCursorPosition().block.id,active:document.activeElement?.className})};for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,event=>{read(type,event);if(type==='click')requestAnimationFrame(()=>read('frame'))},{capture:true,once:true})})
  await f.page.locator('.bn-block-outer[data-id="away-empty"] .bn-inline-content').click();await f.page.keyboard.type('空行点击后的人工内容');await expect.poll(()=>f.page.locator('.en-inline-ai-pending,.en-space-ai[data-review]').count()).toBe(0);const cursor=await f.page.evaluate(()=>(window as any).editor.getTextCursorPosition().block.id)
  if(evidence){writeFileSync(resolve(evidence,'empty-caret.json'),JSON.stringify(await f.page.evaluate(()=>({trace:(window as any).emptyCaretTrace,doc:(window as any).editor.document})),null,2));await f.page.screenshot({path:resolve(evidence,'empty-caret.png')})}
  expect(cursor).toBe('away-empty');expect(await f.page.locator('.bn-block-outer[data-id="away-empty"]').textContent()).toContain('空行点击后的人工内容');expect(await f.page.locator('.bn-editor').textContent()).toContain('空段落验收前的已完成结果。');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
it.each([false,true])('click-away excludes controls and keeps one fitted pending component boundary without blue bands, dark=%s',async dark=>{
 const f=await open(dark,dark?640:1100);try{await generate(f.page,{kind:'component',node:resultTable},'创建验收表格');await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).waitFor();const card=f.page.locator('.en-native-component');const metrics=await card.evaluate((element:HTMLElement)=>{const css=getComputedStyle(element),outer=element.closest('.en-inline-ai-pending')!,content=element.closest('.bn-block-content')!;return{width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height,marginTop:css.marginTop,marginBottom:css.marginBottom,outline:css.outlineWidth,offset:css.outlineOffset,outerBackground:getComputedStyle(outer).backgroundColor,outerShadow:getComputedStyle(outer).boxShadow,contentOutline:getComputedStyle(content).outlineStyle,outlineStyle:css.outlineStyle}});if(evidence)writeFileSync(resolve(evidence,'component-before-'+(dark?'dark':'light')+'.json'),JSON.stringify(metrics,null,2));expect(metrics.outerBackground).toBe('rgba(0, 0, 0, 0)');expect(metrics.outerShadow).toBe('none');expect(metrics.contentOutline).toBe('none');expect(metrics.outline).toBe('1px');expect(metrics.offset).toBe('0px');const painted=await pendingBoundary(f.page,card,dark);if(evidence)writeFileSync(resolve(evidence,'component-painted-'+(dark?'dark':'light')+'.json'),JSON.stringify(painted,null,2));expect(painted.top).toBeGreaterThan(metrics.width*.8);expect(painted.bottom).toBeGreaterThan(metrics.width*.8);expect(painted.left).toBeGreaterThan(metrics.height*.8);expect(painted.right).toBeGreaterThan(metrics.height*.8);if(evidence){await f.page.screenshot({path:resolve(evidence,'click-away-component-'+(dark?'dark':'light')+'.png')});writeFileSync(resolve(evidence,'click-away-component-'+(dark?'dark':'light')+'.json'),JSON.stringify(metrics,null,2))};expect(await f.page.locator('.en-space-ai[data-review]').evaluate((element:HTMLElement)=>element.getBoundingClientRect().height)).toBe(48);await card.getByRole('button',{name:'选中组件并操作内容',exact:true}).click();await expect.poll(()=>card.getAttribute('data-selected')).toBe('true');expect(await card.evaluate((element:HTMLElement)=>({outline:getComputedStyle(element).outlineStyle,frame:getComputedStyle(element,'::after').borderWidth}))).toEqual({outline:'none',frame:'1px'});await card.getByPlaceholder('搜索表格').click();await card.getByPlaceholder('搜索表格').fill('甲');await card.getByRole('button',{name:'组件更多操作',exact:true}).click();await f.page.getByRole('menu',{name:'组件更多操作',exact:true}).waitFor();expect(await f.page.locator('.en-inline-ai-pending').count()).toBe(1);await f.page.keyboard.press('Escape');await f.page.getByRole('textbox',{name:'笔记标题',exact:true}).click();await f.page.getByRole('button',{name:'展开目录',exact:true}).click();await f.page.getByRole('button',{name:'收起目录',exact:true}).click();expect(await f.page.locator('.en-inline-ai-pending').count()).toBe(1);expect(await f.page.locator('.en-space-ai[data-review]').count()).toBe(1);await f.page.locator('.bn-block-outer[data-id="after"] .bn-inline-content').click();await expect.poll(()=>f.page.locator('.en-inline-ai-pending,.en-space-ai[data-review]').count()).toBe(0);const after=await card.evaluate((element:HTMLElement)=>({width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height,marginTop:getComputedStyle(element).marginTop,marginBottom:getComputedStyle(element).marginBottom,outline:getComputedStyle(element).outlineStyle}));expect(after).toEqual({width:metrics.width,height:metrics.height,marginTop:metrics.marginTop,marginBottom:metrics.marginBottom,outline:'none'});expect(f.errors).toEqual([])}finally{await f.context.close()}
},20000)
it.each([false,true])('click-away confirms only the departing proposal while another pending review survives delayed save, failure=%s',async failure=>{
 const f=await open();try{
  await generate(f.page,{kind:'text',markdown:'较早的待确认正文甲。'});await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).waitFor();const target=await f.page.locator('.en-inline-ai-pending').first().getAttribute('data-en-inline-proposal-id')
  await f.page.evaluate(()=>{const e=(window as any).editor;e.insertBlocks([{id:'second-away-anchor',type:'paragraph'}],'after','after');e.focus();e.setTextCursorPosition('second-away-anchor','start')});await f.page.keyboard.press('Space');await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).fill('再写一段待确认正文乙');await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).press('Enter');await expect.poll(()=>f.page.evaluate(()=>Object.keys((window as any).jobs).length)).toBe(2);await f.page.evaluate(()=>{const w=window as any;(Object.values(w.jobs).at(-1) as any).resolve({kind:'text',markdown:'较新的待确认正文乙。'})});await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).waitFor();const departing=await f.page.locator('.en-space-ai').getAttribute('data-review');expect(departing).not.toBe(target)
  await f.page.evaluate((failure:boolean)=>{const w=window as any;w.holdSaves=true;w.failSaves=failure},failure);await f.page.locator('[data-en-inline-proposal-id="'+target+'"] .bn-inline-content').click();await expect.poll(()=>f.page.locator('.en-space-ai').getAttribute('data-review')).toBe(target);await expect.poll(()=>f.page.evaluate(()=>(window as any).saveWaiters?.length||0)).toBeGreaterThan(0)
  await expect.poll(()=>f.page.evaluate((id:string)=>(window as any).noteDoc.getMap('note-inline-proposals').has(id),departing)).toBe(false)
  expect(await f.page.evaluate((id:string)=>(window as any).calls.filter((call:any)=>call.method==='conversation-state'&&call.input.requestId===id&&call.input.phase==='accepted').length,departing)).toBe(0)
  await f.page.evaluate(()=>{const w=window as any;w.holdSaves=false;(w.saveWaiters??[]).splice(0).forEach((release:any)=>release())})
  await expect.poll(()=>f.page.evaluate(({departing,failure}:any)=>{const w=window as any;return failure?w.noteDoc.getMap('note-inline-proposals').has(departing):!w.noteDoc.getMap('note-inline-proposals').has(departing)},{departing,failure})).toBe(true)
  if(failure)await expect.poll(()=>f.page.evaluate((id:string)=>(window as any).noteDoc.getMap('note-inline-proposals').get(id)?.error,departing)).toContain('保存');else await expect.poll(()=>f.page.evaluate((id:string)=>(window as any).calls.filter((call:any)=>call.method==='conversation-state'&&call.input.requestId===id&&call.input.phase==='accepted').length,departing)).toBe(1)
  expect(await f.page.locator('.en-space-ai').getAttribute('data-review')).toBe(target);expect(await f.page.locator('[data-en-inline-proposal-id="'+target+'"]').count()).toBe(1);expect(await f.page.locator('.bn-editor').textContent()).toContain('用户后来补写的市场观察，必须保留');expect(await f.page.locator('.bn-editor').textContent()).toContain('较新的待确认正文乙。');expect(await f.page.locator('.bn-editor').textContent()).toContain('较早的待确认正文甲。');await f.page.evaluate(()=>{(window as any).failSaves=false});expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},25000)
it('click-away preserves a stopped partial result with a completed child and no final model reply',async()=>{
 const f=await open();try{
  await launch(f.page,'创建表格后补充说明');const parent=await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input),child=await childCapability(f.page,parent,'stopped-success','创建第一张表格');await f.page.evaluate(({id,node}:any)=>(window as any).jobs[id].resolve({kind:'component',node}),{id:child.requestId,node:resultTable});expect((await capabilityReceipt(f.page,'stopped-success')).status).toBe('succeeded');await f.page.getByRole('button',{name:'停止',exact:true}).click();await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).waitFor();const id=await f.page.locator('.en-space-ai').getAttribute('data-review');expect(await f.page.locator('.en-space-ai-summary').innerText()).toContain('部分未完成');await f.page.locator('.bn-block-outer[data-id="after"] .bn-inline-content').click();await expect.poll(()=>f.page.locator('.en-space-ai').getAttribute('data-review')).toBe(id);expect(await f.page.locator('.en-inline-ai-pending').count()).toBe(1);expect(await f.page.evaluate((id:string)=>(window as any).noteDoc.getMap('note-inline-proposals').has(id),id!)).toBe(true);expect(await f.page.evaluate(()=>(window as any).calls.filter((call:any)=>call.method==='conversation-state'&&call.input.phase==='accepted').length)).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
it('click-away does not accept a draft, running request or failed request',async()=>{
 const f=await open();try{await f.page.evaluate(()=>{const e=(window as any).editor;e.focus();e.setTextCursorPosition('anchor','start')});await f.page.keyboard.press('Space');const input=f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true});await input.fill('未完成的需求必须保留');await f.page.locator('.bn-block-outer[data-id="after"] .bn-inline-content').click();expect(await input.inputValue()).toBe('未完成的需求必须保留');expect(await f.page.evaluate(()=>Object.keys((window as any).jobs).length)).toBe(0);await input.press('Enter');await f.page.getByRole('button',{name:'停止',exact:true}).waitFor();await f.page.locator('.bn-block-outer[data-id="after"] .bn-inline-content').click();expect(await f.page.getByRole('button',{name:'停止',exact:true}).isVisible()).toBe(true);await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).reject(Error('合成未完成请求')));await input.waitFor();await f.page.locator('.bn-block-outer[data-id="after"] .bn-inline-content').click();expect(await input.inputValue()).toBe('未完成的需求必须保留');expect(await f.page.locator('.en-space-ai [role="alert"]').count()).toBe(1);expect(await f.page.evaluate(()=>(window as any).calls.filter((call:any)=>call.method==='conversation-state'&&call.input.phase==='accepted').length)).toBe(0);expect(f.errors).toEqual([])}finally{await f.context.close()}
},20000)
it('undoes the generated code and loaded image without touching the user market paragraph',async()=>{
 const f=await open();try{
  await f.page.route('http://127.0.0.1/result.svg',(route:any)=>route.fulfill({contentType:'image/svg+xml',body:picture}))
  await generate(f.page,{kind:'text',markdown:'本次生成的代码和图片。\n\n```js\nconst retainedZero = 0\n```\n\n![合成验收图片](http://127.0.0.1/result.svg)'},'生成代码和图片')
  const undo=f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true});await undo.waitFor();await expect.poll(()=>f.page.locator('.bn-editor img').evaluateAll((images:HTMLImageElement[])=>images.length>0&&images.every(image=>image.complete&&image.naturalWidth>0))).toBe(true)
  expect(await f.page.locator('.bn-editor pre').textContent()).toContain('const retainedZero = 0');await undo.click()
  await expect.poll(()=>f.page.locator('.bn-editor img,.bn-editor pre').count()).toBe(0);expect(await f.page.locator('.bn-editor').textContent()).not.toContain('本次生成的代码和图片。');expect(await f.page.locator('.bn-editor').textContent()).toContain('用户后来补写的市场观察，必须保留');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
it('marks a real generated chart and removes that component through the real review undo',async()=>{
 const f=await open();try{
  await generate(f.page,{kind:'component',node:{id:'fixture-chart',kind:'generated-container',noteLibrary:true,title:'合成验收图表',containerSpec:{version:1,type:'chart',variant:'bar',title:'合成验收图表',unit:'元',asOf:'合成验收',labels:['甲','乙'],series:[{name:'原值',values:[0,-2]}]},generationStatus:'completed'}},'生成图表，甲=0，乙=-2')
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).waitFor();const component=f.page.locator('.bn-block-outer.en-inline-ai-pending:has(.en-native-component)');await component.waitFor()
  expect(await component.locator('.en-research').evaluate((el:HTMLElement)=>getComputedStyle(el).outlineColor)).toBe('rgb(107, 165, 212)')
  if(evidence){writeFileSync(resolve(evidence,'pending-chart.json'),JSON.stringify(await component.evaluate((element:HTMLElement)=>({html:element.outerHTML,outline:getComputedStyle(element.querySelector('.bn-block-content')!).outline})),null,2));await f.page.screenshot({path:resolve(evidence,'pending-chart.png')})}
  expect(await f.page.evaluate(()=>JSON.parse((window as any).editor.document.find((b:any)=>b.type==='research').props.payload).containerSpec.series[0].values)).toEqual([0,-2])
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click();await expect.poll(()=>f.page.locator('.en-native-component').count()).toBe(0);expect(await f.page.locator('.bn-editor').textContent()).toContain('用户后来补写的市场观察，必须保留');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
it('reanchors single-line processing above a real component without taking the other paragraph focus',async()=>{
 const f=await open(false,640);try{
  await launch(f.page,'生成柱图，甲=0，乙=-2');await f.page.evaluate(()=>{const e=(window as any).editor;e.focus();e.setTextCursorPosition('after','end')});await f.page.keyboard.type(' 生成中继续编辑')
  const request=await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input)
  await f.page.evaluate((request:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:{sessionId:'inline-result',generationId:request.requestId,requestId:'result-child',context:{documentId:request.insertionAnchor.documentId},action:'notes.components.create',args:{prompt:'创建柱图，用户数据甲=0、乙=-2'}}})),request)
  await expect.poll(()=>f.page.evaluate(()=>Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='component').length)).toBe(1)
  await f.page.locator('.en-space-ai[data-running=true]').waitFor();expect(await f.page.locator('.en-space-ai textarea,.en-space-ai-result-actions,.en-inline-ai-pending').count()).toBe(0)
  const box=(await f.page.locator('.en-space-ai').boundingBox())!,component=(await f.page.locator('.bn-block-outer:has(.en-native-component) .bn-block-content').first().boundingBox())!;expect(box.height).toBeLessThanOrEqual(56);expect(box.y+box.height).toBeLessThanOrEqual(component.y+1)
  expect(await f.page.evaluate(()=>!!document.activeElement?.closest('.bn-editor'))).toBe(true);await f.page.keyboard.type(' 首结果后继续编辑')
  await f.page.evaluate(()=>{const job=Object.values((window as any).jobs).find((job:any)=>job.input.entryPoint==='component') as any;job.resolve({kind:'component',node:{id:'streamed-chart',kind:'generated-container',title:'合成验收柱图',generationStatus:'completed',containerSpec:{version:1,type:'chart',variant:'bar',title:'合成验收柱图',unit:'元',asOf:'合成验收',labels:['甲','乙'],series:[{name:'原值',values:[0,-2]}]}}})})
  await expect.poll(()=>f.page.evaluate(()=>(window as any).replies.find((reply:any)=>reply.requestId==='result-child'&&reply.result)?.result.status)).toBe('succeeded')
  await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).resolve({kind:'conversation',markdown:'已生成图表，需要我继续调整吗？',capabilityReceipts:[{requestId:'result-child',capability:'notes.components.create',status:'succeeded'}]}))
  const undo=f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true});await undo.waitFor();expect(await f.page.locator('.en-document').textContent()).not.toContain('需要我继续调整吗');expect(await f.page.evaluate(()=>!!document.activeElement?.closest('.bn-editor'))).toBe(true)
  expect(await f.page.locator('.bn-block-outer[data-id="after"]').textContent()).toContain('生成中继续编辑 首结果后继续编辑');await undo.click();await expect.poll(()=>f.page.locator('.en-native-component').count()).toBe(0);expect(await f.page.locator('.bn-editor').textContent()).toContain('用户自己写的市场观察段落 生成中继续编辑 首结果后继续编辑');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
it.each(['confirm','undo'])('preserves corrected pending metadata and a truthful stored error across a real %s save failure and reopen',async action=>{
 const f=await open();try{
  await generate(f.page,{kind:'text',markdown:'保存确认失败保护的真实生成段落。'});await f.page.evaluate(()=>(window as any).fixture.flush());await f.page.evaluate(()=>(window as any).failSaves=true)
  await f.page.getByRole('button',{name:action==='confirm'?'确认本次 AI 生成':'撤销本次 AI 生成',exact:true}).click();await expect.poll(()=>f.page.evaluate(()=>[...(window as any).noteDoc.getMap('note-inline-proposals').values()].map((value:any)=>value.error||'').join('；'))).toContain('保存');expect(await f.page.locator('.en-space-ai [role="alert"]').count()).toBe(0)
  const records=await f.page.evaluate(()=>(window as any).proposalDraft());expect(records).toHaveLength(1);expect(records[0].error).toContain('保存')
  if(action==='undo')expect(await f.page.locator('.bn-editor').textContent()).not.toContain('保存确认失败保护');else expect(await f.page.locator('.bn-editor').textContent()).toContain('保存确认失败保护')
  await f.page.evaluate(()=>{const w=window as any;w.failSaves=false;w.fixture.reopen()});await expect.poll(()=>f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).count()).toBe(1)
  expect(await f.page.locator('.bn-editor').textContent()).toContain('用户后来补写的市场观察，必须保留');await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).click();await expect.poll(()=>f.page.locator('.en-space-ai').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
it('does not let a stopped request with a late source binding overwrite the next inline draft',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).holdBinding=true);await launch(f.page,'创建演示表格并绑定已验证来源')
  const node={id:'bound-demo',kind:'generated-container',noteLibrary:true,title:'合成验收表',generationStatus:'completed',containerSpec:{version:1,type:'table',title:'合成验收表',columns:['值'],rows:[[0]]}}
  await f.page.evaluate((result:any)=>{const w=window as any;(Object.values(w.jobs)[0] as any).resolve(result)},{kind:'component',node,sourceResult:{status:'verified',refreshStatus:'unbound',recipe:{fixture:'already-observed-source'}}})
  await expect.poll(()=>f.page.evaluate(()=>typeof(window as any).finishBinding)).toBe('function');await f.page.getByRole('button',{name:'停止',exact:true}).click();await f.page.keyboard.press('Escape')
  await f.page.evaluate(()=>{const e=(window as any).editor;e.insertBlocks([{id:'next-anchor',type:'paragraph'}],'after','before');e.focus();e.setTextCursorPosition('next-anchor','start')});await f.page.keyboard.press('Space');await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).fill('新的B需求必须保留')
  await f.page.evaluate(()=>(window as any).finishBinding({enabled:true}));await f.page.waitForTimeout(40)
  expect(await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).inputValue()).toBe('新的B需求必须保留');expect(await f.page.locator('.en-space-ai[data-review]').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)

it('undoes the sole generated paragraph in a pristine note, reopens blank, and accepts Space again',async()=>{
 const f=await open(false,1100,true);try{
  const initial=await f.page.evaluate(()=>{const w=window as any;return{blocks:w.editor.document,fragment:w.noteDoc.getXmlFragment('note').length}})
  expect(initial.blocks).toHaveLength(1);expect(initial.blocks[0].type).toBe('paragraph');expect(initial.blocks[0].content).toEqual([]);expect(initial.fragment).toBe(0)
  await launch(f.page,'写一段文字',initial.blocks[0].id)
  await f.page.evaluate(()=>{const w=window as any;(Object.values(w.jobs)[0] as any).resolve({kind:'text',markdown:'全新笔记中本次生成的唯一段落。'})})
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).waitFor();expect(await f.page.locator('.en-document').innerText()).toContain('全新笔记中本次生成的唯一段落。')
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click();await expect.poll(()=>f.page.locator('.en-space-ai').count()).toBe(0)
  await expect.poll(()=>f.page.evaluate(()=>JSON.stringify((window as any).editor.document.map((b:any)=>({id:b.id,type:b.type,content:b.content}))))).toBe(JSON.stringify([{id:initial.blocks[0].id,type:'paragraph',content:[]}]))
  await f.page.evaluate(async()=>{const w=window as any;await w.fixture.flush();w.oldEditor=w.editor;w.fixture.reopen()})
  await expect.poll(()=>f.page.evaluate(()=>{const w=window as any;return w.editor!==w.oldEditor})).toBe(true);const blocks=await f.page.evaluate(()=>(window as any).editor.document);expect(blocks).toHaveLength(1);expect(blocks[0].content).toEqual([])
  await f.page.evaluate((id:string)=>{const e=(window as any).editor;e.focus();e.setTextCursorPosition(id,'start')},blocks[0].id);await f.page.keyboard.press('Space');await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).waitFor();expect(await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).inputValue()).toBe('')
  expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})

it('keeps the original prompt and a truthful error when all capabilities fail without a document change',async()=>{
 const f=await open();try{
  await generate(f.page,{kind:'conversation',markdown:'不能冒充已生成正文',requiresReply:true,capabilitySummary:'生成失败：目标组件已删除',capabilityReceipts:[{requestId:'failed-cap',capability:'notes.components.apply',status:'failed',message:'目标组件已删除'}]},'在这里续写市场观察')
  await expect.poll(()=>f.page.locator('.en-space-ai-message').innerText()).toContain('目标组件已删除');expect(await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).inputValue()).toBe('在这里续写市场观察');expect(await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).count()).toBe(0);expect(await f.page.locator('.en-inline-ai-pending').count()).toBe(0);expect(await f.page.locator('.en-document').innerText()).toContain('用户后来补写的市场观察，必须保留');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})

it('keeps a real failed child as an error and retries its unchanged slot without duplicating a placeholder',async()=>{
 const f=await open();try{
  const prior={id:'prior-chart',kind:'generated-container',noteLibrary:true,title:'已有图表',containerSpec:{version:1,type:'chart',variant:'bar',title:'已有图表',labels:['原值'],series:[{name:'已有',values:[5]}]}}
  await f.page.evaluate((prior:any)=>(window as any).editor.insertBlocks([{id:'prior-chart-block',type:'research',props:{payload:JSON.stringify(prior)}}],'before','after'),prior)
  const prompt='创建表格，甲为0，乙为-2';await launch(f.page,prompt);const parent=await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input)
  const child=await childCapability(f.page,parent,'failed-child','创建一个用户数据表格，甲=0、乙=-2')
  const slot=await f.page.evaluate(()=>{const w=window as any;w.editor.updateBlock('after',{content:'用户生成期间补写的市场段落'});const block=w.editor.getBlock('prior-chart-block'),node=JSON.parse(block.props.payload);w.editor.updateBlock(block.id,{props:{payload:JSON.stringify({...node,title:'用户手动修改的已有图表'})}});return w.editor.document.find((b:any)=>b.type==='research'&&b.id!=='prior-chart-block').id})
  await f.page.evaluate((id:string)=>(window as any).jobs[id].reject(Error('合成子任务失败：图表契约无效')),child.requestId);const failed=await capabilityReceipt(f.page,'failed-child');expect(failed.status).toBe('failed')
  await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'conversation',markdown:'已完成组件生成',capabilityReceipts:[receipt]}),{id:parent.requestId,receipt:failed})
  await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).waitFor();expect(await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).inputValue()).toBe(prompt);expect(await f.page.locator('.en-space-ai-message').innerText()).toContain('图表契约无效');expect(await f.page.locator('.en-space-ai-result-actions,.en-inline-ai-pending').count()).toBe(0)
  expect(await f.page.evaluate((id:string)=>JSON.parse((window as any).editor.getBlock(id).props.payload).generationStatus,slot)).toBe('failed')
  await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).press('Enter');await expect.poll(()=>f.page.evaluate(()=>Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='inline').length)).toBe(2)
  const retry=await f.page.evaluate(()=>(Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='inline').at(-1) as any).input),retryChild=await childCapability(f.page,retry,'retry-child','重新创建表格，使用甲0乙-2的原始数据')
  expect(await f.page.evaluate(()=>(window as any).editor.document.filter((b:any)=>b.type==='research').map((b:any)=>b.id))).toEqual(['prior-chart-block',slot])
  await f.page.evaluate(({id,node}:any)=>(window as any).jobs[id].resolve({kind:'component',node}),{id:retryChild.requestId,node:resultTable});const success=await capabilityReceipt(f.page,'retry-child');expect(success.status).toBe('succeeded')
  await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'conversation',markdown:'表格已完成',capabilityReceipts:[receipt]}),{id:retry.requestId,receipt:success});await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).click()
  expect(await f.page.evaluate((id:string)=>JSON.parse((window as any).editor.getBlock(id).props.payload).containerSpec.rows,slot)).toEqual([['甲',0],['乙',-2]])
  const recovered=await f.page.evaluate((id:string)=>JSON.parse((window as any).editor.getBlock(id).props.payload),slot);expect(recovered.generationStatus).toBe('completed');expect(recovered.generationError).toBeUndefined();expect(recovered.noteDraft).toBeUndefined()
  expect(await f.page.evaluate(()=>JSON.parse((window as any).editor.getBlock('prior-chart-block').props.payload).title)).toBe('用户手动修改的已有图表');expect(await f.page.locator('.bn-editor').innerText()).toContain('用户生成期间补写的市场段落');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)

it.each([false,true])('counts only the real successful artifact in mixed child outcomes, keeps a single truthful review row and preserves it during failed-slot retry, dark=%s',async dark=>{
 const f=await open(dark);try{
  const prompt='创建两张用户数据表';await launch(f.page,prompt);const parent=await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input),first=await childCapability(f.page,parent,'mixed-success','创建第一张表')
  await f.page.evaluate(({id,node}:any)=>(window as any).jobs[id].resolve({kind:'component',node}),{id:first.requestId,node:{...resultTable,title:'第一张已完成表'}});const success=await capabilityReceipt(f.page,'mixed-success')
  const second=await childCapability(f.page,parent,'mixed-failure','创建第二张表');await f.page.evaluate((id:string)=>(window as any).jobs[id].reject(Error('合成第二张表失败')),second.requestId);const failed=await capabilityReceipt(f.page,'mixed-failure')
  const slots=await f.page.evaluate(()=>{const w=window as any;w.editor.updateBlock('after',{content:'用户保留的混合结果后段'});return w.editor.document.filter((b:any)=>b.type==='research').map((b:any)=>({id:b.id,status:JSON.parse(b.props.payload).generationStatus}))})
  await f.page.evaluate(({id,receipts}:any)=>(window as any).jobs[id].resolve({kind:'conversation',markdown:'两张表已生成',capabilityReceipts:receipts}),{id:parent.requestId,receipts:[success,failed]})
  await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).waitFor();expect(await f.page.locator('.en-space-ai-summary').innerText()).toContain('1个组件');expect(await f.page.locator('.en-space-ai-summary').innerText()).not.toContain('2个组件');expect(await f.page.locator('.en-space-ai-summary').innerText()).toMatch(/未完成|失败/)
  expect(failed.status).toBe('failed');expect(failed.message).toContain('合成第二张表失败');const partialId=await f.page.locator('.en-space-ai').getAttribute('data-review');expect(await f.page.evaluate((id:string)=>(window as any).noteDoc.getMap('note-inline-proposals').get(id)?.error,partialId!)).toContain('合成第二张表失败');const partialMetrics=await f.page.locator('.en-space-ai').evaluate((shell:HTMLElement)=>({height:shell.getBoundingClientRect().height,row:shell.querySelector('.en-space-ai-result')!.getBoundingClientRect().height,alerts:shell.querySelectorAll('[role=alert]').length}));if(evidence){writeFileSync(resolve(evidence,'partial-row-'+(dark?'dark':'light')+'.json'),JSON.stringify(partialMetrics,null,2));await f.page.screenshot({path:resolve(evidence,'partial-row-'+(dark?'dark':'light')+'.png')})};expect(partialMetrics).toEqual({height:48,row:26,alerts:0});await f.page.locator('.bn-block-outer[data-id="after"] .bn-inline-content').click();expect(await f.page.locator('.en-space-ai').getAttribute('data-review')).toBe(partialId);expect(await f.page.evaluate((id:string)=>(window as any).noteDoc.getMap('note-inline-proposals').has(id),partialId!)).toBe(true);expect(await f.page.evaluate(()=>(window as any).calls.filter((call:any)=>call.method==='conversation-state'&&call.input.phase==='accepted').length)).toBe(0)
  const completed=slots.find((slot:any)=>slot.status==='completed').id,bad=slots.find((slot:any)=>slot.status==='failed').id
  expect(await f.page.locator('.bn-block-outer.en-inline-ai-pending:has(.en-research)').count()).toBe(1);expect(await f.page.locator('.bn-block-outer[data-id="'+bad+'"].en-inline-ai-pending').count()).toBe(0)
  await f.page.locator('.en-space-ai').press('Escape');await f.page.evaluate(()=>{const e=(window as any).editor;e.focus();e.setTextCursorPosition('anchor','start')});await f.page.keyboard.press('Space');expect(await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).inputValue()).toBe(prompt)
  await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).press('Enter');await expect.poll(()=>f.page.evaluate(()=>Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='inline').length)).toBe(2)
  const retry=await f.page.evaluate(()=>(Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='inline').at(-1) as any).input),child=await childCapability(f.page,retry,'mixed-retry','重试第二张未完成表')
  expect(await f.page.evaluate(()=>(window as any).editor.document.filter((b:any)=>b.type==='research').length)).toBe(2)
  await f.page.evaluate(({id,node}:any)=>(window as any).jobs[id].resolve({kind:'component',node}),{id:child.requestId,node:resultTable});const retried=await capabilityReceipt(f.page,'mixed-retry');await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'conversation',markdown:'缺少的表已完成',capabilityReceipts:[receipt]}),{id:retry.requestId,receipt:retried});await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).click()
  const completedContent=f.page.locator('.bn-block-outer[data-id="'+completed+'"] .bn-block-content')
  if(evidence){await f.page.screenshot({path:evidence+'/mixed-retry-before-center.png',fullPage:true});await f.page.evaluate(()=>document.addEventListener('pointerdown',event=>{const element=(event.target as Element),path=event.composedPath().filter((node:any)=>node instanceof Element).slice(0,8).map((node:any)=>({tag:node.tagName,classes:node.getAttribute('class'),role:node.getAttribute('role'),block:node.getAttribute('data-id')}));(window as any).mixedRetryPointer={target:{tag:element.tagName,classes:element.getAttribute('class'),label:element.getAttribute('aria-label')},path}},{capture:true,once:true}))}
  await completedContent.click()
  if(evidence){writeFileSync(evidence+'/mixed-retry-pointer.json',JSON.stringify(await f.page.evaluate(()=>(window as any).mixedRetryPointer),null,2));await f.page.screenshot({path:evidence+'/mixed-retry-after-center.png',fullPage:true})}
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click();await expect.poll(()=>f.page.locator('.en-space-ai').count()).toBe(0)
  expect(await f.page.evaluate((id:string)=>!!(window as any).editor.getBlock(id),completed)).toBe(false);expect(await f.page.evaluate((id:string)=>JSON.parse((window as any).editor.getBlock(id).props.payload).containerSpec.rows,bad)).toEqual([['甲',0],['乙',-2]]);expect(await f.page.locator('.bn-editor').innerText()).toContain('用户保留的混合结果后段');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)

it('restores a persisted old false-ready proposal as the actual failed input without clearing its history or card',async()=>{
 const f=await open();try{
  const prompt='创建这张失败后仍可重试的图';await launch(f.page,prompt);const parent=await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input),child=await childCapability(f.page,parent,'persisted-failure','创建原始图表')
  await f.page.evaluate((id:string)=>(window as any).jobs[id].reject(Error('合成持久化失败：未返回有效图表')),child.requestId);const failed=await capabilityReceipt(f.page,'persisted-failure')
  await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'conversation',markdown:'图表已完成',capabilityReceipts:[receipt]}),{id:parent.requestId,receipt:failed});await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).waitFor()
  const before=await f.page.evaluate(async()=>{const w=window as any,map=w.noteDoc.getMap('note-inline-proposals'),value=[...map.values()][0] as any;map.set(value.id,{...value,state:'ready',summary:'已生成1个组件',error:undefined});await w.fixture.flush();return{id:value.id,blocks:JSON.stringify(w.editor.document)}})
  await f.page.evaluate(()=>{const w=window as any;w.oldEditor=w.editor;w.fixture.reopen()});await expect.poll(()=>f.page.evaluate(()=>{const w=window as any;return w.editor!==w.oldEditor})).toBe(true)
  expect(await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).inputValue()).toBe(prompt);expect(await f.page.locator('.en-space-ai-message').innerText()).toContain('未返回有效图表');expect(await f.page.locator('.en-space-ai-result-actions,.en-inline-ai-pending').count()).toBe(0)
  expect(await f.page.evaluate(()=>JSON.stringify((window as any).editor.document))).toBe(before.blocks);expect(await f.page.evaluate((id:string)=>(window as any).noteDoc.getMap('note-inline-proposals').has(id),before.id)).toBe(true)
  const originalSlot=await f.page.evaluate(()=>(window as any).editor.document.find((b:any)=>b.type==='research').id);await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).press('Enter');await expect.poll(()=>f.page.evaluate(()=>Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='inline').length)).toBe(2)
  const retry=await f.page.evaluate(()=>(Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='inline').at(-1) as any).input),retryChild=await childCapability(f.page,retry,'persisted-retry','重新创建原始有效图表')
  expect(await f.page.evaluate(()=>(window as any).editor.document.filter((b:any)=>b.type==='research').map((b:any)=>b.id))).toEqual([originalSlot])
  await f.page.evaluate(({id,node}:any)=>(window as any).jobs[id].resolve({kind:'component',node}),{id:retryChild.requestId,node:resultTable});const success=await capabilityReceipt(f.page,'persisted-retry');await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'conversation',markdown:'有效结果已完成',capabilityReceipts:[receipt]}),{id:retry.requestId,receipt:success});await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).click()
  const recovered=await f.page.evaluate((id:string)=>JSON.parse((window as any).editor.getBlock(id).props.payload),originalSlot);expect(recovered.generationStatus).toBe('completed');expect(recovered.generationError).toBeUndefined();expect(recovered.noteDraft).toBeUndefined();expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)

it('does not reuse or overwrite a failed slot that the user independently edited',async()=>{
 const f=await open();try{
  const prompt='创建表格并保留人工改过的失败卡';await launch(f.page,prompt);const parent=await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input),child=await childCapability(f.page,parent,'edited-failure','创建表格')
  await f.page.evaluate((id:string)=>(window as any).jobs[id].reject(Error('合成人工修改保护失败')),child.requestId);const failed=await capabilityReceipt(f.page,'edited-failure');await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'conversation',markdown:'已处理',capabilityReceipts:[receipt]}),{id:parent.requestId,receipt:failed});await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).waitFor()
  const old=await f.page.evaluate(()=>{const w=window as any,block=w.editor.document.find((b:any)=>b.type==='research'),node=JSON.parse(block.props.payload),payload=JSON.stringify({...node,title:'人工保留的独立失败卡',containerPrompt:'用户自己的新需求'});w.editor.updateBlock(block.id,{props:{payload}});w.editor.updateBlock('after',{content:'用户独立保留的正文'});return{id:block.id,payload}})
  await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).press('Enter');await expect.poll(()=>f.page.evaluate(()=>Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='inline').length)).toBe(2)
  const retry=await f.page.evaluate(()=>(Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='inline').at(-1) as any).input),retried=await childCapability(f.page,retry,'edited-retry','新建一次表格')
  expect(await f.page.evaluate((id:string)=>(window as any).editor.getBlock(id).props.payload,old.id)).toBe(old.payload);expect(await f.page.evaluate(()=>(window as any).editor.document.filter((b:any)=>b.type==='research').length)).toBe(2)
  await f.page.evaluate(({id,node}:any)=>(window as any).jobs[id].resolve({kind:'component',node}),{id:retried.requestId,node:resultTable});const receipt=await capabilityReceipt(f.page,'edited-retry');await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'conversation',markdown:'本次新表已完成',capabilityReceipts:[receipt]}),{id:retry.requestId,receipt})
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click();expect(await f.page.evaluate((id:string)=>(window as any).editor.getBlock(id).props.payload,old.id)).toBe(old.payload);expect(await f.page.evaluate(()=>(window as any).editor.document.filter((b:any)=>b.type==='research').length)).toBe(1);expect(await f.page.locator('.bn-editor').innerText()).toContain('用户独立保留的正文');expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)

it('rechecks failed-slot ownership after the real asynchronous placeholder report before starting retry',async()=>{
 const f=await open();try{
  await launch(f.page,'重试时保护原位卡片');const parent=await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input),child=await childCapability(f.page,parent,'race-failure','创建表格')
  await f.page.evaluate((id:string)=>(window as any).jobs[id].reject(Error('合成可重试失败')),child.requestId);const failed=await capabilityReceipt(f.page,'race-failure');await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'conversation',markdown:'已处理',capabilityReceipts:[receipt]}),{id:parent.requestId,receipt:failed});await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).waitFor()
  await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).press('Enter');await expect.poll(()=>f.page.evaluate(()=>Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='inline').length)).toBe(2)
  const retry=await f.page.evaluate(()=>(Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='inline').at(-1) as any).input)
  await f.page.evaluate((parent:any)=>{const w=window as any;w.holdPlaceholder=true;document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:{sessionId:'inline-result',generationId:parent.requestId,requestId:'race-retry',context:{documentId:parent.insertionAnchor.documentId},action:'notes.components.create',args:{prompt:'继续创建表格'}}}))},retry)
  await expect.poll(()=>f.page.evaluate(()=>typeof(window as any).releasePlaceholder)).toBe('function')
  const changed=await f.page.evaluate(()=>{const w=window as any,block=w.editor.document.find((b:any)=>b.type==='research'),node=JSON.parse(block.props.payload),payload=JSON.stringify({...node,title:'等待报告时用户改过的卡片',containerPrompt:'用户自己的新内容'});w.editor.updateBlock(block.id,{props:{payload}});w.releasePlaceholder();return{id:block.id,payload}})
  const receipt=await capabilityReceipt(f.page,'race-retry');expect(receipt.status).toBe('failed');expect(receipt.message).toContain('较新内容已保留');expect(await f.page.evaluate(()=>Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='component').length)).toBe(1)
  await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'conversation',requiresReply:true,capabilitySummary:receipt.message,capabilityReceipts:[receipt]}),{id:retry.requestId,receipt})
  await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).waitFor();expect(await f.page.evaluate((id:string)=>(window as any).editor.getBlock(id).props.payload,changed.id)).toBe(changed.payload);expect(await f.page.locator('.en-space-ai-result-actions,.en-inline-ai-pending').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)

it('does not attribute a native card retry to an inline request still waiting to claim the failed slot',async()=>{
 const f=await open();try{
  await launch(f.page,'保留用户自己启动的卡片任务');const parent=await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input),child=await childCapability(f.page,parent,'native-race-failure','创建表格')
  await f.page.evaluate((id:string)=>(window as any).jobs[id].reject(Error('合成可通过卡片重试的失败')),child.requestId);const failed=await capabilityReceipt(f.page,'native-race-failure');await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'conversation',markdown:'已处理',capabilityReceipts:[receipt]}),{id:parent.requestId,receipt:failed});await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).waitFor()
  await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).press('Enter');await expect.poll(()=>f.page.evaluate(()=>Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='inline').length)).toBe(2)
  const retry=await f.page.evaluate(()=>(Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='inline').at(-1) as any).input)
  await f.page.evaluate((parent:any)=>{const w=window as any;w.holdPlaceholder=true;document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:{sessionId:'inline-result',generationId:parent.requestId,requestId:'native-race-inline',context:{documentId:parent.insertionAnchor.documentId},action:'notes.components.create',args:{prompt:'由行内框重试表格'}}}))},retry)
  await expect.poll(()=>f.page.evaluate(()=>typeof(window as any).releasePlaceholder)).toBe('function');await f.page.locator('.en-creation-draft').getByRole('button',{name:'创建',exact:true}).click()
  await expect.poll(()=>f.page.evaluate(()=>Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='component').length)).toBe(2);const native=await f.page.evaluate(()=>(Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='component').at(-1) as any).input)
  await f.page.evaluate(()=>(window as any).releasePlaceholder());const declined=await capabilityReceipt(f.page,'native-race-inline');expect(declined.status).toBe('failed')
  await f.page.evaluate(({id,node}:any)=>(window as any).jobs[id].resolve({kind:'component',node}),{id:native.requestId,node:resultTable});await expect.poll(()=>f.page.evaluate(()=>{const block=(window as any).editor.document.find((b:any)=>b.type==='research');return JSON.parse(block.props.payload).containerSpec?.rows})).toEqual([['甲',0],['乙',-2]])
  await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'conversation',requiresReply:true,capabilitySummary:receipt.message,capabilityReceipts:[receipt]}),{id:retry.requestId,receipt:declined})
  await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).waitFor();expect(await f.page.locator('.en-space-ai-result-actions,.en-inline-ai-pending').count()).toBe(0);expect(await f.page.evaluate(()=>(window as any).editor.document.filter((b:any)=>b.type==='research').length)).toBe(1);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
