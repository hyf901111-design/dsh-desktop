import { afterEach, expect, it, vi } from 'vitest'
import {
  CollaborationClient,
  collaborationRequestSpec,
  collaborationSocketUrl
} from '../src/main/collaboration-client'
afterEach(() => vi.useRealTimers())
it('constructs fixed collaboration endpoints and rejects arbitrary destinations and path escapes', () => {
  expect(
    collaborationRequestSpec({ kind: 'board.get', boardId: 'board-a' }).path
  ).toBe('/v1/collaboration/boards/board-a')
  for (const endpoint of [
    { kind: 'https://evil.invalid' },
    { kind: 'board.get', boardId: '../me' },
    { kind: 'board.get', boardId: 'a?token=x' },
    { kind: 'board.get', boardId: 'a', url: 'https://evil.invalid' }
  ])
    expect(() => collaborationRequestSpec(endpoint as never)).toThrow()
  expect(collaborationSocketUrl('/v1/collaboration/connect?ticket=abc')).toBe(
    'wss://updates.evanarts.com/v1/collaboration/connect?ticket=abc'
  )
  for (const url of [
    'https://evil.invalid/a',
    '//evil.invalid/a',
    '/v1/account/me',
    '/v1/collaboration/connect?ticket=abc&token=private'
  ])
    expect(() => collaborationSocketUrl(url)).toThrow()
  expect(() =>
    collaborationSocketUrl(
      '/v1/collaboration/connect?ticket=abc',
      'http://evil.invalid'
    )
  ).toThrow()
})
it('ignores an old same-account session request result after generation changes', async () => {
  let done!: (v: unknown) => void
  const account = {
    generation: 1,
    authenticated: true,
    subscribeSessionChanged: () => () => {},
    collaborationRequest: () =>
      new Promise((r) => {
        done = r
      })
  }
  const client = new CollaborationClient(account)
  const request = client.request({ kind: 'me' })
  account.generation++
  done({ user: { userId: 'same-account' } })
  await expect(request).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
  client.stop()
})

it('delivers board presence only after welcome, pings, and closes old session sockets', async () => {
  vi.useFakeTimers()
  const subscribers = new Set<() => void>()
  const account = {
    generation: 1,
    authenticated: true,
    subscribeSessionChanged: (fn: () => void) => {
      subscribers.add(fn)
      return () => subscribers.delete(fn)
    },
    collaborationRequest: async () => ({
      url: '/v1/collaboration/connect?ticket=abc'
    })
  }
  const events: unknown[] = []
  const sent: string[] = []
  const handlers = new Map<string, Function[]>()
  let closed = 0
  const socket = {
    readyState: 1,
    send: (s: string) => sent.push(s),
    close: () => {
      closed++
    },
    addEventListener: (type: string, fn: Function) => {
      handlers.set(type, [...(handlers.get(type) ?? []), fn])
    }
  }
  const emit = (type: string, data: unknown) => {
    for (const fn of handlers.get(type) ?? [])
      fn(type === 'message' ? { data: JSON.stringify(data) } : data)
  }
  const client = new CollaborationClient(account, {
    socketFactory: () => socket
  })
  client.watch({ scope: 'board', boardId: 'b' }, (event) => events.push(event))
  await vi.advanceTimersByTimeAsync(0)
  emit('message', { type: 'presence', presence: [{ userId: 'early' }] })
  expect(events).toEqual([])
  emit('message', { type: 'welcome', scope: 'board' })
  emit('message', { type: 'presence', presence: [{ userId: 'present' }] })
  expect(events).toHaveLength(2)
  await vi.advanceTimersByTimeAsync(10_000)
  expect(sent).toContain('{"type":"ping"}')
  account.generation++
  for (const fn of subscribers) fn()
  emit('message', { type: 'presence', presence: [{ userId: 'old' }] })
  expect(events).toHaveLength(2)
  expect(closed).toBe(1)
  client.stop()
})
