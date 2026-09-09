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
  const closeButton = boardButton(doc, '×', close, '关闭')
  closeButton.className = 'srb-close'
  heading.append(h, closeButton)
  dialog.append(heading, body, status)
  doc.body.append(dialog)
  dialog.addEventListener('close', () => dialog.remove())
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
        status.textContent =
          error instanceof Error ? error.message : '操作未完成，请重试。'
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
  const style = doc.createElement('style')
  style.id = 'sherlock-research-boards-style'
  style.textContent = `
.srb-section,.srb-actions,.srb-presence,.srb-dialog,.srb-notifications,.srb-bubble,.srb-discussion{font:13px/1.5 var(--dsw-font-family,system-ui);color:var(--dsw-alias-label-primary,#252525)}
.srb-section{padding:8px 0;flex:none;min-height:40px;max-height:32vh;overflow:auto}.srb-section header,.srb-row,.srb-actions,.srb-presence{display:flex;align-items:center;gap:6px;min-width:0}.srb-section header{padding:0 8px 6px;color:var(--dsw-alias-label-secondary,#666)}
.srb-discussion button,.srb-terminated button,.srb-readonly button,.srb-section button,.srb-actions button,.srb-presence button,.srb-dialog button,.srb-notifications button,.srb-bubble button{font:inherit;color:inherit;border:0;background:transparent;cursor:pointer;border-radius:7px;padding:6px 9px}.srb-section button:hover,.srb-actions button:hover,.srb-dialog button:hover,.srb-notifications button:hover,.srb-bubble button:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}
.srb-section button:focus-visible,.srb-actions button:focus-visible,.srb-presence button:focus-visible,.srb-dialog :is(button,input,select):focus-visible,.srb-notifications button:focus-visible,.srb-bubble button:focus-visible{outline:2px solid #6099d3;outline-offset:2px}
.srb-row{padding:1px 4px}.srb-row[aria-current=true]{background:var(--dsw-alias-interactive-bg-hover,#8882);border-radius:8px}.srb-row>button:first-child{flex:1;min-width:0;text-align:left;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}.srb-section .srb-empty{font-size:12px;color:var(--dsw-alias-label-secondary,#777);padding:4px 12px;margin:0}.srb-section header button:first-child{flex:1;text-align:left}.srb-section[data-wide=false]{overflow:visible;max-height:none}.srb-section[data-wide=false] header{padding:0;justify-content:center}.srb-section[data-wide=false] header button:first-child{text-align:center}
.srb-actions{white-space:nowrap;flex:none}.srb-actions .srb-star[aria-pressed=true]{color:#bc8637}.srb-badge{font-size:11px;color:var(--dsw-alias-label-secondary,#777)}.srb-presence{gap:6px;flex:none}.srb-avatar{position:relative;display:grid!important;place-items:center;padding:0!important;width:28px;height:28px;border-radius:50%!important;background:var(--srb-color,#dce7e5)!important;color:#263b3a!important;border:1px solid #fff5!important}.srb-avatar:after{content:'';position:absolute;right:0;bottom:0;width:5px;height:5px;border-radius:50%;background:#588a76;border:1px solid var(--dsw-alias-bg-base,#fff)}.srb-avatar[data-offline=true]:after{background:#999}.srb-tip{display:none;position:absolute;z-index:3500;top:36px;right:0;min-width:120px;max-width:220px;white-space:normal;text-align:left;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#222);box-shadow:0 4px 24px #0002;pointer-events:none}.srb-avatar:is(:hover,:focus) .srb-tip{display:block}.srb-tip small{display:block;font-size:11px;color:var(--dsw-alias-label-secondary,#666)}
.srb-dialog{box-sizing:border-box;width:min(460px,calc(100vw - 32px));max-height:calc(100vh - 40px);border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:16px;background:var(--dsw-alias-bg-layer-2,#fff);padding:18px;box-shadow:0 24px 90px #0003}.srb-dialog::backdrop{background:#0005}.srb-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px}.srb-dialog h2{font-size:17px;font-weight:600;margin:0}.srb-dialog-body{display:grid;gap:12px;margin-top:18px}.srb-dialog input,.srb-dialog select{font:inherit;color:inherit;background:var(--dsw-alias-bg-base,#fafafa);padding:9px 10px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;box-sizing:border-box;min-width:0;width:100%}.srb-dialog label{display:grid;gap:5px}.srb-status{font-size:12px;color:var(--dsw-alias-label-secondary,#666);white-space:pre-wrap}.srb-status:empty{display:none}.srb-primary{background:var(--dsw-alias-label-primary,#222)!important;color:var(--dsw-alias-bg-layer-2,#fff)!important}.srb-dialog button:disabled,.srb-notifications button:disabled,.srb-bubble button:disabled{opacity:.5;cursor:default}.srb-member{display:flex;align-items:center;gap:8px}.srb-member span{flex:1;min-width:0}.srb-member select{width:115px}.srb-menu-item{text-align:left;width:100%}.srb-divider{border-top:1px solid var(--dsw-alias-border-l2,#ddd)}
.srb-discussion{padding:20px 16px;display:flex;flex-direction:column;gap:18px;min-height:120px}.srb-request-group{display:flex;flex-direction:column;gap:18px}.srb-message{overflow-wrap:anywhere}.srb-message[data-role=user]{align-self:flex-end;max-width:90%;background:var(--dsw-alias-interactive-bg-hover,#8881);border-radius:14px;padding:10px 14px}.srb-message small{font-size:11px;color:var(--dsw-alias-label-secondary,#777);display:block;margin-bottom:5px}.srb-message p{margin:0;white-space:pre-wrap}.srb-terminated{padding:32px;max-width:460px;margin:auto;text-align:center}.srb-terminated h3{font-size:17px}.srb-readonly{font-size:12px;padding:6px 12px;background:var(--dsw-alias-bg-layer-2,#fff);border-radius:8px;position:absolute;top:10px;left:12px;z-index:20}.srb-canvas-presence{position:absolute;inset:0;pointer-events:none;z-index:19;overflow:hidden}.srb-cursor{position:absolute;font-size:11px;color:#fff;padding:2px 6px;border-radius:2px 8px 8px 8px;background:var(--srb-color,#6c9489);transform:translate(3px,3px)}.srb-occupied{position:absolute;border:2px dashed var(--srb-color,#6c9489);border-radius:12px;box-sizing:border-box}.srb-occupied span{position:absolute;top:-21px;left:0;color:var(--srb-color,#53776e);font-size:11px;white-space:nowrap}
[data-dsh-sidebar-root] [data-slot="sidebar.settings"]:has(.srb-account-controls){flex:1;min-width:0;width:100%}.srb-account-controls{display:flex;align-items:center;min-width:0;width:100%;gap:2px}.srb-account-controls .sherlock-account-button{flex:1;min-width:0;width:auto!important}.srb-bell{position:relative;flex:none;display:grid;place-items:center;border:0;background:transparent;color:var(--dsw-alias-label-primary,#222);width:32px;height:34px;border-radius:8px;cursor:pointer}.srb-bell:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}.srb-bell svg{width:17px;height:17px}.srb-bell[data-unread=true]:after{content:'';position:absolute;right:6px;top:5px;width:6px;height:6px;border-radius:50%;background:#df544f;border:1px solid var(--dsw-specific-sidebar-fill,#fff)}
[data-sherlock-update-footer]:has(#sherlock-sidebar-update-button:not([hidden])) .srb-account-controls{width:calc(100% - 40px)}[data-sherlock-update-footer]:has(#sherlock-sidebar-update-button[data-action=download]:hover) .srb-account-controls{width:calc(100% - 100px)}[data-sidebar-collapsed=true] .srb-account-controls{flex-direction:column;width:100%!important;gap:2px}[data-sidebar-collapsed=true] .srb-account-controls .sherlock-account-button{flex:none;margin:4px auto!important}[data-sidebar-collapsed=true] .srb-bell{margin:0 auto 6px}
.srb-notifications,.srb-bubble{position:fixed;z-index:3200;box-sizing:border-box;width:min(340px,calc(100vw - 24px));max-height:min(520px,calc(100vh - 36px));overflow:auto;padding:14px;border-radius:14px;border:1px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-alias-bg-layer-2,#fff);box-shadow:0 12px 40px #0003}.srb-notifications header,.srb-bubble header{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:600}.srb-notification{padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l2,#ddd)}.srb-notification p{margin:4px 0}.srb-notification small{color:var(--dsw-alias-label-secondary,#777)}.srb-notification-actions{display:flex;justify-content:flex-end;gap:6px}.srb-notifications nav{display:flex;gap:4px;margin:10px 0}.srb-notifications nav [aria-selected=true]{background:var(--dsw-alias-interactive-bg-hover,#8882)}

/* Shared section geometry and understated board actions. */
.srb-section{padding:6px 0 10px;font-size:14px;line-height:20px}.srb-section header{height:36px;box-sizing:border-box;padding:0 4px;margin-bottom:4px}.srb-section header .srb-section-toggle,[data-srb-workspaces] .srb-section-toggle{display:inline-flex;align-items:center;justify-content:flex-start;gap:7px;flex:none;font:inherit;font-size:14px;font-weight:400;line-height:20px;color:var(--dsw-alias-label-tertiary,#888);padding:0;height:28px;border:0;background:transparent;cursor:pointer;border-radius:4px}.srb-section header .srb-section-toggle:hover,[data-srb-workspaces] .srb-section-toggle:hover{color:var(--dsw-alias-label-primary,#222);background:transparent}.srb-chevron{display:inline-block;box-sizing:border-box;width:6px;height:6px;border-right:1.4px solid currentColor;border-bottom:1.4px solid currentColor;transform:rotate(45deg) translateY(-2px);margin:0 3px;flex:none}.srb-chevron[data-collapsed=true]{transform:rotate(-45deg)}
[data-srb-workspaces] [data-srb-workspace-list][hidden]{display:none!important}[data-srb-workspaces][data-section-collapsed=true]{flex:none!important;min-height:0!important}
.srb-row{margin:0;padding:0 8px;height:32px;gap:0;border-radius:8px}.srb-row:hover{background:var(--dsw-alias-interactive-bg-hover,#8881)}.srb-row>button:first-child{display:flex;align-items:center;gap:6px;padding:0 6px 0 0;height:32px;font-size:14px;line-height:20px}.srb-row>button:first-child>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.srb-row>button:first-child>svg{width:13px;height:13px;flex:none}.srb-row>button:first-child:hover{background:transparent}.srb-edit-time{font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary,#999);flex:none;white-space:nowrap}.srb-actions{gap:10px;margin-left:auto}.srb-actions button{font-size:12px;height:30px;box-sizing:border-box}.srb-actions .srb-favorite-button{color:var(--dsw-alias-label-secondary,#666)}.srb-menu-trigger{display:flex;align-items:center;gap:7px}.srb-actions .srb-presence{padding-right:2px}
.srb-action-menu{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:208px;padding:5px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:12px;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#222);box-shadow:0 8px 32px #0002;z-index:4000;font:13px/1.5 system-ui}.srb-action-menu button{display:block;width:100%;padding:9px 12px;text-align:left;border:0;border-radius:7px;background:transparent;color:inherit;font:inherit;cursor:pointer}.srb-action-menu button:is(:hover,:focus-visible){outline:none;background:var(--dsw-alias-interactive-bg-hover,#8882)}
.srb-dialog{width:min(520px,calc(100vw - 32px));padding:0;overflow:hidden}.srb-dialog>header{padding:20px 24px 16px;border-bottom:1px solid var(--dsw-alias-border-l2,#ddd)}.srb-dialog h2{font-size:16px}.srb-dialog .srb-close,.srb-notifications header button,.srb-bubble header button{display:grid;place-items:center;width:28px;height:28px;padding:0;font-size:21px;line-height:1;color:var(--dsw-alias-label-tertiary,#888)}.srb-dialog-body{margin:0;padding:20px 24px 24px;max-height:calc(100vh - 170px);overflow:auto;gap:16px}.srb-dialog p{margin:0;line-height:1.65}.srb-dialog .srb-status{padding:12px 24px;border-top:1px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-alias-interactive-bg-hover,#8881)}.srb-dialog button{min-height:34px;padding:7px 12px;font-size:12px;white-space:nowrap;box-sizing:border-box}.srb-dialog :is(input,select){height:36px;padding:7px 10px;border-radius:8px;background:transparent}.srb-dialog label{font-size:12px;font-weight:500;gap:8px}.srb-dialog label input,.srb-dialog label select{font-weight:400;font-size:13px}.srb-description{font-size:12px!important;font-weight:400;color:var(--dsw-alias-label-secondary,#777);line-height:1.6}.srb-dialog-intro{display:grid;gap:5px}.srb-dialog-intro>strong{font-size:14px;overflow-wrap:anywhere}.srb-field-row{display:flex;align-items:center;gap:8px;min-width:0}.srb-field-row input{flex:1;width:0}.srb-field-row button{flex:none;border:1px solid var(--dsw-alias-border-l2,#ddd)}.srb-info-panel{padding:12px 14px;border-radius:10px;background:var(--dsw-alias-interactive-bg-hover,#8881);font-size:12px;color:var(--dsw-alias-label-secondary,#777)}
.srb-dialog-tabs{display:flex;gap:20px;border-bottom:1px solid var(--dsw-alias-border-l2,#ddd)}.srb-dialog-tabs button{padding:0 0 10px;border-radius:0;color:var(--dsw-alias-label-secondary,#777);position:relative}.srb-dialog-tabs button:hover{background:transparent}.srb-dialog-tabs button[aria-selected=true]{color:var(--dsw-alias-label-primary,#222);font-weight:600}.srb-dialog-tabs button[aria-selected=true]:after{content:'';height:2px;position:absolute;bottom:-1px;left:0;right:0;background:currentColor;border-radius:2px}.srb-tab-panel{display:grid;gap:22px}.srb-tab-panel[hidden]{display:none}.srb-invite-form{display:grid;gap:10px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:12px;padding:16px}.srb-recipient:empty{display:none}.srb-recipient{font-size:12px;padding:10px 12px;background:var(--dsw-alias-interactive-bg-hover,#8881);border-radius:8px}.srb-invite-controls{display:flex;justify-content:space-between;align-items:flex-end;gap:16px}.srb-invite-controls label{min-width:112px}.srb-invite-controls>button{min-width:100px}.srb-dialog h3{margin:0 0 8px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#666)}.srb-member{padding:10px 0;gap:10px}.srb-member+.srb-member{border-top:1px solid var(--dsw-alias-border-l2,#ddd)}.srb-member-avatar{display:grid;place-items:center;flex:none;width:32px;height:32px;border-radius:50%;background:var(--srb-color);color:#263b3a;position:relative}.srb-member-avatar[data-online=true]:after{content:'';position:absolute;bottom:0;right:0;width:6px;height:6px;background:#588a76;border-radius:50%;border:2px solid var(--dsw-alias-bg-layer-2,#fff)}.srb-member-identity{display:grid;gap:2px;flex:1;min-width:0}.srb-member-identity strong{font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.srb-member-identity small,.srb-member .srb-role{color:var(--dsw-alias-label-secondary,#777);font-size:11px}.srb-member .srb-role{flex:none}.srb-member select{width:90px;height:32px;font-size:12px}.srb-member button{padding:6px 8px}.srb-setting-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l2,#ddd)}.srb-setting-label{display:grid;gap:4px;min-width:0}.srb-setting-label strong{font-size:12px;font-weight:500}.srb-setting-row>button{border:1px solid var(--dsw-alias-border-l2,#ddd)}.srb-dialog .srb-quiet-danger{color:#bf5550}.srb-danger-button{background:#b74c47!important;color:white!important}.srb-dialog-footer{display:flex;justify-content:flex-end;gap:8px;padding-top:6px}
.srb-notifications{padding:0;display:flex;flex-direction:column;overflow:hidden;width:min(360px,calc(100vw - 24px))}.srb-notifications>header{padding:16px 18px 8px;font-size:14px;flex:none}.srb-notifications nav{margin:0;padding:0 12px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,#ddd);align-items:center;flex:none}.srb-notifications nav button{font-size:12px;padding:5px 9px}.srb-notifications nav button:last-child{margin-left:auto;color:var(--dsw-alias-label-tertiary,#888);font-size:11px}.srb-notification-list{overflow:auto;padding:0 16px 8px}.srb-notification{position:relative;padding:16px 0;display:grid;gap:6px}.srb-notification:last-child{border-bottom:0}.srb-notification p{margin:0}.srb-notification-title{font-size:13px;font-weight:600;line-height:1.5;padding-right:10px;overflow-wrap:anywhere}.srb-notification[data-unread=true] .srb-notification-title:after{content:'';display:inline-block;width:5px;height:5px;border-radius:50%;background:#d55f59;margin:0 0 2px 7px}.srb-notification-subtitle{font-size:12px;color:var(--dsw-alias-label-secondary,#777);line-height:1.6}.srb-notification small{font-size:11px;color:var(--dsw-alias-label-tertiary,#999)}.srb-notification-actions{align-items:center;margin-top:5px;gap:8px}.srb-notification-actions button{font-size:12px;padding:6px 16px;border:1px solid var(--dsw-alias-border-l2,#ddd)}.srb-notification-status{font-size:11px;color:var(--dsw-alias-label-tertiary,#999)}.srb-notification-footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.srb-notification-footer button{font-size:12px}.srb-notification-empty{padding:38px 20px;text-align:center;color:var(--dsw-alias-label-tertiary,#999);font-size:12px}.srb-bubble{padding:14px 16px}.srb-bubble>header{font-size:12px}.srb-bubble .srb-notification{padding-bottom:0}
@media(max-width:700px){.srb-actions{gap:4px}.srb-presence{gap:3px}.srb-avatar{width:25px;height:25px}}
`
  doc.head.append(style)
}
