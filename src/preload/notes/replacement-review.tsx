import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react'
import type * as Y from 'yjs'
import {createExtension} from '@blocknote/core'
import {Plugin,PluginKey} from '@tiptap/pm/state'
import {Decoration,DecorationSet} from '@tiptap/pm/view'
import {findChallengeQuote,replaceChallengeQuote} from './challenge-anchors'

export type NoteReplacementReview={id:string;threadId:string;commentId?:string;blockId:string;anchorBefore:string;original:string;replacement:string;createdAt:number;resolved?:boolean}
const valid=(v:any):v is NoteReplacementReview=>v&&typeof v.id==='string'&&v.id.length<=256&&typeof v.threadId==='string'&&v.threadId.length<=256&&typeof v.blockId==='string'&&v.blockId.length<=256&&typeof v.original==='string'&&v.original.trim()&&v.original.length<=6000&&typeof v.replacement==='string'&&v.replacement.trim()&&v.replacement.length<=6000&&typeof v.anchorBefore==='string'&&v.anchorBefore.length<=6000&&Number.isFinite(v.createdAt)
/** Bounds include whole code points; an insertion/deletion is a single local edit envelope. */
export function replacementChange(original:string,replacement:string){
 let from=0,suffix=0
 while(from<original.length&&from<replacement.length&&original[from]===replacement[from])from++
 const splits=(s:string,n:number)=>n>0&&n<s.length&&/[\uD800-\uDBFF]/u.test(s[n-1]!)&&/[\uDC00-\uDFFF]/u.test(s[n]!)
 if(splits(original,from)||splits(replacement,from))from--
 while(suffix<original.length-from&&suffix<replacement.length-from&&original[original.length-1-suffix]===replacement[replacement.length-1-suffix])suffix++
 if(splits(original,original.length-suffix)||splits(replacement,replacement.length-suffix))suffix--
 const to=replacement.length-suffix
 // A deletion needs a visible adjacent anchor to open its comparison.
 return to>from?{from,to}:from<replacement.length?{from,to:from+(replacement.codePointAt(from)!>0xffff?2:1)}:{from:Math.max(0,from-(replacement.codePointAt(Math.max(0,from-2))!>0xffff?2:1)),to:from}
}
export function replacementReviewRange(editor:any,review:NoteReplacementReview){
 const range=findChallengeQuote(editor,review.blockId,review.replacement)
 if(!range)return
 const change=replacementChange(review.original,review.replacement)
 return change.to>change.from?{from:range.from+change.from,to:range.from+change.to}:undefined
}

const highlightKey=new PluginKey('ework-note-replacement-review')
// Install with the editor: late registerPlugin reconfigures plugin views and
// destroys the existing Yjs undo manager, even if no document text is changed.
export const NoteReplacementHighlights=createExtension(({editor})=>{
 let reviews:NoteReplacementReview[]=[]
 return{key:'ework-note-replacement-review',setReviews(values:NoteReplacementReview[]){reviews=values;editor.transact(tr=>tr.setMeta(highlightKey,true))},prosemirrorPlugins:[new Plugin({key:highlightKey,props:{decorations(state){const decorations=[];const view={_tiptapEditor:{state}};for(const review of reviews){const range=replacementReviewRange(view,review);if(range)decorations.push(Decoration.inline(range.from,range.to,{class:'en-replacement-mark','data-en-replacement-id':review.id,role:'button',tabindex:'0','aria-label':'查看替换对照'}))}return DecorationSet.create(state.doc,decorations)}}})]}
})

/** Decorations leave body formatting untouched; durable review records live beside comments. */
export function useNoteReplacementReviews(options:{editor:any;doc:Y.Doc;scroll:RefObject<HTMLDivElement>;canEdit():boolean;persist():void;onRestore(review:NoteReplacementReview):Promise<void>|void;onResolve(threadId:string):Promise<void>|void}){
 const {editor,doc}=options,latest=useRef(options);latest.current=options
 const records=doc.getMap<NoteReplacementReview>('note-replacement-reviews'),[revision,setRevision]=useState(0),[selected,setSelected]=useState<string>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),working=useRef(false)
 const entries=()=>[...records.values()].filter(valid).filter(v=>!v.resolved).sort((a,b)=>b.createdAt-a.createdAt).slice(0,128)
 useEffect(()=>{
  let live=true,queued=false
  const refresh=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;if(!live||editor._tiptapEditor.isDestroyed)return;editor.getExtension(NoteReplacementHighlights)?.setReviews(entries());setRevision(v=>v+1)})}
  refresh()
  const off=editor.onChange(()=>setRevision(v=>v+1));records.observe(refresh)
  const root=latest.current.scroll.current
  const open=(e:Event)=>{const el=(e.target as HTMLElement).closest<HTMLElement>('[data-en-replacement-id]');if(!el||!root?.contains(el))return;if(e instanceof KeyboardEvent&&!['Enter',' '].includes(e.key))return;const id=el.dataset.enReplacementId,review=id&&records.get(id);if(!valid(review)||review.resolved)return;e.preventDefault();e.stopImmediatePropagation();setError('');setSelected(id)}
  root?.addEventListener('click',open,true);root?.addEventListener('keydown',open,true)
  return()=>{live=false;off();records.unobserve(refresh);root?.removeEventListener('click',open,true);root?.removeEventListener('keydown',open,true)}
 },[editor,doc])
 const add=(value:Omit<NoteReplacementReview,'id'|'createdAt'>)=>{if(value.original===value.replacement)return;const review={...value,id:crypto.randomUUID(),createdAt:Date.now()};if(valid(review))records.set(review.id,review)}
 const finish=async(revert:boolean)=>{
  const review=selected&&records.get(selected)
  if(!valid(review)||review.resolved||working.current||!latest.current.canEdit())return
  if(revert&&!findChallengeQuote(editor,review.blockId,review.replacement)){setError('这段文字已再次编辑，无法直接取消替换。');return}
  working.current=true;setBusy(true);setError('')
  try{
   if(revert){if(!replaceChallengeQuote(editor,review.blockId,review.replacement,review.original,review.threadId))return;await latest.current.onRestore(review)}
   else{records.set(review.id,{...review,resolved:true});await latest.current.onResolve(review.threadId)}
   latest.current.persist();setSelected(undefined)
  }finally{working.current=false;setBusy(false)}
 }
 const item=selected&&records.get(selected)
 return{resolveThread:(id:string)=>{doc.transact(()=>{for(const review of records.values())if(valid(review)&&review.threadId===id&&!review.resolved)records.set(review.id,{...review,resolved:true})})},revision,selected:valid(item)&&!item.resolved?item:undefined,busy,error,add,close:()=>setSelected(undefined),revert:()=>finish(true),resolve:()=>finish(false),canRevert:valid(item)&&!!findChallengeQuote(editor,item.blockId,item.replacement)}
}

export function NoteReplacementPopover({controller,scroll}:{controller:ReturnType<typeof useNoteReplacementReviews>;scroll:RefObject<HTMLDivElement>}){
 const {selected}=controller,root=useRef<HTMLElement>(null),[position,setPosition]=useState<{left:number;top:number;maxHeight:number}>()
 useLayoutEffect(()=>{
  if(!selected){setPosition(undefined);return}
  let frame=0
  const measure=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const area=scroll.current?.closest('.en-main')?.getBoundingClientRect(),mark=scroll.current?.querySelector<HTMLElement>('[data-en-replacement-id="'+CSS.escape(selected.id)+'"]')?.getBoundingClientRect(),card=root.current;if(!area||!mark||!card)return;const width=Math.min(360,area.width-32),height=Math.min(card.scrollHeight,area.height-32),left=Math.max(16,Math.min(mark.left-area.left,area.width-width-16)),below=mark.bottom-area.top+8,top=below+height<=area.height-16?below:Math.max(16,mark.top-area.top-height-8);setPosition({left,top,maxHeight:Math.max(120,area.height-32)})})}
  measure();const observer=new ResizeObserver(measure);if(root.current)observer.observe(root.current);if(scroll.current)observer.observe(scroll.current);scroll.current?.addEventListener('scroll',measure);window.addEventListener('resize',measure)
  const dismiss=(e:Event)=>{if(e instanceof KeyboardEvent){if(e.key!=='Escape')return;e.preventDefault()}else if(root.current?.contains(e.target as Node)||(e.target as HTMLElement).closest('[data-en-replacement-id]'))return;controller.close()}
  document.addEventListener('pointerdown',dismiss,true);document.addEventListener('keydown',dismiss,true)
  return()=>{cancelAnimationFrame(frame);observer.disconnect();scroll.current?.removeEventListener('scroll',measure);window.removeEventListener('resize',measure);document.removeEventListener('pointerdown',dismiss,true);document.removeEventListener('keydown',dismiss,true)}
 },[selected?.id,controller.revision])
 if(!selected)return null
 return <section ref={root} className="en-replacement-popover" role="dialog" aria-label="替换对照" style={{...position,visibility:position?'visible':'hidden'}}><header><strong>替换对照</strong><button aria-label="关闭替换对照" onClick={controller.close}>×</button></header><div className="en-replacement-comparison"><section><h4>原文</h4><div data-replacement-before>{selected.original}</div></section><section><h4>替换后</h4><div data-replacement-after>{selected.replacement}</div></section></div>{controller.error||!controller.canRevert?<p role="status">{controller.error||'这段文字已再次编辑，无法直接取消替换。'}</p>:null}<footer><button disabled={controller.busy||!controller.canRevert} onClick={()=>void controller.revert()}>取消替换</button><button disabled={controller.busy} onClick={()=>void controller.resolve()}>已解决</button></footer></section>
}
