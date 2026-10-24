import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { createSourceFile, ScriptTarget, ScriptKind, forEachChild, isFunctionDeclaration } from 'typescript'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { patchNoteSessionRuntime } from '../scripts/lib/notes-session.mjs'
import { stripHomeGuidePresentationNative } from '../scripts/lib/home-guide-presentation-native.mjs'
import { patchComposerDeliverablePreview } from '../scripts/lib/figma-composer-deliverable-preview.mjs'

// Browser plugin not available. Use the existing Playwright/Chromium runtime;
// this fixture mounts production native components and blocks all live providers.
const evidence = '/tmp/home-guide-native-browser-20261024'
const runId = 'guide-browser-run'
const sessionId = 'guide-browser-session'
const draft = '保留我的原生输入草稿\n第二行 🔎'
// Serialize the production functions without Vitest's imported-binding rewrites.
const {patchNotesSidebar}=createRequire(import.meta.url)('../scripts/lib/notes-sidebar.mjs')
let browser, runtimeSource, conversationSource, entry, styles

beforeAll(async () => {
  const { patchHomeGuideNative, stripHomeGuideNative } = await import('../scripts/lib/home-guide-native.mjs')
  runtimeSource = patchNoteSessionRuntime(await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js', 'utf8'))
  const native = stripHomeGuideNative(stripHomeGuidePresentationNative(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')))
  conversationSource = patchHomeGuideNative(patchComposerDeliverablePreview(patchNotesSidebar(native)))
    .replace('exports.apply = apply;', 'exports.apply = apply;exports.__InputBar=InputBar;exports.__header=ConversationSessionHeader;exports.__setGuidePage=page=>{sherlockBoardsAdapter=page};exports.__page=sherlockBoardsPage;')
  const workspaceSource=await readFile('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js','utf8'),pickerStart=workspaceSource.indexOf('function WorkspacePickFlow('),pickerEnd=workspaceSource.indexOf('\n\t\t/**',pickerStart),workspacePicker=workspaceSource.slice(pickerStart,pickerEnd)
  const selectStart=conversationSource.indexOf('selectWorkspace: async (workspaceId) => {'),workspaceSelect=conversationSource.slice(selectStart,conversationSource.indexOf('\n\t\t\t\t})',selectStart))
  if(pickerStart<0||selectStart<0)throw Error('Native Workspace picker fixture anchors drifted')
  const assets = 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets'
  const frontend = await Promise.all((await readdir(assets)).filter(name => /^index-.*\.css$/.test(name)).map(name => readFile(`${assets}/${name}`, 'utf8')))
  const bundles = await Promise.all(['layout', 'conversation', 'agent-preset'].map(name => readFile(`node_modules/@deepseek-ai/dsh-client-ui-${name}/lib/client.js`, 'utf8')))
  const layoutSyntax = createSourceFile('layout.js', bundles[0], ScriptTarget.Latest, false, ScriptKind.JS), layoutFunctions = new Map()
  const visit = node => { if (isFunctionDeclaration(node) && node.name) layoutFunctions.set(node.name.text, node.getText(layoutSyntax)); forEachChild(node, visit) }; visit(layoutSyntax)
  const frame = ['clampWidth','computeColumns','CenterColumn','DetailsColumn','DragHandle','SidebarDragHandle','AppFrame','createLayoutStore'].map(name=>layoutFunctions.get(name)).join('\n')
  styles = [...frontend, ...bundles.flatMap(source => [...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match => JSON.parse(match[1]))),
    ...conversationSource.matchAll(/tag\.textContent \+?= ("(?:[^"\\]|\\.)*");/g)].map(value => typeof value === 'string' ? value : JSON.parse(value[1])).join('\n')
  const pageBundle = await build({stdin:{contents:"export * from './src/preload/research-boards-ui.ts'",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'browser',format:'cjs',write:false,external:['react','@deepseek-ai/dsh-client-ui-primitives'],target:'chrome120',logLevel:'silent'})
  const output = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot}from'react-dom/client';import{Menu as NativeMenu}from'@deepseek-ai/dsh-client-ui-primitives';
      const react=React,react_jsx_runtime=jsx,react_dom=dom,COLLAPSED_SIDEBAR_WIDTH=80,SIDEBAR_AUTO_COLLAPSE=1024,_deepseek_ai_dsh_client_runtime_client={defineStore:spec=>spec};
      const AppFrame_module_css_default={frame:'pI_x6G_frame',sidebarCol:'pI_x6G_sidebarCol',centerCol:'pI_x6G_centerCol',detailsCol:'pI_x6G_detailsCol',handle:'pI_x6G_handle',overlayLayer:'pI_x6G_overlayLayer'};
      ${frame}
      let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
      const cordis=new Proxy({Service:class{constructor(ctx){this.ctx=ctx}}},{get:(target,key)=>target[key]??fake});
      const primitives=new Proxy({Tooltip:({children})=>children,MarkdownText:({text})=><p>{text}</p>},{get:(target,key)=>target[key]??(()=>null)});
      const WorkspacePickFlow=new Function('react','react_jsx_runtime','_deepseek_ai_dsh_client_ui_primitives','WorkspacePicker_module_css_default','ADD_WORKSPACE',${JSON.stringify(workspacePicker)}+'\\nreturn WorkspacePickFlow;')(React,jsx,new Proxy({Menu:NativeMenu},{get:(target,key)=>target[key]??(()=>null)}),{},'::add-workspace');
      const guidePageModule=(()=>{const module={exports:{}},exports=module.exports,require=id=>id==='react'?React:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:fake;${pageBundle.outputFiles[0].text};return module.exports})();
      const runtime=window.runtimeDescriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='@deepseek-ai/cordis'?cordis:fake);
      const native=window.conversationDescriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/dsh-client-runtime/client'?runtime:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{DropOverlay:()=>null,AttachmentRail:()=>null}:fake);
      const disposers=[],ctx={get:()=>undefined,reflect:{provide(){}},effect(start){const stop=start();if(typeof stop==='function')disposers.push(stop);return typeof stop==='function'?stop:()=>{}}};
      const events=new runtime.ConversationEventRegistry(ctx),viewsRegistry=new runtime.ConversationViewRegistry(ctx),sessionsRuntime=new runtime.SessionRuntime(ctx,{sessions:{}},{},{events,views:viewsRegistry}),session=sessionsRuntime.manager.get('${sessionId}');
      session.openState='open';session.installWindow([],false);
      const store=initial=>{let value=initial;const listeners=new Set();return{getSnapshot:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},update:patch=>{value={...value,...patch};for(const fn of listeners)fn()}}};
      const workspaceList=store({phase:'ready',items:window.guideProbe.workspaceItems??[{workspaceId:'w',title:'教程浏览器验收',path:'/tmp/guide-browser',sessionIds:['${sessionId}']}]}),view=store({view:'chat',selection:null,draft:''}),summary=store({current:'${sessionId}',byId:{'${sessionId}':{id:'${sessionId}',displayTitle:'教程浏览器验收',blank:true,cwd:'/tmp/guide-browser'}}}),memory=new Map(window.guideProbe.diskEntries||[]),storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>{memory.set(key,value);return true}},registry=new native.ResearchWorkspaceRegistry(storage);

      const shell=new native.SessionInputShell({actx:{},defaultSink:()=>{window.guideProbe.providerCalls++;throw Error('Tutorial must not send a prompt')}});shell.setDraft(window.guideProbe.initialDraft??${JSON.stringify(draft)});
      const use=store=>select=>select(React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot)),sessionStore={subscribe:fn=>session.subscribe(fn),getSnapshot:()=>session.getSnapshot()},useSession=use(sessionStore),useInput=use(shell.state),useStore=use(view),useSessions=use(summary);
      window.dshDesktop.researchCanvasStorage=storage;
      if(window.guideProbe.seedGuideRegistration!==false&&window.guideProbe.guideKind!==false)memory.set('sherlock.home-guide.sessions.v1:account%3Aowner',JSON.stringify({version:1,scope:'account:owner',entries:[{kind:window.guideProbe.guideKind??'board',sessionId:'${sessionId}',cwd:'/tmp/guide-browser',title:window.guideProbe.guideKind==='note'?'AI 护航研究笔记示例':window.guideProbe.guideKind==='ppt'?'公司风格演示示例':'自选行情示例看板',createdAt:1}]}));
      const exampleWorkspace={workspaceId:'guide-example-workspace',path:'/tmp/guide-browser',title:window.guideProbe.guideKind==='note'?'AI 护航研究笔记示例':'公司风格演示示例',sessionIds:[]};window.guideProbe.registrationCalls=0;window.guideProbe.bindingCalls=0;
      const guideWorkspaces={list:workspaceList,async create({path}){window.guideProbe.registrationCalls++;if(window.guideProbe.deferRegistration)await new Promise(resolve=>window.guideProbe.releaseWorkspace=resolve);if(path!==exampleWorkspace.path)throw Error('Unexpected example path');return exampleWorkspace},api:{host:{describe:async()=>({result:{ok:true,value:{cwd:'/tmp'}}})},sessions:{async create({workspaceId,sessionId}){window.guideProbe.bindingCalls++;if(workspaceId!==exampleWorkspace.workspaceId||sessionId!=='${sessionId}')throw Error('Unexpected example binding');exampleWorkspace.sessionIds=[sessionId];workspaceList.update({items:[exampleWorkspace]});return{result:{ok:true,value:{sessionId}}}}}}};
      const guidePage=guidePageModule.createResearchBoardsPage({document,sessions:{list:summary,binding:()=>({session}),open:id=>summary.update({current:id})},workspaces:guideWorkspaces,researchWorkspaces:registry,inputHub:{shells:new Map([['${sessionId}',shell]])},bridge:{isSharedSession:()=>false,subscribe:()=>()=>{},getSnapshot:async()=>({version:1,eventSeq:1,account:{status:'ready',generation:1,user:{userId:window.guideProbe.accountOwner??'owner'}},favorites:[],boards:[],current:null,recoveries:[],notifications:{cursor:0,pendingCount:0,unreadCount:0,notifications:[]}}),invoke:async()=>({ok:true,value:null})}});
      native.__setGuidePage(guidePage);disposers.push(()=>guidePage.dispose());

      const views={subscribe:()=>()=>{},version:()=>0,list:()=>[{id:'chat',label:'对话'},{id:'research',label:'研究'},{id:'notes',label:'笔记'}]},actions={setView:value=>view.update({view:value}),select(){},setResearchRightTab(){},setResearchConversationUnread(){}};
      let frameRoot;
      if(window.guideProbe.nativeLayout){
        const nativeHost=document.getElementById('native-root'),guide=document.querySelector('[data-home-guide]'),oldFrame=document.querySelector('.pI_x6G_frame'),host=document.createElement('div');host.style.height='100%';oldFrame.remove();document.body.prepend(host);
        const spec=createLayoutStore(),state=store(spec.init());window.guideProbe.layout=state;window.guideProbe.layoutChanges=[];
        const layoutActions=Object.fromEntries(Object.entries(spec.actions).map(([name,fn])=>[name,(...args)=>{const next={...state.getSnapshot()};fn(next,...args);window.guideProbe.layoutChanges.push(name);state.update(next)}]));
        const NativeFrame=()=>React.createElement(AppFrame,{actions:layoutActions,useStore:select=>select(React.useSyncExternalStore(state.subscribe,state.getSnapshot,state.getSnapshot)),useSessions:select=>select({byId:{}}),renderSlot:name=>name==='sidebar'?React.createElement('aside',{'data-real-layout-sidebar':''},'原生侧栏'):name==='conversation'?React.createElement('div',{style:{display:'contents'},ref:node=>{if(node&&!node.contains(nativeHost))node.append(nativeHost,guide)}}):null});
        frameRoot=createRoot(host);dom.flushSync(()=>frameRoot.render(React.createElement(NativeFrame)));
      }
      const sidebarState={composerHost:document.querySelector('#side-composer'),conversationHost:document.querySelector('#side-history')},sidebarStore={subscribe:()=>()=>{},getSnapshot:()=>sidebarState};
      let sidebar={storeFor:()=>sidebarStore,publish(){},enter(){},leave(){}};
      if(window.guideProbe.nativeLayout){
        sidebar=new native.ResearchSidebarCoordinator();sidebar.setComposerHost('${sessionId}',sidebarState.composerHost);sidebar.setConversationHost('${sessionId}',sidebarState.conversationHost);
        const panel={panelOpen:false,width:384,activePane:'main',splits:{kind:'leaf',id:'main',tabs:[],active:null}};window.guideProbe.rightPanel=panel;window.guideProbe.rightChanges=[];
        sidebar.service={getSnapshot:()=>({sessionId:'${sessionId}',state:panel}),openTab:tab=>{if(!panel.splits.tabs.some(t=>t.id===tab.id))panel.splits.tabs.push(tab);panel.splits.active=tab.id},closeTab:id=>{panel.splits.tabs=panel.splits.tabs.filter(t=>t.id!==id)},activateTab:id=>{panel.splits.active=id},updateTab(){},setPanelState:patch=>{window.guideProbe.rightChanges.push(patch);if(typeof patch.open==='boolean')panel.panelOpen=patch.open;if(patch.width!==undefined)panel.width=patch.width}};
      }
      const t=key=>({'hero.headline':'探索更远，洞见更深。','hero.chooseWorkspace':'选择工作区'})[key]||key;
      const shared={sessionId:'${sessionId}',useSession,useSessions,useStore,actions,views,t};
      const inputProps={useSession,useInput,inputActions:shell.actions,keyboard:shell,useNotices:select=>select(null),useLexicon:select=>select(new Map()),useMenuLauncher:select=>select(null),useProjection:(_name,select)=>select?.(undefined),sessionId:'${sessionId}',t};
      const workspaceService={connectWorkspace:async id=>{window.guideProbe.workspaceConnections.push(id);throw Error('Unknown real Workspace: '+id)},archiveSession:async id=>{window.guideProbe.workspaceArchives.push(id)}},nativeWorkspaceSelect=new Function('workspaces','sessions','inputHub','sherlockBoardsAdapter','sessionId',${JSON.stringify('return ({'+workspaceSelect+'}).selectWorkspace;')} )(workspaceService,{open:id=>window.guideProbe.workspaceOpens.push(id)},{shell:()=>shell},guidePage,'${sessionId}');
      const renderSlot=(name,props={},scope={})=>name==='conversation.view'&&scope.only==='research'?<native.ResearchCanvas sessionId='${sessionId}' t={t} researchWorkspaces={registry} {...props}/>:name==='conversation.session.header'?<native.__header {...shared} renderSlot={renderSlot} open={()=>{}} rename={async()=>{}}/>:name==='conversation.session'?<native.ConversationSession {...shared} {...props} useInput={useInput} inputActions={shell.actions} renderSlot={renderSlot} bindDraftMirror={()=>()=>{}} releaseSessionImages={()=>{}} releaseResearchWorkspace={()=>{}}/>:name==='conversation.hero.workspace'?<WorkspacePickFlow {...props} t={key=>key==='menu.addWorkspace'?'添加工作区…':key} useWorkspaces={use(workspaceList)} createWorkspace={async()=>{window.guideProbe.workspaceCalls++;throw Error('Must not create a Workspace')}} useDirectoryFlow={()=>true} renderDirectoryFlow={()=>null}/>:name==='conversation.composer.bar'?<native.__InputBar {...inputProps} {...props} renderSlot={()=>null}/>:name==='conversation.view'?<main data-native-history="">已有会话内容</main>:null;
      const root=createRoot(document.querySelector('#native-root'));window.guideProbe.researchActivations=[];window.guideProbe.researchActiveSessions=new Set();const setResearchActive=(id,active)=>{window.guideProbe.researchActivations.push({id,active});if(active)window.guideProbe.researchActiveSessions.add(id);else window.guideProbe.researchActiveSessions.delete(id)};
      function App(){const [current,setCurrent]=React.useState({sessionId:'${sessionId}',subagentPanel:false});window.guideProbe.setContext=setCurrent;return <native.ConversationRoot {...shared} {...current} useProjection={()=>undefined} useInput={useInput} useComposerBlock={()=>undefined} renderSlot={renderSlot} renderSlotChain={(_name,_props,{fallback})=>fallback} selectWorkspace={async id=>{window.guideProbe.workspaceCalls++;return nativeWorkspaceSelect(id)}} useWorkspaces={use(workspaceList)} researchWorkspaces={registry} researchSidebar={sidebar} setResearchActive={setResearchActive}/>}
      Object.assign(window.guideProbe,{native,shell,registry,memory,view,session,sidebar,guidePage,workspaceList,dispose(){root.unmount();frameRoot?.unmount();disposers.reverse().forEach(stop=>stop())}});root.render(<App/>);
    ` },
    bundle: true, platform: 'browser', format: 'iife', write: false, define: { 'process.env.NODE_ENV': '"production"' },loader:{'.css':'empty'}
  })
  entry = output.outputFiles[0].text
  const pw = await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await (pw.default ?? pw).chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell', args: ['--enable-unsafe-swiftshader'] })
  await mkdir(evidence, { recursive: true })
}, 30000)
afterAll(() => browser?.close())

async function fixture({nativeLayout=false,width=1460,height=960,guideTop=70,guideBottom=70,reducedMotion='reduce',diskEntries=[],workspaceItems,guideKind,accountOwner,initialDraft,seedGuideRegistration,guideSurface=true,deferRegistration=false}={}) {
  const page = await browser.newPage({ viewport: { width: 1460, height: 960 }, reducedMotion }), errors = [], external = []
  page.on('pageerror', error => errors.push(error.stack||error.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin !== 'https://guide.local') { external.push(route.request().url()); return route.abort() }
    return route.fulfill({ contentType: url.pathname === '/' ? 'text/html' : 'application/json', body: url.pathname === '/' ? `<!doctype html><meta charset="utf-8"><title>Native homepage guide fixture</title><style>${styles}\nhtml,body{height:100%;margin:0}#native-root{height:100%;min-height:0}.pI_x6G_frame{display:grid;grid-template-columns:88px minmax(0,1fr);height:100vh}.pI_x6G_centerCol{position:relative;min-width:0;min-height:0}#guide-host{position:absolute;inset:${guideTop}px 18px ${guideBottom}px;z-index:10}[data-home-guide="${runId}"]{position:absolute;inset:0;pointer-events:none}[data-home-guide="${runId}"]>#guide-host{pointer-events:auto}#outside-host{position:fixed;left:0;top:0}</style><div class="pI_x6G_frame"><aside></aside><main class="pI_x6G_centerCol"><div id="native-root"></div><section data-home-guide="${runId}"><div id="guide-host"></div></section></main></div><div id="outside-host"></div><div id="side-composer"></div><div id="side-history"></div><script>window.__ModuleLoader__={load:value=>window.descriptor=value};window.guideProbe={providerCalls:0,workspaceCalls:0,financialCalls:0,libraryCalls:0,workspaceConnections:[],workspaceArchives:[],workspaceOpens:[],diskEntries:${JSON.stringify(diskEntries)}};window.dshDesktop={financialWidget:{request:async()=>{window.guideProbe.financialCalls++;throw Error('Global financial bridge must not be called')}},componentLibrary:{request:async()=>{window.guideProbe.libraryCalls++;throw Error('Global library bridge must not be called')}}};</script>` : '{"tasks":[],"plans":[]}' })
  })
  await page.setViewportSize({width,height})
  await page.goto('https://guide.local/')
  await page.evaluate(value=>{Object.assign(window.guideProbe,value)},{nativeLayout,workspaceItems,guideKind,accountOwner,initialDraft,seedGuideRegistration,deferRegistration})
  await page.addScriptTag({ content: runtimeSource }); await page.evaluate(() => window.runtimeDescriptor = window.descriptor)
  await page.addScriptTag({ content: conversationSource }); await page.evaluate(() => window.conversationDescriptor = window.descriptor)
  await page.addScriptTag({ content: entry })
  if(!guideSurface)await page.locator('[data-home-guide]').evaluate(node=>node.remove())
  await page.waitForSelector('textarea', { timeout: 3000 }).catch(error=>{throw Error(JSON.stringify(errors)+' '+error.message)})
  await page.evaluate(() => { window.guideProbe.originalInput = document.querySelector('textarea'); window.guideProbe.originalRoot = document.querySelector('.wSkVaW_root'); document.querySelector('[data-srb-session-header]')?.setAttribute('data-ework-notes-session', 'guide-browser-session') })
  expect(errors).toEqual([])
  return { page, errors, external }
}

async function command(page, name, overrides = {}, replyTimeout = 8000) {
  return page.evaluate(({ name, overrides, runId, sessionId, replyTimeout }) => new Promise(resolve => {
    const requestId = 'browser-request-' + crypto.randomUUID()
    const timeout = setTimeout(() => { window.removeEventListener('sherlock:home-guide-native-reply', reply); resolve({ timeout: true, command: name }) }, replyTimeout)
    const reply = event => { if (event.detail?.requestId !== requestId) return; clearTimeout(timeout); window.removeEventListener('sherlock:home-guide-native-reply', reply); resolve(event.detail) }
    window.addEventListener('sherlock:home-guide-native-reply', reply)
    if(name==='mount-board'&&!Object.keys(overrides).length){const center=document.querySelector('.pI_x6G_centerCol'),root=document.querySelector('.wSkVaW_root'),guide=document.querySelector('[data-home-guide]');center.dataset.homeGuideActive=runId;root.dataset.homeGuideResident=runId;guide.dataset.kind='board'}
    window.dispatchEvent(new CustomEvent('sherlock:home-guide-native-request', { detail: { requestId, runId, sessionId, command: name, hostId: 'guide-host', ...overrides } }))
  }), { name, overrides, runId, sessionId, replyTimeout })
}
async function succeeds(page, name, overrides) { const reply=await command(page,name,overrides);expect(reply,name+(reply.message?': '+reply.message:'')).toMatchObject({runId,ok:true}) }
async function preserved(page) {
  expect(await page.evaluate(() => document.querySelector('textarea') === window.guideProbe.originalInput)).toBe(true)
  expect(await page.evaluate(() => document.querySelector('.wSkVaW_root') === window.guideProbe.originalRoot)).toBe(true)
  expect(await page.locator('textarea.uV2eYG_input').inputValue()).toBe(draft)
  expect(await page.evaluate(() => window.guideProbe.shell.snapshot.draft)).toBe(draft)
  expect(await page.evaluate(() => { const {registry,memory}=window.guideProbe,nodes=registry.for('guide-browser-session').getSnapshot().artifacts; return !nodes.length||JSON.stringify(JSON.parse(memory.get('sherlock.research.canvas.artifacts.v1:guide-browser-session')).map(n=>n.id))===JSON.stringify(nodes.map(n=>n.id)) })).toBe(true)
}
const canvas = page => page.locator('#guide-host [data-research-canvas]')
const widget = (page, name) => page.locator(`#guide-host [data-financial-widget="${name}"]`)

it.each([{width:1380,height:900},{width:1080,height:640}])('uses acknowledged real controls, visible port paths and typed search at $width × $height',async size=>{
 const {page,errors,external}=await fixture({nativeLayout:true,...size,guideTop:116,guideBottom:69})
 try{
  await succeeds(page,'mount-board')
  await page.evaluate(()=>{
   document.documentElement.dataset.homeGuidePointerRun='guide-browser-run'
   window.guideProbe.pointerCues=[];window.guideProbe.typed=[]
   document.addEventListener('input',event=>{if(event.target.getAttribute?.('role')==='combobox')window.guideProbe.typed.push(event.target.value)},true)
   window.addEventListener('sherlock:home-guide-cue',event=>{
    const d=event.detail;if(!d.requestId)return
    const rect=target=>{const r=target.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}},canvas=document.querySelector('#guide-host [data-research-canvas]')
    window.guideProbe.pointerCues.push({action:d.action,target:d.target.dataset.financialPortNode,from:d.fromTarget?.dataset.financialPortNode,toSide:d.target.dataset.financialPort,fromSide:d.fromTarget?.dataset.financialPort,targetRect:rect(d.target),fromRect:d.fromTarget?rect(d.fromTarget):null,canvas:rect(canvas)})
    window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:d.runId,requestId:d.requestId,ok:true}}))
   })
  })
  // The central pointer is represented only by its acknowledged contract here;
  // native components, search, layout and persistence remain the real renderer.
  for(const step of ['board-library','board-watchlist','board-quote','board-news','board-link','board-add','board-arrange'])await succeeds(page,step)
  const result=await page.evaluate(()=>{const p=window.guideProbe,snapshot=p.registry.for('guide-browser-session').getSnapshot();return{cues:p.pointerCues,typed:p.typed,nodes:snapshot.artifacts.map(n=>({id:n.id,spec:n.containerSpec})),stored:JSON.parse(p.memory.get('sherlock.research.canvas.artifacts.v1:guide-browser-session'))}})
  const watch=result.nodes.find(n=>n.spec.widget==='watchlist'),quote=result.nodes.find(n=>n.spec.widget==='quote'),news=result.nodes.find(n=>n.spec.widget==='news'),drags=result.cues.filter(cue=>cue.action==='drag')
  expect(drags.map(cue=>[cue.from,cue.fromSide,cue.target,cue.toSide])).toEqual([[watch.id,'output',quote.id,'input'],[quote.id,'output',news.id,'input']])
  for(const cue of drags)for(const box of [cue.fromRect,cue.targetRect]){expect(box.width).toBeGreaterThan(0);expect(box.y).toBeGreaterThanOrEqual(cue.canvas.y-1);expect(box.bottom).toBeLessThanOrEqual(cue.canvas.bottom+1)}
  expect(result.typed).toEqual(['0','00','007','0070','00700']);expect(watch.spec.symbols).toHaveLength(3);expect(quote.spec.symbols[0].code).toBe('00700');expect(quote.spec.linkedWatchlistId).toBe(watch.id);expect(news.spec.linkedSourceId).toBe(quote.id)
  expect(result.stored.map(node=>node.id).sort()).toEqual(result.nodes.map(node=>node.id).sort())
  expect(await page.locator('#guide-host .ew-financial-connection-line').count()).toBe(2)
  await preserved(page);expect(errors).toEqual([]);expect(external).toEqual([])
 }finally{await page.close()}
},20000)

it.each(['click','from-port','to-port'])('does not act when the acknowledged %s target moves offscreen',async kind=>{
 const {page,errors}=await fixture({nativeLayout:true,width:1380,height:900,guideTop:116,guideBottom:69})
 try{
  await succeeds(page,'mount-board')
  await page.evaluate(()=>{
   document.documentElement.dataset.homeGuidePointerRun='guide-browser-run'
   window.addEventListener('sherlock:home-guide-cue',event=>{
    const d=event.detail;if(!d.requestId)return
    const mode=window.guideProbe.offscreenTarget
    if(mode==='click'&&d.action==='click')d.target.style.transform='translateY(-3000px)'
    if(d.action==='drag'&&(mode==='from-port'||mode==='to-port'))(mode==='from-port'?d.fromTarget:d.target).style.transform='translateY(-3000px)'
    window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:d.runId,requestId:d.requestId,ok:true}}))
   })
  })
  if(kind!=='click')for(const step of ['board-watchlist','board-quote','board-news'])await succeeds(page,step)
  await page.evaluate(value=>{window.guideProbe.offscreenTarget=value},kind)
  const reply=await command(page,kind==='click'?'board-library':'board-link')
  expect(reply.ok).toBe(false)
  const nodes=await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts)
  expect(nodes.some(node=>node.containerSpec.linkedWatchlistId||node.containerSpec.linkedSourceId)).toBe(false)
  if(kind==='click'){expect(nodes).toHaveLength(0);expect(await page.locator('[data-financial-library]').getAttribute('aria-expanded')).toBe('false')}
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)

it('runs the offline board tutorial on the real native canvas and retains the original ConversationRoot and InputBar', async () => {
  const { page, errors, external } = await fixture()
  try {
    expect(await page.title()).toBe('Native homepage guide fixture')
    expect(page.url()).toBe('https://guide.local/')
    await succeeds(page, 'mount-board')
    await expect.poll(() => canvas(page).count()).toBe(1)
    expect(await page.locator('#guide-host [data-financial-widget]').count()).toBe(0)
    expect(await canvas(page).evaluate(el => { const box = el.getBoundingClientRect(); return box.width > 400 && box.height > 300 })).toBe(true)
    await preserved(page)
    await succeeds(page, 'board-library')
    await expect.poll(() => page.locator('[role="menu"][aria-label="组件库"] [data-financial-place="watchlist"]').count()).toBe(1)
    for (const name of ['watchlist', 'quote', 'news']) { await succeeds(page, `board-${name}`); await expect.poll(() => widget(page, name).count()).toBe(1) }
    expect(await page.locator('#guide-host [data-financial-widget]').count()).toBe(3)
    await succeeds(page, 'board-link')
    await expect.poll(() => page.locator('#guide-host .ew-financial-connection-line').count()).toBeGreaterThanOrEqual(2)
    await expect.poll(() => widget(page, 'quote').locator('[data-financial-chart]').count()).toBe(1)
    await expect.poll(() => widget(page, 'news').locator('.ew-news-list').textContent()).toMatch(/示例|演示/)
    await expect.poll(() => widget(page, 'watchlist').locator('[data-stock-code]').count()).toBe(2)
    const firstPrice = await widget(page, 'quote').locator('.ew-quote-price-line').textContent()
    await widget(page, 'watchlist').locator('[data-stock-code]').nth(1).click()
    await expect.poll(() => widget(page, 'quote').locator('.ew-quote-price-line').textContent()).not.toBe(firstPrice)
    await succeeds(page, 'board-add')
    await expect.poll(() => widget(page, 'watchlist').locator('[data-stock-code]').count()).toBe(3)
    await expect.poll(() => widget(page, 'quote').locator('.ew-quote-price-line strong').textContent()).toContain('462.400')
    await succeeds(page, 'board-arrange')
    await expect.poll(() => canvas(page).evaluate(el => Boolean(el.__eworkContentFit))).toBe(false)
    expect(await page.locator('[data-ework-toolbar][data-ework-toolbar-owner="guide-browser-session"] .ew-arrange-tool').getAttribute('data-arrange-mode')).toBe('three')
    const geometry = await page.locator('#guide-host [data-research-node-id]').evaluateAll(cards => cards.map(card => { const box = card.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height } }))
    expect(geometry).toHaveLength(3)
    const top = await canvas(page).evaluate(el => el.getBoundingClientRect().top)
    expect(Math.min(...geometry.map(box=>box.y))).toBeGreaterThanOrEqual(top - 1)
    const bottom = await canvas(page).evaluate(el => el.getBoundingClientRect().bottom)
    expect(Math.max(...geometry.map(box=>box.y+box.height)), 'the completed overview shows all three native cards without a clipped lower row').toBeLessThanOrEqual(bottom - 12)
    expect(geometry.every(box => box.width > 100 && box.height > 100 && Object.values(box).every(Number.isFinite))).toBe(true)
    expect(await page.locator('#guide-host').textContent()).toMatch(/示例|演示/)
    await preserved(page)
    expect(await page.evaluate(() => ({ provider: window.guideProbe.providerCalls, workspace: window.guideProbe.workspaceCalls, financial: window.guideProbe.financialCalls, library: window.guideProbe.libraryCalls }))).toEqual({ provider: 0, workspace: 0, financial: 0, library: 0 })
    expect(external).toEqual([]); expect(errors).toEqual([])
    await page.screenshot({ path: `${evidence}/linked-board.png` })
    await writeFile(`${evidence}/linked-board.json`, JSON.stringify({ url: page.url(), geometry, errors, external, bridgeCalls: await page.evaluate(() => ({ financial: window.guideProbe.financialCalls, library: window.guideProbe.libraryCalls })) }, null, 2))
  } finally { await page.close() }
}, 20000)

it('removes the native canvas and its body toolbar on dispose without clearing the original draft', async () => {
  const { page, errors } = await fixture()
  try {
    await succeeds(page, 'mount-board'); await succeeds(page, 'board-watchlist')
    await expect.poll(() => page.locator('[data-ework-toolbar-owner]').count()).toBeGreaterThan(0)
    await succeeds(page, 'board-library')
    await succeeds(page, 'dispose')
    await expect.poll(() => canvas(page).count()).toBe(0)
    expect(await page.locator('[data-ework-toolbar-owner]').count()).toBe(0)
    expect(await page.locator('[role="menu"][aria-label="组件库"]').count()).toBe(0)
    await preserved(page)
    await page.locator('textarea.uV2eYG_input').focus(); await page.keyboard.press('Meta+ArrowDown'); await page.keyboard.insertText('继续')
    expect(await page.evaluate(() => window.guideProbe.shell.snapshot.draft)).toBe(draft + '继续')
    expect(errors).toEqual([])
  } finally { await page.close() }
}, 10000)

it('rejects other sessions and hosts outside the requesting guide ownership boundary', async () => {
  const { page, errors } = await fixture()
  try {
    for (const overrides of [{ sessionId: 'another-session' }, { hostId: 'outside-host' }, { runId: 'another-run' }, { hostId: 'missing-host' }]) {
      const reply = await command(page, 'mount-board', overrides, 300)
      expect(reply.ok, JSON.stringify({ overrides, reply })).not.toBe(true)
      expect(await page.locator('[data-research-canvas]').count()).toBe(0)
    }
    await succeeds(page, 'mount-board')
    const reply = await command(page, 'board-watchlist', { sessionId: 'another-session' }, 300)
    expect(reply.ok).not.toBe(true)
    expect(await page.locator('#guide-host [data-financial-widget]').count()).toBe(0)
    await preserved(page); expect(errors).toEqual([])
  } finally { await page.close() }
}, 15000)

it('disposes its canvas and body portals when the native session changes', async () => {
  const { page, errors } = await fixture()
  try {
    await succeeds(page, 'mount-board'); await succeeds(page, 'board-watchlist')
    await page.evaluate(() => window.guideProbe.setContext({ sessionId: 'another-session', subagentPanel: false }))
    await expect.poll(() => canvas(page).count()).toBe(0)
    expect(await page.locator('[data-ework-toolbar-owner]').count()).toBe(0)
    expect(errors).toEqual([])
  } finally { await page.close() }
}, 10000)

it('does not accept homepage tutorial requests from a subagent panel', async () => {
  const { page, errors } = await fixture()
  try {
    await page.evaluate(() => window.guideProbe.setContext({ sessionId: 'guide-browser-session', subagentPanel: true }))
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const reply = await command(page, 'mount-board')
    expect(reply.ok).not.toBe(true)
    expect(await page.locator('[data-research-canvas]').count()).toBe(0)
    expect(await page.locator('[data-ework-toolbar-owner]').count()).toBe(0)
    expect(errors).toEqual([])
  } finally { await page.close() }
}, 10000)

it.each([['board','research'],['note','notes'],['ppt','chat']])('preserves native layout and resident identity during a %s guide, then restores native behavior',async(kind,view)=>{
 const {page,errors}=await fixture({nativeLayout:true,width:1240})
 try{
  const initial=await page.evaluate(()=>({left:document.querySelector('.pI_x6G_centerCol').getBoundingClientRect().left,sidebar:window.guideProbe.layout.getSnapshot().sidebar,panel:{...window.guideProbe.rightPanel}}))
  await page.evaluate(({kind,view,runId})=>{
   const center=document.querySelector('.pI_x6G_centerCol'),root=document.querySelector('.wSkVaW_root'),guide=document.querySelector('[data-home-guide]')
   center.dataset.homeGuideActive=runId;root.dataset.homeGuideResident=runId;guide.dataset.kind=kind
   window.guideProbe.view.update({view})
  },{kind,view,runId})
  await page.waitForTimeout(100)
  expect(errors).toEqual([])
  const active=await page.evaluate(()=>({left:document.querySelector('.pI_x6G_centerCol').getBoundingClientRect().left,sidebar:window.guideProbe.layout.getSnapshot().sidebar,panelOpen:window.guideProbe.rightPanel.panelOpen,rightWrites:window.guideProbe.rightChanges,page:document.querySelector('.wSkVaW_root').dataset.odysseyPage}))
  expect(active.panelOpen,'guide navigation must not open the resident conversation panel').toBe(false)
  expect(active.rightWrites).toEqual([])
  expect(active.sidebar,'the real AppFrame must not automatically collapse the left sidebar').toBe(initial.sidebar)
  expect(active.left).toBe(initial.left)
  expect(active.page).toBe('guide')
  expect(await page.locator('[data-srb-tabs] [data-conversation-view-id="'+view+'"]').getAttribute('aria-selected')).toBe('true')
  expect(await page.evaluate(()=>window.guideProbe.researchActivations.filter(item=>item.active))).toEqual([])
  if(kind==='board'){
   await succeeds(page,'mount-board')
   expect(await page.locator('[data-research-canvas]').count(),'one real workspace has one measuring canvas while guided').toBe(1)
   const owners=await page.locator('[data-ework-toolbar]').evaluateAll(nodes=>nodes.map(node=>node.dataset.eworkToolbarOwner))
   expect(owners).toEqual(['guide-browser-session'])
   await page.setViewportSize({width:1460,height:960})
   for(const step of ['board-library','board-watchlist','board-quote','board-news','board-link','board-add','board-arrange'])await succeeds(page,step)
   await expect.poll(()=>canvas(page).evaluate(el=>Boolean(el.__eworkContentFit))).toBe(false)
   const overview=await page.locator('#guide-host [data-research-node-id]').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()))
   const viewport=await canvas(page).boundingBox()
   expect(overview).toHaveLength(3)
   expect(Math.max(...overview.map(box=>box.bottom))).toBeLessThanOrEqual(viewport.y+viewport.height-12)
   expect(await page.evaluate(()=>window.guideProbe.rightChanges)).toEqual([])
   await page.screenshot({path:`${evidence}/native-layout-board.png`})
   await writeFile(`${evidence}/native-layout-board.json`,JSON.stringify({overview,viewport,owners,initial,active},null,2))
   await succeeds(page,'dispose')
   await page.setViewportSize({width:1240,height:960})
  }
  await preserved(page)
  await page.evaluate(()=>{document.documentElement.dataset.homeGuideTransition='exit-lease';document.documentElement.dataset.homeGuideTransitionSession='guide-browser-session';delete document.querySelector('.pI_x6G_centerCol').dataset.homeGuideActive;delete document.querySelector('.wSkVaW_root').dataset.homeGuideResident})
  await page.waitForTimeout(100)
  expect(await page.locator('.wSkVaW_root').getAttribute('data-odyssey-page')).toBe('guide')
  expect(await page.evaluate(()=>window.guideProbe.rightChanges)).toEqual([])
  expect(await page.evaluate(()=>window.guideProbe.layout.getSnapshot().sidebar)).toBe(initial.sidebar)
  await page.locator('[data-srb-tabs] [data-conversation-view-id="chat"]').click()
  await page.evaluate(()=>{delete document.documentElement.dataset.homeGuideTransition;delete document.documentElement.dataset.homeGuideTransitionSession})
  await page.waitForTimeout(60)
  expect(await page.evaluate(()=>window.guideProbe.layout.getSnapshot().sidebar)).toBe(initial.sidebar)
  expect(await page.evaluate(()=>window.guideProbe.rightPanel.panelOpen)).toBe(false)
  await page.evaluate(()=>window.guideProbe.view.update({view:'research'}))
  await expect.poll(()=>page.evaluate(()=>window.guideProbe.rightPanel.panelOpen)).toBe(true)
  await expect.poll(()=>page.evaluate(()=>window.guideProbe.layout.getSnapshot().sidebar)).toBe(0)
  await expect.poll(()=>page.locator(`[data-ework-toolbar][data-ework-toolbar-owner="${sessionId}"]`).count()).toBe(1)
  await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},20000)

it('keeps an already open user research panel, width and active file intact across a guide',async()=>{
 const {page,errors}=await fixture({nativeLayout:true})
 try{
  await page.evaluate(()=>window.guideProbe.view.update({view:'research'}))
  await expect.poll(()=>page.evaluate(()=>window.guideProbe.rightPanel.panelOpen)).toBe(true)
  await page.evaluate(()=>{
   const probe=window.guideProbe;probe.sidebar.service.setPanelState({open:true,width:420});probe.sidebar.service.openTab({id:'user-file',type:'file'});probe.rightChanges.length=0;probe.researchActivations.length=0
   const center=document.querySelector('.pI_x6G_centerCol'),root=document.querySelector('.wSkVaW_root'),guide=document.querySelector('[data-home-guide]')
   center.dataset.homeGuideActive=guide.dataset.homeGuide;root.dataset.homeGuideResident=guide.dataset.homeGuide;guide.dataset.kind='board'
  })
  await expect.poll(()=>page.locator('.wSkVaW_root').getAttribute('data-odyssey-page')).toBe('guide')
  const during=await page.evaluate(()=>({writes:window.guideProbe.rightChanges,activation:window.guideProbe.researchActivations,panel:window.guideProbe.rightPanel.panelOpen,width:window.guideProbe.rightPanel.width,tab:window.guideProbe.rightPanel.splits.active}))
  expect(during).toEqual({writes:[],activation:[],panel:true,width:420,tab:'user-file'})
  await page.evaluate(()=>{
   const center=document.querySelector('.pI_x6G_centerCol'),root=document.querySelector('.wSkVaW_root'),guide=document.querySelector('[data-home-guide]')
   guide.dataset.homeGuide='replayed-run';center.dataset.homeGuideActive='replayed-run';root.dataset.homeGuideResident='replayed-run'
  })
  await page.waitForTimeout(60)
  expect(await page.evaluate(()=>window.guideProbe.researchActivations)).toEqual([])
  await page.evaluate(()=>{delete document.querySelector('.pI_x6G_centerCol').dataset.homeGuideActive;delete document.querySelector('.wSkVaW_root').dataset.homeGuideResident})
  await expect.poll(()=>page.locator('.wSkVaW_root').getAttribute('data-odyssey-page')).toBe('research')
  expect(await page.evaluate(()=>({writes:window.guideProbe.rightChanges,activation:window.guideProbe.researchActivations,panel:window.guideProbe.rightPanel.panelOpen,width:window.guideProbe.rightPanel.width,tab:window.guideProbe.rightPanel.splits.active}))).toEqual({writes:[],activation:[],panel:true,width:420,tab:'user-file'})
  await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},20000)

it.each(['session-change','unmount'])('releases research activation held by a guide on %s',async end=>{
 const {page,errors}=await fixture({nativeLayout:true})
 try{
  await page.evaluate(()=>window.guideProbe.view.update({view:'research'}))
  await expect.poll(()=>page.evaluate(()=>window.guideProbe.researchActiveSessions.has('guide-browser-session'))).toBe(true)
  await page.evaluate(()=>{
   const center=document.querySelector('.pI_x6G_centerCol'),root=document.querySelector('.wSkVaW_root'),guide=document.querySelector('[data-home-guide]')
   center.dataset.homeGuideActive=guide.dataset.homeGuide;root.dataset.homeGuideResident=guide.dataset.homeGuide;guide.dataset.kind='board'
  })
  await expect.poll(()=>page.locator('.wSkVaW_root').getAttribute('data-odyssey-page')).toBe('guide')
  expect(await page.evaluate(()=>window.guideProbe.researchActiveSessions.has('guide-browser-session'))).toBe(true)
  await page.evaluate(end=>end==='unmount'?window.guideProbe.dispose():window.guideProbe.setContext({sessionId:'next-session',subagentPanel:false}),end)
  await expect.poll(()=>page.evaluate(()=>window.guideProbe.researchActiveSessions.has('guide-browser-session'))).toBe(false)
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)


it.each([{width:1380,height:900},{width:1380,height:768},{width:1080,height:900}])('finishes the native board above its toolbar at $width × $height',async size=>{
 const {page,errors}=await fixture({nativeLayout:true,...size,guideTop:116,guideBottom:69,reducedMotion:'no-preference'})
 try{
  await page.evaluate(()=>{
   const center=document.querySelector('.pI_x6G_centerCol'),root=document.querySelector('.wSkVaW_root'),guide=document.querySelector('[data-home-guide]')
   center.dataset.homeGuideActive=guide.dataset.homeGuide;root.dataset.homeGuideResident=guide.dataset.homeGuide;guide.dataset.kind='board';window.guideProbe.view.update({view:'research'})
  })
  for(const step of ['mount-board','board-library','board-watchlist','board-quote','board-news','board-link','board-add','board-arrange'])await succeeds(page,step)
  await expect.poll(()=>canvas(page).evaluate(el=>Boolean(el.__eworkContentFit))).toBe(false)
  const result=await page.evaluate(()=>{
   const canvas=document.querySelector('#guide-host [data-research-canvas]'),toolbar=document.querySelector('[data-ework-toolbar][data-ework-toolbar-owner="guide-browser-session"]')
   return {canvas:canvas.getBoundingClientRect().toJSON(),toolbar:toolbar.getBoundingClientRect().toJSON(),cards:[...canvas.querySelectorAll('[data-research-node-id]')].map(node=>({widget:node.querySelector('[data-financial-widget]')?.dataset.financialWidget,rect:node.getBoundingClientRect().toJSON(),footer:node.querySelector('.ew-financial-footer')?.getBoundingClientRect().toJSON(),chart:node.querySelector('[data-financial-chart]')?.getBoundingClientRect().toJSON()}))}
  })
  await page.screenshot({path:`${evidence}/final-${size.width}x${size.height}.png`})
  await writeFile(`${evidence}/final-${size.width}x${size.height}.json`,JSON.stringify(result,null,2))
  expect(result.cards).toHaveLength(3)
  const safeBottom=Math.min(result.canvas.bottom-12,result.toolbar.top-12)
  for(const {widget,rect,footer,chart} of result.cards){
   expect(rect.top,widget+' header').toBeGreaterThanOrEqual(result.canvas.top+10)
   expect(rect.bottom,widget+' footer must clear the native toolbar').toBeLessThanOrEqual(safeBottom+1)
   expect(footer.height).toBeGreaterThanOrEqual(20)
   expect(footer.bottom,widget+' provenance remains inside its native frame').toBeLessThanOrEqual(rect.bottom+1)
   if(chart)expect(chart.height,'a useful native chart remains visible').toBeGreaterThan(80)
  }
  expect(await page.locator('[data-canvas-action-receipt][data-ework-toolbar-owner="guide-browser-session"]').count()).toBe(0)
  await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},20000)


it('keeps a very short narrow board readable and reachable by native canvas scrolling',async()=>{
 const {page,errors}=await fixture({nativeLayout:true,width:1080,height:640,guideTop:116,guideBottom:69,reducedMotion:'no-preference'})
 try{
  for(const step of ['mount-board','board-watchlist','board-quote','board-news','board-link','board-add','board-arrange'])await succeeds(page,step)
  const root=canvas(page)
  expect(await page.locator('[data-research-canvas]').count()).toBe(1)
  expect(await root.evaluate(el=>Math.abs(window.guideProbe.registry.for('guide-browser-session').getSnapshot().canvasSize.height-el.getBoundingClientRect().height))).toBeLessThan(1)
  expect(await root.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true)
  expect(await widget(page,'quote').locator('[data-financial-chart]').evaluate(el=>el.clientHeight)).toBeGreaterThan(80)
  for(const name of ['watchlist','quote','news']){
   const footer=widget(page,name).locator('.ew-financial-footer')
   const delta=await footer.evaluate(el=>el.getBoundingClientRect().bottom-document.querySelector('[data-ework-toolbar][data-ework-toolbar-owner="guide-browser-session"]').getBoundingClientRect().top+16)
   if(delta>0){await root.hover({position:{x:3,y:80}});await page.mouse.wheel(0,Math.ceil(delta));await page.waitForTimeout(60)}
   const position=await footer.evaluate(el=>({footer:el.getBoundingClientRect().toJSON(),canvas:el.closest('[data-research-canvas]').getBoundingClientRect().toJSON(),toolbar:document.querySelector('[data-ework-toolbar][data-ework-toolbar-owner="guide-browser-session"]').getBoundingClientRect().toJSON()}))
   expect(position.footer.top,name+' footer can be reached').toBeGreaterThanOrEqual(position.canvas.top)
   expect(position.footer.bottom,name+' footer clears the toolbar').toBeLessThan(position.toolbar.top)
  }
  expect(await root.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
  await page.screenshot({path:`${evidence}/final-1080x640-scroll.png`})
  await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},20000)

it('retains the saved example and offline source after leaving the guide and recreating the native renderer',async()=>{
 const first=await fixture({nativeLayout:true});let diskEntries,ids
 try{
  await first.page.evaluate(()=>{const center=document.querySelector('.pI_x6G_centerCol'),root=document.querySelector('.wSkVaW_root'),guide=document.querySelector('[data-home-guide]');center.dataset.homeGuideActive=guide.dataset.homeGuide;root.dataset.homeGuideResident=guide.dataset.homeGuide;guide.dataset.kind='board';window.guideProbe.view.update({view:'research'})})
  await succeeds(first.page,'mount-board');await succeeds(first.page,'board-watchlist');await succeeds(first.page,'dispose')
  diskEntries=await first.page.evaluate(()=>[...window.guideProbe.memory]);ids=await first.page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.map(node=>node.id))
  await preserved(first.page);expect(first.errors).toEqual([])
 }finally{await first.page.close()}
 const second=await fixture({nativeLayout:true,diskEntries})
 try{
  await second.page.evaluate(()=>window.guideProbe.view.update({view:'research'}))
  await expect.poll(()=>second.page.locator('.wSkVaW_root [data-financial-widget=watchlist] .ew-watch-price').first().textContent()).toContain('1,456.80')
  expect(await second.page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.map(node=>node.id))).toEqual(ids)
  expect(await second.page.locator('[data-home-guide-native]').count()).toBe(0)
  expect(await second.page.evaluate(()=>({financial:window.guideProbe.financialCalls,library:window.guideProbe.libraryCalls}))).toEqual({financial:0,library:0})
  expect(await second.page.locator('textarea.uV2eYG_input').inputValue()).toBe(draft)
  expect(second.errors).toEqual([])
 }finally{await second.page.close()}
},20000)

it.each(['note','ppt'])('keeps a registered %s example editable on the real blank Chat hero after tab return and renderer revisit',async kind=>{
 const options={workspaceItems:[],guideKind:kind,initialDraft:''},first=await fixture(options);let diskEntries
 try{
  const page=first.page,root=page.locator('.wSkVaW_root'),input=page.locator('textarea.uV2eYG_input')
  expect(await root.getAttribute('data-odyssey-page')).toBe('home')
  expect(await page.locator('.wSkVaW_composerHero').textContent()).toContain(kind==='note'?'AI 护航研究笔记示例':'公司风格演示示例')
  await expect.poll(()=>input.isEditable()).toBe(true)
  await page.locator('[data-conversation-view-id="notes"]').click();await page.locator('[data-conversation-view-id="chat"]').click()
  expect(await page.evaluate(()=>document.querySelector('textarea.uV2eYG_input')===window.guideProbe.originalInput)).toBe(true)
  expect(await input.isEditable()).toBe(true)
  await input.fill('继续编辑已经保存的示例');expect(await page.locator('button.uV2eYG_primary').isDisabled()).toBe(false)
  expect(await page.evaluate(()=>({calls:window.guideProbe.workspaceCalls,registration:window.guideProbe.registrationCalls,binding:window.guideProbe.bindingCalls,items:window.guideProbe.workspaceList.getSnapshot().items}))).toEqual({calls:0,registration:1,binding:1,items:[{workspaceId:'guide-example-workspace',path:'/tmp/guide-browser',title:kind==='note'?'AI 护航研究笔记示例':'公司风格演示示例',sessionIds:['guide-browser-session']}]})
  diskEntries=await page.evaluate(()=>[...window.guideProbe.memory]);expect(first.errors).toEqual([])
 }finally{await first.page.close()}
 const second=await fixture({...options,diskEntries,seedGuideRegistration:false})
 try{await expect.poll(()=>second.page.locator('textarea.uV2eYG_input').isEditable()).toBe(true);expect(second.errors).toEqual([])}finally{await second.page.close()}
},10000)
it.each([{guideKind:false,accountOwner:'owner'},{guideKind:'ppt',accountOwner:'other'}])('keeps an ordinary or other-account projectless hero disabled ($guideKind/$accountOwner)',async options=>{
 const {page,errors}=await fixture({...options,workspaceItems:[],initialDraft:''})
 try{
  expect(await page.locator('.wSkVaW_root').getAttribute('data-odyssey-page')).toBe('home')
  expect(await page.locator('textarea.uV2eYG_input').isEditable()).toBe(false)
  expect(await page.locator('button.uV2eYG_primary').isDisabled()).toBe(true)
  expect(await page.evaluate(()=>window.guideProbe.guidePage.directoryChoice('guide-browser-session'))).toBe(null)
  expect(errors).toEqual([])
 }finally{await page.close()}
})
it('prefers an existing real Workspace over the registered example directory',async()=>{
 const {page,errors}=await fixture({guideKind:'ppt',initialDraft:'',workspaceItems:[{workspaceId:'existing',title:'已关联真实工作区',path:'/tmp/guide-browser',sessionIds:['guide-browser-session']}]})
 try{
  expect(await page.locator('.wSkVaW_composerHero').textContent()).toContain('已关联真实工作区')
  expect(await page.evaluate(()=>window.guideProbe.guidePage.directoryChoice('guide-browser-session'))).toBe(null)
  expect(await page.locator('textarea.uV2eYG_input').isEditable()).toBe(true)
  expect(await page.evaluate(()=>window.guideProbe.workspaceCalls)).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
})

it.each(['note','ppt'])('reselects a %s example real Workspace through the native menu without switching, creating or archiving',async kind=>{
 const {page,errors}=await fixture({workspaceItems:[],guideKind:kind,initialDraft:'保留当前示例草稿',guideSurface:false})
 try{
  await expect.poll(()=>page.locator('textarea.uV2eYG_input').isEditable()).toBe(true)
  await page.getByRole('button',{name:'选择工作区',exact:true}).click()
  const choice=page.getByRole('menuitem',{name:kind==='note'?'AI 护航研究笔记示例':'公司风格演示示例',exact:true});await choice.waitFor()
  await choice.click();await page.waitForTimeout(70)
  expect(await page.evaluate(()=>({connections:window.guideProbe.workspaceConnections,archives:window.guideProbe.workspaceArchives,opens:window.guideProbe.workspaceOpens}))).toEqual({connections:[],archives:[],opens:['guide-browser-session']})
  expect(await page.evaluate(()=>window.guideProbe.shell.snapshot.draft)).toBe('保留当前示例草稿')
  expect(await page.locator('textarea.uV2eYG_input').isEditable()).toBe(true)
  expect(await page.evaluate(()=>document.querySelector('textarea.uV2eYG_input')===window.guideProbe.originalInput)).toBe(true)
  expect(await page.evaluate(()=>window.guideProbe.workspaceList.getSnapshot().items[0].sessionIds)).toEqual(['guide-browser-session']);expect(errors).toEqual([])
 }finally{await page.close()}
},10000)

it.each(['note','ppt'])('keeps the real %s InputBar locked until legacy Workspace registration completes without remounting or losing its draft',async kind=>{
 const {page,errors}=await fixture({workspaceItems:[],guideKind:kind,initialDraft:'保留绑定前草稿',guideSurface:false,deferRegistration:true})
 try{
  const input=page.locator('textarea.uV2eYG_input')
  expect(await input.isEditable()).toBe(false)
  expect(await page.evaluate(()=>window.guideProbe.guidePage.directoryChoice('guide-browser-session'))).toBe(null)
  expect(await page.locator('button.uV2eYG_primary').isDisabled()).toBe(true)
  await page.evaluate(()=>window.guideProbe.releaseWorkspace())
  await expect.poll(()=>input.isEditable()).toBe(true)
  expect(await page.evaluate(()=>document.querySelector('textarea.uV2eYG_input')===window.guideProbe.originalInput)).toBe(true)
  expect(await input.inputValue()).toBe('保留绑定前草稿')
  expect(await page.evaluate(()=>({registration:window.guideProbe.registrationCalls,binding:window.guideProbe.bindingCalls,connections:window.guideProbe.workspaceConnections,archives:window.guideProbe.workspaceArchives,opens:window.guideProbe.workspaceOpens}))).toEqual({registration:1,binding:1,connections:[],archives:[],opens:[]})
  expect(errors).toEqual([])
 }finally{await page.close()}
},10000)
