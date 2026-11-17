import {homeGuideTargetPoint,type HomeGuidePointerAction} from './home-guide-pointer'
import type {HomeOperationActionContext} from './home-operations'
import type {HomeGuideKind} from './home-guides'
import {homeGuideMode,isSidebarSpreadsheetMenuItem,type HomeGuideEntryAction} from './home-guide-entry-native'
type Options={homeEmpty?:boolean;context:HomeOperationActionContext;signal:AbortSignal;pointer:{perform(action:HomeGuidePointerAction):Promise<void>};assert():void;nativeClick(target:HTMLElement):void;activate(target:HTMLElement,action:HomeGuideEntryAction,beforeCommit:()=>Promise<void>):Promise<void>}
/** Only visible native controls. The final click consumes one prepared-session lease. */
export async function playExploreHomeGuideEntry(document:Document,kind:HomeGuideKind,options:Options){
 const win=document.defaultView!,check=()=>{if(options.signal.aborted||options.context.signal.aborted)throw new DOMException('演示入口已取消。','AbortError');options.assert()}
 const visible=(node:HTMLElement)=>{try{homeGuideTargetPoint(document,node);return true}catch{return false}}
 const unique=<T extends HTMLElement>(nodes:Iterable<T>):T|undefined=>{const all=[...new Set(nodes)].filter(visible);if(all.length>1)throw Error('可见入口不唯一，请重新打开探索。');return all[0]}
 const wait=async<T>(read:()=>T|undefined)=>{const expires=Date.now()+6000;for(;;){check();const value=read();if(value)return value;if(Date.now()>=expires)throw Error('可见入口尚未就绪，请重新打开探索。');await new Promise(resolve=>win.setTimeout(resolve,25))}}
 const click=async(target:HTMLElement)=>{
  check()
  await options.pointer.perform({target,action:'click',hover:'none',onClick:()=>{
   check();homeGuideTargetPoint(document,target);options.nativeClick(target)
  }})
  check()
 }
 const activate=async(target:HTMLElement,action:HomeGuideEntryAction)=>{check();await options.pointer.perform({target,action:'move'});check();await options.activate(target,action,async()=>{check();homeGuideTargetPoint(document,target);await options.pointer.perform({target,action:'click'});check();homeGuideTargetPoint(document,target)});check()}
 const entry=options.context.demoEntry;if(!entry)throw Error('探索演示入口已变化。')
 await options.pointer.perform({target:entry.closeTarget,action:'click'});check();homeGuideTargetPoint(document,entry.closeTarget);await entry.closeOwned();check()
 if(document.querySelector('dialog[data-explore-menu][open]'))throw Error('探索尚未关闭，未继续操作。')
 // Settings covers the sidebar. Use its own exit control before navigating.
 const settings=document.querySelector('.VOzbGW_overlay')
 if(settings){
  const back=unique(settings.querySelectorAll<HTMLButtonElement>('button.sherlock-settings-back,button[aria-label="返回应用"],button[aria-label="Back to app"]'))
  if(!back)throw Error('请先返回应用后再播放演示。')
  await click(back);await wait(()=>!document.querySelector('.VOzbGW_overlay')?true:undefined)
 }
 if(kind==='spreadsheet'){
  const more=await wait(()=>unique(document.querySelectorAll<HTMLButtonElement>('[data-dsh-sidebar-root] button.st-more')))
  if(more.getAttribute('aria-expanded')!=='true')await click(more)
  const target=await wait(()=>unique([...document.querySelectorAll<HTMLButtonElement>('[data-sidebar-more] button[role="menuitem"]')].filter(isSidebarSpreadsheetMenuItem)))
  await activate(target,'new-spreadsheet')
  return
 }
 // An app's back button follows surface history. Choose the real sidebar
 // entry while an app owns the center, and reveal the new session at commit.
 const root=document.body.dataset.workspaceSurface?undefined:await wait(()=>unique(document.querySelectorAll<HTMLElement>('.pI_x6G_centerCol .wSkVaW_root')))
 const mode=homeGuideMode(kind)
 const emptyHome=options.homeEmpty!==false&&root?.dataset.odysseyPage==='home'&&![...root.querySelectorAll<HTMLTextAreaElement>('textarea')].some(input=>input.value.trim())&&!root.querySelector('[data-note-reference-chip],[data-research-inline-reference],[data-input-attachment]')
 if(emptyHome){
  const tab=unique(root.querySelectorAll<HTMLElement>('[data-srb-tabs] [data-conversation-view-id="'+mode+'"]'))
  if(tab){
   if(tab.getAttribute('aria-selected')!=='true'){
    await activate(tab,('home-'+mode) as HomeGuideEntryAction);return
   }
   const input=unique([...document.querySelectorAll<HTMLTextAreaElement>('.pI_x6G_centerCol textarea,[data-research-composer-host] textarea')].filter(node=>!node.readOnly))
   if(input){if(input.value.trim())throw Error('输入框已有草稿，未用于演示。');await activate(input,'home-input');return}
   // A selected empty Notes/Research view may have no visible composer. Its
   // ordinary sidebar New control is the visible entry; do not click the
   // selected tab again or force a hidden right-hand input to appear.
  }
 }
 const sidebar=await wait(()=>unique(document.querySelectorAll<HTMLElement>('[data-dsh-sidebar-root]')))
 const home=unique(sidebar.querySelectorAll<HTMLButtonElement>('button[data-sidebar-home]'))
 if(home){await activate(home,'sidebar-home');return}
 const action:HomeGuideEntryAction=mode==='notes'?'new-note':mode==='research'?'new-research':'new-chat'
 const labels=action==='new-note'?['新建笔记','新笔记','New note','New Note']:action==='new-research'?['新建研究','新研究','New research','New Research']:['新建对话','新对话','New chat','New Chat']
 const matching=()=>unique([...sidebar.querySelectorAll<HTMLElement>('button,[role="menuitem"]'),...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"],[role="menu"] button,[data-sidebar-more] button')].filter(node=>labels.includes(node.getAttribute('aria-label')||node.textContent?.trim()||'')||node.hasAttribute('data-sidebar-'+action)))
 let target=matching()
 if(!target&&action==='new-note'){
  const more=unique([...sidebar.querySelectorAll<HTMLElement>('button')].filter(node=>['更多','More','更多新建选项'].includes(node.getAttribute('aria-label')||'')))
  if(!more)throw Error('可见的新建笔记入口尚未就绪。')
  await click(more);target=await wait(matching)
 }
 if(!target)throw Error('可见的新建入口尚未就绪。')
 await activate(target,action)
}

/** Wait for the SDK's target session and mode to own a stable visible root.
 * A header may update before React replaces its former conversation root. */
export async function waitForHomeGuideNativeView(document:Document,sessionId:string,kind:HomeGuideKind,options:{signal:AbortSignal;assert():void}){
 const win=document.defaultView!,mode=homeGuideMode(kind),deadline=Date.now()+6000
 let previous:HTMLElement|undefined,stable=0
 const check=()=>{if(options.signal.aborted)throw new DOMException('演示入口已取消。','AbortError');options.assert()}
 const frame=()=>new Promise<void>((resolve,reject)=>{let raf=0,timer=0;const clean=()=>{win.cancelAnimationFrame(raf);win.clearTimeout(timer);options.signal.removeEventListener('abort',abort)},finish=()=>{clean();resolve()},abort=()=>{clean();reject(new DOMException('演示入口已取消。','AbortError'))};options.signal.addEventListener('abort',abort,{once:true});raf=win.requestAnimationFrame(finish);timer=win.setTimeout(finish,48);if(options.signal.aborted)abort()})
 for(;;){
  check();const candidates=[...document.querySelectorAll<HTMLElement>('.pI_x6G_centerCol .wSkVaW_root')].filter(resident=>{
   if(resident.closest('[data-odyssey-subagent-panel]'))return false
   const header=resident.querySelector<HTMLElement>('[data-srb-session-header][data-ework-notes-session]'),tabs=header?.querySelector('[data-srb-tabs]'),tab=tabs?.querySelector<HTMLElement>('[data-conversation-view-id="'+mode+'"]')
   if(header?.dataset.eworkNotesSession!==sessionId)return false
   try{
    homeGuideTargetPoint(document,resident)
    if(tabs){if(tab?.getAttribute('aria-selected')!=='true')return false;homeGuideTargetPoint(document,tab);return true}
    // Dedicated Boards intentionally omit mode tabs. Their ordinary canvas is
    // also suppressed while the guide's transition owns the resident. Read the
    // actual React render's session/mode, not the absence of a tab or canvas.
    if(mode!=='research'||resident.dataset.odysseyPage!=='research'||resident.dataset.homeGuideViewSession!==sessionId||resident.dataset.homeGuideBoardOnly!=='true')return false
    const canvases=[...resident.querySelectorAll<HTMLElement>('[data-research-canvas]')].filter(canvas=>{if(canvas.closest('.wSkVaW_root')!==resident||canvas.closest('[data-odyssey-subagent-panel]'))return false;try{homeGuideTargetPoint(document,canvas);return true}catch{return false}})
    return canvases.length===0||canvases.length===1&&canvases[0]!.dataset.researchPreviewSession===sessionId
   }catch{return false}
  })
  const resident=candidates.length===1?candidates[0]:undefined
  if(resident&&resident===previous)stable++;else{previous=resident;stable=0}
  if(resident&&stable>=2){check();return{resident,center:resident.closest<HTMLElement>('.pI_x6G_centerCol')!}}
  if(Date.now()>deadline)throw Error('示例模式尚未就绪，请重试。')
  await frame()
 }
}
