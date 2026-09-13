import { describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'
import { mountFloatingSurfaces, placeFloatingSurface } from '../src/preload/floating-surfaces'

const rect = (left: number, top: number, width = 28, height = 28) => ({ left, top, right: left + width, bottom: top + height, width, height } as DOMRect)
describe('floating surfaces outside pane clipping', () => {
  it('fits near either horizontal edge and flips below a top-edge anchor', () => {
    expect(placeFloatingSurface(rect(5, 5), 264, 144, 400, 300)).toMatchObject({ left: 12, top: 41 })
    expect(placeFloatingSurface(rect(380, 260), 264, 144, 400, 300)).toMatchObject({ left: 124, top: 108 })
    expect(placeFloatingSurface(rect(100, 80), 800, 600, 240, 180)).toMatchObject({ left: 12, top: 12, maxWidth: 216, maxHeight: 156 })
  })
  it('promotes the context panel without moving it out of its React owner and restores on dispose', () => {
    const window = new Window()
    const doc = window.document as unknown as Document
    const open = new Set<unknown>()
    const proto = window.HTMLElement.prototype as unknown as HTMLElement
    proto.showPopover = function () { open.add(this) }
    proto.hidePopover = function () { open.delete(this) }
    const matches = proto.matches
    proto.matches = function (s) { return s === ':popover-open' ? open.has(this) : matches.call(this, s) }
    doc.body.innerHTML = '<section style="overflow:hidden;width:240px"><span class="JObwrW_root"><button class="JObwrW_trigger"></button><div class="JObwrW_panel" role="dialog">用量</div></span></section>'
    const panel = doc.querySelector<HTMLElement>('.JObwrW_panel')!, owner = panel.parentElement
    const trigger = doc.querySelector<HTMLElement>('.JObwrW_trigger')!
    trigger.getBoundingClientRect = () => rect(980, 700) as never
    const dispose = mountFloatingSurfaces(doc as unknown as Document)
    try {
      expect(panel.parentElement).toBe(owner)
      expect(open.has(panel)).toBe(true)
      expect(panel.getAttribute('popover')).toBe('manual')
      expect(panel.dataset.odysseyFloatingSurface).toBe('')
      expect(Number.parseFloat(panel.style.left)).toBeGreaterThanOrEqual(12)
    } finally {
      dispose()
    }
    expect(panel.parentElement).toBe(owner)
    expect(open.has(panel)).toBe(false)
    expect(panel.hasAttribute('popover')).toBe(false)
    expect(doc.querySelector('[data-odyssey-floating-tooltip]')).toBeNull()
  })
})
