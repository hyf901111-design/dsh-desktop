import { noteText, type NoteContent } from '../../shared/workspace-notes'
import type { Workbook } from '../../shared/spreadsheet/workbook'

export function researchHasContent(canvas: { files: unknown[]; artifacts: unknown[] }): boolean {
  return canvas.files.length > 0 || canvas.artifacts.some(item => {
    const artifact = item as { containerSpec?: { type?: string } } | null
    return !!artifact && artifact.containerSpec?.type !== 'board-tabs'
  })
}

export function noteHasContent(note: NoteContent): boolean {
  const visit = (blocks: any[]): boolean => blocks.some(block => {
    if (noteText(block.content).trim()) return true
    if (['research', 'attachment'].includes(block.type) && block.props?.payload) return true
    if (typeof block.props?.url === 'string' && block.props.url.trim()) return true
    const rows = block.content?.rows
    if (Array.isArray(rows) && rows.some(row => Array.isArray(row?.cells) &&
        row.cells.some((cell: any) => noteText(cell?.content ?? cell).trim()))) return true
    return Array.isArray(block.children) && visit(block.children)
  })
  return !!note.title.trim() || visit(note.blocks)
}

export function workbookHasContent(workbook: Workbook | null): boolean {
  return !!workbook && (!!workbook.charts?.length || !!workbook.components?.length ||
    Object.values(workbook.sheets).some(sheet => Object.values(sheet.cellData).some(row =>
      Object.values(row).some(cell => !!cell.f || typeof cell.v === 'number' || typeof cell.v === 'boolean' ||
        typeof cell.v === 'string' && !!cell.v.trim()))))
}
