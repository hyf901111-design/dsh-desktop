import {esbuildRawSource} from './helpers/esbuild-raw-source.mjs'
import {homeNoteComponentsSource} from './fixtures/home-note-components.js'
import {noteLibraryItems,noteLibraryNode} from '../src/main/notes/component-library'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

let browser,script,css
const evidence=[]
const outputDirectory='/tmp/notes-selection-sync-20261026'
beforeAll(async()=>{
 const built=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{mountHomeNotesGuide}from'./src/preload/home-guide-notes';
 import{homeNotesGuideChart}from'./packages/dsh-research-task-runtime/home-notes-guide-artifacts.js';
 ${homeNoteComponentsSource()}
 import'@blocknote/mantine/style.css';import'./src/preload/notes/style.css';import'./src/preload/notes/challenge.css';import'./src/preload/home-guides.css';import'./src/preload/figma-final-shell.css';
 window.focusValue=new URL(location.href).searchParams.get('focus')==='true';
 Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>window.focusValue});
 window.focusRequests=[];window.focusReplies=[];window.focusAbort=new AbortController();
 document.documentElement.dataset.homeGuidePointerRun='focus-guide-run';window.addEventListener('sherlock:home-guide-cue',event=>{const value=event.detail;if(value?.requestId)window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:value.runId,requestId:value.requestId,ok:true}}))});
 window.focusSaved={title:'',blocks:[],yjs:'',revision:0,updatedAt:0};const persistence={request:async(method,input)=>{if(method==='load')return{saved:window.focusSaved};if(method==='save'){window.focusSaved={...input.content,revision:input.revision+1};return{status:'saved',saved:window.focusSaved}}if(method==='library-list'||method==='library-read')return window.focusLibrary(method,input);return{ok:true}},draft:async()=>{}};
 window.focusReady=mountHomeNotesGuide(document,document.querySelector('#guide'),{sessionId:'focus-guide-session',runId:'focus-guide-run',fresh:true,persistence,native:{generate:async()=>homeNotesGuideChart('focus-guide-run'),configureQuote:()=>window.configureFixtureQuote(),type:async()=>{},stop:async()=>{},dispose:()=>{}},signal:window.focusAbort.signal,waitUntilPlaying:()=>Promise.resolve(),wait:async(ms,signal)=>{if(signal)return new Promise((resolve,reject)=>{const timer=setTimeout(resolve,ms);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Stopped','AbortError'))},{once:true})})}}).then(guide=>window.focusGuide=guide);
 window.changeDocumentFocus=value=>{window.focusValue=value;window.dispatchEvent(new Event(value?'focus':'blur'))};
 window.focusSnapshot=()=>({gates:window.focusGates(),reviewRequests:window.focusRequests.length,replies:[...window.focusReplies],marks:new Set([...document.querySelectorAll('.bn-editor [data-bn-thread-id]')].map(node=>node.dataset.bnThreadId)).size,title:document.querySelector('.en-title')?.value,editorPresent:!!document.querySelector('.bn-editor'),expanded:document.querySelector('.en-challenge-trigger')?.getAttribute('aria-expanded'),grade:document.querySelector('.en-challenge-grade')?.textContent});
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'focus-fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[esbuildRawSource(),{name:'read-only-focus-observations',setup(b){
  b.onLoad({filter:/preload\/notes\/challenge-controller\.ts$/},async({path})=>{
   const source=await readFile(path,'utf8'),anchor=' const request=async(input:ChallengeRequest,signal:AbortSignal):Promise<ChallengeResult>=>{'
   if(source.split(anchor).length!==2)throw Error('Actual controller observation boundary drifted')
   const observation=` window.focusGates=()=>({active:active(),optionActive:latest.current.active!==false,recovery:!!latest.current.recovery,surfaceVisible:noteEditorVisible(latest.current.scroll.current),visibility:document.visibilityState,hasFocus:document.hasFocus(),restoring:restoring.current,busy:!!(latest.current.busy||latest.current.isBusy?.()||action.current||picker.current.open||Date.now()<settle.current),pickerOpen:picker.current.open,composing:!!editor._tiptapEditor.view.composing,level:readLevel(),phase:state.current.phase,sessionId,documentFingerprint:JSON.stringify([latest.current.title,blocks()])});\n`
   return{contents:source.replace(anchor,observation+anchor),loader:'ts'}
  })
  b.onLoad({filter:/preload\/home-guide-notes-data\.ts$/},async({path})=>{
   const source=await readFile(path,'utf8'),anchor='  async request(method,input){',reply='await beforeReply?.();assert(input);return homeNotesGuideChallengeResult(value)'
   if(source.split(anchor).length!==2||source.split(reply).length!==2)throw Error('Actual local-guide bridge observation boundary drifted')
   return{contents:source.replace(anchor,anchor+`\n   if(method==='challenge'&&input.action==='review')window.focusRequests.push({action:input.action,level:input.level,at:performance.now()});`).replace(reply,`await beforeReply?.();assert(input);const result=homeNotesGuideChallengeResult(value);window.focusReplies.push({issues:result.issues.length,at:performance.now()});return result`),loader:'ts'}
  })
 }}]})
 script=built.outputFiles.find(file=>file.path.endsWith('.js')).text;css=(built.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'')+'\n'+await readFile('scripts/lib/financial-widget.css','utf8')
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(outputDirectory,{recursive:true})
},60000)
afterAll(async()=>{await browser?.close();await writeFile(outputDirectory+'/focus-experiment.json',JSON.stringify(evidence,null,2)+'\n')})

async function fixture(focused){
 // Keep the same motion preference in every case; test focus, not token pacing.
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[]
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(5000)
 await page.route('http://127.0.0.1/notes-focus?focus='+focused,route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><title>Notes focus predicate experiment</title><body data-workspace-surface="notes" style="margin:0;width:100vw;height:100vh;overflow:hidden"><div id="guide" class="en-root" data-home-guide-notes style="left:0;top:0;right:360px;bottom:0"></div>'}))
 await page.exposeFunction('focusLibrary',(method,input)=>method==='library-list'?noteLibraryItems({list:()=>[]}):noteLibraryNode({list:()=>[]},input.id,'owner'));await page.route('http://127.0.0.1/fonts/NotoSansSC.woff2',route=>route.fulfill({path:'build/fonts/NotoSansSC.woff2',contentType:'font/woff2'}));await page.emulateMedia({reducedMotion:'reduce'});await page.goto('http://127.0.0.1/notes-focus?focus='+focused);await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.evaluate(()=>window.focusReady)
 for(const step of ['write','note-chart-compose','note-chart-review','note-chart-apply','note-write-middle','note-slash-quote','note-quote-configure','note-write-tail','challenge'])await page.evaluate(step=>window.focusGuide.runStep(step),step)
 return{context,page,errors}
}
function expectOtherGates(snapshot){
 expect(snapshot.gates).toMatchObject({optionActive:true,recovery:false,surfaceVisible:true,visibility:'visible',restoring:false,busy:false,pickerOpen:false,composing:false,level:3,sessionId:'focus-guide-session'})
 expect(snapshot).toMatchObject({editorPresent:true,expanded:'false',grade:'严格'})
 expect(snapshot.title.length).toBeGreaterThan(0)
}
async function startReview(page){
 await page.evaluate(()=>{window.focusReview={status:'pending',started:performance.now()};window.focusReviewPromise=window.focusGuide.runStep('review').then(()=>window.focusReview={...window.focusReview,status:'success',finished:performance.now()},error=>window.focusReview={...window.focusReview,status:'error',error:error.message,finished:performance.now()})})
 await expect.poll(()=>page.locator('.en-challenge-trigger').getAttribute('aria-expanded')).toBe('false')
}

it('runs the actual local strict review with a focused and visible NotesApp',async()=>{
 const{context,page,errors}=await fixture(true);try{
  await startReview(page)
  await expect.poll(()=>page.evaluate(()=>window.focusReview.status),{timeout:8000}).toBe('success')
  const snapshot=await page.evaluate(()=>window.focusSnapshot());expectOtherGates(snapshot)
  expect(snapshot.gates.hasFocus).toBe(true);expect(snapshot.gates.active).toBe(true)
  expect(snapshot.reviewRequests).toBe(1);expect(snapshot.replies.map(value=>value.issues)).toEqual([3]);expect(snapshot.marks).toBe(3);expect(errors).toEqual([])
  evidence.push({case:'focused baseline',snapshot,review:await page.evaluate(()=>window.focusReview)})
 }finally{await context.close()}
},25000)

it('keeps review and marks at zero without focus, then creates all three professional marks when only focus returns',async()=>{
 const{context,page,errors}=await fixture(false);try{
  await startReview(page)
  await page.waitForTimeout(3500)
  const blocked=await page.evaluate(()=>window.focusSnapshot());expectOtherGates(blocked)
  expect(blocked.gates).toMatchObject({hasFocus:false,active:false,phase:'paused'});expect(blocked.reviewRequests).toBe(0);expect(blocked.marks).toBe(0)
  expect(await page.evaluate(()=>window.focusReview.status)).toBe('pending')
  await page.evaluate(()=>window.changeDocumentFocus(true))
  await expect.poll(()=>page.evaluate(()=>window.focusReview.status),{timeout:5500}).toBe('success')
  const restored=await page.evaluate(()=>window.focusSnapshot());expectOtherGates(restored)
  expect(restored.gates.documentFingerprint).toBe(blocked.gates.documentFingerprint)
  expect(restored.gates.hasFocus).toBe(true);expect(restored.gates.active).toBe(true);expect(restored.reviewRequests).toBe(1);expect(restored.replies.map(value=>value.issues)).toEqual([3]);expect(restored.marks).toBe(3);expect(errors).toEqual([])
  evidence.push({case:'focus false then true',blocked,restored,review:await page.evaluate(()=>window.focusReview)})
 }finally{await context.close()}
},25000)

it('reproduces the actor review timeout and disposal when the otherwise-ready note never regains focus',async()=>{
 const{context,page,errors}=await fixture(false);try{
  await startReview(page)
  const blocked=await page.evaluate(()=>window.focusSnapshot());expectOtherGates(blocked)
  expect(blocked.gates).toMatchObject({hasFocus:false,active:false,phase:'paused'});expect(blocked.reviewRequests).toBe(0);expect(blocked.marks).toBe(0)
  await page.evaluate(()=>window.focusReviewPromise)
  const review=await page.evaluate(()=>window.focusReview),requests=await page.evaluate(()=>window.focusRequests)
  expect(review.status).toBe('error');expect(review.error).toBe('演示步骤未就绪，请重新播放。');expect(review.finished-review.started).toBeGreaterThanOrEqual(10000)
  expect(requests).toEqual([]);expect(await page.locator('.bn-editor').count()).toBe(0);expect(errors).toEqual([])
  evidence.push({case:'focus remains false',blocked,review,reviewRequests:requests.length,editorRemoved:true})
 }finally{await context.close()}
},25000)
