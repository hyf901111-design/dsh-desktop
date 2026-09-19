import { expect, it } from 'vitest'
import { Window } from 'happy-dom'
import { sidebarHeadingMask, installSidebarScrollFade } from '../src/preload/sidebar-scroll-fade'
it('does not mask rows clear of the headings', () => {
  expect(sidebarHeadingMask(200, 600, [{ top: 100, bottom: 136 }])).toBe('')
  expect(sidebarHeadingMask(136, 600, [{ top: 100, bottom: 136 }])).toBe('')
})
it('fully masks each heading and keeps the fade outside its edges', () => {
  const mask = sidebarHeadingMask(0, 600, [{ top: 100, bottom: 136 }, { top: 300, bottom: 336 }])
  expect(mask).toContain('#000 94px, transparent 100px, transparent 136px, #000 142px')
  expect(mask).toContain('#000 294px, transparent 300px, transparent 336px, #000 342px')
})
it('merges touching sticky headings and tracks content scrolling', () => {
  const mask = sidebarHeadingMask(-200, 900, [{ top: 100, bottom: 136 }, { top: 136, bottom: 172 }])
  expect(mask).toContain('transparent 300px, transparent 372px')
  expect(mask).not.toContain('transparent 336px')
})

it('preserves fractional heading edges when zoomed and clips bands to the list', () => {
  expect(sidebarHeadingMask(0, 200, [{ top: 35.125, bottom: 71.375 }]))
    .toContain('transparent 35.125px, transparent 71.375px')
  expect(sidebarHeadingMask(100, 20, [{ top: 90, bottom: 136 }]))
    .toContain('transparent 0px, transparent 20px')
})

it('closes the narrow gap as the second heading approaches its sticky position', () => {
  const mask = sidebarHeadingMask(0, 600, [{ top: 100, bottom: 136 }, { top: 141.5, bottom: 177.5 }])
  expect(mask).toContain('transparent 100px, transparent 177.5px')
  expect(mask).not.toContain('#000 142px')
})

it('updates the mask in the same event as a fast wheel delta', () => {
  const w = new Window()
  w.document.body.innerHTML = '<div data-srb-navigation-scroll><div data-srb-section-header>看板区</div><div class="srb-board-list">内容</div></div>'
  const root = w.document.querySelector('[data-srb-navigation-scroll]')! as unknown as HTMLElement
  const list = w.document.querySelector('.srb-board-list')! as unknown as HTMLElement
  Object.defineProperties(root, { scrollHeight: { value: 1000 }, clientHeight: { value: 200 } })
  root.getBoundingClientRect = () => new w.DOMRect(0, 92, 200, 200)
  list.getBoundingClientRect = () => ({ top: 136 - root.scrollTop, height: 1000 } as DOMRect)
  w.document.querySelector('[data-srb-section-header]')!.getBoundingClientRect = () => new w.DOMRect(0, 100, 200, 36)
  installSidebarScrollFade(w.document as unknown as Document)
  const event = new w.WheelEvent('wheel', { deltaY: 400, bubbles: true, cancelable: true })
  list.dispatchEvent(event as unknown as Event)
  expect(event.defaultPrevented).toBe(true)
  expect(root.scrollTop).toBe(400)
  // Include the 8px scrollport padding above the first sticky heading.
  expect(list.style.maskImage).toContain('transparent 356px, transparent 400px')
  const handled = new w.WheelEvent('wheel', { deltaY: 400, bubbles: true, cancelable: true })
  handled.preventDefault(); list.dispatchEvent(handled as unknown as Event)
  expect(root.scrollTop).toBe(400)
  w.dispatchEvent(new w.Event('unload')); w.happyDOM.abort()
})
