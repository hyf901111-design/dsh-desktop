import type {ChallengeRequest,ChallengeResult,ChallengeIssue} from '../shared/notes-challenge'
import type {NotesBridge,NoteContent,SavedNote,NoteLoad} from '../shared/workspace-notes'
import {challengeReplacementScope} from '../shared/notes-challenge'
import type {HomeNotesNativeBridge} from './home-guide-notes-native'
import {HOME_NOTES_GUIDE_SELECTION,HOME_NOTES_REWRITE_RESULT,HOME_NOTES_REPORT_SOURCES,HOME_NOTES_RESEARCH_FACTS} from '../../packages/dsh-research-task-runtime/home-notes-guide-contract.js'

export const HOME_NOTES_GUIDE_TITLE='中际旭创2026中报复盘：增长兑现与现金转化'
export const HOME_NOTES_GROWTH_REPLACEMENT='季度兑现方面，2026年二季度收入按半年累计减一季度测算为222.81亿元，环比增长14.29%，同比2025年二季度增长174.57%。2025年二季度收入81.15亿元来自年报季度表，2026年二季度为累计差额测算；增速均按元原值计算。收入规模继续提升，体现交付兑现；持续性仍需结合高端光模块需求、产能爬坡与客户采购节奏判断。（据2025年报第8页、2026一季报第3页、2026中报第8页）'
export const HOME_NOTES_CONSENSUS_REPLACEMENT='盈利与估值方面，半年归母净利润精确值乘二得到273.02亿元，这只是机械年化情景，不等于公司指引或市场一致预期。当前笔记材料没有可核验的机构预测样本，估值暂不引用“一致预期”口径。全年盈利判断需另行验证下半年交付、产品价格、毛利率和费用变化，不能将一项年化计算当作预测证据。（据2026中报第8页）'
/** Fixed 2026-08-24 report review; only the three marked draft interpretations await self-review. */
export const HOME_NOTES_GUIDE_WRITING_STAGES=[
 [
  {id:'guide-note-intro',type:'paragraph',content:'资料截点为2026年8月24日，本文复盘中际旭创（300308.SZ）2026年中报。上半年公司实现营业收入417.78亿元、归母净利润136.51亿元，分别同比增长182.49%和241.70%；扣非归母净利润130.92亿元，同比增长229.32%。管理层将收入增长主要归因于算力基础设施投入带动1.6T、800G高端光模块销售增加。研究重点应从“增长是否兑现”进一步转向产品结构、交付节奏与现金回款的匹配程度。（据2026中报第8、25页）'},
  {id:'guide-note-growth',type:'paragraph',content:'季度兑现方面，2026年二季度收入按半年累计减一季度测算为222.81亿元，同比增长14.29%，收入规模较一季度进一步抬升。单季变化有助于观察交付集中度，但还需要结合新产品爬坡和客户采购节奏判断持续性，不能仅凭一个季度外推全年。'}
 ],
 [{id:'guide-note-consensus',type:'paragraph',content:'盈利与估值方面，以半年归母净利润精确值机械年化，2026年全年盈利约为273.02亿元，暂将这一数值记为市场一致预期。这个估值分母隐含下半年延续上半年的交付强度与盈利能力，因此仍需观察高端产品占比、价格变化及费用投放能否支持当前利润水平。'}],
 [
  {id:'guide-note-logic',type:'paragraph',content:HOME_NOTES_GUIDE_SELECTION},
  {id:'guide-note-cashflow',type:'paragraph',content:'现金流值得单列观察。上半年经营活动现金流量净额仅18.00亿元，同比下降44.08%，与归母净利润的增速方向相反；公司解释主要与采购商品支付的现金增加有关。后续应交叉核对应收账款、存货周转及付款节奏，区分扩张期备货的阶段性占用与回款质量变化，不能用单期现金流直接否定收入真实性。行情面板用于观察后续价量，数据时点以组件为准，不与本次固定财报复盘口径混用。（据2026中报第8、26页）'}
 ]
]
export const HOME_NOTES_GUIDE_BLOCKS=HOME_NOTES_GUIDE_WRITING_STAGES.flat()
const f=HOME_NOTES_RESEARCH_FACTS
/** The original public evidence renderer links these official URLs and exposes the complete source units. */
export const HOME_NOTES_REPORT_EVIDENCE:ChallengeIssue['evidence']=HOME_NOTES_REPORT_SOURCES.map((source,index)=>({kind:'consensus',label:source.label,
 quote:index===0?'2025年一、二季度营业收入分别为6674176487.23元和8114898350.57元。':index===1?'2026年一季度营业收入19496398083.95元。':'2026年上半年营业收入41777861795.03元，归母净利润13651149693.27元。',
 data:{'资料性质':'公司原始披露 · 合并口径','披露日期':source.publishedAt,'报告期':source.period,'原表单位':'人民币元','PDF页码':source.pages.join('、'),'原始报告':source.url,
  ...(index===0?{'2025Q1收入（元）':f.r25q1,'2025Q2收入（元）':f.r25q2}:index===1?{'2026Q1收入（元）':f.r26q1}:{'2026H1收入（元）':f.r26h1,'H1归母净利润（元）':f.p26h1,'Q2累计差额（元）':'41777861795.03－19496398083.95＝22281463711.08','年化计算':'13651149693.27×2＝27302299386.54元，即273.02亿元；机械情景，非机构预测或公司指引'}),
  '核对口径':index===0?'Q2同比使用2025Q2作基期；同比174.57%。':index===1?'Q2环比使用2026Q1作基期；环比14.29%。':'季度金额按累计差额推算，增速基于元原值；年化不能替代一致预期。'}}))
const draft=(id:string)=>HOME_NOTES_GUIDE_BLOCKS.find(block=>block.id===id)!.content
const issues:ChallengeIssue[]=[
 {blockId:'guide-note-growth',quote:draft('guide-note-growth'),category:'contradiction',message:'季度增速的比较基期不一致。14.29%是二季度相对一季度的环比；同比应使用2025Q2的8114898350.57元作基期，为174.57%。二季度按半年累计减一季度测算，增速必须使用元原值。',evidence:HOME_NOTES_REPORT_EVIDENCE},
 {blockId:'guide-note-consensus',quote:draft('guide-note-consensus'),category:'research',message:'年化测算不是一致预期。273.02亿元是半年归母净利润精确值乘二的机械情景；当前材料没有机构预测样本，不能将它称为市场一致预期或公司指引。',evidence:HOME_NOTES_REPORT_EVIDENCE},
 {blockId:'guide-note-logic',quote:HOME_NOTES_GUIDE_SELECTION,category:'logic',message:'盈利增速不能代替估值安全边际。估值判断需要明确的股价时点、股本和可比盈利分母，增长仍受交付、定价与回款约束。',evidence:[{kind:'note',label:'笔记中的估值论证',blockId:'guide-note-logic',quote:HOME_NOTES_GUIDE_SELECTION}]}
]
/** Predetermined self-review still uses the ordinary comment and sentence-authority contracts. */
export function homeNotesGuideChallengeResult(request:ChallengeRequest):ChallengeResult{
 const current=issues.filter(issue=>request.blocks.some(block=>block.id===issue.blockId&&block.text.includes(issue.quote)))
 const base:ChallengeResult={version:1,issues:structuredClone(current),coveredBlockIds:request.blocks.map(block=>block.id),completeBlockIds:request.blocks.map(block=>block.id),checks:[{kind:'review',status:'completed',detail:'已核对季度同比与环比、盈利年化标签以及估值论证。'},{kind:'财报核验',status:'completed',detail:'原始依据为2025年报、2026一季报与2026中报；季度收入按累计差额推算，精确元值计算同比174.57%、环比14.29%，273.02亿元仅为年化情景。'}]}
 if(request.action==='review')return base
 const issue=current.find(item=>item.blockId===request.thread?.blockId&&item.quote===request.thread?.quote)
 const target=issue&&request.blocks.find(block=>block.id===issue.blockId),scope=target&&issue&&challengeReplacementScope(target.text,issue.quote)
 if(!issue||!scope||'error' in scope)throw Error('演示原文已变化，请重新播放。')
 const consensus=issue.blockId==='guide-note-consensus',growth=issue.blockId==='guide-note-growth'
 const replacement=consensus?HOME_NOTES_CONSENSUS_REPLACEMENT:growth?HOME_NOTES_GROWTH_REPLACEMENT:HOME_NOTES_REWRITE_RESULT
 return {...base,issues:[],reply:{text:consensus?'已把273.02亿元明确为半年归母净利润的机械年化情景，移除未经机构样本支持的一致预期标签，并补充预测假设的验证条件。':growth?'已按公司三份原始披露区分Q2环比14.29%与同比174.57%，说明二季度为累计差额测算，所有增速均使用元原值。':'已把盈利增长与估值安全边际分开，补充明确时点、盈利分母及经营条件。',replacement}}
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
