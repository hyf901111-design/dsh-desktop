import {HOME_WORKBENCH_REQUEST_MISMATCH} from '../../packages/dsh-research-task-runtime/home-workbench-contract.js'

/** A durable demo plan is an application event, never a fabricated model/tool call. */
export function homeWorkbenchReceiptEvent(event){
 const data=event?.data
 if(event?.type!=='home-guide/workbench'||data?.version!==1||data.purpose!=='frozen-research-workbench-replay'||typeof data.runId!=='string'||!data.runId||data.runId.length>200||!Number.isSafeInteger(data.turn)||data.turn<0)return null
 if(!['plan','playback','stopped','completed'].includes(data.kind))return null
 if(data.kind==='playback'&&typeof data.playing!=='boolean')return null
 if(data.kind==='plan'){
  const tabs=['overview','valuation','documents'],plans=data.plans
  if(!Array.isArray(plans)||plans.length!==3)return null
  const prefix=typeof plans[0]?.id==='string'?plans[0].id.slice(0,-tabs[0].length):''
  if(!prefix.startsWith('hwb:')||prefix.length<=5||prefix.length>250||!prefix.endsWith(':')||plans.some((p,i)=>p?.id!==prefix+tabs[i]||p.count!==5))return null
 }
 return data
}
function isLegacyHomeWorkbenchFailure(context,state,mismatch){
 // Older builds let live planning steer again after the replay had finished.
 const terminal=context.matches.find(match=>match.event.seq===state.failure.seq)?.event
 const error=terminal?.data.reason?.error
 if(error?.code!=='UNKNOWN'||error.message!==mismatch)return false
 return context.matches.some(({event})=>{
  const receipt=homeWorkbenchReceiptEvent(event)
  return event.seq<terminal.seq&&receipt?.kind==='completed'&&receipt.turn===state.turn
 })
}
export function registerHomeWorkbenchReceipt(ctx){
 ctx.conversationEvents.register({kind:'home-workbench-plan',target:'chat',match:event=>{const data=homeWorkbenchReceiptEvent(event);return data?{id:data.runId,role:data.kind==='plan'?'start':'update'}:null},start:(_context,match)=>{
  const data=homeWorkbenchReceiptEvent(match.event);return data?.kind==='plan'?{...data,phase:'running',seq:match.event.seq}:null
 },update:(context,match)=>{
  const state=context.state,data=homeWorkbenchReceiptEvent(match.event)
  if(!state||!data||data.runId!==state.runId||data.turn!==state.turn||['stopped','completed'].includes(state.phase))return state
  return {...state,phase:data.kind==='stopped'?'stopped':data.kind==='completed'?'completed':data.kind==='playback'?(data.playing?'running':'paused'):state.phase}
 },buildViewNode:context=>context.state?chatNode(context,'home-workbench-plan',context.state.seq,context.state):null})
}
export function homeWorkbenchReceiptAnchors(flow,nodeStore,readTurn,anchors){
 const scopes=new Map(),tails=new Map();let scope=0
 for(const entry of flow??[]){
  const node=entry.kind==='node'?nodeStore?.get?.(entry.key):null
  if(entry.kind==='pending-steering'||['user','steering'].includes(node?.kind))scope++
  scopes.set(entry.key,scope)
  if(entry.kind!=='execution'&&!['assistant-step','turn-tail','turn-error','turn-max-tokens'].includes(node?.kind))continue
  if(entry.kind==='execution'&&!entry.nodeKeys?.length)continue
  const turn=entry.kind==='execution'?entry.turn:readTurn(node)
  if(typeof turn==='number'&&Number.isFinite(turn)){const entries=tails.get(scope)??new Map();entries.set(turn,entry.key);tails.set(scope,entries)}
 }
 for(const entry of flow??[]){
  const keys=entry.kind==='execution'?entry.nodeKeys??[]:entry.kind==='node'?[entry.key]:[]
  for(const receiptKey of keys){
   const node=nodeStore?.get?.(receiptKey)
   if(node?.kind!=='home-workbench-plan'||!homeWorkbenchReceiptEvent({type:'home-guide/workbench',data:node.data}))continue
   const data=node.data,key=tails.get(scopes.get(entry.key))?.get(data.turn)??entry.key
   anchors.set(key,[...(anchors.get(key)??[]),...data.plans.map(p=>({...p,replay:{runId:data.runId,phase:data.phase}}))])
  }
 }
 return anchors
}
export function isHomeWorkbenchReceipt(plans){return plans?.some(p=>typeof p.replay?.runId==='string')===true}
export function homeWorkbenchProgressState(plans,snapshot,english,state){
 if(!isHomeWorkbenchReceipt(plans))return state
 const say=(zh,en)=>english?en:zh,unplaced=Math.max(0,state.planned-state.total),ended=plans.some(p=>p.replay?.phase==='stopped'),paused=plans.some(p=>p.replay?.phase==='paused'),finished=plans.some(p=>p.replay?.phase==='completed'),complete=state.total===state.planned&&state.completed===state.planned
 const phase=complete?'completed':ended||finished?'partial':state.unknown?'unknown':paused?'paused':snapshot?.active===false?'inactive':state.failed||state.cancelled?'partial':'running'
 const fraction=state.completed+'/'+state.planned
 const title=complete?say('组件已生成 · '+fraction,'Components generated · '+fraction):ended?say('组件生成已停止 · '+fraction+' 已生成','Generation stopped · '+fraction+' generated'):paused?say('组件生成已暂停 · '+fraction+' 已生成','Generation paused · '+fraction+' generated'):phase==='inactive'?say('组件状态等待更新 · '+fraction,'Awaiting component status · '+fraction):phase==='unknown'?say('组件状态待确认 · '+fraction,'Component status needs verification · '+fraction):phase==='partial'?say('组件生成已结束 · '+fraction+' 已生成','Generation ended · '+fraction+' generated'):say('组件生成中 · 已生成 '+fraction,'Generating components · '+fraction+' generated')
 const detail=[say('已生成 '+state.completed,state.completed+' generated'),state.pending?say((ended?'已停止 ':'进行中 ')+state.pending,state.pending+(ended?' stopped':' in progress')):'',unplaced?say((ended?'未开始 ':finished?'当前画布缺少 ':'待放置 ')+unplaced,unplaced+(ended?' not started':finished?' absent from the current canvas':' awaiting placement')):'',state.failed?say('未完成 '+state.failed,state.failed+' failed'):'',state.cancelled?say('已停止 '+state.cancelled,state.cancelled+' stopped'):'',state.unknown?say('待确认 '+state.unknown,state.unknown+' unverified'):''].filter(Boolean).join(' · ')
 const refreshLines=state.completed>0?[say('固定历史快照 · 不接入实时更新','Fixed historical snapshot · No live updates')]:[]
 return {...state,phase,title,detail,unplaced,refreshLines,refreshHistory:'',refreshDetail:refreshLines.join('')}
}
export function homeWorkbenchGenerating(plans,current,state,retrying){
 return isHomeWorkbenchReceipt(plans)?current?.active!==false&&state.phase==='running':current?.active!==false&&state.pending>0||retrying
}
const START='/* odyssey:home-workbench-progress:start:v1 */',END='/* odyssey:home-workbench-progress:end:v1 */'
const edits=[
 ['error-receipt','const turn = retryTurn(event);','const receipt=homeWorkbenchReceiptEvent(event);if(receipt?.kind==="completed")return {id:String(receipt.turn),role:"update"};\n','before'],
 ['legacy-error','const failure = state.failure;',`if(isLegacyHomeWorkbenchFailure(context,state,${JSON.stringify(HOME_WORKBENCH_REQUEST_MISMATCH)}))return null;\n`,'before'],
 ['register','function registerConversationNodes(ctx) {','\nregisterHomeWorkbenchReceipt(ctx);','after'],
 ['invisible','if (entry.kind === "node") return (0, react_jsx_runtime.jsx)(ChatNodeSeat, {','if(entry.kind==="node"&&nodeStore.get(entry.key)?.kind==="home-workbench-plan")return null;\n','before'],
 ['visible','const visiblePlans=','isHomeWorkbenchReceipt(plans)?plans:','after'],
 ['generating','const generating=current?.active!==false&&state.pending>0||retrying','const generating=homeWorkbenchGenerating(plans,current,state,retrying)','replace'],
 ['retry','const hasRetry=','!isHomeWorkbenchReceipt(plans)&&','after'],
 ['retry-guard','async function requestResearchWorkbenchRetry(target,sessionId,plans,snapshot) {','\nif(isHomeWorkbenchReceipt(plans))return false;','after']
]
const marker=(id,text)=>'/* hwb-progress:'+id+':start */'+text+'/* hwb-progress:'+id+':end */'
export function stripHomeWorkbenchProgress(source){
 if(source.includes(START)){if(source.split(START).length!==2||source.split(END).length!==2)throw Error('Workbench progress boundary drifted');const a=source.indexOf(START),b=source.indexOf(END,a)+END.length;source=source.slice(0,a)+source.slice(b+(source[b]==='\n'?1:0))}
 for(const[id,anchor,,where]of edits)source=source.replace(new RegExp('/\\* hwb-progress:'+id+':start \\*/[\\s\\S]*?/\\* hwb-progress:'+id+':end \\*/','g'),where==='replace'?anchor:'')
 return source
}
export function patchHomeWorkbenchProgress(source){
 source=stripHomeWorkbenchProgress(source)
 const one=(anchor,insert)=>{const re=new RegExp('^[ \\t]*'+anchor.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gm'),hits=[...source.matchAll(re)];if(hits.length!==1)throw Error('Workbench progress anchor drifted: '+anchor+' ('+hits.length+')');const index=hits[0].index+hits[0][0].length-anchor.length;source=source.slice(0,index)+insert+source.slice(index+anchor.length)}
 const functions=[homeWorkbenchReceiptEvent,isLegacyHomeWorkbenchFailure,registerHomeWorkbenchReceipt,homeWorkbenchReceiptAnchors,isHomeWorkbenchReceipt,homeWorkbenchProgressState,homeWorkbenchGenerating].map(fn=>fn.toString()).join('\n')
 const overrides=`const homeWorkbenchBaseAnchors=researchWorkbenchReceiptAnchors,homeWorkbenchBaseProgress=workbenchProgressState;
researchWorkbenchReceiptAnchors=function(flow,store,readMetadata,readTurn=()=>null){return homeWorkbenchReceiptAnchors(flow,store,readTurn,homeWorkbenchBaseAnchors(flow,store,readMetadata,readTurn))};
workbenchProgressState=function(plans,snapshot,english=false,refreshSnapshot=null){return homeWorkbenchProgressState(plans,snapshot,english,homeWorkbenchBaseProgress(plans,snapshot,english,refreshSnapshot))};`
 one('function registerConversationNodes(ctx) {',START+'\n'+functions+'\n'+overrides+'\n'+END+'\nfunction registerConversationNodes(ctx) {')
 for(const[id,anchor,insert,where]of edits)one(anchor,where==='replace'?marker(id,insert):where==='before'?marker(id,insert)+anchor:anchor+marker(id,insert))
 return source
}
