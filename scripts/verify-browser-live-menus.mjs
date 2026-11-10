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
 document.addEventListener('DOMContentLoaded',()=>{
  const calls=[],actions=[]
  const compact=input=>{const {html,css,...metadata}=input;let hash=0;for(let index=0;index<(html?.length||0);index++)hash=(Math.imul(hash,31)+html.charCodeAt(index))|0;return{...metadata,htmlBytes:html?.length,htmlHash:hash,cssBytes:css?.length}}
  const bridge={
   request:async(method,input={})=>{calls.push({method,input:method==='menu'?compact(input):input,at:performance.now()});return ipcRenderer.invoke('browser-app:request',method,input)},
   subscribe:listener=>{const receive=(_,state)=>listener(state);ipcRenderer.on('browser-app:state',receive);return()=>ipcRenderer.removeListener('browser-app:state',receive)},
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
  const click=selector=>{const element=document.querySelector(selector);if(!element)throw Error('Missing fixture control: '+selector);element.click()}
  contextBridge.exposeInMainWorld('qa',{
   open:()=>view.open('live-menu-synthetic-session'),close:()=>view.close(),
   click,global:()=>global.click(),dismiss:()=>{scheduled.closeMenu();view.dismiss()},
   tooltip:bounds=>{document.querySelector('#live-menu-tooltip')?.remove();const tip=document.createElement('div');tip.id='live-menu-tooltip';tip.role='tooltip';tip.textContent='实时网页上的提示';tip.style.cssText='position:fixed;z-index:10000;padding:12px;background:#292929;color:white;border-radius:8px;left:'+bounds.x+'px;top:'+bounds.y+'px';document.body.append(tip)},removeTooltip:()=>document.querySelector('#live-menu-tooltip')?.remove(),
   diagnostics:()=>({rootHidden:view.root.hidden,panel:view.panel,presented:view.panelPresented,sourceMenus:[...document.querySelectorAll('.eb-popover,.st-menu')].map(el=>({role:el.getAttribute('role'),hidden:el.getAttribute('aria-hidden'),inert:el.inert,visibility:getComputedStyle(el).visibility})),viewport:document.querySelector('[data-browser-viewport]')?.getBoundingClientRect().toJSON(),globalAction,calls,actions,images:document.querySelectorAll('.eb-page-image').length}),
   dispose:()=>{projection.dispose();view.dispose();host.dispose()},
  })
 })
}

async function nativeFixture(config){
 const {app,BrowserWindow,ipcMain,webContents,screen}=require('electron')
 const {writeFile}=require('node:fs/promises'),{createServer}=require('node:http'),assert=require('node:assert/strict')
 app.setPath('userData',config.profile);app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required')
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),trace=[],checks=[],timings=[],passiveInput=new Map()
 let win,api,page,pageView,menu,menuView,wireState,painted,server,display,scale,phase='boot',captureCalls=0,menuRequests=0,holdMenuStates=false
 const heldMenuStates=[]
 const record=(kind,value={})=>{trace.push({at:performance.now(),phase,kind,...value});if(trace.length>100)trace.shift()}
 const until=async(predicate,label,limit=4000)=>{const end=performance.now()+limit;do{if(await predicate())return;await pause(10)}while(performance.now()<end);throw Error('Timeout: '+label)}
 const ui=code=>win.webContents.executeJavaScript(code)
 const request=(method,input={})=>api.request(method,input)
 const menuDOM=code=>menu.webContents.executeJavaScript(code)
 const command=async(method,params)=>{if(!menu.webContents.debugger.isAttached())menu.webContents.debugger.attach('1.3');return menu.webContents.debugger.sendCommand(method,params)}
 const locateMenu=()=>{menuView=win.contentView.children.find(view=>view.webContents&&!view.webContents.isDestroyed()&&view.webContents.getTitle()==='Browser menu overlay');menu=menuView?{webContents:menuView.webContents}:undefined;return menuView?.getVisible()===true}
 const activeMenu=async()=>locateMenu()&&menuDOM('!!document.querySelector("[data-native-control]")')
 const shown=async(label)=>{await until(async()=>await activeMenu()&&painted?.id===wireState?.id&&painted?._request===wireState?._request&&webContents.getFocusedWebContents()===menu.webContents,label+' painted and focused');assert.equal(pageView.getVisible(),true,'webpage stays visible');assert.equal(page.getBackgroundThrottling(),false,'webpage remains awake');assert.equal(await ui('qa.diagnostics().images'),0,'no webpage bitmap cover');assert.equal(captureCalls,0,'menu route never calls capturePage');return menuView.getBounds()}
 const clickNative=async selector=>{const point=await menuDOM(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing native menu control');const r=el.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);menu.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});menu.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point})}
 const key=(name,modifiers=[])=>{const keyCode=({ArrowDown:'Down',ArrowUp:'Up',ArrowLeft:'Left',ArrowRight:'Right'})[name]||name;menu.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});menu.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers})}
 const live=()=>page.executeJavaScript('({...window.live,cursor:document.querySelector("video").currentTime})')
 const advancing=async()=>{const before=await live();await until(async()=>{const after=await live();return after.timer>before.timer+2&&after.raf>before.raf+2&&after.video>before.video+1},'timer, animation and video continue under native menu');const after=await live();return{before,after}}
 const ax=async wc=>{if(!wc.debugger.isAttached())wc.debugger.attach('1.3');return(await wc.debugger.sendCommand('Accessibility.getFullAXTree')).nodes}
 const check=async(name,run)=>{if(config.initialPass&&/delayed replacement|temporary data|zoom|retired menu|closing the workspace|passive tooltip|transparent shadow/.test(name))return;phase=name;const at=performance.now(),detail=await run();checks.push({name,passed:true,ms:performance.now()-at,...(detail?{detail}:{})})}
 const dismiss=async()=>{await ui('qa.dismiss()');await until(()=>!locateMenu(),'native menu dismissed')}
 const diagnostics=async()=>({phase,error:null,window:win&&!win.isDestroyed()?{visible:win.isVisible(),focused:win.isFocused(),bounds:win.getContentBounds(),zoom:win.webContents.getZoomFactor()}:undefined,views:win&&!win.isDestroyed()?win.contentView.children.filter(view=>view.webContents&&!view.webContents.isDestroyed()).map(view=>({title:view.webContents.getTitle(),url:view.webContents.getURL().slice(0,160),visible:view.getVisible(),bounds:view.getBounds(),zoom:view.webContents.getZoomFactor()})):[],renderer:await Promise.race([ui('qa.diagnostics()'),pause(500).then(()=>({timeout:true}))]).catch(error=>({error:String(error)})),checks,timings,captureCalls,trace})
 try{
  await app.whenReady()
  ipcMain.on('qa:renderer-error',(_,error)=>record('renderer-error',{error}))
  ipcMain.on('qa:focus',(_,input)=>record('source-focus',input))
  const ignoreMouseEvents=BrowserWindow.prototype.setIgnoreMouseEvents;BrowserWindow.prototype.setIgnoreMouseEvents=function(ignore,options){passiveInput.set(this.id,{ignore,options});return ignoreMouseEvents.call(this,ignore,options)}
  app.on('web-contents-created',(_,contents)=>{contents.on('focus',()=>record('wc-focus',{id:contents.id,title:contents.getTitle()}));contents.on('blur',()=>record('wc-blur',{id:contents.id,title:contents.getTitle()}));const send=contents.send.bind(contents);contents.send=(channel,...args)=>{if(channel==='browser-app:menu-state'){wireState=structuredClone(args[0]);record('native-state',{id:wireState.id,revision:wireState.revision});if(holdMenuStates){heldMenuStates.push(()=>send(channel,...args));return}}return send(channel,...args)}})
  ipcMain.on('browser-app:menu-action',(_,action)=>{if(action?.kind==='painted')painted=action;record('native-action',{actionKind:action?.kind,id:action?.id,revision:action?.revision,controlId:action?.controlId})})
  app.on('session-created',session=>session.protocol.handle('https',()=>new Response(`<!doctype html><title>Live menu fixture</title><style>html,body{margin:0;background:#141414;color:#f5f5f5;font:24px system-ui}button{position:fixed;left:30px;bottom:30px;padding:20px}video{width:320px;height:180px}canvas{display:none}</style><h1>Live synthetic webpage</h1><video muted autoplay playsinline></video><canvas width=320 height=180></canvas><button id=outside>First outside click</button><script>window.live={timer:0,raf:0,video:0,click:0};setInterval(()=>live.timer++,20);const canvas=document.querySelector('canvas'),context=canvas.getContext('2d');function frame(){live.raf++;context.fillStyle='hsl('+live.raf%360+' 70% 45%)';context.fillRect(0,0,320,180);requestAnimationFrame(frame)}requestAnimationFrame(frame);const video=document.querySelector('video');video.srcObject=canvas.captureStream(30);video.play();function videoFrame(){live.video++;video.requestVideoFrameCallback(videoFrame)}video.requestVideoFrameCallback(videoFrame);document.querySelector('#outside').onclick=()=>live.click++;</script>`,{headers:{'content-type':'text/html'}})))
  display=screen.getAllDisplays().sort((a,b)=>b.size.width*b.size.height*b.scaleFactor*b.scaleFactor-a.size.width*a.size.height*a.scaleFactor*a.scaleFactor)[0];scale=display.scaleFactor
  record('display',{id:display.id,scale,workArea:display.workArea,pixels:{width:display.size.width*scale,height:display.size.height*scale}})
  win=new BrowserWindow({x:display.workArea.x+16,y:display.workArea.y+16,width:Math.ceil(4480/scale),height:Math.ceil(2500/scale),show:false,webPreferences:{preload:config.preload,sandbox:true,contextIsolation:true,nodeIntegration:false}})
  win.setContentSize(Math.ceil(4480/scale),Math.ceil(2500/scale))
  const tracedIpc={handle:(channel,handler)=>ipcMain.handle(channel,(event,method,input)=>{if(method==='menu')menuRequests++;record(method,method==='menu'?{id:input?.id,revision:input?.revision,owner:input?.owner,tabId:input?.tabId,url:input?.url,bounds:input?.bounds,htmlBytes:input?.html?.length,cssBytes:input?.css?.length}:input);return handler(event,method,input)}),removeHandler:channel=>ipcMain.removeHandler(channel)}
  api=registerBrowserApp({ipcMain:tracedIpc,getMainWindow:()=>win,root:config.state,menuPreload:config.menuPreload,materialDirectory:async()=>config.materials})
  server=createServer((_request,response)=>{response.writeHead(200,{'content-type':'text/html'});response.end('<!doctype html><style>body{margin:0;background:#111}[data-dsh-sidebar-root]{position:fixed;left:0;top:0;bottom:0;width:64px}.pI_x6G_centerCol{position:fixed;left:64px;right:24px;top:10px;bottom:10px}</style><aside data-dsh-sidebar-root></aside><main class="pI_x6G_centerCol"></main>')});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
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

  for(const [label,selector]of [['tab-list','[data-action=tab-list]'],['more','[data-action=menu]'],['bookmarks','.eb-toolbar [data-action=bookmarks]']])await check(label+' opens above a live 4K webpage',async()=>{
   const at=performance.now();await ui('qa.click('+JSON.stringify(selector)+')');const bounds=await shown(label);timings.push({label,ms:performance.now()-at});const movement=await advancing();const nativeBounds=pageView.getBounds();assert.ok(nativeBounds.width*scale>=3840&&nativeBounds.height*scale>=2160,'native webpage has at least 4K backing dimensions');await dismiss();return{bounds,nativeBounds,scale,...movement}
  })
  await check('global sidebar More uses the same live native menu',async()=>{await ui('qa.global()');await shown('global More');const movement=await advancing();assert.ok(await menuDOM('document.body.textContent.includes("Plugins")'));await dismiss();return movement})
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

  const report={electron:process.versions.electron,chrome:process.versions.chrome,temporaryProfile:true,initialPass:config.initialPass,display:{id:display.id,scale,bounds:display.bounds},checks,timings,captureCalls,trace}
  await writeFile(join(config.evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));api.dispose();server.close();win.destroy();app.exit(0)
 }catch(error){const failure=await diagnostics();failure.error=String(error?.stack||error);await writeFile(join(config.evidence,'failure.json'),JSON.stringify(failure,null,2));console.error(JSON.stringify(failure,null,2));api?.dispose();server?.close();win?.destroy();app.exit(1)}
}

await build({stdin:{resolveDir:root,contents:`import {contextBridge,ipcRenderer} from 'electron';import {BrowserAppView} from './src/preload/browser/view';import {NativeBrowserMenuProjection} from './src/preload/browser/native-menus';import {WorkspaceSurfaceHost} from './src/preload/workspace-surface-host';import {ScheduledTaskView} from './src/preload/scheduled/view';import {scheduledStyles} from './src/preload/scheduled/style';(${rendererFixture.toString()})();`},bundle:true,platform:'node',format:'cjs',outfile:preload,external:['electron'],plugins:[inline],logLevel:'silent'})
const config={profile:join(scratch,'profile'),state:join(scratch,'state'),materials:join(scratch,'materials'),evidence,preload,menuPreload:join(root,'src/preload/browser/menu-preload.cjs'),initialPass:process.env.BROWSER_LIVE_MENU_INITIAL_PASS==='1'}
await build({stdin:{resolveDir:root,contents:`import {registerBrowserApp} from './src/main/browser/service';const {join}=require('node:path');(${nativeFixture.toString()})(${JSON.stringify(config)});`},bundle:true,platform:'node',format:'cjs',outfile:entry,external:['electron'],logLevel:'silent'})
const code=await new Promise((done,reject)=>{
 const child=spawn(require('electron'),[entry],{env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:'inherit'}),timer=setTimeout(()=>child.kill('SIGTERM'),60000)
 child.on('error',reject);child.on('exit',(code,signal)=>{clearTimeout(timer);if(signal)console.error('Live menu acceptance terminated:',signal);done(code??1)})
})
console.log('Live menu evidence:',evidence)
if(code!==0)process.exitCode=code
