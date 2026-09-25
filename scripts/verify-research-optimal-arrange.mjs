// Focused rendered acceptance for content dimensions and the Arrange action.
import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {patchFigmaFinalCanvas} from './lib/figma-canvas-client.mjs'
import {renderInteractiveArtifact} from '../packages/dsh-research-task-runtime/interactive-artifact.js'

const output=fileURLToPath(new URL('../output/research-optimal-arrange/',import.meta.url))
await mkdir(output,{recursive:true})
const module=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
const playwright=module.default??module
const dependencies=await build({stdin:{contents:`import * as react from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot} from 'react-dom/client';window.testDeps={react,jsx,dom,createRoot};`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'})
const source=patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
const font=await readFile('build/fonts/NotoSansSC.woff2')
const browser=await playwright.chromium.launch({executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
try{
  const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',route=>route.request().isNavigationRequest()
    ? route.fulfill({contentType:'text/html',body:'<style>body{margin:0}#mount{height:880px;width:1180px}</style><div id="mount"></div>'})
    : route.request().url().endsWith('.woff2') ? route.fulfill({contentType:'font/woff2',body:font}) : route.abort())
  await page.goto('https://arrange.fixture/')
  await page.addScriptTag({content:dependencies.outputFiles[0].text})
  await page.evaluate(()=>{window.__ModuleLoader__={load:value=>window.descriptor=value};window.dshDesktop={}})
  await page.addScriptTag({content:source})
  await page.addStyleTag({content:await readFile('src/preload/figma-canvas-gestures.css','utf8')})
  const items=Array.from({length:8},(_,i)=>({title:`模拟资讯 ${i+1}`,summary:'模拟数据说明与研究观察，信息仅用于布局验证。',date:'2026-06-30',category:'市场'}))
  const news=renderInteractiveArtifact({version:1,type:'news',title:'金融新闻列表（模拟）',items})
  const dashboard=renderInteractiveArtifact({version:1,type:'dashboard',title:'核心指标（模拟）',asOf:'2026-06-30',items:items.slice(0,6).map((item,i)=>({label:item.title,value:String(i+1)}))})
  const specs=[dashboard,news,{version:1,type:'markdown',title:'简短结论',content:'市场温和上涨。'},
    {version:1,type:'table',title:'重点品种',columns:['品种','价格','涨跌','成交额','状态'],rows:Array.from({length:6},(_,i)=>['模拟 '+i,'100','+1%','10','观察'])}]
  await page.evaluate(specs=>{
    const {react,jsx,dom,createRoot}=testDeps
    const fake=new Proxy(function(){return null},{get:()=>fake,construct:()=>({})})
    const primitives=new Proxy({MarkdownText:({text})=>react.createElement('div',null,text)},{get:(target,key)=>Reflect.get(target,key)??(String(key).startsWith('Icon')?()=>null:fake)})
    const client=descriptor.factory(id=>({'react':react,'react/jsx-runtime':jsx,'react-dom':dom,'@deepseek-ai/dsh-client-ui-primitives':primitives}[id]??fake))
    const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);return true}},registry=new client.ResearchWorkspaceRegistry(storage)
    window.workspace=registry.for('arrange');window.root=createRoot(document.querySelector('#mount'))
    dom.flushSync(()=>root.render(react.createElement(client.ResearchCanvas,{sessionId:'arrange',t:key=>key,researchWorkspaces:registry,selectionGeneration:{disabled:false,generate:async()=>({ok:true})}})))
    workspace.setCanvasSize({width:1180,availableWidth:1180,height:880})
    workspace.setArtifacts(specs.map((containerSpec,i)=>({id:'panel-'+i,messageId:'panel-'+i,kind:'generated-container',title:containerSpec.title,excerpt:'模拟',containerPrompt:'模拟',refreshMinutes:0,sourceNodeIds:[],generationStatus:'completed',containerSpec,workbenchId:'fixture',workbenchIndex:i,x:500+i*10,y:500+i*10,width:656,height:456,sizeMode:'auto'})))
    workspace.organizeCanvas()
  },specs)
  await page.locator('[data-research-artifact-card]').first().waitFor()
  const result=await page.evaluate(()=>{
    const nodes=workspace.getSnapshot().artifacts
    const cards=[...document.querySelectorAll('[data-research-artifact-card]')]
    return{nodes:nodes.map(n=>({id:n.id,x:n.x,y:n.y,width:n.width,height:n.height})),
      native:cards.map(card=>{const content=card.querySelector('.rScV5Q_containerContent'),rows=[...card.querySelectorAll('tr')];return{id:card.getAttribute('data-research-artifact-card'),content:content?.scrollHeight,viewport:content?.clientHeight,rowCount:rows.length,lastRowBottom:rows.at(-1)?.getBoundingClientRect().bottom,bodyBottom:content?.getBoundingClientRect().bottom}})}
  })
  assert.deepEqual(result.nodes.map(n=>[n.width,n.height]),[[656,280],[656,576],[320,220],[536,300]])
  for(const a of result.nodes)for(const b of result.nodes)if(a!==b)
    assert.ok(a.x+a.width/2+12<=b.x-b.width/2||b.x+b.width/2+12<=a.x-a.width/2||
      a.y+a.height/2+12<=b.y-b.height/2||b.y+b.height/2+12<=a.y-a.height/2,'cards do not overlap')
  assert.ok(result.native.find(n=>n.id==='panel-3').lastRowBottom<=result.native.find(n=>n.id==='panel-3').bodyBottom,'the table keeps its last row visible')
  await page.screenshot({path:output+'arranged-mixed-workbench.png'})
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({result:'PASS',nodes:result.nodes,table:result.native.find(n=>n.id==='panel-3'),screenshot:output+'arranged-mixed-workbench.png'},null,2))
}finally{await browser.close()}
