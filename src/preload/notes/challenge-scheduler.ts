import {challengeReviewAnchors,type ChallengeBlock,type ChallengeCheck,type ChallengeLevel,type ChallengeRequest,type ChallengeResult,type ChallengeReviewAnchor} from '../../shared/notes-challenge'

export const CHALLENGE_LEVELS=[
 {name:'关闭',description:'专注写作，暂停自动挑战',pause:0,interval:0,deep:0},
 {name:'宽松',description:'仅指出错别字及拼写错误',pause:5000,interval:10000,deep:600000},
 {name:'标准',description:'指出事实、逻辑、表达方面问题',pause:2500,interval:6000,deep:300000},
 {name:'严格',description:'深入检查证据、前提与推理',pause:2000,interval:4000,deep:180000},
 {name:'抬杠',description:'热衷质疑与追问，协助完善内容',pause:1500,interval:3000,deep:120000}
] as const
const inline=(value:any):string=>typeof value==='string'?value:Array.isArray(value)?value.map(inline).join(''):value&&typeof value==='object'?value.type==='hardBreak'?'\n':inline(value.text??value.content):''
export function challengeDocumentBlocks(blocks:any[]):ChallengeBlock[]{
 const result:ChallengeBlock[]=[]
 const visit=(items:any[],depth=0)=>{if(depth>32)return;for(const block of items){
  if(!block||['research','attachment'].includes(block.type))continue
  const text=Array.isArray(block.content?.rows)?block.content.rows.map((row:any)=>row.cells.map((cell:any)=>inline(cell.content??cell)).join('\t')).join('\n'):inline(block.content)
  if(typeof block.id==='string'&&text.trim())result.push({id:block.id,type:block.type,text})
  if(Array.isArray(block.children))visit(block.children,depth+1)
 }}
 visit(blocks);return result
}
export type ChallengeScheduleState={phase:'off'|'idle'|'waiting'|'running'|'paused'|'limited'|'failed';pending:number;checks:ChallengeCheck[]}
type DocumentInput={title:string;blocks:ChallengeBlock[];editingBlockId?:string;composing?:boolean;active?:boolean;busy?:boolean}
type Captured={key:string;blocks:ChallengeBlock[];title:string;level:ChallengeLevel}
type Usage={at:number;chars:number;input:number;output:number}
type Supplement={attempts:number;notBefore:number}
/** Private scheduling state; the controller persists the document key as a hash. */
export type ChallengeRetryState={version:1;key:string;level:ChallengeLevel;entries:Array<Supplement&{id:string;blocked:boolean}>;usage:Usage[]}
export type ChallengeUsageState={version:1;sessionId:string;usage:Usage[]}
const key=(value:{title:string;blocks:ChallengeBlock[]})=>JSON.stringify([value.title,value.blocks])
const MAX_CHARS=16000,MAX_BLOCK_CHARS=12000,MAX_BLOCKS=24,WINDOW=600000,MAX_SUPPLEMENTS=2
const researchMetadata=(block:ChallengeBlock)=>['paragraph','heading'].includes(block.type)&&(/\b\d{6}\.(?:SH|SZ|BJ)\b/iu.test(block.text)||/(?:^|[\n。；;])\s*(?:研究标的|股票代码|证券代码|报告基准日|报告发布日期|报告发布日|报告日期|基准日|模型日|预测截止日|一致预期偏离阈值|一致预期统计周期)\s*[:：]?/u.test(block.text))

/** Local semantic changes drive one cancellable review, never autosave events. */
export class NoteChallengeScheduler{
 private level:ChallengeLevel=0
 private value:DocumentInput={title:'',blocks:[],active:false,busy:false,composing:false}
 private pending=new Set<string>()
 private failed=new Set<string>()
 private supplements=new Map<string,Supplement>()
 private generation=0
 private timer?:ReturnType<typeof setTimeout>
 private editedAt=0
 private initialized=false
 private hasEdited=false
 private firstAt?:number
 private expedited=false
 private lastRun=-Infinity
 private lastDeep=-Infinity
 private flight?:{controller:AbortController;ids:string[]}
 private disposed=false
 private usage:Usage[]=[]
 private checks:ChallengeCheck[]=[]
 constructor(private options:{sessionId:string;run:(request:ChallengeRequest,signal:AbortSignal)=>Promise<ChallengeResult>;onResult:(result:ChallengeResult,captured:Captured)=>void|Promise<void>;onState?:(value:ChallengeScheduleState)=>void;now?:()=>number;getReviewAnchors?:()=>ChallengeReviewAnchor[]}){}
 private now(){return this.options.now?.()??Date.now()}
 private emit(phase:ChallengeScheduleState['phase']){this.options.onState?.({phase,pending:this.pending.size,checks:this.checks})}
 private resetRetries(){this.generation++;this.failed.clear();this.supplements.clear()}
 private retryDelay(attempts=0){return Math.max(6000,CHALLENGE_LEVELS[this.level].interval)*2**attempts}
 setLevel(level:ChallengeLevel,immediate=false){
  if(!Number.isInteger(level)||level<0||level>4||this.disposed)return
  if(this.level===level)return
  const enabling=this.level===0
  this.level=level;this.cancel();this.resetRetries();this.firstAt=undefined;this.expedited=immediate
  if(level){for(const b of this.value.blocks)this.pending.add(b.id);if(immediate)this.firstAt=this.now();else if(enabling)this.firstAt=this.now()+2000}
  else this.pending.clear()
  this.schedule()
 }
 update(value:DocumentInput){
  if(this.disposed)return
  const previous=this.value,next={...previous,...value},initial=!this.initialized,changed=key(previous)!==key(next),composingEnded=previous.composing&&!next.composing
  this.value=next;this.initialized=true
  if(changed){
   const before=new Map(previous.blocks.map(b=>[b.id,JSON.stringify(b)]))
   const titleChanged=previous.title!==value.title
   for(const block of value.blocks)if(titleChanged||before.get(block.id)!==JSON.stringify(block))this.pending.add(block.id)
   const ids=new Set(value.blocks.map(b=>b.id));for(const id of this.pending)if(!ids.has(id))this.pending.delete(id)
   if(initial){this.editedAt=this.now();if(this.level)this.firstAt=this.now()+2000}
   else{this.editedAt=this.now();this.hasEdited=true;this.firstAt=undefined;this.expedited=false;this.resetRetries()}
  }
  if(composingEnded){this.editedAt=this.now();this.hasEdited=true;this.firstAt=undefined;this.expedited=false}
  if(this.value.busy||this.value.composing)this.cancel()
  this.schedule()
 }
 recheck(immediate=false){if(!this.level||this.disposed)return;this.expedited=immediate;this.resetRetries();for(const b of this.value.blocks)this.pending.add(b.id);this.firstAt=this.now();this.schedule()}
 retryState():ChallengeRetryState{
  return{version:1,key:key(this.value),level:this.level,entries:this.value.blocks.flatMap(block=>{const retry=this.supplements.get(block.id);return retry||this.failed.has(block.id)?[{id:block.id,attempts:retry?.attempts??0,notBefore:retry?.notBefore??this.now(),blocked:this.failed.has(block.id)}]:[]}),usage:this.usage.filter(v=>v.at>this.now()-WINDOW).map(v=>({...v}))}
 }
 usageState():ChallengeUsageState{return{version:1,sessionId:this.options.sessionId,usage:this.usage.filter(v=>v.at>this.now()-WINDOW).map(v=>({...v}))}}
 restoreUsage(saved:unknown){
  const ledger=saved as ChallengeUsageState|undefined
  // Hydrate before editor activation; an old snapshot must never replace usage
  // already reserved by a resident scheduler. This ledger belongs to the session,
  // independently of edits, the title and the selected challenge tier.
  if(this.disposed||this.usage.length||ledger?.version!==1||ledger.sessionId!==this.options.sessionId||!Array.isArray(ledger.usage)||ledger.usage.length>40000)return
  this.usage=ledger.usage.filter(v=>v&&Number.isFinite(v.at)&&v.at<=this.now()&&v.at>this.now()-WINDOW&&Number.isFinite(v.chars)&&v.chars>0&&v.chars<=40000&&Number.isFinite(v.input)&&v.input>=0&&Number.isFinite(v.output)&&v.output>=0).map(v=>({...v})).sort((a,b)=>a.at-b.at)
  this.schedule()
 }
 restoreCoverage(ids:string[],checks:ChallengeCheck[],completeIds:string[]=[],saved?:unknown){
  if(this.disposed)return
  const current=new Set(this.value.blocks.map(b=>b.id)),complete=new Set(completeIds.filter(id=>ids.includes(id))),retry=saved as ChallengeRetryState|undefined
  // Compatibility with the earlier private snapshot: its cost remains real even
  // when its exact-body retry allowance no longer applies.
  if(retry?.version===1)this.restoreUsage({version:1,sessionId:this.options.sessionId,usage:retry.usage})
  if(retry?.version===1&&retry.key===key(this.value)&&retry.level===this.level&&Array.isArray(retry.entries)&&retry.entries.length<=10000){
   for(const entry of retry.entries){
    if(!entry||!current.has(entry.id)||complete.has(entry.id)||!Number.isInteger(entry.attempts)||entry.attempts<0||entry.attempts>MAX_SUPPLEMENTS||!Number.isFinite(entry.notBefore)||typeof entry.blocked!=='boolean')continue
    this.supplements.set(entry.id,{attempts:entry.attempts,notBefore:Math.max(this.now(),Math.min(entry.notBefore,this.now()+this.retryDelay(1)))})
    if(entry.blocked)this.failed.add(entry.id)
   }
  }
  for(const id of ids){
   if(!current.has(id))continue
   if(complete.has(id)){this.pending.delete(id);this.failed.delete(id);this.supplements.delete(id)}
   else{this.pending.add(id);if(!this.supplements.has(id))this.supplements.set(id,{attempts:0,notBefore:this.now()+this.retryDelay()})}
  }
  this.checks=checks;this.schedule()
 }
 private cancel(){clearTimeout(this.timer);this.timer=undefined;if(this.flight){for(const id of this.flight.ids)if(this.value.blocks.some(b=>b.id===id))this.pending.add(id);this.flight.controller.abort()}}
 private eligible(){return this.value.blocks.filter(b=>this.pending.has(b.id)&&!this.failed.has(b.id)&&(this.supplements.get(b.id)?.attempts??0)<MAX_SUPPLEMENTS)}
 private batch(){
  const chosen:ChallengeBlock[]=[],ids:string[]=[];let chars=0,oversized=false,deep=false,metadataLimited=false,nextAt=Infinity
  // Identifiers, cutoffs and explicitly configured comparison settings are part
  // of every factual pass, not optional low-frequency cross-paragraph evidence.
  // Preserve whole source paragraphs, including conflicts or invalid values.
  const metadata=this.level>=2?this.value.blocks.filter(researchMetadata):[],metadataIds=new Set(metadata.map(block=>block.id)),metadataChars=metadata.reduce((sum,block)=>sum+block.text.length,0)
  if(metadata.length>MAX_BLOCKS||metadataChars>MAX_CHARS||metadata.some(block=>block.text.length>MAX_BLOCK_CHARS))return{chosen,ids,chars,existingAnchors:[],oversized,deep,metadataLimited:true,nextAt}
  let extraChars=0,extraBlocks=0
  for(const block of this.eligible()){
   if(block.text.length>MAX_BLOCK_CHARS){oversized=true;continue}
   const extra=!metadataIds.has(block.id),size=extra?block.text.length:0,count=extra?1:0
   if(metadataChars+size>MAX_CHARS||metadata.length+count>MAX_BLOCKS){metadataLimited=true;continue}
   const readyAt=this.supplements.get(block.id)?.notBefore??-Infinity
   if(readyAt>this.now()){nextAt=Math.min(nextAt,readyAt);continue}
   if(metadata.length+extraBlocks+count>MAX_BLOCKS||metadataChars+extraChars+size>MAX_CHARS)break
   chosen.push(block);ids.push(block.id);chars+=block.text.length;extraChars+=size;extraBlocks+=count
  }
  const included=new Set(ids)
  for(const block of metadata)if(!included.has(block.id)){chosen.push(block);included.add(block.id);chars+=block.text.length}
  // Adjacent paragraphs remain available on every pass; distant related
  // paragraphs are the extra cross-paragraph pass governed by `deep`.
  const adjacent=new Set<string>(),context=new Set<string>()
  for(const id of ids){const at=this.value.blocks.findIndex(b=>b.id===id);for(const index of [at-1,at+1]){const b=this.value.blocks[index];if(b){adjacent.add(b.id);context.add(b.id)}}}
  if(ids.length&&this.now()>=this.lastDeep+CHALLENGE_LEVELS[this.level].deep){
   const terms=new Set(chosen.filter(b=>ids.includes(b.id)).flatMap(b=>b.text.match(/[A-Za-z]{2,}|\d{2,}|[\u4e00-\u9fff]{2,6}/gu)??[]))
   const related=this.value.blocks.filter(b=>!ids.includes(b.id)).map(b=>({b,score:[...terms].filter(t=>b.text.includes(t)).length})).sort((a,b)=>b.score-a.score)
   for(const {b,score} of related)if(score>0)context.add(b.id)
  }
  for(const id of context){const b=this.value.blocks.find(b=>b.id===id)!;if(included.has(id)||b.text.length>MAX_BLOCK_CHARS||chosen.length>=MAX_BLOCKS||chars+b.text.length>MAX_CHARS)continue;chosen.push(b);included.add(id);chars+=b.text.length;if(!adjacent.has(id))deep=true}
  const existingAnchors=challengeReviewAnchors(this.options.getReviewAnchors?.()??[],chosen.filter(block=>ids.includes(block.id)))
  // Repeated location hints consume the same rolling input budget as body text.
  return{chosen,ids,chars:chars+(existingAnchors.length?JSON.stringify(existingAnchors).length:0),existingAnchors,oversized,deep,metadataLimited,nextAt}
 }
 private budgetWait(chars:number){
  this.usage=this.usage.filter(v=>v.at>this.now()-WINDOW)
  const exhausted=this.usage.reduce((n,v)=>n+v.chars,0)+chars>40000||this.usage.reduce((n,v)=>n+v.input,0)>=40000||this.usage.reduce((n,v)=>n+v.output,0)>=4000
  return exhausted?Math.max(1,this.usage[0]!.at+WINDOW-this.now()):undefined
 }
 private schedule(){
  clearTimeout(this.timer);this.timer=undefined
  if(this.disposed)return
  if(!this.level){this.emit('off');return}
  if(this.flight){this.emit('running');return}
  if(!this.value.active||this.value.busy||this.value.composing){this.emit('paused');return}
  if(!this.pending.size){this.emit('idle');return}
  const eligible=this.eligible()
  if(!eligible.length){this.emit('waiting');return}
  const batch=this.batch()
  this.checks=this.checks.filter(v=>v.kind!=='coverage')
  if(batch.oversized)this.checks.push({kind:'coverage',status:'partial',detail:'部分长段落超出单段处理上限，已保留为待检查，尚未完成检查。'})
  if(batch.metadataLimited)this.checks.push({kind:'coverage',status:'partial',detail:'研究元数据与待检查段落超出本轮容量，相关段落已保留为待检查，尚未完成本等级检查。'})
  if(!batch.ids.length){if(Number.isFinite(batch.nextAt)&&batch.nextAt>this.now()){this.emit('waiting');this.timer=setTimeout(()=>this.schedule(),batch.nextAt-this.now())}else this.emit('limited');return}
  const wait=this.budgetWait(batch.chars)
  if(wait!==undefined){this.emit('limited');this.timer=setTimeout(()=>this.schedule(),wait);return}
  // Missing punctuation is not a permanent veto: a stable phrase can contain a
  // complete misspelled word. Wait longer at the caret, while IME stays paused.
  const current=this.value.blocks.find(b=>b.id===this.value.editingBlockId&&this.pending.has(b.id)),unfinished=current&&current.type!=='heading'&&!/[。！？.!?；;：:]\s*$/u.test(current.text)
  const config=CHALLENGE_LEVELS[this.level],interval=this.hasEdited&&this.editedAt>=this.lastRun?config.pause:config.interval,due=this.expedited?this.now():Math.max(this.firstAt??this.editedAt+config.pause,this.hasEdited?this.editedAt+config.pause:-Infinity,unfinished?this.editedAt+Math.max(config.pause,5000):-Infinity,this.lastRun+interval)
  this.emit('waiting');this.timer=setTimeout(()=>{this.timer=undefined;void this.execute()},Math.max(0,due-this.now()))
 }
 private async execute(){
  if(this.disposed||!this.level||this.flight||!this.value.active||this.value.busy||this.value.composing)return
  const {chosen,ids,chars,deep,existingAnchors}=this.batch()
  if(!ids.length||this.budgetWait(chars)!==undefined){this.schedule();return}
  for(const id of ids)this.pending.delete(id)
  const captured:Captured={key:key(this.value),title:this.value.title,level:this.level,blocks:this.value.blocks.map(b=>({...b}))},generation=this.generation,controller=new AbortController(),job={controller,ids}
  // Reserve supplemental attempts before the request (including an interrupted
  // request); focus/visibility changes must not mint another retry allowance.
  for(const id of ids){const retry=this.supplements.get(id);if(retry){retry.attempts++;retry.notBefore=this.now()+this.retryDelay(retry.attempts)}}
  this.flight=job;this.expedited=false;this.lastRun=this.now();if(deep)this.lastDeep=this.now();this.firstAt=undefined;const usage={at:this.now(),chars,input:0,output:0};this.usage.push(usage);this.emit('running')
  let onAbort:()=>void=()=>{}
  try{
   const aborted=new Promise<never>((_,reject)=>{onAbort=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',onAbort,{once:true})})
   const response=await Promise.race([this.options.run({sessionId:this.options.sessionId,requestId:crypto.randomUUID(),action:'review',level:this.level,title:this.value.title,blocks:chosen,changedIds:ids,...existingAnchors.length?{existingAnchors}:{}},controller.signal),aborted])
   if(response.usage){usage.input=response.usage.inputTokens;usage.output=response.usage.outputTokens}
   if(!this.disposed&&!controller.signal.aborted&&this.level===captured.level&&this.generation===generation&&key(this.value)===captured.key){
    const covered=new Set(response.coveredBlockIds),complete=new Set(response.completeBlockIds??[]),madeProgress=ids.some(id=>covered.has(id))
    for(const id of ids){
     if(covered.has(id)&&complete.has(id)){this.supplements.delete(id);this.failed.delete(id);continue}
     this.pending.add(id)
     if(covered.has(id)){const retry=this.supplements.get(id)??{attempts:0,notBefore:0};retry.notBefore=this.now()+this.retryDelay(retry.attempts);this.supplements.set(id,retry)}
     else if(!madeProgress)this.failed.add(id)
    }
    this.checks=[...this.checks.filter(v=>v.kind==='coverage'),...response.checks];await this.options.onResult(response,captured)
   }
   else for(const id of ids)if(this.value.blocks.some(b=>b.id===id))this.pending.add(id)
  }catch(error){if(!controller.signal.aborted){const unchanged=this.level===captured.level&&this.generation===generation&&key(this.value)===captured.key;for(const id of ids)if(this.value.blocks.some(b=>b.id===id)){this.pending.add(id);if(unchanged)this.failed.add(id)}this.checks=[{kind:'review',status:'unavailable',detail:'本轮检查未完成，待正文变化或主动重查后继续，未将未核验结果写入正文。'}];this.emit('failed')}}
  finally{controller.signal.removeEventListener('abort',onAbort);if(this.flight===job)this.flight=undefined;this.schedule()}
 }
 dispose(){this.disposed=true;this.cancel()}
}
