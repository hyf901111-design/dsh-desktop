import { icons } from './scheduled/icons'

/** Workspace surfaces share the scheduled-page back control. */
export function workspaceBackButton(className = '', action: 'back' | 'exit' = 'back'): string {
  const classes = className.split(/\s+/).filter(value => /^[a-zA-Z0-9_-]+$/.test(value)).join(' ')
  return `<button type="button" class="workspace-back-button t8lSSG_toggleButton ${classes}" data-action="${action}" aria-label="返回工作区" title="返回工作区"><i class="workspace-back-icon" aria-hidden="true"></i></button>`
}

const controls = 'body :is(.workspace-back-button, :is([data-scheduled-panel],[data-workspace-panel=integrations]) [data-odyssey-panel-entry=right])'
const styles = `
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
