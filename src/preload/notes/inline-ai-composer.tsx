import React,{useLayoutEffect,useRef,useState} from 'react'
import {noteUiText as t} from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import accountAvatar from '../../../build/sherlock-account-avatar.svg?raw'
import type {NoteInsertionAnchor} from '../../shared/workspace-notes'

/** The same processing row is used by the existing selected-text assistant. */
export function NoteAiProcessing({stop,label='正在生成内容…'}:{stop():void;label?:string}){
 return <div className="en-ai-loading" role="status" aria-live="polite"><span className="en-ai-spinner" aria-hidden="true"/><span>{t(label)}</span><button onClick={stop}>{t('停止')}</button></div>
}
export type NoteInlineAiReview={id:string;summary:string;blockIds:string[];anchorBlockId?:string;anchorIsResult?:boolean;busy?:boolean;canUndo?:boolean}
export type NoteInlineAiDraft={anchor:NoteInsertionAnchor;prompt:string;error?:string;reply?:string;review?:NoteInlineAiReview}
export function NoteInlineAiComposer({draft,editor,scroll,running,disabled,onChange,onSubmit,onCancel,onStop,onConfirm,onUndo}:{draft:NoteInlineAiDraft;editor:any;scroll:React.RefObject<HTMLElement>;running:boolean;disabled:boolean;onChange(value:string):void;onSubmit():void;onCancel():void;onStop():void;onConfirm?():void|Promise<unknown>;onUndo?():void|Promise<unknown>}){
 const shell=useRef<HTMLElement>(null),input=useRef<HTMLTextAreaElement>(null),composition=useRef(false),wasRunning=useRef(false),operation=useRef(0),[working,setWorking]=useState(false),[actionError,setActionError]=useState(''),[placement,setPlacement]=useState({anchor:undefined as NoteInsertionAnchor|undefined,top:0,left:0,width:0}),[reservation,setReservation]=useState(0)
 const review=draft.review,ready=!!review&&!running,anchorBlockId=review?.anchorBlockId||draft.anchor.blockId,anchorIsResult=!!review?.anchorIsResult
 useLayoutEffect(()=>{operation.current++;setWorking(false);setActionError('');return()=>{operation.current++}},[review?.id])
 const {anchor:positionAnchor,...position}=placement
 useLayoutEffect(()=>{
  const root=scroll.current,document=root?.querySelector<HTMLElement>('.en-document')
  if(!root||!document)return
  const measure=()=>{const outer=root.querySelector<HTMLElement>('.bn-block-outer[data-id="'+CSS.escape(anchorBlockId)+'"]'),block=outer?.querySelector<HTMLElement>('.bn-block-content');if(!block){setReservation(0);return}const rect=block.getBoundingClientRect(),base=document.getBoundingClientRect();setReservation(anchorIsResult?(shell.current?.offsetHeight||0)+8:Math.max(0,(shell.current?.offsetHeight||0)-rect.height+8));setPlacement({anchor:draft.anchor,top:(anchorIsResult?outer!.getBoundingClientRect().top:rect.top)-base.top,left:rect.left-base.left,width:rect.width})}
  measure();const observer=new ResizeObserver(measure);observer.observe(document);if(shell.current)observer.observe(shell.current);const off=editor.onChange(measure);window.addEventListener('resize',measure)
  return()=>{observer.disconnect();off();window.removeEventListener('resize',measure)}
 },[editor,scroll,draft.anchor,anchorBlockId,anchorIsResult])
 const positioned=positionAnchor===draft.anchor&&position.width>0
 useLayoutEffect(()=>{
  // The measuring effect queues position state; its DOM commit must precede
  // scrollIntoView, including when an existing draft moves to a new anchor.
  if(!positioned)return
  if(review&&!running){composition.current=false;wasRunning.current=false;return}
  if(running){composition.current=false;if(!wasRunning.current||shell.current?.contains(document.activeElement))shell.current?.focus({preventScroll:true})}
  else if(!wasRunning.current||shell.current?.contains(document.activeElement)){input.current?.focus({preventScroll:true});input.current?.scrollIntoView({block:'nearest'})}
  wasRunning.current=running
 },[draft.anchor,running,positioned,review?.id])
 useLayoutEffect(()=>{const element=input.current;if(element){element.style.height='0';element.style.height=Math.min(180,Math.max(28,element.scrollHeight))+'px'}},[draft.prompt,position.width,running])
 const anchorSelector='.en-document[data-note-document-id="'+CSS.escape(draft.anchor.documentId)+'"] .bn-block-outer[data-id="'+CSS.escape(anchorBlockId)+'"]'
 const settle=async(undo:boolean)=>{const action=undo?onUndo:onConfirm;if(!review||running||!action||disabled||working||review.busy||undo&&review.canUndo===false)return;const token=++operation.current;setWorking(true);setActionError('');try{if(await action()===false&&token===operation.current)setActionError(t('本次操作未完成，内容已保留。'))}catch(error){if(token===operation.current)setActionError((error as Error).message||t('本次操作未完成，内容已保留。'))}finally{if(token===operation.current)setWorking(false)}}
 const busy=working||review?.busy
 return <section ref={shell} tabIndex={-1} className="en-space-ai" data-running={running||undefined} data-review={ready?review?.id:undefined} style={position} aria-label={t('行内 AI')} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'&&!composition.current&&!event.nativeEvent.isComposing){event.preventDefault();onCancel()}}}>
  <style>{anchorSelector+'{'+(anchorIsResult?'padding-top:':'margin-bottom:')+reservation+'px!important;transition:none!important}'+(!ready?anchorSelector+' .bn-inline-content{caret-color:transparent!important}'+anchorSelector+' .ProseMirror-gapcursor,'+anchorSelector+'+.ProseMirror-gapcursor{display:none!important}':'')}</style>
  {review&&!running?<div className="en-space-ai-result"><span className="en-space-ai-avatar" aria-hidden="true" dangerouslySetInnerHTML={{__html:accountAvatar}}/><span className="en-space-ai-summary" role="status" aria-live="polite" title={review.summary}>{review.summary}</span><div className="en-space-ai-result-actions"><button type="button" aria-label={t('撤销本次 AI 生成')} title={t('撤销本次 AI 生成')} disabled={disabled||!!busy||review.canUndo===false||!onUndo} onClick={()=>void settle(true)}><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 4 2.5 7.5 6 11M3 7.5h8a5 5 0 0 1 0 10H8"/></svg></button><button type="button" aria-label={t('确认本次 AI 生成')} title={t('确认本次 AI 生成')} disabled={disabled||!!busy||!onConfirm} onClick={()=>void settle(false)}><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg></button></div></div>:running?<NoteAiProcessing stop={()=>{shell.current?.focus({preventScroll:true});onStop()}} label="正在工作…"/>:<div className="en-space-ai-input"><span className="en-space-ai-avatar" aria-hidden="true" dangerouslySetInnerHTML={{__html:accountAvatar}}/><textarea ref={input} aria-label={t('行内 AI 需求')} placeholder={t('让 AI 在此处写作、创建组件或图表…')} rows={1} maxLength={8000} value={draft.prompt} onCompositionStart={()=>{composition.current=true}} onCompositionEnd={()=>{composition.current=false}} onChange={event=>onChange(event.currentTarget.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.altKey&&!composition.current&&!event.nativeEvent.isComposing&&event.keyCode!==229){event.preventDefault();if(!disabled&&draft.prompt.trim())onSubmit()}}}/><button className="en-space-ai-send" aria-label={t('发送行内 AI 需求')} disabled={disabled||!draft.prompt.trim()} onClick={onSubmit}><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 15V5M5.5 9.5 10 5l4.5 4.5"/></svg></button></div>}
  {draft.error||actionError?<div className="en-space-ai-message en-component-error" role="alert">{t(draft.error||actionError)}</div>:null}
 </section>
}
