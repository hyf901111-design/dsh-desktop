import {beforeAll,afterAll,it,expect} from 'vitest'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
let browser,code
const evidence=process.env.BROWSER_APP_EVIDENCE||'/tmp/browser-app-figma-20261109'
beforeAll(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),contents:`import {mountDesktopShellStyles} from './src/preload/shell-style';mountDesktopShellStyles(document);import {BrowserAppView} from './src/preload/browser/view';
let listener;let n=0;const data={tabs:[{id:'tab0',url:'',title:'新标签页',private:false,pinned:false,muted:false,zoom:1,loading:false,canBack:false,canForward:false}],activeId:'tab0',history:[],closed:[],bookmarks:[],folders:[],downloads:[],settings:{engine:'Google',startup:'restore',bookmarksBar:true,askDownload:false,downloadPath:''}};
window.setBrowserState=value=>{Object.assign(data,value);listener(structuredClone(data))};window.browserCalls=[];window.snapshot=()=>structuredClone(data);window.update=()=>listener(structuredClone(data));
const bridge={subscribe:f=>{listener=f;return()=>{}},source:async(...args)=>window.browserCalls.push(['source',...args]),request:async(method,input={})=>{if(method==='site')return{permissions:data.sitePermissions??{}};window.browserCalls.push([method,input,{snapshot:!!document.querySelector('.eb-page-image'),painted:!!document.querySelector('.eb-page-image')?.naturalWidth}]);const t=data.tabs.find(t=>t.id===data.activeId);if(method==='capture')return window.browserCapture?await window.browserCapture():'';if(method==='new'){const tab={...t,id:'tab'+(++n),title:'新标签页',url:'',private:!!input.private};data.tabs.push(tab);data.activeId=tab.id}if(method==='select')data.activeId=input.id;if(method==='zoom')data.tabs.find(tab=>tab.id===input.id).zoom=input.value;if(method==='close'){const index=data.tabs.findIndex(t=>t.id===input.id);data.tabs.splice(index,1);if(data.activeId===input.id)data.activeId=data.tabs[Math.min(index,data.tabs.length-1)].id}if(method==='navigate'){t.url=input.url;t.title='Example Domain';data.history.unshift({id:'h'+n,url:input.url,title:t.title,at:Date.now()})}if(method==='bookmark'){const old=data.bookmarks.find(b=>b.url===input.url);if(input.remove)data.bookmarks=data.bookmarks.filter(b=>b.url!==input.url);else if(old)Object.assign(old,{title:input.title,folder:input.folder});else data.bookmarks.push({id:'b'+n,url:input.url,title:input.title,folder:input.folder,at:Date.now()})}if(method==='folder')data.folders.push(input.name);if(method==='settings')Object.assign(data.settings,input);if(method==='clear'&&input.history)data.history=[];if(method==='find')t.find={matches:6,activeMatchOrdinal:1};return structuredClone(data)}};
const host={register:(_name,el)=>document.body.append(el),open:()=>{},close:()=>{},current:()=>({surface:'browser'})};window.browserView=new BrowserAppView(document,bridge,host);window.browserView.open('session-A');`},bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent',plugins:[{name:'inline',setup(b){b.onResolve({filter:/\?(inline|raw)$/},async args=>{const r=await b.resolve(args.path.replace(/\?(inline|raw)$/,''),{resolveDir:args.resolveDir,kind:args.kind});return{path:r.path,namespace:'inline'}});b.onLoad({filter:/.*/,namespace:'inline'},async args=>({contents:JSON.stringify(args.path.endsWith('.svg')?'data:image/svg+xml,'+encodeURIComponent((await readFile(args.path,'utf8')).replaceAll(String.fromCharCode(34),String.fromCharCode(39))):await readFile(args.path,'utf8')),loader:'json'}))}}]});code=result.outputFiles[0].text
 const pw=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href):await import('playwright');browser=await pw.chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});await mkdir(evidence,{recursive:true})
},20000)
afterAll(async()=>browser?.close())
async function fixture(width=1920,height=1080,dark=true){const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setContent(`<html><head><style>body{margin:0;background:#151515}.pI_x6G_centerCol{position:fixed;left:${width===1920?306:64}px;top:10px;right:${width===1920?420:10}px;bottom:10px}</style></head><body ${dark?'data-ds-dark-theme':''}><main class="pI_x6G_centerCol" style="position:fixed;left:${width===1920?306:64}px;right:${width===1920?420:10}px;top:10px;bottom:10px;width:auto;height:auto;margin:0;box-sizing:border-box"></main></body></html>`);await page.addScriptTag({content:code});await page.getByRole('heading',{name:'从这里，打开一个新视野。'}).waitFor();return {page,errors}}
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
  expect(await panel.evaluate(el=>getComputedStyle(el).animationName)).toBe('eb-bookmarks-in');await expect.poll(()=>panel.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');await page.screenshot({path:evidence+'/bookmarks-anchored-dark.png'});await page.emulateMedia({reducedMotion:'reduce'});expect(await panel.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'更多浏览器操作'}).click();const material=await page.locator('[data-browser-panel=menu]').evaluate(el=>{const s=getComputedStyle(el);return{background:s.backgroundColor,blur:s.backdropFilter,divider:getComputedStyle(el.querySelector('hr')).backgroundColor,zoom:getComputedStyle(el.querySelector('.eb-zoom-controls')).boxShadow}});expect(material.background).toBe('rgb(36, 36, 36)');expect(material.blur).toBe('none');expect(material.divider).toMatch(/0\.08/);expect(material.zoom).toMatch(/0\.08/)
 }finally{await page.close()}
})
it('matches the Figma chrome dimensions and handles actual URL, multi-tab, collection and settings controls',async()=>{
 const {page,errors}=await fixture();try{
  await expect.poll(()=>page.locator('.eb-root').evaluate(el=>Math.round(el.getBoundingClientRect().width))).toBe(1194)
  for(const [cls,height]of [['eb-tabs',44],['eb-toolbar',48],['eb-bookmarks-bar',32]])expect(await page.locator('.'+cls).evaluate(el=>el.getBoundingClientRect().height)).toBe(height)
  expect(await page.getByRole('button',{name:'返回工作区',exact:true}).count()).toBe(0);expect(await page.locator('.eb-app-label').evaluate(el=>el.tagName)).toBe('DIV')
  expect(await page.locator('.eb-icon').evaluateAll(els=>els.every(el=>getComputedStyle(el).maskImage!=='none'))).toBe(true)
  await page.screenshot({path:evidence+'/start-dark.png'})
  const address=page.getByRole('combobox',{name:'搜索或输入网址'});await address.pressSequentially('https://example.com/',{delay:8});expect(await address.inputValue()).toBe('https://example.com/');await address.press('Enter');await expect.poll(()=>address.inputValue()).toBe('https://example.com/')
  await page.keyboard.press('Control+d');await page.getByRole('textbox',{name:'名称',exact:true}).fill('自己的研究收藏');await page.getByRole('button',{name:'完成',exact:true}).click();expect(await page.evaluate(()=>window.snapshot().bookmarks[0].title)).toBe('自己的研究收藏')
  await page.getByRole('button',{name:'收藏夹',exact:true}).click();expect(await page.getByRole('dialog',{name:'收藏夹'}).innerText()).toContain('自己的研究收藏');await page.screenshot({path:evidence+'/bookmarks-dark.png'});await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'新标签页',exact:true}).click();expect(await page.getByRole('tab').count()).toBe(2);expect(await page.getByRole('tab',{selected:true}).innerText()).toContain('新标签页')
  await page.getByRole('button',{name:'已打开的页签',exact:true}).click();expect(await page.getByRole('menuitemradio').count()).toBe(2);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'更多浏览器操作',exact:true}).click();expect(Math.abs((await page.locator('[data-browser-panel=menu]').boundingBox()).height-616)).toBeLessThanOrEqual(2);await page.screenshot({path:evidence+'/menu-dark.png'});await page.getByRole('menuitem',{name:/浏览器设置/}).click();await page.getByRole('combobox',{name:'默认搜索引擎'}).selectOption('Bing');expect(await page.evaluate(()=>window.snapshot().settings.engine)).toBe('Bing')
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)
it('keeps the narrow/light layout usable without clipped tools and exercises keyboard find and source handoff',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  const address=page.getByRole('combobox',{name:'搜索或输入网址'});await address.pressSequentially('https://example.com/',{delay:8});expect(await address.inputValue()).toBe('https://example.com/');await address.press('Enter');await page.keyboard.press('Control+f');const find=page.getByRole('textbox',{name:'查找内容'});await find.fill('Example');await expect.poll(()=>page.getByRole('search',{name:'页内查找'}).innerText()).toContain('1 / 6');await page.screenshot({path:evidence+'/find-light.png'});await page.keyboard.press('Escape')
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
  expect(typography).toEqual({font:'13px',line:'20px',gap:'10px',key:'11px',family:true});expect(await page.locator('.eb-zoom').evaluate(el=>el.offsetHeight)).toBe(40)
  await page.keyboard.press('Escape');await page.getByRole('tab').first().click({button:'right'});expect(await page.locator('[data-browser-panel=tabs] .eb-menu-item').first().evaluate(el=>getComputedStyle(el).fontSize)).toBe('12px');expect(await page.locator('[data-browser-panel=tabs] kbd').first().evaluate(el=>getComputedStyle(el).fontSize)).toBe('10px')
 }finally{await page.close()}
})
it('keeps many tabs compressed, the active tab visible, and the full-title switcher independent',async()=>{
 const {page}=await fixture(1440,900,false);try{
  await page.evaluate(()=>{const base=window.snapshot().tabs[0];window.setBrowserState({tabs:Array.from({length:24},(_,i)=>({...base,id:'many'+i,title:'完整的研究页面标题 '+i})),activeId:'many23'})})
  const selected=page.getByRole('tab',{selected:true}),list=page.locator('.eb-tab-scroll');const box=await selected.boundingBox(),bounds=await list.boundingBox();expect(box.x).toBeGreaterThanOrEqual(bounds.x-1);expect(box.x+box.width).toBeLessThanOrEqual(bounds.x+bounds.width+1)
  const trigger=page.getByRole('button',{name:'已打开的页签'});expect(await trigger.evaluate(el=>!!el.closest('.eb-tab-scroll'))).toBe(false);await trigger.click();expect(await page.getByRole('menuitemradio').count()).toBe(24);await page.getByRole('menuitemradio',{name:'完整的研究页面标题 0',exact:true}).click();await expect.poll(()=>page.getByRole('tab',{selected:true}).getAttribute('data-id')).toBe('many0');expect(await trigger.evaluate(el=>el===document.activeElement)).toBe(true)
  await page.getByRole('tab',{selected:true}).focus();await page.keyboard.press('End');await expect.poll(()=>page.getByRole('tab',{selected:true}).getAttribute('data-id')).toBe('many23');await page.getByRole('button',{name:'关闭 完整的研究页面标题 23',exact:true}).click();await expect.poll(()=>page.getByRole('tab',{selected:true}).getAttribute('data-id')).toBe('many22');expect(await page.getByRole('tab',{selected:true}).evaluate(el=>el===document.activeElement)).toBe(true)
  await page.screenshot({path:evidence+'/many-tabs-light.png'})
 }finally{await page.close()}
})

it('adapts all tab widths while giving the crowded active tab more readable space and safe favicons',async()=>{
 const {page,errors}=await fixture(1440,900,false);try{
  const widths=[]
  for(const count of [3,9,24]){
   await page.evaluate(count=>{const base=window.snapshot().tabs[0],canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d');ctx.fillStyle='#2071f3';ctx.fillRect(0,0,32,32);window.setBrowserState({tabs:Array.from({length:count},(_,i)=>({...base,id:'adaptive'+i,url:'https://page'+i+'.example/',title:'完整页签标题 '+i,favicon:canvas.toDataURL()})),activeId:'adaptive'+(count-1)})},count)
   const sizes=await page.getByRole('tab').evaluateAll(tabs=>tabs.map(tab=>tab.getBoundingClientRect().width));if(count<=6)expect(Math.max(...sizes)-Math.min(...sizes)).toBeLessThan(1);else{expect(sizes.at(-1)).toBeGreaterThan(sizes[0]+30);expect(sizes.at(-1)).toBeGreaterThanOrEqual(112);expect(sizes.at(-1)).toBeLessThanOrEqual(sizes[0]*3.6)}widths.push(sizes[0]);expect(await page.locator('.eb-tab img.eb-tab-favicon').count()).toBe(count)
  }
  expect(widths[0]).toBeGreaterThan(widths[1]);expect(widths[1]).toBeGreaterThan(widths[2]);await page.setViewportSize({width:3000,height:900});const wide=await page.getByRole('tab').evaluateAll(tabs=>tabs.map(tab=>tab.getBoundingClientRect().width));expect(wide.at(-1)).toBeGreaterThan(wide[0]+30);await page.setViewportSize({width:1440,height:900});await page.screenshot({path:evidence+'/adaptive-tabs-favicons-light.png'})
  await page.getByRole('button',{name:'已打开的页签'}).click();expect(await page.locator('[data-browser-panel=tab-list] img.eb-tab-favicon').count()).toBe(24);await page.getByRole('menuitemradio',{name:'完整页签标题 0',exact:true}).click();await page.getByRole('button',{name:'关闭 完整页签标题 0',exact:true}).click();expect(await page.getByRole('tab',{selected:true}).getAttribute('data-id')).toBe('adaptive1');expect(await page.getByRole('tab',{selected:true}).evaluate(el=>el===document.activeElement)).toBe(true)
  await page.evaluate(()=>{const state=window.snapshot();state.tabs[0].favicon='https://external-favicon.invalid/private';window.setBrowserState(state)});expect(await page.locator('.eb-tab[data-id=adaptive1] img').count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('keeps adaptive tabs reachable beside the native pane button in a crowded narrow strip',async()=>{
 const {page,errors}=await fixture(640,700,true);try{
  await page.evaluate(()=>{const entry=document.createElement('button');entry.dataset.odysseyPanelEntry='right';entry.setAttribute('aria-expanded','false');entry.style.cssText='position:fixed;right:16px;top:16px;width:32px;height:32px;z-index:99';document.body.append(entry);const base=window.snapshot().tabs[0];window.setBrowserState({tabs:Array.from({length:32},(_,i)=>({...base,id:'crowded'+i,title:'窄屏完整标题 '+i})),activeId:'crowded31'});window.dispatchEvent(new Event('resize'))})
  await expect.poll(()=>page.getByRole('tab',{selected:true}).evaluate(el=>{const list=el.parentElement.getBoundingClientRect(),box=el.getBoundingClientRect();return box.left>=list.left-1&&box.right<=list.right+1})).toBe(true)
  const widths=await page.getByRole('tab').evaluateAll(tabs=>tabs.map(tab=>tab.getBoundingClientRect().width));expect(widths.at(-1)).toBeGreaterThan(widths[0]+30);expect(widths.at(-1)).toBeGreaterThanOrEqual(112)
  const next=await page.getByRole('button',{name:'新标签页',exact:true}).boundingBox(),entry=await page.locator('[data-odyssey-panel-entry=right]').boundingBox();expect(next.x+next.width).toBeLessThanOrEqual(entry.x-8)
  await page.getByRole('button',{name:'已打开的页签'}).click();expect(await page.getByRole('menuitemradio').count()).toBe(32);await page.getByRole('menuitemradio',{name:'窄屏完整标题 31',exact:true}).click();await page.getByRole('tab',{selected:true}).click({button:'middle'});expect(await page.getByRole('tab',{selected:true}).getAttribute('data-id')).toBe('crowded30');expect(await page.getByRole('tab',{selected:true}).evaluate(el=>el===document.activeElement)).toBe(true)
  await page.screenshot({path:evidence+'/adaptive-tabs-dark-narrow.png'});expect(errors).toEqual([])
 }finally{await page.close()}
})

it('gives every home shortcut its own content, opens the chosen URL, and supports empty research collections',async()=>{
 const {page}=await fixture(1440,900,false);try{
  await page.evaluate(()=>{window.setBrowserState({history:[{id:'h1',title:'经常访问的站点',url:'https://frequent.example/',at:300},{id:'h2',title:'经常访问的站点',url:'https://frequent.example/',at:200},{id:'h3',title:'最新访问',url:'https://recent.example/',at:400}],bookmarks:[{id:'b1',title:'研究报告',url:'https://research.example/',folder:'研究资料',at:1},{id:'b2',title:'其他收藏',url:'https://saved.example/',at:2}]})})
  await page.getByRole('button',{name:'常用网站',exact:true}).click();await page.getByRole('heading',{name:'常用网站',exact:true}).waitFor();expect(await page.locator('.eb-library-list .eb-list-row').count()).toBe(2);expect(await page.locator('.eb-library-list .eb-list-row').first().innerText()).toContain('经常访问的站点');expect(await page.locator('.eb-popover').count()).toBe(0)
  await page.getByRole('button',{name:'返回首页'}).click();await page.getByRole('button',{name:'研究资料',exact:true}).click();expect(await page.locator('.eb-library-list').innerText()).toContain('研究报告');expect(await page.locator('.eb-library-list').innerText()).not.toContain('其他收藏');await page.getByRole('button',{name:'添加网址',exact:true}).click();await page.getByRole('textbox',{name:'名称',exact:true}).fill('新研究');await page.getByRole('textbox',{name:'网址',exact:true}).fill('https://new-research.example/');await page.getByRole('button',{name:'添加',exact:true}).click();expect(await page.evaluate(()=>window.snapshot().bookmarks.at(-1).folder)).toBe('研究资料')
  await page.getByRole('button',{name:'返回首页'}).click();await page.getByRole('button',{name:'我的收藏',exact:true}).click();expect(await page.locator('.eb-library-list .eb-list-row').count()).toBe(3)
  await page.getByRole('button',{name:'返回首页'}).click();await page.getByRole('button',{name:'最近访问',exact:true}).click();expect(await page.locator('.eb-library-list .eb-list-row').count()).toBe(3);await page.locator('.eb-library-list .eb-list-row').first().click();expect(await page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='navigate').at(-1)[1].url)).toBe('https://frequent.example/')
 }finally{await page.close()}
})

it('keeps site, bookmark, search and print panels at their own Figma sizes under the full shell cascade',async()=>{
 const {page}=await fixture(1440,900,false);try{
  await page.evaluate(()=>{const state=window.snapshot();state.tabs[0].url='https://example.com/';state.tabs[0].title='Example';window.setBrowserState(state)})
  await page.getByRole('button',{name:'站点信息',exact:true}).click();expect(await page.locator('.eb-site-permission').count()).toBe(5);expect(await page.locator('.eb-site-permission').evaluateAll(nodes=>nodes.every(n=>n.offsetHeight===42))).toBe(true);expect(await page.getByRole('combobox',{name:'位置',exact:true}).inputValue()).toBe('ask');expect(await page.getByRole('combobox',{name:'自动下载',exact:true}).inputValue()).toBe('allow');await page.screenshot({path:evidence+'/site-light.png'});await page.keyboard.press('Escape')
  await page.keyboard.press('Control+d');expect(await page.getByRole('textbox',{name:'名称',exact:true}).evaluate(n=>({height:n.offsetHeight,font:getComputedStyle(n).fontSize,color:getComputedStyle(n).color}))).toMatchObject({height:42,font:'12px'});expect(await page.locator('[data-browser-panel=save] footer').evaluate(n=>n.offsetHeight)).toBe(40);await page.screenshot({path:evidence+'/save-light.png'});await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'收藏夹',exact:true}).click();expect(await page.getByRole('textbox',{name:'搜索收藏'}).evaluate(n=>n.offsetHeight)).toBe(34);await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'更多浏览器操作'}).click();await page.getByRole('menuitem',{name:/打印 \/ 导出 PDF/}).click();expect(await page.getByRole('button',{name:'保存 PDF',exact:true}).count()).toBe(1);await page.getByRole('combobox',{name:'目标',exact:true}).selectOption('printer');expect(await page.getByRole('button',{name:'打印',exact:true}).count()).toBe(1);expect(await page.locator('[data-browser-panel=print] footer').evaluate(n=>n.offsetHeight)).toBe(44)
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

it('keeps the native page visible until the menu snapshot is decoded and painted and covers closing handoff',async()=>{
 const {page,errors}=await fixture(1440,900,true);try{
  await page.evaluate(()=>{const state=window.snapshot();state.tabs[0].url='https://example.com/';window.setBrowserState(state);const canvas=document.createElement('canvas');canvas.width=20;canvas.height=20;canvas.getContext('2d').fillRect(0,0,20,20);window.browserCapture=()=>new Promise(resolve=>window.releaseCapture=()=>resolve(canvas.toDataURL()))})
  await expect.poll(()=>page.evaluate(()=>window.browserCalls.some(c=>c[0]==='layout'&&c[1].visible))).toBe(true);await page.evaluate(()=>window.browserCalls.length=0)
  await page.getByRole('button',{name:'更多浏览器操作'}).click();await page.waitForFunction(()=>typeof window.releaseCapture==='function');await page.evaluate(()=>new Promise(requestAnimationFrame));expect(await page.evaluate(()=>window.browserCalls.some(c=>c[0]==='layout'&&c[1].visible===false))).toBe(false)
  await page.evaluate(()=>window.releaseCapture());await expect.poll(()=>page.evaluate(()=>window.browserCalls.some(c=>c[0]==='layout'&&c[1].visible===false))).toBe(true);expect(await page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='layout'&&c[1].visible===false).every(c=>c[2].snapshot&&c[2].painted))).toBe(true)
  await page.evaluate(()=>window.browserCalls.length=0);await page.keyboard.press('Escape');await expect.poll(()=>page.evaluate(()=>window.browserCalls.some(c=>c[0]==='layout'&&c[1].visible))).toBe(true);expect(await page.evaluate(()=>window.browserCalls.find(c=>c[0]==='layout'&&c[1].visible)[2].snapshot)).toBe(true);await expect.poll(()=>page.locator('.eb-page-image').count()).toBe(0)
  await page.getByRole('button',{name:'收藏夹',exact:true}).click();await page.keyboard.press('Escape');await page.evaluate(()=>window.releaseCapture());await expect.poll(()=>page.locator('[data-browser-panel]').count()).toBe(0);await page.evaluate(()=>{window.browserCalls.length=0;const menu=document.createElement('div');menu.setAttribute('role','menu');menu.style.cssText='position:fixed;left:4px;top:150px;width:48px;height:200px';menu.id='outside-menu';document.body.append(menu)});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(await page.evaluate(()=>window.browserCalls.some(c=>c[0]==='layout'&&c[1].visible===false))).toBe(false);await page.evaluate(()=>{window.releaseCapture=undefined;document.getElementById('outside-menu').style.left='100px';window.dispatchEvent(new Event('resize'))});await page.waitForFunction(()=>typeof window.releaseCapture==='function');await page.evaluate(()=>window.releaseCapture());await expect.poll(()=>page.evaluate(()=>window.browserCalls.some(c=>c[0]==='layout'&&c[1].visible===false))).toBe(true);expect(await page.evaluate(()=>window.browserCalls.filter(c=>c[0]==='layout'&&c[1].visible===false).every(c=>c[2].snapshot&&c[2].painted))).toBe(true);await page.evaluate(()=>document.getElementById('outside-menu').remove());await expect.poll(()=>page.locator('.eb-page-image').count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
})
