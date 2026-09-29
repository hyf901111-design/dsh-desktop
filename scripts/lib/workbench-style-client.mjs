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
export function useWorkbenchStyle({rootRef,workspace}) {
 react.useLayoutEffect(()=>{
  const root=rootRef.current;if(!root)return
  const doc=root.ownerDocument,view=doc.defaultView,frames=new WeakMap()
  const sync=()=>{
   const globalDark=doc.body.hasAttribute('data-ds-dark-theme'),mode=workspace.getWorkbenchStyle?.()||(globalDark?'dark':'light')
   const controlTheme=globalDark?'dark':'light'
   if(root.dataset.workbenchStyle!==mode||root.dataset.workbenchControlTheme!==controlTheme){
    root.dataset.workbenchStyle=mode;root.dataset.workbenchControlTheme=controlTheme
    root.dispatchEvent(new view.CustomEvent('sherlock-workbench-style-change'))
   }
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
  return()=>{off();locale.disconnect();observer.disconnect();theme.disconnect();root.removeEventListener('load',loaded,true)}
 },[rootRef,workspace])
}
export function WorkbenchStylePicker({workspace}) {
 const snapshot=react.useSyncExternalStore(workspace.subscribe,workspace.getSnapshot)
 const [globalDark,setGlobalDark]=react.useState(()=>document.body.hasAttribute('data-ds-dark-theme'))
 react.useEffect(()=>{const observer=new MutationObserver(()=>setGlobalDark(document.body.hasAttribute('data-ds-dark-theme')));observer.observe(document.body,{attributes:true,attributeFilter:['data-ds-dark-theme']});return()=>observer.disconnect()},[])
 const current=workspace.getWorkbenchStyle?.()||(globalDark?'dark':'light'),labels={light:'浅色模式',dark:'深色模式',enterprise:'易方达模式'}
 return react_jsx_runtime.jsxs('div',{className:'ew-workbench-mode-slot',children:[react_jsx_runtime.jsx('span',{className:'ew-workbench-mode-divider','aria-hidden':true}),react_jsx_runtime.jsx('div',{className:'ew-workbench-modes',role:'radiogroup','aria-label':workbenchText('看板样式'),children:['light','dark','enterprise'].map(mode=>react_jsx_runtime.jsx('button',{type:'button',role:'radio','aria-checked':current===mode,'aria-label':workbenchText(labels[mode]),'data-workbench-style-option':mode,'data-tool-tooltip':workbenchText(labels[mode]),tabIndex:current===mode?0:-1,onClick:()=>workspace.setWorkbenchStyle(mode),onKeyDown:e=>{const order=['light','dark','enterprise'],i=order.indexOf(mode),next=e.key==='Home'?0:e.key==='End'?2:e.key==='ArrowRight'||e.key==='ArrowDown'?(i+1)%3:e.key==='ArrowLeft'||e.key==='ArrowUp'?(i+2)%3:null;if(next!==null){e.preventDefault();workspace.setWorkbenchStyle(order[next]);e.currentTarget.parentElement.querySelector('[data-workbench-style-option="'+order[next]+'"]')?.focus()}},children:react_jsx_runtime.jsx('span',{className:'ew-workbench-mode-icon ew-workbench-mode-'+mode,'aria-hidden':true})},mode))})]})
}
