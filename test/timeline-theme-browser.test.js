import { afterAll, beforeAll, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import { buildResearchHtmlPreview } from '../packages/dsh-research-task-runtime/html-artifact.js'
import { renderTimelineArtifact } from '../packages/dsh-research-task-runtime/timeline-artifact.js'
import { workbenchStylePalette } from '../packages/dsh-research-task-runtime/workbench-style.js'

let browser
beforeAll(async () => {
  const path = process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  const { chromium } = await import(/* @vite-ignore */pathToFileURL(path).href)
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'
  })
}, 30000)
afterAll(async () => browser?.close())

const legacy = '<style>@layer ework-workbench{body[data-sherlock-template="timeline"] .activity-row:not(:last-child)::before{content:"";background:#c1c6c8;width:1.5px} .activity-dot{display:block}}</style><body data-sherlock-template="timeline"><article class="activity-row"><img class="activity-dot" alt=""><span class="activity-title">第一条</span></article><article class="activity-row"><span class="activity-title">第二条</span></article></body>'
const current = renderTimelineArtifact({ version:1, type:'timeline', title:'动态', items:[{id:'a',title:'第一条',time:'2026-11-08T09:00:00Z'},{id:'b',title:'第二条',time:'2026-11-08T08:00:00Z'}] }).html
const rgb = hex => `rgb(${[1,3,5].map(index => parseInt(hex.slice(index,index+2),16)).join(', ')})`

it.each([['已保存卡片',legacy],['新卡片',current]])('%s的时间轴适配看板模式，普通标记使用中性色', async (_,html) => {
  const page = await browser.newPage()
  try {
    await page.setContent(buildResearchHtmlPreview(html,'动态','dark',{workbench:true,notoFont:'runtime'}))
    const frame = page.frameLocator('iframe')
    const row = frame.locator('.activity-row').first()
    for (const mode of ['dark','light','enterprise','openterminal']) {
      const palette = workbenchStylePalette(mode)
      await frame.locator('html').evaluate((el,value) => el.dataset.workbenchStyle=value,mode)
      const appearance = await row.evaluate(el => {
        const rail = getComputedStyle(el,'::before')
        const dot = getComputedStyle(el,'::after')
        const legacyDot = el.querySelector('img.activity-dot')
        return { rail:rail.backgroundColor, width:rail.width, dot:dot.backgroundColor, legacyDot:legacyDot && getComputedStyle(legacyDot).display }
      })
      expect(appearance.rail).toBe(rgb(palette['chart-grid']))
      expect(appearance.width).toBe('1px')
      expect(appearance.dot).toMatch(/^color\(srgb /u)
      expect(appearance.dot).not.toBe(rgb(palette['control-primary']))
      expect(appearance.legacyDot).toBe(html === legacy ? 'none' : null)
    }
    await row.evaluate(el => el.dataset.selected='true')
    expect(await row.evaluate(el => getComputedStyle(el,'::after').backgroundColor)).toBe(rgb(workbenchStylePalette('openterminal')['control-primary']))
    await expect.poll(() => frame.locator('.activity-row').count()).toBe(2)
  } finally { await page.close() }
}, 15000)
