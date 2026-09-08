import { describe, expect, it, vi } from 'vitest'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'

import {
  FUND_RESEARCH_OUTPUT_SCHEMA,
  FundResearchError,
  apply,
  createFundResearchTool,
  registerFundResearchRuntime
} from '../packages/dsh-fund-research-runtime/index.js'
import {
  createPrivateGatewayProvider,
  createPrivateToolProvider,
  createProviderFromEnvironment
} from '../packages/dsh-fund-research-runtime/provider.js'

const NOW = '2026-09-06T09:00:00.000Z'
const AS_OF = '2026-09-05'
const HASH = 'a'.repeat(64)
const PRIVATE_TERMS = ['secretvendor', '盈米']

function publicResult(task, funds, overrides = {}) {
  const subjects = funds.map((fund_code, index) => ({
    fund_code,
    fund_name: `测试指数基金${index + 1}`,
    fund_type: index === 0 ? 'etf' : 'index_fund',
    currency: 'CNY'
  }))
  const evidence = funds.map((subject_code, index) => ({
    id: `e${index + 1}`,
    subject_code,
    field: 'unit_nav',
    label: '单位净值',
    value: 1.2 + index,
    unit: 'CNY',
    as_of: AS_OF,
    dimensions: { comparison_group: '同类指数基金' }
  }))
  if (task === 'recent_changes') {
    evidence.push({
      id: 'e_previous',
      subject_code: funds[0],
      field: 'unit_nav',
      label: '单位净值',
      value: 1.1,
      unit: 'CNY',
      as_of: '2026-08-31',
      dimensions: { direction: 'previous' }
    })
  }
  return {
    schema_version: '1',
    task,
    status: 'complete',
    as_of: AS_OF,
    received_at: NOW,
    frequency: 'daily',
    source_type: 'official_disclosure',
    raw_hash: HASH,
    quality_state: 'verified',
    subjects,
    evidence,
    claims: [{
      id: 'c1',
      field: 'unit_nav',
      text: '净值数据已取得。',
      status: 'established',
      evidence_ids: evidence.map((entry) => entry.id)
    }],
    limitations: [],
    ...overrides
  }
}

function providerPayload(task, funds, overrides = {}) {
  const result = publicResult(task, funds, overrides)
  const { received_at: _receivedAt, raw_hash: _rawHash, ...payload } = result
  return {
    ...payload,
    evidence: result.evidence.map(({ label: _label, ...entry }) => entry),
    claims: result.claims.map(({ text: _text, ...entry }) => entry),
    limitations: result.limitations.map((entry) => entry.code ?? entry)
  }
}

describe('fund research public tool', () => {
  it('registers one product-level capability with a strict valid output', async () => {
    const internalProvider = createPrivateToolProvider({
      invoke: async () => ({ value: 1.2 }),
      privateTerms: PRIVATE_TERMS,
      operations: {
        single: {
          name: 'internal.profile.lookup',
          buildArguments: (request) => ({ code: request.funds[0] }),
          normalize: (_raw, { request }) => providerPayload(request.task, request.funds)
        }
      },
      clock: () => new Date(NOW)
    })
    const provider = {
      research: vi.fn((request, options) => internalProvider.research(request, options))
    }
    const tool = createFundResearchTool(provider)
    const value = await tool.execute({ task: 'single', funds: ['510300'] }, {})

    expect(tool.name).toBe('fund_research')
    expect(validateJsonSchemaValue(FUND_RESEARCH_OUTPUT_SCHEMA, value)).toEqual([])
    expect(provider.research).toHaveBeenCalledWith(
      { task: 'single', funds: ['510300'] },
      { signal: undefined }
    )
    expect(JSON.stringify({ name: tool.name, description: tool.description, value }))
      .not.toMatch(/mcp__/iu)
  })

  it.each([
    [{ task: 'compare', funds: ['510300'] }, '基金对比需要'],
    [{ task: 'single', funds: ['510300', '510500'] }, '一次只支持'],
    [{ task: 'compare', funds: ['510300', '510300'] }, '不能重复'],
    [{ task: 'single', funds: ['ABC'] }, '6 位数字'],
    [{ task: 'single', funds: ['510300'], tool: 'private' }, '未知参数'],
    [{ task: 'single', funds: ['510300'], lookback_days: 30 }, '只有近期变化'],
    [{ task: 'recent_changes', funds: ['510300'], lookback_days: 2 }, '7 至 365']
  ])('rejects unsafe or ambiguous input before the provider call', async (input, message) => {
    const provider = { research: vi.fn() }
    const tool = createFundResearchTool(provider)
    await expect(tool.execute(input, {})).rejects.toThrow(message)
    expect(provider.research).not.toHaveBeenCalled()
  })

  it('registers and disposes the tool without leaving a late public surface', () => {
    const tools = new Map()
    const ctx = {
      tools: {
        register(tool) {
          tools.set(tool.name, tool)
          return () => tools.delete(tool.name)
        }
      }
    }
    const runtime = registerFundResearchRuntime(ctx, {
      provider: { research: async () => publicResult('single', ['510300']) }
    })
    expect([...tools.keys()]).toEqual(['fund_research'])
    runtime.dispose()
    runtime.dispose()
    expect(tools.size).toBe(0)
  })

  it('composes through the DSH effect lifecycle', () => {
    const tools = new Map()
    let dispose
    apply({
      tools: {
        register(tool) {
          tools.set(tool.name, tool)
          return () => tools.delete(tool.name)
        }
      },
      effect(setup) {
        dispose = setup()
      }
    })
    expect([...tools.keys()]).toEqual(['fund_research', 'fund_research_catalog', 'fund_research_query'])
    dispose()
    expect(tools.size).toBe(0)
  })

  it('does not trust error text from an injected provider', async () => {
    const tool = createFundResearchTool({
      research: async () => {
        throw new FundResearchError(
          'PRIVATE_FAILURE',
          'https://secret.invalid Bearer credential traceId=private'
        )
      }
    })

    let failure
    try {
      await tool.execute({ task: 'single', funds: ['510300'] }, {})
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({
      code: 'FUND_DATA_UNAVAILABLE',
      message: '基金数据暂时不可用，请稍后重试。'
    })
    expect(failure.message).not.toMatch(/secret|bearer|trace|https/iu)
  })

  it('rejects an unvalidated result from an injected provider', async () => {
    const tool = createFundResearchTool({
      research: async () => publicResult('single', ['510300'], {
        claims: [{
          id: 'c1',
          field: 'unit_nav',
          text: '建议配置本基金',
          status: 'established',
          evidence_ids: ['e1']
        }]
      })
    })

    await expect(tool.execute({ task: 'single', funds: ['510300'] }, {}))
      .rejects.toMatchObject({
        code: 'FUND_DATA_UNAVAILABLE',
        message: '基金数据暂时不可用，请稍后重试。'
      })
  })
})

describe('private fund data boundary', () => {
  it('uses only the frozen operation mapping and discards the raw response', async () => {
    const invoke = vi.fn(async () => ({ secret_payload: 'not-public', value: 1.2 }))
    const provider = createPrivateToolProvider({
      invoke,
      privateTerms: PRIVATE_TERMS,
      clock: () => new Date(NOW),
      operations: {
        single: {
          name: 'internal.profile.lookup',
          buildArguments: (request) => ({ code: request.funds[0] }),
          normalize: (_raw, { request }) => providerPayload(request.task, request.funds)
        }
      }
    })

    const result = await provider.research({ task: 'single', funds: ['510300'] })
    expect(invoke).toHaveBeenCalledWith({
      name: 'internal.profile.lookup',
      arguments: { code: '510300' },
      signal: expect.any(AbortSignal)
    })
    expect(result.raw_hash).toMatch(/^[a-f0-9]{64}$/u)
    expect(result.evidence[0].label).toBe('单位净值')
    expect(result.claims[0].text).toBe('单位净值已有可核验证据。')
    expect(JSON.stringify(result)).not.toContain('internal.profile.lookup')
    expect(JSON.stringify(result)).not.toContain('secret_payload')
  })

  it('rejects a private identifier planted in normalized content', async () => {
    const provider = createPrivateToolProvider({
      invoke: async () => ({ ok: true }),
      privateTerms: PRIVATE_TERMS,
      operations: {
        single: {
          name: 'internal.profile.lookup',
          buildArguments: () => ({ code: '510300' }),
          normalize: (_raw, { request }) => {
            const result = providerPayload(request.task, request.funds)
            result.claims[0].text = 'internal.profile.lookup returned this value'
            return result
          }
        }
      }
    })

    await expect(provider.research({ task: 'single', funds: ['510300'] }))
      .rejects.toMatchObject({
        code: 'FUND_DATA_INVALID',
        message: '基金数据暂时不可用，请稍后重试。'
      })
  })

  it.each([
    'secretvendor 返回了该字段',
    '盈米返回了该字段',
    '详情见 https://private.invalid/fund',
    '底层工具调用成功',
    '建议买入并继续加仓',
    '建议配置本基金',
    '本基金适合稳健型投资者',
    '预计年化收益可达10%',
    '当前是较好买点',
    'api.private.example.com/v1/fund',
    'fund_detail_query 返回成功'
  ])('rejects prohibited provider or advisory text: %s', async (unsafeText) => {
    const provider = createPrivateToolProvider({
      invoke: async () => ({ ok: true }),
      privateTerms: PRIVATE_TERMS,
      operations: {
        single: {
          name: 'internal.profile.lookup',
          buildArguments: () => ({ code: '510300' }),
          normalize: (_raw, { request }) => {
            const result = providerPayload(request.task, request.funds)
            result.evidence[0].value = unsafeText
            return result
          }
        }
      }
    })

    await expect(provider.research({ task: 'single', funds: ['510300'] }))
      .rejects.toMatchObject({
        code: 'FUND_DATA_INVALID',
        message: '基金数据暂时不可用，请稍后重试。'
      })
  })

  it('never exposes transport errors, credentials, endpoints or traces', async () => {
    const provider = createPrivateToolProvider({
      invoke: async () => {
        throw new Error('tool failed at https://private.invalid with Bearer secret trace_id=abc')
      },
      privateTerms: PRIVATE_TERMS,
      operations: {
        single: {
          name: 'internal.profile.lookup',
          buildArguments: () => ({ code: '510300' }),
          normalize: () => ({})
        }
      }
    })

    let failure
    try {
      await provider.research({ task: 'single', funds: ['510300'] })
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({
      code: 'FUND_DATA_UNAVAILABLE',
      message: '基金数据暂时不可用，请稍后重试。'
    })
    expect(JSON.stringify(failure)).not.toMatch(/private\.invalid|secret|trace_id|internal\.profile/iu)
  })

  it('requires one aligned as-of date for comparisons', async () => {
    const provider = createPrivateToolProvider({
      invoke: async () => ({ ok: true }),
      privateTerms: PRIVATE_TERMS,
      operations: {
        compare: {
          name: 'internal.compare',
          buildArguments: (request) => ({ codes: request.funds }),
          normalize: (_raw, { request }) => {
            const result = providerPayload(request.task, request.funds)
            result.evidence[1] = { ...result.evidence[1], as_of: '2026-09-04' }
            return result
          }
        }
      }
    })

    await expect(provider.research({ task: 'compare', funds: ['510300', '510500'] }))
      .rejects.toMatchObject({ code: 'FUND_DATA_INVALID' })
  })

  it('requires complete comparisons to cover every fund for every metric', async () => {
    const provider = createPrivateToolProvider({
      invoke: async () => ({ ok: true }),
      privateTerms: PRIVATE_TERMS,
      operations: {
        compare: {
          name: 'internal.compare',
          buildArguments: (request) => ({ codes: request.funds }),
          normalize: (_raw, { request }) => {
            const result = providerPayload(request.task, request.funds)
            result.evidence = [result.evidence[0]]
            result.claims = [{
              id: 'c1',
              field: 'unit_nav',
              status: 'established',
              evidence_ids: ['e1']
            }]
            return result
          }
        }
      }
    })

    await expect(provider.research({ task: 'compare', funds: ['510300', '510500'] }))
      .rejects.toMatchObject({ code: 'FUND_DATA_INVALID' })
  })

  it('keeps active funds outside the enabled product scope', async () => {
    const provider = createPrivateToolProvider({
      invoke: async () => ({ ok: true }),
      privateTerms: PRIVATE_TERMS,
      operations: {
        single: {
          name: 'internal.profile.lookup',
          buildArguments: () => ({ code: '510300' }),
          normalize: (_raw, { request }) => {
            const result = providerPayload(request.task, request.funds)
            result.subjects[0] = { ...result.subjects[0], fund_type: 'active_fund' }
            return result
          }
        }
      }
    })

    await expect(provider.research({ task: 'single', funds: ['510300'] }))
      .rejects.toMatchObject({
        code: 'FUND_TYPE_UNSUPPORTED',
        message: '暂不支持该基金类型。'
      })
  })

  it('maps external cancellation to a fixed public message', async () => {
    const controller = new AbortController()
    const provider = createPrivateToolProvider({
      privateTerms: PRIVATE_TERMS,
      invoke: async () => new Promise(() => {}),
      operations: {
        single: {
          name: 'internal.profile.lookup',
          buildArguments: () => ({ code: '510300' }),
          normalize: () => ({})
        }
      }
    })
    const pending = provider.research(
      { task: 'single', funds: ['510300'] },
      { signal: controller.signal }
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({
      code: 'FUND_RESEARCH_CANCELLED',
      message: '基金研究已取消。'
    })
  })

  it('maps a private operation timeout to unavailable rather than cancelled', async () => {
    const provider = createPrivateToolProvider({
      timeoutMs: 10,
      privateTerms: PRIVATE_TERMS,
      invoke: async () => new Promise(() => {}),
      operations: {
        single: {
          name: 'internal.profile.lookup',
          buildArguments: () => ({ code: '510300' }),
          normalize: () => ({})
        }
      }
    })

    await expect(provider.research({ task: 'single', funds: ['510300'] }))
      .rejects.toMatchObject({
        code: 'FUND_DATA_UNAVAILABLE',
        message: '基金数据暂时不可用，请稍后重试。'
      })
  })
})

describe('private gateway provider', () => {
  it('sends only the high-level minimum request and validates the response', async () => {
    let captured
    const provider = createPrivateGatewayProvider({
      endpoint: 'https://fund-gateway.example',
      token: 'private-token',
      privateTerms: PRIVATE_TERMS,
      clock: () => new Date(NOW),
      fetch: async (url, init) => {
        captured = { url, init }
        return new Response(JSON.stringify(providerPayload('recent_changes', ['510300'])), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
    })

    const result = await provider.research({
      task: 'recent_changes',
      funds: ['510300'],
      lookback_days: 90
    })
    expect(captured.url).toBe('https://fund-gateway.example/v1/fund-research/query')
    expect(JSON.parse(captured.init.body)).toEqual({
      task: 'recent_changes',
      funds: ['510300'],
      lookback_days: 90
    })
    expect(captured.init.headers.authorization).toBe('Bearer private-token')
    expect(JSON.stringify(result)).not.toContain('private-token')
    expect(validateJsonSchemaValue(FUND_RESEARCH_OUTPUT_SCHEMA, result)).toEqual([])
  })

  it('fails closed when the gateway is not configured', async () => {
    const provider = createProviderFromEnvironment({ env: {} })
    await expect(provider.research({ task: 'single', funds: ['510300'] }))
      .rejects.toMatchObject({ code: 'FUND_DATA_UNAVAILABLE' })
  })

  it('stops reading a chunked gateway response at the byte limit', async () => {
    let cancelled = false
    const provider = createPrivateGatewayProvider({
      endpoint: 'https://fund-gateway.example',
      token: 'private-token',
      privateTerms: PRIVATE_TERMS,
      fetch: async () => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(600 * 1024))
          controller.enqueue(new Uint8Array(600 * 1024))
        },
        cancel() {
          cancelled = true
        }
      }))
    })

    await expect(provider.research({ task: 'single', funds: ['510300'] }))
      .rejects.toMatchObject({ code: 'FUND_DATA_UNAVAILABLE' })
    expect(cancelled).toBe(true)
  })
})
