import { expect, it } from 'vitest'
import { patchNotesClient } from '../scripts/lib/notes-client.mjs'
it('adds the active session identity without replacing native controls and is idempotent', () => {
  const source = 'function Header({sessionId}){return {"data-srb-session-header":"", children: nativeTabs}}'
  const patched = patchNotesClient(source)
  expect(patched).toContain('"data-ework-notes-session":sessionId')
  expect(patched).toContain('children: nativeTabs')
  expect(patchNotesClient(patched)).toBe(patched)
})
it('refuses an unknown host instead of attaching notes to the wrong session', () => {
  expect(() => patchNotesClient('other header')).toThrow('无法定位')
})
