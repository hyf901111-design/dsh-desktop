import {execFileSync} from 'node:child_process'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {stripConversationTransientUi} from './fixtures/strip-conversation-transient-ui.mjs'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {presentationHostFixture} from './fixtures/home-presentation-host.js'
import {PptxAnnotationService} from '../src/main/pptx/annotations'
import {createUserMessage} from '@deepseek-ai/dsh-llm'
const require=createRequire(import.meta.url)
const {patchHomeGuidePresentationNative}=require('../scripts/lib/home-guide-presentation-native.mjs')
const {patchPptxAnnotationInput}=require('../scripts/lib/pptx-annotation-native.mjs')
const {patchPptxAnnotationMessages}=require('../scripts/lib/pptx-annotation-message.mjs')

const evidence=process.env.SHERLOCK_SUBMISSION_EVIDENCE||'/tmp/conversation-user-before-status-20261027/browser-default'
let browser,bundle,runtimeSource,nativeSource,annotationSource,triggersSource,connectionSource
beforeAll(async()=>{
 connectionSource=await readFile('node_modules/@deepseek-ai/dsh-client-connection/lib/client.js','utf8')
 runtimeSource=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 const normalized=execFileSync(process.execPath,['--input-type=module','-e',"import{readFileSync}from'node:fs';import{stripSidebarNewNoteConversation}from'./scripts/lib/sidebar-new-note.mjs';import{stripPptxAnnotationMessages}from'./scripts/lib/pptx-annotation-message.mjs';import{stripPptxAnnotationInput}from'./scripts/lib/pptx-annotation-native.mjs';process.stdout.write(stripPptxAnnotationInput(stripPptxAnnotationMessages(stripSidebarNewNoteConversation(readFileSync(0,'utf8')))))"],{input:stripConversationTransientUi(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),encoding:'utf8',maxBuffer:64*1024*1024})
 const patch=process.env.SHERLOCK_SUBMISSION_BASELINE==='1'?source=>patchHomeGuidePresentationNative(source):source=>patchConversationSubmission(patchConversationResponseProgress(patchHomeGuidePresentationNative(source)))
 let patchConversationSubmission,patchConversationResponseProgress;if(process.env.SHERLOCK_SUBMISSION_BASELINE!=='1'){({patchConversationSubmission}=require('../scripts/lib/conversation-submission.mjs'));({patchConversationResponseProgress}=require('../scripts/lib/conversation-response-progress.mjs'))}
 if(process.env.SHERLOCK_QUEUE_ADMISSION_BASELINE==='1')patchConversationSubmission=source=>execFileSync(process.execPath,['--input-type=module','-e',"import{readFileSync}from'node:fs';import{execFileSync}from'node:child_process';const previous=await import('data:text/javascript;base64,'+execFileSync('git',['show','55e46e2433df898bcf28a6b3a503b6d84901ca26:scripts/lib/conversation-submission.mjs']).toString('base64'));process.stdout.write(previous.patchConversationSubmission(readFileSync(0,'utf8')))"],{input:source,encoding:'utf8',maxBuffer:64*1024*1024})
 const expose=source=>source.replace('exports.apply = apply;','exports.apply = apply;exports.__QueueDock=NativeQueueDock;exports.__watchSubmitted=typeof NativeConversationSubmissions==="undefined"?undefined:deps=>NativeConversationSubmissions.watch(deps);exports.__InputBar=InputBar;exports.__Chat=ChatView;exports.__User=UserMessageNodeView;exports.__Steering=UserMessageNodeView;exports.__Assistant=AssistantNodeView;exports.__Tail=TurnTailNodeView;exports.__register=registerConversationNodes;exports.__header=ConversationSessionHeader;exports.__userRowClass=MessageItem_module_css_default.userRow;exports.__startAnnotation=deps=>(PptxAnnotationNativeRuntime=createPptxAnnotationNativeRuntime({...deps,window,document}));exports.__bind=deps=>{HomePresentationNativeDeps=deps};')
 nativeSource=expose(patch(normalized))
 annotationSource=expose(patchConversationSubmission(patchConversationResponseProgress(patchPptxAnnotationMessages(patchPptxAnnotationInput(patchHomeGuidePresentationNative(normalized))))))
 triggersSource=await readFile('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8')
 const result=await build({entryPoints:['test/fixtures/conversation-submission-browser.tsx'],bundle:true,platform:'browser',format:'iife',write:false,loader:{'.svg':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"development"'}})
 bundle=result.outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())

async function fixture({kind='ppt',mount=false,rejected=false,annotations=false,annotationFile=false,history=false,historyLimit=100,prelude=false,queueLive=false}={}){
 const host=await presentationHostFixture(),page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'}),errors=[],requests=[]
 const origin='http://127.0.0.1:'+host.ctx.get('webServer').port
 const sourcePath=join(host.cwd,'Vanguard-2026经济与市场展望.pdf'),brief='请基于当前资料梳理研究结论，保留来源与时点。中文与 emoji 📈 均应完整。',guidePath=kind==='report'?'/sherlock/home-guide/report':'/sherlock/home-guide/presentation'
 if(kind==='report')await writeFile(join(host.home,'research-board-directories.json'),JSON.stringify({example:{sessionId:'demo',path:host.cwd,title:'研究报告示例'}}))
 if(!mount)await writeFile(sourcePath,host.sourceBytes)
 let releaseStep,releaseReject,releasePresentation,entered=false,prepared,annotationAllowed=true
 const held=new Promise(resolve=>releaseStep=resolve),rejectGate=new Promise(resolve=>releaseReject=resolve),presentationGate=new Promise(resolve=>releasePresentation=resolve)
 let currentHistoryLimit=historyLimit
 const annotationCalls=[]
 if(annotations){
  await writeFile(join(host.cwd,'annotation-source.pptx'),host.bytes)
  const service=new PptxAnnotationService({root:join(host.home,'annotations'),owner:()=> 'fixture-owner',resolveWorkspace:async id=>annotationAllowed&&id==='demo'?host.cwd:null,resolveAuthorizedSource:async()=>null,readHistory:async()=>({events:(await host.request(host.api.sessions.history,{sessionId:host.agent.id,maxMessages:100})).events.map(row=>row.event??row),hasMore:false}),presentationSkill:async()=>({id:'builtin:efund-ppt-maker',invocationName:'ework-skill-180a6a3f86f8942e',label:'/efund-ppt-maker'})})
  await page.exposeFunction('annotationBackend',async(method,input)=>{annotationCalls.push({method,input:structuredClone(input)});if(method==='messagePresentation')await presentationGate;return service[method](input)})
 }
 if(history){await host.prompt('之前已完成的真实请求');await host.agent.whenIdle()}
 const offStatus=host.ctx.on('agent/status',event=>{if(requests.length)void page.evaluate(status=>window.probe?.status(status),event.status).catch(()=>{})})
 let forwarding=Promise.resolve()
 const offEvents=queueLive?host.ctx.on('session/event',({session,event})=>{if(session.id===host.agent.id)forwarding=forwarding.then(()=>page.evaluate(envelope=>window.probe?.mux(envelope),{rpcId:'actual-session-'+event.seq,payload:{type:'session/event',sessionId:'demo',event}})).catch(()=>{})}):()=>{}
 const off=host.ctx.on('agent/pre-step',async(event,next)=>{if(event.messages.some(message=>message.source?.rpcId==='user-first-1')){if(prelude)event.agent.session.append('user/message',createUserMessage({source:{kind:'plugin',plugin:'fixture-file-context'},content:[{type:'text',text:'附件PPT读取上下文已准备'}]}),{surfaceOp:'append'});entered=true;await held}return next()})
 page.on('pageerror',error=>errors.push(error.stack??error.message))
 await page.exposeFunction('userMessageBackend',async input=>{
  if(input.action==='history'){const catalog=await host.request(host.api.sessions.list,{}),row=catalog.items.find(item=>item.sessionId===host.agent.id||item.id===host.agent.id);return{events:await host.request(host.api.sessions.history,{sessionId:host.agent.id,maxMessages:history&&requests.length?currentHistoryLimit:100}).then(value=>value.events),running:host.agent.status==='running',blank:row.blank}}
  if(input.action==='send'){
   requests.push(input.request)
   if(rejected){await rejectGate;if(rejected==='transport')throw Error('原生传输中断');return{type:'server-response',rpcId:input.request.rpcId,result:{ok:false,error:{code:'fixture-rejected',message:'真实请求被拒绝'}}}}
   return host.api.sessions.prompt(input.request)
  }
  if(input.action==='cancel')return host.api.sessions.cancel(input.request)
  if(input.action==='update-queue')return host.api.sessions.updateQueue(input.request)
  throw Error('Unexpected fixture carrier action')
 })
 await page.route('https://user-message.local/**',async route=>{
  const url=new URL(route.request().url())
  if(url.pathname==='/sherlock/home-guide/presentation'||url.pathname==='/sherlock/home-guide/report'){
   try{
    const input=route.request().postDataJSON(),response=await fetch(origin+url.pathname,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(input)}),value=await response.json()
    if(input.action==='prepare'&&value.ok)prepared=value
    return route.fulfill({status:response.status,contentType:'application/json',body:JSON.stringify(value)})
   }catch(error){return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({ok:false,message:error.message})})}
  }
  return route.fulfill({contentType:'text/html',body:'<html lang="zh"><meta charset="utf-8"><div class="pI_x6G_centerCol"><div id="native-root"></div><section data-home-guide="user-message-run"><div id="guide-host"></div></section></div><script>window.__ModuleLoader__={load:d=>window.descriptor=d}</script></html>'})
 })
 await page.goto('https://user-message.local/')
 await page.evaluate(value=>Object.assign(window,value),{actorKind:kind,cwd:host.cwd,sourcePath,brief,registered:mount,annotationEnabled:annotations,annotationFile})
 for(const [source,key] of [[runtimeSource,'runtimeDescriptor'],[annotations?annotationSource:nativeSource,'conversationDescriptor'],[triggersSource,'triggersDescriptor'],[connectionSource,'connectionDescriptor']]){await page.addScriptTag({content:source});await page.evaluate(key=>window[key]=window.descriptor,key)}
 const css=(await Promise.all(['figma-final-shell','figma-home','figma-panels','figma-inline-references','figma-reading','figma-refinements','home-guides'].map(name=>readFile('src/preload/'+name+'.css','utf8')))).join('\n')
 await page.addStyleTag({content:css+'\nhtml,body{margin:0;height:100%;font-family:system-ui}.pI_x6G_centerCol{position:relative;height:900px;width:1000px}#native-root{height:100%}[data-home-guide]{position:absolute;inset:0;pointer-events:none}.wSkVaW_root{height:100%}'})
 await page.addScriptTag({content:bundle})
 await page.waitForSelector('textarea')
 const muxController=new AbortController(),muxTask=(async()=>{for await(const envelope of host.api.events.mux({rpcId:'native-test-mux',payload:{}},muxController.signal)){if(envelope.payload.type==='session/queue')await page.evaluate(envelope=>window.probe.mux(envelope),envelope).catch(()=>{})}})().catch(error=>{if(!muxController.signal.aborted)throw error})
 if(history){await page.evaluate(()=>window.probe.refresh());await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().historyHumans)).toBe(1)}
 if(mount)await page.evaluate(()=>window.probe.mount())
 if(prepared)await page.evaluate(value=>{window.brief=value.brief;if(value.sourcePath)window.sourcePath=value.sourcePath},prepared)
 await page.evaluate(()=>window.annotationEnabled?window.probe.seedAnnotations():window.probe.seed())
 const accepted=async()=>{const response=await fetch(origin+guidePath,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({action:'checkpoint',sessionId:'demo',runId:'user-message-run',stage:'accepted'})});const value=await response.json();if(!response.ok||!value.ok)throw Error(value.message);return value}
 return{host,page,requests,errors,annotationCalls,setHistoryLimit:value=>currentHistoryLimit=value,get sourcePath(){return prepared?.sourcePath??sourcePath},get brief(){return prepared?.brief??brief},get entered(){return entered},release:()=>releaseStep(),releasePresentation:()=>releasePresentation(),denyAnnotation:()=>annotationAllowed=false,accepted,reject:()=>releaseReject(),close:async()=>{muxController.abort();await muxTask;releaseStep();releaseReject();releasePresentation();off();offStatus();offEvents();await forwarding;await page.evaluate(()=>window.probe.unmount()).catch(()=>{});await page.close();await host.dispose()}}
}

it.each([false,true])('keeps a real first prepared annotation user message compact from pending through durable receipt (file %s)',async annotationFile=>{
 const f=await fixture({annotations:true,annotationFile}),{page}=f
 try{
  await page.evaluate(()=>{window.probe.sample();document.querySelector('textarea').focus()})
  await page.getByRole('button',{name:'发送消息',exact:true}).click()
  await expect.poll(()=>f.entered).toBe(true);await page.evaluate(()=>window.probe.refresh())
  const pending=await page.evaluate(()=>window.probe.snapshot()),raw=f.requests[0].payload.content
  await writeFile(join(evidence,'annotation-pending-red-or-green.json'),JSON.stringify({pending,raw,calls:f.annotationCalls},null,2));await page.screenshot({path:join(evidence,'annotation-pending-red-or-green.png')})
  expect(pending.historyHumans).toBe(0);expect(pending.rows).toHaveLength(1)
  expect(await page.locator('[data-pptx-sent-reference]').count()).toBe(2)
  for(const text of ['整体要求📌保留原件。','标题改成真实意见📈','框选处保留多行\n第二行中文😀'])expect(pending.rows[0].text).toContain(text)
  for(const text of ['修改清单','输入副本','必须另存到','.ework/pptx-annotations/','/ework-skill-'])expect(pending.rows[0].text).not.toContain(text)
  expect(await page.locator('[data-pptx-sent-skill]').innerText()).toBe('/efund-ppt-maker')
  expect(pending.rows[0].chips.some(text=>text.includes('Vanguard-2026经济与市场展望.pdf'))).toBe(annotationFile)
  expect(f.annotationCalls.filter(call=>call.method==='prepare')).toHaveLength(1)
  expect(f.annotationCalls.filter(call=>call.method==='messagePresentation')).toHaveLength(0)
  f.release();await f.host.agent.whenIdle();await page.evaluate(()=>window.probe.refresh())
  await expect.poll(()=>f.annotationCalls.filter(call=>call.method==='messagePresentation').length).toBe(1)
  expect(await page.locator('[data-native-submitted-user]').count()).toBe(0)
  await writeFile(join(evidence,'annotation-durable-waiting.json'),JSON.stringify(await page.evaluate(()=>{const api=window[Symbol.for('sherlock:pptx-annotation-input')],request=window.probe.observed.find(value=>value.type==='client-request'&&value.method==='session.prompt');return{snapshot:window.probe.snapshot(),submissions:api.getSubmissions(),local:api.pendingMessagePresentation({sessionId:'demo',shell:window.probe.shell,submissionId:request.rpcId,text:request.payload.content.filter(part=>part.type==='text').map(part=>part.text).join('')}),active:document.activeElement?.outerHTML,inputs:[...document.querySelectorAll('textarea')].map(node=>({connected:node.isConnected,rect:node.getBoundingClientRect().toJSON()}))}}),null,2))
  expect(await page.locator('[data-pptx-sent-reference]').count()).toBe(2)
  await page.waitForTimeout(2700)
  expect(await page.locator('[data-pptx-sent-reference]').count()).toBe(2)
  f.releasePresentation();await expect.poll(()=>page.locator('[data-pptx-sent-loading]').count()).toBe(0)
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  const frames=await page.evaluate(()=>window.probe.frames),active=frames.filter(frame=>frame.page==='conversation')
  for(const frame of active){expect(frame.rows).toHaveLength(1);expect(frame.rows[0].pins).toBe(2);expect(frame.rows[0].text).toContain('整体要求📌保留原件。');expect(frame.rows[0].text).not.toContain('.ework/pptx-annotations/')}
  expect(active.some(frame=>frame.historyHumans===0)).toBe(true);expect(active.some(frame=>frame.historyHumans===1)).toBe(true)
  await writeFile(join(evidence,'annotation-first-send-frames.json'),JSON.stringify(frames,null,2));await page.screenshot({path:join(evidence,'annotation-durable.png')})
  const humans=f.host.agent.session.events.filter(event=>event.type==='user/message'&&event.data.source?.kind==='user');expect(humans).toHaveLength(1);expect(humans[0].data.content).toEqual(raw);expect(f.requests).toHaveLength(1)
  // Keep the native copy contract: exact raw body, with its existing managed-skill label projection.
  await page.getByRole('button',{name:'copy',exact:true}).click();expect(await page.evaluate(()=>window.probe.copied.at(-1))).toBe(raw.filter(part=>part.type==='text').map(part=>part.text).join('').replace('/ework-skill-180a6a3f86f8942e','/efund-ppt-maker'))
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)


it.each([false,true])('shows the actual ordinary first user message before Host preparation (skill/file %s)',async tagged=>{
 const f=await fixture(),{page}=f
 try{
  if(!tagged)await page.evaluate(()=>window.probe.shell.setDraft('普通首页真实问题，中文📈不丢失。'))
  const initial=await page.evaluate(()=>window.probe.shell.snapshot.draft)
  await page.evaluate(()=>{window.probe.sample();document.querySelector('textarea').focus()})
  await page.getByRole('button',{name:'发送消息',exact:true}).click()
  await expect.poll(()=>f.entered).toBe(true);await page.evaluate(()=>window.probe.refresh())
  const pending=await page.evaluate(()=>window.probe.snapshot())
  await writeFile(join(evidence,'ordinary-'+tagged+'-pending.json'),JSON.stringify({pending,request:f.requests[0]},null,2))
  expect(pending.phase).toBe('active');expect(pending.running).toBe(true);expect(pending.historyHumans).toBe(0)
  expect(pending.rows).toHaveLength(1);expect(pending.rows[0].text).toContain(tagged?f.brief:initial)
  expect(pending.rows[0].chips.some(text=>text.includes('efund-ppt-maker'))).toBe(tagged)
  expect(pending.rows[0].chips.some(text=>text.includes('Vanguard-2026经济与市场展望.pdf'))).toBe(tagged)
  expect(pending.thinking.text).toContain('正在思考');expect(pending.thinking.top).toBeGreaterThanOrEqual(pending.rows[0].bottom)
  await page.screenshot({path:join(evidence,'ordinary-'+tagged+'-pending.png')})
  expect(f.requests).toHaveLength(1)
  f.release();await f.host.agent.whenIdle();await page.evaluate(()=>window.probe.refresh())
  await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().historyHumans)).toBe(1)
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  const done=await page.evaluate(()=>window.probe.snapshot());expect(done.rows).toHaveLength(1)
  const frames=await page.evaluate(()=>window.probe.frames),active=frames.filter(frame=>frame.page==='conversation')
  expect(active.length).toBeGreaterThan(0)
  for(const frame of active){expect(frame.rows).toHaveLength(1);expect(frame.rows[0].text).toContain(tagged?f.brief:initial)}
  expect(active.some(frame=>frame.historyHumans===0)).toBe(true);expect(active.some(frame=>frame.historyHumans===1)).toBe(true)
  await writeFile(join(evidence,'ordinary-'+tagged+'-frames.json'),JSON.stringify(frames,null,2))
  const users=f.host.agent.session.events.filter(event=>event.type==='user/message'&&event.data.source?.kind==='user');expect(users).toHaveLength(1);expect(users[0].data.source.rpcId).toBe(f.requests[0].rpcId);expect(users[0].data.content).toEqual(f.requests[0].payload.content)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)

it('keeps the actual pending user before a durable Host file-context prelude until the real human receipt arrives',async()=>{
 const f=await fixture({prelude:true}),{page}=f
 try{
  await page.evaluate(()=>window.probe.shell.setDraft('📎 附件研究.pptx 请整理版式，保留文字。'))
  await page.getByRole('button',{name:'发送消息',exact:true}).click();await expect.poll(()=>f.entered).toBe(true);await page.evaluate(()=>window.probe.refresh())
  const journal=f.host.agent.session.events,pending=await page.evaluate(()=>window.probe.snapshot())
  // The actual SDK opens turn/start before pre-step and appends step/start
  // only after pre-step returns. Do not fabricate a step event at this gate.
  expect(journal.some(event=>event.type==='turn/start')).toBe(true);expect(journal.some(event=>event.type==='user/message'&&event.data.source?.plugin==='fixture-file-context')).toBe(true)
  expect(journal.some(event=>event.type==='user/message'&&event.data.source?.kind==='user')).toBe(false)
  expect(pending.historyHumans).toBe(0);expect(pending.rows).toHaveLength(1);expect(pending.rows[0].text).toContain('附件研究.pptx');expect(pending.thinking.text).toContain('正在思考');expect(pending.thinking.top).toBeGreaterThanOrEqual(pending.rows[0].bottom)
  const groups=await page.locator('[data-chat-flow-kind="execution"]').evaluateAll(elements=>elements.map(el=>({top:el.getBoundingClientRect().top,text:el.innerText,key:el.dataset.chatFlowKey})))
  expect(groups.length).toBeGreaterThan(0);expect(groups.every(group=>group.top>=pending.rows[0].bottom)).toBe(true)
  await writeFile(join(evidence,'actual-durable-prelude-before-human.json'),JSON.stringify({journal,pending,groups},null,2));await page.screenshot({path:join(evidence,'actual-durable-prelude-before-human.png')})
  f.release();await f.host.agent.whenIdle();await page.evaluate(()=>window.probe.refresh());await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().historyHumans)).toBe(1)
  expect((await page.evaluate(()=>window.probe.snapshot())).rows).toHaveLength(1);expect(await page.locator('[data-native-submitted-user]').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)

it.each([['server',false],['transport',false],['server',true],['transport',true]])('retracts a refused actual %s request while preserving newer user input (annotation %s)',async(rejected,annotations)=>{
 const f=await fixture({rejected,annotations}),{page}=f
 try{
  await page.evaluate(()=>window.probe.send());await expect.poll(()=>f.requests.length).toBe(1)
  await expect.poll(()=>page.locator('[data-native-submitted-user]').count()).toBe(1)
  await page.evaluate(()=>window.probe.shell.setDraft('用户后来写的新草稿📌'))
  f.reject();await expect.poll(()=>page.locator('[data-native-submitted-user]').count()).toBe(0)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe('用户后来写的新草稿📌')
  expect(await page.evaluate(()=>window.probe.session.getSnapshot().promptError?.op)).toBe('send')
  expect(f.host.agent.session.events.filter(event=>event.type==='user/message'&&event.data.source.kind==='user')).toHaveLength(0)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)

it.each(['owner','denied'])('does not retain trusted pending pins after a durable %s boundary',async boundary=>{
 const f=await fixture({annotations:true}),{page}=f
 try{
  await page.evaluate(()=>window.probe.send());await expect.poll(()=>f.entered).toBe(true)
  f.release();await f.host.agent.whenIdle();await page.evaluate(()=>window.probe.refresh())
  await expect.poll(()=>f.annotationCalls.filter(call=>call.method==='messagePresentation').length).toBe(1)
  expect(await page.locator('[data-pptx-sent-reference]').count()).toBe(2)
  if(boundary==='owner')await page.evaluate(()=>window.probe.switchOwner());else f.denyAnnotation()
  f.releasePresentation();await expect.poll(()=>page.locator('[data-pptx-sent-reference]').count()).toBe(0)
  if(boundary==='owner'){expect(await page.evaluate(()=>window.probe.snapshot().rows)).toHaveLength(0);expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe('普通会话的新草稿📌')}
  else expect((await page.evaluate(()=>window.probe.snapshot())).rows[0].text).toContain('.ework/pptx-annotations/')
  expect(f.requests).toHaveLength(1);expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)

it('uses the real native image gallery for sent temporary image bytes without exposing base64 JSON',async()=>{
 const f=await fixture({rejected:'server'}),{page}=f
 try{
  await page.evaluate(()=>{window.probe.addImage();window.probe.send()});await expect.poll(()=>f.requests.length).toBe(1)
  await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().images.length)).toBe(1)
  const pending=await page.evaluate(()=>window.probe.snapshot()),raw=f.requests[0].payload.content
  expect(raw[0]).toMatchObject({type:'image',mediaType:'image/png',name:'实际图像.png'})
  expect(pending.images[0]).toEqual({src:'data:'+raw[0].mediaType+';base64,'+raw[0].data,alt:'实际图像.png'})
  await expect.poll(()=>page.locator('[data-native-submitted-user] img').evaluate(img=>parseFloat(img.closest('button').style.width))).toBe(120)
  expect(pending.rows[0].text).not.toContain(raw[0].data);expect(pending.rows[0].text).toContain(f.brief)
  await page.screenshot({path:join(evidence,'ordinary-image-pending.png')})
  f.reject();await expect.poll(()=>page.locator('[data-native-submitted-user]').count()).toBe(0)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.imageIds.length)).toBe(1)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)

it('does not resurrect an old first-send projection in another selected native session',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>window.probe.send());await expect.poll(()=>f.entered).toBe(true)
  await expect.poll(()=>page.locator('[data-native-submitted-user]').count()).toBe(1)
  await page.evaluate(()=>window.probe.switchOwner());await expect.poll(()=>page.evaluate(()=>window.probe.current)).toBe('ordinary')
  expect(await page.evaluate(()=>window.probe.snapshot().rows)).toHaveLength(0)
  f.release();await f.host.agent.whenIdle();await page.evaluate(()=>window.probe.refresh())
  expect(await page.evaluate(()=>window.probe.snapshot().rows)).toHaveLength(0)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe('普通会话的新草稿📌')
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)

it('removes only the ephemeral row when the native cancellation request is sent',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>window.probe.send());await expect.poll(()=>f.entered).toBe(true)
  await expect.poll(()=>page.locator('[data-native-submitted-user]').count()).toBe(1)
  await page.evaluate(()=>{window.probe.shell.setDraft('取消后原稿📌');void window.probe.session.cancel()})
  await expect.poll(()=>page.locator('[data-native-submitted-user]').count()).toBe(0)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe('取消后原稿📌')
  expect(f.requests).toHaveLength(1);expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)

it.each(['ppt','report'])('keeps the existing %s preset user projection single and cancellable',async kind=>{
 const f=await fixture({kind,mount:true}),{page}=f
 try{
  await page.evaluate(()=>window.probe.send());await expect.poll(()=>f.entered).toBe(true)
  await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().rows.length)).toBe(1)
  expect(await page.locator('[data-home-guide-user-submission]').count()).toBe(1)
  expect(await page.locator('[data-native-submitted-user]').count()).toBe(0)
  await page.evaluate(()=>window.probe.disposeGuide())
  await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().rows.length)).toBe(0)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)

it('shows a subsequent actual user below prior history and above new pre-step thinking through durable handoff',async()=>{const f=await fixture({history:true}),{page}=f;try{await page.evaluate(()=>{window.probe.shell.setDraft('第二轮真实新问题📌');window.probe.sample()});await page.getByRole('button',{name:'发送消息',exact:true}).click();await expect.poll(()=>f.entered).toBe(true);await page.evaluate(()=>window.probe.refresh());await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().running)).toBe(true);const pending=await page.evaluate(()=>window.probe.snapshot());await writeFile(join(evidence,'later-round-pending.json'),JSON.stringify(pending,null,2));expect(pending.rows).toHaveLength(2);expect(pending.rows[0].text).toContain('之前已完成的真实请求');expect(pending.rows[1].text).toContain('第二轮真实新问题📌');expect(pending.thinking.top).toBeGreaterThanOrEqual(pending.rows[1].bottom);const heldFrames=await page.evaluate(()=>window.probe.frames);for(const frame of heldFrames.filter(frame=>frame.requestRpcs.length&&frame.running&&frame.thinking)){const row=frame.rows.find(row=>row.text.includes('第二轮真实新问题📌'));expect(row).toBeDefined();expect(frame.thinking.top).toBeGreaterThanOrEqual(row.bottom)}await writeFile(join(evidence,'later-round-held-frames.json'),JSON.stringify(heldFrames,null,2));f.release();await f.host.agent.whenIdle();await page.evaluate(()=>window.probe.refresh());await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().historyHumans)).toBe(2);expect(await page.locator('[data-native-submitted-user]').count()).toBe(0);expect(f.errors).toEqual([])}finally{await f.close()}},30000)

it('retains the exact accepted user before thinking when the actual Host page omits that human, then dedupes on full history',async()=>{const f=await fixture({history:true,historyLimit:1}),{page}=f;try{await page.evaluate(()=>{window.probe.shell.setDraft('真实截断窗口仍保留本轮用户📌');window.probe.sample()});await page.getByRole('button',{name:'发送消息',exact:true}).click();await expect.poll(()=>f.entered).toBe(true);await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().running)).toBe(true);await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().historyHumans)).toBe(0);const snapshot=await page.evaluate(()=>window.probe.snapshot());expect(snapshot.rows).toHaveLength(1);expect(snapshot.rows[0].text).toContain('真实截断窗口仍保留本轮用户📌');expect(snapshot.thinking.top).toBeGreaterThanOrEqual(snapshot.rows[0].bottom);expect(f.host.agent.session.events.some(event=>event.type==='user/message'&&event.data.source?.rpcId===f.requests[0].rpcId)).toBe(false);await writeFile(join(evidence,'truncated-pre-step.json'),JSON.stringify({snapshot,events:await page.evaluate(()=>window.probe.history)},null,2));await page.screenshot({path:join(evidence,'truncated-pre-step.png')});f.release();await f.host.agent.whenIdle();await page.evaluate(()=>window.probe.refresh());await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().running)).toBe(false);expect(await page.locator('[data-native-submitted-user]').count()).toBe(1);f.setHistoryLimit(100);await page.evaluate(()=>window.probe.refresh());await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().historyHumans)).toBe(2);await expect.poll(()=>page.locator('[data-native-submitted-user]').count()).toBe(0);const final=await page.evaluate(()=>window.probe.snapshot());expect(final.rows).toHaveLength(2);expect(final.rows[0].text).toContain('之前已完成的真实请求');expect(final.rows[1].text).toContain('真实截断窗口仍保留本轮用户📌');expect(f.errors).toEqual([])}finally{await f.close()}},30000)

it('keeps the real previous Host window completed while its genuine running event arrives before fresh history',async()=>{const f=await fixture({history:true}),{page}=f;try{await page.evaluate(()=>{window.probe.pauseHistory();window.probe.shell.setDraft('状态先到仍先显示用户📌');window.probe.sample()});await page.getByRole('button',{name:'发送消息',exact:true}).click();await expect.poll(()=>f.entered).toBe(true);await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().running)).toBe(true);const pending=await page.evaluate(()=>({snapshot:window.probe.snapshot(),turns:[...window.probe.session.getSnapshot().chat.timeline.turns.keys()],nativeRunning:window.probe.session.getSnapshot().running,groups:[...document.querySelectorAll('[data-chat-flow-kind="execution"]')].map(el=>({key:el.dataset.chatFlowKey,state:el.dataset.state,top:el.getBoundingClientRect().top}))}));expect(pending.turns).toEqual([1]);expect(pending.snapshot.rows).toHaveLength(2);expect(pending.groups.find(group=>group.key==='execution:1').state).toBe('complete');expect(pending.groups.filter(group=>group.state==='running')).toHaveLength(1);expect(pending.snapshot.thinking.top).toBeGreaterThanOrEqual(pending.snapshot.rows[1].bottom);await writeFile(join(evidence,'real-status-before-history.json'),JSON.stringify(pending,null,2));await page.screenshot({path:join(evidence,'real-status-before-history.png')});await page.evaluate(()=>{window.probe.pauseHistory(false);return window.probe.refresh()});await expect.poll(()=>page.evaluate(()=>[...window.probe.session.getSnapshot().chat.timeline.turns.keys()].includes(2))).toBe(true);expect((await page.evaluate(()=>window.probe.snapshot())).thinking.top).toBeGreaterThanOrEqual((await page.evaluate(()=>window.probe.snapshot())).rows[1].bottom);f.release();await f.host.agent.whenIdle();await page.evaluate(()=>window.probe.refresh());await expect.poll(()=>page.locator('[data-native-submitted-user]').count()).toBe(0);expect(f.errors).toEqual([])}finally{await f.close()}},30000)

it.each(['queue','steer'])('keeps two real %s requests in Native order and never duplicates the native steering mirror',async mode=>{const f=await fixture({history:true}),{page}=f;try{await page.evaluate(()=>{window.probe.shell.setDraft('第一条待处理请求📌');window.probe.sample();window.probe.send()});await expect.poll(()=>f.entered).toBe(true);await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().running)).toBe(true);await page.evaluate(mode=>{window.probe.shell.setDraft('第二条'+mode+'请求📈');window.probe.send(mode)},mode);await expect.poll(()=>f.requests.length).toBe(2);await expect.poll(()=>page.evaluate(()=>window.probe.session.getSnapshot().queue.length)).toBeGreaterThan(0);const pending=await page.evaluate(()=>window.probe.snapshot());expect(pending.rows).toHaveLength(mode==='queue'?2:3);expect(pending.rows[0].text).toContain('之前已完成的真实请求');expect(pending.rows[1].text).toContain('第一条待处理请求📌');if(mode==='steer')expect(pending.rows[2].text).toContain('第二条'+mode+'请求📈');if(mode==='queue')expect(pending.rows[1].bottom).toBeLessThanOrEqual(pending.thinking.top);if(mode==='steer'){const receipt=page.locator('[data-steering-receipt]');await expect.poll(()=>receipt.innerText()).toContain('补充已收到');expect(await receipt.evaluate(el=>el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(pending.rows[2].bottom);expect(await page.locator('[data-response-progress][data-state=running]').count()).toBe(0);expect(await page.locator('[data-pending-steering]').count()).toBe(1);expect(await page.locator('[data-native-submitted-user]').count()).toBe(1)}else{expect(await page.locator('[data-queue-dock]').innerText()).toContain('第二条queue请求📈');expect(pending.rows.some(row=>row.text.includes('第二条queue请求📈'))).toBe(false)};await writeFile(join(evidence,'multiple-'+mode+'-pending.json'),JSON.stringify({pending,envelopes:await page.evaluate(()=>window.probe.observed.filter(frame=>frame.type==='server-request'))},null,2));f.release();await f.host.agent.whenIdle();await page.evaluate(()=>window.probe.refresh());await expect.poll(()=>page.locator('[data-native-submitted-user]').count()).toBe(0);const final=await page.evaluate(()=>window.probe.snapshot());expect(final.rows).toHaveLength(3);expect(final.rows[1].text).toContain('第一条待处理请求📌');expect(final.rows[2].text).toContain('第二条'+mode+'请求📈');const raw=f.host.agent.session.events.filter(event=>event.type==='user/message'&&f.requests.some(request=>request.rpcId===event.data.source?.rpcId));expect(raw).toHaveLength(2);expect(f.errors).toEqual([])}finally{await f.close()}},30000)

it('retains the actual transport request when Native ConversationRoot mounts after the send',async()=>{const f=await fixture(),{page}=f;try{await page.evaluate(()=>window.probe.hideView());await expect.poll(()=>page.locator('textarea').count()).toBe(0);await page.evaluate(()=>{window.probe.shell.setDraft('真实请求先于视图挂载📌');window.probe.send()});await expect.poll(()=>f.entered).toBe(true);expect(f.requests).toHaveLength(1);await page.evaluate(()=>{window.probe.showView();return window.probe.refresh()});await page.locator('textarea').waitFor();await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().running)).toBe(true);const pending=await page.evaluate(()=>window.probe.snapshot());expect(pending.rows).toHaveLength(1);expect(pending.rows[0].text).toContain('真实请求先于视图挂载📌');expect(pending.thinking.top).toBeGreaterThanOrEqual(pending.rows[0].bottom);f.release();await f.host.agent.whenIdle();await page.evaluate(()=>window.probe.refresh());await expect.poll(()=>page.locator('[data-native-submitted-user]').count()).toBe(0);expect((await page.evaluate(()=>window.probe.snapshot())).rows).toHaveLength(1);expect(f.errors).toEqual([])}finally{await f.close()}},30000)

it('shows an unclaimed queued request only in the real QueueDock, admits it once, and keeps distinct same-text RPCs through late queue replay',async()=>{
 const f=await fixture({history:true,queueLive:true}),{page}=f,text='相同需求：继续检查附件布局。'
 try{
  await page.evaluate(text=>{window.probe.shell.setDraft(text);window.probe.send('queue')},text);await expect.poll(()=>f.entered).toBe(true)
  await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().rows.length)).toBe(2)
  await page.evaluate(text=>{window.probe.shell.setDraft(text);window.probe.send('queue')},text)
  await expect.poll(()=>f.requests.length).toBe(2);await expect.poll(()=>f.host.agent.inbox.nextTurn.length).toBe(1)
  await expect.poll(()=>page.locator('[data-queue-dock]').count()).toBe(1)
  const queued=await page.evaluate(()=>({snapshot:window.probe.snapshot(),queue:window.probe.session.getSnapshot().queue,frame:window.probe.observed.findLast(frame=>frame.type==='server-request'&&frame.payload?.type==='session/queue'&&frame.payload.items.some(row=>row.placement==='queued'))}))
  await writeFile(join(evidence,process.env.SHERLOCK_QUEUE_ADMISSION_BASELINE==='1'?'queued-baseline-red.json':'queued-green.json'),JSON.stringify({queued,requests:f.requests,journal:f.host.agent.session.events},null,2));await page.screenshot({path:join(evidence,process.env.SHERLOCK_QUEUE_ADMISSION_BASELINE==='1'?'queued-baseline-red.png':'queued-green.png')})
  expect(f.requests[0].rpcId).not.toBe(f.requests[1].rpcId);expect(queued.snapshot.rows).toHaveLength(2);expect(await page.locator('[data-queue-dock]').innerText()).toContain(text)
  expect(queued.queue.find(row=>row.placement==='queued').source.rpcId).toBe(f.requests[1].rpcId)
  f.release();await f.host.agent.whenIdle();await page.evaluate(()=>window.probe.refresh());await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().historyHumans)).toBe(3)
  const done=await page.evaluate(()=>window.probe.snapshot());expect(done.rows).toHaveLength(3);expect(done.rows.filter(row=>row.text.includes(text))).toHaveLength(2)
  expect(f.host.agent.session.events.filter(event=>event.type==='user/message'&&f.requests.some(request=>request.rpcId===event.data.source?.rpcId))).toHaveLength(2)
  await page.evaluate(frame=>window.probe.mux(frame),queued.frame);await expect.poll(()=>page.locator('[data-queue-dock]').count()).toBe(0)
  expect((await page.evaluate(()=>window.probe.snapshot())).rows).toHaveLength(3);expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)

it('edits, removes and promotes real queued messages through Native QueueDock without premature or stale chat bubbles',async()=>{
 const f=await fixture({history:true,queueLive:true}),{page}=f
 try{
  await page.evaluate(()=>{window.probe.shell.setDraft('先完成正在处理的任务');window.probe.send('queue')});await expect.poll(()=>f.entered).toBe(true)
  await page.evaluate(()=>{window.probe.shell.setDraft('排队原稿');window.probe.send('queue')});await expect.poll(()=>f.host.agent.inbox.nextTurn.length).toBe(1)
  await page.locator('[data-queue-dock]').getByRole('button',{name:'编辑排队消息',exact:true}).click();await page.getByRole('textbox',{name:'编辑排队消息',exact:true}).fill('编辑后的排队需求');await page.getByRole('button',{name:'保存排队修改',exact:true}).click()
  await expect.poll(()=>f.host.agent.inbox.nextTurn[0]?.content[0]?.text).toBe('编辑后的排队需求');expect((await page.evaluate(()=>window.probe.snapshot())).rows).toHaveLength(2)
  const removedRpc=f.requests[1].rpcId
  await page.locator('[data-queue-dock]').getByRole('button',{name:'删除排队消息',exact:true}).click();await expect.poll(()=>f.host.agent.inbox.nextTurn.length).toBe(0);await expect.poll(()=>page.locator('[data-queue-dock]').count()).toBe(0)
  expect((await page.evaluate(()=>window.probe.snapshot())).rows).toHaveLength(2)
  await page.evaluate(()=>{window.probe.shell.setDraft('编辑后的排队需求');window.probe.send('queue')});await expect.poll(()=>f.host.agent.inbox.nextTurn.length).toBe(1)
  await page.locator('[data-queue-dock]').getByRole('button',{name:'立即插话',exact:true}).click();await expect.poll(()=>f.host.agent.inbox.nextStep.some(message=>message.source?.rpcId===f.requests[2].rpcId)).toBe(true)
  await expect.poll(()=>page.locator('[data-queue-dock]').count()).toBe(0);await expect.poll(()=>page.locator('[data-pending-steering]').count()).toBe(1)
  const promoted=await page.evaluate(()=>window.probe.snapshot());expect(promoted.rows).toHaveLength(3);expect(promoted.rows[2].text).toContain('编辑后的排队需求')
  await writeFile(join(evidence,'queue-controls-promoted.json'),JSON.stringify({promoted,requests:f.requests,journal:f.host.agent.session.events},null,2))
  f.release();await f.host.agent.whenIdle();await page.evaluate(()=>window.probe.refresh());await expect.poll(()=>page.locator('[data-pending-steering]').count()).toBe(0)
  expect((await page.evaluate(()=>window.probe.snapshot())).rows).toHaveLength(3);expect(f.host.agent.session.events.some(event=>event.type==='user/message'&&event.data.source?.rpcId===removedRpc)).toBe(false);expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)
