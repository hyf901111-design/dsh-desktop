import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { imageFactoryPrompt, readImageFactoryContext, stripImageFactoryContext } from '../packages/dsh-research-task-runtime/image-factory-context.js'
import { drawLayers, moveLayer } from '../src/preload/image-factory/layers'
import { applyRegion, between, canvasPoint, drawFit, providerSize, ratios, requestedImageSize, validSize } from '../src/preload/image-factory/raster'


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

  it('uses dimensions or common and custom ratios described in chat without reading a time as a ratio', () => {
    expect(requestedImageSize('请做一张海报，画面比例为 9：16。')).toEqual({ width: 900, height: 1600 })
    expect(requestedImageSize('生成 16:9 的封面')).toEqual({ width: 1600, height: 900 })
    expect(requestedImageSize('画布比例为 7 比 5')).toEqual({ width: 1600, height: 1143 })
    expect(requestedImageSize('Create a 1080 × 1920 px cover')).toEqual({ width: 1080, height: 1920 })
    expect(requestedImageSize('活动上午 10:30 开始')).toBeUndefined()
    expect(requestedImageSize('Make it in landscape format')).toEqual({ width: 1600, height: 900 })
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

  it('preserves the exact user comment while passing a bounded canvas context to the native tool', () => {
    const context = { id: '11898f5e-5fab-4913-b241-267ac863be0c', size: '1024x1536',
      operation: 'region', title: '活动海报', width: 43, height: 88, internalReference: true }
    const text = '把标题旁的物件换成红色。\\n 保持原布局。'.replaceAll('\\n', '\n')
    const prompt = imageFactoryPrompt(text, context)
    expect(readImageFactoryContext(prompt)).toEqual({ ...context, text })
    expect(stripImageFactoryContext(prompt)).toBe(text)
    expect(readImageFactoryContext(imageFactoryPrompt(text, { ...context, width: 8000 }))).toBeUndefined()
  })

  it('composites browser-laid text in the same order as the layer list', async () => {
    const text = { id: 'heading', kind: 'text', text: '海报（限定）\n栏目\t内容 👩‍🎨 <&', x: .1, y: .2, width: .5,
      fontSize: 30, family: 'Songti SC', weight: 700, align: 'right', color: '#ff0000' }
    const image = { id: 'photo', kind: 'image', raster: { image: 'base' } }
    const original = [image, text]
    const layers = moveLayer(original, 'heading', 'photo', false)
    expect(original.map(layer => layer.id)).toEqual(['photo', 'heading'])
    expect(layers.map(layer => layer.id)).toEqual(['heading', 'photo'])
    const win = new Window()
    const decode = vi.spyOn(win.HTMLImageElement.prototype, 'decode').mockResolvedValue()
    const drawImage = vi.fn()
    try {
      await drawLayers({ canvas: win.document.createElement('canvas'), drawImage }, { width: 400, height: 300, layers })
      expect(decode).toHaveBeenCalledOnce()
      const [[raster, x, y], base] = drawImage.mock.calls
      const serialized = decodeURIComponent(raster.src.split(',')[1])
      expect(serialized).toContain('海报（限定）\n栏目\t内容 👩‍🎨 &lt;&amp;')
      expect(serialized).toContain('text-align: right')
      expect(serialized).toContain('width: 200px')
      expect([x, y]).toEqual([0, 0])
      expect(base).toEqual(['base', 0, 0, 400, 300])
    } finally {
      decode.mockRestore()
      await win.happyDOM.abort()
    }
  })
})
