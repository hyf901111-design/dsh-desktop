const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const finite=value=>typeof value==='number'&&Number.isFinite(value)
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c')

function allocationRuntime(items,unit) {
 const root=document.querySelector('.market-allocation'),svg=root?.querySelector('svg'),legend=[...(root?.querySelectorAll('[data-allocation-index]')??[])],readout=root?.querySelector('.allocation-readout'),visible=items.map(()=>true)
 if(!root||!svg||!readout)return
 const ns='http://www.w3.org/2000/svg',add=(name,attributes)=>{const el=document.createElementNS(ns,name);for(const [key,value] of Object.entries(attributes))el.setAttribute(key,String(value));svg.appendChild(el);return el}
 const draw=()=>{
  svg.replaceChildren()
  const total=items.reduce((sum,item,index)=>sum+(visible[index]?item.value:0),0),radius=48,circumference=2*Math.PI*radius
  let offset=0
  items.forEach((item,index)=>{
   if(!visible[index])return
   const share=item.value/total,dash=share*circumference
   const arc=add('circle',{class:`allocation-arc allocation-color-${index+1}`,cx:70,cy:70,r:radius,fill:'none','stroke-width':22,'stroke-dasharray':`${dash} ${circumference-dash}`,'stroke-dashoffset':-offset,tabindex:0,role:'button','aria-label':`${item.label} ${item.value} ${unit}，占当前显示 ${Number((share*100).toFixed(2))}%`})
   arc.addEventListener('click',()=>select(index));arc.addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key))return;event.preventDefault();select(index)})
   offset+=dash
  })
  const totalLabel=add('text',{class:'allocation-total',x:70,y:66,'text-anchor':'middle'});totalLabel.textContent=Number(total.toFixed(4))
  const unitLabel=add('text',{class:'allocation-unit',x:70,y:82,'text-anchor':'middle'});unitLabel.textContent=unit
  root.querySelector('.allocation-visible-total').textContent=`当前显示合计 ${Number(total.toFixed(4))} ${unit}`
 }
 const select=index=>{const total=items.reduce((sum,item,i)=>sum+(visible[i]?item.value:0),0);const item=items[index];readout.textContent=`${item.label} · ${item.value} ${unit} · 占当前显示 ${Number((item.value/total*100).toFixed(2))}%`}
 legend.forEach(button=>button.addEventListener('click',()=>{const index=Number(button.dataset.allocationIndex);if(visible[index]&&visible.filter(Boolean).length===1)return;visible[index]=!visible[index];button.setAttribute('aria-pressed',String(visible[index]));draw();const active=visible.findIndex(Boolean);select(active)}))
 draw();select(visible.findIndex(Boolean))
}

export const ALLOCATION_CSS='.market-allocation{display:grid;grid-template-columns:150px minmax(0,1fr);gap:10px;align-items:center}.market-allocation svg{display:block;width:140px;height:140px;transform:rotate(-90deg)}.market-allocation svg text{transform:rotate(90deg);transform-origin:70px 70px;fill:var(--sherlock-text);font:14px var(--sherlock-font-sans)}.market-allocation svg .allocation-unit{fill:var(--sherlock-muted);font-size:11px}.allocation-arc{cursor:pointer}.allocation-arc:focus-visible{outline:2px solid var(--sherlock-control-primary)}.allocation-color-1{stroke:var(--sherlock-chart-1)}.allocation-color-2{stroke:var(--sherlock-chart-2)}.allocation-color-3{stroke:var(--sherlock-chart-3)}.allocation-color-4{stroke:var(--sherlock-chart-4)}.allocation-color-5{stroke:var(--sherlock-chart-5)}.allocation-color-6{stroke:var(--sherlock-chart-6)}.allocation-color-7{stroke:var(--sherlock-chart-1);opacity:.65}.allocation-color-8{stroke:var(--sherlock-chart-2);opacity:.65}.allocation-legend{display:grid;gap:3px;max-height:155px;overflow:auto}.allocation-legend button{display:grid;grid-template-columns:10px minmax(0,1fr) auto;align-items:center;gap:5px;width:100%;padding:4px;border:1px solid var(--sherlock-border);border-radius:3px;background:var(--sherlock-surface-muted);color:var(--sherlock-text);font:11px var(--sherlock-font-sans);text-align:left;cursor:pointer}.allocation-legend button[aria-pressed="false"]{opacity:.4}.allocation-legend i{width:9px;height:9px;border-radius:50%;background:var(--sherlock-chart-1)}.allocation-legend button:nth-child(2) i{background:var(--sherlock-chart-2)}.allocation-legend button:nth-child(3) i{background:var(--sherlock-chart-3)}.allocation-legend button:nth-child(4) i{background:var(--sherlock-chart-4)}.allocation-legend button:nth-child(5) i{background:var(--sherlock-chart-5)}.allocation-legend button:nth-child(6) i{background:var(--sherlock-chart-6)}.allocation-legend button span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.allocation-readout,.allocation-visible-total{grid-column:1/-1;font-size:11px;color:var(--sherlock-muted);min-height:16px}.market-allocation details{grid-column:1/-1}@media(max-width:420px){.market-allocation{grid-template-columns:120px minmax(0,1fr);gap:4px}.market-allocation svg{width:120px;height:120px}}'

export function renderAllocation(spec) {
 const {items,unit}=spec
 if(!Array.isArray(items)||items.length<2||items.length>8||items.some(item=>typeof item?.label!=='string'||!item.label.trim()||item.label.length>100||!finite(item.value)||item.value<=0)||typeof unit!=='string'||!unit.trim()||unit.length>20)return null
 const total=items.reduce((sum,item)=>sum+item.value,0)
 const legend=items.map((item,index)=>`<button type="button" data-allocation-index="${index}" aria-pressed="true" aria-label="筛选 ${esc(item.label)}"><i></i><span>${esc(item.label)}</span><span>${Number((item.value/total*100).toFixed(2))}%</span></button>`).join('')
 const table=`<details><summary>完整配置数据</summary><table><thead><tr><th>分类</th><th>数值 (${esc(unit)})</th><th>占总量</th></tr></thead><tbody>${items.map(item=>`<tr><td>${esc(item.label)}</td><td>${item.value}</td><td>${Number((item.value/total*100).toFixed(2))}%</td></tr>`).join('')}</tbody></table></details>`
 const body=`<div class="market-allocation"><svg viewBox="0 0 140 140" role="img" aria-label="配置占比环图"></svg><div class="allocation-legend" role="group" aria-label="筛选配置分类">${legend}</div><div class="allocation-visible-total">合计 ${Number(total.toFixed(4))} ${esc(unit)}</div><div class="allocation-readout" role="status"></div>${table}</div>`
 return {body,script:`(${allocationRuntime.toString()})(${json(items)},${json(unit)});`}
}
