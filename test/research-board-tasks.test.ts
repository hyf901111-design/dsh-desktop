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

// Real filesystem rejection exercises the write/rename boundary, including reopening.
import { mkdirSync, renameSync, rmSync } from 'node:fs'
it.each(['write', 'rename'])(
  'never sends an unpersisted operation after a %s failure',
  async (failure) => {
    const d = await mkdtemp(join(tmpdir(), 'board-journal-'))
    dirs.push(d)
    let j = new ResearchRequestJournal(d)
    const key = j.prepare('a', 'b', 'mutation', { text: 'hello' }, 1)
    const block = () => {
      if (failure === 'write') mkdirSync(j.path + '.tmp')
      else {
        renameSync(j.path, j.path + '.saved')
        mkdirSync(j.path)
      }
    }
    const unblock = () => {
      if (failure === 'write') rmSync(j.path + '.tmp', { recursive: true })
      else {
        rmSync(j.path, { recursive: true })
        renameSync(j.path + '.saved', j.path)
      }
    }
    const identities = new Set()
    let drop = true
    const send = async (body: any) => {
      expect(
        new ResearchRequestJournal(d).get(key).steps.message.operationId
      ).toBe(body.operationId)
      identities.add(body.operationId)
      if (drop) {
        drop = false
        throw Error('lost ACK')
      }
      return { operationId: body.operationId, action: body.action, seq: 1 }
    }
    block()
    await expect(
      j.step(key, 'message', 'message', { text: 'hello' }, send)
    ).rejects.toThrow()
    expect(j.get(key).steps.message).toBeUndefined()
    await expect(
      j.step(key, 'message', 'message', { text: 'hello' }, send)
    ).rejects.toThrow()
    expect(identities.size).toBe(0)
    unblock()
    await expect(
      j.step(key, 'message', 'message', { text: 'hello' }, send)
    ).rejects.toThrow('lost ACK')
    j = new ResearchRequestJournal(d)
    await j.step(key, 'message', 'message', { text: 'hello' }, send)
    expect(identities.size).toBe(1)
  }
)
it('publishes prepare, update and replies only after successful durable replacement', async () => {
  const d = await mkdtemp(join(tmpdir(), 'board-journal-'))
  dirs.push(d)
  const j = new ResearchRequestJournal(d)
  mkdirSync(j.path + '.tmp')
  expect(() => j.prepare('a', 'b', 'm', {}, 1)).toThrow()
  expect(j.list('a')).toEqual([])
  rmSync(j.path + '.tmp', { recursive: true })
  const key = j.prepare('a', 'b', 'm', {}, 1)
  mkdirSync(j.path + '.tmp')
  expect(() => j.update(key, { state: 'accepted' })).toThrow()
  expect(j.get(key).state).toBeUndefined()
  rmSync(j.path + '.tmp', { recursive: true })
  const send = async (body: any) => {
    mkdirSync(j.path + '.tmp')
    return { operationId: body.operationId, action: body.action, seq: 1 }
  }
  await expect(j.step(key, 'message', 'message', {}, send)).rejects.toThrow()
  expect(j.get(key).steps.message.reply).toBeUndefined()
  expect(new ResearchRequestJournal(d).get(key)).toEqual(j.get(key))
})
