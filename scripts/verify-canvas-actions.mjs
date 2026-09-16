// Browser plugin not available. Isolated Chromium renders the production canvas;
// this never builds or replaces the shared Electron client or accesses user data.
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { patchCanvasActionsClient } from './lib/canvas-actions-client.mjs'
const {default:playwright}=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
const source=patchCanvasActionsClient(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
const dependencies=await build({stdin:{contents:`import * as react from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot} from 'react-dom/client';window.testDeps={react,jsx,dom,createRoot};`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'})
const browser=await playwright.chromium.launch({executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[],blocked=[]
 page.on('pageerror',e=>errors.push(e.message))
 page.on('console',e=>{if(e.type()==='error'&&!e.text().startsWith('Failed to load resource: net::ERR_FAILED'))errors.push(e.text())})
 page.on('requestfailed',r=>blocked.push(r.url()))
 await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><title>画布操作协议验证</title><style>body{margin:0;background:#242424;color:#eee}#mount{height:720px;width:1100px;margin:30px;position:relative}[data-research-canvas]{height:100%;position:relative;overflow:hidden}</style><div id="mount"></div>'}):route.abort())
 await page.goto('https://canvas-actions.fixture/')
 await page.addScriptTag({content:dependencies.outputFiles[0].text})
 await page.evaluate(()=>{window.__ModuleLoader__={load:d=>window.descriptor=d};window.dshDesktop={}})
 await page.addScriptTag({content:source})
 await page.evaluate(()=>{
   const {react,jsx,dom,createRoot}=window.testDeps
   const fake=new Proxy(function(){return null},{get:()=>fake,construct:()=>({})})
   const primitives=new Proxy({MarkdownText:({text})=>react.createElement('div',null,text)},{get:(t,k)=>Reflect.get(t,k)??(String(k).startsWith('Icon')?()=>null:fake)})
   const mod=window.descriptor.factory(id=>({'react':react,'react/jsx-runtime':jsx,'react-dom':dom,'@deepseek-ai/dsh-client-ui-primitives':primitives}[id]??fake))
   const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);return true}}
   const registry=new mod.ResearchWorkspaceRegistry(storage)
   window.workspace=registry.for('actions')
   window.root=createRoot(document.querySelector('#mount'))
   dom.flushSync(()=>root.render(react.createElement(mod.ResearchCanvas,{sessionId:'actions',t:k=>k,researchWorkspaces:registry})))
   workspace.setArtifacts([{id:'a',kind:'pasted-text',messageId:'a',title:'研究摘要',excerpt:'原始研究内容',x:300,y:250,width:450,height:280,sizeMode:'manual'},{id:'b',kind:'pasted-text',messageId:'b',title:'行情资料',excerpt:'第二个组件',x:820,y:250,width:450,height:280,sizeMode:'manual'}])
   window.execute=async changes=>{const s=await workspace.canvasAction('inspect',{});return workspace.canvasAction('apply',{requestId:crypto.randomUUID(),revision:s.revision,changes})}
 })
 assert.equal(await page.title(),'画布操作协议验证')
 await page.waitForSelector('[data-research-node-id="a"]')
 await page.evaluate(()=>execute([{op:'remove',ids:['b']}]))
 await page.locator('[data-canvas-action-receipt]').waitFor()
 assert.equal(await page.locator('[data-research-node-id="b"]').count(),0)
 await page.getByRole('button',{name:'撤销',exact:true}).click()
 await page.waitForSelector('[data-research-node-id="b"]')
 await page.evaluate(()=>execute([{op:'update',id:'a',fields:{excerpt:'修改后的研究内容',title:'已修改摘要'}},{op:'arrange'}]))
 assert.equal(await page.evaluate(()=>workspace.getSnapshot().artifacts.find(n=>n.id==='a').excerpt),'修改后的研究内容')
 const out=process.env.SHERLOCK_TEST_OUTPUT||'/tmp/sherlock-canvas-actions-verification'
 await mkdir(out,{recursive:true})
 await page.screenshot({path:out+'/canvas-actions.png'})
 await page.getByRole('button',{name:'关闭提示'}).click()
 assert.equal(await page.locator('[data-canvas-action-receipt]').count(),0)
 await page.evaluate(()=>execute([{op:'remove',ids:['a','b']}]))
 assert.equal(await page.locator('[data-research-node-id]').count(),0)
 await page.getByRole('button',{name:'撤销',exact:true}).click()
 await page.waitForSelector('[data-research-node-id="a"]')
 await page.locator('[data-canvas-action-receipt]').waitFor({state:'detached',timeout:12000})
 assert.equal(await page.locator('[data-research-node-id]').count(),2)
 assert.deepEqual(errors,[])
 assert(blocked.every(url=>new URL(url).hostname==='canvas-actions.fixture'),'Only isolated fixture resource requests may be blocked')
 console.log('Isolated network requests blocked: '+JSON.stringify(blocked))
 console.log('PASS: real canvas delete/undo, content edit + arrange, clear/undo, close and 10-second expiry; no browser errors. Screenshot: '+out+'/canvas-actions.png')
}finally{await browser.close()}
