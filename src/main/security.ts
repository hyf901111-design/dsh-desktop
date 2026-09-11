import { shell, type BrowserWindow } from 'electron'
import { canGrantWindowPermission, isTrustedAppUrl } from './security-policy'

export function secureWindow(
  window: BrowserWindow,
  options: { allowsResearchFrameUrl?(url: string): boolean } = {}
): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedAppUrl(url)) return { action: 'allow' }
    if (isExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (isTrustedAppUrl(url)) return
    event.preventDefault()
    if (isExternalUrl(url)) void shell.openExternal(url)
  })

  window.webContents.on('will-frame-navigate', (event) => {
    // Offline generated documents cannot borrow another link's URL authorization.
    // CSP blocks subresources; this guard also blocks a frame's own navigation.
    if (/^about:srcdoc(?:[?#]|$)/i.test(event.frame?.url ?? '') || /^about:srcdoc(?:[?#]|$)/i.test(event.initiator?.url ?? '')) {
      event.preventDefault()
      return
    }
    if (event.isMainFrame) {
      const initiator = event.initiator
      const mainFrame = window.webContents.mainFrame
      if (
        !initiator ||
        initiator.processId !== mainFrame.processId ||
        initiator.routingId !== mainFrame.routingId
      ) {
        event.preventDefault()
      }
      return
    }
    if (isPreviewUrl(event.url)) return
    // Sidebar documents are direct child frames created by the trusted shell.
    // Keep this separate from document-initiated navigation: an embedded page
    // must not inherit the shell's access to local document routes.
    const mainFrame = window.webContents.mainFrame
    if (sameFrame(event.initiator, mainFrame) && sameFrame(event.frame?.parent, mainFrame) &&
      isSidebarPreviewUrl(event.url, mainFrame.url)) return
    try {
      if (options.allowsResearchFrameUrl?.(event.url) === true) return
    } catch {
      // Fail closed when the authorization registry cannot decide.
    }
    event.preventDefault()
  })

  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.webContents.session.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin, details) =>
      canGrantWindowPermission(
        permission,
        details.requestingUrl ?? requestingOrigin,
        details.isMainFrame
      )
  )
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      callback(
        canGrantWindowPermission(permission, details.requestingUrl, details.isMainFrame)
      )
    }
  )
}

function sameFrame(
  frame: { processId: number; routingId: number } | null | undefined,
  mainFrame: { processId: number; routingId: number }
): boolean {
  return !!frame && frame.processId === mainFrame.processId && frame.routingId === mainFrame.routingId
}

function isSidebarPreviewUrl(rawUrl: string, shellUrl: string): boolean {
  try {
    const shell = new URL(shellUrl)
    if (shell.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(shell.hostname)) return false
    const target = new URL(rawUrl)
    if (target.username || target.password || target.search || target.hash) return false
    // The route enforces session/workspace file access; its iframe remains
    // sandboxed without allow-same-origin, Node, or the application preload.
    return target.origin === shell.origin && /^\/sidebar\/html\/[^/]+\/.+/.test(target.pathname)
  } catch {
    return false
  }
}

function isPreviewUrl(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).protocol === 'sherlock-preview:'
  } catch {
    return false
  }
}

function isExternalUrl(rawUrl: string): boolean {
  try {
    const protocol = new URL(rawUrl).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
