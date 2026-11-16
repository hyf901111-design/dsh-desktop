export const ratios = {
  '1:1': { width: 1024, height: 1024 },
  '4:5': { width: 1080, height: 1350 },
  '16:9': { width: 1600, height: 900 },
} as const

export type Ratio = keyof typeof ratios
export type Size = { width: number; height: number }
export type Region = { x: number; y: number; width: number; height: number }
export type Point = { x: number; y: number }

export function validSize(width: number, height: number) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 &&
    width <= 4096 && height <= 4096 && width * height <= 8_000_000
}

const commonRatios = new Set(['1:1', '4:5', '5:4', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', '21:9', '9:21'])

/** Read canvas dimensions from the user's description before choosing a provider size. */
export function requestedImageSize(prompt: string): Size | undefined {
  const dimensions = [...prompt.matchAll(/(?<![\d.])(\d{2,4})\s*(?:px|像素)?\s*[×xX*]\s*(\d{2,4})(?![\d.])/g)]
    .reverse().find(match => validSize(Number(match[1]), Number(match[2])))
  if (dimensions) return { width: Number(dimensions[1]), height: Number(dimensions[2]) }

  const ratio = [...prompt.matchAll(/(?<![\d.])([1-9]\d?)\s*([:：∶比])\s*([1-9]\d?)(?![\d.])/g)]
    .reverse().find(match => {
      const from = match.index ?? 0
      const before = prompt.slice(Math.max(0, from - 25), from)
      const after = prompt.slice(from + match[0].length, from + match[0].length + 16)
      if (/(?:比例|宽高比|长宽比|aspect\s+ratio|ratio|宽[:：]?高)\s*(?:为|是|设为|用|of|is|[:：=])?\s*$/i.test(before) ||
          /^\s*(?:的?(?:比例|横版|竖版|横屏|竖屏)|aspect|ratio)/i.test(after)) return true
      if (/(?:[上下]午|早上|晚上|at)\s*$/i.test(before) || /^\s*(?:开场|开始|结束|点|[ap]\.?m\.?\b)/i.test(after)) return false
      if (/^\s*的?(?:海报|图片|封面|画布|壁纸|canvas|image|poster|cover)/i.test(after) || prompt.trim() === match[0]) return true
      return match[2] === '比' || commonRatios.has(match[1] + ':' + match[3])
    })
  if (ratio) {
    const width = Number(ratio[1]), height = Number(ratio[3])
    const shape = width / height
    const preset = Object.values(ratios).find(size => size.width / size.height === shape)
    const scale = 1600 / Math.max(width, height)
    return preset ?? { width: Math.round(width * scale), height: Math.round(height * scale) }
  }

  if (/横[版屏向]|\b(?:in landscape|landscape (?:format|orientation))\b/i.test(prompt)) return ratios['16:9']
  if (/竖[版屏向]|\b(?:in portrait|portrait (?:format|orientation))\b/i.test(prompt)) return ratios['4:5']
  if (/正方形|\bsquare (?:format|canvas|image|poster)\b/i.test(prompt)) return ratios['1:1']
  return undefined
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
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  context.drawImage(source.image, Math.floor((target.width - width) / 2), Math.floor((target.height - height) / 2), width, height)
}

/** Draw the edited patch inside the original integer pixel bounds, replacing transparent pixels as well. */
export function applyRegion(context: CanvasRenderingContext2D, original: Raster, result: Raster, area: Region) {
  context.drawImage(original.image, 0, 0)
  context.clearRect(area.x, area.y, area.width, area.height)
  context.drawImage(result.image, area.x, area.y, area.width, area.height)
}
