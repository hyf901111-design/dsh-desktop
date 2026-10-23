import {afterAll,beforeAll,expect,it} from 'vitest'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {canvasCss} from '../scripts/lib/figma-canvas-client.mjs'

const require=createRequire(import.meta.url)
let browser,script
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 const source=require('../scripts/lib/research-grid-workbench.mjs').patchResearchGridWorkbench(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 const entry=`import * as React from 'react';import * as ReactDom from 'react-dom';import * as jsx from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';
 let descriptor;window.__ModuleLoader__={load:value=>descriptor=value};window.dshDesktop={};
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 (0,eval)(${JSON.stringify(source)});
 const bundle=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?ReactDom:id==='@deepseek-ai/dsh-client-ui-primitives'?new Proxy({MarkdownText:({text})=>React.createElement('div',null,text)},{get:(t,k)=>t[k]||(String(k).startsWith('Icon')?()=>null:fake)}):fake);
 const registry=new bundle.ResearchWorkspaceRegistry(localStorage),workspace=registry.for('auto-browser'),host=document.getElementById('host'),root=createRoot(host);
 const render=(sessionId='auto-browser')=>root.render(React.createElement(bundle.ResearchCanvas,{sessionId,t:x=>x,researchWorkspaces:registry,selectionGeneration:{disabled:false},actions:{}}));
 let calls=0;const original=workspace.organizeCanvas;workspace.organizeCanvas=function(...args){calls++;return original.apply(this,args)};
 window.fixture={workspace,registry,render,calls:()=>calls};render();`
 script=(await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'auto-arrange-browser-entry.js'},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'})).outputFiles[0].text
},20000)
afterAll(async()=>browser?.close())

it('production canvas waits for the batch, measures offscreen iframe content, then persists one standard arrangement without taking focus',async()=>{
 const page=await browser.newPage({viewport:{width:1240,height:760}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 try{
  // A real origin gives the production workspace its usual durable storage.
  await page.route('https://auto-arrange.test/',route=>route.fulfill({contentType:'text/html',body:`<style>${canvasCss}\nhtml,body{margin:0}#host{width:1000px;height:700px}[data-research-canvas]{width:1000px!important;height:700px!important}</style><div id="host"></div><textarea id="chat"></textarea>`}))
  await page.goto('https://auto-arrange.test/');await page.addScriptTag({content:script})
  await page.waitForSelector('[data-ework-grid]')
  const batch=await page.evaluate(()=>{
   const p={id:'browser-plan',createdAt:Date.now(),panels:Array.from({length:4},(_,i)=>({nodeId:'browser-'+i,title:'原始表 '+i,prompt:'原始长表',pending:true,width:656,height:428,x:i%2*672,y:Math.floor(i/2)*450,size:'large'}))}
   fixture.workspace.applyWorkbench(p);document.getElementById('chat').focus();return p
  })
  await page.evaluate(p=>{
   const html=i=>'<html><body><h2>实际记录 '+i+'</h2><table>'+Array.from({length:55},(_,row)=>'<tr><td>记录 '+row+'</td><td>'+row+'</td></tr>').join('')+'</table></body></html>'
   fixture.workspace.applyWorkbench({...p,panels:p.panels.map((panel,i)=>i<3?{...panel,taskId:'task-'+i,preparedOutput:JSON.stringify({version:1,type:'html',title:panel.title,html:html(i)})}:panel)})
  },batch)
  await page.waitForTimeout(180);expect(await page.evaluate(()=>fixture.calls())).toBe(0)
  await page.evaluate(p=>{
   const panel=p.panels[3],html='<html><body><h2>最后一份完整资料</h2>'+Array.from({length:70},(_,row)=>'<p>完整记录 '+row+'：原始0与-120万元。</p>').join('')+'</body></html>'
   fixture.workspace.applyWorkbench({...p,panels:p.panels.map((value,i)=>i===3?{...panel,taskId:'task-3',preparedOutput:JSON.stringify({version:1,type:'html',title:panel.title,html})}:value)})
  },batch)
  await page.waitForFunction(()=>fixture.calls()===1)
  await page.waitForFunction(()=>fixture.workspace.pendingWorkbenchArrange().length===0,null,{timeout:9000})
  const result=await page.evaluate(()=>{
   const root=document.querySelector('[data-research-canvas]'),nodes=fixture.workspace.getSnapshot().artifacts,cells=fixture.workspace.getWorkbenchCells()
   return {calls:fixture.calls(),focused:document.activeElement.id,measurements:[...root.__eworkContentMeasurements.keys()],heights:nodes.map(n=>n.height),offscreen:nodes.filter(n=>n.y-n.height/2>700).map(n=>n.id),overlap:cells.some((a,i)=>cells.some((b,j)=>i!==j&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)),saved:JSON.parse(localStorage.getItem('sherlock.workbench.auto-arrange.v1:auto-browser'))}
  })
  if(process.env.SHERLOCK_TEST_EVIDENCE_DIR){await mkdir(process.env.SHERLOCK_TEST_EVIDENCE_DIR,{recursive:true});await writeFile(join(process.env.SHERLOCK_TEST_EVIDENCE_DIR,'auto-arrange-browser.json'),JSON.stringify(result,null,2)+'\n');await page.screenshot({path:join(process.env.SHERLOCK_TEST_EVIDENCE_DIR,'auto-arrange-browser.png')})}
  expect(errors).toEqual([]);expect(result.calls).toBe(1);expect(result.focused).toBe('chat');expect(result.measurements.sort()).toEqual(batch.panels.map(p=>p.nodeId).sort());expect(result.heights.every(h=>h>500)).toBe(true);expect(result.offscreen.length).toBeGreaterThan(0);expect(result.overlap).toBe(false);expect(result.saved).toEqual({pending:[],done:[batch.id]})
  await page.evaluate(p=>{fixture.workspace.applyWorkbench(p);fixture.render('other')},batch);await page.waitForTimeout(80);await page.evaluate(()=>fixture.render());await page.waitForTimeout(180);expect(await page.evaluate(()=>fixture.calls())).toBe(1)
 }finally{await page.close()}
},25000)
