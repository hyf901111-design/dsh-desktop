import {readFile,mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {build} from 'esbuild'
import {beforeAll,afterAll,expect,it} from 'vitest'

// Browser plugin not available. This headless fixture keeps the production
// ConversationRoot, InputBar, session store and Figma styles; only external I/O
// and the tutorial's content adapter are replaced.
const evidence='/tmp/home-presentation-shell-20261024'
let browser,runtimeSource,conversationSource,entry,styles
beforeAll(async()=>{
 runtimeSource=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 conversationSource=(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.__InputBar=InputBar;exports.__header=ConversationSessionHeader;exports.__register=registerConversationNodes;')
 styles=(await Promise.all(['figma-final-shell','figma-home','figma-panels','figma-reading','figma-refinements'].map(name=>readFile('src/preload/'+name+'.css','utf8')))).join('\n')
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot}from'react-dom/client';import{mountHomeGuides}from'./src/preload/home-guides';
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 const empty=()=>null,primitives=new Proxy({Tooltip:({children})=>children},{get:(target,key)=>target[key]??empty}),cordis={Service:class{constructor(ctx){this.ctx=ctx}}};
 const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/cordis'?cordis:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{DropOverlay:empty,AttachmentRail:empty}:fake;
 const rt=window.runtimeDescriptor.factory(modules),native=window.conversationDescriptor.factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id));
 const disposers=[],ctx={get:()=>undefined,reflect:{provide(){}},effect(start){const stop=start();if(typeof stop==='function')disposers.push(stop);return stop??(()=>{})}};
 const events=new rt.ConversationEventRegistry(ctx),viewRegistry=new rt.ConversationViewRegistry(ctx);native.__register({...ctx,conversationEvents:events,conversationViews:viewRegistry});
 const sessionsRuntime=new rt.SessionRuntime(ctx,{sessions:{}},{},{events,views:viewRegistry}),session=sessionsRuntime.manager.get('shell-demo');session.openState='open';
 session.installWindow(window.shellCase.hero?[]:[{event:{seq:1,time:1,type:'user/message',surfaceOp:'append',data:{id:'shell-user',role:'user',source:{kind:'user'},content:[{type:'text',text:'请根据原始研报制作公司风格汇报。'}]}},view:'user/message'}],false);
 const store=initial=>{let value=initial;const listeners=new Set();return{getSnapshot:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},update:patch=>{value={...value,...patch};listeners.forEach(fn=>fn())}}};
 const view=store({view:'chat',draft:'',selection:null}),summary=store({byId:{'shell-demo':{id:'shell-demo',displayTitle:'公司风格演示示例',cwd:'/tmp/shell-demo',blank:window.shellCase.hero}}});
 const shell=new native.SessionInputShell({actx:{},defaultSink:async()=>{window.shellProbe.sent++}});shell.setDraft('根据 Vanguard 研报制作八页公司风格汇报。');
 const use=store=>select=>select(React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot)),useSession=use({subscribe:fn=>session.subscribe(fn),getSnapshot:()=>session.getSnapshot()}),useInput=use(shell.state),useStore=use(view),useSessions=use(summary);
 const views={subscribe:()=>()=>{},version:()=>0,list:()=>[{id:'chat',label:'对话'}]},actions={setView:value=>view.update({view:value}),setDraft:draft=>view.update({draft}),select(){},setInspect(){},setResearchRightTab(){},setResearchConversationUnread(){}};
 const t=key=>({'hero.headline':'探索更远，洞见更深。','input.send':'发送消息','input.placeholder':'描述你的任务…','placeholder.hero':'描述你的任务…'})[key]??key;
 const shared={sessionId:'shell-demo',useSession,useSessions,useStore,actions,views,t},inputProps={resolveSubmitMode:()=> 'queue',useSession,useInput,inputActions:shell.actions,keyboard:shell,useNotices:select=>select(null),useLexicon:select=>select(new Map()),useMenuLauncher:select=>select(null),useProjection:()=>undefined,sessionId:'shell-demo',t};
 const renderSlot=(name,props={})=>name==='conversation.session.header'?<native.__header {...shared} renderSlot={renderSlot} open={()=>{}} rename={async()=>{}}/>:name==='conversation.session'?<native.ConversationSession {...shared} {...props} useInput={useInput} inputActions={shell.actions} renderSlot={renderSlot} bindDraftMirror={()=>()=>{}} releaseSessionImages={()=>{}} releaseResearchWorkspace={()=>{}}/>:name==='conversation.composer.bar'?<native.__InputBar {...inputProps} {...props} renderSlot={()=>null}/>:name==='conversation.view'?<article data-native-history>{Array.from({length:18},(_,i)=><p key={i} data-history-row={i}>研报观点 {i+1}：核对数据时点、情景假设与配置逻辑，逐页保留来源。</p>)}</article>:null;
 const sidebarState={composerHost:null,conversationHost:null},sidebar={storeFor:()=>({subscribe:()=>()=>{},getSnapshot:()=>sidebarState}),publish(){},enter(){},leave(){}},registry=new native.ResearchWorkspaceRegistry({getItem:()=>null,setItem:()=>true});
 const root=createRoot(document.querySelector('#native-root'));root.render(<native.ConversationRoot {...shared} useProjection={()=>undefined} useInput={useInput} useComposerBlock={()=>undefined} renderSlot={renderSlot} renderSlotChain={(_name,_props,{fallback})=>fallback} selectWorkspace={async()=>{}} useWorkspaces={select=>select({phase:'ready',items:[{workspaceId:'w',title:'示例工作区',sessionIds:['shell-demo']}]})} researchWorkspaces={registry} researchSidebar={sidebar} setResearchActive={()=>{}}/>);
 let guideStatus=()=>{};const adapter=async(_document,_host,options)=>{guideStatus=options.onStatus;return{runStep:async()=>{},dispose(){}}},controller=mountHomeGuides(document,{mountNotes:adapter,mountPresentation:adapter});
 const receive=event=>{const request=event.detail;window.dispatchEvent(new CustomEvent('sherlock:home-guide-session-reply',{detail:{requestId:request.requestId,ok:true,sessionId:'shell-demo',cwd:'/tmp/shell-demo',title:'公司风格演示示例',fresh:true}}))};window.addEventListener('sherlock:home-guide-session-request',receive);
 window.shellProbe={sent:0,shell,controller,status:text=>guideStatus(text),async start(){await controller.start('ppt');document.querySelector('.odyssey-home-guide-footer button').click()},async close(){await controller.reset(false)},async dispose(){await controller.dispose();root.unmount();shell.dispose();window.removeEventListener('sherlock:home-guide-session-request',receive);disposers.reverse().forEach(fn=>fn())}};
 `},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'raw-css',setup(b){b.onResolve({filter:/\.css\?raw$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw-css'}));b.onLoad({filter:/.*/,namespace:'raw-css'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}}]})
 entry=output.outputFiles[0].text
 const mod=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href),pw=mod.default??mod
 browser=await pw.chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())

async function fixture({width,height,hero}){
 const page=await browser.newPage({viewport:{width:1380,height},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/*',route=>route.fulfill({contentType:route.request().url().endsWith('/')?'text/html':'application/json',body:route.request().url().endsWith('/')?'<meta charset="utf-8"><title>PPT tutorial shell geometry</title><main class="pI_x6G_centerCol"><div id="native-root"></div></main><script>window.__ModuleLoader__={load:d=>window.descriptor=d}</script>':'{"plans":[]}'}))
 await page.goto('https://presentation-shell.local/');await page.evaluate(value=>window.shellCase=value,{width,height,hero})
 await page.addScriptTag({content:runtimeSource});await page.evaluate(()=>window.runtimeDescriptor=window.descriptor)
 await page.addScriptTag({content:conversationSource});await page.evaluate(()=>window.conversationDescriptor=window.descriptor)
 await page.addStyleTag({content:styles+`\nhtml,body{margin:0;height:100%;font-family:system-ui}.pI_x6G_centerCol{position:relative;width:${width}px;height:100vh}#native-root{height:100%;min-height:0}[data-native-history]{padding:12px 24px;font-size:14px;line-height:24px}`})
 await page.addScriptTag({content:entry});await page.waitForSelector('textarea',{timeout:4000})
 await page.evaluate(()=>window.originalShellInput=document.querySelector('textarea'))
 return{page,errors,close:async()=>{await page.evaluate(()=>window.shellProbe.dispose()).catch(()=>{});await page.close()}}
}
async function geometry(page){return page.evaluate(()=>{
 const rect=node=>{const r=node.getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}},resident=document.querySelector('.wSkVaW_root'),input=document.querySelector('textarea'),send=resident.querySelector('button.uV2eYG_primary'),footer=document.querySelector('.odyssey-home-guide-footer'),hit=node=>{const r=node.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return node===top||node.contains(top)},scroll=resident.querySelector('.wSkVaW_scrollBody')
 return{phase:resident.dataset.phase,input:rect(input),send:rect(send),footer:footer?rect(footer):null,sendHit:hit(send),inputHit:hit(input),sameInput:input===window.originalShellInput,heroVisible:!resident.querySelector('.wSkVaW_composerHero')||getComputedStyle(resident.querySelector('.wSkVaW_composerHero')).visibility==='visible',scroll:rect(scroll),scrollable:scroll.scrollHeight>scroll.clientHeight,resident:rect(resident)}
})}

// Removing the tutorial's reserved surface must make these fail: the real
// send button then sits below the controls in every active conversation.
for(const value of [{width:1000,height:900,hero:false},{width:620,height:700,hero:false},{width:420,height:480,hero:false},{width:1000,height:900,hero:true},{width:620,height:480,hero:true}]){
 it(`keeps the native ${value.hero?'hero':'active'} input above tutorial controls in a ${value.width}×${value.height} pane`,async()=>{
  const f=await fixture(value),{page}=f
  try{
   const ordinary=await geometry(page);await page.evaluate(()=>window.shellProbe.start());await page.waitForSelector('[data-home-guide-kind="ppt"]')
   await expect.poll(async()=>!!(await geometry(page)).footer).toBe(true)
   const layout=await geometry(page)
   expect(layout.phase).toBe(value.hero?'hero':'active');expect(layout.sameInput).toBe(true);expect(layout.heroVisible).toBe(true)
   expect(layout.send.bottom).toBeLessThanOrEqual(layout.footer.top);expect(layout.input.bottom).toBeLessThanOrEqual(layout.footer.top)
   expect(layout.sendHit).toBe(true);expect(layout.inputHit).toBe(true);expect(layout.input.width).toBeGreaterThan(200)
   if(!value.hero){expect(layout.scroll.height).toBeGreaterThan(90);expect(layout.scrollable).toBe(true);await page.locator('.wSkVaW_scrollBody').evaluate(node=>{node.scrollTop=node.scrollHeight});expect(await page.locator('[data-history-row="17"]').evaluate(node=>{const rect=node.getBoundingClientRect(),area=node.closest('.wSkVaW_scrollBody').getBoundingClientRect();return rect.top>=area.top&&rect.bottom<=area.bottom})).toBe(true)}
   await page.screenshot({path:evidence+'/'+(value.hero?'hero':'active')+'-'+value.width+'x'+value.height+'.png'})
   await page.locator('textarea').fill('输入框仍是可使用的真实会话输入');expect(await page.evaluate(()=>window.shellProbe.shell.snapshot.draft)).toBe('输入框仍是可使用的真实会话输入')
   await page.locator('button.uV2eYG_primary').click();expect(await page.evaluate(()=>window.shellProbe.sent)).toBe(1)
   await page.evaluate(()=>window.shellProbe.close());const restored=await geometry(page)
   expect(restored.resident.height).toBeCloseTo(ordinary.resident.height,0);expect(restored.send.bottom).toBeCloseTo(ordinary.send.bottom,0);expect(restored.sameInput).toBe(true);expect(restored.sendHit).toBe(true);expect(f.errors).toEqual([])
  }finally{await f.close()}
 },15000)
}

it('reserves the actual controls height when a narrow pane and a longer status wrap the footer',async()=>{
 const f=await fixture({width:1000,height:560,hero:false}),{page}=f
 try{
  await page.evaluate(()=>window.shellProbe.start())
  const wide=await geometry(page)
  await page.evaluate(()=>{document.querySelector('.pI_x6G_centerCol').style.width='420px';window.shellProbe.status('正在核对原始研报中的数据时点、研究假设与图表来源。每页保留原报告页码，并把历史预测与当前信息区分，确认后再交付八页可编辑公司风格汇报。')})
  await expect.poll(()=>page.evaluate(()=>parseFloat(document.querySelector('.pI_x6G_centerCol').style.getPropertyValue('--odyssey-home-guide-controls-height'))===Math.ceil(document.querySelector('.odyssey-home-guide-footer').getBoundingClientRect().height+20))).toBe(true)
  await expect.poll(async()=>{const layout=await geometry(page);return layout.footer.height>wide.footer.height&&layout.send.bottom<=layout.footer.top&&layout.sendHit&&layout.inputHit}).toBe(true)
  const layout=await geometry(page)
  expect(layout.input.width).toBeGreaterThan(200);expect(layout.scroll.height).toBeGreaterThan(90)
  await page.screenshot({path:evidence+'/active-dynamic-footer.png'});expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
