export function percentile(values, p) {
  if (!values.length) return null
  const sorted=[...values].sort((a,b)=>a-b)
  return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]
}
export function packEvidence(rows, maxBytes=1200, intro='') {
  let text=intro
  const ids=[]
  for(const row of rows){
    const block=`[${row.id}] ${row.title}\n${row.content}\n\n`
    if(Buffer.byteLength(text+block,'utf8')>maxBytes) continue
    text+=block;ids.push(row.id)
  }
  return {ids,text,bytes:Buffer.byteLength(text,'utf8')}
}
export function score(queries,results,limit=5) {
  const byId=new Map(results.map(r=>[r.id,r]))
  let positives=0,complete=0,partial=0,reciprocal=0,negative=0,falsePositive=0,failures=0,forbidden=0
  const detail=[]
  for(const q of queries){
    const r=byId.get(q.id), failed=!r||!!r.error, ids=failed?[]:[...new Set(r.ids)].slice(0,limit)
    if(failed)failures++
    const hits=q.expected.filter(id=>ids.includes(id)),bad=(q.forbidden??[]).filter(id=>ids.includes(id))
    forbidden+=bad.length
    if(q.expected.length){positives++;if(!failed&&hits.length===q.expected.length)complete++;partial+=hits.length/q.expected.length;const rank=ids.findIndex(id=>q.expected.includes(id));if(rank>=0)reciprocal+=1/(rank+1)}
    else {negative++;if(ids.length)falsePositive++}
    detail.push({id:q.id,category:q.category,expected:q.expected,ids,hits,forbidden:bad,failed,complete:!failed&&hits.length===q.expected.length&&(q.expected.length>0||ids.length===0)})
  }
  const latencies=results.map(r=>r.latencyMs).filter(Number.isFinite)
  return {queries:queries.length,positives,negatives:negative,completeHits:complete,completeHitRate:positives?complete/positives:null,meanEvidenceRecall:positives?partial/positives:null,mrr:positives?reciprocal/positives:null,negativeFalsePositiveRate:negative?falsePositive/negative:null,failures,forbiddenHits:forbidden,latencyMs:{samples:latencies.length,p50:percentile(latencies,.5),p95:percentile(latencies,.95),max:latencies.length?Math.max(...latencies):null},detail}
}
// A byte budget already limits the supplied evidence. Do not impose a second,
// unrelated top-k cut on a context that may legitimately contain more sources.
export function scoreEvidenceBudget(queries,results) {
  return score(queries,results.map(r=>({...r,ids:r.packed?.ids??[],
    error:r.error??(!r.packed?'missing packed evidence':undefined)})),Infinity)
}
