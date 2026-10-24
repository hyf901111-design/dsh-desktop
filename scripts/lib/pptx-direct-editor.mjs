/** Actual renderer DOM remains the canvas; selection chrome lives above it. */
export function attachPptxDirectEditor(host,options){
 const doc=host.ownerDocument,win=doc.defaultView
 let selected=null,selectedId=null,gesture=null,enabled=true,destroyed=false,composing=false,indexedDocument=null,nodeIndex=new Map(),fieldIndex=new Map()
 const entry=options.getEntry(),originalTextStyles=(entry.textStyles||={}),knownFormats=entry.formatTouched||={},touchedFormats=new Map(),styleKeys=['fontFamily','fontSize','fontWeight','color'],initialParagraphs=new WeakSet(host.querySelectorAll('[data-pptx-paragraph]'))
 const initialFormats=new Map(Object.entries(entry.objects||{}).map(([id,change])=>[id,new Set(styleKeys.filter(key=>(key==='fontWeight'?change.bold:change[key])!==undefined))]))
 const clipper=doc.createElement('div');clipper.className='sherlock-ppt-selection-clip';clipper.style.cssText='position:fixed;z-index:100000;pointer-events:none;overflow:hidden;display:none;'
 const overlay=doc.createElement('div');overlay.className='sherlock-ppt-selection';overlay.style.cssText='position:absolute;pointer-events:none;box-sizing:border-box;border:1px solid #526fff;transform-origin:0 0;display:none;'
 const rotateCursor='url("data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M25 12A10 10 0 1 0 25 22M25 5v8h-8" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M25 12A10 10 0 1 0 25 22M25 5v8h-8" fill="none" stroke="#222" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>')+'") 16 16, crosshair'
 const handleNames=['move','nw','n','ne','e','se','s','sw','w','rotate']
 for(const name of handleNames){const handle=doc.createElement('button');handle.type='button';handle.dataset.pptxHandle=name;handle.setAttribute('aria-label',name==='move'?'拖动对象':name==='rotate'?'旋转对象':'缩放对象 '+name);handle.title=handle.getAttribute('aria-label');handle.style.cssText='position:absolute;pointer-events:auto;border:1px solid #526fff;background:white;padding:0;width:8px;height:8px;border-radius:1px;';
  if(name==='move'){handle.style.cssText+='left:0;top:-18px;width:36px;height:16px;cursor:move;font-size:10px;color:#526fff;';handle.textContent='↔'}
  else if(name==='rotate'){handle.style.cssText+='left:50%;top:-28px;border-radius:50%;transform:translate(-50%,-50%);';handle.style.cursor=rotateCursor}
  else{handle.style.left=name.includes('w')?'0':name.includes('e')?'100%':'50%';handle.style.top=name.includes('n')?'0':name.includes('s')?'100%':'50%';handle.style.transform='translate(-50%,-50%)';handle.style.cursor=['n','s'].includes(name)?'ns-resize':['e','w'].includes(name)?'ew-resize':['nw','se'].includes(name)?'nwse-resize':'nesw-resize'}
  overlay.appendChild(handle)
 }
 clipper.appendChild(overlay);doc.body.appendChild(clipper)
 const index=()=>{const document=options.getEntry()?.document;if(document===indexedDocument)return;indexedDocument=document;nodeIndex=new Map();fieldIndex=new Map();for(const slide of document?.slides||[]){for(const node of slide.nodes||[])nodeIndex.set(node.part+'#node:'+node.nodeId,node);for(const field of slide.fields)fieldIndex.set(JSON.stringify([slide.part,field.nodeId,field.paragraphIndex,field.row,field.column]),field)}}
 const model=element=>{index();return nodeIndex.get(element.dataset.pptxPart+'#node:'+element.dataset.pptxNodeId)}
 const currentNode=()=>{index();const n=nodeIndex.get(selectedId);if(!n)return null;const value={...n,...options.getEntry()?.objects?.[n.id]};if(!value.fontFamily&&selected){const text=selected.querySelector('[data-pptx-paragraph] span:not([data-pptx-bullet])')||selected.querySelector('[data-pptx-paragraph]');const family=text&&win.getComputedStyle(text).fontFamily?.split(',')[0]?.trim().replace(/^["']|["']$/g,'');if(family)value.fontFamily=family}return value}
 const identity=element=>element?.closest?.('[data-pptx-node-id]')
 const fieldFor=paragraph=>{const element=identity(paragraph),node=element&&model(element);if(!node)return null;const cell=paragraph.closest('[data-pptx-row]');return fieldIndex.get(JSON.stringify([node.part,node.nodeId,Number(paragraph.dataset.pptxParagraph),cell?Number(cell.dataset.pptxRow):undefined,cell?Number(cell.dataset.pptxColumn):undefined]))}
 const formatText=(paragraph,field)=>{
  const node=model(identity(paragraph)),change=options.getEntry()?.objects?.[node.id]||{},targets=[paragraph,...paragraph.querySelectorAll('span:not([data-pptx-bullet])')]
  let touched=touchedFormats.get(node.id);if(!touched&&knownFormats[node.id])touched=new Set(knownFormats[node.id]);if(!touched&&!styleKeys.some(key=>(key==='fontWeight'?change.bold:change[key])!==undefined))return;if(!touched)touched=new Set();touchedFormats.set(node.id,touched)
  const originals=originalTextStyles[field.id]||targets.map(()=>({}))
  targets.forEach((element,i)=>{const original=(originals[i]||={});for(const key of styleKeys){if(original[key]!==undefined)continue;const value=key==='fontWeight'?change.bold:change[key];if(initialFormats.get(node.id)?.has(key)&&(initialParagraphs.has(paragraph)||value!==undefined))continue;original[key]=element.style[key]||win.getComputedStyle(element)[key]||''}})
  originalTextStyles[field.id]=originals
  for(const key of styleKeys)if((key==='fontWeight'?change.bold:change[key])!==undefined)touched.add(key)
  knownFormats[node.id]=Array.from(touched)
  targets.forEach((element,i)=>{for(const key of touched){const value=key==='fontWeight'?change.bold:change[key],original=(originals[i]||originals[1]||originals[0])[key];if(value!==undefined||original!==undefined)element.style[key]=value===undefined?original:key==='fontWeight'?(value?'700':'400'):key==='fontSize'?value+'pt':key==='color'?'#'+value:value}})
 }
 const textOf=element=>{
  const walk=node=>{if(node.nodeType===3)return node.textContent;if(node.nodeType!==1||node.hasAttribute('data-pptx-bullet'))return'';if(node.tagName==='BR')return'\n';return Array.from(node.childNodes).map((c,i)=>((i>0&&c.nodeType===1&&['DIV','P'].includes(c.tagName))?'\n':'')+walk(c)).join('')}
  return walk(element).replace(/\u00a0/g,' ')
 }
 const setText=(paragraph,text)=>{const bullet=paragraph.querySelector('[data-pptx-bullet]'),style=Array.from(paragraph.querySelectorAll('span')).find(s=>!s.hasAttribute('data-pptx-bullet'))?.getAttribute('style');paragraph.replaceChildren();if(bullet)paragraph.appendChild(bullet);text.split('\n').forEach((line,index)=>{if(index)paragraph.appendChild(doc.createElement('br'));const span=doc.createElement('span');if(style)span.setAttribute('style',style);span.textContent=line;paragraph.appendChild(span)})}
 // Accumulate the linear parts of all CSS transforms, including slide zoom and groups.
 const matrix=(element,includeSelf=false)=>{let out=[1,0,0,1],e=includeSelf?element:element.parentElement;while(e){const value=win.getComputedStyle(e).transform;if(value&&value!=='none'){let m;try{const Matrix=win.DOMMatrix||win.WebKitCSSMatrix;if(Matrix){const v=new Matrix(value);m=[v.a,v.b,v.c,v.d]}}catch{}if(!m){const match=value.match(/^matrix\(([^)]+)\)/);if(match)m=match[1].split(',').slice(0,4).map(Number);else{const scale=value.match(/scale\(([^)]+)\)/);if(scale){const [x,y]=scale[1].split(',').map(Number);m=[x,0,0,y??x]}}}if(m){const[a,b,c,d]=m,[e,f,g,h]=out;out=[a*e+c*f,b*e+d*f,a*g+c*h,b*g+d*h]}}e=e.parentElement}return out}
 const inverse=(m,x,y)=>{const[a,b,c,d]=m,det=a*d-b*c;return Math.abs(det)>1e-10?{x:(d*x-c*y)/det,y:(a*y-b*x)/det}:{x,y}}
 const liveNode=id=>Array.from(host.querySelectorAll('[data-pptx-node-id]')).find(e=>!e.closest('[data-pptx-staging]')&&model(e)?.id===id)
 const visibleViewport=element=>{
  const viewport={left:0,top:0,right:win.innerWidth,bottom:win.innerHeight}
  for(let parent=element.parentElement;parent;parent=parent.parentElement){
   const style=win.getComputedStyle(parent),x=/^(auto|scroll|hidden|clip)$/.test(style.overflowX||style.overflow),y=/^(auto|scroll|hidden|clip)$/.test(style.overflowY||style.overflow)
   if(!x&&!y)continue
   const box=parent.getBoundingClientRect(),sx=parent.offsetWidth?box.width/parent.offsetWidth:1,sy=parent.offsetHeight?box.height/parent.offsetHeight:1
   const left=box.left+parent.clientLeft*sx,top=box.top+parent.clientTop*sy,right=left+(parent.offsetWidth?parent.clientWidth*sx:box.width),bottom=top+(parent.offsetHeight?parent.clientHeight*sy:box.height)
   if(x){viewport.left=Math.max(viewport.left,left);viewport.right=Math.min(viewport.right,right)}
   if(y){viewport.top=Math.max(viewport.top,top);viewport.bottom=Math.min(viewport.bottom,bottom)}
  }
  return viewport
 }
 const hidePosition=()=>{clipper.style.display='none';overlay.style.display='none';options.position?.(null)}
 const updatePosition=()=>{
  if(!enabled||!selectedId){hidePosition();return}
  if(!selected?.isConnected||selected.closest('[data-pptx-staging]'))selected=liveNode(selectedId)
  if(!selected){hidePosition();return}
  const rect=selected.getBoundingClientRect(),w=parseFloat(selected.style.width)||selected.offsetWidth,h=parseFloat(selected.style.height)||selected.offsetHeight,m=matrix(selected,true),[a,b,c,d]=m
  const viewport=visibleViewport(selected),left=Math.max(rect.left,viewport.left),top=Math.max(rect.top,viewport.top),right=Math.min(rect.right,viewport.right),bottom=Math.min(rect.bottom,viewport.bottom)
  if(right<=left||bottom<=top){hidePosition();return}
  Object.assign(clipper.style,{display:'block',left:viewport.left+'px',top:viewport.top+'px',width:viewport.right-viewport.left+'px',height:viewport.bottom-viewport.top+'px'})
  const xs=[0,a*w,c*h,a*w+c*h],ys=[0,b*w,d*h,b*w+d*h]
  overlay.style.left=(rect.left-Math.min(...xs)-viewport.left)+'px';overlay.style.top=(rect.top-Math.min(...ys)-viewport.top)+'px';overlay.style.width=w+'px';overlay.style.height=h+'px';overlay.style.transform=`matrix(${a},${b},${c},${d},0,0)`;overlay.style.display='block'
  options.position?.({left,top,right,bottom,width:right-left,height:bottom-top,viewport});
  // Keep handles at a usable screen size regardless of slide zoom.
  const sx=Math.hypot(a,b)||1,sy=Math.hypot(c,d)||1
  for(const button of overlay.children){button.style.width=(button.dataset.pptxHandle==='move'?36:8)/sx+'px';button.style.height=(button.dataset.pptxHandle==='move'?16:8)/sy+'px';if(button.dataset.pptxHandle==='move'){button.style.top=-18/sy+'px';button.style.fontSize=12/sy+'px';button.style.lineHeight='1';}if(button.dataset.pptxHandle==='rotate')button.style.top=-28/sy+'px'}
 }
 const select=element=>{selected=element;selectedId=element&&model(element)?.id;updatePosition();options.select?.(currentNode());return currentNode()}
 const refresh=(paragraphs=host.querySelectorAll('[data-pptx-paragraph]'))=>{
  if(destroyed)return
  for(const paragraph of paragraphs){if(!host.contains(paragraph)||paragraph.closest('[data-pptx-staging]'))continue;const field=fieldFor(paragraph);if(!field)continue;for(const[name,value]of[['contenteditable',String(enabled)],['role','textbox'],['aria-label',field.label],['spellcheck','false'],['data-pptx-field-id',field.id]])if(paragraph.getAttribute(name)!==String(value))paragraph.setAttribute(name,String(value));paragraph.style.cursor=enabled?'text':'';paragraph.style.minHeight='1em';paragraph.querySelectorAll('[data-pptx-bullet]').forEach(b=>{if(b.getAttribute('contenteditable')!=='false')b.contentEditable='false'});const value=options.getEntry()?.values[field.id];if(doc.activeElement!==paragraph&&value!==undefined&&textOf(paragraph)!==value)setText(paragraph,value);formatText(paragraph,field)}
  updatePosition()
 }
 const down=event=>{if(!enabled||event.button!==0)return;const element=identity(event.target);if(!element||!host.contains(element)||!model(element))return;event.stopPropagation();select(element);if(!event.target.closest('[data-pptx-field-id]')){event.preventDefault();element.tabIndex=-1;element.focus({preventScroll:true})}}
 const input=event=>{const paragraph=event.target.closest?.('[data-pptx-field-id]');if(!paragraph||!enabled)return;event.stopPropagation();const value=textOf(paragraph);if(value.length<=100000)options.changeText(paragraph.dataset.pptxFieldId,value,!composing)}
 const focus=event=>{if(event.target.hasAttribute?.('data-pptx-field-id')){options.begin?.();const element=identity(event.target);if(element)select(element)}}
 const blur=event=>{if(event.target.hasAttribute?.('data-pptx-field-id')){options.end?.();options.renderPending?.()}}
 const paste=event=>{if(!event.target.closest?.('[data-pptx-field-id]'))return;event.preventDefault();event.stopPropagation();const value=event.clipboardData?.getData('text/plain')||'';doc.execCommand('insertText',false,value)}
 const keys=event=>{if(!enabled)return;const paragraph=event.target.closest?.('[data-pptx-field-id]');if(paragraph){event.stopPropagation();
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='a'&&!composing&&!event.isComposing){
   // Native select-all can escape this field into the containing Notes editor.
   event.preventDefault();paragraph.focus({preventScroll:true})
   const range=doc.createRange(),selection=win.getSelection();range.selectNodeContents(paragraph);selection?.removeAllRanges();selection?.addRange(range);return
  }
  if(event.key==='Enter'&&!event.isComposing){event.preventDefault();doc.execCommand('insertLineBreak',false);input({target:paragraph,stopPropagation(){}})}if(event.key==='Escape'){event.preventDefault();paragraph.blur();select(null)}return}if(selectedId&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();const node=currentNode(),g=node.geometry;if(g){options.begin?.();const step=event.shiftKey?10:1;const geometry={...g,x:g.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),y:g.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)};const dx=geometry.x-g.x,dy=geometry.y-g.y,parent=selected.parentElement?.closest('[data-pptx-node-id]');selected.style.left=((parseFloat(selected.style.left)||0)+dx*(Number(selected.dataset.pptxPositionScaleX)||(parseFloat(selected.style.width)/g.width)*(parent?.dataset.pptxFlipH==='true'?-1:1)))+'px';selected.style.top=((parseFloat(selected.style.top)||0)+dy*(Number(selected.dataset.pptxPositionScaleY)||(parseFloat(selected.style.height)/g.height)*(parent?.dataset.pptxFlipV==='true'?-1:1)))+'px';options.changeObject(node.id,{geometry});options.end?.();updatePosition();options.select?.(currentNode());options.render?.()}}if(event.key==='Escape')select(null)}
 const double=event=>{const element=identity(event.target),node=element&&model(element);if(enabled&&node?.chart){event.preventDefault();event.stopPropagation();select(element);options.editChart?.(currentNode())}}
 const start=event=>{
  const handle=event.target.closest('[data-pptx-handle]'),node=currentNode();if(!handle||!node?.geometry)return
  event.preventDefault();event.stopPropagation();doc.activeElement?.blur?.();options.interaction?.(true);options.begin?.();const g=node.geometry,w=parseFloat(selected.style.width)||selected.offsetWidth||g.width,h=parseFloat(selected.style.height)||selected.offsetHeight||g.height,rect=selected.getBoundingClientRect()
  const parent=selected.parentElement?.closest('[data-pptx-node-id]'),flipX=parent?.dataset.pptxFlipH==='true'?-1:1,flipY=parent?.dataset.pptxFlipV==='true'?-1:1
  gesture={handle:handle.dataset.pptxHandle,id:node.id,g:{...g},startX:event.clientX,startY:event.clientY,matrix:matrix(selected,handle.dataset.pptxHandle!=='move'),moveMatrix:matrix(selected),ratioX:g.width/w,ratioY:g.height/h,positionX:Number(selected.dataset.pptxPositionScaleX)||(w/g.width)*flipX,positionY:Number(selected.dataset.pptxPositionScaleY)||(h/g.height)*flipY,positionWidth:Number(selected.dataset.pptxPositionWidth)||0,positionHeight:Number(selected.dataset.pptxPositionHeight)||0,flipX,flipY,left:parseFloat(selected.style.left)||0,top:parseFloat(selected.style.top)||0,w,h,transform:selected.style.transform,cx:rect.left+rect.width/2,cy:rect.top+rect.height/2,angle:Math.atan2(event.clientY-(rect.top+rect.height/2),event.clientX-(rect.left+rect.width/2))}
  handle.setPointerCapture?.(event.pointerId)
 }
 const move=event=>{
  if(!gesture)return;event.preventDefault();event.stopPropagation();const t=gesture,dx=event.clientX-t.startX,dy=event.clientY-t.startY,p=inverse(t.matrix,dx,dy),g={...t.g}
  if(t.handle==='move'){g.x+=p.x/t.positionX;g.y+=p.y/t.positionY;selected.style.left=t.left+p.x+'px';selected.style.top=t.top+p.y+'px'}
  else if(t.handle==='rotate'){let angle=(Math.atan2(event.clientY-t.cy,event.clientX-t.cx)-t.angle)*180/Math.PI;g.rotation=t.g.rotation+angle;if(event.shiftKey)g.rotation=Math.round(g.rotation/15)*15;selected.style.transform=/rotate\(/.test(t.transform)?t.transform.replace(/rotate\([^)]*\)/,`rotate(${g.rotation}deg)`):`rotate(${g.rotation}deg) `+t.transform}
  else{const x=t.handle.includes('e')?p.x:t.handle.includes('w')?-p.x:0,y=t.handle.includes('s')?p.y:t.handle.includes('n')?-p.y:0;g.width=Math.max(2,t.g.width+x*t.ratioX);g.height=Math.max(2,t.g.height+y*t.ratioY);if(event.shiftKey){const factor=Math.max(g.width/t.g.width,g.height/t.g.height);g.width=t.g.width*factor;g.height=t.g.height*factor}const lx=t.handle.includes('w')?(t.g.width-g.width)/t.ratioX:0,ly=t.handle.includes('n')?(t.g.height-g.height)/t.ratioY:0;const dcx=(g.width-t.g.width)/t.ratioX/2,dcy=(g.height-t.g.height)/t.ratioY/2,worldX=t.matrix[0]*(lx+dcx)+t.matrix[2]*(ly+dcy),worldY=t.matrix[1]*(lx+dcx)+t.matrix[3]*(ly+dcy),delta=inverse(t.moveMatrix,worldX,worldY),shift={x:delta.x-dcx,y:delta.y-dcy};g.x+=(shift.x-t.positionWidth*(g.width-t.g.width))/t.positionX;g.y+=(shift.y-t.positionHeight*(g.height-t.g.height))/t.positionY;selected.style.left=t.left+shift.x+'px';selected.style.top=t.top+shift.y+'px';selected.style.width=g.width/t.ratioX+'px';selected.style.height=g.height/t.ratioY+'px'}
  options.changeObject(t.id,{geometry:g},false);updatePosition()
 }
 const end=()=>{if(!gesture)return;gesture=null;options.interaction?.(false);if(selected?.isConnected){selected.tabIndex=-1;selected.focus({preventScroll:true})}options.end?.();options.render?.();options.select?.(currentNode())}
 const clearSelection=()=>{if(host.contains(doc.activeElement))doc.activeElement?.blur?.();select(null)}
 const outside=event=>{if(!selectedId||gesture||overlay.contains(event.target)||options.isToolTarget?.(event.target))return;const element=identity(event.target);if(element&&host.contains(element))return;clearSelection()}
 doc.addEventListener('pointerdown',outside,true)
 // ECharts canvas and image descendants do not change paragraph identities.
 // Annotate only added/replaced text; still update retained selection on removal.
 const observer=new win.MutationObserver(records=>{
  const paragraphs=new Set()
  for(const record of records){
   const paragraph=record.target.closest?.('[data-pptx-paragraph]');if(paragraph)paragraphs.add(paragraph)
   for(const node of record.addedNodes){if(node.nodeType!==1)continue;if(node.matches('[data-pptx-paragraph]'))paragraphs.add(node);node.querySelectorAll('[data-pptx-paragraph]').forEach(p=>paragraphs.add(p))}
  }
  refresh(paragraphs)
 });observer.observe(host,{childList:true,subtree:true})
 const resize=win.ResizeObserver?new win.ResizeObserver(updatePosition):null;resize?.observe(host)
 const handlers=[['pointerdown',down],['input',input],['focusin',focus],['focusout',blur],['paste',paste],['keydown',keys],['dblclick',double],['compositionstart',()=>{composing=true}],['compositionend',event=>{composing=false;input(event)}]]
 handlers.forEach(([name,fn])=>host.addEventListener(name,fn,true));overlay.addEventListener('pointerdown',start);doc.addEventListener('pointermove',move,true);doc.addEventListener('pointerup',end,true);doc.addEventListener('pointercancel',end,true);doc.addEventListener('scroll',updatePosition,true);win.addEventListener('resize',updatePosition)
 refresh()
 return{refresh,clearSelection,selectId(id){const element=liveNode(id);if(element)select(element)},setEnabled(value){enabled=value;if(!value)select(null);refresh()},destroy(){destroyed=true;doc.removeEventListener('pointerdown',outside,true);observer.disconnect();resize?.disconnect();clipper.remove();handlers.forEach(([name,fn])=>host.removeEventListener(name,fn,true));doc.removeEventListener('pointermove',move,true);doc.removeEventListener('pointerup',end,true);doc.removeEventListener('pointercancel',end,true);doc.removeEventListener('scroll',updatePosition,true);win.removeEventListener('resize',updatePosition);host.querySelectorAll('[data-pptx-field-id]').forEach(p=>p.removeAttribute('contenteditable'))}}
}
