import {afterAll,beforeAll,expect,it,vi} from 'vitest'
import {createServer} from 'node:http'
import {Session} from '@deepseek-ai/dsh-session'
// @ts-expect-error runtime module is JavaScript and has no declaration file.
import {registerNoteSessions,noteConversationRows} from '../packages/dsh-research-task-runtime/notes-session.js'
// @ts-expect-error runtime module is JavaScript and has no declaration file.
import {registerNotesAi} from '../packages/dsh-research-task-runtime/notes-ai.js'
import recordedCrud from './fixtures/notes-native-crud-missing-token.json'
import recordedEof from './fixtures/notes-native-crud-eof-containers.json'
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
 const bridge={request:async(method,input)=>{window.calls.push({method,input});if(method==='load'){const loaded=await window.nativeStore(method,input);window.saved=loaded.saved;return loaded}if(method==='save'){if(window.failSave)throw Error('保存失败样本');const result=await window.nativeStore(method,input);if(window.holdSaveAck&&input.content.blocks.some(block=>block.type==='table'))await new Promise(resolve=>window.releaseSaveAck=resolve);if(result.status==='saved'){window.saved=result.saved;if(window.fastTiming?.submitAt&&result.saved.blocks.some(b=>b.type==='table'&&b.content.rows.length===window.fastTiming.dimension&&b.content.rows[0].cells.length===window.fastTiming.dimension))window.fastTiming.saveAckAt??=performance.now()}return result}if(method==='capability-reply'){if(window.holdNativeEffect&&input.effect?.state==='applied')await new Promise(resolve=>window.releaseNativeEffect=resolve);return window.mainCapabilityReply(input)}if(method==='capability-ready'){if(window.holdNativeAdmission)await new Promise(resolve=>window.releaseNativeAdmission=resolve);return window.hostNativeReady(input,!!window.nativeReadOnly)}if(method==='render'||method==='native-table'||method==='conversation-state'||method==='conversation-load'||method==='stop')return window.hostNativeRequest(method,input);if(method==='generate'&&input.entryPoint==='component')return {kind:'component',node:{kind:'generated-container',title:'预览中的专业图表',containerSpec:{version:1,type:'chart',variant:'line',title:'预览中的专业图表',labels:['A','B'],series:[{name:'演示',values:[1,2]}]}}};if(method==='generate')return window.useNativeModel?window.hostNativeRequest(method,input):new Promise((resolve,reject)=>{window.modelResolve=resolve;window.modelReject=reject});if(method==='library-list')return[];return{}},draft:async input=>{window.pendingDraft=input;await window.nativeStore('draft',input)}};
 const root=createRoot(document.querySelector('#root'));window.openNativeGuide=()=>{document.documentElement.dataset.homeGuidePointerRun='core-guide-caret';root.unmount();const next=document.createElement('div');document.body.append(next);createRoot(next).render(React.createElement(NotesApp,{sessionId:'native-fixture',bridge,dark:false,navigate(){},guide:{native:{runId:'core-guide-caret'},ready(api){window.guideApi=api}}}))};window.reopen=()=>{root.unmount();const next=document.createElement('div');document.body.append(next);createRoot(next).render(React.createElement(NotesApp,{sessionId:'native-fixture',bridge,dark:false,navigate(){}}))};root.render(React.createElement(NotesApp,{sessionId:'native-fixture',bridge,dark:false,navigate(){}}));
 `:undefined,transform(code,id){if(id.endsWith('/preload/notes/editor.tsx'))return code.replace('  const slashMenu = useMemo','  window.editor=editor;window.ledger=proposals; const slashMenu = useMemo')}}
 const output=await build({...config,configFile:false,plugins:[...(config.plugins||[]),fixture],build:{...config.build,write:false,rollupOptions:{...config.build?.rollupOptions,input:entry}}})
 script=(Array.isArray(output)?output:[output]).flatMap(x=>'output'in x?x.output:[]).filter(x=>x.type==='chunk').map(x=>x.code).join('\n')
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},90000)
afterAll(async()=>{await browser?.close();if(process.env.SHERLOCK_NATIVE_OPS_METRICS)writeFileSync(process.env.SHERLOCK_NATIVE_OPS_METRICS,JSON.stringify(metrics,null,2)+'\n')})
async function open(modelOutput?:(request:any)=>unknown){
 const root=mkdtempSync(resolve(tmpdir(),'notes-native-operations-')),store=new NotesStore(root);store.save('fixture','native-fixture',0,{title:'原生操作验收',blocks:[{id:'before',type:'paragraph',content:'保留前段'},{id:'anchor',type:'paragraph'},{id:'after',type:'paragraph',content:'保留后段'}],yjs:''},'seed')
 const context=await browser.newContext({viewport:{width:1200,height:900}}),page=await context.newPage(),errors:string[]=[]
 const main=new NotesCapabilityBridge(value=>{void page.evaluate((input:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:input})),value)})
 let session=Session.create('native-fixture' as any);let historyWritable=true;const routes=new Map<string,any>(),modelRequests:any[]=[],historyPath=resolve(root,'sdk-session.json')
 const runtimeContext={sessions:{get:(id:string)=>id==='native-fixture'?session:undefined,flush:async(current:any)=>{if(!historyWritable)return false;writeFileSync(historyPath,JSON.stringify({header:current.header,events:current.events}));return true}},sessionTitle:{rename:(current:any,title:string)=>{current.append('session/title',{title});return{title}}},webServer:{register:(route:any)=>{routes.set(route.path,route.handler);return()=>{routes.delete(route.path)}}},apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'replay',model:'recorded-crud'},routable:true}}})}},llm:{stream:async function*(request:any){modelRequests.push(request);const value=modelOutput?.(request);yield{type:'text-delta',text:typeof value==='string'?value:JSON.stringify(value)};yield{type:'finish',reason:{kind:'stop'}}}}};const disposeRuntime=registerNoteSessions(runtimeContext,{isTrustedRequest:()=>true,readJsonBody:async(req:any)=>req.body}),disposeAi=registerNotesAi(runtimeContext,{isTrustedRequest:()=>true})
 const server=createServer(async(req,res)=>{try{const route=routes.get(req.url!);if(req.url==='/sherlock/notes/generate')return await route(req,res);let body='';for await(const chunk of req)body+=chunk;await route({method:req.method,body:JSON.parse(body)},res)}catch(error){res.writeHead(500);res.end(JSON.stringify({error:String(error)}))}});await new Promise<void>(done=>server.listen(0,'127.0.0.1',done))
 let handler:any,writable=true
 const hostWindow={isDestroyed:()=>false,webContents:{mainFrame:{processId:1,routingId:2},send:(channel:string,input:any)=>{if(channel==='notes:capability-action')void page.evaluate((input:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:input})),input)}}}
 const disposeService=installNotesService({ipcMain:{handle:(_name:string,fn:any)=>{handler=fn},removeHandler(){}},root,getWindow:()=>hostWindow,owner:()=> 'fixture',canRead:()=>true,canWrite:()=>writable,runtimeUrl:()=> 'http://127.0.0.1:'+(server.address() as any).port,clipboard:()=>undefined})
 const event={sender:hostWindow.webContents,senderFrame:hostWindow.webContents.mainFrame},host=(method:string,input:any)=>handler(event,method,{owner:'fixture',sessionId:'native-fixture',...input})
 await page.exposeFunction('hostNativeRequest',host);await page.exposeFunction('hostNativeReady',(input:any,readOnly:boolean)=>{writable=!readOnly;return host('capability-ready',input)})
 await page.exposeFunction('mainCapabilityReply',(input:any)=>{const reply=main.respond(input,'fixture');return reply.ok?reply:host('capability-reply',input)});await page.exposeFunction('nativeStore',(method:string,input:any)=>host(method,input))
 page.on('pageerror',(error:Error)=>errors.push(error.message))
 await page.route('https://native-note.test/**',(route:any)=>route.fulfill({contentType:'text/html',body:'<!doctype html><body data-workspace-surface="notes"><header data-ework-notes-session="native-fixture"></header><section class="en-root"><div id="root" class="en-editor-host"></div></section></body>'}));await page.goto('https://native-note.test/');await page.addScriptTag({content:'var exports={};\n'+script});await page.locator('.bn-editor').waitFor()
 await page.evaluate(()=>{const w=window as any;w.editor.replaceBlocks(w.editor.document,w.saved.blocks);w.editor.focus();w.editor.setTextCursorPosition('anchor','start')})
 return{page,context,errors,store,main,session,host,modelRequests,setHistoryWritable:(value:boolean)=>{historyWritable=value},history:()=>noteConversationRows(session),restartHistory:()=>{const value=JSON.parse(readFileSync(historyPath,'utf8'));session=Session.fromRestore('native-fixture' as any,value.events,value.header)},async close(){main.dispose();disposeService();disposeRuntime();disposeAi();await new Promise<void>(done=>server.close(()=>done()));await context.close();rmSync(root,{recursive:true,force:true})}}
}

async function capability(page:any,parent:any,action:string,args:any,id='native-'+Math.random()){
 await page.evaluate(({parent,action,args,id}:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:{sessionId:'native-fixture',generationId:parent.requestId,requestId:id,context:{documentId:parent.capabilityContext.documentId},action,args}})),{parent,action,args,id})
 await expect.poll(()=>page.evaluate((id:string)=>(window as any).calls.filter((x:any)=>x.method==='capability-reply'&&x.input.requestId===id&&('result'in x.input||'error'in x.input)).length,id)).toBeGreaterThan(0)
 return page.evaluate((id:string)=>(window as any).calls.find((x:any)=>x.method==='capability-reply'&&x.input.requestId===id&&('result'in x.input||'error'in x.input)).input,id)
}

async function submit(page:any,prompt:string){
 await page.evaluate((prompt:string)=>document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'native-fixture',prompt,images:[]}})),prompt)
 await expect.poll(()=>page.evaluate(()=>(window as any).calls.filter((x:any)=>x.method==='generate').length)).toBe(1)
 return page.evaluate(()=>(window as any).calls.find((x:any)=>x.method==='generate').input)
}
const body=(page:any)=>page.evaluate(()=>JSON.parse(JSON.stringify((window as any).editor.document)))
it('keeps ordinary summary in the right conversation without a document loading card',async()=>{
 const f=await open();try{const before=await body(f.page);await submit(f.page,'总结全文');expect(await f.page.locator('[data-note-preview-state=generating]').count()).toBe(0);await f.page.evaluate(()=>(window as any).modelResolve({kind:'conversation',markdown:'这是笔记观点摘要。'}));await expect.poll(()=>f.page.locator('[data-note-preview-state]').count()).toBe(0);expect(await body(f.page)).toEqual(before);expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it('shows the production loading then normal candidate, inserts once only after acceptance and reopens',async()=>{
 const f=await open();try{const before=await body(f.page);await submit(f.page,'在笔记末尾追加两句总结，先给我预览');expect(await f.page.locator('[data-note-preview-state=generating]').count()).toBe(0);await f.page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-generation-progress',{detail:{sessionId:'native-fixture',requestId:(window as any).calls.find((x:any)=>x.method==='generate').input.requestId,documentIntent:true,stage:'writing',reasoning:'',outputChars:20}})));await f.page.locator('[data-note-preview-state=generating]').waitFor();await f.page.evaluate(()=>(window as any).modelResolve({kind:'text',markdown:'核对增长与现金回款。后续继续验证估值情景。'}));await f.page.locator('[data-note-preview-state=ready]').waitFor();expect(await body(f.page)).toEqual(before);expect(await f.page.getByRole('button',{name:'重新撰写',exact:true}).count()).toBe(1);expect(await f.page.locator('.en-space-ai').count()).toBe(0);await f.page.getByRole('button',{name:'添加至正文',exact:true}).click();await expect.poll(()=>f.page.locator('.en-document .bn-editor[contenteditable="true"]').textContent()).toContain('核对增长与现金回款');await f.page.keyboard.press('Meta+s');await expect.poll(()=>JSON.stringify(f.store.load('fixture','native-fixture').saved.blocks)).toContain('核对增长与现金回款');await f.page.evaluate(()=>(window as any).reopen());await f.page.locator('.en-document .bn-editor[contenteditable="true"]').waitFor();expect((await f.page.locator('.en-document .bn-editor[contenteditable="true"]').textContent()).match(/核对增长与现金回款/g)).toHaveLength(1);expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it('stages multi-operation native edits without changing body or save until normal candidate acceptance',async()=>{
 const f=await open();try{const before=await body(f.page),parent=await submit(f.page,'调整全文结构并追加一个表格');const read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'});const applied=await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'update',blockId:'before',block:{content:'修订前段'}},{op:'remove',blockIds:['anchor']},{op:'insert',anchor:{blockId:'after',placement:'after'},blocks:[{id:'new-native-table',type:'table',content:{type:'tableContent',rows:[{cells:['收入','利润']},{cells:['10','3']}]}}]}]});expect(applied.result).toMatchObject({status:'succeeded',data:{pendingPreview:true}});expect(applied.result.effect).toBeUndefined();expect(await body(f.page)).toEqual(before);await f.page.evaluate((receipt:any)=>(window as any).modelResolve({kind:'conversation',markdown:'',capabilityReceipts:[receipt]}),applied.result);await f.page.locator('[data-note-preview-state=ready]').waitFor();expect(await body(f.page)).toEqual(before);expect(await f.page.locator('.en-space-ai').count()).toBe(0);await f.page.getByRole('button',{name:'添加至正文',exact:true}).click();await expect.poll(()=>f.page.locator('.en-document .bn-editor[contenteditable="true"]').textContent()).toContain('修订前段');expect(await f.page.locator('.bn-editor table').count()).toBe(1);expect((await body(f.page)).some((x:any)=>x.id==='anchor')).toBe(false);expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it('lets a later tool phase read earlier prepared native blocks and commits both phases together',async()=>{
 const f=await open();try{const before=await body(f.page),parent=await submit(f.page,'追加并整理一段笔记');const read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'});await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'insert',anchor:{blockId:'after',placement:'after'},blocks:[{id:'prepared-new',type:'paragraph',content:'第一版'}]}]});const again=await capability(f.page,parent,'notes.blocks.read',{scope:'note'});expect(again.result.data.blocks.find((x:any)=>x.block.id==='prepared-new')).toBeTruthy();const result=await capability(f.page,parent,'notes.blocks.apply',{revision:again.result.data.revision,operations:[{op:'update',blockId:'prepared-new',block:{content:'最终版'}}]});expect(result.result.status).toBe('succeeded');expect(await body(f.page)).toEqual(before);await f.page.evaluate(()=>(window as any).modelResolve({kind:'conversation',markdown:''}));await f.page.locator('[data-note-preview-state=ready]').waitFor();await f.page.getByRole('button',{name:'添加至正文',exact:true}).click();await expect.poll(()=>f.page.locator('.en-document .bn-editor[contenteditable="true"]').textContent()).toContain('最终版');expect(await f.page.locator('.en-document .bn-editor[contenteditable="true"]').textContent()).not.toContain('第一版');expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it('rejects acceptance after a human document edit and preserves both the original and newer text',async()=>{
 const f=await open();try{const parent=await submit(f.page,'在笔记末尾添加总结'),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'});await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'update',blockId:'before',block:{content:'AI更改'}}]});await f.page.evaluate(()=>(window as any).modelResolve({kind:'conversation',markdown:''}));await f.page.locator('[data-note-preview-state=ready]').waitFor();await f.page.evaluate(()=>(window as any).editor.updateBlock('after',{content:'人工较新编辑'}));await f.page.getByRole('button',{name:'添加至正文',exact:true}).click();expect(await f.page.locator('.en-document .bn-editor[contenteditable="true"]').textContent()).toContain('保留前段');expect(await f.page.locator('.en-document .bn-editor[contenteditable="true"]').textContent()).toContain('人工较新编辑');expect(await f.page.locator('.en-document .bn-editor[contenteditable="true"]').textContent()).not.toContain('AI更改');expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it('discards a prepared native update without changing or saving note content',async()=>{
 const f=await open();try{const before=await body(f.page),parent=await submit(f.page,'修改开头段落'),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'});await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'remove',blockIds:['before']}]});await f.page.evaluate(()=>(window as any).modelResolve({kind:'conversation',markdown:''}));await f.page.locator('[data-note-preview-state=ready]').waitFor();await f.page.getByRole('button',{name:'放弃',exact:true}).click();expect(await body(f.page)).toEqual(before);expect(f.errors).toEqual([])}finally{await f.close()}
},15000)

it('stopping a prepared change cannot later reopen its candidate or alter the note',async()=>{
 const f=await open();try{const before=await body(f.page),parent=await submit(f.page,'修改第一段'),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'});await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'update',blockId:'before',block:{content:'已停止的结果'}}]});await f.page.getByRole('button',{name:'停止',exact:true}).click();await f.page.evaluate(()=>(window as any).modelResolve({kind:'conversation',markdown:''}));await expect.poll(()=>f.page.locator('[data-note-preview-state]').count()).toBe(0);expect(await body(f.page)).toEqual(before);expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it('a model timeout after a prepared change leaves the actual note unchanged',async()=>{
 const f=await open();try{const before=await body(f.page),parent=await submit(f.page,'修改第一段'),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'});await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'remove',blockIds:['before']}]});await f.page.evaluate(()=>(window as any).modelReject(new Error('模型服务响应超时')));await expect.poll(()=>f.page.locator('[data-note-preview-state]').count()).toBe(0);expect(await body(f.page)).toEqual(before);expect(await f.page.locator('.en-space-ai').count()).toBe(0);expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it.each([{prompt:'总结全文',kind:'conversation'},{prompt:'在笔记末尾补一个两句总结，先给我预览',kind:'text'}])('routes $prompt through one real runtime model call and keeps content out of the body',async({prompt,kind})=>{
 const f=await open(()=>({kind,markdown:'增长与现金转化需要交叉检验。后续按情景继续核对。'}));try{const before=await body(f.page);await f.page.evaluate(()=>(window as any).useNativeModel=true);await submit(f.page,prompt);await expect.poll(()=>f.history().at(-1)?.phase).toBe(kind==='text'?'ready':'replied');expect(f.modelRequests).toHaveLength(1);expect(await body(f.page)).toEqual(before);expect(await f.page.locator('[data-note-preview-state=ready]').count()).toBe(kind==='text'?1:0);expect(f.modelRequests[0].system).toContain('已有正文足够时不要为同样内容再次调用read');expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it('keeps Space native tables immediately editable on their existing inline transaction path',async()=>{
 const f=await open();try{await f.page.keyboard.press('Space');const input=f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true});await input.fill('创建一个3乘3的表格');await input.press('Enter');await f.page.getByRole('button',{name:'确认本次 AI 生成',exact:true}).waitFor();expect(await f.page.locator('.bn-editor table').count()).toBe(1);expect(await f.page.locator('[data-note-preview-state]').count()).toBe(0);expect(f.modelRequests).toHaveLength(0);expect(f.errors).toEqual([])}finally{await f.close()}
},15000)

it('prepares a mixed native table, component and text candidate and inserts the complete batch only on acceptance',async()=>{
 const f=await open();try{const before=await body(f.page),parent=await submit(f.page,'在末尾增加表格和相关图表，再补两句说明');const read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'});const table=await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'insert',anchor:{blockId:'after',placement:'after'},blocks:[{id:'mixed-table',type:'table',content:{type:'tableContent',rows:[{cells:['A','1']},{cells:['B','2']}]}}]}]});expect(table.result.data.pendingPreview).toBe(true);const component=await capability(f.page,parent,'notes.components.create',{prompt:'使用用户提供的A=1、B=2创建折线图'});expect(component.result).toMatchObject({status:'succeeded',data:{pendingPreview:true}});expect(component.result.effect).toBeUndefined();expect(await body(f.page)).toEqual(before);await f.page.evaluate(()=>(window as any).modelResolve({kind:'text',markdown:'这两条记录仅用于演示。请继续核对来源。'}));await f.page.locator('[data-note-preview-state=ready]').waitFor();expect(await body(f.page)).toEqual(before);await f.page.getByRole('button',{name:'添加至正文',exact:true}).click();await expect.poll(()=>body(f.page)).toMatchObject([...before,{id:'mixed-table',type:'table'},{type:'research'},{type:'paragraph'}]);expect((await body(f.page)).filter((b:any)=>b.type==='table')).toHaveLength(1);expect((await body(f.page)).filter((b:any)=>b.type==='research')).toHaveLength(1);expect(await f.page.locator('.en-space-ai').count()).toBe(0);expect(f.errors).toEqual([])}finally{await f.close()}
},15000)

it.each(['为什么不能删除这段？','解释创建流程','如何更新这张表？'])('does not create a note loading card for conversational words in %s',async prompt=>{
 const f=await open();try{const before=await body(f.page);await submit(f.page,prompt);expect(await f.page.locator('[data-note-preview-state]').count()).toBe(0);await f.page.evaluate(()=>(window as any).modelResolve({kind:'conversation',markdown:'这是操作说明，不改笔记正文。'}));await expect.poll(()=>f.page.locator('[data-note-preview-state]').count()).toBe(0);expect(await body(f.page)).toEqual(before);expect(f.errors).toEqual([])}finally{await f.close()}
},15000)

const componentSpec=(value:string)=>({version:1,type:'markdown',title:'经营复盘',content:value})
async function selectComponent(f:any){
 await f.page.evaluate(()=>{const editor=(window as any).editor;editor.insertBlocks([{id:'selected-component',type:'research',props:{payload:JSON.stringify({id:'selected-node',kind:'generated-container',title:'经营复盘',generationStatus:'completed',noteSize:{width:500,height:280},containerSpec:{version:1,type:'markdown',title:'经营复盘',content:'原有组件内容'}})}}],editor.document.at(-1),'after');document.dispatchEvent(new CustomEvent('sherlock:notes-reference-component',{detail:{sessionId:'native-fixture',blockId:'selected-component'}}))})
 await f.page.keyboard.press('Meta+s')
 await expect.poll(()=>JSON.stringify(f.store.load('fixture','native-fixture').saved.blocks)).toContain('原有组件内容')
}
async function preparedComponent(f:any,parent:any,value:string){
 const context={owner:'fixture',sessionId:'native-fixture',documentId:parent.capabilityContext.documentId,mode:'notes',editable:true,selectedBlockIds:['selected-component'],selectedNativeBlockIds:[]},controller=new AbortController()
 const inspect=await f.main.request('notes.components.inspect',{},context,parent.requestId,controller.signal,()=>true)
 const applied=await f.main.request('notes.components.apply',{blockId:'selected-component',revision:inspect.data.revision,containerSpec:componentSpec(value)},context,parent.requestId,controller.signal,()=>true,true)
 return{inspect,applied}
}
it('previews selected component content through real Main inspect/apply before confirmation, saves and reopens once',async()=>{
 const f=await open();try{
  await selectComponent(f);const before=await body(f.page),parent=await submit(f.page,'把所选组件内容调整为经营验证清单')
  expect(parent.capabilityContext.selectedBlockIds).toEqual(['selected-component'])
  const{applied}=await preparedComponent(f,parent,'改后的经营验证清单')
  expect(applied).toMatchObject({status:'succeeded',data:{pendingPreview:true,actionId:parent.requestId,blockId:'selected-component'}});expect(applied.effect).toBeUndefined();expect(await body(f.page)).toEqual(before)
  await f.page.evaluate(()=>(window as any).modelResolve({kind:'conversation',markdown:''}));await f.page.locator('[data-note-preview-state=ready]').waitFor()
  expect(await body(f.page)).toEqual(before);expect(await f.page.locator('.en-space-ai').count()).toBe(0);await expect.poll(()=>f.page.locator('[data-note-preview-state=ready] iframe').contentFrame().locator('body').textContent()).toContain('改后的经营验证清单')
  await f.page.getByRole('button',{name:'添加至正文',exact:true}).click();await expect.poll(()=>JSON.stringify(f.store.load('fixture','native-fixture').saved.blocks)).toContain('改后的经营验证清单');await f.page.evaluate(()=>(window as any).reopen());await f.page.locator('.bn-editor').waitFor()
  expect(JSON.stringify(await body(f.page))).toContain('改后的经营验证清单');expect((await body(f.page)).filter((block:any)=>block.id==='selected-component')).toHaveLength(1);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it.each(['human-edit','stop'])('preserves a selected component candidate after %s without an unconfirmed payload write',async action=>{
 const f=await open();try{
  await selectComponent(f);const before=await body(f.page),parent=await submit(f.page,'调整所选组件内容');await preparedComponent(f,parent,'不应自动写入的内容')
  if(action==='stop'){await f.page.getByRole('button',{name:'停止',exact:true}).click();await f.page.evaluate(()=>(window as any).modelResolve({kind:'conversation',markdown:''}));await expect.poll(()=>f.page.locator('[data-note-preview-state]').count()).toBe(0);expect(await body(f.page)).toEqual(before)}
  else{await f.page.evaluate(()=>(window as any).modelResolve({kind:'conversation',markdown:''}));await f.page.locator('[data-note-preview-state=ready]').waitFor();await f.page.evaluate(()=>(window as any).editor.updateBlock('before',{content:'人工新编辑'}));await f.page.getByRole('button',{name:'添加至正文',exact:true}).click();const blocks=await body(f.page);expect(JSON.stringify(blocks)).toContain('人工新编辑');expect(blocks.find((block:any)=>block.id==='selected-component').props.payload).toBe(before.find((block:any)=>block.id==='selected-component').props.payload)}
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('combines native edits, two projected component revisions and final text in one confirmed candidate',async()=>{
 const f=await open();try{
  await selectComponent(f);const before=await body(f.page),parent=await submit(f.page,'补充原生段落、修改图表并追加说明');const read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'})
  await capability(f.page,parent,'notes.blocks.apply',{revision:read.result.data.revision,operations:[{op:'update',blockId:'before',block:{content:'整批原生更新'}}]})
  const first=await preparedComponent(f,parent,'组件中间版本'),last=await preparedComponent(f,parent,'组件最终版本');expect(last.inspect.data.revision).toBe(first.applied.data.revision)
  expect(await body(f.page)).toEqual(before);await f.page.evaluate(()=>(window as any).modelResolve({kind:'text',markdown:'后续按经营数据继续验证。'}));await f.page.locator('[data-note-preview-state=ready]').waitFor();expect(await body(f.page)).toEqual(before)
  await f.page.getByRole('button',{name:'添加至正文',exact:true}).click();await expect.poll(()=>JSON.stringify(f.store.load('fixture','native-fixture').saved.blocks)).toContain('组件最终版本');const blocks=await body(f.page)
  expect(JSON.stringify(blocks)).toContain('整批原生更新');expect(JSON.stringify(blocks)).toContain('后续按经营数据继续验证');expect(JSON.stringify(blocks)).not.toContain('组件中间版本');expect(await f.page.locator('.en-space-ai').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('keeps a question about selected text in the right conversation without prematurely showing a note card',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>{const editor=(window as any).editor;let start=0;editor._tiptapEditor.state.doc.descendants((node:any,pos:number)=>{if(!start&&node.isText){start=pos;return false}});editor._tiptapEditor.commands.setTextSelection({from:start,to:start+4})})
  const before=await body(f.page),parent=await submit(f.page,'解释这段文字')
  expect(parent.selection).toBeTruthy();expect(await f.page.locator('[data-note-preview-state]').count()).toBe(0)
  await f.page.evaluate(()=>(window as any).modelResolve({kind:'conversation',markdown:'这是所选内容的解释，不改动笔记。'}));await expect.poll(()=>f.page.locator('[data-note-preview-state]').count()).toBe(0);expect(await body(f.page)).toEqual(before);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('executes a real runtime inspect/apply component request with a prepared receipt and no body effect until acceptance',async()=>{
 const f=await open(request=>{
  const payload=JSON.parse(request.messages[0].content.find((part:any)=>part.type==='text').text),receipts=payload.clientReceipts,wireToken=/wireToken=([a-f0-9-]+)/u.exec(request.system)![1]
  if(!receipts.length)return{kind:'capabilities',wireToken,calls:[{requestId:'inspect-selected',capability:'notes.components.inspect',arguments:{}}]}
  if(receipts.length===1)return{kind:'capabilities',wireToken,calls:[{requestId:'apply-selected',capability:'notes.components.apply',arguments:{blockId:receipts[0].data.blockId,revision:receipts[0].data.revision,containerSpec:componentSpec('真实运行时准备的组件更新')}}]}
  expect(receipts[1]).toMatchObject({capability:'notes.components.apply',status:'succeeded',data:{pendingPreview:true}});expect(receipts[1].effect).toBeUndefined();return{kind:'conversation',markdown:''}
 });try{
  await selectComponent(f);const before=await body(f.page);await f.page.evaluate(()=>(window as any).useNativeModel=true);await submit(f.page,'调整所选组件的经营验证内容')
  await f.page.locator('[data-note-preview-state=ready]').waitFor();expect(await body(f.page)).toEqual(before);expect(f.modelRequests).toHaveLength(3);expect(f.history().at(-1).phase).toBe('ready')
  await f.page.getByRole('button',{name:'添加至正文',exact:true}).click();await expect.poll(()=>JSON.stringify(f.store.load('fixture','native-fixture').saved.blocks)).toContain('真实运行时准备的组件更新');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it.each(['single-dirty','partly-safe','dependent'])('refuses a right undo candidate for %s instead of promising text it must preserve',async mode=>{
 const f=await open();try{
  await f.page.evaluate((mode:string)=>{const w=window as any;w.ledger.begin('prior-inline','AI旧改写',{documentId:'doc',blockId:'before',position:{}});w.ledger.runFor('prior-inline',()=>{w.editor.updateBlock('before',{content:'AI旧改写'});if(mode!=='single-dirty')w.editor.updateBlock('after',{content:'可独立回退的AI段落'})},[],mode==='dependent');w.ledger.finish('prior-inline');w.editor.updateBlock('before',{content:'人工最新改写必须保留'})},mode)
  const original=await body(f.page),allowed=await f.page.evaluate(()=>(window as any).ledger.canUndoBlock('prior-inline','after'))
  if(mode==='partly-safe')expect(allowed).toBe(true);if(mode==='dependent')expect(allowed).toBe(false)
  const parent=await submit(f.page,'撤销刚才的AI改写'),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'}),reply=await capability(f.page,parent,'notes.blocks.undo',{revision:read.result.data.revision,actionId:'prior-inline'})
  expect(reply.error).toContain('无法完整预览撤销');expect(reply.result).toBeUndefined();expect(await body(f.page)).toEqual(original)
  await f.page.evaluate(()=>(window as any).modelResolve({kind:'conversation',markdown:'包含较新编辑，当前内容已保留。'}));await expect.poll(()=>f.page.locator('[data-note-preview-state]').count()).toBe(0);expect(await body(f.page)).toEqual(original)
  expect(await f.page.evaluate(()=>(window as any).ledger.list().some((value:any)=>value.id==='prior-inline'&&value.changes.some((change:any)=>change.dirty)))).toBe(true);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it.each(['update','replace-empty-anchor'])('shows an exact safe %s undo preview and confirms the same body',async mode=>{
 const f=await open();try{
  const original=await body(f.page)
  await f.page.evaluate((mode:string)=>{const w=window as any;w.ledger.begin('prior-clean','AI干净改写',{documentId:'doc',blockId:'before',position:{}});w.ledger.run(()=>{if(mode==='update')w.editor.updateBlock('before',{content:'AI干净修改'});else w.editor.replaceBlocks(['anchor'],[{id:'created-inline',type:'paragraph',content:'AI插入的内容'}])});w.ledger.finish('prior-clean')},mode)
  const before=await body(f.page),parent=await submit(f.page,'撤销刚才的AI生成'),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'}),reply=await capability(f.page,parent,'notes.blocks.undo',{revision:read.result.data.revision,actionId:'prior-clean'})
  expect(reply.result).toMatchObject({status:'succeeded',data:{pendingPreview:true}});expect(await body(f.page)).toEqual(before)
  await f.page.evaluate(()=>(window as any).modelResolve({kind:'conversation',markdown:''}));await f.page.locator('[data-note-preview-state=ready]').waitFor();await f.page.getByRole('button',{name:'添加至正文',exact:true}).click();await expect.poll(()=>f.page.locator('[data-note-preview-state=ready]').count()).toBe(0)
  expect(await body(f.page)).toEqual(original);expect(await f.page.evaluate(()=>(window as any).ledger.list().some((value:any)=>value.id==='prior-clean'))).toBe(false);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('refuses undo acceptance if the owned journal changes after a clean preview without changing body text',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>{const w=window as any;w.ledger.begin('prior-cas','AI改写',{documentId:'doc',blockId:'before',position:{}});w.ledger.run(()=>w.editor.updateBlock('before',{content:'AI改写'}));w.ledger.finish('prior-cas')})
  const before=await body(f.page),parent=await submit(f.page,'撤销AI改写'),read=await capability(f.page,parent,'notes.blocks.read',{scope:'note'});await capability(f.page,parent,'notes.blocks.undo',{revision:read.result.data.revision,actionId:'prior-cas'});await f.page.evaluate(()=>(window as any).modelResolve({kind:'conversation',markdown:''}));await f.page.locator('[data-note-preview-state=ready]').waitFor()
  await f.page.evaluate(()=>(window as any).ledger.setError('prior-cas','生成记录已变化'));await f.page.getByRole('button',{name:'添加至正文',exact:true}).click()
  expect(await body(f.page)).toEqual(before);expect(await f.page.locator('[data-note-preview-state=ready]').count()).toBe(1);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('prepares the real empty guide line for Space while summary keeps the existing body caret untouched',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).openNativeGuide());await expect.poll(()=>f.page.evaluate(()=>!!(window as any).guideApi)).toBe(true)
  const prepared=await f.page.evaluate(()=>{const w=window as any;w.guideApi.appendBlock({id:'guide-space-tail',type:'paragraph',content:''});w.editor.setTextCursorPosition('before','end');const before=w.editor._tiptapEditor.state.selection.toJSON(),blocks=JSON.stringify(w.editor.document),lease=w.guideApi.prepareNative('summary'),afterSummary=w.editor._tiptapEditor.state.selection.toJSON(),leaseValid=lease();w.guideApi.prepareNative();return{before,afterSummary,leaseValid,leaseAfterCaretMove:lease(),cursor:w.editor.getTextCursorPosition().block.id,unchanged:JSON.stringify(w.editor.document)===blocks}})
  expect(prepared.afterSummary).toEqual(prepared.before);expect(prepared.leaseValid).toBe(true);expect(prepared.leaseAfterCaretMove).toBe(false);expect(prepared.cursor).toBe('guide-space-tail');expect(prepared.unchanged).toBe(true)
  await f.page.locator('.bn-editor').evaluate((node:HTMLElement)=>node.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true})))
  await f.page.getByRole('textbox',{name:'行内 AI 需求',exact:true}).waitFor();expect(await f.page.locator('.en-space-ai').count()).toBe(1);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
