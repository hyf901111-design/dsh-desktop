import { noteUiText as localize } from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import type {
  MemoryBridge,
  MemoryCommand,
  MemoryInput,
  MemorySnapshot,
  MemorySource
} from '../../shared/memory'
import { memoryStyles } from './style'
import { openMemoryDocumentEditor } from './document-editor'

type Selection = {
  content?: string
  title?: string
  source?: MemorySource
  sessionId?: string
}

/** Adds one ordinary settings section without replacing the native settings tree. */
export function mountMemoryUi(document: Document, bridge: MemoryBridge) {
  const t = (value: string) => localize(value, document.documentElement.dataset.odysseyLocale)
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
  let settingPending: { key: string; value?: boolean } | undefined,
    refreshPending = false
  let notice = '',
    noticeError = false,
    selectionQueue = Promise.resolve()
  let toast: HTMLElement | undefined, toastTimer: number | undefined
  let editor: ReturnType<typeof openMemoryDocumentEditor> | undefined
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
      sequence = ++readSequence
    try {
      const next = await bridge.request({ type: 'snapshot' })
      if (
        !current(epoch) ||
        sequence !== readSequence
      )
        return
      if (accept(next, epoch)) {
        setNotice()
        render()
      }
    } catch {
      if (!current(epoch) || sequence !== readSequence) return
      setNotice(t("记忆暂不可用，原有数据会保留。请稍后重试。"), true)
      render()
    }
  }
  async function changeSetting(command: MemoryCommand, key: string, value?: boolean) {
    if (disposed || settingPending !== undefined) return
    const epoch = identityEpoch
    ++readSequence
    settingPending = { key, value }
    setNotice()
    render()
    try {
      const next = await bridge.request(command)
      if (!current(epoch)) return
      accept(next, epoch)
    } catch {
      if (!current(epoch)) return
      setNotice(t("修改记忆设置未完成，已恢复之前的设置。请稍后重试。"), true)
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
  function openDocument(){
    if(editor||!data)return
    const epoch=identityEpoch,owner=data.owner
    editor=openMemoryDocumentEditor({document,bridge,owner,t,current:()=>current(epoch),
      saved:next=>{if(accept(next,epoch))render()},closed:()=>{editor=undefined}})
  }
  function settingRow(title:string,description:string,value:boolean,change:(value:boolean)=>void){
    const label=node('label',undefined,'ew-memory-switch-row'),copy=node('span',undefined,'ew-memory-row-copy'),toggle=node('input')
    copy.append(node('strong',t(title)),node('small',t(description)))
    toggle.type='checkbox';toggle.role='switch';toggle.setAttribute('aria-label',t(title));toggle.checked=value;toggle.disabled=settingPending!==undefined
    toggle.onchange=()=>change(toggle.checked);label.append(copy,toggle);return label
  }
  function render() {
    if(!page?.isConnected)return
    const focused=page.contains(document.activeElement)?document.activeElement?.getAttribute('aria-label'):undefined
    page.replaceChildren()
    const content=node('div',undefined,'ew-memory-content'),heading=node('header',undefined,'ew-memory-heading')
    heading.append(node('h1',t('记忆')),node('p',t('记住你的偏好，让新对话接得上。')))
    const status=node('div',undefined,'ew-memory-notice');status.dataset.memoryNotice='';status.setAttribute('aria-live','polite')
    content.append(heading,status);page.append(content);setNotice(notice,noticeError)
    if(!data){content.append(node('p',t(noticeError?'已保存的记忆会保留。':'正在读取记忆…'),'ew-memory-muted'));if(noticeError)content.append(button(t('重试'),()=>void load(),'ew-memory-retry'));return}
    const settings=node('section',undefined,'ew-memory-controls')
    settings.append(settingRow('启用记忆','在对话中保存和使用记忆。关闭后，已保存的内容仍会保留。',settingPending?.value??data.settings.use,checked=>void changeSetting({type:'settings',use:checked},'use',checked)))
    const row=node('div',undefined,'ew-memory-document-row'),copy=node('div',undefined,'ew-memory-row-copy'),edit=button(t('编辑'),openDocument,'ew-memory-document-edit')
    copy.append(node('strong',t('记忆.md')),node('small',t('在文档中预览、修改和删除记忆内容。')))
    edit.setAttribute('aria-label',t('编辑记忆.md'));edit.dataset.memoryDocumentOpen='';row.append(icon('folder'),copy,edit);settings.append(row)
    if(data.document?.error){const error=node('p',data.document.error,'ew-memory-document-error');error.role='alert';settings.append(error)}
    content.append(settings,node('p',t('记忆保存在本机；使用云端模型时，相关记忆会随问题发送给模型。'),'ew-memory-privacy'))
    if(focused)page.querySelector<HTMLElement>(`[aria-label="${focused}"]`)?.focus()
  }

  function hide() {
    editor?.close()
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
      page.setAttribute('aria-label', t("记忆设置"))
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
  let renderedLocale = document.documentElement.dataset.odysseyLocale
  function reconcile() {
    if (renderedLocale !== document.documentElement.dataset.odysseyLocale) {
      renderedLocale = document.documentElement.dataset.odysseyLocale
      for (const nav of navs) { nav.setAttribute('aria-label', t('记忆')); nav.querySelector('span')!.textContent=t('记忆') }
      if (page) {page.setAttribute('aria-label',t('记忆设置'));render();editor?.render()}
    }
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
      nav.setAttribute('aria-label', t("记忆"))
      const mark = icon('memory')
      mark.classList.add('VOzbGW_navIcon')
      nav.append(mark, node('span', t("记忆"), 'VOzbGW_navLabel'))
      const previous = list.querySelector('[data-settings-section-id="models"]') ?? list.querySelector('[data-account-nav]')
      if (previous) previous.after(nav)
      else list.append(nav)
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
    editor?.close()
    settingPending = undefined
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
  }
  function onSession(event: Event) {
    const value = (event as CustomEvent<{ sessionId?: string }>).detail
    explicitSession = true
    sessionOverride = value?.sessionId
    readSequence++
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
      showToast(t("所选内容超过 600 字，请选择较短的一段再记住。"), true)
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
          title: (value.title?.trim() || source?.title || t("选区记忆")).slice(
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
          showToast(t("记忆.md 暂未写入，原内容仍会保留。请稍后重试。"), true)
        else if (!next.document)
          showToast(t("记忆已保存，存储文件状态暂不可用。"), true)
        else showToast(t("已保存到记忆.md"))
      } catch {
        if (current(epoch))
          showToast(t("记忆保存未完成，原内容仍会保留。请稍后重试。"), true)
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
    attributeFilter: ['data-account-active','data-odyssey-locale']
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
