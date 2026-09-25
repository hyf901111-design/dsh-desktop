const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const finite=value=>typeof value==='number'&&Number.isFinite(value)
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c')

function valuationBandRuntime(labels,values,bands,unit) {
 const root=document.querySelector('.market-valuation-band'),svg=root?.querySelector('svg'),readout=root?.querySelector('.valuation-readout'),buttons=[...(root?.querySelectorAll('[data-valuation-range]')??[])]
 if(!root||!svg||!readout)return
 const ns='http://www.w3.org/2000/svg',add=(name,attributes)=>{const el=document.createElementNS(ns,name);for(const [key,value] of Object.entries(attributes))el.setAttribute(key,String(value));svg.appendChild(el);return el}
 let count=labels.length,selected=labels.length-1
 const range=()=>({start:Math.max(0,labels.length-count),length:Math.min(count,labels.length)})
 const grade=value=>value<bands.p10?'低于 P10':value<bands.p25?'P10–P25':value<bands.p50?'P25–P50':value<bands.p75?'P50–P75':value<bands.p90?'P75–P90':'高于 P90'
 const draw=()=>{
  const {start,length}=range(),subset=values.slice(start),low=Math.min(...subset,bands.p10),high=Math.max(...subset,bands.p90),span=high-low||1,min=low-span*.08,max=high+span*.08
  const y=value=>132-(value-min)/(max-min)*116,x=index=>32+466*index/(length-1)
  svg.replaceChildren()
  for(const [a,b,role] of [['p10','p25','outer'],['p25','p75','middle'],['p75','p90','outer']]){const top=y(bands[b]),bottom=y(bands[a]);add('rect',{class:`valuation-band-${role}`,x:32,y:top,width:466,height:Math.max(0,bottom-top)})}
  for(const key of ['p10','p50','p90']){const yy=y(bands[key]);add('line',{class:`valuation-percentile valuation-${key}`,x1:32,y1:yy,x2:498,y2:yy});const text=add('text',{x:30,y:yy+3,'text-anchor':'end'});text.textContent=key.toUpperCase()}
  add('polyline',{class:'valuation-line',points:subset.map((value,index)=>`${x(index)},${y(value)}`).join(' ')})
  for(const index of [...new Set([0,Math.floor((length-1)/2),length-1])]){const text=add('text',{x:x(index),y:158,'text-anchor':index===0?'start':index===length-1?'end':'middle'});text.textContent=labels[start+index]}
  selected=Math.max(start,Math.min(labels.length-1,selected));const xx=x(selected-start)
  add('line',{class:'valuation-crosshair',x1:xx,y1:10,x2:xx,y2:136});add('circle',{class:'valuation-dot',cx:xx,cy:y(values[selected]),r:3})
  readout.textContent=`${labels[selected]} · 当前 ${values[selected]} ${unit} · ${grade(values[selected])}`
  svg.dataset.selectedIndex=String(selected);svg.setAttribute('aria-label',readout.textContent+'；方向键切换时点')
 }
 svg.addEventListener('pointermove',event=>{const rect=svg.getBoundingClientRect();if(!rect.width)return;const {start,length}=range();selected=start+Math.round(((event.clientX-rect.left)/rect.width*506-32)/466*(length-1));draw()})
 svg.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const {start}=range();selected=event.key==='Home'?start:event.key==='End'?labels.length-1:selected+(event.key==='ArrowLeft'?-1:1);draw()})
 buttons.forEach(button=>button.addEventListener('click',()=>{count=button.dataset.valuationRange==='all'?labels.length:Number(button.dataset.valuationRange);selected=labels.length-1;buttons.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));draw()}))
 draw()
}

export const VALUATION_BAND_CSS='.valuation-controls{display:flex;gap:4px;margin-bottom:5px}.valuation-controls button{font:10px var(--sherlock-font-sans);color:var(--sherlock-control-text);background:var(--sherlock-control-bg);border:1px solid var(--sherlock-control-border);border-radius:4px;padding:3px 6px;cursor:pointer}.valuation-controls button[aria-pressed="true"]{background:var(--sherlock-control-primary);color:var(--sherlock-control-on-primary)}.valuation-controls button:disabled{opacity:.45}.valuation-readout{min-height:17px;font-size:10px;font-variant-numeric:tabular-nums}.market-valuation-band svg{display:block;width:100%;height:clamp(126px,calc(100vh - 100px),168px)}.market-valuation-band svg text{fill:var(--sherlock-chart-label);font:8px var(--sherlock-font-sans)}.market-valuation-band svg:focus-visible{outline:2px solid var(--sherlock-control-primary);outline-offset:-2px}.valuation-band-outer{fill:var(--sherlock-chart-2);opacity:.10}.valuation-band-middle{fill:var(--sherlock-chart-2);opacity:.22}.valuation-percentile{stroke:var(--sherlock-chart-grid);stroke-width:.7}.valuation-p50{stroke-dasharray:3 3}.valuation-line{fill:none;stroke:var(--sherlock-chart-1);stroke-width:1.8;vector-effect:non-scaling-stroke}.valuation-crosshair{stroke:var(--sherlock-chart-crosshair);stroke-dasharray:3 3}.valuation-dot{fill:var(--sherlock-surface);stroke:var(--sherlock-chart-1);stroke-width:2}.valuation-legend{font-size:9px;color:var(--sherlock-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'

export function renderValuationBand(spec) {
 const {labels,values,bands,unit}=spec
 if(!Array.isArray(labels)||labels.length<2||labels.length>366||labels.some(label=>typeof label!=='string'||!label.trim()||label.length>100)||
  !Array.isArray(values)||values.length!==labels.length||values.some(value=>!finite(value)||value<=0)||
  !bands||!['p10','p25','p50','p75','p90'].every(key=>finite(bands[key])&&bands[key]>0)||
  !(bands.p10<=bands.p25&&bands.p25<=bands.p50&&bands.p50<=bands.p75&&bands.p75<=bands.p90)||
  typeof unit!=='string'||!unit.trim()||unit.length>20)return null
 const controls=`<div class="valuation-controls" role="group" aria-label="估值时间范围">${[['all','全部'],[20,'近1月'],[60,'近3月'],[240,'近1年']].map(([count,label])=>`<button type="button" data-valuation-range="${count}" aria-pressed="${count==='all'}"${count!=='all'&&labels.length<Number(count)?' disabled':''}>${label}</button>`).join('')}</div>`
 const table=`<details><summary>完整估值数据</summary><table><thead><tr><th>时点</th><th>当前估值 (${esc(unit)})</th></tr></thead><tbody>${labels.map((label,index)=>`<tr><td>${esc(label)}</td><td>${values[index]}</td></tr>`).join('')}</tbody></table></details>`
 const body=`<div class="market-valuation-band">${controls}<div class="valuation-readout" role="status">${esc(labels.at(-1))} · 当前 ${values.at(-1)} ${esc(unit)}</div><svg viewBox="0 0 506 164" preserveAspectRatio="none" role="img" tabindex="0" aria-label="估值分位带；方向键切换时点"></svg><div class="valuation-legend">全样本分位 · P10 ${bands.p10} · P25 ${bands.p25} · P50 ${bands.p50} · P75 ${bands.p75} · P90 ${bands.p90} ${esc(unit)}</div>${table}</div>`
 return {body,script:`(${valuationBandRuntime.toString()})(${json(labels)},${json(values)},${json(bands)},${json(unit)});`}
}
