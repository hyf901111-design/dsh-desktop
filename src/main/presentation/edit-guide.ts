import {
  PRESENTATION_EDIT_GUIDE_CONTENT as content,
  createPresentationGuideChartOperations
} from '../../shared/presentation-edit-guide-content'
import type { Key, PresentationStore } from './store'

export function editGuideDocument(
  store: PresentationStore,
  key: Key,
  input: {
    stage?: 'notes' | 'chart' | 'title' | 'notes-selection'
    documentId?: string
    tableMarkId?: string
    referenceId?: string
  }
) {
  const state = store.inspect(key, store.position(key))
  const slide = state.currentSlide
  if (
    !slide ||
    !state.slides ||
    state.slides.length !== content.notes.length ||
    state.title !== content.filename.replace(/\.pptx$/i, '') ||
    (input.documentId && input.documentId !== state.documentId)
  )
    throw Error('请从知识库导入本用例的研究简报。')
  const page = state.slides.findIndex((s) => s.id === slide.id) + 1
  if (!input.stage) return { documentId: state.documentId, count: state.slides.length, page }
  if (input.documentId !== state.documentId) throw Error('演示文稿已切换。')
  let operations: Record<string, unknown>[]
  if (input.stage === 'notes') {
    operations = state.slides.map((s, i) => ({ op: 'notes', slideId: s.id, text: content.notes[i] }))
  } else if (input.stage === 'chart') {
    const chartSlide = store.inspect(key, state.slides[content.chart.page - 1]!.id).currentSlide!
    const markedElement = (target: typeof slide, markId: string | undefined, comment: string, type: string) => {
      const mark = target.marks.find((m: any) => m.id === markId && m.kind === 'rect' && m.comment === comment)
      return target.elements.find(e => e.type === type && mark?.nodeIds?.includes(e.id))
    }
    const chart = markedElement(chartSlide, input.referenceId, content.chart.comment, 'chart')
    const table = markedElement(slide, input.tableMarkId, content.table.comment, 'table')
    if (page !== content.table.page || !chart || !table) throw Error('请先在两页分别框选图表和表格并填写修改意见。')
    operations = [...createPresentationGuideChartOperations(chartSlide, state.viewportSize!, chart.id),
      { op: 'tableVerticalAlign', slideId: slide.id, elementId: table.id, vAlign: 'middle' }]
  } else if (input.stage === 'title') {
    const title = slide.elements.find(
      (e) => e.id === input.referenceId && e.text.trim() === content.title.original
    )
    if (page !== content.title.page || !title) throw Error('标题引用已变化。')
    operations = [{ op: 'text', slideId: slide.id, elementId: title.id, text: content.title.replacement }]
  } else if (input.stage === 'notes-selection') {
    const selection = content.notesSelection
    if (page !== selection.page || slide.notes.slice(selection.start, selection.start + selection.quote.length) !== selection.quote)
      throw Error('演讲稿选区已变化。')
    operations = [{ op: 'notes', slideId: slide.id, start: selection.start, quote: selection.quote, text: selection.replacement }]
  } else throw Error('未知演示步骤。')
  store.apply(key, { revision: state.revision, operations })
  return { documentId: state.documentId, count: state.slides.length, page }
}
