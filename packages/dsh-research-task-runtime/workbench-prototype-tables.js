import {randomUUID} from 'node:crypto';
import {basename} from 'node:path';
import {decodeDataResponse} from './component-data-refresh.js';
import {prototypeReadCapability,withWorkbenchPrototypeRead} from './prototype-source-authority.js';
import {authoredPrototypeEvidence} from './workbench-prototype-evidence.js';
import {mapWorkbenchPanelFields} from './dataset-view-contract.js';

const toolName='read_prototype';
const staticSection=/^[\p{L}_$][\p{L}\p{N}_$]*(?:\.[\p{L}_$][\p{L}\p{N}_$]*)*$/u;
const datasetKey=/^\p{L}[\p{L}\p{N}\p{M}_-]{0,63}$/u;
const forbidden=new Set(['__proto__','prototype','constructor']);

function prototypeFieldValue(record,path){
 const parts=path.split('.');
 if(parts.some(key=>!key||forbidden.has(key)))return;
 if(Object.hasOwn(record,path))return record[path];
 return parts.reduce((value,key)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.hasOwn(value,key)?value[key]:undefined,record);
}

async function readPrototypeSection(ctx,exec,path,section,offset){
 if(!exec.token||ctx.tools.get?.(toolName,exec.agent)?.[prototypeReadCapability]!==true||typeof ctx.tools.execute!=='function')
  throw Error('本轮没有可用的内置原型读取工具。');
 exec.signal?.throwIfAborted();
 const args={file_path:path,section,...(offset===undefined?{}:{offset})};
 const callId=randomUUID();
 const result=await withWorkbenchPrototypeRead(callId,exec.agent,exec.token,args,()=>
  ctx.tools.execute({name:toolName,arguments:args,agent:exec.agent,callId,parent:exec.token,rootCallId:exec.rootCallId,signal:exec.signal}));
 if(result.isError)throw Error(`无法读取本轮原型的数据段「${section}」。请核对索引里的静态数据路径。数组内嵌字段用原数组作为 section，再在 fields[].key 填写行内路径。`);
 const response=decodeDataResponse(result.value?.section?result.value:result);
 if(response.section!==section||typeof response.sourceRevision!=='string'||!(/^[a-f\d]{64}$/u.test(response.sourceRevision)))
  throw Error('原型数据段或文件快照无法核验。');
 return response;
}

async function readPrototypeRows(ctx,exec,path,section,mode){
 const rows=[];
 let total,revision,presentation,offset=1;
 // Every page must describe the same immutable file and exact static array.
 // The native tool continues to enforce regular-file and workspace policy.
 while(offset!==undefined){
  const response=await readPrototypeSection(ctx,exec,path,section,offset);
  const {total:pageTotal,offset:pageOffset,rows:page,nextOffset,sourceRevision}=response;
  if(mode==='entries'){
   if(!response.value||typeof response.value!=='object'||Array.isArray(response.value))throw Error('原型键值视图必须引用静态对象。');
   const entries=Object.entries(response.value);
   if(!entries.length||entries.length>500)throw Error('原型对象超出完整记录范围。');
   return {rows:entries.map(([key,value])=>({key,value})),revision:sourceRevision};
  }
  if(pageOffset!==offset||!Number.isSafeInteger(pageTotal)||pageTotal<1||pageTotal>500||!Array.isArray(page)||!page.length||
     total!==undefined&&(total!==pageTotal||revision!==sourceRevision)||rows.length+page.length>pageTotal||
     (rows.length+page.length===pageTotal?nextOffset!==undefined:nextOffset!==offset+page.length))
   throw Error('原型数据分段不完整、源文件已变化或不是静态记录数组。');
  if(offset===1){total=pageTotal;revision=sourceRevision;presentation=response.presentation}
  rows.push(...page);
  offset=nextOffset;
 }
 return {rows,revision,presentation};
}

async function siblingPrototypeSources(ctx,exec,path,section,revision,cache){
 const [root,table,...nested]=section.split('.');
 if(nested.length||!/(?:recon|audit|quality|anomal|对账|核验|质量|异常)/iu.test(table??''))return;
 if(!cache.has(path))cache.set(path,await readPrototypeSection(ctx,exec,path,'index'));
 const index=cache.get(path);
 if(index.sourceRevision!==revision)throw Error('同一原型文件在读取来源说明时发生变化，请重新读取完整快照。');
 const keys=index.data?.find(entry=>entry.name===root&&entry.kind==='object')?.keys;
 if(!keys?.some(entry=>entry.name==='sources'&&entry.kind==='object'))return;
 const notes=[];
 for(const part of ['sources','confidence','selfcheck']){
  if(!keys.some(entry=>entry.name===part&&entry.kind==='object'))continue;
  const key=JSON.stringify([path,root,part]);
  if(!cache.has(key))cache.set(key,await readPrototypeSection(ctx,exec,path,root+'.'+part));
  const source=cache.get(key);
  if(source.sourceRevision!==revision)throw Error('同一原型文件在读取来源说明时发生变化，请重新读取完整快照。');
  const value=source.value;
  if(!value||typeof value!=='object'||Array.isArray(value))continue;
  const entries=Object.entries(value);
  if(!entries.length||entries.length>20)continue;
  const lines=entries.map(([name,text])=>{
   const display=Array.isArray(text)&&text.every(item=>typeof item==='string')?text.join('；'):
    typeof text==='string'||Number.isFinite(text)?String(text):'';
   return name.length<=100&&display&&display.length<=1200?name+'：'+display:undefined;
  }).filter(Boolean);
  if(lines.length)notes.push(source.section,...lines);
 }
 const note=notes.join('\n');
 return note.length<=4000?note:undefined;
}

async function verifyRelatedProductSnapshots(datasets,snapshots,ctx,exec,cache){
 const market=snapshots.find(source=>source.section.endsWith('.prods'));
 if(!market)return;
 const section=market.section.slice(0,-'prods'.length)+'ours';
 let own=snapshots.find(source=>source.path===market.path&&source.revision===market.revision&&source.section===section);
 const root=section.split('.');
 if(!own&&root.length===2&&datasets.some(dataset=>dataset.note?.includes(section))){
  if(!cache.has(market.path))cache.set(market.path,await readPrototypeSection(ctx,exec,market.path,'index'));
  const index=cache.get(market.path);
  if(index.sourceRevision!==market.revision)throw Error('同一原型文件在核对关联产品数据时发生变化。');
  if(index.data?.find(entry=>entry.name===root[0])?.keys?.some(key=>key.name===root[1]&&key.kind==='array')){
   const read=await readPrototypeRows(ctx,exec,market.path,section,'rows');
   if(read.revision!==market.revision)throw Error('同一原型文件在核对关联产品数据时发生变化。');
   own={path:market.path,section,...read};
  }
 }
 if(!own||own.rows.length<2)return;
 const records=new Map(market.rows.map(row=>[row.c,row]));
 if(records.size!==market.rows.length||!own.rows.every(row=>typeof row.c==='string'&&records.has(row.c)))return;
 const formats=own.presentation?.numericFormats??[];
 const moneyChange=formats.some(format=>format.field==='chg'&&format.scale===1&&format.context?.some(label=>/规模变化/u.test(label)))&&
  own.rows.every(row=>Number.isFinite(row.chg)&&records.get(row.c).chg===Number(row.chg.toFixed(2)));
 const returnRatio=formats.some(format=>format.field==='ret1w'&&format.scale===100)&&
  own.rows.every(row=>Number.isFinite(row.ret1w)&&records.get(row.c).ret===row.ret1w);
 if(moneyChange||returnRatio){
  const index=datasets.findIndex(dataset=>dataset.id===market.id),original=datasets[index];
  datasets[index]={...original,fields:original.fields.map(field=>{
   if(moneyChange&&field.key==='chg'&&/份额|份数/u.test(field.label))return {...field,label:'规模变化（本周）'};
   if(returnRatio&&field.key==='ret'&&/收益/u.test(field.label)&&!field.unit)return {...field,unit:'比例',
    label:field.label.includes('收益率')?field.label:field.label.replace('收益','收益率')};
   return field;
  })};
 }
 const channelRows=new Map();
 for(const row of own.rows){
  if(typeof row.n!=='string'||!row.pct||!row.amt||Object.keys(row.pct).length!==Object.keys(row.amt).length)return;
  for(const [channel,pct] of Object.entries(row.pct)){
   const amt=row.amt[channel],key=JSON.stringify([row.c,channel]);
   if(!Number.isFinite(pct)||!Number.isFinite(amt)||channelRows.has(key))return;
   channelRows.set(key,{name:row.n,pct,amt});
  }
 }
 for(const [index,dataset] of datasets.entries()){
  if(typeof dataset.note!=='string'||!dataset.note.includes(own.section)||!Array.isArray(dataset.records)||
     dataset.records.length!==channelRows.size||!dataset.fields?.some(field=>field.key==='channel'))continue;
  const ids=dataset.records.map(row=>JSON.stringify([row.code,row.channel]));
  if(new Set(ids).size!==channelRows.size||ids.some((id,i)=>!channelRows.has(id)||
     !['name','pct','amt'].every(key=>Object.hasOwn(dataset.records[i],key))))continue;
  const records=dataset.records.map((row,i)=>({...row,...channelRows.get(ids[i])}));
  const note=`${basename(own.path)} · ${own.section}.pct / ${own.section}.amt，原型静态快照\n${dataset.note}`;
  datasets[index]={...dataset,records,note};
 }
}

export async function resolveWorkbenchPrototypeTables(plan,ctx,exec,request){
 if(!Array.isArray(plan.sharedDatasets)||!plan.sharedDatasets.some(dataset=>dataset?.prototypeTable!==undefined))return plan;
 const files=authoredPrototypeEvidence(request).files.filter(path=>/\.html?$/iu.test(path));
 if(plan.dataMode==='simulated'||!files.length)throw Error('原型表格必须引用本轮附件中的 HTML 原文件。');
 const reads=new Map();
 const indexes=new Map();
 const revisions=new Map();
 const fieldAliases=new Map();
 const prototypeFields=new Map();
 const sharedDatasets=[];
 const snapshots=[];
 for(const draft of plan.sharedDatasets){
  if(draft?.prototypeTable===undefined){sharedDatasets.push(draft);continue}
  const {id,label,fields,prototypeTable,note}=draft;
  if(Object.keys(draft).some(key=>!['id','label','fields','prototypeTable','note','asOf'].includes(key))||!prototypeTable||
     draft.asOf!==undefined&&(typeof draft.asOf!=='string'||draft.asOf.length>500)||
     note!==undefined&&(typeof note!=='string'||!note.trim()||note.length>2000)||
     Object.keys(prototypeTable).some(key=>!['document','section','identity','mode'].includes(key))||
     typeof prototypeTable.section!=='string'||prototypeTable.section.length>256||!staticSection.test(prototypeTable.section)||
     prototypeTable.mode!==undefined&&!['rows','entries'].includes(prototypeTable.mode)||
     prototypeTable.identity!==undefined&&(typeof prototypeTable.identity!=='string'||!prototypeTable.identity||prototypeTable.identity.length>256)||
     prototypeTable.mode==='entries'&&prototypeTable.identity!==undefined&&prototypeTable.identity!=='key'||
     !Array.isArray(fields)||!fields.length||fields.length>24||
     !fields.every(field=>field&&typeof field.key==='string'&&field.key.length<=256&&Object.keys(field).every(key=>['key','label','unit'].includes(key)))||
     new Set(fields.map(field=>field.key)).size!==fields.length)
   throw Error('原型表格使用 document、section、identity 和显示字段，不能提交重抄的记录。');
  const paths=files.filter(path=>basename(path)===prototypeTable.document);
  if(paths.length!==1)throw Error('原型表格必须唯一引用本轮附件中的文件名。');
  const path=paths[0],mode=prototypeTable.mode??'rows',key=JSON.stringify([path,prototypeTable.section,mode]);
  if(!reads.has(key))reads.set(key,await readPrototypeRows(ctx,exec,path,prototypeTable.section,mode));
  const {rows,revision,presentation}=reads.get(key);
  snapshots.push({id,path,section:prototypeTable.section,rows,revision,presentation});
  if(revisions.has(path)&&revisions.get(path)!==revision)throw Error('同一原型文件在读取多个数据段期间发生变化，请重新读取完整快照。');
  revisions.set(path,revision);
  const identity=mode==='entries'?'key':prototypeTable.identity;
  if(!rows.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&(identity===undefined||typeof prototypeFieldValue(row,identity)==='string'))||
     !fields.every(field=>field.key==='id'||rows.some(row=>prototypeFieldValue(row,field.key)!==undefined)))
   throw Error('原型视图的编号与字段须来自原数据段。');
  const nestedFields=fields.flatMap(({key})=>{
   if(key==='id')return [];
   for(const row of rows){
    const value=prototypeFieldValue(row,key);
    if(!value||typeof value!=='object'||Array.isArray(value))continue;
    const leaves=Object.keys(value).filter(part=>!forbidden.has(part)&&!part.includes('.')).slice(0,4);
    return [leaves.length?`${key} 可用 ${leaves.map(part=>key+'.'+part).join('、')}`:key];
   }
   return [];
  });
  if(nestedFields.length)throw Error(`原型数据段「${prototypeTable.section}」的表格列需引用标量字段。请在同一 section 下改用行内字段路径：${nestedFields.join('；')}。`);
  const aliases=new Map();
  const used=new Set(fields.map(field=>field.key));
  if(identity!==undefined&&(!used.has(identity)||mode==='entries'))aliases.set(identity,'id');
  const projected=mode==='entries'?fields.filter(field=>field.key!=='key'):fields;
  const description=(plan.panels??[]).filter(panel=>panel?.view?.dataset===id).map(panel=>panel.prompt).join('\n');
  const columns=projected.map((original,index)=>{
   const unit=original.unit??(/收益$/u.test(original.label??'')&&description.includes(original.label+'（比例）')?'比例':undefined);
   const field=unit==='比例'&&/收益$/u.test(original.label??'')?{...original,unit,label:original.label+'率'}:original;
   if(datasetKey.test(field.key))return field;
   let key='sourceField'+(index+1);
   while(used.has(key))key+='-';
   used.add(key);aliases.set(field.key,key);
   return {...field,key};
  });
  fieldAliases.set(id,aliases);
  const codeIdentity=identity&&rows.every(row=>typeof prototypeFieldValue(row,identity)==='string')&&
   (/^(?:code|symbol|ticker|ts_code)$/iu.test(identity)||presentation?.labels?.some(label=>/\b(?:symbol|ticker)\b|^代码(?:\s|$)/iu.test(label))&&
    rows.every(row=>/^\d{4,6}(?:\.[A-Z]{2})?$/u.test(prototypeFieldValue(row,identity))));
  if(!used.has('id'))columns.unshift({key:'id',label:mode==='entries'?(fields.find(field=>field.key==='key')?.label??'原始条目'):
   identity===undefined?'原型记录行号':codeIdentity?'代码':`${identity}（原始编号）`});
  const duplicateIdentity=identity!=='id'&&columns.some(field=>field.key===identity&&field.label===columns.find(field=>field.key==='id')?.label);
  prototypeFields.set(id,{all:columns.map(field=>field.key),visible:columns.filter(field=>!duplicateIdentity||field.key!=='id').map(field=>field.key)});
  const records=rows.map((row,index)=>({id:identity===undefined?`row-${index+1}`:prototypeFieldValue(row,identity),...Object.fromEntries(projected.filter(field=>field.key!=='id').map(field=>[
   aliases.get(field.key)??field.key,prototypeFieldValue(row,field.key)??null]))}));
  const source=`${prototypeTable.document} · ${prototypeTable.section}，原型静态快照`;
  const provenance=mode==='rows'?await siblingPrototypeSources(ctx,exec,path,prototypeTable.section,revision,indexes):undefined;
  const sourceNote=[source,provenance,note===undefined?undefined:'规划备注：'+note.trim()].filter(Boolean).join('\n');
  sharedDatasets.push({id,label,fields:columns,records,asOf:'用户提供的原型静态快照',note:sourceNote});
 }
 await verifyRelatedProductSnapshots(sharedDatasets,snapshots,ctx,exec,indexes);
 const resolve=(id,key)=>fieldAliases.get(id)?.get(key)??key;
 const panels=Array.isArray(plan.panels)?plan.panels.map(panel=>{
  const mapped=mapWorkbenchPanelFields(panel,resolve),fields=prototypeFields.get(mapped?.view?.dataset);
  if(!fields)return mapped;
  const source=sharedDatasets.find(dataset=>dataset.id===mapped.view.dataset);
  const {unit,...layout}=mapped.view;
  const retainsUnit=mapped.type!=='view'||layout.variant!==undefined||unit!==undefined&&!source.fields.some(field=>field.unit===unit);
  const view=retainsUnit?mapped.view:layout;
  if(view.variant&&view.sections?.length===1&&/^(?:产品|基金|证券|标的)$/u.test(view.sections[0]?.label??'')){
   const [section]=view.sections;
   const names=source.fields.filter(field=>/^(?:产品|基金|证券|标的)?名称$/u.test(field.label)&&
    source.records.every(row=>typeof row[field.key]==='string'&&row[field.key].trim())&&
    new Set(source.records.map(row=>row[field.key])).size===source.records.length);
   if(names.length===1&&!fields.all.includes(section.label))
    return {...mapped,view:{...view,sections:[{...section,label:names[0].key}]}};
  }
  const text=`${mapped?.title??''}\n${mapped?.prompt??''}`;
  if(!['view','table'].includes(mapped.type)||view.where?.length||view.sections?.length!==1||view.sections[0]?.kind!=='records'||
     !/(?:全市场|全部|全量|完整).{0,24}(?:明细|记录|列表|清单|产品)|(?:明细|列表|清单).{0,16}(?:全部|全量|完整)/u.test(text)||
     /(?:只|仅)(?:显示|展示|保留)|隐藏/u.test(text))return view===mapped.view?mapped:{...mapped,view};
  const declared=view.sections[0].fields;
  if(declared!==undefined&&(!Array.isArray(declared)||!declared.every(field=>fields.all.includes(field))))return view===mapped.view?mapped:{...mapped,view};
  return {...mapped,view:{...view,sections:[{...view.sections[0],fields:fields.visible}]}};
 }):plan.panels;
 return {...plan,sharedDatasets,panels};
}
