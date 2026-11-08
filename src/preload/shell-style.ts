import figmaReadingStyles from './figma-reading.css?raw'
import figmaFinalStyles from './figma-final-shell.css?raw'
import figmaHomeStyles from './figma-home.css?raw'
import figmaWelcomeStyles from './figma-welcome.css?raw'
import figmaPanelStyles from './figma-panels.css?raw'
import figmaFilePanelStyles from './figma-file-panel.css?raw'
import figmaTrajectoryStyles from './figma-trajectory.css?raw'
import figmaInlineStyles from './figma-inline-references.css?raw'
import figmaMotionStyles from './figma-motion.css?raw'
import figmaRefinementStyles from './figma-refinements.css?raw'
import focusStyles from './focus-style.css?raw'
import clientTypography from './client-typography.css?raw'
import workbenchProgressStyles from './workbench-progress.css?raw'
import themePalette from '@deepseek-ai/dsh-client-ui-theme/styles/design-platform.css?raw'
import syntaxPalette from '@deepseek-ai/dsh-client-ui-theme/styles/shiki.css?raw'
import {userMessageThemeCss} from '../../scripts/lib/user-message-theme.mjs'
const DESKTOP_SHELL_STYLE_ID = 'sherlock-desktop-shell-style'

const desktopShellStyles = `
  .ydkMvW_header {
    padding-right: 88px;
    min-height: 54px;
    box-sizing: border-box;
    justify-content: flex-start;
  }
  .ydkMvW_title { min-width: 0; flex: 1; }
  .ydkMvW_close { order: -1; }
  /* Native Modal icon buttons must not inherit workbench form padding. */
  body ._dialog_15u5s_22 ._close_15u5s_61 { padding: 0; }
  body ._dialog_15u5s_22 ._close_15u5s_61 > svg { display: block; width: 14px; height: 14px; flex: none; }
  /* Keep the original-image grid button clear of global form-button padding. */
  body ._close_18d3q_30 { padding: 0; }
  body ._close_18d3q_30 > svg { display: block; width: 16px; height: 16px; margin: 0; }
`

export function mountDesktopShellStyles(document: Document): void {
  // The packaged startup page owns its media-query theme before Harness loads.
  // Shell body overrides otherwise put a white logo on a light background.
  if (document.documentElement.hasAttribute('data-ework-splash')) return
  if (document.getElementById(DESKTOP_SHELL_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = DESKTOP_SHELL_STYLE_ID
  style.textContent = desktopShellStyles + figmaFinalStyles + figmaHomeStyles + figmaPanelStyles + figmaFilePanelStyles + figmaTrajectoryStyles + figmaInlineStyles + figmaMotionStyles + figmaRefinementStyles + figmaReadingStyles + figmaWelcomeStyles + focusStyles + userMessageThemeCss(themePalette,syntaxPalette,figmaFinalStyles) + clientTypography + workbenchProgressStyles
  document.documentElement.appendChild(style)
  document.getElementById('odyssey-figma-final-shell')?.remove()
  // Native draggable regions need a real element. Keep it inside the current
  // React sidebar so its width follows the panel and remounts stay draggable.
  const ensureDragStrip = () => {
    if (!document.getElementById('dsh-desktop-drag-region')) return
    const sidebar = document.querySelector('.hHd-Xa_root')
    if (!sidebar || sidebar.querySelector(':scope > .dsh-sidebar-drag-region')) return
    const strip = document.createElement('div')
    strip.className = 'dsh-sidebar-drag-region'
    strip.setAttribute('aria-hidden', 'true')
    sidebar.appendChild(strip)
  }
  ensureDragStrip()
  const Observer = document.defaultView?.MutationObserver
  if (Observer) new Observer(ensureDragStrip).observe(document.documentElement, { childList: true, subtree: true })
}
