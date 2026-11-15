import { icons } from './scheduled/icons'
import workspaceIcon from './browser/assets/workspace.svg?inline'

/** Workspace surfaces share the scheduled-page back control. */
export function workspaceBackButton(className = '', action: 'back' | 'exit' = 'back'): string {
  const classes = className.split(/\s+/).filter(value => /^[a-zA-Z0-9_-]+$/.test(value)).join(' ')
  return `<button type="button" class="workspace-back-button t8lSSG_toggleButton ${classes}" data-action="${action}" aria-label="返回工作区" title="返回工作区"><i class="workspace-back-icon" aria-hidden="true"></i></button>`
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
@media(prefers-reduced-motion:reduce){.eb-workspace-toggle>i{transition:none}}
body :is(.st-root,.ig-root,.eb-root,.knowledge-workspace) .workspace-back-button{width:28px;min-width:28px;height:28px;display:grid;place-items:center;padding:6px!important;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,var(--eb-muted,#777));cursor:pointer;pointer-events:auto;-webkit-app-region:no-drag;transition:background-color .12s ease,color .12s ease}
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
