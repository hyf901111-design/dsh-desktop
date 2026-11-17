import type { BrandArtworkId, BrandOverlay, TextLayer } from '../../shared/image-factory-canvas'
import { brandArtwork, brandColors as c } from './brand-artwork'
import type { GalleryExample } from './gallery-examples'
import { templateTextLayer } from './template-text'
import type { Size } from './raster'

type T = (zh: string, en: string) => string
const ink = '#202f3a'

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
  const copy = (text: string, x: number, y: number, width: number, em: number, color: string, weight = 400) =>
    layers.push(templateTextLayer(nextId(), text, size.width, x, y, width, em, color, weight))
  const title = t(...example.title), subtitle = t(...example.subtitle)
  switch (example.id) {
    case 'steady-horizon':
      block(c.blue, .05, .73, .9, .215)
      block(c.bright, .05, .73, .1, .008)
      logo(.256)
      top(.28)
      copy(title, .10, .766, .84, .079, c.white, 700)
      copy(subtitle, .10, .857, .84, .036, c.white)
      break
    case 'blueprint-city':
      block(c.blue, 0, 0, .45, 1)
      block(c.bright, .05, .316, .065, .012)
      logo(.202, .098, 'logo-white', .03)
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
      block(c.white, 0, .755, 1, .245)
      block(c.medium, 0, .755, .012, .245)
      logo(.256)
      top(.22)
      copy(t('人物专访', 'INTERVIEW'), .064, .782, .8, .024, c.medium, 700)
      copy(title, .064, .815, .87, .067, c.blue, 700)
      copy(subtitle, .064, .901, .87, .034, ink)
      break
    case 'product-prism':
      block(c.gray, 0, .79, 1, .21)
      block(c.blue, .05, .65, .69, .1)
      block(c.bright, .10, .75, .71, .078)
      block(c.gold, .62, .885, .31, .047)
      logo(.256)
      top(.28)
      copy(title, .081, .674, .64, .069, c.white, 700)
      copy(subtitle, .131, .771, .65, .034, c.blue, 700)
      copy(t('产品信息请在此补充', 'Add product details here'), .065, .882, .54, .028, ink)
      copy(t('产品代码  000000', 'Code  000000'), .639, .894, .28, .025, ink, 700)
      break
    case 'new-year-light':
      block(c.white, 0, .752, 1, .248)
      block(c.gold, .065, .782, .065, .009)
      logo(.242, .062, 'container-left-white')
      bottom(.184)
      copy(title, .065, .81, .69, .074, c.blue, 700)
      copy(subtitle, .065, .907, .69, .032, c.medium)
      break
    case 'architecture':
      block(c.blue, 0, 0, 1, .231)
      block(c.bright, .068, .089, .16, .004)
      block(c.white, 0, .625, 1, .375)
      block(c.medium, .071, .803, .63, .037)
      logo(.44, .022, 'logo-white', .034)
      top(.24, 'graphic-top-bright')
      copy(title, .071, .111, .86, .101, c.white, 700)
      copy(subtitle, .071, .172, .86, .043, c.white)
      copy(t('活动亮点', 'Event highlights'), .071, .662, .86, .067, c.blue, 700)
      copy(t('• 活动主题与议程\n• 地点及参与方式', '• Event agenda\n• Venue and access'), .071, .715, .86, .038, ink)
      copy(t('日期  /  时间', 'DATE  /  TIME'), .095, .809, .58, .035, c.white, 700)
      bottom(.28)
      break
    case 'forward':
      block(c.white, .555, 0, .445, 1)
      block(c.bright, .597, .177, .063, .012)
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
      logo(.166, .073, 'logo-white', .027)
      bottom(.14, 'graphic-bottom-bright')
      copy(title, .043, .402, .41, .039, c.white, 700)
      copy(subtitle, .043, .621, .42, .018, c.white)
      break
    case 'first-light':
      block(c.blue, .045, .537, .91, .155)
      block(c.bright, .045, .537, .12, .007)
      logo(.315)
      top(.267)
      copy(t('品牌短片', 'BRAND FILM'), .083, .556, .81, .025, c.white, 700)
      copy(title, .083, .579, .81, .086, c.white, 700)
      copy(subtitle, .083, .645, .81, .034, c.white)
      break
    case 'craft':
      block(c.white, 0, .51, 1, .49)
      block(c.blue, .063, .55, .085, .008)
      logo(.252, .06)
      bottom(.193)
      copy(title, .063, .587, .87, .077, c.blue, 700)
      copy(subtitle, .063, .687, .85, .033, c.medium)
      copy(t('01  在这里填写第一个知识点\n02  在这里填写第二个知识点', '01  Add the first learning point\n02  Add the second learning point'), .063, .778, .73, .034, ink)
      break
  }
  return layers
}
