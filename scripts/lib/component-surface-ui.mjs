/** Pure UI shared by the resident renderer and native Notes React tree. */
export function createComponentSurfaceUi({React,createPortal,Icon,css,palette}){
 const h=React.createElement
 const themeIcon=()=>h('svg',{'aria-hidden':true,width:16,height:16,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.4,strokeLinecap:'round',strokeLinejoin:'round',style:{flexShrink:0}},h('circle',{cx:8,cy:8,r:5.5}),h('path',{d:'M8 2.5v11a5.5 5.5 0 0 0 0-11Z',fill:'currentColor',stroke:'none'}))
 const style=()=>{let element=document.getElementById('ework-component-surface-style');if(!element){element=document.createElement('style');element.id='ework-component-surface-style';document.head.append(element)}if(element.textContent!==css)element.textContent=css}
 const buttons=root=>[...root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(element=>element.getClientRects().length)
 function captureMenuOwner(trigger,onInvalid){
  const doc=trigger?.ownerDocument,win=doc?.defaultView,selector='[data-note-research-block],[data-conversation-component-id]',owner=trigger?.closest(selector)||trigger,page=trigger?.closest('.pI_x6G_centerCol')||doc
  let live=true,valid=true
  const header=page?.querySelector('[data-srb-session-header]'),wrapper=trigger?.closest('[data-note-editor-session]'),tabs=[...(page?.querySelectorAll('[data-conversation-view-id]')||[])],identities=new Map()
  const remember=(node,names)=>{if(node){const attrs=identities.get(node)||new Map();for(const name of names)attrs.set(name,node.getAttribute(name));identities.set(node,attrs)}}
  remember(owner,['data-note-research-block','data-conversation-component-id','data-research-node-id'])
  remember(wrapper,['data-note-editor-session','data-note-editor-active'])
  remember(header,['data-srb-session-header','data-ework-notes-session'])
  remember(doc?.body,['data-workspace-surface'])
  remember(trigger?.closest('[data-odyssey-page]')||header?.closest('[data-odyssey-page]')||doc?.querySelector('[data-odyssey-page]'),['data-odyssey-page'])
  for(const tab of tabs)remember(tab,['data-conversation-view-id','aria-selected'])
  const visible=node=>{if(!node?.isConnected)return false;for(let at=node;at;at=at.parentElement){const style=win.getComputedStyle(at);if(at.hidden||at.inert||at.getAttribute('aria-hidden')==='true'||at.dataset.noteEditorActive==='false'||at.dataset.workspaceSurfaceHidden==='true'||style.display==='none'||['hidden','collapse'].includes(style.visibility)||style.opacity==='0')return false}return true}
  const current=()=>live&&valid&&!!doc&&trigger?.ownerDocument===doc&&visible(trigger)&&visible(owner)&&(trigger.closest(selector)||trigger)===owner&&trigger.closest('[data-note-editor-session]')===wrapper&&page.querySelector('[data-srb-session-header]')===header&&tabs.length===page.querySelectorAll('[data-conversation-view-id]').length&&[...identities].every(([node,attrs])=>node.isConnected&&[...attrs].every(([name,value])=>node.getAttribute(name)===value))&&![...doc.querySelectorAll('[data-settings-open="true"],.VOzbGW_overlay')].some(visible)
  const invalidate=()=>{if(!live||!valid)return;valid=false;onInvalid?.()},check=()=>{if(!current())invalidate()},outside=event=>{if(!trigger?.contains(event.target))invalidate()}
  const observer=doc&&new win.MutationObserver(records=>{if(records.some(record=>record.type==='attributes'&&identities.get(record.target)?.has(record.attributeName)&&record.oldValue!==identities.get(record.target).get(record.attributeName))){invalidate();return}check()})
  if(doc){observer.observe(doc.documentElement,{attributes:true,attributeOldValue:true,childList:true,subtree:true});doc.addEventListener('sherlock:workspace-surface-change',check);win.addEventListener('sherlock:home-action-context-changed',invalidate);if(!onInvalid){doc.addEventListener('pointerdown',outside,true);doc.addEventListener('focusin',outside,true);win.addEventListener('blur',invalidate)}}
  return{current,dispose:()=>{live=false;observer?.disconnect();doc?.removeEventListener('sherlock:workspace-surface-change',check);win?.removeEventListener('sherlock:home-action-context-changed',invalidate);if(!onInvalid){doc?.removeEventListener('pointerdown',outside,true);doc?.removeEventListener('focusin',outside,true);win?.removeEventListener('blur',invalidate)}}}
 }
 function componentThemeAction(current,run,disabled=false,fallback='light'){
  const modes=[['light','浅色模式'],['dark','深色模式'],['enterprise','易方达模式'],['openterminal','彭博模式']],selected=modes.some(([mode])=>mode===current)?current:fallback
  return{id:'theme',icon:'theme',label:'模式切换',submenuLabel:'组件模式',disabled,children:modes.map(([mode,label])=>({id:'theme-'+mode,label,checked:mode===selected,disabled,run:()=>run(mode)}))}
 }
 function useComponentTheme(rootRef,mode,enabled=true){
  React.useLayoutEffect(()=>{const root=rootRef.current;if(!enabled||!root||!palette)return
   const values=palette(mode),tokens=new Set(['light','dark','enterprise','openterminal'].flatMap(mode=>Object.keys(palette(mode))))
   for(const key of tokens){if(values[key]===undefined)root.style.removeProperty('--sherlock-'+key);else root.style.setProperty('--sherlock-'+key,values[key])}
   for(const[key,token]of Object.entries({'--odyssey-content':'surface','--odyssey-text':'text','--dsw-alias-bg-layer-1':'surface','--dsw-alias-text-primary':'text','--grid-card':'surface','--grid-text':'text','--grid-muted':'muted','--grid-border':'border'}))root.style.setProperty(key,values[token]??'')
   const send=frame=>{frame.contentWindow?.postMessage({type:'sherlock-workbench-style',mode,controlTheme:mode==='dark'||mode==='openterminal'?'dark':'light'},'*');frame.contentWindow?.postMessage({type:'sherlock-theme',colorScheme:mode==='dark'||mode==='openterminal'?'dark':'light'},'*')},sync=()=>root.querySelectorAll('iframe').forEach(send),load=event=>{if(event.target?.tagName==='IFRAME')send(event.target)}
   const observer=new MutationObserver(sync);observer.observe(root,{childList:true,subtree:true});root.addEventListener('load',load,true);sync()
   return()=>{observer.disconnect();root.removeEventListener('load',load,true)}
  },[rootRef,mode,enabled])
 }
 function useDialogFocus(rootRef,preferredRef){
  React.useLayoutEffect(()=>{style();const root=rootRef.current;if(!root)return;const doc=root.ownerDocument,previous=doc.activeElement,items=()=>buttons(root).filter(element=>element.tabIndex>=0),focused=preferredRef?.current||items()[0]||root
   focused.focus({preventScroll:true})
   const key=event=>{if(event.key!=='Tab'||!root.isConnected)return;const active=doc.activeElement;if(active!==doc.body&&!root.contains(active))return;const list=items(),first=list[0],last=list.at(-1);if(!first){event.preventDefault();event.stopPropagation();root.focus({preventScroll:true})}else if(event.shiftKey&&(active===first||!list.includes(active))){event.preventDefault();event.stopPropagation();last.focus({preventScroll:true})}else if(!event.shiftKey&&(active===last||!list.includes(active))){event.preventDefault();event.stopPropagation();first.focus({preventScroll:true})}}
   doc.addEventListener('keydown',key,true)
   return()=>{doc.removeEventListener('keydown',key,true);if(previous?.isConnected&&(doc.activeElement===doc.body||root.contains(doc.activeElement)))previous.focus?.({preventScroll:true})}
  },[])
 }
 function useReading(rootRef){
  const [reading,setReading]=React.useState(false)
  React.useLayoutEffect(style,[])
  React.useLayoutEffect(()=>{if(!reading)return;style();const root=rootRef.current;if(!root?.isConnected){setReading(false);return}
   const focused=document.activeElement,open=root.hasAttribute('open'),tab=root.getAttribute('tabindex'),popover=root.getAttribute('popover');root.dataset.componentReading='true';root.setAttribute('open','');root.setAttribute('tabindex','-1')
   let native=false;try{if(typeof root.showPopover==='function'){root.setAttribute('popover','manual');root.showPopover();native=true}}catch{root.removeAttribute('popover')}
   root.focus({preventScroll:true})
   const close=()=>setReading(false),key=event=>{if(event.key==='Escape'&&!event.target?.closest?.('[role=menu],[role=dialog]')){event.preventDefault();event.stopPropagation();close()}else if(event.key==='Tab'){const items=buttons(root),first=items[0],last=items.at(-1);if(!first){event.preventDefault();root.focus()}else if(event.shiftKey&&(document.activeElement===first||!root.contains(document.activeElement))){event.preventDefault();last.focus()}else if(!event.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){event.preventDefault();first.focus()}}}
   const outside=event=>{const box=root.getBoundingClientRect();if(!root.contains(event.target)||event.target===root&&(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom))close()}
   document.addEventListener('keydown',key,true);document.addEventListener('pointerdown',outside,true)
   return()=>{document.removeEventListener('keydown',key,true);document.removeEventListener('pointerdown',outside,true);if(native)try{root.hidePopover()}catch{}if(popover===null)root.removeAttribute('popover');else root.setAttribute('popover',popover);delete root.dataset.componentReading;if(!open)root.removeAttribute('open');if(tab===null)root.removeAttribute('tabindex');else root.setAttribute('tabindex',tab);if(focused?.isConnected)focused.focus?.({preventScroll:true})}
  },[reading,rootRef])
  const control=reading&&rootRef.current?createPortal(h(React.Fragment,null,typeof rootRef.current.showPopover!=='function'&&h('div',{className:'ew-component-reading-backdrop',onPointerDown:()=>setReading(false)}),h('button',{type:'button',className:'ew-component-reading-close','aria-label':'关闭放大阅读',onClick:()=>setReading(false)},h(Icon,{name:'close'}))),rootRef.current):null
  return{reading,toggle:()=>setReading(value=>!value),close:()=>setReading(false),control}
 }
 function Menu({trigger,actions,onClose,surface}){
  const root=React.useRef(null),sub=React.useRef(null),[detail,setDetail]=React.useState(null),[busy,setBusy]=React.useState(''),[error,setError]=React.useState(''),[position,setPosition]=React.useState({left:8,top:8}),[subPosition,setSubPosition]=React.useState({left:8,top:8})
  const closeRef=React.useRef(onClose),live=React.useRef(true);closeRef.current=onClose
  React.useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
  React.useLayoutEffect(()=>{style();const box=trigger?.getBoundingClientRect(),menu=root.current;if(!box||!menu)return;setPosition({left:Math.max(8,Math.min(window.innerWidth-menu.offsetWidth-8,box.right-menu.offsetWidth)),top:Math.max(8,Math.min(window.innerHeight-menu.offsetHeight-8,box.bottom+5))});menu.querySelector('button:not(:disabled)')?.focus()},[trigger])
  React.useEffect(()=>{const doc=trigger?.ownerDocument||document,win=doc.defaultView,close=()=>closeRef.current(),inside=target=>root.current?.contains(target)||sub.current?.contains(target)||trigger?.contains(target),outside=event=>{if(!inside(event.target))close()},key=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();if(trigger?.isConnected)trigger.focus({preventScroll:true})}},reflow=()=>close(),owner=captureMenuOwner(trigger,close);doc.addEventListener('pointerdown',outside,true);doc.addEventListener('focusin',outside,true);doc.addEventListener('keydown',key,true);win.addEventListener('resize',reflow);win.addEventListener('blur',close);if(!owner.current())close();return()=>{owner.dispose();doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('focusin',outside,true);doc.removeEventListener('keydown',key,true);win.removeEventListener('resize',reflow);win.removeEventListener('blur',close)}},[trigger])
  const navigate=(event,ref)=>{const items=buttons(ref.current),at=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(at+(event.key==='ArrowUp'?-1:1)+items.length)%items.length]?.focus()}}
  const open=(item,target,focus=false)=>{if(item.disabled||busy)return;const box=target.getBoundingClientRect(),menu=root.current.getBoundingClientRect(),width=item.id==='theme'?168:116,height=item.children.length*33+14;setSubPosition({left:menu.right+width+4<window.innerWidth-8?menu.right+4:Math.max(8,menu.left-width-4),top:Math.max(8,Math.min(window.innerHeight-height-8,box.top))});setDetail({item,target});if(focus)window.requestAnimationFrame(()=>sub.current?.querySelector('button:not(:disabled)')?.focus())}
  const choose=async item=>{if(busy||item.disabled||typeof item.run!=='function')return;setBusy(item.id);setError('');try{await item.run();if(live.current)closeRef.current()}catch(value){if(live.current)setError(String(value?.message??value??'组件操作未完成，请重试。'))}finally{if(live.current)setBusy('')}}
  const row=(item,child=false)=>h('button',{key:item.id,type:'button',role:typeof item.checked==='boolean'?'menuitemradio':'menuitem','aria-checked':typeof item.checked==='boolean'?item.checked:undefined,'aria-label':item.label,disabled:!!item.disabled||!!busy,'data-component-menu-action':item.id,'aria-haspopup':item.children?'menu':undefined,'aria-expanded':item.children?detail?.item.id===item.id:undefined,onMouseEnter:event=>{if(item.children)open(item,event.currentTarget);else if(!child)setDetail(null)},onKeyDown:event=>{if(item.children&&event.key==='ArrowRight'){event.preventDefault();open(item,event.currentTarget,true)}},onClick:event=>item.children?open(item,event.currentTarget):void choose(item)},!child&&(item.icon==='theme'?themeIcon():h(Icon,{name:item.icon||item.id})),h('span',null,busy===item.id?'处理中…':item.label),typeof item.checked==='boolean'&&h('span',{className:'ew-component-theme-check','aria-hidden':true},item.checked?'✓':''),item.children&&h('span',{'aria-hidden':true},'›'))
  const detailItem=detail&&actions.find(item=>item?.id===detail.item.id)
  return createPortal(h(React.Fragment,null,h('div',{ref:element=>{root.current=element;if(element)element.__eworkMenuTrigger=trigger},role:'menu','aria-label':'组件更多操作','data-component-menu-surface':surface,className:'ew-grid-menu ew-component-surface-menu',style:position,onKeyDown:event=>navigate(event,root)},actions.filter(item=>item&&(item.children?.length||typeof item.run==='function')).map(item=>row(item)),error&&h('span',{role:'alert',className:'ew-component-menu-error'},error)),detailItem&&h('div',{ref:element=>{sub.current=element;if(element)element.__eworkMenuTrigger=trigger},'data-component-menu-surface':surface,role:'menu','aria-label':detailItem.submenuLabel||'导出格式',className:'ew-grid-menu ew-grid-submenu ew-component-surface-menu'+(detailItem.id==='theme'?' ew-component-theme-menu':''),style:subPosition,onKeyDown:event=>{if(event.key==='ArrowLeft'){event.preventDefault();setDetail(null);detail.target.focus()}else navigate(event,sub)}},detailItem.children.map(item=>row(item,true)),error&&h('span',{role:'alert',className:'ew-component-menu-error'},error))),trigger?.closest?.('[data-component-reading=true]')||document.body)
 }
 function Rename({title,onRename,onClose}){
  const [value,setValue]=React.useState(title),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),input=React.useRef(null),root=React.useRef(null)
  useDialogFocus(root,input)
  React.useLayoutEffect(()=>{input.current?.select()},[])
  const submit=async event=>{event.preventDefault();if(busy||!value.trim()||value.trim().length>120)return;setBusy(true);setError('');try{await onRename(value.trim());onClose()}catch(error){setError(String(error?.message??error))}finally{setBusy(false)}}
  return createPortal(h('div',{className:'ew-component-action-backdrop',onPointerDown:event=>{if(event.target===event.currentTarget&&!busy)onClose()},onKeyDown:event=>{if(event.key==='Escape'&&!busy){event.preventDefault();event.stopPropagation();onClose()}}},h('form',{ref:root,tabIndex:-1,role:'dialog','aria-label':'重命名组件','aria-modal':true,className:'ew-component-action-dialog',onSubmit:submit},h('h3',null,'重命名组件'),h('label',null,'组件名称',h('input',{ref:input,value,maxLength:120,disabled:busy,onChange:event=>setValue(event.target.value)})),error&&h('p',{role:'alert'},error),h('footer',null,h('button',{type:'button',disabled:busy,onClick:onClose},'取消'),h('button',{type:'submit',disabled:busy||!value.trim()},busy?'保存中…':'保存')))),document.body)
 }
 function Data({title,provenance={},onClose}){
  const root=React.useRef(null)
  useDialogFocus(root)
  const sources=provenance.sourceNames?.length?provenance.sourceNames.join('、'):'来源未提供'
  return createPortal(h('div',{className:'ew-component-action-backdrop',onPointerDown:event=>{if(event.target===event.currentTarget)onClose()}},h('section',{ref:root,tabIndex:-1,role:'dialog','aria-label':'组件数据源与自动更新','aria-modal':true,className:'ew-component-action-dialog',onKeyDown:event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose()}}},h('header',null,h('h3',null,title||'组件数据'),h('button',{type:'button','aria-label':'关闭数据源与自动更新',onClick:onClose},'×')),h('p',null,'来源：'+sources),h('p',null,'数据时点：'+(provenance.dataAsOf||'未提供')),provenance.fetchedAt&&h('p',null,'获取时间：'+new Date(provenance.fetchedAt).toLocaleString('zh-CN',{hour12:false})),h('p',{role:'status'},'当前为内容快照，未绑定自动更新。'))),document.body)
 }
 return{Menu,Rename,Data,useReading,captureMenuOwner,themeAction:componentThemeAction,useComponentTheme}
}
