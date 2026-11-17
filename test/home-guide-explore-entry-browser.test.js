import {beforeAll,afterAll,it,expect} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
let browser,script,css,runtimeSource
beforeAll(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
 import{playExploreHomeGuideEntry}from'./src/preload/home-guide-explore-entry';import{createHomeGuidePointer}from'./src/preload/home-guide-pointer';import{installResidentEntryFixture}from'./test/fixtures/home-guide-resident-entry-browser';window.installResidentEntryFixture=installResidentEntryFixture;
 import{WorkspaceSurfaceHost}from'./src/preload/workspace-surface-host';
 window.entryFixture=(page,kind)=>{
  const moreButton='<button class="st-more" aria-label="更多" aria-haspopup="menu" aria-expanded="false">更多</button>';
  document.body.innerHTML='<nav data-dsh-sidebar-root><button aria-label="新建对话">新建对话</button><button aria-label="新建研究">新建研究</button><button data-sidebar-new-note aria-label="新建笔记">新建笔记</button>'+moreButton+'</nav><main class="pI_x6G_centerCol"><div class="wSkVaW_root"><div data-srb-tabs><button data-conversation-view-id="chat">对话</button><button data-conversation-view-id="research">研究</button><button data-conversation-view-id="notes">笔记</button><button data-conversation-view-id="spreadsheet">表格</button></div><textarea></textarea><article>原有正文</article></div></main><button id="other-session">用户切换会话</button><dialog data-explore-menu><button data-explore-close>关闭探索</button><p>当前探索用例菜单</p></dialog>';
  const root=document.querySelector('.wSkVaW_root'),sidebar=document.querySelector('nav'),input=document.querySelector('textarea'),dialog=document.querySelector('dialog'),close=document.querySelector('[data-explore-close]'),controller=new AbortController(),actions=[];let owner='source',activated=false;
  delete document.body.dataset.workspaceSurface;root.dataset.odysseyPage=page.startsWith('home')?'home':page==='notes'?'conversation':page;input.value=page.startsWith('home')&&page!=='home-draft'?'':'用户原有草稿';root.querySelector('article').hidden=page.startsWith('home');if(page==='notes'){document.body.dataset.workspaceSurface='notes';root.style.display='none'}
  if(page==='collapsed-home')sidebar.innerHTML='<button data-sidebar-home aria-label="主页">主页</button>';
  if(page==='knowledge-collapsed')sidebar.innerHTML='<button data-sidebar-home aria-label="主页">主页</button>'+moreButton;
  if(page==='collapsed-note')sidebar.querySelector('[data-sidebar-new-note]').hidden=true;
  for(const tab of root.querySelectorAll('[data-conversation-view-id]')){tab.setAttribute('aria-selected',String(tab.dataset.conversationViewId===(page==='home-research'?'research':page==='home-notes'?'notes':page.startsWith('home')?'chat':page==='notes'?'notes':page==='research'?'research':'chat')));tab.onclick=()=>{actions.push('tab:'+tab.dataset.conversationViewId)}}
  const nativeClicks=[];for(const node of sidebar.querySelectorAll('button'))node.addEventListener('click',()=>nativeClicks.push(node.getAttribute('aria-label')));
  const more=sidebar.querySelector('.st-more');if(more)more.onclick=()=>{
   actions.push('more');const menu=document.createElement('div');menu.className='st-menu';menu.dataset.sidebarMore='true';
   menu.setAttribute('popover','manual');menu.setAttribute('role','menu');
   menu.innerHTML='<button role="menuitem">新笔记</button><button role="menuitem">新建表格</button>';
   document.body.append(menu);menu.showPopover();more.setAttribute('aria-expanded','true');
   for(const button of menu.querySelectorAll('button'))button.onclick=()=>{nativeClicks.push(button.textContent);menu.remove();more.setAttribute('aria-expanded','false')};
  };
  close.onclick=()=>{actions.push('close');dialog.close()};document.querySelector('#other-session').onclick=()=>owner='foreign';dialog.showModal();
  const pointer=createHomeGuidePointer(document,{runId:'entry-'+kind,signal:controller.signal,initialPosition:{x:430,y:260},wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>Promise.resolve()});
  const frames=[];const drawn={perform:action=>pointer.perform({...action,onFrame:frame=>frames.push({target:action.target.dataset.conversationViewId||action.target.getAttribute('aria-label')||action.target.tagName,phase:frame.phase})})};
  const context={signal:controller.signal,revealComposer:async()=>{throw Error('programmatic reveal forbidden')},demoEntry:{closeTarget:close,closeOwned:async()=>close.click()}};
  window.entryProbe={controller,actions,nativeClicks,pointer,frames,preparing:false,snapshot:()=>({owner,draft:input.value,body:root.querySelector('article').textContent,activated}),start:()=>playExploreHomeGuideEntry(document,kind,{homeEmpty:window.entryHomeEmpty,context,signal:controller.signal,pointer:drawn,assert:()=>{if(owner!=='source')throw new DOMException('owner changed','AbortError')},nativeClick:node=>node.click(),activate:async(node,action,beforeCommit)=>{window.entryProbe.preparing=true;await window.entryPrepareGate;await beforeCommit();actions.push('activate:'+action);node.click();if(node===input)node.focus();activated=true}}).finally(()=>pointer.dispose())};
  if(page==='surface'||page.startsWith('knowledge-')){document.body.dataset.workspaceSurface=page==='surface'?'plugin':'knowledge';root.style.display='none';const back=document.createElement('button');const label=page==='surface'?'返回应用':'返回工作区';back.className='workspace-back-button';back.setAttribute('aria-label',label);back.textContent=label;back.onclick=()=>{actions.push('back');delete document.body.dataset.workspaceSurface;root.style.display=''};document.body.append(back)}
  if(page==='browser-over-image'||page==='settings-over-browser'){
   const host=new WorkspaceSurfaceHost(document)
   for(const surface of ['image-factory','browser']){
    const layer=document.createElement('section');layer.style.cssText='position:absolute;left:200px;top:30px;width:800px;height:650px'
    const back=document.createElement('button');back.className='workspace-back-button';back.setAttribute('aria-label','返回工作区');back.textContent='返回工作区'
    back.onclick=()=>{actions.push('back:'+surface);host.back()};layer.append(back);host.register(surface,layer);host.open(surface)
   }
  }
  if(page==='settings-over-browser'||page==='unsupported'){
   const settings=document.createElement('div');settings.className='VOzbGW_overlay';settings.style.cssText='position:fixed;inset:0;z-index:200';
   if(page==='settings-over-browser'){
    const back=document.createElement('button');back.className='sherlock-settings-back';back.textContent='返回应用';
    back.onclick=()=>{actions.push('close-settings');settings.remove()};settings.append(back)
   }
   document.body.append(settings)
  }
 };
 `},bundle:true,format:'iife',platform:'browser',write:false,logLevel:'silent',plugins:[{name:'raw-css',setup(build){build.onResolve({filter:/\.css\?raw$/},args=>({path:args.resolveDir+'/'+args.path.slice(0,-4),namespace:'raw-css'}));build.onLoad({filter:/.*/,namespace:'raw-css'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}}]});script=result.outputFiles[0].text;css=await readFile('src/preload/home-guides.css','utf8');runtimeSource=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 const p=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await(p.chromium??p.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
afterAll(()=>browser?.close())
async function fixture(start,kind,reduced=true){const context=await browser.newContext({viewport:{width:1100,height:800},reducedMotion:reduced?'reduce':'no-preference'}),page=await context.newPage();await page.route('http://127.0.0.1/guide-entry-ready',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'}));await page.goto('http://127.0.0.1/guide-entry-ready');await page.setContent('<style>body{margin:0}nav{position:fixed;left:0;top:0;width:180px;height:780px}nav button{display:block;margin:10px}main{position:absolute;left:200px;top:30px;width:800px;height:650px}.wSkVaW_root{width:100%;height:100%}textarea{width:650px;height:100px}dialog{width:650px;height:400px;margin:100px auto}[data-explore-close]{position:absolute;right:10px;top:10px}[data-sidebar-more]{position:fixed;left:10px;top:180px}#other-session{position:fixed;left:10px;bottom:0}</style>');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.evaluate(([start,kind])=>window.entryFixture(start,kind),[start,kind]);return{context,page}}

it.each(['board','note','ppt','report','workbench'].flatMap(kind=>['home','chat','research','notes'].map(start=>[kind,start])))('navigates %s from visible %s through one Explore close and native route without changing source content',async(kind,start)=>{
 const{context,page}=await fixture(start,kind);try{const before=await page.evaluate(()=>window.entryProbe.snapshot());await page.evaluate(()=>window.entryProbe.start());const result=await page.evaluate(()=>({actions:window.entryProbe.actions,clicks:window.entryProbe.nativeClicks,state:window.entryProbe.snapshot()}));expect(result.actions.filter(x=>x==='close')).toHaveLength(1);expect(result.actions[0]).toBe('close');expect(result.actions.filter(x=>x.startsWith('activate:'))).toEqual(['activate:'+(start==='home'?(kind==='note'?'home-notes':kind==='board'||kind==='workbench'?'home-research':'home-input'):kind==='note'?'new-note':kind==='board'||kind==='workbench'?'new-research':'new-chat')]);expect(result.state).toMatchObject({...before,activated:true});expect(result.clicks.length).toBe(start==='home'?0:1)}finally{await context.close()}
})
it.each(['board','note','ppt','report','workbench'])('uses the only visible Home entry for collapsed %s playback',async kind=>{
 const {context,page}=await fixture('collapsed-home',kind);try{
  const before=await page.evaluate(()=>window.entryProbe.snapshot())
  await page.evaluate(()=>window.entryProbe.start())
  const result=await page.evaluate(()=>({actions:window.entryProbe.actions,clicks:window.entryProbe.nativeClicks,state:window.entryProbe.snapshot()}))
  expect(result.actions).toEqual(['close','activate:sidebar-home'])
  expect(result.clicks).toEqual(['主页'])
  expect(result.state).toMatchObject({...before,activated:true})
 }finally{await context.close()}
})
it('uses collapsed More then its actual Note menu item and keeps the pointer above both top layers',async()=>{
 const{context,page}=await fixture('collapsed-note','note',false);try{await page.evaluate(()=>{window.entryRun=window.entryProbe.start();window.pointerSamples=[];window.entrySampling=setInterval(()=>{const node=document.querySelector('[data-home-guide-pointer]');if(node&&!node.hidden)window.pointerSamples.push({top:node.matches(':popover-open'),state:node.dataset.state,run:node.dataset.homeGuidePointer})},8)});await page.evaluate(()=>window.entryRun);const result=await page.evaluate(()=>{clearInterval(window.entrySampling);return{actions:window.entryProbe.actions,samples:window.pointerSamples,clicks:window.entryProbe.nativeClicks}});expect(result.actions).toEqual(['close','more','activate:new-note']);expect(result.clicks).toEqual(['更多','新笔记']);expect(result.samples.length).toBeGreaterThan(15);expect(result.samples.every(x=>x.top&&x.run==='entry-note')).toBe(true);expect(result.samples.some(x=>x.state==='moving')).toBe(true)}finally{await context.close()}
})
it.each(['surface','knowledge-surface','browser-over-image'])('uses the visible New Chat entry directly from %s',async start=>{const{context,page}=await fixture(start,'report');try{await page.evaluate(()=>window.entryProbe.start());expect(await page.evaluate(()=>window.entryProbe.actions)).toEqual(['close','activate:new-chat'])}finally{await context.close()}})
it('stops if settings has no visible exit control',async()=>{const{context,page}=await fixture('unsupported','report');try{const result=await page.evaluate(async()=>{try{await window.entryProbe.start();return'ok'}catch(error){return error.message}});expect(result).toContain('返回应用');expect(await page.evaluate(()=>window.entryProbe.actions)).toEqual(['close'])}finally{await context.close()}})
it.each(['knowledge-collapsed','knowledge-surface','home','chat'])('uses sidebar More to create the spreadsheet demo from %s',async start=>{
 const {context,page}=await fixture(start,'spreadsheet')
 try{
  const before=await page.evaluate(()=>window.entryProbe.snapshot())
  await page.evaluate(()=>window.entryProbe.start())
  const result=await page.evaluate(()=>({actions:window.entryProbe.actions,clicks:window.entryProbe.nativeClicks,state:window.entryProbe.snapshot()}))
  expect(result.actions).toEqual(['close','more','activate:new-spreadsheet'])
  expect(result.clicks).toEqual(['更多','新建表格'])
  expect(result.state).toMatchObject({...before,activated:true})
  expect(await page.locator('[data-sidebar-more]').count()).toBe(0)
 }finally{await context.close()}
})
it.each(['browser-over-image','settings-over-browser'])('uses More and New Spreadsheet with Browser on top of Images from %s', async start => {
 const {context,page}=await fixture(start,'spreadsheet')
 try{
  const before=await page.evaluate(()=>window.entryProbe.snapshot())
  await page.evaluate(()=>window.entryProbe.start())
  const result=await page.evaluate(()=>({actions:window.entryProbe.actions,clicks:window.entryProbe.nativeClicks,state:window.entryProbe.snapshot(),surface:document.body.dataset.workspaceSurface}))
  expect(result.actions).toEqual(['close',...start==='settings-over-browser'?['close-settings']:[],'more','activate:new-spreadsheet'])
  expect(result.clicks).toEqual(['更多','新建表格'])
  expect(result.state).toMatchObject({...before,activated:true})
  expect(result.surface).toBe('browser')
 }finally{await context.close()}
},12000)
it.each(['cancel','navigate'])('stops before dismissal or activation on %s during the visible opening motion',async action=>{const{context,page}=await fixture('chat','ppt',false);try{await page.evaluate(()=>{window.entryRun=window.entryProbe.start().then(()=>({ok:true}),e=>({ok:false,name:e.name}))});await page.waitForTimeout(60);if(action==='cancel')await page.evaluate(()=>window.entryProbe.controller.abort());else await page.locator('#other-session').evaluate(button=>button.click());const result=await page.evaluate(()=>window.entryRun);expect(result.ok).toBe(false);expect(await page.evaluate(()=>window.entryProbe.actions)).toEqual([]);expect(await page.evaluate(()=>window.entryProbe.snapshot().activated)).toBe(false)}finally{await context.close()}})

it.each([['board','home-research'],['workbench','home-research'],['note','home-notes'],['ppt','home'],['report','home']])('uses already selected %s homepage input without clicking a selected tab',async(kind,start)=>{const{context,page}=await fixture(start,kind);try{await page.evaluate(()=>window.entryProbe.start());expect(await page.evaluate(()=>window.entryProbe.actions)).toEqual(['close','activate:home-input'])}finally{await context.close()}})
it.each([['note','home-notes'],['board','home-research'],['workbench','home-research']])('activates the unselected %s home mode without requiring a hidden right composer',async(kind,action)=>{const{context,page}=await fixture('home',kind);try{await page.locator('textarea').evaluate(node=>node.remove());await page.evaluate(()=>window.entryProbe.start());expect(await page.evaluate(()=>window.entryProbe.actions)).toEqual(['close','activate:'+action,'tab:'+action.slice(5)])}finally{await context.close()}})
it('preserves a nonempty homepage draft by using the visible New route',async()=>{const{context,page}=await fixture('home-draft','ppt');try{const before=await page.evaluate(()=>window.entryProbe.snapshot());await page.evaluate(()=>window.entryProbe.start());expect(await page.evaluate(()=>window.entryProbe.actions)).toEqual(['close','activate:new-chat']);expect(await page.evaluate(()=>window.entryProbe.snapshot())).toMatchObject({...before,activated:true})}finally{await context.close()}})
it('hovers during slow preparation and draws the final press only immediately before the real activation',async()=>{const{context,page}=await fixture('chat','ppt',false);try{await page.evaluate(()=>{window.entryPrepareGate=new Promise(resolve=>window.releaseEntryPreparation=resolve);window.entryRun=window.entryProbe.start()});await page.waitForFunction(()=>window.entryProbe.preparing);const targetFrames=await page.evaluate(()=>window.entryProbe.frames.filter(frame=>frame.target==='新建对话'));expect(targetFrames.some(frame=>frame.phase==='moving')).toBe(true);expect(targetFrames.some(frame=>frame.phase==='pressed'||frame.phase==='released')).toBe(false);expect(await page.evaluate(()=>window.entryProbe.nativeClicks)).toEqual([]);await page.evaluate(()=>window.releaseEntryPreparation());await page.evaluate(()=>window.entryRun);expect(await page.evaluate(()=>window.entryProbe.nativeClicks)).toEqual(['新建对话']);expect(await page.evaluate(()=>window.entryProbe.frames.filter(frame=>frame.target==='新建对话'&&frame.phase==='pressed').length)).toBe(1)}finally{await context.close()}})

it.each([['board','home-research','new-research'],['note','home-notes','new-note']])('uses visible sidebar New for selected %s home mode without a composer',async(kind,start,action)=>{const{context,page}=await fixture(start,kind);try{await page.locator('textarea').evaluate(node=>node.remove());await page.evaluate(()=>window.entryProbe.start());expect(await page.evaluate(()=>window.entryProbe.actions)).toEqual(['close','activate:'+action])}finally{await context.close()}})

it.each(['note','board','ppt'])('uses real New when the native %s source has hidden attachments or references',async kind=>{const{context,page}=await fixture('home',kind);try{await page.evaluate(()=>window.entryHomeEmpty=false);await page.evaluate(()=>window.entryProbe.start());expect(await page.evaluate(()=>window.entryProbe.actions)).toEqual(['close','activate:'+(kind==='note'?'new-note':kind==='board'?'new-research':'new-chat')])}finally{await context.close()}})

async function residentFixture(hold=false){const f=await fixture('home','board');await f.page.evaluate(()=>{window.__ModuleLoader__={load:descriptor=>window.residentRuntimeDescriptor=descriptor}});await f.page.addScriptTag({content:runtimeSource});await f.page.evaluate(async hold=>{window.residentProbe=await window.installResidentEntryFixture(window.residentRuntimeDescriptor,hold)},hold);return f}
it('waits for the target SDK session and keyed Research resident before mounting a guide',async()=>{const{context,page}=await residentFixture();try{await page.evaluate(()=>{window.residentRun=window.residentProbe.start().then(()=>({ok:true}),error=>({ok:false,message:error.message}))});const result=await page.evaluate(()=>window.residentRun);expect(result).toEqual({ok:true});await page.waitForTimeout(80);expect(await page.evaluate(()=>({selected:window.residentProbe.sessions.list.getSnapshot().current,replaced:window.residentProbe.replaced,oldConnected:window.residentProbe.sourceRoot.isConnected,resident:document.querySelector('[data-home-guide-resident]')?.dataset.residentId,guide:!!document.querySelector('[data-home-guide]'),steps:window.residentProbe.steps}))).toMatchObject({selected:'prepared',replaced:true,oldConnected:false,resident:'prepared',guide:true,steps:['mount-board','board-library']})}finally{await page.evaluate(()=>window.residentProbe.dispose());await context.close()}})
it.each(['navigation','keyboard'])('still cancels real %s while the SDK target root is awaiting its mode commit',async action=>{const{context,page}=await residentFixture(true);try{await page.evaluate(()=>{window.residentRun=window.residentProbe.start().then(()=>({ok:true}),error=>({ok:false,name:error.name}))});await page.waitForFunction(()=>window.residentProbe.opened);if(action==='navigation')await page.evaluate(()=>window.residentProbe.sessions.open('foreign'));else await page.keyboard.press('A');const result=await page.evaluate(()=>window.residentRun);expect(result.ok).toBe(false);expect(await page.locator('[data-home-guide]').count()).toBe(0);expect(await page.evaluate(()=>window.residentProbe.steps)).toEqual([])}finally{await page.evaluate(()=>window.residentProbe.dispose());await context.close()}})
it('accepts SDK textarea reuse after selection without changing the source draft',async()=>{const{context,page}=await residentFixture({reuseTextarea:true});try{const result=await page.evaluate(()=>window.residentProbe.start().then(()=>({ok:true}),error=>({ok:false,message:error.message})));expect(result).toEqual({ok:true});expect(await page.evaluate(()=>({selected:window.residentProbe.sessions.list.getSnapshot().current,reused:window.residentProbe.reusedTextarea,sourceDraft:window.residentProbe.inputs.source.snapshot.draft,targetDraft:window.residentProbe.inputs.prepared.snapshot.draft,resident:document.querySelector('[data-home-guide-resident]')?.dataset.residentId}))).toEqual({selected:'prepared',reused:true,sourceDraft:'原会话尚未发送的草稿',targetDraft:'',resident:'prepared'})}finally{await page.evaluate(()=>window.residentProbe.dispose());await context.close()}})
it.each(['navigation','typing'])('still cancels actual %s after SDK textarea reuse while the target view waits',async action=>{const{context,page}=await residentFixture({reuseTextarea:true,holdRoot:true});try{await page.evaluate(()=>{window.residentRun=window.residentProbe.start().then(()=>window.residentOutcome={ok:true},error=>window.residentOutcome={ok:false,name:error.name})});await page.waitForFunction(()=>window.residentProbe.reusedTextarea);await page.waitForTimeout(35);expect(await page.evaluate(()=>window.residentOutcome)).toBeUndefined();if(action==='navigation')await page.evaluate(()=>window.residentProbe.sessions.open('foreign'));else{await page.locator('textarea').evaluate(node=>node.focus());await page.keyboard.type('用户继续输入')}expect((await page.evaluate(()=>window.residentRun)).ok).toBe(false);expect(await page.locator('[data-home-guide]').count()).toBe(0);expect(await page.evaluate(()=>({draft:window.residentProbe.inputs.source.snapshot.draft,steps:window.residentProbe.steps}))).toEqual({draft:'原会话尚未发送的草稿',steps:[]})}finally{await page.evaluate(()=>window.residentProbe.dispose());await context.close()}})
