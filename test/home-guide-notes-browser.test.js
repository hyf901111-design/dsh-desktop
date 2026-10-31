import {execFileSync} from 'node:child_process'
import {homeNoteComponentsSource} from './fixtures/home-note-components.js'
import {noteLibraryItems,noteLibraryNode} from '../src/main/notes/component-library'
import {esbuildRawSource} from './helpers/esbuild-raw-source.mjs'
import {notesChartNavigationCompatibilitySource} from './helpers/notes-chart-navigation-compatibility.mjs'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {mkdtempSync,rmSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
import {NotesStore} from '../src/main/notes/store'
import {noteMarkdown} from '../src/main/notes/export'
import {HOME_NOTES_GUIDE_TITLE,HOME_NOTES_GUIDE_BLOCKS,HOME_NOTES_CONSENSUS_REPLACEMENT} from '../src/preload/home-guide-notes-data'
import {HOME_NOTES_CHART_SPEC,HOME_NOTES_TASK_RESULT,HOME_NOTES_GUIDE_SELECTION,HOME_NOTES_REWRITE_RESULT,HOME_NOTES_REWRITE_PROMPT} from '../packages/dsh-research-task-runtime/home-notes-guide-contract.js'
import {homeNoteChallengeSidebarSource} from './fixtures/home-note-challenge-sidebar.js'
import {homeNoteRewritePortalBrowser} from './fixtures/home-note-rewrite-portal-browser.js'
import {Session} from '@deepseek-ai/dsh-session'
import {presentationHostFixture} from './fixtures/home-presentation-host.js'
import {HOME_NOTES_PATH} from '../packages/dsh-research-task-runtime/home-notes-runtime.js'
import {engageNoteSession,noteConversationRows,recordNoteConversation} from '../packages/dsh-research-task-runtime/notes-session.js'
const evidenceDir=process.env.SHERLOCK_NOTES_DEMO_EVIDENCE||'/tmp/sherlock-notes-demo-flow-20261029/browser';mkdirSync(evidenceDir,{recursive:true})
const preReview=['write','note-chart-compose','note-chart-review','note-chart-apply','note-write-middle','note-slash-quote','note-quote-configure','note-write-tail']
const throughCorrections=[...preReview,'challenge','review','consensus-select','consensus-optimize','consensus-replace','select','growth-evidence','optimize','replace','note-select-paragraph','note-rewrite','note-rewrite-apply']
const nonempty=blocks=>blocks.filter(block=>block.type==='research'||(Array.isArray(block.content)?block.content.map(part=>part.text||'').join(''):block.content||'').trim())
let browser,script,css,rewritePortalScript
it('fits the 243-day research chart at 476, 676 and 862px and reopens its saved dimensions',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'notes-daily-chart-fit-')),store=new NotesStore(directory),storage=async(method,input)=>method==='load'?store.load('owner',input.sessionId):method==='save'?store.save('owner',input.sessionId,input.revision,input.content,input.clientId):{ok:true}
 const{context,page,errors}=await fixture(storage);try{
  await page.setViewportSize({width:1500,height:1020});await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.startNativeGuide())
  for(const step of ['write','note-chart-compose','note-chart-review','note-chart-apply'])await page.evaluate(step=>window.guide.runStep(step),step)
  await page.locator('.en-document').evaluate(node=>node.style.maxWidth='1200px')
  const title='中际旭创｜一年股价与基准表现',card=page.locator('.en-native-component:has(iframe[title="'+title+'"])'),chart=page.frameLocator('iframe[title="'+title+'"]').frameLocator('iframe#preview'),measurements=[]
  await expect.poll(()=>chart.locator('svg.template-chart').count()).toBe(1)
  expect(await chart.locator('path.plot-line').count()).toBe(2);expect(await chart.locator('table tbody tr').count()).toBe(243)
  expect(await chart.locator('path.plot-line').first().evaluate(node=>getComputedStyle(node).strokeWidth)).toBe('1.4px')
  for(const width of [476,676,862]){
   await card.evaluate((node,width)=>node.style.width=width+'px',width)
   await expect.poll(()=>card.evaluate(node=>Math.round(node.getBoundingClientRect().width))).toBe(width)
   await expect.poll(()=>chart.locator('svg').evaluate(node=>Math.round(node.getBoundingClientRect().width))).toBeGreaterThan(width-64)
   const m=await chart.locator('body').evaluate(body=>{const read=document.querySelector('.chart-readout').getBoundingClientRect(),end=document.querySelector('details').getBoundingClientRect();return{width:innerWidth,height:innerHeight,scrollWidth:body.scrollWidth,scrollHeight:body.scrollHeight,bottomGap:innerHeight-end.bottom,plotHeight:document.querySelector('svg').getBoundingClientRect().height,bodyHeight:body.getBoundingClientRect().height,contentBottom:end.bottom,readoutHeight:read.height,detailsOpen:document.querySelector('details').open}})
   measurements.push({width,...m});writeFileSync(join(evidenceDir,'daily-chart-fit-progress.json'),JSON.stringify(measurements,null,2));await card.screenshot({path:join(evidenceDir,'daily-chart-'+width+'.png')});expect(m.bottomGap).toBeLessThanOrEqual(24);expect(m.bottomGap).toBeGreaterThanOrEqual(0);expect(m.readoutHeight).toBeLessThanOrEqual(20);expect(m.scrollWidth).toBeLessThanOrEqual(m.width+1);expect(m.scrollHeight).toBeLessThanOrEqual(m.height+2);expect(m.detailsOpen).toBe(false)
  }
  await card.getByRole('button',{name:'选中组件并操作内容',exact:true}).click()
  const semantic=blocks=>blocks.map(block=>{if(block.type!=='research')return block;const node=JSON.parse(block.props.payload);if(node.config){delete node.config.interactionState;if(!Object.keys(node.config).length)delete node.config}return{...block,props:{...block.props,payload:JSON.stringify(node)}}}),beforeViews=JSON.stringify(semantic(store.load('owner','real-guide-session').saved.blocks))
  await chart.locator('rect.hit[data-point="80"]').click();await expect.poll(()=>chart.locator('.chart-readout').innerText()).toContain(HOME_NOTES_CHART_SPEC.labels[80])
  await chart.locator('svg').press('ArrowRight');await expect.poll(()=>chart.locator('.chart-readout').innerText()).toContain(HOME_NOTES_CHART_SPEC.labels[81])
  await chart.locator('summary').click();expect(await chart.locator('details').getAttribute('open')).not.toBeNull();expect(await chart.locator('tbody tr').count()).toBe(243);await chart.locator('summary').click()
  await page.evaluate(()=>window.guide.flush());expect(JSON.stringify(semantic(store.load('owner','real-guide-session').saved.blocks))).toBe(beforeViews);expect(await page.locator('.en-component-error').count()).toBe(0)
  const beforeHeight=await card.evaluate(node=>node.getBoundingClientRect().height)
  await page.evaluate(()=>{window.guide.dispose();delete document.documentElement.dataset.homeGuidePointerRun;window.openSavedNativeNote()});await expect.poll(()=>card.count()).toBe(1)
  await page.locator('.en-document').evaluate(node=>node.style.maxWidth='1200px');await card.evaluate(node=>node.style.width='862px')
  await expect.poll(()=>card.evaluate(node=>node.getBoundingClientRect().height)).toBeCloseTo(beforeHeight,0)
  await card.locator('.en-native-component-heading strong').click();await card.getByRole('separator',{name:'调整组件高度',exact:true}).press('ArrowDown')
  await expect.poll(()=>{const block=store.load('owner','real-guide-session').saved.blocks.find(b=>b.type==='research');return JSON.parse(block.props.payload).noteSize?.height}).toBeGreaterThan(306)
  const savedHeight=JSON.parse(store.load('owner','real-guide-session').saved.blocks.find(b=>b.type==='research').props.payload).noteSize.height
  expect(await card.locator('.en-native-component-host').evaluate(node=>node.offsetHeight)).toBe(savedHeight)
  await page.evaluate(()=>{window.nativeRoot.unmount();window.openSavedNativeNote()});await expect.poll(()=>card.locator('.en-native-component-host').evaluate(node=>node.offsetHeight)).toBe(savedHeight)
  expect(await card.evaluate(node=>node.offsetHeight-node.querySelector('.en-native-component-host').offsetHeight)).toBe(34)
  writeFileSync(join(evidenceDir,'daily-chart-layout.json'),JSON.stringify({measurements,savedChart:JSON.parse(store.load('owner','real-guide-session').saved.blocks.find(b=>b.type==='research').props.payload)},null,2));await page.screenshot({path:join(evidenceDir,'daily-chart-862.png')});expect(errors).toEqual([])
 }finally{await context.close();rmSync(directory,{recursive:true,force:true})}
},60000)
it('keeps standalone chart data readable when scripts are disabled and draws the full curve when enabled',async()=>{
 const node=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',"import{homeNotesGuideChart}from'./packages/dsh-research-task-runtime/home-notes-guide-artifacts.js';process.stdout.write(JSON.stringify(homeNotesGuideChart('export').node))"],{encoding:'utf8'}))
 for(const enabled of [false,true]){const context=await browser.newContext({javaScriptEnabled:enabled}),page=await context.newPage();try{await page.setContent(node.containerSpec.html)
  if(enabled){await expect.poll(()=>page.locator('path.plot-line').count()).toBe(2);expect(await page.locator('details tbody tr').count()).toBe(243);expect(await page.locator('svg > text > title').count()).toBe(5)}
  else{expect(await page.locator('[aria-label="静态数据回退"]').innerText()).toContain('不是完整曲线');expect(await page.locator('[aria-label="静态数据回退"] tbody tr').count()).toBe(2);expect(await page.locator('[aria-label="静态数据回退"]').innerText()).toContain('139.65114');expect(await page.locator('svg').isVisible()).toBe(false)}
 }finally{await context.close()}}
},10000)
beforeAll(async()=>{
 const productionChart=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',"import{homeNotesGuideChart}from'./packages/dsh-research-task-runtime/home-notes-guide-artifacts.js';process.stdout.write(JSON.stringify(homeNotesGuideChart('fixture')))"],{encoding:'utf8'}))
 const challengeSidebar=await homeNoteChallengeSidebarSource();rewritePortalScript=await homeNoteRewritePortalBrowser()
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{mountHomeNotesGuide}from'./src/preload/home-guide-notes';
 import{createHomeGuidePointer}from'./src/preload/home-guide-pointer';
 import React from'react';import{createRoot}from'react-dom/client';import{NotesApp}from'./src/preload/notes/editor';
 import'@blocknote/mantine/style.css';import'./src/preload/notes/style.css';import'./src/preload/notes/challenge.css';
 import'./src/preload/home-guides.css';import'./src/preload/figma-final-shell.css';
 ${challengeSidebar}
 ${homeNoteComponentsSource()}
 const homeNotesGuideChart=runId=>{const result=structuredClone(${JSON.stringify(productionChart)});result.node.id='home-note-chart-'+runId;return result};window.portalChartFixture=homeNotesGuideChart;
 import{HOME_NOTES_CHART_PROMPT,HOME_NOTES_TASK_PROMPT,HOME_NOTES_REWRITE_PROMPT,HOME_NOTES_TASK_RESULT,HOME_NOTES_REWRITE_RESULT}from'./packages/dsh-research-task-runtime/home-notes-guide-contract.js';
 window.createHomeGuidePointer=createHomeGuidePointer;window.guideNativeEvents=[];for(const name of ['notes-edited','notes-composer-state','notes-composer-draft','notes-task-state'])document.addEventListener('sherlock:'+name,()=>window.guideNativeEvents.push(name));window.mountAnotherGuide=signal=>mountHomeNotesGuide(document,document.querySelector('#guide'),{signal});window.abortGuide=new AbortController();window.guideStatuses=[];window.guideGate=()=>Promise.resolve();window.readyGuide=mountHomeNotesGuide(document,document.querySelector('#guide'),{signal:window.abortGuide.signal,runId:'standalone-note-run',onStatus:text=>window.guideStatuses.push(text),waitUntilPlaying:()=>window.guideGate()}).then(api=>window.guide=api);
 window.cueTarget=token=>typeof token==='string'?document.querySelector('[data-home-guide-cue-target="'+CSS.escape(token)+'"]'):null;
 window.guideCues=[];window.guidePointerPending=[];window.addEventListener('sherlock:home-guide-cue',event=>{const wire=event.detail,target=wire.target||window.cueTarget(wire.targetToken),fromTarget=wire.fromTarget||window.cueTarget(wire.fromTargetToken);window.guideCues.push({label:wire.label,connected:target?.isConnected===true,runId:wire.runId,requestId:wire.requestId,action:wire.action});if(wire.requestId)window.guidePointerPending.push({...wire,target,fromTarget,wire})});
 window.persistentBridge={request:async(method,input)=>{if(method==='library-list'&&window.nativeLibraryDelay)await new Promise(resolve=>setTimeout(resolve,window.nativeLibraryDelay));if(method==='save')window.lastGuideSaved=input.content;return window.noteStorageRequest(method,input)},draft:input=>window.noteStorageRequest('draft',input)};
 window.startPersistentGuide=async fresh=>{window.guide.dispose();await new Promise(resolve=>setTimeout(resolve,50));window.guide=await mountHomeNotesGuide(document,document.querySelector('#guide'),{signal:new AbortController().signal,sessionId:'real-guide-session',runId:'notes-natural-run',fresh,persistence:window.persistentBridge});};
 window.openSavedNativeNote=()=>{window.nativeRoot=createRoot(document.querySelector('#guide'));window.nativeRoot.render(React.createElement(NotesApp,{sessionId:'real-guide-session',bridge:window.persistentBridge,dark:false,navigate:()=>{}}));};
 window.startNativeGuide=async()=>{window.guide.dispose();await new Promise(resolve=>setTimeout(resolve,50));document.documentElement.dataset.homeGuidePointerRun='notes-natural-run';window.nativeAutoAck=true;window.nativeGuideRequests=[];const native=window.nativeRewriteBridge||{configureQuote:()=>window.configureFixtureQuote(),reviewSummary:()=>window.reviewFixtureSummary(),appendSummary:()=>window.appendFixtureSummary('notes-natural-run','real-guide-session'),type:async stage=>{document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'real-guide-session',prompt:stage==='note'?HOME_NOTES_TASK_PROMPT:HOME_NOTES_REWRITE_PROMPT,images:[],submissionId:window.nativeGuideRequests.length}}))},generate:async input=>{window.nativeGuideRequests.push({...input,snapshot:window.lastGuideSaved?.blocks});await new Promise(resolve=>setTimeout(resolve,80));if(input.prompt===HOME_NOTES_TASK_PROMPT&&window.holdSummary)await new Promise(resolve=>window.releaseSummary=resolve);return input.prompt===HOME_NOTES_CHART_PROMPT?homeNotesGuideChart('notes-natural-run'):{kind:'text',markdown:input.selection?HOME_NOTES_REWRITE_RESULT:HOME_NOTES_TASK_RESULT}},stop:async()=>{},dispose:()=>{window.nativeGuideDisposed=true}};window.guide=await mountHomeNotesGuide(document,document.querySelector('#guide'),{signal:new AbortController().signal,sessionId:'real-guide-session',runId:'notes-natural-run',fresh:true,persistence:window.persistentBridge,native,waitUntilPlaying:()=>window.guideGate(),wait:async(ms,signal)=>{if(window.recordNativeScroll||signal)await new Promise((resolve,reject)=>{if(signal?.aborted){reject(new DOMException('cancelled','AbortError'));return}const stop=()=>{clearTimeout(timer);reject(new DOMException('cancelled','AbortError'))},timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve()},ms);signal?.addEventListener('abort',stop,{once:true})})}});window.addEventListener('sherlock:home-guide-cue',event=>{const cue=event.detail;if(!cue.requestId)return;const reply=(ok,message)=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok,message}}));if(!cue.selection){if(window.nativeAutoAck!==false)reply(true);return}const wire=JSON.parse(JSON.stringify(cue));window.selectionCue=wire;window.selectionFrames=[];const pointer=createHomeGuidePointer(document,{runId:cue.runId,signal:new AbortController().signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>Promise.resolve()});void pointer.perform({target:window.cueTarget(cue.targetToken),fromTarget:window.cueTarget(cue.fromTargetToken),action:'drag',onFrame:frame=>{const detail={runId:cue.runId,requestId:cue.requestId,...frame};window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-progress',{detail:JSON.parse(JSON.stringify(detail))}));const slider=document.querySelector('.en-challenge-slider');window.selectionFrames.push({...frame,text:getSelection().toString(),...(slider?{value:Number(slider.getAttribute('aria-valuenow')),track:slider.getBoundingClientRect().toJSON()}:{})})}}).then(()=>reply(true),error=>reply(false,error.message)).finally(()=>pointer.dispose())});};
 `},plugins:[{name:'accepted-9b-chart-guard-compatibility',setup(build){build.onLoad({filter:/[/\\]notes[/\\]chart-navigation\.ts$/},args=>({contents:notesChartNavigationCompatibilitySource(),loader:'ts',resolveDir:dirname(args.path)}))}},{name:'read-only-demo-popup-observation',setup(build){build.onLoad({filter:/[/\\]notes[/\\]editor\.tsx$/},args=>({contents:readFileSync(args.path,'utf8').replace('  const slashMenu = useMemo','  ;(window as any).guidePopupProbe={editor,challenge}; const slashMenu = useMemo'),loader:'tsx',resolveDir:dirname(args.path)}))}},esbuildRawSource()],bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'}})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text;css=(output.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'')+'\n'+readFileSync('scripts/lib/financial-widget.css','utf8')
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(storage){
 const fallbackDirectory=mkdtempSync(join(tmpdir(),'notes-demo-browser-')),fallbackStore=new NotesStore(fallbackDirectory);storage??=async(method,input)=>{if(method==='load')return fallbackStore.load('owner',input.sessionId);if(method==='save')return fallbackStore.save('owner',input.sessionId,input.revision,input.content,input.clientId);return{ok:true}};const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],network=[],logs=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(['warning','error'].includes(message.type()))logs.push(message.text())});page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1/notes-guide'))network.push(request.url())})
 await page.route('http://127.0.0.1/notes-guide',route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content"><title>笔记用例教程</title><body data-workspace-surface="notes" style="margin:0;width:100vw;height:100vh;overflow:hidden"><div id="guide" class="en-root" data-home-guide-notes="" style="left:0;top:0;right:360px;bottom:0"></div>'}))
 await page.route('http://127.0.0.1/fonts/NotoSansSC.woff2',route=>route.fulfill({path:'build/fonts/NotoSansSC.woff2',contentType:'font/woff2'}));await page.goto('http://127.0.0.1/notes-guide');if(storage)await page.exposeFunction('noteStorageRequest',(method,input)=>method==='library-list'?noteLibraryItems({list:()=>[]}):method==='library-read'?noteLibraryNode({list:()=>[]},input.id,'owner'):storage(method,input));await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.evaluate(()=>window.readyGuide);const close=context.close.bind(context);context.close=async()=>{await close();rmSync(fallbackDirectory,{recursive:true,force:true})};return{context,page,errors,network,logs}
}
it('scrolls each paragraph into view and acknowledges a pointer click at its start before typing',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.guide.runStep('write'))
  const cues=await page.evaluate(()=>window.guideCues.filter(cue=>cue.label==='在首行文字光标处落笔'))
  expect(cues).toHaveLength(1);expect(cues.every(cue=>cue.connected&&cue.action==='click')).toBe(true);expect(errors).toEqual([])
 }finally{await context.close()}
},20000)
it.each([false,true])('preserves native placeholder and custom title ownership while writing the real note (%s)',async custom=>{
 const directory=mkdtempSync(join(tmpdir(),'home-guide-title-')),store=new NotesStore(directory),session=Session.create('real-guide-session'),engaged=[]
 session.append('session/title',{title:custom?'用户自己的笔记名':'新笔记',source:{kind:'user'}})
 const native={sessions:{get:()=>session},sessionTitle:{rename:(s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}}}}
 const storage=async(method,input)=>{if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft'){store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);return{ok:true}}if(method==='engage'){engaged.push(input);return engageNoteSession(native,input)}return{ok:true}}
 const{context,page,errors}=await fixture(storage);try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.startPersistentGuide(true))
  expect(engaged).toEqual([]);expect(session.events.findLast(event=>event.type==='session/title')?.data.title).toBe(custom?'用户自己的笔记名':'新笔记')
  await page.evaluate(()=>window.guide.runStep('write'))
  expect(engaged).toEqual([expect.objectContaining({title:HOME_NOTES_GUIDE_TITLE})])
  expect(session.events.findLast(event=>event.type==='session/title').data.title).toBe(custom?'用户自己的笔记名':'新笔记')
  expect(await page.locator('.en-title').inputValue()).toBe(HOME_NOTES_GUIDE_TITLE)
  expect(await page.locator('.bn-editor').innerText()).toContain('环比增长174.57%');expect(errors).toEqual([])
 }finally{await context.close();rmSync(directory,{recursive:true,force:true})}
},20000)
it('synchronizes the actual autopilot slider during its pointer drag and hits actual wrapped yellow text',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.startNativeGuide())
  for(const step of preReview)await page.evaluate(step=>window.guide.runStep(step),step)
  await page.evaluate(()=>{window.nativeAutoAck=false;window.markerHits=[];window.markerClicks=[];document.addEventListener('click',event=>{const mark=event.target?.closest('[data-bn-thread-id]');if(mark)window.markerClicks.push({detail:event.detail,x:event.clientX,y:event.clientY,hit:mark===document.elementFromPoint(event.clientX,event.clientY)||mark.contains(document.elementFromPoint(event.clientX,event.clientY))})},true);window.naturalPointer=createHomeGuidePointer(document,{runId:'notes-natural-run',signal:new AbortController().signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>Promise.resolve()});window.addEventListener('sherlock:home-guide-cue',event=>{const cue=event.detail;if(!cue.requestId||cue.selection)return;const target=window.cueTarget(cue.targetToken);window.naturalPointer.perform({target,action:cue.action}).then(()=>{if(target?.hasAttribute('data-bn-thread-id')){const p=window.naturalPointer.snapshot(),hit=document.elementFromPoint(p.x,p.y);window.markerHits.push({x:p.x,y:p.y,hit:hit===target||target.contains(hit),thread:target.dataset.bnThreadId,rects:target.getClientRects().length})}window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))},error=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:false,message:error.message}})))})})
  await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>window.guide.runStep('challenge'))
  const frames=await page.evaluate(()=>window.selectionFrames.filter(f=>f.track&&['pressed','dragging','released'].includes(f.phase)));expect(frames.filter(f=>f.phase==='dragging').length).toBeGreaterThan(10)
  expect(new Set(frames.filter(f=>f.phase==='dragging').map(f=>f.value)).size).toBeGreaterThan(2)
  // Native pointer coordinates can quantize by one CSS pixel at a slot boundary.
  expect(frames.every(f=>Math.abs((f.x-f.track.left)/f.track.width*252-(12+57*f.value))<=29.5)).toBe(true)
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.guide.runStep('review'));await page.evaluate(()=>window.guide.runStep('consensus-select'))
  const hits=await page.evaluate(()=>window.markerHits),clicks=await page.evaluate(()=>window.markerClicks);expect(clicks).toHaveLength(1);expect(clicks[0]).toMatchObject({detail:1,hit:true});expect(Math.abs(clicks[0].x-hits[0].x)).toBeLessThan(1);expect(Math.abs(clicks[0].y-hits[0].y)).toBeLessThan(1);expect(hits).toHaveLength(1);expect(hits[0].hit).toBe(true);expect(hits[0].rects).toBeGreaterThan(1);expect(await page.locator('.en-challenge-card').count()).toBeGreaterThan(0)
  const popup=await page.evaluate(()=>{const {editor,challenge}=window.guidePopupProbe,click=window.markerClicks[0],point=editor._tiptapEditor.view.posAtCoords({left:click.x,top:click.y}),anchor=challenge.popupAnchor,caret=point&&editor._tiptapEditor.view.coordsAtPos(point.pos),mark=document.querySelector('[data-bn-thread-id="'+challenge.selected+'"]'),line=[...mark.getClientRects()].find(r=>r.left<=click.x&&r.right>=click.x&&r.top<=click.y&&r.bottom>=click.y),card=document.querySelector('.en-challenge-card').getBoundingClientRect(),area=document.querySelector('.en-main').getBoundingClientRect();return{anchor,position:point?.pos,caret:caret&&{left:caret.left,top:caret.top,bottom:caret.bottom},line:line?.toJSON(),card:card.toJSON(),area:area.toJSON(),wide:document.querySelector('.en-main').dataset.challengeWide}})
  expect(popup.wide).toBe('false');expect(popup.anchor?.position).toBe(popup.position);expect(popup.line).toBeDefined();expect(popup.caret.top).toBeGreaterThanOrEqual(popup.line.top-1);expect(popup.caret.bottom).toBeLessThanOrEqual(popup.line.bottom+1)
  expect(Math.abs(popup.card.left-Math.max(popup.area.left+16,Math.min(popup.caret.left,popup.area.right-336)))).toBeLessThanOrEqual(2)
  expect(Math.abs(popup.card.top-popup.line.bottom-10)).toBeLessThanOrEqual(2);expect(errors).toEqual([])
  writeFileSync(join(evidenceDir,'native-pointer-slider-mark-hit.json'),JSON.stringify({frames,hits,clicks,popup},null,2));await page.screenshot({path:join(evidenceDir,'native-pointer-on-mark.png')});await page.evaluate(()=>window.naturalPointer.dispose())
 }finally{await context.close()}
},50000)
it('moves the real pointer over the original library submenu and clicks its quote item above the menu surface',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.startNativeGuide());for(const step of preReview.slice(0,5))await page.evaluate(step=>window.guide.runStep(step),step)
  await page.evaluate(()=>{window.nativeAutoAck=false;window.menuPointer=createHomeGuidePointer(document,{runId:'notes-natural-run',signal:new AbortController().signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>Promise.resolve()});window.addEventListener('sherlock:home-guide-cue',event=>{const cue=event.detail;if(!cue.requestId)return;const ack=()=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}));if(!cue.label.includes('组件库')){ack();return}window.menuPointer.perform({target:window.cueTarget(cue.targetToken),action:cue.action}).then(async()=>{window.menuPointerReady=cue.label;await new Promise(resolve=>window.releaseMenuPointer=resolve);window.menuPointerReady='';ack()})});window.quoteStep=window.guide.runStep('note-slash-quote').catch(error=>{window.menuFailure=error.message;throw error})})
  await expect.poll(()=>page.evaluate(()=>window.menuFailure||window.menuPointerReady),{timeout:15000}).toBe('移动到组件库，展开二级菜单');expect(await page.locator('[data-home-guide-note-menu] .child-menu').count()).toBe(0);const rootBefore=await page.locator('[data-home-guide-note-menu] .root-menu').boundingBox();await page.evaluate(()=>window.releaseMenuPointer())
  await expect.poll(()=>page.evaluate(()=>window.menuFailure||window.menuPointerReady),{timeout:15000}).toBe('在组件库二级菜单选择行情面板')
  const rootAfter=await page.locator('[data-home-guide-note-menu] .root-menu').boundingBox();expect(rootAfter).toEqual(rootBefore);const childBox=await page.locator('[data-home-guide-note-menu] .child-menu').boundingBox(),viewport=page.viewportSize();expect(childBox.x).toBeGreaterThanOrEqual(8);expect(childBox.y).toBeGreaterThanOrEqual(8);expect(childBox.x+childBox.width).toBeLessThanOrEqual(viewport.width-8);expect(childBox.y+childBox.height).toBeLessThanOrEqual(viewport.height-8)
  expect(await page.locator('[data-home-guide-note-menu] .child-menu a[aria-label="行情面板"]').count()).toBe(1)
  expect(await page.locator('[data-home-guide-pointer]').evaluate(node=>({top:node.matches(':popover-open'),events:getComputedStyle(node).pointerEvents,hidden:node.hidden}))).toEqual({top:true,events:'none',hidden:false})
  await page.screenshot({path:join(evidenceDir,'pointer-above-library-submenu.png')});await page.evaluate(()=>window.releaseMenuPointer());await page.evaluate(()=>window.quoteStep)
  expect(await page.locator('[data-home-guide-note-menu]').count()).toBe(0);const blocks=await page.evaluate(()=>window.lastGuideSaved.blocks);expect(blocks.filter(b=>b.type==='research').map(b=>JSON.parse(b.props.payload)).some(n=>n.containerSpec?.widget==='quote')).toBe(true);expect(errors).toEqual([]);await page.evaluate(()=>window.menuPointer.dispose())
 }finally{await context.close()}
},30000)
it('waits for the async original slash menu choices before opening the actual quote library item',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.startNativeGuide())
  for(const step of preReview.slice(0,5))await page.evaluate(step=>window.guide.runStep(step),step)
  await page.evaluate(()=>{window.nativeLibraryDelay=400;window.slashItemsDuringLoad=[];const observer=new MutationObserver(()=>{const id=document.querySelector('#guide .bn-editor')?.getAttribute('aria-controls'),menu=id&&document.getElementById(id);if(menu)window.slashItemsDuringLoad.push(menu.querySelectorAll(':scope > [role="option"]').length)});observer.observe(document.body,{childList:true,subtree:true});window.slashLoadingObserver=observer})
  await page.evaluate(()=>window.guide.runStep('note-slash-quote'))
  // Cached library choices may already be complete when the paced menu opens.
  // Require real visible choices and the native library result, not a transient empty frame.
  expect((await page.evaluate(()=>window.slashItemsDuringLoad)).some(count=>count>0)).toBe(true)
  const blocks=await page.evaluate(()=>window.lastGuideSaved.blocks),quote=blocks.filter(block=>block.type==='research').map(block=>JSON.parse(block.props.payload)).find(node=>node.containerSpec?.widget==='quote')
  expect(quote).toBeDefined();expect(quote.noteLibrary).toBe(true);expect(errors).toEqual([])
 }finally{await context.close()}
},30000)
it.each(['cancel','changed-menu'])('does not select an async slash library item after %s',async action=>{
 const{context,page,errors}=await fixture();try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.startNativeGuide())
  for(const step of preReview.slice(0,5))await page.evaluate(step=>window.guide.runStep(step),step)
  await page.evaluate(()=>{window.nativeLibraryDelay=800;window.nativeAutoAck=false;window.addEventListener('sherlock:home-guide-cue',event=>{const cue=event.detail;if(!cue.requestId)return;if(cue.label.includes('组件库')){window.pendingMenuCue=cue;window.guideSlashChoicesRead=true}else window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))});window.pendingSlash=window.guide.runStep('note-slash-quote').then(()=>({ok:true}),error=>({ok:false,name:error.name,message:error.message}))})
  await expect.poll(()=>page.locator('[data-home-guide-note-menu] .root-menu [role="listbox"]').count()).toBe(1)
  await expect.poll(()=>page.evaluate(()=>window.guideSlashChoicesRead)).toBe(true)
  await page.evaluate(action=>{if(action==='cancel')window.guide.dispose();else document.querySelector('#guide .bn-editor').setAttribute('aria-controls','another-editors-menu');const cue=window.pendingMenuCue;window.nativeAutoAck=true;window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))},action)
  const result=await page.evaluate(()=>window.pendingSlash);expect(result.ok).toBe(false)
  if(action==='cancel')expect(result.name).toBe('AbortError');else expect(result.message).toContain('菜单已变化')
  await page.waitForTimeout(850)
  const nodes=await page.evaluate(()=>window.lastGuideSaved.blocks.filter(block=>block.type==='research').map(block=>JSON.parse(block.props.payload)))
  expect(nodes).toHaveLength(1);expect(nodes.some(node=>node.containerSpec?.widget==='quote')).toBe(false);expect(errors).toEqual([])
 }finally{await context.close()}
},30000)
it('checks three actual evidence cards, corrects the consensus and returns the same native editor smoothly to its title',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'home-guide-note-consensus-')),store=new NotesStore(directory)
 const storage=async(method,input)=>{if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft')store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);return{ok:true}}
 const{context,page,errors}=await fixture(storage);try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{window.holdSummary=true;return window.startNativeGuide()})
  const snapshots=[];let summaryBeforeBlocks
  for(const step of [...throughCorrections,'note-task-compose','note-task-review','note-task-apply','note-task-saved']){
   if(step==='note-task-compose')summaryBeforeBlocks=structuredClone(store.load('owner','real-guide-session').saved.blocks)
   if(step==='note-task-compose')await page.evaluate(()=>window.beforeSummaryCueCount=window.guideCues.length)
   await page.evaluate(step=>window.guide.runStep(step),step);await page.evaluate(()=>window.guide.flush())
   const blocks=store.load('owner','real-guide-session').saved.blocks,parts=nonempty(blocks),components=blocks.filter(block=>block.type==='research');snapshots.push({step,blocks})
   if(step==='write'){expect(parts).toHaveLength(2);expect(components).toHaveLength(0)}
   if(step==='note-chart-review'){
    expect(parts).toHaveLength(3);expect(components).toHaveLength(1);expect(await page.locator('.en-space-ai-avatar svg').count()).toBe(1)
    const captured=(await page.evaluate(()=>window.nativeGuideRequests))[0];expect(captured.entryPoint).toBe('inline');expect(captured.context).toEqual({scope:'note',components:[]});expect(captured.markdown).toContain('环比增长174.57%')
    const chart=page.frameLocator('iframe[title="中际旭创｜一年股价与基准表现"]').frameLocator('iframe#preview');await expect.poll(()=>chart.locator('svg.template-chart').count()).toBe(1)
    expect(await chart.locator('path.plot-line').count()).toBe(2);expect(await chart.locator('circle[data-point]').count()).toBe(486);expect(await chart.locator('table tbody tr').count()).toBe(243)
    expect(await chart.locator('[data-chart-series]').allTextContents()).toEqual(HOME_NOTES_CHART_SPEC.series.map(s=>s.name));expect(await chart.locator('figcaption').innerText()).toContain('非含息收益')
    expect(await chart.locator('details').getAttribute('open')).toBeNull()
    expect(await chart.locator('table tbody td').allTextContents()).toEqual(HOME_NOTES_CHART_SPEC.labels.flatMap((label,i)=>[label,...HOME_NOTES_CHART_SPEC.series.map(s=>String(s.values[i]))]))
    await page.screenshot({path:join(evidenceDir,'space-chart.png')})
   }
   if(step==='note-write-middle'){expect(parts).toHaveLength(4);expect(components).toHaveLength(1)}
   if(step==='note-quote-configure'){expect(components).toHaveLength(2);expect(JSON.parse(components[1].props.payload).containerSpec.symbols).toEqual([{code:'300308',market:'SZ',name:'中际旭创'}]);expect(await page.evaluate(()=>window.fixtureFinanceRequests.some(row=>row.action==='search'&&row.query==='300308'))).toBe(true)}
   if(step==='note-write-tail'){expect(parts).toHaveLength(7);expect(parts.filter(block=>block.type==='paragraph')).toHaveLength(5)}
   if(step==='review')expect(await page.locator('.bn-editor [data-bn-thread-id]').evaluateAll(nodes=>new Set(nodes.map(n=>n.dataset.bnThreadId)).size)).toBe(3)
   if(step==='growth-evidence'){const panel=page.locator('[data-notes-challenge-panel]');expect(await panel.locator('article').count()).toBe(3);expect(await panel.innerText()).toContain('14.29%');expect(await panel.innerText()).toContain('环比计算');expect(await panel.locator('article a').count()).toBe(3)}
   if(step==='consensus-replace')expect(await page.locator('[data-id="guide-note-consensus"] .bn-inline-content').innerText()).toBe(HOME_NOTES_CONSENSUS_REPLACEMENT)
   if(step==='replace')expect(await page.locator('[data-id="guide-note-growth"] .bn-inline-content').innerText()).toBe(HOME_NOTES_GUIDE_BLOCKS[1].content.replace('环比增长174.57%','环比增长14.29%'))
   if(step==='note-select-paragraph'){expect(await page.evaluate(()=>getSelection().toString())).toBe(HOME_NOTES_GUIDE_SELECTION);expect(await page.evaluate(()=>window.guideCues.some(row=>row.label==='先查看句内表达标记的 AI 评论'))).toBe(true)}
   if(step==='note-rewrite-apply')expect(await page.locator('[data-id="guide-note-cashflow"] .bn-inline-content').innerText()).toBe(HOME_NOTES_REWRITE_RESULT)
   if(step==='note-task-compose'){
    expect(await page.evaluate(()=>window.guideCues.slice(window.beforeSummaryCueCount).some(cue=>cue.label==='在全新空白行继续'))).toBe(false)
    expect(parts).toHaveLength(7);expect(JSON.stringify(blocks)).not.toContain(HOME_NOTES_TASK_RESULT)
    await expect.poll(()=>page.locator('.en-main [data-note-preview-state="generating"] .en-ai-loading').count()).toBe(1)
    await page.evaluate(()=>window.summaryPendingRequest=document.querySelector('.en-main [data-note-preview-state="generating"]').dataset.notePreviewRequestId)
    await page.screenshot({path:join(evidenceDir,'summary-pending-main.png')});await expect.poll(()=>page.evaluate(()=>typeof window.releaseSummary)).toBe('function');await page.evaluate(()=>window.releaseSummary())
   }
   if(step==='note-task-review'){
    expect(blocks).toEqual(summaryBeforeBlocks);expect(parts).toHaveLength(7);expect(JSON.stringify(blocks)).not.toContain(HOME_NOTES_TASK_RESULT)
    expect(await page.locator('.en-main [data-note-preview-state="ready"] .en-preview').count()).toBe(1);expect(await page.locator('[data-note-result-preview]').count()).toBe(0)
    expect(await page.evaluate(()=>window.summaryPendingRequest===document.querySelector('.en-main [data-note-preview-state="ready"]').dataset.notePreviewRequestId)).toBe(true);expect(await page.locator('.en-main .en-preview button').allTextContents()).toEqual(['×','添加至正文','重新撰写','放弃']);expect(await page.locator('.en-space-ai').count()).toBe(0)
    expect(await page.locator('.en-main .en-preview').innerText()).toContain(HOME_NOTES_TASK_RESULT);await page.screenshot({path:join(evidenceDir,'summary-ready-not-inserted.png')})
   }
   if(step==='note-task-apply'){expect(parts).toHaveLength(8);expect(parts.at(-1).type).toBe('paragraph');expect(parts.at(-1).content.map(p=>p.text||'').join('')).toBe(HOME_NOTES_TASK_RESULT);expect(components).toHaveLength(2);writeFileSync(join(evidenceDir,'completed-blocks.json'),JSON.stringify(blocks,null,2));await page.screenshot({path:join(evidenceDir,'summary-added.png')})}
  }
  const requests=await page.evaluate(()=>window.nativeGuideRequests);expect(requests).toHaveLength(3);expect(requests[1].selection).toBe(HOME_NOTES_GUIDE_SELECTION);expect(requests[2].context.components).toHaveLength(2);expect(requests[2].markdown).toContain(HOME_NOTES_REWRITE_RESULT)
  const chartReference=requests[2].context.components.find(c=>c.content.includes('data-note-chart-compact'));expect(chartReference).toBeDefined();const reference=JSON.parse(chartReference.content);expect(reference.spec.html).toContain('data-note-chart-compact');expect(reference.spec.html.length).toBeGreaterThan(20000);expect(chartReference.content.length).toBeLessThan(30000)
  writeFileSync(join(evidenceDir,'actor-stages.json'),JSON.stringify(snapshots,null,2));writeFileSync(join(evidenceDir,'actor-requests.json'),JSON.stringify(requests,null,2))
  const writing=await page.evaluate(()=>window.guideCues.filter(c=>c.label==='在首行文字光标处落笔'));expect(writing).toHaveLength(3)
  await page.emulateMedia({reducedMotion:'no-preference'})
  const start=await page.evaluate(()=>{window.beforeReturnEditor=document.querySelector('#guide .bn-editor');window.beforeReturnArea=document.querySelector('#guide .en-document-scroll');window.beforeReturnArea.scrollTop=window.beforeReturnArea.scrollHeight-window.beforeReturnArea.clientHeight;window.scrollSamples=[];window.recordNativeScroll=true;const sample=()=>{window.scrollSamples.push(window.beforeReturnArea.scrollTop);if(window.recordNativeScroll)requestAnimationFrame(sample)};requestAnimationFrame(sample);return window.beforeReturnArea.scrollTop});expect(start).toBeGreaterThan(200)
  await page.evaluate(()=>window.guide.runStep('note-return-top'))
  const finish=await page.evaluate(()=>{window.recordNativeScroll=false;return{sameEditor:window.beforeReturnEditor===document.querySelector('#guide .bn-editor'),sameArea:window.beforeReturnArea===document.querySelector('#guide .en-document-scroll'),top:window.beforeReturnArea.scrollTop,samples:window.scrollSamples}});expect(finish.sameEditor).toBe(true);expect(finish.sameArea).toBe(true);expect(finish.top).toBe(0);expect(finish.samples.filter(value=>value>0&&value<start).length).toBeGreaterThan(6)
  await page.evaluate(()=>window.guide.flush());const saved=store.load('owner','real-guide-session'),exported=noteMarkdown(saved.saved);expect(exported).toContain(HOME_NOTES_TASK_RESULT);expect(exported.split(HOME_NOTES_TASK_RESULT)).toHaveLength(2);expect(saved.draft).toBeUndefined();writeFileSync(join(evidenceDir,'note-export.md'),exported)
  expect(await page.locator('[data-en-replacement-id]').evaluateAll(nodes=>new Set(nodes.map(n=>n.dataset.enReplacementId)).size)).toBeGreaterThanOrEqual(2)
  await page.evaluate(()=>{window.guide.dispose();delete document.documentElement.dataset.homeGuidePointerRun;window.openSavedNativeNote()})
  await expect.poll(()=>page.locator('[data-id="guide-note-consensus"] .bn-inline-content').innerText()).toBe(HOME_NOTES_CONSENSUS_REPLACEMENT)
  expect(await page.locator('.bn-editor').innerText()).toContain(HOME_NOTES_TASK_RESULT);expect(await page.locator('.en-native-component').count()).toBe(2);expect(await page.locator('[data-note-preview-request-id]').count()).toBe(0);expect(errors).toEqual([]);await page.screenshot({path:join(evidenceDir,'normal-note-reopened.png')});await page.evaluate(()=>window.nativeRoot.unmount())
 }finally{await context.close();rmSync(directory,{recursive:true,force:true})}
},70000)
it('stops before the public summary action when the user moves the retained note caret',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'notes-summary-tail-')),store=new NotesStore(directory),storage=async(method,input)=>{if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);return{ok:true}}
 const{context,page,errors}=await fixture(storage);try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.startNativeGuide())
  for(const step of [...throughCorrections,'note-task-compose','note-task-review'])await page.evaluate(step=>window.guide.runStep(step),step)
  await page.locator('[data-id="guide-note-intro"] .bn-inline-content').click()
  await expect(page.evaluate(()=>window.guide.runStep('note-task-apply'))).rejects.toThrow(/笔记(?:末尾光标|正文)已变化，已保留用户当前操作。/)
  await expect.poll(()=>page.locator('#guide .bn-editor').count()).toBe(0)
  const saved=store.load('owner','real-guide-session');expect(nonempty(saved.saved.blocks)).toHaveLength(7);expect(JSON.stringify(saved.saved.blocks)).not.toContain(HOME_NOTES_TASK_RESULT);expect(errors).toEqual([])
 }finally{await context.close();rmSync(directory,{recursive:true,force:true})}
},60000)
it('opens the actual evidence action in English without relying on its Chinese button text',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'home-guide-note-consensus-en-')),store=new NotesStore(directory)
 const storage=async(method,input)=>{if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft')store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);return{ok:true}}
 const{context,page,errors}=await fixture(storage);try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(async()=>{document.documentElement.dataset.odysseyLocale='en';await window.startNativeGuide()})
  for(const step of [...preReview,'challenge','review','consensus-select','consensus-optimize','consensus-replace','select'])await page.evaluate(step=>window.guide.runStep(step),step)
  expect(await page.getByRole('button',{name:'View evidence',exact:true}).count()).toBeGreaterThan(0)
  await page.evaluate(()=>window.guide.runStep('growth-evidence'))
  expect(await page.locator('[data-notes-challenge-panel] article').count()).toBe(3);expect(errors).toEqual([])
 }finally{await context.close();rmSync(directory,{recursive:true,force:true})}
},20000)
it('grows the actual editor selection during the JSON-token actor drag before its rewrite step',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'home-guide-note-selection-')),store=new NotesStore(directory)
 const storage=async(method,input)=>{if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft')store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);return{ok:true}}
 const{context,page,errors}=await fixture(storage);try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.startNativeGuide())
  for(const step of ['write','note-chart-compose','note-chart-review','note-chart-apply','note-write-middle','note-slash-quote','note-quote-configure','note-write-tail','challenge','review','consensus-select','consensus-optimize','consensus-replace','select','growth-evidence','optimize','replace'])await page.evaluate(step=>window.guide.runStep(step),step)
  await page.setViewportSize({width:1080,height:900});await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>{window.recordNativeScroll=true;window.selectAction=window.guide.runStep('note-select-paragraph').then(()=>window.selectionComplete=true,error=>window.selectionFailure=error.message)})
  await expect.poll(()=>page.evaluate(()=>window.selectionFrames?.filter(row=>row.phase==='dragging'&&row.text.length>0).length||0),{timeout:5000,interval:30}).toBeGreaterThan(2)
  const mid=await page.evaluate(()=>({frames:window.selectionFrames,cue:window.selectionCue,complete:window.selectionComplete,requests:window.nativeGuideRequests.length}));expect(mid.complete).not.toBe(true);expect(mid.requests).toBe(1);expect(mid.cue.selection).toBe(true);expect(Object.values(mid.cue).every(value=>typeof value==='string'||value===true)).toBe(true)
  expect(await page.evaluate(()=>{const before=getSelection().toString();for(const detail of [{...window.selectionCue,runId:'foreign',x:1,y:1,phase:'dragging'},{...window.selectionCue,requestId:'foreign',x:1,y:1,phase:'dragging'}])window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-progress',{detail}));return getSelection().toString()===before})).toBe(true)
  await page.evaluate(()=>window.selectAction);const final=await page.evaluate(()=>({frames:window.selectionFrames,selected:getSelection().toString(),failure:window.selectionFailure,complete:window.selectionComplete,text:'接下来仍需把新增资本投入、营运资本占用与经营现金回款放在同一张检查清单中。后续将持续密切关注相关业务及各项指标的进一步变化情况。估值判断应保留情景边界，证据变化再调整结论。'}));expect(final.failure).toBeUndefined();expect(final.complete).toBe(true);expect(final.selected).toBe(final.text);expect(new Set(final.frames.filter(row=>row.phase==='dragging').map(row=>row.text)).size).toBeGreaterThan(2);expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0)
  expect(await page.evaluate(()=>{const before=getSelection().toString();window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-progress',{detail:{...window.selectionCue,x:0,y:0,phase:'pressed'}}));return getSelection().toString()===before})).toBe(true)
  await page.evaluate(()=>window.guide.runStep('note-rewrite'));expect((await page.evaluate(()=>window.nativeGuideRequests))[1].selection).toBe(final.text);expect(errors).toEqual([])
 }finally{await context.close();rmSync(directory,{recursive:true,force:true})}
},30000)
it('extends the saved native note with a research summary and an actual paragraph rewrite without replacing the original document',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'home-guide-note-native-')),store=new NotesStore(directory)
 const storage=async(method,input)=>{if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft')store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);return{ok:true}}
 const{context,page,errors}=await fixture(storage);try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.startNativeGuide())
  for(const step of ['write','note-chart-compose','note-chart-review','note-chart-apply','note-write-middle','note-slash-quote','note-quote-configure','note-write-tail','challenge','review','consensus-select','consensus-optimize','consensus-replace','select','growth-evidence','optimize','replace','note-select-paragraph','note-rewrite','note-rewrite-apply','note-task-compose','note-task-review','note-task-apply','note-task-saved','note-return-top']){
   await page.evaluate(step=>window.guide.runStep(step),step)
   if(step==='note-select-paragraph'){await page.evaluate(()=>{const next=document.createElement('button');next.textContent='下一步';next.id='native-note-next';document.body.append(next);next.click();next.focus()});await page.waitForTimeout(300)}
  }
  const requests=await page.evaluate(()=>window.nativeGuideRequests)
  expect(requests).toHaveLength(3);expect(requests[0].entryPoint).toBe('inline');expect(requests[2].context.scope).toBe('note');expect(requests[2].selection).toBe('');expect(requests[2].context.components).toHaveLength(2);expect(requests[2].markdown).toContain('环比增长14.29%')
  expect(requests[1].context.scope).toBe('selection');expect(requests[1].markdown).toBe('');expect(requests[1].selection).toBe(HOME_NOTES_GUIDE_SELECTION)
  expect(await page.locator('[data-id="guide-note-intro"] .bn-inline-content').innerText()).toContain('复盘重点是增长兑现')
  expect(await page.locator('[data-id="guide-note-cashflow"] .bn-inline-content').innerText()).toContain(HOME_NOTES_REWRITE_RESULT)
  expect(await page.locator('.bn-editor').innerText()).toContain('固定历史区间');expect(await page.locator('.bn-editor').innerText()).toContain('环比增长14.29%');expect(await page.locator('[data-en-replacement-id]').count()).toBeGreaterThan(0)
  await page.evaluate(()=>window.guide.flush());await page.evaluate(()=>window.guide.dispose())
  const saved=store.load('owner','real-guide-session');expect(JSON.stringify(saved.saved.blocks)).toContain(HOME_NOTES_REWRITE_RESULT);expect(JSON.stringify(saved.saved.blocks)).toContain(HOME_NOTES_TASK_RESULT);expect(saved.draft).toBeUndefined()
  await page.evaluate(()=>{delete document.documentElement.dataset.homeGuidePointerRun;window.openSavedNativeNote()});await expect.poll(()=>page.locator('.bn-editor').innerText()).toContain(HOME_NOTES_REWRITE_RESULT)
  expect(errors).toEqual([]);await page.evaluate(()=>window.nativeRoot.unmount())
 }finally{await context.close();rmSync(directory,{recursive:true,force:true})}
},35000)
it('waits for the matching pointer acknowledgement before title and body input and cancels a pending click',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='standalone-note-run';window.pointerWrite=window.guide.runStep('write').catch(error=>error.name)})
  await expect.poll(()=>page.evaluate(()=>window.guidePointerPending.length)).toBe(1)
  expect(await page.locator('.en-title').inputValue()).toBe('')
  expect((await page.locator('.bn-editor').innerText()).trim()).toBe('')
  expect(await page.evaluate(()=>window.guidePointerPending[0].target.classList.contains('en-title'))).toBe(true)
  await page.evaluate(()=>{const cue=window.guidePointerPending[0];window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:'stale',requestId:cue.requestId,ok:true}}))})
  await page.waitForTimeout(100);expect(await page.locator('.en-title').inputValue()).toBe('')
  await page.evaluate(()=>{const cue=window.guidePointerPending[0];window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))})
  await expect.poll(()=>page.evaluate(()=>window.guidePointerPending.length)).toBe(2)
  expect(await page.locator('.en-title').inputValue()).toBe(HOME_NOTES_GUIDE_TITLE)
  expect((await page.locator('.bn-editor').innerText()).trim()).toBe('')
  await page.evaluate(()=>{window.abortGuide.abort();const cue=window.guidePointerPending[1];window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))})
  expect(await page.evaluate(()=>window.pointerWrite)).toBe('AbortError');expect(await page.locator('.bn-editor').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it('sends JSON-only pointer tokens and removes its exact target markers after acknowledgement and abort',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='standalone-note-run';window.tokenWrite=window.guide.runStep('write').catch(error=>error.name)})
  await expect.poll(()=>page.evaluate(()=>window.guidePointerPending.length)).toBe(1)
  const observed=await page.evaluate(()=>{const {wire,target}=window.guidePointerPending[0];let json,error;try{json=JSON.parse(JSON.stringify(wire))}catch(value){error=value.message}return{wire:json,error,keys:Object.keys(wire),token:target.getAttribute('data-home-guide-cue-target')}})
  expect(observed.error).toBeUndefined()
  expect(observed.keys.sort()).toEqual(['runId','requestId','label','action','targetToken'].sort())
  expect(observed.wire).toMatchObject({runId:'standalone-note-run',action:'click',targetToken:`standalone-note-run:${observed.wire.requestId}:target`})
  expect(observed.token).toBe(observed.wire.targetToken)
  await page.evaluate(()=>{const cue=window.guidePointerPending[0];window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))})
  expect(await page.evaluate(()=>window.guidePointerPending[0].target.hasAttribute('data-home-guide-cue-target'))).toBe(false)
  await expect.poll(()=>page.evaluate(()=>window.guidePointerPending.length)).toBe(2)
  await page.evaluate(()=>window.abortGuide.abort());expect(await page.evaluate(()=>window.tokenWrite)).toBe('AbortError')
  expect(await page.evaluate(()=>window.guidePointerPending[1].target.hasAttribute('data-home-guide-cue-target'))).toBe(false);expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it('cleans a rejected pointer token without deleting a newer owner marker',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='standalone-note-run';window.tokenReject=window.guide.runStep('write').catch(error=>error.message)})
  await expect.poll(()=>page.evaluate(()=>window.guidePointerPending.length)).toBe(1)
  await page.evaluate(()=>{const cue=window.guidePointerPending[0];cue.target.setAttribute('data-home-guide-cue-target','newer-owner-token');window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:false,message:'目标已取消'}}))})
  expect(await page.evaluate(()=>window.tokenReject)).toBe('目标已取消')
  expect(await page.evaluate(()=>window.guidePointerPending[0].target.getAttribute('data-home-guide-cue-target'))).toBe('newer-owner-token');expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it('sends both JSON-only strict-slider endpoints and cleans both on failure',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.startNativeGuide());for(const step of preReview)await page.evaluate(step=>window.guide.runStep(step),step);await page.evaluate(()=>window.nativeAutoAck=false)
  await page.evaluate(()=>{window.addEventListener('sherlock:home-guide-cue',event=>{const cue=event.detail;if(cue.requestId&&cue.action!=='drag')window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))})})
  await page.evaluate(()=>{window.tokenSlider=window.guide.runStep('challenge').catch(error=>error.message)})
  await expect.poll(()=>page.evaluate(()=>window.guidePointerPending.some(cue=>cue.action==='drag'))).toBe(true)
  const observed=await page.evaluate(()=>{const cue=window.guidePointerPending.find(cue=>cue.action==='drag');let json,error;try{json=JSON.parse(JSON.stringify(cue.wire))}catch(value){error=value.message}return{wire:json,error,keys:Object.keys(cue.wire),target:cue.target.getAttribute('data-home-guide-cue-target'),from:cue.fromTarget.getAttribute('data-home-guide-cue-target')}})
  expect(observed.error).toBeUndefined()
  expect(observed.keys.sort()).toEqual(['runId','requestId','label','action','targetToken','fromTargetToken'].sort())
  expect(observed.target).toBe(`notes-natural-run:${observed.wire.requestId}:target`);expect(observed.from).toBe(`notes-natural-run:${observed.wire.requestId}:from`)
  await page.evaluate(()=>{const cue=window.guidePointerPending.find(cue=>cue.action==='drag');window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:false,message:'滑块位置已变化'}}))})
  expect(await page.evaluate(()=>window.tokenSlider)).toBe('滑块位置已变化')
  expect(await page.evaluate(()=>{const cue=window.guidePointerPending.find(cue=>cue.action==='drag');return[cue.target.getAttribute('data-home-guide-cue-target'),cue.fromTarget.getAttribute('data-home-guide-cue-target')]})).toEqual([null,null]);expect(errors).toEqual([])
 }finally{await context.close()}
},30000)
it('completes the real note actor when every JSON-only target survives delayed acknowledgement',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.startNativeGuide());await page.evaluate(()=>window.nativeAutoAck=false)
  await page.evaluate(()=>{window.addEventListener('sherlock:home-guide-cue',event=>{const cue=JSON.parse(JSON.stringify(event.detail));if(!cue.requestId)return;setTimeout(()=>{const target=window.cueTarget(cue.targetToken),from=cue.fromTargetToken?window.cueTarget(cue.fromTargetToken):null;window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:!!target?.isConnected&&(!cue.fromTargetToken||!!from?.isConnected),message:'操作目标必须在移动期间保持存活'}}))},90)})})
  for(const step of ['write','note-chart-compose','note-chart-review','note-chart-apply','note-write-middle','note-slash-quote','note-quote-configure','note-write-tail','challenge','review','consensus-select','consensus-optimize','consensus-replace','select','growth-evidence','optimize','replace'])await page.evaluate(step=>window.guide.runStep(step),step)
  expect(await page.locator('.bn-editor').innerText()).toContain('环比增长14.29%');expect(await page.locator('[data-en-replacement-id]').count()).toBeGreaterThan(0)
  expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},30000)
it('refuses another pointer owner instead of treating it as an isolated legacy fixture',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='another-run';window.ownerResult='';void window.guide.runStep('write').then(()=>window.ownerResult='completed',error=>window.ownerResult=error.name)})
  await expect.poll(()=>page.evaluate(()=>window.ownerResult)).toBe('AbortError')
  expect(await page.locator('.bn-editor').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it.each(['offscreen','hidden','inert'])('does not write after an acknowledged title becomes %s',async invalid=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='standalone-note-run';window.invalidResult='';void window.guide.runStep('write').then(()=>window.invalidResult='completed',error=>window.invalidResult=error.name)})
  await expect.poll(()=>page.evaluate(()=>window.guidePointerPending.length)).toBe(1)
  await page.evaluate(invalid=>{const cue=window.guidePointerPending[0];if(invalid==='offscreen')cue.target.style.transform='translateX(-4000px)';else if(invalid==='hidden')cue.target.style.visibility='hidden';else cue.target.parentElement.inert=true;window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))},invalid)
  await expect.poll(()=>page.evaluate(()=>window.invalidResult)).toBe('Error')
  expect(await page.evaluate(()=>window.guidePointerPending[0].target.value)).toBe('');expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it.each(['source','destination'])('checks the strict-slider drag %s again after acknowledgement',async endpoint=>{
 const{context,page,errors}=await fixture();try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.startNativeGuide());for(const step of preReview)await page.evaluate(step=>window.guide.runStep(step),step);await page.evaluate(()=>window.nativeAutoAck=false)
  await page.evaluate(()=>{window.addEventListener('sherlock:home-guide-cue',event=>{const cue=event.detail;if(cue.requestId&&cue.action!=='drag')window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))})})
  await page.evaluate(()=>{window.invalidSliderResult='';void window.guide.runStep('challenge').then(()=>window.invalidSliderResult='completed',error=>window.invalidSliderResult=error.name)})
  await expect.poll(()=>page.evaluate(()=>window.guidePointerPending.some(cue=>cue.action==='drag'))).toBe(true)
  await page.evaluate(endpoint=>{const cue=window.guidePointerPending.find(cue=>cue.action==='drag');window.invalidSlider=document.querySelector('.en-challenge-slider');(endpoint==='source'?cue.fromTarget:cue.target).style.transform='translateX(-4000px)';window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))},endpoint)
  await expect.poll(()=>page.evaluate(()=>window.invalidSliderResult)).toBe('Error')
  expect(await page.evaluate(()=>window.invalidSlider.getAttribute('aria-valuenow'))).toBe('0');expect(errors).toEqual([])
 }finally{await context.close()}
},30000)
it('streams into the actual NotesApp, reviews in the real strict picker and applies the native optimization',async()=>{
 const{context,page,errors,network,logs}=await fixture();try{
  expect(await page.title()).toBe('笔记用例教程');await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.startNativeGuide());await page.evaluate(()=>window.guide.runStep('write'))
  expect(await page.locator('.en-title').inputValue()).toContain('中际旭创｜增长兑现与估值复盘');expect(await page.locator('.bn-editor').innerText()).toContain('环比增长174.57%')
  for(const step of preReview.slice(1))await page.evaluate(step=>window.guide.runStep(step),step);await page.evaluate(()=>window.recordNativeScroll=true)
  await page.evaluate(()=>window.guide.runStep('challenge'))
  expect(await page.locator('.en-challenge-trigger').innerText()).toContain('严格');expect(await page.locator('.en-challenge-popover').count()).toBe(1)
  await page.evaluate(()=>{window.reviewStep=window.guide.runStep('review')})
  await expect.poll(()=>page.locator('.en-challenge-trigger').getAttribute('aria-busy'),{timeout:6000}).toBe('true')
  await page.evaluate(()=>{window.noteResumes=[];window.guideGate=()=>new Promise(resolve=>window.noteResumes.push(resolve))})
  await page.waitForTimeout(2200)
  expect(await page.locator('.en-challenge-trigger').getAttribute('aria-busy')).toBe('true');expect(await page.locator('.bn-editor [data-bn-thread-id]').count()).toBe(0)
  await page.evaluate(()=>{window.guideGate=()=>Promise.resolve();for(const resume of window.noteResumes)resume()})
  await page.evaluate(()=>window.reviewStep);expect(await page.locator('.bn-editor [data-bn-thread-id]').count()).toBeGreaterThanOrEqual(3)
  for(const step of ['consensus-select','consensus-optimize','consensus-replace'])await page.evaluate(step=>window.guide.runStep(step),step)
  await page.evaluate(()=>window.guide.runStep('select'));expect(await page.locator('.en-challenge-card').innerText()).toContain('复合年化')
  await page.screenshot({path:'/tmp/home-guide-notes-strict-challenge-20261024.png'})
  await page.evaluate(()=>window.guide.runStep('growth-evidence'))
  await page.evaluate(()=>{window.optimizeStep=window.guide.runStep('optimize')})
  await expect.poll(()=>page.getByRole('progressbar',{name:'正在优化'}).count(),{timeout:4000}).toBe(1)
  expect(await page.locator('.en-challenge-replace').count()).toBe(0)
  await page.evaluate(()=>window.optimizeStep);expect(await page.locator('.bn-editor').innerText()).toContain('环比增长174.57%');expect(await page.locator('.en-challenge-replace').count()).toBe(1)
  await page.evaluate(()=>window.guide.runStep('replace'));expect(await page.locator('.bn-editor').innerText()).toContain('环比增长14.29%');expect(await page.locator('.bn-editor').innerText()).not.toContain('环比增长174.57%')
  expect(await page.locator('[data-en-replacement-id]').count()).toBeGreaterThan(0);expect(await page.locator('.en-error').count()).toBe(0)
  await page.screenshot({path:'/tmp/home-guide-notes-native-replacement-20261024.png'})
  await page.evaluate(()=>window.guide.dispose());expect(await page.locator('.bn-editor').count()).toBe(0);expect(errors).toEqual([]);expect(network.filter(url=>!url.startsWith('http://127.0.0.1/'))).toEqual([]);expect((await page.evaluate(()=>window.guideNativeEvents)).length).toBeGreaterThan(0);expect(logs).toEqual([])
 }finally{await context.close()}
},50000)
it('keeps the saved Yjs note and native challenge discussion editable after the tutorial surface is removed',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'home-guide-note-browser-')),store=new NotesStore(directory),calls=[]
 const storage=async(method,input)=>{calls.push(method);if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft'){store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);return{ok:true}};if(method==='challenge')throw Error('教程不能调用真实模型');return{ok:true}}
 const{context,page,errors,logs}=await fixture(storage);try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.startNativeGuide())
  for(const step of ['write','note-chart-compose','note-chart-review','note-chart-apply','note-write-middle','note-slash-quote','note-quote-configure','note-write-tail','challenge','review','consensus-select','consensus-optimize','consensus-replace','select','growth-evidence','optimize','replace'])await page.evaluate(step=>window.guide.runStep(step),step)
  expect(await page.locator('.bn-editor').innerText()).toContain('环比增长14.29%')
  await page.evaluate(()=>window.guide.flush());await page.evaluate(()=>window.guide.dispose());await expect.poll(()=>page.locator('.bn-editor').count()).toBe(0)
  const saved=store.load('owner','real-guide-session');expect(saved.saved.yjs.length).toBeGreaterThan(1000);expect(saved.draft).toBeUndefined();expect(calls).not.toContain('challenge')
  const cues=await page.evaluate(()=>window.guideCues);expect(cues.length).toBeGreaterThanOrEqual(5);expect(cues.every(cue=>cue.connected&&cue.runId==='notes-natural-run')).toBe(true)
  await page.evaluate(()=>window.openSavedNativeNote());await expect.poll(()=>page.locator('.bn-editor').innerText()).toContain('环比增长14.29%')
  expect(await page.locator('.en-challenge-grade').innerText()).toContain('严格');expect(await page.locator('.bn-editor [data-bn-thread-id]').count()).toBeGreaterThanOrEqual(1)
  await page.waitForTimeout(3000);expect(calls).not.toContain('challenge')
  const paragraph=page.locator('[data-id="guide-note-intro"] .bn-inline-content');await paragraph.click();await page.keyboard.press('End');await page.keyboard.type(' 保留的补充观察。')
  await expect.poll(()=>page.locator('.bn-editor').innerText()).toContain('保留的补充观察')
  await expect.poll(()=>JSON.stringify(store.load('owner','real-guide-session').saved.blocks),{timeout:3000}).toContain('保留的补充观察')
  await expect.poll(()=>calls.includes('challenge'),{timeout:6000}).toBe(true)
  expect(errors).toEqual([]);expect(logs).toEqual([]);await page.evaluate(()=>window.nativeRoot.unmount())
 }finally{await context.close();rmSync(directory,{recursive:true,force:true})}
},50000)
it('confirms a partial note even when navigation has already hidden the guide surface',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'home-guide-note-hidden-')),store=new NotesStore(directory)
 const storage=async(method,input)=>{if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft')store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);return{ok:true}}
 const{context,page,errors}=await fixture(storage);try{
  await page.evaluate(()=>window.startPersistentGuide(true));await page.evaluate(()=>{window.partialWrite=window.guide.runStep('write').catch(error=>error.name)})
  await expect.poll(()=>page.locator('.bn-editor').innerText(),{timeout:5000}).toContain('固定历史区间')
  await page.evaluate(()=>{window.guideGate=()=>new Promise(resolve=>window.resumeNoteGuide=resolve)});await page.waitForTimeout(130)
  await page.evaluate(async()=>{document.querySelector('#guide').style.display='none';await window.guide.flush();window.guide.dispose();window.resumeNoteGuide?.()})
  expect(await page.evaluate(()=>window.partialWrite)).toBe('AbortError');expect(store.load('owner','real-guide-session').saved.title).toBe(HOME_NOTES_GUIDE_TITLE);expect(store.load('owner','real-guide-session').draft).toBeUndefined();expect(errors).toEqual([])
 }finally{await context.close();rmSync(directory,{recursive:true,force:true})}
},15000)
it('aborts a partial stream without editor or challenge mutations after disposal',async()=>{
 const{context,page,errors}=await fixture();try{
  const result=await page.evaluate(async()=>{const pending=window.guide.runStep('write');setTimeout(()=>window.abortGuide.abort(),120);try{await pending;return'completed'}catch(error){return error.name}})
  expect(result).toBe('AbortError');await expect.poll(()=>page.locator('.bn-editor').count()).toBe(0);await page.waitForTimeout(800);expect(await page.locator('.bn-editor').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('pauses a streaming batch and cancels a paused gate without late content',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{window.streamPending=window.guide.runStep('write').catch(error=>error.name)})
  await expect.poll(()=>page.locator('.bn-editor').innerText(),{timeout:5000}).toContain('固定历史区间')
  await page.evaluate(()=>{window.guideGate=()=>new Promise(resolve=>window.resumeNoteGuide=resolve)})
  await page.waitForTimeout(120);const paused=await page.locator('.bn-editor').innerText();await page.waitForTimeout(300)
  expect(await page.locator('.bn-editor').innerText()).toBe(paused)
  await page.evaluate(()=>window.abortGuide.abort());expect(await page.evaluate(()=>window.streamPending)).toBe('AbortError')
  await page.evaluate(()=>window.resumeNoteGuide?.());await page.waitForTimeout(200);expect(await page.locator('.bn-editor').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('cleans up a signal that was already aborted before mounting',async()=>{
 const{context,page,errors}=await fixture();try{
  const result=await page.evaluate(async()=>{window.guide.dispose();const controller=new AbortController();controller.abort();try{await window.mountAnotherGuide(controller.signal);return'completed'}catch(error){return error.name}})
  expect(result).toBe('AbortError');await page.waitForTimeout(100);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('still times out a genuinely unavailable editor while the guide is playing',async()=>{
 const{context,page,errors}=await fixture();try{
  const result=await page.evaluate(async()=>{
   window.guide.dispose();const host=document.querySelector('#guide'),query=host.querySelector
   // Hold the real mounted editor's readiness boundary closed, without replacing
   // the editor, scheduler or the guide's timing code with a test implementation.
   host.querySelector=function(selector){return selector==='.bn-editor'?null:query.call(this,selector)}
   const started=performance.now()
   try{await window.mountAnotherGuide(new AbortController().signal);return{completed:true}}
   catch(error){return{message:error.message,elapsed:performance.now()-started}}
   finally{host.querySelector=query}
  })
  expect(result.message).toContain('未就绪');expect(result.elapsed).toBeGreaterThanOrEqual(6900);expect(result.elapsed).toBeLessThan(9500);expect(await page.locator('.bn-editor').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},12000)


it('submits the real NotesApp rewrite button prefill through the actual Native Portal and SDK shell',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.addScriptTag({content:rewritePortalScript});await page.evaluate(async()=>{await window.installRewritePortal();await window.startNativeGuide()})
  for(const step of throughCorrections.slice(0,-2))await page.evaluate(step=>window.guide.runStep(step),step)
  expect(await page.evaluate(()=>window.nativeRewriteProbe.snapshot().submission)).toBe(0)
  await page.evaluate(()=>window.guide.runStep('note-rewrite'))
  const actual=await page.evaluate(()=>({drafts:window.nativePortalDrafts,requests:window.nativePortalGenerations,snapshot:window.nativeRewriteProbe.snapshot()}))
  expect(actual.drafts).toContain(HOME_NOTES_REWRITE_PROMPT);expect(actual.requests).toHaveLength(2);expect(actual.requests[1]).toMatchObject({entryPoint:'composer',prompt:HOME_NOTES_REWRITE_PROMPT,selection:HOME_NOTES_GUIDE_SELECTION,markdown:'',context:{scope:'selection',components:[]}})
  expect(actual.snapshot).toMatchObject({draft:'',occurrences:0,submission:1});expect(await page.locator('.en-preview button').filter({hasText:'替换所选'}).count()).toBe(1)
  await page.evaluate(async()=>{await window.guide.flush();window.guide.dispose();delete document.documentElement.dataset.homeGuidePointerRun;window.openSavedNativeNote()})
  const paragraph=page.locator('#guide .bn-inline-content').filter({hasText:/\S/}).first();await paragraph.click({clickCount:3});await page.locator('.en-ai-format').click()
  await expect.poll(()=>page.evaluate(()=>window.nativeRewriteProbe.snapshot().draft)).toBe('改写选中文字，保留原意并让表达更清晰。');expect(errors).toEqual([])
 }finally{await context.close()}
},60000)

it('rejects a mismatched user draft after the real rewrite button without sending or replacing that draft',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.addScriptTag({content:rewritePortalScript});await page.evaluate(async()=>{await window.installRewritePortal();await window.startNativeGuide()})
  for(const step of throughCorrections.slice(0,-2))await page.evaluate(step=>window.guide.runStep(step),step)
  await page.locator('.en-ai-format').click();await expect.poll(()=>page.evaluate(()=>window.nativeRewriteProbe.snapshot().draft)).toBe(HOME_NOTES_REWRITE_PROMPT)
  const result=await page.evaluate(async()=>{window.nativeRewriteProbe.setDraft('用户自己刚修改的需求');try{await window.nativeRewriteProbe.type('selection');return{ok:true}}catch(error){return{ok:false,message:error.message}}})
  expect(result).toEqual({ok:false,message:'输入框已有草稿，已停止示例输入。'});expect(await page.evaluate(()=>window.nativeRewriteProbe.snapshot())).toMatchObject({draft:'用户自己刚修改的需求',submission:0});expect(await page.evaluate(()=>window.nativePortalGenerations.length)).toBe(1);expect(errors).toEqual([])
 }finally{await context.close()}
},60000)

it('completes the real editor and Portal through the actual Host composer guard then adopts the normal summary preview once',async()=>{
 const host=await presentationHostFixture(),{context,page,errors}=await fixture(),seen=[]
 try{
  const origin='http://127.0.0.1:'+host.ctx.webServer.port
  await import('node:fs/promises').then(fs=>fs.writeFile(join(host.home,'research-board-directories.json'),JSON.stringify({note:{sessionId:'demo',path:host.cwd,title:'AI 护航研究笔记示例'}})))
  // The Browser fixture and Host fixture retain their own real session IDs;
  // only this transport adapter aliases their synthetic ownership coordinates.
  await page.exposeFunction('nativePresetRequest',async body=>{
   const input=body.input?{...body.input,sessionId:'demo'}:undefined
   const request={...body,sessionId:'demo',...body.cwd?{cwd:host.cwd}:{},...input?{input}:{}}
   if(input)seen.push(structuredClone(input))
   const response=await fetch(origin+HOME_NOTES_PATH,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(request)})
   return{ok:response.ok,text:await response.text()}
  })
  await page.exposeFunction('nativePresetState',value=>{if(value.sessionId==='real-guide-session'&&value.phase==='accepted')recordNoteConversation(host.agent.session,{requestId:value.requestId,phase:'accepted',finishedAt:Date.now()})})
  await page.emulateMedia({reducedMotion:'reduce'});await page.addScriptTag({content:rewritePortalScript})
  await page.evaluate(async()=>{document.addEventListener('sherlock:notes-task-state',event=>void window.nativePresetState(event.detail));await window.installRewritePortal(true);await window.startNativeGuide()})
  for(const step of throughCorrections)await page.evaluate(step=>window.guide.runStep(step),step)
  expect(seen[1]).toMatchObject({entryPoint:'composer',selection:HOME_NOTES_GUIDE_SELECTION,markdown:'',context:{scope:'selection',components:[]},prompt:'修正一下句子里不严谨的地方'})
  expect(await page.locator('[data-id="guide-note-cashflow"] .bn-inline-content').innerText()).toBe(HOME_NOTES_REWRITE_RESULT)
  const before=await page.evaluate(()=>JSON.stringify(window.lastGuideSaved.blocks))
  await page.evaluate(()=>{window.summaryStart=window.guide.runStep('note-task-compose')})
  await expect.poll(()=>page.locator('.en-ai-loading').count(),{timeout:15000}).toBe(1)
  expect(await page.evaluate(()=>JSON.stringify(window.lastGuideSaved.blocks))).toBe(before)
  await page.evaluate(()=>window.summaryStart);await page.evaluate(()=>window.guide.runStep('note-task-review'))
  expect(await page.locator('.en-ai-loading').count()).toBe(0);expect(await page.locator('.en-preview button[data-note-preview-apply]').count()).toBe(1)
  expect(await page.locator('.en-preview').innerText()).toContain(HOME_NOTES_TASK_RESULT);expect(await page.evaluate(()=>JSON.stringify(window.lastGuideSaved.blocks))).toBe(before)
  await page.evaluate(()=>window.guide.runStep('note-task-apply'));await page.evaluate(()=>window.guide.runStep('note-task-saved'));await page.evaluate(()=>window.guide.runStep('note-return-top'))
  const saved=await page.evaluate(()=>window.lastGuideSaved);expect(saved.blocks.map(block=>JSON.stringify(block)).filter(value=>value.includes(HOME_NOTES_TASK_RESULT))).toHaveLength(1)
  expect(seen).toHaveLength(3);expect(seen[2]).toMatchObject({entryPoint:'composer',selection:'',context:{scope:'note'}})
  expect(noteConversationRows(host.agent.session).map(row=>row.phase)).toEqual(['accepted','accepted','accepted']);expect(host.outside).toEqual([]);expect(host.errors).toEqual([]);expect(errors).toEqual([])
  writeFileSync(join(evidenceDir,'actual-host-native-composer-completion.json'),JSON.stringify({requests:seen.map(row=>({entryPoint:row.entryPoint,scope:row.context.scope,selection:row.selection,prompt:row.prompt})),history:noteConversationRows(host.agent.session).map(row=>({requestId:row.requestId,phase:row.phase})),finalSummaryCopies:1},null,2))
 }finally{await context.close();await host.dispose()}
},90000)
