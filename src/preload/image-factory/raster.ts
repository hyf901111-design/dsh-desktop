import { validCanvasSize as validSize } from '../../shared/image-factory-canvas'

import {ratios} from '../../../packages/dsh-research-task-runtime/image-output-size.js'
export {ratios, requestedImageSize, providerSize} from '../../../packages/dsh-research-task-runtime/image-output-size.js'

export const canvasRatioPresets = {
  '1:1': ratios['1:1'],
  '4:5': ratios['4:5'],
  '5:4': { width: 1350, height: 1080 },
  '3:4': { width: 1200, height: 1600 },
  '4:3': { width: 1600, height: 1200 },
  '2:3': { width: 1000, height: 1500 },
  '3:2': { width: 1500, height: 1000 },
  '9:16': { width: 900, height: 1600 },
  '16:9': ratios['16:9'],
} as const

export const providerDimensions = {
  '1024x1024': { width: 1024, height: 1024 },
  '1024x1536': { width: 1024, height: 1536 },
  '1536x1024': { width: 1536, height: 1024 },
} as const

export type Ratio = keyof typeof ratios
export type Size = { width: number; height: number }
export type Region = { x: number; y: number; width: number; height: number }
export type Point = { x: number; y: number }

export { validSize }

export function canvasPoint(clientX: number, clientY: number, bounds: Region, size: Size): Point {
  const axis = (value: number, start: number, extent: number, pixels: number) =>
    Math.round(Math.min(pixels, Math.max(0, (value - start) / Math.max(1, extent) * pixels)))
  return { x: axis(clientX, bounds.x, bounds.width, size.width), y: axis(clientY, bounds.y, bounds.height, size.height) }
}

export function between(a: Point, b: Point): Region {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

export function canvasFor(doc: Document, { width, height }: Size) {
  if (!validSize(width, height)) throw Error('画布尺寸超出限制（最长边 4096 px，最多 800 万像素）。')
  const canvas = doc.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw Error('图片画布暂不可用。')
  return { canvas, context }
}

export async function loadRaster(doc: Document, blob: Blob) {
  const url = URL.createObjectURL(blob)
  try {
    const image = doc.createElement('img')
    image.src = url
    await image.decode().catch(() => { throw Error('图片无法读取，请使用有效的 PNG、JPG 或 WebP。') })
    const { naturalWidth: width, naturalHeight: height } = image
    if (!validSize(width, height)) throw Error('图片尺寸超出限制（最长边 4096 px，最多 800 万像素）。')
    return { url, image, width, height }
  } catch (error) { URL.revokeObjectURL(url); throw error }
}

export type Raster = Awaited<ReturnType<typeof loadRaster>>

export function encode(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('未能编码图片。')), type, quality))
}

export function regionEditFrame(area: Region, output: Size, image: Size): Region {
  const scale = Math.max(area.width / output.width, area.height / output.height) * 1.2
  const width = output.width * scale, height = output.height * scale
  const origin = (start: number, length: number, extent: number, imageExtent: number) => {
    const edge = imageExtent - extent
    return Math.max(Math.min(0, edge), Math.min(Math.max(0, edge), start + (length - extent) / 2))
  }
  return { x: origin(area.x, area.width, width, image.width), y: origin(area.y, area.height, height, image.height), width, height }
}

export function regionEditBounds(area: Region, frame: Region) {
  const unit = (offset: number, extent: number) => Math.round(Math.max(0, Math.min(1, offset / extent)) * 10_000) / 10_000
  return {
    left: unit(area.x - frame.x, frame.width), top: unit(area.y - frame.y, frame.height),
    right: unit(area.x + area.width - frame.x, frame.width), bottom: unit(area.y + area.height - frame.y, frame.height),
  }
}

export function preservesRegionTransparency(prompt: string) {
  const transparency = /透明(?:度|背景|区域|部分|像素)|\b(?:transparency|transparent|alpha)\b/iu
  return prompt.split(/[\n，,。.!?！？；;]/u).some(clause => {
    const subject = transparency.exec(clause)
    if (!subject) return false
    const before = clause.slice(0, subject.index)
    const after = clause.slice(subject.index + subject[0].length)
    if (/(?:不要|无需|不用|不必|别|不)\s*(?:保留|保持|维持)|\b(?:do not|don['’]t|never)\s+(?:preserve|keep|retain|maintain)\b/iu.test(before))
      return false
    return /保留|保持|维持|不(?:要|得)?\s*(?:修改|改变|更改|改动|破坏)|\b(?:preserve|keep|retain|maintain|(?:do not|don['’]t)\s+(?:change|alter|modify))\b/iu.test(before) ||
      /^\s*(?:保持不变|维持原样|保持原样|不变|(?:should\s+)?(?:stay|remain)\s+unchanged\b)/iu.test(after)
  })
}

export function containedRasterBounds(source: Size, target: Size): Region {
  const scale = Math.min(target.width / source.width, target.height / source.height)
  const width = source.width * scale, height = source.height * scale
  return { x: (target.width - width) / 2, y: (target.height - height) / 2, width, height }
}

export function drawContainedRaster(context: CanvasRenderingContext2D, source: Raster, target: Size) {
  const { x, y, width, height } = containedRasterBounds(source, target)
  context.drawImage(source.image, x, y, width, height)
}

/** Preserve the full generated composition when the provider returns a different ratio. */
export function drawFit(context: CanvasRenderingContext2D, source: Raster, target: Size) {
  const scale = Math.min(target.width / source.width, target.height / source.height)
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  const left = Math.floor((target.width - width) / 2), top = Math.floor((target.height - height) / 2)
  context.drawImage(source.image, left, top, width, height)
  if (width === target.width && height === target.height) return

  const edges = width < target.width ? [
    { x: left, y: top, width: 1, height, margin: { x: 0, y: top, width: left, height } },
    { x: left + width - 1, y: top, width: 1, height, margin: { x: left + width, y: top, width: target.width - left - width, height } },
  ] : [
    { x: left, y: top, width, height: 1, margin: { x: left, y: 0, width, height: top } },
    { x: left, y: top + height - 1, width, height: 1, margin: { x: left, y: top + height, width, height: target.height - top - height } },
  ]
  // Keep intentional transparency at the boundary. An opaque image can extend
  // its outer pixels into the extra space without resizing the composition.
  for (const edge of edges) {
    const { data } = context.getImageData(edge.x, edge.y, edge.width, edge.height)
    for (let alpha = 3; alpha < data.length; alpha += 4) if (data[alpha] !== 255) return
  }
  const smoothing = context.imageSmoothingEnabled
  context.imageSmoothingEnabled = false
  for (const { x, y, width, height, margin } of edges) {
    if (margin.width && margin.height) {
      context.drawImage(context.canvas, x, y, width, height, margin.x, margin.y, margin.width, margin.height)
    }
  }
  context.imageSmoothingEnabled = smoothing
}

/** Sample the provider frame at uniform scale and blend inside the selection. */
export function applyRegion(context: CanvasRenderingContext2D, original: Raster, result: Raster, area: Region, frame: Region,
  preserveTransparency = false) {
  const scale = Math.min(result.width / frame.width, result.height / frame.height)
  const x = (result.width - frame.width * scale) / 2 + (area.x - frame.x) * scale
  const y = (result.height - frame.height * scale) / 2 + (area.y - frame.y) * scale
  const feather = Math.min(12, Math.floor(Math.min(area.width, area.height) / 16))
  const left = area.x > 0 ? feather : 0
  const top = area.y > 0 ? feather : 0
  const right = area.x + area.width < original.width ? feather : 0
  const bottom = area.y + area.height < original.height ? feather : 0
  // The usual edit can keep the exact provider pixels in the center. When
  // preserving transparency, read the whole selection to retain its alpha mask.
  const middle = area.height - top - bottom
  const bands = preserveTransparency ? [{ x: 0, y: 0, width: area.width, height: area.height }] : [
    { x: 0, y: 0, width: area.width, height: top },
    { x: 0, y: area.height - bottom, width: area.width, height: bottom },
    { x: 0, y: top, width: left, height: middle },
    { x: area.width - right, y: top, width: right, height: middle },
  ].filter(band => band.width && band.height)
  context.drawImage(original.image, 0, 0)
  const previous = bands.map(band => context.getImageData(area.x + band.x, area.y + band.y, band.width, band.height).data)
  context.clearRect(area.x, area.y, area.width, area.height)
  context.drawImage(result.image, x, y, area.width * scale, area.height * scale, area.x, area.y, area.width, area.height)
  for (const [index, band] of bands.entries()) {
    const bandX = area.x + band.x, bandY = area.y + band.y
    const image = context.getImageData(bandX, bandY, band.width, band.height)
    const originalData = previous[index]!, editedData = image.data
    for (let row = 0; row < band.height; row++) {
      const localY = band.y + row
      const vertical = Math.min(top ? localY : feather, bottom ? area.height - 1 - localY : feather)
      for (let column = 0; column < band.width; column++) {
        const localX = band.x + column
        const distance = Math.min(vertical, left ? localX : feather, right ? area.width - 1 - localX : feather)
        const t = feather ? Math.min(1, distance / feather) : 1
        const mix = t * t * (3 - 2 * t)
        const offset = (row * band.width + column) * 4
        const sourceAlpha = originalData[offset + 3]!
        const editedAlpha = editedData[offset + 3]! * mix
        const originalAlpha = preserveTransparency ? 255 - editedAlpha : sourceAlpha * (1 - mix)
        const weight = originalAlpha + editedAlpha
        const alpha = preserveTransparency ? sourceAlpha : weight
        // Blend premultiplied colors so transparent pixels do not create halos.
        for (let channel = offset; channel < offset + 3; channel++) {
          editedData[channel] = alpha ? (originalData[channel]! * originalAlpha + editedData[channel]! * editedAlpha) / weight : 0
        }
        editedData[offset + 3] = alpha
      }
    }
    context.putImageData(image, bandX, bandY)
  }
}
