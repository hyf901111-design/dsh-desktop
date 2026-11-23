import { expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { patchKnowledgeSharedResearch, stripKnowledgeSharedResearch } from '../scripts/lib/knowledge-shared-research.mjs'

it('places a real file card in the active research workspace and refuses reused and read-only drops',async()=>{
 const installed=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const base=stripKnowledgeSharedResearch(installed),source=patchKnowledgeSharedResearch(base)
 expect(stripKnowledgeSharedResearch(source)).toBe(base)
 const script=await build({stdin:{resolveDir:process.cwd(),contents:`
   import * as React from 'react';import * as ReactDom from 'react-dom';import * as jsx from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';
   import {dropKnowledgeOnResearchCanvas} from './src/preload/research-knowledge-drop';
   import {createResearchPreviewBridge} from './src/preload/research-file-path';
   const stub=new Proxy(function(){},{get:()=>stub,apply:()=>stub,construct:()=>({})});
   const storage={getItem:k=>localStorage.getItem(k),setItem:(k,v)=>{localStorage.setItem(k,v);return true}};
   window.calls=[];const invoke=async(channel,input)=>{
    window.calls.push([channel,input]);if(channel==='research:preview:admit-knowledge')return {name:'公开数据.bin',path:'/board/公开数据.bin',authorizationId:'grant',capabilityToken:'token',contentType:'application/octet-stream',previewEligible:false};
    return null
   };
   window.dshDesktop={researchPreview:createResearchPreviewBridge(()=>'',invoke),researchCanvasStorage:storage};
   window.__ModuleLoader__={load:d=>window.descriptor=d};
   window.mount=()=>{
    const primitives=new Proxy({MarkdownText:({text})=>React.createElement('p',null,text)},{get:(target,key)=>target[key]||(String(key).startsWith('Icon')?()=>null:stub)});
    const modules={react:React,'react-dom':ReactDom,'react/jsx-runtime':jsx,'@deepseek-ai/dsh-client-ui-primitives':primitives};
    const bundle=window.descriptor.factory(id=>modules[id]||stub),registry=new bundle.ResearchWorkspaceRegistry(storage);
    const sessionId='editable-board';window.workspace=registry.for(sessionId);window.drop=dropKnowledgeOnResearchCanvas;
    createRoot(document.getElementById('host')).render(React.createElement(bundle.ResearchCanvas,{sessionId,t:x=>x,researchWorkspaces:registry,actions:{},selectionGeneration:{disabled:false}}))
   };
  `},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}})
 const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href):await import('playwright')
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH})
 try{
  const page=await browser.newPage({viewport:{width:1000,height:760}})
  await page.route('https://research-drop.test/',r=>r.fulfill({contentType:'text/html',body:'<style>[data-research-canvas]{width:800px;height:640px}</style><div id="host"></div>'}))
  await page.goto('https://research-drop.test/');await page.addScriptTag({content:script.outputFiles[0].text});await page.addScriptTag({content:source})
  await page.evaluate(()=>window.mount())
  const canvas=page.locator('[data-research-canvas][data-research-preview-mode=edit]');await canvas.waitFor()
  const file={id:'a'.repeat(32),label:'公开数据.bin'}
  expect(await canvas.evaluate((root,file)=>{
   root.addEventListener('drop',e=>window.lastTransfer=e.dataTransfer,{once:true,capture:true});
   return window.drop(root,file,{x:260,y:190})
  },file)).toBe(true)
  await expect.poll(()=>page.evaluate(()=>window.workspace.getSnapshot().files)).toMatchObject([{name:file.label,authorizationId:'grant',previewEligible:false,source:'sherlock'}])
  expect(await page.evaluate(()=>window.calls.filter(([channel])=>channel==='research:preview:admit-knowledge')[0][1])).toMatchObject({fileId:file.id,sessionId:'editable-board'})
  await canvas.evaluate(root=>root.dispatchEvent(new DragEvent('drop',{dataTransfer:window.lastTransfer,bubbles:true,cancelable:true})))
  await expect.poll(()=>page.locator('[role=status],[role=alert]').allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining('重新拖入')]))
  expect(await page.evaluate(()=>window.workspace.getSnapshot().files)).toHaveLength(1)
  expect(await canvas.evaluate((root,file)=>{root.setAttribute('data-shared-readonly','true');return window.drop(root,file,{x:260,y:190})},file)).toBe(false)
 }finally{await browser.close()}
},30_000)
