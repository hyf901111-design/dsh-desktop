import { brandArtworkIds, type BrandArtworkId, type BrandOverlay, type TextLayer } from '../../shared/image-factory-canvas'
import { brandArtwork, brandColors as palette, type BrandLabel } from './brand-artwork'
import type { Point, Size } from './raster'

export const brandDragType = 'application/x-odyssey-brand-asset'

type ArtworkPart = Point & { kind: 'brand'; asset: BrandArtworkId; width: number }
type ShapePart = Point & Size & { kind: 'shape'; color: string }
type TextPart = Point & { kind: 'text'; label: BrandLabel; width: number; fontSize: number; color: string; weight: number }
type Part = ArtworkPart | ShapePart | TextPart
export type BrandAsset = Size & { id: string; label: BrandLabel; parts: Part[]; coverage: number; darkPreview?: true }

const brand = (asset: BrandArtworkId, x: number, y: number, width: number): ArtworkPart => ({ kind: 'brand', asset, x, y, width })
const block = (color: string, x: number, y: number, width: number, height: number): ShapePart => ({ kind: 'shape', color, x, y, width, height })
const text = (label: BrandLabel, x: number, y: number, width: number, fontSize: number, color: string, weight = 400): TextPart =>
  ({ kind: 'text', label, x, y, width, fontSize, color, weight })

const markAssets = brandArtworkIds.map((id): BrandAsset => {
  const { size, label, darkPreview } = brandArtwork[id]
  return { ...size, id, label, coverage: .34, parts: [brand(id, 0, 0, size.width)], darkPreview }
})

// Extension manual §5.1: a flexible title area, a separate information band,
// and a product layout with distinct title, product code and information blocks.
const header = [brand('container-left', 0, 45, 154), brand('graphic-top', 300, 0, 300)]
const info = block(palette.blue, 0, 595, 600, 253)
const product = [
  block(palette.gray, 0, 595, 600, 253),
  block(palette.blue, 0, 440, 248, 79),
  block(palette.bright, 45, 519, 254, 99),
  block(palette.gold, 371, 580, 184, 38),
]
const bandCopy = [
  text(['活动主标题', 'Event title'], 42, 630, 516, 42, palette.white, 700),
  text(['在这里补充活动信息与说明', 'Add event details here'], 42, 700, 516, 26, palette.white),
]
const productCopy = [
  text(['产品主标题', 'Product title'], 17, 460, 219, 32, palette.white, 700),
  text(['补充副标题', 'Product subtitle'], 64, 548, 218, 27, palette.blue, 700),
  text(['产品代码  000000', 'Code  000000'], 380, 587, 170, 19, '#202f3a', 700),
  text(['在这里填写产品信息\n可补充材料所需的说明文字', 'Add product information\nand supporting copy here'], 42, 659, 516, 27, '#202f3a'),
]

export const brandAssetSections: { label: BrandLabel; assets: BrandAsset[] }[] = [
  { label: ['品牌标识', 'Logos'], assets: markAssets.slice(0, 2) },
  { label: ['标识容器', 'Logo containers'], assets: markAssets.slice(2, 6) },
  { label: ['品牌图形', 'Brand graphics'], assets: markAssets.slice(6) },
  { label: ['版式色块', 'Layout blocks'], assets: [
    { id: 'information-band', label: ['深蓝信息带', 'Blue information band'], width: 600, height: 253, coverage: .72,
      parts: [block(palette.blue, 0, 0, 600, 253)] },
    { id: 'product-blocks', label: ['产品宣传色块', 'Product layout blocks'], width: 600, height: 408, coverage: .72,
      parts: product.map(part => ({ ...part, y: part.y - 440 })) },
  ] },
  { label: ['可编辑文字版式', 'Layouts with editable text'], assets: [
    { id: 'simple-poster', label: ['简洁海报', 'Simple poster'], width: 600, height: 848, coverage: .82, parts: [
      ...header, text(['海报主标题', 'Poster title'], 42, 295, 516, 54, palette.blue, 700),
      text(['在这里填写副标题', 'Add a subtitle here'], 42, 380, 516, 31, palette.medium),
    ] },
    { id: 'information-poster', label: ['图文分区海报', 'Image and copy poster'], width: 600, height: 848, coverage: .82,
      parts: [info, ...header, ...bandCopy] },
    { id: 'product-poster', label: ['产品宣传海报', 'Product poster'], width: 600, height: 848, coverage: .82,
      parts: [...product, ...header, ...productCopy] },
  ] },
]

export function findBrandAsset(id: string) {
  for (const section of brandAssetSections) {
    const asset = section.assets.find(item => item.id === id)
    if (asset) return asset
  }
}

export function artworkHeight(asset: BrandArtworkId, width: number) {
  const size = brandArtwork[asset].size
  return width / size.width * size.height
}

const clamp = (value: number, max: number) => Math.min(Math.max(0, value), Math.max(0, max))

export function placeBrandAsset(asset: BrandAsset, canvas: Size, point: Point, localize: (label: BrandLabel) => string): (BrandOverlay | TextLayer)[] {
  const scale = asset.coverage * Math.min(canvas.width / asset.width, canvas.height / asset.height)
  const left = clamp(point.x - asset.width * scale / 2, canvas.width - asset.width * scale)
  const top = clamp(point.y - asset.height * scale / 2, canvas.height - asset.height * scale)
  return asset.parts.map(part => {
    const bounds = { id: crypto.randomUUID(), x: (left + part.x * scale) / canvas.width,
      y: (top + part.y * scale) / canvas.height, width: part.width * scale / canvas.width }
    if (part.kind === 'shape') return { ...bounds, kind: 'shape', height: part.height * scale / canvas.height, color: part.color }
    if (part.kind === 'brand') return { ...bounds, kind: 'brand', asset: part.asset, height: artworkHeight(part.asset, part.width) * scale / canvas.height }
    return { ...bounds, kind: 'text', text: localize(part.label), fontSize: Math.max(8, Math.min(600, Math.round(part.fontSize * scale * 10) / 10)),
      family: 'Source Han Sans CN', weight: part.weight, align: 'left', color: part.color }
  })
}

export function moveBrandOverlay(layer: BrandOverlay, size: Size, dx: number, dy: number) {
  return { x: clamp(layer.x + dx / size.width, 1 - layer.width), y: clamp(layer.y + dy / size.height, 1 - layer.height) }
}

export function resizeBrandOverlay(layer: BrandOverlay, canvas: Size, handle: string, dx: number, dy: number) {
  const west = handle.endsWith('w'), north = handle.startsWith('n')
  const width = layer.width * canvas.width, height = layer.height * canvas.height
  const maxWidth = (west ? layer.x + layer.width : 1 - layer.x) * canvas.width
  const maxHeight = (north ? layer.y + layer.height : 1 - layer.y) * canvas.height
  const horizontal = west ? -dx : dx, vertical = north ? -dy : dy
  let nextWidth, nextHeight
  if (layer.kind === 'brand') {
    const requested = 1 + (width * horizontal + height * vertical) / (width ** 2 + height ** 2)
    const scale = Math.min(maxWidth / width, maxHeight / height, Math.max(Math.min(1, 8 / Math.max(width, height)), requested))
    nextWidth = width * scale; nextHeight = height * scale
  } else {
    nextWidth = Math.min(maxWidth, Math.max(Math.min(8, width), width + horizontal))
    nextHeight = Math.min(maxHeight, Math.max(Math.min(8, height), height + vertical))
  }
  const w = Math.min(1, nextWidth / canvas.width), h = Math.min(1, nextHeight / canvas.height)
  return { width: w, height: h, x: clamp(west ? layer.x + layer.width - w : layer.x, 1 - w),
    y: clamp(north ? layer.y + layer.height - h : layer.y, 1 - h) }
}
