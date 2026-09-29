export function createWorkbenchStyleState(storage,sessionId) {
 const key='ework.research.presentation.v1:'+sessionId
 let mode=null
 try{const saved=JSON.parse(storage?.getItem(key)||'null');if(saved?.version===1&&['light','dark','enterprise'].includes(saved.mode))mode=saved.mode}catch{}
 return {get:()=>mode,set(value){if(!['light','dark','enterprise'].includes(value)||value===mode)return false;mode=value;try{storage?.setItem(key,JSON.stringify({version:1,mode}))}catch{}return true}}
}
export function workbenchFramePresentation(frame) {
 const root=frame?.closest('[data-ework-grid]'),controlTheme=frame?.ownerDocument?.body?.hasAttribute('data-ds-dark-theme')?'dark':'light'
 return {type:'sherlock-workbench-style',mode:root?.dataset.workbenchStyle||controlTheme,controlTheme}
}
export function sendWorkbenchFramePresentation(frame) {
 if(!frame?.contentWindow)return
 const message=workbenchFramePresentation(frame)
 frame.contentWindow.postMessage(message,'*')
 frame.contentWindow.postMessage({type:'sherlock-workbench-locale',locale:frame.ownerDocument.documentElement.dataset.odysseyLocale==='en'?'en':'zh'},'*')
 frame.contentWindow.postMessage({type:'sherlock-theme',colorScheme:message.mode==='dark'?'dark':'light'},'*')
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
 react.useLayoutEffect(()=>{
  const root=rootRef.current;if(!root)return
  const doc=root.ownerDocument,view=doc.defaultView,frames=new WeakMap()
  let hydrated=false,stopTransition=()=>{}
  const sync=()=>{
   const globalDark=doc.body.hasAttribute('data-ds-dark-theme'),mode=workspace.getWorkbenchStyle?.()||(globalDark?'dark':'light')
   const controlTheme=globalDark?'dark':'light'
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
  root.addEventListener('load',loaded,true);sync()
  return()=>{stopTransition();off();locale.disconnect();observer.disconnect();theme.disconnect();root.removeEventListener('load',loaded,true)}
 },[rootRef,workspace])
}
export function WorkbenchStylePicker({workspace}) {
 const snapshot=react.useSyncExternalStore(workspace.subscribe,workspace.getSnapshot)
 const [globalDark,setGlobalDark]=react.useState(()=>document.body.hasAttribute('data-ds-dark-theme'))
 react.useEffect(()=>{const observer=new MutationObserver(()=>setGlobalDark(document.body.hasAttribute('data-ds-dark-theme')));observer.observe(document.body,{attributes:true,attributeFilter:['data-ds-dark-theme']});return()=>observer.disconnect()},[])
 const current=workspace.getWorkbenchStyle?.()||(globalDark?'dark':'light'),labels={light:'浅色模式',dark:'深色模式',enterprise:'易方达模式'}
 return react_jsx_runtime.jsxs('div',{className:'ew-workbench-mode-slot',children:[react_jsx_runtime.jsx('span',{className:'ew-workbench-mode-divider','aria-hidden':true}),react_jsx_runtime.jsx('div',{className:'ew-workbench-modes',role:'radiogroup','aria-label':workbenchText('看板样式'),children:['light','dark','enterprise'].map(mode=>react_jsx_runtime.jsx('button',{type:'button',role:'radio','aria-checked':current===mode,'aria-label':workbenchText(labels[mode]),'data-workbench-style-option':mode,'data-tool-tooltip':workbenchText(labels[mode]),tabIndex:current===mode?0:-1,onClick:()=>workspace.setWorkbenchStyle(mode),onKeyDown:e=>{const order=['light','dark','enterprise'],i=order.indexOf(mode),next=e.key==='Home'?0:e.key==='End'?2:e.key==='ArrowRight'||e.key==='ArrowDown'?(i+1)%3:e.key==='ArrowLeft'||e.key==='ArrowUp'?(i+2)%3:null;if(next!==null){e.preventDefault();workspace.setWorkbenchStyle(order[next]);e.currentTarget.parentElement.querySelector('[data-workbench-style-option="'+order[next]+'"]')?.focus()}},children:react_jsx_runtime.jsx('span',{className:'ew-workbench-mode-icon ew-workbench-mode-'+mode,'aria-hidden':true})},mode))})]})
}
