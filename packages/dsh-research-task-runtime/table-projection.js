const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const forbidden=new Set(['__proto__','constructor','prototype'])
const scalar=value=>value===null||typeof value==='string'||typeof value==='number'&&Number.isFinite(value)
const sameKeys=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key))
const selected=(value,depth=0)=>depth<=24&&object(value)&&(Object.hasOwn(value,'$path')||Object.hasOwn(value,'$each')||Object.values(value).some(child=>selected(child,depth+1)))||depth<=24&&Array.isArray(value)&&value.some(child=>selected(child,depth+1))

// A table cell has scalar cardinality. Compile that context into the existing
// selector language rather than asking a model to rewrite every source path.
// $single retains its original ambiguity check, filtering, order, units and
// missing-value handling; it never chooses among distinct source records.
export function normalizeTableScalarMapping(mapping){
 if(!(mapping?.type==='table'||mapping?.type==='market'&&['table','fund-holdings'].includes(mapping.variant))||!Array.isArray(mapping.columns))return mapping
 const keys=mapping.columns.map(c=>object(c)?c.key:undefined)
 const keyed=keys.length>0&&keys.every(k=>typeof k==='string'&&!forbidden.has(k))&&new Set(keys).size===keys.length
 const cell=value=>{
  if(!object(value)||typeof value.$each!=='string'||value.$single!==undefined&&value.$single!==true||value.$reduce!==undefined||value.$normalize!==undefined)return value
  let child=value.$map
  // A one-column row envelope inside an explicitly scalar cell carries no
  // additional business field. Real multi-field tuples stay invalid.
  if(Array.isArray(child)&&child.length===1)child=child[0]
  if(child!==undefined&&(!object(child)||!Object.hasOwn(child,'$path')&&!Object.hasOwn(child,'$calc')||child.$each!==undefined))return value
  if(child===undefined&&!Object.hasOwn(value,'$path'))return value
  return {...value,$single:true,...(child!==undefined?{$map:child}:{})}
 }
 const row=value=>{
  if(Array.isArray(value))return value.length===mapping.columns.length?value.map(cell):value
  if(keyed&&sameKeys(value,keys))return Object.fromEntries(keys.map(key=>[key,cell(value[key])]))
  if(object(value)&&Object.hasOwn(value,'$map'))return {...value,$map:row(value.$map)}
  return value
 }
 return {...mapping,rows:Array.isArray(mapping.rows)?mapping.rows.map(row):row(mapping.rows)}
}

// Report the actual cell before keyed-column normalization. Otherwise a valid
// {key,label} declaration is misleadingly blamed for a nested source value.
export function tableScalarCellIssue(data){
 if(!(data?.type==='table'||data?.type==='market'&&['table','fund-holdings'].includes(data.variant))||!Array.isArray(data.columns)||!Array.isArray(data.rows))return
 const keys=data.columns.map(c=>object(c)?c.key:undefined),keyed=keys.every(k=>typeof k==='string')
 for(const [i,row] of data.rows.entries()){
  const cells=Array.isArray(row)?row:keyed&&sameKeys(row,keys)?keys.map(k=>row[k]):undefined
  if(!cells||cells.length!==data.columns.length)continue
  const j=cells.findIndex(v=>!scalar(v));if(j<0)continue
  return `table.rows[${i}]${keyed?'.'+keys[j]:'['+j+']'} 的单元格必须是单值，实际为${Array.isArray(cells[j])?'列表':'对象'}；按真实标的、日期筛选并使用 $single:true，或改为完整明细表保留全部记录，不任取、合计或丢弃数值。`
 }
}

// A single explicit collection already produces the complete rows array.
// Remove only its redundant wrapper, never merge sources or flatten cells.
export function normalizeTableListMapping(mapping){
 if(!(mapping?.type==='table'||mapping?.type==='market'&&['table','fund-holdings'].includes(mapping.variant))||!Array.isArray(mapping.columns)||!Array.isArray(mapping.rows)||mapping.rows.length!==1)return mapping
 const rows=mapping.rows[0]
 if(!object(rows)||typeof rows.$each!=='string'||rows.$single===true||!Array.isArray(rows.$map)||rows.$map.length!==mapping.columns.length)return mapping
 return {...mapping,rows}
}

// These are shape projections, not new mapping operators. Keep every existing
// selector/conversion in its original scope and order by declared column keys.
function rowProjection(value,keys,depth=0){
 if(depth>24)return undefined
 if(Array.isArray(value))return value.length===keys.length?value:undefined
 if(!object(value))return undefined
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
 const positional=data.rows.length>0&&data.rows.every(Array.isArray)
 if(new Set(keys).size!==keys.length||data.rows.some(row=>positional?row.length!==keys.length||row.some(cell=>!scalar(cell)):!sameKeys(row,keys)||keys.some(key=>!scalar(row[key]))))return unchanged
 const rows=mapping===undefined?undefined:rowsProjection(mapping.rows,keys)
 if(mapping!==undefined&&rows===undefined)return unchanged
 return {data:{...data,columns:data.columns.map(column=>column.label),rows:data.rows.map(row=>positional?[...row]:keys.map(key=>row[key]))},mapping:mapping===undefined?undefined:{...mapping,columns:data.columns.map(column=>column.label),rows}}
}

// Some generators use an identity key map ({code:"code"}) as field shorthand.
// Accept only a complete keyed column declaration and observed scalar fields.
// Persist real selectors so refresh cannot later render literal field names.
export function normalizeIdentityTableMapping(mapping,select){
 if(!(mapping?.type==='table'||mapping?.type==='market'&&['table','fund-holdings'].includes(mapping.variant))||!Array.isArray(mapping.columns))return mapping
 const keys=mapping.columns.map(c=>object(c)?c.key:undefined),rows=mapping.rows
 if(!keys.length||keys.some(k=>typeof k!=='string'||!/^\w+$/.test(k)||forbidden.has(k))||new Set(keys).size!==keys.length||!object(rows)||rows.$each===undefined||!sameKeys(rows.$map,keys)||!keys.every(k=>rows.$map[k]===k))return mapping
 const observed=select({...rows,$map:{$path:''}})
 if(!Array.isArray(observed))throw Error('表格字段映射缺少真实列表')
 for(const key of keys)if(observed.some(row=>!object(row)||!Object.hasOwn(row,key)||!scalar(row[key])))throw Error('接口缺少可用表格字段：'+key)
 return {...mapping,rows:{...rows,$map:Object.fromEntries(keys.map(key=>[key,{$path:key}]))}}
}
