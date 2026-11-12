import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
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
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(complete => { resolve = complete })
  return { promise, resolve }
}
it('uses the encrypted EWork session for built-in MCP without exposing or accepting a DataYes key',async()=>{
 const {service}=await setup()
 await expect(service.datayesMcpRequest('{}',AbortSignal.timeout(5000))).rejects.toMatchObject({code:'AUTH_REQUIRED'})
 const remote=vi.fn().mockResolvedValueOnce(Response.json({user:{id:'owner-a'},token:'d'.repeat(64)})).mockResolvedValueOnce(Response.json({jsonrpc:'2.0',id:1,result:{tools:[]}}))
 vi.stubGlobal('fetch',remote)
 await service.invoke('login',{})
 const body=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})
 expect((await service.datayesMcpRequest(body,AbortSignal.timeout(5000))).status).toBe(200)
 expect(remote.mock.calls[1]?.[0]).toBe('https://updates.evanarts.com/v1/datayes/mcp')
 expect(remote.mock.calls[1]?.[1]).toMatchObject({method:'POST',redirect:'error',headers:{authorization:'Bearer '+'d'.repeat(64)},body})
})
it('reports unavailable cloud MCP immediately without exposing response bodies or untrusted diagnostics',async()=>{
 const {service}=await setup()
 const warning=vi.spyOn(console,'warn').mockImplementation(()=>{})
 try {
  const remote=vi.fn().mockResolvedValueOnce(Response.json({user:{id:'owner-a'},token:'d'.repeat(64)})).mockResolvedValueOnce(new Response('private-upstream-body',{status:503,headers:{'x-ework-datayes-stage':'untrusted-secret','x-ework-datayes-status':'private'}}))
  vi.stubGlobal('fetch',remote);await service.invoke('login',{})
  await expect(service.datayesMcpRequest('{}',AbortSignal.timeout(5000))).rejects.toMatchObject({code:'RUNTIME_UNAVAILABLE',message:'通联数据服务暂时不可用，请稍后重新测试'})
  expect(JSON.stringify(warning.mock.calls)).not.toMatch(/private|untrusted-secret/)
 } finally { warning.mockRestore() }
})
it('binds cached integration identity to the encrypted session and clears it on logout',async()=>{
  const {service,dir}=await setup()
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({user:{id:'owner-a'},token:'a'.repeat(64)})))
  await service.invoke('login',{})
  expect(service.accountId).toBe('owner-a')
  const restarted=new AccountService(dir);services.push(restarted);await restarted.start()
  expect(restarted.accountId).toBe('owner-a')
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({ok:true})))
  await restarted.invoke('logout',{})
  expect(restarted.accountId).toBeUndefined()
})
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

it('restores the cached public account after an offline restart until revocation is confirmed', async () => {
  const { service, dir } = await setup()
  const user = { id: 'owner-a', username: 'tester', createdAt: 1 }
  const remote = vi.fn()
    .mockResolvedValueOnce(Response.json({ user, token: 'a'.repeat(64) }))
    .mockRejectedValueOnce(Error('offline'))
    .mockResolvedValueOnce(Response.json({ error: { code: 'ACCOUNT_SERVICE_UNAVAILABLE' } }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ error: { code: 'LOGIN_REQUIRED' } }, { status: 401 }))
  vi.stubGlobal('fetch', remote)
  await service.invoke('login', {})
  service.stop()

  const restarted = new AccountService(dir)
  services.push(restarted)
  await restarted.start()
  expect(await restarted.invoke('me', {})).toEqual({ user, error: { code: 'ACCOUNT_SERVICE_UNAVAILABLE' } })
  expect(await restarted.invoke('me', {})).toEqual({ user, error: { code: 'ACCOUNT_SERVICE_UNAVAILABLE' } })
  expect(await restarted.invoke('me', {})).toEqual({ error: { code: 'LOGIN_REQUIRED' } })
  expect(await restarted.invoke('me', {})).toEqual({ user: null })
  await expect(readFile(join(dir, 'account-session'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(join(dir, 'account-identity'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('upgrades an ID-only cache on the next online account check and ignores a different token fingerprint', async () => {
  const { service, dir } = await setup()
  const user = { id: 'owner-a', username: 'tester', createdAt: 1 }
  const token = 'a'.repeat(64)
  const fingerprint = createHash('sha256').update(token).digest('hex')
  const file = join(dir, 'account-identity')
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json({ user, token }))
    .mockResolvedValueOnce(Response.json({ user }))
    .mockRejectedValue(Error('offline')))
  await service.invoke('login', {})
  service.stop()
  await writeFile(file, JSON.stringify({ id: user.id, fingerprint }))

  const restarted = new AccountService(dir)
  services.push(restarted)
  await restarted.start()
  expect(restarted.accountId).toBe(user.id)
  expect(await restarted.invoke('me', {})).toEqual({ user })
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ ...user, fingerprint })
  restarted.stop()
  await writeFile(file, JSON.stringify({ ...user, fingerprint: 'b'.repeat(64) }))

  const changedToken = new AccountService(dir)
  services.push(changedToken)
  await changedToken.start()
  expect(changedToken.accountId).toBeUndefined()
  expect(await changedToken.invoke('me', {})).toEqual({ error: { code: 'ACCOUNT_SERVICE_UNAVAILABLE' } })
})

it.each([200, 503, 401])('revalidates a collaboration rejection with the account endpoint (status %i)', async status => {
  const { service, dir } = await setup()
  const token = 'a'.repeat(64)
  const user = { id: 'owner-a', username: 'tester', createdAt: 1 }
  const rejected = () => Response.json({ error: { code: 'LOGIN_REQUIRED' } }, { status: 401 })
  const remote = vi.fn()
    .mockResolvedValueOnce(Response.json({ user, token }))
    .mockResolvedValueOnce(rejected())
    .mockResolvedValueOnce(status === 200 ? Response.json({ user }) : status === 401
      ? rejected()
      : Response.json({ error: { code: 'ACCOUNT_SERVICE_UNAVAILABLE' } }, { status }))
  vi.stubGlobal('fetch', remote)
  await service.invoke('login', {})

  await expect(service.collaborationRequest({ kind: 'me' })).rejects.toMatchObject(status === 401
    ? { code: 'SESSION_CHANGED' }
    : { code: 'COLLABORATION_UNAVAILABLE', retryable: true, status: 503 })
  expect(remote.mock.calls[2]?.[0]).toMatch(/\/v1\/account\/me$/)
  expect(remote.mock.calls[2]?.[1].headers.authorization).toBe(`Bearer ${token}`)
  expect(service.authenticated).toBe(status !== 401)
  const stored = readFile(join(dir, 'account-session'))
  if (status === 401) await expect(stored).rejects.toMatchObject({ code: 'ENOENT' })
  else await expect(stored).resolves.toEqual(Buffer.from(`encrypted:${token}`))
})

it('shares one account revalidation across concurrent collaboration rejections', async () => {
  const { service } = await setup()
  const user = { id: 'owner-a', username: 'tester', createdAt: 1 }
  const accountResponse = deferred<Response>()
  const remote = vi.fn(async (url: string) => {
    if (url.endsWith('/login')) return Response.json({ user, token: 'a'.repeat(64) })
    if (url.endsWith('/account/me')) return accountResponse.promise
    return Response.json({ error: { code: 'LOGIN_REQUIRED' } }, { status: 401 })
  })
  vi.stubGlobal('fetch', remote)
  await service.invoke('login', {})
  const first = expect(service.collaborationRequest({ kind: 'me' })).rejects.toMatchObject({ code: 'COLLABORATION_UNAVAILABLE' })
  const second = expect(service.collaborationRequest({ kind: 'boards.list' })).rejects.toMatchObject({ code: 'COLLABORATION_UNAVAILABLE' })
  await new Promise<void>(resolve => setImmediate(resolve))
  accountResponse.resolve(Response.json({ user }))
  await Promise.all([first, second])
  expect(remote.mock.calls.filter(([url]) => url.endsWith('/account/me'))).toHaveLength(1)
})

it('keeps an old collaboration rejection from clearing a session while a new login is pending', async () => {
  const { service, dir } = await setup()
  const oldToken = 'a'.repeat(64), newToken = 'b'.repeat(64)
  const { promise: newLoginResponse, resolve: resolveNewLogin } = deferred<Response>()
  const { promise: loginStarted, resolve: markLoginStarted } = deferred<void>()
  const { promise: oldResponse, resolve: resolveOldResponse } = deferred<Response>()
  const remote = vi.fn()
    .mockResolvedValueOnce(Response.json({ user: { id: 'owner-a' }, token: oldToken }))
    .mockReturnValueOnce(oldResponse)
    .mockImplementationOnce(() => { markLoginStarted(); return newLoginResponse })
  vi.stubGlobal('fetch', remote)
  await service.invoke('login', {})
  const generation = service.generation
  const collaboration = expect(service.collaborationRequest({ kind: 'me' })).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
  const newLogin = service.invoke('login', {})
  await loginStarted
  resolveOldResponse(Response.json({ error: { code: 'LOGIN_REQUIRED' } }, { status: 401 }))
  await new Promise<void>(resolve => setImmediate(resolve))
  const generationWhilePending = service.generation
  resolveNewLogin(Response.json({ user: { id: 'owner-b' }, token: newToken }))
  await newLogin
  await collaboration

  expect(generationWhilePending).toBe(generation)
  expect(remote).toHaveBeenCalledTimes(3)
  expect(service.accountId).toBe('owner-b')
  expect(await readFile(join(dir, 'account-session'))).toEqual(Buffer.from(`encrypted:${newToken}`))
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

it('forwards research schemas and larger analysis requests through the authenticated local bridge', async () => {
  const realFetch = globalThis.fetch
  const { service, endpoint } = await setup()
  const cloudToken = 'c'.repeat(64)
  const remote = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/login'))
        return Response.json({ token: cloudToken })
      expect(String(url)).toBe(
        'https://updates.evanarts.com/v1/fund-research/query'
      )
      expect((init?.headers as Record<string, string>).authorization).toBe(
        `Bearer ${cloudToken}`
      )
      expect(init?.redirect).toBe('error')
      const body = JSON.parse(Buffer.from(init?.body as Buffer).toString())
      expect(body.operation).toBe('execute')
      expect(body.arguments.query.length).toBe(3000)
      return Response.json({ status: 'received' })
    }
  )
  vi.stubGlobal('fetch', remote)
  await service.invoke('login', {})
  const headers = { authorization: `Bearer ${endpoint.token}` }
  const response = await realFetch(endpoint.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      operation: 'execute',
      capability: 'financial_news',
      schema_hash: 'b'.repeat(64),
      arguments: { query: 'x'.repeat(3000) }
    })
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'received' })
  const large = await realFetch(endpoint.url, {
    method: 'POST',
    headers,
    body: 'x'.repeat(17 * 1024)
  })
  expect(large.status).toBe(413)
  expect(remote).toHaveBeenCalledTimes(2)
})

it('authenticates only fixed collaboration endpoints and invalidates old replies across same-account login', async () => {
  const { service } = await setup()
  let resolveOld!: (value: Response) => void
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/login'))
        return Response.json({ token: 'a'.repeat(64) })
      expect(url).toBe('https://updates.evanarts.com/v1/collaboration/me')
      expect(init.redirect).toBe('error')
      expect((init.headers as Record<string, string>).authorization).toBe(
        `Bearer ${'a'.repeat(64)}`
      )
      return new Promise<Response>((resolve) => {
        resolveOld = resolve
      })
    })
  )
  await service.invoke('login', {})
  let changes = 0
  service.subscribeSessionChanged(() => changes++)
  const request = service.collaborationRequest({ kind: 'me' })
  await service.invoke('login', {})
  resolveOld(Response.json({ user: { userId: 'old' } }))
  await expect(request).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
  expect(changes).toBeGreaterThan(0)
  await expect(
    service.collaborationRequest({ kind: 'https://evil.invalid' } as never)
  ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
})

it('routes isolated native login and collaboration to the same loopback service', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sherlock-account-local-'))
  directories.push(dir)
  const service = new AccountService(dir, { origin: 'http://127.0.0.1:8773' })
  services.push(service)
  const remote = vi.fn(async (_url: string, _options?: RequestInit) => Response.json({ user: { id: 'local' }, token: 'c'.repeat(64) }))
  vi.stubGlobal('fetch', remote)
  await service.invoke('login', { username: 'localtester', password: 'synthetic-test-password' })
  expect(remote.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8773/v1/account/login')
  await service.collaborationRequest({ kind: 'me' })
  expect(remote.mock.calls[1]?.[0]).toBe('http://127.0.0.1:8773/v1/collaboration/me')
})

it('uses only the EWork session token for the professional dataset and Doubao search', async () => {
  const { service } = await setup()
  const signal = AbortSignal.timeout(5000)
  await expect(service.doubaoSearch('public query', 2, signal)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  const token = 'd'.repeat(64)
  const remote = vi.fn().mockResolvedValueOnce(Response.json({ user: { id: 'owner-a' }, token }))
    .mockResolvedValueOnce(Response.json({ provider: 'doubao', sources: [{ url: 'https://example.org/' }], truncated: false }))
    .mockResolvedValueOnce(Response.json({ jsonrpc: '2.0', id: 1, result: { tools: [] } }))
  vi.stubGlobal('fetch', remote)
  await service.invoke('login', {})
  await expect(service.doubaoSearch('public query', 2, signal)).resolves.toMatchObject({ provider: 'doubao' })
  const mcpBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  expect((await service.dataproMcpRequest(mcpBody, signal)).ok).toBe(true)
  for (const [index, path, body] of [
    [1, '/v1/doubao/search', JSON.stringify({ query: 'public query', maxResults: 2 })],
    [2, '/v1/datapro/mcp', mcpBody]
  ] as const) {
    expect(remote.mock.calls[index]?.[0]).toBe('https://updates.evanarts.com' + path)
    expect(remote.mock.calls[index]?.[1]).toMatchObject({
      method: 'POST', redirect: 'error', body,
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: 'Bearer ' + token }
    })
  }
})

it('rejects old hosted-AI bridge generations before contacting Cloudflare',async()=>{
  const {service,endpoint}=await setup()
  const local=globalThis.fetch, provider=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const path=new URL(String(input)).pathname
    if(path.endsWith('/login'))return Response.json({user:{id:'owner-a'},token:'a'.repeat(64)})
    if(path.endsWith('/logout'))return Response.json({ok:true})
    expect(init?.headers).toMatchObject({authorization:'Bearer '+'a'.repeat(64)})
    if(path.endsWith('/catalog'))return Response.json({models:[{id:'doubao-seed-2.1-lite'}],image:true})
    if(path.endsWith('/quota'))return Response.json({quota:{fiveHour:{limit:100,remaining:29,resetAt:null}}})
    return new Response('data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}})
  })
  vi.stubGlobal('fetch',provider)
  const base=new URL('/hosted-ai/',endpoint.url)
  const catalog=()=>local(new URL('catalog',base),{headers:{authorization:'Bearer '+endpoint.token}})
  const send=(generation:number)=>local(new URL('chat/completions',base),{method:'POST',body:'{}',headers:{authorization:'Bearer '+endpoint.token+'.'+generation}})
  expect(await (await catalog()).json()).toEqual({models:[],image:false})
  expect(await service.invoke('ai-quota',undefined)).toEqual({user:null})
  expect((await send(service.generation)).status).toBe(401)
  expect(provider).not.toHaveBeenCalled()
  await service.invoke('login',{})
  const generation=service.generation
  expect(await (await catalog()).json()).toMatchObject({generation,image:true})
  expect(await service.invoke('ai-quota',undefined)).toMatchObject({quota:{fiveHour:{remaining:29}}})
  expect(await (await send(generation)).text()).toBe('data: [DONE]\n\n')
  await service.invoke('logout',{})
  await service.invoke('login',{})
  const calls=provider.mock.calls.length
  expect((await send(generation)).status).toBe(401)
  expect(provider).toHaveBeenCalledTimes(calls)
})

it('does not sign out an account until the account service confirms a quota-gateway 401',async()=>{
  const {service}=await setup()
  const user={id:'owner-a',username:'tester',createdAt:1}
  const rejected=()=>Response.json({error:{code:'LOGIN_REQUIRED'}},{status:401})
  const remote=vi.fn()
    .mockResolvedValueOnce(Response.json({user,token:'a'.repeat(64)}))
    .mockResolvedValueOnce(rejected())
    .mockResolvedValueOnce(Response.json({user}))
    .mockResolvedValueOnce(rejected())
    .mockResolvedValueOnce(rejected())
  vi.stubGlobal('fetch',remote)
  await service.invoke('login',{})
  expect(await service.invoke('ai-quota',undefined)).toEqual({error:{code:'HOSTED_AI_UNAVAILABLE'}})
  expect(service.authenticated).toBe(true)
  expect(await service.invoke('ai-quota',undefined)).toEqual({error:{code:'LOGIN_REQUIRED'}})
  expect(service.authenticated).toBe(false)
  expect(remote.mock.calls.map(([url])=>new URL(String(url)).pathname)).toEqual([
    '/v1/account/login','/v1/hosted-ai/quota','/v1/account/me','/v1/hosted-ai/quota','/v1/account/me'
  ])
})
