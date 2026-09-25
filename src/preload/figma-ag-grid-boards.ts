import source from './figma-ag-grid-presets.json'
import type { FigmaAgGridSpec } from './research-ag-grid-presets'

export type FigmaAgGridPanel = {
  title: string
  figmaNode: string
  x: number
  y: number
  width: number
  height: number
  content: FigmaAgGridSpec
}
export type FigmaAgGridBoard = {
  id: string
  title: string
  figmaNode: string
  source: string
  panels: FigmaAgGridPanel[]
}
export const FIGMA_AG_GRID_BOARDS = source.boards as unknown as FigmaAgGridBoard[]

export function figmaAgGridHtml(spec: FigmaAgGridSpec): string {
  const json = JSON.stringify(spec).replace(/</g, '\\u003c')
  return '<!doctype html><html><body data-sherlock-ag-grid-preset="1">' +
    '<script id="sherlock-ag-grid-data" type="application/json">' + json + '</script>' +
    '<p>Figma 情景模拟 · AG Grid</p></body></html>'
}

export function figmaAgGridArtifacts(board: FigmaAgGridBoard): Record<string, unknown>[] {
  const now = Date.now()
  return board.panels.map((panel, index) => {
    const id = crypto.randomUUID()
    // The client adds a title row and canvas placement offsets to manual nodes.
    // These corrections map Figma's outside panel bounds to the visible client cards.
    const contentWidth = panel.width - 52
    const compact = panel.y === 702
    const contentHeight = compact ? Math.max(86, 45 + 18 + 12 * (panel.content.rows?.length ?? 0)) :
      panel.height - (panel.content.kind === 'metrics' ? 12 : 24)
    const columnOffset = panel.x > 0 ? 58 : 0
    const rowOffset = panel.y === 156 ? 14 : panel.y === 432 ? 41 : panel.y === 702 ? 66 : 0
    const summary = panel.content.kind === 'metrics'
      ? panel.content.metrics?.map(metric => metric.join(' ')).join(' · ')
      : panel.content.kind === 'vector-chart'
        ? panel.content.texts?.map(item => item.text).slice(0, 12).join(' · ')
        : panel.content.rows?.slice(0, 2).map(row => row.join(' · ')).join(' / ')
    return {
      id,
      kind: 'generated-container',
      messageId: id,
      title: panel.title,
      excerpt: (summary || panel.title).slice(0, 900),
      x: panel.x + contentWidth / 2 - columnOffset,
      y: panel.y + contentHeight / 2 - rowOffset,
      width: contentWidth,
      height: contentHeight,
      sizeMode: 'manual',
      stackOrder: index + 1,
      generationStatus: 'completed',
      sourceNodeIds: [],
      generationLastSeq: 1,
      generationStartedAt: now,
      generationCompletedAt: now,
      containerPrompt: 'Figma ' + panel.figmaNode + ' · 情景模拟 · AG Grid 原生渲染',
      refreshMinutes: 0,
      lastSuccessfulAt: now,
      containerSpec: {
        version: 1,
        type: 'html',
        title: panel.title,
        html: figmaAgGridHtml({ ...panel.content, compact }),
      },
    }
  })
}
