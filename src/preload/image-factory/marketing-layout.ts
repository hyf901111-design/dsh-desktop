import type { BrandArtworkId, TextLayer } from '../../shared/image-factory-canvas'
import type { GalleryExample } from './gallery-examples'
import { campaignFor } from './marketing-templates'

type Localize = (zh: string, en: string) => string
type Copy = (text: string, x: number, y: number, width: number, em: number, color: string, weight?: number,
  align?: TextLayer['align'], family?: TextLayer['family']) => void
type Block = (color: string, x: number, y: number, width: number, height: number) => void
type Artwork = (asset: BrandArtworkId, x: number, y: number, width: number) => void

export function drawMarketingLayout(example: GalleryExample, t: Localize, copy: Copy, block: Block, art: Artwork) {
  const campaign = campaignFor(example.id)
  if (!campaign) return false

  const { palette: { panel, ink, accent, muted }, header, features, distribution, fields } = campaign
  const white = '#ffffff'
  const wide = example.format === '16:9'
  const square = distribution === 'square'
  const compact = distribution === 'event' || square
  const darkTitle = header.ink === white || header.ink === '#faeddb'
  const rule = (x: number, y: number, width: number, color = accent) => block(color, x, y, width, wide ? .004 : .0025)
  const headerY = wide ? .137 : .094
  const headerX = .066
  const headerWidth = wide ? .47 : square ? .46 : .87

  if (wide) block(panel, 0, 0, .525, 1)
  if (square) block(panel, 0, 0, .565, .46)
  if (distribution === 'timeline') block(panel, 0, 0, 1, .217)
  if (example.id === 'efund-marathon-city') block(panel, 0, 0, 1, .203)
  if (example.id === 'efund-mountain-ridge') block('#102750', 0, 0, 1, .216)
  art('container-left', 0, wide ? .034 : .025, wide ? .147 : .215)
  if (!square && !wide) art(darkTitle ? 'graphic-top-bright' : 'graphic-top', .87, 0, .13)
  rule(headerX, headerY - .012, wide ? .031 : .088, header.accent)
  copy(t(...campaign.kicker), headerX, headerY, headerWidth, wide ? .014 : .025, header.accent, 700)
  copy(t(...example.title), headerX, headerY + (wide ? .058 : .031), headerWidth, wide ? .055 : .081, header.ink,
    header.serif ? 400 : 700, 'left', header.serif ? 'ZCOOL XiaoWei' : 'Source Han Sans CN')
  copy(t(...example.subtitle), headerX, headerY + (wide ? .177 : square ? .125 : .093),
    square ? .46 : headerWidth, wide ? .019 : .034, header.ink, 500)

  const feature = (index: number, x: number, y: number, width: number, tone = ink, supporting = muted, scale = 1) => {
    const [title, detail] = features[index]!
    copy(t(...title), x, y, width, .027 * scale, tone, 700)
    copy(t(...detail), x, y + (wide ? .046 : .022), width, .022 * scale, supporting)
  }

  switch (distribution) {
    case 'launch':
      block(panel, 0, .671, 1, .329)
      rule(.066, .682, .867)
      features.forEach((_, i) => feature(i, .066 + i * .453, .698, .409, accent, white))
      break
    case 'industry':
      block(panel, 0, .709, 1, .291)
      features.forEach((_, i) => {
        const x = .066 + i * .295
        rule(x, .719, .07)
        feature(i, x, .727, .274)
      })
      break
    case 'timeline':
      block(panel, 0, .625, 1, .375)
      features.forEach((_, i) => {
        const x = .066 + i * .222
        rule(x, .647 + i * .011, .17)
        feature(i, x, .656 + i * .011, .198, accent, muted)
      })
      break
    case 'cards': {
      const captions = [
        [.184, .315, .265, '#ffffff', '#ffffff'],
        [.586, .381, .267, '#54260f', '#57290f'],
        [.183, .553, .265, '#083c72', '#163f62'],
        [.585, .645, .269, '#07384a', '#0a3746'],
      ] as const
      captions.forEach(([x, y, width, tone, supporting], i) => feature(i, x, y, width, tone, supporting, 1.06))
      block(panel, 0, .802, 1, .198)
      rule(.066, .802, .869)
      break
    }
    case 'bond':
      features.forEach((_, i) => {
        const y = .353 + i * .134
        block(panel, .555, y, .391, .083)
        block(i === 0 ? '#2087bf' : '#b6596b', .555, y, .009, .083)
        feature(i, .582, y + .013, .333, ink, muted, 1.13)
      })
      block(panel, 0, .733, 1, .267)
      rule(.066, .761, .867)
      break
    case 'wheel':
      block(panel, 0, .662, 1, .338)
      features.forEach((_, i) => {
        const x = .066 + i * .294
        rule(x, .674, .245)
        feature(i, x, .686, .261, accent, white)
      })
      break
    case 'index': {
      block(panel, 0, .63, 1, .37)
      copy(t('指数样本 · 数据展示', 'INDEX CONSTITUENTS / DATA'), .066, .641, .65, .026, white, 700)
      copy(t('截至〔数据日期〕', 'As of [date]'), .68, .646, .25, .019, muted, 400, 'right')
      const rows = [
        [t('证券代码', 'Ticker'), t('样本名称', 'Constituent'), t('权重', 'Weight')],
        [t('〔代码 1〕', '[ticker 1]'), t('〔样本名称 1〕', '[constituent 1]'), '〔— %〕'],
        [t('〔代码 2〕', '[ticker 2]'), t('〔样本名称 2〕', '[constituent 2]'), '〔— %〕'],
      ]
      rows.forEach((row, i) => {
        const y = .664 + i * .026
        block(i === 0 ? '#28639d' : i % 2 ? '#133f7a' : '#194980', .066, y, .868, .025)
        row.forEach((cell, column) => copy(cell, [.085, .377, .742][column]!, y + .005, .22, .018, white, i === 0 ? 700 : 400))
      })
      break
    }
    case 'harvest':
      block(panel, 0, .672, 1, .328)
      features.forEach((_, i) => {
        const x = .066 + i * .452
        rule(x, .692, .37)
        feature(i, x, .702, .406, accent, muted)
      })
      break
    case 'square':
      block(panel, 0, .541, 1, .459)
      features.forEach((_, i) => {
        const x = .066 + i * .296
        block('#dbeafa', x, .645, .274, .116)
        rule(x, .645, .274)
        feature(i, x + .014, .664, .244)
      })
      break
    case 'event':
      if (!wide) block(panel, 0, .674, 1, .326)
      rule(.066, wide ? .403 : .689, wide ? .39 : .867)
      features.forEach((_, i) => feature(i, .066 + i * (wide ? .207 : .45), wide ? .53 : .717,
        wide ? .194 : .404, accent, ink, wide ? .7 : .94))
      break
  }

  const bodyWidth = wide ? .40 : .867
  const detailY = wide ? .445 : square ? .578 : compact ? .769 : distribution === 'cards' ? .813 : .778
  const bodyY = wide ? .665 : square ? .793 : compact ? .819 : distribution === 'cards' ? .847 : .817
  copy(t(...campaign.product), .066, detailY, bodyWidth, wide ? .025 : square ? .047 : .052, ink, 700)
  copy(t(...campaign.description), .066, bodyY, bodyWidth, wide ? .016 : distribution === 'cards' ? .021 : .026, ink)

  if (fields === 'event') {
    const y = wide ? .783 : .885
    rule(.066, y, bodyWidth)
    copy(t('时间 〔填写日期与时间〕', 'TIME  [add date and time]'), .066, y + .021, bodyWidth / 2, wide ? .014 : .019, ink, 700)
    copy(t('地点 〔填写活动地点〕', 'VENUE  [add venue]'), .066 + bodyWidth / 2, y + .021, bodyWidth / 2, wide ? .014 : .019, ink, 700)
    copy(t('报名方式 〔填写入口与截止日期〕', 'REGISTRATION  [link and deadline]'), .066, y + (wide ? .085 : .048),
      bodyWidth, wide ? .015 : .021, accent, 700)
  } else if (fields === 'lesson') {
    rule(.066, .881, bodyWidth)
    copy(t('资料说明 · 仅作投教示例。基金有风险，投资需谨慎。', 'For education only. Funds involve investment risk.'),
      .066, .904, bodyWidth, .021, muted)
  } else {
    const dual = fields === 'dual'
    const label = t(dual ? '份额代码' : '产品代码', dual ? 'SHARE CLASS' : 'FUND CODE')
    block(ink, .066, .865, dual ? .588 : .48, .038)
    copy(label, .081, .874, .139, .018, panel, 700)
    copy(dual ? 'A 〔代码〕' : '〔代码〕', .229, .871, .185, .028, panel, 700)
    if (dual) copy('C 〔代码〕', .445, .871, .176, .028, panel, 700)
    copy(t('〔填写发布安排〕', '[launch details]'), dual ? .675 : .574, .873, dual ? .258 : .359, .026, ink, 700)
    rule(.066, .926, bodyWidth)
    copy(t('风险提示及资料来源', 'RISK DISCLOSURES AND SOURCES'), .066, .936, bodyWidth, .020, ink, 700)
    copy(t('基金有风险，投资需谨慎。请补充经审核的产品风险提示。\n注：此处填写正式公告、数据来源及适用日期。',
      'Funds involve investment risk. Add approved fund-specific disclosures.\nNote: Add the relevant announcement, source and date.'),
      .066, .955, bodyWidth, .018, muted)
  }
  return true
}
