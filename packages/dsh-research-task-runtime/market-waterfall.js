const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const finite=value=>typeof value==='number'&&Number.isFinite(value)
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c')

function waterfallRuntime(start,changes,unit,startLabel,endLabel) {
 const root=document.querySelector('.market-waterfall'),svg=root?.querySelector('svg'),readout=root?.querySelector('.waterfall-readout')
 if(!root||!svg||!readout)return
 const ns='http://www.w3.org/2000/svg',add=(name,attributes)=>{const el=document.createElementNS(ns,name);for(const [key,value] of Object.entries(attributes))el.setAttribute(key,String(value));svg.appendChild(el);return el}
 const levels=[start],steps=changes.map(change=>{const before=levels.at(-1),after=Number((before+change.value).toPrecision(12));levels.push(after);return {before,after}})
 const values=[0,...levels],low=Math.min(...values),high=Math.max(...values),span=high-low||1,min=low-span*.08,max=high+span*.08
 const y=value=>139-(value-min)/(max-min)*122,count=changes.length+2,slot=468/count,width=Math.min(24,slot*.58),x=index=>32+slot*(index+.5)
 const bar=(index,from,to,kind,label)=>{
  const top=y(Math.max(from,to)),bottom=y(Math.min(from,to)),rect=add('rect',{class:`waterfall-bar waterfall-${kind}`,x:x(index)-width/2,y:top,width,height:Math.max(2,bottom-top),role:'button',tabindex:0,'aria-label':label})
  const select=()=>{svg.querySelectorAll('.waterfall-bar').forEach(item=>item.setAttribute('aria-selected',String(item===rect)));readout.textContent=label}
  rect.addEventListener('click',select);rect.addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key))return;event.preventDefault();select()})
  const text=add('text',{x:x(index),y:157,'text-anchor':'middle'});text.textContent=index===0?startLabel:index===count-1?endLabel:changes[index-1].label
 }
 for(let index=0;index<changes.length+1;index++){const y1=y(levels[index]);add('line',{class:'waterfall-connector',x1:x(index)+width/2,y1,x2:x(index+1)-width/2,y2:y1})}
 bar(0,0,start,'total',`${startLabel} ${start} ${unit}`)
 steps.forEach((step,index)=>bar(index+1,step.before,step.after,changes[index].value>=0?'positive':'negative',`${changes[index].label} ${changes[index].value>=0?'+':''}${changes[index].value} ${unit} · ${step.before} → ${step.after} ${unit}`))
 bar(count-1,0,levels.at(-1),'total',`${endLabel} ${levels.at(-1)} ${unit}`)
 readout.textContent=`${startLabel} ${start} ${unit} → ${endLabel} ${levels.at(-1)} ${unit}`
}

export const WATERFALL_CSS='.market-waterfall svg{display:block;width:100%;height:clamp(130px,calc(100vh - 79px),176px)}.market-waterfall svg text{fill:var(--sherlock-chart-label);font:8px var(--sherlock-font-sans)}.waterfall-connector{stroke:var(--sherlock-chart-grid);stroke-width:1;stroke-dasharray:2 2}.waterfall-bar{cursor:pointer}.waterfall-bar:focus-visible,.waterfall-bar[aria-selected="true"]{stroke:var(--sherlock-control-primary);stroke-width:2}.waterfall-total{fill:var(--sherlock-chart-1)}.waterfall-positive{fill:var(--sherlock-market-positive)}.waterfall-negative{fill:var(--sherlock-market-negative)}.waterfall-readout{min-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-variant-numeric:tabular-nums}.waterfall-legend{font-size:9px;color:var(--sherlock-muted)}'

export function renderWaterfall(spec) {
 const {start,changes,unit,startLabel='起点',endLabel='终点'}=spec
 if(!finite(start)||!Array.isArray(changes)||!changes.length||changes.length>12||changes.some(change=>typeof change?.label!=='string'||!change.label.trim()||change.label.length>100||!finite(change.value))||
  typeof unit!=='string'||!unit.trim()||unit.length>20||typeof startLabel!=='string'||!startLabel.trim()||startLabel.length>40||typeof endLabel!=='string'||!endLabel.trim()||endLabel.length>40)return null
 const levels=[start];changes.forEach(change=>levels.push(Number((levels.at(-1)+change.value).toPrecision(12))))
 if(levels.some(value=>!finite(value)))return null
 const table=`<details><summary>完整增减明细</summary><table><thead><tr><th>项目</th><th>变动 (${esc(unit)})</th><th>累计 (${esc(unit)})</th></tr></thead><tbody><tr><td>${esc(startLabel)}</td><td>—</td><td>${start}</td></tr>${changes.map((change,index)=>`<tr><td>${esc(change.label)}</td><td>${change.value>0?'+':''}${change.value}</td><td>${levels[index+1]}</td></tr>`).join('')}<tr><td>${esc(endLabel)}</td><td>—</td><td>${levels.at(-1)}</td></tr></tbody></table></details>`
 const body=`<div class="market-waterfall"><div class="waterfall-readout" role="status">${esc(startLabel)} ${start} ${esc(unit)} → ${esc(endLabel)} ${levels.at(-1)} ${esc(unit)}</div><svg viewBox="0 0 506 164" role="img" aria-label="增减瀑布图；选中柱查看明细"></svg><div class="waterfall-legend">起点/终点 · 增加 · 减少；按项目查看累计变化</div>${table}</div>`
 return {body,script:`(${waterfallRuntime.toString()})(${start},${json(changes)},${json(unit)},${json(startLabel)},${json(endLabel)});`}
}
