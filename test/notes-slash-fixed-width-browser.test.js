import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
let browser,script,css
const output=process.env.SHERLOCK_SLASH_SKILLS_EVIDENCE||'/tmp/sherlock-note-slash-skills-fixed-width-20261101/replay'
beforeAll(async()=>{
 await mkdir(output,{recursive:true});css=await readFile('src/preload/home-guides.css','utf8')
 script=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{createHomeGuideNoteMenu}from'./src/preload/home-guide-note-menu';import{createHomeGuidePointer}from'./src/preload/home-guide-pointer';
 const runId='fixed-menu',sessionId='fixed-session',controller=new AbortController(),events=[];document.documentElement.dataset.homeGuidePointerRun=runId;
 const pointer=createHomeGuidePointer(document,{runId,signal:controller.signal,wait:()=>Promise.resolve(),waitUntilPlaying:()=>Promise.resolve()}),menu=createHomeGuideNoteMenu(document,{runId,sessionId,signal:controller.signal,current:()=>true});
 const item=(id,title)=>({id,title,icon:'quote',subtext:'',group:'',badge:''}),children=Array.from({length:40},(_,index)=>item('skill-'+index,'技能 '+index));
 let state;document.addEventListener('sherlock:notes-menu-event',event=>{events.push(event.detail);if(event.detail.action==='open'){state={...state,revision:state.revision+1,submenu:{parentId:'library',selectedIndex:0,keyboardActive:false}};menu.sync(state)}else if(event.detail.action==='back'){state={...state,revision:state.revision+1,submenu:undefined};menu.sync(state)}});
 window.fixedMenu={events,start(x){state={sessionId,menuId:'roster',revision:1,dark:false,selectedIndex:undefined,anchor:{x,y:420,width:1,height:20},items:[...Array.from({length:24},(_,index)=>item('command-'+index,'命令 '+index)),{...item('library','组件库'),children}]};menu.sync(state)},keyboardLast(){state={...state,revision:state.revision+1,submenu:{parentId:'library',selectedIndex:39,keyboardActive:true}};menu.sync(state)},async point(selector,action){const target=menu.element().querySelector(selector);await pointer.perform({target,action})},dispose(){controller.abort();pointer.dispose();menu.dispose()}};
 `},bundle:true,platform:'browser',format:'iife',write:false,logLevel:'silent',loader:{'.svg':'text'}})).outputFiles[0].text
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(()=>browser?.close())
for(const x of [20,700])it('keeps the real replay root and child single-column, scrollable and hover-stable at '+x,async()=>{
 const page=await browser.newPage({viewport:{width:760,height:500},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.route('http://127.0.0.1/fixed-note-menu',route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><textarea aria-label="笔记正文">保留原正文和输入焦点。</textarea>'}));await page.goto('http://127.0.0.1/fixed-note-menu');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.getByRole('textbox').focus();await page.evaluate(x=>window.fixedMenu.start(x),x)
  const root=page.locator('.root-menu'),rootList=root.locator(':scope>[role=listbox]'),parent=root.getByRole('option',{name:'组件库',exact:true})
  expect((await root.boundingBox()).width).toBe(264);expect(await rootList.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true)
  await parent.scrollIntoViewIfNeeded();const before=await root.boundingBox(),scroll=await rootList.evaluate(el=>el.scrollTop);expect(scroll).toBeGreaterThan(0)
  await page.evaluate(()=>window.fixedMenu.point('.root-menu a[data-submenu]','move'));await parent.hover()
  const child=page.locator('.child-menu'),childList=child.locator(':scope>[role=listbox]');await child.waitFor()
  expect((await child.boundingBox()).width).toBe(260);expect(await root.boundingBox()).toEqual(before);expect(await rootList.evaluate(el=>el.scrollTop)).toBe(scroll)
  expect(await childList.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);expect(await child.locator('a').evaluateAll(rows=>new Set(rows.map(row=>row.getBoundingClientRect().left)).size)).toBe(1)
  const bounds=await child.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(8);expect(bounds.x+bounds.width).toBeLessThanOrEqual(752);expect(bounds.y).toBeGreaterThanOrEqual(8);expect(bounds.y+bounds.height).toBeLessThanOrEqual(492);if(x>600)expect(bounds.x+bounds.width).toBeLessThanOrEqual(before.x)
  await page.evaluate(()=>window.fixedMenu.keyboardLast());const last=child.getByRole('option',{name:'技能 39',exact:true});expect(await childList.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
  expect(await last.evaluate(el=>{const r=el.getBoundingClientRect(),list=el.closest('[role=listbox]').getBoundingClientRect();return r.top>=list.top&&r.bottom<=list.bottom+1&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})).toBe(true)
  await page.evaluate(()=>window.fixedMenu.point('.child-menu a:last-child','click'));await page.screenshot({path:output+'/'+x+'-menus.png'});await last.click()
  expect(await page.evaluate(()=>window.fixedMenu.events.filter(event=>event.action==='select').map(event=>({parent:event.parentId,id:event.itemId})))).toEqual([{parent:'library',id:'skill-39'}]);expect(await root.count()).toBe(0)
  expect(await page.getByRole('textbox').inputValue()).toBe('保留原正文和输入焦点。');expect(await page.getByRole('textbox').evaluate(el=>el===document.activeElement)).toBe(true);expect(errors).toEqual([])
  await writeFile(output+'/'+x+'.json',JSON.stringify({root:before,child:bounds,parentScroll:scroll,events:await page.evaluate(()=>window.fixedMenu.events)},null,2));await page.screenshot({path:output+'/'+x+'-selected.png'})
 }finally{await page.evaluate(()=>window.fixedMenu?.dispose());await page.close()}
},12000)
