import {stripConversationTransientUi} from './fixtures/strip-conversation-transient-ui.mjs'
import {execFileSync} from 'node:child_process'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {presentationHostFixture} from './fixtures/home-presentation-host.js'
import {patchHomeGuidePresentationNative} from '../scripts/lib/home-guide-presentation-native.mjs'

const evidence=process.env.SHERLOCK_USER_FIRST_EVIDENCE||'/tmp/release140-user-message-first-20261027/browser-current'
let browser,bundle,runtimeSource,nativeSource,triggersSource
beforeAll(async()=>{
 runtimeSource=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 const normalized=execFileSync(process.execPath,['--input-type=module','-e',"import{readFileSync}from'node:fs';import{stripSidebarNewNoteConversation}from'./scripts/lib/sidebar-new-note.mjs';import{stripPptxAnnotationMessages}from'./scripts/lib/pptx-annotation-message.mjs';import{stripPptxAnnotationInput}from'./scripts/lib/pptx-annotation-native.mjs';process.stdout.write(stripPptxAnnotationInput(stripPptxAnnotationMessages(stripSidebarNewNoteConversation(readFileSync(0,'utf8')))))"],{input:stripConversationTransientUi(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),encoding:'utf8',maxBuffer:64*1024*1024})
 const patch=process.env.SHERLOCK_USER_FIRST_BASELINE_PATH?(await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_USER_FIRST_BASELINE_PATH).href)).patchHomeGuidePresentationNative:patchHomeGuidePresentationNative
 nativeSource=patch(normalized).replace('exports.apply = apply;','exports.apply = apply;exports.__InputBar=InputBar;exports.__Chat=ChatView;exports.__User=UserMessageNodeView;exports.__Assistant=AssistantNodeView;exports.__Tail=TurnTailNodeView;exports.__register=registerConversationNodes;exports.__header=ConversationSessionHeader;exports.__userRowClass=MessageItem_module_css_default.userRow;exports.__bind=deps=>{HomePresentationNativeDeps=deps};')
 triggersSource=await readFile('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8')
 const result=await build({entryPoints:['test/fixtures/home-guide-user-message-browser.tsx'],bundle:true,platform:'browser',format:'iife',write:false,loader:{'.svg':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"development"'}})
 bundle=result.outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())

async function fixture({kind='ppt',mount=true,rejected=false}={}){
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
 await page.evaluate(value=>Object.assign(window,value),{actorKind:kind,cwd:host.cwd,sourcePath,brief})
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

it.each(['ppt','report'])('paints the actual complete %s user message before pre-step thinking and deduplicates the durable handoff',async kind=>{
 const f=await fixture({kind}),{page}=f
 try{
  const before=await page.evaluate(()=>({draft:window.probe.shell.snapshot.draft,refs:window.probe.shell.snapshot.occurrences.map(ref=>ref.source)}))
  expect(before.refs).toEqual(kind==='ppt'?['ework-managed-skill','chat-file']:['ework-managed-skill'])
  await page.evaluate(async()=>{window.probe.sample();await new Promise(resolve=>requestAnimationFrame(resolve));window.probe.send()})
  await expect.poll(()=>f.requests.length).toBe(1)
  await expect.poll(()=>f.entered).toBe(true)
  await page.evaluate(()=>window.probe.refresh())
  const pending=await page.evaluate(()=>window.probe.snapshot())
  await page.screenshot({path:join(evidence,kind+'-user-before-thinking.png')})
  await writeFile(join(evidence,kind+'-pending.json'),JSON.stringify({pending,wire:f.requests[0],errors:f.errors},null,2)+'\n')
  expect(pending.phase).toBe('active');expect(pending.running).toBe(true);expect(pending.historyHumans).toBe(0)
  expect(pending.rows).toHaveLength(1)
  expect(pending.rows[0].text).toContain(f.brief)
  expect(pending.rows[0].chips.some(text=>text.includes(kind==='ppt'?'efund-ppt-maker':'ework-equity-research'))).toBe(true)
  expect(pending.rows[0].chips.some(text=>text.includes('Vanguard-2026经济与市场展望.pdf'))).toBe(kind==='ppt')
  expect(pending.thinking.text).toContain('正在思考');expect(pending.thinking.top).toBeGreaterThanOrEqual(pending.rows[0].bottom)
  const raw=f.requests[0].payload.content.map(part=>part.type==='text'?part.text:'').join('')
  expect(raw).toBe((kind==='ppt'?'/ework-skill-180a6a3f86f8942e 📎 文件：`'+f.sourcePath+'`':'/ework-skill-778d85796a6c426b')+' '+f.brief)
  f.release();await f.accepted()
  await expect.poll(()=>page.evaluate(()=>{void window.probe.refresh();return window.probe.snapshot().historyHumans})).toBe(1)
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  const done=await page.evaluate(()=>window.probe.snapshot())
  expect(done.historyHumans).toBe(1);expect(done.rows).toHaveLength(1);expect(done.rows[0].text).toContain(f.brief)
  const durable=f.host.agent.session.events.filter(event=>event.type==='user/message'&&event.data.source.kind==='user')
  expect(durable).toHaveLength(1);expect(durable[0].data.content).toEqual(f.requests[0].payload.content);expect(durable[0].data.source.rpcId).toBe(f.requests[0].rpcId)
  const frames=await page.evaluate(()=>window.probe.frames),conversationFrames=frames.filter(frame=>frame.page==='conversation')
  expect(frames.some(frame=>frame.page==='home')).toBe(true)
  expect(conversationFrames.length).toBeGreaterThan(0)
  for(const frame of conversationFrames){expect(frame.rows).toHaveLength(1);expect(frame.rows[0].text).toContain(f.brief)}
  expect(conversationFrames.some(frame=>frame.historyHumans===0)).toBe(true);expect(conversationFrames.some(frame=>frame.historyHumans===1)).toBe(true)
  await writeFile(join(evidence,kind+'-raf-handoff.json'),JSON.stringify(frames,null,2)+'\n')
  expect(f.host.outside).toEqual([])
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)

it.each(['server','transport'])('drops a %s-refused transient send without clearing the newer actual composer draft',async rejected=>{
 const f=await fixture({rejected}),{page}=f
 try{
  await page.evaluate(()=>window.probe.send());await expect.poll(()=>f.requests.length).toBe(1)
  await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().rows.length)).toBe(1)
  await page.evaluate(()=>window.probe.shell.setDraft('用户随后输入的新草稿📌'))
  f.reject()
  await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().rows.length)).toBe(0)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe('用户随后输入的新草稿📌')
  expect(await page.evaluate(()=>window.probe.session.getSnapshot().promptError.op)).toBe('send')
  expect(f.host.agent.session.events.filter(event=>event.type==='user/message'&&event.data.source.kind==='user')).toHaveLength(0)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)

it('keeps a late old-session admission out of the newly selected ordinary shell',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>window.probe.send());await expect.poll(()=>f.entered).toBe(true)
  await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().rows.length)).toBe(1)
  expect(await page.locator('[data-home-guide-user-submission]').count()).toBe(1)
  await page.evaluate(()=>window.probe.switchOwner())
  await expect.poll(()=>page.evaluate(()=>window.probe.current)).toBe('ordinary')
  expect(await page.evaluate(()=>window.probe.snapshot().rows)).toHaveLength(0)
  f.release();await f.host.agent.whenIdle();await page.evaluate(()=>window.probe.refresh())
  expect(await page.evaluate(()=>window.probe.snapshot().rows)).toHaveLength(0)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe('普通会话的新草稿📌')
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)

it('does not project a non-demo prompt while its ordinary native task is preparing',async()=>{
 const f=await fixture({mount:false}),{page}=f
 try{
  await page.evaluate(()=>window.probe.send());await expect.poll(()=>f.entered).toBe(true);await page.evaluate(()=>window.probe.refresh())
  expect(await page.evaluate(()=>window.probe.snapshot().rows)).toHaveLength(0)
  f.release();await f.host.agent.whenIdle();await page.evaluate(()=>window.probe.refresh())
  expect(await page.evaluate(()=>window.probe.snapshot().rows)).toHaveLength(1)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)

it('clears the actual disposed guide projection without taking the newer draft or reviving it on late completion',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>window.probe.send());await expect.poll(()=>f.entered).toBe(true)
  await expect.poll(()=>page.evaluate(()=>window.probe.snapshot().rows.length)).toBe(1)
  expect(await page.locator('[data-home-guide-user-submission]').count()).toBe(1)
  await page.evaluate(()=>{window.probe.shell.setDraft('取消前用户另写的新草稿📌');window.probe.disposeGuide()})
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)))
  expect(await page.evaluate(()=>window.probe.snapshot().rows)).toHaveLength(0)
  f.release();await f.host.agent.whenIdle();await page.evaluate(()=>window.probe.refresh())
  expect(await page.evaluate(()=>window.probe.shell.snapshot.draft)).toBe('取消前用户另写的新草稿📌')
  const snapshot=await page.evaluate(()=>window.probe.snapshot())
  expect(snapshot.rows.length).toBe(snapshot.historyHumans)
  expect(await page.locator('[data-home-guide-user-submission]').count()).toBe(0)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)
