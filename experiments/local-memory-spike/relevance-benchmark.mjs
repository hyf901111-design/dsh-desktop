import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {MemoryIndex,createEmbedder,INTRO} from './engine.mjs'
import {createReranker,selectRelevant} from './relevance.mjs'
import {score,scoreEvidenceBudget,packEvidence} from '../hindsight-local-validation/metrics.mjs'

const [output,runtime,embeddingModel,rerankerModel,priorInput]=process.argv.slice(2)
if(!priorInput)throw Error('Usage: relevance-benchmark OUTPUT RUNTIME EMBEDDING_MODEL RERANKER_MODEL PRIOR_INPUT')
await mkdir(output,{recursive:true})
const read=async path=>JSON.parse(await readFile(path,'utf8'))
const original=await read(new URL('../hindsight-local-validation/corpus.json',import.meta.url))
const heldout=await read(new URL('../hindsight-backend-validation/heldout.json',import.meta.url))
const raw=await readFile(new URL('./answerability-heldout.json',import.meta.url))
if(createHash('sha256').update(raw).digest('hex')!=='4b46b360bd67cf8d51916ca7cc7864e88736ad67dab039ea61a070d2d9683ce7')throw Error('Frozen holdout changed')
const extra=JSON.parse(raw),prior=await read(priorInput)
const rows=[...prior.rows,...prior.distractors,...extra.records.map(r=>({...r,owner:'a',scope:'project',projectId:'delta',kind:'background'}))]
const embedder=await createEmbedder(runtime,embeddingModel),reranker=await createReranker(runtime,rerankerModel)
const indexes={a:new MemoryIndex(runtime,'a',['alpha','beta','gamma','delta']),b:new MemoryIndex(runtime,'b',['alpha'])}
const now=Date.parse(original.now)
const report={model:'cross-encoder/mmarco-mMiniLMv2-L12-H384-v1',threshold:null,calibration:[],holdout:[],decision:'NOT_RUN'}
async function query(q){
 const start=performance.now(),index=indexes[q.owner??'a'],options={projectId:q.projectId??'alpha',mode:q.mode??'current',now},vector=await embedder.embed(q.query)
 const sem=index.search(q.query,vector,{...options,strategy:'semantic'}),lex=index.search(q.query,vector,{...options,strategy:'lexical'})
 const pool=[...new Map([...sem.candidates,...lex.candidates].map(x=>[x.row.id,x])).values()]
 const candidates=[]
 for(const item of pool){const result=await reranker.score(q.query,item.row.title+'\n'+item.row.content);candidates.push({...item.row,...result})}
 return {id:q.id,candidates,latencyMs:performance.now()-start}
}
function evaluate(queries,results,threshold){
 const gated=results.map(r=>{const selected=selectRelevant(r.candidates,threshold);return {...r,ids:selected.map(x=>x.id),packed:packEvidence(selected,1200,INTRO)}})
 return {top5:score(queries,gated),budget:scoreEvidenceBudget(queries,gated),results:gated}
}
try{
 for(const row of rows)indexes[row.owner].put(row,await embedder.embed(row.title+'\n'+row.content,'passage'))
 for(const q of original.queries)report.calibration.push(await query(q))
 for(let t=0;t<=100;t++){
  const threshold=t/100,result=evaluate(original.queries,report.calibration,threshold)
  if(result.top5.negativeFalsePositiveRate===0&&result.top5.completeHitRate>=.9&&result.budget.completeHitRate>=.9){report.threshold=threshold;report.calibrationResult=result;break}
 }
 if(report.threshold===null){
  report.decision='CALIBRATION_NO_GO'
  report.sweep=[.1,.3,.5,.7,.8,.9,.95,.99].map(t=>({threshold:t,...evaluate(original.queries,report.calibration,t).top5,detail:undefined}))
 }else{
  await writeFile(join(output,'frozen-threshold.json'),JSON.stringify({threshold:report.threshold,chosenFrom:'original 46 only',createdAt:new Date().toISOString()}))
  const questions=[...heldout.queries.map(q=>({...q,owner:'a',projectId:'gamma'})),...extra.queries.map(q=>({...q,owner:'a',projectId:'delta'}))]
  for(const q of questions)report.holdout.push(await query(q))
  report.holdoutResult=evaluate(questions,report.holdout,report.threshold)
  report.decision=report.holdoutResult.top5.negativeFalsePositiveRate===0&&report.holdoutResult.top5.completeHitRate>=.9&&report.holdoutResult.budget.completeHitRate>=.9?'PASS':'HOLDOUT_NO_GO'
 }
 await writeFile(join(output,'relevance-results.json'),JSON.stringify(report,null,2))
 console.log(JSON.stringify({decision:report.decision,threshold:report.threshold,calibration:report.calibrationResult?.top5,holdout:report.holdoutResult?.top5,sweep:report.sweep},null,2))
}finally{for(const index of Object.values(indexes))index.close();await embedder.close();await reranker.close()}
