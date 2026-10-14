import React, {useEffect, useRef, useState} from 'react'
import {financialWidgetSpec} from '../../../packages/dsh-research-task-runtime/financial-widget-contract.js'
import {NoteMenuIcon} from './menu-icon'
import {useNoteComponentSize,NoteComponentResizeHandles} from './component-size'
import {useNoteComponentInteraction} from './component-interaction'

/** Native research components are portalled here by the resident conversation renderer. */
export function NativeComponentBlock({block,node,context}:any){
 const host=useRef<HTMLDivElement>(null),instance=useRef(crypto.randomUUID()),interaction=useNoteComponentInteraction(),{root,selected}=interaction
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[busy,setBusy]=useState(false)
 const [height,setHeight]=useState(Math.max(160,Math.min(2400,(node.height||362)-42)))
 const size=useNoteComponentSize({block,node,editor:context.editor,root,naturalHeight:height}),renderKey=JSON.stringify({...node,noteSize:undefined})
 useEffect(()=>{
  let attempts=0,live=true,timer:ReturnType<typeof setTimeout>|undefined;setReady(false);setError('')
  const publish=()=>document.dispatchEvent(new CustomEvent('sherlock:notes-component-view',{detail:{instanceId:instance.current,hostId:host.current?.id,headerId:instance.current+'-title',sessionId:context.sessionId,node,dark:context.dark,refresh}}))
  const load=async()=>{try{
   await context.bridge.request('component-render',{sessionId:context.sessionId,spec:node.containerSpec})
   if(!live)return
   if(node.containerSpec.type==='calendar-tool'){
    const result=await context.bridge.request('component-ready',{sessionId:context.sessionId,nodeId:node.id})
    if(!live)return;if(!result.ready){if(++attempts>25)throw Error('请先保存笔记，再重新打开日历组件。');timer=setTimeout(load,400);return}
   }
   publish();setReady(true)
  }catch(e){if(live)setError((e as Error).message)}}
  const sync=(e:Event)=>{if((e as CustomEvent).detail?.sessionId===context.sessionId)void load()}
  const action=(e:Event)=>{
   const value=(e as CustomEvent).detail;if(value?.instanceId!==instance.current||value.sessionId!==context.sessionId)return
   if(value.action==='size'&&Number.isFinite(value.height))setHeight(Math.max(160,Math.min(2400,value.height)))
   if(value.action==='spec'){
    const reply=(ok:boolean,message?:string)=>document.dispatchEvent(new CustomEvent('sherlock:notes-component-ack',{detail:{instanceId:instance.current,sessionId:context.sessionId,requestId:value.requestId,ok,message}}))
    try{
      if(!context.editor?.isEditable)throw Error('笔记当前不可编辑。')
      const current=context.editor.getBlock(block.id);if(!current)throw Error('组件已移除。')
      const previous=JSON.parse(current.props.payload),spec=financialWidgetSpec(value.next)
      if(!spec||previous.containerSpec?.type!=='financial-widget'||spec.widget!==previous.containerSpec.widget||JSON.stringify(previous.containerSpec)!==JSON.stringify(value.expected))throw Error('组件配置已变化，请重试。')
      context.editor.updateBlock(block.id,{props:{payload:JSON.stringify({...previous,containerSpec:spec})}});reply(true)
    }catch(e){reply(false,(e as Error).message)}
   }
  }
  document.addEventListener('sherlock:notes-components-sync-request',sync);document.addEventListener('sherlock:notes-component-action',action);void load()
  return()=>{live=false;clearTimeout(timer);document.removeEventListener('sherlock:notes-components-sync-request',sync);document.removeEventListener('sherlock:notes-component-action',action);document.dispatchEvent(new CustomEvent('sherlock:notes-component-view',{detail:{instanceId:instance.current,remove:true}}))}
 },[renderKey,context.bridge,context.sessionId,context.dark,refresh])
 const reload=async()=>{
  setBusy(true);setError('')
  try{const control=host.current?.querySelector('[data-financial-widget],[data-calendar-tool]') as any
   const fn=control?.__eworkRefreshFinancial||control?.__eworkRefreshCalendar
   if(fn){const result=await fn();if(result?.error)setError(result.error)}else setRefresh(value=>value+1)
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <section className="en-research en-native-component" ref={root} style={size.style} contentEditable={false} data-note-research-block={block.id} data-research-node-id={node.id} data-selected={selected||undefined} data-resizing={size.resizing||undefined} data-financial-theme={context.dark?'dark':'light'}>
  <header className="en-research-header" draggable={!!context.editor?.isEditable}><button className="en-component-refresh" aria-label="刷新组件" disabled={!ready||busy} onClick={reload}><NoteMenuIcon kind="refresh"/></button><div className="en-native-component-title" id={instance.current+'-title'}><strong>{node.title}</strong></div><button className="en-component-close" aria-label="移除笔记中的组件" disabled={!context.editor?.isEditable} onClick={()=>context.editor.removeBlocks([block.id])}><NoteMenuIcon kind="close"/></button></header>
  <div className="en-research-view"><div ref={host} id={instance.current} className="en-native-component-host" data-note-component={node.id} data-note-session={context.sessionId} style={{height:size.height}}/>{!ready?<div className="en-component-empty" role="status">{error||'正在读取组件…'}</div>:null}{ready&&!selected?<button className="en-component-scroll-guard" aria-label="选中组件并操作内容" onClick={interaction.select}/>:null}</div>
  {error&&ready?<div className="en-component-error" role="alert">{error}</div>:null}
  {selected&&context.editor?.isEditable?<NoteComponentResizeHandles size={size}/>:null}
 </section>
}
