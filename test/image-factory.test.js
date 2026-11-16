import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { imageFactoryInput, registerImageFactory } from '../packages/dsh-research-task-runtime/image-factory.js'
import { applyRegion, between, canvasPoint, drawFit, providerSize, ratios, validSize } from '../src/preload/image-factory/raster'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
const request = { requestId: '11898f5e-5fab-4913-b241-267ac863be0c', size: '1024x1536', prompt: 'Make a poster' }

describe('image factory', () => {
  it('maps a reverse drag on a zoomed canvas to clipped original pixels', () => {
    const box = { x: 100, y: 60, width: 540, height: 675 }
    const size = ratios['4:5']
    const from = canvasPoint(620, 550, box, size)
    const to = canvasPoint(320, 750, box, size)
    expect(between(from, to)).toEqual({ x: 440, y: 980, width: 600, height: 370 })
    expect(validSize(4096, 4096)).toBe(false)
    expect(providerSize(size)).toBe('1024x1536')
    expect(providerSize(ratios['16:9'])).toBe('1536x1024')
  })

  it('preserves the whole generated poster at a different canvas ratio', () => {
    const image = { name: 'poster' }
    const calls = []
    const context = { drawImage: (...args) => calls.push(args) }
    drawFit(context, { image, width: 1024, height: 1536 }, ratios['4:5'])
    expect(calls).toEqual([[image, 90, 0, 900, 1350]])
  })

  it('clears and composites only the selected pixel bounds', () => {
    const operations = []
    const scene = { image: { name: 'original' } }
    const edit = { image: { name: 'replacement' } }
    const target = {
      drawImage: (...args) => operations.push(args),
      clearRect: (...args) => operations.push(['clear', ...args]),
    }
    applyRegion(target, scene, edit, { x: 51, y: 98, width: 20, height: 17 })
    expect(operations).toEqual([[scene.image, 0, 0], ['clear', 51, 98, 20, 17], [edit.image, 51, 98, 20, 17]])
  })

  it('requires a supported ratio and a reference matching its declared format', () => {
    expect(imageFactoryInput({ ...request, reference: { mediaType: 'image/png', data: png.toString('base64') } }).references[0]?.data).toEqual(png)
    expect(() => imageFactoryInput({ ...request, size: 'arbitrary' })).toThrow()
    expect(() => imageFactoryInput({ ...request, reference: { mediaType: 'image/jpeg', data: png.toString('base64') } })).toThrow()
  })

  it('routes an authenticated workspace request through the active account provider, without retrying', async () => {
    let handle
    const calls = []
    const server = createServer((req, res) => void handle(req, res))
    const dispose = registerImageFactory({ webServer: { register: ({ handler }) => {
      handle = handler
      return () => {}
    } } }, {
      token: 'unit-test-secret', isTrustedRequest: () => true,
      hosted: { ready: async () => {}, available: () => true, models: [{ id: 'hosted-image' }],
        capture: () => async (input) => { calls.push(input); return { data: png } } },
      local: { models: [], generate: async () => { throw Error('wrong provider') } },
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const addr = server.address()
    const post = (authorization, body) => fetch('http://127.0.0.1:' + addr.port, {
      method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    try {
      expect((await post('incorrect', request)).status).toBe(403)
      const generated = await post('Bearer unit-test-secret', request)
      expect(generated.status).toBe(200)
      expect(await generated.json()).toEqual({ data: png.toString('base64') })
      const reference = { mediaType: 'image/png', data: png.toString('base64') }
      expect((await post('Bearer unit-test-secret', { ...request, reference })).status).toBe(200)
      expect(calls).toHaveLength(2)
      expect(calls[0]).toMatchObject({ model: 'hosted-image', references: [] })
      expect(calls[1]).toMatchObject({ model: 'hosted-image', references: [{ mediaType: 'image/png', data: png }] })
    } finally { dispose(); server.close(); server.closeAllConnections() }
  })
})
