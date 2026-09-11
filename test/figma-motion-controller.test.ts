import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'

import { mountFigmaMotionController } from '../src/preload/figma-motion-controller'

describe('Figma panel motion supplement', () => {
  it('arms motion only after the first panel geometry has settled', async () => {
    const browserWindow = new Window()
    const callbacks: FrameRequestCallback[] = []
    browserWindow.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    }) as unknown as typeof browserWindow.requestAnimationFrame
    browserWindow.cancelAnimationFrame = (() => {}) as unknown as typeof browserWindow.cancelAnimationFrame
    const dispose = mountFigmaMotionController(browserWindow.document as unknown as Document)
    expect(browserWindow.document.documentElement.dataset.odysseyMotionReady).toBeUndefined()

    const host = browserWindow.document.createElement('div')
    host.setAttribute('data-dsh-panel-host', '')
    browserWindow.document.body.appendChild(host)
    await Promise.resolve()
    expect(callbacks).toHaveLength(1)
    callbacks.shift()?.(0)
    expect(browserWindow.document.documentElement.dataset.odysseyMotionReady).toBeUndefined()
    browserWindow.document.body.appendChild(browserWindow.document.createElement('div'))
    await Promise.resolve()
    expect(callbacks).toHaveLength(1)
    callbacks.shift()?.(16)
    expect(browserWindow.document.documentElement.dataset.odysseyMotionReady).toBe('true')
    browserWindow.document.body.appendChild(browserWindow.document.createElement('div'))
    await Promise.resolve()
    expect(callbacks).toHaveLength(0)

    dispose()
    expect(browserWindow.document.documentElement.dataset.odysseyMotionReady).toBeUndefined()
    await browserWindow.happyDOM.close()
  })

  it('is idempotent for a document', () => {
    const browserWindow = new Window()
    const first = mountFigmaMotionController(browserWindow.document as unknown as Document)
    const second = mountFigmaMotionController(browserWindow.document as unknown as Document)
    expect(second).toBe(first)
    first()
  })

  it('pauses home atmosphere motion while the document is hidden', async () => {
    const browserWindow = new Window()
    let visibility: DocumentVisibilityState = 'visible'
    Object.defineProperty(browserWindow.document, 'visibilityState', {
      configurable: true,
      get: () => visibility
    })
    const dispose = mountFigmaMotionController(browserWindow.document as unknown as Document)
    expect(browserWindow.document.documentElement.dataset.odysseyHomeMotion).toBe('running')

    visibility = 'hidden'
    browserWindow.document.dispatchEvent(new browserWindow.Event('visibilitychange'))
    expect(browserWindow.document.documentElement.dataset.odysseyHomeMotion).toBe('paused')

    visibility = 'visible'
    browserWindow.document.dispatchEvent(new browserWindow.Event('visibilitychange'))
    expect(browserWindow.document.documentElement.dataset.odysseyHomeMotion).toBe('running')

    dispose()
    expect(browserWindow.document.documentElement.dataset.odysseyHomeMotion).toBeUndefined()
    await browserWindow.happyDOM.close()
  })

  it('scopes reversible panel, hover and press motion and disables it for drag and reduced motion', () => {
    const css = readFileSync(new URL('../src/preload/figma-motion.css', import.meta.url), 'utf8')
    expect(css).toContain('.t8lSSG_panel.t8lSSG_panelHidden')
    expect(css).toContain('clip-path:inset(7px 8px calc(100% - 35px) calc(100% - 36px) round 7px)')
    expect(css).toContain('width var(--odyssey-motion-panel-duration)')
    expect(css).toContain('.wSkVaW_root[data-odyssey-page="conversation"]')
    expect(css).toContain('.wSkVaW_root[data-odyssey-page="home"] > [data-center-composer-host]')
    expect(css).toContain('transform: scale(0.94)')
    expect(css).toContain('body[data-dsh-sidebar-dragging]')
    expect(css).toContain('transition: none !important')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).not.toContain('.rScV5Q_root')
    expect(css).not.toContain('transition: all')
  })

  it('keeps the procedural home surface separate from foreground layout', () => {
    const css = readFileSync(new URL('../src/preload/figma-home.css', import.meta.url), 'utf8')
    expect(css).toContain('[data-odyssey-home-flow]')
    expect(css).not.toMatch(/figma-glass-.*\.png/)
    expect(css).not.toContain('@keyframes odyssey-home-fog')
    expect(css).not.toMatch(/wSkVaW_(?:headline|composerHero|card)[^{]*\{[^}]*animation:/s)
  })
})
