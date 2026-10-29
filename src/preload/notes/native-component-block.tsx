import { noteUiText as t } from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import React, {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {createComponentSurfaceUi} from '../../../scripts/lib/component-surface-ui.mjs'
import surfaceStyles from '../../../scripts/lib/component-surface-menu.css?inline'
import {noteEditorVisible} from './editor-visibility'
import {updateNoteComponentPresentation,type NotePresentation} from './client-capability-actions'
import {financialWidgetSpec} from '../../../packages/dsh-research-task-runtime/financial-widget-contract.js'
import {useNoteComponentSize,NoteComponentResizeHandles} from './component-size'
import {useNoteComponentInteraction} from './component-interaction'
import {useNotePresentation} from './component-presentation'

const SurfaceIcon=({name}:any)=><span className={'ew-grid-icon ew-grid-icon-'+name} aria-hidden="true"/>
const SurfaceUi=createComponentSurfaceUi({React,createPortal,Icon:SurfaceIcon,css:surfaceStyles})

/** Native research components are portalled here by the resident conversation renderer. */
export function NativeComponentBlock({block,node,context,mode='component'}:any){
 const generation=mode==='generation'&&!node.containerSpec
 const host=useRef<HTMLDivElement>(null),instance=useRef(crypto.randomUUID()),interaction=useNoteComponentInteraction(),{root,selected}=interaction
 useNotePresentation(root,node,context.dark)
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0)
 const menuEpoch=useRef(0),menuPending=useRef(false)
 const closeMenu=()=>{menuEpoch.current++;menuPending.current=false;setMenu(null)}
 const [menu,setMenu]=useState<HTMLElement|null>(null),[capabilities,setCapabilities]=useState<any>({}),[renaming,setRenaming]=useState<{title:string;spec:string}>(),[dataOpen,setDataOpen]=useState(false),[notice,setNotice]=useState('')
 const reading=SurfaceUi.useReading(root)
 const [height,setHeight]=useState(Math.max(160,Math.min(2400,generation?220:(node.height||362)-34)))
 const size=useNoteComponentSize({block,node,editor:context.editor,root,naturalHeight:height})
 const {interactionState:journal,sharedComponentState:semantic,...renderConfig}=node.config||{},renderKey=JSON.stringify({...node,notePresentation:undefined,config:Object.keys(renderConfig).length?renderConfig:undefined,noteSize:undefined,...node.kind==='web-link'?{sourceText:undefined}:{}})
 const latestView=useRef({node,context,refresh,generation,capabilities});latestView.current={node,context,refresh,generation,capabilities}
 const menuTarget=async(persist=true)=>{
  const {node:expected,context:ctx}=latestView.current,editor=ctx.editor
  if(!root.current?.isConnected||!noteEditorVisible(root.current)||!editor)throw Error(t('笔记组件已关闭或不在当前文档。'))
  if(persist&&editor.isEditable&&capabilities.rename!==false&&typeof ctx.persistComponentActions==='function')await ctx.persistComponentActions()
  const current=editor.getBlock(block.id)
  if(!root.current?.isConnected||!noteEditorVisible(root.current)||!current||latestView.current.context.editor!==editor||latestView.current.context.sessionId!==ctx.sessionId)throw Error(t('笔记组件已变化。'))
  const value=JSON.parse(current.props.payload)
  if(value.id!==expected.id)throw Error(t('笔记组件身份已变化。'))
  return{ctx,value,input:{sessionId:ctx.sessionId,blockId:block.id,nodeId:value.id,expectedPayload:current.props.payload}}
 }
 const openMenu=async(trigger:HTMLElement)=>{if(menu||menuPending.current){closeMenu();return}const ticket=++menuEpoch.current,owner=SurfaceUi.captureMenuOwner(trigger);menuPending.current=true;const current=()=>ticket===menuEpoch.current&&owner.current();try{let target=await menuTarget(false),value:any;try{value=await target.ctx.bridge.request('component-menu-capabilities',target.input)}catch(error){if(!current())return;if(!target.ctx.editor.isEditable||capabilities.rename===false)throw error;target=await menuTarget();value=await target.ctx.bridge.request('component-menu-capabilities',target.input)}if(current()){setCapabilities(value||{});setMenu(trigger)}}catch(error){if(current()){setCapabilities({copy:false,saveLibrary:false,exportContent:false,rename:false});setNotice((error as Error).message);setMenu(trigger)}}finally{owner.dispose();if(ticket===menuEpoch.current)menuPending.current=false}}
 const copy=async()=>{const target=await menuTarget(),result=await target.ctx.bridge.request('component-copy',target.input);if(result?.ok!==true)throw Error(result?.error||t('组件未复制，请重试。'));setNotice(t('已复制到剪贴板，可粘贴到笔记或研究。'))}
 const library=async()=>{const target=await menuTarget();if(!target.ctx.editor.isEditable)throw Error(t('笔记当前不可编辑。'));const result=await target.ctx.bridge.request('component-library-save',target.input);if(typeof result?.id!=='string'||!result.id)throw Error(t('组件库未返回保存确认。'));window.dispatchEvent(new CustomEvent('ework-component-library-changed'));window.dispatchEvent(new CustomEvent('ework-component-library-saved',{detail:{sessionId:target.ctx.sessionId}}));setNotice(t('已添加至组件库。'))}
 const exportContent=async(format:string)=>{const target=await menuTarget(),adapter=(root.current as any)?.__eworkNoteMenu;if(adapter?.instanceId!==instance.current||typeof adapter.exportContent!=='function'||adapter.spec!==JSON.stringify(target.value.containerSpec))throw Error(t('请等待当前组件内容加载完成后重试。'));const result=await adapter.exportContent(format,(request:any)=>{if(!root.current?.isConnected||!noteEditorVisible(root.current)||target.ctx.editor.getBlock(block.id)?.props.payload!==target.input.expectedPayload)throw Error(t('组件已变化，请重新导出。'));const {kind,format,content,base64}=request;return target.ctx.bridge.request('component-export',{...target.input,kind,format,...kind==='text'?{content}:{base64}})});if(result?.status==='saved')setNotice(t('已导出组件。'));return result}
 const rename=async(title:string)=>{const target=await menuTarget(),editor=target.ctx.editor;if(!editor.isEditable||!renaming||JSON.stringify(target.value.containerSpec)!==renaming.spec)throw Error(t('组件已变化或当前不可编辑。'));const currentTitle=target.value.displayName||target.value.title;if(currentTitle!==renaming.title&&currentTitle!==title)throw Error(t('组件名称已有较新修改。'));if(currentTitle!==title)editor.updateBlock(block.id,{props:{payload:JSON.stringify({...target.value,title,displayName:title})}});if(typeof target.ctx.persistComponentActions!=='function')throw Error(t('笔记保存当前不可用。'));await target.ctx.persistComponentActions();setNotice(t('名称已保存。'))}
 const openData=()=>{reading.close();window.requestAnimationFrame(()=>{const widget=root.current?.querySelector<HTMLElement>('.ew-financial-provenance');if(widget){widget.click();return}const adapter=(root.current as any)?.__eworkNoteMenu;if(adapter?.instanceId===instance.current&&adapter.openData?.()!==false)return;setDataOpen(true)})}
 const changeTheme=async(theme:string)=>{if(!['light','dark','enterprise','openterminal'].includes(theme))throw Error(t('组件模式无效。'));const owner=SurfaceUi.captureMenuOwner(root.current?.querySelector('.en-component-more'),()=>{});try{const target=await menuTarget();if(!owner.current()||!target.ctx.editor.isEditable||latestView.current.capabilities.rename===false)throw Error(t('笔记当前不可编辑或组件已变化。'));if(typeof target.ctx.persistComponentActions!=='function')throw Error(t('笔记保存当前不可用。'));updateNoteComponentPresentation(target.ctx.editor,[block.id],{theme:theme as NotePresentation['theme']});await target.ctx.persistComponentActions();if(owner.current())setNotice(t('组件模式已保存。'))}finally{owner.dispose()}}
 const menuActions=[SurfaceUi.themeAction(node.notePresentation?.theme,changeTheme,!context.editor?.isEditable||capabilities.rename===false,context.dark?'dark':'light'),{id:'expand',icon:'expand',label:'放大阅读',run:reading.toggle},capabilities.copy&&{id:'copy',icon:'duplicate',label:'复制组件',run:copy},capabilities.rename&&context.editor?.isEditable&&{id:'rename',icon:'rename',label:'重命名',run:()=>{reading.close();const current=context.editor.getBlock(block.id),value=JSON.parse(current.props.payload);setRenaming({title:value.displayName||value.title||'组件',spec:JSON.stringify(value.containerSpec)})}},capabilities.saveLibrary&&context.editor?.isEditable&&{id:'library',icon:'library-add',label:'添加至组件库',run:library},capabilities.exportContent&&{id:'export',icon:'download',label:'导出',children:['svg','png','jpg'].map(format=>({id:format,label:format.toUpperCase(),run:()=>exportContent(format)}))},{id:'data',icon:'data',label:'数据源与自动更新',run:openData},capabilities.rename&&context.editor?.isEditable&&node.containerSpec?.widget==='indices'&&{id:'indices',icon:'settings',label:'配置指数',run:()=>{reading.close();const adapter=(root.current as any)?.__eworkNoteMenu;if(adapter?.instanceId!==instance.current)throw Error(t('组件尚未就绪。'));adapter.openIndices()}}]
 const publishView=()=>{const current=latestView.current;document.dispatchEvent(new CustomEvent('sherlock:notes-component-view',{detail:{instanceId:instance.current,hostId:host.current?.id,headerId:instance.current+'-title',sessionId:current.context.sessionId,node:current.node,dark:current.context.dark,refresh:current.refresh,mode:current.generation?'generation':'component',readOnly:!current.context.editor?.isEditable||current.capabilities.rename===false}}))}
 useEffect(()=>{if(ready)publishView()},[node,ready,capabilities])
 useEffect(()=>{
  let attempts=0,live=true,timer:ReturnType<typeof setTimeout>|undefined;setReady(false);setError('')
  const publish=publishView
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
   if(['data-read','data-configure','data-refresh'].includes(value.action)){
    const reply=(ok:boolean,message?:string,state?:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-component-ack',{detail:{instanceId:instance.current,sessionId:context.sessionId,requestId:value.requestId,ok,message,state}}))
    try{const target=await menuTarget();if(target.value.id!==value.nodeId)throw Error(t('笔记组件已变化。'))
     if(value.action!=='data-read'){const caps=await target.ctx.bridge.request('component-menu-capabilities',target.input);if(!target.ctx.editor.isEditable||caps.rename!==true)throw Error(t('笔记当前不可编辑。'));await target.ctx.bridge.request('component-data',{sessionId:context.sessionId,nodeId:value.nodeId,action:value.action==='data-configure'?'configure':'refresh',...value.action==='data-configure'?{settings:value.settings}:{}})}
     const dataBridge=(window as any).dshDesktop?.componentData;if(typeof dataBridge?.request!=='function')throw Error(t('笔记数据状态接口不可用。'));const rows=await dataBridge.request(context.sessionId,{action:'list',surface:'notes'});if(!live||!noteEditorVisible(root.current)||!context.editor.getBlock(block.id))throw Error(t('笔记组件已关闭。'));reply(true,undefined,rows?.find((row:any)=>row.nodeId===value.nodeId))
    }catch(error){if(live)reply(false,(error as Error).message)}
    return
   }
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
   if(value.action==='interaction'||value.action==='shared-state'){
    const reply=(ok:boolean,message?:string,state?:any)=>document.dispatchEvent(new CustomEvent('sherlock:notes-component-ack',{detail:{instanceId:instance.current,sessionId:context.sessionId,requestId:value.requestId,ok,message,state}}))
    try{
     if(!context.commitHtmlInteraction)throw Error(t('笔记交互保存不可用。'))
     const state=await context.commitHtmlInteraction({blockId:block.id,nodeId:value.nodeId,html:value.html,version:value.version,...value.action==='shared-state'?{sharedState:value.sharedState}:{event:value.event}},()=>live&&!!host.current?.isConnected)
     if(live)reply(true,undefined,state)
    }catch(error){if(live)reply(false,(error as Error).message)}
    return
   }
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
  {!ready&&error?<div className="en-component-error" role="alert">{t(error)}</div>:null}
  {selected&&context.editor?.isEditable?<NoteComponentResizeHandles size={size}/>:null}
 </section>
 return <section className="en-research en-native-component" ref={root} style={size.style} contentEditable={false} data-note-research-block={block.id} data-research-node-id={node.id} data-selected={selected||undefined} data-resizing={size.resizing||undefined} data-financial-theme={context.dark?'dark':'light'}>
  <header className="en-research-header ew-grid-header" draggable={!!context.editor?.isEditable}><div className="en-native-component-title" id={instance.current+'-title'}><strong>{node.displayName||node.title}</strong></div><button className="en-component-more" data-workbench-more={node.id} aria-label={t('组件更多操作')} aria-haspopup="menu" aria-expanded={!!menu} disabled={!ready} onClick={event=>{void openMenu(event.currentTarget)}}><span className="ew-grid-icon ew-grid-icon-more" aria-hidden="true"/></button><button className="en-component-close" aria-label={t("移除笔记中的组件")} disabled={!context.editor?.isEditable} onClick={()=>context.editor.removeBlocks([block.id])}><span className="ew-grid-icon ew-grid-icon-close" aria-hidden="true"/></button></header>
  <div className="en-research-view"><div ref={host} id={instance.current} className="en-native-component-host" data-note-component={node.id} data-note-session={context.sessionId} style={{height:size.height}}/>{!ready?<div className="en-component-empty" role="status">{t(error)||t("正在读取组件…")}</div>:null}{ready&&!selected?<button className="en-component-scroll-guard" aria-label={t("选中组件并操作内容")} onClick={interaction.select}/>:null}</div>
  {error&&ready?<div className="en-component-error" role="alert">{t(error)}</div>:null}
  {notice?<div className="en-component-notice" role="status">{notice}</div>:null}
  {menu?<SurfaceUi.Menu surface="notes" trigger={menu} actions={menuActions} onClose={closeMenu}/>:null}
  {renaming?<SurfaceUi.Rename title={renaming.title} onRename={rename} onClose={()=>setRenaming(undefined)}/>:null}
  {dataOpen?<SurfaceUi.Data title={node.displayName||node.title} provenance={node.provenance||{}} onClose={()=>setDataOpen(false)}/>:null}
  {reading.control}
  {selected&&context.editor?.isEditable?<NoteComponentResizeHandles size={size}/>:null}
 </section>
}

/** The existing research generation process is rendered by the resident portal. */
export function NoteGenerationBlock(props:any){return <NativeComponentBlock {...props} mode="generation"/>}
