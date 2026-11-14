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
      const documents = [
        { id: 'a', name: '消费行业周报.md', source: 'generated', saved: true },
        { id: 'b', name: '研究写作规范.md', source: 'upload', folderId: 'f', size: 4096 },
        { id: 'c', name: '演示文稿.pptx', source: 'upload', folderId: 'f', size: 16384, updatedAt: 1762080000000 }
      ].map(row => ({ size: 8192, updatedAt: 1761993600000, starred: false, saved: false, ...row }))
      window.data = { documents, folders: [{ id: 'f', name: '研究资料' }] }
      mountKnowledgePanels(document, {
        snapshot: async () => structuredClone(window.data),
        received: async () => [
          { id: 'r1', name: '共享行业资料.pdf', source: 'upload', size: 1024, updatedAt: 1,
            starred: false, saved: false, received: { owner: '共享人', category: '行业研究' } },
          { id: 'r2', name: '共享数据表.xlsx', source: 'upload', size: 8192, updatedAt: 2,
            starred: false, saved: false, received: { owner: '共享人', category: '数据分析' } }
        ]
      })
      window.addEventListener('sherlock:workspace-surface-change', () => {})
      mountKnowledgeWorkspace(document, host, {
        async request(method, args) {
          if (method === 'snapshot') return structuredClone(window.data)
          if (method === 'preview') return { document: documents.find(d => d.id === args.id), text: '# 研究写作规范' }
          throw new Error('Unexpected bridge method '+method)
        },
        subscribe: () => () => {},
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

it('preserves PDF filtering when drilling into shared files, going back and browsing local folders', async () => {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    page.setDefaultTimeout(2500)
    await page.setContent('<aside data-knowledge-panel-host style="width:340px;height:720px"></aside>')
    await page.addScriptTag({ content: bundle })
    const pane = page.getByRole('region', { name: '知识库资料' })
    await pane.getByRole('button', { name: '所有文件', exact: true }).click()
    await pane.getByRole('button', { name: '他人共享', exact: true }).click()
    await pane.getByRole('button', { name: /数据分析/ }).waitFor()
    await pane.getByRole('button', { name: '筛选', exact: true }).click()
    await pane.getByRole('checkbox', { name: 'PDF', exact: true }).check()
    await pane.getByRole('button', { name: '完成' }).click()
    await expect.poll(() => pane.getByRole('button', { name: /数据分析/ }).count()).toBe(0)
    await pane.getByRole('button', { name: /行业研究/ }).click()
    const file = pane.getByRole('button', { name: /共享行业资料.pdf 共享人/ })
    await file.waitFor()
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
