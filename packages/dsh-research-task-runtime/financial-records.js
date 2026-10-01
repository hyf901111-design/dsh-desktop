// Figma 1917:350483 / 351460 / 351969: source tables, never inferred aggregates.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(v,max=2000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const safe=v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}};
const encode=v=>JSON.stringify(v).replace(/</g,'\\u003c');
const ownershipNumbers=['shares','changeShares','changePercent','marketValue','portfolioWeight','previousPortfolioWeight','ownershipPercent','quarterEndPrice'];
const priceNumbers=['open','high','low','close','volume','vwap','change','changePercent','adjustedClose'];
export const FINANCIAL_RECORDS_VARIANTS=Object.freeze(['stock-ownership','company-filings','historical-price']);
export const FINANCIAL_RECORDS_FIELDS=Object.freeze({
 'stock-ownership':'"datasets":[{"id":"唯一数据集id","symbol":"证券","name":"公司","basis":"原持仓统计口径","reportPeriod":"原报告期","reportDate":"YYYY-MM-DD期末日","disclosureDate":"YYYY-MM-DD披露日"或null,"currency":"3位币种","sharesUnit":"股等原数量单位","marketValueUnit":"原市值单位","priceUnit":"原价格单位","sharesOutstanding":非负原分母股数或null,"denominatorDate":"与reportDate一致的分母日期"或null,"missing":"元数据null的说明","rows":[{"id":"本期唯一来源id","investorName":"投资者","investorId":"保留前导0的编号"或null,"discretion":"来源投资决定权","shareClass":"股类","shares":非负原股数或null,"changeShares":原变动股数或null,"changePercent":原变动百分数或null,"marketValue":非负原市值或null,"portfolioWeight":0–100原组合权重或null,"previousPortfolioWeight":0–100原上期权重或null,"ownershipPercent":0–100原持股比例或null,"quarterEndPrice":非负原期末价或null,"missing":"任一null原因","link":"可选http(s)原披露链接"}]}]；1–40个数据集，每集0–400条；空列表须emptyReason说明来源确认无记录。不得把重复机构的不同股类合并，不重算原比例或用部分明细推导汇总，组合权重与持股比例分母不同',
 'company-filings':'"datasets":[{"id":"唯一数据集id","symbol":"证券","name":"公司","basis":"来源查询口径","queryRange":"来源披露查询范围","rows":[{"id":"唯一来源id","title":"来源标题"或null,"filedDate":"YYYY-MM-DD披露日期","cik":"保留前导0的来源编号"或null,"form":"原公告/表单类型","agency":"发布机构","link":"http(s)原文链接"或null,"linkUnavailable":"可选来源说明链接失效/迁移的原因","summary":"原摘要"或null,"summarySource":"摘要来源"或null,"missing":"任一null原因"}]}]；1–40集，每集0–400条，空列表须emptyReason。原文与摘要来源分别展示；链接失效保留记录，不伪造标题、摘要或链接',
 'historical-price':'"datasets":[{"id":"唯一数据集id","symbol":"证券","name":"公司","basis":"来源查询口径","currency":"3位原币种","priceUnit":"价格单位","volumeUnit":"成交量单位","exchange":"原市场","timeZone":"IANA时区","adjustment":"原复权口径","interval":"原频率","rows":[{"id":"唯一来源id","date":"YYYY-MM-DD来源日期","open":非负来源值或null,"high":非负来源值或null,"low":非负来源值或null,"close":非负来源值或null,"volume":非负原量或null,"vwap":非负原均价或null,"change":原变动额或null,"changePercent":原变动百分数或null,"adjustedClose":非负原复权收盘或null,"missing":"任一null原因"}]}]；1–40集，每集0–1000条，空列表须emptyReason；完整保留已取得日期（虚构市场不套用真实交易日历），未知量/复权价/VWAP不补零或推算；价格与成交量单位分开，导出当前筛选范围'
});
export const FINANCIAL_RECORDS_GUIDANCE=' 股东持仓明细优先market.stock-ownership，公司公告/披露优先market.company-filings，历史行情逐日表优先market.historical-price；同次提交完整来源artifact，不输出HTML。'+FINANCIAL_RECORDS_VARIANTS.map(v=>v+'：'+FINANCIAL_RECORDS_FIELDS[v]).join('。');
export function inferFinancialRecordsVariant(v=''){
 if(/股东持仓|股东持股|股东名册|stock[.-]ownership/iu.test(v))return 'stock-ownership';
 if(/公司公告|公司披露|证券公告|company[.-]filings/iu.test(v))return 'company-filings';
 if(/历史行情|历史价格表|逐日行情|historical[.-]price/iu.test(v))return 'historical-price';
}
export function financialRecordsDataIssue(s){
 if(!FINANCIAL_RECORDS_VARIANTS.includes(s?.variant))return null;
 if(!Array.isArray(s.datasets)||!s.datasets.length||s.datasets.length>40)return 'datasets须包含1–40个来源数据集';
 const ids=new Set(),names=new Map();
 for(const d of s.datasets){
  if(!['id','symbol','name','basis'].every(k=>text(d?.[k]))||ids.has(d.id)||!Array.isArray(d.rows)||d.rows.length>(s.variant==='historical-price'?1000:400))return '数据集id唯一，证券/名称/来源口径和原始rows须完整';
  ids.add(d.id);if(names.has(d.symbol)&&names.get(d.symbol)!==d.name)return '同一证券的公司名称须一致';names.set(d.symbol,d.name);
  if(!d.rows.length&&!text(d.emptyReason))return 'emptyReason须说明来源确认无记录';
  if(s.variant==='stock-ownership'){
   if(!['reportPeriod','sharesUnit','marketValueUnit','priceUnit'].every(k=>text(d[k]))||!date(d.reportDate)||d.disclosureDate!==null&&!date(d.disclosureDate)||!(/^[A-Z]{3}$/.test(d.currency)))return '报告期/期末日/披露日/原币种及单位须完整';
   if(d.sharesOutstanding!==null&&(!finite(d.sharesOutstanding)||d.sharesOutstanding<0)||d.denominatorDate!==null&&!date(d.denominatorDate))return '原分母股数须非负数字或null，分母日期须有效日期或null';
   if(d.sharesOutstanding!==null&&(d.denominatorDate!==d.reportDate||d.sharesOutstanding===0&&d.rows.some(r=>r.ownershipPercent!==null)))return '分母日期须与报告期末日一致；零分母不能提供持股比例';
   if(['disclosureDate','sharesOutstanding','denominatorDate'].some(k=>d[k]===null)&&!text(d.missing))return 'missing须解释未知披露日或持股分母';
  }else if(s.variant==='historical-price'){
   if(!['priceUnit','volumeUnit','exchange','timeZone','adjustment','interval'].every(k=>text(d[k]))||!(/^[A-Z]{3}$/.test(d.currency)))return '历史行情的币种、市场、时区、复权及价格/成交量单位须完整';
   try{new Intl.DateTimeFormat('en-US',{timeZone:d.timeZone});}catch{return 'timeZone须为有效IANA时区';}
  }else if(!text(d.queryRange))return 'queryRange须保留公告来源查询范围';
  const rowIds=new Set(),dates=new Set();
  for(const r of d.rows){
   if(!text(r?.id,120)||rowIds.has(r.id))return '每个数据集的来源记录id须唯一';rowIds.add(r.id);
   if(r.link!==undefined&&r.link!==null&&(!text(r.link)||!safe(r.link)))return '原文链接须安全http(s)地址';
   if(s.variant==='company-filings'){
    if(!date(r.filedDate)||!text(r.form)||!text(r.agency))return '公告日期、原类型、发布机构须完整';
    for(const k of ['title','cik','link','summary','summarySource'])if(r[k]!==null&&!text(r[k],k==='summary'?12000:2000))return '公告标题/编号/原文/摘要/摘要来源须为原字符串或null';
    if(r.summary!==null&&!text(r.summarySource))return '摘要须保留summarySource，不能与原文来源混同';
    if(['title','cik','link','summary','summarySource'].some(k=>r[k]===null)&&!text(r.missing))return 'missing须解释未提供的公告字段';
    if(r.linkUnavailable!==undefined&&!text(r.linkUnavailable))return 'linkUnavailable须为来源失效说明';
   }else{
    const keys=s.variant==='stock-ownership'?ownershipNumbers:priceNumbers;
    if(keys.some(k=>r[k]!==null&&!finite(r[k])))return '全部数字字段须保留来源数或null，不能省略';
    if(keys.some(k=>r[k]===null)&&!text(r.missing))return 'missing须解释未知原值，不能补零';
    const positive=s.variant==='stock-ownership'?['shares','marketValue','quarterEndPrice']:['open','high','low','close','volume','vwap','adjustedClose'];
    if(positive.some(k=>r[k]!==null&&r[k]<0))return '股数、市值、价格和成交量不能为负';
    if(s.variant==='stock-ownership'){
     if(!['investorName','discretion','shareClass'].every(k=>text(r[k]))||r.investorId!==null&&!text(r.investorId,120)||r.investorId===null&&!text(r.missing))return '投资者、投资决定权、股类和原字符串编号须完整';
     if(['portfolioWeight','previousPortfolioWeight','ownershipPercent'].some(k=>r[k]!==null&&(r[k]<0||r[k]>100)))return '组合权重与持股比例须各自为0–100百分数或null';
    }else{
     if(!date(r.date)||dates.has(r.date))return '来源行情日期须有效且在数据集中唯一';dates.add(r.date);
     if(r.high!==null&&['open','low','close'].some(k=>r[k]!==null&&r[k]>r.high)||r.low!==null&&['open','high','close'].some(k=>r[k]!==null&&r[k]<r.low))return '原OHLC的高低范围不一致';
    }
   }
  }
 }
 return null;
}
function recordsColumns(variant){
 if(variant==='stock-ownership')return [['investorName','投资者姓名',220],['discretion','投资决定权',172],['shares','股数',102],['changeShares','变动股数',137],['changePercent','变动比例 / %',172],['marketValue','市值',109],['portfolioWeight','组合权重 / %',165],['previousPortfolioWeight','上期组合权重 / %',200],['ownershipPercent','持股比例 / %',116],['quarterEndPrice','期末价格',116]];
 if(variant==='company-filings')return [['title','公告标题',260],['filedDate','日期',170],['cik','CIK编号',160],['form','表单类型',160],['link','原文来源',210]];
 return [['changePercent','变动比例 / %',220],['date','日期',110],['open','开盘',95],['high','最高',95],['low','最低',95],['close','收盘',95],['volume','成交量',110],['vwap','VWAP',100],['change','变动额',100],['adjustedClose','复权收盘',110]];
}
export function financialRecordsCsv(variant,d,rows){
 const cell=v=>{let t=v===null?'未提供':String(v??'');if(typeof v==='string'&&/^[\s\u0000-\u0020]*[=+\-@]/u.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';};
 const metadata=Object.entries(d).filter(([k])=>k!=='rows').map(([k,v])=>[k,v]);
 const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
 return '\uFEFF'+[['template',variant],...metadata,[],keys,...rows.map(r=>keys.map(k=>Object.hasOwn(r,k)?r[k]:''))].map(a=>a.map(cell).join(',')).join('\r\n');
}
// The parent derives payloads from retained template data; the iframe sends IDs only.
export function financialRecordsActionPayload(model,request){
 const data=model?.data,allowed=['stock-ownership','company-filings','historical-price'];
 if(data?.type!=='market'||data.version!==1||!allowed.includes(data.variant)||model.templateId!=='market.'+data.variant||!Array.isArray(data.datasets)||data.datasets.length>40||!Array.isArray(request.rows)||request.rows.length>1000||new Set(request.rows).size!==request.rows.length||request.rows.some(id=>typeof id!=='string'||!id||id.length>120))return null;
 const d=data.datasets.find(d=>d.id===request.dataset);if(!d||!Array.isArray(d.rows)||d.rows.length>1000||typeof d.symbol!=='string')return null;
 const source=new Map(d.rows.map(r=>[r.id,r]));if(request.rows.some(id=>!source.has(id)))return null;
 if(request.action==='copy-link'){
  if(request.rows.length!==1)return null;const r=source.get(request.rows[0]);if(typeof r.link!=='string'||r.linkUnavailable)return null;
  try{const u=new URL(r.link);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;}catch{return null;}
  return {content:r.link};
 }
 if(request.action!=='export')return null;
 const rows=request.rows.map(id=>source.get(id));
 if([...Object.entries(d).filter(([k])=>k!=='rows').map(([,v])=>v),...rows.flatMap(r=>Object.values(r))].some(v=>v!==null&&typeof v!=='string'&&!(typeof v==='number'&&Number.isFinite(v))))return null;
 const content=financialRecordsCsv(data.variant,d,rows);if(content.length>2000000)return null;
 return {content,format:'csv',suggestedName:data.variant+'-'+d.symbol.replace(/[^A-Za-z0-9.-]/g,'_').slice(0,80)+'.csv'};
}
function recordsRuntime(s,columns){
 const root=document.querySelector('.records-profile'),dataset=root.querySelector('[data-records-dataset]'),search=root.querySelector('[data-records-search]'),form=root.querySelector('[data-records-form]'),from=root.querySelector('[data-records-from]'),to=root.querySelector('[data-records-to]'),count=root.querySelector('[data-records-count]'),readout=root.querySelector('[data-records-readout]'),status=root.querySelector('[data-records-status]'),groups=[...root.querySelectorAll('[data-records-group]')];
 let requestId=null;
 const request=(action,rows,event)=>{if(!event.isTrusted||requestId)return;requestId='records-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);status.textContent=action==='export'?'请选择保存位置…':'正在复制…';parent.postMessage({type:'sherlock-records-action',id:requestId,action,dataset:dataset.value,rows},'*');};
 addEventListener('message',event=>{const d=event.data;if(event.source!==parent||d?.type!=='sherlock-records-action-result'||Object.keys(d).length!==3||d.id!==requestId||!['saved','cancelled','copied','error'].includes(d.status))return;requestId=null;status.textContent={saved:'当前筛选范围已保存，包含原单位与缺失原因',cancelled:'已取消保存',copied:'原文链接已复制',error:'操作未完成，请重试'}[d.status];});
 let selected='',sortKey=s.variant==='stock-ownership'?'investorName':s.variant==='company-filings'?'filedDate':'date',descending=s.variant!=='stock-ownership';
 const current=()=>s.datasets.find(d=>d.id===dataset.value),group=()=>groups.find(g=>g.dataset.recordsGroup===dataset.value);
 const visible=()=>[...group().querySelectorAll('[data-records-row]')].filter(r=>!r.hidden);
 const rowData=id=>current().rows.find(r=>r.id===id);
 const fmt=v=>v===null?'未提供':typeof v==='number'?v.toLocaleString('en-US',{maximumFractionDigits:20}):String(v);
 const labels={...Object.fromEntries(columns),id:'来源记录id',investorId:'投资者编号',shareClass:'股类',agency:'发布机构',summary:'来源摘要',summarySource:'摘要来源',missing:'缺失原因',linkUnavailable:'原文状态'};
 const save=()=>root.dataset.workbenchChartView=JSON.stringify({dataset:dataset.value,search:search.value,form:form?.value,from:from?.value,to:to?.value,selected,sortKey,descending});
 const select=id=>{
  selected=visible().some(r=>r.dataset.recordsRow===id)?id:'';for(const g of groups)for(const row of g.querySelectorAll('[data-records-row]'))row.setAttribute('aria-selected',String(g===group()&&row.dataset.recordsRow===selected));readout.replaceChildren();
  const data=rowData(selected);if(data){for(const [k,v]of Object.entries(data)){const item=document.createElement('div'),label=document.createElement('span');label.textContent=(labels[k]??k)+'：';item.appendChild(label);if(k==='link'&&v){const a=document.createElement('a');a.href=v;a.rel='noopener noreferrer';a.target='_blank';a.textContent='原文 ↗';item.appendChild(a);if(!data.linkUnavailable){const b=document.createElement('button');b.type='button';b.textContent='复制原文链接';b.addEventListener('click',event=>request('copy-link',[data.id],event));item.appendChild(b);}}else item.appendChild(document.createTextNode(fmt(v)));readout.appendChild(item);}}
  save();
 };
 const fillForms=wanted=>{if(!form)return;form.replaceChildren();for(const v of ['',...new Set(current().rows.map(r=>r.form))]){const o=document.createElement('option');o.value=v;o.textContent=v||'全部类型';form.appendChild(o);}if([...form.options].some(o=>o.value===wanted))form.value=wanted;};
 const order=()=>{
  const d=current(),body=group().querySelector('tbody'),byId=new Map(d.rows.map(r=>[r.id,r]));
  [...body.children].sort((a,b)=>{const av=byId.get(a.dataset.recordsRow)[sortKey],bv=byId.get(b.dataset.recordsRow)[sortKey];if(av===null||av===undefined)return bv==null?0:1;if(bv==null)return -1;return (typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv)))*(descending?-1:1)||a.dataset.recordsRow.localeCompare(b.dataset.recordsRow);}).forEach(r=>body.appendChild(r));
  for(const th of group().querySelectorAll('th')){const key=th.querySelector('[data-records-sort]')?.dataset.recordsSort;th.setAttribute('aria-sort',key===sortKey?(descending?'descending':'ascending'):'none');}
 };
 const apply=()=>{
  groups.forEach(g=>g.hidden=g!==group());const q=search.value.trim().toLocaleLowerCase(),byId=new Map(current().rows.map(r=>[r.id,r]));
  for(const el of group().querySelectorAll('[data-records-row]')){const r=byId.get(el.dataset.recordsRow);el.hidden=Boolean(q&&!Object.values(r).map(fmt).join(' ').toLocaleLowerCase().includes(q)||form?.value&&r.form!==form.value||from?.value&&(r.filedDate??r.date)<from.value||to?.value&&(r.filedDate??r.date)>to.value);}
  const rows=visible(),empty=group().querySelector('[data-records-empty]');empty.hidden=rows.length>0;empty.textContent=current().rows.length?'没有符合条件的来源记录':current().emptyReason;count.textContent=rows.length+' / '+current().rows.length+' 条';select(selected);
 };
 dataset.addEventListener('change',()=>{selected='';fillForms();if(from)from.value=to.value='';status.textContent='';order();apply();});
 search.addEventListener('input',apply);form?.addEventListener('change',apply);from?.addEventListener('change',apply);to?.addEventListener('change',apply);
 root.querySelector('[data-records-reset]').addEventListener('click',()=>{dataset.selectedIndex=0;search.value='';selected='';sortKey=s.variant==='stock-ownership'?'investorName':s.variant==='company-filings'?'filedDate':'date';descending=s.variant!=='stock-ownership';fillForms();if(from)from.value=to.value='';status.textContent='';order();apply();});
 for(const g of groups){for(const button of g.querySelectorAll('[data-records-sort]'))button.addEventListener('click',()=>{const key=button.dataset.recordsSort;descending=sortKey===key?!descending:false;sortKey=key;order();apply();});for(const row of g.querySelectorAll('[data-records-row]')){row.addEventListener('click',()=>select(row.dataset.recordsRow));row.addEventListener('keydown',e=>{if(['Enter',' ','ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const rows=visible(),i=rows.indexOf(row),n=e.key==='Home'?0:e.key==='End'?rows.length-1:e.key==='ArrowDown'?Math.min(rows.length-1,i+1):e.key==='ArrowUp'?Math.max(0,i-1):i;rows[n]?.focus();select(rows[n]?.dataset.recordsRow??'');}});}}
 root.querySelector('[data-records-export]').addEventListener('click',event=>request('export',visible().map(r=>r.dataset.recordsRow),event));
 root.addEventListener('sherlock-chart-restore',e=>{if(e.target!==root||!e.detail||typeof e.detail!=='object')return;const v=e.detail;if(s.datasets.some(d=>d.id===v.dataset))dataset.value=v.dataset;fillForms(v.form);if(typeof v.search==='string'&&v.search.length<=2000)search.value=v.search;for(const [el,k]of [[from,'from'],[to,'to']])if(el&&typeof v[k]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v[k]))el.value=v[k];sortKey=columns.some(([key])=>key===v.sortKey)?v.sortKey:sortKey;descending=v.descending===true;selected=typeof v.selected==='string'?v.selected:'';order();apply();});
 fillForms();order();apply();
}
export function renderFinancialRecords(s){
 if(financialRecordsDataIssue(s))return null;
 const columns=recordsColumns(s.variant),fmt=v=>v===null?'未提供':typeof v==='number'?v.toLocaleString('en-US',{maximumFractionDigits:20}):String(v),stock=s.variant==='stock-ownership';
 const controls='<label>证券 / 来源期<select data-records-dataset aria-label="记录证券与来源期">'+s.datasets.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.symbol+(stock?' · '+d.reportPeriod:''))+'</option>').join('')+'</select></label>'+(s.variant==='company-filings'?'<label>类型<select data-records-form aria-label="公告类型"></select></label>':'')+(!stock?'<label>从<input type="date" data-records-from aria-label="记录起始日期"></label><label>至<input type="date" data-records-to aria-label="记录结束日期"></label>':'')+'<input type="search" data-records-search aria-label="搜索来源记录" placeholder="搜索来源记录"><button type="button" data-records-reset>重置筛选</button><button type="button" data-records-export>导出当前范围</button><span data-records-count role="status"></span>';
 const body=s.datasets.map((d,i)=>{
  const units=stock?'报告期 '+d.reportPeriod+' · 期末 '+d.reportDate+' · 披露 '+fmt(d.disclosureDate)+' · 股数 '+d.sharesUnit+' · 市值 '+d.marketValueUnit+' '+d.currency+' · 期末价 '+d.priceUnit+' '+d.currency+' · 原持股分母 '+fmt(d.sharesOutstanding)+' '+d.sharesUnit+'（'+fmt(d.denominatorDate)+'）':s.variant==='historical-price'?d.exchange+' · '+d.interval+' · '+d.timeZone+' · '+d.adjustment+' · 价格 '+d.priceUnit+' '+d.currency+' · 成交量 '+d.volumeUnit:d.queryRange+' · 公告原文与摘要来源分别保留';
  return '<section data-records-group="'+esc(d.id)+'"'+(i?' hidden':'')+'><p>'+esc(d.symbol+' · '+d.name+' · '+units)+'</p><p>'+esc(d.basis+(d.missing?' · '+d.missing:''))+'</p><div class="snapshot-table-wrap records-table-wrap" tabindex="0" aria-label="来源表格，可横向滚动查看完整列"><table aria-label="'+esc(s.title)+'"><colgroup>'+columns.map(([, ,w])=>'<col style="width:'+w+'px">').join('')+'</colgroup><thead><tr>'+columns.map(([key,label])=>'<th scope="col"><button type="button" data-records-sort="'+key+'" aria-label="按'+label+'排序">'+label+'</button></th>').join('')+'</tr></thead><tbody>'+d.rows.map(r=>'<tr data-records-row="'+esc(r.id)+'" tabindex="0" aria-selected="false">'+columns.map(([key])=>'<td data-refresh-key="'+esc('records:'+d.id+':'+r.id+':'+key)+'" data-refresh-value="'+esc(r[key])+'">'+(key==='link'&&r.link?'<a href="'+esc(r.link)+'" target="_blank" rel="noopener noreferrer">'+(r.linkUnavailable?'来源已迁移':'原文 ↗')+'</a>':esc(fmt(r[key])))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><p data-records-empty hidden></p></section>';
 }).join('');
 return {body:'<section class="financial-profile records-profile" data-records-type="'+s.variant+'" data-workbench-chart-view="{}" data-workbench-view-key="records-controls"><div class="records-controls">'+controls+'</div>'+body+'<div data-records-readout role="status"></div><p data-records-status role="status"></p></section>',script:'('+recordsRuntime.toString()+')('+encode(s)+','+encode(columns)+');'};
}
export const FINANCIAL_RECORDS_CSS=`@layer ework-workbench{
body:is([data-sherlock-market="stock-ownership"],[data-sherlock-market="company-filings"],[data-sherlock-market="historical-price"]){display:flex;flex-direction:column;height:100vh!important;overflow:hidden!important}
body .records-profile{display:flex;flex-direction:column;gap:6px}
body .records-profile>*{flex:none;min-width:0}
body .records-profile p{margin:0!important;line-height:16px!important;font-size:11px!important;color:var(--sherlock-muted);overflow-wrap:anywhere}
body .records-controls{display:flex;align-items:center;gap:5px;flex-wrap:wrap;--sherlock-control-secondary:var(--sherlock-control-bg)}
body .records-controls label{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--sherlock-muted);min-width:0;max-width:100%}
body .records-controls select{max-width:180px!important;min-width:0!important}
body .records-controls input[type=date]{width:124px!important;min-width:0!important}
body .records-controls input[type=search]{flex:1 1 110px;min-width:90px!important;max-width:240px}
body .records-controls button{white-space:nowrap;font-size:11px!important;padding:3px 6px!important}
body .records-controls>span{font-size:11px;color:var(--sherlock-muted)}
body .records-table-wrap{overflow:auto;max-height:320px;scrollbar-width:thin;margin:6px 0;max-width:100%}
body .records-table-wrap table{table-layout:fixed!important;min-width:100%;width:1130px}
body[data-sherlock-market=stock-ownership] .records-table-wrap table{width:1509px}
body[data-sherlock-market=company-filings] .records-table-wrap table{width:960px}
body .records-table-wrap :is(th,td){height:32px!important;padding:6px!important;line-height:18px!important;font-size:12px!important;white-space:nowrap!important;vertical-align:middle;text-align:right;overflow:hidden;text-overflow:ellipsis}
body .records-table-wrap :is(th,td):first-child{position:sticky;left:0;background:var(--sherlock-surface)!important;z-index:1}
body .records-table-wrap tbody tr:nth-child(even) td:first-child{background:var(--sherlock-row-alternate)!important}
body .records-table-wrap th{position:sticky;top:0;background:var(--sherlock-surface-muted);z-index:2}
body .records-table-wrap th:first-child{z-index:3;background:var(--sherlock-surface-muted)!important}
:root[data-workbench-style=enterprise] body .records-table-wrap th:first-child{background:var(--sherlock-table-heading)!important}
body .records-table-wrap tr[aria-selected=true] td{background:var(--sherlock-row-selected)!important}
body .records-table-wrap th button{max-width:100%;white-space:normal!important;text-align:inherit}
body .records-table-wrap td:nth-child(2),body[data-sherlock-market=company-filings] .records-table-wrap td{text-align:left}
body .records-table-wrap tr:focus-visible{outline:1px solid var(--sherlock-control-primary);outline-offset:-1px}
body [data-records-readout]{display:flex;flex-wrap:wrap;gap:4px 16px;max-height:160px;overflow:auto;font-size:11px!important;line-height:16px!important;overflow-wrap:anywhere}
body [data-records-readout]>div{flex:1 1 280px;min-width:0}
body [data-records-readout] span{color:var(--sherlock-muted)}
body [data-records-readout] button{margin-left:6px;font-size:11px!important;padding:2px 5px!important}
body .records-profile [hidden]{display:none!important}
}`;
