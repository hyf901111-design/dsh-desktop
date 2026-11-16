import { noticeIconAssets } from './figma-notice-assets'

export function noticeIcon(doc: Document, name: keyof typeof noticeIconAssets): HTMLElement {
  const icon = doc.createElement('span')
  icon.className = 'ework-notice-icon'
  icon.dataset.noticeIcon = name
  icon.setAttribute('aria-hidden', 'true')
  icon.style.setProperty('--notice-icon', `url("${noticeIconAssets[name]}")`)
  return icon
}

function visibleBounds(doc: Document, element: HTMLElement | null | undefined): DOMRect | undefined {
  if (!element || element.closest('[hidden]')) return
  const style = doc.defaultView!.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden') return
  const bounds = element.getBoundingClientRect()
  return bounds.width > 0 && bounds.height > 0 ? bounds : undefined
}

function setStyle(element: HTMLElement, key: string, value: string): void {
  if (element.style.getPropertyValue(key) !== value) element.style.setProperty(key, value)
}

function reserveSettingsNavigation(doc: Document): void {
  for (const nav of doc.querySelectorAll<HTMLElement>('.VOzbGW_nav')) {
    const bounds = visibleBounds(doc, nav), list = nav.querySelector<HTMLElement>('.VOzbGW_navList')
    const notices = [...doc.querySelectorAll<HTMLElement>('.ework-sidebar-notice')].filter(el =>
      !el.hidden && !el.hasAttribute('data-notice-unpositioned') && el.dataset.noticeSettings === 'true' && visibleBounds(doc, el))
    if (!bounds || !list || !notices.length) {
      nav.removeAttribute('data-ework-notice-reserved')
      if (nav.style.getPropertyValue('--ework-notice-nav-height')) nav.style.removeProperty('--ework-notice-nav-height')
      continue
    }
    const top = Math.min(...notices.map(el => doc.defaultView!.innerHeight - Number.parseFloat(el.style.bottom) - el.getBoundingClientRect().height))
    const listTop = list.getBoundingClientRect().top + nav.scrollTop
    if (!nav.hasAttribute('data-ework-notice-reserved')) nav.setAttribute('data-ework-notice-reserved', '')
    setStyle(nav, '--ework-notice-nav-height', `${Math.max(0, top - 12 - listTop)}px`)
  }
}

export function positionSidebarNotice(doc: Document, element: HTMLElement): void {
  const win = doc.defaultView!
  const sidebar = doc.querySelector<HTMLElement>('[data-dsh-sidebar-root]')
  const settingsNav = [...doc.querySelectorAll<HTMLElement>('.VOzbGW_panel .VOzbGW_nav')].find(el => visibleBounds(doc, el))
  const root = settingsNav ?? sidebar
  // The settings slot uses display:contents in the real sidebar; its box is empty.
  const account = [...sidebar?.querySelectorAll<HTMLElement>('.srb-account-controls, [data-dsh-sidebar-footer], [data-slot="sidebar.settings"]') ?? []].find(el => visibleBounds(doc, el))
  const bounds = visibleBounds(doc, root), anchor = visibleBounds(doc, account)
  if (!bounds || (!settingsNav && !anchor)) {
    if (!element.hasAttribute('data-notice-unpositioned')) element.setAttribute('data-notice-unpositioned', '')
    reserveSettingsNavigation(doc)
    return
  }
  if (element.hasAttribute('data-notice-unpositioned')) element.removeAttribute('data-notice-unpositioned')
  element.dataset.noticeSettings = String(!!settingsNav)
  const width = element.dataset.updateNotes === 'true'
    ? Math.min(352, win.innerWidth - 24)
    : bounds.width > 100 ? Math.min(settingsNav ? 212 : 252, bounds.width - 28) : 252
  // Figma 337:769/872/972: bottom=nav.bottom-56. The top account tab is not a footer.
  const bottom = Math.max(12, settingsNav ? win.innerHeight - bounds.bottom + 56 : win.innerHeight - anchor!.top + 12)
  setStyle(element, 'width', `${Math.max(180, width)}px`)
  setStyle(element, 'left', `${Math.max(12, Math.min(bounds.left + 14, win.innerWidth - width - 12))}px`)
  setStyle(element, 'bottom', `${bottom}px`)
  setStyle(element, 'max-height', `${Math.max(0, win.innerHeight - bottom - 12)}px`)
  reserveSettingsNavigation(doc)
}

function observeNoticeAnchors(doc: Document): void {
  const win = doc.defaultView!
  let frame = 0
  const observed = new Set<Element>()
  const refresh = () => {
    frame = 0
    const targets = new Set(doc.querySelectorAll('.ework-sidebar-notice,.VOzbGW_nav,[data-dsh-sidebar-root],.srb-account-controls,[data-dsh-sidebar-footer]'))
    for (const old of observed) if (!targets.has(old)) { resize?.unobserve(old); observed.delete(old) }
    for (const target of targets) if (!observed.has(target)) { resize?.observe(target); observed.add(target) }
    for (const notice of doc.querySelectorAll<HTMLElement>('.ework-sidebar-notice')) positionSidebarNotice(doc, notice)
    reserveSettingsNavigation(doc)
  }
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(refresh) }
  const resize = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(schedule) : undefined
  const mutations = new win.MutationObserver(records => {
    // Ignore our own positioning styles; external sizes are covered by ResizeObserver.
    if (records.some(record => record.type !== 'attributes' || record.attributeName !== 'style' ||
      !(record.target as Element).matches('.ework-sidebar-notice,.VOzbGW_nav'))) schedule()
  })
  mutations.observe(doc.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class','hidden','style','data-sidebar-collapsed'] })
  win.addEventListener('resize', schedule)
  win.addEventListener('unload', () => { mutations.disconnect();resize?.disconnect();win.removeEventListener('resize', schedule);if (frame) win.cancelAnimationFrame(frame) }, { once:true })
  schedule()
}

export function installSidebarNoticeStyles(doc: Document): void {
  if (doc.getElementById('ework-sidebar-notice-style')) return
  const style = doc.createElement('style')
  style.id = 'ework-sidebar-notice-style'
  style.textContent = `
.ework-sidebar-notice[data-notice-unpositioned]{visibility:hidden!important}
.ework-sidebar-notice{overflow:auto}
.VOzbGW_nav[data-ework-notice-reserved] .VOzbGW_navList{max-height:var(--ework-notice-nav-height);min-height:0;flex:none;overflow-y:auto}
.VOzbGW_nav[data-ework-notice-reserved] .VOzbGW_navList>*{flex-shrink:0}
.ework-sidebar-notice{--notice-bg:rgba(247,247,248,.78);--notice-border:rgba(255,255,255,.72);--notice-text:#292b2d;--notice-muted:#74777b;--notice-button:rgba(255,255,255,.55);--notice-button-border:rgba(213,215,219,.65);--notice-primary:#292b2d;--notice-on-primary:#fff;--notice-track:#d5d7db;--notice-accent:#3671d9;box-sizing:border-box;position:fixed;z-index:1500;display:flex;flex-direction:column;gap:6px;width:252px;padding:12px;color:var(--notice-text);background:var(--notice-bg);border:0;outline:1px solid var(--notice-border);outline-offset:-1px;border-radius:10px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 2px 10px -3px rgba(0,0,0,.06);font:400 12px/18px "Noto Sans SC",sans-serif}
body[data-ds-dark-theme] .ework-sidebar-notice{--notice-bg:rgba(51,51,51,.88);--notice-border:rgba(88,88,88,.45);--notice-text:#e6e6e6;--notice-muted:#aaa;--notice-button:rgba(69,69,69,.55);--notice-button-border:rgba(81,81,81,.65);--notice-primary:#e6e6e6;--notice-on-primary:#1b1b1b;--notice-track:#515151;--notice-accent:#87abff;box-shadow:0 2px 10px -3px rgba(0,0,0,.16)}
.ework-sidebar-notice[hidden]{display:none!important}.ework-sidebar-notice header{display:flex;align-items:center;gap:6px;min-height:20px;font-size:13px;font-weight:500;line-height:20px}.ework-sidebar-notice header>strong{flex:1;min-width:0;font:inherit;overflow-wrap:anywhere}.ework-notice-icon{display:inline-block;width:16px;height:16px;flex:0 0 16px;background:currentColor;mask:var(--notice-icon) center/contain no-repeat;-webkit-mask:var(--notice-icon) center/contain no-repeat;color:var(--notice-muted,#74777b)}
.ework-sidebar-notice p{margin:0;overflow-wrap:anywhere}.ework-sidebar-notice .ework-notice-description{font-size:11px;line-height:17px;color:var(--notice-muted)}.ework-sidebar-notice .ework-notice-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;min-height:26px}.ework-sidebar-notice button{box-sizing:border-box;appearance:none;border:0;box-shadow:inset 0 0 0 1px var(--notice-button-border);background:var(--notice-button);color:var(--notice-text);border-radius:6px;padding:0 10px;height:26px;min-height:0;font:400 12px/18px "Noto Sans SC",sans-serif;cursor:pointer;white-space:nowrap}.ework-sidebar-notice button.ework-notice-primary{background:var(--notice-primary);color:var(--notice-on-primary);box-shadow:none}.ework-sidebar-notice button:hover{filter:brightness(.95)}.ework-sidebar-notice button:focus-visible{outline:1.5px solid var(--notice-accent);outline-offset:2px}.ework-sidebar-notice button:disabled{opacity:.6;cursor:default}.ework-sidebar-notice button.ework-notice-close{border:0;box-shadow:none;background:transparent;border-radius:3px;width:12px;height:12px;padding:0;display:grid;place-items:center;margin-left:auto;flex:0 0 12px}.ework-notice-close .ework-notice-icon{width:12px;height:12px;flex-basis:12px}.ework-notice-progress{height:3px;border-radius:2px;background:var(--notice-track);overflow:hidden}.ework-notice-progress>span{display:block;height:100%;width:var(--notice-progress,0%);background:var(--notice-accent);border-radius:2px;transition:width 120ms linear}.ework-notice-icon[data-notice-icon=loading]{animation:ework-notice-spin 900ms linear infinite}@keyframes ework-notice-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.ework-notice-icon[data-notice-icon=loading]{animation-duration:1800ms}}
.srb-bubble.ework-sidebar-notice{z-index:1501;max-height:calc(100vh - 80px);overflow:auto}.srb-bubble.ework-sidebar-notice .srb-notification{padding:0;border:0;display:flex;flex-direction:column;gap:6px}.srb-bubble.ework-sidebar-notice .srb-notification p{margin:0}.srb-bubble.ework-sidebar-notice .srb-notification-title{padding:0;font-size:12px;font-weight:400;line-height:18px}.srb-bubble.ework-sidebar-notice .srb-notification-title:after{display:none}.srb-bubble.ework-sidebar-notice :is(.srb-notification-subtitle,small){font-size:11px;line-height:17px;color:var(--notice-muted)}.srb-bubble.ework-sidebar-notice .srb-notification-actions{margin:0;min-height:26px;gap:6px}.srb-bubble.ework-sidebar-notice .srb-notification-actions button{padding:0 10px;height:26px}.srb-bubble.ework-sidebar-notice .srb-primary{box-shadow:none;background:var(--notice-primary)!important;color:var(--notice-on-primary)!important}
`
  doc.head.append(style)
  observeNoticeAnchors(doc)
}
