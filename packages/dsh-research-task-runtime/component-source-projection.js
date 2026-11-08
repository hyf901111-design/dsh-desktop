import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'

const KEY='__eworkEvidenceProjection',FORMAT='ework-lossless-records-1',MAX_BYTES=2_000_000
const NOTE='这是仅供模型读取的无损传输格式，不展示传输说明于组件。data 的每行先合并 defaults，再按 textReferences 的 [字段,文本索引,行索引列表] 补回 texts 中的原文，即为完整原始记录；缺失字段仍缺失，所有行均保留。宿主保存完整原始响应，字段映射仍使用原始 data[].字段路径，不映射本元数据。Lossless presentation only; original source paths and every row/field are unchanged.'
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
function ordered(value,depth=0){
 if(depth>32)throw Error('业务响应嵌套过深')
 if(Array.isArray(value))return value.map(item=>ordered(item,depth+1))
 return object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key],depth+1)])):value
}
const digest=value=>createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex')
const rows=value=>Array.isArray(value)&&value.length>=4&&value.length<=10000&&value.every(row=>object(row)&&Object.keys(row).length<=512)

// Factor repeated fields without selecting rows or limiting the set of metrics.
// The original canonical tool value is never replaced. A checksum lets durable
// source readers restore the exact JSON values instead of treating deltas as data.
export function compactBusinessEvidence(data){
 try{
  if(!object(data)||data.retCode!==1||Object.hasOwn(data,KEY)||!rows(data.data))return
  const original=JSON.stringify(data),bytes=Buffer.byteLength(original)
  if(bytes<8000||bytes>MAX_BYTES)return
  const defaults=Object.fromEntries(Object.entries(data.data[0]).filter(([key,value])=>data.data.every(row=>Object.hasOwn(row,key)&&isDeepStrictEqual(row[key],value))))
  const projected=data.data.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!Object.hasOwn(defaults,key))))
  const groups=new Map()
  for(const [index,row] of projected.entries())for(const [field,value] of Object.entries(row)){
   if(typeof value!=='string'||Buffer.byteLength(value)<120)continue
   if(!groups.has(field))groups.set(field,new Map())
   const values=groups.get(field)
   if(!values.has(value))values.set(value,[])
   values.get(value).push(index)
  }
  const texts=[],textIds=new Map(),textReferences=[]
  for(const [field,values] of groups)for(const [text,indices] of values){
   if(indices.length<2)continue
   if(!textIds.has(text)){textIds.set(text,texts.length);texts.push(text)}
   textReferences.push([field,textIds.get(text),indices])
   for(const index of indices)delete projected[index][field]
  }
  const result={...data,data:projected,[KEY]:{format:FORMAT,rowCount:projected.length,defaults,texts,textReferences,originalSha256:digest(data),note:NOTE}}
  const projectedBytes=Buffer.byteLength(JSON.stringify(result))
  // Stay below the existing generic spill cap, with useful savings. Otherwise
  // leave the original pipeline and its existing limits entirely unchanged.
  if(projectedBytes>48000||projectedBytes>bytes*.8)return
  expandBusinessEvidence(result)
  return result
 }catch{return}
}

export function expandBusinessEvidence(data){
 const meta=data?.[KEY]
 if(!object(meta)||!String(meta.format??'').startsWith('ework-lossless-'))return data
 const invalid=()=>{throw Error('无损业务响应投影无效，不能作为原始数据')}
 if(meta.format!==FORMAT||data.retCode!==1||!rows(data.data)||meta.rowCount!==data.data.length||!object(meta.defaults)||Object.keys(meta.defaults).length>512||!Array.isArray(meta.texts)||meta.texts.length>10000||!meta.texts.every(value=>typeof value==='string')||!Array.isArray(meta.textReferences)||meta.textReferences.length>10000||typeof meta.originalSha256!=='string'||!/^[a-f0-9]{64}$/u.test(meta.originalSha256)||meta.note!==NOTE)invalid()
 // Bound reconstruction before combining repeated values. A tiny forged
 // packet must not allocate gigabytes merely to fail its checksum afterwards.
 const capacity=()=>{throw Error('还原后的业务响应超出组件容量')}
 let expandedBytes=Buffer.byteLength(JSON.stringify({...data,[KEY]:undefined}))+Buffer.byteLength(JSON.stringify(meta.defaults))*data.data.length
 if(expandedBytes>MAX_BYTES)capacity()
 for(const entry of meta.textReferences){
  if(!Array.isArray(entry)||entry.length!==3)invalid()
  const [field,text,indices]=entry
  if(typeof field!=='string'||!Number.isInteger(text)||text<0||text>=meta.texts.length||!Array.isArray(indices)||indices.length<2||indices.length>data.data.length)invalid()
  expandedBytes+=indices.length*Buffer.byteLength(JSON.stringify({[field]:meta.texts[text]}))
  if(expandedBytes>MAX_BYTES)capacity()
 }
 const restored=data.data.map(row=>{
  if(Object.keys(meta.defaults).some(key=>Object.hasOwn(row,key)))invalid()
  return {...meta.defaults,...row}
 })
 for(const entry of meta.textReferences){
  if(!Array.isArray(entry)||entry.length!==3)invalid()
  const [field,text,indices]=entry
  if(typeof field!=='string'||!Number.isInteger(text)||text<0||text>=meta.texts.length||!Array.isArray(indices)||indices.length<2||indices.length>restored.length)invalid()
  for(const index of indices){
   if(!Number.isInteger(index)||index<0||index>=restored.length||Object.hasOwn(restored[index],field))invalid()
   // Define an own JSON property; source column names never set prototypes.
   Object.defineProperty(restored[index],field,{value:meta.texts[text],enumerable:true,writable:true,configurable:true})
  }
 }
 const result={...data,data:restored};delete result[KEY]
 if(Buffer.byteLength(JSON.stringify(result))>MAX_BYTES||digest(result)!==meta.originalSha256)invalid()
 return result
}

export function registerComponentSourceProjection(ctx,{child,allowed=[],discoveryTools=new Set(),signal,onWebResponse}={}){
 if(typeof ctx.tools?.execute!=='function'||typeof ctx.on!=='function')return ()=>{}
 let disposed=false
 const off=ctx.on('tools/post-execute',async(exec,result,next)=>{
  const decision=await next()
  if(disposed||signal?.aborted||exec.signal?.aborted||exec.agent!==child||exec.parent!==undefined||!(exec.name?.startsWith('ework__')||exec.name==='web_fetch')||!allowed.includes(exec.name)||discoveryTools.has(exec.name)||result.isError||decision.kind!=='accept'||Object.hasOwn(decision,'value'))return decision
  const content=decision.content??result.content
  if(!Array.isArray(content)||!content.length||!content.every(block=>block.type==='text'&&typeof block.text==='string'))return decision
  // Only reshape text the tool/policies already intended for the model; hidden
  // canonical fields, attachments, failures and replacements stay untouched.
  const text=content.map(block=>block.text).join('\n')
  if(Buffer.byteLength(text)>MAX_BYTES)return decision
  // Capture only the policy-approved rendered response, before generic spill
  // replaces it with a head/tail excerpt. Never read a model-supplied spill path
  // or resurrect hidden canonical fields. The model's existing budget is intact.
  if(exec.name==='web_fetch'){
   onWebResponse?.(exec.arguments,text)
   return decision
  }
  try{
   const projected=compactBusinessEvidence(JSON.parse(text))
   if(projected)return {...decision,content:[{type:'text',text:JSON.stringify(projected)}]}
  }catch{}
  return decision
 })
 return ()=>{if(disposed)return;disposed=true;off()}
}
