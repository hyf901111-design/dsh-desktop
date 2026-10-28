import { noteUiText as t } from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import React,{useState} from 'react'
import {parseResearchContainerSpec} from '../../../packages/dsh-research-task-runtime/artifact-validator.js'
import {normalizeResearchWebUrl} from '../../../packages/dsh-research-task-runtime/web-url.js'
import {useNoteComponentSize,NoteComponentResizeHandles} from './component-size'
import {useNoteComponentInteraction} from './component-interaction'
import {NoteMenuIcon} from './menu-icon'
import {noteGenerationError} from '../../shared/workspace-notes'

/** A draft occupies the same note block throughout creation, retry and loading. */
export function NoteCreationBlock({block,node,context}:any){
 const interaction=useNoteComponentInteraction(),size=useNoteComponentSize({block,node,editor:context.editor,root:interaction.root,naturalHeight:240})
 const [error,setError]=useState(''),link=node.noteDraft==='link',active=typeof context.isGeneratingComponent==='function'?context.isGeneratingComponent(block.id):context.generatingBlock?.current===block.id,interrupted=node.generationStatus==='running'&&!active,running=node.generationStatus==='running'&&!interrupted,editable=!!context.editor?.isEditable
 const update=(value:string)=>{const current=context.editor.getBlock(block.id);if(!editable||!current)return;const latest=JSON.parse(current.props.payload);context.editor.updateBlock(block.id,{props:{payload:JSON.stringify({...latest,containerPrompt:value,generationError:undefined,generationDetail:undefined})}});setError('')}
 const submit=()=>{
  if(!editable||running||!node.containerPrompt?.trim())return
  if(!link){const result=context.generateComponent(block.id,node.containerPrompt.trim());if(result===false||result?.ok===false)setError(result?.error||t("组件任务尚未开始，请重试。"));return}
  const url=normalizeResearchWebUrl(node.containerPrompt)
  const spec=parseResearchContainerSpec({version:1,type:'web',title:t("链接"),url})
  if(!spec){setError(t("请输入有效的网页链接"));return}
  const current=context.editor.getBlock(block.id);if(!current)return
  const latest=JSON.parse(current.props.payload),title=new URL(spec.url).hostname
  const next={...latest,kind:'web-link',title,url:spec.url,excerpt:spec.url,noteLibrary:true,generationStatus:'completed'}
  delete next.noteDraft;delete next.containerPrompt;delete next.generationError
  context.editor.updateBlock(block.id,{props:{payload:JSON.stringify(next)}})
 }
 return <section className="en-research en-creation-component" ref={interaction.root as React.RefObject<HTMLElement>} style={size.style} contentEditable={false} data-note-creation-draft={link?'link':'smart'} data-note-research-block={block.id} data-selected={interaction.selected||undefined} data-resizing={size.resizing||undefined}>
  <header className="en-research-header" draggable={editable&&!running}><NoteMenuIcon kind={link?'link':'sparkles'}/><strong>{link?t("添加链接"):t("智能组件")}</strong><button className="en-component-close" aria-label={t("移除笔记中的组件")} disabled={!editable} onClick={()=>{if(running)context.stopGeneration(block.id);context.editor.removeBlocks([block.id])}}><NoteMenuIcon kind="close"/></button></header>
  <div className="en-creation-draft rScV5Q_containerDraft" style={{height:size.height}} data-research-template-draft={link?'link':'smart'}>
   <textarea aria-label={link?t("输入链接"):t("描述要创建的组件内容")} placeholder={link?t("粘贴网页或文章链接…"):t("描述想创建的内容，例如：交互活动页、专业用户体验地图、月度趋势图或对比表格…")} inputMode={link?'url':'text'} maxLength={link?8192:8000} value={node.containerPrompt||''} disabled={!editable||running} onChange={event=>update(event.currentTarget.value)} onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter'&&!event.shiftKey&&!event.altKey&&!event.nativeEvent.isComposing&&event.keyCode!==229){event.preventDefault();submit()}}}/>
   {error||node.generationError||interrupted?<div className="en-component-error" role="alert">{t(noteGenerationError(error||node.generationError))||t("上次创建已中断，可调整需求后重试。")}</div>:null}
   {node.generationDetail&&!running?<div className="en-creation-feedback" role="status">{node.generationDetail}</div>:null}
   <div className="rScV5Q_containerDraftFooter"><span>{running?t("正在创建组件…"):link?t("支持网页与文章链接"):t("Enter 创建 · Shift Enter 换行")}</span>{running?<button onClick={()=>context.stopGeneration(block.id)}>{t("停止")}</button>:<button onClick={submit} disabled={!editable||!node.containerPrompt?.trim()}>{link?t("添加链接"):t("创建")}</button>}</div>
  </div>
  {interaction.selected&&editable&&!running?<NoteComponentResizeHandles size={size}/>:null}
 </section>
}
