import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {join} from 'node:path'
import {build} from 'esbuild'
import {presentationHostFixture} from './fixtures/home-presentation-host.js'
import {PptxAnnotationService} from '../src/main/pptx/annotations'
import {stripConversationOuterUi} from './fixtures/strip-conversation-transient-ui.mjs'
const req=createRequire(import.meta.url),{patchPptxAnnotationInput,stripPptxAnnotationInput}=req('../scripts/lib/pptx-annotation-native.mjs'),{patchPptxAnnotationMessages,stripPptxAnnotationMessages}=req('../scripts/lib/pptx-annotation-message.mjs'),{patchConversationSubmission}=req('../scripts/lib/conversation-submission.mjs'),{patchConversationResponseProgress}=req('../scripts/lib/conversation-response-progress.mjs')
const evidence=process.env.SHERLOCK_ANNOTATION_NUMBER_EVIDENCE||'/tmp/ppt-annotation-live-numbering-20261027/frontend';let browser,script,sources,css
beforeAll(async()=>{
 const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),base=stripPptxAnnotationInput(stripPptxAnnotationMessages(stripConversationOuterUi(raw)))
 const conversation=patchConversationSubmission(patchConversationResponseProgress(patchPptxAnnotationMessages(patchPptxAnnotationInput(base)))).replace('exports.apply = apply;','exports.apply = apply;exports.__watchSubmitted=deps=>NativeConversationSubmissions.watch(deps);exports.__InputBar=InputBar;exports.__Chat=ChatView;exports.__User=UserMessageNodeView;exports.__Assistant=AssistantNodeView;exports.__Tail=TurnTailNodeView;exports.__register=registerConversationNodes;exports.__header=ConversationSessionHeader;exports.__userRowClass=MessageItem_module_css_default.userRow;exports.__startAnnotation=deps=>(PptxAnnotationNativeRuntime=createPptxAnnotationNativeRuntime({...deps,window,document}));exports.__bind=deps=>{HomePresentationNativeDeps=deps};')
 sources={conversation,runtime:await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'),triggers:await readFile('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8')}
 script=(await build({entryPoints:['test/fixtures/conversation-submission-browser.tsx'],bundle:true,write:false,platform:'browser',format:'iife',loader:{'.svg':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"development"'}})).outputFiles[0].text
 css=(await Promise.all(['figma-final-shell','figma-home','figma-panels','figma-inline-references','figma-reading','figma-refinements','home-guides'].map(name=>readFile('src/preload/'+name+'.css','utf8')))).join('\n')
 const pw=await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())
it('keeps live pin one across true prepared pending and durable history while canonical wire still targets mark two',async()=>{
 const host=await presentationHostFixture(),page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'}),errors=[],requests=[],values=[];let releaseStep,releaseReceipt
 const step=new Promise(resolve=>releaseStep=resolve),receipt=new Promise(resolve=>releaseReceipt=resolve)
 const off=host.ctx.on('agent/pre-step',async(event,next)=>{if(event.messages.some(message=>message.source?.rpcId==='user-first-1'))await step;return next()})
 const service=new PptxAnnotationService({root:join(host.home,'annotation-state'),owner:()=> 'fixture-owner',resolveWorkspace:async id=>id==='demo'?host.cwd:null,resolveAuthorizedSource:async()=>null,readHistory:async()=>({events:(await host.request(host.api.sessions.history,{sessionId:'demo',maxMessages:100})).events.map(row=>row.event??row),hasMore:false}),presentationSkill:async()=>({id:'builtin:efund-ppt-maker',invocationName:'ework-skill-180a6a3f86f8942e',label:'/efund-ppt-maker'})})
 await writeFile(join(host.cwd,'annotation-source.pptx'),host.bytes)
 page.on('pageerror',error=>errors.push(error.stack??error.message))
 await page.exposeFunction('annotationBackend',async(method,input)=>{if(method==='messagePresentation')await receipt;const result=await service[method](input);values.push({method,input:structuredClone(input),result:structuredClone(result)});return result})
 await page.exposeFunction('userMessageBackend',async input=>{
  if(input.action==='history')return{events:(await host.request(host.api.sessions.history,{sessionId:'demo',maxMessages:100})).events,running:host.agent.status==='running'}
  if(input.action==='send'){requests.push(input.request);return host.api.sessions.prompt(input.request)}
  if(input.action==='cancel')return host.api.sessions.cancel(input.request)
  throw Error('Unexpected private carrier')
 })
 await page.route('https://numbering.local/**',route=>route.fulfill({contentType:'text/html',body:'<html lang="zh"><meta charset="utf-8"><div class="pI_x6G_centerCol"><div id="native-root"></div></div><script>window.__ModuleLoader__={load:value=>window.descriptor=value}</script></html>'}))
 try{
  await page.goto('https://numbering.local/');await page.evaluate(value=>Object.assign(window,value),{cwd:host.cwd,actorKind:'ppt',registered:false,annotationEnabled:true,sourcePath:join(host.cwd,'source.pdf'),brief:'保留用户原意。'})
  for(const [name,source]of Object.entries(sources)){await page.addScriptTag({content:source});await page.evaluate(name=>window[name+'Descriptor']=window.descriptor,name)}
  await page.addStyleTag({content:css+'\nhtml,body{margin:0;height:100%;font-family:system-ui}.pI_x6G_centerCol{position:relative;height:900px;width:1000px}#native-root{height:100%}.wSkVaW_root{height:100%}'})
  await page.addScriptTag({content:script});await page.waitForSelector('textarea');await page.evaluate(()=>probe.seedAnnotations())
  const original=await page.evaluate(async()=>{const api=window[Symbol.for('sherlock:pptx-annotation-input')],handle=await api.open({sessionId:'demo',source:{kind:'workspace',relativePath:'annotation-source.pptx'}},{viewerKey:'second-live-view'}),before=handle.getSnapshot().marks;await handle.remove(before[0].id);return{before,live:handle.getSnapshot().marks}})
  expect(original.live.map(mark=>[mark.ordinal,mark.canonicalOrdinal])).toEqual([[1,2]])
  await expect.poll(()=>page.locator('[data-pptx-annotation-tag] .pptxa-reference-number').allTextContents()).toEqual(['1'])
  await page.evaluate(()=>{probe.sample();window.numberFrames=[];const tick=()=>{window.numberFrames.push({time:performance.now(),page:document.querySelector('[data-odyssey-page]')?.getAttribute('data-odyssey-page'),numbers:[...document.querySelectorAll('[data-pptx-sent-reference] .pptxa-reference-number')].map(node=>node.textContent),ids:[...document.querySelectorAll('[data-pptx-sent-reference]')].map(node=>node.dataset.pptxSentReference)});window.numberFrame=requestAnimationFrame(tick)};window.numberFrame=requestAnimationFrame(tick)});await page.getByRole('button',{name:'发送消息',exact:true}).click()
  await expect.poll(()=>requests.length).toBe(1);await expect.poll(()=>page.locator('[data-pptx-sent-reference]').count()).toBe(1)
  const target=original.live[0].id,pending=page.locator('[data-pptx-sent-reference="'+target+'"]');expect(await pending.locator('.pptxa-reference-number').innerText()).toBe('1')
  const text=requests[0].payload.content.filter(part=>part.type==='text').map(part=>part.text).join('');expect(text).toContain('[PPT 标注 2 · 第 3 页]');expect(text).not.toContain('[PPT 标注 1')
  const prepared=values.find(value=>value.method==='prepare').result.value;expect(prepared.serializedReferences.map(value=>value.reference.markId)).toEqual([target])
  await page.screenshot({path:join(evidence,'pending-live-one-canonical-two.png')})
  releaseStep();await host.agent.whenIdle();await page.evaluate(()=>probe.refresh());await expect.poll(()=>page.locator('[data-native-submitted-user]').count()).toBe(0)
  await page.waitForTimeout(2700);expect(await pending.locator('.pptxa-reference-number').innerText()).toBe('1');releaseReceipt()
  await expect.poll(()=>values.some(value=>value.method==='messagePresentation')).toBe(true)
  expect(values.find(value=>value.method==='messagePresentation').result.value.spans.map(span=>[span.reference.markId,span.ordinal])).toEqual([[target,2]])
  expect(await pending.locator('.pptxa-reference-number').innerText()).toBe('1');await page.screenshot({path:join(evidence,'durable-live-one-canonical-two.png')})
  const frames=await page.evaluate(()=>probe.frames),numberFrames=await page.evaluate(()=>window.numberFrames),active=frames.filter(frame=>frame.page==='conversation');for(const frame of active){expect(frame.rows).toHaveLength(1);expect(frame.rows[0].pins).toBe(1);expect(frame.rows[0].text).not.toContain('.ework/pptx-annotations/')}
  const numberActive=numberFrames.filter(frame=>frame.page==='conversation');expect(numberActive.length).toBeGreaterThan(3);for(const frame of numberActive){expect(frame.numbers).toEqual(['1']);expect(frame.ids).toEqual([target])}
  const humans=host.agent.session.events.filter(event=>event.type==='user/message'&&event.data.source?.kind==='user');expect(humans).toHaveLength(1);expect(humans[0].data.content).toEqual(requests[0].payload.content)
  await writeFile(join(evidence,'frames-and-canonical-wire.json'),JSON.stringify({frames,numberFrames,request:requests[0],prepared,mainPresentation:values.find(value=>value.method==='messagePresentation'),original},null,2));expect(errors).toEqual([])
 }finally{releaseStep();releaseReceipt();off();await page.evaluate(()=>{cancelAnimationFrame(window.numberFrame);probe.unmount()}).catch(()=>{});await page.close();await host.dispose()}
},30000)
