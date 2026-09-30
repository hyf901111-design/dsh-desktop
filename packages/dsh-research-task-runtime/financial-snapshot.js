// Latest editable Figma masters: share statistics 1917:341499, market overview
// 1917:341610, currency snapshot 1917:341875, watchlist 1917:342632.
// Observations remain data; the host owns geometry, precision and interaction.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=2000
const finite=v=>typeof v==='number'&&Number.isFinite(v)
const encode=v=>JSON.stringify(v).replace(/</g,'\\u003c')
const currency=v=>typeof v==='string'&&/^[A-Z]{3}$/.test(v)
const states=['trading','closed','delayed','unavailable']
const stateText={trading:'盘中',closed:'已收盘',delayed:'延迟报价',unavailable:'报价不可用'}
const number=v=>v===null?'—':v.toLocaleString('en-US',{maximumFractionDigits:8})
const signed=v=>v===null?'—':v===0?'0%':Math.abs(v)<.005?(v>0?'+':'−')+'<0.01%':(v>0?'+':'')+v.toLocaleString('en-US',{maximumFractionDigits:2})+'%'
const tone=v=>v===null||v===0?'neutral':v>0?'positive':'negative'
export const FINANCIAL_SNAPSHOT_VARIANTS=Object.freeze(['share-statistics','market-overview','currency-snapshot','watchlist'])
export const FINANCIAL_SNAPSHOT_FIELDS=Object.freeze({
 'share-statistics':'"symbol":"证券代码","period":"股本统计日期/口径","shareUnit":"股/万股/亿股等原单位","totalShares":非负数字或null,"floatShares":非负数字或null,"freeFloatPercent":0–100百分数数字或null；流通股不大于总股本，股数与比例分别提供；未知必填missing原因，不能补0',
 'market-overview':'"indices":[{"symbol":"指数代码","name":"名称","market":"所属市场","unit":"点等原单位","price":非负数字或null,"changePercent":百分数数字或null,"state":"trading/closed/delayed/unavailable","asOf":"该指数交易时点","sparkline":{"labels":[时点],"values":[数字或null]},"sparklineMissing":"没有历史时必填原因","missing":"任一报价缺失时必填"}]；1–20个指数；sparkline可省略，提供时2–366个等长时点，不补0或虚构走势；不同市场各自注明收盘/延迟与时点',
 'currency-snapshot':'"precision":0–8小数位整数,"pairs":[{"base":"USD等3位货币","quote":"CNY等3位货币","rate":正数字或null,"dayChangePercent":百分数数字或null,"high52":正数字或null,"low52":正数字或null,"weekChangePercent":百分数数字或null,"month3ChangePercent":百分数数字或null,"month6ChangePercent":百分数数字或null,"asOf":"该货币对报价时点","missing":"任一字段为null时原因"}]；1–100个不重复货币对，方向为1单位base兑换rate单位quote；52周高不小于低；百分数必须大于-100，逆向报价由宿主按同一快照精确换算，不拼接不同时点',
 'watchlist':'"quotes":[{"symbol":"唯一证券代码","name":"名称","currency":"CNY等3位币种","price":非负数字或null,"dayChangePercent":百分数数字或null,"weekChangePercent":百分数数字或null,"monthChangePercent":百分数数字或null,"yearChangePercent":百分数数字或null,"pe":数字或null,"marketCap":非负数字或null,"volume":非负数字或null,"asOf":"该标的报价时点","state":"trading/closed/delayed/unavailable","missing":"任一字段为null时原因"}]；1–100条，marketCap为currency原币金额、volume为股，不把缺失数据补0；可选following:[代码]指定初始自选子集，默认全部；用户可从这批已取得记录增删自选，不假称新增行情已取数'
})
export const FINANCIAL_SNAPSHOT_GUIDANCE=' 股本统计使用market.share-statistics（symbol/period/shareUnit/totalShares/floatShares/freeFloatPercent）；市场概览用market.market-overview（indices的各自时点、交易状态和历史）；外汇用market.currency-snapshot（precision/pairs与报价方向）；自选股用market.watchlist（quotes逐标的币种、时点、状态，可选following）。这四类自定义模拟工作台同次附完整artifact，不填通用样本。百分比提供百分数，未知为null并说明missing，完整契约可查research_component_data action=templates。'
export function inferFinancialSnapshotVariant(value=''){
 for(const [variant,pattern]of [['share-statistics',/股本统计|股本结构|自由流通股|share[.-]statistics/iu],['market-overview',/市场概览|市场总览|主要指数概览|market[.-]overview/iu],['currency-snapshot',/外汇快照|汇率快照|汇率概览|currency[.-]snapshot/iu],['watchlist',/自选股|自选标的|watchlist/iu]])if(pattern.test(value))return variant
}
function nullableNumbers(row,fields,nonnegative=[]){
 for(const key of fields)if(row[key]!==null&&(!finite(row[key])||nonnegative.includes(key)&&row[key]<0))return `${key} 必须是来源数字或null，不能省略或填入单位字符串`
 if(fields.some(k=>row[k]===null)&&!text(row.missing))return 'missing 必须解释未提供的数据，不能用0代替'
 if(row.missing!==undefined&&!text(row.missing))return 'missing 必须是非空原因'
 return null
}
export function financialSnapshotDataIssue(s){
 if(!FINANCIAL_SNAPSHOT_VARIANTS.includes(s?.variant))return null
 if(s.variant==='share-statistics'){
  if(!text(s.symbol)||!text(s.period)||!text(s.shareUnit))return 'symbol/period/shareUnit 必须保留证券、统计时点及股数单位'
  const issue=nullableNumbers(s,['totalShares','floatShares','freeFloatPercent'],['totalShares','floatShares','freeFloatPercent']);if(issue)return issue
  if(s.freeFloatPercent!==null&&s.freeFloatPercent>100)return 'freeFloatPercent 必须是0–100百分数'
  if(s.totalShares!==null&&s.floatShares!==null&&s.floatShares>s.totalShares)return 'floatShares 不能大于同一口径的 totalShares'
 }
 if(s.variant==='market-overview'){
  if(!Array.isArray(s.indices)||!s.indices.length||s.indices.length>20)return 'indices 必须包含1–20个指数'
  const seen=new Set()
  for(const [i,r]of s.indices.entries()){
   if(!text(r?.symbol)||!text(r.name)||!text(r.market)||!text(r.unit)||!text(r.asOf)||!states.includes(r.state))return `indices[${i}] 必须包含代码、名称、市场、单位、交易状态和各自时点`
   if(seen.has(r.symbol))return 'indices.symbol 不能重复';seen.add(r.symbol)
   const issue=nullableNumbers(r,['price','changePercent'],['price']);if(issue)return `indices[${i}].${issue}`
   if(r.sparkline===undefined){if(!text(r.sparklineMissing))return `indices[${i}].sparklineMissing 必须解释历史缺失，不能画示意走势`}
   else {const p=r.sparkline;if(!Array.isArray(p?.labels)||p.labels.length<2||p.labels.length>366||!p.labels.every(text)||!Array.isArray(p.values)||p.values.length!==p.labels.length||p.values.some(v=>v!==null&&(!finite(v)||v<0))||!p.values.some(finite))return `indices[${i}].sparkline 必须是2–366个等长真实时点，缺失点保留null`}
  }
 }
 if(s.variant==='currency-snapshot'){
  if(!Number.isInteger(s.precision)||s.precision<0||s.precision>8)return 'precision 必须明确0–8位小数'
  if(!Array.isArray(s.pairs)||!s.pairs.length||s.pairs.length>100)return 'pairs 必须包含1–100个货币对'
  const seen=new Set()
  for(const [i,r]of s.pairs.entries()){
   if(!currency(r?.base)||!currency(r.quote)||r.base===r.quote||!text(r.asOf))return `pairs[${i}] 必须包含不同的3位base/quote货币及报价时点`
   const id=r.base+'/'+r.quote;if(seen.has(id)||seen.has(r.quote+'/'+r.base))return '同一货币对只能提供一个方向，逆向由宿主换算';seen.add(id)
   const issue=nullableNumbers(r,['rate','dayChangePercent','high52','low52','weekChangePercent','month3ChangePercent','month6ChangePercent']);if(issue)return `pairs[${i}].${issue}`
   for(const k of ['rate','high52','low52'])if(r[k]!==null&&(r[k]<=0||!Number.isFinite(1/r[k])))return `pairs[${i}].${k} 必须为可逆的正有限汇率`
   for(const k of ['dayChangePercent','weekChangePercent','month3ChangePercent','month6ChangePercent'])if(r[k]!==null&&r[k]<=-100)return `pairs[${i}].${k} 必须大于-100，才能保持正汇率`
   if(r.high52!==null&&r.low52!==null&&r.high52<r.low52)return `pairs[${i}].high52 不能小于low52`
  }
 }
 if(s.variant==='watchlist'){
  if(!Array.isArray(s.quotes)||!s.quotes.length||s.quotes.length>100)return 'quotes 必须包含1–100条行情'
  const seen=new Set()
  for(const [i,r]of s.quotes.entries()){
   if(!text(r?.symbol)||r.symbol.length>80||!text(r.name)||!currency(r.currency)||!text(r.asOf)||!states.includes(r.state))return `quotes[${i}] 必须包含唯一代码、名称、币种、报价时点与交易状态`
   if(seen.has(r.symbol))return 'quotes.symbol 不能重复';seen.add(r.symbol)
   const issue=nullableNumbers(r,['price','dayChangePercent','weekChangePercent','monthChangePercent','yearChangePercent','pe','marketCap','volume'],['price','marketCap','volume']);if(issue)return `quotes[${i}].${issue}`
  }
  if(s.following!==undefined&&(!Array.isArray(s.following)||s.following.some(v=>!seen.has(v))||new Set(s.following).size!==s.following.length))return 'following 必须是已取得quotes中不重复代码的子集'
 }
 return null
}
export function inverseCurrencyPair(r){
 const inverse=v=>v===null?null:1/v,change=v=>v===null?null:-v/(1+v/100)
 return {...r,base:r.quote,quote:r.base,rate:inverse(r.rate),high52:inverse(r.low52),low52:inverse(r.high52),dayChangePercent:change(r.dayChangePercent),weekChangePercent:change(r.weekChangePercent),month3ChangePercent:change(r.month3ChangePercent),month6ChangePercent:change(r.month6ChangePercent)}
}
function overviewRuntime(){
 const root=document.querySelector('.snapshot-overview'),selector=root?.querySelector('select')
 selector?.addEventListener('change',()=>root.querySelectorAll('[data-index-market]').forEach(el=>el.hidden=selector.value!==''&&el.dataset.indexMarket!==selector.value))
 root?.querySelectorAll('[data-index-spark]').forEach(svg=>{
  const observations=JSON.parse(svg.dataset.observations),output=svg.parentElement.querySelector('[data-index-readout]'),marker=svg.querySelector('line');let selected=observations.labels.length-1
  const show=i=>{selected=Math.max(0,Math.min(observations.labels.length-1,i));const x=5+140*selected/(observations.labels.length-1);marker.setAttribute('x1',x);marker.setAttribute('x2',x);output.textContent=observations.labels[selected]+' · '+(observations.values[selected]===null?'未提供':observations.values[selected]+' '+svg.dataset.unit);svg.setAttribute('aria-label',output.textContent+'；左右方向键查看历史')}
  svg.addEventListener('pointermove',e=>{const r=svg.getBoundingClientRect();if(r.width)show(Math.round(((e.clientX-r.left)/r.width*150-5)/140*(observations.labels.length-1)))})
  svg.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();show(e.key==='Home'?0:e.key==='End'?observations.labels.length-1:selected+(e.key==='ArrowLeft'?-1:1))}});show(selected)
 })
}
function currencyRuntime(){
 const root=document.querySelector('.snapshot-currency'),base=root.querySelector('[data-fx-base]'),quote=root.querySelector('[data-fx-quote]'),rows=[...root.querySelectorAll('[data-fx-pair]')],count=root.querySelector('[data-snapshot-count]'),readout=root.querySelector('[data-snapshot-readout]')
 const apply=()=>{rows.forEach(row=>row.hidden=base.value!==''&&row.dataset.base!==base.value||quote.value!==''&&row.dataset.quote!==quote.value);count.textContent=rows.filter(r=>!r.hidden).length+' 个货币对';root.querySelector('[data-snapshot-empty]').hidden=rows.some(r=>!r.hidden)}
 base.addEventListener('change',apply);quote.addEventListener('change',apply);apply()
 rows.forEach(row=>{const show=()=>{rows.forEach(r=>r.setAttribute('aria-selected',String(r===row)));readout.textContent=row.dataset.fxDetail};row.addEventListener('click',show);row.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();show()}})})
}
function watchlistRuntime(){
 const root=document.querySelector('.snapshot-watchlist'),rows=[...root.querySelectorAll('[data-watch-symbol]')],input=root.querySelector('[data-watch-search]'),manager=root.querySelector('[data-watch-manager]'),sortButtons=[...root.querySelectorAll('[data-watch-sort]')],checks=[...root.querySelectorAll('[data-watch-follow]')],count=root.querySelector('[data-snapshot-count]'),readout=root.querySelector('[data-snapshot-readout]');let sort='',descending=false,selected=''
 const save=()=>root.dataset.workbenchChartView=JSON.stringify({sort,descending,selected})
 const filtered=()=>{const q=input.value.trim().toLocaleLowerCase();for(const row of rows){const checked=checks.find(c=>c.dataset.watchFollow===row.dataset.watchSymbol);row.hidden=!checked.checked||!row.dataset.watchDetail.toLocaleLowerCase().includes(q)}count.textContent=rows.filter(r=>!r.hidden).length+' / '+checks.filter(c=>c.checked).length+' 个自选';root.querySelector('[data-snapshot-empty]').hidden=rows.some(r=>!r.hidden)}
 const select=symbol=>{selected=symbol;rows.forEach(r=>r.setAttribute('aria-selected',String(r.dataset.watchSymbol===selected)));readout.textContent=rows.find(r=>r.dataset.watchSymbol===selected)?.dataset.watchDetail??'';save()}
 const order=()=>{const sorted=[...rows].sort((a,b)=>{if(!sort)return Number(a.dataset.watchOrder)-Number(b.dataset.watchOrder);const av=a.dataset[sort],bv=b.dataset[sort];if(av==='')return bv===''?0:1;if(bv==='')return -1;const group=['price','marketCap'].includes(sort)?a.dataset.currency.localeCompare(b.dataset.currency):0;return group||(Number(av)-Number(bv))*(descending?-1:1)||Number(a.dataset.watchOrder)-Number(b.dataset.watchOrder)});sorted.forEach(r=>r.parentElement.appendChild(r));sortButtons.forEach(b=>{b.closest('th').setAttribute('aria-sort',b.dataset.watchSort!==sort?'none':descending?'descending':'ascending');b.dataset.active=String(b.dataset.watchSort===sort)});save()}
 manager.addEventListener('click',()=>{const panel=root.querySelector('[data-watch-picker]');panel.hidden=!panel.hidden;manager.setAttribute('aria-expanded',String(!panel.hidden))})
 input.addEventListener('input',filtered)
 checks.forEach(c=>{const change=()=>{c.dataset.workbenchChartView=JSON.stringify({following:c.checked});filtered()};c.addEventListener('change',change);c.addEventListener('sherlock-chart-restore',e=>{if(typeof e.detail?.following==='boolean'){c.checked=e.detail.following;change()}});change()})
 rows.forEach(r=>{r.addEventListener('click',()=>select(r.dataset.watchSymbol));r.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();select(r.dataset.watchSymbol)}})})
 sortButtons.forEach(b=>b.addEventListener('click',()=>{descending=sort===b.dataset.watchSort?!descending:true;sort=b.dataset.watchSort;order()}))
 root.addEventListener('sherlock-chart-restore',e=>{if(e.target!==root)return;const v=e.detail;if(!v||typeof v.descending!=='boolean'||typeof v.selected!=='string'||!['',...sortButtons.map(b=>b.dataset.watchSort)].includes(v.sort))return;sort=v.sort;descending=v.descending;order();select(v.selected)})
 order();filtered();select('')
}
const cell=(value,key,unit='',compact=false)=>{const shown=compact&&value!==null?value.toLocaleString('en-US',{notation:'compact',maximumFractionDigits:2}):number(value);return `<td title="${esc(number(value)+(value!==null&&unit?' '+unit:''))}" data-refresh-key="${esc(key)}" data-refresh-value="${esc(value)}">${shown}${value!==null&&unit?' '+esc(unit):''}</td>`}
const changeCell=(value,key)=>`<td title="${value===null?'未提供':esc(value)+'%'}" data-tone="${tone(value)}" data-refresh-key="${esc(key)}" data-refresh-value="${esc(value)}">${esc(signed(value))}</td>`
function sparkline(r){
 if(!r.sparkline)return `<p class="snapshot-missing">${esc(r.sparklineMissing)}</p>`
 const {labels,values}=r.sparkline,known=values.filter(finite),lo=Math.min(...known),hi=Math.max(...known);let pen=false
 const path=values.map((v,i)=>{if(v===null){pen=false;return ''}const point=(pen?'L':'M')+(5+140*i/(values.length-1)).toFixed(2)+','+(lo===hi?30:54-(v-lo)/(hi-lo)*48).toFixed(2);pen=true;return point}).join(' ')
 const dots=values.map((v,i)=>v===null?'':`<circle cx="${(5+140*i/(values.length-1)).toFixed(2)}" cy="${(lo===hi?30:54-(v-lo)/(hi-lo)*48).toFixed(2)}" r="1.3"/>`).join('')
 return `<svg viewBox="0 0 150 60" data-index-spark data-unit="${esc(r.unit)}" data-observations="${esc(encode({labels,values}))}" tabindex="0" role="img" aria-label="${esc(r.name)}历史走势"><path d="${path}"/>${dots}<line x1="145" x2="145" y1="4" y2="56"/></svg><p data-index-readout role="status"></p>`
}
export const FINANCIAL_SNAPSHOT_CSS=`
${FINANCIAL_SNAPSHOT_VARIANTS.map(v=>`body[data-sherlock-market="${v}"]`).join(',')}{display:flex;flex-direction:column;height:100vh!important;overflow:hidden!important}
body .snapshot-toolbar{--sherlock-control-secondary:var(--sherlock-control-bg);display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px;flex:none}
body .snapshot-toolbar input{flex:1 1 150px;min-width:80px}body .snapshot-toolbar label{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--sherlock-muted)}
body .snapshot-toolbar button{background:var(--sherlock-control-bg)!important;color:var(--sherlock-control-text)!important;border:1px solid var(--sherlock-control-border)!important;padding:2px 7px!important;min-height:26px!important}
body .snapshot-overview-strip{display:flex;align-items:flex-start;gap:0;overflow:auto;min-width:0;padding-bottom:3px}
body .snapshot-index{flex:0 0 160px;padding:0 5px;box-sizing:border-box;min-width:0}body .snapshot-index[hidden]{display:none}
body .snapshot-index h3{margin:0;font-size:12px!important;line-height:16px!important;font-weight:400;color:var(--sherlock-muted)}
body .snapshot-index strong{display:block;font-size:14px!important;line-height:22px!important;overflow-wrap:anywhere}
body .snapshot-index p{margin:2px 0;font-size:11px!important;line-height:16px!important;overflow-wrap:anywhere}
body .snapshot-index svg{display:block;width:150px;height:60px;max-width:100%}body .snapshot-index path{stroke:var(--sherlock-chart-1);fill:none;stroke-width:1.2;vector-effect:non-scaling-stroke}body .snapshot-index circle{fill:var(--sherlock-chart-1)}body .snapshot-index line{stroke:var(--sherlock-chart-crosshair);stroke-width:.7;stroke-dasharray:2 3}
body .snapshot-currency,body .snapshot-watchlist{display:flex;flex-direction:column;overflow:auto}
/* Keep a header and a complete quote readable even in a short manual resize.
   The surrounding content scrolls when its controls cannot fit above the table. */
body .snapshot-table-wrap{flex:1 0 120px;overflow:auto;min-height:120px;min-width:0;scrollbar-width:thin}
body .snapshot-wide-table{width:100%;min-width:1008px}body .snapshot-currency .snapshot-wide-table{min-width:1103px}
body .snapshot-wide-table :is(th,td){height:32px;vertical-align:middle;line-height:16px!important;padding:6px!important;text-align:right}
body .snapshot-wide-table th{position:sticky;top:0;z-index:1;background:var(--sherlock-control-bg);color:var(--sherlock-text)}
body .snapshot-wide-table th[aria-sort] button{width:100%;text-align:right;white-space:normal;overflow-wrap:anywhere}
body .snapshot-wide-table th[aria-sort]{--sherlock-control-secondary:transparent;--sherlock-control-text:var(--sherlock-text)}
body .snapshot-name strong{display:block;font-size:12px!important;line-height:14px!important}body .snapshot-name small{display:block;font-size:12px!important;line-height:14px!important;font-weight:400}
body .snapshot-name em{display:block;font-size:11px;line-height:16px;font-style:normal;color:var(--sherlock-muted)}
body [data-snapshot-readout],body .snapshot-missing{flex:none;font-size:11px!important;line-height:16px!important;margin:4px 0 0;color:var(--sherlock-muted);overflow-wrap:anywhere;max-height:64px;overflow:auto}
body [data-watch-picker]{flex:none;max-height:100px;overflow:auto;padding:5px 0;border-bottom:1px solid var(--sherlock-border);margin-bottom:6px}
body [data-watch-picker][hidden]{display:none}body [data-watch-picker] p{margin:0 0 4px;font-size:11px;color:var(--sherlock-muted)}body [data-watch-picker] label{display:inline-flex;align-items:center;gap:4px;margin-right:12px;line-height:24px}
body [data-watch-picker] input{width:14px;height:14px!important;min-height:14px!important;padding:0!important}
body .snapshot-share-table td:first-child{width:62%}body .snapshot-share-table td:last-child{text-align:right}body .snapshot-share-table small{display:block;font-size:11px;line-height:16px;color:var(--sherlock-muted)}
body .snapshot-wide-table tr[aria-selected="true"] :is(td,small,strong,em){color:var(--sherlock-text)!important}
`
export function renderFinancialSnapshot(s){
 if(financialSnapshotDataIssue(s))return null
 if(s.variant==='share-statistics')return {body:`<section class="financial-profile"><p class="financial-symbol">${esc(s.symbol)} · ${esc(s.period)}</p><table class="snapshot-share-table" aria-label="股本统计"><tbody>${[['自由流通比例','freeFloatPercent','%'],['流通股数','floatShares',s.shareUnit],['总股数','totalShares',s.shareUnit]].map(([label,key,unit])=>`<tr><td>${label}</td><td data-refresh-key="share:${esc(s.symbol)}:${key}" data-refresh-value="${esc(s[key])}">${number(s[key])}${s[key]===null?'':' '+esc(unit)}</td></tr>`).join('')}<tr><td>统计日期 / 口径</td><td>${esc(s.period)}</td></tr></tbody></table>${s.missing?`<p class="snapshot-missing">未提供：${esc(s.missing)}</p>`:''}</section>`,script:''}
 if(s.variant==='market-overview')return {body:`<section class="financial-profile snapshot-overview"><div class="snapshot-toolbar"><label>市场<select aria-label="筛选市场"><option value="">全部市场</option>${[...new Set(s.indices.map(r=>r.market))].map(v=>`<option>${esc(v)}</option>`).join('')}</select></label></div><div class="snapshot-overview-strip">${s.indices.map(r=>`<article class="snapshot-index" data-index-market="${esc(r.market)}"><h3>${esc(r.name)}</h3><strong data-refresh-key="index:${esc(r.symbol)}:price" data-refresh-value="${esc(r.price)}">${number(r.price)} ${esc(r.unit)}</strong><p data-tone="${tone(r.changePercent)}" data-refresh-key="index:${esc(r.symbol)}:change" data-refresh-value="${esc(r.changePercent)}">${esc(signed(r.changePercent))}</p>${sparkline(r)}<p>${esc(r.symbol)} · ${stateText[r.state]}</p><p>${esc(r.asOf)}</p>${r.missing?`<p class="snapshot-missing">${esc(r.missing)}</p>`:''}</article>`).join('')}</div></section>`,script:`(${overviewRuntime.toString()})();`}
 if(s.variant==='currency-snapshot'){
  const pairs=s.pairs.flatMap(r=>[r,inverseCurrencyPair(r)]),currencies=[...new Set(pairs.map(r=>r.base))]
  const columns=['基准货币','代码','最新价','较前收盘涨跌幅','52 周最高','52 周最低','1 周涨跌幅','3 月涨跌幅','6 月涨跌幅','报价时点']
  const rate=(v,key)=>{const shown=v===null?'—':Number(v.toFixed(s.precision))===0?'&lt;'+(10**-s.precision).toFixed(s.precision):v.toFixed(s.precision);return `<td title="${v===null?'未提供':esc(v)}" data-refresh-key="${esc(key)}" data-refresh-value="${esc(v)}">${shown}</td>`}
  return {body:`<section class="financial-profile snapshot-currency"><div class="snapshot-toolbar">${[['base','基准货币'],['quote','报价货币']].map(([key,label])=>`<label>${label}<select data-fx-${key} aria-label="${label}"><option value="">全部</option>${currencies.map(c=>`<option>${c}</option>`).join('')}</select></label>`).join('')}<span data-snapshot-count role="status"></span></div><p class="financial-symbol">1 单位基准货币 → 报价货币 · ${s.precision} 位小数 · 逆向值按同一来源快照换算</p><div class="snapshot-table-wrap"><table class="snapshot-wide-table" aria-label="外汇快照"><colgroup>${[220,95,95,123,95,95,95,95,95,95].map(w=>`<col style="width:${w}px">`).join('')}</colgroup><thead><tr>${columns.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${pairs.map(r=>{const id=r.base+'/'+r.quote,detail='1 '+r.base+' = '+(r.rate===null?'未提供':r.rate+' '+r.quote)+' · '+r.asOf+(r.missing?' · '+r.missing:'');return `<tr data-fx-pair="${id}" data-base="${r.base}" data-quote="${r.quote}" data-fx-detail="${esc(detail)}" tabindex="0" aria-selected="false"><td>${r.base}</td><td>${id}</td>${rate(r.rate,id+':rate')}${changeCell(r.dayChangePercent,id+':day')}${rate(r.high52,id+':high52')}${rate(r.low52,id+':low52')}${changeCell(r.weekChangePercent,id+':week')}${changeCell(r.month3ChangePercent,id+':month3')}${changeCell(r.month6ChangePercent,id+':month6')}<td title="${esc(r.asOf+(r.missing?' · '+r.missing:''))}">${esc(r.asOf)}</td></tr>`}).join('')}</tbody></table></div><p data-snapshot-empty hidden>该方向尚无已取得的报价</p><div data-snapshot-readout role="status"></div></section>`,script:`(${currencyRuntime.toString()})();`}
 }
 if(s.variant==='watchlist'){
  const following=s.following??s.quotes.map(r=>r.symbol),fields=[['price','最新价'],['dayChangePercent','今日涨跌'],['weekChangePercent','本周涨跌'],['monthChangePercent','本月涨跌'],['yearChangePercent','本年涨跌'],['pe','市盈率'],['marketCap','总市值'],['volume','今日成交量']]
  return {body:`<section class="financial-profile snapshot-watchlist" data-workbench-chart-view="{}" data-workbench-view-key="watchlist"><div class="snapshot-toolbar"><input type="search" data-watch-search aria-label="搜索自选股" placeholder="代码 / 名称 / 币种"><button type="button" data-watch-manager aria-expanded="false">管理自选</button><span data-snapshot-count role="status"></span></div><div data-watch-picker hidden><p>从已取得的行情记录添加或移除；新增数据来源请更新组件数据。</p>${s.quotes.map(r=>`<label><input type="checkbox" data-watch-follow="${esc(r.symbol)}" data-workbench-chart-view="{}" data-workbench-view-key="follow:${esc(r.symbol)}" ${following.includes(r.symbol)?'checked':''}>${esc(r.symbol)} · ${esc(r.name)}</label>`).join('')}</div><div class="snapshot-table-wrap"><table class="snapshot-wide-table" aria-label="自选股行情"><colgroup>${[220,95,95,102,109,102,95,95,95].map(w=>`<col style="width:${w}px">`).join('')}</colgroup><thead><tr><th>名称</th>${fields.map(([key,label])=>`<th aria-sort="none"><button type="button" data-watch-sort="${key}" aria-label="按${label}排序">${label}</button></th>`).join('')}</tr></thead><tbody>${s.quotes.map((r,n)=>{const detail=[r.symbol,r.name,r.currency,number(r.price),stateText[r.state],r.asOf,'今日 '+signed(r.dayChangePercent),'本周 '+signed(r.weekChangePercent),'本月 '+signed(r.monthChangePercent),'本年 '+signed(r.yearChangePercent),'市盈率 '+number(r.pe)+' 倍','总市值 '+number(r.marketCap)+' '+r.currency,'成交量 '+number(r.volume)+' 股',r.missing].filter(Boolean).join(' · ');return `<tr data-watch-symbol="${esc(r.symbol)}" data-watch-order="${n}" data-watch-detail="${esc(detail)}" data-currency="${r.currency}" ${fields.map(([key])=>`data-${key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${r[key]??''}"`).join(' ')} tabindex="0" aria-selected="false"><td class="snapshot-name"><strong>${esc(r.symbol)}</strong><small>${esc(r.name)}</small><em>${r.currency} · ${stateText[r.state]} · ${esc(r.asOf)}</em>${r.missing?`<em>${esc(r.missing)}</em>`:''}</td>${cell(r.price,r.symbol+':price',r.currency)}${changeCell(r.dayChangePercent,r.symbol+':day')}${changeCell(r.weekChangePercent,r.symbol+':week')}${changeCell(r.monthChangePercent,r.symbol+':month')}${changeCell(r.yearChangePercent,r.symbol+':year')}${cell(r.pe,r.symbol+':pe','倍')}${cell(r.marketCap,r.symbol+':cap',r.currency,true)}${cell(r.volume,r.symbol+':volume','股',true)}</tr>`}).join('')}</tbody></table></div><p data-snapshot-empty hidden>没有匹配的自选股；可在“管理自选”中添加已有记录</p><div data-snapshot-readout role="status"></div></section>`,script:`(${watchlistRuntime.toString()})();`}
 }
 return null
}
