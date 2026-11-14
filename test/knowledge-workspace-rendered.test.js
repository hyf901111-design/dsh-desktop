import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

let browser
let bundle

beforeAll(async () => {
  const playwright = process.env.PLAYWRIGHT_MODULE_PATH
    ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href) : await import('playwright')
  browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
  const output = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      import { WorkspaceSurfaceHost } from './src/preload/workspace-surface-host'
      import { mountKnowledgeWorkspace } from './src/preload/knowledge/workspace'
      import { mountKnowledgePanels } from './src/preload/knowledge/panel'
      const host = new WorkspaceSurfaceHost(document)
      const moreFormats = document.body.hasAttribute('data-test-formats')
        ? ['pdf', 'docx', 'xlsx', 'png', 'mp3', 'mp4', 'bin'].map((suffix, index) => ({
          id: 'f' + index, name: '格式验收.' + suffix, source: 'upload'
        })) : []
      const documents = [
        ...moreFormats,
        { id: 'a', name: '消费行业周报.md', source: 'generated', saved: true },
        { id: 'b', name: '研究写作规范.md', source: 'upload', folderId: 'f', size: 4096 },
        { id: 'c', name: '演示文稿.pptx', source: 'upload', folderId: 'f', size: 16384, updatedAt: 1762080000000 }
      ].map(row => ({ size: 8192, updatedAt: 1761993600000, starred: false, saved: false, ...row }))
      window.data = { documents, folders: [{ id: 'f', name: '研究资料' }] }
      window.markdown = { text: '# 研究写作规范', revision: 'first' }
      mountKnowledgePanels(document, {
        snapshot: async () => structuredClone(window.data),
        preview: async id => ({ document: documents.find(row => row.id === id), text: window.markdown.text }),
        markdown: async () => ({ ...window.markdown }),
        saveMarkdown: async (id, revision, text) => {
          if (revision !== window.markdown.revision) throw Error('文件已被修改')
          window.markdown = { text, revision: 'saved' }
          return { document: documents.find(row => row.id === id), revision: 'saved' }
        },
        received: async () => [
          { id: 'r1', name: '共享行业资料.pdf', source: 'upload', size: 1024, updatedAt: 1,
            starred: false, saved: false, received: { owner: '共享人', category: '行业研究' } },
          { id: 'r2', name: '共享数据表.xlsx', source: 'upload', size: 8192, updatedAt: 2,
            starred: false, saved: false, received: { owner: '共享人', category: '数据分析' } }
        ]
      })
      const uploads = new Map()
      window.addEventListener('sherlock:workspace-surface-change', () => {})
      window.finishImport = (name, error) => {
        const entry = [...uploads.values()].find(upload => upload.name === name)
        if (!entry) throw Error('missing upload '+name)
        uploads.delete(entry.id)
        if (error) { entry.reject(Error(error)); return }
        const document = { id: entry.id, name, folderId: entry.folderId, source: 'upload',
          size: 16384, updatedAt: Date.now(), saved: false, starred: false }
        window.data.documents.push(document)
        entry.resolve(document)
      }
      mountKnowledgeWorkspace(document, host, {
        async request(method, args) {
          if (method === 'snapshot') return structuredClone(window.data)
          if (method === 'pick') return ['/tmp/上传成功.md', '/tmp/上传取消.pdf']
          if (method === 'import-file') {
            const name = args.path.split('/').at(-1)
            queueMicrotask(() => window.emitImportProgress({ id: args.transferId, copied: 8192, total: 16384 }))
            return new Promise((resolve, reject) => uploads.set(args.transferId, {
              resolve, reject, id: args.transferId, name, folderId: args.folderId
            }))
          }
          if (method === 'cancel-import') {
            const entry = uploads.get(args.transferId)
            uploads.delete(args.transferId)
            entry?.reject(Error('cancelled'))
            return
          }
          if (method === 'received') return [
            { id: 'shared-layout', name: '渠道调研验收.md', source: 'upload', size: 1024, updatedAt: 1,
              starred: false, saved: false, received: { owner: '验收所有者', category: '行业研究' } }
          ]
          if (method === 'preview') return { document: documents.find(d => d.id === args.id), text: '# 研究写作规范' }
          throw new Error('Unexpected bridge method '+method)
        },
        subscribe: () => () => {},
        subscribeImportProgress(listener) { window.emitImportProgress = listener; return () => {} },
        subscribeAction(listener) { window.applyKnowledgeAction = listener; return () => {} },
        reply(response) { window.knowledgeActionResult = response },
        path: () => ''
      })
      window.dispatchEvent(new Event('sherlock:knowledge-open'))
    ` },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    plugins: [{ name: 'inline-design-assets', setup(builder) {
      builder.onResolve({ filter: /\?(inline|raw)$/ }, async args => {
        const resolved = await builder.resolve(args.path.split('?')[0], { resolveDir: args.resolveDir, kind: args.kind })
        return { path: resolved.path, namespace: 'inline-design-assets' }
      })
      builder.onLoad({ filter: /.*/, namespace: 'inline-design-assets' }, async args => {
        const source = await readFile(args.path, 'utf8')
        const content = args.path.endsWith('.svg') ? 'data:image/svg+xml,' + encodeURIComponent(source) : source
        return { contents: JSON.stringify(content), loader: 'json' }
      })
    } }]
  })
  bundle = output.outputFiles[0].text
}, 20_000)

afterAll(async () => { await browser?.close() })

it('preserves filters through return and leaves space around the selected row', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    page.setDefaultTimeout(2500)
    await page.setContent(`
      <body data-ds-dark-theme>
        <aside data-dsh-sidebar-root style="position:fixed;inset:10px auto 10px 10px;width:230px"></aside>
        <div class="pI_x6G_centerCol" style="position:fixed;inset:10px 10px 10px 250px"></div>
      </body>`)
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库' })
    await library.getByRole('navigation', { name: '知识库分类' }).getByRole('button', { name: /研究资料/ }).click()
    await library.getByRole('button', { name: '筛选', exact: true }).click()
    await page.getByLabel('Markdown').check()
    await page.getByRole('button', { name: '完成' }).click()
    await expect.poll(() => page.getByRole('row').count()).toBe(2)
    await library.getByRole('button', { name: '研究写作规范.md', exact: false }).first().click()
    await expect.poll(() => library.getByRole('complementary', { name: '文件预览' }).textContent()).toContain('研究写作规范')
    const lines = await library.locator('.knowledge-navigation, .knowledge-body').evaluateAll(nodes =>
      nodes.map(node => node.getBoundingClientRect().bottom))
    expect(lines[0] - lines[1]).toBe(16)
    const selected = await library.locator('tr[data-selected=true] td').first().evaluate(el => getComputedStyle(el).borderTopWidth)
    expect(selected).toBe('6px')
    await library.getByRole('button', { name: '返回工作区' }).click()
    await expect.poll(() => library.isVisible()).toBe(false)
    await page.evaluate(() => window.dispatchEvent(new Event('sherlock:knowledge-open')))
    await expect.poll(() => library.getByText('找到 1 个文件').isVisible()).toBe(true)
    if (process.env.KNOWLEDGE_QA_SCREENSHOT) await page.screenshot({ path: process.env.KNOWLEDGE_QA_SCREENSHOT })
  } finally {
    await page.close()
  }
})

it('edits a Markdown preview and preserves a draft on revision conflicts', async () => {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    page.setDefaultTimeout(2500)
    await page.setContent('<aside data-knowledge-panel-host data-knowledge-panel-file="b" style="width:380px;height:720px"></aside>')
    await page.addScriptTag({ content: bundle })
    const pane = page.getByRole('region', { name: '知识库文件预览' })
    await pane.getByRole('button', { name: '编辑', exact: true }).click()
    await pane.getByRole('textbox', { name: 'Markdown 正文' }).fill('# 已保存正文')
    await pane.getByRole('button', { name: '保存' }).click()
    await pane.getByRole('heading', { name: '已保存正文' }).waitFor()
    await pane.getByRole('button', { name: '编辑', exact: true }).click()
    await pane.getByRole('textbox', { name: 'Markdown 正文' }).fill('# 保留用户草稿')
    await page.evaluate(() => { window.markdown.revision = 'newer' })
    await pane.getByRole('button', { name: '保存' }).click()
    await expect.poll(() => pane.getByRole('alert').textContent()).toContain('文件已被修改')
    expect(await pane.getByRole('textbox', { name: 'Markdown 正文' }).inputValue()).toBe('# 保留用户草稿')
  } finally { await page.close() }
})

it('preserves PDF filtering when drilling into shared files, going back and browsing local folders', async () => {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, reducedMotion: 'no-preference' })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    page.setDefaultTimeout(2500)
    await page.setContent('<aside data-knowledge-panel-host style="width:340px;height:720px"></aside>')
    await page.addScriptTag({ content: bundle })
    const pane = page.getByRole('region', { name: '知识库资料' })
    await pane.getByRole('button', { name: '所有文件', exact: true }).click()
    expect(await pane.locator('.knowledge-panel-menu').evaluate(el => {
      const css = getComputedStyle(el)
      return [css.animationName, css.animationDuration]
    })).toEqual(['knowledge-popup-in', '0.12s'])
    await pane.getByRole('button', { name: '他人共享', exact: true }).click()
    await pane.getByRole('button', { name: /数据分析/ }).waitFor()
    await pane.getByRole('button', { name: '筛选', exact: true }).click()
    await pane.getByRole('checkbox', { name: 'PDF', exact: true }).check()
    await pane.getByRole('button', { name: '完成' }).click()
    await expect.poll(() => pane.getByRole('button', { name: /数据分析/ }).count()).toBe(0)
    await pane.getByRole('button', { name: /行业研究/ }).click()
    const file = pane.getByRole('button', { name: /共享行业资料.pdf 共享人/ })
    await file.waitFor()
    await page.mouse.move(1050, 750)
    await expect.poll(() => pane.locator('.knowledge-panel-action small').evaluate(el => getComputedStyle(el).opacity)).toBe('1')
    await file.hover()
    await expect.poll(() => pane.getByRole('button', { name: '引用文件 共享行业资料.pdf' }).evaluate(el => getComputedStyle(el).opacity)).toBe('1')
    await pane.getByRole('button', { name: '返回上级' }).click()
    await pane.getByRole('button', { name: /行业研究/ }).waitFor()
    await pane.getByRole('button', { name: '他人共享', exact: true }).click()
    await pane.getByRole('button', { name: '研究资料', exact: true }).click()
    await expect.poll(() => pane.getByText('暂无符合条件的文件。').isVisible()).toBe(true)
    await pane.getByRole('button', { name: /筛选/ }).click()
    await pane.getByRole('button', { name: '重置' }).click()
    await pane.getByRole('button', { name: '完成' }).click()
    await pane.getByRole('button', { name: /研究写作规范.md/ }).first().waitFor()
  } finally {
    await page.close()
  }
})

it('applies revision-checked commands to the live list and makes them reversible', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    page.setDefaultTimeout(2500)
    await page.setContent('<div class="pI_x6G_centerCol" style="position:fixed;inset:10px 10px 10px 250px"></div>')
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库' })
    await library.getByRole('button', { name: '消费行业周报.md', exact: false }).first().waitFor()
    const act = request => page.evaluate(request => {
      window.applyKnowledgeAction({ id: crypto.randomUUID(), ...request })
      return window.knowledgeActionResult
    }, request)
    const { result } = await act({ action: 'inspect' })
    const applied = await act({
      action: 'filter', revision: result.revision, filter: { folderId: 'f', sources: ['upload'], formats: ['markdown'] }
    })
    expect(applied.result.filter).toEqual({ folderId: 'f', sources: ['upload'], formats: ['markdown'] })
    await expect.poll(() => library.getByText('找到 1 个文件').isVisible()).toBe(true)
    expect((await act({ action: 'filter', revision: result.revision, filter: {} })).error).toContain('筛选条件已变化')
    await library.getByRole('button', { name: '撤销', exact: true }).click()
    await expect.poll(() => library.getByRole('row').count()).toBe(4)
    const scoped = await act({ action: 'filter', revision: (await act({ action: 'inspect' })).result.revision,
      filter: { folderId: 'f' } })
    const sorted = await act({ action: 'filter', revision: scoped.result.revision,
      filter: { ...scoped.result.filter, sort: 'size', ascending: true } })
    expect(sorted.result.filter).toEqual({ folderId: 'f', sort: 'size', ascending: true })
    await expect.poll(() => library.locator('tbody tr').first().textContent()).toContain('研究写作规范.md')
    await library.getByRole('button', { name: '撤销', exact: true }).click()
    await expect.poll(() => library.getByText('找到 2 个文件').isVisible()).toBe(true)
    await expect.poll(() => library.locator('tbody tr').first().textContent()).toContain('演示文稿.pptx')
    expect((await act({ action: 'inspect' })).result.filter).toEqual({ folderId: 'f' })
    await library.getByRole('button', { name: '返回工作区' }).click()
    expect((await act({ action: 'inspect' })).error).toContain('请先回到知识库')
  } finally {
    await page.close()
  }
})

it.each(['light', 'dark'])('keeps file icons readable and controls stable in %s mode', async (theme) => {
  const page = await browser.newPage({ viewport: { width: 1380, height: 960 }, reducedMotion: 'reduce' })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent(`
      <body data-test-formats ${theme === 'dark' ? 'data-ds-dark-theme' : ''}>
        <div class="pI_x6G_centerCol" style="position:fixed;inset:10px 380px 10px 120px"></div>
        <aside data-knowledge-panel-host style="position:fixed;inset:10px 0 10px auto;width:370px;
          background:${theme === 'dark' ? '#262626' : '#fff'};
          --dsw-alias-interactive-bg-hover:${theme === 'dark' ? '#333' : '#f2f2f3'}"></aside>
      </body>`)
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    const pane = page.getByRole('region', { name: '知识库资料' })
    const tileStyles = library.locator('tbody .knowledge-file-icon')
    await expect.poll(() => tileStyles.count()).toBe(10)
    const styles = await tileStyles.evaluateAll(tiles => tiles.map(tile => {
      const svg = tile.querySelector('svg')
      return {
        format: tile.dataset.format, color: getComputedStyle(tile).color,
        viewBox: svg.getAttribute('viewBox'), stroke: svg.getAttribute('stroke-width'),
        page: svg.firstElementChild.getAttribute('d')
      }
    }))
    expect(new Set(styles.map(style => style.color)).size).toBe(9)
    for (const style of styles) {
      expect(style.viewBox).toBe('0 0 24 24')
      expect(style.stroke).toBe('1.7')
      expect(style.page).toBe(styles[0].page)
    }
    const filter = library.getByRole('button', { name: '筛选', exact: true })
    await filter.click()
    expect(await library.locator('.knowledge-filter-menu').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
    await library.getByRole('checkbox', { name: 'Markdown', exact: true }).check()
    await library.getByRole('button', { name: '完成' }).click()
    expect(await filter.evaluate(button => {
      const css = getComputedStyle(button)
      return { shadow: css.boxShadow, left: css.paddingLeft, right: css.paddingRight, motion: css.transitionDuration, count: button.lastElementChild.textContent }
    })).toEqual({ shadow: 'none', left: '11px', right: '11px', motion: '0s', count: '1' })
    const file = library.getByRole('button', { name: /研究写作规范.md/ }).first()
    const appearance = async () => file.evaluate(el => {
      const tile = el.querySelector('.knowledge-file-icon')
      const luminance = css => css.match(/[\d.]+/g).slice(0, 3).map(Number)
        .map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0)
      const ink = luminance(getComputedStyle(tile).color)
      const background = luminance(getComputedStyle(tile).backgroundColor)
      return {
        foreground: getComputedStyle(tile).color,
        contrast: (Math.max(ink, background) + .05) / (Math.min(ink, background) + .05),
        row: getComputedStyle(el.closest('td')).backgroundColor,
        tile: getComputedStyle(tile).backgroundColor,
        geometry: [tile.offsetWidth, tile.offsetHeight],
        stroke: tile.querySelector('svg').getAttribute('stroke-width')
      }
    })
    const normal = await appearance()
    await file.hover()
    const hover = await appearance()
    await file.click()
    await expect.poll(() => file.evaluate(el => el.closest('tr').dataset.selected)).toBe('true')
    await page.mouse.move(0, 0)
    const selected = await appearance()
    expect(new Set([normal.row, hover.row, selected.row]).size).toBe(3)
    expect(new Set([normal.tile, hover.tile, selected.tile]).size).toBe(3)
    for (const state of [normal, hover, selected]) {
      expect(state.foreground).toBe(normal.foreground)
      expect(state.contrast).toBeGreaterThan(4.5)
      expect(state.geometry).toEqual(normal.geometry)
      expect(state.stroke).toBe('1.7')
    }
    const sidebarFile = pane.getByRole('button', { name: /研究写作规范.md/ }).first()
    const size = pane.getByText('4 KB', { exact: true })
    await size.waitFor()
    const row = sidebarFile.locator('..')
    const before = await sidebarFile.boundingBox()
    await sidebarFile.hover()
    const reference = row.getByRole('button', { name: /引用文件/ })
    expect(await reference.evaluate(el => ({
      opacity: getComputedStyle(el).opacity,
      padding: getComputedStyle(el).paddingInline,
      label: el.textContent
    }))).toEqual({ opacity: '1', padding: '8px', label: '@文件' })
    expect(await sidebarFile.boundingBox()).toEqual(before)
    expect(await sidebarFile.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    if (process.env.KNOWLEDGE_QA_SCREENSHOT) await page.screenshot({ path: process.env.KNOWLEDGE_QA_SCREENSHOT.replace('.png', '-' + theme + '.png') })
  } finally {
    await page.close()
  }
})

it('keeps shared file names readable with both desktop sidebars visible', async () => {
  const page = await browser.newPage({ viewport: { width: 1380, height: 900 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent('<div class="pI_x6G_centerCol" style="position:fixed;inset:10px 360px 10px 280px"></div>')
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    await library.getByRole('button', { name: /他人共享/ }).click()
    await library.getByRole('button', { name: '行业研究', exact: true }).click()
    const title = library.locator('.knowledge-file-title > span:first-child')
    await title.waitFor()
    expect(await title.evaluate(el => el.clientWidth)).toBeGreaterThanOrEqual(105)
    const table = library.locator('.knowledge-table-wrap')
    expect(await table.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.setViewportSize({ width: 1240, height: 900 })
    expect(await title.evaluate(el => el.clientWidth)).toBeGreaterThanOrEqual(100)
    expect(await table.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    expect(await library.getByText('验收所有者', { exact: true }).isVisible()).toBe(true)
  } finally { await page.close() }
})

it('shows file progress in the selected folder and supports retry and cancellation without duplicate entries', async () => {
  const page = await browser.newPage({ viewport: { width: 1380, height: 900 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent('<div class="pI_x6G_centerCol" style="position:fixed;inset:10px 10px 10px 250px"></div>')
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    await library.getByRole('button', { name: /研究资料/, exact: false }).first().click()
    await library.getByRole('button', { name: '添加文件' }).click()
    const pending = library.getByRole('row', { name: /上传成功.md/ })
    await expect.poll(() => pending.getByRole('progressbar').getAttribute('value')).toBe('8192')
    expect(await pending.innerText()).toContain('上传中 50%')
    await page.evaluate(() => window.finishImport('上传成功.md', '模拟复制失败'))
    await pending.getByRole('button', { name: '重试 上传成功.md' }).click()
    await page.evaluate(() => window.finishImport('上传成功.md'))
    await expect.poll(() => library.locator('tbody button.knowledge-file-name').filter({ hasText: '上传成功.md' }).count()).toBe(1)
    const cancelled = library.getByRole('row', { name: /上传取消.pdf/ })
    await cancelled.getByRole('button', { name: '取消 上传取消.pdf' }).click()
    await expect.poll(() => cancelled.count()).toBe(0)
    expect(await page.evaluate(() => window.data.documents.find(file => file.name === '上传成功.md').folderId)).toBe('f')
  } finally { await page.close() }
})
