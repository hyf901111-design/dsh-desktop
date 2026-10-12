import { marketSeriesViewport, observeMarketSeries } from './market-series-viewport.js'
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const finite=value=>typeof value==='number'&&Number.isFinite(value)
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c')

export function equityDrawdownRuntime(labels,equity,benchmark,unit,viewport,observe) {
 const root=document.querySelector('.market-equity-drawdown'),svg=root?.querySelector('svg'),readout=root?.querySelector('.drawdown-readout'),ranges=[...(root?.querySelectorAll('[data-drawdown-range]')??[])],views=[...(root?.querySelectorAll('[data-drawdown-view]')??[])]
 if(!root||!svg||!readout)return
 const ns='http://www.w3.org/2000/svg',add=(name,attributes)=>{const el=document.createElementNS(ns,name);for(const [key,value] of Object.entries(attributes))el.setAttribute(key,String(value));svg.appendChild(el);return el}
 let count=labels.length,mode='equity',selected=labels.length-1,peak=0,layout
 const drawdowns=equity.map(value=>{peak=Math.max(peak,value);return Number(((value/peak-1)*100).toFixed(4))})
 const range=()=>({start:Math.max(0,labels.length-count),length:Math.min(count,labels.length)})
 const draw=()=>{
  const {start,length}=range(),primary=mode==='equity'?equity.map(value=>value/equity[0]*100):drawdowns,secondary=mode==='equity'?benchmark.map(value=>value/benchmark[0]*100):null
  const points=primary.slice(start),others=secondary?.slice(start)??[],rawMin=Math.min(...points,...others),rawMax=Math.max(...points,...others),span=rawMax-rawMin||1,min=rawMin-span*.08,max=rawMax+span*.08
  const axisLabels=Array.from({length:5},(_,i)=>(max-(max-min)*i/4).toFixed(mode==='drawdown'?1:0)+(mode==='drawdown'?'%':''))
  layout=viewport(svg,axisLabels);const {left,right,top,bottom}=layout
  const x=index=>layout.x(index,length),y=value=>bottom-(value-min)/(max-min)*(bottom-top)
  svg.replaceChildren()
  if(mode==='drawdown'){const fill=[`${left},${bottom}`,...points.map((value,index)=>`${x(index)},${y(value)}`),`${right},${bottom}`].join(' ');add('polygon',{class:'drawdown-area',points:fill})}
  for(let step=0;step<=4;step++){const value=max-(max-min)*step/4,yy=y(value);add('line',{class:'drawdown-grid',x1:left,y1:yy,x2:right,y2:yy});const text=add('text',{x:left-7,y:yy+3,'text-anchor':'end'});text.textContent=value.toFixed(mode==='drawdown'?1:0)+(mode==='drawdown'?'%':'')}
  if(secondary)add('polyline',{class:'drawdown-benchmark',points:others.map((value,index)=>`${x(index)},${y(value)}`).join(' ')})
  add('polyline',{class:'drawdown-primary',points:points.map((value,index)=>`${x(index)},${y(value)}`).join(' ')})
  layout.dates(labels,start,length)
  selected=Math.max(start,Math.min(labels.length-1,selected));const xx=x(selected-start)
  add('line',{class:'drawdown-crosshair',x1:xx,y1:top,x2:xx,y2:bottom});add('circle',{class:'drawdown-dot',cx:xx,cy:y(primary[selected]),r:3})
  readout.textContent=`${labels[selected]} · 净值 ${equity[selected]} ${unit} · 基准 ${benchmark[selected]} ${unit} · 回撤 ${drawdowns[selected]}%`
  svg.dataset.selectedIndex=String(selected);svg.setAttribute('aria-label',readout.textContent+'；方向键切换时点')
 }
 svg.addEventListener('pointermove',event=>{const rect=svg.getBoundingClientRect();if(!rect.width)return;const {start,length}=range();selected=start+Math.round(((event.clientX-rect.left)/rect.width*layout.width-layout.left)/(layout.right-layout.left)*(length-1));draw()})
 svg.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const {start}=range();selected=event.key==='Home'?start:event.key==='End'?labels.length-1:selected+(event.key==='ArrowLeft'?-1:1);draw()})
 ranges.forEach(button=>button.addEventListener('click',()=>{count=button.dataset.drawdownRange==='all'?labels.length:Number(button.dataset.drawdownRange);selected=labels.length-1;ranges.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));draw()}))
 views.forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.drawdownView;views.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));draw()}))
 draw();observe(svg,draw)
}

export const EQUITY_DRAWDOWN_CSS='.drawdown-controls{display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap;margin-bottom:4px}.drawdown-controls>div{display:flex;gap:3px}.drawdown-controls button{font:11px var(--sherlock-font-sans);color:var(--sherlock-control-text);background:var(--sherlock-control-bg);border:1px solid var(--sherlock-control-border);border-radius:4px;padding:3px 6px;cursor:pointer}.drawdown-controls button[aria-pressed="true"]{background:var(--sherlock-control-primary);color:var(--sherlock-control-on-primary)}.drawdown-controls button:disabled{opacity:.45}.drawdown-readout{min-height:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-variant-numeric:tabular-nums}.market-equity-drawdown svg{display:block;width:100%;height:clamp(124px,calc(100vh - 102px),168px)}.market-equity-drawdown svg text{fill:var(--sherlock-chart-label);font:11px var(--sherlock-font-sans)}.market-equity-drawdown svg:focus-visible{outline:2px solid var(--sherlock-control-primary);outline-offset:-2px}.drawdown-grid{stroke:var(--sherlock-chart-grid);stroke-width:.6}.drawdown-area{fill:var(--sherlock-chart-2);opacity:.19}.drawdown-primary,.drawdown-benchmark{fill:none;stroke-width:1.7;vector-effect:non-scaling-stroke}.drawdown-primary{stroke:var(--sherlock-chart-1)}.drawdown-benchmark{stroke:var(--sherlock-chart-2)}.drawdown-crosshair{stroke:var(--sherlock-chart-crosshair);stroke-dasharray:3 3}.drawdown-dot{fill:var(--sherlock-surface);stroke:var(--sherlock-chart-1);stroke-width:2}.drawdown-legend{display:flex;gap:10px;color:var(--sherlock-muted);font-size:11px}'

export function renderEquityDrawdown(spec) {
 const {labels,equity,benchmark,unit}=spec
 if(!Array.isArray(labels)||labels.length<2||labels.length>366||labels.some(label=>typeof label!=='string'||!label.trim()||label.length>100)||
  !Array.isArray(equity)||equity.length!==labels.length||equity.some(value=>!finite(value)||value<=0)||
  !Array.isArray(benchmark)||benchmark.length!==labels.length||benchmark.some(value=>!finite(value)||value<=0)||
  typeof unit!=='string'||!unit.trim()||unit.length>20)return null
 let peak=0;const drawdowns=equity.map(value=>{peak=Math.max(peak,value);return Number(((value/peak-1)*100).toFixed(4))})
 const controls=`<div class="drawdown-controls"><div role="group" aria-label="视图"><button type="button" data-drawdown-view="equity" aria-pressed="true">净值对比</button><button type="button" data-drawdown-view="drawdown" aria-pressed="false">回撤</button></div><div role="group" aria-label="时间范围">${[['all','全部'],[20,'近1月'],[60,'近3月'],[240,'近1年']].filter(([count])=>count==='all'||labels.length>=Number(count)).map(([count,label])=>`<button type="button" data-drawdown-range="${count}" aria-pressed="${count==='all'}">${label}</button>`).join('')}</div></div>`
 const last=labels.length-1,table=`<details><summary>完整净值与回撤数据</summary><table><thead><tr><th>时点</th><th>净值 (${esc(unit)})</th><th>基准 (${esc(unit)})</th><th>回撤</th></tr></thead><tbody>${labels.map((label,index)=>`<tr><td>${esc(label)}</td><td>${equity[index]}</td><td>${benchmark[index]}</td><td>${drawdowns[index]}%</td></tr>`).join('')}</tbody></table></details>`
 const body=`<div class="market-equity-drawdown">${controls}<div class="drawdown-readout" role="status">${esc(labels[last])} · 净值 ${equity[last]} ${esc(unit)} · 基准 ${benchmark[last]} ${esc(unit)} · 回撤 ${drawdowns[last]}%</div><svg viewBox="0 0 506 164" preserveAspectRatio="xMidYMid meet" data-series-viewport="v2" role="img" tabindex="0" aria-label="净值与回撤；方向键切换时点"></svg><div class="drawdown-legend"><span>● 组合净值</span><span>● 基准</span><span>回撤由净值历史峰值计算</span></div>${table}</div>`
 return {body,script:`(${equityDrawdownRuntime.toString()})(${json(labels)},${json(equity)},${json(benchmark)},${json(unit)},${marketSeriesViewport.toString()},${observeMarketSeries.toString()});`}
}
