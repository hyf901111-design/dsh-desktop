import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile,mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {patchResearchCreationProgress} from '../scripts/lib/research-creation-progress.mjs'
import {restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
let browser,script
const evidence='/tmp/workbench-feedback-actions-20261021'
beforeAll(async()=>{
 const source=patchResearchCreationProgress(restoreResearchGridWorkbench(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')))
 const start=source.search(/\/\* ework:workbench-feedback:v\d+ \*\//),end=source.indexOf('const ExecutionStatusGroup =',start)
 const output=await build({stdin:{resolveDir:process.cwd(),contents:`import * as react from 'react';import * as react_jsx_runtime from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';
${source.slice(start,end)}
const plans=[{id:'plan',count:4}],target=window,root=createRoot(document.querySelector('main'));
let nodes=[],dispose;
window.retries=[];
const publish=()=>publishResearchWorkbenchProgress(target,'session',nodes,true,window.allowed!==false);
window.show=(statuses,english=false,allowed=true)=>{dispose?.();document.documentElement.dataset.odysseyLocale=english?'en':'zh';window.allowed=allowed;nodes=statuses.map((status,i)=>({id:'node-'+i,workbenchId:'plan',generationTaskId:'task-'+i,generationStatus:status,...(status==='completed'?{containerSpec:{type:'html'}}:{})}));publish();dispose=installResearchWorkbenchRetry({eventTarget:target,sessionId:'session',getArtifacts:()=>nodes,canRetry:()=>window.allowed,retry:async node=>{window.retries.push(node.id);node.generationStatus='retrying';publish();await new Promise(r=>setTimeout(r,200));node.generationStatus='completed';node.containerSpec={type:'html'};publish()}});root.render(react.createElement(ResearchWorkbenchProgress,{sessionId:'session',plans,footer:true}));};
window.complete=()=>{for(const node of nodes){node.generationStatus='completed';node.containerSpec={type:'html'}}publish()};
const restoredSnapshot={artifacts:[0,1,2,3].map(i=>({id:'saved-'+i,workbenchId:'plan',generationTaskId:'saved-task-'+i,generationStatus:i===3?'failed':'completed',...(i===3?{}:{containerSpec:{type:'html'}})}))};
function RestoredNotesEntry(){react.useEffect(()=>{publishInactiveResearchWorkbenchProgress(window,'cold-notes',restoredSnapshot.artifacts)},[]);return react.createElement(ResearchWorkbenchProgress,{sessionId:'cold-notes',plans,footer:true})}
window.restoreNotes=()=>{dispose?.();root.render(react.createElement(RestoredNotesEntry))};
window.show(['completed','completed','running','failed']);`},bundle:true,platform:'browser',format:'iife',write:false})
 script=output.outputFiles[0].text
 const {chromium}=await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())
it('renders mixed progress in narrow light/dark cards, retries only the failed node, and then shows completion in both languages',async()=>{
 const page=await browser.newPage({viewport:{width:380,height:220}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.setContent('<style>:root{--dsw-alias-border-l2:#ddd;--dsw-alias-bg-l2:#f7f7f7;--dsw-alias-label-primary:#161616;--dsw-alias-label-secondary:#666}body{font:12px system-ui;margin:16px}main{width:300px}</style><main></main>')
  await page.addScriptTag({content:script})
  await page.getByRole('img',{name:'正在生成组件'}).waitFor()
  const retry=page.getByRole('button',{name:'重试未完成的组件'})
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
  expect(await page.locator('svg').count()).toBe(0)
  await page.screenshot({path:evidence+'/completed-light.png'})
  await page.evaluate(()=>{document.documentElement.style.cssText='--dsw-alias-border-l2:#444;--dsw-alias-bg-l2:#242424;--dsw-alias-label-primary:#eee;--dsw-alias-label-secondary:#aaa';document.body.style.background='#151515';window.show(['completed','completed','failed','interrupted'],true)})
  await page.getByRole('button',{name:'Retry unsuccessful components'}).waitFor()
  await page.screenshot({path:evidence+'/failed-dark-en.png'})
  await page.evaluate(()=>window.complete())
  await page.getByText('Completed',{exact:true}).waitFor()
  await page.evaluate(()=>window.show(['completed','completed','completed','failed'],false,false))
  await page.getByRole('button',{name:'重试未完成的组件'}).waitFor()
  expect(await page.getByRole('button',{name:'重试未完成的组件'}).isDisabled()).toBe(true)
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
