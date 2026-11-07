import {readFile,writeFile,readdir} from 'node:fs/promises'
import {percentile,scoreEvidenceBudget} from './metrics.mjs'
const [output,label='rrf']=process.argv.slice(2)
if(!output)throw Error('Usage: analyze.mjs EVIDENCE_DIRECTORY [LABEL]')
const json=async name=>JSON.parse(await readFile(output+'/'+name+'.json','utf8'))
const baseline=await json('baseline'),hindsight=await json('hindsight-'+label)
const corpus=JSON.parse(await readFile(new URL('./corpus.json',import.meta.url),'utf8'))
// Recompute derived coverage from raw evidence, including captures made before
// the separate byte-budget scorer was introduced.
baseline.budget1200=scoreEvidenceBudget(corpus.queries,baseline.results)
hindsight.quality.budget1200=scoreEvidenceBudget(corpus.queries,hindsight.rounds[0])
const allResults=[...hindsight.rounds.flat(),...hindsight.parallel]
const allScopeLeaks=allResults.flatMap(r=>{
  const q=corpus.queries.find(q=>q.id===r.id)
  return r.ids.filter(id=>{
    const row=corpus.records.find(row=>row.id===id)
    return !row||row.owner!==(q.owner??'a')||(row.scope!=='global'&&row.projectId!==(q.projectId??'alpha'))
  }).map(id=>({query:r.id,id}))
})
const probes=await json(label==='rrf'?'control-probes':'control-probes-'+label),persistence=await json(label==='rrf'?'persistence':'persistence-'+label),fault=await json('fault-probe')
const resources=[]
for(const name of await readdir(output)){
  if(!name.startsWith('resources-')||!name.endsWith('.jsonl'))continue
  if(label==='compact'?!name.startsWith('resources-compact'):name.startsWith('resources-compact'))continue
  const data=(await readFile(output+'/'+name,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)
  const phases={}
  for(const phase of new Set(data.map(r=>r.phase))){
    const samples=data.filter(r=>r.phase===phase),values=samples.map(r=>r.rssBytes/1048576)
    // CPU deltas only within adjacent samples, never across different phase intervals.
    let cpu=0,wall=0,cpuWall=0
    for(let i=1;i<data.length;i++)if(data[i].phase===phase&&data[i-1].phase===phase){
      const elapsed=data[i].elapsedSeconds-data[i-1].elapsedSeconds
      wall+=elapsed
      const delta=data[i].workloadCpuSeconds-data[i-1].workloadCpuSeconds
      if(delta>=0){cpu+=delta;cpuWall+=elapsed}
    }
    phases[phase]={samples:samples.length,rssMiB:{p50:percentile(values,.5),max:Math.max(...values)},
      cpuPercentOfOneCore:cpuWall?100*cpu/cpuWall:null,sampledSeconds:wall,cpuMeasuredSeconds:cpuWall}
  }
  resources.push({file:name,phases})
}
const idle=resources.flatMap(r=>r.phases.idle?[r.phases.idle]:[])
const workload=resources.flatMap(r=>Object.entries(r.phases).filter(([p])=>p!=='startup').map(([,s])=>s))
const startup=await json(label==='rrf'?'startup-cached-restart':'startup-compact-cached')
const improvement=hindsight.quality.paraphrase.completeHitRate-baseline.paraphrase.completeHitRate
const gates={
  recall90:hindsight.quality.overall.completeHitRate>=.9,
  paraphraseImprovement10pp:improvement>=.1,
  scopeIsolation:allScopeLeaks.length===0&&allResults.every(r=>!r.error),
  governedObsoleteExposure:hindsight.quality.governed.forbiddenHits===0,
  deletionAndPersistence:probes.pass&&persistence.pass,
  warmLatency:hindsight.warm.p50<=500&&hindsight.warm.p95<=1500&&hindsight.warm.failures===0,
  idleRSS:idle.length>0&&Math.max(...idle.map(x=>x.rssMiB.max))<=768,
  batchPeakRSS:workload.length>0&&Math.max(...workload.map(x=>x.rssMiB.max))<=1536,
  cachedRestart:startup.readySeconds<=15,
}
const result={label,decision:Object.values(gates).every(Boolean)?'PASS':'NO_GO',gates,
  baseline:{hitRate:baseline.overall.completeHitRate,paraphraseHitRate:baseline.paraphrase.completeHitRate,
    negativeFalsePositiveRate:baseline.overall.negativeFalsePositiveRate,budget1200HitRate:baseline.budget1200.completeHitRate},
  hindsight:{hitRate:hindsight.quality.overall.completeHitRate,paraphraseHitRate:hindsight.quality.paraphrase.completeHitRate,
    improvementPercentagePoints:100*improvement,budget1200HitRate:hindsight.quality.budget1200.completeHitRate,
    negativeFalsePositiveRate:hindsight.quality.overall.negativeFalsePositiveRate,
    obsoleteExposure:hindsight.quality.overall.forbiddenHits,governedObsoleteExposure:hindsight.quality.governed.forbiddenHits,
    warm:hindsight.warm,concurrent3:hindsight.concurrent3.overall.latencyMs},
  startup,resources,allScopeLeaks,controlProbesPass:probes.pass,persistencePass:persistence.pass,fault,
  limitations:['Synthetic 46-document corpus','Source retrieval, not final answer correctness',
    'No production app integration','No native multi-tenant authorization configured','RSS sums may double-count shared pages']}
await writeFile(output+'/decision-'+label+'.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({...result,resources:undefined},null,2))
