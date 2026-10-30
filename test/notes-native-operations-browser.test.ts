import {afterAll,beforeAll,expect,it,vi} from 'vitest'
import {createServer} from 'node:http'
import {Session} from '@deepseek-ai/dsh-session'
// @ts-expect-error runtime module is JavaScript and has no declaration file.
import {registerNoteSessions,noteConversationRows} from '../packages/dsh-research-task-runtime/notes-session.js'
import {installNotesService} from '../src/main/notes/service'
vi.mock('electron',()=>({BrowserWindow:class{},dialog:{showSaveDialog:async()=>({canceled:true})}}))
import {dirname,resolve} from 'node:path'
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {NotesStore} from '../src/main/notes/store'
import {NotesCapabilityBridge} from '../src/main/notes/capability-bridge'
import {pathToFileURL} from 'node:url'
import {build,type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'

let browser:any,script='';const metrics:any[]=[]
const entry='\0native-note-operations-fixture'
beforeAll(async()=>{
 const config=(await resolveConfig({configFile:resolve('electron.vite.config.ts'),logLevel:'silent'},'build','production')).config!.preload!
 const fixture:Plugin={name:'native-note-operations-fixture',resolveId:id=>id===entry?entry:undefined,load:id=>id===entry?`
 import {noteInlineBlockIdentity} from ${JSON.stringify(resolve('src/preload/notes/inline-ai.ts'))}; window.identity=id=>noteInlineBlockIdentity(window.editor,id); import React from 'react';import {createRoot} from 'react-dom/client';import {NotesApp} from ${JSON.stringify(resolve('src/preload/notes/editor.tsx'))};
 import '@blocknote/mantine/style.css';import ${JSON.stringify(resolve('src/preload/notes/style.css'))};import ${JSON.stringify(resolve('src/preload/notes/challenge.css'))};
 window.armNativeTiming=dimension=>{let observer;const submit=()=>{window.fastTiming={submitAt:performance.now(),dimension};observer=new MutationObserver(()=>{const table=document.querySelector('.bn-editor table'),cells=table?.querySelectorAll('td');if(cells?.length===dimension*dimension&&table.getBoundingClientRect().width>0&&table.getBoundingClientRect().height>0){window.fastTiming.visibleAt=performance.now();window.fastTiming.visibleCells=[...cells].filter(cell=>{const r=cell.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth}).length;observer.disconnect()}});observer.observe(document.querySelector('.bn-editor'),{childList:true,subtree:true})};const key=e=>{if(e.key==='Enter'&&!e.shiftKey&&e.target.matches('.en-space-ai textarea')){document.removeEventListener('keydown',key,true);document.removeEventListener('sherlock:notes-submit',side,true);submit()}},side=()=>{document.removeEventListener('keydown',key,true);document.removeEventListener('sherlock:notes-submit',side,true);submit()};document.addEventListener('keydown',key,true);document.addEventListener('sherlock:notes-submit',side,true)};
 window.calls=[];window.saved={title:'原生操作验收',blocks:[{id:'before',type:'paragraph',content:'保留前段'},{id:'anchor',type:'paragraph'},{id:'after',type:'paragraph',content:'保留后段'}],yjs:'',revision:0,updatedAt:0};
 const bridge={request:async(method,input)=>{window.calls.push({method,input});if(method==='load'){const loaded=await window.nativeStore(method,input);window.saved=loaded.saved;return loaded}if(method==='save'){if(window.failSave)throw Error('保存失败样本');const result=await window.nativeStore(method,input);if(window.holdSaveAck&&input.content.blocks.some(block=>block.type==='table'))await new Promise(resolve=>window.releaseSaveAck=resolve);if(result.status==='saved'){window.saved=result.saved;if(window.fastTiming?.submitAt&&result.saved.blocks.some(b=>b.type==='table'&&b.content.rows.length===window.fastTiming.dimension&&b.content.rows[0].cells.length===window.fastTiming.dimension))window.fastTiming.saveAckAt??=performance.now()}return result}if(method==='capability-reply'){if(window.holdNativeEffect&&input.effect?.state==='applied')await new Promise(resolve=>window.releaseNativeEffect=resolve);return window.mainCapabilityReply(input)}if(method==='capability-ready'){if(window.holdNativeAdmission)await new Promise(resolve=>window.releaseNativeAdmission=resolve);return window.hostNativeReady(input,!!window.nativeReadOnly)}if(method==='native-table'||method==='conversation-state'||method==='conversation-load'||method==='stop')return window.hostNativeRequest(method,input);if(method==='generate')return new Promise(resolve=>window.modelResolve=resolve);if(method==='library-list')return[];return{}},draft:async input=>{window.pendingDraft=input;await window.nativeStore('draft',input)}};
 const root=createRoot(document.querySelector('#root'));window.reopen=()=>{root.unmount();const next=document.createElement('div');document.body.append(next);createRoot(next).render(React.createElement(NotesApp,{sessionId:'native-fixture',bridge,dark:false,navigate(){}}))};root.render(React.createElement(NotesApp,{sessionId:'native-fixture',bridge,dark:false,navigate(){}}));
 `:undefined,transform(code,id){if(id.endsWith('/preload/notes/editor.tsx'))return code.replace('  const slashMenu = useMemo','  window.editor=editor;window.ledger=proposals; const slashMenu = useMemo')}}
 const output=await build({...config,configFile:false,plugins:[...(config.plugins||[]),fixture],build:{...config.build,write:false,rollupOptions:{...config.build?.rollupOptions,input:entry}}})
 script=(Array.isArray(output)?output:[output]).flatMap(x=>'output'in x?x.output:[]).filter(x=>x.type==='chunk').map(x=>x.code).join('\n')
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},90000)
afterAll(async()=>{await browser?.close();if(process.env.SHERLOCK_NATIVE_OPS_METRICS)writeFileSync(process.env.SHERLOCK_NATIVE_OPS_METRICS,JSON.stringify(metrics,null,2)+'\n')})
async function open(){
 const root=mkdtempSync(resolve(tmpdir(),'notes-native-operations-')),store=new NotesStore(root);store.save('fixture','native-fixture',0,{title:'原生操作验收',blocks:[{id:'before',type:'paragraph',content:'保留前段'},{id:'anchor',type:'paragraph'},{id:'after',type:'paragraph',content:'保留后段'}],yjs:''},'seed')
 const context=await browser.newContext({viewport:{width:1200,height:900}}),page=await context.newPage(),errors:string[]=[]
 const main=new NotesCapabilityBridge(value=>{void page.evaluate((input:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:input})),value)})
 let session=Session.create('native-fixture' as any);let runtimeHandler:any,historyWritable=true;const historyPath=resolve(root,'sdk-session.json')
 const disposeRuntime=registerNoteSessions({sessions:{get:(id:string)=>id==='native-fixture'?session:undefined,flush:async(current:any)=>{if(!historyWritable)return false;writeFileSync(historyPath,JSON.stringify({header:current.header,events:current.events}));return true}},sessionTitle:{rename:(current:any,title:string)=>{current.append('session/title',{title});return{title}}},webServer:{register:(route:any)=>{runtimeHandler=route.handler;return()=>{}}}},{isTrustedRequest:()=>true,readJsonBody:async(req:any)=>req.body})
 const server=createServer(async(req,res)=>{try{let body='';for await(const chunk of req)body+=chunk;await runtimeHandler({method:req.method,body:JSON.parse(body)},res)}catch(error){res.writeHead(500);res.end(JSON.stringify({error:String(error)}))}});await new Promise<void>(done=>server.listen(0,'127.0.0.1',done))
 let handler:any,writable=true
 const hostWindow={isDestroyed:()=>false,webContents:{mainFrame:{processId:1,routingId:2},send:(channel:string,input:any)=>{if(channel==='notes:capability-action')void page.evaluate((input:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:input})),input)}}}
 const disposeService=installNotesService({ipcMain:{handle:(_name:string,fn:any)=>{handler=fn},removeHandler(){}},root,getWindow:()=>hostWindow,owner:()=> 'fixture',canRead:()=>true,canWrite:()=>writable,runtimeUrl:()=> 'http://127.0.0.1:'+(server.address() as any).port,clipboard:()=>undefined})
 const event={sender:hostWindow.webContents,senderFrame:hostWindow.webContents.mainFrame},host=(method:string,input:any)=>handler(event,method,{owner:'fixture',sessionId:'native-fixture',...input})
 await page.exposeFunction('hostNativeRequest',host);await page.exposeFunction('hostNativeReady',(input:any,readOnly:boolean)=>{writable=!readOnly;return host('capability-ready',input)})
 await page.exposeFunction('mainCapabilityReply',(input:any)=>{const reply=main.respond(input,'fixture');return reply.ok?reply:host('capability-reply',input)});await page.exposeFunction('nativeStore',(method:string,input:any)=>host(method,input))
 page.on('pageerror',(error:Error)=>errors.push(error.message))
 await page.route('https://native-note.test/**',(route:any)=>route.fulfill({contentType:'text/html',body:'<!doctype html><body data-workspace-surface="notes"><header data-ework-notes-session="native-fixture"></header><section class="en-root"><div id="root" class="en-editor-host"></div></section></body>'}));await page.goto('https://native-note.test/');await page.addScriptTag({content:'var exports={};\n'+script});await page.locator('.bn-editor').waitFor()
 await page.evaluate(()=>{const w=window as any;w.editor.replaceBlocks(w.editor.document,w.saved.blocks);w.editor.focus();w.editor.setTextCursorPosition('anchor','start')})
 return{page,context,errors,store,main,session,host,setHistoryWritable:(value:boolean)=>{historyWritable=value},history:()=>noteConversationRows(session),restartHistory:()=>{const value=JSON.parse(readFileSync(historyPath,'utf8'));session=Session.fromRestore('native-fixture' as any,value.events,value.header)},async close(){main.dispose();disposeService();disposeRuntime();await new Promise<void>(done=>server.close(()=>done()));await context.close();rmSync(root,{recursive:true,force:true})}}
}
it.each([{entry:'space',size:8},{entry:'sidebar',size:8},{entry:'space',size:3},{entry:'sidebar',size:3}])('creates a directly editable native $size by $size table without a model or child through $entry',async({entry,size})=>{
 const f=await open();try{
  await f.page.evaluate((size:number)=>(window as any).armNativeTiming(size),size)
  if(entry==='space'){await f.page.keyboard.press('Space');await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).fill(`创建一个${size}乘${size}的表格`);await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).press('Enter')}
  else await f.page.evaluate((size:number)=>document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'native-fixture',prompt:`创建一个${size}乘${size}的表格`,images:[]}})),size)
  await expect.poll(()=>f.page.evaluate(()=>(window as any).editor.document.filter((b:any)=>b.type==='table').length),{timeout:2500}).toBe(1)
  const state=await f.page.evaluate(()=>{const w=window as any;return{blocks:w.editor.document,model:w.calls.filter((x:any)=>x.method==='generate').length}}),table=state.blocks.find((b:any)=>b.type==='table')
  await expect.poll(()=>f.page.evaluate(()=>(window as any).fastTiming?.saveAckAt)).toBeTruthy();const timing=await f.page.evaluate(()=>{const w=window as any,{submitAt,visibleAt,saveAckAt,visibleCells}=w.fastTiming;return{visibleCells,visibleMs:visibleAt-submitAt,savedMs:saveAckAt-submitAt,generateIpc:w.calls.filter((row:any)=>row.method==='generate').length,modelRequests:w.calls.filter((row:any)=>row.method==='generate').length,childRequests:w.calls.filter((row:any)=>row.method==='generate'&&row.input?.mode==='component').length}});expect(timing.visibleCells).toBe(size*size);expect(timing.visibleMs).toBeGreaterThanOrEqual(0);expect(timing.visibleMs).toBeLessThan(1000);expect(timing.generateIpc).toBe(0);expect(timing.modelRequests).toBe(0);expect(timing.childRequests).toBe(0);metrics.push({entry,...timing,rows:size,columns:size,cells:size*size,editable:true});if(process.env.SHERLOCK_NATIVE_OPS_METRICS)await f.page.screenshot({path:resolve(dirname(process.env.SHERLOCK_NATIVE_OPS_METRICS),entry+'-native-'+size+'x'+size+'.png')})
  expect(state.model).toBe(0);expect(state.blocks.some((b:any)=>b.type==='research')).toBe(false);expect(table.content.rows).toHaveLength(size);expect(table.content.rows.every((r:any)=>r.cells.length===size&&r.cells.every((c:any)=>(Array.isArray(c)?c:c.content).length===0))).toBe(true)
  expect(state.blocks[0].id).toBe('before');expect(state.blocks.at(-1).id).toBe('after')
  await f.page.locator('.bn-editor td p').first().click();await f.page.keyboard.type('真实可编辑');await expect.poll(()=>f.page.locator('.bn-editor table').textContent()).toContain('真实可编辑');await f.page.locator('.bn-editor td p').last().click();await f.page.keyboard.type('末格也保存');await f.page.keyboard.press('Meta+s');await expect.poll(()=>JSON.stringify(f.store.load('fixture','native-fixture').saved.blocks)).toContain('末格也保存');await expect.poll(()=>f.store.load('fixture','native-fixture').draft).toBeUndefined();await f.page.evaluate(()=>(window as any).reopen());await f.page.locator('.bn-editor table').waitFor();expect(await f.page.locator('.bn-editor table').textContent()).toContain('真实可编辑');expect(await f.page.locator('.bn-editor table').textContent()).toContain('末格也保存');expect(f.errors).toEqual([]);expect(f.history()).toHaveLength(1);expect(f.history()[0]).toMatchObject({prompt:`创建一个${size}乘${size}的表格`,phase:'ready',result:{capabilityReceipts:[{capability:'notes.blocks.apply',effect:{state:'saved'}}]}});expect((await f.host('conversation-load',{})).rows).toEqual(f.history())
 }finally{await f.close()}
},15000)

async function parentRequest(page:any){
 const count=await page.evaluate(()=>(window as any).calls.filter((x:any)=>x.method==='generate').length)
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'native-fixture',prompt:'按当前真实块编辑这份笔记',images:[]}})))
 await expect.poll(()=>page.evaluate(()=>(window as any).calls.filter((x:any)=>x.method==='generate').length)).toBe(count+1)
 return page.evaluate(()=>(window as any).calls.filter((x:any)=>x.method==='generate').at(-1).input)
}
async function capability(page:any,parent:any,action:string,args:any,id='native-'+Math.random()){
 await page.evaluate(({parent,action,args,id}:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:{sessionId:'native-fixture',generationId:parent.requestId,requestId:id,context:{documentId:parent.capabilityContext.documentId},action,args}})),{parent,action,args,id})
 await expect.poll(()=>page.evaluate((id:string)=>(window as any).calls.filter((x:any)=>x.method==='capability-reply'&&x.input.requestId===id&&('result'in x.input||'error'in x.input)).length,id)).toBeGreaterThan(0)
 return page.evaluate((id:string)=>(window as any).calls.find((x:any)=>x.method==='capability-reply'&&x.input.requestId===id&&('result'in x.input||'error'in x.input)).input,id)
}
it('reads real native blocks and updates content through the admitted capability executor',async()=>{
 const f=await open();try{
  const parent=await parentRequest(f.page),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'})
  expect(read.error).toBeUndefined();expect(read.result?.status).toBe('succeeded');expect(read.result.data.blocks.map((x:any)=>x.block.id)).toEqual(['before','anchor','after'])
  const applied=await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'update',blockId:'before',block:{content:'AI原生修改'}}]})
  expect(applied.error).toBeUndefined();expect(applied.result?.status).toBe('succeeded');expect(await f.page.locator('.bn-editor').textContent()).toContain('AI原生修改')
  await f.page.evaluate((receipt:any)=>(window as any).modelResolve({kind:'conversation',markdown:'',capabilityReceipts:[{...receipt,capability:'notes.blocks.apply'}]}),applied.result)
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click();await expect.poll(()=>f.page.locator('.bn-editor').textContent()).toContain('保留前段');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('preflights the entire native batch, deduplicates a real request, and rejects an old read or same-id Yjs replacement',async()=>{
 const f=await open();try{
  const parent=await parentRequest(f.page),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'}),revision=read.result.data.revision
  const invalid=await capability(f.page,parent,'notes.blocks.apply',{revision,operations:[{op:'update',blockId:'before',block:{content:'不得部分落盘'}},{op:'insert',anchor:{blockId:'missing',placement:'after'},blocks:[{type:'paragraph',content:'错位'}]}]})
  expect(invalid.error).toContain('范围');expect(await f.page.locator('.bn-editor').textContent()).not.toContain('不得部分落盘')
  const args={revision,operations:[{op:'insert',anchor:{blockId:'anchor',placement:'before'},blocks:[{type:'codeBlock',props:{language:'javascript'},content:'const x = 1;'}]}]},first=await capability(f.page,parent,'notes.blocks.apply',args,'same-operation')
  expect(first.result.status).toBe('succeeded');const count=await f.page.evaluate(()=>(window as any).editor.document.length)
  const duplicate=await capability(f.page,parent,'notes.blocks.apply',args,'same-operation-duplicate-transport')
  expect(duplicate.error).toContain('修订');expect(await f.page.evaluate(()=>(window as any).editor.document.length)).toBe(count)
  // The same actual transport request never applies twice; clear the captured
  // acknowledgement only, not the executor cache or editor state.
  await f.page.evaluate(()=>{const w=window as any;w.calls=w.calls.filter((x:any)=>x.input?.requestId!=='same-operation')})
  const repeated=await capability(f.page,parent,'notes.blocks.apply',args,'same-operation');expect(repeated.result.effect).toEqual(first.result.effect);expect(await f.page.evaluate(()=>(window as any).editor.document.length)).toBe(count)
  const fresh=await capability(f.page,parent,'notes.blocks.read',{scope:'note'})
  const abaFacts=await f.page.evaluate(()=>{const w=window as any,e=w.editor,b=JSON.parse(JSON.stringify(e.getBlock('before'))),before=JSON.stringify(e.document),identity=w.identity('before');e.removeBlocks(['before']);e.insertBlocks([b],e.document[0].id,'before');return{sameValue:JSON.stringify(e.document)===before,sameIdentity:w.identity('before')===identity}});expect(abaFacts).toEqual({sameValue:true,sameIdentity:false})
  const aba=await capability(f.page,parent,'notes.blocks.apply',{revision:fresh.result.data.revision,operations:[{op:'update',blockId:'before',block:{content:'不得写入新身份'}}]})
  expect(aba.error).toContain('身份');expect(await f.page.locator('.bn-editor').textContent()).not.toContain('不得写入新身份');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('moves, removes and inserts native list/code in one transaction, then undoes only the current action after save and reopen',async()=>{
 const f=await open();try{
  const parent=await parentRequest(f.page),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'})
  const applied=await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'move',blockIds:['before'],anchor:{blockId:'after',placement:'after'}},{op:'remove',blockIds:['anchor']},{op:'insert',anchor:{blockId:'before',placement:'before'},blocks:[{id:'new-list',type:'bulletListItem',content:'待办条目'},{id:'new-code',type:'codeBlock',content:'console.log(1)'}]}]})
  expect(applied.error).toBeUndefined();expect(applied.result.status).toBe('succeeded')
  await f.page.evaluate((receipt:any)=>(window as any).modelResolve({kind:'conversation',markdown:'',capabilityReceipts:[{...receipt,capability:'notes.blocks.apply'}]}),applied.result)
  await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).waitFor();await expect.poll(()=>f.page.evaluate(()=>(window as any).saved.blocks.map((b:any)=>b.id))).toEqual(['after','new-list','new-code','before'])
  await f.page.keyboard.press('Meta+s');await expect.poll(()=>f.store.load('fixture','native-fixture').draft).toBeUndefined();await f.page.evaluate(()=>(window as any).reopen());await f.page.locator('.bn-editor').waitFor();await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click()
  await expect.poll(()=>f.page.evaluate(()=>(window as any).editor.document.map((b:any)=>b.id))).toEqual(['before','anchor','after']);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('keeps filled table requests on normal planning, preserves human edits, and leaves a failed save as a real pending draft',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'native-fixture',prompt:'创建8×8表格，填入上文收入数据',images:[]}})))
  await expect.poll(()=>f.page.evaluate(()=>(window as any).calls.filter((x:any)=>x.method==='generate').length)).toBe(1)
  expect(await f.page.evaluate(()=>(window as any).editor.document.some((b:any)=>b.type==='table'))).toBe(false)
  const parent=await f.page.evaluate(()=>(window as any).calls.find((x:any)=>x.method==='generate').input),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'})
  await f.page.evaluate(()=>(window as any).failSave=true)
  const applied=await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'update',blockId:'before',block:{content:'AI更新'}}]})
  expect(applied.result.status).toBe('failed');expect(applied.result.effect.state).toBe('applied')
  await f.page.evaluate((receipt:any)=>(window as any).modelResolve({kind:'conversation',markdown:'',requiresReply:true,capabilityReceipts:[{...receipt,capability:'notes.blocks.apply'}]}),applied.result)
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).waitFor();expect(await f.page.evaluate(()=>(window as any).ledger.list()[0].error)).toBeTruthy()
  await f.page.evaluate(()=>{(window as any).editor.updateBlock('before',{content:'人工后续修改'})})
  expect(await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).isDisabled()).toBe(true);expect(await f.page.locator('.bn-editor').textContent()).toContain('人工后续修改');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('uses the real read/apply/undo capability path across requests and refuses a cancelled target before writing',async()=>{
 const f=await open();try{
  const parent=await parentRequest(f.page),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'}),applied=await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'update',blockId:'before',block:{content:'本轮原生更新'}}]})
  await f.page.evaluate((receipt:any)=>(window as any).modelResolve({kind:'conversation',markdown:'',capabilityReceipts:[{...receipt,capability:'notes.blocks.apply'}]}),applied.result)
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).waitFor()
  const next=await parentRequest(f.page),fresh=await capability(f.page,next,'notes.blocks.read',{scope:'note'}),action=fresh.result.data.actions[0].actionId
  expect(action).toBe(parent.requestId)
  const undone=await capability(f.page,next,'notes.blocks.undo',{revision:fresh.result.data.revision,actionId:action})
  expect(undone.result.status).toBe('succeeded');expect(undone.result.effect.state).toBe('saved');expect(await f.page.locator('.bn-editor').textContent()).toContain('保留前段');expect(await f.page.evaluate(()=>(window as any).ledger.list())).toEqual([])
  const currentRead=await capability(f.page,next,'notes.blocks.read',{scope:'note'})
  await f.page.evaluate((parent:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:{sessionId:'native-fixture',requestId:'cancelled-write',cancel:true}})),next)
  const cancelled=await capability(f.page,next,'notes.blocks.apply',{revision:currentRead.result.data.revision,operations:[{op:'remove',blockIds:['after']}]},'cancelled-write')
  expect(cancelled.error).toContain('取消');expect(await f.page.locator('.bn-editor').textContent()).toContain('保留后段');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('validates native table content without accepting HTML/research props, and keeps the edited table when undo is no longer owned',async()=>{
 const f=await open();try{
  const parent=await parentRequest(f.page),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'})
  const bad=await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'insert',anchor:{blockId:'anchor',placement:'before'},blocks:[{type:'paragraph',props:{payload:'<script>alert(1)</script>'},content:'unsafe'}]}]})
  expect(bad.error).toContain('属性')
  const applied=await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'insert',anchor:{blockId:'anchor',placement:'before'},blocks:[{id:'native-table',type:'table',content:{type:'tableContent',headerRows:1,rows:[{cells:['日期','值']},{cells:['周一','10']}]}}]}]})
  expect(applied.result.status).toBe('succeeded')
  const fresh=await capability(f.page,parent,'notes.blocks.read',{scope:'note'}),updated=await capability(f.page,parent,'notes.blocks.apply',{revision:fresh.result.data.revision,operations:[{op:'update',blockId:'native-table',block:{content:{type:'tableContent',headerRows:1,rows:[{cells:['日期','值']},{cells:['周一','20']}]}}}]})
  expect(updated.result.status).toBe('succeeded');expect(await f.page.locator('table').textContent()).toContain('20')
  await f.page.evaluate((receipt:any)=>(window as any).modelResolve({kind:'conversation',markdown:'',capabilityReceipts:[{...receipt,capability:'notes.blocks.apply'}]}),updated.result)
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).waitFor();await f.page.locator('td p').last().click();await f.page.keyboard.type('人工补充')
  expect(await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).isDisabled()).toBe(true);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('passes native reads and saved edits through the real Main bridge with independent transport UUIDs',async()=>{
 const f=await open();try{
  const parent=await parentRequest(f.page),context:any={owner:'fixture',sessionId:'native-fixture',documentId:parent.capabilityContext.documentId,mode:'notes',editable:true,selectedBlockIds:[],selectedNativeBlockIds:[]},controller=new AbortController()
  const read=await f.main.request('notes.blocks.read',{scope:'note'},context,parent.requestId,controller.signal,()=>true)
  const receipt=await f.main.request('notes.blocks.apply',{revision:read.data.revision,operations:[{op:'update',blockId:'before',block:{content:'真实Main传输原生更新'}}],sourceInstruction:'本次宿主捕获的真实原生需求'},context,parent.requestId,controller.signal,()=>true)
  expect(receipt.status).toBe('succeeded');expect(await f.page.evaluate(()=>(window as any).ledger.list()[0].prompt)).toBe('本次宿主捕获的真实原生需求');expect(receipt.effect).toMatchObject({kind:'native-blocks',state:'saved',actionId:parent.requestId,changedBlockIds:['before']})
  const ids=await f.page.evaluate(()=>(window as any).calls.filter((row:any)=>row.method==='capability-reply').map((row:any)=>row.input.requestId));expect(ids.every((id:string)=>id!==parent.requestId)).toBe(true)
  await f.page.evaluate((receipt:any)=>(window as any).modelResolve({kind:'conversation',markdown:'',capabilityReceipts:[{...receipt,capability:'notes.blocks.apply',requestId:'model-native-operation'}]}),receipt)
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click();await expect.poll(()=>f.page.locator('.bn-editor').textContent()).toContain('保留前段');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('restores a failed native save from the actual local draft and keeps exact Undo after recovery',async()=>{
 const f=await open();try{
  const parent=await parentRequest(f.page),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'})
  await f.page.evaluate(()=>(window as any).failSave=true)
  const applied=await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'update',blockId:'before',block:{content:'草稿中的原生更新'}}]})
  expect(applied.result).toMatchObject({status:'failed',effect:{state:'applied'}})
  await f.page.evaluate((receipt:any)=>(window as any).modelResolve({kind:'conversation',markdown:'',requiresReply:true,capabilityReceipts:[{...receipt,capability:'notes.blocks.apply'}]}),applied.result)
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).waitFor();await expect.poll(()=>f.store.load('fixture','native-fixture').draft?.blocks[0].content[0].text).toBe('草稿中的原生更新')
  await f.page.evaluate(()=>(window as any).reopen());await f.page.getByRole('button',{name:'恢复草稿',exact:true}).waitFor();await f.page.evaluate(()=>(window as any).failSave=false);await f.page.getByRole('button',{name:'恢复草稿',exact:true}).click()
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click();await expect.poll(()=>f.page.locator('.bn-editor').textContent()).toContain('保留前段');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('does not overwrite or claim a saved native batch after a human edits during its real progress acknowledgement',async()=>{
 const f=await open();try{
  const parent=await parentRequest(f.page),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'})
  await f.page.evaluate(()=>(window as any).holdNativeEffect=true)
  const pending=capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'update',blockId:'before',block:{content:'刚应用的AI原生更新'}}]})
  await expect.poll(()=>f.page.locator('.bn-editor').textContent()).toContain('刚应用的AI原生更新')
  await f.page.evaluate(()=>{const w=window as any;w.editor.updateBlock('before',{content:'等待回执时的人工修改'});w.releaseNativeEffect()})
  const result=await pending;expect(result.result).toMatchObject({status:'failed',effect:{state:'applied'}});expect(result.result.message).toContain('较新编辑');expect(await f.page.locator('.bn-editor').textContent()).toContain('等待回执时的人工修改');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it.each([false,true])('keeps nested native move ownership and preserves a later child edit (edited=%s)',async edited=>{
 const f=await open();try{
  await f.page.evaluate(()=>{const e=(window as any).editor;e.updateBlock('before',{children:[{id:'child-one',type:'bulletListItem',content:'子条目一'},{id:'child-two',type:'bulletListItem',content:'子条目二'}]})})
  const parent=await parentRequest(f.page),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'})
  expect(read.result.data.blocks.find((row:any)=>row.block.id==='child-one')).toMatchObject({parentId:'before',index:0})
  const applied=await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'move',blockIds:['child-one'],anchor:{blockId:'after',placement:'before'}}]})
  expect(applied.result.status).toBe('succeeded')
  await f.page.evaluate((receipt:any)=>(window as any).modelResolve({kind:'conversation',markdown:'',capabilityReceipts:[{...receipt,capability:'notes.blocks.apply'}]}),applied.result)
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).waitFor()
  if(edited){await f.page.evaluate(()=>(window as any).editor.updateBlock('child-one',{content:'人工编辑移动后的子条目'}));expect(await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).isDisabled()).toBe(true);expect(await f.page.locator('.bn-editor').textContent()).toContain('人工编辑移动后的子条目')}
  else {await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click();await expect.poll(()=>f.page.evaluate(()=>(window as any).editor.getBlock('before').children.map((block:any)=>block.id))).toEqual(['child-one','child-two']);expect(await f.page.evaluate(()=>(window as any).editor.document.map((block:any)=>block.id))).toEqual(['before','anchor','after'])}
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('restores a native top-level block moved into an existing nested list without duplicating it',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).editor.updateBlock('after',{children:[{id:'nested-target',type:'bulletListItem',content:'原有子条目'}]}))
  const parent=await parentRequest(f.page),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'}),applied=await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'move',blockIds:['before'],anchor:{blockId:'nested-target',placement:'after'}}]})
  expect(applied.result.status).toBe('succeeded');expect(await f.page.evaluate(()=>(window as any).editor.getBlock('after').children.map((block:any)=>block.id))).toEqual(['nested-target','before'])
  await f.page.evaluate((receipt:any)=>(window as any).modelResolve({kind:'conversation',markdown:'',capabilityReceipts:[{...receipt,capability:'notes.blocks.apply'}]}),applied.result)
  await f.page.getByRole('button',{name:'撤销本次 AI 生成',exact:true}).click();await expect.poll(()=>f.page.evaluate(()=>(window as any).editor.document.map((block:any)=>block.id))).toEqual(['before','anchor','after'])
  expect(await f.page.evaluate(()=>(window as any).editor.getBlock('after').children.map((block:any)=>block.id))).toEqual(['nested-target']);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('does not use the deterministic shortcut when Main says the current note is read-only',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).nativeReadOnly=true)
  await f.page.keyboard.press('Space');const input=f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true});await input.fill('创建一个8乘8的表格');await input.press('Enter')
  await expect.poll(()=>f.page.locator('.en-space-ai-working').count()).toBe(0);await f.page.waitForTimeout(80)
  expect(await f.page.evaluate(()=>(window as any).editor.document.some((block:any)=>block.type==='table'))).toBe(false);expect(await f.page.evaluate(()=>(window as any).calls.filter((row:any)=>row.method==='generate').length)).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('does not recapture a deleted or same-ID rebuilt shortcut anchor while Main admission is pending',async()=>{
 const f=await open();try{
  await f.page.keyboard.press('Space');const input=f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true});await input.fill('创建一个3乘3的表格');await f.page.evaluate(()=>(window as any).holdNativeAdmission=true);await input.press('Enter')
  await expect.poll(()=>f.page.evaluate(()=>typeof(window as any).releaseNativeAdmission)).toBe('function')
  await f.page.evaluate(()=>{const w=window as any;w.editor.removeBlocks(['anchor']);w.editor.insertBlocks([{id:'anchor',type:'paragraph',content:'人工重建位置'}],'after','before');w.releaseNativeAdmission()})
  await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).waitFor();expect(await f.page.evaluate(()=>(window as any).editor.document.some((block:any)=>block.type==='table'))).toBe(false);expect(await f.page.locator('.bn-editor').textContent()).toContain('人工重建位置');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it.each(['applied','save-ack'])('keeps native stopping terminal while an %s acknowledgement is pending and retains actual saved facts',async stage=>{
 const f=await open();try{
  await f.page.evaluate((stage:string)=>{const w=window as any;w.phases=[];w.commits=[];document.addEventListener('sherlock:notes-task-state',(event:any)=>w.phases.push(event.detail));document.addEventListener('sherlock:notes-composer-commit',(event:any)=>w.commits.push(event.detail));w.holdNativeEffect=stage==='applied';w.holdSaveAck=stage==='save-ack'},stage)
  await f.page.keyboard.press('Space');const input=f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true});await input.fill('创建一个3乘3的表格');await input.press('Enter')
  await expect.poll(()=>f.page.evaluate((stage:string)=>typeof(window as any)[stage==='applied'?'releaseNativeEffect':'releaseSaveAck'],stage)).toBe('function')
  await f.page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-stop',{detail:{sessionId:'native-fixture'}})))
  await f.page.evaluate((stage:string)=>{const w=window as any;w.holdNativeEffect=false;w.holdSaveAck=false;w[stage==='applied'?'releaseNativeEffect':'releaseSaveAck']()},stage)
  await expect.poll(()=>f.history()[0]?.phase).toBe('stopped')
  await f.page.waitForTimeout(80);const actual=await f.page.evaluate(()=>{const w=window as any;return{phases:w.phases.map((row:any)=>row.phase),commits:w.commits}})
  expect(actual.phases).toEqual(['preparing','stopped']);expect(actual.commits).toEqual([]);expect(f.history()[0].result.capabilityReceipts[0].effect.state).toBe(stage==='save-ack'?'saved':'applied');expect(await f.page.locator('.bn-editor table').count()).toBe(1);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it.each(['accepted','discarded'])('persists a deterministic native request and its %s review in real SDK session history',async phase=>{
 const f=await open();try{
  await f.page.keyboard.press('Space');const input=f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true});await input.fill('创建一个3乘3的表格');await input.press('Enter');await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).waitFor()
  await f.page.getByRole('button',{name:phase==='accepted'?'确认本次 AI 生成':'撤销本次 AI 生成',exact:true}).click();await expect.poll(()=>f.history()[0]?.phase).toBe(phase)
  f.restartHistory();expect((await f.host('conversation-load',{})).rows[0]).toMatchObject({phase,prompt:'创建一个3乘3的表格'});await f.page.evaluate(()=>(window as any).reopen());await f.page.locator('.bn-editor').waitFor();expect((await f.host('conversation-load',{})).rows[0].phase).toBe(phase);expect(await f.page.locator('.bn-editor table').count()).toBe(phase==='accepted'?1:0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('does not restore a stopped request over a new native task or later manual text',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>{const w=window as any;w.holdNativeEffect=true;w.phases=[];w.commits=[];document.addEventListener('sherlock:notes-task-state',(event:any)=>w.phases.push(event.detail));document.addEventListener('sherlock:notes-composer-commit',(event:any)=>w.commits.push(event.detail))})
  await f.page.keyboard.press('Space');const input=f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true});await input.fill('创建一个3乘3的表格');await input.press('Enter');await expect.poll(()=>f.page.evaluate(()=>typeof(window as any).releaseNativeEffect)).toBe('function')
  await f.page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-stop',{detail:{sessionId:'native-fixture'}})))
  await f.page.evaluate(()=>{const w=window as any;w.holdNativeEffect=false;w.editor.updateBlock('after',{content:'停止后的人工正文'});w.editor.setTextCursorPosition('after','end')})
  await f.page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'native-fixture',prompt:'创建一个4乘4的表格',images:[]}})))
  await expect.poll(()=>f.history().find((row:any)=>row.prompt==='创建一个4乘4的表格')?.phase).toBe('ready')
  await f.page.evaluate(()=>(window as any).releaseNativeEffect());await expect.poll(()=>f.history().find((row:any)=>row.prompt==='创建一个3乘3的表格')?.phase).toBe('stopped')
  const result=await f.page.evaluate(()=>{const w=window as any;return{phases:w.phases,commits:w.commits,blocks:w.editor.document,calls:w.calls}})
  const old=f.history().find((row:any)=>row.prompt==='创建一个3乘3的表格'),fresh=f.history().find((row:any)=>row.prompt==='创建一个4乘4的表格')
  expect(result.phases.filter((row:any)=>row.requestId===old.requestId).map((row:any)=>row.phase)).toEqual(['preparing','stopped']);expect(result.phases.filter((row:any)=>row.requestId===fresh.requestId).map((row:any)=>row.phase)).toEqual(['preparing','ready']);expect(result.commits).toHaveLength(1);expect(JSON.stringify(result.blocks)).toContain('停止后的人工正文');expect(result.blocks.filter((block:any)=>block.type==='table')).toHaveLength(2);expect(result.calls.filter((row:any)=>row.method==='generate')).toHaveLength(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('keeps an actual failed native save as applied-only durable history while preserving its editable table',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).failSave=true);await f.page.keyboard.press('Space');const input=f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true});await input.fill('创建一个3乘3的表格');await input.press('Enter')
  await expect.poll(()=>f.history()[0]?.phase).toBe('failed');expect(f.history()[0].result.capabilityReceipts[0]).toMatchObject({status:'failed',effect:{state:'applied'}});expect(await f.page.locator('.bn-editor table').count()).toBe(1)
  f.restartHistory();expect((await f.host('conversation-load',{})).rows[0]).toMatchObject({phase:'failed',prompt:'创建一个3乘3的表格',result:{capabilityReceipts:[{status:'failed',effect:{state:'applied'}}]}})
  await f.page.evaluate(()=>(window as any).failSave=false);await f.page.locator('.bn-editor td p').first().click();await f.page.keyboard.type('失败后保留人工编辑');await f.page.keyboard.press('Meta+s');await expect.poll(()=>JSON.stringify(f.store.load('fixture','native-fixture').saved.blocks)).toContain('失败后保留人工编辑');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('settles a failed initial history flush and safely retries without a stuck preparing row or duplicate table',async()=>{
 const f=await open();try{
  f.setHistoryWritable(false);await f.page.keyboard.press('Space');const input=f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true});await input.fill('创建一个3乘3的表格');await input.press('Enter')
  await expect.poll(()=>f.history()[0]?.phase).toBe('failed');await input.waitFor();expect(await f.page.locator('.bn-editor table').count()).toBe(0)
  const original=await f.page.evaluate(()=>(window as any).calls.find((row:any)=>row.method==='native-table').input);f.setHistoryWritable(true)
  expect(await f.host('native-table',original)).toMatchObject({phase:'failed',receipt:{status:'failed'}});f.restartHistory();expect(f.history()[0].phase).toBe('failed');expect(await f.page.locator('.bn-editor table').count()).toBe(0)
  await input.press('Enter');await expect.poll(()=>f.history()[1]?.phase).toBe('ready');expect(f.history().map((row:any)=>row.phase)).toEqual(['failed','ready']);expect(await f.page.locator('.bn-editor table').count()).toBe(1);expect(await f.page.evaluate(()=>(window as any).calls.filter((row:any)=>row.method==='generate').length)).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
