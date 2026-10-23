import { request } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { ResearchContextBridge } from '../src/main/state/research-context-bridge'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture(researchPdf?: (html: string, signal?: AbortSignal) => Promise<unknown>) {
  const calls: string[] = []
  const bridge = new ResearchContextBridge({
    readCanvas: () => ({ files: [], artifacts: [] }), resolveFile: async () => null,
    researchPdf: researchPdf ?? (async (html: string) => { calls.push(html); return { pdfBase64: 'JVBERi0xLjQK', sha256: 'a'.repeat(64), bytes: 9 } })
  })
  const endpoint = await bridge.start()
  cleanups.push(() => bridge.stop())
  const post = (body: unknown, headers: Record<string, string> = {}) => fetch(`${endpoint.url}/research-pdf`, {
    method: 'POST', headers: { authorization: `Bearer ${endpoint.token}`, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body)
  })
  return { bridge, endpoint, calls, post }
}

describe('authenticated research PDF bridge', () => {
  it('renders only literal HTML through the existing token and returns the bounded PDF result', async () => {
    const f = await fixture()
    const html = '<!doctype html><h1>贵州茅台研究报告</h1>' + '<p>证据</p>'.repeat(3000)
    const response = await f.post({ html })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ pdfBase64: 'JVBERi0xLjQK', bytes: 9 })
    expect(f.calls).toEqual([html])
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('rejects wrong credentials, browser origins, forwarded hosts and path-shaped inputs before rendering', async () => {
    const f = await fixture()
    for (const headers of [{ authorization: 'Bearer wrong' }, { origin: f.endpoint.url }, { 'x-forwarded-host': 'localhost' }] as Array<Record<string, string>>) {
      expect((await f.post({ html: '<h1>报告</h1>' }, headers)).status).toBe(403)
    }
    for (const body of [{ path: '/private/report.html' }, { html: '<p>报告</p>', path: '/private/report.html' }, { html: 1 }, { html: '' }, { html: '中'.repeat(1_398_102) }]) {
      expect((await f.post(body)).status).toBe(400)
    }
    expect(f.calls).toHaveLength(0)
  })

  it('holds at most one PDF request and propagates client disconnect as cancellation', async () => {
    let started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    let aborted!: () => void
    const cancelled = new Promise<void>(resolve => { aborted = resolve })
    const f = await fixture(async (_html, signal) => {
      started()
      return await new Promise((_resolve, reject) => signal!.addEventListener('abort', () => { aborted(); reject(Error('已取消。')) }, { once: true }))
    })
    const req = request(`${f.endpoint.url}/research-pdf`, { method: 'POST', headers: { authorization: `Bearer ${f.endpoint.token}`, 'content-type': 'application/json' } })
    req.on('error', () => {})
    req.end(JSON.stringify({ html: '<p>报告</p>' }))
    await ready
    expect((await f.post({ html: '<p>另一份报告</p>' })).status).toBe(429)
    req.destroy()
    await cancelled
  })

  it('returns explicit service errors without turning a failed PDF into success', async () => {
    const f = await fixture(async () => { throw Object.assign(Error('PDF 生成超时。'), { code: 'timeout' }) })
    const response = await f.post({ html: '<p>报告</p>' })
    expect(response.status).toBe(408)
    expect(await response.json()).toEqual({ error: 'PDF 生成超时。' })
  })

  it('rejects a declared JSON body above 64 MiB before buffering it', async () => {
    const f = await fixture()
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(`${f.endpoint.url}/research-pdf`, { method: 'POST', headers: {
        authorization: `Bearer ${f.endpoint.token}`, 'content-type': 'application/json', 'content-length': 64 * 1024 * 1024 + 1
      } }, response => { response.resume(); resolve(response.statusCode) })
      req.on('error', reject); req.end('{}')
    })
    expect(status).toBe(400)
    expect(f.calls).toHaveLength(0)
  })
})
