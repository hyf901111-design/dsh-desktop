// Research pages are read or shown inside the client. A remote page may start
// an attachment download on load; Chromium otherwise opens a native save dialog.
const guardedSessions = new WeakSet<object>()
const guardedErrorSessions = new WeakSet<object>()

export function guardResearchWebDownloads(browserSession: {
  on(event: 'will-download', listener: (event: { preventDefault(): void }) => void): void
}): void {
  if (guardedSessions.has(browserSession)) return
  browserSession.on('will-download', event => event.preventDefault())
  guardedSessions.add(browserSession)
}

// Some third-party endpoints reply with a downloadable error.txt instead of
// page content. The main window also hosts ordinary iframes on defaultSession.
export function guardUnexpectedErrorDownloads(browserSession: {
  on(event: 'will-download', listener: (event: { preventDefault(): void }, item: { getFilename(): string }) => void): void
}): void {
  if (guardedErrorSessions.has(browserSession)) return
  browserSession.on('will-download', (event, item) => {
    if (item.getFilename().toLowerCase() === 'error.txt') event.preventDefault()
  })
  guardedErrorSessions.add(browserSession)
}
