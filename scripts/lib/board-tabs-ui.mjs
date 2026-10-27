export function BoardTabsIcon({name}) {return react_jsx_runtime.jsx('span',{className:'ew-board-tabs-icon','data-tabs-icon':name,'aria-hidden':true})}
export function BoardTabsLayer({rootRef,workspace,sessionId,snapshot,readOnly}) {
 const {jsx,jsxs}=react_jsx_runtime,nav=boardTabsNode(snapshot),[host,setHost]=react.useState(null),[menu,setMenu]=react.useState(null),[settings,setSettings]=react.useState(false),[remove,setRemove]=react.useState(false),[notice,setNotice]=react.useState(null),[theme,setTheme]=react.useState('light'),trigger=react.useRef(null),list=react.useRef(null)
 const active=workspace.getActiveBoardTab(),close=()=>{setSettings(false);setRemove(false);trigger.current?.focus({preventScroll:true})}
 react.useEffect(()=>{
  const root=rootRef.current;if(!root)return
  setHost(root.querySelector('[data-research-content-layer]')||root)
  const sync=()=>setTheme(root.dataset.workbenchStyle||(document.body.hasAttribute('data-ds-dark-theme')?'dark':'light'))
  sync();const observer=new MutationObserver(sync);observer.observe(root,{attributes:true,attributeFilter:['data-workbench-style']});observer.observe(document.body,{attributes:true,attributeFilter:['data-ds-dark-theme']});return()=>observer.disconnect()
 },[workspace])
 react.useLayoutEffect(()=>{
  const root=rootRef.current;if(!root)return
  const visible=new Set([...workspace.getVisibleBoardSnapshot().files,...workspace.getVisibleBoardSnapshot().artifacts].map(n=>n.id))
  for(const card of root.querySelectorAll('[data-research-node-id]')){const hidden=Boolean(nav&&!visible.has(card.getAttribute('data-research-node-id')));card.toggleAttribute('data-board-tab-hidden',hidden);card.inert=hidden}
  const selected=list.current?.querySelector('[aria-selected=true]');if(selected){const left=selected.offsetLeft,right=left+selected.offsetWidth;if(left<list.current.scrollLeft)list.current.scrollLeft=left;if(right>list.current.scrollLeft+list.current.clientWidth)list.current.scrollLeft=right-list.current.clientWidth}
 },[snapshot,active,host])
 react.useEffect(()=>{const root=rootRef.current;if(!root)return;return installBoardTabsDrag(root,workspace,readOnly,detail=>setNotice({...detail,token:Date.now()}))},[workspace,readOnly])
 react.useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(null),5000);return()=>window.clearTimeout(timer)},[notice])
 react.useEffect(()=>{if(!menu)return;const dismiss=e=>{if(!e.target.closest?.('[data-board-tabs-menu]')&&!trigger.current?.contains(e.target))setMenu(null)},key=e=>{if(e.key==='Escape'){e.preventDefault();setMenu(null);trigger.current?.focus()}};document.addEventListener('pointerdown',dismiss,true);document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('pointerdown',dismiss,true);document.removeEventListener('keydown',key,true)}},[menu])
 if(!nav||!host)return null
 const spec=nav.containerSpec
 const select=id=>{setMenu(null);workspace.selectBoardTab(id)}
 const keys=e=>{const buttons=[...list.current.querySelectorAll('[role=tab]')],index=buttons.indexOf(document.activeElement);let to;if(e.key==='ArrowRight')to=(index+1)%buttons.length;if(e.key==='ArrowLeft')to=(index-1+buttons.length)%buttons.length;if(e.key==='Home')to=0;if(e.key==='End')to=buttons.length-1;if(to!==undefined){e.preventDefault();e.stopPropagation();buttons[to].focus();buttons[to].scrollIntoView?.({block:'nearest',inline:'nearest'})}}
 const confirm=jsxs('div',{className:'ew-board-tabs-confirm',children:[jsx('p',{children:'移除页签组件后，所有页签中的组件将合回当前看板，内容和连接保留。'}),jsxs('footer',{children:[jsx('button',{type:'button',onClick:close,children:'取消'}),jsx('button',{type:'button',disabled:readOnly,onClick:()=>{if(workspace.removeBoardTabs())close()},children:'移除页签组件'})]})]})
 return jsxs(react.Fragment,{children:[react_dom.createPortal(jsxs('div',{'data-board-tabs-nav':'',className:'ew-board-tabs-nav','data-board-tabs-theme':theme,style:{width:Math.max(1,(snapshot.canvasSize.availableWidth||snapshot.canvasSize.width||1000)-24)},onPointerDown:e=>e.stopPropagation(),children:[jsx('div',{ref:list,role:'tablist','aria-label':'看板页签',onKeyDown:keys,className:'ew-board-tabs-list',children:spec.tabs.map(t=>jsx('button',{type:'button',role:'tab',id:'board-tab-'+t.id,'aria-selected':t.id===active,tabIndex:t.id===active?0:-1,title:t.name,'aria-controls':'board-page-'+sessionId,'data-board-tab':t.id,onClick:()=>select(t.id),children:t.name},t.id))}),jsx('button',{ref:trigger,type:'button','data-board-tabs-more':'','aria-label':'页签更多操作','aria-haspopup':'menu','aria-expanded':Boolean(menu),onClick:e=>{const r=e.currentTarget.getBoundingClientRect();setMenu(menu?null:{left:Math.max(8,Math.min(window.innerWidth-214,r.right-206)),top:r.bottom+5})},children:jsx(BoardTabsIcon,{name:'tabs-more'})})]}),host),
 menu&&react_dom.createPortal(jsxs('div',{role:'menu','aria-label':'页签更多操作','data-board-tabs-menu':'','data-board-tabs-theme':theme,className:'ew-grid-menu ew-board-tabs-menu',style:menu,onKeyDown:e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=[...e.currentTarget.querySelectorAll('button')],i=items.indexOf(document.activeElement);items[e.key==='End'?items.length-1:e.key==='Home'?0:(i+(e.key==='ArrowUp'?-1:1)+items.length)%items.length]?.focus()}},ref:el=>{if(el&&!el.contains(document.activeElement))el.querySelector('button')?.focus({preventScroll:true})},children:[jsxs('button',{type:'button',role:'menuitem',disabled:readOnly,onClick:()=>{setMenu(null);setSettings(true)},children:[jsx(WorkbenchIcon,{name:'settings'}),jsx('span',{children:'页签设置'})]}),jsxs('button',{type:'button',role:'menuitem',disabled:readOnly,onClick:()=>{setMenu(null);setRemove(true)},children:[jsx(WorkbenchIcon,{name:'remove'}),jsx('span',{children:'移除页签组件'})]})]}),document.body),
 settings&&jsx(BoardTabsSettings,{nav,workspace,readOnly,theme,onClose:close}),
 remove&&jsx(BoardTabsModal,{title:'移除页签组件',theme,onClose:close,children:confirm}),
 notice&&jsx(WorkbenchToolbar,{rootRef,sessionId,availableWidth:snapshot.canvasSize.availableWidth,bottomOffset:86,role:'status','data-workbench-notice':'','data-board-tabs-notice':'',children:[jsx('span',{children:notice.message},'text'),notice.undo&&jsx('button',{type:'button',onClick:()=>{const current=workspace.getSnapshot();if(JSON.stringify([current.files,current.artifacts])===notice.signature)workspace.undo();setNotice(null)},children:'撤销'},'undo')]})
 ]})
}
export function BoardTabsModal({title,theme,onClose,children}) {
 const {jsx,jsxs}=react_jsx_runtime,ref=react.useRef(null),id=react.useId()
 react.useLayoutEffect(()=>{const previous=document.activeElement,root=ref.current;root.querySelector('input,button')?.focus({preventScroll:true});const key=e=>{if([...document.querySelectorAll('.ew-board-tabs-overlay')].at(-1)!==root.parentElement)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();onClose();return}if(e.key==='Tab'){const items=[...root.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')],first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('keydown',key,true);previous?.isConnected&&previous.focus({preventScroll:true})}},[])
 return react_dom.createPortal(jsx('div',{className:'ew-board-tabs-overlay','data-board-tabs-theme':theme,onPointerDown:e=>{e.stopPropagation();if(e.target===e.currentTarget)onClose()},children:jsxs('section',{ref,role:'dialog','aria-modal':true,'aria-labelledby':id,className:'ew-board-tabs-dialog',onPointerDown:e=>e.stopPropagation(),children:[jsxs('header',{children:[jsx('h2',{id,children:title}),jsx('button',{type:'button','aria-label':'关闭'+title,className:'ew-board-tabs-close',onClick:onClose,children:'×'})]}),children]})}),document.body)
}
export function BoardTabsSettings({nav,workspace,readOnly,theme,onClose}) {
 const {jsx,jsxs}=react_jsx_runtime,[draft,setDraft]=react.useState(()=>nav.containerSpec.tabs.map(t=>({id:t.id,name:t.name}))),[revision]=react.useState(nav.containerSpec.revision),[error,setError]=react.useState(''),[removed,setRemoved]=react.useState([]),[confirm,setConfirm]=react.useState(null),[dragging,setDragging]=react.useState(null),[drop,setDrop]=react.useState(null),list=react.useRef(null),pendingFocus=react.useRef(null)
 const issue=boardTabsIssue(draft.map(t=>({...t,nodeIds:[]})))
 react.useLayoutEffect(()=>{if(pendingFocus.current){const input=list.current?.querySelector('[data-tab-name="'+CSS.escape(pendingFocus.current)+'"]');input?.focus();input?.select();input?.scrollIntoView?.({block:'nearest'});pendingFocus.current=null}},[draft.length])
 const remove=t=>{setRemoved(rows=>[...rows,{tab:t,index:draft.findIndex(row=>row.id===t.id)}]);setDraft(rows=>rows.filter(row=>row.id!==t.id));setConfirm(null);setError('')}
 const del=t=>{if(draft.length===1||readOnly)return;const live=boardTabsNode(workspace.getSnapshot())?.containerSpec.tabs.find(row=>row.id===t.id);if(live?.nodeIds.length)setConfirm({tab:t,count:live.nodeIds.length});else remove(t)}
 const move=(from,to)=>{if(from===to||to<0||to>=draft.length)return;setDraft(rows=>{const next=[...rows],index=next.findIndex(t=>t.id===from);if(index<0)return rows;next.splice(to,0,...next.splice(index,1));return next});setError('')}
 const save=()=>{if(issue){setError(issue);const names=new Set(),bad=draft.find(t=>{const name=t.name.trim().normalize('NFKC').toLocaleLowerCase(),invalid=!name||[...t.name.trim()].length>32||/[\n\r]/.test(t.name)||names.has(name);names.add(name);return invalid});list.current?.querySelector('[data-tab-name="'+CSS.escape(bad?.id||draft[0]?.id||'')+'"]')?.focus();return}if(!workspace.saveBoardTabs(revision,draft)){setError('看板页签已变化或保存失败，请保留当前修改并重试；如有其他编辑，请关闭后重新打开。');return}onClose()}
 return jsx(BoardTabsModal,{title:'页签设置',theme,onClose,children:jsxs(react.Fragment,{children:[jsx('p',{className:'ew-board-tabs-description',children:'拖动调整顺序，点击名称改名'}),jsx('div',{ref:list,className:'ew-board-tabs-settings-list','data-board-tabs-settings-list':'',children:draft.map((t,index)=>jsxs('div',{className:'ew-board-tabs-row','data-tab-row':t.id,'data-tab-insert':drop===t.id||undefined,onDragOver:e=>{if(!dragging)return;e.preventDefault();setDrop(t.id)},onDrop:e=>{e.preventDefault();if(dragging)move(dragging,index);setDragging(null);setDrop(null)},children:[jsx('button',{type:'button',className:'ew-board-tabs-grip',draggable:!readOnly,'aria-label':'调整'+t.name+'顺序',title:'拖动排序，或使用上下方向键',onDragStart:e=>{setDragging(t.id);e.dataTransfer?.setData('text/plain',t.id);if(e.dataTransfer)e.dataTransfer.effectAllowed='move'},onDragEnd:()=>{setDragging(null);setDrop(null)},onKeyDown:e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();move(t.id,index+(e.key==='ArrowUp'?-1:1))}if(e.key==='Escape'){setDragging(null);setDrop(null)}},children:jsx(BoardTabsIcon,{name:'tabs-grip'})}),jsx('input',{'data-tab-name':t.id,'aria-label':(t.name||'未命名页签')+' 名称','aria-invalid':Boolean(error&&issue),disabled:readOnly,value:t.name,onInput:e=>{setDraft(rows=>rows.map(row=>row.id===t.id?{...row,name:e.target.value}:row));setError('')}}),jsx('button',{type:'button',className:'ew-board-tabs-delete','aria-label':'删除'+t.name,title:draft.length===1?'至少保留一个页签':'删除'+t.name,disabled:readOnly||draft.length===1,onClick:()=>del(t),children:jsx(WorkbenchIcon,{name:'remove'})})]},t.id))}),
 jsxs('button',{type:'button',className:'ew-board-tabs-add',disabled:readOnly||draft.length>=100,onClick:()=>{let n=1;while(draft.some(t=>t.name.trim()==='页签 '+n))n++;const tab={id:createResearchCanvasArtifactId(),name:'页签 '+n};pendingFocus.current=tab.id;setDraft(rows=>[...rows,tab]);setError('')},children:[jsx(FinancialLibraryIcon,{name:'plus'}),jsx('span',{children:'新增页签'})]}),
 removed.length>0&&jsxs('div',{className:'ew-board-tabs-undo',children:[jsx('span',{children:'已删除页签及组件'}),jsx('button',{type:'button',onClick:()=>{const entry=removed.at(-1);setDraft(rows=>{const next=[...rows];next.splice(Math.min(entry.index,next.length),0,entry.tab);return next});setRemoved(rows=>rows.slice(0,-1));setError('')},children:'撤销'})]}),
 error&&jsx('p',{role:'alert',className:'ew-board-tabs-error',children:error}),
 jsxs('footer',{className:'ew-board-tabs-actions',children:[jsx('span',{children:'修改在保存后生效'}),jsx('button',{type:'button','data-board-tabs-cancel':'',onClick:onClose,children:'取消'}),jsx('button',{type:'button','data-board-tabs-save':'',disabled:readOnly,onClick:save,children:'保存'})]}),
 confirm&&jsx(BoardTabsModal,{title:'删除页签及组件',theme,onClose:()=>setConfirm(null),children:jsxs('div',{className:'ew-board-tabs-confirm',children:[jsx('p',{children:'删除「'+confirm.tab.name+'」及其中 '+confirm.count+' 个组件？如需保留组件，请取消并回到看板复制。'}),jsxs('footer',{children:[jsx('button',{type:'button',onClick:()=>setConfirm(null),children:'取消'}),jsx('button',{type:'button',className:'ew-board-tabs-danger',onClick:()=>remove(confirm.tab),children:'删除页签及组件'})]})]})})
 ]})})
}

export function boardTabsLibraryDrag(event,{workspace,rootRef,onPlaced,readOnly}) {
 if(event.button!==0||readOnly)return
 const doc=event.currentTarget.ownerDocument,view=doc.defaultView,start={x:event.clientX,y:event.clientY},pointerId=event.pointerId,root=rootRef.current
 let preview=null,moved=false
 const inside=e=>{const r=root.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom}
 const move=e=>{if(e.pointerId!==pointerId)return;if(!moved&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<6)return;moved=true;e.preventDefault();if(!preview){preview=doc.createElement('div');preview.className='ew-board-tabs-library-preview';preview.textContent='页签 1　　页签 2';doc.body.append(preview)}const r=root.getBoundingClientRect();Object.assign(preview.style,{left:r.left+12+'px',top:r.top+12+'px',width:Math.max(1,r.width-24)+'px',opacity:inside(e)?'1':'.5'})}
 const cleanup=()=>{preview?.remove();view.removeEventListener('pointermove',move,true);view.removeEventListener('pointerup',up,true);view.removeEventListener('pointercancel',cancel,true);view.removeEventListener('keydown',key,true);view.removeEventListener('blur',cancel)}
 const suppress=()=>doc.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation()},{capture:true,once:true})
 const up=e=>{if(e.pointerId!==pointerId)return;if(moved){e.preventDefault();e.stopImmediatePropagation();suppress();if(inside(e)){workspace.createBoardTabs();onPlaced()}}cleanup()}
 const cancel=()=>{if(moved)suppress();cleanup()},key=e=>{if(e.key==='Escape'){e.preventDefault();cancel()}}
 view.addEventListener('pointermove',move,true);view.addEventListener('pointerup',up,true);view.addEventListener('pointercancel',cancel,true);view.addEventListener('keydown',key,true);view.addEventListener('blur',cancel)
}

export function installBoardTabsDrag(root,workspace,readOnly,onNotice) {
 const doc=root.ownerDocument,view=doc.defaultView,grid=createResearchGrid()
 let op=null,frame=0,last=null
 const settling=new Set()
 const clearTargets=()=>root.querySelectorAll('[data-board-tab]').forEach(el=>{el.removeAttribute('data-tab-accept');el.removeAttribute('data-tab-target')})
 const cleanup=(keepPreview=false)=>{if(!op)return;op.card.removeAttribute('data-board-tabs-drag-source');if(!keepPreview){op.position.remove();op.preview.remove();op.caption.remove()}op.tip.remove();clearTargets();root.removeAttribute('data-grid-operation');if(frame)view.cancelAnimationFrame(frame);frame=0;op=null;last=null}
 const settle=(current,duration=220)=>{const stop=animateBoardTabsDrop(current,root,workspace,duration,()=>settling.delete(stop));settling.add(stop)}
 const inBoard=e=>{const r=root.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom}
 const sample=e=>{
  if(!op)return
  const nav=boardTabsNode(workspace.getSnapshot());if(!nav||workspace.getActiveBoardTab()!==op.source){cleanup();return}
  last=e;op.target=null
  const bar=root.querySelector('[data-board-tabs-nav]'),r=bar?.getBoundingClientRect(),distance=r?Math.max(r.left-e.clientX,e.clientX-r.right,r.top-e.clientY,e.clientY-r.bottom,0):Infinity
  op.small=distance<=(op.small?96:64)
  const scale=op.small?Math.min(1,240/op.rect.width):1,w=op.rect.width*scale,h=op.rect.height*scale
  const left=op.small?Math.max(8,Math.min(view.innerWidth-w-8,e.clientX+16)):op.rect.left+e.clientX-op.start.x
  const top=op.small?Math.max(8,Math.min(view.innerHeight-h-8,Math.max((r?.bottom??0)+12,e.clientY+16))):op.rect.top+e.clientY-op.start.y
  // Pointer following and the morph have separate compositor transforms. The
  // pointer never waits for the 160ms size/offset transition to catch up.
  op.position.style.transform='translate3d('+e.clientX+'px,'+e.clientY+'px,0)'
  op.preview.style.transform='translate3d('+(left-e.clientX)+'px,'+(top-e.clientY)+'px,0) scale('+scale+')'
  Object.assign(op.caption.style,{transform:'translate3d('+(left-e.clientX+8)+'px,'+(top-e.clientY+4)+'px,0)',opacity:op.small?'1':'0'})
  op.preview.toggleAttribute('data-thumbnail',op.small)
  clearTargets()
  for(const tab of root.querySelectorAll('[data-board-tab]')){
   const target=nav.containerSpec.tabs.find(t=>t.id===tab.dataset.boardTab)
   if(!target||target.id===op.source||readOnly)continue
   tab.setAttribute('data-tab-accept','')
   const bounds=tab.getBoundingClientRect()
   if(e.clientX>=bounds.left&&e.clientX<=bounds.right&&e.clientY>=bounds.top&&e.clientY<=bounds.bottom){op.target=target;tab.setAttribute('data-tab-target','')}
  }
  op.tip.hidden=!op.target
  if(op.target){op.tip.textContent='松开移至「'+op.target.name+'」';const tipWidth=op.tip.offsetWidth||180,beside=left+w+8+tipWidth<=view.innerWidth-8;Object.assign(op.tip.style,{left:(beside?left+w+8:Math.max(8,Math.min(view.innerWidth-tipWidth-8,left)))+'px',top:Math.max(8,Math.min(view.innerHeight-40,beside?top:top+h+8))+'px'})}
 }
 const autoScroll=()=>{frame=0;if(!op||!last)return;const r=root.getBoundingClientRect(),y=last.clientY-r.top,delta=y<48?-Math.ceil((48-y)/4):y>r.height-64?Math.ceil((y-r.height+64)/4):0;if(delta){const before=root.scrollTop;root.scrollTop=Math.max(0,Math.min(Math.max(0,root.scrollHeight-root.clientHeight),before+delta));if(root.scrollTop!==before)sample(last)}if(op)frame=view.requestAnimationFrame(autoScroll)}
 const down=e=>{
  if(op||readOnly||e.button!==0||e.shiftKey||e.metaKey||!boardTabsNode(workspace.getSnapshot())||!root.contains(e.target))return
  const handle=e.target.closest?.('[data-workbench-drag-handle]');if(!handle||e.target.closest?.('button,input,textarea,a,select,[contenteditable=true]'))return
  const card=handle.closest('[data-research-node-id]'),id=card?.getAttribute('data-research-node-id'),snapshot=workspace.getSnapshot(),cell=workspace.getWorkbenchCells().find(c=>c.id===id)
  if(!card||!cell||card.hasAttribute('data-research-geometry-blocked')||card.hasAttribute('open'))return
  e.preventDefault();e.stopImmediatePropagation();root.focus({preventScroll:true});workspace.updateSelection([id],'replace')
  const rect=card.getBoundingClientRect(),position=doc.createElement('div'),preview=doc.createElement('div'),clone=card.cloneNode(true),tip=doc.createElement('div'),caption=doc.createElement('div'),theme=root.dataset.workbenchStyle||'light'
  position.className='ew-board-tabs-drag-position';position.dataset.boardTabsTheme=theme;caption.className='ew-board-tabs-drag-caption';caption.textContent=card.querySelector('.ew-grid-title')?.textContent||snapshot.artifacts.find(n=>n.id===id)?.title||'组件'
  preview.className='ew-board-tabs-drag-preview';preview.dataset.eworkGrid='';preview.dataset.workbenchStyle=theme;preview.dataset.boardTabsTheme=theme;preview.setAttribute('aria-hidden','true');Object.assign(preview.style,{width:rect.width+'px',height:rect.height+'px'})
  clone.removeAttribute('id');clone.removeAttribute('data-grid-active');for(const el of clone.querySelectorAll('[id]'))el.removeAttribute('id')
  // Never open a second native/web media session in a transient drag preview.
  for(const el of clone.querySelectorAll('iframe,video,audio,[data-research-native-web]')){const summary=doc.createElement('div');summary.textContent=snapshot.artifacts.find(n=>n.id===id)?.excerpt||'组件预览';summary.style.cssText='padding:20px;white-space:pre-wrap;font:12px/1.6 system-ui;overflow:hidden';el.replaceWith(summary)}
  preview.append(clone);position.append(preview,caption);tip.className='ew-board-tabs-drag-tip';tip.dataset.boardTabsTheme=theme;tip.hidden=true;doc.body.append(position,tip);card.setAttribute('data-board-tabs-drag-source','');root.setAttribute('data-grid-operation','move')
  op={id,cell,cells:workspace.getWorkbenchCells(),visible:workspace.getWorkbenchVisibleCells(),source:workspace.getActiveBoardTab(),rect,position,preview,caption,tip,card,pointerId:e.pointerId,start:{x:e.clientX,y:e.clientY,scroll:root.scrollTop},small:false,target:null}
  sample(e);frame=view.requestAnimationFrame(autoScroll)
 }
 const move=e=>{if(!op||e.pointerId!==op.pointerId)return;e.preventDefault();e.stopImmediatePropagation();sample(e)}
 const up=e=>{
  if(!op||e.pointerId!==op.pointerId)return;e.preventDefault();e.stopImmediatePropagation();sample(e);if(!op)return
  const current=op,target=op.target,blocked=current.card.hasAttribute('data-research-geometry-blocked')||JSON.stringify(workspace.getWorkbenchCells())!==JSON.stringify(current.cells);cleanup(true);if(blocked){settle(current,180);onNotice({message:'组件位置或占用状态已变化，移动已取消'});return}
  if(target){
   if(workspace.moveToBoardTab([current.id],target.id)){const next=workspace.getSnapshot();onNotice({message:'已移至「'+target.name+'」',undo:true,signature:JSON.stringify([next.files,next.artifacts])});settle(current)}else{settle(current,180);onNotice({message:'目标页签已变化或无法容纳组件，移动已取消'})}
  }else if(inBoard(e)){
   const width=workspace.getSnapshot().canvasSize.availableWidth||root.clientWidth,m=grid.metrics(width),dx=(e.clientX-current.start.x)/m.step,dy=(e.clientY-current.start.y+root.scrollTop-current.start.scroll)/m.rowStep
   if(Math.abs(dx)+Math.abs(dy)<.1){settle(current,180);return}
   const cell=grid.bounded({...current.cell,x:current.cell.x+Math.round(dx),y:Math.max(0,current.cell.y+Math.round(dy))}),next=grid.move(current.cells,cell,current.visible,cell,cell.y)
   if(next.some(cell=>{const previous=current.cells.find(c=>c.id===cell.id),card=root.querySelector('[data-research-node-id="'+CSS.escape(cell.id)+'"]');return previous&&card?.hasAttribute('data-research-geometry-blocked')&&['x','y','w','h'].some(key=>cell[key]!==previous[key])})){settle(current,180);onNotice({message:'其他组件正在编辑，移动已取消'});return}
   workspace.applyWorkbenchCells(next,false);workspace.persist();settle(current)
  }else settle(current,180)
 }
 const cancel=e=>{if(op&&(e?.pointerId===undefined||e.pointerId===op.pointerId)){const current=op;cleanup(true);settle(current,180)}},key=e=>{if(op&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();const current=op;cleanup(true);settle(current,180)}}
 doc.addEventListener('pointerdown',down,true);view.addEventListener('pointermove',move,true);view.addEventListener('pointerup',up,true);view.addEventListener('pointercancel',cancel,true);view.addEventListener('keydown',key,true);view.addEventListener('blur',cancel)
 return()=>{cleanup();for(const stop of settling)stop();settling.clear();doc.removeEventListener('pointerdown',down,true);view.removeEventListener('pointermove',move,true);view.removeEventListener('pointerup',up,true);view.removeEventListener('pointercancel',cancel,true);view.removeEventListener('keydown',key,true);view.removeEventListener('blur',cancel)}
}

export function animateBoardTabsDrop(current,root,workspace,duration,onDone) {
 const view=root.ownerDocument.defaultView,doc=root.ownerDocument,preview=current.preview,caption=current.caption,from=preview.getBoundingClientRect(),labelFrom=caption.getBoundingClientRect(),reduced=view.matchMedia?.('(prefers-reduced-motion: reduce)').matches
 let animation=null,labelAnimation=null,timer=null,frame=null,done=false
 const finish=()=>{if(done)return;done=true;if(frame)view.cancelAnimationFrame(frame);view.clearTimeout(timer);animation?.cancel();labelAnimation?.cancel();current.card.removeAttribute('data-board-tabs-arriving');preview.remove();caption.remove();current.position.remove();onDone?.()}
 current.card.setAttribute('data-board-tabs-arriving','')
 // Freeze the exact displayed frame, including a morph interrupted by release.
 Object.assign(preview.style,{position:'fixed',left:from.left+'px',top:from.top+'px',transition:'none',transform:'scale('+(from.width/current.rect.width)+','+(from.height/current.rect.height)+')'})
 doc.body.append(preview)
 if(current.small){Object.assign(caption.style,{position:'fixed',left:labelFrom.left+'px',top:labelFrom.top+'px',transition:'none',transform:'none',opacity:'1'});doc.body.append(caption)}else caption.remove()
 current.position.remove()
 frame=view.requestAnimationFrame(()=>{
  frame=null;if(!current.card.isConnected){finish();return}
  const node=[...workspace.getSnapshot().files,...workspace.getSnapshot().artifacts].find(n=>n.id===current.id)
  if(node&&workspace.isBoardNodeVisible(current.id)){
   const usable=root.clientHeight-86,top=node.y-node.height/2,bottom=node.y+node.height/2
   if(top<root.scrollTop+12||bottom>root.scrollTop+usable){root.scrollTop=Math.max(0,top-58);workspace.setViewport({x:0,y:-root.scrollTop,scale:1})}
  }
  const target=current.card.getBoundingClientRect(),dx=target.left-from.left,dy=target.top-from.top,first='translate3d(0,0,0) scale('+from.width/current.rect.width+','+from.height/current.rect.height+')',last='translate3d('+dx+'px,'+dy+'px,0) scale('+target.width/current.rect.width+','+target.height/current.rect.height+')'
  if(reduced){finish();return}
  preview.dataset.releaseAnimation='';
  if(typeof preview.animate==='function'){
   animation=preview.animate([{transform:first,opacity:1},{transform:last,opacity:1}],{duration,easing:'cubic-bezier(.16,1,.3,1)',fill:'forwards'})
   animation.finished?.then(finish,finish)
   if(current.small){const title=current.card.querySelector('.ew-grid-title')?.getBoundingClientRect(),x=(title?.left??target.left+12)-labelFrom.left,y=(title?.top??target.top+8)-labelFrom.top;labelAnimation=caption.animate([{transform:'translate3d(0,0,0)',opacity:1},{transform:'translate3d('+x+'px,'+y+'px,0)',opacity:1}],{duration,easing:'cubic-bezier(.16,1,.3,1)',fill:'forwards'})}
  }
  timer=view.setTimeout(finish,duration+40)
 })
 return finish
}
