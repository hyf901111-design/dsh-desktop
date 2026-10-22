import {useLayoutEffect,useRef,useState,type RefObject} from 'react'
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
  const count=new Set(issues.filter(issue=>issue.blockId===block.id).map(issue=>issue.id)).size,name=CHALLENGE_LEVELS[record.level].name
  if(count)return[{blockId:block.id,state:'issues' as const,count,label:`段落经${name}模式 AI 挑战后，发现 ${count} 处未解决问题`}]
  if(!record.complete)return[]
  return[{blockId:block.id,state:'passed' as const,count:0,label:record.issueCount?`段落经${name}模式 AI 挑战校对，已解决 ${record.issueCount} 处问题`:`段落已通过${name}模式的 AI 挑战，本轮未发现问题`}]
 })
}

/** A separate overlay follows actual block geometry without changing writing layout. */
export function ChallengeParagraphFeedback({items,scroll,revision}:{items:ParagraphFeedback[];scroll:RefObject<HTMLDivElement>;revision:number}){
 const root=useRef<HTMLDivElement>(null),[positions,setPositions]=useState<Array<ParagraphFeedback&{top:number;left:number;height:number}>>([])
 useLayoutEffect(()=>{
  const scroller=scroll.current,host=root.current?.parentElement;if(!scroller||!host)return
  let frame=0
  const measure=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   const area=host.getBoundingClientRect(),document=scroller.querySelector('.en-document')?.getBoundingClientRect()
   const next=document?items.flatMap(item=>{
    const block=scroller.querySelector<HTMLElement>('[data-id="'+CSS.escape(item.blockId)+'"]'),content=block?.querySelector<HTMLElement>('.bn-block-content'),rect=(content??block)?.getBoundingClientRect()
    if(!rect||!rect.height||rect.bottom<=area.top||rect.top>=area.bottom)return[]
    return[{...item,top:rect.top-area.top,left:Math.min(document.right-area.left+14,area.width-18),height:rect.height}]
   }):[]
   setPositions(old=>JSON.stringify(old)===JSON.stringify(next)?old:next)
  })}
  const observer=new ResizeObserver(measure);observer.observe(host);observer.observe(scroller);const note=scroller.querySelector('.en-document');if(note)observer.observe(note)
  scroller.addEventListener('scroll',measure,{passive:true});window.addEventListener('resize',measure);measure()
  return()=>{cancelAnimationFrame(frame);observer.disconnect();scroller.removeEventListener('scroll',measure);window.removeEventListener('resize',measure)}
 },[items,scroll,revision])
 return <div className="en-challenge-paragraph-feedback" ref={root}>{positions.map(item=><div key={item.blockId} className="en-challenge-paragraph-line" data-block-id={item.blockId} data-state={item.state} tabIndex={0} role="img" aria-label={item.label} style={{top:item.top,left:item.left,height:item.height}}><span role="tooltip">{item.label}</span></div>)}</div>
}
