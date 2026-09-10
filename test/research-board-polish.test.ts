import { expect, it } from 'vitest'
import {
  selectionNodeReady,
  boardEditTime,
  boardTaskStatus,
  boardTaskAttempts
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
it('never labels interrupted or failed research tasks as waiting', () => {
  expect(boardTaskStatus({ status: 'pending' })).toBe('研究任务等待执行')
  expect(boardTaskStatus({ status: 'running' })).toBe('正在研究…')
  expect(boardTaskStatus({ status: 'interrupted' })).toBe('研究任务已中断。')
  expect(boardTaskStatus({ status: 'failed', failureCode: 'EMPTY_OUTPUT' })).toBe('模型没有返回可展示的内容，自动恢复仍未完成。')
  expect(boardTaskStatus({ status: 'completed' })).toBeUndefined()
})
it('keeps earlier attempts in history after the latest retry succeeds', () => {
  const failed = { taskId: 'old', status: 'failed', createdAt: 10 }
  const retried = { taskId: 'retry', status: 'completed', createdAt: 20 }
  expect(boardTaskAttempts([retried, failed])).toEqual({ current: [retried], previous: [failed] })
  expect(boardTaskAttempts([])).toEqual({ current: [], previous: [] })
  const running = { taskId: 'active', status: 'running', createdAt: 30 }
  expect(boardTaskAttempts([failed, retried, running])).toEqual({ current: [running], previous: [retried, failed] })
})
it('formats actual edit age and leaves missing historical edit times unknown', () => {
  expect(boardEditTime(undefined, 100000)).toBe('—')
  expect(boardEditTime(100000, 100000)).toBe('刚刚')
  expect(boardEditTime(40000, 100000)).toBe('1分钟')
  expect(boardEditTime(1, 3600001)).toBe('1小时')
})
