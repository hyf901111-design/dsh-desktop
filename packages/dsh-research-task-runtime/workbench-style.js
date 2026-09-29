// Figma 111:683, OpenBB Session colors and EFund Enterprise semantics.
// View preferences are local to a board; no artifact or application theme changes.
export function workbenchStylePalette(mode) {
 const common={'control-primary':'#168cf0','control-on-primary':'#fff',link:'#168cf0','chart-1':'#5b9bd5','chart-2':'#f2a746','chart-3':'#509760','chart-4':'#ded800','chart-5':'#25b6cd','chart-6':'#9b73c5'}
 const light={bg:'#fff',surface:'#fff','surface-muted':'#f4f4f6',text:'#25252b',muted:'#777781',border:'#dedee3','row-alternate':'#f4f4f6','row-selected':'#e8f2fc','control-bg':'#f4f4f6','control-border':'#d1d1d8','control-text':'#25252b','chart-label':'#777781','chart-grid':'#dedee3','chart-crosshair':'#a0a0ab','market-positive':'#00a83e','market-negative':'#df4f57'}
 const dark={bg:'#151518',surface:'#151518','surface-muted':'#24242b',text:'#e8e8ed',muted:'#a0a0ab',border:'#303036','row-alternate':'#24242b','row-selected':'#223147','control-bg':'#1d1d23','control-border':'#45454e','control-text':'#e8e8ed','chart-label':'#a0a0ab','chart-grid':'#3c3c43','chart-crosshair':'#a0a0ab','market-positive':'#00c84a','market-negative':'#ee5962'}
 const enterprise={...light,bg:'#fff',surface:'#fff','surface-muted':'#f3f5f7',text:'#3c3c3c',muted:'#666666',border:'#e3e7eb','row-alternate':'#f3f5f7','row-selected':'#b3ebff','chart-label':'#666666','chart-grid':'#e3e7eb','chart-1':'#005096','chart-2':'#1eb9e1','chart-3':'#969696','chart-4':'#3c3c3c','chart-5':'#0078b4','chart-6':'#b3ebff','chart-7':'#c1c6c8','chart-8':'#cccccc','table-heading':'#1eb9e1','table-heading-text':'#fff'}
 return {...common,...(mode==='dark'?dark:mode==='enterprise'?enterprise:light)}
}
export function workbenchModeCss(scope=':root',content='') {
 const modes=['light','dark','enterprise'],declarations=p=>Object.entries(p).map(([k,v])=>'--sherlock-'+k+':'+v+'!important').join(';')
 let css=modes.map(m=>scope+'[data-workbench-style="'+m+'"]'+content+'{'+declarations(workbenchStylePalette(m))+'}').join('\n')
 for(const m of ['light','dark']){
  const control=Object.fromEntries(Object.entries(workbenchStylePalette(m)).filter(([k])=>k.startsWith('control-')||k==='link'))
  css+=scope+'[data-workbench-style="enterprise"][data-workbench-control-theme="'+m+'"]'+content+'{'+declarations(control)+'}'
 }
 return css
}
export function validWorkbenchStyleMessage(data) {
 return !!data&&typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).length===3&&data.type==='sherlock-workbench-style'&&['light','dark','enterprise'].includes(data.mode)&&['light','dark'].includes(data.controlTheme)
}
export function installWorkbenchStyleMessages() {
 addEventListener('message',event=>{
  if(event.source!==parent||!validWorkbenchStyleMessage(event.data))return
  const root=document.documentElement,{mode,controlTheme}=event.data
  root.dataset.workbenchStyle=mode;root.dataset.workbenchControlTheme=controlTheme
  // Notify chart runtimes without replacing their DOM, filters or scroll state.
  dispatchEvent(new CustomEvent('sherlock-presentation-change',{detail:{mode}}))
 })
}
export const WORKBENCH_MODE_CSS=workbenchModeCss()+`
:root[data-workbench-style="enterprise"] body th{background:var(--sherlock-table-heading)!important;color:var(--sherlock-table-heading-text)!important}
:root[data-workbench-style="enterprise"] body th button{color:inherit!important}
:root[data-workbench-style="enterprise"] body :is(.market-metric,.fund-kpi,.research-metric){background:var(--sherlock-chart-1)!important;padding:12px!important;border-radius:0!important}
:root[data-workbench-style="enterprise"] body :is(.market-metric,.fund-kpi,.research-metric):nth-child(3n+2){background:var(--sherlock-chart-5)!important}
:root[data-workbench-style="enterprise"] body :is(.market-metric,.fund-kpi,.research-metric):nth-child(3n){background:var(--sherlock-chart-4)!important}
:root[data-workbench-style="enterprise"] body :is(.market-metric,.fund-kpi,.research-metric) :is(.market-value,.market-label,.market-detail,.fund-value,.fund-label,.fund-detail,.research-metric-value,.research-metric-label,.research-metric-detail){color:white!important}
`
export function validWorkbenchLocaleMessage(data) {
 return !!data&&typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).length===2&&data.type==='sherlock-workbench-locale'&&['en','zh'].includes(data.locale)
}
export function installWorkbenchLocaleMessages(english) {
 let locale='zh',queued=false
 const originals=new WeakMap()
 function translated(value){return locale==='en'?(Object.hasOwn(english,value)?english[value]:value):value}
 function update(){
  queued=false
  for(const control of document.querySelectorAll('button,summary,input,select,textarea,[role=button]')){
   let saved=originals.get(control)
   if(!saved){saved={attrs:{},texts:new Map()};originals.set(control,saved)}
   for(const name of ['placeholder','title','aria-label']){
    const value=control.getAttribute(name),prior=saved.attrs[name]
    if(value===null)continue
    if(!prior||value!==prior.applied)saved.attrs[name]={original:value,applied:value}
    const entry=saved.attrs[name],next=translated(entry.original)
    if(value!==next)control.setAttribute(name,next);entry.applied=next
   }
   const walker=document.createTreeWalker(control,NodeFilter.SHOW_TEXT)
   while(walker.nextNode()){
    const node=walker.currentNode,prior=saved.texts.get(node),value=node.nodeValue
    if(!prior||value!==prior.applied)saved.texts.set(node,{original:value,applied:value})
    const entry=saved.texts.get(node),next=translated(entry.original)
    if(value!==next)node.nodeValue=next;entry.applied=next
   }
  }
 }
 const schedule=()=>{if(queued)return;queued=true;queueMicrotask(update)}
 addEventListener('message',event=>{if(event.source!==parent||!validWorkbenchLocaleMessage(event.data))return;locale=event.data.locale;schedule()})
 addEventListener('DOMContentLoaded',()=>{new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']});update()},{once:true})
}
