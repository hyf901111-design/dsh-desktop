import { resizeCanvas } from '../src/preload/image-factory/layer-groups'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { imageFactoryPrompt, readImageFactoryContext, stripImageFactoryContext } from '../packages/dsh-research-task-runtime/image-factory-context.js'
import { drawLayers, moveLayer, textTopInsideCanvas } from '../src/preload/image-factory/layers'
import { applyRegion, between, canvasPoint, drawFit, preservesRegionTransparency, providerSize, ratios, regionEditFrame, requestedImageSize, validSize } from '../src/preload/image-factory/raster'


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
    expect(requestedImageSize('画布比例为 7 比 5')).toEqual({ width: 1596, height: 1140 })
    expect(requestedImageSize('Create a 1080 × 1920 px cover')).toEqual({ width: 1080, height: 1920 })
    expect(requestedImageSize('活动上午 10:30 开始')).toBeUndefined()
    expect(requestedImageSize('Make it in landscape format')).toEqual({ width: 1600, height: 900 })
  })

  it('preserves the whole generated poster and fills the outside of an opaque image', () => {
    const image = { name: 'poster' }
    const calls = []
    const canvas = { name: 'composed poster' }
    const context = { canvas, getImageData: () => ({ data: Uint8Array.from([40, 50, 60, 255]) }),
      drawImage: (...args) => calls.push(args) }
    drawFit(context, { image, width: 1024, height: 1536 }, ratios['4:5'])
    expect(calls).toEqual([[image, 90, 0, 900, 1350],
      [canvas, 90, 0, 1, 1350, 0, 0, 90, 1350],
      [canvas, 989, 0, 1, 1350, 990, 0, 90, 1350]])
  })

  it('keeps the margins transparent when the fitted image has transparent edges', () => {
    const image = { name: 'transparent artwork' }
    const drawImage = vi.fn()
    drawFit({ drawImage, getImageData: () => ({ data: Uint8Array.from([0, 0, 0, 0]) }) },
      { image, width: 1536, height: 1024 }, ratios['16:9'])
    expect(drawImage.mock.calls).toEqual([[image, 125, 0, 1350, 900]])
  })

  it('keeps the selected pixels inside a proportional edit frame at the canvas edge', () => {
    const area = { x: 0, y: 294, width: 266, height: 6 }
    const frame = regionEditFrame(area, { width: 1536, height: 1024 }, { width: 400, height: 300 })
    expect(frame.x).toBe(0)
    expect(frame.y + frame.height).toBeCloseTo(300)
    expect(frame.width).toBeGreaterThan(area.width)
    expect(frame.width / frame.height).toBeCloseTo(1.5)
  })

  it('uses uniform scaling and replaces only the selected bounds with a differently shaped provider result', () => {
    const operations = []
    const scene = { image: { name: 'original' }, width: 300, height: 300 }
    const edit = { image: { name: 'replacement' }, width: 300, height: 300 }
    const target = {
      drawImage: (...args) => operations.push(args),
      clearRect: (...args) => operations.push(['clear', ...args]),
    }
    applyRegion(target, scene, edit, { x: 60, y: 90, width: 80, height: 12 },
      { x: 40, y: 60, width: 150, height: 100 })
    expect(operations).toEqual([[scene.image, 0, 0], ['clear', 60, 90, 80, 12],
      [edit.image, 40, 110, 160, 24, 60, 90, 80, 12]])
  })

  it('blends translucent result pixels only along the interior selection edges', () => {
    const area = { x: 0, y: 32, width: 64, height: 64 }
    const original = { image: { color: [255, 0, 0, 255] }, width: 128, height: 128 }
    const replacement = { image: { color: [0, 0, 255, 128] }, width: 128, height: 128 }
    const writes = []
    let color
    const target = {
      drawImage: image => { color = image.color },
      clearRect: vi.fn(),
      getImageData: (_x, _y, width, height) => {
        const data = new Uint8ClampedArray(width * height * 4)
        for (let offset = 0; offset < data.length; offset += 4) data.set(color, offset)
        return { data, width, height }
      },
      putImageData: (pixels, x, y) => writes.push({ ...pixels, x, y })
    }
    applyRegion(target, original, replacement, area, { x: 0, y: 20, width: 88, height: 88 })
    const pixel = (x, y) => {
      const band = writes.find(band => x >= band.x && x < band.x + band.width && y >= band.y && y < band.y + band.height)
      if (!band) return undefined
      const offset = ((y - band.y) * band.width + x - band.x) * 4
      return Array.from(band.data.slice(offset, offset + 4))
    }
    expect(pixel(12, 32)).toEqual([255, 0, 0, 255])
    expect(pixel(12, 34)).toEqual([170, 0, 85, 192])
    expect(pixel(63, 64)).toEqual([255, 0, 0, 255])
    expect(pixel(0, 64)).toBeUndefined()
    expect(pixel(12, 36)).toBeUndefined()
    expect(writes.every(band => band.x >= area.x && band.y >= area.y &&
      band.x + band.width <= area.x + area.width && band.y + band.height <= area.y + area.height)).toBe(true)
  })

  it('keeps the source alpha inside the selection when requested, even with an opaque replacement', () => {
    const area = { x: 16, y: 16, width: 48, height: 48 }
    const frame = { x: 0, y: 0, width: 80, height: 80 }
    const original = {
      ...frame, image: { pixel: x => x < 28 ? [0, 0, 0, 0] : [255, 0, 0, x < 44 ? 128 : 255] },
    }
    const replacement = {
      ...frame, image: { pixel: x => x === 48 ? [0, 0, 0, 0] : [0, 255, 0, 255] },
    }
    let changed = false
    const composited = new Map()
    const target = {
      drawImage: image => { changed = image === replacement.image },
      clearRect: vi.fn(),
      getImageData: (x, y, width, height) => {
        const data = new Uint8ClampedArray(width * height * 4)
        for (let index = 0; index < width * height; index++) {
          const column = x + index % width, row = y + Math.floor(index / width)
          const inside = changed && column >= 16 && column < 64 && row >= 16 && row < 64
          data.set(composited.get(row * frame.width + column) ??
            (inside ? replacement : original).image.pixel(column), index * 4)
        }
        return { data, width, height }
      },
      putImageData: ({ data, width, height }, x, y) => {
        for (let index = 0; index < width * height; index++) {
          const column = x + index % width, row = y + Math.floor(index / width)
          composited.set(row * frame.width + column, data.slice(index * 4, (index + 1) * 4))
        }
      },
    }
    applyRegion(target, original, replacement, area, frame, true)
    const edited = (column, row) => Array.from(target.getImageData(area.x + column, area.y + row, 1, 1).data)
    expect(edited(5, 10)).toEqual([0, 0, 0, 0])
    expect(edited(14, 10)).toEqual([0, 255, 0, 128])
    expect(edited(28, 10)).toEqual([0, 255, 0, 255])
    expect(edited(32, 10)).toEqual([255, 0, 0, 255])
    expect(edited(14, 0)).toEqual([255, 0, 0, 128])
  })

  it.each([
    ['请将选区里的红色色块改为纯青绿色，保留现有形状和透明区域。', true],
    ['透明背景保持不变。', true],
    ['不要改变原有的透明度。', true],
    ['Preserve the original shape and alpha channel.', true],
    ['Keep the background transparent.', true],
    ['Don’t change the alpha channel.', true],
    ['请在透明区域加一个红色圆点。', false],
    ['将背景改成透明。', false],
    ['不保留原有透明背景。', false],
    ['Do not preserve the transparent background.', false],
  ])('uses the source alpha only for a request to preserve it (%s)', (prompt, preserve) => {
    expect(preservesRegionTransparency(prompt)).toBe(preserve)
  })

  it('preserves the exact user comment while passing a bounded canvas context to the native tool', () => {
    const context = { id: '11898f5e-5fab-4913-b241-267ac863be0c', size: '1024x1536',
      operation: 'region', title: '活动海报', width: 43, height: 88, internalReference: true,
      editBounds: { left: .2, top: .1, right: .9, bottom: .8 } }
    const text = '把标题旁的物件换成红色。\\n 保持原布局。'.replaceAll('\\n', '\n')
    const prompt = imageFactoryPrompt(text, context)
    expect(readImageFactoryContext(prompt)).toEqual({ ...context, text })
    expect(stripImageFactoryContext(prompt)).toBe(text)
    expect(readImageFactoryContext(imageFactoryPrompt(text, { ...context, width: 8000 }))).toBeUndefined()
    expect(readImageFactoryContext(imageFactoryPrompt(text, { ...context, editBounds: { ...context.editBounds, right: .1 } }))).toBeUndefined()
  })

  it('fits the full rendered text box at the bottom of the image', () => {
    const height = 1350
    expect(textTopInsideCanvas(.94, 252, height)).toBeCloseTo((height - 252) / height)
    expect(textTopInsideCanvas(.94, 336, height)).toBeCloseTo((height - 336) / height)
    expect(textTopInsideCanvas(.2, 336, height)).toBe(.2)
    expect(textTopInsideCanvas(.94, 1450, height)).toBe(0)
  })

  it('changes canvas ratio without resampling the image or drifting off-frame layers', () => {
    const image = { id: 'image', kind: 'image', raster: { width: 900, height: 1600 } }
    const overlay = { id: 'logo', kind: 'brand', asset: 'logo-blue', x: -.1, y: .16, width: .23, height: .12 }
    const original = { id: 'canvas', title: 'Poster', width: 900, height: 1600, layers: [image, overlay] }
    const landscape = resizeCanvas(original, ratios['16:9'])
    expect(landscape).toMatchObject(ratios['16:9'])
    expect(landscape.layers[0]).toBe(image)
    const logo = landscape.layers[1]
    expect(logo.width * landscape.width / (logo.height * landscape.height)).toBeCloseTo(.23 * 900 / (.12 * 1600))
    const restored = resizeCanvas(landscape, { width: original.width, height: original.height })
    for (const key of ['x', 'y', 'width', 'height']) expect(restored.layers[1][key]).toBeCloseTo(overlay[key])
    expect(restored.layers[0]).toBe(image)
  })

  it('composites browser-laid text in the same order as the layer list', async () => {
    const text = { id: 'heading', kind: 'text', text: '海报（限定）\n栏目\t内容 👩‍🎨 <&', x: .1, y: .2, width: .5,
      fontSize: 30, family: 'Songti SC', weight: 700, align: 'right', color: '#ff0000' }
    const image = { id: 'photo', kind: 'image', raster: { image: 'base', width: 400, height: 300 } }
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
