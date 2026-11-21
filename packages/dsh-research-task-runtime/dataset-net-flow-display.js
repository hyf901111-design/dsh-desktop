// These are display fields, not new source values. Balance sheets and ratios
// can mention a flow in the same heading without being a signed flow amount.
const flowName = /净(?:资金|现金)?流(?:入|出|量)|净申购|净赎回|\bnet(?: cash)? (?:flows?|inflows?|outflows?)\b/iu

export function isNetFlowAmount(field) {
 const text = field?.label ?? ''
 return field?.key !== 'id' &&
  flowName.test(text) &&
  !/AUM|余额|资产规模|净资产|资产净值|比重|占比|比例|率|百分比|[%％]|\b(?:balance|ratio|rate|share of|assets under management)\b/iu.test(text) &&
  !/[%％]|百分点|基点|\b(?:bp|bps|percent(?:age)?)\b/iu.test(field.unit ?? '')
}

export function requestsSignedNetFlows(narrative) {
 return narrative.split(/[，,。；;！？!?\n]/u).some(clause => {
  if (!flowName.test(clause)) return false
  if (/(?:不(?:要|必|用|需(?:要)?)?|无须|无需|省略|取消|禁止)\s*(?:显示|保留|标注|加|带|使用)?\s*(?:正负号|正号|符号|[+＋]号?)|without signs?|unsigned/iu.test(clause)) return false
  return /(?:带|有)符号|正负(?:符)?号|(?:显示|标注|保留|加上|加)\s*(?:正号|[+＋]号?)|\bsigned\b|explicit signs?/iu.test(clause)
 })
}

export function netFlowDisplayFields(view,dataset) {
 const visible=new Set([...view.details,...view.sections.flatMap(section=>section.fields??[])])
 return dataset.fields.filter(field=>visible.has(field.key)&&isNetFlowAmount(field)&&
  dataset.records.every(row=>row[field.key]===null||Number.isFinite(row[field.key]))).map(field=>field.key)
}
