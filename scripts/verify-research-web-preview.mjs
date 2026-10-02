// Isolated Chromium preview: synthetic mail only, no shared profile or network service.
import {createRequire} from 'node:module';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
const root=process.cwd();
const require=createRequire(root+'/package.json'),{build}=require('esbuild');
const output=resolve(process.env.SHERLOCK_TEST_OUTPUT||'output/native-preview-focused');await mkdir(output,{recursive:true});
const scratch=await mkdtemp(join(tmpdir(),'ework-preview-fit-')),entry=join(scratch,'fixture.cjs');
await build({stdin:{resolveDir:root,contents:`
import {app,BrowserWindow,nativeImage} from 'electron';
import {createServer} from 'node:http';import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
import {registerResearchNativeWeb} from './src/main/state/research-native-web';
import {ResearchLinkFrameRegistry} from './src/main/state/research-link-frame';
app.setPath('userData',${JSON.stringify(join(scratch,'profile'))});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let server,win;
(async()=>{await app.whenReady();server=createServer((req,res)=>{res.setHeader('content-type','text/html');
if(req.url==='/preview'){res.end('<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}article{min-width:600px;height:400px;background:#dbeafe}</style><article>合成正文 · 完整宽度验证</article>');return}
res.end('<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}section{display:grid;grid-template-columns:300px minmax(0,1fr);height:100%}aside,main{overflow-y:auto}aside div{height:30px}iframe{border:0;width:100%;height:400px}</style><section><aside>'+Array.from({length:450},(_,i)=>'<div>合成条目 '+i+'</div>').join('')+'</aside><main><iframe src="/preview"></iframe></main></section>')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
win=new BrowserWindow({width:1300,height:800,show:false,webPreferences:{nodeIntegration:false,contextIsolation:true}});await win.loadURL('data:text/html,fixture');win.showInactive();
const registry=new ResearchLinkFrameRegistry(),handlers=new Map(),native=registerResearchNativeWeb({registry,getMainWindow:()=>win,ipcMain:{removeHandler:()=>{},handle:(n,f)=>handlers.set(n,f)}});
const identity={sessionId:'synthetic',nodeId:'long-preview',url:'http://127.0.0.1:'+server.address().port+'/'};registry.authorize(identity);
const call=value=>handlers.get('research:native-web:update')({sender:win.webContents,senderFrame:win.webContents.mainFrame},value);
let request={...identity,bounds:{x:0,y:0,width:720,height:500},layoutSize:{width:720,height:500},active:true,scale:1,radius:0,imageRevision:0},metrics,state;
await call(request);const wc=native.contents(identity);
const settle=async()=>{for(let i=0;i<80;i++){state=await call(request);try{metrics=await wc.executeJavaScript('(()=>{const f=document.querySelector("iframe"),w=f.contentWindow;return{viewport:innerWidth,previewWidth:w.innerWidth,content:w.document.querySelector("article").getBoundingClientRect().width}})()');if(!state.snapshotPending&&(metrics.previewWidth>=metrics.content-2||state.pageFit?.zoom===.75))return}catch{}await delay(80)}throw Error('preview did not fit '+JSON.stringify(metrics))};
await settle();assert.ok(state.pageFit.zoom<1,'same-origin preview causes fit after long list');const narrow={...metrics,zoom:state.pageFit.zoom};
request={...request,bounds:{...request.bounds,width:1200},layoutSize:{...request.layoutSize,width:1200}};await settle();assert.equal(wc.getZoomFactor(),1,'wide component returns to natural size');const wide={...metrics,zoom:wc.getZoomFactor()};
request={...request,active:false,bounds:{...request.bounds,width:420,height:300},layoutSize:{width:420,height:300}};await settle();assert.equal(state.pageFit.zoom,.75,'hidden small page keeps readable text');const capturedImage=nativeImage.createFromDataURL(state.image),imageSize=capturedImage.getSize(),pixels=capturedImage.toBitmap(),pixelOffset=(100*420+300)*4;assert.ok(Math.abs(pixels[pixelOffset]-250)<=8&&Math.abs(pixels[pixelOffset+1]-234)<=2&&Math.abs(pixels[pixelOffset+2]-219)<=2,'preview must repaint its new sidebar width, not crop the old page');assert.equal(win.contentView.children.find(v=>v.webContents===wc).getVisible(),false,'hidden capture never exposes a live overlay');assert.deepEqual(imageSize,{width:420,height:300},'resized fallback keeps actual aspect ratio');
const hidden={...metrics,zoom:state.pageFit.zoom,imageSize};
request={...request,bounds:{...request.bounds,width:1500,height:900},layoutSize:{width:1500,height:900}};await settle();const grownImage=nativeImage.createFromDataURL(state.image),grownSize=grownImage.getSize();assert.deepEqual(grownSize,{width:1500,height:900},'hidden enlarged preview must include the whole new surface');const grownPixels=grownImage.toBitmap(),grownOffset=(200*1500+1400)*4;assert.ok(Math.abs(grownPixels[grownOffset]-250)<=8&&Math.abs(grownPixels[grownOffset+1]-234)<=2&&Math.abs(grownPixels[grownOffset+2]-219)<=2,'enlarged preview paints content beyond its previous right edge');
const report={grownSize,narrow,wide,hidden,longRows:450};await writeFile(${JSON.stringify(join(output,'report.json'))},JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().then(()=>{server.closeAllConnections();server.close();app.exit(0)}).catch(error=>{console.error(error);server?.closeAllConnections();server?.close();app.exit(1)});
`},bundle:true,platform:'node',format:'cjs',outfile:entry,external:['electron']});
const code=await new Promise((done,error)=>{const child=spawn(require('electron'),[entry],{env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:'inherit'});child.on('error',error);child.on('exit',done)});if(code)process.exit(code);
