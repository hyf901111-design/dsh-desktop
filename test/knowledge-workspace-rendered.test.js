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
      import { BrowserAppView } from './src/preload/browser/view'
      import { mountFloatingSurfaces } from './src/preload/floating-surfaces'
      import { mountKnowledgeWorkspace } from './src/preload/knowledge/workspace'
      import { mountKnowledgePanels } from './src/preload/knowledge/panel'
      import { installKnowledgeSidebar, installKnowledgeSourceNavigation } from './scripts/lib/knowledge-client.mjs'
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      const host = new WorkspaceSurfaceHost(document)
      const testPagination = document.body.hasAttribute('data-test-pagination')
      if (testPagination || document.body.hasAttribute('data-test-session-directory')) {
        const byId = testPagination ? Object.fromEntries(['research', 'notes', 'spreadsheet'].flatMap(mode =>
          Array.from({ length: 43 }, (_, index) => ['paged-' + mode + '-' + index, {
            title: '分页会话-' + mode + '-' + index, updatedAt: 1700000000000 - index
          }])
        )) : {
          board: { title: '消费行业研究看板', updatedAt: 1700000000000 },
          board2: { title: '新品调研看板', updatedAt: 1670000000000 },
          note: { title: '季度会议笔记', updatedAt: 1690000000000 },
          sheet: { title: '渠道库存表格', updatedAt: 1680000000000 },
          blankBoard: { title: '空白研究看板' }, blankNote: { title: '空白笔记' }, blankSheet: { title: '空白表格' },
          chat: { title: '普通对话' },
          removed: { title: '已删除表格', removed: true },
          child: { title: '子任务', parentId: 'note' }
        }
        const opened = new Map()
        installKnowledgeSourceNavigation({ document,
          sessions: { list: { getSnapshot: () => ({ ids: Object.keys(byId), byId }) }, subagentAddress: () => undefined,
            open: id => { window.openedSession = { id, view: opened.get(id) } } },
          workspaces: { list: { getSnapshot: () => ({ items: [{ title: '行业跟踪', sessionIds: ['board', 'note', 'sheet'] }] }) } },
          chatStore: { create: id => ({ actions: { setView: view => opened.set(id, view) } }) },
          boards: () => ({ isBoardOnly: id => id.startsWith('paged-research-') || ['board', 'board2', 'blankBoard'].includes(id) })
        })
      }
      if (document.body.hasAttribute('data-test-browser-topbar')) {
        const browser = new BrowserAppView(document, {
          subscribe: () => () => {},
          request: async () => ({
            tabs: [{ id: 'start', title: '新标签页', url: '', zoom: 1 }], activeId: 'start',
            history: [], closed: [], bookmarks: [], folders: [], downloads: [], settings: { bookmarksBar: true }
          }),
          layout: async () => true
        }, host)
        window.openBrowser = () => browser.open()
      }
      const longFolder = document.body.dataset.testFolderName
      if (longFolder) mountFloatingSurfaces(document)
      window.openLibrarySettings = () => document.dispatchEvent(new CustomEvent('sherlock:knowledge-show-section', { detail: 'memory' }))
      const moreFormats = document.body.hasAttribute('data-test-formats')
        ? ['pdf', 'docx', 'xlsx', 'png', 'mp3', 'mp4', 'bin'].map((suffix, index) => ({
          id: 'f' + index, name: '格式验收.' + suffix, source: 'upload'
        })) : []
      const pagedFiles = Array.from({ length: 43 }, (_, index) => ({
        id: 'paged-file-' + index, name: '分页文件-' + index + '.md', source: 'upload', folderId: 'f',
        updatedAt: 1700000000000 - index, size: 8192, starred: true, saved: true,
        share: { id: 'share-' + index, category: '行业研究' }
      }))
      const documents = testPagination ? pagedFiles : [
        ...moreFormats,
        { id: 'a', name: '消费行业周报.md', source: 'generated', saved: true },
        { id: 'b', name: '研究写作规范.md', source: 'upload', folderId: 'f', size: 4096 },
        { id: 'c', name: '演示文稿.pptx', source: 'upload', folderId: 'f', size: 16384, updatedAt: 1762080000000 }
      ].map(row => ({ size: 8192, updatedAt: 1761993600000, starred: false, saved: false, ...row }))
      window.data = { documents, folders: [{ id: 'f', name: longFolder || '研究资料' }] }
      window.markdown = { text: '# 研究写作规范', revision: 'first' }
      const nativeTabs = document.querySelector('[data-test-knowledge-native-tabs]')
      if (nativeTabs) {
        const tabRoot = createRoot(nativeTabs)
        const registered = new Map()
        const scope = { sessionId: 'preview-session' }
        const nativeEditor = nativeTabs.hasAttribute('data-test-real-viewer')
        if (nativeEditor) window.dshDesktop = { knowledgeFilePreview: async () => ({}) }
        let active
        const renderTab = () => tabRoot.render(React.createElement(React.Fragment, null,
          React.createElement('span', { role: 'tab' }, active.title),
          nativeEditor ? React.createElement('output', null, active.type + ' ' + active.path)
            : React.createElement(registered.get(active.type).component, { tab: active, scope })
        ))
        globalThis.react = React
        installKnowledgeSidebar({ document, service: {
          registerTab(descriptor) {
            registered.set(descriptor.id, descriptor)
            return () => registered.delete(descriptor.id)
          },
          getSnapshot: () => scope,
          openTab(tab) {
            if (nativeEditor) nativeTabs.dataset.panelOpen = 'true'
            active = tab
            renderTab()
          },
          setPanelState(patch, targetScope) {
            if (targetScope !== scope && targetScope.sessionId !== scope.sessionId) throw Error('wrong scope')
            nativeTabs.dataset.panelOpen = String(patch.open)
          },
          updateTab(id, patch, targetScope) {
            if (id !== active.id || targetScope.sessionId !== scope.sessionId) throw Error('wrong native tab')
            active = { ...active, ...patch }
            renderTab()
          }
        } })
        const file = documents.find(row => row.id === 'b')
        file.id = '60088dae-e7fe-4b33-ab36-c9dcf069aa58'
        window.openNativeKnowledgePreview = () => document.dispatchEvent(new CustomEvent('sherlock:knowledge-preview-file', {
          detail: { id: file.id, name: file.name }, cancelable: true
        }))
      }
      if (document.querySelector('[data-knowledge-panel-file="decafbaddecafbaddecafbaddecafbad"]')) window.sharedPreview = {
        document: { id: 'decafbad'.repeat(4), name: '可撤销的分享.md', source: 'upload',
          size: 8192, updatedAt: 2, starred: false, saved: false, received: { owner: '共享人', category: '行业研究' } },
        text: '# 初次共享正文'
      }
      window.sharedPreviewReads = 0
      let useMemory = false
      let memoryDocument = { content: '## 记忆验收正文', hash: 'first' }
      const memory = { request: async command => {
        if (command.type === 'settings') useMemory = command.use
        if (command.type === 'document-save') {
          if (command.expectedHash !== memoryDocument.hash) throw Error('修改已冲突')
          memoryDocument = { content: command.content, hash: 'saved' }
        }
        return { owner: 'test-account', settings: { use: useMemory }, document: { ...memoryDocument } }
      } }
      mountKnowledgePanels(document, {
        memory,
        revealConversation: () => host.revealConversation(),
        snapshot: async () => structuredClone(window.data),
        preview: async id => {
          if (id === 'decafbad'.repeat(4)) {
            window.sharedPreviewReads++
            if (!window.sharedPreview) throw Error('该文件已取消共享或不可用。')
            return structuredClone(window.sharedPreview)
          }
          return { document: documents.find(row => row.id === id), text: window.markdown.text }
        },
        markdown: async () => ({ ...window.markdown }),
        saveMarkdown: async (id, revision, text) => {
          if (revision !== window.markdown.revision) throw Error('文件已被修改')
          window.markdown = { text, revision: 'saved' }
          return { document: documents.find(row => row.id === id), revision: 'saved' }
        },
        received: async () => {
          if (window.sharedCatalogError) throw Error(window.sharedCatalogError)
          return [
            ...(window.sharedPreview ? [structuredClone(window.sharedPreview.document)] : []),
            { id: 'r1', name: '共享行业资料.pdf', source: 'upload', size: 1024, updatedAt: 1,
              starred: false, saved: false, received: { owner: '共享人', category: '行业研究' } },
            { id: 'r2', name: '共享数据表.xlsx', source: 'upload', size: 8192, updatedAt: 2,
              starred: false, saved: false, received: { owner: '共享人', category: '数据分析' } }
          ]
        }
      })
      const uploads = new Map()
      const recentSearches = []
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
        memory,
        async request(method, args) {
          if (method === 'snapshot') return structuredClone(window.data)
          if (method === 'edit' && args.type === 'create-folder') {
            window.data.folders.push({ id: 'new-folder', name: args.name })
            return structuredClone(window.data)
          }
          if (method === 'edit' && args.type === 'move') {
            window.data.documents.find(row => row.id === args.id).folderId = args.folderId
            return structuredClone(window.data)
          }
          if (method === 'share-session' || method === 'unshare-session') {
            const key = args.mode + ':' + args.id
            window.sessionShareAction = { method, ...args }
            window.data.sessionShares ??= {}
            if (method === 'share-session') window.data.sessionShares[key] = { id: 'a'.repeat(32), category: args.category }
            else delete window.data.sessionShares[key]
            return structuredClone(window.data)
          }
          if (method === 'recent-searches') return [...recentSearches]
          if (method === 'remember-search') {
            const index = recentSearches.indexOf(args.query)
            if (index >= 0) recentSearches.splice(index, 1)
            recentSearches.unshift(args.query)
            return [...recentSearches]
          }
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
          if (method === 'session-evidence') return args.ids.map(id => ({
            id, hasContent: testPagination ? id.startsWith('paged-' + args.mode + '-')
              : ({ research: ['board', 'board2'], notes: ['note'], spreadsheet: ['sheet', 'removed', 'child'] })[args.mode].includes(id)
          }))
          if (method === 'received') {
            if (window.sharedCatalogError) throw Error(window.sharedCatalogError)
            if (window.waitForSharedCatalog) return window.waitForSharedCatalog
            if (testPagination) return pagedFiles.map(({ share, folderId, ...row }) => ({
              ...row, id: 'received-' + row.id, received: { owner: '验收账号', category: '行业研究' }
            }))
            if (document.querySelector('[data-knowledge-panel-file="decafbaddecafbaddecafbaddecafbad"]')) {
              return window.sharedPreview ? [structuredClone(window.sharedPreview.document)] : []
            }
            return [{ id: 'shared-layout', name: '渠道调研验收.md', source: 'upload', size: 1024, updatedAt: 1,
              starred: false, saved: false, received: { owner: '验收所有者', category: '行业研究' } }]
          }
          if (method === 'preview') return { document: documents.find(d => d.id === args.id), text: '# 研究写作规范' }
          throw new Error('Unexpected bridge method '+method)
        },
        subscribe(listener) {
          document.addEventListener('sherlock:knowledge-changed', listener)
          return () => document.removeEventListener('sherlock:knowledge-changed', listener)
        },
        subscribeImportProgress(listener) { window.emitImportProgress = listener; return () => {} },
        subscribeAction(listener) { window.applyKnowledgeAction = listener; return () => {} },
        reply(response) {
          window.knowledgeActionResult = response
          window.rowsAtKnowledgeReply = Array.from(document.querySelectorAll('.knowledge-table tbody .knowledge-file-title')).map(element => element.textContent)
        },
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

it('lists real session modes under all files and opens each one in its native view', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent('<body data-test-session-directory><div class="pI_x6G_centerCol" style="position:fixed;inset:10px"></div></body>')
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    const group = library.getByRole('group', { name: '所有文件子分类' })
    expect(await group.getByRole('button').allTextContents()).toEqual(['文件资料', '研究模式', '笔记模式', '表格模式'])
    for (const [label, title, id, view] of [
      ['研究模式', '消费行业研究看板', 'board', 'research'],
      ['笔记模式', '季度会议笔记', 'note', 'notes'],
      ['表格模式', '渠道库存表格', 'sheet', 'spreadsheet']
    ]) {
      await group.getByRole('button', { name: label }).click()
      const directory = library.getByRole('main', { name: label })
      const opens = directory.locator('.knowledge-session-open')
      const row = opens.filter({ hasText: title })
      await row.waitFor()
      expect(await opens.count()).toBe(view === 'research' ? 2 : 1)
      expect(await directory.getByRole('button', { name: /空白/ }).count()).toBe(0)
      const tile = row.locator('.knowledge-file-icon')
      expect(await tile.evaluate(el => ({
        width: el.getBoundingClientRect().width,
        format: el.dataset.format,
        fill: el.querySelector('svg').getAttribute('fill')
      }))).toEqual({ width: 32, format: view, fill: 'currentColor' })
      const color = await tile.evaluate(el => getComputedStyle(el).backgroundColor)
      await row.hover()
      await expect.poll(() => tile.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(color)
      if (view === 'research') {
        const boxes = await opens.evaluateAll(items => items.map(el => el.getBoundingClientRect().toJSON()))
        expect(boxes[1].top - boxes[0].bottom).toBe(4)
      }
      const search = directory.getByRole('searchbox', { name: '搜索会话' })
      await search.fill('找不到的项目')
      await directory.getByText('没有符合搜索条件的会话。').waitFor()
      await search.fill('行业跟踪')
      await row.click()
      expect(await page.evaluate(() => window.openedSession)).toEqual({ id, view })
      await library.waitFor({ state: 'hidden' })
      await page.evaluate(() => window.dispatchEvent(new Event('sherlock:knowledge-open')))
    }
    await group.getByRole('button', { name: '文件资料' }).click()
    await library.getByRole('button', { name: '添加文件', exact: true }).waitFor()
  } finally { await page.close() }
})

it('publishes and manages read-only sharing from each mode with inset dialog controls', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent('<body data-test-session-directory><div class="pI_x6G_centerCol" style="position:fixed;inset:10px"></div></body>')
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    for (const [label, title, id, mode] of [
      ['研究模式', '消费行业研究看板', 'board', 'research'],
      ['笔记模式', '季度会议笔记', 'note', 'notes'],
      ['表格模式', '渠道库存表格', 'sheet', 'spreadsheet']
    ]) {
      await library.getByRole('button', { name: label }).click()
      await library.getByRole('button', { name: `共享会话「${title}」` }).click()
      const dialog = library.getByRole('dialog', { name: '共享只读会话' })
      expect(await dialog.getByText(/其他已登录用户可在「他人共享」查看/).isVisible()).toBe(true)
      const category = dialog.getByRole('combobox', { name: '共享分类' })
      const inset = await category.evaluate(element => {
        const icon = element.nextElementSibling
        return element.getBoundingClientRect().right - icon.getBoundingClientRect().right
      })
      expect(inset).toBe(12)
      await category.selectOption({ label: '写作模板' })
      await dialog.getByRole('button', { name: '发布', exact: true }).click()
      const manage = library.getByRole('button', { name: `管理共享「${title}」` })
      await manage.waitFor()
      expect(await page.evaluate(() => window.sessionShareAction)).toMatchObject({ method: 'share-session', id, title, mode, category: '写作模板' })
      await manage.click()
      expect(await category.inputValue()).toBe('写作模板')
      expect(await dialog.getByRole('button', { name: '重新发布' }).isVisible()).toBe(true)
      await dialog.getByRole('button', { name: '取消共享' }).click()
      await library.getByRole('button', { name: `共享会话「${title}」` }).waitFor()
      expect(await page.evaluate(() => window.sessionShareAction)).toMatchObject({ method: 'unshare-session', id, mode })
    }
  } finally { await page.close() }
})

it('lists published files and all three session modes in My Shares with session-specific actions', async () => {
  const page = await browser.newPage({ viewport: { width: 1380, height: 850 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent(`<body data-test-session-directory>
      <div class="pI_x6G_centerCol" style="position:fixed;inset:10px 330px 10px 10px"></div>
      <aside data-knowledge-panel-host style="position:fixed;inset:10px 10px 10px auto;width:310px"></aside></body>`)
    await page.addScriptTag({ content: bundle })
    await page.evaluate(() => {
      window.data.sessionShares = {
        'research:board': { id: 'b'.repeat(32), category: '行业研究' },
        'notes:note': { id: 'c'.repeat(32), title: '已发布笔记', category: '写作模板', publishedAt: 1700000000000, size: 512 },
        'spreadsheet:sheet': { id: 'd'.repeat(32), category: '数据分析' }
      }
      window.data.documents[0].share = { id: 'e'.repeat(32), category: '行业研究' }
      window.dispatchEvent(new Event('sherlock:knowledge-open'))
      document.dispatchEvent(new Event('sherlock:knowledge-changed'))
    })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    const mine = library.getByRole('button', { name: /^我的共享 4$/ })
    await mine.click()
    const research = library.getByRole('row', { name: /消费行业研究看板/ })
    await research.waitFor()
    expect(await research.getByText('研究模式 · 行业研究', { exact: true }).isVisible()).toBe(true)
    expect(await library.getByRole('row', { name: /已发布笔记/ }).getByText('笔记模式 · 写作模板').isVisible()).toBe(true)
    expect(await library.getByRole('row', { name: /渠道库存表格/ }).isVisible()).toBe(true)
    expect(await library.getByRole('row', { name: /消费行业周报.md/ }).isVisible()).toBe(true)

    const pane = page.getByRole('region', { name: '知识库资料' })
    await pane.getByRole('button', { name: '所有文件', exact: true }).click()
    await pane.getByRole('button', { name: '我的共享', exact: true }).click()
    expect(await pane.getByRole('button', { name: /已发布笔记/ }).isVisible()).toBe(true)
    expect(await pane.getByRole('button', { name: /引用文件 已发布笔记/ }).count()).toBe(0)

    await research.getByRole('button', { name: /的更多操作/ }).click()
    await library.getByRole('button', { name: '管理共享', exact: true }).click()
    await library.getByRole('button', { name: '取消共享', exact: true }).click()
    await library.getByRole('button', { name: /^我的共享 3$/ }).waitFor()
    expect(await research.count()).toBe(0)
    await library.getByRole('button', { name: /渠道库存表格 共享/ }).click()
    expect(await page.evaluate(() => window.openedSession)).toEqual({ id: 'sheet', view: 'spreadsheet' })
  } finally { await page.close() }
})

it('centers empty messages in session, file and shared list content areas', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent(`
      <div class="pI_x6G_centerCol" style="position:fixed;inset:10px 330px 10px 10px"></div>
      <aside data-knowledge-panel-host style="position:fixed;inset:10px 10px 10px auto;width:310px;height:auto"></aside>`)
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    const categories = library.getByRole('navigation', { name: '知识库分类' })
    const centered = async (hint, container, header) => {
      await hint.waitFor()
      const bounds = await container.boundingBox()
      const contentWidth = await container.evaluate(el => el.clientWidth - (parseFloat(getComputedStyle(el).paddingRight) || 0))
      const top = header ? await header.boundingBox() : null
      const contentStart = top ? top.y + top.height : bounds.y
      const text = await hint.evaluate(element => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return range.getBoundingClientRect().toJSON()
      })
      expect(Math.abs(text.y + text.height / 2 - (contentStart + bounds.y + bounds.height) / 2)).toBeLessThan(2)
      expect(Math.abs(text.x + text.width / 2 - bounds.x - contentWidth / 2)).toBeLessThan(2)
    }
    for (const name of ['研究模式', '笔记模式', '表格模式']) {
      await categories.getByRole('button', { name, exact: true }).click()
      const directory = library.getByRole('main', { name })
      await centered(directory.getByText('这里还没有会话。'), directory.locator('.knowledge-session-results'))
    }
    const table = library.locator('.knowledge-table-wrap')
    for (const name of [/重点文件/, /^我的共享/]) {
      await categories.getByRole('button', { name }).click()
      await centered(library.getByText('此分类暂无文件。'), table, table.locator('thead'))
    }
    await categories.getByRole('button', { name: /他人共享/ }).click()
    await library.getByPlaceholder('搜索他人共享…').fill('不存在的文件')
    await centered(library.getByText('没有符合条件的文件。'), table, table.locator('thead'))

    const pane = page.getByRole('region', { name: '知识库资料' })
    await pane.getByRole('searchbox').fill('不存在的文件')
    await centered(pane.getByText('暂无符合条件的文件。'), pane.locator('.knowledge-panel-rows'))
  } finally { await page.close() }
})

it('shows one combined shared file list and each file’s directory', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 820 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent(`
      <div class="pI_x6G_centerCol" style="position:fixed;inset:10px 330px 10px 10px"></div>
      <aside data-knowledge-panel-host style="position:fixed;inset:10px 10px 10px auto;width:310px;height:auto"></aside>`)
    await page.evaluate(() => {
      window.waitForSharedCatalog = Promise.resolve(['行业研究', '数据分析'].map((category, index) => ({
        id: 'combined-' + index, name: category + '.pdf', source: 'upload', size: 8192, updatedAt: 1,
        starred: false, saved: false, received: { owner: '共享人', category }
      })))
    })
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    await library.getByRole('navigation', { name: '知识库分类' }).getByRole('button', { name: /他人共享/ }).click()
    const shared = library.getByRole('navigation', { name: '共享分类' })
    const all = shared.getByRole('button', { name: '全部文件', exact: true })
    expect(await all.getAttribute('aria-current')).toBe('page')
    await shared.getByRole('button', { name: '行业研究', exact: true }).click()
    expect(await all.getAttribute('aria-current')).toBeNull()
    expect(await shared.getByRole('button', { name: '返回上级目录', exact: true }).count()).toBe(0)
    expect(await library.getByRole('button', { name: /数据分析.pdf/ }).count()).toBe(0)
    await all.click()
    expect(await all.getAttribute('aria-current')).toBe('page')
    for (const category of ['行业研究', '数据分析']) {
      const row = library.getByRole('button', { name: new RegExp(category + '\\.pdf') })
      expect(await row.getByText(category, { exact: true }).isVisible()).toBe(true)
    }

    const pane = page.getByRole('region', { name: '知识库资料' })
    await pane.getByRole('button', { name: '所有文件', exact: true }).click()
    await pane.getByRole('button', { name: '他人共享', exact: true }).click()
    const panelAll = pane.getByRole('button', { name: /^全部文件/ })
    await panelAll.click()
    expect(await pane.getByRole('button', { name: '他人共享 / 全部文件' }).isVisible()).toBe(true)
    expect(await pane.getByText('行业研究 · 共享人').isVisible()).toBe(true)
    expect(await pane.getByText('数据分析 · 共享人').isVisible()).toBe(true)
    await pane.getByRole('button', { name: '返回上级' }).click()
    expect(await panelAll.isVisible()).toBe(true)
  } finally { await page.close() }
})

it('moves existing files into a new folder through the row menu and by dragging', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent('<div class="pI_x6G_centerCol" style="position:fixed;inset:10px"></div>')
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    await library.getByRole('button', { name: '新建文件夹' }).click()
    const create = library.getByRole('dialog', { name: '新建文件夹' })
    await create.getByRole('textbox', { name: '名称' }).fill('已整理')
    await create.getByRole('button', { name: '确认' }).click()
    const folder = library.getByRole('button', { name: /^已整理 / })
    await library.getByRole('button', { name: '消费行业周报.md的更多操作' }).click()
    const moveAction = library.getByRole('button', { name: '移动到文件夹…' })
    expect(await moveAction.locator('svg').count()).toBe(0)
    await moveAction.click()
    const move = library.getByRole('dialog', { name: '移动到文件夹' })
    expect(await move.getByRole('button', { name: '移动', exact: true }).isDisabled()).toBe(true)
    await move.getByRole('combobox', { name: '目标文件夹' }).selectOption({ label: '已整理' })
    await move.getByRole('button', { name: '移动', exact: true }).click()
    await expect.poll(() => folder.textContent()).toBe('已整理1')
    await library.getByRole('button', { name: '研究写作规范.md的更多操作' }).click()
    await library.getByRole('button', { name: '添加至收藏', exact: true }).waitFor()
    await page.keyboard.press('Escape')
    const fileBounds = await library.getByRole('button', { name: /研究写作规范.md 手动上传/ }).boundingBox()
    const targetBounds = await folder.boundingBox()
    await page.mouse.move(fileBounds.x + 24, fileBounds.y + fileBounds.height / 2)
    await page.mouse.down()
    await page.mouse.move(targetBounds.x + 20, targetBounds.y + targetBounds.height / 2, { steps: 10 })
    await expect.poll(() => folder.locator('..').getAttribute('data-move-target')).toBe('true')
    await page.mouse.up()
    await expect.poll(() => folder.textContent()).toBe('已整理2')
    await folder.click()
    await library.getByRole('row', { name: /消费行业周报\.md/ }).waitFor()
    await library.getByRole('row', { name: /研究写作规范\.md/ }).waitFor()
    expect(await page.evaluate(() => window.data.documents.length)).toBe(3)
  } finally { await page.close() }
})

it('shows a two-second toast for file changes without moving the list header', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.clock.install()
    await page.setContent('<div class="pI_x6G_centerCol" style="position:fixed;inset:10px"></div>')
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    const more = library.getByRole('button', { name: '消费行业周报.md的更多操作' })
    await more.waitFor()
    const header = library.getByRole('columnheader', { name: /文件名/ })
    const originalHeader = await header.boundingBox()
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100))
    await library.getByRole('button', { name: '新建文件夹' }).click()
    const create = library.getByRole('dialog', { name: '新建文件夹' })
    await create.getByRole('textbox', { name: '名称' }).fill('已整理')
    await create.getByRole('button', { name: '确认' }).click()
    const toast = library.locator('.knowledge-toast')
    await expect.poll(() => toast.textContent()).toBe('已更新知识库。')
    expect(await toast.getAttribute('role')).toBe('status')
    expect(await toast.evaluate(element => getComputedStyle(element).position)).toBe('absolute')
    expect(await library.getByRole('button', { name: '关闭提示' }).count()).toBe(0)
    expect(await header.boundingBox()).toEqual(originalHeader)
    await page.clock.runFor(1300)

    await more.click()
    await library.getByRole('button', { name: '移动到文件夹…' }).click()
    const move = library.getByRole('dialog', { name: '移动到文件夹' })
    await move.getByRole('combobox', { name: '目标文件夹' }).selectOption({ label: '已整理' })
    await move.getByRole('button', { name: '移动', exact: true }).click()
    await expect.poll(() => toast.textContent()).toContain('移到「已整理」')
    await page.clock.runFor(1999)
    expect(await toast.count()).toBe(1)
    await page.clock.runFor(1)
    await expect.poll(() => toast.count()).toBe(0)
    expect(await header.boundingBox()).toEqual(originalHeader)
  } finally { await page.close() }
})

it('aligns the knowledge app icon and title with the browser when switching workspaces', async () => {
  const page = await browser.newPage()
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent('<body data-test-browser-topbar data-ds-dark-theme><aside data-dsh-sidebar-root style="position:fixed;left:0;top:10px;width:250px"></aside><div class="pI_x6G_centerCol" style="position:fixed;inset:10px 10px 10px 250px"></div></body>')
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    const browserApp = page.getByRole('region', { name: '浏览器', exact: true })
    const measure = region => region.locator('.workspace-app-topbar').evaluate(bar => {
      const positions = [...bar.querySelectorAll('.workspace-back-button, .workspace-app-title > i, .workspace-app-title > span')]
        .map(el => { const { x, y, width, height } = el.getBoundingClientRect(); return { x, y, width, height } })
      const icon = bar.querySelector('.workspace-app-title > i')
      return { positions, icon: getComputedStyle(icon).maskImage }
    })
    for (const width of [1200, 870, 700]) {
      await page.setViewportSize({ width, height: 820 })
      await page.evaluate(() => window.openBrowser())
      await expect.poll(() => browserApp.evaluate(el => el.getBoundingClientRect().width)).toBe(width - 260)
      const browserHeader = await measure(browserApp)
      await page.evaluate(() => window.dispatchEvent(new Event('sherlock:knowledge-open')))
      await library.waitFor()
      const knowledgeHeader = await measure(library)
      expect(knowledgeHeader.positions).toEqual(browserHeader.positions)
      expect(knowledgeHeader.icon).toContain('data:image/svg+xml')
      expect(knowledgeHeader.icon).not.toBe(browserHeader.icon)
    }
  } finally {
    await page.close()
  }
})

it('keeps the four workspace shortcuts open across the draggable knowledge header', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent(`
      <div class="pI_x6G_centerCol" style="position:fixed;inset:10px 10px 10px 250px">
        <div class="wSkVaW_root"><header data-srb-session-header data-ework-notes-session="selected">
          <div data-srb-tabs><button data-conversation-view-id="notes">笔记</button></div>
        </header></div>
      </div>`)
    await page.evaluate(() => {
      document.querySelector('[data-conversation-view-id="notes"]').addEventListener('click', () => {
        document.body.dataset.selectedView = 'notes'
      })
    })
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    const header = library.locator('.knowledge-header')
    const title = header.locator('.workspace-app-title')
    const toggle = header.locator('.eb-workspace-toggle')
    const files = header.getByRole('button', { name: '文件资料' })
    const shortcuts = header.getByRole('navigation', { name: '工作区视图' })
    const region = el => getComputedStyle(el).getPropertyValue('-webkit-app-region')
    expect(await header.evaluate(region)).toBe('drag')
    expect(await title.evaluate(region)).toBe('drag')
    expect(await toggle.evaluate(region)).toBe('no-drag')
    expect(await files.evaluate(region)).toBe('no-drag')
    await title.hover()
    expect(await shortcuts.count()).toBe(0)
    await toggle.hover()
    expect(await shortcuts.getByRole('button').allTextContents()).toEqual(['对话', '研究', '笔记', '表格'])
    expect(await shortcuts.getByRole('button', { name: '切换到笔记' }).evaluate(region)).toBe('no-drag')
    await title.hover()
    await files.hover()
    const bounds = await header.boundingBox()
    await header.hover({ position: { x: bounds.width - 16, y: 22 } })
    await page.waitForTimeout(210)
    expect(await toggle.getAttribute('aria-expanded')).toBe('true')
    await library.getByRole('button', { name: '筛选', exact: true }).hover()
    await expect.poll(() => toggle.getAttribute('aria-expanded')).toBe('false')
    await toggle.focus()
    await toggle.press('Enter')
    await shortcuts.getByRole('button', { name: '切换到笔记' }).press('Escape')
    expect(await toggle.getAttribute('aria-expanded')).toBe('false')
    expect(await toggle.evaluate(el => el === document.activeElement)).toBe(true)
    await toggle.press('Enter')
    await shortcuts.getByRole('button', { name: '切换到笔记' }).click()
    expect(await page.locator('body').getAttribute('data-selected-view')).toBe('notes')
    expect(await library.isVisible()).toBe(false)
  } finally {
    await page.close()
  }
})

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
    const filter = library.getByRole('button', { name: '筛选', exact: true })
    await filter.click()
    const popup = library.getByRole('group', { name: '筛选文件' })
    await expect.poll(async () => {
      const [buttonBounds, popupBounds] = await Promise.all([filter.boundingBox(), popup.boundingBox()])
      return Math.abs(buttonBounds.x + buttonBounds.width - popupBounds.x - popupBounds.width)
    }).toBeLessThan(1)
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
    await library.getByRole('button', { name: '关闭预览' }).click()
    await page.setViewportSize({ width: 720, height: 800 })
    await filter.click()
    await expect.poll(async () => {
      const [menuBounds, bounds] = await Promise.all([popup.boundingBox(), library.locator('.knowledge-tools').boundingBox()])
      return menuBounds.x >= bounds.x - 1 && menuBounds.x + menuBounds.width <= bounds.x + bounds.width + 1
    }).toBe(true)
    if (process.env.KNOWLEDGE_QA_SCREENSHOT) await page.screenshot({ path: process.env.KNOWLEDGE_QA_SCREENSHOT })
  } finally {
    await page.close()
  }
})

it('opens the same file actions from a row right-click and the more button', async () => {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, reducedMotion: 'reduce' })
  try {
    page.setDefaultTimeout(2000)
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent('<div class="pI_x6G_centerCol" style="position:fixed;inset:10px 10px 10px 250px"></div>')
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库' })
    const more = page.getByRole('button', { name: '消费行业周报.md的更多操作' })
    const menu = library.locator('.knowledge-action-menu')
    await more.click()
    const actions = await menu.getByRole('button').allTextContents()
    expect(actions).toContain('重命名')
    await page.keyboard.press('Escape')
    const row = library.getByRole('row').filter({ has: more })
    await row.click({ button: 'right', position: { x: 210, y: 22 } })
    expect(await menu.getByRole('button').allTextContents()).toEqual(actions)
    const origin = await row.boundingBox()
    const opened = await menu.boundingBox()
    expect(Math.abs(opened.x - origin.x - 210)).toBeLessThan(2)
    expect(Math.abs(opened.y - origin.y - 22)).toBeLessThan(2)
    expect(await library.getByRole('complementary', { name: '文件预览' }).count()).toBe(0)
    await row.click({ button: 'right', position: { x: origin.width - 10, y: 22 } })
    const nearEdge = await menu.boundingBox()
    expect(nearEdge.x + nearEdge.width).toBeLessThanOrEqual(1092)
    expect(await menu.getByRole('button').allTextContents()).toEqual(actions)
    await menu.getByRole('button', { name: '重命名' }).click()
    expect(await library.getByRole('dialog', { name: '重命名文件' }).locator('input').inputValue()).toBe('消费行业周报')
  } finally { await page.close() }
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

it('uses the latest file name on the native preview tab and keeps its Markdown draft after a rename', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent('<aside data-test-knowledge-native-tabs style="width:380px;height:720px"></aside>')
    await page.addScriptTag({ content: bundle })
    await page.evaluate(() => window.openNativeKnowledgePreview())
    const pane = page.getByRole('region', { name: '知识库文件预览' })
    await page.getByRole('tab', { name: '研究写作规范.md', exact: true }).waitFor({ timeout: 1500 })
    await pane.getByRole('button', { name: '编辑', exact: true }).click()
    const draft = pane.getByRole('textbox', { name: 'Markdown 正文' })
    await draft.fill('# 用户正在编辑')
    await page.evaluate(() => {
      window.data.documents.find(doc => doc.name === '研究写作规范.md').name = '新版写作规范.md'
      document.dispatchEvent(new Event('sherlock:knowledge-changed'))
    })
    await pane.getByText('新版写作规范.md', { exact: true }).waitFor({ timeout: 1500 })
    await page.getByRole('tab', { name: '新版写作规范.md', exact: true }).waitFor({ timeout: 1500 })
    expect(await page.getByRole('tab', { name: '研究写作规范.md', exact: true }).count()).toBe(0)
    expect(await draft.inputValue()).toBe('# 用户正在编辑')
  } finally { await page.close() }
})

it('keeps the native right pane open when creating a file tab already opens it', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent('<button data-odyssey-panel-entry="right" aria-expanded="false">右侧屏</button><aside data-test-knowledge-native-tabs data-test-real-viewer></aside>')
    await page.evaluate(() => document.querySelector('button').addEventListener('click', () => {
      const pane = document.querySelector('aside')
      pane.dataset.panelOpen = pane.dataset.panelOpen === 'true' ? 'false' : 'true'
    }))
    await page.addScriptTag({ content: bundle })
    await page.evaluate(() => window.openNativeKnowledgePreview())
    const pane = page.locator('aside')
    await expect.poll(() => pane.getAttribute('data-panel-open')).toBe('true')
    expect(await pane.locator('output').textContent()).toContain('editor knowledge/')
    await page.evaluate(() => window.openNativeKnowledgePreview())
    expect(await pane.getAttribute('data-panel-open')).toBe('true')
  } finally { await page.close() }
})

it('shows a readable shared directory error and retries from either knowledge surface', async () => {
  const page = await browser.newPage({ viewport: { width: 1380, height: 900 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent(`
      <div class="pI_x6G_centerCol" style="position:fixed;inset:10px 390px 10px 120px"></div>
      <aside data-knowledge-panel-host style="position:fixed;inset:10px 0 10px auto;width:380px"></aside>`)
    await page.evaluate(() => {
      window.sharedCatalogError = "Error invoking remote method 'knowledge:request': ResearchBoardsError: NOT_FOUND"
    })
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    const panel = page.getByRole('region', { name: '知识库资料' })
    await library.getByRole('button', { name: /他人共享 \d+/ }).click()
    await panel.getByRole('button', { name: '所有文件', exact: true }).click()
    await panel.getByRole('button', { name: '他人共享', exact: true }).click()
    for (const surface of [library, panel]) {
      const error = surface.getByRole('alert').filter({ hasText: '暂时无法加载他人共享。' })
      await error.waitFor({ timeout: 2000 })
      expect(await error.textContent()).toBe('暂时无法加载他人共享。')
      expect(await surface.getByText(/ResearchBoardsError|NOT_FOUND/).count()).toBe(0)
    }
    await panel.getByRole('button', { name: '重试', exact: true }).click()
    await panel.getByRole('alert').filter({ hasText: '暂时无法加载他人共享。' }).waitFor()
    await page.evaluate(() => { window.sharedCatalogError = undefined })
    await library.getByRole('button', { name: '重试', exact: true }).click()
    await library.getByRole('button', { name: /渠道调研验收.md/ }).first().waitFor()
    await panel.getByRole('button', { name: '行业研究' }).waitFor()
    expect(await panel.getByRole('alert').count()).toBe(0)
  } finally { await page.close() }
})

it('rechecks an open shared preview on focus, list refresh and a visible timer', async () => {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  try {
    await page.clock.install()
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    const id = 'decafbad'.repeat(4)
    await page.setContent(`
      <div class="pI_x6G_centerCol" style="position:fixed;inset:10px 390px 10px 20px"></div>
      <aside data-knowledge-panel-host data-knowledge-panel-file="${id}" style="position:fixed;right:0;width:380px;height:360px"></aside>
      <aside data-knowledge-panel-host style="position:fixed;right:0;top:400px;width:380px;height:360px"></aside>`)
    await page.addScriptTag({ content: bundle })
    const workspace = page.getByRole('region', { name: '知识库', exact: true })
    const preview = page.getByRole('region', { name: '知识库文件预览' })
    const picker = page.getByRole('region', { name: '知识库资料' })
    const middleFile = workspace.getByRole('button', { name: /可撤销的分享/ })
    const pickerFile = picker.getByRole('button', { name: /可撤销的分享.md 行业研究 · 共享人/ })
    await preview.getByRole('heading', { name: '初次共享正文' }).waitFor()
    await workspace.getByRole('button', { name: /他人共享/ }).click()
    await middleFile.waitFor()
    await picker.getByRole('button', { name: '所有文件', exact: true }).click()
    await picker.getByRole('button', { name: '他人共享', exact: true }).click()
    await picker.getByRole('button', { name: /行业研究/ }).click()
    await pickerFile.waitFor()
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    expect(await page.evaluate(() => window.sharedPreviewReads)).toBe(1)
    await page.evaluate(() => {
      window.sharedPreview.document.updatedAt++
      window.sharedPreview.text = '# 更新后的正文'
      window.dispatchEvent(new Event('focus'))
    })
    await preview.getByRole('heading', { name: '更新后的正文' }).waitFor({ timeout: 1500 })
    const previous = await page.evaluate(() => {
      const current = window.sharedPreview
      window.sharedPreview = undefined
      return current
    })
    await workspace.getByRole('button', { name: '刷新共享目录' }).click()
    await expect.poll(() => preview.getByRole('alert').textContent()).toBe('该文件已取消共享或不可用。')
    expect(await middleFile.count()).toBe(0)
    expect(await pickerFile.count()).toBe(0)
    expect(await preview.getByRole('heading', { name: '更新后的正文' }).count()).toBe(0)
    expect(await preview.getByRole('button', { name: '下载' }).count()).toBe(0)
    expect(await page.evaluate(() => window.sharedPreviewReads)).toBe(2)
    await page.evaluate(saved => { window.sharedPreview = saved }, previous)
    await page.clock.fastForward(15_000)
    await preview.getByRole('heading', { name: '更新后的正文' }).waitFor()
    await middleFile.waitFor({ timeout: 1500 })
    await pickerFile.waitFor({ timeout: 1500 })
    expect(await preview.getByRole('alert').count()).toBe(0)
    await page.evaluate(() => { window.sharedPreview = undefined })
    await page.clock.fastForward(15_000)
    await expect.poll(() => preview.getByRole('alert').textContent()).toContain('已取消共享')
    expect(await middleFile.count()).toBe(0)
    expect(await pickerFile.count()).toBe(0)
  } finally { await page.close() }
})

it('updates the workspace count when the right knowledge pane loads the shared directory first', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent(`
      <div class="pI_x6G_centerCol" style="position:fixed;inset:10px 370px 10px 250px"></div>
      <aside data-knowledge-panel-host style="position:fixed;right:10px;top:10px;width:340px;height:850px"></aside>
    `)
    await page.addScriptTag({ content: bundle })
    const sharedCount = page.getByRole('navigation', { name: '知识库分类' }).getByRole('button', { name: /他人共享/ }).locator('small')
    const pane = page.getByRole('region', { name: '知识库资料' })
    await pane.getByRole('button', { name: '所有文件', exact: true }).click()
    await pane.getByRole('button', { name: '他人共享', exact: true }).click()
    await pane.getByRole('button', { name: '行业研究 1' }).waitFor({ timeout: 2000 })
    await expect.poll(() => sharedCount.textContent()).toBe('2')
  } finally { await page.close() }
})

it.each(['no-preference', 'reduce'])('preserves PDF filtering through drill-down and hover with %s motion', async reducedMotion => {
  const animate = reducedMotion === 'no-preference'
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, reducedMotion })
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
    })).toEqual(animate ? ['knowledge-popup-in', '0.14s'] : ['none', '0s'])
    await pane.getByRole('button', { name: '他人共享', exact: true }).click()
    await pane.getByRole('button', { name: /数据分析/ }).waitFor()
    await pane.getByRole('button', { name: '筛选', exact: true }).click()
    await pane.getByRole('checkbox', { name: 'PDF', exact: true }).check()
    await pane.getByRole('button', { name: '完成' }).click()
    await expect.poll(() => pane.getByRole('button', { name: /数据分析/ }).count()).toBe(0)
    expect(await pane.locator('.knowledge-filter-count').evaluate(el => getComputedStyle(el).animationName))
      .toBe(animate ? 'knowledge-feedback-in' : 'none')
    await pane.getByRole('button', { name: /行业研究/ }).click()
    const file = pane.getByRole('button', { name: /共享行业资料.pdf 行业研究 · 共享人/ })
    await file.waitFor()
    const view = pane.locator('.knowledge-panel-rows')
    expect(await view.evaluate(el => getComputedStyle(el).animationName))
      .toBe(animate ? 'knowledge-state-in' : 'none')
    const currentView = await view.elementHandle()
    const search = pane.getByRole('searchbox')
    await search.fill('共享行业')
    expect(await view.evaluate((el, current) => el === current, currentView)).toBe(true)
    await search.clear()
    await page.mouse.move(1050, 750)
    const row = file.locator('..')
    const actionState = () => row.locator('.knowledge-panel-action').evaluate(action => {
      const size = getComputedStyle(action.querySelector('small'))
      const reference = getComputedStyle(action.querySelector('button'))
      return [size.opacity, reference.opacity, reference.pointerEvents]
    })
    const before = await file.boundingBox()
    expect(await actionState()).toEqual(['1', '0', 'none'])
    await file.hover()
    const action = row.getByRole('button', { name: '引用文件 共享行业资料.pdf' })
    expect(await action.evaluate(el => getComputedStyle(el).animationName))
      .toBe(animate ? 'knowledge-state-in' : 'none')
    await expect.poll(actionState).toEqual(['0', '1', 'auto'])
    expect(await file.boundingBox()).toEqual(before)
    await page.mouse.move(1050, 750)
    await file.focus()
    await page.keyboard.press('Tab')
    expect(await action.evaluate(el => el === document.activeElement)).toBe(true)
    await expect.poll(actionState).toEqual(['0', '1', 'auto'])
    await pane.getByRole('button', { name: '返回上级' }).click()
    await pane.getByRole('button', { name: /行业研究/ }).waitFor()
    await pane.getByRole('button', { name: '他人共享', exact: true }).click()
    await pane.getByRole('button', { name: '研究资料', exact: true }).click()
    await expect.poll(() => pane.getByText('暂无符合条件的文件。').isVisible()).toBe(true)
    await pane.getByRole('button', { name: /筛选/ }).click()
    await pane.getByRole('button', { name: '重置' }).click()
    await pane.getByRole('button', { name: '完成' }).click()
    await pane.getByRole('button', { name: /研究写作规范.md/ }).first().waitFor()
    expect(await view.evaluate(el => getComputedStyle(el).animationName))
      .toBe(animate ? 'knowledge-state-in' : 'none')
  } finally {
    await page.close()
  }
})

it.each(['no-preference', 'reduce'])('provides drag and preview feedback with %s motion', async reducedMotion => {
  const page = await browser.newPage({ viewport: { width: 1380, height: 900 }, reducedMotion })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent('<div class="pI_x6G_centerCol" style="position:fixed;inset:10px 10px 10px 250px"></div>')
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    const list = library.locator('.knowledge-file-list')
    const file = library.getByRole('button', { name: /研究写作规范.md/ }).first()
    const animation = reducedMotion === 'reduce' ? 'none' : 'knowledge-feedback-in'
    await file.waitFor()
    const before = await file.boundingBox()
    const transfer = await page.evaluateHandle(() => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['正文'], '拖放测试.md'))
      return transfer
    })
    for (let attempt = 0; attempt < 2; attempt++) {
      await list.dispatchEvent('dragenter', { dataTransfer: transfer })
      const overlay = library.getByText('拖放文件到知识库', { exact: true })
      await overlay.waitFor()
      expect(await overlay.evaluate(el => getComputedStyle(el).animationName)).toBe(animation)
      expect(await file.boundingBox()).toEqual(before)
      await list.dispatchEvent('dragleave', { dataTransfer: transfer })
      await overlay.waitFor({ state: 'detached' })
    }
    await file.click()
    const preview = library.getByRole('complementary', { name: '文件预览' })
    const content = preview.locator('.knowledge-preview-content')
    await content.waitFor()
    expect(await content.evaluate(el => getComputedStyle(el).animationName)).toBe(animation)
    await preview.getByRole('button', { name: '关闭预览' }).click()
    await preview.waitFor({ state: 'detached' })
    expect(await file.boundingBox()).toEqual(before)
  } finally { await page.close() }
})

it.each(['no-preference', 'reduce'])('applies reversible list changes with %s motion', async reducedMotion => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    page.setDefaultTimeout(2500)
    await page.setContent('<div class="pI_x6G_centerCol" style="position:fixed;inset:10px 10px 10px 250px"></div>')
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库' })
    await library.getByRole('button', { name: '消费行业周报.md', exact: false }).first().waitFor()
    const list = library.locator('tbody')
    await list.evaluate(el => {
      const animate = el.animate.bind(el)
      window.listTransitions = []
      el.animate = (frames, options) => {
        const animation = animate(frames, options)
        window.listTransitions.push({ frames, options, animation })
        return animation
      }
    })
    const transitions = () => page.evaluate(() => window.listTransitions.length)
    const search = library.getByLabel('搜索文件', { exact: true })
    await search.fill('消费')
    await search.clear()
    expect(await transitions()).toBe(0)
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
    expect(await transitions()).toBe(reducedMotion === 'reduce' ? 0 : 1)
    expect((await act({ action: 'filter', revision: result.revision, filter: {} })).error).toContain('筛选条件已变化')
    await library.getByRole('button', { name: '撤销', exact: true }).click()
    await expect.poll(() => library.getByRole('row').count()).toBe(4)
    expect(await transitions()).toBe(reducedMotion === 'reduce' ? 0 : 2)
    const scoped = await act({ action: 'filter', revision: (await act({ action: 'inspect' })).result.revision,
      filter: { folderId: 'f' } })
    await expect.poll(() => library.getByText('找到 2 个文件').isVisible()).toBe(true)
    const sorted = await act({ action: 'filter', revision: scoped.result.revision,
      filter: { ...scoped.result.filter, sort: 'size', ascending: true } })
    expect(sorted.result.filter).toEqual({ folderId: 'f', sort: 'size', ascending: true })
    await expect.poll(() => library.locator('tbody tr').first().textContent()).toContain('研究写作规范.md')
    await library.getByRole('button', { name: '撤销', exact: true }).click()
    await expect.poll(() => library.getByText('找到 2 个文件').isVisible()).toBe(true)
    await expect.poll(() => library.locator('tbody tr').first().textContent()).toContain('演示文稿.pptx')
    expect((await act({ action: 'inspect' })).result.filter).toEqual({ folderId: 'f' })
    if (reducedMotion === 'no-preference') {
      const motion = await page.evaluate(() => window.listTransitions.map(({ frames, options, animation }) =>
        ({ frames, duration: options.duration, state: animation.playState })))
      expect(motion).toHaveLength(5)
      expect(motion.every(item => item.duration === 140 && item.frames.every(frame => Object.keys(frame).join() === 'opacity'))).toBe(true)
      expect(motion.slice(0, -1).every(item => item.state === 'idle')).toBe(true)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect.poll(() => page.evaluate(() => window.listTransitions.at(-1).animation.playState)).toBe('idle')
    } else expect(await transitions()).toBe(0)
    await library.getByRole('button', { name: '返回工作区' }).click()
    expect((await act({ action: 'inspect' })).error).toContain('请先回到知识库')
  } finally {
    await page.close()
  }
})

it('acknowledges the rendered list, preserves the memory tab on inspect, and rejects a previous visit', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent('<div class="pI_x6G_centerCol" style="position:fixed;inset:10px 10px 10px 250px"></div>')
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库' })
    await library.getByRole('button', { name: /消费行业周报.md/ }).first().waitFor()
    const act = async request => {
      const id = await page.evaluate(request => {
        const id = crypto.randomUUID()
        window.applyKnowledgeAction({ ...request, id })
        return id
      }, request)
      await expect.poll(() => page.evaluate(() => window.knowledgeActionResult?.id)).toBe(id)
      return page.evaluate(() => ({ ...window.knowledgeActionResult, rendered: window.rowsAtKnowledgeReply }))
    }
    const initial = (await act({ action: 'inspect' })).result
    await page.evaluate(() => window.openLibrarySettings())
    await library.getByText('启用记忆', { exact: true }).waitFor()
    expect(await act({ action: 'inspect' })).toMatchObject({ result: { count: 3, section: 'memory' } })
    expect(await library.getByText('启用记忆', { exact: true }).isVisible()).toBe(true)
    await library.getByRole('button', { name: '返回工作区' }).click()
    await page.evaluate(() => window.dispatchEvent(new Event('sherlock:knowledge-open')))
    expect((await act({ action: 'filter', revision: initial.revision, filter: {} })).error).toContain('筛选条件已变化')
    expect(await library.getByText('启用记忆', { exact: true }).isVisible()).toBe(true)
    const current = (await act({ action: 'inspect' })).result
    const response = await act({ action: 'filter', revision: current.revision, filter: { folderId: 'f', formats: ['ppt'] } })
    expect(response).toMatchObject({ result: { count: 1, section: 'files', documents: [{ name: '演示文稿.pptx' }] }, rendered: ['演示文稿.pptx'] })
    const undone = await act({ action: 'undo', revision: response.result.revision })
    expect(undone.result.count).toBe(3)
    expect(undone.rendered).toHaveLength(3)
    const filteredAgain = (await act({ action: 'filter', revision: undone.result.revision, filter: { formats: ['ppt'] } })).result
    const undoReceipt = revision => page.evaluate(revision => !document.dispatchEvent(new CustomEvent('sherlock:knowledge-filter-undo',
      { cancelable: true, detail: { revision } })), revision)
    await expect.poll(() => library.locator('[data-knowledge-undo-revision]').getAttribute('data-knowledge-undo-revision')).toBe(filteredAgain.revision)
    expect(await undoReceipt(response.result.revision)).toBe(false)
    expect(await undoReceipt(filteredAgain.revision)).toBe(true)
    await expect.poll(() => library.locator('tbody tr').count()).toBe(3)
    expect(await undoReceipt(filteredAgain.revision)).toBe(false)
  } finally { await page.close() }
})

it('waits for a shared directory before reporting results and discards the request if the user navigates away', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent('<div class="pI_x6G_centerCol" style="position:fixed;inset:10px 10px 10px 250px"></div>')
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库' })
    await library.getByRole('button', { name: /消费行业周报.md/ }).first().waitFor()
    const request = () => page.evaluate(() => {
      window.applyKnowledgeAction({ id: 'inspect', action: 'inspect' })
      window.waitForSharedCatalog = new Promise(resolve => { window.completeSharedCatalog = resolve })
      const { revision } = window.knowledgeActionResult.result
      window.applyKnowledgeAction({ id: 'shared', action: 'filter', revision, filter: { category: 'received', sharedCategory: '行业研究' } })
    })
    const resolve = () => page.evaluate(() => window.completeSharedCatalog([{
      id: 'shared-test', name: '行业梳理.pdf', size: 2048, updatedAt: 3, source: 'upload',
      saved: false, starred: false, received: { category: '行业研究', owner: '同事' }
    }]))
    await request()
    expect(await page.evaluate(() => window.knowledgeActionResult.id)).toBe('inspect')
    await library.getByRole('button', { name: '返回工作区' }).click()
    await resolve()
    await expect.poll(() => page.evaluate(() => window.knowledgeActionResult.error)).toMatch(/工作区|筛选条件已变化/)
    await page.evaluate(() => window.dispatchEvent(new Event('sherlock:knowledge-open')))
    await library.getByRole('button', { name: /消费行业周报.md/ }).first().waitFor()
    await request()
    await page.evaluate(() => window.applyKnowledgeAction({ id: 'shared', action: 'cancel' }))
    await resolve()
    expect(await page.evaluate(() => window.knowledgeActionResult.id)).toBe('inspect')
    expect(await library.getByRole('heading', { name: '所有文件' }).isVisible()).toBe(true)
    await request()
    await resolve()
    await expect.poll(() => page.evaluate(() => window.knowledgeActionResult.result?.count)).toBe(1)
    expect(await page.evaluate(() => window.rowsAtKnowledgeReply)).toEqual(['行业梳理.pdf'])
  } finally { await page.close() }
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
      const css = getComputedStyle(tile)
      return {
        format: tile.dataset.format, background: css.backgroundColor, highlight: css.backgroundImage,
        cover: getComputedStyle(svg.children[2]).fill, pageDetail: svg.children[1].getAttribute('d'),
        viewBox: svg.getAttribute('viewBox')
      }
    }))
    expect(new Set(styles.map(style => style.background)).size).toBe(1)
    expect(new Set(styles.map(style => style.cover)).size).toBe(9)
    expect(new Set(styles.map(style => style.pageDetail)).size).toBe(9)
    const pdf = styles.find(style => style.format === 'pdf')
    const ppt = styles.find(style => style.format === 'ppt')
    expect(pdf.cover).toBe('rgb(169, 42, 58)')
    expect(ppt.cover).toBe('rgb(190, 72, 30)')
    expect(pdf.pageDetail).not.toBe(ppt.pageDetail)
    for (const style of styles) {
      expect(style.viewBox).toBe('0 0 24 24')
      expect(style.background).toBe(theme === 'dark' ? 'rgb(48, 48, 50)' : 'rgb(238, 239, 241)')
      expect(style.highlight).toBe('none')
    }
    if (process.env.KNOWLEDGE_QA_SCREENSHOT) {
      await library.getByRole('table').screenshot({
        path: process.env.KNOWLEDGE_QA_SCREENSHOT.replace('.png', '-tiles-' + theme + '.png')
      })
    }
    const checkGeometry = async surface => {
      const popup = surface.getByRole('group', { name: '筛选文件' })
      const geometry = await popup.getByRole('checkbox').evaluateAll(inputs => inputs.map(input => {
        const box = input.getBoundingClientRect()
        const label = input.nextElementSibling.getBoundingClientRect()
        return {
          width: box.width, height: box.height, gap: label.left - box.right,
          centered: Math.abs((box.top + box.height / 2) - (label.top + label.height / 2)) < .5,
          appearance: getComputedStyle(input).appearance
        }
      }))
      expect(geometry.length).toBe(14)
      expect(geometry.every(box => box.width === 14 && box.height === 14 && box.gap === 8 &&
        box.centered && box.appearance === 'none')).toBe(true)
      const limited = popup.getByRole('checkbox', { name: '不限', exact: true })
      expect(await limited.last().isChecked()).toBe(true)
      const markdown = popup.getByRole('checkbox', { name: 'Markdown', exact: true })
      await markdown.focus()
      await markdown.press('Space')
      expect(await markdown.isChecked()).toBe(true)
      expect(await limited.last().isChecked()).toBe(false)
      expect(await markdown.evaluate(input => getComputedStyle(input, '::after').content)).toBe('""')
      return popup
    }
    const panelFilter = pane.getByRole('button', { name: '筛选', exact: true })
    await panelFilter.click()
    const panelPopup = await checkGeometry(pane)
    await panelPopup.getByRole('button', { name: '重置' }).click()
    await panelPopup.getByRole('button', { name: '完成' }).click()
    const filter = library.getByRole('button', { name: '筛选', exact: true })
    await filter.click()
    const popup = await checkGeometry(library)
    expect(await popup.evaluate(el => getComputedStyle(el).animationName)).toBe('none')
    if (process.env.KNOWLEDGE_QA_SCREENSHOT) {
      await popup.screenshot({ path: process.env.KNOWLEDGE_QA_SCREENSHOT.replace('.png', '-filter-' + theme + '.png') })
    }
    await popup.getByRole('button', { name: '完成' }).click()
    expect(await filter.evaluate(button => {
      const css = getComputedStyle(button)
      return { shadow: css.boxShadow, left: css.paddingLeft, right: css.paddingRight, motion: css.transitionDuration, count: button.lastElementChild.textContent }
    })).toEqual({ shadow: 'none', left: '11px', right: '11px', motion: '0s', count: '1' })
    const file = library.getByRole('button', { name: /研究写作规范.md/ }).first()
    const appearance = async () => file.evaluate(el => {
      const tile = el.querySelector('.knowledge-file-icon')
      const sample = document.createElement('canvas').getContext('2d')
      const paint = css => { sample.fillStyle = css; sample.fillRect(0, 0, 1, 1) }
      const luminance = () => [...sample.getImageData(0, 0, 1, 1).data].slice(0, 3)
        .map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0)
      const tileStyle = getComputedStyle(tile)
      const [sheet, , cover, mark] = tile.querySelector('svg').children
      const row = getComputedStyle(el.closest('td')).backgroundColor
      const coverColor = getComputedStyle(cover).fill
      paint(coverColor)
      const background = luminance()
      paint(getComputedStyle(mark).stroke)
      const ink = luminance()
      return {
        foreground: coverColor,
        sheet: getComputedStyle(sheet).fill,
        contrast: (Math.max(ink, background) + .05) / (Math.min(ink, background) + .05),
        row,
        tile: tileStyle.backgroundColor,
        geometry: [tile.offsetWidth, tile.offsetHeight],
        fill: tile.querySelector('svg').getAttribute('fill')
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
      expect(state.sheet).toBe('rgb(248, 248, 250)')
      expect(state.contrast).toBeGreaterThan(4.5)
      expect(state.geometry).toEqual(normal.geometry)
      expect(state.fill).toBe('currentColor')
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

it('keeps shared categories and metadata readable as both desktop sidebars narrow the list', async () => {
  const page = await browser.newPage({ viewport: { width: 1720, height: 900 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent('<div class="pI_x6G_centerCol" style="position:fixed;inset:10px 360px 10px 280px"></div>')
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    expect(await library.locator('.knowledge-header .knowledge-panel-toggle').count()).toBe(0)
    await library.getByRole('button', { name: /他人共享/ }).click()
    const category = library.getByRole('button', { name: '行业研究', exact: true })
    await category.click()
    const all = library.getByRole('button', { name: '全部文件', exact: true })
    expect(await all.locator('svg[aria-hidden=true]').count()).toBe(1)
    const title = library.locator('.knowledge-file-title > span:first-child')
    await title.waitFor()
    const table = library.locator('.knowledge-table-wrap')
    const metadata = library.locator('.knowledge-shared-metadata')
    const owner = table.locator('tbody td:last-child')
    const date = table.locator('tbody td > time')
    const size = table.locator('tbody td:nth-child(2)')
    const assertDividers = () => library.evaluate(el => {
      const heading = el.querySelector('.knowledge-shared-heading').getBoundingClientRect()
      const folders = el.querySelector('.knowledge-shared-folders')
      const split = folders.getBoundingClientRect()
      const headers = el.querySelector('.knowledge-table thead').getBoundingClientRect()
      const navigation = el.querySelector('.knowledge-navigation').getBoundingClientRect()
      return {
        beginsBelowHeaders: Math.abs(split.top - headers.bottom) < 1 && Math.abs(heading.bottom - headers.bottom) < 1,
        continuousHeader: Math.abs(heading.right - headers.left) < 1,
        alignedBottom: Math.abs(split.bottom - navigation.bottom) < 1,
        selectedInset: split.right - folders.querySelector('[aria-current]').getBoundingClientRect().right,
        tableInset: headers.left - split.right
      }
    })
    const expectAligned = async () => expect(await assertDividers()).toEqual({
      beginsBelowHeaders: true, continuousHeader: true, alignedBottom: true, selectedInset: 9, tableInset: 8
    })
    for (const width of [1720, 1380, 1240, 1100]) {
      const wide = width === 1720
      await page.setViewportSize({ width, height: 900 })
      await expect.poll(() => library.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(width - 640)
      expect(await category.locator('span').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      expect(await all.locator('span').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      expect((await category.boundingBox()).x - (await all.boundingBox()).x).toBe(8)
      expect(await title.evaluate(el => el.clientWidth)).toBeGreaterThanOrEqual(100)
      expect(await table.evaluate(el => el.scrollWidth - el.clientWidth), `at ${width}px`).toBeLessThanOrEqual(2)
      expect(await size.isVisible()).toBe(wide)
      expect(await metadata.getByText('行业研究', { exact: true }).isVisible()).toBe(true)
      expect(await metadata.locator('.knowledge-shared-inline-size').isVisible()).toBe(!wide)
      expect(await date.isVisible()).toBe(width >= 1380)
      expect(await metadata.locator('time').isVisible()).toBe(width < 1380)
      expect(await owner.isVisible()).toBe(width >= 1240)
      if (width >= 1240) expect(await owner.evaluate(el => el.scrollWidth - el.clientWidth), `owner at ${width}px`).toBeLessThanOrEqual(0)
      expect(await metadata.locator('.knowledge-shared-inline-owner').isVisible()).toBe(width === 1100)
      await expectAligned()
    }
    await library.getByRole('button', { name: '筛选', exact: true }).click()
    await library.getByRole('checkbox', { name: 'Markdown', exact: true }).check()
    await library.getByRole('button', { name: '完成', exact: true }).click()
    await library.getByPlaceholder('搜索他人共享…').fill('渠道')
    await library.getByPlaceholder('搜索他人共享…').press('Escape')
    await all.click()
    expect(await all.getAttribute('aria-current')).toBe('page')
    expect(await category.getAttribute('aria-current')).toBeNull()
    expect(await library.getByPlaceholder('搜索他人共享…').inputValue()).toBe('渠道')
    expect(await library.getByText('Markdown', { exact: true }).isVisible()).toBe(true)
    expect(await title.textContent()).toBe('渠道调研验收.md')
    await library.getByRole('button', { name: '清除筛选', exact: true }).click()
    await category.click()
    await page.evaluate(() => {
      const catalog = Array.from({ length: 22 }, (_, index) => ({
        id: `shared-layout-set-${index}`, name: `行业共享验收-${index}.md`,
        source: 'upload', size: 1024, updatedAt: index,
        starred: false, saved: false, received: { owner: '验收所有者', category: '行业研究' }
      }))
      document.dispatchEvent(new CustomEvent('sherlock:knowledge-shared-catalog', { detail: catalog }))
    })
    const pager = library.getByRole('navigation', { name: '文件分页' })
    await pager.waitFor()
    await expectAligned()
    await pager.getByRole('button', { name: '下一页' }).click()
    expect(await pager.getByRole('button', { name: '第 2 页', exact: true }).getAttribute('aria-current')).toBe('page')
    await expectAligned()
  } finally { await page.close() }
})

it('paginates files and native sessions in groups of 20 with a fixed footer', async () => {
  const page = await browser.newPage({ viewport: { width: 1150, height: 650 }, reducedMotion: 'reduce' })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({
      contentType: 'text/html', body: `<!doctype html>
        <body data-test-pagination><div class="pI_x6G_centerCol" style="position:fixed;inset:10px"></div></body>`
    }))
    await page.goto('https://knowledge.test/')
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    const nav = library.getByRole('navigation', { name: '知识库分类' })
    const pager = library.getByRole('navigation', { name: /分页/ })
    const previous = pager.getByRole('button', { name: '上一页' })
    const next = pager.getByRole('button', { name: '下一页' })
    const position = async () => (await pager.boundingBox()).y

    for (const label of ['所有文件', '手动收藏', '重点文件', '我的共享', '研究资料', '他人共享', '行业研究',
      '研究模式', '笔记模式', '表格模式']) {
      const category = label === '行业研究' ? library.getByRole('button', { name: label, exact: true })
        : nav.getByRole('button', { name: new RegExp('^' + label + '( |$)') })
      await category.click()
      const session = label.endsWith('模式')
      const scroller = library.locator(session ? '.knowledge-session-results' : '.knowledge-table-wrap')
      const rows = scroller.locator(session ? 'li' : 'tbody tr')
      await expect.poll(() => rows.count(), label).toBe(20)
      expect(await pager.getByRole('button', { name: '第 1 页', exact: true }).getAttribute('aria-current')).toBe('page')
      expect(await previous.isDisabled()).toBe(true)
      const firstPage = await rows.first().innerText()
      const anchor = await position()
      expect((await previous.boundingBox()).x).toBe((await pager.boundingBox()).x)
      expect(await scroller.evaluate(el => getComputedStyle(el).paddingInlineEnd)).toBe('12px')
      await scroller.evaluate(el => { el.scrollTop = el.scrollHeight })
      expect(await scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
      expect(await position()).toBe(anchor)
      await next.click()
      expect(await pager.getByRole('button', { name: '第 2 页', exact: true }).getAttribute('aria-current')).toBe('page')
      expect(await rows.count()).toBe(20)
      expect(await rows.first().innerText()).not.toBe(firstPage)
      expect(await scroller.evaluate(el => el.scrollTop)).toBe(0)
      const jump = pager.getByRole('spinbutton', { name: '跳至页码' })
      await jump.fill('10')
      await jump.press('Enter')
      expect(await rows.count()).toBe(20)
      await jump.fill('3')
      await jump.press('Enter')
      expect(await rows.count()).toBe(3)
      expect(await next.isDisabled()).toBe(true)
      expect(await position()).toBe(anchor)
      await pager.getByRole('button', { name: '第 1 页', exact: true }).click()
      expect(await rows.first().innerText()).toBe(firstPage)
      if (session) {
        await library.getByRole('searchbox', { name: '搜索会话' }).fill('不存在的会话')
        expect(await pager.getByText('1 / 1', { exact: true }).isVisible()).toBe(true)
        expect(await previous.isDisabled()).toBe(true)
        expect(await next.isDisabled()).toBe(true)
        expect(await position()).toBe(anchor)
      }
    }
    await page.evaluate(() => {
      const row = window.data.documents[0]
      window.data.documents.push(...Array.from({ length: 160 }, (_, index) => ({
        ...row, id: 'extra-page-' + index, name: '追加分页-' + index + '.md'
      })))
      document.dispatchEvent(new Event('sherlock:knowledge-changed'))
    })
    await nav.getByRole('button', { name: /^所有文件/ }).click()
    await pager.getByRole('button', { name: '第 11 页', exact: true }).waitFor()
    expect(await pager.locator('.knowledge-pagination-number').count()).toBe(7)
    const jump = pager.getByRole('spinbutton', { name: '跳至页码' })
    await jump.fill('8')
    await pager.getByRole('button', { name: '跳转', exact: true }).click()
    expect(await pager.getByRole('button', { name: '第 8 页', exact: true }).getAttribute('aria-current')).toBe('page')
  } finally { await page.close() }
})

it('shows file progress in the selected folder and supports retry and cancellation without duplicate entries', async () => {
  const page = await browser.newPage({ viewport: { width: 1380, height: 900 }, reducedMotion: 'no-preference' })
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
    expect(await pending.getByRole('progressbar').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
    await page.evaluate(() => window.finishImport('上传成功.md', '模拟复制失败'))
    await pending.getByRole('button', { name: '重试 上传成功.md' }).click()
    await page.evaluate(() => window.finishImport('上传成功.md'))
    await pending.getByRole('status').filter({ hasText: '上传完成' }).waitFor({ timeout: 2500 })
    expect(await pending.getByRole('progressbar').getAttribute('value')).toBe('16384')
    expect(await pending.getByRole('progressbar').evaluate(el => getComputedStyle(el).animationName)).toBe('knowledge-feedback-in')
    expect(await pending.getByRole('button', { name: '上传成功.md的更多操作' }).count()).toBe(1)
    expect(await pending.count()).toBe(1)
    const cancelled = library.getByRole('row', { name: /上传取消.pdf/ })
    await cancelled.getByRole('button', { name: '取消 上传取消.pdf' }).click()
    await expect.poll(() => cancelled.count()).toBe(0)
    expect(await page.evaluate(() => window.data.documents.find(file => file.name === '上传成功.md').folderId)).toBe('f')
  } finally { await page.close() }
})

it('reuses a manual search without moving the field or losing the format filter', async () => {
  const page = await browser.newPage({ viewport: { width: 1380, height: 900 } })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent('<div class="pI_x6G_centerCol" style="position:fixed;inset:10px 10px 10px 250px"></div>')
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    await library.getByRole('button', { name: '筛选', exact: true }).click()
    await library.getByRole('checkbox', { name: 'Markdown', exact: true }).check()
    await library.getByRole('button', { name: '完成' }).click()
    const field = library.getByRole('textbox', { name: '搜索文件' })
    const idle = await field.boundingBox()
    await field.fill('周报')
    expect(await field.boundingBox()).toEqual(idle)
    await field.press('Enter')
    await library.getByRole('button', { name: '清除搜索' }).click()
    expect(await field.inputValue()).toBe('')
    const recent = library.getByRole('group', { name: '最近搜索' })
    await field.press('ArrowDown')
    await recent.getByRole('button', { name: '周报' }).press('Enter')
    expect(await field.inputValue()).toBe('周报')
    await library.getByText('找到 1 个文件').waitFor()
    expect(await library.getByRole('button', { name: /消费行业周报.md/ }).count()).toBe(2)
    expect(await library.getByText('Markdown', { exact: true }).count()).toBe(1)
    await library.getByRole('button', { name: '清除搜索' }).click()
    await field.press('Escape')
    expect(await recent.count()).toBe(0)
  } finally { await page.close() }
})

it('switches the right knowledge pane to the shared memory settings and keeps the file search on return', async () => {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  page.setDefaultTimeout(2200)
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent(`
      <div class="pI_x6G_centerCol" style="position:fixed;inset:10px 360px 10px 10px"></div>
      <aside data-knowledge-panel-host style="position:fixed;top:10px;right:10px;width:340px;height:720px"></aside>`)
    await page.addScriptTag({ content: bundle })
    const pane = page.getByRole('region', { name: '知识库资料' })
    const files = pane.getByRole('button', { name: '文件资料', exact: true })
    const memory = pane.getByRole('button', { name: '经验记忆', exact: true })
    await pane.getByRole('searchbox', { name: '搜索知识库文件' }).fill('写作')
    await memory.click({ timeout: 1600 })
    expect(await pane.getByRole('searchbox', { name: '搜索知识库文件' }).isVisible()).toBe(false)
    const toggle = pane.getByRole('switch', { name: /启用记忆/ })
    const switchShape = el => {
      const { width, height, appearance } = getComputedStyle(el)
      return { width, height, appearance, thumb: getComputedStyle(el, '::after').width }
    }
    expect(await toggle.evaluate(switchShape)).toEqual({ width: '34px', height: '20px', appearance: 'none', thumb: '14px' })
    await toggle.check()
    expect(await pane.getByText('记忆.md').isVisible()).toBe(true)
    await files.click()
    expect(await pane.getByRole('searchbox', { name: '搜索知识库文件' }).inputValue()).toBe('写作')
    expect(await pane.getByRole('button', { name: /研究写作规范.md/ }).first().isVisible()).toBe(true)
    await memory.click()
    await expect.poll(() => toggle.isChecked()).toBe(true)
    await pane.getByRole('button', { name: '打开完整知识库' }).click()
    const library = page.getByRole('region', { name: '知识库', exact: true })
    const fullMemory = library.getByRole('region', { name: '经验记忆' })
    await fullMemory.waitFor()
    const fullToggle = library.getByRole('switch', { name: /启用记忆/ })
    expect(await fullToggle.isChecked()).toBe(true)
    expect(await fullToggle.evaluate(switchShape)).toEqual(await toggle.evaluate(switchShape))
    for (const context of [fullMemory, pane.getByRole('region', { name: '经验记忆' })]) {
      await context.getByRole('heading', { name: '记忆验收正文' }).waitFor()
      expect(await context.getByRole('button', { name: '预览与编辑' }).count()).toBe(0)
      expect(await context.getByRole('dialog').count()).toBe(0)
      const title = context.getByRole('heading', { name: '记忆.md' })
      expect(await title.evaluate(node => {
        const tabs = node.parentElement.querySelector('[role=tablist]')
        return tabs && tabs.getBoundingClientRect().left > node.getBoundingClientRect().right &&
          Math.abs(tabs.getBoundingClientRect().right - node.parentElement.getBoundingClientRect().right) < 1
      })).toBe(true)
    }
    await fullMemory.getByRole('tab', { name: '编辑', exact: true }).click()
    await fullMemory.getByRole('textbox', { name: '记忆 Markdown 内容' }).fill('## 保存后直接预览')
    await fullMemory.getByRole('button', { name: '保存', exact: true }).click()
    await fullMemory.getByRole('heading', { name: '保存后直接预览' }).waitFor()
    await fullMemory.getByRole('tab', { name: '编辑', exact: true }).click()
    await fullMemory.getByRole('textbox', { name: '记忆 Markdown 内容' }).fill('未保存草稿')
    await fullMemory.getByRole('button', { name: '取消', exact: true }).click()
    await fullMemory.getByRole('heading', { name: '保存后直接预览' }).waitFor()
    await files.click()
    await pane.getByRole('button', { name: '打开完整知识库' }).click()
    await library.getByRole('textbox', { name: '搜索文件' }).waitFor()
  } finally { await page.close() }
})

it('aligns folder counts and more actions while keeping long headings clear of the file controls', async () => {
  const name = '季度渠道库存与重点公司经营数据跟踪方案及历次研究会议材料'.repeat(4)
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  try {
    await page.route('https://knowledge.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
    await page.goto('https://knowledge.test/')
    await page.setContent(`<body data-test-folder-name="${name}"><div class="pI_x6G_centerCol"
      style="position:fixed;inset:10px 340px 10px 120px"></div></body>`)
    await page.addScriptTag({ content: bundle })
    const library = page.getByRole('region', { name: '知识库', exact: true })
    const nav = library.getByRole('navigation', { name: '知识库分类' })
    const folder = nav.locator('.knowledge-folder')
    const row = folder.getByRole('button').first()
    const label = row.locator('[data-odyssey-truncated-tooltip]')
    const number = folder.locator('small')
    const category = nav.getByRole('button', { name: /所有文件/ }).locator('small')
    const menu = folder.locator('.knowledge-folder-menu')
    const add = nav.getByRole('button', { name: '新建文件夹' })
    const tooltip = page.getByRole('tooltip')
    const center = async target => {
      const box = await target.boundingBox()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    await row.waitFor()
    expect(await number.textContent()).toBe('2')
    expect(await menu.isVisible()).toBe(false)
    expect((await center(number)).x).toBe((await center(category)).x)
    await label.hover()
    await tooltip.waitFor()
    expect(await tooltip.textContent()).toBe(name)
    expect(await number.evaluate(el => getComputedStyle(el).opacity)).toBe('0')
    expect(await center(menu)).toEqual(await center(number))
    await menu.hover()
    expect(await center(menu.locator('svg'))).toEqual(await center(menu))
    expect(await menu.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
    await menu.click()
    expect(await library.getByRole('button', { name: '重命名文件夹' }).isVisible()).toBe(true)
    await page.keyboard.press('Escape')
    await row.click()
    const heading = library.getByRole('heading', { name })
    const filter = library.getByRole('button', { name: '筛选', exact: true })
    const search = library.getByRole('textbox', { name: '搜索文件' })
    const upload = library.getByRole('button', { name: '添加文件', exact: true })
    const separated = (left, right) => left.x + left.width <= right.x + 1 || left.y + left.height <= right.y + 1
    for (const width of [1280, 1060, 910, 800]) {
      await page.setViewportSize({ width, height: 900 })
      await expect.poll(() => library.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(width - 460)
      const layout = await Promise.all([heading, filter, search, upload].map(target => target.boundingBox()))
      const [titleBox, filterBox, searchBox, uploadBox] = layout
      expect(layout.every(box => box && box.width > 0), `at ${width}px`).toBe(true)
      expect(await heading.evaluate(el => el.scrollWidth > el.clientWidth && getComputedStyle(el).textOverflow === 'ellipsis')).toBe(true)
      expect(separated(titleBox, filterBox) && separated(filterBox, searchBox) && separated(searchBox, uploadBox)).toBe(true)
      expect(uploadBox.x + uploadBox.width).toBeLessThanOrEqual(width - 340)
      expect((await center(number)).x).toBe((await center(category)).x)
      expect((await center(add.locator('svg'))).x).toBe((await center(category)).x)
      expect(await nav.locator(':scope > button > span').evaluateAll(labels =>
        labels.every(el => el.scrollWidth <= el.clientWidth)), `category labels fit at ${width}px`).toBe(true)
    }
    await heading.hover()
    expect(await tooltip.textContent()).toBe(name)
    expect(await number.evaluate(el => getComputedStyle(el).opacity)).toBe('1')
    expect(await menu.isVisible()).toBe(false)

    await page.evaluate(() => {
      window.applyKnowledgeAction({ id: 'inspect-folder', action: 'inspect' })
      window.applyKnowledgeAction({ id: 'filter-long-folder', action: 'filter',
        revision: window.knowledgeActionResult.result.revision, filter: { folderId: 'f', formats: ['markdown'] } })
    })
    const summary = library.locator('.knowledge-filter-summary')
    const folderTag = summary.getByText(name, { exact: true })
    await folderTag.waitFor()
    expect(await folderTag.evaluate(el => el.scrollWidth > el.clientWidth && getComputedStyle(el).textOverflow === 'ellipsis')).toBe(true)
    expect(await summary.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await folderTag.hover()
    expect(await tooltip.textContent()).toBe(name)
    await summary.getByRole('button', { name: '撤销', exact: true }).click()
    await folderTag.waitFor({ state: 'detached' })
    expect(await heading.isVisible()).toBe(true)
    expect(await upload.isVisible()).toBe(true)
  } finally { await page.close() }
})
