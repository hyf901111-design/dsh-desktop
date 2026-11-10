// Two separate Electron processes, one temporary profile, and a loopback HTTPS site.
// Uses synthetic fixture data only. Never opens or reads an existing app profile.
// Run: node scripts/verify-browser-login-retention-native.mjs
// Optional diagnostic: --flush-before-quit (does not change the product service).
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {spawn,spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises'
import {createServer} from 'node:https'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {dirname,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const require=createRequire(import.meta.url)
const scratch=await mkdtemp(join(tmpdir(),'odyssey-browser-login-retention-'))
const output=resolve(process.env.BROWSER_LOGIN_RETENTION_EVIDENCE||join(scratch,'evidence'))
const profile=join(scratch,'profile'),entry=join(scratch,'fixture.cjs')
const flushBeforeQuit=process.argv.includes('--flush-before-quit')
const hostname='login-retention.example.test'
await mkdir(output,{recursive:true})
await mkdir(profile,{recursive:true})
const keyPath=join(scratch,'localhost-key.pem'),certPath=join(scratch,'localhost-cert.pem')
const certCommand=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',keyPath,'-out',certPath,'-subj','/CN='+hostname],{encoding:'utf8'})
assert.equal(certCommand.status,0,'temporary fixture TLS certificate generated')
const [key,cert,serviceSource]=await Promise.all([readFile(keyPath),readFile(certPath),readFile(join(repo,'src/main/browser/service.ts'))])
const requests=[],logins=[]
let shortCookieExpiresAt=0
const page=(body)=>`<!doctype html><meta charset="utf-8"><title>Login retention fixture</title>${body}`
const server=createServer({key,cert},async(req,res)=>{
  try{
    const url=new URL(req.url,'https://127.0.0.1')
    const scope=url.searchParams.get('case')==='private'?'private':'normal'
    const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(row=>row.trim().split('=')))
    requests.push({method:req.method,path:url.pathname,phase:url.searchParams.get('phase'),case:scope,
      remembered:cookies['__Host-remembered']==='synthetic-'+scope,
      sessionOnly:cookies['__Host-session_only']==='synthetic-'+scope,
      shortLived:!!cookies['__Host-short_lived']})
    res.setHeader('Cache-Control','no-store')
    if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return}
    if(url.pathname==='/login'&&req.method==='POST'){
      let body='';for await(const chunk of req)body+=chunk
      const fields=new URLSearchParams(body)
      assert.equal(fields.get('username'),'fixture-user')
      assert.equal(fields.get('password'),'fixture-password')
      const remember=fields.get('remember')==='on'
      logins.push({case:scope,rememberChecked:remember,syntheticAccount:true})
      const headers=[`__Host-session_only=synthetic-${scope}; Path=/; Secure; HttpOnly; SameSite=Lax`]
      if(remember){
        headers.push(`__Host-remembered=synthetic-${scope}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600`,
          `readable_remembered=synthetic-${scope}; Path=/; Secure; SameSite=Lax; Expires=${new Date(Date.now()+3600000).toUTCString()}`,
          '__Host-short_lived=synthetic-expiring; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=5',
          'already_expired=synthetic-expired; Path=/; Secure; Max-Age=0',
          'deleted_remembered=synthetic-deleted; Path=/; Secure; Max-Age=3600')
        shortCookieExpiresAt=Math.max(shortCookieExpiresAt,Date.now()+5000)
      }
      res.writeHead(200,{'Set-Cookie':headers,'Content-Type':'application/json'});res.end('{"ok":true}');return
    }
    if(url.pathname==='/delete-one'){
      res.writeHead(200,{'Set-Cookie':'deleted_remembered=; Path=/; Secure; Max-Age=0','Content-Type':'application/json'});res.end('{"ok":true}');return
    }
    if(url.pathname==='/protected'){
      const remembered=cookies['__Host-remembered']==='synthetic-'+scope
      res.writeHead(200,{'Content-Type':'text/html'})
      res.end(page(`<main data-remembered="${remembered}">${remembered?'Remembered synthetic account':'Sign in required'}</main>`));return
    }
    res.writeHead(200,{'Content-Type':'text/html'})
    res.end(page(`<form data-case="${scope}"><label>Account<input name="username" value="fixture-user"></label><label>Password<input type="password" name="password" value="fixture-password"></label><label><input name="remember" type="checkbox">Remember login</label><button>Sign in</button></form><script>
      const form=document.querySelector('form');
      form.addEventListener('submit',async event=>{event.preventDefault();try{
        const scope=form.dataset.case;
        const response=await fetch('/login?case='+scope+'&phase=write',{method:'POST',body:new URLSearchParams(new FormData(form))});
        if(!response.ok)throw Error('fixture login failed');
        localStorage.setItem('fixture-account','synthetic-'+scope);
        sessionStorage.setItem('fixture-session','synthetic-'+scope);
        await new Promise((resolve,reject)=>{const request=indexedDB.open('fixture-account',1);request.onupgradeneeded=()=>request.result.createObjectStore('account');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('account','readwrite');tx.objectStore('account').put('synthetic-'+scope,'remembered');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}});
        await fetch('/delete-one?case='+scope+'&phase=write');
        location.href='/protected?case='+scope+'&phase=write';
      }catch(error){document.body.dataset.fixtureError=error.message}});
      </script>`))
  }catch(error){res.writeHead(500);res.end('Fixture assertion failed');console.error(error.message)}
})
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
const origin=`https://${hostname}:${server.address().port}`
const config={profile,output,origin,hostname,pem:cert.toString(),stateRoot:join(scratch,'browser-state'),flushBeforeQuit}

async function electronWorker(config){
  app.setPath('userData',config.profile)
  app.setPath('sessionData',config.profile)
  // The product intentionally rejects localhost URLs; map only this reserved
  // fixture hostname to loopback without relaxing product address validation.
  app.commandLine.appendSwitch('host-resolver-rules','MAP '+config.hostname+' 127.0.0.1')
  app.commandLine.appendSwitch('no-proxy-server')
  const phase=process.argv.at(-1),configured=new Set(),quitEvents=[]
  const report={phase,pid:process.pid,electron:process.versions.electron,chromium:process.versions.chrome,flushBeforeQuit:config.flushBeforeQuit,quitEvents}
  let externalRequestsBlocked=0
  const configure=s=>{
    if(configured.has(s))return;configured.add(s)
    s.setCertificateVerifyProc((request,callback)=>callback(request.hostname===config.hostname&&request.certificate.data.trim()===config.pem.trim()?0:-2))
    s.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>{
      const permitted=new URL(details.url).origin===config.origin
      if(!permitted)externalRequestsBlocked++
      callback({cancel:!permitted})
    })
  }
  app.on('session-created',configure)
  app.on('before-quit',()=>quitEvents.push('before-quit'))
  app.on('will-quit',()=>{
    quitEvents.push('will-quit');report.externalRequestsBlocked=externalRequestsBlocked
    writeFileSync(join(config.output,phase+'.json'),JSON.stringify(report,null,2))
  })
  await app.whenReady()
  configure(session.defaultSession)
  const win=new BrowserWindow({width:900,height:700,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}})
  await win.loadURL('data:text/html,<title>Isolated login fixture shell</title>')
  const handlers=new Map()
  const api=registerBrowserApp({ipcMain:{handle:(name,fn)=>handlers.set(name,fn),removeHandler:name=>handlers.delete(name)},getMainWindow:()=>win,root:config.stateRoot,materialDirectory:async()=>config.output,findPreload:join(config.output,'no-preload.cjs')})
  const request=(method,input={})=>handlers.get('browser-app:request')({sender:win.webContents,senderFrame:win.webContents.mainFrame},method,input)
  await request('layout',{active:true,sessionId:'synthetic-login-retention',visible:false})
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
  const until=async(test,label)=>{for(let i=0;i<200;i++){if(await test())return;await delay(25)}throw Error('Timeout: '+label)}
  const navigate=async(id,path)=>{
    const target=config.origin+path
    await request('navigate',{id,url:target})
    await until(()=>{const tab=api.snapshot().tabs.find(row=>row.id===id);if(tab?.error)throw Error('Fixture navigation: '+tab.error);return tab?.url===target&&!tab.loading},'fixture navigation')
    const wc=webContents.getAllWebContents().find(row=>row.getURL()===target)
    assert.ok(wc,'real BrowserApp WebContentsView')
    return wc
  }
  const inspect=async(wc,scope)=>{
    const stored=await wc.session.cookies.get({url:config.origin})
    const find=name=>stored.find(cookie=>cookie.name===name)
    return {
      authenticated:await wc.executeJavaScript('document.querySelector("main")?.dataset.remembered === "true"'),
      remembered:find('__Host-remembered')?.value==='synthetic-'+scope,
      rememberedHttpOnly:find('__Host-remembered')?.httpOnly===true,
      rememberedSecure:find('__Host-remembered')?.secure===true,
      rememberedPersistent:find('__Host-remembered')?.session===false,
      rememberedExpiry:find('__Host-remembered')?.expirationDate??null,
      readableRemembered:find('readable_remembered')?.value==='synthetic-'+scope,
      sessionOnly:find('__Host-session_only')?.value==='synthetic-'+scope,
      sessionOnlyHasExpiry:find('__Host-session_only')?.expirationDate!==undefined,
      shortLived:!!find('__Host-short_lived'),alreadyExpired:!!find('already_expired'),deleted:!!find('deleted_remembered'),
      httpOnlyHiddenFromScript:await wc.executeJavaScript('!document.cookie.includes("__Host-remembered=") && !document.cookie.includes("__Host-session_only=")'),
      readableCookieInScript:await wc.executeJavaScript('document.cookie.includes("readable_remembered=")'),
      localStorage:await wc.executeJavaScript('localStorage.getItem("fixture-account") === '+JSON.stringify('synthetic-'+scope)),
      sessionStorage:await wc.executeJavaScript('sessionStorage.getItem("fixture-session") === '+JSON.stringify('synthetic-'+scope)),
      indexedDB:await wc.executeJavaScript(`new Promise((resolve,reject)=>{const request=indexedDB.open('fixture-account',1);request.onupgradeneeded=()=>request.result.createObjectStore('account');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('account','readonly'),read=tx.objectStore('account').get('remembered');read.onsuccess=()=>resolve(read.result===${JSON.stringify('synthetic-'+scope)});read.onerror=()=>reject(read.error);tx.oncomplete=()=>db.close()}})`),
      persistentPartition:wc.session.isPersistent(),storagePathIsTemporary:wc.session.storagePath?.startsWith(config.profile)??false
    }
  }
  const normalId=(await request('snapshot')).activeId
  if(phase==='write'){
    const login=async(id,scope)=>{
      const wc=await navigate(id,'/?case='+scope+'&phase=write')
      await wc.executeJavaScript('document.querySelector("input[name=remember]").click(); document.querySelector("button").click(); true')
      await until(()=>wc.getURL().includes('/protected?case='+scope)&&!wc.isLoading(),'synthetic remembered login')
      return wc
    }
    const normal=await login(normalId,'normal')
    report.normal=await inspect(normal,'normal')
    for(const key of ['authenticated','remembered','rememberedHttpOnly','rememberedSecure','rememberedPersistent','readableRemembered','sessionOnly','shortLived','httpOnlyHiddenFromScript','readableCookieInScript','localStorage','sessionStorage','indexedDB','persistentPartition','storagePathIsTemporary'])assert.equal(report.normal[key],true,'write normal '+key)
    for(const key of ['sessionOnlyHasExpiry','alreadyExpired','deleted'])assert.equal(report.normal[key],false,'write normal '+key)
    const privateId=(await request('new',{private:true})).activeId
    const privateWc=await login(privateId,'private')
    report.private=await inspect(privateWc,'private')
    for(const key of ['authenticated','remembered','rememberedHttpOnly','rememberedSecure','localStorage','sessionStorage','indexedDB'])assert.equal(report.private[key],true,'write private '+key)
    assert.equal(report.private.persistentPartition,false)
    assert.equal(privateWc.session.storagePath,null)
    assert.notEqual(normal.session,privateWc.session)
    report.partitionsIsolated=(await inspect(normal,'normal')).remembered
    assert.equal(report.partitionsIsolated,true)
  }else{
    const normal=await navigate(normalId,'/protected?case=normal&phase=read')
    report.normal=await inspect(normal,'normal')
    for(const key of ['authenticated','remembered','rememberedHttpOnly','rememberedSecure','rememberedPersistent','readableRemembered','httpOnlyHiddenFromScript','readableCookieInScript','localStorage','indexedDB','persistentPartition','storagePathIsTemporary'])assert.equal(report.normal[key],true,'restart normal '+key)
    for(const key of ['sessionOnly','sessionOnlyHasExpiry','shortLived','alreadyExpired','deleted','sessionStorage'])assert.equal(report.normal[key],false,'restart normal '+key)
    const privateId=(await request('new',{private:true})).activeId
    const privateWc=await navigate(privateId,'/protected?case=private&phase=read')
    report.private=await inspect(privateWc,'private')
    for(const key of ['authenticated','remembered','readableRemembered','sessionOnly','shortLived','localStorage','sessionStorage','indexedDB','persistentPartition'])assert.equal(report.private[key],false,'restart private '+key)
    assert.equal(privateWc.session.storagePath,null)
  }
  if(config.flushBeforeQuit){
    const normalSession=session.fromPartition('persist:odyssey-browser-app')
    normalSession.flushStorageData()
    await normalSession.cookies.flushStore()
  }
  // Exercise the product's before-quit disposal and Chromium's normal shutdown.
  // Deliberately avoid app.exit(), flushStore(), and a 30-second wait in baseline mode.
  app.quit()
}

try{
  await build({stdin:{resolveDir:repo,contents:`import {app,BrowserWindow,session,webContents} from 'electron';import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';import {join} from 'node:path';import {registerBrowserApp} from './src/main/browser/service';(${electronWorker.toString()})(${JSON.stringify(config)}).catch(error=>{console.error(error);app.exit(1)});`},bundle:true,platform:'node',format:'cjs',outfile:entry,external:['electron'],logLevel:'silent'})
  const run=async phase=>{
    const result=await new Promise((resolve,reject)=>{
      const child=spawn(require('electron'),[entry,phase],{cwd:repo,env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:['ignore','pipe','pipe']})
      let stdout='',stderr=''
      child.stdout.on('data',value=>stdout+=value)
      child.stderr.on('data',value=>stderr+=value)
      const timer=setTimeout(()=>child.kill('SIGKILL'),30000)
      child.once('error',reject)
      child.once('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal,stdout,stderr})})
    })
    await writeFile(join(output,phase+'.log'),result.stdout+result.stderr)
    assert.equal(result.code,0,phase+' Electron process passed; see '+join(output,phase+'.log'))
    const report=JSON.parse(await readFile(join(output,phase+'.json'),'utf8'))
    assert.deepEqual(report.quitEvents,['before-quit','will-quit'],'graceful full process shutdown')
    return report
  }
  const write=await run('write')
  const remaining=shortCookieExpiresAt-Date.now()+300
  if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining))
  const read=await run('read')
  assert.notEqual(write.pid,read.pid,'writer process fully exited before a new process started')
  assert.equal(read.normal.rememberedExpiry,write.normal.rememberedExpiry,'server cookie expiry preserved exactly')
  assert.equal(logins.length,2,'restart did not submit the login form again')
  assert.ok(logins.every(login=>login.rememberChecked&&login.syntheticAccount))
  const readRequests=requests.filter(row=>row.path==='/protected'&&row.phase==='read')
  assert.equal(readRequests.find(row=>row.case==='normal')?.remembered,true,'persistent HttpOnly cookie actually sent to HTTPS server after restart')
  assert.ok(readRequests.every(row=>!row.sessionOnly&&!row.shortLived),'session and expired cookies not sent on restart')
  assert.equal(readRequests.find(row=>row.case==='private')?.remembered,false,'private login not sent after restart')
  const report={passed:true,normalPersistentLoginSurvivedFullProcessRestart:true,httpOnlySecureCookieSentAfterRestart:true,localStorageAndIndexedDBSurvived:true,privateLoginAndStorageDiscarded:true,sessionCookieDiscarded:true,sessionStorageDiscarded:true,expiredAndDeletedCookiesNotRestored:true,serverExpiryUnchanged:true,explicitFlush:flushBeforeQuit,loginSubmissions:logins,serviceSha256:createHash('sha256').update(serviceSource).digest('hex'),profile,origin,processes:[write.pid,read.pid],electron:read.electron,chromium:read.chromium,scope:'Synthetic loopback HTTPS; graceful quit; same temporary userData/profile. No real account, password manager, SSO, forced termination, or released client acceptance.',sources:['https://www.electronjs.org/docs/latest/api/session#sessionfrompartitionpartition-options','https://www.electronjs.org/docs/latest/api/cookies#cookiesflushstore'],requests}
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify({...report,requests:undefined},null,2))
  console.log('Evidence:',output)
}finally{
  await new Promise(resolve=>server.close(resolve))
}
