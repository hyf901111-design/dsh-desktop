export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type Bounds = { x: number; y: number; width: number; height: number }
export function resizeWindowBounds(start: Bounds, edge: ResizeEdge, dx: number, dy: number, minWidth: number, minHeight: number): Bounds {
  const next = { ...start }
  if (edge.includes('e')) next.width = Math.max(minWidth, start.width + dx)
  if (edge.includes('s')) next.height = Math.max(minHeight, start.height + dy)
  if (edge.includes('w')) { next.width = Math.max(minWidth, start.width - dx); next.x = start.x + start.width - next.width }
  if (edge.includes('n')) { next.height = Math.max(minHeight, start.height - dy); next.y = start.y + start.height - next.height }
  return next
}
