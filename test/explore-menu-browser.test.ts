import {expect,it} from 'vitest'
import {readFile,writeFile} from 'node:fs/promises'
import {createExploreBrowserFixture} from './helpers/explore-menu-browser-fixture'
import {scheduledStyles} from '../src/preload/scheduled/style'
const {evidence,fixture,open,clickExploreControl,uiExpect}=createExploreBrowserFixture()
it.each([[1600,1000,true],[1380,900,false],[850,600,true],[851,600,false],[540,600,true],[1000,640,false]])('limits Explore window dragging to its top chrome and keeps actual controls reachable at %sx%s dark=%s',async(width,height,dark)=>{
 const f=await fixture({width:width as number,height:height as number,dark:dark as boolean});try{
  await open(f.page)
  const geometry=await f.page.locator('dialog.odyssey-explore').evaluate((dialog:HTMLElement)=>{
   const drag=dialog.querySelector<HTMLElement>('[data-explore-window-drag]')!,system=dialog.querySelector<HTMLElement>('.odyssey-explore-system')!,content=dialog.querySelector<HTMLElement>('.odyssey-explore-content')!,account=system.querySelector<HTMLButtonElement>('.odyssey-explore-account')!,close=system.querySelector<HTMLButtonElement>('[data-explore-close]')!,search=content.querySelector<HTMLButtonElement>('.odyssey-explore-search-control>button')!
   const rect=(node:HTMLElement)=>{const r=node.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}}
   const control=(node:HTMLElement)=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{...rect(node),reachable:node.contains(hit),hit:hit?.className,region:getComputedStyle(node).getPropertyValue('-webkit-app-region')}}
   const bounds=drag.getBoundingClientRect(),points=[{x:12,y:Math.min(system.getBoundingClientRect().top+24,bounds.bottom-8)},{x:innerWidth-12,y:Math.min(20,system.getBoundingClientRect().top/2)}]
   return{drag:{...rect(drag),region:getComputedStyle(drag).getPropertyValue('-webkit-app-region'),hidden:drag.getAttribute('aria-hidden'),focusable:drag.tabIndex},dialogRegion:getComputedStyle(dialog).getPropertyValue('-webkit-app-region'),systemRegion:getComputedStyle(system).getPropertyValue('-webkit-app-region'),contentRegion:getComputedStyle(content).getPropertyValue('-webkit-app-region'),points:points.map(point=>({...point,hit:document.elementFromPoint(point.x,point.y)===drag})),account:control(account),close:control(close),search:control(search)}
  })
  await writeFile(evidence+'/window-drag-geometry-'+width+'-'+height+'.json',JSON.stringify(geometry,null,2))
  await f.page.screenshot({path:evidence+'/window-drag-layout-'+width+'-'+height+'.png'})
  if(![geometry.account,geometry.close,geometry.search].every(control=>control.reachable))await f.page.screenshot({path:evidence+'/window-drag-controls-'+width+'-'+height+'.png'})
  expect(geometry.drag).toMatchObject({left:0,top:0,width,region:'drag',hidden:'true',focusable:-1});expect(geometry.drag.height).toBe((width as number)<=850?76:88)
  expect(geometry.dialogRegion).toBe('no-drag');expect(geometry.contentRegion).toBe('no-drag');expect(geometry.systemRegion).toBe('no-drag');expect(geometry.points.every((point:any)=>point.hit)).toBe(true)
  for(const control of[geometry.account,geometry.close,geometry.search]){expect(control.reachable).toBe(true);expect(control.region).toBe('no-drag');expect(control.left).toBeGreaterThanOrEqual(0);expect(control.right).toBeLessThanOrEqual(width)}
  await f.page.mouse.click(geometry.points[0].x,geometry.points[0].y);await uiExpect(f.page.locator('dialog.odyssey-explore')).toBeVisible()
  await clickExploreControl(f.page,'.odyssey-explore-account');await uiExpect(f.page.getByRole('menu')).toBeVisible();await f.page.keyboard.press('Escape');await uiExpect(f.page.getByRole('menu')).not.toBeVisible()
  await clickExploreControl(f.page,'[data-explore-close]');await uiExpect(f.page.locator('dialog.odyssey-explore')).not.toBeVisible()
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('keeps Explore and its search open after a top-origin drag releases over the backdrop, while genuine outside clicks still dismiss in order',async()=>{
 const f=await fixture();try{
  await open(f.page);const dialog=f.page.locator('dialog.odyssey-explore');await f.page.getByRole('button',{name:'搜索会话',exact:true}).click();const input=f.page.getByRole('searchbox',{name:'搜索会话',exact:true});await input.fill('中际')
  await f.page.mouse.move(16,24);await f.page.mouse.down();await f.page.mouse.move(8,400,{steps:8});await f.page.mouse.up()
  await uiExpect(dialog).toBeVisible();await uiExpect(input).toBeVisible();expect(await input.inputValue()).toBe('中际');expect(await f.page.getByRole('option').count()).toBe(3)
  await f.page.mouse.click(8,400);await uiExpect(input).not.toBeVisible();await uiExpect(dialog).toBeVisible()
  await clickExploreControl(f.page,'.odyssey-explore-account');await uiExpect(f.page.getByRole('menu')).toBeVisible();await f.page.mouse.click(8,400);await uiExpect(f.page.getByRole('menu')).not.toBeVisible();await uiExpect(dialog).toBeVisible()
  await f.page.mouse.click(8,400);await uiExpect(dialog).not.toBeVisible();expect(await f.page.getByRole('textbox',{name:'保留的原输入框'}).inputValue()).toBe('原草稿必须保留');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it.each(['快速开始', '管理用量'])('dismisses Explore from visible backdrop gaps in %s', async tab => {
 const now = Math.floor(Date.now()/1000)
 const quota = {fiveHour:{limit:100,used:10,remaining:90,resetAt:now+3600},week:{limit:100,used:20,remaining:80,resetAt:now+36000},paused:false}
 const f = await fixture({width:1380,height:900,quotaFixture:quota})
 try {
  const dialog = f.page.getByRole('dialog',{name:'探索',exact:true})
  const openTab = async () => {
   await open(f.page)
   await f.page.getByRole('tab',{name:tab,exact:true}).click()
   if (tab === '管理用量') await uiExpect(dialog.locator('.odyssey-explore-quota-card')).toBeVisible()
  }
  await openTab()
  const points = await dialog.evaluate((node:HTMLElement) => {
   const box = (selector:string) => node.querySelector(selector)!.getBoundingClientRect()
   const header = box('.odyssey-explore-header'), nav = box('.odyssey-explore-navigation')
   const viewport = box('.odyssey-explore-viewport')
   const points = [
    {area:'header gap',x:header.left+header.width/2,y:header.top+header.height/2},
    {area:'tab row gap',x:nav.right-10,y:nav.top+nav.height/2},
    {area:'right side',x:viewport.right+16,y:viewport.top+viewport.height/2},
    {area:'bottom',x:viewport.left+viewport.width/2,y:viewport.bottom+24},
   ]
   if (node.querySelector('.odyssey-explore-quota-card')) {
    const card = box('.odyssey-explore-quota-card')
    points.push(
     {area:'above usage card',x:card.left+card.width/2,y:(viewport.top+card.top)/2},
     {area:'beside usage card',x:(viewport.left+card.left)/2,y:card.top+card.height/2},
     {area:'below usage card',x:card.left+card.width/2,y:(card.bottom+viewport.bottom)/2},
    )
   } else {
    const showcase = box('.odyssey-explore-showcase'), card = box('[data-explore-card="board"]')
    points.push({area:'between quick-start cards',x:(showcase.right+card.left)/2,y:card.top+card.height/2})
   }
   return points
  })
  if (tab === '管理用量') {
   const plan = await dialog.locator('.odyssey-explore-quota-plan strong').boundingBox()
   expect(plan).not.toBeNull()
   await f.page.mouse.click(plan.x+plan.width/2,plan.y+plan.height/2)
   await uiExpect(dialog).toBeVisible()
   await f.page.mouse.move(plan.x+plan.width/2,plan.y+plan.height/2)
   await f.page.mouse.down()
   await f.page.mouse.move(points[0].x,points[0].y,{steps:6})
   await f.page.mouse.up()
   await uiExpect(dialog).toBeVisible()
  }
  for (const [index, {area,x,y}] of points.entries()) {
   if (index > 0) await openTab()
   await f.page.mouse.click(x,y)
   await uiExpect(dialog, area).not.toBeVisible({timeout:900})
  }
  expect(await f.page.getByRole('textbox',{name:'保留的原输入框'}).inputValue()).toBe('原草稿必须保留')
  expect(f.errors).toEqual([])
 } finally { await f.close() }
}, 20000)
it.each(['pointercancel','blur','remount'])('releases the Explore drag-origin guard after %s without blocking subsequent clicks',async boundary=>{
 const f=await fixture();try{
  await open(f.page);await f.page.mouse.move(16,24);await f.page.mouse.down()
  if(boundary==='remount'){await f.page.evaluate(()=>(window as any).fixture.restart());await f.page.mouse.up();await open(f.page)}
  else{await f.page.evaluate((boundary:string)=>window.dispatchEvent(boundary==='blur'?new Event('blur'):new PointerEvent('pointercancel',{bubbles:true})),boundary);await f.page.mouse.up()}
  await clickExploreControl(f.page,'.odyssey-explore-account');await uiExpect(f.page.getByRole('menu')).toBeVisible();await f.page.mouse.click(8,400);await uiExpect(f.page.getByRole('menu')).not.toBeVisible();await uiExpect(f.page.locator('dialog.odyssey-explore')).toBeVisible();await f.page.mouse.click(8,400);await uiExpect(f.page.locator('dialog.odyssey-explore')).not.toBeVisible();expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
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
  const geometry=await f.page.locator('.odyssey-explore-content').evaluate((node:HTMLElement)=>{const r=node.getBoundingClientRect();return{x:r.x,width:r.width,height:r.height,center:r.x+r.width/2,centerY:r.y+r.height/2,stage:node.querySelector('.odyssey-explore-viewport')!.getBoundingClientRect().height,backdrop:getComputedStyle(node.closest('dialog')!,'::backdrop').backdropFilter}})
  expect(geometry.width).toBeCloseTo(864,0);expect(geometry.center).toBeCloseTo(800,0);expect(geometry.stage).toBe(376);expect(geometry.centerY).toBeCloseTo(484,0);expect(geometry.backdrop).toBe('blur(18px)')
  await f.page.screenshot({path:evidence+'/dark-quick.png'});await f.page.getByRole('button',{name:'关闭探索',exact:true}).click();await uiExpect(f.page.getByRole('dialog',{name:'探索',exact:true})).not.toBeVisible();expect(await input.inputValue()).toBe('原草稿必须保留');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('keeps the Explore orb moving in the collapsed rail and respects reduced motion',async()=>{
 const f=await fixture({collapsed:true,reduced:false,width:1100,height:760})
 try{
  const layers=f.page.locator('[data-explore-trigger] .odyssey-explore-orb img')
  const motion=()=>layers.evaluateAll((nodes:Element[])=>nodes.map(node=>getComputedStyle(node).animationName))
  expect(await motion()).toEqual(Array(3).fill('odyssey-explore-flow'))
  await f.page.emulateMedia({reducedMotion:'reduce'})
  expect(await motion()).toEqual(Array(3).fill('none'))
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
it.each([true,false])('dismisses only the account popover on the first Explore background click in dark=%s',async dark=>{
 const f=await fixture({dark});try{
  await open(f.page);const dialog=f.page.locator('dialog.odyssey-explore'),anchor=f.page.locator('.odyssey-explore-account')
  await f.page.evaluate(()=>{(window as any).underlyingNavigations=0;for(const side of ['left','right']){const node=document.createElement('button');node.textContent='底层导航';node.style.cssText='position:fixed;top:360px;'+side+':0;width:160px;height:80px';node.onclick=()=>{(window as any).underlyingNavigations++};document.body.append(node)}})
  for(const side of ['left','right']){
   await anchor.click();await uiExpect(f.page.getByRole('menu')).toBeVisible()
   const box=await dialog.boundingBox(),point={x:side==='left'?8:box.width-8,y:400}
   const target=await f.page.evaluate(({x,y}:any)=>{const node=document.elementFromPoint(x,y);return{tag:node?.tagName,className:node?.className}},point)
   await f.page.mouse.click(box.x+point.x,box.y+point.y)
   await writeFile(evidence+'/account-dismiss-background-'+dark+'-'+side+'.json',JSON.stringify({target,exploreOpen:await dialog.evaluate((node:HTMLDialogElement)=>node.open),accountMenus:await f.page.getByRole('menu').count(),anchorExpanded:await anchor.getAttribute('aria-expanded'),underlyingNavigations:await f.page.evaluate(()=>(window as any).underlyingNavigations)},null,2))
   await f.page.screenshot({path:evidence+'/account-dismiss-background-'+dark+'-'+side+'.png'})
   await uiExpect(f.page.getByRole('menu')).not.toBeVisible();expect(await dialog.isVisible()).toBe(true);await uiExpect(anchor).toHaveAttribute('aria-expanded','false');expect(await f.page.evaluate(()=>(window as any).underlyingNavigations)).toBe(0)
  }
  await f.page.mouse.click(8,400);await uiExpect(dialog).not.toBeVisible();expect(await f.page.evaluate(()=>(window as any).underlyingNavigations)).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it.each(['content','wallpapers','appearance','search','settings','close'])('dismisses the account popover while preserving the normal %s action',async control=>{
 const f=await fixture();try{
  await open(f.page);const dialog=f.page.locator('dialog.odyssey-explore');await f.page.locator('.odyssey-explore-account').click()
  const selectors:Record<string,string>={content:'.odyssey-explore-brand',wallpapers:'#odyssey-explore-wallpapers-tab',appearance:'[data-explore-appearance]',search:'.odyssey-explore-tool[aria-label="搜索会话"]',settings:'.odyssey-explore-tool[aria-label="设置"]',close:'[data-explore-close]'}
  await clickExploreControl(f.page,selectors[control]!)
  await uiExpect(f.page.getByRole('menu')).not.toBeVisible()
  if(control==='close'||control==='settings')await uiExpect(dialog).not.toBeVisible();else await uiExpect(dialog).toBeVisible()
  if(control==='wallpapers')await uiExpect(f.page.getByRole('tab',{name:'主题壁纸',exact:true})).toHaveAttribute('aria-selected','true')
  if(control==='appearance')await uiExpect(f.page.getByRole('button',{name:'切换为深色',exact:true})).toBeVisible()
  if(control==='search')await uiExpect(f.page.getByRole('searchbox',{name:'搜索会话',exact:true})).toBeFocused()
  if(control==='settings')await uiExpect(f.page.locator('.VOzbGW_panel')).toBeVisible()
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},10000)
it('keeps account dismissal owned by the current click across Escape, pointer cancellation and Explore remount',async()=>{
 const f=await fixture();try{
  await open(f.page);const dialog=f.page.locator('dialog.odyssey-explore'),anchor=f.page.locator('.odyssey-explore-account')
  await anchor.click();await f.page.keyboard.press('Escape');await uiExpect(f.page.getByRole('menu')).not.toBeVisible();await uiExpect(dialog).toBeVisible();await uiExpect(anchor).toBeFocused()
  await dialog.click({position:{x:8,y:400}});await uiExpect(dialog).not.toBeVisible();await open(f.page);await anchor.click()
  await dialog.dispatchEvent('pointerdown',{bubbles:true,pointerId:7});await dialog.dispatchEvent('pointercancel',{bubbles:true,pointerId:7})
  await clickExploreControl(f.page,'[data-explore-close]');await uiExpect(dialog).not.toBeVisible();await f.page.evaluate(()=>(window as any).fixture.restart())
  await open(f.page);await f.page.locator('dialog.odyssey-explore').click({position:{x:8,y:400}});await uiExpect(f.page.locator('dialog.odyssey-explore')).not.toBeVisible();expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it.each([true,false])('matches the R7 glass account menu and copies the actual pure public ID in dark=%s',async dark=>{
 const f=await fixture({dark});try{
  await open(f.page);const anchor=f.page.getByRole('button',{name:'研究员，打开账户菜单',exact:true});await anchor.click();const menu=f.page.getByRole('menu');await uiExpect(menu.getByRole('menuitem',{name:'复制用户 ID',exact:true})).toBeEnabled();await uiExpect(menu).toContainText('用户 ID：1234567890');expect(await menu.getByRole('menuitem').count()).toBe(2);expect(await menu.locator('.sherlock-account-avatar,.sherlock-account-menu-profile').count()).toBe(0);expect(await menu.getByText('设置',{exact:true}).count()).toBe(0)
  const geometry=await menu.evaluate((node:HTMLElement)=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node),rows=[...node.querySelectorAll('button')].map(row=>({width:row.getBoundingClientRect().width,height:row.getBoundingClientRect().height}));return{width:r.width,height:r.height,background:s.backgroundColor,blur:s.backdropFilter,radius:s.borderRadius,border:s.borderColor,rows}});expect(geometry.width).toBe(224);expect(geometry.height).toBe(88);expect(geometry.blur).toBe('blur(18px)');expect(geometry.background).toBe(dark?'rgba(43, 43, 43, 0.68)':'rgba(255, 255, 255, 0.78)');expect(geometry.radius).toBe('16px');expect(geometry.rows).toEqual([{width:24,height:24},{width:208,height:32}]);await writeFile(evidence+'/account-'+dark+'.json',JSON.stringify(geometry,null,2));await menu.screenshot({path:evidence+'/account-'+dark+'.png'})
  await menu.getByRole('menuitem',{name:'复制用户 ID',exact:true}).click();await uiExpect(menu).toContainText('已复制');expect(await f.page.evaluate(()=>(window as any).copied)).toEqual(['1234567890']);await uiExpect(menu.locator('[data-copied]')).toHaveCount(1);await uiExpect(menu).toContainText('用户 ID：1234567890');const hint=await menu.locator('.odyssey-explore-account-copy-feedback').boundingBox();expect(hint.width).toBe(68);expect(hint.height).toBe(28);expect(await menu.locator('svg').evaluateAll((nodes:SVGSVGElement[])=>nodes.map(node=>[node.getAttribute('width'),node.getAttribute('height')]))).toEqual([['16','16'],['16','16'],['16','16']]);await f.page.screenshot({path:evidence+'/account-copied-'+dark+'.png'});await uiExpect(menu).toContainText('用户 ID：1234567890',{timeout:2500});await f.page.getByRole('tab',{name:'主题壁纸',exact:true}).click();await uiExpect(menu).not.toBeVisible();await uiExpect(f.page.getByRole('dialog',{name:'探索',exact:true})).toBeVisible();await anchor.click();await f.page.keyboard.press('Escape');await uiExpect(f.page.getByRole('menu')).not.toBeVisible();await uiExpect(anchor).toBeFocused();expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('keeps the public ID after clipboard failure without adding a feedback row',async()=>{
 const f=await fixture();try{await open(f.page);await f.page.getByRole('button',{name:'研究员，打开账户菜单',exact:true}).click();const menu=f.page.getByRole('menu');await uiExpect(menu.getByRole('menuitem',{name:'复制用户 ID',exact:true})).toBeEnabled();await f.page.evaluate(()=>(window as any).copyFailure=true);await menu.getByRole('menuitem',{name:'复制用户 ID',exact:true}).click();await uiExpect(menu).toContainText('用户 ID：1234567890');await uiExpect(menu.getByRole('menuitem',{name:'复制用户 ID',exact:true})).toHaveAttribute('title','复制失败，请重试');await uiExpect(menu).toContainText('复制失败，请重试');expect((await menu.boundingBox()).height).toBe(88);await uiExpect(menu).toContainText('用户 ID：1234567890',{timeout:2500});await f.page.getByRole('button',{name:'关闭探索',exact:true}).click();await uiExpect(menu).not.toBeVisible();expect(await f.page.evaluate(()=>(window as any).calls.filter((row:any)=>row.action==='logout'))).toEqual([]);expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it('hands quick actions and all six example selections to the existing action adapters after dismissing the menu',async()=>{
 const f=await fixture();try{for(const card of ['board','note','ppt','report']){await open(f.page);await f.page.locator('[data-explore-card="'+card+'"]').click();await uiExpect(f.page.locator('dialog.odyssey-explore')).not.toBeVisible();if(card==='board'||card==='note')await uiExpect(f.page.locator('[data-conversation-view-id="'+(card==='board'?'research':'notes')+'"]').first()).toHaveAttribute('aria-selected','true')}
  expect((await f.page.evaluate(()=>(window as any).calls)).filter((row:any)=>row.skill).map((row:any)=>row.skill)).toEqual(['builtin:efund-ppt-maker','builtin:ework-equity-research'])
  for(let index=0;index<6;index++){await open(f.page);await f.page.locator('.odyssey-explore-pages button').nth(index).click();await f.page.locator('.odyssey-explore-example').click();await expect.poll(()=>f.page.evaluate(()=>(window as any).calls.filter((row:any)=>row.example).length)).toBe(index+1)}
  expect((await f.page.evaluate(()=>(window as any).calls)).filter((row:any)=>row.example).map((row:any)=>row.example)).toEqual(['board','note','ppt','report','workbench','spreadsheet']);expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)
it('cancels pending search opening when the menu closes and ignores late replies or a changed account owner',async()=>{
 const f=await fixture();try{await open(f.page);await f.page.getByRole('button',{name:'搜索会话',exact:true}).click();await f.page.evaluate(()=>{(window as any).holdOpen=true});await f.page.getByRole('option').first().click();await f.page.getByRole('button',{name:'关闭探索',exact:true}).click();expect(await f.page.evaluate(()=>(window as any).cancelled)).toBe(1);await f.page.evaluate(()=>(window as any).releaseOpen());await uiExpect(f.page.locator('dialog.odyssey-explore')).not.toBeVisible();expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it('fits the requested menu at compact width and keeps controls on-screen in English',async()=>{
 const f=await fixture({width:600,height:700,dark:false});try{await f.page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en');await f.page.getByRole('button',{name:'Explore',exact:true}).click();await uiExpect(f.page.getByRole('dialog',{name:'Explore',exact:true})).toBeVisible();const rect=await f.page.locator('.odyssey-explore-content').boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(600);await f.page.getByRole('tab',{name:'Wallpapers',exact:true}).click();expect(await f.page.locator('dialog.odyssey-explore').evaluate((node:HTMLElement)=>node.scrollWidth)).toBe(600);await writeFile(evidence+'/avatar-geometry.json',JSON.stringify(await f.page.locator('.odyssey-explore-account .sherlock-account-avatar').evaluate((node:HTMLElement)=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,authenticated:node.dataset.authenticated,background:getComputedStyle(node).backgroundImage.slice(0,90),opacity:getComputedStyle(node).opacity})),null,2));await f.page.screenshot({path:evidence+'/compact-english.png'});expect(f.errors).toEqual([])}finally{await f.close()}
},15000)

it('reuses the original layered illustrations and crossfades only the hovered card in both appearances',async()=>{
 const f=await fixture();try{await open(f.page);for(const dark of [true,false]){await f.page.evaluate((dark:boolean)=>document.body.toggleAttribute('data-ds-dark-theme',dark),dark);const cards=f.page.locator('.odyssey-explore-create');for(let index=0;index<4;index++){await cards.nth(index).hover();const values=await cards.evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({images:[...node.querySelectorAll<HTMLImageElement>('img')].map(img=>({src:img.src,width:img.naturalWidth,height:img.naturalHeight})),normal:getComputedStyle(node.querySelector('.normal')!).opacity,colored:getComputedStyle(node.querySelector('.colored')!).opacity})));expect(values.every((row:any)=>row.images.length===8&&row.images.every((img:any)=>img.width>0&&img.height>0))).toBe(true);expect(values[index].normal).toBe('0');expect(values[index].colored).toBe('1');expect(values.filter((_row:any,i:number)=>i!==index).every((row:any)=>row.normal==='1'&&row.colored==='0')).toBe(true);await f.page.mouse.move(10,10)}}expect(f.errors).toEqual([])}finally{await f.close()}
},15000)

it('keeps only the latest rapid carousel selection and supports reduced-motion keyboard paging',async()=>{
 const f=await fixture();try{
  await open(f.page);const pages=f.page.locator('.odyssey-explore-pages button')
  await pages.nth(1).click();await pages.nth(4).click();await pages.nth(2).click()
  await uiExpect(pages.nth(2)).toHaveAttribute('aria-current','true')
  await pages.nth(2).press('End');await uiExpect(pages.nth(5)).toBeFocused();await uiExpect(pages.nth(5)).toHaveAttribute('aria-current','true')
  expect(await f.page.locator('[data-odyssey-operations-case-layer]').count()).toBe(1)
  await f.page.waitForTimeout(100);await uiExpect(pages.nth(5)).toHaveAttribute('aria-current','true');expect(f.errors).toEqual([])
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

it.each([540,760,1380])('keeps the sixth card subtitle and both description lines readable at %spx',async width=>{
 const f=await fixture({width,dark:true})
 try{
  await open(f.page)
  await f.page.locator('.odyssey-explore-pages button').nth(5).click()
  await uiExpect(f.page.getByRole('button',{name:'播放示例：复杂表格简单处理',exact:true})).toBeVisible()
  const description=f.page.locator('[data-odyssey-operations-case-layer][data-case="5"] .odyssey-operations-description')
  const lines=await description.evaluate((node:HTMLElement)=>{
   const text=node.firstChild!
   const marks=new Map<number,string>()
   for(let i=0;i<text.textContent!.length;i++){
    const character=text.textContent![i]!
    if(character==='\n')continue
    const range=document.createRange()
    range.setStart(text,i);range.setEnd(text,i+1)
    const y=Math.round(range.getBoundingClientRect().y)
    marks.set(y,(marks.get(y)??'')+character)
   }
   return [...marks.values()]
  })
  expect(lines).toEqual(['AI 整理财报，生成趋势图。','拆解现金流，动手试算回款。'])
 }finally{await f.close()}
},15000)

it('advances all six cases on the existing clock and pauses only while their card is being read',async()=>{
 const f=await fixture({reduced:false,clock:true});try{
  await open(f.page);await f.page.clock.pauseAt(new Date(await f.page.evaluate(()=>Date.now())+50))
  const pages=f.page.locator('.odyssey-explore-pages button');await f.page.mouse.move(10,10)
  await f.page.clock.fastForward(6400);await uiExpect(pages.nth(1)).toHaveAttribute('aria-current','true')
  const card=await f.page.locator('.odyssey-explore-example').boundingBox();await f.page.mouse.move(card.x+30,card.y+30);await f.page.clock.fastForward(7000);await uiExpect(pages.nth(1)).toHaveAttribute('aria-current','true')
  await f.page.mouse.move(10,10);await f.page.clock.fastForward(6400);await uiExpect(pages.nth(2)).toHaveAttribute('aria-current','true')
  await f.page.getByRole('tab',{name:'主题壁纸',exact:true}).evaluate((node:HTMLButtonElement)=>node.click());await f.page.clock.fastForward(7000);await uiExpect(pages.nth(2)).toHaveAttribute('aria-current','true')
  await f.page.getByRole('tab',{name:'快速开始',exact:true}).evaluate((node:HTMLButtonElement)=>node.click());await f.page.clock.fastForward(6400);await uiExpect(pages.nth(3)).toHaveAttribute('aria-current','true');await f.page.clock.fastForward(12000);await uiExpect(pages.nth(5)).toHaveAttribute('aria-current','true');expect(f.errors).toEqual([])
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
  await expect.poll(()=>f.page.locator('.odyssey-explore-search-control').evaluate((node:HTMLElement)=>Math.round(node.getBoundingClientRect().width))).toBe(864)
  await f.page.locator('.odyssey-explore-search-control').evaluate((node:HTMLElement)=>Promise.all(node.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished)))
  const geometry=await f.page.locator('.odyssey-explore-content').evaluate((node:HTMLElement)=>{const box=(s:string)=>{const r=node.querySelector(s)!.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width,height:r.height}};return{content:node.getBoundingClientRect().width,search:box('.odyssey-explore-search-control'),results:box('.odyssey-explore-results'),settings:getComputedStyle(node.querySelector('.odyssey-explore-tools>.odyssey-explore-tool')!).visibility}})
  expect(geometry.search.width).toBe(geometry.content);expect(geometry.search.height).toBe(40);expect(geometry.search.left).toBeCloseTo(geometry.results.left,0);expect(geometry.search.right).toBeCloseTo(geometry.results.right,0);expect(geometry.settings).toBe('hidden')
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

// Pure geometry batches share only the immutable fixture bundle/browser. Every
// case still owns and finally closes its own BrowserContext; animation, clock,
// account, navigation and WebGL behavior cases remain sequential.
it.concurrent.each([{collapsed:false,dark:false},{collapsed:false,dark:true},{collapsed:true,dark:false},{collapsed:true,dark:true}])('gives footer controls safe hover padding, a square notification target and leaves the sidebar list unblurred (collapsed=$collapsed dark=$dark)',async({collapsed,dark})=>{
 const f=await fixture({collapsed,dark,width:1100,height:760});try{
  await f.page.route('https://explore.test/odyssey-b-notifications-20.svg',async (route:any)=>route.fulfill({contentType:'image/svg+xml',body:await readFile('build/brand/odyssey-b-notifications-20.svg')}));await f.page.addStyleTag({content:scheduledStyles})
  await f.page.evaluate((collapsed:boolean)=>{const sidebar=document.querySelector<HTMLElement>('#sidebar')!,footer=document.querySelector<HTMLElement>('#footer')!;sidebar.dataset.dshSidebarRoot='';sidebar.dataset.dshSidebarWide=String(!collapsed);footer.classList.add('hHd-Xa_footArea');footer.dataset.dshSidebarFooter='';const slot=document.createElement('div');slot.dataset.slot='sidebar.settings';slot.append(...footer.childNodes);footer.append(slot)},collapsed)
  const trigger=f.page.locator('[data-explore-trigger]'),bell=f.page.getByRole('button',{name:'消息中心',exact:true});await trigger.hover()
  const shape=await trigger.evaluate((node:HTMLElement)=>{const r=node.getBoundingClientRect(),orb=node.querySelector('.odyssey-explore-orb')!,orbBounds=orb.getBoundingClientRect(),style=getComputedStyle(node),fog=getComputedStyle(node.parentElement!,'::before');return{width:r.width,height:r.height,padding:style.padding,topClearance:r.top-node.parentElement!.getBoundingClientRect().top,radius:style.borderRadius,orbRadius:getComputedStyle(orb).borderRadius,orb:[orbBounds.left-r.left,orbBounds.top-r.top,r.right-orbBounds.right,r.bottom-orbBounds.bottom],background:style.backgroundColor,fog:{content:fog.content,backdrop:fog.backdropFilter,mask:fog.maskImage}}})
  expect(shape.height).toBe(56);expect(shape.padding).toBe('8px');expect(shape.topClearance).toBeGreaterThanOrEqual(8);expect(shape.radius).toBe('12px');expect(shape.orbRadius).toBe('50%');expect(shape.orb.every((value:number)=>value>=8)).toBe(true);expect(shape.background).not.toBe('rgba(0, 0, 0, 0)');expect(shape.fog).toEqual({content:'none',backdrop:'none',mask:'none'})
  await trigger.screenshot({path:evidence+'/explore-hover-'+collapsed+'-'+dark+'.png'})
  await bell.hover();const target=await bell.evaluate((node:HTMLElement)=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node),icon=node.querySelector<HTMLElement>('.srb-bell-icon')!.getBoundingClientRect(),host=node.parentElement!.getBoundingClientRect(),owners=[];let left=r.left,right=r.right,top=r.top,bottom=r.bottom;for(let ancestor:HTMLElement|null=node;ancestor;ancestor=ancestor.parentElement){const css=getComputedStyle(ancestor),box=ancestor.getBoundingClientRect();if(css.backgroundColor!=='rgba(0, 0, 0, 0)'||css.backgroundImage!=='none')owners.push({className:ancestor.className,width:box.width,height:box.height});if(ancestor!==node){if(['hidden','clip','auto','scroll'].includes(css.overflowX)){left=Math.max(left,box.left);right=Math.min(right,box.right)}if(['hidden','clip','auto','scroll'].includes(css.overflowY)){top=Math.max(top,box.top);bottom=Math.min(bottom,box.bottom)}}if(ancestor.id==='footer')break}return{width:r.width,height:r.height,padding:s.padding,margin:s.margin,borderRadius:s.borderRadius,background:s.backgroundColor,host:{width:host.width,height:host.height},iconInsets:[icon.left-r.left,icon.top-r.top,r.right-icon.right,r.bottom-icon.bottom],visible:{width:right-left,height:bottom-top},owners}});await writeFile(evidence+'/notification-geometry-'+collapsed+'-'+dark+'.json',JSON.stringify(target,null,2));expect(target.width).toBe(40);expect(target.height).toBe(40);expect(target.padding).toBe('10px');expect(target.margin).toBe('0px');expect(target.borderRadius).toBe('10px');expect(target.host).toEqual({width:40,height:40});expect(target.visible).toEqual({width:40,height:40});expect(target.iconInsets).toEqual([10,10,10,10]);expect(target.owners).toEqual([{className:'srb-bell',width:40,height:40}]);expect(target.background).not.toBe('rgba(0, 0, 0, 0)');await bell.screenshot({path:evidence+'/notification-hover-native-'+collapsed+'-'+dark+'.png'})
  await writeFile(evidence+'/footer-'+collapsed+'-'+dark+'.json',JSON.stringify({explore:shape,bell:target},null,2));await f.page.screenshot({path:evidence+'/footer-'+collapsed+'-'+dark+'.png'})
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

it.each(['demo','dismiss'])('restores the original composer focus only for user dismissal, not the %s handoff',async mode=>{
 const f=await fixture();try{
  const input=f.page.getByRole('textbox',{name:'保留的原输入框'})
  await input.focus()
  await input.evaluate((node:HTMLTextAreaElement)=>{
   // The home composer can create/select a session when it regains focus.
   // Open by event as the client does, without focusing a fixture button first.
   ;(window as any).composerRefocus=0
   node.addEventListener('focus',()=>{(window as any).composerRefocus++})
   window.dispatchEvent(new CustomEvent('sherlock:explore-open'))
  })
  await uiExpect(f.page.locator('dialog.odyssey-explore')).toBeVisible()
  if(mode==='demo'){
   await f.page.locator('.odyssey-explore-example').click()
   await expect.poll(()=>f.page.evaluate(()=>(window as any).calls.filter((row:any)=>row.example).length)).toBe(1)
  }else await f.page.keyboard.press('Escape')
  await uiExpect(f.page.locator('dialog.odyssey-explore')).not.toBeVisible()
  expect(await f.page.evaluate(()=>(window as any).composerRefocus)).toBe(mode==='dismiss'?1:0)
  if(mode==='dismiss')await uiExpect(input).toBeFocused()
  else await uiExpect(input).not.toBeFocused()
  expect(await input.inputValue()).toBe('原草稿必须保留');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it.concurrent.each([540,1600])('keeps appearance, settings and search in the requested single row at %spx',async width=>{
 const f=await fixture({width,height:820});try{await open(f.page);const tools=f.page.locator('.odyssey-explore-tools');const read=()=>tools.evaluate((node:HTMLElement)=>[...node.children].map((child:Element)=>{const r=child.getBoundingClientRect();return{label:child.getAttribute('aria-label')??child.querySelector('button')?.getAttribute('aria-label'),x:r.x,y:r.y,width:r.width,height:r.height}}));const rows=await read();expect(rows.map((row:any)=>row.label)).toEqual(['切换为浅色','设置','搜索会话']);expect(rows.map((row:any)=>row.height)).toEqual([40,40,40]);expect(rows.map((row:any)=>row.y)).toEqual([rows[0].y,rows[0].y,rows[0].y]);expect(rows[1].x-rows[0].x).toBe(52);expect(rows[2].x-rows[1].x).toBe(52);expect(rows[2].x+40).toBeLessThanOrEqual(width);await f.page.getByRole('button',{name:'搜索会话',exact:true}).click();await uiExpect(f.page.getByRole('button',{name:'设置',exact:true})).not.toBeVisible();await uiExpect(f.page.getByRole('button',{name:'切换为浅色',exact:true})).not.toBeVisible();expect(await f.page.locator('.odyssey-explore-brand').isVisible()).toBe(false);await f.page.getByRole('button',{name:'收起搜索',exact:true}).click();expect((await read()).map((row:any)=>row.label)).toEqual(['切换为浅色','设置','搜索会话']);expect(f.errors).toEqual([])}finally{await f.close()}
},12000)

it.each([true,false])('keeps the three circular tools shadow-free in normal, hover and keyboard focus states (dark=%s)',async dark=>{
 const f=await fixture({dark});try{await open(f.page);for(const name of [dark?'切换为浅色':'切换为深色','设置','搜索会话']){const target=f.page.getByRole('button',{name,exact:true});await f.page.mouse.move(8,8);expect(await target.evaluate((node:HTMLElement)=>getComputedStyle(node).boxShadow)).toBe('none');await target.hover();expect(await target.evaluate((node:HTMLElement)=>getComputedStyle(node).boxShadow)).toBe('none');await f.page.keyboard.press('Tab');await target.focus();const focused=await target.evaluate((node:HTMLElement)=>({shadow:getComputedStyle(node).boxShadow,visible:node.matches(':focus-visible'),outline:getComputedStyle(node).outlineStyle}));expect(focused.shadow).toBe('none');expect(focused.visible).toBe(true);expect(focused.outline).not.toBe('none')}await f.page.getByRole('button',{name:'搜索会话',exact:true}).click();expect(await f.page.locator('.odyssey-explore-search-control').evaluate((node:HTMLElement)=>getComputedStyle(node).boxShadow)).toBe('none');await f.page.screenshot({path:evidence+'/shadow-free-'+dark+'.png'});expect(f.errors).toEqual([])}finally{await f.close()}
},15000)

it('restores fixed tool centers throughout search collapse and fades the two left tools without moving them',async()=>{
 const f=await fixture({reduced:false});try{await open(f.page);const read=()=>f.page.locator('.odyssey-explore-tools').evaluate((node:HTMLElement)=>[node.querySelector('[data-explore-appearance]')!,node.querySelector(':scope>button:not([data-explore-appearance])')!,node.querySelector('.odyssey-explore-search-control>button:first-child')!].map(target=>{const r=target.getBoundingClientRect(),s=getComputedStyle(target);return{x:r.x+r.width/2,y:r.y+r.height/2,opacity:Number(s.opacity),transform:s.transform}}));const expected=await read();await f.page.getByRole('button',{name:'搜索会话',exact:true}).click();await expect.poll(()=>f.page.locator('.odyssey-explore-search-control').evaluate((node:HTMLElement)=>Math.round(node.getBoundingClientRect().width))).toBe(864);await f.page.evaluate(()=>{const row=document.querySelector('.odyssey-explore-tools')!,nodes=[row.querySelector('[data-explore-appearance]')!,row.querySelector(':scope>button:not([data-explore-appearance])')!,row.querySelector('.odyssey-explore-search-control>button:first-child')!];(window as any).collapseFrames=[];(window as any).collapseComplete=false;let complete=false;const start=performance.now(),sample=()=>{(window as any).collapseFrames.push({time:performance.now()-start,width:row.querySelector('.odyssey-explore-search-control')!.getBoundingClientRect().width,tools:nodes.map(target=>{const r=target.getBoundingClientRect(),s=getComputedStyle(target);return{x:r.x+r.width/2,y:r.y+r.height/2,opacity:Number(s.opacity),transform:s.transform}})});if(!complete)requestAnimationFrame(sample)};(row.querySelector('button[aria-label="收起搜索"]') as HTMLButtonElement).click();sample();void Promise.allSettled(row.getAnimations({subtree:true}).filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished)).then(()=>{complete=true;sample();(window as any).collapseComplete=true})});await f.page.waitForFunction(()=>(window as any).collapseComplete);const frames=await f.page.evaluate(()=>(window as any).collapseFrames);await writeFile(evidence+'/search-collapse-fixed-centers.json',JSON.stringify({expected,frames},null,2));expect(frames.length).toBeGreaterThanOrEqual(3);expect(frames.some((frame:any)=>frame.width>40&&frame.width<864)).toBe(true);expect(frames.some((frame:any)=>frame.tools[0].opacity>0&&frame.tools[0].opacity<1)).toBe(true);for(const frame of frames)for(let i=0;i<3;i++){expect(frame.tools[i].x).toBeCloseTo(expected[i].x,1);expect(frame.tools[i].y).toBeCloseTo(expected[i].y,1);expect(frame.tools[i].transform).toBe('none')}expect(Math.round(frames.at(-1).width)).toBe(40);await f.page.screenshot({path:evidence+'/search-collapsed.png'});expect(f.errors).toEqual([])}finally{await f.close()}
},15000)

it.each([true,false])('keeps all five quick-start cards readable with less background transparency (dark=%s)',async dark=>{
 const f=await fixture({dark});try{await open(f.page);await f.page.mouse.move(8,8);const cards=f.page.locator('.odyssey-explore-showcase,.odyssey-explore-create'),before=await cards.evaluateAll((nodes:HTMLElement[])=>nodes.map(node=>({background:getComputedStyle(node).backgroundColor,blur:getComputedStyle(node).backdropFilter})));expect(before).toHaveLength(5);expect(before.map((row:any)=>row.background)).toEqual(Array(5).fill(dark?'rgba(35, 36, 38, 0.88)':'rgba(249, 251, 253, 0.92)'));expect(before.slice(1).every((row:any)=>row.blur===(dark?'blur(24px) saturate(0.85)':'blur(18px) saturate(0.85)'))).toBe(true);await f.page.screenshot({path:evidence+'/opaque-cards-'+dark+'.png'});const quick=f.page.locator('.odyssey-explore-create');const hovered=[];for(let i=0;i<4;i++){await quick.nth(i).hover();await expect.poll(()=>quick.nth(i).evaluate((node:HTMLElement)=>getComputedStyle(node).backgroundColor)).toBe(dark?'rgba(30, 42, 65, 0.9)':'rgba(235, 245, 255, 0.94)');hovered.push(await quick.nth(i).evaluate((node:HTMLElement)=>getComputedStyle(node).backgroundColor))}await writeFile(evidence+'/opaque-cards-'+dark+'.json',JSON.stringify({before,hovered},null,2));expect(f.errors).toEqual([])}finally{await f.close()}
},15000)

it.each([true,false])('matches the original Home deck layout and effects through the same builder (dark=%s)',async dark=>{
 const f=await fixture({dark,reduced:false});try{await f.page.locator('.pI_x6G_centerCol').evaluate((node:HTMLElement)=>{node.style.setProperty('width','1340px','important');node.style.setProperty('height','1000px','important');node.style.setProperty('display','block','important')});await f.page.evaluate(()=>(window as any).fixture.legacyStart());await f.page.getByRole('button',{name:'切换到快速开始',exact:true}).click();await expect.poll(()=>f.page.locator('.pI_x6G_centerCol').getAttribute('data-odyssey-home-operations-motion')).toBe('idle');const original=f.page.locator('.pI_x6G_centerCol .odyssey-operations-grid');await uiExpect(original).toBeVisible();const snapshot=async(selector:string)=>f.page.locator(selector).evaluate((grid:HTMLElement)=>{const node=(el:HTMLElement)=>{const s=getComputedStyle(el),before=getComputedStyle(el,'::before');return{width:el.offsetWidth,height:el.offsetHeight,gradient:s.backgroundImage,ambient:before.backgroundImage,ambientAnimation:before.animationName,label:[...el.querySelectorAll<HTMLElement>('.odyssey-operations-quick-label,.odyssey-operations-case-copy,.odyssey-operations-description')].map(copy=>({cls:copy.className,left:copy.offsetLeft,top:copy.offsetTop,width:copy.offsetWidth,font:getComputedStyle(copy).font})),images:[...el.querySelectorAll<HTMLImageElement>('img')].map(img=>({cls:img.className,src:img.src,mask:getComputedStyle(img).maskImage,width:img.offsetWidth,height:img.offsetHeight})),passes:[...el.querySelectorAll<HTMLElement>('.odyssey-operations-illustration-pass')].map(pass=>({className:pass.className,filter:getComputedStyle(pass).filter,mask:getComputedStyle(pass).maskImage})),glows:[...el.querySelectorAll<HTMLElement>('.glow')].map(glow=>({animation:getComputedStyle(glow).animationName,image:getComputedStyle(glow).backgroundImage}))}};return{usecase:node(grid.querySelector('.odyssey-operations-usecase')!),cards:[...grid.querySelectorAll<HTMLElement>('.odyssey-operations-quick-card')].map(node)}});const expected=await snapshot('.pI_x6G_centerCol .odyssey-operations-grid');await original.screenshot({path:evidence+'/original-home-deck-'+dark+'.png',animations:'disabled'});await f.page.evaluate(()=>(window as any).fixture.legacyStop());await f.page.getByRole('button',{name:'探索',exact:true}).evaluate((node:HTMLButtonElement)=>node.click());await uiExpect(f.page.getByRole('dialog',{name:'探索',exact:true})).toBeVisible();await f.page.locator('.odyssey-explore-content').evaluate((node:HTMLElement)=>Promise.all(node.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished)));const actual=await snapshot('.odyssey-explore-quick .odyssey-operations-grid');expect(actual).toEqual(expected);const native=f.page.locator('.odyssey-explore-quick .odyssey-operations-quick-card').first(),anchor=f.page.locator('.odyssey-explore-quick .odyssey-operations-quick-anchor').first();const stableAnchor=await anchor.boundingBox();await anchor.hover({position:{x:20,y:20}});await expect.poll(()=>native.evaluate((node:HTMLElement)=>node.style.getPropertyValue('--rx'))).not.toBe('');expect(await native.evaluate((node:HTMLElement)=>getComputedStyle(node).transform)).not.toBe('none');expect(await anchor.boundingBox()).toEqual(stableAnchor);const point=f.page.locator('.odyssey-explore-quick .odyssey-operations-glow.one');expect(await point.evaluate((node:HTMLElement)=>node.getAnimations().map(animation=>(animation as CSSAnimation).animationName))).toContain('odyssey-operations-float-one');const glowBefore=await point.evaluate((node:HTMLElement)=>getComputedStyle(node).translate);await f.page.waitForTimeout(150);expect(await point.evaluate((node:HTMLElement)=>getComputedStyle(node).translate)).not.toBe(glowBefore);await f.page.mouse.move(8,8);try{await expect.poll(()=>native.evaluate((node:HTMLElement)=>node.hasAttribute('data-odyssey-operations-tilting')),{timeout:3000,interval:32}).toBe(false)}catch(error){await writeFile(evidence+'/deck-leave-'+dark+'.json',JSON.stringify(await native.evaluate((node:HTMLElement)=>({style:node.getAttribute('style'),hover:node.matches(':hover'),anchorHover:node.parentElement!.matches(':hover'),section:node.closest('[data-odyssey-operations-deck]')?.outerHTML.slice(0,900),visibility:document.visibilityState})),null,2));throw error}await f.page.screenshot({path:evidence+'/restored-home-deck-'+dark+'.png'});await writeFile(evidence+'/home-deck-parity-'+dark+'.json',JSON.stringify({expected,actual},null,2));expect(f.errors).toEqual([])}finally{await f.close()}
},25000)

it.each([true,false])('keeps filled sidebar-style header tools aligned through appearance changes (dark=%s)',async dark=>{
 const f=await fixture({dark});try{await open(f.page);const read=()=>f.page.locator('.odyssey-explore-tools').evaluate(async(row:HTMLElement)=>{const nodes=[row.querySelector<HTMLButtonElement>('[data-explore-appearance]')!,row.querySelector<HTMLButtonElement>(':scope>button:not([data-explore-appearance])')!,row.querySelector<HTMLButtonElement>('.odyssey-explore-search-control>button:first-child')!];return Promise.all(nodes.map(async button=>{const image=button.querySelector('img')!,source=await(await fetch(image.src)).text(),svg=new DOMParser().parseFromString(source,'image/svg+xml').documentElement,probe=document.createElement('div');probe.style.cssText='position:fixed;left:-1000px;top:-1000px;visibility:hidden';const shadow=probe.attachShadow({mode:'open'});shadow.append(document.importNode(svg,true));document.body.append(probe);try{const r=image.getBoundingClientRect(),b=button.getBoundingClientRect();return{label:button.getAttribute('aria-label'),size:[r.width,r.height],center:[b.x+b.width/2,b.y+b.height/2],shadow:getComputedStyle(button).boxShadow,paths:[...shadow.querySelectorAll('path,circle')].map(path=>{const s=getComputedStyle(path);return{fill:s.fill,stroke:s.stroke}})}}finally{probe.remove()}}))});const before=await read();await f.page.getByRole('button',{name:dark?'切换为浅色':'切换为深色',exact:true}).click();await uiExpect(f.page.getByRole('button',{name:dark?'切换为深色':'切换为浅色',exact:true})).toBeEnabled();const after=await read();for(const state of[before,after])for(const tool of state){expect(tool.size).toEqual([20,20]);expect(tool.shadow).toBe('none');expect(tool.paths.length).toBeGreaterThan(0);for(const path of tool.paths)expect(path).toEqual({fill:'rgb(170, 170, 170)',stroke:'none'})}expect(after.map((tool:any)=>tool.center)).toEqual(before.map((tool:any)=>tool.center));await writeFile(evidence+'/filled-header-tools-'+dark+'.json',JSON.stringify({before,after},null,2));await f.page.screenshot({path:evidence+'/filled-header-tools-'+dark+'.png'});expect(f.errors).toEqual([])}finally{await f.close()}
},15000)

it.each([[1366,768,true],[1380,900,false],[760,600,true],[540,600,false]])('fits every wallpaper without vertical scrolling at %sx%s dark=%s',async(width,height,dark)=>{
 const f=await fixture({width:width as number,height:height as number,dark:dark as boolean});try{
  await open(f.page);await f.page.getByRole('tab',{name:'主题壁纸',exact:true}).click()
  const pane=f.page.locator('.odyssey-explore-wallpapers')
  const measure=()=>pane.evaluate((pane:HTMLElement)=>{const r=pane.getBoundingClientRect();return{viewport:[r.width,r.height],content:pane.scrollHeight,scroll:pane.scrollTop,columns:getComputedStyle(pane.firstElementChild!).gridTemplateColumns.split(' ').length,cards:[...pane.querySelectorAll<HTMLElement>('.odyssey-wallpaper-card')].map(card=>{const b=card.getBoundingClientRect(),preview=card.querySelector<HTMLElement>('.odyssey-wallpaper-preview')!.getBoundingClientRect(),label=card.querySelector<HTMLElement>('.odyssey-wallpaper-name')!;return{width:preview.width,height:preview.height,left:b.left-r.left,right:r.right-b.right,top:b.top-r.top,bottom:r.bottom-b.bottom,labelHeight:label.clientHeight,labelContent:label.scrollHeight}})}})
  const check=async()=>{const shape=await measure();expect(shape.cards).toHaveLength(15);expect(shape.content).toBeLessThanOrEqual(shape.viewport[1]+1);expect(shape.scroll).toBe(0);for(const card of shape.cards){expect(card.width).toBeGreaterThanOrEqual(64);expect(card.height).toBeGreaterThanOrEqual(34);for(const edge of [card.left,card.right,card.top,card.bottom])expect(edge).toBeGreaterThanOrEqual(3);expect(card.labelContent).toBeLessThanOrEqual(card.labelHeight+1)}return shape}
  await expect.poll(async()=>{const shape=await measure();return shape.content<=shape.viewport[1]+1}).toBe(true)
  const shape=await check();if((width as number)>=1366)expect(shape.columns).toBe(5);const first=f.page.locator('.odyssey-wallpaper-card').first();const before=await first.boundingBox();await first.hover();await f.page.mouse.wheel(0,640);await f.page.waitForTimeout(120);expect(await first.boundingBox()).toEqual(before);await check()
  // Neither pointer scrolling nor keyboard focus should need to reveal a hidden row.
  await first.focus();await f.page.keyboard.press('End');await f.page.keyboard.press('Enter');expect(await f.page.evaluate(()=>(window as any).fixture.selected())).toBe('koi-pond');await check()
  await writeFile(evidence+'/wallpaper-layout-'+width+'-'+height+'.json',JSON.stringify(shape,null,2));await f.page.screenshot({path:evidence+'/wallpaper-layout-'+width+'-'+height+'.png'})
  await f.page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en');await f.page.setViewportSize({width:width as number,height:540});await expect.poll(async()=>{const shape=await measure();return shape.content<=shape.viewport[1]+1}).toBe(true);await check();await f.page.getByRole('button',{name:'Koi Shimmer',exact:true}).click();expect(await pane.evaluate((node:HTMLElement)=>node.scrollTop)).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it.each([true,false])('adds padding around the account hover contents in dark=%s',async dark=>{
 const f=await fixture({dark});try{await open(f.page);const account=f.page.getByRole('button',{name:'研究员，打开账户菜单',exact:true});await account.hover();const shape=await account.evaluate((node:HTMLElement)=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node),first=node.firstElementChild!.getBoundingClientRect(),last=node.lastElementChild!.getBoundingClientRect();return{height:r.height,padding:s.padding,top:first.top-r.top,bottom:r.bottom-first.bottom,left:first.left-r.left,right:r.right-last.right,background:s.backgroundColor}});expect(shape.height).toBe(48);expect(shape.padding).toBe('10px');for(const key of['top','bottom','left','right'])expect(shape[key]).toBeGreaterThanOrEqual(10);expect(shape.background).not.toBe('rgba(0, 0, 0, 0)');await writeFile(evidence+'/account-hover-'+dark+'.json',JSON.stringify(shape,null,2));expect(f.errors).toEqual([])}finally{await f.close()}
},15000)

it.each([true,false])('plays only the hovered native wallpaper and releases its GL view on leave and close in dark=%s',async dark=>{
 const f=await fixture({dark,reduced:false});try{
  await open(f.page);await f.page.getByRole('tab',{name:'主题壁纸',exact:true}).click();const card=f.page.getByRole('button',{name:'星海航迹',exact:true});await card.hover();const live=f.page.locator('canvas[data-home-theme-preview="berber"]');await uiExpect(live).toHaveCount(1)
  await live.evaluate((canvas:HTMLCanvasElement)=>{(window as any).previewLost=0;canvas.addEventListener('webglcontextlost',()=>{(window as any).previewLost++})});const before=await live.screenshot({animations:'allow'});await f.page.waitForTimeout(160);const after=await live.screenshot({animations:'allow'});expect(before.equals(after)).toBe(false);await writeFile(evidence+'/wallpaper-live-'+dark+'-before.png',before);await writeFile(evidence+'/wallpaper-live-'+dark+'-after.png',after)
  await f.page.getByRole('button',{name:'深空讯号',exact:true}).hover();await uiExpect(f.page.locator('canvas[data-home-theme-preview]')).toHaveCount(1);await uiExpect(f.page.locator('canvas[data-home-theme-preview="boz"]')).toHaveCount(1);await expect.poll(()=>f.page.evaluate(()=>(window as any).previewLost)).toBe(1);expect(await f.page.evaluate(()=>(window as any).fixture.selected())).toBe('default')
  await f.page.mouse.move(8,8);await uiExpect(f.page.locator('canvas[data-home-theme-preview]')).toHaveCount(0);await uiExpect(f.page.locator('canvas[data-home-theme-preview-freeze]')).toHaveCount(0)
  await card.hover();await uiExpect(live).toHaveCount(1);await f.page.getByRole('button',{name:'关闭探索',exact:true}).click();await uiExpect(f.page.locator('canvas[data-home-theme-preview],canvas[data-home-theme-preview-freeze]')).toHaveCount(0);expect(await f.page.getByRole('textbox',{name:'保留的原输入框'}).inputValue()).toBe('原草稿必须保留');expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it('keeps reduced motion static and cancels transient wallpaper work when the gallery is hidden',async()=>{
 const f=await fixture({reduced:true});try{await open(f.page);await f.page.getByRole('tab',{name:'主题壁纸',exact:true}).click();const card=f.page.getByRole('button',{name:'星海航迹',exact:true});await card.hover();await f.page.waitForTimeout(150);expect(await f.page.locator('canvas[data-home-theme-preview]').count()).toBe(0);await f.page.emulateMedia({reducedMotion:'no-preference'});await f.page.mouse.move(8,8);await card.hover();await uiExpect(f.page.locator('canvas[data-home-theme-preview]')).toHaveCount(1);await f.page.emulateMedia({reducedMotion:'reduce'});await uiExpect(f.page.locator('canvas[data-home-theme-preview],canvas[data-home-theme-preview-freeze]')).toHaveCount(0);await f.page.emulateMedia({reducedMotion:'no-preference'});await f.page.mouse.move(8,8);await card.hover();await uiExpect(f.page.locator('canvas[data-home-theme-preview]')).toHaveCount(1);await f.page.getByRole('tab',{name:'快速开始',exact:true}).click();await uiExpect(f.page.locator('canvas[data-home-theme-preview],canvas[data-home-theme-preview-freeze]')).toHaveCount(0);expect(f.errors).toEqual([])}finally{await f.close()}
},15000)

it('uses the native flow, React Bits and koi surfaces without changing the selected wallpaper',async()=>{
 const f=await fixture({reduced:false});try{await open(f.page);await f.page.getByRole('tab',{name:'主题壁纸',exact:true}).click();for(const[id,name]of[['default','静谧起航'],['crt-warp','时空回声'],['koi-pond','锦鲤浮光']]){await f.page.getByRole('button',{name,exact:true}).hover();const canvas=f.page.locator('canvas[data-home-theme-preview="'+id+'"]');await uiExpect(canvas).toHaveCount(1);expect(await f.page.locator('canvas[data-home-theme-preview]').count()).toBe(1);await f.page.waitForTimeout(160);await canvas.screenshot({path:evidence+'/wallpaper-family-'+id+'.png',animations:'allow'});expect(await canvas.evaluate((node:HTMLCanvasElement)=>node.width>0&&node.height>0)).toBe(true)}expect(await f.page.evaluate(()=>(window as any).fixture.selected())).toBe('default');await f.page.evaluate(()=>(window as any).fixture.dispose());expect(await f.page.locator('canvas[data-home-theme-preview],canvas[data-home-theme-preview-freeze]').count()).toBe(0);expect(f.errors).toEqual([])}finally{await f.close()}
},20000)

it('starts search with no selected result and preserves deliberate keyboard navigation and quick open',async()=>{
 const f=await fixture();try{
  await open(f.page);await f.page.getByRole('button',{name:'搜索会话',exact:true}).click();const input=f.page.getByRole('searchbox',{name:'搜索会话',exact:true}),rows=f.page.getByRole('option');await input.fill('中际');await uiExpect(rows).toHaveCount(3);await uiExpect(f.page.locator('[role=option][aria-selected=true]')).toHaveCount(0)
  await rows.nth(1).hover();await uiExpect(f.page.locator('[role=option][aria-selected=true]')).toHaveCount(0);await f.page.mouse.move(8,8)
  await input.press('ArrowDown');await uiExpect(rows.nth(0)).toBeFocused();await uiExpect(rows.nth(0)).toHaveAttribute('aria-selected','true');await f.page.keyboard.press('ArrowDown');await uiExpect(rows.nth(1)).toBeFocused();await uiExpect(rows.nth(1)).toHaveAttribute('aria-selected','true')
  await input.focus();await uiExpect(f.page.locator('[role=option][aria-selected=true]')).toHaveCount(0);await f.page.getByRole('tab',{name:'笔记',exact:true}).click();await uiExpect(rows).toHaveCount(1);await uiExpect(f.page.locator('[role=option][aria-selected=true]')).toHaveCount(0)
  await input.fill('现金流');await uiExpect(rows).toHaveCount(1);await uiExpect(f.page.locator('[role=option][aria-selected=true]')).toHaveCount(0);await input.press('Enter');await expect.poll(()=>f.page.evaluate(()=>(window as any).opened)).toEqual(['session:n']);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it.each([false,true])('keeps the selected wallpaper edge visible above a live hover preview in dark=%s',async dark=>{
 const f=await fixture({dark,reduced:false});try{
  await open(f.page);await f.page.getByRole('tab',{name:'主题壁纸',exact:true}).click();const card=f.page.getByRole('button',{name:'星云风暴',exact:true});await card.click();await f.page.mouse.move(8,8);await card.hover();await uiExpect(f.page.locator('canvas[data-home-theme-preview="shashidhar"]')).toHaveCount(1);await uiExpect(card).toHaveAttribute('aria-pressed','true')
  const edge=await card.locator('.odyssey-wallpaper-preview').evaluate((node:HTMLElement)=>{const s=getComputedStyle(node),a=getComputedStyle(node,'::after');return{shadow:s.boxShadow,outline:s.outlineStyle,border:a.borderColor,width:a.borderWidth,opacity:a.opacity,z:a.zIndex,pointer:a.pointerEvents}});expect(edge).toEqual({shadow:'none',outline:'none',border:dark?'rgb(209, 214, 222)':'rgb(188, 195, 205)',width:'2px',opacity:'1',z:'2',pointer:'none'});await card.screenshot({path:evidence+'/selected-hover-edge-'+dark+'.png',animations:'allow'});expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('localizes the new Explore account and search menus live without translating the actual identity, result title or draft',async()=>{
 const f=await fixture();try{
  f.page.setDefaultTimeout(4000);await open(f.page);await f.page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en');
  const dialog=f.page.getByRole('dialog',{name:'Explore',exact:true});await uiExpect(dialog).toBeVisible();await uiExpect(dialog.getByRole('tab',{name:'Quick start',exact:true})).toBeVisible();
  await dialog.locator('.odyssey-explore-account').click();const menu=f.page.getByRole('menu');
  await uiExpect(menu.getByRole('menuitem',{name:'Copy user ID',exact:true})).toBeEnabled();await uiExpect(menu).toContainText('User ID: 1234567890');await menu.screenshot({path:evidence+'/account-menu-english.png'});
  await f.page.evaluate(()=>document.documentElement.dataset.odysseyLocale='zh');await uiExpect(menu.getByRole('menuitem',{name:'复制用户 ID',exact:true})).toBeEnabled();await uiExpect(menu).toContainText('用户 ID：1234567890');
  await f.page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en');await menu.getByRole('menuitem',{name:'Copy user ID',exact:true}).click();await uiExpect(menu).toContainText('Copied');expect(await f.page.evaluate(()=>(window as any).copied)).toEqual(['1234567890']);
  await f.page.keyboard.press('Escape');await dialog.getByRole('button',{name:'Search conversations',exact:true}).click();
  const input=dialog.getByRole('searchbox');expect(await input.getAttribute('aria-label')).toMatch(/^Search (conversations|sessions)$/);await input.fill('中际旭创');
  await uiExpect(dialog.getByRole('listbox',{name:'Conversation search results',exact:true})).toBeVisible();await uiExpect(dialog.locator('.odyssey-explore-result-list strong').first()).toHaveText('中际旭创研究工作台');await dialog.screenshot({path:evidence+'/explore-search-english.png'});
  expect(await f.page.locator('.wSkVaW_composerHero textarea').inputValue()).toBe('原草稿必须保留');await dialog.getByRole('button',{name:'Close search',exact:true}).click();
  expect(await dialog.locator('.odyssey-explore-account').textContent()).toContain('研究员');expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it.concurrent.each([[1380,true],[1380,false],[820,true],[820,false]] as const)('keeps every English Explore hero and quick title readable within its card at %ipx, dark=%s while preserving Chinese styling',async(width,dark)=>{
 const f=await fixture({width,height:920,dark});try{
  await open(f.page);const dialog=f.page.locator('dialog.odyssey-explore');
  const chinese=()=>dialog.evaluate((root:HTMLElement)=>[...root.querySelectorAll<HTMLElement>('.odyssey-operations-title,.odyssey-operations-subtitle,.odyssey-operations-quick-label,.odyssey-operations-illustration')].map(el=>{const s=getComputedStyle(el);return{text:el.textContent,font:s.fontSize,lineHeight:s.lineHeight,whiteSpace:s.whiteSpace,width:s.width,height:s.height,top:s.top,left:s.left,background:s.backgroundImage,src:el.getAttribute('src')}}));const before=await chinese();
  await f.page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en');await uiExpect(dialog.getByRole('tab',{name:'Quick start',exact:true})).toBeVisible();const samples:any[]=[];
  for(let index=0;index<5;index++){
   await dialog.locator('.odyssey-explore-pages button').nth(index).click();await uiExpect(dialog.locator('.odyssey-operations-usecase')).toHaveAttribute('data-case',String(index));
   const geometry=await dialog.evaluate((root:HTMLElement,index:number)=>{
    const box=(el:Element)=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const glyphs=(el:Element)=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),rects:any[]=[];while(walker.nextNode()){if(!walker.currentNode.textContent?.trim())continue;const range=document.createRange();range.selectNodeContents(walker.currentNode);rects.push(...[...range.getClientRects()].map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom})))}return rects};
    const layer=root.querySelector<HTMLElement>('.odyssey-operations-case-layer[data-case="'+index+'"]')!,card=layer.closest('.odyssey-operations-usecase')!,copy=layer.querySelector('.odyssey-operations-case-copy')!,description=layer.querySelector('.odyssey-operations-description')!,progress=card.querySelector('.odyssey-operations-pagination')!,subtitle=layer.querySelector('.odyssey-operations-subtitle')!;
    return{index,hero:{card:box(card),copy:box(copy),glyphs:glyphs(copy),description:box(description),descriptionGlyphs:glyphs(description),progress:box(progress),subtitle:subtitle.textContent,whiteSpace:getComputedStyle(subtitle).whiteSpace},quick:[...root.querySelectorAll<HTMLElement>('.odyssey-operations-quick-card')].map(card=>{const label=card.querySelector('.odyssey-operations-quick-label')!,art=card.querySelector('.odyssey-operations-illustration')!;return{card:box(card),label:box(label),glyphs:glyphs(label),art:box(art),text:label.textContent,overflow:getComputedStyle(label).textOverflow}})}
   },index);samples.push(geometry);
   if(index===2)await dialog.screenshot({path:evidence+'/english-presentation-'+width+'-'+dark+'.png'});
  }
  await writeFile(evidence+'/english-cards-'+width+'-'+dark+'.json',JSON.stringify(samples,null,2));
  for(const geometry of samples){
   expect(geometry.hero.whiteSpace).toBe('normal');for(const r of geometry.hero.glyphs){expect(r.left).toBeGreaterThanOrEqual(geometry.hero.card.left+6);expect(r.right).toBeLessThanOrEqual(geometry.hero.card.right-6)}expect(geometry.hero.copy.bottom).toBeLessThan(geometry.hero.description.top-8);for(const r of geometry.hero.descriptionGlyphs)expect(r.bottom).toBeLessThan(geometry.hero.progress.top-4);
   for(const item of geometry.quick){expect(item.overflow).not.toBe('ellipsis');for(const r of item.glyphs){expect(r.left).toBeGreaterThanOrEqual(item.card.left+5);expect(r.right).toBeLessThanOrEqual(item.card.right-5);expect(r.bottom).toBeLessThan(item.art.top+1)}}
  }
  await dialog.screenshot({path:evidence+'/english-cards-'+width+'-'+dark+'.png'});await writeFile(evidence+'/english-cards-'+width+'-'+dark+'.json',JSON.stringify(samples,null,2));
  await f.page.evaluate(()=>document.documentElement.dataset.odysseyLocale='zh');await uiExpect(dialog.getByRole('tab',{name:'快速开始',exact:true})).toBeVisible();await dialog.locator('.odyssey-explore-pages button').first().click();expect(await chinese()).toEqual(before);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
