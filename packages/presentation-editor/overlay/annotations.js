import { attachPptxAnnotationViewer } from './native-annotations.mjs'
import { selectedBars } from './chart-points'
import style from './native-annotations.css?raw'

const names = [
  'rect14-selected',
  'point14-normal',
  'pin28-normal',
  'pin28-selected',
  'pin20-selected',
  'close16'
]
export function attachEditorMarks(host, store, documentId, reference, snapshot, isReferenced) {
  let selectedId = null,
    revealSeq = 0
  const marks = () =>
    store.slides.flatMap((slide, index) =>
      (slide.marks || []).map((m) => ({
        ...m,
        slideIndex: index,
        slidePart: slide.id,
        fileVersion: documentId,
        referenced: isReferenced(m.id)
      }))
    )
  const listeners = new Set()
  const redraw = () => listeners.forEach((fn) => fn())
  const select = (id) => {
    selectedId = id
    revealSeq++
    redraw()
  }
  const find = (id) => store.slides.flatMap((s) => s.marks || []).find((m) => m.id === id)
  const addRef = (id) => {
    const mark = marks().find((m) => m.id === id)
    if (mark)
      reference({ kind: 'mark', slideId: mark.slidePart, id, label: '标注 ' + mark.ordinal, explicit: true })
  }
  const handle = {
    getSnapshot: () => ({
      active: true,
      basis: { documentId, fileVersion: documentId },
      selectedId,
      revealSeq,
      marks: marks(),
      scene: {
        slides: store.slides.map((s, index) => ({
          part: s.id,
          index,
          nodes: s.elements.filter(e=>!e.odysseyMaster).map((e) => ({ id: e.id, nodeId: e.id, part: s.id, name: e.name || '' }))
        }))
      }
    }),
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    select,
    add(target) {
      const slide = store.slides[target.slideIndex],
        id = crypto.randomUUID(),
        r = target.region
      const w = store.viewportSize,
        h = w * store.viewportRatio
      const overlaps = (e) =>
        e.left / w <= r.x + (r.width || 0) &&
        (e.left + e.width) / w >= r.x &&
        e.top / h <= r.y + (r.height || 0) &&
        (e.top + e.height) / h >= r.y
      const ids = target.nodeIds.length ? target.nodeIds : slide.elements.filter(e=>!e.odysseyMaster && overlaps(e)).map((e) => e.id)
      const mark = {
        id,
        ordinal: Math.max(0, ...marks().map((m) => m.ordinal)) + 1,
        kind: target.kind,
        region: r,
        nodeIds: ids,
        chartPoints: selectedBars(host, r),
        comment: ''
      }
      slide.marks = [...(slide.marks || []), mark]
      select(id)
      addRef(id)
      snapshot()
    },
    remove(id) {
      for (const s of store.slides)
        if (s.marks?.some((m) => m.id === id)) s.marks = s.marks.filter((m) => m.id !== id)
      select(null)
      reference({ kind: 'removed-mark', id })
      snapshot()
    },
    readd: addRef,
    updateComment(id, text) {
      const mark = find(id)
      if (mark) {
        mark.comment = text
        redraw()
        snapshot()
      }
    },
    undo() {
      document.dispatchEvent(new Event('odyssey:undo'))
    }
  }
  const viewer = attachPptxAnnotationViewer(host, {
    handle,
    style,
    viewerKey: documentId,
    assets: Object.fromEntries(names.map((k) => [k, new URL('./markers/' + k + '.svg', location.href).href])),
    slideElements: (item) => {
      const area = item.querySelector('.viewport-wrapper')
      return area ? { wrapper: area, content: area } : undefined
    },
    getViewer: () => ({ goToSlide: (index) => store.updateSlideIndex(index) })
  })
  return { ...viewer, redraw }
}
