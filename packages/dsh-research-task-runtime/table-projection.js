const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const forbidden=new Set(['__proto__','constructor','prototype'])
const scalar=value=>value===null||typeof value==='string'||typeof value==='number'&&Number.isFinite(value)
const sameKeys=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key))
const selected=(value,depth=0)=>depth<=24&&object(value)&&(Object.hasOwn(value,'$path')||Object.hasOwn(value,'$each')||Object.values(value).some(child=>selected(child,depth+1)))||depth<=24&&Array.isArray(value)&&value.some(child=>selected(child,depth+1))

// These are shape projections, not new mapping operators. Keep every existing
// selector/conversion in its original scope and order by declared column keys.
function rowProjection(value,keys,depth=0){
 if(depth>24||!object(value))return undefined
 if(sameKeys(value,keys))return keys.map(key=>value[key])
 if(Object.hasOwn(value,'$map')){
  const child=rowProjection(value.$map,keys,depth+1)
  return child?{...value,$map:child}:undefined
 }
 return undefined
}
function rowsProjection(value,keys,depth=0){
 if(depth>24)return undefined
 if(Array.isArray(value)){
  const rows=value.map(row=>rowProjection(row,keys,depth+1))
  return rows.every(Boolean)?rows:undefined
 }
 if(!object(value))return undefined
 const each=value.$each??(Object.hasOwn(value,'$map')?value.$path:undefined)
 if(each!==undefined){
  const child=Object.hasOwn(value,'$map')?value.$map:{$path:value.$path??''}
  const projected=rowProjection(child,keys,depth+1)
  return projected?{...value,$map:projected}:undefined
 }
 if(Object.hasOwn(value,'$map')){
  const projected=rowsProjection(value.$map,keys,depth+1)
  return projected?{...value,$map:projected}:undefined
 }
 // A whole-row path has no explicit field projection. Synthesizing one would
 // silently discard future source keys that the original path would retain.
 return undefined
}

// Normalize only a lossless, explicitly keyed table. Unknown/missing keys,
// nested business cells and ambiguous column order stay invalid. When a mapping
// is supplied, its projection must normalize too: capacity proofs and persisted
// refresh recipes then use exactly the semantic shape that the renderer sees.
export function normalizeKeyedTableProjection(data,mapping){
 const unchanged={data,mapping}
 // A stored literal card has no source projection to normalize. Leave its
 // existing static rendering (including numeric types) and refresh comparison
 // untouched; source mappings and final artifact data share the projection.
 if(mapping!==undefined&&!selected(mapping.rows))return unchanged
 if(!(data?.type==='table'||data?.type==='market'&&['table','fund-holdings'].includes(data.variant))||!Array.isArray(data.columns)||!data.columns.length||!Array.isArray(data.rows))return unchanged
 if(data.columns.some(column=>!object(column)||Object.keys(column).some(key=>!['key','label'].includes(key))||typeof column.key!=='string'||!column.key.trim()||column.key.length>512||/[\u0000-\u001f]/u.test(column.key)||column.key.startsWith('$')||forbidden.has(column.key)||typeof column.label!=='string'||!column.label.trim()))return unchanged
 // Only explicit declarations can become a persisted canonical projection.
 // Materializing a dynamic column key/label once would freeze its future scope.
 if(mapping!==undefined&&(!Array.isArray(mapping.columns)||mapping.columns.length!==data.columns.length||mapping.columns.some((column,i)=>!object(column)||column.key!==data.columns[i].key||column.label!==data.columns[i].label)))return unchanged
 const keys=data.columns.map(column=>column.key)
 if(new Set(keys).size!==keys.length||data.rows.some(row=>!sameKeys(row,keys)||keys.some(key=>!scalar(row[key]))))return unchanged
 const rows=mapping===undefined?undefined:rowsProjection(mapping.rows,keys)
 if(mapping!==undefined&&rows===undefined)return unchanged
 return {data:{...data,columns:data.columns.map(column=>column.label),rows:data.rows.map(row=>keys.map(key=>row[key]))},mapping:mapping===undefined?undefined:{...mapping,columns:data.columns.map(column=>column.label),rows}}
}
