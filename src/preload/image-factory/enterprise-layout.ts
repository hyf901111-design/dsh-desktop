import type { ShapeLayer, TextLayer } from '../../shared/image-factory-canvas'
import type { EnterpriseTemplate } from './enterprise-gallery'
import type { GalleryExample } from './gallery-examples'
import { templateTextLayer } from './template-text'
import type { Size } from './raster'

type T = (zh: string, en: string) => string

const palettes = {
  navy:   { paper: '#f1f4f8', ink: '#142d4c', deep: '#102d51', accent: '#437ae5', line: '#d2dfed', light: '#d9e8ff' },
  teal:   { paper: '#eef5f3', ink: '#113d3b', deep: '#0d3e3b', accent: '#258b7a', line: '#cee2df', light: '#ccefe8' },
  violet: { paper: '#f3eff9', ink: '#31244f', deep: '#221940', accent: '#7858c7', line: '#dfd7ee', light: '#e7dcf9' },
  terra:  { paper: '#fbf3ea', ink: '#482e28', deep: '#4a2a27', accent: '#ab5b44', line: '#e8d6ca', light: '#f1dfd1' },
  slate:  { paper: '#f1f3f6', ink: '#26333e', deep: '#202e3a', accent: '#426881', line: '#d6dfe6', light: '#dce9f1' },
}
const white = '#ffffff'

export function enterpriseTemplateLayers(
  example: GalleryExample, design: EnterpriseTemplate, size: Size, t: T, nextId: () => string,
) {
  const layers: (ShapeLayer | TextLayer)[] = []
  const { paper, ink, deep, accent, line, light } = palettes[design.tone]
  const title = t(...example.title)
  const subtitle = t(...example.subtitle)
  const label = t(...example.material)
  const details = design.details.map(item => t(...item))
  const rect = (x: number, y: number, width: number, height: number, color = paper) =>
    layers.push({ kind: 'shape', id: nextId(), x, y, width, height, color })
  const copy = (value: string | undefined, x: number, y: number, width: number, em: number,
    color = ink, weight = 400, align: TextLayer['align'] = 'left') => {
    if (value) layers.push(templateTextLayer(nextId(), value, size.width, x, y, width, em, color, weight, align))
  }
  const tick = (x: number, y: number, width = .073, height = .006) => rect(x, y, width, height, accent)
  const wide = size.width / size.height > 1.4

  switch (design.layout) {
    case 'invitation':
      rect(0, .405, 1, .595)
      rect(.055, .36, .39, .073, deep)
      copy(label, .081, .376, .33, .027, white, 700)
      copy(title, .068, .477, .87, .093, ink, 700)
      copy(subtitle, .068, .588, .86, .037)
      details.forEach((item, index) => {
        const y = .68 + index * .084
        tick(.07, y + .022, .019, .005)
        rect(.07, y + .061, .86, .002, line)
        copy(item, .111, y + .007, .81, .033, ink, 600)
      })
      break
    case 'screen':
      rect(0, 0, .53, 1, deep)
      rect(.53, 0, .009, 1, accent)
      copy(label, .055, .12, .43, .018, light, 600)
      copy(title, .055, .31, .427, wide ? .057 : .066, white, 700)
      copy(subtitle, .055, .54, .435, .024, white)
      copy(details[0], .055, .81, .43, .016, light)
      break
    case 'schedule':
      rect(0, 0, 1, 1)
      rect(0, 0, 1, .263, deep)
      copy(label, .074, .059, .84, .027, light, 600)
      copy(title, .074, .105, .85, .082, white, 700)
      copy(subtitle, .074, .196, .84, .031, light)
      details.forEach((item, index) => {
        const y = .31 + index * .145
        rect(.073, y, .854, .112, index % 2 === 0 ? white : light)
        rect(.073, y, .009, .112, accent)
        copy(item, .109, y + .039, .77, .033, ink, 600)
      })
      break
    case 'profile':
      rect(0, .654, 1, .346, deep)
      rect(.068, .608, .42, .068, accent)
      copy(details[0] ?? label, .088, .625, .367, .030, white, 700)
      copy(title, .066, .711, .86, .086, white, 700)
      copy(subtitle, .066, .811, .85, .037, light)
      copy(details[1], .066, .909, details[2] ? .425 : .84, .024, white)
      copy(details[2], .53, .909, .402, .024, white)
      break
    case 'countdown':
      rect(0, 0, .62, 1, deep)
      rect(.56, .72, .38, .205, light)
      copy(label, .07, .09, .48, .034, light, 600)
      copy(details[0], .064, .191, .52, .32, white, 700)
      copy(details[1], .076, .57, .48, .054, white, 600)
      copy(title, .075, .73, .46, .054, white, 700)
      copy(subtitle, .594, .79, .298, .028, ink)
      break
    case 'story':
    case 'timeline': {
      const timeline = design.layout === 'timeline'
      rect(0, .37, 1, .63)
      rect(0, 0, 1, .192, deep)
      copy(label, .071, .038, .86, .027, light, 600)
      copy(title, .071, .071, .86, .086, white, 700)
      copy(subtitle, .071, .134, .86, .035, light)
      const step = timeline ? .12 : .155
      rect(.092, .435, .008, step * (details.length - 1) + .055, line)
      details.forEach((item, index) => {
        const y = .436 + index * step
        rect(.075, y + .013, .042, .021, accent)
        copy(item, .159, y, .76, .051, ink, 700)
        copy(t('填写内容', 'Add details'), .159, y + .049, .73, .030, ink)
      })
      break
    }
    case 'split':
      rect(0, 0, .525, 1)
      rect(0, 0, .009, 1, accent)
      copy(label, .056, .109, .42, .019, accent, 700)
      tick(.056, .224, .071, .010)
      copy(title, .056, .294, .42, .054, ink, 700)
      copy(subtitle, .056, .479, .42, .024)
      details.forEach((item, index) => {
        const y = .675 + index * .12
        rect(.055, y, .415, .081, index ? light : deep)
        copy(item, .071, y + .022, .38, .019, index ? ink : white, 600)
      })
      break
    case 'features':
      rect(0, 0, 1, .29, deep)
      rect(0, .535, 1, .465)
      copy(label, .063, .057, .86, .028, light, 700)
      copy(title, .063, .107, .86, .090, white, 700)
      copy(subtitle, .063, .207, .86, .034, white)
      details.forEach((item, index) => {
        const x = .063 + index * .297
        rect(x, .578, .277, .323, white)
        rect(x, .578, .277, .008, accent)
        copy(item, x + .021, .662, .235, .040, ink, 700)
        copy(t('补充说明', 'Add details'), x + .021, .77, .235, .026, ink)
      })
      break
    case 'social':
      rect(.043, .054, .914, .211, deep)
      rect(.044, .61, .913, .334, white)
      copy(label, .078, .080, .84, .028, light, 700)
      copy(title, .078, .137, .84, .081, white, 700)
      tick(.084, .665, .068, .008)
      copy(subtitle, .084, .714, .824, .05, ink, 700)
      copy(details[0], .084, .849, .824, .031, ink)
      break
    case 'audio':
      rect(0, 0, .5, 1, deep)
      rect(.073, .091, .33, .075, accent)
      copy(details[0], .099, .111, .275, .027, white, 700)
      copy(label, .072, .322, .403, .028, light, 600)
      copy(title, .072, .419, .389, .077, white, 700)
      copy(subtitle, .072, .681, .395, .027, light)
      break
    case 'cover':
      rect(0, 0, 1, .407)
      rect(0, .397, 1, .010, accent)
      rect(0, .92, 1, .08, deep)
      copy(label, .067, .05, .86, .027, accent, 700)
      copy(title, .067, .118, .87, .082, ink, 700)
      copy(subtitle, .067, .220, .87, .035)
      copy(details[0], .067, .322, .85, .027, ink, 600)
      copy(details[1], .067, .944, .85, .026, white, 600)
      break
    case 'notice':
      rect(0, 0, 1, 1)
      rect(.048, .042, .904, .916, white)
      rect(.048, .042, .904, .017, accent)
      copy(label, .102, .114, .795, .031, accent, 700)
      copy(title, .102, .166, .795, .085, ink, 700)
      copy(subtitle, .102, .277, .795, .037)
      details.forEach((item, index) => {
        const y = .402 + index * .154
        rect(.102, y, .795, .002, line)
        copy(item, .102, y + .027, .795, .037, ink, 700)
        copy(t('点击填写', 'Add details'), .102, y + .079, .795, .029)
      })
      break
    case 'certificate':
      rect(0, 0, 1, 1)
      rect(.044, .048, .912, .904, accent)
      rect(.049, .055, .902, .89, white)
      copy(title, .09, .203, .82, .058, ink, 700, 'center')
      copy(subtitle, .09, .343, .82, .022, ink, 400, 'center')
      copy(details[0], .19, .457, .62, .039, accent, 700, 'center')
      rect(.267, .565, .466, .002, line)
      copy(details[1], .128, .797, .34, .021)
      copy(details[2], .681, .797, .205, .021)
      break
    case 'sign':
      rect(0, 0, 1, 1, deep)
      rect(.743, 0, .257, 1, accent)
      copy(title, .057, .191, .64, .075, white, 700)
      copy(subtitle, .057, .503, .64, .019, light)
      copy(details[0], .057, .738, .64, .018, white)
      copy('→', .762, .188, .218, .124, white, 700, 'center')
      break
    case 'metric':
      rect(0, 0, .56, .589, deep)
      rect(0, .59, 1, .41)
      copy(label, .051, .097, .449, .019, light, 700)
      copy(title, .051, .219, .453, .049, white, 700)
      copy(subtitle, .051, .431, .453, .0195, light)
      details.forEach((item, index) => {
        const x = .052 + index * .305
        rect(x, .65, .282, .274, white)
        rect(x, .65, .282, .007, accent)
        copy(item, x + .017, .702, .25, .024, ink, 700)
        copy(t('填写摘要', 'Add a summary'), x + .017, .818, .25, .017)
      })
      break
  }
  return layers
}
