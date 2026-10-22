import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
let browser,script
const review={version:1,issues:[{blockId:'p',quote:'审和',category:'typo',message:'应为审核。',evidence:[]}],coveredBlockIds:['p','clean'],completeBlockIds:['p','clean'],checks:[{kind:'review',status:'completed',detail:'两段已检查。'}]}
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{mountNotes}from'./src/preload/notes/mount';import*as Y from'yjs';
 window.calls=[];window.jobs=[];window.saved={};window.drafts={};window.editors={};window.failSave={};window.holdSave={};window.saveJobs=[];window.referenceEvents=[];window.activityEvents=[];window.windowFocused=true;
 Object.defineProperty(document,'hasFocus',{value:()=>window.windowFocused});document.addEventListener('sherlock:notes-reference-state',event=>window.referenceEvents.push(event.detail));
 document.addEventListener('sherlock:notes-challenge-activity',event=>window.activityEvents.push(event.detail));
 const initial=id=>({title:id,blocks:id==='note-a'?[{id:'p',type:'paragraph',content:'材料已完成审和。'},{id:'clean',type:'paragraph',content:'共有十份材料。'}]:[{id:'b',type:'paragraph',content:'另一个会话的正文和草稿。'}],yjs:'',revision:0});
 const bridge={request:async(method,input)=>{window.calls.push({method,input});if(method==='load')return{saved:window.saved[input.sessionId]||initial(input.sessionId)};if(method==='challenge')return new Promise(resolve=>window.jobs.push({input,resolve}));if(method==='save'){if(window.holdSave[input.sessionId])await new Promise(resolve=>window.saveJobs.push({input,resolve}));if(window.failSave[input.sessionId])throw Error('保存失败fixture');const saved={...input.content,revision:input.revision+1};window.saved[input.sessionId]=saved;return{status:'saved',saved}}return{}},draft:async input=>{window.drafts[input.sessionId]=input.content}};
 const host={register:(_mode,surface)=>{surface.style.left='0';document.body.append(surface)},open:()=>{},close:()=>{},current:()=>({surface:'notes'})};window.mounted=mountNotes(document,bridge,host);
 window.switchNote=id=>{document.querySelector('[data-ework-notes-session]').dataset.eworkNotesSession=id;document.querySelector('[data-ework-note-view]').dataset.eworkNoteView=id;document.dispatchEvent(new CustomEvent('sherlock:notes-open',{detail:{sessionId:id}}))};
 window.savedReview=id=>{const value=window.saved[id];if(!value?.yjs)return null;const doc=new Y.Doc();Y.applyUpdate(doc,Uint8Array.from(atob(value.yjs),c=>c.charCodeAt(0)));try{return{state:doc.getMap('note-challenge-results').get('state'),threads:doc.getMap('threads').size}}finally{doc.destroy()}};
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'styles',setup(b){b.onResolve({filter:/\.css\?inline$/},async args=>{const found=await b.resolve(args.path.slice(0,-7),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}},{name:'editors',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('  const slashMenu = useMemo','  window.editors[props.sessionId]={editor,challenge,doc,active:props.active!==false}; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(){
 const context=await browser.newContext({viewport:{width:1400,height:900}}),page=await context.newPage(),errors=[]
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(5000)
 await page.route('http://127.0.0.1/background-review',route=>route.fulfill({contentType:'text/html',body:'<header data-ework-notes-session="note-a"></header><div data-ework-note-view="note-a"></div>'}))
 await page.goto('http://127.0.0.1/background-review');await page.addScriptTag({content:script});await page.locator('[data-note-source-session="note-a"] .bn-editor').waitFor();await page.evaluate(()=>window.editors['note-a'].editor.replaceBlocks(window.editors['note-a'].editor.document,[{id:'p',type:'paragraph',content:'材料已完成审和。'},{id:'clean',type:'paragraph',content:'共有十份材料。'}]));await page.clock.install()
 return{context,page,errors}
}
async function start(page){await page.evaluate(()=>window.editors['note-a'].challenge.setLevel(2));await expect.poll(()=>page.evaluate(()=>window.editors['note-a'].challenge.level)).toBe(2);await page.clock.fastForward(2600);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)}
async function finish(page){await page.evaluate(value=>window.jobs[0].resolve(value),review)}

it.each(['blur','mode'])('saves a started review after %s without a new hidden request',async kind=>{
 const{context,page,errors}=await fixture();try{
  await start(page)
  await page.evaluate(kind=>{if(kind==='blur'){window.windowFocused=false;window.dispatchEvent(new Event('blur'))}else{document.querySelector('.en-root').hidden=true;document.dispatchEvent(new Event('sherlock:workspace-surface-change'))}},kind)
  expect(await page.evaluate(()=>window.calls.filter(call=>call.method==='challenge-stop').length)).toBe(0)
  await finish(page);await expect.poll(()=>page.evaluate(()=>window.savedReview('note-a')?.state?.entries?.length)).toBe(2)
  await page.clock.fastForward(60000);expect(await page.evaluate(()=>window.jobs.length)).toBe(1)
  await page.evaluate(()=>{window.windowFocused=true;document.querySelector('.en-root').hidden=false;window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('sherlock:workspace-surface-change'))})
  await expect.poll(()=>page.locator('.en-challenge-paragraph-line:not([data-exiting])').count()).toBe(2);expect(errors).toEqual([])
 }finally{await context.close()}
})

it('retains only the in-flight session until confirmed save, then restores issues and clean coverage on return',async()=>{
 const{context,page,errors}=await fixture();try{
  await start(page);await page.evaluate(()=>window.switchNote('note-b'));await page.locator('[data-note-source-session="note-b"] .bn-editor').waitFor()
  expect(await page.locator('[data-note-source-session="note-a"]').count()).toBe(1)
  expect(await page.evaluate(()=>window.calls.filter(call=>call.method==='challenge-stop').length)).toBe(0)
  await page.evaluate(()=>window.referenceEvents=[]);await finish(page)
  await expect.poll(()=>page.evaluate(()=>window.savedReview('note-a')?.state?.entries?.length)).toBe(2)
  await expect.poll(()=>page.locator('[data-note-source-session="note-a"]').count()).toBe(0)
  expect(await page.locator('[data-note-source-session="note-b"] .en-title').inputValue()).toBe('note-b')
  expect(await page.evaluate(()=>window.referenceEvents.some(event=>event.sessionId==='note-a'))).toBe(false)
  await page.clock.fastForward(60000);expect(await page.evaluate(()=>window.jobs.length)).toBe(1)
  await page.evaluate(()=>window.switchNote('note-a'));await page.locator('[data-note-source-session="note-a"] .bn-editor').waitFor()
  await expect.poll(()=>page.locator('.en-challenge-paragraph-line:not([data-exiting])').count()).toBe(2)
  expect(await page.evaluate(()=>window.editors['note-a'].challenge.threads.length)).toBe(1)
  await page.clock.fastForward(2100);expect(await page.evaluate(()=>window.jobs.length)).toBe(1);expect(errors).toEqual([])
 }finally{await context.close()}
})

it('retains a background result after save failure and retries only in its original session',async()=>{
 const{context,page,errors}=await fixture();try{
  await start(page);await page.evaluate(()=>{window.failSave['note-a']=true;window.switchNote('note-b')});await page.locator('[data-note-source-session="note-b"] .bn-editor').waitFor();await finish(page)
  await expect.poll(()=>page.evaluate(()=>window.calls.filter(call=>call.method==='save'&&call.input.sessionId==='note-a').length)).toBeGreaterThan(0)
  expect(await page.locator('[data-note-source-session="note-a"]').count()).toBe(1)
  const attempts=await page.evaluate(()=>window.calls.filter(call=>call.method==='save'&&call.input.sessionId==='note-a').length)
  await page.evaluate(()=>{window.failSave['note-a']=false;window.referenceEvents=[];window.dispatchEvent(new KeyboardEvent('keydown',{key:'s',metaKey:true,bubbles:true}));document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'note-a',prompt:'不能发给后台笔记'}}));document.dispatchEvent(new CustomEvent('sherlock:notes-reference-action',{detail:{sessionId:'note-a',action:'toggle'}}))})
  expect(await page.evaluate(()=>window.calls.filter(call=>call.method==='save'&&call.input.sessionId==='note-a').length)).toBe(attempts)
  expect(await page.evaluate(()=>window.calls.some(call=>call.method==='generate'))).toBe(false)
  expect(await page.evaluate(()=>window.referenceEvents.some(event=>event.sessionId==='note-a'))).toBe(false)
  await page.evaluate(()=>{window.failSave['note-a']=false;window.switchNote('note-a')});await expect.poll(()=>page.evaluate(()=>window.savedReview('note-a')?.state?.entries?.length)).toBe(2)
  await page.evaluate(()=>window.switchNote('note-b'));await expect.poll(()=>page.locator('[data-note-source-session="note-a"]').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
})

it('keeps one original editor across A to B to A while saving and ignores a retired instance lease',async()=>{
 const{context,page,errors}=await fixture();try{
  await start(page)
  const original=await page.evaluate(()=>({activityId:window.activityEvents.find(event=>event.sessionId==='note-a'&&event.running).instanceId,instanceId:window.editors['note-a'].doc.clientID}))
  const retired=await page.evaluate(()=>{window.holdSave['note-a']=true;window.switchNote('note-b');return window.editors['note-a'].doc.clientID})
  await page.locator('[data-note-source-session="note-b"] .bn-editor').waitFor();await finish(page)
  await expect.poll(()=>page.evaluate(()=>window.saveJobs.length)).toBeGreaterThan(0)
  await page.evaluate(()=>window.switchNote('note-a'));await expect.poll(()=>page.evaluate(()=>window.editors['note-a'].active)).toBe(true)
  expect(await page.evaluate(()=>window.editors['note-a'].doc.clientID)).toBe(original.instanceId)
  expect(await page.locator('[data-note-source-session="note-a"]').count()).toBe(1)
  await page.evaluate(()=>{delete window.holdSave['note-a'];window.saveJobs.splice(0).forEach(job=>job.resolve())})
  await expect.poll(()=>page.evaluate(()=>window.savedReview('note-a')?.state?.entries?.length)).toBe(2)
  await page.evaluate(()=>window.switchNote('note-b'));await expect.poll(()=>page.locator('[data-note-source-session="note-a"]').count()).toBe(0)
  await page.evaluate(()=>window.switchNote('note-a'));await page.locator('[data-note-source-session="note-a"] .bn-editor').waitFor()
  await expect.poll(()=>page.locator('.en-challenge-paragraph-line:not([data-exiting])').count()).toBe(2)
  expect(await page.evaluate(()=>window.editors['note-a'].doc.clientID)).not.toBe(retired)
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-challenge-recheck',{detail:{sessionId:'note-a'}})));await page.clock.fastForward(1)
  await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(2)
  await page.evaluate(instanceId=>{document.dispatchEvent(new CustomEvent('sherlock:notes-challenge-activity',{detail:{sessionId:'note-a',instanceId,retaining:false}}));window.switchNote('note-b')},original.activityId)
  await page.locator('[data-note-source-session="note-b"] .bn-editor').waitFor()
  expect(await page.locator('[data-note-source-session="note-a"]').count()).toBe(1)
  expect(await page.evaluate(()=>window.calls.filter(call=>call.method==='challenge-stop').length)).toBe(0)
  await page.evaluate(value=>window.jobs[1].resolve(value),review);await expect.poll(()=>page.locator('[data-note-source-session="note-a"]').count()).toBe(0)
  expect(errors).toEqual([])
 }finally{await context.close()}
})

it.each(['off','edit','identity'])('does not apply a late review after %s',async action=>{
 const{context,page,errors}=await fixture();try{
  await start(page);await page.evaluate(action=>{const current=window.editors['note-a'];if(action==='off')current.challenge.setLevel(0);if(action==='edit')current.editor.updateBlock('p',{content:'已经改成新的正文。'});if(action==='identity')window.mounted.resetIdentity()},action)
  await finish(page);await page.clock.fastForward(800)
  expect(await page.evaluate(()=>window.savedReview('note-a')?.threads||0)).toBe(0)
  if(action!=='edit')expect(await page.evaluate(()=>window.calls.some(call=>call.method==='challenge-stop'))).toBe(true)
  expect(errors).toEqual([])
 }finally{await context.close()}
})
