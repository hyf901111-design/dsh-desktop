import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ResearchBoardsStore } from '../src/main/state/research-boards-store'
const dirs: string[] = []
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'boards-store-'))
  dirs.push(dir)
  return { dir, store: new ResearchBoardsStore(dir) }
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
it('persists login-free favorites once and keeps user rename/order on restart', () => {
  const { dir, store } = setup()
  const a = store.addFavorite({ sessionId: 'original-a', title: '研究 A' })
  const b = store.addFavorite({ sessionId: 'original-b', title: '研究 B' })
  expect(
    store.addFavorite({ sessionId: 'original-a', title: 'changed' }).favoriteId
  ).toBe(a.favoriteId)
  store.renameFavorite(a.favoriteId, '常用 A')
  store.reorderFavorites([b.favoriteId, a.favoriteId])
  expect(
    new ResearchBoardsStore(dir).snapshot().favorites.map((x) => x.title)
  ).toEqual(['研究 B', '常用 A'])
})
it('shared unpin survives cloud refresh, remains account scoped, and does not remove membership', () => {
  const { dir, store } = setup()
  store.setBoards('account-a', [
    { boardId: 'board-a', title: 'A', role: 'owner' } as never
  ])
  store.setPinned('account-a', 'board-a', false)
  store.setBoards('account-a', [
    { boardId: 'board-a', title: 'renamed', role: 'owner' } as never
  ])
  const resumed = new ResearchBoardsStore(dir)
  expect(resumed.account('account-a').hidden).toEqual(['board-a'])
  expect(resumed.account('account-a').boards).toHaveLength(1)
  expect(resumed.account('account-b').hidden).toEqual([])
})
it('atomically persists pending operations and rejects original/shared binding reuse', () => {
  const { dir, store } = setup()
  store.addFavorite({ sessionId: 'original', title: 'original' })
  expect(() => store.bind('a', 'b', 'original')).toThrow()
  store.bind('a', 'b', 'shared')
  expect(() => store.bind('other', 'c', 'shared')).toThrow()
  store.updateAccount('a', (a) => {
    a.pending.push({
      operationId: 'op',
      boardId: 'b',
      epoch: 1,
      action: 'message',
      body: { text: 'own' },
      recovery: [{ kind: 'message', text: 'own' }],
      createdAt: 1
    } as never)
  })
  expect(
    new ResearchBoardsStore(dir).account('a').pending[0]!.operationId
  ).toBe('op')
  expect(store.sharedSession('shared')?.boardId).toBe('b')
  expect(
    readFileSync(join(dir, 'research-boards', 'state.json'), 'utf8')
  ).not.toContain('Bearer')
})
