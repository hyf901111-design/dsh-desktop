import { completePastedDisclosure, pastedWorkbenchInput } from './workbench-pasted-tables.js'
import { workbenchReadingPurpose } from './workbench-reading-purpose.js'

const rowCards = /(?:逐笔|逐行|逐只|单独|独立|分别|单列|单开|另行|拆分|拆成|各自|各做|每只|每笔|每行|每项).{0,12}(?:成卡|一卡|一张|一页|一块|卡片|组件|面板|建卡|建表|作图|做图|张图|个图|张表)|(?:一股|一笔|一行|一只|一项)(?:一卡|一表|一页)/u
const multipleOutputs = /(?:另(?:设|做|建|加)|再(?:做|建|增加))\s*(?:一张|一个|一幅|一个单独的)?\s*(?:图|表|卡|面板|组件)|[两二三四五六七八九十多2-9]\s*(?:张|块|个|套)\s*(?:卡|图|表|面板|组件)|(?:只做|总共|一共|保留|请做|共做)\s*[两二三四五六七八九十多2-9]+\s*张/u
const additionalAnalysis = /图表|条形图|柱状图|折线|趋势|排名|排行|排序|对比|比较|合计|汇总|总计|集中度|最大|最小|异常|例外|风险|联动|分组|分页展示|不同(?:表|页|视图)|标签页|页签|实时|刷新|网页|导出|下载|图形|可视化|打开原件|核对原件|联网查|\b(?:charts?|compar\w*|ranking|separate|each card|export)\b/iu

// Recognize one complete portfolio disclosure when the requested action is
// reconciling each original row in order and retrieving it by an identifier.
export function disclosureLedgerInput(request, input) {
  if (typeof request !== 'string' || !/逐[笔行项条]|核对|对账|稽核|勾稽/u.test(request)) return
  const pasted = input ?? pastedWorkbenchInput(request)
  if (pasted.blocks.length !== 1) return
  const narrative = pasted.context.split(/\r?\n/u)
    .filter(line => !/^\s*(?:(?:数据|资料)?(?:来源|出处)|https?:\/\/)/u.test(line)).join('\n')
  if (workbenchReadingPurpose(narrative) !== 'reconcile' ||
      !/原序|原始顺序|原表顺序|披露顺序|按序号/u.test(narrative) ||
      !/定位|检索|搜索|查找|速查|筛选/u.test(narrative) ||
      rowCards.test(narrative) || multipleOutputs.test(narrative) || additionalAnalysis.test(narrative) || !completePastedDisclosure(request, pasted)) return
  const [headers, ...rows] = pasted.blocks[0]
  if (rows.length < 2 || rows.length > 30 || headers.length > 12 || new Set(headers).size !== headers.length ||
      rows.some(row => row.length !== headers.length)) return
  function column(pattern) {
    const matches = headers.flatMap((header, index) => pattern.test(header) ? [index] : [])
    return matches.length === 1 ? matches[0] : -1
  }
  const ordinal = column(/^(?:序号|序次|编号)$/u)
  const code = column(/^(?:股票|证券)代码$/u)
  const name = column(/^(?:股票|证券)名称$/u)
  const shares = column(/^(?:数量|股数|持股数量)(?:[（(]股[）)])?$/u)
  const value = column(/^公允价值(?:[（(](?:人民币)?元[）)])?$/u)
  const weight = column(/^(?:占(?:基金)?(?:资产)?净值(?:比例|比重)|净值占比|持仓权重)(?:[（(][%％][）)])?$/u)
  if ([ordinal, code, name, shares, value, weight].includes(-1) || new Set(rows.map(row => row[code])).size !== rows.length ||
      rows.some((row, i) => row[ordinal] !== String(i + 1) || !/^\d{6}$/u.test(row[code]) || !row[name] ||
        !/^\d+$/u.test(row[shares]) || !Number.isSafeInteger(Number(row[shares])) ||
        !/^\d+(?:\.\d+)?$/u.test(row[value]) || !/^\d+(?:\.\d+)?$/u.test(row[weight]))) return
  const fields = headers.map((label, index) => {
    const unit = /[（(]([^（）()]+)[）)]$/u.exec(label)?.[1]
    return {key:'column' + (index + 1), label, ...(unit && {unit:unit.replace('％', '%')})}
  })
  return {fields, identity:fields[ordinal].key, code:fields[code].key, name:fields[name].key,
    numericFields:[fields[shares].key, fields[weight].key], count:rows.length, firstRow:rows[0]}
}

function onlyKeys(object, keys) {
  return object && Object.keys(object).every(key => keys.includes(key))
}

export function expandDisclosureLedger(plan, input) {
  if (!input || plan.tabs || plan.links) return plan
  const [primary, ...others] = plan.panels
  if (!plan.sharedDatasets && !others.length && primary?.type === 'view' &&
      onlyKeys(primary, ['type','title','size','layout','prompt'])) {
    const dataset = 'holdings'
    return {...plan, dataMode:'source',
      sharedDatasets:[{id:dataset, label:'原始持仓披露', fields:input.fields, pastedTable:{
        block:1, header:true, identity:input.identity, numericFields:input.numericFields}}],
      panels:[{...primary, layout:'wide', view:{dataset, filters:[input.code, input.name],
        sections:[{kind:'records', fields:input.fields.map(field => field.key)}]}}]}
  }
  // A previously offered full schema can include a complete ledger followed
  // by a copy for every ordinal. Consolidate only those exact row projections.
  if (plan.sharedDatasets?.length !== 1 || others.length !== input.count) return plan
  const [dataset] = plan.sharedDatasets
  const binding = dataset?.pastedTable
  if (binding?.block !== 1 || binding.header !== true || binding.derive || !binding.identity) return plan
  const fields = dataset.fields ?? binding.fields
  if (!Array.isArray(fields) || fields.length !== input.fields.length) return plan
  const ordinalIndex = input.fields.findIndex(field => field.key === input.identity)
  if (fields[ordinalIndex]?.key !== binding.identity) return plan
  const code = fields[input.fields.findIndex(field => field.key === input.code)]?.key
  const name = fields[input.fields.findIndex(field => field.key === input.name)]?.key
  const matchesTable = panel => {
    if (panel?.type !== 'view' || !onlyKeys(panel,['type','title','prompt','note','layout','size','view']) ||
        !onlyKeys(panel.view,['dataset','filters','sections','where']) || panel.view.dataset !== dataset.id ||
        panel.view.sections?.length !== 1) return false
    const [section] = panel.view.sections
    return onlyKeys(section,['kind','title','fields']) && section.kind === 'records' &&
      section.fields?.length === fields.length && fields.every((field,i) => field?.key === section.fields[i])
  }
  if (!matchesTable(primary) || primary.view.where || !Array.isArray(primary.view.filters) ||
      ![code,name].every(field => primary.view.filters.includes(field))) return plan
  const ordinals = new Set()
  for (const panel of others) {
    if (!matchesTable(panel) || panel.view.where?.length !== 1 || panel.view.filters) return plan
    const [where] = panel.view.where
    if (!onlyKeys(where,['field','op','values']) || where.field !== binding.identity ||
        where.op !== 'in' || where.values?.length !== 1) return plan
    ordinals.add(String(where.values[0]))
  }
  if (!others.every((_, i) => ordinals.has(String(i + 1)))) return plan
  return {...plan, panels:[{...primary, layout:'wide'}]}
}
