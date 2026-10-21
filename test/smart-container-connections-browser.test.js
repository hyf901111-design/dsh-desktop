import {beforeAll,afterAll,expect,it} from 'vitest'
import {readFile,mkdir} from 'node:fs/promises'
import {createServer} from 'node:http'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
const require=createRequire(import.meta.url)
let browser,server,origin,source,bootstrap
beforeAll(async()=>{
 const grid=require('../scripts/lib/research-grid-workbench.mjs'),financial=require('../scripts/lib/financial-widget-client.mjs'),data=require('../scripts/lib/component-data-refresh.mjs'),creation=require('../scripts/lib/canvas-creation-tools.mjs')
 source=creation.patchCanvasCreationTools(grid.patchResearchGridWorkbench(financial.patchFinancialWidgetClient(data.patchComponentDataRefresh(grid.restoreResearchGridWorkbench(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))))))
 const output=await build({stdin:{resolveDir:process.cwd(),contents:`import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import {createRoot} from 'react-dom/client';
 window.__testReact={React,jsx,ReactDOM,createRoot};`},bundle:true,platform:'browser',format:'iife',write:false})
 bootstrap=output.outputFiles[0].text
 server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><body><div id="fixture"></div></body></html>')});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await pw.chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve))})
it('keeps real canvas connection endpoints on visible circles across themes, scrolling and source binding',async()=>{
 const page=await browser.newPage({viewport:{width:1200,height:820}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 try{
  await page.goto(origin);await page.addStyleTag({content:'html,body{margin:0;height:100%}#fixture{position:relative;width:1000px;height:760px;margin:20px 0 0 36px}[data-research-canvas]{position:relative!important;width:1000px!important;--odyssey-workspace-header-height:0px!important;border:2px solid transparent!important}[data-research-content-layer]{min-height:1200px!important}'})
  await page.addScriptTag({content:bootstrap})
  await page.evaluate(()=>{window.__ModuleLoader__={load:d=>window.__descriptor=d};window.dshDesktop={financialWidget:{request:async q=>q.action==='history'?{bars:[{date:'2026-10-19',open:10,high:12,low:9,close:11,volume:100}]}:{quotes:(q.symbols||[]).map(s=>({...s,price:11,changePercent:1})),receivedAt:'2026-10-21T00:00:00Z',source:'测试源'}}}})
  await page.addScriptTag({content:source})
  await page.evaluate(()=>{
   const {React,jsx,ReactDOM,createRoot}=window.__testReact,fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
   const bundle=window.__descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?ReactDOM:id==='@deepseek-ai/dsh-client-ui-primitives'?new Proxy({MarkdownText:({text})=>React.createElement('div',null,text)},{get:(t,k)=>t[k]||(String(k).startsWith('Icon')?()=>null:fake)}):fake)
   const registry=new bundle.ResearchWorkspaceRegistry(localStorage),workspace=registry.for('port-browser'),quote=workspace.createFinancialWidget('quote'),draft=workspace.createContainerDraft()
   workspace.setArtifacts(workspace.getSnapshot().artifacts.map(n=>n.id===quote.id?{...n,containerSpec:{...n.containerSpec,symbols:[{market:'SH',code:'600519',name:'测试标的'}]}}:n))
   workspace.setCanvasSize({width:1000,height:760,availableWidth:1000});workspace.setWorkbenchWidth(1000)
   workspace.applyWorkbenchCells([{id:quote.id,x:0,y:0,w:18,h:14},{id:draft.id,x:19,y:2,w:18,h:12}],true)
   window.__workspace=workspace;window.__ids={quote:quote.id,draft:draft.id};window.__generated=[]
   createRoot(document.querySelector('#fixture')).render(React.createElement(bundle.ResearchCanvas,{sessionId:'port-browser',t:x=>x,researchWorkspaces:registry,selectionGeneration:{disabled:false,generate:async request=>{window.__generated.push(request);return {ok:true,taskId:'fixture'}}},actions:{setResearchRightTab(){}}}))
  })
  const ids=await page.evaluate(()=>window.__ids),root=page.locator('[data-research-canvas]'),card=page.locator('[data-research-node-id="'+ids.draft+'"]'),output=page.locator('[data-financial-port-node="'+ids.quote+'"][data-financial-port=output]'),input=card.locator('[data-financial-port=input]')
  await input.waitFor();await output.waitFor()
  const footer=card.locator('[data-workbench-smart-footer]')
  await expect.poll(()=>footer.count()).toBe(1)
  expect(await footer.textContent()).toContain('待创建')
  const center=locator=>locator.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})
  const assertCenters=async()=>{
   expect(await footer.evaluate(el=>el.getBoundingClientRect().height)).toBe(24)
   const footerGeometry=await page.evaluate(({quote,draft})=>{
    const card=id=>document.querySelector('[data-research-node-id="'+id+'"]'),offset=(id,side)=>{const r=card(id).getBoundingClientRect(),p=card(id).querySelector('[data-financial-port="'+side+'"]>span').getBoundingClientRect();return r.bottom-p.top-p.height/2},target=card(draft),f=target.querySelector('[data-workbench-smart-footer]').getBoundingClientRect(),button=target.querySelector('[data-research-create-submit],[data-research-container-submit]').getBoundingClientRect()
    return {offset:Math.abs(offset(quote,'output')-offset(draft,'input')),gap:f.top-button.bottom}
   },ids)
   expect(footerGeometry.offset).toBeLessThan(.5);expect(footerGeometry.gap).toBeGreaterThanOrEqual(0)
   for(const port of [input,output]){
    const delta=await port.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.querySelector('span').getBoundingClientRect();return {x:Math.abs(a.left+a.width/2-b.left-b.width/2),y:Math.abs(a.top+a.height/2-b.top-b.height/2)}});expect(delta.x).toBeLessThan(.2);expect(delta.y).toBeLessThan(.2)
   }
   await expect.poll(async()=>page.locator('[data-workbench-create-link]>.ew-financial-connection-line').evaluateAll(lines=>{
    if(!lines.length)return 999
    const line=lines[0],matrix=line.getScreenCTM(),start=line.getPointAtLength(0).matrixTransform(matrix),end=line.getPointAtLength(line.getTotalLength()).matrixTransform(matrix),id=line.parentElement.getAttribute('data-workbench-create-link'),source=line.parentElement.getAttribute('data-connection-source')
    const dot=(id,side)=>{const r=document.querySelector('[data-financial-port-node="'+id+'"][data-financial-port="'+side+'"]>span').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}},a=dot(source,'output'),b=dot(id,'input')
    return Math.max(Math.hypot(start.x-a.x,start.y-a.y),Math.hypot(end.x-b.x,end.y-b.y))
   }),{timeout:2000}).toBeLessThan(.5)
  }
  await card.locator('textarea').fill('第一行');await card.locator('textarea').press('Enter');await card.locator('textarea').press('a')
  expect(await card.locator('textarea').inputValue()).toContain('\n');const prompt=await card.locator('textarea').inputValue()
  const a=await center(output),b=await center(input);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up()
  await expect.poll(()=>card.locator('[data-workbench-selected-create-context]').count()).toBe(1)
  expect(await card.textContent()).toContain('希望基于这个组件生成什么？');expect(await card.locator('textarea').inputValue()).toBe(prompt)
  expect(await footer.textContent()).toContain('已连接 1 个组件')
  await mkdir('/tmp/smart-container-ports-20261021',{recursive:true})
  for(const [mode,label] of [['light','浅色模式'],['dark','深色模式'],['enterprise','易方达模式'],['openterminal','彭博模式']]){
   await page.getByRole('radio',{name:label,exact:true}).click();await expect.poll(()=>root.getAttribute('data-workbench-style')).toBe(mode);await assertCenters()
   for(const port of [input,output])await expect.poll(()=>port.evaluate(el=>getComputedStyle(el.querySelector('span')).backgroundColor===getComputedStyle(el).color)).toBe(true)
   await root.evaluate(el=>el.scrollTop=50);await assertCenters();await root.evaluate(el=>el.scrollTop=0)
   await page.screenshot({path:'/tmp/smart-container-ports-20261021/'+mode+'.png'})
  }
  await root.evaluate(el=>{el.style.setProperty('width','900px','important')});await assertCenters()
  await page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en')
  await expect.poll(()=>footer.textContent()).toContain('Sources connected: 1')
  expect(await footer.getAttribute('aria-label')).toBe('Smart container footer');expect(await card.locator('textarea').inputValue()).toBe(prompt)
  await page.evaluate(()=>document.documentElement.dataset.odysseyLocale='zh');await expect.poll(()=>footer.textContent()).toContain('已连接 1 个组件')
  await page.screenshot({path:'/tmp/smart-container-ports-20261021/connected.png'})
  const based=await page.evaluate(()=>{const source=window.__workspace.createContainerDraft(),target=window.__workspace.beginSelectedCreateDraft([source.id]);window.__workspace.updateSelectedCreateDraft(target.id,'保留我的基准和需求');return {source:source.id,target:target.id}})
  const basedCard=page.locator('[data-research-node-id="'+based.target+'"]'),basedFooter=basedCard.locator('[data-workbench-smart-footer]')
  await basedFooter.waitFor();await basedCard.scrollIntoViewIfNeeded()
  expect(await page.locator('[data-financial-port-node="'+based.source+'"][data-financial-port=input]').count()).toBe(1)
  for(const [mode,label] of [['light','浅色模式'],['dark','深色模式'],['enterprise','易方达模式'],['openterminal','彭博模式']]){
   await page.getByRole('radio',{name:label,exact:true}).click();await expect.poll(()=>root.getAttribute('data-workbench-style')).toBe(mode)
   expect(await basedCard.locator('[data-financial-port=input]').count()).toBe(0);expect(await basedFooter.textContent()).toBe('基于 1 个组件')
   const inset=await basedFooter.evaluate(el=>{const r=el.getBoundingClientRect(),text=el.querySelector('.ew-smart-create-status').getBoundingClientRect();return text.left-r.left})
   expect(inset).toBe(10);expect(await basedCard.locator('textarea').inputValue()).toBe('保留我的基准和需求')
  }
  await page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en');await expect.poll(()=>basedFooter.textContent()).toBe('Source components: 1')
  await page.evaluate(()=>document.documentElement.dataset.odysseyLocale='zh');await expect.poll(()=>basedFooter.textContent()).toBe('基于 1 个组件')
  expect(errors).toEqual([]);await page.screenshot({path:'/tmp/smart-container-ports-20261021/no-source-output.png'})
 }finally{await page.close()}
},20000)
