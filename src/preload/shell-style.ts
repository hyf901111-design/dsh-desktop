import figmaFinalStyles from './figma-final-shell.css?raw'
import figmaHomeStyles from './figma-home.css?raw'
import figmaPanelStyles from './figma-panels.css?raw'
import figmaFilePanelStyles from './figma-file-panel.css?raw'
import figmaTrajectoryStyles from './figma-trajectory.css?raw'
import figmaInlineStyles from './figma-inline-references.css?raw'
import figmaMotionStyles from './figma-motion.css?raw'
import figmaRefinementStyles from './figma-refinements.css?raw'
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
`

export function mountDesktopShellStyles(document: Document): void {
  if (document.getElementById(DESKTOP_SHELL_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = DESKTOP_SHELL_STYLE_ID
  style.textContent = desktopShellStyles + figmaFinalStyles + figmaHomeStyles + figmaPanelStyles + figmaFilePanelStyles + figmaTrajectoryStyles + figmaInlineStyles + figmaMotionStyles + figmaRefinementStyles
  document.documentElement.appendChild(style)
  document.getElementById('odyssey-figma-final-shell')?.remove()
}
