type Rect = { x: number; y: number; width: number; height: number }
const pointerSize = 22
const labelWidth = 94
const labelHeight = 22
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high))

export function cursorOverlayPositions(point: { x: number; y: number }, display: Rect) {
  const x = Math.round(point.x), y = Math.round(point.y)
  const pointer = {
    x: clamp(x - 3, display.x, display.x + display.width - pointerSize),
    y: clamp(y - 3, display.y, display.y + display.height - pointerSize),
    width: pointerSize, height: pointerSize
  }
  const labelX = x + 19 + labelWidth <= display.x + display.width ? x + 19 : x - labelWidth - 8
  const labelY = y + labelHeight <= display.y + display.height ? y + 2 : y - labelHeight - 2
  return { pointer, hotspot: { x: x - pointer.x, y: y - pointer.y },
    label: { x: clamp(labelX, display.x, display.x + display.width - labelWidth),
      y: clamp(labelY, display.y, display.y + display.height - labelHeight), width: labelWidth, height: labelHeight } }
}

/** A short curved path with gentle acceleration and braking. The actual OS
 * pointer is never moved; this is only the click-through assistant overlay. */
export function cursorTravelPoint(from: { x: number; y: number }, to: { x: number; y: number }, progress: number) {
  if (progress <= 0) return { ...from }
  if (progress >= 1) return { ...to }
  const dx = to.x - from.x, dy = to.y - from.y
  const distance = Math.hypot(dx, dy)
  if (distance < 18) return { x: from.x + dx * progress, y: from.y + dy * progress }
  const sign = Math.sin((from.x + to.x) * .017 + (from.y + to.y) * .011) >= 0 ? 1 : -1
  const bend = Math.min(64, Math.max(9, distance * .085)) * sign
  const normal = { x: -dy / distance * bend, y: dx / distance * bend }
  const c1 = { x: from.x + dx * .28 + normal.x, y: from.y + dy * .28 + normal.y }
  const c2 = { x: from.x + dx * .72 + normal.x, y: from.y + dy * .72 + normal.y }
  const t = progress * progress * (3 - 2 * progress), u = 1 - t
  return { x: u ** 3 * from.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * to.x,
    y: u ** 3 * from.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * to.y }
}

export function cursorTravelDuration(from: { x: number; y: number }, to: { x: number; y: number }) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  return distance < 18 ? 0 : Math.min(520, Math.max(180, 160 + distance * .22))
}
