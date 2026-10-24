import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {NotesStore} from '../src/main/notes/store'
let browser,script,css
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{mountHomeGuides}from'./src/preload/home-guides';import{mountHomeNotesGuide}from'./src/preload/home-guide-notes';import{mountNotes}from'./src/preload/notes/mount';import{WorkspaceSurfaceHost}from'./src/preload/workspace-surface-host';
 window.noteLoads=[];window.originalInput=document.querySelector('#original-draft');window.originalInput.focus();window.originalInput.setSelectionRange(1,3);
 window.guideCueHistory=[];window.addEventListener('sherlock:home-guide-cue',event=>{const detail=event.detail,target=detail.target??[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===detail.targetToken);window.guideCueHistory.push({label:detail.label,tag:target?.tagName,className:target?.className});});
 const bridge={request:async(method,input)=>{if(method==='load')window.noteLoads.push(input.sessionId);if(method==='save'&&window.deferNoteSave)await new Promise(resolve=>setTimeout(resolve,200));return window.noteStorageRequest(method,input)},draft:input=>window.noteStorageRequest('draft',input)};
 const workspaceHost=new WorkspaceSurfaceHost(document);window.nativeNotes=mountNotes(document,bridge,workspaceHost);
 window.sessionCount=0;window.latestExample=undefined;
 const chooseView=view=>{for(const tab of document.querySelectorAll('[data-conversation-view-id]'))tab.setAttribute('aria-selected',String(tab.dataset.conversationViewId===view));document.querySelector('[data-ework-note-view]')?.remove();const id=document.querySelector('[data-ework-notes-session]').dataset.eworkNotesSession;if(view==='notes'){const anchor=document.createElement('div');anchor.dataset.eworkNoteView=id;document.querySelector('#resident-body').append(anchor);document.dispatchEvent(new CustomEvent('sherlock:notes-open',{detail:{sessionId:id}}))}else document.dispatchEvent(new CustomEvent('sherlock:notes-close',{detail:{sessionId:id}}));};
 for(const tab of document.querySelectorAll('[data-conversation-view-id]'))tab.addEventListener('click',()=>chooseView(tab.dataset.conversationViewId));
 window.addEventListener('sherlock:home-guide-session-request',event=>{const value=event.detail;let session;if(value.command==='prepare'){const fresh=!window.latestExample||value.replay===true;if(fresh)window.latestExample={sessionId:'example-note-'+(++window.sessionCount),cwd:'/example-notes',title:'笔记教程副本'};session={...window.latestExample,fresh};}else{session={...window.latestExample};const header=document.querySelector('[data-ework-notes-session]'),view=header.querySelector('[aria-selected=true]').dataset.conversationViewId;header.dataset.eworkNotesSession=session.sessionId;header.querySelector('[data-en-challenge-tools]').dataset.enChallengeTools=session.sessionId;chooseView(view);window.dispatchEvent(new CustomEvent('sherlock:home-action-context-changed'));}window.dispatchEvent(new CustomEvent('sherlock:home-guide-session-reply',{detail:{requestId:value.requestId,ok:true,...session}}));});
 window.guides=mountHomeGuides(document,{beforeOpen:session=>window.nativeNotes.prepareGuide(session.sessionId),revealConversation:()=>workspaceHost.revealConversation(),mountNotes:(doc,host,options)=>mountHomeNotesGuide(doc,host,{...options,persistence:bridge}),mountPresentation:async()=>({runStep:async()=>{},dispose:()=>{}})});
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'inline-styles',setup(b){b.onResolve({filter:/\.css\?(inline|raw)$/},async args=>{const found=await b.resolve(args.path.replace(/\?(inline|raw)$/,''),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>{const contents=await readFile(args.path,'utf8');if(!contents.includes('@import'))return{contents,loader:'text'};const compiled=await build({entryPoints:[args.path],conditions:['browser','import','style'],bundle:true,write:false,outfile:'notes.css',logLevel:'silent',loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'}});return{contents:compiled.outputFiles.find(file=>file.path.endsWith('.css')).text,loader:'text'}})}}]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text;css=output.outputFiles.find(file=>file.path.endsWith('.css'))?.text||''
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(paneWidth=600){
 const directory=mkdtempSync(join(tmpdir(),'home-guide-note-shell-')),store=new NotesStore(directory),requests=[]
 const context=await browser.newContext({viewport:{width:paneWidth+480,height:752}}),page=await context.newPage(),errors=[],logs=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(['warning','error'].includes(message.type()))logs.push(message.text()+' '+JSON.stringify(message.location()))})
 await page.exposeFunction('noteStorageRequest',async(method,input)=>{requests.push({method,sessionId:input.sessionId});if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft')store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);if(method==='challenge')throw Error('教程不应请求真实模型');return{ok:true}})
 await page.route('http://127.0.0.1/notes-guide-shell',route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content"><title>首页笔记教程集成验收</title><style>body{margin:0;font-family:system-ui}.pI_x6G_centerCol{position:absolute;left:88px;top:10px;width:${paneWidth}px;bottom:10px;border-radius:12px;overflow:hidden;background:#eee}.wSkVaW_root{height:100%;position:relative}.wSkVaW_header{height:44px;display:flex;align-items:center;padding-inline:12px}.wSkVaW_header button{height:30px;border:0;border-radius:7px;padding:0 14px;background:transparent}.wSkVaW_header button[aria-selected=true]{background:#ddd}#original-draft{position:absolute;top:250px;left:20px;width:calc(100% - 50px)}[data-srb-tabs]{display:flex}.en-root{z-index:45}</style><div class="pI_x6G_centerCol"><div class="wSkVaW_root"><header class="wSkVaW_header" data-srb-session-header data-ework-notes-session="original-session"><div data-srb-tabs role="tablist"><button role="tab" data-conversation-view-id="chat" aria-selected="true">对话</button><button role="tab" data-conversation-view-id="research" aria-selected="false">研究</button><button role="tab" data-conversation-view-id="notes" aria-selected="false">笔记</button></div><div data-en-challenge-tools="original-session"></div></header><div id="resident-body" style="height:calc(100% - 44px)"><textarea id="original-draft">用户原有提示词与技能标签</textarea></div></div></div>`}))
 await page.goto('http://127.0.0.1/notes-guide-shell');if(css)await page.addStyleTag({content:css});await page.addScriptTag({content:script});return{context,page,errors,logs,store,requests,dispose:async()=>{await context.close();rmSync(directory,{recursive:true,force:true})}}
}
// Real public "next" actions skip reading holds in this focused test; adapters
// retain their actual stream, native scheduler and UI-stability waits.
async function complete(page){
 const deadline=Date.now()+65000;let capturedPopover=false
 while(Date.now()<deadline){
  if(await page.locator('[data-home-guide]').count()===0)return
  const phase=await page.locator('[data-home-guide]').getAttribute('data-phase');if(phase==='completed'){await expect.poll(()=>page.locator('[data-home-guide]').count()).toBe(0);return}
  if(phase==='error')throw Error(await page.locator('[data-home-guide] [role=status]').innerText()+' '+JSON.stringify(await page.evaluate(()=>window.guideCueHistory)))
  if(!capturedPopover&&await page.locator('.en-challenge-popover').count()){
   expect(await page.locator('.en-challenge-popover').evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return node===hit||node.contains(hit)})).toBe(true)
   await page.screenshot({path:'/tmp/home-guide-note-native-popover-20261025.png'});capturedPopover=true
  }
  const next=page.locator('[data-home-guide-next]');if(await next.isEnabled())await next.click()
  await page.waitForTimeout(90)
 }
 throw Error('笔记教程未完成：'+await page.locator('[data-home-guide] [role=status]').innerText())
}
async function startWriting(page){await page.evaluate(()=>window.guides.start('note'));await expect.poll(()=>page.locator('[data-home-guide] .bn-editor').innerText(),{timeout:6000}).toContain('研究摘要')}
for(const width of [600,700])it(`saves and reopens the native note without clipping a ${width}px pane walkthrough`,async()=>{
 const f=await fixture(width),{page,errors,logs,store,requests}=f;try{
  await page.evaluate(()=>window.guides.start('note'))
  await expect.poll(()=>page.locator('.odyssey-home-guide-pointer').evaluate(node=>node.hidden),{timeout:5000}).toBe(false)
  expect(await page.locator('.odyssey-home-guide-footer').evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+20,r.top+r.height/2);return node===hit||node.contains(hit)})).toBe(true)
  await page.screenshot({path:'/tmp/home-guide-note-virtual-pointer-'+width+'-20261025.png'})
  expect(await page.locator('[data-home-guide]').evaluate(root=>{const box=root.getBoundingClientRect(),pane=document.querySelector('.pI_x6G_centerCol').getBoundingClientRect(),footer=root.querySelector('.odyssey-home-guide-footer').getBoundingClientRect(),content=root.querySelector('[data-home-guide-content]').getBoundingClientRect();return box.left>=pane.left&&box.right<=pane.right+1&&box.bottom<=pane.bottom+1&&Math.abs(content.bottom-box.bottom)<1&&footer.height<=40&&footer.width<145&&root.scrollWidth<=root.clientWidth})).toBe(true)
  await complete(page)
  expect(await page.getByRole('tab',{name:'笔记'}).getAttribute('aria-selected')).toBe('true');expect(await page.locator('[data-note-editor-session="example-note-1"] .bn-editor').innerText()).toContain('同比增长10%')
  expect(await page.evaluate(()=>document.querySelector('#original-draft')===window.originalInput&&window.originalInput.value==='用户原有提示词与技能标签')).toBe(true)
  await page.screenshot({path:'/tmp/home-guide-notes-natural-shell-'+width+'-20261024.png'})
  expect(await page.locator('[data-home-guide]').count()).toBe(0)
  await expect.poll(()=>page.locator('[data-note-editor-session="example-note-1"] .bn-editor').innerText()).toContain('同比增长10%')
  expect(store.load('owner','example-note-1').saved.yjs.length).toBeGreaterThan(1000);expect(requests.some(item=>item.sessionId==='original-session')).toBe(false);expect(requests.some(item=>item.method==='challenge')).toBe(false)
  await page.evaluate(()=>window.guides.start('note'));expect(await page.locator('[data-home-guide]').count()).toBe(0);await expect.poll(()=>page.locator('[data-note-editor-session="example-note-1"] .bn-editor').innerText()).toContain('同比增长10%')
  expect(errors).toEqual([]);expect(logs).toEqual([])
 }finally{await f.dispose()}
},75000)
it('pauses readable writing and replays into a new session while preserving the first partial result',async()=>{
 const f=await fixture(),{page,store,errors}=f;try{
  await startWriting(page);await page.getByRole('button',{name:'暂停',exact:true}).click();await page.waitForTimeout(180);const paused=await page.locator('[data-home-guide] .bn-editor').innerText();await page.waitForTimeout(350);expect(await page.locator('[data-home-guide] .bn-editor').innerText()).toBe(paused)
  await page.getByRole('button',{name:'重新演示',exact:true}).click();await expect.poll(()=>page.locator('[data-ework-notes-session]').getAttribute('data-ework-notes-session')).toBe('example-note-2')
  expect(store.load('owner','example-note-1').saved.title).toContain('AI算力产业链');expect(JSON.stringify(store.load('owner','example-note-1').saved.blocks)).toContain('研究摘要')
  await page.getByRole('button',{name:'结束示例教程'}).click();await expect.poll(()=>page.locator('[data-home-guide]').count()).toBe(0);expect(errors).toEqual([])
 }finally{await f.dispose()}
},15000)
it('preserves partial content and respects a user switching native tabs',async()=>{
 const f=await fixture(),{page,store,errors}=f;try{
  await startWriting(page);await page.getByRole('tab',{name:'对话'}).click();await expect.poll(()=>page.locator('[data-home-guide]').count()).toBe(0)
  expect(await page.getByRole('tab',{name:'对话'}).getAttribute('aria-selected')).toBe('true');expect(store.load('owner','example-note-1').saved.title).toContain('AI算力产业链')
  await page.getByRole('tab',{name:'笔记'}).click();await expect.poll(()=>page.locator('[data-note-editor-session="example-note-1"] .bn-editor').innerText()).toContain('研究摘要');expect(errors).toEqual([])
 }finally{await f.dispose()}
},15000)
it('awaits a delayed final save before exposing the native Notes surface',async()=>{
 const f=await fixture(),{page,errors}=f;try{
  await startWriting(page);await page.evaluate(()=>window.deferNoteSave=true);await page.getByRole('button',{name:'结束示例教程'}).click()
  expect(await page.locator('[data-home-guide]').count()).toBe(1);expect(await page.locator('[data-note-editor-session]').count()).toBe(0)
  await expect.poll(()=>page.locator('[data-home-guide]').count()).toBe(0);await expect.poll(()=>page.locator('[data-note-editor-session="example-note-1"] .bn-editor').innerText()).toContain('研究摘要');expect(errors).toEqual([])
 }finally{await f.dispose()}
},15000)
it('flushes a native editor before handing over its session and reloads rather than reusing its old snapshot',async()=>{
 const f=await fixture(),{page,store,errors}=f;try{
  await page.getByRole('tab',{name:'笔记'}).click();await page.locator('[data-note-editor-session="original-session"] .en-title').fill('用户最新草稿')
  await page.evaluate(async()=>{document.documentElement.dataset.homeGuideTransition='handover';await window.nativeNotes.prepareGuide('original-session')})
  expect(store.load('owner','original-session').saved.title).toBe('用户最新草稿');expect(await page.locator('[data-note-editor-session="original-session"]').count()).toBe(0)
  const previous=store.load('owner','original-session').saved;store.save('owner','original-session',previous.revision,{...previous,title:'交接后重新读取的版本'})
  await page.evaluate(()=>delete document.documentElement.dataset.homeGuideTransition)
  await expect.poll(()=>page.locator('[data-note-editor-session="original-session"] .en-title').inputValue()).toBe('交接后重新读取的版本');expect(errors).toEqual([])
 }finally{await f.dispose()}
},15000)
it('keeps the original native editor and its recovery draft when handover cannot confirm a conflicting save',async()=>{
 const f=await fixture(),{page,store,errors}=f;try{
  await page.getByRole('tab',{name:'笔记'}).click();await page.locator('[data-note-editor-session="original-session"] .en-title').fill('不能丢失的用户草稿')
  await expect.poll(()=>store.load('owner','original-session').draft?.title).toBe('不能丢失的用户草稿')
  await page.evaluate(()=>window.nativeNotes.prepareGuide('unrelated-session'));expect(await page.locator('[data-note-editor-session="original-session"] .en-title').inputValue()).toBe('不能丢失的用户草稿')
  const initial=store.load('owner','original-session').saved;store.save('owner','original-session',initial.revision,{title:'其他编辑器的新版本',blocks:[],yjs:''})
  const result=await page.evaluate(async()=>{document.documentElement.dataset.homeGuideTransition='handover';try{await window.nativeNotes.prepareGuide('original-session');return'cleared'}catch(error){return error.message}})
  expect(result).toContain('尚未保存');expect(await page.locator('[data-note-editor-session="original-session"] .en-title').inputValue()).toBe('不能丢失的用户草稿');expect(store.load('owner','original-session').saved.title).toBe('其他编辑器的新版本');expect(store.load('owner','original-session').draft?.title).toBe('不能丢失的用户草稿');expect(errors).toEqual([])
 }finally{await f.dispose()}
},15000)
it('keeps strict review alive during a long pause and then preserves the finished note',async()=>{
 const f=await fixture(),{page,errors,logs}=f;try{
  await page.evaluate(()=>window.guides.start('note'))
  const deadline=Date.now()+30000
  while(Date.now()<deadline){if(await page.locator('.en-challenge-popover').count()===0&&await page.locator('.en-challenge-grade').count()>0&&await page.locator('.en-challenge-grade').innerText()==='严格'&&await page.locator('[data-home-guide] .bn-editor [data-bn-thread-id]').count()<3)break;const next=page.locator('[data-home-guide-next]');if(await next.isEnabled())await next.click();await page.waitForTimeout(50)}
  await page.getByRole('button',{name:'暂停',exact:true}).click();await page.waitForTimeout(11200)
  expect(await page.locator('[data-home-guide] .bn-editor').count()).toBe(1);expect(await page.locator('[data-home-guide] [role=status]').innerText()).not.toContain('未就绪')
  await page.getByRole('button',{name:'继续播放',exact:true}).click();await complete(page);expect(await page.locator('[data-note-editor-session="example-note-1"] .bn-editor').innerText()).toContain('同比增长10%')
  expect(await page.locator('[data-home-guide]').count()).toBe(0);expect(errors).toEqual([]);expect(logs).toEqual([])
 }finally{await f.dispose()}
},65000)
