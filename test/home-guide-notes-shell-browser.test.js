import {execFileSync} from 'node:child_process'
import {homeNoteComponentsSource} from './fixtures/home-note-components.js'
import {noteLibraryItems,noteLibraryNode} from '../src/main/notes/component-library'
import {esbuildRawSource} from './helpers/esbuild-raw-source.mjs'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {NotesStore} from '../src/main/notes/store'
import {homeGuidePlaybackFixture} from './fixtures/home-guide-playback.js'
import {homeNoteNativeSessionBrowser,isolatedNoteStorage} from './fixtures/home-note-native-session-browser.js'
import {homeNoteChallengeSidebarSource} from './fixtures/home-note-challenge-sidebar.js'
let browser,script,css,nativeSessionScript
beforeAll(async()=>{
 const productionChart=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',"import{homeNotesGuideChart}from'./packages/dsh-research-task-runtime/home-notes-guide-artifacts.js';process.stdout.write(JSON.stringify(homeNotesGuideChart('fixture')))"],{encoding:'utf8'}))
 nativeSessionScript=await homeNoteNativeSessionBrowser()
 const challengeSidebar=await homeNoteChallengeSidebarSource()
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{mountHomeGuides}from'./src/preload/home-guides';import{mountHomeNotesGuide}from'./src/preload/home-guide-notes';import{mountNotes}from'./src/preload/notes/mount';import{WorkspaceSurfaceHost}from'./src/preload/workspace-surface-host';
 ${challengeSidebar}
 ${homeNoteComponentsSource()}
 const homeNotesGuideChart=runId=>{const result=structuredClone(${JSON.stringify(productionChart)});result.node.id='home-note-chart-'+runId;return result};
 import{HOME_NOTES_CHART_PROMPT,HOME_NOTES_TASK_PROMPT,HOME_NOTES_REWRITE_PROMPT,HOME_NOTES_GUIDE_SELECTION,HOME_NOTES_TASK_RESULT,HOME_NOTES_REWRITE_RESULT}from'./packages/dsh-research-task-runtime/home-notes-guide-contract.js';
 window.noteLoads=[];window.originalInput=document.querySelector('#original-draft');window.originalInput.focus();window.originalInput.setSelectionRange(1,3);
 window.guideCueHistory=[];window.addEventListener('sherlock:home-guide-cue',event=>{const detail=event.detail,target=detail.target??[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===detail.targetToken);window.guideCueHistory.push({label:detail.label,tag:target?.tagName,className:target?.className});});
 const bridge={request:async(method,input)=>{if(method==='load')window.noteLoads.push(input.sessionId);if(method==='library-list'&&window.failGuideLibrary)throw Error('组件库读取失败（测试）');if(method==='save'&&window.deferNoteSave)await new Promise(resolve=>setTimeout(resolve,200));return window.noteStorageRequest(method,input)},draft:input=>window.noteStorageRequest('draft',input)};
 const workspaceHost=new WorkspaceSurfaceHost(document);window.nativeNotes=mountNotes(document,bridge,workspaceHost);
 window.sessionCount=0;window.latestExample=undefined;
 // Only the external native-input/Host boundary is controlled here. The real
 // NotesApp captures references, generates, previews, applies and persists.
 window.noteNativeTasks=[];
 const nativeFor=options=>{let disposed=false,submission=0;const jobs=new Map();return{
  configureQuote:()=>window.configureFixtureQuote(),reviewSummary:()=>window.reviewFixtureSummary(),appendSummary:()=>window.appendFixtureSummary(options.runId,options.sessionId),
  async type(stage){if(disposed||options.signal.aborted)throw new DOMException('cancelled','AbortError');const submissionId=++submission;let accepted=false;const receive=event=>{if(event.detail?.sessionId===options.sessionId&&event.detail.submissionId===submissionId)accepted=true};document.addEventListener('sherlock:notes-submit-accepted',receive);try{document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:options.sessionId,submissionId,prompt:stage==='note'?HOME_NOTES_TASK_PROMPT:HOME_NOTES_REWRITE_PROMPT,images:[]}}))}finally{document.removeEventListener('sherlock:notes-submit-accepted',receive)}if(!accepted)throw Error('真实笔记编辑器未接受示例任务')},
  async generate(input){const controller=new AbortController();jobs.set(input.requestId,controller);try{window.noteNativeTasks.push({prompt:input.prompt,sessionId:input.sessionId,scope:input.context.scope,selection:input.selection,markdown:input.markdown});await options.wait(1800,AbortSignal.any([controller.signal,options.signal]));if(disposed)throw new DOMException('cancelled','AbortError');if(input.prompt===HOME_NOTES_CHART_PROMPT)return homeNotesGuideChart(options.runId);if(input.prompt===HOME_NOTES_TASK_PROMPT&&input.context.scope==='note'&&!input.selection&&input.markdown.includes('环比增长14.29%'))return{kind:'text',markdown:HOME_NOTES_TASK_RESULT};if(input.prompt===HOME_NOTES_REWRITE_PROMPT&&input.context.scope==='selection'&&!input.markdown&&input.selection===HOME_NOTES_GUIDE_SELECTION)return{kind:'text',markdown:HOME_NOTES_REWRITE_RESULT};throw Error('示例引用范围不匹配')}finally{jobs.delete(input.requestId)}},
  async stop(id){jobs.get(id)?.abort()},dispose(){disposed=true;for(const job of jobs.values())job.abort();jobs.clear()}
 }};
 const chooseView=view=>{for(const tab of document.querySelectorAll('[data-conversation-view-id]'))tab.setAttribute('aria-selected',String(tab.dataset.conversationViewId===view));document.querySelector('[data-ework-note-view]')?.remove();const id=document.querySelector('[data-ework-notes-session]').dataset.eworkNotesSession;if(view==='notes'){const anchor=document.createElement('div');anchor.dataset.eworkNoteView=id;document.querySelector('#resident-body').append(anchor);document.dispatchEvent(new CustomEvent('sherlock:notes-open',{detail:{sessionId:id}}))}else document.dispatchEvent(new CustomEvent('sherlock:notes-close',{detail:{sessionId:id}}));};
 for(const tab of document.querySelectorAll('[data-conversation-view-id]'))tab.addEventListener('click',()=>chooseView(tab.dataset.conversationViewId));
 window.addEventListener('sherlock:home-guide-session-request',event=>{const value=event.detail;let session;if(value.command==='prepare'){const fresh=!window.latestExample||value.replay===true;if(fresh)window.latestExample={sessionId:'example-note-'+(++window.sessionCount),cwd:'/example-notes',title:'笔记教程副本'};session={...window.latestExample,fresh};}else{session={...window.latestExample};const header=document.querySelector('[data-ework-notes-session]'),view=header.querySelector('[aria-selected=true]').dataset.conversationViewId;header.dataset.eworkNotesSession=session.sessionId;header.querySelector('[data-en-challenge-tools]').dataset.enChallengeTools=session.sessionId;chooseView(view);window.dispatchEvent(new CustomEvent('sherlock:home-action-context-changed'));}window.dispatchEvent(new CustomEvent('sherlock:home-guide-session-reply',{detail:{requestId:value.requestId,ok:true,...session}}));});
 window.guideHandoffCalls=[];window.guideHandoffReleases=[];window.guides=mountHomeGuides(document,{beforeOpen:session=>window.nativeNotes.prepareGuide(session.sessionId),prepareHandoff:async(session,signal)=>{window.guideHandoffCalls.push({sessionId:session.sessionId,aborted:signal.aborted});if(window.deferGuideHandoff)await new Promise(resolve=>window.releaseGuideHandoff=resolve);const release=await window.nativeNotes.finishGuide(session.sessionId,signal);return()=>{window.guideHandoffReleases.push(session.sessionId);release()}},revealConversation:()=>workspaceHost.revealConversation(),mountNotes:(doc,host,options)=>mountHomeNotesGuide(doc,host,{...options,persistence:bridge,native:nativeFor(options)}),mountPresentation:async()=>({runStep:async()=>{},dispose:()=>{}})});
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[esbuildRawSource(),homeGuidePlaybackFixture(),{name:'inline-styles',setup(b){b.onResolve({filter:/\.css\?(inline|raw)$/},async args=>{const found=await b.resolve(args.path.replace(/\?(inline|raw)$/,''),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>{const contents=await readFile(args.path,'utf8');if(!contents.includes('@import'))return{contents,loader:'text'};const compiled=await build({entryPoints:[args.path],conditions:['browser','import','style'],bundle:true,write:false,outfile:'notes.css',logLevel:'silent',loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'}});return{contents:compiled.outputFiles.find(file=>file.path.endsWith('.css')).text,loader:'text'}})}}]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text;css=output.outputFiles.find(file=>file.path.endsWith('.css'))?.text||''
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(paneWidth=600,{isolated=false,deferEngage=false}={}){
 const directory=mkdtempSync(join(tmpdir(),'home-guide-note-shell-')),store=new NotesStore(directory),requests=[]
 let releaseEngage;const engageGate=deferEngage?new Promise(resolve=>releaseEngage=resolve):Promise.resolve()
 const context=await browser.newContext({viewport:{width:paneWidth+480,height:752}}),page=await context.newPage(),errors=[],logs=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(['warning','error'].includes(message.type()))logs.push(message.text()+' '+JSON.stringify(message.location()))})
 await page.exposeFunction('noteStorageRequest',async(method,input)=>{if(method==='library-list')return noteLibraryItems({list:()=>[]});if(method==='library-read')return noteLibraryNode({list:()=>[]},input.id,'owner');requests.push({method,sessionId:input.sessionId});if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft')store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);if(method==='engage')await engageGate;if(method==='challenge')throw Error('教程不应请求真实模型');return{ok:true}})
 await page.route('http://127.0.0.1/notes-guide-shell',route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content"><title>首页笔记教程集成验收</title><style>body{margin:0;width:100vw;height:100vh;overflow:hidden;font-family:system-ui}.pI_x6G_centerCol{position:absolute;left:88px;top:10px;width:${paneWidth}px;bottom:10px;border-radius:12px;overflow:hidden;background:#eee}.wSkVaW_root{height:100%;position:relative}.wSkVaW_header{height:44px;display:flex;align-items:center;padding-inline:12px}.wSkVaW_header button{height:30px;border:0;border-radius:7px;padding:0 14px;background:transparent}.wSkVaW_header button[aria-selected=true]{background:#ddd}#original-draft{position:absolute;top:250px;left:20px;width:calc(100% - 50px)}[data-srb-tabs]{display:flex}.en-root{z-index:45}</style><div class="pI_x6G_centerCol"><div class="wSkVaW_root"><header class="wSkVaW_header" data-srb-session-header data-ework-notes-session="original-session"><div data-srb-tabs role="tablist"><button role="tab" data-conversation-view-id="chat" aria-selected="true">对话</button><button role="tab" data-conversation-view-id="research" aria-selected="false">研究</button><button role="tab" data-conversation-view-id="notes" aria-selected="false">笔记</button></div><div data-en-challenge-tools="original-session"></div></header><div id="resident-body" style="height:calc(100% - 44px)"><textarea id="original-draft">用户原有提示词与技能标签</textarea></div></div></div>`}))
 await page.route('http://127.0.0.1/sherlock-research.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));await page.route('http://127.0.0.1/fonts/NotoSansSC.woff2',route=>route.fulfill({path:'build/fonts/NotoSansSC.woff2',contentType:'font/woff2'}));await page.goto('http://127.0.0.1/notes-guide-shell');if(css)await page.addStyleTag({content:css})
 let evaluate=fn=>page.evaluate(fn)
 if(isolated){
  await page.addScriptTag({content:nativeSessionScript})
  const cdp=await context.newCDPSession(page),{frameTree}=await cdp.send('Page.getFrameTree'),{executionContextId}=await cdp.send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'notes-preload',grantUniversalAccess:true})
  const run=async expression=>{const value=await cdp.send('Runtime.evaluate',{expression,contextId:executionContextId,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value}
  evaluate=fn=>run('('+fn.toString()+')()')
  await run(isolatedNoteStorage+script)
 }else await page.addScriptTag({content:script})
 return{context,page,errors,logs,store,requests,evaluate,releaseEngage,dispose:async()=>{releaseEngage?.();await context.close();rmSync(directory,{recursive:true,force:true})}}
}
// Real public "next" actions skip reading holds in this focused test; adapters
// retain their actual stream, native scheduler and UI-stability waits.
async function complete(page,evaluate=fn=>page.evaluate(fn)){
 const deadline=Date.now()+110000;let capturedPopover=false
 while(Date.now()<deadline){
  const failure=await evaluate(()=>window.__testHomeGuideError);if(failure)throw Error(JSON.stringify(failure)+' '+JSON.stringify(await evaluate(()=>window.__testNoteSentenceGeometry))+' '+JSON.stringify(await evaluate(()=>window.guideCueHistory)))
  if(await page.locator('[data-home-guide]').count()===0)return
  const phase=await page.locator('[data-home-guide]').getAttribute('data-phase');if(phase==='completed'){await expect.poll(()=>page.locator('[data-home-guide]').count()).toBe(0);return}
  if(phase==='error')throw Error(await page.locator('.odyssey-home-guide-status').innerText()+' '+JSON.stringify(await evaluate(()=>window.guideCueHistory)))
  if(!capturedPopover&&await page.locator('.en-challenge-popover').count()){
   expect(await page.locator('.en-challenge-popover').evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return node===hit||node.contains(hit)})).toBe(true)
   await page.screenshot({path:'/tmp/home-guide-note-native-popover-20261025.png'});capturedPopover=true
  }
  await evaluate(()=>{if(window.__testHomeGuideTimeline.snapshot().holding)window.__testHomeGuideTimeline.next()})
  await page.waitForTimeout(90)
 }
 throw Error('笔记教程未完成：'+await page.locator('.odyssey-home-guide-status').innerText())
}
it('creates a new native session after an isolated Notes walkthrough without losing the saved note or applied task history',async()=>{
 const f=await fixture(600,{isolated:true}),{page,evaluate,store}=f;try{
  expect(await page.evaluate(()=>typeof window.guides)).toBe('undefined')
  expect(await evaluate(()=>typeof window.nativeSessionProbe)).toBe('undefined')
  await evaluate(()=>window.guides.start('note'));await complete(page,evaluate)
  const saved=store.load('owner','example-note-1'),tasks=await evaluate(()=>window.noteNativeTasks)
  expect(tasks.map(task=>task.scope)).toEqual(['note','selection','note'])
  expect(JSON.stringify(saved.saved.blocks)).toContain('环比增长14.29%')
  expect(JSON.stringify(saved.saved.blocks)).toContain('后续跟踪分为三项')
  await page.getByRole('tab',{name:'对话'}).click()
  const before=await page.evaluate(()=>window.nativeSessionProbe.snapshot())
  expect(before.current).toBe('example-note-1')
  await page.getByRole('button',{name:'新建对话',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.nativeSessionProbe.snapshot().created.length)).toBe(1)
  const after=await page.evaluate(()=>window.nativeSessionProbe.snapshot())
  expect(after.current).not.toBe('example-note-1');expect(after.current).toBe(after.created[0].sessionId)
  expect(after.byId['example-note-1'].blank).toBe(false)
  expect(store.load('owner','example-note-1')).toEqual(saved)
  expect(await evaluate(()=>window.noteNativeTasks)).toEqual(tasks)
  await page.waitForTimeout(100)
  expect((await page.evaluate(()=>window.nativeSessionProbe.snapshot())).current).toBe(after.current)
  // The guide handoff must leave ordinary Notes' own edit/retention path intact.
  await page.getByRole('tab',{name:'笔记'}).click()
  const ordinary=page.locator('[data-note-editor-session="'+after.current+'"] .en-title')
  await ordinary.fill('普通笔记的真实编辑')
  await expect.poll(()=>page.evaluate(()=>{const value=window.nativeSessionProbe.snapshot();return value.byId[value.current].blank})).toBe(false)
  await page.getByRole('tab',{name:'对话'}).click()
  await expect.poll(()=>store.load('owner',after.current).saved.title).toBe('普通笔记的真实编辑')
  expect(store.load('owner','example-note-1')).toEqual(saved)
  expect(f.errors).toEqual([]);expect(f.logs).toEqual([])
 }finally{await f.dispose()}
},130000)
it('keeps replayed and interrupted Notes copies while native New Chat leaves them without a late guide selection',async()=>{
 const f=await fixture(600,{isolated:true}),{page,evaluate,store}=f;try{
  const write=async()=>{await expect.poll(()=>page.locator('[data-home-guide] .bn-editor').innerText(),{timeout:6000}).toContain('固定历史区间')}
  await evaluate(()=>window.guides.start('note'));await write()
  await evaluate(()=>window.guides.start('note',{replay:true}));await write()
  await page.getByRole('tab',{name:'对话'}).click();await expect.poll(()=>page.locator('[data-home-guide]').count()).toBe(0)
  const copies=['example-note-1','example-note-2'].map(id=>store.load('owner',id))
  for(const note of copies)expect(JSON.stringify(note.saved.blocks)).toContain('固定历史区间')
  const before=await page.evaluate(()=>window.nativeSessionProbe.snapshot())
  expect(before.retained).toEqual(['example-note-1','example-note-2'])
  await page.getByRole('button',{name:'新建对话',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.nativeSessionProbe.snapshot().created.length)).toBe(1)
  const after=await page.evaluate(()=>window.nativeSessionProbe.snapshot())
  expect(after.current).toBe(after.created[0].sessionId)
  expect(['example-note-1','example-note-2'].map(id=>store.load('owner',id))).toEqual(copies)
  await page.waitForTimeout(150)
  expect((await page.evaluate(()=>window.nativeSessionProbe.snapshot())).current).toBe(after.current)
  expect(f.errors).toEqual([]);expect(f.logs).toEqual([])
 }finally{await f.dispose()}
},25000)
it('does not reselect or emit a late edit after cancelling an isolated guide with its Host engage reply pending',async()=>{
 const f=await fixture(600,{isolated:true,deferEngage:true}),{page,evaluate,store}=f;try{
  await evaluate(()=>window.guides.start('note'))
  await expect.poll(()=>f.requests.some(item=>item.method==='engage'),{timeout:6000}).toBe(true)
  await page.getByRole('button',{name:'新建对话',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.nativeSessionProbe.snapshot().created.length)).toBe(1)
  await expect.poll(()=>page.locator('[data-home-guide]').count()).toBe(0)
  const before=await page.evaluate(()=>window.nativeSessionProbe.snapshot()),saved=store.load('owner','example-note-1')
  expect(before.retained).toEqual(['example-note-1']);expect(saved.saved.title).toContain('中际旭创｜增长兑现与估值复盘')
  f.releaseEngage();await page.waitForTimeout(200)
  expect(await page.evaluate(()=>window.nativeSessionProbe.snapshot())).toEqual(before)
  expect(store.load('owner','example-note-1')).toEqual(saved)
  expect(await evaluate(()=>window.noteNativeTasks)).toEqual([])
  expect(f.errors).toEqual([]);expect(f.logs).toEqual([])
 }finally{await f.dispose()}
},15000)
async function startWriting(page){await page.evaluate(()=>window.guides.start('note'));await expect.poll(()=>page.locator('[data-home-guide] .bn-editor').innerText(),{timeout:6000}).toContain('固定历史区间')}
for(const width of [600,700])it(`saves and reopens the native note without clipping a ${width}px pane walkthrough`,async()=>{
 const f=await fixture(width),{page,errors,logs,store,requests}=f;try{
  await page.evaluate(()=>window.guides.start('note'))
  await expect.poll(()=>page.locator('.odyssey-home-guide-pointer').evaluate(node=>node.hidden),{timeout:5000}).toBe(false)
  expect(await page.locator('.odyssey-home-guide-footer,[data-home-guide] [role=toolbar]').count()).toBe(0);expect(await page.locator('.odyssey-home-guide-fault').isVisible()).toBe(false)
  await page.screenshot({path:'/tmp/home-guide-note-virtual-pointer-'+width+'-20261025.png'})
  expect(await page.locator('[data-home-guide]').evaluate(root=>{const box=root.getBoundingClientRect(),pane=document.querySelector('.pI_x6G_centerCol').getBoundingClientRect(),footer=root.querySelector('.odyssey-home-guide-footer'),content=root.querySelector('[data-home-guide-content]').getBoundingClientRect();return box.left>=pane.left&&box.right<=pane.right+1&&box.bottom<=pane.bottom+1&&Math.abs(content.bottom-box.bottom)<1&&footer===null&&root.scrollWidth<=root.clientWidth})).toBe(true)
  await complete(page)
  expect(await page.getByRole('tab',{name:'笔记'}).getAttribute('aria-selected')).toBe('true');expect(await page.locator('[data-note-editor-session="example-note-1"] .bn-editor').innerText()).toContain('环比增长14.29%')
  expect(await page.evaluate(()=>document.querySelector('#original-draft')===window.originalInput&&window.originalInput.value==='用户原有提示词与技能标签')).toBe(true)
  await page.screenshot({path:'/tmp/home-guide-notes-natural-shell-'+width+'-20261024.png'})
  expect(await page.locator('[data-home-guide]').count()).toBe(0)
  await expect.poll(()=>page.locator('[data-note-editor-session="example-note-1"] .bn-editor').innerText()).toContain('环比增长14.29%')
  expect(store.load('owner','example-note-1').saved.yjs.length).toBeGreaterThan(1000);expect(requests.some(item=>item.sessionId==='original-session')).toBe(false);expect(requests.some(item=>item.method==='challenge')).toBe(false)
  expect(await page.evaluate(()=>window.noteNativeTasks.map(task=>task.scope))).toEqual(['note','selection','note'])
  expect(JSON.stringify(store.load('owner','example-note-1').saved.blocks)).toContain('后续跟踪分为三项')
  expect(JSON.stringify(store.load('owner','example-note-1').saved.blocks)).toContain('中际旭创的增长兑现')
  await page.evaluate(()=>window.guides.start('note'));expect(await page.locator('[data-home-guide]').count()).toBe(0);await expect.poll(()=>page.locator('[data-note-editor-session="example-note-1"] .bn-editor').innerText()).toContain('环比增长14.29%')
  expect(errors).toEqual([]);expect(logs).toEqual([])
 }finally{await f.dispose()}
},130000)
it('hands a failed original slash library back to ordinary Notes with the partial chart intact',async()=>{
 const f=await fixture(),{page,store,errors}=f;try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{window.failGuideLibrary=true;window.errorHandoffFrames=[];window.endingOwners=[];window.addEventListener('sherlock:home-guide-playback',event=>{if(event.detail.ending)window.endingOwners.push({runId:event.detail.runId,token:document.documentElement.dataset.homeGuidePointerRun})});window.captureErrorHandoff=true;let fault=false;const sample=()=>{fault||=document.querySelector('[data-home-guide]')?.dataset.phase==='error';if(fault)window.errorHandoffFrames.push({guide:!!document.querySelector('[data-home-guide] .bn-editor')?.textContent?.trim(),normal:document.body.dataset.workspaceSurface==='notes'&&!!document.querySelector('[data-note-editor-session="example-note-1"] .bn-editor')?.textContent?.trim()});if(window.captureErrorHandoff)requestAnimationFrame(sample)};requestAnimationFrame(sample);void window.guides.start('note')})
  await expect.poll(()=>page.locator('[data-note-editor-session="example-note-1"] .bn-editor').count(),{timeout:45000}).toBe(1)
  expect(await page.locator('[data-home-guide]').count()).toBe(0)
  expect(await page.locator('[data-note-editor-session="example-note-1"] .en-title').inputValue()).toContain('中际旭创｜增长兑现与估值复盘')
  const saved=store.load('owner','example-note-1').saved;expect(saved.blocks.filter(block=>block.type==='research')).toHaveLength(1)
  expect(await page.evaluate(()=>window.guideHandoffCalls)).toEqual([{sessionId:'example-note-1',aborted:false}]);expect(await page.evaluate(()=>window.guideHandoffReleases)).toEqual(['example-note-1'])
  const owners=await page.evaluate(()=>window.endingOwners);expect(owners).toHaveLength(1);expect(owners[0].token).toBe(owners[0].runId)
  const frames=await page.evaluate(()=>{window.captureErrorHandoff=false;return window.errorHandoffFrames});expect(frames.length).toBeGreaterThan(0);expect(frames.filter(frame=>!frame.guide&&!frame.normal)).toEqual([]);expect(errors).toEqual([])
 }finally{await f.dispose()}
},55000)
it.each(['cancel','A-B-A'])('does not reopen a failed Notes handoff after %s',async action=>{
 const f=await fixture(),{page,store,errors}=f;try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{window.failGuideLibrary=true;window.deferGuideHandoff=true;void window.guides.start('note')})
  await expect.poll(()=>page.evaluate(()=>typeof window.releaseGuideHandoff==='function'),{timeout:45000}).toBe(true)
  expect(await page.locator('[data-home-guide] .bn-editor').count()).toBe(1)
  await page.evaluate(async action=>{if(action==='cancel')await window.guides.reset(false);else{const header=document.querySelector('[data-ework-notes-session]');header.dataset.eworkNotesSession='original-session';window.dispatchEvent(new CustomEvent('sherlock:home-action-context-changed'));header.dataset.eworkNotesSession='example-note-1'}document.querySelector('[data-conversation-view-id="chat"]').click();window.releaseGuideHandoff()},action)
  await expect.poll(()=>page.locator('[data-home-guide]').count()).toBe(0);await page.waitForTimeout(250)
  expect(await page.evaluate(()=>window.guideHandoffReleases)).toEqual([]);expect(await page.getByRole('tab',{name:'对话'}).getAttribute('aria-selected')).toBe('true')
  expect(store.load('owner','example-note-1').saved.blocks.filter(block=>block.type==='research')).toHaveLength(1);expect(errors).toEqual([])
 }finally{await f.dispose()}
},55000)
it('pauses readable writing and replays into a new session while preserving the first partial result',async()=>{
 const f=await fixture(),{page,store,errors}=f;try{
  await startWriting(page);await page.evaluate(()=>window.__testHomeGuideTimeline.pause());await page.waitForTimeout(180);const paused=await page.locator('[data-home-guide] .bn-editor').innerText();await page.waitForTimeout(350);expect(await page.locator('[data-home-guide] .bn-editor').innerText()).toBe(paused)
  await page.evaluate(()=>window.guides.start('note',{replay:true}));await expect.poll(()=>page.locator('[data-ework-notes-session]').getAttribute('data-ework-notes-session')).toBe('example-note-2')
  expect(store.load('owner','example-note-1').saved.title).toContain('中际旭创｜增长兑现与估值复盘');expect(JSON.stringify(store.load('owner','example-note-1').saved.blocks)).toContain('固定历史区间')
  await page.keyboard.press('Escape');await expect.poll(()=>page.locator('[data-home-guide]').count()).toBe(0);expect(errors).toEqual([])
 }finally{await f.dispose()}
},15000)
it('preserves partial content and respects a user switching native tabs',async()=>{
 const f=await fixture(),{page,store,errors}=f;try{
  await startWriting(page);await page.getByRole('tab',{name:'对话'}).click();await expect.poll(()=>page.locator('[data-home-guide]').count()).toBe(0)
  expect(await page.getByRole('tab',{name:'对话'}).getAttribute('aria-selected')).toBe('true');expect(store.load('owner','example-note-1').saved.title).toContain('中际旭创｜增长兑现与估值复盘')
  await page.getByRole('tab',{name:'笔记'}).click();await expect.poll(()=>page.locator('[data-note-editor-session="example-note-1"] .bn-editor').innerText()).toContain('固定历史区间');expect(errors).toEqual([])
 }finally{await f.dispose()}
},15000)
it('awaits a delayed final save before exposing the native Notes surface',async()=>{
 const f=await fixture(),{page,errors}=f;try{
  await startWriting(page);await page.evaluate(()=>window.deferNoteSave=true);await page.keyboard.press('Escape')
  expect(await page.locator('[data-home-guide]').count()).toBe(1);expect(await page.locator('[data-note-editor-session]').count()).toBe(0)
  await expect.poll(()=>page.locator('[data-home-guide]').count()).toBe(0);await expect.poll(()=>page.locator('[data-note-editor-session="example-note-1"] .bn-editor').innerText()).toContain('固定历史区间');expect(errors).toEqual([])
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
  // Writing motion is covered by the full walkthroughs above. Start this
  // scheduler test quickly enough to pause the actual strict review itself.
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.evaluate(()=>window.guides.start('note'))
  const deadline=Date.now()+30000;let reachedStrict=false
  while(Date.now()<deadline){if(await page.locator('.en-challenge-popover').count()===0&&await page.locator('.en-challenge-grade').count()>0&&await page.locator('.en-challenge-grade').innerText()==='严格'&&await page.locator('[data-home-guide] .bn-editor [data-bn-thread-id]').count()<4){reachedStrict=true;break}await page.evaluate(()=>{if(window.__testHomeGuideTimeline.snapshot().holding)window.__testHomeGuideTimeline.next()});await page.waitForTimeout(50)}
  expect(reachedStrict).toBe(true)
  await page.evaluate(()=>window.__testHomeGuideTimeline.pause());await page.waitForTimeout(11200)
  expect(await page.locator('[data-home-guide] .bn-editor').count()).toBe(1);expect(await page.locator('.odyssey-home-guide-status').innerText()).not.toContain('未就绪')
  await page.evaluate(()=>window.__testHomeGuideTimeline.play());await complete(page);expect(await page.locator('[data-note-editor-session="example-note-1"] .bn-editor').innerText()).toContain('环比增长14.29%')
  expect(await page.locator('[data-home-guide]').count()).toBe(0);expect(errors).toEqual([]);expect(logs).toEqual([])
 }finally{await f.dispose()}
},130000)
