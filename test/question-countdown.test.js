import { describe, it, expect, vi, afterEach } from 'vitest'
import { startQuestionCountdown, automaticQuestionDraft, patchQuestionCountdown } from '../scripts/lib/question-countdown.mjs'
import { readFileSync } from 'node:fs'
afterEach(() => vi.useRealTimers())
describe('question countdown', () => {
 it('expires once at 30 seconds and displays remaining seconds', () => {
  vi.useFakeTimers(); const tick=vi.fn(), expire=vi.fn(); startQuestionCountdown(tick,expire)
  expect(tick).toHaveBeenLastCalledWith(30); vi.advanceTimersByTime(29000)
  expect(tick).toHaveBeenLastCalledWith(1); expect(expire).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1000); expect(expire).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(60000); expect(expire).toHaveBeenCalledTimes(1)
 })
 it('cancels when the user starts answering or leaves the card', () => {
  vi.useFakeTimers(); const expire=vi.fn(); const cancel=startQuestionCountdown(vi.fn(),expire)
  vi.advanceTimersByTime(10000); cancel(); vi.advanceTimersByTime(60000); expect(expire).not.toHaveBeenCalled()
 })
 it.each(['选项（推荐）','Choice (Recommended)'])('uses the explicitly recommended option %s', label => {
  expect(automaticQuestionDraft({options:[{label:'first'}, {label}]}).selected).toEqual([label])
 })
 it('does not invent a choice when no recommendation exists', () => {
  const result=automaticQuestionDraft({options:[{label:'某款具体游戏'}]})
  expect(result.selected).toEqual([]); expect(result.custom).toContain('自行选择'); expect(result.skipped).toBe(false)
 })
 it('patches the shipped renderer idempotently', () => {
  const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-user-questions/lib/client.js','utf8')
  const result=patchQuestionCountdown(source); expect(patchQuestionCountdown(result)).toBe(result)
  expect(result).toContain('startQuestionCountdown(setCountdown'); expect(result).toContain('else submitDrafts(nextDrafts)')
 })
})
