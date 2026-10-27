import {execFileSync} from 'node:child_process'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {stripConversationTransientUi} from './fixtures/strip-conversation-transient-ui.mjs'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {presentationHostFixture} from './fixtures/home-presentation-host.js'
const require=createRequire(import.meta.url)
const {patchHomeGuidePresentationNative}=require('../scripts/lib/home-guide-presentation-native.mjs')

const evidence=process.env.SHERLOCK_SUBMISSION_EVIDENCE||'/tmp/post140-conversation-20261027/browser'
let browser,bundle,runtimeSource,nativeSource,triggersSource
beforeAll(async()=>{
 runtimeSource=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 const normalized=execFileSync(process.execPath,['--input-type=module','-e',"import{readFileSync}from'node:fs';import{stripSidebarNewNoteConversation}from'./scripts/lib/sidebar-new-note.mjs';import{stripPptxAnnotationMessages}from'./scripts/lib/pptx-annotation-message.mjs';import{stripPptxAnnotationInput}from'./scripts/lib/pptx-annotation-native.mjs';process.stdout.write(stripPptxAnnotationInput(stripPptxAnnotationMessages(stripSidebarNewNoteConversation(readFileSync(0,'utf8')))))"],{input:stripConversationTransientUi(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),encoding:'utf8',maxBuffer:64*1024*1024})
 const patch=process.env.SHERLOCK_SUBMISSION_BASELINE==='1'?source=>patchHomeGuidePresentationNative(source):source=>patchConversationResponseProgress(patchConversationSubmission(patchHomeGuidePresentationNative(source)))
 let patchConversationSubmission,patchConversationResponseProgress;if(process.env.SHERLOCK_SUBMISSION_BASELINE!=='1'){({patchConversationSubmission}=require('../scripts/lib/conversation-submission.mjs'));({patchConversationResponseProgress}=require('../scripts/lib/conversation-response-progress.mjs'))}
 nativeSource=patch(normalized).replace('exports.apply = apply;','exports.apply = apply;exports.__watchSubmitted=typeof NativeConversationSubmissions==="undefined"?undefined:deps=>NativeConversationSubmissions.watch(deps);exports.__InputBar=InputBar;exports.__Chat=ChatView;exports.__User=UserMessageNodeView;exports.__Assistant=AssistantNodeView;exports.__Tail=TurnTailNodeView;exports.__register=registerConversationNodes;exports.__header=ConversationSessionHeader;exports.__userRowClass=MessageItem_module_css_default.userRow;exports.__bind=deps=>{HomePresentationNativeDeps=deps};')
 triggersSource=await readFile('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8')
 const result=await build({entryPoints:['test/fixtures/conversation-submission-browser.tsx'],bundle:true,platform:'browser',format:'iife',write:false,loader:{'.svg':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"development"'}})
 bundle=result.outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())

async function fixture({kind='ppt',mount=false,rejected=false}={}){
 const host=await presentationHostFixture(),page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'}),errors=[],requests=[]
 const origin='http://127.0.0.1:'+host.ctx.get('webServer').port
 const sourcePath=join(host.cwd,'Vanguard-2026经济与市场展望.pdf'),brief='请基于当前资料梳理研究结论，保留来源与时点。中文与 emoji 📈 均应完整。',guidePath=kind==='report'?'/sherlock/home-guide/report':'/sherlock/home-guide/presentation'
 if(kind==='report')await writeFile(join(host.home,'research-board-directories.json'),JSON.stringify({example:{sessionId:'demo',path:host.cwd,title:'研究报告示例'}}))
 if(!mount)await writeFile(sourcePath,host.sourceBytes)
 let releaseStep,releaseReject,entered=false,prepared
 const held=new Promise(resolve=>releaseStep=resolve),rejectGate=new Promise(resolve=>releaseReject=resolve)
 const off=host.ctx.on('agent/pre-step',async(event,next)=>{if(event.messages.some(message=>message.source?.rpcId==='user-first-1')){entered=true;await held}return next()})
 page.on('pageerror',error=>errors.push(error.stack??error.message))
 await page.exposeFunction('userMessageBackend',async input=>{
  if(input.action==='history')return{events:await host.request(host.api.sessions.history,{sessionId:host.agent.id,maxMessages:100}).then(value=>value.events),running:host.agent.status==='running'}
  if(input.action==='send'){
   requests.push(input.request)
   if(rejected){await rejectGate;if(rejected==='transport')throw Error('原生传输中断');return{type:'server-response',rpcId:input.request.rpcId,result:{ok:false,error:{code:'fixture-rejected',message:'真实请求被拒绝'}}}}
   return host.api.sessions.prompt(input.request)
  }
  if(input.action==='cancel')return host.api.sessions.cancel(input.request)
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
 await page.evaluate(value=>Object.assign(window,value),{actorKind:kind,cwd:host.cwd,sourcePath,brief,registered:mount})
 for(const [source,key] of [[runtimeSource,'runtimeDescriptor'],[nativeSource,'conversationDescriptor'],[triggersSource,'triggersDescriptor']]){await page.addScriptTag({content:source});await page.evaluate(key=>window[key]=window.descriptor,key)}
 const css=(await Promise.all(['figma-final-shell','figma-home','figma-panels','figma-inline-references','figma-reading','figma-refinements','home-guides'].map(name=>readFile('src/preload/'+name+'.css','utf8')))).join('\n')
 await page.addStyleTag({content:css+'\nhtml,body{margin:0;height:100%;font-family:system-ui}.pI_x6G_centerCol{position:relative;height:900px;width:1000px}#native-root{height:100%}[data-home-guide]{position:absolute;inset:0;pointer-events:none}.wSkVaW_root{height:100%}'})
 await page.addScriptTag({content:bundle})
 await page.waitForSelector('textarea')
 if(mount)await page.evaluate(()=>window.probe.mount())
 if(prepared)await page.evaluate(value=>{window.brief=value.brief;if(value.sourcePath)window.sourcePath=value.sourcePath},prepared)
 await page.evaluate(()=>window.probe.seed())
 const accepted=async()=>{const response=await fetch(origin+guidePath,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({action:'checkpoint',sessionId:'demo',runId:'user-message-run',stage:'accepted'})});const value=await response.json();if(!response.ok||!value.ok)throw Error(value.message);return value}
 return{host,page,requests,errors,get sourcePath(){return prepared?.sourcePath??sourcePath},get brief(){return prepared?.brief??brief},get entered(){return entered},release:()=>releaseStep(),accepted,reject:()=>releaseReject(),close:async()=>{releaseStep();releaseReject();off();await page.evaluate(()=>window.probe.unmount()).catch(()=>{});await page.close();await host.dispose()}}
}


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

it.each(['server','transport'])('retracts a refused actual %s request while preserving newer user input',async rejected=>{
 const f=await fixture({rejected}),{page}=f
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
