import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {MemoryRetriever,MEMORY_BACKGROUND_INTRO} from '../../src/main/memory/retriever.ts'
import {score,packEvidence,scoreEvidenceBudget} from './metrics.mjs'
const file=new URL('./corpus.json',import.meta.url),raw=await readFile(file,'utf8'),corpus=JSON.parse(raw)
const output=process.argv[2];if(!output)throw Error('Pass an explicit output directory')
await mkdir(output,{recursive:true})
const now=Date.parse(corpus.now)
const rows=corpus.records.map(r=>({...r,status:r.status??'active',semanticKey:r.id,revision:1,manualLocked:false,pinned:false,createdAt:Date.parse(r.timestamp??'2026-10-20T09:00:00+08:00'),lastConfirmedAt:Date.parse(r.timestamp??'2026-10-20T09:00:00+08:00'),updatedAt:now,sources:[]}))
const results=[],retriever=new MemoryRetriever()
for(const q of corpus.queries){
  const t=performance.now(),selected=retriever.select(rows.filter(r=>r.owner===(q.owner??'a')),q.query,q.projectId??'alpha',now)
  const ids=selected.map(x=>x.row.id)
  results.push({id:q.id,ids,latencyMs:performance.now()-t,packed:packEvidence(selected.map(x=>x.row),1200,MEMORY_BACKGROUND_INTRO)})
}
retriever.close()
const summary={baseline:'unmodified MemoryRetriever from main 9035f11cf',corpusSha256:createHash('sha256').update(raw).digest('hex'),records:rows.length,overall:score(corpus.queries,results),paraphrase:score(corpus.queries.filter(q=>q.category==='paraphrase'),results.filter(r=>corpus.queries.find(q=>q.id===r.id)?.category==='paraphrase')),budget1200:scoreEvidenceBudget(corpus.queries,results),results}
await writeFile(output+'/baseline.json',JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify({corpusSha256:summary.corpusSha256,records:rows.length,queries:corpus.queries.length,completeHitRate:summary.overall.completeHitRate,paraphraseHitRate:summary.paraphrase.completeHitRate,negativeFalsePositiveRate:summary.overall.negativeFalsePositiveRate}))
