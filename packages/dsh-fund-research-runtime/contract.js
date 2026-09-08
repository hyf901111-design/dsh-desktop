import { createHash } from 'node:crypto'

export const FUND_RESEARCH_TASKS = Object.freeze([
  'single',
  'compare',
  'holdings_style',
  'recent_changes'
])

export const CLAIM_STATUSES = Object.freeze([
  'established',
  'consistent',
  'contradicted',
  'indeterminate',
  'not_testable'
])

const TASKS = new Set(FUND_RESEARCH_TASKS)
const CLAIMS = new Set(CLAIM_STATUSES)
const RESPONSE_KEYS = new Set([
  'schema_version',
  'task',
  'status',
  'as_of',
  'received_at',
  'frequency',
  'source_type',
  'raw_hash',
  'quality_state',
  'subjects',
  'evidence',
  'claims',
  'limitations'
])
const SUBJECT_KEYS = new Set(['fund_code', 'fund_name', 'fund_type', 'currency'])
const EVIDENCE_KEYS = new Set([
  'id',
  'subject_code',
  'field',
  'value',
  'unit',
  'as_of',
  'period_start',
  'period_end',
  'dimensions'
])
const CLAIM_KEYS = new Set(['id', 'field', 'status', 'evidence_ids'])
const DIMENSION_KEYS = new Set([
  'security_code',
  'security_name',
  'asset_class',
  'industry',
  'region',
  'rank',
  'benchmark_code',
  'comparison_group',
  'direction'
])
const FREQUENCIES = new Set([
  'realtime',
  'daily',
  'monthly',
  'quarterly',
  'annual',
  'event',
  'mixed'
])
const SOURCE_TYPES = new Set([
  'official_disclosure',
  'exchange',
  'regulatory',
  'calculated',
  'aggregate',
  'mixed'
])
const QUALITY_STATES = new Set(['verified', 'partial', 'stale'])
const FUND_TYPES = new Set(['etf', 'index_fund', 'etf_feeder'])
const FIELD_LABELS = new Map([
  ['unit_nav', '单位净值'],
  ['accumulated_nav', '累计净值'],
  ['return_1m', '近一月收益率'],
  ['return_3m', '近三月收益率'],
  ['return_1y', '近一年收益率'],
  ['annualized_volatility', '年化波动率'],
  ['max_drawdown', '最大回撤'],
  ['tracking_error', '跟踪误差'],
  ['expense_ratio', '综合费率'],
  ['management_fee', '管理费率'],
  ['custody_fee', '托管费率'],
  ['fund_size', '基金规模'],
  ['inception_date', '成立日期'],
  ['benchmark', '业绩比较基准'],
  ['holding_weight', '持仓权重'],
  ['asset_allocation', '资产配置'],
  ['industry_allocation', '行业配置'],
  ['style_exposure', '风格暴露'],
  ['manager_tenure', '基金经理任期'],
  ['share_change', '基金份额变化'],
  ['fund_size_change', '基金规模变化'],
  ['holding_change', '持仓变化'],
  ['disclosure_event', '披露事项']
])
const UNITS = new Set([
  'CNY',
  '%',
  'day',
  'year',
  'share',
  'CNY_10k',
  'CNY_100m',
  'ratio',
  'count',
  'date',
  'text'
])
const DIRECTIONS = new Set([
  'increase',
  'decrease',
  'unchanged',
  'added',
  'removed',
  'previous',
  'current'
])
const ASSET_CLASSES = new Set(['equity', 'bond', 'cash', 'commodity', 'other'])
const LIMITATION_MESSAGES = new Map([
  ['missing_data', '部分数据缺失。'],
  ['stale_data', '部分数据不是最新披露口径。'],
  ['incomparable_dates', '数据日期不一致，不能直接比较。'],
  ['insufficient_history', '历史数据不足，当前无法检验变化。'],
  ['truncated', '结果已按产品上限截断。'],
  ['unsupported_metric', '部分研究指标当前暂不支持。']
])
const CLAIM_MESSAGES = Object.freeze({
  established: (label) => `${label}已有可核验证据。`,
  consistent: (label) => `${label}的多项证据相互一致。`,
  contradicted: (label) => `${label}的证据存在冲突。`,
  indeterminate: (label) => `${label}证据不足，暂不能下结论。`,
  not_testable: (label) => `${label}当前无法检验。`
})
const SAFE_PUBLIC_ERROR = Symbol('safe-public-fund-research-error')
const NORMALIZED_RESULTS = new WeakSet()
const PUBLIC_SAFETY_PATTERNS = [
  /mcp__/iu,
  /authorization\s*:/iu,
  /bearer\s+[a-z0-9._~-]+/iu,
  /\b(?:api[_ -]?key|access[_ -]?token|trace[_ -]?id)\b/iu,
  /(?:https?|wss?|file):\/\//iu,
  /\blocalhost(?::\d+)?\b|\b(?:\d{1,3}\.){3}\d{1,3}\b/iu,
  /\b(?:[a-z0-9-]+\.)+(?:com|cn|net|org|io|ai|app|dev|local)(?:\/[^\s]*)?/iu,
  /\b(?:mcp|tool|server|endpoint|provider)\b|工具(?:名|调用)?|服务端|端点|鉴权|令牌|调用栈/iu,
  /(?:建议|推荐|应当|适合)(?:立即|现在|继续|考虑)?(?:配置|持有|买入|卖出|申购|赎回|加仓|减仓)|适合.{0,20}投资者|(?:买入|卖出|申购|赎回|加仓|减仓)(?:建议|信号)|买点|卖点|预计.{0,24}(?:收益|回报)|年化收益.{0,12}(?:可达|达到|约为)|目标收益|保证收益/iu,
  /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?:_query|_tool|_lookup|_detail)\b/iu,
  /\b(?:recommend|recommended)\b|\b(?:buy|sell|subscribe|redeem)\s+(?:now|signal)\b/iu
]

export class FundResearchError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'FundResearchError'
    this.code = code
  }
}

function safeError(code, message) {
  const error = new FundResearchError(code, message)
  Object.defineProperty(error, SAFE_PUBLIC_ERROR, { value: true })
  return error
}

export function unavailableError() {
  return safeError('FUND_DATA_UNAVAILABLE', '基金数据暂时不可用，请稍后重试。')
}

export function cancelledError() {
  return safeError('FUND_RESEARCH_CANCELLED', '基金研究已取消。')
}

const SERVICE_MESSAGES = Object.freeze({
  LOGIN_REQUIRED: '请在左下角登录 EWork Odyssey 后使用基金研究。',
  FUND_SERVICE_BUSY: '基金查询较多，请稍后再试。',
  FUND_SERVICE_UNAVAILABLE: '基金数据服务暂时不可用，请稍后重试。',
  FUND_TYPE_UNSUPPORTED: '暂不支持该基金类型。'
})

export function serviceError(code) {
  return Object.hasOwn(SERVICE_MESSAGES, code)
    ? safeError(code, SERVICE_MESSAGES[code]) : unavailableError()
}

function invalid(message) {
  throw safeError('INVALID_REQUEST', message)
}

function invalidData() {
  throw safeError('FUND_DATA_INVALID', '基金数据暂时不可用，请稍后重试。')
}

export function toPublicFundResearchError(error, signal) {
  if (signal?.aborted || error?.code === 'FUND_RESEARCH_CANCELLED') return cancelledError()
  if (error?.[SAFE_PUBLIC_ERROR] === true && Object.hasOwn(SERVICE_MESSAGES, error.code)) {
    return serviceError(error.code)
  }
  if (error?.code === 'INVALID_REQUEST' && error?.[SAFE_PUBLIC_ERROR] === true) {
    return safeError('INVALID_REQUEST', error.message)
  }
  if (error?.code === 'FUND_DATA_INVALID') return invalidDataError()
  if (error?.code === 'FUND_TYPE_UNSUPPORTED') {
    return safeError('FUND_TYPE_UNSUPPORTED', '暂不支持该基金类型。')
  }
  return unavailableError()
}

function invalidDataError() {
  return safeError('FUND_DATA_INVALID', '基金数据暂时不可用，请稍后重试。')
}

function record(value, failure = invalidData) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) failure()
  return value
}

function exactKeys(value, keys, failure = invalidData) {
  if (Object.keys(value).some((key) => !keys.has(key))) failure()
}

function text(value, limit, failure = invalidData) {
  if (typeof value !== 'string') failure()
  const result = value.trim()
  if (!result || result.length > limit) failure()
  return result
}

function enumValue(value, values) {
  if (typeof value !== 'string' || !values.has(value)) invalidData()
  return value
}

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) invalidData()
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) invalidData()
  return value
}

function isoTimestamp(value) {
  if (typeof value !== 'string' || value.length > 64 || !Number.isFinite(Date.parse(value))) invalidData()
  return new Date(value).toISOString()
}

function fundCode(value, failure = invalidData) {
  const fail = (message = '基金代码格式无效。') => failure(message)
  const result = text(value, 32, fail).toUpperCase()
  if (!/^\d{6}$/u.test(result)) fail('基金代码须为 6 位数字。')
  return result
}

function scalar(value, limit = 1_000) {
  if (typeof value === 'string') return displayText(value, limit)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value
  invalidData()
}

function displayText(value, limit) {
  const result = text(value, limit)
  if (!/^[\p{L}\p{N}\s·（）()\-—+%&：:，,。.]+$/u.test(result)) invalidData()
  return result
}

function codeText(value) {
  const result = text(value, 32).toUpperCase()
  if (!/^[A-Z0-9.\-]{2,32}$/u.test(result)) invalidData()
  return result
}

function boundedArray(value, maximum, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) invalidData()
  return value
}

function publicSafetyCheck(value, privateTerms) {
  const terms = [...new Set((privateTerms ?? [])
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim().toLocaleLowerCase())
    .filter((entry) => [...entry].length >= 2))]
  const visit = (entry) => {
    if (typeof entry === 'string') {
      if (PUBLIC_SAFETY_PATTERNS.some((pattern) => pattern.test(entry))) invalidData()
      const lowered = entry.toLocaleLowerCase()
      if (terms.some((term) => lowered.includes(term))) invalidData()
      return
    }
    if (Array.isArray(entry)) {
      for (const item of entry) visit(item)
      return
    }
    if (entry && typeof entry === 'object') {
      for (const item of Object.values(entry)) visit(item)
    }
  }
  visit(value)
}

export function hashPayload(value) {
  let encoded
  try {
    encoded = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    invalidData()
  }
  if (typeof encoded !== 'string' || Buffer.byteLength(encoded) > 2 * 1024 * 1024) invalidData()
  return createHash('sha256').update(encoded).digest('hex')
}

export function validateResearchRequest(value) {
  const request = record(value, () => invalid('基金研究参数无效。'))
  const allowedKeys = new Set(['task', 'funds', 'lookback_days'])
  exactKeys(request, allowedKeys, () => invalid('基金研究包含未知参数。'))
  if (typeof request.task !== 'string' || !TASKS.has(request.task)) invalid('基金研究任务类型无效。')
  if (!Array.isArray(request.funds)) invalid('请提供基金代码。')
  const funds = request.funds.map((value) => fundCode(value, invalid))
  if (new Set(funds).size !== funds.length) invalid('基金代码不能重复。')
  const expected = request.task === 'compare' ? [2, 6] : [1, 1]
  if (funds.length < expected[0] || funds.length > expected[1]) {
    invalid(request.task === 'compare' ? '基金对比需要 2 至 6 只基金。' : '该研究任务一次只支持 1 只基金。')
  }
  if (request.lookback_days !== undefined) {
    if (request.task !== 'recent_changes') invalid('只有近期变化研究支持回看天数。')
    if (!Number.isInteger(request.lookback_days) || request.lookback_days < 7 || request.lookback_days > 365) {
      invalid('回看天数须为 7 至 365 的整数。')
    }
  }
  return Object.freeze({
    task: request.task,
    funds: Object.freeze(funds),
    ...(request.lookback_days === undefined ? {} : { lookback_days: request.lookback_days })
  })
}

function normalizeSubject(value, requestedFunds) {
  const subject = record(value)
  exactKeys(subject, SUBJECT_KEYS)
  const fund_code = fundCode(subject.fund_code)
  if (!requestedFunds.has(fund_code)) invalidData()
  if (typeof subject.fund_type === 'string' && !FUND_TYPES.has(subject.fund_type)) {
    throw safeError('FUND_TYPE_UNSUPPORTED', '暂不支持该基金类型。')
  }
  return Object.freeze({
    fund_code,
    fund_name: displayText(subject.fund_name, 160),
    fund_type: enumValue(subject.fund_type, FUND_TYPES),
    currency: subject.currency === 'CNY' ? 'CNY' : invalidData()
  })
}

function normalizeDimensions(value) {
  if (value === undefined) return undefined
  const dimensions = record(value)
  exactKeys(dimensions, DIMENSION_KEYS)
  const result = {}
  for (const [key, entry] of Object.entries(dimensions)) {
    if (key === 'rank') {
      if (!Number.isInteger(entry) || entry < 1 || entry > 10_000) invalidData()
      result[key] = entry
    } else if (key === 'security_code' || key === 'benchmark_code') {
      result[key] = codeText(entry)
    } else if (key === 'direction') {
      result[key] = enumValue(entry, DIRECTIONS)
    } else if (key === 'asset_class') {
      result[key] = enumValue(entry, ASSET_CLASSES)
    } else {
      result[key] = displayText(entry, 256)
    }
  }
  return Object.freeze(result)
}

function normalizeEvidence(value, subjectCodes) {
  const evidence = record(value)
  exactKeys(evidence, EVIDENCE_KEYS)
  const subject_code = fundCode(evidence.subject_code)
  if (!subjectCodes.has(subject_code)) invalidData()
  const field = text(evidence.field, 96)
  const label = FIELD_LABELS.get(field)
  if (!label) invalidData()
  const period_start = evidence.period_start === undefined ? undefined : isoDate(evidence.period_start)
  const period_end = evidence.period_end === undefined ? undefined : isoDate(evidence.period_end)
  if (period_start && period_end && period_start > period_end) invalidData()
  const dimensions = normalizeDimensions(evidence.dimensions)
  return Object.freeze({
    id: text(evidence.id, 96),
    subject_code,
    field,
    label,
    value: scalar(evidence.value),
    ...(evidence.unit === undefined ? {} : { unit: enumValue(evidence.unit, UNITS) }),
    as_of: isoDate(evidence.as_of),
    ...(period_start ? { period_start } : {}),
    ...(period_end ? { period_end } : {}),
    ...(dimensions ? { dimensions } : {})
  })
}

function normalizeClaim(value, evidenceById) {
  const claim = record(value)
  exactKeys(claim, CLAIM_KEYS)
  const evidence_ids = boundedArray(claim.evidence_ids, 64).map((entry) => text(entry, 96))
  if (evidence_ids.some((id) => !evidenceById.has(id))) invalidData()
  const status = enumValue(claim.status, CLAIMS)
  if (['established', 'consistent', 'contradicted'].includes(status) && evidence_ids.length === 0) invalidData()
  const field = text(claim.field, 96)
  const label = FIELD_LABELS.get(field)
  if (!label || evidence_ids.some((id) => evidenceById.get(id).field !== field)) invalidData()
  return Object.freeze({
    id: text(claim.id, 96),
    field,
    text: CLAIM_MESSAGES[status](label),
    status,
    evidence_ids: Object.freeze(evidence_ids)
  })
}

export function normalizeResearchResult(value, {
  request,
  receivedAt,
  rawHash,
  privateTerms = []
}) {
  const normalizedRequest = validateResearchRequest(request)
  const response = record(value)
  exactKeys(response, RESPONSE_KEYS)
  if (response.schema_version !== undefined && response.schema_version !== '1') invalidData()
  if (response.task !== normalizedRequest.task) invalidData()
  const requestedFunds = new Set(normalizedRequest.funds)
  const subjects = boundedArray(response.subjects, 6, normalizedRequest.funds.length)
    .map((entry) => normalizeSubject(entry, requestedFunds))
  const subjectCodes = new Set(subjects.map((entry) => entry.fund_code))
  if (subjectCodes.size !== subjects.length || [...requestedFunds].some((code) => !subjectCodes.has(code))) invalidData()
  const evidence = boundedArray(response.evidence, 200, 1)
    .map((entry) => normalizeEvidence(entry, subjectCodes))
  const evidenceById = new Map(evidence.map((entry) => [entry.id, entry]))
  if (evidenceById.size !== evidence.length) invalidData()
  const claims = boundedArray(response.claims ?? [], 40)
    .map((entry) => normalizeClaim(entry, evidenceById))
  if (new Set(claims.map((entry) => entry.id)).size !== claims.length) invalidData()
  const as_of = isoDate(response.as_of)
  const status = enumValue(response.status, new Set(['complete', 'partial']))
  if (normalizedRequest.task === 'compare') {
    if (evidence.some((entry) => entry.as_of !== as_of)) invalidData()
    if (status === 'complete') {
      const fields = new Set(evidence.map((entry) => entry.field))
      for (const code of subjectCodes) {
        for (const field of fields) {
          if (!evidence.some((entry) => entry.subject_code === code && entry.field === field)) invalidData()
        }
      }
    }
  }
  if (normalizedRequest.task === 'recent_changes' && status === 'complete') {
    const snapshots = new Map()
    for (const entry of evidence) {
      const key = `${entry.subject_code}:${entry.field}`
      const dates = snapshots.get(key) ?? new Set()
      dates.add(entry.as_of)
      snapshots.set(key, dates)
    }
    if (![...snapshots.values()].some((dates) => dates.size >= 2)) invalidData()
  }
  const limitations = boundedArray(response.limitations ?? [], 12)
    .map((entry) => {
      const code = enumValue(entry, new Set(LIMITATION_MESSAGES.keys()))
      return Object.freeze({ code, message: LIMITATION_MESSAGES.get(code) })
    })
  const result = {
    schema_version: '1',
    task: normalizedRequest.task,
    status,
    as_of,
    received_at: isoTimestamp(receivedAt),
    frequency: enumValue(response.frequency, FREQUENCIES),
    source_type: enumValue(response.source_type, SOURCE_TYPES),
    raw_hash: typeof rawHash === 'string' && /^[a-f0-9]{64}$/u.test(rawHash) ? rawHash : invalidData(),
    quality_state: enumValue(response.quality_state, QUALITY_STATES),
    subjects: Object.freeze(subjects),
    evidence: Object.freeze(evidence),
    claims: Object.freeze(claims),
    limitations: Object.freeze(limitations)
  }
  if (Buffer.byteLength(JSON.stringify(result)) > 64 * 1024) invalidData()
  publicSafetyCheck(result, privateTerms)
  Object.freeze(result)
  NORMALIZED_RESULTS.add(result)
  return result
}

export function isNormalizedResearchResult(value) {
  return Boolean(value && typeof value === 'object' && NORMALIZED_RESULTS.has(value))
}
