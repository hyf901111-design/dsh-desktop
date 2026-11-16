// Bounded, isolated Electron acceptance for real native menu projections.
// Only synthetic content and a temporary profile are used; no installed client is opened.
import {build} from 'esbuild'
import {mkdtemp,mkdir,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'

const root=process.cwd(),require=createRequire(join(root,'package.json'))
const scratch=await mkdtemp(join(tmpdir(),'browser-live-menus-'))
const evidence=resolve(process.env.BROWSER_APP_EVIDENCE||join(scratch,'evidence'))
const preload=join(scratch,'preload.cjs'),entry=join(scratch,'main.cjs')
await mkdir(evidence,{recursive:true})

const inline={name:'inline',setup(b){
 b.onResolve({filter:/\?(inline|raw)$/},async args=>({path:(await b.resolve(args.path.replace(/\?(inline|raw)$/,''),{resolveDir:args.resolveDir,kind:args.kind})).path,namespace:'inline'}))
 b.onLoad({filter:/.*/,namespace:'inline'},async args=>({contents:JSON.stringify(args.path.endsWith('.svg')?'data:image/svg+xml,'+encodeURIComponent((await readFile(args.path,'utf8')).replaceAll('"',"'")):await readFile(args.path,'utf8')),loader:'json'}))
}}

function rendererFixture(){
 window.addEventListener('error',event=>ipcRenderer.send('qa:renderer-error',event.error?.stack||event.message))
 window.addEventListener('unhandledrejection',event=>ipcRenderer.send('qa:renderer-error',String(event.reason?.stack||event.reason)))
 document.addEventListener('focusin',event=>ipcRenderer.send('qa:focus',{tag:event.target.tagName,field:event.target.getAttribute('data-field'),action:event.target.getAttribute('data-action')}),true)
 const focus=HTMLElement.prototype.focus;HTMLElement.prototype.focus=function(...args){ipcRenderer.send('qa:focus-call',{tag:this.tagName,field:this.getAttribute('data-field'),action:this.getAttribute('data-action'),documentFocused:document.hasFocus(),stack:new Error().stack?.split('\n').slice(1,5).join('\n')});return focus.apply(this,args)}
 for(const type of ['pointerdown','keydown','input'])document.addEventListener(type,event=>ipcRenderer.send('qa:source-input',{type,trusted:event.isTrusted,tag:event.target?.tagName,field:event.target?.getAttribute?.('data-field'),key:type==='keydown'?(['Enter','Escape','Tab','ArrowDown','ArrowUp'].includes(event.key)?event.key:'other'):undefined}),true)
 document.addEventListener('DOMContentLoaded',()=>{
  const calls=[],actions=[];let states=0
  const compact=input=>{const {html,css,...metadata}=input;let hash=0;for(let index=0;index<(html?.length||0);index++)hash=(Math.imul(hash,31)+html.charCodeAt(index))|0;return{...metadata,htmlBytes:html?.length,htmlHash:hash,cssBytes:css?.length}}
  const bridge={
   workspacePointerInBar:bounds=>ipcRenderer.invoke('browser-app:request','workspace-pointer-in-bar',{bounds}),
   request:async(method,input={})=>{calls.push({method,input:method==='menu'?compact(input):input,at:performance.now()});return ipcRenderer.invoke('browser-app:request',method,input)},
   subscribe:listener=>{const receive=(_,state)=>{states++;listener(state)};ipcRenderer.on('browser-app:state',receive);return()=>ipcRenderer.removeListener('browser-app:state',receive)},
   subscribeAction:listener=>{const receive=(_,action)=>{actions.push(action);listener(action)};ipcRenderer.on('browser-app:menu-event',receive);return()=>ipcRenderer.removeListener('browser-app:menu-event',receive)},
   source:async()=>{},
  }
  const projection=new NativeBrowserMenuProjection(document,bridge)
  const host=new WorkspaceSurfaceHost(document),view=new BrowserAppView(document,bridge,host)
  ipcRenderer.on('browser-app:shortcut',(_,detail)=>window.dispatchEvent(new CustomEvent('sherlock:browser-shortcut',{detail})))
  const scheduled=new ScheduledTaskView(document,{}),style=document.createElement('style')
  style.textContent=scheduledStyles+'\n[data-workspace-surface-hidden=true]{visibility:hidden!important}'
  document.head.append(style)
  const global=document.createElement('button');global.id='global-more-fixture';global.textContent='Global More';global.style.cssText='position:fixed;left:12px;top:200px;width:36px;height:36px';document.body.append(global)
  let globalAction=0
  global.addEventListener('click',()=>scheduled.showMenu(global,[{label:'Plugins',run:()=>globalAction++},{label:'Scheduled tasks',run:()=>globalAction++}]))
  async function openNotificationCenter(count){
   const host=document.createElement('div')
   host.dataset.researchBoardBellHost=''
   document.querySelector('[data-dsh-sidebar-root]').append(host)
   const notifications=Array.from({length:count},(_,index)=>({
    notificationId:'notice-'+index,eventVersion:1,type:'invitationResult',boardId:'board-'+index,
    boardTitle:'协作看板 '+index,createdAt:Date.now(),readAt:index===0?null:1,
    invitation:{invitationId:'invite-'+index,status:'accepted'}
   }))
   const snapshot={version:1,eventSeq:1,account:{status:'ready',generation:1,user:{userId:'qa',username:'验收'}},
    favorites:[],boards:[],current:null,recoveries:[],notifications:{cursor:1,unreadCount:1,pendingCount:0,notifications}}
   mountResearchBoardNotifications(document,{getSnapshot:async()=>snapshot,subscribe:()=>()=>{}})
   await Promise.resolve()
   host.querySelector('button').click()
  }
  let copiedPath=''
  function mountWorkspaceHoverCard(){
   const anchor=document.createElement('div')
   anchor.style.cssText='position:fixed;left:8px;top:240px;width:48px'
   const fixtureCss=document.createElement('style')
   fixtureCss.textContent='body>div[role=button][aria-label^="复制: "]{position:fixed;z-index:5000;width:220px;padding:12px;background:#292929;color:white;border-radius:8px}'
   document.head.append(fixtureCss)
   document.body.append(anchor)
   Object.defineProperty(navigator.clipboard,'writeText',{value:async text=>{
    if(!document.hasFocus())throw new Error('The source must own focus to copy the path')
    copiedPath=text
   }})
   createRoot(anchor).render(jsx(HoverCard,{
    anchor:jsx('button',{id:'workspace-hover-anchor',children:'项目'}),
    content:jsx('div',{children:'项目路径'}),
    copyText:'/tmp/example-workspace'
   }))
  }
  const click=selector=>{const element=document.querySelector(selector);if(!element)throw Error('Missing fixture control: '+selector);element.click()}
  contextBridge.exposeInMainWorld('qa',{
   open:()=>view.open('live-menu-synthetic-session'),close:()=>view.close(),
   click,global:()=>global.click(),dismiss:()=>{scheduled.closeMenu();view.dismiss()},
   openNotificationCenter,mountWorkspaceHoverCard,copiedWorkspacePath:()=>copiedPath,
   tooltip:bounds=>{document.querySelector('#live-menu-tooltip')?.remove();const tip=document.createElement('div');tip.id='live-menu-tooltip';tip.role='tooltip';tip.textContent='实时网页上的提示';tip.style.cssText='position:fixed;z-index:10000;padding:12px;background:#292929;color:white;border-radius:8px;left:'+bounds.x+'px;top:'+bounds.y+'px';document.body.append(tip)},removeTooltip:()=>document.querySelector('#live-menu-tooltip')?.remove(),
   diagnostics:()=>({rootHidden:view.root.hidden,panel:view.panel,presented:view.panelPresented,documentFocused:document.hasFocus(),activeField:document.activeElement?.getAttribute('data-field'),states,sourceMenus:[...document.querySelectorAll('.eb-popover,.st-menu')].map(el=>({role:el.getAttribute('role'),hidden:el.getAttribute('aria-hidden'),inert:el.inert,visibility:getComputedStyle(el).visibility})),viewport:document.querySelector('[data-browser-viewport]')?.getBoundingClientRect().toJSON(),globalAction,calls,actions,images:document.querySelectorAll('.eb-page-image').length}),
   dispose:()=>{projection.dispose();view.dispose();host.dispose()},
  })
 })
}

async function nativeFixture(config){
 const {app,BrowserWindow,ipcMain,webContents,screen}=require('electron')
 const {writeFile,readFile,mkdir}=require('node:fs/promises'),{createServer}=require('node:http'),assert=require('node:assert/strict')
 app.setPath('userData',config.profile);app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required')
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),trace=[],checks=[],timings=[],consoleEvents=[],fontRequests=[],passiveInput=new Map()
 const toolbarDownloadName='toolbar-download-acceptance-with-a-long-file-name-to-check-truncation.bin'
 let win,api,page,pageView,menu,menuView,wireState,painted,server,display,scale,phase='boot',captureCalls=0,menuRequests=0,holdMenuStates=false
 const heldMenuStates=[]
 const record=(kind,value={})=>{trace.push({at:performance.now(),phase,kind,...value});if(trace.length>100)trace.shift()}
 const until=async(predicate,label,limit=4000)=>{const end=performance.now()+limit;do{if(await predicate())return;await pause(10)}while(performance.now()<end);throw Error('Timeout: '+label)}
 const ui=code=>win.webContents.executeJavaScript(code)
 const request=(method,input={})=>api.request(method,input)
 const menuDOM=code=>menu.webContents.executeJavaScript(code)
 const command=async(method,params)=>{if(!menu.webContents.debugger.isAttached())menu.webContents.debugger.attach('1.3');return menu.webContents.debugger.sendCommand(method,params)}
 const locateMenu=()=>{const popup=BrowserWindow.getAllWindows().find(candidate=>candidate!==win&&candidate.getParentWindow()===win&&candidate.isVisible()&&!passiveInput.get(candidate.id)?.ignore&&wireState?.passive!==true&&candidate.webContents.getTitle()==='Browser menu overlay');menuView=popup?{webContents:popup.webContents,getVisible:()=>!popup.isDestroyed()&&popup.isVisible(),getBounds:()=>{const bounds=popup.getBounds(),parent=win.getContentBounds();return{...bounds,x:bounds.x-parent.x,y:bounds.y-parent.y}}}:win.contentView.children.find(view=>view.webContents&&!view.webContents.isDestroyed()&&view.webContents.getTitle()==='Browser menu overlay');menu=menuView?{webContents:menuView.webContents,...(popup?{popup}:{})}:undefined;return menuView?.getVisible()===true}
 const activeMenu=async()=>locateMenu()&&menuDOM('!!document.querySelector("[data-native-control]")')
 const shown=async(label)=>{await until(async()=>await activeMenu()&&painted?.id===wireState?.id&&painted?._request===wireState?._request&&(menu.popup?win.isFocused()&&!menu.popup.isFocusable()&&webContents.getFocusedWebContents()!==menu.webContents:webContents.getFocusedWebContents()===menu.webContents),label+' painted with its expected keyboard owner');assert.equal(pageView.getVisible(),true,'webpage stays visible');assert.equal(page.getBackgroundThrottling(),false,'webpage remains awake');assert.equal(await ui('qa.diagnostics().images'),0,'no webpage bitmap cover');assert.equal(captureCalls,0,'menu route never calls capturePage');return menuView.getBounds()}
 const clickNative=async selector=>{const point=await menuDOM(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing native menu control');const r=el.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);menu.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});menu.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point})}
 const key=(name,modifiers=[])=>{const keyCode=({ArrowDown:'Down',ArrowUp:'Up',ArrowLeft:'Left',ArrowRight:'Right'})[name]||name,target=menu.popup?webContents.getFocusedWebContents()||win.webContents:menu.webContents;target.sendInputEvent({type:'keyDown',keyCode,modifiers});target.sendInputEvent({type:'keyUp',keyCode,modifiers})}
 const live=()=>page.executeJavaScript('({...window.live,cursor:document.querySelector("video").currentTime})')
 const advancing=async()=>{const before=await live();await until(async()=>{const after=await live();return after.timer>before.timer+2&&after.raf>before.raf+2&&after.video>before.video+1},'timer, animation and video continue under native menu');const after=await live();return{before,after}}
 const ax=async wc=>{if(!wc.debugger.isAttached())wc.debugger.attach('1.3');return(await wc.debugger.sendCommand('Accessibility.getFullAXTree')).nodes}
 const check=async(name,run)=>{if(config.notificationsOnly&&!/notification center/.test(name)||config.workspaceTabsOnly&&!/expanded browser tabs survive/.test(name)||config.downloadsOnly&&!/recent downloads projects/.test(name)||config.hoverOnly&&!/workspace hover card|passive tooltip/.test(name)||config.focusOnly&&!/stale source address/.test(name)||config.scrollbarOnly&&!/long More/.test(name)||config.supplementOnly&&!/address suggestions|local font/.test(name)||config.initialPass&&/delayed replacement|temporary data|zoom|retired menu|closing the workspace|passive tooltip|transparent shadow/.test(name))return;phase=name;const at=performance.now(),detail=await run();checks.push({name,passed:true,ms:performance.now()-at,...(detail?{detail}:{})})}
 const dismiss=async()=>{await ui('qa.dismiss()');await until(()=>!locateMenu(),'native menu dismissed')}
 const diagnostics=async()=>({phase,error:null,window:win&&!win.isDestroyed()?{visible:win.isVisible(),focused:win.isFocused(),focusedWindow:BrowserWindow.getFocusedWindow()?.id,focusedContents:webContents.getFocusedWebContents()?.id,bounds:win.getContentBounds(),zoom:win.webContents.getZoomFactor()}:undefined,views:win&&!win.isDestroyed()?win.contentView.children.filter(view=>view.webContents&&!view.webContents.isDestroyed()).map(view=>({title:view.webContents.getTitle(),url:view.webContents.getURL().slice(0,160),visible:view.getVisible(),bounds:view.getBounds(),zoom:view.webContents.getZoomFactor()})):[],renderer:await Promise.race([ui('qa.diagnostics()'),pause(500).then(()=>({timeout:true}))]).catch(error=>({error:String(error)})),checks,timings,captureCalls,fontRequests,consoleEvents,trace})
 try{
  await app.whenReady()
  ipcMain.on('qa:renderer-error',(_,error)=>record('renderer-error',{error}))
  ipcMain.on('qa:focus',(_,input)=>record('source-focus',input))
  ipcMain.on('qa:focus-call',(_,input)=>record('source-focus-call',input));ipcMain.on('qa:source-input',(_,input)=>record('source-input',input))
  const ignoreMouseEvents=BrowserWindow.prototype.setIgnoreMouseEvents;BrowserWindow.prototype.setIgnoreMouseEvents=function(ignore,options){passiveInput.set(this.id,{ignore,options});return ignoreMouseEvents.call(this,ignore,options)}
  app.on('web-contents-created',(_,contents)=>{const focus=contents.focus.bind(contents);contents.focus=(...args)=>{record('wc-focus-call',{id:contents.id,title:contents.getTitle(),stack:new Error().stack?.split('\n').slice(1,5).join('\n')});return focus(...args)};contents.on('focus',()=>record('wc-focus',{id:contents.id,title:contents.getTitle()}));contents.on('blur',()=>record('wc-blur',{id:contents.id,title:contents.getTitle()}));contents.on('console-message',(details,...legacy)=>{consoleEvents.push({id:contents.id,title:contents.getTitle(),level:details.level??legacy[0],message:details.message??legacy[1]});if(consoleEvents.length>100)consoleEvents.shift()});const send=contents.send.bind(contents);contents.send=(channel,...args)=>{if(channel==='browser-app:menu-state'){wireState=structuredClone(args[0]);record('native-state',{id:wireState.id,revision:wireState.revision});if(holdMenuStates){heldMenuStates.push(()=>send(channel,...args));return}}return send(channel,...args)}})
  ipcMain.on('browser-app:menu-action',(_,action)=>{if(action?.kind==='painted')painted=action;record('native-action',{actionKind:action?.kind,id:action?.id,revision:action?.revision,controlId:action?.controlId})})
  app.on('session-created',session=>session.protocol.handle('https',request=>{
   if(new URL(request.url).pathname==='/toolbar-download'){
    let sent=0,timer
    const total=4_000_000
    const body=new ReadableStream({
     start(controller){
      timer=setInterval(()=>{
       const length=Math.min(65536,total-sent)
       if(length<=0){clearInterval(timer);controller.close();return}
       controller.enqueue(new Uint8Array(length))
       sent+=length
      },60)
     },
     cancel(){clearInterval(timer)}
    })
    return new Response(body,{headers:{'content-type':'application/octet-stream','content-length':String(total),'content-disposition':'attachment; filename="'+toolbarDownloadName+'"'}})
   }
   return new Response(`<!doctype html><title>Live menu fixture</title><style>html,body{margin:0;background:#141414;color:#f5f5f5;font:24px system-ui}button{position:fixed;left:30px;bottom:30px;padding:20px}video{width:320px;height:180px}canvas{display:none}</style><h1>Live synthetic webpage</h1><video muted autoplay playsinline></video><canvas width=320 height=180></canvas><button id=outside>First outside click</button><script>window.live={timer:0,raf:0,video:0,click:0};setInterval(()=>live.timer++,20);const canvas=document.querySelector('canvas'),context=canvas.getContext('2d');function frame(){live.raf++;context.fillStyle='hsl('+live.raf%360+' 70% 45%)';context.fillRect(0,0,320,180);requestAnimationFrame(frame)}requestAnimationFrame(frame);const video=document.querySelector('video');video.srcObject=canvas.captureStream(30);video.play();function videoFrame(){live.video++;video.requestVideoFrameCallback(videoFrame)}video.requestVideoFrameCallback(videoFrame);document.querySelector('#outside').onclick=()=>live.click++;</script>`,{headers:{'content-type':'text/html'}})
  }))
  display=screen.getAllDisplays().sort((a,b)=>b.size.width*b.size.height*b.scaleFactor*b.scaleFactor-a.size.width*a.size.height*a.scaleFactor*a.scaleFactor)[0];scale=display.scaleFactor
  record('display',{id:display.id,scale,workArea:display.workArea,pixels:{width:display.size.width*scale,height:display.size.height*scale}})
  win=new BrowserWindow({x:display.workArea.x+16,y:display.workArea.y+16,width:Math.ceil(4480/scale),height:Math.ceil(2500/scale),show:false,acceptFirstMouse:true,webPreferences:{preload:config.preload,sandbox:true,contextIsolation:true,nodeIntegration:false}})
  win.on('focus',()=>record('window-focus'));win.on('blur',()=>record('window-blur'))
  win.setContentSize(Math.ceil(4480/scale),Math.ceil(2500/scale))
  const tracedIpc={handle:(channel,handler)=>ipcMain.handle(channel,(event,method,input)=>{if(method==='menu')menuRequests++;record(method,method==='menu'?{id:input?.id,revision:input?.revision,owner:input?.owner,tabId:input?.tabId,url:input?.url,bounds:input?.bounds,htmlBytes:input?.html?.length,cssBytes:input?.css?.length}:input);return handler(event,method,input)}),removeHandler:channel=>ipcMain.removeHandler(channel)}
  api=registerBrowserApp({ipcMain:tracedIpc,getMainWindow:()=>win,root:config.state,menuPreload:config.menuPreload,materialDirectory:async()=>config.materials})
  const fontBytes=await readFile(config.fontPath)
  server=createServer((request,response)=>{if(request.url==='/fonts/NotoSansSC.woff2'){fontRequests.push({origin:request.headers.origin,referer:request.headers.referer,bytes:fontBytes.length,accessControlAllowOrigin:null});response.writeHead(200,{'content-type':'font/woff2','cache-control':'no-store'});response.end(fontBytes);return}response.writeHead(200,{'content-type':'text/html'});response.end('<!doctype html><style>@font-face{font-family:"Noto Sans SC";src:url("/fonts/NotoSansSC.woff2") format("woff2");font-weight:100 900;font-style:normal;font-display:block}:root{--odyssey-font-ui:"Noto Sans SC",sans-serif}body{margin:0;background:#111}[data-dsh-sidebar-root]{position:fixed;left:0;top:0;bottom:0;width:64px}.pI_x6G_centerCol{position:fixed;left:64px;right:24px;top:10px;bottom:10px}</style><aside data-dsh-sidebar-root></aside><main class="pI_x6G_centerCol"></main>')});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  await win.loadURL('http://127.0.0.1:'+server.address().port+'/')
  win.show();app.focus({steal:true});win.focus();await until(()=>ui('!!window.qa'),'fixture preload');await ui('qa.open()')
  const id=api.snapshot().activeId
  await request('navigate',{id,url:'https://live-menu.example.test/'})
  await until(()=>{page=webContents.getAllWebContents().find(contents=>contents.getURL()==='https://live-menu.example.test/');pageView=win.contentView.children.find(view=>view.webContents===page);return page&&!api.snapshot().tabs.find(tab=>tab.id===id).loading&&pageView?.getVisible()},'first live native webpage')
  await until(async()=>(await live()).video>1,'synthetic video started')
  page.capturePage=async()=>{captureCalls++;throw Error('QA forbids menu webpage capture')}
  win.webContents.capturePage=async()=>{captureCalls++;throw Error('QA forbids menu host capture')}
  await request('bookmark',{url:'https://live-menu.example.test/saved',title:'中文研究资料',folder:'研究资料'})
  for(let i=0;i<5;i++)await request('new')
  await request('select',{id});await until(()=>pageView.getVisible(),'original tab selected')

  await check('notification center projects its complete panel and owns scrolling above the live page',async()=>{
   await ui('document.body.setAttribute("data-ds-dark-theme","");qa.openNotificationCenter(1000)')
   const bounds=await shown('notification center')
   const panel=await menuDOM(`(()=>{
    const root=document.querySelector('.srb-notifications[data-native-menu-root]')
    const list=root?.querySelector('.srb-notification-list')
    return {roots:document.querySelectorAll('[data-native-menu-root]').length,
     title:root?.querySelector('h2')?.textContent,tabs:root?.querySelectorAll('[role=tab]').length,
     cards:list?.querySelectorAll('[data-notification-id]').length,scrollable:list?.scrollHeight>list?.clientHeight,
     background:root&&getComputedStyle(root).backgroundColor,height:root?.offsetHeight}
   })()`)
   assert.equal(panel.title,'消息中心','title and cards cross the native page boundary together')
   assert.equal(panel.roots,1,'rows are not separately projected')
   assert.equal(panel.tabs,2);assert.equal(panel.cards,1000);assert.equal(panel.scrollable,true)
   assert.match(panel.background,/^rgb\(/,'the page cannot show through the native panel')
   assert.ok(bounds.height<=panel.height+42,'hidden rows do not expand the native overlay')
   const point=await menuDOM(`(()=>{const r=document.querySelector('.srb-notification-list').getBoundingClientRect();
    return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
   menu.webContents.sendInputEvent({type:'mouseWheel',...point,deltaY:-640,deltaX:0,canScroll:true})
   await until(()=>ui('document.querySelector(".srb-notification-list").scrollTop>0'),'scroll reaches the source list')
   key('ArrowRight')
   await until(()=>menuDOM('document.querySelector("[data-notification-filter=unread]")?.getAttribute("aria-selected")==="true"'),'keyboard switches to unread')
   assert.equal(await menuDOM('document.querySelectorAll("[data-notification-id]").length'),1)
   await clickNative('[data-notification-filter=all]')
   await until(()=>menuDOM('document.querySelectorAll("[data-notification-id]").length===1000'),'click restores all messages')
   key('Escape')
   await until(()=>!locateMenu(),'notification center closes on Escape')
   assert.equal(await ui('!!document.querySelector(".srb-notifications")'),false)
   assert.equal(pageView.getVisible(),true)
   await ui('document.body.removeAttribute("data-ds-dark-theme");qa.click(".srb-bell")')
   await shown('light notification center')
   const light=await menuDOM('getComputedStyle(document.querySelector(".srb-notifications")).backgroundColor')
   assert.match(light,/^rgb\(/);assert.notEqual(light,panel.background)
   await clickNative('.srb-notifications-close')
   await until(()=>!locateMenu(),'close button dismisses the light center')
   return {bounds,darkBackground:panel.background,lightBackground:light,cards:panel.cards,scroll:true,keyboard:true}
  })

  await check('state updates do not restore a stale source address over the focused native menu',async()=>{
   win.webContents.focus();await ui('document.querySelector("[data-field=address]").focus()');await ui('qa.click("[data-action=menu]")');await shown('More before background state update');const before=await ui('qa.diagnostics()');assert.equal(before.activeField,'address');assert.equal(before.documentFocused,false)
   const muted=api.snapshot().tabs.find(tab=>tab.id===id).muted,at=performance.now();await request('mute',{id});await until(()=>ui('qa.diagnostics().states').then(value=>value>before.states),'browser state update rendered');await ui('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
   const calls=trace.filter(row=>row.at>=at&&row.kind==='source-focus-call'&&row.stack?.includes('BrowserAppView.render'));record('background-focus-result',{calls,source:await ui('({focused:document.hasFocus(),active:document.activeElement?.getAttribute("data-field")})'),focusedContents:webContents.getFocusedWebContents()?.id,nativeContents:menu.webContents.id})
   assert.deepEqual(calls.filter(row=>!row.documentFocused),[],'render never calls focus in a background source document');assert.equal(webContents.getFocusedWebContents(),menu.webContents,'state updates retain native menu keyboard ownership');assert.equal(await ui('document.hasFocus()'),false);assert.equal(await menuDOM('document.querySelectorAll("[role=menu]").length'),1);await dismiss();await until(()=>ui('document.hasFocus()&&document.activeElement?.getAttribute("data-field")==="address"'),'explicit close restores the original address field after the owner regains focus');if(api.snapshot().tabs.find(tab=>tab.id===id).muted!==muted)await request('mute',{id})
  })

  await check('long More has no visible scrollbars at normal height and stays reachable in a short window',async()=>{
   const original=win.getContentBounds();win.setContentSize(1380,900)
   await ui('(()=>{document.body.setAttribute("data-ds-dark-theme","");const style=document.createElement("style");style.id="native-scrollbar-fixture";style.textContent="body{--ework-scroll-thumb:rgba(255,255,255,.14)}body *::-webkit-scrollbar{width:6px;height:6px}body *::-webkit-scrollbar-thumb{background-color:var(--ework-scroll-thumb)!important;border-radius:4px}body *::-webkit-scrollbar-track,body *::-webkit-scrollbar-corner{background-color:transparent!important}";document.head.append(style)})()')
   await until(()=>ui('document.querySelector(".eb-root").dataset.dark==="true"'),'dark Browser theme');await ui('qa.click("[data-action=menu]")');await shown('long More before zoom');await clickNative('[data-action=zoom-in]');await until(()=>page.getZoomFactor()===1.1,'webpage reaches 110% zoom');await shown('long More after webpage zoom');await menuDOM('Promise.allSettled(document.getAnimations().map(animation=>animation.finished)).then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))')
   const metrics=element=>{const rect=element.getBoundingClientRect(),style=getComputedStyle(element),bar=getComputedStyle(element,'::-webkit-scrollbar'),thumb=getComputedStyle(element,'::-webkit-scrollbar-thumb'),track=getComputedStyle(element,'::-webkit-scrollbar-track');return{rect:rect.toJSON(),clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight,verticalGutter:element.offsetWidth-element.clientWidth-parseFloat(style.borderLeftWidth)-parseFloat(style.borderRightWidth),horizontalGutter:element.offsetHeight-element.clientHeight-parseFloat(style.borderTopWidth)-parseFloat(style.borderBottomWidth),borderRight:parseFloat(style.borderRightWidth),colorScheme:style.colorScheme,background:style.backgroundColor,overflowX:style.overflowX,scrollbar:{standard:style.scrollbarWidth,display:bar.display,width:bar.width,height:bar.height,thumb:thumb.backgroundColor,track:track.backgroundColor}}}
   const expression='('+metrics.toString()+')(document.querySelector("[data-browser-panel=menu]"))',source=await ui(expression),native=await menuDOM(expression),zooms={main:win.webContents.getZoomFactor(),menu:menu.webContents.getZoomFactor(),page:page.getZoomFactor()}
   const picture=await menu.webContents.capturePage();await writeFile(join(config.evidence,'more-dark-scrollbars.png'),picture.toPNG())
   const gutter=await menu.webContents.capturePage({x:Math.floor(native.rect.right-native.borderRight-6),y:Math.floor(native.rect.top+2),width:6,height:Math.floor(native.rect.height-4)}),pixels=gutter.toBitmap();let light=0,opaque=0;for(let index=0;index<pixels.length;index+=4)if(pixels[index+3]>200){opaque++;if(Math.min(pixels[index],pixels[index+1],pixels[index+2])>220)light++}
   const result={source,native,zooms,gutter:{light,opaque}};record('scrollbar-metrics',result)
   const noBars=value=>value.scrollbar.standard==='none'||value.scrollbar.display==='none'
   assert.ok(source.scrollWidth<=source.clientWidth+1&&source.scrollHeight<=source.clientHeight+1,'normal-height source More fits all its actions');assert.ok(native.scrollWidth<=native.clientWidth+1&&native.scrollHeight<=native.clientHeight+1,'normal-height native More has no horizontal or vertical overflow');assert.equal(native.horizontalGutter,0);assert.equal(native.verticalGutter,0);assert.ok(noBars(source)&&noBars(native),'More hides both scrollbar orientations');assert.equal(native.colorScheme,source.colorScheme);assert.ok(opaque>0&&light/opaque<.01,'native right edge has no white strip');assert.deepEqual(zooms,{main:1,menu:1,page:1.1});assert.equal(captureCalls,0)
   win.setContentSize(1380,560);await until(()=>ui('document.querySelector("[data-browser-panel=menu]").getBoundingClientRect().height<'+source.rect.height),'short-window source More is height limited');await shown('short-window More');await until(()=>menuDOM(expression).then(value=>value.rect.height<native.rect.height),'short-window native More is height limited')
   const short=await menuDOM(expression);assert.ok(short.scrollHeight>short.clientHeight,'short window keeps offscreen actions scrollable');assert.ok(short.scrollWidth<=short.clientWidth+1&&noBars(short));assert.equal(short.horizontalGutter,0);assert.equal(short.verticalGutter,0)
   menu.webContents.sendInputEvent({type:'mouseWheel',x:Math.round(short.rect.x+short.rect.width/2),y:Math.round(short.rect.y+short.rect.height/2),deltaY:-600,deltaX:0,canScroll:true})
   await until(()=>menuDOM('(()=>{const root=document.querySelector("[data-browser-panel=menu]"),last=root.querySelector("[data-action=clear]"),r=root.getBoundingClientRect(),l=last.getBoundingClientRect();return root.scrollTop>0&&l.top>=r.top&&l.bottom<=r.bottom})()'),'last More action reachable by wheel without visible bars');const bottom=await menu.webContents.capturePage();await writeFile(join(config.evidence,'more-dark-scrollbars-low.png'),bottom.toPNG());record('scrollbar-low',{native:short,lastAction:'clear',wheelReachable:true})
   await dismiss();await request('zoom',{id,value:1});await ui('document.getElementById("native-scrollbar-fixture").remove();document.body.removeAttribute("data-ds-dark-theme")');win.setContentSize(original.width,original.height);return{...result,short,lastActionWheelReachable:true}
  })

  await check('address suggestions preserve owner focus, continued typing and keyboard navigation',async()=>{
   await ui('qa.click("[data-action=menu]")');await shown('More before address takeover')
   win.webContents.focus();await ui('(()=>{const address=document.querySelector("[data-field=address]");address.focus();address.select()})()');await win.webContents.insertText('live')
   const ownerShown=async()=>{await until(async()=>await activeMenu()&&wireState?.focusOwner===true&&painted?.id===wireState.id&&painted?._request===wireState._request,'address suggestions painted without taking owner focus');assert.equal(webContents.getFocusedWebContents(),win.webContents);assert.equal(await ui('document.activeElement?.getAttribute("data-field")'),'address')}
   await ownerShown();assert.equal(await ui('qa.diagnostics().panel'),'','address input closes the previous Browser panel');await win.webContents.insertText('-menu');await until(()=>ui('document.querySelector("[data-field=address]").value==="live-menu"'),'address accepts further typing');await ownerShown()
   for(let index=1;index<=2;index++){win.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'});await until(()=>ui('document.querySelector(".eb-suggestions [aria-selected=true]")?.getAttribute("data-index")').then(value=>value===String(index)),'address keyboard suggestion '+index);await ownerShown()}
   assert.ok(await menuDOM('document.querySelector("[aria-selected=true]").textContent.includes("中文研究资料")'));win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'})
   await until(()=>page.getURL()==='https://live-menu.example.test/saved'&&!api.snapshot().tabs.find(tab=>tab.id===id).loading,'keyboard opens selected bookmark suggestion');await until(()=>!locateMenu(),'address suggestions close after navigation');assert.equal(captureCalls,0);await request('navigate',{id,url:'https://live-menu.example.test/'});await until(()=>!api.snapshot().tabs.find(tab=>tab.id===id).loading&&pageView.getVisible(),'original live page restored')
  })
  await check('local font without ACAO loads from its native menu origin',async()=>{
   const mainFont=await ui('document.fonts.load(\'400 14px "Noto Sans SC"\',"原生菜单字体").then(faces=>({count:faces.length,statuses:faces.map(face=>face.status),checked:document.fonts.check(\'400 14px "Noto Sans SC"\',"原生菜单字体")}))');assert.ok(mainFont.count>0&&mainFont.checked,'font file works in its original same-origin UI')
   await ui('qa.click("[data-action=menu]")');await shown('More for actual font and icon paint')
   const nativeFont=await menuDOM('(async()=>{try{const faces=await Promise.race([document.fonts.load(\'400 14px "Noto Sans SC"\',"原生菜单字体"),new Promise((_,reject)=>setTimeout(()=>reject(Error("font timeout")),2000))]);return{count:faces.length,statuses:faces.map(face=>face.status),checked:document.fonts.check(\'400 14px "Noto Sans SC"\',"原生菜单字体"),faces:[...document.fonts].map(face=>({family:face.family,status:face.status}))}}catch(error){return{error:String(error),faces:[...document.fonts].map(face=>({family:face.family,status:face.status}))}}})()')
   record('font-result',{mainFont,nativeFont})
   assert.ok(nativeFont.count>0&&nativeFont.checked&&!nativeFont.error,'same font loads from opaque native menu origin despite original HTTP response lacking ACAO');assert.equal(captureCalls,0);await dismiss();return{mainFont,nativeFont,fontRequests,consoleEvents}
  })
  await check('local font menu paints actual CSS mask icons after its opening fade',async()=>{
   await ui('qa.click("[data-action=menu]")');await shown('More for actual CSS mask paint');await menuDOM('Promise.allSettled(document.getAnimations().map(animation=>animation.finished)).then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))')
   const icon=await menuDOM('(()=>{const icon=document.querySelector(".eb-menu-item .eb-icon"),r=icon.getBoundingClientRect(),style=getComputedStyle(icon);window.maskProbe=icon;return{x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height),mask:style.maskImage,color:style.backgroundColor}})()'),rectangle={x:icon.x,y:icon.y,width:icon.width,height:icon.height}
   const ink=image=>{const pixels=image.toBitmap();let count=0;for(let index=0;index<pixels.length;index+=4)if(pixels[index+3]>200&&Math.min(pixels[index],pixels[index+1],pixels[index+2])<200)count++;return count}
   const masked=await menu.webContents.capturePage(rectangle);await writeFile(join(config.evidence,'native-menu-icon.png'),masked.toPNG());await menuDOM('window.maskProbe.style.maskImage="none";new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');const unmasked=await menu.webContents.capturePage(rectangle);await menuDOM('window.maskProbe.style.maskImage='+JSON.stringify(icon.mask));const paint={maskedInk:ink(masked),unmaskedInk:ink(unmasked),mask:icon.mask,color:icon.color};record('mask-paint',paint)
   assert.ok(icon.mask.includes('data:image/svg')&&paint.maskedInk>5&&paint.maskedInk<paint.unmaskedInk*.9,'real CSS mask paints a visible non-rectangular icon');assert.equal(captureCalls,0);await dismiss();return{paint}
  })

  for(const [label,selector]of [['tab-list','[data-action=tab-list]'],['more','[data-action=menu]'],['bookmarks','.eb-toolbar [data-action=bookmarks]']])await check(label+' opens above a live 4K webpage',async()=>{
   const at=performance.now();await ui('qa.click('+JSON.stringify(selector)+')');const bounds=await shown(label);timings.push({label,ms:performance.now()-at});const movement=await advancing();const nativeBounds=pageView.getBounds();assert.ok(nativeBounds.width*scale>=3840&&nativeBounds.height*scale>=2160,'native webpage has at least 4K backing dimensions');await dismiss();return{bounds,nativeBounds,scale,...movement}
  })
  await check('global sidebar More uses a material popup above the live page',async()=>{await ui('qa.global()');await shown('global More');assert.ok(menu.popup&&!menu.popup.isFocusable(),'global More uses a non-key material window');assert.equal(win.isFocused(),true,'main window keeps its active chrome');const movement=await advancing();assert.ok(await menuDOM('document.body.textContent.includes("Plugins")'));await dismiss();return movement})
  await check('keyboard and AX global activation take over the existing Browser menu',async()=>{
   await ui('qa.click("[data-action=menu]")');await shown('Browser More before takeover');await ui('qa.global()');await shown('global More takeover');await until(()=>menuDOM('document.body.textContent.includes("Plugins")'),'global menu content');assert.equal(await ui('qa.diagnostics().panel'),'','old Browser menu closed without pointerdown');assert.equal(await menuDOM('document.querySelectorAll("[role=menu]").length'),1);await dismiss()
  })
  await check('a delayed replacement payload never reveals retired menu controls',async()=>{
   await ui('qa.click("[data-action=menu]")');await shown('More before delayed replacement');assert.equal(await menuDOM('document.body.textContent.includes("新标签页")'),true)
   holdMenuStates=true;await ui('qa.dismiss();qa.global()');await until(()=>heldMenuStates.length>0,'new native payload held in transit')
   assert.equal(await menuDOM('document.body.textContent.includes("新标签页")'),false,'old menu cleared before a replacement can become visible');assert.equal(pageView.getVisible(),true)
   holdMenuStates=false;for(const send of heldMenuStates.splice(0))send();await shown('released replacement payload');await until(()=>menuDOM('document.body.textContent.includes("Plugins")'),'released global menu content');await dismiss()
  })
  await check('non-intersecting global menu stays in the host without native projection',async()=>{
   await ui('document.querySelector("[data-dsh-sidebar-root]").style.width="320px";document.querySelector(".pI_x6G_centerCol").style.left="320px"');await until(()=>pageView.getBounds().x>=320,'sidebar gap layout')
   const before=menuRequests;await ui('qa.global()');await until(()=>ui('qa.diagnostics().sourceMenus.some(menu=>menu.visibility==="visible"&&!menu.inert)'),'non-intersecting host menu');assert.equal(locateMenu(),false);assert.equal(menuRequests,before,'no native menu request for a non-intersecting popup');assert.equal(pageView.getVisible(),true);await dismiss();await ui('document.querySelector("[data-dsh-sidebar-root]").style.width="64px";document.querySelector(".pI_x6G_centerCol").style.left="64px"');await until(()=>pageView.getBounds().x===64,'restored Browser bounds')
  })
  await check('native accessibility exposes only the projected menu',async()=>{
   await ui('qa.click("[data-action=menu]")');await shown('More for AX')
   const mainNodes=await ax(win.webContents),menuNodes=await ax(menu.webContents),menus=nodes=>nodes.filter(node=>!node.ignored&&['menu','listbox'].includes(node.role?.value))
   assert.equal(menus(mainNodes).length,0,'source menu removed from host AX tree');assert.equal(menus(menuNodes).length,1,'one native menu in AX tree');await dismiss()
  })
  await check('outside first click both dismisses and reaches the live page',async()=>{
   await ui('qa.click("[data-action=menu]")');const bounds=await shown('More for outside click'),before=(await live()).click
   const point=await page.executeJavaScript('(()=>{const r=document.querySelector("#outside").getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()'),native=pageView.getBounds(),absolute={x:native.x+point.x,y:native.y+point.y}
   assert.ok(absolute.x<bounds.x||absolute.x>=bounds.x+bounds.width||absolute.y<bounds.y||absolute.y>=bounds.y+bounds.height,'click point is outside the native overlay rectangle')
   page.focus();page.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});page.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point})
   await until(()=>!locateMenu(),'outside click dismissal');await until(async()=>(await live()).click===before+1,'first outside click delivered to the page');await pause(20);assert.equal((await live()).click,before+1,'original page click delivered exactly once')
  })
  await check('a click in transparent shadow padding reaches the page exactly once',async()=>{
   await ui('qa.click("[data-action=menu]")');const bounds=await shown('More for shadow hit testing'),native=pageView.getBounds(),root=await menuDOM('document.querySelector("[data-browser-panel=menu]").getBoundingClientRect().toJSON()'),point={x:Math.max(1,Math.round(root.x/2)),y:Math.round(root.y+48)}
   assert.ok(point.x<root.x,'test point is in native padding outside the actual menu');const hostZoom=menu.webContents.getZoomFactor(),pageZoom=page.getZoomFactor(),absolute={x:bounds.x+point.x*hostZoom,y:bounds.y+point.y*hostZoom}
   assert.ok(absolute.x>=native.x&&absolute.x<native.x+native.width&&absolute.y>=native.y&&absolute.y<native.y+native.height,'transparent native padding overlaps the live webpage')
   await page.executeJavaScript(`(()=>{window.live.shadow=0;document.querySelector('#shadow-target')?.remove();const button=document.createElement('button');button.id='shadow-target';button.textContent='shadow hit';button.style.cssText='position:fixed;left:'+${(absolute.x-native.x)/pageZoom-14}+'px;top:'+${(absolute.y-native.y)/pageZoom-14}+'px;bottom:auto;width:28px;height:28px;padding:0;z-index:999';button.onclick=()=>window.live.shadow++;document.body.append(button)})()`)
   menu.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:Math.round(point.x*hostZoom),y:Math.round(point.y*hostZoom)});menu.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:Math.round(point.x*hostZoom),y:Math.round(point.y*hostZoom)})
   await until(()=>!locateMenu(),'shadow-padding click closes menu');await until(()=>page.executeJavaScript('window.live.shadow===1'),'shadow-padding first click reaches the live page');await pause(30);assert.equal(await page.executeJavaScript('window.live.shadow'),1,'no duplicate forwarded mouse gesture')
  })
  // Input, keyboard, owner rejection and geometry assertions below use the same
  // real projection; they deliberately avoid exposing a test-only menu API.
  await check('keyboard arrows, Tab and Escape operate the single native menu',async()=>{
   await ui('qa.click("[data-action=menu]")');await shown('More for keyboard')
   const before=await menuDOM('document.activeElement?.getAttribute("data-native-control")');key('ArrowDown');await until(()=>menuDOM('document.activeElement?.getAttribute("data-native-control")').then(id=>!!id&&id!==before),'ArrowDown advances a menu item')
   const arrow=await menuDOM('document.activeElement?.getAttribute("data-native-control")');key('Tab');await until(()=>menuDOM('document.activeElement?.getAttribute("data-native-control")').then(id=>!!id&&id!==arrow),'Tab moves keyboard focus')
   key('Escape');await until(()=>!locateMenu(),'Escape dismissal');assert.notEqual(webContents.getFocusedWebContents(),menu.webContents,'hidden menu does not retain keyboard focus')
  })
  await check('bookmark search preserves Chinese input, selection and active IME drafts',async()=>{
   await ui('qa.click(".eb-toolbar [data-action=bookmarks]")');await shown('bookmarks input')
   await menuDOM('document.querySelector("input").focus()');await command('Input.insertText',{text:'中文'})
   await until(()=>ui('document.querySelector(".eb-popover input")?.value==="中文"'),'search forwarded to source');await until(()=>menuDOM('document.querySelector("input")?.value==="中文"'),'search retained after projection update')
   await menuDOM('(()=>{const input=document.querySelector("input");input.setSelectionRange(0,1);window.imeEvents=[];input.addEventListener("compositionstart",()=>imeEvents.push("start"));input.addEventListener("compositionend",()=>imeEvents.push("end"));window.imeNode=input})()')
   await command('Input.imeSetComposition',{text:'待提交',selectionStart:0,selectionEnd:3})
   await until(()=>menuDOM('window.imeEvents.includes("start")'),'native IME starts');const draft=await menuDOM('document.querySelector("input").value')
   await request('mute',{id});await until(()=>api.snapshot().tabs.find(tab=>tab.id===id).muted,'unrelated state publish while composing')
   await until(()=>menuDOM('document.querySelector("input")===window.imeNode'),'composing input node survives source render');assert.equal(await menuDOM('document.querySelector("input").value'),draft,'uncommitted IME draft retained')
   await command('Input.insertText',{text:'中文'});await until(()=>menuDOM('window.imeEvents.includes("end")'),'native IME commits');assert.ok((await menuDOM('document.querySelector("input").value')).includes('中文'));assert.equal(await menuDOM('document.activeElement===document.querySelector("input")'),true);await dismiss()
  })
  await check('native bookmark controls create, edit and remove temporary data',async()=>{
   page.focus();page.sendInputEvent({type:'keyDown',keyCode:'D',modifiers:['meta']});page.sendInputEvent({type:'keyUp',keyCode:'D',modifiers:['meta']})
   await shown('Cmd+D bookmark editor');await until(()=>menuDOM('!!document.querySelector("[data-field=bookmark-title]")'),'bookmark editor projection')
   await menuDOM('document.querySelector("[data-field=bookmark-title]").select()');await command('Input.insertText',{text:'原生菜单创建收藏'});await clickNative('[data-action=bookmark-save]')
   await until(()=>api.snapshot().bookmarks.some(bookmark=>bookmark.url==='https://live-menu.example.test/'&&bookmark.title==='原生菜单创建收藏'),'native bookmark create action');await until(()=>!locateMenu(),'bookmark create closes editor')
   await ui('qa.click(".eb-toolbar [data-action=bookmarks]")');await shown('bookmarks for edit');await clickNative('button[aria-label="编辑 原生菜单创建收藏"]')
   await until(()=>menuDOM('!!document.querySelector("[data-field=bookmark-title]")'),'bookmark edit editor');await menuDOM('document.querySelector("[data-field=bookmark-title]").select()');await command('Input.insertText',{text:'原生菜单改名收藏'});await clickNative('[data-action=bookmark-save]')
   await until(()=>api.snapshot().bookmarks.some(bookmark=>bookmark.title==='原生菜单改名收藏'),'native bookmark edit action');await until(()=>!locateMenu(),'bookmark edit closes editor')
   await ui('qa.click(".eb-toolbar [data-action=bookmarks]")');await shown('bookmarks for remove');await clickNative('button[aria-label="编辑 原生菜单改名收藏"]');await until(()=>menuDOM('!!document.querySelector("[data-action=bookmark-remove]")'),'bookmark remove editor');await clickNative('[data-action=bookmark-remove]')
   await until(()=>!api.snapshot().bookmarks.some(bookmark=>bookmark.url==='https://live-menu.example.test/'),'native bookmark remove action');await until(()=>!locateMenu(),'bookmark remove closes editor');assert.equal(pageView.getVisible(),true)
  })
  await check('webpage zoom updates without pausing or replacing the live page',async()=>{
   await ui('qa.click("[data-action=menu]")');await shown('More for zoom');const previous=page.getZoomFactor();await clickNative('[data-action=zoom-in]');await until(()=>page.getZoomFactor()>previous,'native webpage zoom updates');await shown('menu retained while zooming');const movement=await advancing();await dismiss();await request('zoom',{id,value:1});return movement
  })
  await check('retired menu IDs and stale revisions cannot activate a current control',async()=>{
   await ui('qa.click("[data-action=menu]")');await shown('retired menu');const retired=structuredClone(wireState);await dismiss();await ui('qa.global()');await shown('new global menu');const current=structuredClone(wireState),controlId=await menuDOM('document.querySelector("button[data-native-control]").getAttribute("data-native-control")'),before=await ui('qa.diagnostics().globalAction')
   const sender={sender:menu.webContents,senderFrame:menu.webContents.mainFrame}
   ipcMain.emit('browser-app:menu-action',sender,{...current,id:retired.id,revision:retired.revision,kind:'click',controlId})
   ipcMain.emit('browser-app:menu-action',sender,{...current,revision:Math.max(0,current.revision-1),kind:'click',controlId})
   ipcMain.emit('browser-app:menu-action',{sender:page,senderFrame:page.mainFrame},{...current,kind:'click',controlId})
   // Exercise the renderer guard independently of the main process guard.
   win.webContents.send('browser-app:menu-event',{id:retired.id,revision:retired.revision,kind:'click',controlId})
   await pause(30);assert.equal(await ui('qa.diagnostics().globalAction'),before);assert.equal(locateMenu(),true,'stale controls do not dismiss the current menu');await dismiss()
  })
  await check('menu geometry follows native window resize and host zoom',async()=>{
   const original=win.getContentBounds();await ui('qa.click("[data-action=menu]")');await shown('More before resize');win.setContentSize(original.width-120,original.height-100)
   await shown('More after resize');await until(()=>{const bounds=menuView.getBounds(),content=win.getContentBounds();return bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=content.width+1&&bounds.y+bounds.height<=content.height+1},'resized menu stays inside native window')
   win.webContents.setZoomFactor(1.25);await until(()=>menu.webContents.getZoomFactor()===1.25,'menu inherits host zoom');await shown('More at 125% host zoom');const bounds=menuView.getBounds(),content=win.getContentBounds();assert.ok(bounds.x+bounds.width<=content.width+1&&bounds.y+bounds.height<=content.height+1,'zoomed overlay remains within native content bounds')
   await until(async()=>{const host=await ui('document.querySelector("[data-browser-panel=menu]").getBoundingClientRect().toJSON()'),projected=await menuDOM('document.querySelector("[data-browser-panel=menu]").getBoundingClientRect().toJSON()'),native=menuView.getBounds();return Math.abs(native.x+projected.x*1.25-host.x*1.25)<2&&Math.abs(native.y+projected.y*1.25-host.y*1.25)<2},'native menu aligns with its source at 125% host zoom')
   await dismiss();win.webContents.setZoomFactor(1);win.setContentSize(original.width,original.height);return{bounds,content}
  })
  await check('closing the workspace cancels an in-flight native menu presentation',async()=>{
   await ui('qa.click("[data-action=menu]");qa.close()');await until(()=>!locateMenu()&&!pageView.getVisible(),'closed workspace releases native menu and page')
   await pause(80);assert.equal(locateMenu(),false,'late menu paint cannot reopen the closed workspace');await ui('qa.open()');await until(()=>pageView.getVisible(),'live Browser restored')
   await ui('qa.click("[data-action=menu]")');await shown('restored Browser menu');await dismiss()
  })
  await check('passive tooltip stays above the live page without taking focus or mouse clicks',async()=>{
   await until(()=>pageView.getVisible(),'page visible before tooltip');page.focus();const focus=webContents.getFocusedWebContents(),before=(await live()).click,native=pageView.getBounds(),point=await page.executeJavaScript('(()=>{const r=document.querySelector("#outside").getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()')
   await ui('qa.tooltip('+JSON.stringify({x:native.x+point.x-30,y:native.y+point.y-18})+')')
   let tooltip;await until(()=>{tooltip=BrowserWindow.getAllWindows().find(candidate=>candidate!==win&&candidate.getParentWindow()===win&&candidate.isVisible()&&candidate.webContents.getTitle()==='Browser menu overlay');return!!tooltip},'passive native tooltip')
   await until(()=>wireState?.passive&&painted?.id===wireState.id&&painted?._request===wireState._request,'passive tooltip paint acknowledgement')
   assert.equal(tooltip.isFocusable(),false,'tooltip window cannot become key');assert.equal(passiveInput.get(tooltip.id)?.ignore,true,'native tooltip explicitly ignores mouse events');assert.equal(webContents.getFocusedWebContents(),focus,'tooltip does not steal webpage focus');assert.equal(pageView.getVisible(),true)
   const source=await ax(win.webContents),projected=await ax(tooltip.webContents),tips=nodes=>nodes.filter(node=>!node.ignored&&node.role?.value==='tooltip');assert.equal(tips(source).length,0);assert.equal(tips(projected).length,1)
   page.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});page.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});await until(async()=>(await live()).click===before+1,'first page click beneath tooltip');assert.equal(captureCalls,0)
   const bounds=tooltip.getBounds();await ui('qa.removeTooltip()');await until(()=>tooltip.isDestroyed()||!tooltip.isVisible(),'tooltip removed');return{bounds,focusPreserved:true,firstClick:true}
  })

  await check('workspace hover card projects over the live page and keeps its copy action',async()=>{
   await ui('qa.mountWorkspaceHoverCard()')
   const selector='[role=button][aria-label^="复制: "]'
   await until(()=>ui('!!document.getElementById("workspace-hover-anchor")'),'workspace row mounted')
   page.focus()
   await ui('document.getElementById("workspace-hover-anchor").dispatchEvent(new PointerEvent("pointerover",{bubbles:true,pointerType:"mouse"}))')
   await until(()=>ui('!!document.querySelector('+JSON.stringify(selector)+')'),'workspace hover card opened in the client')
   await until(async()=>locateMenu()&&await menuDOM('!!document.querySelector('+JSON.stringify(selector)+')')&&painted?.id===wireState?.id,'workspace hover card painted over the webpage')
   assert.equal(webContents.getFocusedWebContents(),page,'opening the hover card does not take focus')
   const point=await menuDOM('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()')
   const bounds=menuView.getBounds(),native=pageView.getBounds()
   assert.ok(bounds.x+point.x>=native.x&&bounds.y+point.y>=native.y,'card content intersects the live webpage')
   await ui('document.getElementById("workspace-hover-anchor").dispatchEvent(new PointerEvent("pointerout",{bubbles:true,pointerType:"mouse",relatedTarget:document.body}))')
   await command('Input.dispatchMouseEvent',{type:'mouseMoved',...point})
   await pause(300)
   assert.equal(await menuDOM('!!document.querySelector('+JSON.stringify(selector)+')'),true,'pointer crossing from row to card keeps it open')
   await clickNative(selector)
   await until(()=>ui('qa.copiedWorkspacePath()').then(value=>value==='/tmp/example-workspace'),'copy reaches the focused client')
   await until(()=>menuDOM('document.body.textContent.includes("复制成功")'),'copied feedback appears in the native card')
   await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:4,y:4})
   await until(()=>!locateMenu(),'hover card closes when the pointer leaves')
   assert.equal(pageView.getVisible(),true)
   assert.equal(captureCalls,0)
   return{bounds,focusPreserved:true,copyForwarded:true}
  })

  await check('recent downloads projects live progress and actions above the webpage',async()=>{
   const directory=join(config.profile,'downloads')
   await mkdir(directory,{recursive:true})
   app.setPath('downloads',directory)
   const entry='[data-action=recent-downloads]'
   const centeredIcons=async selectors=>{
    for(const selector of selectors){
     const {dx,dy,square}=await menuDOM(`(()=>{const button=document.querySelector(${JSON.stringify(selector)}),r=button.getBoundingClientRect(),i=button.querySelector('.eb-icon').getBoundingClientRect();return{dx:(i.left+i.right-r.left-r.right)/2,dy:(i.top+i.bottom-r.top-r.bottom)/2,square:r.width===r.height}})()`)
     assert.ok(square&&Math.abs(dx)<.5&&Math.abs(dy)<.5,`${selector} should center its icon in the native hover background (dx=${dx}, dy=${dy})`)
    }
   }
   assert.equal(await ui(`!!document.querySelector('${entry}')`),false)
   page.downloadURL('https://live-menu.example.test/toolbar-download')
   await until(()=>ui(`document.querySelector('${entry}')?.dataset.state==="progressing"`),'download entry appears when transfer starts')
   await ui(`qa.click('${entry}')`)
   const bounds=await shown('recent downloads')
   await until(()=>menuDOM('Number(document.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow"))>0'),'progress updates inside the native menu')
   await centeredIcons(['[data-action=dismiss]','[data-action=download-pause]','[data-action=download-cancel]'])
   await clickNative('[data-action=download-pause]')
   await until(()=>api.snapshot().downloads[0]?.state==='paused','native pause reaches the download')
   await until(()=>menuDOM('!!document.querySelector("[data-action=download-resume]")'),'resume shown after pause')
   await clickNative('[data-action=download-resume]')
   await until(()=>api.snapshot().downloads[0]?.state==='completed','resumed file completes',8000)
   await until(()=>menuDOM('!!document.querySelector("[data-action=download-open]")'),'completed file is actionable')
   await centeredIcons(['[data-action=download-reveal]','[data-action=download-material]','[data-action=download-remove]'])
   const name=await menuDOM(`(()=>{const button=document.querySelector('[data-action=download-open]'),style=getComputedStyle(button),r=button.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,padded:parseFloat(style.paddingLeft)>=6&&style.paddingLeft===style.paddingRight&&parseFloat(style.paddingTop)>0&&style.paddingTop===style.paddingBottom,truncated:button.scrollWidth>button.clientWidth&&style.textOverflow==='ellipsis'}})()`)
   assert.ok(name.padded&&name.truncated,'long filenames ellipsize inside a padded hover target')
   await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:name.x,y:name.y})
   await until(()=>menuDOM('document.querySelector("[data-action=download-open][data-native-hovered]")?.matches(":hover")'),'native filename button receives hover')
   assert.equal((await readFile(join(directory,toolbarDownloadName))).length,4_000_000)
   await clickNative('[data-action=dismiss]')
   await until(async()=>!locateMenu()&&await ui(`document.querySelector('${entry}')?.getAttribute("aria-expanded")==="false"`),'menu closes and keeps the toolbar entry')
   assert.equal(pageView.getVisible(),true)
   assert.equal(captureCalls,0)
   return {bounds,completed:true}
  })

  await check('expanded browser tabs survive the native draggable title and collapse outside the bar',async()=>{
   const toggle='.eb-workspace-toggle',label='.eb-app-label'
   const originalPointer=screen.getCursorScreenPoint
   let location
   screen.getCursorScreenPoint=()=>{
    const {x,y}=win.getContentBounds(),zoom=win.webContents.getZoomFactor()
    return {x:Math.round(x+location.x*zoom),y:Math.round(y+location.y*zoom)}
   }
   const center=selector=>ui(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
   const expanded=()=>ui(`document.querySelector('${toggle}').getAttribute('aria-expanded')==='true'`)
   try{
    location=await center(toggle)
    if(!win.webContents.debugger.isAttached())win.webContents.debugger.attach('1.3')
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',...location})
    await until(expanded,'workspace tabs expand on the arrow')
    assert.equal(await ui(`getComputedStyle(document.querySelector('${toggle}')).backgroundColor`),'rgba(0, 0, 0, 0)')
    assert.equal(await ui(`getComputedStyle(document.querySelector('${label}')).getPropertyValue('-webkit-app-region')`),'drag')
    // Moving across the native title need not emit any Chromium pointer events.
    location=await center(label)
    const [x,y]=win.getPosition()
    win.setPosition(x+16,y+12)
    await pause(400)
    assert.equal(await expanded(),true,'hover remains inside the relocated window title')
    location=await center('.eb-toolbar')
    await until(async()=>!await expanded(),'native pointer leaves the tab bar')
    assert.equal(pageView.getVisible(),true)
    return {titleDraggable:true,windowMoved:[16,12]}
   }finally{screen.getCursorScreenPoint=originalPointer}
  })

  const report={electron:process.versions.electron,chrome:process.versions.chrome,temporaryProfile:true,initialPass:config.initialPass,supplementOnly:config.supplementOnly,display:{id:display.id,scale,bounds:display.bounds},checks,timings,captureCalls,fontRequests,consoleEvents,trace}
  await writeFile(join(config.evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));api.dispose();server.close();win.destroy();app.exit(0)
 }catch(error){const failure=await diagnostics();failure.error=String(error?.stack||error);await writeFile(join(config.evidence,'failure.json'),JSON.stringify(failure,null,2));console.error(JSON.stringify(failure,null,2));api?.dispose();server?.close();win?.destroy();app.exit(1)}
}

await build({stdin:{resolveDir:root,contents:`import {contextBridge,ipcRenderer} from 'electron';import {createRoot} from 'react-dom/client';import {jsx} from 'react/jsx-runtime';import {HoverCard} from '@deepseek-ai/dsh-client-ui-primitives';import {BrowserAppView} from './src/preload/browser/view';import {mountResearchBoardNotifications} from './src/preload/research-board-notifications-ui';import {NativeBrowserMenuProjection} from './src/preload/browser/native-menus';import {WorkspaceSurfaceHost} from './src/preload/workspace-surface-host';import {ScheduledTaskView} from './src/preload/scheduled/view';import {scheduledStyles} from './src/preload/scheduled/style';(${rendererFixture.toString()})();`},bundle:true,platform:'node',format:'cjs',outfile:preload,external:['electron'],plugins:[inline],loader:{'.css':'empty'},logLevel:'silent'})
const config={notificationsOnly:process.env.BROWSER_LIVE_MENU_NOTIFICATIONS_ONLY==='1',workspaceTabsOnly:process.env.BROWSER_LIVE_MENU_WORKSPACE_TABS_ONLY==='1',downloadsOnly:process.env.BROWSER_LIVE_MENU_DOWNLOADS_ONLY==='1',hoverOnly:process.env.BROWSER_LIVE_MENU_HOVER_ONLY==='1',profile:join(scratch,'profile'),state:join(scratch,'state'),materials:join(scratch,'materials'),evidence,preload,menuPreload:join(root,'src/preload/browser/menu-preload.cjs'),fontPath:join(root,'build/fonts/NotoSansSC.woff2'),initialPass:process.env.BROWSER_LIVE_MENU_INITIAL_PASS==='1',supplementOnly:process.env.BROWSER_LIVE_MENU_SUPPLEMENT_ONLY==='1',scrollbarOnly:process.env.BROWSER_LIVE_MENU_SCROLLBAR_ONLY==='1',focusOnly:process.env.BROWSER_LIVE_MENU_FOCUS_ONLY==='1'}
await build({stdin:{resolveDir:root,contents:`import {registerBrowserApp} from './src/main/browser/service';const {join}=require('node:path');(${nativeFixture.toString()})(${JSON.stringify(config)});`},bundle:true,platform:'node',format:'cjs',outfile:entry,external:['electron'],logLevel:'silent'})
const code=await new Promise((done,reject)=>{
 const child=spawn(require('electron'),[entry],{env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:'inherit'}),timer=setTimeout(()=>child.kill('SIGTERM'),60000)
 child.on('error',reject);child.on('exit',(code,signal)=>{clearTimeout(timer);if(signal)console.error('Live menu acceptance terminated:',signal);done(code??1)})
})
console.log('Live menu evidence:',evidence)
if(code!==0)process.exitCode=code
