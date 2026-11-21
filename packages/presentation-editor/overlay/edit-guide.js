// The home player lives outside the editor origin. Resolve its finite set of
// targets against the current PPTist viewport so zoom and sidebar width apply.
export function runEditGuideAction(d, { store, documentId, editable, activeIds, plain, enableDemoNarration, resizeNotes }) {
  if (!documentId || documentId !== d.documentId || !editable) throw Error('演示文稿已切换或锁定。')
  const slide = store.currentSlide
  const box = (rect) => ({
    left: rect.left / innerWidth,
    top: rect.top / innerHeight,
    width: rect.width / innerWidth,
    height: rect.height / innerHeight
  })
  const getObject = () => {
    const object = slide.elements.find(
      (e) =>
        !e.odysseyMaster &&
        (['chart', 'table'].includes(d.target) ? e.type === d.target : plain(e.content || e.text?.content).trim() === d.title)
    )
    if (!object) throw Error('当前页没有找到要演示的对象。')
    const viewport = document.querySelector('.slide-area .viewport-wrapper').getBoundingClientRect()
    const scale = viewport.width / store.viewportSize
    return {
      object,
      rect: {
        left: viewport.left + object.left * scale,
        top: viewport.top + object.top * scale,
        width: object.width * scale,
        height: object.height * scale
      }
    }
  }
  const control = () => {
    if (d.target === 'page') {
      const row = document.querySelectorAll('.page-row')[d.page - 1]
      if (!row) throw Error('找不到指定页。')
      row.scrollIntoView({ block: 'nearest', behavior: 'instant' })
      return row
    }
    const selector = {
      overflow: '.ribbon [data-ribbon-more]',
      mark: '.ribbon button[aria-label="标注"]',
      rect: '.pptxa-tool[data-pptx-tool="rect"]',
      comment: '.pptxa-bubble:not([hidden]) textarea',
      close: '.pptxa-bubble:not([hidden]) .pptxa-bubble-close',
      notes: '.notes textarea',
      narrate: '.theater .narration-button',
      play: '.ribbon button[aria-label="从当前页放映"]'
    }[d.target]
    let el = selector && document.querySelector(selector)
    if (el?.hasAttribute('data-ribbon-folded') && d.target !== 'overflow')
      el = document.querySelector('.ribbon-overflow [data-ribbon-command="' + el.getAttribute('aria-label') + '"]')
    if (!el || !el.getBoundingClientRect().width) throw Error('操作控件尚未显示。')
    return el
  }
  if (d.command === 'in-overflow') {
    const label = {mark: '标注', play: '从当前页放映'}[d.target]
    return !!label && !!document.querySelector('.ribbon [data-ribbon-folded][aria-label="' + label + '"]')
  }
  if (d.command === 'state')
    return {
      page: store.slideIndex + 1,
      notes: plain(slide.remark),
      playing: !!document.querySelector('.theater'),
      narrating: document.querySelector('.theater .narration-button')?.dataset.state === 'playing',
      count: store.slides.length,
      title: (() => {
        const e = slide.elements.find((el) => el.id === activeIds.at(-1))
        return plain(e?.content || e?.text?.content)
      })(),
      selected: activeIds.at(-1),
      marking: document.querySelector('button[aria-label="标注"]')?.getAttribute('aria-pressed') === 'true',
      rectSelected: document.querySelector('.pptxa-tool[data-pptx-tool="rect"]')?.getAttribute('aria-pressed') === 'true',
      rectReady: !!document.querySelector('.pptxa-tool[data-pptx-tool="rect"][aria-pressed]'),
      commentOpen: !!document.querySelector('.pptxa-bubble:not([hidden])'),
      markId: slide.marks?.at(-1)?.id,
      comment: slide.marks?.at(-1)?.comment
    }
  if (d.command === 'expand-notes') {
    resizeNotes(Math.max(105, Math.min(158, innerHeight * 0.2)))
    return
  }
  if (d.command === 'bounds')
    return ['chart', 'table', 'title'].includes(d.target)
      ? box(getObject().rect)
      : box(control().getBoundingClientRect())
  if (d.command === 'click') {
    if (d.target === 'title') {
      const { rect } = getObject(),
        x = rect.left + rect.width * 0.36,
        y = rect.top + rect.height * 0.5
      const hit = document.elementFromPoint(x, y)
      if (!hit?.closest('.slide-area')) throw Error('标题被遮挡。')
      for (const type of ['mousedown', 'mouseup', 'click'])
        hit.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y,
            button: 0,
            buttons: type === 'mousedown' ? 1 : 0
          })
        )
    } else {
      if (d.target === 'narrate') enableDemoNarration()
      const el = control()
      el.focus({ preventScroll: true })
      el.click()
    }
    return
  }
  if (d.command === 'draw') {
    const content = document.querySelector('.slide-area .viewport-wrapper')
    if (
      content &&
      ['pointerdown', 'pointermove', 'pointerup'].includes(d.event) &&
      Number.isFinite(d.x) &&
      Number.isFinite(d.y)
    )
      content.dispatchEvent(
        new PointerEvent(d.event, {
          bubbles: true,
          cancelable: true,
          clientX: d.x * innerWidth,
          clientY: d.y * innerHeight,
          pointerType: 'mouse',
          isPrimary: true,
          pointerId: 41,
          button: 0,
          buttons: d.event === 'pointerup' ? 0 : 1
        })
      )
    return
  }
  if (d.command === 'comment') {
    const el = control()
    el.value = String(d.text).slice(0, 1000)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return
  }
  if (d.command === 'select-notes') {
    const el = control()
    if (!Number.isInteger(d.start) || typeof d.quote !== 'string' || el.value.slice(d.start, d.start + d.quote.length) !== d.quote)
      throw Error('演讲稿选区已变化。')
    el.focus({ preventScroll: true })
    const length = d.commit ? d.quote.length : d.length
    if (!Number.isInteger(length) || length < 0 || length > d.quote.length) throw Error('逐字稿选区已变化。')
    el.setSelectionRange(d.start, d.start + length, 'forward')
    if (d.commit) el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    return
  }
  if (d.command === 'notes-selection-bounds') {
    const el = document.querySelector('.notes textarea')
    if (el.value.slice(d.start, d.start + d.quote.length) !== d.quote) throw Error('演讲稿选区已变化。')
    const rect = el.getBoundingClientRect(), style = getComputedStyle(el), mirror = document.createElement('div')
    for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'textAlign', 'padding', 'wordBreak', 'overflowWrap', 'tabSize']) mirror.style[key] = style[key]
    // Use the textarea's actual scrollport. A scrollbar changes where its text wraps.
    Object.assign(mirror.style, { position: 'fixed', visibility: 'hidden', pointerEvents: 'none', whiteSpace: 'pre-wrap', boxSizing: 'border-box', width: el.clientWidth + 'px', left: rect.left + el.clientLeft + 'px', top: rect.top + el.clientTop + 'px' })
    const text = document.createTextNode(el.value)
    mirror.append(text)
    document.body.append(mirror)
    try {
      const range = document.createRange(), lines = []
      let length = 0
      for (const char of d.quote) {
        range.setStart(text, d.start + length)
        range.setEnd(text, d.start + length + char.length)
        const glyph = range.getBoundingClientRect(), y = glyph.top + glyph.height / 2
        let line = lines.at(-1)
        if (!line || Math.abs(line.y - y) > 1) {
          line = {y, stops: [{x: glyph.left / innerWidth, length}]}
          lines.push(line)
        }
        length += char.length
        line.stops.push({x: glyph.right / innerWidth, length})
      }
      if (!lines.length) throw Error('逐字稿尚未显示。')
      // Bring the ending line into view while keeping the beginning visible when possible.
      const halfLine = (parseFloat(style.lineHeight) || parseFloat(style.fontSize)) / 2
      const scrollportTop = rect.top + el.clientTop
      const top = lines[0].y - halfLine - scrollportTop
      const bottom = lines.at(-1).y + halfLine - scrollportTop
      el.scrollTop = Math.max(0, Math.min(top, Math.max(el.scrollTop, bottom - el.clientHeight)))
      for (const line of lines) line.y = (line.y - el.scrollTop) / innerHeight
      return {lines, start: {x: lines[0].stops[0].x, y: lines[0].y}, end: {x: lines.at(-1).stops.at(-1).x, y: lines.at(-1).y}}
    } finally { mirror.remove() }
  }
  throw Error('未知演示动作。')
}
