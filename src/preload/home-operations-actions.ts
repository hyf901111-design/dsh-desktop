import type { IntegrationBridge, SkillComposerPrefill } from '../shared/integration-ui'
import type { HomeOperationCard, HomeOperationActionContext } from './home-operations'

const REQUEST = 'sherlock:home-action-request'
const REPLY = 'sherlock:home-action-reply'
const CONTEXT_CHANGED = 'sherlock:home-action-context-changed'
const SUBJECT = '\u3000'.repeat(6)
const SKILLS = { ppt: 'builtin:efund-ppt-maker', report: 'builtin:ework-equity-research' } as const

function prefill(card: 'ppt' | 'report', english: boolean): SkillComposerPrefill {
  const text = english
    ? card === 'ppt'
      ? `Create a company-branded presentation about “${SUBJECT}” for an internal briefing.\nOutline the key messages and slide structure, then apply the company brand and template to the layout, charts and visuals. Keep the language concise and deliver an editable PowerPoint file. Identify missing information instead of inventing it.`
      : `Produce a research report on “${SUBJECT}”.\nDefine the research questions and analytical framework, verify the supporting information and data, and distinguish facts, judgments and assumptions. Cite sources and dates, explain risks and information gaps, and deliver a structured report in HTML and PDF.`
    : card === 'ppt'
      ? `请围绕「${SUBJECT}」制作一份符合公司品牌与模板规范的PPT，用于内部汇报。\n先梳理核心观点和页面大纲，再完成排版、图表与配图；语言简洁、重点清晰，并交付可编辑PPT文件。资料缺口请明确列出，不要编造。`
      : `请围绕研究主题「${SUBJECT}」撰写一份专业研究报告。\n先明确研究问题与分析框架，再检索并核对资料，结合数据形成结论；区分事实、判断和假设，标注来源与日期，并说明主要风险和信息缺口。请交付结构完整、可审阅的HTML和PDF报告。`
  const selectionStart = text.indexOf(SUBJECT)
  return { text, selectionStart, selectionEnd: selectionStart + SUBJECT.length }
}

/** Uses native navigation and verified skill references; never submits a prompt. */
export function createHomeOperationsActions(document: Document, bridge: Pick<IntegrationBridge, 'request' | 'useSkill'>) {
  const win = document.defaultView!
  const pending = new Set<AbortController>()
  const navigationRequests = new Map<AbortSignal, string>()
  let disposed = false
  const cancelled = () => Error('页面或对话已变化，请重新点击卡片。')
  const check = (signal: AbortSignal) => { if (disposed || signal.aborted) throw cancelled() }
  const awaitActive = <T>(operation: Promise<T>, signal: AbortSignal) => new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(cancelled()) }
    if (signal.aborted) { reject(cancelled()); return }
    signal.addEventListener('abort', abort, { once: true })
    operation.then(value => { signal.removeEventListener('abort', abort); if (signal.aborted) reject(cancelled()); else resolve(value) }, error => { signal.removeEventListener('abort', abort); reject(error) })
  })
  const navigate = (action: 'research' | 'notes' | 'composer', signal: AbortSignal) => new Promise<{ sessionId: string; draftRev?: number }>((resolve, reject) => {
    check(signal)
    const requestId = win.crypto.randomUUID()
    const cleanup = () => { navigationRequests.delete(signal); win.removeEventListener(REPLY, reply); signal.removeEventListener('abort', abort); win.clearTimeout(timer) }
    const cancel = () => win.dispatchEvent(new win.CustomEvent(REQUEST, { detail: { requestId, action: 'cancel' } }))
    const abort = () => { cleanup(); cancel(); reject(cancelled()) }
    const reply = (event: Event) => {
      const result = (event as CustomEvent).detail
      if (result?.requestId !== requestId) return
      cleanup()
      if (result.ok && typeof result.sessionId === 'string' && result.sessionId && (action !== 'composer' || (Number.isSafeInteger(result.draftRev) && result.draftRev >= 0))) resolve({ sessionId: result.sessionId, draftRev: result.draftRev })
      else reject(Error(result.message || '暂时无法打开，请稍后重试。'))
    }
    const timer = win.setTimeout(() => { cleanup(); cancel(); reject(Error('对话尚未就绪，请稍后重试。')) }, 8000)
    signal.addEventListener('abort', abort, { once: true })
    win.addEventListener(REPLY, reply)
    navigationRequests.set(signal, requestId)
    win.dispatchEvent(new win.CustomEvent(REQUEST, { detail: { requestId, action } }))
  })
  const contextChanged = (event: Event) => {
    const ownedRequestId = (event as CustomEvent).detail?.ownedRequestId
    for (const controller of pending) {
      // Only opening a session for this exact navigation request may continue.
      // Every other context change invalidates the whole action, including A→B→A.
      if (typeof ownedRequestId === 'string' && navigationRequests.get(controller.signal) === ownedRequestId) continue
      controller.abort()
    }
  }
  win.addEventListener(CONTEXT_CHANGED, contextChanged)
  const run = async (card: HomeOperationCard, context: HomeOperationActionContext): Promise<void> => {
    if (disposed || context.signal.aborted) throw cancelled()
    const controller = new win.AbortController()
    const abort = () => controller.abort()
    context.signal.addEventListener('abort', abort, { once: true })
    pending.add(controller)
    const signal = controller.signal
    try {
      if (card === 'board' || card === 'note') { await navigate(card === 'board' ? 'research' : 'notes', signal); return }
      if (card !== 'ppt' && card !== 'report') throw Error('卡片操作无效，请重试。')
      await awaitActive(context.revealComposer(), signal)
      check(signal)
      const { sessionId, draftRev } = await navigate('composer', signal)
      check(signal)
      const result = await awaitActive(bridge.request({ type: 'snapshot' }), signal)
      check(signal)
      if (result.type !== 'snapshot') throw Error('技能列表暂不可用，请重试。')
      const skill = result.snapshot.rows.find(row => row.kind === 'skill' && row.id === SKILLS[card])
      if (!skill?.enabled) throw Error(card === 'ppt' ? '请先在技能中启用“PPT制作助手”。' : '请先在技能中启用“研报写作”。')
      if (!bridge.useSkill) throw Error('技能输入暂不可用，请稍后重试。')
      await bridge.useSkill({ id: skill.id, revision: skill.revision, name: skill.name, invocationName: skill.invocationName ?? '', sessionId, expectedDraftRev: draftRev, signal, prefill: prefill(card, document.documentElement.dataset.odysseyLocale === 'en') })
      check(signal)
    } finally {
      context.signal.removeEventListener('abort', abort)
      pending.delete(controller)
    }
  }
  const reset = () => { for (const controller of pending) controller.abort(); pending.clear() }
  return { run, reset, dispose: () => { disposed = true; win.removeEventListener(CONTEXT_CHANGED, contextChanged); reset() } }
}
