import type { GalleryExample } from './gallery-examples'

type Copy = GalleryExample['title']
type Feature = readonly [Copy, Copy]

type Campaign = {
  kicker: Copy
  product: Copy
  description: Copy
  features: readonly Feature[]
  palette: { panel: string; ink: string; accent: string; muted: string }
  header: { ink: string; accent: string; serif?: boolean }
  distribution: 'launch' | 'industry' | 'timeline' | 'cards' | 'bond' | 'wheel' | 'index' | 'harvest' | 'square' | 'event'
  fields: 'dual' | 'single' | 'lesson' | 'event'
}

const blue = { panel: '#083375', ink: '#ffffff', accent: '#ffcc77', muted: '#b9d2ee' }
const light = { panel: '#eaf3fc', ink: '#09356f', accent: '#1766b5', muted: '#315a80' }
const bronze = { panel: '#24160f', ink: '#faeddb', accent: '#f3a365', muted: '#e6ceb4' }
const wheat = { panel: '#fff6df', ink: '#123874', accent: '#945218', muted: '#553f2a' }

export const marketingExamples = [
  { id: 'efund-active-prism', format: '9:16', title: ['主动有章法', 'Active, with a method'], subtitle: ['从研究出发，看懂主动管理 ETF', 'Understand active ETFs through research'], material: ['新品首发海报', 'Fund launch poster'] },
  { id: 'efund-industrial-star', format: '9:16', title: ['读懂产业坐标', 'Mapping industry'], subtitle: ['从高端制造到绿色能源，观察产业的变化', 'From advanced manufacturing to renewable energy'], material: ['产业主题产品海报', 'Industry fund poster'] },
  { id: 'efund-etf-feature-cards', format: '9:16', title: ['认识主动 ETF', 'Meet the active ETF'], subtitle: ['四个角度读懂产品如何运作', 'Four ways to understand how it works'], material: ['ETF 卖点长图', 'ETF explainer poster'] },
  { id: 'efund-innovation-archive', format: '9:16', title: ['创新的刻度', 'The measure of innovation'], subtitle: ['沿着技术演进的线索，观察产业与时代', 'Trace how technology reshapes industries'], material: ['科创主题海报', 'Innovation fund poster'] },
  { id: 'efund-bond-pavilion', format: '9:16', title: ['分层看懂债券基金', 'Bond funds in layers'], subtitle: ['从投资范围、久期到信用风险', 'From scope and duration to credit risk'], material: ['债基策略长图', 'Bond strategy poster'] },
  { id: 'efund-industry-pinwheel', format: '9:16', title: ['产业在转动', 'Industry in motion'], subtitle: ['把趋势放到产业链中观察', 'Follow how trends move through industries'], material: ['产业机会长图', 'Industry opportunities poster'] },
  { id: 'efund-index-bridge', format: '9:16', title: ['把视野放到全球', 'A global perspective'], subtitle: ['跨市场指数观察 · 看懂跟踪标的', 'Cross-market index notes · Understand the benchmark'], material: ['指数数据长图', 'Index data poster'] },
  { id: 'efund-harvest', format: '9:16', title: ['为时间留一份耐心', 'Give time some patience'], subtitle: ['读懂持有期，也读懂资金安排', 'Understand holding periods and planning'], material: ['持有期产品海报', 'Holding-period fund poster'] },
  { id: 'efund-fund-learning', format: '1:1', title: ['基金风险怎么读', 'How to read fund risk'], subtitle: ['投教课堂 · 从三个问题开始', 'Investor education · Start with three questions'], material: ['投教主题知识卡', 'Investor education card'] },
  { id: 'efund-glass-transition', format: '16:9', title: ['走进研究现场', 'Inside the research process'], subtitle: ['易方达投教交流会 · 从研究框架理解市场', 'E Fund education forum · Understand how research works'], material: ['投教活动邀请函', 'Investor education invitation'] },
  { id: 'efund-marathon-city', format: '3:4', title: ['与城市一起奔跑', 'Run with the city'], subtitle: ['易方达品牌跑步活动', 'E Fund community run'], material: ['品牌马拉松活动海报', 'Brand marathon poster'] },
  { id: 'efund-mountain-ridge', format: '3:4', title: ['走向下一道山脊', 'To the next ridge'], subtitle: ['易方达品牌徒步活动', 'E Fund community hike'], material: ['品牌徒步活动海报', 'Brand hiking poster'] },
] as const satisfies readonly GalleryExample[]

export const campaigns: Record<typeof marketingExamples[number]['id'], Campaign> = {
  'efund-active-prism': {
    kicker: ['新品前瞻 · 主动管理', 'FUND PREVIEW / ACTIVE STRATEGY'],
    product: ['易方达〔产品名称〕', 'E Fund [fund name]'],
    description: ['从选股研究、组合构建到场内交易，了解主动管理 ETF 的投资框架与交易机制。', 'Explore the investment framework and trading mechanics, from security research to portfolio construction.'],
    features: [
      [['01  投资框架', '01  INVESTMENT FRAMEWORK'], ['以基金合同载明的策略及投资范围为准。', 'See the fund contract for the strategy and investment scope.']],
      [['02  交易方式', '02  TRADING MECHANICS'], ['发行安排及上市信息请查阅正式公告。', 'Check the official announcements for offer and listing details.']],
    ],
    palette: blue, header: { ink: blue.ink, accent: blue.accent, serif: true }, distribution: 'launch', fields: 'single',
  },
  'efund-industrial-star': {
    kicker: ['产业主题 · 产品解读', 'INDUSTRY THEMES / PRODUCT NOTES'],
    product: ['易方达〔产业主题基金名称〕', 'E Fund [industry fund name]'],
    description: ['关注产业链上的关键环节，结合招募说明书了解基金如何界定主题与投资范围。', 'Use the prospectus to understand how the fund defines its theme and investment universe.'],
    features: [
      [['智能制造', 'ADVANCED MANUFACTURING'], ['设备、工艺与供应链', 'Equipment, processes and supply chains']],
      [['绿色能源', 'RENEWABLE ENERGY'], ['发电、储能与基础设施', 'Generation, storage and infrastructure']],
      [['交通与航天', 'TRANSPORT AND AEROSPACE'], ['运输网络与高端装备', 'Transport networks and advanced equipment']],
    ],
    palette: light, header: { ink: light.ink, accent: '#a33e32', serif: true }, distribution: 'industry', fields: 'dual',
  },
  'efund-innovation-archive': {
    kicker: ['科创主题 · 技术观察', 'INNOVATION / TECHNOLOGY NOTES'],
    product: ['易方达〔科创主题基金名称〕', 'E Fund [innovation fund name]'],
    description: ['从生产工具到数字基础设施，梳理技术如何改变企业的生产方式与行业结构。', 'Trace how technology transforms the way companies produce goods and how industries are organised.'],
    features: [
      [['01  印刷工具', '01  PRINTING'], ['知识的规模化传播', 'Making knowledge more widely available']],
      [['02  人工照明', '02  ELECTRIC LIGHT'], ['延伸生产与生活场景', 'Extending where and when people can work']],
      [['03  集成电路', '03  CIRCUITS'], ['推动信息的高速处理', 'Accelerating information processing']],
      [['04  智能制造', '04  ROBOTICS'], ['机器进入精密生产流程', 'Bringing machines into precision production']],
    ],
    palette: bronze, header: { ink: bronze.ink, accent: bronze.accent, serif: true }, distribution: 'timeline', fields: 'dual',
  },
  'efund-etf-feature-cards': {
    kicker: ['产品知识 · 一图读懂', 'PRODUCT NOTES / QUICK GUIDE'],
    product: ['易方达〔主动 ETF 名称〕', 'E Fund [active ETF name]'],
    description: ['产品的投资范围、交易安排、披露频率与费率请以基金法律文件及公告为准。', 'Consult the fund documents and announcements for scope, trading, disclosures and fees.'],
    features: [
      [['主动管理', 'ACTIVE MANAGEMENT'], ['了解管理人如何构建组合。', 'See how the manager constructs the portfolio.']],
      [['场内交易', 'ON-EXCHANGE TRADING'], ['了解二级市场交易规则。', 'Read the secondary-market trading rules.']],
      [['信息披露', 'DISCLOSURES'], ['查看组合与定期报告。', 'Check portfolio disclosures and reports.']],
      [['产品费用', 'FUND FEES'], ['核对费率及适用条件。', 'Check the fees and when they apply.']],
    ],
    palette: blue, header: { ink: light.ink, accent: '#9f4219' }, distribution: 'cards', fields: 'single',
  },
  'efund-bond-pavilion': {
    kicker: ['债券策略 · 基金投教', 'BOND STRATEGIES / EDUCATION'],
    product: ['易方达〔债券基金名称〕', 'E Fund [bond fund name]'],
    description: ['债券基金会受到利率、信用与流动性变化影响。请查阅产品资料概要，确认适用的投资比例及风险。', 'Rates, credit and liquidity can affect bond funds. Check the product summary for applicable allocations and risks.'],
    features: [
      [['基础配置', 'CORE ALLOCATION'], ['先看债券类型及其配置范围。', 'Start with bond types and allocation ranges.']],
      [['策略补充', 'ADDITIONAL STRATEGIES'], ['再确认可转债等资产是否纳入投资范围。', 'Check whether assets such as convertibles are within scope.']],
    ],
    palette: light, header: { ink: '#0b3a70', accent: '#a13950', serif: true }, distribution: 'bond', fields: 'dual',
  },
  'efund-industry-pinwheel': {
    kicker: ['行业观察 · 产业链笔记', 'INDUSTRY NOTES / SUPPLY CHAINS'],
    product: ['易方达〔产业机会基金名称〕', 'E Fund [industry opportunities fund]'],
    description: ['可在此补充行业观察、投资策略以及资料日期，让产品信息与行业背景清晰对应。', 'Add context on the industry, investment strategy and date of the supporting information.'],
    features: [
      [['上游 · 材料与零部件', 'UPSTREAM / INPUTS'], ['关注技术、材料与关键零部件。', 'Focus on technology, materials and key components.']],
      [['中游 · 工艺与生产', 'MIDSTREAM / PROCESSES'], ['观察设备更新和生产工艺。', 'Look at equipment upgrades and production methods.']],
      [['下游 · 场景与需求', 'DOWNSTREAM / DEMAND'], ['跟踪产品应用和终端需求。', 'Follow applications and end-user demand.']],
    ],
    palette: blue, header: { ink: blue.ink, accent: blue.accent }, distribution: 'wheel', fields: 'dual',
  },
  'efund-index-bridge': {
    kicker: ['指数观察 · 跨市场专题', 'INDEX NOTES / CROSS-MARKET'],
    product: ['易方达〔指数基金名称〕', 'E Fund [index fund name]'],
    description: ['指数样本及权重会随规则调整。本版表格预留数据日期与来源，便于更新。', 'Constituents and weights can change under index rules. Use the table to record the date and source.'],
    features: [],
    palette: blue, header: { ink: '#0a336d', accent: '#174c94' }, distribution: 'index', fields: 'single',
  },
  'efund-harvest': {
    kicker: ['产品解读 · 持有期专题', 'PRODUCT NOTES / HOLDING PERIODS'],
    product: ['易方达〔持有期基金名称〕', 'E Fund [holding-period fund name]'],
    description: ['持有期以基金文件的约定为准。结合资金使用计划，提前了解各份额的持有期和赎回安排。', 'Use the fund documents to understand the holding period and redemption schedule for each share class.'],
    features: [
      [['确认起算点', 'CHECK THE START DATE'], ['查看每笔份额何时开始计算。', 'Check when the period begins for each holding.']],
      [['核对赎回日', 'CHECK REDEMPTION'], ['了解何时可提出赎回申请。', 'Check when redemption can be requested.']],
    ],
    palette: wheat, header: { ink: '#ffffff', accent: '#ffcc77', serif: true }, distribution: 'harvest', fields: 'dual',
  },
  'efund-fund-learning': {
    kicker: ['易方达投教 · 基金基础', 'E FUND EDUCATION / FUND BASICS'],
    product: ['认识你的风险承受能力', 'Understand your risk tolerance'],
    description: ['把产品特征同自己的投资目标、期限及风险承受能力放在一起考虑。', 'Compare the fund’s features with your own goals, investment horizon and risk tolerance.'],
    features: [
      [['01  投什么？', '01  WHAT DOES IT HOLD?'], ['从基金合同确认投资范围。', 'Check the fund contract for scope.']],
      [['02  有何波动？', '02  HOW DOES IT MOVE?'], ['了解风险来源与净值变化。', 'Learn what drives risk and NAV changes.']],
      [['03  是否匹配？', '03  DOES IT FIT?'], ['对照自己的风险承受能力。', 'Consider your own risk tolerance.']],
    ],
    palette: light, header: { ink: light.ink, accent: light.accent }, distribution: 'square', fields: 'lesson',
  },
  'efund-glass-transition': {
    kicker: ['易方达投教交流会', 'E FUND INVESTOR EDUCATION FORUM'],
    product: ['活动安排', 'Event details'],
    description: ['从行业研究到风险管理，了解研究人员如何验证假设、解读信息并提出新的问题。', 'Learn how researchers test assumptions, interpret new information and ask better questions.'],
    features: [
      [['01  主题分享', '01  PRESENTATION'], ['产业研究的框架与方法', 'Industry research frameworks']],
      [['02  观众交流', '02  DISCUSSION'], ['现场提问与经验交流', 'Audience questions and discussion']],
    ],
    palette: blue, header: { ink: blue.ink, accent: blue.accent }, distribution: 'event', fields: 'event',
  },
  'efund-marathon-city': {
    kicker: ['易方达品牌活动 · 城市跑步', 'E FUND COMMUNITY / CITY RUN'],
    product: ['赛事与报名信息', 'Run and registration details'],
    description: ['从第一公里开始，沿城市道路感受日常风景。请填写集合时间、路线、补给安排与报名方式。', 'Discover the city one kilometre at a time. Add meeting time, route, aid stations and registration details.'],
    features: [
      [['路线与组别', 'ROUTE AND GROUPS'], ['填写路线、里程及分组。', 'Add the route, distance and groups.']],
      [['装备与补给', 'KIT AND AID'], ['填写随身物品和补给点。', 'Add personal kit and aid points.']],
    ],
    palette: blue, header: { ink: '#ffffff', accent: '#ffcc77' }, distribution: 'event', fields: 'event',
  },
  'efund-mountain-ridge': {
    kicker: ['易方达品牌活动 · 户外徒步', 'E FUND COMMUNITY / HIKING'],
    product: ['路线与集合信息', 'Route and meeting details'],
    description: ['沿着山脊观察地形与天气。请填写起终点、路线强度、集合方式和计划下撤时间。', 'Explore the ridge and its changing weather. Add endpoints, difficulty, meeting details and descent time.'],
    features: [
      [['路线提示', 'ROUTE NOTES'], ['填写里程、爬升和预计用时。', 'Add distance, elevation and duration.']],
      [['装备清单', 'PACKING LIST'], ['填写饮水、衣物和安全装备。', 'List water, clothing and safety equipment.']],
    ],
    palette: light, header: { ink: '#ffffff', accent: '#ffcc77', serif: true }, distribution: 'event', fields: 'event',
  },
}

export function campaignFor(id: string): Campaign | undefined {
  return Object.hasOwn(campaigns, id) ? campaigns[id as keyof typeof campaigns] : undefined
}
