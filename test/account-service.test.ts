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
async function setup(options?: ConstructorParameters<typeof AccountService>[1]) {
  const dir = await mkdtemp(join(tmpdir(), 'sherlock-account-test-'))
  directories.push(dir)
  const service = new AccountService(dir, options)
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

it('skips cloud search when signed out, quota is empty or paused, and falls back after upstream rate limiting', async () => {
  const { service } = await setup()
  const signal = new AbortController().signal
  const quota = (fiveHour: number, week: number, paused = false) =>
    Response.json({ quota: { paused, fiveHour: { remaining: fiveHour }, week: { remaining: week } } })
  const remote = vi.fn()
    .mockResolvedValueOnce(Response.json({ user: { id: 'owner-a' }, token: 'd'.repeat(64) }))
    .mockResolvedValueOnce(quota(0, 10))
    .mockResolvedValueOnce(quota(10, 0))
    .mockResolvedValueOnce(quota(10, 10, true))
    .mockResolvedValueOnce(quota(10, 10))
    .mockResolvedValueOnce(Response.json({ error: { code: 'VOLCENGINE_UPSTREAM_RATE_LIMITED' } }, { status: 429 }))
    .mockResolvedValueOnce(quota(10, 10))
    .mockResolvedValueOnce(Response.json({ provider: 'doubao', sources: [], status: 'no_results', truncated: false }))
  vi.stubGlobal('fetch', remote)
  await expect(service.searchHosted('public query', 2, signal)).resolves.toBeUndefined()
  expect(remote).not.toHaveBeenCalled()
  await service.invoke('login', {})
  for (const reason of ['5h empty', 'week empty', 'paused', 'rate limited'])
    await expect(service.searchHosted(reason, 2, signal)).resolves.toBeUndefined()
  await expect(service.searchHosted('no matches', 2, signal)).resolves.toMatchObject({ provider: 'doubao', status: 'no_results' })
  expect(remote.mock.calls.slice(1).map(([url]) => new URL(url).pathname)).toEqual([
    '/v1/hosted-ai/quota', '/v1/hosted-ai/quota', '/v1/hosted-ai/quota',
    '/v1/hosted-ai/quota', '/v1/doubao/search', '/v1/hosted-ai/quota', '/v1/doubao/search'
  ])
})

it('rejects old hosted-AI bridge generations before contacting Cloudflare',async()=>{
  const onHostedQuotaChanged = vi.fn()
  const {service,endpoint}=await setup({ onHostedQuotaChanged })
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
  const send=(generation:number, path = 'chat/completions', requestId?: string)=>local(new URL(path,base),{method:'POST',body:'{}',headers:{
    authorization:'Bearer '+endpoint.token+'.'+generation, ...(requestId ? {'x-ework-request-id':requestId} : {})
  }})
  expect(await (await catalog()).json()).toEqual({models:[],image:false})
  expect(await service.invoke('ai-quota',undefined)).toEqual({user:null})
  expect((await send(service.generation)).status).toBe(401)
  expect(provider).not.toHaveBeenCalled()
  await service.invoke('login',{})
  const generation=service.generation
  expect(await (await catalog()).json()).toMatchObject({generation,image:true})
  expect(await service.invoke('ai-quota',undefined)).toMatchObject({quota:{fiveHour:{remaining:29}}})
  const chatId = '01234567-89ab-4cde-8fed-9876543210ab'
  expect(await (await send(generation,'chat/completions',chatId)).text()).toBe('data: [DONE]\n\n')
  expect(provider.mock.lastCall?.[1]?.headers).toMatchObject({'x-ework-request-id':chatId})
  await expect.poll(() => onHostedQuotaChanged.mock.calls.length).toBe(1)
  const imageId = 'f'.repeat(64)
  await (await send(generation,'images',imageId)).text()
  expect(provider.mock.lastCall?.[1]?.headers).toMatchObject({'x-ework-request-id':imageId})
  await expect.poll(() => onHostedQuotaChanged.mock.calls.length).toBe(2)
  await service.invoke('logout',{})
  await service.invoke('login',{})
  const calls=provider.mock.calls.length
  expect((await send(generation)).status).toBe(401)
  expect(provider).toHaveBeenCalledTimes(calls)
  expect(onHostedQuotaChanged).toHaveBeenCalledTimes(2)
})

it('recovers a failed chat connection at the same step and keeps its admission ID, body and account', async () => {
  const cloud = vi.fn<typeof fetch>()
  const { service, endpoint } = await setup({ fetch: cloud })
  cloud.mockResolvedValueOnce(Response.json({ user: { id: 'owner' }, token: 'a'.repeat(64) }))
  await service.invoke('login', {})
  const authorization = 'Bearer ' + endpoint.token + '.' + service.generation
  const body = JSON.stringify({ messages: [
    { role: 'assistant', tool_calls: [{ id: 'already-ran' }] },
    { role: 'tool', tool_call_id: 'already-ran', content: 'saved' }
  ] })
  const chat = (id?: string) => fetch(new URL('/hosted-ai/chat/completions', endpoint.url), {
    method: 'POST', headers: { authorization, ...(id ? { 'x-ework-request-id': id } : {}) }, body
  })
  const id = '01234567-89ab-4cde-8fed-9876543210ab'
  const success = () => new Response('data: completed\n\n', { headers: { 'content-type': 'text/event-stream' } })
  for (const failure of [new Response('edge unavailable', { status: 503, headers: { 'retry-after': '0' } }), new TypeError('fetch failed')]) {
    cloud.mockClear()
    if (failure instanceof Error) cloud.mockRejectedValueOnce(failure)
    else cloud.mockResolvedValueOnce(failure)
    cloud.mockResolvedValueOnce(success())
    const supplied = failure instanceof Error ? undefined : id
    expect(await (await chat(supplied)).text()).toBe('data: completed\n\n')
    expect(cloud).toHaveBeenCalledTimes(2)
    const first = cloud.mock.calls[0]![1]!
    const retriedId = new Headers(first.headers).get('x-ework-request-id')
    expect(retriedId).toMatch(/^[a-f0-9-]{36}$/)
    if (supplied) expect(retriedId).toBe(supplied)
    expect(first.body?.toString()).toBe(body)
    expect(cloud.mock.calls[1]).toEqual(cloud.mock.calls[0])
  }
  // A lost acknowledgement may mean the gateway already admitted the request.
  cloud.mockClear()
  cloud.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(
    Response.json({ error: { code: 'HOSTED_AI_DUPLICATE' } }, { status: 409 })
  )
  expect((await chat(id)).status).toBe(409)
  expect(cloud).toHaveBeenCalledTimes(2)
  expect(cloud.mock.calls[1]).toEqual(cloud.mock.calls[0])
  // An upstream rejection identified by the gateway, quota exhaustion and an already
  // streaming reply must each finish with their original status and body.
  for (const response of [
    new Response('upstream failed', { status: 502, headers: { 'x-ework-request-id': id } }),
    new Response('quota', { status: 429 }),
    new Response('back off', { status: 503, headers: { 'retry-after': '60' } }),
    new Response('data: partial\n\ndata: interrupted\n\n', { headers: { 'content-type': 'text/event-stream' } })
  ]) {
    cloud.mockClear()
    const expected = await response.clone().text()
    cloud.mockResolvedValueOnce(response)
    const result = await chat(id)
    expect(result.status).toBe(response.status)
    expect(await result.text()).toBe(expected)
    expect(cloud).toHaveBeenCalledTimes(1)
  }
})

it('cancels chat recovery when the captured account changes before reconnect', async () => {
  const cloud = vi.fn<typeof fetch>()
  const { service, endpoint } = await setup({ fetch: cloud })
  const login = (id: string) => Response.json({ user: { id }, token: id.repeat(64) })
  cloud.mockResolvedValueOnce(login('a'))
  await service.invoke('login', {})
  const discarded = deferred<void>()
  cloud.mockResolvedValueOnce(new Response(new ReadableStream({ cancel: () => discarded.resolve() }), { status: 503 }))
  const request = fetch(new URL('/hosted-ai/chat/completions', endpoint.url), {
    method: 'POST', headers: { authorization: 'Bearer ' + endpoint.token + '.' + service.generation }, body: '{}'
  })
  await discarded.promise
  cloud.mockResolvedValueOnce(login('b'))
  await service.invoke('login', {})
  expect((await request).ok).toBe(false)
  expect(cloud.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
    '/v1/account/login', '/v1/hosted-ai/chat/completions', '/v1/account/login'
  ])
})

it('distinguishes a temporary catalog failure from an empty catalog and isolates stale results by login', async () => {
  const { service, endpoint } = await setup()
  const local = globalThis.fetch
  const catalog = () => local(new URL('/hosted-ai/catalog', endpoint.url), { headers: { authorization: 'Bearer ' + endpoint.token } })
  const delayed = deferred<Response>()
  const models = [{ id: 'doubao-seed-2.1-lite' }]
  const originFetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ user: { id: 'a' }, token: 'a'.repeat(64) }))
    .mockResolvedValueOnce(Response.json({ models, image: true, memory: true }))
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(Response.json({ models: [], image: false }))
    .mockImplementationOnce(() => delayed.promise)
    .mockResolvedValueOnce(Response.json({ user: { id: 'b' }, token: 'b'.repeat(64) }))
    .mockResolvedValueOnce(new Response('', { status: 503 }))
  vi.stubGlobal('fetch', originFetch)
  const start = Date.now()
  const now = vi.spyOn(Date, 'now').mockReturnValue(start)
  try {
    await service.invoke('login', {})
    const generation = service.generation
    expect(await (await catalog()).json()).toMatchObject({ models, image: true, generation })
    now.mockReturnValue(start + 59_999)
    expect(await (await catalog()).json()).toMatchObject({ models, image: true, generation })
    expect(originFetch).toHaveBeenCalledTimes(2)
    now.mockReturnValue(start + 60_000)
    expect(await (await catalog()).json()).toMatchObject({ models, image: true, generation, status: 'stale' })
    expect(await service.invoke('ai-catalog-status', undefined)).toEqual({ catalogStatus: 'stale' })
    expect(originFetch).toHaveBeenCalledTimes(3)
    now.mockReturnValue(start + 89_999)
    expect(await (await catalog()).json()).toMatchObject({ models, image: true, generation, status: 'stale' })
    expect(originFetch).toHaveBeenCalledTimes(3)
    now.mockReturnValue(start + 90_000)
    expect(await (await catalog()).json()).toEqual({ models: [], image: false, generation })
    now.mockReturnValue(start + 150_000)
    const previous = catalog()
    await expect.poll(() => originFetch.mock.calls.length).toBe(5)
    await service.invoke('login', {})
    const unavailable = await catalog()
    expect(unavailable.status).toBe(503)
    expect(await unavailable.json()).toEqual({ generation: service.generation, status: 'unavailable' })
    expect(await service.invoke('ai-catalog-status', undefined)).toEqual({ catalogStatus: 'unavailable' })
    delayed.resolve(Response.json({ models, image: true }))
    const superseded = await previous
    expect(superseded.status).toBe(409)
    expect(await superseded.json()).toEqual({ generation: service.generation, status: 'session-changed' })
  } finally { now.mockRestore() }
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

it('deduplicates concurrent speech, retains paid segments across restarts and isolates accounts', async () => {
  const { service, dir } = await setup()
  const login = (owner: string) => Response.json({ user: { id: owner }, token: 'b'.repeat(64) })
  const audio = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } })
  const remote = vi.fn().mockResolvedValueOnce(login('a'))
  vi.stubGlobal('fetch', remote)
  await service.invoke('login', {})
  const signal = new AbortController().signal
  const first = deferred<Response>()
  remote.mockReturnValueOnce(first.promise)
  const canceled = new AbortController()
  const abandoned = service.narratePresentation('a', '首句。', canceled.signal)
  const joined = service.narratePresentation('a', '首句。', signal)
  await vi.waitFor(() => expect(remote).toHaveBeenCalledTimes(2))
  canceled.abort()
  first.resolve(audio())
  await expect(abandoned).rejects.toThrow()
  await expect(joined).resolves.toEqual(new Uint8Array([1, 2, 3]))
  const reopened = new AccountService(dir)
  services.push(reopened)
  await reopened.start()
  await reopened.narratePresentation('a', '首句。', signal)
  expect(remote).toHaveBeenCalledTimes(2)
  remote.mockResolvedValueOnce(audio())
  await reopened.narratePresentation('a', '改过的首句。', signal)
  remote.mockResolvedValueOnce(Response.json({ ok: true }))
  await reopened.invoke('logout', {})
  await expect(reopened.narratePresentation('a', '首句。', signal)).rejects.toThrow('登录')
  remote.mockResolvedValueOnce(login('b')).mockResolvedValueOnce(audio())
  await reopened.invoke('login', {})
  await reopened.narratePresentation('b', '首句。', signal)
  expect(remote.mock.calls.filter(([url]) => String(url).endsWith('/speech'))).toHaveLength(3)
})
