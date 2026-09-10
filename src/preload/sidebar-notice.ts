import { noticeIconAssets } from './figma-notice-assets'

export function noticeIcon(doc: Document, name: keyof typeof noticeIconAssets): HTMLElement {
  const icon = doc.createElement('span')
  icon.className = 'ework-notice-icon'
  icon.dataset.noticeIcon = name
  icon.setAttribute('aria-hidden', 'true')
  icon.style.setProperty('--notice-icon', `url("${noticeIconAssets[name]}")`)
  return icon
}

export function positionSidebarNotice(doc: Document, element: HTMLElement): void {
  const win = doc.defaultView!
  const sidebar = doc.querySelector<HTMLElement>('[data-dsh-sidebar-root]')
  const root = doc.querySelector<HTMLElement>('.VOzbGW_nav') ?? sidebar
  const account = sidebar?.querySelector<HTMLElement>('.srb-account-controls, [data-dsh-sidebar-footer], [data-slot="sidebar.settings"]')
  const bounds = root?.getBoundingClientRect()
  const anchor = account?.getBoundingClientRect()
  if (!bounds || !anchor) return
  const settings = !!doc.querySelector('.VOzbGW_panel:not([hidden]), [data-sherlock-settings-panel]')
  const width = bounds.width > 100 ? Math.min(settings ? 212 : 252, bounds.width - 28) : 252
  element.style.width = `${Math.max(180, width)}px`
  element.style.left = `${Math.max(12, Math.min(bounds.left + 14, win.innerWidth - width - 12))}px`
  element.style.bottom = `${Math.max(12, win.innerHeight - anchor.top + 12)}px`
}

export function installSidebarNoticeStyles(doc: Document): void {
  if (doc.getElementById('ework-sidebar-notice-style')) return
  const style = doc.createElement('style')
  style.id = 'ework-sidebar-notice-style'
  style.textContent = `
.ework-sidebar-notice{--notice-bg:rgba(247,247,248,.78);--notice-border:rgba(255,255,255,.72);--notice-text:#292b2d;--notice-muted:#74777b;--notice-button:rgba(255,255,255,.55);--notice-button-border:rgba(213,215,219,.65);--notice-primary:#292b2d;--notice-on-primary:#fff;--notice-track:#d5d7db;--notice-accent:#3671d9;box-sizing:border-box;position:fixed;z-index:1500;display:flex;flex-direction:column;gap:6px;width:252px;padding:12px;color:var(--notice-text);background:var(--notice-bg);border:0;outline:1px solid var(--notice-border);outline-offset:-1px;border-radius:10px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 2px 10px -3px rgba(0,0,0,.06);font:400 12px/18px "Noto Sans SC",sans-serif}
body[data-ds-dark-theme] .ework-sidebar-notice{--notice-bg:rgba(51,51,51,.88);--notice-border:rgba(88,88,88,.45);--notice-text:#e6e6e6;--notice-muted:#aaa;--notice-button:rgba(69,69,69,.55);--notice-button-border:rgba(81,81,81,.65);--notice-primary:#e6e6e6;--notice-on-primary:#1b1b1b;--notice-track:#515151;--notice-accent:#87abff;box-shadow:0 2px 10px -3px rgba(0,0,0,.16)}
.ework-sidebar-notice[hidden]{display:none!important}.ework-sidebar-notice header{display:flex;align-items:center;gap:6px;min-height:20px;font-size:13px;font-weight:500;line-height:20px}.ework-sidebar-notice header>strong{flex:1;min-width:0;font:inherit;overflow-wrap:anywhere}.ework-notice-icon{display:inline-block;width:16px;height:16px;flex:0 0 16px;background:currentColor;mask:var(--notice-icon) center/contain no-repeat;-webkit-mask:var(--notice-icon) center/contain no-repeat;color:var(--notice-muted,#74777b)}
.ework-sidebar-notice p{margin:0;overflow-wrap:anywhere}.ework-sidebar-notice .ework-notice-description{font-size:11px;line-height:17px;color:var(--notice-muted)}.ework-sidebar-notice .ework-notice-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;min-height:26px}.ework-sidebar-notice button{box-sizing:border-box;appearance:none;border:1px solid var(--notice-button-border);background:var(--notice-button);color:var(--notice-text);border-radius:6px;padding:0 10px;height:26px;min-height:0;font:400 12px/18px "Noto Sans SC",sans-serif;cursor:pointer;white-space:nowrap}.ework-sidebar-notice button.ework-notice-primary{background:var(--notice-primary);color:var(--notice-on-primary);border-color:transparent}.ework-sidebar-notice button:hover{filter:brightness(.95)}.ework-sidebar-notice button:focus-visible{outline:1.5px solid var(--notice-accent);outline-offset:2px}.ework-sidebar-notice button:disabled{opacity:.6;cursor:default}.ework-sidebar-notice button.ework-notice-close{border:0;background:transparent;border-radius:3px;width:12px;height:12px;padding:0;display:grid;place-items:center;margin-left:auto;flex:0 0 12px}.ework-notice-close .ework-notice-icon{width:12px;height:12px;flex-basis:12px}.ework-notice-progress{height:3px;border-radius:2px;background:var(--notice-track);overflow:hidden}.ework-notice-progress>span{display:block;height:100%;width:var(--notice-progress,0%);background:var(--notice-accent);border-radius:2px;transition:width 120ms linear}.ework-notice-icon[data-notice-icon=loading]{animation:ework-notice-spin 900ms linear infinite}@keyframes ework-notice-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.ework-notice-icon[data-notice-icon=loading]{animation-duration:1800ms}}
.srb-bubble.ework-sidebar-notice{z-index:1501;max-height:calc(100vh - 80px);overflow:auto}.srb-bubble.ework-sidebar-notice .srb-notification{padding:0;border:0;display:flex;flex-direction:column;gap:6px}.srb-bubble.ework-sidebar-notice .srb-notification p{margin:0}.srb-bubble.ework-sidebar-notice .srb-notification-title{padding:0;font-size:12px;font-weight:400;line-height:18px}.srb-bubble.ework-sidebar-notice .srb-notification-title:after{display:none}.srb-bubble.ework-sidebar-notice :is(.srb-notification-subtitle,small){font-size:11px;line-height:17px;color:var(--notice-muted)}.srb-bubble.ework-sidebar-notice .srb-notification-actions{margin:0;min-height:26px;gap:6px}.srb-bubble.ework-sidebar-notice .srb-notification-actions button{padding:0 10px;height:26px}.srb-bubble.ework-sidebar-notice .srb-primary{background:var(--notice-primary)!important;color:var(--notice-on-primary)!important}
`
  doc.head.append(style)
}
