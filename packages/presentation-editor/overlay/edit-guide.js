// The home player lives outside the editor origin. Resolve its finite set of
// targets against the current PPTist viewport so zoom and sidebar width apply.
export function runEditGuideAction(d, { store, documentId, editable, activeIds, plain, resizeNotes }) {
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
      mark: 'button[aria-label="标注"]',
      rect: '.pptxa-tool',
      comment: '.pptxa-bubble:not([hidden]) textarea',
      close: '.pptxa-bubble:not([hidden]) .pptxa-bubble-close',
      notes: '.notes textarea',
      play: 'button[aria-label="从当前页放映"]'
    }[d.target]
    const el = selector && document.querySelector(selector)
    if (!el || !el.getBoundingClientRect().width) throw Error('操作控件尚未显示。')
    return el
  }
  if (d.command === 'state')
    return {
      page: store.slideIndex + 1,
      notes: plain(slide.remark),
      playing: !!document.querySelector('.theater'),
      count: store.slides.length,
      title: (() => {
        const e = slide.elements.find((el) => el.id === activeIds.at(-1))
        return plain(e?.content || e?.text?.content)
      })(),
      selected: activeIds.at(-1),
      marking: document.querySelector('button[aria-label="标注"]')?.getAttribute('aria-pressed') === 'true',
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
    el.setSelectionRange(d.start, d.start + Math.round(d.quote.length * (Number.isFinite(d.fraction) ? Math.max(0, Math.min(1, d.fraction)) : 1)))
    if (d.commit) el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    return
  }
  if (d.command === 'notes-selection-bounds') {
    const el = document.querySelector('.notes textarea')
    if (el.value.slice(d.start, d.start + d.quote.length) !== d.quote) throw Error('演讲稿选区已变化。')
    el.scrollTop = el.scrollHeight
    const rect = el.getBoundingClientRect(), style = getComputedStyle(el), mirror = document.createElement('div')
    for (const key of ['font', 'lineHeight', 'letterSpacing', 'padding', 'border', 'boxSizing', 'wordBreak', 'overflowWrap']) mirror.style[key] = style[key]
    Object.assign(mirror.style, { position: 'fixed', visibility: 'hidden', whiteSpace: 'pre-wrap', width: rect.width + 'px', left: rect.left + 'px', top: rect.top - el.scrollTop + 'px' })
    mirror.append(document.createTextNode(el.value.slice(0, d.start)))
    const span = document.createElement('span'); span.textContent = d.quote; mirror.append(span); document.body.append(mirror)
    try {
      const range = document.createRange(); range.selectNodeContents(span)
      const lines = [...range.getClientRects()], first = lines[0], last = lines.at(-1)
      if (!first || !last) throw Error('逐字稿尚未显示。')
      return { start: { x: (first.left + 1) / innerWidth, y: (first.top + first.height / 2) / innerHeight }, end: { x: last.right / innerWidth, y: (last.top + last.height / 2) / innerHeight } }
    } finally { mirror.remove() }
  }
  throw Error('未知演示动作。')
}
