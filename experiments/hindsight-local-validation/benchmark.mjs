import {readFile,writeFile,appendFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {score,packEvidence,percentile} from './metrics.mjs'
import {MEMORY_BACKGROUND_INTRO} from '../../src/main/memory/retriever.ts'

const [command,output,label='rrf']=process.argv.slice(2)
if(!command||!output)throw Error('Usage: benchmark.mjs smoke|ingest|recall|probes|persistence OUTPUT [LABEL]')
await mkdir(output,{recursive:true})
const base='http://127.0.0.1:19077/v1/default/banks/'
const corpusText=await readFile(new URL('./corpus.json',import.meta.url),'utf8')
const corpus=JSON.parse(corpusText),rows=new Map(corpus.records.map(r=>[r.id,r]))
const hash=createHash('sha256').update(corpusText).digest('hex')
if(hash!=='73017f842f5ca6cfd4b24d1e91fc73800b6aa2a515333801b2ae85bbf516c961')throw Error('Frozen corpus changed')
const bank=owner=>(label==='rrf'?'ework-spike-':'ework-spike-'+label+'-')+owner
const ingestFile=label==='rrf'?'ingest':'ingest-'+label
const phase=name=>writeFile(output+'/phase.txt',name)
const save=(name,value)=>writeFile(output+'/'+name+'.json',JSON.stringify(value,null,2)+'\n')
async function api(path,body,method='POST',timeout=2000){
  const response=await fetch(base+path,{method,headers:{'content-type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout)})
  const value=await response.json()
  if(!response.ok)throw Error('HTTP '+response.status+': '+JSON.stringify(value).slice(0,1000))
  return value
}
async function retain(bankId,row){
  const start=performance.now()
  try{
    const response=await api(bankId+'/memories',{items:[{
      content:row.title+'\n'+row.content,document_id:row.id,
      timestamp:row.timestamp??'2026-10-20T09:00:00+08:00',
      context:'合成办公记忆验证。保留中文原意、人名、日期、数字和明确否定，不补充原文没有的事实。',
      metadata:{source_id:row.id,status:row.status??'active'},
      tags:[row.scope==='global'?'scope:global':'scope:'+row.projectId,'state:'+(row.status??'active')],
      update_mode:'replace'}],async:false},'POST',180000)
    if(response.success!==true)throw Error('Retain did not confirm success')
    return {id:row.id,latencyMs:performance.now()-start,response}
  }catch(e){return{id:row.id,latencyMs:performance.now()-start,error:String(e)}}
}
async function recall(q,bankId=bank(q.owner??'a'),timeout=2000){
  const start=performance.now()
  try{
    const raw=await api(bankId+'/memories/recall',{query:q.query,budget:'mid',max_tokens:4096,
      types:['world','experience'],query_timestamp:corpus.now,include:{entities:null},
      tags:['scope:global','scope:'+(q.projectId??'alpha')],tags_match:'any_strict'},'POST',timeout)
    const seen=new Set(),ids=[]
    for(const r of raw.results??[]){const id=r.document_id??r.metadata?.source_id;if(id&&!seen.has(id)){seen.add(id);ids.push(id)}}
    const governed=ids.filter(id=>{
      const r=rows.get(id)
      return r&&r.owner===(q.owner??'a')&&(r.scope==='global'||r.projectId===(q.projectId??'alpha'))
        &&(q.mode==='history'||(r.status??'active')==='active')
    })
    const packed=packEvidence(governed.map(id=>rows.get(id)),1200,MEMORY_BACKGROUND_INTRO)
    return {id:q.id,ids,governed,packed,latencyMs:performance.now()-start,raw}
  }catch(e){return{id:q.id,ids:[],governed:[],packed:{ids:[]},latencyMs:performance.now()-start,error:String(e)}}
}
async function concurrent(items,n,fn){
  let cursor=0;const out=[]
  await Promise.all(Array.from({length:n},async()=>{for(;;){const i=cursor++;if(i>=items.length)return;out[i]=await fn(items[i],i)}}))
  return out
}
function summarize(results){
  return {overall:score(corpus.queries,results),paraphrase:score(corpus.queries.filter(q=>q.category==='paraphrase'),
    results.filter(r=>corpus.queries.find(q=>q.id===r.id)?.category==='paraphrase')),
    governed:score(corpus.queries,results.map(r=>({...r,ids:r.governed}))),
    budget1200:score(corpus.queries,results.map(r=>({...r,ids:r.packed.ids}))),
    scopeLeaks:results.flatMap(r=>r.ids.filter(id=>{
      const row=rows.get(id),q=corpus.queries.find(q=>q.id===r.id)
      return !row||row.owner!==(q.owner??'a')||(row.scope!=='global'&&row.projectId!==(q.projectId??'alpha'))
    }).map(id=>({query:r.id,id})))}
}
if(command==='smoke'){
  await phase('smoke')
  const row={id:'smoke-01',title:'合成测试',content:'青鹭项目的验收会议定于每周二上午十点。',scope:'project',projectId:'alpha'}
  const write=await retain('ework-spike-smoke',row)
  const read=await recall({id:'smoke',query:'青鹭什么时候开验收会？'},'ework-spike-smoke',30000)
  await save('smoke',{write,read});console.log(JSON.stringify({write,readIds:read.ids,readError:read.error}))
}else if(command==='ingest'){
  await phase('ingest');const start=performance.now()
  const results=await concurrent(corpus.records,2,async row=>{
    const result=await retain(bank(row.owner),row)
    await appendFile(output+'/'+ingestFile+'.jsonl',JSON.stringify(result)+'\n')
    console.log(JSON.stringify({id:result.id,ms:Math.round(result.latencyMs),success:!result.error,error:result.error}))
    return result
  })
  await save(ingestFile,{corpusSha256:hash,elapsedMs:performance.now()-start,results,failures:results.filter(r=>r.error).length})
  await phase('idle')
}else if(command==='recall'){
  const ingestion=JSON.parse(await readFile(output+'/'+ingestFile+'.json','utf8'))
  if(ingestion.failures||ingestion.results.length!==corpus.records.length)throw Error('Incomplete ingestion; quality gate cannot pass')
  await phase('cold-recall');const cold=await recall(corpus.queries[0],undefined,30000)
  const rounds=[]
  for(let i=0;i<3;i++){
    await phase('recall-sequential')
    const results=[];for(const q of corpus.queries)results.push(await recall(q))
    rounds.push(results);console.log(JSON.stringify({round:i,...summarize(results).overall,detail:undefined}))
  }
  await phase('recall-concurrency-3')
  const parallel=await concurrent(corpus.queries,3,q=>recall(q))
  const latencies=rounds.flat().map(r=>r.latencyMs)
  const summary={label,corpusSha256:hash,configuration:{embedding:'multilingual-e5-small',reranker:'rrf',compact:label==='compact',
    bankIsolation:'one bank per owner',scopeIsolation:'strict tags',statusFilter:'host canonical row status',
    extraction:'GLM-5.3-Flash',observations:false},cold,quality:summarize(rounds[0]),
    warm:{samples:latencies.length,p50:percentile(latencies,.5),p95:percentile(latencies,.95),max:Math.max(...latencies),failures:rounds.flat().filter(r=>r.error).length},
    concurrent3:summarize(parallel),rounds,parallel}
  await save('hindsight-'+label,summary);await phase('idle')
}else if(command==='probes'){
  await phase('control-probes')
  const probe='ework-spike-deletion',row={id:'delete-01',title:'归档路径',content:'紫鹭测试项目归档目录名称为 violet-archive-47。',scope:'project',projectId:'alpha'}
  const query={id:'delete-probe',query:'紫鹭测试项目的归档目录叫什么？'}
  const write=await retain(probe,row),before=await recall(query,probe)
  const deleted=await api(probe+'/documents/delete-01',undefined,'DELETE')
  const after=await recall(query,probe)
  const restored=await retain(probe,row),afterRestore=await recall(query,probe)
  await api(probe+'/documents/delete-01',undefined,'DELETE')
  const final=await recall(query,probe)
  const result={write,before,deleted,after,restored,afterRestore,final,
    pass:!write.error&&!before.error&&before.ids.includes(row.id)&&!after.error&&!after.ids.includes(row.id)
      &&!restored.error&&!afterRestore.error&&afterRestore.ids.includes(row.id)&&!final.error&&!final.ids.includes(row.id)}
  await save(label==='rrf'?'control-probes':'control-probes-'+label,result);console.log(JSON.stringify({deletionAndRestorePass:result.pass}));await phase('idle')
}else if(command==='persistence'){
  const persisted=await recall(corpus.queries[0],undefined,30000)
  const deleted=await recall({id:'delete-restart',query:'紫鹭测试项目的归档目录叫什么？'},'ework-spike-deletion',30000)
  await save(label==='rrf'?'persistence':'persistence-'+label,{persisted,deleted,pass:!persisted.error&&persisted.ids.includes(corpus.queries[0].expected[0])&&!deleted.error&&!deleted.ids.includes('delete-01')})
}else throw Error('Unknown command')
