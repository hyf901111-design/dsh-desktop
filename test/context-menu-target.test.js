import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { runInNewContext } from 'node:vm'
import { contextMenuCaptureScript, contextMenuTargetScript } from '../src/main/context-menu-target'
import { resolveFinderPath } from '../src/main/context-menu-template'

describe('right-click file ownership', () => {
  it('uses the clicked file rather than its parent preview path', () => {
    const dom = new JSDOM(`<section data-path="/wrong/preview.pdf" title="/wrong/">
      <button title="outputs/报告.pptx"><code>报告.pptx</code></button>
      <textarea data-odyssey-file-reference-session="session-1"></textarea></section>`)
    const document = dom.window.document
    Object.defineProperty(document, 'elementFromPoint', {value: () => document.querySelector('code')})
    document.querySelector('textarea').getClientRects = () => ({ length: 1 })
    const target = runInNewContext(contextMenuTargetScript(20, 30), {document, window: dom.window, performance: dom.window.performance, Element:dom.window.Element})
    expect(target.targeted).toBe(true)
    expect(target.sessionId).toBe('session-1')
    expect(target.values).not.toContain('/wrong/preview.pdf')
    expect(target.values).not.toContain('/wrong/')
    expect(resolveFinderPath(target.values, () => true, '/workspace')).toBe('/workspace/outputs/报告.pptx')
  })

  it('does not substitute an ancestor directory for a missing file', () => {
    const dom = new JSDOM('<div data-path="/existing"><button title="missing.pptx">missing.pptx</button></div>')
    const document = dom.window.document
    Object.defineProperty(document, 'elementFromPoint', {value: () => document.querySelector('button')})
    const target = runInNewContext(contextMenuTargetScript(0, 0), {document, window: dom.window, performance: dom.window.performance, Element:dom.window.Element})
    expect(resolveFinderPath(target.values, path => path === '/existing', '/workspace')).toBe('')
  })

  it('preserves valid trailing punctuation in exact filenames', () => {
    expect(resolveFinderPath(['/workspace/report (final)'], () => true)).toBe('/workspace/report (final)')
  })

  it('lets actionable knowledge rows own their right-click menu', () => {
    const dom = new JSDOM('<table><tr data-knowledge-file-context-menu><td><button>own</button></td></tr><tr><td><button>received</button></td></tr></table>')
    const document = dom.window.document
    const context = { document, window: dom.window, performance: dom.window.performance, Element: dom.window.Element }
    const buttons = document.querySelectorAll('button')
    let index = 0
    Object.defineProperty(document, 'elementFromPoint', { value: () => buttons[index] })
    expect(runInNewContext(contextMenuTargetScript(1, 1), context)).toEqual({ values: [], suppressMenu: true })
    index = 1
    expect(runInNewContext(contextMenuTargetScript(1, 1), context)).toMatchObject({ values: ['received'] })
  })
})

it('keeps the actual event target when coordinate hit testing drifts', () => {
  const dom = new JSDOM('<button title="/out/deck.pptx">deck.pptx</button><a title="/out/deck.pdf">deck.pdf</a>')
  const document = dom.window.document
  const context = {document, window:dom.window, performance:dom.window.performance, Element:dom.window.Element}
  Object.defineProperty(document, 'elementFromPoint', {value: () => document.querySelector('a')})
  runInNewContext(contextMenuCaptureScript,context)
  document.querySelector('button').dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true}))
  const target=runInNewContext(contextMenuTargetScript(20,30),context)
  expect(target.values).toContain('/out/deck.pptx')
  expect(target.values).not.toContain('/out/deck.pdf')
  expect(dom.window.__sherlockContextTarget).toBeUndefined()
})

it('lets the image canvas own right-clicks on editable layers and the pasteboard', () => {
  const dom = new JSDOM('<div data-image-factory-layer-menu><button>品牌图层</button></div>')
  const document = dom.window.document
  Object.defineProperty(document, 'elementFromPoint', { value: () => document.querySelector('button') })
  expect(runInNewContext(contextMenuTargetScript(5, 5), {
    document, window: dom.window, performance: dom.window.performance, Element: dom.window.Element,
  })).toEqual({ values: [], suppressMenu: true })
})
