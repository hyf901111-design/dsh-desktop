import { randomUUID } from 'node:crypto'
import { setTimeout as settle } from 'node:timers/promises'
import type { BackgroundApplication, BackgroundInspection, BackgroundLaunchResult } from './background-launch'

export interface DriverResult {
  isError: boolean
  text: string
  structuredJson?: string
  images: { mimeType: string; dataBase64: string }[]
}
export interface ComputerDriver {
  callTool(name: string, args: string, options?: { signal: AbortSignal }): Promise<DriverResult>
}
type RecordValue = Record<string, any>
type Observation = { revision: string; target: RecordValue; data: RecordValue; screenshots: DriverResult["images"]; at: number }

/** Tokens identify one snapshot, not an enduring control. All semantic fields
 * (including focus, value and geometry) must still match before rebinding. */
export function sameObservedElements(a: unknown, b: unknown): boolean {
  const semantic = (value: unknown) => JSON.stringify(value, (key, item) => key === 'element_token' ? undefined : item)
  return Array.isArray(a) && Array.isArray(b) && semantic(a) === semantic(b)
}

/** The host, not a model argument, owns the desktop lease and driver session. */
export class ComputerController {
  private owner?: string
  private runId = ''
  private observation?: Observation
  private windows = new Map<string, Map<number, number>>()
  private applicationDiscoveries = new Map<string, Map<string, BackgroundApplication>>()
  private sequence = 0
  private budgets = new Map<string, { started: number; actions: number; failures: number; keyboardRefusals: number }>()
  private busy = false
  private abort?: AbortController
  private stopped = new Set<string>()
  private idle?: ReturnType<typeof setTimeout>
  constructor(private options: {
    driver(): Promise<ComputerDriver>
    launchApplication?(application: BackgroundApplication, signal: AbortSignal): Promise<BackgroundLaunchResult>
    inspectApplication?(application: BackgroundApplication, signal: AbortSignal): Promise<BackgroundInspection>
    assertAvailable?(): void
    prepareObservation?(result: { data: RecordValue; screenshots: DriverResult['images'] }, target: RecordValue, freshAfterMs?: number): Promise<{ data: RecordValue; screenshots: DriverResult['images'] }> | { data: RecordValue; screenshots: DriverResult['images'] }
    windowStream?: boolean
    stopCapture?(): Promise<void>
    unchanged?(before: Observation, after: Observation, input: RecordValue): boolean
    stroke?(target: RecordValue, data: RecordValue, strokes: { x: number; y: number }[][], duration: number, signal: AbortSignal, modifiers: string[], click?: { count: number; button: 'left' | 'right' | 'middle' }): Promise<void>
    pointer(data?: { x: number; y: number; drag: boolean }, signal?: AbortSignal): void | Promise<void>
    visibility(active: boolean): void
    screenPoint(target: RecordValue, data: RecordValue, x: number, y: number): { x: number; y: number }
    targetWindow?(target?: RecordValue, bounds?: RecordValue, focused?: boolean): void
  }) {}

  async stop(sessionId = this.owner, block = true): Promise<void> {
    if (!sessionId) return
    if (block) this.stopped.add(sessionId)
    else { this.stopped.delete(sessionId); this.budgets.delete(sessionId); this.windows.delete(sessionId); this.applicationDiscoveries.delete(sessionId) }
    if (sessionId !== this.owner) return
    this.abort?.abort(new Error('桌面控制已停止。'))
    this.observation = undefined
    this.options.targetWindow?.()
    this.options.pointer()
    this.options.visibility(false)
    clearTimeout(this.idle)
    // Keep the lease until the current action has unwound and released input.
    if (!this.busy) await this.endLease()
  }
  private async endLease() {
    if (!this.owner) return
    const run = this.runId
    try { await this.options.stopCapture?.() }
    finally {
      try { await (await this.options.driver()).callTool('end_session', JSON.stringify({ session: run }), { signal: AbortSignal.timeout(5000) }) }
      finally { this.applicationDiscoveries.delete(this.owner!); this.owner = undefined; this.observation = undefined; this.options.targetWindow?.(); this.options.visibility(false); this.options.pointer(); clearTimeout(this.idle) }
    }
  }
  async run(input: unknown, signal: AbortSignal): Promise<unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('无效桌面请求。')
    const v = input as RecordValue, id = v.sessionId
    if (typeof id !== 'string' || !id || id.length > 256) throw Error('缺少当前会话身份。')
    if (v.op === 'release' || v.op === 'finish') { await this.stop(id, v.op !== 'release'); return { stopped: true } }
    if (!['apps','windows','open','observe','click','type','key','hotkey','scroll','drag','stroke'].includes(v.op)) throw Error('不支持的桌面操作。')
    if (this.stopped.has(id)) throw Error('本轮桌面控制已停止，请等待下一轮用户指令。')
    if (this.busy || (this.owner && this.owner !== id)) throw Error('其他桌面操作正在进行，请等待当前会话结束。')
    const budget = this.budgets.get(id) ?? { started: Date.now(), actions: 0, failures: 0, keyboardRefusals: 0 }
    this.budgets.set(id, budget)
    if (Date.now() - budget.started >= 10 * 60 * 1000 || budget.actions >= 60 || budget.failures >= 3) {
      await this.stop(id)
      throw Error('本轮桌面任务已达到 10 分钟、60 次操作或连续 3 次失败限制，已停止；请检查模型延迟或应用状态后再试。')
    }
    budget.actions++
    signal.throwIfAborted()
    this.options.assertAvailable?.()
    this.busy = true
    const controller = new AbortController()
    this.abort = controller
    const combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(80000)])
    let failed = false
    try {
      const driver = await this.options.driver()
      combined.throwIfAborted()
      const call = async (name: string, args: RecordValue = {}) => {
        combined.throwIfAborted()
        this.options.assertAvailable?.()
        let result: DriverResult
        try {
          // Discovery must share the explicitly started lifecycle. Omitting
          // session creates a second implicit session which can expire while
          // named observations keep working.
          result = await driver.callTool(name, JSON.stringify({ ...args, session: this.runId }), { signal: combined })
        } catch (error) {
          const detail = (error as { inner?: { tool?: string; message?: string; errorCode?: string } })?.inner
          if (typeof detail?.message === 'string') {
            const refusedKeyboard = detail.tool === name && detail.errorCode === 'same_pid_keyboard_ambiguity'
              && args.delivery_mode === 'background' && ['type_text', 'press_key', 'hotkey'].includes(name)
              && args.target?.kind === 'window'
            throw Object.assign(new Error(`${name}: ${detail.message}${detail.errorCode ? ` (${detail.errorCode})` : ''}`, { cause: error }),
              refusedKeyboard ? { driverData: { code: detail.errorCode, effect: 'refused', pid: args.target.pid, window_id: args.target.window_id } } : {})
          }
          throw error
        }
        const data = result.structuredJson ? JSON.parse(result.structuredJson) : { text: result.text }
        if (result.isError || data.refusal || data.effect === 'refused') {
          throw Object.assign(Error(result.text || JSON.stringify(data)), { driverData: data })
        }
        return { data, screenshots: result.images }
      }
      if (!this.owner) {
        this.owner = id; this.runId = `ework-${randomUUID()}`
        await call('start_session', { session: this.runId })
      }
      clearTimeout(this.idle)
      this.options.visibility(true)
      if (v.op === 'apps') {
        if (v.launch_path !== undefined) {
          if (!this.options.inspectApplication || typeof v.bundle_id !== 'string' || !v.bundle_id) throw Error('准确路径发现需要 bundle_id 和可用的宿主应用解析接口。')
          const inspected = await this.options.inspectApplication({ bundle_id: text(v.bundle_id, 256), launch_path: text(v.launch_path, 4096) }, combined)
          const discoveries = this.applicationDiscoveries.get(id) ?? new Map<string, BackgroundApplication>()
          for (const app of inspected.apps) if (app.bundle_id === v.bundle_id && app.launch_path)
            discoveries.set(app.launch_path, { bundle_id: app.bundle_id, launch_path: app.launch_path })
          this.applicationDiscoveries.set(id, discoveries)
          return { data: inspected }
        }
        const result = await call('list_apps')
        const apps = (result.data.apps ?? []) as RecordValue[]
        const query = v.bundle_id !== undefined ? text(v.bundle_id, 256).toLocaleLowerCase()
          : v.name !== undefined ? text(v.name, 256).toLocaleLowerCase() : undefined
        const matches = apps.filter(a => query
          ? String(v.bundle_id !== undefined ? a.bundle_id ?? '' : a.name ?? '').toLocaleLowerCase().includes(query)
          : a.running === true)
        return { ...result, data: { ...result.data, installedAppCount: apps.length,
          apps: matches.map(a => ({ name: a.name, bundle_id: a.bundle_id, ...(a.pid ? { pid: a.pid } : {}),
            ...(typeof a.launch_path === 'string' ? { launch_path: a.launch_path } : {}), running: !!a.running, active: !!a.active })) } }
      }
      const resolvePid = async () => {
        let pid = v.pid
        if (pid === undefined && (v.bundle_id || v.name)) {
          const apps = await call('list_apps')
          const matches = (apps.data.apps ?? []).filter((a: RecordValue) => a.running && (v.bundle_id ? a.bundle_id === v.bundle_id : a.name === v.name))
          if (matches.length !== 1) throw Error('应用未运行或名称不唯一，请先 apps/open 获取准确的应用。')
          pid = matches[0].pid
        }
        return pid === undefined ? undefined : positiveInteger(pid)
      }
      const listWindows = async (pid?: number) => {
        const result = await call('list_windows', pid === undefined ? {} : { pid: positiveInteger(pid) })
        const windows = (result.data.windows ?? []) as RecordValue[]
        const known = this.windows.get(id) ?? new Map<number, number>()
        for (const w of windows) if (Number.isSafeInteger(w.pid) && Number.isSafeInteger(w.window_id)) known.set(w.window_id, w.pid)
        this.windows.set(id, known)
        const useful = windows.filter(w => w.is_on_screen !== false && w.on_current_space !== false
          && (!w.bounds || w.bounds.width > 40 && w.bounds.height > 40)
          && !(w.title === '' && windows.some(other => other !== w && other.pid === w.pid
            && typeof other.title === 'string' && other.title.length > 0 && sameBounds(w.bounds, other.bounds))))
        return { ...result, data: { ...result.data, windows: useful, hiddenWindowCount: windows.length - useful.length },
          next: useful.map(w => ({ op: 'observe', pid: w.pid, window_id: w.window_id })) }
      }
      if (v.op === 'windows') return await listWindows(await resolvePid())
      if (v.op === 'open') {
        this.observation = undefined
        if (typeof v.bundle_id !== 'string' && typeof v.name !== 'string') throw Error('请提供已发现的应用名称或 bundle_id。')
        // Resolve every installed/running copy afresh. A model path only selects
        // a listed app; it can never become an arbitrary launch command or URL.
        const listed = await call('list_apps')
        let matches: RecordValue[] = (listed.data.apps ?? []).filter((a: RecordValue) =>
          (v.bundle_id ? a.bundle_id === v.bundle_id : a.name === v.name))
        if (v.launch_path !== undefined) {
          const path = text(v.launch_path, 4096)
          matches = matches.filter(a => a.launch_path === path)
          const known = this.applicationDiscoveries.get(id)?.get(path)
          if (!matches.length && known && this.options.inspectApplication && known.bundle_id === v.bundle_id)
            matches = (await this.options.inspectApplication(known, combined)).apps
        }
        if (v.pid !== undefined) matches = matches.filter(a => a.running && a.pid === positiveInteger(v.pid))
        if (matches.length !== 1) return { action: { performed: false, dispatched: false,
          code: matches.length ? 'application_ambiguous' : 'application_not_found', delivery_mode: 'background',
          reason: matches.length ? '发现多个应用副本或实例；请用准确 launch_path 或 PID 选择，未启动或激活。'
            : '应用不在本次发现的准确列表中，未启动。请先 apps 查询名称、bundle_id 和 launch_path。' },
          next: matches.map(a => a.running ? { op: 'windows', pid: positiveInteger(a.pid) }
            : { op: 'open', bundle_id: a.bundle_id, ...(a.launch_path ? { launch_path: a.launch_path } : {}) }) }
        const selected = matches[0]!
        if (selected.running) return { ...await listWindows(positiveInteger(selected.pid)), action: {
          performed: false, dispatched: false, code: 'application_already_running', delivery_mode: 'background',
          pid: selected.pid, bundle_id: selected.bundle_id, launch_path: selected.launch_path,
          reason: '准确应用已运行；未激活或重新启动，请选择本次返回的准确窗口。' } }
        if (!this.options.launchApplication || typeof selected.bundle_id !== 'string' || !selected.bundle_id) return {
          action: { performed: false, dispatched: false, code: 'background_launch_unavailable', delivery_mode: 'background',
            reason: '宿主的后台启动接口不可用；未调用可能激活前台的驱动启动。' } }
        const action = await this.options.launchApplication({ bundle_id: selected.bundle_id,
          // Only an explicit exact-path choice disambiguates registered copies.
          // Do not turn a driver's preferred installed path into silent consent.
          ...(typeof v.launch_path === 'string' && typeof selected.launch_path === 'string' ? { launch_path: selected.launch_path } : {}) }, combined)
        if ((action.performed === true || action.code === 'application_already_running') && action.pid) {
          try { return { ...await listWindows(positiveInteger(action.pid)), action } }
          catch { return { action: { ...action, ...(combined.aborted && action.dispatched
              ? { performed: null, effect: 'unknown', code: 'launch_readback_interrupted_after_dispatch' } : {}), readback_unavailable: true,
            reason: '后台启动已回报，但窗口回读未完成；请先重新发现准确 PID 和窗口，不自动重试启动。' } } }
        }
        if (action.code === 'launch_focus_changed') this.stopped.add(id)
        return { action }
      }
      const observe = async (target: RecordValue, freshAfterMs?: number) => {
        this.observation = undefined
        // Observation must not activate or raise the target while the user works.
        const focus = { requested: false, verified: false, appActive: null, policy: 'background-only' }
        let result = target.kind === 'desktop'
          ? await call('get_desktop_state', { session: this.runId })
          : await call('get_window_state', { pid: target.pid, window_id: target.window_id, session: this.runId, max_elements: 500, max_depth: 15,
            // The tiny driver capture validates the raw 1×/2× pixel frame;
            // ScreenCaptureKit supplies the image shown to the model.
            ...(this.options.windowStream ? { max_dimension: 64 } : {}) })
        result = await (this.options.prepareObservation?.(result, target, freshAfterMs) ?? result)
        if (!result.screenshots.length) throw Error('没有获得有效桌面截图，停止操作；请检查屏幕录制权限。')
        const revision = `view-${++this.sequence}`
        this.observation = { revision, target, data: result.data, screenshots: result.screenshots, at: Date.now() }
        this.options.targetWindow?.(target.kind === 'window' ? target : undefined, target.kind === 'window' ? result.data.window_bounds : undefined, false)
        return { revision, target, focus, coordinateSpace: '返回图片的像素坐标；窗口图以窗口左上角为原点，桌面图以主显示器左上角为原点。', ...result }
      }
      if (v.op === 'observe') {
        if (v.scope === 'desktop') return await observe({ kind: 'desktop', display_id: 'primary' })
        if (v.window_id === undefined) {
          if (v.pid === undefined && !v.bundle_id && !v.name) throw Error('请提供应用名称、bundle_id、pid 或 window_id。')
          const choices = await listWindows(await resolvePid())
          if (choices.data.windows.length !== 1) return choices
          const selected = choices.data.windows[0]
          return await observe({ kind: 'window', pid: selected.pid, window_id: selected.window_id })
        }
        return await observe({ kind: 'window', pid: positiveInteger(v.pid ?? this.windows.get(id)?.get(v.window_id)), window_id: positiveInteger(v.window_id) })
      }
      let observed = this.observation
      if (!observed || v.revision !== observed.revision) throw Error('观察已过期，请先 observe，再使用新 revision 操作。')
      if ((v.pid !== undefined && v.pid !== observed.target.pid) || (v.window_id !== undefined && v.window_id !== observed.target.window_id) || (v.scope && v.scope !== observed.target.kind)) throw Error('操作目标与最近观察不一致，请重新 observe。')
      let token = v.element_token
      if (Date.now() - observed.at > 30000) {
        const previous = observed
        const fresh = await observe(previous.target)
        observed = this.observation!
        // Animated pages and a blinking insertion caret change screenshot
        // pixels while the intended control stays put. Rebind one exact AX
        // control before falling back to the conservative pixel comparison.
        const semantic = stableObservedTarget(previous, observed, v, token)
        const stable = semantic === undefined ? this.options.unchanged?.(previous, observed, v) === true : semantic.matched
        if (!stable || (token !== undefined && semantic === undefined && !sameObservedElements(previous.data.elements, observed.data.elements))) {
          budget.failures = 0
          return { ...fresh, action: { performed: false, reason: '界面发生变化或无法确认；未执行输入，请根据本次截图重新规划。' } }
        }
        if (token !== undefined) {
          const index = previous.data.elements?.findIndex((e: RecordValue) => e.element_token === token)
          if (index === undefined || index < 0) throw Error('控件不在最近一次观察中，请重新 observe。')
          token = semantic?.token ?? observed.data.elements[index]?.element_token
          if (!token) throw Error('刷新后的控件不可操作，请重新 observe。')
        }
      }
      if (observed.target.kind !== 'window') throw Error('后台输入需要目标应用窗口；桌面截图仅用于观察，请先 windows/observe 选择窗口。')
      // A single accessible text field is an unambiguous input destination.
      // Resolve it on the host when the model omitted coordinates, which is
      // common after it has already clicked the application's search control.
      if (['type', 'key', 'hotkey'].includes(v.op) && token === undefined && v.x === undefined && v.y === undefined) {
        const fields = (observed.data.elements ?? []).filter((element: RecordValue) =>
          element.element_token && element.enabled !== false && /^(AXTextField|AXTextArea|AXSearchField|AXComboBox)$/i.test(element.role))
        if (fields.length === 1) token = fields[0].element_token
      }
      const args: RecordValue = { target: observed.target, session: this.runId, delivery_mode: 'background' }
      let point: { x: number; y: number } | undefined
      let webKeyboardTarget = false
      if (token !== undefined) {
        const element = observed.data.elements?.find((e: RecordValue) => e.element_token === token)
        if (!element) throw Error('控件不在最近一次观察中，请重新 observe。')
        // Semantic web-field refusal does not depend on usable geometry. A
        // missing/off-window frame must not reopen the untrusted AXValue path.
        webKeyboardTarget = ['type', 'key', 'hotkey'].includes(v.op) && element.in_web_content === true
        const webField = webKeyboardTarget ? webFieldPixelPoint(observed.data, element) : undefined
        if (webField) {
          // Chromium/Electron AXValue can echo a write without the renderer
          // accepting it. Mark this unsupported route before dispatch instead.
          args.x = this.driverX(observed, webField.x); args.y = this.driverY(observed, webField.y)
          point = this.options.screenPoint(observed.target, observed.data, webField.x, webField.y)
          webKeyboardTarget = true
          token = undefined
        } else {
          args.element_token = token
          if (element.frame) point = { x: element.frame.x + element.frame.w / 2, y: element.frame.y + element.frame.h / 2 }
        }
      } else if (v.x !== undefined || v.y !== undefined) {
        this.validatePoint(observed, v.x, v.y)
        args.x = this.driverX(observed, v.x); args.y = this.driverY(observed, v.y)
        point = this.options.screenPoint(observed.target, observed.data, v.x, v.y)
        webKeyboardTarget = ['type', 'key', 'hotkey'].includes(v.op) && (observed.data.elements ?? []).some((element: RecordValue) =>
          element.in_web_content === true && element.enabled !== false
          && /^(AXTextField|AXTextArea|AXSearchField|AXComboBox)$/i.test(element.role) && validElementFrame(element.frame)
          && containsPoint({ x: element.frame.x, y: element.frame.y, width: element.frame.w, height: element.frame.h }, point!))
      }
      let strokes: { x: number; y: number }[][] | undefined
      let click: { count: number; button: 'left' | 'right' | 'middle' } | undefined
      let duration = 2000
      let tool: string = v.op
      switch (v.op) {
        case 'click':
          if (!point && !token) throw Error('点击需要当前观察的控件或像素坐标。')
          if (v.button !== undefined && !['left','right','middle'].includes(v.button)) throw Error('无效鼠标按键。')
          args.button = v.button ?? 'left'; args.count = v.count === undefined ? 1 : positiveInteger(v.count, 2)
          if (v.modifiers) args.modifier = modifiers(v.modifiers)
          if (!token) {
            if (!this.options.stroke) throw Error('后台坐标点击不可用，未切换到前台输入。')
            // Cua's coordinate path can report AXPress success on a generic
            // canvas container without actually clicking the requested point.
            // Preserve explicit pixel targeting through our window-only route.
            click = { count: args.count, button: args.button }
            strokes = [[{ x: v.x, y: v.y }, { x: v.x, y: v.y }]]
            duration = 100
          }
          break
        case 'type': tool = 'type_text'; args.text = text(v.text, 2000); args.delay_ms = 0; break
        case 'key': tool = 'press_key'; args.key = text(v.key, 64); if (v.modifiers) args.modifiers = modifiers(v.modifiers); break
        case 'hotkey':
          if (!Array.isArray(v.keys) || v.keys.length < 2 || v.keys.length > 5 || v.keys.some((k: unknown) => typeof k !== 'string' || k.length > 32)) throw Error('无效组合键。')
          args.keys = v.keys; break
        case 'scroll':
          if (!['up','down','left','right'].includes(v.direction)) throw Error('无效滚动方向。')
          args.direction = v.direction; args.amount = v.amount === undefined ? 3 : positiveInteger(v.amount, 30); break
        case 'stroke':
          if (observed.target.kind !== 'window' || !this.options.stroke) throw Error('连续画笔需要先观察目标应用窗口。')
          if (!Array.isArray(v.strokes) || !v.strokes.length || v.strokes.length > 12) throw Error('每批画笔需 1 至 12 条笔画。')
          let total = 0
          strokes = v.strokes.map((stroke: unknown) => {
            if (!Array.isArray(stroke) || stroke.length < 2 || stroke.length > 256 || (total += stroke.length) > 768) throw Error('笔画点数超限。')
            return stroke.map(p => { this.validatePoint(observed!, p?.x, p?.y); return { x: p.x, y: p.y } })
          })
          duration = v.duration_ms === undefined ? 2000 : positiveInteger(v.duration_ms, 8000)
          if (duration < 100) throw Error('笔画时长应为 100 至 8000 毫秒。')
          point = this.options.screenPoint(observed.target, observed.data, strokes[0]![0]!.x, strokes[0]![0]!.y)
          break
        case 'drag':
          if (!this.options.stroke) throw Error('后台拖拽不可用，未切换到前台输入。')
          this.validatePoint(observed, v.x, v.y); this.validatePoint(observed, v.to_x, v.to_y)
          if (v.button !== undefined && v.button !== 'left') throw Error('后台拖拽目前只支持左键。')
          strokes = [[{ x: v.x, y: v.y }, { x: v.to_x, y: v.to_y }]]
          duration = 700
          point = this.options.screenPoint(observed.target, observed.data, v.x, v.y)
          break
      }
      const gestureModifiers = strokes && v.modifiers !== undefined ? modifiers(v.modifiers) : []
      if (gestureModifiers.includes('fn')) throw Error('后台指针输入不支持 fn 修饰键。')
      let fallbackTarget: RecordValue | undefined
      if (v.op === 'click' && point) {
        const parent = observed
        // Popup menus are separate macOS windows even when their controls
        // appear in the parent window's accessibility snapshot. A click sent
        // to the parent at the same screen point can hit content underneath.
        const listed = await call('list_windows', { pid: parent.target.pid })
        const windows = (listed.data.windows ?? []) as RecordValue[]
        const parentWindow = windows.find(w => w.window_id === parent.target.window_id)
        if (!parentWindow) {
          this.observation = undefined
          budget.failures = 0
          return { ...listed, action: { performed: false, code: 'target_window_changed', reason: '原窗口已不在窗口列表中；未点击，请重新选择窗口观察。' },
            next: windows.filter(w => w.pid === parent.target.pid && w.is_on_screen !== false).map(w => ({ op: 'observe', pid: w.pid, window_id: w.window_id })) }
        }
        const overlapping = windows.filter(w =>
          w.window_id !== parent.target.window_id &&
          w.pid === parent.target.pid && w.is_on_screen !== false && validBounds(w.bounds)
          && w.on_current_space !== false && !sameBounds(w.bounds, parent.data.window_bounds) && containsPoint(w.bounds, point!))
        if (overlapping.some(w => !Number.isFinite(w.z_index)) || overlapping.length && !Number.isFinite(parentWindow.z_index)) {
          this.observation = undefined
          budget.failures = 0
          return { ...listed, action: { performed: false, code: 'window_stack_unknown', reason: '点击点存在同应用重叠窗口，但叠放顺序不可确认；未点击，请观察准确窗口。' },
            next: overlapping.map(w => ({ op: 'observe', pid: w.pid, window_id: w.window_id })) }
        }
        const popup = overlapping.filter(w => w.z_index > parentWindow.z_index)
          .sort((a, b) => b.z_index - a.z_index)[0]
        if (popup) {
          const sourceElement = token !== undefined
            ? parent.data.elements?.find((e: RecordValue) => e.element_token === token)
            : actionableAt(parent.data.elements, point)
          const popupTarget = { kind: 'window', pid: parent.target.pid, window_id: popup.window_id }
          let popupView: RecordValue
          try { popupView = await observe(popupTarget) }
          catch {
            const fresh = await observe(parent.target)
            budget.failures = 0
            return { ...fresh, action: { performed: false, code: 'overlay_window_changed', reason: '弹层已关闭或无法观察；未点击，请根据新截图操作。' } }
          }
          observed = this.observation!
          const semanticClick = args.button === 'left' && args.count === 1 && (!args.modifier || args.modifier.length === 0)
          const popupElement = semanticClick ? matchingPopupElement(sourceElement, observed.data.elements, point) : undefined
          if (!popupElement) {
            budget.failures = 0
            return { ...popupView, action: { performed: false, code: 'overlay_window_changed', reason: '点击点属于新的弹层窗口；未点击，请用本次弹层截图和 revision 选择菜单项。' } }
          }
          fallbackTarget = parent.target
          token = popupElement.element_token
          args.target = popupTarget
          args.element_token = token
          delete args.x; delete args.y
          strokes = undefined; click = undefined
        }
      }
      const keyboard = ['type', 'key', 'hotkey'].includes(v.op)
      const knownKeyboardRefusal = keyboard && (samePidKeyboardUnavailable(observed.data, observed.target) || webKeyboardTarget)
        ? backgroundKeyboardUnavailable(samePidKeyboardUnavailable(observed.data, observed.target) ? 'same_pid_keyboard_ambiguity' : 'web_text_field')
        : undefined
      this.observation = undefined // Never replay a gesture against the old snapshot, including on failure.
      if (point && !knownKeyboardRefusal) await this.options.pointer({ ...point, drag: !!strokes && !click }, combined)
      combined.throwIfAborted()
      const result = knownKeyboardRefusal ?? (strokes
        ? await (async () => {
          await this.options.stroke!(observed!.target, observed!.data, strokes!, duration, combined, gestureModifiers, click)
          return { data: { performed: true, ...(click ? { count: click.count, route: 'window_pointer' } : { strokes: strokes!.length }), delivery_mode: 'background' } }
        })()
        : await (async () => {
          try { return await call(tool, args) }
          catch (error) {
            if (!keyboard || !isSamePidKeyboardRefusal(error, observed!.target)) throw error
            // The pinned driver proves this refusal before any input. Keep it
            // refused; never turn a known refusal into foreground delivery.
            return backgroundKeyboardUnavailable('same_pid_keyboard_ambiguity')
          }
        })())
      if (['type', 'key', 'hotkey'].includes(v.op)) {
        budget.keyboardRefusals = result.data.performed === false ? budget.keyboardRefusals + 1 : 0
        if (budget.keyboardRefusals >= 2) {
          this.stopped.add(id)
          result.data.terminal = true
          result.data.reason = `${result.data.reason ?? '键盘输入未完成'}；连续两次无法确认目标，已停止本轮桌面控制。`
        }
      }
      budget.failures = 0
      const last = strokes?.at(-1)?.at(-1)
      const finalPoint = last ? this.options.screenPoint(observed.target, observed.data, last.x, last.y) : point
      this.options.pointer(finalPoint && result.data.performed !== false ? { ...finalPoint, drag: false } : undefined)
      // Let the application's event/render queue consume the input before the
      // screenshot. Otherwise a successful tool selection looks unchanged.
      const actionAt = Date.now()
      if (result.data.performed !== false) await settle(this.options.windowStream ? 50 : 150, undefined, { signal: combined })
      if (fallbackTarget) {
        try { return { action: result.data, ...await observe(observed.target, actionAt) } }
        catch (error) { return { action: { ...result.data, ...(isClosedWindowError(error) ? { dismissedPopup: true } : { popupObservationUnavailable: true }) }, ...await observe(fallbackTarget, actionAt) } }
      }
      return { action: result.data, ...await observe(observed.target, actionAt) }
    } catch (error) {
      failed = true
      budget.failures++
      this.observation = undefined
      this.options.pointer()
      if (combined.aborted) this.stopped.add(id)
      throw error
    } finally {
      // Native gestures settle only after releasing the target's held button.
      if (!failed && !combined.aborted) budget.failures = 0
      this.busy = false
      this.abort = undefined
      if (failed || combined.aborted || this.stopped.has(id)) await this.endLease().catch(() => {})
      else if (this.owner) this.idle = setTimeout(() => { void this.stop().catch(() => {}) }, 5 * 60 * 1000)
    }
  }
  private driverX(o: Observation, x: number) {
    const b = o.data.window_bounds
    return x * (o.data.driver_screenshot_scale && validBounds(b)
      ? b.width * o.data.driver_screenshot_scale : o.data.original_screenshot_width ?? o.data.screenshot_width) / o.data.screenshot_width
  }
  private driverY(o: Observation, y: number) {
    const b = o.data.window_bounds
    return y * (o.data.driver_screenshot_scale && validBounds(b)
      ? b.height * o.data.driver_screenshot_scale : o.data.original_screenshot_height ?? o.data.screenshot_height) / o.data.screenshot_height
  }
  private validatePoint(o: Observation, x: unknown, y: unknown) {
    const width = o.data.screenshot_width, height = o.data.screenshot_height
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || !(width > 0) || !(height > 0) || x < 0 || y < 0 || x >= width || y >= height) throw Error('坐标超出当前截图，请重新观察。')
  }
}
function webFieldPixelPoint(data: RecordValue, element: RecordValue): { x: number; y: number } | undefined {
  if (!/^(AXTextField|AXTextArea|AXSearchField|AXComboBox)$/i.test(element.role)) return undefined
  const b = data.window_bounds, frame = element.frame
  if (!validBounds(b) || !frame || ![frame.x, frame.y, frame.w, frame.h].every((n: unknown) => typeof n === 'number' && Number.isFinite(n))
    || frame.w <= 0 || frame.h <= 0 || !(data.screenshot_width > 0) || !(data.screenshot_height > 0)) return undefined
  const center = { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 }
  if (!containsPoint(b, center)) return undefined
  return { x: (center.x - b.x) * data.screenshot_width / b.width,
    y: (center.y - b.y) * data.screenshot_height / b.height }
}
function stableObservedTarget(before: Observation, after: Observation, input: RecordValue, token: unknown): { matched: boolean; token?: string } | undefined {
  if (JSON.stringify(before.target) !== JSON.stringify(after.target)
    || JSON.stringify(before.data.window_bounds) !== JSON.stringify(after.data.window_bounds)
    || before.data.screenshot_width !== after.data.screenshot_width
    || before.data.screenshot_height !== after.data.screenshot_height
    || before.data.scale_factor !== after.data.scale_factor) return { matched: false }
  const isKeyboard = ['type', 'key', 'hotkey'].includes(input.op)
  const isClick = input.op === 'click'
  if (!isKeyboard && !isClick) return undefined
  const eligible = (element: RecordValue) => element?.element_token && element.enabled !== false
    && (isKeyboard ? /^(AXTextField|AXTextArea|AXSearchField|AXComboBox)$/i.test(element.role)
      : element.actions?.includes('AXPress') && /^(AXButton|AXMenuItem|AXCheckBox|AXRadioButton)$/i.test(element.role))
  const at = (observation: Observation): RecordValue[] => {
    const b = observation.data.window_bounds
    if (!validBounds(b) || !Number.isFinite(input.x) || !Number.isFinite(input.y)) return []
    const point = { x: b.x + input.x * b.width / observation.data.screenshot_width,
      y: b.y + input.y * b.height / observation.data.screenshot_height }
    return (observation.data.elements ?? []).filter((element: RecordValue) => eligible(element) && validElementFrame(element.frame)
      && containsPoint({ x: element.frame.x, y: element.frame.y, width: element.frame.w, height: element.frame.h }, point))
  }
  const old = typeof token === 'string'
    ? (before.data.elements ?? []).find((element: RecordValue) => element.element_token === token)
    : at(before).sort((a, b) => a.frame.w * a.frame.h - b.frame.w * b.frame.h)[0]
  if (!eligible(old)) return undefined
  const candidates = typeof token === 'string' ? (after.data.elements ?? []).filter(eligible) : at(after)
  const equal = (a: RecordValue, b: RecordValue) => a.role === b.role && a.label === b.label && a.value === b.value
    && a.enabled === b.enabled && a.selected === b.selected && a.in_web_content === b.in_web_content
    && validElementFrame(a.frame) && validElementFrame(b.frame)
    && (['x','y','w','h'] as const).every(key => Math.abs(a.frame[key] - b.frame[key]) <= 1)
  const matches = candidates.filter((element: RecordValue) => equal(old, element))
  return { matched: matches.length === 1, token: matches.length === 1 ? matches[0].element_token : undefined }
}
function validElementFrame(frame: RecordValue | undefined): boolean {
  return !!frame && [frame.x, frame.y, frame.w, frame.h].every(n => typeof n === 'number' && Number.isFinite(n)) && frame.w > 0 && frame.h > 0
}
function backgroundKeyboardUnavailable(reason: 'same_pid_keyboard_ambiguity' | 'web_text_field'): { data: RecordValue; screenshots: DriverResult['images'] } {
  return { data: { performed: false, code: 'background_input_unavailable', delivery_mode: 'background', unsupported_reason: reason,
    reason: reason === 'same_pid_keyboard_ambiguity'
      ? '当前驱动无法可靠定位同一应用多窗口的后台键盘目标；未输入，也不会切换到前台重试。可改用该任务已有的文档、网页或应用接口。'
      : '当前驱动不能可靠验证网页编辑器的后台键盘输入；未输入，也不会切换到前台重试。请优先使用 browser_use 或该任务已有的内容编辑接口。' }, screenshots: [] }
}
function samePidKeyboardUnavailable(data: RecordValue, target: RecordValue): boolean {
  const capability = data.background_input
  return capability?.exact_window?.status === 'matched'
    && capability.exact_window.pid === target.pid && capability.exact_window.window_id === target.window_id
    && capability.routes?.some((route: RecordValue) => route.route === 'pid_keyboard'
      && route.status === 'refused' && route.reason === 'same_pid_keyboard_ambiguity') === true
}
function isSamePidKeyboardRefusal(error: unknown, target: RecordValue): boolean {
  const data = (error as { driverData?: RecordValue })?.driverData
  return data?.code === 'same_pid_keyboard_ambiguity' && data.effect === 'refused'
    && data.pid === target.pid && data.window_id === target.window_id
}
function isClosedWindowError(error: unknown): boolean {
  return /not a live window|window.*(?:closed|stale)/i.test(error instanceof Error ? error.message : String(error))
}
function validBounds(b: unknown): b is { x: number; y: number; width: number; height: number } {
  const v = b as RecordValue
  return v && [v.x, v.y, v.width, v.height].every(n => typeof n === 'number' && Number.isFinite(n)) && v.width > 0 && v.height > 0
}
function sameBounds(a: unknown, b: unknown): boolean {
  return validBounds(a) && validBounds(b) && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1
    && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1
}
function containsPoint(b: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }): boolean {
  return p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height
}
function actionableAt(elements: RecordValue[] | undefined, point: { x: number; y: number }): RecordValue | undefined {
  return elements?.filter(e => e.element_token && e.label && e.actions?.includes('AXPress') && e.frame
    && containsPoint({ x: e.frame.x, y: e.frame.y, width: e.frame.w, height: e.frame.h }, point))
    .sort((a, b) => a.frame.w * a.frame.h - b.frame.w * b.frame.h)[0]
}
function matchingPopupElement(source: RecordValue | undefined, elements: RecordValue[] | undefined, point: { x: number; y: number }): RecordValue | undefined {
  if (!source?.label || !source.frame) return undefined
  return actionableAt(elements, point)?.label === source.label
    ? elements?.find(e => e.element_token && e.role === source.role && e.label === source.label && e.actions?.includes('AXPress')
      && e.frame && Math.abs(e.frame.x - source.frame.x) < 2 && Math.abs(e.frame.y - source.frame.y) < 2
      && Math.abs(e.frame.w - source.frame.w) < 2 && Math.abs(e.frame.h - source.frame.h) < 2)
    : undefined
}
function positiveInteger(v: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0 || v > max) throw Error('无效的应用、窗口或数量参数。')
  return v
}
function text(v: unknown, max: number): string { if (typeof v !== 'string' || !v.length || v.length > max) throw Error('无效文本参数。'); return v }
function modifiers(v: unknown): string[] {
  if (!Array.isArray(v) || v.length > 4 || v.some(k => !['cmd','shift','option','alt','ctrl','fn'].includes(k))) throw Error('无效修饰键。')
  return v
}
