import {openTerminalQuote} from './openterminal-layout.js'
// Figma 1917:341251 / 341348 / 345704. The model supplies observations;
// the host owns the quote summary, key/value rows and disclosure table.
import {FINANCIAL_CHARTING_FIELDS,financialChartingDataIssue,renderFinancialCharting,FINANCIAL_CHARTING_CSS} from './financial-charting.js'
import {FINANCIAL_RECORDS_VARIANTS,FINANCIAL_RECORDS_FIELDS,financialRecordsDataIssue,renderFinancialRecords,FINANCIAL_RECORDS_CSS} from './financial-records.js'
import {FINANCIAL_SNAPSHOT_VARIANTS,FINANCIAL_SNAPSHOT_FIELDS,financialSnapshotDataIssue,renderFinancialSnapshot,FINANCIAL_SNAPSHOT_CSS} from './financial-snapshot.js'
import {FINANCIAL_SERIES_VARIANTS,FINANCIAL_SERIES_FIELDS,financialSeriesDataIssue,renderFinancialSeries,FINANCIAL_SERIES_CSS} from './financial-series.js'
import {FINANCIAL_OWNERSHIP_VARIANTS,FINANCIAL_OWNERSHIP_FIELDS,financialOwnershipDataIssue,renderFinancialOwnership,FINANCIAL_OWNERSHIP_CSS} from './financial-ownership.js'
import {FINANCIAL_ACTION_VARIANTS,FINANCIAL_ACTION_FIELDS,financialActionDataIssue,renderFinancialActions,FINANCIAL_ACTION_CSS} from './financial-actions.js'
import {FINANCIAL_REVENUE_VARIANTS,FINANCIAL_REVENUE_FIELDS,financialRevenueDataIssue,renderFinancialRevenue,FINANCIAL_REVENUE_CSS} from './financial-revenue.js'
import {FINANCIAL_FUNDAMENTAL_VARIANTS,FINANCIAL_FUNDAMENTAL_FIELDS,financialFundamentalDataIssue,renderFinancialFundamental,FINANCIAL_FUNDAMENTAL_CSS} from './financial-fundamentals.js'
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=2000
const finite=v=>typeof v==='number'&&Number.isFinite(v)
const encode=v=>JSON.stringify(v).replace(/</g,'\\u003c')
export const FINANCIAL_PROFILE_VARIANTS=Object.freeze(['ticker-information','key-metrics','management-team',...FINANCIAL_SNAPSHOT_VARIANTS,...FINANCIAL_SERIES_VARIANTS,...FINANCIAL_FUNDAMENTAL_VARIANTS,...FINANCIAL_REVENUE_VARIANTS,...FINANCIAL_ACTION_VARIANTS,...FINANCIAL_OWNERSHIP_VARIANTS,...FINANCIAL_RECORDS_VARIANTS,'charting'])
export const FINANCIAL_PROFILE_FIELDS=Object.freeze({
 ...FINANCIAL_SNAPSHOT_FIELDS,
 ...FINANCIAL_SERIES_FIELDS,
 ...FINANCIAL_FUNDAMENTAL_FIELDS,
 ...FINANCIAL_REVENUE_FIELDS,
 ...FINANCIAL_ACTION_FIELDS,
 ...FINANCIAL_OWNERSHIP_FIELDS,
 ...FINANCIAL_RECORDS_FIELDS,
 charting:FINANCIAL_CHARTING_FIELDS,
 'ticker-information':'"symbol":"证券代码","name":"名称","price":数字或null,"priceUnit":"币种/单位","dayChange":数字或null,"dayChangePercent":百分数数字或null,"info":[{"label":"成交量/行业/国家/市场等","value":"保留单位的来源值"}]；可选 sparkline:{labels:[时点],values:[数字或null]}，2–366个等长时点，缺失保留null、不能补0；没有走势图时用sparklineMissing说明。任一报价字段为null时必须提供missing说明，宿主不从历史序列猜当前报价',
 'key-metrics':'"symbol":"证券代码","items":[{"label":"指标","value":"保留单位的值"或null,"period":"该指标的统计/披露周期","detail":"可选计算口径","missing":"value为null时必填的缺失原因"}]；1–40项，不把估值、成交量、股本等不同单位混成同一序列，不编造缺失值',
 'management-team':'"symbol":"证券代码","period":"报酬披露周期","members":[{"name":"姓名","role":"完整职位","compensation":非负数字或null,"currency":"币种"或null,"period":"可选该成员不同披露周期","missing":"报酬为null时必填的缺失原因"}]；1–100人，金额按原币种原单位，不能合计不同币种或把未披露填成0；可选compensationBasis说明税前/总报酬等口径'
})

export function financialProfileDataIssue(s){
 if(!FINANCIAL_PROFILE_VARIANTS.includes(s?.variant))return null
 if(s.variant==='charting')return financialChartingDataIssue(s)
 if(FINANCIAL_SNAPSHOT_VARIANTS.includes(s.variant))return financialSnapshotDataIssue(s)
 if(FINANCIAL_SERIES_VARIANTS.includes(s.variant))return financialSeriesDataIssue(s)
 if(FINANCIAL_FUNDAMENTAL_VARIANTS.includes(s.variant))return financialFundamentalDataIssue(s)
 if(FINANCIAL_REVENUE_VARIANTS.includes(s.variant))return financialRevenueDataIssue(s)
 if(FINANCIAL_ACTION_VARIANTS.includes(s.variant))return financialActionDataIssue(s)
 if(FINANCIAL_OWNERSHIP_VARIANTS.includes(s.variant))return financialOwnershipDataIssue(s)
 if(FINANCIAL_RECORDS_VARIANTS.includes(s.variant))return financialRecordsDataIssue(s)
 if(!text(s.symbol))return 'symbol 必须提供证券代码'
 if(s.variant==='ticker-information'){
  if(!text(s.name)||!text(s.priceUnit))return 'name/priceUnit 必须提供名称及价格单位'
  for(const k of ['price','dayChange','dayChangePercent'])if(s[k]!==null&&!finite(s[k]))return `${k} 必须是来源数字或null，不能省略`
  if(s.missing!==undefined&&!text(s.missing))return 'missing 必须是非空缺失说明'
  if(s.sparklineMissing!==undefined&&!text(s.sparklineMissing))return 'sparklineMissing 必须是非空说明'
  if(s.price!==null&&s.price<0)return 'price 不能为负数'
  if(['price','dayChange','dayChangePercent'].some(k=>s[k]===null)&&!text(s.missing))return 'missing 必须解释缺失报价，不能用0代替'
  if(s.dayChange&&s.dayChangePercent&&Math.sign(s.dayChange)!==Math.sign(s.dayChangePercent))return 'dayChange 与 dayChangePercent 的涨跌方向不一致'
  if(!Array.isArray(s.info)||s.info.length>12||s.info.some(i=>!text(i?.label)||!text(i?.value)))return 'info 必须是最多12项有标签与单位值的数组'
  if(s.sparkline!==undefined){
   const p=s.sparkline
   if(!Array.isArray(p?.labels)||p.labels.length<2||p.labels.length>366||!p.labels.every(text)||!Array.isArray(p.values)||p.values.length!==p.labels.length||p.values.some(v=>v!==null&&!finite(v)))return 'sparkline.labels/values 必须包含2–366个等长时点，values为数字或null'
   if(!p.values.some(finite))return 'sparkline 不能全为空；改用sparklineMissing说明缺失原因'
  }else if(!text(s.sparklineMissing))return '没有历史序列时必须提供sparklineMissing，不能绘制示意走势'
 }
 if(s.variant==='key-metrics'){
  if(!Array.isArray(s.items)||!s.items.length||s.items.length>40)return 'items 必须包含1–40项'
  for(const [i,item]of s.items.entries()){
   if(!text(item?.label)||!text(item.period)||item.value!==null&&!text(item.value))return `items[${i}] 必须包含label、带单位value（或null）及period`
   if(item.value===null&&!text(item.missing))return `items[${i}].missing 必须解释缺失值`
   if(item.detail!==undefined&&!text(item.detail))return `items[${i}].detail 必须是非空口径说明`
  }
 }
 if(s.variant==='management-team'){
  if(!text(s.period))return 'period 必须提供报酬披露周期'
  if(!Array.isArray(s.members)||!s.members.length||s.members.length>100)return 'members 必须包含1–100人'
  for(const [i,m]of s.members.entries()){
   if(!text(m?.name)||!text(m.role))return `members[${i}] 必须包含姓名与完整职位`
   if(m.compensation!==null&&(!finite(m.compensation)||m.compensation<0))return `members[${i}].compensation 必须是非负数字或null`
   if(m.compensation===null&&!text(m.missing))return `members[${i}].missing 必须解释报酬缺失原因`
   if(m.currency!==null&&!text(m.currency)||m.compensation!==null&&!text(m.currency))return `members[${i}].currency 必须保留金额币种；没有报酬时可以为null`
   if(m.period!==undefined&&!text(m.period))return `members[${i}].period 必须是非空披露周期`
  }
  if(s.compensationBasis!==undefined&&!text(s.compensationBasis))return 'compensationBasis 必须是非空报酬口径'
 }
 return null
}

function financialRowsRuntime(){
 const root=document.querySelector('.financial-profile'),input=root?.querySelector('[data-financial-search]'),rows=[...(root?.querySelectorAll('[data-financial-row]')??[])],count=root?.querySelector('[data-financial-count]'),readout=root?.querySelector('[data-financial-readout]'),sort=root?.querySelector('[data-compensation-sort]')
 if(!root||!input||!count||!readout)return
 const select=row=>{rows.forEach(r=>r.setAttribute('aria-selected',String(r===row)));readout.textContent=row.dataset.financialRow}
 rows.forEach(row=>{row.addEventListener('click',()=>select(row));row.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(row)}})})
 const filter=()=>{const q=input.value.trim().toLocaleLowerCase();rows.forEach(row=>row.hidden=!row.dataset.financialRow.toLocaleLowerCase().includes(q));count.textContent=rows.filter(row=>!row.hidden).length+' / '+rows.length+' '+root.dataset.financialUnit;root.querySelector('[data-financial-empty]').hidden=rows.some(row=>!row.hidden);const selected=rows.find(row=>row.getAttribute('aria-selected')==='true');if(selected?.hidden){selected.setAttribute('aria-selected','false');readout.textContent=''}}
 input.addEventListener('input',filter);filter()
 sort?.addEventListener('click',()=>{const descending=sort.dataset.direction!=='descending';sort.dataset.direction=descending?'descending':'ascending';sort.closest('th').setAttribute('aria-sort',sort.dataset.direction);sort.textContent='报酬';const parent=rows[0].parentElement;[...rows].sort((a,b)=>{const av=a.dataset.compensation,bv=b.dataset.compensation;if(av==='')return bv===''?0:1;if(bv==='')return -1;const currency=a.dataset.currency.localeCompare(b.dataset.currency);return currency||(Number(av)-Number(bv))*(descending?-1:1)}).forEach(row=>parent.appendChild(row))})
}
function tickerRuntime(labels,values){
 const svg=document.querySelector('[data-ticker-spark]'),readout=document.querySelector('[data-ticker-readout]'),marker=svg?.querySelector('[data-ticker-marker]')
 if(!svg||!readout||!marker)return
 let selected=labels.length-1
 const show=i=>{selected=Math.max(0,Math.min(labels.length-1,i));const x=8+184*selected/(labels.length-1);marker.setAttribute('x1',String(x));marker.setAttribute('x2',String(x));readout.textContent=labels[selected]+' · '+(values[selected]===null?'未提供':values[selected]+' '+svg.dataset.unit);svg.setAttribute('aria-label',readout.textContent+'；左右方向键查看历史报价')}
 svg.addEventListener('pointermove',event=>{const rect=svg.getBoundingClientRect();if(rect.width)show(Math.round(((event.clientX-rect.left)/rect.width*200-8)/184*(labels.length-1)))})
 svg.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();show(event.key==='Home'?0:event.key==='End'?labels.length-1:selected+(event.key==='ArrowLeft'?-1:1))}});show(selected)
}
export const FINANCIAL_PROFILE_CSS=`
body[data-sherlock-market="ticker-information"],body[data-sherlock-market="key-metrics"],body[data-sherlock-market="management-team"]{display:flex;flex-direction:column;height:100vh!important;overflow:hidden!important}
body .financial-profile{flex:1 1 auto;min-height:0;min-width:0;overflow:auto;scrollbar-width:thin}
body .financial-symbol{color:var(--sherlock-muted);font-size:11px;line-height:16px;margin:0 0 4px;overflow-wrap:anywhere}
body .financial-profile+footer{flex:0 1 auto;min-height:17px;max-height:30%;overflow:auto;font-size:11px!important;line-height:16px!important;margin:5px 0 0!important}
body .financial-profile+footer>span{flex:1 1 100%;min-width:0;overflow-wrap:anywhere}
body .financial-toolbar{display:flex;align-items:center;gap:8px;margin:0 0 6px;flex-wrap:wrap}
body .financial-toolbar input{flex:1 1 130px;min-width:80px;height:24px!important}
body .financial-toolbar>span{font-size:11px;color:var(--sherlock-muted)}
body .financial-profile table{table-layout:fixed;border-collapse:collapse;border-radius:0!important;border:0!important}
body .financial-profile :is(th,td){height:32px;padding:6px;white-space:normal!important;overflow-wrap:anywhere;vertical-align:top;font-size:12px!important;line-height:18px!important;color:var(--sherlock-text)}
body .financial-profile :is(th,td):first-child{text-align:left;color:var(--sherlock-text)}
body .financial-profile th{vertical-align:middle}
body .financial-profile th button{background:transparent!important;border:0!important;color:inherit!important;padding:0!important;min-height:0!important}
body .financial-profile tr[aria-selected="true"]{background:var(--sherlock-row-selected)!important;outline:0}
body .financial-profile tr[hidden]{display:none}
body .financial-profile tr:focus-visible{outline:1px solid var(--sherlock-control-primary);outline-offset:-1px}
body .financial-key-table td:first-child{width:62%;color:var(--sherlock-muted)}
body .financial-key-table td:last-child{text-align:right}
body .financial-key-table small{display:block;font-size:11px!important;line-height:16px;color:var(--sherlock-muted);margin-top:1px}
body [data-financial-readout]{font-size:11px;line-height:16px;color:var(--sherlock-muted);margin-top:4px;overflow-wrap:anywhere}
body .financial-management-table{min-width:540px}body .financial-management-table small{display:block;color:var(--sherlock-muted);font-size:11px!important;line-height:16px}
body .financial-management-table td:nth-child(2){text-align:left}
body .financial-management-table td:nth-child(n+3){text-align:right;font-variant-numeric:tabular-nums}
body .ticker-summary{display:grid;grid-template-columns:minmax(150px,200px) minmax(0,1fr);gap:18px;align-items:center}
body .ticker-spark{min-width:0}
body .ticker-spark svg{display:block;width:100%;height:80px;max-height:80px}
body .ticker-spark path{fill:none;stroke:var(--sherlock-chart-1);stroke-width:1.5;vector-effect:non-scaling-stroke}
body .ticker-spark circle{fill:var(--sherlock-chart-1);stroke:none}
body .ticker-spark line{stroke:var(--sherlock-chart-crosshair);stroke-width:.7;stroke-dasharray:2 3}
body .ticker-spark p{font-size:11px;line-height:16px;margin:1px 0;color:var(--sherlock-muted);overflow-wrap:anywhere}
body .ticker-quotes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 20px;margin:0}
body .ticker-quotes dt{font-size:12px;line-height:16px;color:var(--sherlock-muted)}
body .ticker-quotes dd{margin:0;font-size:14px;line-height:20px;font-weight:600;overflow-wrap:anywhere}
body .ticker-info{display:flex;gap:4px 16px;flex-wrap:wrap;margin:6px 0 0;padding:0;list-style:none;font-size:12px;line-height:18px}
body .ticker-info li{overflow-wrap:anywhere;max-width:100%}
body .ticker-info span{color:var(--sherlock-muted)}
body .ticker-missing{font-size:11px;line-height:16px;color:var(--sherlock-muted);margin:4px 0 0}
body .ticker-history table{min-width:0}
@media(max-width:600px){body .ticker-summary{grid-template-columns:1fr;gap:6px}body .ticker-spark{max-width:260px;width:100%}body .ticker-spark svg{height:64px}body .ticker-quotes{gap:4px 12px}}
`+FINANCIAL_SNAPSHOT_CSS+FINANCIAL_SERIES_CSS+FINANCIAL_FUNDAMENTAL_CSS+FINANCIAL_REVENUE_CSS+FINANCIAL_ACTION_CSS+FINANCIAL_OWNERSHIP_CSS+FINANCIAL_RECORDS_CSS+FINANCIAL_CHARTING_CSS
export function renderFinancialProfile(s){
 if(s.variant==='charting')return renderFinancialCharting(s)
 if(financialProfileDataIssue(s))return null
 if(FINANCIAL_SNAPSHOT_VARIANTS.includes(s.variant))return renderFinancialSnapshot(s)
 if(FINANCIAL_SERIES_VARIANTS.includes(s.variant))return renderFinancialSeries(s)
 if(FINANCIAL_FUNDAMENTAL_VARIANTS.includes(s.variant))return renderFinancialFundamental(s)
 if(FINANCIAL_REVENUE_VARIANTS.includes(s.variant))return renderFinancialRevenue(s)
 if(FINANCIAL_ACTION_VARIANTS.includes(s.variant))return renderFinancialActions(s)
 if(FINANCIAL_OWNERSHIP_VARIANTS.includes(s.variant))return renderFinancialOwnership(s)
 if(FINANCIAL_RECORDS_VARIANTS.includes(s.variant))return renderFinancialRecords(s)
 if(s.variant==='ticker-information'){
  const signed=v=>v===null?'—':(v>0?'+':'')+String(v)
  const direction=s.dayChangePercent??s.dayChange
  let spark=`<p class="ticker-missing">${esc(s.sparklineMissing)}</p>`,script=''
  if(s.sparkline){
   const {labels,values}=s.sparkline,known=values.filter(finite),lo=Math.min(...known),hi=Math.max(...known),range=hi-lo||Math.max(1,Math.abs(hi)*.02)
   const dots=values.map((v,i)=>v===null?'':`<circle cx="${(8+184*i/(values.length-1)).toFixed(2)}" cy="${(hi===lo?40:68-(v-lo)/range*56).toFixed(2)}" r="1.8"/>`).join('')
   let pen=false;const path=values.map((v,i)=>{if(v===null){pen=false;return ''}const p=(pen?'L':'M')+(8+184*i/(values.length-1)).toFixed(2)+','+(hi===lo?40:68-(v-lo)/range*56).toFixed(2);pen=true;return p}).join(' ')
   spark=`<svg data-ticker-spark data-unit="${esc(s.priceUnit)}" viewBox="0 0 200 80" role="img" tabindex="0" aria-label="历史报价"><path d="${path}"/>${dots}<line data-ticker-marker x1="192" x2="192" y1="8" y2="72"/></svg><p data-ticker-readout role="status"></p><details class="ticker-history"><summary>完整历史报价</summary><table><thead><tr><th>时点</th><th>价格 / ${esc(s.priceUnit)}</th></tr></thead><tbody>${labels.map((label,i)=>`<tr><td>${esc(label)}</td><td>${values[i]===null?'—':esc(values[i])}</td></tr>`).join('')}</tbody></table></details>`
   script=`(${tickerRuntime.toString()})(${encode(labels)},${encode(values)});`
  }
  if(s.layoutProfile==='openterminal')return {body:openTerminalQuote(s,spark),script}
  return {body:`<section class="financial-profile"><p class="financial-symbol">${esc(s.symbol)} · ${esc(s.name)}</p><div class="ticker-summary"><div class="ticker-spark">${spark}</div><div><dl class="ticker-quotes"><div><dt>价格</dt><dd data-refresh-key="ticker:price" data-refresh-value="${esc(s.price)}">${s.price===null?'—':esc(s.price)} ${esc(s.priceUnit)}</dd></div><div><dt>当日涨跌</dt><dd data-tone="${direction===null||direction===0?'neutral':direction>0?'positive':'negative'}" data-refresh-key="ticker:change" data-refresh-value="${esc(s.dayChangePercent)}">${signed(s.dayChange)}${s.dayChange===null?'':' '+esc(s.priceUnit)} (${signed(s.dayChangePercent)}${s.dayChangePercent===null?'':'%'})</dd></div></dl><ul class="ticker-info">${s.info.map(i=>`<li><span>${esc(i.label)}：</span>${esc(i.value)}</li>`).join('')}</ul>${s.missing?`<p class="ticker-missing">${esc(s.missing)}</p>`:''}</div></div></section>`,script}
 }
 if(s.variant==='key-metrics')return {body:`<section class="financial-profile" data-financial-unit="项"><div class="financial-toolbar"><input type="search" data-financial-search aria-label="搜索核心指标" placeholder="指标 / 周期 / 口径"><span data-financial-count role="status"></span></div><p class="financial-symbol">${esc(s.symbol)} · 各指标周期分别标注</p><table class="financial-key-table" aria-label="核心指标"><tbody>${s.items.map((i,n)=>`<tr data-financial-row="${esc(i.label+' · '+(i.value??'未提供')+' · '+i.period+' · '+[i.detail,i.missing].filter(Boolean).join(' · '))}" tabindex="0" aria-selected="false"><td>${esc(i.label)}<small>${esc(i.period)}</small></td><td data-refresh-key="key:${n}:${esc(i.label)}" data-refresh-value="${esc(i.value)}">${i.value===null?'—':esc(i.value)}${i.value===null?`<small>${esc(i.missing)}</small>`:''}</td></tr>`).join('')}</tbody></table><p data-financial-empty hidden>没有匹配的指标</p><div data-financial-readout role="status"></div></section>`,script:`(${financialRowsRuntime.toString()})();`}
 if(s.variant==='management-team')return {body:`<section class="financial-profile" data-financial-unit="人"><div class="financial-toolbar"><input type="search" data-financial-search aria-label="搜索管理团队" placeholder="姓名 / 职位 / 币种"><span data-financial-count role="status"></span></div><p class="financial-symbol">${esc(s.symbol)} · 报酬披露：${esc(s.period)}${s.compensationBasis?' · '+esc(s.compensationBasis):''} · 金额为原币种</p><table class="financial-management-table" aria-label="管理团队报酬披露"><colgroup><col style="width:32%"><col style="width:22%"><col style="width:24%"><col style="width:22%"></colgroup><thead><tr><th>姓名</th><th>职位</th><th aria-sort="none"><button type="button" data-compensation-sort aria-label="按币种分组、原币种报酬排序">报酬</button></th><th>币种</th></tr></thead><tbody>${s.members.map(m=>`<tr data-financial-row="${esc(m.name+' · '+m.role+' · '+(m.compensation===null?'未提供：'+m.missing:m.compensation+' '+m.currency)+' · '+(m.period??s.period))}" data-compensation="${m.compensation??''}" data-currency="${esc(m.currency??'')}" tabindex="0" aria-selected="false"><td>${esc(m.name)}</td><td>${esc(m.role)}</td><td data-refresh-key="member:${esc(m.name+':'+m.role+':'+(m.period??s.period))}:compensation" data-refresh-value="${esc(m.compensation)}">${m.compensation===null?'—':m.compensation.toLocaleString('en-US',{maximumFractionDigits:20})}${m.compensation===null?`<small>${esc(m.missing)}</small>`:''}${m.period?`<small>${esc(m.period)}</small>`:''}</td><td>${esc(m.currency??'—')}</td></tr>`).join('')}</tbody></table><p data-financial-empty hidden>没有匹配的成员</p><div data-financial-readout role="status"></div></section>`,script:`(${financialRowsRuntime.toString()})();`}
 return null
}
