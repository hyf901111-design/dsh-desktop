import { decimal } from './numbers.mjs'
import { idValid, isObject, diagnostic, periodKey } from './schema.mjs'

export function runCalculations(packet, facts, diagnostics) {
  const values = new Map(facts.filter(f => f.status === 'verified').map(f => [f.id, {
    ...f, value: f.normalizedValue, unit: f.normalizedUnit, sourceIds: [f.sourceId],
  }]))
  const ids = new Set(facts.map(f => f.id))
  const calculations = []
  for (const [index, calc] of (packet.calculations || []).entries()) {
    const path = `calculations[${index}]`
    const result = { ...calc, status: 'blocked', value: null, unit: null }
    try {
      if (!isObject(calc) || !idValid(calc.id) || ids.has(calc.id) ||
          !['yoy', 'ratio', 'difference', 'periodDifference', 'sum', 'grossProfit', 'grossMargin'].includes(calc.op) ||
          !Array.isArray(calc.inputs) || calc.inputs.length > 32 ||
          (calc.op === 'sum' ? calc.inputs.length < 2 : calc.inputs.length !== 2)) {
        throw new Error('CALC_SCHEMA:计算需唯一id、支持的op及明确inputs（sum至少2项，其余恰好2项）')
      }
      ids.add(calc.id)
      const inputs = calc.inputs.map(id => values.get(id))
      if (inputs.some(f => !f)) {
        throw new Error('CALC_INPUT:输入必须是已核验事实或在此前定义的成功计算；禁止缺失值默认为0')
      }
      const [a, b] = inputs
      if (inputs.some(f => f.scope !== a.scope)) throw new Error('CALC_SCOPE:不能混用不同报表范围')
      if (inputs.some(f => f.unit !== a.unit)) throw new Error('CALC_UNIT:输入单位量纲必须相同；金额已先换算到元')
      let resultPeriod = a.period
      if (calc.op === 'periodDifference') {
        // Derived op labels (e.g. two unrelated differences) are not a metric identity.
        if (inputs.some(f => f.status !== 'verified')) throw new Error('CALC_INPUT:跨期差额只接受已核验原始金额事实，不能用派生运算名冒充同指标')
        const first = periodKey(a.period), second = periodKey(b.period)
        if (a.unit !== 'CNY') throw new Error('CALC_UNIT:跨期差额仅支持人民币金额')
        const fiscal = /^(?:FY20\d{2}|20\d{2}(?:H[12]|Q[1-4]))$/
        if (!first || !second || !fiscal.test(first) || !fiscal.test(second) ||
            first.replace(/20\d{2}/, '') !== second.replace(/20\d{2}/, '') ||
            Math.abs(Number(first.match(/20\d{2}/)[0]) - Number(second.match(/20\d{2}/)[0])) !== 1 || a.metric !== b.metric) {
          throw new Error('CALC_PERIOD:跨期差额必须是同指标、同口径、相邻年度的相同期间')
        }
        resultPeriod = Number(first.match(/20\d{2}/)[0]) > Number(second.match(/20\d{2}/)[0]) ? a.period : b.period
      } else if (calc.op === 'yoy') {
        const current = periodKey(a.period)
        const previous = periodKey(b.period)
        const shifted = current.replace(/20\d{2}/, year => String(Number(year) - 1))
        if (a.metric !== b.metric || previous !== shifted) {
          throw new Error('CALC_PERIOD:同比必须是同指标、同口径、相隔一年的相同期间')
        }
        if (decimal(b.exactValue || b.value).cmp('0') <= 0) {
          throw new Error('YOY_BASE:同比基期必须为正；负值和0不输出误导性同比')
        }
      } else if (inputs.some(f => periodKey(f.period) !== periodKey(a.period))) {
        throw new Error('CALC_PERIOD:计算输入的财务期间必须一致')
      }
      if (['grossProfit', 'grossMargin'].includes(calc.op) &&
          (a.metric !== 'revenue' || b.metric !== 'costOfRevenue' || a.unit !== 'CNY')) {
        throw new Error('CALC_METRIC:毛利派生必须按营业收入、营业成本顺序引用人民币金额')
      }
      const x = decimal(a.exactValue || a.value)
      const y = decimal(b.exactValue || b.value)
      let value, formula
      if (calc.op === 'sum') {
        value = inputs.reduce((sum, f) => sum.add(f.exactValue || f.value), decimal('0'))
        formula = calc.inputs.join(' + ')
      } else if (['difference', 'periodDifference', 'grossProfit'].includes(calc.op)) {
        value = x.sub(y)
        formula = `${a.id} - ${b.id}`
      } else if (calc.op === 'grossMargin') {
        value = x.sub(y).div(x)
        formula = `(${a.id} - ${b.id}) / ${a.id}`
      } else {
        value = x.div(y)
        formula = `${a.id} / ${b.id}`
        if (calc.op === 'yoy') { value = value.sub('1'); formula += ' - 1' }
      }
      const unit = ['ratio', 'yoy', 'grossMargin'].includes(calc.op) ? 'ratio' : a.unit
      Object.assign(result, {
        status: 'calculated', value: value.toString(24), unit, formula, metric: calc.op,
        scope: a.scope, period: resultPeriod, sourceIds: [...new Set(inputs.flatMap(f => f.sourceIds))],
      })
      // Chained calculations consume the exact rational, never the rounded display string.
      values.set(calc.id, { ...result, exactValue: value })
    } catch (error) {
      const [code, ...message] = error.message.split(':')
      diagnostics.push(diagnostic(/^[A-Z_]+$/.test(code) ? code : 'CALC_ERROR', path,
        message.join(':') || error.message))
    }
    calculations.push(result)
  }
  return calculations
}
