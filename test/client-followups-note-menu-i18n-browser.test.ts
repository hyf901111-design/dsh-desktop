import {afterAll,beforeAll,expect,it} from 'vitest'
import {build,type PluginBuild} from 'esbuild'
import {readFile,mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {NotesStore} from '../src/main/notes/store'
// @ts-expect-error JavaScript browser-fixture loader.
import {esbuildRawSource} from './helpers/esbuild-raw-source.mjs'
let browser:any,script:string,css:string,store:NotesStore,serial=0
beforeAll(async()=>{
 store=new NotesStore(await mkdtemp(resolve(tmpdir(),'sherlock-menu-i18n-')))
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {NotesApp} from './src/preload/notes/editor';import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';
 window.calls=[];const sessionId=new URLSearchParams(location.search).get('session');
 const bridge={request:async(method,input)=>{window.calls.push({method,input});if(method==='load'||method==='save')return window.noteStore(method,input);if(method==='capability-ready')return{editable:true};if(method==='library-list')return[{id:'builtin-quote',title:'行情面板',group:'内置组件'},{id:'custom-title',title:'用户的中文组件标题',group:'自定义组件'}];return{}},draft:input=>window.noteStore('draft',input)};
 const root=createRoot(document.querySelector('#root')),saveBinding={ready:flush=>window.flushNote=flush};root.render(<NotesApp sessionId={sessionId} bridge={bridge} dark={false} active={true} saveBinding={saveBinding} navigate={()=>{}}/>);
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'note-i18n.js',logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[esbuildRawSource(),{name:'observe-real-note-editor',setup(b:PluginBuild){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async args=>({loader:'tsx',contents:(await readFile(args.path,'utf8')).replace('  const slashMenu = useMemo','  window.editor=editor; const slashMenu = useMemo')}))}}]})
 script=result.outputFiles.find(f=>f.path.endsWith('.js'))!.text;css=result.outputFiles.find(f=>f.path.endsWith('.css'))!.text
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>browser?.close())
async function open(){
 const session='note-i18n-'+(++serial),context=await browser.newContext({viewport:{width:1200,height:900}}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',(error:Error)=>errors.push(error.message));page.setDefaultTimeout(4000)
 await page.exposeBinding('noteStore',async(_:unknown,method:string,input:any)=>method==='load'?store.load('menu-i18n',session):method==='save'?store.save('menu-i18n',session,input.revision,input.content,input.clientId):store.draft('menu-i18n',session,input.clientId,input.revision,input.content))
 await page.route('https://note-menu-i18n.test/**',(route:any)=>route.fulfill({contentType:'text/html',body:'<!doctype html><html data-odyssey-locale="en"><body data-workspace-surface="notes" style="margin:0"><header data-srb-session-header data-ework-notes-session="'+session+'"></header><section class="en-root" style="left:0;right:0"><div id="root" class="en-editor-host"></div></section></body></html>'}))
 await page.goto('https://note-menu-i18n.test/?session='+session);await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.bn-editor').waitFor()
 await page.evaluate(()=>{const w=window as any;w.editor.replaceBlocks(w.editor.document,[{id:'before',type:'paragraph',content:'保留的用户中文正文。'},{id:'anchor',type:'paragraph'},{id:'after',type:'paragraph',content:'保留的后段。'}]);w.editor.setTextCursorPosition('anchor','start');w.editor.focus()});expect(errors).toEqual([])
 return{page,session,errors,close:()=>context.close()}
}
it('serializes English slash menu chrome and built-in names without translating custom library titles',async()=>{
 const f=await open();try{
  await f.page.keyboard.type('/');await expect.poll(()=>f.page.evaluate(()=>(window as any).calls.filter((r:any)=>r.method==='menu-sync').length)).toBeGreaterThan(0)
  const menu=await f.page.evaluate(()=>(window as any).calls.filter((r:any)=>r.method==='menu-sync').at(-1).input);expect(menu.locale).toBe('en');expect(menu.items.map((i:any)=>i.title)).toContain('Component library');const library=menu.items.find((i:any)=>i.title==='Component library');expect(library.children.map((i:any)=>i.title)).toEqual(['Market panel','用户的中文组件标题']);expect(library.children.map((i:any)=>i.group)).toEqual(['Built-in components','Custom components'])
  await f.page.evaluate(()=>document.documentElement.dataset.odysseyLocale='zh');await expect.poll(()=>f.page.evaluate(()=>(window as any).calls.filter((r:any)=>r.method==='menu-sync').at(-1).input.locale)).toBe('zh');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
