import { defineTool } from '@deepseek-ai/dsh-tools'
import { ASSETS, INTENTS, validateFinancialQuery, validateFinancialResult } from './financial-contract.js'
import { serviceError, toPublicFundResearchError } from './contract.js'
import { queryFinancialHistory } from './financial-history.js'

export function createFinancialTool(provider) {
  const string = { type: 'string' }
  return defineTool({
    name: 'financial_query',
    description: '查询股票、指数、ETF 行情及公募基金资料、净值和研究数据，自动选择合适的数据。名称不明确时先 resolve，使用返回的市场和代码；交易代码必须带 .SH/.SZ/.BJ。ETF 交易价格用 quote，基金净值用 nav，二者不可混用。history 是行情日/周/月线，目前不提供分钟线。单基金、同日对比、持仓风格、近期变化用 research；更多基金研究先 catalog（可指定 capability 获取参数），再 analysis。混合问题按意图分别查询。无需用户指定数据服务或配置密钥。回答必须注明各项数据日期、单位、口径和限制；接收时间不是数据时间；未知时效、缺失、过期或未核验结果不能称为实时、无变化或完整覆盖。不得用单位净值代替货币基金收益指标，不得将复权净值称为累计净值。',
    parameters: {
      intent: { ...string, enum: INTENTS, required: true },
      asset: { ...string, enum: ASSETS, description: 'resolve/quote/history/nav/profile 必填。fund 表示场外基金，etf 表示场内 ETF。research 为基金研究，不需要传 asset，也兼容 fund。' },
      symbols: { type: 'array', items: string, description: '最多六个明确代码；history/nav/profile 限一个；research 使用六位基金代码。' },
      query: { ...string, description: 'resolve 的名称或代码。多个候选时按交易所及份额类别确认，不猜测代码。' },
      start: { ...string, description: 'history 起始日期 YYYY-MM-DD，最多一年。' },
      end: { ...string, description: 'history 结束日期 YYYY-MM-DD。' },
      interval: { ...string, enum: ['1m','5m','15m','30m','60m','1d','1w','1mo'] },
      adjustment: { ...string, enum: ['none','forward','backward'] },
      nav_basis: { ...string, enum: ['unit','accumulated','adjusted','income_per_10000','yield_7d'] },
      as_of: { ...string, description: 'nav 所需净值日期 YYYY-MM-DD；不满足时明确标记，不能当作最新。' },
      task: { ...string, enum: ['single','compare','holdings_style','recent_changes'], description: 'research 的任务。compare 可返回近一年收益率和最新单位净值，只需六位 symbols 与 task，不要传 lookback_days。' },
      lookback_days: { type: 'integer', description: '仅用于 research 的 recent_changes 任务，范围 7—365；compare 不需要此参数。' },
      capability: { ...string, description: 'catalog 中的业务能力标识。' },
      schema_hash: { ...string, description: 'analysis 使用当前 catalog 返回的参数版本。' },
      arguments_json: { ...string, description: 'analysis 按该能力参数定义填写的 JSON 对象。' }
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async (args, exec = {}) => {
      try {
        if (Object.hasOwn(args, 'operation')) throw serviceError('FINANCIAL_ARGUMENTS_INVALID')
        const input = { ...args, operation: 'financial' }
        // resolve is the discovery operation: an omitted asset must not turn
        // an otherwise usable name into a repeated validation failure.
        if (input.intent === 'resolve' && input.asset === undefined && typeof input.query === 'string') {
          input.asset = /ETF|交易型开放式/iu.test(input.query) ? 'etf'
            : /基金|净值/iu.test(input.query) ? 'fund'
              : /指数|全指|沪深|中证|上证|深证|^H\d{5}$/iu.test(input.query) ? 'index' : 'stock'
        }
        // Fund research already fixes the asset class. Models may repeat this
        // harmless discriminator; keep the hosted wire contract canonical.
        if (input.intent === 'research' && input.asset === 'fund') delete input.asset
        const query = validateFinancialQuery(input)
        if (query.intent === 'history') return await queryFinancialHistory(provider, query, { signal: exec.signal })
        return validateFinancialResult(await provider.financial(query, { signal: exec.signal }), query)
      } catch (error) {
        const failure = toPublicFundResearchError(error, exec.signal)
        throw ['FUND_DATA_UNAVAILABLE','FUND_DATA_INVALID'].includes(failure.code) ? serviceError('FINANCIAL_UNAVAILABLE') : failure
      }
    }
  })
}
