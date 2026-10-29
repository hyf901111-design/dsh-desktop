import type {ChallengeRequest,ChallengeResult,ChallengeIssue} from '../shared/notes-challenge'
import type {NotesBridge,NoteContent,SavedNote,NoteLoad} from '../shared/workspace-notes'
import {challengeReplacementScope} from '../shared/notes-challenge'
import type {HomeNotesNativeBridge} from './home-guide-notes-native'
import {HOME_NOTES_GUIDE_SELECTION} from '../../packages/dsh-research-task-runtime/home-notes-guide-contract.js'

export const HOME_NOTES_GUIDE_TITLE='AI算力产业链：从订单增长到利润兑现'
export const HOME_NOTES_CONSENSUS_REPLACEMENT='统一年度与单位后，甲、乙两家机构的2026E归母净利润预测分别为16.8亿元和17.2亿元，样本均值为17.0亿元；丙证券21.0亿元属于2027E，不计入本期。两家样本不能代表市场整体一致预期，也不足以单独支持上调基准情景，仍需补齐覆盖机构、发布时间与盈利兑现证据。'
/** Five authored paragraphs are typed around the two actual inserted components. */
export const HOME_NOTES_GUIDE_WRITING_STAGES=[
 [
  {id:'guide-note-intro',type:'paragraph',content:'研究摘要｜以中际旭创（300308.SZ）作为算力产业链的个股观察标的，关注光互联需求如何传导到交付、收入确认与现金回款。以下公司收入和券商预测均为虚构情景演示数据，不代表中际旭创的真实财报，也不是任何真实机构的投资观点；后续行情面板单独展示实际证券行情、来源和时间，不能用股价涨跌反证这些情景假设。研究首先区分观察对象、演示口径与真实披露，再讨论增长质量和验证路径。'},
  {id:'guide-note-growth',type:'paragraph',content:'根据演示数据，样本公司2025年收入为120亿元，2026年预计收入为132亿元，同比增长20%。两年的Q1至Q4情景收入分别为26、28、30、36亿元与28、30、34、40亿元，年度口径均为四季合计。新增订单主要来自推理集群与存量机房改造，但交付排期、客户验收和供电条件可能改变季度确认节奏，应把订单余额与当期收入分开观察，并用季度结构与年度合计交叉检查增速，而非仅观察最后一季的高点。'}
 ],
 [{id:'guide-note-logic',type:'paragraph',content:HOME_NOTES_GUIDE_SELECTION}],
 [
  {id:'guide-note-consensus-source',type:'paragraph',content:'券商预测截面（截至2026-10-21，以下为演示样本）：甲证券10月20日预测2026E归母净利润16.8亿元；乙证券10月21日预测2026E归母净利润1.72十亿元；丙证券10月21日预测2027E归母净利润21.0亿元。三者盈利定义均为归母净利润，必须逐项核对预测年度、原表单位和报告日期。跟踪上还应对照订单转化率、经营现金流与客户集中度，明确每个结论依赖的证据及失效条件。'},
  {id:'guide-note-consensus',type:'paragraph',content:'汇总三家券商预测截面，2026年归母净利润的一致预期均值为18.3亿元，预测口径一致，可据此上调基准情景。后续保留基准、乐观与审慎三种情景；若收入增长而应收款持续攀升、现金回款落后于收入，或毛利改善来自一次性补贴，应重新评估增长质量，不能以行业热度替代企业层面的盈利兑现证据。'}
 ]
]
export const HOME_NOTES_GUIDE_BLOCKS=HOME_NOTES_GUIDE_WRITING_STAGES.flat()

const issues:ChallengeIssue[]=[
 {blockId:'guide-note-growth',quote:'同比增长20%',category:'contradiction',message:'收入由120亿元增长到132亿元，增幅应为10%，与正文的20%不一致。请统一计算口径。',evidence:[{kind:'note',label:'演示数据计算',blockId:'guide-note-growth',quote:'2025年收入为120亿元，2026年预计收入为132亿元',data:{prior:120,current:132,growthPercent:10}}]},
 {blockId:'guide-note-logic',quote:'订单同比增长即可保证全年净利润翻倍',category:'logic',message:'订单增长不能直接推出净利润翻倍。收入确认、价格、毛利率和费用率都可能改变结果，建议把确定性表述改为有条件的判断。',evidence:[{kind:'note',label:'后文列出的前提',blockId:'guide-note-logic',quote:'产品价格稳定、费用率不变且新增产能立即满产'}]},
 {blockId:'guide-note-consensus',quote:'一致预期均值为18.3亿元，预测口径一致',category:'research',message:'这里混入2027E预测，且未逐项核对原表单位便认定口径一致。先查看三家预测来源，再用同年度、同指标、同单位的有效样本计算；两家样本不能直接称作市场整体一致预期。',evidence:[
  {kind:'consensus',label:'甲证券 · 2026E盈利预测',quote:'2026E归母净利润16.8亿元',data:{'资料性质':'券商预测截面 · 演示样本','报告日期':'2026-10-20','预测年度':'2026E','指标':'归母净利润','原表数值':'16.8亿元','统一口径':'16.8亿元'}},
  {kind:'consensus',label:'乙证券 · 2026E盈利预测',quote:'2026E归母净利润1.72十亿元',data:{'资料性质':'券商预测截面 · 演示样本','报告日期':'2026-10-21','预测年度':'2026E','指标':'归母净利润','原表数值':'1.72十亿元','统一口径':'17.2亿元'}},
  {kind:'consensus',label:'丙证券 · 2027E盈利预测',quote:'2027E归母净利润21.0亿元',data:{'资料性质':'券商预测截面 · 演示样本','报告日期':'2026-10-21','预测年度':'2027E','指标':'归母净利润','原表数值':'21.0亿元','本期处理':'年度不一致，排除出2026E样本'}}
 ]}
]
/** Predetermined findings travel through the same review/replacement contract as a normal note. */
export function homeNotesGuideChallengeResult(request:ChallengeRequest):ChallengeResult{
 const current=issues.filter(issue=>request.blocks.some(block=>block.id===issue.blockId&&block.text.includes(issue.quote)))
 const base:ChallengeResult={version:1,issues:structuredClone(current),coveredBlockIds:request.blocks.map(block=>block.id),completeBlockIds:request.blocks.map(block=>block.id),checks:[{kind:'review',status:'completed',detail:'已核对收入增速、盈利推理前提与预测口径。'},{kind:'consensus',status:'completed',detail:'核对笔记所附三条预测截面的年度、归母口径与单位；有效两家样本均值为17.0亿元，不代表市场整体一致预期。'}]}
 if(request.action==='review')return base
 const issue=current.find(item=>item.blockId===request.thread?.blockId&&item.quote===request.thread?.quote)
 const target=issue&&request.blocks.find(block=>block.id===issue.blockId),scope=target&&issue&&challengeReplacementScope(target.text,issue.quote)
 if(!issue||!scope||'error' in scope)throw Error('演示原文已变化，请重新播放。')
 const consensus=issue.blockId==='guide-note-consensus'
 const replacement=consensus?HOME_NOTES_CONSENSUS_REPLACEMENT:issue.category==='contradiction'?scope.quote.replace('同比增长20%','同比增长10%'):issue.category==='typo'?scope.quote.replace('边际改膳','边际改善'):'订单增长有望带动收入扩张，但全年净利润能否显著提升，仍取决于交付确认、产品价格、毛利率与费用率的共同变化。'
 return {...base,issues:[],reply:{text:consensus?'已把乙证券的1.72十亿元统一为17.2亿元，排除2027E样本；按两家2026E预测计算均值17.0亿元，并补充覆盖不足与基准情景的判断边界。':issue.category==='contradiction'?'已按（132－120）÷120统一增速为10%，保留其余收入确认分析。':issue.category==='typo'?'已修正错字，保留原有研究表述。':'已补充利润兑现的必要前提，避免把订单增长等同于确定的盈利结果。',replacement}}
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
   if(method==='stop'&&native){jobs.get(input.requestId)?.cancel();await native.stop(input.requestId);return {ok:true}}
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
