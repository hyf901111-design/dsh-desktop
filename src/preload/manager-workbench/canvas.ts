import { boardTabsLayout, type BoardTabsSpec } from '../../../packages/dsh-research-task-runtime/board-tabs-contract.js'
import { createResearchGrid } from '../../../packages/dsh-research-task-runtime/research-grid.js'
import { managerPanelHtml, managerPanels } from './content'

export const managerWorkbenchTitle = '管理者工作台'

type Cell = readonly [x: number, y: number, width: number, height: number]
type Card = readonly [id: string, title: string, panel: keyof typeof managerPanels, cell: Cell]
type Page = { id: string; name: string; cards: readonly Card[] }

const pages: readonly Page[] = [
  { id: 'cockpit', name: '驾驶舱', cards: [
    ['people', '人员总览', 'overview', [0, 0, 40, 5]],
    ['residences', '常驻地分布', 'residences', [0, 5, 23, 10]],
    ['demographics', '人员概况', 'demographics', [23, 5, 17, 10]],
    ['changes', '人员变动', 'changes', [0, 15, 10, 8]],
    ['interview-summary', '面试进度与 Offer', 'interviewSummary', [10, 15, 18, 8]],
    ['expenses', '费用与预算', 'expenses', [28, 15, 12, 8]]
  ] },
  { id: 'team', name: '我的团队', cards: [
    ['team-overview', '团队人数', 'overview', [0, 0, 40, 5]],
    ['team-roster', '我的团队 · 列表', 'team', [0, 5, 27, 16]],
    ['team-changes', '人员变动', 'changes', [27, 5, 13, 8]],
    ['team-tenure', '司龄分布', 'tenure', [27, 13, 13, 8]]
  ] },
  { id: 'organization', name: '组织架构', cards: [
    ['organization', '我的团队 · 架构图', 'organization', [0, 0, 40, 13]],
    ['department-count', '部门人数 · 驾驶舱统计', 'departments', [0, 13, 40, 6]]
  ] },
  { id: 'hiring', name: '易招聘', cards: [
    ['interview', '面试进度', 'interview', [0, 0, 25, 10]],
    ['offer', 'Offer 情况', 'offer', [25, 0, 15, 10]],
    ['candidates', '候选人明细', 'candidates', [0, 10, 25, 9]],
    ['stages', '阶段人数', 'stages', [25, 10, 15, 9]]
  ] }
]

const grid = createResearchGrid()
const design = grid.metrics(1360)
// The native title, source footer and iframe insets sit outside the card body.
const componentChrome = 76
function managerCardHtml(panel: keyof typeof managerPanels, rows: number) {
  return managerPanelHtml(panel, Math.round(rows * design.rowStep - design.gap - componentChrome))
}

// Length and FNV-1a of the exact default HTML from the three shipped templates.
const legacyCardSignatures: Readonly<Record<string, readonly string[]>> = {
  people: ['14044:c81ba55f', '14632:1d3e0926', '18742:51208daa'],
  residences: ['12024:5def6178', '12613:aa0cce73', '73722:be73d1d2'],
  demographics: ['11136:bef7c177', '11725:1e40ac4e', '15940:36ef0a82'],
  changes: ['10196:77902e7b', '10785:82fedb8', '15223:75c9fb42'],
  'interview-summary': ['11722:c64b75ed', '12311:bbc67dc2', '16442:78ffe5ff'],
  expenses: ['10299:694465d4', '10888:56d359ed', '15106:a7f68825'],
  'team-overview': ['14044:c81ba55f', '14632:1d3e0926', '18742:51208daa'],
  'team-roster': ['10608:efd2c1cd', '11197:6aae69af', '15900:3dbf5bf8'],
  'team-changes': ['10196:77902e7b', '10785:82fedb8', '15223:75c9fb42'],
  'team-tenure': ['10202:be5b629', '10791:f7f221f2', '14916:6ea16f71'],
  organization: ['12993:d00a427b', '13582:d1aef57d', '18959:82873c99'],
  'department-count': ['10436:8348dfc', '11025:957dafbf', '15135:85201c73'],
  interview: ['11765:d902d1e3', '12354:e8b0de56', '16485:81af99bf'],
  offer: ['10457:afe7c06a', '11046:7d3d4ebd', '15146:5b88925b'],
  candidates: ['9941:4928608f', '10530:ea96d990', '14903:9b4679e5'],
  stages: ['10326:845d827d', '10915:edab2f8e', '15025:282ead3a']
}
const cards = new Map(pages.flatMap(page => page.cards.map(card => [card[0], card] as const)))

export function upgradeManagerWorkbenchArtifacts<T extends { id: string; containerSpec?: { type: string; html?: string } }>(
  sessionId: string, artifacts: T[]
): T[] {
  const prefix = 'manager:' + sessionId + ':'
  return artifacts.map(artifact => {
    const spec = artifact.containerSpec
    if (!artifact.id.startsWith(prefix) || spec?.type !== 'html' || typeof spec.html !== 'string') return artifact
    const slug = artifact.id.slice(prefix.length)
    const card = cards.get(slug)
    if (!card) return artifact
    const signatures = legacyCardSignatures[slug]!
    const html = spec.html.trim()
    if (!signatures.some(signature => signature.startsWith(html.length + ':'))) return artifact
    let digest = 2166136261
    for (let i = 0; i < html.length; i++) digest = Math.imul(digest ^ html.charCodeAt(i), 16777619)
    if (!signatures.includes(html.length + ':' + (digest >>> 0).toString(16))) return artifact
    return { ...artifact, containerSpec: { ...spec, html: managerCardHtml(card[2], card[3][3]) } }
  })
}

export function createManagerWorkbenchCanvas(sessionId: string) {
  const idFor = (slug: string) => 'manager:' + sessionId + ':' + slug
  const spec: BoardTabsSpec = {
    version: 1, type: 'board-tabs', title: '页签', revision: 0, orientation: 'horizontal',
    tabs: pages.map(page => ({ id: page.id, name: page.name, nodeIds: page.cards.map(card => idFor(card[0])) }))
  }
  const width = 1000
  const area = boardTabsLayout(spec, width)
  const metrics = grid.metrics(area.width)
  const completeNode = (id: string, title: string) => ({
    id, messageId: id, kind: 'generated-container', title,
    excerpt: title, containerPrompt: title + ' · 管理者工作台设计快照',
    generationStatus: 'completed', generationLastSeq: 0, refreshMinutes: 0,
    sizeMode: 'manual'
  })
  return {
    files: [],
    artifacts: [
      { ...completeNode(idFor('tabs'), spec.title), x: width / 2, y: 29, width: width - 24, height: 34, containerSpec: spec },
      ...pages.flatMap(page => page.cards.map(([slug, title, panel, [column, row, columns, rows]]) => {
        const w = columns * metrics.step - metrics.gap, h = rows * metrics.rowStep - metrics.gap
        return {
          ...completeNode(idFor(slug), title),
          x: area.left + metrics.inset + column * metrics.step + w / 2,
          y: area.top + metrics.inset + row * metrics.rowStep + h / 2,
          width: w, height: h,
          containerSpec: { version: 1, type: 'html', title, html: managerCardHtml(panel, rows) }
        }
      }))
    ]
  }
}
