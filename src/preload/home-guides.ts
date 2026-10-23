import styles from './home-guides.css?raw'
import { createHomeGuideTimeline, type GuideTimeline } from './home-guide-timeline'

export type HomeGuideKind = 'board' | 'note' | 'ppt'
export type HomeGuideAdapter = { runStep(step: any): Promise<void>; dispose(): void }
type MountOptions = { signal: AbortSignal; runId: string; sessionId: string; waitUntilPlaying(): Promise<void>; onStatus(text: string): void }
type Adapters = {
  mountNotes(document: Document, host: HTMLElement, options: MountOptions): Promise<HomeGuideAdapter>
  mountPresentation(document: Document, host: HTMLElement, options: MountOptions): Promise<HomeGuideAdapter>
}
const EXAMPLES = {
  board: { title: '自选行情看板', view: '研究', steps: [
    ['board-library', '打开组件库，选择常用金融组件', 800],
    ['board-watchlist', '创建自选股列表', 850],
    ['board-quote', '放入行情图表', 750],
    ['board-news', '添加相关资讯', 750],
    ['board-link', '连接组件，切换标的时同步更新', 1800],
    ['board-add', '添加一只自选股，验证联动', 1800],
    ['board-arrange', '整理画布，形成可继续使用的研究工作台', 1800]
  ] },
  note: { title: 'AI 护航研究笔记', view: '笔记', steps: [
    ['write', '快速整理一篇研究分析笔记', 700],
    ['challenge', '打开严格挑战，核对文字、数据与推理', 1500],
    ['select', '查看标记段落和挑战依据', 1200],
    ['replace', '优化建议，并替换回原文', 2000]
  ] },
  ppt: { title: '公司风格演示文稿', view: '对话', steps: [
    ['brief', '输入主题和交付要求', 900],
    ['plan', '明确关键观点与页面大纲', 1400],
    ['layout', '按公司模板完成排版', 1300],
    ['deliver', '完成可预览的演示文稿', 1200],
    ['open', '打开右侧预览，检查成稿', 2000]
  ] }
} as const
const abortError = () => Object.assign(Error('教程已结束。'), { name: 'AbortError' })

function mountBoard(document: Document, host: HTMLElement, options: MountOptions): Promise<HomeGuideAdapter> {
  const win = document.defaultView!
  host.id ||= 'odyssey-home-guide-board-' + options.runId
  let disposed = false
  const pending = new Set<() => void>()
  const exchange = (command: string) => new Promise<void>((resolve, reject) => {
    if (disposed || options.signal.aborted) { reject(abortError()); return }
    const requestId = win.crypto.randomUUID()
    const cleanup = () => { win.clearTimeout(timer); win.removeEventListener('sherlock:home-guide-native-reply', receive); pending.delete(cancel) }
    const cancel = () => { cleanup(); reject(abortError()) }
    const receive = (event: Event) => {
      const reply = (event as CustomEvent).detail
      if (reply?.requestId !== requestId || reply.runId !== options.runId) return
      cleanup(); reply.ok ? resolve() : reject(Error(reply.message || '研究教程尚未就绪。'))
    }
    const timer = win.setTimeout(() => { cleanup(); reject(Error('研究教程尚未就绪，请重新播放。')) }, 8000)
    pending.add(cancel); win.addEventListener('sherlock:home-guide-native-reply', receive)
    win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-native-request', { detail: { requestId, runId: options.runId, sessionId: options.sessionId, hostId: host.id, command } }))
  })
  const dispose = () => {
    if (disposed) return
    disposed = true; options.signal.removeEventListener('abort', dispose)
    for (const cancel of pending) cancel()
    win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-native-request', { detail: { requestId: win.crypto.randomUUID(), runId: options.runId, sessionId: options.sessionId, hostId: host.id, command: 'dispose' } }))
  }
  options.signal.addEventListener('abort', dispose, { once: true })
  return exchange('mount-board').then(() => ({ runStep: async step => { await options.waitUntilPlaying(); await exchange(step) }, dispose }), error => { dispose(); throw error })
}

/** A pane-local tutorial shell. Native content and the user's draft stay mounted. */
export function mountHomeGuides(document: Document, adapters: Adapters) {
  const win = document.defaultView!
  const style = document.createElement('style'); style.textContent = styles; style.id = 'odyssey-home-guide-style'; document.head.append(style)
  let ownedNavigation = 0
  let releaseTransition = () => {}
  const clickOwned = (button: HTMLButtonElement | null | undefined, force = false) => {
    if (!button || button.disabled || !force && button.getAttribute('aria-selected') === 'true') return
    ownedNavigation++; try { button.click() } finally { ownedNavigation-- }
  }
  let disposed = false, active: {
    id: string; kind: HomeGuideKind; sessionId: string; originalTab?: string; abort: AbortController; root: HTMLElement
    center: HTMLElement; resident: HTMLElement; content: HTMLElement; adapter?: HomeGuideAdapter; timeline?: GuideTimeline
    cleanup(restoreFocus: boolean): void
  } | undefined
  const selected = () => [...document.querySelectorAll<HTMLElement>('.pI_x6G_centerCol [data-srb-session-header][data-ework-notes-session]')].find(node => !node.closest('[data-odyssey-subagent-panel]'))?.dataset.eworkNotesSession
  const suppressNotesUntilView = (sessionId: string, view: string) => {
    releaseTransition()
    const token = win.crypto.randomUUID()
    document.documentElement.dataset.homeGuideTransition = token
    document.documentElement.dataset.homeGuideTransitionSession = sessionId
    let frame = 0
    const cleanup = () => {
      observer.disconnect(); win.clearTimeout(timer); if (frame) win.cancelAnimationFrame(frame)
      if (document.documentElement.dataset.homeGuideTransition === token) {
        delete document.documentElement.dataset.homeGuideTransition
        delete document.documentElement.dataset.homeGuideTransitionSession
      }
    }
    const check = () => {
      const tab = document.querySelector('[data-srb-session-header][data-ework-notes-session] [data-srb-tabs] [data-conversation-view-id="' + view + '"]')
      const note = [...document.querySelectorAll('[data-ework-note-view]')].some(node => !node.closest('[data-odyssey-subagent-panel]'))
      if (selected() !== sessionId || tab?.getAttribute('aria-selected') === 'true' && (view === 'notes' ? note : !note)) cleanup()
    }
    const observer = new win.MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected','data-ework-notes-session'] })
    const timer = win.setTimeout(cleanup, 1200)
    frame = win.requestAnimationFrame(check)
    releaseTransition = cleanup
  }
  const close = (restoreFocus = true) => {
    const run = active
    if (!run) return
    active = undefined; run.abort.abort(); run.timeline?.dispose(); run.adapter?.dispose(); run.cleanup(restoreFocus)
    run.root.remove()
    if (run.center.dataset.homeGuideActive === run.id) delete run.center.dataset.homeGuideActive
    if (run.resident.dataset.homeGuideResident === run.id) delete run.resident.dataset.homeGuideResident
  }
  const start = async (kind: HomeGuideKind) => {
    if (disposed) throw abortError()
    if (!(kind in EXAMPLES)) throw Error('暂不支持此教程。')
    const inherited = active && { sessionId: active.sessionId, originalTab: active.originalTab }
    close(true); releaseTransition()
    const sessionId = selected()
    const center = document.querySelector<HTMLElement>('.pI_x6G_centerCol')
    const resident = [...(center?.querySelectorAll<HTMLElement>('.wSkVaW_root') || [])].find(node => !node.closest('[data-odyssey-subagent-panel]'))
    if (!sessionId || !center || !resident) throw Error('请先选择工作区，再打开示例教程。')
    const previousFocus = document.activeElement instanceof win.HTMLElement ? document.activeElement : undefined
    const previousSelection = previousFocus instanceof win.HTMLTextAreaElement || previousFocus instanceof win.HTMLInputElement
      ? { value: previousFocus.value, start: previousFocus.selectionStart, end: previousFocus.selectionEnd, direction: previousFocus.selectionDirection } : undefined
    const originalTab = (inherited?.sessionId === sessionId ? inherited.originalTab : undefined) ?? resident.querySelector<HTMLButtonElement>('[data-srb-tabs] button[data-conversation-view-id][aria-selected="true"]')?.dataset.conversationViewId
    const guideTab = kind === 'board' ? 'research' : kind === 'note' ? 'notes' : 'chat'
    const previousInert = resident.inert
    const id = win.crypto.randomUUID(), controller = new win.AbortController(), definition = EXAMPLES[kind]
    const root = document.createElement('section'); root.className = 'odyssey-home-guide'; root.dataset.homeGuide = id; root.dataset.kind = kind
    root.setAttribute('aria-label', definition.title + ' · 示例教程')
    const header = document.createElement('header'); header.className = 'odyssey-home-guide-header'
    const title = document.createElement('strong'); title.textContent = definition.view + ' · ' + definition.title
    const badge = document.createElement('span'); badge.className = 'odyssey-home-guide-badge'; badge.textContent = '示例教程'
    const exit = document.createElement('button'); exit.type = 'button'; exit.textContent = '退出'; exit.setAttribute('aria-label', '退出示例教程')
    exit.addEventListener('click', () => close())
    header.append(title, badge, exit)
    const content = document.createElement('div'); content.className = 'odyssey-home-guide-content' + (kind === 'note' ? ' en-root' : '')
    content.id = 'odyssey-home-guide-content-' + id; content.dataset.homeGuideContent = ''
    if (kind === 'note') content.dataset.homeGuideNotes = ''
    content.dataset.dark = String(document.body.hasAttribute('data-ds-dark-theme'))
    const footer = document.createElement('footer'); footer.className = 'odyssey-home-guide-footer'
    const information = document.createElement('div')
    const count = document.createElement('span'); count.className = 'odyssey-home-guide-count'
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.textContent = '正在准备原生界面…'
    information.append(count, status)
    const pause = document.createElement('button'); pause.type = 'button'; pause.textContent = '暂停'; pause.disabled = true
    const replay = document.createElement('button'); replay.type = 'button'; replay.textContent = '重播'; replay.disabled = true
    replay.addEventListener('click', () => { void start(kind).catch(() => {}) })
    footer.append(information, pause, replay); root.append(header, content, footer)
    const run = { id, kind, sessionId, originalTab, abort: controller, root, center, resident, content, cleanup: () => {} } as NonNullable<typeof active>
    active = run
    resident.dataset.homeGuideResident = id; center.dataset.homeGuideActive = id
    // Keep the resident DOM and input mounted, while preventing concealed controls
    // from receiving keyboard input. The native header stays outside this surface.
    const blocked = new Map<HTMLElement, boolean>()
    const blockResident = () => {
      const chrome = resident.querySelector('[data-srb-session-header],.wSkVaW_header')
      for (const child of resident.children) {
        if (!(child instanceof win.HTMLElement) || child === chrome || child.contains(chrome)) continue
        if (!blocked.has(child)) blocked.set(child, child.inert)
        child.inert = true
      }
    }
    blockResident()
    center.append(root)
    const position = () => {
      if (active !== run) return
      const bounds = center.getBoundingClientRect(), chrome = resident.querySelector('[data-srb-session-header],.wSkVaW_header')?.getBoundingClientRect()
      root.style.left = bounds.left + 'px'; root.style.top = Math.max(bounds.top, chrome?.bottom ?? bounds.top + 44) + 'px'
      root.style.width = bounds.width + 'px'; root.style.height = Math.max(1, bounds.bottom - Math.max(bounds.top, chrome?.bottom ?? bounds.top + 44)) + 'px'
    }
    const observer = new win.ResizeObserver(position); observer.observe(center)
    const chrome = resident.querySelector('[data-srb-session-header],.wSkVaW_header'); if (chrome) observer.observe(chrome)
    win.addEventListener('resize', position); position()
    const context = new win.MutationObserver(() => {
      if (selected() !== sessionId || !resident.isConnected || document.querySelector('.VOzbGW_overlay') || document.body.hasAttribute('data-workspace-surface')) close(false)
      else blockResident()
    })
    context.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ework-notes-session', 'data-workspace-surface'] })
    run.cleanup = restoreFocus => {
      if (restoreFocus && selected() === sessionId && originalTab) {
        suppressNotesUntilView(sessionId, originalTab)
        clickOwned(resident.querySelector<HTMLButtonElement>('[data-srb-tabs] button[data-conversation-view-id="' + originalTab + '"]'), true)
      }
      observer.disconnect(); context.disconnect(); win.removeEventListener('resize', position)
      for (const [body, inert] of blocked) body.inert = inert
      resident.inert = previousInert
      if (restoreFocus && selected() === sessionId && previousFocus?.isConnected) {
        // Restore selection only if no external change replaced the old draft.
        if (previousSelection && (previousFocus instanceof win.HTMLTextAreaElement || previousFocus instanceof win.HTMLInputElement) && previousFocus.value === previousSelection.value && previousSelection.start !== null && previousSelection.end !== null) previousFocus.setSelectionRange(previousSelection.start, previousSelection.end, previousSelection.direction ?? undefined)
        previousFocus.focus({ preventScroll: true })
      }
    }
    clickOwned(resident.querySelector<HTMLButtonElement>('[data-srb-tabs] button[data-conversation-view-id="' + guideTab + '"]'), !!inherited)
    const ensure = () => { if (active !== run || controller.signal.aborted || selected() !== sessionId) throw abortError() }
    const options: MountOptions = {
      signal: controller.signal, sessionId, runId: id,
      waitUntilPlaying: () => run.timeline ? run.timeline.waitUntilPlaying() : Promise.resolve(),
      onStatus: text => { if (active === run) status.textContent = text }
    }
    try {
      const adapter = await (kind === 'board' ? mountBoard(document, content, options) : kind === 'note' ? adapters.mountNotes(document, content, options) : adapters.mountPresentation(document, content, options))
      if (active !== run || controller.signal.aborted) { adapter.dispose(); throw abortError() }
      run.adapter = adapter; ensure()
      run.timeline = createHomeGuideTimeline({
        steps: definition.steps.map(([id, , hold]) => ({ id, hold })),
        run: async step => { ensure(); await adapter.runStep(step); ensure() },
        onChange: state => {
          if (active !== run || state.phase === 'disposed') return
          const completed = state.phase === 'completed'
          count.textContent = completed ? '演示完成' : (state.index + 1) + ' / ' + definition.steps.length
          if (completed) status.textContent = '可以重播，或退出后继续使用自己的资料。'
          else if (state.phase === 'playing') status.textContent = definition.steps[state.index]?.[1] ?? ''
          pause.textContent = state.phase === 'paused' ? '继续' : '暂停'
          pause.disabled = completed || state.phase === 'error'
        },
        onError: error => { if (active !== run) return; status.textContent = error instanceof Error ? error.message : '演示已中断，请重播。'; pause.disabled = true; replay.disabled = false }
      })
      pause.disabled = false; replay.disabled = false
      pause.addEventListener('click', () => {
        if (active !== run) return
        if (run.timeline?.snapshot().phase === 'playing') run.timeline.pause()
        else run.timeline?.play()
      })
      exit.focus({ preventScroll: true })
      run.timeline.play()
      if (document.hidden) run.timeline.pause()
    } catch (error) {
      if (active !== run || controller.signal.aborted) throw error
      controller.abort(); run.adapter?.dispose()
      status.textContent = error instanceof Error ? error.message : '演示尚未就绪，请重新播放。'
      pause.disabled = true; replay.disabled = false; exit.focus({ preventScroll: true })
    }
  }
  const changed = () => { close(false); releaseTransition() }
  const escape = (event: KeyboardEvent) => { if (active && event.key === 'Escape') { event.preventDefault(); close() } }
  const navigate = (event: Event) => {
    if (ownedNavigation) return
    if ((event.target as Element)?.closest?.('[data-srb-tabs] button,[data-dsh-sidebar-root]')) releaseTransition()
    if (!active || active.root.contains(event.target as Node)) return
    if ((event.target as Element)?.closest?.('[data-srb-tabs] button,[data-dsh-sidebar-root] button,[data-dsh-sidebar-root] [role=row]')) close(false)
  }
  const visibility = () => { if (document.hidden) active?.timeline?.pause() }
  win.addEventListener('sherlock:home-action-context-changed', changed)
  win.addEventListener('sherlock:skill-menu-reset', changed)
  document.addEventListener('keydown', escape, true); document.addEventListener('click', navigate, true)
  document.addEventListener('visibilitychange', visibility)
  return { start, reset: (restoreFocus = true) => { close(restoreFocus); if (!restoreFocus) releaseTransition() }, dispose: () => {
    if (disposed) return
    disposed = true; close(false); releaseTransition()
    win.removeEventListener('sherlock:home-action-context-changed', changed); win.removeEventListener('sherlock:skill-menu-reset', changed)
    document.removeEventListener('keydown', escape, true); document.removeEventListener('click', navigate, true); document.removeEventListener('visibilitychange', visibility)
    style.remove()
  } }
}
