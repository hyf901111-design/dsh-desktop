import {challengeReviewAnchors,type ChallengeBlock,type ChallengeCheck,type ChallengeLevel,type ChallengeRequest,type ChallengeResult,type ChallengeReviewAnchor} from '../../shared/notes-challenge'

export const CHALLENGE_LEVELS=[
 {name:'关闭',description:'专注写作，暂停自动挑战',pause:0,interval:0,deep:0},
 {name:'宽松',description:'只提醒明显问题，减少打扰',pause:15000,interval:60000,deep:600000},
 {name:'标准',description:'兼顾事实、逻辑与表达',pause:5000,interval:30000,deep:300000},
 {name:'严格',description:'深入检查证据、前提与推理',pause:3000,interval:20000,deep:180000},
 {name:'抬杠',description:'提出反驳与追问，检验观点',pause:3000,interval:15000,deep:120000}
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
type Captured={key:string;blocks:ChallengeBlock[];title:string}
const key=(value:{title:string;blocks:ChallengeBlock[]})=>JSON.stringify([value.title,value.blocks])
const MAX_CHARS=16000,MAX_BLOCK_CHARS=12000,MAX_BLOCKS=24,WINDOW=600000

/** Local semantic changes drive one cancellable review, never autosave events. */
export class NoteChallengeScheduler{
 private level:ChallengeLevel=0
 private value:DocumentInput={title:'',blocks:[],active:false,busy:false,composing:false}
 private pending=new Set<string>()
 private failed=new Set<string>()
 private timer?:ReturnType<typeof setTimeout>
 private editedAt=0
 private initialized=false
 private hasEdited=false
 private firstAt?:number
 private lastRun=-Infinity
 private lastDeep=-Infinity
 private flight?:{controller:AbortController;ids:string[]}
 private disposed=false
 private usage:Array<{at:number;chars:number;input:number;output:number}>=[]
 private checks:ChallengeCheck[]=[]
 constructor(private options:{sessionId:string;run:(request:ChallengeRequest,signal:AbortSignal)=>Promise<ChallengeResult>;onResult:(result:ChallengeResult,captured:Captured)=>void|Promise<void>;onState?:(value:ChallengeScheduleState)=>void;now?:()=>number;getReviewAnchors?:()=>ChallengeReviewAnchor[]}){}
 private now(){return this.options.now?.()??Date.now()}
 private emit(phase:ChallengeScheduleState['phase']){this.options.onState?.({phase,pending:this.pending.size,checks:this.checks})}
 setLevel(level:ChallengeLevel){
  if(!Number.isInteger(level)||level<0||level>4||this.disposed)return
  if(this.level===level)return
  const enabling=this.level===0
  this.level=level;this.cancel();this.firstAt=undefined
  if(level){for(const b of this.value.blocks)this.pending.add(b.id);if(enabling)this.firstAt=this.now()+2000}
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
   if(initial){if(this.level)this.firstAt=this.now()+2000}
   else{this.editedAt=this.now();this.hasEdited=true;this.firstAt=undefined;this.failed.clear()}
  }
  if(composingEnded){this.editedAt=this.now();this.hasEdited=true;this.firstAt=undefined}
  if(!this.value.active||this.value.busy||this.value.composing)this.cancel()
  this.schedule()
 }
 recheck(){if(!this.level||this.disposed)return;this.failed.clear();for(const b of this.value.blocks)this.pending.add(b.id);this.firstAt=this.now();this.schedule()}
 private cancel(){clearTimeout(this.timer);this.timer=undefined;if(this.flight){for(const id of this.flight.ids)if(this.value.blocks.some(b=>b.id===id))this.pending.add(id);this.flight.controller.abort()}}
 private eligible(){return this.value.blocks.filter(b=>this.pending.has(b.id)&&!this.failed.has(b.id)&&(b.id!==this.value.editingBlockId||b.type==='heading'||/[。！？.!?；;：:]\s*$/u.test(b.text)))}
 private batch(){
  const chosen:ChallengeBlock[]=[],ids:string[]=[];let chars=0,oversized=false,deep=false
  for(const block of this.eligible()){
   if(block.text.length>MAX_BLOCK_CHARS){oversized=true;continue}
   if(chosen.length>=MAX_BLOCKS||chars+block.text.length>MAX_CHARS)break
   chosen.push(block);ids.push(block.id);chars+=block.text.length
  }
  // Adjacent paragraphs remain available on every pass; distant related
  // paragraphs are the extra cross-paragraph pass governed by `deep`.
  const adjacent=new Set<string>(),context=new Set<string>()
  for(const id of ids){const at=this.value.blocks.findIndex(b=>b.id===id);for(const index of [at-1,at+1]){const b=this.value.blocks[index];if(b){adjacent.add(b.id);context.add(b.id)}}}
  if(ids.length&&this.now()>=this.lastDeep+CHALLENGE_LEVELS[this.level].deep){
   const terms=new Set(chosen.flatMap(b=>b.text.match(/[A-Za-z]{2,}|\d{2,}|[\u4e00-\u9fff]{2,6}/gu)??[]))
   const related=this.value.blocks.filter(b=>!ids.includes(b.id)).map(b=>({b,score:[...terms].filter(t=>b.text.includes(t)).length})).sort((a,b)=>b.score-a.score)
   for(const {b,score} of related)if(score>0)context.add(b.id)
  }
  for(const id of context){const b=this.value.blocks.find(b=>b.id===id)!;if(ids.includes(id)||b.text.length>MAX_BLOCK_CHARS||chosen.length>=MAX_BLOCKS||chars+b.text.length>MAX_CHARS)continue;chosen.push(b);chars+=b.text.length;if(!adjacent.has(id))deep=true}
  const existingAnchors=challengeReviewAnchors(this.options.getReviewAnchors?.()??[],chosen.filter(block=>ids.includes(block.id)))
  // Repeated location hints consume the same rolling input budget as body text.
  return{chosen,ids,chars:chars+(existingAnchors.length?JSON.stringify(existingAnchors).length:0),existingAnchors,oversized,deep}
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
  if(!this.value.active||this.value.busy||this.value.composing){this.emit('paused');return}
  if(this.flight){this.emit('running');return}
  if(!this.pending.size){this.emit('idle');return}
  if(!this.eligible().length){this.emit('waiting');return}
  const batch=this.batch()
  this.checks=this.checks.filter(v=>v.kind!=='coverage')
  if(batch.oversized)this.checks.push({kind:'coverage',status:'partial',detail:'部分长段落超出单段处理上限，已保留为待检查，尚未完成检查。'})
  if(!batch.ids.length){this.emit('limited');return}
  const wait=this.budgetWait(batch.chars)
  if(wait!==undefined){this.emit('limited');this.timer=setTimeout(()=>this.schedule(),wait);return}
  const config=CHALLENGE_LEVELS[this.level],due=Math.max(this.firstAt??this.editedAt+config.pause,this.hasEdited?this.editedAt+config.pause:-Infinity,this.lastRun+config.interval)
  this.emit('waiting');this.timer=setTimeout(()=>{this.timer=undefined;void this.execute()},Math.max(0,due-this.now()))
 }
 private async execute(){
  if(this.disposed||!this.level||this.flight||!this.value.active||this.value.busy||this.value.composing)return
  const {chosen,ids,chars,deep,existingAnchors}=this.batch()
  if(!ids.length||this.budgetWait(chars)!==undefined){this.schedule();return}
  for(const id of ids)this.pending.delete(id)
  const captured:Captured={key:key(this.value),title:this.value.title,blocks:this.value.blocks.map(b=>({...b}))},controller=new AbortController(),job={controller,ids}
  this.flight=job;this.lastRun=this.now();if(deep)this.lastDeep=this.now();this.firstAt=undefined;const usage={at:this.now(),chars,input:0,output:0};this.usage.push(usage);this.emit('running')
  let onAbort:()=>void=()=>{}
  try{
   const aborted=new Promise<never>((_,reject)=>{onAbort=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',onAbort,{once:true})})
   const response=await Promise.race([this.options.run({sessionId:this.options.sessionId,requestId:crypto.randomUUID(),action:'review',level:this.level,title:this.value.title,blocks:chosen,changedIds:ids,...existingAnchors.length?{existingAnchors}:{}},controller.signal),aborted])
   const madeProgress=ids.some(id=>response.coveredBlockIds.includes(id)),unchanged=key(this.value)===captured.key
   for(const id of ids)if(!response.coveredBlockIds.includes(id)&&this.value.blocks.some(b=>b.id===id)){this.pending.add(id);if(!madeProgress&&unchanged)this.failed.add(id)}
   if(response.usage){usage.input=response.usage.inputTokens;usage.output=response.usage.outputTokens}
   if(!this.disposed&&!controller.signal.aborted&&this.level&&key(this.value)===captured.key){this.checks=[...this.checks.filter(v=>v.kind==='coverage'),...response.checks];await this.options.onResult(response,captured)}
   else for(const id of ids)if(this.value.blocks.some(b=>b.id===id))this.pending.add(id)
  }catch(error){if(!controller.signal.aborted){const unchanged=key(this.value)===captured.key;for(const id of ids)if(this.value.blocks.some(b=>b.id===id)){this.pending.add(id);if(unchanged)this.failed.add(id)}this.checks=[{kind:'review',status:'unavailable',detail:'本轮检查未完成，待正文变化或主动重查后继续，未将未核验结果写入正文。'}];this.emit('failed')}}
  finally{controller.signal.removeEventListener('abort',onAbort);if(this.flight===job)this.flight=undefined;this.schedule()}
 }
 dispose(){this.disposed=true;this.cancel()}
}
