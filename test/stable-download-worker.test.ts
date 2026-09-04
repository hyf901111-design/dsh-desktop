import { readFile } from 'node:fs/promises'

import { afterEach, describe, expect, it, vi } from 'vitest'

import worker, { STABLE_DOWNLOAD_CACHE_CONTROL } from '../scripts/sherlock-stable-download-worker.mjs'

describe('Sherlock stable download Worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('preserves the origin response while forcing the mutable DMG alias to bypass browser caches', async () => {
    const originResponse = new Response('x', {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'accept-ranges': 'bytes',
        'cache-control': 'max-age=14400, must-revalidate',
        'content-range': 'bytes 0-0/326629177',
        etag: '"release-etag"'
      }
    })
    const fetchOrigin = vi.fn(async () => originResponse)
    vi.stubGlobal('fetch', fetchOrigin)
    const request = new Request(
      'https://updates.evanarts.com/download/sherlock-mac-arm64.dmg',
      { headers: { range: 'bytes=0-0' } }
    )

    const response = await worker.fetch(request)

    expect(fetchOrigin).toHaveBeenCalledWith(request)
    expect(response.status).toBe(206)
    expect(response.statusText).toBe('Partial Content')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('content-range')).toBe('bytes 0-0/326629177')
    expect(response.headers.get('etag')).toBe('"release-etag"')
    expect(response.headers.get('cache-control')).toBe(STABLE_DOWNLOAD_CACHE_CONTROL)
    await expect(response.text()).resolves.toBe('x')
  })

  it('deploys only on the exact stable macOS DMG path', async () => {
    const config = await readFile('config/sherlock-stable-download-worker.toml', 'utf8')

    expect(config).toContain('name = "sherlock-stable-download"')
    expect(config).toContain(
      'pattern = "updates.evanarts.com/download/sherlock-mac-arm64.dmg"'
    )
    expect(config).toContain('zone_id = "6f467b786713bdf33ed46e8a89d780d9"')
    expect(config).toContain('workers_dev = false')
  })
})
