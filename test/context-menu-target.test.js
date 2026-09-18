import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { runInNewContext } from 'node:vm'
import { contextMenuTargetScript } from '../src/main/context-menu-target'
import { resolveFinderPath } from '../src/main/context-menu-template'

describe('right-click file ownership', () => {
  it('uses the clicked file rather than its parent preview path', () => {
    const dom = new JSDOM(`<section data-path="/wrong/preview.pdf" title="/wrong/">
      <button title="outputs/报告.pptx"><code>报告.pptx</code></button>
      <textarea data-odyssey-file-reference-session="session-1"></textarea></section>`)
    const document = dom.window.document
    Object.defineProperty(document, 'elementFromPoint', {value: () => document.querySelector('code')})
    document.querySelector('textarea').getClientRects = () => ({ length: 1 })
    const target = runInNewContext(contextMenuTargetScript(20, 30), {document, Element:dom.window.Element})
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
    const target = runInNewContext(contextMenuTargetScript(0, 0), {document, Element:dom.window.Element})
    expect(resolveFinderPath(target.values, path => path === '/existing', '/workspace')).toBe('')
  })

  it('preserves valid trailing punctuation in exact filenames', () => {
    expect(resolveFinderPath(['/workspace/report (final)'], () => true)).toBe('/workspace/report (final)')
  })
})
