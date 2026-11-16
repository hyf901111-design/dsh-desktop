export const ratios = {
  '1:1': { width: 1024, height: 1024, icon: 'square' },
  '4:5': { width: 1080, height: 1350, icon: 'vertical' },
  '16:9': { width: 1600, height: 900, icon: 'horizontal' },
} as const

export type Ratio = keyof typeof ratios
export type Size = { width: number; height: number }
export type Region = { x: number; y: number; width: number; height: number }
export type Point = { x: number; y: number }

export function validSize(width: number, height: number) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 &&
    width <= 4096 && height <= 4096 && width * height <= 8_000_000
}

export function providerSize({ width, height }: Size) {
  const ratio = width / height
  return ratio >= 1.12 ? '1536x1024' : ratio <= .9 ? '1024x1536' : '1024x1024'
}

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

export function cropRaster(doc: Document, image: Raster, area: Region) {
  const { canvas, context } = canvasFor(doc, area)
  context.drawImage(image.image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height)
  return canvas
}

/** Preserve the full generated composition when the provider returns a different ratio. */
export function drawFit(context: CanvasRenderingContext2D, source: Raster, target: Size) {
  const scale = Math.min(target.width / source.width, target.height / source.height)
  const width = Math.round(source.width * scale), height = Math.round(source.height * scale)
  context.drawImage(source.image, Math.floor((target.width - width) / 2), Math.floor((target.height - height) / 2), width, height)
}

/** Draw the edited patch inside the original integer pixel bounds, replacing transparent pixels as well. */
export function applyRegion(context: CanvasRenderingContext2D, original: Raster, result: Raster, area: Region) {
  context.drawImage(original.image, 0, 0)
  context.clearRect(area.x, area.y, area.width, area.height)
  context.drawImage(result.image, area.x, area.y, area.width, area.height)
}
