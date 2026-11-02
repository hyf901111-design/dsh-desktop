import {afterAll,beforeAll,expect,it,vi} from 'vitest'
import {build,type PluginBuild} from 'esbuild'
import {readFile,mkdtemp,mkdir,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {NotesStore} from '../src/main/notes/store'
import {noteLibraryItems} from '../src/main/notes/component-library'
import {NoteNativeMenu} from '../src/main/notes/native-menu'
// @ts-expect-error Browser fixture raw imports match the production loader.
import {esbuildRawSource} from './helpers/esbuild-raw-source.mjs'
const env=vi.hoisted(()=>({page:null as any,content:{x:100,y:400,width:1380,height:900},zoom:1,windows:[] as any[],point:{x:0,y:0}}))
vi.mock('electron',async()=>{
 const {EventEmitter}=await import('node:events')
 class NativeWindow extends EventEmitter{
  id='popup-'+env.windows.length;destroyed=false;bounds={x:0,y:0,width:312,height:98};ready=Promise.resolve();boundsReady=Promise.resolve();webContents:any
  constructor(public options:any){super();env.windows.push(this);this.webContents=Object.assign(new EventEmitter(),{getZoomFactor:()=>env.zoom,setZoomFactor:()=>{},setWindowOpenHandler:()=>{},session:{setPermissionRequestHandler:()=>{}},send:(_name:string,detail:any)=>{void env.page.evaluate((value:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-menu-event',{detail:value})),detail)},executeJavaScript:async(script:string)=>{await this.ready;await this.boundsReady;return env.page.frame({name:this.id}).evaluate(script)}})}
  getContentBounds=()=>env.content;getBounds=()=>this.bounds;isDestroyed=()=>this.destroyed;isFocused=()=>!this.options.parent;isVisible=()=>!this.destroyed;focus=()=>{}
  setBounds=(bounds:any)=>{this.bounds=bounds;this.boundsReady=env.page.evaluate(({id,b,c,z}:any)=>{const iframe=document.querySelector<HTMLIFrameElement>('#'+id);if(iframe)Object.assign(iframe.style,{left:(b.x-c.x)/z+'px',top:(b.y-c.y)/z+'px',width:b.width/z+'px',height:b.height/z+'px'})},{id:this.id,b:bounds,c:env.content,z:env.zoom})}
  loadURL=(url:string)=>this.ready=(async()=>{
   await env.page.evaluate(({id,url}:any)=>new Promise<void>(done=>{const iframe=document.createElement('iframe');iframe.id=id;iframe.name=id;iframe.style.cssText='position:fixed;border:0;z-index:10000;visibility:hidden';iframe.onload=()=>done();iframe.src=url;document.body.append(iframe)}),{id:this.id,url})
   await env.page.frame({name:this.id}).evaluate((id:string)=>{document.addEventListener('pointerdown',e=>e.preventDefault());document.addEventListener('click',e=>{const link=(e.target as HTMLElement).closest('a');if(link){e.preventDefault();void(parent as any).nativeMenuNavigate(id,link.href)}})},this.id)
  })()
  showInactive=()=>{void env.page.evaluate((id:string)=>{const el=document.getElementById(id);if(el)el.style.visibility='visible'},this.id)}
  destroy=()=>{if(this.destroyed)return;this.destroyed=true;void env.page.evaluate((id:string)=>document.getElementById(id)?.remove(),this.id).catch(()=>{});this.emit('closed')}
 }
 return{BrowserWindow:NativeWindow,screen:{getDisplayNearestPoint:()=>({workArea:{x:0,y:25,width:2000,height:1415}}),getCursorScreenPoint:()=>env.point}}
})
let browser:any,script:string,css:string
beforeAll(async()=>{
 const built=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {createRoot}from'react-dom/client';import{NotesApp}from'./src/preload/notes/editor';import'@blocknote/mantine/style.css';import'./src/preload/notes/style.css';
 const sessionId='slash-viewport';const bridge={request:async(method,input)=>window.noteRequest(method,input),draft:async input=>window.noteRequest('draft',input)};
 createRoot(document.querySelector('#root')).render(<NotesApp sessionId={sessionId} bridge={bridge} dark={true} active={true} navigate={()=>{}}/>);
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'slash.js',logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[esbuildRawSource(),{name:'actual-editor-observer',setup(b:PluginBuild){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async a=>({loader:'tsx',contents:(await readFile(a.path,'utf8')).replace('  const slashMenu = useMemo','  window.slashEditor=editor; const slashMenu = useMemo')}))}}]})
 script=built.outputFiles.find(f=>f.path.endsWith('.js'))!.text;css=built.outputFiles.find(f=>f.path.endsWith('.css'))!.text
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await pw.chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>browser?.close())
async function open(height:number,zoom:number,target:number){
 const store=new NotesStore(await mkdtemp(resolve(tmpdir(),'slash-viewport-store-')))
 const page=await browser.newPage({viewport:{width:Math.round(1380/zoom),height:Math.round(height/zoom)}}),errors:string[]=[]
 page.setDefaultTimeout(4000);page.on('pageerror',(e:Error)=>errors.push(e.message));env.page=page;env.content={x:100,y:400,width:1380,height};env.zoom=zoom;env.windows=[];env.point={x:0,y:0}
 const {BrowserWindow}=await import('electron'),parent=new BrowserWindow({}),menu=new NoteNativeMenu({getWindow:()=>parent,owner:()=> 'qa',canRead:id=>id==='slash-viewport'})
 await page.exposeFunction('nativeMenuNavigate',(id:string,url:string)=>env.windows.find(w=>w.id===id)?.webContents.emit('will-navigate',{preventDefault:()=>{}},url))
 await page.exposeFunction('noteRequest',async(method:string,input:any)=>{
  if(method==='menu-sync'){menu.sync(input,'qa');return{ok:true}}if(method==='menu-close'){menu.close(input.menuId);return{ok:true}}
  if(method==='load')return store.load('slash-owner','slash-viewport')
  if(method==='save')return store.save('slash-owner','slash-viewport',input.revision,input.content,input.clientId)
  if(method==='draft')return store.draft('slash-owner','slash-viewport',input.clientId,input.revision,input.content)
  if(method==='library-list')return noteLibraryItems({list:()=>[]} as any);return{}
 })
 await page.route('https://slash-viewport.test/**',(route:any)=>route.fulfill({contentType:'text/html',body:'<!doctype html><html data-odyssey-locale="en"><body data-workspace-surface="notes" data-ds-dark-theme style="margin:0;overflow:hidden"><header data-ework-notes-session="slash-viewport"></header><section class="en-root" style="left:'+307/zoom+'px;right:'+395/zoom+'px"><div id="root" class="en-editor-host"></div></section></body></html>'}))
 await page.goto('https://slash-viewport.test');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.bn-editor').waitFor()
 await page.evaluate(()=>{const e=(window as any).slashEditor;e.replaceBlocks(e.document,[{id:'above',type:'paragraph',content:'Research note above the table.'},{id:'wide-table',type:'table',content:{type:'tableContent',headerRows:0,columnWidths:[340,330,330],rows:Array.from({length:3},()=>({cells:['','','']}))}},{id:'below',type:'paragraph',content:'Keep this paragraph below the table.'},{id:'blank',type:'paragraph'}]);e.setTextCursorPosition('blank','start')})
 await page.locator('[data-id="blank"] p').waitFor()
 await page.evaluate(({target,zoom}:any)=>{const para=document.querySelector<HTMLElement>('[data-id="blank"] p')!,top=para.getBoundingClientRect().top,root=document.querySelector<HTMLElement>('.en-root')!;root.style.top=(target/zoom-top)+'px';root.style.bottom='0'}, {target,zoom})
 const blank=page.locator('[data-id="blank"] p');await blank.click();await page.keyboard.type('/')
 await expect.poll(()=>env.windows.filter(w=>w.options.parent&&!w.destroyed).length).toBe(1)
 await expect.poll(()=>page.locator('iframe').first().evaluate((el:HTMLElement)=>el.style.visibility)).toBe('visible')
 return{page,menu,errors,root:()=>env.windows.find(w=>w.options.parent&&!w.destroyed),close:async()=>{menu.close();await page.close()}}
}
for(const[height,zoom,target]of[[900,1.1,554],[820,1,500],[620,1,390]])it(`keeps the actual low-caret native slash root visible and scrollable at ${height}px / zoom${zoom}`,async()=>{
 const f=await open(height!,zoom!,target!);try{
  const popup=f.root(),frame=f.page.frame({name:popup.id}),bounds=popup.getBounds(),local={top:bounds.y-env.content.y,bottom:bounds.y+bounds.height-env.content.y}
  await mkdir('/tmp/sherlock-note-slash-root-safe-viewport-20261102',{recursive:true})
  await writeFile('/tmp/sherlock-note-slash-root-safe-viewport-20261102/'+height+'-bounds.json',JSON.stringify({height,zoom,target,content:env.content,bounds,local},null,2)+'\n')
  await f.page.screenshot({path:'/tmp/sherlock-note-slash-root-safe-viewport-20261102/'+height+'-root.png'})
  expect(local.top).toBeGreaterThanOrEqual(8);expect(local.bottom).toBeLessThanOrEqual(height!-8)
  expect(bounds.width).toBe(Math.ceil(264*zoom!));expect(local.bottom).toBeLessThanOrEqual(target!-6)
  const paragraph=frame.getByRole('option',{name:'Paragraph',exact:true});expect(await paragraph.isVisible()).toBe(true)
  const list=frame.getByRole('listbox',{name:'Note slash commands',exact:true}),library=frame.getByRole('option',{name:'Component library',exact:true})
  await library.scrollIntoViewIfNeeded();const box=await library.boundingBox();expect(box).not.toBeNull()
  expect(await library.evaluate((el:HTMLElement)=>{const r=el.getBoundingClientRect(),p=el.closest('[role=listbox]')!.getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom})).toBe(true)
  const before=popup.getBounds(),scroll=await list.evaluate((el:HTMLElement)=>el.scrollTop)
  await f.page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);env.point={x:env.content.x+(box!.x+box!.width/2)*zoom!,y:env.content.y+(box!.y+box!.height/2)*zoom!}
  await expect.poll(()=>env.windows.filter(w=>w.options.parent&&!w.destroyed).length).toBe(2)
  expect(popup.getBounds()).toEqual(before);expect(await list.evaluate((el:HTMLElement)=>el.scrollTop)).toBe(scroll)
  const child=env.windows.filter(w=>w.options.parent&&!w.destroyed).at(-1),childFrame=f.page.frame({name:child.id})
  expect(await childFrame.getByRole('option',{name:'行情面板',exact:true}).count()+await childFrame.getByRole('option',{name:'Market panel',exact:true}).count()).toBe(1)
  expect(child.getBounds().width).toBe(Math.ceil(260*zoom!));expect(child.getBounds().y).toBeGreaterThanOrEqual(env.content.y+8);expect(child.getBounds().y+child.getBounds().height).toBeLessThanOrEqual(env.content.y+height!-8)
  await f.page.keyboard.press('Escape');await expect.poll(()=>env.windows.filter(w=>w.options.parent&&!w.destroyed).length).toBe(0)
  expect(await f.page.locator('[data-id="above"] p').textContent()).toContain('Research note above the table.');expect(await f.page.locator('[data-id="below"] p').textContent()).toContain('Keep this paragraph below the table.');expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
