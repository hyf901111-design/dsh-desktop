import { decimal } from './numbers.mjs'
import { isObject, isText, isDate, isTimestamp, diagnostic } from './schema.mjs'

const BRIDGE_METRICS = ['cash', 'debt', 'nonOperatingAssets', 'minorityInterest', 'shares']
const FORMULA = 'EV = Σ FCFF_t/(1+WACC)^t + FCFF_n×(1+g)/(WACC−g)/(1+WACC)^n; ' +
  'Equity = EV+cash−debt+nonOperatingAssets−minorityInterest; perShare = Equity/shares'
const addFailure = (error, diagnostics, path, fallback) => {
  const [code, ...message] = error.message.split(':')
  diagnostics.push(diagnostic(/^[A-Z_]+$/.test(code) ? code : fallback, path, message.join(':') || error.message))
}

// Hand-entered FCFF only: full future year-end periods, no stub period or automated forecasts.
export function runDCF(packet, facts, diagnostics) {
  if (packet.dcf === undefined) return null
  const model = packet.dcf
  const result = {
    status: 'blocked', scenarios: [], rating: null, forecastTiming: 'year-end-fixed-periods',
    timingNote: '手工FCFF假设按完整未来期末折现；未计估值日至财年末的stub period，不构成交易日目标价。',
  }
  try {
    if (!isObject(model) || !isText(model.scope) || !isDate(model.asOf) || model.asOf !== packet.asOf ||
        model.currency !== packet.company.currency || model.forecastTiming !== 'year-end-fixed-periods' ||
        !isObject(model.bridge) || !Array.isArray(model.scenarios) || model.scenarios.length !== 3 ||
        new Set(model.scenarios.map(s => s?.id)).size !== 3 ||
        !model.scenarios.every(s => ['bear', 'base', 'bull'].includes(s?.id))) {
      throw new Error('DCF_SCHEMA:DCF需与报告同asOf/currency、scope、显式bridge、bear/base/bull三情景及forecastTiming:year-end-fixed-periods')
    }
    const inputs = new Map(facts.filter(f => f.status === 'verified').map(f => [f.id, f]))
    const bridge = {}
    for (const metric of BRIDGE_METRICS) {
      const fact = inputs.get(model.bridge[metric])
      const unit = metric === 'shares' ? 'shares' : 'CNY'
      if (!fact || fact.metric !== metric || fact.normalizedUnit !== unit || fact.scope !== model.scope ||
          fact.period !== packet.financialAsOf || decimal(fact.normalizedValue).cmp('0') < 0 ||
          (metric === 'shares' && decimal(fact.normalizedValue).cmp('0') === 0)) {
        throw new Error(`DCF_BRIDGE:${metric}必须显式引用已核验、同scope/financialAsOf、正确单位及非负事实；shares须大于0`)
      }
      bridge[metric] = { factId: fact.id, value: fact.normalizedValue, unit }
    }
    Object.assign(result, { bridge, asOf: model.asOf, financialAsOf: packet.financialAsOf,
      currency: model.currency, scope: model.scope })
    let price = inputs.get(model.currentPrice)
    if (!price || price.metric !== 'currentPrice' || price.normalizedUnit !== 'CNY_per_share' ||
        price.scope !== model.scope || !isTimestamp(price.asOf) || price.asOf.slice(0, 10) !== packet.asOf ||
        price.period !== packet.asOf || decimal(price.normalizedValue).cmp('0') <= 0) {
      price = null
      diagnostics.push(diagnostic('PRICE_UNAVAILABLE', 'dcf.currentPrice',
        '未提供与报告同日期、已核对原文且为正的现价；现价回报保持空值，所有情况均不生成买卖评级', 'warning'))
    }
    result.currentPrice = price ? { factId: price.id, value: price.normalizedValue, asOf: price.asOf } : null
    for (const scenario of model.scenarios) {
      try {
        if (!isText(scenario.assumption) || !Array.isArray(scenario.fcff) || !scenario.fcff.length ||
            scenario.fcff.length > 10) {
          throw new Error('DCF_FCFF:每情景需assumption说明及1至10个手工FCFF假设（金额单位为元）')
        }
        const fcff = scenario.fcff.map(decimal)
        const wacc = decimal(scenario.wacc)
        const g = decimal(scenario.terminalGrowth)
        if (fcff.some(value => value.cmp('0') < 0)) {
          throw new Error('DCF_FCFF:负FCFF不适用于v1有限模型，拒绝输出估值或现价回报')
        }
        if (wacc.cmp('0') <= 0 || wacc.cmp('1') >= 0 || g.cmp('-1') <= 0 || wacc.cmp(g) <= 0) {
          throw new Error('DCF_DISCOUNT:必须满足0<WACC<1、-1<terminalGrowth<WACC；输入为小数比例')
        }
        const discount = decimal('1').add(wacc)
        const presentFCFF = fcff.reduce((total, cash, index) =>
          total.add(cash.div(discount.pow(index + 1))), decimal('0'))
        const terminalValue = fcff.at(-1).mul(decimal('1').add(g)).div(wacc.sub(g))
        const presentTerminal = terminalValue.div(discount.pow(fcff.length))
        const enterprise = presentFCFF.add(presentTerminal)
        const equity = enterprise.add(bridge.cash.value).sub(bridge.debt.value)
          .add(bridge.nonOperatingAssets.value).sub(bridge.minorityInterest.value)
        const perShare = equity.div(bridge.shares.value)
        const priceReturn = price && perShare.cmp('0') > 0
          ? perShare.div(price.normalizedValue).sub('1').toString() : null
        result.scenarios.push({
          id: scenario.id, status: 'calculated', assumption: scenario.assumption, fcff: scenario.fcff,
          wacc: scenario.wacc, terminalGrowth: scenario.terminalGrowth,
          presentFCFF: presentFCFF.toString(), terminalValue: terminalValue.toString(),
          presentTerminalValue: presentTerminal.toString(), enterpriseValue: enterprise.toString(),
          equityValue: equity.toString(), perShareValue: perShare.toString(), priceReturn,
          unit: 'CNY_per_share', formula: FORMULA,
        })
        if (perShare.cmp('0') <= 0) {
          diagnostics.push(diagnostic('DCF_NONPOSITIVE_EQUITY', `dcf.scenarios.${scenario.id}`,
            '股权价值非正，现价回报保持空值', 'warning'))
        }
      } catch (error) {
        addFailure(error, diagnostics, `dcf.scenarios.${scenario?.id || '?'}`, 'DCF_FCFF')
        result.scenarios.push({ id: scenario?.id, status: 'blocked', priceReturn: null })
      }
    }
    if (result.scenarios.every(s => s.status === 'calculated')) result.status = 'calculated'
  } catch (error) {
    addFailure(error, diagnostics, 'dcf', 'DCF_SCHEMA')
  }
  return result
}
