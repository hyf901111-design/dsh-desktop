import type { UpdateStatus } from '../shared/contracts'
import { installSidebarNoticeStyles, noticeIcon, positionSidebarNotice } from './sidebar-notice'
import { updateMessage } from './update-view'
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
    filter = 'all',
    disposed = false,
    initialized = false,
    lastSeq = -1,
    account = '',
    shown = new Map<string, number>(),
    queue: Notification[] = [],
    burst = 0,
    aggregate = 0
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
    const r = bell?.getBoundingClientRect()
    if (!r) return
    el.style.left = `${Math.max(12, Math.min(r.left, win.innerWidth - 372))}px`
    el.style.bottom = `${Math.max(12, Math.min(win.innerHeight - r.top + 8, win.innerHeight - 80))}px`
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
    if (hover || focused || !bubble || countdown || ['downloading', 'downloaded', 'installing'].includes(liveUpdatePhase ?? '')) return
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
    const status = doc.createElement('p')
    status.role = 'status'
    root.append(status)
    status.textContent = decision === 'accept' ? '加入中…' : '处理中…'
    if (root.closest('.srb-bubble')) {
      status.hidden = true
      const action = buttons[decision === 'accept' ? buttons.length - 1 : 0]
      if (action) action.textContent = status.textContent
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
      if (n.invitation?.status === 'accepted')
        footer.append(
          boardButton(doc, '打开看板', () =>
            requestBoardPageAction(doc, 'open', n.boardId)
          )
        )
    }
    return row
  }
  function updateRecord() {
    const row = doc.createElement('article')
    row.className = 'srb-notification'
    row.dataset.updateNotification = latestUpdate?.availableVersion ?? ''
    const title = doc.createElement('p')
    title.className = 'srb-notification-title'
    title.textContent = `版本更新 · ${latestUpdate?.availableVersion ?? ''}`
    const message = doc.createElement('p')
    message.textContent = latestUpdate && liveUpdatePhase === latestUpdate.phase ? updateMessage(latestUpdate, 'zh') : ''
    row.append(title, message)
    const actions = doc.createElement('div')
    actions.className = 'srb-notification-actions'
    actions.append(boardButton(doc, '详情', () => {
      panel?.remove(); panel = undefined; bell?.setAttribute('aria-expanded', 'false')
      doc.dispatchEvent(new win.Event('ework-open-about'))
    }))
    if (liveUpdatePhase === latestUpdate?.phase && (latestUpdate?.phase === 'available' || latestUpdate?.phase === 'error')) actions.append(boardButton(doc, latestUpdate.phase === 'available' ? '更新' : '重新下载', () => { doc.dispatchEvent(new win.CustomEvent('ework-update-action', { detail: latestUpdate?.phase === 'error' ? 'retry' : 'download' })) }))
    row.append(actions)
    return row
  }
  function renderPanel() {
    if (!panel) return
    panel.replaceChildren()
    const header = doc.createElement('header')
    header.append(
      doc.createTextNode('消息中心'),
      boardButton(
        doc,
        '×',
        () => {
          panel?.remove()
          panel = undefined
          bell?.setAttribute('aria-expanded', 'false')
        },
        '关闭消息中心'
      )
    )
    panel.append(header)
    if (latestUpdate && filter === 'all') panel.append(updateRecord())
    if (
      state?.account.status === 'loading' ||
      state?.account.status === 'unavailable'
    ) {
      panel.append(
        doc.createTextNode(
          state.account.status === 'loading'
            ? '正在连接协作服务…'
            : '协作服务暂不可用。'
        ),
        boardButton(doc, '重试连接', async () => {
          await call('boards.refresh')
          await refresh()
        })
      )
      anchor(panel)
      return
    }
    if (!state?.account.user) {
      panel.append(
        doc.createTextNode('登录后查看协作邀请。'),
        boardButton(doc, '登录', () => requestBoardPageAction(doc, 'login'))
      )
      anchor(panel)
      return
    }
    const tabs = doc.createElement('nav')
    for (const [key, label] of [
      ['all', '全部'],
      ['pending', '待处理']
    ]) {
      const b = boardButton(doc, label!, () => {
        filter = key!
        renderPanel()
      })
      b.role = 'tab'
      b.setAttribute('aria-selected', String(filter === key))
      tabs.append(b)
    }
    tabs.append(
      boardButton(doc, '全部标为已读', async () => {
        await call('notifications.read', {})
        await refresh()
      })
    )
    panel.append(tabs)
    const items = state.notifications.notifications.filter(
      (n) => filter === 'all' || pending(n)
    )
    const list = doc.createElement('div')
    list.className = 'srb-notification-list'
    if (!items.length && !(latestUpdate && filter === 'all')) {
      const empty = doc.createElement('div')
      empty.className = 'srb-notification-empty'
      empty.textContent = filter === 'pending' ? '没有待处理的邀请' : '暂无消息'
      list.append(empty)
    }
    for (const n of items) list.append(record(n))
    panel.append(list)
    anchor(panel)
  }
  function showNext() {
    if (disposed || bubble || !bell || !state?.account.user) return
    if (burst >= 3 && queue.length) {
      aggregate += queue.length
      queue = []
    }
    const n = queue.shift()
    if (!n && !aggregate) {
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
    title.textContent = n ? '收到协作邀请' : `还有 ${aggregate} 条协作邀请`
    const close = boardButton(doc, '', () => closeBubble(), '关闭提醒')
    close.className = 'ework-notice-close'
    close.append(noticeIcon(doc, 'close'))
    head.append(noticeIcon(doc, 'users'), title, close)
    bubble.append(head)
    if (n) {
      burst++
      shown.set(n.notificationId, n.eventVersion)
      persist()
      bubble.append(record(n, true))
    } else {
      aggregate = 0
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
    if (panel) {
      panel.remove()
      panel = undefined
      bell?.setAttribute('aria-expanded', 'false')
      return
    }
    if (latestUpdate?.availableVersion) {
      updateReadVersion = latestUpdate.availableVersion
      try { win.localStorage.setItem('ework.update.read', updateReadVersion) } catch {}
    }
    panel = doc.createElement('section')
    panel.className = 'srb-notifications'
    panel.setAttribute('aria-label', '消息中心')
    doc.body.append(panel)
    bell?.setAttribute('aria-expanded', 'true')
    renderPanel()
    const ids =
      state?.notifications.notifications
        .filter((n) => n.readAt === null)
        .map((n) => n.notificationId) ?? []
    if (ids.length) {
      const openedPanel = panel,
        owner = account,
        generation = state?.account.generation
      void (async () => {
        for (let start = 0; start < ids.length; start += 100) {
          if (owner !== account || generation !== state?.account.generation)
            return
          await call('notifications.read', {
            notificationIds: ids.slice(start, start + 100)
          })
        }
        if (owner === account && generation === state?.account.generation)
          await refresh()
      })().catch((error) => {
        if (
          panel !== openedPanel ||
          owner !== account ||
          generation !== state?.account.generation
        )
          return
        const status = doc.createElement('p')
        status.role = 'alert'
        status.textContent =
          (error as Error).message || '标记已读失败，请重新打开消息中心重试。'
        panel.append(status)
      })
    }
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
      bell.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>'
      host.append(bell)
    }
    bell.dataset.unread = String(
      (!!latestUpdate?.availableVersion && latestUpdate.availableVersion !== updateReadVersion) ||
      (!!state && (state.notifications.unreadCount > 0 || state.notifications.pendingCount > 0))
    )
    showNext()
  }
  function receive(next: ResearchBoardsState) {
    if (disposed || next.eventSeq < lastSeq) return
    lastSeq = next.eventSeq
    const id = next.account.user?.userId ?? ''
    if (id !== account) {
      closeBubble(false)
      panel?.remove()
      panel = undefined
      queue = []
      aggregate = 0
      burst = 0
      initialized = false
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
    if (id && !initialized) {
      aggregate = fresh.length
      fresh.forEach((n) => shown.set(n.notificationId, n.eventVersion))
      persist()
      initialized = true
    } else
      for (const n of fresh) {
        if (
          activeNotification?.invitation?.invitationId &&
          activeNotification.invitation.invitationId ===
            n.invitation?.invitationId
        ) {
          shown.set(n.notificationId, n.eventVersion)
          continue
        }
        if (
          !queue.some(
            (q) =>
              q.notificationId === n.notificationId &&
              q.eventVersion === n.eventVersion
          )
        ) {
          queue.push(n)
          shown.set(n.notificationId, n.eventVersion)
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
      const next = normalizeUpdateNotification(update) ?? (['error', 'up-to-date'].includes(update?.phase ?? '') && latestUpdate ? normalizeUpdateNotification({ ...update, availableVersion: latestUpdate.availableVersion }) : undefined)
      if (next) { latestUpdate = next; saveUpdateNotification(win.localStorage, next) }
      else if (latestUpdate?.availableVersion && update?.currentVersion && updateNotificationVersionInstalled(update.currentVersion, latestUpdate.availableVersion)) {
        latestUpdate = { currentVersion: update.currentVersion, availableVersion: latestUpdate.availableVersion, phase: 'up-to-date', manual: false }
        liveUpdatePhase = 'up-to-date'
        saveUpdateNotification(win.localStorage, latestUpdate)
      }
      if (['downloading', 'downloaded', 'installing'].includes(update?.phase ?? '')) pause()
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
  observer.observe(doc.documentElement, { childList: true, subtree: true })
  void refresh().catch(() => {})
  reconcile()
  const outside = (e: Event) => {
    if (
      panel &&
      !panel.contains(e.target as Node) &&
      !bell?.contains(e.target as Node)
    ) {
      panel.remove()
      panel = undefined
      bell?.setAttribute('aria-expanded', 'false')
    }
  }
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
    closeBubble(false)
    panel?.remove()
    bell?.remove()
    doc.removeEventListener('pointerdown', outside)
    doc.removeEventListener('ework-update-status', receiveUpdate)
    win.removeEventListener('resize', resize)
  }
}
