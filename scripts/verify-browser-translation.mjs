// Isolated hidden Electron fixture: synthetic HTTP documents, temporary profile,
// deterministic model endpoint. It never opens the installed client or captures pixels.
import {build} from 'esbuild'
import {mkdtemp,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
const root=process.cwd(),require=createRequire(join(root,'package.json')),scratch=await mkdtemp(join(tmpdir(),'browser-translation-')),entry=join(scratch,'main.cjs'),report=join(scratch,'report.json')
async function fixture(config){
 const {app,BrowserWindow}=require('electron'),{createServer}=require('node:http'),{writeFile}=require('node:fs/promises'),assert=require('node:assert/strict')
 app.setPath('userData',config.profile)
 const checks=[],requests=[],progress=[];let win,server,cross,manager,hold=false,release=[],dynamic=false,captures=0,firstRequestAt=0
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),until=async(fn)=>{const end=Date.now()+4000;while(!await fn()){if(Date.now()>end)throw Error('fixture wait timeout');await pause(10)}}
 const check=async(name,run)=>{const at=performance.now();await run();checks.push({name,ms:Math.round(performance.now()-at)})}
 try{
  await app.whenReady()
  cross=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<p id="foreign">Cross origin message</p>')});await new Promise(resolve=>cross.listen(0,'127.0.0.1',resolve));const other=cross.address().port
  server=createServer(async(req,res)=>{
   if(req.url==='/sherlock/browser/translate'){
    let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);requests.push(input);firstRequestAt||=performance.now()
    if(dynamic){dynamic=false;await win.webContents.executeJavaScript('document.body.insertAdjacentHTML("beforeend","<p id=dynamic>New loaded message</p>")')}
    if(hold)await new Promise(resolve=>release.push(resolve))
    if(!res.destroyed){res.setHeader('content-type','application/json');res.end(JSON.stringify({items:input.items.map(item=>({id:item.id,text:'中文：'+item.text}))}))}return
   }
   res.setHeader('content-type','text/html')
   if(req.url==='/same')return res.end('<p id="same">Same origin message</p>')
   res.end('<!doctype html><style>body{font:14px sans-serif}.far{position:absolute;top:3000px}</style><p class=far>Offscreen first</p><h1 id=heading>Viewport priority</h1><input id=form value="private draft" placeholder="Search mail"><div contenteditable>editor draft</div><code>code unchanged</code><span translate=no>Brand</span><p id=live>Live initial</p>'+Array.from({length:1105},()=>'<p title="Help">Repeated message</p>').join('')+'<p id=long>'+('Long sentence. '.repeat(650))+'</p><iframe src="/same"></iframe><iframe src="http://127.0.0.1:'+other+'/"></iframe>')
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port
  win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false}});win.webContents.capturePage=()=>{captures++;throw Error('translation must never capture')}
  await win.loadURL(base+'/');await until(()=>win.webContents.mainFrame.framesInSubtree.length===3&&!win.webContents.isLoadingMainFrame())
  manager=createBrowserTranslationManager({runtimeUrl:()=>base,onChange:(_id,status)=>progress.push({...status,at:performance.now()})})
  const target=()=>({tabId:'synthetic',url:win.webContents.getURL(),title:'Synthetic',webContents:win.webContents}),js=code=>win.webContents.executeJavaScript(code)
  await check('real main/same-origin/cross-origin frames and 1100+ originals translate without screenshot',async()=>{
   dynamic=true;const at=performance.now(),done=await manager.start(target(),{selection:{provider:'synthetic',model:'deterministic'}})
   assert.equal(done.state,'translated');assert.ok(done.completed>1100);assert.equal(captures,0);assert.ok(done.canRestore)
   assert.equal(await js('document.querySelector("#heading").textContent'),'中文：Viewport priority');assert.equal(await js('document.querySelector("#form").value'),'private draft');assert.equal(await js('document.querySelector("#form").placeholder'),'中文：Search mail')
   for(const frame of win.webContents.mainFrame.framesInSubtree.slice(1))assert.ok((await frame.executeJavaScript('document.body.textContent')).startsWith('中文：'))
   assert.equal(await js('document.querySelector("[contenteditable]").textContent'),'editor draft');assert.equal(await js('document.querySelector("code").textContent'),'code unchanged');assert.equal(await js('document.querySelector("[translate=no]").textContent'),'Brand');assert.equal(await js('document.querySelector("#dynamic").textContent'),'中文：New loaded message')
   assert.equal(requests.flatMap(request=>request.items).filter(item=>item.text==='Repeated message').length,1);assert.ok(requests[0].items.findIndex(item=>item.text==='Viewport priority')<requests[0].items.findIndex(item=>item.text==='Offscreen first'))
   assert.ok(progress.some(status=>status.state==='translating'&&status.completed>0));checks.push({name:'first request latency',ms:Math.round(firstRequestAt-at),total:done.total,frames:done.coverage.frames})
  })
  await check('tab cancellation keeps originals and restore never overwrites site updates',async()=>{
   manager.cancel('synthetic');await js('document.querySelector("#live").textContent="Website live update"');const restored=await manager.restore('synthetic');assert.equal(restored.state,'partial')
   assert.equal(await js('document.querySelector("#heading").textContent'),'Viewport priority');assert.equal(await js('document.querySelector("#live").textContent'),'Website live update')
   for(const frame of win.webContents.mainFrame.framesInSubtree.slice(1))assert.ok(!(await frame.executeJavaScript('document.body.textContent')).startsWith('中文：'));assert.equal(captures,0)
  })
  await check('restore cancels held model batches and late results cannot write',async()=>{
   hold=true;const pending=manager.start(target());await until(()=>release.length>0);await manager.restore('synthetic');for(const done of release.splice(0))done();await pending;hold=false
   assert.equal(await js('document.querySelector("#heading").textContent'),'Viewport priority');assert.equal(manager.status('synthetic').state,'idle');assert.equal(captures,0)
  })
  await check('a same-URL child reload gets a fresh document identity on the next translation',async()=>{
   const frame=win.webContents.mainFrame.framesInSubtree.find(frame=>frame.url.endsWith('/same'));await frame.executeJavaScript('window.beforeReload=true');frame.reload();await until(async()=>{try{return await frame.executeJavaScript('document.readyState==="complete"&&!window.beforeReload')}catch{return false}})
   const result=await manager.start(target());assert.equal(result.state,'translated');assert.equal(await frame.executeJavaScript('document.querySelector("#same").textContent'),'中文：Same origin message');await manager.restore('synthetic');assert.equal(await frame.executeJavaScript('document.querySelector("#same").textContent'),'Same origin message')
  })
  await writeFile(config.report,JSON.stringify({ok:true,checks,requests:requests.length,captures},null,2));console.log(JSON.stringify({ok:true,report:config.report,checks:checks.length}));manager.dispose();win.destroy();server.closeAllConnections();server.close();cross.close();app.quit()
 }catch(error){await writeFile(config.report,JSON.stringify({ok:false,error:String(error?.stack||error),checks},null,2));console.error(error);manager?.dispose();win?.destroy();server?.closeAllConnections();server?.close();cross?.close();app.exit(1)}
}
await build({stdin:{contents:`import {createBrowserTranslationManager} from ${JSON.stringify(join(root,'src/main/browser/translation.ts'))};(${fixture.toString()})(${JSON.stringify({profile:join(scratch,'profile'),report})})`,resolveDir:root,sourcefile:'browser-translation-native.ts',loader:'ts'},outfile:entry,bundle:true,platform:'node',format:'cjs',external:['electron'],logLevel:'silent'})
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const child=spawn(require('electron'),[entry],{env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>{output+=chunk});child.stderr.on('data',chunk=>{output+=chunk})
const timer=setTimeout(()=>child.kill('SIGKILL'),25000),code=await new Promise(resolve=>child.once('exit',resolve));clearTimeout(timer)
console.log(output.trim());console.log('Evidence: '+report);if(code!==0){try{console.error(await readFile(report,'utf8'))}catch{}process.exitCode=1}
