import {afterAll,beforeAll,expect,it} from 'vitest'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {writeFileSync} from 'node:fs'
import {build,type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'
import {notesResidentProductionSource} from './helpers/notes-resident-production-source.mjs'

let browser:any,script=''
const entry='\0notes-inline-result-fixture',evidence=process.env.SHERLOCK_NOTES_RESULT_EVIDENCE
const picture='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120"><rect width="400" height="120" fill="#adc0cf"/><text x="20" y="65" fill="#263441" font-size="22">Synthetic image fixture</text></svg>'
beforeAll(async()=>{
 const source=notesResidentProductionSource().replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__NoteViews=EWorkNoteComponentViews;')
 const config=(await resolveConfig({configFile:resolve('electron.vite.config.ts'),logLevel:'silent'},'build','production')).config!.preload!
 const fixture:Plugin={name:'notes-inline-result-fixture',resolveId:id=>id===entry?entry:undefined,load:id=>id===entry?`
 import * as Y from 'yjs';import React from 'react';import * as JSX from 'react/jsx-runtime';import * as DOM from 'react-dom';import {createRoot} from 'react-dom/client';
 import {mountNotes} from ${JSON.stringify(resolve('src/preload/notes/mount.tsx'))};import {WorkspaceSurfaceHost} from ${JSON.stringify(resolve('src/preload/workspace-surface-host.ts'))};
 const factories=new Map();window.__ModuleLoader__={load:d=>factories.set(d.id,d.factory)};new Function(${JSON.stringify(source)})();class Service{};const noop=()=>null,primitives=new Proxy({},{get:()=>noop});
 const library=factories.get('@deepseek-ai/dsh-client-ui-conversation')(id=>id==='react'?React:id==='react/jsx-runtime'?JSX:id==='react-dom'?DOM:id==='@deepseek-ai/cordis'?{Service}:primitives);
 createRoot(document.querySelector('#portals')).render(React.createElement(library.__NoteViews,{sessionId:'inline-result',active:true}));
 window.calls=[];window.jobs={};window.replies=[];const bridge={request:async(method,input)=>{window.calls.push({method,input});if(method==='load')return{owner:'result-fixture',saved:window.saved,draft:window.pendingDraft};if(method==='save'){if(window.failSaves)throw Error('合成保存确认失败');window.pendingDraft=undefined;window.saved={...input.content,revision:input.revision+1};return{status:'saved',saved:window.saved}}if(method==='component-data'&&input.action==='bind-generated'&&window.holdBinding)return new Promise(resolve=>window.finishBinding=resolve);if(method==='generate')return new Promise((resolve,reject)=>window.jobs[input.requestId]={input,resolve,reject});if(method==='library-list')return[];if(method==='capability-reply')window.replies.push(input);return{}},draft:async input=>{window.pendingDraft={...input.content,baseRevision:input.revision,clientId:input.clientId,updatedAt:Date.now()}}};window.proposalDraft=()=>{if(!window.pendingDraft)return[];const doc=new Y.Doc;Y.applyUpdate(doc,Uint8Array.from(atob(window.pendingDraft.yjs),c=>c.charCodeAt(0)));return [...doc.getMap('note-inline-proposals').values()]};
 const host=new WorkspaceSurfaceHost(document);let mounted=mountNotes(document,bridge,host);window.fixture={flush:()=>mounted.flushCurrent(),reopen:()=>{mounted.dispose();mounted=mountNotes(document,bridge,host)}};
 `:undefined,transform(code,id){if(id.endsWith('/preload/notes/editor.tsx'))return code.replace('  const slashMenu = useMemo','  window.editor=editor;window.noteDoc=doc; const slashMenu = useMemo')}}
 const output=await build({...config,configFile:false,plugins:[...(config.plugins||[]),fixture],build:{...config.build,write:false,rollupOptions:{...config.build?.rollupOptions,input:entry}}})
 script=(Array.isArray(output)?output:[output]).flatMap(item=>'output'in item?item.output:[]).filter(chunk=>chunk.type==='chunk').map(chunk=>chunk.code).join('\n')
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},90000)
afterAll(async()=>browser?.close())
async function open(dark=false,width=1100,empty=false){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors:string[]=[];page.setDefaultTimeout(4000);page.on('pageerror',(error:Error)=>errors.push(error.message))
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
  const mark=f.page.locator('.en-inline-ai-pending').first(),blue=await mark.evaluate((el:HTMLElement)=>getComputedStyle(el).backgroundColor);expect(blue).toBe(dark?'rgb(37, 70, 94)':'rgb(216, 237, 255)')
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
  expect(await component.locator('.bn-block-content').first().evaluate((el:HTMLElement)=>getComputedStyle(el).outlineColor)).toBe('rgb(107, 165, 212)')
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
it.each(['confirm','undo'])('preserves corrected pending metadata and a visible error across a real %s save failure and reopen',async action=>{
 const f=await open();try{
  await generate(f.page,{kind:'text',markdown:'保存确认失败保护的真实生成段落。'});await f.page.evaluate(()=>(window as any).fixture.flush());await f.page.evaluate(()=>(window as any).failSaves=true)
  await f.page.getByRole('button',{name:action==='confirm'?'确认本次 AI 生成':'撤销本次 AI 生成',exact:true}).click();await expect.poll(()=>f.page.locator('.en-space-ai [role="alert"]').textContent()).toContain('保存')
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
