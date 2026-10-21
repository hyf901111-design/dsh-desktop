import { beforeAll, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)

// The renderer-initiated navigation exercises Chromium's real reentrancy guard;
// a fake BrowserWindow cannot catch the native CHECK that terminates the app.
describe.skipIf(process.platform !== 'darwin')('search navigation native lifetime', () => {
  let directory: string
  let executable: string
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ework-search-navigation-'))
    executable = require('electron') as string
    await build({ entryPoints: ['src/main/search/browser-search-controller.ts'], bundle: true,
      platform: 'node', format: 'cjs', outfile: join(directory, 'controller.cjs') })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'ework-search-navigation-fixture', main: 'main.cjs' }))
    await writeFile(join(directory, 'main.cjs'), String.raw`
const {app,BrowserWindow}=require('electron');
const {createServer}=require('node:http');
const {appendFileSync}=require('node:fs');
const {join}=require('node:path');
const mode=process.env.EWORK_NAVIGATION_CASE;
const log=value=>{appendFileSync(join(__dirname,mode+'.log'),value+'\n');console.log(value)};
process.on('uncaughtException',error=>{log('APP_ERROR '+error.stack);app.exit(2)});
process.on('unhandledRejection',error=>{log('APP_REJECTION '+error?.stack);app.exit(2)});
log('BOOTSTRAP');
const {BrowserSearchController}=require('./controller.cjs');
app.setPath('userData',join(__dirname,'profile-'+mode));
app.on('window-all-closed',()=>{});
const readyDeadline=setTimeout(()=>{log('READY_TIMEOUT');app.exit(4)},5000);
app.whenReady().then(()=>{
 clearTimeout(readyDeadline);log('READY');app.dock?.hide();let inNavigation=false,created=0;
 const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<p>Owned navigation lifetime fixture</p>')});
 server.listen(0,'127.0.0.1',async()=>{
  const signal=new AbortController();let disposePromise;
  const controller=new BrowserSearchController({createWindow:options=>{
   if(BrowserWindow.getAllWindows().length)throw Error('Previous search renderer was not retired');
   const index=created++,raw=new BrowserWindow(options);let requested='';
   return {webContents:{getURL:()=>requested,stop:()=>{log('STOP inNavigation='+inNavigation);raw.webContents.stop()},executeJavaScript:async script=>{
    if(script.includes('document.body?.innerText'))return {url:requested,title:'fixture lifetime query',text:'owned test document',noResults:false};
    return new Promise(resolve=>{
     raw.webContents.once('did-start-navigation',()=>{
      inNavigation=true;setImmediate(()=>inNavigation=false);log('NAVIGATION '+index);
      if(mode==='abort'&&index===0)signal.abort(new Error('fixture cancellation'));
      else if(mode==='dispose'){disposePromise=controller.dispose();Promise.resolve(disposePromise).then(()=>resolve({url:requested,title:'fixture lifetime query',documentQuery:new URL(requested).searchParams.get('q'),candidates:[],noResults:true}))}
      else resolve({url:requested,title:'fixture lifetime query',documentQuery:new URL(requested).searchParams.get('q'),candidates:[{title:'fixture lifetime query',url:'https://example.com/fixture'}],noResults:false});
     });
     raw.webContents.executeJavaScript("setTimeout(()=>location.href='/next',0)").catch(()=>{});
    });
   }},loadURL:async url=>{requested=url;await raw.loadURL('http://127.0.0.1:'+server.address().port+'/')},show:()=>raw.show(),hide:()=>raw.hide(),setTitle:t=>raw.setTitle(t),isDestroyed:()=>raw.isDestroyed(),destroy:()=>{log('DESTROY '+index);raw.destroy()}};
  }});
  try{
   if(mode==='abort'){
    try{await controller.search('fixture lifetime query',3,signal.signal);throw Error('Cancellation was ignored')}
    catch(error){if(error.name!=='AbortError')throw error;log('ABORTED')}
    const result=await controller.search('fixture lifetime query',3);if(result.sources.length!==1)throw Error('Queue did not recover');log('QUEUE RECOVERED');
   }else if(mode==='dispose'){
    try{await controller.search('fixture lifetime query',3)}catch(error){if(!/本地搜索当前不可用/.test(error.message))throw error}
    await disposePromise;log('DISPOSED');
   }else{const result=await controller.search('fixture lifetime query',3);if(result.sources.length!==1)throw Error('Source was lost');log('RESULT 1')}
   await controller.dispose();if(BrowserWindow.getAllWindows().length)throw Error('Hidden search window leaked');server.close();log('DONE');app.exit(0);
  }catch(error){log('ERROR '+error.stack);app.exit(2)}
 });
 setTimeout(()=>{log('DEADLINE');app.exit(3)},7000);
});`)
  }, 15000)
  // Keep native traces in the system temporary folder for diagnosis.

  it.each(['success', 'abort', 'dispose'])('survives renderer navigation during %s and retires the isolated window', async (mode) => {
    const outcome = await new Promise<{ code: number | null; signal: string | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(executable, [directory], { env: { ...process.env, EWORK_NAVIGATION_CASE: mode } })
      let stdout = '', stderr = ''
      child.stdout.on('data', value => { stdout += value })
      child.stderr.on('data', value => { stderr += value })
      const deadline = setTimeout(() => child.kill('SIGKILL'), 12000)
      child.once('error', error => { clearTimeout(deadline); reject(error) })
      // Exit observes the native process, without waiting for inherited helper
      // pipes after a Chromium CHECK or an unresponsive native app shutdown.
      child.once('exit', (code, signal) => { clearTimeout(deadline); resolve({ code, signal, stdout, stderr }) })
    })
    const trace = await readFile(join(directory, mode + '.log'), 'utf8').catch(() => '')
    expect(outcome, trace + outcome.stderr).toMatchObject({ code: 0, signal: null })
    expect(trace).toContain('NAVIGATION 0')
    expect(trace).toContain('STOP inNavigation=false')
    expect(trace).not.toContain('STOP inNavigation=true')
    expect(trace).toContain('DONE')
    if (mode === 'abort') expect(trace).toContain('QUEUE RECOVERED')
  }, 20000)
})
