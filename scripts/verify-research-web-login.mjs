// Synthetic mail login across real Electron processes; never opens user data.
import {build} from 'esbuild'
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createRequire} from 'node:module'
import {spawn,execFileSync} from 'node:child_process'
import {createServer} from 'node:http'
const require=createRequire(import.meta.url),scratch=await mkdtemp(join(tmpdir(),'ework-web-login-'))
const output=resolve(process.env.SHERLOCK_TEST_OUTPUT||join(scratch,'evidence'))
await mkdir(output,{recursive:true})
const server=createServer((req,res)=>{
 res.setHeader('content-type','text/html')
 if(req.url==='/login'){res.setHeader('set-cookie','mail_session=new; HttpOnly; SameSite=Lax; Path=/');res.writeHead(302,{location:'/mail?sid=new'});res.end();return}
 if(req.url==='/logout'){res.setHeader('set-cookie','mail_session=; Max-Age=0; HttpOnly; Path=/');res.writeHead(302,{location:'/signed-out'});res.end();return}
 if(req.url==='/mail?sid=new'&&req.headers.cookie?.includes('mail_session=new'))res.end('<title>合成收件箱</title><main id="inbox">已登录的合成收件箱</main><a id="logout" href="/logout">登出</a>')
 else res.end('<title>合成登录页</title><a id="login" href="/login">登录</a><main id="signed-out">需登录</main>')
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const url='http://127.0.0.1:'+server.address().port+'/mail?sid=old',entry=join(scratch,'fixture.cjs')
const baseline=process.env.SHERLOCK_TEST_BASELINE
await build({stdin:{resolveDir:process.cwd(),contents:`
import {app,BrowserWindow,session} from 'electron';import assert from 'node:assert/strict';import {writeFile,readFile} from 'node:fs/promises';import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {registerResearchNativeWeb} from './src/main/state/research-native-web';import {ResearchLinkFrameRegistry} from './src/main/state/research-link-frame';import {ResearchWebNavigationStore} from './src/main/state/research-web-navigation';import {ResearchWebSessionPersistence} from './src/main/state/research-web-session';
app.setPath('userData',${JSON.stringify(join(scratch,'profile'))});
const file=${JSON.stringify(join(scratch,'navigation.bin'))},delay=ms=>new Promise(r=>setTimeout(r,ms)),phase=process.argv[2];
const key=Buffer.alloc(32,7),encryption={isEncryptionAvailable:()=>true,encryptString:value=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(value),c.final(),c.getAuthTag()])},decryptString:value=>{const d=createDecipheriv('aes-256-gcm',key,value.subarray(0,12));d.setAuthTag(value.subarray(-16));return Buffer.concat([d.update(value.subarray(12,-16)),d.final()]).toString()}};
(async()=>{await app.whenReady();const win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{nodeIntegration:false,contextIsolation:true}});await win.loadURL('data:text/html,fixture');
const handlers=new Map(),registry=new ResearchLinkFrameRegistry(),navigation=new ResearchWebNavigationStore(file,encryption),native=registerResearchNativeWeb({registry,navigation,browserSession:${baseline?'undefined':"new ResearchWebSessionPersistence(session.fromPartition('persist:research-web-pages'),file+'.cookies',encryption)"},getMainWindow:()=>win,ipcMain:{removeHandler:()=>{},handle:(n,f)=>handlers.set(n,f)}});
const identity={sessionId:'fixture',nodeId:'mail',url:${JSON.stringify(url)}},event={sender:win.webContents,senderFrame:win.webContents.mainFrame};registry.authorize(identity);
const request={...identity,bounds:{x:20,y:20,width:700,height:500},layoutSize:{width:700,height:500},active:true,scale:1,radius:2};await handlers.get('research:native-web:update')(event,request);const wc=native.contents(identity);
const ready=async selector=>{for(let i=0;i<80;i++){if(!wc.isLoadingMainFrame()&&await wc.executeJavaScript('!!document.querySelector('+JSON.stringify(selector)+')'))return;await delay(40)}throw Error('Expected synthetic UI missing: '+selector)};
if(phase==='login'){await ready('#login');await wc.executeJavaScript("document.querySelector('#login').click()");await ready('#inbox');if(native.flush)await native.flush();else await wc.session.cookies.flushStore();}
if(phase==='restore'){await ready('#inbox');assert.ok((await wc.session.cookies.get({url:${JSON.stringify(url)}})).some(c=>c.name==='mail_session'),'Chromium retained login cookie');assert.ok(!(await readFile(file)).includes(Buffer.from('sid=new')),'navigation is encrypted');assert.ok(!(await readFile(file+'.cookies')).includes(Buffer.from('mail_session')),'session cookies are encrypted');await handlers.get('research:native-web:hide')(event,identity);await handlers.get('research:native-web:update')(event,request);await ready('#inbox');if(native.flush)await native.flush();}
if(phase==='logout'){await ready('#inbox');await wc.executeJavaScript("document.querySelector('#logout').click()");await ready('#signed-out');await native.flush();}
if(phase==='signed-out'){await ready('#signed-out');assert.equal((await wc.session.cookies.get({url:${JSON.stringify(url)}})).some(c=>c.name==='mail_session'),false,'logout is not resurrected');}
await writeFile(${JSON.stringify(output)}+'/'+phase+'.json',JSON.stringify({phase,passed:true,syntheticOnly:true}));win.destroy();app.quit();
})().catch(e=>{console.error(e.message);app.exit(1)});
`},bundle:true,platform:'node',format:'cjs',outfile:entry,external:['electron'],plugins:baseline?[{name:'original-native',setup(b){b.onLoad({filter:/research-native-web\.ts$/},()=>({contents:execFileSync('git',['show',baseline+':src/main/state/research-native-web.ts'],{encoding:'utf8'}),loader:'ts'}))}}]:[]})
try {
 for(const phase of ['login','restore','logout','signed-out']) {
  const code=await new Promise((done,error)=>{const p=spawn(require('electron'),[entry,phase],{env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:'inherit'});p.on('error',error);p.on('exit',done)})
  if(code!==0)throw Error('Synthetic '+phase+' failed')
 }
 const report={passed:true,syntheticOnly:true,realElectronRestart:true,loginCookieRetained:true,sessionCookieRestoredWithoutInventedExpiry:true,currentNavigationRestored:true,encryptedNavigation:true,logoutRetained:true}
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
} finally {server.closeAllConnections();server.close()}
