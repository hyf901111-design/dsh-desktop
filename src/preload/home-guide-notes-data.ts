import type {ChallengeRequest,ChallengeResult,ChallengeIssue} from '../shared/notes-challenge'
import type {NotesBridge,NoteContent,SavedNote} from '../shared/workspace-notes'
import {challengeReplacementScope} from '../shared/notes-challenge'

export const HOME_NOTES_GUIDE_TITLE='AI算力产业链：从订单增长到利润兑现'
export const HOME_NOTES_GUIDE_BLOCKS=[
 {id:'guide-note-intro',type:'paragraph',content:'研究摘要｜本篇使用虚构公司与演示数据，展示如何把行业线索转化为可检验的研究假设。观察重点是订单、收入确认与利润兑现之间的时差，而非仅凭行业热度推导投资结论。'},
 {id:'guide-note-heading1',type:'heading',props:{level:2},content:'一、需求扩张与收入确认'},
 {id:'guide-note-growth',type:'paragraph',content:'根据演示数据，样本公司2025年收入为120亿元，2026年预计收入为132亿元，同比增长20%。新增订单主要来自推理集群与存量机房改造，但交付排期、客户验收和供电条件仍可能影响确认节奏，应把订单余额与当期收入分开观察。'},
 {id:'guide-note-typo',type:'paragraph',content:'供给端的关键变化是产能利用率的边际改膳。先进封装、互联网络与电力基础设施共同决定交付能力，单一环节扩产并不等于整条产业链约束已消除；后续需要交叉验证设备交期、在制品规模与库存周转天数。'},
 {id:'guide-note-heading2',type:'heading',props:{level:2},content:'二、盈利弹性与证据链'},
 {id:'guide-note-logic',type:'paragraph',content:'订单同比增长即可保证全年净利润翻倍。这一判断隐含了产品价格稳定、费用率不变且新增产能立即满产的假设。研究中应分别建立销量、单价、毛利率与费用率的敏感性分析，并追踪现金回款与利润增速是否一致。'},
 {id:'guide-note-evidence',type:'paragraph',content:'下一步验证分为三层：先核对订单口径与重复统计，再比较收入增长和经营现金流，最后检查资本开支能否形成合理回报。若收入增加但应收款持续攀升，需重新评估增长质量；若毛利改善来自一次性补贴，也应从持续盈利中剔除。'},
 {id:'guide-note-heading3',type:'heading',props:{level:2},content:'三、跟踪指标与反证条件'},
 {id:'guide-note-risks',type:'paragraph',content:'核心跟踪指标包括在手订单转化率、交付周期、毛利率、经营现金流与客户集中度。若两期订单转化率连续下降，或现金回款明显落后于收入，应降低对增长兑现速度的判断。所有预测保留基准、乐观与审慎三种情景，并明确每项结论所依赖的证据与失效条件。对估值的讨论应落在可持续自由现金流上，区分行业景气带来的短期溢价与企业竞争优势，避免以单季度高增长外推长期表现。每次更新保留原始假设与修订原因，形成可以回溯的判断记录。'}
]
const issues:ChallengeIssue[]=[
 {blockId:'guide-note-growth',quote:'同比增长20%',category:'contradiction',message:'收入由120亿元增长到132亿元，增幅应为10%，与正文的20%不一致。请统一计算口径。',evidence:[{kind:'note',label:'演示数据计算',blockId:'guide-note-growth',quote:'2025年收入为120亿元，2026年预计收入为132亿元',data:{prior:120,current:132,growthPercent:10}}]},
 {blockId:'guide-note-typo',quote:'边际改膳',category:'typo',message:'“改膳”应为“改善”，建议修正错别字。',evidence:[{kind:'note',label:'同段文字',blockId:'guide-note-typo',quote:'产能利用率的边际改膳'}]},
 {blockId:'guide-note-logic',quote:'订单同比增长即可保证全年净利润翻倍',category:'logic',message:'订单增长不能直接推出净利润翻倍。收入确认、价格、毛利率和费用率都可能改变结果，建议把确定性表述改为有条件的判断。',evidence:[{kind:'note',label:'后文列出的前提',blockId:'guide-note-logic',quote:'产品价格稳定、费用率不变且新增产能立即满产'}]}
]
/** Predetermined findings travel through the same review/replacement contract as a normal note. */
export function homeNotesGuideChallengeResult(request:ChallengeRequest):ChallengeResult{
 const current=issues.filter(issue=>request.blocks.some(block=>block.id===issue.blockId&&block.text.includes(issue.quote)))
 const base:ChallengeResult={version:1,issues:structuredClone(current),coveredBlockIds:request.blocks.map(block=>block.id),completeBlockIds:request.blocks.map(block=>block.id),checks:[{kind:'review',status:'completed',detail:'预置演示检查：错字、数据一致性与推理前提；未调用模型或外部数据。'}]}
 if(request.action==='review')return base
 const issue=current.find(item=>item.blockId===request.thread?.blockId&&item.quote===request.thread?.quote)
 const target=issue&&request.blocks.find(block=>block.id===issue.blockId),scope=target&&issue&&challengeReplacementScope(target.text,issue.quote)
 if(!issue||!scope||'error' in scope)throw Error('演示原文已变化，请重新播放。')
 const replacement=issue.category==='contradiction'?scope.quote.replace('同比增长20%','同比增长10%'):issue.category==='typo'?scope.quote.replace('边际改膳','边际改善'):'订单增长有望带动收入扩张，但全年净利润能否显著提升，仍取决于交付确认、产品价格、毛利率与费用率的共同变化。'
 return {...base,issues:[],reply:{text:issue.category==='contradiction'?'已按（132－120）÷120统一增速为10%，保留其余收入确认分析。':issue.category==='typo'?'已修正错字，保留原有研究表述。':'已补充利润兑现的必要前提，避免把订单增长等同于确定的盈利结果。',replacement}}
}

export type HomeNotesGuideBridge=NotesBridge&{dispose():void}
/** No fallback IPC exists: the demonstration cannot read or write a user's saved note. */
export function createHomeNotesGuideBridge(sessionId:string,signal:AbortSignal,beforeReply?:()=>Promise<void>):HomeNotesGuideBridge{
 let closed=false,saved:SavedNote={title:'',blocks:[],yjs:'',revision:0,updatedAt:Date.now()}
 const jobs=new Map<string,{cancel:()=>void}>()
 const assert=(input:{sessionId?:string})=>{if(closed||signal.aborted)throw signal.reason||new DOMException('演示已结束。','AbortError');if(input?.sessionId!==sessionId)throw Error('演示笔记会话不匹配。')}
 const dispose=()=>{if(closed)return;closed=true;for(const job of jobs.values())job.cancel();jobs.clear();signal.removeEventListener('abort',dispose)}
 signal.addEventListener('abort',dispose,{once:true})
 return {
  async request(method,input){
   assert(input)
   if(method==='load')return {saved:structuredClone(saved)}
   if(method==='save'){
    if(input.revision!==saved.revision)return {status:'conflict',saved:structuredClone(saved)}
    saved={...structuredClone(input.content as NoteContent),revision:saved.revision+1,updatedAt:Date.now()}
    return {status:'saved',saved:structuredClone(saved)}
   }
   if(method==='engage')return {ok:true}
   if(method==='challenge-stop'){jobs.get(input.requestId)?.cancel();return {ok:true}}
   if(method==='challenge'){
    const value=input as ChallengeRequest
    if(!value.requestId||!['review','optimize','reply'].includes(value.action)||!Array.isArray(value.blocks))throw Error('演示挑战请求无效。')
    if(jobs.has(value.requestId))throw Error('演示挑战正在处理中。')
    await new Promise<void>((resolve,reject)=>{
     const finish=()=>{jobs.delete(value.requestId);resolve()}
     const timer=setTimeout(finish,value.action==='review'?550:420)
     jobs.set(value.requestId,{cancel:()=>{clearTimeout(timer);jobs.delete(value.requestId);reject(new DOMException('演示检查已取消。','AbortError'))}})
    })
    await beforeReply?.();assert(input);return homeNotesGuideChallengeResult(value)
   }
   throw Error('演示笔记不支持此操作：'+method)
  },
  async draft(input){assert(input)},
  dispose
 }
}
