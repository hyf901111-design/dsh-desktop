import {afterAll,beforeAll,expect,it} from 'vitest'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {canvasCss} from '../scripts/lib/figma-canvas-client.mjs'
import {stripWorkbenchReplay} from './fixtures/strip-workbench-replay.mjs'
import {stripConversationLiveUi} from './fixtures/strip-conversation-live-ui.mjs'

let browser,script
const evidence='/tmp/odyssey-history-edit-board-fill/board'
beforeAll(async()=>{
 await mkdir(evidence,{recursive:true})
 const require=createRequire(import.meta.url)
 let source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 // Match production unwind order, including the parallel composer layer in integration.
 source=stripConversationLiveUi(source)
 for(const [file,strip] of [['board-tabs-client','stripBoardTabsClient'],['conversation-history-page','stripConversationHistoryClient'],['conversation-submission','stripConversationSubmission'],['conversation-response-progress','stripConversationResponseProgress'],['plain-slash-input','stripPlainSlashInput'],['sidebar-new-note','stripSidebarNewNoteConversation'],['pptx-annotation-message','stripPptxAnnotationMessages'],['pptx-annotation-native','stripPptxAnnotationInput'],['home-guide-presentation-native','stripHomeGuidePresentationNative'],['home-guide-native','stripHomeGuideNative']]){if(file==='home-guide-presentation-native')source=stripWorkbenchReplay(source);source=require('../scripts/lib/'+file+'.mjs')[strip](source)}
 const grid=require('../scripts/lib/research-grid-workbench.mjs')
 source=grid.patchResearchGridWorkbench(require('../scripts/lib/financial-widget-client.mjs').patchFinancialWidgetClient(require('../scripts/lib/component-data-refresh.mjs').patchComponentDataRefresh(grid.restoreResearchGridWorkbench(source))))
 source=require('../scripts/lib/board-tabs-client.mjs').patchBoardTabsClient(source)
 source=require('../scripts/lib/research-workbench-feedback.mjs').patchResearchWorkbenchFeedback(source)
 expect(require('../scripts/lib/board-tabs-client.mjs').patchBoardTabsClient(source)).toBe(source)
 expect(()=>new Function(source)).not.toThrow()
 const entry=`import * as React from 'react';import * as ReactDom from 'react-dom';import * as jsx from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';
 let descriptor;window.__ModuleLoader__={load:value=>descriptor=value};window.dshDesktop={};
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 (0,eval)(${JSON.stringify(source)});
 const bundle=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?ReactDom:id==='@deepseek-ai/dsh-client-ui-primitives'?new Proxy({MarkdownText:({text})=>React.createElement('div',null,text)},{get:(t,k)=>t[k]||(String(k).startsWith('Icon')?()=>null:fake)}):fake);
 const registry=new bundle.ResearchWorkspaceRegistry(localStorage),workspace=registry.for('tab-drop-focus'),root=createRoot(document.getElementById('host'));
 window.fixture={bundle,workspace,registry};root.render(React.createElement(bundle.ResearchCanvas,{sessionId:'tab-drop-focus',t:x=>x,researchWorkspaces:registry,selectionGeneration:{disabled:false},actions:{}}));`
 script=(await build({stdin:{contents:entry,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'})).outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>browser?.close())

async function fixture(width=1000){
 const page=await browser.newPage({viewport:{width:width+60,height:900},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',error=>errors.push(error.message));page.on('requestfailed',request=>errors.push(request.url()+' '+request.failure()?.errorText))
 page.on('console',message=>{if(message.type()==='error'||message.type()==='warning')errors.push(message.text())})
 await page.route('https://tab-drop-focus.test/',route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><title>工作台生成布局验证</title><style>${canvasCss}\nhtml,body{margin:0;background:#101010;color:#eee}#host{height:880px;width:${width}px}[data-research-canvas]{height:836px!important}</style><body data-ds-dark-theme><div id="host"></div>`}))
 await page.route('https://tab-drop-focus.test/fonts/NotoSansSC.woff2',route=>route.fulfill({path:'build/fonts/NotoSansSC.woff2',contentType:'font/woff2'}))
 await page.goto('https://tab-drop-focus.test/');await page.addScriptTag({content:script});await page.waitForSelector('[data-ework-grid]')
 await page.evaluate(()=>{
  const w=fixture.workspace
  const types=['metrics','chart','table','news','reports'],titles=['龙头行情总览','龙头K线','估值与财务对比','行业新闻','公司公告']
  const panels=Array.from({length:10},(_,i)=>({nodeId:'panel-'+i,taskId:'task-'+i,title:(i<5?'半导体':'白酒')+titles[i%5],prompt:'研究行业龙头',type:types[i%5],x:i%2?672:0,y:Math.floor(i/2)*480,width:i%5===0?420:i%5===2?980:656,height:i%5===0?220:i%5===1?456:410,size:'large',...(i%5===2?{workbenchSpan:true,workbenchLayoutVersion:1}:{})}))
  window.plan={id:'generation-fill',title:'双页签行业研究',createdAt:Date.now(),tabs:[{name:'半导体',panelIndexes:[0,1,2,3,4]},{name:'白酒',panelIndexes:[5,6,7,8,9]}],panels}
  if(!w.applyWorkbench(window.plan))throw Error('plan rejected')
 })
 await page.waitForSelector('[data-board-tab]')
 return {page,errors}
}
async function frames(page){return page.locator('[data-research-node-id]').evaluateAll(els=>els.filter(el=>!el.hidden&&getComputedStyle(el).display!=='none'&&!el.querySelector('[data-board-tabs-nav]')).map(el=>({id:el.dataset.researchNodeId,...el.getBoundingClientRect().toJSON()})))}
function filled(boxes,ids,lanes=2){
 const [a,b,c,d,e]=ids.map(id=>boxes.find(box=>box.id===id))
 expect(a,JSON.stringify(boxes)).toBeDefined();expect(b).toBeDefined();expect(c).toBeDefined()
 expect(a.x).toBeCloseTo(12,0)
 if(lanes===2){expect(b.x-a.right).toBeCloseTo(10,0);expect(b.y).toBe(a.y);expect(a.height).toBe(b.height);expect(c.width).toBeCloseTo(a.width+b.width+10,0);expect(c.y-a.bottom).toBeCloseTo(10,0);expect(e.x-d.right).toBeCloseTo(10,0)}
 else{for(const n of [a,b,c,d,e]){expect(n.x).toBeCloseTo(12,0);expect(n.width).toBeCloseTo(a.width,0)}}
}
it.each([1000,560])('双页签从排队卡到部分完成立即填满可用看板，切页保持布局 (%s px)',async width=>{
 const {page,errors}=await fixture(width)
 try{
  expect(page.url()).toBe('https://tab-drop-focus.test/');expect(await page.title()).toBe('工作台生成布局验证')
  expect(await page.getByRole('tab').count()).toBe(2)
  await page.waitForFunction(()=>document.querySelectorAll('[data-research-node-id] .odyssey-generation-surface').length>=5)
  let before=await frames(page);filled(before,['panel-0','panel-1','panel-2','panel-3','panel-4'],width>=650?2:1)
  await page.screenshot({path:join(evidence,'queued-'+width+'.png')})
  await page.getByRole('tab',{name:'白酒',exact:true}).click()
  await page.waitForSelector('[data-research-node-id="panel-9"] .odyssey-generation-surface')
  filled(await frames(page),['panel-5','panel-6','panel-7','panel-8','panel-9'],width>=650?2:1)
  await page.getByRole('tab',{name:'半导体',exact:true}).click()
  await page.evaluate(()=>fixture.workspace.applyGenerationInspection('panel-0',{taskId:'task-0',canvasNodeId:'panel-0',state:'completed',lastSeq:1,events:[],finalOutput:JSON.stringify({version:1,type:'table',title:'半导体龙头行情总览',columns:['名称','状态'],rows:[['验证标的','数据已返回']]})}))
  await page.waitForSelector('[data-research-node-id="panel-0"] table')
  const after=await frames(page)
  for(const old of before.filter(n=>n.id.startsWith('panel-')))expect(after.find(n=>n.id===old.id)).toEqual(old)
  await page.screenshot({path:join(evidence,'mixed-'+width+'.png')})
  expect(await page.locator('vite-error-overlay,nextjs-portal').count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
},20000)
it('allows a fresh attempt for a partial source view without discarding its usable content',async()=>{
 const {page,errors}=await fixture(1000)
 try{
  const result=await page.evaluate(()=>{
   const w=fixture.workspace,spec={version:1,type:'html',title:'来源明细',html:'<body data-observed-table-recovery><p>已取得的真实记录；原定制呈现未完成。</p></body>'}
   w.applyGenerationInspection('panel-0',{taskId:'task-0',canvasNodeId:'panel-0',state:'completed',lastSeq:1,events:[],finalOutput:JSON.stringify(spec)})
   const before=w.getSnapshot().artifacts.find(n=>n.id==='panel-0'),target=w.retryGeneration('panel-0'),after=w.getSnapshot().artifacts.find(n=>n.id==='panel-0')
   return {target:target!==null,status:after.generationStatus,retained:JSON.stringify(before.containerSpec)===JSON.stringify(after.containerSpec)}
  })
  expect(result).toEqual({target:true,status:'queued',retained:true});expect(errors).toEqual([])
 }finally{await page.close()}
},20000)
