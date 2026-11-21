import { pathToFileURL } from 'node:url'
import { it, expect } from 'vitest'
import { handleEditorAsset } from '../src/main/presentation/protocol'
import { blankDeck } from '../src/main/presentation/store'

it('keeps toolbar pickers in the iframe and applies pointer and keyboard selections to the document', async () => {
  const pw = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright')
  const browser = await pw.chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 650 }, reducedMotion: 'reduce' })
    page.setDefaultTimeout(4000)
    const errors: string[] = []
    page.on('pageerror', (error: Error) => errors.push(error.message))
    const deck = blankDeck('经营复盘')
    deck.slides[0]!.elements = [{ type: 'text', id: 'headline', left: 62, top: 70, width: 450,
      height: 70, rotate: 0, content: '<p>渠道经营复盘</p>', defaultFontName: 'Arial', defaultColor: '#334455' }]
    await page.route('http://localhost/**', async (route: any) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<body style="margin:0"></body>' })
      const asset = await handleEditorAsset(process.cwd(), new Request('odyssey-presentation://editor' + path))
      await route.fulfill({ status: asset.status, headers: Object.fromEntries(asset.headers), body: Buffer.from(await asset.arrayBuffer()) })
    })
    await page.goto('http://localhost/')
    await page.evaluate((deck: any) => {
      const editor = document.createElement('iframe')
      editor.style.cssText = 'width:100vw;height:100vh;border:0;display:block'
      window.addEventListener('message', (event) => {
        const data = event.data
        if (event.source !== editor.contentWindow || data?.channel !== 'odyssey-presentation') return
        if (data.type === 'ready') editor.contentWindow!.postMessage({ channel: data.channel, type: 'load',
          record: { deck, revision: 1 }, editable: true, dark: true }, location.origin)
        if (data.type === 'save') document.body.dataset.deck = JSON.stringify(data.deck)
      })
      document.body.dataset.deck = JSON.stringify(deck)
      editor.src = '/index.html?host=' + encodeURIComponent(location.origin)
      document.body.append(editor)
    }, deck)
    const frame = page.frameLocator('iframe')
    const saved = async () => JSON.parse(await page.locator('body').getAttribute('data-deck'))
    const element = async (id: string) => (await saved()).slides[0].elements.find((e: any) => e.id === id)
    const entry = async (label: string) => {
      const visible = frame.locator('.ribbon').getByRole('button', { name: label, exact: true })
      if (await visible.isVisible()) return visible.click()
      await frame.getByRole('button', { name: '更多工具' }).click()
      await frame.locator('[data-ribbon-command="' + label + '"]').click()
    }
    const inside = async (selector: string, dark = true) => {
      const state = await frame.locator(selector).evaluate((el: HTMLElement) => {
        const rect = el.getBoundingClientRect()
        return { left: rect.left, top: rect.top, right: innerWidth - rect.right, bottom: innerHeight - rect.bottom,
          overflow: el.scrollWidth - el.clientWidth, rootOverflow: document.documentElement.scrollWidth - innerWidth,
          background: getComputedStyle(el).backgroundColor }
      })
      expect(Math.min(state.left, state.top, state.right, state.bottom)).toBeGreaterThanOrEqual(0)
      expect(state.overflow).toBeLessThanOrEqual(1)
      expect(state.rootOverflow).toBe(0)
      expect(state.background).toBe(dark ? 'rgb(36, 36, 36)' : 'rgb(245, 245, 245)')
    }
    const pool = async (label: string) => {
      await entry('插入')
      await frame.locator('[data-tool-menu=insert]').getByRole('button', { name: label, exact: true }).click()
      await inside('.toolbar-popup')
      if (label === '形状') {
        const scroller = frame.locator('.shape-pool')
        expect(await scroller.evaluate(el => getComputedStyle(el).scrollbarWidth)).toBe('none')
        await scroller.evaluate(el => el.scrollTop = el.scrollHeight)
        expect(await scroller.evaluate(el => el.scrollHeight <= el.clientHeight || el.scrollTop > 0)).toBe(true)
        await scroller.evaluate(el => el.scrollTop = 0)
      }
      expect(await frame.locator('.toolbar-popup').evaluate((el: HTMLElement) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1)
    }
    const button = (name: string) => frame.getByRole('button', { name, exact: true })
    const option = (name: string) => frame.getByRole('option', { name, exact: true })
    await frame.locator('.slide-area .viewport [data-pptx-node-id=headline] .element-content').click()
    expect(await frame.locator('.ribbon select, .selection-format select').count()).toBe(0)
    await entry('字号')
    await inside('.deck-choice-list')
    await option('32').click()
    await expect.poll(async () => (await element('headline')).content).toContain('32px')
    await entry('字体')
    await option('宋体').click()
    await expect.poll(async () => (await element('headline')).content).toContain('宋体')
    await button('描边粗细').click()
    await option('3 px').click()
    await expect.poll(async () => (await element('headline')).outline?.width).toBe(3)
    await button('描边线型').focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await element('headline')).outline?.style).toBe('dotted')
    expect(await button('描边线型').evaluate((el: HTMLElement) => el.matches(':focus-visible') && getComputedStyle(el).outlineWidth === '1px')).toBe(true)
    await button('描边线型').press('ArrowDown')
    await page.keyboard.press('Escape')
    expect(await frame.getByRole('listbox').count()).toBe(0)
    await button('填充颜色').click()
    await frame.locator('.format-swatches button[title="#C00000"]').click()
    await expect.poll(async () => (await element('headline')).fill).toBe('#C00000')
    expect(await button('填充颜色').evaluate((el: HTMLElement) => getComputedStyle(el).outlineStyle)).toBe('none')
    await entry('对象样式')
    await inside('.style-popover')
    const styleSelect = frame.locator('.style-popover .select:visible').first()
    await styleSelect.click()
    await inside('.tippy-box[data-theme~="popover"] .popover-content:visible')
    await frame.locator('.tippy-box .option:visible').first().click()
    await button('关闭样式').click()
    for (const label of ['文本框', '直线', '箭头', '图片…']) {
      await entry('插入')
      const action = frame.locator('[data-tool-menu=insert]').getByRole('button', { name: label, exact: true })
      if (label === '图片…') {
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), action.click()])
        await chooser.setFiles({name: '图标.png', mimeType: 'image/png',
          buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WMp5YQAAAAASUVORK5CYII=', 'base64')})
      } else await action.click()
    }
    await expect.poll(async () => (await saved()).slides[0].elements.map((e: any) => e.type)).toEqual(['text','text','line','line','image'])
    for (const width of [1080, 520]) {
      await page.setViewportSize({ width, height: 650 })
      await pool('形状')
      await frame.locator('.shape-pool [role=button]').first().press('Enter')
      await pool('图表…')
      await frame.locator('.chart-pool [role=button]').first().click()
      await pool('表格')
      const grid = frame.locator('.table-generator table')
      await page.mouse.move(2, 2)
      await grid.focus()
      await grid.press('ArrowDown')
      await grid.press('ArrowRight')
      await grid.press('Enter')
      const last = async (type: string) => (await saved()).slides[0].elements.filter((e: any) => e.type === type)
      for (const type of ['table', 'shape', 'chart']) await expect.poll(async () => (await last(type)).length).toBe(width === 1080 ? 1 : 2)
      expect((await last('table')).at(-1).data.map((row: any) => row.length)).toEqual([2, 2])
    }
    await entry('版式')
    await inside('.layout-menu')
    await button('版式库').click()
    await inside('.deck-choice-list')
    await option('易方达经典母版').click()
    await button('应用方式').click()
    await option('新建幻灯片').click()
    const layout = frame.locator('.layout-grid button').first()
    const layoutId = await layout.getAttribute('data-layout-id')
    await layout.click()
    await expect.poll(async () => (await saved()).slides[1]?.odysseyLayoutId).toBe(layoutId)
    await page.evaluate(() => document.querySelector('iframe')!.contentWindow!.postMessage(
      { channel: 'odyssey-presentation', type: 'theme', dark: false }, location.origin))
    await entry('字号')
    await inside('.deck-choice-list', false)
    await page.keyboard.press('Tab')
    expect(await frame.getByRole('listbox').count()).toBe(0)
    expect(errors).toEqual([])
  } finally {
    await browser.close()
  }
}, 30000)
