import styles from './home-operations.css?raw'
import { OPERATIONS_CASE_GLOWS, OPERATIONS_ILLUSTRATIONS, OPERATIONS_TREND_UP } from './home-operations-assets'
import { createHomeOperationsCarousel, type HomeOperationsCarousel } from './home-operations-carousel'
import { createHomeOperationsCaseTransition, type HomeOperationsCaseTransition } from './home-operations-case-transition'

type Section = 'input' | 'operations'
type Motion = 'idle' | 'settling'
export type HomeOperationCard = 'board' | 'note' | 'ppt' | 'report'
export type HomeOperationActionContext = { signal: AbortSignal; revealComposer(): Promise<void> }
type Card = HomeOperationCard
type Options = { onAction?(card: Card, context: HomeOperationActionContext): Promise<void>; onExample?(card: Exclude<Card, 'report'>, context: HomeOperationActionContext): Promise<void> }
const mounted = new WeakMap<Document, () => void>()
const STYLE_ID = 'sherlock-home-operations-style'
const DESIGN_WIDTH = 780
const DESIGN_HEIGHT = 382
const MOTION_FREQUENCY = 14
const smootherStep = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * t * (t * (t * 6 - 15) + 10)
}
const CARDS: Card[] = ['board', 'note', 'ppt', 'report']
const COPY = {
  zh: {
    heading: '快速开始', down: '切换到快速开始', up: '返回输入区', pagination: '用例切换',
    cards: ['创建研究看板', '撰写研究笔记', '制作演示文稿', '制作研究报告'],
    cases: [
      ['快速创建', '自选行情看板', '通过研究模式，快速创建自选行情看板，以了解研究看板基础功能。'],
      ['观点挑战', '体验有AI护航文档', '打开示例笔记，体验 AI 追问观点、\n核查事实，发现研究中的盲点。'],
      ['演示文稿', '了解PPT制作能力', '通过案例回看从需求到成稿的过程，\n了解 EWork 制作 PPT 的效果。']
    ]
  },
  en: {
    heading: 'Quick start', down: 'Show quick start', up: 'Return to the composer', pagination: 'Examples',
    cards: ['Create a research board', 'Write research notes', 'Create a presentation', 'Create a research report'],
    cases: [
      ['Quick create', 'Watchlist dashboard', 'Create a watchlist dashboard in Research to explore the basics of research boards.'],
      ['Challenge your views', 'Explore AI-assisted notes', 'Open an example note to see AI question ideas,\ncheck facts and uncover blind spots.'],
      ['Presentations', 'Explore presentation creation', 'Follow an example from brief to finished slides\nto see what EWork can create.']
    ]
  }
} as const

/** Owns homepage presentation; native action adapters retain session and draft state. */
export function mountHomeOperations(doc: Document = document, options: Options = {}): () => void {
  const existing = mounted.get(doc)
  if (existing) return existing
  const win = doc.defaultView
  if (!win || !doc.body) return () => {}
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = styles
  doc.documentElement.append(style)
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)')
  let disposed = false, visible = false, state: Section = 'input', caseIndex = 0
  let host: HTMLElement | null = null, root: HTMLElement | null = null, hero: HTMLElement | null = null
  let heroWasInert = false
  let section: HTMLElement | null = null, toggle: HTMLButtonElement | null = null
  let heading: HTMLElement | null = null
  let usecase: HTMLElement | null = null, exampleButton: HTMLButtonElement | null = null
  let carousel: HomeOperationsCarousel | null = null
  let caseTransition: HomeOperationsCaseTransition | null = null
  let frame = 0, motionFrame = 0, lastMotionTime = 0
  let progress = 0, renderedHeroOffset = 0, motion: Motion = 'idle', intent: Section = 'input'
  let targetProgress = 0, velocity = 0
  let wheelTime = 0, wheelDirection = 0, wheelDistance = 0, wheelConsumed = false, wheelNavigated = false
  let geometry = { inputTop: 0, targetTop: 0, shift: 1, scale: 1, viewportHeight: 0 }
  let renderedLocale = '', renderedTheme = ''
  let actionController: AbortController | null = null
  let feedback: HTMLElement | null = null, feedbackTimer = 0
  const quickCards: HTMLButtonElement[] = [], pages: HTMLButtonElement[] = []
  const pointerFrames = new Map<HTMLElement, number>()
  const illustrationTimers = new Map<HTMLElement, number>()
  const tiltStates = new Map<HTMLElement, { rx: number, ry: number, targetX: number, targetY: number, lastTime: number }>()
  const variables = ['--odyssey-operations-top', '--odyssey-operations-input-top', '--odyssey-operations-center-x', '--odyssey-operations-shift', '--odyssey-operations-scale', '--odyssey-operations-viewport-height', '--odyssey-operations-toggle-top', '--odyssey-operations-available-height', '--odyssey-operations-edge-start', '--odyssey-operations-duration', '--odyssey-operations-progress-value', '--odyssey-operations-scroll-progress', '--odyssey-operations-offset', '--odyssey-operations-hero-offset', '--odyssey-operations-hero-opacity', '--odyssey-operations-opacity']
  const locale = () => doc.documentElement.dataset.odysseyLocale === 'en' ? 'en' : 'zh'
  const copy = () => COPY[locale()]
  const css = (name: string, value: string) => {
    if (host && host.style.getPropertyValue(name) !== value) host.style.setProperty(name, value)
  }
  const shown = (element: Element | null): boolean => {
    if (!element?.isConnected) return false
    for (let node: Element | null = element; node; node = node.parentElement) {
      const computed = win.getComputedStyle(node)
      if ((node as HTMLElement).hidden || node.getAttribute('aria-hidden') === 'true' || computed.display === 'none' || computed.visibility === 'hidden') return false
    }
    return true
  }
  const settingsShown = () => [...doc.querySelectorAll('.VOzbGW_overlay,[data-sherlock-settings-panel]')].some(shown)
  const popupShown = () => [...doc.querySelectorAll('[role="menu"],[role="listbox"],[role="dialog"],[aria-modal="true"]')].some(shown)
  const own = (node: Node): boolean => node === section || node === toggle || !!section?.contains(node) || !!toggle?.contains(node)
  const clearIllustrationBlend = (card: HTMLElement) => {
    const pending = illustrationTimers.get(card)
    if (pending) win.clearTimeout(pending)
    illustrationTimers.delete(card)
    delete card.dataset.odysseyOperationsIllustrationBlending
  }
  const clearIllustrationBlends = () => {
    for (const card of illustrationTimers.keys()) clearIllustrationBlend(card)
  }
  const clearPointers = () => {
    for (const pending of pointerFrames.values()) win.cancelAnimationFrame(pending)
    for (const card of [...quickCards, ...(usecase ? [usecase] : [])]) {
      card.style.removeProperty('--rx'); card.style.removeProperty('--ry')
      delete card.dataset.odysseyOperationsTilting
    }
    pointerFrames.clear()
    tiltStates.clear()
  }
  const resetWheel = () => {
    wheelTime = wheelDirection = wheelDistance = 0
    wheelConsumed = wheelNavigated = false
  }
  const restoreHero = () => {
    if (!hero) return
    hero.inert = heroWasInert
    hero.removeAttribute('data-odyssey-operations-composer')
  }
  const updateGlow = () => {
    if (!usecase) return
    const theme = doc.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
    for (const layer of usecase.querySelectorAll<HTMLElement>('[data-odyssey-operations-case-layer]')) {
      const index = Number(layer.dataset.case)
      layer.style.setProperty('--odyssey-operations-glow-two-image', `url("${OPERATIONS_CASE_GLOWS[theme][index]}")`)
    }
  }
  const updateCase = () => {
    const selected = copy().cases[caseIndex]!
    for (const layer of usecase?.querySelectorAll<HTMLElement>('[data-odyssey-operations-case-layer]') || []) {
      const text = copy().cases[Number(layer.dataset.case)]!
      layer.querySelector('.odyssey-operations-title strong')!.textContent = text[0]
      layer.querySelector('.odyssey-operations-subtitle')!.textContent = text[1]
      layer.querySelector('.odyssey-operations-description')!.textContent = text[2]
    }
    if (usecase) { usecase.dataset.case = String(caseIndex); usecase.setAttribute('aria-label', `${selected[0]} · ${selected[1]}`) }
    exampleButton?.setAttribute('aria-label', (locale() === 'en' ? 'Play example: ' : '播放示例：') + selected[1])
    for (const [index, button] of pages.entries()) {
      button.setAttribute('aria-label', copy().cases[index]![1])
      button.setAttribute('aria-pressed', String(index === caseIndex))
    }
    updateGlow()
  }
  const updateLabels = () => {
    const localeChanged = renderedLocale !== locale()
    renderedLocale = locale()
    const text = copy()
    section?.setAttribute('aria-label', text.heading)
    if (heading) heading.textContent = text.heading
    section?.querySelector('.odyssey-operations-pagination')?.setAttribute('aria-label', text.pagination)
    for (const [index, button] of quickCards.entries()) {
      button.querySelector('.odyssey-operations-quick-label')!.textContent = text.cards[index]!
      button.setAttribute('aria-label', text.cards[index]!)
    }
    const label = (motion === 'idle' ? state : intent) === 'input' ? text.down : text.up
    if (toggle) { toggle.setAttribute('aria-label', label); toggle.title = label }
    if (localeChanged) updateCase()
  }
  const updateImages = () => {
    const theme = doc.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
    renderedTheme = theme
    for (const button of quickCards) {
      const card = button.dataset.card as Card
      for (const image of button.querySelectorAll<HTMLImageElement>('img.normal')) image.src = OPERATIONS_ILLUSTRATIONS[theme].normal[card]
      for (const image of button.querySelectorAll<HTMLImageElement>('img.colored')) image.src = OPERATIONS_ILLUSTRATIONS[theme].hover[card]
    }
    updateGlow()
  }
  const cancelSettlement = () => {
    if (motionFrame) win.cancelAnimationFrame(motionFrame)
    motionFrame = 0; lastMotionTime = 0
  }
  const paint = () => {
    if (!visible || !host || !hero || !section || !toggle) return
    progress = Math.max(0, Math.min(1, progress))
    const collapsed = progress <= .0001, expanded = progress >= .9999
    if (collapsed || expanded) {
      const endpoint = expanded ? 'operations' : 'input'
      if (state !== endpoint || host.dataset.odysseyHomeOperationsState !== endpoint) {
        state = endpoint; host.dataset.odysseyHomeOperationsState = endpoint; updateLabels()
      }
      if (collapsed) { section.scrollTop = 0; clearIllustrationBlends() }
    }
    host.dataset.odysseyHomeOperationsMotion = motion
    const heroProgress = smootherStep(progress / .86)
    const cardsProgress = smootherStep((progress - .14) / .86)
    renderedHeroOffset = geometry.shift * heroProgress
    css('--odyssey-operations-progress-value', String(progress))
    css('--odyssey-operations-scroll-progress', String(cardsProgress))
    css('--odyssey-operations-hero-offset', `${renderedHeroOffset}px`)
    css('--odyssey-operations-offset', `${geometry.shift * cardsProgress}px`)
    css('--odyssey-operations-hero-opacity', String(1 - heroProgress))
    css('--odyssey-operations-opacity', String(cardsProgress))
    section.hidden = collapsed
    section.inert = !expanded
    section.setAttribute('aria-hidden', String(!expanded))
    hero.inert = !collapsed || heroWasInert
    toggle.setAttribute('aria-expanded', String(intent === 'operations'))
    for (const button of [...quickCards, ...pages, ...(exampleButton ? [exampleButton] : [])]) button.tabIndex = expanded ? 0 : -1
    caseTransition?.setVisible(visible && !section.hidden && cardsProgress > .0001)
    carousel?.setVisible(visible && expanded && motion === 'idle' && !section.hidden && shown(section))
  }
  const startMotion = () => {
    if (reduced.matches) { progress = targetProgress; velocity = 0; paint(); return }
    if (motionFrame) return
    lastMotionTime = win.performance.now()
    const step = (now: number) => {
      motionFrame = 0
      if (disposed || !visible) return
      const elapsed = Math.max(.001, Math.min(.05, (now - lastMotionTime) / 1000))
      lastMotionTime = now
      // Exact integration of a critically damped position/velocity system.
      // Retargeting changes its force, preserving the visible position and speed.
      const displacement = progress - targetProgress
      const response = velocity + MOTION_FREQUENCY * displacement
      const decay = Math.exp(-MOTION_FREQUENCY * elapsed)
      progress = targetProgress + (displacement + response * elapsed) * decay
      velocity = (velocity - MOTION_FREQUENCY * response * elapsed) * decay
      const endpoint = targetProgress === 0 || targetProgress === 1
      const resting = Math.abs(targetProgress - progress) < (endpoint ? .008 : .00002) && Math.abs(velocity) < (endpoint ? .12 : .0005)
      if (resting) {
        progress = targetProgress; velocity = 0
        if (endpoint) motion = 'idle'
      }
      paint()
      if (!resting) motionFrame = win.requestAnimationFrame(step)
      else lastMotionTime = 0
    }
    motionFrame = win.requestAnimationFrame(step)
  }
  const measure = () => {
    if (!visible || !host || !hero || !section) return
    const bounds = host.getBoundingClientRect(), composer = hero.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0 || composer.width <= 0) return
    const pixelRatio = win.devicePixelRatio || 1
    const snap = (coordinate: number) => Math.round(coordinate * pixelRatio) / pixelRatio
    const header = root?.querySelector<HTMLElement>('.wSkVaW_header,[data-srb-session-header]')
    const headerBottom = header ? Math.max(0, header.getBoundingClientRect().bottom - bounds.top) : 44
    const dock = host.querySelector<HTMLElement>('[data-odyssey-theme-dock]')
    const toggleHeight = toggle ? Number.parseFloat(win.getComputedStyle(toggle).height) || 32 : 32
    let toggleTop = bounds.height - 104
    if (dock) {
      const dockStyle = win.getComputedStyle(dock)
      // Use the expanded envelope even while the dock is collapsed or moving.
      const expandedBottom = Number.parseFloat(dockStyle.getPropertyValue('--theme-dock-bottom'))
      const dockScale = Number.parseFloat(dockStyle.getPropertyValue('--theme-dock-scale'))
      const dockHeight = Number.parseFloat(dockStyle.height) || dock.offsetHeight || 64
      toggleTop = bounds.height - (Number.isFinite(expandedBottom) ? expandedBottom : 24) - dockHeight * (Number.isFinite(dockScale) ? dockScale : 1) - 44 - toggleHeight
    }
    // The collection belongs to the pane, independently of the native input's
    // narrower max-width when the file panel is open.
    const paneWidth = Math.max(1, bounds.width - 48)
    const stacked = bounds.width < 550, fluid = !stacked && paneWidth < DESIGN_WIDTH
    host.dataset.odysseyHomeOperationsLayout = stacked ? 'stacked' : fluid ? 'fluid' : 'wide'
    const minimumTop = Math.max(stacked ? 56 : 64, headerBottom + (stacked ? 16 : 24))
    const bottomLimit = toggleTop - (stacked ? 16 : 24)
    const availableHeight = Math.max(96, bottomLimit - minimumTop)
    const heightScale = Math.max(.22, (bottomLimit - minimumTop) / DESIGN_HEIGHT)
    const scale = stacked || fluid ? 1 : Math.max(.2, Math.min(1, heightScale))
    const physicalWidth = stacked ? Math.max(1, bounds.width - 32) : fluid ? paneWidth : DESIGN_WIDTH * scale
    const viewportHeight = stacked ? Math.min(620, availableHeight)
      : fluid ? Math.min(availableHeight, (locale() === 'en' ? 346 : Math.max(260, Math.min(346, Math.round(physicalWidth * .5)))) + 36)
      : DESIGN_HEIGHT * scale
    const centeredLeft = snap(bounds.left + (bounds.width - physicalWidth) / 2) - bounds.left
    const centeredTop = stacked || fluid ? (bounds.height - viewportHeight) / 2 - 18 : (bounds.height - 346 * scale) / 2 - 36 * scale
    const targetTop = snap(bounds.top + Math.max(minimumTop, Math.min(centeredTop, bottomLimit - viewportHeight))) - bounds.top
    // Space from the visible input surface, excluding the hero's transparent
    // bottom padding. Re-query because the resident composer can replace slots.
    const inputCard = hero.querySelector<HTMLElement>('.uV2eYG_card')?.getBoundingClientRect()
    const inputBottom = inputCard && inputCard.width > 0 && inputCard.height > 0 ? inputCard.bottom + 20 : composer.bottom + 28
    // Restore the native layout coordinate using our last painted offset.
    const inputTop = snap(inputBottom + renderedHeroOffset) - bounds.top
    geometry = { inputTop, targetTop, shift: Math.max(1, inputTop - targetTop), scale, viewportHeight }
    css('--odyssey-operations-top', `${inputTop}px`)
    css('--odyssey-operations-input-top', `${inputTop}px`)
    css('--odyssey-operations-center-x', `${centeredLeft + physicalWidth / 2}px`)
    css('--odyssey-operations-shift', `${geometry.shift}px`)
    css('--odyssey-operations-scale', String(scale))
    css('--odyssey-operations-viewport-height', `${viewportHeight}px`)
    css('--odyssey-operations-toggle-top', `${snap(bounds.top + toggleTop) - bounds.top}px`)
    css('--odyssey-operations-available-height', `${Math.max(0, bounds.height - headerBottom)}px`)
    css('--odyssey-operations-edge-start', `${Math.max(headerBottom, bounds.height - 140)}px`)
    paint()
  }
  const setSection = (next: Section, force = false) => {
    if (!visible || !host || !hero || !section || !toggle) return false
    intent = next
    clearPointers()
    targetProgress = next === 'operations' ? 1 : 0
    if (force || reduced.matches) {
      cancelSettlement(); progress = targetProgress; velocity = 0; motion = 'idle'; updateLabels(); measure()
      return true
    }
    motion = 'settling'; updateLabels(); paint()
    startMotion()
    return true
  }
  const toggleSection = () => setSection((motion === 'idle' ? state : intent) === 'input' ? 'operations' : 'input')
  const clearFeedback = () => {
    if (feedbackTimer) win.clearTimeout(feedbackTimer)
    feedbackTimer = 0; feedback?.remove(); feedback = null
  }
  const setActionBusy = (busy: boolean) => {
    section?.setAttribute('aria-busy', String(busy))
    for (const card of [...quickCards, ...(exampleButton ? [exampleButton] : [])]) card.disabled = busy
  }
  const revealComposer = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal.aborted || !setSection('input')) { reject(Error('首页已变化，请重新点击卡片。')); return }
    let pendingFrame = 0
    const started = win.performance.now()
    const cleanup = () => { if (pendingFrame) win.cancelAnimationFrame(pendingFrame); signal.removeEventListener('abort', abort) }
    const abort = () => { cleanup(); reject(Error('本次卡片操作已取消。')) }
    const check = () => {
      pendingFrame = 0
      if (signal.aborted || disposed || !visible || !hero) { abort(); return }
      if (motion === 'idle' && state === 'input' && !hero.inert && shown(hero)) { cleanup(); resolve(); return }
      if (win.performance.now() - started > 4000) { cleanup(); reject(Error('输入框暂未就绪，请重试。')); return }
      pendingFrame = win.requestAnimationFrame(check)
    }
    signal.addEventListener('abort', abort, { once: true })
    check()
  })
  const runAction = async (card: Card, example = false) => {
    if ((example ? !options.onExample : !options.onAction) || actionController || !visible || motion !== 'idle' || state !== 'operations') return
    clearFeedback()
    const controller = new win.AbortController()
    actionController = controller; setActionBusy(true)
    try {
      const context = { signal: controller.signal, revealComposer: () => revealComposer(controller.signal) }
      if (example && card !== 'report') await options.onExample!(card, context)
      else await options.onAction!(card, context)
    }
    catch (error) {
      if (controller.signal.aborted || disposed) return
      feedback = doc.createElement('div'); feedback.dataset.odysseyOperationsFeedback = ''; feedback.setAttribute('role', 'alert')
      feedback.textContent = error instanceof Error ? error.message : '操作暂时无法完成，请稍后重试。'
      feedback.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;max-width:min(440px,calc(100vw - 40px));padding:10px 16px;border-radius:10px;background:#262729;color:#fff;box-shadow:0 8px 28px #0003;font:14px/22px system-ui;pointer-events:none'
      doc.body.append(feedback)
      feedbackTimer = win.setTimeout(clearFeedback, 8000)
    } finally {
      if (actionController === controller) { actionController = null; setActionBusy(false) }
    }
  }
  const preserveNativeWheel = (target: EventTarget | null) => {
    if (!(target instanceof win.Element) || !host?.contains(target)) return true
    if (target.closest('textarea,input,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="menu"],[role="listbox"],[role="dialog"],[data-odyssey-theme-dock]')) return true
    const control = target.closest('button,a,[role="button"],[role="slider"],[role="combobox"]')
    if (control && !own(control)) return true
    // The stacked collection owns its complete scroll gesture, including edges.
    if (host.dataset.odysseyHomeOperationsLayout === 'stacked' && section?.contains(target)) return true
    for (let node: Element | null = target; node && node !== host; node = node.parentElement) {
      const element = node as HTMLElement
      if (element.scrollHeight > element.clientHeight + 1 && /auto|scroll/.test(win.getComputedStyle(element).overflowY)) return true
    }
    return false
  }
  const onWheel = (event: WheelEvent) => {
    if (!visible || event.defaultPrevented || event.ctrlKey || event.metaKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY) || preserveNativeWheel(event.target) || popupShown()) return
    const now = win.performance.now()
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host?.clientHeight || 600 : 1)
    const direction = Math.sign(delta)
    if (now - wheelTime > 350 || direction !== wheelDirection) {
      wheelDistance = 0; wheelConsumed = wheelNavigated = false
    }
    wheelTime = now; wheelDirection = direction
    if (wheelConsumed) {
      if (wheelNavigated) event.preventDefault()
      return
    }
    wheelDistance += Math.abs(delta)
    if (wheelDistance < 34) return
    wheelConsumed = true
    const next = direction > 0 ? 'operations' : 'input'
    if (next === (motion === 'idle' ? state : intent)) return
    event.preventDefault()
    wheelNavigated = setSection(next)
  }
  const imagePair = (parent: HTMLElement) => {
    for (const name of ['normal', 'colored']) {
      const image = doc.createElement('img')
      image.className = name; image.alt = ''; image.draggable = false
      parent.append(image)
    }
  }
  const createSection = () => {
    const bindTilt = (anchor: HTMLElement, card: HTMLElement) => {
      const animate = () => {
        if (pointerFrames.has(card)) return
        const current = tiltStates.get(card)
        if (current) current.lastTime = 0
        const tick = (time: number) => {
          const tilt = tiltStates.get(card)
          if (!tilt || state !== 'operations' || !visible || reduced.matches) {
            pointerFrames.delete(card)
            return
          }
          const elapsed = Math.min(48, time - (tilt.lastTime || time - 16.667))
          tilt.lastTime = time
          const response = 1 - Math.exp(-elapsed / 72)
          tilt.rx += (tilt.targetX - tilt.rx) * response
          tilt.ry += (tilt.targetY - tilt.ry) * response
          const settled = Math.max(Math.abs(tilt.targetX - tilt.rx), Math.abs(tilt.targetY - tilt.ry)) < .003
          if (settled) { tilt.rx = tilt.targetX; tilt.ry = tilt.targetY }
          card.style.setProperty('--rx', `${tilt.rx.toFixed(4)}deg`)
          card.style.setProperty('--ry', `${tilt.ry.toFixed(4)}deg`)
          if (settled) {
            pointerFrames.delete(card)
            if (!tilt.targetX && !tilt.targetY) {
              card.style.removeProperty('--rx'); card.style.removeProperty('--ry')
              delete card.dataset.odysseyOperationsTilting
              tiltStates.delete(card)
            }
          } else pointerFrames.set(card, win.requestAnimationFrame(tick))
        }
        pointerFrames.set(card, win.requestAnimationFrame(tick))
      }
      anchor.addEventListener('pointermove', event => {
        if (state !== 'operations' || !visible || reduced.matches || event.pointerType === 'touch') return
        // The layout anchor never tilts, so a resting pointer cannot feed the
        // card's animated bounds back into its next target angle.
        const bounds = anchor.getBoundingClientRect()
        if (!bounds.width || !bounds.height) return
        const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
        const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
        const tilt = tiltStates.get(card) || { rx: 0, ry: 0, targetX: 0, targetY: 0, lastTime: 0 }
        tilt.targetX = (.5 - y) * 10
        tilt.targetY = (x - .5) * 10
        tiltStates.set(card, tilt)
        card.dataset.odysseyOperationsTilting = ''
        animate()
      })
      const leave = () => {
        const tilt = tiltStates.get(card)
        if (!tilt) return
        tilt.targetX = 0; tilt.targetY = 0
        animate()
      }
      anchor.addEventListener('pointerleave', leave)
      anchor.addEventListener('pointercancel', leave)
      anchor.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'touch') return
        const pending = pointerFrames.get(card)
        if (pending) win.cancelAnimationFrame(pending)
        pointerFrames.delete(card); tiltStates.delete(card)
        card.style.removeProperty('--rx'); card.style.removeProperty('--ry')
        delete card.dataset.odysseyOperationsTilting
        clearIllustrationBlend(card)
      })
    }
    const bindIllustrationBlend = (anchor: HTMLElement, card: HTMLButtonElement) => {
      const blend = () => {
        if (!visible || section?.hidden || reduced.matches) { clearIllustrationBlend(card); return }
        clearIllustrationBlend(card)
        card.dataset.odysseyOperationsIllustrationBlending = ''
        // CSS owns both opacities, so a reversal continues from their current mix.
        illustrationTimers.set(card, win.setTimeout(() => clearIllustrationBlend(card), 320))
      }
      const onPointer = (event: PointerEvent) => {
        if (event.pointerType === 'touch') clearIllustrationBlend(card)
        else blend()
      }
      anchor.addEventListener('pointerenter', onPointer)
      anchor.addEventListener('pointerleave', onPointer)
      anchor.addEventListener('pointercancel', () => clearIllustrationBlend(card))
      let keyboardFocused = false
      card.addEventListener('focusin', () => { keyboardFocused = card.matches(':focus-visible'); if (keyboardFocused) blend() })
      card.addEventListener('focusout', () => { if (keyboardFocused) { keyboardFocused = false; blend() } })
      card.addEventListener('transitionend', event => {
        if (event.propertyName === 'opacity' && event.target instanceof win.HTMLImageElement && event.target.closest('.odyssey-operations-illustration')) clearIllustrationBlend(card)
      })
    }
    section = doc.createElement('section'); section.className = 'odyssey-home-operations'; section.dataset.odysseyHomeOperations = ''
    section.hidden = true; section.inert = true
    section.setAttribute('aria-hidden', 'true')
    heading = doc.createElement('h2'); heading.className = 'odyssey-operations-heading'
    const grid = doc.createElement('div'); grid.className = 'odyssey-operations-grid'
    usecase = doc.createElement('article'); usecase.className = 'odyssey-operations-usecase'
    exampleButton = doc.createElement('button'); exampleButton.type = 'button'; exampleButton.className = 'odyssey-operations-example-open'; exampleButton.dataset.odysseyOperationsOpenExample = ''; exampleButton.tabIndex = -1
    exampleButton.addEventListener('click', () => { void runAction((['board', 'note', 'ppt'] as const)[caseIndex]!, true) })
    usecase.append(exampleButton)
    const createCaseLayer = (index: number) => {
      const layer = doc.createElement('div')
      const field = doc.createElement('div'); field.className = 'odyssey-operations-gradient-field'; field.setAttribute('aria-hidden', 'true')
      for (const name of ['one', 'two']) { const glow = doc.createElement('i'); glow.className = `odyssey-operations-glow glow ${name}`; field.append(glow) }
      const text = copy().cases[index]!
      const caseCopy = doc.createElement('div'); caseCopy.className = 'odyssey-operations-case-copy'
      const title = doc.createElement('h3'); title.className = 'odyssey-operations-title'
      const strong = doc.createElement('strong'); strong.textContent = text[0]
      const trend = doc.createElement('img'); trend.className = 'odyssey-operations-trend'; trend.src = OPERATIONS_TREND_UP; trend.alt = ''; trend.setAttribute('aria-hidden', 'true'); trend.draggable = false
      title.append(strong, trend)
      const subtitle = doc.createElement('p'); subtitle.className = 'odyssey-operations-subtitle'; subtitle.textContent = text[1]
      caseCopy.append(title, subtitle)
      const description = doc.createElement('p'); description.className = 'odyssey-operations-description'; description.textContent = text[2]
      const theme = doc.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
      layer.style.setProperty('--odyssey-operations-glow-two-image', `url("${OPERATIONS_CASE_GLOWS[theme][index]}")`)
      layer.append(field, caseCopy, description)
      return layer
    }
    const pagination = doc.createElement('div'); pagination.className = 'odyssey-operations-pagination'
    for (let index = 0; index < 3; index++) {
      const page = doc.createElement('button'); page.type = 'button'; page.dataset.case = String(index); page.tabIndex = -1
      page.append(doc.createElement('i'))
      page.addEventListener('click', () => { if (state === 'operations') carousel?.select(index) })
      pages.push(page); pagination.append(page)
    }
    usecase.append(pagination)
    const usecaseAnchor = doc.createElement('div'); usecaseAnchor.className = 'odyssey-operations-tilt-anchor odyssey-operations-usecase-anchor'
    usecaseAnchor.append(usecase)
    bindTilt(usecaseAnchor, usecase)
    const quickGrid = doc.createElement('div'); quickGrid.className = 'odyssey-operations-quick-grid'
    for (const key of CARDS) {
      const card = doc.createElement('button'); card.type = 'button'; card.className = `odyssey-operations-quick-card ${key}`; card.dataset.card = key; card.tabIndex = -1
      card.addEventListener('click', () => { void runAction(key) })
      const label = doc.createElement('span'); label.className = 'odyssey-operations-quick-label'
      const illustration = doc.createElement('div'); illustration.className = 'odyssey-operations-illustration'; illustration.setAttribute('aria-hidden', 'true')
      imagePair(illustration)
      for (const level of ['near', 'middle', 'far']) { const pass = doc.createElement('div'); pass.className = `odyssey-operations-illustration-pass ${level}`; imagePair(pass); illustration.append(pass) }
      card.append(label, illustration)
      const anchor = doc.createElement('div'); anchor.className = 'odyssey-operations-tilt-anchor odyssey-operations-quick-anchor'
      anchor.append(card); bindTilt(anchor, card); bindIllustrationBlend(anchor, card)
      quickCards.push(card); quickGrid.append(anchor)
    }
    grid.append(usecaseAnchor, quickGrid); section.append(heading, grid)
    toggle = doc.createElement('button'); toggle.type = 'button'; toggle.className = 'odyssey-operations-toggle'; toggle.dataset.odysseyHomeOperationsToggle = ''; toggle.setAttribute('aria-expanded', 'false')
    toggle.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    toggle.addEventListener('click', toggleSection)
    caseTransition = createHomeOperationsCaseTransition({ win, card: usecase, initialIndex: caseIndex, createLayer: createCaseLayer, onCommit: index => { caseIndex = index; updateCase() } })
    carousel = createHomeOperationsCarousel({ win, card: usecase, initialIndex: caseIndex, onChange: index => caseTransition?.select(index) })
  }
  const resize = new win.ResizeObserver(measure)
  const detach = (preserveAction = false) => {
    if (!preserveAction) { actionController?.abort(); clearFeedback() }
    cancelSettlement()
    carousel?.dispose(); carousel = null
    caseTransition?.dispose(); caseTransition = null
    clearPointers(); clearIllustrationBlends(); resize.disconnect(); restoreHero()
    host?.removeEventListener('wheel', onWheel)
    resetWheel()
    if (host) { delete host.dataset.odysseyHomeOperationsState; delete host.dataset.odysseyHomeOperationsLayout; delete host.dataset.odysseyHomeOperationsMotion; for (const name of variables) host.style.removeProperty(name) }
    section?.remove(); toggle?.remove()
    section = toggle = null; root = hero = host = null
    heading = usecase = null; exampleButton = null
    quickCards.length = pages.length = 0
    renderedTheme = renderedLocale = ''; visible = false; state = intent = 'input'; motion = 'idle'
    progress = targetProgress = renderedHeroOffset = velocity = 0
    geometry = { inputTop: 0, targetTop: 0, shift: 1, scale: 1, viewportHeight: 0 }
  }
  const attach = (nextHost: HTMLElement, nextRoot: HTMLElement, nextHero: HTMLElement) => {
    detach(true); host = nextHost; root = nextRoot; hero = nextHero; heroWasInert = hero.inert
    hero.dataset.odysseyOperationsComposer = ''
    createSection(); host.append(section!, toggle!)
    host.addEventListener('wheel', onWheel, { passive: false })
    resize.observe(host); resize.observe(hero)
    const header = root.querySelector('.wSkVaW_header,[data-srb-session-header]')
    if (header) resize.observe(header)
    updateLabels(); updateImages(); setActionBusy(!!actionController)
  }
  const sync = () => {
    if (disposed) return
    const nextRoot = [...doc.querySelectorAll<HTMLElement>('.pI_x6G_centerCol .wSkVaW_root[data-odyssey-page="home"]')].find(node => !node.closest('[data-odyssey-subagent-panel]')) ?? null
    const nextHost = nextRoot?.closest<HTMLElement>('.pI_x6G_centerCol') ?? null
    const nextHero = nextRoot?.querySelector<HTMLElement>('.wSkVaW_composerHero') ?? null
    const canShow = !!nextHost && !!nextRoot && !!nextHero && shown(nextRoot) && !doc.body.hasAttribute('data-workspace-surface') && !settingsShown()
    if (!canShow || !nextHost || !nextRoot || !nextHero) {
      if (host) detach()
      return
    }
    if (nextHost !== host || nextRoot !== root || nextHero !== hero) attach(nextHost, nextRoot, nextHero)
    const wasVisible = visible
    visible = true
    if (renderedLocale !== locale()) updateLabels()
    if (renderedTheme !== (doc.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light')) updateImages()
    if (!wasVisible) setSection('input', true)
    else measure()
  }
  const scheduleSync = () => {
    if (disposed || frame) return
    frame = win.requestAnimationFrame(() => { frame = 0; sync() })
  }
  const changes = new win.MutationObserver(records => {
    if (records.every(record => own(record.target) || record.target === host && record.type === 'attributes' && record.attributeName === 'style' || record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(own))) return
    scheduleSync()
  })
  changes.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-odyssey-page', 'data-ds-dark-theme', 'data-workspace-surface', 'class', 'style', 'hidden', 'aria-hidden'] })
  const localeChanges = new win.MutationObserver(scheduleSync)
  localeChanges.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-odyssey-locale'] })
  const onVisibility = () => {
    if (!doc.hidden) { sync(); return }
    actionController?.abort()
    cancelSettlement()
    resetWheel()
    clearPointers(); clearIllustrationBlends(); intent = state; motion = 'idle'; velocity = 0
    progress = targetProgress = state === 'operations' ? 1 : 0
    paint()
  }
  const onReduced = () => { clearPointers(); clearIllustrationBlends(); if (reduced.matches && motion !== 'idle') setSection(intent, true); else measure() }
  doc.addEventListener('visibilitychange', onVisibility)
  doc.addEventListener('sherlock:workspace-surface-change', scheduleSync)
  reduced.addEventListener('change', onReduced)
  sync()
  const dispose = () => {
    if (disposed) return
    disposed = true
    changes.disconnect(); localeChanges.disconnect()
    if (frame) win.cancelAnimationFrame(frame)
    doc.removeEventListener('visibilitychange', onVisibility)
    doc.removeEventListener('sherlock:workspace-surface-change', scheduleSync)
    reduced.removeEventListener('change', onReduced)
    detach(); style.remove(); mounted.delete(doc)
  }
  mounted.set(doc, dispose)
  return dispose
}
