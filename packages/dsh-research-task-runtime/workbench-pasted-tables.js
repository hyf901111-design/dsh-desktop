import {readDelimitedRow} from './delimited-row.js';
import {addDecimal,decimalParts,decimalPercentage,subtractDecimal} from './workbench-decimal.js';
import {mapWorkbenchPanelFields} from './dataset-view-contract.js';

const fieldKey=/^\p{L}[\p{L}\p{N}\p{M}_-]{0,63}$/u;
const forbidden=new Set(['constructor','prototype','__proto__']);
const validKey=key=>typeof key==='string'&&fieldKey.test(key)&&!forbidden.has(key);
const exact=(value,required,optional=[])=>value&&typeof value==='object'&&!Array.isArray(value)&&
 required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
const fail=message=>{throw Error('消息中的原始表格：'+message);};
const rawDecimal=/^[+-]?(?:0|[1-9]\d{0,14})(?:\.\d{1,12})?$/u;

function scanPastedTables(request, strict = false) {
 const blocks = [], context = [];
 let block = [], format;
 function finishBlock() {
  if (block.length >= 2) blocks.push(block);
  block = [];
 }
 for (let start = 0; start < request.length;) {
  const end = request.indexOf('\n', start);
  const line = request.slice(start, end < 0 ? undefined : end).replace(/\r$/u,'');
  let next = end < 0 ? request.length : end + 1;
  let cells, kind;
  if (line.includes('\t') || (format === 'tsv' && line.startsWith('"'))) {
   try {
    const row = readDelimitedRow(request, start, '\t');
    if (row.cells.length >= 2) {
     kind = 'tsv';
     cells = row.cells;
     next = row.next;
    }
   } catch (error) {
    // Never offer a partial table or renumber later blocks after a broken quote.
    if (strict) fail(error.message);
    return {blocks:[], context:request};
   }
  } else if (/[|｜]/u.test(line)) {
   const text = line.trim();
   const inner = /^[|｜].*[|｜]$/u.test(text) ? text.slice(1,-1) : text;
   cells = inner.split(/[|｜]/u).map(value => value.trim());
   if (cells.length >= 2) kind = 'pipe';
  }
  if (kind !== format || !kind) finishBlock();
  format = kind;
  if (!kind) context.push(line);
  else if (kind !== 'pipe' || !cells.every(value => /^:?-{3,}:?$/u.test(value))) block.push(cells);
  start = next;
 }
 finishBlock();
 return {blocks, context:context.join('\n')};
}

export function pastedWorkbenchBlocks(request = '') {
 return scanPastedTables(request).blocks;
}

function pastedNumber(value){
 if(value==='')return null;
 if(!rawDecimal.test(value))fail('数值列含非数值原值或有意义的前导零，保留文本字段或明确数值列。');
 const number=Number(value),converted=decimalParts(number);
 if(addDecimal(decimalParts(value),{...converted,coefficient:-converted.coefficient}).coefficient!==0n)
  fail('数值无法无损表示，保留原值文本。');
 return number===0?0:number;
}

function referencesCompletePastedRows(dataset,rows,header){
 if(!rows?.length||!Array.isArray(dataset?.records)||rows.length!==dataset.records.length||rows.some(row=>row.length!==rows[0].length)||
    !Array.isArray(dataset.fields)||dataset.fields.length>24||!dataset.records.every(record=>record&&typeof record==='object'))return false;
 const keys=new Set(['id',...dataset.fields.map(field=>field?.key).filter(validKey)]);
 for(let column=0;column<rows[0].length;column++){
  const match=[...keys].find(key=>(!header||[key,dataset.fields.find(field=>field?.key===key)?.label].includes(header[column]))&&rows.every((row,i)=>{
   const raw=row[column],actual=dataset.records[i][key];
   if(typeof actual==='number'){
    if(!Number.isFinite(actual)||!rawDecimal.test(raw))return false;
    const converted=decimalParts(actual);
    return addDecimal(decimalParts(raw),{...converted,coefficient:-converted.coefficient}).coefficient===0n;
   }
   return actual===raw||actual===null&&raw==='';
  }));
  if(match===undefined)return false;
  keys.delete(match);
 }
 return true;
}

function completeNamedCalculationPlan(plan,blocks,source){
 const request=plan.originalRequest;
 if(!source||!/模拟/u.test(request)||blocks.length!==1||!Array.isArray(plan.panels)||
    plan.tabs||plan.links||plan.panels.some(panel=>panel?.library||panel?.publicData||panel?.profile||panel?.requests)||
    Array.isArray(plan.sharedDatasets)&&plan.sharedDatasets.some(dataset=>dataset?.id==='authored-calculation'))return plan;
 const rows=blocks[0],labels=rows.map(row=>row[0]);
 const clauses=[...request.matchAll(/[「“『]([^」”』\n]+)[」”』]([^「“『。；;\n]*)/gu)];
 const unit=/(?:金额|单位)(?:均?为|[：:]\s*)?\s*(万元|亿元|元)/u.exec(request)?.[1];
 if(!unit||clauses.length!==3||new Set(clauses.map(([,title])=>title)).size!==3||
    rows.length>500||new Set(labels).size!==rows.length)return plan;
 const flow=labels.every(label=>/^\d{4}-\d{2}-\d{2}$/u.test(label))&&
  /净申购(?:额)?[（(]\s*申购\s*[减−-]\s*赎回/u.test(request);
 const target=labels.every(label=>!/^\d/u.test(label))&&/目标、实际、达成率/u.test(request)&&
  /总体达成率.{0,14}(?:用总额计算|总实际.{0,6}总目标)/u.test(request);
 const reconcile=/账面(?:额)?\s*[减−-]\s*托管/u.test(request)&&/保留零和负数/u.test(request)&&/批次/u.test(request);
 if(Number(flow)+Number(target)+Number(reconcile)!==1||
    !rows.every(row=>row.length===(reconcile?4:3)&&row[0]&&
      (!reconcile||row[1])&&row.slice(-2).every(value=>rawDecimal.test(value))))return plan;
 const roles=clauses.map(([,title,clause])=>{
  if(/原生(?:折线图|横向条形图|横条图)/u.test(clause))return 'chart';
  if(reconcile&&/仅.{0,24}(?:不同|差异)/u.test(clause))return 'exceptions';
  if(!reconcile&&/指标卡|期间合计|总体达成率/u.test(clause))return 'summary';
  if(/表/u.test(clause.slice(0,16)))return 'records';
 });
 if(new Set(roles).size!==3||roles.includes(undefined)||
    !roles.includes('records')||!roles.includes('chart')||
    !roles.includes(reconcile?'exceptions':'summary'))return plan;
 const [dimension,left,right,metric]=flow?['日期','申购','赎回','净申购']:
  target?['渠道','目标','实际','达成率']:['批次','账面额','托管额','差额'];
 const [leftKey,rightKey]=flow?['purchase','redeem']:target?['target','actual']:['book','custody'];
 const metricKey=flow?'net':target?'completion':'difference',metricUnit=target?'%':unit;
 const ledger='authored-calculation',totals='authored-calculation-totals';
 const fields=[{key:'id',label:dimension},...(reconcile?[{key:'category',label:'资产类别'}]:[]),
  {key:leftKey,label:left,unit},{key:rightKey,label:right,unit}];
 const measures=[{key:leftKey,label:flow?'申购合计':'总目标',op:'sum',field:leftKey,unit},
  {key:rightKey,label:flow?'赎回合计':'总实际',op:'sum',field:rightKey,unit},
  flow?{key:metricKey,label:'净申购合计',op:'sum',field:metricKey,unit}
   :{key:metricKey,label:'总体达成率',op:'percent',numerator:rightKey,denominator:leftKey,unit:metricUnit}];
 const sharedDatasets=[
  {id:ledger,label:source,fields,pastedTable:{block:1,identity:'id',numericFields:[leftKey,rightKey],
   derive:[{key:metricKey,label:metric,op:target?'percent':'subtract',left:target?rightKey:leftKey,right:target?leftKey:rightKey,unit:metricUnit}]}},
  ...(!reconcile?[{id:totals,label:'合计',aggregate:{dataset:ledger,groupBy:[],measures}}]:[]),
 ];
 const panels=clauses.map(([,title,clause],i)=>{
  const submitted=plan.panels.find(panel=>typeof panel?.title==='string'&&panel.title.split(/[（(]/u)[0].trim()===title);
  const {size,layout}=submitted??{};
  const panel={title,prompt:submitted?.prompt||clause.trim(),...(size?{size}:{}),...(layout?{layout}:{})};
  const role=roles[i];
  if(role==='chart')return {...panel,type:'chart',view:{dataset:ledger,variant:flow?'line':'horizontal',unit:metricUnit,
   sections:[{kind:'records',label:'id',fields:[metricKey]}]}};
  if(role==='summary')return {...panel,type:'kpi',view:{dataset:totals,sections:[{kind:'records',fields:[leftKey,rightKey,metricKey]}]}};
  return {...panel,type:'view',view:{dataset:ledger,...(role==='exceptions'?{where:[{field:metricKey,op:'ne',value:0}]}:{}),
   sections:[{kind:'records',fields:[...fields.map(field=>field.key),metricKey]}]}};
 });
 const {generationMode,...prepared}=plan;
 return {...prepared,sharedDatasets,panels};
}

export function resolvePastedWorkbenchPlan(plan){
 const request=plan.originalRequest;
 const direct=Array.isArray(plan.sharedDatasets)&&plan.sharedDatasets.some(dataset=>dataset?.pastedTable!==undefined);
 const recoverCopied=typeof request==='string'&&/(?:禁止|不要|不用|不)\s*联网/u.test(request);
 if(!direct&&!recoverCopied)return plan;
 if(typeof request!=='string'||!request)fail('只引用本轮用户消息中的表格。');
 const {blocks,context}=scanPastedTables(request,direct);
 const source=/(?:^|[。；;，,\n])\s*(?:来源|出处)\s*(?:标(?:为|注(?:为)?)?|写(?:为)?|[:：])?\s*[「“]?([^。；;，、」”\n]{1,100})/u.exec(context)?.[1]?.trim()??
  /(?:^|[。；;，,\n])\s*(模拟[\p{L}]{2,16})\s+\d{4}-\d{2}-\d{2}/u.exec(context)?.[1];
 if(recoverCopied)plan=completeNamedCalculationPlan(plan,blocks,source);
 const datasets=plan.sharedDatasets;
 if(!Array.isArray(datasets))return plan;
 const dateMatches=[...new Set([...context.matchAll(/\b\d{4}-\d{2}-\d{2}\b/gu)].map(match=>match[0]))];
 const asOf=dateMatches.length===1?dateMatches[0]:'用户消息所附原表，时点以记录为准';
 const identities=new Map();
 const pastedSources=new Map();
 const aggregateIds=new Map(),datasetIds=new Set(datasets.map(dataset=>dataset?.id));
 const split=datasets.flatMap(draft=>{
  if(draft?.pastedTable===undefined||draft.aggregate?.dataset!==draft.id||draft.aggregate?.groupBy?.length!==0||typeof draft.id!=='string'||
     !plan.panels.some(panel=>panel?.type==='kpi'&&panel.view?.dataset===draft.id))return [draft];
  const {aggregate,...original}=draft;
  const prefix=draft.id.slice(0,108)+'-totals';
  let id=prefix,index=2;
  while(datasetIds.has(id))id=`${prefix}-${index++}`;
  datasetIds.add(id);aggregateIds.set(draft.id,id);
  return [original,{id,label:draft.label,aggregate}];
 });
 const resolved=split.map(draft=>{
  if(draft?.pastedTable===undefined){
   if(!recoverCopied||draft?.aggregate!==undefined)return draft;
   const block=blocks.findIndex(rows=>rows.length<=500&&(referencesCompletePastedRows(draft,rows)||referencesCompletePastedRows(draft,rows.slice(1),rows[0])));
   if(block<0)return draft;
   const origin=`${source||'用户消息中的原始表格'} · 表段 ${block+1}`;
   const note=draft.note??origin;
   pastedSources.set(draft.id,note);
   return {...draft,note,asOf:draft.asOf??asOf};
  }
  if(!exact(draft,['id','label','pastedTable'],['fields','recordScope','note','asOf'])||
     draft.asOf!==undefined&&(typeof draft.asOf!=='string'||draft.asOf.length>500)||
     draft.note!==undefined&&(typeof draft.note!=='string'||!draft.note.trim()||draft.note.length>2000)||
     !exact(draft.pastedTable,['block'],['header','identity','numericFields','derive']))fail('只声明表段、列和计算，不附重抄的原表记录。');
  const {id,label,fields:declared,recordScope,pastedTable}=draft;
  const {block,header=false,identity,numericFields=[],derive=[]}=pastedTable;
  const raw=Number.isInteger(block)&&blocks[block-1];
  const derivedKeys=new Set(Array.isArray(derive)?derive.map(field=>field?.key):[]);
  const sourceFields=declared===undefined&&header&&raw ? raw[0].map(label=>({key:label,label})) : declared;
  if(declared===undefined&&(!sourceFields||!raw[0].every(validKey)))
   fail('请按原表头的列顺序声明 fields，每列提供有效的 key 与原文 label。');
  const inputColumns=Array.isArray(sourceFields)?sourceFields.filter(field=>!derivedKeys.has(field?.key)):sourceFields;
  const fields=identity==='id'&&Array.isArray(inputColumns)&&!inputColumns.some(field=>field?.key==='id')&&raw?.[0].length===inputColumns.length+1
   ?[{key:'id',label:header?raw[0][0]:'记录编号'},...inputColumns]:inputColumns;
  if(typeof header!=='boolean'||!raw||raw.length>500||!Array.isArray(fields)||fields.length<2||fields.length>24||
     !fields.every(field=>exact(field,['key','label'],['unit'])&&validKey(field.key)))fail('表段编号、列数或列定义无效。');
  const keys=new Set(fields.map(field=>field.key));
  if(keys.size!==fields.length||keys.has('id')&&identity!=='id'||identity!==undefined&&!keys.has(identity)||
     !Array.isArray(numericFields)||new Set(numericFields).size!==numericFields.length||numericFields.some(key=>key===identity||!keys.has(key)))
   fail('列键、唯一编号或数值列声明无效。');
  if(raw.some(row=>row.length!==fields.length)||header&&!raw[0].every((value,index)=>[fields[index].key,fields[index].label].includes(value)))
   fail('按用户粘贴的列顺序声明完整字段，表头须与原文一致。');
  if(!Array.isArray(derive)||derive.length>12)fail('最多声明12个派生数值列。');
  const numeric=new Set(numericFields);
  for(const field of derive){
   if(!exact(field,['key','label','op','left','right'],['unit','digits'])||!validKey(field.key)||field.key==='id'||keys.has(field.key)||
      !numeric.has(field.left)||!numeric.has(field.right)||!['subtract','percent'].includes(field.op)||
      field.digits!==undefined&&(!Number.isInteger(field.digits)||field.digits<0||field.digits>8))fail('派生列只允许对两列原始数值做差或计算百分比。');
   keys.add(field.key);
  }
  const rawFields=new Map(fields.map(field=>[field.key,field]));
  const schema=[...fields,...derive.map(({key,label,unit,op,left,right})=>{
   const a=rawFields.get(left).unit,b=rawFields.get(right).unit;
   const knownUnit=unit??(op==='percent'?'%':a===b?a:undefined);
   return {key,label,...(knownUnit===undefined?{}:{unit:knownUnit})};
  })];
  const records=raw.slice(header?1:0).map((row,index)=>{
   const record=Object.fromEntries(fields.map(({key},i)=>[key,numeric.has(key)?pastedNumber(row[i]):row[i]]));
   for(const {key,op,left,right,digits} of derive){
    const a=record[left],b=record[right];
    const value=a===null||b===null?null:op==='subtract'?subtractDecimal(a,b):decimalPercentage(a,b,digits);
    if(op==='subtract'&&digits!==undefined&&value!==null&&Number(value.toFixed(digits))!==value)
     fail('差额精度会损失原值；省略 digits 以保留精确差额。');
    record[key]=value;
   }
   return {id:identity===undefined?`row-${index+1}`:record[identity],...record};
  });
  const columns=identity&&identity!=='id'?[{key:'id',label:fields.find(field=>field.key===identity).label},...schema]:schema;
  if(identity&&identity!=='id')identities.set(id,new Set([identity,fields.find(field=>field.key===identity).label]));
  const origin=`${source||'用户消息中的原始表格'} · 表段 ${block}`;
  const note=origin+(draft.note?'\n规划备注：'+draft.note.trim():'');
  pastedSources.set(id,note);
  return {id,label,asOf,note,fields:columns,records,...(recordScope===undefined?{}:{recordScope})};
 });
 const sharedDatasets=resolved.map(draft=>{
  const origin=pastedSources.get(draft?.aggregate?.dataset);
  return origin&&typeof draft.note==='string'&&!draft.note.includes(origin)?{...draft,note:origin+'\n'+draft.note}:draft;
 });
 return {...plan,sharedDatasets,panels:plan.panels.map(panel=>{
  const totals=panel?.type==='kpi'?aggregateIds.get(panel.view?.dataset):undefined;
  if(totals)return {...panel,view:{...panel.view,dataset:totals}};
  return mapWorkbenchPanelFields(panel,(dataset,key)=>identities.get(dataset)?.has(key)?'id':key);
 })};
}
