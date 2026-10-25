import {readFile,mkdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {annotationMessageFixture} from './fixtures/pptx-annotation-message.js'

const req=createRequire(import.meta.url)
// Before the feature exists, exercise the real resident renderer as the RED baseline.
let install=source=>source
try{install=req('../scripts/lib/pptx-annotation-message.mjs').patchPptxAnnotationMessages}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error}
let browser,client,runtime,bootstrap,nativeCss,extraCss
const evidence='/tmp/pptx-annotation-message-browser-20261026'
beforeAll(async()=>{
 runtime=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 const source=install(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 client=source.replace('exports.apply = apply;','exports.apply = apply;exports.__Chat=ChatView;exports.__User=UserMessageNodeView;exports.__register=registerConversationNodes;')
 nativeCss=[...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match=>JSON.parse(match[1])).filter(css=>css.includes('.gdEzaW_bubble')).join('\n')
 extraCss=await readFile('src/preload/figma-inline-references.css','utf8')
 bootstrap=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot}from'react-dom/client';import {mountDesktopShellStyles}from'./src/preload/shell-style';
 const empty=()=>null,fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 const primitives=new Proxy({Tooltip:({children})=>children,JsonBlock:({payload})=><pre data-native-extra="">{JSON.stringify(payload)}</pre>,writeClipboard:async text=>{window.probe.copied.push(text);return true}},{get:(t,k)=>t[k]??empty});
 const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/cordis'?{Service:class{constructor(ctx){this.ctx=ctx}}}:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{ImageGallery:({images})=><div data-native-images={images.length}/>,AttachmentRail:empty}:fake;
 mountDesktopShellStyles(document);const rt=window.runtimeDescriptor.factory(modules),native=window.conversationDescriptor.factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id));
 const disposers=[],ctx={get:()=>undefined,reflect:{provide(){}},effect(start){const stop=start();if(typeof stop==='function')disposers.push(stop);return stop??(()=>{})}},events=new rt.ConversationEventRegistry(ctx),views=new rt.ConversationViewRegistry(ctx);
 native.__register({...ctx,conversationEvents:events,conversationViews:views});
 const manager=new rt.SessionRuntime(ctx,{sessions:{}},{},{events,views}),payload=window.fixturePayload;
 window.probe={calls:[],copied:[],selected:[],pending:[],failures:[],defer:payload.defer===true,proof:payload.proof,reject:payload.apiError,apiFailure:payload.apiFailure,history:[],native,manager};
 window.sherlockPptAnnotations={messagePresentation:async input=>{window.probe.calls.push(structuredClone(input));if(window.probe.reject)throw Error('unavailable');if(window.probe.apiFailure)return{ok:false,code:'forbidden',error:'not available'};if(window.probe.defer)return new Promise((resolve,reject)=>{window.probe.pending.push(resolve);window.probe.failures.push(reject)});return{ok:true,value:input.sendingSessionId===payload.sessionId?structuredClone(window.probe.proof):null}}};
 window[Symbol.for('sherlock:pptx-annotation-input')]={selectReference:value=>window.probe.selected.push(value)};
 const record=(sessionId,text=payload.text,source={kind:'user',rpcId:payload.rpcId},parts)=>{
  const session=manager.manager.get(sessionId);session.openState='open';session.blankBit=false;session.handleRunning(false);
  const history=[{seq:9,time:1009,type:'user/message',data:{id:'actual-user',role:'user',source,content:parts??[{type:'text',text}]},surfaceOp:'append'}];
  session.installWindow(history.map(event=>({event,view:event.type})),false);window.probe.history.push(...history);return session;
 };
 const sessions=new Map([[payload.sessionId,record(payload.sessionId,payload.text,payload.source,payload.parts)]]),root=createRoot(document.querySelector('#root'));
 let change;const t=key=>key;
 function App(){const [sessionId,setId]=React.useState(payload.sessionId);change=setId;const session=sessions.get(sessionId);const useSession=select=>select(React.useSyncExternalStore(fn=>session.subscribe(fn),()=>session.getSnapshot(),()=>session.getSnapshot()));return <native.__Chat sessionId={sessionId} useSession={useSession} useSessions={select=>select({byId:{[sessionId]:{cwd:'/tmp/annotation-message'}}})} useStore={select=>select({selection:null,view:'chat'})} renderSlot={(name,props,scope)=>name==='conversation.chat.node'&&['user','steering'].includes(scope.entryKey)?<native.__User {...props} t={t}/>:null} openFile={()=>{}} loadOlder={async()=>{}} loadImage={async()=>null} inspectCall={()=>{}} chatScroll={{read:()=>null,save(){}}} forkAt={()=>{}} fileMentions={()=>({resolve:()=>undefined})} t={t}/>}
 window.probe.switchSession=sessionId=>{if(!sessions.has(sessionId))sessions.set(sessionId,record(sessionId));dom.flushSync(()=>change(sessionId))};
 window.probe.resolve=value=>window.probe.pending.splice(0).forEach(resolve=>resolve({ok:true,value}));window.probe.resolveFirst=value=>window.probe.pending.shift()?.({ok:true,value});
 window.probe.dispose=()=>{root.unmount();disposers.reverse().forEach(fn=>fn())};
 dom.flushSync(()=>root.render(<App/>));
 `},bundle:true,write:false,format:'iife',platform:'browser',plugins:[{name:'raw-css',setup(b){b.onResolve({filter:/\.css\?raw$/},a=>({path:a.path.startsWith('.')?resolve(a.resolveDir,a.path.slice(0,-4)):req.resolve(a.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async a=>({contents:'export default '+JSON.stringify(await readFile(a.path,'utf8')),loader:'js'}))}}]})).outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())
async function fixture(payload=annotationMessageFixture(),{width=760,dark=false}={}){
 const page=await browser.newPage({viewport:{width,height:800},deviceScaleFactor:2}),errors=[]
 page.on('pageerror',e=>errors.push(e.stack??e.message))
 const html=`<title>Native annotation sent messages</title><style>${nativeCss}\n${extraCss}\nbody{margin:16px;background:${dark?'#202020':'#f6f6f6'};font-family:system-ui}#root{width:100%}</style><body ${dark?'data-ds-dark-theme':''}><main class="sRp_messages" id="root"></main></body>`
 await page.route('https://annotation-message.test/**',route=>route.fulfill(new URL(route.request().url()).pathname==='/'?{contentType:'text/html',body:html}:{contentType:'application/json',body:'{"tasks":[],"plans":[]}'}))
 await page.goto('https://annotation-message.test/')
 const boot=async()=>{
  await page.evaluate(payload=>{window.fixturePayload=payload;window.__ModuleLoader__={load:descriptor=>window.descriptor=descriptor}},payload)
  await page.addScriptTag({content:runtime});await page.evaluate(()=>window.runtimeDescriptor=window.descriptor)
  await page.addScriptTag({content:client});await page.evaluate(()=>window.conversationDescriptor=window.descriptor)
  await page.addScriptTag({content:bootstrap});await page.locator('.gdEzaW_bubble').waitFor({timeout:3000}).catch(async error=>{throw Error(JSON.stringify({errors,body:await page.locator('body').innerText(),nodes:await page.evaluate(()=>window.probe?Object.values(window.probe.manager.manager.sessions??{}):null)})+' '+error.message)})
 }
 await boot();return{page,errors,boot,close:()=>page.close()}
}
it('projects actual durable native user nodes into two pins while preserving authored text and raw copy',async()=>{
 const value=annotationMessageFixture(),f=await fixture(value)
 try{
  await expect.poll(()=>f.page.locator('[data-pptx-sent-reference]').count()).toBe(2)
  const body=await f.page.locator('.gdEzaW_bubble').innerText()
  for(const comment of value.comments)expect(body).toContain(comment)
  expect(body).toContain(value.overall);expect(body).not.toContain('修改清单');expect(body).not.toContain('1-source.pptx');expect(body).not.toContain(value.skill)
  expect(await f.page.locator('[data-pptx-sent-skill]').innerText()).toBe('/efund-ppt-maker')
  expect(await f.page.evaluate(()=>window.probe.calls)).toEqual([{sendingSessionId:value.sessionId,preparedId:value.proof.preparedId,userSeq:9,submissionId:value.rpcId,text:value.text}])
  await f.page.getByRole('button',{name:'copy',exact:true}).click()
  expect(await f.page.evaluate(()=>window.probe.copied)).toEqual([value.text]);expect(await f.page.evaluate(()=>window.probe.history[0].data.content[0].text)).toBe(value.text)
  await f.page.getByRole('button',{name:'标注 1 · '+value.proof.spans[0].label,exact:true}).click({timeout:1500})
  expect(await f.page.evaluate(()=>JSON.parse(window.probe.selected[0]))).toEqual(value.proof.spans[0].reference)
  await f.page.getByRole('button',{name:'标注 1 · '+value.proof.spans[0].label,exact:true}).press('Enter');expect(await f.page.evaluate(()=>window.probe.selected.length)).toBe(2)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it.each(['missing','changed-text','foreign-reference','rejected'])('keeps the real authored message untouched for a %s readonly proof',async kind=>{
 const value=annotationMessageFixture()
 if(kind==='missing')value.proof=null
 if(kind==='changed-text')value.proof.text+=' altered'
 if(kind==='foreign-reference')value.proof.spans[0].reference.sessionId='another-session'
 if(kind==='rejected')value.proof={ok:false}
 const f=await fixture(value)
 try{await expect.poll(()=>f.page.evaluate(()=>window.probe.calls.length)).toBe(1);await f.page.waitForTimeout(50);expect(await f.page.locator('[data-pptx-sent-reference]').count()).toBe(0);expect(await f.page.locator('.gdEzaW_bubble').innerText()).toBe(value.text);expect(f.errors).toEqual([])}finally{await f.close()}
},10000)
it('does not request annotation presentation for ordinary prose or legacy user nodes without a real RPC',async()=>{
 for(const value of [{...annotationMessageFixture(),source:{kind:'user'}},{...annotationMessageFixture(),text:'用户自己写的正文：保留 /not-a-managed-skill、目录和段落。\n\n下一段。'}]){
  const f=await fixture(value)
  try{await f.page.waitForTimeout(40);expect(await f.page.evaluate(()=>window.probe.calls)).toEqual([]);expect(await f.page.locator('[data-pptx-sent-reference]').count()).toBe(0);expect(await f.page.locator('.gdEzaW_bubble').innerText()).toBe(value.text);expect(f.errors).toEqual([])}finally{await f.close()}
 }
},10000)
it('ignores an old proof after the actual native session changes',async()=>{
 const value={...annotationMessageFixture(),defer:true},f=await fixture(value)
 try{
  await expect.poll(()=>f.page.evaluate(()=>window.probe.pending.length)).toBe(1)
  await f.page.evaluate(()=>window.probe.switchSession('another-session'))
  await expect.poll(()=>f.page.evaluate(()=>window.probe.calls.length)).toBe(2)
  await f.page.evaluate(proof=>window.probe.resolve(proof),value.proof);await f.page.waitForTimeout(50)
  expect(await f.page.locator('[data-pptx-sent-reference]').count()).toBe(0);expect(await f.page.locator('.gdEzaW_bubble').innerText()).toBe(value.text);expect(f.errors).toEqual([])
 }finally{await f.close()}
},10000)
it('invalidates pending and rendered projection on the real account-reset event',async()=>{
 const value={...annotationMessageFixture(),defer:true},f=await fixture(value)
 try{
  await expect.poll(()=>f.page.evaluate(()=>window.probe.pending.length)).toBe(1)
  await f.page.evaluate(()=>window.dispatchEvent(new CustomEvent('sherlock:skill-menu-reset')))
  await expect.poll(()=>f.page.evaluate(()=>window.probe.calls.length)).toBe(2)
  await f.page.evaluate(proof=>window.probe.resolveFirst(proof),value.proof);await f.page.waitForTimeout(40)
  expect(await f.page.locator('[data-pptx-sent-reference]').count()).toBe(0)
  await f.page.evaluate(()=>window.probe.resolve(null));expect(await f.page.locator('.gdEzaW_bubble').innerText()).toBe(value.text);expect(f.errors).toEqual([])
 }finally{await f.close()}
},10000)
it('reopens a cold real SessionRuntime without any frontend submission map and preserves images and extra blocks',async()=>{
 const value=annotationMessageFixture(),at=value.text.indexOf(value.comments[1])
 value.parts=[{type:'text',text:value.text.slice(0,at)},{type:'text',text:value.text.slice(at)},{type:'image',attachment:{id:'original-image'}},{type:'custom-json',original:true}]
 const f=await fixture(value)
 try{
  await expect.poll(()=>f.page.locator('[data-pptx-sent-reference]').count()).toBe(2)
  expect(await f.page.locator('[data-native-images]').getAttribute('data-native-images')).toBe('1');expect(await f.page.locator('[data-native-extra]').innerText()).toContain('"original":true')
  expect(await f.page.evaluate(()=>window.probe.calls[0].text)).toBe(value.text)
  await f.page.evaluate(()=>window.probe.dispose());await f.page.reload();await f.boot()
  await expect.poll(()=>f.page.locator('[data-pptx-sent-reference]').count()).toBe(2)
  expect(await f.page.evaluate(()=>Object.keys(window.sherlockPptAnnotations))).toEqual(['messagePresentation'])
  expect(await f.page.evaluate(()=>window[Symbol.for('sherlock:pptx-annotation-input')].getSubmissions)).toBeUndefined()
  expect(await f.page.evaluate(()=>window.probe.history[0].data.content)).toEqual(value.parts);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it.each([{width:760,dark:false},{width:360,dark:false},{width:760,dark:true},{width:360,dark:true}])('keeps native HUG reference geometry readable without overflow (%j)',async options=>{
 const f=await fixture(annotationMessageFixture(),options)
 try{
  await expect.poll(()=>f.page.locator('[data-pptx-sent-reference]').count()).toBe(2)
  const metrics=await f.page.locator('[data-pptx-sent-reference]').evaluateAll(nodes=>nodes.map(node=>{const c=getComputedStyle(node),r=node.getBoundingClientRect();return{gap:c.gap,left:c.paddingLeft,right:c.paddingRight,width:r.width,height:r.height,pin:node.querySelector('img').getBoundingClientRect().width}}))
  for(const metric of metrics){expect(metric.gap).toBe('5px');expect(metric.left).toBe('6px');expect(metric.right).toBe('6px');expect(metric.pin).toBe(18);expect(metric.height).toBeGreaterThanOrEqual(22)}
  expect(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
  await f.page.screenshot({path:`${evidence}/native-${options.width}-${options.dark?'dark':'light'}.png`,fullPage:true})
  expect(await f.page.title()).toBe('Native annotation sent messages');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it.each(['apiError','apiFailure'])('falls back to the exact native message when the readonly bridge returns %s',async field=>{
 const value={...annotationMessageFixture(),[field]:true},f=await fixture(value)
 try{await expect.poll(()=>f.page.evaluate(()=>window.probe.calls.length)).toBe(1);await f.page.waitForTimeout(40);expect(await f.page.locator('[data-pptx-sent-reference]').count()).toBe(0);expect(await f.page.locator('.gdEzaW_bubble').innerText()).toBe(value.text);expect(f.errors).toEqual([])}finally{await f.close()}
},10000)
it('keeps an unproven trailing skill wire as text without affecting the proven pin ranges',async()=>{
 const value=annotationMessageFixture();delete value.proof.skill;const f=await fixture(value)
 try{await expect.poll(()=>f.page.locator('[data-pptx-sent-reference]').count()).toBe(2);expect(await f.page.locator('[data-pptx-sent-skill]').count()).toBe(0);expect(await f.page.locator('.gdEzaW_bubble').innerText()).toContain(value.overall+value.skill);expect(f.errors).toEqual([])}finally{await f.close()}
},10000)
it('does not expose an existing hidden Research header when a valid annotation occurs in its body',async()=>{
 const value=annotationMessageFixture(),prefix='␞SHERLOCK_RESEARCH_FILES_V1 '+JSON.stringify({files:[{id:'f',name:'原生材料.pdf',path:'/tmp/材料.pdf'}],occurrences:[]})+'␟'
 value.text=prefix+value.text;value.proof.text=value.text
 for(const span of [...value.proof.spans,value.proof.skill]){span.start+=prefix.length;span.end+=prefix.length}
 const f=await fixture(value)
 try{await expect.poll(()=>f.page.evaluate(()=>window.probe.calls.length)).toBe(1);await f.page.waitForTimeout(40);expect(await f.page.locator('[data-pptx-sent-reference]').count()).toBe(0);const body=await f.page.locator('.gdEzaW_bubble').innerText();expect(body).not.toContain('SHERLOCK_RESEARCH_FILES');expect(body).not.toContain('"occurrences"');expect(body).toContain(value.comments[0]);expect(body).toContain('原生材料.pdf');expect(f.errors).toEqual([])}finally{await f.close()}
},10000)
it('retries missing skill presentation when the authoritative catalog finishes loading for the same account',async()=>{
 const full=annotationMessageFixture(),value=structuredClone(full);delete value.proof.skill;const f=await fixture(value)
 const catalog={owner:'current-account',skills:[{invocationName:'ework-skill-180a6a3f86f8942e',label:'efund-ppt-maker',name:'PPT制作助手'}],tools:[]}
 try{
  await expect.poll(()=>f.page.locator('[data-pptx-sent-reference]').count()).toBe(2)
  await f.page.evaluate(()=>window.probe.defer=true)
  await f.page.evaluate(detail=>window.dispatchEvent(new CustomEvent('sherlock:skill-presentation',{detail})),catalog)
  await expect.poll(()=>f.page.evaluate(()=>window.probe.calls.length)).toBe(2)
  expect(await f.page.locator('[data-pptx-sent-reference]').count()).toBe(2);expect(await f.page.locator('[data-pptx-sent-loading]').count()).toBe(0)
  await f.page.evaluate(proof=>window.probe.resolve(proof),value.proof)
  await expect.poll(()=>f.page.locator('[data-pptx-sent-reference]').count()).toBe(2)
  await f.page.evaluate(proof=>{window.probe.proof=proof;window.probe.defer=true},full.proof)
  await f.page.evaluate(detail=>window.dispatchEvent(new CustomEvent('sherlock:skill-presentation',{detail})),catalog)
  await expect.poll(()=>f.page.evaluate(()=>window.probe.pending.length)).toBe(1)
  expect(await f.page.locator('[data-pptx-sent-reference]').count()).toBe(2);expect(await f.page.locator('[data-pptx-sent-loading]').count()).toBe(0)
  await f.page.evaluate(proof=>window.probe.resolve(proof),full.proof)
  await expect.poll(()=>f.page.locator('[data-pptx-sent-skill]').count()).toBe(1)
  expect(await f.page.locator('[data-pptx-sent-skill]').innerText()).toBe('/efund-ppt-maker')
  const count=await f.page.evaluate(()=>window.probe.calls.length);await f.page.evaluate(detail=>window.dispatchEvent(new CustomEvent('sherlock:skill-presentation',{detail})),catalog);await f.page.waitForTimeout(40);expect(await f.page.evaluate(()=>window.probe.calls.length)).toBe(count);expect(f.errors).toEqual([])
 }finally{await f.close()}
},10000)
it('shows a short neutral first paint while the real readonly receipt is pending, without flashing transport paths',async()=>{
 const value={...annotationMessageFixture(),defer:true},f=await fixture(value)
 try{
  await expect.poll(()=>f.page.evaluate(()=>window.probe.pending.length)).toBe(1)
  expect(await f.page.locator('[data-pptx-sent-loading]').innerText()).toBe('正在载入标注…')
  expect(await f.page.locator('.gdEzaW_bubble').innerText()).not.toContain('修改清单');expect(await f.page.locator('.gdEzaW_bubble').innerText()).not.toContain(value.proof.preparedId)
  expect(await f.page.locator('.gdEzaW_bubble').evaluate(node=>node.getBoundingClientRect().height)).toBeLessThan(100)
  await f.page.screenshot({path:evidence+'/native-pending.png',fullPage:true})
  await f.page.getByRole('button',{name:'copy',exact:true}).click();expect(await f.page.evaluate(()=>window.probe.copied)).toEqual([value.text])
  await f.page.evaluate(proof=>window.probe.resolve(proof),value.proof)
  await expect.poll(()=>f.page.locator('[data-pptx-sent-reference]').count()).toBe(2);expect(await f.page.locator('[data-pptx-sent-loading]').count()).toBe(0)
  expect(await f.page.locator('.gdEzaW_bubble').innerText()).toContain(value.overall);expect(f.errors).toEqual([])
 }finally{await f.close()}
},10000)
it.each(['null','rejected','error'])('restores the complete original after a delayed %s receipt instead of retaining the pending hint',async kind=>{
 const value={...annotationMessageFixture(),defer:true},f=await fixture(value)
 try{
  await expect.poll(()=>f.page.evaluate(()=>window.probe.pending.length)).toBe(1)
  expect(await f.page.locator('[data-pptx-sent-loading]').count()).toBe(1)
  await f.page.evaluate(kind=>{if(kind==='error')window.probe.failures.shift()(Error('unavailable'));else window.probe.pending.shift()(kind==='null'?{ok:true,value:null}:{ok:false,code:'forbidden',error:'no proof'})},kind)
  await expect.poll(()=>f.page.locator('.gdEzaW_bubble').innerText()).toBe(value.text)
  expect(await f.page.locator('[data-pptx-sent-loading]').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},10000)
it('bounds a never-resolving lookup and still accepts a later genuine proof for the same identity',async()=>{
 const value={...annotationMessageFixture(),defer:true},f=await fixture(value)
 try{
  await expect.poll(()=>f.page.evaluate(()=>window.probe.pending.length)).toBe(1);expect(await f.page.locator('[data-pptx-sent-loading]').count()).toBe(1)
  await expect.poll(()=>f.page.locator('.gdEzaW_bubble').innerText(),{timeout:4000}).toBe(value.text)
  expect(await f.page.locator('[data-pptx-sent-loading]').count()).toBe(0)
  await f.page.evaluate(proof=>window.probe.resolve(proof),value.proof);await expect.poll(()=>f.page.locator('[data-pptx-sent-reference]').count()).toBe(2);expect(f.errors).toEqual([])
 }finally{await f.close()}
},10000)
it('never hides ordinary authored prose which merely discusses a manifest path',async()=>{
 const value={...annotationMessageFixture(),defer:true};value.text='请解释这个路径，不要隐藏这段原话：.ework/pptx-annotations/'+value.proof.preparedId+'/manifest.json。'
 const f=await fixture(value)
 try{await expect.poll(()=>f.page.evaluate(()=>window.probe.pending.length)).toBe(1);expect(await f.page.locator('[data-pptx-sent-loading]').count()).toBe(0);expect(await f.page.locator('.gdEzaW_bubble').innerText()).toBe(value.text);await f.page.evaluate(()=>window.probe.resolve(null));expect(await f.page.locator('.gdEzaW_bubble').innerText()).toBe(value.text);expect(f.errors).toEqual([])}finally{await f.close()}
},10000)
it.each(['null','forbidden'])('keeps verified pins only while a catalog retry is pending and restores raw text after Main returns %s',async kind=>{
 const value=annotationMessageFixture();delete value.proof.skill;const f=await fixture(value)
 try{
  await expect.poll(()=>f.page.locator('[data-pptx-sent-reference]').count()).toBe(2)
  await f.page.evaluate(()=>{window.probe.defer=true;window.dispatchEvent(new CustomEvent('sherlock:skill-presentation',{detail:{owner:'same-account',skills:[],tools:[]}}))})
  await expect.poll(()=>f.page.evaluate(()=>window.probe.pending.length)).toBe(1)
  expect(await f.page.locator('[data-pptx-sent-reference]').count()).toBe(2);expect(await f.page.locator('[data-pptx-sent-loading]').count()).toBe(0)
  await f.page.evaluate(kind=>window.probe.pending.shift()(kind==='null'?{ok:true,value:null}:{ok:false,code:'forbidden',error:'no longer proven'}),kind)
  await expect.poll(()=>f.page.locator('.gdEzaW_bubble').innerText()).toBe(value.text)
  expect(await f.page.locator('[data-pptx-sent-reference]').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},10000)
