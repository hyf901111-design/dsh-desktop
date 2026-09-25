import { describe, expect, it } from 'vitest'
import { researchPreviewCanConsumeWheel } from '../scripts/lib/patch-research-board-client.mjs'

function scrollElement({ height = 200, contentHeight = 200, top = 0, overflow = 'auto', parent = null } = {}) {
  const style = { overflowY: overflow, overflowX: 'hidden' }
  return {
    nodeType: 1, parentElement: parent, clientHeight: height, scrollHeight: contentHeight,
    scrollTop: top, clientWidth: 100, scrollWidth: 100, scrollLeft: 0,
    ownerDocument: { defaultView: { getComputedStyle: () => style } }
  }
}

describe('selected component wheel ownership', () => {
  it('returns the wheel to the canvas when the component has no overflow', () => {
    const component = scrollElement()
    const child = scrollElement({ parent: component })
    expect(researchPreviewCanConsumeWheel(child, component, 0, 80)).toBe(false)
  })

  it('keeps the wheel inside a component that can scroll in that direction', () => {
    const component = scrollElement({ contentHeight: 500, top: 80 })
    const child = scrollElement({ parent: component })
    expect(researchPreviewCanConsumeWheel(child, component, 0, 80)).toBe(true)
    expect(researchPreviewCanConsumeWheel(child, component, 0, -80)).toBe(true)
  })

  it('returns the wheel to the canvas at the scroll boundary', () => {
    const component = scrollElement({ contentHeight: 500, top: 300 })
    expect(researchPreviewCanConsumeWheel(component, component, 0, 80)).toBe(false)
    expect(researchPreviewCanConsumeWheel(component, component, 0, -80)).toBe(true)
  })
})
