import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {patchResearchCreationProgress} from '../scripts/lib/research-creation-progress.mjs'
import {patchComposerDeliverablePreview} from '../scripts/lib/figma-composer-deliverable-preview.mjs'
import {createClientCapabilityRegistry} from '../packages/dsh-research-task-runtime/client-capabilities.js'

const exactPrompt='请在当前对话中生成1个原生表格组件，标题“对话复用验收·模拟数据”。表头：项目、数量、说明；三行：样本A、12、正值；样本B、0、零值；样本C、-3、负值。数据全部由用户提供，仅作验收。先顺序读取 client_capabilities，确认 conversation.components.create 可用，再通过 client_action 提交完整 table artifact。只生成这1张组件，不联网、不创建工作台或子任务、不生成文件、不切换视图；保存成功后简短确认。'
let browser,client,runtime,bootstrap
beforeAll(async()=>{
 runtime=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 const resident=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 client=(process.env.SHERLOCK_ROUTING_RESIDENT==='1'?resident:patchComposerDeliverablePreview(patchResearchCreationProgress(resident))).replace('exports.apply = apply;','exports.apply = apply;exports.__InputBar=InputBar;exports.__Header=ConversationSessionHeader;exports.__register=registerConversationNodes;exports.__Creation=odysseyCreationIntents;')
 bootstrap=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot}from'react-dom/client';
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})}),empty=()=>null;
 const primitives=new Proxy({Tooltip:({children})=>children,MarkdownText:({text})=><p>{text}</p>},{get:(target,key)=>target[key]??empty});
 const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/cordis'?{Service:class{constructor(ctx){this.ctx=ctx}}}:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{ImageGallery:empty,AttachmentRail:empty,DropOverlay:empty}:fake;
 const rt=window.runtimeDescriptor.factory(modules),native=window.conversationDescriptor.factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id));
 const disposers=[],ctx={get:()=>undefined,reflect:{provide(){}},effect(start){const stop=start();if(typeof stop==='function')disposers.push(stop);return stop??(()=>{})}};
 const events=new rt.ConversationEventRegistry(ctx),registry=new rt.ConversationViewRegistry(ctx);native.__register({...ctx,conversationEvents:events,conversationViews:registry});
 const sessions=new rt.SessionRuntime(ctx,{sessions:{}},{},{events,views:registry}),session=sessions.manager.get('qa');session.openState='open';session.installWindow([],false);
 const store=initial=>{let value=initial;const listeners=new Set();return{getSnapshot:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},update:patch=>{value={...value,...patch};for(const fn of listeners)fn()}}};
 const mode=new URLSearchParams(location.search).get('mode')||'chat',view=store({view:mode,draft:'',selection:null}),summary=store({byId:{qa:{id:'qa',displayTitle:'独立路由验收',cwd:'/tmp/qa-routing',blank:true}}});
 window.probe={sent:[],binding:null,announcements:[],view:()=>view.getSnapshot().view,intent:()=>native.__Creation.get('qa')??null,mode:next=>view.update({view:next})};
 window.dshDesktop={clientCapabilities:{bind:async input=>{if(input.active)window.probe.binding=input;return{ok:true}},subscribe:()=>()=>{}}};
 const shell=new native.SessionInputShell({actx:{},defaultSink:async text=>{const before=shell.snapshot;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const binding=window.probe.binding;const capabilities=await window.catalogForMode(binding?.mode);window.probe.sent.push({text,view:view.getSnapshot().view,mode:binding?.mode,available:capabilities.find(row=>row.id==='conversation.components.create')?.available});shell.commitSend(before.imageIds,before.draft)}});
 const use=state=>select=>select(React.useSyncExternalStore(state.subscribe,state.getSnapshot,state.getSnapshot)),useSession=use({subscribe:fn=>session.subscribe(fn),getSnapshot:()=>session.getSnapshot()}),useStore=use(view),useInput=use(shell.state),useSessions=use(summary);
 const actions={setView:value=>view.update({view:value}),select(){},setResearchRightTab(){},setResearchConversationUnread(){}};
 const views={subscribe:()=>()=>{},version:()=>0,list:()=>[{id:'chat',label:'对话'},{id:'research',label:'研究'},{id:'notes',label:'笔记'}]},t=key=>({'hero.headline':'探索更远，洞见更深。','input.send':'发送消息','input.placeholder':'描述任务'})[key]??key;
 const shared={sessionId:'qa',useSession,useSessions,useStore,actions,views,t},inputProps={resolveSubmitMode:()=> 'queue',useSession,useInput,inputActions:shell.actions,keyboard:shell,useNotices:select=>select(null),useLexicon:select=>select(new Map()),useMenuLauncher:select=>select(null),useProjection:()=>undefined,sessionId:'qa',t};
 const state={composerHost:document.querySelector('#side-composer'),conversationHost:document.querySelector('#side-history')},sidebar={storeFor:()=>({subscribe:()=>()=>{},getSnapshot:()=>state}),publish(){},enter(){},leave(){}};
 const renderSlot=(name,props={},scope={})=>name==='conversation.session.header'?<native.__Header {...shared} renderSlot={renderSlot} open={()=>{}} rename={async()=>{}}/>:name==='conversation.session'?<native.ConversationSession {...shared} {...props} useInput={useInput} inputActions={shell.actions} renderSlot={renderSlot} bindDraftMirror={()=>()=>{}} releaseSessionImages={()=>{}} releaseResearchWorkspace={()=>{}}/>:name==='conversation.composer.bar'?<native.__InputBar {...inputProps} {...props} renderSlot={()=>null}/>:name==='conversation.view'?<section data-native-view={scope.only}>原生会话视图</section>:scope.fallback??null;
 const root=createRoot(document.querySelector('#root')),workspace=new native.ResearchWorkspaceRegistry(localStorage);
 root.render(<native.ConversationRoot {...shared} useProjection={()=>undefined} useInput={useInput} useComposerBlock={()=>undefined} renderSlot={renderSlot} renderSlotChain={(_name,_props,{fallback})=>fallback} selectWorkspace={async()=>{throw Error('unexpected workspace creation')}} useWorkspaces={select=>select({phase:'ready',items:[{workspaceId:'w',title:'路由验收工作区',sessionIds:['qa']}]})} researchWorkspaces={workspace} researchSidebar={sidebar} setResearchActive={()=>{}}/>);
 window.addEventListener('odyssey:creation-progress',event=>window.probe.announcements.push(event.detail.intent));window.probe.dispose=()=>{root.unmount();shell.dispose();disposers.reverse().forEach(fn=>fn())};
 `},bundle:true,write:false,format:'iife',platform:'browser'})).outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(()=>browser?.close())
async function fixture(mode='chat'){
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[]
 page.on('pageerror',error=>errors.push(error.stack??error.message))
 await page.exposeFunction('catalogForMode',mode=>createClientCapabilityRegistry({createConversationComponent:()=>{}}).catalog({owner:'qa-owner',sessionId:'qa',mode,editable:true}))
 await page.route('https://component-route.test/**',route=>route.fulfill({contentType:'application/json',body:'{"tasks":[],"plans":[]}'}))
 await page.route('https://component-route.test/?mode=*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Native component submit routing</title><style>html,body{margin:0;height:100%}#root{height:100vh;width:900px}#side-composer{position:fixed;left:900px;bottom:10px;width:290px}</style><main id="root"></main><aside><div id="side-history"></div><div id="side-composer"></div></aside><script>window.__ModuleLoader__={load:d=>window.descriptor=d}</script>'}))
 await page.goto('https://component-route.test/?mode='+mode);await page.addScriptTag({content:runtime});await page.evaluate(()=>window.runtimeDescriptor=window.descriptor);await page.addScriptTag({content:client});await page.evaluate(()=>window.conversationDescriptor=window.descriptor);await page.addScriptTag({content:bootstrap})
 await page.waitForFunction(mode=>window.probe?.binding?.mode===(mode==='chat'?'conversation':mode),mode,{timeout:4000}).catch(async error=>{throw Error(JSON.stringify({errors,body:await page.locator('body').innerText()})+error.message)})
 await page.locator('textarea.uV2eYG_input').waitFor();expect(errors).toEqual([])
 return{page,errors,close:async()=>{await page.evaluate(()=>window.probe.dispose());await page.close()}}
}
async function send(f,text,gesture='button'){
 const input=f.page.locator('textarea.uV2eYG_input');await input.fill(text)
 if(gesture==='enter')await input.press('Enter');else await f.page.getByRole('button',{name:'发送消息',exact:true}).click()
 await f.page.waitForFunction(()=>window.probe.sent.length===1)
 return f.page.evaluate(()=>({sent:window.probe.sent,view:window.probe.view(),intent:window.probe.intent(),announcements:window.probe.announcements}))
}
it.each(['button','enter'])('keeps the exact first-message component request in conversation before capability lookup (%s)',async gesture=>{
 const f=await fixture()
 try{const result=await send(f,exactPrompt,gesture);expect(result.sent).toEqual([{text:exactPrompt,view:'chat',mode:'conversation',available:true}]);expect(result.view).toBe('chat');expect(result.intent).toBeNull();expect(result.announcements).toEqual([]);expect(await f.page.locator('[data-conversation-view-id="chat"]').getAttribute('aria-selected')).toBe('true');expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it('keeps an ordinary bare component in conversation without a hidden canvas plan',async()=>{
 const f=await fixture()
 try{const result=await send(f,'给我生成一张蜡烛图组件，使用明确标为模拟的数据。');expect(result.sent[0]).toMatchObject({view:'chat',mode:'conversation',available:true});expect(result.intent).toBeNull();expect(result.announcements).toEqual([]);expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it.each([{mode:'research',text:'请创建一张模拟预算组件。',kind:'component'},{mode:'chat',text:'请创建一个模拟预算工作台，包含两张组件。',kind:'workbench'}])('retains research planning for an authorized canvas target: %j',async value=>{
 const f=await fixture(value.mode)
 try{const result=await send(f,value.text);expect(result.sent[0]).toMatchObject({view:'research',mode:'research',available:false});expect(result.intent).toMatchObject({kind:value.kind,state:'planning'});expect(result.announcements[0]).toMatchObject({kind:value.kind,state:'planning'});expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
