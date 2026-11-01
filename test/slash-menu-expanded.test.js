import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {patchSkillCommandLabels,patchSkillCommandPopup} from '../scripts/lib/skill-command-menu.mjs'
import {derivedMenuCss} from '../scripts/lib/figma-derived-menu-client.mjs'

const evidence=process.env.SHERLOCK_SLASH_SKILLS_EVIDENCE||'/tmp/sherlock-note-slash-skills-fixed-width-20261101/composer'
let browser,script,trigger,popup
beforeAll(async()=>{
 await mkdir(evidence,{recursive:true})
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
  const items=options.map((item,index)=>({name:['compact','export','feedback','goal','permission','plan','model','skills'][index],description:item.detail}));
  let state=kind==='commands'?{open:true,generation:1,hit:{trigger:'/',query:'',position:'leading',span:{start:0,end:1,draftRev:0}},highlight:null,groups:[{source:'command',status:'pending',items:[]}]}:{open:true,active:0,command:'skills',confirming:null,status:'ready',search:'',options,error:null,submitting:false};
  const listeners=new Set(),store={subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},getSnapshot:()=>state,set:next=>{state=next;listeners.forEach(fn=>fn())}};
  window.highlightSkill=index=>store.set({...state,active:index});
  let controller;
  if(kind==='commands'){
   controller=Object.create(mod.InputTriggerController.prototype);controller.menu=store;controller.disposed=false;controller.launcher={getSnapshot:()=>null};controller.pick=(_group,index)=>window.selected.push(index);
   controller.reduce({type:'source-settled',source:'command',generation:1,items});
   window.reopenCommandMenu=()=>{controller.reduce({type:'hit',hit:state.hit});controller.reduce({type:'source-settled',source:'command',generation:state.generation,items})};
   document.querySelector('textarea').addEventListener('keydown',event=>{const key={ArrowDown:'down',ArrowUp:'up',Enter:'enter',Escape:'escape'}[event.key];if(key&&controller.arbitrate(key,false)!=='pass')event.preventDefault()});
  }
  createRoot(document.querySelector('#root')).render(kind==='commands'?React.createElement(mod.MenuView,{menu:store,t:key=>key,onHighlight:highlight=>controller.reduce({type:'point',highlight}),onPick:(_group,index)=>window.selected.push(index),onDismiss:()=>{}}):React.createElement(mod.PopupSelectView,{popup:{state:store,select:index=>window.selected.push(index),highlight:()=>{},setSearch:()=>{},dismiss:()=>{}},t:key=>key}));
 };
 `,loader:'js'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
})
afterAll(async()=>{await browser?.close()})

for(const [width,height,count] of [[1380,900,8],[800,600,8],[800,400,8],[800,600,18]])
for(const kind of ['commands','skills'])it(`${kind==='skills'?'keeps skills fixed-width with internal scrolling':'keeps commands fixed-width with internal scrolling'} at ${width}x${height} (${count} skills)`,async()=>{
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.setContent('<style>body{margin:0}.surface{position:fixed;inset:12px 12px 12px 96px;overflow:hidden}header{position:fixed;z-index:2147483646;left:96px;right:12px;top:12px;height:300px;background:#444}.composer{position:absolute;left:24px;right:24px;top:48%;height:140px}#root{position:relative}.launcher{position:absolute;left:8px;bottom:8px;width:32px;height:32px}</style><header>Workspace header</header><div class="surface"><div class="composer" data-composer-card><div id="root"></div><textarea aria-label="Composer"></textarea><button class="launcher" aria-haspopup="listbox">/</button></div></div>')
  await page.addStyleTag({content:await readFile('src/preload/figma-refinements.css','utf8')});await page.addScriptTag({content:script});await page.addScriptTag({content:kind==='commands'?trigger:popup});await page.evaluate(({kind,count})=>window.mountMenu(kind,kind==='commands'?8:count),{kind,count})
  const rows=page.getByRole('option');await rows.last().waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  const layout=await rows.evaluateAll(rows=>{const menu=rows[0].closest('[data-ework-command], [aria-label="suggestions.aria"]'),viewport=rows[0].parentElement,clip=document.querySelector('.surface').getBoundingClientRect();const anchor=document.querySelector(".launcher").getBoundingClientRect(),r=rows[0].getBoundingClientRect();return {topLayer:menu.matches(":popover-open"),gap:anchor.top-menu.getBoundingClientRect().bottom,aboveHeader:rows[0].contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)),count:rows.length,scrolling:viewport.scrollHeight>viewport.clientHeight+1,rects:rows.map(row=>{const r=row.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}}),clip:{top:clip.top,bottom:clip.bottom,left:clip.left,right:clip.right},menuHeight:menu.getBoundingClientRect().height,menuWidth:menu.getBoundingClientRect().width,overflowY:getComputedStyle(viewport).overflowY}})
  await writeFile(evidence+'/'+kind+'-'+width+'-'+height+'-'+count+'-initial.json',JSON.stringify(layout,null,2))
  expect(layout.count).toBe(kind==='commands'?8:count);expect(layout.topLayer).toBe(true);expect(layout.gap).toBeCloseTo(4,0);expect(layout.aboveHeader).toBe(true)
  expect(layout.menuWidth).toBe(360);expect(layout.overflowY).toBe('auto');expect(new Set(layout.rects.map(row=>row.left)).size).toBe(1)
  if((kind==='skills'&&count===18)||height===400)expect(layout.scrolling).toBe(true)
  if(kind==='skills')await page.evaluate(index=>window.highlightSkill(index),count-1)
  await rows.last().scrollIntoViewIfNeeded()
  const last=await rows.last().boundingBox();expect(last.y).toBeGreaterThanOrEqual(layout.clip.top);expect(last.y+last.height).toBeLessThanOrEqual(layout.clip.bottom)
  expect(await rows.last().evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})).toBe(true)
  await page.screenshot({path:evidence+'/'+kind+'-'+width+'-'+height+'-'+count+'.png'});await writeFile(evidence+'/'+kind+'-'+width+'-'+height+'-'+count+'.json',JSON.stringify(layout,null,2))
  await rows.last().click();expect(await page.evaluate(()=>window.selected)).toEqual([kind==='commands'?7:count-1]);expect(errors).toEqual([])
 }finally{await page.close()}
},15000)

for(const dark of [false,true])it(`keeps a single slash-command highlight and never preselects compact in ${dark?'dark':'light'} theme`,async()=>{
 const page=await browser.newPage({viewport:{width:1380,height:900}})
 try{
  await page.setContent(`<style>body{--dsw-alias-interactive-bg-hover:rgb(210,210,210)}</style><body ${dark?'data-ds-dark-theme':''}><div data-composer-card style="position:fixed;left:300px;top:560px;width:400px"><div id="root"></div><textarea aria-label="Composer"></textarea><button aria-haspopup="listbox">/</button></div></body>`)
  await page.addScriptTag({content:script});await page.addScriptTag({content:trigger});await page.evaluate(()=>window.mountMenu('commands',8))
  const rows=page.getByRole('option'),selected=page.locator('[role=option][aria-selected=true]')
  await rows.last().waitFor()
  expect(await selected.count()).toBe(0)
  await rows.nth(6).hover()
  await expect.poll(()=>selected.count()).toBe(1)
  expect(await selected.getAttribute('id')).toBe('dsh-slash-option-command-6')
  expect(await rows.first().evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  await page.getByRole('textbox',{name:'Composer'}).focus()
  await page.keyboard.press('ArrowDown')
  await expect.poll(()=>selected.getAttribute('id')).toBe('dsh-slash-option-command-7')
  expect(await rows.nth(6).evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  expect(await rows.nth(7).evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(210, 210, 210)')
  await page.keyboard.press('Enter')
  expect(await page.evaluate(()=>window.selected)).toEqual([7])
  await page.mouse.move(1000,800)
  await expect.poll(()=>selected.count()).toBe(0)
  await page.keyboard.press('ArrowDown')
  await expect.poll(()=>selected.getAttribute('id')).toBe('dsh-slash-option-command-0')
  await page.keyboard.press('ArrowUp')
  await expect.poll(()=>selected.getAttribute('id')).toBe('dsh-slash-option-command-7')
  await page.evaluate(()=>window.reopenCommandMenu())
  await expect.poll(()=>selected.count()).toBe(0)
  await rows.nth(2).click()
  expect(await page.evaluate(()=>window.selected)).toEqual([7,2])
 }finally{await page.close()}
})

for(const dark of [false,true])it(`matches workspace menu material even when native menu CSS loads last in ${dark?'dark':'light'} theme`,async()=>{
 const page=await browser.newPage({viewport:{width:1380,height:900}})
 try{
  const refinements=await readFile('src/preload/figma-refinements.css','utf8'),notes=await readFile('src/preload/notes/style.css','utf8')
  const nativeCss=[trigger,popup].map(source=>JSON.parse(source.match(/const css = ("[^\n]+");/u)[1])).join('\n')+derivedMenuCss
  await page.setContent(`<style>${refinements}${notes}${nativeCss}</style><body ${dark?'data-ds-dark-theme':''}><div role="menu" id="workspace"></div><div class="_3e4SsG_menu" data-ework-expanded-command id="slash"></div><div class="mufS8W_card" data-ework-expanded-command id="skills"></div><div class="srb-notifications" id="notifications"></div><div class="sherlock-account-menu" id="account"></div><div role="menu" id="model"></div><div role="menu" id="permission"></div><div class="st-menu" id="more"></div><div class="en-block-menu" id="note-block"></div><div class="en-export-menu" id="note-export"></div><div class="mantine-Menu-dropdown" id="note-format"></div><main id="document"></main></body>`)
  await page.locator('body').evaluate((body,dark)=>{
   const notes=document.createElement('section');notes.className='en-root';notes.dataset.dark=String(dark);notes.innerHTML='<div class="bn-suggestion-menu" id="note-suggestions"></div>';body.append(notes)
   const derived=document.createElement('div');derived.className='rScV5Q_mindMapMenu odyssey-derived-detail-menu';derived.id='derived';body.append(derived)
  },dark)
  const styles=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('[id]')].map(el=>{const s=getComputedStyle(el);return [el.id,{background:s.backgroundColor,blur:s.backdropFilter,shadow:s.boxShadow}]})))
  expect(styles.workspace.background).toBe(dark?'rgba(43, 43, 43, 0.68)':'rgba(255, 255, 255, 0.78)')
  for(const id of ['slash','skills','notifications','account','model','permission','more','note-block','note-export','note-format','derived','note-suggestions'])expect(styles[id],id).toEqual(styles.workspace)
  expect(styles.workspace.blur).toBe('blur(36px) saturate(1.2)')
  expect(styles.document.background).toBe('rgba(0, 0, 0, 0)')
 }finally{await page.close()}
})

for(const dark of [false,true])it(`does not paint opaque BlockNote rows or a second popover shell in ${dark?'dark':'light'} theme`,async()=>{
 const page=await browser.newPage({viewport:{width:1380,height:900}})
 try{
  const refinements=await readFile('src/preload/figma-refinements.css','utf8'),notes=await readFile('src/preload/notes/style.css','utf8'),vendor=(await readFile('node_modules/@blocknote/mantine/src/blocknoteStyles.css','utf8')).replace(/^@import[^;]+;/m,'')
  await page.setContent(`<style>${refinements}${notes}${vendor}</style><body ${dark?'data-ds-dark-theme':''}><section class="en-root" data-dark="${dark}"><div class="bn-container bn-mantine"><div class="mantine-Menu-dropdown"><div class="mantine-Menu-label" id="label">段落样式</div><button class="mantine-Menu-item" id="row">正文</button><button class="mantine-Menu-item" id="selected" aria-selected="true">标题</button></div><div class="mantine-Popover-dropdown bn-panel-popover" id="shell"><div class="bn-panel" id="panel">链接</div></div></div></section></body>`)
  await page.mouse.move(1200,800)
  for(const id of ['row','label','shell'])expect(await page.locator('#'+id).evaluate(el=>getComputedStyle(el).backgroundColor),id).toBe('rgba(0, 0, 0, 0)')
  expect(await page.locator('#shell').evaluate(el=>getComputedStyle(el).boxShadow)).toBe('none')
  expect(await page.locator('#panel').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(dark?'rgba(43, 43, 43, 0.68)':'rgba(255, 255, 255, 0.78)')
  expect(await page.locator('#selected').evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  await page.locator('#row').hover()
  expect(await page.locator('#row').evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
 }finally{await page.close()}
})
