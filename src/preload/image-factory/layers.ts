import type { Raster, Size } from './raster'
import { imageFactoryExportFonts } from './fonts'
import { brandArtwork } from './brand-artwork'

import { canvasFonts as imageFonts, type BrandOverlay, type CanvasImageType, type TextLayer } from '../../shared/image-factory-canvas'

export { imageFonts, type TextLayer }

export type ImageLayer = { id: string; kind: 'image'; assetId: string; mediaType: CanvasImageType; data: Uint8Array; raster: Raster }
export type CanvasLayer = ImageLayer | TextLayer | BrandOverlay
export type ImageScene = Size & { id: string; title: string; layers: CanvasLayer[]; aiWatermark?: true }
export const textResizeHandles = ['nw', 'ne', 'w', 'e', 'sw', 'se'] as const
export type TextResizeHandle = typeof textResizeHandles[number]

export function textLayerStyle(layer: TextLayer, size: Size) {
  const family = layer.family === 'system-ui' ? layer.family : '"' + layer.family + '"'
  return {
    position: 'absolute', left: layer.x * 100 + '%', top: layer.y * 100 + '%', width: layer.width * size.width + 'px',
    font: layer.weight + ' ' + layer.fontSize + 'px ' + family + ', "PingFang SC", sans-serif',
    lineHeight: '1.2', minHeight: '1.2em', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', tabSize: '8',
    textAlign: layer.align, color: layer.color, boxSizing: 'border-box', letterSpacing: 'normal', wordSpacing: 'normal',
  } as const
}

export function textTopInsideCanvas(y: number, textHeight: number, canvasHeight: number) {
  return Math.min(Math.max(0, y), Math.max(0, 1 - textHeight / canvasHeight))
}

export function resizeTextLayer(layer: TextLayer, canvas: Size, height: number, handle: TextResizeHandle, dx: number, dy: number) {
  const width = layer.width * canvas.width
  const west = handle.endsWith('w'), north = handle.startsWith('n')
  const horizontalDelta = west ? -dx : dx
  const xForWidth = (nextWidth: number) => west ? layer.x + (width - nextWidth) / canvas.width : layer.x
  if (handle.length === 1) {
    const minimumWidth = Math.max(1, Math.min(width, 24))
    const nextWidth = Math.min(canvas.width, Math.max(minimumWidth, width + horizontalDelta))
    return { x: xForWidth(nextWidth), width: nextWidth / canvas.width }
  }

  const verticalDelta = north ? -dy : dy
  const requested = 1 + (width * horizontalDelta + height * verticalDelta) / (width ** 2 + height ** 2)
  const maximumScale = Math.min(600 / layer.fontSize, canvas.width / width)
  const scale = Math.min(maximumScale, Math.max(8 / layer.fontSize, requested))
  const nextWidth = Math.min(canvas.width, width * scale)
  return {
    x: xForWidth(nextWidth),
    y: north ? layer.y + height * (1 - scale) / canvas.height : layer.y,
    width: nextWidth / canvas.width,
    fontSize: Math.min(600, Math.max(8, Math.round(layer.fontSize * scale * 10) / 10)),
  }
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

async function drawTextLayers(context: CanvasRenderingContext2D, size: Size, layers: TextLayer[]) {
  const doc = context.canvas.ownerDocument
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', String(size.width))
  svg.setAttribute('height', String(size.height))
  const content = doc.createElementNS(svg.namespaceURI, 'foreignObject')
  content.setAttribute('width', '100%')
  content.setAttribute('height', '100%')
  const art = doc.createElement('div')
  Object.assign(art.style, { position: 'relative', width: '100%', height: '100%', overflow: 'hidden' })
  const faces = await imageFactoryExportFonts(doc, layers)
  if (faces) {
    const style = doc.createElement('style')
    style.textContent = faces
    art.append(style)
  }
  for (const layer of layers) {
    const text = doc.createElement('div')
    Object.assign(text.style, textLayerStyle(layer, size))
    text.textContent = layer.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu, '')
    art.append(text)
  }
  content.append(art)
  svg.append(content)
  // Chromium lays out the same HTML as the canvas preview, including Unicode
  // wrapping, tabs and fonts. A self-contained data URL keeps the canvas readable.
  const markup = new doc.defaultView!.XMLSerializer().serializeToString(svg)
  const validUnicode = new TextDecoder().decode(new TextEncoder().encode(markup))
  const raster = doc.createElement('img')
  raster.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(validUnicode)
  await raster.decode()
  context.drawImage(raster, 0, 0)
}

export async function drawLayers(context: CanvasRenderingContext2D, scene: ImageScene) {
  const text: TextLayer[] = []
  for (const layer of scene.layers) {
    if (layer.kind === 'text') {
      if (layer.text.trim()) text.push(layer)
    } else {
      if (text.length) await drawTextLayers(context, scene, text)
      text.length = 0
      if (layer.kind === 'image') context.drawImage(layer.raster.image, 0, 0, scene.width, scene.height)
      else {
        const x = layer.x * scene.width, y = layer.y * scene.height
        const width = layer.width * scene.width, height = layer.height * scene.height
        if (layer.kind === 'shape') {
          context.save()
          context.fillStyle = layer.color
          context.fillRect(x, y, width, height)
          context.restore()
        } else {
          const art = brandArtwork[layer.asset]
          const image = context.canvas.ownerDocument.createElement('img')
          image.src = art.src
          await image.decode()
          const scale = Math.min(width / art.size.width, height / art.size.height)
          const w = art.size.width * scale, h = art.size.height * scale
          context.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h)
        }
      }
    }
  }
  if (text.length) await drawTextLayers(context, scene, text)
}
