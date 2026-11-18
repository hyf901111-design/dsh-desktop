import {chartFieldUnit} from './chart-template-contract.js'
import {datasetScheduleTime} from './dataset-view-contract.js'

const trend = /趋势|走势|折线|时序|时间序列|逐(?:日|月|季|年)|历年|\b(?:trends?|time series|over time|historical)\b/iu
const comparison = /比较|对比|横向对照|排行|排名|横向条形|\b(?:compar(?:e|ing|ison)s?|rank(?:ing|ed)?|leaderboard)\b/iu
const tableOnly = /(?<!不)(?:只|仅)(?:要|需|用|看|做|保留|展示|显示|提供|输出|呈现|使用|以)*\s*(?:(?:一[个张份]|原始|完整|原生|明细|数据|可排序的)\s*)*表(?:格|单|(?=$|[，,。；;、！!？?\s]|即可|就好|形式))|(?:不要|不需(?:要)?|不画|不做|无需|不用|禁止)(?:再|用|画|做|生成|绘制|使用|展示|显示|任何)*\s*(?:图表|图形|可视化|图)|\b(?:tables? only|only (?:a |the )?tables?|no charts?|without (?:a |any )?charts?)\b/iu
const identifier = /编号|序号|代码|名次|排名|\b(?:id|code|symbol|ticker|rank|index|order|position|no)$/iu
const periodField = /日期|交易日|时[间点]|季度|月份|年度|年份|报告期|会计期|周期|^期间$|\b(?:date|time|timestamp|day|month|quarter|year|period)\b/iu
const categoryField = /(?:名称|简称|品种|标的|类别|分类|地区|机构|板块|行业|部门|产品|公司|项目|城市|国家|基金|商品|品牌|交易所)$|\b(?:name|label|category|sector|region|product|company|market|asset|contract|group|country|city|industry|brand|exchange)$/iu
const supplementaryField = /备注|说明|描述|来源|链接|网址|状态|\b(?:note|notes|description|source|url|link|status|comment|details)\b/iu
const unitField = /^(?:(?:报价|计价|货币|度量|统计|指标|数值)?单位|币种|(?:quote |price )?(?:unit|currency)|ccy)$/iu
const fieldNames = field => [field.key, field.label].map(name => name.replace(/([a-z])([A-Z])/gu,'$1 $2').replace(/[_-]+/gu,' '))
const matches = (field, pattern) => fieldNames(field).some(name => pattern.test(name))
const distinct = values => new Set(values).size === values.length
const currencies = new Intl.DisplayNames(['zh-CN'], {type:'currency',fallback:'none'})

function currencyPair(field) {
 const pair = /^([A-Z]{3})\s*\/\s*([A-Z]{3})(?=$|[（(\s])/u.exec(field.label)
 return pair && pair.slice(1).every(code => currencies.of(code)) ? pair.slice(1) : undefined
}

function namesMeasure(field, text) {
 const label = field.label.split(/[（(]/u,1)[0].trim()
 const tokens = text.toLowerCase().split(/[^a-z0-9_]+/u)
 if ([label,field.key].some(name => /^[a-z0-9_]+$/iu.test(name) ? tokens.includes(name.toLowerCase()) : name.length > 1 && text.includes(name))) return true
 const pair = currencyPair(field)
 return pair?.every(code => text.includes(currencies.of(code)))
}

function measureUnit(field) {
 const pair = currencyPair(field)
 const suffix = /[（(]((?:(?:元|美元|港元|欧元|人民币|USD|EUR|CNY|吨|件|公里|千瓦时)(?:[/／](?:吨|千克|公斤|克|桶|件|股|份|小时|公里)))|(?:万|千|亿)?(?:手|吨|件|股|份|人|人次)|kg|km|kWh|bp|bps)[）)]$/u.exec(field.label)?.[1]
 return chartFieldUnit(field) ?? suffix ?? (pair ? pair[1]+' per '+pair[0] : undefined)
}

function chartUnit(fields, columns, rows, declared, inferred) {
 const sourceUnits = fields.map(measureUnit)
 const known = [...new Set(sourceUnits.filter(Boolean))]
 if (known.length > 1 || declared && known.length && declared !== known[0]) return
 const generic = columns.filter(field => matches(field,unitField))
 if (generic.length > 1) return
 const [unitColumn] = generic
 const rowUnit = unitColumn && rows[0][unitColumn.key]
 if (unitColumn && (typeof rowUnit !== 'string' || !rowUnit.trim() || !rows.every(row => row[unitColumn.key] === rowUnit))) return
 const unit = declared ?? rowUnit ?? known[0]
 if (rowUnit && rowUnit !== unit || known.length && known[0] !== unit) return
 if (inferred && fields.length > 1 && !declared && !rowUnit && sourceUnits.some(value => !value)) return
 return unit ? {unit} : {}
}

// Sort only real, comparable periods. Keep the original label for display.
function period(value) {
 if (typeof value !== 'string') return
 const daily = value.replace(/^(\d{4})(\d{2})(\d{2})$/u,'$1-$2-$3')
 const time = datasetScheduleTime(daily)
 if (time !== null) return {grain:daily.includes('T')?'time':'day',order:time}
 const match = /^(\d{4})(?:-(0[1-9]|1[0-2])|Q([1-4]))?$/iu.exec(value)
 if (match) return {grain:match[2]?'month':match[3]?'quarter':'year',order:Number(match[1])*12+Number(match[2]??match[3]??0)}
}

function panelIntent(content, {panelTitle='',panelRequest='',originalRequest='',singlePanel=false}) {
 const titles = [content.title,panelTitle].filter(name => typeof name === 'string' && name.trim()).map(name => name.split(/[（(]/u,1)[0].trim())
 const relevant = singlePanel ? originalRequest : originalRequest.split(/[。；;\n]|(?=[「“])/u).filter(clause =>
  titles.some(name => name && clause.includes(name)) || tableOnly.test(clause) &&
  (/各(?:卡|面板)|所有|全部|整个工作台|\ball (?:cards|panels)\b/iu.test(clause) || tableOnly.exec(clause.trim())?.index === 0)
 ).join('\n')
 return {titles:titles.join('\n'),request:[panelRequest,relevant].filter(Boolean).join('\n')}
}

function categoryAxis(columns, rows, intent) {
 const unique = columns.filter(field => !matches(field,periodField) && !matches(field,unitField) &&
  rows.every(row => typeof row[field.key] === 'string' && row[field.key].trim()) && distinct(rows.map(row => row[field.key])))
 const names = unique.filter(field => matches(field,categoryField) && !matches(field,identifier))
 const named = names.filter(field => namesMeasure(field,intent))
 if (named.length === 1) return named[0]
 const labels = names.filter(field => fieldNames(field).some(name => /名称|^(?:name|label)$/iu.test(name)))
 if (labels.length === 1) return labels[0]
 if (names.length === 1) return names[0]
 if (names.length) return
 const descriptive = unique.filter(field => !matches(field,identifier) && !matches(field,supplementaryField))
 if (descriptive.length === 1) return descriptive[0]
 const codes = unique.filter(field => matches(field,/代码|\b(?:code|symbol|ticker)$/iu))
 return !descriptive.length && codes.length === 1 ? codes[0] : undefined
}

// A chart is a projection of one full record set. Mixed dimensions, unknown
// ordering or incomplete measurements stay in that record set as a table.
export function contentChartSelection(content, columns, scope = {}) {
 const {titles,request} = panelIntent(content,scope), intent = titles+'\n'+request
 const {rows} = content
 if (scope.tableOnly || tableOnly.test(intent)) return
 if (content.visualization !== undefined) {
  const view = content.visualization
  if (!Array.isArray(view?.values)) return
  const fields = columns.filter(field => view.values.includes(field.key))
  if (!chartUnit(fields,columns,rows,view.unit??content.unit,false)) return
  return {view,rows}
 }
 if (rows.length < 2 || rows.length > 366 || columns.length > 20 || rows.length*columns.length > 4000 ||
     /名录|速查|字典|\b(?:catalog(?:ue)?|directory|glossary)\b/iu.test(titles)) return
 const hasNumber = field => rows.some(row => Number.isFinite(row[field.key]))
 const candidates = columns.filter(field => !matches(field,identifier) && !matches(field,periodField) &&
  !matches(field,unitField) && !matches(field,supplementaryField) && (!matches(field,categoryField) || hasNumber(field)))
 const named = candidates.filter(field => namesMeasure(field,titles))
 const requested = named.length ? named : candidates.filter(field => namesMeasure(field,request))
 // A wholly missing measure still competes with unknown numeric columns.
 // Picking the last nonempty column could chart volume under a price title.
 const selected = requested.length ? requested : candidates.filter(field => hasNumber(field) ||
  rows.every(row => row[field.key] == null || typeof row[field.key] === 'string' && /^(?:[+-]?\d+(?:\.\d+)?|[-—–]+|N\/?A|暂无(?:数据)?|缺失|未提供)?$/iu.test(row[field.key].trim())))
 if (!selected.length || selected.some(field => !rows.every(row => Number.isFinite(row[field.key])))) return
 const unit = chartUnit(selected,columns,rows,content.unit,true)
 if (!unit) return
 const config = {values:selected.map(field => field.key),...unit}

 const periods = columns.filter(field => matches(field,periodField) && new Set(rows.map(row => row[field.key])).size > 1)
 if (periods.length) {
  if (periods.length !== 1 || rows.length < 3 || !(trend.test(intent) || requested.length || comparison.test(intent))) return
  const axis = periods[0], times = rows.map(row => period(row[axis.key]))
  if (times.some(time => !time || time.grain !== times[0]?.grain) || !distinct(times.map(time => time.order))) return
  // Never connect different subjects observed on different dates as one line.
  if (columns.some(field => field !== axis && (matches(field,categoryField) && rows.every(row => typeof row[field.key] === 'string') || matches(field,/代码|\b(?:symbol|ticker|code)$/iu)) &&
      !selected.includes(field) && new Set(rows.map(row => row[field.key])).size > 1)) return
  const ordered = rows.map((row,i) => ({row,order:times[i].order})).sort((a,b) => a.order-b.order)
  return {view:{kind:'line',label:axis.key,...config},rows:ordered.map(item => item.row)}
 }
 if (selected.length !== 1 || !comparison.test(intent)) return
 const axis = categoryAxis(columns,rows,intent)
 if (!axis) return
 const direction = /升序|从低到高|由(?:低到高|小到大)|\b(?:ascending|lowest first|smallest first)\b/iu.test(intent) ? 1 : -1
 const [measure] = selected
 return {view:{kind:'horizontal',label:axis.key,...config},rows:rows.toSorted((a,b) => direction*(a[measure.key]-b[measure.key]))}
}
