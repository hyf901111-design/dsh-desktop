import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile,mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {patchResearchCreationProgress} from '../scripts/lib/research-creation-progress.mjs'
import {restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
import {patchComponentDataRefresh} from '../scripts/lib/component-data-refresh.mjs'
import {planningResponseMetadata,researchPlanningRequest} from '../scripts/lib/research-planning-feedback.mjs'
import {stripConversationGridOverlays} from './fixtures/strip-conversation-transient-ui.mjs'
import {stripConversationComponents} from '../scripts/lib/conversation-components.mjs'
import {stripHomeGuideNative} from '../scripts/lib/home-guide-native.mjs'
import {stripHomeGuidePresentationNative} from '../scripts/lib/home-guide-presentation-native.mjs'
let browser,script,progressCss
const evidence=process.env.SHERLOCK_FEEDBACK_EVIDENCE||'/tmp/workbench-feedback-task9-20261021'
beforeAll(async()=>{
 progressCss=await readFile('src/preload/workbench-progress.css','utf8')
 const installed=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const clean=restoreResearchGridWorkbench(stripConversationComponents(stripHomeGuideNative(stripHomeGuidePresentationNative(stripConversationGridOverlays(installed)))))
 const source=patchComponentDataRefresh(patchResearchCreationProgress(clean))
 const storeStart=source.indexOf('/* ODYSSEY_COMPONENT_DATA_START */'),storeEnd=source.indexOf('function openComponentData(',storeStart)
 if(storeStart<0||storeEnd<0)throw Error('Actual injected component store missing')
 const start=source.search(/\/\* ework:workbench-feedback:v\d+ \*\//),end=source.indexOf('const ExecutionStatusGroup =',start)
 const feedbackEnd=source.indexOf('/* ework:workbench-feedback:end */',start)
 if(start<0||feedbackEnd<start||end<feedbackEnd)throw Error('Actual workbench feedback helper boundary missing')
 const chat=source.slice(source.indexOf('function ChatView('),source.indexOf('//#region lib/types/client/contract/slots.js',source.indexOf('function ChatView(')))
 const flowStart=chat.search(/renderFlow\.(?:map|flatMap)\(\(entry\) => \{/),flowEnd=chat.indexOf('\n\t\t\t\t\t\t]',flowStart)
 if(flowStart<0||flowEnd<0)throw Error('Actual ChatView render flow missing')
 const flowRender=chat.slice(flowStart,flowEnd),execution=source.slice(end,source.indexOf('//#endregion',end)),receiptLookup=chat.match(/const workbenchReceiptAnchors=researchWorkbenchReceiptAnchors\([^;]+;/)?.[0]
 const nativeNames=['conversationNodeTurn','assistantStepText','substantialAssistantReplies','isExecutionDetailNode','compactConversationFlow','mergePendingSteeringFlow']
 const nativeFlow=nativeNames.map(name=>{const start=source.indexOf('function '+name+'('),end=source.indexOf('\n\t\t}',start);if(start<0||end<0)throw Error('Native flow function missing: '+name);return source.slice(start,end+4)}).join('\n')
 if(!receiptLookup)throw Error('Actual ChatView receipt anchors missing')
 const output=await build({stdin:{resolveDir:process.cwd(),contents:`import * as react from 'react';import * as react_jsx_runtime from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';
${source.slice(storeStart,storeEnd)}
${source.slice(start,feedbackEnd)}
${planningResponseMetadata.toString()}
${researchPlanningRequest.toString()}
${nativeFlow}
const contentParts=()=>({text:''}),parseResearchPrompt=text=>({text});
const ChatView_module_css_default=new Proxy({},{get:(_target,key)=>String(key)}),executionDetailGroups=()=>[],executionProgressSurface=()=>({detailGroups:[],showProgress:false,updates:[]}),executionSummaryStatus=()=> '执行结果',formatRunDuration=()=>'',ToolImageOutputs=()=>null,ImageGenerationOutputs=()=>null;
const _deepseek_ai_dsh_client_ui_primitives={IconChevronRightOutline14:()=>null,IconThinkOutline14:()=>null};
function ChatNodeSeat({nodeKey}){return react.createElement('div',{'data-message-id':nodeKey},nodeKey)}
function PendingSteeringBubble(){return react.createElement('div',{'data-pending-steering':true},'pending steering')}
${execution}
function ReceiptConversation({sessionId,flow,rows,pending=[],runningTurnNumber=null}){
 const nodeStore=new Map(rows.map(row=>[row.key,row])),order=rows.map(row=>row.key),renderFlow=flow??mergePendingSteeringFlow(compactConversationFlow(order,nodeStore,runningTurnNumber),pending,nodeStore),timeline={turns:new Map()},runningTurn=null,loadImage=undefined,seatProps={},researchPlanningSurface=true,t=key=>key;
 ${receiptLookup}
 return react.createElement('section',{'data-conversation-session':sessionId},[${flowRender}]);
}
const plans=[{id:'plan',count:4}],target=window,root=createRoot(document.querySelector('main'));
let nodes=[],dispose;
window.retries=[];
const publish=()=>publishResearchWorkbenchProgress(target,'session',nodes,true,window.allowed!==false);
window.show=(statuses,english=false,allowed=true)=>{dispose?.();document.documentElement.dataset.odysseyLocale=english?'en':'zh';window.allowed=allowed;nodes=statuses.map((status,i)=>({id:'node-'+i,workbenchId:'plan',generationTaskId:'task-'+i,generationStatus:status,...(status==='completed'?{containerSpec:{type:'html'}}:{})}));publish();dispose=installResearchWorkbenchRetry({eventTarget:target,sessionId:'session',getArtifacts:()=>nodes,canRetry:()=>window.allowed,retry:async node=>{window.retries.push(node.id);node.generationStatus='retrying';publish();await new Promise(r=>setTimeout(r,200));node.generationStatus='completed';node.containerSpec={type:'html'};publish()}});root.render(react.createElement(ResearchWorkbenchProgress,{sessionId:'session',plans,footer:true}));};
window.complete=()=>{for(const node of nodes){node.generationStatus='completed';node.containerSpec={type:'html'}}publish()};
const restoredSnapshot={artifacts:[0,1,2,3].map(i=>({id:'saved-'+i,workbenchId:'plan',generationTaskId:'saved-task-'+i,generationStatus:i===3?'failed':'completed',...(i===3?{}:{containerSpec:{type:'html'}})}))};
function RestoredNotesEntry(){react.useEffect(()=>{publishInactiveResearchWorkbenchProgress(window,'cold-notes',restoredSnapshot.artifacts)},[]);return react.createElement(ResearchWorkbenchProgress,{sessionId:'cold-notes',plans,footer:true})}
window.restoreNotes=()=>{dispose?.();root.render(react.createElement(RestoredNotesEntry))};
window.showConversation=({sessionId,flow,rows,artifacts,active=true,pending=[],runningTurnNumber=null})=>{dispose?.();nodes=artifacts;const publishCurrent=()=>publishResearchWorkbenchProgress(window,sessionId,nodes,active,active);publishCurrent();dispose=installResearchWorkbenchRetry({eventTarget:window,sessionId,getArtifacts:()=>nodes,canRetry:()=>active,retry:async node=>{window.retries.push(node.id);node.generationStatus='retrying';publishCurrent();await new Promise(r=>setTimeout(r,100));node.generationStatus='completed';node.containerSpec={type:'html'};publishCurrent()}});root.render(react.createElement(ReceiptConversation,{sessionId,flow,rows,pending,runningTurnNumber}))};
window.publishSession=(sessionId,artifacts,active=true)=>publishResearchWorkbenchProgress(window,sessionId,artifacts,active,active);
let refreshMonitor,refreshPush;
window.startRefresh=(sessionId,rows)=>{refreshMonitor?.dispose();refreshMonitor=createComponentDataStatusMonitor({sessionId,store:componentDataStatusStore,isVisible:()=>true,bridge:{setVisible:async()=>{},request:async()=>rows,subscribe:fn=>{refreshPush=fn;return()=>{refreshPush=null}}}})};
window.refreshRows=(sessionId,rows)=>refreshPush?.({sessionId,rows});
window.nativeRefresh=(sessionId,nodeId,row)=>row?componentDataStatusStore.publishNative(sessionId,nodeId,row):componentDataStatusStore.clearNative(sessionId,nodeId);
window.leaveRefresh=()=>{refreshMonitor?.dispose();refreshMonitor=null};
window.show(['completed','completed','running','failed']);`},bundle:true,platform:'browser',format:'iife',write:false,loader:{'.css':'empty'}})
 script=output.outputFiles[0].text
 const pw=await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);const {chromium}=pw.default??pw
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())
it('renders mixed progress in narrow light/dark cards, retries only the failed node, and then shows completion in both languages',async()=>{
 const page=await browser.newPage({viewport:{width:380,height:220}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.setContent('<style>:root{--dsw-alias-border-l2:#ddd;--dsw-alias-bg-l2:#f7f7f7;--dsw-alias-label-primary:#161616;--dsw-alias-label-secondary:#666}body{font:12px system-ui;margin:16px}main{width:300px}</style><main></main>')
  await page.addStyleTag({content:progressCss})
  await page.addScriptTag({content:script})
  expect(await page.evaluate(()=>typeof window.show),errors.join('\n')).toBe('function')
  await page.getByRole('img',{name:'正在生成组件'}).waitFor()
  const retry=page.getByRole('button',{name:'重试未完成的组件'})
  const progress=page.getByRole('progressbar')
  const fill=progress.locator('[data-workbench-progress-fill]')
  const texture=()=>fill.evaluate(el=>getComputedStyle(el,'::before').animationName)
  expect(await progress.getAttribute('aria-valuenow')).toBe('2')
  expect(await progress.getAttribute('aria-valuemax')).toBe('4')
  expect((await fill.boundingBox()).width).toBeCloseTo((await progress.boundingBox()).width/2)
  expect(await texture()).toBe('ework-workbench-stripes')
  const runningTrackPaint=await progress.evaluate(el=>getComputedStyle(el).backgroundColor)
  await retry.waitFor()
  const title=await page.getByRole('status').boundingBox(),button=await retry.boundingBox()
  expect(button.x).toBeGreaterThanOrEqual(title.x+title.width)
  await page.screenshot({path:evidence+'/mixed-light.png'})
  await retry.click()
  await page.waitForFunction(()=>window.retries.length===1&&!document.querySelector('button'))
  expect(await page.evaluate(()=>window.retries)).toEqual(['node-3'])
  expect(await page.getByRole('img',{name:'正在生成组件'}).count()).toBe(1)
  await page.evaluate(()=>window.complete())
  await page.getByText('已完成',{exact:true}).waitFor()
  expect(await progress.getAttribute('aria-valuenow')).toBe('4')
  expect(await texture()).toBe('none')
  await page.waitForFunction(()=>document.querySelector('[data-workbench-progress-fill]').offsetWidth===document.querySelector('[data-workbench-progress-track]').clientWidth)
  expect(await page.locator('svg').count()).toBe(0)
  await page.screenshot({path:evidence+'/completed-light.png'})
  await page.evaluate(()=>{document.documentElement.style.cssText='--dsw-alias-border-l2:#444;--dsw-alias-bg-l2:#242424;--dsw-alias-label-primary:#eee;--dsw-alias-label-secondary:#aaa';document.body.style.background='#151515';window.show(['completed','completed','failed','interrupted'],true)})
  await page.locator('[data-research-workbench-progress=partial]').waitFor()
  expect(await page.getByRole('progressbar').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(runningTrackPaint)
  await page.getByRole('button',{name:'Retry unsuccessful components'}).waitFor()
  expect(await page.getByRole('progressbar',{name:'Component generation progress'}).getAttribute('aria-valuenow')).toBe('2')
  expect(await texture()).toBe('none')
  await page.waitForFunction(()=>{
   const track=document.querySelector('[data-workbench-progress-track]')
   return Math.abs(track.querySelector('[data-workbench-progress-fill]').offsetWidth-track.clientWidth/2)<1
  })
  await page.screenshot({path:evidence+'/failed-dark-en.png'})
  await page.evaluate(()=>window.complete())
  await page.getByText('Completed',{exact:true}).waitFor()
  await page.evaluate(()=>window.show(['completed','completed','completed','failed'],false,false))
  await page.getByRole('button',{name:'重试未完成的组件'}).waitFor()
  expect(await page.getByRole('button',{name:'重试未完成的组件'}).isDisabled()).toBe(true)
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)

it('keeps zero and retry progress truthful and respects reduced motion',async()=>{
 const page=await browser.newPage({reducedMotion:'reduce'})
 try{
  await page.setContent('<main></main>');await page.addStyleTag({content:progressCss});await page.addScriptTag({content:script})
  const progress=page.getByRole('progressbar')
  const fill=progress.locator('[data-workbench-progress-fill]')
  await page.evaluate(()=>window.show(['running','queued','queued','queued']))
  await page.locator('[data-workbench-progress-zero]').waitFor()
  expect(await progress.getAttribute('aria-valuenow')).toBe('0')
  expect(await fill.evaluate(el=>el.offsetWidth)).toBe(0)
  expect(await progress.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none')
  await page.evaluate(()=>window.show(['completed','completed','retrying','failed']))
  await page.getByRole('status').filter({hasText:'正在重试组件 · 已生成 2/4'}).waitFor()
  expect(await progress.getAttribute('data-workbench-progress-motion')).toBe('retrying')
  expect(await progress.getAttribute('aria-valuenow')).toBe('2')
  expect(await fill.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none')
  expect(await page.locator('[data-workbench-progress-spinner]').evaluate(el=>getComputedStyle(el).animationName)).toBe('none')
  await page.evaluate(()=>window.show(['completed','completed']))
  await page.getByRole('status').filter({hasText:'2/2'}).waitFor()
  expect(await progress.getAttribute('aria-valuemax')).toBe('4')
  expect((await fill.boundingBox()).width).toBeCloseTo((await progress.boundingBox()).width/2)
  expect(await page.getByText('已完成',{exact:true}).count()).toBe(0)
 }finally{await page.close()}
},15000)

const receipt=(key,planId,count=1)=>({key,kind:'tool-call',data:{root:{kind:'tool-result',call:{name:'research_workbench_create'},content:[{type:'text',text:JSON.stringify({planId,status:'accepted',panelCount:count})}]}}})
const turn=(number,planId,count=1)=>({rows:[{key:'user-'+number,kind:'user'},receipt('tool-'+number,planId,count),{key:'assistant-'+number,kind:'assistant-step'}].map(row=>({...row,location:{kind:'step',turn:{turn:number}}})),flow:[{kind:'node',key:'user-'+number},{kind:'execution',key:'execution:'+number,turn:number,nodeKeys:['tool-'+number],running:false},{kind:'node',key:'assistant-'+number}]})
const artifact=(id,planId,status='running')=>({id,workbenchId:planId,generationTaskId:'task-'+id,generationStatus:status,...status==='completed'?{containerSpec:{type:'html'}}:{}})
const positions=page=>page.evaluate(()=>Array.from(document.querySelector('[data-conversation-session]').children).map(el=>el.getAttribute('data-message-id')||el.getAttribute('data-chat-flow-key')||(el.hasAttribute('data-research-workbench-progress')?'progress':el.hasAttribute('data-pending-steering')?'pending-steering':el.tagName)))

it('keeps a cold restored 7/8 card beside its original execution when new user and assistant messages arrive',async()=>{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.setContent('<main></main>');await page.addScriptTag({content:script})
  const original=turn(1,'original-plan',8),artifacts=Array.from({length:8},(_,i)=>artifact('original-'+i,'original-plan',i===7?'failed':'completed'))
  await page.evaluate(value=>window.showConversation(value),{sessionId:'original',...original,artifacts,active:false})
  await page.locator('[data-research-workbench-progress="partial"]').first().waitFor({timeout:2500}).catch(error=>{throw Error(error.message+'; page errors: '+errors.join('; '))})
  await page.evaluate(()=>window.originalProgress=document.querySelector('[data-research-workbench-progress]'))
  await page.evaluate(value=>window.showConversation(value),{sessionId:'original',rows:[...original.rows,{key:'你好',kind:'user'}],flow:[...original.flow,{kind:'node',key:'你好'}],artifacts,active:false})
  expect(await positions(page)).toEqual(['user-1','execution:1','assistant-1','progress','你好'])
  const later={rows:[...original.rows,{key:'你好',kind:'user'},{key:'新assistant',kind:'assistant-step'}],flow:[...original.flow,{kind:'node',key:'你好'},{kind:'node',key:'新assistant'}]}
  await page.evaluate(value=>window.showConversation(value),{sessionId:'original',...later,artifacts,active:false})
  expect(await positions(page)).toEqual(['user-1','execution:1','assistant-1','progress','你好','新assistant'])
  expect(await page.locator('[data-chat-flow-key="execution:1"] [data-research-workbench-progress]').count()).toBe(0)
  expect(await page.locator('[data-research-workbench-progress]').count()).toBe(1)
  expect(await page.evaluate(()=>window.originalProgress===document.querySelector('[data-research-workbench-progress]'))).toBe(true)
  artifacts[7]=artifact('original-7','original-plan','retrying')
  await page.evaluate(({artifacts})=>window.publishSession('original',artifacts),{artifacts})
  await page.getByRole('img',{name:'正在生成组件'}).waitFor()
  expect(await page.evaluate(()=>window.originalProgress===document.querySelector('[data-research-workbench-progress]'))).toBe(true)
  expect(await positions(page)).toEqual(['user-1','execution:1','assistant-1','progress','你好','新assistant'])
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)

it('keeps separate plan retries on their original rounds and isolates restored session state',async()=>{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.setContent('<main></main>');await page.addScriptTag({content:script})
  const first=turn(1,'plan-a'),second=turn(2,'plan-b'),rows=[...first.rows,...second.rows],flow=[...first.flow,...second.flow],artifacts=[artifact('one','plan-a','failed'),artifact('two','plan-b','running')]
  await page.evaluate(value=>window.showConversation(value),{sessionId:'multi',rows,flow,artifacts})
  await page.locator('[data-research-workbench-progress]').first().waitFor()
  expect(await positions(page)).toEqual(['user-1','execution:1','assistant-1','progress','user-2','execution:2','assistant-2','progress'])
  const cards=page.locator('[data-research-workbench-progress]');expect(await cards.count()).toBe(2)
  await page.evaluate(()=>window.originalProgress=document.querySelector('[data-research-workbench-progress]'))
  await cards.nth(0).getByRole('button',{name:'重试未完成的组件'}).click()
  await page.waitForFunction(()=>window.retries.includes('one')&&document.querySelector('[data-research-workbench-progress]')?.getAttribute('data-research-workbench-progress')==='completed')
  expect(await page.evaluate(()=>window.retries)).toEqual(['one'])
  expect(await cards.nth(1).getAttribute('data-research-workbench-progress')).toBe('running')
  expect(await page.evaluate(()=>window.originalProgress===document.querySelector('[data-research-workbench-progress]'))).toBe(true)
  expect(await positions(page)).toEqual(['user-1','execution:1','assistant-1','progress','user-2','execution:2','assistant-2','progress'])
  const restored=turn(3,'plan-a',2)
  await page.evaluate(value=>window.showConversation(value),{sessionId:'other-session',...restored,artifacts:[artifact('other-one','plan-a','completed'),artifact('other-two','plan-a','failed')],active:false})
  await page.locator('[data-conversation-session="other-session"] [data-research-workbench-progress="partial"]').waitFor()
  expect(await positions(page)).toEqual(['user-3','execution:3','assistant-3','progress'])
  expect(await cards.count()).toBe(1);expect(await cards.first().textContent()).toContain('1/2')
  expect(await cards.first().getByRole('button',{name:'重试未完成的组件'}).isDisabled()).toBe(true)
  await page.evaluate(({artifacts})=>window.publishSession('multi',artifacts),{artifacts})
  expect(await cards.first().textContent()).toContain('1/2');expect(errors).toEqual([])
 }finally{await page.close()}
},15000)

it('keeps the original card above native pending, admitted steering and later same-turn generation',async()=>{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.setContent('<main></main>');await page.addScriptTag({content:script})
  const location={kind:'step',turn:{turn:7}},row=(key,kind,seq,data={})=>({key,kind,anchorSeq:seq,location,data})
  const tool=(key,seq,planId,count)=>({...receipt(key,planId,count),anchorSeq:seq,location})
  const original=[row('user-7','user',1),tool('receipt-7',2,'original-plan',8),row('original-assistant','assistant-step',3,{finalNode:{seq:3},blocks:[{kind:'text',text:'Fixture answer. '.repeat(15)}]})]
  const artifacts=Array.from({length:8},(_,i)=>artifact('original-'+i,'original-plan',i===7?'failed':'completed'))
  const show=extra=>page.evaluate(value=>window.showConversation(value),{sessionId:'steering-session',rows:original,artifacts,runningTurnNumber:7,...extra})
  await show({});await page.locator('[data-research-workbench-progress="partial"]').waitFor({timeout:2500}).catch(error=>{throw Error(error.message+'; page errors: '+errors.join('; '))})
  await page.evaluate(()=>window.originalProgress=document.querySelector('[data-research-workbench-progress]'))
  await show({pending:[{id:'pending',anchorSeq:4,placement:'steering',content:[]}]})
  expect(errors).toEqual([])
  expect(await positions(page)).toEqual(['user-7','execution:7','original-assistant','progress','pending-steering','execution:7:1:pending:0'])
  expect(await page.evaluate(()=>window.originalProgress===document.querySelector('[data-research-workbench-progress]'))).toBe(true)
  const admitted=[...original,row('steering','steering',4)]
  await show({rows:admitted})
  expect(await positions(page)).toEqual(['user-7','execution:7','original-assistant','progress','steering','execution:7:1'])
  const continued=[...admitted,row('continued-assistant','assistant-step',5,{finalNode:{seq:5},blocks:[{kind:'text',text:'Fixture continuation.'}]})]
  await show({rows:continued})
  expect(await positions(page)).toEqual(['user-7','execution:7','original-assistant','progress','steering','execution:7:1'])
  const final=[...continued,tool('original-again',6,'original-plan',8),tool('new-plan',7,'new-plan',2),row('closing','turn-tail',8,{closing:{finalNode:{seq:8},blocks:[{kind:'text',text:'Fixture closing.'}]}})]
  await show({rows:final,artifacts:[...artifacts,artifact('new-one','new-plan','running'),artifact('new-two','new-plan','failed')]})
  expect(await positions(page)).toEqual(['user-7','execution:7','original-assistant','progress','steering','execution:7:1','closing','progress'])
  const cards=page.locator('[data-research-workbench-progress]');expect(await cards.count()).toBe(2)
  expect(await cards.first().textContent()).toContain('7/8')
  expect(await page.evaluate(()=>window.originalProgress===document.querySelector('[data-research-workbench-progress]'))).toBe(true)
  await cards.first().getByRole('button',{name:'重试未完成的组件'}).click()
  await page.waitForFunction(()=>document.querySelector('[data-research-workbench-progress]')?.getAttribute('data-research-workbench-progress')==='completed')
  expect(await page.evaluate(()=>window.retries)).toEqual(['original-7'])
  expect(await cards.last().getAttribute('data-research-workbench-progress')).toBe('running')
  expect(await positions(page)).toEqual(['user-7','execution:7','original-assistant','progress','steering','execution:7:1','closing','progress'])
  expect(await page.evaluate(()=>window.originalProgress===document.querySelector('[data-research-workbench-progress]'))).toBe(true)
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)

it('shows saved partial feedback on a cold notes entry with no canvas, with retry disabled and no false loading ring',async()=>{
 const page=await browser.newPage({viewport:{width:380,height:240}})
 try{
  await page.setContent('<main></main>')
  await page.addScriptTag({content:script})
  await page.getByRole('img',{name:'正在生成组件'}).waitFor()
  await page.evaluate(()=>window.restoreNotes())
  await page.getByRole('status').filter({hasText:'3/4'}).waitFor()
  expect(await page.getByText(/以上为上次状态/).count()).toBe(1)
  expect(await page.getByRole('button',{name:'重试未完成的组件'}).isDisabled()).toBe(true)
  expect(await page.getByRole('img',{name:'正在生成组件'}).count()).toBe(0)
  expect(await page.locator('[data-research-workbench-progress="waiting"]').count()).toBe(0)
  await page.screenshot({path:evidence+'/cold-notes-saved-state.png'})
 }finally{await page.close()}
},15000)


it('renders real refresh states without crowding actions in light/dark narrow/wide cards and retains them on the original Notes turn',async()=>{
 const page=await browser.newPage({viewport:{width:380,height:620}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
 try{
  await page.setContent('<title>Workbench refresh feedback</title><style>:root{--dsw-alias-border-l2:#ddd;--dsw-alias-bg-l2:#f7f7f7;--dsw-alias-label-primary:#161616;--dsw-alias-label-secondary:#666}body{font:12px system-ui;margin:16px}main{width:300px}</style><main></main>')
  await page.addScriptTag({content:script})
  expect(await page.title()).toBe('Workbench refresh feedback');expect(page.url()).toBe('about:blank')
  const first=turn(1,'refresh-plan',8),artifacts=['static','manual','paused','configured','failure','success','native','incomplete'].map(id=>artifact(id,'refresh-plan',id==='incomplete'?'failed':'completed'))
  artifacts[6].containerSpec={type:'financial-widget'}
  const rows=[{nodeId:'manual',enabled:false,intervalMinutes:0},{nodeId:'paused',enabled:false,intervalMinutes:1},{nodeId:'configured',enabled:true,intervalMinutes:1},{nodeId:'failure',enabled:true,intervalMinutes:1,status:'error',lastSuccess:1000,error:'PRIVATE'},{nodeId:'success',enabled:true,intervalMinutes:5,status:'success',lastSuccess:2000}]
  await page.evaluate(value=>window.showConversation(value),{sessionId:'refresh',...first,artifacts})
  await page.getByText(/刷新状态待确认 7/).waitFor()
  await page.evaluate(({rows})=>window.startRefresh('refresh',rows),{rows})
  await page.getByText(/静态内容 1/).waitFor()
  const card=page.locator('[data-research-workbench-progress]')
  for(const text of ['仅手动刷新 1','刷新已暂停 1','尚无成功记录 1','最近刷新失败 1','每 5 分钟刷新，最近刷新成功 1','刷新状态待确认 1'])expect(await card.textContent()).toContain(text)
  const assertLayout=async()=>{
   const bounds=await card.boundingBox(),button=await card.getByRole('button').boundingBox(),title=await card.getByRole('status').boundingBox()
   expect(button.x).toBeGreaterThanOrEqual(title.x+title.width)
   expect(button.x+button.width).toBeLessThanOrEqual(bounds.x+bounds.width)
   expect(await card.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
   for(const group of await card.locator('[data-refresh-group]').all()){const rect=await group.boundingBox();expect(rect.x+rect.width).toBeLessThanOrEqual(button.x);expect(await group.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)}
   expect(await page.locator('body').textContent()).not.toMatch(/PRIVATE|Error overlay|Vite Error/)
  }
  await assertLayout();await page.screenshot({path:evidence+'/refresh-mixed-light-narrow.png'})
  await page.evaluate(()=>{document.documentElement.style.cssText='--dsw-alias-border-l2:#444;--dsw-alias-bg-l2:#242424;--dsw-alias-label-primary:#eee;--dsw-alias-label-secondary:#aaa';document.body.style.background='#151515'})
  await assertLayout();await page.screenshot({path:evidence+'/refresh-mixed-dark-narrow.png'})
  await page.setViewportSize({width:1100,height:620});await page.evaluate(()=>document.querySelector('main').style.width='800px')
  await assertLayout();await page.screenshot({path:evidence+'/refresh-mixed-dark-wide.png'})
  await page.evaluate(()=>{document.documentElement.style.cssText='';document.body.style.background='white'})
  await assertLayout();await page.screenshot({path:evidence+'/refresh-mixed-light-wide.png'})
  await page.evaluate(()=>window.nativeRefresh('refresh','native',{enabled:true,intervalMinutes:1,status:'success',lastSuccess:3000}))
  await page.getByText(/已配置每分钟刷新，最近刷新成功 1/).waitFor()
  await page.evaluate(()=>{window.nativeRefresh('refresh','native',null);window.refreshRows('refresh',[])})
  await page.getByText(/上次观察：已配置每分钟刷新，最近刷新成功 1/).waitFor()
  expect(await card.textContent()).toContain('静态内容 6')
  await page.evaluate(({rows})=>window.refreshRows('refresh',rows),{rows})
  await page.getByText(/静态内容 1/).waitFor()
  await page.evaluate(()=>window.leaveRefresh())
  await page.evaluate(value=>window.showConversation(value),{sessionId:'refresh',rows:[...first.rows,{key:'new-message',kind:'user'}],flow:[...first.flow,{kind:'node',key:'new-message'}],artifacts,active:false})
  await page.locator('[data-refresh-history]').waitFor()
  expect((await card.textContent()).match(/上次观察：/g)).toHaveLength(1)
  expect(await card.locator('[data-refresh-group]').count()).toBe(7)
  expect(await positions(page)).toEqual(['user-1','execution:1','assistant-1','progress','new-message'])
  expect(await card.getByRole('button').isDisabled()).toBe(true)
  expect(await page.locator('svg').count()).toBe(0)
  await assertLayout();await page.screenshot({path:evidence+'/refresh-notes-last-observed.png'})
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)
