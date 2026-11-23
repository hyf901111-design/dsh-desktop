import type { CanvasNode } from 'dsh-research-collaboration/document'
export const starterWatchlistTitle: string
export function starterWatchlistDocument(sessionId: string): {
  artifacts: CanvasNode[]
  grid: { version: 2; cells: { id: string; x: number; y: number; w: number; h: number }[] }
}
