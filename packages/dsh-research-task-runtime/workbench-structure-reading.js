// Preserve authored graph geometry and interaction, but never squeeze a large
// SVG into a short fixed box at the expense of readable node text.
export function installWorkbenchStructureReading(root=document.documentElement){
 const graphs=new Map();let pending
 const measure=()=>{
  pending=undefined
  for(const [svg,box] of graphs){
   if(!svg.isConnected)continue
   const view=svg.viewBox?.baseVal,ctm=svg.getScreenCTM(),width=box.clientWidth
   if(!view?.width||!view.height||!ctm||width<1)continue
   const rootScale=Math.hypot(ctm.a,ctm.b)
   const fonts=[...svg.querySelectorAll('[data-sherlock-structure] text')].filter(el=>el.textContent.trim()&&getComputedStyle(el).display!=='none').map(el=>{
    const matrix=el.getScreenCTM();return matrix&&rootScale>0?parseFloat(getComputedStyle(el).fontSize)*Math.hypot(matrix.a,matrix.b)/rootScale:NaN
   }).filter(value=>Number.isFinite(value)&&value>0)
   if(!fonts.length)continue
   const naturalWidth=Math.max(width,Math.min(4800,view.width*Math.max(1,11/Math.min(...fonts))))
   svg.style.setProperty('width',naturalWidth+'px','important');svg.style.setProperty('height',(naturalWidth*view.height/view.width)+'px','important')
   svg.style.setProperty('max-width','none','important');svg.style.setProperty('max-height','none','important')
   box.style.setProperty('height','auto','important');box.style.setProperty('max-height','none','important');box.style.setProperty('overflow','auto','important')
  }
 }
 const schedule=()=>{if(pending===undefined)pending=requestAnimationFrame(measure)}
 const scan=()=>{
  for(const svg of root.querySelectorAll('svg[viewBox]')){
   if(graphs.has(svg)||svg.querySelectorAll('[data-sherlock-structure]').length<2)continue
   const box=svg.parentElement
   if(!box||box===document.body||box===document.documentElement||box.namespaceURI==='http://www.w3.org/2000/svg')continue
   graphs.set(svg,box);resize.observe(box)
  }
  schedule()
 }
 const resize=new ResizeObserver(schedule),changes=new MutationObserver(scan)
 changes.observe(root,{subtree:true,childList:true});scan();document.fonts?.ready.then(schedule)
 addEventListener('pagehide',()=>{resize.disconnect();changes.disconnect();if(pending!==undefined)cancelAnimationFrame(pending)},{once:true})
}
