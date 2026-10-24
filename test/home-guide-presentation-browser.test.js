import {readFile,mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {join} from 'node:path'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {presentationHostFixture} from './fixtures/home-presentation-host.js'
import {patchHomeGuidePresentationNative} from '../scripts/lib/home-guide-presentation-native.mjs'
const evidence='/tmp/home-presentation-natural-20261024'
let browser,entry,conversationSource,runtimeSource,commandsSource,triggersSource,deliverySource
beforeAll(async()=>{
 runtimeSource=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 conversationSource=patchHomeGuidePresentationNative(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.__InputBar=InputBar;exports.__Chat=ChatView;exports.__Todo=TodoDock;exports.__User=UserMessageNodeView;exports.__Assistant=AssistantNodeView;exports.__Tail=TurnTailNodeView;exports.__register=registerConversationNodes;exports.__header=ConversationSessionHeader;exports.__bind=deps=>{HomePresentationNativeDeps=deps};')
 commandsSource=(await readFile('node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.__Popup=PopupSelectView;')
 triggersSource=(await readFile('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.__Menu=MenuView;')
 deliverySource=await readFile('node_modules/@deepseek-ai/dsh-client-ui-deliverables/lib/client.js','utf8')
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot}from'react-dom/client';import{mountHomePresentationGuide}from'./src/preload/home-guide-presentation';import{installSkillComposer}from'./src/preload/integrations/skill-composer';import{createSkillUseBridge}from'./src/preload/integrations/skill-use';import{installSkillCommandBridge}from'./src/preload/integrations/skill-command-bridge';import{installSkillCommand}from'./src/preload/integrations/skill-command';
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});const empty=()=>null;
 const primitives=new Proxy({useAnchoredMaxHeight:()=>400,Tooltip:({children})=>children,MarkdownText:({text})=><div style={{whiteSpace:'pre-wrap'}}>{text}</div>,Markdown:({text})=><div>{text}</div>},{get:(target,key)=>target[key]??empty});
 const cordis={Service:class{constructor(ctx){this.ctx=ctx}}};
 const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/cordis'?cordis:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{DropOverlay:empty,AttachmentRail:empty,ImageGallery:empty}:fake;
 const rt=window.runtimeDescriptor.factory(modules),native=window.conversationDescriptor.factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id));
 const nativeModule=descriptor=>descriptor.factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id)),commands=nativeModule(window.commandsDescriptor),triggers=nativeModule(window.triggersDescriptor),delivery=nativeModule(window.deliveryDescriptor);
 const disposers=[],ctx={get:()=>undefined,reflect:{provide(){}},effect(start){const stop=start();if(typeof stop==='function')disposers.push(stop);return stop??(()=>{})}};
 const events=new rt.ConversationEventRegistry(ctx),viewRegistry=new rt.ConversationViewRegistry(ctx);native.__register({...ctx,conversationEvents:events,conversationViews:viewRegistry});
 let deliverySlot;delivery.apply({...ctx,provide(){},get:name=>name==='connection'?{isLoopback:true}:name==='workspaces'?{openPath:async()=>{}}:undefined,conversationEvents:events,locale:{register:()=>()=>{},bind:()=>key=>key},slots:{inject:(_name,install)=>install(),register:(entry,Component)=>{deliverySlot={...entry,Component};return()=>{}}}});
 const sessionsRuntime=new rt.SessionRuntime(ctx,{sessions:{}},{},{events,views:viewRegistry}),session=sessionsRuntime.manager.get('demo');session.openState='open';session.installWindow([],false);
 const store=initial=>{let value=initial;const listeners=new Set();return{getSnapshot:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},update:patch=>{value={...value,...patch};listeners.forEach(fn=>fn())}}};
 const view=store({view:'chat',draft:'',selection:null}),summary=store({byId:{demo:{id:'demo',displayTitle:'公司风格演示示例',cwd:window.cwd,blank:true}}}),projections=store({todos:null});
 const inputTriggers={adjudicate:async()=>undefined,serializeReference:(source,ref,signal)=>source==='chat-file'?native.chatFileReferenceCodec.serialize(ref,signal):Promise.resolve('/'+JSON.parse(ref).invocationName)};const shell=new native.SessionInputShell({actx:{},inputTriggers:()=>inputTriggers,defaultSink:async text=>{const before=shell.snapshot;await window.nativeBackend({action:'send',text});shell.commitSend(before.imageIds,before.draft)}}),inputHub={shell:()=>shell};
 const use=store=>select=>select(React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot)),useSession=use({subscribe:fn=>session.subscribe(fn),getSnapshot:()=>session.getSnapshot()}),useInput=use(shell.state),useStore=use(view),useSessions=use(summary),useProjection=name=>use(projections)(s=>s[name]);
 const views={subscribe:()=>()=>{},version:()=>0,list:()=>[{id:'chat',label:'对话'}]},actions={setView:value=>view.update({view:value}),setDraft:draft=>view.update({draft}),select(){},setResearchRightTab(){},setResearchConversationUnread(){}};
 const t=(key,args)=>key==='todo.progress.total'?args.done+'/'+args.total:({'hero.headline':'探索更远，洞见更深。','input.send':'发送消息','input.commands':'命令','command.skills.name':'技能','command.skills.description':'选择在对话中使用的技能','input.placeholder':'描述你的任务…','todo.title':'任务清单'})[key]??key;
 const roster=rt.createSnapshotStore({open:false,hit:null,groups:[],highlight:null}),popup=new commands.PopupSelectController({consume:()=>false,focusComposer:()=>document.querySelector('textarea')?.focus()});let skillCommand,commandSelection;
 const toggleCommands=selection=>{commandSelection=selection;roster.set({open:true,hit:{trigger:'/'},groups:[{source:'command',status:'ready',items:[{name:'skills'}]}],highlight:null})};
 const chooseCommand=()=>{roster.set({...roster.getSnapshot(),open:false});commands.CommandUiRuntime.prototype.openPopup.call({scopeFor:()=>({}),popupFor:()=>popup},'skills',skillCommand.ui,{sessionId:'demo'},{via:'menu',span:{...commandSelection,draftRev:shell.snapshot.draftRev}})};
 function SkillMenus(){return <div style={{position:'fixed',top:120,left:40,zIndex:1000,background:'white'}}><triggers.__Menu menu={roster} onPick={chooseCommand} onHighlight={()=>{}} onDismiss={()=>roster.set({...roster.getSnapshot(),open:false})} t={t}/><commands.__Popup popup={popup} t={t}/></div>}
 const renderSlotChain=(name,owner)=>{if(name!=='conversation.chat.turnTail')return null;const matched=deliverySlot.select(owner);return matched===null?null:<deliverySlot.Component {...owner} {...deliverySlot.inject()} matched={matched} useHostDescription={select=>select({canOpenPath:true})}/>};
 const shared={sessionId:'demo',useSession,useSessions,useStore,actions,views,t},inputProps={resolveSubmitMode:()=> 'queue',useSession,useInput,inputActions:shell.actions,keyboard:shell,useNotices:select=>select(null),useLexicon:select=>select(new Map()),useMenuLauncher:select=>select(null),useProjection,sessionId:'demo',t};
 const sidebarState={composerHost:null,conversationHost:null},sidebarStore={subscribe:()=>()=>{},getSnapshot:()=>sidebarState},sidebar={storeFor:()=>sidebarStore,publish(){},enter(){},leave(){},service:{async openFile(scope,path){window.probe.opened.push({scope,path});await window.nativeBackend({action:'verify-file',path});document.querySelector('#right').textContent='人工智能周期与资产配置.pptx · 原生文件路径已校验'}}};
 const openFile=path=>sidebar.service.openFile({sessionId:'demo',cwd:window.cwd},path),renderSlot=(name,props={},scope={})=>name==='conversation.session.header'?<native.__header {...shared} renderSlot={renderSlot} open={()=>{}} rename={async()=>{}}/>:name==='conversation.session'?<native.ConversationSession {...shared} {...props} useInput={useInput} inputActions={shell.actions} renderSlot={renderSlot} bindDraftMirror={()=>()=>{}} releaseSessionImages={()=>{}} releaseResearchWorkspace={()=>{}}/>:name==='conversation.composer.bar'?<native.__InputBar {...inputProps} {...props} renderSlot={()=>null}/>:name==='conversation.input.dock'?<native.__Todo useSession={useSession} useProjection={useProjection} t={t}/>:name==='conversation.view'?<native.__Chat {...shared} {...props} renderSlot={renderSlot} openFile={openFile} loadOlder={async()=>{}} loadImage={async()=>null} inspectCall={()=>{}} chatScroll={{read:()=>null,save(){}}} forkAt={()=>{}} fileMentions={()=>[]}/>:name==='conversation.chat.node'&&scope.entryKey==='user'?<native.__User {...props} t={t}/>:name==='conversation.chat.node'&&scope.entryKey==='assistant-step'?<native.__Assistant {...props} useTurnData={()=>null} t={t}/>:name==='conversation.chat.node'&&scope.entryKey==='turn-tail'?<native.__Tail {...props} sessionId="demo" useSession={useSession} renderSlot={renderSlot} renderSlotChain={renderSlotChain} t={t}/>:scope.fallback??null;
 window.probe={native,shell,session,opened:[],cues:[],guide:null,events:[],refresh:async()=>{const data=await window.nativeBackend({action:'history'});window.probe.events=data.events;session.blankBit=!data.events.some(e=>e.type==='user/message');session.installWindow(data.events.map(event=>({event,view:event.type})),false);projections.update({todos:data.events.findLast(e=>e.type==='todo/write')?.data.todos??null})}};
 native.__bind({inputHub,researchSidebar:sidebar,getHomeGuideSession:id=>window.probe.registered===false?undefined:{kind:'ppt',sessionId:id,cwd:window.cwd}});
 const skill={id:'builtin:efund-ppt-maker',revision:1,label:'efund-ppt-maker',invocationName:'ework-skill-180a6a3f86f8942e',name:'PPT制作助手',enabled:true,usable:true};
 const request=async input=>input.type==='snapshot'?{type:'snapshot',snapshot:{rows:[{...skill,kind:'skill',description:'公司规范'}]}}:{...skill,type:'skill-detail',invocationLabel:skill.label};
 const skillUse=createSkillUseBridge(document,{request},()=>{}),skillBridge=installSkillCommandBridge(document,{request,useSkill:skillUse.useSkill}),skillComposer=installSkillComposer({document,inputHub,sessions:{list:{getSnapshot:()=>({current:'demo'})},binding:()=>({session:{getSnapshot:()=>({})}}),subagentAddress:()=>undefined},composerBlocks:{storeFor:()=>({getSnapshot:()=>undefined})},researchSidebar:{stores:new Map(),service:sidebar.service}});
 disposers.push(installSkillCommand({document,command:{register:definition=>{skillCommand=definition;return()=>{}}},sessions:{subagentAddress:()=>undefined}}));inputProps.toggleCommandMenu=toggleCommands;
 disposers.push(()=>{skillBridge.dispose();skillUse.dispose();skillComposer()});

 const registry=new native.ResearchWorkspaceRegistry({getItem:()=>null,setItem:()=>true}),root=createRoot(document.querySelector('#native-root'));
 root.render(<><native.ConversationRoot {...shared} useProjection={useProjection} useInput={useInput} useComposerBlock={()=>undefined} renderSlot={renderSlot} renderSlotChain={(_name,_props,{fallback})=>fallback} selectWorkspace={async()=>{throw Error('Must not create another workspace')}} useWorkspaces={select=>select({phase:'ready',items:[{workspaceId:'w',title:'示例',sessionIds:['demo']}]})} researchWorkspaces={registry} researchSidebar={sidebar} setResearchActive={()=>{}}/><SkillMenus/></>);
 window.addEventListener('sherlock:home-guide-cue',event=>{const raw=event.detail,cue=typeof raw.targetToken==='string'?JSON.parse(JSON.stringify(raw)):raw,target=typeof cue.targetToken==='string'?[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===cue.targetToken):cue.target;window.probe.cues.push({label:cue.label,tag:target?.tagName,requestId:cue.requestId,action:cue.action,targetToken:cue.targetToken,keys:Object.keys(raw).sort(),jsonOnly:Object.values(raw).every(value=>typeof value==='string'),payload:cue.targetToken?cue:null,tokenPresent:!!cue.targetToken&&target?.getAttribute('data-home-guide-cue-target')===cue.targetToken,filePath:target?.closest('.ew-delivery-card')?.dataset.filePath,skillOption:target?.closest('[data-ework-command="skills"]')?target.textContent:null});if(window.probe.autoAck!==false&&cue.requestId)window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:!!target?.isConnected}}))});
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
 const f=await presentationHostFixture(),page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',e=>errors.push(e.stack??e.message))
 const backend=async input=>{
  if(input.action==='history')return{events:f.agent.session.events}
  if(input.action==='send'){await f.prompt(input.text);return{ok:true}}
  if(input.action==='verify-file'){expect(await readFile(input.path)).toEqual(f.bytes);return{ok:true}}
  return f.command(input.action,input)
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
 await page.addScriptTag({content:commandsSource});await page.evaluate(()=>window.commandsDescriptor=window.descriptor)
 await page.addScriptTag({content:triggersSource});await page.evaluate(()=>window.triggersDescriptor=window.descriptor)
 await page.addScriptTag({content:deliverySource});await page.evaluate(()=>window.deliveryDescriptor=window.descriptor)
 const styles=(await Promise.all(['figma-final-shell','figma-home','figma-panels','figma-reading'].map(n=>readFile('src/preload/'+n+'.css','utf8')))).join('\n')
 await page.addStyleTag({content:styles+'\nhtml,body{margin:0;height:100%;font-family:system-ui}.pI_x6G_centerCol{position:relative;height:100vh;width:1000px}#native-root{height:100%}[data-home-guide]{position:absolute;inset:0;pointer-events:none}#right{position:fixed;left:1000px;top:60px;width:350px;padding:15px}.wSkVaW_root{height:100%}'})
 await page.addScriptTag({content:entry});await page.waitForSelector('textarea',{timeout:4000}).catch(async error=>{throw Error(JSON.stringify({errors,body:await page.locator('body').innerText()})+' '+error.message)})
 await page.evaluate(()=>window.probe.original=document.querySelector('textarea'))
 return{...f,page,errors,close:async()=>{await page.evaluate(()=>window.probe.unmount()).catch(()=>{});await page.close();await f.dispose()}}
}
it('waits for the real pointer acknowledgement and never adds attachments after pause or cancellation',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1';window.probe.autoAck=false})
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true))
  await page.evaluate(()=>{window.probe.pending=window.probe.step('brief').then(()=>true,()=>false)})
  await expect.poll(()=>page.evaluate(()=>window.probe.cues.length)).toBe(1)
  const cue=await page.evaluate(()=>window.probe.cues[0]);expect(cue.requestId).toBeTruthy();expect(cue.action).toBe('click')
  expect(cue.jsonOnly).toBe(true);expect(cue.tokenPresent).toBe(true);expect(cue.keys).toEqual(['action','label','requestId','runId','targetToken'])
  expect(cue.targetToken).toBe(`run-1:${cue.requestId}:target`)
  expect(cue.payload).toEqual({runId:'run-1',requestId:cue.requestId,label:cue.label,action:'click',targetToken:cue.targetToken})
  expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences.length)).toBe(0)
  await page.evaluate(()=>{const cue=window.probe.cues[0];for(const detail of [{runId:'other-run',requestId:cue.requestId},{runId:'run-1',requestId:'other-request'}])window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{...detail,ok:true}}))})
  expect(await page.locator('textarea').getAttribute('data-home-guide-cue-target')).toBe(cue.targetToken)
  await page.evaluate(()=>{window.probe.play(false);const cue=window.probe.cues[0];window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:'run-1',requestId:cue.requestId,ok:true}}))})
  await page.waitForTimeout(150);expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences.length)).toBe(0)
  expect(await page.locator('textarea').getAttribute('data-home-guide-cue-target')).toBeNull()
  await page.evaluate(()=>window.probe.dispose());expect(await page.evaluate(()=>window.probe.pending)).toBe(false)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences.length)).toBe(0);expect(f.outside).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('cleans a pending token on cancellation before the pointer can acknowledge',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1';window.probe.autoAck=false})
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true))
  await page.evaluate(()=>{window.probe.pending=window.probe.step('brief').then(()=>true,()=>false)})
  await expect.poll(()=>page.evaluate(()=>window.probe.cues.length)).toBe(1)
  const cue=await page.evaluate(()=>window.probe.cues[0]);expect(cue.targetToken).toBe(`run-1:${cue.requestId}:target`)
  expect(await page.locator('textarea').getAttribute('data-home-guide-cue-target')).toBe(cue.targetToken)
  await page.evaluate(()=>window.probe.dispose());expect(await page.evaluate(()=>window.probe.pending)).toBe(false)
  expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences.length)).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it.each([false,true])('cleans a failed acknowledgement without removing another token (replaced=%s)',async replaced=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1';window.probe.autoAck=false})
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true))
  await page.evaluate(()=>{window.probe.pending=window.probe.step('brief').then(()=>true,()=>false)})
  await expect.poll(()=>page.evaluate(()=>window.probe.cues.length)).toBe(1)
  const cue=await page.evaluate(()=>window.probe.cues[0]);expect(cue.tokenPresent).toBe(true)
  await page.evaluate(replaced=>{if(replaced)document.querySelector('textarea').setAttribute('data-home-guide-cue-target','other-run:other-request:target');const cue=window.probe.cues[0];window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:'run-1',requestId:cue.requestId,ok:false,message:'目标不可用'}}))},replaced)
  expect(await page.evaluate(()=>window.probe.pending)).toBe(false)
  expect(await page.locator('textarea').getAttribute('data-home-guide-cue-target')).toBe(replaced?'other-run:other-request:target':null)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences.length)).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('cleans the token if dispatch fails before any pointer reply',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1';const dispatch=window.dispatchEvent;window.dispatchEvent=function(event){if(event.type==='sherlock:home-guide-cue')throw Error('cue dispatch failed');return dispatch.call(this,event)}})
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true))
  expect(await page.evaluate(()=>window.probe.step('brief').then(()=>true,()=>false))).toBe(false)
  expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences.length)).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('retains the DOM cue only for a standalone fixture without the real pointer marker',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true))
  await page.evaluate(()=>{window.probe.pending=window.probe.step('brief').then(()=>true,()=>false)})
  await expect.poll(()=>page.evaluate(()=>window.probe.cues.length)).toBe(1)
  const cue=await page.evaluate(()=>window.probe.cues[0]);expect(cue.tag).toBe('TEXTAREA');expect(cue.keys).toContain('target');expect(cue.targetToken).toBeUndefined()
  expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0)
  await page.evaluate(()=>window.probe.dispose());expect(await page.evaluate(()=>window.probe.pending)).toBe(false);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('preserves a concurrent user draft while the first pointer acknowledgement is pending',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1';window.probe.autoAck=false})
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true))
  await page.evaluate(()=>{window.probe.pending=window.probe.step('brief').then(()=>true,()=>false)})
  await expect.poll(()=>page.evaluate(()=>window.probe.cues.length)).toBe(1)
  await page.evaluate(()=>{window.probe.shell.setDraft('保留用户刚输入的内容');const cue=window.probe.cues[0];window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:'run-1',requestId:cue.requestId,ok:true}}))})
  await page.waitForTimeout(100);expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences.length)).toBe(0)
  expect(await page.evaluate(()=>window.probe.pending)).toBe(false)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe('保留用户刚输入的内容')
 }finally{await f.close()}
},15000)
it.each(['disabled','disconnected','offscreen'])('rejects a %s real input after pointer acknowledgement without a late attachment',async change=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1';window.probe.autoAck=false})
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true))
  await page.evaluate(()=>{window.probe.pending=window.probe.step('brief').then(()=>true,()=>false)})
  await expect.poll(()=>page.evaluate(()=>window.probe.cues.length)).toBe(1)
  await page.evaluate(change=>{const input=document.querySelector('textarea');if(change==='disabled')input.disabled=true;else if(change==='disconnected')input.remove();else input.style.transform='translateY(-3000px)';const cue=window.probe.cues[0];window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:'run-1',requestId:cue.requestId,ok:true}}))},change)
  await page.waitForTimeout(100);expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences.length)).toBe(0)
  expect(await page.evaluate(()=>window.probe.pending)).toBe(false)
  expect(f.agent.session.events.some(event=>event.type==='user/message')).toBe(false)
 }finally{await f.close()}
},15000)
it('types and sends through the resident native InputBar, renders persisted chat/tasks and opens the ordinary workspace file',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1'})
  await page.evaluate(()=>window.probe.mount());expect(await page.locator('textarea').count()).toBe(1)
  await page.evaluate(()=>window.probe.play(true));await page.evaluate(()=>window.probe.step('brief'))
  expect(await page.locator('textarea').inputValue()).toContain('帮我把这份研报整理成一份公司风格的汇报PPT，20页左右')
  expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences.map(ref=>ref.source))).toEqual(['ework-managed-skill','chat-file'])
  expect(await page.locator('[data-reference-source="chat-file"]').count()).toBe(1)
  expect(await page.locator('[data-reference-source="ework-managed-skill"]').count()).toBe(1)
  expect(await readFile(join(f.cwd,'Vanguard-2026经济与市场展望.pdf'))).toEqual(f.sourceBytes)
  await page.screenshot({path:evidence+'/01-native-brief.png'})
  await page.evaluate(()=>window.probe.step('send')).catch(async error=>{throw Error(JSON.stringify({errors:f.errors,pageErrors:f.errors,snapshot:await page.evaluate(()=>window.probe.shell.snapshot),events:f.agent.session.events},null,2)+error.message)});await page.evaluate(()=>window.probe.step('plan'))
  await page.waitForSelector('[data-testid="todo-panel"]',{timeout:3000}).catch(async error=>{throw Error(JSON.stringify({pageErrors:f.errors,body:await page.locator('body').innerText(),events:f.agent.session.events.map(e=>e.type)},null,2)+error.message)});expect(await page.locator('[data-status="in_progress"]').count()).toBe(1)
  await page.evaluate(()=>window.probe.step('layout'));await page.screenshot({path:evidence+'/02-native-plan.png'})
  await page.evaluate(()=>window.probe.step('deliver'));await f.agent.whenIdle();await page.evaluate(()=>window.probe.refresh())
  expect(await page.locator('[data-status="completed"]').count()).toBe(3)
  expect(await page.locator('[data-chat-flow-kind="user"]').count()).toBe(1)
  expect(await page.locator('[data-chat-flow-kind="assistant-step"]').count()).toBeGreaterThan(0)
  await page.evaluate(()=>{window.probe.deliveryCard=[...document.querySelectorAll('.ew-delivery-card[data-file-path]')].find(card=>card.dataset.filePath.endsWith('.pptx'));window.probe.deliveryPath=window.probe.deliveryCard.dataset.filePath;window.probe.deliveryCard.dataset.filePath='/another-session/人工智能周期与资产配置.pptx';window.probe.pendingOpen=window.probe.step('open')})
  await page.waitForTimeout(150);expect(await page.evaluate(()=>window.probe.opened.length)).toBe(0)
  await page.evaluate(()=>{window.probe.deliveryCard.dataset.filePath=window.probe.deliveryPath});await page.evaluate(()=>window.probe.pendingOpen)
  expect(await page.evaluate(()=>window.probe.opened.length)).toBe(1)
  expect(await page.evaluate(()=>window.probe.opened[0].path)).toBe(join(f.cwd,'人工智能周期与资产配置.pptx'))
  await expect.poll(()=>page.locator('#right').textContent()).toContain('人工智能周期与资产配置.pptx')
  expect(await page.evaluate(()=>window.probe.cues.at(-1).filePath)).toBe(join(f.cwd,'人工智能周期与资产配置.pptx'))
  expect(await page.evaluate(()=>window.probe.cues.some(cue=>cue.skillOption?.includes('PPT制作助手')))).toBe(true)
  expect(await page.evaluate(()=>new Set(window.probe.cues.map(cue=>cue.requestId)).size===window.probe.cues.length)).toBe(true)
  expect(await page.evaluate(()=>window.probe.cues.every(cue=>cue.jsonOnly&&cue.tokenPresent&&cue.targetToken==='run-1:'+cue.requestId+':target'))).toBe(true)
  expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0)
  expect(await page.evaluate(()=>window.probe.original===document.querySelector('textarea'))).toBe(true)
  expect(await page.evaluate(()=>window.probe.cues.map(c=>c.label))).toEqual(expect.arrayContaining(['添加原始研报 PDF','选择公司 PPT 制作技能','填写研报转换要求','发送演示需求','打开可编辑文件']))
  await page.screenshot({path:evidence+'/03-native-delivery.png'})
  await page.evaluate(()=>window.probe.dispose());await f.ctx.sessions.flush(f.agent.session)
  expect((await f.ctx.sessionPersistence.inspect('demo')).events.some(e=>e.type==='assistant/message')).toBe(true)
  expect(await readFile(join(f.cwd,'人工智能周期与资产配置.pptx'))).toEqual(f.bytes);expect(f.outside).toEqual([]);expect(f.errors).toEqual([])
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
