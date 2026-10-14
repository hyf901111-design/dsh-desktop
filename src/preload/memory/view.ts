import type {
  MemoryBridge,
  MemoryInput,
  MemorySnapshot,
  MemorySource
} from '../../shared/memory'
import { memoryStyles } from './style'

type Selection = {
  content?: string
  title?: string
  source?: MemorySource
  sessionId?: string
}

/** Adds one ordinary settings section without replacing the native settings tree. */
export function mountMemoryUi(document: Document, bridge: MemoryBridge) {
  const win = document.defaultView!
  const style = document.createElement('style')
  style.dataset.memoryStyle = ''
  style.textContent = memoryStyles
  document.head.append(style)
  let disposed = false,
    identityEpoch = 0,
    readSequence = 0,
    pendingOpen = false
  let data: MemorySnapshot | undefined,
    root: HTMLElement | undefined,
    page: HTMLElement | undefined
  let sessionOverride: string | undefined,
    explicitSession = false
  let settingPending: boolean | undefined,
    directoryPending = false,
    refreshPending = false
  let notice = '',
    noticeError = false,
    selectionQueue = Promise.resolve()
  let toast: HTMLElement | undefined, toastTimer: number | undefined
  const navs = new Set<HTMLElement>()
  const currentSession = () =>
    explicitSession
      ? sessionOverride
      : document.documentElement.dataset.srbSelectedSession || undefined
  const current = (epoch: number) => !disposed && epoch === identityEpoch
  const node = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string,
    className?: string
  ): HTMLElementTagNameMap[K] => {
    const element = document.createElement(tag)
    if (text !== undefined) element.textContent = text
    if (className) element.className = className
    return element
  }
  const button = (label: string, click: () => void, className = '') => {
    const element = node('button', label, className)
    element.type = 'button'
    element.onclick = click
    return element
  }
  const icon = (kind: 'memory' | 'folder' | 'arrow') => {
    const element = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    )
    element.setAttribute('viewBox', '0 0 24 24')
    element.setAttribute('aria-hidden', 'true')
    element.setAttribute('fill', 'none')
    element.setAttribute('stroke', 'currentColor')
    element.setAttribute('stroke-width', '1.5')
    element.setAttribute('stroke-linecap', 'round')
    element.setAttribute('stroke-linejoin', 'round')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute(
      'd',
      kind === 'folder'
        ? 'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'
        : kind === 'arrow'
          ? 'm9 6 6 6-6 6'
          : 'M8 4a3 3 0 0 0-5 2v2a3 3 0 0 0 0 6v3a4 4 0 0 0 8 0V6a3 3 0 0 0-3-2Zm8 0a3 3 0 0 1 5 2v2a3 3 0 0 1 0 6v3a4 4 0 0 1-8 0V6a3 3 0 0 1 3-2ZM4 8h3m-4 6h4m13-6h-3m4 6h-4'
    )
    element.append(path)
    return element
  }
  const date = (time: number) =>
    new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(time)

  function setNotice(text = '', error = false) {
    notice = text
    noticeError = error
    const element = page?.querySelector<HTMLElement>('[data-memory-notice]')
    if (element) {
      element.textContent = text
      element.role = error ? 'alert' : 'status'
      element.hidden = !text
    }
  }
  function clearToast() {
    if (toastTimer !== undefined) win.clearTimeout(toastTimer)
    toastTimer = undefined
    toast?.remove()
    toast = undefined
  }
  function showToast(text: string, error = false) {
    clearToast()
    toast = node('div', text, 'ew-memory-toast')
    toast.dataset.memoryToast = ''
    toast.role = error ? 'alert' : 'status'
    toast.setAttribute('aria-live', 'polite')
    document.body.append(toast)
    toastTimer = win.setTimeout(clearToast, 5000)
  }
  function accept(next: MemorySnapshot, epoch: number) {
    if (!current(epoch)) return false
    if (data && data.owner !== next.owner) {
      resetIdentity()
      return false
    }
    if (data && next.revision < data.revision) return false
    const session =
      next.session ??
      (data?.session?.id === currentSession() ? data?.session : undefined)
    data = { ...next, session }
    return true
  }
  async function load() {
    if (disposed || !page?.isConnected) return
    if (settingPending !== undefined) {
      refreshPending = true
      return
    }
    const epoch = identityEpoch,
      sequence = ++readSequence,
      sessionId = currentSession()
    try {
      const next = await bridge.request({ type: 'snapshot', sessionId })
      if (
        !current(epoch) ||
        sequence !== readSequence ||
        currentSession() !== sessionId
      )
        return
      if (accept(next, epoch)) {
        setNotice()
        render()
      }
    } catch {
      if (!current(epoch) || sequence !== readSequence) return
      setNotice('记忆暂不可用，原有数据会保留。请稍后重试。', true)
      render()
    }
  }
  async function setEnabled(value: boolean) {
    if (disposed || settingPending !== undefined) return
    const epoch = identityEpoch
    ++readSequence
    settingPending = value
    setNotice()
    render()
    try {
      const next = await bridge.request({
        type: 'settings',
        use: value,
        auto: value
      })
      if (!current(epoch)) return
      accept(next, epoch)
    } catch {
      if (!current(epoch)) return
      setNotice('修改记忆设置未完成，已恢复之前的设置。请稍后重试。', true)
    } finally {
      if (current(epoch)) {
        settingPending = undefined
        render()
        if (refreshPending) {
          refreshPending = false
          void load()
        }
      }
    }
  }
  async function openDirectory() {
    if (disposed || directoryPending || !bridge.openDirectory) return
    const epoch = identityEpoch
    directoryPending = true
    setNotice()
    render()
    try {
      await bridge.openDirectory()
    } catch {
      if (current(epoch)) setNotice('记忆目录暂时无法打开，请稍后重试。', true)
    } finally {
      if (current(epoch)) {
        directoryPending = false
        render()
      }
    }
  }
  function render() {
    if (!page?.isConnected) return
    const focused = page.contains(document.activeElement)
      ? document.activeElement?.getAttribute('aria-label')
      : undefined
    page.replaceChildren()
    const content = node('div', undefined, 'ew-memory-content'),
      heading = node('header', undefined, 'ew-memory-heading')
    heading.append(
      node('h1', '记忆'),
      node('p', '记住你的偏好，让新对话接得上。')
    )
    content.append(heading)
    const status = node('div', undefined, 'ew-memory-notice')
    status.dataset.memoryNotice = ''
    status.setAttribute('aria-live', 'polite')
    content.append(status)
    page.append(content)
    setNotice(notice, noticeError)
    if (!data) {
      content.append(
        node(
          'p',
          noticeError ? '已保存的记忆会保留。' : '正在读取记忆…',
          'ew-memory-muted'
        )
      )
      if (noticeError)
        content.append(button('重试', () => void load(), 'ew-memory-retry'))
      return
    }
    const settings = node('section', undefined, 'ew-memory-controls')
    const label = node('label', undefined, 'ew-memory-switch-row'),
      copy = node('span', undefined, 'ew-memory-row-copy')
    copy.append(
      node('strong', '启用记忆'),
      node('small', '自动记住偏好与项目上下文，在新对话中继续使用。')
    )
    const toggle = node('input')
    toggle.type = 'checkbox'
    toggle.role = 'switch'
    toggle.setAttribute('aria-label', '启用记忆')
    toggle.checked = settingPending ?? (data.settings.use && data.settings.auto)
    toggle.disabled = settingPending !== undefined
    toggle.onchange = () => void setEnabled(toggle.checked)
    label.append(copy, toggle)
    settings.append(label)
    const storage = data.document
    const directory = button(
      '',
      () => void openDirectory(),
      'ew-memory-directory-row'
    )
    directory.dataset.memoryDirectory = ''
    directory.setAttribute('aria-label', '打开记忆存储目录')
    directory.disabled =
      directoryPending || !bridge.openDirectory || !storage?.directory
    const folder = icon('folder')
    folder.classList.add('ew-memory-folder')
    const location = node('span', undefined, 'ew-memory-row-copy')
    location.append(
      node('strong', storage?.file.split(/[\\/]/).at(-1) || '记忆.md'),
      node(
        'small',
        storage?.directory || '存储目录信息暂不可用',
        'ew-memory-path'
      )
    )
    const action = node('span', '打开目录', 'ew-memory-directory-action')
    action.append(icon('arrow'))
    directory.append(folder, location, action)
    settings.append(directory)
    if (storage?.error) {
      const error = node('p', storage.error, 'ew-memory-document-error')
      error.dataset.memoryDocumentError = ''
      error.role = 'alert'
      settings.append(error)
    }
    content.append(settings)
    const summary = node('section', undefined, 'ew-memory-summary')
    summary.dataset.memorySummary = ''
    summary.setAttribute('aria-label', '记忆内容的 AI 概括')
    const title = node('div', undefined, 'ew-memory-summary-heading')
    title.append(node('h2', 'AI 概括'))
    summary.append(title)
    const value = data.summary
    if (!value)
      summary.append(
        node('p', 'AI 概括暂不可用，已保存的记忆会保留。', 'ew-memory-muted')
      )
    else if (value.state === 'empty')
      summary.append(
        node('p', '还没有保存记忆。', 'ew-memory-empty'),
        node(
          'p',
          '保存偏好或项目内容后，这里会显示 AI 概括。',
          'ew-memory-muted'
        )
      )
    else {
      const state =
        value.state === 'pending'
          ? value.text
            ? '正在更新概括，以下为上次内容。'
            : '正在生成概括…'
          : value.state === 'failed'
            ? value.text
              ? 'AI 概括暂未更新，以下为上次内容。'
              : 'AI 概括暂不可用，已保存的记忆会保留。'
            : undefined
      if (state) {
        const message = node('p', state, 'ew-memory-summary-state')
        message.role = 'status'
        message.setAttribute('aria-live', 'polite')
        summary.append(message)
      }
      if (value.text)
        summary.append(node('div', value.text, 'ew-memory-summary-text'))
      else if (value.state === 'ready')
        summary.append(node('p', 'AI 尚未返回概括内容。', 'ew-memory-muted'))
      const meta = [
        value.count ? `${value.count} 条记忆` : '',
        value.updatedAt !== undefined ? `${date(value.updatedAt)} 更新` : '',
        value.model ? `由 ${value.model} 概括` : ''
      ].filter(Boolean)
      if (meta.length)
        summary.append(node('p', meta.join(' · '), 'ew-memory-summary-meta'))
    }
    content.append(summary)
    if (focused)
      [...page.querySelectorAll<HTMLElement>('[aria-label]')]
        .find((element) => element.getAttribute('aria-label') === focused)
        ?.focus({ preventScroll: true })
  }
  function hide() {
    root?.removeAttribute('data-memory-active')
    root?.querySelector('[data-memory-nav]')?.removeAttribute('aria-current')
    page?.remove()
    page = undefined
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
      page.setAttribute('aria-label', '记忆设置')
      panel.querySelector('.VOzbGW_content')?.append(page)
    }
    render()
    void load()
  }
  function open() {
    if (disposed) return
    const panel = document.querySelector<HTMLElement>('.VOzbGW_panel')
    if (panel) activate(panel)
    else {
      pendingOpen = true
      document.querySelector<HTMLButtonElement>('.VOzbGW_trigger')?.click()
    }
  }
  function reconcile() {
    if (disposed) return
    for (const nav of navs) if (!nav.isConnected) navs.delete(nav)
    if (root && !root.isConnected) root = undefined
    if (page && !page.isConnected) page = undefined
    for (const panel of document.querySelectorAll<HTMLElement>(
      '.VOzbGW_panel'
    )) {
      const list = panel.querySelector('.VOzbGW_navList')
      if (!list || panel.querySelector('[data-memory-nav]')) continue
      const nav = button('', () => activate(panel), 'VOzbGW_navCell')
      nav.dataset.memoryNav = ''
      nav.setAttribute('aria-label', '记忆')
      const mark = icon('memory')
      mark.classList.add('VOzbGW_navIcon')
      nav.append(mark, node('span', '记忆', 'VOzbGW_navLabel'))
      const account = list.querySelector('[data-account-nav]')
      if (account) account.after(nav)
      else list.prepend(nav)
      navs.add(nav)
    }
    if (root?.hasAttribute('data-account-active')) hide()
    if (pendingOpen) {
      const panel = document.querySelector<HTMLElement>('.VOzbGW_panel')
      if (panel) activate(panel)
    }
  }
  function resetIdentity() {
    if (disposed) return
    identityEpoch++
    readSequence++
    data = undefined
    settingPending = undefined
    directoryPending = false
    refreshPending = false
    notice = ''
    noticeError = false
    selectionQueue = Promise.resolve()
    clearToast()
    explicitSession = false
    sessionOverride = undefined
    render()
    void load()
  }
  function onNavClick(event: Event) {
    const target = event.target as Element | null
    if (
      !target?.closest('[data-memory-nav]') &&
      target?.closest(
        'nav [data-settings-section-id],nav [data-account-nav],.sherlock-settings-back,.VOzbGW_close'
      )
    )
      hide()
  }
  function onSidebarSelection() {
    explicitSession = false
    sessionOverride = undefined
    readSequence++
    if (page?.isConnected) void load()
  }
  function onSession(event: Event) {
    const value = (event as CustomEvent<{ sessionId?: string }>).detail
    explicitSession = true
    sessionOverride = value?.sessionId
    readSequence++
    if (page?.isConnected) void load()
  }
  function onOpen(event: Event) {
    const value = (event as CustomEvent<{ sessionId?: string }>).detail
    if (value?.sessionId) {
      explicitSession = true
      sessionOverride = value.sessionId
    }
    open()
  }
  function onSelection(event: Event) {
    const value = (event as CustomEvent<Selection>).detail
    if (typeof value?.content !== 'string' || !value.content.trim()) return
    const content = value.content.trim()
    if (content.length > 600) {
      showToast('所选内容超过 600 字，请选择较短的一段再记住。', true)
      return
    }
    const epoch = identityEpoch,
      sessionId =
        value.sessionId || value.source?.sessionId || currentSession(),
      source = value.source
    // The queue captures the original identity and session, even if the visible
    // conversation changes while the native context menu is being handled.
    selectionQueue = selectionQueue.then(async () => {
      if (!current(epoch)) return
      try {
        let context = data
        if (!context || (sessionId && context.session?.id !== sessionId))
          context = await bridge.request({ type: 'snapshot', sessionId })
        if (!current(epoch)) return
        if (data && context.owner !== data.owner) return
        const projectId =
          context.session?.id === sessionId
            ? context.session?.projectId
            : undefined
        const input: MemoryInput = {
          title: (value.title?.trim() || source?.title || '选区记忆').slice(
            0,
            120
          ),
          content,
          kind: projectId ? 'background' : 'preference',
          scope: projectId ? 'project' : 'global',
          projectId,
          source
        }
        const next = await bridge.request({ type: 'save', input })
        if (!current(epoch)) return
        if (next.owner !== context.owner) return
        if (accept(next, epoch)) render()
        if (next.document?.error)
          showToast('记忆.md 暂未写入，原内容仍会保留。请稍后重试。', true)
        else if (!next.document)
          showToast('记忆已保存，存储文件状态暂不可用。', true)
        else showToast('已保存到记忆.md')
      } catch {
        if (current(epoch))
          showToast('记忆保存未完成，原内容仍会保留。请稍后重试。', true)
      }
    })
  }
  document.addEventListener('click', onNavClick, true)
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
    clearToast()
    style.remove()
    data = undefined
    for (const nav of navs) nav.remove()
    navs.clear()
    document.removeEventListener('click', onNavClick, true)
    document.removeEventListener(
      'sherlock-sidebar-selection',
      onSidebarSelection
    )
    document.removeEventListener('sherlock:memory-session', onSession)
    document.removeEventListener('sherlock:memory-open', onOpen)
    document.removeEventListener('sherlock:memory-save-selection', onSelection)
  }
  return { resetIdentity, dispose }
}
