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
    const canvas = frame.locator('.canvas-slot .canvas')
    await canvas.waitFor()
    const bounds = await canvas.boundingBox()
    if (!bounds) throw new Error('Canvas has no bounds')
    const corner = { x: bounds.width - 19, y: bounds.height - 22 }
    const openContext = () => canvas.click({ button: 'right', position: corner })
    const context = frame.locator('.contextmenu')
    await openContext()
    await context.getByText('标尺', { exact: true }).click()
    const ruler = frame.locator('.ruler')
    for (const dark of [true, false, true]) {
      await page.evaluate((dark: boolean) => document.querySelector('iframe')!.contentWindow!.postMessage(
        { channel: 'odyssey-presentation', type: 'theme', dark }, location.origin), dark)
      const background = dark ? 'rgb(36, 36, 36)' : 'rgb(255, 255, 255)'
      await expect.poll(() => ruler.locator('.h').evaluate((el: Element) => getComputedStyle(el).backgroundColor)).toBe(background)
      expect(await ruler.locator('.v').evaluate((el: Element) => getComputedStyle(el).backgroundColor)).toBe(background)
      await openContext()
      await context.getByText('网格线', { exact: true }).hover()
      const submenu = context.locator('.sub-menu:visible').first()
      await submenu.waitFor()
      expect(await submenu.evaluate((el: Element) => getComputedStyle(el).backgroundColor)).toBe(background)
      expect(await context.locator('.menu-content').first().evaluate((el: Element) => getComputedStyle(el).backgroundColor)).toBe(background)
      if (dark) {
        expect(await ruler.locator('.h .ruler-marker-100').first().evaluate((el: Element) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(170, 170, 170)')
        expect(await context.locator('.sub-text').first().evaluate((el: Element) => getComputedStyle(el).color)).toBe('rgb(170, 170, 170)')
      }
      const boxes = await submenu.evaluate((el: Element) => {
        const root = el.closest('.contextmenu')!.getBoundingClientRect()
        const sub = el.getBoundingClientRect()
        return { margins: [root, sub].flatMap(r => [r.left, r.top, innerWidth - r.right, innerHeight - r.bottom]),
          flipped: sub.right <= root.left + 3 }
      })
      expect(Math.min(...boxes.margins)).toBeGreaterThanOrEqual(0)
      expect(boxes.flipped).toBe(true)
      const size = dark ? '大' : '小'
      await submenu.getByText(size, { exact: true }).click()
      await context.waitFor({ state: 'hidden' })
      await canvas.click({ button: 'right', position: { x: 20, y: 20 } })
      await context.getByText('网格线', { exact: true }).hover()
      const leftSub = context.locator('.sub-menu:visible').first()
      expect(await leftSub.evaluate((el: Element) => {
        const root = el.closest('.contextmenu')!.getBoundingClientRect()
        const child = el.getBoundingClientRect()
        return child.left >= root.right - 3 && child.right <= innerWidth && child.bottom <= innerHeight
      })).toBe(true)
      expect(await leftSub.getByText(size, { exact: true }).locator('..').innerText()).toContain('√')
      await leftSub.getByText(size, { exact: true }).click()
      await context.waitFor({ state: 'hidden' })
      if (!dark) {
        await page.setViewportSize({ width: 1080, height: 200 })
        await canvas.click({ button: 'right', position: { x: 18, y: 8 } })
        await context.getByText('网格线', { exact: true }).hover()
        const fitsShortEditor = await submenu.evaluate((el: Element) => {
          const child = el.getBoundingClientRect()
          const row = el.closest('li')!.getBoundingClientRect()
          return child.top < row.top - 6 && child.bottom <= innerHeight - 4
        })
        expect(fitsShortEditor).toBe(true)
        await submenu.getByText('大', { exact: true }).click()
        await context.waitFor({ state: 'hidden' })
        await page.setViewportSize({ width: 1080, height: 650 })
      }
    }
    await openContext()
    await context.getByText('标尺', { exact: true }).click()
    await ruler.waitFor({ state: 'hidden' })
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
          background: getComputedStyle(el).backgroundColor,
          track: getComputedStyle(el,'::-webkit-scrollbar-track').backgroundColor }
      })
      expect(Math.min(state.left, state.top, state.right, state.bottom)).toBeGreaterThanOrEqual(0)
      expect(state.track).toBe(dark ? 'rgb(36, 36, 36)' : 'rgb(241, 241, 241)')
      expect(state.overflow).toBeLessThanOrEqual(1)
      expect(state.rootOverflow).toBe(0)
      expect(state.background).toBe(dark ? 'rgb(36, 36, 36)' : 'rgb(245, 245, 245)')
    }
    const pool = async (label: string, dark = true) => {
      await entry('插入')
      await frame.locator('[data-tool-menu=insert]').getByRole('button', { name: label, exact: true }).click()
      await inside('.toolbar-popup',dark)
      if (label === '形状') {
        const scroller = frame.locator('.shape-pool')
        await page.mouse.move(2,2)
        const parts=await scroller.evaluate((el: HTMLElement) => ({
          track:getComputedStyle(el,'::-webkit-scrollbar-track').backgroundColor,
          thumb:getComputedStyle(el,'::-webkit-scrollbar-thumb').backgroundColor,
          width:getComputedStyle(el,'::-webkit-scrollbar').width,
          available:el.scrollHeight-el.clientHeight,
        }))
        expect(parts).toMatchObject(dark?{track:'rgb(36, 36, 36)',thumb:'rgb(75, 75, 75)',width:'6px'}:
          {track:'rgb(241, 241, 241)',thumb:'rgb(184, 184, 184)',width:'6px'})
        expect(parts.available).toBeGreaterThan(0)
        await scroller.hover()
        await page.mouse.wheel(0,160)
        await expect.poll(() => scroller.evaluate((el: HTMLElement) => el.scrollTop)).toBeGreaterThan(0)
        await scroller.evaluate((el: HTMLElement) => el.scrollTop = 0)
      } else {
        const panel = frame.locator(label === '表格' ? '.table-generator' : '.chart-pool')
        const emptyGutter = await panel.evaluate((el: HTMLElement) => ({
          overflow: el.scrollHeight - el.clientHeight,
          width: el.offsetWidth - el.clientWidth,
        }))
        expect(emptyGutter).toEqual({overflow:0,width:0})
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
    await pool('形状',false)
    expect(errors).toEqual([])
  } finally {
    await browser.close()
  }
}, 30000)
