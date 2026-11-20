import type { HomeGuideMountOptions } from '../home-guides'

const stages = ['notes', 'chart', 'title'] as const

/** Uses the resident InputBar and its real submission. Only the sample Agent supplies the recorded answer. */
export async function mountPresentationEditGuideChat(document: Document, options: HomeGuideMountOptions) {
  const win = document.defaultView!
  const controller = new win.AbortController()
  const locale = document.documentElement.dataset.odysseyLocale === 'en' ? 'en' : 'zh'
  let index = 0
  let prepared = false
  let preparing = false
  let sent = false
  let pending: { input: HTMLTextAreaElement; text: string; referenceLabel?: string } | undefined
  const abort = () => new DOMException('演示对话已结束。', 'AbortError')
  const check = () => {
    if (controller.signal.aborted || options.signal.aborted ||
        document.body.dataset.eworkPresentationSession !== options.sessionId) throw abort()
  }
  const rpc = async (action: string, extra: Record<string, unknown> = {}) => {
    const closing = action === 'dispose'
    if (!closing) check()
    const response = await win.fetch('/sherlock/home-guide/presentation-edit', {
      method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: closing,
      body: JSON.stringify({ action, runId: options.runId, sessionId: options.sessionId, ...extra }),
      signal: closing ? AbortSignal.timeout(10000) : AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
    })
    const result = await response.json()
    if (!response.ok || result.ok !== true) throw Error(result.message || '演示对话暂未就绪。')
    if (!closing) check()
  }
  const waitFor = async <T>(read: () => T | undefined, message: string) => {
    for (let remaining = 6000; remaining > 0; remaining -= 50) {
      check()
      const value = read()
      if (value !== undefined) return value
      await options.wait(50, controller.signal)
    }
    throw Error(message)
  }
  // The native layout can put a visible control inside a zero-size portal slot.
  // Hit-test its actual viewport position before pointing or submitting.
  const point = (target: HTMLElement) => {
    const box = target.getBoundingClientRect()
    if (!target.isConnected || target.matches(':disabled,[aria-disabled=true]')) return
    const left = Math.max(0, box.left), right = Math.min(win.innerWidth, box.right)
    const top = Math.max(0, box.top), bottom = Math.min(win.innerHeight, box.bottom)
    if (right <= left || bottom <= top) return
    // An inline title can cover the middle of the textarea. Aim beside its chip,
    // or on the next line when it wraps in a narrow conversation pane.
    const offsets: [number, number][] = target instanceof win.HTMLTextAreaElement
      ? [[.5,.5],[.94,.27],[.94,.78],[.14,.78],[.5,.86],[.04,.95]]
      : [[.5,.5]]
    for (const [u, v] of offsets) {
      const x = left + (right-left)*u, y = top + (bottom-top)*v
      if (target.contains(document.elementFromPoint(x, y))) return {x, y}
    }
  }
  const click = async (target: HTMLElement, commit: () => void) => {
    const where = () => { check(); const result = point(target); if (!result) throw Error('对话控件已变化。'); return result }
    if (options.point) await options.point({ target, action: 'click', hover: 'none', targetPoint: where, onClick: commit })
    else { where(); commit() }
  }
  const composer = () => {
    const inputs = [...document.querySelectorAll<HTMLTextAreaElement>('[data-research-composer-host] textarea[data-odyssey-file-reference-session]')]
      .filter(el => el.dataset.odysseyFileReferenceSession === options.sessionId && !el.readOnly && el.getClientRects().length && el.checkVisibility({checkVisibilityCSS:true}))
    return inputs.length === 1 ? inputs[0] : undefined
  }
  const prefix = (input: HTMLTextAreaElement, referenceLabel?: string): string | undefined => {
    if (!referenceLabel) return ''
    const chip = input.closest('.uV2eYG_root')?.querySelector('[data-reference-source="presentation-reference"]:not([data-provisional=true])')
    if (!chip || chipLabel(chip) !== referenceLabel) return
    return /^[\uFFFC\uE000-\uF8FF]\s*/u.exec(input.value)?.[0]
  }
  const chipLabel = (el: Element) => (el.querySelector('.uV2eYG_chipLabel')?.textContent ?? el.textContent)?.trim()
  const matches = (input: HTMLTextAreaElement, text: string, label?: string) => {
    const marker = prefix(input, label)
    return marker !== undefined && input.value === marker + text
  }
  const end = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if (detail?.ending && detail.runId === options.runId && detail.sessionId === options.sessionId) dispose()
  }
  const takeover = (event: Event) => {
    if (event.isTrusted && event.target instanceof win.Element &&
        event.target.closest('[data-research-composer-host],.t8lSSG_panel')) options.onTakeover?.()
  }
  function dispose() {
    if (controller.signal.aborted) return
    controller.abort()
    options.signal.removeEventListener('abort', dispose)
    win.removeEventListener('sherlock:home-guide-playback', end)
    document.removeEventListener('pointerdown', takeover, true)
    document.removeEventListener('beforeinput', takeover, true)
    if (prepared || preparing) void rpc('dispose').catch(() => {})
  }
  if (options.signal.aborted) throw abort()
  options.signal.addEventListener('abort', dispose, { once: true })
  win.addEventListener('sherlock:home-guide-playback', end)
  document.addEventListener('pointerdown', takeover, true)
  document.addEventListener('beforeinput', takeover, true)
  return {
    async draft(text: string) {
      check()
      if (!text.trim() || !stages[index] || pending || sent) throw Error('演示对话步骤已变化。')
      if (!prepared) {
        preparing = true
        await rpc('prepare', { cwd: options.cwd, fresh: options.fresh, locale })
        prepared = true
        preparing = false
      }
      const input = await waitFor(composer, '未找到当前演示会话的输入框。')
      const chips = () => [...(input.closest('.uV2eYG_root')?.querySelectorAll('[data-reference-source="presentation-reference"]') ?? [])]
      const initial = chips()
      const referenceLabel = index > 0 && initial.length === 1 ? chipLabel(initial[0]!) : undefined
      if ((index > 0 && !referenceLabel) || (index === 0 && initial.length)) throw Error('未找到本步骤的演示选区。')
      // Focusing is the normal action that pins a provisional selection in the native composer.
      await click(input, () => {
        if (initial[0]?.hasAttribute('data-provisional') && document.activeElement === input) input.blur()
        input.focus({ preventScroll: true })
      })
      await waitFor(() => matches(input, '', referenceLabel) ? true : undefined, '输入框已有草稿，或选区尚未就绪。')
      const setValue = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value')!.set!
      let written = ''
      for (const chunk of text.match(/.{1,2}/gsu) ?? []) {
        await options.waitUntilPlaying()
        check()
        if (composer() !== input || !matches(input, written, referenceLabel)) throw Error('输入框内容已变化。')
        const next = prefix(input, referenceLabel)! + written + chunk
        setValue.call(input, next)
        input.setSelectionRange(next.length, next.length)
        input.dispatchEvent(new win.InputEvent('input', { bubbles: true, inputType: 'insertText', data: chunk }))
        written += chunk
        await options.wait(48, controller.signal)
      }
      pending = { input, text, referenceLabel }
    },
    async send() {
      check()
      if (sent || !pending) throw Error('本步骤尚无待发送的演示请求。')
      const { input, text, referenceLabel } = pending
      const validate = () => {
        if (composer() !== input || !matches(input, text, referenceLabel)) throw Error('待发送的演示请求已变化。')
      }
      validate()
      await options.waitUntilPlaying()
      await rpc('arm', { prompt: text, ...(referenceLabel ? { referenceLabel } : {}) })
      const button = await waitFor(() => {
        const button = input.closest('.uV2eYG_root')?.querySelector<HTMLButtonElement>('button.uV2eYG_primary')
        return button && point(button) ? button : undefined
      }, '演示对话发送按钮尚未就绪。')
      await click(button, () => { validate(); button.click() })
      await rpc('accepted')
      sent = true
    },
    async reply(text: string) {
      check()
      if (!sent) throw Error('原生演示会话尚未收到本步骤的请求。')
      await options.waitUntilPlaying()
      await rpc('advance', { stage: stages[index], reply: text })
      await rpc('flush')
      index++
      pending = undefined
      sent = false
    },
    dispose
  }
}
