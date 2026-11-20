import { installWorkspaceViewOverflow } from './workspace-view-overflow'
import { workspaceContentViews } from '../shared/navigation-shortcuts'
import { navigationAppIcon } from './home-app-shortcuts'
import { icons } from './scheduled/icons'
import workspaceSettingsIcon from './browser/assets/settings.svg?inline'
import moreIcon from './browser/assets/more.svg?inline'
import chatIcon from './browser/assets/chat.svg?inline'
import workspaceIcon from './browser/assets/workspace.svg?inline'

const chatTitleIcon = 'url("' + chatIcon.replaceAll('"', '%22') + '")'

/** Workspace surfaces share the scheduled-page back control. */
export function workspaceBackButton(className = '', action: 'back' | 'exit' = 'back'): string {
  const classes = className.split(/\s+/).filter(value => /^[a-zA-Z0-9_-]+$/.test(value)).join(' ')
  return `<button type="button" class="workspace-back-button t8lSSG_toggleButton ${classes}" data-action="${action}" aria-label="返回工作区" title="返回工作区"><i class="workspace-back-icon" aria-hidden="true"></i></button>`
}

export function workspaceAppHeading(app: 'scheduled' | 'plugin') {
  const title = app === 'scheduled' ? '定时任务' : '插件'
  return `<h1 class="workspace-app-title workspace-app-heading" data-workspace-app="${app}"><i aria-hidden="true"></i><span>${title}</span></h1>`
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
const workspaceDotSelectors = (['chat', ...workspaceContentViews]).map(view =>
  `html[data-workspace-view-content~="${view}"] :is(.eb-workspace-tabs,.workspace-view-overflow-menu) button[data-workspace-native-view="${view}"]:not([aria-current=true])::after`
).join(',')
const sessionHeader = '[data-srb-session-header]:not([data-odyssey-subagent-panel] *)'
const resident = '.pI_x6G_centerCol .wSkVaW_root'
const workspaceSessionHeader = `${resident}[data-odyssey-page] ${sessionHeader}`
const styles = `
body{
  --odyssey-app-title-inset:14px;
  --odyssey-app-title-icon-size:17px;
  --odyssey-app-title-gap:7px;
  --odyssey-app-title-font:500 14px/20px var(--odyssey-font-ui,system-ui);
}
.workspace-app-topbar{display:flex;flex-wrap:nowrap;align-items:center;gap:8px;height:var(--odyssey-workspace-header-height,44px);flex:none;padding:0 12px 0 var(--odyssey-app-title-inset);user-select:none}
.workspace-app-title{display:flex;align-items:center;gap:var(--odyssey-app-title-gap);height:32px;margin:0;font:var(--odyssey-app-title-font);flex:none;white-space:nowrap}
.workspace-app-title>i{display:inline-block;flex:none;width:var(--odyssey-app-title-icon-size);height:var(--odyssey-app-title-icon-size);background:currentColor;mask-position:center;mask-size:contain;mask-repeat:no-repeat}
.workspace-app-title,.workspace-app-title *{-webkit-app-region:drag;user-select:none;cursor:default}
@container(max-width:480px){html:not([data-navigation-sidebar-only]) .workspace-app-title:not(.workspace-app-heading)>span{display:none}}
@container(max-width:480px){.workspace-app-topbar{gap:4px}}
.workspace-home-topbar{
  position:absolute;inset:0 48px auto 0;width:auto;min-width:0;z-index:10;
  -webkit-app-region:var(--odyssey-popup-window-drag,drag);
}
.workspace-home-topbar .eb-workspace-controls,.workspace-home-topbar .eb-workspace-tabs{-webkit-app-region:var(--odyssey-popup-window-drag,drag)}
.workspace-home-topbar .eb-workspace-controls button{-webkit-app-region:no-drag}
.workspace-home-topbar .workspace-app-title{flex:0 1 auto;min-width:24px}
.workspace-home-topbar .workspace-app-title>span{overflow:hidden;text-overflow:ellipsis}
.workspace-home-topbar .workspace-app-title>i{mask-image:${chatTitleIcon}}
.workspace-app-heading[data-workspace-app=scheduled]>i{mask-image:${navigationAppIcon('scheduled')}}
.workspace-app-heading[data-workspace-app=plugin]>i{mask-image:${navigationAppIcon('plugin')};mask-size:16px}
${workspaceSessionHeader}{--workspace-title-icon:${chatTitleIcon}}
${resident}[data-odyssey-page="research"] ${sessionHeader}{--workspace-title-icon:${navigationAppIcon('research')};--workspace-title-art-size:auto 14px}
${resident}[data-odyssey-page="spreadsheet"] ${sessionHeader}{--workspace-title-icon:${navigationAppIcon('spreadsheet')};--workspace-title-art-size:14px auto}
${workspaceSessionHeader}:has([data-conversation-view-id=notes][aria-selected=true]),
body[data-workspace-surface=notes] ${workspaceSessionHeader}{--workspace-title-icon:${navigationAppIcon('note')};--workspace-title-art-size:auto 14px}
${workspaceSessionHeader} .wSkVaW_crumbs{display:flex;align-items:center;gap:var(--odyssey-app-title-gap)}
${workspaceSessionHeader} .wSkVaW_crumb{display:block}
body ${workspaceSessionHeader}:has([data-session-workspace-controls]) .wSkVaW_crumbs{
  flex:0 1 auto;
  /* Reserve room for long titles without adding space after a short title. */
  min-width:calc-size(max-content,min(size,68px,25%));
}
${workspaceSessionHeader} .wSkVaW_crumbs::before{
  content:"";display:block;width:var(--odyssey-app-title-icon-size);height:var(--odyssey-app-title-icon-size);flex:none;
  background:currentColor;mask:var(--workspace-title-icon) center/var(--workspace-title-art-size,contain) no-repeat;
}
.eb-workspace-controls{--workspace-switch-duration:340ms;--workspace-switch-ease:cubic-bezier(.22,.61,.36,1);display:flex;align-items:center;gap:4px;flex:0 1 auto;min-width:32px;margin-left:-4px;-webkit-app-region:no-drag}
:is(.workspace-app-topbar,[data-srb-session-header]) .eb-workspace-toggle{display:grid;place-items:center;width:32px;height:32px;padding:0;flex:none;color:var(--eb-muted,var(--knowledge-muted));-webkit-app-region:no-drag}
:is(.workspace-app-topbar,[data-srb-session-header]) .eb-workspace-toggle[aria-expanded=true]{background:transparent}
.eb-workspace-toggle>i{width:17px;height:17px;background:currentColor;mask:url('${workspaceIcon.replaceAll("'", '%27')}') center/contain no-repeat;transition:transform var(--workspace-switch-duration) var(--workspace-switch-ease)}
.eb-workspace-toggle[aria-expanded=true]>i{transform:rotate(180deg)}
.eb-workspace-tabs{
  display:flex;align-items:center;gap:4px;flex:0 1 auto;
  min-width:0;width:var(--workspace-view-width,max-content);
  interpolate-size:allow-keywords;overflow:hidden;-webkit-app-region:no-drag;
  transition:width var(--workspace-switch-duration) var(--workspace-switch-ease),opacity var(--workspace-switch-duration) var(--workspace-switch-ease);
}
.eb-workspace-tab-list,.workspace-view-slots{
  display:flex;align-items:center;flex:0 1 auto;min-width:0;gap:inherit;
  overflow-x:auto;overflow-y:hidden;scrollbar-width:none;
}
.eb-workspace-tabs[data-customizing]>.eb-workspace-tab-list{display:none}
.eb-workspace-tabs[data-customizing]{width:max-content;transition:none}
.eb-workspace-tabs[data-workspace-measuring]{transition:none}
.eb-workspace-tabs[aria-hidden=false]{min-width:28px}
.eb-workspace-tabs:has(>.eb-workspace-overflow:not([hidden]))[aria-hidden=false]{min-width:calc(56px + var(--workspace-menu-gap,4px))}
@container(max-width:480px){.eb-workspace-tabs{--workspace-menu-gap:2px}}
.eb-workspace-tab-list{position:relative;flex:none;overflow:hidden}
.eb-workspace-tab-list:not(:has(>button:not([data-workspace-overflowed]))){position:absolute}
body button.eb-workspace-overflow{position:relative;flex:none;display:grid;place-items:center;box-sizing:border-box;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#888);cursor:pointer;-webkit-app-region:no-drag}
body .eb-workspace-overflow:is(:hover,:focus-visible,[aria-expanded=true]){background:var(--dsw-alias-interactive-bg-hover,#8882);color:var(--dsw-alias-label-primary,currentColor)}
.eb-workspace-overflow>i{width:16px;height:16px;background:currentColor;mask:url('${moreIcon.replaceAll("'", '%27')}') center/contain no-repeat;pointer-events:none}
.eb-workspace-overflow[data-has-content]::after{content:'';position:absolute;inset:4px 3px auto auto;width:5px;height:5px;border-radius:50%;background:#168bff}
body .eb-workspace-overflow[hidden],.eb-workspace-tabs[data-customizing]>.eb-workspace-overflow{display:none}
.workspace-view-overflow-menu{position:fixed;inset:0 auto auto 0;margin:0;z-index:2147483000;box-sizing:border-box;min-width:128px;max-width:calc(100vw - 16px);padding:4px;border:1px solid var(--dsw-alias-border-l2,#8884);border-radius:8px;background:var(--workspace-editor-surface);color:var(--dsw-alias-label-primary,var(--odyssey-text,#252525));box-shadow:0 8px 22px #0003;-webkit-app-region:no-drag}
.workspace-view-overflow-menu>button{position:relative;display:block;width:100%;min-height:30px;padding:0 18px 0 9px;border:0;border-radius:5px;background:transparent;color:inherit;text-align:left;font:13px/20px var(--odyssey-font-ui,system-ui);white-space:nowrap;cursor:pointer}
.workspace-view-overflow-menu>button:is(:hover,:focus-visible,[aria-current=true]):not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#8882)}
.workspace-view-overflow-menu>button:disabled{opacity:.45;cursor:default}


:is(.workspace-app-topbar,[data-srb-session-header]) .eb-workspace-tabs button[data-workspace-native-view]{
  position:relative;flex:0 0 auto;height:28px;padding:0 8px;font-size:14px;line-height:20px;white-space:nowrap;
}
:is(.workspace-app-topbar,[data-srb-session-header]) .eb-workspace-tabs button[data-workspace-overflowed]{
  position:absolute;visibility:hidden;pointer-events:none;
}
${workspaceDotSelectors}{content:"";position:absolute;inset:4px 3px auto auto;width:5px;height:5px;border-radius:50%;background:#168bff;pointer-events:none}
@container(max-width:480px){
 .eb-workspace-tabs{gap:2px}
 :is(.workspace-app-topbar,[data-srb-session-header]) .eb-workspace-tabs button[data-workspace-native-view]{padding:0 6px;font-size:13px}
}
[data-session-workspace-controls]{order:2}

:is(.workspace-app-topbar,[data-srb-session-header]) .eb-workspace-controls :is(.eb-workspace-toggle,.eb-workspace-edit,[data-workspace-native-view]){
  border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,var(--odyssey-muted,#888));
  cursor:pointer;-webkit-app-region:no-drag
}
:is(.workspace-app-topbar,[data-srb-session-header]) .eb-workspace-controls :is(.eb-workspace-toggle,.eb-workspace-edit,[data-workspace-native-view]):not(:disabled,[aria-expanded=true]):is(:hover,:focus-visible,[aria-current=true],[aria-pressed=true]){
  color:var(--dsw-alias-label-primary,var(--odyssey-text,currentColor));background:var(--odyssey-menu-row,color-mix(in srgb,currentColor 9%,transparent))
}
:is(.workspace-app-topbar,[data-srb-session-header]) .eb-workspace-tabs button:disabled{opacity:.4;cursor:default}
.eb-workspace-tabs[aria-hidden=true]{width:0;opacity:0;pointer-events:none}
html[data-workspace-tabs-switching] :is(.eb-workspace-tabs,.eb-workspace-toggle>i){transition:none}
body .eb-workspace-edit{display:grid;place-items:center;flex:none;width:28px;height:28px;padding:0!important;-webkit-app-region:no-drag}
.eb-workspace-edit>i{width:16px;height:16px;background:currentColor;mask:url('${workspaceSettingsIcon.replaceAll("'", '%27')}') center/contain no-repeat}
body:has(>.workspace-view-settings[open]) :is(.wSkVaW_header,.wSkVaW_titleRow,.workspace-app-topbar,.workspace-app-title,.workspace-app-title *){
  -webkit-app-region:no-drag;
}
.workspace-view-settings{
  position:fixed;inset:0 auto auto 0;z-index:2147483000;margin:0;border:0;padding:0;
  width:max-content;max-width:calc(100vw - 16px);
  color:var(--odyssey-text,#252525);background:transparent;
  font:14px/20px var(--odyssey-font-ui,system-ui);-webkit-app-region:no-drag;user-select:none;
}
body{--workspace-editor-surface:#fff}
:is(body[data-ds-dark-theme],html[data-theme=dark] body,html.dark body){--workspace-editor-surface:#262626}
.workspace-view-slots{
  gap:6px;padding:7px 8px 7px 0;
  color:var(--odyssey-text,#252525);font:14px/20px var(--odyssey-font-ui,system-ui);user-select:none;
}
.workspace-view-fixed{flex:none;padding-inline:8px;white-space:nowrap}
.workspace-view-palette{
  display:flex;align-items:center;gap:6px;padding:4px 6px;
  overflow-x:auto;scrollbar-width:none;
  background:var(--workspace-editor-surface);border-radius:8px;
}
.workspace-view-palette>button[hidden]{display:none}
.workspace-view-palette>button{flex:none;min-width:48px}
@container(max-width:480px){
  .workspace-view-slots{gap:4px}
  .workspace-view-fixed{padding-inline:6px}
  .workspace-view-slots .workspace-view-slot{flex-basis:46px}
}

:is(.workspace-view-slots,.workspace-view-palette) button:not([data-navigation-delete],[hidden]){
  display:grid;place-items:center;padding:0;border:0;border-radius:7px;background:transparent;
  color:inherit;line-height:1;-webkit-app-region:no-drag;
}
:is(.workspace-view-slots,.workspace-view-palette) button:not([data-navigation-delete],[hidden]):is(:hover,[aria-pressed=true]){background:var(--odyssey-menu-row,#8882)}
:is(.workspace-view-slots,.workspace-view-palette) button:focus-visible{outline:2px solid var(--odyssey-focus,#4a80fa);outline-offset:-2px}
.workspace-view-slot{
  position:relative;flex:0 0 56px;min-width:0;height:28px;border-radius:7px;background:var(--navigation-slot-fill);
}
.workspace-view-slot::after{
  content:"";position:absolute;inset:0;border:1px dashed var(--navigation-slot-border);
  border-radius:inherit;pointer-events:none;
}
.workspace-view-slot[data-drop-target]{background:var(--navigation-slot-target)}
.workspace-view-slot[data-drop-target]::after{border-color:currentColor}
.workspace-view-slot>button:first-child,.workspace-view-palette>button{
  height:28px;font:inherit;line-height:20px;white-space:nowrap;cursor:grab;
}
.workspace-view-slot>button:first-child{width:100%;min-width:0}
.workspace-view-palette>button:not([hidden]){padding-inline:8px}
:is(.workspace-view-slot,.workspace-view-palette)>button>span{
  max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.workspace-view-slot[data-empty]>button{cursor:pointer}
.workspace-view-slot[data-empty]>button::before,
.workspace-view-slot[data-empty]>button::after{content:none}
.workspace-view-slot>button[data-workspace-editor-app]{translate:var(--workspace-slot-shift,0px) 0;transition:translate 180ms ease,opacity 140ms ease}
.eb-workspace-tabs[data-dragging] .workspace-view-slot>button{pointer-events:none}
.eb-workspace-tabs[data-dragging] .workspace-view-remove{visibility:hidden}
.workspace-view-slot[data-slot-source]>button[data-workspace-editor-app]{opacity:0}
.workspace-view-slot[data-slot-evicted]>button[data-workspace-editor-app]{opacity:.2}

.eb-workspace-tabs[data-picking] .workspace-view-slot>button:first-child{cursor:copy}
:is(.workspace-view-slots,.workspace-view-palette) [data-workspace-editor-app]{touch-action:none}
.workspace-view-palette>button[data-workspace-editor-source]{opacity:.35}
.workspace-view-drag-ghost{
  position:fixed;inset:0 auto auto 0;z-index:2;display:grid;place-items:center;height:28px;
  border-radius:7px;background:var(--workspace-editor-surface);box-shadow:0 3px 10px #0003;pointer-events:none;
}
.workspace-view-palette>button>span{animation:workspace-view-label-wiggle 240ms ease-in-out alternate infinite}
.workspace-view-palette>button:nth-child(even)>span{animation-direction:alternate-reverse}
.workspace-view-palette>button:nth-child(3n)>span{animation-delay:-80ms}
@keyframes workspace-view-label-wiggle{from{transform:rotate(-2deg)}to{transform:rotate(2deg)}}
.workspace-view-slot .workspace-view-remove{
  position:absolute;top:-7px;right:-8px;z-index:1;
}
.workspace-view-settings-status{margin:6px 0 0;padding:4px 8px;border-radius:6px;background:var(--odyssey-menu,#fff)}
.workspace-view-settings-status:empty{display:none}
@media(prefers-reduced-motion:reduce){
  .workspace-view-palette>button>span{animation:none}
  .workspace-view-slot>button[data-workspace-editor-app]{transition:none}
}
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
.workspace-app-topbar .workspace-app-title>.eb-icon{width:var(--odyssey-app-title-icon-size);height:var(--odyssey-app-title-icon-size)}
.workspace-app-topbar.eb-tabs>.eb-icon-button{display:grid;place-items:center;width:32px;height:32px;padding:0;flex:none;color:var(--eb-muted)!important}
.workspace-app-topbar.eb-tabs>.eb-tab-switcher{border-radius:8px;background:color-mix(in srgb,var(--eb-ink) 4%,transparent)}
@container(max-width:480px){
 .workspace-app-topbar.eb-tabs>.eb-icon-button{width:28px;height:28px}
 .eb-tabs[data-crowded=true] .eb-tab[aria-selected=true]:not([data-pinned=true]){min-width:32px}
}
@media(prefers-reduced-motion:reduce){.eb-workspace-toggle>i,.eb-workspace-tabs{transition:none}}
body :is(.st-root,.ig-root,.eb-root,.knowledge-workspace,.image-factory) .workspace-back-button{width:28px;min-width:28px;height:28px;display:grid;place-items:center;padding:6px!important;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,var(--eb-muted,#777));cursor:pointer;pointer-events:auto;-webkit-app-region:no-drag;transition:background-color .12s ease,color .12s ease}
body :is(.st-chrome,.ig-chrome) .workspace-back-button{position:static;flex:none}
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
  installWorkspaceViewOverflow(document)
}
