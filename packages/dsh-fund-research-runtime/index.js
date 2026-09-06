import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  CLAIM_STATUSES,
  FUND_RESEARCH_TASKS,
  FundResearchError,
  isNormalizedResearchResult,
  toPublicFundResearchError,
  validateResearchRequest
} from './contract.js'
import { createProviderFromEnvironment } from './provider.js'

export const name = 'sherlock-fund-research-runtime'
export const inject = ['tools']
export const source = 'bundled-sherlock'

const string = { type: 'string' }
const subjectSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fund_code: { ...string, required: true },
    fund_name: { ...string, required: true },
    fund_type: { type: 'string', enum: ['etf', 'index_fund', 'etf_feeder'], required: true },
    currency: { type: 'string', const: 'CNY', required: true }
  }
}
const dimensionsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries([
    'security_code',
    'security_name',
    'asset_class',
    'industry',
    'region',
    'benchmark_code',
    'comparison_group',
    'direction'
  ].map((key) => [key, string]).concat([['rank', { type: 'number' }]]))
}
const evidenceSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { ...string, required: true },
    subject_code: { ...string, required: true },
    field: { ...string, required: true },
    label: { ...string, required: true },
    value: { oneOf: [string, { type: 'number' }, { type: 'boolean' }], required: true },
    unit: string,
    as_of: { ...string, required: true },
    period_start: string,
    period_end: string,
    dimensions: dimensionsSchema
  }
}
const claimSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { ...string, required: true },
    field: { ...string, required: true },
    text: { ...string, required: true },
    status: { type: 'string', enum: CLAIM_STATUSES, required: true },
    evidence_ids: { type: 'array', items: string, required: true }
  }
}
const limitationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    code: { type: 'string', enum: ['missing_data', 'stale_data', 'incomparable_dates', 'insufficient_history', 'truncated', 'unsupported_metric'], required: true },
    message: { ...string, required: true }
  }
}

export const FUND_RESEARCH_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schema_version: { type: 'string', const: '1', required: true },
    task: { type: 'string', enum: FUND_RESEARCH_TASKS, required: true },
    status: { type: 'string', enum: ['complete', 'partial'], required: true },
    as_of: { ...string, required: true },
    received_at: { ...string, required: true },
    frequency: { type: 'string', enum: ['realtime', 'daily', 'monthly', 'quarterly', 'annual', 'event', 'mixed'], required: true },
    source_type: { type: 'string', enum: ['official_disclosure', 'exchange', 'regulatory', 'calculated', 'aggregate', 'mixed'], required: true },
    raw_hash: { ...string, required: true },
    quality_state: { type: 'string', enum: ['verified', 'partial', 'stale'], required: true },
    subjects: { type: 'array', items: subjectSchema, required: true },
    evidence: { type: 'array', items: evidenceSchema, required: true },
    claims: { type: 'array', items: claimSchema, required: true },
    limitations: { type: 'array', items: limitationSchema, required: true }
  }
}

function publicFailure(error, signal) {
  throw toPublicFundResearchError(error, signal)
}

export function createFundResearchTool(provider) {
  if (!provider || typeof provider.research !== 'function') {
    throw new TypeError('A fund research provider is required.')
  }
  return defineTool({
    name: 'fund_research',
    description: '研究境内 ETF、场外指数基金和 ETF 联接基金。支持单基金概览、同日横向比较、持仓与风格分析、近期变化核验。只返回带日期和质量状态的事实证据，不提供买卖建议、适当性判断、交易操作或收益预测。',
    parameters: {
      task: {
        type: 'string',
        enum: FUND_RESEARCH_TASKS,
        required: true,
        description: '研究任务：single 单基金，compare 同日对比，holdings_style 持仓与风格，recent_changes 近期变化。'
      },
      funds: {
        type: 'array',
        items: { type: 'string' },
        required: true,
        description: '基金代码。对比任务传 2 至 6 只，其他任务只传 1 只。'
      },
      lookback_days: {
        type: 'integer',
        description: '仅近期变化任务可用，回看 7 至 365 天。'
      }
    },
    output: {
      schema: FUND_RESEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]
    },
    execute: async (args, exec = {}) => {
      try {
        const request = validateResearchRequest(args)
        const result = await provider.research(request, { signal: exec.signal })
        if (!isNormalizedResearchResult(result)) throw new Error('Untrusted fund research result.')
        return result
      } catch (error) {
        publicFailure(error, exec.signal)
      }
    }
  })
}

export function registerFundResearchRuntime(ctx, {
  provider = createProviderFromEnvironment()
} = {}) {
  const dispose = ctx.tools.register(createFundResearchTool(provider))
  let disposed = false
  return {
    dispose() {
      if (disposed) return
      disposed = true
      dispose()
    }
  }
}

export function apply(ctx) {
  ctx.effect(() => {
    const runtime = registerFundResearchRuntime(ctx)
    return () => runtime.dispose()
  })
}

export { FundResearchError }
export {
  createPrivateGatewayProvider,
  createPrivateToolProvider,
  createProviderFromEnvironment,
  createUnavailableProvider
} from './provider.js'
