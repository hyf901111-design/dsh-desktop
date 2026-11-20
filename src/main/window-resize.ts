import { ipcMain, screen, type BrowserWindow } from 'electron'
import { resizeWindowBounds, type ResizeEdge } from '../shared/window-resize'

/** Sample the physical pointer in the main process for window move and resize gestures. */
export function installWindowResize(window: BrowserWindow) {
  let timer: ReturnType<typeof setInterval> | undefined
  const stop = () => { if (timer) clearInterval(timer); timer = undefined }
  const channel = 'desktop-window:resize'
  const listener = (event: Electron.IpcMainEvent, edge: unknown) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return
    stop()
    if (typeof edge !== 'string' || !/^(move|n|s|e|w|ne|nw|se|sw)$/.test(edge) || window.isFullScreen()) return
    const origin = screen.getCursorScreenPoint(), bounds = window.getBounds()
    const [minWidth = 800, minHeight = 640] = window.getMinimumSize()
    let last = bounds
    timer = setInterval(() => {
      if (window.isDestroyed() || !window.isFocused()) { stop(); return }
      const point = screen.getCursorScreenPoint()
      const dx = point.x - origin.x, dy = point.y - origin.y
      const next = edge === 'move'
        ? { ...bounds, x: bounds.x + dx, y: bounds.y + dy }
        : resizeWindowBounds(bounds, edge as ResizeEdge, dx, dy, minWidth, minHeight)
      if (Object.keys(next).some(key => next[key as keyof typeof next] !== last[key as keyof typeof last])) {
        window.setBounds(next, false)
        last = next
      }
    }, 16)
  }
  ipcMain.on(channel, listener)
  window.on('blur', stop)
  window.webContents.on('did-start-navigation', stop)
  window.once('closed', () => { stop(); ipcMain.removeListener(channel, listener) })
}
