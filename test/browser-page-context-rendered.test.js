import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile,mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

let browser,code
const evidence='/tmp/browser-page-context-rendered-20261110'
// The board's base rules are supplied by its original client module; the final
// shell owns the shared geometry, typography and material overrides.
const boardBase='.rScV5Q_contextMenu{position:absolute;min-width:136px;padding:4px;border-radius:9px}.rScV5Q_contextMenu button{box-sizing:border-box;width:100%;height:30px;padding:0 9px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);text-align:left;font:inherit;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:20px}.rScV5Q_contextMenu button:disabled{opacity:.45;cursor:default}'
beforeAll(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),contents:`import {mountDesktopShellStyles} from './src/preload/shell-style';import {BrowserAppView} from './src/preload/browser/view';import {NativeBrowserMenuProjection} from './src/preload/browser/native-menus';mountDesktopShellStyles(document);
const tab={id:'A',url:'https://page.example.test/a',title:'Original webpage',private:false,pinned:false,muted:false,zoom:1.1,loading:false,canBack:false,canForward:false};const state={tabs:[tab,{...tab,id:'B',url:'https://page.example.test/b'}],activeId:'A',history:[],closed:[],bookmarks:[],folders:[],downloads:[],settings:{engine:'Google',startup:'restore',bookmarksBar:true,askDownload:false,downloadPath:''}};let receive,surface='browser';window.calls=[];window.publish=patch=>{Object.assign(state,patch);receive(structuredClone(state))};window.payload=patch=>({contextToken:'context-A',tabId:'A',url:tab.url,ownerSessionId:'owner-A',x:750,y:520,items:[{id:'copy',label:'复制',shortcut:'⌘C'},{id:'disabled',label:'不可用',enabled:false},{id:'line',separator:true},{id:'ask',label:'框选并询问AI'}],...patch});const request=async(method,input={})=>{window.calls.push([method,input]);if(method==='capture')throw Error('Menu must keep the original webpage live');if(method==='translation-restore'){state.translation={state:'idle',completed:0,total:0,canRestore:false};return structuredClone(state)}if(method==='snapshot'||method==='select')return structuredClone(state);if(method==='context-command'&&window.rejectCommand)throw Error('旧菜单已失效');return true};window.view=new BrowserAppView(document,{request,subscribe:fn=>{receive=fn;return()=>{}},source:async()=>{}},{register:(_name,el)=>document.body.append(el),open:()=>{surface='browser'},close:()=>{surface='chat'},current:()=>({surface})});window.openPageMenu=patch=>window.view.pageContextMenu(window.payload(patch));window.changeOwner=id=>document.dispatchEvent(new CustomEvent('sherlock:browser-context',{detail:{sessionId:id}}));window.leaveBrowser=()=>{surface='chat';document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change'))};window.startProjection=()=>{Object.defineProperty(navigator,'platform',{configurable:true,value:'MacIntel'});window.publish({nativeMenus:true});window.projection=new NativeBrowserMenuProjection(document,{request,subscribeAction:fn=>{window.nativeAction=fn;return()=>{}}})};window.view.open('owner-A');`},bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent',plugins:[{name:'inline',setup(b){b.onResolve({filter:/\?(inline|raw)$/},async args=>{const result=await b.resolve(args.path.replace(/\?(inline|raw)$/,''),{resolveDir:args.resolveDir,kind:args.kind});return{path:result.path,namespace:'inline'}});b.onLoad({filter:/.*/,namespace:'inline'},async args=>({contents:JSON.stringify(args.path.endsWith('.svg')?'data:image/svg+xml,'+encodeURIComponent(await readFile(args.path,'utf8')):await readFile(args.path,'utf8')),loader:'json'}))}}]})
 code=result.outputFiles[0].text;const pw=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href):await import('playwright');browser=await pw.chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});await mkdir(evidence,{recursive:true})
},20000)
afterAll(async()=>browser?.close())
async function fixture({dark=false,width=800,height=600}={}){const page=await browser.newPage({viewport:{width,height}}),errors=[];page.setDefaultTimeout(1800);page.on('pageerror',error=>errors.push(error.message));await page.route('http://127.0.0.1:59560/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'}));await page.goto('http://127.0.0.1:59560/');await page.setContent(`<html><head><style>${boardBase}body{margin:0;--odyssey-font-ui:Inter,'Noto Sans SC',system-ui;--odyssey-text:${dark?'#eee':'#292b2f'}}.pI_x6G_centerCol{position:fixed;left:10px;right:10px;top:10px;bottom:10px}</style></head><body ${dark?'data-ds-dark-theme':''}><main class="pI_x6G_centerCol" style="position:fixed;left:10px;right:10px;top:10px;bottom:10px;margin:0;width:auto;height:auto"></main><button id="outside" style="position:fixed;left:0;top:0;z-index:4000" onclick="window.outsideClicks=(window.outsideClicks||0)+1">外部按钮</button></body></html>`);await page.addScriptTag({content:code});await page.locator('.eb-root:not([hidden])').waitFor();return{page,errors}}
const menu=page=>page.locator('[data-browser-page-context-menu]')
const commands=page=>page.evaluate(()=>window.calls.filter(([method])=>method==='context-command'))
it('keeps the sidebar menu in the shell during Explore entry and restores the same native tab when it ends',async()=>{
 const {page}=await fixture()
 try{
  await page.evaluate(()=>window.startProjection())
  await page.locator('.eb-root[data-native-page=true][data-tab-id=A]').waitFor()
  await page.evaluate(()=>{
   document.body.dataset.homeGuideEntryRun='demo-run'
   const popup=document.createElement('div')
   popup.className='st-menu'
   popup.dataset.sidebarMore='true'
   popup.style.cssText='position:fixed;left:70px;top:280px;width:220px;height:90px;z-index:4000'
   popup.innerHTML='<button role="menuitem">新建表格</button>'
   document.body.append(popup)
  })
  await page.locator('.eb-root[data-native-page=false][data-tab-id=A]').waitFor()
  const layout=()=>page.evaluate(()=>window.calls.filter(([method])=>method==='layout').at(-1)?.[1])
  expect(await layout()).toMatchObject({active:true,visible:false,sessionId:'owner-A'})
  expect(await page.getByRole('menuitem',{name:'新建表格'}).isVisible()).toBe(true)
  expect(await page.locator('.st-menu').getAttribute('data-browser-projected')).toBeNull()
  await page.evaluate(()=>{document.querySelector('.st-menu')?.remove();delete document.body.dataset.homeGuideEntryRun})
  await page.locator('.eb-root[data-native-page=true][data-tab-id=A]').waitFor()
  expect(await layout()).toMatchObject({active:true,visible:true,sessionId:'owner-A'})
 }finally{await page.close()}
})
it('dismisses a shell workspace menu from the active native webpage only',async()=>{
 const {page}=await fixture({width:1200})
 try{
  await page.evaluate(()=>{
   document.querySelector('.pI_x6G_centerCol').style.right='260px'
   window.startProjection()
   const chooser=document.createElement('div')
   chooser.setAttribute('role','menu')
   chooser.id='right-workspace-menu'
   chooser.style.cssText='position:fixed;inset:40px 10px auto auto;width:200px;height:120px;z-index:4000'
   chooser.innerHTML='<input aria-label="搜索工作区">'
   document.body.append(chooser)
   document.addEventListener('pointerdown',event=>{
    if(!chooser.contains(event.target))chooser.remove()
   })
  })
  await page.locator('.eb-root[data-native-page=true][data-tab-id=A]').waitFor()
  const chooser=page.locator('#right-workspace-menu')
  await chooser.getByRole('textbox',{name:'搜索工作区'}).click()
  await page.evaluate(()=>window.projection.pagePointerDown('B'))
  expect(await chooser.isVisible()).toBe(true)
  await page.evaluate(()=>window.projection.pagePointerDown('A'))
  expect(await chooser.count()).toBe(0)
 }finally{await page.close()}
})
it('renders projected context-row hover feedback over the frozen base paint',async()=>{
 const{page}=await fixture({dark:true}),projectedPage=await browser.newPage({viewport:{width:320,height:280}})
 try{await page.evaluate(()=>{window.startProjection();window.openPageMenu()});await expect.poll(()=>page.evaluate(()=>window.calls.filter(([method])=>method==='menu').length)).toBeGreaterThan(0)
  const state=await page.evaluate(()=>window.calls.filter(([method])=>method==='menu').at(-1)[1])
  await projectedPage.setContent('<!doctype html>');await projectedPage.evaluate(source=>{window.handlers={};window.require=()=>({ipcRenderer:{on:(name,fn)=>window.handlers[name]=fn,send:()=>{}}});(0,eval)(source);window.dispatchEvent(new Event('DOMContentLoaded'))},await readFile('src/preload/browser/menu-preload.cjs','utf8'))
  await projectedPage.evaluate(state=>window.handlers['browser-app:menu-state']({},state),state)
  const row=projectedPage.getByRole('menuitem',{name:'复制',exact:true});await row.waitFor();const before=await row.evaluate(el=>getComputedStyle(el).backgroundColor)
  // A non-key native popup can deliver movement without Chromium setting :hover.
  await row.evaluate(el=>el.dispatchEvent(new PointerEvent('pointerover',{bubbles:true})))
  expect(await row.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(before)
  await projectedPage.evaluate(state=>window.handlers['browser-app:menu-state']({},state),state);expect(await row.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(before)
 }finally{await page.close();await projectedPage.close()}
})

it('keeps translation state clear of the address box',async()=>{const{page}=await fixture();try{await page.evaluate(()=>window.publish({translation:{state:'translated',completed:10,total:10,canRestore:true}}));const gap=await page.locator('.eb-translation-status').evaluate(el=>el.getBoundingClientRect().left-document.querySelector('.eb-address-wrap').getBoundingClientRect().right);expect(gap).toBeGreaterThanOrEqual(10)}finally{await page.close()}})
for(const dark of [false,true])it(`reuses the board right-click geometry and shared ${dark?'dark':'light'} material`,async()=>{
 const{page,errors}=await fixture({dark});try{await page.evaluate(()=>window.openPageMenu());const actual=menu(page);await actual.waitFor();expect(await actual.getAttribute('class')).toContain('rScV5Q_contextMenu');expect(await actual.getAttribute('class')).toContain('ew-grid-context-menu');expect(await actual.getAttribute('role')).toBe('menu')
  const metrics=await actual.evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect(),row=el.querySelector('button'),rs=getComputedStyle(row);return{width:r.width,right:r.right,bottom:r.bottom,radius:s.borderRadius,padding:s.padding,font:s.fontSize,line:s.lineHeight,background:s.backgroundColor,rowHeight:row.getBoundingClientRect().height,rowFont:rs.fontSize,key:getComputedStyle(el.querySelector('.rScV5Q_contextMenuShortcut')).fontSize,overflow:el.scrollWidth>el.clientWidth}})
  expect(metrics).toMatchObject({width:240,radius:'10px',padding:'5px',font:'13px',line:'20px',rowHeight:34,rowFont:'13px',key:'11px',background:dark?'rgba(43, 43, 43, 0.68)':'rgba(255, 255, 255, 0.78)',overflow:false});expect(metrics.right).toBeLessThanOrEqual(788);expect(metrics.bottom).toBeLessThanOrEqual(588)
  expect(await actual.locator('[role=separator]').count()).toBe(1);expect(await actual.getByRole('menuitem',{name:'不可用'}).isDisabled()).toBe(true);await page.screenshot({path:evidence+'/'+(dark?'dark':'light')+'.png'});expect(errors).toEqual([])
 }finally{await page.close()}
})
it('dispatches one finite command, keeps markup inert and rejects stale owner or detached item actions',async()=>{
 const{page,errors}=await fixture();try{await page.evaluate(()=>window.openPageMenu({items:[{id:'safe',label:'<img src=x onerror="throw Error(1)">'}]}));expect(await menu(page).locator('img').count()).toBe(0);await menu(page).getByRole('menuitem').click();expect(await commands(page)).toEqual([['context-command',{contextToken:'context-A',itemId:'safe'}]])
  await page.evaluate(()=>{window.openPageMenu();window.oldRow=document.querySelector('[data-browser-page-context-menu] button');window.changeOwner('owner-B');window.oldRow.click();window.openPageMenu()});expect(await menu(page).count()).toBe(0);expect(await commands(page)).toHaveLength(1);expect(errors).toEqual([])
 }finally{await page.close()}
})
it('navigates enabled rows with keyboard and closes without swallowing the first outside click',async()=>{
 const{page}=await fixture();try{await page.evaluate(()=>window.openPageMenu());await page.keyboard.press('ArrowDown');expect(await menu(page).getByRole('menuitem',{name:'框选并询问AI'}).evaluate(el=>document.activeElement===el)).toBe(true);await page.keyboard.press('Home');await page.keyboard.press('Tab');await page.keyboard.press('Enter');expect(await commands(page)).toEqual([['context-command',{contextToken:'context-A',itemId:'ask'}]]);expect(await menu(page).count()).toBe(0)
  await page.evaluate(()=>window.openPageMenu());await page.keyboard.press('Escape');expect(await menu(page).count()).toBe(0);await page.evaluate(()=>window.openPageMenu());await page.locator('#outside').click();expect(await page.evaluate(()=>window.outsideClicks)).toBe(1);expect(await menu(page).count()).toBe(0)
 }finally{await page.close()}
})
it('keeps image saving on the authorized native command path and closes page context before a find shortcut',async()=>{
 const{page}=await fixture();try{await page.evaluate(async()=>{await window.view.contextAction({...window.payload(),action:'save-image'});window.openPageMenu()});expect(await page.evaluate(()=>window.calls.filter(([method])=>method==='save-image'))).toEqual([['save-image',{id:'A',contextToken:'context-A'}]]);await page.keyboard.press('Control+f');expect(await menu(page).count()).toBe(0);expect(await page.getByRole('textbox',{name:'查找内容'}).count()).toBe(1)
 }finally{await page.close()}
})
it('does not restore an old address or focus the source document while the webpage owns focus',async()=>{
 const{page}=await fixture();try{await page.locator('[data-field=address]').focus();await page.evaluate(()=>{Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});const original=HTMLElement.prototype.focus;window.focusCalls=[];HTMLElement.prototype.focus=function(...args){window.focusCalls.push(this.getAttribute('data-field')||this.textContent);return original.apply(this,args)};window.openPageMenu()});expect(await page.evaluate(()=>window.focusCalls)).toEqual([]);await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:browser-native-menu-dismiss')));expect(await menu(page).count()).toBe(0);expect(await page.evaluate(()=>window.focusCalls)).toEqual([])
 }finally{await page.close()}
})
for(const lifecycle of ['tab','navigation','close','surface','dispose'])it(`releases the portal menu on ${lifecycle}`,async()=>{
 const{page}=await fixture();try{await page.evaluate(()=>window.openPageMenu());await page.evaluate(kind=>{if(kind==='tab')window.publish({activeId:'B'});if(kind==='navigation')window.publish({tabs:[{...window.payload(),id:'A',title:'New document',private:false,pinned:false,muted:false,zoom:1,loading:true,canBack:false,canForward:false}]});if(kind==='close')window.view.close();if(kind==='surface')window.leaveBrowser();if(kind==='dispose')window.view.dispose()},lifecycle);expect(await menu(page).count()).toBe(0)
 }finally{await page.close()}
})
it('clamps a long menu after resize and keeps every action keyboard reachable without horizontal overflow',async()=>{
 const{page}=await fixture({width:320,height:300});try{await page.evaluate(()=>window.openPageMenu({x:319,y:299,items:Array.from({length:18},(_,i)=>({id:'item'+i,label:'动作 '+i}))}));await page.keyboard.press('End');expect(await menu(page).getByRole('menuitem',{name:'动作 17',exact:true}).evaluate(el=>document.activeElement===el)).toBe(true);await page.setViewportSize({width:280,height:220});await expect.poll(()=>menu(page).evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(268);expect(await menu(page).evaluate(el=>el.scrollWidth===el.clientWidth&&el.getBoundingClientRect().bottom<=208)).toBe(true);await page.keyboard.press('Enter');expect((await commands(page))[0][1].itemId).toBe('item17')
 }finally{await page.close()}
})
it('projects the trusted page context as material with finite commands and keeps Browser More opaque and the webpage live',async()=>{
 const{page,errors}=await fixture({dark:true});try{await page.evaluate(()=>{window.startProjection();window.openPageMenu()});await expect.poll(()=>page.evaluate(()=>window.calls.filter(([method])=>method==='menu').at(-1)?.[1].material)).toBe('menu')
  const projected=await page.evaluate(()=>window.calls.filter(([method])=>method==='menu').at(-1)[1]);expect(projected.html).toContain('data-browser-page-context-menu');expect(projected.css).toContain('rgba(255, 255, 255, 0.075)');expect(await menu(page).getAttribute('aria-hidden')).toBe('true')
  await page.evaluate(()=>{const current=window.calls.filter(([method])=>method==='menu').at(-1)[1],doc=new DOMParser().parseFromString(current.html,'text/html'),id=[...doc.querySelectorAll('button')].find(el=>el.textContent.includes('框选并询问AI')).dataset.nativeControl;window.nativeAction({id:current.id,revision:current.revision,kind:'click',controlId:id})});expect(await commands(page)).toEqual([['context-command',{contextToken:'context-A',itemId:'ask'}]])
  await page.locator('[data-action=menu]').click();await expect.poll(()=>page.evaluate(()=>window.calls.filter(([method])=>method==='menu').at(-1)?.[1].html.includes('data-browser-panel="menu"'))).toBe(true);expect(await page.evaluate(()=>window.calls.filter(([method])=>method==='menu').at(-1)[1].material)).toBeUndefined();expect(await page.evaluate(()=>window.calls.some(([method,input])=>method==='capture'||method==='layout'&&input.visible===false&&input.active))).toBe(false);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('removes the restored state button and returns its width to the address box',async()=>{const{page}=await fixture();try{const address=page.locator('.eb-address-wrap'),original=await address.evaluate(el=>el.getBoundingClientRect().width);await page.evaluate(()=>window.publish({translation:{state:'translated',completed:10,total:10,canRestore:true}}));expect(await address.evaluate(el=>el.getBoundingClientRect().width)).toBeLessThan(original);await page.locator('.eb-translation-status').click();expect(await page.locator('.eb-translation-status').count()).toBe(0);expect(await address.evaluate(el=>el.getBoundingClientRect().width)).toBeCloseTo(original,1)}finally{await page.close()}})

it('keeps translation hover paint padded even under host button reset styles',async()=>{const{page}=await fixture();try{await page.addStyleTag({content:'body button{padding:0!important;min-height:0!important}'});await page.evaluate(()=>window.publish({translation:{state:'partial',completed:2,total:8,canRestore:true}}));const button=page.locator('.eb-translation-status');await button.hover();const m=await button.evaluate(el=>{const s=getComputedStyle(el);return{left:parseFloat(s.paddingLeft),right:parseFloat(s.paddingRight),top:parseFloat(s.paddingTop),bottom:parseFloat(s.paddingBottom),height:el.getBoundingClientRect().height}});expect(m.left).toBeGreaterThanOrEqual(10);expect(m.right).toBeGreaterThanOrEqual(10);expect(m.top).toBeGreaterThanOrEqual(6);expect(m.bottom).toBeGreaterThanOrEqual(6);expect(m.height).toBeGreaterThanOrEqual(32);expect(await button.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')}finally{await page.close()}})

it.each([false, true])('projects the complete composer flyout over a live webpage (dark: %s)', async dark => {
 const {page}=await fixture({dark,width:1200})
 try{
  await page.evaluate(()=>{
   document.body.dataset.workspaceSurface='browser'
   document.querySelector('.pI_x6G_centerCol').style.right='300px'
   window.startProjection()
   const card=document.createElement('div')
   card.className='mufS8W_card'
   card.dataset.eworkCommand='model'
   card.dataset.eworkCascadeSide='left'
   card.style.cssText='position:fixed;top:8px;left:600px;width:264px;display:flex;flex-direction:column;background:#333a'
   card.setAttribute('popover','manual')
   card.innerHTML='<input aria-label="搜索模型"><div role="listbox" class="mufS8W_viewport" style="overflow-y:auto">' +
     Array.from({length:60},(_,index)=>'<button role="option" style="display:block;height:36px">模型 '+index+'</button>').join('')+'</div>'
   document.body.append(card)
   card.showPopover()
   card.querySelector('input').focus()
   card.lastElementChild.addEventListener('click',event=>{window.model=event.target.textContent})
  })
  await expect.poll(()=>page.evaluate(()=>window.calls.filter(([method])=>method==='menu').at(-1)?.[1].html.includes('搜索模型'))).toBe(true)
  const result=await page.evaluate(()=>{
   const card=document.querySelector('.mufS8W_card')
   const current=window.calls.filter(([method])=>method==='menu').at(-1)[1]
   const projected=new DOMParser().parseFromString(current.html,'text/html')
   const root=projected.querySelector('[data-native-menu-root]')
   const list=root.querySelector('[role=listbox]')
   window.nativeAction({id:current.id,revision:current.revision,kind:'scroll',controlId:list.dataset.nativeControl,scrollTop:1024})
   window.nativeAction({id:current.id,revision:current.revision,kind:'click',controlId:list.lastElementChild.dataset.nativeControl})
   return {background:root.style.backgroundColor,manual:root.hasAttribute('popover'),scroll:card.lastElementChild.scrollTop,
    viewportHeight:card.lastElementChild.clientHeight,viewportScrollHeight:card.lastElementChild.scrollHeight,model:window.model}
  })
  expect(result).toMatchObject({background:dark?'rgb(38, 38, 38)':'rgb(246, 246, 246)',manual:false,model:'模型 59'})
  expect(result.viewportHeight).toBeLessThanOrEqual(420)
  expect(result.viewportScrollHeight).toBeGreaterThan(result.viewportHeight)
  expect(result.scroll).toBeGreaterThan(0)
 }finally{await page.close()}
})

it('projects a download menu and its simultaneous toast above the native page independently',async()=>{
 const {page}=await fixture({width:1200})
 try{
  await page.evaluate(()=>{
   window.startProjection()
   const menu=document.createElement('div')
   menu.setAttribute('role','menu')
   menu.style.cssText='position:fixed;left:400px;top:140px;width:250px;height:140px'
   menu.innerHTML='<button role="menuitem">加入工作材料</button>'
   const toast=document.createElement('div')
   toast.className='eb-toast'
   toast.setAttribute('role','status')
   toast.style.cssText='position:fixed;left:100px;top:100px;width:440px;height:70px;pointer-events:none'
   toast.textContent='原文件已移动或删除，已打开下载文件夹。'
   document.body.append(menu,toast)
  })
  const surfaces=()=>page.evaluate(()=>window.calls.filter(([method])=>method==='menu').map(([,state])=>({id:state.id,passive:state.passive,text:state.html})))
  await expect.poll(async()=> (await surfaces()).some(s=>s.passive&&s.text.includes('原文件已移动'))).toBe(true)
  const active=(await surfaces()).find(s=>!s.passive&&s.text.includes('加入工作材料'))
  expect(active).toBeTruthy()
  await page.evaluate(()=>document.querySelector('.eb-toast').remove())
  await expect.poll(()=>page.evaluate(()=>window.calls.some(([method,arg])=>method==='menu-hide'&&arg.passive))).toBe(true)
  expect(await page.locator('[role=menu][data-browser-projected]').count()).toBe(1)
  expect(await page.evaluate(id=>window.calls.some(([method,arg])=>method==='menu-hide'&&arg.id===id),active.id)).toBe(false)
 }finally{await page.close()}
})
