import { expect, it } from 'vitest'
import {
  selectionNodeReady,
  boardEditTime
} from '../src/preload/research-board-presentation'
it('offers selection tools for completed table and HTML components but not drafts or active generation', () => {
  for (const type of ['table', 'html'])
    expect(
      selectionNodeReady({
        kind: 'generated-container',
        containerSpec: { type },
        generationStatus: 'completed'
      })
    ).toBe(true)
  for (const generationStatus of ['draft', 'queued', 'running', 'pending'])
    expect(
      selectionNodeReady({
        kind: 'generated-container',
        generationStatus
      })
    ).toBe(false)
  expect(selectionNodeReady({ kind: 'pasted-text' })).toBe(true)
  expect(
    selectionNodeReady({
      kind: 'generated-container',
      generationStatus: 'failed'
    })
  ).toBe(false)
})
it('formats actual edit age and leaves missing historical edit times unknown', () => {
  expect(boardEditTime(undefined, 100000)).toBe('—')
  expect(boardEditTime(100000, 100000)).toBe('刚刚')
  expect(boardEditTime(40000, 100000)).toBe('1分钟')
  expect(boardEditTime(1, 3600001)).toBe('1小时')
})
