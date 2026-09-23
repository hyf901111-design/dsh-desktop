import { randomUUID } from 'node:crypto'
import { setTimeout as settle } from 'node:timers/promises'

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
  private sequence = 0
  private budgets = new Map<string, { started: number; actions: number; failures: number }>()
  private busy = false
  private abort?: AbortController
  private stopped = new Set<string>()
  private idle?: ReturnType<typeof setTimeout>
  constructor(private options: {
    driver(): Promise<ComputerDriver>
    assertAvailable?(): void
    prepareObservation?(result: { data: RecordValue; screenshots: DriverResult['images'] }): { data: RecordValue; screenshots: DriverResult['images'] }
    unchanged?(before: Observation, after: Observation, input: RecordValue): boolean
    stroke?(target: RecordValue, data: RecordValue, strokes: { x: number; y: number }[][], duration: number, signal: AbortSignal, modifiers: string[], click?: { count: number; button: 'left' | 'right' | 'middle' }): Promise<void>
    pointer(data?: { x: number; y: number; drag: boolean }): void
    visibility(active: boolean): void
    screenPoint(target: RecordValue, data: RecordValue, x: number, y: number): { x: number; y: number }
  }) {}

  async stop(sessionId = this.owner, block = true): Promise<void> {
    if (!sessionId) return
    if (block) this.stopped.add(sessionId)
    else { this.stopped.delete(sessionId); this.budgets.delete(sessionId); this.windows.delete(sessionId) }
    if (sessionId !== this.owner) return
    this.abort?.abort(new Error('桌面控制已停止。'))
    this.observation = undefined
    this.options.pointer()
    this.options.visibility(false)
    clearTimeout(this.idle)
    // Keep the lease until the current action has unwound and released input.
    if (!this.busy) await this.endLease()
  }
  private async endLease() {
    if (!this.owner) return
    const run = this.runId
    try { await (await this.options.driver()).callTool('end_session', JSON.stringify({ session: run }), { signal: AbortSignal.timeout(5000) }) }
    finally { this.owner = undefined; this.observation = undefined; this.options.visibility(false); this.options.pointer(); clearTimeout(this.idle) }
  }
  async run(input: unknown, signal: AbortSignal): Promise<unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('无效桌面请求。')
    const v = input as RecordValue, id = v.sessionId
    if (typeof id !== 'string' || !id || id.length > 256) throw Error('缺少当前会话身份。')
    if (v.op === 'release' || v.op === 'finish') { await this.stop(id, v.op !== 'release'); return { stopped: true } }
    if (!['apps','windows','open','observe','click','type','key','hotkey','scroll','drag','stroke'].includes(v.op)) throw Error('不支持的桌面操作。')
    if (this.stopped.has(id)) throw Error('本轮桌面控制已停止，请等待下一轮用户指令。')
    if (this.busy || (this.owner && this.owner !== id)) throw Error('其他桌面操作正在进行，请等待当前会话结束。')
    const budget = this.budgets.get(id) ?? { started: Date.now(), actions: 0, failures: 0 }
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
          const detail = (error as { inner?: { message?: string; errorCode?: string } })?.inner
          if (typeof detail?.message === 'string') {
            throw new Error(`${name}: ${detail.message}${detail.errorCode ? ` (${detail.errorCode})` : ''}`, { cause: error })
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
      if (v.op === 'apps') return await call('list_apps')
      if (v.op === 'windows') {
        let pid = v.pid
        if (pid === undefined && (v.bundle_id || v.name)) {
          const apps = await call('list_apps')
          const matches = (apps.data.apps ?? []).filter((a: RecordValue) => a.running && (v.bundle_id ? a.bundle_id === v.bundle_id : a.name === v.name))
          if (matches.length !== 1) throw Error('应用未运行或名称不唯一，请先 apps/open 获取准确的应用。')
          pid = matches[0].pid
        }
        const result = await call('list_windows', pid === undefined ? {} : { pid: positiveInteger(pid) })
        const windows = (result.data.windows ?? []) as RecordValue[]
        const known = this.windows.get(id) ?? new Map<number, number>()
        for (const w of windows) if (Number.isSafeInteger(w.pid) && Number.isSafeInteger(w.window_id)) known.set(w.window_id, w.pid)
        this.windows.set(id, known)
        const useful = windows.filter(w => w.is_on_screen !== false && (!w.bounds || w.bounds.width > 40 && w.bounds.height > 40))
        return { ...result, data: { ...result.data, windows: useful, hiddenWindowCount: windows.length - useful.length },
          next: useful.map(w => ({ op: 'observe', pid: w.pid, window_id: w.window_id })) }
      }
      if (v.op === 'open') {
        this.observation = undefined
        if (typeof v.bundle_id !== 'string' && typeof v.name !== 'string') throw Error('请提供已发现的应用名称或 bundle_id。')
        return await call('launch_app', { ...(v.bundle_id ? { bundle_id: text(v.bundle_id, 256) } : { name: text(v.name, 256) }) })
      }
      const observe = async (target: RecordValue) => {
        this.observation = undefined
        let result = target.kind === 'desktop'
          ? await call('get_desktop_state', { session: this.runId })
          : await call('get_window_state', { pid: target.pid, window_id: target.window_id, session: this.runId, max_elements: 500, max_depth: 15 })
        if (!result.screenshots.length) throw Error('没有获得有效桌面截图，停止操作；请检查屏幕录制权限。')
        result = this.options.prepareObservation?.(result) ?? result
        const revision = `view-${++this.sequence}`
        this.observation = { revision, target, data: result.data, screenshots: result.screenshots, at: Date.now() }
        return { revision, target, coordinateSpace: '返回图片的像素坐标；窗口图以窗口左上角为原点，桌面图以主显示器左上角为原点。', ...result }
      }
      if (v.op === 'observe') return await observe(v.scope === 'desktop'
        ? { kind: 'desktop', display_id: 'primary' }
        : { kind: 'window', pid: positiveInteger(v.pid ?? this.windows.get(id)?.get(v.window_id)), window_id: positiveInteger(v.window_id) })
      let observed = this.observation
      if (!observed || v.revision !== observed.revision) throw Error('观察已过期，请先 observe，再使用新 revision 操作。')
      if ((v.pid !== undefined && v.pid !== observed.target.pid) || (v.window_id !== undefined && v.window_id !== observed.target.window_id) || (v.scope && v.scope !== observed.target.kind)) throw Error('操作目标与最近观察不一致，请重新 observe。')
      let token = v.element_token
      if (Date.now() - observed.at > 30000) {
        const previous = observed
        const fresh = await observe(previous.target)
        observed = this.observation!
        // Slow model responses do not invalidate an unchanged target. Revalidate
        // pixels and geometry before input, and return changed views without input.
        if (!this.options.unchanged?.(previous, observed, v) || (token !== undefined && !sameObservedElements(previous.data.elements, observed.data.elements))) {
          budget.failures = 0
          return { ...fresh, action: { performed: false, reason: '界面发生变化或无法确认；未执行输入，请根据本次截图重新规划。' } }
        }
        if (token !== undefined) {
          const index = previous.data.elements?.findIndex((e: RecordValue) => e.element_token === token)
          if (index === undefined || index < 0) throw Error('控件不在最近一次观察中，请重新 observe。')
          token = observed.data.elements[index]?.element_token
          if (!token) throw Error('刷新后的控件不可操作，请重新 observe。')
        }
      }
      if (observed.target.kind !== 'window') throw Error('后台输入需要目标应用窗口；桌面截图仅用于观察，请先 windows/observe 选择窗口。')
      const args: RecordValue = { target: observed.target, session: this.runId, delivery_mode: 'background' }
      let point: { x: number; y: number } | undefined
      if (token !== undefined) {
        const element = observed.data.elements?.find((e: RecordValue) => e.element_token === token)
        if (!element) throw Error('控件不在最近一次观察中，请重新 observe。')
        args.element_token = token
        if (element.frame) point = { x: element.frame.x + element.frame.w / 2, y: element.frame.y + element.frame.h / 2 }
      } else if (v.x !== undefined || v.y !== undefined) {
        this.validatePoint(observed, v.x, v.y)
        args.x = this.driverX(observed, v.x); args.y = this.driverY(observed, v.y)
        point = this.options.screenPoint(observed.target, observed.data, v.x, v.y)
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
      this.observation = undefined // Never replay a gesture against the old snapshot, including on failure.
      if (point) this.options.pointer({ ...point, drag: !!strokes && !click })
      const result = strokes
        ? await (async () => {
          await this.options.stroke!(observed!.target, observed!.data, strokes!, duration, combined, gestureModifiers, click)
          return { data: { performed: true, ...(click ? { count: click.count, route: 'window_pointer' } : { strokes: strokes!.length }), delivery_mode: 'background' } }
        })()
        : await (async () => {
          try { return await call(tool, args) }
          catch (error) {
            if (!isSamePidKeyboardRefusal(error, observed!.target) || !['type', 'key', 'hotkey'].includes(v.op)) throw error
            // With a token, type_text may already have attempted an AX text
            // write before reporting this refusal. Replaying it could duplicate
            // text, even when the AX read-back did not confirm the edit.
            if (v.op === 'type' && token !== undefined) {
              return { data: { effect: 'unverifiable', code: 'same_pid_keyboard_ambiguity',
                reason: '目标控件可能已收到辅助功能文字输入。请核对新截图；确认文字未出现后，用输入框 x/y 重新 type。' } }
            }
            // A foreground text retry must re-focus the exact field. The
            // process's remembered focus may belong to its sibling window.
            if ((v.op === 'type' || v.op === 'hotkey') && (args.x === undefined || args.y === undefined) && token === undefined) {
              return { data: { performed: false, code: 'keyboard_target_required',
                reason: '同一应用有多个窗口。请从新截图指定目标控件的 x/y 后重试；未发送键盘输入。' } }
            }
            const foreground = await call(tool, { ...args, delivery_mode: 'foreground' })
            return { ...foreground, data: { ...foreground.data, delivery_mode: 'foreground', fallback_reason: 'same_pid_keyboard_ambiguity' } }
          }
        })()
      budget.failures = 0
      const last = strokes?.at(-1)?.at(-1)
      const finalPoint = last ? this.options.screenPoint(observed.target, observed.data, last.x, last.y) : point
      this.options.pointer(finalPoint ? { ...finalPoint, drag: false } : undefined)
      // Let the application's event/render queue consume the input before the
      // screenshot. Otherwise a successful tool selection looks unchanged.
      await settle(150, undefined, { signal: combined })
      return { action: result.data, ...await observe(observed.target) }
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
  private driverX(o: Observation, x: number) { return x * (o.data.original_screenshot_width ?? o.data.screenshot_width) / o.data.screenshot_width }
  private driverY(o: Observation, y: number) { return y * (o.data.original_screenshot_height ?? o.data.screenshot_height) / o.data.screenshot_height }
  private validatePoint(o: Observation, x: unknown, y: unknown) {
    const width = o.data.screenshot_width, height = o.data.screenshot_height
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || !(width > 0) || !(height > 0) || x < 0 || y < 0 || x >= width || y >= height) throw Error('坐标超出当前截图，请重新观察。')
  }
}
function isSamePidKeyboardRefusal(error: unknown, target: RecordValue): boolean {
  const data = (error as { driverData?: RecordValue })?.driverData
  return data?.code === 'same_pid_keyboard_ambiguity' && data.effect === 'refused'
    && data.pid === target.pid && data.window_id === target.window_id
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
