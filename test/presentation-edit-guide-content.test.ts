import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'cheerio'
import { strFromU8, unzipSync } from 'fflate'
import { expect, it } from 'vitest'
import { blankDeck, PresentationStore } from '../src/main/presentation/store'
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

it('reflows the marked native chart and writes notes through the store without changing any of its eight source values', () => {
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
    slide.elements.push({ id: 'marked-chart', type: 'chart', chartType: 'column', data, ...bounds })
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
    expect(chart.left).toBeCloseTo(28.8)
    expect(chart).toMatchObject({
      width: 450,
      data: { ...data, pointColors: { 1: { 0: '#CB482A', 2: '#CB482A' } } }
    })
    expect(edited.elements.find(el => el.text === guide.chart.caption)).toBeDefined()
    expect(edited.elements.find(el => el.text.includes('相差 3.1 个百分点'))!.left).toBeGreaterThan(chart.left + chart.width)
    expect(edited.elements.find(el => el.id === 'source-10')).toEqual(original.elements.find(el => el.id === 'source-10'))
  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
