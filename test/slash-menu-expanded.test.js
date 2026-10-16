import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {patchSkillCommandLabels,patchSkillCommandPopup} from '../scripts/lib/skill-command-menu.mjs'

let browser,script,trigger,popup
beforeAll(async()=>{
 const {chromium}=await import(/* @vite-ignore */ pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 trigger=patchSkillCommandLabels(await readFile('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8')).replace('exports.apply = apply;','exports.MenuView = MenuView;exports.apply = apply;')
 popup=patchSkillCommandPopup(await readFile('node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js','utf8')).replace('exports.apply = apply;','exports.PopupSelectView = PopupSelectView;exports.apply = apply;')
 script=(await build({stdin:{resolveDir:process.cwd(),contents:`
 import React from 'react';import * as jsx from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 window.__ModuleLoader__={load:value=>window.descriptor=value};window.selected=[];
 window.mountMenu=(kind,count)=>{
  const mod=window.descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='@deepseek-ai/dsh-client-ui-primitives'?{useAnchoredMaxHeight:()=>320}:fake);
  const options=Array.from({length:count},(_,index)=>({id:'skill-'+index,label:'Skill '+index,detail:'Description '+index}));
  const state=kind==='commands'?{open:true,highlight:null,groups:[{source:'command',status:'ready',items:options.map((item,index)=>({name:['compact','export','feedback','goal','permission','plan','model','skills'][index],description:item.detail}))}]}:{open:true,active:0,command:'skills',confirming:null,status:'ready',search:'',options,error:null,submitting:false};
  const store={subscribe:()=>()=>{},getSnapshot:()=>state};
  createRoot(document.querySelector('#root')).render(kind==='commands'?React.createElement(mod.MenuView,{menu:store,t:key=>key,onPick:(_group,index)=>window.selected.push(index),onDismiss:()=>{}}):React.createElement(mod.PopupSelectView,{popup:{state:store,select:index=>window.selected.push(index),highlight:()=>{},setSearch:()=>{},dismiss:()=>{}},t:key=>key}));
 };
 `,loader:'js'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
})
afterAll(async()=>{await browser?.close()})

for(const [width,height,count] of [[1380,900,6],[800,600,6],[800,400,6],[800,600,18]])
for(const kind of ['commands','skills'])it(`shows every ${kind} entry without scrolling at ${width}x${height} (${count} skills)`,async()=>{
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.setContent('<style>body{margin:0}.surface{position:fixed;inset:12px 12px 12px 96px;overflow:hidden}.composer{position:absolute;left:24px;right:24px;top:48%;height:140px}#root{position:relative}</style><div class="surface"><div class="composer"><div id="root"></div><textarea aria-label="Composer"></textarea></div></div>')
  await page.addScriptTag({content:script});await page.addScriptTag({content:kind==='commands'?trigger:popup});await page.evaluate(({kind,count})=>window.mountMenu(kind,kind==='commands'?8:count),{kind,count})
  const rows=page.getByRole('option');await rows.last().waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  const layout=await rows.evaluateAll(rows=>{const menu=rows[0].closest('[data-ework-command], [aria-label="suggestions.aria"]'),viewport=rows[0].parentElement,clip=document.querySelector('.surface').getBoundingClientRect();return {count:rows.length,scrolling:viewport.scrollHeight>viewport.clientHeight+1,rects:rows.map(row=>{const r=row.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}}),clip:{top:clip.top,bottom:clip.bottom,left:clip.left,right:clip.right},menuHeight:menu.getBoundingClientRect().height}})
  expect(layout.count).toBe(kind==='commands'?8:count);expect(layout.scrolling).toBe(false)
  for(const row of layout.rects){expect(row.top).toBeGreaterThanOrEqual(layout.clip.top);expect(row.bottom).toBeLessThanOrEqual(layout.clip.bottom);expect(row.left).toBeGreaterThanOrEqual(layout.clip.left);expect(row.right).toBeLessThanOrEqual(layout.clip.right)}
  await rows.last().click();expect(await page.evaluate(()=>window.selected)).toEqual([kind==='commands'?7:count-1]);expect(errors).toEqual([])
 }finally{await page.close()}
},15000)
