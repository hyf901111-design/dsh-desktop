import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
let browser,script,sidebarSource,css
const output=process.env.SHERLOCK_ACCOUNT_RAIL_OUTPUT||'/tmp/sidebar-account-rail-20261026'
beforeAll(async()=>{
 await mkdir(output,{recursive:true})
 sidebarSource=(await readFile('node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.__Root=SidebarRoot;')
 const assets='node_modules/@deepseek-ai/dsh-web-frontend/dist/assets',files=await readdir(assets);css=await readFile(join(assets,files.find(name=>/^index-.*\.css$/.test(name))),'utf8')
 css+='\n'+(await Promise.all(['figma-final-shell','figma-refinements'].map(name=>readFile('src/preload/'+name+'.css','utf8')))).join('\n')
 script=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import * as React from 'react';import * as jsx from 'react/jsx-runtime';import{createPortal,flushSync}from'react-dom';import{createRoot}from'react-dom/client';import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';import{mountAccountUi}from'./src/preload/account-ui';import{mountResearchBoardNotifications}from'./src/preload/research-board-notifications-ui';import{scheduledStyles}from'./src/preload/scheduled/style';
 let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});let descriptor;window.__ModuleLoader__={load:value=>descriptor=value};new Function(window.sidebarSource)();const native=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?{createPortal}:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:fake)
 // The slot supplies its native settings mount point. The account and bell
 // controls themselves come from the real preload helpers below; only I/O is fixed.
 const style=document.createElement('style');style.textContent=scheduledStyles;document.head.append(style)
 let collapsed=true;const root=createRoot(document.getElementById('root'));const render=()=>flushSync(()=>root.render(<div data-sidebar-collapsed={collapsed?'true':undefined} style={{width:collapsed?80:260,height:'100vh'}}><native.__Root collapsed={collapsed} width={260} t={key=>key} toggleSidebar={()=>{collapsed=!collapsed;render()}} startSession={()=>{}} startResearchSession={()=>{}} renderSlot={name=>name==='sidebar.settings'?<div data-slot='sidebar.settings'><button className='VOzbGW_trigger' aria-label='原生设置挂载点'>设置</button></div>:name==='sidebar.workspaces'?<div style={{height:80}}>QA workspace</div>:null}/></div>));render()
 const state={eventSeq:1,account:{user:{userId:'qa-account',publicId:'QA12345',username:'H'}},notifications:{unreadCount:0,notifications:[]}},bridge={getSnapshot:async()=>state,subscribe:()=>()=>{},invoke:async()=>({ok:true})};const offAccount=mountAccountUi(document,async()=>({user:{id:'qa-account',username:'H',createdAt:1}}),bridge),offBell=mountResearchBoardNotifications(document,bridge)
 window.railFixture={setCollapsed(value){collapsed=value;render()},dispose(){offBell();offAccount();root.unmount()}};
 `},bundle:true,jsx:'automatic',platform:'browser',format:'iife',write:false,logLevel:'silent',loader:{'.css':'empty','.svg':'dataurl'},plugins:[{name:'raw-assets',setup(b){b.onResolve({filter:/\?(raw|url&inline)$/},args=>({path:resolve(args.resolveDir,args.path.replace(/\?(raw|url&inline)$/,'')),namespace:'rail-assets'}));b.onLoad({filter:/.*/,namespace:'rail-assets'},async args=>{const bytes=await readFile(args.path);return{contents:JSON.stringify(args.path.endsWith('.png')?'data:image/png;base64,'+bytes.toString('base64'):bytes.toString('utf8')),loader:'json'}})}}]})).outputFiles[0].text
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(()=>browser?.close())
async function fixture(mode,height=720){
 const page=await browser.newPage({viewport:{width:800,height},deviceScaleFactor:2,reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('https://rail.local/**',async route=>{const path=new URL(route.request().url()).pathname;if(path==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><div id="root"></div>'});if(['/figma-self-avatar.png','/figma-sidebar-bell.svg'].includes(path))return route.fulfill({body:await readFile('build/brand'+path),contentType:path.endsWith('.png')?'image/png':'image/svg+xml'});return route.fulfill({status:404,body:''})})
 await page.goto('https://rail.local/');await page.addStyleTag({content:css+'\nhtml,body{margin:0;height:100%;font:14px system-ui;background:#eee;--dsw-specific-sidebar-fill:#f5f5f5;--dsw-alias-label-primary:#252525;--dsw-alias-label-secondary:#777;--dsw-alias-interactive-bg-hover:#0001}body[data-ds-dark-theme]{background:#071a4f;--dsw-specific-sidebar-fill:#101111;--dsw-alias-label-primary:#ddd;--dsw-alias-label-secondary:#999;--dsw-alias-interactive-bg-hover:#fff1}'});await page.evaluate(({source,mode})=>{window.sidebarSource=source;if(mode==='dark')document.body.setAttribute('data-ds-dark-theme','')},{source:sidebarSource,mode});await page.addScriptTag({content:script});await page.locator('.sherlock-account-button .sherlock-account-avatar[data-authenticated=true]').waitFor();await page.locator('.srb-bell').waitFor();return{page,errors}
}
async function geometry(page){return page.evaluate(()=>{const box=selector=>{const node=document.querySelector(selector),r=node.getBoundingClientRect(),s=getComputedStyle(node);return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,radius:s.borderRadius,background:s.backgroundColor}};return{account:box('.sherlock-account-button'),avatar:box('.sherlock-account-avatar'),bell:box('.srb-bell'),footer:box('.hHd-Xa_footArea'),viewport:innerHeight}})}
it.each(['light','dark'])('keeps the collapsed native account hover circular and leaves comfortable space below both controls in %s',async mode=>{
 const{page,errors}=await fixture(mode)
 try{
  await page.locator('.sherlock-account-button').hover();const value=await geometry(page);await writeFile(join(output,mode+'-collapsed.json'),JSON.stringify(value,null,2)+'\n');await page.screenshot({path:join(output,mode+'-collapsed.png')})
  expect(value.account.width).toBe(36);expect(value.account.height).toBe(36);expect(value.account.radius).toBe('50%');expect(value.viewport-value.account.bottom).toBeGreaterThanOrEqual(16);expect(value.viewport-value.account.bottom).toBeLessThanOrEqual(22);expect(value.bell.bottom).toBeLessThan(value.account.y);expect(value.account.x+18).toBeCloseTo(value.bell.x+value.bell.width/2,2)
  expect(await page.locator('.sherlock-account-button').evaluate(el=>document.elementFromPoint(el.getBoundingClientRect().x+18,el.getBoundingClientRect().y+18)===el.querySelector('i')||document.elementFromPoint(el.getBoundingClientRect().x+18,el.getBoundingClientRect().y+18)===el)).toBe(true);expect(errors).toEqual([])
 }finally{await page.evaluate(()=>window.railFixture.dispose());await page.close()}
},10000)
it.each(['light','dark'])('keeps the expanded native footer unchanged, preserves both real buttons and opens their existing menus after toggling in %s',async mode=>{
 const{page,errors}=await fixture(mode,620)
 try{
  await page.locator('.hHd-Xa_toggle').click();await page.waitForSelector('[data-dsh-sidebar-wide=true]');const wide=await geometry(page);expect(wide.account.height).toBe(42);expect(wide.account.width).toBeGreaterThan(100);expect(wide.account.radius).toBe('8px');expect(wide.viewport-wide.account.bottom).toBeLessThan(16)
  await page.evaluate(()=>{window.accountNode=document.querySelector('.sherlock-account-button');window.bellNode=document.querySelector('.srb-bell')});await page.locator('.hHd-Xa_toggle').click();await page.waitForSelector('[data-dsh-sidebar-wide=false]');await expect.poll(()=>page.locator('.sherlock-account-button').evaluate(el=>el.getBoundingClientRect().height)).toBe(36);expect(await page.evaluate(()=>window.accountNode===document.querySelector('.sherlock-account-button')&&window.bellNode===document.querySelector('.srb-bell'))).toBe(true)
  await page.locator('.sherlock-account-button').click();await page.locator('.sherlock-account-menu').waitFor();expect(await page.locator('.sherlock-account-button').getAttribute('aria-expanded')).toBe('true');await page.locator('.sherlock-account-button').click();await page.locator('.srb-bell').click();await page.locator('.srb-notifications').waitFor();expect(await page.locator('.srb-bell').getAttribute('aria-expanded')).toBe('true');expect(errors).toEqual([])
 }finally{await page.evaluate(()=>window.railFixture.dispose());await page.close()}
},10000)
