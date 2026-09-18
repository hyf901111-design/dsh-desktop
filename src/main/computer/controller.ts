import { randomUUID } from 'node:crypto'

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
type Observation = { revision: string; target: RecordValue; data: RecordValue; at: number }

/** The host, not a model argument, owns the desktop lease and driver session. */
export class ComputerController {
  private owner?: string
  private runId = ''
  private observation?: Observation
  private busy = false
  private abort?: AbortController
  private stopped = new Set<string>()
  private idle?: ReturnType<typeof setTimeout>
  constructor(private options: {
    driver(): Promise<ComputerDriver>
    pointer(data?: { x: number; y: number; drag: boolean }): void
    visibility(active: boolean): void
    screenPoint(target: RecordValue, data: RecordValue, x: number, y: number): { x: number; y: number }
  }) {}

  async stop(sessionId = this.owner, block = true): Promise<void> {
    if (!sessionId) return
    if (block) this.stopped.add(sessionId)
    else this.stopped.delete(sessionId)
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
    if (!['apps','windows','open','observe','click','type','key','hotkey','scroll','drag'].includes(v.op)) throw Error('不支持的桌面操作。')
    if (this.stopped.has(id)) throw Error('本轮桌面控制已停止，请等待下一轮用户指令。')
    if (this.busy || (this.owner && this.owner !== id)) throw Error('其他桌面操作正在进行，请等待当前会话结束。')
    signal.throwIfAborted()
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
        const result = await driver.callTool(name, JSON.stringify(args), { signal: combined })
        const data = result.structuredJson ? JSON.parse(result.structuredJson) : { text: result.text }
        if (result.isError || data.refusal || data.effect === 'refused') throw Error(result.text || JSON.stringify(data))
        return { data, screenshots: result.images }
      }
      if (!this.owner) {
        this.owner = id; this.runId = `ework-${randomUUID()}`
        await call('start_session', { session: this.runId })
      }
      clearTimeout(this.idle)
      this.options.visibility(true)
      if (v.op === 'apps') return await call('list_apps')
      if (v.op === 'windows') return await call('list_windows', v.pid === undefined ? {} : { pid: positiveInteger(v.pid) })
      if (v.op === 'open') {
        this.observation = undefined
        if (typeof v.bundle_id !== 'string' && typeof v.name !== 'string') throw Error('请提供已发现的应用名称或 bundle_id。')
        return await call('launch_app', { ...(v.bundle_id ? { bundle_id: text(v.bundle_id, 256) } : { name: text(v.name, 256) }) })
      }
      const observe = async (target: RecordValue) => {
        this.observation = undefined
        const result = target.kind === 'desktop'
          ? await call('get_desktop_state', { session: this.runId })
          : await call('get_window_state', { pid: target.pid, window_id: target.window_id, session: this.runId, max_elements: 500, max_depth: 15 })
        if (!result.screenshots.length) throw Error('没有获得有效桌面截图，停止操作；请检查屏幕录制权限。')
        const revision = randomUUID()
        this.observation = { revision, target, data: result.data, at: Date.now() }
        return { ...result, revision, target, coordinateSpace: '截图原始像素；窗口截图以窗口左上角为原点，桌面截图以主显示器左上角为原点。' }
      }
      if (v.op === 'observe') return await observe(v.scope === 'desktop'
        ? { kind: 'desktop', display_id: 'primary' }
        : { kind: 'window', pid: positiveInteger(v.pid), window_id: positiveInteger(v.window_id) })
      const observed = this.observation
      if (!observed || v.revision !== observed.revision || Date.now() - observed.at > 120000) throw Error('观察已过期，请先 observe，再使用新 revision 操作。')
      if ((v.pid !== undefined && v.pid !== observed.target.pid) || (v.window_id !== undefined && v.window_id !== observed.target.window_id) || (v.scope && v.scope !== observed.target.kind)) throw Error('操作目标与最近观察不一致，请重新 observe。')
      const args: RecordValue = { target: observed.target, session: this.runId, delivery_mode: 'foreground' }
      const token = v.element_token
      let point: { x: number; y: number } | undefined
      if (token !== undefined) {
        const element = observed.data.elements?.find((e: RecordValue) => e.element_token === token)
        if (!element) throw Error('控件不在最近一次观察中，请重新 observe。')
        args.element_token = token
        if (element.frame) point = { x: element.frame.x + element.frame.w / 2, y: element.frame.y + element.frame.h / 2 }
      } else if (v.x !== undefined || v.y !== undefined) {
        this.validatePoint(observed, v.x, v.y)
        args.x = v.x; args.y = v.y
        point = this.options.screenPoint(observed.target, observed.data, v.x, v.y)
      }
      let tool: string = v.op
      switch (v.op) {
        case 'click':
          if (!point && !token) throw Error('点击需要当前观察的控件或像素坐标。')
          if (v.button !== undefined && !['left','right','middle'].includes(v.button)) throw Error('无效鼠标按键。')
          args.button = v.button ?? 'left'; args.count = v.count === undefined ? 1 : positiveInteger(v.count, 2)
          if (v.modifiers) args.modifier = modifiers(v.modifiers)
          break
        case 'type': tool = 'type_text'; args.text = text(v.text, 2000); args.delay_ms = 0; break
        case 'key': tool = 'press_key'; args.key = text(v.key, 64); if (v.modifiers) args.modifiers = modifiers(v.modifiers); break
        case 'hotkey':
          if (!Array.isArray(v.keys) || v.keys.length < 2 || v.keys.length > 5 || v.keys.some((k: unknown) => typeof k !== 'string' || k.length > 32)) throw Error('无效组合键。')
          args.keys = v.keys; break
        case 'scroll':
          if (!['up','down','left','right'].includes(v.direction)) throw Error('无效滚动方向。')
          args.direction = v.direction; args.amount = v.amount === undefined ? 3 : positiveInteger(v.amount, 30); break
        case 'drag':
          this.validatePoint(observed, v.x, v.y); this.validatePoint(observed, v.to_x, v.to_y)
          delete args.x; delete args.y; delete args.element_token
          Object.assign(args, { from_x: v.x, from_y: v.y, to_x: v.to_x, to_y: v.to_y, duration_ms: 700, steps: 45 })
          if (v.modifiers) args.modifier = modifiers(v.modifiers)
          break
      }
      this.observation = undefined // Never replay a gesture against the old snapshot, including on failure.
      if (point) this.options.pointer({ ...point, drag: v.op === 'drag' })
      const result = await call(tool, args)
      const finalPoint = v.op === 'drag' ? this.options.screenPoint(observed.target, observed.data, v.to_x, v.to_y) : point
      this.options.pointer(finalPoint ? { ...finalPoint, drag: false } : undefined)
      return { action: result.data, ...await observe(observed.target) }
    } catch (error) {
      failed = true
      this.observation = undefined
      this.options.pointer()
      if (combined.aborted) this.stopped.add(id)
      throw error
    } finally {
      // Native macOS drag is an atomic bounded gesture. An RPC cancellation can
      // resolve before its blocking input worker emits mouseUp; retain the lease
      // for the maximum 700ms gesture plus its focus/cleanup settling time.
      if (combined.aborted && v.op === 'drag') await new Promise(resolve => setTimeout(resolve, 1200))
      this.busy = false
      this.abort = undefined
      if (failed || combined.aborted || this.stopped.has(id)) await this.endLease().catch(() => {})
      else if (this.owner) this.idle = setTimeout(() => { void this.stop().catch(() => {}) }, 5 * 60 * 1000)
    }
  }
  private validatePoint(o: Observation, x: unknown, y: unknown) {
    const width = o.data.screenshot_width, height = o.data.screenshot_height
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || !(width > 0) || !(height > 0) || x < 0 || y < 0 || x >= width || y >= height) throw Error('坐标超出当前截图，请重新观察。')
  }
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
