import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'

import {
  FUND_RESEARCH_OUTPUT_SCHEMA,
  registerFundResearchRuntime
} from '../packages/dsh-fund-research-runtime/index.js'
import { createYingmiMcpClient } from '../packages/dsh-fund-research-runtime/yingmi-mcp.js'
import { createYingmiFundProvider } from '../packages/dsh-fund-research-runtime/yingmi-provider.js'

const NOW = '2026-09-06T09:00:00.000Z'
const PRIVATE_KEY = 'private-key-never-public'

function fundDetail(code, name, overrides = {}) {
  return {
    fundCode: code,
    data: {
      summary: {
        fundCode: code,
        fundName: name,
        fundInvestType: '股票型',
        oneYearReturn: '6.22%',
        dailyReturn: '-0.09%',
        nav: 4.6147,
        navDate: '2026年09月04日',
        uiSetupDate: '2012-05-04',
        netAsset: '948.72亿',
        netAssetUpdateDate: '2026年06月30日',
        indexCode: '000300',
        indexName: '沪深300',
        ...overrides
      },
      assetPortfolios: [
        { name: '股票', ratio: 0.9592, value: 91_003_211_192.29 },
        { name: '债券', ratio: 0, value: null }
      ],
      industryPortfolios: [
        { name: '制造业', ratio: 0.6143, value: 58_279_028_468.01 },
        { name: '金融业', ratio: 0.1684, value: 15_973_077_417.4 }
      ]
    }
  }
}

function navHistory(code = '510300') {
  return [
    '[1]:',
    `  - fundCode: "${code}"`,
    '    data:',
    `      code: "${code}"`,
    '      curDimensionType: oneMonth',
    '      data[3]{navDate,nav,dailyReturn}:',
    '        2026年09月04日,4.6147,"-0.09%"',
    '        2026年08月05日,4.4000,0.10%',
    '        2026年08月04日,4.3900,"-0.20%"'
  ].join('\n')
}

const schemas = {
  BatchGetFundsDetail: {
    type: 'object',
    properties: {
      fundCodes: { type: 'array', items: { type: 'string' } }
    },
    required: ['fundCodes'],
    additionalProperties: false
  },
  BatchGetFundNavHistory: {
    type: 'object',
    properties: {
      fundCodes: { type: 'array', items: { type: 'string' } },
      isDesc: { type: 'boolean' },
      dimensionType: { type: 'string' }
    },
    required: ['fundCodes'],
    additionalProperties: false
  }
}

function rpcResponse(id, result, { session, sse = false } = {}) {
  const body = JSON.stringify({ jsonrpc: '2.0', id, result })
  return new Response(sse ? `event: message\r\ndata: ${body}\r\n\r\n` : body, {
    status: 200,
    headers: {
      'content-type': sse ? 'text/event-stream' : 'application/json',
      ...(session ? { 'Mcp-Session-Id': session } : {})
    }
  })
}

function mockMcp({ payloads, sseToolCalls = false, oneTimeSession404 = false, initializeStatus } = {}) {
  const calls = []
  let rejectedSession = false
  const fetch = vi.fn(async (url, init = {}) => {
    calls.push({ url: String(url), init })
    if (init.method === 'DELETE') return new Response(null, { status: 204 })
    const request = JSON.parse(init.body)
    if (request.method === 'initialize') {
      if (initializeStatus) return new Response(null, { status: initializeStatus })
      return rpcResponse(request.id, {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'private-upstream', version: '1' }
      }, { session: rejectedSession ? 'session-2' : 'session-1' })
    }
    if (request.method === 'notifications/initialized') return new Response(null, { status: 202 })
    if (request.method === 'tools/list') {
      return rpcResponse(request.id, {
        tools: Object.entries(schemas).map(([name, inputSchema]) => ({ name, inputSchema }))
      })
    }
    if (request.method === 'tools/call') {
      if (oneTimeSession404 && !rejectedSession) {
        rejectedSession = true
        return new Response(null, { status: 404 })
      }
      const value = payloads?.[request.params.name]
      const text = typeof value === 'function' ? value(request.params.arguments) : value
      return rpcResponse(request.id, {
        content: [{ type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text) }],
        isError: false
      }, { sse: sseToolCalls })
    }
    return new Response(null, { status: 500 })
  })
  return { fetch, calls }
}

function providerFor(payloads, options = {}) {
  const transport = mockMcp({ payloads, ...options })
  return {
    ...transport,
    provider: createYingmiFundProvider({
      resolveCredential: vi.fn(async () => PRIVATE_KEY),
      fetch: transport.fetch,
      clock: () => new Date(NOW)
    })
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('private MCP transport', () => {
  it('uses only the fixed official route and private header', async () => {
    const transport = mockMcp({
      payloads: { BatchGetFundsDetail: [fundDetail('510300', '沪深300ETF')] }
    })
    const client = createYingmiMcpClient({ apiKey: PRIVATE_KEY, fetch: transport.fetch })
    await client.callTool('BatchGetFundsDetail', { fundCodes: ['510300'] })
    await client.close()

    const posts = transport.calls.filter((call) => call.init.method === 'POST')
    expect(posts.length).toBeGreaterThanOrEqual(4)
    expect(posts.every((call) => call.url === 'https://stargate.yingmi.com/mcp/v2')).toBe(true)
    expect(posts.every((call) => call.init.redirect === 'error')).toBe(true)
    expect(posts.every((call) => call.init.headers['x-api-key'] === PRIVATE_KEY)).toBe(true)
    expect(posts.every((call) => call.init.headers.authorization === undefined)).toBe(true)
  })

  it('accepts a matching SSE response and rebuilds one expired session', async () => {
    const transport = mockMcp({
      payloads: { BatchGetFundsDetail: [fundDetail('510300', '沪深300ETF')] },
      sseToolCalls: true,
      oneTimeSession404: true
    })
    const client = createYingmiMcpClient({ apiKey: PRIVATE_KEY, fetch: transport.fetch })
    const result = await client.callTool('BatchGetFundsDetail', { fundCodes: ['510300'] })
    await client.close()

    expect(result).toHaveLength(1)
    const methods = transport.calls
      .filter((call) => call.init.method === 'POST')
      .map((call) => JSON.parse(call.init.body).method)
    expect(methods.filter((method) => method === 'initialize')).toHaveLength(2)
    expect(methods.filter((method) => method === 'tools/call')).toHaveLength(2)
  })

  it('rejects non-allowlisted tools before any network request', async () => {
    const fetch = vi.fn()
    const client = createYingmiMcpClient({ apiKey: PRIVATE_KEY, fetch })
    await expect(client.callTool('UnknownWriteTool', {})).rejects.toThrow('Private fund data request failed.')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed on authorization errors without exposing the key', async () => {
    const transport = mockMcp({ initializeStatus: 401 })
    const client = createYingmiMcpClient({ apiKey: PRIVATE_KEY, fetch: transport.fetch })
    let failure
    try {
      await client.callTool('BatchGetFundsDetail', { fundCodes: ['510300'] })
    } catch (error) {
      failure = error
    }
    expect(failure.state).toBe('unauthorized')
    expect(JSON.stringify(failure)).not.toContain(PRIVATE_KEY)
  })
})

describe('private fund mappings', () => {
  it('normalizes a single fund without exposing upstream details', async () => {
    const { provider, calls } = providerFor({
      BatchGetFundsDetail: [fundDetail('510300', '沪深300ETF')]
    })
    const result = await provider.research({ task: 'single', funds: ['510300'] })

    expect(validateJsonSchemaValue(FUND_RESEARCH_OUTPUT_SCHEMA, result)).toEqual([])
    expect(result).toMatchObject({
      task: 'single',
      status: 'complete',
      as_of: '2026-09-04',
      quality_state: 'verified',
      subjects: [{ fund_code: '510300', fund_type: 'etf' }]
    })
    expect(result.evidence.map((entry) => entry.field)).toEqual([
      'unit_nav', 'return_1y', 'fund_size', 'inception_date', 'benchmark'
    ])
    expect(JSON.stringify(result)).not.toMatch(/yingmi|stargate|batchget|private-key|mcp/iu)
    expect(calls.some((call) => String(call.init.body).includes(PRIVATE_KEY))).toBe(false)
  })

  it('uses Shanghai calendar dates for freshness around UTC day boundaries', async () => {
    const transport = mockMcp({
      payloads: { BatchGetFundsDetail: [fundDetail('510300', '沪深300ETF')] }
    })
    const provider = createYingmiFundProvider({
      resolveCredential: async () => PRIVATE_KEY,
      fetch: transport.fetch,
      clock: () => new Date('2026-09-03T17:00:00.000Z')
    })
    const result = await provider.research({ task: 'single', funds: ['510300'] })
    expect(result.as_of).toBe('2026-09-04')
    expect(result.quality_state).toBe('verified')
  })

  it('marks a parseable fund size without a disclosure date as incomplete', async () => {
    const { provider } = providerFor({
      BatchGetFundsDetail: [fundDetail('510300', '沪深300ETF', { netAssetUpdateDate: null })]
    })
    const result = await provider.research({ task: 'single', funds: ['510300'] })
    expect(result.status).toBe('partial')
    expect(result.evidence.some((entry) => entry.field === 'fund_size')).toBe(false)
    expect(result.limitations).toContainEqual({
      code: 'unsupported_metric',
      message: '部分研究指标当前暂不支持。'
    })
  })

  it('rejects an echoed dynamic credential in mapped provider content', async () => {
    const leaked = fundDetail('510300', '沪深300ETF')
    leaked.data.industryPortfolios[0].name = PRIVATE_KEY
    const { provider } = providerFor({ BatchGetFundsDetail: [leaked] })
    await expect(provider.research({ task: 'holdings_style', funds: ['510300'] }))
      .rejects.toMatchObject({ code: 'FUND_DATA_INVALID' })
  })

  it('normalizes a same-date comparison for every requested fund', async () => {
    const { provider } = providerFor({
      BatchGetFundsDetail: [
        fundDetail('510300', '沪深300ETF'),
        fundDetail('510500', '中证500ETF', { nav: 6.1234, oneYearReturn: '8.10%' })
      ]
    })
    const result = await provider.research({ task: 'compare', funds: ['510300', '510500'] })

    expect(result.status).toBe('complete')
    expect(result.subjects).toHaveLength(2)
    expect(result.evidence.filter((entry) => entry.field === 'unit_nav')).toHaveLength(2)
    expect(result.evidence.filter((entry) => entry.field === 'return_1y')).toHaveLength(2)
  })

  it('refuses to compare fund snapshots from different dates', async () => {
    const { provider } = providerFor({
      BatchGetFundsDetail: [
        fundDetail('510300', '沪深300ETF'),
        fundDetail('510500', '中证500ETF', { navDate: '2026年09月03日' })
      ]
    })
    await expect(provider.research({ task: 'compare', funds: ['510300', '510500'] }))
      .rejects.toMatchObject({ code: 'FUND_DATA_UNAVAILABLE' })
  })

  it('normalizes dated asset and industry allocations', async () => {
    const { provider } = providerFor({
      BatchGetFundsDetail: [fundDetail('510300', '沪深300ETF')]
    })
    const result = await provider.research({ task: 'holdings_style', funds: ['510300'] })

    expect(result).toMatchObject({
      status: 'complete',
      as_of: '2026-06-30',
      frequency: 'quarterly',
      source_type: 'official_disclosure'
    })
    expect(result.evidence.some((entry) => entry.field === 'asset_allocation')).toBe(true)
    expect(result.evidence.some((entry) => entry.field === 'industry_allocation')).toBe(true)
  })

  it('rejects empty or internally inconsistent allocations', async () => {
    const empty = fundDetail('510300', '沪深300ETF')
    empty.data.assetPortfolios = []
    empty.data.industryPortfolios = []
    const emptyProvider = providerFor({ BatchGetFundsDetail: [empty] }).provider
    await expect(emptyProvider.research({ task: 'holdings_style', funds: ['510300'] }))
      .rejects.toMatchObject({ code: 'FUND_DATA_UNAVAILABLE' })

    const excessive = fundDetail('510300', '沪深300ETF')
    excessive.data.assetPortfolios = [
      { name: '股票', ratio: 0.8 },
      { name: '债券', ratio: 0.4 }
    ]
    const excessiveProvider = providerFor({ BatchGetFundsDetail: [excessive] }).provider
    await expect(excessiveProvider.research({ task: 'holdings_style', funds: ['510300'] }))
      .rejects.toMatchObject({ code: 'FUND_DATA_UNAVAILABLE' })
  })

  it('marks oversized allocation lists as truncated instead of complete', async () => {
    const oversized = fundDetail('510300', '沪深300ETF')
    oversized.data.industryPortfolios = Array.from({ length: 31 }, (_, index) => ({
      name: `行业${index + 1}`,
      ratio: 0.01,
      value: index + 1
    }))
    const { provider } = providerFor({ BatchGetFundsDetail: [oversized] })
    const result = await provider.research({ task: 'holdings_style', funds: ['510300'] })
    expect(result.status).toBe('partial')
    expect(result.evidence.filter((entry) => entry.field === 'industry_allocation')).toHaveLength(30)
    expect(result.limitations).toContainEqual({ code: 'truncated', message: '结果已按产品上限截断。' })
  })

  it('normalizes two dated NAV snapshots for recent changes', async () => {
    const { provider } = providerFor({
      BatchGetFundsDetail: [fundDetail('510300', '沪深300ETF')],
      BatchGetFundNavHistory: navHistory()
    })
    const result = await provider.research({
      task: 'recent_changes',
      funds: ['510300'],
      lookback_days: 30
    })

    expect(result).toMatchObject({ status: 'complete', as_of: '2026-09-04' })
    expect(result.evidence.map((entry) => entry.as_of)).toEqual(['2026-09-04', '2026-08-05'])
    expect(result.evidence.map((entry) => entry.dimensions.direction)).toEqual(['current', 'previous'])
  })

  it('does not treat a shorter returned history window as the requested period', async () => {
    const { provider } = providerFor({
      BatchGetFundsDetail: [fundDetail('510300', '沪深300ETF')],
      BatchGetFundNavHistory: navHistory()
    })
    await expect(provider.research({
      task: 'recent_changes',
      funds: ['510300'],
      lookback_days: 31
    })).rejects.toMatchObject({ code: 'FUND_DATA_UNAVAILABLE' })
  })

  it('rejects a lookalike history header outside the exact data block', async () => {
    const malformed = navHistory().replace(
      '      data[3]{navDate,nav,dailyReturn}:',
      '      metadata[3]{navDate,nav,dailyReturn}:'
    )
    const { provider } = providerFor({
      BatchGetFundsDetail: [fundDetail('510300', '沪深300ETF')],
      BatchGetFundNavHistory: malformed
    })
    await expect(provider.research({
      task: 'recent_changes',
      funds: ['510300'],
      lookback_days: 30
    })).rejects.toMatchObject({ code: 'FUND_DATA_UNAVAILABLE' })
  })

  it('returns an explicit partial result when the requested prior snapshot is absent', async () => {
    const shortHistory = navHistory()
      .replace('2026年08月05日', '2026年08月10日')
      .replace('2026年08月04日', '2026年08月09日')
    const { provider } = providerFor({
      BatchGetFundsDetail: [fundDetail('510300', '沪深300ETF')],
      BatchGetFundNavHistory: shortHistory
    })
    const result = await provider.research({
      task: 'recent_changes',
      funds: ['510300'],
      lookback_days: 30
    })
    expect(result.status).toBe('partial')
    expect(result.evidence).toHaveLength(1)
    expect(result.limitations).toEqual([{
      code: 'insufficient_history',
      message: '历史数据不足，当前无法检验变化。'
    }])
  })

  it('does not return a historical point more than seven days before the target', async () => {
    const distantHistory = navHistory()
      .replace('2026年08月05日', '2026年07月20日')
      .replace('2026年08月04日', '2026年07月19日')
    const { provider } = providerFor({
      BatchGetFundsDetail: [fundDetail('510300', '沪深300ETF')],
      BatchGetFundNavHistory: distantHistory
    })
    const result = await provider.research({
      task: 'recent_changes',
      funds: ['510300'],
      lookback_days: 30
    })
    expect(result.status).toBe('partial')
    expect(result.evidence).toHaveLength(1)
    expect(result.evidence[0].dimensions.direction).toBe('current')
  })

  it.each([
    ['沪深300ETF联接A', { fundInvestType: '指数型' }, 'etf_feeder'],
    ['被动指数基金', { fundInvestType: '指数型' }, 'index_fund']
  ])('classifies only evidence-backed index products: %s', async (name, overrides, expected) => {
    const { provider } = providerFor({
      BatchGetFundsDetail: [fundDetail('160706', name, overrides)]
    })
    const result = await provider.research({ task: 'single', funds: ['160706'] })
    expect(result.subjects[0].fund_type).toBe(expected)
  })

  it('does not classify a strategy fund merely because its name contains ETF', async () => {
    const { provider } = providerFor({
      BatchGetFundsDetail: [fundDetail('000001', 'ETF策略混合', {
        fundInvestType: '混合型',
        indexCode: null,
        indexName: null
      })]
    })
    await expect(provider.research({ task: 'single', funds: ['000001'] }))
      .rejects.toMatchObject({ code: 'FUND_TYPE_UNSUPPORTED' })
  })

  it('rejects active funds outside the enabled product scope', async () => {
    const { provider } = providerFor({
      BatchGetFundsDetail: [fundDetail('000001', '主动成长混合', { indexCode: null, indexName: null })]
    })
    await expect(provider.research({ task: 'single', funds: ['000001'] }))
      .rejects.toMatchObject({ code: 'FUND_TYPE_UNSUPPORTED' })
  })

  it('fails closed when the credential is absent before making a request', async () => {
    const fetch = vi.fn()
    const provider = createYingmiFundProvider({
      resolveCredential: async () => undefined,
      fetch,
      clock: () => new Date(NOW)
    })
    await expect(provider.research({ task: 'single', funds: ['510300'] }))
      .rejects.toMatchObject({
        code: 'FUND_DATA_UNAVAILABLE',
        message: '基金数据暂时不可用，请稍后重试。'
      })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('bounds credential resolution and honors cancellation before transport', async () => {
    const fetch = vi.fn()
    const never = () => new Promise(() => {})
    const timed = createYingmiFundProvider({
      resolveCredential: never,
      fetch,
      timeoutMs: 10,
      clock: () => new Date(NOW)
    })
    await expect(timed.research({ task: 'single', funds: ['510300'] }))
      .rejects.toMatchObject({ code: 'FUND_DATA_UNAVAILABLE' })

    const cancelled = createYingmiFundProvider({
      resolveCredential: never,
      fetch,
      timeoutMs: 1_000,
      clock: () => new Date(NOW)
    })
    const controller = new AbortController()
    const pending = cancelled.research({ task: 'single', funds: ['510300'] }, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'FUND_RESEARCH_CANCELLED' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('runtime credential seam', () => {
  it('resolves the private key lazily from the managed credential store', async () => {
    const transport = mockMcp({
      payloads: { BatchGetFundsDetail: [fundDetail('510300', '沪深300ETF')] }
    })
    vi.stubGlobal('fetch', transport.fetch)
    const tools = new Map()
    const resolve = vi.fn(async () => ({ value: PRIVATE_KEY, source: 'file' }))
    const ctx = {
      get: (name) => name === 'credentials' ? { resolve } : undefined,
      tools: {
        register(tool) {
          tools.set(tool.name, tool)
          return () => tools.delete(tool.name)
        }
      }
    }

    const runtime = registerFundResearchRuntime(ctx)
    expect(resolve).not.toHaveBeenCalled()
    const result = await tools.get('fund_research').execute({ task: 'single', funds: ['510300'] }, {})
    expect(result.subjects[0].fund_code).toBe('510300')
    expect(resolve).toHaveBeenCalledWith('YINGMI_API_KEY')
    runtime.dispose()
  })
})
