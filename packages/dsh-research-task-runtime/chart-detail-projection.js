import {isDeepStrictEqual} from 'node:util'

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const scopeKeys=new Set(['$from','$each','$filter','$sortBy','$order','$take','$map'])
// Labels and auxiliary cells may describe different fields of the same row.
// Prove that relationship from the selectors, never from equal array lengths
// or coincidentally equal values. Persist this projection for future refreshes.
export function normalizeChartDetailMapping(mapping){
 if(mapping?.type!=='chart'||!Array.isArray(mapping.detailColumns))return mapping
 const labels=mapping.labels,rows=mapping.detailRows
 const list=value=>object(value)&&typeof value.$from==='string'&&typeof value.$each==='string'&&Object.keys(value).every(key=>scopeKeys.has(key))
 if(!list(labels)||!list(rows)||!object(labels.$map)||typeof labels.$map.$path!=='string'||Object.keys(labels.$map).some(key=>key!=='$path')||!Array.isArray(rows.$map)||rows.$map.length!==mapping.detailColumns.length)return mapping
 const {$map:label,...labelScope}=labels,{$map:cells,...rowScope}=rows
 if(!isDeepStrictEqual(labelScope,rowScope))return mapping
 const index=cells.findIndex(cell=>isDeepStrictEqual(cell,label))
 if(index===0)return mapping
 const order=index<0?cells.map((_,i)=>i):[index,...cells.map((_,i)=>i).filter(i=>i!==index)]
 return {...mapping,
  detailColumns:index<0?['项目',...mapping.detailColumns]:order.map(i=>mapping.detailColumns[i]),
  detailRows:{...rows,$map:index<0?[label,...cells]:order.map(i=>cells[i])}}
}
