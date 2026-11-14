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
      const host = new WorkspaceSurfaceHost(document)
      const documents = [
        { id: 'a', name: '消费行业周报.md', source: 'generated', saved: true },
        { id: 'b', name: '研究写作规范.md', source: 'upload', folderId: 'f' },
        { id: 'c', name: '演示文稿.pptx', source: 'upload', folderId: 'f' }
      ].map(row => ({ size: 8192, updatedAt: 1761993600000, starred: false, saved: false, ...row }))
      window.data = { documents, folders: [{ id: 'f', name: '研究资料' }] }
      window.addEventListener('sherlock:workspace-surface-change', () => {})
      mountKnowledgeWorkspace(document, host, {
        async request(method, args) {
          if (method === 'snapshot') return structuredClone(window.data)
          if (method === 'preview') return { document: documents.find(d => d.id === args.id), text: '# 研究写作规范' }
          throw new Error('Unexpected bridge method '+method)
        },
        subscribe: () => () => {},
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
    await expect.poll(() => library.getByRole('complementary', { name: '文件预览' }).textContent()).toContain('# 研究写作规范')
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
