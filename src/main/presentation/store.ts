import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { load } from 'cheerio'
import { slideTitle } from '../../shared/presentation-slide-title'

export type Key = { owner: string; sessionId: string }
type Shape = {
  id: string
  type: string
  left: number
  top: number
  width: number
  height: number
  content?: string
  text?: { content: string }
  [key: string]: any
}
type Slide = { id: string; elements: Shape[]; remark?: string; marks?: Marker[]; [key: string]: any }
type ReferenceRange = { kind: string; slideId: string; start?: number; quote?: string }
type Marker = {
  id: string
  ordinal: number
  kind: 'point' | 'rect'
  region: { x: number; y: number; width: number; height: number }
  nodeIds: string[]
  comment: string
}
export type Deck = {
  id: string
  title: string
  slides: Slide[]
  viewportSize: number
  viewportRatio: number
  theme?: Record<string, unknown>
}
export type PresentationRecord = { revision: number; deck: Deck | null; canUndoAI?: boolean }
const identifier = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
const escape = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const paragraphs = (s: string) =>
  s
    .split('\n')
    .map((line) => '<p>' + escape(line) + '</p>')
    .join('')
const visibleText = (html = '') => {
  const $ = load(html, null, false)
  $('br').replaceWith('\n')
  $('p:not(:last-child)').append('\n')
  return $.root().text()
}
const validText = (v: unknown, label: string, max = 16000): string => {
  if (typeof v !== 'string' || v.length > max) throw Error(label + '无效。')
  return v
}
export function blankDeck(title = '未命名演示文稿'): Deck {
  return {
    id: randomUUID(),
    title,
    viewportSize: 1000,
    viewportRatio: 9 / 16,
    slides: [{ id: randomUUID(), elements: [] }]
  }
}
function validate(deck: Deck) {
  if (
    !deck ||
    !identifier(deck.id) ||
    !deck.title?.trim() ||
    deck.title.length > 256 ||
    !Number.isFinite(deck.viewportSize) ||
    deck.viewportSize < 100 ||
    deck.viewportSize > 10000 ||
    !Number.isFinite(deck.viewportRatio) ||
    deck.viewportRatio < 0.1 ||
    deck.viewportRatio > 10 ||
    !Array.isArray(deck.slides) ||
    !deck.slides.length ||
    deck.slides.length > 1000
  )
    throw Error('演示文稿格式无效。')
  const ids = new Set<string>()
  for (const slide of deck.slides) {
    if (
      !identifier(slide?.id) ||
      ids.has(slide.id) ||
      !Array.isArray(slide.elements) ||
      slide.elements.length > 5000
    )
      throw Error('幻灯片结构无效。')
    ids.add(slide.id)
    const elements = new Set<string>()
    for (const el of slide.elements) {
      if (!identifier(el?.id) || elements.has(el.id) || typeof el.type !== 'string')
        throw Error('幻灯片元素无效。')
      elements.add(el.id)
    }
  }
  const json = JSON.stringify(deck)
  if (Buffer.byteLength(json) > 96 * 1024 * 1024) throw Error('文稿超出 96 MB 编辑容量。')
  return json
}
function newText(content: string, title: boolean): Shape {
  return {
    type: 'text',
    id: randomUUID(),
    left: 48,
    top: title ? 40 : 142,
    width: 900,
    height: title ? 60 : 250,
    content: paragraphs(content).replaceAll('<p>', '<p style="font-size:' + (title ? 34 : 22) + 'px">'),
    defaultFontName: 'Microsoft YaHei',
    defaultColor: '#005298',
    rotate: 0
  }
}
export class PresentationStore {
  private db: DatabaseSync
  constructor(root: string) {
    mkdirSync(root, { recursive: true })
    this.db = new DatabaseSync(join(root, 'presentations.sqlite'))
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS decks(owner TEXT,session TEXT,id TEXT,title TEXT,document TEXT,PRIMARY KEY(owner,session,id));
      CREATE TABLE IF NOT EXISTS positions(owner TEXT,session TEXT,id TEXT,slide TEXT,PRIMARY KEY(owner,session,id));
      CREATE TABLE IF NOT EXISTS recent_use(owner TEXT,session TEXT,id TEXT,revision INTEGER,PRIMARY KEY(owner,session,id));
      CREATE TABLE IF NOT EXISTS history(owner TEXT,session TEXT,revision INTEGER,document TEXT,PRIMARY KEY(owner,session));
      CREATE TABLE IF NOT EXISTS active(owner TEXT,session TEXT,id TEXT,revision INTEGER,PRIMARY KEY(owner,session));`)
  }
  close() {
    this.db.close()
  }
  recent(key: Key) {
    return this.db
      .prepare(
        'SELECT d.id,d.title FROM decks d LEFT JOIN recent_use r USING(owner,session,id) WHERE d.owner=? AND d.session=? ORDER BY coalesce(r.revision,0) DESC,d.rowid DESC'
      )
      .all(key.owner, key.sessionId) as { id: string; title: string }[]
  }
  position(key: Key) {
    const row = this.db
      .prepare('SELECT slide FROM positions JOIN active USING(owner,session,id) WHERE owner=? AND session=?')
      .get(key.owner, key.sessionId)
    return row ? String(row.slide) : undefined
  }
  setPosition(key: Key, id: string, slide: string) {
    if (identifier(id) && identifier(slide))
      this.db
        .prepare(
          'INSERT OR REPLACE INTO positions SELECT owner,session,id,? FROM active WHERE owner=? AND session=? AND id=?'
        )
        .run(slide, key.owner, key.sessionId, id)
  }
  read(key: Key): PresentationRecord {
    const row = this.db
      .prepare(
        'SELECT a.revision,d.document, EXISTS(SELECT 1 FROM history h WHERE h.owner=a.owner AND h.session=a.session AND h.revision=a.revision) AS undo FROM active a JOIN decks d USING(owner,session,id) WHERE a.owner=? AND a.session=?'
      )
      .get(key.owner, key.sessionId)
    return row
      ? {
          revision: Number(row.revision),
          deck: JSON.parse(String(row.document)),
          canUndoAI: Boolean(row.undo)
        }
      : { revision: 0, deck: null }
  }
  private write(key: Key, revision: number, deck: Deck, allowSwitch: boolean, ai = false) {
    const document = validate(deck)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const current = this.db
        .prepare('SELECT revision,id FROM active WHERE owner=? AND session=?')
        .get(key.owner, key.sessionId)
      if (Number(current?.revision ?? 0) !== revision || (!allowSwitch && current?.id !== deck.id))
        throw Error('文稿已更新，请重新读取最新版本。')
      if (ai && current) {
        this.db
          .prepare(
            'INSERT OR REPLACE INTO history SELECT owner,session,?,document FROM decks WHERE owner=? AND session=? AND id=?'
          )
          .run(revision + 1, key.owner, key.sessionId, String(current.id))
      }
      this.db
        .prepare(
          'INSERT INTO decks VALUES (?,?,?,?,?) ON CONFLICT(owner,session,id) DO UPDATE SET title=excluded.title, document=excluded.document'
        )
        .run(key.owner, key.sessionId, deck.id, deck.title, document)
      this.db
        .prepare('INSERT OR REPLACE INTO active VALUES (?,?,?,?)')
        .run(key.owner, key.sessionId, deck.id, revision + 1)
      this.db
        .prepare('INSERT OR REPLACE INTO recent_use VALUES (?,?,?,?)')
        .run(key.owner, key.sessionId, deck.id, revision + 1)
      this.db.exec('COMMIT')
      return revision + 1
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  save(key: Key, revision: number, deck: Deck, create = false) {
    return this.write(key, revision, deck, create)
  }
  open(key: Key, revision: number, id: string) {
    const row = this.db
      .prepare('SELECT document FROM decks WHERE owner=? AND session=? AND id=?')
      .get(key.owner, key.sessionId, id)
    if (!row) throw Error('此会话中找不到该文稿。')
    const deck: Deck = JSON.parse(String(row.document))
    return { revision: this.write(key, revision, deck, true), deck }
  }
  undo(key: Key, revision: number) {
    const row = this.db
      .prepare('SELECT document FROM history WHERE owner=? AND session=? AND revision=?')
      .get(key.owner, key.sessionId, revision)
    if (!row) throw Error('当前版本没有可撤销的 AI 修改。')
    return this.write(key, revision, JSON.parse(String(row.document)), false)
  }
  inspect(key: Key, activeSlideId?: string, slideId?: string) {
    const { revision, deck } = this.read(key)
    if (!deck) return { revision, deck: null }
    const current =
      deck.slides.find((s) => s.id === (slideId || activeSlideId)) ?? (!slideId ? deck.slides[0] : undefined)
    if (!current) throw Error('未找到指定幻灯片。')
    return {
      revision,
      documentId: deck.id,
      title: deck.title,
      slides: deck.slides.map((s) => ({
        id: s.id,
        title: slideTitle(s, deck.viewportSize, deck.viewportRatio, visibleText)
      })),
      viewportSize: deck.viewportSize,
      viewportRatio: deck.viewportRatio,
      currentSlide: {
        id: current.id,
        notes: visibleText(current.remark),
        marks: current.marks ?? [],
        elements: current.elements.filter(e=>!e.odysseyMaster).map((e) => ({
          id: e.id,
          type: e.type,
          text: visibleText(e.content ?? e.text?.content),
          left: e.left,
          top: e.top,
          width: e.width,
          height: e.height,
          ...(e.type === 'chart' ? { chartType: e.chartType, data: e.data, themeColors: e.themeColors } : {}),
          ...(e.type === 'table'
            ? { cells: e.data?.map((r: any[]) => r.map((c) => visibleText(c.text))) }
            : {})
        }))
      }
    }
  }
  apply(key: Key, args: { revision: number; operations: Record<string, any>[]; createName?: string }, references: readonly ReferenceRange[] = []) {
    const { revision, deck: existing } = this.read(key)
    if (revision !== args.revision) throw Error('文稿版本已变化，请重新读取。')
    if (!existing && !args.createName) throw Error('空工作区需要指定 createName。')
    const deck = existing ?? blankDeck(validText(args.createName, '文稿名称', 256))
    if (!Array.isArray(args.operations) || args.operations.length > 200) throw Error('操作数量无效。')
    let firstNewSlide = !existing
    for (const op of args.operations) {
      if (op.op === 'rename') {
        deck.title = validText(op.text, '文稿名称', 256)
        continue
      }
      if (op.op === 'addSlide') {
        const title = validText(op.title ?? '', '标题'),
          body = validText(op.text ?? '', '正文')
        const slide = {
          id: randomUUID(),
          elements: [...(title ? [newText(title, true)] : []), ...(body ? [newText(body, false)] : [])]
        }
        if (firstNewSlide) {
          deck.slides[0] = slide
          firstNewSlide = false
        } else deck.slides.push(slide)
        continue
      }
      const slide = deck.slides.find((s) => s.id === op.slideId)
      if (!slide) throw Error('找不到目标幻灯片。')
      if (op.op === 'notes') {
        const original = visibleText(slide.remark),
          text = validText(op.text, '备注')
        const selected = references.filter(ref => ref.kind === 'notes' && ref.slideId === slide.id)
        const partial = op.quote !== undefined || op.start !== undefined
        if (selected.length || partial) {
          const range = partial ? op : selected.length === 1 ? selected[0] : undefined
          if (!range || !Number.isInteger(range.start) || range.start < 0 || typeof range.quote !== 'string' || !range.quote ||
              original.slice(range.start, range.start + range.quote.length) !== range.quote ||
              (selected.length && !selected.some(ref => ref.start === range.start && ref.quote === range.quote)))
            throw Error('备注选区已变化。请重新读取并使用本轮引用的原文。')
          const before = original.slice(0, range.start)
          const after = original.slice(range.start + range.quote.length)
          const preservesContext = text.length >= before.length + after.length && text.startsWith(before) && text.endsWith(after)
          if (!partial && !preservesContext) throw Error('整页备注须完整保留选区前后的原文。')
          if (selected.length && partial && (before || after) && preservesContext)
            throw Error('text 已包含选区外上下文。如提交完整备注，请省略 quote 和 start；局部替换只填写选区内的新文字。')
          slide.remark = paragraphs(partial ? before + text + after : text)
        } else slide.remark = paragraphs(text)
        continue
      }
      if (op.op === 'addText') {
        slide.elements.push(newText(validText(op.text, '文本'), false))
        continue
      }
      const el = slide.elements.find((e) => !e.odysseyMaster && e.id === op.elementId)
      if (!el) throw Error('找不到目标元素。')
      if (op.op === 'text') {
        const target = el.type === 'text' ? el : el.text
        if (!target) throw Error('此元素没有可编辑的文本。')
        // Keep the existing paragraph and leading run style for title replacements.
        const content = validText(op.text, '文本'),
          $ = load(target.content ?? '', null, false),
          first = $('p').first()
        if (first.length && !content.includes('\n')) {
          const outer = first.clone().empty()
          let source = first,
            dest = outer
          while (source.children().first().is('span,strong,b,em,i,u,s,a,sub,sup')) {
            source = source.children().first()
            const child = source.clone().empty()
            dest.append(child)
            dest = child
          }
          dest.text(content)
          target.content = $.html(outer)
        } else target.content = paragraphs(content)
      } else if (op.op === 'move') {
        for (const attr of ['left', 'top', 'width', 'height'] as const)
          if (op[attr] !== undefined) {
            if (
              !Number.isFinite(op[attr]) ||
              Math.abs(op[attr]) > 20000 ||
              (['width', 'height'].includes(attr) && op[attr] <= 0)
            )
              throw Error('元素尺寸无效。')
            el[attr] = op[attr]
          }
      } else if (
        op.op === 'chartPointColor' &&
        el.type === 'chart' &&
        ['bar', 'column'].includes(el.chartType)
      ) {
        const { seriesIndex, pointIndex, color } = op
        if (
          !Number.isInteger(seriesIndex) ||
          !Number.isInteger(pointIndex) ||
          !Number.isFinite(el.data.series?.[seriesIndex]?.[pointIndex]) ||
          typeof color !== 'string' ||
          !/^#[0-9a-f]{6}$/i.test(color)
        )
          throw Error('柱形索引或颜色无效。')
        const colors = el.data.pointColors ?? {}
        el.data = {
          ...el.data,
          pointColors: {
            ...colors,
            [seriesIndex]: { ...colors[seriesIndex], [pointIndex]: color.toUpperCase() }
          }
        }
      } else if (op.op === 'chartData' && el.type === 'chart') {
        const d = op.data
        if (
          !Array.isArray(d?.labels) ||
          !d.labels.length ||
          d.labels.length > 500 ||
          !Array.isArray(d.legends) ||
          !Array.isArray(d.series) ||
          !d.series.length ||
          d.series.length !== d.legends.length ||
          d.series.length > 32 ||
          ![...d.labels, ...d.legends].every((s) => typeof s === 'string' && s.length <= 256) ||
          !d.series.every(
            (row: any) => Array.isArray(row) && row.length === d.labels.length && row.every(Number.isFinite)
          )
        )
          throw Error('图表数据格式无效。')
        el.data = d
      } else if (op.op === 'tableCell' && el.type === 'table') {
        const cell = el.data?.[op.row]?.[op.column]
        if (!Number.isInteger(op.row) || !Number.isInteger(op.column) || !cell) throw Error('单元格不存在。')
        cell.text = escape(validText(op.text, '单元格'))
      } else throw Error('不支持的演示编辑操作。')
    }
    return { revision: this.write(key, revision, deck, !existing, true), documentId: deck.id, saved: true }
  }
}
