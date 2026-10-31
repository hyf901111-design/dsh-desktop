import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
let browser:any,script:string,uiExpect:any
const evidence='/tmp/sherlock-explore-refinement-20261031/browser'
beforeAll(async()=>{
 await mkdir(evidence,{recursive:true})
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{mountExploreMenu}from'./src/preload/explore-menu';import{mountDesktopShellStyles}from'./src/preload/shell-style';mountDesktopShellStyles(document);import{mountAccountUi}from'./src/preload/account-ui';import{mountResearchBoardNotifications}from'./src/preload/research-board-notifications-ui';import{installExploreSearch}from'./src/preload/explore-search';import{mountHomeThemes,getHomeThemeController}from'./src/preload/home-themes';import{createHomeOperationsActions}from'./src/preload/home-operations-actions';import{installHomeOperationsNavigation}from'./src/preload/home-operations-navigation';
 let durable='default',user={id:'qa-owner',username:'研究员',createdAt:1},generation=0;window.calls=[];window.opened=[];window.rows=[{key:'board:b',title:'中际旭创研究工作台',area:'boards',boardId:'b',sessionId:'board-session',time:3,kind:'board',location:'个人看板'},{key:'session:n',title:'中际旭创现金流笔记',area:'workspaces',sessionId:'n',time:2,kind:'note',location:'研究工作区'},{key:'session:c',title:'中际旭创收入分析',area:'workspaces',sessionId:'c',time:1,kind:'session',location:'研究工作区'}];window.holdOpen=false;window.cancelled=0;let searchNavigation=0,sourceRefresh=()=>{};
 window.copied=[];window.copyFailure=false;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{if(window.copyFailure)throw Error('clipboard unavailable');window.copied.push(value)}}});window.actionHold=false;const original=document.querySelector('.VOzbGW_trigger');original.onclick=()=>{if(document.querySelector('.VOzbGW_panel'))return;const panel=document.createElement('div');panel.className='VOzbGW_panel';panel.innerHTML='<nav><div class="VOzbGW_navList"><button data-settings-section-id="general">通用设置</button></div></nav><button class="VOzbGW_close">关闭设置</button><div class="VOzbGW_content"><div class="VOzbGW_options"></div></div>';panel.querySelector('.VOzbGW_close').onclick=()=>panel.remove();document.body.append(panel)};
 const accountBridge={getSnapshot:async()=>({account:{user:{userId:'qa-owner',publicId:'1234567890'}}})};const disposeAccount=mountAccountUi(document,async(action)=>{window.calls.push({action});if(action==='logout'){user=null;generation++}return{user}},accountBridge,{explore:true});
 const offBell=mountResearchBoardNotifications(document,{getSnapshot:async()=>({version:1,eventSeq:1,account:{status:'ready',generation:1,user:{userId:'qa-owner',username:'研究员',publicId:'1234567890'}},favorites:[],boards:[],current:null,recoveries:[],notifications:{cursor:0,unreadCount:0,pendingCount:0,notifications:[]}}),subscribe:()=>()=>{}});
 const offSearch=installExploreSearch(document,{generation:()=>generation,results:query=>window.rows.filter(row=>row.title.toLowerCase().includes(query.trim().toLowerCase())),subscribe:fn=>{sourceRefresh=fn;return()=>{}},cancelOpen:()=>{window.cancelled++;searchNavigation++},open:async row=>{const navigation=searchNavigation;if(window.holdOpen)await new Promise(resolve=>window.releaseOpen=resolve);if(navigation===searchNavigation)window.opened.push(row.key)}});
 const snapshot={current:'current',byId:{current:{id:'current',title:'保留会话'}},ids:['current']};const offNavigation=installHomeOperationsNavigation({document,sessions:{list:{getSnapshot:()=>snapshot,subscribe:()=>()=>{}},binding:()=>({session:{getSnapshot:()=>({})}}),subagentAddress:()=>undefined,open:()=>{}},workspaces:{list:{getSnapshot:()=>({items:[]})},connectWorkspace:async()=>''},inputHub:{shell:()=>({snapshot:{phase:'plain',draftRev:0}})},composerBlocks:{storeFor:()=>({getSnapshot:()=>undefined})}});
 const actions=createHomeOperationsActions(document,{request:async()=>({type:'snapshot',snapshot:{rows:[{kind:'skill',id:'builtin:efund-ppt-maker',name:'PPT',enabled:true,revision:1},{kind:'skill',id:'builtin:ework-equity-research',name:'研报',enabled:true,revision:1}]}}),useSkill:async input=>window.calls.push({skill:input.id,prefill:input.prefill.text})});
 let offTheme,offExplore;const mount=()=>{offTheme=mountHomeThemes(document,{get:()=>durable,set:theme=>{durable=theme;window.calls.push({theme});return true}});offExplore=mountExploreMenu(document,{themeController:getHomeThemeController(document),onToggleAppearance:async()=>{window.calls.push({appearance:true});document.body.toggleAttribute('data-ds-dark-theme')},onAction:async(card,context)=>{window.actionSignal=context.signal;if(window.actionHold)await new Promise(resolve=>window.releaseAction=resolve);if(!context.signal.aborted)await actions.run(card,context)},onExample:async(kind,context)=>{window.exampleContext=context;window.exampleWasOpen=document.querySelector('dialog.odyssey-explore').open;if(window.exampleHold)await new Promise(resolve=>window.releaseExample=resolve);if(context.signal.aborted)return;await context.demoEntry.closeOwned();window.calls.push({example:kind,aborted:context.signal.aborted})}})};mount();
 window.fixture={restart(){offExplore();offTheme();mount()},generation(){generation++;sourceRefresh()},selected:()=>getHomeThemeController(document).getSelected(),dispose(){offExplore();offTheme();offSearch();offBell();disposeAccount();offNavigation();actions.dispose()}};
 `},bundle:true,format:'iife',platform:'browser',write:false,logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'production-assets',setup(builder){
  builder.onResolve({filter:/\?(?:inline|raw|url&inline)$/},args=>({path:args.path.startsWith('.')?resolve(args.resolveDir,args.path.replace(/\?(?:inline|raw|url&inline)$/, '' )):require.resolve(args.path.replace(/\?(?:inline|raw|url&inline)$/, '' )),namespace:args.path.endsWith('?raw')?'raw':'asset'}))
  builder.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:'export default '+JSON.stringify(await readFile(args.path,'utf8')),loader:'js'}))
  builder.onLoad({filter:/.*/,namespace:'asset'},async args=>{const mime=args.path.endsWith('.svg')?'image/svg+xml':args.path.endsWith('.png')?'image/png':'image/jpeg';return{contents:'export default '+JSON.stringify('data:'+mime+';base64,'+(await readFile(args.path)).toString('base64')),loader:'js'}})
 }}]});script=result.outputFiles[0]!.text
 const runtime=await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 uiExpect=(await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/test.mjs').href)).expect
 browser=await(runtime.default??runtime).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--enable-unsafe-swiftshader']})
},60000)
afterAll(()=>browser?.close())
async function fixture({dark=true,width=1600,height=1000,reduced=true,collapsed=false,clock=false}={}){
 const context=await browser.newContext({viewport:{width,height},reducedMotion:reduced?'reduce':'no-preference'}),page=await context.newPage(),errors:string[]=[]
 page.on('pageerror',(error:Error)=>errors.push(error.message))
 await page.route('https://explore.test/**',(route:any)=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-odyssey-locale="zh"><meta charset="UTF-8"><style>body{--dsw-alias-interactive-bg-hover:rgba(150,150,150,.18);margin:0;background:linear-gradient(140deg,#10161d,#243b52);font:16px system-ui;color:#ddd}#sidebar{position:fixed;left:0;top:0;bottom:0;width:${collapsed?80:250}px;background:#151719;padding:16px;box-sizing:border-box}#footer{position:absolute;bottom:16px;left:16px;right:16px}.pI_x6G_centerCol{margin-left:260px;padding:20px}textarea{width:650px;height:130px;background:#333;color:#ddd;border:0;border-radius:20px;padding:16px;font:16px system-ui}.wSkVaW_root{height:100vh;box-sizing:border-box}.wSkVaW_header{height:40px}.wSkVaW_composerHero{margin-top:22vh}h1{font-weight:500;font-size:28px}button{font:inherit}body:not([data-ds-dark-theme]){background:linear-gradient(130deg,#dde2e7,#aac5d6);color:#27333e}body:not([data-ds-dark-theme]) #sidebar{background:#eee;color:#27333e}</style><body ${dark?'data-ds-dark-theme':''} ${collapsed?'data-sidebar-collapsed="true"':''}><aside id="sidebar" class="hHd-Xa_root ${collapsed?'hHd-Xa_collapsed':''}"><b>EWork Odyssey</b><p>看板区</p><p>中际旭创研究工作台</p><p>工作区</p><p>专业研究笔记</p><footer id="footer"><button class="VOzbGW_trigger">设置</button></footer></aside><main class="pI_x6G_centerCol"><section class="wSkVaW_root" data-odyssey-page="home"><header class="wSkVaW_header" data-srb-session-header data-ework-notes-session="current"><span>保留会话</span><div data-srb-tabs><button data-conversation-view-id="research" aria-selected="false" onclick="this.setAttribute('aria-selected','true')">研究</button><button data-conversation-view-id="notes" aria-selected="false" onclick="this.setAttribute('aria-selected','true')">笔记</button></div></header><div class="wSkVaW_composerHero"><h1>探索更远，洞见更深</h1><textarea aria-label="保留的原输入框" data-odyssey-file-reference-session="current">原草稿必须保留</textarea></div></section></main></body></html>`}))
 await page.route('https://explore.test/figma-self-avatar.png',(route:any)=>route.fulfill({contentType:'image/png',path:resolve('build/brand/figma-self-avatar.png')}));await page.route('https://explore.test/fonts/NotoSansSC.woff2',(route:any)=>route.fulfill({contentType:'font/woff2',path:resolve('build/fonts/NotoSansSC.woff2')}));await page.goto('https://explore.test/');if(clock)await page.clock.install({time:new Date('2026-10-30T00:00:00Z')});await page.addScriptTag({content:script});await page.getByRole('button',{name:'探索',exact:true}).waitFor();await expect.poll(()=>page.locator('.sherlock-account-button').getAttribute('data-explore-trigger')).toBe('');await page.evaluate(()=>document.fonts.ready);expect(errors).toEqual([])
 return{page,context,errors,async close(){await context.close()}}
}
async function open(page:any){await page.getByRole('button',{name:'探索',exact:true}).click();await uiExpect(page.getByRole('dialog',{name:'探索',exact:true})).toBeVisible();await page.locator('.odyssey-explore-content').evaluate((node:HTMLElement)=>Promise.all(node.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished)))}
it('replaces the bottom account entry with an always-flowing orb and opens a centered full-client menu without changing the draft',async()=>{
 const f=await fixture({reduced:false});try{
  const input=f.page.getByRole('textbox',{name:'保留的原输入框'});await input.focus()
  const orb=f.page.locator('[data-explore-trigger] .odyssey-explore-orb');expect(await orb.locator('img').count()).toBe(3)
  const frameBefore=await orb.screenshot({path:evidence+'/orb-non-hover-0.png',animations:'allow'})
  const before=await orb.locator('img').evaluateAll((nodes:Element[])=>nodes.map(node=>({opacity:getComputedStyle(node).opacity,transform:getComputedStyle(node).transform})))
  await f.page.waitForTimeout(350)
  const after=await orb.locator('img').evaluateAll((nodes:Element[])=>nodes.map(node=>({opacity:getComputedStyle(node).opacity,transform:getComputedStyle(node).transform})))
  const frameAfter=await orb.screenshot({path:evidence+'/orb-non-hover-1.png',animations:'allow'});expect(frameBefore.equals(frameAfter)).toBe(false);await writeFile(evidence+'/orb-motion-samples.json',JSON.stringify({hovered:false,before,after},null,2))
  expect(after).not.toEqual(before);expect(after.some((row:any,index:number)=>row.transform!==before[index].transform)).toBe(true)
  await open(f.page);await uiExpect(f.page.getByRole('tab',{name:'快速开始',exact:true})).toBeVisible();expect(await f.page.locator('[data-odyssey-home-operations-toggle]').count()).toBe(0)
  await f.page.waitForTimeout(330)
  const geometry=await f.page.locator('.odyssey-explore-content').evaluate((node:HTMLElement)=>{const r=node.getBoundingClientRect();return{x:r.x,width:r.width,height:r.height,center:r.x+r.width/2,backdrop:getComputedStyle(node.closest('dialog')!,'::backdrop').backdropFilter}})
  expect(geometry.width).toBeCloseTo(928,0);expect(geometry.center).toBeCloseTo(800,0);expect(geometry.backdrop).toBe('blur(12px)')
  await f.page.screenshot({path:evidence+'/dark-quick.png'});await f.page.getByRole('button',{name:'关闭探索',exact:true}).click();await uiExpect(f.page.getByRole('dialog',{name:'探索',exact:true})).not.toBeVisible();expect(await input.inputValue()).toBe('原草稿必须保留');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('closes from the surrounding background and Escape, and restores the sidebar trigger in collapsed layout',async()=>{
 const f=await fixture({collapsed:true,width:1100,height:760});try{await open(f.page);await f.page.locator('.odyssey-explore').click({position:{x:8,y:400}});await uiExpect(f.page.locator('dialog.odyssey-explore')).not.toBeVisible();await uiExpect(f.page.getByRole('button',{name:'探索',exact:true})).toBeFocused();await open(f.page);await f.page.keyboard.press('Escape');await uiExpect(f.page.locator('dialog.odyssey-explore')).not.toBeVisible();expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it('uses native wallpaper preferences and appearance changes, and restores the selected wallpaper after a controller remount',async()=>{
 const f=await fixture();try{await open(f.page);await f.page.getByRole('tab',{name:'主题壁纸',exact:true}).click();await f.page.getByRole('button',{name:'星云风暴',exact:true}).click();expect(await f.page.evaluate(()=>(window as any).fixture.selected())).toBe('shashidhar');await f.page.getByRole('button',{name:'切换为浅色',exact:true}).click();await expect.poll(()=>f.page.locator('body').getAttribute('data-ds-dark-theme')).toBeNull();await f.page.screenshot({path:evidence+'/light-wallpapers.png'});await f.page.getByRole('button',{name:'关闭探索',exact:true}).click();await f.page.evaluate(()=>(window as any).fixture.restart());await open(f.page);await f.page.getByRole('tab',{name:'主题壁纸',exact:true}).click();await uiExpect(f.page.getByRole('button',{name:'星云风暴',exact:true})).toHaveAttribute('aria-pressed','true');expect(f.errors).toEqual([])}finally{await f.close()}
},20000)
it('searches actual source rows by keyword and all four categories, clears and collapses, then opens a keyboard-selected result',async()=>{
 const f=await fixture();try{await open(f.page);await f.page.getByRole('button',{name:'搜索会话',exact:true}).click();const input=f.page.getByRole('searchbox',{name:'搜索会话',exact:true});await input.fill('中际');await uiExpect(f.page.getByRole('option')).toHaveCount(3);for(const [name,title]of [['看板','中际旭创研究工作台'],['笔记','中际旭创现金流笔记'],['会话','中际旭创收入分析']]){await f.page.getByRole('tab',{name,exact:true}).click();await uiExpect(f.page.getByRole('option')).toHaveCount(1);await uiExpect(f.page.getByRole('option')).toContainText(title)}await f.page.getByRole('tab',{name:'全部',exact:true}).click();await input.fill('不存在的内容');await uiExpect(f.page.getByText('没有匹配的会话',{exact:true})).toBeVisible();await input.fill('');await uiExpect(f.page.getByRole('option')).toHaveCount(3);await f.page.screenshot({path:evidence+'/search-results.png'});await f.page.keyboard.press('Escape');await uiExpect(input).not.toBeVisible();await f.page.getByRole('button',{name:'搜索会话',exact:true}).click();await input.fill('现金流');await input.press('Enter');await expect.poll(()=>f.page.evaluate(()=>(window as any).opened)).toEqual(['session:n']);await uiExpect(f.page.locator('dialog.odyssey-explore')).not.toBeVisible();expect(f.errors).toEqual([])}finally{await f.close()}
},20000)
it('keeps account actions clickable above the modal and closes Explore before opening the original settings shell',async()=>{
 const f=await fixture();try{await open(f.page);await f.page.getByRole('button',{name:'研究员，打开账户菜单',exact:true}).click();const menu=f.page.getByRole('menu');await uiExpect(menu).toBeVisible();expect(await menu.evaluate((node:HTMLElement)=>node.matches(':popover-open')&&!!node.closest('dialog'))).toBe(true);await uiExpect(menu.getByRole('menuitem',{name:'退出登录',exact:true})).toBeVisible();await f.page.keyboard.press('Escape');await uiExpect(menu).not.toBeVisible();await uiExpect(f.page.getByRole('button',{name:'研究员，打开账户菜单',exact:true})).toBeFocused();await f.page.getByRole('button',{name:'设置',exact:true}).click();await uiExpect(f.page.locator('dialog.odyssey-explore')).not.toBeVisible();await uiExpect(f.page.locator('.VOzbGW_panel')).toBeVisible();expect(f.errors).toEqual([])}finally{await f.close()}
},20000)
it.each([true,false])('matches the R7 glass account menu and copies the actual pure public ID in dark=%s',async dark=>{
 const f=await fixture({dark});try{
  await open(f.page);const anchor=f.page.getByRole('button',{name:'研究员，打开账户菜单',exact:true});await anchor.click();const menu=f.page.getByRole('menu');await uiExpect(menu.getByRole('menuitem',{name:'复制用户 ID',exact:true})).toBeEnabled();await uiExpect(menu).toContainText('用户 ID：1234567890');expect(await menu.getByRole('menuitem').count()).toBe(2);expect(await menu.locator('.sherlock-account-avatar,.sherlock-account-menu-profile').count()).toBe(0);expect(await menu.getByText('设置',{exact:true}).count()).toBe(0)
  const geometry=await menu.evaluate((node:HTMLElement)=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node),rows=[...node.querySelectorAll('button')].map(row=>({width:row.getBoundingClientRect().width,height:row.getBoundingClientRect().height}));return{width:r.width,height:r.height,background:s.backgroundColor,blur:s.backdropFilter,radius:s.borderRadius,border:s.borderColor,rows}});expect(geometry.width).toBe(224);expect(geometry.height).toBe(88);expect(geometry.blur).toBe('blur(18px)');expect(geometry.background).toBe('rgba(43, 43, 43, 0.68)');expect(geometry.radius).toBe('16px');expect(geometry.rows).toEqual([{width:24,height:24},{width:208,height:32}]);await writeFile(evidence+'/account-'+dark+'.json',JSON.stringify(geometry,null,2));await menu.screenshot({path:evidence+'/account-'+dark+'.png'})
  await menu.getByRole('menuitem',{name:'复制用户 ID',exact:true}).click();await uiExpect(menu).toContainText('已复制');expect(await f.page.evaluate(()=>(window as any).copied)).toEqual(['1234567890']);await uiExpect(menu.locator('[data-copied]')).toHaveCount(1);await uiExpect(menu).toContainText('用户 ID：1234567890');const hint=await menu.locator('.odyssey-explore-account-copy-feedback').boundingBox();expect(hint.width).toBe(68);expect(hint.height).toBe(28);expect(await menu.locator('svg').evaluateAll((nodes:SVGSVGElement[])=>nodes.map(node=>[node.getAttribute('width'),node.getAttribute('height')]))).toEqual([['16','16'],['16','16'],['16','16']]);await f.page.screenshot({path:evidence+'/account-copied-'+dark+'.png'});await uiExpect(menu).toContainText('用户 ID：1234567890',{timeout:2500});await f.page.getByRole('tab',{name:'主题壁纸',exact:true}).click();await uiExpect(menu).not.toBeVisible();await uiExpect(f.page.getByRole('dialog',{name:'探索',exact:true})).toBeVisible();await anchor.click();await f.page.keyboard.press('Escape');await uiExpect(f.page.getByRole('menu')).not.toBeVisible();await uiExpect(anchor).toBeFocused();expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('keeps the public ID after clipboard failure without adding a feedback row',async()=>{
 const f=await fixture();try{await open(f.page);await f.page.getByRole('button',{name:'研究员，打开账户菜单',exact:true}).click();const menu=f.page.getByRole('menu');await uiExpect(menu.getByRole('menuitem',{name:'复制用户 ID',exact:true})).toBeEnabled();await f.page.evaluate(()=>(window as any).copyFailure=true);await menu.getByRole('menuitem',{name:'复制用户 ID',exact:true}).click();await uiExpect(menu).toContainText('用户 ID：1234567890');await uiExpect(menu.getByRole('menuitem',{name:'复制用户 ID',exact:true})).toHaveAttribute('title','复制失败，请重试');await uiExpect(menu).toContainText('复制失败，请重试');expect((await menu.boundingBox()).height).toBe(88);await uiExpect(menu).toContainText('用户 ID：1234567890',{timeout:2500});await f.page.getByRole('button',{name:'关闭探索',exact:true}).click();await uiExpect(menu).not.toBeVisible();expect(await f.page.evaluate(()=>(window as any).calls.filter((row:any)=>row.action==='logout'))).toEqual([]);expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it('hands quick actions and all five example selections to the existing action adapters after dismissing the menu',async()=>{
 const f=await fixture();try{for(const card of ['board','note','ppt','report']){await open(f.page);await f.page.locator('[data-explore-card="'+card+'"]').click();await uiExpect(f.page.locator('dialog.odyssey-explore')).not.toBeVisible();if(card==='board'||card==='note')await uiExpect(f.page.locator('[data-conversation-view-id="'+(card==='board'?'research':'notes')+'"]').first()).toHaveAttribute('aria-selected','true')}
  expect((await f.page.evaluate(()=>(window as any).calls)).filter((row:any)=>row.skill).map((row:any)=>row.skill)).toEqual(['builtin:efund-ppt-maker','builtin:ework-equity-research'])
  for(let index=0;index<5;index++){await open(f.page);await f.page.locator('.odyssey-explore-pages button').nth(index).click();await f.page.locator('.odyssey-explore-example').click();await expect.poll(()=>f.page.evaluate(()=>(window as any).calls.filter((row:any)=>row.example).length)).toBe(index+1)}
  expect((await f.page.evaluate(()=>(window as any).calls)).filter((row:any)=>row.example).map((row:any)=>row.example)).toEqual(['board','note','ppt','report','workbench']);expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)
it('cancels pending search opening when the menu closes and ignores late replies or a changed account owner',async()=>{
 const f=await fixture();try{await open(f.page);await f.page.getByRole('button',{name:'搜索会话',exact:true}).click();await f.page.evaluate(()=>{(window as any).holdOpen=true});await f.page.getByRole('option').first().click();await f.page.getByRole('button',{name:'关闭探索',exact:true}).click();expect(await f.page.evaluate(()=>(window as any).cancelled)).toBe(1);await f.page.evaluate(()=>(window as any).releaseOpen());await uiExpect(f.page.locator('dialog.odyssey-explore')).not.toBeVisible();expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it('fits the requested menu at compact width and keeps controls on-screen in English',async()=>{
 const f=await fixture({width:600,height:700,dark:false});try{await f.page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en');await f.page.getByRole('button',{name:'Explore',exact:true}).click();await uiExpect(f.page.getByRole('dialog',{name:'Explore',exact:true})).toBeVisible();const rect=await f.page.locator('.odyssey-explore-content').boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(600);await f.page.getByRole('tab',{name:'Wallpapers',exact:true}).click();expect(await f.page.locator('dialog.odyssey-explore').evaluate((node:HTMLElement)=>node.scrollWidth)).toBe(600);await writeFile(evidence+'/avatar-geometry.json',JSON.stringify(await f.page.locator('.odyssey-explore-account .sherlock-account-avatar').evaluate((node:HTMLElement)=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,authenticated:node.dataset.authenticated,background:getComputedStyle(node).backgroundImage.slice(0,90),opacity:getComputedStyle(node).opacity})),null,2));await f.page.screenshot({path:evidence+'/compact-english.png'});expect(f.errors).toEqual([])}finally{await f.close()}
},15000)

it('changes only the hovered illustration and decodes all normal and hover assets in both appearances',async()=>{
 const f=await fixture();try{
  await open(f.page)
  for(const dark of [true,false]){
   await f.page.evaluate((dark:boolean)=>document.body.toggleAttribute('data-ds-dark-theme',dark),dark)
   const cards=f.page.locator('.odyssey-explore-create'),before=await cards.locator('img').evaluateAll((nodes:HTMLImageElement[])=>nodes.map(node=>node.src))
   for(let index=0;index<4;index++){
    await cards.nth(index).hover()
    const current=await cards.locator('img').evaluateAll((nodes:HTMLImageElement[])=>nodes.map(node=>({src:node.src,width:node.naturalWidth,height:node.naturalHeight})))
    expect(current[index].src).not.toBe(before[index]);expect(current[index].width).toBeGreaterThan(0);expect(current[index].height).toBeGreaterThan(0)
    expect(current.filter((_row:any,i:number)=>i!==index).map((row:any)=>row.src)).toEqual(before.filter((_row:any,i:number)=>i!==index))
    await f.page.mouse.move(10,10)
   }
  }
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('keeps only the latest rapid carousel selection and supports reduced-motion keyboard paging',async()=>{
 const f=await fixture();try{
  await open(f.page);const pages=f.page.locator('.odyssey-explore-pages button')
  await pages.nth(1).click();await pages.nth(4).click();await pages.nth(2).click()
  await uiExpect(pages.nth(2)).toHaveAttribute('aria-current','true')
  await pages.nth(2).press('End');await uiExpect(pages.nth(4)).toBeFocused();await uiExpect(pages.nth(4)).toHaveAttribute('aria-current','true')
  expect(await f.page.locator('[data-odyssey-operations-case-layer]').count()).toBe(1)
  await f.page.waitForTimeout(100);await uiExpect(pages.nth(4)).toHaveAttribute('aria-current','true');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('aborts one pending quick action on dismissal and never runs its late navigation',async()=>{
 const f=await fixture();try{
  await open(f.page);await f.page.evaluate(()=>(window as any).actionHold=true)
  await f.page.locator('[data-explore-card="board"]').click();await expect.poll(()=>f.page.evaluate(()=>!!(window as any).actionSignal)).toBe(true)
  // Handoff closes the floating menu, but its original operation remains live.
  expect(await f.page.evaluate(()=>(window as any).actionSignal.aborted)).toBe(false)
  await open(f.page);await f.page.getByRole('button',{name:'关闭探索',exact:true}).click();expect(await f.page.evaluate(()=>(window as any).actionSignal.aborted)).toBe(true)
  await f.page.evaluate(()=>(window as any).releaseAction());await f.page.waitForTimeout(30)
  await uiExpect(f.page.locator('[data-conversation-view-id="research"]').first()).toHaveAttribute('aria-selected','false');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('logs out through the original account owner and leaves the global Explore entry available',async()=>{
 const f=await fixture();try{
  await open(f.page);await f.page.getByRole('button',{name:'研究员，打开账户菜单',exact:true}).click();await f.page.getByRole('menuitem',{name:'退出登录',exact:true}).click()
  await uiExpect(f.page.locator('dialog.odyssey-explore')).not.toBeVisible();expect((await f.page.evaluate(()=>(window as any).calls)).filter((row:any)=>row.action==='logout')).toHaveLength(1)
  await open(f.page);await uiExpect(f.page.getByRole('button',{name:'登录，打开账户菜单',exact:true})).toBeVisible();expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('advances all five cases on the existing clock and pauses only while their card is being read',async()=>{
 const f=await fixture({reduced:false,clock:true});try{
  await open(f.page);await f.page.clock.pauseAt(new Date(await f.page.evaluate(()=>Date.now())+50))
  const pages=f.page.locator('.odyssey-explore-pages button');await f.page.mouse.move(10,10)
  await f.page.clock.fastForward(6400);await uiExpect(pages.nth(1)).toHaveAttribute('aria-current','true')
  const card=await f.page.locator('.odyssey-explore-example').boundingBox();await f.page.mouse.move(card.x+30,card.y+30);await f.page.clock.fastForward(7000);await uiExpect(pages.nth(1)).toHaveAttribute('aria-current','true')
  await f.page.mouse.move(10,10);await f.page.clock.fastForward(6400);await uiExpect(pages.nth(2)).toHaveAttribute('aria-current','true')
  await f.page.getByRole('tab',{name:'主题壁纸',exact:true}).evaluate((node:HTMLButtonElement)=>node.click());await f.page.clock.fastForward(7000);await uiExpect(pages.nth(2)).toHaveAttribute('aria-current','true')
  await f.page.getByRole('tab',{name:'快速开始',exact:true}).evaluate((node:HTMLButtonElement)=>node.click());await f.page.clock.fastForward(6400);await uiExpect(pages.nth(3)).toHaveAttribute('aria-current','true');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('collapses a nonempty search with one Escape and keeps a sidebar orb inside the native collapsed footer',async()=>{
 const f=await fixture({collapsed:true,width:1100,height:760});try{
  const shape=await f.page.locator('[data-explore-trigger]').evaluate((node:HTMLElement)=>{const rect=node.getBoundingClientRect(),orb=node.querySelector('.odyssey-explore-orb')!.getBoundingClientRect();return{width:rect.width,height:rect.height,orbWidth:orb.width,inside:orb.left>=rect.left&&orb.right<=rect.right}})
  expect(shape).toEqual({width:56,height:56,orbWidth:40,inside:true})
  await open(f.page);await f.page.getByRole('button',{name:'搜索会话',exact:true}).click();const input=f.page.getByRole('searchbox',{name:'搜索会话',exact:true});await input.fill('中际');await input.press('Escape');await uiExpect(input).not.toBeVisible();await uiExpect(f.page.locator('dialog.odyssey-explore')).toBeVisible();expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it.each(['Escape','button','background'])('cancels a pending native result when search is collapsed by %s',async method=>{
 const f=await fixture();try{
  await open(f.page);await f.page.getByRole('button',{name:'搜索会话',exact:true}).click();await f.page.evaluate(()=>(window as any).holdOpen=true);await f.page.getByRole('option').first().click()
  if(method==='Escape')await f.page.keyboard.press('Escape');else if(method==='button')await f.page.getByRole('button',{name:'收起搜索',exact:true}).click();else await f.page.locator('dialog.odyssey-explore').click({position:{x:8,y:400}})
  await uiExpect(f.page.getByRole('searchbox',{name:'搜索会话',exact:true})).not.toBeVisible();expect(await f.page.evaluate(()=>(window as any).cancelled)).toBe(1)
  await f.page.evaluate(()=>(window as any).releaseOpen());await f.page.waitForTimeout(30);expect(await f.page.evaluate(()=>(window as any).opened)).toEqual([]);await uiExpect(f.page.locator('dialog.odyssey-explore')).toBeVisible();expect(await f.page.locator('.odyssey-explore-result-list').getAttribute('aria-busy')).toBeNull();expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('closes the global search and cancels its old native navigation when account ownership changes',async()=>{
 const f=await fixture();try{
  await open(f.page);await f.page.getByRole('button',{name:'搜索会话',exact:true}).click();await f.page.evaluate(()=>(window as any).holdOpen=true);await f.page.getByRole('option').first().click();await f.page.evaluate(()=>(window as any).fixture.generation())
  await uiExpect(f.page.locator('dialog.odyssey-explore')).not.toBeVisible();await f.page.evaluate(()=>(window as any).releaseOpen());await f.page.waitForTimeout(30);expect(await f.page.evaluate(()=>(window as any).opened)).toEqual([]);expect(await f.page.evaluate(()=>(window as any).cancelled)).toBe(1);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('crossfades the real tab panels and settles only the latest rapid reverse selection',async()=>{
 const f=await fixture({reduced:false});try{
  await open(f.page)
  await f.page.getByRole('tab',{name:'主题壁纸',exact:true}).click()
  const midway=await f.page.locator('.odyssey-explore-viewport').evaluate((node:HTMLElement)=>[...node.querySelectorAll<HTMLElement>('[role=tabpanel]')].map(panel=>({id:panel.id,hidden:panel.hidden,inert:panel.inert,opacity:Number(getComputedStyle(panel).opacity),animations:panel.getAnimations().filter(a=>a.playState==='running').length})))
  expect(midway.every((panel:any)=>!panel.hidden)).toBe(true);expect(midway.reduce((n:number,p:any)=>n+p.animations,0)).toBe(2)
  expect(midway.find((panel:any)=>panel.id.endsWith('wallpapers')).inert).toBe(false)
  expect(midway.find((panel:any)=>panel.id.endsWith('quick')).inert).toBe(true)
  await writeFile(evidence+'/tab-mid-transition.json',JSON.stringify(midway,null,2))
  await f.page.getByRole('tab',{name:'快速开始',exact:true}).click();await f.page.getByRole('tab',{name:'主题壁纸',exact:true}).click();await f.page.getByRole('tab',{name:'快速开始',exact:true}).click()
  await expect.poll(()=>f.page.locator('.odyssey-explore-wallpapers').evaluate((node:HTMLElement)=>node.hidden)).toBe(true)
  expect(await f.page.locator('.odyssey-explore-quick').evaluate((node:HTMLElement)=>({hidden:node.hidden,inert:node.inert,opacity:getComputedStyle(node).opacity,transform:getComputedStyle(node).transform}))).toEqual({hidden:false,inert:false,opacity:'1',transform:'none'})
  await f.page.getByRole('tab',{name:'主题壁纸',exact:true}).click();await f.page.getByRole('button',{name:'关闭探索',exact:true}).click();await uiExpect(f.page.locator('dialog.odyssey-explore')).not.toBeVisible()
  await open(f.page);await uiExpect(f.page.getByRole('tab',{name:'主题壁纸',exact:true})).toHaveAttribute('aria-selected','true');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('expands search across the full content header with the result edges aligned and hides covered settings',async()=>{
 const f=await fixture({reduced:false});try{
  await open(f.page);await f.page.getByRole('button',{name:'搜索会话',exact:true}).click()
  await expect.poll(()=>f.page.locator('.odyssey-explore-search-control').evaluate((node:HTMLElement)=>Math.round(node.getBoundingClientRect().width))).toBe(928)
  const geometry=await f.page.locator('.odyssey-explore-content').evaluate((node:HTMLElement)=>{const box=(s:string)=>{const r=node.querySelector(s)!.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width,height:r.height}};return{content:node.getBoundingClientRect().width,search:box('.odyssey-explore-search-control'),results:box('.odyssey-explore-results'),settings:getComputedStyle(node.querySelector('.odyssey-explore-tools>.odyssey-explore-tool')!).display}})
  expect(geometry.search.width).toBe(geometry.content);expect(geometry.search.height).toBe(40);expect(geometry.search.left).toBeCloseTo(geometry.results.left,0);expect(geometry.search.right).toBeCloseTo(geometry.results.right,0);expect(geometry.settings).toBe('none')
  await writeFile(evidence+'/search-full-width.json',JSON.stringify(geometry,null,2));await f.page.screenshot({path:evidence+'/search-full-width.png'})
  await f.page.getByRole('button',{name:'收起搜索',exact:true}).click();await expect.poll(()=>f.page.locator('.odyssey-explore-search-control').evaluate((node:HTMLElement)=>Math.round(node.getBoundingClientRect().width))).toBe(40);await uiExpect(f.page.getByRole('button',{name:'设置',exact:true})).toBeVisible();expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it.each([540,760])('keeps full-width search and reduced-motion tab changes inside a %spx viewport',async width=>{
 const f=await fixture({width,height:740,dark:false,reduced:true});try{
  await open(f.page);await f.page.getByRole('tab',{name:'主题壁纸',exact:true}).click();expect(await f.page.locator('.odyssey-explore-wallpapers').evaluate((node:HTMLElement)=>node.getAnimations().length)).toBe(0)
  await f.page.getByRole('button',{name:'搜索会话',exact:true}).click();const shape=await f.page.locator('.odyssey-explore-search-control').evaluate((node:HTMLElement)=>{const r=node.getBoundingClientRect(),results=node.closest('.odyssey-explore-content')!.querySelector('.odyssey-explore-results')!.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width,resultWidth:results.width,scroll:document.querySelector('dialog')!.scrollWidth}})
  expect(shape.left).toBeGreaterThanOrEqual(20);expect(shape.right).toBeLessThanOrEqual(width-20);expect(shape.width).toBeCloseTo(shape.resultWidth,0);expect(shape.scroll).toBe(width)
  await f.page.keyboard.press('Escape');await uiExpect(f.page.getByRole('button',{name:'设置',exact:true})).toBeVisible();expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it.each([false,true])('gives footer controls safe hover padding, a square notification target and a non-intercepting progressive blur (collapsed=%s)',async collapsed=>{
 const f=await fixture({collapsed,width:1100,height:760});try{
  const trigger=f.page.locator('[data-explore-trigger]'),bell=f.page.getByRole('button',{name:'消息中心',exact:true});await trigger.hover()
  const shape=await trigger.evaluate((node:HTMLElement)=>{const r=node.getBoundingClientRect(),orb=node.querySelector('.odyssey-explore-orb')!.getBoundingClientRect(),style=getComputedStyle(node),fog=getComputedStyle(node.parentElement!,'::before');return{width:r.width,height:r.height,padding:style.padding,orb:[orb.left-r.left,orb.top-r.top,r.right-orb.right,r.bottom-orb.bottom],background:style.backgroundColor,fog:{height:fog.height,mask:fog.maskImage,backdrop:fog.backdropFilter,pointerEvents:fog.pointerEvents}}})
  expect(shape.height).toBe(56);expect(shape.padding).toBe('8px');expect(shape.orb.every((value:number)=>value>=8)).toBe(true);expect(shape.background).not.toBe('rgba(0, 0, 0, 0)');expect(shape.fog.height).toBe('64px');expect(shape.fog.mask).toContain('linear-gradient');expect(shape.fog.backdrop).toBe('blur(12px)');expect(shape.fog.pointerEvents).toBe('none')
  await bell.hover();const target=await bell.evaluate((node:HTMLElement)=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return{width:r.width,height:r.height,padding:s.padding,borderRadius:s.borderRadius,background:s.backgroundColor}});expect(target.width).toBe(40);expect(target.height).toBe(40);expect(target.padding).toBe('10px');expect(target.background).not.toBe('rgba(0, 0, 0, 0)')
  await writeFile(evidence+'/footer-'+collapsed+'.json',JSON.stringify({explore:shape,bell:target},null,2));await f.page.screenshot({path:evidence+'/footer-'+collapsed+'.png'})
  await f.page.evaluate(()=>{const footer=document.querySelector('#footer')!,r=footer.getBoundingClientRect(),button=document.createElement('button');button.id='under-footer-fog';button.textContent='底部列表项';button.style.cssText='position:fixed;left:16px;top:'+(r.top-42)+'px;width:150px;height:32px';button.onclick=()=>document.body.dataset.underFogClicked='true';document.querySelector('#sidebar')!.insertBefore(button,footer)})
  await f.page.locator('#under-footer-fog').click();expect(await f.page.locator('body').getAttribute('data-under-fog-clicked')).toBe('true');await bell.click();await uiExpect(f.page.getByRole('dialog',{name:'消息中心',exact:true})).toBeVisible();expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('keeps Explore open for the demo close-pointer step and cancels a user dismissal before that owned click',async()=>{
 const f=await fixture();try{
  await open(f.page);await f.page.evaluate(()=>(window as any).exampleHold=true);await f.page.locator('.odyssey-explore-example').click();await expect.poll(()=>f.page.evaluate(()=>!!(window as any).exampleContext)).toBe(true)
  expect(await f.page.evaluate(()=>(window as any).exampleWasOpen)).toBe(true);await uiExpect(f.page.locator('dialog.odyssey-explore')).toBeVisible();expect(await f.page.evaluate(()=>(window as any).exampleContext.demoEntry.closeTarget.matches('[data-explore-close]'))).toBe(true)
  await f.page.getByRole('button',{name:'关闭探索',exact:true}).click();expect(await f.page.evaluate(()=>(window as any).exampleContext.signal.aborted)).toBe(true);await f.page.evaluate(()=>(window as any).releaseExample());await f.page.waitForTimeout(50);expect((await f.page.evaluate(()=>(window as any).calls)).filter((row:any)=>row.example)).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it.each([540,1600])('keeps appearance, settings and search in the requested single row at %spx',async width=>{
 const f=await fixture({width,height:820});try{await open(f.page);const tools=f.page.locator('.odyssey-explore-tools');const read=()=>tools.evaluate((node:HTMLElement)=>[...node.children].map((child:Element)=>{const r=child.getBoundingClientRect();return{label:child.getAttribute('aria-label')??child.querySelector('button')?.getAttribute('aria-label'),x:r.x,y:r.y,width:r.width,height:r.height}}));const rows=await read();expect(rows.map((row:any)=>row.label)).toEqual(['切换为浅色','设置','搜索会话']);expect(rows.map((row:any)=>row.height)).toEqual([40,40,40]);expect(rows.map((row:any)=>row.y)).toEqual([rows[0].y,rows[0].y,rows[0].y]);expect(rows[1].x-rows[0].x).toBe(52);expect(rows[2].x-rows[1].x).toBe(52);expect(rows[2].x+40).toBeLessThanOrEqual(width);await f.page.getByRole('button',{name:'搜索会话',exact:true}).click();await uiExpect(f.page.getByRole('button',{name:'设置',exact:true})).not.toBeVisible();await uiExpect(f.page.getByRole('button',{name:'切换为浅色',exact:true})).not.toBeVisible();expect(await f.page.locator('.odyssey-explore-brand').isVisible()).toBe(false);await f.page.getByRole('button',{name:'收起搜索',exact:true}).click();expect((await read()).map((row:any)=>row.label)).toEqual(['切换为浅色','设置','搜索会话']);expect(f.errors).toEqual([])}finally{await f.close()}
},12000)
