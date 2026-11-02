import { app, BrowserWindow, dialog, globalShortcut, nativeImage, powerMonitor, screen, shell, systemPreferences } from 'electron'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { ComputerController, sameObservedElements, type ComputerDriver } from './controller'
import { compactWindowElements } from './observation'
import { cursorOverlayPositions, cursorTravelDuration, cursorTravelPoint } from './overlay-layout'
import { createWindowCapture, type WindowCapture } from './capture-stream'
import { createBackgroundApplicationInspector, createBackgroundApplicationLauncher, type BackgroundLaunchBinding } from './background-launch'
import type { CuaDriverLike, EmbeddedCuaDriverHostLike } from '@trycua/cua-driver'

export function createDesktopComputer(getMainWindow: () => BrowserWindow | null | undefined) {
  let driver: CuaDriverLike | undefined
  let host: EmbeddedCuaDriverHostLike | undefined
  let starting: Promise<ComputerDriver> | undefined
  let disposed = false
  let pointer: BrowserWindow | undefined, pointerLabel: BrowserWindow | undefined
  let capture: WindowCapture | undefined
  let captureActive = false
  let captureWatch: ReturnType<typeof setInterval> | undefined
  let lastHotspot = { x: 3, y: 3 }
  let pointerTimer: ReturnType<typeof setInterval> | undefined
  let shownPoint: { x: number; y: number } | undefined
  let pointerMotion: { timer: ReturnType<typeof setInterval>; target: { x: number; y: number }; promise: Promise<void>; resolve(): void } | undefined
  let fadeTimer: ReturnType<typeof setTimeout> | undefined
  let strokeDriver: { draw(args: unknown): Promise<void>; cancel(): void; position(): { x: number; y: number } | undefined } | undefined
  let launchDriver: BackgroundLaunchBinding | undefined
  const launchNative = () => {
    if (process.platform !== 'darwin') throw Error('后台启动仅支持 macOS。')
    launchDriver ??= createRequire(import.meta.url)(join(app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'build'), 'native', 'computer-launch.node'))
    return launchDriver!
  }
  const shortcut = 'CommandOrControl+Shift+Escape'
  const stop = () => { void controller.stop().catch(error => console.warn('[computer] stop failed', error)) }
  function overlay(html: string, width: number, height: number) {
    const window = new BrowserWindow({ width, height, show: false, frame: false, transparent: true, resizable: false, movable: false, focusable: false, skipTaskbar: true, hasShadow: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } })
    window.setAlwaysOnTop(true, 'floating')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    window.setContentProtection(true)
    window.setIgnoreMouseEvents(true)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => { event.preventDefault() })
    void window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';"><style>html,body{margin:0;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;color:white}body{transition:opacity .28s}</style>${html}`))
    return window
  }
  function ensureOverlays() {
    if (!pointer || pointer.isDestroyed()) pointer = overlay(`<style>@keyframes agent-sway{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}@media(prefers-reduced-motion:reduce){#arrow{animation:none!important}}</style><svg id="arrow" width="20" height="22" viewBox="0 0 20 22" style="position:absolute;left:0;top:0;transform-origin:3px 3px;animation:agent-sway 1800ms ease-in-out infinite;filter:drop-shadow(0 1px 2px #0006)"><path d="M3 3L16.7 9.2Q17.5 9.6 16.6 10L10.8 12L8.4 18.3Q8 19.2 7.6 18.2Z" fill="rgba(135,135,135,.5)" stroke="white" stroke-width="1.4" stroke-linejoin="round"/></svg>`, 22, 22)
    if (!pointerLabel || pointerLabel.isDestroyed()) pointerLabel = overlay(`<div style="height:20px;display:flex;align-items:center;justify-content:center;border-radius:4px;background:#878787;color:white;font:400 11px/14px system-ui,-apple-system,sans-serif">智能助理</div>`, 94, 22)
  }
  function move(x: number, y: number) {
    if (!pointer || pointer.isDestroyed() || !pointerLabel || pointerLabel.isDestroyed() || !Number.isFinite(x) || !Number.isFinite(y)) return
    const display = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) })
    const layout = cursorOverlayPositions({ x, y }, display.bounds)
    pointer.setPosition(layout.pointer.x, layout.pointer.y, false)
    pointerLabel.setPosition(layout.label.x, layout.label.y, false)
    if (layout.hotspot.x !== lastHotspot.x || layout.hotspot.y !== lastHotspot.y) {
      lastHotspot = layout.hotspot
      void pointer.webContents.executeJavaScript(`{const a=document.getElementById('arrow');if(a){a.style.left='${layout.hotspot.x - 3}px';a.style.top='${layout.hotspot.y - 3}px'}}`).catch(() => {})
    }
    pointer.showInactive(); pointerLabel.showInactive()
    shownPoint = { x, y }
  }
  function cancelPointerMotion() {
    if (!pointerMotion) return
    clearInterval(pointerMotion.timer)
    pointerMotion.resolve()
    pointerMotion = undefined
  }
  function moveAlongArc(target: { x: number; y: number }, signal?: AbortSignal): Promise<void> {
    if (pointerMotion?.target.x === target.x && pointerMotion.target.y === target.y) return pointerMotion.promise
    cancelPointerMotion()
    const from = shownPoint
    const duration = from ? cursorTravelDuration(from, target) : 0
    if (!from || duration === 0) { move(target.x, target.y); return Promise.resolve() }
    let resolve!: () => void
    const promise = new Promise<void>(done => { resolve = done })
    const started = Date.now()
    const finish = () => { if (pointerMotion?.promise === promise) pointerMotion = undefined; resolve() }
    const timer = setInterval(() => {
      if (signal?.aborted) { cancelPointerMotion(); return }
      const progress = Math.min(1, (Date.now() - started) / duration)
      const point = cursorTravelPoint(from, target, progress)
      move(point.x, point.y)
      if (progress >= 1) { clearInterval(timer); finish() }
    }, 16)
    pointerMotion = { timer, target, promise, resolve }
    return promise
  }
  const onLock = () => { stop() }
  powerMonitor.on('lock-screen', onLock)
  powerMonitor.on('suspend', onLock)
  const controller = new ComputerController({
    launchApplication: createBackgroundApplicationLauncher(launchNative),
    inspectApplication: createBackgroundApplicationInspector(launchNative),
    assertAvailable: () => {
      if (powerMonitor.getSystemIdleState(60) === 'locked') throw Error('Mac 已锁屏，桌面操作已暂停；请解锁后继续。')
      if (captureActive && capture?.state().stoppedBySystem) { stop(); throw Error('系统已停止共享，桌面控制已中止。') }
    },
    windowStream: true,
    stopCapture: async () => {
      clearInterval(captureWatch); captureWatch = undefined
      captureActive = false
      await capture?.stop()
    },
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
          const options = { type: 'info' as const, title: '配置桌面控制', message: '桌面控制需要辅助功能和屏幕录制权限', detail: 'EWork 将读取任务应用的界面并执行鼠标、键盘操作。请在系统设置中为 EWork Odyssey 开启权限，随后重新启动客户端。你随时可以按 ⌘⇧Esc 或点击对话中的停止按钮。', buttons: ['打开系统权限设置', '稍后'], defaultId: 0, cancelId: 1 }
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
    prepareObservation: async (result, target, freshAfterMs) => {
      if (target.kind === 'window' && (result.data.screenshot_frame_valid !== true || ![1, 2].includes(result.data.screenshot_scale)))
        throw Error('驱动未能验证目标窗口的原生截图坐标；未执行像素输入，请重新观察窗口。')
      const streamed = target.kind === 'window' ? await (async () => {
        capture ??= createWindowCapture()
        const frame = await capture.start(target.pid, target.window_id, freshAfterMs)
        captureActive = true
        if (!captureWatch) captureWatch = setInterval(() => { if (capture?.state().stoppedBySystem) stop() }, 300)
        return frame
      })() : undefined
      const image = streamed ? { mimeType: 'image/jpeg', dataBase64: streamed.data.toString('base64') } : result.screenshots[0]!
      const original = nativeImage.createFromBuffer(Buffer.from(image.dataBase64, 'base64'))
      if (original.isEmpty()) throw Error('桌面截图解码失败。')
      const size = original.getSize()
      const ratio = Math.min(1, 1600 / Math.max(size.width, size.height))
      const resized = ratio < 1 ? original.resize({ width: Math.round(size.width * ratio), height: Math.round(size.height * ratio), quality: 'best' }) : original
      const shown = resized.getSize()
      // The driver includes the same AX tree in structured and Markdown forms.
      // Keep actionable structured elements; duplicate legacy text wastes vision
      // context and lengthens every subsequent model response.
      const { tree_markdown: _tree, _note, background_input, ...view } = result.data
      return { data: { ...compactWindowElements(view), screenshot_mime_type: 'image/jpeg',
        ...(streamed ? { driver_screenshot_scale: result.data.screenshot_scale } : {}),
        ...(background_input ? { background_input: streamed ? { ...background_input, observation: { stream_capture: 'available' } } : background_input } : {}),
        ...(streamed ? { capture_source: 'ScreenCaptureKit SCStream', screenshot_frame_valid: true } : {}),
        ...(streamed ? { window_bounds: streamed.windowBounds } : {}),
        original_screenshot_width: streamed?.width ?? result.data.screenshot_width,
        original_screenshot_height: streamed?.height ?? result.data.screenshot_height, original_scale_factor: streamed && streamed.windowBounds.width > 0
          ? streamed.width / streamed.windowBounds.width : result.data.scale_factor,
        screenshot_width: shown.width, screenshot_height: shown.height,
        ...(streamed && streamed.windowBounds.width > 0 ? { scale_factor: shown.width / streamed.windowBounds.width }
          : result.data.scale_factor ? { scale_factor: result.data.scale_factor * shown.width / size.width } : {}) },
        screenshots: [{ mimeType: 'image/jpeg', dataBase64: streamed && ratio === 1 ? image.dataBase64 : resized.toJPEG(78).toString('base64') }] }
    },
    unchanged: (before, after, input) => {
      const a = before.data, b = after.data
      if (JSON.stringify(before.target) !== JSON.stringify(after.target) || JSON.stringify(a.window_bounds) !== JSON.stringify(b.window_bounds)
        || a.screenshot_width !== b.screenshot_width || a.screenshot_height !== b.screenshot_height || a.scale_factor !== b.scale_factor) return false
      // Explicitly addressed keyboard input only needs a stable field region.
      // Element tokens without coordinates still require a stable whole view.
      const fieldPoint = ['type', 'key', 'hotkey'].includes(input.op) && input.x !== undefined && input.y !== undefined && !input.element_token
      const points = input.op === 'stroke' ? input.strokes?.flat() : input.op === 'drag' ? [{ x: input.x, y: input.y }, { x: input.to_x, y: input.to_y }]
        : (input.op === 'click' && !input.element_token) || fieldPoint ? [{ x: input.x, y: input.y }] : undefined
      let rect = { x: 0, y: 0, width: a.screenshot_width, height: a.screenshot_height }
      if (points?.length) {
        if (points.some((p: any) => !Number.isFinite(p?.x) || !Number.isFinite(p?.y))) return false
        const marginX = fieldPoint ? 192 : input.op === 'click' ? 24 : 64
        const marginY = fieldPoint ? 96 : input.op === 'click' ? 24 : 64
        const x = Math.max(0, Math.floor(Math.min(...points.map((p: any) => p.x)) - marginX))
        const y = Math.max(0, Math.floor(Math.min(...points.map((p: any) => p.y)) - marginY))
        rect = { x, y, width: Math.min(a.screenshot_width, Math.ceil(Math.max(...points.map((p: any) => p.x)) + marginX)) - x,
          height: Math.min(a.screenshot_height, Math.ceil(Math.max(...points.map((p: any) => p.y)) + marginY)) - y }
      } else if (!sameObservedElements(a.elements, b.elements)) return false
      if (rect.width <= 0 || rect.height <= 0) return false
      const pixels = (observation: typeof before) => nativeImage.createFromBuffer(Buffer.from(observation.screenshots[0]!.dataBase64, 'base64')).crop(rect).toBitmap()
      return pixels(before).equals(pixels(after))
    },
    stroke: async (target, data, strokes, duration, signal, modifiers, click) => {
      if (!strokeDriver) strokeDriver = createRequire(import.meta.url)(join(app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'build'), 'native', 'computer-stroke.node'))
      const native = strokeDriver!
      const b = data.window_bounds
      if (!b || !(b.width > 0) || !(b.height > 0)) throw Error('缺少画笔目标窗口边界。')
      const cancel = () => native.cancel()
      signal.throwIfAborted()
      signal.addEventListener('abort', cancel, { once: true })
      try {
        await native.draw({ pid: target.pid, window_id: target.window_id, frame: b, duration_ms: duration, clicks: click?.count ?? 0, button: click ? { left: 0, right: 1, middle: 2 }[click.button] : 0,
          flags: modifiers.reduce((flags, key) => flags | ({ shift: 1 << 17, ctrl: 1 << 18, alt: 1 << 19, option: 1 << 19, cmd: 1 << 20 }[key] ?? 0), 0),
          strokes: strokes.map(path => path.map(p => ({ x: b.x + p.x * b.width / data.screenshot_width, y: b.y + p.y * b.height / data.screenshot_height }))) })
        signal.throwIfAborted()
      } finally { signal.removeEventListener('abort', cancel) }
    },
    pointer: async (data, signal) => {
      clearInterval(pointerTimer); pointerTimer = undefined
      if (!data) { cancelPointerMotion(); pointer?.hide(); pointerLabel?.hide(); shownPoint = undefined; return }
      ensureOverlays(); await moveAlongArc({ x: data.x, y: data.y }, signal)
      if (signal?.aborted || !shownPoint) return
      // Follow the last event actually sent by our worker, never the user's mouse.
      if (data.drag) pointerTimer = setInterval(() => { const p = strokeDriver?.position(); if (p) move(p.x, p.y) }, 16)
    },
    visibility: active => {
      clearTimeout(fadeTimer)
      if (active) {
        ensureOverlays()

        if (!globalShortcut.isRegistered(shortcut)) globalShortcut.register(shortcut, stop)
        for (const window of [pointer, pointerLabel]) if (window && !window.isDestroyed()) void window.webContents.executeJavaScript("document.body.style.opacity='1'").catch(() => {})
      } else {
        cancelPointerMotion()
        clearInterval(pointerTimer); pointerTimer = undefined
        globalShortcut.unregister(shortcut)
        for (const window of [pointer, pointerLabel]) if (window && !window.isDestroyed()) void window.webContents.executeJavaScript("document.body.style.opacity='0'").catch(() => {})
        fadeTimer = setTimeout(() => { pointer?.hide(); pointerLabel?.hide() }, 300)
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
      powerMonitor.removeListener('lock-screen', onLock)
      powerMonitor.removeListener('suspend', onLock)
      await starting?.catch(() => {})
      await host?.stop().catch(() => {})
      driver = undefined; host = undefined
      clearTimeout(fadeTimer); clearInterval(pointerTimer); cancelPointerMotion()
      globalShortcut.unregister(shortcut)
      pointer?.destroy(); pointerLabel?.destroy()
    }
  }
}
