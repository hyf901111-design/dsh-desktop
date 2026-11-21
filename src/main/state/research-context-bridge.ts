import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { parseResearchHtmlArtifact, researchHtmlText } from '../../../packages/dsh-research-task-runtime/html-artifact.js'
import { homeWorkbenchStudyModel, parseHomeWorkbenchStudySpec } from '../../../packages/dsh-research-task-runtime/home-workbench-study-contract.js'
import { stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { extname } from 'node:path'
import { registerTrustedMainWindowHandler, type TrustedWindow, type TrustedWindowEvent } from '../ipc-trust'
import type { ResearchCanvasStorage } from './research-canvas-storage'

const CAPTURE_TTL_MS = 10 * 60 * 1000
const MAX_BODY_BYTES = 8192
const MAX_PDF_BODY_BYTES = 64 * 1024 * 1024
const MAX_PDF_HTML_BYTES = 4 * 1024 * 1024
const SUPPORTED_EXTENSIONS = new Set('.c .cc .cpp .css .csv .go .h .hpp .html .java .js .json .jsx .kt .log .md .mjs .py .rb .rs .sh .sql .swift .toml .ts .tsx .txt .xml .yaml .yml .pdf .pptx'.split(' '))
type Node = Record<string, unknown>
export type ResearchContextSource = { id: string; title: string; kind: string; text: string; status: string; path?: string; revision?: { size: number; mtimeMs: number }; truncated?: boolean; sourceNodeIds?: string[]; sourceUrl?: string }
type Source = ResearchContextSource
type Canvas = { files: unknown[]; artifacts: unknown[] }
type Capture = { sessionId: string; createdAt: number; sources: Source[]; bytes: number }
type Options = {
  sessionCompleted?(value: { sessionId: string; seq: number; title: string; preview: string }): void
  canvasAction?(value: unknown,signal?:AbortSignal): Promise<unknown>
  clientCapability?(value:unknown,signal?:AbortSignal):Promise<unknown>
  researchPdf?(html: string, signal?: AbortSignal): Promise<unknown>
  scheduledTask?(value: unknown): Promise<unknown>
  imageTitleEvidence?(sessionId: string): Promise<{owned:boolean;tabTitle?:string;canvasTitle?:string}>
  canReadSession?(sessionId: string): boolean
  isSharedSession?(sessionId:string):boolean
  additionalSources?(sessionId:string):Source[]|Promise<Source[]>
  readCanvas(sessionId: string): Canvas | Promise<Canvas>
  resolveFile(value: { sessionId: string; nodeId: string; authorizationId: string }): Promise<{ path: string; name: string } | null>
  now?: () => number
  maxCaptures?: number
  maxStoredBytes?: number
}

function record(value: unknown): Node {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('资料参数无效。')
  return value as Node
}
function id(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= 256 }
function text(value: unknown, limit = 120_000): string { return typeof value === 'string' ? value.slice(0, limit).trim() : '' }
function exact(value: unknown, keys: string[]): Node {
  const input = record(value)
  if (Object.keys(input).length !== keys.length || keys.some((key) => !id(input[key]))) throw new Error('资料参数无效。')
  return input
}
function publicCanvasAction(value: unknown): Node {
  const input = record(value)
  if (Object.keys(input).length !== 3 || !Object.hasOwn(input, 'args') || !id(input.sessionId) || !id(input.method)) throw new Error('画布参数无效。')
  record(input.args)
  return { sessionId: input.sessionId, method: input.method, args: input.args }
}
function publicUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 8192) return undefined
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    url.username = ''; url.password = ''; url.search = ''; url.hash = ''
    return url.href.slice(0, 2048)
  } catch { return undefined }
}
// Resolve the same frozen model as the visible study card. The declarative spec
// contains selections, not report facts; serializing it alone loses the evidence.
function studyText(value: unknown): string {
  const spec = parseHomeWorkbenchStudySpec(value)
  if (!spec) return ''
  const model = homeWorkbenchStudyModel(spec)
  if (!model.available) return ''
  const { company, expansion, valuation, dividend, document: report } = model
  const number = (value: number, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : '未提供'
  const amount = (value: number) => number(value / 1e8)
  const percent = (value: number) => number(value) + '%'
  const change = (current: number, prior: number) => prior === 0 ? '不可比（上期为0）' : percent((current / prior - 1) * 100)
  const table = (headers: string[], rows: unknown[][]) => [headers, ...rows].map(row => row.join(' | ')).join('\n')
  const scope = ['peers', 'news'].includes(spec.studyRole) ? '白酒龙头固定三家公司' : `${company.name}（${company.id}）`
  const lines = [`${scope} · 历史快照 ${model.snapshot}，非实时数据。`]
  const distribution = () => {
    lines.push(table(['分配事项', '每股/元', '状态', '实施/披露'], [
      ['2025中期', number(company.interim, 3), '已实施', company.interimDate],
      ['2025年度', number(company.final, 3), '年度预案尚未实施', company.reportDate],
      ['年度合计（含预案）', number(dividend.combined, 3), '含尚未实施部分', model.snapshot]
    ]), `年度分配/快照价 ${percent(dividend.annualYield)}；年度预案/快照价 ${percent(dividend.pendingYield)}；每股分配/EPS ${percent(dividend.payout)}。`, '全部金额为税前历史参考；已付中期分红不代表快照日买入后可取得，每股测算不替代公司公告总额口径。')
  }
  switch (spec.studyRole) {
    case 'disclosure':
      lines.push(table(['披露项目', '本期值', '同比'], [
        ['2025营业收入/亿元', amount(company.revenue[2]), change(company.revenue[2], company.revenue[1])],
        ['2025归母净利润/亿元', amount(company.profit[2]), change(company.profit[2], company.profit[1])],
        ['2025基本EPS/元', number(company.eps, company.id === '000858' ? 4 : 2), change(company.eps, expansion.annualEpsPrev)],
        ['2026Q1营业收入/亿元', amount(company.quartersRevenue[4]), percent(company.revYoy)],
        ['2026Q1归母净利润/亿元', amount(company.quartersProfit[4]), percent(company.profitYoy)],
        ['2026Q1经营现金流/亿元', amount(company.qCash), change(company.qCash, expansion.priorQCash)]
      ]), '季度报告未经审计；EPS为年报基本每股收益。', company.note)
      break
    case 'performance': {
      const period = model.performance
      lines.push(period.period === 'quarter' ? '单季口径；2026Q1未经审计，单季数按披露数计算。' : '年度口径；2023—2025可比数据。', table(['亿元', ...period.labels], [
        ['营业收入', ...period.revenue.map(amount)], ['归母净利润', ...period.profit.map(amount)]
      ]), `2026Q1营收同比 ${percent(company.revYoy)}；归母同比 ${percent(company.profitYoy)}。`)
      if (company.id === '000858') lines.push('2025单季及2026Q1同比使用会计差错更正后数据。')
      break
    }
    case 'peers':
      lines.push('固定三家公司，2025年度。', table(['公司', '营业收入/亿元', '归母净利润/亿元', '营收同比', '归母同比', '加权ROE', '经营现金/亿元', '现金/归母', 'PE（2025）'], model.peers.map((peer: any) => [peer.name, amount(peer.revenue[2]), amount(peer.profit[2]), change(peer.revenue[2], peer.revenue[1]), change(peer.profit[2], peer.profit[1]), percent(peer.roe), amount(peer.cash[2]), number(peer.cash[2] / peer.profit[2]) + '×', number(peer.close / peer.eps) + '×'])), 'PE=快照收盘价/年报基本EPS；五粮液季度口径已调整，现金流含合并范围影响。')
      for (const peer of model.peers) lines.push(`${peer.name}年报：${peer.annual}`)
      break
    case 'valuation':
    case 'matrix':
      lines.push(`年报基本EPS ${number(company.eps, 4)}元；快照收盘价 ${number(company.close)}元。`, `所选PE ${number(valuation.pe)}×；EPS变化 ${percent(valuation.epsChange)}；测算EPS ${number(valuation.eps, 4)}元。`, `情景价格 ${number(valuation.price)}元；相对快照价 ${percent(valuation.upside)}。`, '测算=年报EPS×（1＋盈利变化）×PE；所选参数为情景假设，不是盈利预测或承诺回报。')
      if (spec.studyRole === 'matrix') lines.push(table(['EPS变化', ...valuation.columns.map((pe: number) => number(pe) + '×')], valuation.changes.map((delta: number) => [percent(delta), ...valuation.columns.map((pe: number) => number(company.eps * (1 + delta / 100) * pe))])))
      break
    case 'dividend':
      distribution()
      break
    case 'cashflow':
      lines.push(table(['亿元', '2023', '2024', '2025'], [['归母净利润', ...company.profit.map(amount)], ['经营净现金流', ...company.cash.map(amount)]]), company.note)
      break
    case 'directory':
      lines.push(`当前选择：${report.title}；${report.audit}。`, table(['报告', '披露日期', '状态', '原文'], [
        ['2025年年度报告', company.reportDate, '已审计', company.annual],
        ['2026年第一季度报告', company.quarterDate, '未经审计', company.quarter],
        ['2025年度利润分配预案', company.reportDate, '预案 · 年报所载', company.annual + '#page=2']
      ]), table(['研究主题', '原文依据', '页码', '原文'], expansion.anchors.map((anchor: any[]) => [anchor[0], anchor[1], 'P.' + anchor[3], (anchor[4] === 'quarter' ? company.quarter : company.annual) + '#page=' + anchor[3]])))
      break
    case 'reader': {
      const quarterly = spec.reportKind === 'quarter'
      lines.push(`${company.name} · ${report.title}`, `${report.date}披露 · ${report.audit} · ${report.period}口径；原文 ${report.url}`)
      if (spec.reportKind === 'dividend') { distribution(); break }
      lines.push(table(['指标与单位', quarterly ? '2026Q1' : '2025', quarterly ? (company.id === '000858' ? '2025Q1（更正后）' : '2025Q1') : '2024', '同比/变动'], model.reportRows.map((row: any[]) => [row[0], number(row[1], row[0].includes('EPS') && company.id === '000858' ? 4 : 2) + (row[0].includes('ROE') ? '%' : ''), number(row[2], row[0].includes('EPS') && company.id === '000858' ? 4 : 2) + (row[0].includes('ROE') ? '%' : ''), row[4] === 'pct' ? number(row[3]) + ' pct' : percent(row[3])])) )
      if (!quarterly) for (const [heading, rows] of [['2025产品收入', expansion.products], ['2025销售模式', expansion.channels]] as [string, any[][]][]) {
        const total = rows.reduce((sum, row) => sum + row[1], 0)
        lines.push(heading, table(['分项', '收入/亿元', '占列示酒类收入', '同比'], rows.map(row => [row[0], amount(row[1]), total ? percent(row[1] / total * 100) : '未提供', percent(row[2])])) )
      }
      lines.push(quarterly ? expansion.qDetail : expansion.annualDetail, quarterly ? model.analysisNote : '分项占比按列示酒类收入测算；原文分项与主营收入口径以官方报告为准。')
      break
    }
    case 'analysis':
      lines.push(`当前依据：${company.name} · ${report.title}；${report.audit}。`, table(['分析维度', '报告披露事实', '分析结果与口径', '来源'], model.analysis.map((row: any) => [row.dimension, row.fact, row.researchMeaning, row.source.url + '#page=' + row.source.pages[0]])), model.analysisNote)
      break
    case 'news':
      lines.push('固定三家样本 · 2026-04-17—04-30 · 含盘后披露。', table(['披露时间', '公司', '类型', '事件与披露事实', '来源', '原文'], model.news.map((row: any) => [row.date, row.company, row.tag, row.title, row.source, row.url])), '报道保留原始来源；财务事实与实施状态以公司公告核对。')
      break
  }
  lines.push(`数据来源：公司公告；年报 ${company.annual}；一季报 ${company.quarter}。行情参照：腾讯证券 ${model.snapshot}不复权收盘快照。`)
  return lines.filter(Boolean).join('\n')
}
// Only user-visible native fields enter evidence. Prompts, refresh errors,
// arbitrary object keys and web container URLs are never treated as page text.
export function researchContainerText(value: unknown): { text: string; truncated: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { text: '', truncated: false }
  let truncated = false
  const boundedText = (value: unknown, limit = 120_000): string => {
    if (typeof value === 'string' && value.length > limit) truncated = true
    return text(value, limit)
  }
  const boundedItems = <T>(items: T[], limit: number): T[] => {
    if (items.length > limit) truncated = true
    return items.slice(0, limit)
  }
  const scalar = (value: unknown): string =>
    typeof value === 'number' && Number.isFinite(value) ? String(value) : boundedText(value, 4000)
  const spec = value as Node
  const heading = boundedText(spec.title, 512)
  let body = ''
  if (spec.type === 'research-study') body = boundedText(studyText(spec))
  if (spec.type === 'html' && parseResearchHtmlArtifact(spec) !== null) body = boundedText(researchHtmlText(spec.html))
  if (spec.type === 'markdown' || spec.type === 'mind-map') body = boundedText(spec.content ?? spec.markdown)
  if (spec.type === 'table' && Array.isArray(spec.columns) && Array.isArray(spec.rows) && spec.rows.length) {
    const rows = boundedItems(spec.rows, 500).filter(Array.isArray).map((row) => boundedItems(row, 40).map(scalar))
    if (rows.some((row) => row.some((cell) => cell.trim()))) body = [boundedItems(spec.columns, 40).map(scalar).join(' | '), ...rows.map((row) => row.join(' | '))].join('\n')
  }
  if (spec.type === 'kpi' && Array.isArray(spec.items)) {
    body = boundedItems(spec.items, 100).filter((item) => item && typeof item === 'object' && !Array.isArray(item) && scalar(item.label) && scalar(item.value))
      .map((item) => `${scalar(item.label)}：${scalar(item.value)}${item.change === undefined ? '' : `（${scalar(item.change)}）`}`).join('\n')
  }
  if (spec.type === 'chart' && Array.isArray(spec.series)) {
    const labels = Array.isArray(spec.labels) ? boundedItems(spec.labels, 500).map(scalar) : []
    body = boundedItems(spec.series, 30).filter((series) => series && typeof series === 'object' && Array.isArray(series.values) && series.values.length > 0 && series.values.every((value: unknown) => typeof value === 'number' && Number.isFinite(value)))
      .map((series) => `${scalar(series.name)}\n${boundedItems(series.values, 500).map((value: unknown, index: number) => `${labels[index] ?? index}：${scalar(value)}`).join('\n')}`).join('\n')
  }
  const content = body.trim() ? boundedText(`${heading}\n${body}`) : ''
  return { text: content, truncated }
}

export function readStoredResearchCanvas(storage: Pick<ResearchCanvasStorage, 'getItem'>, sessionId: string): Canvas {
  const read = (kind: string): unknown[] => {
    const value = storage.getItem(`sherlock.research.canvas.${kind}.v1:${sessionId}`)
    if (!value) return []
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
  }
  return { files: read('files'), artifacts: read('artifacts') }
}

// Context follows the local user's active page. Schedulers and the component
// library continue to read the complete durable board via readStoredResearchCanvas.
export function readActiveResearchCanvas(storage: ResearchCanvasStorage, sessionId: string, canvas: Canvas): Canvas {
  const nav = canvas.artifacts.find((value: any) => value?.containerSpec?.type === 'board-tabs') as any
  if (!nav || !Array.isArray(nav.containerSpec?.tabs) || !nav.containerSpec.tabs.length) return canvas
  let activeId: string | undefined
  try { const view = JSON.parse(storage.getItem('ework.research.tabs.view.v1:' + sessionId) || 'null'); if (view?.navId === nav.id) activeId = view.activeId } catch {}
  const tab = nav.containerSpec.tabs.find((value: any) => value.id === activeId) ?? nav.containerSpec.tabs[0]
  const ids = new Set(Array.isArray(tab?.nodeIds) ? tab.nodeIds : [])
  return { files: canvas.files.filter((value: any) => ids.has(value?.id)), artifacts: canvas.artifacts.filter((value: any) => value?.id !== nav.id && ids.has(value?.id)) }
}

export class ResearchContextBridge {
  private server?: Server
  private stopped = false
  private readonly captures = new Map<string, Capture>()
  private readonly now: () => number
  private readonly maxCaptures: number
  private readonly maxStoredBytes: number
  private readonly token = randomBytes(32).toString('hex')
  private endpoint?: { url: string; token: string }
  private pdfRequestActive = false

  constructor(private readonly options: Options) {
    this.now = options.now ?? Date.now
    this.maxCaptures = options.maxCaptures ?? 20
    this.maxStoredBytes = options.maxStoredBytes ?? 32 * 1024 * 1024
    if (![this.maxCaptures, this.maxStoredBytes].every((n) => Number.isSafeInteger(n) && n > 0)) throw new Error('资料服务配置无效。')
  }

  async start(): Promise<{ url: string; token: string }> {
    if (this.endpoint) return this.endpoint
    if (this.stopped) throw new Error('资料服务已停止。')
    const server = createServer(async (req, res) => {
      const send = (status: number, body: unknown) => {
        const serialized = JSON.stringify(body)
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(serialized) })
        res.end(serialized)
      }
      if (!this.authorized(req)) return send(403, { error: '资料请求被拒绝。' })
      if (!['/snapshot','/image-task-title','/board-authority','/canvas-actions','/client-capabilities','/session-completed','/scheduled-tasks','/research-pdf'].includes(req.url??'') || req.method !== 'POST') return send(404, { error: '资料请求无效。' })
      const isPdf = req.url === '/research-pdf'
      // Reject concurrent uploads before collecting their potentially large HTML bodies.
      if (isPdf && this.pdfRequestActive) return send(429, { error: 'PDF 生成忙碌，请稍后重试。' })
      if (isPdf) this.pdfRequestActive = true
      try {
        const chunks: Buffer[] = []
        let size = 0
        const maxBody = isPdf ? MAX_PDF_BODY_BYTES : ["/canvas-actions","/client-capabilities"].includes(req.url??'') ? 1600000 : req.url === "/scheduled-tasks" ? 32768 : MAX_BODY_BYTES
        if (Number(req.headers['content-length']) > maxBody) throw new Error()
        for await (const part of req) {
          const chunk = Buffer.from(part); size += chunk.length
          if (size > maxBody) throw new Error()
          chunks.push(chunk)
        }
        const raw=JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (isPdf) {
          if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 1 || typeof raw.html !== 'string' || !raw.html.trim() || Buffer.byteLength(raw.html, 'utf8') > MAX_PDF_HTML_BYTES) return send(400, { error: 'PDF 仅接受不超过 4 MiB 的 HTML 内容。' })
          if (!this.options.researchPdf) return send(503, { error: 'PDF 生成服务未就绪。' })
          const controller = new AbortController(), abort = () => controller.abort()
          const close = () => { if (!res.writableEnded) abort() }
          req.on('aborted', abort); res.on('close', close)
          if (req.aborted || res.destroyed) abort()
          try {
            const result = await this.options.researchPdf(raw.html, controller.signal)
            if (!res.destroyed) return send(200, result)
          } catch (error) {
            const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
            const status = code === 'busy' ? 429 : code === 'timeout' ? 408 : code === 'unavailable' ? 503 : 400
            const message = code === 'busy' ? 'PDF 生成忙碌，请稍后重试。' : code === 'timeout' ? 'PDF 生成超时。' : code === 'aborted' ? 'PDF 生成已取消。' : code === 'unavailable' ? 'PDF 生成服务未就绪。' : 'PDF 生成失败。'
            if (!res.destroyed) return send(status, { error: message })
          } finally { req.off('aborted', abort); res.off('close', close) }
          return
        }
        if (req.url === '/scheduled-tasks') {
          if (!id(raw?.sessionId)) return send(400, { error: '定时任务会话无效。' })
          if (this.options.canReadSession?.(raw.sessionId) === false) return send(403, { error: '定时任务请求被拒绝。' })
          try {
            if (!this.options.scheduledTask) throw Error('定时任务服务未就绪。')
            return send(200, await this.options.scheduledTask(raw))
          } catch (error) { return send(400, { error: error instanceof Error ? error.message : '定时任务操作失败。' }) }
        }
        if (req.url === '/session-completed') {
          if (!id(raw?.sessionId) || !Number.isSafeInteger(raw?.seq) || raw.seq < 0 || typeof raw?.title !== 'string' || raw.title.length > 160 || (raw.preview !== undefined && (typeof raw.preview !== 'string' || raw.preview.length > 242))) return send(400, { error: 'Invalid completion' })
          this.options.sessionCompleted?.({ sessionId: raw.sessionId, seq: raw.seq, title: raw.title, preview: raw.preview ?? '' })
          return send(200, { ok: true })
        }
        if(req.url==='/canvas-actions'||req.url==='/client-capabilities') {
          const controller=new AbortController(),abort=()=>controller.abort()
          const close=()=>{if(!res.writableEnded)abort()}
          req.on('aborted',abort);res.on('close',close)
          if(req.aborted||res.destroyed)abort()
          try { const action=req.url==='/client-capabilities'?this.options.clientCapability:this.options.canvasAction;if(!action)throw Error('客户端操作服务不可用。');const input=req.url==='/canvas-actions'?publicCanvasAction(raw):raw;return send(200,await action(input,controller.signal)) }
          catch(error){if(!res.destroyed)return send(400,{error:error instanceof Error?error.message:'画布操作失败。'})}
          finally{req.off('aborted',abort);res.off('close',close)}
          return
        }
        if (req.url === '/image-task-title') {
          const {sessionId} = exact(raw,['sessionId'])
          const id = String(sessionId)
          if (!this.options.imageTitleEvidence || this.options.isSharedSession?.(id)) return send(403,{error:'图像会话不可用。'})
          return send(200,await this.options.imageTitleEvidence(id))
        }
        if(req.url==='/board-authority'){const input=exact(raw,['sessionId']);return send(200,{shared:this.options.isSharedSession?.(String(input.sessionId))===true})}
        const input = exact(raw, ['sessionId', 'captureId'])
        this.purge()
        const capture = this.captures.get(input.captureId as string)
        if (!capture || capture.sessionId !== input.sessionId || this.stopped || this.options.canReadSession?.(capture.sessionId) === false) return send(404, { error: '资料捕获已失效。' })
        send(200, { sources: capture.sources })
      } catch { if (!res.destroyed) send(400, { error: '资料请求无效。' }) }
      finally { if (isPdf) this.pdfRequestActive = false }
    })
    server.requestTimeout = 10_000
    server.headersTimeout = 10_000
    this.server = server
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() }) })
    const address = server.address()
    if (!address || typeof address === 'string' || this.stopped) { await this.stop(); throw new Error('资料服务不可用。') }
    this.endpoint = { url: `http://127.0.0.1:${address.port}`, token: this.token }
    return this.endpoint
  }

  async capture(value: unknown): Promise<{ captureId: string; totalSources: number }> {
    try { return await this.captureStored(value) } catch { throw new Error('无法捕获研究资料，请重试。') }
  }

  private async captureStored(value: unknown): Promise<{ captureId: string; totalSources: number }> {
    const { sessionId } = exact(value, ['sessionId']) as { sessionId: string }
    if (this.options.canReadSession?.(sessionId) === false) throw new Error('资料捕获已失效。')
    if (this.stopped) throw new Error('资料服务已停止。')
    const createdAt = this.now()
    const raw = await this.options.readCanvas(sessionId)
    // Freeze the entire stored canvas before the first asynchronous file check.
    const canvas: Canvas = JSON.parse(JSON.stringify(raw))
    if (!Array.isArray(canvas.files) || !Array.isArray(canvas.artifacts) || canvas.files.length + canvas.artifacts.length > 1000) throw new Error('画板资料过多。')
    const sources: Source[] = await this.options.additionalSources?.(sessionId)??[]
    const seen = new Set<string>()
    for (const rawNode of [...canvas.files, ...canvas.artifacts]) {
      if (!rawNode || typeof rawNode !== 'object' || Array.isArray(rawNode)) continue
      const node = rawNode as Node
      if (!id(node.id) || seen.has(node.id)) continue
      seen.add(node.id)
      const isFile = canvas.files.includes(rawNode)
      const source: Source = { id: node.id, title: text(isFile ? node.displayName ?? node.name : node.title, 512) || '未命名资料', kind: isFile ? 'file' : text(node.kind, 128) || 'artifact', text: '', status: 'unavailable' }
      if (isFile && id(node.authorizationId)) {
        try {
          const authorized = await this.options.resolveFile({ sessionId, nodeId: node.id, authorizationId: node.authorizationId })
          if (authorized) {
            const file = await stat(authorized.path)
            if (file.isFile() && file.size <= 64 * 1024 * 1024) {
              if (SUPPORTED_EXTENSIONS.has(extname(authorized.path).toLowerCase())) Object.assign(source, { path: authorized.path, revision: { size: file.size, mtimeMs: file.mtimeMs }, status: 'ready', truncated: true })
              else source.status = 'unsupported'
            }
          }
        } catch { /* Authorization or stat failure yields metadata only. */ }
      } else if (!isFile) {
        if (['pasted-text', 'assistant-result', 'assistant-excerpt'].includes(source.kind)) source.text = text(node.excerpt)
        if (source.kind === 'web-link') { source.text = text(node.sourceText); source.sourceUrl = publicUrl(node.url) }
        if (['generated-summary', 'generated-mind-map'].includes(source.kind)) {
          source.status = text(node.generationStatus, 128) || 'unavailable'
          if (['completed', 'settled'].includes(source.status)) source.text = text(node.excerpt)
        }
        if (source.kind === 'generated-container') {
          source.status = text(node.generationStatus, 128) || 'unavailable'
          const container = researchContainerText(node.containerSpec)
          source.text = container.text
          if (container.truncated) source.truncated = true
          if (source.text && (node.refreshError || source.status !== 'completed')) {
            source.text = `[保留上次成功内容；刷新失败或尚未完成；上次成功时间：${typeof node.lastSuccessfulAt === 'number' && Number.isFinite(node.lastSuccessfulAt) ? node.lastSuccessfulAt : '未知'}]\n${source.text}`
          }
        }
        if (source.text) source.status = 'ready'
        if (Array.isArray(node.sourceNodeIds)) source.sourceNodeIds = node.sourceNodeIds.filter(id).slice(0, 256)
        if (typeof node.excerpt === 'string' && node.excerpt.length > 120_000 || typeof node.sourceText === 'string' && node.sourceText.length > 120_000) source.truncated = true
      }
      sources.push(source)
    }
    return this.captureSources(sessionId,sources,createdAt)
  }

  /** Trusted main-process callers can freeze note-owned files without reading the research canvas. */
  captureSources(sessionId:string,input:Source[],createdAt=this.now()):{captureId:string;totalSources:number}{
    if(!id(sessionId)||!Array.isArray(input)||input.length>1000)throw Error('资料参数无效。')
    const sources:Source[]=JSON.parse(JSON.stringify(input))
    if (this.stopped || this.options.canReadSession?.(sessionId) === false || this.now() - createdAt > CAPTURE_TTL_MS) throw new Error('资料捕获已失效。')
    this.purge()
    const bytes = Buffer.byteLength(JSON.stringify(sources))
    if (bytes > this.maxStoredBytes) throw new Error('画板资料超过存储上限。')
    while (this.captures.size >= this.maxCaptures || [...this.captures.values()].reduce((sum, item) => sum + item.bytes, 0) + bytes > this.maxStoredBytes) this.captures.delete(this.captures.keys().next().value!)
    const captureId = randomUUID()
    this.captures.set(captureId, { sessionId, createdAt, sources, bytes })
    return { captureId, totalSources: sources.length }
  }

  private authorized(req: IncomingMessage): boolean {
    if (this.stopped || req.socket.remoteAddress !== '127.0.0.1' || req.headers.origin !== undefined || req.headers.forwarded !== undefined || req.headers['x-forwarded-for'] !== undefined || req.headers['x-forwarded-host'] !== undefined || req.headers['x-real-ip'] !== undefined) return false
    if (this.endpoint && req.headers.host !== new URL(this.endpoint.url).host) return false
    const actual = Buffer.from(req.headers.authorization ?? '')
    const expected = Buffer.from(`Bearer ${this.token}`)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
  private purge(): void {
    for (const [key, capture] of this.captures) if (this.now() - capture.createdAt > CAPTURE_TTL_MS) this.captures.delete(key)
  }
  invalidateSession(sessionId: string): void {
    for (const [captureId, capture] of this.captures) if (capture.sessionId === sessionId) this.captures.delete(captureId)
  }
  async stop(): Promise<void> {
    this.stopped = true
    this.captures.clear()
    const server = this.server
    this.server = undefined
    this.endpoint = undefined
    if (server) await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections() })
  }
}

export function registerResearchContextHandlers(options: {
  ipcMain: { removeHandler(channel: string): void; handle(channel: string, handler: (event: TrustedWindowEvent, value: unknown) => unknown): unknown }
  getMainWindow(): TrustedWindow | undefined
  bridge: ResearchContextBridge
}): () => void {
  const channel = 'research:context:capture'
  options.ipcMain.removeHandler(channel)
  registerTrustedMainWindowHandler(options.ipcMain, channel, options.getMainWindow, (_event, value: unknown) => options.bridge.capture(value))
  return () => options.ipcMain.removeHandler(channel)
}
