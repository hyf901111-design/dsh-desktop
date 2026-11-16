import {
  HOME_SPREADSHEET_GUIDE_PATH,
  HOME_SPREADSHEET_GUIDE_PROMPTS,
  HOME_SPREADSHEET_GUIDE_TREND_PROMPTS,
  HOME_SPREADSHEET_GUIDE_TREND_REFERENCE
} from '../../../packages/dsh-research-task-runtime/home-spreadsheet-guide-contract.js'
import { homeGuideTargetPoint } from '../home-guide-pointer'
import type { HomeGuideAdapter, HomeGuideMountOptions } from '../home-guides'
import type { mountSpreadsheet } from './view'

type Spreadsheet = ReturnType<typeof mountSpreadsheet>
type ReplayStage = 'analysis' | 'trend'
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
    // The active sidebar can still be moving after its aria-expanded state changes.
    // Wait for two consecutive positions before asking the pointer to travel.
    let previous: ReturnType<typeof homeGuideTargetPoint> | undefined
    await waitFor(() => {
      check()
      if (!visible(target)) { previous = undefined; return }
      const position = homeGuideTargetPoint(document, target)
      const settled = previous && Math.hypot(position.x - previous.x, position.y - previous.y) < 1
      previous = position
      return settled ? target : undefined
    }, '演示控件尚未稳定显示，请重试。')
    await options.point?.({ target, action })
    check()
  }
  const pointWhenVisible = async (target: HTMLElement, action: 'move' | 'click') => {
    check()
    // Docked controls can be painted outside the clipping rectangles used by
    // the visual cursor. The real form and its focus remain authoritative.
    if (!visible(target)) return
    try { await options.point?.({ target, action }) }
    catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('操作目标不可用')) throw error
    }
    check()
  }
  const clickControl = async (read: () => HTMLButtonElement | undefined, message: string, beforeClick?: () => void) => {
    const ready = () => {
      check()
      const target = read()
      return target?.isConnected && !target.disabled ? target : undefined
    }
    const initial = await waitFor(ready, message)
    await pointWhenVisible(initial, 'click')
    // The spreadsheet can repaint its empty state and ribbon during layout.
    // Resolve the native control again after the visual cursor has traveled.
    let current = await waitFor(ready, message)
    if (current !== initial) {
      await pointWhenVisible(current, 'click')
      current = await waitFor(ready, message)
    }
    beforeClick?.()
    current.click()
  }
  const setRight = async (open: boolean) => {
    const button = await waitFor(() => rightToggle() ?? undefined, '表格对话开关尚未就绪。')
    if (button.getAttribute('aria-expanded') === String(open)) return
    await clickControl(() => rightToggle() ?? undefined, '表格对话开关尚未就绪。')
    await waitFor(() => rightToggle()?.getAttribute('aria-expanded') === String(open) || undefined, '表格对话未能切换。')
  }
  const composer = () => {
    const inputs = [...document.querySelectorAll<HTMLTextAreaElement>('.t8lSSG_panel textarea[data-odyssey-file-reference-session]')]
      .filter(input => input.dataset.odysseyFileReferenceSession === options.sessionId && !input.disabled && !input.readOnly && visible(input))
    return inputs.length === 1 ? inputs[0] : undefined
  }
  type DraftPrefix = (input: HTMLTextAreaElement) => string | undefined
  const plainDraft = () => ''
  const rangeDraft: DraftPrefix = input => {
    const chip = input.closest('.uV2eYG_grow')?.querySelector('[data-reference-source="spreadsheet-range"]:not([data-provisional])')
    if (!chip?.textContent?.includes(HOME_SPREADSHEET_GUIDE_TREND_REFERENCE[locale])) return
    // The native input can remeasure this reference cell and replace the
    // rendered marker while the canonical draft keeps the same occurrence.
    return /^[\uFFFC\uE000-\uF8FF]\s*/u.exec(input.value)?.[0]
  }
  const matchesDraft = (input: HTMLTextAreaElement, text: string, prefix: DraftPrefix) => {
    const current = prefix(input)
    return current !== undefined && input.value === current + text
  }
  const write = async (input: HTMLTextAreaElement, value: string, optionsForWrite: {dock?: boolean; prefix?: DraftPrefix} = {}) => {
    const {dock, prefix = plainDraft} = optionsForWrite
    if (!matchesDraft(input, '', prefix)) throw Error('输入框已有草稿，已保留你的编辑。')
    await (dock ? pointWhenVisible : point)(input, 'click')
    if (!input.isConnected || !matchesDraft(input, '', prefix)) throw abort()
    input.focus({ preventScroll: true })
    let written = ''
    const chunks = value.match(/.{1,3}/gu) ?? []
    const setValue = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value')!.set!
    for (const chunk of chunks) {
      check()
      const current = prefix(input)
      if (!input.isConnected || current === undefined || input.value !== current + written) throw Error('输入框内容已变化，演示已停止。')
      written += chunk
      const next = current + written
      setValue.call(input, next)
      input.setSelectionRange(next.length, next.length)
      input.dispatchEvent(new win.InputEvent('input', { bubbles: true, data: chunk, inputType: 'insertText' }))
      await options.wait(42, requestAbort.signal)
    }
  }
  const sendPrompt = async (input: HTMLTextAreaElement, expected: string, prefix: DraftPrefix = plainDraft) => {
    const send = await waitFor(() => {
      const button = composer()?.closest('.uV2eYG_root')?.querySelector<HTMLButtonElement>('button.uV2eYG_primary')
      return button && !button.disabled && visible(button) ? button : undefined
    }, '表格对话发送按钮尚未就绪。')
    await point(send, 'click')
    if (composer() !== input || !matchesDraft(input, expected, prefix)) throw abort()
    if (!preparing) {
      preparing = true
      await rpc('prepare')
    }
    await options.waitUntilPlaying()
    await rpc('arm')
    check()
    if (composer() !== input || !matchesDraft(input, expected, prefix) || !send.isConnected || send.disabled) throw abort()
    send.click()
    await rpc('accepted')
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
    if (!completed && visibleView() === workbookView) workbookView?.closeCashFlowGuideControls()
    closing = preparing ? rpc('dispose') : Promise.resolve()
    return closing
  }
  const stopOnAbort = () => { void end().catch(() => {}) }
  options.signal.addEventListener('abort', stopOnAbort, { once: true })

  return {
    async runStep(step: string) {
      await options.waitUntilPlaying()
      if (step === 'empty') {
        workbookView = await waitFor(visibleView, '示例表格尚未就绪。')
        await waitFor(() => check().cashFlowGuideImportButton(), '空白表格尚未就绪。')
        await setRight(false)
        return
      }
      if (step === 'import-file') {
        await clickControl(() => check().cashFlowGuideImportButton(), '导入按钮尚未就绪。', () => check().armCashFlowGuideImport())
        await options.wait(850, requestAbort.signal)
        await clickControl(() => check().cashFlowGuideFileButton(), '示例文件尚未就绪。')
        await waitFor(() => check().cashFlowGuideImported || undefined, '示例 Excel 尚未导入。')
        return
      }
      if (step === 'ask') {
        await setRight(true)
        const input = await waitFor(composer, '右侧表格对话尚未就绪。')
        const prompt = HOME_SPREADSHEET_GUIDE_PROMPTS[locale]
        await write(input, prompt)
        await options.wait(850, requestAbort.signal)
        await sendPrompt(input, prompt)
        return
      }
      if (step === 'select-trend') {
        await check().dragCashFlowGuideRange('trend', options.point, check)
        return
      }
      if (step === 'ask-trend') {
        const input = await waitFor(composer, '右侧表格对话尚未就绪。')
        if (input.value) throw Error('输入框已有草稿，已保留你的编辑。')
        input.focus({preventScroll:true})
        check().referenceCashFlowGuideRange()
        await waitFor(() => matchesDraft(input, '', rangeDraft) || undefined, '表格选区未能加入对话。')
        const prompt = HOME_SPREADSHEET_GUIDE_TREND_PROMPTS[locale]
        await write(input, prompt, {prefix:rangeDraft})
        await options.wait(750, requestAbort.signal)
        await sendPrompt(input, prompt, rangeDraft)
        return
      }
      if (step === 'analysis' || step === 'trend') {
        await options.wait(1050, requestAbort.signal)
        const target = await check().applyCashFlowGuide(step, check)
        await rpc('advance', step)
        await rpc('flush')
        if (target) await pointWhenVisible(target, 'move')
        return
      }
      if (step === 'select-component') {
        await setRight(false)
        await check().dragCashFlowGuideRange('component', options.point, check)
        return
      }
      if (step === 'component') {
        if (!check().cashFlowGuideInsertButton()) {
          await clickControl(() => check().cashFlowGuideMenuButton(), '表格菜单尚未就绪。')
        }
        await clickControl(() => check().cashFlowGuideInsertButton(), '插入菜单尚未就绪。')
        await clickControl(() => check().cashFlowGuideSmartButton(), '智能组件菜单尚未就绪。')
        const { input, submit } = await waitFor(() => check().cashFlowGuideComponentForm(), '智能组件表单尚未就绪。')
        input.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        const prompt = localeText(
          '用选区做一个现金流拆解台。拆开净利润到经营现金流的差额，点击柱子查看构成，并用滑杆试算多回款后能否达到 75% 的现金转化率。',
          'Build a cash flow bridge from the selection. Show adjustment details on click, and let me test whether collecting more receivables reaches a 75% cash conversion target.'
        )
        await write(input, prompt, {dock:true})
        await options.wait(750, requestAbort.signal)
        await pointWhenVisible(submit, 'click')
        if (input.value !== prompt || submit.disabled) throw abort()
        const card = await check().insertCashFlowGuideComponent(async () => {
          await options.wait(2300, requestAbort.signal)
          check()
        })
        if (card) await pointWhenVisible(card, 'move')
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
