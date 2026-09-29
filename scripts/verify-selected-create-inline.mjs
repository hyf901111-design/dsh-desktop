// Focused acceptance through the actual patched vendor factory and React canvas.
// Does not mutate node_modules or build the shared desktop application.
import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {patchResearchGridWorkbench,restoreResearchGridWorkbench} from './lib/research-grid-workbench.mjs'
const output=fileURLToPath(new URL('../output/selected-create-inline/',import.meta.url))
await mkdir(output,{recursive:true})
const installed=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),source=patchResearchGridWorkbench(installed)
assert.equal(restoreResearchGridWorkbench(source),restoreResearchGridWorkbench(installed))
assert.equal(patchResearchGridWorkbench(source),source)
const dependencies=await build({stdin:{contents:`import * as react from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot} from 'react-dom/client';window.testDeps={react,jsx,dom,createRoot};`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'})
const module=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href),playwright=module.default??module
const browser=await playwright.chromium.launch({executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
const report={figma:'Jkyr5rMvgM8GNH6E68xnqd / 1922:341090',rules:'1922:342383',checks:[],screenshots:[]}
try{
 const page=await browser.newPage({viewport:{width:1120,height:860}}),errors=[]
 page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message)})
 await page.route('**/*',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:'<style>body{margin:0}#mount{width:1080px;height:840px}.sRp_researchCanvas{height:100%}</style><div id="mount"></div>'}):r.abort())
 await page.goto('https://selected-create.fixture/')
 await page.addScriptTag({content:dependencies.outputFiles[0].text})
 await page.evaluate(()=>{window.__ModuleLoader__={load:d=>window.descriptor=d};window.dshDesktop={}})
 await page.addScriptTag({content:source})
 await page.addStyleTag({content:await readFile('src/preload/figma-canvas-gestures.css','utf8')})
 await page.evaluate(()=>{
   const {react,jsx,dom,createRoot}=testDeps,fake=new Proxy(function(){return null},{get:()=>fake,construct:()=>({})}),primitives=new Proxy({MarkdownText:({text})=>react.createElement('div',null,text)},{get:(t,k)=>Reflect.get(t,k)??(String(k).startsWith('Icon')?()=>null:fake)})
   const client=descriptor.factory(id=>({'react':react,'react/jsx-runtime':jsx,'react-dom':dom,'@deepseek-ai/dsh-client-ui-primitives':primitives}[id]??fake)),values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);return true}},registry=new client.ResearchWorkspaceRegistry(storage)
   window.workspace=registry.for('selected-inline');window.generateCalls=[];window.cancelCalls=[];window.nextResult={ok:false,error:'数据源响应超时'}
   const generate=async input=>{generateCalls.push(input);return nextResult},cancel=async input=>{cancelCalls.push(input);return {ok:true}}
   window.root=createRoot(document.querySelector('#mount'));dom.flushSync(()=>root.render(react.createElement(client.ResearchCanvas,{sessionId:'selected-inline',t:k=>k,researchWorkspaces:registry,selectionGeneration:{disabled:false,generate,cancel}})))
   window.reset=(mode='right')=>dom.flushSync(()=>{
     workspace.setArtifacts([{id:'base',kind:'generated-container',messageId:'base',title:'地域收入 · AAPL',excerpt:'地域收入原始内容',containerPrompt:'原始财年收入',refreshMinutes:0,generationStatus:'completed',generationLastSeq:0,containerSpec:{version:1,type:'table',title:'地域收入 · AAPL',columns:['地域','2025 财年'],rows:[['美洲','178 B'],['欧洲','112 B']]},x:200,y:200,width:450,height:270,sizeMode:'manual'},...(mode==='occupied'?[{id:'neighbor',kind:'pasted-text',messageId:'neighbor',title:'邻居',excerpt:'保留邻居内容',x:750,y:200,width:450,height:270,sizeMode:'manual'}]:[])])
     workspace.setWorkbenchWidth(1080);workspace.applyWorkbenchCells([{id:'base',x:mode==='edge'?20:0,y:0,w:20,h:11},...(mode==='occupied'?[{id:'neighbor',x:20,y:0,w:20,h:11}]:[])],true);workspace.updateSelection(['base'],'replace')
   })
   window.reset()
 })
 const menu=async()=>{
   const trigger=page.locator('[data-workbench-more="base"]')
   await trigger.scrollIntoViewIfNeeded()
   await trigger.evaluate(async el=>Promise.all(el.closest('[data-research-node-id]').getAnimations().map(a=>a.finished.catch(()=>{}))))
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
   await trigger.click();await page.getByRole('menuitem',{name:'基于所选创建',exact:true}).click()
 }
 await menu()
 const draft=page.locator('[data-workbench-selected-create-draft]'),input=draft.getByRole('textbox',{name:'创建需求'})
 await draft.waitFor();await page.waitForFunction(()=>document.activeElement?.matches('[data-workbench-selected-create-draft] textarea'))
 assert.equal(await page.locator('[data-research-create-popover]').count(),0)
 let state=await page.evaluate(()=>({nodes:workspace.getSnapshot().artifacts,cells:workspace.getWorkbenchCells(),selected:workspace.getSnapshot().selection.selectedNodeIds}))
 const id=state.nodes.find(n=>n.id!=='base').id,initial=state.cells.find(c=>c.id===id)
 assert.equal(initial.x,20);assert.equal(initial.y,0);assert.deepEqual(state.selected,[id]);assert.equal(state.nodes.length,2)
 await input.fill('整理为地域收入对比表，保留年份、单位和原始来源。')
 await page.locator('[data-workbench-view-source="'+id+'"]').click()
 assert.deepEqual(await page.evaluate(()=>workspace.getSnapshot().selection.selectedNodeIds),['base'])
 assert.equal(await draft.count(),1,'looking at source preserves the draft')
 await menu();assert.equal(await draft.count(),1,'repeat create focuses the existing draft')
 assert.equal(await input.inputValue(),'整理为地域收入对比表，保留年份、单位和原始来源。')
 const originalText=state.nodes.find(n=>n.id==='base').containerSpec.rows[0][1]
 await page.evaluate(()=>{const nodes=workspace.getSnapshot().artifacts;workspace.setArtifacts(nodes.map(n=>n.id==='base'?{...n,containerSpec:{...n.containerSpec,rows:[['美洲','999 B']]}}:n))})
 await page.screenshot({path:output+'inline-input-light.png'});report.screenshots.push('inline-input-light.png')
 await draft.getByRole('button',{name:'生成组件',exact:true}).click()
 await page.waitForFunction(id=>workspace.getSnapshot().artifacts.find(n=>n.id===id)?.generationStatus==='failed',id)
 state=await page.evaluate(id=>({node:workspace.getSnapshot().artifacts.find(n=>n.id===id),cells:workspace.getWorkbenchCells(),calls:generateCalls}),id)
 assert.equal(state.calls[0].kind,'create');assert.equal(state.calls[0].targetNodeId,id);assert.deepEqual(state.calls[0].selectedNodeIds,['base']);assert.match(state.node.generationSources[0].text,new RegExp(originalText));assert.doesNotMatch(state.node.generationSources[0].text,/999 B/)
 assert.deepEqual(state.cells.find(c=>c.id===id),initial,'generation and error keep the reserved cell')
 assert.equal(await page.locator('[data-workbench-selected-create-context="'+id+'"]').count(),1)
 assert.match(await page.locator('[data-workbench-selected-create-context="'+id+'"]').innerText(),/基于：地域收入 · AAPL.*需求：整理为地域收入/s)
 report.checks.push('menu owner baseline; native right insertion; autofocus; no popover; repeat focus; frozen source; same id and position; failed prompt retained')
 await page.evaluate(()=>{document.body.setAttribute('data-ds-dark-theme','');window.nextResult={ok:true}})
 await page.screenshot({path:output+'inline-failed-dark.png'});report.screenshots.push('inline-failed-dark.png')
 await page.locator('[data-workbench-edit-selected-create="'+id+'"]').click()
 await input.fill('改为可阅读的地域收入比较表。')
 await draft.getByRole('button',{name:'生成组件',exact:true}).click()
 await page.waitForFunction(id=>workspace.getSnapshot().artifacts.find(n=>n.id===id)?.generationStatus==='queued',id)
 state=await page.evaluate(id=>{const node=workspace.getSnapshot().artifacts.find(n=>n.id===id);workspace.attachGenerationTask(id,{taskId:'task-selected',canvasNodeId:id,state:'running',lastSeq:0});return node},id)
 assert.match(state.generationSources[0].text,/178 B/);assert.equal(state.containerPrompt,'改为可阅读的地域收入比较表。')
 await page.getByRole('button',{name:'停止生成',exact:true}).click()
 await page.waitForFunction(()=>cancelCalls.length===1)
 assert.deepEqual(await page.evaluate(()=>cancelCalls[0]),{parentSessionId:'selected-inline',taskId:'task-selected'})
 await page.evaluate(id=>workspace.applyGenerationInspection(id,{taskId:'task-selected',canvasNodeId:id,state:'cancelled',lastSeq:1,events:[],error:'已停止生成',completedAt:Date.now()}),id)
 await page.getByRole('button',{name:'重新生成',exact:true}).click()
 await page.waitForFunction(()=>generateCalls.length===3)
 await page.evaluate(id=>{workspace.attachGenerationTask(id,{taskId:'task-selected-2',canvasNodeId:id,state:'running',lastSeq:0});workspace.applyGenerationInspection(id,{taskId:'task-selected-2',canvasNodeId:id,state:'completed',lastSeq:1,events:[],finalOutput:JSON.stringify({version:1,type:'table',title:'地域收入对比表',columns:['地域','2025 财年'],rows:[['美洲','178 B']]}),completedAt:Date.now()})},id)
 state=await page.evaluate(id=>({nodes:workspace.getSnapshot().artifacts,cells:workspace.getWorkbenchCells(),node:workspace.getSnapshot().artifacts.find(n=>n.id===id)}),id)
 assert.equal(state.node.generationStatus,'completed');assert.deepEqual(state.cells.find(c=>c.id===id),initial);assert.equal(state.nodes.length,2)
 await page.screenshot({path:output+'inline-completed-dark.png'});report.screenshots.push('inline-completed-dark.png')
 report.checks.push('edit frozen request; running source and demand retained; stop uses real cancellation sink; retry same id; completed same reserved cell')
 for(const mode of ['edge','occupied']){
   await page.evaluate(mode=>window.reset(mode),mode);await menu();await draft.waitFor()
   state=await page.evaluate(()=>({nodes:workspace.getSnapshot().artifacts,cells:workspace.getWorkbenchCells()}));const node=state.nodes.find(n=>n.creationMode==='selection'),cell=state.cells.find(c=>c.id===node.id)
   assert.equal(cell.x,mode==='edge'?20:0);assert.equal(cell.y,11,'no complete right slot uses immediate below position')
   await page.locator('[data-research-node-id="'+node.id+'"] .ew-grid-header').getByRole('button',{name:'移除组件',exact:true}).click()
   await page.waitForFunction(id=>!workspace.getSnapshot().artifacts.some(n=>n.id===id),node.id)
   assert.equal(await page.locator('[data-research-node-id="base"]').count(),1)
 }
 report.checks.push('edge and occupied-right insert below; close removes only derived node')
 await page.evaluate(()=>{
   const previous=workspace.getSnapshot().artifacts.find(n=>n.id==='base'),url='https://authorized.fixture/revenue'
   workspace.setArtifacts([{id:'base',messageId:'base',kind:'web-link',title:'授权网页',titleMode:'manual',excerpt:url,url,x:previous.x,y:previous.y,width:previous.width,height:previous.height,sizeMode:'manual'}]);workspace.applyWorkbenchCells([{id:'base',x:0,y:0,w:20,h:11}],true)
   window.webReadMode='failure';window.dshDesktop.researchLinkFrame={inspect:()=>webReadMode==='failure'?Promise.resolve(null):new Promise(resolve=>{window.inspectionResolver=resolve})}
 })
 await menu();await draft.waitFor();await input.fill('基于授权网页创建收入对比表。')
 let web=await page.evaluate(()=>workspace.getSnapshot().artifacts.find(n=>n.creationMode==='selection')),callsBefore=await page.evaluate(()=>generateCalls.length)
 await draft.getByRole('button',{name:'生成组件',exact:true}).click()
 await draft.getByRole('alert').waitFor();assert.match(await draft.getByRole('alert').innerText(),/授权正文/)
 assert.equal(await page.evaluate(()=>generateCalls.length),callsBefore)
 await page.evaluate(()=>{window.webReadMode='pending'})
 await draft.getByRole('button',{name:'生成组件',exact:true}).click()
 await draft.getByRole('button',{name:'停止',exact:true}).click()
 await page.evaluate(async()=>{inspectionResolver({sourceText:'迟到的授权正文'});await Promise.resolve();await Promise.resolve()})
 assert.equal(await page.evaluate(()=>generateCalls.length),callsBefore)
 assert.equal(await page.evaluate(id=>workspace.getSnapshot().artifacts.find(n=>n.id===id)?.generationStatus,web.id),'draft')
 await draft.getByRole('button',{name:'生成组件',exact:true}).click()
 await draft.getByRole('button',{name:'停止',exact:true}).waitFor()
 await page.locator('[data-research-node-id="'+web.id+'"] .ew-grid-header').getByRole('button',{name:'移除组件',exact:true}).click()
 await page.evaluate(async()=>{inspectionResolver({sourceText:'关闭之后迟到的授权正文'});await Promise.resolve();await Promise.resolve()})
 assert.equal(await page.evaluate(()=>generateCalls.length),callsBefore)
 assert.equal(await page.locator('[data-workbench-selected-create-draft]').count(),0)
 report.checks.push('web authorization failure keeps input; stop preparing rejects late inspection; close preparing rejects late inspection')
 assert.deepEqual(errors,[])
 await writeFile(output+'report.json',JSON.stringify(report,null,2))
 console.log(JSON.stringify(report,null,2))
}finally{await browser.close()}
