import { boardDialog } from './research-board-dialogs'
import type { ResearchBoardsState } from '../shared/research-boards'
export type SidebarSearchResult = { key: string; title: string; area: 'boards' | 'workspaces'; sessionId?: string; boardId?: string; time: number }
export function sidebarSearchResults(state: ResearchBoardsState, sessions: Record<string, any>, archivedIds: string[], query: string): SidebarSearchResult[] {
  const q = query.trim().toLocaleLowerCase(), results: SidebarSearchResult[] = [], included = new Set<string>()
  const archived = new Set(archivedIds)
  const add = (result: SidebarSearchResult) => {
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
    if (title) add({ key: 'session:' + id, sessionId: id, title, area: 'workspaces', time: session.updatedAt ?? session.createdAt ?? 0 })
  }
  return results.sort((a, b) => b.time - a.time || a.key.localeCompare(b.key))
}
export function showSidebarSessionSearch(doc: Document, source: { results(query: string): SidebarSearchResult[]; subscribe(fn: () => void): () => void; open(result: SidebarSearchResult): Promise<void> }) {
  const en = doc.documentElement.lang.toLowerCase().startsWith('en')
  const ui = boardDialog(doc, en ? 'Search sessions' : '搜索会话')
  ui.dialog.classList.add('srb-session-search')
  ui.dialog.querySelector('.srb-close')?.setAttribute('aria-label', en ? 'Close' : '关闭')
  const input = doc.createElement('input'), list = doc.createElement('div'), count = doc.createElement('p')
  input.type = 'search'; input.placeholder = en ? 'Search board and workspace session titles…' : '搜索看板区和工作区的会话标题…'
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
    const success = await ui.run(async () => { await source.open(result); return true }, en ? 'Opening…' : '正在打开…')
    opening = false
    if (success) ui.close()
  }
  const render = () => {
    const focused = rows.indexOf(doc.activeElement as HTMLButtonElement), previous = results[active]?.key
    results = source.results(input.value); list.replaceChildren()
    rows = results.map(result => {
      const row = doc.createElement('button'), title = doc.createElement('span'), area = doc.createElement('small')
      row.type = 'button'; title.textContent = result.title; row.title = result.title
      area.textContent = result.area === 'boards' ? (en ? 'Boards' : '看板区') : (en ? 'Workspaces' : '工作区')
      row.append(title, area); row.addEventListener('click', () => void open(result)); list.append(row); return row
    })
    count.textContent = results.length ? (en ? `${results.length} sessions` : `${results.length} 个会话`) : (en ? 'No matching sessions' : '没有匹配的会话')
    select(Math.max(0, results.findIndex(r => r.key === previous)), focused >= 0)
  }
  input.addEventListener('input', () => { active = 0; render() })
  ui.body.addEventListener('keydown', event => {
    if (event.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); select(Math.max(0, Math.min(rows.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1))), true)
    } else if (event.key === 'Enter' && event.target === input && results[active]) { event.preventDefault(); void open(results[active]!) }
  })
  const off = source.subscribe(render)
  ui.dialog.addEventListener('close', off, { once: true })
  render(); input.focus()
  return ui
}
