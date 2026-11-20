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

export function createManagerWorkbenchCanvas(sessionId: string) {
  const idFor = (slug: string) => 'manager:' + sessionId + ':' + slug
  const spec: BoardTabsSpec = {
    version: 1, type: 'board-tabs', title: '页签', revision: 0, orientation: 'horizontal',
    tabs: pages.map(page => ({ id: page.id, name: page.name, nodeIds: page.cards.map(card => idFor(card[0])) }))
  }
  const width = 1000
  const area = boardTabsLayout(spec, width)
  const grid = createResearchGrid()
  const metrics = grid.metrics(area.width)
  const design = grid.metrics(1360)
  // The native title, source footer and iframe insets sit outside the card body.
  const componentChrome = 76
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
          containerSpec: { version: 1, type: 'html', title, html: managerPanelHtml(panel, Math.round(rows * design.rowStep - design.gap - componentChrome)) }
        }
      }))
    ]
  }
}
