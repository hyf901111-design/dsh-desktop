import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {patchNoteSessionRuntime} from '../scripts/lib/notes-session.mjs'
import {patchNotesSidebar} from '../scripts/lib/notes-sidebar.mjs'
import {isHomeConversationContentNode,noteConversationVacant} from '../scripts/lib/notes-conversation-vacancy.mjs'

let browser,runtimeSource,conversationSource,entry
beforeAll(async()=>{
 runtimeSource=patchNoteSessionRuntime(await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'))
 conversationSource=patchNotesSidebar(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.__command=commandDefinition;exports.__chat=chatViewDefinition;exports.__message=messageDefinition;exports.__header=ConversationSessionHeader;exports.__vacant=noteConversationVacant;')
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot}from'react-dom/client';
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 const cordis=new Proxy({Service:class{constructor(ctx){this.ctx=ctx}}},{get:(target,key)=>target[key]??fake});
 const primitives=new Proxy({Tooltip:({children})=>children,MarkdownText:({text})=><p>{text}</p>},{get:(target,key)=>target[key]??(()=>null)});
 const native=window.runtimeDescriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='@deepseek-ai/cordis'?cordis:fake);
 const client=window.conversationDescriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/dsh-client-runtime/client'?native:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:fake);
 const disposers=[],ctx={get:()=>undefined,reflect:{provide(){}},effect(start){const stop=start();if(typeof stop==='function')disposers.push(stop);return typeof stop==='function'?stop:()=>{}}};
 const events=new native.ConversationEventRegistry(ctx),targets=new native.ConversationViewRegistry(ctx);
 events.register(client.__command);events.register(client.__message);targets.register(client.__chat);
 const runtime=new native.SessionRuntime(ctx,{sessions:{}},{},{events,views:targets}),session=runtime.manager.get('s');
 const store=initial=>{let value=initial;const listeners=new Set();return{getSnapshot:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},update:patch=>{value={...value,...patch};for(const fn of listeners)fn()}}};
 const view=store({view:'chat',draft:'保留的输入草稿',selection:null}),summary=store({byId:{s:{id:'s',displayTitle:'验收工作区',blank:true,cwd:'/tmp/synthetic'}}});
 const shell=new client.SessionInputShell({actx:{},defaultSink:()=>{throw Error('must not send')}});shell.setDraft('保留的输入草稿');
 const use=store=>select=>select(React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot));
 const sessionStore={subscribe:fn=>session.subscribe(fn),getSnapshot:()=>session.getSnapshot()},useSession=use(sessionStore),useStore=use(view),useInput=use(shell.state),useSessions=use(summary);
 const views={subscribe:()=>()=>{},version:()=>0,list:()=>[{id:'chat',label:'对话'},{id:'research',label:'研究'},{id:'notes',label:'笔记'}]},actions={setView:value=>view.update({view:value}),setDraft:value=>view.update({draft:value}),select(){},setResearchRightTab(){},setResearchConversationUnread(){}};
 const registry=new client.ResearchWorkspaceRegistry(localStorage),sidebarState={composerHost:document.querySelector('#side-composer'),conversationHost:document.querySelector('#side-history')},sidebarStore={subscribe:()=>()=>{},getSnapshot:()=>sidebarState},sidebar={storeFor:()=>sidebarStore,publish(){},enter(){},leave(){}};
 const t=key=>({'hero.headline':'探索更远，洞见更深。','hero.chooseWorkspace':'选择工作区'})[key]||key;
 function Input(){const state=useInput(s=>s);return <div className="uV2eYG_root"><div className="uV2eYG_card"><textarea aria-label="原生草稿" value={state.draft} onChange={e=>shell.setDraft(e.target.value)}/></div></div>}
 const shared={sessionId:'s',useSession,useSessions,useStore,actions,views,t};
 const renderSlot=(name,props={},options={})=>name==='conversation.session.header'?<client.__header {...shared} renderSlot={renderSlot} open={()=>{}} rename={async()=>{}}/>:name==='conversation.session'?<client.ConversationSession {...shared} {...props} useInput={useInput} inputActions={shell.actions} renderSlot={renderSlot} bindDraftMirror={()=>()=>{}} releaseSessionImages={()=>{}} releaseResearchWorkspace={()=>{}}/>:name==='conversation.composer.bar'?<Input/>:name==='conversation.view'?<main data-native-history="">已有会话内容</main>:null;
 const command=(kind='success',text='No compactable history yet.',sourceEventSeq)=>[{type:'command/run',seq:1,time:100,data:{commandId:'cmd',name:'compact',args:''}},{type:'command/done',seq:2,time:101,data:{commandId:'cmd',kind,text,...sourceEventSeq!==undefined?{sourceEventSeq}:{}}}];
 window.probe={shell,session,client,command,change(records){session.openState='open';session.installWindow(records.map(event=>({event})),false)},mode:actions.setView,snapshot(){const snapshot=session.getSnapshot();return{phase:snapshot.composerPhase,blank:snapshot.blank,vacant:client.__vacant(snapshot),draft:shell.snapshot.draft,events:session.events.length,nodes:snapshot.chat.order.map(key=>snapshot.chat.nodes.get(key)),page:document.querySelector('[data-odyssey-page]')?.dataset.odysseyPage,homeHeader:document.querySelector('[data-odyssey-home-header]')?.dataset.odysseyHomeHeader,title:document.querySelector('[data-srb-title-cluster]')?.textContent}}};
 window.probe.change([]);
 const root=createRoot(document.querySelector('#root'));root.render(<client.ConversationRoot {...shared} useProjection={()=>undefined} useInput={useInput} useComposerBlock={()=>undefined} renderSlot={renderSlot} renderSlotChain={(_n,_p,{fallback})=>fallback} selectWorkspace={async()=>{}} useWorkspaces={select=>select({phase:'ready',items:[{workspaceId:'w',title:'验收工作区',sessionIds:['s']}]})} researchWorkspaces={registry} researchSidebar={sidebar}/>);
 window.probe.dispose=()=>{root.unmount();disposers.reverse().forEach(stop=>stop())};
 `},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}})
 entry=output.outputFiles[0].text
 const pw=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
afterAll(()=>browser?.close())
async function fixture(){
 const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('https://empty.local/**',route=>new URL(route.request().url()).pathname==='/'?route.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{height:100%;margin:0}#root{position:fixed;inset:0 320px 0 0}#side-composer,#side-history{position:fixed;left:900px;width:280px}</style><div id="root"></div><div id="side-history"></div><div id="side-composer"></div><script>window.__ModuleLoader__={load:value=>window.descriptor=value}</script>'}):route.fulfill({contentType:'application/json',body:'{"tasks":[],"plans":[]}'}))
 await page.goto('https://empty.local/')
 await page.addScriptTag({content:runtimeSource});await page.evaluate(()=>window.runtimeDescriptor=window.descriptor)
 await page.addScriptTag({content:conversationSource});await page.evaluate(()=>window.conversationDescriptor=window.descriptor)
 await page.addScriptTag({content:entry});await page.waitForFunction(()=>!!document.querySelector('textarea'),undefined,{timeout:3000})
 expect(errors).toEqual([])
 return{page,errors}
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))}
it('keeps a real commandDefinition no-history compact on the native homepage with a blank phase and the same draft',async()=>{
 const{page,errors}=await fixture();try{
  await page.evaluate(()=>{window.originalInput=document.querySelector('textarea');window.probe.change(window.probe.command())});await settle(page)
  const result=await page.evaluate(()=>window.probe.snapshot())
  expect(result.nodes).toHaveLength(1);expect(result.nodes[0]).toMatchObject({kind:'manual-compaction',visibility:'visible',data:{command:{name:'compact',outcome:{kind:'success',text:'No compactable history yet.'}},compaction:null}})
  expect(result.phase).toBe('blank');expect(result.vacant).toBe(true);expect(result.page).toBe('home');expect(result.homeHeader).toBe('true');expect(result.title).toContain('新会话')
  expect(result.blank).toBe(true);expect(result.events).toBe(2);expect(result.draft).toBe('保留的输入草稿');expect(await page.locator('textarea').count()).toBe(1);expect(await page.evaluate(()=>window.originalInput===document.querySelector('textarea'))).toBe(true)
  await page.getByRole('textbox',{name:'原生草稿'}).press('End');await page.keyboard.insertText('继续输入');expect(await page.evaluate(()=>window.probe.snapshot().draft)).toBe('保留的输入草稿继续输入');expect(errors).toEqual([])
 }finally{await page.close()}
},10000)
for(const kind of ['running','error','other-success','source-event','real-summary','with-chat'])it(`retains ${kind} conversation activity and its existing draft`,async()=>{
 const{page,errors}=await fixture();try{
  await page.evaluate(kind=>{const p=window.probe;let records=p.command();if(kind==='running')records=records.slice(0,1);if(kind==='error')records=p.command('error');if(kind==='other-success')records=p.command('success','Compacted history.');if(kind==='source-event')records=p.command('success',undefined,8);if(kind==='real-summary')records=[records[0],{type:'compaction/summary',seq:2,time:101,data:{compactionId:'c',sourceCommandId:'cmd',summary:[{type:'text',text:'保留真实摘要'}],shadowedSeqs:[0],shadowedTokenCount:100}},{type:'user/message',seq:3,time:102,surfaceOp:'replace',data:{id:'checkpoint',source:{kind:'plugin',plugin:'compact',compactionId:'c',sourceCommandId:'cmd'},content:[]}},{...records[1],seq:4}];if(kind==='with-chat')records.push({type:'user/message',seq:3,time:102,surfaceOp:'append',data:{id:'user',source:{kind:'user'},content:[{type:'text',text:'真实问题'}]}});p.change(records)},kind);await settle(page)
  const result=await page.evaluate(()=>window.probe.snapshot());expect(result.phase).toBe('active');expect(result.vacant).toBe(false);expect(result.page).toBe('conversation');expect(result.homeHeader).toBe('false');expect(result.draft).toBe('保留的输入草稿');expect(result.blank).toBe(true)
  if(kind==='real-summary')expect(result.nodes.some(node=>node.data?.compaction?.summary==='保留真实摘要')).toBe(true)
  if(kind==='with-chat')expect(result.nodes.some(node=>node.kind==='user')).toBe(true)
  expect(errors).toEqual([])
 }finally{await page.close()}
},10000)
it('upgrades already patched runtime and conversation dependencies and is idempotent',()=>{
 expect(runtimeSource.includes('isHomeConversationContentNode')).toBe(true)
 expect(conversationSource.includes('function isHomeConversationContentNode(')).toBe(true)
 expect(conversationSource.includes('isHomeConversationContentNode(chat.nodes?.get?.(key))')).toBe(true)
 expect(patchNoteSessionRuntime(runtimeSource)).toBe(runtimeSource)
 const original=conversationSource.replace('exports.__command=commandDefinition;exports.__chat=chatViewDefinition;exports.__message=messageDefinition;exports.__header=ConversationSessionHeader;exports.__vacant=noteConversationVacant;','')
 expect(patchNotesSidebar(original)).toBe(original)
 const obsolete='function isHomeConversationContentNode(node){return true}'
 expect(runtimeSource.includes('/* ework:retain-edited-note:v1 */')).toBe(true)
 expect(patchNoteSessionRuntime(runtimeSource.replace(isHomeConversationContentNode.toString(),obsolete))===runtimeSource,'existing runtime marker cannot retain an obsolete predicate').toBe(true)
 expect(patchNotesSidebar(original.replace(isHomeConversationContentNode.toString(),obsolete))===original,'existing Notes activity refreshes the shared predicate too').toBe(true)
 expect(runtimeSource.split('function isHomeConversationContentNode(')).toHaveLength(2)
 expect(original.split('function isHomeConversationContentNode(')).toHaveLength(2)
})
it('keeps unknown nodes and near-miss compaction results visible',()=>{
 const noop={kind:'manual-compaction',visibility:'visible',data:{command:{name:'compact',outcome:{kind:'success',text:'No compactable history yet.'}},compaction:null}}
 expect(isHomeConversationContentNode(noop)).toBe(false)
 const variants=[undefined,{kind:'unknown'},{...noop,visibility:undefined},{...noop,data:{...noop.data,compaction:undefined}},{...noop,data:{...noop.data,compaction:{summary:'真实摘要'}}},{...noop,data:{...noop.data,command:{...noop.data.command,name:'another-command'}}},...['No compactable history yet. ','No compactable history yet.\n','Compacted history.'].map(text=>({...noop,data:{...noop.data,command:{...noop.data.command,outcome:{kind:'success',text}}}}))]
 for(const node of variants)expect(isHomeConversationContentNode(node),'unrecognized or potentially meaningful data stays visible').toBe(true)
 expect(noteConversationVacant({chat:{order:['unhydrated'],nodes:new Map()}})).toBe(false)
})
it('keeps other ongoing work visible even when the only command is a no-op compact',()=>{
 const node={kind:'manual-compaction',visibility:'visible',data:{command:{name:'compact',outcome:{kind:'success',text:'No compactable history yet.'}},compaction:null}},base={chat:{order:['cmd'],nodes:new Map([['cmd',node]])}}
 expect(noteConversationVacant(base)).toBe(true)
 for(const patch of [{running:true},{pending:[{}]},{queue:[{}]},{runningCalls:[{}]},{partial:{}},{turnTimings:new Map([['turn',{}]])},{turnEnds:new Map([['turn',{}]])},{composerPhase:'engaging'},{promptError:{}}])expect(noteConversationVacant({...base,...patch})).toBe(false)
 expect(noteConversationVacant(base,[{}])).toBe(false);expect(noteConversationVacant(base,[],[{}])).toBe(false);expect(noteConversationVacant(base,[],[],true)).toBe(false)
})
it('preserves the authoritative engaged bit instead of making a retained session blank',async()=>{
 const{page}=await fixture();try{
  await page.evaluate(()=>{window.probe.session.handleBlank(false);window.probe.change(window.probe.command())});await settle(page)
  const result=await page.evaluate(()=>window.probe.snapshot());expect(result.blank).toBe(false);expect(result.phase).toBe('active');expect(result.events).toBe(2);expect(result.draft).toBe('保留的输入草稿')
 }finally{await page.close()}
},10000)
