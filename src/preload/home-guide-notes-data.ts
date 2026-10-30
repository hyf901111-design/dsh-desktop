import type {ChallengeRequest,ChallengeResult,ChallengeIssue} from '../shared/notes-challenge'
import type {NotesBridge,NoteContent,SavedNote,NoteLoad} from '../shared/workspace-notes'
import {challengeReplacementScope} from '../shared/notes-challenge'
import type {HomeNotesNativeBridge} from './home-guide-notes-native'
import {HOME_NOTES_GUIDE_SELECTION,HOME_NOTES_REWRITE_RESULT,HOME_NOTES_REPORT_SOURCES,HOME_NOTES_RESEARCH_FACTS} from '../../packages/dsh-research-task-runtime/home-notes-guide-contract.js'
export const HOME_NOTES_GUIDE_TITLE="微软｜持有回报复盘"
export const HOME_NOTES_GROWTH_REPLACEMENT="粗算下来，100变成255.13，五年累计回报155.13%，对应年化收益约20.60%。"
export const HOME_NOTES_CONSENSUS_REPLACEMENT="微软这五年比标普多出39.24个百分点，但和NASDAQ Computer的累计回报只差0.16个百分点，暂时不能把超额都归为个股判断。下一步先拆开科技行业暴露、估值变化和经营兑现，再决定这段回报里哪些可能重复。"
export const HOME_NOTES_GUIDE_WRITING_STAGES=[[{"id":"guide-note-intro","type":"paragraph","content":"今天先不追目标价，想把微软这几年的持有回报重新算一遍。我把观察窗口固定在2020年6月底到2025年6月底：先看收益从哪里来，再想这段经历能不能外推。图里的基准统一从100起步，分红按年报口径再投入。"},{"id":"guide-note-growth","type":"paragraph","content":"粗算下来，100变成255.13，五年累计回报155.13%，对应年化收益31.03%。这个数我先记在这里，稍后回原表重算。对照组除了标普500，也放上NASDAQ Computer，免得把一轮科技股行情都算成自己的判断。"}],[{"id":"guide-note-consensus","type":"paragraph","content":"微软这五年比标普多出39.24个百分点，我倾向于把这部分超额都归到公司护城河和自己的选股判断上。既然历史持有已经跑赢，之后主要盯经营兑现就够了，行业风格和估值变化可以先放到次要位置。"}],[{"id":"guide-note-logic","type":"paragraph","content":"行情面板单独放在这里，只用来核对最近的价格和交易节奏，不把现在的报价塞回历史曲线。年度采样看不见年内跌得多深，尤其截至2022年6月的那段持有体验，不能被一张向上的净值图抹平；日频回撤和成本留到下一步补。"},{"id":"guide-note-cashflow","type":"paragraph","content":"这次先不急着改仓位，我还想弄清新增投入何时变成现金回报、当前估值又预支了多少增长。后续将持续密切关注相关业务及各项指标的进一步变化情况。先把要查的东西记清楚，比急着给结论更有用。"}]]
export const HOME_NOTES_GUIDE_BLOCKS=HOME_NOTES_GUIDE_WRITING_STAGES.flat()
/** The source is the official HTML table; no PDF or page number is invented. */
export const HOME_NOTES_REPORT_EVIDENCE:ChallengeIssue['evidence']=HOME_NOTES_REPORT_SOURCES.map(source=>({kind:'consensus',label:source.label,quote:'2020-06-30投入100，包含分红再投资；2025-06-30微软255.13、标普500为215.89、NASDAQ Computer为254.97。',data:{'原始年报':source.url,'表格':source.section,'观察区间':source.period,'原表单位':'累计总回报指数，起点100','原始年度净值':HOME_NOTES_RESEARCH_FACTS.values,'年化计算':'(255.13/100)^(1/5)-1 ≈ 20.60%','累计回报':'255.13/100-1＝155.13%','基准对照':'累计回报差：标普500 +39.24个百分点；NASDAQ Computer +0.16个百分点','口径':'含分红再投资，每年6月末采样；不是主动策略收益，也不是日频最大回撤。'}}))
const draft=(id:string)=>HOME_NOTES_GUIDE_BLOCKS.find(block=>block.id===id)!.content
const issues:ChallengeIssue[]=[
 {blockId:'guide-note-consensus',quote:draft('guide-note-consensus'),category:'logic',message:'跑赢标普不能直接归为个股判断。科技行业对照的累计回报几乎相同，应先区分行业暴露、估值变化与经营兑现。',evidence:HOME_NOTES_REPORT_EVIDENCE},
 {blockId:'guide-note-growth',quote:'年化收益31.03%',category:'contradiction',message:'累计回报直接除以5是简单平均，不是复合年化。原表100到255.13跨5年，复合年化约20.60%。',evidence:HOME_NOTES_REPORT_EVIDENCE},
 {blockId:'guide-note-cashflow',quote:HOME_NOTES_GUIDE_SELECTION,category:'grammar',message:'这句表达重复且没有落到具体观察项。可写清下次先核对什么、依据变化后如何调整判断。',evidence:[{kind:'note',label:'待细化的后续观察',blockId:'guide-note-cashflow',quote:HOME_NOTES_GUIDE_SELECTION}]}
]
/** Local replay uses the original comment and sentence replacement authority. */
export function homeNotesGuideChallengeResult(request:ChallengeRequest):ChallengeResult{
 const current=issues.filter(issue=>request.blocks.some(block=>block.id===issue.blockId&&block.text.includes(issue.quote)))
 const base:ChallengeResult={version:1,issues:structuredClone(current),coveredBlockIds:request.blocks.map(block=>block.id),completeBlockIds:request.blocks.map(block=>block.id),checks:[{kind:'review',status:'completed',detail:'已检查整段归因、复合年化计算和一句后续观察的表达。'}]}
 if(request.action==='review')return base
 const issue=current.find(item=>item.blockId===request.thread?.blockId&&item.quote===request.thread?.quote)
 const target=issue&&request.blocks.find(block=>block.id===issue.blockId),scope=target&&issue&&challengeReplacementScope(target.text,issue.quote)
 if(!issue||!scope||'error' in scope)throw Error('演示原文已变化，请重新播放。')
 const logic=issue.category==='logic',statistic=issue.category==='contradiction'
 const replacement=logic?HOME_NOTES_CONSENSUS_REPLACEMENT:statistic?scope.quote.replace('年化收益31.03%','年化收益约20.60%'):HOME_NOTES_REWRITE_RESULT
 return {...base,issues:[],reply:{text:logic?'已保留跑赢标普的事实，补上科技行业对照，区分历史收益与可重复的个股判断。':statistic?'已核对微软年报原表及分红再投口径，按五年复合公式重算为约20.60%，只修正这处统计。':'已去除空泛重复，改成下一次复盘可执行的核对事项。',replacement}}
}

export type HomeNotesGuideBridge=NotesBridge&{dispose():void}
/** Only this prepared session reaches storage; challenge responses stay local. */
export function createHomeNotesGuideBridge(sessionId:string,signal:AbortSignal,beforeReply?:()=>Promise<void>,persistence?:{bridge:NotesBridge;fresh:boolean},replyWait?:(ms:number)=>Promise<void>,native?:Pick<HomeNotesNativeBridge,'generate'|'stop'>):HomeNotesGuideBridge{
 let closed=false,saved:SavedNote={title:'',blocks:[],yjs:'',revision:0,updatedAt:Date.now()}
 let admitted=!persistence
 const jobs=new Map<string,{cancel:()=>void}>()
 const assert=(input:{sessionId?:string})=>{if(closed||signal.aborted)throw signal.reason||new DOMException('演示已结束。','AbortError');if(input?.sessionId!==sessionId)throw Error('演示笔记会话不匹配。')}
 const dispose=()=>{if(closed)return;closed=true;for(const job of jobs.values())job.cancel();jobs.clear();signal.removeEventListener('abort',dispose)}
 signal.addEventListener('abort',dispose,{once:true})
 return {
  async request(method,input){
   assert(input)
   if(method==='load'){
    if(!persistence)return {saved:structuredClone(saved)}
    const loaded:NoteLoad=await persistence.bridge.request('load',{sessionId});assert(input)
    if(persistence.fresh&&(loaded.saved.revision!==0||loaded.saved.title.trim()||loaded.saved.blocks.length||loaded.saved.yjs||loaded.draft))throw Error('此会话已有笔记，请创建新的教程副本。')
    admitted=true;return loaded
   }
   if(persistence&&!admitted)throw Error('请先读取演示笔记。')
   if(method==='save'){
    if(persistence)return persistence.bridge.request('save',input)
    if(input.revision!==saved.revision)return {status:'conflict',saved:structuredClone(saved)}
    saved={...structuredClone(input.content as NoteContent),revision:saved.revision+1,updatedAt:Date.now()}
    return {status:'saved',saved:structuredClone(saved)}
   }
   if(method==='engage')return persistence?persistence.bridge.request('engage',input):{ok:true}
   if(native&&persistence&&['conversation-state','menu-sync','menu-close','library-list','library-read','component-render','reply-render','component-menu-capabilities'].includes(method)){
    const result=await persistence.bridge.request(method,input);assert(input);return result
   }
   if(method==='stop'&&native){jobs.get(input.requestId)?.cancel();try{await native.stop(input.requestId)}catch(error){if((error as Error)?.name!=='AbortError')throw error}return {ok:true}}
   if(method==='generate'&&native){
    if(typeof input.requestId!=='string'||!input.requestId||typeof input.prompt!=='string'||!input.prompt.trim()||jobs.has(input.requestId))throw Error('演示笔记生成请求无效。')
    const result=await new Promise<any>((resolve,reject)=>{
     let settled=false
     const finish=(error:unknown,value?:unknown)=>{if(settled)return;settled=true;jobs.delete(input.requestId);error?reject(error):resolve(value)}
     jobs.set(input.requestId,{cancel:()=>finish(new DOMException('演示生成已取消。','AbortError'))})
     void native.generate(input).then(value=>finish(null,value),error=>finish(error))
    })
    await beforeReply?.();assert(input);return result
   }
   if(method==='challenge-stop'){jobs.get(input.requestId)?.cancel();return {ok:true}}
   if(method==='challenge'){
    const value=input as ChallengeRequest
    if(!value.requestId||!['review','optimize','reply'].includes(value.action)||!Array.isArray(value.blocks))throw Error('演示挑战请求无效。')
    if(jobs.has(value.requestId))throw Error('演示挑战正在处理中。')
    await new Promise<void>((resolve,reject)=>{
     let settled=false,timer:ReturnType<typeof setTimeout>|undefined
     const clean=()=>{if(timer!==undefined)clearTimeout(timer);jobs.delete(value.requestId)}
     const finish=()=>{if(settled)return;settled=true;clean();resolve()}
     const fail=(error:unknown)=>{if(settled)return;settled=true;clean();reject(error)}
     jobs.set(value.requestId,{cancel:()=>fail(new DOMException('演示检查已取消。','AbortError'))})
     const duration=value.action==='review'?2000:1700
     if(replyWait)void replyWait(duration).then(finish,fail)
     else timer=setTimeout(finish,duration)
    })
    await beforeReply?.();assert(input);return homeNotesGuideChallengeResult(value)
   }
   throw Error('演示笔记不支持此操作：'+method)
  },
  async draft(input){assert(input);if(persistence){if(!admitted)throw Error('请先读取演示笔记。');await persistence.bridge.draft(input)}},
  dispose
 }
}
