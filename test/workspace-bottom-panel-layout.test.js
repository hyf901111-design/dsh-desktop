import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile,realpath} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {WorkbenchToolbar} from '../scripts/lib/research-grid-ui.mjs'
const {patchBetterSidebarClient}=createRequire(import.meta.url)('../scripts/lib/patch-sherlock-better-sidebar.mjs')

let browser,script,css
beforeAll(async()=>{
 const relative='build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js'
 const sidebar=patchBetterSidebarClient(await readFile(relative,'utf8').catch(async()=>readFile(resolve(await realpath('node_modules'),'..',relative),'utf8')))
 const executable=sidebar.replace('exports.apply = apply;','exports.__LayoutSidebar=Sidebar;exports.__LayoutStore=SidebarStore;exports.apply = apply;')
 const literals=[...sidebar.matchAll(/const css\$?\d* = ("[^\n]+);/g)].map(match=>JSON.parse(match[1]))
 css=literals.filter(value=>value.includes('t8lSSG_toggleCluster')||value.includes('#root')&&value.includes('--dsh-sidebar-height')).join('\n')
 for(const path of ['src/preload/figma-final-shell.css','src/preload/figma-panels.css','src/preload/figma-motion.css','src/preload/notes/style.css','scripts/lib/research-grid-workbench.css'])css+='\n'+await readFile(path,'utf8')
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import * as react from 'react';import * as react_jsx_runtime from 'react/jsx-runtime';import * as react_dom from 'react-dom';import {createRoot} from 'react-dom/client';import {WorkspaceSurfaceHost} from './src/preload/workspace-surface-host';import {BrowserAppView} from './src/preload/browser/view';import {integrationStyles} from './src/preload/integrations/style';
 const surfaceStyle=document.createElement('style');surfaceStyle.textContent=integrationStyles;document.head.append(surfaceStyle);
 let descriptor;window.__ModuleLoader__={load:value=>descriptor=value};(0,eval)(${JSON.stringify(executable)});
 const Empty=()=>null,fake=new Proxy({},{get:()=>Empty}),library=descriptor.factory(id=>id==='react'?react:id==='react/jsx-runtime'?react_jsx_runtime:id==='react-dom/client'?{createRoot}:id==='@deepseek-ai/dsh-client-ui-primitives'?new Proxy({Tooltip:({children})=>children,Menu:({anchor})=>anchor},{get:(target,key)=>target[key]||Empty}):fake);
 const store=new library.__LayoutStore();store.setPrefs({...store.getPrefs(),openByDefault:true,bottomPanelAutoTerminal:false,tabsEnabled:{editor:false,probe:true}});store.setSession('layout-session');
 store.reduce(state=>({...state,panelOpen:true,bottomOpen:false,bottomOpenedOnce:true,activePane:state.bottomSplits.id,bottomSplits:{...state.bottomSplits,active:'layout-probe',tabs:[{id:'layout-probe',type:'probe',title:'终端布局'}]}}));
 window.bottomMounts=0;const Probe=()=>{react.useEffect(()=>{window.bottomMounts++},[]);return react.createElement('div',{'data-bottom-probe':'',style:{flex:1,padding:16}},'终端原有内容',react.createElement('input',{'aria-label':'底栏草稿',defaultValue:'未发送内容'}))};
 const localeSnapshot={active:'zh'},sessionSnapshot={current:'layout-session',ids:['layout-session'],byId:{'layout-session':{cwd:'/tmp'}}};
 const ctx={locale:{subscribe:()=>()=>{},getSnapshot:()=>localeSnapshot},sessions:{list:{subscribe:()=>()=>{},getSnapshot:()=>sessionSnapshot}},betterSidebar:{getTabs:()=>[{id:'probe',title:'终端布局',component:Probe}],getTab:id=>id==='probe'?{id:'probe',title:'终端布局',component:Probe}:undefined,isTabEnabled:id=>id==='probe',activateTab(){},closeTab(){},openTab(){}},workspaces:{startSession(){}}};
 createRoot(document.querySelector('#sidebar')).render(react.createElement(library.__LayoutSidebar,{ctx,store}));
 const WorkbenchToolbar=${WorkbenchToolbar.toString()};
 function Canvas(){const rootRef=react.useRef(null);return react.createElement('div',{ref:rootRef,'data-research-canvas':'','data-ework-grid':'',style:{flex:1,minHeight:0}},react.createElement(WorkbenchToolbar,{rootRef,sessionId:'layout-session',className:'rScV5Q_globalToolbar','data-research-global-toolbar':''},react.createElement('button',null,'画布工具')))}
 window.startLayout=async mode=>{document.querySelector('.wSkVaW_root').dataset.odysseyPage=mode==='research'?'research':'conversation';if(mode==='notes'){const host=new WorkspaceSurfaceHost(document),surface=document.createElement('section');surface.className='en-root';surface.innerHTML='<div style="padding:24px">笔记文件正文</div>';host.register('notes',surface);host.open('notes');window.layoutHost=host}else if(mode==='browser'){
  const state={tabs:[{id:'page',url:'https://example.com/',title:'实际网页布局',private:false,pinned:false,muted:false,zoom:1,loading:false,canBack:false,canForward:false}],activeId:'page',closed:[],history:[],bookmarks:[],folders:[],downloads:[],settings:{engine:'Google',startup:'restore',bookmarksBar:true,askDownload:false,downloadPath:''}};window.browserCalls=[];
  const bridge={subscribe:()=>()=>{},source:async()=>{},request:async(method,input)=>{window.browserCalls.push([method,input]);return method==='layout'?undefined:structuredClone(state)}};window.layoutHost=new WorkspaceSurfaceHost(document);window.browserView=new BrowserAppView(document,bridge,window.layoutHost);await window.browserView.open('layout-session');
 }else createRoot(document.querySelector('#canvas')).render(react.createElement(Canvas))};
 `},bundle:true,platform:'browser',format:'iife',write:false,plugins:[{name:'inline',setup(b){b.onResolve({filter:/\?(inline|raw)$/},async args=>{const r=await b.resolve(args.path.replace(/\?(inline|raw)$/,''),{resolveDir:args.resolveDir,kind:args.kind});return{path:r.path,namespace:'inline'}});b.onLoad({filter:/.*/,namespace:'inline'},async args=>({contents:JSON.stringify(args.path.endsWith('.svg')?'data:image/svg+xml,'+encodeURIComponent((await readFile(args.path,'utf8')).replaceAll(String.fromCharCode(34),String.fromCharCode(39))):await readFile(args.path,'utf8')),loader:'json'}))}}]})
 script=output.outputFiles[0].text
 const module=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(module.default??module).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>browser?.close())

for(const mode of ['notes','research','browser'])for(const dark of [false,true])it(`${mode} stays above the native bottom panel through toggles, live resize and viewport resize (${dark?'dark':'light'})`,async()=>{
 const context=await browser.newContext({viewport:{width:1380,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(3500);page.on('pageerror',error=>{errors.push(error.message);console.error('bottom-panel-browser-error:',error.message)})
 try{
  await page.route('http://127.0.0.1/bottom-panel-layout',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'}));await page.goto('http://127.0.0.1/bottom-panel-layout')
  await page.setContent(`<body ${dark?'data-ds-dark-theme':''}><div id="root"><div class="pI_x6G_frame" data-dsh-frame><aside data-dsh-sidebar-root></aside><main class="pI_x6G_centerCol" data-pane="conversation"><div class="wSkVaW_root" data-slot="conversation" data-odyssey-page="conversation"><header class="wSkVaW_header" data-ework-notes-session="layout-session">工作区标题</header><div id="canvas" style="display:contents"></div></div></main></div></div><div id="sidebar"></div></body>`)
  await page.addStyleTag({content:css+'\nhtml,body,#root{margin:0;height:100%;overflow:hidden} [data-dsh-frame]{display:grid;grid-template-columns:80px 1fr;height:100%} [data-dsh-sidebar-root]{grid-column:1} [data-pane="conversation"]{grid-column:2;min-width:0;min-height:0} .wSkVaW_root{display:flex;flex-direction:column} #canvas>[data-research-canvas]{background:#ddd} [data-research-global-toolbar]{z-index:50} .t8lSSG_bottomPanel{transition:none!important} .wSkVaW_header{height:56px;min-height:56px;flex:none}'})
  await page.addScriptTag({content:script});await page.locator('[data-odyssey-panel-entry="bottom"]').waitFor();await page.evaluate(mode=>window.startLayout(mode),mode)
  const target=page.locator(mode==='notes'?'.en-root':mode==='browser'?'.eb-root':'[data-research-global-toolbar]'),toggle=page.locator('[data-odyssey-panel-entry="bottom"]'),panel=page.locator('#odyssey-bottom-workspace-panel')
  await target.waitFor();const initial=await target.boundingBox()
  const above=async()=>{const content=await target.boundingBox(),bottom=await panel.boundingBox(),native=mode==='browser'?await page.evaluate(()=>window.browserCalls.filter(([method])=>method==='layout').at(-1)?.[1]?.bounds):undefined;return Math.min(bottom.y-(content.y+content.height),native?bottom.y-native.y-native.height:Infinity)}
  const gap=mode==='research'?8:2
  await toggle.click();await expect.poll(()=>toggle.getAttribute('aria-expanded')).toBe('true');await panel.waitFor({state:'visible'});await expect.poll(()=>above()).toBeGreaterThanOrEqual(gap)
  if(mode==='browser'){
   expect(await page.locator('.pI_x6G_centerCol').evaluate(el=>getComputedStyle(el).visibility)).toBe('hidden');expect(await panel.evaluate(el=>getComputedStyle(el).visibility)).toBe('visible')
   await page.getByRole('textbox',{name:'底栏草稿'}).fill('浏览器中保留的底栏内容')
   await expect.poll(()=>page.evaluate(()=>{const layout=window.browserCalls.filter(([method])=>method==='layout').at(-1)?.[1],panel=document.querySelector('#odyssey-bottom-workspace-panel').getBoundingClientRect();return layout?.visible&&layout.bounds.y+layout.bounds.height<=panel.top-2})).toBe(true)
  }
  const before=await panel.boundingBox(),handle=await page.locator('.t8lSSG_bottomResize').boundingBox()
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height-1);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2,handle.y-100,{steps:5})
  await expect.poll(async()=>(await panel.boundingBox()).height).toBeGreaterThan(before.height+80)
  await expect.poll(()=>above()).toBeGreaterThanOrEqual(gap)
  await page.mouse.up()
  if(mode==='research'){
   await page.locator('.wSkVaW_root').evaluate(element=>element.style.height='calc(100% - var(--dsh-sidebar-height,0px))')
   await expect.poll(()=>above()).toBeGreaterThanOrEqual(8);await expect.poll(()=>above()).toBeLessThanOrEqual(40)
  }
  await page.setViewportSize({width:1200,height:740});await expect.poll(()=>above()).toBeGreaterThanOrEqual(gap)
  if(process.env.SHERLOCK_NOTES_QA_DIR)await page.screenshot({path:process.env.SHERLOCK_NOTES_QA_DIR+'/bottom-panel-'+mode+'-'+(dark?'dark':'light')+'.png'})
  await toggle.click();await expect.poll(()=>page.evaluate(()=>document.documentElement.style.getPropertyValue('--dsh-sidebar-height'))).toBe('0px')
  await page.setViewportSize({width:1380,height:900});await expect.poll(async()=>{const rect=await target.boundingBox();return Math.abs(rect.y+rect.height-initial.y-initial.height)}).toBeLessThanOrEqual(1)
  if(mode==='browser'){
   await toggle.click();await expect.poll(()=>above()).toBeGreaterThanOrEqual(gap);expect(await page.getByRole('textbox',{name:'底栏草稿'}).inputValue()).toBe('浏览器中保留的底栏内容');expect(await page.evaluate(()=>window.bottomMounts)).toBe(1);expect(await page.locator('.eb-tab[aria-selected=true]').getAttribute('data-id')).toBe('page')
   const before=await target.boundingBox(),height=await page.evaluate(()=>document.documentElement.style.getPropertyValue('--dsh-sidebar-height'))
   // Native live geometry can be the only DOM write in a frame: the writer is on html.
   await page.evaluate(height=>document.documentElement.style.setProperty('--dsh-sidebar-height',(parseFloat(height)+60)+'px'),height)
   await expect.poll(async()=>before.height-(await target.boundingBox()).height).toBe(60);await expect.poll(()=>above()).toBeGreaterThanOrEqual(gap)
   await page.evaluate(height=>document.documentElement.style.setProperty('--dsh-sidebar-height',height),height)
   await expect.poll(async()=>(await target.boundingBox()).height).toBe(before.height)
   await toggle.click();await expect.poll(async()=>{const native=await page.evaluate(()=>window.browserCalls.filter(([method])=>method==='layout').at(-1)?.[1]?.bounds);return native?Math.abs(native.y+native.height-initial.y-initial.height):Infinity}).toBeLessThanOrEqual(1)
  }
  expect(errors).toEqual([])
 }finally{await context.close()}
},20000)
