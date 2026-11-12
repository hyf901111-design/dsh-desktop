import {expect,it} from 'vitest'
import {createExploreBrowserFixture} from './helpers/explore-menu-browser-fixture'

const ui=createExploreBrowserFixture(process.env.SHERLOCK_EXPLORE_EVIDENCE??'/tmp/sherlock-hosted-ai-ui')
const now=Math.floor(Date.now()/1000)
const quota={fiveHour:{limit:100,remaining:29,resetAt:now+7200},week:{limit:100,remaining:7,resetAt:now+90000},paused:false}
it('renders the account quota, grows the hover arc, and clears it at sign-out',async()=>{
  const {page,close}=await ui.fixture({quotaFixture:quota,reduced:false,collapsed:true})
  try {
    const trigger=page.locator('[data-explore-trigger]')
    const arc=trigger.locator('.odyssey-quota-value')
    await ui.uiExpect(trigger).toHaveAttribute('data-quota-available','')
    await ui.uiExpect(trigger).toHaveAttribute('title','探索 · 5 小时剩余用量 29%')
    expect(await arc.evaluate((el:Element)=>parseFloat(getComputedStyle(el).strokeDashoffset))).toBe(100)
    await trigger.hover()
    await expect.poll(()=>arc.evaluate((el:Element)=>parseFloat(getComputedStyle(el).strokeDashoffset))).toBe(71)
    await trigger.screenshot({path:ui.evidence+'/explore-ring.png',scale:'device'})
    await page.mouse.move(300,150)
    await expect.poll(()=>arc.evaluate((el:Element)=>parseFloat(getComputedStyle(el).strokeDashoffset))).toBe(100)
    await ui.open(page)
    await page.getByRole('tab',{name:'管理用量'}).click()
    await ui.uiExpect(page.getByRole('meter',{name:/5 小时/})).toHaveAttribute('aria-valuenow','29')
    await ui.uiExpect(page.getByRole('meter',{name:/周用量/})).toHaveAttribute('aria-valuenow','7')
    await page.screenshot({path:ui.evidence+'/explore-usage.png'})
    await page.locator('.odyssey-explore-account').click()
    await page.getByRole('menuitem',{name:'退出登录'}).click()
    await ui.uiExpect(trigger).not.toHaveAttribute('data-quota-available','')
    await ui.open(page)
    await ui.uiExpect(page.getByRole('tab',{name:'管理用量'})).toHaveCount(0)
  } finally { await close() }
},35000)
it('uses the final ring size immediately when reduced motion is enabled',async()=>{
  const {page,close}=await ui.fixture({quotaFixture:{...quota,fiveHour:{...quota.fiveHour,remaining:7}},reduced:true})
  try {
    const trigger=page.locator('[data-explore-trigger]')
    await ui.uiExpect(trigger).toHaveAttribute('data-quota-low','')
    await trigger.hover()
    expect(await trigger.locator('.odyssey-quota-value').evaluate((el:Element)=>({
      offset:parseFloat(getComputedStyle(el).strokeDashoffset),stroke:getComputedStyle(el).stroke
    }))).toEqual({offset:93,stroke:'rgb(245, 118, 126)'})
  } finally { await close() }
},20000)
