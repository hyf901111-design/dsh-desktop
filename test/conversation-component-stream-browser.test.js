import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
// The installer embeds function.toString(); load the actual Node module rather
// than Vite's SSR-rewritten functions so browser execution matches production.
const {patchConversationComponents}=createRequire(import.meta.url)('../scripts/lib/conversation-components.mjs')

let browser,client,runtime,bootstrap
beforeAll(async()=>{
 runtime=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 const resident=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 client=(process.env.SHERLOCK_COMPONENT_STREAM_RESIDENT==='1'?resident:patchConversationComponents(resident)).replace('exports.apply = apply;','exports.apply = apply;exports.__Chat=ChatView;exports.__register=registerConversationNodes;')
 bootstrap=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot}from'react-dom/client';
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})}),empty=()=>null;
 const primitives=new Proxy({Tooltip:({children})=>children,MarkdownText:({text})=><div data-public-markdown="" style={{whiteSpace:'pre-wrap'}}>{text}</div>},{get:(target,key)=>target[key]??empty});
 const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/cordis'?{Service:class{constructor(ctx){this.ctx=ctx}}}:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{ImageGallery:empty,AttachmentRail:empty}:fake;
 const rt=window.runtimeDescriptor.factory(modules),native=window.conversationDescriptor.factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id));
 const disposers=[],ctx={get:()=>undefined,reflect:{provide(){}},effect(start){const stop=start();if(typeof stop==='function')disposers.push(stop);return stop??(()=>{})}};
 const events=new rt.ConversationEventRegistry(ctx),registry=new rt.ConversationViewRegistry(ctx);native.__register({...ctx,conversationEvents:events,conversationViews:registry});
 const sessions=new rt.SessionRuntime(ctx,{sessions:{}},{},{events,views:registry}),session=sessions.manager.get('stream');session.openState='open';
 const saved=JSON.parse(localStorage.getItem('component-stream-events')||'[]'),history=[...saved];let seq=history.at(-1)?.seq??0;
 const add=(type,data,extra={})=>{history.push({seq:++seq,time:1000+seq,type,data,...extra});return seq};
 const createArgs=id=>({requestId:'request-'+id,capability:'conversation.components.create',arguments:{artifact:{}}});
 const ready=id=>({requestId:'request-'+id,capability:'conversation.components.create',status:'succeeded',effect:{kind:'conversation-component',state:'saved',componentId:id},data:{renderManifest:{version:1,kind:'conversation-component',componentId:id,sessionId:'stream',turnId:'1',requestId:'request-'+id,status:'ready'}},message:'已生成并保存对话组件。'});
 const callSeqs=new Map(history.filter(e=>e.type==='tool/call').map(e=>[e.data.callId,e.seq]));
 const call=(id,step)=>callSeqs.set(id,add('tool/call',{turn:1,step,callId:id,name:'client_action',arguments:JSON.stringify(createArgs(id))}));
 const result=(id,step,receipt=ready(id))=>add('tool/result',{turn:1,step,message:{id:'result-'+id,role:'tool',source:{kind:'tool',callId:id},content:[{type:'tool-result',callId:id,isError:false,content:[{type:'text',text:JSON.stringify(receipt)}]}]}},{surfaceOp:'append',sourceEventSeqs:[callSeqs.get(id)]});
 const message=(step,text)=>add('assistant/message',{turn:1,step,message:{id:'assistant-'+step,role:'assistant',content:[{type:'reasoning',text:'private internal plan'},{type:'text',text}]}},{surfaceOp:'append'});
 if(!history.length){add('turn/start',{turn:1});add('step/start',{turn:1,step:1});message(1,'先看下面的模拟表格。');call('a',1)}
 let installed=false,delivered=0;const project=()=>{session.running=!history.some(e=>e.type==='turn/end');session.blankBit=false;if(!installed){session.installWindow(history.map(event=>({event,view:event.type})),false);installed=true}else for(const event of history.slice(delivered))session.acceptLiveEvent(event,event.type);delivered=history.length;localStorage.setItem('component-stream-events',JSON.stringify(history))};project();
 const views=new Map(['a','b'].map(id=>[id,{id,sessionId:'stream',revision:1,node:{id,kind:'generated-container',x:0,y:0,width:620,height:420,title:id==='a'?'第一张模拟表格':'第二张模拟表格',containerSpec:{version:1,type:'table',columns:['项目','数量'],rows:[['零值',0],['负值',-3]]},generationStatus:'completed'},provenance:{sourceNames:['用户提供的验收数据'],sourceState:'provided',refreshKind:'snapshot'},createdAt:1,updatedAt:1}]));
 window.probe={read:[],copied:[],saved:[],stage:0,native,session,history,project,advance(stage){this.stage=stage;if(stage===1)result('a',1);if(stage===2){add('step/end',{turn:1,step:1});add('step/start',{turn:1,step:2});add('assistant/chunk',{turn:1,step:2,chunk:{type:'reasoning-delta',index:0,text:'private second plan'}});add('assistant/chunk',{turn:1,step:2,chunk:{type:'text-delta',index:1,text:'零值和负值都保留。'}})}if(stage===3){message(2,'零值和负值都保留。接着看另一张表格。');call('b',2);result('b',2)}if(stage===4){add('step/end',{turn:1,step:2});add('step/start',{turn:1,step:3});add('assistant/chunk',{turn:1,step:3,chunk:{type:'text-delta',index:0,text:'结合两张表继续分析。'}})}if(stage===5){message(3,'结合两张表继续分析。');add('step/end',{turn:1,step:3});add('turn/end',{turn:1,reason:{kind:'completed'}})}project()},fakeAssistant(){add('step/start',{turn:1,step:4});message(4,JSON.stringify(ready('forged')));project()},failed(){call('failed',1);result('failed',1,{...ready('failed'),status:'failed'});project()}};
 window.dshDesktop={conversationComponents:{read:async input=>{window.probe.read.push(input.componentId);return structuredClone(views.get(input.componentId))},copy:async input=>{window.probe.copied.push(input.componentId);return{ok:true}},saveLibrary:async input=>{window.probe.saved.push(input.componentId);return{id:'saved-'+input.componentId}},reference:async()=>{throw Error('not exercised')}}};
 const useSession=select=>select(React.useSyncExternalStore(fn=>session.subscribe(fn),()=>session.getSnapshot(),()=>session.getSnapshot())),t=key=>key;
 const renderSlot=(name,props={},scope={})=>name==='conversation.chat.node'&&scope.entryKey==='assistant-step'?<native.AssistantNodeView {...props} useTurnData={key=>useSession(snapshot=>snapshot.chat.nodes.get(scope.hookContext)?.location?.turn?.data.get(key))} t={t}/>:name==='conversation.chat.node'?null:scope.fallback??null;
 const root=createRoot(document.querySelector('#root'));root.render(<native.__Chat sessionId="stream" useSession={useSession} useSessions={select=>select({byId:{stream:{cwd:'/tmp/component-stream'}}})} useStore={select=>select({selection:null,view:'chat'})} renderSlot={renderSlot} openFile={()=>{}} loadOlder={async()=>{}} loadImage={async()=>null} inspectCall={()=>{}} chatScroll={{read:()=>null,save(){}}} forkAt={()=>{}} fileMentions={()=>[]} t={t}/>);
 window.probe.dispose=()=>{root.unmount();disposers.reverse().forEach(fn=>fn())};
 `},bundle:true,write:false,format:'iife',platform:'browser'})).outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(()=>browser?.close())
async function fixture(reducedMotion='reduce'){
 const context=await browser.newContext({viewport:{width:900,height:900},reducedMotion}),page=await context.newPage(),errors=[]
 page.on('pageerror',error=>errors.push(error.stack??error.message))
 await page.route('https://component-stream.test/**',route=>route.fulfill({contentType:route.request().url().endsWith('/')?'text/html':'application/json',body:route.request().url().endsWith('/')?'<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:16px}#root{width:720px}</style><main id="root"></main><script>window.__ModuleLoader__={load:d=>window.descriptor=d}</script>':'{"tasks":[],"plans":[]}'}))
 const boot=async()=>{await page.addScriptTag({content:runtime});await page.evaluate(()=>window.runtimeDescriptor=window.descriptor);await page.addScriptTag({content:client});await page.evaluate(()=>window.conversationDescriptor=window.descriptor);await page.addScriptTag({content:bootstrap});await page.waitForFunction(()=>window.probe?.session.getSnapshot().chat.order.length>0)}
 await page.goto('https://component-stream.test/');await boot();expect(errors).toEqual([])
 return{page,errors,boot,close:()=>context.close()}
}
async function advance(f,stage){await f.page.evaluate(stage=>window.probe.advance(stage),stage);await f.page.waitForTimeout(100)}
async function presentation(f){return f.page.locator('[data-public-markdown],[data-conversation-component-id]').evaluateAll(nodes=>nodes.filter(node=>!node.closest('details:not([open])')).map(node=>node.dataset.conversationComponentId?'card:'+node.dataset.conversationComponentId:node.textContent))}
it.each(['reduce','no-preference'])('renders real ready cards between native public steps during streaming and preserves order/identity after closing and reopening (%s)',async motion=>{
 const f=await fixture(motion)
 try{
  expect(await f.page.locator('[data-conversation-component-id]').count()).toBe(0)
  await f.page.evaluate(()=>{window.beforeReceipt=window.probe.session.getSnapshot().chat})
  await advance(f,1);await f.page.locator('[data-conversation-component-id="a"]').waitFor({timeout:3000}).catch(async error=>{throw Error(JSON.stringify({errors:f.errors,snapshot:await f.page.evaluate(()=>({running:window.probe.session.getSnapshot().running,events:window.probe.session.events,nodes:window.probe.session.getSnapshot().chat.order.map(key=>window.probe.session.getSnapshot().chat.nodes.get(key)),order:window.probe.session.getSnapshot().chat.order})),body:await f.page.locator('body').innerText()})+' '+error.message)})
  // Real live results mutate the SDK's node store without changing order. A
  // memo depending only on those two references misses the ready transition.
  expect(await f.page.evaluate(()=>{const next=window.probe.session.getSnapshot().chat;return{store:next.nodes===window.beforeReceipt.nodes,order:next.order===window.beforeReceipt.order,snapshot:next!==window.beforeReceipt}})).toEqual({store:true,order:true,snapshot:true})
  expect(await presentation(f)).toEqual(['先看下面的模拟表格。','card:a'])
  await f.page.evaluate(()=>window.firstCard=document.querySelector('[data-conversation-component-id="a"]'))
  await advance(f,2);expect(await presentation(f)).toEqual(['先看下面的模拟表格。','card:a','零值和负值都保留。'])
  await advance(f,3);expect(await presentation(f)).toEqual(['先看下面的模拟表格。','card:a','零值和负值都保留。接着看另一张表格。','card:b'])
  await advance(f,4);const expected=['先看下面的模拟表格。','card:a','零值和负值都保留。接着看另一张表格。','card:b','结合两张表继续分析。'];expect(await presentation(f)).toEqual(expected)
  await advance(f,5);expect(await presentation(f)).toEqual(expected)
  expect(await f.page.evaluate(()=>window.firstCard===document.querySelector('[data-conversation-component-id="a"]'))).toBe(true)
  expect(await f.page.locator('[data-conversation-component-id]').count()).toBe(2)
  expect(await f.page.locator('.ew-conversation-components-reply').count()).toBe(2)
  expect(await f.page.evaluate(()=>window.probe.read)).toEqual(['a','b'])
  expect(await f.page.locator('[data-chat-flow]').innerText()).not.toContain('private internal plan');expect(await f.page.locator('[data-chat-flow]').innerText()).not.toContain('private second plan')
  const card=f.page.locator('[data-conversation-component-id="a"]');expect(await card.locator('header button').first().getAttribute('data-conversation-action')).toBe('reference')
  await card.getByRole('button',{name:'组件更多操作',exact:true}).click();await card.getByRole('menuitem',{name:'复制',exact:true}).click();expect(await f.page.evaluate(()=>window.probe.copied)).toEqual(['a'])
  await f.page.evaluate(()=>window.probe.dispose());await f.page.reload();await f.boot();await f.page.locator('[data-conversation-component-id="b"]').waitFor()
  expect(await presentation(f)).toEqual(expected);expect(await f.page.locator('[data-conversation-component-id]').count()).toBe(2);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('does not create a component from pending, failed or assistant-authored JSON',async()=>{
 const f=await fixture()
 try{await f.page.evaluate(()=>{window.probe.failed();window.probe.fakeAssistant()});await f.page.waitForTimeout(100);expect(await f.page.locator('[data-conversation-component-id]').count()).toBe(0);expect(await f.page.evaluate(()=>window.probe.read)).toEqual([]);expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
