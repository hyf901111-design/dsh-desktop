import {
  HOME_SPREADSHEET_GUIDE_PATH,
  HOME_SPREADSHEET_GUIDE_PROMPTS
} from '../../../packages/dsh-research-task-runtime/home-spreadsheet-guide-contract.js'
import { homeGuideTargetPoint } from '../home-guide-pointer'
import type { HomeGuideAdapter, HomeGuideMountOptions } from '../home-guides'
import type { mountSpreadsheet } from './view'

type Spreadsheet = ReturnType<typeof mountSpreadsheet>
type ReplayStage = 'analysis' | 'trend' | 'complete'
type ReplayAction = 'prepare' | 'arm' | 'accepted' | 'advance' | 'flush' | 'dispose'

/** The playback clock owns sequencing. All edits go through the currently visible spreadsheet. */
export function mountCashFlowGuide(document: Document, options: HomeGuideMountOptions, spreadsheet: Spreadsheet): HomeGuideAdapter {
  const win = document.defaultView!
  const locale = document.documentElement.dataset.odysseyLocale === 'en' ? 'en' : 'zh'
  const localeText = (zh: string, en: string) => locale === 'en' ? en : zh
  const requestAbort = new win.AbortController()
  const abort = () => new DOMException('表格演示已结束。', 'AbortError')
  let preparing = false
  let completed = false
  let closing: Promise<void> | undefined
  let workbookView: NonNullable<ReturnType<Spreadsheet['cashFlowGuideView']>> | undefined
  const visibleView = () => spreadsheet.cashFlowGuideView(options.sessionId)

  const check = () => {
    if (requestAbort.signal.aborted || options.signal.aborted || !workbookView || visibleView() !== workbookView) throw abort()
    return workbookView
  }
  const rightToggle = () => document.querySelector<HTMLButtonElement>('[data-odyssey-panel-entry="right"]')
  const rpc = async (action: ReplayAction, stage?: ReplayStage) => {
    const disposing = action === 'dispose'
    if (!disposing) check()
    const signal = disposing ? AbortSignal.timeout(8000) : AbortSignal.any([requestAbort.signal, AbortSignal.timeout(12000)])
    const reply = await win.fetch(HOME_SPREADSHEET_GUIDE_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action,
        sessionId: options.sessionId,
        runId: options.runId,
        ...(action === 'prepare' ? { cwd: options.cwd, fresh: options.fresh, locale } : {}),
        ...(stage ? { stage } : {})
      }),
      signal,
      keepalive: disposing
    })
    const result = await reply.json()
    if (!disposing) check()
    if (!reply.ok || result.ok !== true) throw Error(result.message || '表格演示暂未就绪。')
  }
  const waitFor = async <T>(read: () => T | undefined, message: string): Promise<T> => {
    for (let left = 6000; left > 0; left -= 60) {
      requestAbort.signal.throwIfAborted()
      const value = read()
      if (value) return value
      await options.wait(60, requestAbort.signal)
    }
    throw Error(message)
  }
  const visible = (element: HTMLElement | null | undefined) => {
    if (!element) return false
    try { homeGuideTargetPoint(document, element); return true } catch { return false }
  }
  const point = async (target: HTMLElement, action: 'move' | 'click') => {
    check()
    await options.point?.({ target, action })
    check()
  }
  const setRight = async (open: boolean) => {
    const button = await waitFor(() => rightToggle() ?? undefined, '表格对话开关尚未就绪。')
    if (button.getAttribute('aria-expanded') === String(open)) return
    await point(button, 'click')
    button.click()
    await waitFor(() => rightToggle()?.getAttribute('aria-expanded') === String(open) || undefined, '表格对话未能切换。')
  }
  const composer = () => {
    const inputs = [...document.querySelectorAll<HTMLTextAreaElement>('.t8lSSG_panel textarea[data-odyssey-file-reference-session]')]
      .filter(input => input.dataset.odysseyFileReferenceSession === options.sessionId && !input.disabled && !input.readOnly && visible(input))
    return inputs.length === 1 ? inputs[0] : undefined
  }
  const write = async (input: HTMLTextAreaElement, value: string) => {
    if (input.value) throw Error('输入框已有草稿，已保留你的编辑。')
    await point(input, 'click')
    if (!input.isConnected || input.value) throw abort()
    input.focus({ preventScroll: true })
    let previous = ''
    const chunks = value.match(/.{1,3}/gu) ?? []
    const setValue = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value')!.set!
    for (const chunk of chunks) {
      check()
      if (!input.isConnected || input.value !== previous) throw Error('输入框内容已变化，演示已停止。')
      previous += chunk
      setValue.call(input, previous)
      input.dispatchEvent(new win.InputEvent('input', { bubbles: true, data: chunk, inputType: 'insertText' }))
      await options.wait(42, requestAbort.signal)
    }
  }
  const takeOver = (event: Event) => {
    const target = event.target
    if (!completed && event.isTrusted && target instanceof win.Element &&
        target.closest('.ew-sheet,.t8lSSG_panel,[data-odyssey-panel-entry="right"]')) options.onTakeover?.()
  }
  document.addEventListener('pointerdown', takeOver, true)
  document.addEventListener('beforeinput', takeOver, true)
  const end = () => {
    if (closing) return closing
    requestAbort.abort()
    document.removeEventListener('pointerdown', takeOver, true)
    document.removeEventListener('beforeinput', takeOver, true)
    if (!completed && visibleView() === workbookView) workbookView?.closeCashFlowGuideComponent()
    closing = preparing ? rpc('dispose') : Promise.resolve()
    return closing
  }
  const stopOnAbort = () => { void end().catch(() => {}) }
  options.signal.addEventListener('abort', stopOnAbort, { once: true })

  return {
    async runStep(step: string) {
      await options.waitUntilPlaying()
      if (step === 'source') {
        workbookView = await waitFor(visibleView, '示例表格尚未就绪。')
        await check().applyCashFlowGuide('source', check)
        await setRight(true)
        return
      }
      if (step === 'ask') {
        const input = await waitFor(composer, '右侧表格对话尚未就绪。')
        const prompt = HOME_SPREADSHEET_GUIDE_PROMPTS[locale]
        await write(input, prompt)
        const send = await waitFor(() => {
          const button = composer()?.closest('.uV2eYG_root')?.querySelector<HTMLButtonElement>('button.uV2eYG_primary')
          return button && !button.disabled && visible(button) ? button : undefined
        }, '表格对话发送按钮尚未就绪。')
        await point(send, 'click')
        if (composer() !== input || input.value !== prompt) throw abort()
        preparing = true
        await rpc('prepare')
        await options.waitUntilPlaying()
        await rpc('arm')
        check()
        if (composer() !== input || input.value !== prompt || !send.isConnected || send.disabled) throw abort()
        send.click()
        await rpc('accepted')
        return
      }
      if (step === 'analysis' || step === 'trend') {
        if (step === 'analysis') await options.wait(2100, requestAbort.signal)
        const target = await check().applyCashFlowGuide(step, check)
        await rpc('advance', step)
        if (target && visible(target)) await point(target, 'move')
        return
      }
      if (step === 'component') {
        await setRight(false)
        const { input, submit } = check().openCashFlowGuideComponent()
        const prompt = localeText(
          '用选区做一个现金流拆解台。拆开净利润到经营现金流的差额，点击柱子查看构成，并用滑杆试算多回款后能否达到 75% 的现金转化率。',
          'Build a cash flow bridge from the selection. Show adjustment details on click, and let me test whether collecting more receivables reaches a 75% cash conversion target.'
        )
        await write(input, prompt)
        await point(submit, 'click')
        if (input.value !== prompt || submit.disabled) throw abort()
        const card = await check().insertCashFlowGuideComponent(async () => {
          await options.wait(2300, requestAbort.signal)
          check()
        })
        if (card && visible(card)) await point(card, 'move')
        await rpc('advance', 'complete')
        await rpc('flush')
        completed = true
      }
    },
    flush: end,
    dispose() {
      options.signal.removeEventListener('abort', stopOnAbort)
      stopOnAbort()
    }
  }
}
