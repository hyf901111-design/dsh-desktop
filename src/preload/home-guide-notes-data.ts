import type {ChallengeRequest,ChallengeResult,ChallengeIssue} from '../shared/notes-challenge'
import type {NotesBridge,NoteContent,SavedNote,NoteLoad} from '../shared/workspace-notes'
import {challengeReplacementScope} from '../shared/notes-challenge'
import type {HomeNotesNativeBridge} from './home-guide-notes-native'
import {HOME_NOTES_GUIDE_SELECTION,HOME_NOTES_STYLE_ISSUE,HOME_NOTES_REWRITE_RESULT,HOME_NOTES_REPORT_SOURCES,HOME_NOTES_RESEARCH_FACTS} from '../../packages/dsh-research-task-runtime/home-notes-guide-contract.js'
export const HOME_NOTES_GUIDE_TITLE="中际旭创｜增长兑现与估值复盘"
export const HOME_NOTES_GROWTH_REPLACEMENT="二季度收入由半年累计数减去一季度测算为222.81亿元，同比增长174.57%、环比增长14.29%。"
export const HOME_NOTES_CONSENSUS_REPLACEMENT="上半年收入417.78亿元、归母净利润136.51亿元，但经营现金流净额18.00亿元、同比下降44.08%，利润扩张与当期现金回笼并不同步。公司解释主要是采购商品支付的现金增加。后续需结合营运资本、回款和估值情景复核，不能仅凭盈利增长认定现金质量改善或估值安全。"
export const HOME_NOTES_GUIDE_WRITING_STAGES=[[{"id":"guide-note-intro","type":"paragraph","content":"复盘重点是增长兑现与估值之间的关系。以2026年中报为经营观察基础，并将2025年10月23日至2026年10月23日的股价与沪深300价格指数统一归一为100。历史价格比较与财务统计分开处理，避免用当前报价替代历史样本。"},{"id":"guide-note-growth","type":"paragraph","content":"二季度收入由半年累计数减去一季度测算为222.81亿元，同比增长174.57%、环比增长174.57%。收入规模继续提高，但季度数据需要与累计口径逐项衔接，不能把单季增幅直接外推全年。"}],[{"id":"guide-note-consensus","type":"paragraph","content":"上半年收入417.78亿元、归母净利润136.51亿元，经营规模继续扩张。盈利与股价共同上行，说明估值已有充分安全边际，新增投入也已转化为同等质量的现金回报。后续主要观察收入与利润即可，现金流和估值敏感性可以适当降低权重。"}],[{"id":"guide-note-logic","type":"paragraph","content":"一年窗口内，中际旭创前复权收盘价由438.686元升至612.630元，价格收益39.65%；沪深300同期下跌10.88%，简单收益差为50.53个百分点。该差值仅描述固定历史区间，未计分红再投资和交易成本，不代表未来收益或主动策略超额。"},{"id":"guide-note-cashflow","type":"paragraph","content":"接下来仍需把新增资本投入、营运资本占用与经营现金回款放在同一张检查清单中。后续将持续密切关注相关业务及各项指标的进一步变化情况。估值判断应保留情景边界，证据变化再调整结论。"}]]
export const HOME_NOTES_GUIDE_BLOCKS=HOME_NOTES_GUIDE_WRITING_STAGES.flat()
/** The source is the official HTML table; no PDF or page number is invented. */
export const HOME_NOTES_REPORT_EVIDENCE:ChallengeIssue['evidence']=HOME_NOTES_REPORT_SOURCES.map(source=>({kind:'consensus',label:source.label,quote:'按报告元值核算：2026H1收入41777861795.03元，Q1收入19496398083.95元；2025Q2收入8114898350.57元。',data:{'原始报告':source.url,'表格与页码':source.section,'报告期间':source.period,'原始单位':'元；展示金额按亿元四舍五入','二季度收入差额':'41777861795.03 - 19496398083.95 = 22281463711.08元 ≈ 222.81亿元','同比计算':'(22281463711.08 / 8114898350.57 - 1) × 100 = 174.57%','环比计算':'(22281463711.08 / 19496398083.95 - 1) × 100 = 14.29%','现金流核对':'2026H1经营现金流净额1799674832.02元，约18.00亿元，同比-44.08%；半年报第26页解释采购支付现金增加','统计边界':'单季收入为已披露累计数差额测算；与价格曲线独立，不是预测或机构一致预期。'}}))
const draft=(id:string)=>HOME_NOTES_GUIDE_BLOCKS.find(block=>block.id===id)!.content
const issues:ChallengeIssue[]=[
 {blockId:'guide-note-consensus',quote:draft('guide-note-consensus'),category:'logic',message:'盈利扩张不能直接推出估值安全或现金质量同步改善。半年报经营现金流同比下降44.08%，需结合采购支出、营运资本和回款检验增长兑现。',evidence:HOME_NOTES_REPORT_EVIDENCE},
 {blockId:'guide-note-growth',quote:'环比增长174.57%',category:'contradiction',message:'这里把同比174.57%写成了环比。按半年减一季度得到二季度收入，再与一季度比较，环比应约14.29%；请核对原始报告元值。',evidence:HOME_NOTES_REPORT_EVIDENCE},
 {blockId:'guide-note-cashflow',quote:HOME_NOTES_STYLE_ISSUE,category:'grammar',message:'这句表达重复且没有落到具体观察项。可写清下次先核对什么、依据变化后如何调整判断。',evidence:[{kind:'note',label:'待细化的后续观察',blockId:'guide-note-cashflow',quote:HOME_NOTES_STYLE_ISSUE}]}
]
/** Local replay uses the original comment and sentence replacement authority. */
export function homeNotesGuideChallengeResult(request:ChallengeRequest):ChallengeResult{
 const current=issues.filter(issue=>request.blocks.some(block=>block.id===issue.blockId&&block.text.includes(issue.quote)))
 const base:ChallengeResult={version:1,issues:structuredClone(current),coveredBlockIds:request.blocks.map(block=>block.id),completeBlockIds:request.blocks.map(block=>block.id),checks:[{kind:'review',status:'completed',detail:'已检查整段估值与现金转化推理、季度环比计算和一句后续观察的表达。'}]}
 if(request.action==='review')return base
 const issue=current.find(item=>item.blockId===request.thread?.blockId&&item.quote===request.thread?.quote)
 const target=issue&&request.blocks.find(block=>block.id===issue.blockId),scope=target&&issue&&challengeReplacementScope(target.text,issue.quote)
 if(!issue||!scope||'error' in scope)throw Error('演示原文已变化，请重新播放。')
 const logic=issue.category==='logic',statistic=issue.category==='contradiction'
 const replacement=logic?HOME_NOTES_CONSENSUS_REPLACEMENT:statistic?scope.quote.replace('环比增长174.57%','环比增长14.29%'):HOME_NOTES_REWRITE_RESULT
 return {...base,issues:[],reply:{text:logic?'已保留收入和盈利事实，补上经营现金流证据，区分增长兑现、现金转化和估值判断。':statistic?'已核对三份原始报告的元值，用单季收入差额重新计算环比约14.29%，仅修正此处统计。':'已去除空泛重复，改成下一次复盘可执行的核对事项。',replacement}}
}

export type HomeNotesGuideBridge=NotesBridge&{dispose():void}
/** Only this prepared session reaches storage; challenge responses stay local. */
export function createHomeNotesGuideBridge(sessionId:string,signal:AbortSignal,beforeReply?:()=>Promise<void>,persistence?:{bridge:NotesBridge;fresh:boolean},replyWait?:(ms:number)=>Promise<void>,native?:Pick<HomeNotesNativeBridge,'generate'|'stop'>,menu?:{sync(input:any):void;close(id?:string):void;dispose():void}):HomeNotesGuideBridge{
 let closed=false,saved:SavedNote={title:'',blocks:[],yjs:'',revision:0,updatedAt:Date.now()}
 let admitted=!persistence
 const jobs=new Map<string,{cancel:()=>void}>()
 const assert=(input:{sessionId?:string})=>{if(closed||signal.aborted)throw signal.reason||new DOMException('演示已结束。','AbortError');if(input?.sessionId!==sessionId)throw Error('演示笔记会话不匹配。')}
 const dispose=()=>{if(closed)return;closed=true;menu?.dispose();for(const job of jobs.values())job.cancel();jobs.clear();signal.removeEventListener('abort',dispose)}
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
   if(native&&menu&&method==='menu-sync'){menu.sync(input);return{ok:true}}
   if(native&&menu&&method==='menu-close'){menu.close(input.menuId);return{ok:true}}
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
