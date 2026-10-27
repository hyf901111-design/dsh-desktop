import {beforeAll,afterAll,expect,it} from 'vitest'
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
const require=createRequire(import.meta.url),helpers=process.env.SHERLOCK_NEW_CHAT_BASELINE_HELPERS,{patchSessionViewPreferences,patchNewChatSessionRuntime,patchNewChatSidebar}=require(helpers?helpers+'/session-view-preferences.mjs':'../scripts/lib/session-view-preferences.mjs'),{patchFigmaWorkspaceMenus}=require(helpers?helpers+'/figma-workspace-menus.mjs':'../scripts/lib/figma-workspace-menus.mjs')
const out='/tmp/release140-new-chat-view-20261027',base='node_modules/@deepseek-ai/'
let browser,script,input,css
const expose=(source,names)=>source.replace('exports.apply = apply;',`exports.apply = apply;${names.map(name=>`exports.__test${name}=typeof ${name}==='undefined'?undefined:${name};`).join('')}`)
beforeAll(async()=>{
 await mkdir(out,{recursive:true});const rawRuntime=await readFile(base+'dsh-client-runtime/lib/client.js','utf8'),runtime=patchNewChatSessionRuntime?patchNewChatSessionRuntime(rawRuntime):rawRuntime,conversation=expose(patchSessionViewPreferences(await readFile(base+'dsh-client-ui-conversation/lib/client.js','utf8')),['createChatStore','HomeGuideNativeOriginalConversationRoot','ConversationSessionHeader','ConversationSession','InputBar','installInitialChatViewIntent']),rawSidebar=await readFile(base+'dsh-client-ui-sidebar/lib/client.js','utf8'),sidebar=expose(patchNewChatSidebar?patchNewChatSidebar(rawSidebar):rawSidebar,['SidebarRoot','zh']),workspace=expose(patchFigmaWorkspaceMenus(await readFile(base+'dsh-client-ui-workspace/lib/client.js','utf8')),['WorkspaceBrowser','createWorkspaceViewStore','zh'])
 input={runtime,conversation:conversation.replace('exports.__testHomeGuideNativeOriginalConversationRoot=', 'exports.__testNativeRoot=').replace('exports.apply = apply;','exports.apply = apply;exports.__testsetBoards=page=>{sherlockBoardsAdapter=page};'),sidebar,workspace};const built=await build({entryPoints:['test/fixtures/new-chat-view-browser.tsx'],bundle:true,platform:'browser',format:'iife',write:false,loader:{'.css':'empty','.svg':'dataurl'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});script=built.outputFiles[0].text
 const assets=base+'dsh-web-frontend/dist/assets',name=(await readdir(assets)).find(name=>/^index-.*\.css$/.test(name));css=await readFile(require.resolve('@deepseek-ai/dsh-client-ui-theme/styles/design-platform.css'),'utf8')+'\n'+await readFile(assets+'/'+name,'utf8');css+='\n'+[conversation,sidebar,workspace].flatMap(source=>[...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(m=>JSON.parse(m[1]))).join('\n')
 const pw=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await(pw.chromium??pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(()=>browser?.close())
async function fixture(options={}){const page=await browser.newPage({viewport:{width:1180,height:800}}),errors=[];page.setDefaultTimeout(4000);page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>'+css+'#sidebar{position:fixed;left:0;top:0;bottom:0;width:260px}.pI_x6G_centerCol{position:fixed;left:270px;right:10px;top:10px;bottom:10px}.wSkVaW_root{height:100%}#right{position:fixed;right:10px;bottom:10px;width:300px}</style><main id="app"></main>'}));await page.goto('http://new-chat.local/');await page.evaluate(input=>{window.newChatInput=input},input);await page.addScriptTag({content:script});await page.addStyleTag({content:'#app{height:100vh}#app>.pI_x6G_centerCol{position:fixed;left:270px;right:10px;top:10px;bottom:10px;width:calc(100vw - 280px);height:calc(100vh - 20px);margin:0;isolation:isolate}'});await page.waitForSelector('[data-fixture-ready=true]',{state:'attached'});await page.evaluate(options=>window.newChatFixture.reset(options),options);await expect.poll(()=>page.locator('.wSkVaW_root[data-odyssey-page=home]').count()).toBe(1);expect(errors).toEqual([]);return{page,errors}}
it.each([{entry:'sidebar',warm:false,initial:true},{entry:'workspace',warm:false,initial:true},{entry:'sidebar',warm:true,initial:false},{entry:'workspace',warm:true,initial:false}])('opens only the Chat homepage from $entry with cached=$warm initialResearch=$initial',async options=>{
 const {page,errors}=await fixture(options)
 try{
  const before=await page.evaluate(()=>JSON.stringify(window.newChatFixture.shellFor('current').snapshot));await page.evaluate(()=>{window.newChatFixture.pageFrames=[]})
  if(options.entry==='sidebar')await page.getByRole('button',{name:'新建对话',exact:true}).click();else{await page.locator('[aria-label="工作区“当前工作区”的操作"]').locator('xpath=ancestor::*[@role="treeitem"][1]').hover();await page.getByRole('button',{name:'在“当前工作区”中新建会话',exact:true}).click()}
  await expect.poll(()=>page.evaluate(()=>window.newChatFixture.sessions.list.getSnapshot().current)).toBe('target').catch(async error=>{await writeFile(out+'/fixture-diagnostic-'+options.entry+'.json',JSON.stringify(await page.evaluate(()=>({events:window.newChatFixture.events,current:window.newChatFixture.sessions.list.getSnapshot(),workspace:window.newChatFixture.workspaces.list.getSnapshot(),body:document.body.innerText})),null,2));throw error})
  await expect.poll(()=>page.locator('.wSkVaW_root[data-odyssey-page=home]').count()).toBe(1).catch(async error=>{await writeFile(out+'/view-red-'+options.entry+'-'+options.warm+'.json',JSON.stringify(await page.evaluate(()=>{const f=window.newChatFixture;return{current:f.sessions.list.getSnapshot().current,page:document.querySelector('.wSkVaW_root')?.getAttribute('data-odyssey-page'),view:f.storeFor('target').getSnapshot().view,frames:f.pageFrames,marker:sessionStorage.getItem('sherlock.conversation.initial-research-session.v1')}}),null,2));throw error})
  await page.waitForFunction(()=>window.newChatFixture.pageFrames.some(frame=>frame.current==='target'))
  const result=await page.evaluate(()=>{const f=window.newChatFixture;return{current:f.sessions.list.getSnapshot().current,view:f.storeFor('target').getSnapshot().view,draft:f.storeFor('target').getSnapshot().draft,stored:f.values.get('ework.session.view.v1:target'),marker:sessionStorage.getItem('sherlock.conversation.initial-research-session.v1'),frames:f.pageFrames.filter(x=>x.current==='target'),before:JSON.stringify(f.shellFor('current').snapshot),other:f.chatStore.create('elsewhere').getSnapshot().view}})
  expect(result.view).toBe('chat');expect(result.draft).toBe('保留该scope原稿🧭');expect(result.stored).toBe('chat');expect(result.marker).toBeNull();expect(result.before).toBe(before);expect(result.other).toBe('notes');expect(result.frames.length).toBeGreaterThan(0);expect(result.frames.every(frame=>frame.page==='home')).toBe(true)
  await writeFile(out+'/'+options.entry+'-'+options.warm+'.json',JSON.stringify(result,null,2));await page.screenshot({path:out+'/'+options.entry+'-'+options.warm+'.png'});expect(errors).toEqual([])
  await page.locator('[data-conversation-view-id="research"]').click();await expect.poll(()=>page.locator('.wSkVaW_root[data-odyssey-page=research]').count()).toBe(1)
  await page.evaluate(()=>{window.newChatFixture.open('current');window.newChatFixture.open('target')});await expect.poll(()=>page.locator('[data-conversation-view-id="research"][aria-selected=true]').count()).toBe(1)
 }finally{await page.close()}
},15000)
it('selects Chat on the currently mounted empty Research without clearing its draft',async()=>{
 const {page,errors}=await fixture({warm:true});try{
  await page.evaluate(()=>window.newChatFixture.open('target'));await expect.poll(()=>page.locator('.wSkVaW_root[data-odyssey-page=research]').count()).toBe(1)
  const before=await page.evaluate(()=>JSON.stringify(window.newChatFixture.shellFor('target').snapshot));await page.getByRole('button',{name:'新建对话',exact:true}).click();await expect.poll(()=>page.locator('.wSkVaW_root[data-odyssey-page=home]').count()).toBe(1)
  expect(await page.evaluate(()=>window.newChatFixture.sessions.list.getSnapshot().current)).toBe('target');expect(await page.evaluate(()=>JSON.stringify(window.newChatFixture.shellFor('target').snapshot))).toBe(before);expect(errors).toEqual([])
 }finally{await page.close()}
})
it('retains the Chat intent while the desktop preference write is awaiting acknowledgement',async()=>{
 const {page,errors}=await fixture({warm:true,initial:true});try{
  await page.evaluate(()=>window.newChatFixture.setAck(false));await page.getByRole('button',{name:'新建对话',exact:true}).click();await expect.poll(()=>page.locator('.wSkVaW_root[data-odyssey-page=home]').count()).toBe(1)
  const state=await page.evaluate(()=>{const f=window.newChatFixture;return{view:f.chatStore.create('target').getSnapshot().view,durable:f.values.get('ework.session.view.v1:target'),pending:JSON.parse(localStorage.getItem('ework.session.view.v1:target.pending-native'))}})
  expect(state.view).toBe('chat');expect(state.durable).toBe('research');expect(state.pending.view).toBe('chat');expect(errors).toEqual([])
 }finally{await page.close()}
})
it('keeps New Research explicit and restores another saved Notes session on ordinary navigation',async()=>{
 const {page,errors}=await fixture({warm:true});try{
  await page.evaluate(()=>window.newChatFixture.storeFor('target').actions.setView('chat'));await page.getByRole('button',{name:'新建研究',exact:true}).click();await expect.poll(()=>page.locator('.wSkVaW_root[data-odyssey-page=research]').count()).toBe(1)
  expect(await page.evaluate(()=>window.newChatFixture.storeFor('target').getSnapshot().view)).toBe('research')
  await page.evaluate(()=>window.newChatFixture.open('elsewhere'));await expect.poll(()=>page.locator('[data-conversation-view-id="notes"][aria-selected=true]').count()).toBe(1);expect(await page.evaluate(()=>window.newChatFixture.storeFor('elsewhere').getSnapshot().view)).toBe('notes');expect(errors).toEqual([])
 }finally{await page.close()}
})
it.each([{entry:'sidebar',engagedCurrent:false},{entry:'workspace',engagedCurrent:false},{entry:'sidebar',engagedCurrent:true}])('does not reuse an empty pinned Board as New Chat from $entry (fresh=$engagedCurrent)',async({entry,engagedCurrent})=>{
 const {page,errors}=await fixture({warm:true,pinned:true,engagedCurrent});try{
  await page.evaluate(()=>{window.newChatFixture.events.length=0})
  if(entry==='sidebar')await page.getByRole('button',{name:'新建对话',exact:true}).click();else{await page.locator('[aria-label="工作区“当前工作区”的操作"]').locator('xpath=ancestor::*[@role="treeitem"][1]').hover();await page.getByRole('button',{name:'在“当前工作区”中新建会话',exact:true}).click()}
  await page.waitForFunction(()=>window.newChatFixture.events.some(event=>event.open))
  await expect.poll(()=>page.locator('.wSkVaW_root[data-odyssey-page=home]').count()).toBe(1)
  const state=await page.evaluate(()=>{const f=window.newChatFixture;return{current:f.sessions.list.getSnapshot().current,archived:f.workspaces.list.getSnapshot().archivedSessionIds,pinnedView:f.storeFor('target').getSnapshot().view,pinnedPreference:f.values.get('ework.session.view.v1:target'),pinnedDraft:f.storeFor('target').getSnapshot().draft,newDraft:f.shellFor(f.sessions.list.getSnapshot().current).snapshot.draft,nodes:f.registry.for(f.sessions.list.getSnapshot().current).getSnapshot().artifacts.length,opened:f.events.filter(e=>e.open).map(e=>e.open),created:f.events.filter(e=>e.create)}})
  await writeFile(out+'/pinned-'+entry+'-'+engagedCurrent+'.json',JSON.stringify(state,null,2));expect(state.current).not.toBe('target');expect(state.opened).not.toContain('target');expect(state.pinnedView).toBe('research');expect(state.pinnedDraft).toBe('保留该scope原稿🧭');expect(state.pinnedPreference).toBe('research');if(engagedCurrent){expect(state.created).toHaveLength(1);expect(state.created[0].create.workspaceId).toBe('active');expect(state.current).toMatch(/^fresh-/);expect(state.nodes).toBe(0);expect(state.newDraft).toBe('')}expect(errors).toEqual([])
 }finally{await page.close()}
})
it('uses the explicit directory workspace instead of the current Notes workspace',async()=>{
 const {page,errors}=await fixture({warm:true});try{
  await page.evaluate(()=>window.newChatFixture.open('elsewhere'));const noteDraft=await page.evaluate(()=>JSON.stringify(window.newChatFixture.shellFor('elsewhere').snapshot))
  await page.locator('[aria-label="工作区“当前工作区”的操作"]').locator('xpath=ancestor::*[@role="treeitem"][1]').hover();await page.getByRole('button',{name:'在“当前工作区”中新建会话',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.newChatFixture.sessions.list.getSnapshot().current)).toBe('target');await expect.poll(()=>page.locator('.wSkVaW_root[data-odyssey-page=home]').count()).toBe(1)
  expect(await page.evaluate(()=>window.newChatFixture.storeFor('elsewhere').getSnapshot().view)).toBe('notes');expect(await page.evaluate(()=>JSON.stringify(window.newChatFixture.shellFor('elsewhere').snapshot))).toBe(noteDraft);expect(errors).toEqual([])
 }finally{await page.close()}
})
it('fails closed to native fresh creation for an asynchronous reuse predicate',async()=>{
 const {page,errors}=await fixture({warm:true});try{
  await page.evaluate(()=>{window.newChatFixture.events.length=0;window[Symbol.for('sherlock:initial-chat-reuse')].canReuse=()=>Promise.resolve(true)})
  await page.getByRole('button',{name:'新建对话',exact:true}).click();await page.waitForFunction(()=>window.newChatFixture.events.some(event=>event.open))
  const state=await page.evaluate(()=>{const f=window.newChatFixture;return{current:f.sessions.list.getSnapshot().current,creates:f.events.filter(e=>e.create),oldView:f.storeFor('target').getSnapshot().view}})
  expect(state.current).toMatch(/^fresh-/);expect(state.creates).toHaveLength(1);expect(state.creates[0].create.workspaceId).toBe('active');expect(state.oldView).toBe('research');await expect.poll(()=>page.locator('.wSkVaW_root[data-odyssey-page=home]').count()).toBe(1);expect(errors).toEqual([])
 }finally{await page.close()}
})
it('keeps the current input and selection when the owned reuse predicate rejects with an error',async()=>{
 const {page,errors}=await fixture({warm:true});try{
  const warnings=[];page.on('console',message=>{if(message.type()==='warning')warnings.push(message.text())});const draft=await page.evaluate(()=>JSON.stringify(window.newChatFixture.shellFor('current').snapshot))
  await page.evaluate(()=>{window.newChatFixture.events.length=0;window[Symbol.for('sherlock:initial-chat-reuse')].canReuse=()=>{throw Error('Board ownership unavailable')}})
  await page.getByRole('button',{name:'新建对话',exact:true}).click();await expect.poll(()=>warnings.some(value=>value.includes('new session failed'))).toBe(true)
  expect(await page.evaluate(()=>window.newChatFixture.sessions.list.getSnapshot().current)).toBe('current');expect(await page.evaluate(()=>JSON.stringify(window.newChatFixture.shellFor('current').snapshot))).toBe(draft);expect(await page.evaluate(()=>window.newChatFixture.events)).toEqual([]);expect(errors).toEqual([])
 }finally{await page.close()}
})
