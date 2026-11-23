import type { SidebarSearchResult } from './sidebar-session-search'

type WorkspaceGroup = { workspaceId: string; title?: string; path: string; sessionIds: string[] }
type SwitcherSource = {
  results(query: string): SidebarSearchResult[]
  workspaces(): WorkspaceGroup[]
  current(): string | null | undefined
  subscribe(refresh: () => void): () => void
  open(result: SidebarSearchResult): Promise<void>
  showError(error: unknown): void
}

function groupSessions(rows: SidebarSearchResult[], workspaces: WorkspaceGroup[], english: boolean) {
  const sessions = new Map(rows.filter(row => row.area === 'workspaces').map(row => [row.sessionId, row]))
  const groups = [{ key: 'boards', title: english ? 'Boards' : '看板区', rows: rows.filter(row => row.area === 'boards') }]
  for (const workspace of workspaces) {
    const members: SidebarSearchResult[] = []
    for (const id of workspace.sessionIds) {
      const row = sessions.get(id)
      if (row) { members.push(row); sessions.delete(id) }
    }
    groups.push({ key: 'workspace:' + workspace.workspaceId, title: workspace.title || workspace.path, rows: members })
  }
  groups.push({ key: 'ungrouped', title: english ? 'Ungrouped' : '未分组', rows: [...sessions.values()] })
  return groups.filter(group => group.rows.length)
}

export function mountSidebarSessionSwitcher(sidebar: HTMLElement, source: SwitcherSource) {
  const doc = sidebar.ownerDocument, win = doc.defaultView!
  const panel = doc.createElement('div'), list = doc.createElement('nav')
  panel.id = 'ework-sidebar-session-switcher'
  panel.popover = 'manual'
  panel.append(list)
  let home: HTMLButtonElement | null = null
  let openTimer = 0, closeTimer = 0, off: (() => void) | undefined, signature = ''
  let opening = false
  const expanded = new Set<string>()
  const english = () => doc.documentElement.dataset.odysseyLocale === 'en'
  const controls = () => [...list.querySelectorAll<HTMLButtonElement>('button')]
  const inside = (node: EventTarget | null) => node instanceof win.Node && (home?.contains(node) || panel.contains(node))
  const button = (text: string, key: string) => {
    const el = doc.createElement('button')
    el.type = 'button'; el.textContent = text; el.dataset.key = key
    return el
  }
  function cancelTimers() { win.clearTimeout(openTimer); win.clearTimeout(closeTimer) }
  function close() {
    cancelTimers()
    off?.(); off = undefined
    panel.remove()
    if (home?.getAttribute('aria-expanded') === 'true') home.setAttribute('aria-expanded', 'false')
    expanded.clear()
    signature = ''
  }
  function render() {
    const en = english(), current = source.current()
    const groups = groupSessions(source.results(''), source.workspaces(), en)
    const next = JSON.stringify([en, current, groups.map(group => [
      group.key, group.title, group.rows.map(row => [row.key, row.title, row.sessionId, row.boardId])
    ]), [...expanded]])
    if (signature === next) return
    signature = next
    const focused = list.contains(doc.activeElement) && doc.activeElement instanceof win.HTMLElement ? doc.activeElement.dataset.key : undefined
    const top = list.scrollTop, fragment = doc.createDocumentFragment()
    list.setAttribute('aria-label', en ? 'Switch conversation' : '切换会话')
    for (const group of groups) {
      const section = doc.createElement('section'), heading = doc.createElement('h3')
      heading.textContent = group.title; heading.dataset.uiPreserve = ''
      section.append(heading)
      for (const row of expanded.has(group.key) ? group.rows : group.rows.slice(0, 5)) {
        const item = button(row.title, row.key)
        item.dataset.uiPreserve = ''; item.title = row.title
        if (row.sessionId && row.sessionId === current) item.setAttribute('aria-current', 'true')
        item.onclick = async event => {
          if (opening) return
          opening = true
          close()
          if (event.detail === 0) home?.focus({ preventScroll: true })
          try {
            await source.open(row)
            doc.dispatchEvent(new win.CustomEvent('sherlock:search-session-opened', { detail: { sessionId: row.area === 'workspaces' ? row.sessionId : undefined } }))
          } catch (error) { source.showError(error) }
          finally { opening = false }
        }
        section.append(item)
      }
      if (group.rows.length > 5) {
        const more = expanded.has(group.key)
        const toggle = button(more ? (en ? 'Show less' : '收起') : (en ? 'Show more' : '展开显示'), 'expand:' + group.key)
        toggle.className = 'ework-switcher-more'
        toggle.setAttribute('aria-expanded', String(more))
        toggle.onclick = () => { if (more) expanded.delete(group.key); else expanded.add(group.key); render() }
        section.append(toggle)
      }
      fragment.append(section)
    }
    if (!groups.length) {
      const empty = doc.createElement('p')
      empty.textContent = en ? 'No conversations yet' : '暂无会话'
      fragment.append(empty)
    }
    list.replaceChildren(fragment)
    if (focused) (controls().find(el => el.dataset.key === focused) ?? list).focus({ preventScroll: true })
    list.scrollTop = top
  }
  function show(focus: boolean) {
    cancelTimers()
    if (!home?.isConnected || sidebar.dataset.dshSidebarWide !== 'false' || opening ||
        doc.body.hasAttribute('data-navigation-editing') || doc.querySelector('dialog:modal')) return
    if (!panel.isConnected) {
      render()
      doc.body.append(panel)
      panel.showPopover()
      home.setAttribute('aria-expanded', 'true')
      off = source.subscribe(render)
    }
    if (focus) (list.querySelector<HTMLElement>('[aria-current]') ?? controls()[0] ?? list).focus()
  }
  function leave(event: PointerEvent) {
    if (inside(event.relatedTarget)) return
    win.clearTimeout(openTimer)
    closeTimer = win.setTimeout(() => {
      if (!panel.contains(doc.activeElement) || !doc.activeElement?.matches(':focus-visible')) close()
    }, 160)
  }
  function enter(event: PointerEvent) {
    if (event.pointerType === 'touch' || event.buttons) return
    cancelTimers()
    if (!panel.isConnected) openTimer = win.setTimeout(() => show(false), 170)
  }
  function keydown(event: KeyboardEvent) {
    if (event.target === home && event.key === 'ArrowDown') {
      event.preventDefault(); show(true); return
    }
    if (!panel.isConnected) return
    if (event.key === 'Escape') {
      const restore = panel.contains(doc.activeElement)
      event.preventDefault(); event.stopPropagation(); close()
      if (restore) home?.focus({ preventScroll: true })
    } else if (panel.contains(event.target as Node) && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const buttons = controls(), index = buttons.indexOf(doc.activeElement as HTMLButtonElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
        Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
      buttons[next]?.focus(); event.preventDefault()
    }
  }
  function bind() {
    const next = sidebar.dataset.dshSidebarWide === 'false' ? sidebar.querySelector<HTMLButtonElement>('button[data-sidebar-home]') : null
    if (next) {
      const hint = english() ? 'Press Down Arrow to switch conversations' : '按向下方向键切换会话'
      if (next.getAttribute('aria-description') !== hint) next.setAttribute('aria-description', hint)
    }
    if (next === home) return
    detach()
    home = next
    if (!home) return
    home.setAttribute('aria-expanded', 'false')
    home.setAttribute('aria-controls', panel.id)
    home.setAttribute('aria-keyshortcuts', 'ArrowDown')
    home.addEventListener('pointerenter', enter)
    home.addEventListener('pointerleave', leave)
    home.addEventListener('click', close)
  }
  function detach() {
    close()
    if (!home) return
    home.removeEventListener('pointerenter', enter)
    home.removeEventListener('pointerleave', leave)
    home.removeEventListener('click', close)
    for (const name of ['aria-controls', 'aria-expanded', 'aria-keyshortcuts', 'aria-description']) home.removeAttribute(name)
    home = null
  }
  list.tabIndex = -1
  panel.addEventListener('pointerenter', cancelTimers)
  panel.addEventListener('pointerleave', leave)
  const lifetime = new win.AbortController(), options = { capture: true, signal: lifetime.signal }
  doc.addEventListener('pointerdown', event => { if (!inside(event.target)) close() }, options)
  doc.addEventListener('focusin', event => { if (!inside(event.target)) close() }, options)
  doc.addEventListener('keydown', keydown, options)
  win.addEventListener('blur', close, { signal: lifetime.signal })
  const observer = new win.MutationObserver(records => {
    bind()
    if (panel.isConnected && records.some(record => record.attributeName === 'data-odyssey-locale')) render()
  })
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-odyssey-locale'] })
  observer.observe(sidebar, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-dsh-sidebar-wide'] })
  bind()
  return () => { observer.disconnect(); lifetime.abort(); detach() }
}
