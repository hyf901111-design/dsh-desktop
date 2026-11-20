import { managerPanelCss } from './styles'
import { onSite, businessTrip, leave } from './status-icons'

const ages = [['30岁以下', 56], ['30–35岁', 40], ['35–40岁', 30], ['40岁以上', 23]] as const
const tenure = [['1–3 年', 56], ['3–5 年', 40], ['5–10 年', 30], ['10 年以上', 23]] as const
const changes = [['入职', 2], ['离职', 0], ['调入', 12], ['调出', 2], ['条线内变动', 7]] as const
const stages = [['简历筛选', 5], ['笔试', 4], ['部门面试', 3], ['实习', 2], ['分管面试', 0], ['终面', 0], ['Offer', 0]] as const
const locations = [
  { name: '广东省', label: '广东', count: 109, x: 166, y: 151, series: 'gd', labelX: 182, labelY: 155 },
  { name: '海南省', label: '海南', count: 89, x: 130, y: 188, series: 'hi', labelX: 86, labelY: 199 },
  { name: '北京市', label: '北京', count: 67, x: 285, y: 32, series: 'bj', labelX: 299, labelY: 32 },
  { name: '上海市', label: '上海', count: 109, x: 303, y: 105, series: 'sh', labelX: 317, labelY: 120 },
  { name: '江苏省', label: '江苏', count: 109, x: 257, y: 78, series: 'js', labelX: 215, labelY: 70 }
]
const departments = [['研究部', 345], ['固定收益交易部', 212], ['固定收益分类资产研究管理部', 105]] as const
const research = '研究部', trading = '固定收益交易部', classified = '固收分类资产研究管理部'
const teamRows = [
  [research, '研究员', '北京', '4 年', '在岗'],
  [trading, '交易员', '广州', '3 年', '在岗'],
  [classified, '研究员', '上海', '2 年', '出差'],
  [research, '研究助理', '南京', '5 年', '在岗'],
  [trading, '交易助理', '广州', '2 年', '休假'],
  [classified, '研究员', '海口', '6 年', '在岗'],
  [research, '研究助理', '北京', '1 年', '出差'],
  [trading, '交易员', '上海', '3 年', '在岗'],
  [classified, '研究员', '广州', '1 年', '在岗'],
  [research, '研究助理', '广州', '2 年', '在岗'],
  [trading, '交易助理', '南京', '2 年', '在岗']
].map((row, index) => ['员工 ' + String(index + 1).padStart(3, '0'), ...row])
const candidateRows = [
  ['宏观研究员', research, '部门面试'],
  ['固收交易员', trading, '笔试'],
  ['研究助理', research, '简历筛选'],
  ['研究实习生', classified, '实习'],
  ['研究员', research, '部门面试']
].map((row, index) => ['候选人 A0' + (index + 1), ...row])

const snapshotSource = '高管驾驶舱 2.0'
const number = (value: number | string, unit = '') =>
  `<span class="manager-value"><strong>${value}</strong><span class="manager-unit">${unit}</span></span>`
const caption = (text: string) => `<p class="manager-caption">${text}</p>`
const section = (text: string) => `<h3 class="manager-section-label manager-caption">${text}</h3>`
const track = (percent: number, color = '', rounded = false) =>
  `<span class="manager-track ${color}${rounded ? ' rounded' : ''}" aria-hidden="true"><span style="--share:${percent}%"></span></span>`

function barList(items: readonly (readonly [string, number])[], scale: number, unit = '', highlight?: (value: number, index: number) => string) {
  return `<dl class="manager-bars">${items.map(([label, value], index) =>
    `<div><dt>${label}</dt><dd>${track(value / scale * 100, highlight?.(value, index))}</dd><dd>${value}${unit && `<span class="manager-unit">${unit}</span>`}</dd></div>`
  ).join('')}</dl>`
}

function table(headings: string[], rows: string[][]) {
  return `<table><thead><tr>${headings.map(text => `<th scope="col">${text}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr>${row.map(text => `<td>${text}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

function hero(label: string, value: string | number, unit: string, period = '') {
  return `<div class="manager-tile manager-hero"><div class="manager-hero-line"><h3>${label}</h3>${period && `<small>${period}</small>`}</div>${number(value, unit)}</div>`
}

function overview() {
  const statuses = [['上岛', onSite], ['出差', businessTrip], ['休假', leave]] as const
  return `<div class="manager-overview">${hero('全公司人数', '1,091', '人', '2024 年')}
    <div>${section('今日人员状态')}<div class="manager-three">${statuses.map(([label, icon]) =>
      `<div class="manager-tile manager-between"><span class="manager-status"><img src="data:image/svg+xml,${encodeURIComponent(icon)}" alt="">${label}</span>${number(23, '人')}</div>`
    ).join('')}</div></div></div>`
}

function residences() {
  const bars = barList(locations.map(({ name, count }) => [name, count]), 109,
    '', (_, i) => 'manager-location-' + locations[i]!.series)
  return `${caption('底稿列出的五个常驻地  ·  人')}<div class="manager-location">
    ${bars}
    <svg viewBox="0 0 357 210" role="img" aria-label="五个常驻地的分布示意">
      <defs><pattern id="location-grid" width="11" height="11" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".65" fill="var(--sherlock-chart-crosshair)" opacity=".42"/></pattern></defs>
      <rect x="3" y="4" width="351" height="194" fill="url(#location-grid)"/>
      <path class="manager-location-lines" d="M49 146Q151 60 320 72 M51 187Q175 75 339 94 M114 194Q161 75 197 16 M161 183Q242 95 272 27 M166 161Q243 131 343 133"/>
      ${locations.map(({ name, label, count, x, y, series, labelX, labelY }) => `<g class="manager-location-${series}">
        <circle cx="${x}" cy="${y}" r="${Math.sqrt(count) * 1.7}" opacity=".17"/>
        <circle cx="${x}" cy="${y}" r="${Math.sqrt(count) * .48}"><title>${name} ${count} 人</title></circle>
        <text x="${labelX}" y="${labelY}">${label}</text></g>`).join('')}
    </svg>
  </div>`
}

function demographics() {
  return `${caption('按底稿列出的年龄与司龄分组')}
    <div class="manager-two manager-demographics">
      <div><h3>年龄分布 <small>· 平均 30 岁</small></h3>${barList(ages, 56)}</div>
      <div><h3>司龄分布 <small>· 平均 3 年</small></h3>${barList(tenure, 56)}</div>
    </div>
    <div class="manager-gender"><h3>性别分布</h3>
      <div class="manager-track" aria-hidden="true"><span style="--share:63.8%"></span><span class="manager-teal" style="--share:36.2%"></span></div>
      <div class="manager-between"><span>男性 63.8%</span><span>女性 36.2%</span></div></div>`
}

function interviewChart(summary = false) {
  const points = stages.map(([, value], i) => ({ x: 40 + i * 80, y: 87 - value * 12, value }))
  const line = points.map(({ x, y }) => x + ',' + y).join(' ')
  return `<figure class="manager-line-chart">
    <figcaption class="manager-caption">${summary ? '面试进度  ·  总简历 23 份' : '各阶段简历数  ·  份'}</figcaption>
    <div class="manager-line-plot"><svg viewBox="0 0 560 106" preserveAspectRatio="none" aria-hidden="true">
      ${[18, 41, 64, 87].map(y => `<path d="M0 ${y}H560" stroke="var(--sherlock-chart-grid)"/>`).join('')}
      <polyline points="${line}" fill="none" stroke="var(--manager-blue)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      ${points.map(({ x, y, value }) => `<circle cx="${x}" cy="${y}" r="3" fill="${value ? 'var(--manager-blue)' : 'var(--sherlock-muted)'}"/>
        `).join('')}
    </svg>
    <div class="manager-stage-values" aria-hidden="true">${points.map(({ value, y }) => `<span style="top:${y - 17}px">${value}</span>`).join('')}</div>
    </div><div class="manager-stage-labels">${stages.map(([label, value]) => `<span aria-label="${label} ${value} 份">${label}</span>`).join('')}</div>
  </figure>`
}

function offerOutcome(label: string, value: number, color: string) {
  const share = value / 27 * 100
  return `<div class="manager-tile">
    <h3 class="manager-legend ${color}">${label}</h3>
    <div class="manager-between">${number(value, '份')}<small>${share.toFixed(1)}%</small></div>
    ${track(share, color, true)}</div>`
}

function organization() {
  // The middle department reports directly to two roles. Other leaves belong
  // to their project group, even when multiple roles have the same name.
  const layers = [
    { title: '团队', y: 9, h: 44, w: 177, nodes: [{ label: '研发部', x: 652, parent: -1 }] },
    { title: '部门', y: 84, h: 41, w: 176, nodes: [
      { label: '投研部', x: 335, parent: 0 }, { label: '研发部', x: 652, parent: 0 }, { label: '创新部', x: 969, parent: 0 }
    ] },
    { title: '项目组', y: 156, h: 35, w: 130, nodes: [
      { label: '投研组', x: 207, parent: 0 }, { label: '直播组', x: 461, parent: 0 },
      { label: '资金组', x: 842, parent: 2 }, { label: '账户组', x: 1096, parent: 2 }
    ] },
    { title: '岗位', y: 230, h: 31, w: 110, nodes: [
      { label: '登记清算岗', x: 144, parent: 0 }, { label: '风险管理岗', x: 271, parent: 0 },
      { label: '系统岗', x: 398, parent: 1 }, { label: '直销清算岗', x: 525, parent: 1, direct: true },
      { label: '系统岗', x: 652, parent: 1, direct: true },
      { label: '资金清算岗', x: 779, parent: 2 }, { label: '系统岗', x: 906, parent: 2 },
      { label: '账户处理岗', x: 1033, parent: 3 }, { label: '系统岗', x: 1160, parent: 3 }
    ] }
  ]
  const connectors = new Set<string>()
  const rows = layers.map(({ title, nodes, y, h, w }, i) => {
    const rectangles = nodes.map((node, index) => {
      if (i) {
        const above = layers[i === 3 && 'direct' in node ? 1 : i - 1]!
        const start = above.nodes[node.parent]!.x, from = above.y + above.h
        const elbow = y - 16
        connectors.add(`M${start} ${from}V${elbow}`)
        connectors.add(`M${start} ${elbow}H${node.x}V${y}`)
      }
      return `<g ${i <= 1 ? `data-sherlock-structure="${i === 0 ? 'primary' : 'node'}"` : ''} class="${['manager-root', 'manager-department'][i] ?? ''}">
        <rect x="${node.x - w / 2}" y="${y}" width="${w}" height="${h}"/>
        <text x="${node.x}" y="${y + (i === 0 ? 19 : h / 2 + 4)}" text-anchor="middle">${node.label}</text>
        ${i === 0 && index === 0 ? `<text class="manager-tree-subtitle" x="${node.x}" y="${y + 36}" text-anchor="middle">总经理</text>` : ''}</g>`
    }).join('')
    return `<text class="manager-tree-label" x="0" y="${y + h / 2 + 4}">${title}</text>${rectangles}`
  })
  return `${caption('投资顾问板块')}<svg viewBox="0 0 1304 285" role="img" aria-label="投资顾问板块四级组织架构">
    <path data-sherlock-structure="connector" class="manager-tree-link" d="${[...connectors].join(' ')}"/>
    ${rows.join('')}</svg>`
}

export const managerPanels = {
  overview: { body: overview() },
  residences: { body: residences() },
  demographics: { body: demographics() },
  changes: { body: caption('按变动类型统计  ·  人') + barList(changes, 12, '', n => n === 12 ? 'manager-gold' : '') },
  interviewSummary: {
    body: `<div class="manager-interview-summary">${interviewChart(true)}<div class="manager-mini-offers">${caption('Offer 情况')}<dl>
      ${([['已发', 27], ['接受', 5], ['拒绝', 12]] as const).map(([label, value]) => `<div class="manager-between"><dt>${label}</dt><dd>${number(value, '份')}</dd></div>`).join('')}
      </dl></div></div>`,
    note: '面试进度与 Offer 反馈分别统计'
  },
  expenses: { body: `<div class="manager-expenses">${caption('当前费用 / 预算  ·  万元')}
    ${['业务招待费', '差旅费'].map(name => `<div class="manager-tile"><div class="manager-between"><h3>${name}</h3><span>${number('56,888')} <small>/ 98,888</small></span></div>${track(56_888 / 98_888 * 100, '', true)}</div>`).join('')}
    <div class="manager-between"><h3>统结用车  ·  年度累计</h3>${number('56,888', '万元')}</div></div>` },
  team: {
    body: caption('人员明细  ·  样例记录') + table(['员工', '部门', '岗位', '办公地点', '司龄', '状态'], teamRows),
    source: '高管驾驶舱 1.0', note: '员工编号、岗位和状态为设计样例'
  },
  tenure: { body: caption('平均司龄 3 年') + barList(tenure, 56, '人') },
  organization: {
    body: organization(), className: 'manager-organization',
    source: '高管驾驶舱 1.0「我的团队」', note: '投资顾问板块示例'
  },
  departments: {
    body: `<div class="manager-departments"><div class="manager-between">${caption('底稿列出的部门')}<small>统一刻度 0–400 人</small></div>
      <div class="manager-three">${departments.map(([name, count]) => `<div class="manager-tile">
        <div class="manager-between"><h3>${name}</h3>${number(count, '人')}</div>${track(count / 400 * 100, '', true)}</div>`).join('')}</div></div>`,
    note: '各部门按底稿统计范围展示'
  },
  interview: {
    body: `<div class="manager-interview">${hero('总简历数量', 23, '份')}
      <div>${section('关键阶段')}<div class="manager-two">${[stages[0], stages[2]].map(([label, count]) =>
        `<div class="manager-tile manager-between"><h3>${label}</h3>${number(count, '份')}</div>`).join('')}</div></div></div>${interviewChart()}`,
    note: '简历总量与各阶段按底稿分别展示'
  },
  offer: { body: `<div class="manager-offer">${hero('已发 Offer', 27, '份')}
    ${section('反馈占已发 Offer')}<div class="manager-two">${offerOutcome('接受', 5, 'manager-teal')}${offerOutcome('拒绝', 12, 'manager-rose')}</div></div>` },
  candidates: {
    body: caption('招聘进度  ·  样例记录') + table(['候选人', '招聘岗位', '部门', '当前阶段'], candidateRows),
    note: '候选人编号和岗位为设计样例'
  },
  stages: { body: caption('底稿各环节人数  ·  人') + barList(stages.slice(0, -1), 5, '', n => n < 5 ? 'manager-gold' : '') }
} satisfies Record<string, { body: string; source?: string; note?: string; className?: string }>

export function managerPanelHtml(panel: keyof typeof managerPanels, minimumHeight: number) {
  const { body, source = snapshotSource, note = '2024 年设计快照', className = '' } =
    managerPanels[panel] as { body: string; source?: string; note?: string; className?: string }
  const metadata = JSON.stringify({ data: { source, note } })
  return `<body data-readable-snapshot><style>${managerPanelCss}</style><script id="sherlock-template-data" type="application/json">${metadata}</script>
    <article class="manager-panel" data-workbench-content-fit style="min-height:${minimumHeight}px"><div class="manager-body ${className}">${body}</div></article></body>`
}
