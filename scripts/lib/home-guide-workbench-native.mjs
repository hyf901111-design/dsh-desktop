import {HOME_WORKBENCH_STEPS,HOME_WORKBENCH_PANELS,HOME_WORKBENCH_TABS,HOME_WORKBENCH_PROMPT} from '../../packages/dsh-research-task-runtime/home-workbench-contract.js'
const START='/* odyssey:home-workbench-native:start:v1 */',END='/* odyssey:home-workbench-native:end:v1 */'
const BIND='/* odyssey:home-workbench-binding:v1 */'
const EFFECT='ctx.effect(()=>{const deps={sessions,inputHub,getHomeGuideSession:id=>sherlockBoardsAdapter?.getHomeGuideSession?.(id)};HomeWorkbenchNativeDeps=deps;return()=>{if(HomeWorkbenchNativeDeps===deps)HomeWorkbenchNativeDeps=null}},"Home workbench native dependencies");'
const EXPORT='exports.NativeHomeWorkbenchPortal = NativeHomeWorkbenchPortal;'

export function homeWorkbenchReplayCells(tab,m,sessionId){
   // The financial watchlist has a narrower readable floor than a report or
   // valuation card. Preserve roughly 230–260px rather than inheriting the
   // global 280px floor, which made a 650px canvas split into equal halves.
   const step=m.step??(280+m.gap)/m.minColumns,available=40*step-m.gap,
    watchlist=Math.max(4,Math.ceil((230+m.gap)/step),Math.round((Math.min(260,available*.25)+m.gap)/step)),pair=m.minColumns<=20;
   const rows=tab==='overview'?[[['watchlist',watchlist],['quote',40-watchlist]],[['disclosure',13],['performance',14],['peers',13]]]:tab==='valuation'?[[['watchlist',watchlist],['valuation',Math.max(10,m.minColumns)],['matrix',40-watchlist-Math.max(10,m.minColumns)]],[['dividend',20],['cashflow',20]]]:[[['watchlist',watchlist],['directory',Math.max(10,m.minColumns)],['reader',40-watchlist-Math.max(10,m.minColumns)]],[['news',24],['analysis',16]]]
   const readable=([role,width])=>width>0&&(role==='watchlist'||width>=m.minColumns)
   const responsive=rows.flatMap(row=>row.every(readable)?[row]:row[0][0]==='watchlist'&&40-watchlist>=m.minColumns?[
    [['watchlist',watchlist],[row[1][0],40-watchlist]],...(row.length===3?[[[row[2][0],40]]]:[])
   ]:row[0][0]!=='watchlist'&&pair?[[[row[0][0],20],[row[1][0],20]],...(row.length===3?[[[row[2][0],40]]]:[])]:row.map(([role])=>[[role,40]]))
   const cells=[];let y=0
   for(let r=0;r<responsive.length;r++){const row=responsive[r],pixels=tab==='overview'?(r===0?500:365):tab==='valuation'?(r===0?420:365):(r===0?500:365),h=Math.ceil((pixels+m.gap)/m.rowStep);let x=0;for(const[role,width]of row){cells.push({id:'hwb:'+sessionId+':'+tab+':'+role,x,y,w:width,h});x+=width}y+=h}

 return cells
}
function NativeHomeWorkbenchPortal({sessionId,subagentPanel=false,researchWorkspaces}){
 const[entry,setEntry]=react.useState(null),[planning,setPlanning]=react.useState(null),[canvasWidth,setCanvasWidth]=react.useState(null)
 react.useLayoutEffect(()=>{
  if(!entry)return
  const host=entry.host,measure=()=>{const bounds=host.getBoundingClientRect(),panel=document.querySelector('.t8lSSG_panel:not(.t8lSSG_panelHidden)'),r=panel?.getBoundingClientRect();setCanvasWidth(r&&r.width>0&&r.left>bounds.left&&r.left<bounds.right?Math.max(1,r.left-bounds.left):bounds.width)},observer=new ResizeObserver(measure),panel=document.querySelector('.t8lSSG_panel:not(.t8lSSG_panelHidden)')
  measure();observer.observe(host);if(panel)observer.observe(panel);window.addEventListener('resize',measure);return()=>{observer.disconnect();window.removeEventListener('resize',measure)}
 },[entry])
 react.useEffect(()=>{
  if(!sessionId||subagentPanel||window.top!==window)return
  let stopped=false,owned=null,latestPlayback=null
  const requests=new Map(),released=new Map(),changed=reason=>new DOMException('工作台演示或当前会话已变化。'+(reason?' ['+reason+']':''),'AbortError')
  const reply=(d,ok,message)=>{if(!stopped||d.command==='flush')window.dispatchEvent(new CustomEvent('sherlock:home-guide-workbench-reply',{detail:{requestId:d.requestId,runId:d.runId,sessionId,ok,...message?{message}:{}}}))}
  const hostFor=d=>{
   const host=document.getElementById(d.hostId)
   if(!host?.isConnected)throw changed('HWB_HOST_MISSING')
   const guide=host.closest('[data-home-guide]')
   if(!guide)throw changed('HWB_RUN_MISSING')
   if(guide.dataset.homeGuide!==d.runId)throw changed('HWB_RUN_MISMATCH')
   const center=guide.closest('.pI_x6G_centerCol'),header=[...(center?.querySelectorAll('[data-srb-session-header][data-ework-notes-session]')??[])].find(el=>!el.closest('[data-odyssey-subagent-panel]'))
   if(!header)throw changed('HWB_HEADER_MISSING')
   if(header.dataset.eworkNotesSession!==sessionId)throw changed('HWB_SESSION_MISMATCH')
   if(typeof HomeWorkbenchNativeDeps?.getHomeGuideSession!=='function')throw changed('HWB_DEPS_UNAVAILABLE')
   const saved=HomeWorkbenchNativeDeps.getHomeGuideSession(sessionId)
   if(!saved)throw changed('HWB_REGISTRATION_UNAVAILABLE')
   if(saved.kind!=='workbench')throw changed('HWB_REGISTRATION_KIND_MISMATCH')
   if(saved.cwd!==d.cwd)throw changed('HWB_DIRECTORY_MISMATCH')
   return host
  }
  const check=t=>{
   if(stopped)throw changed('HWB_PORTAL_STOPPED')
   if(owned!==t)throw changed('HWB_RUN_OWNER_MISMATCH')
   if(t.controller.signal.aborted)throw changed('HWB_RUN_ABORTED')
   if(t.resource.owner!==t)throw changed('HWB_WORKSPACE_OWNER_MISMATCH')
   if(hostFor(t.detail)!==t.host)throw changed('HWB_HOST_REPLACED')
  }
  const rpc=async(t,action,extra={})=>{check(t);const response=await fetch('/sherlock/home-guide/workbench',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action,sessionId,runId:t.detail.runId,...extra}),signal:t.controller.signal}),result=await response.json();check(t);if(!response.ok||!result.ok)throw Error(result.message||'工作台回看暂未就绪。');return result}
  const delay=(t,ms)=>new Promise((resolve,reject)=>{const end=error=>{clearTimeout(timer);t.controller.signal.removeEventListener('abort',abort);error?reject(error):resolve()},abort=()=>end(changed()),timer=setTimeout(()=>end(),ms);t.controller.signal.addEventListener('abort',abort,{once:true})})
  const playing=async t=>{for(;;){check(t);if(t.playing&&!document.hidden)return;await delay(t,30)}}
  const hold=async(t,ms)=>{let left=ms,last=performance.now();while(left>0){await delay(t,25);check(t);const now=performance.now();if(t.playing&&!document.hidden)left-=Math.min(60,now-last);last=now}}
  const waitFor=async(t,fn,active=true,message='原生研究画布尚未就绪，请重试。')=>{for(let i=0;i<240;i++){if(active)await playing(t);check(t);const value=fn();if(value)return value;await delay(t,25)}throw Error(message)}
  const save=t=>{check(t);if(t.resource.workspace.persist()!==true)throw Error('工作台暂未保存，请重试。')}
  const nodeId=(tab,role)=>'hwb:'+sessionId+':'+tab+':'+role
  const panelNode=(t,p)=>t.resource.workspace.getSnapshot().artifacts.find(n=>n.id===nodeId(p.tab,p.role))
  const inputFor=t=>{
   check(t)
   // The native sidebar portals to body, outside both the center and frame.
   // Resolve its session-owned composer, never an arbitrary document textarea.
   const inputs=[...document.querySelectorAll('.t8lSSG_panel textarea[data-odyssey-file-reference-session]')].filter(input=>{
    if(input.dataset.odysseyFileReferenceSession!==sessionId||!input.isConnected||input.disabled||input.readOnly||input.getAttribute('aria-disabled')==='true'||input.closest('[data-odyssey-subagent-panel],[inert],[hidden],[aria-hidden="true"],.t8lSSG_panelHidden'))return false
    for(let node=input;node;node=node.parentElement){const style=window.getComputedStyle(node);if(node.inert||style.display==='none'||['hidden','collapse'].includes(style.visibility)||style.opacity==='0')return false}
    return true
   })
   return inputs.length===1?inputs[0]:undefined
  }
  const readyInput=(t,active=true)=>waitFor(t,()=>{
   const input=inputFor(t)
   if(!input)return
   // The right pane mounts before its opening transition gives the composer a painted area.
   const box=input.getBoundingClientRect(),x=box.left+Math.min(22,box.width/3),y=box.top+Math.min(18,box.height/3)
   if(box.width&&box.height&&document.elementFromPoint(x,y)===input)return input
  },active,'右侧输入框尚未就绪，请重试。')
  const cue=async(t,target,label,action='click')=>{
   await playing(t);if(!target?.isConnected||target.disabled||target.closest('[inert]'))throw changed()
   const requestId=crypto.randomUUID(),runId=t.detail.runId,token=runId+':'+requestId+':target',targetToken=token,marker=document.documentElement.dataset.homeGuidePointerRun
   if(marker&&marker!==runId)throw changed()
   if(marker)await new Promise((resolve,reject)=>{
    let elapsed=0,last=performance.now();const clean=()=>{clearInterval(timer);window.removeEventListener('sherlock:home-guide-cue-reply',receive);t.controller.signal.removeEventListener('abort',abort);if(target.getAttribute('data-home-guide-cue-target')===token)target.removeAttribute('data-home-guide-cue-target')},abort=()=>{clean();reject(changed())},receive=e=>{if(e.detail?.runId!==runId||e.detail.requestId!==requestId)return;clean();e.detail.ok?resolve():reject(Error(e.detail.message||'操作位置已变化。'))},timer=setInterval(()=>{const now=performance.now();if(t.playing&&!document.hidden)elapsed+=now-last;last=now;if(elapsed>12000)abort()},100)
    window.addEventListener('sherlock:home-guide-cue-reply',receive);t.controller.signal.addEventListener('abort',abort,{once:true});target.setAttribute('data-home-guide-cue-target',token);window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue',{detail:{runId,requestId,targetToken,label,action}}))
   });else await hold(t,450)
   await playing(t);if(!target.isConnected||target.disabled)throw changed()
  }
  const dispose=()=>{
   const t=owned;if(!t)return;owned=null;t.controller.abort();for(const animation of t.animations)animation.cancel();for(const p of HomeWorkbenchPanels)HomeWorkbenchGenerationStages.delete(nodeId(p.tab,p.role))
   let saved=false
   if(t.resource.owner===t){const w=t.resource.workspace;if(!t.complete){const ids=new Set(HomeWorkbenchPanels.map(p=>nodeId(p.tab,p.role)));w.setArtifacts(w.getSnapshot().artifacts.map(n=>ids.has(n.id)&&['running','queued'].includes(n.generationStatus)?{...n,generationStatus:'cancelled',generationCompletedAt:Date.now()}:n))}saved=w.persist()===true;w.cancelTransient?.();t.resource.owner=null}t.offProgress?.();publishResearchWorkbenchProgress(window,sessionId,t.resource.workspace.getSnapshot().artifacts,false,false)
   const receipt={ticket:t,saved,promise:fetch('/sherlock/home-guide/workbench',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'dispose',sessionId,runId:t.detail.runId}),keepalive:true}).then(async response=>{const result=await response.json();if(!response.ok||!result.ok)throw Error(result.message||'研究会话尚未保存。');return result})};receipt.promise.catch(()=>{});released.set(t.detail.runId,receipt);if(released.size>8)released.delete(released.keys().next().value)
   if(!stopped){setEntry(null);setPlanning(null)}
  }
  const flush=async d=>{
   const prior=released.get(d.runId),t=owned?.detail.runId===d.runId?owned:prior?.ticket
   if(!t||t.detail.hostId!==d.hostId||t.detail.sessionId!==d.sessionId)throw changed()
   if(prior){if(!prior.saved)throw Error('工作台暂未保存，请重试。');await prior.promise;return}
   if(t.resource.owner!==t||t.resource.workspace.persist()!==true)throw Error('工作台暂未保存，请重试。')
   // A save belongs to the captured session/run, not the still-visible header.
   // Navigation may unmount this portal while the Host finishes the same save.
   const response=await fetch('/sherlock/home-guide/workbench',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'flush',sessionId,runId:d.runId}),keepalive:true}),result=await response.json()
   if(!response.ok||!result.ok){const ending=released.get(d.runId);if(ending?.saved){await ending.promise;return}throw Error(result.message||'研究会话尚未保存。')}
  }

  const typeTo=async(t,length)=>{
   const input=await readyInput(t),chars=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(HomeWorkbenchPrompt)].map(p=>p.segment),backdrop=input.closest('.uV2eYG_root')?.querySelector('[data-input-backdrop]'),paint=backdrop&&typeof createAssistantTextPaint==='function'?createAssistantTextPaint(backdrop,{epoch:1,live:true},'composer'):null
   try{for(let i=t.typedCount;i<length;i++){await playing(t);if(inputFor(t)!==input)throw changed();const s=t.shell.snapshot;if(s.draft!==t.draft||s.draftRev!==t.revision||s.imageIds?.length||s.occurrences?.length)throw Error('输入内容已变化，自动填写已停止并保留草稿。');t.draft+=chars[i];t.shell.setDraft(t.draft);t.revision=t.shell.snapshot.draftRev;t.typedCount=i+1;await waitFor(t,()=>input.value===t.draft);if(inputFor(t)!==input)throw changed();input.focus();input.setSelectionRange(input.value.length,input.value.length);t.shell.track(t.draft,t.draft.length);paint?.update();await hold(t,/[，。！？]$/.test(chars[i])?220:52)}}finally{paint?.dispose()}
  }
  const layout=(t,tab)=>{
   const w=t.resource.workspace,s=w.getSnapshot(),m=createResearchGrid().metrics(s.canvasSize.availableWidth||s.canvasSize.width),cells=new Map(homeWorkbenchReplayCells(tab,m,sessionId).map(cell=>[cell.id,cell]))
   w.setArtifacts(w.getSnapshot().artifacts.map(n=>cells.has(n.id)?{...n,workbenchId:'hwb:'+sessionId+':'+tab,workbenchIndex:HomeWorkbenchPanels.filter(p=>p.tab===tab).findIndex(p=>nodeId(tab,p.role)===n.id),workbenchLayoutVersion:1,preserveGenerationSize:true,sizeMode:'manual'}:n))
   if(!w.applyWorkbenchCells(w.getWorkbenchCells().map(c=>cells.get(c.id)||c),false))throw Error('工作台组件布局暂未就绪。')
   // The replay already applied the native grid positions from its approved plan.
   // Do not race its per-panel hydration with the generic post-generation arranger.
   w.consumeWorkbenchArrange?.(['hwb:'+sessionId+':'+tab])
  }
  const createPage=(t,tab)=>{
   const w=t.resource.workspace,nav=w.getSnapshot().artifacts.find(n=>n.containerSpec?.type==='board-tabs'),page=nav?.containerSpec.tabs.find(p=>p.name===HomeWorkbenchTabs.find(def=>def.id===tab)?.name)
   if(!page)throw Error('研究页签未创建。')
   const panels=HomeWorkbenchPanels.filter(p=>p.tab===tab&&!panelNode(t,p)).map(p=>({nodeId:nodeId(tab,p.role),type:'container',title:p.title,prompt:p.title+' · 白酒龙头研究',pending:true,size:'medium',x:0,y:0,width:320,height:220}))
   if(panels.length&&!w.withBoardTabTarget({navId:nav.id,tabId:page.id},()=>w.applyWorkbench({id:'hwb:'+sessionId+':'+tab,createdAt:Date.now(),panels})))throw Error('研究组件未放入当前页签。')
   layout(t,tab)
  }
  const selectTab=async(t,tab)=>{
   const w=t.resource.workspace,buttons=()=>[...t.host.querySelectorAll('[role="tab"]')],name=HomeWorkbenchTabs.find(p=>p.id===tab).name
   await waitFor(t,()=>buttons().some(b=>b.textContent?.includes(name)))
   const button=buttons().find(b=>b.textContent?.includes(name));await cue(t,button,'查看'+name);button.click();await waitFor(t,()=>w.getActiveBoardTab()===button.dataset.boardTab);w.setViewport({x:0,y:0,scale:1})
  }
  const revealLinks=async(t,tab,role)=>{
   const id=nodeId(tab,role),target=()=>{const card=t.host.querySelector('[data-research-node-id="'+id+'"]');return card?.querySelector('.ew-grid-header .ew-grid-title')||card?.querySelector('[data-research-node-title]')}
   await waitFor(t,()=>!!target());await cue(t,target(),'查看组件联动');
   t.resource.workspace.setSelection({selectedNodeIds:[id],orderedFileIds:[]})
  }
  const phase=(t,p,stage)=>{const node=panelNode(t,p),w=t.resource.workspace;if(!node||node.generationStatus==='completed')return;const status=stage>=p.begin?'running':'queued';HomeWorkbenchGenerationStages.set(node.id,{role:p.role,stage,parent:p.parent});w.setArtifacts(w.getSnapshot().artifacts.map(n=>n.id===node.id?{...n,generationStatus:status,...status==='running'?{generationStartedAt:n.generationStatus==='running'?(n.generationStartedAt??Date.now()):Date.now()}:{}}:n))}
  const completePanel=async(t,p)=>{
   const w=t.resource.workspace,node=panelNode(t,p);if(node?.generationStatus==='completed')return
   if(p.reused){
    const source=panelNode(t,{tab:'overview',role:'watchlist'})
    if(source?.containerSpec?.widget!=='watchlist')throw Error('自选组件尚未就绪。')
    const spec=structuredClone(source.containerSpec),completedAt=Date.now()
    w.setArtifacts(w.getSnapshot().artifacts.map(n=>{
     if(n.id!==node.id)return n
     // Match native successful hydration without inventing a generation task
     // for this reused view. Pending-factory errors are no longer applicable.
     const{generationError:_error,refreshError:_refreshError,generationEvents:_events,generationPartialText:_partial,...completed}=n
     return{...completed,title:spec.title,excerpt:JSON.stringify(spec),containerSpec:spec,generationStatus:'completed',generationCompletedAt:completedAt,lastSuccessfulAt:completedAt,generationLastSeq:1}
    }));layout(t,p.tab);return
   }
   const{task}=await rpc(t,'panel',{tab:p.tab,role:p.role,nodeId:nodeId(p.tab,p.role)});await playing(t)
   w.setArtifacts(w.getSnapshot().artifacts.map(n=>n.id===node.id?{...n,generationStatus:'queued'}:n))
   const nav=w.getSnapshot().artifacts.find(n=>n.containerSpec?.type==='board-tabs')
   if(!w.withBoardTabTarget({navId:nav.id,tabId:nav.containerSpec.tabs.find(tab=>tab.name===HomeWorkbenchTabs.find(def=>def.id===p.tab)?.name)?.id},()=>w.applyWorkbench({id:'hwb:'+sessionId+':'+p.tab,createdAt:task.createdAt,panels:[{nodeId:node.id,taskId:task.taskId,preparedOutput:task.finalOutput}]})))throw Error('组件结果未能应用。')
   await waitFor(t,()=>panelNode(t,p)?.generationStatus==='completed');layout(t,p.tab)
  }
  const execute=async d=>{
   if(d.command==='flush'){await flush(d);return}
   if(['dispose','cancel'].includes(d.command)){if(owned?.detail.runId===d.runId)dispose();return}
   if(d.command==='mount'){
    const host=hostFor(d);if(owned?.detail.runId===d.runId&&owned.host===host)return;dispose()
    const resource=homeGuideNativeResource(sessionId,researchWorkspaces),shell=HomeWorkbenchNativeDeps?.inputHub.shell(sessionId)
    if(resource.owner||!shell||d.fresh!==true||shell.snapshot.draft||shell.snapshot.imageIds?.length||shell.snapshot.occurrences?.length||resource.workspace.getSnapshot().artifacts.length)throw Error('请使用独立的空白研究示例。')
    const t={detail:{...d},host,resource,provider:{...resource.provider,runId:d.runId},shell,controller:new AbortController(),playing:latestPlayback?.runId===d.runId&&latestPlayback.playing===true,animations:[],typedCount:0,draft:'',revision:shell.snapshot.draftRev,index:-1,complete:false};owned=t;resource.owner=t
    HomePresentationSubmissions?.watch({sessionId,session:HomeWorkbenchNativeDeps.sessions?.binding?.(sessionId)?.session,signal:t.controller.signal,current:()=>check(t)})
    await rpc(t,'prepare',{fresh:true,cwd:d.cwd});const publish=()=>publishResearchWorkbenchProgress(window,sessionId,resource.workspace.getSnapshot().artifacts,true,false);t.offProgress=resource.workspace.subscribe(publish);publish();await rpc(t,'playback',{playing:t.playing&&!document.hidden});check(t);resource.workspace.setViewport({x:0,y:0,scale:1});setEntry(t);await waitFor(t,()=>!!host.querySelector('[data-research-canvas]'),false);await readyInput(t,false);return
   }
   const t=owned;if(!t||t.detail.runId!==d.runId||t.detail.hostId!==d.hostId)throw changed();check(t)
   const index=HomeWorkbenchSteps.findIndex(s=>s.id===d.command);if(index<0||index>t.index+1)throw Error('工作台步骤顺序已变化。');if(index<=t.index)return;await playing(t)
   if(index===0){const input=await readyInput(t);await cue(t,input,'输入研究需求');if(inputFor(t)!==input)throw changed();input.focus()}
   if(index===1)await typeTo(t,32)
   if(index===2){await typeTo(t,[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(HomeWorkbenchPrompt)].length);await cue(t,inputFor(t)?.closest('.uV2eYG_root')?.querySelector('button.uV2eYG_primary'),'准备发送研究需求','move')}
   if(index===3){const unchanged=()=>t.shell.snapshot.draft===HomeWorkbenchPrompt&&t.shell.snapshot.draftRev===t.revision&&!t.shell.snapshot.imageIds?.length&&!t.shell.snapshot.occurrences?.length;if(!unchanged())throw Error('需求已编辑，演示已停止并保留草稿。');const button=inputFor(t)?.closest('.uV2eYG_root')?.querySelector('button.uV2eYG_primary');await cue(t,button,'发送研究需求');if(!unchanged())throw changed();button.click();await waitFor(t,()=>t.shell.snapshot.draft==='');await rpc(t,'checkpoint',{stage:'accepted'});odysseyCreationFinish(sessionId)}
   if(index>=3)await rpc(t,'checkpoint',{stage:d.command})
   await playing(t)
   if(index>=4&&index<=6){const phase=index===4?'明确研究范围':index===5?'组织研究页签':'规划已完成',detail=index===4?'三家公司 · 股价、业绩、估值与分红':index===5?'行情与业绩 / 估值与回报 / 公告与关注':'三个页签 · 标的切换与参数联动';setPlanning({phase,detail,startedAt:t.startedAt??(t.startedAt=Date.now()),dealing:false})}
   if(index===5){await hold(t,1400);setPlanning(value=>({...value,phase:'对齐数据口径',detail:'2025年报 · 2026Q1 · 2026-04-30 日终'}))}
   if(index===7){const card=t.host.querySelector('[data-home-workbench-planning]'),origin=card?.getBoundingClientRect();setPlanning(value=>value?{...value,dealing:true}:value);await waitFor(t,()=>card?.dataset.researchCreationPlanning==='dealing',false);for(const animation of card?.getAnimations?.()??[]){t.animations.push(animation);if(!t.playing||document.hidden)animation.pause()}await hold(t,420);setPlanning(null);const w=t.resource.workspace,nav=w.createBoardTabs();if(!nav||!w.saveBoardTabs(nav.containerSpec.revision,HomeWorkbenchTabs.map((p,i)=>({id:nav.containerSpec.tabs[i]?.id??p.id,name:p.name}))))throw Error('三个研究页签未能创建。');w.selectBoardTab(nav.containerSpec.tabs[0].id);createPage(t,'overview');await waitFor(t,()=>t.host.querySelectorAll('[data-research-artifact-card]').length>=1&&t.host.querySelector('[data-board-tabs-nav]'));if(origin&&!matchMedia('(prefers-reduced-motion:reduce)').matches)for(const p of HomeWorkbenchPanels.filter(p=>p.tab==='overview')){const target=t.host.querySelector('[data-research-artifact-card="'+nodeId(p.tab,p.role)+'"]');if(target?.animate){const animation=target.animate(workbenchDealMotion(origin,target.getBoundingClientRect(),target.offsetWidth),{duration:560,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});t.animations.push(animation)}}await hold(t,560);for(const animation of t.animations)animation.cancel();t.animations=[]}
   if(index===15){await selectTab(t,'valuation');createPage(t,'valuation')}
   if(index===20){await selectTab(t,'documents');createPage(t,'documents')}
   if(index>=8){const tab=index>=20?'documents':index>=15?'valuation':'overview';for(const p of HomeWorkbenchPanels.filter(p=>p.tab===tab))phase(t,p,index);for(const p of HomeWorkbenchPanels.filter(p=>p.tab===tab&&p.complete===index))await completePanel(t,p);save(t)}
   if(index===14)await revealLinks(t,'overview','watchlist')
   if(index===19)await revealLinks(t,'valuation','valuation')
   if(index===24)await revealLinks(t,'documents','directory')
   if(index===24){if(!HomeWorkbenchPanels.every(p=>{const node=panelNode(t,p);return node?.generationStatus==='completed'&&node.containerSpec}))throw Error('仍有研究组件未生成完成。');save(t);await rpc(t,'checkpoint',{stage:'completed'});t.complete=true;await rpc(t,'flush');save(t)}t.index=index
  }
  const receive=e=>{const d=e.detail;if(stopped||!d||d.sessionId!==sessionId||typeof d.requestId!=='string')return;const fingerprint=JSON.stringify(d),prior=requests.get(d.requestId);if(prior){if(prior.fingerprint!==fingerprint)return reply(d,false,'请求标识已使用。');prior.promise.then(()=>reply(d,true),error=>reply(d,false,error.message));return}const promise=execute(d);requests.set(d.requestId,{fingerprint,promise});if(requests.size>128)requests.delete(requests.keys().next().value);promise.then(()=>reply(d,true),error=>{if(owned?.detail.runId===d.runId)dispose();reply(d,false,error.message)})}
  const playback=e=>{const d=e.detail;if(d?.sessionId!==sessionId)return;latestPlayback=d;const t=owned;if(!t||d.runId!==t.detail.runId)return;t.playing=d.playing===true;for(const animation of t.animations)(t.playing&&!document.hidden?animation.play():animation.pause());t.playbackTask=(t.playbackTask??Promise.resolve()).catch(()=>{}).then(()=>rpc(t,'playback',{playing:t.playing&&!document.hidden}));void t.playbackTask.catch(()=>{if(owned===t)dispose()})}
  const visibility=()=>{if(owned)playback({detail:{sessionId,runId:owned.detail.runId,playing:owned.playing}})},reset=()=>dispose(),observer=new MutationObserver(()=>{if(owned)try{check(owned)}catch{dispose()}})
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-ework-notes-session','data-home-guide']})
  window.addEventListener('sherlock:home-guide-workbench-request',receive);window.addEventListener('sherlock:home-guide-playback',playback);document.addEventListener('visibilitychange',visibility);window.addEventListener('sherlock:home-action-context-changed',reset)
  return()=>{dispose();stopped=true;observer.disconnect();window.removeEventListener('sherlock:home-guide-workbench-request',receive);window.removeEventListener('sherlock:home-guide-playback',playback);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('sherlock:home-action-context-changed',reset)}
 },[sessionId,subagentPanel,researchWorkspaces])
 if(!entry||entry.controller.signal.aborted||entry.detail.sessionId!==sessionId||subagentPanel)return null
 return react_dom.createPortal(react.createElement(HomeGuideNativeFinancialContext.Provider,{value:entry.provider},react.createElement('div',{'data-home-guide-native':entry.detail.runId,'data-home-workbench-native':'',style:{position:'absolute',left:0,top:0,bottom:0,width:canvasWidth??'100%',minWidth:0,minHeight:0,overflow:'hidden','--odyssey-workspace-header-height':'0px'}},react.createElement(ResearchCanvas,{sessionId,researchWorkspaces,t:key=>key}),planning&&react.createElement('section',{className:'odyssey-creation-planning-card','data-home-workbench-planning':'','data-planning-grid':'','data-research-compact-chrome':'','data-research-creation-planning':planning.dealing?'dealing':'planning',style:{position:'absolute',left:'50%',top:'50%',width:320,height:220,transform:'translate(-50%,-50%)',zIndex:4}},react.createElement(ResearchGenerationProcess,{node:{id:'hwb-plan:'+sessionId,title:'规划研究工作台',generationStatus:'running',generationStartedAt:planning.startedAt,generationEvents:[]},sessionId,phaseOverride:planning.phase,detailOverride:planning.detail})))),entry.host)
}
function NativeHomeWorkbenchGenerationProcess(props){
 const info=HomeWorkbenchGenerationStages.get(props.node?.id)
 if(!info)return react.createElement(HomeWorkbenchOriginalGenerationProcess,props)
 const phases={watchlist:['准备自选标的','贵州茅台、五粮液、泸州老窖 · 4月30日收盘快照'],quote:info.stage===10?['已取得行情快照','日K与成交数据已就绪，正在配置均线与指标']:['载入标的行情','对齐不复权日K、成交量与MACD'],disclosure:['整理最新披露','2025年度及2026一季报 · 核对指标与同比口径'],performance:['整理业绩趋势','按单季口径计算营收和归母净利润'],peers:['对齐同业口径','固定三家公司 · 盈利、现金与估值比较'],valuation:['准备估值输入','关联年报EPS与收盘价，配置PE与盈利变化参数'],matrix:['计算敏感性矩阵','根据上游EPS与估值参数逐项计算'],dividend:['整理分红方案','区分已实施分红与年度预案'],cashflow:['整理盈利与现金流','对齐2023—2025年度指标与披露口径'],directory:['整理公告资料','匹配正式报告、披露日期与原文位置'],reader:['载入当前报告','读取财务与经营披露摘要'],analysis:['解读当前报告','计算增长差异与现金转化，保留口径边界'],news:['整理行业公开信息','保留原始来源、披露时间与研究样本']}
 const [phase,detail]=props.node.generationStatus==='queued'?['等待上游就绪',info.parent==='directory'?'等待公告目录确认当前报告':info.parent==='valuation'?'等待估值输入确认EPS与参数':'等待自选标的就绪']:phases[info.role]??['准备组件','整理当前研究内容']
 return react.createElement(HomeWorkbenchOriginalGenerationProcess,{...props,phaseOverride:phase,detailOverride:detail})
}
function NativeWorkbenchConversationRoot(props){return react.createElement(react.Fragment,null,react.createElement(HomeWorkbenchOriginalConversationRoot,props),react.createElement(NativeHomeWorkbenchPortal,{sessionId:props.sessionId,subagentPanel:props.subagentPanel,researchWorkspaces:props.researchWorkspaces}))}
function one(source,before,after){if(source.split(before).length!==2)throw Error('Home workbench native anchor drifted: '+before.slice(0,90));return source.replace(before,after)}
export function stripHomeGuideWorkbenchNative(source){
 const traces=[START,END,BIND,'HomeWorkbenchNativeDeps','NativeHomeWorkbenchPortal','NativeWorkbenchConversationRoot','HomeWorkbenchOriginalConversationRoot','HomeWorkbenchOriginalGenerationProcess'];if(!source.includes(START)){if(traces.some(t=>source.includes(t)))throw Error('Home workbench native strip anchor drifted');return source}
 if(source.split(START).length!==2||source.split(END).length!==2)throw Error('Home workbench native strip anchor drifted')
 const start=source.indexOf(START),end=source.indexOf(END,start)+END.length;source=source.slice(0,start)+source.slice(end+(source[end]==='\n'?1:0));source=one(source,'\n'+BIND+'\n'+EFFECT,'');source=one(source,'\n'+EXPORT,'');if(traces.some(t=>source.includes(t)))throw Error('Home workbench native strip residue');return source
}
export function patchHomeGuideWorkbenchNative(source){
 source=stripHomeGuideWorkbenchNative(source)
 const definitions=START+'\nlet HomeWorkbenchNativeDeps=null;\nconst HomeWorkbenchGenerationStages=new Map();\nconst HomeWorkbenchSteps='+JSON.stringify(HOME_WORKBENCH_STEPS)+';\nconst HomeWorkbenchPanels='+JSON.stringify(HOME_WORKBENCH_PANELS)+';\nconst HomeWorkbenchTabs='+JSON.stringify(HOME_WORKBENCH_TABS)+';\nconst HomeWorkbenchPrompt='+JSON.stringify(HOME_WORKBENCH_PROMPT)+';\n'+[homeWorkbenchReplayCells,NativeHomeWorkbenchPortal,NativeHomeWorkbenchGenerationProcess,NativeWorkbenchConversationRoot].map(fn=>fn.toString()).join('\n')+'\nconst HomeWorkbenchOriginalGenerationProcess=ResearchGenerationProcess;\nResearchGenerationProcess=NativeHomeWorkbenchGenerationProcess;\nconst HomeWorkbenchOriginalConversationRoot=ConversationRoot;\nConversationRoot=NativeWorkbenchConversationRoot;\n'+END
 source=one(source,'exports.ConversationRoot = ConversationRoot;',definitions+'\nexports.ConversationRoot = ConversationRoot;\n'+EXPORT)
 return one(source,'const composerBlocks = new ComposerBlockRegistry();','const composerBlocks = new ComposerBlockRegistry();\n'+BIND+'\n'+EFFECT)
}
export {NativeHomeWorkbenchPortal}
