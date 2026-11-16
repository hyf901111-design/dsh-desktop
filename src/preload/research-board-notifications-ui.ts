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
  bridge: ResearchBoardsBridge
) {
  const win = doc.defaultView!
  installBoardUiStyles(doc)
  installSidebarNoticeStyles(doc)
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
    const width = Math.min(384, win.innerWidth - 24)
    el.style.left = `${Math.max(12, Math.min((bounds?.left ?? 0) + 16, win.innerWidth - width - 12))}px`
    // Keep a fixed panel above the account footer; only its list scrolls.
    const bottom = Math.min(76, Math.max(12, win.innerHeight - 92))
    el.style.bottom = `${bottom}px`
    el.style.maxHeight = `min(440px, calc(100vh - ${bottom + 12}px))`
    el.style.height = el.style.maxHeight
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
      const result = await call<{ invitation: { status: string } }>(
        'invitation.respond',
        {
          invitationId: n.invitation?.invitationId ?? n.invitation?.id,
          version: n.invitation?.version,
          decision
        }
      )
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
            requestBoardPageAction(doc, 'open', n.boardId).catch((e) => {
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
            requestBoardPageAction(doc, 'open', n.boardId)
          )
        )
        if (compact) footer.lastElementChild?.classList.add('ework-notice-primary')
      }
    }
    if (!compact && !n.readAt) {
      appendMarkRead(row, () => markRead([n.notificationId]))
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
    row.append(title, message)
    const actions = doc.createElement('div')
    actions.className = 'srb-notification-actions'
    actions.append(boardButton(doc, '详情', () => {
      closePanel()
      if (latestUpdate?.releaseNotes && liveUpdatePhase === latestUpdate.phase &&
          ['available', 'downloading', 'preparing', 'downloaded', 'error'].includes(latestUpdate.phase)) {
        doc.dispatchEvent(new win.CustomEvent('ework-update-action', { detail: 'show' }))
      } else doc.dispatchEvent(new win.Event('ework-open-about'))
    }))
    if (liveUpdatePhase === latestUpdate?.phase && (latestUpdate?.phase === 'available' || latestUpdate?.phase === 'downloaded' || latestUpdate?.phase === 'error')) actions.append(boardButton(doc, latestUpdate.phase === 'downloaded' ? '重启更新' : latestUpdate.phase === 'available' ? '更新' : updateErrorCopy(latestUpdate, 'zh').retryLabel, () => { doc.dispatchEvent(new win.CustomEvent('ework-update-action', { detail: latestUpdate?.phase === 'downloaded' ? 'install' : latestUpdate?.phase === 'error' ? 'retry' : 'download' })) }))
    row.append(actions)
    if (updateUnread()) appendMarkRead(row, () => markRead([], latestUpdate?.availableVersion))
    return row
  }
  function appendMarkRead(row: HTMLElement, onRead: () => Promise<void>) {
    const button = boardButton(doc, '标记已读', onRead)
    button.classList.add('srb-notification-mark-read')
    row.append(button)
  }
  function updateUnread() {
    return !!latestUpdate?.availableVersion && latestUpdate.availableVersion !== updateReadVersion
  }
  function closePanel() {
    panel?.remove()
    panel = undefined
    panelSignature = ''
    bell?.setAttribute('aria-expanded', 'false')
    bell?.focus()
  }
  async function markAllRead() {
    const ids = state?.account.user ? state.notifications.notifications.filter(n => !n.readAt).map(n => n.notificationId) : []
    await markRead(ids, latestUpdate?.availableVersion)
  }
  async function markRead(ids: string[], version?: string) {
    const openedPanel = panel, owner = account, generation = state?.account.generation
    try {
      for (let start = 0; start < ids.length; start += 100) {
        if (owner !== account || generation !== state?.account.generation) return
        await call('notifications.read', { notificationIds: ids.slice(start, start + 100) })
      }
      if (owner !== account || generation !== state?.account.generation) return
      if (version) {
        updateReadVersion = version
        try { win.localStorage.setItem('ework.update.read', version) } catch {}
      }
      reconcile()
      renderPanel()
      if (ids.length) await refresh()
    } catch (error) {
      if (panel !== openedPanel || !panel || owner !== account || generation !== state?.account.generation) return
      panel.querySelector('[role=alert]')?.remove()
      const status = doc.createElement('p')
      status.role = 'alert'
      status.textContent = (error as Error).message || '标记已读失败，请重试。'
      panel.append(status)
    }
  }
  function renderPanel() {
    if (!panel) return
    // Transfer ticks must not replace controls between pointerdown and click.
    const signature = JSON.stringify([filter, state?.account.status, state?.account.user?.userId,
      state?.account.user ? state.notifications.notifications : [], updateReadVersion,
      latestUpdate?.availableVersion, latestUpdate?.phase, latestUpdate?.errorStage, liveUpdatePhase])
    if (signature === panelSignature) {
      const message = panel.querySelector('[data-update-notification] .srb-notification-subtitle')
      if (message) message.textContent = latestUpdate && liveUpdatePhase === latestUpdate.phase ? updateMessage(latestUpdate, 'zh') : ''
      return
    }
    panelSignature = signature
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
    if (notifications.length || latestUpdate) {
      const read = boardButton(doc, '全部已读', markAllRead)
      read.className = 'srb-notifications-read'
      header.append(read)
    }
    const close = boardButton(doc, '', closePanel, '关闭消息中心')
    close.className = 'srb-notifications-close'
    close.append(noticeIcon(doc, 'close'))
    header.append(close)
    const tabs = doc.createElement('nav')
    tabs.role = 'tablist'
    tabs.setAttribute('aria-label', '消息筛选')
    const unread = notifications.filter(n => !n.readAt).length + Number(updateUnread())
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
    if (!list.childElementCount) {
      const empty = doc.createElement('div')
      empty.className = 'srb-notification-empty'
      const title = doc.createElement('strong')
      title.textContent = filter === 'unread' ? '暂无未读消息' : '暂无消息'
      const description = doc.createElement('p')
      description.textContent = '协作邀请和版本更新会显示在这里'
      empty.append(title, description)
      list.append(empty)
    }
    if (state?.account.status === 'loading' || state?.account.status === 'unavailable') {
      const status = doc.createElement('div')
      status.className = 'srb-notifications-service'
      status.append(doc.createTextNode(state.account.status === 'loading' ? '正在连接协作服务…' : '协作服务暂不可用。'),
        boardButton(doc, '重试连接', async () => { await call('boards.refresh'); await refresh() }))
      list.append(status)
    }
    panel.append(list)
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
    bell.dataset.unread = String(
      updateUnread() || (!!state && state.notifications.unreadCount > 0)
    )
    showNext()
    if (bubble) { anchor(bubble); resume() }
  }
  function receive(next: ResearchBoardsState) {
    if (disposed || next.eventSeq < lastSeq) return
    lastSeq = next.eventSeq
    const id = next.account.user?.userId ?? ''
    if (id !== account) {
      closeBubble(false)
      if (panel) closePanel()
      queue = []
      aggregate = []
      burst = 0
      account = id
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
      if (next) { latestUpdate = next; saveUpdateNotification(win.localStorage, next) }
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
  void refresh().catch(() => {})
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
      const buttons = [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      const index = buttons.indexOf(target as HTMLButtonElement)
      buttons[(index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length]?.focus()
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
    panel?.remove()
    bell?.remove()
    doc.removeEventListener('keydown', keyboard)
    doc.removeEventListener('pointerdown', outside)
    doc.removeEventListener('ework-update-status', receiveUpdate)
    win.removeEventListener('resize', resize)
  }
}
