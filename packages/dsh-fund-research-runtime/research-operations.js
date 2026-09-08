import { createHash } from 'node:crypto'
import { RESEARCH_CAPABILITIES, RESEARCH_CATEGORIES, researchCapability } from './research-capabilities.js'
import { serviceError, validateResearchRequest } from './contract.js'

export const RESEARCH_REQUEST_BYTES = 16 * 1024
export const RESEARCH_RESPONSE_BYTES = 64 * 1024
const forbiddenKeys = /^(?:__proto__|prototype|constructor|api[_-]?key|authorization|headers|endpoint|password|access[_-]?token|secret)$/i
const digest = value => createHash('sha256').update(value).digest('hex')
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
  return JSON.stringify(value)
}
export function researchHash(value) { return digest(canonicalJson(value)) }

export function boundedJson(value, maxBytes = RESEARCH_REQUEST_BYTES) {
  let nodes = 0
  function visit(item, depth) {
    if (++nodes > 8000 || depth > 20) throw serviceError('RESEARCH_ARGUMENTS_INVALID')
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return
    if (typeof item === 'number' && Number.isFinite(item)) return
    if (typeof item !== 'object' || (!Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item)))) throw serviceError('RESEARCH_ARGUMENTS_INVALID')
    for (const [key, child] of Object.entries(item)) {
      if (forbiddenKeys.test(key)) throw serviceError('RESEARCH_ARGUMENTS_INVALID')
      visit(child, depth + 1)
    }
  }
  visit(value, 0)
  const text = canonicalJson(value)
  if (Buffer.byteLength(text) > maxBytes) throw serviceError('RESEARCH_ARGUMENTS_INVALID')
  return JSON.parse(text)
}

export function validateServiceQuery(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw serviceError('RESEARCH_ARGUMENTS_INVALID')
  if (!Object.hasOwn(input, 'operation')) return validateResearchRequest(input)
  const query = boundedJson(input)
  if (query.operation === 'catalog') {
    if (Object.keys(query).some(k => !['operation', 'category', 'capability'].includes(k)) ||
        (query.category !== undefined && !RESEARCH_CATEGORIES.includes(query.category)) ||
        (query.capability !== undefined && !researchCapability(query.capability)) ||
        (query.category !== undefined && query.capability !== undefined)) throw serviceError('RESEARCH_ARGUMENTS_INVALID')
    return query
  }
  if (query.operation !== 'execute' || !researchCapability(query.capability) ||
      Object.keys(query).sort().join(',') !== 'arguments,capability,operation,schema_hash' ||
      !/^[a-f0-9]{64}$/.test(query.schema_hash) || !query.arguments ||
      typeof query.arguments !== 'object' || Array.isArray(query.arguments)) throw serviceError('RESEARCH_ARGUMENTS_INVALID')
  return query
}

// Validate at both ends of the hosted bridge, including the request binding and freshness.
export function validateOperationResult(value, input, clock = () => new Date()) {
  const query = validateServiceQuery(input)
  const fail = () => { throw serviceError('FUND_SERVICE_UNAVAILABLE') }
  if (!value || value.schema_version !== '2' || value.operation !== query.operation ||
      value.request_hash !== researchHash(query) || !/^[a-f0-9]{64}$/.test(value.raw_hash) ||
      typeof value.received_at !== 'string' || Buffer.byteLength(JSON.stringify(value)) > RESEARCH_RESPONSE_BYTES) fail()
  const age = clock().valueOf() - Date.parse(value.received_at)
  if (!Number.isFinite(age) || age < -60_000 || age > 15 * 60_000) fail()
  if (!Array.isArray(value.limitations) || value.limitations.length > 10 ||
      value.limitations.some(item => typeof item !== 'string' || item.length > 500)) fail()
  const keys = ['schema_version', 'operation', 'received_at', 'request_hash', 'raw_hash', 'limitations']
  if (query.operation === 'catalog') {
    keys.push('entries')
    if (!Array.isArray(value.entries) || value.entries.length > 60) fail()
    const ids = new Set()
    for (const entry of value.entries) {
      const spec = researchCapability(entry.id)
      if (!spec || ids.has(entry.id) || spec.title !== entry.title || spec.category !== entry.category ||
          (query.category && entry.category !== query.category) || (query.capability && entry.id !== query.capability) ||
          !['available', 'unavailable', 'incompatible'].includes(entry.state) ||
          Object.keys(entry).some(k => !['id','title','category','state','description','arguments_schema_json','schema_hash'].includes(k))) fail()
      ids.add(entry.id)
      if (entry.description !== undefined && (typeof entry.description !== 'string' || entry.description.length > 4000)) fail()
      if (entry.state === 'available' && query.capability) {
        if (!/^[a-f0-9]{64}$/.test(entry.schema_hash) || typeof entry.arguments_schema_json !== 'string') fail()
        let schema
        try { schema = JSON.parse(entry.arguments_schema_json) } catch { fail() }
        if (schema?.type !== 'object' || Buffer.byteLength(entry.arguments_schema_json) > 32 * 1024) fail()
      } else if (entry.arguments_schema_json !== undefined || entry.schema_hash !== undefined) fail()
    }
    const expected = query.capability ? 1 : RESEARCH_CATEGORIES.includes(query.category)
      ? RESEARCH_CAPABILITIES.filter(item => item.category === query.category).length : 60
    if (expected !== undefined && value.entries.length !== expected) fail()
  } else {
    keys.push('capability', 'status', 'quality_state', 'data_json')
    if (value.capability !== query.capability || value.quality_state !== 'unverified' ||
        !['received', 'empty'].includes(value.status) || typeof value.data_json !== 'string') fail()
    try { JSON.parse(value.data_json) } catch { fail() }
  }
  if (Object.keys(value).some(k => !keys.includes(k))) fail()
  return Object.freeze(value)
}

export function isOperationQuery(query) { return query?.operation === 'catalog' || query?.operation === 'execute' }
