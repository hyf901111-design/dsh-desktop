import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'cheerio'
import { strFromU8, unzipSync } from 'fflate'
import { expect, it } from 'vitest'
import { blankDeck, PresentationStore } from '../src/main/presentation/store'
import { editGuideDocument } from '../src/main/presentation/edit-guide'
import { createPresentationGuideChartOperations, PRESENTATION_EDIT_GUIDE_CONTENT as guide } from '../src/shared/presentation-edit-guide-content'

const asset = new URL('../packages/dsh-research-task-runtime/assets/home-presentation/company-research-briefing.pptx', import.meta.url)
const files = unzipSync(readFileSync(asset))
const xml = (path: string) => load(strFromU8(files[path]!), { xmlMode: true })
const presentation = xml('ppt/presentation.xml')
const presentationRels = xml('ppt/_rels/presentation.xml.rels')
const slideFiles = presentation('p\\:sldId').toArray().map(node => {
  const relationship = presentation(node).attr('r:id')
  return 'ppt/' + presentationRels(`Relationship[Id="${relationship}"]`).attr('Target')
})

it('has an original spoken script for every physical page, including all four chapter changes and the closing', () => {
  expect(slideFiles).toHaveLength(20)
  expect(new Set(guide.notes).size).toBe(slideFiles.length)
  expect(guide.notes).toHaveLength(slideFiles.length)
  expect(guide.notes.every(note => note.split('\n').length === 2 && note.length > 55)).toBe(true)
  for (const page of [2, 6, 11, 15]) {
    const slide = xml(slideFiles[page - 1]!)
    expect(slide('a\\:t').first().text()).toBe('目录')
  }
  expect(guide.notes[0]).toContain('Vanguard')
  expect(guide.notes[19]).toContain('第 13 页')
  expect(guide.reviewPages.every(page => Number.isInteger(page) && page >= 1 && page <= slideFiles.length)).toBe(true)
  const titleSlide = xml(slideFiles[guide.title.page - 1]!)
  expect(titleSlide('[name="page-title"]').closest('p\\:sp').find('a\\:t').text()).toBe(guide.title.original)
})

it('changes only the marked chart type, preserving layout, palette and all eight source values', () => {
  const path = slideFiles[guide.chart.page - 1]!
  const slideXml = xml(path)
  const chartRelationship = slideXml('c\\:chart').attr('r:id')
  const links = xml(path.replace('slides/', 'slides/_rels/') + '.rels')
  const target = links(`Relationship[Id="${chartRelationship}"]`).attr('Target')!
  const chartXml = xml(new URL(target, 'https://example.invalid/' + path).pathname.slice(1))
  const chartSeries = chartXml('c\\:ser').toArray()
  const series = chartSeries.map(node =>
    chartXml(node).find('c\\:val c\\:pt c\\:v').toArray().map(point => Number(chartXml(point).text()))
  )
  expect(series).toEqual([[1, 1.1, 0.1, 0.5], [1.7, 0.8, 3.8, 0.7]])
  const data = {
    series,
    labels: chartXml(chartSeries[0]).find('c\\:cat c\\:pt c\\:v').toArray().map(node => chartXml(node).text()),
    legends: chartSeries.map(node => chartXml(node).find('c\\:tx c\\:v').text())
  }
  const directory = mkdtempSync(join(tmpdir(), 'presentation-edit-guide-'))
  const store = new PresentationStore(directory)
  try {
    const key = { owner: 'reader', sessionId: 'guide' }
    const deck = blankDeck(guide.filename)
    deck.viewportSize = 720
    const slide = deck.slides[0]!
    const bounds = { left: 0, top: 0, width: 120, height: 60 }
    slide.elements = slideXml('p\\:sp').toArray().map(node => ({
      id: slideXml(node).find('p\\:cNvPr').attr('name')!, type: 'text', ...bounds,
      content: '<p>' + slideXml(node).find('a\\:t').text() + '</p>'
    }))
    slide.elements.push({ id: 'marked-chart', type: 'chart', chartType: 'bar', data, themeColors: ['#1EB9E1', '#005096'], ...bounds })
    store.save(key, 0, deck, true)
    const original = store.inspect(key).currentSlide!
    expect(original.elements.find(el => el.text === guide.chart.titleHint)).toBeDefined()
    expect(() => createPresentationGuideChartOperations(original, deck.viewportSize, 'page-title')).toThrow()
    const operations = createPresentationGuideChartOperations(original, deck.viewportSize, 'marked-chart')
    store.apply(key, { revision: 1, operations: [
      { op: 'notes', slideId: slide.id, text: guide.notes[guide.chart.page - 1] },
      ...operations
    ] })
    const edited = store.inspect(key).currentSlide!
    expect(edited.notes).toBe(guide.notes[guide.chart.page - 1])
    expect(createPresentationGuideChartOperations(edited, deck.viewportSize, 'marked-chart')).toEqual(operations)
    const chart = edited.elements.find(el => el.id === 'marked-chart')!
    const before = original.elements.find(el => el.id === 'marked-chart')!
    expect(chart).toEqual({ ...before, chartType: 'column' })
    expect(edited.elements.filter(el => el.id !== chart.id)).toEqual(original.elements.filter(el => el.id !== chart.id))
    expect(guide.notes[guide.notesSelection.page - 1]!.slice(guide.notesSelection.start, guide.notesSelection.start + guide.notesSelection.quote.length)).toBe(guide.notesSelection.quote)

  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

it('rewrites only the selected passage in the speaker notes and rejects an outdated selection', () => {
  const directory = mkdtempSync(join(tmpdir(), 'presentation-guide-notes-'))
  const store = new PresentationStore(directory)
  try {
    const key = { owner: 'reader', sessionId: 'guide-notes' }, deck = blankDeck(guide.filename.replace(/\.pptx$/, ''))
    deck.slides = guide.notes.map((text, i) => ({ id: 'page-' + i, elements: [], remark: text.split('\n').map(p => '<p>' + p + '</p>').join('') }))
    store.save(key, 0, deck, true)
    const selection = guide.notesSelection, slide = deck.slides[selection.page - 1]!
    store.setPosition(key, deck.id, slide.id)
    editGuideDocument(store, key, { documentId: deck.id, stage: 'notes-selection' })
    const changed = store.inspect(key, slide.id).currentSlide!
    expect(changed.notes).toBe(guide.notes[selection.page - 1]!.replace(selection.quote, selection.replacement))
    expect(store.inspect(key, deck.slides[0]!.id).currentSlide!.notes).toBe(guide.notes[0])
    expect(() => editGuideDocument(store, key, { documentId: deck.id, stage: 'notes-selection' })).toThrow('选区已变化')
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }) }
})

it('applies both page marks together and preserves every other table style and chart value', () => {
  const directory = mkdtempSync(join(tmpdir(), 'presentation-guide-marks-'))
  const store = new PresentationStore(directory)
  try {
    const key = { owner: 'reader', sessionId: 'two-marks' }
    const deck = blankDeck(guide.filename.replace(/\.pptx$/, ''))
    deck.slides = guide.notes.map((_, i) => ({ id: 'page-' + i, elements: [] }))
    const chart = deck.slides[guide.chart.page - 1]!, table = deck.slides[guide.table.page - 1]!
    const bounds = { left: 15, top: 40, width: 500, height: 160 }
    chart.elements.push({ ...bounds, id: 'chart', type: 'chart', chartType: 'bar', data: { series: [[1, 3], [2, 4]] } })
    const cells = [[{ text: '概率', style: { align: 'right', vAlign: 'top' } }], [{ text: '60%', style: { align: 'right' } }]]
    table.elements.push({ ...bounds, id: 'table', type: 'table', data: cells, rowHeights: [40, 60] })
    const mark = { id: 'a', ordinal: 1, kind: 'rect' as const, region: { x: 0, y: 0, width: 1, height: 1 }, nodeIds: ['chart'], comment: guide.chart.comment }
    chart.marks = [mark]
    table.marks = [{ ...mark, id: 'b', ordinal: 2, nodeIds: ['table'], comment: guide.table.comment }]
    store.save(key, 0, deck, true)
    store.setPosition(key, deck.id, table.id)
    const request = { stage: 'chart' as const, documentId: deck.id, referenceId: 'a', tableMarkId: 'b' }
    expect(() => editGuideDocument(store, key, { ...request, tableMarkId: 'missing' })).toThrow()
    expect(store.read(key).revision).toBe(1)
    editGuideDocument(store, key, request)
    const result = store.read(key)
    expect(result.revision).toBe(2)
    expect(result.deck!.slides[9]!.elements[0]).toEqual({ ...chart.elements[0], chartType: 'column' })
    expect(result.deck!.slides[11]!.elements[0]).toEqual({ ...table.elements[0], data: cells.map(row => row.map(c => ({ ...c, style: { ...c.style, vAlign: 'middle' } }))) })
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }) }
})
