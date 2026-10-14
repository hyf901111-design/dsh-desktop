import type {
  MemoryBridge,
  MemoryCommand,
  MemoryInput,
  MemoryKind,
  MemoryRecord,
  MemoryScope,
  MemorySnapshot,
  MemorySource
} from '../../shared/memory'
import { memoryStyles } from './style'

type Draft = MemoryInput & {
  id?: string
  expectedRevision?: number
  expiry: string
}
type Filter = 'all' | 'preference' | 'project' | 'candidate'
type Screen = 'records' | 'usage' | 'legacy' | 'project'
const kinds: Record<MemoryKind, string> = {
  preference: '用户偏好',
  background: '项目背景',
  decision: '决策与约束',
  progress: '最近进展'
}
const states = {
  active: '已生效',
  candidate: '待确认',
  disabled: '已停用',
  superseded: '已被替代'
}
const sourceKinds = {
  conversation: '对话',
  manual: '手动保存',
  note: '笔记选区',
  legacy: '旧记忆文件'
}
const errorText = (error: unknown, action: string) => {
  const code = error instanceof Error ? error.message : String(error)
  if (/CONFLICT|REVISION|已更新|最新版本/.test(code))
    return `${action}未完成：内容已被更新，请刷新后检查修改。草稿仍保留。`
  if (/SECURE_STORAGE/.test(code))
    return `${action}未完成：系统安全存储暂不可用，请稍后重试。`
  if (
    /SOURCE|NOT_FOUND|FORBIDDEN|来源.*不可用/.test(code) &&
    action === '查看来源'
  )
    return '来源已删除或暂时无法访问，保存的内容仍可阅读。'
  if (/请先编辑并选择/.test(code))
    return '请先修改这条候选并选择所属项目，再采用。'
  if (/共享对话不能绑定/.test(code))
    return '共享对话不自动使用私人记忆，也不能绑定私人记忆项目。'
  if (/已删除或无权访问/.test(code))
    return '这条记忆已删除或无法访问，请刷新列表。'
  return `${action}未完成，请稍后重试。`
}

/** Native settings own the shell; this module only owns its additional section. */
export function mountMemoryUi(document: Document, bridge: MemoryBridge) {
  const win = document.defaultView!
  const style = document.createElement('style')
  style.dataset.memoryStyle = ''
  style.textContent = memoryStyles
  document.head.append(style)
  let disposed = false,
    identityEpoch = 0,
    readSequence = 0,
    busy = false,
    pendingRefresh = false,
    pendingOpen = false
  let focusPane = false
  let data: MemorySnapshot | undefined,
    page: HTMLElement | undefined,
    root: HTMLElement | undefined
  let sessionOverride: string | undefined,
    explicitSession = false
  let draft: Draft | undefined,
    selectedId: string | undefined,
    screen: Screen = 'records',
    filter: Filter = 'all',
    stateFilter = 'all',
    projectFilter = 'all',
    query = ''
  let projectDefaultApplied = false,
    followSessionProject = true,
    notice = '',
    noticeError = false
  let confirmIds: string[] | undefined
  let confirmRevisions: Record<string, number> = {},
    projectDraft = { name: '', path: '' },
    selectionNeedsProject = false
  const selected = new Set<string>(),
    legacySelected = new Set<string>()
  const mountedNavs = new Set<HTMLElement>()
  const date = (time?: number) =>
    time
      ? new Intl.DateTimeFormat('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }).format(time)
      : '尚未使用'
  const dateValue = (time?: number) =>
    time
      ? `${new Date(time).getFullYear()}-${String(new Date(time).getMonth() + 1).padStart(2, '0')}-${String(new Date(time).getDate()).padStart(2, '0')}`
      : ''
  const currentSession = () =>
    explicitSession
      ? sessionOverride
      : document.documentElement.dataset.srbSelectedSession || undefined
  const currentProject = () =>
    data?.session?.id === currentSession()
      ? data?.session?.projectId
      : undefined
  const node = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string,
    className?: string
  ): HTMLElementTagNameMap[K] => {
    const el = document.createElement(tag)
    if (text !== undefined) el.textContent = text
    if (className) el.className = className
    return el
  }
  const button = (text: string, click: () => void, className = '') => {
    const el = node('button', text, className)
    el.type = 'button'
    el.onclick = click
    return el
  }
  const mutateButton = (text: string, click: () => void, className = '') => {
    const el = button(text, click, className)
    el.dataset.memoryMutate = ''
    el.disabled = busy
    return el
  }
  const input = (label: string, type = 'text') => {
    const el = node('input')
    el.type = type
    el.setAttribute('aria-label', label)
    return el
  }
  const select = (
    label: string,
    options: [string, string][],
    value: string
  ) => {
    const el = node('select')
    el.setAttribute('aria-label', label)
    for (const [id, title] of options) {
      const option = node('option', title)
      option.value = id
      el.append(option)
    }
    el.value = value
    return el
  }
  const labeled = (label: string, control: HTMLElement) => {
    const el = node('label', undefined, 'ew-memory-field')
    el.append(node('span', label), control)
    return el
  }
  const section = (heading: string, className = '') => {
    const el = node('section', undefined, className)
    el.append(node('h2', heading))
    return el
  }
  const projectName = (id?: string) =>
    data?.projects.find((p) => p.id === id)?.name ?? '未指定项目'
  const expired = (row: MemoryRecord) =>
    row.expiresAt !== undefined && row.expiresAt <= Date.now()
  const status = (row: MemoryRecord) =>
    expired(row) && row.status === 'active' ? '已过期' : states[row.status]
  const activeRows = () =>
    data?.rows.filter((r) => r.status === 'active' && !expired(r)) ?? []
  const badge = (text: string) => node('span', text, 'ew-memory-badge')
  const scopeText = (row: MemoryRecord) =>
    row.scope === 'global' ? '全局' : projectName(row.projectId)

  function updateNotice(text = notice, error = noticeError) {
    notice = text
    noticeError = error
    const el = page?.querySelector<HTMLElement>('[data-memory-notice]')
    if (el) {
      el.textContent = text
      el.role = error ? 'alert' : 'status'
      el.hidden = !text
    }
  }
  function setBusy(value: boolean) {
    busy = value
    page?.setAttribute('aria-busy', String(value))
    for (const control of page?.querySelectorAll<
      HTMLInputElement | HTMLButtonElement | HTMLSelectElement
    >('[data-memory-mutate]') ?? [])
      control.disabled = value
  }
  function applySnapshot(next: MemorySnapshot) {
    if (data && data.owner !== next.owner) clearIdentityState()
    // Global commands intentionally return no session projection. Preserve only
    // the previously verified context of the still selected session.
    const session =
      next.session ??
      (data?.session?.id === currentSession() ? data?.session : undefined)
    const legacy = next.legacy ?? data?.legacy
    data = { ...next, session, legacy }
    if (
      (!projectDefaultApplied || followSessionProject) &&
      (!currentSession() || session?.id === currentSession())
    ) {
      projectFilter = session?.projectId ?? 'all'
      projectDefaultApplied = true
    }
    if (selectionNeedsProject && draft) {
      if (session?.projectId) {
        draft.scope = 'project'
        draft.projectId = session.projectId
        draft.kind = 'background'
      }
      selectionNeedsProject = false
    }
    for (const id of selected)
      if (!next.rows.some((r) => r.id === id)) selected.delete(id)
    if (selectedId && !next.rows.some((r) => r.id === selectedId))
      selectedId = undefined
  }
  async function load() {
    if (disposed || !page?.isConnected) return
    if (busy) {
      pendingRefresh = true
      return
    }
    const epoch = identityEpoch,
      sequence = ++readSequence,
      sessionId = currentSession()
    try {
      const next = await bridge.request({ type: 'snapshot', sessionId })
      if (
        disposed ||
        epoch !== identityEpoch ||
        sequence !== readSequence ||
        currentSession() !== sessionId
      )
        return
      applySnapshot(next)
      updateNotice('', false)
      render()
    } catch (error) {
      if (disposed || epoch !== identityEpoch || sequence !== readSequence)
        return
      updateNotice(errorText(error, '读取记忆'), true)
      render()
    }
  }
  async function mutate(
    command: MemoryCommand,
    action: string,
    done?: (next: MemorySnapshot) => void
  ) {
    if (disposed || busy) return
    const epoch = identityEpoch,
      sessionId = currentSession()
    ++readSequence
    setBusy(true)
    updateNotice('', false)
    try {
      const next = await bridge.request(command)
      if (disposed || epoch !== identityEpoch) return
      // A response from another owner cannot repopulate the previous editor.
      if (data && next.owner !== data.owner) {
        resetIdentity()
        return
      }
      applySnapshot(next)
      done?.(next)
      updateNotice(`${action}成功`, false)
      if (currentSession() !== sessionId) pendingRefresh = true
      render()
    } catch (error) {
      if (disposed || epoch !== identityEpoch) return
      updateNotice(errorText(error, action), true)
      render()
    } finally {
      if (!disposed && epoch === identityEpoch) {
        setBusy(false)
        if (pendingRefresh) {
          pendingRefresh = false
          void load()
        }
      }
    }
  }
  function clearIdentityState() {
    data = undefined
    draft = undefined
    selectedId = undefined
    confirmIds = undefined
    selected.clear()
    legacySelected.clear()
    query = ''
    filter = 'all'
    stateFilter = 'all'
    projectFilter = 'all'
    projectDefaultApplied = false
    followSessionProject = true
    screen = 'records'
    notice = ''
    noticeError = false
    confirmRevisions = {}
    projectDraft = { name: '', path: '' }
    selectionNeedsProject = false
  }
  function resetIdentity() {
    identityEpoch++
    readSequence++
    busy = false
    pendingRefresh = false
    explicitSession = false
    sessionOverride = undefined
    clearIdentityState()
    render()
    void load()
  }
  function hide() {
    root?.removeAttribute('data-memory-active')
    root?.querySelector('[data-memory-nav]')?.removeAttribute('aria-current')
    page?.remove()
    page = undefined
    confirmIds = undefined
  }
  function activate(panel: HTMLElement) {
    root = panel
    pendingOpen = false
    panel.removeAttribute('data-account-active')
    panel.querySelector('.sherlock-account-page')?.remove()
    panel.querySelector('[data-account-nav]')?.removeAttribute('aria-current')
    panel.setAttribute('data-memory-active', 'true')
    panel
      .querySelector('[data-memory-nav]')
      ?.setAttribute('aria-current', 'page')
    if (!page?.isConnected) {
      page = node('section', undefined, 'ew-memory-page')
      page.dataset.memoryPage = ''
      page.setAttribute('aria-label', '记忆管理')
      panel.querySelector('.VOzbGW_content')?.append(page)
    }
    render()
    void load()
  }
  function open() {
    const panel = document.querySelector<HTMLElement>('.VOzbGW_panel')
    if (panel) activate(panel)
    else {
      pendingOpen = true
      document.querySelector<HTMLButtonElement>('.VOzbGW_trigger')?.click()
    }
  }
  function reconcile() {
    if (disposed) return
    for (const nav of mountedNavs) if (!nav.isConnected) mountedNavs.delete(nav)
    if (root && !root.isConnected) root = undefined
    if (page && !page.isConnected) {
      page = undefined
      root = undefined
      confirmIds = undefined
    }
    for (const panel of document.querySelectorAll<HTMLElement>(
      '.VOzbGW_panel'
    )) {
      const navList = panel.querySelector('.VOzbGW_navList')
      if (!navList || panel.querySelector('[data-memory-nav]')) continue
      const nav = button('', () => activate(panel), 'VOzbGW_navCell')
      nav.dataset.memoryNav = ''
      nav.setAttribute('aria-label', '记忆')
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      icon.setAttribute('viewBox', '0 0 16 16')
      icon.setAttribute('class', 'VOzbGW_navIcon')
      icon.setAttribute('aria-hidden', 'true')
      icon.setAttribute('fill', 'none')
      icon.setAttribute('stroke', 'currentColor')
      icon.setAttribute('stroke-width', '1.25')
      const shape = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path'
      )
      shape.setAttribute(
        'd',
        'M5.5 2.5A2 2 0 0 0 2 4v1a2 2 0 0 0 0 4v2a2.5 2.5 0 0 0 5 0V4a2 2 0 0 0-1.5-1.5ZM10.5 2.5A2 2 0 0 1 14 4v1a2 2 0 0 1 0 4v2a2.5 2.5 0 0 1-5 0V4a2 2 0 0 1 1.5-1.5ZM3 5h2m-3 4h3m9-4h-2m3 4h-3'
      )
      icon.append(shape)
      nav.append(icon, node('span', '记忆', 'VOzbGW_navLabel'))
      const account = navList.querySelector('[data-account-nav]')
      if (account) account.after(nav)
      else navList.prepend(nav)
      mountedNavs.add(nav)
    }
    if (root?.hasAttribute('data-account-active')) hide()
    if (pendingOpen) {
      const panel = document.querySelector<HTMLElement>('.VOzbGW_panel')
      if (panel) activate(panel)
    }
  }
  function onNavClick(event: Event) {
    const target = event.target as Element | null
    if (target?.closest('[data-memory-nav]')) return
    if (
      target?.closest(
        'nav [data-settings-section-id],nav [data-account-nav],.sherlock-settings-back,.VOzbGW_close'
      )
    )
      hide()
  }
  const sessionChange = () => {
    projectDefaultApplied = false
    followSessionProject = true
    selectedId = undefined
    selected.clear()
    confirmIds = undefined
    readSequence++
    if (page?.isConnected) void load()
  }
  const onSidebarSelection = () => {
    explicitSession = false
    sessionOverride = undefined
    sessionChange()
  }
  const onSession = (event: Event) => {
    const value = (event as CustomEvent<{ sessionId?: string }>).detail
    explicitSession = true
    sessionOverride =
      typeof value?.sessionId === 'string' && value.sessionId
        ? value.sessionId
        : undefined
    sessionChange()
  }
  const onOpen = (event: Event) => {
    const value = (event as CustomEvent<{ sessionId?: string }>).detail
    if (value?.sessionId) {
      explicitSession = true
      sessionOverride = value.sessionId
    }
    open()
  }
  const onSelection = (event: Event) => {
    const value = (
      event as CustomEvent<{
        content?: string
        title?: string
        source?: MemorySource
        sessionId?: string
      }>
    ).detail
    if (typeof value?.content !== 'string' || !value.content.trim()) return
    if (value.sessionId) {
      explicitSession = true
      sessionOverride = value.sessionId
    }
    selectionNeedsProject = data?.session?.id !== currentSession()
    draft = {
      title: value.title ?? '',
      content: value.content,
      kind: currentProject() ? 'background' : 'preference',
      scope: currentProject() ? 'project' : 'global',
      projectId: currentProject(),
      pinned: false,
      expiry: '',
      source: value.source
    }
    selectedId = undefined
    screen = 'records'
    focusPane = true
    open()
  }

  function render() {
    if (!page?.isConnected) return
    const focused = document.activeElement as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
      | null
    const focusLabel =
      page.contains(focused) && focused?.getAttribute('aria-label')
    const selectionStart =
      focused && 'selectionStart' in focused ? focused.selectionStart : null
    page.replaceChildren()
    page.setAttribute('aria-busy', String(busy))
    const heading = node('header', undefined, 'ew-memory-heading'),
      title = node('div')
    title.append(
      node('h1', '记忆'),
      node('p', '记住你的偏好与项目背景，让新对话接得上。')
    )
    heading.append(
      title,
      button('刷新', () => void load(), 'ew-memory-secondary')
    )
    page.append(heading)
    const noticeEl = node('div', undefined, 'ew-memory-notice')
    noticeEl.dataset.memoryNotice = ''
    noticeEl.setAttribute('aria-live', 'polite')
    page.append(noticeEl)
    updateNotice()
    if (!data) {
      page.append(
        node(
          'p',
          noticeError
            ? '记忆暂不可用。原有数据会保留，可稍后刷新。'
            : '正在读取本地记忆…',
          'ew-memory-empty'
        )
      )
      return
    }
    renderSettings()
    renderSummary()
    renderToolbar()
    if (screen === 'usage') renderUsage()
    else if (screen === 'legacy') renderLegacy()
    else if (screen === 'project') renderProjectForm()
    else renderRecords()
    if (confirmIds) renderConfirmation()
    if (focusPane) {
      focusPane = false
      const pane = page.querySelector<HTMLElement>(
        '[data-memory-editor],[data-memory-usage],.ew-memory-project-form,.ew-memory-legacy'
      )
      pane?.scrollIntoView?.({ block: 'start' })
      pane
        ?.querySelector<HTMLElement>('input,button')
        ?.focus({ preventScroll: true })
    }
    if (focusLabel) {
      const next = [
        ...page.querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >('[aria-label]')
      ].find((el) => el.getAttribute('aria-label') === focusLabel)
      next?.focus()
      if (
        next &&
        selectionStart !== null &&
        'setSelectionRange' in next &&
        next.type !== 'checkbox' &&
        next.type !== 'date'
      )
        try {
          next.setSelectionRange(selectionStart, selectionStart)
        } catch {
          /* Select and checkbox controls have no text range. */
        }
    }
  }
  function renderSettings() {
    const controls = section('记忆设置', 'ew-memory-settings')
    const list = node('div', undefined, 'ew-memory-switches')
    const toggle = (
      name: string,
      description: string,
      checked: boolean,
      change: (value: boolean) => void
    ) => {
      const label = node('label', undefined, 'ew-memory-switch-row'),
        text = node('span')
      text.append(node('strong', name), node('small', description))
      const control = input(name, 'checkbox')
      control.checked = checked
      control.dataset.memoryMutate = ''
      control.disabled = busy
      control.onchange = () => change(control.checked)
      label.append(text, control)
      list.append(label)
    }
    toggle(
      '使用已保存记忆',
      '选中的记忆会随请求发送给当前对话模型；更改从下一次请求生效。',
      data!.settings.use,
      (value) => void mutate({ type: 'settings', use: value }, '修改使用设置')
    )
    toggle(
      '自动记住偏好和项目上下文',
      '自动整理会调用当前对话模型；关闭后仍可手动保存。',
      data!.settings.auto,
      (value) =>
        void mutate({ type: 'settings', auto: value }, '修改自动保存设置')
    )
    const sessionId = currentSession(),
      session = data!.session
    if (sessionId && session?.id === sessionId)
      toggle(
        '本次对话不使用也不保存记忆',
        '仅影响当前对话，从下一次请求生效。',
        session.disabled,
        (value) =>
          void mutate(
            { type: 'session', sessionId, disabled: value },
            '修改对话设置'
          )
      )
    else
      list.append(
        node(
          'p',
          '选择一个私人对话后，可设置本次对话的记忆与所属项目。',
          'ew-memory-inline-note'
        )
      )
    controls.append(list)
    if (data!.extraction.state !== 'ready' || data!.extraction.message) {
      const note = node(
        'p',
        data!.extraction.message ||
          (data!.extraction.state === 'running'
            ? '正在整理本轮记忆…'
            : '自动整理暂不可用，可继续手动保存。'),
        'ew-memory-extraction'
      )
      note.role = 'status'
      controls.append(note)
    }
    const project = node('div', undefined, 'ew-memory-project-binding')
    if (sessionId && session?.id === sessionId) {
      const control = select(
        '当前对话所属项目',
        [
          ['', '未绑定项目'],
          ...data!.projects.map((p) => [p.id, p.name] as [string, string])
        ],
        session.projectId ?? ''
      )
      control.dataset.memoryMutate = ''
      control.disabled = busy
      control.onchange = () =>
        void mutate(
          { type: 'bind', sessionId, projectId: control.value || undefined },
          '绑定项目'
        )
      project.append(labeled('所属项目', control))
    }
    project.append(
      button('新建项目', () => {
        screen = 'project'
        focusPane = true
        render()
      }),
      button('本轮使用详情', () => {
        screen = 'usage'
        focusPane = true
        render()
      }),
      button(
        '导入旧记忆',
        () =>
          void mutate({ type: 'legacy-preview' }, '读取旧记忆', () => {
            screen = 'legacy'
            focusPane = true
            legacySelected.clear()
          })
      )
    )
    controls.append(project)
    page!.append(controls)
  }
  function renderSummary() {
    const active = activeRows(),
      stats = node('div', undefined, 'ew-memory-stats')
    for (const [key, label, count] of [
      ['active', '生效记忆', active.length],
      [
        'candidate',
        '待确认',
        data!.rows.filter((r) => r.status === 'candidate').length
      ],
      ['projects', '项目', data!.projects.length]
    ] as const) {
      const card = node('div')
      card.dataset.memoryCount = key
      card.append(node('strong', String(count)), node('span', label))
      stats.append(card)
    }
    page!.append(stats)
    const overview = node('div', undefined, 'ew-memory-overview')
    const preview = (heading: string, rows: MemoryRecord[], empty: string) => {
      const card = section(heading, 'ew-memory-preview')
      if (!rows.length) card.append(node('p', empty, 'ew-memory-muted'))
      for (const row of rows.slice(0, 3)) {
        const entry = node('div', undefined, 'ew-memory-preview-entry')
        entry.append(
          button(row.title, () => showRecord(row)),
          node(
            'p',
            row.content.length > 200
              ? `${row.content.slice(0, 200)}…`
              : row.content
          )
        )
        card.append(entry)
      }
      if (rows.length > 3)
        card.append(node('small', `共 ${rows.length} 条，可在下方查看全部。`))
      return card
    }
    overview.append(
      preview(
        '你的偏好',
        active.filter((r) => r.kind === 'preference' && r.scope === 'global'),
        '尚未保存全局偏好。可手动新增，也可在对话中明确表达长期习惯。'
      )
    )
    const projectId =
      projectFilter !== 'all' && projectFilter !== 'global'
        ? projectFilter
        : currentProject()
    const rows = active.filter(
      (r) => r.scope === 'project' && (!projectId || r.projectId === projectId)
    )
    const projectCard = preview(
      projectId ? `${projectName(projectId)} · 项目概况` : '项目上下文',
      rows,
      '尚无生效项目上下文。绑定项目后，可保存目标、约束与进展。'
    )
    if (projectId) {
      const p = data!.projects.find((p) => p.id === projectId)
      if (p?.path) projectCard.append(node('small', p.path, 'ew-memory-path'))
    }
    overview.append(projectCard)
    page!.append(overview)
  }
  function renderToolbar() {
    const toolbar = node('div', undefined, 'ew-memory-toolbar')
    const search = input('搜索记忆', 'search')
    search.placeholder = '搜索记忆…'
    search.value = query
    search.oninput = () => {
      query = search.value
      if (screen !== 'records') {
        screen = 'records'
        render()
      } else refreshRecords()
    }
    toolbar.append(
      search,
      button('新增记忆', () => startEditor(), 'ew-memory-primary')
    )
    page!.append(toolbar)
    const filters = node('div', undefined, 'ew-memory-filters'),
      tabs = node('div', undefined, 'ew-memory-tabs')
    tabs.setAttribute('aria-label', '记忆分类')
    for (const [key, label] of [
      ['all', '全部'],
      ['preference', '用户偏好'],
      ['project', '项目上下文'],
      ['candidate', '待确认']
    ] as [Filter, string][]) {
      const b = button(label, () => {
        filter = key
        screen = 'records'
        selectedId = undefined
        render()
      })
      b.setAttribute(
        'aria-pressed',
        String(filter === key && screen === 'records')
      )
      tabs.append(b)
    }
    const statusSelect = select(
      '记忆状态',
      [
        ['all', '全部状态'],
        ['active', '已生效'],
        ['candidate', '待确认'],
        ['disabled', '已停用'],
        ['superseded', '已被替代'],
        ['expired', '已过期']
      ],
      stateFilter
    )
    statusSelect.onchange = () => {
      stateFilter = statusSelect.value
      screen = 'records'
      render()
    }
    const projectSelect = select(
      '筛选项目',
      [
        ['all', '所有项目与全局'],
        ['global', '仅全局'],
        ...data!.projects.map((p) => [p.id, p.name] as [string, string])
      ],
      projectFilter
    )
    projectSelect.onchange = () => {
      followSessionProject = false
      projectFilter = projectSelect.value
      screen = 'records'
      selectedId = undefined
      render()
    }
    filters.append(tabs, statusSelect, projectSelect)
    page!.append(filters)
  }
  function filteredRows() {
    const text = query.toLocaleLowerCase().trim()
    return data!.rows
      .filter((row) => {
        if (
          (filter === 'preference' && row.kind !== 'preference') ||
          (filter === 'project' && row.scope !== 'project') ||
          (filter === 'candidate' && row.status !== 'candidate')
        )
          return false
        if (
          stateFilter === 'expired'
            ? !expired(row)
            : stateFilter !== 'all' &&
              (row.status !== stateFilter ||
                (stateFilter === 'active' && expired(row)))
        )
          return false
        if (
          (projectFilter === 'global' && row.scope !== 'global') ||
          (projectFilter !== 'all' &&
            projectFilter !== 'global' &&
            row.scope === 'project' &&
            row.projectId !== projectFilter)
        )
          return false
        return (
          !text ||
          `${row.title} ${row.content} ${scopeText(row)} ${row.sources.map((s) => `${s.title} ${s.excerpt}`).join(' ')}`
            .toLocaleLowerCase()
            .includes(text)
        )
      })
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt
      )
  }
  function refreshRecords() {
    const columns = page?.querySelector('[data-memory-columns]')
    if (columns) {
      columns.remove()
      renderRecords()
    }
  }
  function showRecord(row: MemoryRecord) {
    selectedId = row.id
    draft = undefined
    screen = 'records'
    notice = ''
    render()
    const detail = page?.querySelector<HTMLElement>('[data-memory-detail]')
    detail?.focus({ preventScroll: true })
    detail?.scrollIntoView?.({ block: 'start' })
  }
  function renderRecords() {
    const columns = node('div', undefined, 'ew-memory-columns')
    columns.dataset.memoryColumns = ''
    columns.dataset.detail = String(Boolean(selectedId || draft))
    const list = node('section', undefined, 'ew-memory-list')
    list.setAttribute('aria-label', '已保存记忆')
    const rows = filteredRows()
    const listHeading = node('div', undefined, 'ew-memory-list-heading')
    listHeading.append(node('h2', `记忆列表 · ${rows.length}`))
    if (rows.length) {
      const all = input('选择当前列表', 'checkbox')
      all.checked = rows.every((r) => selected.has(r.id))
      all.onchange = () => {
        for (const row of rows)
          all.checked ? selected.add(row.id) : selected.delete(row.id)
        refreshRecords()
      }
      listHeading.append(labeled('全选', all))
    }
    list.append(listHeading)
    if (selected.size) {
      const bulk = node('div', undefined, 'ew-memory-bulk')
      bulk.append(
        node('span', `已选择 ${selected.size} 条`),
        mutateButton('批量停用', () => runAction([...selected], 'disable')),
        mutateButton('批量删除', () => confirmDelete([...selected])),
        button('取消选择', () => {
          selected.clear()
          refreshRecords()
        })
      )
      list.append(bulk)
    }
    if (!rows.length) {
      const empty = node('div', undefined, 'ew-memory-empty')
      empty.append(
        node('h3', data!.rows.length ? '没有符合筛选的记忆' : '还没有保存记忆'),
        node(
          'p',
          data!.rows.length
            ? '调整搜索、分类或项目筛选即可查看其他内容。'
            : '新增一条真实偏好或项目背景，之后可以随时查看、改正和删除。'
        )
      )
      list.append(empty)
    }
    for (const row of rows) {
      const card = node('article', undefined, 'ew-memory-row')
      card.dataset.memoryRow = row.id
      card.dataset.selected = String(selectedId === row.id)
      const check = input(`选择 ${row.title}`, 'checkbox')
      check.checked = selected.has(row.id)
      check.onchange = () => {
        check.checked ? selected.add(row.id) : selected.delete(row.id)
        refreshRecords()
      }
      const body = node('div', undefined, 'ew-memory-row-body'),
        title = button(row.title, () => showRecord(row), 'ew-memory-row-title')
      title.setAttribute('aria-label', row.title)
      body.append(
        title,
        node(
          'p',
          row.content.length > 360
            ? `${row.content.slice(0, 360)}…`
            : row.content
        )
      )
      const meta = node('div', undefined, 'ew-memory-meta')
      meta.append(
        badge(scopeText(row)),
        badge(status(row)),
        node('span', date(row.updatedAt))
      )
      if (row.pinned) meta.append(badge('置顶'))
      if (row.expiresAt)
        meta.append(node('span', `有效至 ${date(row.expiresAt)}`))
      body.append(meta)
      card.append(check, body)
      list.append(card)
    }
    columns.append(list)
    if (draft) columns.append(renderEditor(draft))
    else if (selectedId) {
      const row = data!.rows.find((r) => r.id === selectedId)
      if (row) columns.append(renderDetail(row))
    } else {
      const empty = node('aside', undefined, 'ew-memory-detail-placeholder')
      empty.append(
        node('span', '选择一条记忆'),
        node('p', '查看完整内容、来源与最近使用情况。')
      )
      columns.append(empty)
    }
    page!.append(columns)
  }
  function renderDetail(row: MemoryRecord) {
    const detail = node('section', undefined, 'ew-memory-detail')
    detail.dataset.memoryDetail = ''
    detail.tabIndex = -1
    detail.setAttribute('aria-label', `${row.title}详情`)
    detail.append(
      button(
        '返回列表',
        () => {
          selectedId = undefined
          render()
        },
        'ew-memory-back'
      ),
      node('h2', row.title)
    )
    const meta = node('div', undefined, 'ew-memory-meta')
    meta.append(
      badge(kinds[row.kind]),
      badge(scopeText(row)),
      badge(status(row))
    )
    detail.append(meta, node('p', row.content, 'ew-memory-full-content'))
    const facts = node('dl', undefined, 'ew-memory-facts')
    const fact = (label: string, value: string) =>
      facts.append(node('dt', label), node('dd', value))
    fact('创建时间', date(row.createdAt))
    fact('更新时间', date(row.updatedAt))
    fact('最后确认', date(row.lastConfirmedAt))
    fact('最近使用', date(row.lastUsedAt))
    fact('有效期', row.expiresAt ? date(row.expiresAt) : '不自动过期')
    fact(
      '修改记录',
      `当前版本 v${row.revision}${row.manualLocked ? ' · 人工修改已锁定' : ''}`
    )
    if (row.pinned) fact('选择优先级', '已置顶；仍遵守项目、有效期与请求预算。')
    detail.append(facts)
    const sources = section('来源', 'ew-memory-sources')
    if (!row.sources.length)
      sources.append(
        node('p', '此条记忆没有可用的来源记录。', 'ew-memory-muted')
      )
    for (const source of row.sources) {
      const card = node('article', undefined, 'ew-memory-source')
      card.append(
        node('strong', source.title || sourceKinds[source.kind]),
        node(
          'small',
          `${sourceKinds[source.kind]} · ${date(source.createdAt)}${source.seq !== undefined ? ` · 消息 ${source.seq}` : ''}`
        ),
        node('blockquote', source.excerpt)
      )
      const b = button('查看来源', () => void openSource(source))
      if (source.kind === 'manual') {
        b.disabled = true
        b.textContent = '管理页手动保存'
      } else if (source.kind === 'legacy') {
        b.disabled = true
        b.textContent = '来源为已导入文件'
      }
      card.append(b)
      sources.append(card)
    }
    detail.append(sources)
    const actions = node('div', undefined, 'ew-memory-actions')
    actions.append(
      button(row.status === 'candidate' ? '修改后采用' : '编辑', () =>
        startEditor(row)
      )
    )
    if (row.status === 'candidate')
      actions.append(
        mutateButton('采用', () => runAction([row.id], 'accept')),
        mutateButton('忽略', () => runAction([row.id], 'ignore'))
      )
    else if (row.status === 'disabled')
      actions.append(mutateButton('启用', () => runAction([row.id], 'enable')))
    else if (row.status === 'active')
      actions.append(mutateButton('停用', () => runAction([row.id], 'disable')))
    actions.append(
      mutateButton('删除', () => confirmDelete([row.id]), 'ew-memory-danger')
    )
    detail.append(actions)
    return detail
  }
  async function openSource(source: MemorySource) {
    const epoch = identityEpoch
    if (!bridge.openSource) {
      updateNotice('来源跳转暂不可用，可在详情中阅读完整来源摘录。', true)
      return
    }
    try {
      await bridge.openSource(source)
    } catch (error) {
      if (!disposed && epoch === identityEpoch)
        updateNotice(errorText(error, '查看来源'), true)
    }
  }
  function startEditor(row?: MemoryRecord) {
    selectionNeedsProject = false
    const projectId =
      currentProject() ||
      (projectFilter !== 'all' && projectFilter !== 'global'
        ? projectFilter
        : undefined)
    draft = row
      ? {
          id: row.id,
          expectedRevision: row.revision,
          title: row.title,
          content: row.content,
          kind: row.kind,
          scope: row.scope,
          projectId: row.projectId,
          pinned: row.pinned,
          expiresAt: row.expiresAt,
          expiry: dateValue(row.expiresAt)
        }
      : {
          title: '',
          content: '',
          kind: projectId ? 'background' : 'preference',
          scope: projectId ? 'project' : 'global',
          projectId,
          pinned: false,
          expiry: ''
        }
    screen = 'records'
    notice = ''
    render()
    page?.querySelector<HTMLElement>('[aria-label="标题"]')?.focus()
    page
      ?.querySelector<HTMLElement>('[data-memory-editor]')
      ?.scrollIntoView?.({ block: 'start' })
  }
  function renderEditor(value: Draft) {
    const form = node('form', undefined, 'ew-memory-detail ew-memory-editor')
    form.dataset.memoryEditor = ''
    form.noValidate = true
    form.append(
      button(
        '返回列表',
        () => {
          draft = undefined
          render()
        },
        'ew-memory-back'
      ),
      node('h2', value.id ? '编辑记忆' : '新增记忆')
    )
    const latest = value.id
      ? data!.rows.find((row) => row.id === value.id)
      : undefined
    if (latest && latest.revision !== value.expectedRevision) {
      const conflict = section(
        `内容已更新为 v${latest.revision}`,
        'ew-memory-conflict'
      )
      conflict.append(
        node(
          'p',
          '草稿仍保留。检查另一处的修改后，再决定是否基于最新版本继续编辑。',
          'ew-memory-muted'
        ),
        node('strong', latest.title),
        node('p', latest.content, 'ew-memory-full-content'),
        button('基于最新版本继续', () => {
          value.expectedRevision = latest.revision
          updateNotice('已保留草稿，保存将更新上方展示的最新版本。', false)
          render()
        })
      )
      form.append(conflict)
    } else if (value.id && !latest) {
      form.append(
        node(
          'p',
          '这条记忆已删除或不再可访问。草稿仍保留，可复制后另行新增。',
          'ew-memory-conflict'
        )
      )
    }
    const title = input('标题')
    title.value = value.title
    title.maxLength = 120
    title.required = true
    title.oninput = () => (value.title = title.value)
    const content = node('textarea')
    content.setAttribute('aria-label', '内容')
    content.value = value.content
    content.rows = 7
    content.required = true
    content.oninput = () => {
      value.content = content.value
      counter.textContent = `${content.value.length} / 600 字`
    }
    const counter = node(
      'small',
      `${value.content.length} / 600 字`,
      'ew-memory-muted'
    )
    const kind = select(
      '分类',
      Object.entries(kinds) as [MemoryKind, string][],
      value.kind
    )
    kind.onchange = () => {
      value.kind = kind.value as MemoryKind
      if (value.kind === 'progress' && !value.expiry) {
        value.expiry = dateValue(Date.now() + 7 * 86400000)
        expiry.value = value.expiry
      }
    }
    const scope = select(
      '作用范围',
      [
        ['global', '全局'],
        ['project', '项目']
      ],
      value.scope
    )
    const project = select(
      '所属项目',
      [
        ['', '选择项目'],
        ...data!.projects.map((p) => [p.id, p.name] as [string, string])
      ],
      value.projectId ?? ''
    )
    project.onchange = () => (value.projectId = project.value || undefined)
    const projectField = labeled('所属项目', project)
    projectField.hidden = value.scope !== 'project'
    scope.onchange = () => {
      selectionNeedsProject = false
      value.scope = scope.value as MemoryScope
      projectField.hidden = value.scope !== 'project'
    }
    const expiry = input('有效期', 'date')
    expiry.value = value.expiry
    expiry.oninput = () => (value.expiry = expiry.value)
    const pin = input('置顶', 'checkbox')
    pin.checked = Boolean(value.pinned)
    pin.onchange = () => (value.pinned = pin.checked)
    form.append(
      labeled('标题', title),
      labeled('内容', content),
      counter,
      labeled('分类', kind),
      labeled('作用范围', scope),
      projectField,
      labeled('有效期', expiry),
      node(
        'small',
        '留空表示不自动过期；最近进展建议 7 天。',
        'ew-memory-muted'
      ),
      labeled('置顶', pin)
    )
    if (value.source) {
      const source = node('div', undefined, 'ew-memory-source')
      source.append(
        node('strong', `来自 ${value.source.title}`),
        node('blockquote', value.source.excerpt)
      )
      form.append(source)
    }
    form.append(
      node(
        'p',
        '保存后作为人工确认的记忆，自动整理不会覆盖你的修改。',
        'ew-memory-inline-note'
      )
    )
    const actions = node('div', undefined, 'ew-memory-actions'),
      save = mutateButton('保存记忆', () => {}, 'ew-memory-primary')
    save.type = 'submit'
    actions.append(
      save,
      button('取消编辑', () => {
        draft = undefined
        render()
      })
    )
    form.append(actions)
    form.onsubmit = (event) => {
      event.preventDefault()
      if (busy) return
      if (!value.title.trim() || !value.content.trim()) {
        updateNotice('请填写标题和内容。', true)
        ;(!value.title.trim() ? title : content).focus()
        return
      }
      if (value.content.trim().length > 600) {
        updateNotice(
          '内容超过 600 字，请精简或拆分成独立记忆；输入仍保留。',
          true
        )
        content.focus()
        return
      }
      if (value.scope === 'project' && !value.projectId) {
        updateNotice('请选择所属项目，或改为全局范围。', true)
        project.focus()
        return
      }
      const expiresAt = value.expiry
        ? new Date(`${value.expiry}T23:59:59`).getTime()
        : undefined
      if (expiresAt !== undefined && !Number.isFinite(expiresAt)) {
        updateNotice('请输入有效的日期。', true)
        return
      }
      const inputValue: MemoryInput = {
        title: value.title.trim(),
        content: value.content.trim(),
        kind: value.kind,
        scope: value.scope,
        projectId: value.scope === 'project' ? value.projectId : undefined,
        pinned: value.pinned,
        expiresAt,
        source: value.source
      }
      const submittedDraft=JSON.stringify(value)
      void mutate(
        {
          type: 'save',
          id: value.id,
          expectedRevision: value.expectedRevision,
          input: inputValue
        },
        '保存记忆',
        (next) => {
          if (draft === value) {
            const saved=next.rows.find(r=>r.id===value.id||(!value.id&&r.title===inputValue.title&&r.content===inputValue.content&&r.scope===inputValue.scope&&r.projectId===inputValue.projectId))
            if(JSON.stringify(value)!==submittedDraft){if(saved){value.id=saved.id;value.expectedRevision=saved.revision}return}
            draft = undefined
            selectedId =
              value.id ??
              next.rows.find(
                (r) =>
                  r.title === inputValue.title &&
                  r.content === inputValue.content &&
                  r.scope === inputValue.scope &&
                  r.projectId === inputValue.projectId
              )?.id
          }
        }
      )
    }
    return form
  }
  function confirmDelete(ids: string[]) {
    confirmIds = ids
    confirmRevisions = Object.fromEntries(
      data!.rows
        .filter((r) => ids.includes(r.id))
        .map((r) => [r.id, r.revision])
    )
    render()
  }
  function runAction(
    ids: string[],
    action: 'delete' | 'disable' | 'enable' | 'accept' | 'ignore'
  ) {
    const expectedRevisions =
      action === 'delete'
        ? confirmRevisions
        : Object.fromEntries(
            data!.rows
              .filter((r) => ids.includes(r.id))
              .map((r) => [r.id, r.revision])
          )
    const labels = {
      delete: '删除记忆',
      disable: '停用记忆',
      enable: '启用记忆',
      accept: '采用候选',
      ignore: '忽略候选'
    }
    void mutate(
      { type: 'action', ids, action, expectedRevisions },
      labels[action],
      () => {
        if (action === 'delete' || action === 'ignore') {
          confirmIds = undefined
          for (const id of ids) selected.delete(id)
          if (selectedId && ids.includes(selectedId)) selectedId = undefined
        }
      }
    )
  }
  function renderConfirmation() {
    const overlay = node('div', undefined, 'ew-memory-modal'),
      dialog = node('section', undefined, 'ew-memory-confirm')
    dialog.dataset.memoryConfirm = ''
    dialog.role = 'dialog'
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-label', '删除记忆确认')
    dialog.append(
      node('h2', `删除 ${confirmIds!.length} 条记忆？`),
      node(
        'p',
        '后续对话不再使用这些长期记忆。原对话中的文字会保留。删除后无法恢复。'
      )
    )
    if (noticeError) {
      const error = node('p', notice, 'ew-memory-notice')
      error.role = 'alert'
      dialog.append(error)
    }
    const actions = node('div', undefined, 'ew-memory-actions')
    actions.append(
      button('取消删除', () => {
        confirmIds = undefined
        render()
      }),
      mutateButton(
        '确认删除',
        () => runAction(confirmIds!, 'delete'),
        'ew-memory-danger'
      )
    )
    dialog.append(actions)
    overlay.append(dialog)
    page!.append(overlay)
    dialog.querySelector<HTMLButtonElement>('button')?.focus()
  }
  function renderUsage() {
    const usage = section('本轮使用详情', 'ew-memory-usage')
    usage.dataset.memoryUsage = ''
    usage.append(
      button('返回记忆列表', () => {
        screen = 'records'
        render()
      })
    )
    const sessionId = currentSession(),
      usages = data!.usages
        .filter((u) => !sessionId || u.sessionId === sessionId)
        .sort((a, b) => b.createdAt - a.createdAt)
    if (!usages.length)
      usage.append(
        node(
          'p',
          '尚无记忆使用记录。真实模型请求选择记忆后，会在这里显示条目、版本与使用原因。',
          'ew-memory-empty'
        )
      )
    for (const item of usages.slice(0, 20)) {
      const group = section(
        `${date(item.createdAt)} · 使用了 ${item.entries.length} 条记忆`,
        'ew-memory-usage-group'
      )
      for (const entry of item.entries) {
        const row = data!.rows.find((r) => r.id === entry.id),
          card = node('article', undefined, 'ew-memory-source')
        if (!row) {
          card.append(
            node('strong', '该记忆已删除'),
            node('small', `当时版本 v${entry.revision}`)
          )
        } else {
          card.append(
            button(row.title, () => showRecord(row)),
            node(
              'small',
              row.revision === entry.revision
                ? `版本 v${entry.revision}`
                : `现已更新 · 当时 v${entry.revision}，当前 v${row.revision}`
            ),
            node('p', entry.reason),
            node('p', row.content, 'ew-memory-full-content')
          )
          if (row.revision !== entry.revision)
            card.append(
              node('small', '此处为当前内容，使用记录仅保留当时的条目与版本。')
            )
        }
        group.append(card)
      }
      usage.append(group)
    }
    page!.append(usage)
  }
  function renderProjectForm() {
    const form = node('form', undefined, 'ew-memory-project-form')
    form.noValidate = true
    form.append(
      node('h2', '新建项目'),
      node(
        'p',
        '没有工作区目录的笔记与对话，也可以绑定同一项目。',
        'ew-memory-muted'
      )
    )
    const name = input('项目名称'),
      path = input('工作区目录')
    name.required = true
    path.placeholder = '可选，例如 /Users/…/project'
    name.value = projectDraft.name
    path.value = projectDraft.path
    name.oninput = () => (projectDraft.name = name.value)
    path.oninput = () => (projectDraft.path = path.value)
    form.append(labeled('项目名称', name), labeled('工作区目录', path))
    const save = mutateButton('创建项目', () => {}, 'ew-memory-primary')
    save.type = 'submit'
    form.append(
      save,
      button('取消', () => {
        screen = 'records'
        render()
      })
    )
    form.onsubmit = (event) => {
      event.preventDefault()
      if (!name.value.trim()) {
        updateNotice('请填写项目名称。', true)
        name.focus()
        return
      }
      void mutate(
        {
          type: 'project',
          name: name.value.trim(),
          path: path.value.trim() || undefined,
          sessionId: currentSession()
        },
        '创建项目',
        () => {
          screen = 'records'
          projectDefaultApplied = false
          projectDraft = { name: '', path: '' }
        }
      )
    }
    page!.append(form)
  }
  function renderLegacy() {
    const legacy = section('导入旧记忆', 'ew-memory-legacy')
    legacy.append(
      button('返回记忆列表', () => {
        screen = 'records'
        render()
      }),
      node(
        'p',
        '旧文件不会自动生效；勾选导入后进入待确认，原文件保持原样。',
        'ew-memory-muted'
      )
    )
    const items = data!.legacy ?? []
    if (!items.length)
      legacy.append(node('p', '没有可导入的旧记忆文件。', 'ew-memory-empty'))
    for (const item of items) {
      const card = node('article', undefined, 'ew-memory-source')
      const check = input(`导入 ${item.title}`, 'checkbox')
      check.checked = legacySelected.has(item.id)
      check.onchange = () =>
        check.checked
          ? legacySelected.add(item.id)
          : legacySelected.delete(item.id)
      card.append(
        labeled(item.title, check),
        node('small', date(item.createdAt)),
        node('p', item.content, 'ew-memory-full-content')
      )
      legacy.append(card)
    }
    const project = select(
      '导入所属项目',
      [
        ['', '待指定项目'],
        ...data!.projects.map((p) => [p.id, p.name] as [string, string])
      ],
      currentProject() ?? ''
    )
    legacy.append(
      labeled('建议项目', project),
      mutateButton(
        '导入所选',
        () => {
          if (!legacySelected.size) {
            updateNotice('请先选择要导入的文件。', true)
            return
          }
          void mutate(
            {
              type: 'import-legacy',
              ids: [...legacySelected],
              projectId: project.value || undefined
            },
            '导入旧记忆',
            () => {
              screen = 'records'
              filter = 'candidate'
              projectFilter = 'all'
              legacySelected.clear()
            }
          )
        },
        'ew-memory-primary'
      )
    )
    page!.append(legacy)
  }
  function onKeydown(event: KeyboardEvent) {
    if (!page?.isConnected) return
    const dialog = page.querySelector<HTMLElement>('[data-memory-confirm]')
    if (dialog && event.key === 'Tab') {
      const items = [
          ...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        ],
        first = items[0],
        last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
      return
    }
    if (event.key === 'Escape' && (dialog || draft)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (busy) return
      if (dialog) confirmIds = undefined
      else draft = undefined
      render()
    }
  }
  document.addEventListener('click', onNavClick, true)
  document.addEventListener('keydown', onKeydown, true)
  document.addEventListener('sherlock-sidebar-selection', onSidebarSelection)
  document.addEventListener('sherlock:memory-session', onSession)
  document.addEventListener('sherlock:memory-open', onOpen)
  document.addEventListener('sherlock:memory-save-selection', onSelection)
  const observer = new win.MutationObserver(reconcile)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-account-active']
  })
  const unsubscribe = bridge.subscribe?.(() => {
    if (page?.isConnected) void load()
  })
  reconcile()
  function dispose() {
    if (disposed) return
    disposed = true
    identityEpoch++
    readSequence++
    observer.disconnect()
    unsubscribe?.()
    hide()
    style.remove()
    for (const nav of mountedNavs) nav.remove()
    document.removeEventListener('click', onNavClick, true)
    document.removeEventListener('keydown', onKeydown, true)
    document.removeEventListener(
      'sherlock-sidebar-selection',
      onSidebarSelection
    )
    document.removeEventListener('sherlock:memory-session', onSession)
    document.removeEventListener('sherlock:memory-open', onOpen)
    document.removeEventListener('sherlock:memory-save-selection', onSelection)
    clearIdentityState()
  }
  return { resetIdentity, dispose }
}
