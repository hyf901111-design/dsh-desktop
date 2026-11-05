import {authoredPrototypeEvidence} from './workbench-prototype-evidence.js'
import {resolveComponentSnapshot} from './component-source-binding.js'

// Recover records already read by this component, never invented example rows.
// This is deliberately a disclosed reading snapshot, not a claim that custom
// filters, drill-downs or automatic refresh have been implemented.
export function recoverPrototypeTable(records,{panelType,panelRequest='',title,workbenchRequest}={}){
 if(panelType!=='table'||workbenchRequest?.dataMode!=='source'||!/(?:全部|完整|全量|\b(?:all|complete|full)\b)/iu.test(panelRequest))return null
 const allowed=authoredPrototypeEvidence(workbenchRequest.originalRequest).files
 const choices=new Map()
 for(const record of records){
  const response=record.response,rows=response?.rows,path=record.args?.file_path
  if(record.tool!=='read_prototype'||!allowed.includes(path)||!response?.section||record.args.section!==response.section||!panelRequest.includes(response.section)||response.offset!==1||response.nextOffset!==undefined||!Array.isArray(rows)||rows.length!==response.total||!rows.length||rows.length>500)continue
  if(!rows.every(row=>row&&typeof row==='object'&&!Array.isArray(row)))continue
  const fields=[...new Set(rows.flatMap(row=>Object.keys(row)))]
  if(!fields.length||fields.length>32||fields.some(key=>!key.trim()||key.length>128||['__proto__','constructor','prototype'].includes(key)))continue
  if(rows.some(row=>Object.values(row).some(value=>value!==null&&!['string','number','boolean'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))))continue
  choices.set(path+'\n'+response.section,{record,fields})
 }
 if(choices.size!==1)return null
 const {record,fields}=choices.values().next().value
 const expected=[...panelRequest.matchAll(/\b(\d{1,5})\s*(?:条|只|行|records\b|rows\b|products\b)/giu)].map(match=>Number(match[1])).filter(Boolean)
 if(expected.some(count=>count!==record.response.total))return null
 const candidate={version:1,type:'data-bound',requests:[{key:'provided',tool:'read_prototype',args:record.args}],mapping:{version:1,type:'table',title:title||'原型明细',asOf:'用户提供的原型静态快照；数据时点以原文件为准',columns:fields,rows:{$from:'provided',$each:'rows',$map:fields.map(key=>({$path:key,$as:'string',$optional:true,$default:'来源未提供'}))},note:'已保留原型完整记录及原字段名；缺失字段显示“来源未提供”。定制筛选、排序及详情交互尚未完成，当前为可阅读的静态明细，不代表最新行情或自动更新。'}}
 try{return resolveComponentSnapshot(JSON.stringify(candidate),[record])}catch{return null}
}
