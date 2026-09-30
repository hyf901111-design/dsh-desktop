// Latest Figma 1917:347589 / 347932. Source records, never example-company data.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const text=(v,max=2000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max
const finite=v=>typeof v==='number'&&Number.isFinite(v)
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v
const encode=v=>JSON.stringify(v).replace(/</g,'\\u003c')
export const FINANCIAL_REVENUE_VARIANTS=Object.freeze(['revenue-geography','revenue-business'])
const fields='"datasets":[{"symbol":"代码","name":"公司名","periodType":"annual/quarterly","currency":"CNY等3位币种","unit":"百万元等来源单位","basis":"合并/母公司等来源口径","coverage":"complete/partial","coverageNote":"partial时必填未覆盖说明","periods":[{"label":"财年/季度","endDate":"YYYY-MM-DD","disclosedAt":"YYYY-MM-DD"}],"totals":[来源总收入数字或null],"totalMissing":"含null总额时的缺失原因","segments":[{"id":"跨期间一致的分项id","name":"原地区/业务名","values":[来源收入数字或null],"missing":"含null时的缺失原因"}]}]；1–12组已取得公司/周期组合，组合唯一；1–40个截止日严格递增的期间，披露日不得早于截止日；1–24个唯一分项，values和totals与periods等长；覆盖全部且各项均已知时分项合计须与来源总收入一致；其他项只有来源明确披露时才提供，不从差额编造；缺失不补0，0和负收入原样保留，不转换币种或单位，不把已知部分合计当公司总收入'
export const FINANCIAL_REVENUE_FIELDS=Object.freeze(Object.fromEntries(FINANCIAL_REVENUE_VARIANTS.map(v=>[v,fields])))
export const FINANCIAL_REVENUE_GUIDANCE=' 地域收入用market.revenue-geography，业务线收入用market.revenue-business；首次提交完整结构化artifact，不输出HTML。'+FINANCIAL_REVENUE_VARIANTS.map(v=>v+'：'+fields).join('。')
export function inferFinancialRevenueVariant(value=''){
 if(/地域收入|地区收入|分地区.{0,8}收入|revenue[.-]geography/iu.test(value))return 'revenue-geography'
 if(/业务线收入|分业务.{0,8}收入|产品收入结构|revenue[.-]business/iu.test(value))return 'revenue-business'
}
export function financialRevenueDataIssue(s){
 if(!FINANCIAL_REVENUE_VARIANTS.includes(s?.variant))return null
 if(!Array.isArray(s.datasets)||!s.datasets.length||s.datasets.length>12)return 'datasets 必须包含1–12组已取得公司/周期收入'
 const seen=new Set()
 for(const [n,d]of s.datasets.entries()){
  if(!text(d?.symbol,80)||!text(d.name)||!['annual','quarterly'].includes(d.periodType)||!text(d.unit)||!text(d.basis)||!(/^[A-Z]{3}$/).test(d.currency)||!['complete','partial'].includes(d.coverage))return `datasets[${n}] 必须保留代码、名称、annual/quarterly、币种单位、口径和complete/partial覆盖范围`
  if(d.coverage==='partial'&&!text(d.coverageNote))return `datasets[${n}].coverageNote 必须说明未覆盖部分`
  const key=d.symbol+':'+d.periodType;if(seen.has(key))return 'datasets 的代码/周期组合不能重复';seen.add(key)
  if(!Array.isArray(d.periods)||!d.periods.length||d.periods.length>40)return 'periods 必须包含1–40个已披露期间'
  const labels=new Set();let last=''
  for(const p of d.periods){if(!text(p?.label,80)||labels.has(p.label)||!date(p.endDate)||!date(p.disclosedAt)||p.endDate<=last||p.disclosedAt<p.endDate)return 'periods 须标签唯一、截止日严格递增且披露日不早于截止日';labels.add(p.label);last=p.endDate}
  if(!Array.isArray(d.totals)||d.totals.length!==d.periods.length||d.totals.some(v=>v!==null&&!finite(v)))return 'totals 必须与periods等长，保留来源公司总收入或null'
  if(d.totals.includes(null)&&!text(d.totalMissing))return 'totalMissing 必须解释未提供的公司总收入'
  if(!Array.isArray(d.segments)||!d.segments.length||d.segments.length>24)return 'segments 必须包含1–24个已披露分项'
  const ids=new Set()
  for(const [i,r]of d.segments.entries()){
   if(!text(r?.id,80)||ids.has(r.id)||!text(r.name)||!Array.isArray(r.values)||r.values.length!==d.periods.length||r.values.some(v=>v!==null&&!finite(v)))return `segments[${i}] 必须有唯一跨期id、名称和与periods等长的数字/null`
   if(r.values.includes(null)&&!text(r.missing))return `segments[${i}].missing 必须解释未知收入，不能补0`
   ids.add(r.id)
  }
  for(let i=0;i<d.periods.length;i++){
   const known=d.segments.map(r=>r.values[i]).filter(v=>v!==null);if(!finite(known.reduce((n,v)=>n+Math.max(0,v),0))||!finite(known.reduce((n,v)=>n+Math.min(0,v),0)))return '收入分项合计超出可用数值范围'
  }
  if(d.coverage==='complete')for(let i=0;i<d.periods.length;i++){
   const values=d.segments.map(r=>r.values[i]);if(d.totals[i]===null||values.includes(null))continue
   const sum=values.reduce((a,b)=>a+b,0),tolerance=Math.max(1e-8,Math.abs(d.totals[i])*1e-6)
   if(Math.abs(sum-d.totals[i])>tolerance)return `datasets[${n}].totals[${i}] 与已披露完整分项合计不一致；核对来源，不能制造其他项补差`
  }
 }
 return null
}
// Reserved source series retain the source palette; other ids use a stable
// hash, independent of period, dataset ordering or newly inserted series.
export function revenueSeriesColor(id){
 const known={americas:1,europe:2,'greater-china':3,japan:4,'asia-pacific':5,other:6,mac:1,services:2,wearables:3,ipad:4,iphone:5,ipod:6,itunes:7,'other-products':8}
 let hash=2166136261;for(const ch of id)hash=Math.imul(hash^ch.charCodeAt(0),16777619)>>>0
 const slot=known[id]??hash%8+1
 return `var(--sherlock-chart-${slot},var(--sherlock-muted))`
}
function revenueRuntime(s,colors){
 const root=document.querySelector('.financial-revenue'),symbol=root.querySelector('[data-revenue-symbol]'),period=root.querySelector('[data-revenue-period]'),legend=root.querySelector('[data-revenue-legend]'),pager=root.querySelector('[data-revenue-page]'),prev=root.querySelector('[data-revenue-prev]'),next=root.querySelector('[data-revenue-next]'),svg=root.querySelector('svg'),readout=root.querySelector('[data-revenue-readout]'),meta=root.querySelector('[data-revenue-meta]'),note=root.querySelector('[data-revenue-note]'),head=root.querySelector('thead tr'),body=root.querySelector('tbody')
 let current=0,page=0,hidden=new Set(),selectedPeriod=0,selectedSegment='',selected=false
 const ns='http://www.w3.org/2000/svg',number=v=>v===null?'未提供':v.toLocaleString('en-US',{maximumFractionDigits:20})
 const add=(tag,attrs,label)=>{const el=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(label!==undefined)el.textContent=label;svg.appendChild(el);return el}
 const save=()=>{const d=s.datasets[current];root.dataset.workbenchChartView=JSON.stringify({symbol:d.symbol,periodType:d.periodType,hidden:[...hidden],page,selectedPeriod:d.periods[selectedPeriod].label,selectedSegment,selected})}
 const options=(el,values,label)=>{const old=el.value;el.replaceChildren();for(const value of values){const o=document.createElement('option');o.value=value;o.textContent=label(value);el.appendChild(o)}if(values.includes(old))el.value=old}
 const choose=()=>{options(symbol,[...new Set(s.datasets.map(d=>d.symbol))],v=>v+' · '+s.datasets.find(d=>d.symbol===v).name);options(period,[...new Set(s.datasets.filter(d=>d.symbol===symbol.value).map(d=>d.periodType))],v=>v==='annual'?'财年':'季度');current=s.datasets.findIndex(d=>d.symbol===symbol.value&&d.periodType===period.value)}
 const show=(i,id)=>{
  const d=s.datasets[current];selectedPeriod=Math.max(0,Math.min(d.periods.length-1,i));selectedSegment=d.segments.some(r=>r.id===id&&!hidden.has(id))?id:d.segments.find(r=>!hidden.has(r.id)).id;selected=true
  const p=d.periods[selectedPeriod],r=d.segments.find(r=>r.id===selectedSegment),value=r.values[selectedPeriod],total=d.totals[selectedPeriod],all=d.segments.map(r=>r.values[selectedPeriod]),sum=all.filter(v=>v!==null).reduce((a,b)=>a+b,0),share=value!==null&&total!==null&&total!==0?value/total*100:null
  readout.textContent=p.label+' · '+r.name+' '+number(value)+' '+d.unit+' '+d.currency+(value===null?' · '+r.missing:'')+' · 占来源总收入 '+(share===null?'无法计算':share.toLocaleString('en-US',{maximumFractionDigits:2})+'%')+' · 来源总收入 '+number(total)+(total===null?' · '+d.totalMissing:'')+' · 已披露分项合计 '+number(sum)+(all.includes(null)?'（含未知分项，仅合计已知值）':'')+' · 截至 '+p.endDate+' · 披露 '+p.disclosedAt
  svg.setAttribute('aria-label',readout.textContent+'；左右键期间、上下键分项');svg.querySelectorAll('[data-revenue-point]').forEach(el=>el.setAttribute('aria-selected',String(Number(el.dataset.revenueIndex)===selectedPeriod&&el.dataset.revenueSegment===selectedSegment)));save()
 }
 const drawLegend=()=>{
  const d=s.datasets[current],pages=Math.ceil(d.segments.length/8);page=Math.max(0,Math.min(pages-1,page));legend.replaceChildren();pager.textContent=(page+1)+' / '+pages;prev.disabled=page===0;next.disabled=page===pages-1;prev.hidden=next.hidden=pager.hidden=pages===1
  for(const r of d.segments.slice(page*8,page*8+8)){
   const b=document.createElement('button');b.type='button';b.textContent=r.name;b.dataset.revenueToggle=r.id;b.style.setProperty('--revenue-color',colors[r.id]);b.setAttribute('aria-pressed',String(!hidden.has(r.id)));b.disabled=!hidden.has(r.id)&&d.segments.filter(r=>!hidden.has(r.id)).length===1
   b.addEventListener('click',()=>{hidden.has(r.id)?hidden.delete(r.id):hidden.add(r.id);drawLegend();draw();show(selectedPeriod,selectedSegment)});legend.appendChild(b)
  }
 }
 const draw=()=>{
  const d=s.datasets[current],rows=d.segments.filter(r=>!hidden.has(r.id)),w=Math.max(300,svg.clientWidth),left=60,right=w-12,top=12,bottom=224
  const sums=d.periods.map((_,i)=>({pos:rows.reduce((n,r)=>n+Math.max(0,r.values[i]??0),0),neg:rows.reduce((n,r)=>n+Math.min(0,r.values[i]??0),0)})),lo=Math.min(0,...sums.map(v=>v.neg)),hi=Math.max(0,...sums.map(v=>v.pos)),span=hi-lo||1,min=lo<0?lo-span*.05:0,max=hi+span*.08||1,y=v=>bottom-(v-min)/(max-min)*(bottom-top),step=(right-left)/d.periods.length,bar=Math.min(48,step*.7)
  svg.setAttribute('viewBox',`0 0 ${w} 266`);svg.replaceChildren()
  for(let i=0;i<4;i++){const v=min+(max-min)*i/3,yy=y(v);add('line',{class:'revenue-grid',x1:left,x2:right,y1:yy,y2:yy});add('text',{x:left-6,y:yy+4,'text-anchor':'end'},v.toLocaleString('en-US',{notation:'compact',maximumFractionDigits:2}))}
  const stride=Math.max(1,Math.ceil(d.periods.length/Math.max(2,Math.floor((right-left)/95))))
  d.periods.forEach((p,i)=>{
   const x=left+step*i+(step-bar)/2;let pos=0,neg=0
   for(const r of rows){const v=r.values[i];if(v===null)continue;const start=v>=0?pos:neg,end=start+v;if(v>=0)pos=end;else neg=end
    const rect=add('rect',{x,y:Math.min(y(start),y(end)),width:bar,height:Math.max(v===0?1:0,Math.abs(y(end)-y(start))),style:'fill:'+colors[r.id],tabindex:0,role:'button','aria-label':p.label+' · '+r.name+' '+number(v)+' '+d.unit+' '+d.currency,'data-revenue-point':'true','data-revenue-index':i,'data-revenue-segment':r.id,'aria-selected':selected&&i===selectedPeriod&&r.id===selectedSegment});const title=document.createElementNS(ns,'title');title.textContent=rect.getAttribute('aria-label');rect.appendChild(title);const select=()=>show(i,r.id);rect.addEventListener('pointerenter',select);rect.addEventListener('click',select);rect.addEventListener('focus',select);rect.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select()}})
   }
   if(rows.some(r=>r.values[i]===null)){add('rect',{class:'revenue-incomplete',x,y:top,width:bar,height:bottom-top,'aria-label':p.label+' 含未知分项，仅绘制已披露收入'});add('text',{x:x+bar/2,y:top+10,'text-anchor':'middle'},'?')}
   if(i%stride===0){const t=add('text',{x:x+bar/2,y:246,'text-anchor':'middle'},p.label.length>8?p.label.slice(0,7)+'…':p.label);const title=document.createElementNS(ns,'title');title.textContent=p.label; t.appendChild(title)}
  })
  note.textContent=(hidden.size?'图中只显示已开启分项；':'')+(d.coverage==='partial'?'未覆盖全部公司收入：'+d.coverageNote:(d.segments.some(r=>r.values.includes(null))?'完整分项范围含未知收入，只合计已知值。':'覆盖完整分项；已知收入与来源总额核对。'))+' 未知不补零，占比以来源总额计算。';save()
 }
 const rebuild=()=>{
  const d=s.datasets[current];meta.textContent=d.symbol+' · '+d.currency+' · '+d.unit+' · '+d.basis;head.replaceChildren();body.replaceChildren()
  for(const label of ['期间 / 截止日 / 披露日',...d.segments.map(r=>r.name+'（'+d.unit+'）'),'来源总收入']){const th=document.createElement('th');th.textContent=label;head.appendChild(th)}
  d.periods.forEach((p,i)=>{const tr=document.createElement('tr');for(const [n,v]of [p.label+' · 截至 '+p.endDate+' · 披露 '+p.disclosedAt,...d.segments.map(r=>number(r.values[i])+(r.values[i]===null?' · '+r.missing:'')),number(d.totals[i])+(d.totals[i]===null?' · '+d.totalMissing:'')].entries()){const td=document.createElement('td');td.textContent=v;if(n>0){td.dataset.refreshKey='revenue:'+d.symbol+':'+d.periodType+':'+p.label+':'+(d.segments[n-1]?.id??'total');td.dataset.refreshValue=String(n===d.segments.length+1?d.totals[i]:d.segments[n-1].values[i])}tr.appendChild(td)}body.appendChild(tr)})
  selectedPeriod=Math.max(0,Math.min(d.periods.length-1,selectedPeriod));drawLegend();draw();show(selectedPeriod,selectedSegment)
 }
 for(const el of [symbol,period])el.addEventListener('change',()=>{choose();hidden=new Set();page=0;selectedPeriod=s.datasets[current].periods.length-1;selectedSegment='';rebuild()})
 prev.addEventListener('click',()=>{page--;drawLegend();save()});next.addEventListener('click',()=>{page++;drawLegend();save()})
 svg.addEventListener('keydown',e=>{const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];if(!keys.includes(e.key))return;e.preventDefault();const d=s.datasets[current],rows=d.segments.filter(r=>!hidden.has(r.id)),index=rows.findIndex(r=>r.id===selectedSegment);show(e.key==='Home'?0:e.key==='End'?d.periods.length-1:selectedPeriod+(e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0),rows[(index+(e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0)+rows.length)%rows.length].id)})
 root.addEventListener('sherlock-chart-restore',e=>{if(e.target!==root)return;const v=e.detail,index=s.datasets.findIndex(d=>d.symbol===v?.symbol&&d.periodType===v?.periodType);if(index<0||!Array.isArray(v.hidden)||v.hidden.length>24)return;symbol.value=v.symbol;choose();period.value=v.periodType;choose();const d=s.datasets[current];hidden=new Set(v.hidden.filter(id=>d.segments.some(r=>r.id===id)));if(d.segments.every(r=>hidden.has(r.id)))hidden.delete(d.segments[0].id);page=Number.isSafeInteger(v.page)?v.page:0;selectedPeriod=d.periods.findIndex(p=>p.label===v.selectedPeriod);selectedSegment=v.selectedSegment;rebuild()})
 choose();selectedPeriod=s.datasets[current].periods.length-1;rebuild()
 let width=svg.clientWidth;new ResizeObserver(()=>{const nextWidth=svg.clientWidth;if(nextWidth===width)return;width=nextWidth;requestAnimationFrame(draw)}).observe(root)
}
export const FINANCIAL_REVENUE_CSS=`@layer ework-workbench{
${FINANCIAL_REVENUE_VARIANTS.map(v=>`body[data-sherlock-market="${v}"]`).join(',')}{display:flex;flex-direction:column;height:100vh!important;overflow:hidden!important}
body .financial-revenue{display:flex;flex-direction:column;gap:6px;overflow:auto}
body .financial-revenue>*{flex:none;min-width:0}
body .revenue-controls{display:flex;gap:6px;align-items:center;flex-wrap:wrap;--sherlock-control-secondary:var(--sherlock-control-bg)}
body .revenue-controls label{display:flex;gap:4px;align-items:center;font-size:11px;color:var(--sherlock-muted)}
body .revenue-legend-row{display:flex;align-items:center;gap:5px}
body .revenue-legend{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;flex:1}
body .revenue-legend button{font-size:11px!important;line-height:16px!important;text-align:left;min-height:20px!important;padding:0 4px!important;background:transparent!important;color:var(--sherlock-muted)!important;border:0!important;white-space:normal!important;overflow-wrap:anywhere}
body .revenue-legend button::before{content:'';display:inline-block;width:11px;height:11px;margin-right:5px;background:var(--revenue-color)}
body .revenue-legend button[aria-pressed=false]{text-decoration:line-through;opacity:.65}
body .revenue-pager{display:flex;align-items:center;gap:3px;font-size:11px;--sherlock-control-secondary:var(--sherlock-control-bg)}
body .revenue-pager button{min-width:20px!important;min-height:20px!important;padding:0!important}
body .financial-revenue svg{display:block;width:100%;height:266px!important;max-width:100%;flex:none}
body .financial-revenue svg text{fill:var(--sherlock-chart-label);font:11px var(--sherlock-font-sans)}
body .revenue-grid{stroke:var(--sherlock-chart-grid);stroke-width:.6}
body [data-revenue-point][aria-selected=true]{stroke:var(--sherlock-text);stroke-width:1.5;vector-effect:non-scaling-stroke}
body .revenue-incomplete{fill:none;stroke:var(--sherlock-muted);stroke-width:1;stroke-dasharray:3 3;pointer-events:none}
body .financial-revenue svg:focus-visible{outline:1px solid var(--sherlock-control-primary);outline-offset:-1px}
body .financial-revenue p{margin:0;font-size:11px!important;line-height:16px!important;color:var(--sherlock-muted);overflow-wrap:anywhere}
body [data-revenue-readout]{max-height:80px;overflow:auto}
body .revenue-table-wrap{max-height:280px;overflow:auto;scrollbar-width:thin}
body .revenue-table-wrap table{min-width:600px;table-layout:auto!important}
body .revenue-table-wrap th{position:sticky;top:0;background:var(--sherlock-surface-muted)}
body .revenue-table-wrap :is(th,td){min-width:100px;padding:5px!important;line-height:16px!important;font-size:11px!important}
body .financial-revenue [hidden]{display:none!important}
@media(max-width:600px){body .revenue-legend{grid-template-columns:repeat(2,minmax(0,1fr))}}
}
`
export function renderFinancialRevenue(s){
 if(financialRevenueDataIssue(s))return null
 const colors=Object.fromEntries(s.datasets.flatMap(d=>d.segments.map(r=>[r.id,revenueSeriesColor(r.id)])))
 return {body:'<section class="financial-profile financial-revenue" data-workbench-chart-view="{}" data-workbench-view-key="revenue-controls"><div class="revenue-controls"><label>公司<select data-revenue-symbol aria-label="收入公司"></select></label><label>期间<select data-revenue-period aria-label="收入期间"></select></label></div><p data-revenue-meta></p><div class="revenue-legend-row"><div class="revenue-legend" data-revenue-legend role="group" aria-label="收入分项图例"></div><div class="revenue-pager"><button type="button" data-revenue-prev aria-label="上一页图例">‹</button><span data-revenue-page></span><button type="button" data-revenue-next aria-label="下一页图例">›</button></div></div><svg tabindex="0" role="img" aria-label="分项收入堆叠柱"></svg><p data-revenue-readout role="status"></p><p data-revenue-note></p><details><summary>完整收入与披露记录</summary><div class="revenue-table-wrap"><table aria-label="完整收入"><thead><tr></tr></thead><tbody></tbody></table></div></details></section>',script:`(${revenueRuntime.toString()})(${encode(s)},${encode(colors)});`}
}
