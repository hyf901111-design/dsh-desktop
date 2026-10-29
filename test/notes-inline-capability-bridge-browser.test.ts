import {afterAll,beforeAll,expect,it} from 'vitest'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {mkdirSync,writeFileSync} from 'node:fs'
import {build,type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'
import {NotesCapabilityBridge} from '../src/main/notes/capability-bridge'
import {createNoteCapabilityHandlers} from '../src/main/notes/capability-handlers'
import {createClientCapabilityHost} from '../packages/dsh-research-task-runtime/client-capability-host.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {notesResidentProductionSource} from './helpers/notes-resident-production-source.mjs'

const sessionId='inline-main-bridge',owner='inline-main-bridge-owner',entry='\0notes-inline-main-bridge-fixture'
const evidence=process.env.SHERLOCK_NOTES_BRIDGE_EVIDENCE
const prompt='在此处写两句简短总结，说明本次仅核对用户提供的三条演示数据，不代表真实行情。随后插入一个两列表格，列名是“日期”和“演示值”，三行依次为10月1日10、10月2日20、10月3日15。只生成这段正文和表格，不修改标题或其他内容。'
const prose=['本次仅核对用户提供的三条演示数据。','这些演示值不代表真实行情。']
const previousFailed={id:'previous-failed-node',kind:'generated-container',title:'旧失败卡必须保留',noteDraft:'smart',containerPrompt:'旧请求的独立失败卡',generationStatus:'failed',generationError:'旧子任务失败，不能计入本次完成'}
const tableNode={id:'demo-table-output',kind:'generated-container',title:'用户提供的演示数据',generationStatus:'completed',noteLibrary:true,containerSpec:JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'table',title:'用户提供的演示数据',columns:['日期','演示值'],rows:[['10月1日',10],['10月2日',20],['10月3日',15]]}))!)}
let browser:any,script=''

beforeAll(async()=>{
 const source=notesResidentProductionSource().replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__NoteViews=EWorkNoteComponentViews;')
 const config=(await resolveConfig({configFile:resolve('electron.vite.config.ts'),logLevel:'silent'},'build','production')).config!.preload!
 const fixture:Plugin={name:'notes-inline-main-bridge-fixture',resolveId:id=>id===entry?entry:undefined,load:id=>id===entry?`
 import * as Y from 'yjs';import React from 'react';import * as JSX from 'react/jsx-runtime';import * as DOM from 'react-dom';import {createRoot} from 'react-dom/client';
 import {mountNotes} from ${JSON.stringify(resolve('src/preload/notes/mount.tsx'))};import {WorkspaceSurfaceHost} from ${JSON.stringify(resolve('src/preload/workspace-surface-host.ts'))};
 const factories=new Map();window.__ModuleLoader__={load:d=>factories.set(d.id,d.factory)};new Function(${JSON.stringify(source)})();class Service{};const noop=()=>null,primitives=new Proxy({},{get:()=>noop});
 const library=factories.get('@deepseek-ai/dsh-client-ui-conversation')(id=>id==='react'?React:id==='react/jsx-runtime'?JSX:id==='react-dom'?DOM:id==='@deepseek-ai/cordis'?{Service}:primitives);
 createRoot(document.querySelector('#portals')).render(React.createElement(library.__NoteViews,{sessionId:${JSON.stringify(sessionId)},active:true}));
 window.calls=[];window.jobs={};window.replies=[];window.tasks=[];document.addEventListener('sherlock:notes-task-state',event=>window.tasks.push(event.detail));const bridge={request:async(method,input)=>{
  window.calls.push({method,input});
  if(method==='load')return{owner:${JSON.stringify(owner)},saved:window.saved,draft:window.pendingDraft};
  if(method==='save'){if(window.failSaves)throw Error('合成保存失败，待确认内容必须保留');window.pendingDraft=undefined;window.saved={...input.content,revision:input.revision+1};return{status:'saved',saved:window.saved}};
  if(method==='generate')return new Promise((resolve,reject)=>window.jobs[input.requestId]={input,resolve,reject});
  if(method==='capability-reply'){window.replies.push(input);return window.mainCapabilityReply(input)};
  if(method==='library-list')return[];return{}
 },draft:async input=>{window.pendingDraft={...input.content,baseRevision:input.revision,clientId:input.clientId,updatedAt:Date.now()}}};
 const host=new WorkspaceSurfaceHost(document);let mounted=mountNotes(document,bridge,host);window.fixture={flush:()=>mounted.flushCurrent(),reopen:()=>{mounted.dispose();mounted=mountNotes(document,bridge,host)}};
 `:undefined,transform(code,id){if(id.endsWith('/preload/notes/editor.tsx'))return code.replace('  const slashMenu = useMemo','  window.editor=editor;window.noteDoc=doc; const slashMenu = useMemo')}}
 const output=await build({...config,configFile:false,plugins:[...(config.plugins||[]),fixture],build:{...config.build,write:false,rollupOptions:{...config.build?.rollupOptions,input:entry}}})
 script=(Array.isArray(output)?output:[output]).flatMap(item=>'output'in item?item.output:[]).filter(chunk=>chunk.type==='chunk').map(chunk=>chunk.code).join('\n')
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},90000)
afterAll(async()=>browser?.close())

async function open(){
 const context=await browser.newContext({viewport:{width:1100,height:950}}),page=await context.newPage(),errors:string[]=[],sent:any[]=[]
 page.setDefaultTimeout(4000);page.on('pageerror',(error:Error)=>errors.push(error.message))
 // This is the production Main transport, including its independently minted
 // requestId. Only the window send/reply boundary is replaced by a headless page.
 const main=new NotesCapabilityBridge(detail=>{sent.push(detail);void page.evaluate((detail:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail})),detail).catch((error:Error)=>errors.push(error.message))})
 await page.exposeFunction('mainCapabilityReply',(input:any)=>main.respond(input,owner))
 await page.route('http://127.0.0.1/inline-main-bridge',(route:any)=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-odyssey-locale="zh"><body><header data-ework-notes-session="${sessionId}"></header><div data-ework-note-view="${sessionId}"></div><div id="portals"></div></body></html>`}))
 await page.goto('http://127.0.0.1/inline-main-bridge')
 await page.evaluate((previousFailed:any)=>{(window as any).saved={title:'',blocks:[{id:'upper',type:'paragraph',content:'上方保留段落'},{id:'old-failed',type:'research',props:{payload:JSON.stringify(previousFailed)}},{id:'anchor',type:'paragraph'},{id:'lower',type:'paragraph',content:'下方保留段落'}],yjs:'',revision:0}},previousFailed)
 await page.addScriptTag({content:'var exports={};\n'+script});await page.locator('.en-title').waitFor()
 await page.evaluate(()=>{const w=window as any;w.editor.replaceBlocks(w.editor.document,w.saved.blocks)})
 return{page,context,main,errors,sent,async close(){main.dispose();await context.close()}}
}

async function launch(page:any){
 await page.evaluate(()=>{const e=(window as any).editor;e.focus();e.setTextCursorPosition('anchor','start')});await page.keyboard.press('Space')
 const input=page.getByRole('textbox',{name:'行内 AI 需求',exact:true});await input.fill(prompt);await input.press('Enter')
 await expect.poll(()=>page.evaluate(()=>Object.keys((window as any).jobs).length)).toBe(1)
 return page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).input)
}

async function startCapability(f:Awaited<ReturnType<typeof open>>,parent:any,modelCallId:string){
 const context={...parent.capabilityContext,owner,sessionId,documentId:parent.insertionAnchor.documentId,mode:'notes' as const,editable:true,selectedBlockIds:[]},controller=new AbortController()
 const host=createClientCapabilityHost({current:()=>context,handlers:createNoteCapabilityHandlers({context,canWrite:()=>true,requestContext:{},sourceInstruction:prompt,renderer:(action,args)=>f.main.request(action,args,context,parent.requestId,controller.signal,()=>true)})})
 const previous=await f.page.evaluate(()=>Object.keys((window as any).jobs))
 const receipt=host.executor.execute({requestId:modelCallId,capability:'notes.components.create',arguments:{prompt:'创建两列表格：日期、演示值；10月1日10、10月2日20、10月3日15。仅用这些演示数据。'}},context,controller.signal)
 await expect.poll(()=>f.page.evaluate((previous:string[])=>Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='component'&&!previous.includes(job.input.requestId)).length,previous)).toBe(1)
 const child=await f.page.evaluate((previous:string[])=>(Object.values((window as any).jobs).find((job:any)=>job.input.entryPoint==='component'&&!previous.includes(job.input.requestId)) as any).input,previous)
 const transport=[...f.sent].reverse().find(value=>value.action==='notes.components.create'&&value.generationId===parent.requestId)
 expect(transport.requestId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
 expect(transport.requestId).not.toBe(modelCallId);expect(transport.generationId).toBe(parent.requestId)
 return{receipt,child,transport}
}

async function snapshot(page:any){
 return page.evaluate(()=>{const w=window as any;return{blocks:w.editor.document.map((block:any)=>({id:block.id,type:block.type,text:block.content?.map((part:any)=>part.text||'').join(''),status:block.type==='research'?JSON.parse(block.props.payload).generationStatus:undefined})),proposals:[...w.noteDoc.getMap('note-inline-proposals').values()].map((value:any)=>({id:value.id,state:value.state,resultKind:value.resultKind,error:value.error,summary:value.summary}))}})
}
function record(name:string,value:any){if(evidence){mkdirSync(evidence,{recursive:true});writeFileSync(resolve(evidence,name+'.json'),JSON.stringify(value,null,2)+'\n')}}

it.each(['before-components','after-components'])('keeps genuine Main bridge IDs distinct and places mixed prose $0 with a complete scoped Undo',async inlineOrder=>{
 const f=await open();try{
  const parent=await launch(f.page),modelCallId='req-demo-table-'+inlineOrder,call=await startCapability(f,parent,modelCallId)
  await f.page.evaluate(({id,node}:any)=>(window as any).jobs[id].resolve({kind:'component',node}),{id:call.child.requestId,node:tableNode})
  const receipt=await call.receipt
  expect(receipt.requestId).toBe(modelCallId);expect(receipt.requestId).not.toBe(call.transport.requestId)
  expect(receipt.status).toBe('succeeded');expect(receipt.effect).toEqual({state:'saved',blockId:receipt.blockId})
  await f.page.evaluate(({id,receipt,inlineOrder,markdown}:any)=>(window as any).jobs[id].resolve({kind:'text',markdown,inlineOrder,capabilityReceipts:[receipt]}),{id:parent.requestId,receipt,inlineOrder,markdown:prose.join('\n\n')})
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).waitFor()
  const table=f.page.locator('.bn-block-outer[data-id="'+receipt.blockId+'"] .odyssey-native-table')
  await expect.poll(()=>table.locator('tbody tr').count()).toBe(3)
  expect(await table.getByRole('searchbox',{name:'搜索表格',exact:true}).count()).toBe(1)
  expect(await table.locator('thead th').allTextContents()).toEqual(['日期','演示值'])
  expect(await table.locator('tbody tr').allTextContents()).toEqual(['10月1日10','10月2日20','10月3日15'])
  const actual=await snapshot(f.page)
  record('main-bridge-'+inlineOrder,{transportRequestId:call.transport.requestId,modelCallId,receipt,actual,pageErrors:f.errors})
  if(evidence)await f.page.screenshot({path:resolve(evidence,'main-bridge-'+inlineOrder+'.png')})
  const content=actual.blocks.map((block:any)=>block.id==='old-failed'?'old-failed':block.type==='research'?'new-component':block.text)
  expect(content).toEqual(inlineOrder==='before-components'?['上方保留段落','old-failed',...prose,'new-component','下方保留段落']:['上方保留段落','old-failed','new-component',...prose,'下方保留段落'])
  expect(actual.proposals.find((value:any)=>value.id===parent.requestId)?.error).toBeFalsy()
  expect(await f.page.locator('.en-space-ai-summary').innerText()).toContain('1个组件')
  await f.page.evaluate(()=>(window as any).editor.updateBlock('lower',{content:'生成后用户补写的下方正文'}))
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click()
  await expect.poll(()=>f.page.evaluate(()=>(window as any).editor.document.map((block:any)=>block.id))).toEqual(['upper','old-failed','anchor','lower'])
  expect(await f.page.evaluate(()=>JSON.parse((window as any).editor.getBlock('old-failed').props.payload))).toEqual(previousFailed)
  expect(await f.page.locator('.bn-editor').innerText()).toContain('生成后用户补写的下方正文');expect(f.errors).toEqual([])
 }finally{await f.close()}
},25000)

it('returns a genuine failed child receipt across the Main bridge without marking either failed card successful',async()=>{
 const f=await open();try{
  const parent=await launch(f.page),modelCallId='req-demo-table-failure',call=await startCapability(f,parent,modelCallId)
  await f.page.evaluate((id:string)=>(window as any).jobs[id].reject(Error('合成子组件生成失败：没有有效表格')),call.child.requestId)
  const receipt=await call.receipt
  expect(receipt.requestId).toBe(modelCallId);expect(receipt.requestId).not.toBe(call.transport.requestId);expect(receipt.status).toBe('failed');expect(receipt.effect?.state).toBe('placeholder')
  await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'conversation',markdown:'已完成',capabilityReceipts:[receipt]}),{id:parent.requestId,receipt})
  const input=f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true});await input.waitFor();expect(await input.inputValue()).toBe(prompt)
  expect(await f.page.locator('.en-space-ai-message,.en-space-ai [role="alert"]').count()).toBe(0);expect(await f.page.locator('.en-space-ai').innerText()).not.toContain('没有有效表格')
  expect(await f.page.locator('.en-space-ai-result-actions,.en-inline-ai-pending').count()).toBe(0)
  const actual=await snapshot(f.page);record('main-bridge-failed-child',{transportRequestId:call.transport.requestId,modelCallId,receipt,actual,pageErrors:f.errors})
  expect(actual.blocks.filter((block:any)=>block.type==='research').map((block:any)=>block.status)).toEqual(['failed','failed'])
  expect(actual.blocks.find((block:any)=>block.id==='upper')?.text).toBe('上方保留段落');expect(actual.blocks.find((block:any)=>block.id==='lower')?.text).toBe('下方保留段落');expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it('keeps a successful child pending when its parent still requires a reply and a real paragraph click follows',async()=>{
 const f=await open();try{
  const parent=await launch(f.page),call=await startCapability(f,parent,'req-demo-table-partial-parent')
  await f.page.evaluate(({id,node}:any)=>(window as any).jobs[id].resolve({kind:'component',node}),{id:call.child.requestId,node:tableNode})
  const receipt=await call.receipt;expect(receipt.status).toBe('succeeded');expect(receipt.effect?.state).toBe('saved')
  await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'conversation',markdown:'正文尚未完成。',requiresReply:true,capabilityReceipts:[receipt]}),{id:parent.requestId,receipt})
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).waitFor()
  const before=await snapshot(f.page),partial=before.proposals.find((value:any)=>value.id===parent.requestId)
  expect(partial?.resultKind).toBe('conversation')
  expect(partial?.summary).toContain('未完成')
  expect(await f.page.locator('.en-space-ai .en-space-ai-message,.en-space-ai [role="alert"]').count()).toBe(0)
  await f.page.locator('.bn-block-outer[data-id="lower"] .bn-inline-content').click();await f.page.keyboard.type('【继续编辑】')
  // Let the actual click handler and its queued passive settlement both run.
  // No synthetic dispatch or immediate negative assertion can skip that frame.
  await f.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  const after=await snapshot(f.page)
  record('main-bridge-partial-parent',{transportRequestId:call.transport.requestId,modelCallId:receipt.requestId,receipt,before,after,pageErrors:f.errors})
  expect(after.proposals.some((value:any)=>value.id===parent.requestId)).toBe(true)
  expect(after.proposals.find((value:any)=>value.id===parent.requestId)?.error).toBeTruthy()
  expect(await f.page.locator('.en-inline-ai-pending').count()).toBe(1)
  expect(after.blocks.find((block:any)=>block.id===receipt.blockId)?.status).toBe('completed')
  expect(after.blocks.find((block:any)=>block.id==='lower')?.text).toContain('【继续编辑】')
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click()
  await expect.poll(()=>f.page.evaluate(()=>(window as any).editor.document.map((block:any)=>block.id))).toEqual(['upper','old-failed','anchor','lower'])
  expect(await f.page.locator('.bn-block-outer[data-id="lower"]').textContent()).toContain('【继续编辑】');expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)


it('keeps the demand box input-only through failure with no visual or accessible error space',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>{const e=(window as any).editor;e.focus();e.setTextCursorPosition('anchor','start')});await f.page.keyboard.press('Space')
  const input=f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true});await input.fill(prompt)
  const before=await f.page.locator('.en-space-ai').boundingBox();await input.press('Enter')
  await f.page.getByRole('button',{name:'停止',exact:true}).waitFor();expect(await f.page.locator('.en-space-ai textarea').count()).toBe(0)
  await f.page.evaluate(()=>(Object.values((window as any).jobs)[0] as any).reject(Error('不应出现在输入框的内部诊断')))
  await input.waitFor();expect(await input.inputValue()).toBe(prompt)
  expect(await f.page.locator('.en-space-ai [role="alert"],.en-space-ai-message,.en-space-ai-summary,.en-space-ai .en-error').count()).toBe(0)
  const accessible=await f.page.locator('.en-space-ai').ariaSnapshot();expect(accessible).not.toContain('内部诊断');expect(accessible).not.toContain('alert')
  const after=await f.page.locator('.en-space-ai').boundingBox();expect(Math.abs(after.height-before.height)).toBeLessThanOrEqual(1)
  expect(await f.page.locator('.en-space-ai textarea,.en-space-ai button').count()).toBe(2);expect(await f.page.evaluate(()=>(window as any).tasks.some((task:any)=>task.phase==='failed'&&task.error?.includes('内部诊断')))).toBe(true);record('input-only-failure',{accessible,before,after,pageErrors:f.errors});if(evidence)await f.page.screenshot({path:resolve(evidence,'input-only-failure.png')});expect(f.errors).toEqual([])
 }finally{await f.close()}
})

it.each(['owned','confirmed','clickaway','mixed','mixed-modified','modified','aba','foreign','reused','cancelled','readonly','deleted-anchor','recreated-anchor','ordinary-text','successful-receipt'])('places useful fallback prose below the demand and protects %s failed slots through the real Main bridge',async variant=>{
 const f=await open();try{
  let parent=await launch(f.page),call=await startCapability(f,parent,'req-fallback-'+variant)
  if(variant==='reused'){
   await f.page.evaluate((id:string)=>(window as any).jobs[id].reject(Error('原请求失败，但旧占位必须保留')),call.child.requestId)
   const prior=await call.receipt
   await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'conversation',markdown:'组件未完成',capabilityReceipts:[receipt]}),{id:parent.requestId,receipt:prior})
   await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).press('Enter');await expect.poll(()=>f.page.evaluate(()=>Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='inline').length)).toBe(2)
   parent=await f.page.evaluate(()=>(Object.values((window as any).jobs).filter((job:any)=>job.input.entryPoint==='inline').at(-1) as any).input)
   call=await startCapability(f,parent,'req-fallback-reused-second')
  }
  await f.page.evaluate((id:string)=>(window as any).jobs[id].reject(Error('真实子组件失败，回退文字')),call.child.requestId)
  const receipt=await call.receipt;expect(receipt.status).toBe('failed');expect(receipt.effect?.state).toBe('placeholder')
  if(!receipt.effect||!('blockId'in receipt.effect))throw Error('Expected genuine failed create effect')
  const blockId=receipt.effect.blockId,original=await f.page.evaluate((id:string)=>(window as any).editor.getBlock(id),blockId)
  if(variant==='modified')await f.page.evaluate((id:string)=>{const e=(window as any).editor,b=e.getBlock(id),node=JSON.parse(b.props.payload);e.updateBlock(id,{props:{payload:JSON.stringify({...node,title:'用户改过的失败卡，必须保留'})}})},blockId)
  if(variant==='aba')await f.page.evaluate((block:any)=>{const e=(window as any).editor;e.removeBlocks([block.id]);e.insertBlocks([block],'anchor','before')},original)
  if(variant==='cancelled')await f.page.getByRole('button',{name:'停止',exact:true}).click()
  if(variant==='readonly')await f.page.evaluate(()=>(window as any).editor.isEditable=false)
  if(['deleted-anchor','recreated-anchor'].includes(variant))await f.page.evaluate((recreate:boolean)=>{const e=(window as any).editor,b=e.getBlock('anchor');e.removeBlocks(['anchor']);if(recreate)e.insertBlocks([b],'lower','before')},variant==='recreated-anchor')
  const expectedBefore=await f.page.evaluate((id:string)=>JSON.stringify((window as any).editor.getBlock(id)),blockId)
  let successful:any
  if(['mixed','mixed-modified'].includes(variant)){
   const second=await startCapability(f,parent,'req-fallback-mixed-success')
   await f.page.evaluate(({id,node}:any)=>(window as any).jobs[id].resolve({kind:'component',node}),{id:second.child.requestId,node:tableNode})
   successful=await second.receipt;expect(successful.status).toBe('succeeded')
   if(variant==='mixed-modified')await f.page.evaluate((id:string)=>{const e=(window as any).editor,b=e.getBlock(id),node=JSON.parse(b.props.payload);e.updateBlock(id,{props:{payload:JSON.stringify({...node,title:'人工修改的成功卡必须保留'})}})},successful.blockId)
  }
  const actualReceipt=variant==='foreign'?{...receipt,blockId:'old-failed',effect:{...receipt.effect,blockId:'old-failed'}}:variant==='successful-receipt'?{...receipt,status:'succeeded'}:receipt
  await f.page.evaluate(({id,receipts,flag,mixed}:any)=>(window as any).jobs[id].resolve({kind:'text',markdown:'### 可核验的文字结果\n\n用户数据10、20、15的平均值为15；这些演示值不代表真实行情。',...flag?{textFallback:true}:{},...mixed?{inlineOrder:'before-components'}:{},capabilityReceipts:receipts}),{id:parent.requestId,receipts:[actualReceipt,...successful?[successful]:[]],flag:variant!=='ordinary-text',mixed:['mixed','mixed-modified'].includes(variant)})
  if(['cancelled','readonly','deleted-anchor','recreated-anchor','mixed-modified'].includes(variant)){
   await expect.poll(()=>f.page.locator('.en-space-ai .en-ai-loading').count()).toBe(0)
   await f.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
   expect(await f.page.locator('.bn-editor').innerText()).not.toContain('可核验的文字结果');expect(await f.page.evaluate((id:string)=>JSON.stringify((window as any).editor.getBlock(id)),blockId)).toBe(expectedBefore)
  }else{
   await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).waitFor();expect(await f.page.locator('.bn-editor').innerText()).toContain('用户数据10、20、15的平均值为15')
   expect(await f.page.locator('.en-inline-ai-pending').count()).toBeGreaterThanOrEqual(2);expect(await f.page.locator('.en-space-ai textarea').count()).toBe(0)
   expect(await f.page.locator('.en-space-ai [role="alert"],.en-space-ai-message').count()).toBe(0);expect(await f.page.locator('.en-space-ai').innerText()).not.toContain('平均值为15')
   if(['owned','confirmed','clickaway','mixed'].includes(variant)){
    expect(await f.page.evaluate((id:string)=>(window as any).editor.getBlock(id),blockId)).toBeUndefined()
    expect(await f.page.locator('.en-space-ai-summary').innerText()).toBe(variant==='mixed'?'已生成文字，部分组件未生成':'已生成文字，组件未生成')
    const actual=await snapshot(f.page);if(variant==='mixed')expect(actual.proposals.find((p:any)=>p.id===parent.requestId)?.error).toContain('真实子组件失败');else expect(actual.proposals.find((p:any)=>p.id===parent.requestId)?.error).toBeFalsy();expect(await f.page.evaluate((id:string)=>(window as any).tasks.find((task:any)=>task.requestId===id&&task.phase==='ready')?.result.capabilityReceipts.find((receipt:any)=>receipt.status==='failed')?.message,parent.requestId)).toContain('真实子组件失败');record('fallback-'+variant,{receipt,successful,actual,pageErrors:f.errors});if(evidence)await f.page.screenshot({path:resolve(evidence,'fallback-'+variant+'.png')})
    if(variant==='mixed'){await f.page.locator('.bn-block-outer[data-id="lower"] .bn-inline-content').click();await f.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(await f.page.evaluate((id:string)=>(window as any).noteDoc.getMap('note-inline-proposals').has(id),parent.requestId)).toBe(true);expect(await f.page.evaluate((id:string)=>(window as any).tasks.some((task:any)=>task.requestId===id&&task.phase==='accepted'),parent.requestId)).toBe(false)}
    await f.page.evaluate(async()=>{const w=window as any;await w.fixture.flush();w.fixture.reopen()});await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).waitFor()
    expect(await f.page.locator('.en-space-ai-summary').innerText()).toBe(variant==='mixed'?'已生成文字，部分组件未生成':'已生成文字，组件未生成');expect(await f.page.locator('.en-inline-ai-pending').count()).toBeGreaterThanOrEqual(2)

    if(variant==='confirmed'||variant==='clickaway'){
     if(variant==='clickaway')await f.page.locator('.bn-block-outer[data-id="lower"] .bn-inline-content').click();else await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).click();await expect.poll(()=>f.page.locator('.en-space-ai,.en-inline-ai-pending').count()).toBe(0);expect(await f.page.locator('.bn-editor').innerText()).toContain('可核验的文字结果')
    }else{await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click();await expect.poll(()=>f.page.evaluate(()=>(window as any).editor.document.map((b:any)=>b.id))).toEqual(['upper','old-failed','anchor','lower'])}
    expect(await f.page.evaluate(({id,phase}:any)=>(window as any).tasks.some((task:any)=>task.requestId===id&&task.phase===phase),{id:parent.requestId,phase:['confirmed','clickaway'].includes(variant)?'accepted':'discarded'})).toBe(true)
   }else{
    expect(await f.page.evaluate((id:string)=>JSON.stringify((window as any).editor.getBlock(id)),blockId)).toBe(expectedBefore)
    if(variant!=='ordinary-text')expect(await f.page.locator('.en-space-ai-summary').innerText()).toBe('已生成文字，组件未生成；原组件内容已保留')
    if(['modified','aba'].includes(variant)){await f.page.locator('.bn-block-outer[data-id="lower"] .bn-inline-content').click();await f.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(await f.page.evaluate((id:string)=>(window as any).noteDoc.getMap('note-inline-proposals').has(id),parent.requestId)).toBe(true);expect(await f.page.evaluate((id:string)=>(window as any).tasks.some((task:any)=>task.requestId===id&&task.phase==='accepted'),parent.requestId)).toBe(false);await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click();expect(await f.page.evaluate((id:string)=>JSON.stringify((window as any).editor.getBlock(id)),blockId)).toBe(expectedBefore)}
   }
  }
  expect(await f.page.evaluate(()=>JSON.parse((window as any).editor.getBlock('old-failed').props.payload))).toEqual(previousFailed);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)


it('shows only generated prose for a trusted format-only fallback with no failed create receipt',async()=>{
 const f=await open();try{
  const parent=await launch(f.page)
  await f.page.evaluate((id:string)=>(window as any).jobs[id].resolve({kind:'text',textFallback:true,markdown:'用户数据仅能支持这段有用的来源核验正文。',capabilityReceipts:[]}),parent.requestId)
  await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).waitFor();expect(await f.page.locator('.en-space-ai-summary').innerText()).toBe('已生成文字')
  expect(await f.page.locator('.bn-editor').innerText()).toContain('有用的来源核验正文');expect(await f.page.locator('.en-inline-ai-pending').count()).toBe(1)
  expect((await snapshot(f.page)).proposals.find((value:any)=>value.id===parent.requestId)?.error).toBeFalsy()
  await f.page.locator('.bn-block-outer[data-id="lower"] .bn-inline-content').click();await expect.poll(()=>f.page.locator('.en-space-ai,.en-inline-ai-pending').count()).toBe(0)
  expect(await f.page.evaluate((id:string)=>(window as any).tasks.some((task:any)=>task.requestId===id&&task.phase==='accepted'),parent.requestId)).toBe(true)
  expect(await f.page.evaluate(()=>JSON.parse((window as any).editor.getBlock('old-failed').props.payload))).toEqual(previousFailed);expect(f.errors).toEqual([])
 }finally{await f.close()}
})


it('keeps a save-failed pure fallback pending on clickaway and confirms only after an explicit successful retry',async()=>{
 const f=await open();try{
  const parent=await launch(f.page),call=await startCapability(f,parent,'req-save-failed-pure-fallback')
  await f.page.evaluate((id:string)=>(window as any).jobs[id].reject(Error('真实子组件失败')),call.child.requestId);const receipt=await call.receipt;expect(receipt.status).toBe('failed')
  await f.page.evaluate(({id,receipt}:any)=>(window as any).jobs[id].resolve({kind:'text',textFallback:true,markdown:'这段文字需要真实保存后才可完成确认。',capabilityReceipts:[receipt]}),{id:parent.requestId,receipt})
  await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).waitFor();await f.page.evaluate(()=>(window as any).failSaves=true)
  await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).click()
  await expect.poll(()=>f.page.evaluate((id:string)=>(window as any).noteDoc.getMap('note-inline-proposals').get(id)?.error,parent.requestId)).toContain('尚未保存')
  await f.page.evaluate(()=>(window as any).failSaves=false);await f.page.locator('.bn-block-outer[data-id="lower"] .bn-inline-content').click();await f.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  expect(await f.page.evaluate((id:string)=>(window as any).noteDoc.getMap('note-inline-proposals').has(id),parent.requestId)).toBe(true)
  expect(await f.page.evaluate((id:string)=>(window as any).tasks.some((task:any)=>task.requestId===id&&task.phase==='accepted'),parent.requestId)).toBe(false)
  expect(await f.page.locator('.en-inline-ai-pending').count()).toBe(1);expect(await f.page.locator('.en-space-ai [role="alert"]').count()).toBe(0)
  await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).click();await expect.poll(()=>f.page.locator('.en-space-ai,.en-inline-ai-pending').count()).toBe(0)
  expect(await f.page.evaluate((id:string)=>(window as any).tasks.some((task:any)=>task.requestId===id&&task.phase==='accepted'),parent.requestId)).toBe(true);expect(await f.page.locator('.bn-editor').innerText()).toContain('真实保存后才可完成确认');expect(f.errors).toEqual([])
 }finally{await f.close()}
})
