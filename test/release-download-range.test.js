import { expect, it, vi } from 'vitest'
import worker from '../scripts/sherlock-stable-download-worker.mjs'

const url = 'https://updates.evanarts.com/releases/v1.0.0/sherlock-mac-arm64.zip'
function fixture() {
  const body = new TextEncoder().encode('0123456789')
  const info = { size: body.length, etag: 'test', httpEtag: '"test"', uploaded: new Date('2026-09-19T00:00:00Z'),
    writeHttpMetadata(headers) { headers.set('content-type', 'application/zip') } }
  const bucket = { head: vi.fn(async () => info), get: vi.fn(async (_key, options) => ({
    ...info, body: options.range ? body.slice(options.range.offset, options.range.offset + options.range.length) : body
  })) }
  const fetch = (request) => worker.fetch(request, { SHERLOCK_RELEASES: bucket })
  return { fetch, bucket }
}
it('keeps a HEAD followed by repeated Range reads partial and byte-exact', async () => {
  const { fetch, bucket } = fixture()
  const head = await fetch(new Request(url, { method: 'HEAD' }))
  expect(head.status).toBe(200)
  expect(head.headers.get('content-length')).toBe('10')
  expect(await head.text()).toBe('')
  expect(bucket.get).not.toHaveBeenCalled()
  for (let i = 0; i < 2; i++) {
    const result = await fetch(new Request(url, { headers: { range: 'bytes=2-5' } }))
    expect(result.status).toBe(206)
    expect(result.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(result.headers.get('content-length')).toBe('4')
    expect(result.headers.get('cache-control')).toContain('immutable')
    expect(await result.text()).toBe('2345')
  }
})
it.each([['bytes=-3', '789'], ['bytes=8-', '89'], ['bytes=8-100', '89']])('supports %s', async (range, expected) => {
  const { fetch } = fixture()
  const result = await fetch(new Request(url, { headers: { range } }))
  expect(result.status).toBe(206)
  expect(await result.text()).toBe(expected)
})
it.each(['bytes=10-20', 'bytes=4-2', 'bytes=0-1,3-4', 'bytes=-0', 'bytes=9007199254740992-'])('rejects invalid range %s without reading the full body', async range => {
  const { fetch, bucket } = fixture()
  const result = await fetch(new Request(url, { headers: { range } }))
  expect(result.status).toBe(416)
  expect(result.headers.get('content-range')).toBe('bytes */10')
  expect(bucket.get).not.toHaveBeenCalled()
})
it('preserves mutable-alias cache policy and conditional reads', async () => {
  const { fetch, bucket } = fixture()
  const alias = 'https://updates.evanarts.com/download/sherlock-mac-arm64.dmg'
  const result = await fetch(new Request(alias, { headers: { range: 'bytes=0-1' } }))
  expect(result.status).toBe(206)
  expect(result.headers.get('cache-control')).toContain('no-store')
  const cached = await fetch(new Request(alias, { headers: { 'if-none-match': '"test"' } }))
  expect(cached.status).toBe(304)
  expect(bucket.get).toHaveBeenCalledTimes(1)
})
it('does not expose unrelated bucket keys or accept writes', async () => {
  const { fetch, bucket } = fixture()
  expect((await fetch(new Request('https://updates.evanarts.com/releases/private.txt'))).status).toBe(404)
  expect((await fetch(new Request(url, { method: 'POST' }))).status).toBe(405)
  expect(bucket.head).not.toHaveBeenCalled()
})
it('refuses to combine data if an alias changes during the request', async () => {
  const { fetch, bucket } = fixture()
  bucket.get.mockResolvedValueOnce({ size: 20 })
  expect((await fetch(new Request(url, { headers: { range: 'bytes=0-1' } }))).status).toBe(412)
})
