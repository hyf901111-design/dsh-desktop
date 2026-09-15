import { expect, it } from 'vitest'
import { sidebarHeadingMask } from '../src/preload/sidebar-scroll-fade'
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
