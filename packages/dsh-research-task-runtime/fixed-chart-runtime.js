export function fixedChartRuntime(chart){
 const svg=document.querySelector('svg'),readout=document.querySelector('.chart-readout'),cursor=document.querySelector('.chart-cursor'),buttons=[...document.querySelectorAll('[data-chart-series]')],groups=[...document.querySelectorAll('[data-series-group]')];
 let selected=0;const visible=chart.series.map(()=>true);
 const select=index=>{selected=Math.max(0,Math.min(chart.labels.length-1,index));const x=55+540/chart.labels.length*(selected+.5);cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);readout.textContent=chart.labels[selected]+' · '+chart.series.filter((_,i)=>visible[i]).map(s=>s.name+' '+s.values[selected]).join(' · ')};
 buttons.forEach((button,i)=>button.addEventListener('click',()=>{if(visible[i]&&visible.filter(Boolean).length===1)return;visible[i]=!visible[i];groups[i].style.display=visible[i]?'':'none';button.setAttribute('aria-pressed',String(visible[i]));select(selected)}));
 svg.addEventListener('keydown',event=>{const index=event.key==='ArrowLeft'?selected-1:event.key==='ArrowRight'?selected+1:event.key==='Home'?0:event.key==='End'?chart.labels.length-1:null;if(index===null)return;event.preventDefault();select(index)});
 svg.addEventListener('pointermove',event=>{const rect=svg.getBoundingClientRect();if(rect.width)select(Math.round(((event.clientX-rect.left)/rect.width*660-55)/540*chart.labels.length-.5))});
 select(0);
}
