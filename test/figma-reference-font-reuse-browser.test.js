import {readFileSync} from 'node:fs'
import {mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {patchFigmaInlineReferences} from '../scripts/lib/figma-inline-references-client.mjs'
import {patchComposerDeliverablePreview} from '../scripts/lib/figma-composer-deliverable-preview.mjs'

const evidence='/tmp/home-skill-font-reuse-browser-20261024'
let browser,entry,source,styles
beforeAll(async()=>{
 source=patchComposerDeliverablePreview(patchFigmaInlineReferences(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')))
  .replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__testInputBar=InputBar;')
 styles=[...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match=>JSON.parse(match[1])).filter(css=>css.includes('.uV2eYG_')).join('\n')+'\n'+readFileSync('src/preload/figma-inline-references.css','utf8')
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
 import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot} from 'react-dom/client';
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 const snapshot=initial=>{let value=initial;const listeners=new Set();return{getSnapshot:()=>value,set:next=>{value=next;for(const fn of listeners)fn()},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}}};
 const primitives=new Proxy({Tooltip:({children})=>children},{get:(target,key)=>target[key]||(()=>null)});
 const native=window.descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/dsh-client-runtime/client'?{createSnapshotStore:snapshot}:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{DropOverlay:()=>null,AttachmentRail:()=>null}:fake);
 const shell=new native.SessionInputShell({actx:{},defaultSink:()=>{throw Error('font fixture must not send')}}),root=createRoot(document.getElementById('fixture'));
 const props={useSession:select=>select({running:false,promptError:null,subagent:null,removed:false}),useInput:select=>React.useSyncExternalStore(shell.state.subscribe,()=>select(shell.snapshot)),inputActions:shell.actions,keyboard:shell,renderSlot:()=>null,useNotices:select=>select(null),useLexicon:select=>select(new Map()),useMenuLauncher:select=>select(null),useProjection:(_key,select)=>select?.(undefined),sessionId:'font-review',t:key=>key,variant:'hero'};
 window.probe={shell,root};root.render(React.createElement(native.__testInputBar,props));
 `},bundle:true,write:false,format:'iife',platform:'browser'});entry=output.outputFiles[0].text
 const playwright=await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (playwright.default??playwright).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())
it('reuses the base and unchanged skill definitions during real native Backspace deletion and reinsert',async()=>{
 const page=await browser.newPage({viewport:{width:1100,height:700}}),errors=[]
 page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.route('https://font-review.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><main id="fixture"></main>'}))
  await page.goto('https://font-review.test/')
  await page.addStyleTag({content:styles+'\nbody{margin:20px;font:16px/24px system-ui;--dsw-font-family:system-ui;--dsw-alias-label-primary:#222;--dsh-composer-card-max-width:780px;--dsh-composer-side-clearance:0}.uV2eYG_card{font:16px/24px system-ui}.uV2eYG_grow{width:740px}'})
  await page.evaluate(()=>{
   window.__ModuleLoader__={load:descriptor=>window.descriptor=descriptor}
   const Font=window.FontFace;window.fontDefinitions=[]
   window.FontFace=class extends Font{constructor(family,source,options){super(family,source,options);window.fontDefinitions.push({family,source,options})}}
  })
  await page.addScriptTag({content:source});await page.addScriptTag({content:entry})
  await page.waitForSelector('textarea');await page.waitForSelector('[data-figma-inline-ready]')
  const input=page.locator('textarea'),phases=[]
  for(let cycle=0;cycle<2;cycle++){
   await page.evaluate(()=>{for(const label of ['/alpha','/bravo','/charlie','/delta','/echo']){const shell=window.probe.shell,at=shell.snapshot.draft.length;shell.insertReference({source:'ework-managed-skill',ref:label,label,clipboardText:label},{start:at,end:at,draftRev:shell.snapshot.draftRev})}})
   await page.waitForFunction(()=>window.probe.shell.snapshot.occurrences.length===5&&document.querySelector('[data-figma-inline-ready]'))
   await input.focus();await page.keyboard.press('End')
   for(let press=0;press<15;press++){
    if(!await page.evaluate(()=>window.probe.shell.snapshot.occurrences.length))break
    await page.keyboard.press('Backspace');await page.waitForTimeout(20);await page.waitForSelector('[data-figma-inline-ready]')
   }
   phases.push(await page.evaluate(()=>({draft:window.probe.shell.snapshot.draft,references:window.probe.shell.snapshot.occurrences.length,faces:window.fontDefinitions.length})))
   expect(phases[cycle].draft).toBe('');expect(phases[cycle].references).toBe(0)
  }
  const counts=await page.evaluate(()=>({created:window.fontDefinitions.length,base:window.fontDefinitions.filter(face=>face.family.startsWith('SherlockReferenceCell')).length,definitions:new Set(window.fontDefinitions.map(face=>JSON.stringify(face))).size}))
  await page.evaluate(()=>window.probe.root.unmount())
  const retained=await page.evaluate(()=>[...document.fonts].filter(face=>face.family.startsWith('Sherlock')).length)
  await writeFile(evidence+'/native-counts.json',JSON.stringify({counts,phases,retained,errors},null,2))
  expect(counts.base).toBe(1);expect(counts.created).toBe(6);expect(counts.definitions).toBe(6)
  expect(retained).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
},15000)
