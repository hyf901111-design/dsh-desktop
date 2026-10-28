import React,{useLayoutEffect,useRef,useState} from 'react'
import {noteUiText as t} from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import accountAvatar from '../../../build/sherlock-account-avatar.svg?raw'
import type {NoteInsertionAnchor} from '../../shared/workspace-notes'

/** The same processing row is used by the existing selected-text assistant. */
export function NoteAiProcessing({stop,label='正在生成内容…'}:{stop():void;label?:string}){
 return <div className="en-ai-loading" role="status" aria-live="polite"><span className="en-ai-spinner" aria-hidden="true"/><span>{t(label)}</span><button onClick={stop}>{t('停止')}</button></div>
}
export type NoteInlineAiDraft={anchor:NoteInsertionAnchor;prompt:string;error?:string;reply?:string}
export function NoteInlineAiComposer({draft,editor,scroll,running,disabled,onChange,onSubmit,onCancel,onStop}:{draft:NoteInlineAiDraft;editor:any;scroll:React.RefObject<HTMLElement>;running:boolean;disabled:boolean;onChange(value:string):void;onSubmit():void;onCancel():void;onStop():void}){
 const shell=useRef<HTMLElement>(null),input=useRef<HTMLTextAreaElement>(null),composition=useRef(false),wasRunning=useRef(false),[placement,setPlacement]=useState({anchor:undefined as NoteInsertionAnchor|undefined,top:0,left:0,width:0}),[reservation,setReservation]=useState(0)
 const {anchor:positionAnchor,...position}=placement
 useLayoutEffect(()=>{
  const root=scroll.current,document=root?.querySelector<HTMLElement>('.en-document')
  if(!root||!document)return
  const measure=()=>{const block=root.querySelector<HTMLElement>('[data-id="'+CSS.escape(draft.anchor.blockId)+'"] .bn-block-content');if(!block){setReservation(0);return}const rect=block.getBoundingClientRect(),base=document.getBoundingClientRect();setReservation(Math.max(0,(shell.current?.offsetHeight||0)-rect.height+8));setPlacement({anchor:draft.anchor,top:rect.top-base.top,left:rect.left-base.left,width:rect.width})}
  measure();const observer=new ResizeObserver(measure);observer.observe(document);if(shell.current)observer.observe(shell.current);const off=editor.onChange(measure);window.addEventListener('resize',measure)
  return()=>{observer.disconnect();off();window.removeEventListener('resize',measure)}
 },[editor,scroll,draft.anchor])
 const positioned=positionAnchor===draft.anchor&&position.width>0
 useLayoutEffect(()=>{
  // The measuring effect queues position state; its DOM commit must precede
  // scrollIntoView, including when an existing draft moves to a new anchor.
  if(!positioned)return
  if(running){composition.current=false;shell.current?.focus({preventScroll:true})}
  else if(!wasRunning.current||shell.current?.contains(document.activeElement)){input.current?.focus({preventScroll:true});input.current?.scrollIntoView({block:'nearest'})}
  wasRunning.current=running
 },[draft.anchor,running,positioned])
 useLayoutEffect(()=>{const element=input.current;if(element){element.style.height='0';element.style.height=Math.min(180,Math.max(28,element.scrollHeight))+'px'}},[draft.prompt,position.width,running])
 const anchorSelector='.en-document[data-note-document-id="'+CSS.escape(draft.anchor.documentId)+'"] .bn-block-outer[data-id="'+CSS.escape(draft.anchor.blockId)+'"]'
 return <section ref={shell} tabIndex={-1} className="en-space-ai" data-running={running||undefined} style={position} aria-label={t('行内 AI')} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'&&!composition.current&&!event.nativeEvent.isComposing){event.preventDefault();onCancel()}}}>
  <style>{anchorSelector+'{margin-bottom:'+reservation+'px!important;transition:none!important}'+anchorSelector+' .bn-inline-content{caret-color:transparent!important}'+anchorSelector+' .ProseMirror-gapcursor,'+anchorSelector+'+.ProseMirror-gapcursor{display:none!important}'}</style>
  {running?<NoteAiProcessing stop={()=>{shell.current?.focus({preventScroll:true});onStop()}} label="正在工作…"/>:<div className="en-space-ai-input"><span className="en-space-ai-avatar" aria-hidden="true" dangerouslySetInnerHTML={{__html:accountAvatar}}/><textarea ref={input} aria-label={t('行内 AI 需求')} placeholder={t('让 AI 在此处写作、创建组件或图表…')} rows={1} maxLength={8000} value={draft.prompt} onCompositionStart={()=>{composition.current=true}} onCompositionEnd={()=>{composition.current=false}} onChange={event=>onChange(event.currentTarget.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.altKey&&!composition.current&&!event.nativeEvent.isComposing&&event.keyCode!==229){event.preventDefault();if(!disabled&&draft.prompt.trim())onSubmit()}}}/><button className="en-space-ai-send" aria-label={t('发送行内 AI 需求')} disabled={disabled||!draft.prompt.trim()} onClick={onSubmit}><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 15V5M5.5 9.5 10 5l4.5 4.5"/></svg></button></div>}
  {draft.error?<div className="en-space-ai-message en-component-error" role="alert">{t(draft.error)}</div>:draft.reply?<div className="en-space-ai-message" role="status">{draft.reply}</div>:null}
 </section>
}
