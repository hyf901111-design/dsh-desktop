import figmaFinalStyles from './figma-final-shell.css?raw'
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
  .t8lSSG_toggleCluster {
    top: calc(8px + env(safe-area-inset-top)) !important;
  }
`

export function mountDesktopShellStyles(document: Document): void {
  if (document.getElementById(DESKTOP_SHELL_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = DESKTOP_SHELL_STYLE_ID
  style.textContent = desktopShellStyles + figmaFinalStyles
  document.documentElement.appendChild(style)
}
