// Multi-object acquisition is bounded by explicit scope and actual progress.
// A row count, repeated request, empty success or catalog is not extra work
// earned. Grants, discovery limits and the 135s acquisition ceiling stay owned
// by the caller; this never retries a tool or selects a provider.
export function componentAcquisitionBudget(request=''){
 const matches=[...String(request).matchAll(/(?:至少|不少于|最少|比较|对比)\s*(\d{1,3})\s*(?:只|家|款|个(?:机构|企业|项目|产品|对象|实体))/gu)]
 const count=Math.max(0,...matches.map(match=>Number(match[1])).filter(n=>n>=3&&n<=16))
 const seen=new Set();let lastProgress=-Infinity
 return {inspect(records,{elapsed=0,knownDiscoveryUsed=false}={}){
  for(const record of records??[]){
   if(record.purpose==='discovery')continue
   const response=record.response
   const rows=response?.retCode===1?response.data:response?.records
   if(!Array.isArray(rows)||!rows.length)continue
   const key=JSON.stringify([record.tool,record.args])
   if(!seen.has(key)){seen.add(key);lastProgress=elapsed}
  }
  const extended=count&&knownDiscoveryUsed&&seen.size>0
  return {businessLimit:extended?Math.min(48,Math.max(12,count*3)):knownDiscoveryUsed?12:8,
   allowAfterDeadline:Boolean(extended&&elapsed<135000&&elapsed-lastProgress<=30000)}
 }}
}
