import {expect,it} from 'vitest'
import {writeFile} from 'node:fs/promises'
import {createExploreBrowserFixture} from './helpers/explore-menu-browser-fixture'
const {evidence,fixture,open,uiExpect}=createExploreBrowserFixture('/tmp/odyssey-history-edit-board-fill/wallpapers')
it.each([[1600,1000],[850,700]])('keeps the random card first and changes entire wallpaper pages with wheel, anchors and keyboard (%sx%s)',async(width,height)=>{
 const f=await fixture({width,height,dark:true});try{
  await f.page.emulateMedia({reducedMotion:'no-preference'});await open(f.page);await f.page.getByRole('tab',{name:'主题壁纸',exact:true}).click()
  const random=f.page.getByRole('button',{name:'随机壁纸',exact:true}),second=f.page.getByRole('button',{name:'主题第 2 页',exact:true}),first=f.page.getByRole('button',{name:'主题第 1 页',exact:true})
  await uiExpect(random).toBeVisible();expect(await f.page.locator('[data-paged] [data-home-theme-id]').first().getAttribute('data-home-theme-id')).toBe('random')
  await random.click();await uiExpect(random).toHaveAttribute('aria-pressed','true');expect(await f.page.evaluate(()=>(window as any).fixture.selected())).toBe('random')
  const header=await f.page.locator('.odyssey-explore-header').boundingBox(),nav=await f.page.locator('.odyssey-explore-navigation').boundingBox()
  await expect.poll(()=>random.evaluate((node:HTMLElement)=>getComputedStyle(node.querySelector('.odyssey-wallpaper-preview')!,'::after').opacity)).toBe('1')
  const visual=await random.evaluate((node:HTMLElement)=>{const preview=node.querySelector('.odyssey-wallpaper-preview')!,icon=node.querySelector('.odyssey-wallpaper-random-icon')!,disc=node.querySelector('.odyssey-wallpaper-random-disc')!,p=preview.getBoundingClientRect(),i=icon.getBoundingClientRect(),d=disc.getBoundingClientRect();return {selected:node.getAttribute('aria-pressed'),center:[p.x+p.width/2,p.y+p.height/2],icon:[i.x+i.width/2,i.y+i.height/2,i.width,i.height],disc:[d.x+d.width/2,d.y+d.height/2,d.width,d.height],translate:getComputedStyle(icon).translate,tiles:[...node.querySelectorAll<HTMLImageElement>('[data-mosaic-theme]')].map(img=>({loaded:img.complete&&img.naturalWidth>0,width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height}))}})
  await writeFile(evidence+'/visual-'+width+'.json',JSON.stringify(visual,null,2));expect(visual.icon[0]).toBeCloseTo(visual.center[0],0);expect(visual.icon[1]).toBeCloseTo(visual.center[1],0);expect(visual.tiles.every((tile:{loaded:boolean})=>tile.loaded)).toBe(true)
  await f.page.screenshot({path:evidence+'/random-first-'+width+'.png'})
  await random.hover();await f.page.mouse.wheel(0,100);await uiExpect(second).toHaveAttribute('aria-current','page')
  await uiExpect(f.page.getByRole('button',{name:'锦鲤浮光',exact:true})).toBeVisible();await expect.poll(async()=>Math.round((await f.page.getByRole('button',{name:'锦鲤浮光',exact:true}).boundingBox()).y)).toBe(Math.round((await f.page.locator('.odyssey-wallpaper-viewport').boundingBox()).y));await uiExpect(random).not.toBeVisible()
  expect(await f.page.locator('.odyssey-explore-header').boundingBox()).toEqual(header);expect(await f.page.locator('.odyssey-explore-navigation').boundingBox()).toEqual(nav)
  await f.page.screenshot({path:evidence+'/second-'+width+'.png'})
  await f.page.waitForTimeout(550);await f.page.getByRole('button',{name:'锦鲤浮光',exact:true}).hover();await f.page.mouse.wheel(0,-100);await uiExpect(first).toHaveAttribute('aria-current','page');await second.click();
  await first.click();await uiExpect(random).toBeVisible();await random.focus();await random.press('End');await uiExpect(second).toHaveAttribute('aria-current','page');await f.page.keyboard.press('Home');await uiExpect(first).toHaveAttribute('aria-current','page')
  await f.page.getByRole('button',{name:'星云风暴',exact:true}).click();expect(await f.page.evaluate(()=>(window as any).fixture.selected())).toBe('shashidhar');expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)
