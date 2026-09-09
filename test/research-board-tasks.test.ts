import { expect, it, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ResearchRequestJournal } from '../src/main/state/research-board-request-journal'
const dirs: string[] = []
afterEach(async () => {
  for (const d of dirs.splice(0))
    await rm(d, { recursive: true, force: true })
})
it('reuses fixed operation after server ACK is lost and rejects changed intent', async () => {
  const d = await mkdtemp(join(tmpdir(), 'board-journal-'))
  dirs.push(d)
  let calls = 0
  const receipts = new Map()
  let drop = true
  const send = async (body: any) => {
    calls++
    if (!receipts.has(body.operationId))
      receipts.set(body.operationId, {
        operationId: body.operationId,
        action: body.action,
        seq: 1,
        message: { id: 'one' }
      })
    if (drop) {
      drop = false
      throw Error('lost ACK')
    }
    return receipts.get(body.operationId)
  }
  let j = new ResearchRequestJournal(d)
  const key = j.prepare('a', 'b', 'mutation', { text: 'hello' }, 1)
  await expect(
    j.step(key, 'message', 'message', { text: 'hello' }, send)
  ).rejects.toThrow('lost ACK')
  j = new ResearchRequestJournal(d)
  const reply = await j.step(
    key,
    'message',
    'message',
    { text: 'hello' },
    send
  )
  expect(reply.message.id).toBe('one')
  expect(receipts.size).toBe(1)
  expect(calls).toBe(2)
  await j.step(key, 'message', 'message', { text: 'hello' }, send)
  expect(calls).toBe(2)
  expect(() =>
    j.prepare('a', 'b', 'mutation', { text: 'changed' }, 1)
  ).toThrow('REQUEST_ID_REUSED')
})
