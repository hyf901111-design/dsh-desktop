import {expect,it} from 'vitest'
import {createExploreBrowserFixture} from './helpers/explore-menu-browser-fixture'

const ui=createExploreBrowserFixture(process.env.SHERLOCK_EXPLORE_EVIDENCE??'/tmp/sherlock-hosted-ai-ui')
const now=Math.floor(Date.now()/1000)
const quota={fiveHour:{limit:100,used:60,reserved:11,remaining:29,resetAt:now+7200},week:{limit:100,used:87,reserved:6,remaining:7,resetAt:now+90000},paused:false}
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
    const ring = await arc.evaluate((el: Element) => {
      const circle = el as SVGCircleElement
      const matrix = circle.getScreenCTM()!
      const { x, y } = new DOMPoint(circle.cx.baseVal.value, circle.cy.baseVal.value)
      const radius = circle.r.baseVal.value
      const center = new DOMPoint(x, y).matrixTransform(matrix)
      const start = new DOMPoint(x + radius, y).matrixTransform(matrix)
      const quarter = new DOMPoint(x, y + radius).matrixTransform(matrix)
      return { radius, startX: start.x - center.x, startY: start.y - center.y,
        quarterX: quarter.x - center.x, quarterY: quarter.y - center.y }
    })
    expect(ring.radius).toBe(13)
    expect(ring.startX).toBeCloseTo(0, 3)
    expect(ring.startY).toBeLessThan(-1)
    expect(ring.quarterX).toBeGreaterThan(0)
    expect(ring.quarterY).toBeCloseTo(0, 3)
    await trigger.screenshot({path:ui.evidence+'/explore-ring.png',scale:'device'})
    await page.mouse.move(300,150)
    await expect.poll(()=>arc.evaluate((el:Element)=>parseFloat(getComputedStyle(el).strokeDashoffset))).toBe(100)
    await ui.open(page)
    const wallpaperTab=page.getByRole('tab',{name:'主题壁纸',exact:true})
    const usageTab=page.getByRole('tab',{name:'管理用量',exact:true})
    expect(await usageTab.evaluate((el:Element)=>el.previousElementSibling?.textContent)).toBe('主题壁纸')
    await wallpaperTab.click()
    await wallpaperTab.press('ArrowRight')
    await ui.uiExpect(usageTab).toBeFocused()
    await ui.uiExpect(usageTab).toHaveAttribute('aria-selected','true')
    await ui.uiExpect(page.getByRole('meter',{name:/5 小时/})).toHaveAttribute('aria-valuenow','29')
    await ui.uiExpect(page.getByRole('meter',{name:/周用量/})).toHaveAttribute('aria-valuenow','7')
    const panel=page.getByRole('tabpanel',{name:'管理用量'})
    const plan=panel.getByText('Mini Trial Subscription',{exact:true})
    await ui.uiExpect(plan).toBeVisible()
    await ui.uiExpect(panel.getByText('当前订阅等级',{exact:true})).toBeVisible()
    const firstMeter=await page.getByRole('meter',{name:/5 小时/}).boundingBox()
    const planBox=await plan.boundingBox()
    expect(planBox!.y+planBox!.height).toBeLessThan(firstMeter!.y)
    await ui.uiExpect(panel.getByText(/AFP/)).toHaveCount(0)
    const typography=await panel.locator('.odyssey-explore-quota-balance strong').evaluateAll(async (numbers:Element[])=>{
      const families=numbers.map(node=>getComputedStyle(node).fontFamily.split(',')[0])
      const faces=await document.fonts.load('520 36px "EWork DIN Pro"','0123456789%')
      return {families,loaded:faces.some(face=>face.status==='loaded')}
    })
    expect(typography).toEqual({families:['"EWork DIN Pro"','"EWork DIN Pro"'],loaded:true})
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

it('refreshes the open usage panel and the ring after settlement and after an external change', async () => {
  const { page, close } = await ui.fixture({ quotaFixture: quota })
  try {
    await page.clock.install({ time: new Date() })
    const trigger = page.locator('[data-explore-trigger]')
    await ui.open(page)
    await page.getByRole('tab', { name: '管理用量' }).click()
    const fiveHour = page.getByRole('meter', { name: /5 小时/ })
    const week = page.getByRole('meter', { name: /周用量/ })
    await ui.uiExpect(fiveHour).toHaveAttribute('aria-valuenow', '29')
    const setBalance = (remaining: number, notify: boolean) => page.evaluate(({ remaining, notify }: { remaining: number; notify: boolean }) => {
      const testWindow = window as Window & { quotaFixture?: typeof quota }
      if (!testWindow.quotaFixture) throw new Error('Quota fixture missing')
      testWindow.quotaFixture.fiveHour.remaining = remaining
      testWindow.quotaFixture.week.remaining = remaining
      if (notify) window.dispatchEvent(new Event('sherlock:ai-quota-changed'))
    }, { remaining, notify })
    await setBalance(5, true)
    await ui.uiExpect(fiveHour).toHaveAttribute('aria-valuenow', '5', { timeout: 2000 })
    await ui.uiExpect(week).toHaveAttribute('aria-valuenow', '5')
    await ui.uiExpect(trigger).toHaveAttribute('title', '探索 · 5 小时剩余用量 5%')
    await setBalance(0, false)
    await page.clock.runFor(20_000)
    await ui.uiExpect(fiveHour).toHaveAttribute('aria-valuenow', '5')
    await page.clock.fastForward(60_000)
    await ui.uiExpect(fiveHour).toHaveAttribute('aria-valuenow', '0')
    await ui.uiExpect(week).toHaveAttribute('aria-valuenow', '0')
    await ui.uiExpect(trigger).toHaveAttribute('data-quota-empty', '')
  } finally { await close() }
}, 20000)
