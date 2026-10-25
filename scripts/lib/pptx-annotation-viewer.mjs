/** This is source authorization metadata only; the coordinator owns sending identity. */
export function pptxAnnotationSource(props){
 if(props.annotationSource)return props.annotationSource
 const path=String(props.path||'').replace(/\\/g,'/'),cwd=String(props.scope?.cwd||'').replace(/\\/g,'/').replace(/\/$/,''),sessionId=props.scope?.sessionId
 if(!sessionId||path.startsWith('sherlock-preview:')||/^(?:note-files:|sherlock-research$)/.test(sessionId))return null
 const relativePath=path.startsWith('/')||/^[A-Za-z]:\//.test(path)?cwd&&path.startsWith(cwd+'/')?path.slice(cwd.length+1):null:path
 if(!relativePath||relativePath.split('/').some(part=>part==='..'))return null
 return {sessionId,source:{kind:'workspace',relativePath}}
}
/** Browser-only, self-contained. All document/draft mutations belong to the coordinator. */
export function attachPptxAnnotationViewer(host,options){
 const doc=host.ownerDocument,win=doc.defaultView,uiRoot=options.uiRoot||host.parentElement,handle=options.handle,assets=options.assets||{},owner=options.viewerKey||win.crypto.randomUUID()
 let disposed=false,frame=0,gesture=null,tool='rect',bubbleId=null,pendingReveal=null,lastReveal=-1,localError='',composing=false,lastDeleted=false
 const layers=new Map(),stop=new win.AbortController(),snapshot=()=>handle.getSnapshot(),current=()=>!disposed&&!stop.signal.aborted&&host.isConnected&&options.isCurrent?.()!==false
 const node=(tag,cls,parent)=>{const el=doc.createElement(tag);el.className=cls;el.dataset.pptxAnnotationUi='';el.dataset.noteExportOmit='';el.dataset.pptxAnnotationOwner=owner;if(parent)parent.append(el);return el}
 const image=(name,parent,size)=>{const el=node('img','',parent);el.src=assets[name]||'';el.alt='';el.draggable=false;el.width=size;el.height=size;return el}
 const action=(text,fn,parent,cls='')=>{const el=node('button',cls,parent);el.type='button';el.textContent=text;el.addEventListener('click',fn);return el}
 const style=node('style','',uiRoot);style.textContent=options.style||''
 const toolbar=node('div','pptxa-toolbar',uiRoot);toolbar.dataset.pptxAnnotationToolbar='';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','标注工具')
 uiRoot.insertBefore(toolbar,host)
 const rectTool=action('框选',()=>setTool('rect'),toolbar,'pptxa-tool'),pointTool=action('点选',()=>setTool('point'),toolbar,'pptxa-tool')
 rectTool.prepend(image('rect14-selected',null,14));pointTool.prepend(image('point14-normal',null,14));const count=action('',()=>toggleMarkList(),toolbar,'pptxa-count');count.setAttribute('aria-label','标注列表');count.setAttribute('aria-haspopup','menu');count.setAttribute('aria-expanded','false')
 const bubble=node('section','pptxa-bubble',doc.body);bubble.hidden=true;bubble.dataset.noteExportOmit='';bubble.setAttribute('aria-label','标注备注')
 const header=node('header','pptxa-bubble-header',bubble),badge=node('span','pptxa-bubble-pin',header);image('pin20-selected',badge,20);const ordinal=node('span','',badge),title=node('span','pptxa-bubble-title',header)
 const close=action('',()=>closeBubble(),header,'pptxa-bubble-close');close.setAttribute('aria-label','关闭标注气泡');image('close16',close,16)
 const comment=node('textarea','pptxa-comment',bubble);comment.setAttribute('aria-label','标注备注');comment.placeholder='写下修改意见…'
 const error=node('div','pptxa-error',bubble),actions=node('div','pptxa-bubble-actions',bubble)
 const menu=node('div','pptxa-menu',doc.body);menu.hidden=true;menu.setAttribute('role','menu')
 action('删除标注',()=>{const id=menu.dataset.markId;menu.hidden=true;if(id)void run(()=>handle.remove(id)).then(ok=>{if(ok){lastDeleted=true;closeBubble();render()}})},menu)
 const list=node('div','pptxa-menu pptxa-mark-list',doc.body),listItems=new Map();list.hidden=true;list.setAttribute('role','menu');list.setAttribute('aria-label','标注列表')
 const notice=node('div','pptxa-notice',doc.body);notice.hidden=true;const noticeText=node('span','',notice)
 action('撤销',()=>void run(()=>handle.undo()).then(ok=>{if(ok){lastDeleted=false;render()}}),notice)
 const own=el=>el?.nodeType===1&&(el.dataset?.pptxAnnotationOwner===owner||el.closest?.('[data-pptx-annotation-owner]')?.dataset.pptxAnnotationOwner===owner)
 const basisKey=()=>JSON.stringify([snapshot().basis?.documentId,snapshot().basis?.fileVersion])
 const hitNode=(element,slide)=>{const id=element?.closest?.('[data-pptx-node-id]')?.dataset.pptxNodeId;return slide.nodes?.find(node=>node.nodeId===id&&node.part===slide.part)?.id}
 const initialBasis=basisKey()
 const validMark=mark=>!mark.stale&&mark.fileVersion===snapshot().basis?.fileVersion
 const markById=id=>snapshot().marks.find(mark=>mark.id===id)
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v))
 const label=mark=>{const slide=snapshot().scene?.slides.find(s=>s.index===mark.slideIndex),target=slide?.nodes?.find(n=>mark.nodeIds?.includes(n.id));return '第'+(mark.slideIndex+1)+'页 · '+(target?.name||(mark.kind==='rect'?'框选区域':'位置'))}
 const run=async operation=>{if(!current())return false;try{await operation();if(!current())return false;localError='';render();return true}catch(failure){if(current()){localError=failure?.message||'标注操作失败，原备注已保留。';render()}return false}}
 const closeMarkList=()=>{list.hidden=true;count.setAttribute('aria-expanded','false')}
 const renderMarkList=()=>{
  if(list.hidden)return
  const s=snapshot(),marks=[...s.marks].sort((a,b)=>a.ordinal-b.ordinal),ids=new Set(marks.map(mark=>mark.id))
  for(const[id,item]of listItems)if(!ids.has(id)){item.remove();listItems.delete(id)}
  marks.forEach((mark,index)=>{
   let item=listItems.get(mark.id)
   if(!item){item=action('',()=>{closeMarkList();void run(()=>handle.select(mark.id))},null);item.setAttribute('role','menuitem');item.dataset.pptxAnnotationListMark=mark.id;listItems.set(mark.id,item)}
   const text='标注'+mark.ordinal+' · '+label(mark)+(validMark(mark)?'':' · 需重新定位');if(item.textContent!==text)item.textContent=text
   item.title=mark.comment||text;item.setAttribute('aria-current',String(s.selectedId===mark.id));if(list.children[index]!==item)list.insertBefore(item,list.children[index]||null)
  })
  if(!marks.length){closeMarkList();return}
  const r=count.getBoundingClientRect(),viewport=host.getBoundingClientRect(),width=Math.min(320,Math.max(160,viewport.width-16),win.innerWidth-16)
  list.style.width=width+'px';list.style.left=clamp(r.right-width,Math.max(8,viewport.left+8),Math.min(win.innerWidth-width-8,Math.max(viewport.left+8,viewport.right-width-8)))+'px'
  list.style.top=clamp(r.bottom+5,8,Math.max(8,win.innerHeight-list.getBoundingClientRect().height-8))+'px'
 }
 const toggleMarkList=()=>{
  if(!current())return;if(!list.hidden){closeMarkList();return}
  cancelGesture();closeBubble();list.hidden=false;count.setAttribute('aria-expanded','true');renderMarkList();list.querySelector('button')?.focus({preventScroll:true})
 }
 const closeBubble=()=>{bubbleId=null;pendingReveal=null;bubble.hidden=true;menu.hidden=true;closeMarkList()}
 const setTool=value=>{cancelGesture();closeMarkList();tool=value;render();options.onTool?.(value)}
 const slideFor=target=>{
  const item=target?.closest?.('[data-slide-index]');if(!item||!host.contains(item)||item.dataset.pptxThumbnail==='true')return null
  const wrapper=item.firstElementChild,content=wrapper?.firstElementChild,index=Number(item.dataset.slideIndex),slide=snapshot().scene?.slides.find(s=>s.index===index)
  if(!wrapper||!content||wrapper.dataset.mounted!=='1'||!slide)return null
  const rect=content.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return null
  return{item,wrapper,content,index,slide,rect}
 }
 const locate=index=>{for(const item of host.querySelectorAll('[data-slide-index]'))if(Number(item.dataset.slideIndex)===index){const value=slideFor(item.firstElementChild?.firstElementChild);if(value)return value}return null}
 const regionPoint=(slide,event)=>({x:clamp((event.clientX-slide.rect.left)/slide.rect.width,0,1),y:clamp((event.clientY-slide.rect.top)/slide.rect.height,0,1)})
 const cancelGesture=()=>{
  const prior=gesture;gesture=null;if(!prior)return
  prior.drawing?.remove();try{if(prior.capture.hasPointerCapture?.(prior.pointerId))prior.capture.releasePointerCapture(prior.pointerId)}catch{}
 }
 const down=event=>{
  if(!current()||event.button!==0||event.isPrimary===false||event.metaKey||event.ctrlKey||event.altKey||own(event.target))return
  const s=snapshot();if(!s.scene||s.busy)return
  const slide=slideFor(event.target);if(!slide)return
  const p=regionPoint(slide,event);if(event.clientX<slide.rect.left||event.clientX>slide.rect.right||event.clientY<slide.rect.top||event.clientY>slide.rect.bottom)return
  if(bubbleId&&tool==='point'&&!hitNode(event.target,slide.slide)){event.preventDefault();closeBubble();return}
  event.preventDefault();cancelGesture();closeBubble()
  const drawing=node('div','pptxa-drawing',layers.get(slide.wrapper)?.element||slide.wrapper);drawing.dataset.pptxAnnotationDrawing=''
  gesture={slide,start:p,end:p,pointerId:event.pointerId,capture:slide.content,drawing,kind:tool,basis:basisKey(),nodeId:hitNode(event.target,slide.slide),reanchor:reanchorId}
  try{slide.content.setPointerCapture?.(event.pointerId)}catch{}
  drawGesture()
 }
 const drawGesture=()=>{const g=gesture;if(!g)return;const w=g.slide.rect.width,h=g.slide.rect.height,x=Math.min(g.start.x,g.end.x),y=Math.min(g.start.y,g.end.y);Object.assign(g.drawing.style,{left:x*w+'px',top:y*h+'px',width:Math.abs(g.start.x-g.end.x)*w+'px',height:Math.abs(g.start.y-g.end.y)*h+'px',display:g.kind==='rect'?'block':'none'})}
 const sameRect=(a,b)=>['left','top','width','height'].every(key=>Math.abs(a[key]-b[key])<=.5)
 const move=event=>{const g=gesture;if(!g||event.pointerId!==g.pointerId)return;if(!current()||!g.capture.isConnected||basisKey()!==g.basis){cancelGesture();return}event.preventDefault();const rect=g.slide.content.getBoundingClientRect();if(!sameRect(rect,g.slide.rect)){cancelGesture();return}g.end=regionPoint(g.slide,event);drawGesture()}
 let reanchorId=null
 const up=event=>{
  const g=gesture;if(!g||event.pointerId!==g.pointerId)return
  if(!current()||!g.capture.isConnected||basisKey()!==g.basis){cancelGesture();return}
  if(!sameRect(g.slide.content.getBoundingClientRect(),g.slide.rect)){cancelGesture();return}
  event.preventDefault();g.end=regionPoint(g.slide,event)
  const region=g.kind==='point'?g.end:{x:Math.min(g.start.x,g.end.x),y:Math.min(g.start.y,g.end.y),width:Math.abs(g.start.x-g.end.x),height:Math.abs(g.start.y-g.end.y)}
  const tooSmall=g.kind==='rect'&&(region.width*g.slide.rect.width<4||region.height*g.slide.rect.height<4)
  const nodeIds=g.kind==='point'&&g.nodeId?[g.nodeId]:[]
  const target={slideIndex:g.slide.index,slidePart:g.slide.slide.part,kind:g.kind,region,nodeIds}
  const pointMoved=g.kind==='point'&&Math.hypot((g.end.x-g.start.x)*g.slide.rect.width,(g.end.y-g.start.y)*g.slide.rect.height)>4
  cancelGesture();if(tooSmall||pointMoved)return
  const id=g.reanchor;reanchorId=null;void run(()=>id?handle.reanchor(id,target):handle.add(target))
 }
 const cancel=event=>{if(!event||!gesture||event.pointerId===undefined||event.pointerId===gesture.pointerId)cancelGesture()}
 const positionBubble=()=>{
  if(bubble.hidden)return;const mark=markById(bubbleId);if(!mark)return
  const viewport=host.getBoundingClientRect(),slide=validMark(mark)&&locate(mark.slideIndex),r=slide?.rect
  const width=Math.min(320,Math.max(160,win.innerWidth-16)),height=bubble.getBoundingClientRect().height||132
  const anchor=r?{x:r.left+mark.region.x*r.width,y:r.top+(mark.region.y+(mark.region.height||0))*r.height}:{x:viewport.right-width-8,y:viewport.top+8}
  bubble.style.width=width+'px';bubble.style.left=clamp(anchor.x,Math.max(8,viewport.left+8),Math.min(win.innerWidth-width-8,Math.max(viewport.left+8,viewport.right-width-8)))+'px'
  bubble.style.top=clamp(anchor.y+10,Math.max(8,viewport.top+8),Math.max(8,Math.min(win.innerHeight-height-8,viewport.bottom-height-8)))+'px'
 }
 const renderBubble=()=>{
  const mark=markById(bubbleId);if(!mark){bubble.hidden=true;return}
  bubble.hidden=false;ordinal.textContent=String(mark.ordinal);title.textContent=label(mark);title.title=title.textContent
  if(doc.activeElement!==comment&&!composing&&comment.value!==mark.comment)comment.value=mark.comment
  const stale=!validMark(mark);comment.disabled=stale;error.textContent=localError||snapshot().error||(stale?'文件已更新，请重新定位后再加入本轮修改。':'');error.hidden=!error.textContent
  actions.replaceChildren()
  if(stale)action(reanchorId===mark.id?'请在幻灯片中重新定位':'重新定位',()=>{reanchorId=mark.id;closeBubble();setTool(mark.kind)},actions)
  else if(!mark.referenced)action('重新加入输入框',()=>void run(()=>handle.readd(mark.id)),actions)
  positionBubble()
 }
 const render=()=>{
  if(!current()){cancelGesture();return}
  const s=snapshot();if(s.active===false||basisKey()!==initialBasis){cancelGesture();closeBubble();options.onInactive?.(s.error||(basisKey()!==initialBasis?'文件版本已变化，请重新打开标注以核对位置。':'实际会话或输入已切换，请重新开启标注。'));return}count.textContent=s.marks.length+' 处标注';count.disabled=s.marks.length===0;renderMarkList();rectTool.setAttribute('aria-pressed',String(tool==='rect'));pointTool.setAttribute('aria-pressed',String(tool==='point'))
  const wrappers=new Set()
  for(const item of host.querySelectorAll('[data-slide-index]')){
   const slide=slideFor(item.firstElementChild?.firstElementChild);if(!slide)continue;wrappers.add(slide.wrapper)
   let layer=layers.get(slide.wrapper)
   if(!layer){const position=slide.item.style.position;if(win.getComputedStyle(slide.item).position==='static')slide.item.style.position='relative';layer={element:node('div','pptxa-layer',slide.item),parent:slide.item,items:new Map(),position};layers.set(slide.wrapper,layer)}
   const parentRect=slide.item.getBoundingClientRect();Object.assign(layer.element.style,{inset:'auto',left:(slide.rect.left-parentRect.left)+'px',top:(slide.rect.top-parentRect.top)+'px',width:slide.rect.width+'px',height:slide.rect.height+'px'})
   const valid=new Set()
   for(const mark of s.marks){if(mark.slideIndex!==slide.index||mark.slidePart!==slide.slide.part||!validMark(mark))continue;valid.add(mark.id)
    let view=layer.items.get(mark.id)
    if(!view){const group=node('div','',layer.element),region=node('div','pptxa-region',group),pin=action('',()=>{if(current()){closeMarkList();handle.select(mark.id)}},group,'pptxa-pin');pin.dataset.pptxAnnotationPin=mark.id;const icon=image('pin28-normal',pin,28);const number=node('span','pptxa-pin-number',pin);pin.addEventListener('contextmenu',event=>{if(!current())return;event.preventDefault();closeMarkList();menu.dataset.markId=mark.id;menu.hidden=false;menu.style.left=clamp(event.clientX,8,win.innerWidth-120)+'px';menu.style.top=clamp(event.clientY,8,win.innerHeight-50)+'px'});view={group,region,pin,icon,number};layer.items.set(mark.id,view)}
    const selected=s.selectedId===mark.id,x=mark.region.x*slide.rect.width,y=mark.region.y*slide.rect.height
    view.region.hidden=mark.kind!=='rect';Object.assign(view.region.style,{left:x+'px',top:y+'px',width:(mark.region.width||0)*slide.rect.width+'px',height:(mark.region.height||0)*slide.rect.height+'px'})
    view.region.toggleAttribute('data-selected',selected);view.pin.style.left=x-(mark.kind==='rect'?(selected?2:1):0)+'px';view.pin.style.top=y-(mark.kind==='rect'&&selected?1:0)+'px'
    view.pin.setAttribute('aria-label','标注'+mark.ordinal+'，'+label(mark));view.pin.setAttribute('title','标注'+mark.ordinal+' · 右键可删除');view.pin.setAttribute('aria-pressed',String(selected));const src=assets[selected?'pin28-selected':'pin28-normal'];if(view.icon.src!==src)view.icon.src=src;view.number.textContent=String(mark.ordinal)
   }
   for(const[id,view]of layer.items)if(!valid.has(id)){view.group.remove();layer.items.delete(id)}
  }
  for(const[wrapper,layer]of layers)if(!wrappers.has(wrapper)){layer.element.remove();if(layer.parent.style.position==='relative'&&layer.position!=='relative')layer.parent.style.position=layer.position;layers.delete(wrapper)}
  if(gesture&&(!gesture.capture.isConnected||gesture.basis!==basisKey()))cancelGesture()
  if(s.revealSeq!==lastReveal){
   lastReveal=s.revealSeq;pendingReveal=s.selectedId?{id:s.selectedId,seq:s.revealSeq,ready:false}:null
   if(pendingReveal){const request=pendingReveal,mark=markById(request.id)
    if(mark){const navigation=validMark(mark)?options.getViewer?.()?.goToSlide?.(mark.slideIndex,{behavior:'auto',block:'nearest'}):undefined
     Promise.resolve(navigation).then(()=>{if(current()&&pendingReveal===request){request.ready=true;schedule()}}).catch(failure=>{if(current()&&pendingReveal===request){localError=failure.message;schedule()}})
    }
   }
  }
  if(pendingReveal?.ready){const mark=markById(pendingReveal.id);if(mark&&(!validMark(mark)||locate(mark.slideIndex))){bubbleId=mark.id;pendingReveal=null}}
  if(bubbleId)renderBubble()
  notice.hidden=!lastDeleted;noticeText.textContent='已删除标注';const r=host.getBoundingClientRect();notice.style.left=Math.max(8,r.left+8)+'px';notice.style.top=Math.min(win.innerHeight-42,r.bottom-42)+'px'
  options.onState?.({count:s.marks.length,busy:s.busy,error:s.error||localError,tool})
 }
 function schedule(){if(!current()||frame)return;frame=win.requestAnimationFrame(()=>{frame=0;render()})}
 const writeComment=()=>{if(!bubbleId||composing)return;const id=bubbleId,text=comment.value;if(markById(id)?.comment===text)return;void run(()=>handle.updateComment(id,text))}
 comment.addEventListener('input',writeComment);comment.addEventListener('compositionstart',()=>{composing=true});comment.addEventListener('compositionend',()=>{composing=false;writeComment()})
 const outside=event=>{if(!own(event.target)){menu.hidden=true;closeMarkList();if(!host.contains(event.target)||!slideFor(event.target))closeBubble()}}
 const key=event=>{if(event.isComposing||event.defaultPrevented)return;if(event.key==='Escape'){const returnFocus=!list.hidden;closeBubble();cancelGesture();reanchorId=null;if(returnFocus)count.focus({preventScroll:true});return}if(event.target===count&&event.key==='ArrowDown'){event.preventDefault();if(list.hidden)toggleMarkList();else list.querySelector('button')?.focus({preventScroll:true});return}if(!list.hidden&&list.contains(event.target)&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const items=[...list.querySelectorAll('button')],index=items.indexOf(doc.activeElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus({preventScroll:true});return}const pin=event.target.closest?.('[data-pptx-annotation-pin]');if(pin&&own(pin)&&['Delete','Backspace'].includes(event.key)){event.preventDefault();void run(()=>handle.remove(pin.dataset.pptxAnnotationPin)).then(ok=>{if(ok){lastDeleted=true;closeBubble();render()}})}}
 const observer=new win.MutationObserver(records=>{if(records.every(record=>own(record.target)||record.type==='childList'&&[...record.addedNodes,...record.removedNodes].every(own)))return;schedule()})
 observer.observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:['style','data-mounted']})
 const geometryChanged=()=>{cancelGesture();schedule()}
 const resize=typeof win.ResizeObserver==='function'?new win.ResizeObserver(geometryChanged):null;resize?.observe(host)
 const off=handle.subscribe(schedule)
 host.addEventListener('pointerdown',down,true);host.addEventListener('pointermove',move,true);host.addEventListener('pointerup',up,true);host.addEventListener('pointercancel',cancel,true);host.addEventListener('lostpointercapture',cancel,true)
 doc.addEventListener('pointerdown',outside,true);doc.addEventListener('keydown',key);win.addEventListener('blur',cancel);win.addEventListener('resize',geometryChanged);doc.addEventListener('scroll',geometryChanged,true)
 const destroy=()=>{if(disposed)return;options.signal?.removeEventListener('abort',destroy);cancelGesture();disposed=true;stop.abort();if(frame)win.cancelAnimationFrame(frame);off?.();observer.disconnect();resize?.disconnect();host.removeEventListener('pointerdown',down,true);host.removeEventListener('pointermove',move,true);host.removeEventListener('pointerup',up,true);host.removeEventListener('pointercancel',cancel,true);host.removeEventListener('lostpointercapture',cancel,true);doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('keydown',key);win.removeEventListener('blur',cancel);win.removeEventListener('resize',geometryChanged);doc.removeEventListener('scroll',geometryChanged,true);for(const[wrapper,layer]of layers){layer.element.remove();if(layer.parent.style.position==='relative'&&layer.position!=='relative')layer.parent.style.position=layer.position}layers.clear();listItems.clear();toolbar.remove();bubble.remove();menu.remove();list.remove();notice.remove();style.remove()}
 if(options.signal){if(options.signal.aborted)destroy();else options.signal.addEventListener('abort',destroy,{once:true})}
 if(!disposed)render()
 return{destroy,setTool,closeBubble}
}
