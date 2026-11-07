import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import YAML from 'yaml'
import {MemoryIndex,createEmbedder} from './engine.mjs'
import {evidenceInput,selectEvidence,packMemoryEvidence,EVIDENCE_PROMPT} from '../../packages/dsh-memory-runtime/evidence.js'
import {score,scoreEvidenceBudget} from '../hindsight-local-validation/metrics.mjs'

const [output,runtime,model,priorInput,credentialFile]=process.argv.slice(2)
if(!credentialFile)throw Error('Usage: evidence-benchmark OUTPUT RUNTIME MODEL PRIOR_INPUT CREDENTIAL_FILE')
await mkdir(output,{recursive:true})
const read=async path=>JSON.parse(await readFile(path,'utf8'))
const credential=YAML.parse(await readFile(credentialFile,'utf8')).ZAI_API_KEY
if(typeof credential!=='string'||!credential)throw Error('Missing configured model credential')
const original=await read(new URL('../hindsight-local-validation/corpus.json',import.meta.url)),heldout=await read(new URL('../hindsight-backend-validation/heldout.json',import.meta.url)),prior=await read(priorInput)
const raw=await readFile(new URL('./answerability-heldout.json',import.meta.url))
if(createHash('sha256').update(raw).digest('hex')!=='4b46b360bd67cf8d51916ca7cc7864e88736ad67dab039ea61a070d2d9683ce7')throw Error('Frozen holdout changed')
const extra=JSON.parse(raw),now=Date.parse(original.now)
const records=[...prior.rows,...prior.distractors,...extra.records.map(r=>({...r,owner:'a',scope:'project',projectId:'delta',kind:'background'}))]
const queries=[...original.queries.map(q=>({owner:'a',projectId:'alpha',...q})),...heldout.queries.map(q=>({...q,owner:'a',projectId:'gamma'})),...extra.queries.map(q=>({...q,owner:'a',projectId:'delta'}))]
const embedder=await createEmbedder(runtime,model),indexes={a:new MemoryIndex(runtime,'a',['alpha','beta','gamma','delta']),b:new MemoryIndex(runtime,'b',['alpha'])}
const results=[],requests=[]
try{
 for(const row of records)indexes[row.owner].put(row,await embedder.embed(row.title+'\n'+row.content,'passage'))
 for(const q of queries){
  const index=indexes[q.owner],options={projectId:q.projectId,mode:q.mode??'current',now},vector=await embedder.embed(q.query)
  const semantic=index.search(q.query,vector,{...options,strategy:'semantic'}),lexical=index.search(q.query,vector,{...options,strategy:'lexical'})
  const candidates=[...new Map([...semantic.candidates.slice(0,15),...lexical.candidates.slice(0,15)].map(x=>[x.row.id,{...x.row,revision:1,reason:'相关候选'}])).values()]
  requests.push({q,input:evidenceInput(q.query,candidates)})
 }
 let next=0
 await Promise.all(Array.from({length:3},async()=>{
  while(next<requests.length){
   const {q,input}=requests[next++],start=performance.now()
   let result
   try{
    const response=await fetch('https://api.z.ai/api/coding/paas/v4/chat/completions',{method:'POST',headers:{authorization:`Bearer ${credential}`,'content-type':'application/json'},body:JSON.stringify({model:'GLM-5.3-Flash',messages:[{role:'system',content:EVIDENCE_PROMPT},{role:'user',content:JSON.stringify({query:input.query,memories:input.memories})}],temperature:0,max_tokens:2000,thinking:{type:'enabled'},reasoning_effort:'low'}),signal:AbortSignal.timeout(8000)})
    if(!response.ok)throw Error(`model HTTP ${response.status}`)
    const responseData=await response.json(),raw=responseData.choices?.[0]?.message?.content
    if(responseData.choices?.[0]?.finish_reason!=='stop')throw Error('model did not finish normally')
    const selected=selectEvidence(raw,input),packed=packMemoryEvidence(selected)
    result={id:q.id,ids:selected.map(x=>x.id),packed:{ids:packed.entries.map(x=>x.id),text:packed.block,bytes:Buffer.byteLength(packed.block)},raw,usage:responseData.usage,candidates:input.memories,latencyMs:performance.now()-start}
   }catch(error){result={id:q.id,error:error.message,ids:[],packed:{ids:[],text:'',bytes:0},latencyMs:performance.now()-start}}
   results.push(result)
   if(results.length%10===0)console.log(JSON.stringify({completed:results.length,total:queries.length}))
  }
 }))
 const summary=subset=>{const selected=results.filter(r=>subset.some(q=>q.id===r.id));return {top5:score(subset,selected),budget:scoreEvidenceBudget(subset,selected)}}
 const report={model:'configured zai/GLM-5.3-Flash',reasoning:'low',maxTokens:2000,deadlineMs:8000,promptSha256:createHash('sha256').update(EVIDENCE_PROMPT).digest('hex'),original:summary(queries.slice(0,46)),holdout:summary(queries.slice(46)),results}
 report.pass=report.original.top5.completeHitRate>=.9&&report.original.top5.negativeFalsePositiveRate===0&&report.holdout.top5.completeHitRate>=.9&&report.holdout.top5.negativeFalsePositiveRate===0&&report.original.top5.failures===0&&report.holdout.top5.failures===0
 await writeFile(join(output,'evidence-results.json'),JSON.stringify(report,null,2))
 console.log(JSON.stringify({pass:report.pass,original:{hit:report.original.top5.completeHitRate,unknownFalseUse:report.original.top5.negativeFalsePositiveRate,failures:report.original.top5.failures},holdout:{hit:report.holdout.top5.completeHitRate,unknownFalseUse:report.holdout.top5.negativeFalsePositiveRate,failures:report.holdout.top5.failures},latency:report.holdout.top5.latencyMs}))
}finally{for(const index of Object.values(indexes))index.close();await embedder.close()}
