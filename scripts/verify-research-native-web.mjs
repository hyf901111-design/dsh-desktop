// Isolated Electron fixture: no shared client build, user profile or external site.
import {build} from 'esbuild'
import {mkdtemp,mkdir,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
const require=createRequire(import.meta.url),output=resolve(process.env.SHERLOCK_TEST_OUTPUT||'output/native-web-focused')
await mkdir(output,{recursive:true})
const scratch=await mkdtemp(join(tmpdir(),'ework-native-web-')),entry=join(scratch,'fixture.cjs')
await build({stdin:{resolveDir:process.cwd(),contents:`
import {app,BrowserWindow} from 'electron';
import {createServer} from 'node:http';import {writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {registerResearchNativeWeb} from './src/main/state/research-native-web';
import {ResearchLinkFrameRegistry} from './src/main/state/research-link-frame';
app.setPath('userData',${JSON.stringify(join(scratch,'profile'))});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let server,win;
(async()=>{await app.whenReady();
 server=createServer((req,res)=>{if(req.url==='/slow.svg'){setTimeout(()=>{if(!res.destroyed){res.setHeader('content-type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg"/>')}},3000);return}res.setHeader('content-type','text/html');
 if(req.url==='/responsive'){res.end('<title>响应式网页核验</title><meta name="viewport" content="width=device-width"><style>body{margin:0;font:16px system-ui}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}article{min-width:0;padding:16px;background:#dbeafe}@media(max-width:640px){main{grid-template-columns:1fr}}</style><main><article>第一栏</article><article>第二栏</article><article>第三栏</article></main>');return}
 res.end('<title>合成邮件适配核验</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fff}.shell{min-width:1000px;height:100%;display:grid;grid-template-rows:48px 1fr;grid-template-columns:200px 300px minmax(500px,1fr);font:20px system-ui}header{grid-column:1/-1;background:#df6827}aside,main,article{padding:16px;border-right:1px solid #ddd;overflow-y:auto}article{background:#dbeafe}b{float:right}</style><section class="shell"><header>合成邮件网页<b>右端</b></header><aside>文件夹<br>收件箱<br>已发送</aside><main>完整邮件列表<br>组件尺寸适配验证<img src="/slow.svg"></main><article>完整邮件正文<br>此页面仅含合成测试内容</article></section>')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
 win=new BrowserWindow({title:'EWork isolated native fixture',width:1000,height:800,show:false,webPreferences:{nodeIntegration:false,contextIsolation:true}});await win.loadURL('data:text/html,<style>body{background:%23151518}</style>');win.showInactive();
 const registry=new ResearchLinkFrameRegistry(),handlers=new Map(),native=registerResearchNativeWeb({registry,getMainWindow:()=>win,ipcMain:{removeHandler:()=>{},handle:(n,f)=>handlers.set(n,f)}});
 const identity={sessionId:'fixture',nodeId:'native',url};registry.authorize(identity);
 const call=value=>handlers.get('research:native-web:update')({sender:win.webContents,senderFrame:win.webContents.mainFrame},value);
 let request={...identity,bounds:{x:50,y:50,width:400,height:500},layoutSize:{width:400,height:500},active:true,scale:1,radius:2,imageRevision:0};
 const started=performance.now();await call(request);const wc=native.contents(identity),view=win.contentView.children.find(v=>v.webContents===wc);
 while(performance.now()-started<2200){await call(request);if(view.getVisible())break;await delay(30)}
 const firstVisible=performance.now()-started;assert.ok(firstVisible<2200,'view appears before slow image finishes');assert.ok(wc.isLoadingMainFrame(),'slow image is still loading when page becomes interactive');
 let size;for(let i=0;i<45;i++){await call(request);size=await wc.executeJavaScript('({viewport:innerWidth,content:document.documentElement.scrollWidth})');if(size.content<=size.viewport+2)break;await delay(40)}
 assert.ok(size.content<=size.viewport+2,JSON.stringify(size));
 // The root cannot see the clipped desktop shell. Its right edge must still fit.
 for(let i=0;i<45;i++){await call(request);size=await wc.executeJavaScript('({viewport:innerWidth,content:document.querySelector(".shell").getBoundingClientRect().right})');if(size.content<=size.viewport+2)break;await delay(40)}
 assert.ok(size.content<=size.viewport+2,JSON.stringify(size));const firstZoom=wc.getZoomFactor();assert.ok(firstZoom<1,'internally clipped desktop page fitted to component width');
 const durations=[];for(const width of [600,480,720]){request={...request,bounds:{...request.bounds,width},layoutSize:{...request.layoutSize,width}};const start=performance.now();await call(request);durations.push(performance.now()-start);assert.equal(view.getBounds().width,width)}
 assert.ok(Math.max(...durations)<100,'geometry IPC finishes independently of capture and inspection');
 for(let i=0;i<30;i++){await call(request);size=await wc.executeJavaScript('({viewport:innerWidth,content:document.querySelector(".shell").getBoundingClientRect().right})');if(size.content<=size.viewport+2)break;await delay(50)}
 assert.ok(size.content<=size.viewport+2);const fittedZoom=wc.getZoomFactor();
 await call({...request,pageZoom:1.2});assert.ok(Math.abs(wc.getZoomFactor()-fittedZoom*1.2)<.005,'manual zoom changes actual Chromium zoom');
 await call({...request,pageZoom:1.2,scale:.8,bounds:{...request.bounds,width:request.bounds.width*.8,height:request.bounds.height*.8}});
 assert.ok(Math.abs(wc.getZoomFactor()-fittedZoom*1.2)<.005,'canvas scale preserves manual zoom');
 await call({...request,pageZoom:1});assert.ok(Math.abs(wc.getZoomFactor()-fittedZoom)<.005,'reset restores fitted page size');
 let firstSnapshot;for(let i=0;i<35;i++){firstSnapshot=await call(request);if(firstSnapshot.imageRevision>0&&!firstSnapshot.snapshotPending)break;await delay(80)}
 assert.ok(firstSnapshot.imageRevision>0,'live view has an initial fallback snapshot');
 const beforeInteraction=firstSnapshot.imageRevision;
 await wc.executeJavaScript("document.body.style.background='#dbeafe'");
 const quietStart=performance.now();while(performance.now()-quietStart<1800){await call(request);await delay(120)}
 assert.equal((await call(request)).imageRevision,beforeInteraction,'interactive browsing does not repeatedly capture the full page');
 let afterInteraction;for(let i=0;i<30;i++){afterInteraction=await call({...request,active:false});if(afterInteraction.imageRevision>beforeInteraction)break;await delay(80)}
 assert.ok(afterInteraction.imageRevision>beforeInteraction,'leaving interaction refreshes the fallback preview');
 const stableBounds=view.getBounds();await call({...request,active:false});await call(request);assert.deepEqual(view.getBounds(),stableBounds);
 await writeFile(${JSON.stringify(join(output,'native-web.png'))},(await win.webContents.capturePage()).toPNG());
 const desktopZoom=wc.getZoomFactor();await wc.loadURL(url+'responsive');request={...request,bounds:{...request.bounds,width:600},layoutSize:{...request.layoutSize,width:600}};
 for(let i=0;i<35;i++){await call(request);if(view.getVisible())break;await delay(40)}
 await delay(100);await call(request);assert.equal(wc.getZoomFactor(),1,'responsive site uses its own layout at normal zoom');
 const responsive=await wc.executeJavaScript('({viewport:innerWidth,columns:getComputedStyle(document.querySelector("main")).gridTemplateColumns.split(" ").length})');assert.equal(responsive.columns,1,'narrow responsive page reflows to one column');
 await writeFile(${JSON.stringify(join(output,'report.json'))},JSON.stringify({firstVisibleMs:firstVisible,slowAssetMs:3000,geometryUpdateMs:durations,firstFitZoom:firstZoom,finalFitZoom:desktopZoom,manualZoomVerified:true,activeCaptureSuppressed:true,leaveCaptureVerified:true,finalViewport:size,selectionPreservesBounds:true,clippedDesktopShellFits:true,responsive},null,2));
 console.log('native focused fixture passed');
})().then(()=>{server.closeAllConnections();server.close();app.exit(0)}).catch(error=>{console.error(error);server?.closeAllConnections();server?.close();app.exit(1)});
`},bundle:true,platform:'node',format:'cjs',outfile:entry,external:['electron']})
const code=await new Promise((done,error)=>{const child=spawn(require('electron'),[entry],{env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:'inherit'});child.on('error',error);child.on('exit',done)})
if(code!==0)process.exit(code||1)
console.log(await readFile(join(output,'report.json'),'utf8'))
