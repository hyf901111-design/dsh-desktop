import type { BrandArtworkId } from '../../shared/image-factory-canvas'
import { graphicBottom, graphicTop, logoLeft, logoRight } from './efund-outlines'

export const brandColors = {
  blue: '#005096', bright: '#1eb9e1', medium: '#0078b4', gray: '#c1c6c8', gold: '#ffc819', white: '#ffffff',
}

export type BrandLabel = readonly [string, string]
type Artwork = { size: { width: number; height: number }; label: BrandLabel; src: string; darkPreview?: true }

function artwork(box: [number, number, number, number], paths: string[], fill: string, label: BrandLabel,
  background?: string, darkPreview?: true): Artwork {
  const [x, y, width, height] = box
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + box.join(' ') + '" width="' + width + '" height="' + height + '">' +
    (background ? '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" fill="' + background + '"/>' : '') +
    '<g fill="' + fill + '">' + paths.map(path => '<path d="' + path + '"/>').join('') + '</g></svg>'
  return { label, size: { width, height }, src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), darkPreview }
}

const { blue, white } = brandColors
// Standalone marks include the original 0.75× clear space on all four sides.
const standalone: [number, number, number, number] = [586.9, 346, 249.3, 102.04]
const left: [number, number, number, number] = [535.91, 345.99, 300.27, 102.05]
const right: [number, number, number, number] = [957.04, 345.99, 300.32, 102.06]

export const brandArtwork: Record<BrandArtworkId, Artwork> = {
  'logo-blue': artwork(standalone, logoLeft, blue, ['中文标识 · 深蓝', 'Chinese logo · Blue']),
  'logo-white': artwork(standalone, logoLeft, white, ['中文标识 · 反白', 'Chinese logo · White'], undefined, true),
  'container-left': artwork(left, logoLeft, white, ['左侧标识容器', 'Left logo container'], blue),
  'container-right': artwork(right, logoRight, white, ['右侧标识容器', 'Right logo container'], blue),
  'container-left-white': artwork(left, logoLeft, blue, ['左侧标识容器 · 白底', 'Left logo container · White'], white),
  'container-right-white': artwork(right, logoRight, blue, ['右侧标识容器 · 白底', 'Right logo container · White'], white),
  'graphic-top': artwork([693.28, 181.28, 144, 109.46], graphicTop, blue, ['右上品牌图形', 'Top-right brand graphic']),
  'graphic-bottom': artwork([1072.33, 495.37, 144.01, 93.21], graphicBottom, blue, ['右下品牌图形', 'Bottom-right brand graphic']),
}
