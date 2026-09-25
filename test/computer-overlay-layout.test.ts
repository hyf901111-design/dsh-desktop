import { expect, it } from 'vitest'
import { cursorOverlayPositions, cursorTravelDuration, cursorTravelPoint } from '../src/main/computer/overlay-layout'

it('keeps the arrow hotspot at the requested screen point while its label flips inside the display', () => {
  const display = { x: 3440, y: -160, width: 1080, height: 1889 }
  const target = { x: 4512, y: 1600 }
  const layout = cursorOverlayPositions(target, display)
  expect(layout.pointer.x + layout.hotspot.x).toBe(target.x)
  expect(layout.pointer.y + layout.hotspot.y).toBe(target.y)
  expect(layout.label.x + layout.label.width).toBeLessThanOrEqual(display.x + display.width)
  expect(layout.label.x).toBeLessThan(target.x)
})

it('moves the assistant overlay through a bounded arc and lands exactly on the target', () => {
  const from = { x: 80, y: 130 }, to = { x: 960, y: 130 }
  expect(cursorTravelPoint(from, to, 0)).toEqual(from)
  expect(cursorTravelPoint(from, to, 1)).toEqual(to)
  const mid = cursorTravelPoint(from, to, .5)
  expect(mid.x).toBeCloseTo(520)
  expect(Math.abs(mid.y - from.y)).toBeGreaterThan(5)
  expect(Math.abs(mid.y - from.y)).toBeLessThanOrEqual(64)
  expect(cursorTravelPoint(from, to, .1).x - from.x).toBeLessThan(to.x - cursorTravelPoint(from, to, .9).x + 1)
  expect(cursorTravelDuration(from, to)).toBeLessThanOrEqual(520)
  expect(cursorTravelDuration(from, { x: 81, y: 130 })).toBe(0)
})
