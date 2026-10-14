import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {patchNotesSidebar} from '../scripts/lib/notes-sidebar.mjs'

let browser,client,fixture
beforeAll(async()=>{
 client=patchNotesSidebar(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')).replace('exports.ConversationRoot = ConversationRoot;','exports.__notes=eworkNotesActivity;exports.__canvas=canvasTaskStore;exports.__creation=odysseyCreationIntents;exports.__setBoardAdapter=value=>sherlockBoardsAdapter=value;exports.ConversationRoot = ConversationRoot;')
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import * as jsx from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import {createRoot} from 'react-dom/client';
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})}),primitives=new Proxy({MarkdownText:({text})=><p>{text}</p>},{get:(target,key)=>target[key]||(String(key).startsWith('Icon')?()=>null:fake)});
 const bundle=window.descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?ReactDOM:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:fake);
 const store=(initial)=>{let state=initial;const listeners=new Set();return {snapshot:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},update:next=>{state={...state,...next};for(const fn of listeners)fn()}}};
 const session=store({sessionId:'s',blank:false,composerPhase:'active',openState:'open',running:false,pending:[],chat:{order:[],nodes:new Map()},turnTimings:new Map(),turnEnds:new Map()}),view=store({view:'notes',draft:'保留的输入草稿',selection:null}),input=store({draft:'保留的输入草稿',imageIds:[]}),summary=store({byId:{s:{id:'s',title:'只编辑笔记',displayTitle:'只编辑笔记',blank:false,cwd:'/tmp/synthetic'}}});
 const use=store=>select=>select(React.useSyncExternalStore(store.subscribe,store.snapshot,store.snapshot));const useSession=use(session),useStore=use(view),useInput=use(input),useSessions=use(summary),workspaceState={phase:'ready',items:[{workspaceId:'w',title:'验收工作区',sessionIds:['s']}]};
 const workspaceRegistry=new bundle.ResearchWorkspaceRegistry(localStorage),sidebarState={composerHost:document.querySelector('#side-composer'),conversationHost:document.querySelector('#side-history')},sidebarStore={subscribe:()=>()=>{},getSnapshot:()=>sidebarState},sidebar={storeFor:()=>sidebarStore,publish(){},enter(){},leave(){}};
 const actions={setView:mode=>view.update({view:mode}),select(){},setResearchRightTab(){},setResearchConversationUnread(){}},views={subscribe:()=>()=>{},version:()=>0,list:()=>[{id:'chat',label:'对话'},{id:'research',label:'研究'},{id:'notes',label:'笔记'}]};const inputActions={setDraft:draft=>input.update({draft})};const t=key=>({'hero.headline':'探索更远，洞见更深。','hero.chooseWorkspace':'选择工作区','hero.preview':'预览版','placeholder.hero':'描述你想要构建的内容'})[key]||key;
 function History(){const state=useSession(x=>x),rows=React.useSyncExternalStore(bundle.__notes.subscribe,()=>bundle.__notes.snapshot('s')),tasks=React.useSyncExternalStore(bundle.__canvas('s').subscribe,bundle.__canvas('s').snapshot);return <section data-native-history>{state.openState==='loading'?<p>正在加载原生历史</p>:null}{state.openState==='error'?<p>原生历史打开失败</p>:null}{state.sharedHistory?<p>共享历史已有内容</p>:null}{state.chat.order.length>0?<p>真实对话内容</p>:null}{rows.map(row=><p key={row.requestId}>{row.prompt}</p>)}{tasks.map(task=><p key={task.id}>真实生成任务</p>)}{state.pending.length>0?<p>正在等待确认</p>:null}{state.running?<p>原生任务进行中</p>:null}{state.queue?.length>0?<p>真实待发消息</p>:null}{state.composerPhase==='engaging'?<p>正在发送首条消息</p>:null}{state.promptError?<p>首条消息失败可重试</p>:null}</section>}
 function Input({variant}){const state=useInput(x=>x);return <div className={'uV2eYG_root uV2eYG_'+variant}><div className="uV2eYG_card"><textarea aria-label="原生会话输入" value={state.draft} onChange={e=>inputActions.setDraft(e.target.value)}/></div></div>}
 const renderSlot=(name,props={},options={})=>name==='conversation.session.header'?<nav>{['notes','research','chat'].map(mode=><button key={mode} onClick={()=>actions.setView(mode)}>{mode}</button>)}</nav>:name==='conversation.session'?<bundle.ConversationSession {...props} sessionId="s" useSession={useSession} useInput={useInput} inputActions={inputActions} useStore={useStore} actions={actions} renderSlot={renderSlot} views={views} bindDraftMirror={()=>()=>{}} releaseSessionImages={()=>{}} releaseResearchWorkspace={()=>{}}/>:name==='conversation.view'?(options.only==='chat'?<History/>:options.only==='notes'?<main data-note-document>笔记文件和正文保持原样</main>:<main data-research-document>研究画布</main>):name==='conversation.composer.bar'?<Input variant={props.variant}/>:null;
 window.setMode=actions.setView;window.setNative=next=>session.update(next);window.setNotes=()=>document.dispatchEvent(new CustomEvent('sherlock:notes-task-state',{detail:{sessionId:'s',requestId:'request',phase:'preparing',prompt:'真实笔记请求'}}));window.setTask=()=>bundle.__canvas('s').update([{id:'task',state:'running',createdAt:1,updatedAt:1}]);window.setPlanning=()=>{bundle.__creation.set('s',{state:'planning'});window.dispatchEvent(new CustomEvent('odyssey:creation-progress',{detail:{sessionId:'s',intent:{state:'planning'}}}))};window.setShared=kind=>{window.dshDesktop={researchBoards:{isSharedSession:()=>true}};bundle.__setBoardAdapter({subscribe:()=>()=>{},version:()=>0,isBoardOnly:()=>false,directoryChoice:()=>null,getView:()=>({history:kind==='history'?[{id:'h',text:'已有共享历史'}]:[],messages:kind==='messages'?[{id:'m',text:'已有共享消息'}]:[],tasks:[]}),getState:()=>({account:{user:null}})});session.update({sharedHistory:true})};window.currentInput=input;window.fixtureSession=session;window.fixtureSummary=summary;
 createRoot(document.querySelector('#root')).render(<bundle.ConversationRoot sessionId="s" useProjection={()=>undefined} useSession={useSession} useSessions={useSessions} useWorkspaces={select=>select(workspaceState)} useInput={useInput} useComposerBlock={()=>undefined} useStore={useStore} actions={actions} renderSlot={renderSlot} renderSlotChain={(_name,_props,{fallback})=>fallback} selectWorkspace={async()=>{}} researchWorkspaces={workspaceRegistry} researchSidebar={sidebar} t={t}/>);
 `},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}})
 fixture=output.outputFiles[0].text
 const {chromium}=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
afterAll(async()=>browser?.close())
async function pageFixture(){
 const context=await browser.newContext({viewport:{width:1200,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.route('http://127.0.0.1/**',route=>route.request().url().endsWith('/mode-fixture')?route.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{height:100%;margin:0}#root{position:fixed;inset:0 320px 0 0}#sidebar{position:fixed;right:0;top:0;bottom:0;width:320px}.sRp_messages{height:650px}.sRp_composer{position:absolute;bottom:0;left:0;right:0}textarea{height:90px;width:90%;padding:10px}.uV2eYG_card{min-height:126px}</style><div id="root"></div><aside id="sidebar"><div id="side-history" class="sRp_messages"></div><div id="side-composer" class="sRp_composer"></div></aside><script>window.__ModuleLoader__={load:descriptor=>window.descriptor=descriptor}</script>'}):route.fulfill({contentType:'application/json',body:'{"tasks":[],"plans":[]}'}))
 await page.goto('http://127.0.0.1/mode-fixture');await page.addScriptTag({content:client});await page.addScriptTag({content:fixture});await page.getByRole('button',{name:'chat',exact:true}).waitFor();expect(errors).toEqual([])
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
