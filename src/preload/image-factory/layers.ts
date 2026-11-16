import type { Raster, Size } from './raster'
import { imageFactoryExportFonts } from './fonts'

import { canvasFonts as imageFonts, type CanvasImageType, type TextLayer } from '../../shared/image-factory-canvas'

export { imageFonts, type TextLayer }

export type ImageLayer = { id: string; kind: 'image'; assetId: string; mediaType: CanvasImageType; data: Uint8Array; raster: Raster }
export type CanvasLayer = ImageLayer | TextLayer
export type ImageScene = Size & { id: string; title: string; layers: CanvasLayer[] }
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
  const left = Math.min(layer.x * canvas.width, canvas.width - 1), top = layer.y * canvas.height
  const right = Math.min(canvas.width, left + width)
  const west = handle.endsWith('w'), north = handle.startsWith('n')
  const widthLimit = west ? right : canvas.width - left
  const horizontalDelta = west ? -dx : dx
  if (handle.length === 1) {
    const minimumWidth = Math.min(widthLimit, Math.max(1, Math.min(width, 24)))
    const nextWidth = Math.min(widthLimit, Math.max(minimumWidth, width + horizontalDelta))
    return { x: (west ? right - nextWidth : left) / canvas.width, width: nextWidth / canvas.width }
  }

  const verticalDelta = north ? -dy : dy
  const heightLimit = north ? top + height : canvas.height - top
  const requested = 1 + (width * horizontalDelta + height * verticalDelta) / (width ** 2 + height ** 2)
  const maximumScale = Math.min(600 / layer.fontSize, widthLimit / width, heightLimit / height)
  const scale = Math.max(8 / layer.fontSize, Math.min(maximumScale, requested))
  const nextWidth = Math.min(widthLimit, width * scale)
  return {
    x: (west ? right - nextWidth : left) / canvas.width,
    y: north ? Math.max(0, top + height - height * scale) / canvas.height : layer.y,
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
      context.drawImage(layer.raster.image, 0, 0, scene.width, scene.height)
    }
  }
  if (text.length) await drawTextLayers(context, scene, text)
}
