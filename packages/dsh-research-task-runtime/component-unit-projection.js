// Convert only direct measurements whose units are explicitly declared by the
// matched business response. Labels, magnitudes and model prose are not evidence.
const units={元:['money',1],万元:['money',1e4],亿元:['money',1e8],万亿元:['money',1e12],股:['shares',1],万股:['shares',1e4],亿股:['shares',1e8],份:['units',1],万份:['units',1e4],亿份:['units',1e8],'%':['percent',1]}
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
function fieldUnit(info){
 if(typeof info!=='string')return undefined
 const found=[...info.matchAll(/[（(]\s*(元|万元|亿元|万亿元|股|万股|亿股|份|万份|亿份|%)\s*[）)]/gu)].map(match=>match[1])
 return found.length===1?found[0]:undefined
}
function directMeasurement(selector,context,sources){
 const chain=[];let node=selector,key=context.key,prefix=context.prefix??''
 while(object(node)&&chain.length<12){
  if(Object.keys(node).some(k=>!['$from','$path','$each','$map','$filter','$sortBy','$order','$take','$single','$optional','$as','$scale','$digits','$reduce'].includes(k)))return null
  if(node.$reduce!==undefined&&!['first','last','sum','mean','min','max'].includes(node.$reduce))return null
  if(node.$from!==undefined){key=node.$from;prefix=''}
  chain.push(node)
  if(node.$each!==undefined){prefix=[prefix,node.$each].filter(Boolean).join('.');if(!node.$map&&node.$path){prefix+='.[$row]';break}prefix+='.[$row]'}
  if(!node.$map)break
  if(node.$each===undefined&&node.$path!==undefined)prefix=[prefix,node.$path].filter(Boolean).join('.')
  node=node.$map
 }
 if(!object(node)||node.$map||typeof node.$path!=='string')return null
 const path=[prefix,node.$path].filter(Boolean).join('.').replace(/\[(\d+)\]/gu,'.$1')
 const match=/^records\.(?:\[\$row\]|\d+)\.([A-Za-z][\w]*)$/u.exec(path),response=sources.get(key)
 if(!match||!response)return null
 const field=match[1],unit=fieldUnit(response.fieldInfo?.[field])
 // Numeric strings and missing values retain their existing interpretation.
 if(!unit||!Array.isArray(response.records)||!response.records.some(row=>typeof row?.[field]==='number')||response.records.some(row=>row?.[field]!=null&&typeof row[field]!=='number'))return null
 return {chain,unit,field}
}
export function normalizeObservedUnitMapping(mapping,metadata,evaluate){
 const sources=new Map((metadata?.matched??[]).filter(({response})=>response.source==='Tushare'&&object(response.fieldInfo)).map(source=>[source.key,source.response]))
 if(!sources.size)return mapping
 let nodes=0
 const convert=(selector,unit,context)=>{
  let target;try{target=typeof unit==='string'?unit:evaluate(unit)}catch{return selector}
  if(!Object.hasOwn(units,target))return selector
  const measured=directMeasurement(selector,context,sources)
  if(!measured)return selector
  const [dimension,base]=units[measured.unit],[targetDimension,targetBase]=units[target]
  if(dimension!==targetDimension)throw Error(`字段 ${measured.field} 的来源单位是${measured.unit}，不能标为${target}；请保留实际量纲，无需重新取数。`)
  const factor=measured.chain.reduce((n,part)=>n*(part.$scale??1),1),expected=base/targetBase
  if(!Number.isFinite(factor)||factor<=0||Math.abs(factor-expected)<=expected*1e-12)return selector
  // Correct the direct unit conversion before rounding, preserving the exact
  // selector/filter/order and all source values. Persist this recipe for refresh.
  const replace=index=>{
   const {$scale,...part}=measured.chain[index]
   return index===measured.chain.length-1?{...part,$scale:expected}:{...part,$map:replace(index+1)}
  }
  return replace(0)
 }
 const visit=(value,context={},depth=0)=>{
  if(depth>24||++nodes>30000)throw Error('字段映射超出限制')
  if(Array.isArray(value))return value.map(child=>visit(child,context,depth+1))
  if(!object(value))return value
  let scope=context
  if(typeof value.$from==='string')scope={key:value.$from,prefix:''}
  const result={...value}
  if(Object.hasOwn(value,'value')&&Object.hasOwn(value,'unit'))result.value=convert(value.value,value.unit,scope)
  if(Object.hasOwn(value,'values')&&Object.hasOwn(value,'unit'))result.values=convert(value.values,value.unit,scope)
  for(const [key,child]of Object.entries(result)){
   let childScope=scope
   if(key==='$map'&&typeof value.$each==='string')childScope={...scope,prefix:[scope.prefix,value.$each,'[$row]'].filter(Boolean).join('.')}
   result[key]=visit(child,childScope,depth+1)
  }
  return result
 }
 let result=visit(mapping)
 if(result.type==='chart'&&Array.isArray(result.series)&&result.unit)result={...result,series:result.series.map(series=>({...series,values:convert(series.values,series.unit??result.unit,{})}))}
 return result
}
