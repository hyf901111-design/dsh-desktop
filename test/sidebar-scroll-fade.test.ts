import { expect, it } from 'vitest'
import { Window } from 'happy-dom'
import { sidebarHeadingMask, installSidebarScrollFade } from '../src/preload/sidebar-scroll-fade'
it('does not mask rows clear of the headings', () => {
  expect(sidebarHeadingMask(200, 600, [{ top: 100, bottom: 136 }])).toBe('')
})
it('fades into and out of each sticky title without a colored background', () => {
  const mask = sidebarHeadingMask(0, 600, [{ top: 100, bottom: 136 }, { top: 300, bottom: 336 }])
  expect(mask).toContain('#000 88px, transparent 100px, transparent 136px, #000 148px')
  expect(mask).toContain('#000 288px, transparent 300px, transparent 336px, #000 348px')
})
it('merges touching sticky headings and tracks content scrolling', () => {
  const mask = sidebarHeadingMask(-200, 900, [{ top: 100, bottom: 136 }, { top: 136, bottom: 172 }])
  expect(mask).toContain('transparent 300px, transparent 372px')
  expect(mask).not.toContain('transparent 336px')
})

it('updates the mask in the same event as a fast wheel delta', () => {
  const w = new Window()
  w.document.body.innerHTML = '<div data-srb-navigation-scroll><div data-srb-section-header>看板区</div><div class="srb-board-list">内容</div></div>'
  const root = w.document.querySelector('[data-srb-navigation-scroll]')! as unknown as HTMLElement
  const list = w.document.querySelector('.srb-board-list')! as unknown as HTMLElement
  Object.defineProperties(root, { scrollHeight: { value: 1000 }, clientHeight: { value: 200 } })
  list.getBoundingClientRect = () => ({ top: 136 - root.scrollTop, height: 1000 } as DOMRect)
  w.document.querySelector('[data-srb-section-header]')!.getBoundingClientRect = () => new w.DOMRect(0, 100, 200, 36)
  installSidebarScrollFade(w.document as unknown as Document)
  const event = new w.WheelEvent('wheel', { deltaY: 400, bubbles: true, cancelable: true })
  list.dispatchEvent(event as unknown as Event)
  expect(event.defaultPrevented).toBe(true)
  expect(root.scrollTop).toBe(400)
  expect(list.style.maskImage).toContain('transparent 364px, transparent 400px')
  const handled = new w.WheelEvent('wheel', { deltaY: 400, bubbles: true, cancelable: true })
  handled.preventDefault(); list.dispatchEvent(handled as unknown as Event)
  expect(root.scrollTop).toBe(400)
  w.dispatchEvent(new w.Event('unload')); w.happyDOM.abort()
})
