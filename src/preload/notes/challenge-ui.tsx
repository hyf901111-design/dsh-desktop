import {createPortal} from 'react-dom'
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react'
import {FloatingThreadController,Thread,useBlockNoteEditor,useExtensionState} from '@blocknote/react'
import {CommentsExtension} from '@blocknote/core/comments'
import type {ChallengeLevel} from '../../shared/notes-challenge'
import {CHALLENGE_LEVELS} from './challenge-scheduler'
import {CHALLENGE_KIND,CHALLENGE_USER,type ChallengeThread,type useNoteChallenge} from './challenge-controller'
import {findChallengeQuote} from './challenge-anchors'
import {noteText} from '../../shared/workspace-notes'
import swordsIcon from './assets/challenge-swords.svg?inline'
import collapseIcon from './assets/challenge-margin-collapse.svg?inline'
import expandIcon from './assets/challenge-margin-expand.svg?inline'
import chevronIcon from './assets/challenge-chevron.svg?inline'
import reviewIcon from './assets/challenge-review.svg?inline'
import stopIcon from './assets/challenge-stop.svg?inline'
import stopActiveIcon from './assets/challenge-stop-active.svg?inline'
import thumbIcon from './assets/challenge-thumb.svg?inline'
import closeIcon from './assets/challenge-close.svg?inline'
type Controller=ReturnType<typeof useNoteChallenge>
const names:Record<string,string>={typo:'错别字',grammar:'表达建议',contradiction:'前后矛盾',logic:'逻辑挑战',fact:'事实核验',research:'研究挑战',question:'反驳与追问',uncertain:'待核验'}

export function ChallengePicker({value,onChange,disabled=false}:{value:ChallengeLevel;onChange(value:ChallengeLevel):void;disabled?:boolean}){
 const [open,setOpen]=useState(false),[preview,setPreview]=useState(value),[pressed,setPressed]=useState(false),root=useRef<HTMLDivElement>(null),track=useRef<HTMLDivElement>(null),drag=useRef(false),choice=useRef(value)
 useEffect(()=>{if(!drag.current){setPreview(value);choice.current=value}},[value])
 useEffect(()=>{if(!open)return;const close=(e:Event)=>{if(!root.current?.contains(e.target as Node))setOpen(false)},key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);root.current?.querySelector<HTMLButtonElement>('button')?.focus()}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key)}},[open])
 const pointer=(clientX:number)=>{const r=track.current!.getBoundingClientRect(),next=Math.max(0,Math.min(4,Math.round(((clientX-r.left)/r.width*252-12)/57))) as ChallengeLevel;choice.current=next;setPreview(next)}
 return <div className="en-challenge-picker" ref={root}>
  <button className="en-challenge-trigger" disabled={disabled} aria-label={'挑战模式，当前'+CHALLENGE_LEVELS[value].name} aria-expanded={open} onClick={()=>setOpen(!open)}><img src={swordsIcon} alt=""/><span>AI挑战</span><span className="en-challenge-grade">{CHALLENGE_LEVELS[value].name}</span><img className="en-challenge-chevron" src={chevronIcon} alt=""/></button>
  {open?<section className="en-challenge-popover" aria-label="挑战强度"><div className="en-challenge-level-name">{CHALLENGE_LEVELS[preview].name}</div><div className="en-challenge-description">{CHALLENGE_LEVELS[preview].description}</div>
   <div className="en-challenge-slider" ref={track} role="slider" tabIndex={0} aria-label="挑战强度" aria-valuemin={0} aria-valuemax={4} aria-valuenow={preview} aria-valuetext={CHALLENGE_LEVELS[preview].name} data-pressed={pressed||undefined}
    onPointerDown={e=>{e.preventDefault();drag.current=true;setPressed(true);e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);pointer(e.clientX)}} onPointerMove={e=>{if(drag.current)pointer(e.clientX)}} onPointerUp={e=>{if(!drag.current)return;pointer(e.clientX);drag.current=false;setPressed(false);onChange(choice.current);e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>{drag.current=false;setPressed(false);setPreview(value)}}
    onKeyDown={e=>{let next=value;if(['ArrowRight','ArrowUp'].includes(e.key))next=Math.min(4,value+1) as ChallengeLevel;else if(['ArrowLeft','ArrowDown'].includes(e.key))next=Math.max(0,value-1) as ChallengeLevel;else if(e.key==='Home')next=0;else if(e.key==='End')next=4;else return;e.preventDefault();onChange(next);setPreview(next)}}>
    <div className="en-challenge-track"><div style={{width:12+57*preview}}/></div>{CHALLENGE_LEVELS.map((v,i)=><img key={v.name} src={i<=preview?stopActiveIcon:stopIcon} alt="" className="en-challenge-stop" style={{left:12+57*i}}/>)}<img className="en-challenge-thumb" src={thumbIcon} alt="" style={{left:12+57*preview-16}}/>
   </div>
  </section>:null}
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
  {marginAvailable?<button className="en-challenge-margin-toggle" type="button" aria-expanded={controller.marginExpanded} onClick={()=>controller.setMarginExpanded(!controller.marginExpanded)}><img src={controller.marginExpanded?collapseIcon:expandIcon} alt=""/>{controller.marginExpanded?'收起评论':'展开评论'}</button>:null}
  <ChallengePicker value={controller.level} onChange={controller.setLevel} disabled={disabled}/>
 </div>
 return host?createPortal(tools,host):tools
}

/** Retains the existing manual comments while challenge threads use their own UI. */
function NativeThread(props:any){return props.thread?.metadata?.kind===CHALLENGE_KIND?null:<Thread {...props}/>}
export function ManualNoteThreads(){const editor:any=useBlockNoteEditor(),selected=useExtensionState(CommentsExtension,{selector:state=>state.selectedThreadId}),store=editor.getExtension(CommentsExtension)?.threadStore;return selected&&store?.getThreads().get(selected)?.metadata?.kind===CHALLENGE_KIND?null:<FloatingThreadController floatingThread={NativeThread}/>}

function ChallengeCard({thread,controller,style,cardRef,selected}:{thread:ChallengeThread;controller:Controller;style:React.CSSProperties;cardRef(el:HTMLElement|null):void;selected:boolean}){
 const draft=thread.metadata.draft||'',[text,setText]=useState(draft),input=useRef<HTMLTextAreaElement>(null),messages=useRef<HTMLDivElement>(null),busy=controller.busyId===thread.id,replyPending=busy&&controller.actionKind==='reply'
 useEffect(()=>setText(draft),[draft])
 useLayoutEffect(()=>{const el=input.current;if(el){el.style.height='auto';el.style.height=Math.min(120,Math.max(36,el.scrollHeight))+'px'}},[text])
 useLayoutEffect(()=>{if(replyPending&&messages.current)messages.current.scrollTop=messages.current.scrollHeight},[replyPending,thread.comments.length])
 const send=()=>{if(text.trim()&&!busy)void controller.runAction(thread,'reply',text)}
 return <article className="en-challenge-card" ref={cardRef} style={style} data-thread-id={thread.id} data-selected={selected||undefined} aria-label="AI挑战评论" onPointerDown={e=>{e.stopPropagation();if(controller.selected!==thread.id)controller.select(thread.id)}}>
   <button className="en-challenge-close" aria-label="收起挑战评论" onClick={()=>controller.close(thread.id)}><img src={closeIcon} alt=""/></button>
  <div className="en-challenge-messages" ref={messages}>
   <div className="en-challenge-quote">{thread.metadata.issue.quote}</div>
   {thread.comments.filter(c=>!c.deletedAt).map((comment,index)=><div className="en-challenge-message" key={comment.id}>
    <div className="en-challenge-author">{comment.userId===CHALLENGE_USER?<><img src={reviewIcon} alt=""/><strong>AI 挑战</strong></>:<strong>我</strong>}<time>{new Date(comment.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></div>
    {index===0?<div className="en-challenge-category">{names[thread.metadata.issue.category]||'挑战'}</div>:null}<div className="en-challenge-text">{noteText(comment.body)}</div>
    {index===0?<div className="en-challenge-actions"><button className="en-challenge-optimize" disabled={!!controller.busyId} onClick={()=>void controller.runAction(thread,'optimize')}>{busy&&controller.actionKind==='optimize'?'处理中…':'AI优化'}</button>{thread.metadata.issue.evidence.length?<button onClick={()=>controller.openEvidence(thread)}>查看依据</button>:null}<span/><button onClick={()=>void controller.resolve(thread.id)}>已解决</button></div>:null}
   </div>)}
   {replyPending?<div className="en-challenge-thinking" role="status" aria-live="polite"><span aria-hidden="true"/>思考回复中…</div>:null}
  </div>

  <div className="en-challenge-reply"><textarea ref={input} value={text} rows={1} maxLength={4000} aria-label="回复AI挑战" placeholder="回复 AI，继续处理这段文字…" onChange={e=>{setText(e.target.value);controller.setDraft(thread.id,e.target.value)}} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&!e.nativeEvent.isComposing){e.preventDefault();send()}}}/><button disabled={!text.trim()||!!controller.busyId} aria-label="发送挑战回复" onClick={send}>发送</button></div>
 </article>
}

export function ChallengeComments({controller,editor,scroll,onMarginAvailableChange}:{controller:Controller;editor:any;scroll:React.RefObject<HTMLDivElement>;onMarginAvailableChange(value:boolean):void}){
 const root=useRef<HTMLDivElement>(null),cards=useRef(new Map<string,HTMLElement>()),resize=useRef<ResizeObserver>(),[layout,setLayout]=useState<{wide:boolean;multiple:boolean;columnLeft:number;items:Array<{id:string;style:React.CSSProperties}>}>({wide:false,multiple:false,columnLeft:0,items:[]})
 useLayoutEffect(()=>{
  const host=root.current?.parentElement,scroller=scroll.current;if(!host||!scroller)return
  let frame=0
  const measure=()=>{
   cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
    const area=host.getBoundingClientRect(),body=scroller.querySelector<HTMLElement>('.en-document')?.getBoundingClientRect(),sessionId=scroller.closest<HTMLElement>('[data-note-source-session]')?.dataset.noteSourceSession,trigger=(sessionId?document.querySelector<HTMLElement>('[data-en-challenge-tools="'+CSS.escape(sessionId)+'"] .en-challenge-trigger'):null)||scroller.closest('.en-body')?.querySelector<HTMLElement>('.en-challenge-trigger'),triggerRight=trigger?.getBoundingClientRect().right??area.right-18
    // The original document is measured as-is. Comments never reserve writing space.
    const marginAvailable=!!body&&triggerRight<=area.right&&triggerRight-body.right>=320+24,wide=marginAvailable&&controller.marginExpanded
    onMarginAvailableChange(marginAvailable)
    if(host.dataset.challengeWide!==(wide?'true':'false'))host.dataset.challengeWide=wide?'true':'false'
    // Keep the note centered in its own region; the global sidebar is outside it.
    const focused=document.activeElement,focusedId=controller.marginExpanded&&!wide&&layout.wide&&focused?.matches('.en-challenge-reply textarea')?focused.closest<HTMLElement>('.en-challenge-card')?.dataset.threadId:undefined
    const editingId=focusedId&&!controller.isDismissed(focusedId)?focusedId:undefined
    if(!wide&&editingId&&editingId!==controller.selected)controller.select(editingId)
    let bottom=16
    const columnLeft=wide?triggerRight-area.left-320-16:0
    const candidates=controller.threads.filter(t=>!controller.isDismissed(t.id)&&(wide||t.id===controller.selected||t.id===editingId)).map(t=>{const range=findChallengeQuote(editor,t.metadata.issue.blockId,t.metadata.issue.quote);if(!range)return;try{const start=editor._tiptapEditor.view.coordsAtPos(range.from),end=editor._tiptapEditor.view.coordsAtPos(range.to),rect={...start,bottom:end.bottom};if(wide&&(rect.bottom<area.top+36||rect.top>area.bottom-12))return;return {thread:t,rect}}catch{return}}).filter(Boolean) as Array<{thread:ChallengeThread;rect:{top:number;bottom:number;left:number}}>
    candidates.sort((a,b)=>a.rect.top-b.rect.top)
    const items=candidates.map(({thread,rect})=>{
     const height=cards.current.get(thread.id)?.getBoundingClientRect().height||260,maxHeight=Math.max(120,area.height-32)
     let top=rect.top-area.top
     if(wide){top=Math.max(top,bottom);bottom=top+Math.min(height,maxHeight)+12}
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
  const outside=(e:Event)=>{if(!layout.wide&&controller.selected&&!(e.target as HTMLElement).closest('.en-challenge-card,.en-challenge-tools,[data-bn-thread-id]'))controller.close(controller.selected)}
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&controller.selected)controller.close(controller.selected)}
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape)
  return()=>{cancelAnimationFrame(frame);if(resize.current===observer)resize.current=undefined;observer.disconnect();margin?.removeEventListener('scroll',measure);scroller.removeEventListener('scroll',documentScroll);window.removeEventListener('resize',measure);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}
 },[controller.revision,controller.selected,controller.level,controller.marginExpanded,layout.wide,onMarginAvailableChange])
 const markStyles=controller.threads.map(thread=>'.en-root [data-bn-thread-id="'+CSS.escape(thread.id)+'"]:not([data-orphan="true"]){background:var('+(thread.id===controller.selected?'--en-challenge-mark-selected':'--en-challenge-mark')+');border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone}').join('')
 return <><style>{markStyles}</style><div className="en-challenge-comments" ref={root} data-wide={layout.wide||undefined} style={{left:layout.columnLeft}}>{layout.items.map(item=>{const thread=controller.threads.find(t=>t.id===item.id);return thread?<ChallengeCard key={thread.id} thread={thread} controller={controller} selected={layout.multiple&&thread.id===controller.selected} style={item.style} cardRef={el=>{const prior=cards.current.get(thread.id);if(prior&&prior!==el)resize.current?.unobserve(prior);if(el){cards.current.set(thread.id,el);resize.current?.observe(el)}else cards.current.delete(thread.id)}}/>:null})}</div></>
}
