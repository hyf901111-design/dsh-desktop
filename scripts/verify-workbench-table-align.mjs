import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {patchResearchGridWorkbench} from './lib/research-grid-workbench.mjs'
import {installWorkbenchTableColumns,WORKBENCH_TABLE_COLUMNS_CSS} from '../packages/dsh-research-task-runtime/workbench-table-columns.js'

const output=fileURLToPath(new URL('../output/workbench-table-align/',import.meta.url))
await mkdir(output,{recursive:true})
const module=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
const playwright=module.default??module
const dependencies=await build({stdin:{contents:`import * as react from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot} from 'react-dom/client';window.testDeps={react,jsx,dom,createRoot};`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'})
const source=patchResearchGridWorkbench(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
const browser=await playwright.chromium.launch({executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
const cases=[]
try{
 for(const theme of ['light','dark'])for(const width of [320,656]){
  const page=await browser.newPage({viewport:{width:1100,height:760}}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.setContent('<style>body{margin:0}#mount{height:720px;width:1000px}</style><div id="mount"></div>')
  await page.addScriptTag({content:dependencies.outputFiles[0].text})
  await page.evaluate(theme=>{window.__ModuleLoader__={load:value=>window.descriptor=value};window.dshDesktop={};if(theme==='dark')document.body.setAttribute('data-ds-dark-theme','')},theme)
  await page.addScriptTag({content:source})
  await page.evaluate(width=>{
   const {react,jsx,dom,createRoot}=testDeps,fake=new Proxy(function(){return null},{get:()=>fake,construct:()=>({})})
   const primitives=new Proxy({MarkdownText:({text})=>react.createElement('div',null,text)},{get:(target,key)=>Reflect.get(target,key)??(String(key).startsWith('Icon')?()=>null:fake)})
   const client=descriptor.factory(id=>({'react':react,'react/jsx-runtime':jsx,'react-dom':dom,'@deepseek-ai/dsh-client-ui-primitives':primitives}[id]??fake))
   const values=new Map(),registry=new client.ResearchWorkspaceRegistry({getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);return true}})
   window.workspace=registry.for('table-acceptance');window.root=createRoot(document.querySelector('#mount'))
   dom.flushSync(()=>root.render(react.createElement(client.ResearchCanvas,{sessionId:'table-acceptance',t:key=>key,researchWorkspaces:registry,selectionGeneration:{disabled:false,generate:async()=>({ok:true})}})))
   workspace.setCanvasSize({width:1000,availableWidth:1000,height:720})
   workspace.setArtifacts([{id:'table',messageId:'table',kind:'generated-container',title:'表格对齐（模拟验证）',excerpt:'模拟数据',sourceNodeIds:[],containerPrompt:'模拟',refreshMinutes:0,generationStatus:'completed',containerSpec:{version:1,type:'table',title:'表格对齐（模拟验证）',columns:['代码','日期','开盘（元）','涨跌幅（%）','成交量'],rows:[['000538','2026-09-25',49.87,-0.89,380000],['600276','2026-09-26',44.86,0,0],['300760','2026-09-27','—',1.20,421500]]},x:width/2+24,y:210,width,height:350,sizeMode:'manual'}])
  },width)
  try{await page.locator('table[data-workbench-table-columns]').waitFor({timeout:5000})}catch(error){console.log(JSON.stringify({errors,text:await page.locator('body').innerText(),nodes:await page.evaluate(()=>workspace.getSnapshot().artifacts)}));throw error}
  const inspect=()=>page.evaluate(()=>{
   const table=document.querySelector('table[data-workbench-table-columns]')
   const box=cell=>{const style=getComputedStyle(cell),range=document.createRange();range.selectNodeContents(cell.querySelector('button')||cell.querySelector('span')||cell);const rect=range.getBoundingClientRect();return{align:style.textAlign,paddingLeft:style.paddingLeft,paddingRight:style.paddingRight,left:rect.left,right:rect.right}}
   return [...table.rows[0].cells].map((cell,i)=>({header:box(cell),body:box(table.rows[1].cells[i]),type:cell.dataset.columnAlign}))
  })
  const alignment=await inspect()
  assert.deepEqual(alignment.map(c=>c.type),['left','left','right','right','right'])
  for(const column of alignment){
   assert.equal(column.header.align,column.body.align)
   assert.equal(column.header.paddingLeft,column.body.paddingLeft)
   assert.equal(column.header.paddingRight,column.body.paddingRight)
   assert.ok(Math.abs(column.header[column.type]-column.body[column.type])<1.1,JSON.stringify(column))
  }
  await page.locator('[data-workbench-column-resize="2"]').press('ArrowLeft')
  assert.deepEqual((await inspect()).map(c=>c.type),['left','left','right','right','right'])
  await page.locator('[data-workbench-column-resize="2"]').press('Home')
  await page.screenshot({path:output+theme+'-'+width+'.png'})
  assert.deepEqual(errors,[]);cases.push({theme,width,result:'PASS',columns:alignment})
  await page.close()
 }
 // Exercise the serialized installer used by sandboxed HTML with an open-ended source table.
 const page=await browser.newPage()
 await page.setContent('<style>th{padding:4px 16px;text-align:center}td{padding:4px 8px;text-align:right}'+WORKBENCH_TABLE_COLUMNS_CSS+'</style><table><thead><tr><th>日期</th><th><button>最高（元）</button></th></tr></thead><tbody><tr><td>2026-02-06</td><td>1482.00</td></tr></tbody></table>')
 await page.addScriptTag({content:'('+installWorkbenchTableColumns.toString()+')(document.body)'})
 assert.deepEqual(await page.locator('th,td').evaluateAll(cells=>cells.map(cell=>getComputedStyle(cell).textAlign)),['left','right','left','right'])
 await page.close()
 await writeFile(output+'result.json',JSON.stringify({cases,sandbox:'PASS'},null,2))
 console.log(JSON.stringify({result:'PASS',cases:cases.length,sandbox:'PASS',output}))
}finally{await browser.close()}
