import { expect, it } from 'vitest'
import { noteHasContent, researchHasContent, workbookHasContent } from '../src/main/knowledge/session-content'
import { blankWorkbook } from '../src/shared/spreadsheet/workbook'

it('ignores an empty research canvas and its built-in board tabs', () => {
  const tabs = { containerSpec: { type: 'board-tabs' } }
  expect(researchHasContent({ files: [], artifacts: [tabs] })).toBe(false)
  expect(researchHasContent({ files: [], artifacts: [tabs, { id: 'chart' }] })).toBe(true)
  expect(researchHasContent({ files: [{ id: 'report' }], artifacts: [] })).toBe(true)
})

it('recognizes document content without listing the default empty note', () => {
  const empty = { title: '', yjs: 'AA==', blocks: [{ type: 'paragraph', content: [{ type: 'text', text: ' ' }] }] }
  expect(noteHasContent(empty)).toBe(false)
  expect(noteHasContent({ ...empty, title: '调研笔记' })).toBe(true)
  expect(noteHasContent({ ...empty, blocks: [{ type: 'paragraph', children: [{ content: '研究结论' }] }] })).toBe(true)
  expect(noteHasContent({ ...empty, blocks: [{ type: 'table', content: { rows: [{ cells: [[{ text: '会议信息' }]] }] } }] })).toBe(true)
  expect(noteHasContent({ ...empty, blocks: [{ type: 'attachment', props: { payload: '{"name":"附件.pdf"}' } }] })).toBe(true)
})

it('excludes blank worksheets and keeps formulas, zeroes and components', () => {
  const workbook = blankWorkbook('book')
  const sheet = workbook.sheets['sheet-1']!
  expect(workbookHasContent(workbook)).toBe(false)
  sheet.cellData = { 0: { 0: { s: 'bold' }, 1: { v: ' ' } } }
  expect(workbookHasContent(workbook)).toBe(false)
  sheet.cellData = { 0: { 0: { v: 0 } } }
  expect(workbookHasContent(workbook)).toBe(true)
  sheet.cellData = { 0: { 0: { f: '=1+1' } } }
  expect(workbookHasContent(workbook)).toBe(true)
  sheet.cellData = {}
  workbook.charts = [{ chartId: 'chart', sheetId: 'sheet-1', range: 'A1:B2', title: '销量', kind: 'bar', headers: true }]
  expect(workbookHasContent(workbook)).toBe(true)
})
