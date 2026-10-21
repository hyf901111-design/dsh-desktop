import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile,mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
let browser,css,script
beforeAll(async()=>{
 const {patchResearchGridWorkbench}=require('../scripts/lib/research-grid-workbench.mjs'),{patchCanvasCreationTools,creationToolsCss}=require('../scripts/lib/canvas-creation-tools.mjs')
 const source=patchCanvasCreationTools(patchResearchGridWorkbench(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')))
 const gridStart=source.indexOf('/* EWORK_GRID_WORKBENCH_BEGIN */'),block=source.slice(gridStart,source.indexOf('/* EWORK_GRID_WORKBENCH_END */',gridStart))
 css=JSON.parse(block.match(/style\.textContent=("(?:\\.|[^"\\])*")/)[1])+creationToolsCss+await readFile('scripts/lib/financial-widget.css','utf8')
 const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)))
 const smart=extract('function ResearchContainerDraft(','const RESEARCH_CONTAINER_CHART_COLORS'),selected=extract('function WorkbenchSelectedCreateDraft(','function WorkbenchChrome(')
 // Use the actual serialized renderers; state/data acquisition stays outside
 // this focused presentation and native keyboard boundary check.
 const selectedStart=selected.indexOf('function WorkbenchSelectedCreateDraft('),selectedEnd=selected.indexOf('\nfunction ',selectedStart+10)
 const selectedOnly=selectedEnd<0?selected:selected.slice(0,selectedEnd)
 const output=await build({stdin:{resolveDir:process.cwd(),contents:`import * as react from 'react';import * as react_jsx_runtime from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';
 const workbenchText=x=>x,useWorkbenchLocale=()=>{},RESEARCH_CONTAINER_MAX_PROMPT=12000;
 ${extract('function researchDerivedIsComposing(','function useResearchDerivedFloating(')}
 ${smart}\n${selectedOnly}
 window.created=[];const submit=(node,prompt)=>window.created.push({id:node.id,prompt});
 const node={id:'smart',containerPrompt:''},based={id:'based',containerPrompt:''};
 const root=createRoot(document.querySelector('[data-research-content-layer]'));
 const card=(id,body,context)=>react.createElement('article',{'data-research-node-id':id,'data-research-generated-container':'','data-research-compact-chrome':'',style:{left:id==='smart'?12:490}},react.createElement('header',{className:'rScV5Q_nodeTitle'},'智能容器'),react.createElement('div',{'data-research-artifact-content':'',className:'body'},context,body));
 root.render(react.createElement(react.Fragment,null,card('smart',react.createElement(ResearchContainerDraft,{node,onSubmit:submit})),card('based',react.createElement(WorkbenchSelectedCreateDraft,{node:based,onSubmit:submit,onPrompt:()=>{}}),react.createElement('div',{className:'ew-selected-create-context'},react.createElement('div',{className:'ew-selected-create-source'},'基于：本人记录')))));
 `},bundle:true,platform:'browser',format:'iife',write:false})
 script=output.outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await pw.chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(()=>browser?.close())
it('shares the smart layout, keeps prompt borders unchanged on focus, and creates only on command-enter',async()=>{
 const page=await browser.newPage({viewport:{width:1000,height:620}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 try{
  await page.setContent('<style>html,body{margin:0;height:100%}main{position:relative}article{position:absolute;top:12px;width:460px;height:460px;display:flex;flex-direction:column}header{height:34px;flex:none}.body{display:flex;flex-direction:column;flex:1;min-height:0}</style><main data-research-canvas data-ework-grid data-workbench-style="dark"><div data-research-content-layer></div></main>')
  await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('textarea').first().waitFor()
  for(const mode of ['light','dark','enterprise','openterminal']){
   await page.locator('main').evaluate((el,mode)=>el.dataset.workbenchStyle=mode,mode)
   const frames=[]
   for(const id of ['smart','based']){
    const card=page.locator('[data-research-node-id="'+id+'"]'),input=card.locator('textarea'),button=card.locator('button').last()
    const before=await input.evaluate(el=>getComputedStyle(el).borderColor);await input.focus()
    expect(await input.evaluate(el=>({border:getComputedStyle(el).borderColor,outline:getComputedStyle(el).outlineStyle}))).toEqual({border:before,outline:'none'})
    const box=await button.boundingBox(),field=await input.boundingBox(),outer=await card.boundingBox();expect(field.y+field.height).toBeLessThanOrEqual(box.y)
    expect(box.y+box.height).toBeLessThanOrEqual(outer.y+outer.height);frames.push({width:box.width,height:box.height,color:await button.evaluate(el=>getComputedStyle(el).backgroundColor)})
   }
   expect(frames[0]).toEqual(frames[1])
  }
  expect(await page.locator('.ew-draft-hint').count()).toBe(0)
  for(const id of ['smart','based']){
   const input=page.locator('[data-research-node-id="'+id+'"] textarea');await input.fill('第一行');await input.press('Enter');await input.press('End');await input.press('a');expect(await input.inputValue()).toContain('\n')
   expect(await page.evaluate(()=>window.created.length)).toBe(id==='smart'?0:1)
   await input.press('Meta+Enter');expect(await page.evaluate(()=>window.created.at(-1).id)).toBe(id)
  }
  expect(errors).toEqual([]);await mkdir('/tmp/smart-container-create-20261021',{recursive:true});await page.screenshot({path:'/tmp/smart-container-create-20261021/shared-layout.png'})
 }finally{await page.close()}
},15000)
