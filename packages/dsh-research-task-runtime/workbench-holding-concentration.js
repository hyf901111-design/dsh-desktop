import {addDecimal, decimalNumber, decimalParts, subtractDecimal} from './workbench-decimal.js'
import {completePastedDisclosure, pastedWorkbenchInput} from './workbench-pasted-tables.js'
import {singleHoldingWeightRanking} from './holding-weight-ranking.js'

const quantities = ['零','一','二','三','四','五','六','七','八','九','十']

// This shortcut applies only when all requested ranked rows, their scope and a single
// disclosed weight are available. More involved comparisons retain the full planner.
export function holdingConcentrationInput(request, input) {
  if (typeof request !== 'string') return
  const pasted = input ?? pastedWorkbenchInput(request)
  const narrative = pasted.context.split(/(?:^|\n)\s*(?:来源|出处)/u)[0]
  if (!singleHoldingWeightRanking(narrative) || pasted.blocks.length !== 1 ||
      !/(?:第一名|首位|首名|第一大).{0,12}(?:第二名|次位|次名|第二大).{0,12}百分点/u.test(narrative) ||
      /实时|刷新|网页|联动|跨期|多个基金|各基金|分别|导出|下载|页签|走势图|历史对比|分行业|归因|预警|热力|饼图|折线|柱状|环形|样式|指定布局|只做一张|不要|无需|不需要|自定义/u.test(narrative) ||
      !completePastedDisclosure(request, pasted)) return
  const [headers, ...rows] = pasted.blocks[0]
  const count = narrative.match(/前\s*([一二三四五六七八九十]|\d{1,2})\s*(?:项|家|名|只|大)?\s*(?:合计|总计|合共)/u)?.[1]
  if (!count || rows.length !== (quantities.includes(count) ? quantities.indexOf(count) : Number(count)) ||
      rows.length < 2 || new Set(headers).size !== headers.length) return
  const weightColumns = headers.filter(label => /^(?:占(?:基金)?(?:资产)?净值(?:比例|比重)|净值占比|持仓权重)\s*[（(][%％][）)]$/u.test(label))
  const names = headers.filter(label => /^(?:股票|证券|公司)名称$/u.test(label))
  const codes = headers.filter(label => /^(?:股票|证券)代码$/u.test(label))
  if (weightColumns.length !== 1 || names.length !== 1 || codes.length !== 1) return
  const weightIndex = headers.indexOf(weightColumns[0])
  const nameIndex = headers.indexOf(names[0])
  const codeIndex = headers.indexOf(codes[0])
  if (rows.some(row => row.length !== headers.length || !/^\d{1,3}(?:\.\d{1,8})?$/u.test(row[weightIndex])) ||
      new Set(rows.map(row => row[codeIndex])).size !== rows.length ||
      new Set(rows.map(row => row[nameIndex])).size !== rows.length) return
  const weights = rows.map(row => Number(row[weightIndex]))
  if (weights.some((value, i) => value > 100 || (i > 0 && value > weights[i - 1]))) return
  const sum = decimalNumber(weights.reduce((total, value) => addDecimal(total, decimalParts(value)), null))
  const gap = subtractDecimal(weights[0], weights[1])
  const fields = headers.map((label, index) => {
    const unit = /[（(]([^（）()]+)[）)]$/u.exec(label)?.[1]
    return {key:'column'+(index+1),label,...(unit ? {unit:unit.replace('％','%')} : {})}
  })
  return {fields, code:fields[codeIndex].key, name:fields[nameIndex].key, weight:fields[weightIndex].key,
    sum, gap, first:rows[0][nameIndex], second:rows[1][nameIndex], count}
}

export function expandHoldingConcentration(plan, input) {
  if (!input || plan.sharedDatasets || plan.tabs || plan.links || plan.panels.length !== 3 ||
    !['kpi','chart','view'].every(type => plan.panels.some(panel => panel?.type === type)) ||
    !plan.panels.every(panel => Object.keys(panel).every(key => ['type','title','size','prompt'].includes(key)))) return plan
  const dataset = 'holdings'
  const fields = input.fields.map(field => field.key)
  return {...plan, dataMode:'source',sharedDatasets:[{id:dataset,label:'原始持仓披露',fields:input.fields,
    pastedTable:{block:1,header:true,identity:input.code,numericFields:[input.weight]}}],
    panels:plan.panels.map(panel => {
      if (panel.type === 'chart') return {...panel,view:{dataset,variant:'horizontal',unit:'%',sections:[{kind:'records',label:input.name,fields:[input.weight]}]}}
      if (panel.type === 'view') return {...panel,view:{dataset,filters:[input.name],sections:[{kind:'records',fields}]}}
      return {...panel,prompt:panel.prompt ?? panel.title,artifact:{version:1,type:'kpi',title:panel.title,
        items:[{label:'前'+input.count+'合计净值占比',value:input.sum,unit:'%'}]}}
    })}
}

export function bindHoldingConcentrationMetrics(panels, plan, input, datasets) {
  if (!input) return panels
  const base = plan.sharedDatasets?.filter(dataset => dataset?.pastedTable?.block === 1)
  if (base?.length !== 1) return panels
  const source = datasets?.find(dataset => dataset.id === base[0].id)
  if (!source?.sourceUrl) return panels
  const gapLabel = '第一名与第二名占比差'
  return panels.map(panel => {
    const card = panel.artifact
    if (card?.type !== 'kpi' || card.items.length !== 1) return panel
    const [total] = card.items
    if (total.value !== input.sum || !/合计|总计|总和/u.test(total.label) ||
        !/占比|权重|净值/u.test(total.label) || (total.unit && total.unit !== '%')) return panel
    return {...panel,artifact:{...card,asOf:source.asOf,note:card.note ?? source.note,
      sources:[{name:source.note.split('\n')[0],url:source.sourceUrl}],items:[
        {...total,unit:'%'},{label:gapLabel,value:input.gap,unit:'个百分点',detail:input.first+' 与 '+input.second}
      ]}}
  })
}
