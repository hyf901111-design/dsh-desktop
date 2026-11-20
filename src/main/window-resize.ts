import { ipcMain, screen, type BrowserWindow } from 'electron'
import { resizeWindowBounds, type ResizeEdge } from '../shared/window-resize'

/** Move by the title bar pointer's screen coordinates. Sample the physical pointer for resizing. */
export function installWindowResize(window: BrowserWindow) {
  let timer: ReturnType<typeof setInterval> | undefined
  let moveOrigin: {x: number; y: number} | undefined
  const stop = () => { if (timer) clearInterval(timer); timer = undefined; moveOrigin = undefined }
  const channel = 'desktop-window:resize'
  const listener = (event: Electron.IpcMainEvent, gesture: unknown) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return
    if (gesture && typeof gesture === 'object' && 'dx' in gesture && 'dy' in gesture) {
      const {dx, dy} = gesture
      if (moveOrigin && !window.isFullScreen() &&
          typeof dx === 'number' && typeof dy === 'number' && Math.abs(dx) < 100_000 && Math.abs(dy) < 100_000) {
        window.setPosition(Math.round(moveOrigin.x + dx), Math.round(moveOrigin.y + dy), false)
      }
      return
    }
    stop()
    if (window.isFullScreen()) return
    if (gesture === 'move') { moveOrigin = window.getBounds(); return }
    if (typeof gesture !== 'string' || !/^(n|s|e|w|ne|nw|se|sw)$/.test(gesture)) return
    const origin = screen.getCursorScreenPoint(), bounds = window.getBounds()
    const [minWidth = 800, minHeight = 640] = window.getMinimumSize()
    let last = bounds
    timer = setInterval(() => {
      if (window.isDestroyed() || !window.isFocused()) { stop(); return }
      const point = screen.getCursorScreenPoint()
      const next = resizeWindowBounds(bounds, gesture as ResizeEdge, point.x - origin.x, point.y - origin.y, minWidth, minHeight)
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
