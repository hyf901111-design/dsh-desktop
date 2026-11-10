// Isolated native-region verification: synthetic webpage and throwaway profile only.
import {build} from 'esbuild'
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
const root=process.cwd(),require=createRequire(import.meta.url),scratch=await mkdtemp(join(tmpdir(),'browser-region-'))
const evidence=resolve(process.env.BROWSER_APP_EVIDENCE||join(scratch,'evidence'));await mkdir(evidence,{recursive:true})
async function fixture(config){
 const {app,BrowserWindow,WebContentsView,ipcMain,webContents}=require('electron'),assert=require('node:assert/strict'),{writeFile}=require('node:fs/promises')
 app.setPath('userData',config.profile)
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),until=async(fn,label)=>{const end=Date.now()+5000;do{if(await fn())return;await pause(10)}while(Date.now()<end);throw Error('Timeout: '+label)}
 let win,page,overlay;const events=[],checks=[]
 const report=async(error)=>writeFile(config.evidence+'/report.json',JSON.stringify({temporaryProfile:true,electron:process.versions.electron,checks,events,error:error?.stack},null,2))
 try{
  await app.whenReady();ipcMain.on('browser-app:region-action',(_e,value)=>events.push({wire:value}));win=new BrowserWindow({width:840,height:640,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}})
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><style>body{margin:0;background:#f5f5f5}textarea{position:fixed;right:10px;top:30px;width:250px;height:150px}</style><textarea aria-label="right composer">同草稿输入</textarea>'))
  page=new WebContentsView({webPreferences:{partition:'browser-region-original',sandbox:true,contextIsolation:true,nodeIntegration:false}});page.setBackgroundColor('#267253');page.setBounds({x:0,y:0,width:520,height:580});win.contentView.addChildView(page);page.setVisible(false)
  await page.webContents.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><style>html,body{margin:0;background:rgb(38,114,83);color:white;height:100%;font:18px system-ui}button{position:fixed;left:1px;top:1px}h1{margin:150px 30px}</style><button onclick="window.clicked++">真实网页按钮</button><h1>Live original page</h1><script>window.ticks=0;window.clicked=0;setInterval(()=>ticks++,20)</script>'))
  win.show();page.setVisible(true);page.webContents.setBackgroundThrottling(false);app.focus({steal:true});win.focus();await until(()=>win.isFocused(),'isolated verifier window foreground');await until(()=>page.webContents.executeJavaScript('ticks>3'),'original webpage painted before the user opens context menu');await page.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  page.webContents.focus();await page.webContents.capturePage({x:50,y:60,width:180,height:130});checks.push('baseline original page capture before overlay');
  overlay=createBrowserRegionOverlay(config.preload,()=>win,event=>events.push(event))
  assert.equal(await overlay.warm(),true);const prepared=webContents.getAllWebContents().find(contents=>contents.getTitle()==='询问AI');assert.ok(prepared);assert.equal(win.contentView.children.some(view=>view.webContents===prepared),false);assert.equal(webContents.getFocusedWebContents(),page.webContents);checks.push('prewarming creates one hidden ready surface without stealing webpage focus')
  const started=overlay.start({operationId:'native-one',bounds:{x:0,y:0,width:520,height:580},dark:false})
  let surface;await until(()=>{surface=win.contentView.children.find(v=>v!==page&&v.webContents?.getTitle()==='询问AI');return surface?.getVisible()},'transparent native region ready')
  const wc=surface.webContents,dom=code=>wc.executeJavaScript(code),mouse=(type,x,y)=>wc.sendInputEvent({type,x,y,...(type==='mouseMove'?{}:{button:'left',clickCount:1})})
  await until(()=>dom('document.body.dataset.selecting==="true"'),'selecting UI')
  assert.equal(surface.webContents,prepared);assert.equal(await dom('document.querySelector("[data-browser-region-hint]").hidden'),false);wc.debugger.attach('1.3');const ax=(await wc.debugger.sendCommand('Accessibility.getFullAXTree')).nodes;assert.ok(ax.some(node=>node.name?.value==='拖动框选网页内容 · Esc 取消'));await writeFile(config.evidence+'/native-selecting.png',(await wc.capturePage()).toPNG());checks.push('prepared selection exposes a visible accessible ready-to-drag hint')
  mouse('mouseMove',230,190);mouse('mouseDown',230,190);mouse('mouseMove',50,60);mouse('mouseUp',50,60)
  const rect=await started;assert.deepEqual(rect,{x:50,y:60,width:180,height:130});checks.push('native reverse drag uses page viewport DIP')
  assert.equal(page.getVisible(),true);assert.equal(await dom('getComputedStyle(document.body).backgroundColor'),'rgba(0, 0, 0, 0)')
  const image=await page.webContents.capturePage(rect);assert.ok(image.getSize().width>=rect.width);const bitmap=image.toBitmap(),pixel=[...bitmap.subarray(bitmap.length-4,bitmap.length)];assert.deepEqual(pixel.slice(0,3),[83,114,38]);await writeFile(config.evidence+'/original-region.png',image.toPNG());checks.push('capturePage(rect) captures original page pixels without blue selection or popup')
  const state={operationId:'native-one',ownerSessionId:'A',rect,draft:'既有草稿',draftRev:3,phase:'plain',busy:false,canSend:true,sequence:0,syncVersion:0};overlay.showQuestion(state)
  await until(()=>dom('!document.querySelector("[data-browser-region-question]").hidden'),'question popup');assert.equal(await dom('document.querySelector("[data-browser-region-hint]").hidden'),true)
  const before=await page.webContents.executeJavaScript('ticks');await pause(120);assert.ok(await page.webContents.executeJavaScript('ticks')>before+2);assert.equal(await dom('document.querySelectorAll("img,canvas,[data-pin],[data-page]").length'),0);checks.push('original webpage keeps running under transparent controls, no bitmap or pin furniture')
  win.webContents.focus();await win.webContents.executeJavaScript('document.querySelector("textarea").focus()');await pause(80);assert.equal(surface.getVisible(),true);assert.equal(await dom('document.querySelector("textarea").value'),'既有草稿');checks.push('question survives blur to right composer')
  overlay.updateQuestion({...state,draft:'右侧修改',draftRev:4,syncVersion:1});await until(()=>dom('document.querySelector("textarea").value==="右侧修改"'),'composer mirror update')
  wc.focus();mouse('mouseMove',3,3);mouse('mouseDown',3,3);mouse('mouseUp',3,3);await until(()=>!surface.getVisible(),'outside closes overlay');assert.equal(await page.webContents.executeJavaScript('clicked'),0);checks.push('outside click closes without replaying to website')
  const narrow=overlay.start({operationId:'native-narrow',bounds:{x:0,y:0,width:320,height:280},dark:true});await until(()=>surface.getVisible(),'narrow selection');mouse('mouseMove',250,170);mouse('mouseDown',250,170);mouse('mouseMove',310,230);mouse('mouseUp',310,230);const nr=await narrow;assert.ok(nr);overlay.showQuestion({...state,operationId:'native-narrow',rect:nr});await until(()=>dom('!document.querySelector("[data-browser-region-question]").hidden'),'narrow popup');const bounds=await dom('document.querySelector("[data-browser-region-question]").getBoundingClientRect().toJSON()');assert.ok(bounds.x>=8&&bounds.y>=8&&bounds.right<=312&&bounds.bottom<=272);await writeFile(config.evidence+'/native-narrow.png',(await wc.capturePage()).toPNG());checks.push('320x280 native popup stays within physical surface')
  overlay.cancel();await report();console.log(JSON.stringify({evidence:config.evidence,checks},null,2));overlay.dispose();win.destroy();app.exit(0)
 }catch(error){await report(error);console.error(error);overlay?.dispose();win?.destroy();app.exit(1)}
}
const entry=join(scratch,'main.cjs')
await build({stdin:{resolveDir:root,contents:`import {createBrowserRegionOverlay} from './src/main/browser/region-overlay';(${fixture.toString()})(${JSON.stringify({profile:join(scratch,'profile'),preload:join(root,'src/preload/browser/region-preload.cjs'),evidence})});`},bundle:true,platform:'node',format:'cjs',outfile:entry,external:['electron'],logLevel:'silent'})
const child=spawn(require('electron'),[entry],{env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:'inherit'}),timer=setTimeout(()=>child.kill('SIGTERM'),45000)
const code=await new Promise(resolve=>child.once('exit',resolve));clearTimeout(timer);process.exitCode=code??1
