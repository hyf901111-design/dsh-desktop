import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { runInNewContext } from 'node:vm'

const native = vi.hoisted(() => ({ templates: [] }))
vi.mock('electron', () => ({
  Menu: { buildFromTemplate: items => { native.templates.push(items); return { popup() {} } } },
  clipboard: { writeText() {} }, shell: { showItemInFolder() {}, openExternal() {} },
  ipcMain: { removeHandler() {}, handle() {} }
}))
import { installContextMenu } from '../src/main/context-menu'

const documents = []
beforeEach(() => { native.templates.length = 0 })
afterEach(() => { for (const dom of documents.splice(0)) dom.window.close() })

async function rightClick(markup, selector, params = {}) {
  const dom = new JSDOM(markup)
  documents.push(dom)
  const document = dom.window.document
  const target = document.querySelector(selector)
  Object.defineProperty(document, 'elementFromPoint', { value: () => target })
  const handlers = {}
  const context = { document, window: dom.window, performance: dom.window.performance, Element: dom.window.Element }
  const window = {
    isDestroyed: () => false,
    webContents: {
      on: (name, callback) => { handlers[name] = callback },
      executeJavaScript: async script => runInNewContext(script, context)
    }
  }
  installContextMenu(window, () => 'zh')
  target.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true }))
  await handlers['context-menu']({}, {
    x: 20, y: 30, isEditable: false, selectionText: '', linkURL: '', hasImageContents: false,
    editFlags: { canUndo: true, canRedo: false, canCut: true, canCopy: true, canPaste: true, canSelectAll: true },
    ...params
  })
  return native.templates.flat()
}

const home = (content = '') => `<div class="pI_x6G_centerCol" id="center">
  <div data-odyssey-home-theme-background><canvas id="background"></canvas></div>
  <main class="wSkVaW_root" data-odyssey-page="home" id="home">
    <div data-center-composer-host><h1 id="headline">探索更远，洞见更深</h1>${content}</div>
  </main></div>`

describe('home background native context menu', () => {
  it.each(['#center', '#home', '#headline', '#background'])('does not open a menu for %s, including stale selected file text', async selector => {
    const items = await rightClick(home(), selector, { selectionText: '/tmp' })
    expect(items).toEqual([])
  })

  it.each(['#shortcuts', '#shortcut'])('lets the renderer own right-clicks on %s', async selector => {
    const items = await rightClick(home('<nav data-home-app-shortcuts id="shortcuts"><button id="shortcut">浏览器</button></nav>'), selector)
    expect(items).toEqual([])
  })

  it('keeps the composer editing menu inside the same home', async () => {
    const items = await rightClick(home('<textarea id="composer"></textarea>'), '#composer', { isEditable: true })
    expect(items.filter(item => item.role).map(item => item.role)).toEqual(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'])
  })

  it('keeps a clicked local file action inside the home', async () => {
    const items = await rightClick(home('<button title="/tmp"><code id="file">文件夹</code></button>'), '#file')
    expect(items.map(item => item.label)).toContain('在 Finder 中显示')
  })

  it('keeps links and images inside the home', async () => {
    const links = await rightClick(home('<a id="link" href="https://example.com">文档</a>'), '#link', { linkURL: 'https://example.com' })
    expect(links.map(item => item.label)).toContain('复制链接地址')
    native.templates.length = 0
    const images = await rightClick(home('<img id="image" src="data:image/png;base64,">'), '#image', { hasImageContents: true })
    expect(images.map(item => item.label)).toContain('复制图片')
  })

  it.each([
    ['conversation', '<section data-odyssey-page="conversation"><p id="content">回答</p></section>'],
    ['research', '<section data-odyssey-page="research"><p id="content">研究</p></section>'],
    ['subagent', '<section data-odyssey-subagent-panel><p id="content">子会话</p></section>'],
    ['dialog', '<section role="dialog"><p id="content">对话框</p></section>']
  ])('keeps content menus for %s nested in the home shell', async (_name, content) => {
    const items = await rightClick(home(content), '#content', { selectionText: '选中文本' })
    expect(items.map(item => item.role)).toContain('copy')
  })

  it('keeps a normal conversation background menu', async () => {
    const items = await rightClick('<main data-odyssey-page="conversation" id="conversation"></main>', '#conversation')
    expect(items.map(item => item.role)).toEqual(['selectAll'])
  })
})
