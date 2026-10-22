import { noteUiText as t } from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import React, {useEffect, useRef, useState} from 'react'
import {financialWidgetSpec} from '../../../packages/dsh-research-task-runtime/financial-widget-contract.js'
import {NoteMenuIcon} from './menu-icon'
import {useNoteComponentSize,NoteComponentResizeHandles} from './component-size'
import {useNoteComponentInteraction} from './component-interaction'
import {useNotePresentation} from './component-presentation'
import {NotePresentationControls} from './component-presentation-controls'

/** Native research components are portalled here by the resident conversation renderer. */
export function NativeComponentBlock({block,node,context,mode='component'}:any){
 const generation=mode==='generation'&&!node.containerSpec
 const host=useRef<HTMLDivElement>(null),instance=useRef(crypto.randomUUID()),interaction=useNoteComponentInteraction(),{root,selected}=interaction
 useNotePresentation(root,node,context.dark)
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0)
 const [height,setHeight]=useState(Math.max(160,Math.min(2400,generation?220:(node.height||362)-42)))
 const size=useNoteComponentSize({block,node,editor:context.editor,root,naturalHeight:height}),renderKey=JSON.stringify({...node,noteSize:undefined,...node.kind==='web-link'?{sourceText:undefined}:{}})
 useEffect(()=>{
  let attempts=0,live=true,timer:ReturnType<typeof setTimeout>|undefined;setReady(false);setError('')
  const publish=()=>document.dispatchEvent(new CustomEvent('sherlock:notes-component-view',{detail:{instanceId:instance.current,hostId:host.current?.id,headerId:instance.current+'-title',sessionId:context.sessionId,node,dark:context.dark,refresh,mode:generation?'generation':'component',readOnly:!context.editor?.isEditable}}))
  const load=async()=>{try{
   if(!generation&&node.kind!=='web-link')await context.bridge.request(node.noteReply?'reply-render':'component-render',{sessionId:context.sessionId,...node.noteReply?{text:node.excerpt}:{spec:node.containerSpec}})
   if(!live)return
   if(!generation&&node.containerSpec?.type==='calendar-tool'){
    const result=await context.bridge.request('component-ready',{sessionId:context.sessionId,nodeId:node.id})
    if(!live)return;if(!result.ready){if(++attempts>25)throw Error(t("请先保存笔记，再重新打开日历组件。"));timer=setTimeout(load,400);return}
   }
   publish();setReady(true)
  }catch(e){if(live)setError((e as Error).message)}}
  const sync=(e:Event)=>{if((e as CustomEvent).detail?.sessionId===context.sessionId)void load()}
  const action=async(e:Event)=>{
   const value=(e as CustomEvent).detail;if(value?.instanceId!==instance.current||value.sessionId!==context.sessionId)return
   if(value.action==='refresh'){
    const reply=(ok:boolean,message?:string)=>document.dispatchEvent(new CustomEvent('sherlock:notes-component-ack',{detail:{instanceId:instance.current,sessionId:context.sessionId,requestId:value.requestId,ok,message}}))
    try{const current=context.editor?.getBlock(block.id);if(!context.editor?.isEditable||!current||JSON.parse(current.props.payload).id!==value.nodeId)throw Error(t('组件已变化或当前不可编辑。'));await reload();reply(true)}catch(e){reply(false,(e as Error).message)}
    return
   }
   if(value.action==='generation-stop'||value.action==='generation-retry'){
    const reply=(ok:boolean,message?:string)=>document.dispatchEvent(new CustomEvent('sherlock:notes-component-ack',{detail:{instanceId:instance.current,sessionId:context.sessionId,requestId:value.requestId,ok,message}}))
    try{
     if(!context.editor?.isEditable)throw Error(t("笔记当前不可编辑。"))
     const current=context.editor.getBlock(block.id);if(!current)throw Error(t("组件已移除。"))
     const latest=JSON.parse(current.props.payload)
     if(latest.id!==value.nodeId||latest.generationTaskId!==value.taskId)throw Error(t("组件任务已变化，请重试。"))
     if(value.action==='generation-stop'){
      const active=typeof context.isGeneratingComponent==='function'?context.isGeneratingComponent(block.id):!context.generatingBlock||context.generatingBlock.current===block.id
      if(!['queued','running','retrying'].includes(latest.generationStatus)||!active||typeof context.stopGeneration!=='function')throw Error(t("当前组件没有正在运行的任务。"))
      const result=await context.stopGeneration(block.id);if(result===false||result?.ok===false)throw Error(t("停止请求未完成。"))
     }else{
      if(!['failed','cancelled','interrupted'].includes(latest.generationStatus)||!latest.containerPrompt?.trim()||typeof context.generateComponent!=='function')throw Error(t("组件暂不能重新生成，请调整需求后重试。"))
      const result=await context.generateComponent(block.id,latest.containerPrompt.trim());if(result===false||result?.ok===false)throw Error(t("组件任务尚未开始，请重试。"))
     }
     reply(true)
    }catch(e){reply(false,(e as Error).message)}
    return
   }
   if(value.action==='web-inspection'){
    const current=context.editor?.getBlock(block.id);if(!context.editor?.isEditable||!current)return
    const previous=JSON.parse(current.props.payload),inspection=value.inspection
    if(previous.kind!=='web-link'||previous.url!==value.url||typeof inspection?.sourceText!=='string')return
    const next={...previous,title:typeof inspection.title==='string'&&inspection.title.trim()?inspection.title.trim().slice(0,256):previous.title,sourceText:inspection.sourceText.slice(0,120000)}
    if(JSON.stringify(previous)!==JSON.stringify(next))context.editor.updateBlock(block.id,{props:{payload:JSON.stringify(next)}})
   }
   if(value.action==='size'&&Number.isFinite(value.height))setHeight(Math.max(160,Math.min(2400,value.height)))
   if(value.action==='spec'){
    const reply=(ok:boolean,message?:string)=>document.dispatchEvent(new CustomEvent('sherlock:notes-component-ack',{detail:{instanceId:instance.current,sessionId:context.sessionId,requestId:value.requestId,ok,message}}))
    try{
      if(!context.editor?.isEditable)throw Error(t("笔记当前不可编辑。"))
      const current=context.editor.getBlock(block.id);if(!current)throw Error(t("组件已移除。"))
      const previous=JSON.parse(current.props.payload),spec=financialWidgetSpec(value.next)
      if(!spec||previous.containerSpec?.type!=='financial-widget'||spec.widget!==previous.containerSpec.widget||JSON.stringify(previous.containerSpec)!==JSON.stringify(value.expected))throw Error(t("组件配置已变化，请重试。"))
      context.editor.updateBlock(block.id,{props:{payload:JSON.stringify({...previous,containerSpec:spec})}});reply(true)
    }catch(e){reply(false,(e as Error).message)}
   }
  }
  document.addEventListener('sherlock:notes-components-sync-request',sync);document.addEventListener('sherlock:notes-component-action',action);void load()
  return()=>{live=false;clearTimeout(timer);document.removeEventListener('sherlock:notes-components-sync-request',sync);document.removeEventListener('sherlock:notes-component-action',action);document.dispatchEvent(new CustomEvent('sherlock:notes-component-view',{detail:{instanceId:instance.current,remove:true}}))}
 },[renderKey,context.bridge,context.sessionId,context.dark,refresh,generation])
 const reload=async()=>{
  setError('')
  try{if(node.noteDataBound){const result=await context.bridge.request('component-data',{sessionId:context.sessionId,action:'refresh',nodeId:node.id});if(result?.status==='error'||result?.error)throw Error(result.error||t('组件数据刷新失败。'));return}
   const control=host.current?.querySelector('[data-financial-widget],[data-calendar-tool],[data-research-native-web]') as any
   const fn=control?.__eworkRefreshFinancial||control?.__eworkRefreshCalendar||control?.__eworkReloadWeb
   if(fn){const result=await fn();if(result?.error)throw Error(result.error)}else setRefresh(value=>value+1)
  }catch(e){setError((e as Error).message);throw e}
 }
 if(generation)return <section className="en-research en-native-component en-note-generation" ref={root} style={{...size.style,height:size.height}} contentEditable={false} data-note-research-block={block.id} data-research-node-id={node.id} data-research-compact-chrome="" data-research-artifact-card={node.id} data-research-generation-state={node.generationStatus} data-research-generation-empty="" data-selected={selected||undefined} data-resizing={size.resizing||undefined}>
  <div id={instance.current+'-title'} hidden/>
  <div ref={host} id={instance.current} className="en-native-component-host" data-note-component={node.id} data-note-session={context.sessionId} style={{height:size.height}}/>
  {!ready&&error?<div className="en-component-error" role="alert">{error}</div>:null}
  {selected&&context.editor?.isEditable?<><NotePresentationControls editor={context.editor} block={block} node={node}/><NoteComponentResizeHandles size={size}/></>:null}
 </section>
 return <section className="en-research en-native-component" ref={root} style={size.style} contentEditable={false} data-note-research-block={block.id} data-research-node-id={node.id} data-selected={selected||undefined} data-resizing={size.resizing||undefined} data-financial-theme={context.dark?'dark':'light'}>
  <header className="en-research-header" draggable={!!context.editor?.isEditable}><div className="en-native-component-title" id={instance.current+'-title'}><strong>{node.title}</strong></div><button className="en-component-close" aria-label={t("移除笔记中的组件")} disabled={!context.editor?.isEditable} onClick={()=>context.editor.removeBlocks([block.id])}><NoteMenuIcon kind="close"/></button></header>
  <div className="en-research-view"><div ref={host} id={instance.current} className="en-native-component-host" data-note-component={node.id} data-note-session={context.sessionId} style={{height:size.height}}/>{!ready?<div className="en-component-empty" role="status">{t(error)||t("正在读取组件…")}</div>:null}{ready&&!selected?<button className="en-component-scroll-guard" aria-label={t("选中组件并操作内容")} onClick={interaction.select}/>:null}</div>
  {error&&ready?<div className="en-component-error" role="alert">{error}</div>:null}
  {selected&&context.editor?.isEditable?<><NotePresentationControls editor={context.editor} block={block} node={node}/><NoteComponentResizeHandles size={size}/></>:null}
 </section>
}

/** The existing research generation process is rendered by the resident portal. */
export function NoteGenerationBlock(props:any){return <NativeComponentBlock {...props} mode="generation"/>}
