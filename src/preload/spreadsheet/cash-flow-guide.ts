import {
  HOME_SPREADSHEET_GUIDE_PATH,
  HOME_SPREADSHEET_GUIDE_PROMPTS,
  HOME_SPREADSHEET_GUIDE_TREND_PROMPTS,
  HOME_SPREADSHEET_GUIDE_TREND_REFERENCE
} from '../../../packages/dsh-research-task-runtime/home-spreadsheet-guide-contract.js'
import { homeGuideTargetPoint, type HomeGuidePointerAction } from '../home-guide-pointer'
import type { HomeGuideAdapter, HomeGuideMountOptions } from '../home-guides'
import type { mountSpreadsheet } from './view'

type Spreadsheet = ReturnType<typeof mountSpreadsheet>
type SpreadsheetView = NonNullable<ReturnType<Spreadsheet['cashFlowGuideView']>>
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
  let workbookView: SpreadsheetView | undefined
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
  const moveWhenVisible = async (target: HTMLElement) => {
    check()
    if (!visible(target)) return
    try { await options.point?.({ target, action:'move' }) }
    catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('操作目标不可用')) throw error
    }
    check()
  }
  const clickAt = async (target: HTMLElement, onClick: () => void, targetPoint?: HomeGuidePointerAction['targetPoint']) => {
    const readPoint = () => {
      check()
      const fallback = homeGuideTargetPoint(document, target)
      const point = targetPoint?.() ?? fallback
      const hit = document.elementFromPoint?.(point.x, point.y)
      if (hit && !target.contains(hit)) throw Error('操作目标不可用，当前控件被遮挡。')
      return point
    }
    if (options.point) await options.point({ target, action:'click', hover:'none', targetPoint:readPoint, onClick })
    else { readPoint(); onClick() }
    check()
  }
  const clickControl = async (read: () => HTMLButtonElement | undefined, message: string, beforeClick?: () => void) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const target = await waitFor(() => {
        check()
        const control = read()
        return control && visible(control) ? control : undefined
      }, message)
      let clicked = false
      try {
        await clickAt(target, () => {
          if (read() !== target || !target.isConnected || target.disabled) return
          beforeClick?.()
          target.click()
          clicked = true
        })
      } catch (error) {
        if (clicked || !(error instanceof Error) || !error.message.startsWith('操作目标不可用') || read() === target) throw error
      }
      if (clicked) return
    }
    throw Error(message)
  }
  const ensureRightOpen = async () => {
    const button = await waitFor(() => rightToggle() ?? undefined, '表格对话开关尚未就绪。')
    if (button.getAttribute('aria-expanded') === 'true') return
    await clickControl(() => rightToggle() ?? undefined, '表格对话开关尚未就绪。')
    await waitFor(() => rightToggle()?.getAttribute('aria-expanded') === 'true' || undefined, '表格对话未能打开。')
  }
  const composer = () => {
    const inputs = [...document.querySelectorAll<HTMLTextAreaElement>('.t8lSSG_panel textarea[data-odyssey-file-reference-session]')]
      .filter(input => input.dataset.odysseyFileReferenceSession === options.sessionId && !input.disabled && !input.readOnly && visible(input))
    return inputs.length === 1 ? inputs[0] : undefined
  }
  type DraftPrefix = (input: HTMLTextAreaElement) => string | undefined
  const plainDraft = () => ''
  const rangeChip = (input: HTMLTextAreaElement) =>
    input.closest('.uV2eYG_grow')?.querySelector<HTMLElement>('[data-reference-source="spreadsheet-range"]')
  const rangeDraft: DraftPrefix = input => {
    const chip = rangeChip(input)
    if (chip?.hasAttribute('data-provisional') || !chip?.textContent?.includes(HOME_SPREADSHEET_GUIDE_TREND_REFERENCE[locale])) return
    // The native input can remeasure this reference cell and replace the
    // rendered marker while the canonical draft keeps the same occurrence.
    return /^[\uFFFC\uE000-\uF8FF]\s*/u.exec(input.value)?.[0]
  }
  const matchesDraft = (input: HTMLTextAreaElement, text: string, prefix: DraftPrefix) => {
    const current = prefix(input)
    return current !== undefined && input.value === current + text
  }
  const caretPoint = (input: HTMLTextAreaElement, chip?: HTMLElement | null) => {
    const box = input.getBoundingClientRect(), style = win.getComputedStyle(input)
    const pixels = (value: string) => parseFloat(value) || 0
    const font = pixels(style.fontSize) || 16, line = pixels(style.lineHeight) || font * 1.5
    const left = box.left + pixels(style.borderLeftWidth) + pixels(style.paddingLeft) + 2
    const top = box.top + pixels(style.borderTopWidth) + pixels(style.paddingTop)
    const label = (chip?.querySelector('.uV2eYG_chipLabel') ?? chip)?.getBoundingClientRect()
    const after = (label?.right ?? left) + font * .3
    const lineCenter = label ? (label.top + label.bottom) / 2 : top + line / 2
    const fits = after + font <= box.right - pixels(style.paddingRight)
    return {
      x: Math.max(box.left + 1, Math.min(box.right - 1, label && fits ? after : left)),
      y: Math.max(box.top + 1, Math.min(box.bottom - 1, lineCenter + (label && !fits ? line : 0)))
    }
  }
  const write = async (input: HTMLTextAreaElement, value: string, useRange = false) => {
    if (input.value) throw Error('输入框已有草稿，已保留你的编辑。')
    const prefix = useRange ? rangeDraft : plainDraft
    const caret = () => caretPoint(input, useRange ? rangeChip(input) : undefined)
    let clickedAt: ReturnType<typeof caret> | undefined
    await clickAt(input, () => {
      if (!input.isConnected || input.value) throw abort()
      clickedAt = caret()
      input.focus({ preventScroll: true })
      if (useRange) check().referenceCashFlowGuideRange()
    }, caret)
    await waitFor(() => matchesDraft(input, '', prefix) || undefined, '输入框尚未就绪。')
    const typingAt = caret()
    if (clickedAt && Math.hypot(typingAt.x - clickedAt.x, typingAt.y - clickedAt.y) > 4) {
      await options.point?.({ target:input, action:'move', hover:'none', targetPoint:caret })
    }
    let written = ''
    const chunks = value.match(/.{1,2}/gu) ?? []
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
      await options.wait(58, requestAbort.signal)
    }
  }
  const sendPrompt = async (input: HTMLTextAreaElement, expected: string, prefix: DraftPrefix = plainDraft) => {
    if (composer() !== input || !matchesDraft(input, expected, prefix)) throw abort()
    if (!preparing) {
      preparing = true
      await rpc('prepare')
    }
    await options.waitUntilPlaying()
    await rpc('arm')
    await clickControl(() => composer()?.closest('.uV2eYG_root')?.querySelector<HTMLButtonElement>('button.uV2eYG_primary') ?? undefined, '表格对话发送按钮尚未就绪。', () => {
      if (composer() !== input || !matchesDraft(input, expected, prefix)) throw abort()
    })
    await rpc('accepted')
  }
  const takeOver = (event: Event) => {
    const target = event.target
    if (!completed && event.isTrusted && target instanceof win.Element &&
        target.closest('.ew-sheet,.t8lSSG_panel,[data-odyssey-panel-entry="right"],[data-component-menu-surface="spreadsheet"]')) options.onTakeover?.()
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
        await ensureRightOpen()
        return
      }
      if (step === 'import-file') {
        await clickControl(() => check().cashFlowGuideImportButton(), '导入按钮尚未就绪。', () => check().armCashFlowGuideImport(async () => {
          await options.wait(1500, requestAbort.signal)
          check()
        }))
        await options.wait(2200, requestAbort.signal)
        await clickControl(() => check().cashFlowGuideFileButton(), '示例文件尚未就绪。')
        await waitFor(() => check().cashFlowGuideImported || undefined, '示例 Excel 尚未导入。')
        return
      }
      if (step === 'ask') {
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
        const prompt = HOME_SPREADSHEET_GUIDE_TREND_PROMPTS[locale]
        await write(input, prompt, true)
        await options.wait(750, requestAbort.signal)
        await sendPrompt(input, prompt, rangeDraft)
        return
      }
      if (step === 'analysis' || step === 'trend') {
        await options.wait(1050, requestAbort.signal)
        const target = await check().applyCashFlowGuide(step, check)
        await rpc('advance', step)
        await rpc('flush')
        if (target) await moveWhenVisible(target)
        return
      }
      if (step === 'select-component') {
        await check().dragCashFlowGuideRange('component', options.point, check)
        return
      }
      if (step === 'open-component') {
        if (!visible(check().cashFlowGuideInsertButton())) {
          await clickControl(() => check().cashFlowGuideMenuButton(), '表格菜单尚未就绪。')
          await options.wait(1050, requestAbort.signal)
        }
        await clickControl(() => check().cashFlowGuideInsertButton(), '插入菜单尚未就绪。')
        await options.wait(1500, requestAbort.signal)
        await clickControl(() => check().cashFlowGuideSmartButton(), '智能组件菜单尚未就绪。')
        return
      }
      if (step === 'component') {
        const { input, submit } = await waitFor(() => check().cashFlowGuideComponentForm(), '智能组件表单尚未就绪。')
        input.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        const prompt = localeText(
          '用选区做一个现金流拆解台。拆开净利润到经营现金流的差额，点击柱子查看构成，并用滑杆试算多回款后能否达到 75% 的现金转化率。',
          'Build a cash flow bridge from the selection. Show adjustment details on click, and let me test whether collecting more receivables reaches a 75% cash conversion target.'
        )
        await write(input, prompt)
        await options.wait(1350, requestAbort.signal)
        let inserting: ReturnType<SpreadsheetView['insertCashFlowGuideComponent']> | undefined
        await clickAt(submit, () => {
          check()
          if (input.value !== prompt || submit.disabled) throw abort()
          inserting = check().insertCashFlowGuideComponent(async () => {
            await options.wait(2600, requestAbort.signal)
            check()
          })
          void inserting.catch(() => {})
        })
        const card = await inserting
        if (card) await moveWhenVisible(card)
        return
      }
      if (step === 'component-theme') {
        await clickControl(() => check().cashFlowGuideThemeControl('more'), '组件更多操作尚未就绪。')
        await options.wait(850, requestAbort.signal)
        await clickControl(() => check().cashFlowGuideThemeControl('theme'), '组件主题菜单尚未就绪。')
        await options.wait(850, requestAbort.signal)
        await clickControl(() => check().cashFlowGuideThemeControl('theme-enterprise'), '易方达主题尚未就绪。')
        await waitFor(() => check().cashFlowGuideEnterpriseThemeSaved || undefined, '易方达主题尚未保存。')
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
