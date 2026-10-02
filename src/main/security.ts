import { shell, type BrowserWindow, type WebFrameMain } from 'electron'
import { canGrantWindowPermission, isTrustedAppUrl } from './security-policy'

export function secureWindow(
  window: BrowserWindow,
  options: { allowsResearchFrameUrl?(url: string): boolean; ownsResearchFrame?(frame: WebFrameMain | null | undefined): boolean; researchFrameUrl?(frame: WebFrameMain | null | undefined): string | null } = {}
): void {
  window.webContents.setWindowOpenHandler(({ url, referrer }) => {
    const sources = referrer?.url ? window.webContents.mainFrame.framesInSubtree?.filter(frame => (
      frame.url === referrer.url && options.ownsResearchFrame?.(frame)
    )) ?? [] : []
    if (sources.length) {
      const browserVideo = sources.length === 1 ? youtubeSignInVideo(url, options.researchFrameUrl?.(sources[0])) : null
      if (browserVideo) { void shell.openExternal(browserVideo); return { action: 'deny' } }
      if (sources.length === 1 && isExternalUrl(url) && !isTrustedAppUrl(url)) {
        void sources[0]!.executeJavaScript(`location.assign(${JSON.stringify(url)})`).catch(() => undefined)
      }
      return { action: 'deny' }
    }
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
    if (options.ownsResearchFrame?.(event.frame)) {
      const browserVideo = youtubeSignInVideo(event.url, options.researchFrameUrl?.(event.frame))
      if (browserVideo) { event.preventDefault(); void shell.openExternal(browserVideo); return }
      if (isExternalUrl(event.url) && !isTrustedAppUrl(event.url)) return
      event.preventDefault()
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

  window.webContents.on('frame-created', (_event, { frame }) => {
    if (!frame) return
    frame.on('dom-ready', () => {
      if (!options.ownsResearchFrame?.(frame) || !isExternalUrl(frame.url) || isTrustedAppUrl(frame.url)) return
      void frame.executeJavaScript(RESEARCH_IN_FRAME_NAVIGATION).catch(() => undefined)
    })
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

// Google sign-in cannot run inside the sandboxed official player. Keep the
// player mounted and hand off the same video/time to the system browser.
function youtubeSignInVideo(target: string, authorized: string | null | undefined): string | null {
  try {
    const login = new URL(target), embed = new URL(authorized ?? '')
    if (login.protocol !== 'https:' || login.hostname !== 'accounts.google.com' || login.username || login.password ||
      embed.protocol !== 'https:' || !['www.youtube.com','youtube.com'].includes(embed.hostname) || embed.username || embed.password) return null
    const id = /^\/embed\/([A-Za-z0-9_-]{11})$/.exec(embed.pathname)?.[1]
    if (!id) return null
    const video = new URL('https://www.youtube.com/watch'); video.searchParams.set('v', id)
    const start = embed.searchParams.get('start')
    if (start && /^\d+$/.test(start)) video.searchParams.set('t', start + 's')
    return video.href
  } catch { return null }
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

const RESEARCH_IN_FRAME_NAVIGATION = `(() => {
  if (window.__sherlockInlineNavigation) return;
  window.__sherlockInlineNavigation = true;
  const navigate = value => { try { const url = new URL(String(value), location.href); if (!['http:', 'https:'].includes(url.protocol)) return; location.assign(url.href); } catch {} };
  document.addEventListener('click', event => {
    const link = event.target?.closest?.('a[href]');
    if (!link || event.button !== 0) return;
    if (link.target && link.target !== '_self' || event.ctrlKey || event.metaKey || event.shiftKey) { event.preventDefault(); event.stopImmediatePropagation(); navigate(link.href); }
  }, true);
  document.addEventListener('submit', event => { if(event.target?.tagName === 'FORM') event.target.target = '_self'; }, true);
  window.open = value => { if(value)navigate(value); return window; };
})()`
