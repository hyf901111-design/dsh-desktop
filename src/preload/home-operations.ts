import styles from './home-operations.css?raw'
import { OPERATIONS_CASE_GLOWS, OPERATIONS_ILLUSTRATIONS, OPERATIONS_TREND_UP } from './home-operations-assets'

type Section = 'input' | 'operations'
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
  let frame = 0, lockUntil = 0, wheelSum = 0, lastWheel = 0, lastDirection = 0
  let renderedLocale = '', renderedTheme = ''
  const quickCards: HTMLButtonElement[] = [], pages: HTMLButtonElement[] = []
  const pointerFrames = new Map<HTMLButtonElement, number>()
  const variables = ['--odyssey-operations-top', '--odyssey-operations-input-top', '--odyssey-operations-shift', '--odyssey-operations-scale', '--odyssey-operations-viewport-height', '--odyssey-operations-toggle-top', '--odyssey-operations-return-left', '--odyssey-operations-return-top', '--odyssey-operations-return-width', '--odyssey-operations-return-height', '--odyssey-operations-available-height', '--odyssey-operations-edge-start', '--odyssey-operations-duration']
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
    for (const card of quickCards) {
      const pending = pointerFrames.get(card)
      if (pending) win.cancelAnimationFrame(pending)
      card.style.removeProperty('--rx'); card.style.removeProperty('--ry')
      card.style.removeProperty('--mx'); card.style.removeProperty('--my')
    }
    pointerFrames.clear()
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
    const label = state === 'input' ? text.down : text.up
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
  const measure = () => {
    if (!visible || !host || !hero || !section) return
    const bounds = host.getBoundingClientRect(), composer = hero.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0 || composer.width <= 0) return
    // The independent CSS translate may be partway through its transition.
    // Subtract its current value to recover the unchanged native layout box.
    const translated = win.getComputedStyle(hero).translate.trim().split(/\s+/)
    const translateY = translated.length > 1 ? Number.parseFloat(translated[1]!) || 0 : 0
    const header = root?.querySelector<HTMLElement>('.wSkVaW_header,[data-srb-session-header]')
    const headerBottom = header ? Math.max(0, header.getBoundingClientRect().bottom - bounds.top) : 44
    const dock = host.querySelector<HTMLElement>('[data-odyssey-theme-dock]')
    let bottomReserve = 84
    if (dock) {
      const dockStyle = win.getComputedStyle(dock)
      // The dock's animated bottom becomes negative when collapsed. Reserve
      // its expanded envelope so it can reappear without covering the arrow.
      const expandedBottom = Number.parseFloat(dockStyle.getPropertyValue('--theme-dock-bottom'))
      const dockScale = Number.parseFloat(dockStyle.getPropertyValue('--theme-dock-scale'))
      const dockHeight = Number.parseFloat(dockStyle.height) || dock.offsetHeight || 64
      const toggleHeight = toggle ? Number.parseFloat(win.getComputedStyle(toggle).height) || 32 : 32
      bottomReserve = (Number.isFinite(expandedBottom) ? expandedBottom : 24) + dockHeight * (Number.isFinite(dockScale) ? dockScale : 1) + 24 + toggleHeight + 12
    }
    const effectiveWidth = Math.min(composer.width, Math.max(1, bounds.width - 48))
    const stacked = effectiveWidth < 620
    host.dataset.odysseyHomeOperationsLayout = stacked ? 'stacked' : 'wide'
    const widthScale = Math.min(1, effectiveWidth / DESIGN_WIDTH)
    const heightScale = Math.max(.22, (bounds.height - headerBottom - bottomReserve) / (DESIGN_HEIGHT + 140))
    const scale = stacked ? 1 : Math.max(.2, Math.min(widthScale, heightScale))
    const inputTop = composer.bottom - bounds.top - translateY + 28
    const minimumTop = Math.max(64, headerBottom + 20)
    const targetTop = stacked ? headerBottom + 72 : Math.max(minimumTop, Math.min(headerBottom + 140 * scale, bounds.height - DESIGN_HEIGHT * scale - bottomReserve))
    const viewportHeight = stacked ? Math.max(96, bounds.height - targetTop - bottomReserve) : DESIGN_HEIGHT * scale
    const shift = Math.max(0, inputTop - targetTop)
    css('--odyssey-operations-top', `${state === 'input' ? inputTop : targetTop}px`)
    css('--odyssey-operations-input-top', `${inputTop}px`)
    css('--odyssey-operations-shift', `${shift}px`)
    css('--odyssey-operations-scale', String(scale))
    css('--odyssey-operations-viewport-height', `${viewportHeight}px`)
    css('--odyssey-operations-toggle-top', `${state === 'input' ? inputTop - 54 : targetTop + viewportHeight + 24}px`)
    css('--odyssey-operations-return-left', `${composer.left - bounds.left}px`)
    css('--odyssey-operations-return-top', `${headerBottom + 8}px`)
    css('--odyssey-operations-return-width', `${composer.width}px`)
    css('--odyssey-operations-return-height', `${Math.max(0, targetTop - headerBottom - 24)}px`)
    css('--odyssey-operations-available-height', `${Math.max(0, bounds.height - headerBottom)}px`)
    css('--odyssey-operations-edge-start', `${Math.max(headerBottom, bounds.height - 140)}px`)
  }
  const setSection = (next: Section, force = false) => {
    if (!visible || !host || !hero || !section || !toggle || !returnHit) return false
    const now = win.performance.now()
    if (next === state && !force || !force && now < lockUntil) return false
    state = next
    const expanded = next === 'operations'
    host.dataset.odysseyHomeOperationsState = next
    css('--odyssey-operations-duration', expanded ? '620ms' : '480ms')
    section.setAttribute('aria-hidden', String(!expanded))
    if (!expanded) section.scrollTop = 0
    toggle.setAttribute('aria-expanded', String(expanded))
    returnHit.tabIndex = expanded ? 0 : -1
    returnHit.hidden = !expanded
    for (const button of [...quickCards, ...pages]) button.tabIndex = expanded ? 0 : -1
    hero.inert = expanded || heroWasInert
    clearPointers()
    updateLabels(); measure()
    wheelSum = 0
    lockUntil = force || reduced.matches ? now : now + (expanded ? 720 : 580)
    return true
  }
  const avoidInput = (target: EventTarget | null) => {
    if (!(target instanceof win.Element)) return true
    if (target.closest('textarea,input,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="menu"],[role="listbox"],[role="dialog"],[data-odyssey-theme-dock]')) return true
    const control = target.closest('button,a,[role="button"],[role="slider"],[role="combobox"]')
    return !!control && !own(control)
  }
  const onWheel = (event: WheelEvent) => {
    if (!visible || event.defaultPrevented || event.ctrlKey || event.metaKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY) || avoidInput(event.target) || popupShown()) return
    if (state === 'operations' && host?.dataset.odysseyHomeOperationsLayout === 'stacked' && event.target instanceof win.Node && section?.contains(event.target)) {
      const remaining = section.scrollHeight - section.clientHeight - section.scrollTop
      if (event.deltaY > 0 && remaining > .5 || event.deltaY < 0 && section.scrollTop > .5) {
        wheelSum = 0; lastWheel = 0
        return
      }
    }
    event.preventDefault()
    const now = win.performance.now(), direction = Math.sign(event.deltaY)
    if (now - lastWheel > 180 || direction !== lastDirection) wheelSum = 0
    lastWheel = now; lastDirection = direction
    if (now < lockUntil) { wheelSum = 0; return }
    wheelSum += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host?.clientHeight || 600 : 1)
    if (Math.abs(wheelSum) >= 34) { setSection(direction > 0 ? 'operations' : 'input'); wheelSum = 0 }
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
    const quickGrid = doc.createElement('div'); quickGrid.className = 'odyssey-operations-quick-grid'
    for (const key of CARDS) {
      const card = doc.createElement('button'); card.type = 'button'; card.className = `odyssey-operations-quick-card ${key}`; card.dataset.card = key; card.tabIndex = -1
      const label = doc.createElement('span'); label.className = 'odyssey-operations-quick-label'
      const illustration = doc.createElement('div'); illustration.className = 'odyssey-operations-illustration'; illustration.setAttribute('aria-hidden', 'true')
      imagePair(illustration)
      for (const level of ['near', 'middle', 'far']) { const pass = doc.createElement('div'); pass.className = `odyssey-operations-illustration-pass ${level}`; imagePair(pass); illustration.append(pass) }
      const light = doc.createElement('i'); light.className = 'odyssey-operations-pointer-light'; light.setAttribute('aria-hidden', 'true')
      card.append(label, illustration, light)
      card.addEventListener('pointermove', event => {
        if (state !== 'operations' || !visible || reduced.matches || event.pointerType === 'touch') return
        const pending = pointerFrames.get(card)
        if (pending) win.cancelAnimationFrame(pending)
        const xPosition = event.clientX, yPosition = event.clientY
        pointerFrames.set(card, win.requestAnimationFrame(() => {
          pointerFrames.delete(card)
          const bounds = card.getBoundingClientRect()
          if (!bounds.width || !bounds.height) return
          const x = Math.max(0, Math.min(1, (xPosition - bounds.left) / bounds.width)), y = Math.max(0, Math.min(1, (yPosition - bounds.top) / bounds.height))
          card.style.setProperty('--rx', `${(.5 - y) * 6}deg`); card.style.setProperty('--ry', `${(x - .5) * 6}deg`)
          card.style.setProperty('--mx', `${x * 100}%`); card.style.setProperty('--my', `${y * 100}%`)
        }))
      })
      card.addEventListener('pointerleave', () => {
        const pending = pointerFrames.get(card)
        if (pending) win.cancelAnimationFrame(pending)
        pointerFrames.delete(card)
        card.style.removeProperty('--rx'); card.style.removeProperty('--ry'); card.style.removeProperty('--mx'); card.style.removeProperty('--my')
      })
      quickCards.push(card); quickGrid.append(card)
    }
    grid.append(usecase, quickGrid); section.append(heading, grid)
    section.addEventListener('click', event => {
      if (state === 'input') { event.preventDefault(); event.stopImmediatePropagation(); setSection('operations') }
    }, true)
    toggle = doc.createElement('button'); toggle.type = 'button'; toggle.className = 'odyssey-operations-toggle'; toggle.dataset.odysseyHomeOperationsToggle = ''; toggle.setAttribute('aria-expanded', 'false')
    toggle.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    toggle.addEventListener('click', () => setSection(state === 'input' ? 'operations' : 'input'))
    returnHit = doc.createElement('button'); returnHit.type = 'button'; returnHit.className = 'odyssey-operations-return-hit'; returnHit.tabIndex = -1; returnHit.hidden = true
    returnHit.addEventListener('click', () => setSection('input'))
  }
  const resize = new win.ResizeObserver(measure)
  const detach = () => {
    clearPointers(); resize.disconnect(); restoreHero()
    host?.removeEventListener('wheel', onWheel)
    if (host) { delete host.dataset.odysseyHomeOperationsState; delete host.dataset.odysseyHomeOperationsLayout; for (const name of variables) host.style.removeProperty(name) }
    section?.remove(); toggle?.remove(); returnHit?.remove()
    section = toggle = returnHit = null; root = hero = host = null
    heading = caseTitle = caseSubtitle = caseDescription = usecase = null
    quickCards.length = pages.length = 0
    renderedTheme = renderedLocale = ''; visible = false; state = 'input'; wheelSum = lockUntil = 0
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
  const onVisibility = () => { if (doc.hidden) clearPointers(); else sync() }
  const onReduced = () => { clearPointers(); measure() }
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
