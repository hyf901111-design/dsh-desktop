import centerStyles from './notification-center.css?inline'
import closeIcon from './notification-assets/close.svg?inline'
import emptyIcon from './notification-assets/empty.svg?inline'
import unreadIcon from './notification-assets/unread.svg?inline'
import type { UpdateStatus } from '../shared/contracts'
import { installSidebarNoticeStyles, noticeIcon, positionSidebarNotice } from './sidebar-notice'
import { updateErrorCopy, updateErrorStage, updateMessage } from './update-view'
import { normalizeUpdateNotification, readUpdateNotification, saveUpdateNotification, updateNotificationVersionInstalled } from './update-notification-store'
import { boardEditTime } from './research-board-presentation'
import type {
  Notification,
  ResearchBoardsBridge,
  ResearchBoardsState
} from '../shared/research-boards'
import {
  boardButton,
  boardRoleLabel,
  installBoardUiStyles,
  requestBoardPageAction,
  unwrapBoardReply
} from './research-board-dialogs'
export function mountResearchBoardNotifications(
  doc: Document,
  bridge: ResearchBoardsBridge,
  revealWorkspace?: () => void
) {
  const win = doc.defaultView!
  installBoardUiStyles(doc)
  installSidebarNoticeStyles(doc)
  const styleId = 'sherlock-notification-center-style'
  if (!doc.getElementById(styleId)) {
    const style = doc.createElement('style')
    style.id = styleId
    style.textContent = centerStyles
    doc.head.append(style)
  }
  let state: ResearchBoardsState | undefined,
    bell: HTMLButtonElement | undefined,
    panel: HTMLElement | undefined,
    bubble: HTMLElement | undefined,
    filter: 'all' | 'unread' = 'all',
    disposed = false,
    lastSeq = -1,
    account = '',
    shown = new Map<string, number>(),
    queue: Notification[] = [],
    burst = 0,
    aggregate: Notification[] = []
  let panelSignature = ''
  let renderedFilter: 'all' | 'unread' | undefined
  let loadFailed = false
  let reconnecting = false
  let marking: { ids: string[]; version?: string; all: boolean } | undefined
  let feedback: { text: string; retry?: () => Promise<void> } | undefined
  let feedbackToast: HTMLElement | undefined
  let feedbackTimer: number | undefined
  let latestUpdateSeenAt: number | undefined
  const invitationStates = new Map<string, { pending?: 'accept' | 'decline'; failed?: 'accept' | 'decline'; error?: string }>()
  let activeNotification: Notification | undefined
  let latestUpdate = readUpdateNotification(win.localStorage)
  let liveUpdatePhase: UpdateStatus['phase'] | undefined
  let updateReadVersion = ''
  try { updateReadVersion = win.localStorage.getItem('ework.update.read') ?? '' } catch {}
  let countdown: ReturnType<typeof setTimeout> | undefined,
    remaining = 10000,
    started = 0,
    hover = false,
    focused = false
  const call = <T = unknown>(action: string, input: unknown = {}) =>
    unwrapBoardReply<T>(bridge.invoke(action, input))
  function persist() {
    try {
      win.localStorage.setItem(
        `sherlock.boards.displayed.${account}`,
        JSON.stringify([...shown].slice(-500))
      )
    } catch {}
  }
  function anchor(el: HTMLElement) {
    if (el.classList.contains('ework-sidebar-notice')) { positionSidebarNotice(doc, el); return }
    const sidebar = doc.querySelector<HTMLElement>('[data-dsh-sidebar-root]')
    const bounds = (doc.querySelector<HTMLElement>('.VOzbGW_nav') ?? sidebar)?.getBoundingClientRect()
    const width = Math.min(420, win.innerWidth - 24)
    el.style.left = `${Math.max(12, Math.min((bounds?.left ?? 0) + 18, win.innerWidth - width - 12))}px`
    // Keep a fixed panel above the account footer; only its list scrolls.
    const bottom = Math.min(82, Math.max(12, win.innerHeight - 112))
    el.style.bottom = `${bottom}px`
    el.style.maxHeight = `calc(100vh - ${bottom + 12}px)`
  }
  function pending(n: Notification) {
    return n.invitation?.status === 'pending'
  }
  function closeBubble(next = true) {
    clearTimeout(countdown)
    countdown = undefined
    bubble?.remove()
    bubble = undefined
    activeNotification = undefined
    aggregate = []
    if (next) showNext()
  }
  function pause() {
    if (countdown) {
      remaining = Math.max(0, remaining - (Date.now() - started))
      clearTimeout(countdown)
      countdown = undefined
    }
  }
  function resume() {
    if (doc.visibilityState === 'hidden' || hover || focused || !bubble || bubble.hasAttribute('data-notice-unpositioned') || countdown || ['downloading', 'preparing', 'downloaded', 'installing'].includes(liveUpdatePhase ?? '')) return
    for (const item of activeNotification ? [activeNotification] : aggregate) shown.set(item.notificationId, item.eventVersion)
    persist()
    started = Date.now()
    countdown = setTimeout(() => closeBubble(), remaining)
  }
  async function respond(
    n: Notification,
    decision: 'accept' | 'decline',
    root: HTMLElement
  ) {
    pause()
    const buttons = [...root.querySelectorAll('button')]
    buttons.forEach((b) => (b.disabled = true))
    root.querySelector('[role=status]')?.remove()
    const status = doc.createElement('p')
    status.role = 'status'
    root.append(status)
    status.textContent = decision === 'accept' ? '加入中…' : '处理中…'
    const pendingAction = root.closest('.srb-bubble')
      ? buttons[decision === 'accept' ? buttons.length - 1 : 0]
      : undefined
    const actionLabel = pendingAction?.textContent ?? ''
    if (pendingAction) {
      status.hidden = true
      pendingAction.textContent = status.textContent
    }
    try {
      const result = await replyToInvitation(n, decision)
      if (n.invitation)
        n.invitation.status =
          result.invitation?.status ??
          (decision === 'accept' ? 'accepted' : 'declined')
      status.textContent = decision === 'accept' ? '已加入' : '已拒绝'
      if (root.closest('.srb-bubble')) {
        root.replaceWith(record(n, true))
        setBubbleHeading(n)
      }
      root.querySelector('.srb-notification-actions')?.remove()
      if (decision === 'accept')
        root.append(
          boardButton(doc, '打开看板', () =>
            openBoardDestination(n.boardId).catch((e) => {
              status.textContent = e.message
            })
          )
        )
      if (panel && root.closest('.srb-bubble')) renderPanel()
      await refresh()
    } catch (error) {
      const e = error as Error & {
        details?: { invitation?: { status: string } }
      }
      if (e.details?.invitation && n.invitation) {
        n.invitation.status = e.details.invitation.status
        root.querySelector('.srb-notification-actions')?.remove()
      }
      if (pendingAction) pendingAction.textContent = actionLabel
      status.hidden = false
      status.textContent = e.message
      buttons.forEach((b) => (b.disabled = false))
    } finally {
      remaining = 10000
      resume()
    }
  }
  function icon(source: string, size: number, className = '') {
    const image = doc.createElement('img')
    image.src = source
    image.alt = ''
    image.width = size
    image.height = size
    if (className) image.className = className
    return image
  }
  function appendLines(row: HTMLElement, title: HTMLElement, subtitle: HTMLElement, createdAt?: number) {
    const lines = doc.createElement('div')
    lines.className = 'srb-notification-lines'
    const time = doc.createElement('time')
    time.className = 'srb-notification-time'
    const date = new Date(createdAt ?? NaN)
    if (Number.isFinite(date.getTime())) {
      const relative = boardEditTime(createdAt)
      time.textContent = relative === '刚刚' ? relative : relative + '前'
      time.title = date.toLocaleString()
      time.dateTime = date.toISOString()
    }
    const meta = doc.createElement('div')
    meta.className = 'srb-notification-meta'
    lines.append(title, time, subtitle, meta)
    if (row.dataset.unread === 'true') row.append(icon(unreadIcon, 5, 'srb-notification-unread'))
    row.append(lines)
    return meta
  }
  function clearFeedbackToast() {
    win.clearTimeout(feedbackTimer)
    feedbackToast?.remove()
    feedbackToast = undefined
  }
  function showReadSuccess() {
    clearFeedbackToast()
    const toast = doc.createElement('div')
    toast.className = 'srb-notifications-toast'
    toast.role = 'status'
    toast.textContent = '已全部标为已读'
    feedbackToast = toast
    doc.body.append(toast)
    feedbackTimer = win.setTimeout(clearFeedbackToast, 2400)
  }
  async function respondInCenter(n: Notification, decision: 'accept' | 'decline') {
    if (invitationStates.get(n.notificationId)?.pending) return
    const operation = { pending: decision }
    invitationStates.set(n.notificationId, operation)
    renderPanel()
    try {
      const result = await replyToInvitation(n, decision)
      if (invitationStates.get(n.notificationId) !== operation) return
      if (n.invitation) n.invitation.status = result.invitation?.status ?? (decision === 'accept' ? 'accepted' : 'declined')
      invitationStates.delete(n.notificationId)
      renderPanel()
      void refresh().catch(() => {})
    } catch (error) {
      if (invitationStates.get(n.notificationId) !== operation) return
      const details = (error as Error & { details?: { invitation?: { status: string } } }).details
      if (details?.invitation && n.invitation) n.invitation.status = details.invitation.status
      invitationStates.set(n.notificationId, { failed: decision, error: decision === 'accept' ? '加入失败，请重试。' : '拒绝失败，请重试。' })
      renderPanel()
    }
  }
  function replyToInvitation(n: Notification, decision: 'accept' | 'decline') {
    return call<{ invitation: { status: string } }>('invitation.respond', {
      invitationId: n.invitation?.invitationId ?? n.invitation?.id,
      version: n.invitation?.version,
      decision
    })
  }
  async function openBoardDestination(boardId: string) {
    const openedPanel = panel
    await requestBoardPageAction(doc, 'open', boardId)
    if (panel !== openedPanel) return
    revealWorkspace?.()
    if (openedPanel) closePanel()
  }
  function appendCenterRecord(row: HTMLElement, n: Notification, title: HTMLElement, subtitle: HTMLElement) {
    const status = n.invitation?.status
    const operation = pending(n) ? invitationStates.get(n.notificationId) : undefined
    if (status === 'accepted') {
      row.dataset.openBoard = ''
      const open = async () => {
        const openedPanel = panel
        try {
          await openBoardDestination(n.boardId)
        } catch {
          if (panel === openedPanel) {
            feedback = { text: '打开看板失败，请重试。', retry: open }
            renderPanel()
          }
        }
      }
      const titleButton = boardButton(doc, n.boardTitle, open, '打开看板')
      titleButton.className = 'srb-notification-open'
      titleButton.title = n.boardTitle
      title.replaceChildren(titleButton)
      row.addEventListener('click', event => {
        if (!(event.target as Element).closest('button')) void open()
      })
    } else title.title = n.boardTitle
    subtitle.title = subtitle.textContent ?? ''
    const meta = appendLines(row, title, subtitle, n.createdAt)
    if (!n.readAt) appendMarkRead(meta, () => markRead([n.notificationId]), marking?.ids.includes(n.notificationId))
    else meta.textContent = ({ accepted: '已加入', declined: '已拒绝', cancelled: '已撤销', expired: '已过期' } as Record<string, string>)[status ?? ''] ?? ''

    if (operation?.error) {
      const message = doc.createElement('p')
      message.className = 'srb-notification-error'
      message.role = 'alert'
      message.textContent = operation.error
      row.append(message)
    }
    if (pending(n)) {
      const actions = doc.createElement('div')
      actions.className = 'srb-notification-invitation-actions'
      const accept = boardButton(doc, operation?.pending === 'accept' ? '加入中…' : operation?.failed === 'accept' ? '重试加入' : '接受', () => respondInCenter(n, 'accept'))
      accept.className = 'srb-primary'
      const decline = boardButton(doc, operation?.pending === 'decline' ? '处理中…' : operation?.failed === 'decline' ? '重试拒绝' : '拒绝', () => respondInCenter(n, 'decline'))
      accept.disabled = decline.disabled = !!operation?.pending
      actions.append(accept, decline)
      row.append(actions)
    } else if (status === 'expired') {
      const disabled = boardButton(doc, '打开看板', () => {})
      disabled.disabled = true
      if (!n.readAt) meta.prepend(doc.createTextNode('已过期'))
      meta.append(disabled)
    }
    return row
  }
  function record(n: Notification, compact = false) {
    const row = doc.createElement('article')
    row.className = 'srb-notification'
    row.dataset.notificationId = n.notificationId
    row.dataset.unread = String(!n.readAt)
    const title = doc.createElement('p')
    title.textContent = n.boardTitle
    title.className = 'srb-notification-title'
    const actor = n.actor as { username?: string; userId?: string } | undefined
    const subtitle = doc.createElement('p')
    subtitle.className = 'srb-notification-subtitle'
    const ownResult = actor?.userId === state?.account.user?.userId
    const result =
      n.invitation?.status === 'accepted'
        ? '接受'
        : n.invitation?.status === 'declined'
          ? '拒绝'
          : '处理'
    subtitle.textContent =
      n.type === 'invitationResult'
        ? ownResult
          ? n.invitation?.status === 'accepted'
            ? '你已加入这份协作看板'
            : `你已${result}邀请`
          : `${actor?.username ?? '成员'}${result}了你的邀请`
        : n.type === 'invitation'
          ? `${actor?.username ?? '成员'} 邀请你加入 · ${boardRoleLabel(String(n.invitation?.role ?? 'editor'))}`
          : ({
              memberRemoved: '你已被移出协作',
              sharingCancelled: '共享已取消',
              roleChanged: '协作权限已变更',
              invitationCancelled: '协作邀请已撤销',
              boardArchived: '协作看板已归档',
              boardRestored: '协作看板已恢复',
              sharingReopened: '协作看板重新开放'
            }[n.type] ?? '协作状态更新')
    if (!compact) return appendCenterRecord(row, n, title, subtitle)
    const time = doc.createElement('small')
    time.textContent = boardEditTime(n.createdAt)
    time.title = new Date(n.createdAt).toLocaleString()
    if (compact) {
      title.textContent = pending(n) ? `${actor?.username ?? '成员'} · ${n.boardTitle}` : `${n.boardTitle} · 协作`
      subtitle.textContent = pending(n) ? `${boardRoleLabel(String(n.invitation?.role ?? 'editor'))} · ${boardEditTime(n.createdAt)}` : subtitle.textContent
      row.append(title)
      if (pending(n)) row.append(subtitle)
    } else row.append(title, subtitle, time)
    if (pending(n)) {
      const controls = doc.createElement('div')
      controls.className = 'srb-notification-actions'
      controls.append(
        boardButton(doc, '拒绝', () => respond(n, 'decline', row)),
        boardButton(doc, '接受', () => respond(n, 'accept', row))
      )
      controls.lastElementChild?.classList.add('srb-primary')
      row.append(controls)
    } else {
      const status = doc.createElement('p')
      status.textContent =
        (
          {
            accepted: '已加入',
            declined: '已拒绝',
            cancelled: '已撤销',
            expired: '已过期'
          } as Record<string, string>
        )[String(n.invitation?.status)] ?? ''
      status.className = 'srb-notification-status'
      const footer = doc.createElement('div')
      footer.className = 'srb-notification-footer'
      if (!compact || n.invitation?.status !== 'accepted') footer.append(status)
      footer.classList.add('ework-notice-actions')
      row.append(footer)
      if (n.invitation?.status === 'accepted') {
        footer.append(
          boardButton(doc, '打开看板', () =>
            openBoardDestination(n.boardId)
          )
        )
        if (compact) footer.lastElementChild?.classList.add('ework-notice-primary')
      }
    }
    return row
  }
  function updateRecord() {
    const row = doc.createElement('article')
    row.className = 'srb-notification'
    row.dataset.updateNotification = latestUpdate?.availableVersion ?? ''
    row.dataset.unread = String(updateUnread())
    const title = doc.createElement('p')
    title.className = 'srb-notification-title'
    title.textContent = `版本更新 · ${latestUpdate?.availableVersion ?? ''}`
    const message = doc.createElement('p')
    message.className = 'srb-notification-subtitle'
    message.textContent = latestUpdate && liveUpdatePhase === latestUpdate.phase ? updateMessage(latestUpdate, 'zh') : ''
    const actions = appendLines(row, title, message, latestUpdateSeenAt)
    const details = () => {
      const browserPage = doc.querySelector('.eb-root:not([hidden])[data-native-page=true]')
      closePanel()
      revealWorkspace?.()
      if (!browserPage && latestUpdate?.releaseNotes && liveUpdatePhase === latestUpdate.phase &&
          ['available', 'downloading', 'preparing', 'downloaded', 'error'].includes(latestUpdate.phase)) {
        doc.dispatchEvent(new win.CustomEvent('ework-update-action', { detail: 'show' }))
      } else doc.dispatchEvent(new win.Event('ework-open-about'))
    }
    actions.append(boardButton(doc, '详情', details))
    row.addEventListener('click', event => {
      if (!(event.target as Element).closest('button')) details()
    })
    if (liveUpdatePhase === latestUpdate?.phase && (latestUpdate?.phase === 'available' || latestUpdate?.phase === 'downloaded' || latestUpdate?.phase === 'error')) actions.append(boardButton(doc, latestUpdate.phase === 'downloaded' ? '重启更新' : latestUpdate.phase === 'available' ? '更新' : updateErrorCopy(latestUpdate, 'zh').retryLabel, () => { doc.dispatchEvent(new win.CustomEvent('ework-update-action', { detail: latestUpdate?.phase === 'downloaded' ? 'install' : latestUpdate?.phase === 'error' ? 'retry' : 'download' })) }))
    if (updateUnread()) appendMarkRead(actions, () => markRead([], latestUpdate?.availableVersion), !!marking?.version)
    return row
  }
  function appendMarkRead(parent: HTMLElement, onRead: () => Promise<void>, pending = false) {
    const button = boardButton(doc, pending ? '标记中…' : '标为已读', onRead, '标记已读')
    button.classList.add('srb-notification-mark-read')
    button.disabled = !!marking
    parent.append(button)
  }
  function updateUnread() {
    return !!latestUpdate?.availableVersion && latestUpdate.availableVersion !== updateReadVersion
  }
  function closePanel() {
    panel?.remove()
    panel = undefined
    panelSignature = ''
    renderedFilter = undefined
    feedback = undefined
    clearFeedbackToast()
    bell?.setAttribute('aria-expanded', 'false')
    bell?.focus()
  }
  async function markAllRead() {
    const ids = state?.account.user ? state.notifications.notifications.filter(n => !n.readAt).map(n => n.notificationId) : []
    await markRead(ids, updateUnread() ? latestUpdate?.availableVersion : undefined, true)
  }
  async function markRead(ids: string[], version?: string, all = false) {
    if (marking || (!ids.length && !version)) return
    const openedPanel = panel, owner = account, generation = state?.account.generation
    const operation = { ids, version, all }
    marking = operation
    feedback = undefined
    renderPanel()
    const current = () => marking === operation && owner === account && generation === state?.account.generation
    try {
      for (let start = 0; start < ids.length; start += 100) {
        if (!current()) return
        await call('notifications.read', { notificationIds: ids.slice(start, start + 100) })
      }
      if (!current()) return
      if (version) {
        updateReadVersion = version
        try { win.localStorage.setItem('ework.update.read', version) } catch {}
      }
      if (ids.length) await refresh()
      reconcile()
      if (all && panel === openedPanel && current()) showReadSuccess()
    } catch {
      if (panel === openedPanel && current()) {
        feedback = { text: '标记已读失败，请重试。', retry: all ? markAllRead : () => markRead(ids, version) }
      }
    } finally {
      if (marking === operation) { marking = undefined; renderPanel() }
    }
  }
  async function retryConnection() {
    if (reconnecting) return
    reconnecting = true
    loadFailed = false
    renderPanel()
    try {
      await call('boards.refresh')
      await refresh()
    } catch {
      loadFailed = true
    } finally {
      reconnecting = false
      renderPanel()
    }
  }
  function renderPanel() {
    if (!panel) return
    // Transfer ticks must not replace controls between pointerdown and click.
    const signature = JSON.stringify([filter, state?.account.status, state?.account.user?.userId,
      state?.account.user ? state.notifications.notifications : [], updateReadVersion,
      latestUpdate?.availableVersion, latestUpdate?.phase, latestUpdate?.errorStage, liveUpdatePhase,
      marking, feedback, loadFailed, reconnecting, [...invitationStates]])
    if (signature === panelSignature) {
      const message = panel.querySelector('[data-update-notification] .srb-notification-subtitle')
      if (message) message.textContent = latestUpdate && liveUpdatePhase === latestUpdate.phase ? updateMessage(latestUpdate, 'zh') : ''
      return
    }
    panelSignature = signature
    const scrollTop = renderedFilter === filter ? panel.querySelector('.srb-notification-list')?.scrollTop ?? 0 : 0
    renderedFilter = filter
    const active = panel.contains(doc.activeElement) ? doc.activeElement as HTMLElement : undefined
    const activeFilter = active?.dataset.notificationFilter
    const activeLabel = active?.getAttribute('aria-label')
    const activeId = active?.closest<HTMLElement>('[data-notification-id]')?.dataset.notificationId
    panel.replaceChildren()
    const header = doc.createElement('header')
    const heading = doc.createElement('h2')
    heading.textContent = '消息中心'
    header.append(heading)
    const notifications = state?.account.user ? state.notifications.notifications : []
    const unread = notifications.filter(n => !n.readAt).length + Number(updateUnread())
    const read = boardButton(doc, marking?.all ? '标记中…' : '全部已读', markAllRead, '全部已读')
    read.className = 'srb-notifications-read'
    read.disabled = unread === 0 || !!marking
    header.append(read)
    const close = boardButton(doc, '', closePanel, '关闭消息中心')
    close.className = 'srb-notifications-close'
    close.append(icon(closeIcon, 12))
    header.append(close)
    const tabs = doc.createElement('nav')
    tabs.role = 'tablist'
    tabs.setAttribute('aria-label', '消息筛选')
    for (const [key, label] of [['all', '全部'], ['unread', `未读 ${unread}`]] as const) {
      const tab = boardButton(doc, label, () => {
        filter = key
        renderPanel()
        panel?.querySelector<HTMLButtonElement>(`[data-notification-filter="${key}"]`)?.focus()
      })
      tab.role = 'tab'
      tab.dataset.notificationFilter = key
      tab.id = `srb-notifications-tab-${key}`
      tab.setAttribute('aria-controls', 'srb-notifications-list')
      tab.setAttribute('aria-selected', String(filter === key))
      tab.tabIndex = filter === key ? 0 : -1
      tabs.append(tab)
    }
    panel.append(header, tabs)
    const list = doc.createElement('div')
    list.className = 'srb-notification-list'
    list.id = 'srb-notifications-list'
    list.role = 'tabpanel'
    list.setAttribute('aria-labelledby', `srb-notifications-tab-${filter}`)
    if (latestUpdate && (filter === 'all' || updateUnread())) list.append(updateRecord())
    const items = notifications.filter(n => filter === 'all' || !n.readAt)
    for (const n of items) list.append(record(n))
    const cached = notifications.length > 0 || !!latestUpdate
    const loading = reconnecting || (!state && !loadFailed) || state?.account.status === 'loading'
    const unavailable = loadFailed || state?.account.status === 'unavailable'
    if (!list.childElementCount) {
      if (!cached && loading) {
        list.setAttribute('aria-busy', 'true')
        for (let index = 0; index < 3; index++) {
          const skeleton = doc.createElement('div')
          skeleton.className = 'srb-notification-skeleton'
          skeleton.setAttribute('aria-hidden', 'true')
          skeleton.append(doc.createElement('span'), doc.createElement('span'), doc.createElement('span'))
          list.append(skeleton)
        }
      } else {
        const empty = doc.createElement('div')
        empty.className = 'srb-notification-empty'
        const title = doc.createElement('strong')
        const initialError = !cached && unavailable
        title.textContent = initialError ? '消息加载失败' : filter === 'unread' ? '暂无未读消息' : '暂无消息'
        const description = doc.createElement('p')
        description.textContent = initialError ? '请检查连接后重试' : filter === 'unread' ? '新的未读消息会出现在这里' : '协作邀请和版本更新会显示在这里'
        empty.append(icon(emptyIcon, 22), title, description)
        if (initialError) {
          const retry = boardButton(doc, '重试', retryConnection)
          retry.className = 'srb-primary'
          empty.append(retry)
        } else if (filter === 'unread') {
          empty.append(boardButton(doc, '查看全部', () => panel?.querySelector<HTMLButtonElement>('[data-notification-filter=all]')?.click()))
        }
        list.append(empty)
      }
    }
    panel.append(list)
    if (cached && (loading || unavailable)) {
      const status = doc.createElement('div')
      status.className = 'srb-notifications-service'
      status.role = 'status'
      status.textContent = loading ? '正在重连协作服务…' : '协作服务暂不可用。'
      if (!loading) status.append(boardButton(doc, '重试连接', retryConnection))
      panel.append(status)
    }
    if (feedback) {
      const status = doc.createElement('div')
      status.className = 'srb-notifications-feedback'
      status.role = 'alert'
      status.textContent = feedback.text
      if (feedback.retry) status.append(boardButton(doc, '重试', feedback.retry))
      panel.append(status)
    }
    list.scrollTop = scrollTop
    anchor(panel)
    if (active) {
      const replacement = [...panel.querySelectorAll<HTMLButtonElement>('button')].find(button => activeFilter
        ? button.dataset.notificationFilter === activeFilter
        : button.getAttribute('aria-label') === activeLabel && button.closest<HTMLElement>('[data-notification-id]')?.dataset.notificationId === activeId)
      ;(replacement ?? panel.querySelector<HTMLButtonElement>('[aria-selected=true]'))?.focus()
    }
  }
  function showNext() {
    if (disposed || doc.visibilityState === 'hidden' || bubble || !bell || !state?.account.user) return
    if (burst >= 3 && queue.length) {
      aggregate.push(...queue)
      queue = []
    }
    const n = queue.shift()
    if (!n && !aggregate.length) {
      burst = 0
      return
    }
    activeNotification = n
    bubble = doc.createElement('aside')
    bubble.className = 'srb-bubble ework-sidebar-notice'
    bubble.setAttribute('aria-live', 'polite')
    bubble.setAttribute('aria-label', n ? '新的协作邀请' : '协作邀请提醒')
    const head = doc.createElement('header')
    const title = doc.createElement('strong')
    title.textContent = n ? '收到协作邀请' : `还有 ${aggregate.length} 条协作邀请`
    const close = boardButton(doc, '', () => closeBubble(), '关闭提醒')
    close.className = 'ework-notice-close'
    close.append(noticeIcon(doc, 'close'))
    head.append(noticeIcon(doc, 'users'), title, close)
    bubble.append(head)
    if (n) {
      burst++
      bubble.append(record(n, true))
    } else {
      const description = doc.createElement('p')
      description.textContent = '前往消息中心统一处理。'
      description.className = 'ework-notice-description'
      bubble.append(description)
      const actions = doc.createElement('div')
      actions.className = 'ework-notice-actions'
      bubble.append(actions)
      actions.append(
        boardButton(doc, '查看消息', () => {
          closeBubble(false)
          openPanel()
        })
      )
      actions.lastElementChild?.classList.add('ework-notice-primary')
    }
    doc.body.append(bubble)
    anchor(bubble)
    remaining = 10000
    hover = false
    focused = false
    bubble.addEventListener('pointerenter', () => {
      hover = true
      pause()
    })
    bubble.addEventListener('pointerleave', () => {
      hover = false
      resume()
    })
    bubble.addEventListener('focusin', () => {
      focused = true
      pause()
    })
    bubble.addEventListener('focusout', () => {
      queueMicrotask(() => {
        focused = !!bubble?.contains(doc.activeElement)
        resume()
      })
    })
    bubble.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeBubble()
      }
    })
    resume()
  }
  function setBubbleHeading(n: Notification) {
    const title = bubble?.querySelector('header strong')
    if (title) title.textContent = pending(n) ? '收到协作邀请' : n.invitation?.status === 'accepted' ? '已加入协作看板' : '协作邀请已处理'
    const icon = bubble?.querySelector('header .ework-notice-icon')
    if (icon && !pending(n)) icon.replaceWith(noticeIcon(doc, 'check'))
  }
  function reconcileActiveBubble() {
    if (!bubble || !activeNotification) return
    const next = state?.notifications.notifications.find(
      (n) => n.notificationId === activeNotification!.notificationId
    )
    if (next && JSON.stringify(next) === JSON.stringify(activeNotification))
      return
    const previous = bubble.querySelector('.srb-notification')
    if (!previous) return
    const focus = doc.activeElement as HTMLElement | null
    const hadFocus = !!focus && previous.contains(focus)
    const label = focus?.getAttribute('aria-label') ?? focus?.textContent
    pause()
    if (next) {
      activeNotification = next
      const row = record(next, true)
      setBubbleHeading(next)
      previous.replaceWith(row)
      if (hadFocus) {
        const target =
          [...row.querySelectorAll('button')].find(
            (b) => (b.getAttribute('aria-label') ?? b.textContent) === label
          ) ?? bubble.querySelector<HTMLButtonElement>('header button')
        target?.focus()
      }
    } else {
      previous.textContent = '此邀请已不可用，请在消息中心查看最新状态。'
      if (hadFocus)
        bubble.querySelector<HTMLButtonElement>('header button')?.focus()
      activeNotification = undefined
    }
    focused = bubble.contains(doc.activeElement)
    resume()
  }
  function openPanel() {
    if (panel) { closePanel(); return }
    filter = 'all'
    panel = doc.createElement('section')
    panel.className = 'srb-notifications'
    panel.role = 'dialog'
    panel.setAttribute('aria-label', '消息中心')
    doc.body.append(panel)
    bell?.setAttribute('aria-expanded', 'true')
    renderPanel()
    panel.querySelector<HTMLButtonElement>('[aria-selected=true]')?.focus()
  }
  function reconcile() {
    if (disposed) return
    const host = doc.querySelector('[data-research-board-bell-host]')
    if (!host) return
    if (!bell?.isConnected || bell.parentElement !== host) {
      bell?.remove()
      bell = boardButton(doc, '', openPanel, '消息中心')
      bell.className = 'srb-bell'
      bell.setAttribute('aria-haspopup', 'dialog')
      bell.setAttribute('aria-expanded', 'false')
      bell.innerHTML = '<span class="srb-bell-icon" aria-hidden="true"></span>'
      host.append(bell)
    }
    const unread = (state?.account.user ? state.notifications.unreadCount : 0) + Number(updateUnread())
    bell.dataset.unread = String(unread > 0)
    bell.setAttribute('aria-description', unread ? `${unread} 条未读消息` : '')
    showNext()
    if (bubble) { anchor(bubble); resume() }
  }
  function receive(next: ResearchBoardsState) {
    if (disposed || next.eventSeq < lastSeq) return
    lastSeq = next.eventSeq
    const id = next.account.user?.userId ?? ''
    if (id !== account) {
      closeBubble(false)
      if (panel && account) closePanel()
      queue = []
      aggregate = []
      burst = 0
      account = id
      marking = undefined
      invitationStates.clear()
      shown = new Map()
      try {
        shown = new Map(
          JSON.parse(
            win.localStorage.getItem(
              `sherlock.boards.displayed.${account}`
            ) ?? '[]'
          )
        )
      } catch {}
    }
    state = next
    loadFailed = false
    const fresh = next.notifications.notifications.filter(
      (n) =>
        pending(n) && (shown.get(n.notificationId) ?? -1) < n.eventVersion
    )
    for (const n of fresh) {
      if (
        activeNotification?.invitation?.invitationId &&
        activeNotification.invitation.invitationId ===
          n.invitation?.invitationId
      ) {
        continue
      }
      if (
        ![...queue, ...aggregate].some(
          (q) =>
            q.notificationId === n.notificationId &&
            q.eventVersion === n.eventVersion
        )
      ) {
        queue.push(n)
      }
    }
    persist()
    queue = queue
      .map((n) =>
        next.notifications.notifications.find(
          (current) => current.notificationId === n.notificationId
        )!
      )
      .filter((n) => n && pending(n))
    reconcileActiveBubble()
    reconcile()
    renderPanel()
  }
  async function refresh() {
    receive(await bridge.getSnapshot())
  }
  const receiveUpdate = () => {
    try {
      const update = JSON.parse(doc.documentElement.dataset.eworkUpdateStatus ?? 'null') as UpdateStatus | null
      liveUpdatePhase = update?.phase
      // A historical version supplies the record identity, not the failed operation.
      const next = normalizeUpdateNotification(update) ?? (['error', 'up-to-date'].includes(update?.phase ?? '') && latestUpdate ? normalizeUpdateNotification({ ...update, availableVersion: latestUpdate.availableVersion, errorStage: update?.phase === 'error' ? updateErrorStage(update) : undefined }) : undefined)
      if (next) {
        if (update?.availableVersion && (!latestUpdateSeenAt || latestUpdate?.availableVersion !== next.availableVersion)) latestUpdateSeenAt = Date.now()
        latestUpdate = next
        saveUpdateNotification(win.localStorage, next)
      }
      else if (latestUpdate?.availableVersion && update?.currentVersion && updateNotificationVersionInstalled(update.currentVersion, latestUpdate.availableVersion)) {
        latestUpdate = { currentVersion: update.currentVersion, availableVersion: latestUpdate.availableVersion, phase: 'up-to-date', manual: false }
        liveUpdatePhase = 'up-to-date'
        saveUpdateNotification(win.localStorage, latestUpdate)
      }
      if (['downloading', 'preparing', 'downloaded', 'installing'].includes(update?.phase ?? '')) pause()
      else resume()
      reconcile()
      renderPanel()
    } catch {}
  }
  doc.addEventListener('ework-update-status', receiveUpdate)
  receiveUpdate()
  const off = bridge.subscribe((event) => {
    if (event.type === 'state') receive(event.state)
  })
  const observer = new win.MutationObserver(reconcile)
  observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-notice-unpositioned'] })
  const visibility = () => { if (doc.visibilityState === 'hidden') pause(); else { reconcile(); resume() } }
  doc.addEventListener('visibilitychange', visibility)
  void refresh().catch(() => { loadFailed = true; renderPanel() })
  reconcile()
  const outside = (e: Event) => {
    if (
      panel &&
      !panel.contains(e.target as Node) &&
      !bell?.contains(e.target as Node)
    ) {
      closePanel()
    }
  }
  const keyboard = (event: KeyboardEvent) => {
    if (!panel) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closePanel()
      return
    }
    if (!panel.contains(event.target as Node)) return
    const target = event.target as HTMLElement
    if (target.role === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const tabs = [...panel.querySelectorAll<HTMLButtonElement>('[role=tab]')]
      const index = tabs.indexOf(target as HTMLButtonElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length
      tabs[next]?.click()
    } else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault()
      const rows = [...panel.querySelectorAll<HTMLElement>('.srb-notification')]
        .flatMap(row => {
          const action = row.querySelector<HTMLButtonElement>('button:not(:disabled)')
          return action ? [{ row, action }] : []
        })
      if (!rows.length) return
      const index = rows.findIndex(({ row }) => row.contains(target))
      const next = event.key === 'ArrowUp' ? (index < 0 ? rows.length - 1 : (index + rows.length - 1) % rows.length) : (index + 1) % rows.length
      rows[next]?.action.focus()
    }
  }
  doc.addEventListener('keydown', keyboard)
  doc.addEventListener('pointerdown', outside)
  const resize = () => {
    if (panel) anchor(panel)
    if (bubble) anchor(bubble)
  }
  win.addEventListener('resize', resize)
  return () => {
    disposed = true
    off()
    observer.disconnect()
    doc.removeEventListener('visibilitychange', visibility)
    closeBubble(false)
    clearFeedbackToast()
    panel?.remove()
    bell?.remove()
    doc.removeEventListener('keydown', keyboard)
    doc.removeEventListener('pointerdown', outside)
    doc.removeEventListener('ework-update-status', receiveUpdate)
    win.removeEventListener('resize', resize)
  }
}
