import { beforeEach, expect, it, vi } from 'vitest'
import { createPublicFinancialFetch, createPublicFinancialWidgetData } from '../src/main/financial/public-widget-data'
import { networkFetch } from '../src/main/integrations/adapters/network-policy'

vi.mock('../src/main/integrations/adapters/network-policy', () => ({ networkFetch: vi.fn() }))

function setup(route: string) {
  const reply = () => new Response('v_hint="sz~000858~五粮液";', { headers: { 'content-type': 'text/plain; charset=utf-8' } })
  const networkSession = { resolveProxy: vi.fn(async () => route), fetch: vi.fn(async () => reply()) }
  const service = createPublicFinancialWidgetData({ identity: () => null, networkSession })
  return { networkSession, service, reply }
}

beforeEach(() => vi.resetAllMocks())

it('uses the system proxy to search the guide stock even when direct DNS is unavailable', async () => {
  const { service, networkSession } = setup('PROXY 127.0.0.1:7890; DIRECT')
  vi.mocked(networkFetch).mockRejectedValue(new Error('direct DNS unavailable'))
  const result = await service.query({ action: 'search', query: '000858' })
  expect(result.symbols).toContainEqual({ market: 'SZ', code: '000858', name: '五粮液' })
  expect(networkSession.fetch).toHaveBeenCalledWith(expect.stringContaining('https://smartbox.gtimg.cn/s3/'), expect.objectContaining({
    credentials: 'omit', redirect: 'error', signal: expect.any(AbortSignal),
  }))
  expect(networkFetch).not.toHaveBeenCalled()
})

it.each(['DIRECT', 'DIRECT; PROXY 127.0.0.1:7890', ''])('retains DNS-pinned requests for a direct route %j', async route => {
  const { service, networkSession, reply } = setup(route)
  vi.mocked(networkFetch).mockResolvedValue(reply())
  expect((await service.query({ action: 'search', query: '000858' })).symbols[0].name).toBe('五粮液')
  expect(networkFetch).toHaveBeenCalledOnce()
  expect(networkSession.fetch).not.toHaveBeenCalled()
})

it.each(['http://smartbox.gtimg.cn/s3/', 'https://unlisted.example/', 'https://user@smartbox.gtimg.cn/'])('rejects an unapproved source before consulting the proxy', async url => {
  const { networkSession } = setup('SOCKS5 proxy:1080')
  await expect(createPublicFinancialFetch(networkSession)(url)).rejects.toThrow('无效的公开行情来源')
  expect(networkSession.resolveProxy).not.toHaveBeenCalled()
  expect(networkSession.fetch).not.toHaveBeenCalled()
  expect(networkFetch).not.toHaveBeenCalled()
})

it('cancels a pending proxy lookup without sending a late request', async () => {
  const { networkSession } = setup('PROXY proxy:8080')
  let complete!: (route: string) => void
  networkSession.resolveProxy.mockImplementation(() => new Promise(resolve => { complete = resolve }))
  const controller = new AbortController()
  const result = createPublicFinancialFetch(networkSession)('https://smartbox.gtimg.cn/', { signal: controller.signal })
  await Promise.resolve()
  controller.abort()
  await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  complete('PROXY proxy:8080')
  await Promise.resolve()
  expect(networkSession.fetch).not.toHaveBeenCalled()
  expect(networkFetch).not.toHaveBeenCalled()
})

it('surfaces a failed proxy request and leaves it available for retry', async () => {
  const { service, networkSession } = setup('HTTPS proxy:443')
  networkSession.fetch.mockRejectedValueOnce(Error('upstream unavailable'))
  const query = { action: 'search', query: '000858' }
  await expect(service.query(query)).rejects.toThrow('公开数据源暂不可用')
  expect((await service.query(query)).symbols[0].name).toBe('五粮液')
  expect(networkFetch).not.toHaveBeenCalled()
})
