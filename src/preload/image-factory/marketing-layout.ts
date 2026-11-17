import type { BrandArtworkId, TextLayer } from '../../shared/image-factory-canvas'
import type { GalleryExample } from './gallery-examples'
import { campaignFor } from './marketing-templates'

type Localize = (zh: string, en: string) => string
type Copy = (text: string, x: number, y: number, width: number, em: number, color: string, weight?: number,
  align?: TextLayer['align'], family?: TextLayer['family']) => void
type Block = (color: string, x: number, y: number, width: number, height: number) => void
type Artwork = (asset: BrandArtworkId, x: number, y: number, width: number) => void

const gutter = .07
const span = 1 - 2 * gutter
const white = '#ffffff'

export function drawMarketingLayout(example: GalleryExample, t: Localize, copy: Copy, block: Block, art: Artwork) {
  const campaign = campaignFor(example.id)
  if (!campaign) return false

  const { palette: { panel, ink, accent, muted }, header, features, distribution, fields } = campaign
  const wide = example.format === '16:9'
  const square = distribution === 'square'
  const portraitEvent = fields === 'event' && !wide
  const runner = example.id === 'efund-marathon-city'
  const darkTitle = header.ink === white || header.ink === '#faeddb'
  const rule = (x: number, y: number, width: number, color = accent) => block(color, x, y, width, wide ? .004 : .0025)
  const startPanel = (y: number) => block(panel, 0, y, 1, 1 - y)

  if (wide) block(panel, 0, 0, .525, 1)
  if (square) block(panel, 0, 0, .565, .45)
  if (distribution === 'timeline') block(panel, 0, 0, 1, .233)
  if (portraitEvent && !runner) block('#102750', 0, 0, 1, .267)
  if (runner) {
    // Keep the athlete's face and stride clear and place copy below the photograph.
    startPanel(.556)
  }
  const headerY = runner ? .576 : wide ? .138 : square ? .098 : .088
  const titleY = runner ? .612 : wide ? .215 : square ? .15 : .128
  const subtitleY = runner ? .689 : wide ? .353 : portraitEvent ? .218 : square ? .259 : .208
  const headerWidth = wide || square ? .43 : span
  art('container-left', 0, wide ? .032 : .024, wide ? .147 : .208)
  if (!square && !wide) art(darkTitle ? 'graphic-top-bright' : 'graphic-top', .87, 0, .13)
  rule(gutter, headerY - .014, wide ? .035 : .084, header.accent)
  copy(t(...campaign.kicker), gutter, headerY, headerWidth, wide ? .014 : .023, header.accent, 700)
  copy(t(...example.title), gutter, titleY, headerWidth, wide ? .048 : square ? .064 : portraitEvent ? .066 : .081,
    header.ink, header.serif ? 400 : 700, 'left', header.serif ? 'ZCOOL XiaoWei' : 'Source Han Sans CN')
  copy(t(...example.subtitle), gutter, subtitleY, headerWidth, wide ? .019 : square ? .028 : .031, header.ink, 500)

  const feature = (index: number, x: number, y: number, width: number, gap: number, tone = ink, supporting = muted, scale = 1) => {
    const [title, detail] = features[index]!
    copy(t(...title), x, y, width, .027 * scale, tone, 700)
    copy(t(...detail), x, y + gap, width, .022 * scale, supporting)
  }
  const columns = (y: number, count = features.length, gap = .028) => {
    const width = (span - gap * (count - 1)) / count
    return Array.from({ length: count }, (_, i) => ({ x: gutter + i * (width + gap), y, width }))
  }

  switch (distribution) {
    case 'launch':
    case 'harvest': {
      startPanel(.652)
      columns(.684).forEach(({ x, y, width }, i) => {
        rule(x, y - .013, width)
        feature(i, x, y, width, .030, accent, muted)
      })
      break
    }
    case 'industry':
    case 'wheel': {
      startPanel(distribution === 'industry' ? .679 : .65)
      columns(distribution === 'industry' ? .706 : .680).forEach(({ x, y, width }, i) => {
        rule(x, y - .012, width)
        feature(i, x, y, width, .029, accent)
      })
      break
    }
    case 'timeline':
      startPanel(.629)
      columns(.665, features.length, .018).forEach(({ x, y, width }, i) => {
        rule(x, y - .014, width)
        feature(i, x, y, width, .029, accent)
      })
      break
    case 'cards': {
      const captions = [
        [.175, .300, .263, white, white],
        [.581, .373, .257, '#54260f', '#57290f'],
        [.175, .548, .263, '#083c72', '#163f62'],
        [.581, .629, .257, '#07384a', '#0a3746'],
      ] as const
      captions.forEach(([x, y, width, tone, supporting], i) => feature(i, x, y, width, .037, tone, supporting, 1.12))
      startPanel(.781)
      break
    }
    case 'bond':
      features.forEach((_, i) => {
        const y = .347 + i * .139
        block(panel, .55, y, .38, .098)
        block(i === 0 ? '#2087bf' : '#b6596b', .55, y, .008, .098)
        feature(i, .575, y + .020, .329, .038, ink, muted, 1.12)
      })
      startPanel(.726)
      rule(gutter, .748, span)
      break
    case 'index': {
      startPanel(.615)
      copy(t('指数样本 · 数据展示', 'INDEX CONSTITUENTS / DATA'), gutter, .635, .58, .026, white, 700)
      copy(t('截至〔数据日期〕', 'As of [date]'), .67, .638, .26, .019, muted, 400, 'right')
      const rows = [
        [t('证券代码', 'Ticker'), t('样本名称', 'Constituent'), t('权重', 'Weight')],
        [t('〔代码 1〕', '[ticker 1]'), t('〔样本名称 1〕', '[constituent 1]'), '〔— %〕'],
        [t('〔代码 2〕', '[ticker 2]'), t('〔样本名称 2〕', '[constituent 2]'), '〔— %〕'],
      ]
      rows.forEach((row, i) => {
        const y = .664 + i * .029
        block(i === 0 ? '#28639d' : i % 2 ? '#133f7a' : '#194980', gutter, y, span, .028)
        row.forEach((cell, column) => copy(cell, [.091, .375, .711][column]!, y + .007, .195, .018,
          white, i === 0 ? 700 : 400, column === 2 ? 'right' : 'left'))
      })
      break
    }
    case 'square':
      startPanel(.524)
      columns(.667).forEach(({ x, width }, i) => {
        block('#dbeafa', x, .644, width, .119)
        rule(x, .644, width)
        feature(i, x + .017, .665, width - .034, .048, ink, muted, .92)
      })
      break
    case 'event':
      if (!wide && !runner) startPanel(.646)
      rule(gutter, wide ? .414 : runner ? .733 : .668, wide ? .38 : span)
      if (wide) {
        features.forEach((_, i) => feature(i, gutter + i * .208, .547, .175, .059, accent, ink, .69))
      } else {
        columns(runner ? .758 : .691).forEach(({ x, y, width }, i) => feature(i, x, y, width, .033, accent, ink, .94))
      }
      break
  }

  const bodyWidth = wide ? .39 : span
  const detailY = wide ? .451 : square ? .559 : runner ? .833 : portraitEvent ? .781 : distribution === 'cards' ? .795 : .766
  const bodyY = wide ? .674 : square ? .793 : runner ? .872 : portraitEvent ? .836 : distribution === 'cards' ? .836 : .815
  const detailSize = wide ? .025 : square ? .045 : runner ? .033 : portraitEvent ? .041 : .046
  copy(t(...campaign.product), gutter, detailY, bodyWidth, detailSize, ink, 700)
  copy(t(...campaign.description), gutter, bodyY, bodyWidth, wide ? .016 : runner ? .020 : .025, ink)

  if (fields === 'event') {
    const y = wide ? .779 : runner ? .908 : .886
    rule(gutter, y, bodyWidth)
    const columnWidth = (bodyWidth - .025) / 2
    copy(t('时间 〔填写日期与时间〕', 'TIME  [add date and time]'), gutter, y + .015, columnWidth, wide ? .014 : .018, ink, 700)
    copy(t('地点 〔填写活动地点〕', 'VENUE  [add venue]'), gutter + bodyWidth - columnWidth, y + .015, columnWidth, wide ? .014 : .018, ink, 700)
    copy(t('报名方式 〔填写入口与截止日期〕', 'REGISTRATION  [link and deadline]'), gutter, y + (wide ? .082 : .043),
      bodyWidth, wide ? .015 : .019, accent, 700)
  } else if (fields === 'lesson') {
    rule(gutter, .872, bodyWidth)
    copy(t('资料说明 · 仅作投教示例。基金有风险，投资需谨慎。', 'For education only. Funds involve investment risk.'),
      gutter, .899, bodyWidth, .023, muted)
  } else {
    const dual = fields === 'dual'
    const label = t(dual ? '份额代码' : '产品代码', dual ? 'SHARE CLASS' : 'FUND CODE')
    block(ink, gutter, .869, dual ? .573 : .455, .037)
    copy(label, .086, .881, .128, .019, panel, 700)
    copy(dual ? t('A 〔代码〕', 'A [code]') : t('〔代码〕', '[code]'), .237, .878, .174, .025, panel, 700)
    if (dual) copy(t('C 〔代码〕', 'C [code]'), .442, .878, .175, .025, panel, 700)
    copy(t('〔填写发布安排〕', '[launch details]'), dual ? .674 : .557, .879, dual ? .255 : .372, .024, ink, 700)
    rule(gutter, .924, bodyWidth)
    copy(t('风险提示及资料来源', 'RISK DISCLOSURES AND SOURCES'), gutter, .933, bodyWidth, .020, ink, 700)
    copy(t('基金有风险，投资需谨慎。请补充经审核的产品风险提示。\n注：此处填写正式公告、数据来源及适用日期。',
      'Funds involve investment risk. Add approved fund-specific disclosures.\nNote: Add the relevant announcement, source and date.'),
      gutter, .953, bodyWidth, .018, muted)
  }
  return true
}
