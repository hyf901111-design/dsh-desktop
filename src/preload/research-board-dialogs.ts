import { installSidebarScrollFade } from './sidebar-scroll-fade'
import type { BoardsResult } from '../shared/research-boards'
export type BoardAction = <T = unknown>(
  action: string,
  input?: unknown
) => Promise<T>
export const boardRoleLabel = (role?: string) =>
  role === 'owner' ? '创建者' : role === 'editor' ? '可编辑成员' : '仅查看成员'
export const publicIdLabel = (id: string) =>
  id.replace(/^(\d{4})(\d{4})(\d{2})$/, '$1 $2 $3')
export function normalizePublicId(value: string) {
  return value.replace(/^\s*ID\s*/i, '').replace(/\s/g, '')
}
export function boardErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const code = String((error as { code?: unknown } | null)?.code ?? message)
  const messages: Record<string, string> = {
    BOARD_ACCESS_CHANGED: '画板的协作状态已更新。请重新打开画板后再试。',
    ACCESS_REVOKED: '你已没有此画板的访问权限，请联系创建者重新邀请。',
    ACCESS_DENIED: '你已没有此画板的访问权限，请联系创建者重新邀请。',
    PERMISSION_DENIED: '你目前没有执行此操作的权限，请联系画板创建者。',
    BOARD_NOT_FOUND: '这个画板已不可用，可能已被删除或取消共享。',
    READ_ONLY: '你目前只有查看权限，请联系创建者开通编辑权限。',
    FORBIDDEN: '你目前没有执行此操作的权限，请联系画板创建者。',
    SESSION_CHANGED: '登录状态已更新，请重新打开画板后再试。',
    EXECUTION_STILL_STOPPING: '上一次任务正在停止，请稍等片刻后重试。',
    TARGET_NOT_FOUND: '原组件已被移除，请重新发起研究以创建新组件。',
    REFERENCED_SOURCE_CHANGED: '引用的资料已变化，请重新选择资料后发起研究。',
    QUEUE_ALREADY_STARTED: '这条消息已开始执行，请刷新后查看。',
    REQUEST_AUTHOR_REQUIRED: '只能操作自己发送的排队消息。',
    CONVERSATION_BUSY: '看板正在执行其他任务，这条消息将按顺序执行。',
    REQUEST_NOT_FOUND: '这条任务的本地记录已不可用，请重新发起研究。'
  }
  return messages[code] ?? (/^[A-Z][A-Z0-9_]+$/.test(message) || !message
    ? '操作暂时未完成，请稍后重试。'
    : message)
}
export function showBoardError(doc: Document, error: unknown) {
  const d = boardDialog(doc, '操作未完成')
  const message = doc.createElement('p')
  message.className = 'srb-error-message'
  message.textContent = boardErrorMessage(error)
  d.body.append(message)
  return d
}
export async function unwrapBoardReply<T>(
  reply: Promise<BoardsResult>
): Promise<T> {
  const result = await reply
  if (!result.ok)
    throw Object.assign(
      new Error(result.error.message || result.error.code),
      result.error
    )
  return result.value as T
}
export function boardButton(
  doc: Document,
  text: string,
  action: () => void | Promise<unknown>,
  label = text
) {
  const b = doc.createElement('button')
  b.type = 'button'
  b.textContent = text
  b.setAttribute('aria-label', label)
  b.addEventListener('click', () => {
    void action()
  })
  return b
}
/** A dialog-owned top-layer permission menu; choosing a value only emits change. */
export function boardRolePicker(doc: Document, label: string, value = 'editor') {
  const win = doc.defaultView!
  const picker = doc.createElement('button')
  picker.type = 'button'
  picker.className = 'srb-role-picker'
  picker.value = value
  picker.setAttribute('aria-label', label)
  picker.setAttribute('aria-haspopup', 'menu')
  picker.setAttribute('aria-expanded', 'false')
  const title = doc.createElement('span'), chevron = doc.createElement('span')
  title.id = 'srb-role-value-' + win.crypto.randomUUID()
  picker.setAttribute('aria-describedby', title.id)
  chevron.className = 'srb-chevron'
  chevron.setAttribute('aria-hidden', 'true')
  const update = () => { title.textContent = picker.value === 'editor' ? '可编辑' : '仅查看' }
  picker.append(title, chevron)
  picker.addEventListener('change', update)
  update()
  let dismiss: (() => void) | undefined
  const open = () => {
    if (picker.disabled || picker.closest('[inert]') || !picker.isConnected) return
    if (dismiss) { dismiss(); return }
    doc.querySelectorAll('.srb-role-menu').forEach(menu => menu.dispatchEvent(new win.Event('srb-close')))
    const menu = doc.createElement('div')
    menu.className = 'srb-role-menu'
    menu.id = 'srb-role-menu-' + win.crypto.randomUUID()
    menu.setAttribute('popover', 'manual')
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', label + '选项')
    picker.setAttribute('aria-controls', menu.id)
    const dialog = picker.closest('dialog')
    const options = [
      ['editor', '可编辑', '查看并编辑画板中的内容。'],
      ['viewer', '仅查看', '查看画板内容，不能进行编辑。']
    ].map(([role, name, description]) => {
      const option = doc.createElement('button')
      option.type = 'button'
      option.setAttribute('role', 'menuitemradio')
      option.setAttribute('aria-checked', String(role === picker.value))
      option.tabIndex = -1
      option.dataset.value = role
      const text = doc.createElement('span'), detail = doc.createElement('small'), check = doc.createElement('span')
      text.textContent = name!
      detail.textContent = description!
      detail.id = menu.id + '-' + role
      option.setAttribute('aria-label', name!)
      option.setAttribute('aria-describedby', detail.id)
      check.className = 'srb-role-check'
      check.setAttribute('aria-hidden', 'true')
      option.append(text, detail, check)
      option.addEventListener('click', () => {
        if (!picker.isConnected || picker.disabled || picker.closest('[inert]')) { close(); return }
        close(true)
        if (picker.value === role) return
        picker.value = role!
        picker.dispatchEvent(new win.Event('change', { bubbles: true }))
      })
      menu.append(option)
      return option
    })
    const close = (focus = false) => {
      if (!dismiss) return
      dismiss = undefined
      observer.disconnect()
      menu.hidePopover?.(); menu.remove()
      picker.setAttribute('aria-expanded', 'false')
      picker.removeAttribute('aria-controls')
      doc.removeEventListener('pointerdown', outside, true)
      doc.removeEventListener('focusin', outside, true)
      doc.removeEventListener('keydown', key, true)
      doc.removeEventListener('scroll', position, true)
      win.removeEventListener('resize', position)
      dialog?.removeEventListener('close', onDialogClose)
      if (focus && picker.isConnected && !picker.disabled) picker.focus({ preventScroll: true })
    }
    const position = () => {
      if (!picker.isConnected || picker.disabled || picker.closest('[inert],[hidden]')) { close(); return }
      const rect = picker.getBoundingClientRect()
      const width = menu.getBoundingClientRect().width || 280, height = menu.getBoundingClientRect().height || 142
      const above = rect.bottom + 8 + height > win.innerHeight - 12 && rect.top >= height + 20
      menu.style.left = `${Math.max(12, Math.min(rect.right - width, win.innerWidth - width - 12))}px`
      menu.style.top = `${Math.max(12, Math.min(above ? rect.top - height - 8 : rect.bottom + 8, win.innerHeight - height - 12))}px`
    }
    const outside = (event: Event) => {
      const target = event.target as Node
      if (!menu.contains(target) && !picker.contains(target)) close()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
      if (event.key === 'Tab') { close(true); return }
      if (!menu.contains(doc.activeElement)) return
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const index = options.indexOf(doc.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
        options[next]!.focus({ preventScroll: true })
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); (doc.activeElement as HTMLButtonElement).click()
      }
    }
    const observer = new win.MutationObserver(position)
    const onDialogClose = () => close()
    dismiss = () => close(true)
    menu.addEventListener('srb-close', () => close())
    // Descendant ownership avoids the modal dialog's inert backdrop; popover
    // promotion escapes its clipped scroll body and appears above the dialog.
    ;(dialog ?? doc.body).append(menu)
    menu.showPopover?.()
    picker.setAttribute('aria-expanded', 'true')
    position()
    options.find(option => option.dataset.value === picker.value)?.focus({ preventScroll: true })
    doc.addEventListener('pointerdown', outside, true)
    doc.addEventListener('focusin', outside, true)
    doc.addEventListener('keydown', key, true)
    doc.addEventListener('scroll', position, true)
    win.addEventListener('resize', position)
    dialog?.addEventListener('close', onDialogClose)
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'inert', 'hidden'] })
  }
  picker.addEventListener('click', open)
  picker.addEventListener('keydown', event => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !dismiss) { event.preventDefault(); open() }
  })
  return picker
}
export function boardDialog(doc: Document, title: string) {
  const dialog = doc.createElement('dialog')
  dialog.className = 'srb-dialog'
  dialog.setAttribute('aria-label', title)
  const heading = doc.createElement('header')
  const h = doc.createElement('h2')
  h.textContent = title
  const body = doc.createElement('div')
  body.className = 'srb-dialog-body'
  const status = doc.createElement('p')
  status.role = 'status'
  status.className = 'srb-status'
  const close = () => {
    dialog.close?.()
    dialog.remove()
  }
  const closeButton = boardButton(doc, '', close, '关闭')
  const closeIcon = doc.createElement('span')
  closeIcon.className = 'srb-close-icon'
  closeIcon.setAttribute('aria-hidden', 'true')
  closeButton.append(closeIcon)
  closeButton.className = 'srb-close'
  heading.append(h, closeButton)
  dialog.append(heading, body, status)
  doc.body.append(dialog)
  dialog.addEventListener('close', () => dialog.remove())
  // Backdrop events target the dialog; padding inside its bounds must remain interactive.
  const outside = (event: MouseEvent) => {
    const rect = dialog.getBoundingClientRect()
    return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
  }
  let pressedBackdrop = false
  dialog.addEventListener('pointerdown', event => { pressedBackdrop = outside(event) })
  dialog.addEventListener('click', event => {
    if (pressedBackdrop && outside(event)) close()
    pressedBackdrop = false
  })
  dialog.showModal()
  let running = false
  const run = async <T>(
    fn: () => Promise<T>,
    pending = '处理中…'
  ): Promise<T | undefined> => {
    if (running) return undefined
    running = true
    body.inert = true
    status.textContent = pending
    try {
      const value = await fn()
      if (dialog.isConnected) status.textContent = ''
      return value
    } catch (error) {
      if (dialog.isConnected)
        status.textContent = boardErrorMessage(error)
      return undefined
    } finally {
      running = false
      body.inert = false
    }
  }
  return { dialog, body, status, close, run }
}
/** Page-world navigation uses correlated, bounded DOM requests, never crosses runtime objects. */
export function requestBoardPageAction(
  doc: Document,
  action: 'open' | 'login',
  boardId?: string
): Promise<void> {
  const win = doc.defaultView!
  const requestId = win.crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      win.clearTimeout(timer)
      win.removeEventListener('sherlock:boards:reply', reply)
    }
    const reply = (event: Event) => {
      const data = (event as CustomEvent).detail
      if (data?.requestId !== requestId) return
      cleanup()
      data.ok ? resolve() : reject(new Error(data.error ?? '页面尚未准备好'))
    }
    const timer = win.setTimeout(() => {
      cleanup()
      reject(new Error('页面操作超时，请重试。'))
    }, 15000)
    win.addEventListener('sherlock:boards:reply', reply)
    win.dispatchEvent(
      new win.CustomEvent('sherlock:boards:request', {
        detail: { requestId, action, ...(boardId ? { boardId } : {}) }
      })
    )
  })
}
export function installBoardUiStyles(doc: Document) {
  if (doc.getElementById('sherlock-research-boards-style')) return
  installSidebarScrollFade(doc)
  const style = doc.createElement('style')
  style.id = 'sherlock-research-boards-style'
  style.textContent = `
.srb-section,.srb-actions,.srb-presence,.srb-dialog,.srb-notifications,.srb-bubble,.srb-discussion{font:13px/1.5 var(--dsw-font-family,system-ui);color:var(--dsw-alias-label-primary,#252525)}
.srb-actions,.srb-presence{display:flex;align-items:center;gap:6px;min-width:0}
:where(.srb-discussion) button:not([class]),.srb-terminated button,.srb-readonly button,.srb-actions button,.srb-presence button,.srb-dialog button,.srb-notifications button,.srb-bubble button{font:inherit;color:inherit;border:0;background:transparent;cursor:pointer;border-radius:7px;padding:6px 9px}.srb-actions button:hover,.srb-dialog button:hover,.srb-notifications button:hover,.srb-bubble button:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}
.srb-actions button:focus-visible,.srb-presence button:focus-visible,.srb-dialog :is(button,input,select):focus-visible,.srb-notifications button:focus-visible,.srb-bubble button:focus-visible{outline:2px solid #6099d3;outline-offset:2px}
.srb-section .srb-empty{font-size:13px;color:var(--dsw-alias-label-tertiary);padding:16px 12px;margin:0}.srb-section[data-wide=false]{overflow:visible;max-height:none}.srb-section[data-wide=false] header{padding:0;justify-content:center}.srb-section[data-wide=false] header button:first-child{text-align:center}
.srb-actions{white-space:nowrap;flex:none}.srb-actions .srb-star[aria-pressed=true]{color:#bc8637}.srb-badge{font-size:11px;color:var(--dsw-alias-label-secondary,#777)}.srb-presence{gap:6px;flex:none}.srb-avatar{position:relative;display:grid!important;place-items:center;padding:0!important;width:28px;height:28px;border-radius:50%!important;background:var(--srb-color,#dce7e5)!important;color:#263b3a!important;border:1px solid #fff5!important}.srb-avatar:after{content:'';position:absolute;right:0;bottom:0;width:5px;height:5px;border-radius:50%;background:#588a76;border:1px solid var(--dsw-alias-bg-base,#fff)}.srb-avatar[data-offline=true]:after{background:#999}.srb-tip{display:none;position:absolute;z-index:3500;top:36px;right:0;min-width:120px;max-width:220px;white-space:normal;text-align:left;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#222);box-shadow:0 4px 24px #0002;pointer-events:none}.srb-avatar:is(:hover,:focus) .srb-tip{display:block}.srb-tip small{display:block;font-size:11px;color:var(--dsw-alias-label-secondary,#666)}
.srb-dialog{box-sizing:border-box;width:min(460px,calc(100vw - 32px));max-height:calc(100vh - 40px);border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:16px;background:var(--dsw-alias-bg-layer-2,#fff);padding:18px;box-shadow:0 24px 90px #0003}.srb-dialog::backdrop{background:#0005}.srb-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px}.srb-dialog h2{font-size:17px;font-weight:600;margin:0}.srb-dialog-body{display:grid;gap:12px;margin-top:18px}.srb-dialog input,.srb-dialog select{font:inherit;color:inherit;background:var(--dsw-alias-bg-base,#fafafa);padding:9px 10px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;box-sizing:border-box;min-width:0;width:100%}.srb-dialog label{display:grid;gap:5px}.srb-status{font-size:12px;color:var(--dsw-alias-label-secondary,#666);white-space:pre-wrap}.srb-status:empty{display:none}.srb-primary{background:var(--dsw-alias-label-primary,#222)!important;color:var(--dsw-alias-bg-layer-2,#fff)!important}.srb-dialog button:disabled,.srb-notifications button:disabled,.srb-bubble button:disabled{opacity:.5;cursor:default}.srb-member{display:flex;align-items:center;gap:8px}.srb-member span{flex:1;min-width:0}.srb-member select{width:115px}.srb-menu-item{text-align:left;width:100%}.srb-divider{border-top:1px solid var(--dsw-alias-border-l2,#ddd)}
.srb-discussion{padding:20px 18px;display:flex;flex-direction:column;gap:24px;min-height:120px}.srb-request-group{display:flex;flex-direction:column;gap:12px;min-width:0}.srb-message{overflow-wrap:anywhere;font-size:14px;line-height:1.65;min-width:0}.srb-message[data-role=user]{align-self:flex-end;max-width:90%;background:var(--dsw-alias-interactive-bg-hover,#8881);border-radius:14px;padding:10px 14px}.srb-message>small{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#888);display:block;margin-bottom:4px}.srb-message p{margin:0;white-space:pre-wrap}.srb-message p+p{margin-top:8px}.srb-message-body,.srb-message-body>div{font-size:inherit;line-height:inherit}.srb-terminated{padding:32px;max-width:460px;margin:auto;text-align:center}.srb-terminated h3{font-size:17px}.srb-readonly{font-size:12px;padding:6px 12px;background:var(--dsw-alias-bg-layer-2,#fff);border-radius:8px;position:absolute;top:10px;left:12px;z-index:20}.srb-canvas-loading{position:absolute;inset:0;z-index:25;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-secondary,#777);font-size:13px;pointer-events:auto}.srb-canvas-loading-spinner{box-sizing:border-box;width:16px;height:16px;border:2px solid var(--dsw-alias-border-l2,#8883);border-top-color:var(--dsw-alias-label-secondary,#777);border-radius:50%;animation:srb-loading-spin .8s linear infinite}@keyframes srb-loading-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.srb-canvas-loading-spinner{animation:none}}.srb-canvas-presence{position:absolute;inset:0;pointer-events:none;z-index:19;overflow:hidden}.srb-cursor{position:absolute;font-size:11px;color:#fff;padding:2px 6px;border-radius:2px 8px 8px 8px;background:var(--srb-color,#6c9489);transform:translate(3px,3px)}.srb-occupied{position:absolute;border:2px dashed var(--srb-color,#6c9489);border-radius:12px;box-sizing:border-box}.srb-occupied span{position:absolute;top:-21px;left:0;color:var(--srb-color,#53776e);font-size:11px;white-space:nowrap}
[data-dsh-sidebar-root] [data-slot="sidebar.settings"]:has(.srb-account-controls){flex:1;min-width:0;width:100%}.srb-account-controls{display:flex;align-items:center;min-width:0;width:100%;gap:2px}.srb-account-controls .sherlock-account-button{flex:1;min-width:0;width:auto!important}.srb-bell{position:relative;box-sizing:border-box;flex:none;display:grid;place-items:center;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary,#222);width:32px;height:34px;border-radius:8px;cursor:pointer}.srb-bell:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}.srb-bell-icon{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:block;width:16px;height:16px;margin:0;background:currentColor;mask:url(/figma-sidebar-bell.svg) center/contain no-repeat}.srb-bell[data-unread=true]:after{content:'';position:absolute;right:6px;top:5px;width:6px;height:6px;border-radius:50%;background:#df544f;border:1px solid var(--dsw-specific-sidebar-fill,#fff)}
[data-sherlock-update-footer]:has(#sherlock-sidebar-update-button:not([hidden])) .srb-account-controls{width:calc(100% - 40px)}
/* Collapsed footer controls share the rail icon width; the account must not shrink to its avatar. */
[data-sidebar-collapsed=true] .srb-account-controls{flex-direction:column;width:100%!important;gap:2px}
[data-sidebar-collapsed=true] .srb-account-controls .sherlock-account-button{flex:none;width:36px!important;height:36px;box-sizing:border-box;margin:4px auto!important}
[data-sidebar-collapsed=true] .srb-account-controls>[data-research-board-bell-host]{display:flex;justify-content:center;width:36px;flex:none}
[data-sidebar-collapsed=true] .srb-bell{box-sizing:border-box;width:36px;height:36px;padding:0;margin:0 auto 6px}
.srb-notifications,.srb-bubble{position:fixed;z-index:3200;box-sizing:border-box;width:min(340px,calc(100vw - 24px));max-height:min(520px,calc(100vh - 36px));overflow:auto;padding:14px;border-radius:14px;border:1px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-alias-bg-layer-2,#fff);box-shadow:0 12px 40px #0003}.srb-notifications header,.srb-bubble header{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:600}.srb-notification{padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l2,#ddd)}.srb-notification p{margin:4px 0}.srb-notification small{color:var(--dsw-alias-label-secondary,#777)}.srb-notification-actions{display:flex;justify-content:flex-end;gap:6px}.srb-notifications nav{display:flex;gap:4px;margin:10px 0}.srb-notifications nav [aria-selected=true]{background:var(--dsw-alias-interactive-bg-hover,#8882)}

/* Non-editable application chrome keeps drag gestures for navigation. */
:is([data-dsh-sidebar-root],[data-srb-session-header],[role=tablist]),:is([data-dsh-sidebar-root],[data-srb-session-header],[role=tablist]) *{-webkit-user-select:none;user-select:none}
:is([data-dsh-sidebar-root],[data-srb-session-header]) :is(input,textarea,[contenteditable=true],[contenteditable=true] *){-webkit-user-select:text;user-select:text}
[data-srb-session-header]:has(.srb-actions):not([aria-hidden=true]){display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:30px 36px;align-content:start;column-gap:20px}
[data-srb-session-header]:has(.srb-actions) [data-srb-title-row]{display:contents}
[data-srb-session-header]:has(.srb-actions) [data-srb-title-cluster]{grid-column:1;grid-row:1;min-width:0;min-height:30px}
[data-srb-session-header]:has(.srb-actions) [data-srb-tabs]{grid-column:1;grid-row:2}
[data-srb-session-header]:has(.srb-actions) [data-srb-utilities]{grid-column:2;grid-row:1 / span 2;align-self:start;height:62px;align-items:center;margin-left:0;margin-top:-2px;position:relative;z-index:2}
.srb-actions .srb-create-collaboration{border:1px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-alias-button-elevated-fill,var(--dsw-alias-bg-layer-2,#fff));padding:0 12px;border-radius:8px;font-weight:500;line-height:28px}
.srb-actions .srb-create-collaboration:disabled{opacity:.45;cursor:default}.srb-actions .srb-avatar{width:28px;height:28px;flex:none}
.srb-request-statuses{display:flex;flex-direction:column;gap:8px;min-width:0}.srb-request-statuses:empty{display:none}.srb-request-statuses .srb-status{margin:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary,#777)}
.srb-request-statuses>div.srb-status{padding:10px 12px;background:var(--dsw-alias-interactive-bg-hover,#8881);border-radius:9px}
.srb-request-statuses .srb-status>button{display:block;margin-top:6px;padding:3px 0;color:var(--dsw-alias-state-business-primary,#447ac5);font-size:12px}
.srb-native-author{display:block;font-size:13px;color:var(--dsw-alias-label-secondary);margin:10px 0 6px}.srb-task-progress{padding:10px 12px;border-left:2px solid var(--dsw-alias-border-l2,#d5d5d5);font-size:12px;line-height:1.65;color:var(--dsw-alias-label-secondary,#777);min-width:0}.srb-task-progress-heading{display:flex;align-items:center;gap:7px}.srb-task-progress-heading time{margin-left:auto;white-space:nowrap;font-variant-numeric:tabular-nums}.srb-task-progress-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}.srb-task-progress p{margin:6px 0}.srb-task-progress small{font-size:11px}.srb-task-activity{padding-left:17px;margin:7px 0;overflow-wrap:anywhere}.srb-task-progress summary{cursor:pointer;font-size:11px}
.srb-request-group[data-execution-kind=component]{margin:0;padding:12px 14px;gap:8px;border:1px dashed var(--dsw-alias-border-l2,#ccc);border-radius:10px;background:var(--dsw-alias-interactive-bg-hover,#8881)}.srb-component-activity-label{font-size:13px;color:var(--dsw-alias-label-secondary,#777);display:flex;flex-wrap:wrap;gap:5px 10px;align-items:center}.srb-component-activity-label span{font-weight:500;overflow-wrap:anywhere}.srb-discussion .srb-message[data-execution-kind=component]{align-self:stretch;max-width:100%;margin:6px 0;padding:0;background:transparent;border-radius:0;font-size:14px}.srb-discussion .srb-message[data-execution-kind=component][data-role=assistant]{border-left:2px solid var(--dsw-alias-border-l2,#ccc);padding-left:10px}.srb-request-group[data-execution-kind=component] .srb-task-progress{border-left:0;padding:5px 0}.srb-request-group[data-execution-kind=component] .srb-message-author{font-size:13px;line-height:20px}
.srb-attempt-history{font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary,#888)}.srb-attempt-history summary{cursor:pointer;width:fit-content;user-select:none}.srb-attempt-history[open] summary{margin-bottom:6px}.srb-attempt-history .srb-status{display:flex;gap:8px;font-size:11px;padding:2px 0}.srb-attempt-history time{font-variant-numeric:tabular-nums;flex:none}
/* Native conversation controls retain the same geometry as ordinary chat. */
.srb-discussion [data-shared-native-task]{display:flex;flex-direction:column;gap:16px;min-width:0}
.srb-discussion [data-shared-native-message]{min-width:0}
.srb-discussion [data-shared-native-message=assistant]>.p-xYUq_actions{margin-top:8px}
.srb-discussion [data-shared-native-message=user][data-self=true] .srb-native-author{text-align:right}
.srb-discussion [data-shared-native-message=user][data-self=false] .gdEzaW_userRow{align-items:flex-start}
.srb-discussion [data-shared-native-message=user][data-self=false] .gdEzaW_userStack{margin-left:0;margin-right:auto;align-items:flex-start}
.srb-discussion [data-shared-native-message=user][data-self=false] .p-xYUq_actions{align-self:flex-start;gap:8px}
.srb-discussion [data-shared-native-message=user][data-self=false] .p-xYUq_timeEnd{padding-left:0}
.srb-discussion .srb-message[data-role=user][data-self=false]{align-self:flex-start;margin-left:0;margin-right:auto}
.srb-discussion .srb-message[data-execution-kind=component]{width:auto;margin-inline:0}
.srb-discussion [data-chat-flow-kind=execution]>button{padding-inline:0}
.srb-discussion .srb-request-group[data-execution-kind=component]+.srb-request-group[data-execution-kind=component]{margin-top:-12px}
.sRp_messages .odyssey-table-actions{font-size:13px;line-height:24px;color:var(--dsw-alias-label-secondary)}
.sRp_messages .odyssey-table-block>:first-child{scrollbar-width:auto;scrollbar-color:auto}
.sRp_messages .odyssey-table-block>:first-child::-webkit-scrollbar{height:10px;display:block}
.sRp_messages .odyssey-table-block>:first-child::-webkit-scrollbar-thumb{background:var(--ework-scroll-thumb,#0000001a);border-radius:5px;border:2px solid transparent;background-clip:padding-box}
/* Shared section geometry and understated board actions. */
[data-dsh-sidebar-root] :is(.srb-section,[data-srb-workspaces]){box-sizing:border-box;min-width:0;width:100%}
[data-dsh-sidebar-root][data-dsh-sidebar-wide=true] [data-srb-section-header]{padding-inline:0;margin-right:0}
[data-srb-section-header]>:empty{display:none}

.srb-section{font-size:14px;line-height:20px}.srb-section .srb-section-toggle,[data-srb-workspaces] .srb-section-toggle{display:inline-flex;align-items:center;justify-content:flex-start;gap:7px;flex:none;font:inherit;font-size:14px;font-weight:400;line-height:20px;color:var(--dsw-alias-label-tertiary,#888);padding:0;height:28px;border:0;background:transparent;cursor:pointer;border-radius:4px}.srb-section .srb-section-toggle:hover,[data-srb-workspaces] .srb-section-toggle:hover{color:var(--dsw-alias-label-primary,#222);background:transparent}.srb-chevron{display:inline-block;width:12px;height:12px;background:currentColor;mask:url(/figma-sidebar-chevron.svg) center/contain no-repeat;flex:none}.srb-chevron[data-collapsed=true]{transform:rotate(-90deg)}
[data-srb-workspaces] [data-srb-workspace-list][hidden]{display:none!important}[data-srb-workspaces][data-section-collapsed=true]{flex:none!important;min-height:0!important}
.srb-actions{gap:10px;margin-left:auto}.srb-actions button{font-size:12px;height:30px;box-sizing:border-box}.srb-actions .srb-favorite-button{color:var(--dsw-alias-label-secondary,#666)}.srb-menu-trigger{display:flex;align-items:center;gap:7px}.srb-actions .srb-presence{padding-right:2px}
.srb-row-status{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:none}.srb-row-status svg{width:14px;height:14px}.srb-pending-ring{box-sizing:border-box;width:12px;height:12px;border:1.2px dashed currentColor;border-radius:50%;flex:none;color:var(--dsw-alias-label-tertiary,#888)}
.srb-error-message{margin:0;font-size:14px;line-height:1.65;overflow-wrap:anywhere}

[data-dsh-sidebar-root] [data-srb-board-region]{flex:none;max-height:32vh}.srb-section.srb-section{flex:initial;min-height:40px;max-height:32vh;padding-top:6px;padding-bottom:10px;overflow:hidden}.srb-section .srb-board-list{overflow-x:hidden;padding-bottom:0}.srb-section .srb-board-title{display:flex;align-items:center;gap:6px;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:inherit}.srb-board-title>span:last-child{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0}.srb-research-icon{display:block;width:16px;height:16px;flex:none;background:currentColor;-webkit-mask:url(/sherlock-research.svg) center/contain no-repeat;mask:url(/sherlock-research.svg) center/contain no-repeat}
.srb-action-menu{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:208px;padding:5px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:12px;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#222);box-shadow:0 8px 32px #0002;z-index:4000;font:13px/1.5 system-ui}.srb-action-menu button{display:block;width:100%;padding:9px 12px;text-align:left;border:0;border-radius:7px;background:transparent;color:inherit;font:inherit;cursor:pointer}.srb-action-menu button:is(:hover,:focus-visible){outline:none;background:var(--dsw-alias-interactive-bg-hover,#8882)}
.srb-dialog{width:min(520px,calc(100vw - 32px));padding:0;overflow:hidden}.srb-dialog>header{padding:20px 24px 16px;border-bottom:1px solid var(--dsw-alias-border-l2,#ddd)}.srb-dialog h2{font-size:16px}.srb-dialog .srb-close,.srb-notifications header button,.srb-bubble header button{display:grid;place-items:center;width:28px;height:28px;padding:0;font-size:21px;line-height:1;color:var(--dsw-alias-label-tertiary,#888)}.srb-dialog-body{margin:0;padding:20px 24px 24px;max-height:calc(100vh - 170px);overflow:auto;gap:16px}.srb-dialog p{margin:0;line-height:1.65}.srb-dialog .srb-status{padding:12px 24px;border-top:1px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-alias-interactive-bg-hover,#8881)}.srb-dialog button{min-height:34px;padding:7px 12px;font-size:12px;white-space:nowrap;box-sizing:border-box}.srb-dialog :is(input,select){height:36px;padding:7px 10px;border-radius:8px;background:transparent}.srb-dialog label{font-size:12px;font-weight:500;gap:8px}.srb-dialog label input,.srb-dialog label select{font-weight:400;font-size:13px}.srb-description{font-size:12px!important;font-weight:400;color:var(--dsw-alias-label-secondary,#777);line-height:1.6}.srb-dialog-intro{display:grid;gap:5px}.srb-dialog-intro>strong{font-size:14px;overflow-wrap:anywhere}.srb-field-row{display:flex;align-items:center;gap:8px;min-width:0}.srb-field-row input{flex:1;width:0}.srb-field-row button{flex:none;border:1px solid var(--dsw-alias-border-l2,#ddd)}.srb-info-panel{padding:12px 14px;border-radius:10px;background:var(--dsw-alias-interactive-bg-hover,#8881);font-size:12px;color:var(--dsw-alias-label-secondary,#777)}
.srb-dialog-tabs{display:flex;gap:20px;border-bottom:1px solid var(--dsw-alias-border-l2,#ddd)}.srb-dialog-tabs button{padding:0 0 10px;border-radius:0;color:var(--dsw-alias-label-secondary,#777);position:relative}.srb-dialog-tabs button:hover{background:transparent}.srb-dialog-tabs button[aria-selected=true]{color:var(--dsw-alias-label-primary,#222);font-weight:600}.srb-dialog-tabs button[aria-selected=true]:after{content:'';height:2px;position:absolute;bottom:-1px;left:0;right:0;background:currentColor;border-radius:2px}.srb-tab-panel{display:grid;gap:22px}.srb-tab-panel[hidden]{display:none}.srb-invite-form{display:grid;gap:10px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:12px;padding:16px}.srb-recipient:empty{display:none}.srb-recipient{font-size:12px;padding:10px 12px;background:var(--dsw-alias-interactive-bg-hover,#8881);border-radius:8px}.srb-invite-controls{display:flex;justify-content:space-between;align-items:flex-end;gap:16px}.srb-invite-controls .srb-role-label{min-width:112px}.srb-invite-controls>button{min-width:100px}.srb-dialog h3{margin:0 0 8px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#666)}.srb-member{padding:10px 0;gap:10px}.srb-member+.srb-member{border-top:1px solid var(--dsw-alias-border-l2,#ddd)}.srb-member-avatar{display:grid;place-items:center;flex:none;width:32px;height:32px;border-radius:50%;background:var(--srb-color);color:#263b3a;position:relative}.srb-member-avatar[data-online=true]:after{content:'';position:absolute;bottom:0;right:0;width:6px;height:6px;background:#588a76;border-radius:50%;border:2px solid var(--dsw-alias-bg-layer-2,#fff)}.srb-member-identity{display:grid;gap:2px;flex:1;min-width:0}.srb-member-identity strong{font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.srb-member-identity small,.srb-member .srb-role{color:var(--dsw-alias-label-secondary,#777);font-size:11px}.srb-member .srb-role{flex:none}.srb-member select{width:90px;height:32px;font-size:12px}.srb-member button{padding:6px 8px}.srb-setting-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l2,#ddd)}.srb-setting-label{display:grid;gap:4px;min-width:0}.srb-setting-label strong{font-size:12px;font-weight:500}.srb-setting-row>button{border:1px solid var(--dsw-alias-border-l2,#ddd)}.srb-dialog .srb-quiet-danger{color:#bf5550}.srb-danger-button{background:#b74c47!important;color:white!important}.srb-dialog-footer{display:flex;justify-content:flex-end;gap:8px;padding-top:6px}
/* Message center: Figma 682:26753 / 682:26151. Keep toast styling independent. */
.srb-notifications{--center-bg:var(--odyssey-menu,rgba(255,255,255,.86));--center-border:var(--odyssey-menu-border,rgba(0,0,0,.1));--center-text:var(--odyssey-text,#252525);--center-secondary:var(--odyssey-text,#555);--center-muted:var(--odyssey-menu-muted,#808080);--center-selected:var(--odyssey-menu-row,rgba(0,0,0,.055));--center-card:var(--odyssey-menu-row,rgba(0,0,0,.055));--center-card-border:var(--odyssey-menu-border,rgba(0,0,0,.1));--center-button:var(--odyssey-menu-row,rgba(0,0,0,.055));--center-button-border:var(--odyssey-menu-border,rgba(0,0,0,.1));padding:12px;display:flex;flex-direction:column;gap:8px;overflow:hidden;width:min(384px,calc(100vw - 24px));border:0;outline:1px solid var(--center-border);outline-offset:-1px;border-radius:14px;background:var(--center-bg);color:var(--center-text);box-shadow:var(--odyssey-menu-shadow,0 8px 24px -4px rgba(0,0,0,.16));backdrop-filter:var(--odyssey-menu-blur,blur(24px));-webkit-backdrop-filter:var(--odyssey-menu-blur,blur(24px))}
body[data-ds-dark-theme] .srb-notifications{--center-bg:var(--odyssey-menu,rgba(43,43,43,.82));--center-border:var(--odyssey-menu-border,rgba(255,255,255,.1));--center-text:var(--odyssey-text,#e5e5e5);--center-secondary:var(--odyssey-text,#ccc);--center-muted:var(--odyssey-menu-muted,#999);--center-selected:var(--odyssey-menu-row,rgba(255,255,255,.075));--center-card:var(--odyssey-menu-row,rgba(255,255,255,.075));--center-card-border:var(--odyssey-menu-border,rgba(255,255,255,.1));--center-button:var(--odyssey-menu-row,rgba(255,255,255,.075));--center-button-border:var(--odyssey-menu-border,rgba(255,255,255,.1))}
.srb-notifications>header{height:32px;min-height:32px;gap:8px;flex:none;padding:0}.srb-notifications>header h2{flex:1;min-width:0;margin:0;font-size:15px;font-weight:500;line-height:23px}.srb-notifications>header button.srb-notifications-read{display:block;width:auto;height:28px;padding:0 4px;font-size:12px;line-height:20px;color:var(--center-muted);white-space:nowrap}.srb-notifications>header button.srb-notifications-close{flex:none;width:28px;height:28px;padding:0;color:var(--center-muted)}.srb-notifications-close .ework-notice-icon{width:12px;height:12px;flex-basis:12px;color:inherit}
.srb-notifications nav{display:flex;height:32px;min-height:32px;margin:0;padding:0;gap:4px;align-items:center;border:0;flex:none}.srb-notifications nav button{height:28px;padding:0 12px;border-radius:7px;font-size:13px;line-height:21px;font-weight:400;color:var(--center-muted)}.srb-notifications nav [aria-selected=true]{background:var(--center-selected);color:var(--center-secondary)}
.srb-notification-list{display:flex;flex-direction:column;gap:8px;min-height:0;overflow:auto;padding:0}.srb-notifications .srb-notification{position:relative;flex:none;display:flex;flex-direction:column;gap:6px;padding:12px;border:0;outline:1px solid var(--center-card-border);outline-offset:-1px;border-radius:10px;background:var(--center-card);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}.srb-notifications .srb-notification p{margin:0}.srb-notification-title{font-size:13px;font-weight:500;line-height:20px;padding-right:10px;overflow-wrap:anywhere}.srb-notification[data-unread=true] .srb-notification-title:after{content:'';display:inline-block;width:5px;height:5px;border-radius:50%;background:#d55f59;margin:0 0 2px 7px}.srb-notification-subtitle{font-size:12px;color:var(--dsw-alias-label-secondary,#777);line-height:18px}.srb-notifications .srb-notification-subtitle{color:var(--center-secondary)}.srb-notification small{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary,#999)}.srb-notifications .srb-notification small,.srb-notifications .srb-notification-status{color:var(--center-muted)}.srb-notification-actions{align-items:center;margin-top:0;gap:6px}.srb-notification-actions button{font-size:12px;padding:6px 16px;border:1px solid var(--dsw-alias-border-l2,#ddd)}.srb-notification-status{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary,#999)}.srb-notification-footer{display:flex;align-items:center;justify-content:space-between;gap:6px}.srb-notification-footer:empty{display:none}.srb-notifications :is(.srb-notification-actions,.srb-notification-footer) button{height:26px;min-height:26px;padding:0 10px;border:0;border-radius:6px;background:var(--center-button);box-shadow:inset 0 0 0 1px var(--center-button-border);font-size:12px;line-height:18px}.srb-notifications .srb-primary{background:var(--center-text)!important;color:var(--center-bg)!important;box-shadow:none!important}
.srb-notifications .srb-notification:has(>.srb-notification-mark-read) .srb-notification-title{padding-right:72px}.srb-notifications .srb-notification>.srb-notification-mark-read{position:absolute;top:10px;right:10px;min-height:20px;height:20px;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;font-size:12px;line-height:20px;font-weight:400;color:var(--center-muted)}.srb-notifications .srb-notification>.srb-notification-mark-read:hover{background:transparent;color:var(--center-text);text-decoration:underline}
.srb-notifications button:hover{background:var(--center-selected)}.srb-notifications button:focus-visible{outline-color:var(--center-border)}
.srb-notification-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none;gap:8px;box-sizing:border-box;height:190px;padding:12px;text-align:center;color:var(--center-muted)}.srb-notification-empty strong{font-size:15px;font-weight:500;line-height:23px;color:var(--center-secondary)}.srb-notification-empty p{margin:0;font-size:12px;line-height:20px}.srb-notifications-service{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;font-size:12px;color:var(--center-muted)}
.srb-bubble{padding:14px 16px}.srb-bubble>header{font-size:12px}.srb-bubble .srb-notification{padding-bottom:0}
/* Figma 50: field errors remain adjacent to the input, outside the dialog footer. */
.srb-field-error{color:var(--dsw-alias-state-error-primary,#c64d47);font-size:12px;font-weight:400;line-height:18px;white-space:normal}.srb-field-error[hidden]{display:none}.srb-invite-form input[aria-invalid=true]{border-color:var(--dsw-alias-state-error-primary,#c64d47)}
/* Figma final 22–30: measured chrome, menus, dialogs and membership surfaces. */
:root{--srb-surface:rgba(252,252,252,.97);--srb-input:#fff;--srb-form-button:#f8f8f8;--srb-border:rgba(223,224,226,.9);--srb-shadow:0 12px 32px -6px rgba(0,0,0,.14);--srb-label:#292b2d;--srb-muted:#74777b;--srb-tertiary:#94979b;--srb-control:#f6f6f7;--srb-control-border:#dadce0;--srb-control-strong:#e4e5e7;--srb-control-muted:#f0f0f1;--srb-row-active:rgba(0,0,0,.075);--srb-row-hover:rgba(0,0,0,.055);--srb-info:rgba(0,0,0,.035);--srb-primary:#292b2d;--srb-primary-text:#fff;--srb-blue:#397ee8}
body[data-ds-dark-theme]{--srb-surface:rgba(39,39,39,.97);--srb-input:#202020;--srb-form-button:#252525;--srb-border:rgba(61,61,61,.9);--srb-shadow:0 12px 32px -6px rgba(0,0,0,.3);--srb-label:#e5e6e8;--srb-muted:#a1a3a8;--srb-tertiary:#777;--srb-control:#303136;--srb-control-border:#45474b;--srb-control-strong:#3d3f43;--srb-control-muted:#303033;--srb-row-active:rgba(255,255,255,.08);--srb-row-hover:rgba(255,255,255,.055);--srb-info:rgba(255,255,255,.04);--srb-primary:#e5e6e8;--srb-primary-text:#242527;--srb-blue:#87abff}
.srb-section,.srb-actions,.srb-presence,.srb-dialog,.srb-members-popover,.srb-discussion{font-family:'Noto Sans SC',var(--dsw-font-family,system-ui);color:var(--srb-label)}
/* Both sections share one scrollport. Contents wrappers let sticky headers
   remain bounded by the whole navigation rather than their own short section. */
[data-dsh-sidebar-root] [data-srb-navigation-scroll]{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior-y:contain;scroll-padding-top:72px;position:relative;isolation:isolate}
[data-dsh-sidebar-root][data-dsh-sidebar-wide=true] [data-srb-navigation-scroll] :is(.hHd-Xa_regionArea,[data-slot="sidebar.researchBoards"],[data-slot="sidebar.workspaces"],.srb-section,[data-srb-workspaces]){display:contents!important}
[data-dsh-sidebar-root][data-dsh-sidebar-wide=true] [data-srb-navigation-scroll] :is(.srb-board-list,[data-srb-workspace-list],.qDHVXG_list){flex:none!important;height:auto!important;max-height:none!important;overflow:visible!important}
/* The old independent scrollers used negative scrollbar compensation. Inside
   the shared scrollport that extends rows past its clipping edge. */
[data-dsh-sidebar-root][data-dsh-sidebar-wide=true] [data-srb-navigation-scroll] :is(.qDHVXG_listArea,.qDHVXG_list,.srb-board-list,[data-srb-workspace-list]){box-sizing:border-box;min-width:0;width:100%;margin-left:0!important;margin-right:0!important;padding-left:0!important;padding-right:0!important;scrollbar-gutter:auto}
[data-dsh-sidebar-root][data-dsh-sidebar-wide=true] [data-srb-navigation-scroll]{box-sizing:border-box;padding-right:4px}
[data-dsh-sidebar-root][data-dsh-sidebar-wide=true] [data-srb-navigation-scroll] [data-srb-section-header]{position:sticky;top:0;z-index:3;box-sizing:border-box;min-height:36px;height:36px;margin:0;background:transparent!important;border-radius:0}
[data-dsh-sidebar-root][data-dsh-sidebar-wide=true] [data-srb-navigation-scroll] [data-srb-workspaces] [data-srb-section-header]{top:36px;z-index:2}
[data-dsh-sidebar-root][data-dsh-sidebar-wide=true] [data-srb-navigation-scroll] .srb-board-list{padding-bottom:12px}
.srb-section .srb-section-toggle,[data-srb-workspaces] .srb-section-toggle{font-size:14px;line-height:20px;height:32px;gap:2px;color:var(--srb-muted)}

.srb-section-toggle .srb-chevron{width:14px;height:14px}
.srb-section [data-srb-section-header]{min-height:32px;height:32px;gap:2px;margin:0 0 4px;padding:0}
.srb-section.srb-section{padding-top:0;padding-bottom:12px}
.srb-section.srb-section[data-section-collapsed=true]{min-height:0;padding-bottom:4px}
.srb-section[data-section-collapsed=true] [data-srb-section-header]{margin-bottom:0}
[data-sidebar-collapsed=true] .srb-section [aria-label='搜索研究看板'],[data-dsh-sidebar-wide=false] .srb-section [aria-label='搜索研究看板']{display:none!important}
body:has(.srb-navigation-menu button[aria-expanded=true])>[role=menu]{box-sizing:border-box;width:min(280px,calc(100vw - 24px));min-width:0;padding:5px;border:1px solid var(--srb-border);border-radius:10px;background:var(--srb-surface);backdrop-filter:blur(12px);box-shadow:var(--srb-shadow);font:13px/20px 'Noto Sans SC',var(--dsw-font-family,system-ui);color:var(--srb-label)}
body:has(.srb-navigation-menu button[aria-expanded=true])>[role=menu] [class*=_itemWrap_]+[class*=_itemWrap_]{margin-top:2px}
body:has(.srb-navigation-menu button[aria-expanded=true])>[role=menu] [role=menuitem]{min-height:32px;height:32px;padding:0 10px;border-radius:6px;font:inherit;gap:8px}
body:has(.srb-navigation-menu button[aria-expanded=true])>[role=menu] [role=menuitem]:is(:hover,:focus-visible){background:var(--srb-row-hover)}
body:has(.srb-navigation-menu button[aria-expanded=true])>[role=menu] [role=menuitem]>svg{display:none}
body:has(.srb-navigation-menu button[aria-expanded=true])>[role=menu] [role=menuitem]:has(>svg):after{content:'';flex:none;width:14px;height:14px;background:currentColor;mask:url(/figma-check.svg) center/contain no-repeat}
.srb-actions{gap:6px}.srb-actions:has(.srb-presence){gap:16px}.srb-actions button{font-weight:400;line-height:18px;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.srb-actions .srb-preview-toggle{flex:none;width:auto;min-width:100px;height:30px;padding:0 8px;border:0;border-radius:16px;background:var(--srb-row-hover,#8882);color:var(--srb-muted);gap:5px;white-space:nowrap;cursor:pointer}.srb-actions .srb-preview-toggle:not(:disabled):hover{background:var(--srb-row-active,#8882)}.srb-actions .srb-preview-toggle:disabled{opacity:.5;cursor:default}.srb-actions .srb-preview-toggle:focus-visible{outline:1px solid var(--srb-blue,#168cf0);outline-offset:2px}.srb-preview-toggle>svg{display:block;flex:none;width:14px;height:14px}.srb-preview-toggle>[data-research-preview-label]{white-space:nowrap}.srb-preview-toggle>svg[data-research-preview-switch]{width:10px;height:10px;opacity:.65}
.srb-actions .srb-favorite-button,.srb-actions .srb-create-collaboration{height:30px;padding:0 10px;border:1px solid var(--srb-control-border);border-radius:7px;background:var(--srb-control);color:var(--srb-label);line-height:18px;gap:6px}
.srb-actions .srb-favorite-button[aria-pressed=true]{background:var(--srb-control-strong);color:var(--srb-muted)}
.srb-favorite-icon,.srb-close-icon,.srb-plus-icon,.srb-check-icon,.srb-people-icon{display:inline-block;width:16px;height:16px;flex:none;background:currentColor;mask:url(/figma-favorite.svg) center/contain no-repeat}
.srb-favorite-button[aria-pressed=true] .srb-favorite-icon{mask-image:url(/figma-favorite-selected.svg)}
.srb-people-icon{mask-image:url(/figma-people.svg)}
.srb-plus-icon{mask-image:url(/figma-collaboration-plus.svg)}.srb-close-icon{mask-image:url(/figma-close.svg)}.srb-check-icon{mask-image:url(/figma-check.svg);color:var(--srb-blue)}
.srb-actions .srb-manage-button{width:44px;height:28px;padding:0;border:1px solid var(--srb-control-border);border-radius:6px;background:var(--srb-control)}
.srb-actions .srb-presence{gap:6px;padding:0}
.srb-avatar.srb-avatar{width:28px;height:28px;border:0!important;background:var(--srb-avatar-background)!important;color:#fff!important;font-size:13px;font-weight:500;line-height:18px}
.srb-avatar.srb-avatar:after{display:none}
.srb-actions .srb-add-collaborator,.srb-presence .srb-avatar-overflow{display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:50%;background:var(--srb-control-strong);color:var(--srb-muted);flex:none}
.srb-presence .srb-avatar-overflow{width:32px;border-radius:14px;font-size:11px;font-weight:500}.srb-actions .srb-add-collaborator:hover{color:var(--srb-label);background:var(--srb-control-strong)}
/* Dialog-local Figma 288/290 materials; other popovers retain their palettes. */
.srb-dialog{--srb-surface:rgba(252,252,252,.97);--srb-border:rgba(223,224,226,.9);--srb-label:#292b2d;--srb-muted:#74777b;--srb-control-border:#dfe0e2;--srb-tab-selected:rgba(0,0,0,.055)}
body[data-ds-dark-theme] .srb-dialog{--srb-surface:rgba(39,39,39,.97);--srb-border:rgba(61,61,61,.9);--srb-label:#e6e6e6;--srb-muted:#a1a3a8;--srb-control-border:#3d3d3d;--srb-tab-selected:rgba(255,255,255,.09)}
body[data-ds-dark-theme] .srb-dialog .srb-quiet-danger{color:#cc716b}
body:not([data-ds-dark-theme]) .srb-dialog .srb-danger-zone>button.srb-quiet-danger{color:#cc716b}
.srb-dialog .srb-setting-row>button{border-color:var(--srb-control-border)}
.srb-dialog{border:0;outline:1px solid var(--srb-border);outline-offset:-1px;border-radius:14px;background:var(--srb-surface);box-shadow:var(--srb-shadow);backdrop-filter:blur(12px)}
.srb-dialog::backdrop{background:rgba(0,0,0,.18)}
.srb-dialog>header{padding:20px 24px 0;border:0;height:30px;box-sizing:content-box;gap:12px}.srb-dialog h2{font-size:18px;font-weight:500;line-height:27px}
.srb-dialog .srb-close{height:28px;min-height:28px;width:28px;flex:none;color:var(--srb-muted);padding:0}
.srb-dialog-body{padding:16px 24px 20px;gap:16px;max-height:calc(100vh - 142px)}
.srb-dialog button{height:30px;min-height:30px;padding:0 10px;font-size:12px;line-height:18px;font-weight:400;border-radius:7px}
.srb-dialog :is(input,select){height:38px;border:1px solid var(--srb-control-border);border-radius:7px;font-size:13px;line-height:20px;background:transparent;padding:0 10px}
.srb-dialog input{background:var(--srb-input);border-radius:8px}
.srb-dialog label{gap:6px;font-size:12px;line-height:18px;font-weight:400;color:var(--srb-muted)}
.srb-dialog :is(input,select){color:var(--srb-label)}.srb-dialog p{line-height:18px}.srb-dialog .srb-primary{background:var(--srb-primary)!important;color:var(--srb-primary-text)!important}
.srb-dialog .srb-description{font-size:12px!important;line-height:18px;color:var(--srb-muted)}
.srb-info-panel{display:grid;gap:6px;padding:10px 12px;background:var(--srb-info);border-radius:9px;font-size:12px;line-height:18px;color:var(--srb-muted)}
.srb-create-collaboration-dialog .srb-recipient{min-height:52px}.srb-create-collaboration-dialog .srb-invite-controls{min-height:38px}.srb-create-collaboration-dialog .srb-dialog-footer{min-height:34px}
.srb-capture-summary{display:flex;align-items:center;flex-wrap:wrap;gap:4px 16px;min-height:20px}
.srb-invite-form{border:0;padding:0;border-radius:0;gap:16px}.srb-field-row{gap:8px}.srb-field-row>button{height:30px;border:1px solid var(--srb-control-border);background:var(--srb-form-button);flex:none;width:90px}
.srb-recipient{display:flex;align-items:center;gap:10px;padding:0;background:transparent;min-height:48px;border-radius:0;font-size:13px}.srb-recipient .srb-member-avatar{width:30px;height:30px}.srb-recipient .srb-member-identity strong{font-size:13px;line-height:20px}.srb-recipient .srb-member-identity small{font-size:11px;line-height:17px}
.srb-invite-controls{align-items:center;gap:10px;min-height:32px}.srb-invite-controls .srb-role-label{display:flex;align-items:center;justify-content:space-between;width:100%;font-size:13px;line-height:20px;color:var(--srb-label)}.srb-invite-controls select{height:30px;width:100px;font-size:12px}.srb-invite-controls>button{min-width:100px}
.srb-dialog-footer{padding-top:0;min-height:32px;align-items:center;gap:8px}.srb-dialog-footer .srb-primary{min-width:100px}
.srb-management .srb-dialog-body{gap:12px;padding-top:12px}.srb-management .srb-board-name{font-size:13px;line-height:20px;color:var(--srb-muted)}
.srb-management .srb-dialog-tabs{height:36px;gap:4px;border:0;align-items:flex-start}.srb-dialog-tabs button{height:30px;padding:0 10px;border-radius:7px;color:var(--srb-label)}.srb-dialog-tabs button[aria-selected=true]{background:var(--srb-tab-selected);font-weight:400;color:var(--srb-label)}.srb-dialog-tabs button[aria-selected=true]:after{display:none}
.srb-tab-panel{gap:12px}.srb-management .srb-invite-form{gap:12px}.srb-management .srb-invite-controls .srb-role-label{width:auto}.srb-management .srb-invite-controls select{width:88px;height:30px}
.srb-dialog h3{font-size:14px;line-height:21px;font-weight:500;color:var(--srb-label);margin:0 0 4px}
.srb-management h3{margin-bottom:12px}
.srb-member{min-height:56px;box-sizing:border-box;padding:8px 0;gap:10px}.srb-member+.srb-member{border:0}
.srb-member-avatar{width:30px;height:30px;background:var(--srb-avatar-background);color:#fff;font-size:13px;font-weight:500;line-height:18px}.srb-member-avatar:after{display:none}
.srb-member-identity{gap:0}.srb-member-identity strong{font-size:13px;line-height:20px}.srb-member-identity small,.srb-member .srb-role{font-size:11px;line-height:17px;color:var(--srb-muted)}.srb-member .srb-role{font-size:12px;line-height:18px}.srb-member select{height:30px;width:88px;font-size:12px}.srb-member-list{max-height:336px;overflow-y:auto;overscroll-behavior:contain}.srb-pending-list:empty{display:none}.srb-pending-list:not(:empty){border-top:1px solid var(--srb-control-border);padding-top:12px}
.srb-settings-list{display:grid;gap:0}.srb-setting-row{padding:0;min-height:63px;height:63px;box-sizing:content-box;gap:12px;border-top:0}.srb-setting-row+.srb-setting-row{border-top:1px solid var(--srb-control-border)}.srb-setting-label{gap:2px}.srb-setting-label strong{font-size:13px;line-height:20px}.srb-setting-row>button{flex:none;width:132px;background:var(--srb-form-button)}.srb-setting-row>button.srb-quiet-danger{border:0;background:transparent}
.srb-add-collaborator-dialog .srb-dialog-body{padding-top:14px}.srb-add-collaborator-dialog .srb-dialog-body,.srb-add-collaborator-dialog .srb-invite-form{gap:14px}.srb-add-collaborator-dialog .srb-description{font-size:13px!important;line-height:20px}
.srb-message[data-role=user]{width:fit-content;box-sizing:border-box;text-align:left}.srb-message[data-role=user] :is(.srb-message-body,p){text-align:left}.srb-message{line-height:24px}
.srb-members-popover{position:fixed;inset:auto;margin:0;padding:16px;width:min(340px,calc(100vw - 24px));box-sizing:border-box;border-radius:14px;border:0;outline:1px solid var(--srb-border);outline-offset:-1px;background:#fcfcfc;backdrop-filter:none;box-shadow:0 8px 20px -8px #0003;max-height:calc(100vh - 24px);overflow:hidden;font-size:12px;line-height:18px;z-index:4100}
/* Figma 304:980: member-popover colors are independent of the management dialog. */
body:not([data-ds-dark-theme]) .srb-members-popover h2{color:#292b2e}
body:not([data-ds-dark-theme]) .srb-members-popover .srb-members-online{color:#75787d}
body[data-ds-dark-theme] .srb-members-popover{background:#272727;--srb-label:#e6e6e6;--srb-muted:#999;--srb-control-muted:#303030;--srb-members-title:#e8e8e8;--srb-members-footer-bg:#333;--srb-members-separator:rgba(255,255,255,.08);--srb-members-scroll-track:transparent;--srb-members-scroll-thumb:var(--ework-scroll-thumb,#333333)}
.srb-avatar-info{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:min(160px,calc(100vw - 24px));min-height:66px;padding:12px;gap:4px;border:0;outline:1px solid #dfe0e2;outline-offset:-1px;border-radius:10px;background:#fcfcfc;color:rgb(40.8 43.35 45.9);backdrop-filter:blur(24px);box-shadow:0 12px 32px -6px #00000024;overflow:visible;z-index:4101;font-family:'Noto Sans SC',sans-serif}
.srb-avatar-info:popover-open{display:flex;flex-direction:column}.srb-avatar-info strong{font-size:13px;line-height:20px;font-weight:500;overflow-wrap:anywhere}.srb-avatar-info small{font-size:12px;line-height:18px;color:rgb(117.3 119.85 124.95)}
.srb-avatar-info>svg{position:absolute;left:calc(var(--srb-arrow-x,18px) - 6px);top:-6px;width:12px;height:8px;overflow:visible;fill:#fcfcfc;stroke:#dfe0e2;stroke-width:1;stroke-linejoin:round}.srb-avatar-info[data-side=top]>svg{top:auto;bottom:-6px;transform:rotate(180deg)}
[data-ds-dark-theme] .srb-avatar-info{background:#272727;color:rgb(232.05 232.05 232.05);outline-color:#3d3d3d;box-shadow:0 12px 32px -6px #0000004d}[data-ds-dark-theme] .srb-avatar-info small{color:rgb(153.3686 153.3686 153.3686)}[data-ds-dark-theme] .srb-avatar-info>svg{fill:#272727;stroke:#3d3d3d}
.srb-members-popover:popover-open{display:flex;flex-direction:column;gap:12px}.srb-members-popover h2{font-size:16px;font-weight:500;line-height:22px;margin:0;color:var(--srb-members-title,var(--srb-label))}.srb-members-popover p{margin:0}.srb-members-popover .srb-members-online{font-size:11px;line-height:17px;color:var(--srb-muted)}
.srb-members-popover>input{width:100%;height:32px;min-height:32px;padding:0 10px;border:0;border-radius:6px;background:var(--srb-control-muted);color:var(--srb-label);font:inherit;outline:none}.srb-members-popover>input:focus-visible{box-shadow:inset 0 0 0 1px var(--srb-blue)}.srb-members-popover>input::placeholder{color:var(--srb-muted)}
/* Keep the 3px Chromium scrollbar plus a 5px gap inside the 308px viewport. */
.srb-members-popover .srb-members-scroll{max-height:328px;min-height:48px;padding-right:5px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable;scrollbar-width:auto;scrollbar-color:auto}.srb-members-popover .srb-members-scroll::-webkit-scrollbar{width:3px}.srb-members-popover .srb-members-scroll::-webkit-scrollbar-track{border-radius:2px;background:var(--srb-members-scroll-track,transparent)}.srb-members-popover .srb-members-scroll::-webkit-scrollbar-thumb{border-radius:2px;background:var(--ework-scroll-thumb,#0000001a)}
.srb-members-popover .srb-members-scroll .srb-member{height:48px;min-height:48px;padding:0 4px;gap:8px}.srb-members-popover .srb-members-scroll .srb-member-avatar{width:28px;height:28px}.srb-members-popover .srb-members-scroll .srb-member-identity strong{font-size:12px;line-height:18px}.srb-members-popover .srb-members-scroll .srb-member-identity small{font-size:10px;line-height:16px}.srb-members-popover .srb-members-scroll .srb-role{font-size:10px;line-height:18px}.srb-members-popover .srb-members-empty{font-size:12px;color:var(--srb-muted);padding:14px 4px}
.srb-members-popover .srb-members-footer{border-top:1px solid var(--srb-members-separator,var(--srb-control-border));padding-top:12px;flex:none}.srb-members-popover .srb-members-footer button{height:32px;width:100%;border:0;border-radius:6px;background:var(--srb-members-footer-bg,var(--srb-control-muted));color:var(--srb-label);font:inherit;cursor:pointer}.srb-members-popover .srb-members-footer button:hover{background:var(--srb-control-strong)}

/* Figma 286:1053–1059 / 1713–1719: independent peer frame, label and vector cursor. */
.srb-canvas-presence{--srb-occupied-stroke:#4d91b3;--srb-occupied-fill:#e2f2f7;--srb-occupied-text:#386e88;--srb-cursor-color:#8b6cb3}
body[data-ds-dark-theme] .srb-canvas-presence{--srb-occupied-stroke:#74adc5;--srb-occupied-fill:#243b49;--srb-occupied-text:#a6d8e7;--srb-cursor-color:#c1a8e0}
.srb-occupied{border:0;border-radius:10px;color:var(--srb-occupied-stroke);pointer-events:none}
.srb-occupied-outline{position:absolute;inset:0;overflow:visible;pointer-events:none}
.srb-occupied .srb-occupied-label{position:absolute;left:0;top:-31.42px;display:flex;align-items:center;box-sizing:border-box;height:30px;padding:6px 10px;border-radius:7px;background:var(--srb-occupied-fill);color:var(--srb-occupied-text);font:12px/18px 'Noto Sans SC',sans-serif;white-space:nowrap}
.srb-cursor{display:flex;align-items:center;gap:4px;width:max-content;min-width:72px;height:28px;padding:0;border-radius:0;background:transparent;color:var(--srb-cursor-color);transform:none;font:11px/17px 'Noto Sans SC',sans-serif;pointer-events:none}
.srb-cursor svg{display:block;flex:none}
.srb-create-collaboration-dialog .srb-recipient{padding:0 12px;border-radius:9px;background:var(--srb-info)}
body[data-ds-dark-theme] .srb-create-collaboration-dialog .srb-recipient{background:rgba(255,255,255,.05)}
.srb-create-collaboration-dialog .srb-recipient .srb-member-identity{height:40px;gap:0;align-content:start}


/* Figma 667:27507 / 28002 / 28497 / 28992: shared permission picker. */
.srb-dialog .srb-role-picker{display:flex;align-items:center;justify-content:space-between;flex:none;gap:8px;width:100px;height:30px;min-height:30px;padding:0 10px;border:1px solid var(--srb-control-border);border-radius:7px;background:transparent;color:var(--srb-label);font-size:12px;font-weight:400;line-height:20px}
.srb-management .srb-role-picker,.srb-member .srb-role-picker{width:88px}.srb-role-picker>span{flex:none}.srb-role-picker .srb-chevron{width:12px;height:12px}
body .srb-role-menu[popover][role=menu]{--role-bg:rgba(255,255,255,.97);--role-border:#dfe0e3;--role-selected:#f0f0f0;--role-label:#242424;--role-description:#757575;position:fixed;inset:auto;margin:0;box-sizing:border-box;width:280px;max-width:calc(100vw - 24px);height:142px;max-height:calc(100vh - 24px);overflow:hidden;padding:5px;border:1px solid var(--role-border);border-radius:10px;background:var(--role-bg);color:var(--role-label);box-shadow:0 8px 24px -4px rgba(0,0,0,.14);backdrop-filter:blur(12px);z-index:4200;font:13px/20px 'Noto Sans SC',var(--dsw-font-family,system-ui)}
body[data-ds-dark-theme] .srb-role-menu[popover][role=menu]{--role-bg:rgba(41,42,45,.97);--role-border:#444549;--role-selected:#373737;--role-label:#e6e6e6;--role-description:#9c9c9c}
body .srb-role-menu[popover][role=menu]:popover-open{display:flex;flex-direction:column;gap:2px}
body .srb-role-menu[popover][role=menu]>button[role=menuitemradio]{position:relative;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:0;box-sizing:border-box;flex:none;width:100%;height:64px;min-height:64px;margin:0;padding:7px 10px;border:0;border-radius:5px;text-align:left;background:transparent;color:var(--role-label);font:400 13px/20px 'Noto Sans SC',var(--dsw-font-family,system-ui);cursor:pointer}
body .srb-role-menu[popover][role=menu]>button[role=menuitemradio]>span:first-child{display:block;font:inherit}body .srb-role-menu[popover][role=menu]>button[role=menuitemradio] small{display:block;margin-top:3px;color:var(--role-description);font-size:11px;font-weight:400;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body .srb-role-menu[popover][role=menu]>button[role=menuitemradio][aria-checked=true],body .srb-role-menu[popover][role=menu]>button[role=menuitemradio]:hover,body .srb-role-menu[popover][role=menu]>button[role=menuitemradio]:focus-visible{background:var(--role-selected)}body .srb-role-menu[popover][role=menu]>button[role=menuitemradio][aria-checked=true]>span:first-child{font-weight:500}body .srb-role-menu[popover][role=menu]>button[role=menuitemradio]:focus-visible{outline:1px solid var(--srb-blue,#6099d3);outline-offset:-1px}
.srb-role-check{display:none;position:absolute;right:12px;top:10px;width:14px;height:14px;background:currentColor;mask:url(/figma-check.svg) center/contain no-repeat}.srb-role-menu [aria-checked=true] .srb-role-check{display:block}

@media(max-height:165px){body .srb-role-menu[popover][role=menu]{overflow-y:auto}}

@media(max-width:700px){.srb-actions{gap:4px}.srb-presence{gap:3px}.srb-avatar{width:25px;height:25px}}
`
  doc.head.append(style)
}
