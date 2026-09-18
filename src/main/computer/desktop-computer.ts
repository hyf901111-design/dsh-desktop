import { app, BrowserWindow, dialog, globalShortcut, screen, shell, systemPreferences } from 'electron'
import { join } from 'node:path'
import { ComputerController, type ComputerDriver } from './controller'
import type { CuaDriverLike, EmbeddedCuaDriverHostLike } from '@trycua/cua-driver'

export function createDesktopComputer(getMainWindow: () => BrowserWindow | null | undefined) {
  let driver: CuaDriverLike | undefined
  let host: EmbeddedCuaDriverHostLike | undefined
  let starting: Promise<ComputerDriver> | undefined
  let disposed = false
  let visible = false
  let pointer: BrowserWindow | undefined, controls: BrowserWindow | undefined
  let pointerTimer: ReturnType<typeof setInterval> | undefined
  let fadeTimer: ReturnType<typeof setTimeout> | undefined
  const shortcut = 'CommandOrControl+Shift+Escape'
  const stop = () => { void controller.stop().catch(error => console.warn('[computer] stop failed', error)) }
  function overlay(html: string, width: number, height: number, mouse: boolean) {
    const window = new BrowserWindow({ width, height, show: false, frame: false, transparent: true, resizable: false, movable: false, focusable: false, skipTaskbar: true, hasShadow: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } })
    window.setAlwaysOnTop(true, 'screen-saver')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    window.setContentProtection(true)
    window.setIgnoreMouseEvents(!mouse)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => { event.preventDefault(); if (mouse) stop() })
    void window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';"><style>html,body{margin:0;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;color:white}body{transition:opacity .28s}</style>${html}`))
    return window
  }
  function ensureOverlays() {
    if (!pointer || pointer.isDestroyed()) pointer = overlay(`<div style="display:flex;align-items:flex-start;gap:3px;padding:1px"><svg width="18" height="19" viewBox="0 0 20 22" style="filter:drop-shadow(0 1px 2px #0006)"><path d="M3 2.5L16.7 8.7Q17.5 9.1 16.6 9.5L10.8 11.5L8.4 17.8Q8 18.7 7.6 17.7Z" fill="rgba(135,135,135,.5)" stroke="white" stroke-width="1.4" stroke-linejoin="round"/></svg><span style="display:inline-flex;align-items:center;justify-content:center;height:20px;padding:0 6px;border-radius:4px;background:#878787;color:white;font:400 11px/14px system-ui,-apple-system,sans-serif;white-space:nowrap"><span style="line-height:14px;transform:translateY(1px)">智能助理</span></span></div>`, 150, 26, false)
    if (!controls || controls.isDestroyed()) {
      controls = overlay(`<div style="height:34px;background:#292929ee;border:1px solid #777;border-radius:9px;display:flex;align-items:center;justify-content:center;gap:12px;font-size:12px"><span>智能助理正在操作桌面</span><a href="https://stop.invalid" style="color:white;text-decoration:none;background:#555;padding:4px 8px;border-radius:5px" title="⌘⇧Esc">停止</a></div>`, 246, 38, true)
      controls.webContents.once('did-finish-load', () => { if (!disposed && visible) controls?.showInactive() })
    }
  }
  function move(x: number, y: number) { if (pointer && !pointer.isDestroyed() && Number.isFinite(x) && Number.isFinite(y)) { pointer.setPosition(Math.round(x - 3), Math.round(y - 2), false); pointer.showInactive() } }
  const controller = new ComputerController({
    driver: async () => {
      if (disposed) throw Error('桌面控制服务已关闭。')
      if (driver) return driver
      if (starting) return starting
      starting = (async () => {
        if (process.platform !== 'darwin') throw Error('当前版本的桌面控制仅支持 macOS。')
        const sdk = await import('@trycua/cua-driver')
        const status = sdk.currentMacOsPermissionStatus()
        if (!status.accessibility || !status.screenRecording) {
          const window = getMainWindow()
          const options = { type: 'info' as const, title: '配置桌面控制', message: '桌面控制需要辅助功能和屏幕录制权限', detail: 'EWork 将读取任务应用的界面并执行鼠标、键盘操作。请在系统设置中为 EWork Odyssey 开启权限，随后重新启动客户端。你随时可以点击桌面上的“停止”或按 ⌘⇧Esc。', buttons: ['打开系统权限设置', '稍后'], defaultId: 0, cancelId: 1 }
          const answer = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options)
          if (answer.response === 0) {
            systemPreferences.isTrustedAccessibilityClient(true)
            const permissions = await import('@trycua/cua-driver/electron')
            permissions.requestMacOSPermissions()
            await shell.openExternal(status.accessibility ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture' : 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
          }
          throw Error('需要用户在系统设置→隐私与安全性中为 EWork Odyssey 开启辅助功能和屏幕录制，然后重新启动客户端；本次未执行桌面操作。')
        }
        const binaryPath = join(app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'build'), 'native', 'cua-driver')
        host = sdk.EmbeddedCuaDriverHost.withOptions({ binaryPath, hostBundleId: 'com.evanarts.sherlock', permissionMode: sdk.EmbeddedPermissionMode.Standard,
          approveCapabilityManifest: false, approveSessionPolicy: false, dangerouslyBypassApprovals: false, environment: [], inheritStderr: true, noOverlay: true, startupTimeoutMs: 15000n, shutdownTimeoutMs: 5000n })
        try {
          const connection = await host.start()
          if (disposed) throw Error('桌面控制已关闭。')
          driver = sdk.CuaDriver.connect(connection.socketPath)
          const bound = driver
          void host.waitForExit(connection.generation).then(() => { if (driver === bound) { driver = undefined; stop() } }).catch(() => {})
          return driver
        } catch (error) { await host.stop(); host = undefined; throw error }
      })().finally(() => { starting = undefined })
      return starting
    },
    pointer: data => {
      clearInterval(pointerTimer); pointerTimer = undefined
      if (!data) return
      ensureOverlays(); move(data.x, data.y)
      // Foreground drag emits real OS pointer events; track their measured position,
      // rather than animating an assumed start/end trajectory while a gesture runs.
      if (data.drag) pointerTimer = setInterval(() => { const p = screen.getCursorScreenPoint(); move(p.x, p.y) }, 16)
    },
    visibility: active => {
      visible = active
      clearTimeout(fadeTimer)
      if (active) {
        ensureOverlays()
        const area = screen.getPrimaryDisplay().workArea
        controls!.setPosition(area.x + area.width - 262, area.y + 8)
        controls!.showInactive()
        if (!pointer!.isVisible()) { const p = screen.getCursorScreenPoint(); move(p.x, p.y) }
        if (!globalShortcut.isRegistered(shortcut)) globalShortcut.register(shortcut, stop)
        void pointer!.webContents.executeJavaScript("document.body.style.opacity='1'").catch(() => {})
      } else {
        clearInterval(pointerTimer); pointerTimer = undefined
        globalShortcut.unregister(shortcut)
        controls?.hide()
        if (pointer && !pointer.isDestroyed()) {
          void pointer.webContents.executeJavaScript("document.body.style.opacity='0'").catch(() => {})
          fadeTimer = setTimeout(() => pointer?.hide(), 300)
        }
      }
    },
    screenPoint: (target, data, x, y) => {
      if (target.kind === 'desktop') { const b = screen.getPrimaryDisplay().bounds; return { x: b.x + x / data.scale_factor, y: b.y + y / data.scale_factor } }
      const b = data.window_bounds
      if (!b || !(data.screenshot_width > 0) || !(data.screenshot_height > 0)) throw Error('窗口坐标映射不可用，请重新观察。')
      return { x: b.x + x * b.width / data.screenshot_width, y: b.y + y * b.height / data.screenshot_height }
    }
  })
  return {
    run: (input: unknown, signal: AbortSignal) => controller.run(input, signal),
    dispose: async () => {
      await controller.stop().catch(() => {})
      disposed = true
      await starting?.catch(() => {})
      await host?.stop().catch(() => {})
      driver = undefined; host = undefined
      clearTimeout(fadeTimer); clearInterval(pointerTimer)
      globalShortcut.unregister(shortcut)
      pointer?.destroy(); controls?.destroy()
    }
  }
}
