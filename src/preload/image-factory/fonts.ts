import { canvasFonts, type TextLayer } from '../../shared/image-factory-canvas'

const assetFonts = canvasFonts.filter(font => 'asset' in font)
type AssetFont = typeof assetFonts[number]
const directory = '/fonts/image-factory/'

function faceRule(font: AssetFont, src: string) {
  const format = font.asset.file.endsWith('.woff2') ? 'woff2' : 'truetype'
  return '@font-face{font-family:"' + font.family + '";font-style:normal;font-weight:' + font.asset.weight +
    ';src:url("' + src + '") format("' + format + '");font-display:block}'
}

export const imageFactoryFontFaces = assetFonts.map(font => faceRule(font, directory + font.asset.file)).join('\n')
const embeddedFaces = new WeakMap<Document, Map<string, Promise<string>>>()

/** SVG images have an isolated font scope. Embed the selected assets for export. */
export async function imageFactoryExportFonts(doc: Document, layers: TextLayer[]) {
  const families = new Set(layers.map(layer => layer.family))
  const required = assetFonts.filter(font => families.has(font.family))
  if (!required.length) return ''
  const win = doc.defaultView!
  let cache = embeddedFaces.get(doc)
  if (!cache) { cache = new Map(); embeddedFaces.set(doc, cache) }
  const rules = await Promise.all(required.map(font => {
    const { file } = font.asset
    let cached = cache.get(file)
    if (!cached) {
      cached = win.fetch(new URL(directory + file, doc.baseURI)).then(async response => {
        if (!response.ok) throw Error('字体「' + font.label + '」暂时无法读取。')
        const blobBytes = await response.arrayBuffer()
        return new Promise<string>((resolve, reject) => {
          const reader = new win.FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(new Blob([blobBytes], { type: file.endsWith('.woff2') ? 'font/woff2' : 'font/ttf' }))
        })
      }).catch(error => { cache.delete(file); throw error })
      cache.set(file, cached)
    }
    return cached.then(data => faceRule(font, data))
  }))
  return rules.join('\n')
}
