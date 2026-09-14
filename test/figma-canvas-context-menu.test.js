import { describe, expect, it } from 'vitest'
import { positionFigmaCanvasContextMenu, patchFigmaCanvasContextMenu } from '../scripts/lib/figma-canvas-context-menu.mjs'

describe('Figma canvas context placement', () => {
  function place(point, menuWidth = 260, viewportHeight = 900) {
    const element = { style: {}, offsetWidth: menuWidth, offsetHeight: 118 }
    const canvas = { getBoundingClientRect: () => ({ left: 280, top: 66, width: 740, height: 824 }), ownerDocument: { defaultView: { innerWidth: 1380, innerHeight: viewportHeight } } }
    positionFigmaCanvasContextMenu(element, point, canvas)
    return element.style
  }
  it('keeps the full menu inside the canvas at the right and bottom edges', () => {
    expect(place({ left: 720, top: 810 })).toMatchObject({ left: '468px', top: '694px', maxWidth: '716px', maxHeight: '800px' })
  })
  it('keeps a context menu at its pointer anchor when there is room', () => {
    expect(place({ left: 200, top: 150 })).toMatchObject({ left: '200px', top: '150px' })
  })
  it('uses the visible viewport height when the canvas extends below it', () => {
    expect(place({ left: 100, top: 500 }, 240, 500)).toMatchObject({ top: '304px', maxHeight: '410px' })
  })
  it('adds positioning once without altering business action contents', () => {
    const source = 'function ResearchCanvas(){return {className: "rScV5Q_contextMenu",children:action};return {className: "rScV5Q_contextDownloadGroup",children:action}}'
    const once = patchFigmaCanvasContextMenu(source)
    expect(patchFigmaCanvasContextMenu(once)).toBe(once)
    expect(once).toContain('children:action')
    const rebuilt = patchFigmaCanvasContextMenu(once.slice(once.indexOf('function ResearchCanvas(')))
    expect(rebuilt.match(/ref: element =>/g)).toHaveLength(1)
  })
})
