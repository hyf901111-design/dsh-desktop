import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {join,resolve} from 'node:path'
import {homeGuidePlaybackFixture} from './fixtures/home-guide-playback.js'
import {patchDshFileDropClientSource} from '../src/main/state/dsh-file-drop-compat'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {presentationHostFixture} from './fixtures/home-presentation-host.js'
import {reportRuntimeFixture} from './fixtures/home-report-runtime.js'
import {createUserMessage} from '@deepseek-ai/dsh-llm'
import {HOME_REPORT_PATH,HOME_REPORT_SKILL_ID} from '../packages/dsh-research-task-runtime/home-report-contract.js'
import {patchHomeGuidePresentationNative} from '../scripts/lib/home-guide-presentation-native.mjs'
import {patchDeliverableCards} from '../scripts/lib/deliverable-cards.mjs'
const evidence=process.env.SHERLOCK_TEST_DEMO_OUTPUT_EVIDENCE||'/tmp/home-demo-output-input-20261026'
let browser,entry,conversationSource,runtimeSource,commandsSource,triggersSource,deliverySource,fileDropSource
beforeAll(async()=>{
 runtimeSource=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 conversationSource=patchHomeGuidePresentationNative(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.__InputBar=InputBar;exports.__Chat=ChatView;exports.__Todo=TodoDock;exports.__User=UserMessageNodeView;exports.__Assistant=AssistantNodeView;exports.__Tail=TurnTailNodeView;exports.__register=registerConversationNodes;exports.__header=ConversationSessionHeader;exports.__bind=deps=>{HomePresentationNativeDeps=deps};')
 commandsSource=(await readFile('node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.__Popup=PopupSelectView;')
 triggersSource=(await readFile('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.__Menu=MenuView;')
 deliverySource=patchDeliverableCards(await readFile('node_modules/@deepseek-ai/dsh-client-ui-deliverables/lib/client.js','utf8'))
 fileDropSource=patchDshFileDropClientSource(await readFile('test/fixtures/dsh-file-drop-1.0.0-client.js','utf8'));if(!fileDropSource)throw Error('Actual file-drop fixture drifted')
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{MarkdownText}from'@deepseek-ai/dsh-client-ui-primitives';import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot}from'react-dom/client';import{mountHomePresentationGuide}from'./src/preload/home-guide-presentation';import{mountHomeGuides,playHomeGuideFromOperations}from'./src/preload/home-guides';import{mountHomeOperations}from'./src/preload/home-operations';import{createHomeGuidePointer}from'./src/preload/home-guide-pointer';import{installSkillComposer}from'./src/preload/integrations/skill-composer';import{createSkillUseBridge}from'./src/preload/integrations/skill-use';import{installSkillCommandBridge}from'./src/preload/integrations/skill-command-bridge';import{installSkillCommand}from'./src/preload/integrations/skill-command';
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});const empty=()=>null;
 const primitives=new Proxy({useAnchoredMaxHeight:()=>400,Tooltip:({children})=>children,MarkdownText,Markdown:({text})=><MarkdownText text={text}/>},{get:(target,key)=>target[key]??empty});
 const cordis={Service:class{constructor(ctx){this.ctx=ctx}}};
 const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/cordis'?cordis:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{DropOverlay:empty,AttachmentRail:empty,ImageGallery:empty}:fake;
 const sessionId=window.actorKind==='report'?'report-demo':'demo';
 const rt=window.runtimeDescriptor.factory(modules),native=window.conversationDescriptor.factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id));
 const nativeModule=descriptor=>descriptor.factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id)),commands=nativeModule(window.commandsDescriptor),triggers=nativeModule(window.triggersDescriptor),delivery=nativeModule(window.deliveryDescriptor),fileDrop=nativeModule(window.fileDropDescriptor);
 const disposers=[],ctx={get:()=>undefined,reflect:{provide(){}},effect(start){const stop=start();if(typeof stop==='function')disposers.push(stop);return stop??(()=>{})}};
 let filePickSlot;fileDrop.apply({...ctx,slots:{inject:(_name,install)=>install(),register:(entry,Component)=>{if(entry.name==='conversation.input.left')filePickSlot=Component;return()=>{}}}});
 const events=new rt.ConversationEventRegistry(ctx),viewRegistry=new rt.ConversationViewRegistry(ctx);native.__register({...ctx,conversationEvents:events,conversationViews:viewRegistry});
 let deliverySlot;delivery.apply({...ctx,provide(){},get:name=>name==='connection'?{isLoopback:true}:name==='workspaces'?{openPath:async()=>{}}:undefined,conversationEvents:events,locale:{register:()=>()=>{},bind:()=>key=>key},slots:{inject:(_name,install)=>install(),register:(entry,Component)=>{deliverySlot={...entry,Component};return()=>{}}}});
 const sessionsRuntime=new rt.SessionRuntime(ctx,{sessions:{}},{},{events,views:viewRegistry}),session=sessionsRuntime.manager.get(sessionId);session.openState='open';session.installWindow([],false);
 const store=initial=>{let value=initial;const listeners=new Set();return{getSnapshot:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},update:patch=>{value={...value,...patch};listeners.forEach(fn=>fn())}}};
 const view=store({view:'chat',draft:'',selection:null}),summary=store({byId:{[sessionId]:{id:sessionId,displayTitle:'公司风格演示示例',cwd:window.cwd,blank:true}}}),projections=store({todos:null});
 const referenceSources=[{name:'chat-file',codec:native.chatFileReferenceCodec}];const inputTriggers={track(){},arbitrate:()=> 'pass',onSpace:()=>false,adjudicate:async()=>undefined,serializeReference:async(source,ref,signal)=>{const value=await triggers.InputTriggerController.prototype.serializeReference.call({deps:{roster:{all:()=>referenceSources}}},source,ref,signal);window.probe.serializations.push({source,ref,value});return value}};const shell=new native.SessionInputShell({actx:{},inputTriggers:()=>inputTriggers,defaultSink:async text=>{const before=shell.snapshot;await window.nativeBackend({action:'send',text});shell.commitSend(before.imageIds,before.draft)}}),inputHub=new native.InputHub(ctx,(...args)=>t(...args));inputHub.shells.set(sessionId,shell);
 const conversation=new native.ConversationController(ctx,{input:inputHub,blocks:{}});
 const use=store=>select=>select(React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot)),useSession=use({subscribe:fn=>session.subscribe(fn),getSnapshot:()=>session.getSnapshot()}),useInput=use(shell.state),useStore=use(view),useSessions=use(summary),useProjection=name=>use(projections)(s=>s[name]);
 const views={subscribe:()=>()=>{},version:()=>0,list:()=>[{id:'chat',label:'对话'},{id:'notes',label:'笔记'},{id:'research',label:'研究'}]},actions={setView:value=>view.update({view:value}),setDraft:draft=>view.update({draft}),select(){},setResearchRightTab(){},setResearchConversationUnread(){}};
 const t=(key,args)=>key==='todo.progress.total'?args.done+'/'+args.total:({'hero.headline':'探索更远，洞见更深。','input.send':'发送消息','input.commands':'命令','command.skills.name':'技能','command.skills.description':'选择在对话中使用的技能','input.placeholder':'描述你的任务…','todo.title':'任务清单'})[key]??key;
 const roster=rt.createSnapshotStore({open:false,hit:null,groups:[],highlight:null}),popup=new commands.PopupSelectController({consume:()=>false,focusComposer:()=>document.querySelector('textarea')?.focus()});let skillCommand,commandSelection;
 const toggleCommands=selection=>{commandSelection=selection;roster.set({open:true,hit:{trigger:'/'},groups:[{source:'command',status:'ready',items:[{name:'skills'}]}],highlight:null})};
 const chooseCommand=()=>{roster.set({...roster.getSnapshot(),open:false});commands.CommandUiRuntime.prototype.openPopup.call({scopeFor:()=>({}),popupFor:()=>popup},'skills',skillCommand.ui,{sessionId:sessionId},{via:'menu',span:{...commandSelection,draftRev:shell.snapshot.draftRev}})};
 function SkillMenus(){return <div style={{position:'fixed',top:120,left:40,zIndex:1000,background:'white'}}><triggers.__Menu menu={roster} onPick={chooseCommand} onHighlight={()=>{}} onDismiss={()=>roster.set({...roster.getSnapshot(),open:false})} t={t}/><commands.__Popup popup={popup} t={t}/></div>}
 const renderSlotChain=(name,owner)=>{if(name!=='conversation.chat.turnTail')return null;const matched=deliverySlot.select(owner);return matched===null?null:<deliverySlot.Component {...owner} {...deliverySlot.inject()} matched={matched} useHostDescription={select=>select({canOpenPath:true})}/>};
 const shared={sessionId:sessionId,useSession,useSessions,useStore,actions,views,t},inputProps={resolveSubmitMode:()=> 'queue',useSession,useInput,inputActions:shell.actions,keyboard:shell,draftImages:ids=>conversation.draftImages(ids),useNotices:select=>select(null),useLexicon:select=>select(new Map()),useMenuLauncher:select=>select(null),useProjection,sessionId:sessionId,t};
 const sidebarState={composerHost:null,conversationHost:null},sidebarStore={subscribe:()=>()=>{},getSnapshot:()=>sidebarState},sidebar={storeFor:()=>sidebarStore,publish(){},enter(){},leave(){},service:{async openFile(scope,path){window.probe.opened.push({scope,path});await window.nativeBackend({action:'verify-file',path});document.querySelector('#right').textContent=path.split('/').pop()+' · 原生文件路径已校验'}}};
 const openFile=path=>sidebar.service.openFile({sessionId:sessionId,cwd:window.cwd},path),renderSlot=(name,props={},scope={})=>name==='conversation.session.header'?<native.__header {...shared} renderSlot={renderSlot} open={()=>{}} rename={async()=>{}}/>:name==='conversation.session'?<native.ConversationSession {...shared} {...props} useInput={useInput} inputActions={shell.actions} renderSlot={renderSlot} bindDraftMirror={()=>()=>{}} releaseSessionImages={()=>{}} releaseResearchWorkspace={()=>{}}/>:name==='conversation.composer.bar'?<native.__InputBar {...inputProps} {...props} renderSlot={renderSlot}/>:name==='conversation.input.left'?React.createElement(filePickSlot,props):name==='conversation.input.dock'?<native.__Todo useSession={useSession} useProjection={useProjection} t={t}/>:name==='conversation.view'?<native.__Chat {...shared} {...props} renderSlot={renderSlot} openFile={openFile} loadOlder={async()=>{}} loadImage={async()=>null} inspectCall={()=>{}} chatScroll={{read:()=>null,save(){}}} forkAt={()=>{}} fileMentions={()=>[]}/>:name==='conversation.chat.node'&&scope.entryKey==='user'?<native.__User {...props} t={t}/>:name==='conversation.chat.node'&&scope.entryKey==='assistant-step'?<native.__Assistant {...props} useTurnData={()=>null} t={t}/>:name==='conversation.chat.node'&&scope.entryKey==='turn-tail'?<native.__Tail {...props} sessionId={sessionId} useSession={useSession} renderSlot={renderSlot} renderSlotChain={renderSlotChain} t={t}/>:scope.fallback??null;
 window.probe={native,inputHub,conversation,shell,session,fileInsertions:[],serializations:[],drafts:[],stageTimings:[],requests:[],opened:[],cues:[],guide:null,events:[],refresh:async()=>{const data=await window.nativeBackend({action:'history'});window.probe.events=data.events.map(record=>record.event);session.blankBit=!window.probe.events.some(e=>e.type==='user/message');session.installWindow(data.events,false);projections.update({todos:window.probe.events.findLast(e=>e.type==='todo/write')?.data.todos??null})}};
 native.__bind({inputHub,researchSidebar:sidebar,getHomeGuideSession:id=>window.probe.registered===false?undefined:{kind:window.actorKind,sessionId:id,cwd:window.cwd}});
 const skill=window.actorKind==='report'?{id:'builtin:ework-equity-research',revision:1,label:'ework-equity-research',invocationName:'ework-skill-778d85796a6c426b',name:'公司研究报告助手',enabled:true,usable:true}:{id:'builtin:efund-ppt-maker',revision:1,label:'efund-ppt-maker',invocationName:'ework-skill-180a6a3f86f8942e',name:'PPT制作助手',enabled:true,usable:true};
 const request=async input=>{if(input.type==='snapshot'&&window.probe.deferSkills){window.probe.skillSnapshotPending=true;await new Promise(resolve=>{window.probe.releaseSkills=resolve})}return input.type==='snapshot'?{type:'snapshot',snapshot:{rows:[{...skill,invocationLabel:skill.label,kind:'skill',description:'公司规范'}]}}:{...skill,type:'skill-detail',invocationLabel:skill.label}};
 const skillUse=createSkillUseBridge(document,{request},()=>{}),skillBridge=installSkillCommandBridge(document,{request,useSkill:skillUse.useSkill}),skillComposer=installSkillComposer({document,inputHub,sessions:{list:{getSnapshot:()=>({current:sessionId})},binding:()=>({session:{getSnapshot:()=>({})}}),subagentAddress:()=>undefined},composerBlocks:{storeFor:()=>({getSnapshot:()=>undefined})},researchSidebar:{stores:new Map(),service:sidebar.service}});
 disposers.push(installSkillCommand({document,inputTriggers:{registerSource:source=>{referenceSources.push(source);return()=>referenceSources.splice(referenceSources.indexOf(source),1)}},command:{register:definition=>{skillCommand=definition;return()=>{}}},sessions:{subagentAddress:()=>undefined}}));inputProps.toggleCommandMenu=toggleCommands;
 disposers.push(()=>{skillBridge.dispose();skillUse.dispose();skillComposer()});

 const registry=new native.ResearchWorkspaceRegistry({getItem:()=>null,setItem:()=>true}),root=createRoot(document.querySelector('#native-root'));
 root.render(<><native.ConversationRoot {...shared} useProjection={useProjection} useInput={useInput} useComposerBlock={()=>undefined} renderSlot={renderSlot} renderSlotChain={(_name,_props,{fallback})=>fallback} selectWorkspace={async()=>{throw Error('Must not create another workspace')}} useWorkspaces={select=>select({phase:'ready',items:[{workspaceId:'w',title:'示例',sessionIds:[sessionId]}]})} researchWorkspaces={registry} researchSidebar={sidebar} setResearchActive={()=>{}}/><SkillMenus/></>);
 window.addEventListener('sherlock:home-guide-cue',event=>{const raw=event.detail,cue=typeof raw.targetToken==='string'?JSON.parse(JSON.stringify(raw)):raw,target=typeof cue.targetToken==='string'?[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===cue.targetToken):cue.target;window.probe.cues.push({sources:shell.snapshot.occurrences.map(ref=>ref.source),inputState:document.querySelector('.pI_x6G_centerCol').dataset.odysseyHomeOperationsState,inputInert:!!document.querySelector('.wSkVaW_composerHero')?.inert,isPaperclip:!!target?.matches('button.dsh-paperclip'),isInputDropTarget:target?.dataset.homeGuideFileDropTarget===cue.runId,label:cue.label,tag:target?.tagName,requestId:cue.requestId,action:cue.action,targetToken:cue.targetToken,fromTargetToken:cue.fromTargetToken,fromPresent:!!cue.fromTargetToken&&!!document.querySelector('[data-home-guide-drag-file]')?.matches('[data-home-guide-cue-target=\"'+cue.fromTargetToken+'\"]'),ghostText:document.querySelector('[data-home-guide-drag-file]')?.textContent,keys:Object.keys(raw).sort(),jsonOnly:Object.values(raw).every(value=>typeof value==='string'),payload:cue.targetToken?cue:null,tokenPresent:!!cue.targetToken&&target?.getAttribute('data-home-guide-cue-target')===cue.targetToken,filePath:target?.closest('.ew-delivery-card')?.dataset.filePath,skillOption:target?.closest('[data-ework-command="skills"]')?target.textContent:null});if(window.probe.holdAtCue===cue.label||window.probe.holdAtAction===cue.action||window.probe.holdAfterFile&&target?.tagName==='TEXTAREA'&&shell.snapshot.occurrences.some(ref=>ref.source==='chat-file'))window.probe.autoAck=false;if(window.operationsCase&&window.probe.pauseAtCue===cue.label)window.__testHomeGuideTimeline.pause();if(window.probe.autoAck!==false&&cue.requestId)window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:!!target?.isConnected}}))});
 let guideController,disposeOperations=()=>{};
 if(window.operationsCase){
  window.probe.autoAck=false;window.probe.entryFrames=[];
  const receive=event=>{const value=event.detail;window.dispatchEvent(new CustomEvent('sherlock:home-guide-session-reply',{detail:{requestId:value.requestId,ok:true,sessionId:sessionId,cwd:window.cwd,title:'公司风格演示示例',fresh:true}}))};window.addEventListener('sherlock:home-guide-session-request',receive);disposers.push(()=>window.removeEventListener('sherlock:home-guide-session-request',receive));
  guideController=mountHomeGuides(document,{mountNotes:async()=>{throw Error('PPT fixture cannot mount Notes')},mountPresentation:mountHomePresentationGuide});
  disposeOperations=mountHomeOperations(document,{onExample:async(kind,context)=>{let frame;const capture=()=>{const hero=document.querySelector('.wSkVaW_composerHero');window.probe.entryFrames.push({inert:hero?.inert,state:document.querySelector('.pI_x6G_centerCol').dataset.odysseyHomeOperationsState,y:hero?.getBoundingClientRect().y});frame=requestAnimationFrame(capture)};capture();try{await playHomeGuideFromOperations(guideController,kind,context)}finally{cancelAnimationFrame(frame)}}});
 }
 window.probe.performCue=async value=>{const find=token=>[...document.querySelectorAll('[data-home-guide-cue-target]')].find(node=>node.getAttribute('data-home-guide-cue-target')===token),pointer=createHomeGuidePointer(document,{runId:'run-1',signal:window.probe.controller.signal,wait:ms=>new Promise(r=>setTimeout(r,ms)),waitUntilPlaying:async()=>{while(!window.probe.playing||document.hidden){if(window.probe.controller.signal.aborted)throw new DOMException('已取消','AbortError');await new Promise(r=>setTimeout(r,25))}}});try{await pointer.perform({action:value.action,target:find(value.targetToken),fromTarget:value.fromTargetToken?find(value.fromTargetToken):undefined});window.probe.lastPointer={...pointer.snapshot()};window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:'run-1',requestId:value.requestId,ok:true}}))}finally{pointer.dispose()}};
 disposers.push(shell.state.subscribe(()=>{const draft=shell.snapshot.draft,edits=window.probe.drafts;if(edits.at(-1)?.draft!==draft)edits.push({draft,time:performance.now()})}));
 const insertFilePaths=shell.insertFilePaths.bind(shell);shell.insertFilePaths=paths=>{window.probe.fileInsertions.push([...paths]);return insertFilePaths(paths)};
 window.addEventListener('sherlock:home-guide-presentation-request',event=>window.probe.requests.push(JSON.parse(JSON.stringify(event.detail))));
 const timer=setInterval(()=>window.probe.refresh(),30);
 Object.assign(window.probe,{async mount(fresh=true){this.guide=await mountHomePresentationGuide(document,document.querySelector('#guide-host'),{signal:(this.controller=new AbortController()).signal,sessionId:sessionId,cwd:window.cwd,runId:'run-1',fresh,...(window.actorKind==='report'?{kind:'report'}:{})})},step:async step=>{window.probe.phase=step;window.probe.stageTimings.push({step,event:'start',time:performance.now()});try{const value=await window.probe.guide.runStep(step);window.probe.phase=step+':done';window.probe.stageTimings.push({step,event:'done',time:performance.now()});return value}catch(error){window.probe.phase=step+':error';throw error}},play(playing){this.playing=playing;window.dispatchEvent(new CustomEvent('sherlock:home-guide-playback',{detail:{sessionId:sessionId,runId:'run-1',playing}}))},dispose(){this.controller?.abort();this.guide?.dispose()},unmount(){disposeOperations();guideController?.dispose();clearInterval(timer);root.unmount();shell.dispose();disposers.reverse().forEach(fn=>fn())}});
 `},bundle:true,loader:{'.svg':'dataurl','.css':'empty'},platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"development"'},plugins:[homeGuidePlaybackFixture(),{name:'raw-css',setup(b){b.onResolve({filter:/\.css\?raw$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw-css'}));b.onLoad({filter:/.*/,namespace:'raw-css'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}}]})
 entry=output.outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())
async function fixture({operations=false,reducedMotion='reduce',kind='ppt',reportSchemaVersion=1}={}){
 const f=kind==='report'?await reportRuntimeFixture({schemaVersion:reportSchemaVersion}):await presentationHostFixture(),page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion}),errors=[]
 page.on('pageerror',e=>errors.push(e.stack??e.message))
 const sent=[],http=[];
 const backend=async input=>{
  if(input.action==='history')return f.request(f.api.sessions.history,{sessionId:f.agent.id,maxMessages:100})
  if(input.action==='send'){sent.push(input.text);if(kind==='report')f.agent.followup(createUserMessage({content:[{type:'text',text:input.text}],source:{kind:'user'}}));else await f.prompt(input.text);return{ok:true}}
  if(input.action==='verify-file'){expect(await readFile(input.path)).toEqual(kind==='report'?f.pdf:f.bytes);return{ok:true}}
  if(kind==='report'){const method={prepare:'prepare',playback:'playback',checkpoint:'checkpoint',dispose:'disposeRun'}[input.action];return{ok:true,...await f.runtime[method]({...f.input,...input})}}
  return f.command(input.action,input)
 }
 await page.exposeFunction('nativeBackend',backend)
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url())
  if(url.origin!=='https://presentation.local')return route.abort()
  if(['/sherlock/home-guide/presentation',HOME_REPORT_PATH].includes(url.pathname)){http.push({path:url.pathname,...route.request().postDataJSON()});try{return route.fulfill({contentType:'application/json',body:JSON.stringify(await backend(route.request().postDataJSON()))})}catch(error){return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,message:error.message})})}}
  return route.fulfill({contentType:url.pathname==='/'?'text/html':'application/json',body:url.pathname==='/'?'<meta charset="utf-8"><div class="pI_x6G_centerCol"><div id="native-root"></div>'+(!operations?'<section data-home-guide="run-1"><div id="guide-host"></div></section>':'')+'</div><aside id="right"></aside><script>window.__ModuleLoader__={load:d=>window.descriptor=d}</script>':'{}'})
 })
 await page.goto('https://presentation.local/');await page.evaluate(value=>{window.cwd=value.cwd;window.operationsCase=value.operations;window.actorKind=value.kind},{cwd:f.cwd,operations,kind})
 await page.addScriptTag({content:runtimeSource});await page.evaluate(()=>window.runtimeDescriptor=window.descriptor)
 await page.addScriptTag({content:conversationSource});await page.evaluate(()=>window.conversationDescriptor=window.descriptor)
 await page.addScriptTag({content:commandsSource});await page.evaluate(()=>window.commandsDescriptor=window.descriptor)
 await page.addScriptTag({content:triggersSource});await page.evaluate(()=>window.triggersDescriptor=window.descriptor)
 await page.addScriptTag({content:deliverySource});await page.evaluate(()=>window.deliveryDescriptor=window.descriptor)
 await page.addScriptTag({content:fileDropSource});await page.evaluate(()=>window.fileDropDescriptor=window.descriptor)
 const styles=(await Promise.all(['figma-final-shell','figma-home','figma-panels','figma-reading','figma-refinements','home-guides'].map(n=>readFile('src/preload/'+n+'.css','utf8')))).join('\n')
 await page.addStyleTag({content:styles+'\nhtml,body{margin:0;height:100%;font-family:system-ui}.pI_x6G_centerCol{position:relative;height:100vh;width:1000px}#native-root{height:100%}[data-home-guide]{position:absolute;inset:0;pointer-events:none}#right{position:fixed;left:1000px;top:60px;width:350px;padding:15px}.wSkVaW_root{height:100%}'})
 await page.addScriptTag({content:entry});await page.waitForSelector('textarea',{timeout:4000}).catch(async error=>{throw Error(JSON.stringify({errors,body:await page.locator('body').innerText()})+' '+error.message)})
 await page.evaluate(()=>window.probe.original=document.querySelector('textarea'))
 return{...f,page,errors,agentErrors:f.errors,sent,http,close:async()=>{await page.evaluate(()=>window.probe.unmount()).catch(()=>{});await page.close();await f.dispose()}}
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
it('serializes the native report skill plus exactly one space and brief, delivers real HTML/PDF and opens only PDF',async()=>{
 const f=await fixture({kind:'report'}),{page}=f
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1'})
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true));await page.evaluate(()=>window.probe.step('brief'))
  expect(await page.evaluate(()=>window.probe.inputHub instanceof window.probe.native.InputHub)).toBe(true)
  const before=await page.evaluate(()=>({refs:window.probe.shell.snapshot.occurrences,files:window.probe.fileInsertions,cues:window.probe.cues}))
  expect(before.files).toEqual([]);expect(before.refs.map(value=>value.source)).toEqual(['ework-managed-skill']);expect(JSON.parse(before.refs[0].ref).id).toBe(HOME_REPORT_SKILL_ID)
  expect(before.cues.some(value=>value.action==='drag'||value.isPaperclip)).toBe(false)
  const brief=f.message().slice(f.message().indexOf(' ')+1),typed=await page.evaluate(brief=>window.probe.drafts.filter(value=>value.draft.startsWith('\uFFFC ')&&value.draft.length>2&&brief.startsWith(value.draft.slice(2))),brief)
  expect(typed).toHaveLength(Math.ceil(brief.length/2));for(let i=1;i<typed.length;i++)expect(typed[i].time-typed[i-1].time).toBeGreaterThanOrEqual(110)
  await page.evaluate(()=>window.probe.step('send'));expect(f.sent).toEqual([f.message()])
  expect(await page.evaluate(()=>window.probe.serializations.map(value=>value.value))).toEqual(['/ework-skill-778d85796a6c426b'])
  for(const step of ['plan','layout','deliver'])await page.evaluate(step=>window.probe.step(step),step)
  await f.agent.whenIdle();await page.evaluate(()=>window.probe.refresh())
  const pdf=join(f.cwd,'公司研究报告.pdf'),html=join(f.cwd,'公司研究报告.html')
  await expect.poll(()=>page.locator('.ew-delivery-card[data-file-path]').evaluateAll(cards=>cards.map(card=>card.dataset.filePath))).toEqual([html,pdf])
  await page.evaluate(()=>window.probe.step('open'));expect(await page.evaluate(()=>window.probe.opened.map(value=>value.path))).toEqual([pdf])
  expect(await page.locator('#right').innerText()).toContain('公司研究报告.pdf');expect(f.http.every(value=>value.path===HOME_REPORT_PATH)).toBe(true)
  const users=f.agent.session.events.filter(event=>event.type==='user/message');expect(users).toHaveLength(1);expect(users[0].data.content.filter(block=>block.type==='text').map(block=>block.text).join('')).toBe(f.message())
  await page.screenshot({path:evidence+'/report-native-final-20261025.png'});await page.evaluate(()=>window.probe.dispose())
  expect(await page.evaluate(()=>window.probe.requests.every(value=>value.kind==='report'))).toBe(true)
  expect(await page.locator('[data-home-guide-cue-target],[data-home-guide-drag-file]').count()).toBe(0);expect(f.outside).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},45000)
it.each(['ppt','report'].flatMap(kind=>[
 {kind,boundary:'holding',mutation:'draft'},
 {kind,boundary:'send-ack',mutation:'draft'},
 {kind,boundary:'send-ack',mutation:'revision'},
 {kind,boundary:'holding',mutation:'image'},
 {kind,boundary:'send-ack',mutation:'image'},
 {kind,boundary:'send-ack',mutation:'file'}
]))('stops native auto-send for $kind after $mutation changes at $boundary',async({kind,boundary,mutation})=>{
 const f=await fixture({kind}),{page}=f
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1'})
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true));await page.evaluate(()=>window.probe.step('brief'))
  expect(await page.evaluate(()=>window.probe.inputHub.shells.get(window.actorKind==='report'?'report-demo':'demo')===window.probe.shell)).toBe(true)
  const admitted=await page.evaluate(()=>{const s=window.probe.shell.snapshot;return{draft:s.draft,draftRev:s.draftRev,occurrences:s.occurrences,imageIds:s.imageIds}})
  expect(admitted.occurrences.map(ref=>ref.source)).toEqual(kind==='report'?['ework-managed-skill']:['ework-managed-skill','chat-file'])
  if(boundary==='send-ack'){
   await page.evaluate(()=>{window.probe.holdAtCue='发送演示需求';window.probe.pending=window.probe.step('send').then(()=>true,error=>{window.probe.failure=error.message;return false})})
   await expect.poll(()=>page.evaluate(()=>window.probe.cues.at(-1)?.label)).toBe('发送演示需求')
   expect(f.sent).toEqual([])
  }
  const attachmentPath=join(f.cwd,'用户补充说明.txt');if(mutation==='file')await writeFile(attachmentPath,'用户自行补充的研究意见。')
  const changed=await page.evaluate(({mutation,attachmentPath})=>{
   const {shell,conversation}=window.probe,s=shell.snapshot
   if(mutation==='draft')shell.setDraft(s.draft+'\n这是用户后来写的新意见📈，请保留。')
   else if(mutation==='revision'){shell.setDraft(s.draft+'用户临时修改');shell.setDraft(s.draft)}
   else if(mutation==='file')shell.insertFilePaths([attachmentPath])
   else{
    const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN0cAAAAASUVORK5CYII='),char=>char.charCodeAt(0))
    const images=conversation.createDraftImages([new File([bytes],'用户新补充.png',{type:'image/png'})]);if(!shell.addImages(images.map(image=>image.id)))throw Error('Native image admission rejected')
   }
   const current=shell.snapshot;return{draft:current.draft,draftRev:current.draftRev,occurrences:current.occurrences,imageIds:current.imageIds,registry:conversation.draftImages(current.imageIds).map(image=>({kind:image.kind,name:image.file.name,type:image.file.type})),hasAttachments:Object.hasOwn(current,'attachments'),hasFilePaths:Object.hasOwn(current,'filePaths')}
  },{mutation,attachmentPath})
  if(mutation==='file')expect(changed.occurrences.slice(0,-1)).toEqual(admitted.occurrences)
  else expect(changed.occurrences).toEqual(admitted.occurrences)
  if(mutation==='image'){
   expect(changed.draft).toBe(admitted.draft);expect(changed.draftRev).toBe(admitted.draftRev);expect(changed.imageIds).toHaveLength(1)
   expect(changed.registry).toEqual([{kind:'image',name:'用户新补充.png',type:'image/png'}]);expect(changed.hasAttachments).toBe(false);expect(changed.hasFilePaths).toBe(false)
  }else{
   expect(changed.draftRev).toBeGreaterThan(admitted.draftRev)
   if(mutation==='revision')expect(changed.draft).toBe(admitted.draft)
   if(mutation==='file'){expect(changed.occurrences.at(-1)?.source).toBe('chat-file');expect(JSON.parse(changed.occurrences.at(-1).ref)).toEqual({path:attachmentPath,name:'用户补充说明.txt'})}
  }
  // Native skill chips use a display projection distinct from the canonical
  // placeholder. Compare the real rendered value across the rejected send.
  await expect.poll(()=>page.locator('textarea').inputValue()).toContain(changed.draft.replaceAll('\uFFFC','').trim())
  const changedDisplay=await page.locator('textarea').inputValue()
  if(boundary==='send-ack')await page.evaluate(()=>{const cue=window.probe.cues.at(-1);window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:'run-1',requestId:cue.requestId,ok:true}}))})
  else await page.evaluate(()=>{window.probe.pending=window.probe.step('send').then(()=>true,error=>{window.probe.failure=error.message;return false})})
  const completed=await page.evaluate(()=>window.probe.pending),after=await page.evaluate(()=>{const s=window.probe.shell.snapshot;return{draft:s.draft,draftRev:s.draftRev,occurrences:s.occurrences,imageIds:s.imageIds}})
  await writeFile(evidence+'/send-admission-'+kind+'-'+boundary+'-'+mutation+'.json',JSON.stringify({kind,boundary,mutation,admitted,changed,completed,after,sent:f.sent,failure:await page.evaluate(()=>window.probe.failure)},null,2))
  expect(completed).toBe(false);expect(f.sent).toEqual([]);expect(f.agent.session.events.some(event=>event.type==='user/message')).toBe(false)
  if(boundary==='holding')expect(await page.evaluate(()=>window.probe.cues.some(cue=>cue.label==='发送演示需求'))).toBe(false)
  expect(after).toEqual({draft:changed.draft,draftRev:changed.draftRev,occurrences:changed.occurrences,imageIds:changed.imageIds})
  expect(await page.locator('textarea').inputValue()).toBe(changedDisplay);expect(await page.locator('[data-home-guide-cue-target],[data-home-guide-drag-file]').count()).toBe(0)
  expect(f.outside).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it.each(['cancel','newer-draft'])('keeps report input intact on %s while a genuine pointer request is pending',async mode=>{
 const f=await fixture({kind:'report'}),{page}=f
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1';window.probe.autoAck=false})
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true))
  await page.evaluate(()=>{window.probe.pending=window.probe.step('brief').then(()=>true,error=>{window.probe.failure=error.message;return false})})
  await expect.poll(()=>page.evaluate(()=>window.probe.cues.length)).toBe(1)
  await page.locator('textarea').fill('用户后写的整体需求📈必须保留')
  if(mode==='cancel')await page.evaluate(()=>window.probe.dispose())
  await page.evaluate(()=>{const cue=window.probe.cues[0];window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:'run-1',requestId:cue.requestId,ok:true}}))})
  expect(await page.evaluate(()=>window.probe.pending)).toBe(false)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe('用户后写的整体需求📈必须保留')
  expect(await page.evaluate(()=>window.probe.fileInsertions)).toEqual([]);expect(f.sent).toEqual([])
  expect(await page.locator('[data-home-guide-cue-target],[data-home-guide-drag-file]').count()).toBe(0);expect(f.outside).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it('stops report typing at a newer real InputBar draft instead of replacing it on the next paced chunk',async()=>{
 const f=await fixture({kind:'report'}),{page}=f
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1'})
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true));await page.evaluate(()=>{window.probe.pending=window.probe.step('brief').then(()=>true,()=>false)})
  await expect.poll(()=>page.evaluate(()=>window.probe.shell.snapshot.draft.includes('帮我写一份')),{timeout:10000}).toBe(true)
  await page.locator('textarea').fill('整体要求改为用户刚写的这一版📈')
  expect(await page.evaluate(()=>window.probe.pending)).toBe(false)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe('整体要求改为用户刚写的这一版📈');expect(await page.evaluate(()=>window.probe.fileInsertions)).toEqual([]);expect(f.sent).toEqual([])
  expect(await page.locator('[data-home-guide-cue-target],[data-home-guide-drag-file]').count()).toBe(0);expect(f.outside).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it('moves the real PPT PDF ghost with the shared pointer before native insertFilePaths and cleans both JSON tokens',async()=>{
 const f=await fixture({reducedMotion:'no-preference'}),{page}=f
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1';window.probe.holdAtAction='drag'})
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true));await page.evaluate(()=>{window.probe.pending=window.probe.step('brief').then(()=>true,()=>false)})
  await expect.poll(()=>page.evaluate(()=>window.probe.cues.some(cue=>cue.action==='drag')),{timeout:10000}).toBe(true)
  const cue=await page.evaluate(()=>window.probe.cues.find(cue=>cue.action==='drag'))
  expect(cue.jsonOnly).toBe(true);expect(cue.fromPresent).toBe(true);expect(cue.keys).toEqual(['action','fromTargetToken','label','requestId','runId','targetToken']);expect(cue.fromTargetToken).toBe('run-1:'+cue.requestId+':from')
  expect(cue.ghostText).toContain('PDF');expect(cue.ghostText).toContain('Vanguard-2026经济与市场展望.pdf');expect(await page.evaluate(()=>window.probe.fileInsertions)).toEqual([])
  const before=await page.locator('[data-home-guide-drag-file]').boundingBox();expect(before.width).toBeGreaterThan(100);expect(before.height).toBeGreaterThan(25)
  await page.evaluate(cue=>{window.probe.holdAtAction=null;window.probe.autoAck=true;window.probe.holdAfterFile=true;window.probe.drag=window.probe.performCue(cue.payload)},cue)
  await page.waitForFunction(before=>{const el=document.querySelector('[data-home-guide-drag-file]');if(!el)return false;const r=el.getBoundingClientRect();return Math.abs(r.x-before.x)+Math.abs(r.y-before.y)>8},before)
  await page.screenshot({path:evidence+'/ppt-ghost-in-flight-20261025.png'})
  await page.evaluate(()=>window.probe.drag)
  const drop=await page.evaluate(()=>{const r=document.querySelector('textarea[data-odyssey-file-reference-session]').getBoundingClientRect(),p=window.probe.lastPointer;return{x:(p.x-r.left)/r.width,y:(p.y-r.top)/r.height}})
  expect(drop.x).toBeGreaterThan(.35);expect(drop.x).toBeLessThan(.75);expect(drop.y).toBeGreaterThan(.3);expect(drop.y).toBeLessThan(.8)
  await expect.poll(()=>page.evaluate(()=>window.probe.fileInsertions)).toEqual([[join(f.cwd,'Vanguard-2026经济与市场展望.pdf')]])
  expect(await page.locator('[data-home-guide-drag-file]').count()).toBe(0)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences.map(ref=>ref.source))).toEqual(['ework-managed-skill','chat-file'])
  expect(await page.evaluate(()=>window.probe.requests.every(value=>value.kind===undefined))).toBe(true)
  await page.evaluate(()=>window.probe.dispose());expect(await page.evaluate(()=>window.probe.pending)).toBe(false)
  expect(await page.locator('[data-home-guide-cue-target],[data-home-guide-pointer]').count()).toBe(0);expect(f.sent).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},25000)
it('cancels a pending PPT file drag without late insertion or losing a newer user draft',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1';window.probe.holdAtAction='drag'})
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true));await page.evaluate(()=>{window.probe.pending=window.probe.step('brief').then(()=>true,()=>false)})
  await expect.poll(()=>page.evaluate(()=>window.probe.cues.some(cue=>cue.action==='drag')),{timeout:10000}).toBe(true)
  const cue=await page.evaluate(()=>window.probe.cues.find(cue=>cue.action==='drag'))
  await page.locator('textarea').fill('用户刚写的新PPT要求');await page.evaluate(()=>window.probe.dispose())
  await page.evaluate(cue=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:'run-1',requestId:cue.requestId,ok:true}})),cue)
  expect(await page.evaluate(()=>window.probe.pending)).toBe(false);expect(await page.evaluate(()=>window.probe.fileInsertions)).toEqual([]);expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe('用户刚写的新PPT要求')
  expect(await page.locator('[data-home-guide-cue-target],[data-home-guide-drag-file]').count()).toBe(0);expect(f.sent).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
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
it.each(['paused','hidden'])('keeps focus unchanged when a deferred skill list resolves while %s',async state=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1';window.probe.deferSkills=true})
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true))
  await page.evaluate(()=>{window.probe.pending=window.probe.step('brief').then(()=>true,()=>false)})
  await expect.poll(()=>page.evaluate(()=>window.probe.skillSnapshotPending)).toBe(true)
  await page.evaluate(state=>{if(state==='paused')window.probe.play(false);else{Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.probe.hidden===true});window.probe.hidden=true;document.dispatchEvent(new Event('visibilitychange'))}const control=document.createElement('button');control.id='outside-guide-focus';control.textContent='other control';document.body.append(control);control.focus();window.probe.releaseSkills()},state)
  await page.waitForTimeout(120)
  expect(await page.evaluate(()=>document.activeElement.id)).toBe('outside-guide-focus')
  expect(await page.locator('[data-ework-command-menu-selection]').count()).toBe(0)
  await page.evaluate(state=>{window.probe.deferSkills=false;if(state==='paused')window.probe.play(true);else{window.probe.hidden=false;document.dispatchEvent(new Event('visibilitychange'))}},state)
  expect(await page.evaluate(()=>window.probe.pending)).toBe(true)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences.map(ref=>ref.source))).toEqual(['ework-managed-skill','chat-file'])
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},12000)
it.each(['把参考研报拖入输入框','填写研报转换要求'])('preserves a newer same-text draft revision while the %s pointer is pending',async label=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(label=>{document.documentElement.dataset.homeGuidePointerRun='run-1';window.probe.holdAtCue=label},label)
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true))
  await page.evaluate(()=>{window.probe.pending=window.probe.step('brief').then(()=>true,()=>false)})
  await expect.poll(()=>page.evaluate(label=>window.probe.cues.some(cue=>cue.label===label),label),{timeout:5000}).toBe(true)
  const before=await page.evaluate(()=>window.probe.shell.snapshot.draft)
  await page.evaluate(()=>{const value=window.probe.shell.snapshot.draft;window.probe.shell.setDraft(value+'user edit');window.probe.shell.setDraft(value);const cue=window.probe.cues.at(-1);window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:'run-1',requestId:cue.requestId,ok:true}}))})
  expect(await page.evaluate(()=>window.probe.pending)).toBe(false)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe(before)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences.map(ref=>ref.source))).toEqual(label==='把参考研报拖入输入框'?['ework-managed-skill']:['ework-managed-skill','chat-file'])
  expect(f.agent.session.events.some(event=>event.type==='user/message')).toBe(false)
  expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},12000)
it('types and sends through the resident native InputBar, renders persisted chat/tasks and opens the ordinary workspace file',async()=>{
 const f=await fixture(),{page}=f
 const started=Date.now()
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1'})
  await page.evaluate(()=>window.probe.mount());expect(await page.locator('textarea').count()).toBe(1)
  await page.evaluate(()=>window.probe.play(true));await page.evaluate(()=>window.probe.step('brief'))
  expect(await page.evaluate(()=>window.probe.cues.find(cue=>cue.skillOption)?.sources)).not.toContain('chat-file')
  expect(await page.evaluate(()=>window.probe.cues.find(cue=>cue.label==='把参考研报拖入输入框'))).toMatchObject({tag:'SPAN',isInputDropTarget:true,fromPresent:true,action:'drag',sources:['ework-managed-skill']})
  expect(await page.locator('textarea').inputValue()).toContain('帮我把这份研报整理成一份公司风格的汇报PPT，20页左右')
  expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences.map(ref=>ref.source))).toEqual(['ework-managed-skill','chat-file'])
  expect(await page.locator('[data-reference-source="chat-file"]').count()).toBe(1)
  expect(await page.locator('[data-reference-source="ework-managed-skill"]').count()).toBe(1)
  expect(await readFile(join(f.cwd,'Vanguard-2026经济与市场展望.pdf'))).toEqual(f.sourceBytes)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).not.toContain('\n')
  await page.screenshot({path:evidence+'/01-native-brief.png'})
  await page.evaluate(()=>window.probe.step('send')).catch(async error=>{throw Error(JSON.stringify({errors:f.errors,pageErrors:f.errors,snapshot:await page.evaluate(()=>window.probe.shell.snapshot),events:f.agent.session.events},null,2)+error.message)});expect(f.sent).toEqual([f.message()]);await page.evaluate(()=>window.probe.step('plan'))
  await page.waitForSelector('[data-testid="todo-panel"]',{timeout:3000}).catch(async error=>{throw Error(JSON.stringify({pageErrors:f.errors,body:await page.locator('body').innerText(),events:f.agent.session.events.map(e=>e.type)},null,2)+error.message)});expect(await page.locator('[data-status="in_progress"]').count()).toBe(1)
  await page.evaluate(()=>window.probe.step('layout'));await page.screenshot({path:evidence+'/02-native-plan.png'})
  await page.evaluate(()=>window.probe.step('deliver'));await f.agent.whenIdle();await page.evaluate(()=>window.probe.refresh())
  expect(f.ctx.tools.get('home_presentation_publish',f.agent.ctx)).toBeUndefined()
  const coldHistory=await f.request(f.api.sessions.history,{sessionId:f.agent.id,maxMessages:100});expect(coldHistory.events.find(row=>row.event.type==='tool/call'&&row.event.data.name==='home_presentation_publish').view).toBeUndefined()
  await expect.poll(()=>page.locator('.ew-delivery-card[data-file-path]').evaluateAll(cards=>cards.map(card=>card.dataset.filePath))).toEqual([join(f.cwd,'人工智能周期与资产配置.pptx'),join(f.cwd,'Vanguard-2026经济与市场展望.pdf')])
  expect(await page.locator('#native-root').innerText()).not.toMatch(/打开可编辑演示文稿|查看原始研究报告/u)
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
  expect(await page.evaluate(()=>window.probe.cues.map(c=>c.label))).toEqual(expect.arrayContaining(['把参考研报拖入输入框','选择公司 PPT 制作技能','填写研报转换要求','发送演示需求','打开可编辑文件']))
  await page.screenshot({path:evidence+'/03-native-delivery.png'})
  await page.evaluate(()=>window.probe.dispose());await f.ctx.sessions.flush(f.agent.session)
  expect((await f.ctx.sessionPersistence.inspect('demo')).events.some(e=>e.type==='assistant/message')).toBe(true)
  expect(await readFile(join(f.cwd,'人工智能周期与资产配置.pptx'))).toEqual(f.bytes);expect(f.outside).toEqual([]);expect(f.errors).toEqual([])
  await import('node:fs/promises').then(async fs=>fs.writeFile('/tmp/home-ppt-native-wire-complete-20261025.json',JSON.stringify({elapsedMs:Date.now()-started,phases:await page.evaluate(()=>window.probe.stageTimings),sentMatches:f.sent[0]===f.message(),lastEvent:f.agent.session.events.at(-1)?.type},null,2)))
 }finally{await f.close()}
},60000)

async function playPresentationCard(page){
 await page.getByRole('button',{name:'切换到快速开始',exact:true}).click()
 await expect.poll(()=>page.locator('.pI_x6G_centerCol').getAttribute('data-odyssey-home-operations-state')).toBe('operations')
 expect(await page.locator('.wSkVaW_composerHero').evaluate(node=>node.inert)).toBe(true)
 await page.getByRole('button',{name:'了解PPT制作能力',exact:true}).click()
 await page.getByRole('button',{name:'播放示例：了解PPT制作能力',exact:true}).click()
}
it('slides from the real presentation card to the native composer, selects the slash skill before its PDF, sends and opens the delivered file',async()=>{
 const f=await fixture({operations:true,reducedMotion:'no-preference'}),{page}=f
 try{
  let fileChoosers=0;page.on('filechooser',()=>fileChoosers++)
  await playPresentationCard(page)
  const deadline=Date.now()+55000
  while(Date.now()<deadline){
   if(await page.locator('[data-home-guide][data-phase="error"]').count())throw Error(await page.locator('.odyssey-home-guide-status').innerText())
   if(await page.evaluate(()=>window.probe.opened.length===1)&&await page.locator('[data-home-guide]').count()===0)break
   await page.evaluate(()=>{const clock=window.__testHomeGuideTimeline;if(clock?.snapshot().holding)clock.next()})
   await page.waitForTimeout(70)
  }
  const probe=await page.evaluate(()=>({cues:window.probe.cues,frames:window.probe.entryFrames,opened:window.probe.opened}))
  expect(probe.opened).toEqual([{scope:{sessionId:'demo',cwd:f.cwd},path:join(f.cwd,'人工智能周期与资产配置.pptx')}])
  const skill=probe.cues.find(cue=>cue.skillOption),attachment=probe.cues.find(cue=>cue.action==='drag'),send=probe.cues.find(cue=>cue.label==='发送演示需求')
  expect(skill.sources).toEqual([]);expect(attachment.sources).toEqual(['ework-managed-skill'])
  expect(probe.cues.indexOf(skill)).toBeLessThan(probe.cues.indexOf(attachment))
  expect(probe.cues.indexOf(attachment)).toBeLessThan(probe.cues.indexOf(send))
  expect(attachment.action).toBe('drag');expect(attachment.fromPresent).toBe(true);expect(send.sources).toEqual(['ework-managed-skill','chat-file'])
  const firstInput=probe.cues.find(cue=>cue.tag==='TEXTAREA');expect(firstInput).toMatchObject({inputState:'input',inputInert:false})
  expect(probe.frames[0]).toMatchObject({state:'operations',inert:true})
  expect(probe.frames.some(frame=>frame.state==='input'&&!frame.inert)).toBe(true)
  expect(new Set(probe.frames.map(frame=>Math.round(frame.y))).size).toBeGreaterThan(4)
  expect(fileChoosers).toBe(0);expect(await page.locator('.odyssey-home-guide-footer,[data-home-guide] [role=toolbar]').count()).toBe(0)
  await expect.poll(()=>page.locator('#right').textContent()).toContain('人工智能周期与资产配置.pptx')
  expect(await readFile(join(f.cwd,'人工智能周期与资产配置.pptx'))).toEqual(f.bytes)
  expect(await readFile(join(f.cwd,'Vanguard-2026经济与市场展望.pdf'))).toEqual(f.sourceBytes)
  await f.ctx.sessions.flush(f.agent.session)
  expect((await f.ctx.sessionPersistence.inspect('demo')).events.some(event=>event.type==='assistant/message')).toBe(true)
  expect(f.errors).toEqual([]);expect(f.outside).toEqual([])
 }finally{await f.close()}
},65000)
it('cancels the real entry at the paperclip cue without attaching, sending or taking back the user draft',async()=>{
 const f=await fixture({operations:true,reducedMotion:'no-preference'}),{page}=f
 try{
  await page.evaluate(()=>window.probe.pauseAtCue='把参考研报拖入输入框')
  await playPresentationCard(page)
  await expect.poll(()=>page.evaluate(()=>window.probe.cues.some(cue=>cue.action==='drag')),{timeout:15000}).toBe(true)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences.map(ref=>ref.source))).toEqual(['ework-managed-skill'])
  await page.keyboard.press('Escape');await expect.poll(()=>page.locator('[data-home-guide]').count()).toBe(0)
  await page.locator('textarea').focus();await page.keyboard.type('keep my later draft')
  const draft=await page.evaluate(()=>window.probe.shell.snapshot.draft)
  await page.waitForTimeout(300)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe(draft)
  expect(draft).toContain('keep my later draft')
  expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences.map(ref=>ref.source))).toEqual(['ework-managed-skill'])
  expect(await page.evaluate(()=>window.probe.opened)).toEqual([])
  expect(f.agent.session.events.some(event=>event.type==='user/message')).toBe(false)
  expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0)
  expect(f.errors).toEqual([]);expect(f.outside).toEqual([])
 }finally{await f.close()}
},25000)
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

it('keeps schema2 report streams readable while retaining both original file cards and the real PDF preview',async()=>{
 const f=await fixture({kind:'report',reportSchemaVersion:2}),{page}=f
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1';window.probe.visibleReports=[];window.probe.reportObserver=new MutationObserver(()=>{window.probe.visibleReports.push(document.querySelector('#native-root').innerText)});window.probe.reportObserver.observe(document.querySelector('#native-root'),{subtree:true,childList:true,characterData:true})})
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true));await page.evaluate(()=>window.probe.step('brief'))
  expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).not.toContain('\n')
  await page.evaluate(()=>window.probe.step('send'))
  for(const stage of ['plan','layout','deliver'])await page.evaluate(stage=>window.probe.step(stage),stage)
  await f.agent.whenIdle();await page.evaluate(()=>window.probe.refresh())
  expect(f.ctx.tools.get('home_report_publish',f.agent.ctx)).toBeUndefined()
  const coldHistory=await f.request(f.api.sessions.history,{sessionId:f.agent.id,maxMessages:100});expect(coldHistory.events.find(row=>row.event.type==='tool/call'&&row.event.data.name==='home_report_publish').view).toBeUndefined()
  const html=join(f.cwd,f.metadata.deliveryNames.html),pdf=join(f.cwd,f.metadata.deliveryNames.pdf)
  await expect.poll(()=>page.locator('.ew-delivery-card[data-file-path]').evaluateAll(nodes=>nodes.map(node=>node.dataset.filePath))).toEqual([html,pdf])
  const texts=await page.evaluate(()=>window.probe.visibleReports);expect(texts.length).toBeGreaterThan(1)
  for(const text of texts)expect(text).not.toMatch(/%[0-9A-F]{2}|\[阅读全文\]|\[打开\d+页PDF报告\]/u)
  expect(await page.locator('#native-root').innerText()).toContain(f.metadata.keyFindings[0])
  expect(await page.locator('#native-root').innerText()).not.toMatch(/阅读全文|打开\d+页PDF报告/u)
  await page.screenshot({path:evidence+'/report-final-real-markdown.png'})
  await page.evaluate(()=>window.probe.step('open'));expect(await page.evaluate(()=>window.probe.opened.map(value=>value.path))).toEqual([pdf])
  expect(await page.locator('#right').innerText()).toContain(f.metadata.deliveryNames.pdf)
  expect(await readFile(pdf)).toEqual(f.pdf);expect(await readFile(html)).toEqual(f.html)
  expect(f.sent).toEqual([f.message()]);expect(f.outside).toEqual([]);expect(f.errors).toEqual([])
  await page.evaluate(()=>window.probe.reportObserver.disconnect())
 }finally{await f.close()}
},60000)

it.each(['inert','moved'])('keeps the file unattached when its real input becomes %s after the drop cue',async mutation=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='run-1';window.probe.holdAtAction='drag'})
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.play(true));await page.evaluate(()=>{window.probe.pending=window.probe.step('brief').then(()=>true,()=>false)})
  await expect.poll(()=>page.evaluate(()=>window.probe.cues.some(cue=>cue.action==='drag'))).toBe(true)
  const before=await page.evaluate(()=>window.probe.shell.snapshot.draft)
  await page.evaluate(mutation=>{const input=document.querySelector('textarea[data-odyssey-file-reference-session]'),cue=window.probe.cues.find(cue=>cue.action==='drag');if(mutation==='inert')input.closest('.uV2eYG_root').inert=true;else input.style.transform='translateY(35px)';window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))},mutation)
  expect(await page.evaluate(()=>window.probe.pending)).toBe(false)
  expect(await page.evaluate(()=>window.probe.fileInsertions)).toEqual([]);expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe(before)
  expect(await page.locator('[data-home-guide-cue-target],[data-home-guide-drag-file],[data-home-guide-file-drop-target]').count()).toBe(0)
  expect(f.sent).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
