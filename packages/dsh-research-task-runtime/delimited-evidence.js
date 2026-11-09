import {extractArtifactObjects,retainedTableData} from './artifact-output.js'
import {readTemplateModel} from './component-template-registry.js'

// Keep delimited files as evidence, never executable code or a guessed series.
// Bound the complete representation; a cut record must not look like EOF.
export function extractDelimitedEvidence(input,name,budget=140_000) {
 const text=String(input).replace(/^\uFEFF/u,''),delimiter=/\.tsv$/iu.test(name)?'\t':','
 const rows=[];let row=[],cell='',quoted=false,closed=false
 const pushCell=()=>{row.push(cell);cell='';closed=false}
 const pushRow=()=>{pushCell();rows.push(row);row=[]}
 for(let i=0;i<text.length;i++){
  const c=text[i]
  if(quoted){
   if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}
   else cell+=c
  }else if(c===delimiter)pushCell()
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;pushRow()}
  else if(c==='"'&&!cell&&!closed)quoted=true
  else{if(closed||c==='"')throw Error('CSV 引号格式不完整');cell+=c}
 }
 if(quoted)throw Error('CSV 引号未闭合，不能把截断记录当作完整文件')
 if(cell||row.length||closed)pushRow()
 while(rows.length&&rows.at(-1).every(value=>value===''))rows.pop()
 const header=rows[0]
 if(!header?.length||header.some(value=>!value.trim())||new Set(header).size!==header.length||rows.some(row=>row.length!==header.length))throw Error('CSV 表头重复、为空或记录列数不一致')
 if(rows.length<2)throw Error('CSV 没有可读取的记录')
 const document={name,format:/\.tsv$/iu.test(name)?'tsv':'csv',blocks:[{id:'T1',rows}]}
 if(Buffer.byteLength(JSON.stringify(document),'utf8')>budget)throw Error('CSV 完整证据超出容量，请使用分块数据读取，不能截断或按样本交付')
 return document
}

// Only complete record projections are compared with full file rows. Aggregate
// views and explicitly selected subsets have different, narrower obligations.
export function delimitedTableIntegrityIssue(output,documents,request='') {
 const candidates=extractArtifactObjects(output)
 if(candidates.length!==1)return
 const data=retainedTableData(candidates[0])??readTemplateModel(candidates[0])?.data??candidates[0]
 if(!Array.isArray(data.rows)||!Array.isArray(data.columns))return
 const label=column=>typeof column==='string'?column:column?.label??column?.key
 const compact=value=>String(value??'').normalize('NFKC').trim()
 for(const document of documents??[]){
  if(!['csv','tsv'].includes(document.format))continue
  const [header,...original]=document.blocks[0].rows
  const mapping=data.columns.map(column=>header.findIndex(name=>compact(name)===compact(label(column))))
  // Require the original unique record key and another original field. Do not
  // guess that a summary keyed by team is the whole task-level projection.
  const unique=header.map((_,i)=>i).find(i=>original.every(row=>row[i]!=='' )&&new Set(original.map(row=>row[i])).size===original.length)
  const key=unique===undefined?-1:mapping.indexOf(unique)
  if(key<0||mapping.filter(i=>i>=0).length<2)return
  const byKey=new Map(original.map(row=>[compact(row[unique]),row]))
  const seen=new Set()
  for(const row of data.rows){
   const id=compact(row[key]),source=byKey.get(id)
   if(!source||seen.has(id))return `CSV 记录对应不完整：存在来源中没有或重复的编号 ${id}。直接保留原记录键，不重新编号、拼接或按规律重建。`
   seen.add(id)
   for(let i=0;i<mapping.length;i++)if(mapping[i]>=0){
    const expected=compact(source[mapping[i]]),actual=compact(row[i])
    if(actual!==expected&&!(expected===''&&['','—'].includes(actual)))return `CSV 原记录 ${id} 的“${header[mapping[i]]}”与原文件不一致。保留该行原始字段及完整长正文，不错配负责人、重算编号或压缩为摘要。`
   }
  }
  // Complete belongs to the selected scope: a complete risk subset is not
  // the full source file. Only explicit whole-record obligations demand all
  // source keys; field identity/correspondence above applies to every subset.
  const whole=/(?:全部|所有|全量)(?:的)?(?:原始)?(?:记录|数据行|明细)|完整记录明细|每条(?:原始)?记录.{0,16}(?:保留|字段)/u.test(request)||new RegExp('(?:全部|所有|全量)\\s*'+original.length+'\\s*条','u').test(request)
  if(whole&&seen.size!==original.length)return `CSV 交付记录不齐：来源 ${original.length} 条，实际 ${seen.size} 条。使用全部原始记录，不能只按标题或声明条数标记完成。`
 }
}
