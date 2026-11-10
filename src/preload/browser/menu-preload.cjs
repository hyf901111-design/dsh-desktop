const {ipcRenderer}=require('electron')
window.addEventListener('DOMContentLoaded',()=>{
 document.documentElement.lang='zh-CN'
 const style=document.createElement('style'),reset=document.createElement('style'),content=document.createElement('main')
 content.id='native-menu-content'
 reset.textContent='html,body{margin:0!important;width:100%;height:100%;overflow:hidden!important;background:transparent!important}#native-menu-content{position:fixed;inset:0;overflow:visible}#native-menu-content :focus-visible{outline:2px solid #498df4;outline-offset:1px}[data-native-clickable]:not(:disabled):is(:hover,[data-native-hovered]){background-color:var(--native-menu-hover,#8882)!important}'
 document.head.append(style,reset);document.body.append(content)
 let state,composing,queued,lastComposition,paintToken=0,hoverId
 const control=target=>target instanceof Element?target.closest('[data-native-control]'):null
 const id=element=>element?.getAttribute('data-native-control')
 const editable=element=>element instanceof HTMLInputElement&&!['button','submit','reset','checkbox','radio','file','color','range'].includes(element.type)||element instanceof HTMLTextAreaElement||element?.isContentEditable
 const selection=element=>{try{return typeof element.selectionStart==='number'?{selectionStart:element.selectionStart,selectionEnd:element.selectionEnd}: {}}catch{return {}}}
 const emit=(kind,element,extra={})=>{if(!state||state.passive)return;ipcRenderer.send('browser-app:menu-action',{id:state.id,revision:state.revision,_request:state._request,kind,...(id(element)?{controlId:id(element)}:{}),...selection(element),...extra})}
 const focusElement=key=>[...content.querySelectorAll('[data-native-control]')].find(element=>id(element)===key)
 const hover=target=>{const element=target instanceof Element?target.closest('[data-native-clickable]'):null,next=element&&!element.matches(':disabled,[aria-disabled=true]')?id(element):undefined;for(const previous of content.querySelectorAll('[data-native-hovered]'))if(id(previous)!==next)previous.removeAttribute('data-native-hovered');hoverId=next;if(next)element.setAttribute('data-native-hovered','')}
 const syncAttributes=(old,next)=>{
  for(const attribute of [...old.attributes])if(!next.hasAttribute(attribute.name))old.removeAttribute(attribute.name)
  for(const attribute of [...next.attributes])if(old.getAttribute(attribute.name)!==attribute.value)old.setAttribute(attribute.name,attribute.value)
 }
 const patch=(old,next)=>{
  if(old.nodeType!==next.nodeType||old.nodeType===1&&old.tagName!==next.tagName){old.replaceWith(next);return next}
  if(old.nodeType!==1){if(old.nodeValue!==next.nodeValue)old.nodeValue=next.nodeValue;return old}
  const focused=old===document.activeElement,value=focused&&editable(old)?old.value:undefined,caret=focused?selection(old):{}
  syncAttributes(old,next)
  if(old instanceof HTMLInputElement){if(value!==undefined)old.value=value;else if(old.value!==next.value)old.value=next.value;old.checked=next.checked}
  if(old instanceof HTMLTextAreaElement&&value===undefined&&old.value!==next.value)old.value=next.value
  const children=[...old.childNodes],key=node=>node.nodeType===1&&node.getAttribute('data-native-control'),byKey=new Map(children.filter(key).map(node=>[key(node),node])),used=new Set();let cursor=old.firstChild
  for(const child of [...next.childNodes]){
   const childKey=key(child),candidate=childKey?byKey.get(childKey):cursor&&!key(cursor)&&cursor.nodeType===child.nodeType?cursor:undefined
   const result=candidate&&!used.has(candidate)?patch(candidate,child):child
   if(candidate===cursor&&candidate?.parentNode!==old)cursor=result
   used.add(result);if(result!==cursor)old.insertBefore(result,cursor);cursor=result.nextSibling
  }
  for(const child of [...old.childNodes])if(!used.has(child))child.remove()
  if(value!==undefined&&old.value!==value)old.value=value
  if(old instanceof HTMLSelectElement&&old.value!==next.value)old.value=next.value
  if(focused&&caret.selectionStart!==undefined){try{old.setSelectionRange(caret.selectionStart,caret.selectionEnd)}catch{}}
  return old
 }
 const paint=async(value)=>{
  const token=++paintToken
  if(document.fonts?.ready)await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,250))])
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
  if(token===paintToken&&state?._request===value._request)ipcRenderer.send('browser-app:menu-action',{kind:'painted',id:value.id,revision:value.revision,_request:value._request})
 }
 const render=(value,preserveComposition=false)=>{
  const same=state?.id===value.id,active=same?document.activeElement:null,activeId=id(active),caret=selection(active),scrolls=new Map([...content.querySelectorAll('[data-native-control]')].map(element=>[id(element),{top:element.scrollTop,left:element.scrollLeft}]))
  const template=document.createElement('template');template.innerHTML=value.html
  // Only a trusted menu subtree is accepted. Executable or navigable document
  // furniture cannot become active in this isolated surface.
  for(const element of template.content.querySelectorAll('script,iframe,object,embed,link,meta,base'))element.remove()
  for(const element of template.content.querySelectorAll('*'))for(const attribute of [...element.attributes])if(/^on/i.test(attribute.name)||['srcdoc','formaction'].includes(attribute.name))element.removeAttribute(attribute.name)
  if(!same){content.replaceChildren(template.content);composing=undefined;queued=undefined}else{const next=document.createElement('main');next.id=content.id;next.append(template.content);patch(content,next)}
  style.textContent=typeof value.css==='string'?value.css:'';state=value
  if(!same)hoverId=undefined;hover(focusElement(hoverId))
  if(same)for(const [key,scroll]of scrolls){const element=focusElement(key);if(element){element.scrollTop=scroll.top;element.scrollLeft=scroll.left}}
  const desired=value.focusId?focusElement(value.focusId):activeId?focusElement(activeId):content.querySelector('input:not(:disabled),textarea:not(:disabled),select:not(:disabled),button:not(:disabled),[tabindex="0"]')
  if(!value.passive&&!value.focusOwner&&desired&&!desired.disabled){if(document.activeElement!==desired){desired.focus({preventScroll:true});if(!editable(desired))desired.scrollIntoView({block:'nearest',inline:'nearest'})}const wanted=!preserveComposition&&value.selection&&(!value.focusId||id(desired)===value.focusId)?{selectionStart:value.selection.start,selectionEnd:value.selection.end,direction:value.selection.direction}:id(desired)===activeId?caret:undefined;if(wanted?.selectionStart!==undefined)try{desired.setSelectionRange(wanted.selectionStart,wanted.selectionEnd,wanted.direction)}catch{}}
  if(!same&&!value.passive&&!value.reducedMotion)content.animate?.([{opacity:0},{opacity:1}],{duration:90,easing:'ease-out'})
  void paint(value)
 }
 ipcRenderer.on('browser-app:menu-clear',async(_event,value)=>{
  paintToken++;state=undefined;composing=undefined;queued=undefined;lastComposition=undefined;hoverId=undefined;content.replaceChildren()
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
  ipcRenderer.send('browser-app:menu-action',{kind:'cleared',_clear:value?._clear})
 })
 ipcRenderer.on('browser-app:menu-state',(_event,value)=>{
  if(!value||typeof value.id!=='string'||typeof value.html!=='string')return
  if(composing&&state?.id===value.id){state=value;queued=value;void paint(value);return}
  render(value)
 })
 document.addEventListener('compositionstart',event=>{composing=control(event.target)})
 document.addEventListener('compositionend',event=>{
  const element=control(event.target),text=element?.value,caret=selection(element),key=id(element);composing=undefined
  if(queued){const value=queued;queued=undefined;render(value,true)}
  const target=focusElement(key)||element;if(target&&text!==undefined){target.value=text;if(caret.selectionStart!==undefined)try{target.setSelectionRange(caret.selectionStart,caret.selectionEnd)}catch{}lastComposition={element:target,value:text};emit('input',target,{value:text})}
 })
 document.addEventListener('input',event=>{const element=control(event.target);if(!element||element.matches('input[type=checkbox],input[type=radio]')||composing||event.isComposing)return;if(lastComposition?.element===element&&lastComposition.value===element.value){lastComposition=undefined;return}emit('input',element,{value:element.value,...('checked'in element?{checked:element.checked}:{})})})
 document.addEventListener('change',event=>{const element=control(event.target);if(element&&!element.matches('input[type=checkbox],input[type=radio]')&&!composing)emit('change',element,{...('value'in element?{value:element.value}:{}),...('checked'in element?{checked:element.checked}:{})})})
 let outsidePress
 document.addEventListener('pointerdown',event=>{if(!(event.target instanceof Element)||!event.target.closest('[role=menu],[role=dialog],[role=listbox],[data-native-menu-root]')){event.preventDefault();outsidePress={pointerId:event.pointerId,button:event.button}}},true)
 document.addEventListener('pointerup',event=>{if(outsidePress?.pointerId!==event.pointerId)return;const previous=outsidePress;outsidePress=undefined;event.preventDefault();const outside=!(event.target instanceof Element)||!event.target.closest('[data-native-menu-root],[role=menu],[role=dialog],[role=listbox]');emit('dismiss',null,outside?{through:{x:event.clientX,y:event.clientY,button:['left','middle','right'][previous.button]||'left'}}:{})},true)
 document.addEventListener('pointercancel',()=>{outsidePress=undefined})
 document.addEventListener('click',event=>{const element=event.target instanceof Element?event.target.closest('[data-native-clickable]')||control(event.target):null;if(!element||element.matches(':disabled,[aria-disabled=true]'))return;if(!element.matches('input,textarea,select,[contenteditable=true]'))event.preventDefault();emit('click',element)})
 for(const [name,over]of [['pointerover',true],['pointerout',false]])document.addEventListener(name,event=>{hover(over?event.target:event.relatedTarget);const element=control(event.target),related=control(event.relatedTarget);if(element&&element!==related)emit('pointer',element,{over})})
 document.addEventListener('pointermove',event=>hover(event.target))
 document.addEventListener('mouseleave',()=>hover(null))
 ipcRenderer.on('browser-app:menu-pointer',(_event,value)=>{if(!state||state.passive||!value||value.id!==state.id||value.revision!==state.revision||value._request!==state._request||!Number.isFinite(value.x)||!Number.isFinite(value.y))return;hover(value.x<0||value.y<0?null:document.elementFromPoint(value.x,value.y))})
 const navigation=new Set(['Escape','Enter',' ','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown']),shortcuts=new Set(['l','t','w','r','f','d','p','s','y','n'])
 document.addEventListener('keydown',event=>{
  if(composing||event.isComposing)return
  const element=control(event.target),editing=editable(element),local=editing&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||element instanceof HTMLTextAreaElement&&['ArrowUp','ArrowDown','PageUp','PageDown'].includes(event.key)
  if(editing&&event.key===' ')return
  if((local||element instanceof HTMLSelectElement&&!['Escape','Tab'].includes(event.key))&&!event.metaKey&&!event.ctrlKey)return
  if(!navigation.has(event.key)&&!((event.metaKey||event.ctrlKey)&&shortcuts.has(event.key.toLowerCase())))return
  event.preventDefault();emit('key',element,{key:event.key,metaKey:event.metaKey,ctrlKey:event.ctrlKey,shiftKey:event.shiftKey,altKey:event.altKey})
 },true)
 ipcRenderer.on('browser-app:menu-key',(_event,value)=>{
  if(!state||state.material!=='menu'||state.passive||state.focusOwner||composing||!value||value.id!==state.id||value.revision!==state.revision||value._request!==state._request||!navigation.has(value.key)||value.metaKey||value.ctrlKey||value.altKey)return
  const active=control(document.activeElement),element=active&&!active.matches(':disabled,[aria-disabled=true]')?active:[...content.querySelectorAll('[data-native-clickable],button,[role=menuitem],[role=menuitemradio],[role=option]')].find(element=>!element.matches(':disabled,[aria-disabled=true]')&&!editable(element))
  if(!element){if(value.key==='Escape')emit('dismiss',null);return}
  element.dispatchEvent(new KeyboardEvent('keydown',{key:value.key,shiftKey:value.shiftKey===true,bubbles:true,cancelable:true}))
 })
 const scrolling=new Map();let scrollFrame=0
 document.addEventListener('scroll',event=>{const element=control(event.target);if(!element)return;scrolling.set(id(element),element);if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;for(const element of scrolling.values())if(element.isConnected)emit('scroll',element,{scrollTop:element.scrollTop,scrollLeft:element.scrollLeft});scrolling.clear()})},true)
 document.addEventListener('submit',event=>event.preventDefault())
 ipcRenderer.send('browser-app:menu-action',{kind:'ready'})
})
