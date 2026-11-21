import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { KnowledgeStore } from '../src/main/knowledge/store'
import { PresentationStore } from '../src/main/presentation/store'
import { readDroppedPresentation } from '../src/main/presentation/import-file'
import { handleEditorAsset } from '../src/main/presentation/protocol'

const title = '人工智能周期与资产配置.pptx'
const editor = 'http://127.0.0.1:31995', app = 'http://localhost:31996'
let browser, bundle, library, decks, file, root, original
beforeAll(async () => {
  const playwright = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright')
  browser = await playwright.chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
  root = await mkdtemp(join(tmpdir(), 'presentation-drop-'))
  library = new KnowledgeStore(root, () => ({ owner: 'reader', generation: 1 }), () => {})
  decks = new PresentationStore(root)
  original = await readFile(resolve('packages/dsh-research-task-runtime/assets/home-presentation/company-research-briefing.pptx'))
  file = await library.ensurePresentationGuideSource(title, original, true)
  const result = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      import { mountKnowledgePanels } from './src/preload/knowledge/panel'
      import { mountPresentation } from './src/preload/presentation/view'
      import { preparePresentationGuideDrop } from './src/preload/presentation/knowledge-drop'
      const ipc = { async invoke(channel, method, args) {
        const result = await window.invokeMain(channel, method, args)
        if (result?.encoded) result.bytes = Uint8Array.from(atob(result.encoded), c => c.charCodeAt(0))
        return result
      }, on() {}, removeListener() {} }
      mountPresentation(document, ipc)
      mountKnowledgePanels(document, { snapshot: () => ipc.invoke('knowledge:request', 'snapshot') })
      window.prepare = async session => window.guide = await preparePresentationGuideDrop(document, session, ipc, {
        async waitFor(check, message) {
          for (let i=0; i<200; i++) { if (check()) return; await new Promise(resolve=>setTimeout(resolve, 25)) }
          throw Error(message)
        }, async cue() {}
      })
    ` }, bundle: true, write: false, format: 'iife', platform: 'browser',
    plugins: [{ name: 'inline-assets', setup(builder) {
      builder.onResolve({filter: /\?(raw|inline)$/}, args => ({ path: resolve(args.resolveDir, args.path.split('?')[0]), namespace: 'inline-assets' }))
      builder.onLoad({ filter: /.*/, namespace: 'inline-assets' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }))
    } }]
  })
  bundle = result.outputFiles[0].text.replaceAll('odyssey-presentation://editor', editor)
}, 20000)
afterAll(async () => { await browser?.close(); decks?.close(); if (root) await rm(root, { recursive: true, force: true }) })

async function openPage(session, editable) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  const key = { owner: 'reader', sessionId: session }
  await page.exposeFunction('invokeMain', async (channel, action, args) => {
    if (channel === 'knowledge:presentation-guide-source') return file
    if (action === 'snapshot') return library.snapshot()
    if (action === 'presentation-drop-file') {
      const source = await library.file(args.id)
      const { bytes, name } = await readDroppedPresentation(source.document, args.label, source.path)
      return { encoded: bytes.toString('base64'), name }
    }
    if (action === 'load') return { record: decks.read(key), recent: [], generation: '1', owner: 'reader', editable }
    if (action === 'save') {
      if (!editable) throw Error('只读')
      return decks.save(key, args.revision, args.deck, args.create)
    }
    if (action === 'position') return
    throw Error('Unexpected method: ' + action)
  })
  await page.route(app + '/**', route => route.fulfill({ contentType: 'text/html', body: `<style>
    .pI_x6G_centerCol{position:relative;width:770px;height:700px}#odyssey-right-workspace-panel{position:absolute;left:790px;top:10px;width:350px;height:680px}
    [data-knowledge-panel-host]{height:100%}</style><button data-odyssey-panel-entry="right" aria-expanded="true"></button>
    <div class="pI_x6G_centerCol"><main data-odyssey-page="presentation"><div data-ework-presentation-view="${session}"></div></main></div>
    <aside id="odyssey-right-workspace-panel"><div data-knowledge-panel-host data-knowledge-panel-session="${session}"></div></aside>` }))
  await page.route(editor + '/**', async route => {
    const response = await handleEditorAsset(process.cwd(), new Request('odyssey-presentation://editor' + new URL(route.request().url()).pathname))
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
  })
  await page.goto(app)
  await page.addScriptTag({ content: bundle })
  await page.locator('[data-presentation-empty-ready=true]').waitFor()
  return { page, key, frame: page.frameLocator('[data-ework-presentation-view] > iframe') }
}

it('imports the actual company deck through both native mouse drag and guide drag as independent editable documents', async () => {
  const ids = []
  for (const session of ['manual', 'guide']) {
    const { page, key, frame } = await openPage(session, true)
    try {
      if (session === 'manual') {
        const row = page.locator('[data-knowledge-file-id="' + file.fileId + '"]')
        const rect = await row.boundingBox()
        await page.mouse.move(rect.x + 9, rect.y + 9)
        await page.mouse.down()
        await page.mouse.move(rect.x + 28, rect.y + 9, { steps: 5 })
        await page.locator('[data-presentation-knowledge-drop]:visible').waitFor()
        await page.mouse.move(380, 380, { steps: 10 })
        await page.mouse.move(380, 381)
        await page.locator('[data-presentation-knowledge-drop][data-over=true]').waitFor({ timeout: 5000 })
        await page.mouse.up()
      } else {
        await page.evaluate(async () => {
          await window.prepare('guide')
          const transfer = window.guide.begin()
          await window.guide.drop(transfer)
        })
      }
      await frame.locator('.slide-area .viewport').waitFor()
      const record = decks.read(key)
      expect(record.deck.title).toBe(title.replace('.pptx', ''))
      expect(record.deck.slides).toHaveLength(20)
      ids.push(record.deck.id)
      expect(await readFile((await library.file(file.fileId)).path)).toEqual(original)
    } finally { await page.close() }
  }
  expect(new Set(ids).size).toBe(2)
}, 60000)

it('keeps a read-only blank session untouched and rejects an invalid PowerPoint source', async () => {
  const { page, frame, key } = await openPage('read-only', false)
  try {
    const error = await page.evaluate(async () => {
      await window.prepare('read-only')
      try { await window.guide.drop(window.guide.begin()) } catch (err) { return err.message }
    })
    expect(error).toContain('只读')
    expect(await frame.locator('.empty-notice').textContent()).toContain('只读')
    expect(decks.read(key).deck).toBeNull()
    await expect(readDroppedPresentation({ name: title, size: 16 }, title, Buffer.from('PK unrelated archive'))).rejects.toThrow('损坏')
  } finally { await page.close() }
}, 20000)
