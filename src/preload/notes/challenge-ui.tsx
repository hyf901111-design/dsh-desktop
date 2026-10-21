import React,{useEffect,useLayoutEffect,useRef,useState} from 'react'
import {FloatingThreadController,Thread,useBlockNoteEditor,useExtensionState} from '@blocknote/react'
import {CommentsExtension} from '@blocknote/core/comments'
import type {ChallengeLevel} from '../../shared/notes-challenge'
import {CHALLENGE_LEVELS} from './challenge-scheduler'
import {CHALLENGE_KIND,CHALLENGE_USER,type ChallengeThread,type useNoteChallenge} from './challenge-controller'
import {findChallengeQuote} from './challenge-anchors'
import {noteText} from '../../shared/workspace-notes'
import focusIcon from './assets/challenge-focus.svg?inline'
import reviewIcon from './assets/challenge-review.svg?inline'
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
  <button className="en-challenge-trigger" disabled={disabled} aria-label={'挑战模式，当前'+CHALLENGE_LEVELS[value].name} aria-expanded={open} onClick={()=>setOpen(!open)}><img src={focusIcon} alt=""/><span>挑战 {CHALLENGE_LEVELS[value].name}</span><span className="en-challenge-chevron" aria-hidden="true">⌄</span></button>
  {open?<section className="en-challenge-popover" aria-label="挑战强度"><div className="en-challenge-level-name">{CHALLENGE_LEVELS[preview].name}</div><div className="en-challenge-description">{CHALLENGE_LEVELS[preview].description}</div>
   <div className="en-challenge-slider" ref={track} role="slider" tabIndex={0} aria-label="挑战强度" aria-valuemin={0} aria-valuemax={4} aria-valuenow={preview} aria-valuetext={CHALLENGE_LEVELS[preview].name} data-pressed={pressed||undefined}
    onPointerDown={e=>{e.preventDefault();drag.current=true;setPressed(true);e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);pointer(e.clientX)}} onPointerMove={e=>{if(drag.current)pointer(e.clientX)}} onPointerUp={e=>{if(!drag.current)return;pointer(e.clientX);drag.current=false;setPressed(false);onChange(choice.current);e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>{drag.current=false;setPressed(false);setPreview(value)}}
    onKeyDown={e=>{let next=value;if(['ArrowRight','ArrowUp'].includes(e.key))next=Math.min(4,value+1) as ChallengeLevel;else if(['ArrowLeft','ArrowDown'].includes(e.key))next=Math.max(0,value-1) as ChallengeLevel;else if(e.key==='Home')next=0;else if(e.key==='End')next=4;else return;e.preventDefault();onChange(next);setPreview(next)}}>
    <div className="en-challenge-track"><div style={{width:12+57*preview}}/></div>{CHALLENGE_LEVELS.map((v,i)=><span key={v.name} className="en-challenge-stop" data-active={i<=preview||undefined} style={{left:12+57*i}}/>)}<img className="en-challenge-thumb" src={thumbIcon} alt="" style={{left:12+57*preview-16}}/>
   </div>
  </section>:null}
 </div>
}

/** Retains the existing manual comments while challenge threads use their own UI. */
function NativeThread(props:any){return props.thread?.metadata?.kind===CHALLENGE_KIND?null:<Thread {...props}/>}
export function ManualNoteThreads(){const editor:any=useBlockNoteEditor(),selected=useExtensionState(CommentsExtension,{selector:state=>state.selectedThreadId}),store=editor.getExtension(CommentsExtension)?.threadStore;return selected&&store?.getThreads().get(selected)?.metadata?.kind===CHALLENGE_KIND?null:<FloatingThreadController floatingThread={NativeThread}/>}

function ChallengeCard({thread,controller,style,cardRef}:{thread:ChallengeThread;controller:Controller;style:React.CSSProperties;cardRef(el:HTMLElement|null):void}){
 const draft=thread.metadata.draft||'',[text,setText]=useState(draft),input=useRef<HTMLTextAreaElement>(null),busy=controller.busyId===thread.id
 useEffect(()=>setText(draft),[draft])
 useLayoutEffect(()=>{const el=input.current;if(el){el.style.height='auto';el.style.height=Math.min(120,Math.max(36,el.scrollHeight))+'px'}},[text])
 const send=()=>{if(text.trim()&&!busy)void controller.runAction(thread,'reply',text)}
 return <article className="en-challenge-card" ref={cardRef} style={style} data-thread-id={thread.id} aria-label="AI挑战评论" onPointerDown={e=>e.stopPropagation()}>
  <div className="en-challenge-messages">
   <div className="en-challenge-quote">{thread.metadata.issue.quote}</div>
   <button className="en-challenge-close" aria-label="收起挑战评论" onClick={()=>controller.close(thread.id)}><img src={closeIcon} alt=""/></button>
   {thread.comments.filter(c=>!c.deletedAt).map((comment,index)=><div className="en-challenge-message" key={comment.id}>
    <div className="en-challenge-author">{comment.userId===CHALLENGE_USER?<><img src={reviewIcon} alt=""/><strong>AI挑战</strong></>:<strong>我</strong>}<time>{new Date(comment.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></div>
    {index===0?<div className="en-challenge-category">{names[thread.metadata.issue.category]||'挑战'}</div>:null}<div className="en-challenge-text">{noteText(comment.body)}</div>
   </div>)}
  </div>
  <div className="en-challenge-actions"><button disabled={busy} onClick={()=>void controller.runAction(thread,'optimize')}>{busy?'处理中…':'AI优化'}</button>{thread.metadata.issue.evidence.length?<button onClick={()=>controller.openEvidence(thread)}>查看依据</button>:null}<span/><button onClick={()=>void controller.resolve(thread.id)}>已解决</button></div>
  <div className="en-challenge-reply"><textarea ref={input} value={text} rows={1} maxLength={4000} aria-label="回复AI挑战" placeholder="回复AI挑战…" onChange={e=>{setText(e.target.value);controller.setDraft(thread.id,e.target.value)}} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&!e.nativeEvent.isComposing){e.preventDefault();send()}}}/><button disabled={!text.trim()||busy} aria-label="发送挑战回复" onClick={send}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></button></div>
 </article>
}

export function ChallengeComments({controller,editor,scroll}:{controller:Controller;editor:any;scroll:React.RefObject<HTMLDivElement>}){
 const root=useRef<HTMLDivElement>(null),cards=useRef(new Map<string,HTMLElement>()),[layout,setLayout]=useState<{wide:boolean;columnLeft:number;items:Array<{id:string;style:React.CSSProperties}>}>({wide:false,columnLeft:0,items:[]})
 useLayoutEffect(()=>{
  const host=root.current?.parentElement,scroller=scroll.current;if(!host||!scroller)return
  let frame=0
  const measure=()=>{
   cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
    const area=host.getBoundingClientRect(),wide=area.width>=1180&&controller.threads.length>0
    if(host.dataset.challengeWide!==(wide?'true':'false'))host.dataset.challengeWide=wide?'true':'false'
    const doc=scroller.querySelector<HTMLElement>('.en-document')?.getBoundingClientRect();if(!doc)return
    let bottom=8
    const columnLeft=wide?Math.max(0,Math.min(area.width-336,doc.right-area.left+20)-8):0
    const candidates=controller.threads.filter(t=>!controller.isDismissed(t.id)&&(wide||t.id===controller.selected)).map(t=>{const range=findChallengeQuote(editor,t.metadata.issue.blockId,t.metadata.issue.quote);if(!range)return;try{const start=editor._tiptapEditor.view.coordsAtPos(range.from),end=editor._tiptapEditor.view.coordsAtPos(range.to),rect={...start,bottom:end.bottom};if(wide&&(rect.bottom<area.top+36||rect.top>area.bottom-12))return;return {thread:t,rect}}catch{return}}).filter(Boolean) as Array<{thread:ChallengeThread;rect:{top:number;bottom:number;left:number}}>
    candidates.sort((a,b)=>a.rect.top-b.rect.top)
    const items=candidates.map(({thread,rect})=>{
     const height=cards.current.get(thread.id)?.getBoundingClientRect().height||260,maxHeight=Math.max(120,area.height-24)
     let top=rect.top-area.top
     if(wide){top=Math.max(top,bottom);bottom=top+Math.min(height,maxHeight)+12}
     else top=Math.max(8,Math.min(rect.bottom-area.top+10,area.height-Math.min(height,maxHeight)-8))
     return {id:thread.id,style:{top,left:wide?8:Math.max(8,Math.min(area.width-328,rect.left-area.left)),maxHeight,width:Math.min(320,area.width-16)}}
    })
    setLayout(old=>JSON.stringify(old)==JSON.stringify({wide,columnLeft,items})?old:{wide,columnLeft,items})
   })
  }
  const observer=new ResizeObserver(measure);observer.observe(host);observer.observe(scroller);for(const el of cards.current.values())observer.observe(el)
  const documentScroll=()=>{if(root.current)root.current.scrollTop=0;measure()}
  scroller.addEventListener('scroll',documentScroll);window.addEventListener('resize',measure);measure()
  const outside=(e:Event)=>{if(!layout.wide&&controller.selected&&!(e.target as HTMLElement).closest('.en-challenge-card,[data-bn-thread-id]'))controller.close(controller.selected)}
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&controller.selected)controller.close(controller.selected)}
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape)
  return()=>{cancelAnimationFrame(frame);observer.disconnect();scroller.removeEventListener('scroll',documentScroll);window.removeEventListener('resize',measure);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}
 },[controller.revision,controller.selected,controller.level,layout.wide])
 return <div className="en-challenge-comments" ref={root} data-wide={layout.wide||undefined} style={{left:layout.columnLeft}}>{layout.items.map(item=>{const thread=controller.threads.find(t=>t.id===item.id);return thread?<ChallengeCard key={thread.id} thread={thread} controller={controller} style={item.style} cardRef={el=>{if(el)cards.current.set(thread.id,el);else cards.current.delete(thread.id)}}/>:null})}</div>
}
