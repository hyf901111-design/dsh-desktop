import {expect,it} from 'vitest'
import {writeFile} from 'node:fs/promises'
import {createExploreBrowserFixture} from './helpers/explore-menu-browser-fixture'

const {evidence,fixture,open,uiExpect}=createExploreBrowserFixture()

it.each([false,true])('follows the live client theme while the Explore account popover stays open, initially dark=%s',async initialDark=>{
 const f=await fixture({dark:initialDark});try{
  await open(f.page)
  const dialog=f.page.locator('dialog.odyssey-explore'),anchor=dialog.locator('.odyssey-explore-account')
  await anchor.click()
  const menu=dialog.getByRole('menu'),copy=menu.getByRole('menuitem',{name:'复制用户 ID',exact:true})
  await uiExpect(copy).toBeEnabled()
  const samples=[]
  for(const dark of [initialDark,!initialDark,initialDark]){
   await f.page.evaluate((dark:boolean)=>document.body.toggleAttribute('data-ds-dark-theme',dark),dark)
   await uiExpect(menu).toBeVisible()
   const material=await menu.evaluate((node:HTMLElement)=>{
    const css=getComputedStyle(node),row=node.querySelector<HTMLElement>('.odyssey-explore-account-id')!,icon=node.querySelector<SVGPathElement>('svg path')!,divider=node.querySelector<HTMLElement>('.odyssey-explore-account-divider')!,bounds=node.getBoundingClientRect()
    return{open:node.matches(':popover-open'),background:css.backgroundColor,color:css.color,border:css.borderColor,blur:css.backdropFilter,radius:css.borderRadius,width:bounds.width,height:bounds.height,muted:getComputedStyle(row).color,icon:getComputedStyle(icon).stroke,divider:getComputedStyle(divider,'::after').backgroundColor}
   })
   expect(material).toEqual({open:true,background:dark?'rgba(43, 43, 43, 0.68)':'rgba(255, 255, 255, 0.78)',color:dark?'rgb(229, 229, 229)':'rgb(37, 37, 37)',border:dark?'rgba(255, 255, 255, 0.1)':'rgba(0, 0, 0, 0.1)',blur:'blur(18px)',radius:'16px',width:224,height:88,muted:dark?'rgb(153, 153, 153)':'rgb(125, 125, 125)',icon:dark?'rgb(153, 153, 153)':'rgb(125, 125, 125)',divider:dark?'rgba(255, 255, 255, 0.1)':'rgba(0, 0, 0, 0.1)'})
   const logout=menu.getByRole('menuitem',{name:'退出登录',exact:true})
   await logout.hover()
   expect(await logout.evaluate((node:HTMLElement)=>getComputedStyle(node).backgroundColor)).toBe(dark?'rgba(255, 255, 255, 0.075)':'rgba(0, 0, 0, 0.055)')
   await copy.click();await uiExpect(menu).toContainText('已复制')
   const hint=menu.locator('.odyssey-explore-account-copy-feedback')
   expect(await hint.evaluate((node:HTMLElement)=>getComputedStyle(node).backgroundColor)).toBe(material.background)
   await menu.screenshot({path:evidence+`/account-live-theme-${initialDark}-${dark}.png`})
   samples.push({dark,...material})
  }
  await writeFile(evidence+`/account-live-theme-${initialDark}.json`,JSON.stringify(samples,null,2))
  await f.page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en')
  await uiExpect(menu.getByRole('menuitem',{name:'Copy user ID',exact:true})).toBeEnabled()
  await uiExpect(menu).toContainText('User ID: 1234567890')
  await dialog.click({position:{x:8,y:400}})
  await uiExpect(menu).not.toBeVisible();await uiExpect(dialog).toBeVisible()
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
