import {readFile,writeFile} from 'node:fs/promises'
import {MemoryRetriever} from '../../src/main/memory/retriever.ts'
const output=process.argv[2]
if(!output)throw Error('Pass evidence directory; stop the isolated service first')
const corpus=JSON.parse(await readFile(new URL('./corpus.json',import.meta.url),'utf8'))
const q=corpus.queries[0],start=performance.now()
let failure
try{
  const response=await fetch('http://127.0.0.1:19077/health/ready',{signal:AbortSignal.timeout(2000)})
  if(response.ok)throw Error('SERVICE_STILL_RUNNING')
  failure='HTTP '+response.status
}catch(e){if(e.message==='SERVICE_STILL_RUNNING')throw e;failure=e.cause?.code??e.name}
const detectedMs=performance.now()-start,now=Date.parse(corpus.now)
const rows=corpus.records.filter(r=>r.owner==='a').map(r=>({...r,status:r.status??'active',
  semanticKey:r.id,revision:1,manualLocked:false,pinned:false,createdAt:now,lastConfirmedAt:now,updatedAt:now,sources:[]}))
const retriever=new MemoryRetriever()
const ids=retriever.select(rows,q.query,'alpha',now).map(x=>x.row.id)
retriever.close()
const result={failure,detectedMs,totalMs:performance.now()-start,fallbackIds:ids,
  pass:q.expected.every(id=>ids.includes(id)),limitation:'Harness-only fallback; product runtime is unchanged'}
await writeFile(output+'/fault-probe.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result))
