import { expect, it } from 'vitest'
import { researchBoardRunning } from '../src/preload/research-board-activity'
it('tracks parent, descendants and queued component work, then clears on completion', () => {
  expect(researchBoardRunning({p:{running:true}},'p')).toBe(true)
  expect(researchBoardRunning({p:{runningSubagentCount:2}},'p')).toBe(true)
  const sessions={p:{running:false},c:{parentId:'p',running:false},d:{parentId:'c',running:true},other:{running:true}}
  expect(researchBoardRunning(sessions,'p')).toBe(true)
  sessions.d.running=false
  expect(researchBoardRunning(sessions,'p')).toBe(false)
  expect(researchBoardRunning(sessions,'p',[{generationStatus:'queued'}])).toBe(true)
  expect(researchBoardRunning(sessions,'p',[{generationStatus:'running'}])).toBe(true)
  expect(researchBoardRunning(sessions,'p',[{generationStatus:'failed'},{generationStatus:'completed'}])).toBe(false)
  expect(researchBoardRunning({p:{parentId:'c'},c:{parentId:'p'}},'p')).toBe(false)
})
