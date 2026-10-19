import { marketSeriesViewport, observeMarketSeries } from './market-series-viewport.js'
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const finite=value=>typeof value==='number'&&Number.isFinite(value)
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c')

export function priceVolumeRuntime(labels,prices,volumes,priceUnit,volumeUnit,viewport,observe) {
 // Saved cards receive this runtime during preview refinement. Keep their
 // control ancestry and all records so stored interaction routes stay valid.
 const records=document.querySelector('.price-volume>details')
 if(records){records.open=true;records.dataset.workbenchDefaultOpen='price-volume-v1'}
 const legacy=document.querySelector('body[data-layout-profile="openterminal"] .price-volume:not(.ot-price-volume)')
 if(legacy){
  legacy.classList.add('ot-price-volume-legacy')
  legacy.querySelectorAll('tbody tr').forEach((row,index)=>{row.dataset.priceVolumeIndex=String(index);row.tabIndex=0})
  legacy.querySelectorAll('[data-price-volume-range]').forEach(button=>{if(Number(button.dataset.priceVolumeRange)===labels.length)button.hidden=true})
 }
 const svg=document.querySelector('.price-volume svg'),readout=document.querySelector('.price-volume-readout'),buttons=[...document.querySelectorAll('[data-price-volume-range]')],rows=[...document.querySelectorAll('[data-price-volume-index]')]
 if(!svg||!readout)return
 const ns='http://www.w3.org/2000/svg',add=(name,attributes,parent=svg)=>{const el=document.createElementNS(ns,name);for(const [key,value] of Object.entries(attributes))el.setAttribute(key,String(value));parent.appendChild(el);return el}
 let count=labels.length,selected=labels.length-1,locked=null,layout
 const visible=()=>{if(locked){const start=labels.indexOf(locked.start),end=labels.indexOf(locked.end);return {start,length:end-start+1}}return {start:Math.max(0,labels.length-count),length:Math.min(count,labels.length)}}
 const draw=()=>{
  const {start,length}=visible(),subset=prices.slice(start,start+length),low=Math.min(...subset),high=Math.max(...subset),span=high-low||Math.max(1,Math.abs(high)*.02),min=locked?.min??low-span*.08,max=locked?.max??high+span*.08
  const axisLabels=Array.from({length:5},(_,i)=>(max-(max-min)*i/4).toFixed(Math.abs(max-min)<5?2:0))
  layout=viewport(svg,axisLabels)
  const {left,right,top,bottom,height}=layout,volumeHeight=Math.max(24,Math.min(60,height*.24)),divider=bottom-volumeHeight-10,priceBottom=divider-12
  const x=i=>layout.x(i,length),y=value=>priceBottom-(value-min)/(max-min)*(priceBottom-top)
  const maxVolume=Math.max(1,...volumes.slice(start,start+length).map(value=>value??0)),barWidth=Math.max(1,Math.min(12,(right-left)/length*.7))
  svg.setAttribute('data-workbench-chart-view',JSON.stringify({min,max,start:labels[start],end:labels[start+length-1]}))
  svg.replaceChildren()
  const ticks=Math.min(5,Math.max(2,Math.floor((priceBottom-top)/24)+1))
  for(let step=0;step<ticks;step++){const value=max-(max-min)*step/(ticks-1),yy=y(value);add('line',{x1:left,y1:yy,x2:right,y2:yy,class:'price-volume-grid'});const label=add('text',{x:left-7,y:yy+3,'text-anchor':'end'});label.textContent=value.toFixed(Math.abs(max-min)<5?2:0)}
  const line=add('polyline',{class:'price-volume-line',points:subset.map((value,i)=>`${x(i)},${y(value)}`).join(' ')})
  line.setAttribute('aria-hidden','true')
  volumes.slice(start,start+length).forEach((volume,i)=>{if(volume===null)return;const h=volume/maxVolume*volumeHeight;add('rect',{class:'price-volume-bar',x:x(i)-barWidth/2,y:bottom-h,width:barWidth,height:Math.max(1,h)})})
  add('line',{class:'price-volume-divider',x1:left,y1:divider,x2:right,y2:divider})
  layout.dates(labels,start,length)
  selected=Math.max(start,Math.min(start+length-1,selected))
  const selectedX=x(selected-start)
  add('line',{class:'price-volume-crosshair',x1:selectedX,y1:top,x2:selectedX,y2:bottom})
  add('circle',{'data-refresh-key':'price-volume:'+labels[selected],'data-refresh-value':prices[selected],class:'price-volume-dot',cx:selectedX,cy:y(prices[selected]),r:3})
  readout.textContent=`${labels[selected]}  ·  价格 ${prices[selected]} ${priceUnit}  ·  成交量 ${volumes[selected]??'—'} ${volumes[selected]===null?'':volumeUnit}`
  svg.setAttribute('aria-label',readout.textContent+'；方向键切换时点')
  svg.dataset.selectedIndex=String(selected)
  for(const row of rows){const index=Number(row.dataset.priceVolumeIndex);row.hidden=index<start||index>=start+length;row.setAttribute('aria-selected',String(index===selected))}
  const counter=document.querySelector('[data-price-volume-count]');if(counter)counter.textContent=length+' / '+labels.length
 }
 svg.addEventListener('pointermove',event=>{const rect=svg.getBoundingClientRect();if(!rect.width)return;const chartX=(event.clientX-rect.left)/rect.width*layout.width;const {start,length}=visible();selected=start+Math.round((chartX-layout.left)/(layout.right-layout.left)*(length-1));draw()})
 svg.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const {start}=visible();selected=event.key==='Home'?start:event.key==='End'?labels.length-1:selected+(event.key==='ArrowLeft'?-1:1);draw()})
 buttons.forEach(button=>button.addEventListener('click',()=>{locked=null;count=button.dataset.priceVolumeRange==='all'?labels.length:Number(button.dataset.priceVolumeRange);selected=labels.length-1;buttons.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));draw()}))
 rows.forEach(row=>{const select=()=>{selected=Number(row.dataset.priceVolumeIndex);draw()};row.addEventListener('click',select);row.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select()}})})
 svg.addEventListener('sherlock-chart-restore',event=>{const v=event.detail;if(!v||![v.min,v.max].every(Number.isFinite)||v.max<=v.min||typeof v.start!=='string'||typeof v.end!=='string'||labels.indexOf(v.start)<0||labels.indexOf(v.end)<labels.indexOf(v.start))return;locked=v;draw()})
 draw();observe(svg,draw)
}

export const PRICE_VOLUME_CSS='.price-volume-controls{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px}.price-volume-controls button{font:11px var(--sherlock-font-sans);color:var(--sherlock-control-text);background:var(--sherlock-control-bg);border:1px solid var(--sherlock-control-border);border-radius:4px;padding:3px 6px;cursor:pointer}.price-volume-controls button[aria-pressed="true"]{background:var(--sherlock-control-primary);color:var(--sherlock-control-on-primary)}.price-volume-controls button:disabled{opacity:.45;cursor:default}.price-volume-readout{min-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;font-variant-numeric:tabular-nums}.price-volume svg{display:block;width:100%;height:clamp(120px,calc(100vh - 98px),170px)}.price-volume svg:focus-visible{outline:2px solid var(--sherlock-control-primary);outline-offset:-2px}.price-volume svg text{fill:var(--sherlock-chart-label);font:11px var(--sherlock-font-sans)}.price-volume-grid,.price-volume-divider{stroke:var(--sherlock-chart-grid);stroke-width:.6}.price-volume-line{fill:none;stroke:var(--sherlock-chart-1);stroke-width:1.6;vector-effect:non-scaling-stroke}.price-volume-bar{fill:var(--sherlock-chart-2)}.price-volume-crosshair{stroke:var(--sherlock-chart-crosshair);stroke-dasharray:3 3}.price-volume-dot{fill:var(--sherlock-surface);stroke:var(--sherlock-chart-1);stroke-width:2}.price-volume-legend{display:flex;gap:12px;color:var(--sherlock-muted);font-size:11px}'

function priceVolumeRanges(labels) {
 const times=labels.map(Date.parse),gaps=times.slice(1).map((time,i)=>time-times[i])
 const intraday=times.every(Number.isFinite)&&labels.every(label=>/(?:T|\s)\d{2}:\d{2}/u.test(label))&&gaps.some(gap=>gap>0&&gap<86400000)
 if(!intraday)return [['all','全部'],[20,'近1月'],[60,'近3月'],[240,'近1年']].filter(([count])=>count==='all'||labels.length>=Number(count))
 const minutes=gaps[0]/60000,regular=Number.isInteger(minutes)&&minutes>0&&gaps.every(gap=>gap===gaps[0])
 return [['all','全部'],...[15,30,60,240].filter(count=>count<labels.length).map(count=>{
  const total=count*minutes
  return [count,regular?`近${total>=60&&total%60===0?total/60:total}${total>=60&&total%60===0?'小时':'分钟'}`:`近${count}条`]
 })]
}

export function renderPriceVolume(spec) {
 const {labels,prices,volumes,priceUnit,volumeUnit}=spec
 if(!Array.isArray(labels)||labels.length<2||labels.length>366||labels.some(label=>typeof label!=='string'||!label.trim()||label.length>100)||
  !Array.isArray(prices)||prices.length!==labels.length||prices.some(value=>!finite(value)||value<=0)||
  !Array.isArray(volumes)||volumes.length!==labels.length||volumes.some(value=>value!==null&&(!finite(value)||value<0))||!volumes.some(finite)||
  typeof priceUnit!=='string'||!priceUnit.trim()||priceUnit.length>20||typeof volumeUnit!=='string'||!volumeUnit.trim()||volumeUnit.length>20)return null
 const terminal=spec.layoutProfile==='openterminal',ranges=priceVolumeRanges(labels).filter(([count])=>!terminal||count==='all'||Number(count)<labels.length)
 const controls=`<div class="price-volume-controls" role="group" aria-label="时间范围">${ranges.map(([count,label])=>`<button type="button" data-price-volume-range="${count}" aria-pressed="${count==='all'}">${label}</button>`).join('')}</div>`
 const table=`<details open data-workbench-default-open="price-volume-v1"><summary>完整量价数据</summary><table><thead><tr><th>时点</th><th>价格 (${esc(priceUnit)})</th><th>成交量 (${esc(volumeUnit)})</th></tr></thead><tbody>${labels.map((label,i)=>`<tr><td>${esc(label)}</td><td>${prices[i]}</td><td>${volumes[i]??'—'}</td></tr>`).join('')}</tbody></table></details>`
 const last=labels.length-1
 const chart=`<div class="price-volume-readout" role="status">${esc(labels[last])} · 价格 ${prices[last]} ${esc(priceUnit)} · 成交量 ${volumes[last]??'—'} ${volumes[last]===null?'':esc(volumeUnit)}</div><svg viewBox="0 0 506 164" preserveAspectRatio="xMidYMid meet" data-series-viewport="v2" role="img" tabindex="0" aria-label="价格与成交量；方向键切换时点"></svg><div class="price-volume-legend"><span>● 价格 · ${esc(priceUnit)}</span><span>▮ 成交量 · ${esc(volumeUnit)}</span></div>`
 const records=terminal?`<section class="ot-price-volume-records" aria-label="完整量价记录"><header><strong>逐期明细</strong><span data-price-volume-count>${labels.length} / ${labels.length}</span></header><p>价格 / ${esc(priceUnit)} · 成交量 / ${esc(volumeUnit)}</p><div class="ot-record-scroll"><table><thead><tr><th>时点</th><th>价格</th><th>成交量</th></tr></thead><tbody>${labels.map((label,i)=>({label,i})).reverse().map(({label,i})=>`<tr tabindex="0" data-price-volume-index="${i}" aria-selected="${i===last}"><td>${esc(label)}</td><td>${prices[i]}</td><td>${volumes[i]===null?'—':volumes[i].toLocaleString('en-US')}</td></tr>`).join('')}</tbody></table></div></section>`:''
 const body=terminal?`<div class="price-volume ot-price-volume"><div class="ot-price-volume-toolbar">${controls}<span>${esc(labels[0])} — ${esc(labels[last])}</span></div><div class="ot-price-volume-layout"><div class="ot-price-volume-chart">${chart}</div>${records}</div></div>`:`<div class="price-volume">${controls}${chart}${table}</div>`
 return {body,css:PRICE_VOLUME_CSS,script:`(${priceVolumeRuntime.toString()})(${json(labels)},${json(prices)},${json(volumes)},${json(priceUnit)},${json(volumeUnit)},${marketSeriesViewport.toString()},${observeMarketSeries.toString()});`}
}
