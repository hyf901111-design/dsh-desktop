// Isolated Electron check: actual BrowserAppView + Scheduled menu + browser service.
// Creates a temporary profile, uses a synthetic HTTPS page, and never touches the installed client.
import {build} from 'esbuild'
import {mkdtemp,mkdir,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
const root=process.cwd(),require=createRequire(join(root,'package.json')),scratch=await mkdtemp(join(tmpdir(),'browser-overlay-native-'))
const output=resolve(process.env.BROWSER_APP_EVIDENCE||join(scratch,'evidence')),preload=join(scratch,'preload.cjs'),entry=join(scratch,'main.cjs')
await mkdir(output,{recursive:true})
const inline={name:'inline',setup(b){
 b.onResolve({filter:/\?(inline|raw)$/},async args=>({path:(await b.resolve(args.path.replace(/\?(inline|raw)$/,''),{resolveDir:args.resolveDir,kind:args.kind})).path,namespace:'inline'}))
 b.onLoad({filter:/.*/,namespace:'inline'},async args=>({contents:JSON.stringify(args.path.endsWith('.svg')?'data:image/svg+xml,'+encodeURIComponent((await readFile(args.path,'utf8')).replaceAll('"',"'")):await readFile(args.path,'utf8')),loader:'json'}))
}}
await build({stdin:{resolveDir:root,contents:`
import {contextBridge,ipcRenderer} from 'electron'
import {BrowserAppView} from './src/preload/browser/view'
import {ScheduledTaskView} from './src/preload/scheduled/view'
import {scheduledStyles} from './src/preload/scheduled/style'
document.addEventListener('DOMContentLoaded',()=>{
 let surface='browser',rows=[],start=0
 const now=()=>performance.now()-start
 const bridge={subscribe:fn=>{const listener=(_,state)=>fn(state);ipcRenderer.on('browser-app:state',listener);return()=>ipcRenderer.removeListener('browser-app:state',listener)},source:async()=>{},request:async(method,input={})=>{const at=now(),result=await ipcRenderer.invoke('browser-app:request',method,input);if(start)rows.push({stage:method,at,ms:now()-at,...(method==='capture'?{mime:result?.slice(0,22)}:{}),...(method==='layout'?{visible:input.visible}:{})});return result}}
 const host={register:(_,el)=>document.body.append(el),open:()=>surface='browser',close:()=>surface='',current:()=>surface?{surface}:undefined}
 const view=new BrowserAppView(document,bridge,host),scheduled=new ScheduledTaskView(document,{}),style=document.createElement('style');style.textContent=scheduledStyles;document.head.append(style)
 const paint=view.nextPaint.bind(view);view.nextPaint=async()=>{const at=now();await paint();if(start)rows.push({stage:'paint',at,ms:now()-at})}
 const decode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=async function(){const at=now();await decode.call(this);if(start)rows.push({stage:'decode',at,ms:now()-at})}
 const anchor=document.createElement('button');anchor.textContent='Synthetic sidebar More';anchor.style.cssText='position:fixed;left:12px;top:200px;width:36px;height:36px';document.body.append(anchor)
 const begin=()=>{rows=[];start=performance.now()}
 const wait=async condition=>{for(let i=0;i<200;i++){if(condition())return;await new Promise(r=>setTimeout(r,10))}throw Error('Overlay readiness timeout')}
 contextBridge.exposeInMainWorld('qa',{
  open:()=>view.open('synthetic-overlay-session'),close:()=>view.close(),dismiss:()=>{scheduled.closeMenu();view.dismiss()},
  show:async panel=>{begin();await view.show(panel);return{kind:panel,total:now(),presented:view.panelPresented,rows}},
  global:async()=>{begin();scheduled.showMenu(anchor,[{label:'Plugins',run:()=>{}},{label:'Scheduled tasks',run:()=>{}}]);const popup=scheduled.menu,initial=getComputedStyle(popup).visibility;await wait(()=>!popup.isConnected||getComputedStyle(popup).visibility==='visible');return{kind:'sidebar-more',initial,total:now(),presented:popup.isConnected&&getComputedStyle(popup).visibility==='visible',rows}},
  cancel:()=>{scheduled.showMenu(anchor,[{label:'Cancelled menu',run:()=>{}}]);scheduled.closeMenu()},
  clean:()=>!document.querySelector('.st-menu,.eb-page-image'),
 })
})`},bundle:true,platform:'node',format:'cjs',outfile:preload,external:['electron'],plugins:[inline],logLevel:'silent'})
await build({stdin:{resolveDir:root,contents:`
import {app,BrowserWindow,ipcMain,session,webContents,nativeImage} from 'electron'
import {registerBrowserApp} from './src/main/browser/service'
import {writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
app.setPath('userData',${JSON.stringify(join(scratch,'profile'))})
const delay=ms=>new Promise(r=>setTimeout(r,ms)),samples=[];let win,api
const until=async(condition,label)=>{for(let i=0;i<200;i++){if(await condition())return;await delay(10)}throw Error('Timeout: '+label)}
const ui=code=>win.webContents.executeJavaScript(code)
;(async()=>{
 await app.whenReady()
 app.on('session-created',s=>s.protocol.handle('https',()=>new Response('<!doctype html><title>Overlay handoff</title><style>body{font:24px system-ui;background:#c7dff5}section{height:2400px}</style><h1>Controlled research page</h1><section>Only synthetic content.</section>',{headers:{'content-type':'text/html'}})))
 win=new BrowserWindow({width:1280,height:900,show:false,webPreferences:{preload:${JSON.stringify(preload)},sandbox:true,contextIsolation:true,nodeIntegration:false}})
 api=registerBrowserApp({ipcMain,getMainWindow:()=>win,root:${JSON.stringify(join(scratch,'state'))},materialDirectory:async()=>${JSON.stringify(join(scratch,'materials'))}})
 await win.loadURL('data:text/html,'+encodeURIComponent('<main class="pI_x6G_centerCol" style="position:fixed;left:64px;right:24px;top:10px;bottom:10px"></main>'))
 win.show();app.focus({steal:true});win.focus()
 await until(()=>ui('!!window.qa'),'preload ready');await ui('qa.open()')
 const id=api.snapshot().activeId;await api.request('navigate',{id,url:'https://overlay-handoff.example.test/'})
 await until(()=>api.snapshot().tabs.some(t=>t.id===id&&!t.loading&&t.title==='Overlay handoff'),'synthetic navigation')
 const page=webContents.getAllWebContents().find(w=>w.getURL()==='https://overlay-handoff.example.test/')
 assert.ok(page,'real native webpage');await page.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await delay(150)
 for(let cycle=0;cycle<3;cycle++){
  if(cycle){await ui('qa.close()');await delay(30);await ui('qa.open()');await delay(60)}
  const png=await api.request('capture',{id}),jpeg=await api.request('capture',{id,purpose:'overlay'})
  assert.ok(png.startsWith('data:image/png;base64,'),'default screenshot stays PNG');assert.ok(jpeg.startsWith('data:image/jpeg;base64,'),'only overlay screenshot uses JPEG')
  assert.ok(!nativeImage.createFromDataURL(jpeg).isEmpty(),'overlay JPEG decodes')
  for(const panel of ['bookmarks','menu']){
   page.focus();const sample=await ui('qa.show('+JSON.stringify(panel)+')');assert.equal(sample.presented,true,'browser popup presented');assert.ok(sample.rows.some(r=>r.stage==='capture'&&r.mime.startsWith('data:image/jpeg')),'real overlay capture route');samples.push({cycle,...sample});await ui('qa.dismiss()');await until(()=>ui('qa.clean()'),'browser cover released')
  }
  page.focus();const sample=await ui('qa.global()');assert.equal(sample.initial,'hidden','global menu is hidden before native preflight');assert.equal(sample.presented,true,'global menu presented');assert.ok(win.contentView.children.every(v=>!v.webContents||v.webContents!==page||!v.getVisible()),'native webpage hidden before shared menu');samples.push({cycle,...sample});await ui('qa.dismiss()');await until(()=>ui('qa.clean()'),'external cover released')
 }
 await ui('qa.cancel()');await delay(150);assert.equal(await ui('qa.clean()'),true,'cancelled global menu does not revive')
 const report={electron:process.versions.electron,firstActivationAndReturnCapture:true,defaultPng:true,overlayJpeg:true,sharedMenuPreflight:true,cancelledMenu:true,samples}
 await writeFile(${JSON.stringify(join(output,'report.json'))},JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));api.dispose();win.destroy();app.exit(0)
})().catch(error=>{console.error(error);api?.dispose();win?.destroy();app.exit(1)})`},bundle:true,platform:'node',format:'cjs',outfile:entry,external:['electron'],logLevel:'silent'})
const code=await new Promise((done,reject)=>{
 const child=spawn(require('electron'),[entry],{env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:'inherit'}),timer=setTimeout(()=>child.kill('SIGTERM'),30000)
 child.on('error',reject);child.on('exit',(code,signal)=>{clearTimeout(timer);if(signal)console.error('Native overlay check terminated:',signal);done(code??1)})
})
console.log('Overlay evidence:',output)
if(code!==0)process.exitCode=code
