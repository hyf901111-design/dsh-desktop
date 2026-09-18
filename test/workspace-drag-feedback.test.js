import { expect, it } from 'vitest'
import { Window } from 'happy-dom'
import { createWorkspaceDragFeedback } from '../scripts/lib/workspace-drag-feedback.mjs'
it('paints immediately, skips repeated paints, commits latest target and clears the previous marker', async () => {
  const w = new Window(), a = w.document.createElement('div'), b = w.document.createElement('div')
  const drag = createWorkspaceDragFeedback()
  drag.set({workspaceId:'source',over:null})
  drag.hover(a,'a','before')
  expect(a.classList.contains('qDHVXG_workspaceDropBefore')).toBe(true)
  const mutations = []
  const observer = new w.MutationObserver(records => mutations.push(...records))
  observer.observe(a,{attributes:true})
  for(let n=0;n<100;n++) drag.hover(a,'a','before')
  await w.happyDOM.whenAsyncComplete()
  expect(mutations).toHaveLength(0)
  drag.hover(b,'b','after')
  expect(a.className).toBe('')
  expect(b.classList.contains('qDHVXG_workspaceDropAfter')).toBe(true)
  expect(drag.current().over).toEqual({id:'b',half:'after'})
  drag.set(null)
  expect(b.className).toBe('')
  expect(drag.current()).toBeNull()
  observer.disconnect();await w.happyDOM.abort()
})
