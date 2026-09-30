// Editable Figma defaults 1917:342876 / 344628 / 344811.
// Source observations are never interpolated or substituted by chart examples.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const text = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 2000
const finite = v => typeof v === 'number' && Number.isFinite(v)
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v
const encode = v => JSON.stringify(v).replace(/</g,'\\u003c')
const metricNames = {'pe':'市盈率','ps':'市销率','pb':'市净率','evSales':'企业价值 / 营收','evEbitda':'企业价值 / EBITDA'}
export const FINANCIAL_SERIES_VARIANTS = Object.freeze(['price-performance','valuation-multiples','price-target'])
export const FINANCIAL_SERIES_FIELDS = Object.freeze({
 'price-performance':'"symbol":"代码","market":"交易市场","timezone":"报价时区","adjustmentBasis":"复权口径","priceUnit":"原币种价格单位","volumeUnit":"成交量单位","period":"日线等周期","candles":[{"date":"YYYY-MM-DD","open":正数,"high":正数,"low":正数,"close":正数,"volume":非负数或null,"missing":"成交量null时必填原因"}]；1–366个严格递增的真实日期，low≤open/close≤high；不插值或虚构OHLC，不把成交量缺失补0，范围只筛选已取得记录',
 'valuation-multiples':'"symbol":"代码","basis":"估值计算和财年口径","unit":"倍","datasets":[{"periodType":"annual或quarterly","periods":["2024"或"2024-Q1"],"series":[{"metric":"pe/ps/pb/evSales/evEbitda","values":[数字或null],"missing":"任一null时原因"}]}]；1–2组不同周期，每组1–160个严格递增期间、1–5条不重复指标、values等长。负市盈率保留并标明负盈利倍数；不同单位另用其他模板，不混进单轴；只切换实际已取得的周期组',
 'price-target':'"symbol":"代码","currency":"CNY等3位币种","evaluationDate":"YYYY-MM-DD（判断过期的查询日期）","currentPrice":正数或null,"currentAsOf":"当前价真实时点","currentMissing":"当前价null时原因","forecasts":[{"institution":"机构","targetPrice":正数或null,"issuedDate":"YYYY-MM-DD","validUntil":"可选有效截止日","missing":"targetPrice为null时原因"}]；1–100条，不重复机构+发布日期，发布不晚于evaluationDate；目标价与当前价必须是同一币种原价，目标价为预测不作成交价。可选history:[{date:"YYYY-MM-DD",value:正数或null,missing:"null原因"}]，2–366条实际收盘记录、递增且不晚于evaluationDate；预测散点、实际历史与当前参考价分别标注'
})
// The parent may submit supplied/simulated records without starting a panel
// model. Give that path the same exact contract as the child and registry;
// otherwise it guesses aliases and repeats a large batch for each rejection.
export const FINANCIAL_SERIES_GUIDANCE = ' 价格表现、估值倍数和分析师目标价已有独立预置模板。这三类自定义模拟工作台首次调用就附完整panel.artifact:{version:1,type:"market",title,variant,asOf,...以下对应字段}，保留用户记录，不填通用行情示例。字段名必须按契约，不猜别名或用嵌套对象代替数字；不确定时先research_component_data action=templates查看契约，再提交工作台。'
 + FINANCIAL_SERIES_VARIANTS.map(variant => `\nmarket.${variant} 的artifact.variant="${variant}"，数据字段：${FINANCIAL_SERIES_FIELDS[variant]}。`).join('')
export function inferFinancialSeriesVariant(value = '') {
 for (const [variant,pattern] of [['price-performance',/价格表现|price[.-]performance/iu],['valuation-multiples',/估值倍数|估值倍率|valuation[.-]multiples/iu],['price-target',/分析师目标价|机构目标价|目标价分布|price[.-]target/iu]]) if (pattern.test(value)) return variant
}
export function financialSeriesDataIssue(s) {
 if (!FINANCIAL_SERIES_VARIANTS.includes(s?.variant)) return null
 if (!text(s.symbol) || s.symbol.length > 80) return 'symbol 必须提供不超过80字的证券代码'
 if (s.variant === 'price-performance') {
  if (!['market','timezone','adjustmentBasis','priceUnit','volumeUnit','period'].every(k => text(s[k]))) return '必须提供市场、时区、复权、价格/成交量单位和周期'
  if (!Array.isArray(s.candles) || !s.candles.length || s.candles.length > 366) return 'candles 必须包含1–366个已取得交易日'
  for (const [i,c] of s.candles.entries()) {
   if (!date(c?.date) || i && c.date <= s.candles[i-1].date) return `candles[${i}].date 必须是真实递增且不重复日期`
   if (!['open','high','low','close'].every(k => finite(c[k]) && c[k] > 0) || c.low > Math.min(c.open,c.close) || c.high < Math.max(c.open,c.close)) return `candles[${i}] 的OHLC必须是同口径正数且满足高低边界`
   if (c.volume !== null && (!finite(c.volume) || c.volume < 0)) return `candles[${i}].volume 必须是非负来源数字或null`
   if (c.volume === null && !text(c.missing)) return `candles[${i}].missing 必须说明未提供的成交量`
  }
 }
 if (s.variant === 'valuation-multiples') {
  if (!text(s.basis) || s.unit !== '倍') return 'basis 必须保留财年/估值口径，unit 只能是倍；其他量纲使用独立模板'
  if (!Array.isArray(s.datasets) || !s.datasets.length || s.datasets.length > 2) return 'datasets 必须包含1–2组已取得的年度或季度记录'
  const types = new Set()
  for (const [i,d] of s.datasets.entries()) {
   if (!['annual','quarterly'].includes(d?.periodType) || types.has(d.periodType)) return 'periodType 必须为不重复的annual/quarterly'
   types.add(d.periodType)
   const pattern = d.periodType === 'annual' ? /^\d{4}$/ : /^\d{4}-Q[1-4]$/
   if (!Array.isArray(d.periods) || !d.periods.length || d.periods.length > 160 || d.periods.some((p,j) => typeof p !== 'string' || !pattern.test(p) || j && p <= d.periods[j-1])) return `datasets[${i}].periods 必须是1–160个严格递增且不重复的同类期间`
   if (!Array.isArray(d.series) || !d.series.length || d.series.length > 5) return `datasets[${i}].series 必须是1–5个倍数指标`
   const metrics = new Set()
   for (const row of d.series) {
    if (!Object.hasOwn(metricNames,row?.metric) || metrics.has(row.metric)) return 'metric 必须为不重复的pe/ps/pb/evSales/evEbitda'
    metrics.add(row.metric)
    if (!Array.isArray(row.values) || row.values.length !== d.periods.length || row.values.some(v => v !== null && !finite(v))) return 'values 必须与periods等长，保留数字或null'
    if (row.values.includes(null) && !text(row.missing)) return 'missing 必须解释空期间，不补0或跨空点连线'
   }
  }
 }
 if (s.variant === 'price-target') {
  if (!/^[A-Z]{3}$/.test(s.currency ?? '') || !date(s.evaluationDate) || !text(s.currentAsOf)) return '必须提供统一3位币种、查询日期及当前价时点'
  if (s.currentPrice !== null && (!finite(s.currentPrice) || s.currentPrice <= 0) || s.currentPrice === null && !text(s.currentMissing)) return 'currentPrice 必须是原币正数或null；null需currentMissing说明'
  if (!Array.isArray(s.forecasts) || !s.forecasts.length || s.forecasts.length > 100) return 'forecasts 必须包含1–100条机构记录'
  const seen = new Set()
  for (const [i,r] of s.forecasts.entries()) {
   if (!text(r?.institution) || r.institution.length > 80 || !date(r.issuedDate) || r.issuedDate > s.evaluationDate) return `forecasts[${i}] 必须保留机构与不晚于查询日期的发布日期`
   const id = r.institution + ':' + r.issuedDate
   if (seen.has(id)) return '不能重复同一机构同一天的目标价记录'
   seen.add(id)
   if (r.targetPrice !== null && (!finite(r.targetPrice) || r.targetPrice <= 0) || r.targetPrice === null && !text(r.missing)) return 'targetPrice 必须是同币种正数或null，null需missing说明'
   if (r.currency !== undefined && r.currency !== s.currency) return '机构目标价不能混入不同币种'
   if (r.validUntil !== undefined && (!date(r.validUntil) || r.validUntil < r.issuedDate)) return 'validUntil 必须是发布日之后的有效截止日期'
  }
  if (s.history !== undefined && (!Array.isArray(s.history) || s.history.length < 2 || s.history.length > 366 || s.history.some((p,i) => !date(p?.date) || p.date > s.evaluationDate || i && p.date <= s.history[i-1].date || p.value !== null && (!finite(p.value) || p.value <= 0) || p.value === null && !text(p.missing)))) return 'history 必须是递增的实际同币种报价，缺失保留null及原因，不能夹入预测目标价'
 }
 return null
}

function performanceRuntime(s) {
 const root = document.querySelector('.financial-series'), canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d'), readout = root.querySelector('[data-series-readout]'), coverage = root.querySelector('[data-series-coverage]'), buttons = [...root.querySelectorAll('[data-performance-range]')]
 if (!ctx) return
 let count = s.candles.length, selected = s.candles.length - 1, locked = null
 const range = () => locked ? s.candles.filter(c => c.date >= locked.start && c.date <= locked.end) : s.candles.slice(-count)
 const draw = () => {
  const rows = range(); if (!rows.length) return
  selected = Math.max(0,Math.min(rows.length - 1,selected))
  const w = Math.max(240,canvas.clientWidth), h = 240, dpr = window.devicePixelRatio || 1
  canvas.width = w*dpr; canvas.height = h*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h)
  const style = getComputedStyle(document.documentElement), color = key => style.getPropertyValue('--sherlock-' + key).trim()
  const low = Math.min(...rows.map(c => c.low)), high = Math.max(...rows.map(c => c.high)), span = high-low || Math.max(high*.01,1), lo = locked?.lo ?? low-span*.08, hi = locked?.hi ?? high+span*.08
  const right = Math.max(160,w-60), x = i => 4+(right-4)*(i+.5)/rows.length, y = v => 168-(v-lo)/(hi-lo)*156, volumeMax = Math.max(1,...rows.map(c => c.volume ?? 0))
  canvas.dataset.workbenchChartView = JSON.stringify({lo,hi,start:rows[0].date,end:rows.at(-1).date,symbol:s.symbol})
  ctx.font = '11px sans-serif'; ctx.textBaseline = 'middle'; ctx.lineWidth = .6
  for (let i=0;i<4;i++) { const v=lo+(hi-lo)*i/3, yy=y(v); ctx.strokeStyle=color('chart-grid');ctx.beginPath();ctx.moveTo(4,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.fillStyle=color('chart-label');ctx.fillText(v.toLocaleString('en-US',{maximumFractionDigits:2}),right+5,yy) }
  rows.forEach((c,i) => { const bw=Math.max(1,Math.min(9,(right-4)/rows.length*.65));ctx.strokeStyle=ctx.fillStyle=color(c.close>=c.open?'market-positive':'market-negative');ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x(i),y(c.high));ctx.lineTo(x(i),y(c.low));ctx.stroke();ctx.fillRect(x(i)-bw/2,Math.min(y(c.open),y(c.close)),bw,Math.max(1,Math.abs(y(c.open)-y(c.close))));if(c.volume!==null)ctx.fillRect(x(i)-bw/2,211-c.volume/volumeMax*30,bw,c.volume/volumeMax*30) })
  ctx.fillStyle=color('chart-label');ctx.fillText(s.priceUnit,4,6);ctx.fillText(s.volumeUnit,right+5,194)
  for (const i of [...new Set([0,Math.floor((rows.length-1)/2),rows.length-1])]) { const value=rows[i].date;ctx.fillText(value,Math.max(4,Math.min(right-ctx.measureText(value).width,x(i))),232) }
  const c=rows[selected];readout.textContent=`${c.date} · 开 ${c.open} · 高 ${c.high} · 低 ${c.low} · 收 ${c.close} ${s.priceUnit} · 成交量 ${c.volume===null?'未提供':c.volume+' '+s.volumeUnit}${c.missing?' · '+c.missing:''}`
  coverage.textContent=`${rows[0].date} — ${rows.at(-1).date} · ${rows.length} 个已取得交易日`
  canvas.setAttribute('aria-label',readout.textContent+'；方向键查看交易日，双击恢复范围')
  ctx.strokeStyle=color('chart-crosshair');ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(x(selected),12);ctx.lineTo(x(selected),211);ctx.stroke();ctx.setLineDash([])
 }
 canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();selected=Math.floor((e.clientX-r.left-4)/Math.max(1,r.width-64)*range().length);draw()})
 canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();selected=e.key==='Home'?0:e.key==='End'?range().length-1:selected+(e.key==='ArrowLeft'?-1:1);draw()}})
 buttons.forEach(b=>b.addEventListener('click',()=>{locked=null;count=b.dataset.performanceRange==='all'?s.candles.length:Number(b.dataset.performanceRange);selected=count-1;buttons.forEach(v=>v.setAttribute('aria-pressed',String(v===b)));draw()}))
 const navigate=(action)=>{
  if(action==='reset'){locked=null;count=s.candles.length;selected=count-1;buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.performanceRange==='all')));draw();return}
  const rows=range(),first=s.candles.indexOf(rows[0]),last=s.candles.indexOf(rows.at(-1)),length=rows.length
  let start=first,end=last
  if(action==='in'||action==='out'){
   const next=Math.max(1,Math.min(s.candles.length,action==='in'?Math.floor(length*.65):Math.max(length+1,Math.ceil(length/0.65)))),center=first+selected
   start=Math.max(0,Math.min(s.candles.length-next,center-Math.floor(next/2)));end=start+next-1
  }else{
   const shift=Math.max(1,Math.floor(length/3))*(action==='left'?-1:1);start=Math.max(0,Math.min(s.candles.length-length,first+shift));end=start+length-1
  }
  const part=s.candles.slice(start,end+1),low=Math.min(...part.map(c=>c.low)),high=Math.max(...part.map(c=>c.high)),span=high-low||Math.max(high*.01,1)
  locked={start:part[0].date,end:part.at(-1).date,lo:low-span*.08,hi:high+span*.08,symbol:s.symbol};selected=Math.min(selected,part.length-1);buttons.forEach(b=>b.setAttribute('aria-pressed','false'));draw()
 }
 root.querySelectorAll('[data-performance-action]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.performanceAction)))
 let dragStart=null
 canvas.addEventListener('pointerdown',e=>{if(e.button===0)dragStart=e.clientX})
 canvas.addEventListener('pointerup',e=>{if(dragStart!==null&&Math.abs(e.clientX-dragStart)>8)navigate(e.clientX>dragStart?'left':'right');dragStart=null})
 canvas.addEventListener('pointercancel',()=>{dragStart=null})
 canvas.addEventListener('sherlock-chart-restore',e=>{const v=e.detail;if(v&&[v.lo,v.hi].every(Number.isFinite)&&v.hi>v.lo&&v.symbol===s.symbol&&s.candles.some(c=>c.date>=v.start&&c.date<=v.end)){locked=v;draw()}})
 canvas.addEventListener('dblclick',()=>navigate('reset'))
 new ResizeObserver(draw).observe(canvas);window.addEventListener('sherlock-theme-change',draw);draw()
}

function multiplesRuntime(s,names) {
 const root=document.querySelector('.financial-series'), svg=root.querySelector('svg'), select=root.querySelector('[data-multiples-period]'), legend=root.querySelector('[data-series-legend]'), readout=root.querySelector('[data-series-readout]'), table=root.querySelector('tbody')
 let current=0,selected=s.datasets[0].periods.length-1,hidden=new Set(),locked=null
 const ns='http://www.w3.org/2000/svg', add=(tag,attrs,label)=>{const el=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(label!==undefined)el.textContent=label;svg.appendChild(el);return el}
 const draw=()=>{
  const d=s.datasets[current],visible=d.series.filter(r=>!hidden.has(r.metric)),w=Math.max(300,svg.clientWidth),left=44,right=w-10
  let start=locked?d.periods.indexOf(locked.start):0,end=locked?d.periods.indexOf(locked.end):d.periods.length-1
  if(start<0||end<start){locked=null;start=0;end=d.periods.length-1}
  selected=Math.max(start,Math.min(end,selected));const known=visible.flatMap(r=>r.values.slice(start,end+1)).filter(v=>v!==null),low=Math.min(0,...known),high=Math.max(0,...known),span=high-low||1,min=locked?.min??low-span*.1,max=locked?.max??high+span*.1,x=i=>left+(right-left)*(i-start)/Math.max(1,end-start),y=v=>198-(v-min)/(max-min)*184
  svg.setAttribute('viewBox',`0 0 ${w} 230`);svg.replaceChildren();svg.dataset.workbenchChartView=JSON.stringify({min,max,start:d.periods[start],end:d.periods[end]})
  root.dataset.workbenchChartView=JSON.stringify({period:d.periodType,hidden:[...hidden],selected:d.periods[selected]})
  for(const b of legend.children)b.disabled=!hidden.has(b.dataset.seriesMetric)&&visible.length===1
  for(let i=0;i<5;i++){const v=min+(max-min)*i/4,yy=y(v);add('line',{class:'series-grid',x1:left,x2:right,y1:yy,y2:yy});add('text',{x:left-6,y:yy+4,'text-anchor':'end'},v.toLocaleString('en-US',{maximumFractionDigits:1}))}
  d.series.forEach((r,n)=>{if(hidden.has(r.metric))return;let pen=false;const path=r.values.slice(start,end+1).map((v,i)=>{if(v===null){pen=false;return ''}const part=(pen?'L':'M')+x(i+start)+','+y(v);pen=true;return part}).join(' ');add('path',{d:path,class:'series-line',style:`stroke:var(--sherlock-chart-${n+1})`,'data-series-metric':r.metric});r.values.slice(start,end+1).forEach((v,i)=>{if(v!==null)add('circle',{cx:x(i+start),cy:y(v),r:i+start===selected?3:1.6,style:`fill:var(--sherlock-chart-${n+1})`})})
  })
  for(const i of [...new Set([start,start+Math.floor((end-start)/2),end])])add('text',{x:x(i),y:224,'text-anchor':i===start?'start':i===end?'end':'middle'},d.periods[i])
  add('line',{class:'series-crosshair',x1:x(selected),x2:x(selected),y1:10,y2:202})
  const line=r=>`${names[r.metric]} ${r.values[selected]===null?'未提供':r.values[selected]+' 倍'}${r.metric==='pe'&&r.values[selected]<0?'（负盈利倍数）':''}${r.values[selected]===null?'：'+r.missing:''}`
  readout.textContent=d.periods[selected]+' · '+visible.map(line).join(' · ');svg.setAttribute('aria-label',readout.textContent+'；方向键读取期间')
 }
 const rebuild=()=>{
  const d=s.datasets[current];legend.replaceChildren();table.replaceChildren()
  d.series.forEach((r,n)=>{const b=document.createElement('button');b.type='button';b.dataset.seriesMetric=r.metric;b.textContent=names[r.metric];b.style.setProperty('--series-color',`var(--sherlock-chart-${n+1})`);b.setAttribute('aria-pressed',String(!hidden.has(r.metric)));b.addEventListener('click',()=>{if(!hidden.has(r.metric)&&d.series.filter(v=>!hidden.has(v.metric)).length===1)return;hidden.has(r.metric)?hidden.delete(r.metric):hidden.add(r.metric);b.setAttribute('aria-pressed',String(!hidden.has(r.metric)));draw()});legend.appendChild(b)})
  d.periods.forEach((p,i)=>{const row=document.createElement('tr');for(const v of [p,...d.series.map(r=>r.values[i]===null?'未提供 · '+r.missing:r.values[i]+' 倍'+(r.metric==='pe'&&r.values[i]<0?'（负盈利倍数）':''))]){const td=document.createElement('td');td.textContent=v;row.appendChild(td)}table.appendChild(row)})
  root.querySelector('thead tr').replaceChildren();for(const label of ['期间',...d.series.map(r=>names[r.metric]+'（倍）')]){const th=document.createElement('th');th.textContent=label;root.querySelector('thead tr').appendChild(th)}
  draw()
 }
 select.addEventListener('change',()=>{current=Number(select.value);locked=null;selected=s.datasets[current].periods.length-1;rebuild()})
 svg.addEventListener('pointermove',e=>{const r=svg.getBoundingClientRect(),d=s.datasets[current],start=locked?d.periods.indexOf(locked.start):0,end=locked?d.periods.indexOf(locked.end):d.periods.length-1;selected=start+Math.round((e.clientX-r.left-44)/Math.max(1,r.width-54)*(end-start));draw()})
 svg.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();selected=e.key==='Home'?0:e.key==='End'?s.datasets[current].periods.length-1:selected+(e.key==='ArrowLeft'?-1:1);draw()}})
 svg.addEventListener('sherlock-chart-restore',e=>{const v=e.detail,d=s.datasets[current];if(v&&[v.min,v.max].every(Number.isFinite)&&v.max>v.min&&d.periods.includes(v.start)&&d.periods.indexOf(v.end)>=d.periods.indexOf(v.start)){locked=v;draw()}})
 root.addEventListener('sherlock-chart-restore',e=>{if(e.target!==root)return;const v=e.detail,index=s.datasets.findIndex(d=>d.periodType===v?.period);if(index<0||!Array.isArray(v.hidden)||v.hidden.length>5||v.hidden.some(k=>!Object.hasOwn(names,k)))return;current=index;select.value=String(index);hidden=new Set(v.hidden);if(s.datasets[index].series.every(r=>hidden.has(r.metric)))hidden.delete(s.datasets[index].series[0].metric);selected=s.datasets[index].periods.indexOf(v.selected);locked=null;rebuild()})
 svg.addEventListener('dblclick',()=>{locked=null;draw()});new ResizeObserver(draw).observe(svg);rebuild()
}

function targetRuntime(s) {
 const root=document.querySelector('.financial-series'),svg=root.querySelector('svg'),sort=root.querySelector('[data-target-sort]'),expired=root.querySelector('[data-target-expired]'),table=root.querySelector('tbody'),readout=root.querySelector('[data-series-readout]')
 const key=r=>r.institution+':'+r.issuedDate,isExpired=r=>r.validUntil!==undefined&&r.validUntil<s.evaluationDate,ns='http://www.w3.org/2000/svg';let selected=''
 const add=(tag,attrs,label)=>{const el=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(label!==undefined)el.textContent=label;svg.appendChild(el);return el}
 const records=()=>s.forecasts.filter(r=>expired.checked||!isExpired(r)).sort((a,b)=>sort.value==='price'?(a.targetPrice===null?b.targetPrice===null?0:1:b.targetPrice===null?-1:b.targetPrice-a.targetPrice):b.issuedDate.localeCompare(a.issuedDate))
 const select=r=>{selected=key(r);readout.textContent=`${r.institution} · 预测目标 ${r.targetPrice===null?'未提供':r.targetPrice+' '+s.currency} · 发布 ${r.issuedDate} · ${r.validUntil?'有效至 '+r.validUntil:'未提供有效截止日'}${isExpired(r)?' · 已过期':''}${r.missing?' · '+r.missing:''}`;root.dataset.workbenchChartView=JSON.stringify({selected});root.querySelectorAll('[data-target-key]').forEach(el=>el.setAttribute('aria-selected',String(el.dataset.targetKey===selected)))}
 const draw=()=>{
  const rows=records(),w=Math.max(300,svg.clientWidth),left=44,right=w-12,observations=[...rows.map(r=>r.targetPrice),s.currentPrice,...(s.history??[]).map(r=>r.value)].filter(v=>v!==null),lo=Math.min(...observations),hi=Math.max(...observations),span=hi-lo||Math.max(1,hi*.01),min=Number.isFinite(lo)?Math.max(0,lo-span*.15):0,max=Number.isFinite(hi)?hi+span*.15:1,dates=[s.evaluationDate,...rows.map(r=>r.issuedDate),...(s.history??[]).map(r=>r.date)].map(v=>Date.parse(v)),first=Math.min(...dates),last=Math.max(...dates),x=d=>last===first?(left+right)/2:left+(right-left)*(Date.parse(d)-first)/(last-first),y=v=>190-(v-min)/(max-min)*174
  svg.setAttribute('viewBox',`0 0 ${w} 230`);svg.replaceChildren();table.replaceChildren()
  for(let i=0;i<4;i++){const v=min+(max-min)*i/3,yy=y(v);add('line',{class:'series-grid',x1:left,x2:right,y1:yy,y2:yy});add('text',{x:left-6,y:yy+4,'text-anchor':'end'},v.toLocaleString('en-US',{maximumFractionDigits:2}))}
  for(const t of [...new Set([first,first+(last-first)/2,last])])add('text',{x:last===first?(left+right)/2:left+(right-left)*(t-first)/(last-first),y:224,'text-anchor':last===first?'middle':t===first?'start':t===last?'end':'middle'},new Date(t).toISOString().slice(0,10))
  if(s.currentPrice!==null)add('line',{class:'target-current',x1:left,x2:right,y1:y(s.currentPrice),y2:y(s.currentPrice)})
  if(s.history){let pen=false;const path=s.history.map(p=>{if(p.value===null){pen=false;return ''}const part=(pen?'L':'M')+x(p.date)+','+y(p.value);pen=true;return part}).join(' ');add('path',{class:'target-history',d:path})}
  for(const r of rows){const id=key(r),row=document.createElement('tr');row.tabIndex=0;row.dataset.targetKey=id;row.setAttribute('aria-selected',String(selected===id));for(const [i,label]of [r.institution,r.targetPrice===null?'未提供':r.targetPrice+' '+s.currency,r.issuedDate,r.validUntil??'未提供',isExpired(r)?'已过期':r.validUntil?'有效期内':'未提供有效期',r.missing??''].entries()){const td=document.createElement('td');td.textContent=label;if(i===1){td.dataset.refreshKey='target:'+id;td.dataset.refreshValue=String(r.targetPrice)}row.appendChild(td)}const show=()=>select(r);row.addEventListener('click',show);row.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();show()}});table.appendChild(row)
   if(r.targetPrice!==null){const dot=add('circle',{cx:x(r.issuedDate),cy:y(r.targetPrice),r:4,class:isExpired(r)?'target-dot target-expired':'target-dot',tabindex:0,role:'button','aria-label':`${r.institution}，${r.issuedDate}预测目标价${r.targetPrice} ${s.currency}${isExpired(r)?'，已过期':''}`,'data-target-key':id,'aria-selected':selected===id});const title=document.createElementNS(ns,'title');title.textContent=dot.getAttribute('aria-label');dot.appendChild(title);dot.addEventListener('click',show);dot.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show()}})}
  }
  root.querySelector('[data-target-count]').textContent=rows.length+' / '+s.forecasts.length+' 条机构预测'
  const r=rows.find(r=>key(r)===selected);if(r)select(r);else{selected='';readout.textContent=rows.length?'点选预测散点或机构记录，查看完整日期与状态':'没有当前筛选下的机构记录';root.dataset.workbenchChartView=JSON.stringify({selected})}
 }
 sort.addEventListener('change',draw);expired.addEventListener('change',draw)
 root.addEventListener('sherlock-chart-restore',e=>{if(e.target===root&&typeof e.detail?.selected==='string'){selected=e.detail.selected;draw()}})
 new ResizeObserver(draw).observe(svg);draw()
}

export const FINANCIAL_SERIES_CSS = `
${FINANCIAL_SERIES_VARIANTS.map(v=>`body[data-sherlock-market="${v}"]`).join(',')}{display:flex;flex-direction:column;height:100vh!important;overflow:hidden!important}
body .financial-series{display:flex;flex-direction:column;gap:4px;overflow:auto}
body .financial-series>*{flex:none;min-width:0}
body .series-controls,body .series-legend{display:flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:11px;color:var(--sherlock-muted)}
body .series-controls label{display:flex;align-items:center;gap:4px}
body .series-controls :is(button,select),body .series-legend button{--sherlock-control-secondary:var(--sherlock-control-bg);font:11px/16px var(--sherlock-font-sans);padding:3px 7px!important;min-height:25px!important;border:1px solid var(--sherlock-control-border)!important;color:var(--sherlock-control-text)!important;background:var(--sherlock-control-bg)!important}
body .series-controls button[aria-pressed=true]{background:var(--sherlock-control-primary)!important;color:var(--sherlock-control-on-primary)!important}
body .series-legend button::before{content:'';display:inline-block;width:12px;height:2px;background:var(--series-color);margin:0 5px 3px 0}
body .series-legend button[aria-pressed=false]{text-decoration:line-through}
body .financial-series :is(svg,canvas){display:block;width:100%;height:240px;max-width:100%;flex:none}
body .financial-series svg{height:230px}
body .financial-series svg text{fill:var(--sherlock-chart-label);font:11px var(--sherlock-font-sans)}
body .financial-series :is(svg,canvas):focus-visible{outline:2px solid var(--sherlock-control-primary);outline-offset:-2px}
body .series-grid{stroke:var(--sherlock-chart-grid);stroke-width:.6}
body .series-line{fill:none;stroke-width:1.6;vector-effect:non-scaling-stroke}
body .series-crosshair{stroke:var(--sherlock-chart-crosshair);stroke-width:.7;stroke-dasharray:2 3}
body .series-table-wrap{max-height:240px;overflow:auto;scrollbar-width:thin}
body .series-table-wrap table{min-width:520px}
body .series-table-wrap th{position:sticky;top:0;z-index:1;background:var(--sherlock-control-bg)}
body .financial-series p,body [data-series-readout]{font-size:11px;line-height:16px;margin:0;color:var(--sherlock-muted);overflow-wrap:anywhere}
body [data-series-readout]{min-height:18px;max-height:64px;overflow:auto}
body .target-current{stroke:var(--sherlock-chart-1);stroke-width:1.4;stroke-dasharray:4 3}
body .target-history{fill:none;stroke:var(--sherlock-market-positive);stroke-width:1.5}
body .series-legend [class^="target-legend-"]{display:inline-flex;align-items:center;gap:4px}
body .target-legend-current::before{content:'';width:12px;border-top:1.4px dashed var(--sherlock-chart-1)}
body .target-legend-forecast::before,body .target-legend-expired::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--sherlock-chart-2)}
body .target-legend-expired::before{background:var(--sherlock-muted)}
body .target-legend-history::before{content:'';width:12px;height:1.5px;background:var(--sherlock-market-positive)}
body .target-dot{fill:var(--sherlock-chart-2);stroke:var(--sherlock-surface);stroke-width:1;cursor:pointer}
body .target-dot[aria-selected=true]{stroke:var(--sherlock-text);stroke-width:2}
body .target-expired{fill:var(--sherlock-muted);stroke-dasharray:2 2}
body .financial-series [aria-selected=true] :is(td,small){color:var(--sherlock-text)!important}
body .series-controls input[type=checkbox]{width:14px;height:14px!important;min-height:14px!important}
`
export function renderFinancialSeries(s) {
 if (financialSeriesDataIssue(s)) return null
 if (s.variant === 'price-performance') {
  const controls = [[5,'近5个交易日'],[20,'近20个交易日'],[60,'近60个交易日'],['all','全部']].filter(([n])=>n==='all'||n<s.candles.length).map(([n,label])=>`<button type="button" data-performance-range="${n}" aria-pressed="${n==='all'}">${label}</button>`).join('')+[['in','缩小范围'],['out','扩大范围'],['left','前移'],['right','后移'],['reset','重置']].map(([action,label])=>`<button type="button" data-performance-action="${action}">${label}</button>`).join('')
  const table=`<details><summary>完整OHLCV数据</summary><div class="series-table-wrap"><table><thead><tr>${['日期',`开（${s.priceUnit}）`,`高（${s.priceUnit}）`,`低（${s.priceUnit}）`,`收（${s.priceUnit}）`,`成交量（${s.volumeUnit}）`,'成交量缺失说明'].map(v=>`<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${s.candles.map(c=>`<tr>${['date','open','high','low','close','volume'].map(k=>`<td title="${esc(c.missing??'')}" data-refresh-key="performance:${esc(c.date)}:${k}" data-refresh-value="${esc(c[k])}">${c[k]===null?'未提供':esc(c[k])}</td>`).join('')}<td>${esc(c.missing??'—')}</td></tr>`).join('')}</tbody></table></div></details>`
  return {body:`<section class="financial-profile financial-series"><p class="financial-symbol">${esc(s.symbol)} · ${esc(s.market)} · ${esc(s.period)} · ${esc(s.timezone)} · ${esc(s.adjustmentBasis)}</p><div class="series-controls" role="group" aria-label="已取得交易日范围">${controls}</div><p data-series-coverage role="status"></p><div data-series-readout role="status"></div><canvas tabindex="0" role="img" data-workbench-chart-view="{}" data-workbench-view-key="performance" aria-label="价格与成交量共享时间轴"></canvas><p>蜡烛为实际OHLC；下栏为同日成交量，未知成交量不补零。范围按钮仅筛选已取得记录。</p>${table}</section>`,script:`(${performanceRuntime.toString()})(${encode(s)});`}
 }
 if (s.variant === 'valuation-multiples') return {body:`<section class="financial-profile financial-series" data-workbench-chart-view="{}" data-workbench-view-key="multiples-controls"><p class="financial-symbol">${esc(s.symbol)} · ${esc(s.basis)} · 单位：倍</p><div class="series-controls"><label>期间<select data-multiples-period aria-label="估值期间">${s.datasets.map((d,i)=>`<option value="${i}">${d.periodType==='annual'?'财年':'季度'}</option>`).join('')}</select></label><span>只显示已取得期间</span></div><div class="series-legend" data-series-legend role="group" aria-label="估值系列"></div><div data-series-readout role="status"></div><svg tabindex="0" role="img" data-workbench-chart-view="{}" data-workbench-view-key="multiples-plot" aria-label="估值倍数走势"></svg><p>负市盈率保留为负盈利倍数；未提供期间断线，不补零。</p><details><summary>完整估值数据</summary><div class="series-table-wrap"><table><thead><tr></tr></thead><tbody></tbody></table></div></details></section>`,script:`(${multiplesRuntime.toString()})(${encode(s)},${encode(metricNames)});`}
 if (s.variant === 'price-target') return {body:`<section class="financial-profile financial-series" data-workbench-chart-view="{}" data-workbench-view-key="target-controls"><p class="financial-symbol">${esc(s.symbol)} · ${s.currency} · 查询日期 ${s.evaluationDate}</p><div class="series-controls"><label>机构记录<select data-target-sort aria-label="目标价排序"><option value="date">发布日期从新到旧</option><option value="price">目标价从高到低</option></select></label><label><input type="checkbox" data-target-expired checked>包含过期目标价</label><span data-target-count role="status"></span></div><p>当前价 ${s.currentPrice===null?'未提供':esc(s.currentPrice)+' '+s.currency} · ${esc(s.currentAsOf)}${s.currentMissing?' · '+esc(s.currentMissing):''}</p><div class="series-legend"><span class="target-legend-current">当前价</span><span class="target-legend-forecast">机构预测</span><span class="target-legend-expired">已过期</span>${s.history?'<span class="target-legend-history">实际历史价格</span>':''}</div><svg role="img" aria-label="按机构发布日期绘制的预测目标价分布"></svg><div data-series-readout role="status"></div><p>目标价是预测，不能作为成交价。横轴为发布日期；没有有效截止日的记录明确标为未提供有效期。</p><details><summary>全部机构目标价记录</summary><div class="series-table-wrap"><table aria-label="机构目标价"><thead><tr>${['机构','预测目标价','发布日期','有效至','有效状态','缺失说明'].map(v=>`<th>${v}</th>`).join('')}</tr></thead><tbody></tbody></table></div></details>${s.history?`<details><summary>完整实际历史报价</summary><div class="series-table-wrap"><table aria-label="实际历史报价"><thead><tr><th>日期</th><th>实际收盘价（${s.currency}）</th><th>缺失说明</th></tr></thead><tbody>${s.history.map(p=>`<tr><td>${p.date}</td><td data-refresh-key="target-history:${p.date}" data-refresh-value="${esc(p.value)}">${p.value===null?'未提供':esc(p.value)}</td><td>${esc(p.missing??'—')}</td></tr>`).join('')}</tbody></table></div></details>`:''}</section>`,script:`(${targetRuntime.toString()})(${encode(s)});`}
 return null
}
