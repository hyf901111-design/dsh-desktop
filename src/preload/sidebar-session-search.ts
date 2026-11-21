import {projectSkillText} from '../shared/skill-display.mjs'
import {hasSavedSpreadsheetDraft} from '../shared/spreadsheet/session-draft.mjs'
import { boardDialog } from './research-board-dialogs'
import type { ResearchBoardsState } from '../shared/research-boards'
export type SidebarSearchResult = { key: string; title: string; area: 'boards' | 'workspaces'; sessionId?: string; boardId?: string; time: number }
export function sidebarSearchResults(state: ResearchBoardsState, sessions: Record<string, any>, archivedIds: string[], query: string): SidebarSearchResult[] {
  const q = query.trim().toLocaleLowerCase(), results: SidebarSearchResult[] = [], included = new Set<string>()
  const archived = new Set(archivedIds)
  const add = (result: SidebarSearchResult) => {
    result={...result,title:projectSkillText(result.title)}
    const identity = result.sessionId || result.key
    if (included.has(identity)) return
    included.add(identity)
    if (!q || result.title.toLocaleLowerCase().includes(q)) results.push(result)
  }
  for (const board of state.boards.filter(b => b.pinned)) add({ key: 'board:' + board.boardId, title: board.title, area: 'boards', boardId: board.boardId, sessionId: board.localSessionId, time: board.updatedAt ?? board.createdAt })
  for (const favorite of state.favorites.filter(f => f.pinned !== false)) add({ key: 'favorite:' + favorite.favoriteId, title: favorite.title, area: 'boards', sessionId: favorite.sessionId, time: favorite.updatedAt ?? favorite.createdAt })
  for (const [id, session] of Object.entries(sessions)) {
    if (archived.has(id) || session.origin === 'subagent' || (session.blank && !session.title?.trim())) continue
    const title = session.title?.trim() || session.displayTitle?.trim()
    if (session.blank && ['新表格', 'New Spreadsheet'].includes(title) && !hasSavedSpreadsheetDraft(id)) continue
    if (title) add({ key: 'session:' + id, sessionId: id, title, area: 'workspaces', time: session.updatedAt ?? session.createdAt ?? 0 })
  }
  return results.sort((a, b) => b.time - a.time || a.key.localeCompare(b.key))
}
export function showSidebarSessionSearch(doc: Document, source: { results(query: string): SidebarSearchResult[]; subscribe(fn: () => void): () => void; open(result: SidebarSearchResult): Promise<void> }) {
  const ui = boardDialog(doc, '搜索会话')
  ui.dialog.classList.add('srb-session-search')
  ui.dialog.addEventListener('pointerdown', event => {
    const rect = ui.dialog.getBoundingClientRect()
    if (event.target === ui.dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) ui.close()
  })
  const input = doc.createElement('input'), list = doc.createElement('div'), count = doc.createElement('p')
  input.type = 'search'; input.placeholder = '搜索会话…'
  input.setAttribute('aria-label', input.placeholder); input.autocomplete = 'off'
  list.className = 'srb-session-search-results'; count.className = 'srb-session-search-count'; count.role = 'status'
  ui.body.append(input, count, list)
  let active = 0, rows: HTMLButtonElement[] = [], results: SidebarSearchResult[] = [], opening = false
  const select = (index: number, focus = false) => {
    active = index
    rows.forEach((row, i) => { row.dataset.active = String(i === active) })
    if (focus) rows[active]?.focus()
    rows[active]?.scrollIntoView?.({ block: 'nearest' })
  }
  const open = async (result: SidebarSearchResult) => {
    if (opening) return
    opening = true
    const success = await ui.run(async () => { await source.open(result); return true }, '正在打开…')
    opening = false
    if (success) {
      doc.dispatchEvent(new (doc.defaultView!.CustomEvent)('sherlock:search-session-opened', { detail: { sessionId: result.area === 'workspaces' ? result.sessionId : undefined } }))
      ui.close()
    }
  }
  let rendered = ''
  const render = () => {
    const focused = rows.indexOf(doc.activeElement as HTMLButtonElement), previous = results[active]?.key
    const next = source.results(input.value)
    const grouped = [...next.filter(result => result.area === 'boards'), ...next.filter(result => result.area === 'workspaces')]
    const signature = JSON.stringify(grouped)
    if (signature === rendered) return
    rendered = signature; results = grouped; list.replaceChildren()
    let group: HTMLElement | undefined, area: SidebarSearchResult['area'] | undefined
    rows = results.map(result => {
      if (result.area !== area) {
        area = result.area
        group = doc.createElement('section')
        const heading = doc.createElement('h3')
        heading.textContent = area === 'boards' ? '看板区' : '工作区'
        group.setAttribute('aria-label', heading.textContent)
        group.append(heading); list.append(group)
      }
      const row = doc.createElement('button'), title = doc.createElement('span')
      row.type = 'button'; title.dataset.uiPreserve = ''; title.textContent = result.title; title.title = result.title
      row.append(title); row.addEventListener('click', () => void open(result)); group!.append(row); return row
    })
    count.textContent = results.length ? `${results.length} 个会话` : '没有匹配的会话'
    if (!results.length) {
      const empty = doc.createElement('p'); empty.className = 'srb-session-search-empty'; empty.textContent = '没有匹配的会话'; list.append(empty)
    }
    select(Math.max(0, results.findIndex(r => r.key === previous)), focused >= 0)
  }
  input.addEventListener('input', () => { active = 0; render() })
  ui.body.addEventListener('keydown', event => {
    if (event.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); select(Math.max(0, Math.min(rows.length - 1, event.target === input ? active : active + (event.key === 'ArrowDown' ? 1 : -1))), true)
    } else if (event.key === 'Enter' && event.target === input && results[active]) { event.preventDefault(); void open(results[active]!) }
  })
  const off = source.subscribe(render)
  const labels=(doc.defaultView as any)?.__eworkSkillPresentationV1
  const offLabels=labels?.subscribe(render)
  ui.dialog.addEventListener('close', ()=>{off();offLabels?.()}, { once: true })
  render(); input.focus()
  return ui
}
