import styles from './home-operations.css?raw'
import { OPERATIONS_CASE_GLOWS, OPERATIONS_ILLUSTRATIONS, OPERATIONS_TREND_UP } from './home-operations-assets'

type Section = 'input' | 'operations'
type Motion = 'idle' | 'tracking' | 'settling'
type Card = 'board' | 'note' | 'ppt' | 'report'
const mounted = new WeakMap<Document, () => void>()
const STYLE_ID = 'sherlock-home-operations-style'
const DESIGN_WIDTH = 780
const DESIGN_HEIGHT = 381.344
const CARDS: Card[] = ['board', 'note', 'ppt', 'report']
const COPY = {
  zh: {
    heading: '快速开始', down: '下滑到快速开始', up: '上滑回到输入区', back: '返回输入区', pagination: '用例切换',
    cards: ['创建研究看板', '撰写研究笔记', '制作演示文稿', '制作研究报告'],
    cases: [
      ['快速创建', '自选行情看板', '通过研究模式，快速创建自选行情看板，以了解研究看板基础功能。'],
      ['观点挑战', '体验有AI护航文档', '打开示例笔记，体验 AI 追问观点、\n核查事实，发现研究中的盲点。'],
      ['演示文稿', '了解PPT制作能力', '通过案例回看从需求到成稿的过程，\n了解 EWork 制作 PPT 的效果。']
    ]
  },
  en: {
    heading: 'Quick start', down: 'Scroll down to quick start', up: 'Scroll up to the composer', back: 'Return to the composer', pagination: 'Examples',
    cards: ['Create a research board', 'Write research notes', 'Create a presentation', 'Create a research report'],
    cases: [
      ['Quick create', 'Watchlist dashboard', 'Create a watchlist dashboard in Research to explore the basics of research boards.'],
      ['Challenge your views', 'Explore AI-assisted notes', 'Open an example note to see AI question ideas,\ncheck facts and uncover blind spots.'],
      ['Presentations', 'Explore presentation creation', 'Follow an example from brief to finished slides\nto see what EWork can create.']
    ]
  }
} as const

/** Home decoration owns no session state and never replaces the native composer. */
export function mountHomeOperations(doc: Document = document): () => void {
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
  let section: HTMLElement | null = null, toggle: HTMLButtonElement | null = null, returnHit: HTMLButtonElement | null = null
  let heading: HTMLElement | null = null, caseTitle: HTMLElement | null = null, caseSubtitle: HTMLElement | null = null, caseDescription: HTMLElement | null = null
  let usecase: HTMLElement | null = null
  let frame = 0, paintFrame = 0, settleFrame = 0, settleTimer = 0
  let progress = 0, renderedHeroOffset = 0, motion: Motion = 'idle', intent: Section = 'input'
  let lastWheel = 0, velocity = 0
  let geometry = { inputTop: 0, targetTop: 0, shift: 1, scale: 1, viewportHeight: 0 }
  let renderedLocale = '', renderedTheme = ''
  const quickCards: HTMLButtonElement[] = [], pages: HTMLButtonElement[] = []
  const pointerFrames = new Map<HTMLElement, number>()
  const tiltStates = new Map<HTMLElement, { rx: number, ry: number, targetX: number, targetY: number, lastTime: number }>()
  const variables = ['--odyssey-operations-top', '--odyssey-operations-input-top', '--odyssey-operations-shift', '--odyssey-operations-scale', '--odyssey-operations-viewport-height', '--odyssey-operations-toggle-top', '--odyssey-operations-return-left', '--odyssey-operations-return-top', '--odyssey-operations-return-width', '--odyssey-operations-return-height', '--odyssey-operations-available-height', '--odyssey-operations-edge-start', '--odyssey-operations-duration', '--odyssey-operations-progress-value', '--odyssey-operations-scroll-progress', '--odyssey-operations-offset', '--odyssey-operations-hero-offset', '--odyssey-operations-hero-opacity', '--odyssey-operations-hero-blur', '--odyssey-operations-opacity', '--odyssey-operations-blur']
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
  const own = (node: Node): boolean => node === section || node === toggle || node === returnHit || !!section?.contains(node) || !!toggle?.contains(node) || !!returnHit?.contains(node)
  const clearPointers = () => {
    for (const pending of pointerFrames.values()) win.cancelAnimationFrame(pending)
    for (const card of [...quickCards, ...(usecase ? [usecase] : [])]) {
      card.style.removeProperty('--rx'); card.style.removeProperty('--ry')
    }
    pointerFrames.clear()
    tiltStates.clear()
  }
  const restoreHero = () => {
    if (!hero) return
    hero.inert = heroWasInert
    hero.removeAttribute('data-odyssey-operations-composer')
  }
  const updateGlow = () => {
    if (!usecase) return
    const theme = doc.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
    usecase.style.setProperty('--odyssey-operations-glow-two-image', `url("${OPERATIONS_CASE_GLOWS[theme][caseIndex]}")`)
  }
  const updateCase = () => {
    const selected = copy().cases[caseIndex]!
    if (caseTitle) caseTitle.textContent = selected[0]
    if (caseSubtitle) caseSubtitle.textContent = selected[1]
    if (caseDescription) caseDescription.textContent = selected[2]
    if (usecase) { usecase.dataset.case = String(caseIndex); usecase.setAttribute('aria-label', `${selected[0]} · ${selected[1]}`) }
    for (const [index, button] of pages.entries()) {
      button.setAttribute('aria-label', copy().cases[index]![1])
      button.setAttribute('aria-pressed', String(index === caseIndex))
    }
    updateGlow()
  }
  const updateLabels = () => {
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
    returnHit?.setAttribute('aria-label', text.back)
    updateCase()
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
    if (settleFrame) win.cancelAnimationFrame(settleFrame)
    if (settleTimer) win.clearTimeout(settleTimer)
    settleFrame = settleTimer = 0
  }
  const paint = () => {
    if (!visible || !host || !hero || !section || !toggle || !returnHit) return
    progress = Math.max(0, Math.min(1, progress))
    const collapsed = progress <= .0001, expanded = progress >= .9999
    if (collapsed || expanded) {
      const endpoint = expanded ? 'operations' : 'input'
      if (state !== endpoint || host.dataset.odysseyHomeOperationsState !== endpoint) {
        state = endpoint; host.dataset.odysseyHomeOperationsState = endpoint; updateLabels()
      }
      if (collapsed) section.scrollTop = 0
    }
    host.dataset.odysseyHomeOperationsMotion = motion
    const heroProgress = Math.min(1, progress / .72)
    const cardsProgress = Math.max(0, Math.min(1, (progress - .2) / .8))
    renderedHeroOffset = geometry.shift * heroProgress
    css('--odyssey-operations-progress-value', String(progress))
    css('--odyssey-operations-scroll-progress', String(cardsProgress))
    css('--odyssey-operations-hero-offset', `${renderedHeroOffset}px`)
    css('--odyssey-operations-offset', `${geometry.shift * cardsProgress}px`)
    css('--odyssey-operations-hero-opacity', String(1 - .7 * heroProgress))
    css('--odyssey-operations-hero-blur', `${3 * heroProgress}px`)
    css('--odyssey-operations-opacity', String(.6 + .4 * cardsProgress))
    css('--odyssey-operations-blur', `${.35 * (1 - cardsProgress)}px`)
    section.setAttribute('aria-hidden', String(!expanded))
    hero.inert = !collapsed || heroWasInert
    toggle.setAttribute('aria-expanded', String(intent === 'operations'))
    returnHit.hidden = !expanded; returnHit.tabIndex = expanded ? 0 : -1
    for (const button of [...quickCards, ...pages]) button.tabIndex = expanded ? 0 : -1
  }
  const schedulePaint = () => {
    if (paintFrame) return
    paintFrame = win.requestAnimationFrame(() => { paintFrame = 0; paint() })
  }
  const measure = () => {
    if (!visible || !host || !hero || !section) return
    const bounds = host.getBoundingClientRect(), composer = hero.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0 || composer.width <= 0) return
    const header = root?.querySelector<HTMLElement>('.wSkVaW_header,[data-srb-session-header]')
    const headerBottom = header ? Math.max(0, header.getBoundingClientRect().bottom - bounds.top) : 44
    const dock = host.querySelector<HTMLElement>('[data-odyssey-theme-dock]')
    const toggleHeight = toggle ? Number.parseFloat(win.getComputedStyle(toggle).height) || 32 : 32
    let toggleTop = bounds.height - 72
    if (dock) {
      const dockStyle = win.getComputedStyle(dock)
      // Use the expanded envelope even while the dock is collapsed or moving.
      const expandedBottom = Number.parseFloat(dockStyle.getPropertyValue('--theme-dock-bottom'))
      const dockScale = Number.parseFloat(dockStyle.getPropertyValue('--theme-dock-scale'))
      const dockHeight = Number.parseFloat(dockStyle.height) || dock.offsetHeight || 64
      toggleTop = bounds.height - (Number.isFinite(expandedBottom) ? expandedBottom : 24) - dockHeight * (Number.isFinite(dockScale) ? dockScale : 1) - 12 - toggleHeight
    }
    const effectiveWidth = Math.min(composer.width, Math.max(1, bounds.width - 48))
    const stacked = effectiveWidth < 620
    host.dataset.odysseyHomeOperationsLayout = stacked ? 'stacked' : 'wide'
    const minimumTop = Math.max(64, headerBottom + 24), bottomLimit = toggleTop - 24
    const heightScale = Math.max(.22, (bottomLimit - minimumTop) / DESIGN_HEIGHT)
    const scale = stacked ? 1 : Math.max(.2, Math.min(1, effectiveWidth / DESIGN_WIDTH, heightScale))
    const viewportHeight = stacked ? Math.min(664.294, Math.max(96, bottomLimit - headerBottom - 72)) : DESIGN_HEIGHT * scale
    const centeredTop = (bounds.height - 345.344 * scale) / 2 - 36 * scale
    const targetTop = Math.max(minimumTop, Math.min(centeredTop, bottomLimit - viewportHeight))
    // Both surfaces use our last painted offset. Reading animated CSS values
    // on wheel events would add forced layout and can restart an animation.
    const inputTop = composer.bottom - bounds.top + renderedHeroOffset + 28
    geometry = { inputTop, targetTop, shift: Math.max(1, inputTop - targetTop), scale, viewportHeight }
    css('--odyssey-operations-top', `${inputTop}px`)
    css('--odyssey-operations-input-top', `${inputTop}px`)
    css('--odyssey-operations-shift', `${geometry.shift}px`)
    css('--odyssey-operations-scale', String(scale))
    css('--odyssey-operations-viewport-height', `${viewportHeight}px`)
    css('--odyssey-operations-toggle-top', `${toggleTop}px`)
    css('--odyssey-operations-return-left', `${composer.left - bounds.left}px`)
    css('--odyssey-operations-return-top', `${headerBottom + 8}px`)
    css('--odyssey-operations-return-width', `${composer.width}px`)
    css('--odyssey-operations-return-height', `${Math.max(0, targetTop - headerBottom - 24)}px`)
    css('--odyssey-operations-available-height', `${Math.max(0, bounds.height - headerBottom)}px`)
    css('--odyssey-operations-edge-start', `${Math.max(headerBottom, bounds.height - 140)}px`)
    paint()
  }
  const setSection = (next: Section, force = false) => {
    if (!visible || !host || !hero || !section || !toggle || !returnHit) return false
    cancelSettlement()
    if (paintFrame) win.cancelAnimationFrame(paintFrame)
    paintFrame = 0; intent = next; velocity = lastWheel = 0
    clearPointers()
    const destination = next === 'operations' ? 1 : 0
    if (force || reduced.matches || Math.abs(destination - progress) < .0001) {
      progress = destination; motion = 'idle'; updateLabels(); measure()
      return true
    }
    const start = progress, startedAt = win.performance.now()
    const duration = Math.max(180, Math.min(300, Math.abs(destination - start) * 300))
    motion = 'settling'; updateLabels(); paint()
    const step = (now: number) => {
      settleFrame = 0
      if (disposed || !visible) return
      const time = Math.max(0, Math.min(1, (now - startedAt) / duration))
      progress = start + (destination - start) * (1 - (1 - time) ** 3)
      if (time === 1) { progress = destination; motion = 'idle' }
      paint()
      if (time < 1) settleFrame = win.requestAnimationFrame(step)
    }
    settleFrame = win.requestAnimationFrame(step)
    return true
  }
  const toggleSection = () => setSection((motion === 'idle' ? state : intent) === 'input' ? 'operations' : 'input')
  const avoidInput = (target: EventTarget | null) => {
    if (!(target instanceof win.Element)) return true
    if (target.closest('textarea,input,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="menu"],[role="listbox"],[role="dialog"],[data-odyssey-theme-dock]')) return true
    const control = target.closest('button,a,[role="button"],[role="slider"],[role="combobox"]')
    return !!control && !own(control)
  }
  const onWheel = (event: WheelEvent) => {
    if (!visible || event.defaultPrevented || event.ctrlKey || event.metaKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY) || avoidInput(event.target) || popupShown()) return
    if (progress >= .9999 && host?.dataset.odysseyHomeOperationsLayout === 'stacked' && event.target instanceof win.Node && section?.contains(event.target)) {
      const remaining = section.scrollHeight - section.clientHeight - section.scrollTop
      if (event.deltaY > 0 && remaining > .5 || event.deltaY < 0 && section.scrollTop > .5) {
        cancelSettlement(); velocity = lastWheel = 0; intent = 'operations'; motion = 'idle'; paint()
        return
      }
    }
    event.preventDefault()
    cancelSettlement()
    const now = win.performance.now()
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host?.clientHeight || 600 : 1)
    const elapsed = lastWheel ? Math.max(8, Math.min(64, now - lastWheel)) : 16
    const speed = Math.max(-2, Math.min(2, delta / elapsed))
    velocity = !lastWheel || now - lastWheel > 180 ? speed : velocity * .45 + speed * .55
    const previousIntent = intent
    lastWheel = now; intent = delta > 0 ? 'operations' : 'input'
    if (motion !== 'tracking') clearPointers()
    motion = 'tracking'
    progress = Math.max(0, Math.min(1, progress + delta / geometry.shift))
    if (intent !== previousIntent) updateLabels()
    schedulePaint()
    settleTimer = win.setTimeout(() => {
      settleTimer = 0
      const projected = progress + velocity * 90 / geometry.shift
      setSection(projected >= .5 ? 'operations' : 'input')
    }, 110)
  }
  const onKey = (event: KeyboardEvent) => {
    if (!visible || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowDown', 'ArrowUp'].includes(event.key) || avoidInput(event.target) || popupShown()) return
    if (event.target !== doc.body && event.target !== doc.documentElement && !(event.target instanceof win.Node && host?.contains(event.target))) return
    event.preventDefault()
    setSection(event.key === 'ArrowDown' ? 'operations' : 'input')
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
        tilt.targetX = (.5 - y) * 3
        tilt.targetY = (x - .5) * 3
        tiltStates.set(card, tilt)
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
    }
    section = doc.createElement('section'); section.className = 'odyssey-home-operations'; section.dataset.odysseyHomeOperations = ''
    section.setAttribute('aria-hidden', 'true')
    heading = doc.createElement('h2'); heading.className = 'odyssey-operations-heading'
    const grid = doc.createElement('div'); grid.className = 'odyssey-operations-grid'
    usecase = doc.createElement('article'); usecase.className = 'odyssey-operations-usecase'
    const field = doc.createElement('div'); field.className = 'odyssey-operations-gradient-field'; field.setAttribute('aria-hidden', 'true')
    for (const name of ['one', 'two']) { const glow = doc.createElement('i'); glow.className = `odyssey-operations-glow glow ${name}`; field.append(glow) }
    const caseCopy = doc.createElement('div'); caseCopy.className = 'odyssey-operations-case-copy'
    const title = doc.createElement('h3'); title.className = 'odyssey-operations-title'
    caseTitle = doc.createElement('strong')
    const trend = doc.createElement('img'); trend.className = 'odyssey-operations-trend'; trend.src = OPERATIONS_TREND_UP; trend.alt = ''; trend.setAttribute('aria-hidden', 'true'); trend.draggable = false
    title.append(caseTitle, trend)
    caseSubtitle = doc.createElement('p'); caseSubtitle.className = 'odyssey-operations-subtitle'
    caseCopy.append(title, caseSubtitle)
    caseDescription = doc.createElement('p'); caseDescription.className = 'odyssey-operations-description'
    const pagination = doc.createElement('div'); pagination.className = 'odyssey-operations-pagination'
    for (let index = 0; index < 3; index++) {
      const page = doc.createElement('button'); page.type = 'button'; page.dataset.case = String(index); page.tabIndex = -1
      page.append(doc.createElement('i'))
      page.addEventListener('click', () => { if (state === 'operations') { caseIndex = index; updateCase() } })
      pages.push(page); pagination.append(page)
    }
    usecase.append(field, caseCopy, caseDescription, pagination)
    const usecaseAnchor = doc.createElement('div'); usecaseAnchor.className = 'odyssey-operations-tilt-anchor odyssey-operations-usecase-anchor'
    usecaseAnchor.append(usecase)
    bindTilt(usecaseAnchor, usecase)
    const quickGrid = doc.createElement('div'); quickGrid.className = 'odyssey-operations-quick-grid'
    for (const key of CARDS) {
      const card = doc.createElement('button'); card.type = 'button'; card.className = `odyssey-operations-quick-card ${key}`; card.dataset.card = key; card.tabIndex = -1
      const label = doc.createElement('span'); label.className = 'odyssey-operations-quick-label'
      const illustration = doc.createElement('div'); illustration.className = 'odyssey-operations-illustration'; illustration.setAttribute('aria-hidden', 'true')
      imagePair(illustration)
      for (const level of ['near', 'middle', 'far']) { const pass = doc.createElement('div'); pass.className = `odyssey-operations-illustration-pass ${level}`; imagePair(pass); illustration.append(pass) }
      card.append(label, illustration)
      const anchor = doc.createElement('div'); anchor.className = 'odyssey-operations-tilt-anchor odyssey-operations-quick-anchor'
      anchor.append(card); bindTilt(anchor, card)
      quickCards.push(card); quickGrid.append(anchor)
    }
    grid.append(usecaseAnchor, quickGrid); section.append(heading, grid)
    section.addEventListener('click', event => {
      if (state === 'input') { event.preventDefault(); event.stopImmediatePropagation(); setSection('operations') }
    }, true)
    toggle = doc.createElement('button'); toggle.type = 'button'; toggle.className = 'odyssey-operations-toggle'; toggle.dataset.odysseyHomeOperationsToggle = ''; toggle.setAttribute('aria-expanded', 'false')
    toggle.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    toggle.addEventListener('click', toggleSection)
    returnHit = doc.createElement('button'); returnHit.type = 'button'; returnHit.className = 'odyssey-operations-return-hit'; returnHit.tabIndex = -1; returnHit.hidden = true
    returnHit.addEventListener('click', () => setSection('input'))
  }
  const resize = new win.ResizeObserver(measure)
  const detach = () => {
    cancelSettlement()
    if (paintFrame) win.cancelAnimationFrame(paintFrame)
    paintFrame = 0
    clearPointers(); resize.disconnect(); restoreHero()
    host?.removeEventListener('wheel', onWheel)
    if (host) { delete host.dataset.odysseyHomeOperationsState; delete host.dataset.odysseyHomeOperationsLayout; delete host.dataset.odysseyHomeOperationsMotion; for (const name of variables) host.style.removeProperty(name) }
    section?.remove(); toggle?.remove(); returnHit?.remove()
    section = toggle = returnHit = null; root = hero = host = null
    heading = caseTitle = caseSubtitle = caseDescription = usecase = null
    quickCards.length = pages.length = 0
    renderedTheme = renderedLocale = ''; visible = false; state = intent = 'input'; motion = 'idle'
    progress = renderedHeroOffset = velocity = lastWheel = 0
    geometry = { inputTop: 0, targetTop: 0, shift: 1, scale: 1, viewportHeight: 0 }
  }
  const attach = (nextHost: HTMLElement, nextRoot: HTMLElement, nextHero: HTMLElement) => {
    detach(); host = nextHost; root = nextRoot; hero = nextHero; heroWasInert = hero.inert
    hero.dataset.odysseyOperationsComposer = ''
    createSection(); host.append(section!, toggle!, returnHit!)
    host.addEventListener('wheel', onWheel, { passive: false })
    resize.observe(host); resize.observe(hero)
    const header = root.querySelector('.wSkVaW_header,[data-srb-session-header]')
    if (header) resize.observe(header)
    updateLabels(); updateImages()
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
    cancelSettlement()
    if (paintFrame) win.cancelAnimationFrame(paintFrame)
    paintFrame = 0; clearPointers(); intent = state; motion = 'idle'; velocity = lastWheel = 0
    progress = state === 'operations' ? 1 : 0
    paint()
  }
  const onReduced = () => { clearPointers(); if (reduced.matches && motion !== 'idle') setSection(intent, true); else measure() }
  doc.addEventListener('visibilitychange', onVisibility)
  doc.addEventListener('sherlock:workspace-surface-change', scheduleSync)
  doc.addEventListener('keydown', onKey)
  reduced.addEventListener('change', onReduced)
  sync()
  const dispose = () => {
    if (disposed) return
    disposed = true
    changes.disconnect(); localeChanges.disconnect()
    if (frame) win.cancelAnimationFrame(frame)
    doc.removeEventListener('visibilitychange', onVisibility)
    doc.removeEventListener('sherlock:workspace-surface-change', scheduleSync)
    doc.removeEventListener('keydown', onKey)
    reduced.removeEventListener('change', onReduced)
    detach(); style.remove(); mounted.delete(doc)
  }
  mounted.set(doc, dispose)
  return dispose
}
