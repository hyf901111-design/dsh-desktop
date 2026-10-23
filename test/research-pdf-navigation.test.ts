import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fillPublicationPages, publicationSlots, readPublicationPagination, researchPdfModules, samePublicationPagination, type PublicationPagination } from '../src/main/research/research-pdf-navigation'
import { paginationPdf } from './helpers/research-pagination-pdf'

const html = '<title>正式名</title><nav><a href="#section-business" data-publication-target="section-business"><span>公司业务</span><span data-publication-page="section-business">—</span></a><a href="#chart-1" data-publication-target="chart-1"><span>专题图</span><span data-publication-page="chart-1">—</span></a></nav><h2 id="section-business">公司业务</h2><figure id="chart-1">原始正文与数值逐字保留。</figure>'
const modules = () => researchPdfModules({ packaged: false, resourcesPath: '', appPath: process.cwd() })
const signal = () => new AbortController().signal
const temporary: string[] = []
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('publication navigation slots and actual PDF destinations', () => {
  it('changes only page-slot content while preserving prose, links and markup exactly', () => {
    const slots = publicationSlots(html)
    expect(slots.map(slot => slot.target)).toEqual(['section-business', 'chart-1'])
    expect(fillPublicationPages(html, slots, { pageCount: 4, pages: { 'section-business': 3, 'chart-1': 4 } })).toBe(html.replace('data-publication-page="section-business">—', 'data-publication-page="section-business">3').replace('data-publication-page="chart-1">—', 'data-publication-page="chart-1">4'))
    expect(publicationSlots('<p>&lt;span data-publication-page="chart-1"&gt;</p>')).toEqual([])
  })

  it.each([
    html.replace('href="#chart-1"', 'href="https://example.com/"'),
    html + '<p id="chart-1">重复</p>',
    html.replace('<figure id="chart-1">', '<figure>'),
    html.replace('data-publication-page="chart-1">—', 'data-publication-page="chart-1"><b>—</b>'),
    html.replace('data-publication-page="chart-1"', 'data-publication-page="source-ledger"'),
    html.replace('data-publication-target="chart-1"', 'data-publication-target="not-a-publication-target"'),
    html.replace('data-publication-page="chart-1">—', 'data-publication-page="chart-1">猜测'),
    html.replace('<span data-publication-page="chart-1">—</span>', '')
  ])('rejects ambiguous or uncontrolled slot markup', value => expect(() => publicationSlots(value)).toThrow())

  it('does not fill missing, extra, fractional or out-of-range destination maps', () => {
    const slots = publicationSlots(html)
    const invalidMaps: PublicationPagination[] = [
      { pageCount: 4, pages: { 'section-business': 3 } },
      { pageCount: 4, pages: { 'section-business': 3, 'chart-1': 4, extra: 1 } },
      { pageCount: 4, pages: { 'section-business': 3.5, 'chart-1': 4 } },
      { pageCount: 4, pages: { 'section-business': 3, 'chart-1': 5 } },
      { pageCount: 1000, pages: { 'section-business': 3, 'chart-1': 4 } }
    ]
    for (const pagination of invalidMaps) expect(() => fillPublicationPages(html, slots, pagination)).toThrow()
    expect(samePublicationPagination({ pageCount: 4, pages: { 'chart-1': 3 } }, { pageCount: 4, pages: { 'chart-1': 4 } })).toBe(false)
    expect(samePublicationPagination({ pageCount: 4, pages: { 'chart-1': 3 } }, { pageCount: 5, pages: { 'chart-1': 3 } })).toBe(false)
  })

  it('resolves real named destinations by PDF object reference, without matching repeated title text', async () => {
    expect(await readPublicationPagination(paginationPdf({ 'section-business': 3, 'chart-1': 4 }), ['section-business', 'chart-1'], modules(), signal())).toEqual({ pageCount: 4, pages: { 'section-business': 3, 'chart-1': 4 } })
    await expect(readPublicationPagination(paginationPdf({ 'section-business': 3 }), ['section-business', 'chart-1'], modules(), signal())).rejects.toThrow()
  })

  it('stops parser work on cancellation and rejects excess pages or targets', async () => {
    const controller = new AbortController(), pending = readPublicationPagination(paginationPdf({ 'chart-1': 2 }), ['chart-1'], modules(), controller.signal)
    controller.abort(Error('cancelled-parser'))
    await expect(pending).rejects.toThrow('cancelled-parser')
    await expect(readPublicationPagination(paginationPdf({ 'chart-1': 2 }, 1000), ['chart-1'], modules(), signal())).rejects.toThrow()
    await expect(readPublicationPagination(paginationPdf({ 'chart-1': 2 }), Array.from({ length: 513 }, (_, i) => 'chart-' + (i + 1)), modules(), signal())).rejects.toThrow()
  })

  it('uses the packaged offline profile and fails closed when its worker file is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-pdf-modules-')); temporary.push(root)
    const build = join(root, 'sherlock-plugin-profile/modules/pdfjs-dist/legacy/build')
    await mkdir(build, { recursive: true }); await writeFile(join(build, 'pdf.mjs'), '/* path fixture */')
    expect(() => researchPdfModules({ packaged: true, resourcesPath: root, appPath: process.cwd() })).toThrow()
    await writeFile(join(build, 'pdf.worker.mjs'), '/* path fixture */')
    expect(researchPdfModules({ packaged: true, resourcesPath: root, appPath: process.cwd() })).toEqual({ library: join(build, 'pdf.mjs'), worker: join(build, 'pdf.worker.mjs') })
  })
})
