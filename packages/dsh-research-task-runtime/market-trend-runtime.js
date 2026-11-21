// Both the first paint and the sandbox use the visible domain's resolution.
// A daily NAV can move by only a few ten-thousandths of a yuan.
export function trendAxisLabels(low, high) {
 const step = (high-low)/4
 const decimals = Math.max(0, 1-Math.floor(Math.log10(step)))
 return Array.from({length:5}, (_,i)=>{
  const value=high-step*i
  if(decimals>12)return String(value)
  const label=value.toFixed(decimals)
  return Number(label)===0?(0).toFixed(decimals):label
 })
}

export function trendRuntime(labels, series, low, high, viewport, observe, axisLabels) {
 const svg=document.querySelector('.market-trend svg'),readout=document.querySelector('.trend-readout'),crosshair=svg?.querySelector('.trend-crosshair'),dots=[...svg.querySelectorAll('.trend-selected-dot')],lines=[...svg.querySelectorAll('.trend-line')],buttons=[...document.querySelectorAll('[data-trend-series]')]
 if(!svg||!readout||!crosshair)return
 const selectedDate=readout.querySelector('[data-trend-selected-date]'),pointRows=[...readout.querySelectorAll('[data-trend-readout-row]')]
 const visible=series.map(()=>true)
 const original={low,high,start:0,end:labels.length-1};let start=0,end=labels.length-1
 let layout
 const x=i=>layout.x(i-start,end-start+1),y=value=>layout.bottom-(value-low)/(high-low)*(layout.bottom-layout.top)
 const syncView=()=>{
  const interval=(high-low)/4,ticks=axisLabels(low,high)
  layout=viewport(svg,ticks)
  svg.setAttribute('data-workbench-chart-view',JSON.stringify({min:low,max:high,start:labels[start],end:labels[end]}))
  lines.forEach((line,n)=>{line.setAttribute('points',series[n].values.slice(start,end+1).map((v,i)=>x(start+i)+','+y(v)).join(' '));line.setAttribute('data-refresh-key','trend:'+series[n].name);line.setAttribute('data-refresh-value',String(series[n].values[end]))})
  svg.querySelectorAll('.trend-grid:not(.trend-vertical)').forEach((line,i)=>{const text=line.nextElementSibling;const yy=y(high-interval*i);for(const [k,v] of Object.entries({x1:layout.left,x2:layout.right,y1:yy,y2:yy}))line.setAttribute(k,String(v));if(text?.tagName.toLowerCase()==='text'){text.setAttribute('x',String(layout.left-7));text.setAttribute('y',String(yy+3));text.textContent=ticks[i]}})
  svg.querySelectorAll('.trend-date-axis,.trend-vertical').forEach(el=>el.remove())
  layout.dates(labels,start,end-start+1)
  svg.querySelectorAll('[data-series-date]').forEach(text=>{text.classList.add('trend-date-axis');const line=document.createElementNS('http://www.w3.org/2000/svg','line');for(const [k,v] of Object.entries({class:'trend-grid trend-vertical',x1:text.getAttribute('x'),x2:text.getAttribute('x'),y1:layout.top,y2:layout.bottom}))line.setAttribute(k,String(v));svg.insertBefore(line,svg.firstChild)})
  crosshair.setAttribute('y1',String(layout.top));crosshair.setAttribute('y2',String(layout.bottom))
 }
 const update=index=>{
  const i=Math.max(start,Math.min(end,index))
  svg.dataset.selectedIndex=String(i)
  crosshair.setAttribute('x1',String(x(i)));crosshair.setAttribute('x2',String(x(i)))
  dots.forEach((dot,n)=>{dot.setAttribute('cx',String(x(i)));dot.setAttribute('cy',String(y(series[n].values[i])))})
  const description=labels[i]+'  ·  '+series.filter((_,n)=>visible[n]).map(item=>item.name+' '+item.values[i]).join('  ·  ')
  if(selectedDate&&pointRows.length===series.length){
   selectedDate.textContent=labels[i]
   pointRows.forEach((row,n)=>{row.hidden=!visible[n];row.querySelector('[data-trend-point-value]').textContent=String(series[n].values[i])})
  }else readout.textContent=description
  svg.setAttribute('aria-label',description+'；方向键切换时点')
 }
 const syncLegend=()=>buttons.forEach((button,i)=>{button.setAttribute('aria-pressed',String(visible[i]));button.disabled=visible[i]&&visible.filter(Boolean).length===1})
 buttons.forEach((button,n)=>button.addEventListener('click',()=>{if(visible[n]&&visible.filter(Boolean).length===1)return;visible[n]=!visible[n];syncLegend();lines.forEach((line,i)=>{line.style.display=visible[i]?'':'none'});dots.forEach((dot,i)=>{dot.style.display=visible[i]?'':'none'});update(Number(svg.dataset.selectedIndex))}))
 svg.addEventListener('pointermove',event=>{const rect=svg.getBoundingClientRect();if(!rect.width)return;const chartX=(event.clientX-rect.left)/rect.width*layout.width;update(start+Math.round((chartX-layout.left)/(layout.right-layout.left)*(end-start)))})
 svg.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const current=Number(svg.dataset.selectedIndex);update(event.key==='Home'?0:event.key==='End'?labels.length-1:current+(event.key==='ArrowLeft'?-1:1))})
 svg.addEventListener('sherlock-chart-restore',event=>{const v=event.detail;if(!v||![v.min,v.max].every(Number.isFinite)||v.max<=v.min||typeof v.start!=='string'||typeof v.end!=='string'||labels.indexOf(v.start)<0||labels.indexOf(v.end)<labels.indexOf(v.start))return;low=v.min;high=v.max;start=labels.indexOf(v.start);end=labels.indexOf(v.end);syncView();update(Number(svg.dataset.selectedIndex))})
 svg.addEventListener('dblclick',()=>{low=original.low;high=original.high;start=original.start;end=original.end;syncView();update(end)})
 svg.setAttribute('title','双击图表恢复完整范围')
 syncView();syncLegend();update(labels.length-1);observe(svg,()=>{syncView();update(Number(svg.dataset.selectedIndex))})
}
