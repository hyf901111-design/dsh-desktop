export {workbenchRequestedStyle} from '../../packages/dsh-research-task-runtime/workbench-request-style.js'
export function workbenchStyleTrialState(storage) {
 const host=typeof window!=='undefined'?window:globalThis,key=Symbol.for('ework.workbench.openterminal.trial-runtime')
 const registry=host[key]||(host[key]=new WeakMap()),owner=storage&&typeof storage==='object'?storage:host
 if(!registry.has(owner))registry.set(owner,{override:null})
 return registry.get(owner)
}
export function createWorkbenchStyleState(storage,sessionId) {
 const key='ework.research.presentation.v1:'+sessionId,trialKey='ework.research.openterminal-trial.v1'
 const shared=workbenchStyleTrialState(storage)
 let mode=null,boardOnly=false
 try{const saved=JSON.parse(storage?.getItem(key)||'null');if(saved?.version===1&&['light','dark','enterprise','openterminal'].includes(saved.mode)){mode=saved.mode;boardOnly=saved.scope==='board'}}catch{}
 const trial=()=>{if(shared.override!==null)return shared.override;try{return storage?.getItem(trialKey)==='enabled'}catch{return false}}
 const notify=()=>{if(typeof window!=='undefined')window.dispatchEvent(new window.Event('ework-workbench-trial-change'))}
 return {hasPreference:()=>mode!==null,get:()=>boardOnly?mode:trial()?'openterminal':mode,set(value,options={}){
  if(!['light','dark','enterprise','openterminal'].includes(value))return false
  // Conversation actions are bound to one board. Keep the existing global
  // trial picker while allowing a durable board preference through this same setter.
  if(options.scope==='board'){
   if(boardOnly&&value===mode)return false
   try{if(!storage?.setItem||storage.setItem(key,JSON.stringify({version:1,mode:value,scope:'board'}))===false)throw Error('storage unavailable')}
   catch{throw Error('看板样式未保存，请检查本地存储后重试。')}
   mode=value;boardOnly=true;notify();return true
  }
  const scoped=boardOnly
  if(value==='openterminal'){
   if(scoped){boardOnly=false;try{storage?.setItem(key,JSON.stringify({version:1,mode}))}catch{}}
   if(trial()){if(scoped)notify();return scoped}
   shared.override=true;try{storage?.setItem(trialKey,'enabled')}catch{}
   notify();return true
  }
  const activeTrial=trial();if(!activeTrial&&value===mode&&!scoped)return false
  if(activeTrial){shared.override=false;try{storage?.setItem(trialKey,'disabled')}catch{}}
  mode=value;boardOnly=false;try{storage?.setItem(key,JSON.stringify({version:1,mode}))}catch{}
  notify();return true
 }}
}

export function workbenchFramePresentation(frame) {
 const root=frame?.closest('[data-note-presentation],[data-conversation-component-id][data-workbench-style],.ew-sheet-component-card[data-workbench-style],[data-ework-grid]'),globalTheme=frame?.ownerDocument?.body?.hasAttribute('data-ds-dark-theme')?'dark':'light'
 // Component modes own their legacy control theme too; canvas chrome keeps its existing global preference.
 const mode=root?.dataset.workbenchStyle||globalTheme,local=root?.matches('[data-note-presentation],[data-conversation-component-id],.ew-sheet-component-card'),controlTheme=mode==='openterminal'||(local?mode==='dark':globalTheme==='dark')?'dark':'light'
 return {type:'sherlock-workbench-style',mode,controlTheme}
}
export function sendWorkbenchFramePresentation(frame) {
 if(!frame?.contentWindow)return
 const message=workbenchFramePresentation(frame)
 frame.contentWindow.postMessage(message,'*')
 frame.contentWindow.postMessage({type:'sherlock-workbench-locale',locale:frame.ownerDocument.documentElement.dataset.odysseyLocale==='en'?'en':'zh'},'*')
 frame.contentWindow.postMessage({type:'sherlock-theme',colorScheme:['dark','openterminal'].includes(message.mode)?'dark':'light'},'*')
}
export function animateWorkbenchStyle(root,mode) {
 const doc=root.ownerDocument,view=doc.defaultView,motion=view.matchMedia?.('(prefers-reduced-motion: reduce)')
 if(motion?.matches)return()=>{}
 const bounds=root.getBoundingClientRect(),left=Math.max(0,bounds.left),top=Math.max(0,bounds.top),width=Math.min(view.innerWidth,bounds.right)-left,height=Math.min(view.innerHeight,bounds.bottom)-top
 if(width<=0||height<=0)return()=>{}
 const sweep=doc.createElement('div');sweep.className='ew-workbench-style-transition';sweep.dataset.mode=mode;sweep.setAttribute('aria-hidden','true')
 Object.assign(sweep.style,{position:'fixed',left:left+'px',top:top+'px',width:width+'px',height:height+'px',pointerEvents:'none'})
 root.dataset.workbenchTransition=mode
 // Install color transitions before changing the palette, without changing geometry.
 void root.offsetWidth
 doc.body.append(sweep)
 let timer,stopped=false
 const stop=()=>{if(stopped)return;stopped=true;view.clearTimeout(timer);sweep.remove();delete root.dataset.workbenchTransition;motion?.removeEventListener?.('change',stop)}
 sweep.addEventListener('animationend',stop,{once:true});motion?.addEventListener?.('change',stop,{once:true});timer=view.setTimeout(stop,520)
 return stop
}
export function useWorkbenchStyle({rootRef,workspace}) {
 const [,renderStyle]=react.useReducer(n=>n+1,0)
 react.useLayoutEffect(()=>{
  const root=rootRef.current;if(!root)return
  const doc=root.ownerDocument,view=doc.defaultView,frames=new WeakMap()
  let hydrated=false,stopTransition=()=>{}
  const sync=()=>{
   const globalDark=doc.body.hasAttribute('data-ds-dark-theme'),mode=workspace.getWorkbenchStyle?.()||(globalDark?'dark':'light')
   const controlTheme=mode==='openterminal'||globalDark?'dark':'light'
   if(hydrated&&root.dataset.workbenchStyle!==mode){stopTransition();stopTransition=animateWorkbenchStyle(root,mode)}
   if(root.dataset.workbenchStyle!==mode||root.dataset.workbenchControlTheme!==controlTheme){
    root.dataset.workbenchStyle=mode;root.dataset.workbenchControlTheme=controlTheme
    root.dispatchEvent(new view.CustomEvent('sherlock-workbench-style-change'))
   }
   hydrated=true
   for(const frame of root.querySelectorAll('iframe[data-research-html-artifact]')){
    const signature=mode+':'+globalDark+':'+doc.documentElement.dataset.odysseyLocale
    if(frames.get(frame)===signature)continue
    frames.set(frame,signature);sendWorkbenchFramePresentation(frame)
   }
  }
  const loaded=e=>{if(e.target?.matches?.('iframe[data-research-html-artifact]')){frames.delete(e.target);sync()}}
  const locale=new view.MutationObserver(sync);locale.observe(doc.documentElement,{attributes:true,attributeFilter:['data-odyssey-locale']})
  const off=workspace.subscribe(sync),observer=new view.MutationObserver(sync),theme=new view.MutationObserver(sync)
  observer.observe(root,{childList:true,subtree:true});theme.observe(doc.body,{attributes:true,attributeFilter:['data-ds-dark-theme']})
  const trialChanged=()=>{renderStyle();sync()},storedTrialChanged=e=>{if(e.key!==null&&e.key!=='ework.research.openterminal-trial.v1')return;workbenchStyleTrialState(view.localStorage).override=null;trialChanged()}
  view.addEventListener('ework-workbench-trial-change',trialChanged);view.addEventListener('storage',storedTrialChanged)
  root.addEventListener('load',loaded,true);sync()
  return()=>{stopTransition();off();locale.disconnect();observer.disconnect();theme.disconnect();view.removeEventListener('ework-workbench-trial-change',trialChanged);view.removeEventListener('storage',storedTrialChanged);root.removeEventListener('load',loaded,true)}
 },[rootRef,workspace])
}
export function WorkbenchStylePicker({workspace}) {
 react.useSyncExternalStore(workspace.subscribe,workspace.getSnapshot)
 const [globalDark,setGlobalDark]=react.useState(()=>document.body.hasAttribute('data-ds-dark-theme')),[open,setOpen]=react.useState(false)
 const groupRef=react.useRef(null),triggerRef=react.useRef(null),menuRef=react.useRef(null)
 react.useEffect(()=>{const observer=new MutationObserver(()=>setGlobalDark(document.body.hasAttribute('data-ds-dark-theme')));observer.observe(document.body,{attributes:true,attributeFilter:['data-ds-dark-theme']});return()=>observer.disconnect()},[])
 react.useEffect(()=>setOpen(false),[workspace])
 const current=workspace.getWorkbenchStyle?.()||(globalDark?'dark':'light'),order=['light','dark','openterminal','enterprise'],labels={light:'浅色模式',dark:'深色模式',openterminal:'彭博模式',enterprise:'易方达模式'}
 react.useLayoutEffect(()=>{
  if(!open)return
  const doc=groupRef.current.ownerDocument,view=doc.defaultView,menu=menuRef.current
  const place=()=>{const r=triggerRef.current.getBoundingClientRect(),size=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.left,view.innerWidth-size.width-8))+'px';menu.style.top=Math.max(8,r.top-size.height-8)+'px'}
  const outside=e=>{if(!groupRef.current?.contains(e.target)&&!menu.contains(e.target))setOpen(false)}
  const dismiss=()=>setOpen(false)
  place();menu.querySelector('[aria-checked="true"]')?.focus({preventScroll:true})
  doc.addEventListener('pointerdown',outside,true);view.addEventListener('resize',place);doc.addEventListener('scroll',place,true)
  doc.addEventListener('sherlock:workspace-surface-change',dismiss)
  return()=>{doc.removeEventListener('pointerdown',outside,true);view.removeEventListener('resize',place);doc.removeEventListener('scroll',place,true);doc.removeEventListener('sherlock:workspace-surface-change',dismiss)}
 },[open,workspace])
 const close=()=>{setOpen(false);triggerRef.current?.focus({preventScroll:true})}
 const keyDown=e=>{
  const buttons=[...menuRef.current.querySelectorAll('[role=menuitemradio]')],index=buttons.indexOf(e.currentTarget.ownerDocument.activeElement)
  if(e.key==='Escape'||e.key==='Tab'){if(e.key==='Escape')e.preventDefault();e.stopPropagation();close();return}
  const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:['ArrowDown','ArrowRight'].includes(e.key)?(index+1)%buttons.length:['ArrowUp','ArrowLeft'].includes(e.key)?(index+buttons.length-1)%buttons.length:null
  if(next!==null){e.preventDefault();e.stopPropagation();buttons[next].focus({preventScroll:true})}
 }
 const owner=groupRef.current?.closest('[data-ework-toolbar-owner]')?.getAttribute('data-ework-toolbar-owner')
 return react_jsx_runtime.jsxs('div',{ref:groupRef,className:'ew-workbench-mode-slot',children:[
  react_jsx_runtime.jsx('span',{className:'ew-workbench-mode-divider','aria-hidden':true}),
  react_jsx_runtime.jsxs('button',{ref:triggerRef,type:'button','data-workbench-theme-toggle':'','data-current-workbench-style':current,'data-tool-tooltip':workbenchText('看板样式')+' · '+workbenchText(labels[current]),'aria-label':workbenchText('看板样式')+' · '+workbenchText(labels[current]),'aria-haspopup':'menu','aria-expanded':open,onClick:()=>setOpen(!open),onKeyDown:e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();setOpen(true)}},children:[react_jsx_runtime.jsx('span',{className:'ew-workbench-mode-icon ew-workbench-mode-'+current,'aria-hidden':true}),react_jsx_runtime.jsx('svg',{'aria-hidden':true,width:10,height:10,viewBox:'0 0 10 10',fill:'none',stroke:'currentColor',strokeWidth:.9,strokeLinecap:'round',strokeLinejoin:'round',children:react_jsx_runtime.jsx('path',{d:'m3.25 4.125 1.75 1.75 1.75-1.75'})})]}),
  !open?null:react_dom.createPortal(react_jsx_runtime.jsx('div',{ref:menuRef,role:'menu','aria-label':workbenchText('看板样式'),className:'ew-grid-menu ew-arrange-menu','data-workbench-theme-menu':'','data-ework-toolbar-owner':owner,onKeyDown:keyDown,children:order.map(mode=>react_jsx_runtime.jsxs('button',{type:'button',role:'menuitemradio','aria-checked':current===mode,'aria-label':workbenchText(labels[mode]),'data-workbench-style-option':mode,onClick:()=>{workspace.setWorkbenchStyle(mode);close()},children:[react_jsx_runtime.jsx('span',{className:'ew-workbench-mode-icon ew-workbench-mode-'+mode,'aria-hidden':true}),react_jsx_runtime.jsx('span',{className:'ew-arrange-label',children:workbenchText(labels[mode])}),react_jsx_runtime.jsx('svg',{'aria-hidden':true,className:'ew-arrange-check',width:16,height:16,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.5,children:react_jsx_runtime.jsx('path',{d:'m3 8 3 3 7-7'})})]},mode))}),groupRef.current.ownerDocument.body)
 ]})
}
