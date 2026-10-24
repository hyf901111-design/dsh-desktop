import styles from './home-guides.css?raw'
import { createHomeGuideTimeline, type GuideTimeline } from './home-guide-timeline'

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
 board:{title:'自选行情看板',view:'研究',intro:'搭建一个研究看板：自选股控制行情与资讯，最后加入新标的并整理画布。',steps:[
  ['board-library','打开组件库','组件库已打开，先从自选列表开始。',3500],
  ['board-watchlist','创建自选股列表','自选列表用于统一管理标的，后面的组件会跟随它更新。',4200],
  ['board-quote','放入行情图表','行情图表已经加入，接着补齐相关资讯。',3800],
  ['board-news','添加相关资讯','三个组件已就位，现在让它们联动。',3800],
  ['board-link','连接组件，观察联动','切换自选股后，行情与资讯会同步到同一只股票。',5500],
  ['board-add','添加一只自选股','新标的已加入，选中后可以核对两个组件的联动结果。',5500],
  ['board-arrange','整理并保存看板','看板已保存到个人看板。结束演示后，你可以继续操作这些组件。',6000]
 ]},
 note:{title:'AI 护航研究笔记',view:'笔记',intro:'整理一篇研究笔记，再用严格挑战核对错字、数据和推理，最后修订原文。',steps:[
  ['write','整理研究笔记','笔记已写入。接下来用 AI 挑战检查其中的文字、数据和观点。',4500],
  ['challenge','打开 AI 挑战，选择严格','已选择严格模式，准备核对全文。',3000],
  ['review','查看全文检查结果','标记指出了错别字、收入增速矛盾，以及缺少依据的结论。',6000],
  ['select','打开收入增速的标记','这段文字与前文的收入数据不一致，先看核对依据。',5000],
  ['optimize','生成修订建议','优化建议已经给出，先阅读，再替换回正文。',5000],
  ['replace','替换原文并保存','收入增速已统一为 10%。笔记和修订记录均已保留，可以继续编辑。',6000]
 ]},
 ppt:{title:'公司风格演示文稿',view:'对话',intro:'把投资研报 PDF 附到任务中，提炼研究观点并规划公司风格汇报，最后检查公司规范的投研汇报成稿。',steps:[
  ['brief','添加研报附件、公司技能和制作要求','研报 PDF 和公司 PPT 技能已就位。先看清附件与制作要求，再点击发送。',4500],
  ['send','发送制作任务','任务已发送，需求成为会话中可回看的用户消息。',2500],
  ['plan','提炼研报观点并规划汇报页面','先核对研报来源、日期与预测口径，再阅读带目录的汇报结构。',6500],
  ['layout','按公司模板完成排版','正在完成公司模板排版，任务清单会保留实际执行状态。',5500],
  ['deliver','接收可继续使用的 PPT 文件','文件已经保存到示例工作区。点击交付文件即可打开预览。',5000],
  ['open','打开右侧预览，检查成稿','成稿已在右侧打开。会话、任务记录和文件都会保留。',9500]
 ]}
}
const aborted=()=>Object.assign(Error('教程已结束。'),{name:'AbortError'})
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
  void options.wait(30000,deadline.signal).then(()=>{clean();reject(Error('研究教程尚未就绪，请重试。'))},()=>{})
  pending.add(cancel);win.addEventListener('sherlock:home-guide-native-reply',receive)
  win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-native-request',{detail:{requestId,runId:options.runId,sessionId:options.sessionId,hostId:host.id,command}}))
 })
 const dispose=()=>{if(disposed)return;disposed=true;options.signal.removeEventListener('abort',dispose);for(const cancel of pending)cancel();win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-native-request',{detail:{requestId:win.crypto.randomUUID(),runId:options.runId,sessionId:options.sessionId,hostId:host.id,command:'dispose'}}))}
 options.signal.addEventListener('abort',dispose,{once:true})
 return exchange('mount-board').then(()=>({runStep:async step=>{await options.waitUntilPlaying();await exchange(step)},dispose}),error=>{dispose();throw error})
}

/** Saved examples use normal sessions; this shell owns only teaching controls. */
export function mountHomeGuides(document:Document,adapters:Adapters){
 const win=document.defaultView!,style=document.createElement('style');style.id='odyssey-home-guide-style';style.textContent=styles;document.head.append(style)
 let disposed=false,generation=0,ownedNavigation=0,preparing:{controller:AbortController;source?:string;target?:string}|undefined,closing=Promise.resolve()
 let transition:string|undefined
 type Run={id:string;kind:HomeGuideKind;sessionId:string;abort:AbortController;root:HTMLElement;resident:HTMLElement;center:HTMLElement;content:HTMLElement;adapter?:HomeGuideAdapter;timeline?:GuideTimeline;cleanup():void;status:HTMLElement}
 let active:Run|undefined
 const selected=()=>[...document.querySelectorAll<HTMLElement>('.pI_x6G_centerCol [data-srb-session-header][data-ework-notes-session]')].find(node=>!node.closest('[data-odyssey-subagent-panel]'))?.dataset.eworkNotesSession
 const releaseTransition=()=>{if(transition&&document.documentElement.dataset.homeGuideTransition===transition){delete document.documentElement.dataset.homeGuideTransition;delete document.documentElement.dataset.homeGuideTransitionSession}transition=undefined}
 const playback=(run:Run,playing:boolean)=>win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-playback',{detail:{runId:run.id,sessionId:run.sessionId,playing}}))
 const cue=document.createElement('div');cue.className='odyssey-home-guide-cue';cue.hidden=true;cue.setAttribute('aria-hidden','true');document.body.append(cue)
 const hideCue=()=>{cue.hidden=true}
 const notices=new Set<HTMLElement>()
 const saveFailure=(message:string)=>{const notice=document.createElement('div');notice.className='odyssey-home-guide-save-error';notice.setAttribute('role','alert');const text=document.createElement('span');text.textContent='示例保存未完成：'+message;const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='关闭';dismiss.addEventListener('click',()=>{notices.delete(notice);notice.remove()});notice.append(text,dismiss);notices.add(notice);document.body.append(notice)}
 const close=(restoreFocus=true):Promise<void>=>{
  const run=active;if(!run)return closing
  active=undefined;run.timeline?.dispose();playback(run,false);hideCue()
  const finish=()=>{
   run.abort.abort();run.adapter?.dispose();run.cleanup();run.root.remove()
   if(run.center.dataset.homeGuideActive===run.id){delete run.center.dataset.homeGuideActive;delete run.center.dataset.homeGuideKind;run.center.style.removeProperty('--odyssey-home-guide-controls-height')}
   if(run.resident.dataset.homeGuideResident===run.id){delete run.resident.dataset.homeGuideResident;delete run.resident.dataset.homeGuideLive}
   if(restoreFocus&&selected()===run.sessionId)run.resident.querySelector<HTMLElement>('[data-srb-tabs] [aria-selected=true]')?.focus({preventScroll:true})
  }
  if(!run.adapter?.flush){finish();return Promise.resolve()}
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
  const header=document.createElement('header');header.className='odyssey-home-guide-header'
  const title=document.createElement('strong');title.textContent=definition.title
  const badge=document.createElement('span');badge.className='odyssey-home-guide-badge';badge.textContent='离线预置示例 · 内容自动保留'
  const exit=document.createElement('button');exit.type='button';exit.textContent='结束演示';exit.setAttribute('aria-label','结束示例教程');exit.addEventListener('click',()=>{void close()});header.append(title,badge,exit)
  const content=document.createElement('div');content.id='odyssey-home-guide-content-'+id;content.className='odyssey-home-guide-content'+(kind==='note'?' en-root':'');content.dataset.homeGuideContent='';if(kind==='note')content.dataset.homeGuideNotes='';content.dataset.dark=String(document.body.hasAttribute('data-ds-dark-theme'))
  const footer=document.createElement('footer');footer.className='odyssey-home-guide-footer'
  const information=document.createElement('div'),count=document.createElement('span');count.className='odyssey-home-guide-count'
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.textContent='正在打开已保存的示例…';information.append(count,status)
  const pause=document.createElement('button');pause.type='button';pause.textContent='暂停';pause.disabled=true
  const next=document.createElement('button');next.type='button';next.textContent='下一步';next.dataset.homeGuideNext='';next.disabled=true
  const replay=document.createElement('button');replay.type='button';replay.textContent='重新演示';replay.disabled=true;replay.addEventListener('click',()=>{void start(kind,{replay:true}).catch(()=>{})})
  footer.append(information,pause,next,replay);if(kind==='ppt')footer.append(exit);root.append(header,content,footer)
  const blocked=new Map<HTMLElement,boolean>()
  const run:Run={id,kind,sessionId:session.sessionId,abort:controller,root,resident,center,content,status,cleanup:()=>{}}
  active=run;resident.dataset.homeGuideResident=id;center.dataset.homeGuideActive=id;center.dataset.homeGuideKind=kind;if(kind==='ppt')resident.dataset.homeGuideLive='true'
  const blockResident=()=>{if(kind==='ppt')return;const chrome=resident.querySelector('[data-srb-session-header],.wSkVaW_header');for(const child of resident.children){if(!(child instanceof win.HTMLElement)||child===chrome||child.contains(chrome))continue;if(!blocked.has(child))blocked.set(child,child.inert);child.inert=true}}
  blockResident();center.append(root);releaseTransition();playback(run,false)
  const position=()=>{if(!root.isConnected)return;const bounds=center.getBoundingClientRect(),chrome=resident.querySelector('[data-srb-session-header],.wSkVaW_header')?.getBoundingClientRect(),top=Math.max(bounds.top,chrome?.bottom??bounds.top+44);root.style.left=bounds.left+'px';root.style.top=top+'px';root.style.width=bounds.width+'px';root.style.height=Math.max(1,bounds.bottom-top)+'px';if(kind==='ppt')center.style.setProperty('--odyssey-home-guide-controls-height',Math.ceil(footer.getBoundingClientRect().height+20)+'px')}
  const resize=new win.ResizeObserver(position);resize.observe(center);if(kind==='ppt')resize.observe(footer);const chrome=resident.querySelector('[data-srb-session-header],.wSkVaW_header');if(chrome)resize.observe(chrome);win.addEventListener('resize',position);position()
  const context=new win.MutationObserver(()=>{if(active!==run)return;if(selected()!==run.sessionId||!resident.isConnected||document.querySelector('.VOzbGW_overlay')||document.body.hasAttribute('data-workspace-surface'))void close(false);else blockResident()})
  context.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-ework-notes-session','data-workspace-surface']})
  run.cleanup=()=>{resize.disconnect();context.disconnect();win.removeEventListener('resize',position);for(const[body,inert]of blocked)body.inert=inert}
  const guideTab=kind==='board'?'research':kind==='note'?'notes':'chat',tab=resident.querySelector<HTMLButtonElement>('[data-srb-tabs] [data-conversation-view-id="'+guideTab+'"]')
  ownedNavigation++;try{if(tab?.getAttribute('aria-selected')!=='true')tab?.click()}finally{ownedNavigation--}
  const ensure=()=>{if(active!==run||controller.signal.aborted||selected()!==run.sessionId)throw aborted()}
  const options:HomeGuideMountOptions={signal:controller.signal,sessionId:run.sessionId,cwd:session.cwd,runId:id,fresh:session.fresh!==false,waitUntilPlaying:()=>run.timeline?run.timeline.waitUntilPlaying():Promise.resolve(),wait:(ms,signal)=>run.timeline?run.timeline.wait(ms,signal):new Promise((resolve,reject)=>{const signals=[controller.signal,...(signal?[signal]:[])];if(signals.some(item=>item.aborted)){reject(aborted());return}const clean=()=>{win.clearTimeout(timer);for(const item of signals)item.removeEventListener('abort',stop)},stop=()=>{clean();reject(aborted())},timer=win.setTimeout(()=>{clean();resolve()},ms);for(const item of signals)item.addEventListener('abort',stop,{once:true})}),onStatus:text=>{if(active===run)status.textContent=text}}
  try{
   const adapter=await(kind==='board'?mountBoard(document,content,options):kind==='note'?adapters.mountNotes(document,content,options):adapters.mountPresentation(document,content,options))
   if(active!==run||controller.signal.aborted){adapter.dispose();throw aborted()}run.adapter=adapter;ensure();replay.disabled=false
   if(session.fresh===false){count.textContent='已保存的示例';status.textContent='内容已保留。结束演示后可直接查看和编辑；重新演示会另建练习副本。';root.dataset.phase='completed';pause.hidden=true;next.hidden=true;return}
   const scenes:readonly Scene[]=[['overview','演示目标',definition.intro,4000],...definition.steps]
   run.timeline=createHomeGuideTimeline({steps:scenes.map(([id,,,hold])=>({id,hold})),run:async step=>{ensure();hideCue();if(step!=='overview')await adapter.runStep(step);ensure()},onChange:state=>{
    if(active!==run||state.phase==='disposed')return
    playback(run,state.phase==='playing');root.dataset.phase=state.phase
    count.textContent=state.phase==='completed'?'演示完成 · 正在确认保存':(state.index+1)+' / '+scenes.length+' · '+(scenes[state.index]?.[1]||definition.title)
    if(state.phase==='completed'){hideCue();void (adapter.flush?.()??Promise.resolve()).then(()=>{if(active===run){count.textContent='演示完成 · 示例已保存';status.textContent='内容已保存到「'+session.title+'」。结束演示后可继续查看和编辑。'}},error=>{if(active===run){count.textContent='演示完成 · 保存未成功';status.textContent=error instanceof Error?error.message:'示例尚未保存，请重试。'}})}
    else if(state.holding){hideCue();status.textContent=scenes[state.index]?.[2]||''}
    else if(state.index===0)status.textContent=definition.intro
    pause.textContent=state.phase==='paused'?'继续播放':'暂停';pause.disabled=state.phase==='completed'||state.phase==='error';next.disabled=state.busy||state.phase==='completed'||state.phase==='error'
   },onError:error=>{if(active!==run)return;playback(run,false);hideCue();status.textContent=error instanceof Error?error.message:'演示已中断，可结束演示查看已保留内容。';pause.disabled=true;next.disabled=true}})
   pause.disabled=false;next.disabled=false;pause.addEventListener('click',()=>{if(active!==run)return;run.timeline?.snapshot().phase==='playing'?run.timeline.pause():run.timeline?.play()});next.addEventListener('click',()=>{if(active===run)run.timeline?.next()})
   run.timeline.play();if(document.hidden)run.timeline.pause()
  }catch(error){if(active!==run||controller.signal.aborted)throw error;playback(run,false);status.textContent=error instanceof Error?error.message:'示例尚未就绪，请重试。';pause.disabled=true;next.disabled=true;replay.disabled=false}
 }
 const changed=()=>{if(preparing){const current=selected();if(current===preparing.source||current===preparing.target)return;preparing.controller.abort();preparing=undefined;generation++;releaseTransition()}if(active&&selected()!==active.sessionId)void close(false)}
 const navigate=(event:Event)=>{if(ownedNavigation)return;const target=(event.target as Element)?.closest?.('[data-srb-tabs] button,[data-dsh-sidebar-root] button,[data-dsh-sidebar-root] [role=row]');if(!target)return;if(preparing){preparing.controller.abort();preparing=undefined;generation++;releaseTransition()}if(active&&!active.root.contains(target))void close(false)}
 const escape=(event:KeyboardEvent)=>{if(active&&event.key==='Escape'){event.preventDefault();void close()}}
 const visibility=()=>{if(document.hidden)active?.timeline?.pause()}
 const showCue=(event:Event)=>{const value=(event as CustomEvent).detail,run=active,target=value?.target;if(!run||value?.runId!==run.id||!(target instanceof win.HTMLElement)||!target.isConnected||selected()!==run.sessionId)return;const rect=target.getBoundingClientRect();if(!rect.width||!rect.height)return;cue.style.left=rect.left-4+'px';cue.style.top=rect.top-4+'px';cue.style.width=rect.width+8+'px';cue.style.height=rect.height+8+'px';cue.hidden=false;if(typeof value.label==='string')run.status.textContent=value.label}
 win.addEventListener('sherlock:home-action-context-changed',changed);win.addEventListener('sherlock:skill-menu-reset',changed);win.addEventListener('sherlock:home-guide-cue',showCue)
 document.addEventListener('keydown',escape,true);document.addEventListener('click',navigate,true);document.addEventListener('visibilitychange',visibility)
 return{start,reset:(restoreFocus=true)=>{generation++;preparing?.controller.abort();preparing=undefined;releaseTransition();return close(restoreFocus)},dispose:async()=>{if(disposed)return;disposed=true;generation++;preparing?.controller.abort();preparing=undefined;await close(false);releaseTransition();win.removeEventListener('sherlock:home-action-context-changed',changed);win.removeEventListener('sherlock:skill-menu-reset',changed);win.removeEventListener('sherlock:home-guide-cue',showCue);document.removeEventListener('keydown',escape,true);document.removeEventListener('click',navigate,true);document.removeEventListener('visibilitychange',visibility);cue.remove();for(const notice of notices)notice.remove();notices.clear();style.remove()}}
}
