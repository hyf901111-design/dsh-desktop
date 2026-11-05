import {authoredPrototypeEvidence} from './workbench-prototype-evidence.js'
import {extractArtifactObjects} from './artifact-output.js'
import {readTemplateModel} from './component-template-registry.js'
import {prototypeHtmlSourceRows} from './prototype-html-snapshot.js'

export function prototypeTableCoverageIssue(text,records,{panelType,panelRequest='',workbenchRequest,mappedData}={}){
 if(!['table','market','html'].includes(panelType)||panelType==='html'&&!/(?:表格|明细|产品|\btable\b|\bproducts\b)/iu.test(panelRequest)||!authoredPrototypeEvidence(workbenchRequest?.originalRequest).files.some(path=>/\.html?$/iu.test(path))||!/(?:全部|完整|全量|\b(?:all|complete|full)\b)/iu.test(panelRequest))return null
 const declared=[...panelRequest.matchAll(/\b(\d{1,5})\s*(?:条|只|行|records\b|rows\b|products\b)/giu)].map(match=>Number(match[1])).filter(count=>count>0&&count<=2000)
 const observed=records.filter(record=>record.tool==='read_prototype'&&typeof record.response?.section==='string'&&panelRequest.includes(record.response.section)&&Array.isArray(record.response.rows)&&Number.isSafeInteger(record.response.total)&&record.response.total>0).map(record=>record.response.total)
 const expected=Math.max(0,...declared,...observed)
 if(!expected)return null
 const candidates=mappedData?[mappedData]:extractArtifactObjects(text).map(value=>readTemplateModel(value)?.data??value)
 const data=candidates.find(value=>value?.type==='table'||value?.type==='market'&&['table','fund-holdings'].includes(value.variant))
 if(Array.isArray(data?.rows)&&data.rows.length>=expected)return null
 const htmlRows=candidates.map(value=>prototypeHtmlSourceRows(value,records,panelRequest)).find(rows=>rows?.length>=expected)
 if(htmlRows)return null
 return `原型明细要求保留完整 ${expected} 条记录，当前只有 ${Array.isArray(data?.rows)?data.rows.length:'无法核验的'} 条。不能用示例行或“组件以后再分页读取”冒充完成。用 read_prototype 读取对应数据段（limit:500，若有 nextOffset 再继续），复用实际记录及原字段。标准表格可使用静态 data-bound 映射，宿主直接物化完整记录，不逐行抄写，也不创建自动刷新绑定。`
}
