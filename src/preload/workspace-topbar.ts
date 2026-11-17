import { icons } from './scheduled/icons'
import workspaceIcon from './browser/assets/workspace.svg?inline'

/** Workspace surfaces share the scheduled-page back control. */
export function workspaceBackButton(className = '', action: 'back' | 'exit' = 'back'): string {
  const classes = className.split(/\s+/).filter(value => /^[a-zA-Z0-9_-]+$/.test(value)).join(' ')
  return `<button type="button" class="workspace-back-button t8lSSG_toggleButton ${classes}" data-action="${action}" aria-label="返回工作区" title="返回工作区"><i class="workspace-back-icon" aria-hidden="true"></i></button>`
}

export function reserveWorkspaceRightControl(header: HTMLElement) {
  const box = header.getBoundingClientRect()
  const control = header.ownerDocument.querySelector('[data-odyssey-panel-entry=right][aria-expanded=false]')?.getBoundingClientRect()
  const overlaps = control && control.width > 0 && control.height > 0 && control.bottom > box.top &&
    control.top < box.bottom && control.left < box.right
  const padding = overlaps ? Math.max(12, box.right - control.left + 8) : 12
  header.style.setProperty('--eb-tabs-right', padding + 'px')
}

export function clipWorkspaceTabs(list: HTMLElement) {
  const box = list.getBoundingClientRect()
  for (const tab of list.querySelectorAll<HTMLElement>('.eb-tab')) {
    const bounds = tab.getBoundingClientRect()
    tab.dataset.clipped = String(bounds.left < box.left - 1 || bounds.right > box.right + 1)
    tab.dataset.compact = String(bounds.width < (tab.getAttribute('aria-selected') === 'true' ? 44 : 64))
  }
}

export function revealWorkspaceTab(list: HTMLElement) {
  const tab = list.querySelector<HTMLElement>('[aria-selected=true]')
  if (!tab) return
  const box = list.getBoundingClientRect(), bounds = tab.getBoundingClientRect()
  if (bounds.left < box.left) list.scrollLeft -= box.left - bounds.left
  else if (bounds.right > box.right) list.scrollLeft += bounds.right - box.right
  clipWorkspaceTabs(list)
}

const controls = 'body :is(.workspace-back-button, :is([data-scheduled-panel],[data-workspace-panel=integrations]) [data-odyssey-panel-entry=right])'
const styles = `
.workspace-app-topbar{display:flex;align-items:center;gap:8px;height:44px;flex:none;padding:0 12px}
.workspace-app-title{display:flex;align-items:center;gap:7px;height:32px;padding:0 2px;font-weight:500;flex:none;white-space:nowrap}
.workspace-app-title>i{display:inline-block;flex:none;width:18px;height:18px;background:currentColor;mask-position:center;mask-size:contain;mask-repeat:no-repeat}
.workspace-app-title,.workspace-app-title *{-webkit-app-region:drag;user-select:none;cursor:default}
@container(max-width:700px){.workspace-app-title{width:32px}.workspace-app-title>span{display:none}}
@container(max-width:480px){.workspace-app-topbar{gap:4px;padding-left:8px}.workspace-app-title{width:28px;padding:0 4px}}
.eb-workspace-controls{display:flex;align-items:center;gap:4px;flex:none;margin-left:-4px;-webkit-app-region:no-drag}
.workspace-app-topbar .eb-workspace-toggle{display:grid;place-items:center;width:32px;height:32px;padding:0;flex:none;color:var(--eb-muted,var(--knowledge-muted));-webkit-app-region:no-drag}
.workspace-app-topbar .eb-workspace-toggle[aria-expanded=true]{background:transparent}
.eb-workspace-toggle>i{width:17px;height:17px;background:currentColor;mask:url('${workspaceIcon.replaceAll("'", '%27')}') center/contain no-repeat;transition:transform 200ms cubic-bezier(.2,.8,.2,1)}
.eb-workspace-toggle[aria-expanded=true]>i{transform:rotate(180deg)}
.eb-workspace-tabs{display:flex;align-items:center;gap:4px;flex:0 0 clamp(188px,23cqw,232px);width:clamp(188px,23cqw,232px);min-width:0;overflow:hidden;-webkit-app-region:no-drag}
.workspace-app-topbar .eb-workspace-tabs button{flex:1 1 0;min-width:0;height:32px;padding:0 6px;font-size:14px;line-height:22px;white-space:nowrap}
@container(max-width:480px){.eb-workspace-tabs{flex-basis:128px;width:128px;gap:2px}.workspace-app-topbar .eb-workspace-tabs button{padding:0 2px;font-size:13px}}
.eb-workspace-tabs[aria-hidden=true]{width:0;flex-basis:0;opacity:0;pointer-events:none}
.eb-app-divider{width:1px;height:16px;background:var(--eb-line);flex:none}.eb-tab-scroll{display:flex;gap:8px;min-width:0;overflow:auto;scrollbar-width:none}.eb-tab{height:32px;width:auto;min-width:80px;display:flex;align-items:center;gap:8px;padding:0 10px!important;color:var(--eb-muted)!important;font-size:13px!important}.eb-tab[aria-selected=true]{background:var(--eb-field);color:var(--eb-ink)!important}.eb-tab[data-pinned=true]{width:42px;min-width:42px}.eb-tab .eb-icon{width:14px;height:14px}.eb-tab-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}.eb-tab-close{width:20px;height:20px;display:grid;place-items:center;border-radius:4px}.eb-tab-close:hover{background:var(--eb-line)}.eb-tab-close .eb-icon{width:17px;height:17px}
.eb-tab-scroll{position:relative;flex:1 1 0;max-width:var(--eb-tabs-max);overflow-x:auto;overflow-y:hidden}
.eb-tab{position:relative;flex:1 1 0;min-width:32px;max-width:240px;overflow:hidden;cursor:pointer;border-radius:7px;line-height:17px}
.eb-tabs[data-crowded=true] .eb-tab[aria-selected=true]:not([data-pinned=true]){flex-grow:1.6;min-width:min(112px,55%);padding-inline:8px!important}
.eb-tab[data-pinned=true]{flex:0 0 42px}
.eb-tabs[data-crowded=true] .eb-tab-scroll{gap:2px}
.eb-tabs[data-crowded=true] .eb-tab{padding-inline:min(10px,calc(40px / var(--eb-tab-count,1)))!important;gap:4px}
.eb-tab .eb-tab-close{padding:0;flex:none;color:var(--eb-muted)}
.eb-tab[data-clipped=true] .eb-tab-close{visibility:hidden;pointer-events:none}
.eb-tab[data-compact=true] .eb-tab-close{display:none}
.eb-tab-heading{display:flex;justify-content:space-between;padding:2px 10px;color:var(--eb-muted);font-size:12px}
.eb-tab-options{overflow:auto;min-height:0}
.eb-tab-option{width:100%;display:flex;align-items:center;gap:10px;padding:8px 10px!important;font-size:14px!important;font-weight:500;line-height:21px;text-align:left;border-radius:7px}
.eb-tab-option>span{flex:1;min-width:0;overflow-wrap:anywhere}
.eb-tab-option>.eb-icon{width:16px;height:16px;color:var(--eb-muted)}
.eb-tab-option>.eb-tab-site-icon{width:16px;height:16px;min-width:16px;flex:none}
.eb-tab[data-tab-dragging=true]{opacity:.5}.eb-tab[data-drop-edge]::after{content:"";position:absolute;top:4px;bottom:4px;width:2px;border-radius:1px;background:var(--eb-ink);pointer-events:none}.eb-tab[data-drop-edge=before]::after{left:0}.eb-tab[data-drop-edge=after]::after{right:0}
.eb-tab{user-select:none;touch-action:none;-webkit-user-drag:none}
.eb-tab{transition:background-color 120ms ease}
.eb-tab:not([aria-selected=true]):hover{background:color-mix(in srgb,var(--eb-field) 50%,transparent)}
.workspace-app-topbar.eb-tabs{padding-right:var(--eb-tabs-right,12px)}
.eb-root>.workspace-app-topbar.eb-tabs{-webkit-app-region:var(--eb-titlebar-region,drag);user-select:none}
.eb-root>.eb-tabs :is(.eb-app-label,.eb-app-label *){-webkit-app-region:var(--eb-titlebar-region,drag)}
/* Let the top bar receive outside clicks while a menu is open. */
.eb-root:has(>.eb-overlay-layer>*),
body:has(.odyssey-workspace-search,.st-menu[data-sidebar-more],[data-browser-page-context-menu],dialog[data-explore-menu][open]) .eb-root{--eb-titlebar-region:no-drag}
.workspace-app-topbar.eb-tabs .eb-tab-scroll,.workspace-app-topbar.eb-tabs button,.workspace-app-topbar.eb-tabs .eb-tab{-webkit-app-region:no-drag}
.workspace-app-topbar .eb-icon{display:inline-block;width:17px;height:17px;flex:none;background:currentColor;mask:var(--eb-icon) center/contain no-repeat;vertical-align:middle}
.workspace-app-topbar.eb-tabs>.eb-icon-button{display:grid;place-items:center;width:32px;height:32px;padding:0;flex:none;color:var(--eb-muted)!important}
.workspace-app-topbar.eb-tabs>.eb-tab-switcher{border-radius:8px;background:color-mix(in srgb,var(--eb-ink) 4%,transparent)}
@container(max-width:480px){
 .workspace-app-topbar.eb-tabs>.eb-icon-button{width:28px;height:28px}
 .eb-tabs[data-crowded=true] .eb-tab[aria-selected=true]:not([data-pinned=true]){min-width:32px}
}
@media(prefers-reduced-motion:reduce){.eb-workspace-toggle>i{transition:none}}
body :is(.st-root,.ig-root,.eb-root,.knowledge-workspace,.image-factory) .workspace-back-button{width:28px;min-width:28px;height:28px;display:grid;place-items:center;padding:6px!important;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,var(--eb-muted,#777));cursor:pointer;pointer-events:auto;-webkit-app-region:no-drag;transition:background-color .12s ease,color .12s ease}
body :is(.st-root,.ig-root) .workspace-back-button{position:absolute;top:17px;left:19px}
body :is(.st-root,.ig-root)[data-dark=true] .workspace-back-button{color:var(--dsw-alias-label-secondary,#aaa)}
.workspace-back-icon{display:block;width:16px;height:16px;background:currentColor;mask:url('${icons.back}') center/contain no-repeat}
${controls}:hover:not(:disabled):not([aria-busy=true]){background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 9%,transparent));color:var(--dsw-alias-label-primary,var(--ig-ink,var(--st-ink,var(--eb-ink,currentColor))))}
${controls}:active:not(:disabled):not([aria-busy=true]){background:var(--dsw-alias-interactive-bg-active,color-mix(in srgb,currentColor 16%,transparent))}
${controls}:focus-visible{outline:2px solid var(--ig-accent,var(--st-accent,#5aa8f4));outline-offset:2px}
${controls}:disabled,${controls}[aria-busy=true]{opacity:.4;cursor:default}
${controls}[aria-busy=true]{cursor:progress;pointer-events:none}
@media(prefers-reduced-motion:reduce){body .workspace-back-button{transition:none}}
`

export function mountWorkspaceTopbarStyles(document: Document): void {
  if (document.getElementById('sherlock-workspace-topbar-style')) return
  const style = document.createElement('style')
  style.id = 'sherlock-workspace-topbar-style'
  style.textContent = styles
  document.head.append(style)
}
