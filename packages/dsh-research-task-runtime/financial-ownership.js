// Latest Figma 1917:349065 / 1917:350110. All comparisons are source values.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(v,max=2000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const number=v=>typeof v==='number'&&Number.isFinite(v);
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const safe=v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}};
const num=v=>v===null?'未提供':v.toLocaleString('en-US',{maximumFractionDigits:20});
const value=v=>v??'未提供';
const directions={buy:'买入',sell:'卖出',other:'其他交易'};
const changes={increase:'增持',decrease:'减持',unknown:'来源未说明'};
export const FINANCIAL_OWNERSHIP_VARIANTS=Object.freeze(['insider-trading','institutional-ownership']);
export const FINANCIAL_OWNERSHIP_FIELDS=Object.freeze({
 'insider-trading':'"period":"来源查询范围","sharesUnit":"股等原数量单位","transactions":[{"id":"唯一来源id","symbol":"代码","name":"公司","person":"人员姓名","ownerId":"来源持有人编号"或null,"issuerId":"来源发行人编号"或null,"transactionDate":"YYYY-MM-DD交易日","disclosureDate":"YYYY-MM-DD披露日"或null,"code":"原交易代码P/S/A/M等","transactionType":"原类型描述","direction":"buy/sell/other","ownershipChange":"increase/decrease/unknown","shares":非负交易数量或null,"sharesHeld":非负持有证券数量或null,"price":非负原单价或null,"amount":非负原金额或null,"currency":"3位原币种","securityType":"证券种类","missing":"任一null的缺失说明","link":"可选已核验http(s)披露链接"}]；0–400条，空列表须emptyReason说明来源确认无记录；交易日与披露日分列，授予/行权等不能算作公开市场买卖，不推断方向或金额，不混算币种，保留0、null和编码前导0',
 'institutional-ownership':'"companies":[{"symbol":"代码","name":"公司","snapshots":[{"period":"YYYY-Q1/Q2/Q3/Q4报告期","previousPeriod":"YYYY-Q1/Q2/Q3/Q4比较报告期","disclosureDate":"YYYY-MM-DD披露日"或null,"basis":"来源统计口径","missing":"披露日未知时原因","metrics":[{"id":"唯一科目id","label":"来源统计科目","unit":"家/股/份/%等原单位","current":原本期值或null,"previous":原比较期值或null,"change":原变动值或null,"changePercent":原变化百分数或null,"missing":"任一null的缺失说明"}],"link":"可选已核验披露链接","holders":[{"id":"本期唯一来源id","institution":"机构名","institutionId":"来源机构编号","shareClass":"证券类别","shares":非负持仓股数或null,"ownershipPercent":0–100百分数或null,"changeShares":原变动股数或null,"disclosureDate":"YYYY-MM-DD披露日"或null,"missing":"任一null的缺失说明","link":"可选已核验披露链接"}],"holdersBasis":"提供holders时必填：完整/部分机构明细的来源范围"}]}]；1–10家公司，每家1–40个唯一已取得季度，metrics1–30项，holders可省略或0–400条。保留来源本期/比较期/变动/变动比例，不从部分机构明细推导汇总，也不自行重算，百分数12表示12%，持股比例变动按百分点。不同股类/报告期的同一机构记录不合并；报告期不表示实时持仓'
});
export const FINANCIAL_OWNERSHIP_GUIDANCE=' 内幕交易用market.insider-trading，机构持仓季度对比用market.institutional-ownership；首次同次提交完整来源artifact，不输出HTML。'+FINANCIAL_OWNERSHIP_VARIANTS.map(v=>v+'：'+FINANCIAL_OWNERSHIP_FIELDS[v]).join('。');
export function inferFinancialOwnershipVariant(v=''){
 if(/内幕交易|内部人交易|高管交易|insider[.-]trading/iu.test(v))return 'insider-trading';
 if(/机构持仓|机构持股|institutional[.-]ownership/iu.test(v))return 'institutional-ownership';
}
const nullable=(o,keys,nonnegative=false)=>keys.some(k=>o[k]!==null&&(!number(o[k])||nonnegative&&o[k]<0));
const unknown=(o,keys)=>keys.some(k=>o[k]===null)&&!text(o.missing);
const linkIssue=o=>o.link!==undefined&&(!text(o.link)||!safe(o.link));
export function financialOwnershipDataIssue(s){
 if(!FINANCIAL_OWNERSHIP_VARIANTS.includes(s?.variant))return null;
 if(s.variant==='insider-trading'){
  if(!text(s.period)||!text(s.sharesUnit)||!Array.isArray(s.transactions)||s.transactions.length>400)return 'period、sharesUnit与0–400条transactions须保留来源范围及数量单位';
  if(!s.transactions.length&&!text(s.emptyReason))return 'emptyReason须说明来源确认没有交易记录';
  const ids=new Set(),names=new Map();
  for(const [i,t]of s.transactions.entries()){
   if(!text(t?.id,120)||ids.has(t.id)||!['symbol','name','person','code','transactionType','securityType'].every(k=>text(t[k])))return 'transactions['+i+']须有唯一来源id、证券、姓名、原交易代码/类型及证券种类';
   ids.add(t.id);if(names.has(t.symbol)&&names.get(t.symbol)!==t.name)return '同一证券代码的公司名称须一致';names.set(t.symbol,t.name);
   if(!date(t.transactionDate)||t.disclosureDate!==null&&!date(t.disclosureDate))return '交易日和披露日分别保留有效日期，未知披露日用null';
   if(!Object.hasOwn(directions,t.direction)||!Object.hasOwn(changes,t.ownershipChange))return 'direction须buy/sell/other，ownershipChange须increase/decrease/unknown';
   if(!/^[A-Z]{3}$/.test(t.currency)||nullable(t,['shares','sharesHeld','price','amount'],true))return '交易数量/持股/价格/金额须非负来源数或null，币种3位';
   for(const k of ['ownerId','issuerId'])if(t[k]!==null&&!text(t[k],120))return '来源编号须为保留前导0的字符串或null';
   if(unknown(t,['ownerId','issuerId','disclosureDate','shares','sharesHeld','price','amount']))return 'missing须说明未知交易字段，不能补零';
   if(linkIssue(t))return '披露链接须是已核验的安全http(s)地址';
  }
  return null;
 }
 if(!Array.isArray(s.companies)||!s.companies.length||s.companies.length>10)return 'companies须包含1–10家公司来源数据';
 const symbols=new Set();
 for(const c of s.companies){
  if(!text(c?.symbol,80)||symbols.has(c.symbol)||!text(c.name)||!Array.isArray(c.snapshots)||!c.snapshots.length||c.snapshots.length>40)return '公司代码唯一，snapshots须有1–40个已取得季度';
  symbols.add(c.symbol);const periods=new Set();
  for(const p of c.snapshots){
   if(!/^\d{4}-Q[1-4]$/.test(p?.period)||periods.has(p.period)||!/^\d{4}-Q[1-4]$/.test(p.previousPeriod)||p.previousPeriod>=p.period||!text(p.basis))return '报告期唯一，比较期须是较早有效季度，并保留basis来源口径';
   periods.add(p.period);if(p.disclosureDate!==null&&!date(p.disclosureDate)||p.disclosureDate===null&&!text(p.missing)||linkIssue(p))return '披露日须有效日期或null加missing，披露链接须安全';
   if(!Array.isArray(p.metrics)||!p.metrics.length||p.metrics.length>30)return 'metrics须保留1–30项来源汇总，不从明细推导';
   const metricIds=new Set();
   for(const m of p.metrics){
    if(!text(m?.id,120)||metricIds.has(m.id)||!text(m.label)||!text(m.unit)||nullable(m,['current','previous','change','changePercent'])||unknown(m,['current','previous','change','changePercent']))return '统计科目id唯一，单位、四个来源值及null的missing须完整';
    metricIds.add(m.id);
   }
   if(p.holders!==undefined){
    if(!Array.isArray(p.holders)||p.holders.length>400||!text(p.holdersBasis))return 'holders须0–400条，并保留holdersBasis完整/部分来源范围';
    const ids=new Set();
    for(const h of p.holders){
     if(!['id','institution','institutionId','shareClass'].every(k=>text(h?.[k]))||ids.has(h.id)||nullable(h,['shares','ownershipPercent'],true)||h.ownershipPercent!==null&&h.ownershipPercent>100||nullable(h,['changeShares'])||h.disclosureDate!==null&&!date(h.disclosureDate)||unknown(h,['shares','ownershipPercent','changeShares','disclosureDate'])||linkIssue(h))return '机构明细须唯一id、原机构/股类、股数/占比/变动/披露日，null加missing及安全链接';
     ids.add(h.id);
    }
   }
  }
 }
 return null;
}
function ownershipRuntime(){
 const root=document.querySelector('.ownership-profile'),institutional=root.dataset.ownershipType==='institutional-ownership',company=root.querySelector('[data-ownership-company]'),year=root.querySelector('[data-ownership-year]'),quarter=root.querySelector('[data-ownership-quarter]'),person=root.querySelector('[data-ownership-person]'),direction=root.querySelector('[data-ownership-direction]'),search=root.querySelector('[data-ownership-search]'),reset=root.querySelector('[data-ownership-reset]'),count=root.querySelector('[data-ownership-count]'),readout=root.querySelector('[data-ownership-readout]'),groups=[...root.querySelectorAll('[data-ownership-period]')],rows=[...root.querySelectorAll('[data-ownership-row]')],sort=root.querySelector('[data-ownership-sort]');
 let selected='',descending=true;
 const active=()=>!institutional?null:groups.find(g=>g.dataset.ownershipSymbol===company.value&&g.dataset.ownershipPeriod===year.value+'-'+quarter.value);
 const isVisible=r=>!r.hidden&&(!institutional||r.closest('[data-ownership-period]')===active());
 const save=()=>root.dataset.workbenchChartView=JSON.stringify({company:company.value,period:active()?.dataset.ownershipPeriod,person:person?.value,direction:direction?.value,search:search.value,selected,descending,openDetails:[...root.querySelectorAll('details[open]')].map(d=>d.dataset.ownershipDetails)});
 const select=id=>{selected=id;rows.forEach(r=>r.setAttribute('aria-selected',String(r.dataset.ownershipRow===id&&isVisible(r))));const row=rows.find(r=>r.dataset.ownershipRow===id&&isVisible(r));readout.replaceChildren();if(row){const t=document.createElement('span');t.textContent=row.dataset.ownershipDetail;readout.appendChild(t);if(row.dataset.ownershipLink){const a=document.createElement('a');a.href=row.dataset.ownershipLink;a.target='_blank';a.rel='noopener noreferrer';a.textContent='原披露 ↗';readout.appendChild(a);}}save();};
 const fill=(el,values,wanted)=>{el.replaceChildren();for(const [v,label]of values){const o=document.createElement('option');o.value=v;o.textContent=label;el.appendChild(o);}if(values.some(([v])=>v===wanted))el.value=wanted;};
 const periods=wanted=>{
  const available=groups.filter(g=>g.dataset.ownershipSymbol===company.value).map(g=>g.dataset.ownershipPeriod).sort().reverse();
  fill(year,[...new Set(available.map(p=>p.slice(0,4)))].map(y=>[y,y]),wanted?.slice(0,4));
  fill(quarter,available.filter(p=>p.startsWith(year.value+'-')).map(p=>[p.slice(5),'第'+p.slice(6)+'季度']),wanted?.slice(5));
 };
 const apply=()=>{
  if(institutional)groups.forEach(g=>g.hidden=g!==active());
  const q=search.value.trim().toLocaleLowerCase();
  for(const r of rows)if(r.hasAttribute('data-ownership-filterable'))r.hidden=Boolean(q&&!r.dataset.ownershipDetail.toLocaleLowerCase().includes(q)||!institutional&&(company.value&&r.dataset.ownershipSymbol!==company.value||person.value&&r.dataset.ownershipPerson!==person.value||direction.value&&r.dataset.ownershipDirection!==direction.value));
  const visible=rows.filter(isVisible),source=rows.filter(r=>!institutional||r.closest('[data-ownership-period]')===active());
  count.textContent=institutional?visible.filter(r=>!r.hasAttribute('data-ownership-filterable')).length+' 项来源统计 · '+visible.filter(r=>r.hasAttribute('data-ownership-filterable')).length+' 条机构明细':visible.length+' / '+rows.length+' 条';
  const empty=root.querySelector('[data-ownership-empty]');empty.hidden=visible.length>0;empty.textContent=source.length?'没有符合条件的来源记录':root.dataset.emptyReason||'来源未提供机构明细';
  if(!visible.some(r=>r.dataset.ownershipRow===selected))selected='';select(selected);
 };
 const order=()=>{if(sort){[...rows].sort((a,b)=>a.dataset.ownershipDate.localeCompare(b.dataset.ownershipDate)*(descending?-1:1)||a.dataset.ownershipRow.localeCompare(b.dataset.ownershipRow)).forEach(r=>r.parentElement.appendChild(r));sort.closest('th').setAttribute('aria-sort',descending?'descending':'ascending');}};
 company.addEventListener('change',()=>{selected='';if(institutional)periods();apply();});
 if(institutional){year.addEventListener('change',()=>{periods(year.value+'-'+quarter.value);selected='';apply();});quarter.addEventListener('change',()=>{selected='';apply();});periods();}
 else{person.addEventListener('change',apply);direction.addEventListener('change',apply);sort.addEventListener('click',()=>{descending=!descending;order();apply();});}
 search.addEventListener('input',apply);
 reset.addEventListener('click',()=>{company.selectedIndex=0;search.value='';selected='';descending=true;if(institutional)periods();else person.value=direction.value='';order();apply();});
 for(const row of rows){row.addEventListener('click',()=>select(row.dataset.ownershipRow));row.addEventListener('keydown',e=>{if(['Enter',' ','ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const visible=[...row.parentElement.children].filter(isVisible),i=visible.indexOf(row),next=e.key==='Home'?0:e.key==='End'?visible.length-1:e.key==='ArrowDown'?Math.min(i+1,visible.length-1):e.key==='ArrowUp'?Math.max(0,i-1):i;visible[next]?.focus();select(visible[next]?.dataset.ownershipRow??'');}});}
 for(const d of root.querySelectorAll('details'))d.addEventListener('toggle',save);
 root.addEventListener('sherlock-chart-restore',e=>{
  if(e.target!==root||!e.detail||typeof e.detail!=='object')return;const v=e.detail;
  if([...company.options].some(o=>o.value===v.company))company.value=v.company;
  if(institutional)periods(v.period);else for(const [el,key]of [[person,'person'],[direction,'direction']])if([...el.options].some(o=>o.value===v[key]))el.value=v[key];
  if(typeof v.search==='string'&&v.search.length<=2000)search.value=v.search;descending=v.descending!==false;selected=rows.some(r=>r.dataset.ownershipRow===v.selected)?v.selected:'';
  if(Array.isArray(v.openDetails))for(const d of root.querySelectorAll('details'))d.open=v.openDetails.includes(d.dataset.ownershipDetails);
  order();apply();
 });
 order();apply();
}
const table=(labels,rows,label)=>'<div class="snapshot-table-wrap ownership-table-wrap"><table aria-label="'+esc(label)+'"><thead><tr>'+labels.map((v,i)=>'<th'+(i===0?' scope="col"':'')+'>'+v+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
const row=(key,cells,detail,attrs='',link)=>'<tr data-ownership-row="'+esc(key)+'" data-ownership-detail="'+esc(detail)+'"'+(link?' data-ownership-link="'+esc(link)+'"':'')+' '+attrs+' tabindex="0" aria-selected="false">'+cells.map((v,i)=>'<td data-refresh-key="'+esc('ownership:'+key+':'+i)+'" data-refresh-value="'+esc(v)+'">'+esc(v)+'</td>').join('')+'</tr>';
export function renderFinancialOwnership(s){
 if(financialOwnershipDataIssue(s))return null;
 const ins=s.variant==='insider-trading',companies=ins?[...new Map(s.transactions.map(t=>[t.symbol,t.name]))]:s.companies.map(c=>[c.symbol,c.name]);
 const options=items=>items.map(([v,l])=>'<option value="'+esc(v)+'">'+esc(l)+'</option>').join('');
 let controls='<label>公司<select data-ownership-company aria-label="持仓交易公司">'+(ins?'<option value="">全部公司</option>':'')+options(companies)+'</select></label>',body;
 if(ins){
  controls+='<label>人员<select data-ownership-person aria-label="交易人员"><option value="">全部人员</option>'+options([...new Set(s.transactions.map(t=>t.person))].map(p=>[p,p]))+'</select></label><label>方向<select data-ownership-direction aria-label="交易方向"><option value="">全部方向</option>'+options(Object.entries(directions))+'</select></label>';
  const rows=s.transactions.map(t=>{
   const detail=t.symbol+' · '+t.name+' · '+t.person+' · 交易 '+t.transactionDate+' · 披露 '+value(t.disclosureDate)+' · '+t.code+' '+t.transactionType+' · '+directions[t.direction]+' · '+changes[t.ownershipChange]+' · 数量 '+num(t.shares)+' '+s.sharesUnit+' · 持有 '+num(t.sharesHeld)+' '+s.sharesUnit+' · 单价 '+num(t.price)+' '+t.currency+' · 金额 '+num(t.amount)+' '+t.currency+' · '+t.securityType+' · 持有人编号 '+value(t.ownerId)+' · 发行人编号 '+value(t.issuerId)+(t.missing?' · '+t.missing:'')+(t.link?'':' · 原披露链接未提供');
   return row(t.id,[t.transactionDate,value(t.ownerId),t.code+' · '+t.transactionType,num(t.sharesHeld)+' '+s.sharesUnit,value(t.issuerId),t.person,changes[t.ownershipChange],directions[t.direction],num(t.shares)+' '+s.sharesUnit,num(t.price)+' '+t.currency,num(t.amount)+' '+t.currency,value(t.disclosureDate),t.securityType],detail,'data-ownership-filterable data-ownership-date="'+t.transactionDate+'" data-ownership-symbol="'+esc(t.symbol)+'" data-ownership-person="'+esc(t.person)+'" data-ownership-direction="'+t.direction+'"',t.link);
  }).join('');
  body='<p>'+esc(s.period)+' · 交易日与披露日分列；授予、行权等不算作公开市场买卖。</p>'+table(['<button type="button" data-ownership-sort aria-label="按交易日期排序">交易日期</button>','持有人编号','来源类型','持有证券数量','发行人编号','持有人姓名','持有方向','交易方向','交易数量','单价','金额','披露日期','证券种类'],rows,'内幕交易来源记录');
 }else{
  controls+='<label>年度<select data-ownership-year aria-label="机构持仓年度"></select></label><label>季度<select data-ownership-quarter aria-label="机构持仓季度"></select></label>';
  body=s.companies.map(c=>c.snapshots.map(p=>{
   const prefix=c.symbol+':'+p.period+':',summary='报告期 '+p.period+' · 比较期 '+p.previousPeriod+' · 披露 '+value(p.disclosureDate)+' · '+p.basis+(p.missing?' · '+p.missing:'');
   const metrics=p.metrics.map(m=>row(prefix+'metric:'+m.id,[m.label,num(m.current)+' '+m.unit,num(m.previous)+' '+m.unit,num(m.change)+' '+(m.unit==='%'?'百分点':m.unit),num(m.changePercent)+' %'],c.symbol+' · '+summary+' · '+m.label+' · 本期 '+num(m.current)+' '+m.unit+' · 比较期 '+num(m.previous)+' '+m.unit+' · 变动 '+num(m.change)+' '+(m.unit==='%'?'百分点':m.unit)+' · 变化比例 '+num(m.changePercent)+' %'+(m.missing?' · '+m.missing:''),'',p.link)).join('');
   const holders=p.holders?.map(h=>row(prefix+'holder:'+h.id,[h.institution,h.institutionId,h.shareClass,num(h.shares)+' 股',num(h.ownershipPercent)+' %',num(h.changeShares)+' 股',value(h.disclosureDate)],c.symbol+' · '+summary+' · '+h.institution+' · 编号 '+h.institutionId+' · '+h.shareClass+' · 持股 '+num(h.shares)+' 股 · 占比 '+num(h.ownershipPercent)+' % · 变动 '+num(h.changeShares)+' 股 · 披露 '+value(h.disclosureDate)+(h.missing?' · '+h.missing:'')+(h.link?'':' · 原披露链接未提供'),'data-ownership-filterable',h.link)).join('');
   return '<section data-ownership-symbol="'+esc(c.symbol)+'" data-ownership-period="'+p.period+'" hidden><p>'+esc(summary)+'</p>'+table(['项目','本期 '+p.period,'比较期 '+p.previousPeriod,'变动','变动比例'],metrics,'机构持仓来源季度统计')+(p.holders!==undefined?'<details data-ownership-details="'+esc(prefix)+'"><summary>机构持仓来源明细 · '+p.holders.length+'条</summary><p>'+esc(p.holdersBasis)+'</p>'+table(['机构','机构编号','股类','持仓股数','持股比例','变动股数','披露日期'],holders,'机构持仓原始明细')+'</details>':'<p>来源未提供逐机构明细；汇总按原披露值展示。</p>')+'<p>报告期数据不表示当前持仓；不同股类分别保留，不从部分明细推导总额。</p></section>';
  }).join('')).join('');
 }
 return {body:'<section class="financial-profile ownership-profile" data-ownership-type="'+s.variant+'" data-workbench-chart-view="{}" data-workbench-view-key="ownership-controls" data-empty-reason="'+esc(s.emptyReason)+'"><div class="ownership-controls">'+controls+'<input type="search" data-ownership-search aria-label="'+(ins?'搜索交易记录':'搜索机构明细')+'" placeholder="'+(ins?'人员 / 类型 / 来源记录':'机构 / 股类 / 明细')+'"><button type="button" data-ownership-reset>重置筛选</button><span data-ownership-count role="status"></span></div>'+body+'<p data-ownership-empty hidden></p><div data-ownership-readout role="status"></div></section>',script:'('+ownershipRuntime.toString()+')();'};
}
export const FINANCIAL_OWNERSHIP_CSS=`@layer ework-workbench{
body:is([data-sherlock-market="insider-trading"],[data-sherlock-market="institutional-ownership"]){display:flex;flex-direction:column;height:100vh!important;overflow:hidden!important}
body .ownership-profile{display:flex;flex-direction:column;gap:6px}
body .ownership-profile>*{flex:none;min-width:0}
body .ownership-profile p{margin:0!important;line-height:16px!important;font-size:11px!important;color:var(--sherlock-muted);overflow-wrap:anywhere}
body .ownership-controls{display:flex;align-items:center;gap:5px;flex-wrap:wrap;--sherlock-control-secondary:var(--sherlock-control-bg)}
body .ownership-controls label{display:flex;align-items:center;gap:4px;color:var(--sherlock-muted);font-size:11px}
body .ownership-controls select{max-width:160px!important}
body .ownership-controls input[type=search]{flex:1 1 110px;min-width:90px!important;max-width:240px}
body .ownership-controls button{white-space:nowrap;font-size:11px!important;padding:3px 6px!important}
body .ownership-table-wrap{overflow:auto;max-height:320px;scrollbar-width:thin;margin:6px 0}
body .ownership-table-wrap table{table-layout:auto!important;min-width:660px}
body[data-sherlock-market=insider-trading] .ownership-table-wrap table{min-width:1550px}
body .ownership-table-wrap :is(th,td){height:32px!important;min-width:106px;padding:6px!important;line-height:18px!important;font-size:12px!important;white-space:nowrap!important}
body .ownership-table-wrap th{position:sticky;top:0;background:var(--sherlock-surface-muted);z-index:2}
body .ownership-table-wrap :is(th,td):first-child{position:sticky;left:0;min-width:140px;background:var(--sherlock-surface)!important;z-index:1}
body .ownership-table-wrap th:first-child{z-index:3;background:var(--sherlock-surface-muted)!important}
:root[data-workbench-style=enterprise] body .ownership-table-wrap th:first-child{background:var(--sherlock-table-heading)!important}
body .ownership-table-wrap tr[aria-selected=true] td{background:var(--sherlock-row-selected)!important;color:var(--sherlock-text)!important}
body .ownership-table-wrap tr[data-ownership-direction=buy] td:nth-child(8){color:var(--sherlock-market-positive)!important}
body .ownership-table-wrap tr[data-ownership-direction=sell] td:nth-child(8){color:var(--sherlock-market-negative)!important}
body [data-ownership-readout]{display:flex;flex-wrap:wrap;gap:4px 10px;max-height:110px;overflow:auto;min-height:16px;font-size:11px!important;line-height:16px!important;overflow-wrap:anywhere}
body [data-ownership-readout] span{flex:1 1 100%;color:var(--sherlock-muted)}
body .ownership-profile details>summary{white-space:normal!important;overflow-wrap:anywhere}
body .ownership-profile [hidden]{display:none!important}
}`;
