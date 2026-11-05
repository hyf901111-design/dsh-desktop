import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { createSourceFile, ScriptTarget, ScriptKind, forEachChild, isFunctionDeclaration } from 'typescript'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { patchNoteSessionRuntime } from '../scripts/lib/notes-session.mjs'
import { HOME_BOARD_SMART_PATH, HOME_BOARD_SMART_PROMPT, HOME_BOARD_SMART_ARTIFACT } from '../packages/dsh-research-task-runtime/home-board-smart-contract.js'
import {stripWorkbenchReplay} from './fixtures/strip-workbench-replay.mjs'
import {stripConversationLiveUi} from './fixtures/strip-conversation-live-ui.mjs'

// Browser plugin not available. Use the existing Playwright/Chromium runtime;
// this fixture mounts production native components and blocks all live providers.
const evidence = process.env.SHERLOCK_HOME_GUIDE_EVIDENCE || '/tmp/home-guide-native-browser-20261024'
const runId = 'guide-browser-run'
const sessionId = 'guide-browser-session'
const draft = '保留我的原生输入草稿\n第二行 🔎'
// Serialize the production functions without Vitest's imported-binding rewrites.
const requireNative=createRequire(import.meta.url)
const {patchComposerDeliverablePreview}=requireNative('../scripts/lib/figma-composer-deliverable-preview.mjs')
const {stripPlainSlashInput}=requireNative('../scripts/lib/plain-slash-input.mjs')
const {patchNotesSidebar}=requireNative('../scripts/lib/notes-sidebar.mjs')
const {patchBoardTabsClient,stripBoardTabsClient}=requireNative('../scripts/lib/board-tabs-client.mjs')
const {stripConversationHistoryClient}=requireNative('../scripts/lib/conversation-history-page.mjs')
const {stripConversationSubmission}=requireNative('../scripts/lib/conversation-submission.mjs')
const {stripConversationResponseProgress}=requireNative('../scripts/lib/conversation-response-progress.mjs')
const {stripHomeGuidePresentationNative}=requireNative('../scripts/lib/home-guide-presentation-native.mjs')
const {stripPptxAnnotationMessages}=requireNative('../scripts/lib/pptx-annotation-message.mjs')
const {stripPptxAnnotationInput}=requireNative('../scripts/lib/pptx-annotation-native.mjs')
const {patchHomeGuideNative,stripHomeGuideNative}=requireNative('../scripts/lib/home-guide-native.mjs')
const {stripSidebarNewNoteConversation}=requireNative('../scripts/lib/sidebar-new-note.mjs')
let browser, runtimeSource, conversationSource, entry, styles

beforeAll(async () => {
  runtimeSource = patchNoteSessionRuntime(await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js', 'utf8'))
  // Board tabs own the outer restore records, matching the production unwind
  // order before refreshing native guide and annotation renderer anchors.
  const unTabbed = stripWorkbenchReplay(stripBoardTabsClient(stripConversationLiveUi(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'))))
  const submitted = stripConversationResponseProgress(stripConversationSubmission(stripConversationHistoryClient(unTabbed)))
  const native = stripHomeGuideNative(stripHomeGuidePresentationNative(stripPptxAnnotationInput(stripPptxAnnotationMessages(stripSidebarNewNoteConversation(stripPlainSlashInput(submitted))))))
  conversationSource = patchBoardTabsClient(patchHomeGuideNative(patchComposerDeliverablePreview(patchNotesSidebar(native))))
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
  const sidebarSource=(await readFile('node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.SidebarRoot=SidebarRoot;')
  const pageBundle = await build({stdin:{contents:"export * from './src/preload/research-boards-ui.ts'",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'browser',format:'cjs',write:false,external:['react','@deepseek-ai/dsh-client-ui-primitives'],target:'chrome120',logLevel:'silent'})
  const output = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot}from'react-dom/client';import{Menu as NativeMenu}from'@deepseek-ai/dsh-client-ui-primitives';import{createHomeGuidePointer}from'./src/preload/home-guide-pointer';import{homeGuideFinancialBridgeFixture}from'./test/fixtures/home-guide-financial-bridge.js';
      window.dshDesktop.financialWidget=homeGuideFinancialBridgeFixture(input=>{window.guideProbe.financialCalls++;(window.guideProbe.financialRequests??=[]).push(input)});window.dshDesktop.calendarTool={request:async input=>{(window.guideProbe.calendarRequests??=[]).push(input);return {events:[],notices:[]}},subscribe:()=>()=>{}};
      const react=React,react_jsx_runtime=jsx,react_dom=dom,COLLAPSED_SIDEBAR_WIDTH=80,SIDEBAR_AUTO_COLLAPSE=1024,_deepseek_ai_dsh_client_runtime_client={defineStore:spec=>spec};
      const AppFrame_module_css_default={frame:'pI_x6G_frame',sidebarCol:'pI_x6G_sidebarCol',centerCol:'pI_x6G_centerCol',detailsCol:'pI_x6G_detailsCol',handle:'pI_x6G_handle',overlayLayer:'pI_x6G_overlayLayer'};
      ${frame}
      let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
      const cordis=new Proxy({Service:class{constructor(ctx){this.ctx=ctx}}},{get:(target,key)=>target[key]??fake});
      const primitives=new Proxy({Tooltip:({children})=>children,MarkdownText:({text})=><p>{text}</p>},{get:(target,key)=>target[key]??(()=>null)});
      const WorkspacePickFlow=new Function('react','react_jsx_runtime','_deepseek_ai_dsh_client_ui_primitives','WorkspacePicker_module_css_default','ADD_WORKSPACE',${JSON.stringify(workspacePicker)}+'\\nreturn WorkspacePickFlow;')(React,jsx,new Proxy({Menu:NativeMenu},{get:(target,key)=>target[key]??(()=>null)}),{},'::add-workspace');
      const guidePageModule=(()=>{const module={exports:{}},exports=module.exports,require=id=>id==='react'?React:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:fake;${pageBundle.outputFiles[0].text};return module.exports})();
      let sidebarDescriptor;const priorLoader=window.__ModuleLoader__;window.__ModuleLoader__={load:value=>sidebarDescriptor=value};new Function('window',${JSON.stringify(sidebarSource)})(window);window.__ModuleLoader__=priorLoader;const sidebarUi=sidebarDescriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='@deepseek-ai/cordis'?cordis:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:fake);
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
        const NativeFrame=()=>React.createElement(AppFrame,{actions:layoutActions,useStore:select=>select(React.useSyncExternalStore(state.subscribe,state.getSnapshot,state.getSnapshot)),useSessions:select=>select({byId:{}}),renderSlot:name=>name==='sidebar'?React.createElement(sidebarUi.SidebarRoot,{collapsed:state.getSnapshot().sidebar===0,width:280,t:key=>key,toggleSidebar:()=>layoutActions.toggleSidebar(),startSession(){},startResearchSession(){},renderSlot:()=>null}):name==='conversation'?React.createElement('div',{style:{display:'contents'},ref:node=>{if(node&&!node.contains(nativeHost))node.append(nativeHost,guide)}}):null});
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
      window.guideProbe.ackCue=async d=>{let error;const find=token=>[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===token);if(d.action==='drag'){const pointer=createHomeGuidePointer(document,{runId:d.runId,signal:new AbortController().signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,Math.min(ms,1))),waitUntilPlaying:()=>Promise.resolve()});try{await pointer.perform({target:find(d.targetToken),fromTarget:find(d.fromTargetToken),action:d.action,onFrame:frame=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-progress',{detail:{runId:d.runId,requestId:d.requestId,...frame}}))})}catch(e){error=e}finally{pointer.dispose()}}window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:d.runId,requestId:d.requestId,ok:!error,message:error?.message}}))};
      Object.assign(window.guideProbe,{native,shell,registry,memory,view,session,sidebar,guidePage,workspaceList,createPointer:options=>createHomeGuidePointer(document,options),dispose(){root.unmount();frameRoot?.unmount();disposers.reverse().forEach(stop=>stop())}});root.render(<App/>);
    ` },
    bundle: true, platform: 'browser', format: 'iife', write: false, define: { 'process.env.NODE_ENV': '"production"' },loader:{'.css':'empty'}
  })
  entry = output.outputFiles[0].text
  const pw = await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await (pw.default ?? pw).chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell', args: ['--enable-unsafe-swiftshader'] })
  await mkdir(evidence, { recursive: true })
}, 30000)
afterAll(() => browser?.close())

async function fixture({nativeLayout=false,width=1460,height=960,guideTop=70,guideBottom=70,deviceScaleFactor=1,reducedMotion='reduce',diskEntries=[],workspaceItems,guideKind,accountOwner,initialDraft,seedGuideRegistration,guideSurface=true,deferRegistration=false,smartMode='ready'}={}) {
  const page = await browser.newPage({ viewport: { width: 1460, height: 960 }, deviceScaleFactor, reducedMotion }), errors = [], external = []
  page.on('pageerror', error => errors.push(error.stack||error.message))
  const smartRequests=[];let releaseSmart;const smartGate=new Promise(resolve=>releaseSmart=resolve)
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== 'https://guide.local') { external.push(route.request().url()); return route.abort() }
    if(url.pathname===HOME_BOARD_SMART_PATH){
      const input=route.request().postDataJSON();smartRequests.push(input)
      if(smartMode==='deferred')await smartGate
      const now=Date.now(),task={taskId:'guide-smart-result',canvasNodeId:smartMode==='wrong-node'?'foreign-node':input.canvasNodeId,state:'completed',finalOutput:JSON.stringify(HOME_BOARD_SMART_ARTIFACT),createdAt:now,startedAt:now,completedAt:now,lastSeq:1,events:[]}
      return route.fulfill({contentType:'application/json',body:JSON.stringify(task)})
    }
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
  return { page, errors, external, smartRequests, releaseSmart }
}

async function command(page, name, overrides = {}, replyTimeout = name==='board-add'?40000:name==='board-link'?20000:8000) {
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
async function connectionRoom(page){
 return page.evaluate(()=>{const host=document.getElementById('guide-host'),canvas=host.querySelector('[data-research-canvas]'),bounds=canvas.getBoundingClientRect(),scale=bounds.height/canvas.clientHeight||1;let top=Math.max(0,bounds.top),bottom=Math.min(innerHeight,bounds.bottom);for(let parent=canvas.parentElement;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(/hidden|auto|scroll|clip/.test(style.overflowY||style.overflow)){const r=parent.getBoundingClientRect();top=Math.max(top,r.top);bottom=Math.min(bottom,r.bottom)}}const toolbar=document.querySelector('[data-ework-toolbar][data-ework-toolbar-owner="guide-browser-session"]')?.getBoundingClientRect();if(toolbar?.width>0&&toolbar.top>top)bottom=Math.min(bottom,toolbar.top-12*scale);const nodes=window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts,id=kind=>nodes.find(node=>node.containerSpec.widget===kind)?.id,port=(kind,side)=>host.querySelector('[data-financial-port-node="'+id(kind)+'"][data-financial-port="'+side+'"]').getBoundingClientRect(),spans=[['watchlist','quote'],['quote','news'],['quote','announcements']].filter(([,kind])=>id(kind)).map(([source,target])=>{const a=port(source,'output'),b=port(target,'input');return{source,target,height:Math.max(a.bottom,b.bottom)-Math.min(a.top,b.top)}}),available=bottom-top-24*scale;return{available,spans,fits:spans.every(span=>span.height<=available)}})
}
async function preserved(page) {
  expect(await page.locator('textarea.uV2eYG_input').count()).toBe(1)
  expect(await page.evaluate(() => document.querySelector('.wSkVaW_root') === window.guideProbe.originalRoot)).toBe(true)
  expect(await page.locator('textarea.uV2eYG_input').inputValue()).toBe(draft)
  expect(await page.evaluate(() => window.guideProbe.shell.snapshot.draft)).toBe(draft)
  expect(await page.evaluate(() => { const {registry,memory}=window.guideProbe,nodes=registry.for('guide-browser-session').getSnapshot().artifacts; return !nodes.length||JSON.stringify(JSON.parse(memory.get('sherlock.research.canvas.artifacts.v1:guide-browser-session')).map(n=>n.id))===JSON.stringify(nodes.map(n=>n.id)) })).toBe(true)
}
async function scrollMotionSetup(page) {
 await page.evaluate(()=>{window.guideProbe.view.update({view:'research'});document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.addEventListener('sherlock:home-guide-cue',event=>{const d=event.detail;if(!d.requestId)return;const canvas=document.querySelector('#guide-host [data-research-canvas]');(window.guideProbe.motionCues??=[]).push({label:d.label,top:canvas?.scrollTop,time:performance.now(),target:[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===d.targetToken)?.getBoundingClientRect().toJSON()});window.guideProbe.ackCue(d)})})
}
async function recordScrollMotion(page,step) {
 await page.evaluate(()=>{const p=window.guideProbe,canvas=document.querySelector('#guide-host [data-research-canvas]');p.motionFrames=[];p.motionCues=[];p.motionRecording=true;const record=()=>{p.motionFrames.push({top:canvas.scrollTop,time:performance.now()});if(p.motionRecording)requestAnimationFrame(record)};record()})
 const reply=await command(page,step,{},15000)
 await page.waitForTimeout(150)
 return page.evaluate(reply=>{const p=window.guideProbe;p.motionRecording=false;return{reply,frames:p.motionFrames,cues:p.motionCues}},reply)
}
it.each(['light','dark'])('reserves the real workspace header once in the native Board demo (%s)',async mode=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1255,height:818,deviceScaleFactor:1.1,guideTop:44,guideBottom:0})
 const out='/tmp/release140-board-header-20261027';await mkdir(out,{recursive:true})
 try{
  await page.addStyleTag({content:(await Promise.all(['figma-final-shell','figma-panels','figma-refinements','home-guides'].map(name=>readFile('src/preload/'+name+'.css','utf8')))).join('\n')})
  await page.evaluate(mode=>{if(mode==='dark')document.body.dataset.dsDarkTheme='';window.guideProbe.view.update({view:'research'});const host=document.getElementById('guide-host');Object.assign(host.style,{left:'0px',right:'348px',background:'#111214'})},mode)
  await succeeds(page,'mount-board')
  const geometry=await page.evaluate(()=>{const host=document.getElementById('guide-host'),canvas=host.querySelector('[data-research-canvas]'),header=document.querySelector('[data-srb-session-header]');return{host:host.getBoundingClientRect().toJSON(),canvas:canvas.getBoundingClientRect().toJSON(),header:header.getBoundingClientRect().toJSON(),margin:getComputedStyle(canvas).marginTop,headerHeight:getComputedStyle(header).height}})
  await writeFile(out+'/header-'+mode+'.json',JSON.stringify(geometry,null,2));await page.screenshot({path:out+'/header-'+mode+'.png'})
  expect(geometry.canvas.top-geometry.host.top,'the guide is already below the native header').toBeLessThan(1)
  expect(Math.abs(geometry.canvas.bottom-geometry.host.bottom)).toBeLessThan(1)
  expect(geometry.headerHeight).toBe('44px')
  await succeeds(page,'dispose')
  await page.evaluate(()=>{document.querySelector('[data-home-guide]').remove();delete document.querySelector('.pI_x6G_centerCol').dataset.homeGuideActive;delete document.querySelector('.wSkVaW_root').dataset.homeGuideResident})
  await expect.poll(()=>page.locator('#native-root [data-research-canvas]').count()).toBe(1)
  expect(await page.locator('#native-root [data-research-canvas]').evaluate(node=>getComputedStyle(node).marginTop)).toBe('44px')
  expect(await page.locator('[data-srb-session-header]').evaluate(node=>getComputedStyle(node).height)).toBe('44px')
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)
it.each(['inset','overlay'])('replays the four-component Board stage and finishes real links with the %s right pane at formal 1.1 scale',async rightPane=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1255,height:818,deviceScaleFactor:1.1,guideTop:44,guideBottom:0,reducedMotion:'no-preference'})
 const out='/tmp/release140-board-header-20261027';await mkdir(out,{recursive:true});const stages=[]
 try{
  await page.addStyleTag({content:(await Promise.all(['figma-final-shell','figma-panels','figma-refinements','home-guides'].map(name=>readFile('src/preload/'+name+'.css','utf8')))).join('\n')})
  await page.evaluate(rightPane=>{
   document.body.dataset.dsDarkTheme='';window.guideProbe.view.update({view:'research'});Object.assign(document.getElementById('guide-host').style,{left:'0px',right:rightPane==='overlay'?'0px':'348px'});document.documentElement.dataset.homeGuidePointerRun='guide-browser-run'
   if(rightPane==='overlay'){const panel=document.createElement('aside');panel.className='t8lSSG_panel';panel.style.cssText='position:fixed;right:12px;top:22px;bottom:22px;width:348px;z-index:100';document.body.append(panel)}
   const p=window.guideProbe;p.headerCues=[];p.headerPointer=p.createPointer({runId:'guide-browser-run',signal:new AbortController().signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>Promise.resolve()})
   window.addEventListener('sherlock:home-guide-cue',event=>{const d=event.detail;if(!d.requestId)return;const find=token=>[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===token);p.headerCues.push({label:d.label,action:d.action});const reply=(ok,message)=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:d.runId,requestId:d.requestId,ok,message}}));void p.headerPointer.perform({target:find(d.targetToken),fromTarget:find(d.fromTargetToken),action:d.action,onFrame:frame=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-progress',{detail:{runId:d.runId,requestId:d.requestId,...frame}}))}).then(()=>reply(true),error=>reply(false,error.message))})
  },rightPane)
  for(const step of ['mount-board','board-library','board-indices','board-watchlist','board-quote','board-news','board-announcements','board-calendar','board-arrange','board-link','board-add','board-smart-container','board-smart-generate']){
   const reply=await command(page,step,{},40000),stage=await page.evaluate(({step,reply})=>{const p=window.guideProbe,canvas=document.querySelector('#guide-host [data-research-canvas]');return{step,reply,canvas:canvas?.getBoundingClientRect().toJSON(),scroll:canvas?.scrollTop,maxScroll:canvas?canvas.scrollHeight-canvas.clientHeight:null,artifacts:p.registry.for('guide-browser-session').getSnapshot().artifacts.map(node=>({id:node.id,widget:node.containerSpec?.widget,linkedWatchlistId:node.containerSpec?.linkedWatchlistId,linkedSourceId:node.containerSpec?.linkedSourceId,width:node.width,height:node.height})),cues:p.headerCues}}, {step,reply});stages.push(stage);await writeFile(out+'/formal-stage-replay-'+rightPane+'.json',JSON.stringify(stages,null,2));expect(reply,step+': '+reply.message).toMatchObject({ok:true})
  }
  expect(stages.find(stage=>stage.step==='board-news').artifacts).toHaveLength(4)
  const final=await page.evaluate(()=>{const nodes=window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts;return{symbols:nodes.find(node=>node.containerSpec.widget==='watchlist').containerSpec.symbols,links:nodes.filter(node=>node.containerSpec.linkedWatchlistId||node.containerSpec.linkedSourceId).length,count:nodes.length,smart:nodes.find(node=>node.workbenchIndex===6)?.containerSpec?.type}})
  expect(final.symbols).toHaveLength(5);expect(final.links).toBe(3);expect(final.count).toBe(7);expect(final.smart).toBe('table');await page.screenshot({path:out+'/formal-stage-replay-'+rightPane+'.png'});await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},90000)
it('naturally scrolls added components, Arrange and stock controls before issuing settled pointer cues',async()=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1460,height:1000})
 const out='/tmp/home-board-natural-scroll-20261026';await mkdir(out,{recursive:true})
 try{
  await scrollMotionSetup(page)
  for(const step of ['mount-board','board-indices','board-watchlist','board-quote','board-news','board-announcements'])await succeeds(page,step)
  await page.emulateMedia({reducedMotion:'no-preference'})
  const stages={};for(const step of ['board-calendar','board-arrange'])stages[step]=await recordScrollMotion(page,step)
  await succeeds(page,'board-link')
  await page.evaluate(()=>{const c=document.querySelector('#guide-host [data-research-canvas]');c.scrollTop=c.scrollHeight})
  stages['board-add']=await recordScrollMotion(page,'board-add')
  stages['board-smart-container']=await recordScrollMotion(page,'board-smart-container')
  await writeFile(out+'/stages.json',JSON.stringify(stages,null,2));await page.screenshot({path:out+'/after-smart.png'})
  for(const[step,{reply,frames,cues}]of Object.entries(stages)){
   expect(reply,step).toMatchObject({ok:true});const values=frames.map(f=>f.top),range=Math.max(...values)-Math.min(...values),deltas=values.slice(1).map((v,i)=>Math.abs(v-values[i]));
   expect(range,step+' must actually travel').toBeGreaterThan(120);expect(new Set(values.map(Math.round)).size,step+' intermediate frames').toBeGreaterThan(8);expect(Math.max(...deltas),step+' must not jump').toBeLessThan(range*.4+4)
   for(const cue of cues){const prior=frames.filter(f=>f.time<=cue.time).slice(-3);expect(prior.length).toBe(3);expect(Math.max(...prior.map(f=>f.top))-Math.min(...prior.map(f=>f.top)),step+' pointer after scroll settles').toBeLessThan(1.1)}
  }
  const w=await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot());expect(w.artifacts.find(n=>n.containerSpec.widget==='watchlist').containerSpec.symbols).toHaveLength(5);expect(w.artifacts.filter(n=>n.containerSpec?.linkedSourceId||n.containerSpec?.linkedWatchlistId)).toHaveLength(3);expect(w.viewport.scale).toBe(1);await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},45000)
it.each(['paused','disposed','manual-wheel'])('protects the current scroll position when %s interrupts Arrange travel',async mode=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1460,height:1000})
 try{
  await scrollMotionSetup(page);for(const step of ['mount-board','board-indices','board-watchlist','board-quote','board-news','board-announcements','board-calendar'])await succeeds(page,step)
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.evaluate(()=>{const p=window.guideProbe,c=document.querySelector('#guide-host [data-research-canvas]');p.motionStart=c.scrollTop;p.motionFrames=[];p.motionRecording=true;const record=()=>{p.motionFrames.push(c.scrollTop);if(p.motionRecording)requestAnimationFrame(record)};record()})
  const pending=command(page,'board-arrange',{},15000)
  await expect.poll(()=>page.evaluate(()=>{const p=window.guideProbe,c=document.querySelector('#guide-host [data-research-canvas]');return c.scrollTop>5&&Math.abs(c.scrollTop-p.motionStart)>6}),{timeout:4000}).toBe(true)
  if(mode==='paused'){
   const held=await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('sherlock:home-guide-playback',{detail:{runId:'guide-browser-run',sessionId:'guide-browser-session',playing:false}}));return document.querySelector('#guide-host [data-research-canvas]').scrollTop});await page.waitForTimeout(180);expect(await page.locator('#guide-host [data-research-canvas]').evaluate(c=>c.scrollTop)).toBe(held);await page.evaluate(()=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-playback',{detail:{runId:'guide-browser-run',sessionId:'guide-browser-session',playing:true}})));expect(await pending).toMatchObject({ok:true});expect(await page.locator('#guide-host [data-research-canvas]').evaluate(c=>c.scrollTop)).toBe(0)
  }else{
   if(mode==='disposed')await succeeds(page,'dispose');else{const box=await page.locator('#guide-host [data-research-canvas]').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,90)}
   expect(await pending).toMatchObject({ok:false});await page.waitForTimeout(100);const stopped=await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().viewport.y);await page.waitForTimeout(200);expect(await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().viewport.y)).toBe(stopped);if(mode==='manual-wheel')expect(stopped).not.toBe(0)
  }
  if(mode!=='disposed')expect(await page.locator('#guide-host [data-research-canvas]').evaluate(c=>c.style.getPropertyValue('scroll-behavior'))).toBe('')
  await page.evaluate(()=>window.guideProbe.motionRecording=false);expect(errors).toEqual([])
 }finally{await page.close()}
},25000)
it.each([{width:1380,height:900},{width:1900,height:1090}])('keeps native reading sizes while adding and only fills rows after Arrange at $width × $height',async({width,height})=>{
 const{page,errors}=await fixture({nativeLayout:true,width,height,guideTop:34,guideBottom:10})
 const output='/tmp/home-board-normal-size-20261026/'+width+'x'+height;await mkdir(output,{recursive:true})
 try{
  await page.evaluate(()=>{const host=document.getElementById('guide-host');host.style.left='0px';host.style.right='384px';document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.addEventListener('sherlock:home-guide-cue',event=>{const d=event.detail;if(d.requestId)window.guideProbe.ackCue(d)})})
  const snapshot=()=>page.evaluate(()=>{const workspace=window.guideProbe.registry.for('guide-browser-session'),nodes=workspace.getSnapshot().artifacts;return{nodes:Object.fromEntries(nodes.map(node=>[node.containerSpec.widget||'calendar',{...node,left:node.x-node.width/2,right:node.x+node.width/2,top:node.y-node.height/2,bottom:node.y+node.height/2}])),selection:workspace.getSnapshot().selection,viewport:workspace.getSnapshot().viewport}})
  await succeeds(page,'mount-board');await succeeds(page,'board-indices')
  const normal=await page.evaluate(()=>{const p=window.guideProbe,actual=p.registry.for('guide-browser-session');return Object.fromEntries(['watchlist','quote','news','announcements','calendar'].map(kind=>{const reference=p.registry.for('native-normal-size-reference:'+kind);reference.setCanvasSize(actual.getSnapshot().canvasSize);reference.setWorkbenchWidth(actual.getSnapshot().canvasSize.availableWidth);const n=kind==='calendar'?reference.createCalendarTool():reference.createFinancialWidget(kind);return[kind,{width:n.width,height:n.height}]}))})
  for(const kind of ['watchlist','quote','news','announcements','calendar'])await succeeds(page,'board-'+kind)
  const adding=await snapshot(),{watchlist:watch,quote,indices,news,announcements,calendar}=adding.nodes
  await writeFile(output+'/adding-diagnostic.json',JSON.stringify({normal,adding},null,2))
  expect(watch.height).toBe(quote.height);expect(quote.height).toBeGreaterThanOrEqual(normal.quote.height);expect(watch.width).toBeLessThan(quote.width)
  for(const kind of ['watchlist','quote','news','announcements','calendar']){expect(Math.abs(adding.nodes[kind].width-normal[kind].width),kind+' native width').toBeLessThan(40);expect(adding.nodes[kind].height,kind+' normal height').toBeGreaterThanOrEqual(kind==='watchlist'?normal.quote.height:normal[kind].height)}
  expect(calendar.width).toBeLessThan(indices.width*.8);expect(news.width).toBeGreaterThanOrEqual(600)
  const overlap=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;const nodes=Object.values(adding.nodes);for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)expect(overlap(nodes[i],nodes[j]),nodes[i].title+' overlaps '+nodes[j].title).toBe(false)
  await page.screenshot({path:output+'/adding-native-size.png'})
  await succeeds(page,'board-arrange');const arranged=await snapshot();expect(arranged.nodes.quote.width/arranged.nodes.watchlist.width).toBeGreaterThan(1.4);expect(Math.abs(arranged.nodes.quote.right-arranged.nodes.indices.right)).toBeLessThan(1);expect(Math.abs(arranged.nodes.announcements.right-arranged.nodes.indices.right)).toBeLessThan(1);expect(arranged.nodes.quote.height).toBeGreaterThanOrEqual(600);expect(arranged.nodes.news.height).toBeGreaterThanOrEqual(340);expect(arranged.viewport.scale).toBe(1)
  await page.screenshot({path:output+'/arranged-normal-size.png'});await writeFile(output+'/stages.json',JSON.stringify({normal,adding,arranged},null,2));await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},30000)
it('rejects an insufficient single-column viewport without shrinking components or pretending to link',async()=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1080,height:640,guideTop:52,guideBottom:100})
 try{
  await page.evaluate(()=>{const host=document.getElementById('guide-host');host.style.left='0px';host.style.right='430px';document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.addEventListener('sherlock:home-guide-cue',event=>{const d=event.detail;if(d.requestId)window.guideProbe.ackCue(d)})})
  for(const step of ['mount-board','board-indices','board-watchlist','board-quote','board-news','board-announcements','board-calendar','board-arrange'])await succeeds(page,step)
  const before=await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getWorkbenchCells())
  expect(await command(page,'board-link')).toMatchObject({ok:false,message:'当前研究区高度不足以同时显示连接端点，请增大窗口后重试。'})
  const after=await page.evaluate(()=>{const w=window.guideProbe.registry.for('guide-browser-session');return{cells:w.getWorkbenchCells(),nodes:w.getSnapshot().artifacts,selection:w.getSnapshot().selection,viewport:w.getSnapshot().viewport}})
  expect(after.cells).toEqual(before);expect(after.nodes.every(node=>!node.containerSpec.linkedSourceId&&!node.containerSpec.linkedWatchlistId)).toBe(true);expect(after.nodes.find(node=>node.containerSpec.widget==='quote').height).toBeGreaterThanOrEqual(600);expect(after.selection.selectedNodeIds).toEqual([]);expect(after.viewport.scale).toBe(1);await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},30000)
it('uses one visible Arrange and the real pointer selection, connection pulses, sink and persistence without demo receipts',async()=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1900,height:1400,guideTop:34,guideBottom:10,reducedMotion:'no-preference'})
 try{
  await page.evaluate(()=>{
   const host=document.getElementById('guide-host');host.style.left='0px';host.style.right='384px'
   document.documentElement.dataset.homeGuidePointerRun='guide-browser-run'
   const abort=new AbortController(),pointer=window.guideProbe.createPointer({runId:'guide-browser-run',signal:abort.signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,Math.min(2,ms))),waitUntilPlaying:()=>Promise.resolve()})
   const p=window.guideProbe;p.gesture={arranges:0,cues:[],selects:[],eligible:0,drafts:0,targets:0,receipts:0,legacyLines:0}
   document.addEventListener('click',event=>{if(event.target.closest('[data-research-global-arrange]'))p.gesture.arranges++})
   const observer=new MutationObserver(()=>{const g=p.gesture;if(document.querySelector('[data-canvas-action-receipt]'))g.receipts++;if(document.querySelector('[data-home-guide-connection]'))g.legacyLines++});observer.observe(document.body,{subtree:true,childList:true})
   window.addEventListener('sherlock:home-guide-cue',event=>{const d=event.detail;if(!d.requestId)return;const find=token=>[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===token),target=find(d.targetToken),fromTarget=find(d.fromTargetToken);p.gesture.cues.push({label:d.label,action:d.action,selected:[...p.registry.for('guide-browser-session').getSnapshot().selection.selectedNodeIds]});
    void pointer.perform({target,fromTarget,action:d.action,onFrame:frame=>{window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-progress',{detail:{runId:d.runId,requestId:d.requestId,...frame}}));const available=document.querySelector('[data-drop-eligible]:not([data-drop-target])');if(available){p.gesture.eligible++;p.gesture.pulse=getComputedStyle(available,'::after').animationName}if(document.querySelector('.ew-financial-connection-draft'))p.gesture.drafts++;if(document.querySelector('[data-drop-target]'))p.gesture.targets++}}).then(()=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:d.runId,requestId:d.requestId,ok:true}})),error=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:d.runId,requestId:d.requestId,ok:false,message:error.message}})))
   })
   p.stopPointer=()=>{abort.abort();pointer.dispose();observer.disconnect()}
  })
  for(const step of ['mount-board','board-indices','board-watchlist','board-quote','board-arrange-foundation','board-news','board-announcements','board-calendar','board-arrange','board-link']){const reply=await command(page,step,{},30000);if(!reply.ok){await writeFile('/tmp/sherlock-research-demo-pointer-feedback-20261102/native-debug.json',JSON.stringify(await page.evaluate(()=>({gesture:window.guideProbe.gesture,html:document.getElementById('guide-host').outerHTML,selected:window.guideProbe.registry.for('guide-browser-session').getSnapshot().selection})),null,2));await page.screenshot({path:'/tmp/sherlock-research-demo-pointer-feedback-20261102/native-debug.png'})}expect(reply,step+': '+reply.message).toMatchObject({ok:true})}
  const result=await page.evaluate(()=>{const p=window.guideProbe,w=p.registry.for('guide-browser-session');return{...p.gesture,nodes:w.getSnapshot().artifacts,selection:w.getSnapshot().selection,saved:[...p.memory.entries()]}})
  expect(result.arranges).toBe(1);expect(result.eligible).toBeGreaterThan(1);expect(result.pulse).toContain('ew-financial-port-available');expect(result.drafts).toBeGreaterThan(1);expect(result.targets).toBeGreaterThan(0);expect(result.legacyLines).toBe(0);expect(result.receipts).toBe(0)
  const sourceClicks=result.cues.filter(cue=>cue.action==='click'&&/^选择(自选股|行情)组件$/.test(cue.label)),drags=result.cues.filter(cue=>cue.action==='drag');expect(sourceClicks).toHaveLength(2);expect(sourceClicks[0].selected).toEqual([]);expect(drags).toHaveLength(3)
  const id=kind=>result.nodes.find(node=>node.containerSpec.widget===kind).id;expect(drags.map(cue=>cue.selected)).toEqual([[id('watchlist')],[id('quote')],[id('quote')]])
  expect(result.nodes.find(node=>node.id===id('quote')).containerSpec.linkedWatchlistId).toBe(id('watchlist'));expect(result.nodes.find(node=>node.id===id('news')).containerSpec.linkedSourceId).toBe(id('quote'));expect(result.nodes.find(node=>node.id===id('announcements')).containerSpec.linkedSourceId).toBe(id('quote'));expect(result.selection.selectedNodeIds).toEqual([]);expect(JSON.stringify(result.saved)).toContain(id('quote'))
  await page.screenshot({path:'/tmp/sherlock-research-demo-pointer-feedback-20261102/native-demo-no-receipt.png'})
  // A normal user canvas action still exposes its undo receipt.
  await page.evaluate(async()=>{const w=window.guideProbe.registry.for('guide-browser-session'),node=w.getSnapshot().artifacts.find(node=>node.containerSpec.widget==='watchlist'),state=await w.canvasAction('inspect',{ids:[node.id]});await w.canvasAction('apply',{requestId:'real-user-after-guide',revision:state.revision,changes:[{op:'update',id:node.id,fields:{title:'用户更名'}}]})})
  await expect.poll(()=>page.locator('[data-canvas-action-receipt]').count()).toBe(1)
  await page.screenshot({path:'/tmp/sherlock-research-demo-pointer-feedback-20261102/native-user-undo.png'});await writeFile('/tmp/sherlock-research-demo-pointer-feedback-20261102/native-real-links.json',JSON.stringify(result,null,2));await page.evaluate(()=>window.guideProbe.stopPointer());await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},45000)
it('cancels a real in-flight native connection and clears its pulses, draft and pending write',async()=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1900,height:1400,guideTop:34,guideBottom:10,reducedMotion:'no-preference'})
 try{
  await page.evaluate(()=>{
   const p=window.guideProbe,host=document.getElementById('guide-host');host.style.left='0px';host.style.right='384px';document.documentElement.dataset.homeGuidePointerRun='guide-browser-run'
   p.connectionAbort=new AbortController();p.connectionPointer=p.createPointer({runId:'guide-browser-run',signal:p.connectionAbort.signal,wait:ms=>p.holdConnection??new Promise(resolve=>setTimeout(resolve,Math.min(ms,1))),waitUntilPlaying:()=>Promise.resolve()})
   window.addEventListener('sherlock:home-guide-cue',event=>{const d=event.detail;if(!d.requestId)return;if(d.action!=='drag'){void p.ackCue(d);return}const find=token=>[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===token);void p.connectionPointer.perform({target:find(d.targetToken),fromTarget:find(d.fromTargetToken),action:'drag',onFrame:frame=>{window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-progress',{detail:{runId:d.runId,requestId:d.requestId,...frame}}));if(frame.phase==='dragging'&&document.querySelector('[data-drop-eligible]')&&!p.holdConnection)p.holdConnection=new Promise(resolve=>{p.releaseConnection=resolve})}}).then(()=>p.ackCue({...d,action:'move'}),error=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:d.runId,requestId:d.requestId,ok:false,message:error.message}})))})
  })
  for(const step of ['mount-board','board-watchlist','board-quote','board-news','board-arrange'])await succeeds(page,step)
  const pending=command(page,'board-link',{},20000)
  await expect.poll(()=>page.locator('[data-drop-eligible]').count(),{timeout:10000}).toBeGreaterThan(0);expect(await page.locator('.ew-financial-connection-draft').count()).toBe(1)
  expect(await page.locator('[data-financial-link]').count()).toBe(0);await page.screenshot({path:'/tmp/sherlock-research-demo-pointer-feedback-20261102/native-inflight-pulse.png'})
  await succeeds(page,'dispose');expect(await pending).toMatchObject({ok:false})
  expect(await page.locator('[data-drop-eligible],[data-drop-target],.ew-financial-connection-draft').count()).toBe(0)
  expect(await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.some(node=>node.containerSpec.linkedWatchlistId||node.containerSpec.linkedSourceId))).toBe(false)
  await page.evaluate(()=>{const p=window.guideProbe;p.connectionAbort.abort();p.releaseConnection?.();p.connectionPointer.dispose()});expect(await page.locator('[data-home-guide-hover]').count()).toBe(0);await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},30000)
it('lets a real user selection interrupt the source-click cue without selecting or linking over it',async()=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1900,height:1400,guideTop:34,guideBottom:10})
 try{
  await page.evaluate(()=>{const p=window.guideProbe,host=document.getElementById('guide-host');host.style.left='0px';host.style.right='384px';document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.addEventListener('sherlock:home-guide-cue',event=>{const d=event.detail;if(!d.requestId)return;if(d.action==='click'&&d.label==='选择自选股组件'){p.heldSourceClick=d;return}void p.ackCue(d)})})
  for(const step of ['mount-board','board-watchlist','board-quote','board-news','board-arrange'])await succeeds(page,step)
  const pending=command(page,'board-link',{},20000)
  await expect.poll(()=>page.evaluate(()=>!!window.guideProbe.heldSourceClick)).toBe(true)
  const quote=page.locator('#guide-host [data-financial-widget="quote"]').locator('xpath=ancestor::*[@data-research-node-id][1]')
  await quote.locator('.ew-grid-header').click({position:{x:50,y:12}})
  const selected=await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().selection)
  expect(selected.selectedNodeIds).toHaveLength(1)
  await page.evaluate(()=>window.guideProbe.ackCue(window.guideProbe.heldSourceClick));expect(await pending).toMatchObject({ok:false})
  const result=await page.evaluate(()=>{const w=window.guideProbe.registry.for('guide-browser-session');return{selection:w.getSnapshot().selection,linked:w.getSnapshot().artifacts.some(node=>node.containerSpec.linkedWatchlistId||node.containerSpec.linkedSourceId)}})
  expect(result.selection).toEqual(selected);expect(result.linked).toBe(false);expect(await page.locator('.ew-financial-connection-draft,[data-drop-eligible],[data-home-guide-hover]').count()).toBe(0);await succeeds(page,'dispose');expect(await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().selection)).toEqual(selected);await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},30000)
it('selects only the outgoing component during each real port drag',async()=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1900,height:1400,guideTop:34,guideBottom:10})
 try{
  await page.evaluate(()=>{const host=document.getElementById('guide-host');host.style.left='0px';host.style.right='384px';document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.guideProbe.sourceSelections=[];window.addEventListener('sherlock:home-guide-cue',event=>{const d=event.detail;if(!d.requestId)return;const find=token=>[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===token);if(d.action==='drag')window.guideProbe.sourceSelections.push({source:find(d.fromTargetToken).dataset.financialPortNode,target:find(d.targetToken).dataset.financialPortNode,selected:[...window.guideProbe.registry.for('guide-browser-session').getSnapshot().selection.selectedNodeIds]});window.guideProbe.ackCue(d)})})
  for(const step of ['mount-board','board-indices','board-watchlist','board-quote','board-news','board-announcements','board-calendar','board-arrange','board-link'])await succeeds(page,step)
  const drags=await page.evaluate(()=>window.guideProbe.sourceSelections);expect(drags).toHaveLength(3);for(const drag of drags){expect(drag.selected).toEqual([drag.source]);expect(drag.selected).not.toContain(drag.target)}
  await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},30000)
it('clears owned component selections after each added widget and after Arrange and connections',async()=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1380,height:900,guideTop:34,guideBottom:10})
 try{
  await page.evaluate(()=>{const host=document.getElementById('guide-host');host.style.left='0px';host.style.right='384px';document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.addEventListener('sherlock:home-guide-cue',event=>{const d=event.detail;if(d.requestId)window.guideProbe.ackCue(d)})})
  for(const step of ['mount-board','board-indices','board-watchlist','board-quote','board-news','board-announcements','board-calendar','board-arrange','board-link']){await succeeds(page,step);expect(await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().selection.selectedNodeIds),step+' should leave no owned blue outline').toEqual([])}
  await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},30000)
it('preserves a later same-value user re-selection while adding and disposing the demo',async()=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1460,height:1000})
 try{
  await succeeds(page,'mount-board')
  await page.evaluate(()=>{const workspace=window.guideProbe.registry.for('guide-browser-session');const stop=workspace.subscribe(()=>{const node=workspace.getSnapshot().artifacts.find(node=>node.containerSpec.widget==='watchlist');if(!node||window.guideProbe.userPause)return;window.guideProbe.userPause=node.id;queueMicrotask(()=>{window.dispatchEvent(new CustomEvent('sherlock:home-guide-playback',{detail:{runId:'guide-browser-run',sessionId:'guide-browser-session',playing:false}}));stop()})})})
  const pending=command(page,'board-watchlist');await expect.poll(()=>page.evaluate(()=>window.guideProbe.userPause),{timeout:6000}).toBeTruthy()
  const before=await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().selection)
  await page.locator('[data-research-node-id] .ew-grid-header').click({position:{x:130,y:12}})
  const after=await page.evaluate(()=>{const p=window.guideProbe,w=p.registry.for('guide-browser-session');p.userSelection=w.getSnapshot().selection;return p.userSelection});expect(after).toEqual(before)
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-playback',{detail:{runId:'guide-browser-run',sessionId:'guide-browser-session',playing:true}})))
  expect(await pending).toMatchObject({ok:true});expect(await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().selection)).toEqual(after)
  await succeeds(page,'board-quote');expect(await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().selection)).toEqual(after)
  await succeeds(page,'dispose');expect(await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().selection)).toEqual(after);expect(errors).toEqual([])
 }finally{await page.close()}
},15000)
it.each(['complete','cancelled'])('retains the user component selection during %s connection and subsequent disposal',async mode=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1380,height:900,guideTop:34,guideBottom:10})
 try{
  await page.evaluate(()=>{const host=document.getElementById('guide-host');host.style.left='0px';host.style.right='384px';document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.addEventListener('sherlock:home-guide-cue',event=>{const d=event.detail;if(d.requestId)window.guideProbe.ackCue(d)})})
  for(const step of ['mount-board','board-indices','board-watchlist','board-quote','board-news','board-announcements','board-calendar','board-arrange'])await succeeds(page,step)
  await page.evaluate(()=>{const p=window.guideProbe,w=p.registry.for('guide-browser-session'),quote=w.getSnapshot().artifacts.find(node=>node.containerSpec.widget==='quote');w.updateSelection([quote.id],'replace');p.userSelection=w.getSnapshot().selection})
  if(mode==='cancelled')await page.evaluate(()=>window.addEventListener('sherlock:home-guide-cue',event=>{if(event.detail.action==='drag')window.dispatchEvent(new CustomEvent('sherlock:home-guide-native-request',{detail:{runId:'guide-browser-run',requestId:'cancel-selection-lease',sessionId:'guide-browser-session',hostId:'guide-host',command:'dispose'}}))}))
  expect(await command(page,'board-link')).toMatchObject({ok:mode==='complete'});expect(await page.evaluate(()=>{const p=window.guideProbe;return JSON.stringify(p.registry.for('guide-browser-session').getSnapshot().selection)===JSON.stringify(p.userSelection)})).toBe(true)
  await succeeds(page,'dispose');expect(await page.evaluate(()=>{const p=window.guideProbe;return JSON.stringify(p.registry.for('guide-browser-session').getSnapshot().selection)===JSON.stringify(p.userSelection)})).toBe(true);expect(errors).toEqual([])
 }finally{await page.close()}
},30000)
it('smoothly frames normal-size rows or their visible endpoints without shrinking text or layout',async()=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1460,height:1000,reducedMotion:'no-preference'})
 try{
  await page.addStyleTag({content:await readFile('src/preload/home-guides.css','utf8')})
  await page.evaluate(()=>{window.guideProbe.view.update({view:'research'});document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.guideProbe.linkFrames=[];window.addEventListener('sherlock:home-guide-cue',event=>{const d=event.detail;if(!d.requestId)return;const cards=[...document.querySelectorAll('#guide-host [data-financial-widget]')].filter(node=>['watchlist','quote','news','announcements'].includes(node.dataset.financialWidget)).map(node=>{const card=node.closest('[data-research-node-id]'),r=card.getBoundingClientRect();return {widget:node.dataset.financialWidget,top:r.top,bottom:r.bottom,left:r.left,right:r.right,font:getComputedStyle(node).fontSize}}),canvas=document.querySelector('#guide-host [data-research-canvas]'),r=canvas.getBoundingClientRect();if(d.action==='drag')window.guideProbe.linkFrames.push({cards,ports:[d.fromTargetToken,d.targetToken].map(token=>[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===token).getBoundingClientRect().toJSON()),canvas:{top:r.top,bottom:r.bottom,left:r.left,right:r.right},scrolls:[...window.guideProbe.smoothScrolls]});window.guideProbe.ackCue(d)})})
  for(const step of ['mount-board','board-indices','board-watchlist','board-quote','board-news','board-announcements','board-calendar','board-arrange'])await succeeds(page,step)
  const before=await page.evaluate(()=>{const w=window.guideProbe.registry.for('guide-browser-session'),canvas=document.querySelector('#guide-host [data-research-canvas]');canvas.scrollTop=canvas.scrollHeight;const start=canvas.scrollTop;window.guideProbe.smoothScrolls=[];const record=()=>{window.guideProbe.smoothScrolls.push(canvas.scrollTop);if(!window.guideProbe.scrollPaused&&Math.abs(canvas.scrollTop-start)>4){window.guideProbe.scrollPaused=true;const held=canvas.scrollTop;window.dispatchEvent(new CustomEvent('sherlock:home-guide-playback',{detail:{runId:'guide-browser-run',sessionId:'guide-browser-session',playing:false}}));setTimeout(()=>{window.guideProbe.pauseProof={held,after:canvas.scrollTop};window.dispatchEvent(new CustomEvent('sherlock:home-guide-playback',{detail:{runId:'guide-browser-run',sessionId:'guide-browser-session',playing:true}}))},100)}if(!window.guideProbe.scrollDone)requestAnimationFrame(record)};requestAnimationFrame(record);return w.getWorkbenchCells()})
  await succeeds(page,'board-link');await page.evaluate(()=>window.guideProbe.scrollDone=true)
  const result=await page.evaluate(()=>({frames:window.guideProbe.linkFrames,cells:window.guideProbe.registry.for('guide-browser-session').getWorkbenchCells(),pause:window.guideProbe.pauseProof}))
  expect(result.frames).toHaveLength(3)
  const first=result.frames[0];expect(first.cards).toHaveLength(4)
  for(const frame of result.frames){for(const port of frame.ports){expect(port.top).toBeGreaterThanOrEqual(frame.canvas.top-1);expect(port.bottom).toBeLessThanOrEqual(frame.canvas.bottom-12)}for(const card of frame.cards){expect(card.left).toBeGreaterThanOrEqual(frame.canvas.left-1);expect(card.right).toBeLessThanOrEqual(frame.canvas.right+1);expect(parseFloat(card.font)).toBeGreaterThanOrEqual(11)}}
  expect(new Set(first.scrolls.map(value=>Math.round(value))).size).toBeGreaterThan(5);expect(result.pause.after).toBe(result.pause.held);expect(result.cells).toEqual(before);expect(await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.filter(node=>node.containerSpec.linkedSourceId||node.containerSpec.linkedWatchlistId).length)).toBe(3)
  await mkdir('/tmp/home-board-normal-size-20261026',{recursive:true});await page.screenshot({path:'/tmp/home-board-normal-size-20261026/linked-rows.png'});await writeFile('/tmp/home-board-normal-size-20261026/row-framing.json',JSON.stringify(result,null,2));await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},40000)
it.each([{width:1255,height:818,deviceScaleFactor:1.1,right:348},{width:1380,height:900,deviceScaleFactor:1,right:384},{width:1900,height:1400,deviceScaleFactor:1,right:384}])('frames full normal-size cards when they fit and preserves source-only visible port drags at $width × $height',async({width,height,deviceScaleFactor,right})=>{
 const{page,errors}=await fixture({nativeLayout:true,width,height,deviceScaleFactor,guideTop:34,guideBottom:10,reducedMotion:'no-preference'})
 const output='/tmp/home-board-normal-size-20261026/framing/'+width+'x'+height;await mkdir(output,{recursive:true})
 try{
  await page.addStyleTag({content:await readFile('src/preload/home-guides.css','utf8')})
  await page.evaluate(right=>{
   const host=document.getElementById('guide-host');host.style.left='0px';host.style.right=right+'px';document.body.dataset.dsDarkTheme='';window.guideProbe.view.update({view:'research'});document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.guideProbe.formalFrames=[]
   window.guideProbe.formalPointer=window.guideProbe.createPointer({runId:'guide-browser-run',signal:new AbortController().signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>Promise.resolve()})
   window.addEventListener('sherlock:home-guide-cue',event=>{const d=event.detail;if(!d.requestId)return;const find=token=>[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===token),reply=(ok,message)=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:d.runId,requestId:d.requestId,ok,message}}));void window.guideProbe.formalPointer.perform({target:find(d.targetToken),fromTarget:find(d.fromTargetToken),action:d.action,onFrame:frame=>{window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-progress',{detail:{runId:d.runId,requestId:d.requestId,...frame}}));if(d.action!=='drag'||!['pressed','dragging','released'].includes(frame.phase))return;const canvas=host.querySelector('[data-research-canvas]'),box=canvas.getBoundingClientRect();window.guideProbe.formalFrames.push({phase:frame.phase,selected:[...window.guideProbe.registry.for('guide-browser-session').getSnapshot().selection.selectedNodeIds],source:find(d.fromTargetToken).dataset.financialPortNode,target:find(d.targetToken).dataset.financialPortNode,ports:[find(d.fromTargetToken),find(d.targetToken)].map(port=>port.getBoundingClientRect().toJSON()),draftPath:document.querySelector('.ew-financial-connection-draft')?.getAttribute('d'),nativeLinks:host.querySelectorAll('[data-financial-link]').length,point:{x:frame.x,y:frame.y},canvas:{top:box.top,bottom:Math.min(innerHeight,box.bottom),left:box.left,right:box.right},cards:[...host.querySelectorAll('[data-financial-widget]')].filter(node=>['watchlist','quote','news','announcements'].includes(node.dataset.financialWidget)).map(node=>{const card=node.closest('[data-research-node-id]'),r=card.getBoundingClientRect();return{id:card.dataset.researchNodeId,widget:node.dataset.financialWidget,top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height,font:getComputedStyle(node).fontSize,chartHeight:node.querySelector('[data-financial-chart]')?.getBoundingClientRect().height??null}})})}}).then(()=>reply(true),error=>reply(false,error.message))})
  },right)
  for(const step of ['mount-board','board-indices','board-watchlist','board-quote','board-news','board-announcements','board-calendar','board-arrange'])await succeeds(page,step)
  const before=await page.evaluate(()=>{const w=window.guideProbe.registry.for('guide-browser-session'),canvas=document.querySelector('#guide-host [data-research-canvas]');canvas.scrollTop=canvas.scrollHeight;return{cells:w.getWorkbenchCells(),host:document.getElementById('guide-host').getBoundingClientRect().toJSON(),canvas:{clientWidth:canvas.clientWidth,clientHeight:canvas.clientHeight,bounds:canvas.getBoundingClientRect().toJSON(),scrollPaddingBottom:getComputedStyle(canvas).scrollPaddingBottom},viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}}})
  expect(before.canvas.clientWidth).toBeGreaterThan(width===1900?1400:width===1255?790:880);expect(before.canvas.clientWidth).toBeLessThan(width===1900?1460:width===1255?850:930);expect(Math.abs(before.canvas.clientHeight-before.host.height),'native guide uses its actual host height without a second header reservation').toBeLessThan(2);expect(before.canvas.scrollPaddingBottom).toBe('80px')
  await succeeds(page,'board-link')
  const result=await page.evaluate(()=>({frames:window.guideProbe.formalFrames,cells:window.guideProbe.registry.for('guide-browser-session').getWorkbenchCells()}))
  await expect.poll(()=>page.locator('#guide-host [data-financial-widget="quote"] [data-financial-chart]').count()).toBe(1)
  const finalGeometry=await page.evaluate(()=>{const host=document.getElementById('guide-host'),canvas=host.querySelector('[data-research-canvas]'),toolbar=document.querySelector('[data-ework-toolbar][data-ework-toolbar-owner="guide-browser-session"]'),quote=host.querySelector('[data-financial-widget="quote"]'),chart=quote.querySelector('[data-financial-chart]'),card=quote.closest('[data-research-node-id]');return{canvas:canvas.getBoundingClientRect().toJSON(),toolbar:toolbar.getBoundingClientRect().toJSON(),quote:card.getBoundingClientRect().toJSON(),chart:chart.getBoundingClientRect().toJSON(),footers:[...host.querySelectorAll('[data-financial-widget]')].filter(node=>['watchlist','quote','news','announcements'].includes(node.dataset.financialWidget)).map(node=>node.querySelector('.ew-financial-footer').getBoundingClientRect().toJSON())}})
  await page.screenshot({path:output+'/four-cards-linked.png'});await writeFile(output+'/framing.json',JSON.stringify({before,...result,finalGeometry},null,2))
  expect(finalGeometry.chart.height).toBeGreaterThan(80);expect(finalGeometry.chart.top).toBeGreaterThan(finalGeometry.quote.top);expect(finalGeometry.chart.bottom).toBeLessThan(finalGeometry.quote.bottom);
  expect(result.frames.length).toBeGreaterThan(20);expect(result.frames.some(frame=>frame.phase==='dragging')).toBe(true);expect(new Set(result.frames.filter(frame=>frame.phase==='dragging').map(frame=>frame.draftPath).filter(Boolean)).size).toBeGreaterThan(5)
  for(const frame of result.frames){expect(frame.cards).toHaveLength(4);expect(frame.selected).toEqual([frame.source]);expect(frame.selected).not.toContain(frame.target);const available=frame.canvas.bottom-frame.canvas.top-24,span=Math.max(...frame.cards.map(card=>card.bottom))-Math.min(...frame.cards.map(card=>card.top));for(const port of frame.ports){expect(port.top).toBeGreaterThanOrEqual(frame.canvas.top-1);expect(port.bottom).toBeLessThanOrEqual(frame.canvas.bottom-12)}for(const card of frame.cards){if(span<=available){expect(card.top,card.widget+' complete header when four normal cards fit').toBeGreaterThanOrEqual(frame.canvas.top-1);expect(card.bottom).toBeLessThanOrEqual(frame.canvas.bottom-12)}expect(card.left).toBeGreaterThanOrEqual(frame.canvas.left-1);expect(card.right).toBeLessThanOrEqual(frame.canvas.right+1);expect(parseFloat(card.font)).toBeGreaterThanOrEqual(11);expect(card.height).toBeGreaterThanOrEqual(['watchlist','quote'].includes(card.widget)?600:340);if(card.widget==='quote'&&card.chartHeight!==null)expect(card.chartHeight).toBeGreaterThan(80)}}
  for(const frame of result.frames.filter(frame=>frame.phase==='dragging')){
   const source=frame.cards.find(card=>card.id===frame.source)
   const visible=Math.max(0,Math.min(source.bottom,frame.canvas.bottom-12)-Math.max(source.top,frame.canvas.top+12))
   expect(visible,'connection keeps a readable source body above its footer').toBeGreaterThan(Math.min(source.height*.35,240))
  }
  expect(result.cells).toEqual(before.cells);expect(await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.filter(node=>node.containerSpec.linkedSourceId||node.containerSpec.linkedWatchlistId).length)).toBe(3);await preserved(page);expect(errors).toEqual([])
 }finally{await page.evaluate(()=>window.guideProbe.formalPointer?.dispose()).catch(()=>{});await page.close()}
},45000)
it.each(['user-layout','disposed'])('does not link or replace the current layout when %s interrupts the initial smooth scroll',async mode=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1460,height:1000,reducedMotion:'no-preference'})
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.addEventListener('sherlock:home-guide-cue',event=>{const d=event.detail;if(d.requestId)window.guideProbe.ackCue(d)})})
  for(const step of ['mount-board','board-indices','board-watchlist','board-quote','board-news','board-announcements','board-calendar','board-arrange'])await succeeds(page,step)
  const before=await page.evaluate(mode=>{const w=window.guideProbe.registry.for('guide-browser-session'),canvas=document.querySelector('#guide-host [data-research-canvas]');canvas.scrollTop=canvas.scrollHeight;const start=canvas.scrollTop,record=()=>{if(window.guideProbe.interrupted)return;if(Math.abs(canvas.scrollTop-start)>4){window.guideProbe.interrupted=true;if(mode==='disposed')window.dispatchEvent(new CustomEvent('sherlock:home-guide-native-request',{detail:{runId:'guide-browser-run',requestId:'dispose-during-scroll',sessionId:'guide-browser-session',hostId:'guide-host',command:'dispose'}}));else{const calendar=w.getSnapshot().artifacts.find(node=>node.containerSpec.type==='calendar-tool');w.applyWorkbenchCells(w.getWorkbenchCells().map(cell=>cell.id===calendar.id?{...cell,h:cell.h+3}:cell),true);window.guideProbe.userCells=w.getWorkbenchCells()}return}requestAnimationFrame(record)};requestAnimationFrame(record);return w.getWorkbenchCells()},mode)
  expect(await command(page,'board-link')).toMatchObject({ok:false})
  const state=await page.evaluate(()=>{const w=window.guideProbe.registry.for('guide-browser-session');return{interrupted:window.guideProbe.interrupted,cells:w.getWorkbenchCells(),user:window.guideProbe.userCells,nodes:w.getSnapshot().artifacts}})
  expect(state.interrupted).toBe(true);expect(state.cells).toEqual(mode==='user-layout'?state.user:before);expect(state.nodes.every(node=>!node.containerSpec.linkedSourceId&&!node.containerSpec.linkedWatchlistId)).toBe(true);expect(errors).toEqual([])
 }finally{await page.close()}
},25000)
it.each([{width:1460,height:1000},{width:580,height:1000},{width:1080,height:640,clipped:true},{width:1080,height:640,clipped:true,stacked:true}])('builds six live native components in readable rows at $width × $height (real pointer=$clipped, stacked=$stacked)',async({width,height,clipped,stacked})=>{
 const{page,errors,external}=await fixture({nativeLayout:true,width,height,guideTop:clipped?52:70,guideBottom:clipped?100:70,reducedMotion:stacked?'no-preference':'reduce'})
 try{
  if(clipped){await page.addStyleTag({content:await readFile('src/preload/home-guides.css','utf8')});await page.evaluate(stacked=>{const host=document.getElementById('guide-host');host.style.left='0px';host.style.right=stacked?'430px':'366px';window.guideProbe.realPointer=window.guideProbe.createPointer({runId:'guide-browser-run',signal:new AbortController().signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>Promise.resolve()})},stacked)}
  await page.evaluate(()=>{window.guideProbe.view.update({view:'research'});document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.addEventListener('sherlock:home-guide-cue',event=>{const d=JSON.parse(JSON.stringify(event.detail));(window.guideProbe.sixCues??=[]).push({label:d.label,action:d.action});if(!d.requestId)return;const reply=(ok,message)=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:d.runId,requestId:d.requestId,ok,message}}));if(!window.guideProbe.realPointer){void window.guideProbe.ackCue(d);return}const find=token=>[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===token);void window.guideProbe.realPointer.perform({target:find(d.targetToken),fromTarget:find(d.fromTargetToken),action:d.action,onFrame:frame=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-progress',{detail:{runId:d.runId,requestId:d.requestId,...frame}}))}).then(()=>reply(true),e=>reply(false,e.message))})})
  for(const step of ['mount-board','board-library','board-indices','board-watchlist','board-quote','board-news','board-announcements','board-calendar','board-arrange','board-link','board-add']){if(step==='board-link'){const geometry=await connectionRoom(page);if(!geometry.fits){const before=await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getWorkbenchCells());expect(await command(page,step)).toMatchObject({ok:false,message:'当前研究区高度不足以同时显示连接端点，请增大窗口后重试。'});const w=await page.evaluate(()=>{const workspace=window.guideProbe.registry.for('guide-browser-session');return{...workspace.getSnapshot(),cells:workspace.getWorkbenchCells()}});expect(w.artifacts).toHaveLength(6);expect(w.cells).toEqual(before);expect(w.artifacts.find(node=>node.containerSpec.widget==='quote').height).toBeGreaterThanOrEqual(600);expect(w.viewport.scale).toBe(1);await preserved(page);expect(errors).toEqual([]);return}}const beforeLink=step==='board-link'?await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.map(({id,x,y,width,height})=>({id,x,y,width,height}))):null;const result=await command(page,step,{},40000);expect(result,JSON.stringify({step,result,pageerrors:errors,debug:await page.evaluate(()=>({cues:window.guideProbe.sixCues,nodes:window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.map(n=>({widget:n.containerSpec.widget,links:n.containerSpec.linkedSourceId||n.containerSpec.linkedWatchlistId}))}))})).toMatchObject({ok:true});if(beforeLink)expect(await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.map(({id,x,y,width,height})=>({id,x,y,width,height})))).toEqual(beforeLink)}
  await expect.poll(()=>page.evaluate(()=>window.guideProbe.financialRequests?.some(r=>r.action==='announcements'&&r.symbols?.[0]?.code==='000858'))).toBe(true)
  const state=await page.evaluate(()=>{const p=window.guideProbe;return{nodes:p.registry.for('guide-browser-session').getSnapshot().artifacts,requests:p.financialRequests,calendar:p.calendarRequests,disk:JSON.parse(p.memory.get('sherlock.research.canvas.artifacts.v1:guide-browser-session'))}})
  expect(state.nodes).toHaveLength(6)
  if(clipped){const box=await page.locator('#guide-host [data-research-canvas]').boundingBox();expect(box.width).toBe(stacked?560:624);expect(box.height).toBe(424);expect((await page.locator('#guide-host').boundingBox()).height).toBe(468)}
  const node=kind=>state.nodes.find(n=>kind==='calendar'?n.containerSpec.type==='calendar-tool':n.containerSpec.widget===kind),watch=node('watchlist'),quote=node('quote'),indices=node('indices'),news=node('news'),announcements=node('announcements'),calendar=node('calendar')
  expect(watch.containerSpec.symbols.map(s=>s.market+':'+s.code)).toEqual(['US:AAPL','SH:600900','SH:601138','SZ:000858','SZ:000425'])
  expect(watch.containerSpec.symbols[0].name).toBe('苹果');expect(indices.containerSpec.symbols.map(s=>s.code)).toEqual(['000300','000001','399001','399006','000688','000016','^GSPC','^IXIC','^NDX','^RUT'])
  expect(watch.containerSpec.selectedSymbol).toBe('SZ:000858');expect(quote.containerSpec.symbols[0].code).toBe('000858')
  expect(quote.containerSpec.linkedWatchlistId).toBe(watch.id);expect(news.containerSpec.linkedSourceId).toBe(quote.id);expect(announcements.containerSpec.linkedSourceId).toBe(quote.id)
  if(width>1000&&!stacked)expect(indices.width).toBeGreaterThan(watch.width*1.9);expect(calendar.width).toBe(indices.width)
  if(width>1000&&!stacked){expect(watch.y).toBe(quote.y);expect(news.y).toBe(announcements.y);expect(watch.x).toBeLessThan(quote.x);expect(news.x).toBeLessThan(announcements.x)}else{expect(watch.width).toBe(indices.width);expect(watch.y).toBeLessThan(quote.y);expect(news.y).toBeLessThan(announcements.y);expect(indices.height).toBeGreaterThanOrEqual(410)}
  expect(indices.y).toBeLessThan(watch.y);expect(watch.y).toBeLessThan(news.y);expect(news.y).toBeLessThan(calendar.y)
  expect(watch.height).toBeGreaterThanOrEqual(clipped||width<1000?460:360);expect(quote.height).toBeGreaterThanOrEqual(clipped||width<1000?460:360);expect(calendar.height).toBeGreaterThanOrEqual(410)
  expect(state.requests.some(r=>r.action==='quotes'&&r.asset==='index')).toBe(true);expect(state.requests.some(r=>r.action==='announcements'&&r.symbols?.[0]?.code==='000858')).toBe(true)
  expect(state.calendar.some(r=>r.action==='list')).toBe(true);expect(state.calendar.some(r=>r.action==='save')).toBe(false)
  expect(state.nodes.filter(n=>n.containerSpec.type==='financial-widget').every(n=>n.containerSpec.refreshEnabled!==false)).toBe(true)
  expect(state.disk.map(n=>n.id).sort()).toEqual(state.nodes.map(n=>n.id).sort());expect(await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.filter(node=>node.containerSpec.linkedSourceId||node.containerSpec.linkedWatchlistId).length)).toBe(3)
  expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0)
  expect(await page.locator('.ew-indices-grid').evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true)
  await preserved(page);expect(errors).toEqual([]);expect(external).toEqual([])
 }finally{await page.evaluate(()=>window.guideProbe.realPointer?.dispose()).catch(()=>{});await page.close()}
},60000)
it('creates a real native smart draft beside the calendar through the existing canvas tools',async()=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1460,height:1000})
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.guideProbe.smartToolCues=[];window.guideProbe.selectToolClicks=0;document.addEventListener('click',event=>{if(event.target.closest?.('[data-research-global-select]'))window.guideProbe.selectToolClicks++},true);window.addEventListener('sherlock:home-guide-cue',event=>{const d=JSON.parse(JSON.stringify(event.detail));if(!d.requestId)return;const target=[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===d.targetToken);window.guideProbe.smartToolCues.push({container:target?.hasAttribute('data-research-global-container'),select:target?.hasAttribute('data-research-global-select'),input:target?.hasAttribute('data-research-container-prompt')});window.guideProbe.ackCue(d)})})
  for(const step of ['mount-board','board-indices','board-watchlist','board-quote','board-news','board-announcements','board-calendar','board-arrange','board-link','board-add'])await succeeds(page,step)
  await page.locator('[data-ework-toolbar][data-ework-toolbar-owner="guide-browser-session"] [data-research-global-container]').click()
  expect(await page.evaluate(()=>{const canvas=document.querySelector('#guide-host [data-research-canvas]'),old=window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts[0];return{unknown:canvas.__eworkCompleteContainerDraft('foreign-node'),existing:canvas.__eworkCompleteContainerDraft(old.id),tool:canvas.dataset.canvasTool}})).toEqual({unknown:false,existing:false,tool:'component'})
  await succeeds(page,'board-smart-container')
  const state=await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts)
  expect(state).toHaveLength(7)
  const smart=state.find(node=>node.title==='智能容器'),calendar=state.find(node=>node.containerSpec.type==='calendar-tool')
  expect(smart.generationStatus).toBe('draft');expect(smart.containerSpec).toBeUndefined();expect(smart.containerPrompt).toBe('')
  expect(smart.y).toBe(calendar.y);expect(calendar.x).toBeLessThan(smart.x);expect(smart.width).toBe(calendar.width)
  expect(await page.locator('#guide-host [data-research-container-prompt]').count()).toBe(1)
  expect(await page.locator('#guide-host [data-research-canvas]').getAttribute('data-canvas-tool')).toBe('select')
  expect(await page.evaluate(()=>window.guideProbe.smartToolCues.some(cue=>cue.container))).toBe(true);expect(await page.evaluate(()=>window.guideProbe.smartToolCues.some(cue=>cue.select))).toBe(false)
  expect(await page.evaluate(()=>window.guideProbe.selectToolClicks)).toBe(0)
  await page.evaluate(()=>{window.guideProbe.smartFocusModes=[];document.addEventListener('input',event=>{if(event.target.matches?.('[data-research-container-prompt]'))window.guideProbe.smartFocusModes.push({tool:event.target.closest('[data-research-canvas]').dataset.canvasTool,focused:document.activeElement===event.target})},true)})
  await succeeds(page,'board-smart-generate')
  expect(await page.evaluate(()=>window.guideProbe.smartToolCues.some(cue=>cue.input))).toBe(true)
  expect(await page.evaluate(()=>window.guideProbe.smartFocusModes.length)).toBeGreaterThan(1)
  expect(await page.evaluate(()=>window.guideProbe.smartFocusModes.every(state=>state.tool==='select'&&state.focused))).toBe(true)
  expect(await page.evaluate(()=>window.guideProbe.selectToolClicks)).toBe(0)
  expect(await page.locator('#guide-host [data-research-canvas]').getAttribute('data-canvas-tool')).toBe('select')
  await page.evaluate(()=>{const canvas=document.querySelector('#guide-host [data-research-canvas]');window.guideProbe.completedDraftCanvas=canvas;window.guideProbe.completedDraftFinish=canvas.__eworkCompleteContainerDraft})
  await preserved(page);expect(errors).toEqual([])
  await succeeds(page,'dispose')
  expect(await page.evaluate(()=>({installed:typeof window.guideProbe.completedDraftCanvas.__eworkCompleteContainerDraft,late:window.guideProbe.completedDraftFinish('foreign-node')}))).toEqual({installed:'undefined',late:false})
 }finally{await page.close()}
},30000)

it.each([{width:1460,height:1000},{width:1080,height:900,compact:true}])('generates the native five-stock research table from its real smart input at $width × $height',async({width,height,compact})=>{
 const{page,errors,smartRequests}=await fixture({nativeLayout:true,width,height,guideTop:compact?52:70,guideBottom:compact?100:70,reducedMotion:compact?'no-preference':'reduce'})
 try{
  await page.evaluate(compact=>{if(compact){const host=document.getElementById('guide-host');host.style.left='0px';host.style.right='366px'}document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.guideProbe.smartInputs=[];document.addEventListener('input',event=>{if(event.target.matches?.('[data-research-container-prompt]'))window.guideProbe.smartInputs.push(event.target.value)},true);window.addEventListener('sherlock:home-guide-cue',event=>{const d=JSON.parse(JSON.stringify(event.detail));if(!d.requestId)return;const reply=(ok,message)=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:d.runId,requestId:d.requestId,ok,message}}));if(!window.guideProbe.smartPointer){void window.guideProbe.ackCue(d);return}const find=token=>[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===token);void window.guideProbe.smartPointer.perform({target:find(d.targetToken),fromTarget:find(d.fromTargetToken),action:d.action,onFrame:frame=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-progress',{detail:{runId:d.runId,requestId:d.requestId,...frame}}))}).then(()=>reply(true),error=>reply(false,error.message))})},compact)
  for(const step of ['mount-board','board-indices','board-watchlist','board-quote','board-news','board-announcements','board-calendar','board-arrange','board-link','board-add'])await succeeds(page,step)
  await page.evaluate(()=>{window.guideProbe.smartPointer=window.guideProbe.createPointer({runId:'guide-browser-run',signal:new AbortController().signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>Promise.resolve()})})
  for(const step of ['board-smart-container','board-smart-generate'])await succeeds(page,step)
  const state=await page.evaluate(()=>{const p=window.guideProbe;return{nodes:p.registry.for('guide-browser-session').getSnapshot().artifacts,disk:JSON.parse(p.memory.get('sherlock.research.canvas.artifacts.v1:guide-browser-session')),inputs:p.smartInputs}})
  expect(state.nodes).toHaveLength(7)
  const smart=state.nodes.find(node=>node.containerSpec?.type==='table'),calendar=state.nodes.find(node=>node.containerSpec?.type==='calendar-tool')
  expect(smart).toMatchObject({generationStatus:'completed',generationTaskId:'guide-smart-result',containerPrompt:'为这5只自选股创建研究观察清单，列出关注因素、跟踪指标和风险信号。'})
  expect(smart.containerSpec.title).toBe('自选股研究观察清单');expect(smart.containerSpec.rows).toHaveLength(5)
  expect(smart.containerSpec.rows.map(row=>row[0])).toEqual(['苹果（AAPL）','长江电力（600900）','工业富联（601138）','五粮液（000858）','徐工机械（000425）'])
  expect(smartRequests).toEqual([{sessionId:'guide-browser-session',runId:'guide-browser-run',canvasNodeId:smart.id,prompt:HOME_BOARD_SMART_PROMPT}])
  expect(state.inputs.length).toBeGreaterThan(1);expect(state.inputs.at(-1)).toBe(HOME_BOARD_SMART_PROMPT)
  if(compact){expect(calendar.width).toBe(smart.width);expect(calendar.y).toBeLessThan(smart.y);expect(smart.width).toBeGreaterThan(580)}else{expect(calendar.y).toBe(smart.y);expect(calendar.x).toBeLessThan(smart.x)}
  expect(state.disk.find(node=>node.id===smart.id)?.containerSpec?.rows).toHaveLength(5)
  expect(await page.locator('#guide-host [data-research-node-id="'+smart.id+'"] table tbody tr').count()).toBe(5)
  if(!compact){await succeeds(page,'dispose');await succeeds(page,'mount-board');await succeeds(page,'board-indices');expect(await page.evaluate(id=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.find(node=>node.id===id).containerSpec,smart.id)).toEqual(smart.containerSpec)}
  await preserved(page);expect(errors).toEqual([])
 }finally{await page.evaluate(()=>window.guideProbe.smartPointer?.dispose()).catch(()=>{});await page.close()}
},45000)

it.each(['no-preference','reduce'])('uses native running grid motion and pause/resume for the smart demo with %s',async reducedMotion=>{
 const{page,errors,smartRequests,releaseSmart}=await fixture({nativeLayout:true,reducedMotion,smartMode:'deferred'})
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.addEventListener('sherlock:home-guide-cue',event=>{const d=event.detail;if(d.requestId)window.guideProbe.ackCue(d)})})
  for(const step of ['mount-board','board-calendar','board-smart-container'])await succeeds(page,step)
  const pending=command(page,'board-smart-generate',{},30000);pending.catch(()=>{})
  await expect.poll(()=>smartRequests.length,{timeout:10000}).toBe(1)
  const sample=()=>page.evaluate(()=>{const w=window.guideProbe.registry.for('guide-browser-session'),node=w.getSnapshot().artifacts.find(n=>n.workbenchIndex===6),grid=document.querySelector('#guide-host [data-research-generation-grid]');return{status:node?.generationStatus,phase:grid?.dataset.gridPhase,moving:grid?.dataset.gridMoving}})
  expect((await sample()).status).toBe('running')
  await expect.poll(async()=>String((await sample()).moving)).toBe(reducedMotion==='reduce'?'false':'true')
  const before=await sample();await page.waitForTimeout(180);const during=await sample()
  await page.screenshot({path:evidence+'/board-smart-running-'+reducedMotion+'.png'})
  if(reducedMotion==='reduce')expect(during.phase).toBe(before.phase);else expect(during.phase).not.toBe(before.phase)
  const playback=playing=>page.evaluate(playing=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-playback',{detail:{runId:'guide-browser-run',sessionId:'guide-browser-session',playing}})),playing)
  await playback(false);await expect.poll(async()=>(await sample()).moving).toBe('false')
  const paused=await sample();expect(paused.status).toBe('queued');await page.waitForTimeout(180);expect((await sample()).phase).toBe(paused.phase)
  await playback(true);await expect.poll(async()=>(await sample()).status).toBe('running')
  const resumed=await sample();await page.waitForTimeout(180)
  const afterResume=await sample()
  if(reducedMotion==='reduce')expect(afterResume.phase).toBe(resumed.phase);else expect(afterResume.phase).not.toBe(resumed.phase)
  await writeFile(evidence+'/board-smart-motion-'+reducedMotion+'.json',JSON.stringify({before,during,paused,resumed,afterResume},null,2))
  releaseSmart();expect(await pending).toMatchObject({ok:true});expect(errors).toEqual([])
 }finally{releaseSmart();await page.close()}
},25000)
it('arranges the first three components natively and paints new feeds directly in their third row',async()=>{
 const{page,errors}=await fixture({nativeLayout:true,reducedMotion:'no-preference'})
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.guideProbe.foundationCues=[];window.addEventListener('sherlock:home-guide-cue',event=>{const d=event.detail;if(d.requestId){window.guideProbe.foundationCues.push(d.label);window.guideProbe.ackCue(d)}})})
  for(const step of ['mount-board','board-indices','board-watchlist','board-quote','board-arrange-foundation'])await succeeds(page,step)
  const before=await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts)
  const indices=before.find(n=>n.containerSpec?.widget==='indices'),watch=before.find(n=>n.containerSpec?.widget==='watchlist'),quote=before.find(n=>n.containerSpec?.widget==='quote')
  expect(indices.y+indices.height/2).toBeLessThan(watch.y-watch.height/2);expect(watch.y).toBe(quote.y);expect(watch.x).toBeLessThan(quote.x)
  expect(await page.evaluate(()=>window.guideProbe.foundationCues)).toContain('整理市场指数、自选与行情面板')
  await page.evaluate(()=>{window.guideProbe.feedFrames=[];window.guideProbe.recordFeeds=true;const sample=()=>{const canvas=document.querySelector('#guide-host [data-research-canvas]'),read=widget=>{const card=canvas.querySelector('[data-financial-widget="'+widget+'"]')?.closest('[data-research-node-id]');return card?.getBoundingClientRect().toJSON()};const frame={watch:read('watchlist'),quote:read('quote'),news:read('news'),announcements:read('announcements')};if(frame.news||frame.announcements)window.guideProbe.feedFrames.push(frame);if(window.guideProbe.recordFeeds)requestAnimationFrame(sample)};requestAnimationFrame(sample)})
  for(const step of ['board-news','board-announcements'])await succeeds(page,step)
  const frames=await page.evaluate(()=>{window.guideProbe.recordFeeds=false;return window.guideProbe.feedFrames})
  expect(frames.length).toBeGreaterThan(4)
  for(const frame of frames)for(const widget of ['news','announcements'])if(frame[widget])expect(frame[widget].top,widget+' must start in the third row on every painted frame').toBeGreaterThanOrEqual(Math.max(frame.watch.bottom,frame.quote.bottom)-1)
  expect(frames.find(frame=>frame.announcements).announcements.top).toBe(frames.find(frame=>frame.announcements).news.top)
  await writeFile(evidence+'/board-feed-first-paints.json',JSON.stringify({before,frames},null,2))
  await page.screenshot({path:evidence+'/board-feeds-third-row.png'})
  expect(errors).toEqual([])
 }finally{await page.close()}
},20000)

it.each(['paused','deleted','moved','disposed'])('guards a native prepared smart response when %s during the request',async outcome=>{
 const{page,errors,smartRequests,releaseSmart}=await fixture({nativeLayout:true,smartMode:'deferred'})
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.addEventListener('sherlock:home-guide-cue',event=>{const d=JSON.parse(JSON.stringify(event.detail));if(d.requestId)window.guideProbe.ackCue(d)})})
  for(const step of ['mount-board','board-indices','board-watchlist','board-quote','board-news','board-announcements','board-calendar','board-arrange','board-link','board-add','board-smart-container'])await succeeds(page,step)
  const pending=command(page,'board-smart-generate',{},30000)
  await expect.poll(()=>smartRequests.length,{timeout:10000}).toBe(1)
  const targetId=smartRequests[0].canvasNodeId
  if(outcome==='disposed')await succeeds(page,'dispose')
  else await page.evaluate(({outcome,targetId})=>{
   if(outcome==='paused')window.dispatchEvent(new CustomEvent('sherlock:home-guide-playback',{detail:{runId:'guide-browser-run',sessionId:'guide-browser-session',playing:false}}))
   else{const workspace=window.guideProbe.registry.for('guide-browser-session');if(outcome==='deleted')workspace.setArtifacts(workspace.getSnapshot().artifacts.filter(node=>node.id!==targetId));else{const before=workspace.getSnapshot().artifacts.find(node=>node.id===targetId);workspace.applyWorkbenchCells(workspace.getWorkbenchCells().map(cell=>cell.id===targetId?{...cell,y:cell.y+10,freePosition:true}:cell),true);window.guideProbe.userSmartY=workspace.getSnapshot().artifacts.find(node=>node.id===targetId).y;if(window.guideProbe.userSmartY<=before.y)throw Error('Native move fixture did not move its target')}}
  },{outcome,targetId})
  releaseSmart()
  if(outcome==='paused'){
   await page.waitForTimeout(180)
   expect(await page.evaluate(id=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.find(node=>node.id===id)?.generationStatus,targetId)).toBe('queued')
   expect(await page.evaluate(id=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.find(node=>node.id===id)?.containerSpec,targetId)).toBeUndefined()
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-playback',{detail:{runId:'guide-browser-run',sessionId:'guide-browser-session',playing:true}})))
  }
  expect(await pending).toMatchObject({ok:outcome==='paused'})
  await page.waitForTimeout(80)
  const state=await page.evaluate(id=>{const nodes=window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts;return{count:nodes.length,node:nodes.find(node=>node.id===id),tables:nodes.filter(node=>node.containerSpec?.type==='table').length}},targetId)
  if(outcome==='paused')expect(state.node).toMatchObject({generationStatus:'completed',generationTaskId:'guide-smart-result'})
  else{expect(state.tables).toBe(0);if(outcome==='deleted'){expect(state.count).toBe(6);expect(state.node).toBeUndefined()}else{expect(state.node.generationStatus).toBe('failed');if(outcome==='moved')expect(state.node.y).toBe(await page.evaluate(()=>window.guideProbe.userSmartY))}}
  expect(smartRequests).toHaveLength(1);await preserved(page);expect(errors).toEqual([])
 }finally{releaseSmart();await page.close()}
},30000)

it('rejects a completed task for a different smart node before native hydration',async()=>{
 const{page,errors}=await fixture({nativeLayout:true,smartMode:'wrong-node'})
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.addEventListener('sherlock:home-guide-cue',event=>{const d=JSON.parse(JSON.stringify(event.detail));if(d.requestId)window.guideProbe.ackCue(d)})})
  for(const step of ['mount-board','board-indices','board-watchlist','board-quote','board-news','board-announcements','board-calendar','board-arrange','board-link','board-add','board-smart-container'])await succeeds(page,step)
  expect(await command(page,'board-smart-generate')).toMatchObject({ok:false,message:'示例组件结果尚未就绪。'})
  const nodes=await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts)
  expect(nodes).toHaveLength(7);expect(nodes.some(node=>node.containerSpec?.type==='table')).toBe(false)
  expect(nodes.find(node=>node.workbenchIndex===6).generationStatus).toBe('failed');expect(errors).toEqual([])
 }finally{await page.close()}
},25000)

it.each(['hidden','visible'])('finishes native arrange without chasing an optional %s action receipt',async state=>{
 const {page,errors}=await fixture({nativeLayout:true})
 try{
  await page.evaluate(()=>{
   document.documentElement.dataset.homeGuidePointerRun='guide-browser-run';window.guideProbe.arrangeCues=[]
   window.addEventListener('sherlock:home-guide-cue',event=>{const d=JSON.parse(JSON.stringify(event.detail));if(!d.requestId)return;window.guideProbe.arrangeCues.push(d);const reply=(ok,message)=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:d.runId,requestId:d.requestId,ok,message}}));if(!window.guideProbe.arrangePointer){void window.guideProbe.ackCue(d);return}const target=[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===d.targetToken);void window.guideProbe.arrangePointer.perform({target,action:d.action,onFrame:frame=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-progress',{detail:{runId:d.runId,requestId:d.requestId,...frame}}))}).then(()=>reply(true),error=>reply(false,error.message))})
  })
  for(const step of ['mount-board','board-watchlist','board-quote','board-news','board-arrange','board-link'])await succeeds(page,step)
  await page.evaluate(async()=>{const w=window.guideProbe.registry.for('guide-browser-session'),n=w.getSnapshot().artifacts[0],s=await w.canvasAction('inspect',{ids:[n.id]});await w.canvasAction('apply',{requestId:'user-receipt',revision:s.revision,changes:[{op:'update',id:n.id,fields:{title:'用户修改'}}]})})
  const receipt=page.locator('[data-canvas-action-receipt][data-ework-toolbar-owner="guide-browser-session"]')
  await expect.poll(()=>receipt.count()).toBe(1)
  if(state==='hidden')await receipt.evaluate(element=>element.style.setProperty('visibility','hidden','important'))
  await page.evaluate(()=>{window.guideProbe.arrangePointer=window.guideProbe.createPointer({runId:'guide-browser-run',signal:new AbortController().signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>Promise.resolve()})})
  const before=await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.map(node=>node.id))
  expect(await command(page,'board-arrange')).toMatchObject({ok:true})
  expect(await page.evaluate(()=>window.guideProbe.arrangeCues.some(cue=>cue.label==='整理六个组件，保留完整阅读空间'&&cue.action==='click'))).toBe(true)
  expect(await page.evaluate(()=>window.guideProbe.arrangeCues.some(cue=>cue.label==='关闭整理结果提示'))).toBe(false)
  expect(await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.map(node=>node.id))).toEqual(before)
  expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0);await preserved(page);expect(errors).toEqual([])
  await expect.poll(()=>receipt.count(),{timeout:7000}).toBe(0)
 }finally{await page.evaluate(()=>window.guideProbe.arrangePointer?.dispose()).catch(()=>{});await page.close()}
},16000)
it.each(['rejected','disposed','user-layout'])('keeps the native connection focus bounded when %s',async mode=>{
 const {page,errors}=await fixture({nativeLayout:true,width:1080,height:1000,guideTop:52,guideBottom:100})
 try{
  await page.evaluate(mode=>{
   document.getElementById('guide-host').style.right='430px';document.getElementById('guide-host').style.left='0px'
   window.guideProbe.view.update({view:'research'});document.documentElement.dataset.homeGuidePointerRun='guide-browser-run'
   window.addEventListener('sherlock:home-guide-cue',event=>{
    const d=JSON.parse(JSON.stringify(event.detail));if(!d.requestId)return
    const reply=(ok,message)=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:d.runId,requestId:d.requestId,ok,message}}))
    if(d.action!=='drag'){reply(true);return}
    window.guideProbe.focusedCells=window.guideProbe.registry.for('guide-browser-session').getWorkbenchCells()
    if(mode==='disposed'){window.dispatchEvent(new CustomEvent('sherlock:home-guide-native-request',{detail:{runId:d.runId,requestId:'dispose-focused-link',sessionId:'guide-browser-session',hostId:'guide-host',command:'dispose'}}));return}
    if(mode==='user-layout'){
     const workspace=window.guideProbe.registry.for('guide-browser-session'),calendar=workspace.getSnapshot().artifacts.find(node=>node.containerSpec.type==='calendar-tool')
     workspace.applyWorkbenchCells(workspace.getWorkbenchCells().map(cell=>cell.id===calendar.id?{...cell,h:cell.h+3}:cell),true)
     window.guideProbe.userCells=workspace.getWorkbenchCells();reply(true);return
    }
    reply(false,'用户取消当前连接')
   })
  },mode)
  for(const step of ['mount-board','board-library','board-indices','board-watchlist','board-quote','board-news','board-announcements','board-calendar','board-arrange'])await succeeds(page,step)
  const before=await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getWorkbenchCells())
  expect(await command(page,'board-link')).toMatchObject({ok:false})
  const state=await page.evaluate(()=>{const workspace=window.guideProbe.registry.for('guide-browser-session');return{cells:workspace.getWorkbenchCells(),focused:window.guideProbe.focusedCells,user:window.guideProbe.userCells,nodes:workspace.getSnapshot().artifacts,disk:JSON.parse(window.guideProbe.memory.get('sherlock.research.canvas.artifacts.v1:guide-browser-session'))}})
  expect(state.focused).toEqual(before)
  expect(state.cells).toEqual(mode==='user-layout'?state.user:before)
  expect(state.nodes.every(node=>!node.containerSpec.linkedSourceId&&!node.containerSpec.linkedWatchlistId)).toBe(true)
  expect(state.disk.map(({id,x,y,width,height})=>({id,x,y,width,height}))).toEqual(state.nodes.map(({id,x,y,width,height})=>({id,x,y,width,height})))
  expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
},15000)
const canvas = page => page.locator('#guide-host [data-research-canvas]')
const widget = (page, name) => page.locator(`#guide-host [data-financial-widget="${name}"]`)

it.each(['slow','failed'])('waits for the real asynchronous stock search result (%s) without fabricating a selection',async mode=>{
 const{page,errors}=await fixture()
 try{
  await page.evaluate(async mode=>{
   const p=window.guideProbe,ws=p.registry.for('guide-browser-session'),bridge=window.dshDesktop.financialWidget,all=(await bridge.request({action:'search',query:''})).symbols
   ws.setCanvasSize({width:1100,height:720,availableWidth:1100});ws.setWorkbenchWidth(1100)
   const watch=ws.createFinancialWidget('watchlist'),quote=ws.createFinancialWidget('quote'),news=ws.createFinancialWidget('news')
   ws.setArtifacts([{...watch,containerSpec:{...watch.containerSpec,symbols:all.filter(s=>s.code!=='000858'),selectedSymbol:'US:AAPL'}},{...quote,containerSpec:{...quote.containerSpec,linkedWatchlistId:watch.id}},{...news,containerSpec:{...news.containerSpec,linkedSourceId:quote.id}}])
   p.searchIds={watch:watch.id,quote:quote.id}
   window.dshDesktop.financialWidget={request:async input=>{if(input.action==='search'){if(mode==='failed')throw Error('实际搜索服务暂不可用');await new Promise(resolve=>setTimeout(resolve,3300))}return bridge.request(input)}}
   document.documentElement.dataset.homeGuidePointerRun='guide-browser-run'
   window.addEventListener('sherlock:home-guide-cue',event=>{const d=JSON.parse(JSON.stringify(event.detail));if(d.requestId)window.guideProbe.ackCue(d)})
  },mode)
  await succeeds(page,'mount-board')
  const response=await command(page,'board-add')
  const state=await page.evaluate(()=>{const p=window.guideProbe,nodes=p.registry.for('guide-browser-session').getSnapshot().artifacts;return{watch:nodes.find(n=>n.id===p.searchIds.watch).containerSpec,quote:nodes.find(n=>n.id===p.searchIds.quote).containerSpec}})
  if(mode==='slow'){expect(response).toMatchObject({ok:true});expect(state.watch.symbols).toHaveLength(5);expect(state.watch.selectedSymbol).toBe('SZ:000858');expect(state.quote.symbols[0].code).toBe('000858')}
  else{expect(response).toMatchObject({ok:false,message:'实际搜索服务暂不可用'});expect(state.watch.symbols).toHaveLength(4);expect(state.watch.selectedSymbol).toBe('US:AAPL')}
  expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
},20000)

it.each(['initially-hidden','stale-hidden-copy','duplicate-visible','paused-hidden','disposed-hidden'])('waits for a stable current native library target with %s before the real shared pointer',async kind=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1380,height:900,guideTop:116,guideBottom:69})
 try{
  await succeeds(page,'mount-board')
  await page.evaluate(kind=>{
   const p=window.guideProbe,toolbar=document.querySelector('[data-ework-toolbar][data-ework-toolbar-owner="guide-browser-session"]'),button=toolbar.querySelector('[data-financial-library]')
   p.readyToolbar=toolbar;p.readyButton=button;p.readinessCues=[];p.readinessFrames=0;document.documentElement.dataset.homeGuidePointerRun='guide-browser-run'
   const countFrame=()=>{p.readinessFrames++;requestAnimationFrame(countFrame)};requestAnimationFrame(countFrame)
   window.addEventListener('sherlock:home-guide-native-request',event=>{if(event.detail.command==='board-library')p.readinessStartFrame=p.readinessFrames})
   if(kind.endsWith('hidden'))toolbar.style.setProperty('visibility','hidden','important')
   else{const old=toolbar.cloneNode(true);old.dataset.previousToolbar='';if(kind==='stale-hidden-copy')old.style.setProperty('visibility','hidden','important');toolbar.before(old);p.previousToolbar=old}
   p.readinessPointer=p.createPointer({runId:'guide-browser-run',signal:new AbortController().signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>Promise.resolve()})
   window.addEventListener('sherlock:home-guide-cue',event=>{
    const d=JSON.parse(JSON.stringify(event.detail));if(!d.requestId)return
    const target=[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===d.targetToken)
    p.readinessCues.push({sameButton:target===p.readyButton,visibility:getComputedStyle(target).visibility,frames:p.readinessFrames-p.readinessStartFrame})
    const reply=(ok,message)=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:d.runId,requestId:d.requestId,ok,message}}))
    void p.readinessPointer.perform({target,action:d.action,onFrame:frame=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-progress',{detail:{runId:d.runId,requestId:d.requestId,...frame}}))}).then(()=>reply(true),error=>reply(false,error.message))
   })
  },kind)
  const pending=command(page,'board-library').catch(error=>({error:error.message}))
  if(kind!=='stale-hidden-copy'){
   await page.waitForTimeout(90)
   expect(await page.evaluate(()=>window.guideProbe.readinessCues)).toEqual([])
   expect(await page.locator('[data-home-guide-native-library]').count()).toBe(0)
   if(kind==='disposed-hidden'){
    await succeeds(page,'dispose');expect(await pending).toMatchObject({ok:false})
    expect(await page.evaluate(()=>window.guideProbe.readinessCues)).toEqual([]);expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0)
    await preserved(page);expect(errors).toEqual([]);return
   }
   if(kind==='paused-hidden')await page.evaluate(()=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-playback',{detail:{runId:'guide-browser-run',sessionId:'guide-browser-session',playing:false}})))
   await page.evaluate(()=>{window.guideProbe.readyToolbar.style.removeProperty('visibility');window.guideProbe.previousToolbar?.remove()})
   if(kind==='paused-hidden'){
    await page.waitForTimeout(90);expect(await page.evaluate(()=>window.guideProbe.readinessCues)).toEqual([])
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-playback',{detail:{runId:'guide-browser-run',sessionId:'guide-browser-session',playing:true}})))
   }
  }
  expect(await pending).toMatchObject({ok:true})
  const cues=await page.evaluate(()=>window.guideProbe.readinessCues)
  expect(cues).toHaveLength(1);expect(cues[0]).toMatchObject({sameButton:true,visibility:'visible'});expect(cues[0].frames).toBeGreaterThanOrEqual(2)
  expect(await page.locator('[data-home-guide-native-library]').count()).toBe(1)
  expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0)
  await preserved(page);expect(errors).toEqual([])
 }finally{await page.evaluate(()=>window.guideProbe.readinessPointer?.dispose()).catch(()=>{});await page.close()}
},15000)

it.each([{width:1380,height:900},{width:1080,height:1000}])('uses acknowledged real controls, visible port paths and typed search at $width × $height',async size=>{
 const {page,errors,external}=await fixture({nativeLayout:true,...size,guideTop:116,guideBottom:69})
 try{
  await succeeds(page,'mount-board')
  await page.evaluate(()=>{
   document.documentElement.dataset.homeGuidePointerRun='guide-browser-run'
   window.guideProbe.pointerCues=[];window.guideProbe.typed=[]
   document.addEventListener('input',event=>{if(event.target.getAttribute?.('role')==='combobox')window.guideProbe.typed.push(event.target.value)},true)
   window.addEventListener('sherlock:home-guide-cue',event=>{
    if(!event.detail.requestId)return
    const d=JSON.parse(JSON.stringify(event.detail)),find=token=>[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===token),target=find(d.targetToken),fromTarget=find(d.fromTargetToken)
    const rect=target=>{const r=target.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}},canvas=document.querySelector('#guide-host [data-research-canvas]')
    window.guideProbe.pointerCues.push({payload:d,action:d.action,target:target.dataset.financialPortNode,from:fromTarget?.dataset.financialPortNode,toSide:target.dataset.financialPort,fromSide:fromTarget?.dataset.financialPort,targetRect:rect(target),fromRect:fromTarget?rect(fromTarget):null,canvas:rect(canvas)})
    window.guideProbe.ackCue(d)
   })
  })
  // The central pointer is represented only by its acknowledged contract here;
  // native components, search, layout and persistence remain the real renderer.
  for(const step of ['board-library','board-watchlist','board-quote','board-news','board-arrange','board-link','board-add'])await succeeds(page,step)
  const result=await page.evaluate(()=>{const p=window.guideProbe,snapshot=p.registry.for('guide-browser-session').getSnapshot();return{cues:p.pointerCues,typed:p.typed,nodes:snapshot.artifacts.map(n=>({id:n.id,spec:n.containerSpec})),stored:JSON.parse(p.memory.get('sherlock.research.canvas.artifacts.v1:guide-browser-session'))}})
  const watch=result.nodes.find(n=>n.spec.widget==='watchlist'),quote=result.nodes.find(n=>n.spec.widget==='quote'),news=result.nodes.find(n=>n.spec.widget==='news'),drags=result.cues.filter(cue=>cue.action==='drag')
  for(const cue of result.cues)expect(Object.keys(cue.payload).sort()).toEqual(['runId','requestId','label','action','targetToken',...(cue.action==='drag'?['fromTargetToken']:[])].sort())
  expect(drags.map(cue=>[cue.from,cue.fromSide,cue.target,cue.toSide])).toEqual([[watch.id,'output',quote.id,'input'],[quote.id,'output',news.id,'input']])
  for(const cue of drags)for(const box of [cue.fromRect,cue.targetRect]){expect(box.width).toBeGreaterThan(0);expect(box.y).toBeGreaterThanOrEqual(cue.canvas.y-1);expect(box.bottom).toBeLessThanOrEqual(cue.canvas.bottom+1)}
  expect(result.typed).toEqual(['000858','000425'].flatMap(code=>Array.from({length:code.length},(_,index)=>code.slice(0,index+1))));expect(watch.spec.symbols).toHaveLength(5);expect(quote.spec.symbols[0].code).toBe('000858');expect(quote.spec.linkedWatchlistId).toBe(watch.id);expect(news.spec.linkedSourceId).toBe(quote.id)
  expect(result.stored.map(node=>node.id).sort()).toEqual(result.nodes.map(node=>node.id).sort())
  // Native connections are shown for a selected endpoint; the guide releases its owned selection.
  await page.locator('#guide-host [data-research-node-id]:has([data-financial-widget="quote"]) .ew-grid-header').click({position:{x:130,y:12}})
  await expect.poll(()=>page.locator('#guide-host .ew-financial-connection-line').count()).toBe(2)
  expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0)
  await preserved(page);expect(errors).toEqual([]);expect(external).toEqual([])
 }finally{await page.close()}
},45000)

it.each(['click','from-port','to-port'])('does not act when the acknowledged %s target moves offscreen',async kind=>{
 const {page,errors}=await fixture({nativeLayout:true,width:1380,height:900,guideTop:116,guideBottom:69})
 try{
  await succeeds(page,'mount-board')
  await page.evaluate(()=>{
   document.documentElement.dataset.homeGuidePointerRun='guide-browser-run'
   window.addEventListener('sherlock:home-guide-cue',event=>{
    if(!event.detail.requestId)return
    const d=JSON.parse(JSON.stringify(event.detail)),find=token=>[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===token),target=find(d.targetToken),fromTarget=find(d.fromTargetToken)
    const mode=window.guideProbe.offscreenTarget
    if(mode==='click'&&d.action==='click'){window.guideProbe.offscreenActed=true;target.style.transform='translateY(-3000px)'}
    if(d.action==='drag'&&(mode==='from-port'||mode==='to-port')){window.guideProbe.offscreenActed=true;(mode==='from-port'?fromTarget:target).style.transform='translateY(-3000px)'}
    window.guideProbe.ackCue(d)
   })
  })
  if(kind!=='click')for(const step of ['board-watchlist','board-quote','board-news','board-arrange'])await succeeds(page,step)
  await page.evaluate(value=>{window.guideProbe.offscreenTarget=value},kind)
  const reply=await command(page,kind==='click'?'board-library':'board-link')
  expect(reply.ok).toBe(false);expect(await page.evaluate(()=>window.guideProbe.offscreenActed)).toBe(true)
  expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0)
  const nodes=await page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts)
  expect(nodes.some(node=>node.containerSpec.linkedWatchlistId||node.containerSpec.linkedSourceId)).toBe(false)
  if(kind==='click'){expect(nodes).toHaveLength(0);expect(await page.locator('[data-financial-library]').getAttribute('aria-expanded')).toBe('false')}
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)

it('runs the live-bridge board tutorial on the real native canvas and retains the original ConversationRoot and InputBar', async () => {
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
    expect(await page.locator('#guide-host [data-home-guide-sample-label]').count()).toBe(0)
    await succeeds(page, 'board-arrange')
    await succeeds(page, 'board-link')
    const linked=await page.evaluate(()=>{const snapshot=window.guideProbe.registry.for('guide-browser-session').getSnapshot();return{selected:snapshot.selection.selectedNodeIds,nodes:snapshot.artifacts.map(n=>({id:n.id,spec:n.containerSpec})),ports:[...document.querySelectorAll('#guide-host [data-financial-port]')].map(n=>({id:n.dataset.financialPortNode,side:n.dataset.financialPort})),visibleLinks:document.querySelectorAll('#guide-host .ew-financial-connection-line').length}})
    const source=linked.nodes.find(n=>n.spec.widget==='watchlist'),quote=linked.nodes.find(n=>n.spec.widget==='quote'),news=linked.nodes.find(n=>n.spec.widget==='news')
    expect(quote.spec.linkedWatchlistId).toBe(source.id);expect(news.spec.linkedSourceId).toBe(quote.id)
    expect(linked.selected).toEqual([]);expect(linked.visibleLinks).toBe(0)
    expect(linked.ports).toEqual(expect.arrayContaining([{id:source.id,side:'output'},{id:quote.id,side:'input'},{id:quote.id,side:'output'},{id:news.id,side:'input'}]))
    // Select the middle component through its real header to reveal both native relationships.
    await page.locator('#guide-host [data-research-node-id]:has([data-financial-widget="quote"]) .ew-grid-header').click({position:{x:130,y:12}})
    await expect.poll(() => page.locator('#guide-host .ew-financial-connection-line').count()).toBe(2)
    await writeFile(evidence+'/board-link-selection-evidence.json',JSON.stringify({before:linked,after:await page.evaluate(()=>({selected:window.guideProbe.registry.for('guide-browser-session').getSnapshot().selection.selectedNodeIds,visibleLinks:document.querySelectorAll('#guide-host .ew-financial-connection-line').length}))},null,2))
    await expect.poll(() => widget(page, 'quote').locator('[data-financial-chart]').count()).toBe(1)
    await expect.poll(() => widget(page, 'news').locator('.ew-news-list').textContent()).toMatch(/行情桥测试新闻/)
    expect(await widget(page,'news').locator('.ew-financial-footer').innerText()).toContain('行情桥测试服务')
    await expect.poll(() => widget(page, 'watchlist').locator('[data-stock-code]').count()).toBe(3)
    const firstPrice = await widget(page, 'quote').locator('.ew-quote-price-line').textContent()
    await widget(page, 'watchlist').locator('[data-stock-code]').nth(1).click()
    await expect.poll(() => widget(page, 'quote').locator('.ew-quote-price-line').textContent()).not.toBe(firstPrice)
    await succeeds(page, 'board-add')
    await expect.poll(() => widget(page, 'watchlist').locator('[data-stock-code]').count()).toBe(5)
    await expect.poll(() => widget(page, 'quote').locator('.ew-quote-price-line strong').textContent()).toContain('101.00')
    await succeeds(page, 'board-arrange')
    await expect.poll(() => canvas(page).evaluate(el => Boolean(el.__eworkContentFit))).toBe(false)
    expect(await page.locator('[data-ework-toolbar][data-ework-toolbar-owner="guide-browser-session"] .ew-arrange-tool').getAttribute('data-arrange-mode')).toBe('standard')
    // Saving an arranged board must not arrange or scroll a second time.
    const geometry = await page.locator('#guide-host [data-research-node-id]').evaluateAll(cards => cards.map(card => { const box = card.getBoundingClientRect(),scroll=card.closest('[data-research-canvas]').scrollTop; return { x: box.x, y: box.y+scroll, width: box.width, height: box.height } }))
    expect(geometry).toHaveLength(3)
    const top = await canvas(page).evaluate(el => el.getBoundingClientRect().top)
    expect(Math.min(...geometry.map(box=>box.y))).toBeGreaterThanOrEqual(top - 1)
    expect(await canvas(page).evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true)
    expect(Math.min(...geometry.map(box=>box.height))).toBeGreaterThanOrEqual(240)
    expect(geometry.every(box => box.width > 100 && box.height > 100 && Object.values(box).every(Number.isFinite))).toBe(true)
    expect(await page.locator('#guide-host').textContent()).toMatch(/行情桥测试新闻/)
    await preserved(page)
    expect(await page.evaluate(() => ({ provider: window.guideProbe.providerCalls, workspace: window.guideProbe.workspaceCalls, library: window.guideProbe.libraryCalls }))).toEqual({ provider: 0, workspace: 0, library: 0 })
    expect(await page.evaluate(()=>window.guideProbe.financialCalls)).toBeGreaterThan(0)
    expect(external).toEqual([]); expect(errors).toEqual([])
    await page.screenshot({ path: `${evidence}/linked-board.png` })
    await writeFile(`${evidence}/linked-board.json`, JSON.stringify({ url: page.url(), geometry, errors, external, bridgeCalls: await page.evaluate(() => ({ financial: window.guideProbe.financialCalls, library: window.guideProbe.libraryCalls })) }, null, 2))
  } finally { await page.close() }
}, 45000)

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
    const reply = await command(page, 'mount-board', {}, 300)
    expect(reply.ok).not.toBe(true)
    expect(await page.locator('[data-research-canvas]').count()).toBe(0)
    expect(await page.locator('[data-ework-toolbar-owner]').count()).toBe(0)
    expect(errors).toEqual([])
  } finally { await page.close() }
}, 10000)

it.each([['board','research'],['note','notes'],['ppt','chat']])('opens native layout at the start of %s while retaining one resident and the original draft',async(kind,view)=>{
 const{page,errors}=await fixture({nativeLayout:true,width:1240})
 try{
  const initial=await page.evaluate(()=>window.guideProbe.layout.getSnapshot().sidebar)
  await page.evaluate(({kind,view,runId})=>{const center=document.querySelector('.pI_x6G_centerCol'),root=document.querySelector('.wSkVaW_root'),guide=document.querySelector('[data-home-guide]');center.dataset.homeGuideActive=runId;root.dataset.homeGuideResident=runId;guide.dataset.kind=kind;window.guideProbe.view.update({view})},{kind,view,runId})
  await expect.poll(()=>page.evaluate(()=>window.guideProbe.rightPanel.panelOpen)).toBe(kind!=='ppt')
  await expect.poll(()=>page.evaluate(()=>window.guideProbe.layout.getSnapshot().sidebar)).toBe(kind==='ppt'?initial:0)
  expect(await page.locator('.wSkVaW_root').count()).toBe(1)
  if(kind==='board'){await succeeds(page,'mount-board');expect(await page.locator('[data-research-canvas]').count()).toBe(1);expect(await page.locator('[data-ework-toolbar]').count()).toBe(1);await succeeds(page,'dispose')}
  await preserved(page)
  await page.evaluate(()=>{delete document.querySelector('.pI_x6G_centerCol').dataset.homeGuideActive;delete document.querySelector('.wSkVaW_root').dataset.homeGuideResident})
  await expect.poll(()=>page.evaluate(()=>window.guideProbe.rightPanel.panelOpen)).toBe(kind!=='ppt')
  await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},45000)

it.each([['board','research'],['note','notes']])('opens native %s layout when its resident transition precedes the guide mount',async(kind,view)=>{
 const {page,errors}=await fixture({nativeLayout:true,width:1460})
 try{
  await page.evaluate(({view,sessionId})=>{
   const guide=document.querySelector('[data-home-guide]');window.guideProbe.detachedGuide=guide;guide.remove()
   document.documentElement.dataset.homeGuideTransition='pending-native-guide';document.documentElement.dataset.homeGuideTransitionSession=sessionId
   window.guideProbe.view.update({view})
  },{view,sessionId})
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  expect(await page.evaluate(()=>window.guideProbe.layout.getSnapshot().sidebar)).toBeGreaterThan(0)
  await page.evaluate(({kind,runId})=>{
   const center=document.querySelector('.pI_x6G_centerCol'),root=document.querySelector('.wSkVaW_root'),guide=window.guideProbe.detachedGuide
   center.dataset.homeGuideActive=runId;root.dataset.homeGuideResident=runId;guide.dataset.kind=kind;center.append(guide)
   delete document.documentElement.dataset.homeGuideTransition;delete document.documentElement.dataset.homeGuideTransitionSession
  },{kind,runId})
  await expect.poll(()=>page.evaluate(()=>window.guideProbe.layout.getSnapshot().sidebar)).toBe(0)
  await expect.poll(()=>page.evaluate(()=>window.guideProbe.rightPanel.panelOpen)).toBe(true)
  await preserved(page);expect(await page.locator('.wSkVaW_root').count()).toBe(1);expect(errors).toEqual([])
 }finally{await page.close()}
},10000)

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
  await expect.poll(()=>page.locator('.wSkVaW_root').getAttribute('data-odyssey-page')).toBe('research')
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
},45000)

it.each(['session-change','unmount'])('releases research activation held by a guide on %s',async end=>{
 const {page,errors}=await fixture({nativeLayout:true})
 try{
  await page.evaluate(()=>window.guideProbe.view.update({view:'research'}))
  await expect.poll(()=>page.evaluate(()=>window.guideProbe.researchActiveSessions.has('guide-browser-session'))).toBe(true)
  await page.evaluate(()=>{
   const center=document.querySelector('.pI_x6G_centerCol'),root=document.querySelector('.wSkVaW_root'),guide=document.querySelector('[data-home-guide]')
   center.dataset.homeGuideActive=guide.dataset.homeGuide;root.dataset.homeGuideResident=guide.dataset.homeGuide;guide.dataset.kind='board'
  })
  await expect.poll(()=>page.locator('.wSkVaW_root').getAttribute('data-odyssey-page')).toBe('research')
  expect(await page.evaluate(()=>window.guideProbe.researchActiveSessions.has('guide-browser-session'))).toBe(true)
  await page.evaluate(end=>end==='unmount'?window.guideProbe.dispose():window.guideProbe.setContext({sessionId:'next-session',subagentPanel:false}),end)
  await expect.poll(()=>page.evaluate(()=>window.guideProbe.researchActiveSessions.has('guide-browser-session'))).toBe(false)
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)


it.each([{width:1380,height:900},{width:1380,height:768},{width:1080,height:900}])('keeps native cards readable with document scrolling at $width × $height',async size=>{
 const {page,errors}=await fixture({nativeLayout:true,...size,guideTop:116,guideBottom:69,reducedMotion:'no-preference'})
 try{
  await page.evaluate(()=>{
   const center=document.querySelector('.pI_x6G_centerCol'),root=document.querySelector('.wSkVaW_root'),guide=document.querySelector('[data-home-guide]')
   center.dataset.homeGuideActive=guide.dataset.homeGuide;root.dataset.homeGuideResident=guide.dataset.homeGuide;guide.dataset.kind='board';window.guideProbe.view.update({view:'research'})
  })
  for(const step of ['mount-board','board-library','board-watchlist','board-quote','board-news','board-arrange','board-link','board-add'])await succeeds(page,step)
  await expect.poll(()=>canvas(page).evaluate(el=>Boolean(el.__eworkContentFit))).toBe(false)
  const result=await page.evaluate(()=>{
   const canvas=document.querySelector('#guide-host [data-research-canvas]'),toolbar=document.querySelector('[data-ework-toolbar][data-ework-toolbar-owner="guide-browser-session"]')
   return {canvas:canvas.getBoundingClientRect().toJSON(),toolbar:toolbar.getBoundingClientRect().toJSON(),cards:[...canvas.querySelectorAll('[data-research-node-id]')].map(node=>({widget:node.querySelector('[data-financial-widget]')?.dataset.financialWidget,rect:node.getBoundingClientRect().toJSON(),footer:node.querySelector('.ew-financial-footer')?.getBoundingClientRect().toJSON(),chart:node.querySelector('[data-financial-chart]')?.getBoundingClientRect().toJSON()}))}
  })
  await page.screenshot({path:`${evidence}/final-${size.width}x${size.height}.png`})
  await writeFile(`${evidence}/final-${size.width}x${size.height}.json`,JSON.stringify(result,null,2))
  expect(result.cards).toHaveLength(3)
  expect(await canvas(page).evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true)
  for(const {widget,rect,footer,chart} of result.cards){
   expect(rect.left,widget+' left bound').toBeGreaterThanOrEqual(result.canvas.left+10)
   expect(rect.right,widget+' right bound').toBeLessThanOrEqual(result.canvas.right-10)
   expect(rect.height,widget+' full reading frame').toBeGreaterThanOrEqual(widget==='news'?240:360)
   expect(footer.height).toBeGreaterThanOrEqual(20)
   expect(footer.bottom,widget+' provenance remains inside its native frame').toBeLessThanOrEqual(rect.bottom+1)
   if(chart)expect(chart.height,'a useful native chart remains visible').toBeGreaterThan(80)
  }
  await expect.poll(()=>page.locator('[data-canvas-action-receipt][data-ework-toolbar-owner="guide-browser-session"]').count(),{timeout:7000}).toBe(0)
  await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},45000)


it('keeps a very short narrow board readable and reachable by native canvas scrolling',async()=>{
 const {page,errors}=await fixture({nativeLayout:true,width:1080,height:640,guideTop:116,guideBottom:69,reducedMotion:'no-preference'})
 try{
  let limited=false
  for(const step of ['mount-board','board-watchlist','board-quote','board-news','board-arrange','board-link','board-add']){if(step==='board-link'&&!(await connectionRoom(page)).fits){expect(await command(page,step)).toMatchObject({ok:false,message:'当前研究区高度不足以同时显示连接端点，请增大窗口后重试。'});limited=true;break}await succeeds(page,step)}
  const root=canvas(page)
  expect(await page.locator('[data-research-canvas]').count()).toBe(1)
  expect(await root.evaluate(el=>Math.abs(window.guideProbe.registry.for('guide-browser-session').getSnapshot().canvasSize.height-el.getBoundingClientRect().height))).toBeLessThan(1)
  expect(await root.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true)
  const quoteLinked=await page.evaluate(()=>!!window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.find(node=>node.containerSpec.widget==='quote').containerSpec.linkedWatchlistId)
  if(quoteLinked)expect(await widget(page,'quote').locator('[data-financial-chart]').evaluate(el=>el.clientHeight)).toBeGreaterThan(80);else{expect(limited).toBe(true);expect(await widget(page,'quote').textContent()).toContain('在标题栏搜索并选择个股')}
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
},45000)

it('retains the saved example and live bridge source after leaving the guide and recreating the native renderer',async()=>{
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
  await expect.poll(()=>second.page.locator('.wSkVaW_root [data-financial-widget=watchlist] .ew-watch-price').first().textContent()).toContain('98.00')
  expect(await second.page.evaluate(()=>window.guideProbe.registry.for('guide-browser-session').getSnapshot().artifacts.map(node=>node.id))).toEqual(ids)
  expect(await second.page.locator('[data-home-guide-native]').count()).toBe(0)
  expect(await second.page.evaluate(()=>window.guideProbe.financialCalls)).toBeGreaterThan(0)
  await second.page.evaluate(()=>{window.guideProbe.catalogCalls=0;window.dshDesktop.componentLibrary.request=async()=>{window.guideProbe.catalogCalls++;return[]}})
  await second.page.locator('[data-ework-toolbar] [data-financial-library]').click()
  await expect.poll(()=>second.page.evaluate(()=>window.guideProbe.catalogCalls)).toBe(1)
  expect(await second.page.locator('[data-home-guide-native-library]').count()).toBe(0)
  expect(await second.page.locator('[data-financial-place=calendar]').isDisabled()).toBe(false)
  expect(await second.page.locator('textarea.uV2eYG_input').inputValue()).toBe(draft)
  expect(second.errors).toEqual([])
 }finally{await second.page.close()}
},45000)

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

it.each([
 {width:1380,height:900,right:384,reducedMotion:'reduce',style:'dark'},
 {width:1255,height:818,right:348,reducedMotion:'no-preference',style:'openterminal'},
 {width:580,height:1000,right:18,reducedMotion:'reduce',style:'openterminal'},
 {width:1900,height:1400,right:384,reducedMotion:'no-preference',style:'light'}
])('commits one authored native Arrange plan and keeps real port feedback at $width × $height / $style / $reducedMotion',async options=>{
 const {page,errors}=await fixture({nativeLayout:true,...options,guideTop:34,guideBottom:10})
 const output=(process.env.SHERLOCK_BOARD_SINGLE_PLAN_EVIDENCE || '/tmp/sherlock-board-single-plan-20261103/browser')+'/'+options.width+'-'+options.style+'-'+options.reducedMotion;await mkdir(output,{recursive:true})
 try{
  await page.evaluate(({right,style})=>{
   const host=document.getElementById('guide-host'),p=window.guideProbe;host.style.left='0px';host.style.right=right+'px';p.view.update({view:'research'});document.documentElement.dataset.homeGuidePointerRun='guide-browser-run'
   const w=p.registry.for('guide-browser-session');w.setWorkbenchStyle(style)
   const cells=()=>w.getWorkbenchCells().map(({id,x,y,w,h})=>({id,x,y,w,h})),rects=()=>[...host.querySelectorAll('[data-research-node-id]')].map(card=>{const r=card.getBoundingClientRect();return{id:card.dataset.researchNodeId,width:r.width,height:r.height,font:card.querySelector('[data-financial-widget]')?getComputedStyle(card.querySelector('[data-financial-widget]')).fontSize:null}})
   p.singlePlan={phase:'adding',mutations:[],frames:[],drags:[],clicks:0};p.singleCells=cells
   for(const name of ['applyWorkbenchCells','organizeCanvas']){const original=w[name];w[name]=function(...args){const before=cells(),value=original.apply(this,args),after=cells();if(name==='organizeCanvas'||JSON.stringify(before)!==JSON.stringify(after))p.singlePlan.mutations.push({name,phase:p.singlePlan.phase,time:performance.now(),before,after});return value}}
   document.addEventListener('click',event=>{if(event.target.closest('[data-research-global-arrange]'))p.singlePlan.clicks++},true)
   const record=()=>{if(p.singlePlan.recording)p.singlePlan.frames.push({time:performance.now(),cells:cells(),rects:rects()});p.singlePlan.frame=requestAnimationFrame(record)};record()
   const pointer=p.createPointer({runId:'guide-browser-run',signal:new AbortController().signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>Promise.resolve()})
   window.addEventListener('sherlock:home-guide-cue',event=>{const d=event.detail;if(!d.requestId)return;const find=token=>[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.dataset.homeGuideCueTarget===token),reply=(ok,message)=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:d.runId,requestId:d.requestId,ok,message}}));void pointer.perform({target:find(d.targetToken),fromTarget:find(d.fromTargetToken),action:d.action,onFrame:frame=>{window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-progress',{detail:{runId:d.runId,requestId:d.requestId,...frame}}));if(d.action==='drag'){const a=find(d.fromTargetToken),b=find(d.targetToken),canvas=host.querySelector('[data-research-canvas]');p.singlePlan.drags.push({phase:frame.phase,source:a.dataset.financialPortNode,target:b.dataset.financialPortNode,selected:w.getSnapshot().selection.selectedNodeIds,path:host.querySelector('.ew-financial-connection-draft')?.getAttribute('d'),eligible:host.querySelectorAll('[data-drop-eligible]').length,ports:[a,b].map(el=>el.getBoundingClientRect().toJSON()),canvas:canvas.getBoundingClientRect().toJSON()})}}}).then(()=>reply(true),error=>reply(false,error.message))})
  },options)
  for(const step of ['mount-board','board-indices','board-watchlist','board-quote'])await succeeds(page,step)
  const before=await page.evaluate(()=>{const p=window.guideProbe;p.singlePlan.phase='foundation';p.singlePlan.recording=true;return p.singleCells()})
  await succeeds(page,'board-arrange-foundation');await page.waitForTimeout(850)
  const foundation=await page.evaluate(()=>{const p=window.guideProbe;p.singlePlan.recording=false;return p.singleCells()})
  const staged=await page.evaluate(()=>window.guideProbe.singlePlan)
  const changes=staged.mutations.filter(row=>row.phase==='foundation'&&row.name==='applyWorkbenchCells')
  expect(changes).toHaveLength(1);expect(changes[0].after).toEqual(foundation);expect(changes[0].before).toEqual(before)
  expect(staged.mutations.filter(row=>row.phase==='foundation'&&row.name==='organizeCanvas')).toHaveLength(1)
  const firstFinal=staged.frames.findIndex(row=>JSON.stringify(row.cells)===JSON.stringify(foundation));expect(firstFinal).toBeGreaterThanOrEqual(0)
  expect(staged.frames.length).toBeGreaterThan(20)
  for(const frame of staged.frames.slice(firstFinal))expect(frame.cells).toEqual(foundation)
  // Width/height transitions may interpolate during the one native commit.
  // They must stay between their endpoints, then remain at the final frame;
  // a later delayed second resize would introduce another cell transaction.
  for(const target of staged.frames.at(-1).rects){
   const samples=staged.frames.map(frame=>frame.rects.find(rect=>rect.id===target.id)).filter(Boolean)
   for(const dimension of ['width','height']){
    const start=samples[0][dimension],end=target[dimension]
    for(const sample of samples)expect(sample[dimension]).toBeGreaterThanOrEqual(Math.min(start,end)-2)
    for(const sample of samples)expect(sample[dimension]).toBeLessThanOrEqual(Math.max(start,end)+2)
    const settled=samples.findIndex((sample,index)=>index>=3&&samples.slice(index-3,index+1).every(rect=>Math.abs(rect[dimension]-end)<=1))
    if(settled>=0)for(const sample of samples.slice(settled))expect(Math.abs(sample[dimension]-end)).toBeLessThanOrEqual(1)
   }
  }
  await page.screenshot({path:output+'/foundation.png'})
  await page.evaluate(()=>window.guideProbe.singlePlan.phase='after-foundation')
  for(const step of ['board-news','board-announcements','board-calendar','board-arrange','board-link'])await succeeds(page,step)
  const result=await page.evaluate(()=>{const p=window.guideProbe,w=p.registry.for('guide-browser-session');cancelAnimationFrame(p.singlePlan.frame);return{trace:p.singlePlan,final:p.singleCells(),nodes:w.getSnapshot().artifacts.map(n=>({id:n.id,type:n.containerSpec?.widget||n.containerSpec?.type,width:n.width,height:n.height,linked:n.containerSpec?.linkedSourceId||n.containerSpec?.linkedWatchlistId})),viewport:w.getSnapshot().viewport}})
  await writeFile(output+'/geometry.json',JSON.stringify({options,before,foundation,...result},null,2));await page.screenshot({path:output+'/linked.png'})
  expect(result.trace.clicks).toBe(1);expect(result.trace.mutations.filter(row=>row.name==='organizeCanvas')).toHaveLength(1)
  for(const row of result.trace.mutations.filter(row=>row.phase==='after-foundation'))expect(row.after.filter(c=>foundation.some(old=>old.id===c.id))).toEqual(foundation)
  expect(result.final.filter(c=>foundation.some(old=>old.id===c.id))).toEqual(foundation)
  expect(result.nodes.filter(n=>n.linked)).toHaveLength(3);expect(result.viewport.scale).toBe(1)
  const dragging=result.trace.drags.filter(frame=>frame.phase==='dragging');expect(dragging.length).toBeGreaterThanOrEqual(options.reducedMotion==='reduce'?3:6);expect(dragging.some(frame=>frame.eligible>0)).toBe(true)
  expect(new Set(dragging.map(frame=>frame.path).filter(Boolean)).size).toBeGreaterThanOrEqual(options.reducedMotion==='reduce'?3:6)
  for(const frame of result.trace.drags){if(!['pressed','dragging','released'].includes(frame.phase))continue;expect(frame.selected).toEqual([frame.source]);for(const port of frame.ports){expect(port.top).toBeGreaterThanOrEqual(frame.canvas.top-1);expect(port.bottom).toBeLessThanOrEqual(frame.canvas.bottom-12)}}
  for(const frame of staged.frames)for(const rect of frame.rects)if(rect.font)expect(parseFloat(rect.font)).toBeGreaterThanOrEqual(11)
  await preserved(page);expect(errors).toEqual([])
 }finally{await page.close()}
},100000)
