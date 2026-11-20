import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { blankDeck, PresentationStore } from '../src/main/presentation/store'

const key = { owner: 'alice', sessionId: 'review' }
let store: PresentationStore
let directory: string
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ework-presentation-'))
  store = new PresentationStore(directory)
})
afterEach(() => {
  store.close()
  rmSync(directory, { recursive: true, force: true })
})

it('keeps each deck, its current slide and the recent order across launches', () => {
  const first = blankDeck('年度回顾')
  first.slides.push({ id: 'next', elements: [] })
  const other = blankDeck('专题汇报')
  store.save(key, 0, first, true)
  store.setPosition(key, first.id, 'next')
  store.save(key, 1, other, true)
  store.open(key, 2, first.id)
  store.close()
  store = new PresentationStore(directory)
  expect(store.position(key)).toBe('next')
  expect(store.recent(key).map((item) => item.id)).toEqual([first.id, other.id])
  expect(store.read({ ...key, owner: 'bob' }).deck).toBeNull()
  expect(store.read({ ...key, sessionId: 'another' }).deck).toBeNull()
})

it('persists edit locks per account and session, including empty sessions', () => {
  const other = { ...key, sessionId: 'other' }
  store.setLocked(key, true)
  store.setLocked(key, true)
  store.close()
  store = new PresentationStore(directory)
  expect(store.isLocked(key)).toBe(true)
  expect(store.isLocked(other)).toBe(false)
  expect(store.isLocked({ ...key, owner: 'bob' })).toBe(false)
  store.setLocked(other, true)
  store.remove(key)
  expect(store.isLocked(key)).toBe(false)
  expect(store.isLocked(other)).toBe(true)
  store.setLocked(other, false)
  expect(store.isLocked(other)).toBe(false)
})

it('preserves surrounding notes when the assistant supplies the finished paragraph', () => {
  const deck = blankDeck()
  const slide = deck.slides[0]!
  slide.remark = '<p>先说营收，再说续约。</p>'
  store.save(key, 0, deck, true)
  const ref = { kind: 'notes', slideId: slide.id, start: 0, quote: '先说营收' }
  const operation = { op: 'notes', slideId: slide.id, text: '先讲增长，再说续约。' }
  const apply = (op: Record<string, unknown>) => store.apply(key, { revision: 1, operations: [op] }, [ref])
  expect(() => apply({ ...operation, quote: ref.quote, start: ref.start })).toThrow('上下文')
  expect(() => apply({ ...operation, text: '先讲增长。' })).toThrow('选区前后')
  expect(store.read(key).revision).toBe(1)
  apply(operation)
  expect(store.inspect(key).currentSlide?.notes).toBe(operation.text)
})

it('edits the quoted notes and selected title atomically and preserves their neighbors', () => {
  const draft = blankDeck()
  const slide = draft.slides[0]!
  slide.remark = '<p>先讲营收，再讲续约。</p>'
  slide.elements.push({
    id: 'title',
    type: 'text',
    left: 20,
    top: 20,
    width: 400,
    height: 40,
    content: '<p style="text-align:center"><strong><span style="color:#005298">旧</span></strong>标题</p>'
  })
  store.save(key, 0, draft, true)
  store.apply(key, {
    revision: 1,
    operations: [
      { op: 'text', slideId: slide.id, elementId: 'title', text: '营收增长' },
      { op: 'notes', slideId: slide.id, start: 2, quote: '营收', text: '季度营收' }
    ]
  })
  const result = store.read(key).deck!.slides[0]!
  expect(result.elements[0]!.content).toContain(
    '<strong><span style="color:#005298">营收增长</span></strong>'
  )
  expect(store.inspect(key).currentSlide?.notes).toBe('先讲季度营收，再讲续约。')
  expect(() => store.save(key, 1, draft)).toThrow()
  expect(() =>
    store.apply(key, {
      revision: 2,
      operations: [
        { op: 'rename', text: '不应保存' },
        { op: 'notes', slideId: slide.id, start: 2, quote: '营收', text: '旧选区' }
      ]
    })
  ).toThrow()
  expect(store.read(key).deck?.title).toBe(draft.title)
  store.undo(key, 2)
  expect(store.read(key).deck).toEqual(draft)
})

it('supports a blank first page followed by an AI-created content slide', () => {
  store.apply(key, {
    revision: 0,
    createName: '三季度复盘',
    operations: [{ op: 'addSlide' }, { op: 'addSlide', title: '季度经营表现', text: '九月续约带动增长。' }]
  })
  const deck = store.read(key).deck!
  expect(deck.slides.map((s) => s.elements.length)).toEqual([0, 2])
  expect(store.inspect(key, deck.slides[1]!.id).currentSlide?.elements[0]?.text).toBe('季度经营表现')
})

it('colors individual chart bars and preserves neighboring series, values and undo', () => {
  const deck = blankDeck()
  const slide = deck.slides[0]!
  const data = {
    labels: ['七月', '八月', '九月'],
    legends: ['营收', '预算'],
    series: [
      [2380, 2600, 2960],
      [2400, 2500, 2700]
    ]
  }
  slide.elements.push({
    id: 'chart',
    type: 'chart',
    chartType: 'column',
    left: 100,
    top: 100,
    width: 500,
    height: 300,
    data
  })
  store.save(key, 0, deck, true)
  const point = {
    op: 'chartPointColor',
    slideId: slide.id,
    elementId: 'chart',
    seriesIndex: 0,
    pointIndex: 2,
    color: '#99ccee'
  }
  store.apply(key, { revision: 1, operations: [point] })
  expect(store.read(key).deck!.slides[0]!.elements[0]!.data).toEqual({
    ...data,
    pointColors: { 0: { 2: '#99CCEE' } }
  })
  expect(() => store.apply(key, { revision: 2, operations: [point, { ...point, seriesIndex: 2 }] })).toThrow()
  store.undo(key, 2)
  expect(store.read(key).deck).toEqual(deck)
})

it('uses imported PowerPoint shape text as a slide caption', () => {
  const deck = blankDeck()
  deck.slides[0]!.elements = [
    {
      type: 'shape',
      id: 'titleBox',
      left: 30,
      top: 12,
      width: 480,
      height: 60,
      text: { content: '<p style="font-size:32px">季度经营表现</p>' }
    }
  ]
  store.save(key, 0, deck, true)
  expect(store.inspect(key).slides?.[0]?.title).toBe('季度经营表现')
})

it('lets normal agent tools page through slide content and change a chart type without replacing its data', () => {
  const deck = blankDeck('汇报')
  deck.slides = Array.from({ length: 7 }, (_, i) => ({ id: 'slide-' + i, elements: [
    { id: 'title-' + i, type: 'text', left: 20, top: 20, width: 400, height: 60, content: '<p>经营回顾 ' + i + '</p>' },
    { id: 'chart-' + i, type: 'chart', left: 20, top: 100, width: 500, height: 260, chartType: 'column', data: { labels: ['一月'], legends: ['营收'], series: [[42]] } }
  ] }))
  store.save(key, 0, deck, true)
  const first = store.inspect(key, undefined, undefined, 1)
  expect(first.pages?.map(page => page.id)).toEqual(deck.slides.slice(0, 5).map(s => s.id))
  expect(first.pages?.[0]?.content).toContain('42')
  expect(first.nextPage).toBe(6)
  expect(store.inspect(key, undefined, undefined, first.nextPage!).nextPage).toBeNull()
  store.apply(key, { revision: 1, operations: [
    ...deck.slides.map(s => ({ op: 'notes', slideId: s.id, text: '逐字稿 ' + s.id })),
    { op: 'chartType', slideId: 'slide-3', elementId: 'chart-3', chartType: 'bar' },
    { op: 'text', slideId: 'slide-0', elementId: 'title-0', text: '一月营收为 42' }
  ] })
  const saved = store.read(key).deck!
  expect(saved.slides.every(s => s.remark?.includes(s.id))).toBe(true)
  expect(saved.slides[3]!.elements[1]).toEqual({ ...deck.slides[3]!.elements[1], chartType: 'bar' })
})
