import {decimal} from './numbers.mjs'
// Shared publication structure. Every displayed amount comes from the current
// verified fact set; presentation never fills a missing field with zero.
const FREQUENCIES={FY:'全年',H1:'半年度',H2:'下半年度',Q1:'第一季度',Q2:'第二季度',Q3:'第三季度',Q4:'第四季度',date:'时点'}
const frequency=period=>/^FY\d{4}$/.test(period)?'FY':/^\d{4}[HQ][1-4]$/.test(period)?period.slice(4):/^\d{4}-\d{2}-\d{2}$/.test(period)?'date':null
const periodEnd=period=>/^FY\d{4}$/.test(period)?period.slice(2)+'-12-31':/^\d{4}[HQ][1-4]$/.test(period)?period.slice(0,4)+'-'+({H1:'06-30',H2:'12-31',Q1:'03-31',Q2:'06-30',Q3:'09-30',Q4:'12-31'}[period.slice(4)]??'00-00'):period
const ORDER=['revenue','totalRevenue','costOfRevenue','netIncomeAttributableToParent','netIncome','operatingProfit','sellingExpenses','administrativeExpenses','taxesAndSurcharges','researchExpenses','financeExpenses','basicEarningsPerShare','dilutedEarningsPerShare','returnOnEquity','assets','liabilities','cash','inventory','contractLiabilities','debt','minorityInterest','shares','netAssetsPerShare','operatingCashFlow','capex','fcff']
const STATEMENTS=[['盈利摘要',['revenue','totalRevenue','costOfRevenue','netIncomeAttributableToParent','netIncome','operatingProfit','sellingExpenses','administrativeExpenses','taxesAndSurcharges','researchExpenses','financeExpenses','basicEarningsPerShare','dilutedEarningsPerShare','returnOnEquity']],['资产负债摘要',['assets','liabilities','cash','inventory','contractLiabilities','debt','minorityInterest','shares','netAssetsPerShare']],['现金流摘要',['operatingCashFlow','capex','fcff']]]
export function financialGroups(facts,metrics){
 const groups=new Map()
 for(const f of facts){const freq=frequency(f.period);if(!metrics.includes(f.metric)||!freq)continue;const key=JSON.stringify([f.scope,freq,f.normalizedUnit]);if(!groups.has(key))groups.set(key,{scope:f.scope,frequency:freq,unit:f.normalizedUnit,facts:[]});groups.get(key).facts.push(f)}
 return [...groups.values()].sort((a,b)=>(a.scope===b.scope?0:a.scope==='合并'?-1:b.scope==='合并'?1:a.scope.localeCompare(b.scope))||a.frequency.localeCompare(b.frequency)).map(g=>({...g,label:FREQUENCIES[g.frequency],periods:[...new Set(g.facts.map(f=>f.period))].sort(),metrics:[...new Set(g.facts.map(f=>f.metric))].sort((a,b)=>ORDER.indexOf(a)-ORDER.indexOf(b))}))
}
export const MAX_PUBLICATION_NAVIGATION_TARGETS=512
export function publicationTargetCount(packet,facts,values,calculation,observationCount=0){
 const report=packet.report??{},sections=report.sections??[]
 const ended=facts.filter(f=>periodEnd(f.period)<=(f.metric==='currentPrice'?packet.asOf:packet.financialAsOf))
 const scope=ended.some(f=>f.scope==='合并')?'合并':ended[0]?.scope
 const historical=financialGroups(ended.filter(f=>f.scope===scope),['revenue','netIncomeAttributableToParent']).filter(g=>['FY','H1'].includes(g.frequency)&&g.unit==='CNY').length
 const fy=ended.filter(f=>f.scope===scope&&f.normalizedUnit==='CNY'&&/^FY\d{4}$/.test(f.period))
 const common=[...new Set(fy.filter(f=>f.metric==='revenue').map(f=>f.period))].filter(period=>['revenue','netIncomeAttributableToParent'].every(metric=>fy.filter(f=>f.period===period&&f.metric===metric).length===1)).sort().slice(-3)
 const coverChart=common.length>=2&&fy.some(f=>common.includes(f.period)&&['revenue','netIncomeAttributableToParent'].includes(f.metric)&&decimal(f.normalizedValue).cmp('0')!==0)?1:0
 let count=5+sections.length+(report.theses?.length?1:0)+historical+coverChart+2
 count+=STATEMENTS.flatMap(([,metrics])=>financialGroups(ended.filter(f=>periodEnd(f.period)<=packet.financialAsOf),metrics)).reduce((n,g)=>n+Math.ceil(g.periods.length/5),0)
 count+=(calculation.calculations?.length?1:0)+(calculation.dcf?3:0)+(observationCount>0?1:0)
 for(const section of sections){
  count+=(section.tables??[]).length
  for(const chart of section.charts??[]){const nonzero=chart.series.some(series=>series.refs.some(id=>decimal(values.get(id).value).cmp('0')!==0));if(nonzero)count+=1+(chart.series.length>2||chart.series[0].refs.length>3?1:0)}
 }
 return count
}
export function createPublicationIndex(escape){
 const charts=[],tables=[]
 return {charts,tables,chart(title){const n=charts.length+1,item={id:`chart-${n}`,title:`图 ${n}：${title}`};charts.push(item);return item},table(title){const n=tables.length+1,item={id:`table-${n}`,title:`表 ${n}：${title}`};tables.push(item);return item},navigation(sections,hasTheses){
  const entries=[...(hasTheses?[['research-theses','核心论点与改变判断的条件']]:[]),...sections.map((s,i)=>[s.anchor??`section-${s.kind??`analysis-${i+1}`}`,`${i+1}. ${s.title}`]),['financial-statements','财务三表摘要'],['fact-evidence','财务事实与证据'],['calculation-evidence','确定性计算'],['source-ledger','来源台账'],['limitations','假设、局限与声明']]
  const list=items=>items.map(([id,title])=>`<li><a href="#${escape(id)}" data-publication-target="${escape(id)}"><span class="toc-label">${escape(title)}</span><span class="toc-page" data-publication-page="${escape(id)}">—</span></a></li>`).join('')
  return `<nav class="publication-contents" aria-label="报告目录"><h2>目录</h2><ol class="contents-list">${list(entries)}</ol><h2>图表索引</h2><div class="visual-index"><div><h3>图目录</h3><ul>${list(charts.map(c=>[c.id,c.title]))||'<li>本稿未绘制数值图。</li>'}</ul></div><div><h3>表目录</h3><ul>${list(tables.map(t=>[t.id,t.title]))||'<li>本稿未编制专题表。</li>'}</ul></div></div><p class="small">目录及图表标题可点击跳转。财务期间、范围与来源在对应图表旁列示。</p></nav>`
 }}
}
function renderGroup(g,title,h,index,{cover=false}={}){
 const {escape:e,formatted,values,table,sourceNote,labels}=h
 const cell=(metric,period)=>{if(metric.startsWith('yoy:')){const sourceMetric=metric.slice(4);return [...values.values()].filter(c=>c.op==='yoy'&&c.period===period&&c.scope===g.scope&&values.get(c.inputs?.[0])?.metric===sourceMetric)}return (cover?[...values.values()].filter(f=>!f.op&&periodEnd(f.period)<=h.financialAsOf):g.facts).filter(f=>f.metric===metric&&f.period===period&&f.scope===g.scope)}
 const chunks=[]
 for(let offset=0;offset<g.periods.length;offset+=5){const ps=g.periods.slice(offset,offset+5),item=index.table(title+(offset?'（续）':'')),body=g.metrics.map(metric=>'<tr><td>'+e(metric.startsWith('yoy:')?(labels[metric.slice(4)]??metric.slice(4))+'同比':labels[metric]??metric)+'</td>'+ps.map(period=>{const fs=cell(metric,period);return `<td class="number">${fs.length===1?e(formatted(values.get(fs[0].id))):(cover&&metric==='basicEarningsPerShare'?'未提供':'—')}</td>`}).join('')+'</tr>'),caption=`<h3 id="${item.id}" class="table-title">${e(item.title)}</h3>`,units=cover?'金额亿元 / 同比% / 每股元':g.unit==='CNY'?'亿元':g.unit==='shares'?'股':g.unit==='CNY_per_share'?'元/股':g.unit==='ratio'?'%':g.unit
  chunks.push(`<div class="financial-group" data-scope="${e(g.scope)}" data-frequency="${e(g.frequency)}" data-unit="${e(g.unit)}">${caption}<div class="table-meta">单位：${e(units)} · ${e(g.scope)} · ${e(g.label)}（${e(ps.join(' / '))}）</div>${table(['指标',...ps],body)}${sourceNote(ps.flatMap(period=>g.metrics.flatMap(metric=>cell(metric,period).map(f=>f.id))),cover)}<p class="small">${cover?'历史披露实绩；':'仅列本次核验项目；'}“—”表示未核验或存在重复口径，不代表零。${g.frequency==='date'?'时点比较不等于同比增速。':'各列为相同频率期间。'}</p></div>`)
 }
 return chunks.join('')
}
export function renderFinancialStatements(facts,h,index){
 facts=facts.filter(f=>periodEnd(f.period)<=h.financialAsOf)
 return `<section id="financial-statements" class="financial-statements"><h2>财务三表摘要</h2><p class="small">按报表范围、期间频率与单位分组；仅列财务基期已结束期间，摘要不替代完整财务报表。金额由同次证据事实换算，未核验项目不补零。</p>${STATEMENTS.map(([name,metrics])=>financialGroups(facts,metrics).map(g=>renderGroup(g,`${name} · ${g.scope} · ${g.label}`,h,index)).join('')).join('')||'<p>本稿没有可列示的已核验三表数据。</p>'}</section>`
}
export function renderPublicationCover({packet,metadata,title,coverage,facts,summary,scopeLabel},h,index){
 facts=facts.filter(f=>periodEnd(f.period)<=(f.metric==='currentPrice'?packet.asOf:packet.financialAsOf))
 const {escape:e,formatted,values,labels,table,researchChart,sourceNote}=h,scope=facts.some(f=>f.scope==='合并')?'合并':facts[0]?.scope
 const basics=['currentPrice','shares','basicEarningsPerShare','returnOnEquity','netAssetsPerShare','assets','liabilities','cash','inventory','contractLiabilities'].flatMap(metric=>{const fs=facts.filter(f=>f.metric===metric&&(metric==='currentPrice'||f.scope===scope)).sort((a,b)=>periodEnd(b.period).localeCompare(periodEnd(a.period)));const latest=fs[0];if(!latest||fs.filter(f=>f.period===latest.period).length!==1)return [];return [latest]}).slice(0,8)
 const commonBasicPeriod=basics.length&&!basics.some(f=>f.metric==='currentPrice')&&new Set(basics.map(f=>f.period)).size===1?basics[0].period:null
 const basicRows=basics.map(f=>`<tr><td>${e(labels[f.metric]??f.metric)}${commonBasicPeriod?'':`<small>${e(f.period)}</small>`}</td><td class="number">${e(formatted(values.get(f.id)))}</td></tr>`)
 const fy=facts.filter(f=>f.scope===scope&&f.normalizedUnit==='CNY'&&/^FY\d{4}$/.test(f.period)),metrics=['revenue','netIncomeAttributableToParent'],common=[...new Set(fy.filter(f=>f.metric==='revenue').map(f=>f.period))].filter(period=>metrics.every(metric=>fy.filter(f=>f.period===period&&f.metric===metric).length===1)).sort().slice(-3)
 const chart=common.length>=2?researchChart({title:'历史年度收入与归母净利润',series:metrics.map(metric=>({name:labels[metric],refs:common.map(period=>fy.find(f=>f.period===period&&f.metric===metric).id)}))},packet,values,index,{narrow:true}):'<p class="small">缺少同口径、可比年度收入与利润，不绘制拼接图。</p>'
 const historical=financialGroups(facts.filter(f=>f.scope===scope),['revenue','netIncomeAttributableToParent']).filter(g=>['FY','H1'].includes(g.frequency)&&g.unit==='CNY').map(g=>({...g,periods:g.periods.slice(-2),metrics:['revenue','yoy:revenue','netIncomeAttributableToParent','yoy:netIncomeAttributableToParent','basicEarningsPerShare']}))
 const missingBasics=[['returnOnEquity','ROE'],['netAssetsPerShare','每股净资产']].filter(([metric])=>!facts.some(f=>f.metric===metric&&f.scope===scope)).map(([,label])=>label)
 return `<header class="publication-cover"><div class="cover-date"><span>${e(packet.asOf)} · 研究截止</span><span class="publication-brand">EWork Odyssey <small>投资研究</small></span></div><div class="cover-identity">${e(metadata.companyLabel)}（${e(packet.company.ticker)}）${packet.report?.publication?.industry?`<span>${e(packet.report.publication.industry)}</span>`:''}</div><h1>${e(title)}</h1><div class="cover-subtitle"><span>—— ${e(metadata.reportName)}</span><strong>${e(metadata.reportType)}</strong></div>${packet.synthetic?'<div class="synthetic"><strong>虚构数据演示</strong>：仅用于检查研究流程，不代表真实上市公司或行情。</div>':''}<div class="cover-layout"><aside class="cover-sidebar"><div class="rating-block"><h3>研究状态 <span class="unrated">未评级</span></h3><p class="small">${e(scopeLabel)}；行情及估值模型以本稿核验状态为准。</p></div><h3>财务基本数据</h3>${commonBasicPeriod?`<p class="small">${e(scope)} · 截至 ${e(commonBasicPeriod)}</p>`:''}${basicRows.length?table(['已核验项目','数值'],basicRows):'<p class="small">尚无可列示的已核验基本数据。</p>'}${sourceNote(basics.map(f=>f.id),true)}${basics.some(f=>f.metric==='currentPrice')?'<p class="small">报价时点单列；财务期末不代表行情时点。</p>':''}${missingBasics.length?`<p class="small">${e(missingBasics.join('、'))}尚未核验；每股收益见下方摘要。</p>`:''}${chart}</aside><div class="cover-main"><h2>投资要点</h2><div class="summary">${summary}</div></div></div><div class="cover-financial"><h3>历史财务摘要与预测状态</h3><div class="cover-history">${historical.map(g=>renderGroup(g,`历史财务摘要 · ${g.scope} · ${g.label}`,h,index,{cover:true})).join('')||'<p class="small">本稿没有可比历史实绩，未编造摘要。</p>'}</div><p class="forecast-status"><strong>预测与估值状态：</strong>${packet.dcf?'情景模型单列假设与价值桥；历史实绩不标注为预测值。':'盈利预测及估值未建模，不输出目标价或评级。上表仅为历史实绩。'}</p></div></header>`
}
export const publicationStyles=`
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#eef1f4;color:var(--ink);font:15px/1.8 "Songti SC","STSong","SimSun",serif}
main{max-width:1040px;margin:28px auto;padding:40px 54px 36px;background:#fff}
h1,h2,h3,.publication-brand,.cover-identity,.cover-subtitle,th,.table-meta,.small,small,.legend,.meta{font-family:"PingFang SC","Microsoft YaHei",sans-serif}
h1,h2,h3{color:var(--navy);line-height:1.45}
.cover-identity,h1,.cover-subtitle span{overflow-wrap:anywhere}
h1{font-size:31px;margin:20px 0 10px;font-weight:700}
h2{font-size:20px;border-bottom:1px solid var(--cyan);padding-bottom:6px;margin:28px 0 12px}
h3{font-size:15px;margin:16px 0 7px}
p{margin:9px 0;text-align:justify}
a{color:var(--blue);overflow-wrap:anywhere}
small{display:block}
.small,small,.table-meta{font-size:11px;line-height:1.55;color:#6d7a83}
.publication-cover{position:relative;border-top:11px solid var(--navy);padding-top:15px}
.cover-date{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;font-size:13px}
.publication-brand{position:absolute;right:0;top:15px;font-weight:700;font-size:20px;color:var(--navy);text-align:right;white-space:nowrap}
.publication-brand small{font-weight:400;font-size:10px;letter-spacing:4px}
.cover-identity{margin-top:9px;font-size:16px;font-weight:600}
.cover-identity span{margin-left:22px}
.cover-subtitle{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;border-bottom:2px solid var(--cyan);padding-bottom:9px;font-size:15px}
.cover-subtitle strong{white-space:nowrap}
.cover-layout{display:flow-root;margin-top:18px}
.cover-main{width:68%}
.cover-main h2{font-size:17px;border:0;margin:0 0 8px}
.cover-sidebar{float:right;width:29%;background:#f0f7fa;padding:11px 12px 10px}
.cover-sidebar h3{font-size:13px;border-bottom:1px solid var(--cyan);padding-bottom:5px;margin:12px 0 5px}
.cover-sidebar h3:first-child{margin-top:0}
.cover-sidebar p{font-size:12px;line-height:1.7}
.unrated{float:right;font-family:"PingFang SC",sans-serif;font-size:23px;font-weight:600;color:var(--navy)}
.rating-block{border-top:3px solid var(--navy);padding-top:6px}
.cover-sidebar table{font-size:11px;margin:7px 0}
.cover-sidebar th,.cover-sidebar td{padding:4px 2px}
.cover-sidebar th{font-weight:400}
.cover-sidebar .number{text-align:right;white-space:normal}
.cover-sidebar figure{margin:13px 0 0;padding:0;border:0}
.cover-sidebar figcaption{font-size:11px}
.cover-sidebar figure small,.cover-sidebar figure .small{font-size:9px}
.cover-sidebar .legend{gap:9px;font-size:9px;flex-wrap:wrap;margin:5px 0}
.cover-sidebar svg{max-height:none}
.cover-sidebar svg text{font-size:15px}
.summary p{margin:0 0 11px}
.summary p:before{content:"•";display:inline-block;color:var(--blue);margin-right:.5em}
.summary-label{color:var(--navy);font-weight:700}
.citation{font-size:9px;vertical-align:super;margin-left:4px;font-family:sans-serif;white-space:normal}
.cover-financial{clear:both;margin-top:15px}
.cover-financial>h3{font-size:13px;color:var(--ink);margin:0 0 5px}
.cover-history{display:grid;grid-template-columns:1fr 1fr;gap:15px}
.cover-history .table-title{font-size:11px;margin:3px 0}
.cover-history table{font-size:11px;margin:5px 0}
.cover-history th,.cover-history td{padding:4px}
.cover-history .small,.cover-history .table-meta{font-size:9px}
.forecast-status{font-size:11px;line-height:1.65;color:#617783;padding-top:7px;border-top:1px solid var(--line)}
.publication-contents{margin-top:34px}
.contents-list{padding-left:0;list-style:none}
.contents-list li{border-bottom:1px dotted #cbd5da;margin:0;padding:5px 0}
.contents-list a{display:flex;gap:8px;align-items:baseline;color:var(--ink);text-decoration:none}
.visual-index{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.visual-index ul{list-style:none;padding:0;font:11px/1.7 "PingFang SC",sans-serif}
.visual-index li{margin:5px 0}
.visual-index a{display:flex;gap:8px;align-items:baseline;text-decoration:none}
.toc-label{flex:1;min-width:0}
.toc-page{display:inline-block;flex:0 0 3ch;width:3ch;text-align:right;font-variant-numeric:tabular-nums;font-family:"PingFang SC",sans-serif}
.body-content{margin-top:28px}
.section-heading{break-after:avoid;break-inside:avoid}
.scope-note{font-size:11px;color:#697e8b;margin-bottom:10px}
.note{background:#eff8fc;border-left:3px solid var(--cyan);padding:10px 14px;margin:15px 0;font-size:13px}
.synthetic{background:#fff7d8;border-left:3px solid var(--yellow);padding:9px 12px;margin:14px 0;font-size:12px}
.gap p{margin:3px 0 8px}
.gap strong{color:var(--navy)}
.thesis{border-bottom:1px solid #d9e3e8;padding:9px 0;margin:8px 0}
.thesis>p{font-weight:700;color:var(--navy)}
dl{display:grid;grid-template-columns:5em 1fr;gap:4px 12px;font-size:13px}
dt{color:var(--blue);font-weight:600}
dd{margin:0}
dd p,td p{margin:0}
table{border-collapse:separate;border-spacing:0;width:100%;font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:12px;line-height:1.6;margin:8px 0}
th,td{border-bottom:1px solid #dce3e7;text-align:left;padding:7px 7px;vertical-align:top;overflow-wrap:anywhere}
th{border-top:1.5px solid var(--navy);border-bottom:1px solid var(--navy);color:var(--navy);font-weight:600;background:#f4f8fa}
tbody tr:last-child td{border-bottom:1.5px solid var(--navy)}
tbody tr:nth-child(even){background:#fafcfd}
.number{font-variant-numeric:tabular-nums;text-align:right}
.table-wrap{overflow-x:auto}
.table-title{margin-bottom:4px}
.table-meta{margin:3px 0}
.source-note{margin:5px 0 10px}
.source-note a{text-decoration:none}
.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}
.chart-grid.single{grid-template-columns:1fr}
.chart-grid .wide{grid-column:1/-1}
figure{margin:14px 0;padding:9px 0 3px;border-top:1px solid #d2e0e8}
figcaption{font:600 13px/1.6 "PingFang SC","Microsoft YaHei",sans-serif;color:var(--navy)}
svg{display:block;width:100%;height:auto}
svg text{font:14px "PingFang SC",sans-serif;fill:var(--ink)}
.legend{display:flex;gap:12px;flex-wrap:wrap;font-size:10px;margin:7px 0}
.legend span{padding-left:5px}
.financial-group{margin:12px 0 18px}
.financial-statements h3{font-size:14px}
footer{margin-top:25px;border-top:1px solid var(--line);padding-top:12px;font:11px/1.75 "PingFang SC",sans-serif;color:#6c7b85}
li{margin:6px 0}
.screen-only{font-size:9px;overflow-wrap:anywhere}
@media screen and (max-width:700px){main{margin:0;padding:24px 20px}
.cover-main{width:auto}
.cover-sidebar{float:none;width:auto;margin-bottom:20px}
.cover-history,.chart-grid,.visual-index{grid-template-columns:1fr}
.cover-subtitle{display:block}
.cover-subtitle strong{display:block;margin-top:5px}
h1{font-size:26px}
.cover-identity span{display:block;margin:6px 0 0}
table{font-size:11px}
}
@page{size:A4;margin:14mm 15mm 16mm}
@media print{.cover-main{width:68%}.cover-sidebar{float:right;width:29%;margin-bottom:0}.cover-history,.chart-grid,.visual-index{grid-template-columns:1fr 1fr}.cover-subtitle{display:flex}.cover-subtitle strong{display:inline;margin-top:0}.cover-identity span{display:inline;margin-left:22px}body{background:white;font-size:9.5pt;line-height:1.65}
main{margin:0;padding:0;max-width:none}
.publication-cover{border-top-width:2.7mm;padding-top:3mm;break-after:page}
.cover-date{font-size:9pt}
.publication-brand{top:3mm;font-size:14pt}
.publication-brand small{font-size:7pt}
.cover-identity{font-size:11pt;margin-top:1.5mm}
h1{font-size:20pt;margin:6mm 0 2mm;line-height:1.45}
.cover-subtitle{font-size:10pt;padding-bottom:2mm;gap:4mm}
.cover-layout{margin-top:4mm}
.cover-main h2{font-size:10.5pt}
.cover-sidebar{padding:2.5mm 2.8mm}
.cover-sidebar h3{font-size:8.5pt;margin:3mm 0 1mm}
.unrated{font-size:11pt;line-height:1.1}
.cover-sidebar p{font-size:7.3pt;line-height:1.5;margin:1mm 0}
.cover-sidebar table{font-size:7.3pt;line-height:1.45}
.cover-sidebar th,.cover-sidebar td{padding:.8mm .5mm}
.cover-sidebar small{font-size:6.5pt}
.cover-sidebar figure{margin-top:3mm}
.cover-sidebar figcaption{font-size:7.5pt}
.cover-sidebar figure small,.cover-sidebar figure .small{font-size:6pt}
.cover-sidebar .legend{font-size:6pt;gap:2mm}
.summary p{margin:0 0 3mm;orphans:2;widows:2}
.citation{font-size:6pt}
.cover-financial{margin-top:2mm}
.cover-financial>h3{font-size:8.5pt}
.cover-history{gap:4mm}
.cover-history .table-title{font-size:7.3pt}
.cover-history table{font-size:7.3pt;margin:1mm 0}
.cover-history th,.cover-history td{padding:.8mm}
.cover-history .small,.cover-history .table-meta{font-size:6.2pt;line-height:1.4}
.forecast-status{font-size:7.3pt;line-height:1.6;padding-top:1.5mm}
.publication-contents{margin-top:0;break-after:page}
.publication-contents h2:first-child{margin-top:0}
.publication-contents h2{font-size:12pt;margin-top:4mm}
.contents-list{font-size:9pt}
.contents-list li{padding:.7mm 0}
.visual-index{gap:6mm}
.visual-index h3{font-size:9pt;margin:2mm 0}
.visual-index ul{font-size:7.2pt;line-height:1.55}
.visual-index li{margin:.7mm 0}
.body-content{margin-top:0}
h2{font-size:12pt;margin:7mm 0 3mm;padding-bottom:1.5mm}
h3{font-size:10pt}
h1,h2,h3{break-inside:avoid;break-after:avoid}
.small,small,.table-meta,.scope-note{font-size:7.3pt}
p{orphans:3;widows:3;margin:2.3mm 0}
dl{font-size:8.3pt}
.thesis{padding:2mm 0}
.note{font-size:8.4pt;padding:2.5mm 3mm;margin:3mm 0}
.gap{break-inside:auto}
.synthetic{font-size:8pt;padding:2mm 3mm}
table{font-size:8pt;line-height:1.6;margin:2mm 0}
th,td{padding:1.7mm 1.6mm}
thead{display:table-header-group;break-inside:avoid;break-after:avoid}
th{print-color-adjust:exact;-webkit-print-color-adjust:exact}
tr{break-inside:avoid}
.table-wrap{overflow:visible}.numbered-table:has(.compact),.financial-group:has(.compact){break-inside:avoid}.source-note{break-before:avoid}
.compact{break-inside:avoid}
.financial-group{margin:3mm 0 5mm}
.financial-statements h3{font-size:9pt}
.table-title{break-after:avoid}
.table-meta{break-after:avoid}
.chart-grid{gap:4mm}
.chart-grid figure{margin:3mm 0}
.chart-grid.single svg{max-height:60mm}
figure{break-inside:avoid;padding-top:2mm}
figcaption{font-size:8.5pt;break-after:avoid}
.legend{font-size:7pt;margin:1.5mm 0}
.source-note{margin:1mm 0 3mm}
#source-ledger table{table-layout:fixed}
#source-ledger th:nth-child(1){width:10%}
#source-ledger th:nth-child(2){width:64%}
#source-ledger th:nth-child(3){width:26%}
.observations table{table-layout:fixed}
.observations th:nth-child(1){width:12%}
.observations th:nth-child(2){width:74%}
.observations th:nth-child(3){width:14%}
.publication-disclosure{break-inside:avoid}.screen-only{display:none}
.number{white-space:normal}
a{text-decoration:none}
footer{font-size:7.5pt;margin-top:6mm;padding-top:3mm}
.cover-history .financial-group{margin:1mm 0}
.cover-history .source-note{margin:1mm 0}
.cover-history .table-meta{white-space:normal}
}

`
