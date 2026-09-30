// Figma company profile 1917:345616 and financial statements 1917:346128.
// The host owns structure; observations retain their disclosure and units.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const text=(v,max=2000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max
const finite=v=>typeof v==='number'&&Number.isFinite(v)
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v
const url=v=>{try{const p=new URL(v);return ['http:','https:'].includes(p.protocol)&&!p.username&&!p.password}catch{return false}}
const encode=v=>JSON.stringify(v).replace(/</g,'\\u003c')
const statements={income:'利润表',balance:'资产负债表',cashflow:'现金流量表'}
const companyFields={address:'地址',phone:'电话',website:'网站',sector:'板块',industry:'行业',employeeCount:'全职员工',exchange:'交易所',ipoDate:'上市日期'}
export const FINANCIAL_FUNDAMENTAL_VARIANTS=Object.freeze(['company-profile','financial-statements'])
export const FINANCIAL_FUNDAMENTAL_FIELDS=Object.freeze({
 'company-profile':'"companies":[{"symbol":"代码","name":"公司全名","period":"资料披露日期/口径","address":"原地址"或null,"phone":"原电话"或null,"website":"已核验http(s)网址"或null,"sector":"板块"或null,"industry":"行业"或null,"employeeCount":非负整数或null,"exchange":"交易所"或null,"ipoDate":"YYYY-MM-DD"或null,"registrations":[{"label":"CIK/ISIN等","value":"原登记值"}],"description":["简介完整段落"],"missing":{"缺失字段名":"原因"}}]；1–20家，各代码唯一；所有身份字段明确给值或null，null必须在missing解释；登记和简介可为空，但须registrationsMissing/descriptionMissing说明，不复制设计稿苹果示例，也不猜员工数与联系方式',
 'financial-statements':'"datasets":[{"symbol":"代码","name":"公司名","periodType":"annual/quarterly","statement":"income/balance/cashflow","currency":"CNY等3位币种","unit":"百万元等原金额单位","basis":"合并/母公司及原会计口径","periods":[{"label":"财年/季度","endDate":"YYYY-MM-DD","disclosedAt":"YYYY-MM-DD"}],"rows":[{"id":"唯一科目id","label":"原科目名","values":[来源数字或null],"unit":"可选不同的单位如%/倍","parentId":"可选前面已提供的父科目id","missing":"有null时必填原因"}]}]；1–12组已取得组合，每组1–12个期间、1–100个科目，values与periods等长；期间标签唯一，截止日严格递增，披露日不早于截止日；科目不得自造或自动求和，缺失不补0，负数保留；比例和每股金额必须逐行标明原单位，不能按整表金额单位换算'
})
export const FINANCIAL_FUNDAMENTAL_GUIDANCE=' 公司资料用market.company-profile，财务报表用market.financial-statements；同次提交完整artifact，不能输出HTML或使用通用示例。'+FINANCIAL_FUNDAMENTAL_VARIANTS.map(v=>v+'：'+FINANCIAL_FUNDAMENTAL_FIELDS[v]).join('。')
export function inferFinancialFundamentalVariant(value=''){
 for(const [variant,pattern]of [['company-profile',/公司资料|公司简介|company[.-]profile/iu],['financial-statements',/财务报表|利润表|资产负债表|现金流量表|financial[.-]statements/iu]])if(pattern.test(value))return variant
}
export function financialFundamentalDataIssue(s){
 if(s?.variant==='company-profile'){
  if(!Array.isArray(s.companies)||!s.companies.length||s.companies.length>20)return 'companies 必须包含1–20家公司'
  const seen=new Set()
  for(const [i,r]of s.companies.entries()){
   if(!text(r?.symbol,80)||!text(r.name)||!text(r.period))return `companies[${i}] 必须包含代码、公司名称和资料披露周期`
   if(seen.has(r.symbol))return 'companies.symbol 不能重复';seen.add(r.symbol)
   for(const k of Object.keys(companyFields)){
    if(r[k]===null){if(!text(r.missing?.[k]))return `companies[${i}].missing.${k} 必须解释缺失原因`;continue}
    if(k==='employeeCount'?!Number.isSafeInteger(r[k])||r[k]<0:!text(r[k]))return `companies[${i}].${k} 必须是原始资料或明确null`
    if(k==='website'&&!url(r[k]))return `companies[${i}].website 必须是已核验的安全http(s)地址`
    if(k==='ipoDate'&&!date(r[k]))return `companies[${i}].ipoDate 必须是有效真实日期`
   }
   if(!Array.isArray(r.registrations)||r.registrations.length>12||r.registrations.some(v=>!text(v?.label)||!text(v.value)))return 'registrations 必须保留最多12项有标签的原登记值'
   if(!r.registrations.length&&!text(r.registrationsMissing))return 'registrationsMissing 必须解释登记信息缺失'
   if(!Array.isArray(r.description)||r.description.length>20||r.description.some(v=>!text(v,6000))||r.description.join('').length>20000)return 'description 必须是最多20个完整资料段落，总长不超过20000字符'
   if(!r.description.length&&!text(r.descriptionMissing))return 'descriptionMissing 必须解释简介缺失'
  }
 }
 if(s?.variant==='financial-statements'){
  if(!Array.isArray(s.datasets)||!s.datasets.length||s.datasets.length>12)return 'datasets 必须包含1–12组已取得报表'
  const seen=new Set()
  for(const [n,d]of s.datasets.entries()){
   if(!text(d?.symbol,80)||!text(d.name)||!['annual','quarterly'].includes(d.periodType)||!Object.hasOwn(statements,d.statement)||!text(d.unit)||!text(d.basis)||!(/^[A-Z]{3}$/).test(d.currency))return `datasets[${n}] 必须包含代码、名称、annual/quarterly周期、income/balance/cashflow报表、币种单位和会计口径`
   const key=d.symbol+':'+d.periodType+':'+d.statement;if(seen.has(key))return 'datasets 的代码、期间与报表组合不能重复';seen.add(key)
   if(!Array.isArray(d.periods)||!d.periods.length||d.periods.length>12)return 'periods 必须包含1–12个已披露期间'
   const labels=new Set();let last=''
   for(const p of d.periods){if(!text(p?.label,80)||labels.has(p.label)||!date(p.endDate)||!date(p.disclosedAt)||p.endDate<=last||p.disclosedAt<p.endDate)return 'periods 必须是标签唯一且截止日严格递增的有效期间，披露日不能早于截止日';labels.add(p.label);last=p.endDate}
   if(!Array.isArray(d.rows)||!d.rows.length||d.rows.length>100)return 'rows 必须包含1–100个原始科目'
   const ids=new Set()
   for(const [i,r]of d.rows.entries()){
    if(!text(r?.id,80)||ids.has(r.id)||!text(r.label)||!Array.isArray(r.values)||r.values.length!==d.periods.length||r.values.some(v=>v!==null&&!finite(v)))return `rows[${i}] 必须有唯一id、原科目名和与periods等长的来源数值/null`
    if(r.parentId!==undefined&&!ids.has(r.parentId))return `rows[${i}].parentId 只能引用前面已提供的父科目，不能循环或自引用`
    if(r.values.includes(null)&&!text(r.missing))return `rows[${i}].missing 必须解释缺失值`
    if(r.unit!==undefined&&!text(r.unit))return `rows[${i}].unit 必须是原单位`
    ids.add(r.id)
   }
  }
 }
 return null
}
function companyRuntime(){
 const root=document.querySelector('.company-profile'),select=root.querySelector('[data-company-select]')
 const apply=()=>{root.querySelectorAll('[data-company]').forEach(el=>el.hidden=el.dataset.company!==select.value);root.dataset.workbenchChartView=JSON.stringify({symbol:select.value})}
 select.addEventListener('change',apply);root.addEventListener('sherlock-chart-restore',e=>{if(e.target===root&&[...select.options].some(v=>v.value===e.detail?.symbol)){select.value=e.detail.symbol;apply()}});apply()
}
function statementRuntime(datasets,names){
 const root=document.querySelector('.financial-statements'),symbol=root.querySelector('[data-statement-symbol]'),period=root.querySelector('[data-statement-period]'),kind=root.querySelector('[data-statement-kind]'),meta=root.querySelector('[data-statement-meta]'),head=root.querySelector('thead tr'),body=root.querySelector('tbody'),readout=root.querySelector('[data-statement-readout]')
 let current=0,collapsed=new Set(),selected=null
 const saveView=()=>{const d=datasets[current];root.dataset.workbenchChartView=JSON.stringify({symbol:d.symbol,periodType:d.periodType,statement:d.statement,collapsed:[...collapsed],selected})}
 const options=(el,values,label)=>{const old=el.value;el.replaceChildren();for(const value of values){const o=document.createElement('option');o.value=value;o.textContent=label(value);el.appendChild(o)}if(values.includes(old))el.value=old}
 const setOptions=()=>{options(symbol,[...new Set(datasets.map(d=>d.symbol))],v=>{const d=datasets.find(r=>r.symbol===v);return v+' · '+d.name});const scoped=datasets.filter(d=>d.symbol===symbol.value);options(period,[...new Set(scoped.map(d=>d.periodType))],v=>v==='annual'?'财年':'季度');options(kind,[...new Set(scoped.filter(d=>d.periodType===period.value).map(d=>d.statement))],v=>names[v]);current=datasets.findIndex(d=>d.symbol===symbol.value&&d.periodType===period.value&&d.statement===kind.value)}
 const draw=()=>{
  const d=datasets[current],byId=new Map(d.rows.map(r=>[r.id,r])),number=v=>v===null?'未提供':v.toLocaleString('en-US',{maximumFractionDigits:20})
  meta.textContent=d.currency+' · 金额单位：'+d.unit+' · '+d.basis;head.replaceChildren();body.replaceChildren()
  const th=document.createElement('th');th.textContent='科目 / 单位';head.appendChild(th)
  for(const p of d.periods){const cell=document.createElement('th');cell.textContent=p.label;const small=document.createElement('small');small.textContent='截至 '+p.endDate+'\n披露 '+p.disclosedAt;cell.appendChild(small);head.appendChild(cell)}
  for(const r of d.rows){let ancestor=r.parentId,depth=0,hidden=false;while(ancestor){depth++;if(collapsed.has(ancestor))hidden=true;ancestor=byId.get(ancestor)?.parentId}const tr=document.createElement('tr');tr.hidden=hidden;tr.tabIndex=0;tr.setAttribute('aria-selected','false');tr.dataset.statementRow=r.id;const children=d.rows.some(v=>v.parentId===r.id),label=document.createElement('td');label.style.paddingLeft=(6+Math.min(depth,6)*12)+'px'
   if(children){const b=document.createElement('button');b.type='button';const icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(icon.namespaceURI,'path');icon.setAttribute('viewBox','0 0 12 12');icon.setAttribute('width','12');icon.setAttribute('height','12');icon.setAttribute('aria-hidden','true');icon.setAttribute('fill','none');path.setAttribute('d',collapsed.has(r.id)?'M4 2l4 4-4 4':'M2 4l4 4 4-4');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.5');path.setAttribute('stroke-linecap','round');path.setAttribute('fill','none');icon.appendChild(path);b.appendChild(icon);b.setAttribute('aria-label',(collapsed.has(r.id)?'展开':'折叠')+r.label);b.setAttribute('aria-expanded',String(!collapsed.has(r.id)));b.addEventListener('click',e=>{e.stopPropagation();collapsed.has(r.id)?collapsed.delete(r.id):collapsed.add(r.id);draw()});label.appendChild(b)}
   const name=document.createElement('span');name.textContent=r.label;label.appendChild(name);const unit=document.createElement('small');unit.textContent=r.unit??d.unit;label.appendChild(unit);tr.appendChild(label)
   for(const [i,value]of r.values.entries()){const cell=document.createElement('td');cell.textContent=number(value);cell.dataset.refreshKey=d.symbol+':'+d.periodType+':'+d.statement+':'+r.id+':'+d.periods[i].label;cell.dataset.refreshValue=String(value);if(value===null){const small=document.createElement('small');small.textContent=r.missing;cell.appendChild(small)}tr.appendChild(cell)}
   const select=()=>{selected=r.id;body.querySelectorAll('tr').forEach(v=>v.setAttribute('aria-selected',String(v===tr)));readout.textContent=r.label+' · '+(r.unit??d.unit)+' · '+d.periods.map((p,i)=>p.label+' '+number(r.values[i])).join(' · ')+(r.missing?' · '+r.missing:'');saveView()};tr.addEventListener('click',select);tr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select()}});body.appendChild(tr)
  }
  readout.textContent='';const active=[...body.children].find(r=>r.dataset.statementRow===selected&&!r.hidden);if(active)active.click();else selected=null;saveView()
 }
 for(const el of [symbol,period,kind])el.addEventListener('change',()=>{setOptions();collapsed=new Set();selected=null;draw()})
 root.addEventListener('sherlock-chart-restore',e=>{if(e.target!==root)return;const v=e.detail,index=datasets.findIndex(d=>d.symbol===v?.symbol&&d.periodType===v?.periodType&&d.statement===v?.statement);if(index<0||!Array.isArray(v.collapsed)||v.collapsed.length>100)return;symbol.value=v.symbol;setOptions();period.value=v.periodType;setOptions();kind.value=v.statement;setOptions();collapsed=new Set(v.collapsed.filter(id=>datasets[current].rows.some(r=>r.id===id)));selected=typeof v.selected==='string'?v.selected:null;draw()});setOptions();draw()
}
export const FINANCIAL_FUNDAMENTAL_CSS=`@layer ework-workbench{
${FINANCIAL_FUNDAMENTAL_VARIANTS.map(v=>`body[data-sherlock-market="${v}"]`).join(',')}{display:flex;flex-direction:column;height:100vh!important;overflow:hidden!important}
body .company-profile,body .financial-statements{display:flex;flex-direction:column;gap:6px;overflow:auto}
body .company-profile>*,body .financial-statements>*{flex:none;min-width:0}
body .financial-statements{--sherlock-control-secondary:var(--sherlock-control-bg)}
body .fundamental-controls{display:flex;gap:6px;align-items:center;flex-wrap:wrap;--sherlock-control-secondary:var(--sherlock-control-bg)}
body .fundamental-controls label{display:flex;gap:4px;align-items:center;font-size:11px;color:var(--sherlock-muted)}
body .company-profile [hidden],body .financial-statements [hidden]{display:none!important}
body .company-profile h3,body .company-profile h4{font-size:12px!important;line-height:18px!important;margin:0 0 4px;font-weight:600}
body .company-profile p,body .company-profile dl{font-size:12px!important;line-height:18px!important;margin:0 0 4px;overflow-wrap:anywhere}
body .company-profile dl{display:grid;grid-template-columns:minmax(72px,100px) minmax(0,1fr);gap:4px 8px}
body .company-profile dt{color:var(--sherlock-muted)}body .company-profile dd{margin:0;overflow-wrap:anywhere}
body .company-profile small{color:var(--sherlock-muted);font-size:11px!important;line-height:16px!important}
body .company-introduction{border-top:1px solid var(--sherlock-border);margin-top:6px;padding-top:6px;max-height:320px;overflow:auto;scrollbar-width:thin}
body .company-introduction p{margin-bottom:12px}
body .company-financial-table-wrap{max-height:360px;overflow:auto;scrollbar-width:thin;min-height:80px}
body .financial-statements table{min-width:600px;table-layout:auto!important}
body .financial-statements :is(th,td){height:32px!important;min-width:118px;padding:6px!important;line-height:16px!important;vertical-align:middle;text-align:right;white-space:nowrap!important}
body .financial-statements th{position:sticky;top:0;z-index:1;background:var(--sherlock-surface-muted);color:var(--sherlock-text)}
body .financial-statements :is(th,td):first-child{position:sticky;left:0;text-align:left;min-width:210px;max-width:300px;white-space:normal!important;overflow-wrap:anywhere;z-index:2}
body .financial-statements th:first-child{z-index:3}
body .financial-statements tr:nth-child(odd) td:first-child{background:var(--sherlock-surface-muted)!important}
body .financial-statements tr:nth-child(even) td:first-child{background:var(--sherlock-market-row-alternate)!important}
body .financial-statements tr[aria-selected=true] td{background:var(--sherlock-row-selected)!important;color:var(--sherlock-text)!important}
body .financial-statements tr[aria-selected=true] small{color:var(--sherlock-text)!important}
body .financial-statements tr:focus-visible{outline:1px solid var(--sherlock-control-primary);outline-offset:-1px}
body .financial-statements small{display:block;font-size:11px!important;line-height:16px!important;color:var(--sherlock-muted);white-space:pre-line}
body .financial-statements th small{font-size:10px!important;line-height:14px!important}
:root[data-workbench-style="enterprise"] body .financial-statements th small{color:inherit!important}
body .financial-statements td:first-child button{min-width:16px;margin-right:3px;color:var(--sherlock-control-text)!important;background:var(--sherlock-control-bg)!important;padding:0!important;border:0!important}
body [data-statement-readout],body [data-statement-meta]{font-size:11px!important;line-height:16px!important;color:var(--sherlock-muted);overflow-wrap:anywhere;margin:0}
}
`
export function renderFinancialFundamental(s){
 if(financialFundamentalDataIssue(s))return null
 if(s.variant==='company-profile'){
  const value=(r,k)=>r[k]===null?`未提供 <small>· ${esc(r.missing[k])}</small>`:k==='website'?`<a href="${esc(r[k])}" target="_blank" rel="noopener noreferrer">${esc(r[k])} ↗</a>`:k==='employeeCount'?r[k].toLocaleString('en-US')+' 人':esc(r[k])
  return {body:`<section class="financial-profile company-profile" data-workbench-chart-view="{}" data-workbench-view-key="company-profile"><div class="fundamental-controls"><label>公司<select data-company-select aria-label="选择公司资料">${s.companies.map(r=>`<option value="${esc(r.symbol)}">${esc(r.symbol+' · '+r.name)}</option>`).join('')}</select></label></div>${s.companies.map(r=>`<article data-company="${esc(r.symbol)}"><h3>${esc(r.name)}</h3><p><small>${esc(r.symbol+' · '+r.period)}</small></p><dl>${Object.entries(companyFields).map(([k,label])=>`<dt>${label}</dt><dd data-refresh-key="company:${esc(r.symbol)}:${k}" data-refresh-value="${esc(r[k])}">${value(r,k)}</dd>`).join('')}</dl><p>${r.registrations.length?r.registrations.map(v=>esc(v.label)+'：'+esc(v.value)).join(' · '):'登记信息未提供：'+esc(r.registrationsMissing)}</p><div class="company-introduction"><h4>公司简介</h4>${r.description.length?r.description.map(v=>`<p>${esc(v)}</p>`).join(''):`<p>未提供：${esc(r.descriptionMissing)}</p>`}</div></article>`).join('')}</section>`,script:`(${companyRuntime.toString()})();`}
 }
 if(s.variant==='financial-statements')return {body:'<section class="financial-profile financial-statements" data-workbench-chart-view="{}" data-workbench-view-key="financial-statements"><div class="fundamental-controls"><label>公司<select data-statement-symbol aria-label="报表公司"></select></label><label>期间<select data-statement-period aria-label="报表期间"></select></label><label>报表<select data-statement-kind aria-label="财务报表类型"></select></label></div><p data-statement-meta></p><div class="company-financial-table-wrap"><table aria-label="财务报表"><thead><tr></tr></thead><tbody></tbody></table></div><p data-statement-readout role="status"></p></section>',script:`(${statementRuntime.toString()})(${encode(s.datasets)},${encode(statements)});`}
 return null
}
