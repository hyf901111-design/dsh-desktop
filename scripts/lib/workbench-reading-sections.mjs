// Only the workbench's generated-card preview opts into this reader. Notes,
// conversation cards and the component's stored Markdown use their normal paths.
export function workbenchReadingCandidate(node) {
  const spec = node.containerSpec
  if (node.kind !== 'generated-container' || !node.workbenchId || spec?.type !== 'markdown' ||
      typeof spec.content !== 'string' || spec.content.trim().length < 240 ||
      node.deliveryStatus === 'partial' || researchWorkbenchRecoveryMode(node) ||
      ['failed', 'interrupted', 'cancelled'].includes(node.generationStatus)) return false
  // A legacy failure can predate saved delivery metadata. Only a status in
  // the title is decisive; an ordinary report can discuss missing data.
  return !/(?:^|[（(：:｜|—–])\s*(?:数据缺失|暂无(?:有效|可用)?数据|data (?:missing|unavailable)|no (?:valid |usable )?data)(?:[，,].{0,22})?[)）]?$/iu.test(spec.title || '') &&
    /^(?: {0,3})(?:#{1,6}[ \t]|\*\*|__|[=-]{2,}\s*$)/mu.test(spec.content)
}

// Read top-level blocks emitted by the native GFM renderer. The document stays
// mounted as a whole so references, footnotes, tables and code-copy controls
// keep the exact resolution and event handlers of the original component.
export function workbenchReadingOutline(markdown) {
  if (!markdown || [...markdown.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) return []
  const blocks = [...markdown.children]
  const clean = value => value.replace(/\s+/gu, ' ').trim()
  const ordinal = /^(?:[（(]?(?:\d{1,2}|[一二三四五六七八九十]{1,3})[)）.．、]\s*)/u
  const sourceTitle = /^(?:参考文献|参考资料|资料来源|数据来源|来源|注释|sources?|references?|footnotes?)(?:$|[与和及：:\s]|列表|链接)/iu
  const heading = (title, start) => ({start, title:clean(title)})
  const substantial = sections => {
    const titles = sections.filter((section, i) => {
      if (!section.title || sourceTitle.test(section.title.replace(ordinal, ''))) return false
      const first = blocks[section.start]
      return (first.tagName === 'P' && clean(first.textContent) !== section.title) ||
        blocks.slice(section.start + 1, sections[i + 1]?.start).some(block =>
          block.textContent.trim() || block.matches('img,pre,table'))
    }).map(section => section.title)
    return new Set(titles).size >= 2
  }
  let sections = []
  for (let depth = 1; depth <= 6; depth++) {
    const siblings = blocks.flatMap((block, i) => block.tagName === 'H' + depth ? [heading(block.textContent, i)] : [])
    // A document title can use the same depth as the first actual section.
    if (siblings[0]?.start === 0 && siblings[1]?.start === 1 && siblings.length >= 3) siblings.shift()
    if (substantial(siblings)) { sections = siblings; break }
  }
  if (!sections.length) {
    // A bold lead followed by a new line is a common authored heading. An
    // emphasized word in the middle of a sentence, quote or list is not.
    const bold = blocks.flatMap((block, i) => {
      const strong = block.firstChild
      if (block.tagName !== 'P' || strong?.nodeName !== 'STRONG') return []
      const title = clean(strong.textContent), after = strong.nextSibling
      if (!title || title.length > 120 || !/\p{L}/u.test(title) || /[。！？.!?]$/u.test(title)) return []
      if (after && after.nodeName !== 'BR' && !(after.nodeType === 3 && /^\s*\n/u.test(after.textContent))) return []
      return [heading(title, i)]
    })
    const numbered = bold.filter(section => ordinal.test(section.title))
    if (substantial(numbered)) sections = numbered
    else if (substantial(bold)) sections = bold
    else return []
  }
  const intro = blocks.slice(0, sections[0].start)
  if (intro.some(block => !/^H[1-6]$/u.test(block.tagName) && block.textContent.trim()))
    sections.unshift({start:0, kind:'overview'})
  else sections[0].start = 0

  const last = sections.at(-1)
  if (!sourceTitle.test((last.title || '').replace(ordinal, ''))) {
    // Generated briefs also append a dated note and link list after a divider.
    const divider = blocks.findLastIndex((block, i) => i > last.start && block.tagName === 'HR')
    const after = blocks.slice(divider + 1).filter(block => block.textContent.trim())
    if (divider >= 0 && after.length && (sourceTitle.test(clean(after[0].textContent)) ||
        /^(?:说明|备注|notes?)\s*[：:]/iu.test(clean(after[0].textContent)) && after.some(block => block.querySelector('a[href]')))) {
      sections.push({start:divider, kind:'sources'})
    } else {
      const appendix = blocks.findIndex((block, i) => i > last.start && (block.hasAttribute('data-footnotes') ||
        (/^H[1-6]$/u.test(block.tagName) || block.tagName === 'P') && sourceTitle.test(clean(block.textContent))))
      if (appendix >= 0) sections.push({start:appendix, kind:blocks[appendix].hasAttribute('data-footnotes') ? 'footnotes' : 'sources'})
    }
  }
  const used = new Map(), labelCounts = new Map()
  for (const section of sections) {
    const identity = JSON.stringify([section.kind, section.title])
    const occurrence = used.get(identity) || 0
    used.set(identity, occurrence + 1)
    section.key = identity + occurrence
    if (!section.title) continue
    const text = section.title.replace(ordinal, '')
    section.label = /^([^：:]{2,26})[：:]/u.exec(text)?.[1]?.trim() || text
    labelCounts.set(section.label, (labelCounts.get(section.label) || 0) + 1)
  }
  for (const section of sections)
    if (labelCounts.get(section.label) > 1) section.label = section.title
  return sections
}

export function WorkbenchReadingSections(props) {
  const {node} = props, text = node.containerSpec.content
  const {jsx, jsxs} = react_jsx_runtime
  const body = react.useRef(null), nav = react.useRef(null), tabs = react.useRef(null)
  const id = react.useId()
  const [documentState, setDocumentState] = react.useState(null)
  const [selected, select] = react.useState(null)
  const [overflow, setOverflow] = react.useState(false)
  useWorkbenchLocale()
  const english = document.documentElement.dataset.odysseyLocale === 'en'
  const sections = documentState?.text === text ? documentState.sections : null
  const active = Math.max(0, sections?.findIndex(section => section.key === selected) ?? 0)
  const panelId = index => id + '-panel-' + index, tabId = index => id + '-tab-' + index
  const label = section => section.label || {
    overview:english ? 'Overview' : '概览', sources:english ? 'Sources and notes' : '来源与说明',
    footnotes:english ? 'Footnotes' : '注释'
  }[section.kind]
  react.useLayoutEffect(() => {
    setDocumentState({text, sections:workbenchReadingOutline(body.current?.firstElementChild)})
  }, [text])
  react.useLayoutEffect(() => {
    const markdown = body.current?.firstElementChild
    if (!markdown || !sections?.length) return
    const start = sections[active].start, end = sections[active + 1]?.start ?? Infinity
    Array.from(markdown.children).forEach((block, index) => {
      block.toggleAttribute('data-reading-hidden', index < start || index >= end)
      block.toggleAttribute('data-reading-heading', index === start && !!sections[active].title &&
        block.tagName === 'P' && block.firstChild?.nodeName === 'STRONG')
    })
    body.current.scrollTop = 0
  }, [sections, active])
  react.useLayoutEffect(() => {
    if (!sections?.length) return
    const strip = tabs.current, container = nav.current, bar = strip.parentElement
    const measure = () => {
      setOverflow(strip.scrollWidth > container.clientWidth + 1)
      const rect = strip.children[active].getBoundingClientRect(), viewport = bar.getBoundingClientRect()
      if (rect.left < viewport.left) bar.scrollLeft += rect.left - viewport.left
      else if (rect.right > viewport.right) bar.scrollLeft += rect.right - viewport.right
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(strip)
    observer.observe(container)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [sections, active])
  if (sections && !sections.length) return jsx(ResearchContainerBody, props)
  const choose = index => select(sections[index].key)
  const move = event => {
    const count = sections.length
    const to = {ArrowRight:(active + 1) % count, ArrowLeft:(active + count - 1) % count, Home:0, End:count - 1}[event.key]
    if (to === undefined || event.altKey || event.metaKey || event.ctrlKey) return
    event.preventDefault()
    event.stopPropagation()
    choose(to)
    tabs.current.children[to].focus({preventScroll:true})
  }
  return jsxs('div', {className:'ew-reading-sections', 'data-workbench-reading':sections?.length ? '' : undefined, children:[
    sections?.length > 0 && jsxs('div', {className:'ew-reading-nav', ref:nav, children:[
      jsx('div', {className:'ew-reading-scroll', children:
        jsx('div', {ref:tabs, role:'tablist', 'aria-label':english ? 'Reading sections' : '阅读栏目', onKeyDown:move, children:
          sections.map((section, index) => jsx('button', {type:'button', role:'tab', id:tabId(index),
            'aria-selected':active === index, 'aria-controls':panelId(index), tabIndex:active === index ? 0 : -1,
            title:section.title || label(section), onClick:() => choose(index), children:label(section)}, index))})}),
      overflow && jsxs('label', {className:'ew-reading-picker', title:english ? 'All sections' : '全部栏目', children:[
        jsx(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {size:14, 'aria-hidden':true}),
        jsx('select', {'aria-label':english ? 'All sections' : '全部栏目', value:active,
          onChange:event => choose(Number(event.target.value)), children:sections.map((section, index) =>
            jsx('option', {value:index, children:label(section)}, index))})
      ]})
    ]}),
    sections?.map((section, index) => index !== active && jsx('div', {hidden:true, role:'tabpanel',
      id:panelId(index), 'aria-labelledby':tabId(index)}, section.key)),
    jsx('div', {ref:body, className:'rScV5Q_containerMarkdown ew-reading-body', 'data-research-container-markdown':'',
      role:sections?.length ? 'tabpanel' : undefined, tabIndex:sections?.length ? 0 : undefined,
      id:panelId(active), 'aria-labelledby':sections?.length ? tabId(active) : undefined,
      children:jsx(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {text, streaming:false})})
  ]})
}
