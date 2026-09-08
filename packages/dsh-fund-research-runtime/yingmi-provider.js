import { createPrivateToolProvider } from './provider.js'
import {
  cancelledError,
  toPublicFundResearchError,
  validateResearchRequest
} from './contract.js'
import { createYingmiMcpClient, OFFICIAL_MCP_ENDPOINT } from './yingmi-mcp.js'

const DETAILS_TOOL = 'BatchGetFundsDetail'
const NAV_HISTORY_TOOL = 'BatchGetFundNavHistory'
const DAY_MS = 86_400_000
const PRIVATE_TERMS = Object.freeze([
  'yingmi',
  '盈米',
  'stargate.yingmi.com',
  OFFICIAL_MCP_ENDPOINT,
  DETAILS_TOOL,
  NAV_HISTORY_TOOL,
  'private.single',
  'private.compare',
  'private.holdings',
  'private.changes'
])

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function cleanText(value, maximum = 160) {
  if (typeof value !== 'string') return undefined
  const result = value.normalize('NFKC')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/[^\p{L}\p{N}\s·（）()\-—+%&：:，,。.]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  return result ? result.slice(0, maximum) : undefined
}

function isoDate(value) {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().replace(/年|月/gu, '-').replace(/日$/u, '')
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) return undefined
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : undefined
}

function positiveNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/u.test(value.trim())) return undefined
  const result = Number(value)
  return Number.isFinite(result) && result > 0 ? result : undefined
}

function percentage(value) {
  if (typeof value !== 'string') return undefined
  const match = /^([+-]?\d+(?:\.\d+)?)%$/u.exec(value.trim())
  if (!match) return undefined
  const result = Number(match[1])
  return Number.isFinite(result) ? result : undefined
}

function fundSize(value) {
  if (typeof value !== 'string') return undefined
  const match = /^(\d+(?:\.\d+)?)(万|亿)$/u.exec(value.trim())
  if (!match) return undefined
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount < 0) return undefined
  return { value: amount, unit: match[2] === '亿' ? 'CNY_100m' : 'CNY_10k' }
}

function fundType(summary) {
  const name = cleanText(summary.fundName)
  if (!name) throw new Error('Fund identity is unavailable.')
  // The v1 evidence contract denominates NAV in CNY. Other share currencies use
  // the schema-driven research endpoint, which preserves the source units.
  const currency = String(summary.currency ?? summary.currencyCode ?? summary.navCurrency ?? '').trim()
  if ((currency && !/^(?:CNY|RMB|人民币)$/iu.test(currency)) || /美元|港币|港元|欧元|日元|英镑|\bUSD\b|\bHKD\b/iu.test(name)) {
    throw Object.assign(new Error('Unsupported share currency.'), { code: 'FUND_TYPE_UNSUPPORTED' })
  }
  const hasTrackedIndex = /^[A-Z0-9.\-]{2,32}$/iu.test(String(summary.indexCode ?? '')) &&
    Boolean(cleanText(summary.indexName))
  if (hasTrackedIndex && /ETF\s*(?:联接|连接)/iu.test(name)) return 'etf_feeder'
  if (hasTrackedIndex && /ETF(?:[A-Z])?$/iu.test(name.replace(/[（）()\s]/gu, ''))) return 'etf'
  if (hasTrackedIndex && /指数/iu.test(String(summary.fundInvestType ?? ''))) {
    return 'index_fund'
  }
  const type = String(summary.fundInvestType ?? '').normalize('NFKC')
  if (/QDII/iu.test(type)) return 'qdii_fund'
  if (/FOF|基金中基金/iu.test(type)) return 'fof'
  if (/货币/iu.test(type)) return 'money_market_fund'
  if (/债券/iu.test(type)) return 'bond_fund'
  if (/混合/iu.test(type)) return 'mixed_fund'
  if (/股票/iu.test(type)) return 'equity_fund'
  throw Object.assign(new Error('Unsupported fund type.'), { code: 'FUND_TYPE_UNSUPPORTED' })
}

function detailRows(raw, requestedFunds) {
  if (!Array.isArray(raw) || raw.length !== requestedFunds.length) throw new Error('Invalid fund detail result.')
  const requested = new Set(requestedFunds)
  const rows = new Map()
  for (const value of raw) {
    const row = record(value)
    const code = typeof row.fundCode === 'string' ? row.fundCode.trim() : ''
    const summary = record(record(row.data).summary)
    if (!requested.has(code) || rows.has(code) || summary.fundCode !== code) {
      throw new Error('Fund identity mismatch.')
    }
    rows.set(code, { row, data: record(row.data), summary })
  }
  if ([...requested].some((code) => !rows.has(code))) throw new Error('Fund detail is incomplete.')
  return rows
}

function subject(code, summary) {
  const name = cleanText(summary.fundName)
  if (!name) throw new Error('Fund name is unavailable.')
  return {
    fund_code: code,
    fund_name: name,
    fund_type: fundType(summary),
    currency: 'CNY'
  }
}

function evidence(id, code, field, value, unit, asOf, dimensions) {
  return {
    id,
    subject_code: code,
    field,
    value,
    ...(unit ? { unit } : {}),
    as_of: asOf,
    ...(dimensions && Object.keys(dimensions).length > 0 ? { dimensions } : {})
  }
}

function claimsForEvidence(entries) {
  const fields = [...new Set(entries.map((entry) => entry.field))]
  return fields.map((field, index) => ({
    id: `claim_${index + 1}`,
    field,
    status: 'established',
    evidence_ids: entries.filter((entry) => entry.field === field).map((entry) => entry.id)
  }))
}

function freshness(asOf, receivedAt, maximumAgeDays = 7) {
  const received = new Date(receivedAt)
  if (Number.isNaN(received.valueOf())) throw new Error('Invalid received time.')
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(received)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const receivedDate = `${values.year}-${values.month}-${values.day}`
  const ageDays = (Date.parse(`${receivedDate}T00:00:00.000Z`) -
    Date.parse(`${asOf}T00:00:00.000Z`)) / DAY_MS
  if (!Number.isInteger(ageDays) || ageDays < 0) throw new Error('Invalid fund data date.')
  return ageDays > maximumAgeDays ? 'stale' : 'verified'
}

function resolveCredentialWithin(resolveCredential, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (handler, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      handler(value)
    }
    const onAbort = () => finish(reject, cancelledError())
    const timer = setTimeout(() => finish(reject, new Error('Credential resolution timed out.')), timeoutMs)
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    Promise.resolve()
      .then(resolveCredential)
      .then((value) => finish(resolve, value), (error) => finish(reject, error))
  })
}

function normalizeSingle(raw, { request, receivedAt }) {
  const code = request.funds[0]
  const { summary } = detailRows(raw, request.funds).get(code)
  const asOf = isoDate(summary.navDate)
  const nav = positiveNumber(summary.nav)
  if (!asOf || nav === undefined) throw new Error('Dated unit NAV is unavailable.')
  const entries = [evidence('unit_nav', code, 'unit_nav', nav, 'CNY', asOf)]
  const oneYear = percentage(summary.oneYearReturn)
  if (oneYear !== undefined) entries.push(evidence('return_1y', code, 'return_1y', oneYear, '%', asOf))
  const size = fundSize(summary.netAsset)
  const sizeAsOf = isoDate(summary.netAssetUpdateDate)
  const hasSize = Boolean(size && sizeAsOf)
  if (hasSize) entries.push(evidence('fund_size', code, 'fund_size', size.value, size.unit, sizeAsOf))
  const inception = isoDate(summary.uiSetupDate)
  if (inception) entries.push(evidence('inception_date', code, 'inception_date', inception, 'date', asOf))
  const benchmark = cleanText(summary.indexName)
  const benchmarkCode = typeof summary.indexCode === 'string' && /^[A-Z0-9.\-]{2,32}$/iu.test(summary.indexCode)
    ? summary.indexCode.toUpperCase()
    : undefined
  if (benchmark) {
    entries.push(evidence('benchmark', code, 'benchmark', benchmark, 'text', asOf,
      benchmarkCode ? { benchmark_code: benchmarkCode } : undefined))
  }
  const quality = freshness(asOf, receivedAt)
  const missingOptional = oneYear === undefined || !hasSize || !inception || !benchmark
  return {
    task: request.task,
    status: missingOptional || quality === 'stale' ? 'partial' : 'complete',
    as_of: asOf,
    frequency: 'daily',
    source_type: 'aggregate',
    quality_state: quality,
    subjects: [subject(code, summary)],
    evidence: entries,
    claims: claimsForEvidence(entries),
    limitations: [
      ...(missingOptional ? ['unsupported_metric'] : []),
      ...(quality === 'stale' ? ['stale_data'] : [])
    ]
  }
}

function normalizeCompare(raw, { request, receivedAt }) {
  const rows = detailRows(raw, request.funds)
  const summaries = request.funds.map((code) => [code, rows.get(code).summary])
  const dated = summaries.map(([code, summary]) => ({
    code,
    summary,
    asOf: isoDate(summary.navDate),
    nav: positiveNumber(summary.nav),
    oneYear: percentage(summary.oneYearReturn)
  }))
  if (dated.some((entry) => !entry.asOf || entry.nav === undefined)) throw new Error('Comparable NAV is unavailable.')
  const dates = new Set(dated.map((entry) => entry.asOf))
  if (dates.size !== 1) throw new Error('Fund dates are not aligned.')
  const asOf = dated[0].asOf
  const entries = dated.map((entry, index) => evidence(
    `unit_nav_${index + 1}`,
    entry.code,
    'unit_nav',
    entry.nav,
    'CNY',
    asOf,
    { comparison_group: '同日基金比较' }
  ))
  const hasAllReturns = dated.every((entry) => entry.oneYear !== undefined)
  if (hasAllReturns) {
    dated.forEach((entry, index) => entries.push(evidence(
      `return_1y_${index + 1}`,
      entry.code,
      'return_1y',
      entry.oneYear,
      '%',
      asOf,
      { comparison_group: '同日基金比较' }
    )))
  }
  const quality = freshness(asOf, receivedAt)
  return {
    task: request.task,
    status: hasAllReturns && quality !== 'stale' ? 'complete' : 'partial',
    as_of: asOf,
    frequency: 'daily',
    source_type: 'aggregate',
    quality_state: quality,
    subjects: dated.map((entry) => subject(entry.code, entry.summary)),
    evidence: entries,
    claims: claimsForEvidence(entries),
    limitations: [
      ...(!hasAllReturns ? ['unsupported_metric'] : []),
      ...(quality === 'stale' ? ['stale_data'] : [])
    ]
  }
}

function assetClass(name) {
  if (/股/iu.test(name)) return 'equity'
  if (/债/iu.test(name)) return 'bond'
  if (/现金|货币/iu.test(name)) return 'cash'
  if (/商品|黄金|原油/iu.test(name)) return 'commodity'
  return 'other'
}

function allocationRatio(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? Number((value * 100).toFixed(6))
    : undefined
}

function normalizeHoldings(raw, { request, receivedAt }) {
  const code = request.funds[0]
  const { data, summary } = detailRows(raw, request.funds).get(code)
  const asOf = isoDate(summary.netAssetUpdateDate)
  if (!asOf) throw new Error('Portfolio disclosure date is unavailable.')
  const entries = []
  const allAssets = Array.isArray(data.assetPortfolios) ? data.assetPortfolios : []
  const assetsTruncated = allAssets.length > 20
  const assetNames = new Set()
  let assetTotal = 0
  for (const [index, value] of allAssets.entries()) {
    const item = record(value)
    const name = cleanText(item.name, 80)
    const ratio = allocationRatio(item.ratio)
    if (!name || ratio === undefined || assetNames.has(name)) throw new Error('Invalid asset allocation.')
    assetNames.add(name)
    assetTotal += ratio
    if (index >= 20) continue
    entries.push(evidence(`asset_${index + 1}`, code, 'asset_allocation', ratio, '%', asOf, {
      asset_class: assetClass(name)
    }))
  }
  if (assetTotal > 102) throw new Error('Invalid asset allocation total.')
  const allIndustries = Array.isArray(data.industryPortfolios) ? data.industryPortfolios : []
  const industriesTruncated = allIndustries.length > 30
  const industryNames = new Set()
  let industryTotal = 0
  for (const [index, value] of allIndustries.entries()) {
    const item = record(value)
    const name = cleanText(item.name, 80)
    const ratio = allocationRatio(item.ratio)
    if (!name || ratio === undefined || industryNames.has(name)) throw new Error('Invalid industry allocation.')
    industryNames.add(name)
    industryTotal += ratio
    if (index >= 30) continue
    entries.push(evidence(`industry_${index + 1}`, code, 'industry_allocation', ratio, '%', asOf, {
      industry: name,
      rank: index + 1
    }))
  }
  if (industryTotal > 102) throw new Error('Invalid industry allocation total.')
  if (entries.length === 0) throw new Error('Portfolio disclosure is unavailable.')
  const quality = freshness(asOf, receivedAt, 130)
  const truncated = assetsTruncated || industriesTruncated
  const hasBothKinds = allAssets.length > 0 && allIndustries.length > 0
  const complete = hasBothKinds && !truncated && quality !== 'stale'
  return {
    task: request.task,
    status: complete ? 'complete' : 'partial',
    as_of: asOf,
    frequency: 'quarterly',
    source_type: 'official_disclosure',
    quality_state: quality,
    subjects: [subject(code, summary)],
    evidence: entries,
    claims: claimsForEvidence(entries),
    limitations: [
      ...(!hasBothKinds ? ['missing_data'] : []),
      ...(truncated ? ['truncated'] : []),
      ...(quality === 'stale' ? ['stale_data'] : [])
    ]
  }
}

function historyDimension(days) {
  if (days <= 30) return 'oneMonth'
  if (days <= 90) return 'quarter'
  if (days <= 180) return 'halfYear'
  return 'oneYear'
}

function parseHistory(text, code, expectedDimension) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024 ||
      typeof expectedDimension !== 'string') {
    throw new Error('Invalid NAV history.')
  }
  const normalized = text.replace(/\r\n/gu, '\n')
  const lines = normalized.split('\n')
  if (!/^\[1\]:\s*\n/u.test(normalized) ||
      (normalized.match(new RegExp(`^[ \\t]+- fundCode: "${code}"$`, 'gmu')) ?? []).length !== 1 ||
      (normalized.match(new RegExp(`^[ \\t]+code: "${code}"$`, 'gmu')) ?? []).length !== 1 ||
      (normalized.match(new RegExp(`^[ \\t]+curDimensionType: ${expectedDimension}$`, 'gmu')) ?? []).length !== 1) {
    throw new Error('Invalid NAV history.')
  }
  const headers = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^ {6}data\[(\d+)\]\{navDate,nav,dailyReturn\}:$/u.test(line))
  if (headers.length !== 1) throw new Error('NAV history rows are unavailable.')
  const header = /^ {6}data\[(\d+)\]\{navDate,nav,dailyReturn\}:$/u.exec(headers[0].line)
  const rows = []
  const pattern = /^ {8}(\d{4}年\d{2}月\d{2}日),(\d+(?:\.\d+)?),"?([+-]?\d+(?:\.\d+)?)%"?$/u
  let cursor = headers[0].index + 1
  while (cursor < lines.length) {
    const match = pattern.exec(lines[cursor])
    if (!match) break
    const asOf = isoDate(match[1])
    const nav = positiveNumber(match[2])
    const dailyReturn = Number(match[3])
    if (!asOf || nav === undefined || !Number.isFinite(dailyReturn)) throw new Error('Invalid NAV history row.')
    rows.push({ asOf, nav, dailyReturn })
    cursor += 1
  }
  if (rows.length !== Number(header[1]) || rows.length < 1 ||
      lines.filter((line) => pattern.test(line)).length !== rows.length ||
      new Set(rows.map((entry) => entry.asOf)).size !== rows.length) {
    throw new Error('NAV history is incomplete.')
  }
  if (rows.some((entry, index) => index > 0 && entry.asOf >= rows[index - 1].asOf)) {
    throw new Error('NAV history order is invalid.')
  }
  return rows
}

function normalizeChanges(raw, { request, receivedAt }) {
  const value = record(raw)
  const code = request.funds[0]
  const { summary } = detailRows(value.details, request.funds).get(code)
  const rows = parseHistory(value.history, code, value.dimension)
  const latest = rows[0]
  const days = request.lookback_days ?? 30
  const target = Date.parse(`${latest.asOf}T00:00:00.000Z`) - days * DAY_MS
  const previousEntry = rows.slice(1).find((entry) =>
    Date.parse(`${entry.asOf}T00:00:00.000Z`) <= target)
  const distance = previousEntry
    ? target - Date.parse(`${previousEntry.asOf}T00:00:00.000Z`)
    : Number.POSITIVE_INFINITY
  const aligned = Boolean(previousEntry) && distance <= 7 * DAY_MS
  const entries = [
    evidence('unit_nav_current', code, 'unit_nav', latest.nav, 'CNY', latest.asOf, { direction: 'current' }),
    ...(aligned
      ? [evidence('unit_nav_previous', code, 'unit_nav', previousEntry.nav, 'CNY', previousEntry.asOf, { direction: 'previous' })]
      : [])
  ]
  const quality = freshness(latest.asOf, receivedAt)
  return {
    task: request.task,
    status: aligned && quality !== 'stale' ? 'complete' : 'partial',
    as_of: latest.asOf,
    frequency: 'daily',
    source_type: 'aggregate',
    quality_state: quality,
    subjects: [subject(code, summary)],
    evidence: entries,
    claims: claimsForEvidence(entries),
    limitations: [
      ...(!aligned ? ['insufficient_history'] : []),
      ...(quality === 'stale' ? ['stale_data'] : [])
    ]
  }
}

export function createYingmiFundProvider({
  resolveCredential,
  fetch: request = globalThis.fetch,
  clock = () => new Date(),
  timeoutMs = 60_000,
  requestTimeoutMs = 15_000,
  onDataGap = () => {}
}) {
  if (typeof resolveCredential !== 'function') throw new TypeError('A credential resolver is required.')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new TypeError('Private fund data timeout is invalid.')
  }

  const createDelegate = (credential, operationTimeoutMs) => {
    const invoke = async ({ name, arguments: args, signal }) => {
      const client = createYingmiMcpClient({
        apiKey: credential,
        fetch: request,
        timeoutMs: requestTimeoutMs
      })
      try {
        if (name === 'private.single' || name === 'private.compare' || name === 'private.holdings') {
          return await client.callTool(DETAILS_TOOL, { fundCodes: args.funds }, { signal })
        }
        if (name === 'private.changes') {
          const details = await client.callTool(DETAILS_TOOL, { fundCodes: args.funds }, { signal })
          const dimension = historyDimension(args.lookbackDays)
          const history = await client.callTool(NAV_HISTORY_TOOL, {
            fundCodes: args.funds,
            isDesc: true,
            dimensionType: dimension
          }, { signal })
          return { details, history, dimension }
        }
        throw new Error('Private operation is unavailable.')
      } finally {
        await client.close()
      }
    }

    return createPrivateToolProvider({
      invoke,
      timeoutMs: operationTimeoutMs,
      clock,
      privateTerms: [...PRIVATE_TERMS, credential],
      operations: {
        single: {
          name: 'private.single',
          buildArguments: (request) => ({ funds: [...request.funds] }),
          normalize: (raw, context) => {
            if (Array.isArray(raw) && raw.length === 0) onDataGap()
            const { summary } = detailRows(raw, context.request.funds).get(context.request.funds[0])
            // Identity, share currency and fund type must be valid before a missing field permits fallback.
            fundType(summary)
            if (summary.nav == null || summary.navDate == null || summary.navDate === '') onDataGap()
            return normalizeSingle(raw, context)
          }
        },
        compare: {
          name: 'private.compare',
          buildArguments: (request) => ({ funds: [...request.funds] }),
          normalize: normalizeCompare
        },
        holdings_style: {
          name: 'private.holdings',
          buildArguments: (request) => ({ funds: [...request.funds] }),
          normalize: normalizeHoldings
        },
        recent_changes: {
          name: 'private.changes',
          buildArguments: (request) => ({
            funds: [...request.funds],
            lookbackDays: request.lookback_days ?? 30
          }),
          normalize: normalizeChanges
        }
      }
    })
  }

  return Object.freeze({
    async research(input, { signal } = {}) {
      const request = validateResearchRequest(input)
      if (signal?.aborted) throw cancelledError()
      let credential
      const deadline = Date.now() + timeoutMs
      try {
        credential = await resolveCredentialWithin(resolveCredential, signal, timeoutMs)
      } catch (error) {
        throw toPublicFundResearchError(error, signal)
      }
      const remaining = deadline - Date.now()
      if (remaining < 1) throw toPublicFundResearchError(new Error('Private fund data timeout.'), signal)
      return createDelegate(credential, remaining).research(request, { signal })
    }
  })
}
