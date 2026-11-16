import type { Raster, Size } from './raster'

import { canvasFonts as imageFonts, type CanvasImageType, type TextLayer } from '../../shared/image-factory-canvas'

export { imageFonts, type TextLayer }

export type ImageLayer = { id: string; kind: 'image'; assetId: string; mediaType: CanvasImageType; data: Uint8Array; raster: Raster }
export type CanvasLayer = ImageLayer | TextLayer
export type ImageScene = Size & { id: string; title: string; layers: CanvasLayer[] }

export function textFont(layer: TextLayer, size = layer.fontSize) {
  const family = layer.family === 'system-ui' ? layer.family : '"' + layer.family + '"'
  return layer.weight + ' ' + size + 'px ' + family + ', "PingFang SC", sans-serif'
}

export function moveLayer(layers: CanvasLayer[], id: string, targetId: string, above: boolean) {
  const layer = layers.find(item => item.id === id)
  if (!layer || id === targetId) return layers
  const result = layers.filter(item => item.id !== id)
  const index = result.findIndex(item => item.id === targetId)
  if (index < 0) return layers
  result.splice(index + Number(above), 0, layer)
  return result
}

export function drawLayers(context: CanvasRenderingContext2D, scene: ImageScene) {
  for (const layer of scene.layers) {
    if (layer.kind === 'image') {
      context.drawImage(layer.raster.image, 0, 0, scene.width, scene.height)
      continue
    }
    const maxWidth = layer.width * scene.width
    const x = layer.x * scene.width + maxWidth * (layer.align === 'center' ? .5 : layer.align === 'right' ? 1 : 0)
    const step = layer.fontSize * 1.2
    let y = layer.y * scene.height + step / 2
    context.fillStyle = layer.color
    context.font = textFont(layer)
    context.textAlign = layer.align
    context.textBaseline = 'middle'
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
    for (const paragraph of layer.text.split('\n')) {
      let row = ''
      const write = () => { context.fillText(row, x, y); y += step; row = '' }
      for (const { segment } of segmenter.segment(paragraph)) {
        if (row && context.measureText(row + segment).width > maxWidth) write()
        if (context.measureText(segment).width <= maxWidth) { row += segment; continue }
        for (const glyph of segment) {
          if (row && context.measureText(row + glyph).width > maxWidth) write()
          row += glyph
        }
      }
      write()
    }
  }
}
