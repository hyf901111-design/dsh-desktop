// Focused visual/interaction harness: renders production update/About modules with controlled bridge events.
// It never downloads, installs, or publishes an application update.
import {build} from 'esbuild'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createServer} from 'node:http'
import {join} from 'node:path'
import assert from 'node:assert/strict'
const root=process.cwd(),out=join(root,'output/figma-updates-20260910')
await mkdir(out,{recursive:true})
const entry=String.raw`
import React from 'react';import * as jsx from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';
import {SidebarUpdateControl} from './src/preload/sidebar-update-control.ts';
import {mountResearchBoardNotifications} from './src/preload/research-board-notifications-ui.ts';
import {buildSherlockAboutInfo} from './src/preload/about-info.ts';
let aboutListener, boardListener;
let update={phase:'idle',currentVersion:'0.9.5',availableVersion:'0.9.6',manual:true};
let state={eventSeq:1,account:{status:'signed-in',generation:1,user:{userId:'self',username:'我'}},notifications:{notifications:[],unreadCount:0,pendingCount:0},boards:[],collaborators:[],presences:[]};
const control=new SidebarUpdateControl(document,'zh',{download:()=>{window.downloads++;window.setUpdate('downloading')},install:()=>{throw Error('unexpected second installation')},retry:()=>window.setUpdate('available')});
window.downloads=0;
window.sherlockAbout={getInfo:async()=>buildSherlockAboutInfo('0.9.5','zh'),getUpdateStatus:async()=>update,onUpdateStatusChanged:fn=>{aboutListener=fn;return()=>{}},checkForUpdates:async()=>{window.setUpdate('available');return update},downloadUpdate:async()=>{window.downloads++;window.setUpdate('downloading');return update}};
const bridge={getSnapshot:async()=>state,subscribe:fn=>{boardListener=fn;return()=>{}},invoke:async(action,input)=>{if(action==='invitation.respond'){state.notifications.notifications[0].invitation.status=input.decision==='accept'?'accepted':'declined';return {ok:true,value:{invitation:state.notifications.notifications[0].invitation}}}return {ok:true,value:{}}}};
mountResearchBoardNotifications(document,bridge);
window.invite=()=>{state={...state,eventSeq:2,notifications:{unreadCount:1,pendingCount:1,notifications:[{notificationId:'test-invite',eventVersion:1,type:'invitation',boardId:'board-1',boardTitle:'新能源汽车产业研究',actor:{userId:'chen',username:'陈思远'},createdAt:Date.now(),readAt:null,invitation:{invitationId:'invite-1',version:1,status:'pending',role:'editor'}}]}};boardListener?.({type:'state',state})};
window.setUpdate=phase=>{update={...update,phase,percent:64,transferredBytes:76800000,totalBytes:120000000,bytesPerSecond:3600000};control.render(update);aboutListener?.(update)};
function fake(){let f;f=new Proxy(function(){},{get:()=>f,apply:()=>f,construct:()=>({})});return f}
window.__ModuleLoader__={load:descriptor=>{const bundle=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:fake());const copy={'about.nav':'关于','about.version':'当前版本','about.changelog':'更新日志','about.tagline':'探索更远，洞见更深','about.current':'当前版本','about.check':'检查更新','about.checking':'正在检查最新版本…','about.checkingButton':'检查中…','about.verifying':'正在校验更新文件','about.verifyingButton':'校验中…','about.autoRestart':'正在校验更新文件，完成后将自动重启','about.downloadStatus':'正在下载更新','about.downloadingButton':'下载中 {percent}%','about.updateAvailable':'发现新版本 {version}','about.download':'更新'};createRoot(document.getElementById('about')).render(React.createElement(bundle.SherlockAboutSection,{t:key=>copy[key]??key}));}};
window.setUpdate('available');
`
const bundle=await build({stdin:{contents:entry,resolveDir:root,loader:'ts'},bundle:true,format:'iife',platform:'browser',write:false})
const settings=await readFile('node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js','utf8')
const server=createServer(async(req,res)=>{try{if(req.url==='/harness.js'){res.setHeader('Content-Type','application/javascript');res.end(bundle.outputFiles[0].text)}else if(req.url==='/settings.js'){res.setHeader('Content-Type','application/javascript');res.end(settings)}else if(req.url==='/font.woff2'){res.setHeader('Content-Type','font/woff2');res.end(await readFile('build/fonts/NotoSansSC.woff2'))}else if(req.url==='/sherlock-logo.svg'){res.setHeader('Content-Type','image/svg+xml');res.end(await readFile('build/sherlock-logo.svg').catch(()=>readFile('node_modules/@deepseek-ai/dsh-web-frontend/dist/sherlock-logo.svg')))}else res.end(`<!doctype html><meta charset="utf-8"><style>@font-face{font-family:'Noto Sans SC';src:url('/font.woff2');font-weight:100 900}*{box-sizing:border-box}body{margin:0;font-family:'Noto Sans SC',sans-serif;background:#e5e5e5}body[data-ds-dark-theme]{background:#212223}aside[data-dsh-sidebar-root]{position:fixed;inset:0 auto 0 0;width:280px;background:rgba(220,220,220,.5)}body[data-ds-dark-theme] aside[data-dsh-sidebar-root]{background:rgba(22,22,22,.7)}footer{position:absolute;bottom:0;height:56px;left:14px;right:14px;display:flex;align-items:center;justify-content:space-between}#about{margin-left:280px;padding:48px 80px 32px;min-height:900px;background:#f1f1f1}body[data-ds-dark-theme] #about{background:#292a2d}body[data-invitation] #about{visibility:hidden}</style><aside data-dsh-sidebar-root><footer data-dsh-sidebar-footer><span>我</span><span data-research-board-bell-host></span></footer></aside><main id="about"></main><script src="/harness.js"></script><script src="/settings.js"></script>`) }catch(e){res.statusCode=500;res.end(String(e))}})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const {default:{chromium}}=await import('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js')
const browser=await chromium.launch({executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
const page=await browser.newPage({viewport:{width:1380,height:900},deviceScaleFactor:1})
const errors=[];page.on('pageerror',error=>errors.push(error.message))
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('.sherlock-about').waitFor();await page.evaluate(()=>document.fonts.ready)
 const results=[]
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>theme==='dark'?document.body.setAttribute('data-ds-dark-theme',''):document.body.removeAttribute('data-ds-dark-theme'),theme)
  for(const phase of ['checking','available','downloading','downloaded']){
   await page.evaluate(phase=>window.setUpdate(phase),phase)
   await page.locator(`[data-about-update-phase=${phase}]`).waitFor()
   if(phase==='downloaded'){assert.equal(await page.locator('[data-about-install-update]').count(),0);assert.equal(await page.locator('#sherlock-sidebar-update-panel button').count(),0)}
   const geometry=await page.locator('#sherlock-sidebar-update-panel').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,blur:getComputedStyle(el).backdropFilter,background:getComputedStyle(el).backgroundColor,font:document.fonts.check('13px "Noto Sans SC"')}))
   results.push({theme,phase,...geometry})
   await page.screenshot({path:join(out,`${theme}-${phase}.png`)})
  }
 }
 await page.evaluate(()=>{window.setUpdate('idle');document.body.setAttribute('data-invitation','');window.invite()})
 await page.locator('.srb-bubble').waitFor()
 await page.screenshot({path:join(out,'dark-invitation.png')})
 await page.locator('.srb-bubble button',{hasText:'接受'}).click()
 await page.getByText('已加入协作看板',{exact:true}).waitFor()
 await page.screenshot({path:join(out,'dark-invitation-accepted.png')})
 assert.deepEqual(errors,[])
 await writeFile(join(out,'results.json'),JSON.stringify({rendering:'production modules; controlled business-state bridge; no real installer invoked',results,errors},null,2))
 console.log(JSON.stringify({output:out,states:results.length+2,results,errors},null,2))
}finally{await browser.close();server.close()}
