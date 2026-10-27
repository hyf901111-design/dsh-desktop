export function BoardTabsIcon({name}) {return react_jsx_runtime.jsx('span',{className:'ew-board-tabs-icon','data-tabs-icon':name,'aria-hidden':true})}
export function BoardTabsLayer({rootRef,workspace,sessionId,snapshot,readOnly}) {
 const {jsx,jsxs}=react_jsx_runtime,nav=boardTabsNode(snapshot),[host,setHost]=react.useState(null),[menu,setMenu]=react.useState(null),[settings,setSettings]=react.useState(false),[remove,setRemove]=react.useState(false),[notice,setNotice]=react.useState(null),[theme,setTheme]=react.useState('light'),[paging,setPaging]=react.useState({overflow:false,left:false,right:false}),trigger=react.useRef(null),list=react.useRef(null),pager=react.useRef(null)
 const active=workspace.getActiveBoardTab(),close=()=>{setSettings(false);setRemove(false);trigger.current?.focus({preventScroll:true})}
 const duplicateNotice=workspace.getBoardTabsDuplicateNotice?.()
 react.useEffect(()=>{if(duplicateNotice){workspace.dismissBoardTabsDuplicateNotice(duplicateNotice.token);setNotice({...duplicateNotice,duration:2000})}},[duplicateNotice,workspace])
 react.useEffect(()=>{
  const root=rootRef.current;if(!root)return
  setHost(root.querySelector('[data-research-content-layer]')||root)
  const sync=()=>setTheme(root.dataset.workbenchStyle||(document.body.hasAttribute('data-ds-dark-theme')?'dark':'light'))
  sync();const observer=new MutationObserver(sync);observer.observe(root,{attributes:true,attributeFilter:['data-workbench-style']});observer.observe(document.body,{attributes:true,attributeFilter:['data-ds-dark-theme']});return()=>observer.disconnect()
 },[workspace])
 react.useLayoutEffect(()=>{
  const root=rootRef.current;if(!root)return
  const visible=new Set([...workspace.getVisibleBoardSnapshot().files,...workspace.getVisibleBoardSnapshot().artifacts,...workspace.getWorkbenchPlanningNodes()].map(n=>n.id))
  for(const card of root.querySelectorAll('[data-research-node-id]')){const hidden=Boolean(nav&&!visible.has(card.getAttribute('data-research-node-id')));card.toggleAttribute('data-board-tab-hidden',hidden);card.inert=hidden}
 },[snapshot,active,host])
 react.useLayoutEffect(()=>{const selected=list.current?.querySelector('[aria-selected=true]');if(selected){const left=selected.offsetLeft,right=left+selected.offsetWidth;if(left<list.current.scrollLeft)list.current.scrollLeft=left;if(right>list.current.scrollLeft+list.current.clientWidth)list.current.scrollLeft=right-list.current.clientWidth}},[active,host,nav?.id,nav?.containerSpec.tabs.map(t=>t.id).join('|')])
 react.useEffect(()=>{const root=rootRef.current;if(!root)return;return installBoardTabsDrag(root,workspace,readOnly,detail=>setNotice({...detail,token:Date.now()}))},[workspace,readOnly])
 react.useEffect(()=>{const element=list.current;if(!element)return;const wheel=e=>{e.preventDefault();e.stopPropagation();element.scrollLeft+=e.deltaX||e.deltaY};element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel)},[host,nav?.id])
 react.useLayoutEffect(()=>{
  const element=list.current;if(!element)return
  const measure=()=>{const reserve=pager.current?(pager.current.getBoundingClientRect().width+(parseFloat(window.getComputedStyle(element.parentElement).columnGap)||4)):0,overflow=element.scrollWidth>element.clientWidth+reserve+1,max=Math.max(0,element.scrollWidth-element.clientWidth),next={overflow,left:element.scrollLeft>1,right:element.scrollLeft<max-1};setPaging(old=>Object.keys(next).every(key=>next[key]===old[key])?old:next)}
  measure();const observer=new ResizeObserver(measure);observer.observe(element);element.addEventListener('scroll',measure);window.addEventListener('resize',measure);return()=>{observer.disconnect();element.removeEventListener('scroll',measure);window.removeEventListener('resize',measure)}
 },[host,nav?.id,nav?.containerSpec.tabs.length,snapshot.canvasSize.availableWidth,paging.overflow])
 react.useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(null),notice.duration??5000);return()=>window.clearTimeout(timer)},[notice])
 react.useEffect(()=>{if(!menu)return;const dismiss=e=>{if(!e.target.closest?.('[data-board-tabs-menu]')&&!trigger.current?.contains(e.target))setMenu(null)},key=e=>{if(e.key==='Escape'){e.preventDefault();setMenu(null);trigger.current?.focus()}};document.addEventListener('pointerdown',dismiss,true);document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('pointerdown',dismiss,true);document.removeEventListener('keydown',key,true)}},[menu])
 const retained=workspace.retainedBoardTabPlanCount?.()||0
 const recovery=retained>0&&jsx(WorkbenchToolbar,{rootRef,sessionId,availableWidth:snapshot.canvasSize.availableWidth,bottomOffset:126,role:'status','data-workbench-notice':'','data-board-tabs-recovery':'',children:[jsx('span',{children:'目标页签已删除，'+retained+' 组生成结果已保留'},'text'),jsx('button',{type:'button',disabled:readOnly,onClick:()=>workspace.placeRetainedBoardTabPlans(),children:nav?'放入当前页签':'放入当前看板'},'place')]})
 if(!nav||!host)return recovery||null
 const spec=nav.containerSpec
 const page=direction=>{const element=list.current;if(!element)return;const left=direction*Math.max(64,element.clientWidth*.75);element.scrollBy({left,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
 const select=id=>{setMenu(null);workspace.selectBoardTab(id)}
 const keys=e=>{const buttons=[...list.current.querySelectorAll('[role=tab]')],index=buttons.indexOf(document.activeElement);let to;if(e.key==='ArrowRight')to=(index+1)%buttons.length;if(e.key==='ArrowLeft')to=(index-1+buttons.length)%buttons.length;if(e.key==='Home')to=0;if(e.key==='End')to=buttons.length-1;if(to!==undefined){e.preventDefault();e.stopPropagation();buttons[to].focus();buttons[to].scrollIntoView?.({block:'nearest',inline:'nearest'})}}
 const confirm=jsxs('div',{className:'ew-board-tabs-confirm',children:[jsx('p',{children:'移除页签组件后，所有页签中的组件将合回当前看板，内容和连接保留。'}),jsxs('footer',{children:[jsx('button',{type:'button',onClick:close,children:'取消'}),jsx('button',{type:'button',disabled:readOnly,onClick:()=>{if(workspace.removeBoardTabs())close()},children:'移除页签组件'})]})]})
 return jsxs(react.Fragment,{children:[react_dom.createPortal(jsxs('div',{'data-board-tabs-nav':'',className:'ew-board-tabs-nav','data-board-tabs-theme':theme,style:{width:Math.max(1,(snapshot.canvasSize.availableWidth||snapshot.canvasSize.width||1000)-24)},onPointerDown:e=>e.stopPropagation(),children:[jsx('div',{ref:list,role:'tablist','aria-label':'看板页签',onKeyDown:keys,className:'ew-board-tabs-list',children:spec.tabs.map(t=>jsx('button',{type:'button',role:'tab',id:'board-tab-'+t.id,'aria-selected':t.id===active,tabIndex:t.id===active?0:-1,title:t.name,'aria-controls':'board-page-'+sessionId,'data-board-tab':t.id,onClick:()=>select(t.id),children:t.name},t.id))}),paging.overflow&&jsxs('div',{ref:pager,className:'ew-board-tabs-paging','data-board-tabs-paging':'',children:[jsx('button',{type:'button','aria-label':'向左翻页',title:'向左翻页',disabled:!paging.left,onClick:()=>page(-1),children:jsx(BoardTabsPageIcon,{direction:'left'})}),jsx('button',{type:'button','aria-label':'向右翻页',title:'向右翻页',disabled:!paging.right,onClick:()=>page(1),children:jsx(BoardTabsPageIcon,{direction:'right'})})]}),jsx('button',{ref:trigger,type:'button','data-board-tabs-more':'','aria-label':'页签更多操作','aria-haspopup':'menu','aria-expanded':Boolean(menu),onClick:e=>{const r=e.currentTarget.getBoundingClientRect();setMenu(menu?null:{left:Math.max(8,Math.min(window.innerWidth-214,r.right-206)),top:r.bottom+5})},children:jsx(BoardTabsIcon,{name:'tabs-more'})})]}),host),
 menu&&react_dom.createPortal(jsxs('div',{role:'menu','aria-label':'页签更多操作','data-board-tabs-menu':'','data-board-tabs-theme':theme,className:'ew-grid-menu ew-board-tabs-menu',style:menu,onKeyDown:e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=[...e.currentTarget.querySelectorAll('button')],i=items.indexOf(document.activeElement);items[e.key==='End'?items.length-1:e.key==='Home'?0:(i+(e.key==='ArrowUp'?-1:1)+items.length)%items.length]?.focus()}},ref:el=>{if(el&&!el.contains(document.activeElement))el.querySelector('button')?.focus({preventScroll:true})},children:[jsxs('button',{type:'button',role:'menuitem',disabled:readOnly,onClick:()=>{setMenu(null);setSettings(true)},children:[jsx(WorkbenchIcon,{name:'settings'}),jsx('span',{children:'页签设置'})]}),jsxs('button',{type:'button',role:'menuitem',disabled:readOnly,onClick:()=>{setMenu(null);setRemove(true)},children:[jsx(WorkbenchIcon,{name:'remove'}),jsx('span',{children:'移除页签组件'})]})]}),document.body),
 settings&&jsx(BoardTabsSettings,{nav,workspace,readOnly,theme,onClose:close}),
 remove&&jsx(BoardTabsModal,{title:'移除页签组件',theme,onClose:close,children:confirm}),
 recovery,notice&&jsx(WorkbenchToolbar,{rootRef,sessionId,availableWidth:snapshot.canvasSize.availableWidth,bottomOffset:86,role:'status','data-workbench-notice':'','data-board-tabs-notice':'',children:[jsx('span',{children:notice.message},'text'),notice.undo&&jsx('button',{type:'button',onClick:()=>{const current=workspace.getSnapshot();if(JSON.stringify([current.files,current.artifacts])===notice.signature)workspace.undo();setNotice(null)},children:'撤销'},'undo')]})
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
 const doc=root.ownerDocument,view=doc.defaultView,settling=new Set()
 let op=null,edgeFrame=0,exitTimer=null
 const clearTargets=()=>root.querySelectorAll('[data-board-tab]').forEach(el=>{el.removeAttribute('data-tab-accept');el.removeAttribute('data-tab-target')})
 const inside=e=>{const r=root.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom}
 const clear=(keepPreview=false)=>{
  const current=op;op=null;if(edgeFrame)view.cancelAnimationFrame(edgeFrame);edgeFrame=0;view.clearTimeout(exitTimer);exitTimer=null;clearTargets()
  if(!current)return null
  current.card.removeAttribute('data-board-tabs-drag-source');current.tip?.remove()
  if(!keepPreview){current.preview?.remove();current.caption?.remove();current.position?.remove()}
  return current
 }
 const settle=(current,duration=220)=>{if(!current?.preview)return;const stop=animateBoardTabsDrop(current,root,workspace,duration,()=>settling.delete(stop));settling.add(stop)}
 const targets=e=>{
  const nav=boardTabsNode(workspace.getSnapshot()),bar=root.querySelector('[data-board-tabs-nav]'),list=bar?.querySelector('[role=tablist]'),br=bar?.getBoundingClientRect(),lr=list?.getBoundingClientRect(),rr=root.getBoundingClientRect(),receivers=[]
  if(!nav||nav.id!==op?.navId||workspace.getActiveBoardTab()!==op.source||!br||!lr)return {distance:Infinity,target:null,receivers,bottom:0}
  let distance=Infinity,target=null
  for(const element of list.querySelectorAll('[data-board-tab]')){
   const tab=nav.containerSpec.tabs.find(t=>t.id===element.dataset.boardTab);if(!tab||tab.id===op.source)continue
   const r=element.getBoundingClientRect(),left=Math.max(r.left,lr.left,br.left,rr.left),right=Math.min(r.right,lr.right,br.right,rr.right),top=Math.max(r.top,lr.top,br.top,rr.top),bottom=Math.min(r.bottom,lr.bottom,br.bottom,rr.bottom)
   if(right<=left||bottom<=top)continue
   receivers.push(element);distance=Math.min(distance,Math.max(left-e.clientX,e.clientX-right,top-e.clientY,e.clientY-bottom,0))
   const stack=doc.elementsFromPoint?.(e.clientX,e.clientY)||[]
   if(e.clientX>=left&&e.clientX<=right&&e.clientY>=top&&e.clientY<=bottom&&(!stack.length||stack[0].closest?.('[data-board-tab]')===element))target=tab
  }
  return {distance:inside(e)?distance:Infinity,target,receivers,bottom:br.bottom}
 }
 const useCapture=current=>{
  if(!current.image||!current.preview)return
  const image=doc.createElement('img');image.alt='';image.src=current.image.url;image.draggable=false;image.className='ew-board-tabs-captured-image';Object.assign(image.style,{left:current.image.x-current.rect.left+'px',top:current.image.y-current.rect.top+'px',width:current.image.width+'px',height:current.image.height+'px'});current.preview.replaceChildren(image)
 }
 const makePreview=e=>{
  const current=op,from=current.card.getBoundingClientRect(),clone=current.card.cloneNode(true),theme=root.dataset.workbenchStyle||'light'
  current.position=doc.createElement('div');current.preview=doc.createElement('div');current.caption=doc.createElement('div');current.tip=doc.createElement('div')
  const {position,preview,caption,tip}=current
  position.className='ew-board-tabs-drag-position';position.dataset.boardTabsTheme=theme
  preview.className='ew-board-tabs-drag-preview';preview.dataset.eworkGrid='';preview.dataset.workbenchStyle=theme;preview.dataset.boardTabsTheme=theme;preview.setAttribute('aria-hidden','true');Object.assign(preview.style,{width:current.rect.width+'px',height:current.rect.height+'px'})
  clone.removeAttribute('id');clone.removeAttribute('data-grid-active');clone.style.removeProperty('--grid-float-left');clone.style.removeProperty('--grid-float-top');for(const el of clone.querySelectorAll('[id]'))el.removeAttribute('id')
  for(const el of clone.querySelectorAll('iframe,video,audio,[data-research-native-web]')){const summary=doc.createElement('div');summary.textContent=current.node.excerpt||'组件预览';summary.style.cssText='padding:20px;white-space:pre-wrap;font:12px/1.6 system-ui;overflow:hidden';el.replaceWith(summary)}
  preview.append(clone);caption.className='ew-board-tabs-drag-caption';caption.textContent=current.node.title||'组件';tip.className='ew-board-tabs-drag-tip';tip.dataset.boardTabsTheme=theme;tip.hidden=true
  position.append(preview,caption);doc.body.append(position,tip);useCapture(current)
  position.style.transform='translate3d('+e.clientX+'px,'+e.clientY+'px,0)';preview.style.transform='translate3d('+(from.left-e.clientX)+'px,'+(from.top-e.clientY)+'px,0) scale('+(from.width/current.rect.width)+')';preview.getBoundingClientRect()
 }
 const paint=(e,hit)=>{
  if(!op?.preview)return
  const rect=op.card.getBoundingClientRect(),scale=op.small?Math.min(1,240/op.rect.width):rect.width/op.rect.width,w=op.rect.width*scale,h=op.rect.height*scale
  const left=op.small?Math.max(8,Math.min(view.innerWidth-w-8,e.clientX+16)):rect.left,top=op.small?Math.max(8,Math.min(view.innerHeight-h-8,Math.max(hit.bottom+12,e.clientY+16))):rect.top
  op.position.style.transform='translate3d('+e.clientX+'px,'+e.clientY+'px,0)';op.preview.style.transform='translate3d('+(left-e.clientX)+'px,'+(top-e.clientY)+'px,0) scale('+scale+')';op.preview.toggleAttribute('data-thumbnail',op.small)
  Object.assign(op.caption.style,{transform:'translate3d('+(left-e.clientX+8)+'px,'+(top-e.clientY+4)+'px,0)',opacity:op.small?'1':'0'})
  clearTargets();if(op.small)for(const tab of hit.receivers)tab.setAttribute('data-tab-accept','')
  op.target=op.small?hit.target:null;if(op.target)root.querySelector('[data-board-tab="'+CSS.escape(op.target.id)+'"]')?.setAttribute('data-tab-target','')
  op.tip.hidden=!op.target
  if(op.target){op.tip.textContent='松开移至「'+op.target.name+'」';const tipWidth=op.tip.offsetWidth||180,beside=left+w+8+tipWidth<=view.innerWidth-8;Object.assign(op.tip.style,{left:(beside?left+w+8:Math.max(8,Math.min(view.innerWidth-tipWidth-8,left)))+'px',top:Math.max(8,Math.min(view.innerHeight-40,beside?top:top+h+8))+'px'})}
 }
 const scrollEdge=()=>{
  edgeFrame=0;if(!op?.small||!op.last)return
  const list=root.querySelector('.ew-board-tabs-list'),r=list?.getBoundingClientRect(),e=op.last
  if(r&&e.clientY>=r.top-16&&e.clientY<=r.bottom+16){const dx=e.clientX<r.left+24?-8:e.clientX>r.right-24?8:0;if(dx){list.scrollLeft+=dx;paint(e,targets(e))}}
  edgeFrame=view.requestAnimationFrame(scrollEdge)
 }
 const controller={
  begin(e,native){
   clear();for(const stop of settling)stop();settling.clear()
   const snapshot=workspace.getSnapshot(),nav=boardTabsNode(snapshot),id=native.cell?.id,node=[...snapshot.files,...snapshot.artifacts].find(n=>n.id===id),card=root.querySelector('[data-research-node-id="'+CSS.escape(id||'')+'"]')
   if(readOnly||native.kind!=='move'||!nav||!node||!card)return
   const current=op={id,node,card,native,navId:nav.id,source:workspace.getActiveBoardTab(),rect:card.getBoundingClientRect(),cells:native.canonicalBefore,small:false,target:null,last:e}
   // Prefetch pixels without changing the existing live canvas drag.
   const capture=view.dshDesktop?.researchLinkFrame?.captureCanvas,r=current.rect
   if(capture&&card.querySelector('iframe,canvas,video,[data-research-native-web]')){const x=Math.max(0,r.left),y=Math.max(0,r.top),width=Math.min(view.innerWidth,r.right)-x,height=Math.min(view.innerHeight,r.bottom)-y;if(width>0&&height>0)Promise.resolve(capture({x,y,width,height,cssPixels:true})).then(url=>{if(op!==current||typeof url!=='string'||!/^data:image\/(?:jpeg|png);base64,/.test(url))return;current.image={url,x,y,width,height};useCapture(current)}).catch(()=>{})}
  },
  move(e,native){
   if(!op||op.native!==native)return false
   if(JSON.stringify(workspace.getWorkbenchCells())!==JSON.stringify(native.boardTabsPreviewCells??op.cells)){onNotice({message:'组件位置或占用状态已变化，移动已取消'});return 'cancel'}
   op.last=e;const hit=targets(e),near=hit.distance<=(op.small?96:64)
   if(!near){if(op.small){op.small=false;native.boardTabsResume=true;clearTargets();op.tip.hidden=true;if(edgeFrame)view.cancelAnimationFrame(edgeFrame);edgeFrame=0;exitTimer=view.setTimeout(()=>{if(op?.native===native){op.card.removeAttribute('data-board-tabs-drag-source');op.preview?.remove();op.caption?.remove();op.position?.remove();op.tip?.remove();op.preview=op.caption=op.position=op.tip=null}exitTimer=null},160)}return false}
   view.clearTimeout(exitTimer);exitTimer=null
   if(!op.preview)makePreview(e)
   if(!op.small){op.small=true;workspace.applyWorkbenchCells(native.canonicalBefore,false);native.boardTabsPreviewCells=native.canonicalBefore;native.targetKey=null;native.target=null;native.resolved=native.canonicalBefore;const origin=createResearchGrid().project([{id:op.id}],[native.cell],native.width)[0];op.card.style.setProperty('--grid-float-left',origin.x+'px');op.card.style.setProperty('--grid-float-top',origin.y+(workspace.getWorkbenchLayoutOffset?.()||0)+'px');op.card.setAttribute('data-board-tabs-drag-source','')}
   paint(e,hit);if(!edgeFrame)edgeFrame=view.requestAnimationFrame(scrollEdge);return true
  },
  afterMove(e){if(op){op.native.boardTabsResume=false;if(op.preview&&!op.small)paint(e,targets(e))}},
  active:()=>Boolean(op?.small),
  release(e,native,restore){
   if(!op||op.native!==native)return false
   if(controller.move(e,native)==='cancel')return controller.cancel(e,native,restore)
   if(!op.small){clear();return false}
   const hit=targets(e),current=op,blocked=current.card.hasAttribute('data-research-geometry-blocked')||JSON.stringify(workspace.getWorkbenchCells())!==JSON.stringify(current.cells)
   paint(e,hit);clear(true);restore()
   if(!blocked&&hit.target&&inside(e)&&workspace.moveToBoardTab([current.id],hit.target.id)){const next=workspace.getSnapshot();onNotice({message:'已移至「'+hit.target.name+'」',undo:true,signature:JSON.stringify([next.files,next.artifacts])});settle(current)}else{settle(current,180);if(blocked||hit.target)onNotice({message:blocked?'组件位置或占用状态已变化，移动已取消':'目标页签已变化或无法容纳组件，移动已取消'})}
   return true
  },
  cancel(e,native,restore){if(!op||op.native!==native)return false;const preserve=JSON.stringify(workspace.getWorkbenchCells())!==JSON.stringify(native.boardTabsPreviewCells??op.cells),current=clear(Boolean(op.preview));if(!current.preview&&!preserve)return false;restore(preserve);settle(current,180);return true},
  end:()=>clear()
 }
 root.__ewBoardTabsDrag=controller
 return()=>{clear();for(const stop of settling)stop();settling.clear();if(root.__ewBoardTabsDrag===controller)delete root.__ewBoardTabsDrag}
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

export function BoardTabsPageIcon({direction}){return react_jsx_runtime.jsx('svg',{width:16,height:16,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.5,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,children:react_jsx_runtime.jsx('path',{d:direction==='left'?'M10 4 6 8l4 4':'M6 4l4 4-4 4'})})}
