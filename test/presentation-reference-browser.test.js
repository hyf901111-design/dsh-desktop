import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import {
  installPresentationReferences,
  presentationCodec,
  presentationMessageParts
} from '../scripts/lib/presentation-references.mjs'

it('inserts slide, notes and marker references at the caret in the native conversation draft', async () => {
  const playwright = process.env.PLAYWRIGHT_MODULE_PATH
    ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
    : await import('playwright')
  const browser = await playwright.chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
  try {
    const page = await browser.newPage()
    await page.route('http://localhost/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<body data-ework-presentation-session="s"><div data-research-composer-host><div data-input-backdrop></div><textarea data-odyssey-file-reference-session="s" placeholder="给智能体发消息"></textarea></div></body>'
      })
    )
    await page.goto('http://localhost/')
    const root = 'node_modules/@deepseek-ai/'
    const [runtime, client, css] = await Promise.all([
      readFile(root + 'dsh-client-runtime/lib/client.js', 'utf8'),
      readFile(root + 'dsh-client-ui-conversation/lib/client.js', 'utf8'),
      readFile('src/preload/presentation/view.css', 'utf8')
    ])
    await page.addStyleTag({ content: css })
    await page.evaluate(
      ({ runtime, client, install }) => {
        const fake = new Proxy(function () {}, {
          get: (_, k) => (k === Symbol.toPrimitive ? () => 'unused' : fake),
          apply: () => fake,
          construct: () => ({})
        })
        let nativeRuntime, module
        window.__ModuleLoader__ = {
          load: ({ factory }) => {
            module = factory((name) =>
              name === '@deepseek-ai/dsh-client-runtime/client' ? nativeRuntime : fake
            )
          }
        }
        new Function(runtime)()
        nativeRuntime = module
        new Function(client)()
        const shell = new module.SessionInputShell({
          actx: {},
          inputTriggers: () => ({ track() {} }),
          defaultSink() {}
        })
        const input = document.querySelector('textarea')
        shell.state.subscribe(() => {
          input.value = shell.snapshot.draft
        })
        shell.setDraft('请将改短')
        input.setSelectionRange(2, 2)
        const sessions = { list: { getSnapshot: () => ({ current: 's' }), subscribe: () => () => {} } }
        new Function('return (' + install + ')')()({
          win: window,
          doc: document,
          sessions,
          getInput: () => shell
        })
        window.draft = () => shell.snapshot
        window.select = (data) =>
          window.dispatchEvent(
            new CustomEvent('sherlock:presentation-selection', {
              detail: { sessionId: 's', documentId: 'deck', slideId: 'page', ...data }
            })
          )
      },
      { runtime, client, install: installPresentationReferences.toString() }
    )

    await page.evaluate(() => window.select({ kind: 'element', id: 'title', label: '季度表现' }))
    expect(await page.locator('[data-provisional]').textContent()).toBe('季度表现')
    expect(await page.locator('textarea').evaluate((el) => getComputedStyle(el, '::placeholder').color)).toBe(
      'rgba(0, 0, 0, 0)'
    )
    await page.locator('textarea').focus()
    const first = await page.evaluate(() => window.draft())
    expect(first.draft).toBe('请将\uFFFC 改短')
    const token = await presentationCodec().codec.serialize(first.occurrences[0].ref)
    expect(presentationMessageParts('请将' + token + '改短')).toEqual([
      { text: '请将' },
      { source: 'presentation-reference', label: '季度表现' },
      { text: '改短' }
    ])
    await page.evaluate(() => {
      document.activeElement.blur()
      window.select({ kind: 'notes', start: 2, quote: '续约', label: '续约' })
    })
    await page.locator('textarea').focus()
    await page.evaluate(() => window.select({ kind: 'mark', explicit: true, id: 'm1', label: '标注 1' }))
    expect(
      (await page.evaluate(() => window.draft())).occurrences.map((o) => JSON.parse(o.ref).kind)
    ).toEqual(['element', 'notes', 'mark'])
    await page.evaluate(() => window.select({ kind: 'removed-mark', id: 'm1' }))
    expect((await page.evaluate(() => window.draft())).occurrences).toHaveLength(2)
    await page.evaluate(() =>
      window.select({ kind: 'element', id: 'foreign', label: '另一个会话', sessionId: 'other' })
    )
    expect(await page.locator('[data-provisional]').count()).toBe(0)
  } finally {
    await browser.close()
  }
}, 30000)
