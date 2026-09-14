import { readFileSync } from 'node:fs'
import { describe, it, expect, vi } from 'vitest'

// Exercise the actual callback shipped in the patched client, including its
// normal-workspace fallback and board no-op path.
const source = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
const start = source.indexOf('selectWorkspace: async (workspaceId) => {')
const callback = source.slice(start, source.indexOf('\n\t\t\t\t})', start))
function fixture(boardNext) {
  const workspaces = { connectWorkspace: vi.fn(async () => 'workspace-session'), archiveSession: vi.fn() }
  const sessions = { open: vi.fn() }
  const shell = { snapshot: { draft: '保留草稿', imageIds: [] }, setDraft: vi.fn(), addImages: vi.fn(() => true) }
  const next = { snapshot: { draft: '', imageIds: [] }, setDraft: vi.fn(), addImages: vi.fn(() => true) }
  const inputHub = { shell: id => id === 'board-session' ? shell : next }
  const adapter = { associateProject: vi.fn(async () => boardNext), openPersonal: vi.fn() }
  const select = new Function('workspaces', 'sessions', 'inputHub', 'sherlockBoardsAdapter', 'sessionId', `return ({${callback}}).selectWorkspace`)(workspaces, sessions, inputHub, adapter, 'board-session')
  return { select, workspaces, sessions, adapter, shell, next }
}
describe('board directory project selection', () => {
  it('does not archive or replace the session when choosing the active directory again', async () => {
    const f = fixture('board-session')
    await f.select('::board-directory')
    expect(f.workspaces.connectWorkspace).not.toHaveBeenCalled()
    expect(f.workspaces.archiveSession).not.toHaveBeenCalled()
    expect(f.sessions.open).toHaveBeenCalledWith('board-session')
    expect(f.shell.setDraft).not.toHaveBeenCalled()
  })
  it('keeps board navigation and moves the draft before retiring the old internal session', async () => {
    const f = fixture('associated-board')
    await f.select('project')
    expect(f.workspaces.connectWorkspace).not.toHaveBeenCalled()
    expect(f.next.setDraft).toHaveBeenCalledWith('保留草稿')
    expect(f.adapter.openPersonal).toHaveBeenCalledWith('associated-board')
    expect(f.workspaces.archiveSession).toHaveBeenCalledWith('board-session')
    expect(f.next.setDraft.mock.invocationCallOrder[0]).toBeLessThan(f.workspaces.archiveSession.mock.invocationCallOrder[0])
  })
  it('preserves ordinary conversation workspace navigation', async () => {
    const f = fixture(null)
    await f.select('project')
    expect(f.workspaces.connectWorkspace).toHaveBeenCalledWith('project')
    expect(f.sessions.open).toHaveBeenCalledWith('workspace-session')
    expect(f.workspaces.archiveSession).not.toHaveBeenCalled()
  })
})
