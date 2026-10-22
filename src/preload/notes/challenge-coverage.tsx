import {useLayoutEffect,useRef,useState,type RefObject} from 'react'
import {noteUiText as t} from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import type {ChallengeBlock,ChallengeLevel} from '../../shared/notes-challenge'
import {CHALLENGE_LEVELS} from './challenge-scheduler'

export type ParagraphReview={text:string;title:string;level:ChallengeLevel;complete:boolean;issueCount:number}
export type ParagraphFeedback={blockId:string;state:'passed'|'issues';count:number;label:string}
/** A line describes the exact reviewed text, never a running request or an old tier. */
export function paragraphChallengeFeedback(records:Map<string,ParagraphReview>,blocks:ChallengeBlock[],title:string,level:ChallengeLevel,issues:Array<{id:string;blockId:string}>):ParagraphFeedback[]{
 if(!level)return[]
 return blocks.flatMap<ParagraphFeedback>(block=>{
  const record=records.get(block.id)
  if(!record||record.level!==level||record.title!==title||record.text!==block.text)return[]
  const count=new Set(issues.filter(issue=>issue.blockId===block.id).map(issue=>issue.id)).size,name=t(CHALLENGE_LEVELS[record.level].name)
  if(count)return[{blockId:block.id,state:'issues' as const,count,label:t('段落经{level}模式 AI 挑战校对，当前有 {count} 处未解决问题').replace('{level}',name).replace('{count}',String(count))}]
  if(!record.complete)return[]
  return[{blockId:block.id,state:'passed' as const,count:0,label:record.issueCount?t('段落经{level}模式 AI 挑战校对，已解决 {count} 处问题').replace('{level}',name).replace('{count}',String(record.issueCount)):t('段落已通过{level}模式的 AI 挑战，本轮未发现问题').replace('{level}',name)}]
 })
}

type PlacedFeedback=ParagraphFeedback&{key:string;level:ChallengeLevel;top:number;left:number;height:number;animate:boolean;enterDelay:number;exitDelay:number}
const ENTER_MS=240,EXIT_MS=180

function ParagraphLine({item,exiting,reducedMotion}:{item:PlacedFeedback;exiting:boolean;reducedMotion:boolean}){
 const root=useRef<HTMLDivElement>(null),stroke=useRef<HTMLSpanElement>(null),animation=useRef<Animation>(),entered=useRef(false),delay=exiting?item.exitDelay:item.enterDelay
 useLayoutEffect(()=>{
  const line=root.current,paint=stroke.current;if(!line||!paint)return
  // Sample before cancelling: a tier switch can interrupt an entrance delay/fade.
  const opacity=getComputedStyle(paint).opacity
  animation.current?.cancel();animation.current=undefined
  line.inert=exiting
  if(exiting&&line.contains(document.activeElement))(document.activeElement as HTMLElement)?.blur()
  paint.style.opacity=exiting?'0':'1'
  const enter=item.animate&&!entered.current;entered.current=true
  if(!reducedMotion&&(exiting||enter))animation.current=paint.animate([{opacity:exiting?opacity:'0'},{opacity:exiting?'0':'1'}],{duration:exiting?EXIT_MS:ENTER_MS,delay,easing:'ease-out',fill:'both'})
 },[exiting,reducedMotion,item.animate,delay])
 useLayoutEffect(()=>()=>animation.current?.cancel(),[])
 return <div ref={root} className="en-challenge-paragraph-line" data-block-id={item.blockId} data-state={item.state} data-exiting={exiting||undefined} tabIndex={exiting?-1:0} role={exiting?undefined:'img'} aria-hidden={exiting||undefined} aria-label={exiting?undefined:item.label} style={{top:item.top,left:item.left,height:item.height}}><span ref={stroke} className="en-challenge-paragraph-stroke" aria-hidden="true"/>{!exiting&&<span role="tooltip" data-odyssey-local-tooltip="" style={{top:Math.max(0,8-item.top),maxWidth:Math.max(64,Math.min(280,item.left-24))}}>{item.label}</span>}</div>
}

/** A separate overlay follows actual block geometry without changing writing layout. */
export function ChallengeParagraphFeedback({items,scroll,revision,level,reducedMotion}:{items:ParagraphFeedback[];scroll:RefObject<HTMLDivElement>;revision:number;level:ChallengeLevel;reducedMotion:boolean}){
 const root=useRef<HTMLDivElement>(null),[positions,setPositions]=useState<PlacedFeedback[]>([]),[departing,setDeparting]=useState<PlacedFeedback[]>([])
 const live=useRef(positions),priorLevel=useRef(level),generation=useRef(0),seen=useRef(new Set<string>()),timers=useRef(new Set<ReturnType<typeof setTimeout>>())
 live.current=positions
 useLayoutEffect(()=>{
  if(reducedMotion){for(const timer of timers.current)clearTimeout(timer);timers.current.clear();setDeparting([])}
  if(priorLevel.current===level)return
  const old=live.current.filter(item=>item.level===priorLevel.current)
  priorLevel.current=level;generation.current++;seen.current.clear();setPositions([])
  if(reducedMotion||!old.length)return
  setDeparting(previous=>[...previous,...old])
  const keys=new Set(old.map(item=>item.key)),timer=setTimeout(()=>{timers.current.delete(timer);setDeparting(previous=>previous.filter(item=>!keys.has(item.key)))},EXIT_MS+Math.max(...old.map(item=>item.exitDelay)))
  timers.current.add(timer)
 },[level,reducedMotion])
 useLayoutEffect(()=>()=>{for(const timer of timers.current)clearTimeout(timer);timers.current.clear()},[])
 useLayoutEffect(()=>{
  const scroller=scroll.current,host=root.current?.parentElement;if(!scroller||!host)return
  let frame=0
  const measure=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   const area=host.getBoundingClientRect(),document=scroller.querySelector('.en-document')?.getBoundingClientRect()
   const place=(item:ParagraphFeedback)=>{
    if(!document)return
    const block=scroller.querySelector<HTMLElement>('[data-id="'+CSS.escape(item.blockId)+'"]'),content=block?.querySelector<HTMLElement>('.bn-block-content'),rect=(content??block)?.getBoundingClientRect()
    if(!rect||!rect.height||rect.bottom<=area.top||rect.top>=area.bottom)return
    return{top:rect.top-area.top,left:Math.min(document.right-area.left+14,area.width-18),height:rect.height}
   }
   const previous=new Map(live.current.filter(item=>item.level===level).map(item=>[item.blockId,item]))
   const visible=items.flatMap(item=>{const geometry=place(item);return geometry?[{item,geometry}]:[]})
   const next=visible.map(({item,geometry},index)=>{
    const existing=previous.get(item.blockId),animate=!seen.current.has(item.blockId);seen.current.add(item.blockId)
    return{...item,...geometry,key:existing?.key??generation.current+':'+item.blockId,level,animate:existing?.animate??animate,enterDelay:existing?.enterDelay??index*Math.min(55,275/Math.max(1,visible.length-1)),exitDelay:index*Math.min(35,175/Math.max(1,visible.length-1))}
   })
   setPositions(old=>JSON.stringify(old)===JSON.stringify(next)?old:next)
   // Departing strokes follow scrolling too; removed/offscreen blocks leave immediately.
   setDeparting(old=>{const next=old.flatMap(item=>{const geometry=place(item);return geometry?[{...item,...geometry}]:[]});return JSON.stringify(old)===JSON.stringify(next)?old:next})
  })}
  const observer=new ResizeObserver(measure);observer.observe(host);observer.observe(scroller);const note=scroller.querySelector('.en-document');if(note)observer.observe(note)
  scroller.addEventListener('scroll',measure,{passive:true});window.addEventListener('resize',measure);measure()
  return()=>{cancelAnimationFrame(frame);observer.disconnect();scroller.removeEventListener('scroll',measure);window.removeEventListener('resize',measure)}
 },[items,scroll,revision,level])
 const current=new Map(items.map(item=>[item.blockId,item]))
 const present=positions.flatMap(item=>{if(item.level!==level)return[item];const latest=current.get(item.blockId);return latest?[{...item,...latest}]:[]})
 return <div className="en-challenge-paragraph-feedback" ref={root} data-motion={reducedMotion?'reduced':'full'}>{[...departing,...present].map(item=><ParagraphLine key={item.key} item={item} exiting={item.level!==level||departing.some(old=>old.key===item.key)} reducedMotion={reducedMotion}/>)}</div>
}
