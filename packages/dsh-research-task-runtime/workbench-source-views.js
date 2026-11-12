import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import Ajv from 'ajv'
import { compileComponentContent } from './component-content.js'

export const OBSERVED_SOURCES_TOOL = 'research_workbench_source_catalog'
export const OBSERVED_SOURCE_GUIDANCE = '【本轮完整结构化数据】工作台普通明细和折线、柱状、横条、面积图优先用 sourceView。编号必须逐字采用下列实际来源，未列出时先调 research_workbench_source_catalog。每卡只填 title、prompt、type、sourceView，可选 size 和 layout。明细 type=table 用 sourceView:{sourceRef}；图表 type=chart 用 sourceView:{sourceRef,chart_spec:{chartType,encodings:{x:{field},y:{field}},unit?}}。同一编号可供多卡引用，省略 view、sharedDatasets、content 和 artifact。'

const variants = {
  'Line Chart': 'line',
  'Bar Chart': 'bar',
  'Horizontal Bar Chart': 'horizontal',
  'Area Chart': 'area',
}
const encoding = {
  type: 'object', additionalProperties: false,
  properties: { field: { type: 'string' } },
}
const encodings = {
  type: 'object', additionalProperties: false,
  properties: { x: encoding, y: encoding },
}
const chart = {
  type: 'object', additionalProperties: false,
  properties: {
    chartType: { type: 'string', enum: Object.keys(variants) },
    encodings,
    unit: { type: 'string' },
  },
}
export const OBSERVED_SOURCE_VIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { sourceRef: { type: 'string' }, chart_spec: chart },
}
const requiredFields = {
  ...OBSERVED_SOURCE_VIEW_SCHEMA, required: ['sourceRef'],
  properties: { sourceRef: {type:'string',pattern:'^source-[a-f0-9]{16}$'}, chart_spec: {
    ...chart, required: ['chartType', 'encodings'], properties: {
      ...chart.properties, encodings: { ...encodings, required: ['x', 'y'],
        properties: { x: { ...encoding, required: ['field'] }, y: { ...encoding, required: ['field'] } } },
    },
  } },
}
const validate = new Ajv({ allErrors: true }).compile(requiredFields)

function sourceEntries(observed) {
  return (observed ?? []).flatMap(({tool, args, response}) => {
    const rows = Array.isArray(response) ? response : response?.records
    const page = response?.pagination
    if (!Array.isArray(rows) || !rows.length || response?.status === 'partial' ||
        (page && (page.possiblyMore !== false || page.offset > 0 || page.returned !== rows.length || page.total > rows.length)) ||
        !rows.every(row => row && typeof row === 'object' && !Array.isArray(row))) return []
    const fields = Object.keys(rows[0]).filter(key => rows.every(row => Object.hasOwn(row, key)))
    const sourceRef = 'source-' + createHash('sha256').update(JSON.stringify([tool,args])).digest('hex').slice(0,16)
    const label = [response?.source, response?.api ?? response?.sourceId].filter(value => typeof value === 'string' && value.trim()).join(' · ')
    if (!label) return []
    return [{ sourceRef, rows, fields, label, tool, args }]
  })
}

export function observedSourceViews(observed) {
  return sourceEntries(observed).map(({ sourceRef, rows, fields, label }) => ({
    sourceRef, label, rows: rows.length, fields,
    ...(typeof rows[0].ts_code === 'string' ? { code: rows[0].ts_code } : {}),
  }))
}

function combinedFundNavRows(source,entries,{panelRequest='',originalRequest=''}){
  if(source.args?.api_name!=='fund_nav'||!source.args.params||!/(?:合并|两只|两基金|全部|完整|同批)/u.test(panelRequest))return
  const symbols=text=>[...new Set(text.toUpperCase().match(/(?<![A-Z\d])\d{6}\.OF\b/gu)??[])]
  const wanted=symbols(panelRequest),authored=symbols(originalRequest)
  const {ts_code:code,...bounds}=source.args.params
  if(wanted.length<2||!wanted.every(symbol=>authored.includes(symbol))||!wanted.includes(code)||
     !/^\d{8}$/u.test(bounds.start_date??'')||!/^\d{8}$/u.test(bounds.end_date??'')||
     !['ts_code','nav_date','unit_nav','adj_nav'].every(key=>source.fields.includes(key)))return
  const byCode=new Map()
  for(const entry of entries){
    if(entry.tool!==source.tool||entry.label!==source.label||entry.args?.api_name!=='fund_nav'||!entry.args.params)continue
    const {ts_code,...otherBounds}=entry.args.params
    if(!wanted.includes(ts_code)||!isDeepStrictEqual(otherBounds,bounds)||entry.fields.length!==source.fields.length||
       !source.fields.every(key=>entry.fields.includes(key))||entry.rows.some(row=>row.ts_code!==ts_code))continue
    const dates=entry.rows.map(row=>String(row.nav_date??'').replaceAll('-',''))
    if(new Set(dates).size!==dates.length||dates.some(date=>!/^\d{8}$/u.test(date)||date<bounds.start_date||date>bounds.end_date))continue
    const previous=byCode.get(ts_code)
    if(previous&&!isDeepStrictEqual(previous,entry.rows))return
    byCode.set(ts_code,entry.rows)
  }
  if(byCode.size!==wanted.length)return
  return wanted.flatMap(symbol=>byCode.get(symbol)).sort((a,b)=>
    String(a.nav_date).replaceAll('-','').localeCompare(String(b.nav_date).replaceAll('-',''))||a.ts_code.localeCompare(b.ts_code))
}

export function compileObservedSourceView(title, view, observed, scope={}) {
  if (!validate(view)) {
    const error = validate.errors[0]
    const field = error.params.additionalProperty ?? error.params.missingProperty
    throw Error((error.instancePath + (field ? '/' + field : '') || '/') + ' 配置无效')
  }
  const entries=sourceEntries(observed)
  const source = entries.find(entry => entry.sourceRef === view.sourceRef)
  if (!source) throw Error('/sourceRef 没有对应的本轮完整数据，请重新查询来源目录')
  const rowsForTable=!view.chart_spec&&combinedFundNavRows(source,entries,scope)
  const content = { title, rows: rowsForTable||source.rows, sources: [{ label: source.label }] }
  if (!view.chart_spec) return compileComponentContent(content).data

  const { chartType, encodings: { x, y }, unit } = view.chart_spec
  if (!source.fields.includes(x.field) || !source.rows.every(row => typeof row[x.field] === 'string' && row[x.field].trim()))
    throw Error('/chart_spec/encodings/x/field 需要真实的非空文本或日期字段')
  if (!source.fields.includes(y.field) || !source.rows.every(row => typeof row[y.field] === 'number' && Number.isFinite(row[y.field])))
    throw Error('/chart_spec/encodings/y/field 需要真实的完整数值字段')
  const kind = variants[chartType]
  const rows = kind === 'line' || kind === 'area'
    ? [...source.rows].sort((a,b) => a[x.field].localeCompare(b[x.field], undefined, { numeric: true }))
    : source.rows
  const { data } = compileComponentContent({ ...content, rows, visualization: { kind, label: x.field, values: [y.field], unit } })
  if (data.type !== 'chart') throw Error('/chart_spec 当前图型无法承载完整记录。保留来源，按原需求调整图型或明确分组')
  return data
}
