import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {getNodeById} from '@blocknote/core'
import {TableHandlesExtension} from '@blocknote/core/extensions'
import {TableHandle,TableHandlesController,useBlockNoteEditor,useEditorState,useExtensionState,type TableHandleProps} from '@blocknote/react'
import {Selection} from 'prosemirror-state'
import {CellSelection,TableMap,addRow,addColumn,addRowBefore,addRowAfter,addColumnBefore,addColumnAfter,deleteRow,deleteColumn,moveTableRow,moveTableColumn} from 'prosemirror-tables'
import type {Node as PMNode} from 'prosemirror-model'
import {noteUiText as t} from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import {chooseNativeTableColumnWidths,resizeNativeTableColumnWidths,initialNativeTableColumnWidths,resolveNativeTableColumnWidths,nativeTableVisibleRect} from './native-table-layout'
import {noteEditorVisible} from './editor-visibility'
import nativeTableStyles from './native-table.css?inline'

type Target={id:string;node:PMNode;row:number;col:number;columns:number;rows:number}
type Menu='table'|'row'|'column'
type Command=(state:any,dispatch?:any,view?:any)=>boolean
const noteViewport=(table:HTMLTableElement)=>{
 const wrapper=table.closest<HTMLElement>('.tableWrapper'),scroll=table.closest<HTMLElement>('.en-document-scroll');if(!wrapper||!scroll)return
 const note=scroll.getBoundingClientRect(),outer=wrapper.getBoundingClientRect(),screen={left:0,top:0,right:window.innerWidth,bottom:window.innerHeight}
 const visible=nativeTableVisibleRect(table.getBoundingClientRect(),outer,note,screen)
 return visible?{visible,note,outer}:undefined
}
const NoExtendButton=()=>null
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
function EdgeTableHandle(props:TableHandleProps){
 const editor:any=useBlockNoteEditor(),hover=useExtensionState(TableHandlesExtension),table=hover?.block&&tableElement(editor,hover.block.id),cell=table?.rows[hover?.rowIndex??0]?.cells[hover?.colIndex??0],rect=cell?.getBoundingClientRect(),row=props.orientation==='row'
 const viewport=table&&noteViewport(table),whole=table?.getBoundingClientRect(),visible=viewport&&rect?nativeTableVisibleRect(rect,viewport.outer,viewport.note,{left:0,top:0,right:window.innerWidth,bottom:window.innerHeight}):undefined
 const style:React.CSSProperties=row?{width:10,height:visible?visible.bottom-visible.top:0,left:whole&&viewport?Math.max(-9,viewport.visible.left-whole.left):0,top:rect&&visible&&!hover?.draggingState?visible.top-rect.top:0}:{width:visible?visible.right-visible.left:0,height:10,left:rect&&visible?visible.left-rect.left:0,top:whole&&viewport?Math.max(-12,viewport.visible.top-whole.top-2):0}
 if(!visible)style.visibility='hidden'
 const snapshot=hover?.block&&getNodeById(hover.block.id,editor.prosemirrorState.doc)?.node.firstChild
 const current=()=>!!snapshot&&snapshot.type.spec.tableRole==='table'&&editor.isEditable&&noteEditorVisible(editor.domElement)&&(!document.body.dataset.workspaceSurface||document.body.dataset.workspaceSurface==='notes')&&getNodeById(hover!.block.id,editor.prosemirrorState.doc)?.node.firstChild===snapshot
 const guard=(event:React.SyntheticEvent)=>{if(current())return true;event.preventDefault();event.stopPropagation();return false}
 const selected=useEditorState({editor,selector:()=>{const selection=editor.prosemirrorState.selection,current=selectedTable(editor);return selection instanceof CellSelection&&current?.id===hover?.block?.id&&(row?selection.isRowSelection()&&current?.row===hover?.rowIndex:selection.isColSelection()&&current?.col===hover?.colIndex)}})
 const select=(event:React.MouseEvent)=>{
  if(!guard(event)||!hover?.block)return
  const state=editor.prosemirrorState,info=getNodeById(hover.block.id,state.doc),node=info?.node.firstChild;if(!info||!node)return
  const map=TableMap.get(node),start=info.posBeforeNode+2,index=row?hover.rowIndex:0,col=row?0:hover.colIndex
  if(index===undefined||col===undefined)return
  const from=state.doc.resolve(start+map.map[index*map.width+col]!),to=state.doc.resolve(start+map.map[row?index*map.width+map.width-1:(map.height-1)*map.width+col]!)
  editor.prosemirrorView.dispatch(state.tr.setSelection(row?CellSelection.rowSelection(from,to):CellSelection.colSelection(from,to)))
 }
 return <div className={'en-native-table-edge en-native-table-edge-'+props.orientation} data-selected={selected||undefined} style={style} onPointerDownCapture={guard} onDragStartCapture={guard} onClickCapture={select} onContextMenu={event=>{event.preventDefault();event.stopPropagation();if(current())event.currentTarget.querySelector<HTMLElement>('.bn-table-handle')?.click()}} aria-label={t(row?'行操作':'列操作')}><TableHandle {...props}><span className="en-native-table-a11y">{t(row?'行操作':'列操作')}</span><svg viewBox="0 0 18 8" width="18" height="8" aria-hidden="true"><circle cx="5" cy="4" r="1"/><circle cx="9" cy="4" r="1"/><circle cx="13" cy="4" r="1"/></svg></TableHandle></div>
}
function TableIcon(){return <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2.5" y="3" width="15" height="14" rx="2"/><path d="M2.5 8h15M8 8v9M2.5 12.5h15"/></svg>}

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
   // native 9px handle gutter, 34px control gutter and table border.
   const width=table?availableWidth(table):editor.domElement.clientWidth-46
   if(width>0)editor.updateBlock(block.id,{content:{...block.content,columnWidths:initialNativeTableColumnWidths(count,width)}})
  })
  return result
 })
}

/** Native table UI shares the real editor's commands, document and undo history. */
export function NativeTableControls({active=true,sessionId}:{active?:boolean;sessionId:string}){
 const editor:any=useBlockNoteEditor(),hover=useExtensionState(TableHandlesExtension),target=useEditorState({editor,selector:()=>selectedTable(editor),equalityFn:(a,b)=>a?.node===b?.node&&a?.row===b?.row&&a?.col===b?.col&&a?.id===b?.id})
 const [handleEpoch,setHandleEpoch]=useState(0),[enabled,setEnabled]=useState(active)
 const [menu,setMenu]=useState<Menu>(),[insertHover,setInsertHover]=useState<{kind:'row'|'column';coordinate:number}>(),[position,setPosition]=useState<{left:number;top:number;tableTop:number;tableLeft:number;tableRight:number;tableBottom:number;right:number;bottom:number;clipLeft:number;clipRight:number;noteLeft:number;noteRight:number;clipTop:number;clipBottom:number;actualBottom:number;resizeRight?:number;columns:{index:number;x:number}[];rows:{index:number;y:number}[]}>(),[widthText,setWidthText]=useState('')
 const layer=useMemo(()=>{const node=document.createElement('div');node.className='en-native-table-layer';node.setAttribute('popover','manual');node.dataset.noteTableSession=sessionId;return node},[sessionId])
 const nativeDragView=useRef<any>(),live=useRef(false),latest=useRef({active,target}),positionUpdate=useRef(()=>{}),menuLease=useRef<Target>(),trigger=useRef<HTMLButtonElement>(),drag=useRef<{id:number;startX:number;startWidth:number;maxWidth:number;next:number;target:Target;restore:()=>void;button:HTMLButtonElement}>()
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
  const gesture=drag.current;if(!gesture)return;drag.current=undefined;gesture.restore();if(live.current)positionUpdate.current()
  if(gesture.button.hasPointerCapture(gesture.id))gesture.button.releasePointerCapture(gesture.id)
  if(commit&&owns(gesture.target)&&gesture.next!==gesture.startWidth)writeWidths(gesture.target,resizeNativeTableColumnWidths(widthsFor(gesture.target),gesture.next))
 }
 const widthsFor=(value:Target)=>{
  const block=editor.getBlock(value.id),table=tableElement(editor,value.id)
  const measured=table?[...table.querySelectorAll<HTMLTableColElement>('colgroup col')].map(col=>col.getBoundingClientRect().width/(table.getBoundingClientRect().width/table.offsetWidth||1)):[]
  return resolveNativeTableColumnWidths(value.columns,block?.content.columnWidths,measured)
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
   if(scroll){const clip=scroll.getBoundingClientRect();layer.style.setProperty('--en-table-viewport-clip',`inset(${Math.max(0,clip.top)}px ${Math.max(0,window.innerWidth-clip.right)}px ${Math.max(0,window.innerHeight-clip.bottom)}px ${Math.max(0,clip.left)}px)`)}
   if(!allowed()||!table||!scroll){setPosition(undefined);setInsertHover(undefined);close();return}
   const rect=table.getBoundingClientRect(),geometry=noteViewport(table)
   if(!geometry){setPosition(undefined);setInsertHover(undefined);close();return}
   const {visible,outer,note}=geometry,clipLeft=Math.max(outer.left,note.left,0),clipRight=Math.min(outer.right,note.right,window.innerWidth),clipTop=Math.max(note.top,0),clipBottom=Math.min(note.bottom,window.innerHeight)
   const columns=[...table.querySelectorAll<HTMLTableColElement>('colgroup col')].map((col,index)=>({index,x:col.getBoundingClientRect().left})).filter(point=>point.index>0&&point.x>=clipLeft+12&&point.x<=clipRight-12)
   const rows=[...table.rows].map((row,index)=>({index,y:row.getBoundingClientRect().top})).filter(point=>point.index>0&&point.y>=clipTop+12&&point.y<=clipBottom-12)
   // Keep the toolbar in the note's existing right padding, never over the
   // preceding paragraph. The start boundaries share BlockMenu's lane; their
   // Add above/left commands remain available in the row/column menus.
   const toolbarLeft=Math.max(note.left+4,note.right-48)
   setPosition({left:toolbarLeft,top:Math.max(clipTop+6,Math.min(rect.top,clipBottom-34)),tableTop:visible.top,tableLeft:visible.left,tableRight:visible.right,tableBottom:visible.bottom,right:Math.min(rect.right,clipRight-34),bottom:Math.min(rect.bottom,clipBottom-24),clipLeft,clipRight,noteLeft:Math.max(0,note.left),noteRight:Math.min(window.innerWidth,note.right),clipTop,clipBottom,actualBottom:rect.bottom,resizeRight:rect.right<=clipRight+.5?rect.right:undefined,columns,rows})
  }
  const schedule=()=>{setInsertHover(undefined);cancelAnimationFrame(frame);frame=requestAnimationFrame(update)}
  positionUpdate.current=update;update();window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true)
  const observer=new ResizeObserver(schedule);if(editor.domElement)observer.observe(editor.domElement)
  const mutation=new MutationObserver(()=>{finishDrag(false);retireNativeUi();close();setHandleEpoch(epoch=>epoch+1);setEnabled(allowed());if(!allowed()){setPosition(undefined);if(layer.matches(':popover-open'))layer.hidePopover()}else schedule()});mutation.observe(document.body,{attributes:true,attributeOldValue:true,attributeFilter:['data-workspace-surface']})
  return()=>{if(positionUpdate.current===update)positionUpdate.current=()=>{};cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);observer.disconnect();mutation.disconnect()}
 },[editor,layer,target?.id,target?.node,active])
 useLayoutEffect(()=>{
  const show=allowed()&&!!(position||hover?.show)
  if(show&&!layer.matches(':popover-open'))layer.showPopover()
  if(!show&&layer.matches(':popover-open')){finishDrag(false);close();layer.hidePopover()}
 },[position,hover?.show,active,layer])
 useEffect(()=>{setInsertHover(undefined);if(menuLease.current&&(!owns(menuLease.current)||target?.row!==menuLease.current.row||target?.col!==menuLease.current.col))close();if(target)setWidthText(String(Math.round(widthsFor(target).reduce((a,b)=>a+b,0))))},[target?.node,target?.id,target?.row,target?.col])
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
   gesture.next=Math.max(gesture.target.columns*35,Math.min(gesture.maxWidth,Math.round(gesture.startWidth+(event.clientX-gesture.startX)/scale)))
   const widths=resizeNativeTableColumnWidths(widthsFor(gesture.target),gesture.next)
   table.querySelectorAll<HTMLTableColElement>('colgroup col').forEach((col,i)=>{col.style.width=widths[i]+'px'})
   table.style.setProperty('width',gesture.next+'px','important');table.style.minWidth='';table.style.setProperty('--default-cell-min-width','35px')
   positionUpdate.current()
  }
  const up=(event:PointerEvent)=>{if(drag.current?.id===event.pointerId)finishDrag(true)},cancel=(event:PointerEvent)=>{if(drag.current?.id===event.pointerId)finishDrag(false)},blur=()=>{finishDrag(false);retireNativeUi();close();setHandleEpoch(epoch=>epoch+1)}
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',blur)
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',blur)}
 },[editor,layer])
 // Native row/column submenus share the registered top layer. Their own
 // window-based collision handling must also respect the narrower note pane.
 useLayoutEffect(()=>{
  const scroll=editor.domElement?.closest('.en-document-scroll') as HTMLElement|null;if(!scroll)return
  let frame=0
  const fit=()=>{
   if(!allowed()||!layer.matches(':popover-open'))return
   const note=scroll.getBoundingClientRect(),left=Math.max(0,note.left)+4,right=Math.min(window.innerWidth,note.right)-4,top=Math.max(0,note.top)+4,bottom=Math.min(window.innerHeight,note.bottom)-4
   for(const popup of layer.querySelectorAll<HTMLElement>('[role="menu"]:not(.en-native-table-menu)')){
    const styles={maxWidth:Math.max(0,right-left)+'px',maxHeight:Math.max(0,bottom-top)+'px',minWidth:'0px',overflow:'auto',boxSizing:'border-box'}
    for(const [key,value]of Object.entries(styles))if((popup.style as any)[key]!==value)(popup.style as any)[key]=value
    const rect=popup.getBoundingClientRect(),x=Number(popup.dataset.enTableShiftX||0),y=Number(popup.dataset.enTableShiftY||0),nextX=x+Math.max(left,Math.min(rect.left,right-rect.width))-rect.left,nextY=y+Math.max(top,Math.min(rect.top,bottom-rect.height))-rect.top
    if(Math.abs(nextX-x)>.25||Math.abs(nextY-y)>.25){popup.dataset.enTableShiftX=String(nextX);popup.dataset.enTableShiftY=String(nextY);popup.style.translate=nextX+'px '+nextY+'px'}
   }
  }
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(fit)}
  const observer=new MutationObserver(schedule);observer.observe(layer,{subtree:true,childList:true,attributes:true,attributeFilter:['style']})
  const resize=new ResizeObserver(schedule);resize.observe(scroll);window.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule)
  return()=>{cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();window.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule)}
 },[editor,layer])
 useLayoutEffect(()=>{
  if(menu)layer.querySelector<HTMLButtonElement>('.en-native-table-menu button:not(:disabled)')?.focus({preventScroll:true})
 },[menu,layer])
 useLayoutEffect(()=>{
  const popup=layer.querySelector<HTMLElement>('.en-native-table-menu'),toolbar=layer.querySelector<HTMLElement>('.en-native-table-toolbar');if(!popup||!toolbar)return
  const rect=toolbar.getBoundingClientRect(),below=position!.clipBottom-rect.bottom-10,above=rect.top-position!.clipTop-10,down=below>=popup.scrollHeight||below>=above
  popup.style.left=Math.max(position!.noteLeft+4,Math.min(rect.left,position!.noteRight-popup.offsetWidth-4))+'px';popup.style.top=(down?rect.bottom+5:Math.max(position!.clipTop+4,rect.top-Math.min(popup.scrollHeight,above)-5))+'px';popup.style.maxHeight=Math.max(40,down?below:above)+'px'
 },[menu,position,layer])
 const openMenu=(kind:Menu,event:React.MouseEvent<HTMLButtonElement>)=>{
  if(!owns(target))return
  trigger.current=event.currentTarget;if(menu===kind)return close(true)
  menuLease.current=target;setMenu(kind)

 }
 const run=(command:Command)=>{const value=menuLease.current;if(!owns(value))return close();stopCapture(editor);editor.exec((state:any,dispatch:any,view:any)=>command(state,dispatch,view));stopCapture(editor);close();restoreEditor()}
 const changeWidth=(kind:'fit'|'equal')=>{const value=menuLease.current;if(!owns(value))return close();const table=tableElement(editor,value!.id)!;writeWidths(value!,chooseNativeTableColumnWidths(value!.columns,kind==='fit'?availableWidth(table):widthsFor(value!).reduce((a,b)=>a+b,0)));close()}
 const toggleHeader=(kind:'headerRows'|'headerCols')=>{const value=menuLease.current;if(!owns(value))return close();const block=editor.getBlock(value!.id);stopCapture(editor);editor.updateBlock(value!.id,{content:{...block.content,[kind]:block.content[kind]?0:1}});stopCapture(editor);close();restoreEditor()}
 const removeTable=()=>{const value=menuLease.current;if(!owns(value))return close();stopCapture(editor);editor.removeBlocks([value!.id]);stopCapture(editor);close();restoreEditor()}
 const extend=(kind:'row'|'column',at?:number)=>{
  if(!owns(target))return
  const value=target!,widths=widthsFor(value),info=getNodeById(value.id,editor.prosemirrorState.doc)!,index=at??(kind==='row'?value.rows:value.columns),rect={map:TableMap.get(value.node),tableStart:info.posBeforeNode+2,table:value.node,left:0,top:0,right:value.columns,bottom:value.rows}
  if(!Number.isSafeInteger(index)||index<0||index>(kind==='row'?value.rows:value.columns))return
  const nextWidths=widths.slice();if(kind==='column')nextWidths.splice(index,0,100)
  stopCapture(editor);editor.transact((tr:any)=>{
   if(kind==='column')addColumn(tr,rect,index);else addRow(tr,rect,index)
   // Persist real native cell attributes in the same undo step. Only the new
   // column gets a natural width; all existing custom widths are retained.
   const current=getNodeById(value.id,tr.doc)!,table=current.node.firstChild!,map=TableMap.get(table),start=current.posBeforeNode+2,seen=new Set<number>()
   for(const offset of map.map){if(seen.has(offset))continue;seen.add(offset);const cell=table.nodeAt(offset)!,column=map.findCell(offset).left;tr.setNodeMarkup(start+offset,undefined,{...cell.attrs,colwidth:nextWidths.slice(column,column+cell.attrs.colspan)})}
   const row=kind==='row'?index:Math.min(value.row,map.height-1),column=kind==='column'?index:Math.min(value.col,map.width-1)
   tr.setSelection(Selection.near(tr.doc.resolve(start+map.map[row*map.width+column]!+2))).scrollIntoView()
  });stopCapture(editor);setInsertHover(undefined);restoreEditor()
 }
 const startDrag=(event:React.PointerEvent<HTMLButtonElement>)=>{
  if(event.button!==0||!owns(target)||drag.current)return
  event.preventDefault();event.stopPropagation();close()
  const table=tableElement(editor,target!.id)!,cols=[...table.querySelectorAll('colgroup col')],style=table.getAttribute('style'),colStyles=cols.map(col=>col.getAttribute('style')),startWidth=widthsFor(target!).reduce((a,b)=>a+b,0)
  drag.current={id:event.pointerId,startX:event.clientX,startWidth,maxWidth:Math.max(startWidth,availableWidth(table)),next:startWidth,target:target!,button:event.currentTarget,restore:()=>{if(style===null)table.removeAttribute('style');else table.setAttribute('style',style);cols.forEach((col,i)=>{if(colStyles[i]===null)col.removeAttribute('style');else col.setAttribute('style',colStyles[i]!)})}}
  event.currentTarget.setPointerCapture(event.pointerId)
 }
 const menuKeyboard=(event:React.KeyboardEvent)=>{
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return
  event.preventDefault();const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=items.indexOf(document.activeElement as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus()
 }
 return <><style>{nativeTableStyles}</style>{active&&enabled?<TableHandlesController key={handleEpoch} portalElement={layer} tableHandle={EdgeTableHandle} extendButton={NoExtendButton}/>:null}{position&&target&&allowed()?createPortal(<>
  <div className="en-native-table-toolbar" role="toolbar" aria-label={t('原生表格操作')} style={{left:position.left,top:position.top}} onPointerDown={event=>{if((event.target as HTMLElement).closest('button'))event.preventDefault();event.stopPropagation()}}>
   <button aria-label={t('表格操作')} aria-expanded={!!menu} onClick={event=>openMenu('table',event)}><TableIcon/><svg viewBox="0 0 8 8" width="8" height="8" aria-hidden="true" fill="currentColor"><circle cx="2" cy="2" r=".7"/><circle cx="6" cy="2" r=".7"/><circle cx="2" cy="6" r=".7"/><circle cx="6" cy="6" r=".7"/></svg></button>
   {menu?<div className="en-native-table-menu" role="menu" aria-label={t(menu==='table'?'表格操作':menu==='row'?'行操作':'列操作')} onKeyDown={menuKeyboard}>
    {menu==='table'?<><button role="menuitemcheckbox" aria-checked={!!editor.getBlock(target.id)?.content.headerRows} onClick={()=>toggleHeader('headerRows')}>{t('标题行')}<span aria-hidden="true">{editor.getBlock(target.id)?.content.headerRows?'✓':''}</span></button><button role="menuitemcheckbox" aria-checked={!!editor.getBlock(target.id)?.content.headerCols} onClick={()=>toggleHeader('headerCols')}>{t('标题列')}<span aria-hidden="true">{editor.getBlock(target.id)?.content.headerCols?'✓':''}</span></button><hr/><button role="menuitem" onClick={()=>changeWidth('fit')}>{t('适应正文')}</button><button role="menuitem" onClick={()=>changeWidth('equal')}>{t('均分列宽')}</button><label>{t('表格宽度')} <input aria-label={t('表格宽度')} type="number" min={target.columns*35} max={100000} value={widthText} onChange={event=>setWidthText(event.target.value)} onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter'){const width=Number(widthText),value=menuLease.current;if(owns(value)&&Number.isFinite(width)&&width>=value!.columns*35&&width<=100000){writeWidths(value!,resizeNativeTableColumnWidths(widthsFor(value!),width));close()}}}}/> px</label><hr/><button role="menuitem" aria-label={t('行操作')} onClick={()=>setMenu('row')}>{t('当前行')}<span aria-hidden="true">›</span></button><button role="menuitem" aria-label={t('列操作')} onClick={()=>setMenu('column')}>{t('当前列')}<span aria-hidden="true">›</span></button><hr/><button role="menuitem" onClick={removeTable}>{t('删除表格')}</button></>:menu==='row'?<>
     <button role="menuitem" onClick={()=>run(addRowBefore)}>{t('在上方插入行')}</button><button role="menuitem" onClick={()=>run(addRowAfter)}>{t('在下方插入行')}</button><button role="menuitem" disabled={target.row===0} onClick={()=>run(moveTableRow({from:target.row,to:target.row-1}))}>{t('上移此行')}</button><button role="menuitem" disabled={target.row===target.rows-1} onClick={()=>run(moveTableRow({from:target.row,to:target.row+1}))}>{t('下移此行')}</button><button role="menuitem" disabled={target.rows===1} onClick={()=>run(deleteRow)}>{t('删除此行')}</button>
    </>:<><button role="menuitem" onClick={()=>run(addColumnBefore)}>{t('在左侧插入列')}</button><button role="menuitem" onClick={()=>run(addColumnAfter)}>{t('在右侧插入列')}</button><button role="menuitem" disabled={target.col===0} onClick={()=>run(moveTableColumn({from:target.col,to:target.col-1}))}>{t('左移此列')}</button><button role="menuitem" disabled={target.col===target.columns-1} onClick={()=>run(moveTableColumn({from:target.col,to:target.col+1}))}>{t('右移此列')}</button><button role="menuitem" disabled={target.columns===1} onClick={()=>run(deleteColumn)}>{t('删除此列')}</button></>}
   </div>:null}
  </div>
  {position.resizeRight!==undefined?<button className="en-native-table-width-handle" role="separator" aria-label={t('调整表格整体宽度')} aria-orientation="vertical" tabIndex={0} style={{left:position.resizeRight-10,top:Math.max(position.tableTop,position.bottom-20),height:20}} onPointerDown={startDrag} onDoubleClick={event=>{event.preventDefault();event.stopPropagation();if(owns(target))writeWidths(target,chooseNativeTableColumnWidths(target.columns,availableWidth(tableElement(editor,target.id)!)))}} onLostPointerCapture={()=>finishDrag(false)} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home'].includes(event.key)||!owns(target))return;event.preventDefault();event.stopPropagation();const widths=widthsFor(target),table=tableElement(editor,target.id)!;writeWidths(target,event.key==='Home'?chooseNativeTableColumnWidths(target.columns,availableWidth(table)):resizeNativeTableColumnWidths(widths,widths.reduce((a,b)=>a+b,0)+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?40:8)),false)}}><svg viewBox="0 0 8 16" width="8" height="16" aria-hidden="true"><path d="M3 3v10M5 3v10" stroke="currentColor" strokeWidth="1"/></svg></button>:null}
  <button className="en-native-table-add bn-extend-button-add-remove-columns" aria-label={t('添加列')} style={{left:position.right+14,top:Math.max(position.tableTop,Math.min((position.tableTop+position.bottom)/2-9,position.clipBottom-22))}} onPointerDown={event=>{event.preventDefault();event.stopPropagation()}} onClick={()=>extend('column')}>+</button>
  {position.columns.map(point=><button key={'column-'+point.index} data-note-table-insert-column={point.index} className="en-native-table-boundary en-native-table-boundary-column" tabIndex={-1} aria-label={t('在此处插入列')} style={{left:point.x-11,top:Math.max(position.clipTop+2,position.tableTop-24)}} onPointerEnter={()=>setInsertHover({kind:'column',coordinate:point.x})} onPointerLeave={()=>setInsertHover(undefined)} onPointerDown={event=>{event.preventDefault();event.stopPropagation()}} onClick={()=>extend('column',point.index)}>+</button>)}
  {position.rows.map(point=><button key={'row-'+point.index} data-note-table-insert-row={point.index} className="en-native-table-boundary en-native-table-boundary-row" tabIndex={-1} aria-label={t('在此处插入行')} style={{left:Math.max(position.noteLeft+2,position.tableLeft-24),top:point.y-11}} onPointerEnter={()=>setInsertHover({kind:'row',coordinate:point.y})} onPointerLeave={()=>setInsertHover(undefined)} onPointerDown={event=>{event.preventDefault();event.stopPropagation()}} onClick={()=>extend('row',point.index)}>+</button>)}
  {insertHover?<div className="en-native-table-insert-line" style={insertHover.kind==='column'?{left:insertHover.coordinate,top:position.tableTop,width:1,height:position.tableBottom-position.tableTop}:{left:position.tableLeft,top:insertHover.coordinate,width:position.tableRight-position.tableLeft,height:1}}/>:null}
  {position.actualBottom+22<=position.clipBottom?<button className="en-native-table-add bn-extend-button-add-remove-rows" aria-label={t('添加行')} style={{left:Math.max(position.clipLeft+2,(position.tableLeft+position.right)/2-9),top:position.actualBottom+2}} onPointerDown={event=>{event.preventDefault();event.stopPropagation()}} onClick={()=>extend('row')}>+</button>:null}
 </>,layer):null}</>
}
