import {beforeAll,afterAll,it,expect} from 'vitest'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
let browser,code
const evidence=process.env.BROWSER_APP_EVIDENCE||'/tmp/browser-app-figma-20261109'
beforeAll(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),contents:`import {mountDesktopShellStyles} from './src/preload/shell-style';mountDesktopShellStyles(document);import {BrowserAppView} from './src/preload/browser/view';import {scheduledStyles} from './src/preload/scheduled/style';import {ScheduledTaskView} from './src/preload/scheduled/view';window.scheduledMenuView=new ScheduledTaskView(document,{});const railStyle=document.createElement('style');railStyle.textContent=scheduledStyles;document.head.append(railStyle);
let listener;let n=0;const data={tabs:[{id:'tab0',url:'',title:'新标签页',private:false,pinned:false,muted:false,zoom:1,loading:false,canBack:false,canForward:false}],activeId:'tab0',history:[],closed:[],bookmarks:[],folders:[],downloads:[],settings:{engine:'Google',startup:'restore',bookmarksBar:true,askDownload:false,downloadPath:''}};
window.setBrowserState=value=>{Object.assign(data,value);listener(structuredClone(data))};window.browserCalls=[];window.snapshot=()=>structuredClone(data);window.update=()=>listener(structuredClone(data));
const bridge={subscribe:f=>{listener=f;return()=>{}},source:async(...args)=>window.browserCalls.push(['source',...args]),request:async(method,input={})=>{if(method==='site')return{permissions:data.sitePermissions??{}};window.browserCalls.push([method,input]);const t=data.tabs.find(t=>t.id===data.activeId);if(method==='capture'){if(window.browserCapture)return await window.browserCapture();const c=document.createElement('canvas');c.width=20;c.height=20;return c.toDataURL()};if(method==='new'){const tab={...t,id:'tab'+(++n),title:input.url?'Example Domain':'新标签页',url:input.url??'',private:!!input.private};delete tab.page;data.tabs.push(tab);data.activeId=tab.id}if(method==='internal-page'){let page=data.tabs.find(tab=>tab.page===input.page);if(!page){page={...t,id:'tab'+(++n),url:'',page:input.page,title:input.page==='history'?'历史记录':'下载内容',private:false,loading:false,canBack:false,canForward:false};data.tabs.push(page)}data.activeId=page.id}if(method==='select')data.activeId=input.id;if(method==='reorder'){const tab=data.tabs.find(t=>t.id===input.id),before=data.tabs.find(t=>t.id===input.beforeId);if(tab&&tab!==before){data.tabs.splice(data.tabs.indexOf(tab),1);data.tabs.splice(before?data.tabs.indexOf(before):data.tabs.length,0,tab)}}if(method==='zoom')data.tabs.find(tab=>tab.id===input.id).zoom=input.value;if(method==='close'){const index=data.tabs.findIndex(t=>t.id===input.id);data.tabs.splice(index,1);if(data.activeId===input.id)data.activeId=data.tabs[Math.min(index,data.tabs.length-1)].id}if(method==='home'){delete t.page;t.url='';t.title='新标签页';t.canBack=false;t.canForward=false}if(method==='history-remove')data.history=data.history.filter(row=>row.id!==input.id);if(method==='navigate'){delete t.page;t.url=input.url;t.title='Example Domain';data.history.unshift({id:'h'+n,url:input.url,title:t.title,at:Date.now()})}if(method==='bookmark'){const old=data.bookmarks.find(b=>b.url===input.url);if(input.remove)data.bookmarks=data.bookmarks.filter(b=>b.url!==input.url);else if(old)Object.assign(old,{title:input.title,folder:input.folder});else data.bookmarks.push({id:'b'+n,url:input.url,title:input.title,folder:input.folder,at:Date.now()})}if(method==='bookmark-update')Object.assign(data.bookmarks.find(b=>b.id===input.id),input);if(method==='bookmarks-remove')data.bookmarks=data.bookmarks.filter(b=>!input.ids.includes(b.id));if(method==='folder')data.folders.push(input.name);if(method==='settings')Object.assign(data.settings,input);if(method==='clear'&&input.history)data.history=[];if(method==='find')t.find={matches:6,activeMatchOrdinal:1};return structuredClone(data)}};
let surface='browser';window.workspaceReveals=0;const host={register:(_name,el)=>document.body.append(el),open:()=>{surface='browser'},close:()=>{surface=undefined},revealConversation:()=>{surface=undefined;window.workspaceReveals++;document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change'))},current:()=>surface?{surface}:undefined};window.browserView=new BrowserAppView(document,bridge,host);window.browserView.open('session-A');`},bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent',plugins:[{name:'inline',setup(b){b.onResolve({filter:/\?(inline|raw)$/},async args=>{const r=await b.resolve(args.path.replace(/\?(inline|raw)$/,''),{resolveDir:args.resolveDir,kind:args.kind});return{path:r.path,namespace:'inline'}});b.onLoad({filter:/.*/,namespace:'inline'},async args=>({contents:JSON.stringify(args.path.endsWith('.svg')?'data:image/svg+xml,'+encodeURIComponent((await readFile(args.path,'utf8')).replaceAll(String.fromCharCode(34),String.fromCharCode(39))):await readFile(args.path,'utf8')),loader:'json'}))}}]});code=result.outputFiles[0].text
 const pw=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href):await import('playwright');browser=await pw.chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});await mkdir(evidence,{recursive:true})
},20000)
afterAll(async()=>browser?.close())
async function fixture(width=1920,height=1080,dark=true){const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setContent(`<html><head><style>body{margin:0;background:#151515}.pI_x6G_centerCol{position:fixed;left:${width===1920?306:64}px;top:10px;right:${width===1920?420:10}px;bottom:10px}</style></head><body ${dark?'data-ds-dark-theme':''}><main class="pI_x6G_centerCol" style="position:fixed;left:${width===1920?306:64}px;right:${width===1920?420:10}px;top:10px;bottom:10px;width:auto;height:auto;margin:0;box-sizing:border-box"></main></body></html>`);await page.addScriptTag({content:code});await page.getByRole('heading',{name:'从这里，打开一个新视野。'}).waitFor();return {page,errors}}
// This fixture exercises DOM menus (nativeMenus is absent/false). Electron overlay
// hit testing and compositor stacking are verified by the native menu QA script.
async function liveWebsite(page,url='https://example.com/'){
 await page.evaluate(url=>{const state=window.snapshot(),tab=state.tabs.find(t=>t.id===state.activeId);delete tab.page;tab.url=url;tab.title='Live webpage';window.setBrowserState(state)},url)
 await expect.poll(()=>page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='layout').at(-1)?.[1].visible)).toBe(true)
 await page.evaluate(()=>window.liveCallStart=window.browserCalls.length)
}
async function expectLivePage(page,captures=0){
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
 const calls=await page.evaluate(()=>({last:window.browserCalls.filter(c=>c[0]==='layout').at(-1)?.[1],recent:window.browserCalls.slice(window.liveCallStart??0)}))
 expect(calls.last?.visible).toBe(true);expect(calls.recent.filter(c=>c[0]==='layout'&&c[1].visible===false)).toEqual([]);expect(calls.recent.filter(c=>c[0]==='capture')).toHaveLength(captures);expect(await page.locator('.eb-page-image').count()).toBe(0)
}
async function globalMenuAnchor(page,label,id='global-menu-anchor'){
 await page.evaluate(({label,id})=>{const anchor=document.createElement('button');anchor.id=id;anchor.textContent=label;anchor.style.cssText='position:fixed;left:12px;top:200px;width:36px;height:36px';window.globalActions=[];anchor.onclick=()=>window.scheduledMenuView.showMenu(anchor,[{label:'插件',run:()=>window.globalActions.push('plugins')},{label:'定时任务',run:()=>window.globalActions.push('scheduled')}]);document.body.append(anchor)},{label,id})
 return page.getByRole('button',{name:label,exact:true})
}
for(const dark of [false,true])it(`rotates a loading tab before restoring its favicon and gives inactive tabs a gentle hover in ${dark?'dark':'light'}`,async()=>{
 const{page,errors}=await fixture(1440,900,dark);try{
  await page.evaluate(()=>{const base=window.snapshot().tabs[0],canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;canvas.getContext('2d').fillRect(0,0,32,32);const favicon=canvas.toDataURL();window.setBrowserState({tabs:[{...base,id:'ready',title:'当前网页',url:'https://ready.example/',favicon},{...base,id:'loading',title:'正在加载网页',url:'https://loading.example/',favicon,loading:true}],activeId:'ready'})})
  const selected=page.locator('.eb-tab[data-id=ready]'),tab=page.locator('.eb-tab[data-id=loading]'),spinner=tab.locator('.eb-tab-loading>.eb-icon');expect(await tab.locator('img').count()).toBe(0)
  await expect.poll(()=>spinner.evaluate(el=>el.getAnimations()[0]?.currentTime??0)).toBeGreaterThan(80);const rotation=await spinner.evaluate(el=>getComputedStyle(el).transform);await expect.poll(()=>spinner.evaluate(el=>getComputedStyle(el).transform)).not.toBe(rotation)
  await page.mouse.move(0,899);const before=await tab.evaluate(el=>({color:getComputedStyle(el).backgroundColor,width:el.getBoundingClientRect().width})),activeColor=await selected.evaluate(el=>getComputedStyle(el).backgroundColor)
  await tab.hover();await expect.poll(()=>tab.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(before.color);expect(await tab.evaluate(el=>el.getBoundingClientRect().width)).toBe(before.width);expect(await selected.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(activeColor);expect(await tab.getAttribute('aria-selected')).toBe('false')
  await page.locator('.eb-tabs').screenshot({path:evidence+'/tab-hover-loading-'+(dark?'dark':'light')+'.png'})
  await page.emulateMedia({reducedMotion:'reduce'});expect(await spinner.evaluate(el=>getComputedStyle(el).animationName)).toBe('none')
  await page.evaluate(()=>{const state=window.snapshot();state.tabs[1].loading=false;window.setBrowserState(state)});expect(await tab.locator('.eb-tab-loading').count()).toBe(0);expect(await tab.locator('img.eb-tab-favicon').count()).toBe(1);expect(errors).toEqual([])
 }finally{await page.close()}
})
it('shows bookmarks only at home with padded text hovers and a square tab switcher',async()=>{
 const {page}=await fixture(1440,900,true);try{
  await page.evaluate(()=>window.setBrowserState({bookmarks:[{id:'bookmark',url:'https://example.com/',title:'浏览器验收 · 一个较长的收藏标题',at:Date.now()}]}))
  for(const action of ['bookmarks','open-url']){
   const button=page.locator('.eb-bookmarks-bar [data-action='+action+']');await button.hover();const box=await button.evaluate(el=>{const s=getComputedStyle(el);return{left:parseFloat(s.paddingLeft),right:parseFloat(s.paddingRight),top:parseFloat(s.paddingTop),bottom:parseFloat(s.paddingBottom)}});expect(box).toEqual({left:8,right:8,top:4,bottom:4})
  }
  await page.getByRole('button',{name:'新标签页',exact:true}).click();const switcher=page.getByRole('button',{name:'已打开的页签',exact:true});await switcher.hover();const shape=await switcher.evaluate(el=>{const r=el.getBoundingClientRect(),i=el.firstElementChild.getBoundingClientRect();return{width:r.width,height:r.height,dx:(i.left+i.right-r.left-r.right)/2,dy:(i.top+i.bottom-r.top-r.bottom)/2}});expect(shape.width).toBe(32);expect(shape.height).toBe(32);expect(Math.abs(shape.dx)).toBeLessThan(.5);expect(Math.abs(shape.dy)).toBeLessThan(.5)
  await page.screenshot({path:evidence+'/home-bookmark-hover-dark.png'})
  const initialTop=await page.locator('[data-browser-viewport]').evaluate(el=>el.getBoundingClientRect().top)
  await page.evaluate(()=>{const state=window.snapshot(),tab=state.tabs.find(t=>t.id===state.activeId);tab.url='https://example.com/';tab.title='Example Domain';window.setBrowserState(state)})
  expect(await page.locator('.eb-bookmarks-bar').count()).toBe(0);expect(await page.locator('[data-browser-viewport]').evaluate(el=>el.getBoundingClientRect().top)).toBe(initialTop-32)
  await page.evaluate(()=>{const state=window.snapshot();state.tabs.find(t=>t.id===state.activeId).url='';window.setBrowserState(state)});expect(await page.locator('.eb-bookmarks-bar').count()).toBe(1)
 }finally{await page.close()}
})
it('anchors bookmarks to the toolbar with aligned folder-plus action, gentle lines and opaque menus',async()=>{
 const {page}=await fixture(1440,900,true);try{
  await page.evaluate(()=>{const state=window.snapshot();state.tabs[0].url='https://example.com/';state.folders=['研究资料'];window.setBrowserState(state)})
  const trigger=page.locator('.eb-toolbar [data-action=bookmarks]');await trigger.click();const panel=page.getByRole('dialog',{name:'收藏夹',exact:true}),anchor=await trigger.boundingBox(),box=await panel.boundingBox();expect(box.y-anchor.y-anchor.height).toBeGreaterThanOrEqual(4);expect(box.y-anchor.y-anchor.height).toBeLessThanOrEqual(8);expect(Math.abs(box.x+box.width-anchor.x-anchor.width)).toBeLessThan(1)
  const create=panel.getByRole('button',{name:'新建文件夹',exact:true});const align=await create.evaluate(el=>{const i=el.querySelector('.eb-icon').getBoundingClientRect(),t=el.querySelector('span')?.getBoundingClientRect();return t?Math.abs(i.y+i.height/2-t.y-t.height/2):99});expect(align).toBeLessThan(1);expect(await create.locator('.eb-icon').getAttribute('style')).not.toBe(await panel.locator('[data-action=folder-open] .eb-icon').getAttribute('style'))
  expect(await panel.evaluate(el=>getComputedStyle(el).animationName)).toBe('eb-bookmarks-in');await expect.poll(()=>panel.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');await page.screenshot({path:evidence+'/bookmarks-anchored-dark.png'});await page.emulateMedia({reducedMotion:'reduce'});expect(await panel.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');await panel.locator('[data-action=folder-open]').click();expect(await panel.count()).toBe(1);expect(await panel.getByRole('button',{name:'全部收藏',exact:true}).count()).toBe(1);await trigger.click();expect(await panel.count()).toBe(0)
  await page.getByRole('button',{name:'更多浏览器操作'}).click();const material=await page.locator('[data-browser-panel=menu]').evaluate(el=>{const s=getComputedStyle(el);return{background:s.backgroundColor,blur:s.backdropFilter,divider:getComputedStyle(el.querySelector('hr')).backgroundColor,zoom:getComputedStyle(el.querySelector('.eb-zoom-controls')).boxShadow}});expect(material.background).toBe('rgb(36, 36, 36)');expect(material.blur).toBe('none');expect(material.divider).toMatch(/0\.08/);expect(material.zoom).toMatch(/0\.08/)
 }finally{await page.close()}
})
it('matches the Figma chrome dimensions and handles actual URL, multi-tab, collection and settings controls',async()=>{
 const {page,errors}=await fixture();try{
  await expect.poll(()=>page.locator('.eb-root').evaluate(el=>Math.round(el.getBoundingClientRect().width))).toBe(1194)
  for(const [cls,height]of [['eb-tabs',44],['eb-toolbar',48],['eb-bookmarks-bar',32]])expect(await page.locator('.'+cls).evaluate(el=>el.getBoundingClientRect().height)).toBe(height)
  expect(await page.getByRole('button',{name:'返回工作区',exact:true}).count()).toBe(0);expect(await page.locator('.eb-app-label').evaluate(el=>el.tagName)).toBe('DIV');expect(await page.locator('.eb-app-label').evaluate(el=>getComputedStyle(el).getPropertyValue('-webkit-app-region'))).toBe('drag');expect(await page.locator('.eb-content').evaluate(el=>getComputedStyle(el).borderBottomLeftRadius)).toBe('16px');expect(await page.locator('.eb-content').evaluate(el=>getComputedStyle(el).borderTopLeftRadius)).toBe('0px')
  expect(await page.locator('.eb-icon').evaluateAll(els=>els.every(el=>getComputedStyle(el).maskImage!=='none'))).toBe(true)
  await page.screenshot({path:evidence+'/start-dark.png'})
  const address=page.getByRole('combobox',{name:'搜索或输入网址'});await address.pressSequentially('https://example.com/',{delay:8});expect(await address.inputValue()).toBe('https://example.com/');await address.press('Enter');await expect.poll(()=>address.inputValue()).toBe('https://example.com/')
  await page.keyboard.press('Control+d');await page.getByRole('textbox',{name:'名称',exact:true}).fill('自己的研究收藏');await page.getByRole('button',{name:'完成',exact:true}).click();expect(await page.evaluate(()=>window.snapshot().bookmarks[0].title)).toBe('自己的研究收藏')
  await page.getByRole('button',{name:'收藏夹',exact:true}).click();expect(await page.getByRole('dialog',{name:'收藏夹'}).innerText()).toContain('自己的研究收藏');await page.screenshot({path:evidence+'/bookmarks-dark.png'});await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'新标签页',exact:true}).click();expect(await page.getByRole('tab').count()).toBe(2);expect(await page.getByRole('tab',{selected:true}).innerText()).toContain('新标签页')
  await page.getByRole('button',{name:'已打开的页签',exact:true}).click();await expect.poll(()=>page.getByRole('menuitemradio').count()).toBe(2);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'更多浏览器操作',exact:true}).click();expect(Math.abs((await page.locator('[data-browser-panel=menu]').boundingBox()).height-616)).toBeLessThanOrEqual(2);await page.screenshot({path:evidence+'/menu-dark.png'});await page.getByRole('menuitem',{name:/浏览器设置/}).click();await page.getByRole('combobox',{name:'默认搜索引擎'}).selectOption('Bing');expect(await page.evaluate(()=>window.snapshot().settings.engine)).toBe('Bing')
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)
it('keeps the narrow/light layout usable without clipped tools and exercises keyboard find and source handoff',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  const address=page.getByRole('combobox',{name:'搜索或输入网址'});await address.pressSequentially('https://example.com/',{delay:8});expect(await address.inputValue()).toBe('https://example.com/');await address.press('Enter');await expect.poll(()=>page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='layout').at(-1)?.[1].visible)).toBe(true);await page.evaluate(()=>window.liveCallStart=window.browserCalls.length);await page.keyboard.press('Control+f');const find=page.getByRole('textbox',{name:'查找内容'});await find.fill('Example');await expect.poll(()=>page.getByRole('search',{name:'页内查找'}).innerText()).toContain('1 / 6');await expectLivePage(page);await page.screenshot({path:evidence+'/find-light.png'});await page.keyboard.press('Escape');await address.fill('example live query');await page.getByRole('listbox',{name:'网址建议'}).waitFor();expect(await address.inputValue()).toBe('example live query');await expectLivePage(page);await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'更多浏览器操作',exact:true}).click();await page.getByRole('menuitem',{name:'发送到对话'}).click();expect(await page.evaluate(()=>window.browserCalls.some(c=>c[0]==='source'&&c[1]==='session-A'&&c[2].url==='https://example.com/'))).toBe(true)
  await page.getByRole('button',{name:'更多浏览器操作',exact:true}).click();await page.getByRole('menuitem',{name:'新建隐私标签页'}).click();await page.getByRole('heading',{name:'隐私浏览',exact:true}).waitFor();await page.screenshot({path:evidence+'/private-light.png'})
  const over=await page.locator('.eb-root').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));expect(over.scroll).toBe(over.width);expect(errors).toEqual([])
 }finally{await page.close()}
},15000)

it('uses Figma menu type sizes and reserves the native right-pane entry',async()=>{
 const {page}=await fixture(1440,900,false);try{
  await page.evaluate(()=>{const b=document.createElement('button');b.dataset.odysseyPanelEntry='right';b.setAttribute('aria-expanded','false');b.style.cssText='position:fixed;right:16px;top:16px;width:32px;height:32px;z-index:99';document.body.append(b);window.dispatchEvent(new Event('resize'))})
  await expect.poll(()=>page.locator('.eb-tabs').evaluate(el=>{const b=document.querySelector('[data-odyssey-panel-entry=right]').getBoundingClientRect(),tool=el.querySelector('[data-action=new]').getBoundingClientRect();return b.left-tool.right})).toBeGreaterThanOrEqual(8)
  await page.getByRole('button',{name:'更多浏览器操作'}).click()
  const typography=await page.locator('[data-browser-panel=menu] .eb-menu-item').first().evaluate(el=>{const s=getComputedStyle(el),k=getComputedStyle(el.querySelector('kbd'));return{font:s.fontSize,line:s.lineHeight,gap:s.gap,key:k.fontSize,family:k.fontFamily===s.fontFamily}})
  expect(typography).toEqual({font:'14px',line:'22px',gap:'10px',key:'12px',family:true});expect(await page.locator('.eb-zoom').evaluate(el=>el.offsetHeight)).toBe(40)
  await page.keyboard.press('Escape');await page.getByRole('tab').first().click({button:'right'});expect(await page.locator('[data-browser-panel=tabs] .eb-menu-item').first().evaluate(el=>getComputedStyle(el).fontSize)).toBe('14px');expect(await page.locator('[data-browser-panel=tabs] kbd').first().evaluate(el=>getComputedStyle(el).fontSize)).toBe('12px')
 }finally{await page.close()}
})
it('keeps many tabs compressed, the active tab visible, and the full-title switcher independent',async()=>{
 const {page}=await fixture(1440,900,false);try{
  await page.evaluate(()=>{const base=window.snapshot().tabs[0];window.setBrowserState({tabs:Array.from({length:24},(_,i)=>({...base,id:'many'+i,title:'完整的研究页面标题 '+i})),activeId:'many23'})})
  const selected=page.getByRole('tab',{selected:true}),list=page.locator('.eb-tab-scroll');const box=await selected.boundingBox(),bounds=await list.boundingBox();expect(box.x).toBeGreaterThanOrEqual(bounds.x-1);expect(box.x+box.width).toBeLessThanOrEqual(bounds.x+bounds.width+1)
  const trigger=page.getByRole('button',{name:'已打开的页签'});expect(await trigger.evaluate(el=>!!el.closest('.eb-tab-scroll'))).toBe(false);await trigger.click();await expect.poll(()=>page.getByRole('menuitemradio').count()).toBe(24);await page.getByRole('menuitemradio',{name:'完整的研究页面标题 0',exact:true}).click();await expect.poll(()=>page.getByRole('tab',{selected:true}).getAttribute('data-id')).toBe('many0');expect(await trigger.evaluate(el=>el===document.activeElement)).toBe(true)
  await page.getByRole('tab',{selected:true}).focus();await page.keyboard.press('End');await expect.poll(()=>page.getByRole('tab',{selected:true}).getAttribute('data-id')).toBe('many23');await page.getByRole('button',{name:'关闭 完整的研究页面标题 23',exact:true}).click();await expect.poll(()=>page.getByRole('tab',{selected:true}).getAttribute('data-id')).toBe('many22');expect(await page.getByRole('tab',{selected:true}).evaluate(el=>el===document.activeElement)).toBe(true)
  await page.screenshot({path:evidence+'/many-tabs-light.png'})
 }finally{await page.close()}
})

it('adapts all tab widths while giving the crowded active tab more readable space and safe favicons',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  const widths=[]
  for(const count of [3,9,24]){
   await page.evaluate(count=>{const base=window.snapshot().tabs[0],canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d');ctx.fillStyle='#2071f3';ctx.fillRect(0,0,32,32);window.setBrowserState({tabs:Array.from({length:count},(_,i)=>({...base,id:'adaptive'+i,url:'https://page'+i+'.example/',title:'完整页签标题 '+i,favicon:canvas.toDataURL()})),activeId:'adaptive'+(count-1)})},count)
   const sizes=await page.getByRole('tab').evaluateAll(tabs=>tabs.map(tab=>tab.getBoundingClientRect().width));expect(Math.max(...sizes)).toBeLessThanOrEqual(240);if(count<=6)expect(Math.max(...sizes)-Math.min(...sizes)).toBeLessThan(1);else{expect(sizes.at(-1)).toBeGreaterThan(sizes[0]+30);expect(sizes.at(-1)).toBeGreaterThanOrEqual(112);expect(sizes.at(-1)).toBeLessThanOrEqual(sizes[0]*3.6)}widths.push(sizes[0]);expect(await page.locator('.eb-tab img.eb-tab-favicon').count()).toBe(count)
  }
  expect(widths[0]).toBeGreaterThan(widths[1]);expect(widths[1]).toBeGreaterThan(widths[2]);await page.setViewportSize({width:3000,height:900});const wide=await page.getByRole('tab').evaluateAll(tabs=>tabs.map(tab=>tab.getBoundingClientRect().width));expect(wide.at(-1)).toBeGreaterThan(wide[0]+30);await page.setViewportSize({width:1440,height:900});await page.screenshot({path:evidence+'/adaptive-tabs-favicons-light.png'})
  await page.getByRole('button',{name:'已打开的页签'}).click();expect(await page.locator('[data-browser-panel=tab-list] img.eb-tab-favicon').count()).toBe(24);await page.getByRole('menuitemradio',{name:'完整页签标题 0',exact:true}).click();await page.getByRole('button',{name:'关闭 完整页签标题 0',exact:true}).click();await expect.poll(()=>page.getByRole('tab',{selected:true}).getAttribute('data-id')).toBe('adaptive1');expect(await page.getByRole('tab',{selected:true}).evaluate(el=>el===document.activeElement)).toBe(true)
  await page.evaluate(()=>{const state=window.snapshot();state.tabs[0].favicon='https://external-favicon.invalid/private';window.setBrowserState(state)});expect(await page.locator('.eb-tab[data-id=adaptive1] img').count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('keeps adaptive tabs reachable beside the native pane button in a crowded narrow strip',async()=>{
 const {page,errors}=await fixture(640,700,true);try{
  await page.evaluate(()=>{const entry=document.createElement('button');entry.dataset.odysseyPanelEntry='right';entry.setAttribute('aria-expanded','false');entry.style.cssText='position:fixed;right:16px;top:16px;width:32px;height:32px;z-index:99';document.body.append(entry);const base=window.snapshot().tabs[0];window.setBrowserState({tabs:Array.from({length:32},(_,i)=>({...base,id:'crowded'+i,title:'窄屏完整标题 '+i})),activeId:'crowded31'});window.dispatchEvent(new Event('resize'))})
  await expect.poll(()=>page.getByRole('tab',{selected:true}).evaluate(el=>{const list=el.parentElement.getBoundingClientRect(),box=el.getBoundingClientRect();return box.left>=list.left-1&&box.right<=list.right+1})).toBe(true)
  const widths=await page.getByRole('tab').evaluateAll(tabs=>tabs.map(tab=>tab.getBoundingClientRect().width));expect(widths.at(-1)).toBeGreaterThan(widths[0]+30);expect(widths.at(-1)).toBeGreaterThanOrEqual(112)
  const next=await page.getByRole('button',{name:'新标签页',exact:true}).boundingBox(),entry=await page.locator('[data-odyssey-panel-entry=right]').boundingBox();expect(next.x+next.width).toBeLessThanOrEqual(entry.x-8)
  await page.getByRole('button',{name:'已打开的页签'}).click();expect(await page.getByRole('menuitemradio').count()).toBe(32);await page.getByRole('menuitemradio',{name:'窄屏完整标题 31',exact:true}).click();await page.getByRole('tab',{selected:true}).click({button:'middle'});await expect.poll(()=>page.getByRole('tab',{selected:true}).getAttribute('data-id')).toBe('crowded30');expect(await page.getByRole('tab',{selected:true}).evaluate(el=>el===document.activeElement)).toBe(true)
  await page.screenshot({path:evidence+'/adaptive-tabs-dark-narrow.png'});expect(errors).toEqual([])
 }finally{await page.close()}
})

it('gives home shortcuts distinct frequent, saved and internal activity content',async()=>{
 const {page}=await fixture(1440,900,false);try{
  await page.evaluate(()=>window.setBrowserState({history:[{id:'h1',title:'经常访问的站点',url:'https://frequent.example/',at:300},{id:'h2',title:'经常访问的站点',url:'https://frequent.example/',at:200},{id:'h3',title:'最新访问',url:'https://recent.example/',at:400}],bookmarks:[{id:'b1',title:'研究报告',url:'https://research.example/',folder:'研究资料',at:1},{id:'b2',title:'其他收藏',url:'https://saved.example/',at:2}]}))
  await page.getByRole('button',{name:'常用网站',exact:true}).click();await page.getByRole('heading',{name:'常用网站',exact:true}).waitFor();expect(await page.locator('.eb-library-list .eb-list-row').count()).toBe(2);expect(await page.locator('.eb-library-list .eb-list-row').first().innerText()).toContain('经常访问的站点');expect(await page.locator('.eb-popover').count()).toBe(0)
  await page.getByRole('button',{name:'返回首页'}).click();await page.getByRole('button',{name:'我的收藏',exact:true}).click();expect(await page.locator('.eb-library-list .eb-list-row').count()).toBe(2);await page.getByRole('button',{name:'返回首页'}).click();await page.getByRole('button',{name:'下载记录',exact:true}).click();await page.getByRole('heading',{name:'下载内容',exact:true}).waitFor();expect(await page.locator('[data-browser-panel=downloads]').count()).toBe(0)
  await page.locator('.eb-tab[data-id=tab0]').click();await page.getByRole('button',{name:'最近访问',exact:true}).click();await page.getByRole('heading',{name:'历史记录',exact:true}).waitFor();await page.getByRole('button',{name:'打开 经常访问的站点',exact:true}).first().click();await expect.poll(()=>page.evaluate(()=>window.snapshot().tabs.find(t=>t.id===window.snapshot().activeId)?.url)).toBe('https://frequent.example/');expect(await page.evaluate(()=>window.snapshot().tabs.some(t=>t.page==='history'))).toBe(true)
 }finally{await page.close()}
})

it('keeps site, bookmark, search and print panels at their own Figma sizes under the full shell cascade',async()=>{
 const {page}=await fixture(1440,900,false);try{
  await page.evaluate(()=>{const state=window.snapshot();state.tabs[0].url='https://example.com/';state.tabs[0].title='Example';window.setBrowserState(state)})
  await page.getByRole('button',{name:'站点信息',exact:true}).click();expect(await page.locator('.eb-site-permission').count()).toBe(5);await expect.poll(()=>page.locator('.eb-site-permission').evaluateAll(nodes=>nodes.every(n=>n.offsetHeight===42))).toBe(true);expect(await page.getByRole('combobox',{name:'位置',exact:true}).inputValue()).toBe('ask');expect(await page.getByRole('combobox',{name:'自动下载',exact:true}).inputValue()).toBe('allow');await page.screenshot({path:evidence+'/site-light.png'});await page.keyboard.press('Escape')
  await page.keyboard.press('Control+d');expect(await page.getByRole('textbox',{name:'名称',exact:true}).evaluate(n=>({height:n.offsetHeight,font:getComputedStyle(n).fontSize,color:getComputedStyle(n).color}))).toMatchObject({height:42,font:'14px'});expect(await page.locator('[data-browser-panel=save] footer').evaluate(n=>n.offsetHeight)).toBe(40);await page.screenshot({path:evidence+'/save-light.png'});await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'收藏夹',exact:true}).click();expect(await page.getByRole('textbox',{name:'搜索收藏'}).evaluate(n=>n.offsetHeight)).toBe(34);await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'更多浏览器操作'}).click();await page.getByRole('menuitem',{name:/打印 \/ 导出 PDF/}).click();await expect.poll(()=>page.getByRole('button',{name:'保存 PDF',exact:true}).count()).toBe(1);await page.getByRole('combobox',{name:'目标',exact:true}).selectOption('printer');expect(await page.getByRole('button',{name:'打印',exact:true}).count()).toBe(1);expect(await page.locator('[data-browser-panel=print] footer').evaluate(n=>n.offsetHeight)).toBe(44)
 }finally{await page.close()}
})

it('keeps zoom in the opaque More menu after removing the bottom status bar',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  await page.evaluate(()=>{const state=window.snapshot();state.tabs[0].url='https://example.com/';state.tabs[0].zoom=1.25;window.setBrowserState(state)})
  expect(await page.locator('.eb-status').count()).toBe(0);const root=await page.locator('.eb-root').boundingBox(),viewport=await page.locator('[data-browser-viewport]').boundingBox();expect(viewport.y+viewport.height).toBe(root.y+root.height)
  await page.getByRole('button',{name:'更多浏览器操作'}).click();const panel=page.getByRole('menu',{name:'浏览器菜单'});await panel.getByRole('button',{name:'放大',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.snapshot().tabs[0].zoom)).toBe(1.35)
  await page.evaluate(()=>{const state=window.snapshot();state.tabs[0].zoom=3;window.setBrowserState(state)});expect(await panel.getByRole('button',{name:'放大',exact:true}).isDisabled()).toBe(true)
  await panel.getByRole('button',{name:'恢复 100%',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.snapshot().tabs[0].zoom)).toBe(1);await page.keyboard.press('Escape');expect(await panel.count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
})
it('selects an address on first click without blue focus and toggles the current-page star',async()=>{
 const {page,errors}=await fixture(1440,900,true);try{
  await page.evaluate(()=>{const state=window.snapshot();state.tabs[0].url='https://example.com/';state.tabs[0].title='Example Domain';window.setBrowserState(state)})
  const address=page.getByRole('combobox',{name:'搜索或输入网址'});await address.click();expect(await address.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([0,20]);expect(await address.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('none');expect(await page.locator('.eb-address-wrap').evaluate(el=>getComputedStyle(el).boxShadow)).toBe('none');await address.click({position:{x:100,y:10}});const selection=await address.evaluate(el=>[el.selectionStart,el.selectionEnd]);expect(selection[0]).toBe(selection[1]);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await address.click();expect(await address.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([0,20])
  const add=page.getByRole('button',{name:'添加收藏',exact:true}),outline=await add.locator('.eb-icon').getAttribute('style');expect(await add.getAttribute('aria-pressed')).toBe('false');await add.click();const remove=page.getByRole('button',{name:'取消收藏',exact:true});expect(await remove.getAttribute('aria-pressed')).toBe('true');expect(await remove.locator('.eb-icon').getAttribute('style')).not.toBe(outline);expect(await page.evaluate(()=>window.snapshot().bookmarks.length)).toBe(1);await remove.click();await add.waitFor();expect(await page.evaluate(()=>window.snapshot().bookmarks.length)).toBe(0);expect(await add.locator('.eb-icon').getAttribute('style')).toBe(outline);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('keeps the live webpage visible while opening, switching and dismissing browser menus',async()=>{
 const {page,errors}=await fixture(1440,900,true);try{
  await liveWebsite(page);await page.evaluate(()=>window.browserCapture=()=>{throw Error('UI menus must not capture the webpage')})
  await page.getByRole('button',{name:'更多浏览器操作'}).click();await page.getByRole('menu',{name:'浏览器菜单',exact:true}).waitFor();await expectLivePage(page)
  await page.getByRole('button',{name:'收藏夹',exact:true}).click();await page.getByRole('dialog',{name:'收藏夹',exact:true}).waitFor();expect(await page.locator('[data-browser-panel]').count()).toBe(1);await expectLivePage(page)
  await page.keyboard.press('Escape');expect(await page.locator('[data-browser-panel]').count()).toBe(0);await expectLivePage(page)
  await page.getByRole('button',{name:'已打开的页签',exact:true}).click();await page.getByRole('menuitemradio').waitFor();await expectLivePage(page);await page.keyboard.press('Escape');expect(errors).toEqual([])
 }finally{await page.close()}
})

it('presents every browser popup over the live page and captures only an explicit print thumbnail',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  await liveWebsite(page)
  for(const panel of ['bookmarks','menu','site','tabs','tab-list','save','clear','print','folder','zoom','add-link']){
   await page.evaluate(()=>window.liveCallStart=window.browserCalls.length);await page.evaluate(panel=>{document.querySelector('.eb-toolbar [data-action=menu]').focus();return window.browserView.show(panel)},panel);const popup=page.locator('[data-browser-panel='+panel+']');await popup.waitFor({state:'visible'});expect(await popup.evaluate(el=>({hidden:el.hasAttribute('aria-hidden'),inert:el.hasAttribute('inert')}))).toEqual({hidden:false,inert:false})
   await expectLivePage(page,panel==='print'?1:0);if(panel==='print'){expect(await popup.locator('img.eb-print-preview').count()).toBe(1);expect(await page.evaluate(()=>window.browserCalls.slice(window.liveCallStart).find(c=>c[0]==='capture')[1].id)).toBe('tab0')}
   if(panel==='bookmarks')expect(await popup.evaluate(el=>getComputedStyle(el).animationName)).toBe('eb-bookmarks-in');await page.keyboard.press('Escape');expect(await page.locator('[data-browser-panel]').count()).toBe(0)
  }
  expect(errors).toEqual([])
 }finally{await page.close()}
})

it('keeps only the newest browser popup and never revives a cancelled menu',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  await liveWebsite(page);await page.evaluate(()=>{void window.browserView.show('bookmarks');void window.browserView.show('menu')});await page.getByRole('menu',{name:'浏览器菜单',exact:true}).waitFor();expect(await page.locator('[data-browser-panel]').count()).toBe(1)
  await page.getByRole('button',{name:'收藏夹',exact:true}).click();expect(await page.locator('[data-browser-panel=menu]').count()).toBe(0);await page.getByRole('dialog',{name:'收藏夹',exact:true}).waitFor();await page.keyboard.press('Escape');await expectLivePage(page);expect(await page.locator('[data-browser-panel]').count()).toBe(0)
  await page.evaluate(()=>{void window.browserView.show('menu');window.browserView.close()});await page.evaluate(()=>window.browserView.open('session-B'));await liveWebsite(page);expect(await page.locator('[data-browser-panel]').count()).toBe(0);await expectLivePage(page);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('opens empty and internal-page menus without capture and keeps repeated zoom changes live',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  await page.getByRole('button',{name:'收藏夹',exact:true}).click();await page.getByRole('dialog',{name:'收藏夹',exact:true}).waitFor();expect(await page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='capture'))).toEqual([]);await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'下载记录',exact:true}).click();await page.getByRole('heading',{name:'下载内容',exact:true}).waitFor();await page.evaluate(()=>window.browserView.show('clear'));await page.getByRole('dialog',{name:'清除浏览数据',exact:true}).waitFor();expect(await page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='capture'))).toEqual([]);await page.keyboard.press('Escape')
  await liveWebsite(page);await page.getByRole('button',{name:'更多浏览器操作'}).click();const menu=page.getByRole('menu',{name:'浏览器菜单',exact:true});await menu.waitFor();await menu.getByRole('button',{name:'放大',exact:true}).click();await menu.getByRole('button',{name:'放大',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.snapshot().tabs.find(t=>t.id===window.snapshot().activeId).zoom)).toBe(1.2);expect(await menu.isVisible()).toBe(true);expect(await menu.getAttribute('inert')).toBeNull();await expectLivePage(page)
  await menu.getByRole('menuitem',{name:/浏览器设置/}).click();await page.evaluate(()=>window.browserView.show('clear'));await page.getByRole('dialog',{name:'清除浏览数据',exact:true}).waitFor();expect(await page.locator('.eb-page-image').count()).toBe(0);await page.keyboard.press('Escape');await page.getByRole('button',{name:'返回浏览器',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='layout').at(-1)?.[1].visible)).toBe(true);await page.evaluate(()=>window.liveCallStart=window.browserCalls.length);await expectLivePage(page);expect(await page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='capture'))).toEqual([]);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('animates closing tabs forward and holds widths until the pointer leaves the strip',async()=>{
 const {page,errors}=await fixture(1440,900,true);try{
  await page.evaluate(()=>{const base=window.snapshot().tabs[0];window.setBrowserState({tabs:Array.from({length:9},(_,i)=>({...base,id:'motion'+i,title:'关闭动效 '+i})),activeId:'motion3'})})
  const sizes=()=>page.getByRole('tab').evaluateAll(tabs=>Object.fromEntries(tabs.map(el=>[el.dataset.id,el.getBoundingClientRect().width]))),before=await sizes();await page.getByRole('button',{name:'关闭 关闭动效 3',exact:true}).click();expect(await page.locator('.eb-tab-closing-slot').count()).toBe(1);expect(await page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='close').length)).toBe(0);await expect.poll(()=>page.getByRole('tab').count()).toBe(8)
  const held=await sizes();expect(Math.abs(held.motion0-before.motion0)).toBeLessThan(1);expect(Math.abs(held.motion4-before.motion3)).toBeLessThan(1);await page.getByRole('button',{name:'关闭 关闭动效 4',exact:true}).click();await expect.poll(()=>page.getByRole('tab').count()).toBe(7);expect(Math.abs((await sizes()).motion0-before.motion0)).toBeLessThan(1)
  await page.mouse.move(600,200);expect(await page.getByRole('tab').evaluateAll(tabs=>tabs.some(el=>el.getAnimations().length>0))).toBe(true);await expect.poll(async()=>(await sizes()).motion0).toBeGreaterThan(before.motion0+4);expect(await page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='close').map(c=>c[1].id))).toEqual(['motion3','motion4']);await expect.poll(()=>page.getByRole('tab').evaluateAll(tabs=>tabs.some(el=>el.getAnimations().length>0))).toBe(false);await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'关闭 关闭动效 5',exact:true}).click();await expect.poll(()=>page.getByRole('tab').count()).toBe(6);expect(await page.locator('.eb-tab-closing-slot').count()).toBe(0);expect(await page.getByRole('tab').evaluateAll(tabs=>tabs.some(el=>el.getAnimations().length>0))).toBe(false);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('keeps menus usable through redirects and an in-progress tab close without a screenshot fallback',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  await liveWebsite(page);await page.evaluate(()=>window.browserCapture=()=>{throw Error('No UI capture fallback')});const more=page.getByRole('button',{name:'更多浏览器操作'});await more.click();await page.getByRole('menu',{name:'浏览器菜单',exact:true}).waitFor()
  await page.evaluate(()=>{const state=window.snapshot();state.tabs[0].url='https://example.org/';window.setBrowserState(state)});expect(await page.getByRole('menu',{name:'浏览器菜单',exact:true}).isVisible()).toBe(true);await expectLivePage(page);await page.keyboard.press('Escape')
  await page.evaluate(()=>{const base=window.snapshot().tabs[0];window.setBrowserState({tabs:[{...base,id:'closing',title:'即将关闭'},{...base,id:'remaining',title:'保留网页'}],activeId:'closing'})});await page.getByRole('button',{name:'关闭 即将关闭',exact:true}).click();await more.click();await expect.poll(()=>page.getByRole('tab').count()).toBe(1);await page.getByRole('menu',{name:'浏览器菜单',exact:true}).waitFor();expect(await page.locator('[data-browser-panel]').count()).toBe(1);await expectLivePage(page);await page.keyboard.press('Escape');expect(await page.getByRole('alert').count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('keeps light settings readable, left-aligned and routes the download-folder picker correctly',async()=>{
 const {page,errors}=await fixture(1440,1000,false);try{
  await page.evaluate(()=>{const state=window.snapshot();state.tabs[0].url='https://example.com/';window.setBrowserState(state)});await page.getByRole('button',{name:'更多浏览器操作'}).click();await page.getByRole('menuitem',{name:/浏览器设置/}).click();expect(await page.locator('.eb-page-image').count()).toBe(0);expect(await page.locator('.eb-settings').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');const colors=await page.locator('.eb-settings .eb-setting').evaluateAll(nodes=>nodes.map(el=>({background:getComputedStyle(el).backgroundColor,align:getComputedStyle(el).textAlign})));expect(colors.every(c=>c.background!=='rgb(255, 255, 255)'&&c.background!=='rgba(0, 0, 0, 0)')).toBe(true);expect(colors.every(c=>c.align==='left')).toBe(true);expect(await page.getByRole('button',{name:'返回浏览器',exact:true}).evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(40)
  expect(await page.getByRole('combobox',{name:'搜索或输入网址'}).evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);expect(await page.getByRole('tab').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);await page.screenshot({path:evidence+'/settings-readable-light.png'});await page.getByRole('button',{name:/下载位置/}).click();expect(await page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='settings').at(-1)?.[1])).toEqual({chooseDirectory:true});expect(await page.evaluate(()=>window.browserCalls.some(c=>c[0]==='download'))).toBe(false);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('keeps address suggestions compact without a keyboard-help footer',async()=>{
 for(const dark of [false,true]){const {page,errors}=await fixture(1440,900,dark);try{
  const address=page.getByRole('combobox',{name:'搜索或输入网址'});await address.fill('example');const panel=page.getByRole('listbox',{name:'网址建议'});await panel.waitFor();expect(await panel.locator('small').count()).toBe(0);expect((await panel.boundingBox()).height).toBeLessThanOrEqual(56);expect((await panel.getByRole('option').boundingBox()).height).toBe(40);await page.keyboard.press('Escape');await panel.waitFor({state:'detached'});
  await page.evaluate(()=>window.setBrowserState({history:[{id:'guide',url:'https://example.com/guide',title:'Example guide',at:1}]}));await address.fill('example');await panel.waitFor();expect(await panel.getByRole('option').count()).toBe(2);expect((await panel.boundingBox()).height).toBeLessThanOrEqual(108);await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect.poll(()=>page.evaluate(()=>window.snapshot().tabs[0].url)).toBe('https://example.com/guide');expect(errors).toEqual([])
 }finally{await page.close()}}
})

it('keeps the live page visible when nested global menus move into and out of its viewport',async()=>{
 const {page,errors}=await fixture(1920,1080,true);try{
  await liveWebsite(page);await page.evaluate(()=>{const portal=document.createElement('div');portal.id='nested-model-portal';portal.innerHTML='<div role="menu" aria-label="Global model menu" style="position:fixed;left:1508px;top:400px;width:300px;height:140px"></div>';document.body.append(portal)});await expectLivePage(page)
  const menu=page.locator('[aria-label="Global model menu"]');await menu.evaluate(el=>{el.style.left='1000px';el.style.height='200px'});await expectLivePage(page);expect(await menu.isVisible()).toBe(true);await menu.evaluate(el=>el.style.left='1508px');await expectLivePage(page);await page.locator('#nested-model-portal').evaluate(el=>el.remove());await expectLivePage(page);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('drags tabs in both directions and ignores drops from external content',async()=>{
 const {page,errors}=await fixture(1440,900,true);try{
  await page.evaluate(()=>{const base=window.snapshot().tabs[0];window.setBrowserState({tabs:['Alpha','Beta','Gamma'].map((title,i)=>({...base,id:'drag'+i,title,url:'https://example.com/'+i})),activeId:'drag1'})});const alpha=page.getByRole('tab',{name:'Alpha 关闭 Alpha',exact:true}),gamma=page.getByRole('tab',{name:'Gamma 关闭 Gamma',exact:true});await gamma.dragTo(alpha,{targetPosition:{x:5,y:16}});await expect.poll(()=>page.evaluate(()=>window.snapshot().tabs.map(t=>t.id))).toEqual(['drag2','drag0','drag1']);expect(await page.evaluate(()=>window.snapshot().activeId)).toBe('drag1');
  const last=page.locator('.eb-tab').last(),box=await last.boundingBox();await page.getByRole('tab',{name:'Gamma 关闭 Gamma',exact:true}).dragTo(last,{targetPosition:{x:box.width-5,y:16}});await expect.poll(()=>page.evaluate(()=>window.snapshot().tabs.map(t=>t.id))).toEqual(['drag0','drag1','drag2']);expect(await page.locator('[data-drop-edge],[data-tab-dragging]').count()).toBe(0);
  await page.getByRole('tab',{name:'Alpha 关闭 Alpha',exact:true}).dispatchEvent('drop',{dataTransfer:await page.evaluateHandle(()=>new DataTransfer())});expect(await page.evaluate(()=>window.snapshot().tabs.map(t=>t.id))).toEqual(['drag0','drag1','drag2']);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('opens real bookmark management and preserves its editor across browser snapshots',async()=>{
 const {page,errors}=await fixture(1440,900,true);try{
  await page.evaluate(()=>{const state=window.snapshot();state.tabs[0].url='https://example.com/';state.bookmarks=[{id:'managed',url:'https://example.org/guide',title:'研究指南',folder:'研究',at:1}];state.folders=['研究'];window.setBrowserState(state)});await page.getByRole('button',{name:'收藏夹',exact:true}).click();await page.getByRole('button',{name:'管理收藏',exact:true}).click();const manager=page.getByRole('region',{name:'管理收藏'});await manager.waitFor();expect(await page.locator('[data-browser-panel]').count()).toBe(0);expect(await page.locator('.eb-bookmarks-bar').count()).toBe(0);await expect.poll(()=>page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='layout').at(-1)[1].visible)).toBe(false);
  await manager.getByRole('button',{name:'编辑 研究指南',exact:true}).click();const title=manager.getByRole('textbox',{name:'收藏名称',exact:true});await title.fill('已更新的研究指南');await title.press('ArrowLeft');const caret=await title.evaluate(el=>el.selectionStart);await page.evaluate(()=>window.update());expect(await title.inputValue()).toBe('已更新的研究指南');expect(await title.evaluate(el=>el===document.activeElement)).toBe(true);expect(await title.evaluate(el=>el.selectionStart)).toBe(caret);await manager.getByRole('button',{name:'保存',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.snapshot().bookmarks[0].title)).toBe('已更新的研究指南');await manager.getByRole('button',{name:'返回浏览器',exact:true}).click();await manager.waitFor({state:'detached'});await expect.poll(()=>page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='layout').at(-1)[1].visible)).toBe(true);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('limits home shortcut hover feedback to the compact icon in both themes',async()=>{
 for(const dark of [true,false]){
  const {page,errors}=await fixture(1440,900,dark);try{
   const shortcuts=page.locator('.eb-shortcuts button');expect(await shortcuts.count()).toBe(4)
   for(let i=0;i<4;i++){
    const button=shortcuts.nth(i),icon=button.locator('.eb-shortcut-icon');const before=await icon.evaluate(el=>getComputedStyle(el).backgroundColor);await button.hover();expect(await button.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');await expect.poll(()=>icon.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(before);expect(await icon.evaluate(el=>el.getBoundingClientRect().width)).toBe(40)
   }
   await page.screenshot({path:evidence+'/home-shortcuts-hover-'+(dark?'dark':'light')+'.png'});expect(errors).toEqual([])
  }finally{await page.close()}
 }
})

it('reorders with a captured pointer without starting a native OS drag and safely cancels outside the strip',async()=>{
 const {page,errors}=await fixture(1440,900,true);try{
  await page.evaluate(()=>{const base=window.snapshot().tabs[0];window.setBrowserState({tabs:['Alpha','Beta','Gamma'].map((title,i)=>({...base,id:'pointer'+i,title,url:'https://example.com/'+i})),activeId:'pointer1'});window.nativeTabDrags=0;document.addEventListener('dragstart',()=>window.nativeTabDrags++)})
  const gamma=await page.getByRole('tab',{name:'Gamma 关闭 Gamma',exact:true}).boundingBox(),alpha=await page.getByRole('tab',{name:'Alpha 关闭 Alpha',exact:true}).boundingBox();await page.mouse.move(gamma.x+40,gamma.y+16);await page.mouse.down();await page.mouse.move(alpha.x+5,alpha.y+16,{steps:10});expect(await page.evaluate(()=>window.nativeTabDrags)).toBe(0);expect(await page.locator('[data-tab-dragging=true]').count()).toBe(1);await page.mouse.up();await expect.poll(()=>page.evaluate(()=>window.snapshot().tabs.map(t=>t.id))).toEqual(['pointer2','pointer0','pointer1']);expect(await page.evaluate(()=>window.snapshot().activeId)).toBe('pointer1');expect(await page.locator('[data-drop-edge],[data-tab-dragging]').count()).toBe(0)
  const moved=await page.getByRole('tab',{name:'Gamma 关闭 Gamma',exact:true}).boundingBox();await page.mouse.move(moved.x+40,moved.y+16);await page.mouse.down();await page.mouse.move(moved.x+140,moved.y+220,{steps:8});await page.mouse.up();expect(await page.evaluate(()=>window.snapshot().tabs.map(t=>t.id))).toEqual(['pointer2','pointer0','pointer1']);expect(await page.locator('[data-drop-edge],[data-tab-dragging]').count()).toBe(0)
  await page.mouse.move(moved.x+40,moved.y+16);await page.mouse.down();await page.mouse.move(moved.x+160,moved.y+16,{steps:8});await page.keyboard.press('Escape');await page.mouse.up();expect(await page.evaluate(()=>window.snapshot().tabs.map(t=>t.id))).toEqual(['pointer2','pointer0','pointer1']);expect(await page.locator('[data-drop-edge],[data-tab-dragging]').count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.mouse.up().catch(()=>{});await page.close()}
})

it('continues scrolling crowded tabs while a captured drag stays at the edge',async()=>{
 const {page,errors}=await fixture(1440,900,true);try{
  await page.evaluate(()=>{const base=window.snapshot().tabs[0];window.setBrowserState({tabs:Array.from({length:40},(_,i)=>({...base,id:'edge'+i,title:'Edge '+i})),activeId:'edge0'})});const first=await page.getByRole('tab').first().boundingBox(),strip=await page.locator('.eb-tab-scroll').boundingBox();await page.mouse.move(first.x+30,first.y+16);await page.mouse.down();await page.mouse.move(strip.x+strip.width-5,first.y+16,{steps:10});await expect.poll(()=>page.locator('.eb-tab-scroll').evaluate(el=>el.scrollLeft)).toBeGreaterThan(36);await page.keyboard.press('Escape');await page.mouse.up();expect(await page.evaluate(()=>window.snapshot().tabs.map(t=>t.id))).toEqual(Array.from({length:40},(_,i)=>'edge'+i));expect(await page.locator('[data-drop-edge],[data-tab-dragging]').count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.mouse.up().catch(()=>{});await page.close()}
})

it('opens history and downloads as independent tabs from menus and home without toolbar downloads',async()=>{
 const {page,errors}=await fixture(1440,900,true);try{
  expect(await page.locator('.eb-toolbar [data-action=downloads]').count()).toBe(0);expect(await page.getByRole('button',{name:'研究资料',exact:true}).count()).toBe(0)
  await page.evaluate(()=>{const state=window.snapshot();state.tabs[0].url='https://example.com/original';state.tabs[0].title='Original';window.setBrowserState(state)})
  await page.getByRole('button',{name:'更多浏览器操作'}).click();await page.getByRole('menuitem',{name:/^历史记录/}).click();await page.getByRole('heading',{name:'历史记录',exact:true}).waitFor();expect(await page.locator('.eb-tab').count()).toBe(2);expect(await page.getByRole('combobox',{name:'搜索或输入网址'}).inputValue()).toBe('odyssey://history');expect(await page.locator('[data-browser-panel=history],.eb-page-image,.eb-bookmarks-bar').count()).toBe(0);expect(await page.evaluate(()=>window.snapshot().tabs[0].url)).toBe('https://example.com/original')
  await page.getByRole('button',{name:'更多浏览器操作'}).click();await page.getByRole('menuitem',{name:/^历史记录/}).click();expect(await page.locator('.eb-tab').count()).toBe(2)
  await page.keyboard.press('Control+t');await page.getByRole('button',{name:'下载记录',exact:true}).click();await page.getByRole('heading',{name:'下载内容',exact:true}).waitFor();expect(await page.locator('.eb-tab').count()).toBe(4);expect(await page.getByRole('combobox',{name:'搜索或输入网址'}).inputValue()).toBe('odyssey://downloads');expect(await page.locator('[data-browser-panel=downloads],.eb-page-image,.eb-bookmarks-bar').count()).toBe(0)
  await page.getByRole('button',{name:'更多浏览器操作'}).click();await page.getByRole('menuitem',{name:/^下载内容/}).click();expect(await page.locator('.eb-tab').count()).toBe(4);await page.getByRole('tab',{name:'Original 关闭 Original',exact:true}).click();expect(await page.getByRole('combobox',{name:'搜索或输入网址'}).inputValue()).toBe('https://example.com/original');expect(errors).toEqual([])
 }finally{await page.close()}
})

it('keeps activity search and caret across parent snapshots, routes material ownership and recognizes internal addresses',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  await page.evaluate(()=>window.setBrowserState({downloads:[{id:'download-1',tabId:'tab0',private:false,url:'https://example.com/report.pdf',name:'报告.pdf',path:'/tmp/browser-rendered-report.pdf',received:1024,total:1024,state:'completed'}]}));await page.getByRole('button',{name:'下载记录',exact:true}).click();const query=page.getByRole('searchbox',{name:'搜索下载内容',exact:true});await query.fill('报告');await query.evaluate(el=>el.setSelectionRange(1,1));await page.evaluate(()=>{const state=window.snapshot();state.downloads[0].received=2048;window.setBrowserState(state)});expect(await query.inputValue()).toBe('报告');expect(await query.evaluate(el=>({focused:document.activeElement===el,start:el.selectionStart,end:el.selectionEnd}))).toEqual({focused:true,start:1,end:1});await page.getByRole('button',{name:'加入工作材料',exact:true}).click();expect(await page.evaluate(()=>window.browserCalls.some(c=>c[0]==='download'&&c[1].id==='download-1'&&c[1].action==='material'&&c[1].sessionId==='session-A'))).toBe(true)
  await page.getByRole('tab',{selected:true}).focus();await page.keyboard.press('Control+f');expect(await query.evaluate(el=>document.activeElement===el)).toBe(true);const address=page.getByRole('combobox',{name:'搜索或输入网址'});await address.fill('odyssey://history');await address.press('Enter');await page.getByRole('heading',{name:'历史记录',exact:true}).waitFor();expect(await page.evaluate(()=>window.browserCalls.some(c=>c[0]==='navigate'&&c[1].url==='odyssey://history'))).toBe(false);expect(await page.locator('.eb-page-image').count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('expands four workspace shortcuts after the draggable title and gives their space back to web tabs',async()=>{
 const {page,errors}=await fixture(1440,900,true);try{
  await page.evaluate(()=>{const base=window.snapshot().tabs[0];window.setBrowserState({tabs:Array.from({length:9},(_,i)=>({...base,id:'workspace-tab'+i,title:'Web '+i,url:'https://example.com/'+i})),activeId:'workspace-tab8'})});const strip=page.locator('.eb-tab-scroll'),before=await strip.boundingBox();const toggle=page.getByRole('button',{name:'展开工作区页签',exact:true});expect(await toggle.getAttribute('aria-expanded')).toBe('false');expect(await toggle.evaluate(el=>getComputedStyle(el).getPropertyValue('-webkit-app-region'))).not.toBe('drag');await toggle.hover();const nav=page.getByRole('navigation',{name:'工作区视图'});await expect.poll(()=>nav.evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(150);expect(await nav.getByRole('button').count()).toBe(4);const after=await strip.boundingBox();expect(after.x-before.x).toBeGreaterThan(150);expect(before.width-after.width).toBeGreaterThan(150);expect(await page.locator('.eb-tab[aria-selected=true] .eb-tab-title').textContent()).toBe('Web 8');expect(await page.evaluate(()=>window.snapshot().activeId)).toBe('workspace-tab8');await page.locator('.eb-toolbar').hover();await expect.poll(()=>strip.evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(before.width-1);expect(await nav.count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('uses the owner-matched native workspace tabs and preserves browser documents without creating a session',async()=>{
 const {page,errors}=await fixture(1440,900,true);try{
  await page.evaluate(()=>{const state=window.snapshot();state.tabs[0].url='https://example.com/preserved';state.tabs[0].title='Preserved';window.setBrowserState(state);window.workspaceNativeActions=[];const wrap=document.createElement('div');wrap.className='wSkVaW_root';wrap.innerHTML='<header data-srb-session-header data-ework-notes-session="session-A"><div data-srb-tabs>'+['chat','research','notes','trajectory'].map(id=>'<button data-conversation-view-id="'+id+'">'+id+'</button>').join('')+'</div></header>';for(const button of wrap.querySelectorAll('button'))button.addEventListener('click',()=>window.workspaceNativeActions.push(button.dataset.conversationViewId));document.querySelector('.pI_x6G_centerCol').append(wrap)})
  const labels={chat:'对话',research:'研究',notes:'笔记',trajectory:'轨迹'};for(const view of ['chat','research','notes','trajectory']){await page.evaluate(()=>window.browserView.open('session-A'));if(await page.getByRole('button',{name:'展开工作区页签',exact:true}).count())await page.getByRole('button',{name:'展开工作区页签',exact:true}).hover();await page.getByRole('button',{name:'切换到'+labels[view],exact:true}).click();expect(await page.locator('.eb-root').evaluate(el=>el.hidden)).toBe(true)}expect(await page.evaluate(()=>window.workspaceNativeActions)).toEqual(['chat','research','notes','trajectory']);expect(await page.evaluate(()=>window.workspaceReveals)).toBe(4);expect(await page.evaluate(()=>window.snapshot().tabs[0].url)).toBe('https://example.com/preserved');expect(await page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='new'))).toEqual([])
  await page.evaluate(()=>window.browserView.open(''));await page.getByRole('button',{name:'展开工作区页签',exact:true}).hover();expect(await page.getByRole('button',{name:'切换到研究',exact:true}).isDisabled()).toBe(true);expect(await page.getByRole('button',{name:'切换到笔记',exact:true}).isDisabled()).toBe(true);await page.getByRole('button',{name:'切换到对话',exact:true}).click();expect(await page.evaluate(()=>window.workspaceReveals)).toBe(5);expect(await page.evaluate(()=>window.workspaceNativeActions)).toHaveLength(4);expect(errors).toEqual([])
 }finally{await page.close()}
})


it('keeps the new-tab button immediately after short tab rows and at the edge when crowded',async()=>{
 const {page,errors}=await fixture(1440,900,true);try{
  const measure=()=>page.evaluate(()=>{const root=document.querySelector('.eb-root').getBoundingClientRect(),last=[...document.querySelectorAll('.eb-tab')].at(-1).getBoundingClientRect(),add=document.querySelector('.eb-tabs [data-action=new]').getBoundingClientRect(),strip=document.querySelector('.eb-tab-scroll').getBoundingClientRect();return{gap:add.left-last.right,addRight:add.right,rootRight:root.right,stripRight:strip.right}})
  let m=await measure();expect(m.gap).toBeGreaterThanOrEqual(7);expect(m.gap).toBeLessThanOrEqual(9);expect(m.rootRight-m.addRight).toBeGreaterThan(150)
  await page.getByRole('button',{name:'新标签页',exact:true}).click();m=await measure();expect(m.gap).toBeGreaterThanOrEqual(7);expect(m.gap).toBeLessThanOrEqual(9)
  await page.getByRole('button',{name:'展开工作区页签',exact:true}).hover();m=await measure();expect(m.gap).toBeGreaterThanOrEqual(7);expect(m.gap).toBeLessThanOrEqual(9)
  await page.evaluate(()=>{const base=window.snapshot().tabs[0];window.setBrowserState({tabs:Array.from({length:30},(_,i)=>({...base,id:'full'+i,title:'Full '+i})),activeId:'full29'})});await page.waitForTimeout(220);m=await measure();expect(m.rootRight-m.addRight).toBeLessThan(60);expect(m.addRight-m.stripRight).toBeGreaterThan(32);expect(errors).toEqual([])
 }finally{await page.close()}
})


it('keeps expanded workspace controls and a selectable web tab inside a narrow center column',async()=>{
 const {page,errors}=await fixture(394,700,false);try{
  await page.evaluate(()=>{const base=window.snapshot().tabs[0];window.setBrowserState({tabs:Array.from({length:9},(_,i)=>({...base,id:'narrow'+i,title:'Web '+i})),activeId:'narrow8'})});await page.getByRole('button',{name:'展开工作区页签',exact:true}).hover();await page.waitForTimeout(220);const sizes=await page.locator('.eb-root').evaluate(root=>{const box=root.getBoundingClientRect(),controls=[...root.querySelectorAll('.eb-tabs button,.eb-tab[aria-selected=true]')].map(el=>el.getBoundingClientRect());return{width:box.width,scroll:root.scrollWidth,maxRight:Math.max(...controls.map(r=>r.right))-box.left,minTab:root.querySelector('.eb-tab[aria-selected=true]').getBoundingClientRect().width}});expect(sizes.width).toBe(320);expect(sizes.scroll).toBeLessThanOrEqual(320);expect(sizes.maxRight).toBeLessThanOrEqual(320);expect(sizes.minTab).toBeGreaterThanOrEqual(30);await page.screenshot({path:evidence+'/workspace-expanded-narrow-light.png'});expect(errors).toEqual([])
 }finally{await page.close()}
})


it('opens workspace tabs only from the toggle and holds them anywhere in the browser tab bar',async()=>{
 const {page,errors}=await fixture(1440,900,true);try{
  const toggle=page.locator('.eb-workspace-toggle');const title=await page.locator('.eb-app-label').boundingBox(),toggleBox=await toggle.boundingBox();expect(toggleBox.x-title.x-title.width).toBeLessThanOrEqual(8);expect(await toggle.locator('.eb-icon').getAttribute('style')).not.toBe(await page.locator('.eb-toolbar [data-action=forward] .eb-icon').getAttribute('style'));
  const switcher=page.getByRole('button',{name:'已打开的页签',exact:true});expect(await switcher.count()).toBe(1);const placement=await switcher.evaluate(el=>{const box=el.getBoundingClientRect(),tab=document.querySelector('.eb-tab').getBoundingClientRect(),s=getComputedStyle(el);return{gap:tab.left-box.right,bg:s.backgroundColor,radius:parseFloat(s.borderRadius)}});expect(placement.gap).toBeGreaterThanOrEqual(4);expect(placement.gap).toBeLessThanOrEqual(9);expect(placement.bg).toMatch(/0\.04\)$/);expect(placement.radius).toBeGreaterThanOrEqual(6)
  const nav=page.getByRole('navigation',{name:'工作区视图'}),label=page.locator('.eb-app-label'),tab=page.getByRole('tab',{name:'新标签页'}),add=page.getByRole('button',{name:'新标签页',exact:true}),bar=page.locator('.eb-tabs'),toolbar=page.locator('.eb-toolbar')
  const hoverAndWait=async(locator,options)=>{await locator.hover(options);await page.waitForTimeout(230)}
  await hoverAndWait(label);expect(await nav.count()).toBe(0);await hoverAndWait(tab);expect(await nav.count()).toBe(0)
  await toggle.hover();await nav.waitFor();expect(await nav.getByRole('button').allTextContents()).toEqual(['对话','研究','笔记','轨迹'])
  for(const control of [label,page.getByRole('button',{name:'切换到笔记',exact:true}),tab,add]){await hoverAndWait(control);expect(await nav.count()).toBe(1)}
  const barBox=await bar.boundingBox();await hoverAndWait(bar,{position:{x:barBox.width-8,y:barBox.height/2}});expect(await nav.count()).toBe(1)
  await add.click();await hoverAndWait(add);expect(await nav.count()).toBe(1)
  await bar.screenshot({path:evidence+'/workspace-tab-bar-expanded.png'})
  await toolbar.hover();await expect.poll(()=>nav.count()).toBe(0)
  await hoverAndWait(add);expect(await nav.count()).toBe(0)
  await toggle.focus();await toggle.press('Enter');expect(await page.getByRole('navigation',{name:'工作区视图'}).count()).toBe(1);await page.keyboard.press('Escape');expect(await page.getByRole('navigation',{name:'工作区视图'}).count()).toBe(0);expect(await toggle.evaluate(el=>el===document.activeElement)).toBe(true)
  await switcher.click();const box=await switcher.boundingBox(),panel=await page.locator('[data-browser-panel=tab-list]').boundingBox();expect(Math.abs(panel.x-box.x)).toBeLessThan(1);expect(panel.y-box.y-box.height).toBeGreaterThanOrEqual(4);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('places the shared workspace back button before the browser title and leaves the web tabs intact',async()=>{
 const {page,errors}=await fixture(1440,900,true);try{
  await liveWebsite(page)
  const back=page.getByRole('button',{name:'返回工作区',exact:true}),label=page.locator('.eb-app-label'),bar=page.locator('.eb-tabs')
  const backBox=await back.boundingBox(),labelBox=await label.boundingBox();expect(backBox.x+backBox.width).toBeLessThan(labelBox.x)
  await bar.screenshot({path:evidence+'/workspace-tab-bar-back.png'})
  await page.evaluate(()=>window.addEventListener('sherlock:browser-request',event=>{if(event.detail?.close)document.dispatchEvent(new CustomEvent('sherlock:browser-close'))}))
  const tabs=await page.evaluate(()=>window.snapshot().tabs);await back.click();await page.locator('.eb-root').waitFor({state:'hidden'})
  expect(await page.evaluate(()=>window.snapshot().tabs)).toEqual(tabs)
  expect(await page.evaluate(()=>window.browserCalls.some(([method])=>method==='back'))).toBe(false);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('shares the unselected rail glyph color and emphasizes the selected browser in both themes',async()=>{
 const {page,errors}=await fixture(1440,900,true);try{
  await page.evaluate(()=>{const rail=document.createElement('aside');rail.dataset.dshSidebarRoot='';rail.dataset.dshSidebarWide='false';rail.innerHTML='<div class="hHd-Xa_newSessionGroup"><button class="hHd-Xa_newSession">Chat</button><button class="hHd-Xa_newSession" data-sidebar-browser aria-pressed="false">Browser</button></div>';document.body.append(rail)})
  for(const dark of [true,false])for(const pressed of [false,true]){const colors=await page.evaluate(({dark,pressed})=>{document.body.toggleAttribute('data-ds-dark-theme',dark);const button=document.querySelector('[data-sidebar-browser]');button.setAttribute('aria-pressed',String(pressed));return{browser:getComputedStyle(button,'::before').backgroundColor,button:getComputedStyle(button).color,other:getComputedStyle(document.querySelector('.hHd-Xa_newSession'),'::before').backgroundColor}},{dark,pressed});if(!pressed)expect(colors.browser).toBe(colors.other);else{expect(colors.browser).toBe(colors.button);const brightness=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).reduce((a,b)=>a+b,0);expect(dark?brightness(colors.browser)-brightness(colors.other):brightness(colors.other)-brightness(colors.browser)).toBeGreaterThan(10)}}expect(errors).toEqual([])
 }finally{await page.close()}
})


it('animates workspace width and opacity on hover and respects reduced motion',async()=>{
 const {page,errors}=await fixture(1440,900,true);try{
  await page.getByRole('button',{name:'展开工作区页签',exact:true}).hover();expect(await page.locator('.eb-workspace-tabs').evaluate(el=>el.getAnimations().some(a=>a.playState==='running'))).toBe(true);await page.waitForTimeout(240);expect(await page.locator('.eb-workspace-tabs').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(150);await page.locator('.eb-toolbar').hover();await expect.poll(()=>page.locator('.eb-workspace-tabs').getAttribute('aria-hidden')).toBe('true');await expect.poll(()=>page.locator('.eb-workspace-tabs').evaluate(el=>el.getBoundingClientRect().width)).toBe(0)
  await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'展开工作区页签',exact:true}).hover();expect(await page.locator('.eb-workspace-tabs').evaluate(el=>el.getAnimations().length)).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
})


it('dismisses a browser popup before collapsing the hovered workspace shortcuts on Escape',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  await page.getByRole('button',{name:'更多浏览器操作'}).click();await page.getByRole('menu',{name:'浏览器菜单',exact:true}).waitFor();await page.locator('.eb-workspace-toggle').hover();await page.keyboard.press('Escape');expect(await page.locator('[data-browser-panel]').count()).toBe(0);expect(await page.locator('.eb-workspace-tabs').getAttribute('aria-hidden')).toBe('false');await page.locator('.eb-toolbar').hover();await page.keyboard.press('Escape');expect(await page.locator('.eb-workspace-tabs').getAttribute('aria-hidden')).toBe('true');expect(errors).toEqual([])
 }finally{await page.close()}
})

it('releases mouse-held workspace focus on pointer exit while retaining a visible keyboard focus',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  const toggle=page.locator('.eb-workspace-toggle'),nav=page.locator('.eb-workspace-tabs');await toggle.click();await page.locator('.eb-toolbar').hover();await toggle.hover();expect(await toggle.evaluate(el=>el===document.activeElement&&!el.matches(':focus-visible'))).toBe(true);await page.locator('.eb-toolbar').hover();await expect.poll(()=>nav.getAttribute('aria-hidden')).toBe('true')
  await toggle.focus();await toggle.press('Enter');expect(await toggle.evaluate(el=>el.matches(':focus-visible'))).toBe(true);await toggle.hover();await page.locator('.eb-toolbar').hover();await page.waitForTimeout(220);expect(await nav.getAttribute('aria-hidden')).toBe('false');expect(errors).toEqual([])
 }finally{await page.close()}
})

it('opens a browser menu when pointerdown dismisses an overlapping external menu without capturing the page',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  await liveWebsite(page);await page.evaluate(()=>{const menu=document.createElement('div');menu.id='handoff-global-menu';menu.setAttribute('role','menu');menu.style.cssText='position:fixed;left:1000px;top:180px;width:250px;height:300px';document.body.append(menu)});await expectLivePage(page)
  await page.evaluate(()=>document.addEventListener('pointerdown',()=>document.getElementById('handoff-global-menu')?.remove(),{once:true,capture:true}));await page.getByRole('button',{name:'更多浏览器操作'}).click();await page.getByRole('menu',{name:'浏览器菜单',exact:true}).waitFor();expect(await page.locator('#handoff-global-menu').count()).toBe(0);expect(await page.locator('[data-browser-panel=menu]').getAttribute('inert')).toBeNull();await expectLivePage(page);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('preserves an open menu search and caret across incoming snapshots without capturing the document',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  await liveWebsite(page);await page.getByRole('button',{name:'收藏夹',exact:true}).click();const menu=page.getByRole('dialog',{name:'收藏夹',exact:true}),query=menu.getByRole('textbox',{name:'搜索收藏',exact:true});await query.fill('研究');await query.evaluate(el=>el.setSelectionRange(1,1));await page.evaluate(()=>window.snapshotBurst=setInterval(()=>window.update(),10));await page.waitForTimeout(180);await page.evaluate(()=>clearInterval(window.snapshotBurst));expect(await query.inputValue()).toBe('研究');expect(await query.evaluate(el=>({focused:el===document.activeElement,caret:el.selectionStart}))).toEqual({focused:true,caret:1});expect(await menu.isVisible()).toBe(true);expect(await page.locator('[data-browser-panel]').count()).toBe(1);await expectLivePage(page);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('opens and uses shared sidebar More menus without hiding or capturing the live webpage',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  await liveWebsite(page);const anchor=await globalMenuAnchor(page,'全局更多测试');await anchor.click();const menu=page.locator('body>.st-menu');await menu.waitFor({state:'visible'});expect(await menu.evaluate(el=>el.inert)).toBe(false);expect(await page.getByRole('menuitem',{name:'插件',exact:true}).evaluate(el=>el===document.activeElement)).toBe(true);await expectLivePage(page)
  await page.getByRole('menuitem',{name:'插件',exact:true}).click();expect(await page.evaluate(()=>window.globalActions)).toEqual(['plugins']);await expectLivePage(page)
  await anchor.evaluate(el=>{el.style.top='10px';el.style.height='20px'});await anchor.click();await menu.waitFor({state:'visible'});expect(await page.getByRole('menuitem',{name:'定时任务',exact:true}).isVisible()).toBe(true);await expectLivePage(page);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('cancels shared menu openings without revival and never depends on a capture fallback',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  await liveWebsite(page);const trigger=await globalMenuAnchor(page,'全局菜单取消测试');await trigger.click();await page.locator('body>.st-menu').waitFor({state:'visible'});await trigger.click();await expect.poll(()=>page.locator('body>.st-menu').count()).toBe(0);await expectLivePage(page)
  await page.evaluate(()=>window.browserCapture=()=>{throw Error('Captures are not a prerequisite for menus')});await trigger.click();await page.locator('body>.st-menu').waitFor({state:'visible'});expect(await trigger.getAttribute('aria-expanded')).toBe('true');await expectLivePage(page);await page.evaluate(()=>window.scheduledMenuView.closeMenu());await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(await page.locator('body>.st-menu').count()).toBe(0);expect(await trigger.getAttribute('aria-expanded')).toBe('false');expect(await page.getByRole('alert').count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('hands a browser popup to one shared menu on keyboard activation without restoring old toolbar focus',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  await liveWebsite(page);const anchor=await globalMenuAnchor(page,'键盘全局更多','keyboard-global-anchor')
  for(const top of ['200px','10px']){
   await anchor.evaluate((el,top)=>el.style.top=top,top);await page.getByRole('button',{name:'更多浏览器操作'}).click();await page.getByRole('menu',{name:'浏览器菜单',exact:true}).waitFor();await anchor.focus();await anchor.press('Enter');await page.getByRole('menuitem',{name:'插件',exact:true}).waitFor();expect(await page.locator('[data-browser-panel]').count()).toBe(0);expect(await page.locator('body>.st-menu').count()).toBe(1);expect(await page.getByRole('menuitem',{name:'插件',exact:true}).evaluate(el=>el===document.activeElement)).toBe(true);await expectLivePage(page);await page.evaluate(()=>window.scheduledMenuView.closeMenu())
  }
  await page.evaluate(()=>window.browserView.action('home'));await page.getByRole('button',{name:'更多浏览器操作'}).click();await anchor.focus();await anchor.press('Enter');await page.getByRole('menuitem',{name:'插件',exact:true}).waitFor();expect(await page.locator('[data-browser-panel]').count()).toBe(0);expect(await page.locator('body>.st-menu').count()).toBe(1);expect(await page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='capture'))).toEqual([]);expect(await page.locator('.eb-page-image').count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
})

it.each([true,false])('samples the gutter at the actual bottom corners after a tall center column is clamped (dark=%s)',async dark=>{
 const {page}=await fixture(1440,900,dark),expected=dark?[17,17,17]:[238,238,238];try{
  await page.evaluate(dark=>{document.body.style.background=dark?'#1e1e1e':'#fff';const shell=document.createElement('section');shell.id='corner-gutter-shell';shell.style.cssText='position:fixed;inset:0 0 10px;background:'+(dark?'#111':'#eee');const center=document.querySelector('.pI_x6G_centerCol');center.dataset.workspaceSurfaceHidden='true';center.style.visibility='hidden';shell.append(center);document.body.prepend(shell);return window.browserView.layout()},dark);expect(await page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='layout').at(-1)[1].cornerColor)).toEqual(expected)
  await page.evaluate(()=>{document.querySelector('.pI_x6G_centerCol').style.bottom='-40px';return window.browserView.layout()});expect(await page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='layout').at(-1)[1].cornerColor)).toEqual(expected);expect(await page.locator('.eb-root').evaluate(el=>el.getBoundingClientRect().bottom)).toBe(890);await page.setViewportSize({width:1100,height:720});await page.evaluate(()=>window.browserView.layout());expect(await page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='layout').at(-1)[1].cornerColor)).toEqual(expected);expect(await page.locator('.eb-root').evaluate(el=>el.getBoundingClientRect().bottom)).toBe(710);expect(await page.locator('.eb-root').evaluate(el=>{const r=el.getBoundingClientRect();return[r.left+.5,r.right-.5].map(x=>document.elementsFromPoint(x,r.bottom-.5).filter(node=>!el.contains(node)).find(node=>getComputedStyle(node).backgroundColor!=='rgba(0, 0, 0, 0)')?.id)})).toEqual(['corner-gutter-shell','corner-gutter-shell'])
 }finally{await page.close()}
})
