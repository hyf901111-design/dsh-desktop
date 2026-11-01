import {beforeAll,afterAll,it,expect,vi} from 'vitest'
import {build} from 'esbuild'
import {esbuildRawSource} from './helpers/esbuild-raw-source.mjs'
import {pathToFileURL} from 'node:url'
import {noteMenuDocumentHtml,noteMenuPresentation} from '../src/main/notes/native-menu'
vi.mock('electron',()=>({BrowserWindow:class{},screen:{}}))

let browser,script,css
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {NotesApp} from './src/preload/notes/editor';import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';
 window.noteRequests=[];const bridge={request:async(method,input)=>{window.noteRequests.push({method,input});return method==='load'?{saved:{title:'菜单验收',blocks:[],yjs:'',revision:0,updatedAt:0}}:method==='library-list'?[{id:'watchlist',title:'自选股',icon:'watchlist',group:'内置组件'},{id:'quote',title:'个股行情',icon:'quote',group:'内置组件'}]:method==='save'?{status:'saved',saved:{...input.content,revision:input.revision+1}}:{}},draft:async()=>{}};
 createRoot(document.querySelector('.en-editor-host')).render(<NotesApp sessionId="menu-test" bridge={bridge} dark={document.body.hasAttribute('data-ds-dark-theme')} navigate={()=>{}}/>);`},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[esbuildRawSource()]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text;css=output.outputFiles.find(file=>file.path.endsWith('.css')).text
 const {chromium}=await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
afterAll(async()=>{await browser?.close()})

for(const dark of [false,true])it(`starts pointer-opened library without a selected background and activates keyboard feedback (${dark?'dark':'light'})`,async()=>{
 const context=await browser.newContext({viewport:{width:900,height:850}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.route('http://127.0.0.1/notes-menu-fixture',route=>route.fulfill({contentType:'text/html',body:`<body ${dark?'data-ds-dark-theme':''}><section class="en-root" style="inset:0"><div class="en-editor-host"></div></section></body>`}));await page.goto('http://127.0.0.1/notes-menu-fixture');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor({timeout:3000})
  await page.locator('.bn-editor').click();await page.keyboard.type('/')
  const latest=()=>page.evaluate(()=>window.noteRequests.filter(item=>item.method==='menu-sync').at(-1)?.input)
  await expect.poll(async()=>(await latest())?.items.some(item=>item.children?.length)).toBe(true)
  let state=await latest(),parent=state.items.find(item=>item.children?.length)
  await page.evaluate(({state,parent})=>document.dispatchEvent(new CustomEvent('sherlock:notes-menu-event',{detail:{sessionId:state.sessionId,menuId:state.menuId,owner:'fixture',revision:state.revision,action:'open',itemId:parent.id}})),{state,parent})
  await expect.poll(async()=>(await latest())?.submenu?.keyboardActive).toBe(false);state=await latest()
  const native=await context.newPage();await native.setContent(noteMenuDocumentHtml);await native.evaluate(({html,dark})=>{document.body.className=dark?'dark':'';document.querySelector('main').innerHTML=html},{html:noteMenuPresentation(state,'ticket').child.html,dark})
  const options=native.getByRole('option'),background=option=>option.evaluate(el=>getComputedStyle(el).backgroundColor)
  expect(await background(options.first())).toBe('rgba(0, 0, 0, 0)');expect(await native.locator('[aria-selected=true]').count()).toBe(0)
  await options.nth(1).hover();expect(await background(options.nth(1))).not.toBe('rgba(0, 0, 0, 0)');expect(await background(options.first())).toBe('rgba(0, 0, 0, 0)')
  await native.mouse.move(0,0);await page.bringToFront();await page.keyboard.press('ArrowDown');await expect.poll(async()=>(await latest())?.submenu).toMatchObject({selectedIndex:0,keyboardActive:true})
  state=await latest();await native.evaluate(html=>document.querySelector('main').innerHTML=html,noteMenuPresentation(state,'ticket').child.html);expect(await background(options.first())).not.toBe('rgba(0, 0, 0, 0)')
  await page.keyboard.press('ArrowDown');await expect.poll(async()=>(await latest())?.submenu?.selectedIndex).toBe(1)
  await page.keyboard.press('ArrowLeft');await expect.poll(async()=>(await latest())?.submenu).toBeUndefined();await page.keyboard.press('ArrowUp');await expect.poll(async()=>(await latest())?.selectedIndex).toBe(state.items.indexOf(state.items.find(item=>item.id===parent.id)));await page.keyboard.press('ArrowRight');await expect.poll(async()=>(await latest())?.submenu).toMatchObject({selectedIndex:0,keyboardActive:true})
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
