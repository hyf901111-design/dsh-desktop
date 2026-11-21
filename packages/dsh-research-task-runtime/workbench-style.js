// Figma 111:683, OpenBB Session colors and EFund Enterprise semantics.
// View preferences are local to a board; no artifact or application theme changes.
export function workbenchStylePalette(mode) {
 const common={'control-primary':'#168cf0','control-on-primary':'#fff',link:'#168cf0','chart-1':'#5b9bd5','chart-2':'#f2a746','chart-3':'#509760','chart-4':'#ded800','chart-5':'#25b6cd','chart-6':'#9b73c5'}
 const light={'scrollbar-thumb':'#0000001a',bg:'#fff',surface:'#fff','surface-muted':'#f4f4f6',text:'#25252b',muted:'#777781',border:'#dedee3','row-alternate':'#f4f4f6','row-selected':'#e8f2fc','control-bg':'#f4f4f6','control-border':'#d1d1d8','control-text':'#25252b','control-muted':'#777781','chart-label':'#777781','chart-grid':'#dedee3','chart-crosshair':'#a0a0ab','market-positive':'#00a83e','market-negative':'#df4f57'}
 const dark={'scrollbar-thumb':'#333333',bg:'#151518',surface:'#151518','surface-muted':'#24242b',text:'#e8e8ed',muted:'#a0a0ab',border:'#303036','row-alternate':'#24242b','row-selected':'#223147','control-bg':'#1d1d23','control-border':'#45454e','control-text':'#e8e8ed','control-muted':'#a0a0ab','chart-label':'#a0a0ab','chart-grid':'#3c3c43','chart-crosshair':'#a0a0ab','market-positive':'#00c84a','market-negative':'#ee5962'}
 const enterprise={...light,bg:'#fff',surface:'#fff','surface-muted':'#f3f5f7',text:'#3c3c3c',muted:'#666666',border:'#e3e7eb','row-alternate':'#f3f5f7','row-selected':'#e8e8eb',link:'#0078b4','chart-label':'#666666','chart-grid':'#e3e7eb','chart-1':'#005096','chart-2':'#1eb9e1','chart-3':'#969696','chart-4':'#3c3c3c','chart-5':'#0078b4','chart-6':'#b3ebff','chart-7':'#c1c6c8','chart-8':'#cccccc','table-heading':'#1eb9e1','table-heading-text':'#fff'}
 const openterminal={...dark,bg:'#0a0a0a',surface:'#0a0a0a','surface-muted':'#111111',text:'#d9d9d9',muted:'#808080',border:'#303030','row-alternate':'#0a0a0a','row-selected':'#1c1912','control-bg':'#111111','control-border':'#333333','control-text':'#d9d9d9','control-muted':'#808080','control-primary':'#ff9900','control-on-primary':'#0a0a0a',link:'#ff9900','chart-1':'#ff9900','chart-2':'#4fc3f7','chart-3':'#80cbc4','chart-4':'#ba68c8','chart-5':'#ff8a65','chart-6':'#ffd966','chart-label':'#808080','chart-grid':'#1a1a1a','chart-crosshair':'#808080','market-positive':'#00c853','market-negative':'#ff3d3d','font-sans':'"SF Mono",Menlo,"Noto Sans SC","PingFang SC",monospace'}
 const palette=mode==='openterminal'?openterminal:mode==='dark'?dark:mode==='enterprise'?enterprise:light
 return {...common,...palette,'tooltip-bg':mode==='enterprise'?'#e8e8eb':palette.surface,'tooltip-text':palette.text,'tooltip-muted':palette.muted,'tooltip-border':palette.border}
}
export function workbenchModeCss(scope=':root',content='') {
 const modes=['light','dark','enterprise','openterminal'],declarations=p=>Object.entries(p).map(([k,v])=>'--sherlock-'+k+':'+v+'!important').join(';')
 // Content controls belong to the board palette, including enterprise mode.
 // controlTheme is retained in the validated bridge for older frame runtimes.
 return modes.map(m=>scope+'[data-workbench-style="'+m+'"]'+content+'{'+declarations(workbenchStylePalette(m))+'}').join('\n')
}

const structureLevels=[
 ['chart-1','#fff'],['chart-5','#fff'],['chart-2','#fff'],['chart-6','#25252b'],
 ['chart-4','#fff'],['chart-3','#25252b'],['chart-7','#25252b'],['chart-8','#25252b']
]
export function workbenchStructureDepthCss(scope,nodes,depth,legacyLevels=[]) {
 const declaration=([fill,ink])=>'{--sherlock-structure-fill:var(--sherlock-'+fill+');--sherlock-structure-ink:'+ink+'}'
 const explicit=scope+' '+nodes+'['+depth+']'
 return [
  ...legacyLevels.map(([selector,level])=>scope+' :where('+selector+')'+declaration(structureLevels[level])),
  explicit+declaration(structureLevels.at(-1)),
  ...structureLevels.map((level,i)=>scope+' '+nodes+'['+depth+'="'+i+'"]'+declaration(level))
 ].join('\n')
}
export function validWorkbenchStyleMessage(data) {
 return !!data&&typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).length===3&&data.type==='sherlock-workbench-style'&&['light','dark','enterprise','openterminal'].includes(data.mode)&&['light','dark'].includes(data.controlTheme)
}
export function installWorkbenchStyleMessages() {
 let transitionTimer
 addEventListener('message',event=>{
  if(event.source!==parent||!validWorkbenchStyleMessage(event.data))return
  const root=document.documentElement,{mode,controlTheme}=event.data
  if(root.dataset.workbenchStyle&&root.dataset.workbenchStyle!==mode){
   const view=document.defaultView
   view.clearTimeout(transitionTimer)
   if(!view.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches){root.dataset.workbenchTransition=mode;void document.body?.offsetWidth;transitionTimer=view.setTimeout(()=>delete root.dataset.workbenchTransition,320)}
   else delete root.dataset.workbenchTransition
  }
  root.dataset.workbenchStyle=mode;root.dataset.workbenchControlTheme=controlTheme
  // Notify chart runtimes without replacing their DOM, filters or scroll state.
  dispatchEvent(new CustomEvent('sherlock-presentation-change',{detail:{mode}}))
 })
}
const enterpriseRoot=':root[data-workbench-style="enterprise"]'
const structureNodes=':is([data-sherlock-structure="node"],[data-sherlock-structure="primary"],:where(.chart:has(.node.root > .role)) .node:has(> .role,> .name),:where(.tree:has(> .node > .node-title)) > .node,:where(.tree:has(> .node > .node-title)) .branch > .card)'
const legacyStructureLevels=[
 [structureNodes,1],
 [':where(.tree:has(> .node > .node-title)) .branch > .card',2],
 ['.tree > .split[data-sherlock-structure="connector"] [data-sherlock-structure="node"]',2],
 [':is([data-sherlock-structure="primary"],.chart .node.root:has(> .role),:where(.tree:has(> .node > .node-title)) > .node:first-child)',0]
]
const svgNodeShape=':is(rect,ellipse,circle,polygon,path)'
export const WORKBENCH_MODE_CSS=workbenchModeCss()+workbenchStructureDepthCss(enterpriseRoot,structureNodes,'data-sherlock-structure-depth',legacyStructureLevels)+`
:root[data-workbench-style="openterminal"] body :is(button,input,select,textarea){border-radius:0!important;font-family:var(--sherlock-font-sans)!important}
:root[data-workbench-style="openterminal"] body th{background:#111!important;color:var(--sherlock-text)!important}

:root[data-workbench-style="enterprise"] body th{background:var(--sherlock-table-heading)!important;color:var(--sherlock-table-heading-text)!important}
:root[data-workbench-style="enterprise"] body th button{color:inherit!important}
:root[data-workbench-style="enterprise"] body :is(.dv-records,.market-table-wrap[data-audit-table]) th{color:var(--sherlock-text)!important}
:root[data-workbench-style="enterprise"] body :is(.market-metric,.fund-kpi,.research-metric,.kpi-card,.kpi-row>.kpi,.rScV5Q_containerKpis>div){background:var(--sherlock-chart-1)!important;padding:12px!important;border:0!important;box-shadow:none!important;border-radius:0!important}
:root[data-workbench-style="enterprise"] body :is(.market-metric,.fund-kpi,.research-metric,.kpi-card,.kpi-row>.kpi,.rScV5Q_containerKpis>div):nth-child(3n+2){background:var(--sherlock-chart-5)!important}
:root[data-workbench-style="enterprise"] body :is(.market-metric,.fund-kpi,.research-metric,.kpi-card,.kpi-row>.kpi,.rScV5Q_containerKpis>div):nth-child(3n){background:var(--sherlock-chart-4)!important}
:root[data-workbench-style="enterprise"] body :is(.market-metric,.fund-kpi,.research-metric,.kpi-card,.kpi-row>.kpi,.rScV5Q_containerKpis>div) :is(.market-value,.market-label,.market-detail,.fund-value,.fund-label,.fund-detail,.research-metric-value,.research-metric-label,.research-metric-detail,.kpi-label,.kpi-value,.kpi-detail,span,strong,em){color:white!important}
:root[data-workbench-style="enterprise"] body :is(.market-metric,.fund-kpi,.research-metric,.kpi-card,.kpi-row>.kpi) :is(summary,p,a){color:white!important}
:root[data-workbench-style="enterprise"] body .fund-detail-disclosure{border-top:1px solid #ffffff55!important;padding-top:4px!important;margin-top:6px!important}
:root[data-workbench-style="enterprise"] body .fund-detail-disclosure summary::marker{color:white!important}

/* Structure roles opt in explicitly. The older generators used labelled
   node groups and repeated bordered grids, so cover those saved shapes too. */
${enterpriseRoot} body ${structureNodes}:not(svg *){
 --sherlock-text:var(--sherlock-structure-ink);
 --sherlock-muted:color-mix(in srgb,var(--sherlock-structure-ink) 88%,var(--sherlock-structure-fill));
 --sherlock-text-muted:var(--sherlock-muted);
 background:var(--sherlock-structure-fill)!important;color:var(--sherlock-text)!important;
 border:0!important;box-shadow:none!important;border-radius:0!important;
}
${enterpriseRoot} body ${structureNodes} :is(.role,.name,.node-title,.node-sub,h2,h3,h4,p,span,strong,small,a){
 color:var(--sherlock-structure-ink)!important;
}
:root[data-workbench-style="enterprise"] body :is([data-sherlock-structure="info"],.info-card,.department-card,[class$="-cards"] > [class$="-card"]:not(:has(table,svg,canvas,button,input,select)),
 :is([style*="display:grid" i],[style*="display: grid" i])[style*="grid-template-columns"] > :is(div,article,section)[style*="border:"][style*="--sherlock-border"][style*="border-radius"]:has(> :is(div,h3,h4,strong)):not(:has(table,svg,canvas,button,input,select))) {
 --sherlock-structure-ink:var(--sherlock-control-text);
 --sherlock-text:var(--sherlock-control-text);
 --sherlock-muted:var(--sherlock-control-muted);
 --sherlock-text-muted:var(--sherlock-control-muted);
 background:color-mix(in srgb,var(--sherlock-chart-1) 5%,var(--sherlock-surface))!important;
 color:var(--sherlock-text)!important;
 border:0!important;box-shadow:none!important;border-radius:0!important;
}
/* Passive labels inside a coloured node inherit its nearest presentation role.
   Keeping a surface-coloured chip while forcing white ink hides real names. */
${enterpriseRoot} body ${structureNodes} :is(.chip,.badge,.tag):not(button,a,[role="button"],[role="status"],[data-sherlock-status]){
 background:transparent!important;color:var(--sherlock-structure-ink)!important;
 border:0!important;box-shadow:none!important;border-radius:0!important;
}
/* Older artifacts also annotated layout containers around the actual paths. */
${enterpriseRoot} body [data-sherlock-structure="connector"]:not(svg,svg *){
 color:var(--sherlock-chart-3)!important;border-color:var(--sherlock-chart-3)!important;
}
${enterpriseRoot} body [data-sherlock-structure="connector"]:not(svg,svg *):has(svg,[data-sherlock-structure="node"]){
 background:transparent!important;
}
:root[data-workbench-style="enterprise"] body :is(.chart:has(.node.root > .role) :is(.vline,.stub),.tree:has(> .node > .node-title) :is(.vline,.drop)),
:root[data-workbench-style="enterprise"] body .chart:has(.node.root > .role) .stub-caps::before,
:root[data-workbench-style="enterprise"] body .chart:has(.node.root > .role) .stub-caps::after{
 background:var(--sherlock-chart-3)!important;
}
${enterpriseRoot} svg [data-sherlock-structure="connector"]{stroke:var(--sherlock-chart-3)!important}
${enterpriseRoot} [data-sherlock-structure="connector"] > svg :is(path,line,polyline)[stroke]:not([stroke="none"],[data-sherlock-structure="node"],[data-sherlock-structure="primary"]){stroke:var(--sherlock-chart-3)!important}
${enterpriseRoot} svg ${svgNodeShape}${structureNodes},
${enterpriseRoot} svg ${structureNodes} > ${svgNodeShape}:not([data-sherlock-structure="connector"]){fill:var(--sherlock-structure-fill)!important;stroke:none!important;rx:0px!important;ry:0px!important}
${enterpriseRoot} svg ${structureNodes} :is(text,tspan){fill:var(--sherlock-structure-ink)!important}
@media(prefers-reduced-motion:no-preference){
 :root[data-workbench-transition] body,:root[data-workbench-transition] body *{transition:background-color 260ms cubic-bezier(.2,.7,.2,1),color 260ms cubic-bezier(.2,.7,.2,1),border-color 260ms cubic-bezier(.2,.7,.2,1)}
 :root[data-workbench-transition] svg :is(rect,path,line,text,circle){transition:fill 260ms cubic-bezier(.2,.7,.2,1),stroke 260ms cubic-bezier(.2,.7,.2,1)}
}
`
export function validWorkbenchLocaleMessage(data) {
 return !!data&&typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).length===2&&data.type==='sherlock-workbench-locale'&&['en','zh'].includes(data.locale)
}
export function installWorkbenchLocaleMessages(english) {
 let locale='zh',queued=false
 const originals=new WeakMap()
 function translated(value){return locale==='en'?(Object.hasOwn(english,value)?english[value]:value.replace(/^(\d+ \/ \d+) 条$/,(match,count)=>count+' items')):value}
 function update(){
  queued=false
  for(const control of document.querySelectorAll('button,summary,input,select,textarea,[role=button],body[data-research-kind] #count[role=status],body[data-research-kind] #empty,[data-news-query-coverage] [data-workbench-status-text],[data-news-source-query] [data-workbench-status-text],[data-readable-snapshot] [data-workbench-status-text]')){
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
