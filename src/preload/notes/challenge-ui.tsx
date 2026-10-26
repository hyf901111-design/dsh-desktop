import {createPortal} from 'react-dom'
import {noteUiText as t} from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react'
import {FloatingThreadController,Thread,useBlockNoteEditor,useExtensionState} from '@blocknote/react'
import {CommentsExtension} from '@blocknote/core/comments'
import type {ChallengeLevel} from '../../shared/notes-challenge'
import {CHALLENGE_LEVELS} from './challenge-scheduler'
import {CHALLENGE_KIND,CHALLENGE_USER,type ChallengeThread,type useNoteChallenge} from './challenge-controller'
import {findChallengeQuote} from './challenge-anchors'
import {ChallengeParagraphFeedback} from './challenge-coverage'
import {noteText} from '../../shared/workspace-notes'
import shieldIcon from './assets/challenge-shield.svg?inline'
import busyShieldIcon from './assets/challenge-shield-busy.svg?inline'
import collapseIcon from './assets/challenge-margin-collapse.svg?inline'
import expandIcon from './assets/challenge-margin-expand.svg?inline'
import chevronIcon from './assets/challenge-chevron.svg?inline'
import stopIcon from './assets/challenge-stop.svg?inline'
import stopActiveIcon from './assets/challenge-stop-active.svg?inline'
import thumbIcon from './assets/challenge-thumb.svg?inline'
import closeIcon from './assets/challenge-close.svg?inline'
type Controller=ReturnType<typeof useNoteChallenge>
const names:Record<string,string>={typo:'错别字',grammar:'表达建议',contradiction:'前后矛盾',logic:'逻辑挑战',fact:'事实核验',research:'研究挑战',question:'反驳与追问',uncertain:'待核验'}
const levelName=(level:ChallengeLevel)=>t(level===0&&document.documentElement.dataset.odysseyLocale==='en'?'挑战模式关闭':CHALLENGE_LEVELS[level].name)

export function ChallengePicker({value,onChange,disabled=false,dark=false,running=false,onOpenChange}:{value:ChallengeLevel;running?:boolean;onOpenChange?(open:boolean):void;onChange(value:ChallengeLevel):void;disabled?:boolean;dark?:boolean}){
 // SVG-as-image media queries do not reliably inherit the host motion preference.
 const [reducedMotion,setReducedMotion]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReducedMotion(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[])
 const [open,setOpen]=useState(false),[preview,setPreview]=useState(value),[pressed,setPressed]=useState(false),root=useRef<HTMLDivElement>(null),popover=useRef<HTMLElement>(null),[position,setPosition]=useState({left:8,top:8}),track=useRef<HTMLDivElement>(null),drag=useRef(false),choice=useRef(value)
 // Header discovery can move this picker into a portal without unmounting the note.
 const openListener=useRef(onOpenChange);openListener.current=onOpenChange
 useEffect(()=>()=>openListener.current?.(false),[])
 const changeOpen=(next:boolean)=>{setOpen(next);openListener.current?.(next)}
 useEffect(()=>{if(!drag.current){setPreview(value);choice.current=value}},[value])
 useEffect(()=>{if(disabled&&open)changeOpen(false)},[disabled])
 useLayoutEffect(()=>{
  if(!open)return
  const trigger=root.current?.querySelector('button');if(!trigger)return
  const header=trigger.closest<HTMLElement>('[data-ework-notes-session]'),sessionId=header?.dataset.eworkNotesSession,surface=(sessionId?document.querySelector('[data-note-source-session="'+CSS.escape(sessionId)+'"]'):root.current)?.closest<HTMLElement>('.en-root')
  const visible=()=>trigger.isConnected&&trigger.getClientRects().length>0&&getComputedStyle(trigger).visibility!=='hidden'&&!trigger.closest('[hidden],[aria-hidden="true"],[inert]')&&surface?.dataset.settingsOpen!=='true'&&(!surface||!surface.hidden&&getComputedStyle(surface).display!=='none'&&getComputedStyle(surface).visibility!=='hidden')&&!document.querySelector('.VOzbGW_overlay:not([hidden])')&&(!document.body.dataset.workspaceSurface||document.body.dataset.workspaceSurface==='notes')
  const measure=()=>{if(!visible()){drag.current=false;setPressed(false);changeOpen(false);return false}const r=trigger.getBoundingClientRect(),height=popover.current?.getBoundingClientRect().height||112,next={left:Math.max(8,Math.min(r.right-280,window.innerWidth-288)),top:Math.max(8,Math.min(r.bottom+6,window.innerHeight-height-8))};setPosition(old=>old.left===next.left&&old.top===next.top?old:next);return true}
  const resize=new ResizeObserver(measure);resize.observe(trigger);if(header)resize.observe(header);if(popover.current)resize.observe(popover.current)
  // Observe only the resident surface and trigger ancestors; native settings
  // portals are direct body children. No observer follows editor mutations.
  const visibility=new MutationObserver(measure),attributes={attributes:true,attributeFilter:['class','style','hidden','aria-hidden','inert','data-settings-open','data-workspace-surface']}
  for(let ancestor=trigger.parentElement;ancestor&&ancestor!==document.body;ancestor=ancestor.parentElement)visibility.observe(ancestor,attributes)
  if(surface)visibility.observe(surface,attributes)
  visibility.observe(document.body,{...attributes,childList:true})
  window.addEventListener('resize',measure);window.addEventListener('scroll',measure,true);document.addEventListener('sherlock:workspace-surface-change',measure)
  if(measure())track.current?.focus({preventScroll:true})
  return()=>{resize.disconnect();visibility.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);document.removeEventListener('sherlock:workspace-surface-change',measure)}
 },[open])
 useEffect(()=>{
  if(!open)return
  const close=(e:Event)=>{if(!root.current?.contains(e.target as Node)&&!popover.current?.contains(e.target as Node))changeOpen(false)},key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();drag.current=false;setPressed(false);changeOpen(false);root.current?.querySelector<HTMLButtonElement>('button')?.focus()}}
  document.addEventListener('pointerdown',close);document.addEventListener('keydown',key,true)
  return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key,true)}
 },[open])
 const pointer=(clientX:number)=>{const r=track.current!.getBoundingClientRect(),next=Math.max(0,Math.min(4,Math.round(((clientX-r.left)/r.width*252-12)/57))) as ChallengeLevel;choice.current=next;setPreview(next)}
 return <div className="en-challenge-picker" ref={root}>
  <button className="en-challenge-trigger" disabled={disabled} aria-busy={running} aria-description={running?t('AI挑战正在执行'):undefined} aria-label={t('挑战模式，当前{level}').replace('{level}',levelName(value))} aria-expanded={open} onClick={()=>changeOpen(!open)}><img src={running&&!reducedMotion?busyShieldIcon:shieldIcon} alt=""/><span>{t('AI挑战')}</span><span className="en-challenge-grade">{levelName(value)}</span><img className="en-challenge-chevron" src={chevronIcon} alt=""/></button>
  {open?createPortal(<section className="en-challenge-popover" ref={popover} data-dark={dark} style={position} aria-label={t('挑战强度')}><div className="en-challenge-level-name">{levelName(preview)}</div><div className="en-challenge-description">{t(CHALLENGE_LEVELS[preview].description)}</div>
   <div className="en-challenge-slider" ref={track} role="slider" tabIndex={0} aria-label={t('挑战强度')} aria-valuemin={0} aria-valuemax={4} aria-valuenow={preview} aria-valuetext={levelName(preview)} data-pressed={pressed||undefined}
    onPointerDown={e=>{e.preventDefault();drag.current=true;setPressed(true);e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);pointer(e.clientX)}} onPointerMove={e=>{if(drag.current)pointer(e.clientX)}} onPointerUp={e=>{if(!drag.current)return;pointer(e.clientX);drag.current=false;setPressed(false);onChange(choice.current);e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>{drag.current=false;setPressed(false);setPreview(value)}}
    onKeyDown={e=>{let next=value;if(['ArrowRight','ArrowUp'].includes(e.key))next=Math.min(4,value+1) as ChallengeLevel;else if(['ArrowLeft','ArrowDown'].includes(e.key))next=Math.max(0,value-1) as ChallengeLevel;else if(e.key==='Home')next=0;else if(e.key==='End')next=4;else return;e.preventDefault();onChange(next);setPreview(next)}}>
    <div className="en-challenge-track"><div style={{width:12+57*preview}}/></div>{CHALLENGE_LEVELS.map((v,i)=><img key={v.name} src={i<=preview?stopActiveIcon:stopIcon} alt="" className="en-challenge-stop" style={{left:12+57*i}}/>)}<img className="en-challenge-thumb" src={thumbIcon} alt="" style={{left:12+57*preview-16}}/>
   </div>
  </section>,document.body):null}
 </div>
}

/** The native header owns this slot; a portal keeps the note controller resident. */
export function ChallengeToolbar({controller,sessionId,dark,marginAvailable,disabled=false}:{controller:Controller;sessionId:string;dark:boolean;marginAvailable:boolean;disabled?:boolean}){
 const [host,setHost]=useState<HTMLElement|null>(null)
 useLayoutEffect(()=>{
  const find=()=>{const next=document.querySelector<HTMLElement>('[data-en-challenge-tools="'+CSS.escape(sessionId)+'"]');setHost(old=>old===next?old:next)}
  find();const observer=new MutationObserver(find);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-en-challenge-tools']});return()=>observer.disconnect()
 },[sessionId])
 const tools=<div className="en-challenge-tools" data-dark={dark} data-header={!!host}>
  {marginAvailable?<button className="en-challenge-margin-toggle" type="button" aria-expanded={controller.marginExpanded} onClick={()=>controller.setMarginExpanded(!controller.marginExpanded)}><img src={controller.marginExpanded?collapseIcon:expandIcon} alt=""/>{t(controller.marginExpanded?'收起评论':'展开评论')}</button>:null}
  <ChallengePicker onOpenChange={controller.setPickerOpen} running={controller.running} value={controller.level} onChange={controller.setLevel} disabled={disabled} dark={dark}/>
 </div>
 return host?createPortal(tools,host):tools
}

/** Retains the existing manual comments while challenge threads use their own UI. */
function NativeThread(props:any){return props.thread?.metadata?.kind===CHALLENGE_KIND?null:<Thread {...props}/>}
export function ManualNoteThreads(){const editor:any=useBlockNoteEditor(),selected=useExtensionState(CommentsExtension,{selector:state=>state.selectedThreadId}),store=editor.getExtension(CommentsExtension)?.threadStore;return selected&&store?.getThreads().get(selected)?.metadata?.kind===CHALLENGE_KIND?null:<FloatingThreadController floatingThread={NativeThread}/>}

function ChallengeCard({thread,controller,style,cardRef,selected,popup}:{thread:ChallengeThread;controller:Controller;style:React.CSSProperties;cardRef(el:HTMLElement|null):void;selected:boolean;popup:boolean}){
 const draft=thread.metadata.draft||'',[text,setText]=useState(draft),input=useRef<HTMLTextAreaElement>(null),messages=useRef<HTMLDivElement>(null),busy=controller.busyId===thread.id,replyPending=busy&&controller.actionKind==='reply',followEnd=useRef(true),priorMessages=useRef({pending:false,count:thread.comments.length})
 useEffect(()=>setText(draft),[draft])
 useLayoutEffect(()=>{const el=input.current;if(el){el.style.height='auto';el.style.height=Math.min(120,Math.max(36,el.scrollHeight))+'px'}},[text])
 useLayoutEffect(()=>{
  const prior=priorMessages.current,el=messages.current
  if(el&&(replyPending&&!prior.pending||thread.comments.length!==prior.count&&followEnd.current)){el.scrollTop=el.scrollHeight;followEnd.current=true}
  priorMessages.current={pending:replyPending,count:thread.comments.length}
 },[replyPending,thread.comments.length])
 const send=()=>{if(text.trim()&&!busy)void controller.runAction(thread,'reply',text)}
 return <article className="en-challenge-card" ref={cardRef} style={style} data-thread-id={thread.id} data-popup={popup||undefined} data-selected={selected||undefined} aria-label={t('AI挑战评论')} onPointerDown={e=>{e.stopPropagation();if(controller.selected!==thread.id)controller.select(thread.id)}}>
   {popup?<button className="en-challenge-close" aria-label={t('收起挑战评论')} onClick={()=>controller.close(thread.id)}><img src={closeIcon} alt=""/></button>:null}
  <div className="en-challenge-messages" ref={messages} onScroll={e=>{const el=e.currentTarget;followEnd.current=el.scrollHeight-el.clientHeight-el.scrollTop<=24}}>
   <div className="en-challenge-quote">{thread.metadata.issue.quote}</div>
   {thread.comments.filter(c=>!c.deletedAt).map((comment,index)=><div className="en-challenge-message" key={comment.id}>
    <div className="en-challenge-author">{comment.userId===CHALLENGE_USER?<><img src={shieldIcon} alt=""/><strong>{t('AI挑战者')}</strong></>:<strong>{t('我')}</strong>}<time>{new Date(comment.createdAt).toLocaleTimeString(document.documentElement.dataset.odysseyLocale==='en'?'en':'zh-CN',{hour:'2-digit',minute:'2-digit'})}</time></div>
    {index===0?<div className="en-challenge-category">{t(names[thread.metadata.issue.category]||'挑战')}</div>:null}<div className="en-challenge-text">{noteText(comment.body)}</div>
    {comment.metadata?.challengeReplacement&&comment.metadata.challengeReplacement.replacement!==comment.metadata.challengeReplacement.quote?<div className="en-challenge-suggestion"><div className="en-challenge-replacement-text">{comment.metadata.challengeReplacement.replacement}</div><button className="en-challenge-replace" disabled={!!controller.busyId||!['pending','reverted'].includes(comment.metadata.challengeReplacement.status)} onClick={()=>void controller.applyReplacement(thread.id,comment.id)}>{t(comment.metadata.challengeReplacement.status==='applied'?'已替换到原文':comment.metadata.challengeReplacement.status==='stale'?'原文已变化':'替换到原文')}</button></div>:null}
    {index===0?<div className="en-challenge-actions"><button className="en-challenge-optimize" aria-label={t('AI优化')} aria-busy={busy&&controller.actionKind==='optimize'} disabled={!!controller.busyId} onClick={()=>void controller.runAction(thread,'optimize')}>{busy&&controller.actionKind==='optimize'?<span className="en-challenge-optimize-spinner" role="progressbar" aria-label={t('正在优化')}/>:null}{t('AI优化')}</button>{thread.metadata.issue.evidence.length?<button onClick={()=>controller.openEvidence(thread)}>{t('查看依据')}</button>:null}<span/><button onClick={()=>void controller.resolve(thread.id)}>{t('已解决')}</button></div>:null}
   </div>)}
   {replyPending?<div className="en-challenge-thinking" role="status" aria-live="polite"><span aria-hidden="true"/>{t('思考回复中…')}</div>:null}
  </div>

  <div className="en-challenge-reply"><textarea ref={input} value={text} rows={1} maxLength={4000} aria-label={t('回复AI挑战')} placeholder={t('回复 AI，继续处理这段文字…')} onChange={e=>{setText(e.target.value);controller.setDraft(thread.id,e.target.value)}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.nativeEvent.keyCode!==229){e.preventDefault();send()}}}/><button disabled={!text.trim()||!!controller.busyId} aria-label={t('发送挑战回复')} onClick={send}>{t('发送')}</button></div>
 </article>
}

export function ChallengeComments({controller,editor,scroll,onMarginAvailableChange}:{controller:Controller;editor:any;scroll:React.RefObject<HTMLDivElement>;onMarginAvailableChange(value:boolean):void}){
 type Layout={wide:boolean;multiple:boolean;columnLeft:number;items:Array<{id:string;style:React.CSSProperties}>}
 const root=useRef<HTMLDivElement>(null),cards=useRef(new Map<string,HTMLElement>()),resize=useRef<ResizeObserver>(),[layout,setLayout]=useState<Layout>({wide:false,multiple:false,columnLeft:0,items:[]})
 const [presentation,setPresentation]=useState(layout),[exiting,setExiting]=useState(false),target=useRef(layout),exitTimer=useRef<ReturnType<typeof setTimeout>>()
 const [reducedMotion,setReducedMotion]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches)
 target.current=layout
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReducedMotion(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[])
 useLayoutEffect(()=>{
  // Keep the existing cards and their drafts mounted until the rail finishes fading.
  // A new visible target cancels this exit, so rapid toggles reverse the transition.
  if(presentation.wide&&!layout.wide&&!layout.items.length&&!reducedMotion){
   if(!exitTimer.current){setExiting(true);exitTimer.current=setTimeout(()=>{exitTimer.current=undefined;setPresentation(target.current);setExiting(false)},180)}
   return
  }
  clearTimeout(exitTimer.current);exitTimer.current=undefined;setExiting(false);setPresentation(layout)
 },[layout,reducedMotion])
 useLayoutEffect(()=>{if(root.current)root.current.inert=exiting},[exiting])
 useEffect(()=>()=>clearTimeout(exitTimer.current),[])

 useLayoutEffect(()=>{
  const host=root.current?.parentElement,scroller=scroll.current;if(!host||!scroller)return
  let frame=0
  const measure=()=>{
   cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
    const area=host.getBoundingClientRect(),body=scroller.querySelector<HTMLElement>('.en-document')?.getBoundingClientRect(),sessionId=scroller.closest<HTMLElement>('[data-note-source-session]')?.dataset.noteSourceSession,trigger=(sessionId?document.querySelector<HTMLElement>('[data-en-challenge-tools="'+CSS.escape(sessionId)+'"] .en-challenge-trigger'):null)||scroller.closest('.en-body')?.querySelector<HTMLElement>('.en-challenge-trigger'),exportButton=trigger?.closest('[data-ework-notes-session]')?.querySelector<HTMLElement>('.en-header-export'),alignmentRight=(exportButton||trigger)?.getBoundingClientRect().right??area.right-18
    // The original document is measured as-is. Comments never reserve writing space.
    const marginAvailable=!!body&&alignmentRight<=area.right&&alignmentRight-body.right>=320+24,wide=marginAvailable&&controller.marginExpanded
    onMarginAvailableChange(marginAvailable)
    if(host.dataset.challengeWide!==(wide?'true':'false'))host.dataset.challengeWide=wide?'true':'false'
    // Keep the note centered in its own region; the global sidebar is outside it.
    const focused=document.activeElement,focusedId=controller.marginExpanded&&!wide&&layout.wide&&focused?.matches('.en-challenge-reply textarea')?focused.closest<HTMLElement>('.en-challenge-card')?.dataset.threadId:undefined
    const editingId=focusedId&&!controller.isDismissed(focusedId)?focusedId:undefined
    if(!wide&&editingId&&editingId!==controller.selected)controller.select(editingId)
    let bottom=Number.NEGATIVE_INFINITY
    const columnLeft=wide?alignmentRight-area.left-320-16:0
    const candidates=controller.threads.filter(t=>!controller.isDismissed(t.id)&&(wide||t.id===controller.selected||t.id===editingId)).map(t=>{const range=findChallengeQuote(editor,t.metadata.issue.blockId,t.metadata.issue.quote);if(!range)return;try{
     const view=editor._tiptapEditor.view,start=view.coordsAtPos(range.from),end=view.coordsAtPos(range.to)
     let rect={...start,bottom:end.bottom}
     if(!wide){
      // An inline highlight has one rect per wrapped line. Its overall bounds
      // can end screens below the actual click, so never anchor a popup there.
      const fragments=Array.from(scroller.querySelectorAll<HTMLElement>('[data-bn-thread-id="'+CSS.escape(t.id)+'"]:not([data-orphan="true"])')).flatMap(mark=>Array.from(mark.getClientRects())).filter(part=>part.width>0&&part.height>0)
      const anchor=controller.popupAnchor,point=anchor?.threadId===t.id&&anchor.position>=range.from&&anchor.position<=range.to?view.coordsAtPos(anchor.position,anchor.position===range.to?-1:1):undefined
      const middle=point?(point.top+point.bottom)/2:0,line=point?(fragments.find(part=>part.top<=middle&&part.bottom>=middle&&part.left<=point.left+1&&part.right>=point.left-1)??fragments.find(part=>part.top<=middle&&part.bottom>=middle)):fragments.find(part=>part.bottom>area.top&&part.top<area.bottom)
      rect={...start,top:line?.top??point?.top??start.top,bottom:line?.bottom??point?.bottom??start.bottom,left:point?.left??line?.left??start.left}
     }
     return {thread:t,rect,position:range.from}
    }catch{return}}).filter(Boolean) as Array<{thread:ChallengeThread;rect:{top:number;bottom:number;left:number};position:number}>
    candidates.sort((a,b)=>a.position-b.position)
    const items=candidates.map(({thread,rect})=>{
     const height=cards.current.get(thread.id)?.getBoundingClientRect().height||260
     let maxHeight=Math.max(0,Math.min(560,area.height-32))
     let top=rect.top-area.top
     if(wide){
      top=Math.max(top,bottom)
      const visibleTop=top-(root.current?.scrollTop||0)
      if(visibleTop>=16&&visibleTop<area.height-120)maxHeight=Math.min(maxHeight,area.height-visibleTop-16)
      bottom=top+Math.min(height,maxHeight)+12
     }
     else{
      const below=rect.bottom-area.top+10,above=rect.top-area.top-Math.min(height,maxHeight)-10
      top=below+Math.min(height,maxHeight)<=area.height-16?below:above>=16?above:below
      // A selected quote can scroll offscreen while its reply still has focus.
      top=Math.max(16,Math.min(top,area.height-Math.min(height,maxHeight)-16))
     }
     const width=Math.min(320,area.width-32),left=wide?16:Math.max(16,Math.min(rect.left-area.left,area.width-width-16))
     return {id:thread.id,style:{top,left,maxHeight,width}}
    })
    const offset=root.current?.scrollTop||0,multiple=wide&&items.filter(item=>{const top=Number(item.style.top),height=cards.current.get(item.id)?.getBoundingClientRect().height||260;return top+height>offset&&top<offset+area.height}).length>1
    setLayout(old=>JSON.stringify(old)==JSON.stringify({wide,multiple,columnLeft,items})?old:{wide,multiple,columnLeft,items})
   })
  }
  const observer=new ResizeObserver(measure);resize.current=observer;observer.observe(host);observer.observe(scroller);const note=scroller.querySelector('.en-document'),header=document.querySelector('[data-ework-notes-session]');if(note)observer.observe(note);if(header)observer.observe(header);for(const el of cards.current.values())observer.observe(el)
  const documentScroll=()=>{if(root.current)root.current.scrollTop=0;measure()}
  const margin=root.current;margin?.addEventListener('scroll',measure);scroller.addEventListener('scroll',documentScroll);window.addEventListener('resize',measure);measure()
  const outside=(e:Event)=>{if(!layout.wide&&controller.selected&&!(e.target as HTMLElement).closest('.en-challenge-card,.en-challenge-tools,.en-challenge-popover,[data-bn-thread-id]'))controller.close(controller.selected)}
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&controller.selected)controller.close(controller.selected)}
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape)
  return()=>{cancelAnimationFrame(frame);if(resize.current===observer)resize.current=undefined;observer.disconnect();margin?.removeEventListener('scroll',measure);scroller.removeEventListener('scroll',documentScroll);window.removeEventListener('resize',measure);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}
 },[controller.revision,controller.selected,controller.popupAnchor,controller.level,controller.marginExpanded,layout.wide,onMarginAvailableChange])
 const markStyles=controller.threads.map(thread=>'.en-root [data-bn-thread-id="'+CSS.escape(thread.id)+'"]:not([data-orphan="true"]){background:var('+(thread.id===controller.selected?'--en-challenge-mark-selected':'--en-challenge-mark')+');border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone}').join('')
 return <><ChallengeParagraphFeedback items={controller.paragraphFeedback} scroll={scroll} revision={controller.revision} level={controller.level} reducedMotion={reducedMotion}/><style>{markStyles}</style><div className="en-challenge-comments" ref={root} data-wide={presentation.wide||undefined} data-empty={!presentation.items.length||undefined} data-exiting={exiting||undefined} aria-hidden={exiting||undefined} style={{left:presentation.columnLeft}}>{presentation.items.map(item=>{const thread=controller.threads.find(t=>t.id===item.id);return thread?<ChallengeCard key={thread.id} thread={thread} controller={controller} popup={!presentation.wide} selected={presentation.multiple&&thread.id===controller.selected} style={item.style} cardRef={el=>{const prior=cards.current.get(thread.id);if(prior&&prior!==el)resize.current?.unobserve(prior);if(el){cards.current.set(thread.id,el);resize.current?.observe(el)}else cards.current.delete(thread.id)}}/>:null})}</div></>
}
