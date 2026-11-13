import { expect, it, vi } from 'vitest'
import { createConversationPermissionPreferences } from '../scripts/lib/conversation-permission-default.mjs'

function fixture() {
  let view = { ns: 'permission', revision: 1, value: { defaultPreset: 'workspace-write' } }
  const sessionModes = new Map([['current', 'workspace-write'], ['old-blank', 'workspace-write']])
  const settings = {
    describe: async () => ({ result: { ok: true, value: { writable: true, namespaces: [view] } } }),
    mutate: vi.fn(async ({ ns, ops, expectedRevision }) => {
      expect(ns).toBe('permission')
      expect(expectedRevision).toBe(view.revision)
      expect(ops).toEqual([{ op: 'set', path: ['defaultPreset'], value: expect.any(String) }])
      view = { ...view, revision: view.revision + 1, value: { defaultPreset: ops[0].value } }
      return { result: { ok: true, value: view } }
    })
  }
  const api = {
    settings,
    sessions: {
      history: async ({ sessionId }) => ({ result: { ok: true, value: {
        projections: { values: { permissions: { currentValue: sessionModes.get(sessionId) } } }
      } } })
    }
  }
  const execute = vi.fn(async (sessionId, line) => {
    sessionModes.set(sessionId, line.slice('/permission '.length))
    return { ok: true, value: { result: { kind: 'success' } } }
  })
  return { api, execute, sessionModes, preferences: createConversationPermissionPreferences(api, execute) }
}

it('applies the chosen preset and preserves it as the default across controller restarts', async () => {
  const f = fixture()
  await f.preferences.select('current', 'danger-full-access')
  expect(f.sessionModes.get('current')).toBe('danger-full-access')
  expect(f.sessionModes.get('old-blank')).toBe('workspace-write')
  const restored = createConversationPermissionPreferences(f.api, f.execute)
  const canReuse = await restored.prepareReuse()
  expect(await canReuse('current')).toBe(true)
  expect(await canReuse('old-blank')).toBe(false)
  await restored.select(undefined, 'read-only')
  expect(f.execute).toHaveBeenCalledOnce()
  expect((await f.api.settings.describe()).result.value.namespaces[0].value.defaultPreset).toBe('read-only')
})

it('waits for a pending write before resolving a New Chat reuse policy', async () => {
  const f = fixture()
  let release
  const wait = new Promise(resolve => { release = resolve })
  const mutate = f.api.settings.mutate.getMockImplementation()
  f.api.settings.mutate.mockImplementationOnce(async input => { await wait; return mutate(input) })
  const changed = f.preferences.select('current', 'read-only')
  let ready = false
  const prepared = f.preferences.prepareReuse().then(policy => { ready = true; return policy })
  await vi.waitFor(() => expect(f.api.settings.mutate).toHaveBeenCalledOnce())
  expect(ready).toBe(false)
  release()
  await changed
  const canReuse = await prepared
  expect(await canReuse('current')).toBe(true)
  expect(await canReuse('old-blank')).toBe(false)
})

it('keeps the previous default when the Host rejects the session change', async () => {
  const f = fixture()
  f.execute.mockResolvedValueOnce({ ok: true, value: { result: { kind: 'error', text: 'denied' } } })
  await expect(f.preferences.select('current', 'danger-full-access')).rejects.toThrow('denied')
  expect(f.api.settings.mutate).not.toHaveBeenCalled()
  expect(await (await f.preferences.prepareReuse())('old-blank')).toBe(true)
})
