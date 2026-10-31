import styles from './home-guides.css?raw'
import {emitNotesGuideDiagnostic} from './notes-guide-diagnostics'
import {NOTES_GUIDE_STEPS,notesGuideFailureReason,type NotesGuideDiagnosticPhase,type NotesGuideDiagnosticReason} from '../shared/notes-guide-diagnostics'
import { HOME_WORKBENCH_STEPS } from '../../packages/dsh-research-task-runtime/home-workbench-contract.js'
import { createHomeGuideTimeline, type GuideTimeline } from './home-guide-timeline'
import {createHomeGuidePointer, type HomeGuidePointerAction} from './home-guide-pointer'
import type {HomeOperationActionContext} from './home-operations'
import {playExploreHomeGuideEntry,waitForHomeGuideNativeView} from './home-guide-explore-entry'
import {createHomeGuideEntryClient} from './home-guide-entry-native'

export type HomeGuideKind = 'board' | 'note' | 'ppt' | 'report' | 'workbench'
export type HomeGuideAdapter = { runStep(step: any): Promise<void>; flush?(): Promise<void>; dispose(): void }
export type HomeGuideMountOptions = { kind?:HomeGuideKind; signal: AbortSignal; runId: string; sessionId: string; cwd: string; fresh: boolean; wait(ms: number, signal?: AbortSignal): Promise<void>; waitUntilPlaying(): Promise<void>; onStatus(text: string): void }
type Adapters = {
 beforeOpen?(session: Session & {kind:HomeGuideKind}): void | Promise<void>
 prepareHandoff?(session: Session & {kind:HomeGuideKind},signal:AbortSignal): void | (()=>void) | Promise<void | (()=>void)>
 revealConversation?():void
 mountNotes(document: Document, host: HTMLElement, options: HomeGuideMountOptions): Promise<HomeGuideAdapter>
 mountWorkbench?(document: Document, host: HTMLElement, options: HomeGuideMountOptions): Promise<HomeGuideAdapter>
 mountPresentation(document: Document, host: HTMLElement, options: HomeGuideMountOptions): Promise<HomeGuideAdapter>
}
type Session = {sessionId: string; cwd: string; title: string; fresh?: boolean}
type Scene = readonly [id: string, title: string, result: string, hold: number]
const EXAMPLES: Record<HomeGuideKind,{title:string;view:string;intro:string;steps:readonly Scene[]}> = {
 workbench:{title:'白酒龙头研究工作台',view:'研究',intro:'从右侧提交研究需求，规划三个页签并逐步生成可联动的研究组件。',steps:HOME_WORKBENCH_STEPS.map(step=>[step.id,step.title,step.result,step.hold] as const)},
 board:{title:'自选行情看板',view:'研究',intro:'搭建六组件研究看板，再用智能容器补充一份自选股研究观察清单。',steps:[
  ['board-library','打开组件库','组件库已打开，先加入市场概览，再展开个股跟踪。',900],
  ['board-indices','加入市场指数','指数概览已加入，先看主要市场的表现。',1400],
  ['board-watchlist','创建自选股列表','自选列表用于统一管理标的，后面的组件会跟随它更新。',1100],
  ['board-quote','放入行情图表','行情图表已加入，先整理市场概览和个股跟踪区域。',1100],
  ['board-arrange-foundation','整理市场概览与个股跟踪','市场指数独占首行，自选和行情并排放在第二行，再补齐资讯与公告。',1800],
  ['board-news','添加相关资讯','资讯面板用于跟踪所选股票的相关消息。',1100],
  ['board-announcements','添加公司公告','公司公告单独保留，便于与行情和资讯对照阅读。',1200],
  ['board-calendar','加入日历工具','日历已加入，可以安排后续研究。',1000],
  ['board-arrange','整理并保存六组件看板','六个组件的布局已整理并保存，接下来连接行情、资讯与公告。',3000],
  ['board-link','连接行情、资讯与公告','自选股切换行情标的，行情再带动相关资讯和公告。',2200],
  ['board-add','补齐自选股，查看五粮液','5只自选股已齐，当前选中五粮液（000858），可以对照行情、资讯和公告。',2200],
  ['board-smart-container','在日历右侧加入智能容器','智能容器已加入，接下来输入研究观察清单的要求。',1000],
  ['board-smart-generate','生成自选股研究观察清单','5只自选股的观察清单已生成并保存，可与行情、资讯和公告对照使用。',3000]
 ]},
 note:{title:'AI 护航研究笔记',view:'笔记',intro:'逐步写作，用空格生成图表、斜杠插入相关行情，再核对专业问题、改写与总结。',steps:[
  ["write","先写下想复盘的问题","先记录观察窗口和待核算的数字，再用空格画图。",1100],
  ["note-chart-compose","用空格画一年价格比较图","按243个共同交易日比较中际旭创前复权股价与沪深300价格指数。",700],
  ["note-chart-review","阅读一年股价与基准曲线","共同起点100，保留完整日频历史；价格比较不等于含息策略收益。",2300],
  ["note-chart-apply","确认图表，继续记录判断","图表已确认，接着写下自己对超额回报的解释。",900],
  ["note-write-middle","记录当前的归因判断","先把判断写出来，随后再用证据检验。",1100],
  ["note-slash-quote","斜杠插入行情面板","使用原生组件库，在当前位置插入行情。",900],
  ["note-quote-configure","搜索中际旭创并查看真实行情","关联300308.SZ，来源和获取时间与固定历史区间独立。",2400],
  ["note-write-tail","补上边界与后续观察","继续写两段，区分当前行情、历史采样和下一步要查的问题。",1100],
  ["challenge","打开AI随航，选择严格","开始检查全文的推理、计算和表达。",800],
  ["review","看三种不同粒度的问题","一整段增长与估值判断、一小段环比统计，还有一句空泛表达。",2100],
  ["consensus-select","打开整段观点的评论气泡","先核对盈利增长是否足以证明现金质量与估值安全。",1300],
  ["consensus-optimize","优化整段归因","保留财务事实，补上现金回款与估值条件。",2100],
  ["consensus-replace","替换这一段","修订保留在原位置，其余段落不变。",1800],
  ["select","打开环比统计的短标记","这里将同比增幅误写成环比，需要回原始报告核算。",1300],
  ["growth-evidence","查看依据，回原表核算","核对公司三份原始报告、累计差额和环比公式。",2600],
  ["optimize","只修正这处统计","环比约14.29%，同比与相邻句子保留。",2100],
  ["replace","替换并保存统计修订","正确数值与核验依据已保留。",1700],
  ["note-select-paragraph","先看表达评论，再框选整段","阅读句内评论后，框选整段后续跟踪安排。",900],
  ["note-rewrite","改写整段后续核验安排","把重复的套话改成下一次复盘可执行的核对事项。",1800],
  ["note-rewrite-apply","替换所选整段","整段跟踪安排已改写，其余段落和组件保留。",1800],
  ["note-task-compose","从右侧请求简短总结","先生成预览，不提前写入正文。",800],
  ["note-task-review","主区生成卡变为内容预览","阅读同一任务的完整短总结，正文此时仍未追加。",2100],
  ["note-task-apply","点击主区卡片的插入笔记","通过公开添加动作，把这条总结追加到末尾。",1200],
  ["note-task-saved","核对末尾内容并保存","总结只加入一次，原有段落、图表、行情与修订均保留。",1200],
  ["note-return-top","自然回到笔记开头","笔记已保存，回到标题看完整复盘。",700]
 ]},
 ppt:{title:'公司风格演示文稿',view:'对话',intro:'从投资研报整理成公司风格汇报，查看需求、内容规划、文件交付和预览。',steps:[
  ['brief','选择 PPT 技能、添加研报并输入要求','公司 PPT 技能和研报附件已加入，制作要求已填写。',1600],
  ['send','发送制作需求','需求与附件已成为会话中可回看的用户消息。',700],
  ['plan','研读资料并规划章节','先区分原报告观点、数据时点和研读判断，再按章节阅读汇报结构。',2600],
  ['layout','整理观点与图表','内容与图表正在整理，随后完成公司模板排版。',2600],
  ['deliver','接收可继续使用的 PPT 文件','文件已经保存到示例工作区。点击交付文件即可打开预览。',1800],
  ['open','打开右侧预览，检查成稿','成稿已在右侧打开。会话、任务记录和文件都会保留。',3200]
 ]},
 report:{title:'公司研究报告',view:'对话',intro:'从研究问题出发，核验公开资料，形成公司研究报告并查看成稿。',steps:[
  ['brief','选择研报技能并输入研究问题','研报写作技能已加入，研究要求已填写。',1600],
  ['send','发送研究需求','研究问题已成为会话中可回看的用户消息。',700],
  ['plan','检索资料并规划研究框架','先明确研究主线，再核对公开披露与关键口径。',2600],
  ['layout','形成观点并整理专业图表','将经营驱动、现金流与风险条件整理成有依据的研究判断。',2600],
  ['deliver','接收完整研究报告','HTML 与 PDF 已保存，可继续阅读并核对数据来源。',1800],
  ['open','打开右侧报告预览','报告已在右侧打开，会话、任务记录和文件都会保留。',3200]
 ]}
}
const aborted=()=>Object.assign(Error('教程已结束。'),{name:'AbortError'})
/** Return the native composer before a tutorial reuses its existing hero. */
export async function playHomeGuideFromOperations(controller:Pick<ReturnType<typeof mountHomeGuides>,'start'>,kind:HomeGuideKind,context:HomeOperationActionContext){
 if(context.signal.aborted)throw aborted()
 await controller.start(kind,{replay:true,entry:context})
}
function exchangeSession(document:Document,input:Record<string,unknown>,signal:AbortSignal):Promise<Session>{
 const win=document.defaultView!
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(aborted());return}
  const requestId=win.crypto.randomUUID()
  const clean=()=>{win.clearTimeout(timer);win.removeEventListener('sherlock:home-guide-session-reply',receive);signal.removeEventListener('abort',cancel)}
  const nativeCancel=()=>win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-session-request',{detail:{requestId,kind:input.kind,command:'cancel'}}))
  const cancel=()=>{clean();nativeCancel();reject(aborted())}
  const receive=(event:Event)=>{const reply=(event as CustomEvent).detail;if(reply?.requestId!==requestId)return;clean();if(!reply.ok||typeof reply.sessionId!=='string'||typeof reply.cwd!=='string')reject(Error(reply.message||'示例工作区尚未就绪，请重试。'));else resolve(reply)}
  const timer=win.setTimeout(()=>{clean();nativeCancel();reject(Error('示例工作区准备超时，请重试。'))},30000)
  win.addEventListener('sherlock:home-guide-session-reply',receive);signal.addEventListener('abort',cancel,{once:true})
  win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-session-request',{detail:{...input,requestId}}))
 })
}
function mountBoard(document:Document,host:HTMLElement,options:HomeGuideMountOptions):Promise<HomeGuideAdapter>{
 const win=document.defaultView!;host.id||='odyssey-home-guide-board-'+options.runId
 let disposed=false;const pending=new Set<()=>void>()
 const exchange=(command:string)=>new Promise<void>((resolve,reject)=>{
  if(disposed||options.signal.aborted){reject(aborted());return}
  const requestId=win.crypto.randomUUID(),deadline=new win.AbortController()
  const clean=()=>{deadline.abort();win.removeEventListener('sherlock:home-guide-native-reply',receive);pending.delete(cancel)}
  const cancel=()=>{clean();reject(aborted())}
  const receive=(event:Event)=>{const reply=(event as CustomEvent).detail;if(reply?.requestId!==requestId||reply.runId!==options.runId)return;clean();reply.ok?resolve():reject(Error(reply.message||'研究教程尚未就绪。'))}
   void options.wait(command==='board-add'?90000:30000,deadline.signal).then(()=>{clean();reject(Error('研究教程尚未就绪，请重试。'))},()=>{})
  pending.add(cancel);win.addEventListener('sherlock:home-guide-native-reply',receive)
  win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-native-request',{detail:{requestId,runId:options.runId,sessionId:options.sessionId,hostId:host.id,command}}))
 })
 const dispose=()=>{if(disposed)return;disposed=true;options.signal.removeEventListener('abort',dispose);for(const cancel of pending)cancel();win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-native-request',{detail:{requestId:win.crypto.randomUUID(),runId:options.runId,sessionId:options.sessionId,hostId:host.id,command:'dispose'}}))}
 options.signal.addEventListener('abort',dispose,{once:true})
 return exchange('mount-board').then(()=>({runStep:async step=>{await options.waitUntilPlaying();await exchange(step)},dispose}),error=>{dispose();throw error})
}

/** Saved examples use normal sessions; this shell owns their autoplay lifetime. */
export function mountHomeGuides(document:Document,adapters:Adapters){
 const win=document.defaultView!,style=document.createElement('style');style.id='odyssey-home-guide-style';style.textContent=styles;document.head.append(style)
 let disposed=false,generation=0,ownedNavigation=0,preparing:{controller:AbortController;source?:string;target?:string}|undefined,closing=Promise.resolve()
 let transition:string|undefined
 type Run={id:string;kind:HomeGuideKind;sessionId:string;abort:AbortController;root:HTMLElement;resident:HTMLElement;center:HTMLElement;content:HTMLElement;adapter?:HomeGuideAdapter;timeline?:GuideTimeline;hiddenPause?:boolean;pointer?:ReturnType<typeof createHomeGuidePointer>;handoff?:()=>void;cleanup():void;status:HTMLElement;diagnosticPhase?:string;pauseReason?:NotesGuideDiagnosticReason;resumeReason?:NotesGuideDiagnosticReason}
 let active:Run|undefined
 const diagnostic=(run:Run,phase:NotesGuideDiagnosticPhase,reason:NotesGuideDiagnosticReason,step?:string,error?:unknown)=>{
  if(run.kind!=='note')return
  try{const index=run.timeline?.snapshot().index??0,current=step??EXAMPLES.note.steps[Math.min(index,EXAMPLES.note.steps.length-1)]?.[0];if(!NOTES_GUIDE_STEPS.includes(current as any))return
   const name=(error as {name?:unknown})?.name,errorName=error===undefined?undefined:name==='AbortError'||name==='TimeoutError'?name:'Error'
   emitNotesGuideDiagnostic({runId:run.id,sessionId:run.sessionId,step:current as typeof NOTES_GUIDE_STEPS[number],phase,reason,...errorName?{errorName}:{}})
  }catch{}
 }
 const selected=()=>[...document.querySelectorAll<HTMLElement>('.pI_x6G_centerCol [data-srb-session-header][data-ework-notes-session]')].find(node=>!node.closest('[data-odyssey-subagent-panel]'))?.dataset.eworkNotesSession
 const releaseTransition=()=>{if(transition&&document.documentElement.dataset.homeGuideTransition===transition){delete document.documentElement.dataset.homeGuideTransition;delete document.documentElement.dataset.homeGuideTransitionSession}transition=undefined}
 const playback=(run:Run,playing:boolean,ending=false)=>win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-playback',{detail:{runId:run.id,sessionId:run.sessionId,playing,...ending?{ending:true}:{}}}))
 const hideCue=()=>active?.pointer?.hide()
 const notices=new Set<HTMLElement>()
 const saveFailure=(message:string)=>{const notice=document.createElement('div');notice.className='odyssey-home-guide-save-error';notice.setAttribute('role','alert');const text=document.createElement('span');text.textContent='示例保存未完成：'+message;const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='关闭';dismiss.addEventListener('click',()=>{notices.delete(notice);notice.remove()});notice.append(text,dismiss);notices.add(notice);document.body.append(notice)}
 const close=(restoreFocus=true,alreadySaved=false,reason:NotesGuideDiagnosticReason='closed'):Promise<void>=>{
  const run=active;if(!run)return closing
  if(reason!=='handoff')diagnostic(run,'cancelled',reason);active=undefined;run.timeline?.dispose();run.pointer?.dispose();playback(run,false,true)
  if(document.documentElement.dataset.homeGuidePointerRun===run.id)delete document.documentElement.dataset.homeGuidePointerRun
  // A save can outlive navigation or wait on persistence. Its old editor stays
  // connected until flush completes, but must not retain input/hover ownership
  // over the resident DOM that React may already be reusing for another view.
  run.cleanup();run.root.style.display='none';run.root.inert=true
  if(run.center.dataset.homeGuideActive===run.id){delete run.center.dataset.homeGuideActive;delete run.center.dataset.homeGuideKind;run.center.style.removeProperty('--odyssey-home-guide-controls-height')}
  if(run.resident.dataset.homeGuideResident===run.id){delete run.resident.dataset.homeGuideResident;delete run.resident.dataset.homeGuideLive}
  if(restoreFocus&&selected()===run.sessionId)run.resident.querySelector<HTMLElement>('[data-srb-tabs] [aria-selected=true]')?.focus({preventScroll:true})
  const finish=()=>{
   try{
    run.root.remove()
    run.handoff?.()
   }finally{run.abort.abort();run.adapter?.dispose()}
  }
  if(alreadySaved||!run.adapter?.flush){finish();return Promise.resolve()}
  run.status.textContent='正在保存示例内容…'
  closing=run.adapter.flush().catch(error=>{saveFailure(error instanceof Error?error.message:'请返回示例后重试。');win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-save-error',{detail:{sessionId:run.sessionId,message:error instanceof Error?error.message:'示例尚未保存，请返回后重试。'}}))}).finally(finish)
  return closing
 }
 const start=async(kind:HomeGuideKind,input:{replay?:boolean;entry?:HomeOperationActionContext}={})=>{
  if(disposed||input.entry?.signal.aborted)throw aborted();if(!(kind in EXAMPLES))throw Error('暂不支持此教程。')
  const token=++generation;preparing?.controller.abort();preparing=undefined
  await close(false,false,'restart');releaseTransition();if(disposed||token!==generation)throw aborted()
  const controller=new win.AbortController(),pending={controller,source:selected(),target:undefined as string|undefined};preparing=pending
  let entryPointer:ReturnType<typeof createHomeGuidePointer>|undefined,mountedOptions:HomeGuideMountOptions|undefined,checkDraft:(()=>void)|undefined,clearEntry=()=>{},clearTakeover=()=>{}
  const id=win.crypto.randomUUID()
  const ensurePending=()=>{if(disposed||controller.signal.aborted||token!==generation)throw aborted();const current=selected();if(current!==pending.source&&current!==pending.target)throw aborted();checkDraft?.()}
  let session:Session,prepared:Session|undefined,preflighted=false,openedFromEntry=false,entryView:Awaited<ReturnType<typeof waitForHomeGuideNativeView>>|undefined
  try{
   if(input.entry?.demoEntry){
    const entry=input.entry,cancel=()=>controller.abort(),original=[...document.querySelectorAll<HTMLTextAreaElement>('textarea')].filter(node=>!node.closest('[data-explore-menu],[data-odyssey-subagent-panel]')).map(node=>({node,value:node.value}))
    // The SDK may reuse these DOM nodes for the prepared session's own draft.
    checkDraft=()=>{if(selected()===pending.source&&original.some(({node,value})=>node.isConnected&&node.value!==value))throw aborted()}
    const takeover=(event:Event)=>{if(event.isTrusted&&preparing===pending)controller.abort()}
    entry.signal.addEventListener('abort',cancel,{once:true});for(const name of ['pointerdown','keydown','beforeinput','input','compositionstart'])document.addEventListener(name,takeover,true)
    clearEntry=()=>{entry.signal.removeEventListener('abort',cancel);for(const name of ['pointerdown','keydown','beforeinput','input','compositionstart'])document.removeEventListener(name,takeover,true);checkDraft=undefined}
    controller.signal.addEventListener('abort',clearEntry,{once:true})
    const gate=async()=>{ensurePending();while(document.hidden||!document.hasFocus()){await new Promise(resolve=>win.setTimeout(resolve,32));ensurePending()}}
    const bounds=entry.demoEntry!.closeTarget.getBoundingClientRect(),origin=entry.origin??{x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2}
    if(!Number.isFinite(origin.x)||!Number.isFinite(origin.y)||origin.x<0||origin.y<0||origin.x>win.innerWidth||origin.y>win.innerHeight)throw aborted()
    entryPointer=createHomeGuidePointer(document,{runId:id,signal:controller.signal,initialPosition:origin,wait:ms=>mountedOptions?mountedOptions.wait(ms):new Promise(resolve=>win.setTimeout(resolve,ms)),waitUntilPlaying:()=>mountedOptions?mountedOptions.waitUntilPlaying():gate()})
    const client=await createHomeGuideEntryClient(document,{runId:id,kind,signal:controller.signal,sourceSessionId:pending.source})
    try{
     await playExploreHomeGuideEntry(document,kind,{homeEmpty:client.homeEmpty,context:entry,signal:controller.signal,pointer:entryPointer,assert:ensurePending,nativeClick:target=>{ownedNavigation++;try{target.click()}finally{ownedNavigation--}},activate:async(target,action,beforeCommit)=>{
      prepared=await client.prepare(target,action);ensurePending();pending.target=prepared.sessionId
      transition=win.crypto.randomUUID();document.documentElement.dataset.homeGuideTransition=transition;document.documentElement.dataset.homeGuideTransitionSession=pending.source
      await adapters.beforeOpen?.({...prepared,kind});ensurePending();preflighted=true
      await beforeCommit();ensurePending()
      let opening:Promise<Session>;ownedNavigation++;try{opening=client.commit(target)}finally{ownedNavigation--}
      await opening;ensurePending();openedFromEntry=true
     }})
     entry.handoff?.();ensurePending()
    }finally{client.dispose()}
   }else if(input.entry){
    const entry=input.entry,center=document.querySelector<HTMLElement>('.pI_x6G_centerCol'),resident=[...(center?.querySelectorAll<HTMLElement>('.wSkVaW_root')??[])].find(node=>!node.closest('[data-odyssey-subagent-panel]'))
    const back=center?.querySelector<HTMLButtonElement>('[data-odyssey-home-operations-toggle]'),card=center?.querySelector<HTMLElement>('.odyssey-operations-usecase'),draft=resident?.querySelector<HTMLTextAreaElement>('textarea')
    if(!pending.source||!center||!resident||!back||!card||!draft||entry.signal.aborted)throw aborted()
    const original=draft.value,edited=()=>controller.abort(),cancel=()=>controller.abort()
    checkDraft=()=>{if(!draft.isConnected||draft.value!==original)throw aborted()}
    entry.signal.addEventListener('abort',cancel,{once:true});for(const name of ['beforeinput','input','compositionstart'])resident.addEventListener(name,edited,true)
    clearEntry=()=>{entry.signal.removeEventListener('abort',cancel);for(const name of ['beforeinput','input','compositionstart'])resident.removeEventListener(name,edited,true);checkDraft=undefined}
    // Native mode changes can replace the original textarea. Keep respecting
    // real user input until the new session has actually taken over the page.
    const takeover=(event:Event)=>{const current=selected();if(event.isTrusted&&preparing===pending&&(current===pending.source||current===pending.target))controller.abort()}
    for(const name of ['beforeinput','input','compositionstart'])document.addEventListener(name,takeover,true)
    clearTakeover=()=>{for(const name of ['beforeinput','input','compositionstart'])document.removeEventListener(name,takeover,true);controller.signal.removeEventListener('abort',clearTakeover)}
    controller.signal.addEventListener('abort',clearTakeover,{once:true})
    const gate=async()=>{ensurePending();while(document.hidden||!document.hasFocus()){await new Promise(resolve=>win.setTimeout(resolve,32));ensurePending()}}
    const bounds=card.getBoundingClientRect(),origin=entry.origin??{x:Math.max(0,bounds.left)+Math.max(0,Math.min(win.innerWidth,bounds.right)-Math.max(0,bounds.left))/2,y:Math.max(0,bounds.top)+Math.max(0,Math.min(win.innerHeight,bounds.bottom)-Math.max(0,bounds.top))/2}
    if(!Number.isFinite(origin.x)||!Number.isFinite(origin.y)||origin.x<0||origin.y<0||origin.x>win.innerWidth||origin.y>win.innerHeight)throw aborted()
    entryPointer=createHomeGuidePointer(document,{runId:id,signal:controller.signal,initialPosition:origin,wait:ms=>mountedOptions?mountedOptions.wait(ms):new Promise(resolve=>win.setTimeout(resolve,ms)),waitUntilPlaying:()=>mountedOptions?mountedOptions.waitUntilPlaying():gate()})
    await entryPointer.perform({target:back,action:'click'});ensurePending()
    if(!back.isConnected||!center.contains(back))throw aborted()
    await entry.revealComposer();ensurePending()
    const view=(kind==='board'||kind==='workbench')?'research':kind==='note'?'notes':undefined,tab=view?resident.querySelector<HTMLButtonElement>('[data-srb-tabs] [data-conversation-view-id="'+view+'"]'):null
    if(view&&!tab)throw Error('示例入口尚未就绪，请重新打开首页。')
    // Keep the real composer visible while native workspace/session preparation
    // runs alongside the pointer. Never expose the old session's empty mode.
    const preparation=exchangeSession(document,{kind,command:'prepare',replay:input.replay===true},controller.signal)
    void preparation.catch(()=>{})
    if(tab)await entryPointer.perform({target:tab,action:'move'});ensurePending()
    prepared=await preparation;ensurePending();pending.target=prepared.sessionId
    await adapters.beforeOpen?.({...prepared,kind});await gate();ensurePending();preflighted=true
    if(tab){
     if(!tab.isConnected||!resident.contains(tab)||tab.disabled||tab.getAttribute('aria-disabled')==='true')throw aborted()
     await entryPointer.perform({target:tab,action:'click'});ensurePending()
    }
    // Transfer cancellation before the expected native mode/session handoff.
    // Real user navigation still aborts this controller.
    entry.handoff?.();clearEntry();ensurePending()
    transition=win.crypto.randomUUID();document.documentElement.dataset.homeGuideTransition=transition;document.documentElement.dataset.homeGuideTransitionSession=pending.source
    if(tab){
     ownedNavigation++;try{tab.click()}finally{ownedNavigation--}
     await Promise.resolve();ensurePending()
     if(!tab.isConnected||tab.getAttribute('aria-selected')!=='true')throw Error('模式入口尚未就绪，请重试。')
    }
   }
   session=prepared??await exchangeSession(document,{kind,command:'prepare',replay:input.replay===true},controller.signal);ensurePending();pending.target=session.sessionId
   transition||=win.crypto.randomUUID();document.documentElement.dataset.homeGuideTransition=transition;if(!input.entry)document.documentElement.dataset.homeGuideTransitionSession=session.sessionId
   if(!preflighted)await adapters.beforeOpen?.({...session,kind});ensurePending();adapters.revealConversation?.();ensurePending()
   let opening:Promise<Session>
   document.documentElement.dataset.homeGuideTransitionSession=session.sessionId
   if(!openedFromEntry){ownedNavigation++;try{opening=exchangeSession(document,{kind,command:'open',sessionId:session.sessionId},controller.signal)}finally{ownedNavigation--};await opening}
   ensurePending()
   const deadline=Date.now()+6000
   while(selected()!==session.sessionId){ensurePending();if(Date.now()>deadline)throw Error('示例会话尚未打开，请重试。');await new Promise(resolve=>win.setTimeout(resolve,32))}
   if(openedFromEntry)entryView=await waitForHomeGuideNativeView(document,session.sessionId,kind,{signal:controller.signal,assert:ensurePending})
   clearEntry();ensurePending()
  }catch(error){clearEntry();clearTakeover();entryPointer?.dispose();if(preparing===pending)preparing=undefined;controller.abort();releaseTransition();throw error}
  clearTakeover()
  if(preparing===pending)preparing=undefined
  const center=entryView?.center??document.querySelector<HTMLElement>('.pI_x6G_centerCol'),resident=entryView?.resident??[...(center?.querySelectorAll<HTMLElement>('.wSkVaW_root')||[])].find(node=>!node.closest('[data-odyssey-subagent-panel]'))
  if(!center||!resident||!resident.isConnected){entryPointer?.dispose();controller.abort();releaseTransition();throw Error('示例页面尚未就绪。')}
  const definition=EXAMPLES[kind],root=document.createElement('section');root.className='odyssey-home-guide';root.dataset.homeGuide=id;root.dataset.kind=kind;root.setAttribute('aria-label',definition.title+' · 示例教程')
  const content=document.createElement('div');content.id='odyssey-home-guide-content-'+id;content.className='odyssey-home-guide-content'+(kind==='note'?' en-root':'');content.dataset.homeGuideContent='';if(kind==='note')content.dataset.homeGuideNotes='';content.dataset.dark=String(document.body.hasAttribute('data-ds-dark-theme'))
  const notice=document.createElement('div');notice.className='odyssey-home-guide-fault';notice.hidden=true;notice.setAttribute('role','alert')
  const status=document.createElement('p');status.className='odyssey-home-guide-status';status.textContent='正在打开已保存的示例…'
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='×';dismiss.setAttribute('aria-label','关闭示例');dismiss.addEventListener('click',()=>{void close(true,false,'dismiss')})
  notice.append(status,dismiss);root.append(content,notice)
  const fault=(message:string)=>{root.dataset.phase='error';notice.hidden=false;status.textContent=message}
  const blocked=new Map<HTMLElement,boolean>()
  const run:Run={id,kind,sessionId:session.sessionId,abort:controller,root,resident,center,content,status,cleanup:()=>{}}
  active=run;resident.dataset.homeGuideResident=id;center.dataset.homeGuideActive=id;center.dataset.homeGuideKind=kind;if(kind==='ppt'||kind==='report'||kind==='workbench')resident.dataset.homeGuideLive='true'
  const blockResident=()=>{if(kind==='ppt'||kind==='report'||kind==='workbench')return;const chrome=resident.querySelector('[data-srb-session-header],.wSkVaW_header');for(const child of resident.children){if(!(child instanceof win.HTMLElement)||child===chrome||child.contains(chrome))continue;if(!blocked.has(child))blocked.set(child,child.inert);child.inert=true}}
  blockResident();center.append(root);releaseTransition();playback(run,false)
  const position=()=>{if(!root.isConnected)return;const bounds=center.getBoundingClientRect(),chrome=resident.querySelector('[data-srb-session-header],.wSkVaW_header')?.getBoundingClientRect(),top=Math.max(bounds.top,chrome?.bottom??bounds.top+44);root.style.left=bounds.left+'px';root.style.top=top+'px';root.style.width=bounds.width+'px';root.style.height=Math.max(1,bounds.bottom-top)+'px'}
  const resize=new win.ResizeObserver(position);resize.observe(center);const chrome=resident.querySelector('[data-srb-session-header],.wSkVaW_header');if(chrome)resize.observe(chrome);win.addEventListener('resize',position);position()
  const context=new win.MutationObserver(()=>{if(active!==run)return;const reason=selected()!==run.sessionId?'owner-changed':!resident.isConnected?'source-removed':document.querySelector('.VOzbGW_overlay')?'settings-opened':document.body.hasAttribute('data-workspace-surface')?'surface-changed':undefined;if(reason)void close(false,false,reason);else blockResident()})
  context.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-ework-notes-session','data-workspace-surface']})
  run.cleanup=()=>{resize.disconnect();context.disconnect();win.removeEventListener('resize',position);for(const[body,inert]of blocked)body.inert=inert}
  const guideTab=(kind==='board'||kind==='workbench')?'research':kind==='note'?'notes':'chat',tab=resident.querySelector<HTMLButtonElement>('[data-srb-tabs] [data-conversation-view-id="'+guideTab+'"]')
  if(!input.entry?.demoEntry){ownedNavigation++;try{if(tab?.getAttribute('aria-selected')!=='true')tab?.click()}finally{ownedNavigation--}}
  const ensure=()=>{if(active!==run||controller.signal.aborted||selected()!==run.sessionId)throw aborted()}
  const options:HomeGuideMountOptions={kind,signal:controller.signal,sessionId:run.sessionId,cwd:session.cwd,runId:id,fresh:session.fresh!==false,waitUntilPlaying:()=>run.timeline?run.timeline.waitUntilPlaying():Promise.resolve(),wait:(ms,signal)=>run.timeline?run.timeline.wait(ms,signal):new Promise((resolve,reject)=>{const signals=[controller.signal,...(signal?[signal]:[])];if(signals.some(item=>item.aborted)){reject(aborted());return}const clean=()=>{win.clearTimeout(timer);for(const item of signals)item.removeEventListener('abort',stop)},stop=()=>{clean();reject(aborted())},timer=win.setTimeout(()=>{clean();resolve()},ms);for(const item of signals)item.addEventListener('abort',stop,{once:true})}),onStatus:text=>{if(active===run)status.textContent=text}}
  mountedOptions=options;run.pointer=entryPointer??createHomeGuidePointer(document,options);document.documentElement.dataset.homeGuidePointerRun=id
  try{
   // Saved workbenches already hydrate through the ordinary native canvas.
   // The generation actor only accepts a new, empty session.
   if(kind==='workbench'&&session.fresh===false){await close(false,true);return}
   const adapter=await(kind==='board'?mountBoard(document,content,options):kind==='note'?adapters.mountNotes(document,content,options):kind==='workbench'?adapters.mountWorkbench?.(document,content,options):adapters.mountPresentation(document,content,options))
   if(!adapter)throw Error('工作台演示尚未就绪，请重试。')
   if(active!==run||controller.signal.aborted){adapter.dispose();throw aborted()}run.adapter=adapter;ensure()
   if(session.fresh===false){await close(false,true);return}
   const handoffSaved=async()=>{
    const current=()=>{ensure();if(token!==generation||!root.isConnected||!resident.isConnected||!center.contains(resident))throw aborted()}
    current();diagnostic(run,'handoff-start','handoff');await (adapter.flush?.()??Promise.resolve());current()
    const handoff=await adapters.prepareHandoff?.({...session,kind},controller.signal);current()
    if(handoff)run.handoff=handoff;diagnostic(run,'handoff-end','handoff');await close(false,true,'handoff')
   }
   const scenes:readonly Scene[]=definition.steps
   run.timeline=createHomeGuideTimeline({steps:scenes.map(([id,,,hold])=>({id,hold})),run:async step=>{
    ensure();diagnostic(run,'step-start','playback',step)
    try{
     await adapter.runStep(step);ensure()
     if(kind==='workbench'&&step==='wb-03'||kind==='board'&&step==='board-indices'||kind==='note'&&step==='write'||(kind==='ppt'||kind==='report')&&step==='send'){
      await options.waitUntilPlaying();ensure()
      await exchangeSession(document,{kind,command:'activate-title',sessionId:run.sessionId},controller.signal);ensure()
     }
     diagnostic(run,'step-end','step-complete',step)
    }catch(error){diagnostic(run,'step-fail',notesGuideFailureReason(error),step,error);throw error}
   },onChange:state=>{
    if(active!==run||state.phase==='disposed')return
    if(run.diagnosticPhase!==state.phase){
     if(state.phase==='paused')diagnostic(run,'paused',run.pauseReason??'timeline-paused')
     else if(state.phase==='playing')diagnostic(run,'resumed',run.resumeReason??'playback')
     else if(state.phase==='completed')diagnostic(run,'completed','step-complete')
     run.diagnosticPhase=state.phase;run.pauseReason=undefined;run.resumeReason=undefined
    }
    playback(run,state.phase==='playing');root.dataset.phase=state.phase
    if(state.phase==='completed'){hideCue();void handoffSaved().catch(error=>{diagnostic(run,'handoff-fail',notesGuideFailureReason(error),undefined,error);if(active===run)fault(error instanceof Error?error.message:'示例尚未保存，请重试。')})}
    else if(state.holding){status.textContent=scenes[state.index]?.[2]||''}
    else if(state.index===0)status.textContent=definition.intro
   },onError:error=>{if(active!==run)return;playback(run,false);hideCue();fault(error instanceof Error?error.message:'演示已中断，可结束演示查看已保留内容。');if(kind==='note'&&(error as {name?:string})?.name!=='AbortError'&&document.documentElement.dataset.homeGuidePointerRun===run.id)void handoffSaved().catch(error=>{diagnostic(run,'handoff-fail',notesGuideFailureReason(error),undefined,error);if(active===run)fault(error instanceof Error?error.message:'示例尚未保存，请重试。')})}})
   run.timeline.play();visibility()
  }catch(error){if(active!==run||controller.signal.aborted)throw error;playback(run,false);fault(error instanceof Error?error.message:'示例尚未就绪，请重试。')}
 }
 const changed=()=>{if(preparing){const current=selected();if(current===preparing.source||current===preparing.target)return;preparing.controller.abort();preparing=undefined;generation++;releaseTransition()}if(active&&selected()!==active.sessionId)void close(false,false,'owner-changed')}
 const navigate=(event:Event)=>{if(ownedNavigation)return;const target=(event.target as Element)?.closest?.('[data-srb-tabs] button,[data-dsh-sidebar-root] button,[data-dsh-sidebar-root] [role=row]');if(!target||target.matches('[data-dsh-sidebar-root] button.hHd-Xa_toggle'))return;if(preparing){preparing.controller.abort();preparing=undefined;generation++;releaseTransition()}if(active&&!active.root.contains(target))void close(false,false,'navigation')}
 const escape=(event:KeyboardEvent)=>{if((active||preparing)&&event.key==='Escape'){event.preventDefault();if(preparing){generation++;preparing.controller.abort();preparing=undefined;releaseTransition()}void close(true,false,'escape')}}
 // The native note reviewer also pauses on window blur. Its actor must share
 // that gate so background time cannot consume a foreground review budget.
 const visibility=()=>{const run=active;if(!run?.timeline)return;if(document.hidden||(run.kind==='note'||run.kind==='workbench')&&!document.hasFocus()){if(run.timeline.snapshot().phase==='playing'){run.hiddenPause=true;run.pauseReason=document.hidden?'document-hidden':'window-blur';run.timeline.pause()}}else if(run.hiddenPause){run.hiddenPause=false;run.resumeReason='foreground-restored';run.timeline.play()}}
 const cueTarget=(value:any,key:'target'|'fromTarget')=>{
  const token=value?.[key+'Token']
  if(token===undefined)return value?.[key]
  if(typeof token!=='string'||typeof value.runId!=='string'||typeof value.requestId!=='string'||token!==value.runId+':'+value.requestId+':'+(key==='target'?'target':'from'))return undefined
  const matches=[...document.querySelectorAll<HTMLElement>('[data-home-guide-cue-target]')].filter(node=>node.getAttribute('data-home-guide-cue-target')===token)
  return matches.length===1?matches[0]:undefined
 }
 const showCue=(event:Event)=>{
  const value=(event as CustomEvent).detail,run=active,target=cueTarget(value,'target'),fromTarget=cueTarget(value,'fromTarget')
  const reply=(ok:boolean,message?:string)=>{if(typeof value?.requestId==='string')win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:value.runId,requestId:value.requestId,ok,message}}))}
  if(!run||value?.runId!==run.id||!(target instanceof win.HTMLElement)||!target.isConnected||selected()!==run.sessionId){reply(false,'操作目标已变化。');return}
  if(typeof value.label==='string')run.status.textContent=value.label
  if(!run.pointer){reply(false,'指针尚未就绪。');return}
  const selection=run.kind==='note'&&value.action==='drag'&&value.selection===true&&typeof value.requestId==='string'&&value.targetToken===run.id+':'+value.requestId+':target'&&value.fromTargetToken===run.id+':'+value.requestId+':from'
  const onFrame:HomeGuidePointerAction['onFrame']=selection?frame=>{
   if(active!==run||run.abort.signal.aborted||selected()!==run.sessionId)throw aborted()
   win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-cue-progress',{detail:{runId:run.id,requestId:value.requestId,...frame}}))
  }:undefined
  void run.pointer.perform({target,action:value.action,fromTarget,onFrame} as HomeGuidePointerAction).then(()=>{
   if(active===run&&!run.abort.signal.aborted&&selected()===run.sessionId&&target.isConnected)reply(true);else reply(false,'操作已取消。')
  },error=>reply(false,error instanceof Error?error.message:'操作未完成。'))
 }
 win.addEventListener('sherlock:home-action-context-changed',changed);win.addEventListener('sherlock:skill-menu-reset',changed);win.addEventListener('sherlock:home-guide-cue',showCue)
 document.addEventListener('keydown',escape,true);document.addEventListener('click',navigate,true);document.addEventListener('visibilitychange',visibility);win.addEventListener('blur',visibility);win.addEventListener('focus',visibility)
 return{start,reset:(restoreFocus=true)=>{generation++;preparing?.controller.abort();preparing=undefined;releaseTransition();return close(restoreFocus,false,'reset')},dispose:async()=>{if(disposed)return;disposed=true;generation++;preparing?.controller.abort();preparing=undefined;await close(false,false,'disposed');releaseTransition();win.removeEventListener('sherlock:home-action-context-changed',changed);win.removeEventListener('sherlock:skill-menu-reset',changed);win.removeEventListener('sherlock:home-guide-cue',showCue);document.removeEventListener('keydown',escape,true);document.removeEventListener('click',navigate,true);document.removeEventListener('visibilitychange',visibility);win.removeEventListener('blur',visibility);win.removeEventListener('focus',visibility);for(const notice of notices)notice.remove();notices.clear();style.remove()}}
}
