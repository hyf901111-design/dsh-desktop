// Latest Figma Dividend Payment 1917:348283 / Stock Splits 1917:348906.
// Event status and dates come from the source, never from the device clock.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const text=(v,max=2000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max
const finite=v=>typeof v==='number'&&Number.isFinite(v)
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v
const url=v=>{try{const p=new URL(v);return ['http:','https:'].includes(p.protocol)&&!p.username&&!p.password}catch{return false}}
const encode=v=>JSON.stringify(v).replace(/</g,'\\u003c')
export const FINANCIAL_ACTION_VARIANTS=Object.freeze(['dividends','stock-splits'])
export const FINANCIAL_ACTION_FIELDS=Object.freeze({
 dividends:'"period":"来源查询期间与范围","events":[{"id":"唯一来源事件id","symbol":"证券代码","name":"公司名称","exDate":"YYYY-MM-DD除息日","recordDate":"YYYY-MM-DD登记日"或null,"paymentDate":"YYYY-MM-DD支付日"或null,"declaredDate":"YYYY-MM-DD公告日"或null,"amount":非负每股原金额或null,"adjustedAmount":非负复权每股金额或null,"currency":"CNY等3位原币种","frequency":"原频率，如季度/特别分红","status":"paid/planned/cancelled","adjustmentBasis":"调整后金额的原复权口径或未提供说明","missing":"任何null字段的来源缺失说明","link":"可选已核验http(s)公告链接"}]；0–400条，空列表须emptyReason说明来源确认无记录；paid须有支付日，公告计划与已支付不混淆；0保留，不把未知日期和金额补0，不根据当前时间推断已支付，不混算币种',
 'stock-splits':'"period":"来源查询期间与范围","events":[{"id":"唯一来源事件id","symbol":"证券代码","name":"公司名称","date":"YYYY-MM-DD执行或计划日","from":正数拆分前股数或null,"to":正数拆分后股数或null,"announcedDate":"YYYY-MM-DD公告日"或null,"status":"executed/planned/cancelled","priceBasis":"关联价格序列的原复权口径或来源未提供说明","missing":"任何null字段的来源缺失说明","link":"可选已核验http(s)公告链接"}]；0–400条，空列表须emptyReason说明来源确认无记录；比例方向为from旧股对应to新股，保留原数值，拆股合股不倒置；执行状态由来源给出，不根据设备日期推断，不用比值自行复权行情'
})
export const FINANCIAL_ACTION_GUIDANCE=' 分红事件用market.dividends，拆股/合股记录用market.stock-splits；首次同次附完整来源artifact，不输出HTML。'+FINANCIAL_ACTION_VARIANTS.map(v=>v+'：'+FINANCIAL_ACTION_FIELDS[v]).join('。')
export function inferFinancialActionVariant(value=''){
 if(/分红记录|股息记录|分红事件|股息支付|dividends/iu.test(value))return 'dividends'
 if(/拆股|合股|stock[.-]splits/iu.test(value))return 'stock-splits'
}
export function financialActionDataIssue(s){
 if(!FINANCIAL_ACTION_VARIANTS.includes(s?.variant))return null
 if(!text(s.period)||!Array.isArray(s.events)||s.events.length>400)return 'period与events必须保留来源范围及0–400条事件'
 if(!s.events.length&&!text(s.emptyReason))return 'emptyReason必须说明来源确认无事件，不能把取数失败当无记录'
 const ids=new Set(),companies=new Map(),dividend=s.variant==='dividends'
 for(const [i,e]of s.events.entries()){
  if(!text(e?.id,120)||ids.has(e.id)||!text(e.symbol,80)||!text(e.name))return `events[${i}]必须包含唯一来源id、代码和公司名称`
  ids.add(e.id);if(companies.has(e.symbol)&&companies.get(e.symbol)!==e.name)return '同一证券代码的公司名称须一致';companies.set(e.symbol,e.name)
  if(!date(e[dividend?'exDate':'date']))return `events[${i}]必须有有效${dividend?'exDate除息日':'date执行/计划日'}`
  if(![dividend?'paid':'executed','planned','cancelled'].includes(e.status))return `events[${i}].status必须是来源确认的${dividend?'paid':'executed'}/planned/cancelled`
  const dates=dividend?['recordDate','paymentDate','declaredDate']:['announcedDate'],numbers=dividend?['amount','adjustedAmount']:['from','to']
  for(const k of dates)if(e[k]!==null&&!date(e[k]))return `events[${i}].${k}必须是有效日期或明确null`
  for(const k of numbers)if(e[k]!==null&&(!finite(e[k])||(dividend?e[k]<0:e[k]<=0)))return `events[${i}].${k}必须是${dividend?'非负原金额':'正数股数'}或明确null`
  if([...dates,...numbers].some(k=>e[k]===null)&&!text(e.missing))return `events[${i}].missing必须说明未知日期/金额/比例，不能补0`
  if(e.link!==undefined&&(!text(e.link)||!url(e.link)))return `events[${i}].link必须是已核验的安全http(s)公告地址`
  if(dividend){
   if(!/^[A-Z]{3}$/.test(e.currency)||!text(e.frequency)||!text(e.adjustmentBasis))return `events[${i}]必须保留原币种、频率及复权口径`
   if(e.status==='paid'&&e.paymentDate===null)return `events[${i}]标记已支付时必须有来源支付日`
  }else if(!text(e.priceBasis))return `events[${i}].priceBasis必须注明关联行情复权口径`
 }
 return null
}
function actionRuntime(){
 const root=document.querySelector('.corporate-actions'),company=root.querySelector('[data-action-company]'),status=root.querySelector('[data-action-status]'),start=root.querySelector('[data-action-from]'),end=root.querySelector('[data-action-to]'),search=root.querySelector('[data-action-search]'),reset=root.querySelector('[data-action-reset]'),count=root.querySelector('[data-action-count]'),empty=root.querySelector('[data-action-empty]'),readout=root.querySelector('[data-action-readout]'),sort=root.querySelector('[data-action-sort]'),rows=[...root.querySelectorAll('[data-action-id]')]
 let descending=true,selected=''
 const save=()=>root.dataset.workbenchChartView=JSON.stringify({company:company.value,status:status.value,start:start.value,end:end.value,search:search.value,descending,selected})
 const select=id=>{selected=id;rows.forEach(r=>r.setAttribute('aria-selected',String(r.dataset.actionId===id)));const row=rows.find(r=>r.dataset.actionId===id&&!r.hidden);readout.replaceChildren();if(row){const text=document.createElement('span');text.textContent=row.dataset.actionDetail;readout.appendChild(text);if(row.dataset.actionLink){const a=document.createElement('a');a.href=row.dataset.actionLink;a.textContent='原公告 ↗';a.target='_blank';a.rel='noopener noreferrer';readout.appendChild(a)}}save()}
 const apply=()=>{
  const invalid=start.value&&end.value&&start.value>end.value,q=search.value.trim().toLocaleLowerCase()
  for(const r of rows)r.hidden=Boolean(invalid||company.value&&r.dataset.actionSymbol!==company.value||status.value&&r.dataset.actionStatus!==status.value||start.value&&r.dataset.actionDate<start.value||end.value&&r.dataset.actionDate>end.value||q&&!r.dataset.actionDetail.toLocaleLowerCase().includes(q))
  const visible=rows.filter(r=>!r.hidden);count.textContent=visible.length+' / '+rows.length+' 条';empty.hidden=visible.length>0;empty.textContent=invalid?'开始日期不能晚于结束日期':rows.length?'没有符合条件的来源事件':root.dataset.emptyReason
  if(selected&&!visible.some(r=>r.dataset.actionId===selected))selected='';select(selected)
 }
 const order=()=>{[...rows].sort((a,b)=>a.dataset.actionDate.localeCompare(b.dataset.actionDate)*(descending?-1:1)||a.dataset.actionId.localeCompare(b.dataset.actionId)).forEach(r=>r.parentElement.appendChild(r));sort.closest('th').setAttribute('aria-sort',descending?'descending':'ascending');save()}
 for(const input of [company,status,start,end])input.addEventListener('change',apply);search.addEventListener('input',apply)
 reset.addEventListener('click',()=>{company.value=status.value=start.value=end.value=search.value='';selected='';descending=true;order();apply()});sort.addEventListener('click',()=>{descending=!descending;order()})
 rows.forEach(row=>{row.addEventListener('click',()=>select(row.dataset.actionId));row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(row.dataset.actionId)}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const visible=[...row.parentElement.children].filter(r=>!r.hidden),i=visible.indexOf(row),next=e.key==='Home'?0:e.key==='End'?visible.length-1:Math.max(0,Math.min(visible.length-1,i+(e.key==='ArrowDown'?1:-1)));visible[next]?.focus();select(visible[next]?.dataset.actionId??'')}})})
 root.addEventListener('sherlock-chart-restore',e=>{if(e.target!==root)return;const v=e.detail;if(!v||typeof v!=='object')return;for(const [el,key]of [[company,'company'],[status,'status']])if([...el.options].some(o=>o.value===v[key]))el.value=v[key];for(const [el,key]of [[start,'start'],[end,'end']])if(typeof v[key]==='string'&&/^(?:\d{4}-\d{2}-\d{2})?$/.test(v[key]))el.value=v[key];if(typeof v.search==='string'&&v.search.length<=2000)search.value=v.search;descending=v.descending!==false;selected=rows.some(r=>r.dataset.actionId===v.selected)?v.selected:'';order();apply()})
 order();apply()
}
export const FINANCIAL_ACTION_CSS=`@layer ework-workbench{
body:is([data-sherlock-market="dividends"],[data-sherlock-market="stock-splits"]){display:flex;flex-direction:column;height:100vh!important;overflow:hidden!important}
body .action-controls{display:flex;align-items:center;gap:5px;flex-wrap:wrap;--sherlock-control-secondary:var(--sherlock-control-bg)}
body .action-controls label{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--sherlock-muted)}
body .action-controls select{max-width:180px!important}
body .action-controls input[type=date]{width:125px!important;min-width:0!important}
body .action-controls input[type=search]{flex:1 1 120px;min-width:90px!important;max-width:240px}
body .action-controls button{font-size:11px!important;padding:3px 6px!important}
body .corporate-actions>*{flex:none;min-width:0}
body .corporate-actions{display:flex;flex-direction:column;gap:6px}
body .corporate-actions p{font-size:11px!important;line-height:16px!important;margin:0!important;color:var(--sherlock-muted);overflow-wrap:anywhere}
body .corporate-action-table-wrap{overflow:auto;max-height:320px;scrollbar-width:thin}
body .corporate-action-table-wrap table{table-layout:auto!important;min-width:465px}
body .corporate-action-table-wrap[data-action-dividends] table{min-width:870px}
body .corporate-action-table-wrap :is(th,td){height:32px!important;min-width:96px;padding:6px!important;line-height:18px!important;font-size:12px!important;white-space:nowrap!important}
body .corporate-action-table-wrap th{position:sticky;top:0;background:var(--sherlock-surface-muted);z-index:2}
body .corporate-action-table-wrap :is(th,td):first-child{position:sticky;left:0;min-width:130px;background:var(--sherlock-surface)!important;z-index:1}
body .corporate-action-table-wrap th:first-child{z-index:3;background:var(--sherlock-surface-muted)!important}
:root[data-workbench-style=enterprise] body .corporate-action-table-wrap th:first-child{background:var(--sherlock-table-heading)!important}
body .corporate-action-table-wrap tr[aria-selected=true] td{background:var(--sherlock-row-selected)!important;color:var(--sherlock-text)!important}
body [data-action-readout]{max-height:96px;overflow:auto;display:flex;align-items:flex-start;flex-wrap:wrap;gap:4px 10px;min-height:16px;font-size:11px!important;line-height:16px!important;overflow-wrap:anywhere}
body [data-action-readout] span{flex:1 1 100%;color:var(--sherlock-muted)}
body .corporate-actions [hidden]{display:none!important}
}`
export function renderFinancialActions(s){
 if(financialActionDataIssue(s))return null
 const div=s.variant==='dividends',statuses=div?{paid:'已支付',planned:'公告计划',cancelled:'已取消'}:{executed:'已执行',planned:'公告计划',cancelled:'已取消'},num=v=>v===null?'未提供':v.toLocaleString('en-US',{maximumFractionDigits:20}),value=v=>v??'未提供'
 const labels=div?['除息日','调整后每股金额','每股金额','登记日','支付日','公告日','状态']:['执行 / 计划日','拆股前股数','拆股后股数','状态'],companies=[...new Map(s.events.map(e=>[e.symbol,e.name]))]
 const records=s.events.map(e=>{
  const day=e[div?'exDate':'date'],kind=!div&&e.from!==null&&e.to!==null?(e.to>e.from?'拆股':e.to<e.from?'合股':'股数不变'):'比例未提供'
  const detail=e.symbol+' · '+e.name+' · '+statuses[e.status]+' · '+(div?`除息 ${e.exDate} · 登记 ${value(e.recordDate)} · 支付 ${value(e.paymentDate)} · 公告 ${value(e.declaredDate)} · 每股 ${num(e.amount)} ${e.currency} · 调整后每股 ${num(e.adjustedAmount)} ${e.currency} · 频率 ${e.frequency} · 复权 ${e.adjustmentBasis}`:`执行/计划 ${e.date} · 公告 ${value(e.announcedDate)} · ${num(e.from)}旧股对应${num(e.to)}新股 · ${kind} · 行情复权 ${e.priceBasis}`)+(e.missing?' · 缺失说明 '+e.missing:'')+(e.link?'':' · 原公告链接未提供')
  const cells=div?[day,num(e.adjustedAmount)+' '+e.currency,num(e.amount)+' '+e.currency,value(e.recordDate),value(e.paymentDate),value(e.declaredDate),statuses[e.status]]:[day,num(e.from),num(e.to),statuses[e.status]]
  return `<tr data-action-id="${esc(e.id)}" data-action-symbol="${esc(e.symbol)}" data-action-status="${e.status}" data-action-date="${day}" data-action-detail="${esc(detail)}"${e.link?` data-action-link="${esc(e.link)}"`:''} tabindex="0" aria-selected="false">${cells.map((c,i)=>`<td${div&&[1,2].includes(i)?` data-refresh-key="action:${esc(e.id)}:${i}" data-refresh-value="${esc(i===1?e.adjustedAmount:e.amount)}"`:!div&&[1,2].includes(i)?` data-refresh-key="action:${esc(e.id)}:${i}" data-refresh-value="${esc(i===1?e.from:e.to)}"`:''}>${esc(c)}</td>`).join('')}</tr>`
 }).join('')
 return {body:`<section class="financial-profile corporate-actions" data-workbench-chart-view="{}" data-workbench-view-key="corporate-action-controls" data-empty-reason="${esc(s.emptyReason)}"><div class="action-controls"><label>公司<select data-action-company aria-label="事件公司"><option value="">全部公司</option>${companies.map(([code,name])=>`<option value="${esc(code)}">${esc(code+' · '+name)}</option>`).join('')}</select></label><label>状态<select data-action-status aria-label="事件状态"><option value="">全部状态</option>${Object.entries(statuses).filter(([k])=>s.events.some(e=>e.status===k)).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>从<input type="date" data-action-from aria-label="开始日期"></label><label>至<input type="date" data-action-to aria-label="结束日期"></label><input type="search" data-action-search aria-label="搜索来源事件" placeholder="代码 / 公司 / 事件"><button type="button" data-action-reset>重置筛选</button><span data-action-count role="status"></span></div><p>${esc(s.period)} · ${div?'金额为来源原币种每股值，调整前后金额分列':'每from股旧股对应to股新股，拆股/合股按原方向保留'}；状态来自公告记录。</p><div class="snapshot-table-wrap corporate-action-table-wrap"${div?' data-action-dividends':''}><table aria-label="${div?'分红来源记录':'拆股合股来源记录'}"><thead><tr>${labels.map((v,i)=>`<th${i===0?' aria-sort="descending"':''}>${i===0?'<button type="button" data-action-sort aria-label="按事件日期排序">'+v+'</button>':v}</th>`).join('')}</tr></thead><tbody>${records}</tbody></table></div><p data-action-empty hidden></p><div data-action-readout role="status"></div></section>`,script:`(${actionRuntime.toString()})();`}
}
