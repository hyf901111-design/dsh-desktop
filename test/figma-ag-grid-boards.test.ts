import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import { FIGMA_AG_GRID_BOARDS, figmaAgGridArtifacts } from '../src/preload/figma-ag-grid-boards'
import { parseFigmaAgGridPresetHtml } from '../src/preload/research-ag-grid-presets'

const sourceNodes = ['1217:225227', '1217:210528', '1217:226632', '1217:228063', '1217:212126']

describe('Figma AG Grid 工作台预设', () => {
  it('为五个源画板各保留六个可解析的 AG Grid 面板', () => {
    const doc = new Window().document as unknown as Document
    expect(FIGMA_AG_GRID_BOARDS.map(board => board.figmaNode)).toEqual(sourceNodes)
    const titles = new Set<string>()
    for (const board of FIGMA_AG_GRID_BOARDS) {
      expect(board.source).toContain('情景模拟')
      expect(board.panels).toHaveLength(6)
      const artifacts = figmaAgGridArtifacts(board)
      expect(artifacts).toHaveLength(6)
      for (const [index, artifact] of artifacts.entries()) {
        const panel = board.panels[index]!
        const spec = artifact.containerSpec as { type: string; html: string }
        expect(spec.type).toBe('html')
        expect(parseFigmaAgGridPresetHtml(spec.html, doc)).toEqual({ ...panel.content, compact: panel.y === 702 })
        expect(artifact.title).toBe(panel.title)
        expect(artifact.width).toBe(panel.width - 52)
        expect(artifact.height).toBe(panel.y === 702 ?
          Math.max(86, 45 + 18 + 12 * (panel.content.rows?.length ?? 0)) :
          panel.height - (panel.content.kind === 'metrics' ? 12 : 24))
        expect(artifact.x).toBe(panel.x + (panel.width - 52) / 2 - (panel.x > 0 ? 58 : 0))
        expect(panel.width).toBeGreaterThan(300)
        expect(panel.height).toBeGreaterThan(100)
        expect(titles.has(panel.figmaNode)).toBe(false)
        titles.add(panel.figmaNode)
      }
    }
    expect(titles.size).toBe(30)
  })

  it('保留金融研究数据类型与代表性数值', () => {
    const [medical, bonds, trading, macro, risk] = FIGMA_AG_GRID_BOARDS
    expect(medical!.panels[0]!.content.metrics?.[0]).toEqual(['医药指数', '8,246.31', '+1.28%'])
    expect(bonds!.panels[0]!.content.metrics?.[0]?.[1]).toBe('1.7625%')
    expect(trading!.panels[2]!.content.columns).toEqual(['买量 / 手', '买价', '卖价', '卖量 / 手'])
    expect(macro!.panels.some(panel => panel.content.kind === 'heatmap')).toBe(true)
    expect(risk!.panels.some(panel => panel.content.kind === 'bar-table')).toBe(true)
    for (const board of FIGMA_AG_GRID_BOARDS) {
      expect(board.panels[0]!.content.kind).toBe('metrics')
      for (const panel of board.panels) {
        if (panel.content.kind === 'vector-chart') {
          expect(panel.content.shapes?.some(shape => shape.type === 'VECTOR' &&
            (shape.paths?.some(path => path.length > 10) || shape.w > 1 && shape.h >= 0))).toBe(true)
        } else if (panel.content.kind !== 'metrics') {
          expect(panel.content.columns?.length).toBeGreaterThan(1)
          expect(panel.content.rows?.length).toBeGreaterThan(0)
        }
      }
    }
  })
})
