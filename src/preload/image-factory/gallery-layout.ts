import type { BrandArtworkId, BrandOverlay, TextLayer } from '../../shared/image-factory-canvas'
import { brandArtwork, brandColors as c } from './brand-artwork'
import type { GalleryExample } from './gallery-examples'
import { templateTextLayer } from './template-text'
import { drawMarketingLayout } from './marketing-layout'
import type { Size } from './raster'

type T = (zh: string, en: string) => string
const ink = '#202f3a'

/** Position the photograph before laying out editable text and brand elements. */
export function galleryPhotoPlacement(id: string) {
  if (id === 'efund-fund-learning') return { x: .49, y: .06, width: .44, height: .44, fill: '#f4f8fd' }
  if (id === 'efund-industry-pinwheel') return { x: 0, y: -.08, width: 1, height: 1, fill: '#083375' }
  if (id === 'research-desk') return { x: 0, y: -.15, width: 1, height: 1, fill: '#ffffff' }
}

/** The thumbnail and the new canvas use the same coordinates and layer order. */
export function galleryTemplateLayers(example: GalleryExample, size: Size, t: T, nextId: () => string): (BrandOverlay | TextLayer)[] {
  const layers: (BrandOverlay | TextLayer)[] = []
  const artHeight = (asset: BrandArtworkId, width: number) =>
    width * size.width / size.height * brandArtwork[asset].size.height / brandArtwork[asset].size.width
  const art = (asset: BrandArtworkId, x: number, y: number, width: number) =>
    layers.push({ kind: 'brand', id: nextId(), asset, x, y, width, height: artHeight(asset, width) })
  const logo = (width: number, y = .053, asset: BrandArtworkId = 'container-left', x = 0) => art(asset, x, y, width)
  const top = (width: number, asset: BrandArtworkId = 'graphic-top') => art(asset, 1 - width, 0, width)
  const bottom = (width: number, asset: BrandArtworkId = 'graphic-bottom') =>
    art(asset, 1 - width, Math.max(0, 1 - artHeight(asset, width)), width)
  const block = (color: string, x: number, y: number, width: number, height: number) =>
    layers.push({ kind: 'shape', id: nextId(), color, x, y, width, height })
  const copy = (text: string, x: number, y: number, width: number, em: number, color: string, weight = 400,
    align: TextLayer['align'] = 'left', family: TextLayer['family'] = 'Source Han Sans CN') =>
    layers.push({ ...templateTextLayer(nextId(), text, size.width, x, y, width, em, color, weight, align), family })
  if (drawMarketingLayout(example, t, copy, block, art)) return layers
  const title = t(...example.title), subtitle = t(...example.subtitle)
  switch (example.id) {
    case 'steady-horizon':
      block(c.blue, .05, .73, .9, .215)
      block(c.bright, .05, .73, .1, .008)
      logo(.256)
      top(.28)
      copy(title, .10, .759, .80, .079, c.white, 700)
      copy(subtitle, .10, .858, .80, .036, c.white)
      break
    case 'blueprint-city':
      block(c.blue, 0, 0, .45, 1)
      logo(.202, .105, 'logo-white', .05)
      top(.19, 'graphic-top-bright')
      copy(title, .05, .383, .37, .049, c.white, 700)
      copy(subtitle, .05, .517, .36, .020, c.white)
      copy(t('会议名称  /  日期及地点', 'Meeting name  /  Date and venue'), .05, .808, .38, .014, c.white)
      break
    case 'beacon':
      block(c.blue, 0, .397, .53, .491)
      block(c.bright, 0, .397, .07, .012)
      logo(.18, .062)
      top(.106, 'graphic-top-bright')
      copy(title, .055, .473, .45, .057, c.white, 700)
      copy(subtitle, .055, .703, .45, .024, c.white)
      break
    case 'research-desk':
      block(c.white, 0, .767, 1, .233)
      logo(.256)
      top(.22)
      copy(t('人物专访', 'INTERVIEW'), .075, .798, .85, .024, c.medium, 700)
      copy(title, .075, .839, .85, .067, c.blue, 700)
      copy(subtitle, .075, .919, .85, .034, ink)
      break
    case 'product-prism':
      block(c.gray, 0, .819, 1, .181)
      block(c.blue, .065, .641, .73, .111)
      block(c.bright, .065, .752, .78, .067)
      block(c.gold, .64, .877, .295, .057)
      logo(.256)
      top(.28)
      copy(title, .091, .663, .68, .069, c.white, 700)
      copy(subtitle, .091, .768, .72, .034, c.blue, 700)
      copy(t('产品信息请在此补充', 'Add product details here'), .065, .889, .54, .028, ink)
      copy(t('产品代码  000000', 'Code  000000'), .663, .891, .25, .025, ink, 700)
      break
    case 'new-year-light':
      block(c.white, 0, .719, 1, .281)
      logo(.242, .062, 'container-left-white')
      bottom(.184)
      copy(title, .065, .789, .69, .071, c.blue, 700)
      copy(subtitle, .065, .904, .69, .030, c.medium)
      break
    case 'architecture':
      block(c.blue, 0, 0, 1, .231)
      block(c.bright, .068, .089, .16, .004)
      block(c.white, 0, .625, 1, .375)
      block(c.medium, .071, .807, .63, .046)
      logo(.36, .034, 'logo-white', .071)
      top(.24, 'graphic-top-bright')
      copy(title, .071, .111, .86, .101, c.white, 700)
      copy(subtitle, .071, .172, .86, .043, c.white)
      copy(t('活动亮点', 'Event highlights'), .071, .662, .86, .067, c.blue, 700)
      copy(t('• 活动主题与议程\n• 地点及参与方式', '• Event agenda\n• Venue and access'), .071, .715, .86, .038, ink)
      copy(t('日期  /  时间', 'DATE  /  TIME'), .095, .821, .58, .035, c.white, 700)
      bottom(.28)
      break
    case 'forward':
      block(c.white, .555, 0, .445, 1)
      block(c.blue, .597, .624, .226, .109)
      logo(.193, .085)
      bottom(.174)
      copy(title, .597, .237, .366, .045, c.blue, 700)
      copy(subtitle, .597, .347, .36, .022, ink)
      copy(t('日期及地点', 'Date and venue'), .597, .50, .364, .020, ink)
      copy(t('活动报名', 'Register'), .618, .655, .18, .022, c.white, 700)
      break
    case 'open-water':
      block(c.white, 0, 0, 1, .362)
      block(c.bright, .068, .164, .072, .006)
      logo(.245)
      top(.242)
      copy(t('20XX 年度报告', '20XX Annual Report'), .068, .19, .85, .068, c.blue, 700)
      copy(title, .068, .264, .85, .044, c.medium)
      copy(subtitle, .068, .316, .85, .026, ink)
      break
    case 'momentum':
      block(c.blue, 0, 0, .48, 1)
      block(c.bright, .043, .333, .064, .016)
      logo(.166, .083, 'logo-white', .043)
      bottom(.14, 'graphic-bottom-bright')
      copy(title, .043, .402, .41, .039, c.white, 700)
      copy(subtitle, .043, .621, .42, .018, c.white)
      break
    case 'first-light':
      block(c.blue, .045, .516, .91, .199)
      logo(.315)
      top(.267)
      copy(t('品牌短片', 'BRAND FILM'), .083, .544, .81, .025, c.white, 700)
      copy(title, .083, .583, .81, .073, c.white, 700)
      copy(subtitle, .083, .665, .81, .031, c.white)
      break
    case 'craft':
      block(c.white, 0, .51, 1, .49)
      logo(.252, .06)
      bottom(.193)
      copy(title, .063, .586, .87, .071, c.blue, 700)
      copy(subtitle, .063, .702, .85, .031, c.medium)
      copy(t('01  在这里填写第一个知识点\n02  在这里填写第二个知识点', '01  Add the first learning point\n02  Add the second learning point'), .063, .794, .73, .034, ink)
      break
  }
  return layers
}
