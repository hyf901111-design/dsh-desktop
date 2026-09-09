import { expect, it, afterEach } from 'vitest'
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FrozenBoardFiles } from '../src/main/state/research-board-assets'
const dirs: string[] = []
afterEach(async () => {
  for (const d of dirs.splice(0))
    await rm(d, { recursive: true, force: true })
})
it('frozen capture survives original deletion, can reopen and rejects traversal', async () => {
  const d = await realpath(await mkdtemp(join(tmpdir(), 'board-frozen-')))
  dirs.push(d)
  const original = join(d, 'original.txt')
  await writeFile(original, 'captured')
  const store = new FrozenBoardFiles(join(d, 'owned'))
  const f = await store.freeze(
    original,
    '材料.txt',
    new AbortController().signal
  )
  await rm(original)
  expect(await readFile(store.path(f), 'utf8')).toBe('captured')
  expect(await new FrozenBoardFiles(join(d, 'owned')).verify(f)).toBe(true)
  expect(() => store.path({ ...f, key: '../secret' })).toThrow()
})
