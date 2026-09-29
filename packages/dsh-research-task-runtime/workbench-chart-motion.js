// Shared by host charts and sandboxed HTML. Presentation only: no data, layout,
// SVG attributes or canvas pixels are rewritten, and redraws do not replay it.
export function installWorkbenchChartMotion(root) {
  const win=root.ownerDocument.defaultView,seen=new WeakMap(),observed=new WeakSet(),active=new Set()
  const media=win.matchMedia?.('(prefers-reduced-motion: reduce)')
  let frame=0,disposed=false
  const selector='svg,canvas,.market-heatmap,.market-pipeline,.fund-flow-bars,.order-book-grid,.funnel-stage-list,.risk-grid,.market-bar,.fund-industries,.gantt-rows'
  const play=chart=>{
    if(disposed||!chart.isConnected||chart.closest('button,[data-research-generation-process],.rScV5Q_nodeTitle,.rScV5Q_mindMap'))return
    const bounds=chart.getBoundingClientRect();if(bounds.width<80||bounds.height<(chart.matches('svg,canvas')?40:8))return
    const owner=chart.closest('[data-research-node-id],.market-trend,.market-candle,.market-scatter,.market-allocation,.market-price-volume,.market-equity-drawdown')||chart.parentElement
    const slot=[...owner.querySelectorAll(selector)].indexOf(chart),slots=seen.get(owner)||new Set()
    if(slots.has(slot))return;slots.add(slot);seen.set(owner,slots)
    if(media?.matches||typeof chart.animate!=='function')return
    let marks=[...chart.querySelectorAll('.trend-line,.price-volume-line,.drawdown-primary,.drawdown-benchmark,.drawdown-area,.price-volume-bar,.waterfall-bar,.allocation-arc,[data-scatter-point],.market-tile,.pipeline-progress .stage,.fund-flow-axis i,.order-book-level,.funnel-bar,.risk-cell,.market-bar i,.fund-bar,.gantt-bar')]
    // Custom generated SVGs use their own classes. Exclude neutral axes, labels,
    // crosshairs and hit regions while accepting their normal plotting marks.
    if(!marks.length&&chart.tagName.toLowerCase()==='svg')marks=[...chart.querySelectorAll('path,polygon,polyline,rect,circle,ellipse,.plot-stem,.plot-connector')].filter(el=>{
      if(/axis|grid|crosshair|cursor|selected|hit|background|clip/i.test(el.getAttribute('class')||'')||el.closest('defs,clipPath,mask'))return false
      const s=win.getComputedStyle(el);return s.visibility!=='hidden'&&s.display!=='none'&&(s.fill!=='none'||s.stroke!=='none')
    })
    if(!marks.length)marks=[chart]
    for(const [index,el] of marks.slice(0,300).entries()){
      const tag=el.tagName.toLowerCase(),style=win.getComputedStyle(el)
      let from={opacity:0,clipPath:'inset(0 100% 0 0)'},to={opacity:Number(style.opacity),clipPath:'inset(0 0 0 0)'}
      if(el.hasAttribute('data-grow-radial')){
        from={transform:'scale(.05)',transformOrigin:'center',transformBox:'fill-box',opacity:0};to={transform:'scale(1)',transformOrigin:'center',transformBox:'fill-box',opacity:Number(style.opacity)}
      }else if(el.classList.contains('allocation-arc')){
        const r=Number(el.getAttribute('r'))||48
        from={strokeDasharray:'0 '+2*Math.PI*r,opacity:0};to={strokeDasharray:style.strokeDasharray,opacity:Number(style.opacity)}
      }else if(el.matches('.fund-flow-axis i,.funnel-bar,.pipeline-progress .stage,.market-bar i,.fund-bar,.gantt-bar')){
        const origin=el.matches('.fund-flow-axis i:first-child')?'right center':'left center'
        from={transform:'scaleX(.001)',transformOrigin:origin,opacity:0};to={transform:'scaleX(1)',transformOrigin:origin,opacity:Number(style.opacity)}
      }else if(tag==='rect'){
        const axis=el.getAttribute('data-grow-axis')==='x'?'X':'Y',origin=el.getAttribute('data-grow-origin')||(axis==='X'?'left center':'center bottom')
        from={transform:`scale${axis}(.001)`,transformOrigin:origin,transformBox:'fill-box',opacity:0};to={transform:`scale${axis}(1)`,transformOrigin:origin,transformBox:'fill-box',opacity:Number(style.opacity)}
      }else if(tag==='circle'||tag==='ellipse'||el.hasAttribute('data-scatter-point')||el.matches('.risk-cell')){
        from={transform:'scale(.3)',transformOrigin:'center',transformBox:'fill-box',opacity:0};to={transform:'scale(1)',transformOrigin:'center',transformBox:'fill-box',opacity:Number(style.opacity)}
      }else if(tag==='canvas'){
        from={clipPath:'inset(100% 0 0 0)',opacity:.3};to={clipPath:'inset(0 0 0 0)',opacity:1}
      }else if((tag==='path'||tag==='polyline'||tag==='line')&&style.fill==='none'&&style.stroke!=='none'&&style.strokeDasharray==='none'&&typeof el.getTotalLength==='function'){
        const length=el.getTotalLength();from={strokeDasharray:length+' '+length,strokeDashoffset:length,opacity:0};to={strokeDasharray:length+' '+length,strokeDashoffset:0,opacity:Number(style.opacity)}
      }
      const originalBox=el.style.transformBox
      if(from.transform){el.style.transformBox='fill-box';const original=style.transform==='none'?'':style.transform;from.transform=original+' '+from.transform;to.transform=original+' '+to.transform}
      const animation=el.animate([from,to],{duration:650,delay:Math.min(index*12,180),easing:'cubic-bezier(.16,1,.3,1)'})
      const finish=()=>{active.delete(animation);if(from.transform&&el.style.transformBox==='fill-box')el.style.transformBox=originalBox}
      active.add(animation);animation.finished.then(finish,finish)
    }
  }
  const observer=typeof win.IntersectionObserver==='function'?new win.IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);play(entry.target)}},{root:root.hasAttribute('data-ework-grid')?root:null,threshold:.05}):null
  const scan=()=>{frame=0;if(disposed)return;for(const chart of root.querySelectorAll(selector)){if(observed.has(chart))continue;observed.add(chart);if(observer)observer.observe(chart);else play(chart)}}
  const schedule=()=>{if(!disposed&&!frame)frame=win.requestAnimationFrame(scan)}
  const mutations=new win.MutationObserver(schedule);mutations.observe(root,{childList:true,subtree:true})
  const reduce=()=>{if(media?.matches){for(const animation of active)animation.cancel();active.clear()}}
  media?.addEventListener?.('change',reduce);schedule()
  return()=>{disposed=true;if(frame)win.cancelAnimationFrame(frame);mutations.disconnect();observer?.disconnect();media?.removeEventListener?.('change',reduce);for(const animation of active)animation.cancel();active.clear()}
}
