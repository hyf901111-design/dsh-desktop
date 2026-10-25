import styles from './home-guides.css?raw'
import { createHomeGuideTimeline, type GuideTimeline } from './home-guide-timeline'
import {createHomeGuidePointer, type HomeGuidePointerAction} from './home-guide-pointer'

export type HomeGuideKind = 'board' | 'note' | 'ppt'
export type HomeGuideAdapter = { runStep(step: any): Promise<void>; flush?(): Promise<void>; dispose(): void }
export type HomeGuideMountOptions = { signal: AbortSignal; runId: string; sessionId: string; cwd: string; fresh: boolean; wait(ms: number, signal?: AbortSignal): Promise<void>; waitUntilPlaying(): Promise<void>; onStatus(text: string): void }
type Adapters = {
 beforeOpen?(session: Session & {kind:HomeGuideKind}): void | Promise<void>
 revealConversation?():void
 mountNotes(document: Document, host: HTMLElement, options: HomeGuideMountOptions): Promise<HomeGuideAdapter>
 mountPresentation(document: Document, host: HTMLElement, options: HomeGuideMountOptions): Promise<HomeGuideAdapter>
}
type Session = {sessionId: string; cwd: string; title: string; fresh?: boolean}
type Scene = readonly [id: string, title: string, result: string, hold: number]
const EXAMPLES: Record<HomeGuideKind,{title:string;view:string;intro:string;steps:readonly Scene[]}> = {
 board:{title:'自选行情看板',view:'研究',intro:'搭建六组件研究看板，再用智能容器补充一份自选股研究观察清单。',steps:[
  ['board-library','打开组件库','组件库已打开，先加入市场概览，再展开个股跟踪。',900],
  ['board-indices','加入市场指数','指数概览已加入，先看主要市场的表现。',1400],
  ['board-watchlist','创建自选股列表','自选列表用于统一管理标的，后面的组件会跟随它更新。',1100],
  ['board-quote','放入行情图表','行情图表已加入，接着补齐个股资讯和公司公告。',1100],
  ['board-news','添加相关资讯','资讯面板用于跟踪所选股票的相关消息。',1100],
  ['board-announcements','添加公司公告','公司公告单独保留，便于与行情和资讯对照阅读。',1200],
  ['board-calendar','加入日历工具','日历已加入，可以安排后续研究。',1000],
  ['board-link','连接行情、资讯与公告','自选股切换行情标的，行情再带动相关资讯和公告。',2200],
  ['board-add','补齐自选股，查看五粮液','5只自选股已齐，当前选中五粮液（000858），可以对照行情、资讯和公告。',2200],
  ['board-arrange','整理并保存六组件看板','六个组件已分层排列并保存，接着在日历旁补充研究清单。',3000],
  ['board-smart-container','在日历右侧加入智能容器','智能容器已加入，接下来输入研究观察清单的要求。',1000],
  ['board-smart-generate','生成自选股研究观察清单','5只自选股的观察清单已生成并保存，可与行情、资讯和公告对照使用。',3000]
 ]},
 note:{title:'AI 护航研究笔记',view:'笔记',intro:'整理研究笔记，用严格挑战核对数据，再从右侧发送优化任务，并改写选中段落。',steps:[
  ['write','整理研究笔记','笔记已写入。接下来用 AI 挑战检查其中的文字、数据和观点。',1300],
  ['challenge','打开 AI 挑战，选择严格','已选择严格模式，准备核对全文。',800],
  ['review','查看全文检查结果','标记指出了错别字、收入增速矛盾，以及缺少依据的结论。',2400],
  ['select','打开收入增速的标记','这段文字与前文的收入数据不一致，先看核对依据。',2400],
  ['optimize','生成修订建议','优化建议已经给出，先阅读，再替换回正文。',2500],
  ['replace','替换原文并保存','收入增速已统一为 10%，接着核对券商预测的年度与单位。',2500],
  ['consensus-select','核对券商一致预期的标记','这处问题混用了预测年度与单位，先查看三家演示样本。',1800],
  ['consensus-evidence','阅读三家预测来源','核对每家机构的报告日期、预测年度、归母口径与原表单位。',2800],
  ['consensus-optimize','生成一致口径的修订建议','仅使用两家2026E样本计算17.0亿元，并说明它不代表市场整体一致预期。',2400],
  ['consensus-replace','替换并保存一致预期判断','年度与单位已统一，原始意见、修订内容和覆盖边界仍可回看。',2200],
  ['note-task-compose','从右侧发送笔记优化任务','优化任务已发送，正在结合当前笔记整理研究摘要。',800],
  ['note-task-review','阅读 AI 整理的研究摘要','摘要保留了数据口径、证据链与风险条件，先读建议再采纳。',2400],
  ['note-task-apply','把研究摘要加入正文','研究摘要已添加至正文，原有内容与挑战记录仍可回看。',1800],
  ['note-select-paragraph','选中需要改写的段落','已选中盈利判断段落，接下来的建议只针对这段文字。',900],
  ['note-rewrite','让 AI 改写选中段落','改写建议保留原意，并把利润兑现的必要前提说得更清楚。',2200],
  ['note-rewrite-apply','替换所选并保存','所选段落已替换，笔记、两次任务回复和采纳状态均已保留。',2500],
  ['note-return-top','回到笔记开头','笔记与修订已保存，回到标题查看完整成果。',700]
 ]},
 ppt:{title:'公司风格演示文稿',view:'对话',intro:'从投资研报整理成公司风格汇报，查看需求、内容规划、文件交付和预览。',steps:[
  ['brief','选择 PPT 技能、添加研报并输入要求','公司 PPT 技能和研报附件已加入，制作要求已填写。',1600],
  ['send','发送制作需求','需求与附件已成为会话中可回看的用户消息。',700],
  ['plan','研读资料并规划章节','先区分原报告观点、数据时点和研读判断，再按章节阅读汇报结构。',2600],
  ['layout','整理观点与图表','内容与图表正在整理，随后完成公司模板排版。',2600],
  ['deliver','接收可继续使用的 PPT 文件','文件已经保存到示例工作区。点击交付文件即可打开预览。',1800],
  ['open','打开右侧预览，检查成稿','成稿已在右侧打开。会话、任务记录和文件都会保留。',3200]
 ]}
}
const aborted=()=>Object.assign(Error('教程已结束。'),{name:'AbortError'})
/** Return the native composer before a tutorial reuses its existing hero. */
export async function playHomeGuideFromOperations(controller:Pick<ReturnType<typeof mountHomeGuides>,'start'>,kind:HomeGuideKind,context:{signal:AbortSignal;revealComposer():Promise<void>}){
 if(context.signal.aborted)throw aborted()
 await context.revealComposer()
 if(context.signal.aborted)throw aborted()
 await controller.start(kind,{replay:true})
}
function exchangeSession(document:Document,input:Record<string,unknown>,signal:AbortSignal):Promise<Session>{
 const win=document.defaultView!
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(aborted());return}
  const requestId=win.crypto.randomUUID()
  const clean=()=>{win.clearTimeout(timer);win.removeEventListener('sherlock:home-guide-session-reply',receive);signal.removeEventListener('abort',cancel)}
  const cancel=()=>{clean();reject(aborted())}
  const receive=(event:Event)=>{const reply=(event as CustomEvent).detail;if(reply?.requestId!==requestId)return;clean();if(!reply.ok||typeof reply.sessionId!=='string'||typeof reply.cwd!=='string')reject(Error(reply.message||'示例工作区尚未就绪，请重试。'));else resolve(reply)}
  const timer=win.setTimeout(()=>{clean();reject(Error('示例工作区准备超时，请重试。'))},30000)
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
 type Run={id:string;kind:HomeGuideKind;sessionId:string;abort:AbortController;root:HTMLElement;resident:HTMLElement;center:HTMLElement;content:HTMLElement;adapter?:HomeGuideAdapter;timeline?:GuideTimeline;hiddenPause?:boolean;pointer?:ReturnType<typeof createHomeGuidePointer>;cleanup():void;status:HTMLElement}
 let active:Run|undefined
 const selected=()=>[...document.querySelectorAll<HTMLElement>('.pI_x6G_centerCol [data-srb-session-header][data-ework-notes-session]')].find(node=>!node.closest('[data-odyssey-subagent-panel]'))?.dataset.eworkNotesSession
 const releaseTransition=()=>{if(transition&&document.documentElement.dataset.homeGuideTransition===transition){delete document.documentElement.dataset.homeGuideTransition;delete document.documentElement.dataset.homeGuideTransitionSession}transition=undefined}
 const playback=(run:Run,playing:boolean)=>win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-playback',{detail:{runId:run.id,sessionId:run.sessionId,playing}}))
 const hideCue=()=>active?.pointer?.hide()
 const notices=new Set<HTMLElement>()
 const saveFailure=(message:string)=>{const notice=document.createElement('div');notice.className='odyssey-home-guide-save-error';notice.setAttribute('role','alert');const text=document.createElement('span');text.textContent='示例保存未完成：'+message;const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='关闭';dismiss.addEventListener('click',()=>{notices.delete(notice);notice.remove()});notice.append(text,dismiss);notices.add(notice);document.body.append(notice)}
 const close=(restoreFocus=true,alreadySaved=false):Promise<void>=>{
  const run=active;if(!run)return closing
  active=undefined;run.timeline?.dispose();run.pointer?.dispose();playback(run,false)
  if(document.documentElement.dataset.homeGuidePointerRun===run.id)delete document.documentElement.dataset.homeGuidePointerRun
  const finish=()=>{
   run.abort.abort();run.adapter?.dispose();run.cleanup();run.root.remove()
   if(run.center.dataset.homeGuideActive===run.id){delete run.center.dataset.homeGuideActive;delete run.center.dataset.homeGuideKind;run.center.style.removeProperty('--odyssey-home-guide-controls-height')}
   if(run.resident.dataset.homeGuideResident===run.id){delete run.resident.dataset.homeGuideResident;delete run.resident.dataset.homeGuideLive}
   if(restoreFocus&&selected()===run.sessionId)run.resident.querySelector<HTMLElement>('[data-srb-tabs] [aria-selected=true]')?.focus({preventScroll:true})
  }
  if(alreadySaved||!run.adapter?.flush){finish();return Promise.resolve()}
  run.status.textContent='正在保存示例内容…'
  closing=run.adapter.flush().catch(error=>{saveFailure(error instanceof Error?error.message:'请返回示例后重试。');win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-save-error',{detail:{sessionId:run.sessionId,message:error instanceof Error?error.message:'示例尚未保存，请返回后重试。'}}))}).finally(finish)
  return closing
 }
 const start=async(kind:HomeGuideKind,input:{replay?:boolean}={})=>{
  if(disposed)throw aborted();if(!(kind in EXAMPLES))throw Error('暂不支持此教程。')
  const token=++generation;preparing?.controller.abort();preparing=undefined
  await close(false);releaseTransition();if(disposed||token!==generation)throw aborted()
  const controller=new win.AbortController(),pending={controller,source:selected(),target:undefined as string|undefined};preparing=pending
  const ensurePending=()=>{if(disposed||controller.signal.aborted||token!==generation)throw aborted();const current=selected();if(current!==pending.source&&current!==pending.target)throw aborted()}
  let session:Session
  try{
   session=await exchangeSession(document,{kind,command:'prepare',replay:input.replay===true},controller.signal);ensurePending();pending.target=session.sessionId
   transition=win.crypto.randomUUID();document.documentElement.dataset.homeGuideTransition=transition;document.documentElement.dataset.homeGuideTransitionSession=session.sessionId
   await adapters.beforeOpen?.({...session,kind});ensurePending();adapters.revealConversation?.();ensurePending()
   let opening:Promise<Session>
   ownedNavigation++;try{opening=exchangeSession(document,{kind,command:'open',sessionId:session.sessionId},controller.signal)}finally{ownedNavigation--}
   await opening
   ensurePending()
   const deadline=Date.now()+6000
   while(selected()!==session.sessionId){ensurePending();if(Date.now()>deadline)throw Error('示例会话尚未打开，请重试。');await new Promise(resolve=>win.setTimeout(resolve,32))}
  }catch(error){if(preparing===pending)preparing=undefined;controller.abort();releaseTransition();throw error}
  if(preparing===pending)preparing=undefined
  const center=document.querySelector<HTMLElement>('.pI_x6G_centerCol'),resident=[...(center?.querySelectorAll<HTMLElement>('.wSkVaW_root')||[])].find(node=>!node.closest('[data-odyssey-subagent-panel]'))
  if(!center||!resident){controller.abort();releaseTransition();throw Error('示例页面尚未就绪。')}
  const definition=EXAMPLES[kind],id=win.crypto.randomUUID(),root=document.createElement('section');root.className='odyssey-home-guide';root.dataset.homeGuide=id;root.dataset.kind=kind;root.setAttribute('aria-label',definition.title+' · 示例教程')
  const content=document.createElement('div');content.id='odyssey-home-guide-content-'+id;content.className='odyssey-home-guide-content'+(kind==='note'?' en-root':'');content.dataset.homeGuideContent='';if(kind==='note')content.dataset.homeGuideNotes='';content.dataset.dark=String(document.body.hasAttribute('data-ds-dark-theme'))
  const notice=document.createElement('div');notice.className='odyssey-home-guide-fault';notice.hidden=true;notice.setAttribute('role','alert')
  const status=document.createElement('p');status.className='odyssey-home-guide-status';status.textContent='正在打开已保存的示例…'
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='×';dismiss.setAttribute('aria-label','关闭示例');dismiss.addEventListener('click',()=>{void close()})
  notice.append(status,dismiss);root.append(content,notice)
  const fault=(message:string)=>{root.dataset.phase='error';notice.hidden=false;status.textContent=message}
  const blocked=new Map<HTMLElement,boolean>()
  const run:Run={id,kind,sessionId:session.sessionId,abort:controller,root,resident,center,content,status,cleanup:()=>{}}
  active=run;resident.dataset.homeGuideResident=id;center.dataset.homeGuideActive=id;center.dataset.homeGuideKind=kind;if(kind==='ppt')resident.dataset.homeGuideLive='true'
  const blockResident=()=>{if(kind==='ppt')return;const chrome=resident.querySelector('[data-srb-session-header],.wSkVaW_header');for(const child of resident.children){if(!(child instanceof win.HTMLElement)||child===chrome||child.contains(chrome))continue;if(!blocked.has(child))blocked.set(child,child.inert);child.inert=true}}
  blockResident();center.append(root);releaseTransition();playback(run,false)
  const position=()=>{if(!root.isConnected)return;const bounds=center.getBoundingClientRect(),chrome=resident.querySelector('[data-srb-session-header],.wSkVaW_header')?.getBoundingClientRect(),top=Math.max(bounds.top,chrome?.bottom??bounds.top+44);root.style.left=bounds.left+'px';root.style.top=top+'px';root.style.width=bounds.width+'px';root.style.height=Math.max(1,bounds.bottom-top)+'px'}
  const resize=new win.ResizeObserver(position);resize.observe(center);const chrome=resident.querySelector('[data-srb-session-header],.wSkVaW_header');if(chrome)resize.observe(chrome);win.addEventListener('resize',position);position()
  const context=new win.MutationObserver(()=>{if(active!==run)return;if(selected()!==run.sessionId||!resident.isConnected||document.querySelector('.VOzbGW_overlay')||document.body.hasAttribute('data-workspace-surface'))void close(false);else blockResident()})
  context.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-ework-notes-session','data-workspace-surface']})
  run.cleanup=()=>{resize.disconnect();context.disconnect();win.removeEventListener('resize',position);for(const[body,inert]of blocked)body.inert=inert}
  const guideTab=kind==='board'?'research':kind==='note'?'notes':'chat',tab=resident.querySelector<HTMLButtonElement>('[data-srb-tabs] [data-conversation-view-id="'+guideTab+'"]')
  ownedNavigation++;try{if(tab?.getAttribute('aria-selected')!=='true')tab?.click()}finally{ownedNavigation--}
  const ensure=()=>{if(active!==run||controller.signal.aborted||selected()!==run.sessionId)throw aborted()}
  const options:HomeGuideMountOptions={signal:controller.signal,sessionId:run.sessionId,cwd:session.cwd,runId:id,fresh:session.fresh!==false,waitUntilPlaying:()=>run.timeline?run.timeline.waitUntilPlaying():Promise.resolve(),wait:(ms,signal)=>run.timeline?run.timeline.wait(ms,signal):new Promise((resolve,reject)=>{const signals=[controller.signal,...(signal?[signal]:[])];if(signals.some(item=>item.aborted)){reject(aborted());return}const clean=()=>{win.clearTimeout(timer);for(const item of signals)item.removeEventListener('abort',stop)},stop=()=>{clean();reject(aborted())},timer=win.setTimeout(()=>{clean();resolve()},ms);for(const item of signals)item.addEventListener('abort',stop,{once:true})}),onStatus:text=>{if(active===run)status.textContent=text}}
  run.pointer=createHomeGuidePointer(document,options);document.documentElement.dataset.homeGuidePointerRun=id
  try{
   const adapter=await(kind==='board'?mountBoard(document,content,options):kind==='note'?adapters.mountNotes(document,content,options):adapters.mountPresentation(document,content,options))
   if(active!==run||controller.signal.aborted){adapter.dispose();throw aborted()}run.adapter=adapter;ensure()
   if(session.fresh===false){await close(false,true);return}
   const scenes:readonly Scene[]=definition.steps
   run.timeline=createHomeGuideTimeline({steps:scenes.map(([id,,,hold])=>({id,hold})),run:async step=>{ensure();await adapter.runStep(step);ensure()},onChange:state=>{
    if(active!==run||state.phase==='disposed')return
    playback(run,state.phase==='playing');root.dataset.phase=state.phase
    if(state.phase==='completed'){hideCue();void (adapter.flush?.()??Promise.resolve()).then(()=>{if(active===run)void close(false,true)},error=>{if(active===run)fault(error instanceof Error?error.message:'示例尚未保存，请重试。')})}
    else if(state.holding){status.textContent=scenes[state.index]?.[2]||''}
    else if(state.index===0)status.textContent=definition.intro
   },onError:error=>{if(active!==run)return;playback(run,false);hideCue();fault(error instanceof Error?error.message:'演示已中断，可结束演示查看已保留内容。')}})
   run.timeline.play();if(document.hidden){run.hiddenPause=true;run.timeline.pause()}
  }catch(error){if(active!==run||controller.signal.aborted)throw error;playback(run,false);fault(error instanceof Error?error.message:'示例尚未就绪，请重试。')}
 }
 const changed=()=>{if(preparing){const current=selected();if(current===preparing.source||current===preparing.target)return;preparing.controller.abort();preparing=undefined;generation++;releaseTransition()}if(active&&selected()!==active.sessionId)void close(false)}
 const navigate=(event:Event)=>{if(ownedNavigation)return;const target=(event.target as Element)?.closest?.('[data-srb-tabs] button,[data-dsh-sidebar-root] button,[data-dsh-sidebar-root] [role=row]');if(!target||target.matches('[data-dsh-sidebar-root] button.hHd-Xa_toggle'))return;if(preparing){preparing.controller.abort();preparing=undefined;generation++;releaseTransition()}if(active&&!active.root.contains(target))void close(false)}
 const escape=(event:KeyboardEvent)=>{if(active&&event.key==='Escape'){event.preventDefault();void close()}}
 const visibility=()=>{const run=active;if(!run?.timeline)return;if(document.hidden){if(run.timeline.snapshot().phase==='playing'){run.hiddenPause=true;run.timeline.pause()}}else if(run.hiddenPause){run.hiddenPause=false;run.timeline.play()}}
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
  void run.pointer.perform({target,action:value.action,fromTarget} as HomeGuidePointerAction).then(()=>{
   if(active===run&&!run.abort.signal.aborted&&selected()===run.sessionId&&target.isConnected)reply(true);else reply(false,'操作已取消。')
  },error=>reply(false,error instanceof Error?error.message:'操作未完成。'))
 }
 win.addEventListener('sherlock:home-action-context-changed',changed);win.addEventListener('sherlock:skill-menu-reset',changed);win.addEventListener('sherlock:home-guide-cue',showCue)
 document.addEventListener('keydown',escape,true);document.addEventListener('click',navigate,true);document.addEventListener('visibilitychange',visibility)
 return{start,reset:(restoreFocus=true)=>{generation++;preparing?.controller.abort();preparing=undefined;releaseTransition();return close(restoreFocus)},dispose:async()=>{if(disposed)return;disposed=true;generation++;preparing?.controller.abort();preparing=undefined;await close(false);releaseTransition();win.removeEventListener('sherlock:home-action-context-changed',changed);win.removeEventListener('sherlock:skill-menu-reset',changed);win.removeEventListener('sherlock:home-guide-cue',showCue);document.removeEventListener('keydown',escape,true);document.removeEventListener('click',navigate,true);document.removeEventListener('visibilitychange',visibility);for(const notice of notices)notice.remove();notices.clear();style.remove()}}
}
