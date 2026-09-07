import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`encrypted:${s}`),
    decryptString: (b: Buffer) => b.toString().slice(10)
  }
}))
import { AccountService } from '../src/main/account-service'
const directories: string[] = []
const services: AccountService[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  for (const service of services.splice(0)) service.stop()
  for (const path of directories.splice(0))
    await rm(path, { recursive: true, force: true })
})
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'sherlock-account-test-'))
  directories.push(dir)
  const service = new AccountService(dir)
  services.push(service)
  return { service, dir, endpoint: await service.start() }
}
it('keeps cloud session credentials out of renderer replies and encrypts persistence', async () => {
  const { service, dir } = await setup()
  const token = 'a'.repeat(64)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ user: { id: '1', username: 'tester' }, token })
    )
  )
  const reply = await service.invoke('login', {
    username: 'tester',
    password: 'not-a-real-password'
  })
  expect(reply).toEqual({ user: { id: '1', username: 'tester' } })
  expect((await readFile(join(dir, 'account-session'))).toString()).toBe(
    `encrypted:${token}`
  )
})
it('rejects unauthenticated local bridge calls and requires a logged-in account', async () => {
  const { endpoint } = await setup()
  expect(
    (await fetch(endpoint.url, { method: 'POST', body: '{}' })).status
  ).toBe(403)
  expect(
    (
      await fetch(endpoint.url, {
        method: 'POST',
        headers: { authorization: `Bearer ${endpoint.token}` },
        body: '{}'
      })
    ).status
  ).toBe(401)
  expect(
    (
      await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${endpoint.token}`,
          origin: 'https://untrusted.invalid'
        },
        body: '{}'
      })
    ).status
  ).toBe(403)
})
it('retains the session after a failed logout and clears it after server revocation', async () => {
  const { service } = await setup()
  const remote = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ user: { id: '1' }, token: 'a'.repeat(64) })
    )
    .mockResolvedValueOnce(
      Response.json(
        { error: { code: 'ACCOUNT_SERVICE_UNAVAILABLE' } },
        { status: 503 }
      )
    )
    .mockResolvedValueOnce(Response.json({ ok: true }))
  vi.stubGlobal('fetch', remote)
  await service.invoke('login', {})
  expect(await service.invoke('logout', {})).toHaveProperty('error')
  await service.invoke('logout', {})
  expect(remote.mock.calls[2]?.[1].headers.authorization).toBe(
    `Bearer ${'a'.repeat(64)}`
  )
  expect(await service.invoke('me', {})).toEqual({ user: null })
})
it('invalidates expired or disabled-account sessions but preserves sessions on network failure', async () => {
  const { service } = await setup()
  const remote = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ token: 'b'.repeat(64) }))
    .mockRejectedValueOnce(Error('offline'))
    .mockResolvedValueOnce(
      Response.json({ error: { code: 'LOGIN_REQUIRED' } }, { status: 401 })
    )
  vi.stubGlobal('fetch', remote)
  await service.invoke('login', {})
  expect(await service.invoke('me', {})).toHaveProperty('error')
  await service.invoke('me', {})
  expect(await service.invoke('me', {})).toEqual({ user: null })
  expect(remote).toHaveBeenCalledTimes(3)
})

it('allows logout to finish after the server session has already expired', async () => {
  const { service } = await setup()
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ token: 'a'.repeat(64) }))
      .mockResolvedValueOnce(
        Response.json({ error: { code: 'LOGIN_REQUIRED' } }, { status: 401 })
      )
  )
  await service.invoke('login', {})
  expect(await service.invoke('logout', {})).toEqual({ ok: true })
  expect(await service.invoke('logout', {})).toEqual({ ok: true })
  expect(await service.invoke('me', {})).toEqual({ user: null })
})
