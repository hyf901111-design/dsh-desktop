type MenuBridge={request(method:string,input?:Record<string,unknown>):Promise<any>;subscribeAction(listener:(value:any)=>void):()=>void}
type Projected={element:HTMLElement;aria:string|null;inert:boolean}
const selector='[data-browser-panel],.eb-suggestions,.eb-find,.st-menu,.JObwrW_panel[popover]:popover-open,[role=menu],[role=listbox],[role=tooltip],.eb-toast,.srb-notification,[role=status],[role=alert],.odyssey-subagent-composer-popover'
const passiveSurface=(element:HTMLElement)=>element.matches('[role=tooltip],.eb-toast,.srb-notification,[role=status],[role=alert]')&&!element.querySelector('button,input,select,textarea,a,[tabindex]')
const actionable='button,a,input,textarea,select,label,[role=menuitem],[role=menuitemradio],[role=option],[data-action],[tabindex]'
const styleProperties=('display position box-sizing width height min-width min-height max-width max-height margin-top margin-right margin-bottom margin-left padding-top padding-right padding-bottom padding-left border-top border-right border-bottom border-left border-radius background-color background-image background-size background-position background-repeat background-clip box-shadow color opacity visibility font-family font-size font-weight font-style font-variation-settings font-feature-settings font-optical-sizing font-kerning font-synthesis text-rendering -webkit-font-smoothing color-scheme line-height letter-spacing text-align text-transform text-decoration white-space word-break overflow-wrap text-overflow overflow-x overflow-y overscroll-behavior scrollbar-width flex-grow flex-shrink flex-basis flex-direction flex-wrap align-items align-self justify-content gap row-gap column-gap grid-template-columns grid-template-rows grid-auto-flow grid-column order vertical-align mask-image mask-size mask-repeat mask-position z-index top right bottom left transform transform-origin translate cursor outline object-fit object-position list-style appearance accent-color resize writing-mode fill stroke stroke-width stroke-linecap stroke-linejoin').split(' ')

/** Project trusted application controls into a native sibling, never the webpage. */
export class NativeBrowserMenuProjection{
 private observer:MutationObserver;private resize:ResizeObserver|undefined;private frame=0;private disposed=false;private request=0
 private roots:Projected[]=[];private controls=new Map<string,Element>();private ids=new Map<string,string>();private nextId=0
 private context='';private group='';private id='';private revision=0;private signature='';private focusId='';private selection?:{start:number;end:number;direction?:string}
 private scrollStyles:string[]=[];private fontStyles?:string;private unsubscribe:()=>void;private style:HTMLStyleElement
 constructor(private document:Document,private bridge:MenuBridge){
  this.style=document.createElement('style');this.style.textContent='[data-browser-projected]{opacity:0!important;pointer-events:none!important}';document.head.append(this.style)
  this.observer=new document.defaultView!.MutationObserver(records=>{if(records.some(record=>!this.style.contains(record.target)&&!(record.type==='attributes'&&['data-browser-projected','inert','aria-hidden'].includes(record.attributeName||'')&&this.roots.some(root=>root.element===record.target))))void this.sync()})
  this.observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true})
  if(document.defaultView?.ResizeObserver)this.resize=new document.defaultView.ResizeObserver(this.schedule)
  document.addEventListener('scroll',this.schedule,true);document.addEventListener('focusin',this.focus,true);document.defaultView!.addEventListener('resize',this.schedule)
  this.unsubscribe=bridge.subscribeAction(this.action);this.schedule()
 }
 private schedule=()=>{if(!this.disposed&&!this.frame)this.frame=this.document.defaultView!.requestAnimationFrame(()=>{this.frame=0;void this.sync()})}
 private focus=()=>{const active=this.document.activeElement;if(active&&this.roots.some(root=>root.element.contains(active))){const row=[...this.controls].find(([,element])=>element===active);if(row){this.focusId=row[0];this.readSelection(active);this.schedule()}}}
 private readSelection(element:Element){const input=element as HTMLInputElement;if(typeof input.selectionStart==='number')this.selection={start:input.selectionStart,end:input.selectionEnd??input.selectionStart,direction:input.selectionDirection??undefined};else this.selection=undefined}
 private restore(root:Projected){delete root.element.dataset.browserProjected;if(root.aria===null)root.element.removeAttribute('aria-hidden');else root.element.setAttribute('aria-hidden',root.aria);root.element.inert=root.inert;this.resize?.unobserve(root.element)}
 private reset(){this.request++;for(const root of this.roots)this.restore(root);this.roots=[];this.controls.clear();this.ids.clear();this.group='';this.signature='';this.focusId='';this.selection=undefined;const id=this.id;this.id='';if(id)void this.bridge.request('menu-hide',{id}).catch(()=>{})}
 private key(element:Element,root:Element){const path:number[]=[];let current:Element|null=element;while(current&&current!==root){path.unshift([...current.parentElement!.children].indexOf(current));current=current.parentElement}return [root.getAttribute('data-browser-panel')||root.className,element.tagName,...['data-field','data-action','data-id','data-row-id','data-folder','data-url','name','aria-label','role'].map(name=>element.getAttribute(name)||''),path.join('.')].join('|')}
 private controlId(element:Element,root:Element){const key=this.key(element,root);let id=this.ids.get(key);if(!id){id='c'+(++this.nextId);this.ids.set(key,id)}this.controls.set(id,element);return id}
 private fontCss(){if(this.fontStyles!==undefined)return this.fontStyles;const result:string[]=[];for(const sheet of this.document.styleSheets){try{for(const rule of sheet.cssRules)if(rule.type===5){const text=rule.cssText.replace(/url\((['"]?)(.*?)\1\)/g,(_match,quote,url)=>{try{const target=new URL(url,sheet.href||this.document.baseURI);return url.startsWith('data:font/')||target.origin===new URL(this.document.baseURI).origin?`url("${target.href}")`:'url("")'}catch{return'url("")'}});result.push(text)}}catch{}}return this.fontStyles=result.join('\n').slice(0,80000)}
 private scrollbar(element:Element,id:string,style:CSSStyleDeclaration){
  if(!['auto','scroll'].includes(style.overflowX)&&!['auto','scroll'].includes(style.overflowY))return
  for(const pseudo of ['::-webkit-scrollbar','::-webkit-scrollbar-thumb','::-webkit-scrollbar-track','::-webkit-scrollbar-corner']){
   const paint=this.document.defaultView!.getComputedStyle(element,pseudo)
   this.scrollStyles.push(`[data-native-control="${id}"]${pseudo}{${['width','height','display','background-color','border-radius'].map(name=>name+':'+paint.getPropertyValue(name)).join(';')}}`)
  }
 }
 private clone(element:Element,root:Element):Element|null{
  if(['SCRIPT','STYLE','LINK','IFRAME','OBJECT','EMBED'].includes(element.tagName))return null
  const copy=element.cloneNode(false) as HTMLElement,style=this.document.defaultView!.getComputedStyle(element),id=this.controlId(element,root)
  for(const attribute of [...copy.attributes])if(/^on/i.test(attribute.name)||['inert','autofocus','data-browser-projected'].includes(attribute.name))copy.removeAttribute(attribute.name)
  this.scrollbar(element,id,style);copy.setAttribute('data-native-control',id);if(element.matches(actionable))copy.setAttribute('data-native-clickable','')
  if(copy.hasAttribute('href'))copy.setAttribute('href','#')
  if(element instanceof this.document.defaultView!.HTMLImageElement)copy.setAttribute('src',element.currentSrc||element.src)
  const properties=styleProperties.map(name=>name+':'+style.getPropertyValue(name))
  copy.setAttribute('style',properties.join(';')+';animation:none;transition:none;caret-color:currentColor;pointer-events:auto')
  if(element===root){copy.setAttribute('data-native-menu-root','');copy.removeAttribute('aria-hidden');copy.style.visibility='visible';copy.style.opacity='1';copy.style.pointerEvents='auto';copy.style.position='absolute';copy.style.margin='0';copy.style.transform='none';copy.style.translate='none';copy.style.maxHeight='none';copy.style.maxWidth='none'}
  if(element instanceof this.document.defaultView!.HTMLInputElement){copy.setAttribute('value',element.value);if(element.checked)copy.setAttribute('checked','');else copy.removeAttribute('checked')}
  if(element instanceof this.document.defaultView!.HTMLTextAreaElement)copy.textContent=element.value
  else for(const child of element.childNodes){if(child.nodeType===3)copy.append(child.cloneNode());else if(child.nodeType===1){const cloned=this.clone(child as Element,root);if(cloned)copy.append(cloned)}}
  if(element instanceof this.document.defaultView!.HTMLSelectElement)for(const option of copy.querySelectorAll('option'))option.toggleAttribute('selected',option.value===element.value)
  copy.dataset.nativeScrollTop=String(element.scrollTop);copy.dataset.nativeScrollLeft=String(element.scrollLeft)
  if(element===this.document.activeElement){this.focusId=id;this.readSelection(element)}
  return copy
 }
 private async sync(){
  if(this.disposed)return
  const browser=this.document.querySelector<HTMLElement>('.eb-root:not([hidden])[data-native-menus=true][data-native-page=true]'),viewport=browser?.querySelector('[data-browser-viewport]')?.getBoundingClientRect()
  if(!browser||!viewport){this.context='';this.reset();return}
  const context=JSON.stringify([browser.dataset.tabId,browser.dataset.url,browser.dataset.sessionId]);if(context!==this.context){this.reset();this.context=context}
  const candidates=[...this.document.querySelectorAll<HTMLElement>(selector)].filter(element=>{const projected=this.roots.find(root=>root.element.contains(element)),rect=element.getBoundingClientRect(),style=this.document.defaultView!.getComputedStyle(element);return (!element.matches('[role=status],[role=alert]')||element.matches('.eb-toast,.srb-notification')||['fixed','absolute'].includes(style.position))&&!element.closest('[hidden]')&&(projected||!element.closest('[inert],[aria-hidden=true]'))&&(projected||style.visibility!=='hidden')&&style.display!=='none'&&rect.width>0&&rect.height>0})
  const outer=candidates.filter(element=>!candidates.some(other=>other!==element&&other.contains(element))),interactive=outer.filter(element=>!passiveSurface(element)),roots=interactive.length?interactive:outer,passive=!interactive.length
  // Non-overlapping shell menus stay in their original document.
  if(!roots.some(element=>{const r=element.getBoundingClientRect();return r.left<viewport.right&&r.right>viewport.left&&r.top<viewport.bottom&&r.bottom>viewport.top})){this.reset();return}
  const group=roots.map(element=>element.closest('.eb-root')?'browser:'+(element.getAttribute('data-browser-panel')||element.className):this.documentRootId(element)).join(',')
  if(group!==this.group){this.reset();this.group=group;this.id=crypto.randomUUID();this.revision++;this.ids.clear()}
  for(const previous of this.roots)if(!roots.includes(previous.element))this.restore(previous)
  const previous=new Map(this.roots.map(root=>[root.element,root]));this.roots=roots.map(element=>previous.get(element)||{element,aria:element.getAttribute('aria-hidden'),inert:element.inert})
  this.controls.clear();this.scrollStyles=[];const boxes=roots.map(root=>root.getBoundingClientRect()),extent=candidates.filter(element=>roots.some(root=>root.contains(element))).map(element=>element.getBoundingClientRect()),win=this.document.defaultView!,material=!passive&&roots.every(root=>root.matches('.st-menu,.rScV5Q_contextMenu[data-browser-page-context-menu]'))&&/Mac/.test(win.navigator.platform)?'menu':undefined,inset=material?0:20,left=Math.max(0,Math.floor(Math.min(...extent.map(r=>r.left))-inset)),top=Math.max(0,Math.floor(Math.min(...extent.map(r=>r.top))-inset)),right=Math.min(win.innerWidth,Math.ceil(Math.max(...extent.map(r=>r.right))+inset)),bottom=Math.min(win.innerHeight,Math.ceil(Math.max(...extent.map(r=>r.bottom))+inset))
  const copies=roots.map((root,index)=>{const copy=this.clone(root,root) as HTMLElement;copy.style.left=boxes[index]!.left-left+'px';copy.style.top=boxes[index]!.top-top+'px';copy.style.width=boxes[index]!.width+'px';copy.style.height=boxes[index]!.height+'px';return copy.outerHTML})
  const dark=browser.dataset.dark==='true',pageContext=roots.find(root=>root.matches('[data-browser-page-context-menu]')),row=pageContext?win.getComputedStyle(pageContext).getPropertyValue('--odyssey-menu-row').trim():'',css=this.fontCss()+this.scrollStyles.join('\n')+`\nhtml,body{margin:0;background:transparent;color-scheme:${dark?'dark':'light'}}*{box-sizing:border-box}body{--native-menu-hover:${row||(dark?'rgba(255,255,255,.08)':'rgba(0,0,0,.05)')}}[data-native-clickable]:not(:disabled):hover{background-color:var(--native-menu-hover)!important}`
  const state={id:this.id,revision:this.revision,owner:browser.dataset.sessionId||'',tabId:browser.dataset.tabId,url:browser.dataset.url,bounds:{x:left,y:top,width:right-left,height:bottom-top},html:copies.join(''),css,focusId:passive?undefined:this.focusId||undefined,selection:this.selection,passive,material,focusOwner:roots.some(root=>root.classList.contains('eb-suggestions')),reducedMotion:win.matchMedia('(prefers-reduced-motion: reduce)').matches}
  for(const root of this.roots){root.element.dataset.browserProjected='true';root.element.setAttribute('aria-hidden','true');root.element.inert=true;this.resize?.observe(root.element)}
  const signature=JSON.stringify(state);if(signature===this.signature)return;this.signature=signature;const request=++this.request
  try{if(!await this.bridge.request('menu',state)&&request===this.request&&signature===this.signature)this.dismiss()}catch{if(request===this.request&&signature===this.signature)this.dismiss()}
 }
 private rootIds=new WeakMap<Element,string>();private documentRootId(element:Element){let id=this.rootIds.get(element);if(!id){id='root'+(++this.nextId);this.rootIds.set(element,id)}return id}
 private action=(value:any)=>{
  if(this.disposed||value?.id!==this.id||value.revision!==this.revision)return
  const browser=this.document.querySelector<HTMLElement>('.eb-root:not([hidden])[data-native-page=true]');if(!browser||JSON.stringify([browser.dataset.tabId,browser.dataset.url,browser.dataset.sessionId])!==this.context){this.reset();return}
  if(value.kind==='dismiss'){this.dismiss();return}
  const element=this.controls.get(value.controlId);if(!element?.isConnected||!this.roots.some(root=>root.element.contains(element))||element.matches(':disabled,[aria-disabled=true]'))return
  const win=this.document.defaultView!,roots=this.roots.map(root=>root.element);for(const root of roots)root.inert=false
  try{
   if(value.kind==='pointer'){element.dispatchEvent(new win.PointerEvent(value.over?'pointerover':'pointerout',{bubbles:true}));element.dispatchEvent(new win.MouseEvent(value.over?'mouseover':'mouseout',{bubbles:true}));return}
   if(value.kind==='scroll'){element.scrollTop=Math.max(0,Number(value.scrollTop)||0);element.scrollLeft=Math.max(0,Number(value.scrollLeft)||0);return}
   const target=element as HTMLElement;target.focus?.({preventScroll:true});this.focusId=value.controlId
   if(typeof value.selectionStart==='number'&&(element instanceof win.HTMLInputElement||element instanceof win.HTMLTextAreaElement))try{element.setSelectionRange(value.selectionStart,value.selectionEnd??value.selectionStart)}catch{}
   if(value.kind==='input'||value.kind==='change'){
    if(typeof value.value==='string'&&value.value.length<=65536){const prototype=element instanceof win.HTMLTextAreaElement?win.HTMLTextAreaElement.prototype:element instanceof win.HTMLSelectElement?win.HTMLSelectElement.prototype:win.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value')?.set?.call(element,value.value)}
    if(typeof value.checked==='boolean'&&element instanceof win.HTMLInputElement)element.checked=value.checked
    if(element instanceof win.HTMLInputElement||element instanceof win.HTMLTextAreaElement)try{element.setSelectionRange(value.selectionStart??element.value.length,value.selectionEnd??element.value.length)}catch{}
    element.dispatchEvent(new win.Event(value.kind,{bubbles:true}));this.readSelection(element)
   }else if(value.kind==='click'){if(target.matches('input:not([type=checkbox]):not([type=radio]),textarea,select')){this.readSelection(element)}else if(typeof target.click==='function')target.click();else element.dispatchEvent(new win.MouseEvent('click',{bubbles:true,cancelable:true}))}
   else if(value.kind==='key'){
    const event=new win.KeyboardEvent('keydown',{key:value.key,metaKey:!!value.metaKey,ctrlKey:!!value.ctrlKey,shiftKey:!!value.shiftKey,altKey:!!value.altKey,bubbles:true,cancelable:true});element.dispatchEvent(event)
    if(!event.defaultPrevented){const root=roots.find(root=>root.contains(element))!,controls=[...root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select,[role=menuitem],[role=menuitemradio],[role=option]')].filter(el=>!el.matches(':disabled,[aria-disabled=true]')&&el.getBoundingClientRect().height>0&&win.getComputedStyle(el).visibility!=='hidden')
     if(value.key==='Escape')this.dismiss()
     else if(['Tab','ArrowDown','ArrowUp','Home','End'].includes(value.key)){const index=controls.indexOf(target),next=value.key==='Home'?0:value.key==='End'?controls.length-1:(index+(value.key==='ArrowUp'||value.key==='Tab'&&value.shiftKey?-1:1)+controls.length)%controls.length;controls[next]?.focus({preventScroll:true})}
     else if(value.key==='Enter'||value.key===' '){if(target.matches('button,[role=menuitem],[role=menuitemradio],[role=option],a'))target.click();else if(value.key==='Enter')target.closest('form')?.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}))}
    }
    const active=this.document.activeElement;if(active&&roots.some(root=>root.contains(active))){const entry=[...this.controls].find(([,el])=>el===active);if(entry)this.focusId=entry[0];this.readSelection(active)}
   }
  }finally{for(const root of roots)if(root.isConnected)root.inert=true;this.schedule()}
 }
 private dismiss(){const win=this.document.defaultView!;this.reset();for(const type of ['pointerdown','mousedown','click'])this.document.body.dispatchEvent(type==='pointerdown'?new win.PointerEvent(type,{bubbles:true}):new win.MouseEvent(type,{bubbles:true}));this.document.dispatchEvent(new win.CustomEvent('sherlock:browser-native-menu-dismiss'));this.schedule()}
 dispose(){this.disposed=true;this.reset();this.unsubscribe();this.observer.disconnect();this.resize?.disconnect();this.document.defaultView!.cancelAnimationFrame(this.frame);this.document.removeEventListener('scroll',this.schedule,true);this.document.removeEventListener('focusin',this.focus,true);this.document.defaultView!.removeEventListener('resize',this.schedule);this.style.remove()}
}
