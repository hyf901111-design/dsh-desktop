import {readFile,mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {join} from 'node:path'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {createUserMessage} from '@deepseek-ai/dsh-llm'
import {presentationRuntimeFixture} from './fixtures/home-presentation-runtime.js'
import {patchHomeGuidePresentationNative} from '../scripts/lib/home-guide-presentation-native.mjs'
const evidence='/tmp/home-presentation-natural-20261024'
let browser,entry,conversationSource,runtimeSource
beforeAll(async()=>{
 runtimeSource=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 conversationSource=patchHomeGuidePresentationNative(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.__InputBar=InputBar;exports.__Chat=ChatView;exports.__Todo=TodoDock;exports.__User=UserMessageNodeView;exports.__Assistant=AssistantNodeView;exports.__register=registerConversationNodes;exports.__header=ConversationSessionHeader;exports.__bind=deps=>{HomePresentationNativeDeps=deps};')
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot}from'react-dom/client';import{mountHomePresentationGuide}from'./src/preload/home-guide-presentation';
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});const empty=()=>null;
 const primitives=new Proxy({Tooltip:({children})=>children,MarkdownText:({text})=><div style={{whiteSpace:'pre-wrap'}}>{text}</div>,Markdown:({text})=><div>{text}</div>},{get:(target,key)=>target[key]??empty});
 const cordis={Service:class{constructor(ctx){this.ctx=ctx}}};
 const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/cordis'?cordis:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{DropOverlay:empty,AttachmentRail:empty,ImageGallery:empty}:fake;
 const rt=window.runtimeDescriptor.factory(modules),native=window.conversationDescriptor.factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id));
 const disposers=[],ctx={get:()=>undefined,reflect:{provide(){}},effect(start){const stop=start();if(typeof stop==='function')disposers.push(stop);return stop??(()=>{})}};
 const events=new rt.ConversationEventRegistry(ctx),viewRegistry=new rt.ConversationViewRegistry(ctx);native.__register({...ctx,conversationEvents:events,conversationViews:viewRegistry});
 const sessionsRuntime=new rt.SessionRuntime(ctx,{sessions:{}},{},{events,views:viewRegistry}),session=sessionsRuntime.manager.get('demo');session.openState='open';session.installWindow([],false);
 const store=initial=>{let value=initial;const listeners=new Set();return{getSnapshot:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},update:patch=>{value={...value,...patch};listeners.forEach(fn=>fn())}}};
 const view=store({view:'chat',draft:'',selection:null}),summary=store({byId:{demo:{id:'demo',displayTitle:'公司风格演示示例',cwd:window.cwd,blank:true}}}),projections=store({todos:null});
 const shell=new native.SessionInputShell({actx:{},defaultSink:async text=>{const before=shell.snapshot;await window.nativeBackend({action:'send',text});shell.commitSend(before.imageIds,before.draft)}}),inputHub={shell:()=>shell};
 const use=store=>select=>select(React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot)),useSession=use({subscribe:fn=>session.subscribe(fn),getSnapshot:()=>session.getSnapshot()}),useInput=use(shell.state),useStore=use(view),useSessions=use(summary),useProjection=name=>use(projections)(s=>s[name]);
 const views={subscribe:()=>()=>{},version:()=>0,list:()=>[{id:'chat',label:'对话'}]},actions={setView:value=>view.update({view:value}),setDraft:draft=>view.update({draft}),select(){},setResearchRightTab(){},setResearchConversationUnread(){}};
 const t=(key,args)=>key==='todo.progress.total'?args.done+'/'+args.total:({'hero.headline':'探索更远，洞见更深。','input.send':'发送消息','input.placeholder':'描述你的任务…','todo.title':'任务清单'})[key]??key;
 const shared={sessionId:'demo',useSession,useSessions,useStore,actions,views,t},inputProps={resolveSubmitMode:()=> 'queue',useSession,useInput,inputActions:shell.actions,keyboard:shell,useNotices:select=>select(null),useLexicon:select=>select(new Map()),useMenuLauncher:select=>select(null),useProjection,sessionId:'demo',t};
 const sidebarState={composerHost:null,conversationHost:null},sidebarStore={subscribe:()=>()=>{},getSnapshot:()=>sidebarState},sidebar={storeFor:()=>sidebarStore,publish(){},enter(){},leave(){},service:{async openFile(scope,path){window.probe.opened.push({scope,path});await window.nativeBackend({action:'verify-file',path});document.querySelector('#right').textContent='公司风格演示示例.pptx · 原生文件路径已校验'}}};
 const openFile=path=>sidebar.service.openFile({sessionId:'demo',cwd:window.cwd},path),renderSlot=(name,props={},scope={})=>name==='conversation.session.header'?<native.__header {...shared} renderSlot={renderSlot} open={()=>{}} rename={async()=>{}}/>:name==='conversation.session'?<native.ConversationSession {...shared} {...props} useInput={useInput} inputActions={shell.actions} renderSlot={renderSlot} bindDraftMirror={()=>()=>{}} releaseSessionImages={()=>{}} releaseResearchWorkspace={()=>{}}/>:name==='conversation.composer.bar'?<native.__InputBar {...inputProps} {...props} renderSlot={()=>null}/>:name==='conversation.input.dock'?<native.__Todo useSession={useSession} useProjection={useProjection} t={t}/>:name==='conversation.view'?<native.__Chat {...shared} {...props} renderSlot={renderSlot} openFile={openFile} loadOlder={async()=>{}} loadImage={async()=>null} inspectCall={()=>{}} chatScroll={{read:()=>null,save(){}}} forkAt={()=>{}} fileMentions={()=>[]}/>:name==='conversation.chat.node'&&scope.entryKey==='user'?<native.__User {...props} t={t}/>:name==='conversation.chat.node'&&scope.entryKey==='assistant-step'?<native.__Assistant {...props} useTurnData={()=>null} t={t}/>:scope.fallback??null;
 window.probe={native,shell,session,opened:[],cues:[],guide:null,events:[],refresh:async()=>{const data=await window.nativeBackend({action:'history'});window.probe.events=data.events;session.blankBit=!data.events.some(e=>e.type==='user/message');session.installWindow(data.events.map(event=>({event,view:event.type})),false);projections.update({todos:data.events.findLast(e=>e.type==='todo/write')?.data.todos??null})}};
 native.__bind({inputHub,researchSidebar:sidebar,getHomeGuideSession:id=>window.probe.registered===false?undefined:{kind:'ppt',sessionId:id,cwd:window.cwd}});
 const registry=new native.ResearchWorkspaceRegistry({getItem:()=>null,setItem:()=>true}),root=createRoot(document.querySelector('#native-root'));
 root.render(<native.ConversationRoot {...shared} useProjection={useProjection} useInput={useInput} useComposerBlock={()=>undefined} renderSlot={renderSlot} renderSlotChain={(_name,_props,{fallback})=>fallback} selectWorkspace={async()=>{throw Error('Must not create another workspace')}} useWorkspaces={select=>select({phase:'ready',items:[{workspaceId:'w',title:'示例',sessionIds:['demo']}]})} researchWorkspaces={registry} researchSidebar={sidebar} setResearchActive={()=>{}}/>);
 window.addEventListener('sherlock:home-guide-cue',event=>window.probe.cues.push({label:event.detail.label,tag:event.detail.target.tagName}));
 const timer=setInterval(()=>window.probe.refresh(),30);
 Object.assign(window.probe,{async mount(fresh=true){this.guide=await mountHomePresentationGuide(document,document.querySelector('#guide-host'),{signal:(this.controller=new AbortController()).signal,sessionId:'demo',cwd:window.cwd,runId:'run-1',fresh})},step:step=>window.probe.guide.runStep(step),play(playing){window.dispatchEvent(new CustomEvent('sherlock:home-guide-playback',{detail:{sessionId:'demo',runId:'run-1',playing}}))},dispose(){this.guide?.dispose()},unmount(){clearInterval(timer);root.unmount();shell.dispose();disposers.reverse().forEach(fn=>fn())}});
 `},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"development"'}})
 entry=output.outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())
async function fixture(){
 const f=await presentationRuntimeFixture(),page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',e=>errors.push(e.stack??e.message))
 const backend=async input=>{
  if(input.action==='history')return{events:f.agent.session.events}
  if(input.action==='send'){f.agent.followup(createUserMessage({content:[{type:'text',text:input.text}],source:{kind:'user'}}));return{ok:true}}
  if(input.action==='verify-file'){expect(await readFile(input.path)).toEqual(f.bytes);return{ok:true}}
  const method={prepare:'prepare',playback:'playback',checkpoint:'checkpoint',dispose:'disposeRun'}[input.action]
  if(!method)throw Error('unknown command');return{ok:true,...await f.runtime[method](input)}
 }
 await page.exposeFunction('nativeBackend',backend)
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url())
  if(url.origin!=='https://presentation.local')return route.abort()
  if(url.pathname==='/sherlock/home-guide/presentation'){try{return route.fulfill({contentType:'application/json',body:JSON.stringify(await backend(route.request().postDataJSON()))})}catch(error){return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,message:error.message})})}}
  return route.fulfill({contentType:url.pathname==='/'?'text/html':'application/json',body:url.pathname==='/'?'<meta charset="utf-8"><div class="pI_x6G_centerCol"><div id="native-root"></div><section data-home-guide="run-1"><div id="guide-host"></div></section></div><aside id="right"></aside><script>window.__ModuleLoader__={load:d=>window.descriptor=d}</script>':'{}'})
 })
 await page.goto('https://presentation.local/');await page.evaluate(cwd=>window.cwd=cwd,f.cwd)
 await page.addScriptTag({content:runtimeSource});await page.evaluate(()=>window.runtimeDescriptor=window.descriptor)
 await page.addScriptTag({content:conversationSource});await page.evaluate(()=>window.conversationDescriptor=window.descriptor)
 const styles=(await Promise.all(['figma-final-shell','figma-home','figma-panels','figma-reading'].map(n=>readFile('src/preload/'+n+'.css','utf8')))).join('\n')
 await page.addStyleTag({content:styles+'\nhtml,body{margin:0;height:100%;font-family:system-ui}.pI_x6G_centerCol{position:relative;height:100vh;width:1000px}#native-root{height:100%}[data-home-guide]{position:absolute;inset:0;pointer-events:none}#right{position:fixed;left:1000px;top:60px;width:350px;padding:15px}.wSkVaW_root{height:100%}'})
 await page.addScriptTag({content:entry});await page.waitForSelector('textarea',{timeout:4000}).catch(async error=>{throw Error(JSON.stringify({errors,body:await page.locator('body').innerText()})+' '+error.message)})
 await page.evaluate(()=>window.probe.original=document.querySelector('textarea'))
 return{...f,page,errors,close:async()=>{await page.evaluate(()=>window.probe.unmount()).catch(()=>{});await page.close();await f.dispose()}}
}
it('types and sends through the resident native InputBar, renders persisted chat/tasks and opens the ordinary workspace file',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>window.probe.mount());expect(await page.locator('textarea').count()).toBe(1)
  await page.evaluate(()=>window.probe.play(true));await page.evaluate(()=>window.probe.step('brief'))
  expect(await page.locator('textarea').inputValue()).toContain('离线预置')
  await page.screenshot({path:evidence+'/01-native-brief.png'})
  await page.evaluate(()=>window.probe.step('send')).catch(async error=>{throw Error(JSON.stringify({errors:f.errors,pageErrors:f.errors,snapshot:await page.evaluate(()=>window.probe.shell.snapshot),events:f.agent.session.events},null,2)+error.message)});await page.evaluate(()=>window.probe.step('plan'))
  await page.waitForSelector('[data-testid="todo-panel"]',{timeout:3000}).catch(async error=>{throw Error(JSON.stringify({pageErrors:f.errors,body:await page.locator('body').innerText(),events:f.agent.session.events.map(e=>e.type)},null,2)+error.message)});expect(await page.locator('[data-status="in_progress"]').count()).toBe(1)
  await page.evaluate(()=>window.probe.step('layout'));await page.screenshot({path:evidence+'/02-native-plan.png'})
  await page.evaluate(()=>window.probe.step('deliver'));await f.agent.whenIdle();await page.evaluate(()=>window.probe.refresh())
  expect(await page.locator('[data-status="completed"]').count()).toBe(3)
  expect(await page.locator('[data-chat-flow-kind="user"]').count()).toBe(1)
  expect(await page.locator('[data-chat-flow-kind="assistant-step"]').count()).toBeGreaterThan(0)
  await page.evaluate(()=>window.probe.step('open'))
  expect(await page.evaluate(()=>window.probe.opened[0].path)).toBe(join(f.cwd,'公司风格演示示例.pptx'))
  expect(await page.evaluate(()=>window.probe.original===document.querySelector('textarea'))).toBe(true)
  expect(await page.evaluate(()=>window.probe.cues.map(c=>c.label))).toEqual(expect.arrayContaining(['输入演示目标','发送演示需求','打开可编辑文件']))
  await page.screenshot({path:evidence+'/03-native-delivery.png'})
  await page.evaluate(()=>window.probe.dispose());await f.ctx.sessions.flush(f.agent.session)
  expect((await f.ctx.sessionPersistence.inspect('demo')).events.some(e=>e.type==='assistant/message')).toBe(true)
  expect(await readFile(join(f.cwd,'公司风格演示示例.pptx'))).toEqual(f.bytes);expect(f.outside).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)
it('pauses before sending, aborts on lost ownership, and revisits without replacing the native draft',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>{window.probe.pending=window.probe.step('brief').then(()=>true,()=>false)})
  await page.waitForTimeout(100);expect(await page.locator('textarea').inputValue()).toBe('');expect(f.agent.session.events.some(e=>e.type==='user/message')).toBe(false)
  await page.evaluate(()=>{document.querySelector('[data-home-guide]').remove()});expect(await page.evaluate(()=>window.probe.pending)).toBe(false)
  await page.evaluate(()=>{const node=document.createElement('section');node.dataset.homeGuide='run-1';node.innerHTML='<div id="guide-host"></div>';document.querySelector('.pI_x6G_centerCol').append(node);window.probe.shell.setDraft('保留我回访时输入的文字')})
  await page.evaluate(()=>window.probe.mount(false));expect(await page.locator('textarea').inputValue()).toBe('保留我回访时输入的文字')
  expect(await page.evaluate(()=>window.probe.original===document.querySelector('textarea'))).toBe(true)
  expect(f.agent.session.events.some(e=>e.type==='user/message')).toBe(false);expect(f.outside).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
