import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {getNodeById} from '@blocknote/core'
import {TableHandlesExtension} from '@blocknote/core/extensions'
import {TableHandle,TableHandlesController,useBlockNoteEditor,useEditorState,useExtensionState,type TableHandleProps} from '@blocknote/react'
import {Selection} from 'prosemirror-state'
import {TableMap,addRowBefore,addRowAfter,addColumnBefore,addColumnAfter,deleteRow,deleteColumn,moveTableRow,moveTableColumn} from 'prosemirror-tables'
import type {Node as PMNode} from 'prosemirror-model'
import {noteUiText as t} from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import {chooseNativeTableColumnWidths,resizeNativeTableColumnWidths} from './native-table-layout'
import {noteEditorVisible} from './editor-visibility'
import nativeTableStyles from './native-table.css?inline'

type Target={id:string;node:PMNode;row:number;col:number;columns:number;rows:number}
type Menu='table'|'row'|'column'
type Command=(state:any,dispatch?:any,view?:any)=>boolean
const selectedTable=(editor:any):Target|undefined=>{
 try{
  const {$from}=editor.prosemirrorState.selection
  for(let depth=$from.depth;depth>0;depth--)if($from.node(depth).type.spec.tableRole==='table'){
   const node=$from.node(depth),id=$from.node(depth-1).attrs.id,map=TableMap.get(node),cellDepth=depth+2
   if(!id||$from.depth<cellDepth)return
   const rect=map.findCell($from.before(cellDepth)-$from.start(depth))
   return{id,node,row:rect.top,col:rect.left,columns:map.width,rows:map.height}
  }
 }catch{}
}
const tableElement=(editor:any,id:string)=>editor.domElement?.querySelector('[data-id="'+CSS.escape(id)+'"] [data-content-type="table"] table') as HTMLTableElement|null
const availableWidth=(table:HTMLTableElement)=>{const wrapper=table.closest<HTMLElement>('.tableWrapper')!,style=getComputedStyle(wrapper);return wrapper.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-2}
const complete=(widths:any,count:number)=>Array.isArray(widths)&&widths.length===count&&widths.every(width=>Number.isFinite(width)&&width>0)
const stopCapture=(editor:any)=>editor.prosemirrorState.plugins.find((plugin:any)=>plugin.key.startsWith('y-undo'))?.getState(editor.prosemirrorState)?.undoManager?.stopCapturing()
function LabeledTableHandle(props:TableHandleProps){return <TableHandle {...props}><span className="en-native-table-grip">{t(props.orientation==='row'?'行':'列')} ⋮</span></TableHandle>}

/** Fit newly inserted tables before the caller captures its document snapshot. */
export function withNativeTableSizing<T>(editor:any,insert:()=>T):T{
 const ids=new Set<string>(),visit=(blocks:any[],fn:(block:any)=>void)=>{for(const block of blocks){fn(block);if(block.children)visit(block.children,fn)}}
 visit(editor.document,block=>{if(block.type==='table')ids.add(block.id)})
 return editor.transact(()=>{
  const result=insert()
  visit(editor.document,(block:any)=>{
   if(ids.has(block.id)||block.type!=='table')return
   const count=block.content.rows[0]?.cells.reduce((sum:number,cell:any)=>sum+(cell.props?.colspan||1),0)
   if(!count||complete(block.content.columnWidths,count))return
   const table=tableElement(editor,block.id)
   // The real wrapper is preferred. Before the node view mounts, reserve its
   // native 9px handle gutter, 22px add-column gutter and table border.
   const width=table?availableWidth(table):editor.domElement.clientWidth-32
   if(width>0)editor.updateBlock(block.id,{content:{...block.content,columnWidths:chooseNativeTableColumnWidths(count,width)}})
  })
  return result
 })
}

/** Native table UI shares the real editor's commands, document and undo history. */
export function NativeTableControls({active=true,sessionId}:{active?:boolean;sessionId:string}){
 const editor:any=useBlockNoteEditor(),hover=useExtensionState(TableHandlesExtension),target=useEditorState({editor,selector:()=>selectedTable(editor),equalityFn:(a,b)=>a?.node===b?.node&&a?.row===b?.row&&a?.col===b?.col&&a?.id===b?.id})
 const [handleEpoch,setHandleEpoch]=useState(0),[enabled,setEnabled]=useState(active)
 const [menu,setMenu]=useState<Menu>(),[position,setPosition]=useState<{left:number;top:number;right:number;bottom:number}>(),[widthText,setWidthText]=useState('')
 const layer=useMemo(()=>{const node=document.createElement('div');node.className='en-native-table-layer';node.setAttribute('popover','manual');node.dataset.noteTableSession=sessionId;return node},[sessionId])
 const nativeDragView=useRef<any>(),live=useRef(false),latest=useRef({active,target}),menuLease=useRef<Target>(),trigger=useRef<HTMLButtonElement>(),drag=useRef<{id:number;startX:number;startWidth:number;next:number;target:Target;restore:()=>void;button:HTMLButtonElement}>()
 latest.current={active,target}
 const allowed=()=>live.current&&latest.current.active&&editor.isEditable&&noteEditorVisible(editor.domElement)&&(!document.body.dataset.workspaceSurface||document.body.dataset.workspaceSurface==='notes')
 const owns=(value:Target|undefined)=>!!value&&allowed()&&getNodeById(value.id,editor.prosemirrorState.doc)?.node.firstChild===value.node
 const close=(focus=false)=>{setMenu(undefined);menuLease.current=undefined;if(focus)trigger.current?.focus({preventScroll:true})}
 const restoreEditor=()=>editor.prosemirrorView.focus()
 const retireNativeDrag=()=>{
  const extension=editor.getExtension(TableHandlesExtension);if(!extension?.store.state?.draggingState)return
  // Editable changes remount ProseMirror. Its old view is already destroyed,
  // but the extension store can still hold that view's drag snapshot.
  if(nativeDragView.current&&nativeDragView.current!==editor.prosemirrorView)extension.store.setState(undefined)
  else extension.dragEnd()
 }
 const retireNativeUi=()=>{
  const extension=editor.getExtension(TableHandlesExtension)
  retireNativeDrag();extension.unfreezeHandles();extension.hideHandlesIfNotFrozen()
  // The old view's store can survive an editable remount; no retired handle
  // may become actionable again before the current view emits a fresh hover.
  extension.store.setState(undefined)
 }
 const finishDrag=(commit:boolean)=>{
  const gesture=drag.current;if(!gesture)return;drag.current=undefined;gesture.restore()
  if(gesture.button.hasPointerCapture(gesture.id))gesture.button.releasePointerCapture(gesture.id)
  if(commit&&owns(gesture.target)&&gesture.next!==gesture.startWidth)writeWidths(gesture.target,resizeNativeTableColumnWidths(widthsFor(gesture.target),gesture.next))
 }
 const widthsFor=(value:Target)=>{
  const block=editor.getBlock(value.id),table=tableElement(editor,value.id)
  return chooseNativeTableColumnWidths(value.columns,table?availableWidth(table):value.columns*120,block?.content.columnWidths)
 }
 const writeWidths=(value:Target,widths:number[],focusEditor=true)=>{
  if(!owns(value))return
  const block=editor.getBlock(value.id),selection=editor.prosemirrorState.selection
  if(JSON.stringify(block.content.columnWidths)===JSON.stringify(widths))return
  stopCapture(editor)
  editor.transact((tr:any)=>{editor.updateBlock(value.id,{content:{...block.content,columnWidths:widths}});tr.setSelection(Selection.fromJSON(tr.doc,selection.toJSON()))})
  stopCapture(editor);if(focusEditor)restoreEditor()
 }
 useLayoutEffect(()=>editor.getExtension(TableHandlesExtension).store.subscribe(({currentVal}:any)=>{
  if(!currentVal?.draggingState)nativeDragView.current=undefined
  else nativeDragView.current??=editor.prosemirrorView
 }),[editor])
 useLayoutEffect(()=>{
  live.current=true;document.body.append(layer);editor.registerPortalElement(layer)
  return()=>{live.current=false;finishDrag(false);retireNativeUi();editor.unregisterPortalElement(layer);if(layer.matches(':popover-open'))layer.hidePopover();layer.remove()}
 },[editor,layer])
 useLayoutEffect(()=>{
  const root=editor.domElement?.closest('.en-root');if(!root)return
  const style=getComputedStyle(root)
  for(const name of ['--en-bg','--en-ink','--en-muted','--en-control','--en-accent','--en-border','--en-popup'])layer.style.setProperty(name,style.getPropertyValue(name))
 })
 useLayoutEffect(()=>{
  // Upstream's width:auto!important otherwise shrinks explicitly saved empty
  // columns. Mirror the native TableView's live width, including its own drag
  // preview, without writing document content or replacing its resize plugin.
  const sync=()=>editor.domElement?.querySelectorAll('[data-content-type="table"] table').forEach((table:HTMLTableElement)=>{
   const width=table.style.width||'auto'
   if(table.style.getPropertyValue('--en-native-table-width')!==width)table.style.setProperty('--en-native-table-width',width)
  })
  sync();const observer=new MutationObserver(sync);observer.observe(editor.domElement,{subtree:true,childList:true,attributes:true,attributeFilter:['style']})
  return()=>observer.disconnect()
 },[editor,active])
 useLayoutEffect(()=>{
  let frame=0
  const update=()=>{
   const current=latest.current.target,table=current&&tableElement(editor,current.id),scroll=editor.domElement?.closest('.en-document-scroll') as HTMLElement|null
   if(!allowed())retireNativeUi()
   setEnabled(allowed())
   if(!allowed()||!table||!scroll){setPosition(undefined);close();return}
   const rect=table.getBoundingClientRect(),viewport=scroll.getBoundingClientRect()
   if(rect.bottom<=viewport.top||rect.top>=viewport.bottom){setPosition(undefined);close();return}
   const wrapper=table.closest<HTMLElement>('.tableWrapper')!.getBoundingClientRect()
   setPosition({left:Math.max(8,Math.min(wrapper.left,window.innerWidth-280)),top:Math.max(viewport.top+6,rect.top-38),right:Math.min(rect.right,wrapper.right-12,window.innerWidth-12),bottom:Math.max(viewport.top+45,Math.min(rect.bottom,viewport.bottom-12))})
  }
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update)}
  update();window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true)
  const observer=new ResizeObserver(schedule);if(editor.domElement)observer.observe(editor.domElement)
  const mutation=new MutationObserver(()=>{finishDrag(false);retireNativeUi();close();setHandleEpoch(epoch=>epoch+1);setEnabled(allowed());if(!allowed()){setPosition(undefined);if(layer.matches(':popover-open'))layer.hidePopover()}else schedule()});mutation.observe(document.body,{attributes:true,attributeOldValue:true,attributeFilter:['data-workspace-surface']})
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);observer.disconnect();mutation.disconnect()}
 },[editor,layer,target?.id,target?.node,active])
 useLayoutEffect(()=>{
  const show=allowed()&&!!(position||hover?.show)
  if(show&&!layer.matches(':popover-open'))layer.showPopover()
  if(!show&&layer.matches(':popover-open')){finishDrag(false);close();layer.hidePopover()}
 },[position,hover?.show,active,layer])
 useEffect(()=>{if(menuLease.current&&(!owns(menuLease.current)||target?.row!==menuLease.current.row||target?.col!==menuLease.current.col))close();if(target)setWidthText(String(Math.round(widthsFor(target).reduce((a,b)=>a+b,0))))},[target?.node,target?.id,target?.row,target?.col])
 useEffect(()=>{
  const outside=(event:PointerEvent)=>{if(!layer.querySelector('.en-native-table-toolbar')?.contains(event.target as Node))close()}
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&(drag.current||menuLease.current)){event.preventDefault();event.stopPropagation();if(drag.current)finishDrag(false);else close(true)}
  }
  const move=(event:PointerEvent)=>{
   const gesture=drag.current;if(!gesture||event.pointerId!==gesture.id)return
   if(!owns(gesture.target)){finishDrag(false);return}
   // Screen deltas are converted back to layout pixels when the note is scaled.
   const table=tableElement(editor,gesture.target.id)!,scale=table.getBoundingClientRect().width/table.offsetWidth||1
   gesture.next=Math.max(gesture.target.columns*35,Math.round(gesture.startWidth+(event.clientX-gesture.startX)/scale))
   const widths=resizeNativeTableColumnWidths(widthsFor(gesture.target),gesture.next)
   table.querySelectorAll<HTMLTableColElement>('colgroup col').forEach((col,i)=>{col.style.width=widths[i]+'px'})
   table.style.setProperty('width',gesture.next+'px','important');table.style.minWidth='';table.style.setProperty('--default-cell-min-width','35px')
  }
  const up=(event:PointerEvent)=>{if(drag.current?.id===event.pointerId)finishDrag(true)},cancel=(event:PointerEvent)=>{if(drag.current?.id===event.pointerId)finishDrag(false)},blur=()=>{finishDrag(false);retireNativeUi();close();setHandleEpoch(epoch=>epoch+1)}
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',blur)
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',blur)}
 },[editor,layer])
 useLayoutEffect(()=>{
  if(menu)layer.querySelector<HTMLButtonElement>('.en-native-table-menu button:not(:disabled)')?.focus({preventScroll:true})
 },[menu,layer])
 useLayoutEffect(()=>{
  const popup=layer.querySelector<HTMLElement>('.en-native-table-menu'),toolbar=layer.querySelector<HTMLElement>('.en-native-table-toolbar');if(!popup||!toolbar)return
  const rect=toolbar.getBoundingClientRect(),below=window.innerHeight-rect.bottom-10,above=rect.top-10,down=below>=popup.scrollHeight||below>=above
  popup.style.top=down?'calc(100% + 5px)':'auto';popup.style.bottom=down?'auto':'calc(100% + 5px)';popup.style.maxHeight=Math.max(40,down?below:above)+'px'
 },[menu,position,layer])
 const openMenu=(kind:Menu,event:React.MouseEvent<HTMLButtonElement>)=>{
  if(!owns(target))return
  trigger.current=event.currentTarget;if(menu===kind)return close(true)
  menuLease.current=target;setMenu(kind)

 }
 const run=(command:Command)=>{const value=menuLease.current;if(!owns(value))return close();stopCapture(editor);editor.exec((state:any,dispatch:any,view:any)=>command(state,dispatch,view));stopCapture(editor);close();restoreEditor()}
 const changeWidth=(kind:'fit'|'equal')=>{const value=menuLease.current;if(!owns(value))return close();const table=tableElement(editor,value!.id)!;writeWidths(value!,chooseNativeTableColumnWidths(value!.columns,kind==='fit'?availableWidth(table):widthsFor(value!).reduce((a,b)=>a+b,0)));close()}
 const startDrag=(event:React.PointerEvent<HTMLButtonElement>)=>{
  if(event.button!==0||!owns(target)||drag.current)return
  event.preventDefault();event.stopPropagation();close()
  const table=tableElement(editor,target!.id)!,cols=[...table.querySelectorAll('colgroup col')],style=table.getAttribute('style'),colStyles=cols.map(col=>col.getAttribute('style')),startWidth=widthsFor(target!).reduce((a,b)=>a+b,0)
  drag.current={id:event.pointerId,startX:event.clientX,startWidth,next:startWidth,target:target!,button:event.currentTarget,restore:()=>{if(style===null)table.removeAttribute('style');else table.setAttribute('style',style);cols.forEach((col,i)=>{if(colStyles[i]===null)col.removeAttribute('style');else col.setAttribute('style',colStyles[i]!)})}}
  event.currentTarget.setPointerCapture(event.pointerId)
 }
 const menuKeyboard=(event:React.KeyboardEvent)=>{
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return
  event.preventDefault();const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=items.indexOf(document.activeElement as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus()
 }
 return <><style>{nativeTableStyles}</style>{active&&enabled?<TableHandlesController key={handleEpoch} portalElement={layer} tableHandle={LabeledTableHandle}/>:null}{position&&target&&allowed()?createPortal(<>
  <div className="en-native-table-toolbar" role="toolbar" aria-label={t('原生表格操作')} style={{left:position.left,top:position.top}} onPointerDown={event=>{if((event.target as HTMLElement).closest('button'))event.preventDefault();event.stopPropagation()}}>
   <button aria-label={t('表格操作')} aria-expanded={menu==='table'} onClick={event=>openMenu('table',event)}>{t('表格')} ▾</button>
   <button aria-label={t('行操作')} aria-expanded={menu==='row'} onClick={event=>openMenu('row',event)}>{t('行')} {target.row+1} ▾</button>
   <button aria-label={t('列操作')} aria-expanded={menu==='column'} onClick={event=>openMenu('column',event)}>{t('列')} {target.col+1} ▾</button>
   <span>{target.rows} × {target.columns}</span>
   {menu?<div className="en-native-table-menu" role="menu" aria-label={t(menu==='table'?'表格操作':menu==='row'?'行操作':'列操作')} onKeyDown={menuKeyboard}>
    {menu==='table'?<><button role="menuitem" onClick={()=>changeWidth('fit')}>{t('适应正文')}</button><button role="menuitem" onClick={()=>changeWidth('equal')}>{t('平均分列')}</button><label>{t('表格宽度')} <input aria-label={t('表格宽度')} type="number" min={target.columns*35} max={100000} value={widthText} onChange={event=>setWidthText(event.target.value)} onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter'){const width=Number(widthText),value=menuLease.current;if(owns(value)&&Number.isFinite(width)&&width>=value!.columns*35&&width<=100000){writeWidths(value!,resizeNativeTableColumnWidths(widthsFor(value!),width));close()}}}}/> px</label></>:menu==='row'?<>
     <button role="menuitem" onClick={()=>run(addRowBefore)}>{t('在上方插入行')}</button><button role="menuitem" onClick={()=>run(addRowAfter)}>{t('在下方插入行')}</button><button role="menuitem" disabled={target.row===0} onClick={()=>run(moveTableRow({from:target.row,to:target.row-1}))}>{t('上移此行')}</button><button role="menuitem" disabled={target.row===target.rows-1} onClick={()=>run(moveTableRow({from:target.row,to:target.row+1}))}>{t('下移此行')}</button><button role="menuitem" disabled={target.rows===1} onClick={()=>run(deleteRow)}>{t('删除此行')}</button>
    </>:<><button role="menuitem" onClick={()=>run(addColumnBefore)}>{t('在左侧插入列')}</button><button role="menuitem" onClick={()=>run(addColumnAfter)}>{t('在右侧插入列')}</button><button role="menuitem" disabled={target.col===0} onClick={()=>run(moveTableColumn({from:target.col,to:target.col-1}))}>{t('左移此列')}</button><button role="menuitem" disabled={target.col===target.columns-1} onClick={()=>run(moveTableColumn({from:target.col,to:target.col+1}))}>{t('右移此列')}</button><button role="menuitem" disabled={target.columns===1} onClick={()=>run(deleteColumn)}>{t('删除此列')}</button></>}
   </div>:null}
  </div>
  <button className="en-native-table-width-handle" role="separator" aria-label={t('调整表格整体宽度')} aria-orientation="vertical" title={t('拖动调整整体宽度；方向键微调，Shift加速')} tabIndex={0} style={{left:position.right-5,top:position.bottom-30}} onPointerDown={startDrag} onLostPointerCapture={()=>finishDrag(false)} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home'].includes(event.key)||!owns(target))return;event.preventDefault();event.stopPropagation();const widths=widthsFor(target),table=tableElement(editor,target.id)!;writeWidths(target,event.key==='Home'?chooseNativeTableColumnWidths(target.columns,availableWidth(table)):resizeNativeTableColumnWidths(widths,widths.reduce((a,b)=>a+b,0)+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?40:8)),false)}}>⋮</button>
 </>,layer):null}</>
}
