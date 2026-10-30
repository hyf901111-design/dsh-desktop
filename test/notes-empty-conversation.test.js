import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {notesResidentProductionSource} from './helpers/notes-resident-production-source.mjs'
const {patchNotesSidebar}=createRequire(import.meta.url)('../scripts/lib/notes-sidebar.mjs')

let browser,client,fixture,sidebarFixture
beforeAll(async()=>{
 client=patchNotesSidebar(notesResidentProductionSource({activity:true})).replace('exports.ConversationRoot = ConversationRoot;','exports.__absentResearch=ABSENT_RESEARCH_WORKSPACE.getSnapshot;exports.__notes=eworkNotesActivity;exports.__canvas=canvasTaskStore;exports.__creation=odysseyCreationIntents;exports.__setBoardAdapter=value=>sherlockBoardsAdapter=value;exports.ConversationRoot = ConversationRoot;')
 const sidebarSource=readFileSync(process.env.SHERLOCK_TEST_SIDEBAR_SOURCE||join(homedir(),'Library/Application Support/sherlock-desktop/harness/profiles/web/node_modules/dsh-better-sidebar/lib/client.js'),'utf8'),sidebarStart=sidebarSource.indexOf('const SIDEBAR_PREFS_DEFAULTS ='),sidebarEnd=sidebarSource.indexOf('//#region src/client/chunk-loader.ts',sidebarStart)
 if(sidebarStart<0||sidebarEnd<0)throw Error('Native sidebar store fixture source drifted')
 sidebarFixture='window.fixtureNativeSidebar=(()=>{'+sidebarSource.slice(sidebarStart,sidebarEnd)+';return{SidebarStore,createBetterSidebarService}})()'
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import * as jsx from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import {createRoot} from 'react-dom/client';
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})}),primitives=new Proxy({MarkdownText:({text})=><p>{text}</p>},{get:(target,key)=>target[key]||(String(key).startsWith('Icon')?()=>null:fake)});
 const bundle=window.descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?ReactDOM:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:fake);
 const store=(initial)=>{let state=initial;const listeners=new Set();return {snapshot:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},update:next=>{state={...state,...next};for(const fn of listeners)fn()}}};
 const session=store({sessionId:'s',blank:false,composerPhase:'active',openState:'open',running:false,pending:[],chat:{order:[],nodes:new Map()},turnTimings:new Map(),turnEnds:new Map()}),view=store({view:'notes',draft:'保留的输入草稿',selection:null}),input=store({draft:'保留的输入草稿',imageIds:[]}),summary=store({byId:{s:{id:'s',title:'只编辑笔记',displayTitle:'只编辑笔记',blank:false,cwd:'/tmp/synthetic'}}});
 const emptyStart=new URLSearchParams(location.search).has('empty-start');let activeSessionId=emptyStart?undefined:'s';if(emptyStart){session.update({sessionId:undefined,blank:true,composerPhase:'blank',openState:'loading'});view.update({view:'chat'})}
 const use=store=>select=>select(React.useSyncExternalStore(store.subscribe,store.snapshot,store.snapshot));const useSession=use(session),useStore=use(view),useInput=use(input),useSessions=use(summary),workspaceState={phase:'ready',items:[{workspaceId:'w',title:'验收工作区',sessionIds:['s']}]};
 const workspaceRegistry=new bundle.ResearchWorkspaceRegistry(localStorage),sidebarState={composerHost:document.querySelector('#side-composer'),conversationHost:document.querySelector('#side-history')},sidebarStore={subscribe:()=>()=>{},getSnapshot:()=>sidebarState};let sidebar={storeFor:()=>sidebarStore,publish(){},enter(){},leave(){}};
 const actions={setView:mode=>view.update({view:mode}),select(){},setResearchRightTab(){},setResearchConversationUnread(){}},views={subscribe:()=>()=>{},version:()=>0,list:()=>[{id:'chat',label:'对话'},{id:'research',label:'研究'},{id:'notes',label:'笔记'}]};const inputActions={setDraft:draft=>input.update({draft})};const t=key=>({'hero.headline':'探索更远，洞见更深。','hero.chooseWorkspace':'选择工作区','hero.preview':'预览版','placeholder.hero':'描述你想要构建的内容'})[key]||key;
 function History(){const state=useSession(x=>x),rows=React.useSyncExternalStore(bundle.__notes.subscribe,()=>bundle.__notes.snapshot('s')),tasks=React.useSyncExternalStore(bundle.__canvas('s').subscribe,bundle.__canvas('s').snapshot);return <section data-native-history>{state.openState==='loading'?<p>正在加载原生历史</p>:null}{state.openState==='error'?<p>原生历史打开失败</p>:null}{state.sharedHistory?<p>共享历史已有内容</p>:null}{state.chat.order.length>0?<p>真实对话内容</p>:null}{rows.map(row=><p key={row.requestId}>{row.prompt}</p>)}{tasks.map(task=><p key={task.id}>真实生成任务</p>)}{state.pending.length>0?<p>正在等待确认</p>:null}{state.running?<p>原生任务进行中</p>:null}{state.queue?.length>0?<p>真实待发消息</p>:null}{state.composerPhase==='engaging'?<p>正在发送首条消息</p>:null}{state.promptError?<p>首条消息失败可重试</p>:null}</section>}
 function Input({variant}){const state=useInput(x=>x);return <div className={'uV2eYG_root uV2eYG_'+variant}><div className="uV2eYG_card"><textarea aria-label="原生会话输入" value={state.draft} onChange={e=>inputActions.setDraft(e.target.value)}/></div></div>}
 const renderSlot=(name,props={},options={})=>name==='conversation.session.header'?<nav>{['notes','research','chat'].map(mode=><button key={mode} onClick={()=>actions.setView(mode)}>{mode}</button>)}</nav>:name==='conversation.session'?(activeSessionId===undefined?null:<bundle.ConversationSession {...props} sessionId={activeSessionId} useSession={useSession} useInput={useInput} inputActions={inputActions} useStore={useStore} actions={actions} renderSlot={renderSlot} views={views} bindDraftMirror={()=>()=>{}} releaseSessionImages={()=>{}} releaseResearchWorkspace={()=>{}}/>):name==='conversation.view'?(options.only==='chat'?<History/>:options.only==='notes'?<main data-note-document>笔记文件和正文保持原样</main>:<main data-research-document>研究画布</main>):name==='conversation.composer.bar'?<Input variant={props.variant}/>:null;
 window.setMode=actions.setView;window.setNative=next=>session.update(next);window.setNotes=()=>document.dispatchEvent(new CustomEvent('sherlock:notes-task-state',{detail:{sessionId:'s',requestId:'request',phase:'preparing',prompt:'真实笔记请求'}}));window.setTask=()=>bundle.__canvas('s').update([{id:'task',state:'running',createdAt:1,updatedAt:1}]);window.setPlanning=()=>{bundle.__creation.set('s',{state:'planning'});window.dispatchEvent(new CustomEvent('odyssey:creation-progress',{detail:{sessionId:'s',intent:{state:'planning'}}}))};window.setShared=kind=>{window.dshDesktop={researchBoards:{isSharedSession:()=>true}};bundle.__setBoardAdapter({subscribe:()=>()=>{},version:()=>0,isBoardOnly:()=>false,directoryChoice:()=>null,getView:()=>({history:kind==='history'?[{id:'h',text:'已有共享历史'}]:[],messages:kind==='messages'?[{id:'m',text:'已有共享消息'}]:[],tasks:[]}),getState:()=>({account:{user:null}})});session.update({sharedHistory:true})};window.absentResearchSnapshot=()=>bundle.__absentResearch();window.researchSnapshot=()=>workspaceRegistry.for('s').getSnapshot();window.setGeneration=state=>{const workspace=workspaceRegistry.for('s'),draft=workspace.createContainerDraft();if(!draft||!workspace.beginContainerGeneration(draft.id,'真实生成请求'))throw Error('生成排队失败');if(state==='running'&&!workspace.attachGenerationTask(draft.id,{taskId:'generation-task',canvasNodeId:draft.id,state:'running',lastSeq:0,events:[]}))throw Error('生成任务启动失败');return workspace.getSnapshot().artifacts.find(node=>node.id===draft.id).generationStatus};window.currentInput=input;window.fixtureSession=session;window.fixtureSummary=summary;
 window.settleGeneration=state=>{const workspace=workspaceRegistry.for('s'),node=workspace.getSnapshot().artifacts.at(-1);if(!workspace.applyGenerationInspection(node.id,{taskId:'generation-task',canvasNodeId:node.id,state,lastSeq:1,events:[],finalOutput:JSON.stringify({version:1,type:'html',title:'独立组件结果',html:'<section><h2>独立组件结果</h2><p>这是一条容器内任务的完成内容。</p></section>'}),error:state==='failed'?'测试失败':undefined,completedAt:Date.now()}))throw Error('生成终态未接受');return workspace.getSnapshot().artifacts.at(-1).generationStatus};
 if(new URLSearchParams(location.search).has('native-sidebar')){
  const {SidebarStore,createBetterSidebarService}=window.fixtureNativeSidebar,store=new SidebarStore();store.setSession('s');const service=createBetterSidebarService(store);sidebar=new bundle.ResearchSidebarCoordinator();sidebar.attach(service,key=>key,{list:{getSnapshot:()=>({current:'s',byId:{s:{id:'s'}}}),subscribe:()=>()=>{}}});sidebar.setConversationHost('s',sidebarState.conversationHost);sidebar.setComposerHost('s',sidebarState.composerHost);
  service.registerTab({id:'fixture-task',single:true,component:()=>null});const taskPane=document.createElement('section');taskPane.textContent='用户选择的任务页';taskPane.dataset.fixtureTaskPage='';document.querySelector('#sidebar').append(taskPane);const taskButton=document.createElement('button');taskButton.textContent='查看任务页';taskButton.onclick=()=>service.openTab({id:'fixture-task',type:'fixture-task',title:'任务'},{sessionId:'s'});document.querySelector('#sidebar').append(taskButton);
  const leaves=node=>node.kind==='leaf'?[node]:(node.children||[]).flatMap(leaves),selected=()=>{const state=service.getSnapshot().state;return (leaves(state.splits).find(node=>node.id===state.activePane)||leaves(state.splits)[0])?.active};const paint=()=>{const task=selected()==='fixture-task';taskPane.hidden=!task;sidebarState.conversationHost.hidden=task;sidebarState.composerHost.hidden=task};service.subscribeState(paint);window.selectedSidebarTab=selected;paint();
 }
 function App(){const [sessionId,setSessionId]=React.useState(activeSessionId);window.attachSession=()=>{activeSessionId='s';session.update({sessionId:'s',blank:false,composerPhase:'active',openState:'loading'});setSessionId('s');actions.setView('notes')};return <bundle.ConversationRoot sessionId={sessionId} useProjection={()=>undefined} useSession={useSession} useSessions={useSessions} useWorkspaces={select=>select(workspaceState)} useInput={useInput} useComposerBlock={()=>undefined} useStore={useStore} actions={actions} renderSlot={renderSlot} renderSlotChain={(_name,_props,{fallback})=>fallback} selectWorkspace={async()=>{}} researchWorkspaces={workspaceRegistry} researchSidebar={sidebar} t={t}/>};createRoot(document.querySelector('#root')).render(<App/>);
 `},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}})
 fixture=output.outputFiles[0].text
 const {chromium}=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>browser?.close())
async function pageFixture(emptyStart=false,nativeSidebar=false){
 const context=await browser.newContext({viewport:{width:1200,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.route('http://127.0.0.1/**',route=>new URL(route.request().url()).pathname==='/mode-fixture'?route.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{height:100%;margin:0}#root{position:fixed;inset:0 320px 0 0}#sidebar{position:fixed;right:0;top:0;bottom:0;width:320px}.sRp_messages{height:650px}.sRp_composer{position:absolute;bottom:0;left:0;right:0}textarea{height:90px;width:90%;padding:10px}.uV2eYG_card{min-height:126px}</style><div id="root"></div><aside id="sidebar"><div id="side-history" class="sRp_messages"></div><div id="side-composer" class="sRp_composer"></div></aside><script>window.__ModuleLoader__={load:descriptor=>window.descriptor=descriptor}</script>'}):route.fulfill({contentType:'application/json',body:'{"tasks":[],"plans":[]}'}))
 await page.goto('http://127.0.0.1/mode-fixture'+(emptyStart?'?empty-start':nativeSidebar?'?native-sidebar':''));await page.addScriptTag({content:client});if(nativeSidebar)await page.addScriptTag({content:sidebarFixture});await page.addScriptTag({content:fixture});if(emptyStart){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(errors).toEqual([])}await page.getByRole('button',{name:'chat',exact:true}).waitFor({timeout:4000}).catch(async error=>{throw Error(JSON.stringify({errors,body:await page.locator('body').innerText()})+error.message)});expect(errors).toEqual([])
 return {context,page,errors}
}
it('restores the research welcome and the original chat hero after editing notes, keeping one composer and its draft',async()=>{
 const {context,page,errors}=await pageFixture();try{
  await page.locator('[data-note-empty-state]').waitFor();await page.evaluate(()=>window.originalComposer=document.querySelector('textarea'))
  await page.getByRole('button',{name:'research',exact:true}).click();expect(await page.locator('[data-research-empty-state]').count()).toBe(1)
  await page.getByRole('button',{name:'chat',exact:true}).click();expect(await page.locator('[data-phase=hero]').count()).toBe(1);await page.getByRole('button',{name:'选择工作区',exact:true}).waitFor()
  expect(await page.locator('[data-odyssey-home-title-art]').count()).toBe(1)
  expect(await page.locator('textarea').count()).toBe(1);expect(await page.evaluate(()=>window.originalComposer===document.querySelector('textarea'))).toBe(true);expect(await page.getByRole('textbox',{name:'原生会话输入'}).inputValue()).toBe('保留的输入草稿')
  const box=await page.getByRole('textbox',{name:'原生会话输入'}).boundingBox();expect(box.y).toBeLessThan(650)
  expect(await page.evaluate(()=>window.fixtureSession.snapshot().blank)).toBe(false);expect(await page.evaluate(()=>window.fixtureSummary.snapshot().byId.s.title)).toBe('只编辑笔记');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('renders the existing centered chat homepage for a retained notes-only session',async()=>{
 const {context,page}=await pageFixture();try{await page.getByRole('button',{name:'chat',exact:true}).click();expect(await page.locator('[data-phase=hero]').count()).toBe(1);expect(await page.locator('[data-odyssey-home-title-art]').count()).toBe(1)}finally{await context.close()}
},15000)
for(const content of ['chat','notes','task','pending','running','queued','engaging','failedPrompt'])it(`keeps real ${content} conversation content visible across all three modes`,async()=>{
 const {context,page,errors}=await pageFixture();try{
  await page.evaluate(content=>content==='chat'?window.setNative({chat:{order:['user'],nodes:new Map([['user',{kind:'user'}]])}}):content==='notes'?window.setNotes():content==='task'?window.setTask():content==='pending'?window.setNative({pending:[{id:'p'}]}):content==='running'?window.setNative({running:true}):content==='queued'?window.setNative({queue:[{id:'queued'}]}):content==='engaging'?window.setNative({composerPhase:'engaging'}):window.setNative({promptError:{error:{message:'failed'}}}),content)
  for(const mode of ['notes','research','chat']){await page.getByRole('button',{name:mode,exact:true}).click();expect(await page.locator('[data-research-empty-state]').count()).toBe(0);expect(await page.locator('[data-phase=hero]').count()).toBe(0);await page.getByText(({chat:'真实对话内容',notes:'真实笔记请求',task:'真实生成任务',pending:'正在等待确认',running:'原生任务进行中',queued:'真实待发消息',engaging:'正在发送首条消息',failedPrompt:'首条消息失败可重试'})[content],{exact:true}).waitFor();expect(await page.locator('textarea').count()).toBe(1)}
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('does not replace ongoing generated-workbench progress with the empty welcome',async()=>{
 const {context,page}=await pageFixture();try{await page.evaluate(()=>window.setPlanning());for(const mode of ['notes','research','chat']){await page.getByRole('button',{name:mode,exact:true}).click();expect(await page.locator('[data-research-empty-state]').count()).toBe(0);expect(await page.locator('[data-phase=hero]').count()).toBe(0)}}finally{await context.close()}
},15000)

for(const openState of ['loading','error'])it(`keeps native ${openState} status visible for a retained notes session`,async()=>{
 const {context,page,errors}=await pageFixture();try{
  await page.evaluate(openState=>window.setNative({openState,openError:openState==='error'?{message:'打开失败',code:'test'}:null}),openState)
  for(const mode of ['notes','research','chat']){await page.getByRole('button',{name:mode,exact:true}).click();expect(await page.locator('[data-research-empty-state]').count()).toBe(0);expect(await page.locator('[data-phase=hero]').count()).toBe(0);await page.getByText(openState==='loading'?'正在加载原生历史':'原生历史打开失败',{exact:true}).waitFor()}
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('keeps unresolved native message nodes visible until their content arrives',async()=>{
 const {context,page,errors}=await pageFixture();try{await page.evaluate(()=>window.setNative({chat:{order:['not-hydrated'],nodes:new Map()}}));for(const mode of ['notes','research','chat']){await page.getByRole('button',{name:mode,exact:true}).click();expect(await page.locator('[data-research-empty-state]').count()).toBe(0);expect(await page.locator('[data-phase=hero]').count()).toBe(0);await page.getByText('真实对话内容',{exact:true}).waitFor()}expect(errors).toEqual([])}finally{await context.close()}
},15000)
it('treats internal command records as empty using the native visible-content rule',async()=>{
 const {context,page,errors}=await pageFixture();try{await page.evaluate(()=>window.setNative({chat:{order:['command'],nodes:new Map([['command',{kind:'command'}]])}}));await page.locator('[data-note-empty-state]').waitFor();await page.getByRole('button',{name:'research',exact:true}).click();expect(await page.locator('[data-research-empty-state]').count()).toBe(1);await page.getByRole('button',{name:'chat',exact:true}).click();expect(await page.locator('[data-phase=hero]').count()).toBe(1);expect(errors).toEqual([])}finally{await context.close()}
},15000)
for(const kind of ['history','messages'])it(`keeps existing shared ${kind} visible across modes`,async()=>{
 const {context,page,errors}=await pageFixture();try{await page.evaluate(kind=>window.setShared(kind),kind);for(const mode of ['notes','research','chat']){await page.getByRole('button',{name:mode,exact:true}).click();expect(await page.locator('[data-research-empty-state]').count()).toBe(0);expect(await page.locator('[data-phase=hero]').count()).toBe(0);await page.getByText('共享历史已有内容',{exact:true}).waitFor()}expect(errors).toEqual([])}finally{await context.close()}
},15000)

it('preserves the native known-blank loading hero while showing an open failure even if the summary is stale',async()=>{
 const {context,page,errors}=await pageFixture();try{
  await page.evaluate(()=>{window.fixtureSummary.update({byId:{s:{...window.fixtureSummary.snapshot().byId.s,blank:true}}});window.setNative({blank:true,composerPhase:'blank',openState:'loading'})});await page.getByRole('button',{name:'chat',exact:true}).click();expect(await page.locator('[data-phase=hero]').count()).toBe(1)
  await page.evaluate(()=>window.setNative({openState:'error',openError:{message:'打开失败',code:'test'}}));for(const mode of ['notes','research','chat']){await page.getByRole('button',{name:mode,exact:true}).click();expect(await page.locator('[data-research-empty-state]').count()).toBe(0);expect(await page.locator('[data-phase=hero]').count()).toBe(0);await page.getByText('原生历史打开失败',{exact:true}).waitFor()}expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('renders the native absent workspace on first launch before loading a retained notes session and switching all three modes',async()=>{
 const {context,page,errors}=await pageFixture(true);try{
  expect(await page.evaluate(()=>Object.keys(window.absentResearchSnapshot()).sort())).toEqual(['files','selection']);expect(await page.locator('[data-phase=hero]').count()).toBe(1);expect(await page.locator('textarea').count()).toBe(1);await page.evaluate(()=>window.originalComposer=document.querySelector('textarea'))
  await page.evaluate(()=>window.attachSession());await page.getByText('正在加载原生历史',{exact:true}).waitFor();expect(await page.locator('[data-note-empty-state]').count()).toBe(0);expect(await page.evaluate(()=>window.researchSnapshot().artifacts)).toEqual([])
  await page.evaluate(()=>window.setNative({openState:'open'}));await page.locator('[data-note-empty-state]').waitFor();await page.getByRole('button',{name:'research',exact:true}).click();expect(await page.locator('[data-research-empty-state]').count()).toBe(1);await page.getByRole('button',{name:'chat',exact:true}).click();expect(await page.locator('[data-phase=hero]').count()).toBe(1);await page.getByRole('button',{name:'选择工作区',exact:true}).waitFor()
  expect(await page.evaluate(()=>window.originalComposer===document.querySelector('textarea'))).toBe(true);expect(await page.getByRole('textbox',{name:'原生会话输入'}).inputValue()).toBe('保留的输入草稿');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
for(const state of ['queued','running'])it(`retains the research welcome for component-only ${state} generation`,async()=>{
 const {context,page,errors}=await pageFixture();try{expect(await page.evaluate(state=>window.setGeneration(state),state)).toBe(state);for(const mode of ['notes','research','chat']){await page.getByRole('button',{name:mode,exact:true}).click();expect(await page.locator('[data-research-empty-state]').count()).toBe(mode==='research'?1:0);expect(await page.locator('[data-phase=hero]').count()).toBe(0);expect(await page.locator('textarea').count()).toBe(1)}expect(errors).toEqual([])}finally{await context.close()}
},15000)

for(const state of ['completed','failed','cancelled'])it(`keeps the component-only research welcome mounted through ${state}`,async()=>{
 const {context,page,errors}=await pageFixture();try{
  await page.getByRole('button',{name:'research',exact:true}).click();await page.locator('[data-research-empty-state]').waitFor()
  await page.evaluate(()=>{window.originalWelcome=document.querySelector('[data-research-empty-state]');window.originalComposer=document.querySelector('textarea');window.welcomeLost=false;window.welcomeObserver=new MutationObserver(()=>{if(!window.originalWelcome.isConnected)window.welcomeLost=true});window.welcomeObserver.observe(document.querySelector('#side-history'),{subtree:true,childList:true})})
  expect(await page.evaluate(()=>window.setGeneration('running'))).toBe('running');await expect.poll(()=>page.locator('[data-research-empty-state]').count()).toBe(1)
  expect(await page.evaluate(state=>window.settleGeneration(state),state)).toBe(state)
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  expect(await page.evaluate(()=>({lost:window.welcomeLost,sameWelcome:window.originalWelcome===document.querySelector('[data-research-empty-state]'),sameComposer:window.originalComposer===document.querySelector('textarea')}))).toEqual({lost:false,sameWelcome:true,sameComposer:true})
  expect(errors).toEqual([])
 }finally{await page.evaluate(()=>window.welcomeObserver?.disconnect());await context.close()}
},15000)

it('keeps genuine main conversation activity visible while a component is generating',async()=>{
 const {context,page,errors}=await pageFixture();try{
  await page.getByRole('button',{name:'research',exact:true}).click();await page.evaluate(()=>window.setGeneration('running'))
  await page.evaluate(()=>window.setNative({running:true}));await page.getByText('原生任务进行中',{exact:true}).waitFor();expect(await page.locator('[data-research-empty-state]').count()).toBe(0)
  await page.evaluate(()=>window.setNative({running:false,chat:{order:['user'],nodes:new Map([['user',{kind:'user'}]])}}));await page.getByText('真实对话内容',{exact:true}).waitFor();expect(await page.locator('[data-research-empty-state]').count()).toBe(0)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('keeps the user-selected task page in the real sidebar store through component generation',async()=>{
 const {context,page,errors}=await pageFixture(false,true);try{
  await page.getByRole('button',{name:'research',exact:true}).click();await page.getByRole('button',{name:'查看任务页',exact:true}).click()
  for(const state of ['completed','failed','cancelled']){
   await page.evaluate(()=>window.setGeneration('running'));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
   expect(await page.evaluate(()=>window.selectedSidebarTab())).toBe('fixture-task');expect(await page.locator('[data-fixture-task-page]').isVisible()).toBe(true)
   expect(await page.evaluate(state=>window.settleGeneration(state),state)).toBe(state);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
   expect(await page.evaluate(()=>window.selectedSidebarTab())).toBe('fixture-task');expect(await page.locator('[data-fixture-task-page]').isVisible()).toBe(true)
  }
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('upgrades the already patched v1 dependency and remains unchanged on a second pass',()=>{
 const unsafe="researchWorkspaceSnapshot2.artifacts.some(node=>['queued','running'].includes(node.generationStatus))",safe="(researchWorkspaceSnapshot2.artifacts??[]).some(node=>['queued','running'].includes(node.generationStatus))",legacy=client.replace(safe,unsafe)
 expect(legacy).toContain('/* ework:notes-conversation-vacancy:v1 */');expect(legacy).toContain(unsafe);const fixed=patchNotesSidebar(legacy);expect(fixed).toContain(safe);expect(fixed).not.toContain(unsafe);expect(patchNotesSidebar(fixed)).toBe(fixed)
})
