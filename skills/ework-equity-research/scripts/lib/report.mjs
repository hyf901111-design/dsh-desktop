import { decimal, formatDecimal } from './numbers.mjs'
import {qualityDiagnostics,extraReportRows,visualDiagnostics,reportCoverage,RESEARCH_SECTIONS} from './quality.mjs'

export const EFUND = Object.freeze({ navy:'#005096',blue:'#0078B4',cyan:'#1EB9E1',title:'#00BEE6',pale:'#B3EBFF',ink:'#3C3C3C',muted:'#969696',line:'#C1C6C8',yellow:'#FFC819' })
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const group = value => {const [a,b]=value.split('.');return a.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(b===undefined?'':'.'+b)}
const LABELS={revenue:'营业收入',totalRevenue:'营业总收入',costOfRevenue:'营业成本',netIncome:'净利润',netIncomeAttributableToParent:'归母净利润',operatingProfit:'营业利润',operatingCashFlow:'经营现金流',capex:'资本开支',fcff:'企业自由现金流',cash:'货币资金',debt:'有息债务',nonOperatingAssets:'非经营资产',minorityInterest:'少数股东权益',shares:'总股本',currentPrice:'经核对价格',grossProfit:'毛利润',grossMargin:'毛利率',assets:'总资产',liabilities:'负债',sellingExpenses:'销售费用',administrativeExpenses:'管理费用',taxesAndSurcharges:'税金及附加',inventory:'存货',contractLiabilities:'合同负债',researchExpenses:'研发费用',financeExpenses:'财务费用'}
const diagnostic=(code,path,message)=>({severity:'error',code,path,message})
const items=(validation,calculation)=>new Map([
 ...(validation?.facts??[]).filter(f=>f.status==='verified').map(f=>[f.id,{...f,value:f.normalizedValue,unit:f.normalizedUnit}]),
 ...(validation?.observations??[]).filter(o=>o.status==='verified').map(o=>[o.id,{...o,type:'observation'}]),
 ...(calculation?.calculations??[]).map(c=>[c.id,c])
])
const rows=report=>[...(report?.summary??[]).map((p,i)=>[p,`report.summary[${i}]`]),...(report?.sections??[]).flatMap((s,i)=>[
 [{text:s.title},`report.sections[${i}].title`],...(s.paragraphs??[]).map((p,j)=>[p,`report.sections[${i}].paragraphs[${j}]`])])]
function formatted(item,format='auto') {
 const {value,unit}=item
 if(format==='yi'){if(unit!=='CNY')throw Error('亿元格式仅适用于人民币金额');return group(formatDecimal(value,{scale:'100000000'}))+' 亿元'}
 if(format==='pct'){if(unit!=='ratio')throw Error('百分比格式仅适用于比例');return group(decimal(value).mul('100').toString(2,true))+'%'}
 if(!['auto','raw'].includes(format))throw Error('不支持的展示格式')
 if(format==='raw')return group(decimal(value).toString())+' '+({CNY:'元',shares:'股',CNY_per_share:'元/股',ratio:'倍'}[unit]??unit)
 if(unit==='CNY')return formatted(item,'yi')
 if(unit==='ratio')return formatted(item,'pct')
 return group(formatDecimal(value,{places:unit==='shares'?0:2}))+' '+({shares:'股',CNY_per_share:'元/股'}[unit]??unit)
}
function tokenValue(token,packet,values){
 if(['company','ticker','asOf','financialAsOf'].includes(token))return token==='company'?packet.company.name:token==='ticker'?packet.company.ticker:packet[token]
 if(token.startsWith('period:')){const item=values.get(token.slice(7));if(!item?.period)throw Error('期间引用不存在');return item.period}
 if(token.startsWith('observation:')){const item=values.get(token.slice(12));if(item?.type!=='observation')throw Error('原文观察不存在');return item.quote}
 const [id,format,...rest]=token.split('|');if(rest.length||!values.has(id)||values.get(id).type==='observation')throw Error('事实或计算引用不存在')
 return formatted(values.get(id),format)
}
export function validateReport(packet,validation,calculation){
 const ds=[],values=items(validation,calculation),report=packet.report??{}
 if(!validation?.ok||!calculation?.ok)ds.push(diagnostic('REPORT_VALIDATION','$','事实或计算校验未通过'))
 if(report.summary!==undefined&&!Array.isArray(report.summary)||report.sections!==undefined&&!Array.isArray(report.sections))return [...ds,diagnostic('REPORT_SCHEMA','report','summary/sections 必须是数组')]
 if((report.summary?.length??0)>30||(report.sections?.length??0)>30)return [...ds,diagnostic('REPORT_SCHEMA','report','报告章节或摘要超出范围')]
 ds.push(...qualityDiagnostics(report,values))
 const visuals=visualDiagnostics(report,values);ds.push(...visuals)
 if(visuals.length)return ds
 let paragraphs
 try{paragraphs=[[{text:report.title??`${packet.company.name}研究报告`},'report.title'],...rows(report),...extraReportRows(report)]}catch{return [...ds,diagnostic('REPORT_SCHEMA','report','章节需要title与paragraphs数组')]}
 for(const [p,path] of paragraphs){
  if(!p||typeof p.text!=='string'||p.text.length>12000){ds.push(diagnostic('REPORT_SCHEMA',path,'需要长度受限的text字符串'));continue}
  const residual=p.text.replace(/\{\{([^{}]+)\}\}/g,(_all,token)=>{
   try{tokenValue(token,packet,values)}catch(error){ds.push(diagnostic(error.message.includes('格式')?'REPORT_UNIT':'UNKNOWN_REPORT_REF',path,error.message+': '+token))}return ''
  })
  if(residual.includes('{{')||residual.includes('}}'))ds.push(diagnostic('REPORT_TEMPLATE',path,'模板标记未闭合'))
  if(/[0-9]|[零〇一二三四五六七八九十百千万亿两]+(?:元|股|倍|%|％|成)/u.test(residual))ds.push(diagnostic('UNTEMPLATED_NUMBER',path,'定量文字请通过 {{事实或计算ID}} 引用，期间使用 {{period:事实ID}}'))
  if(p.refs!==undefined&&(!Array.isArray(p.refs)||p.refs.length>100)){ds.push(diagnostic('REPORT_SCHEMA',path,'refs必须是ID数组'));continue}
  for(const id of p.refs??[])if(!values.has(id))ds.push(diagnostic('UNKNOWN_REPORT_REF',path,'引用不存在: '+id))
 }
 return ds
}
function sourceIds(id,values,seen=new Set()){
 if(seen.has(id))return [];seen.add(id);const v=values.get(id)
 return v?.sourceId?[v.sourceId]:(v?.inputs??[]).flatMap(input=>sourceIds(input,values,seen))
}
const safeUrl=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null}catch{return null}}
function paragraph(p,packet,values){
 const ids=new Set(p.refs??[])
 const text=p.text.replace(/\{\{([^{}]+)\}\}/g,(_all,token)=>{if(!['company','ticker','asOf','financialAsOf'].includes(token))ids.add(token.startsWith('period:')?token.slice(7):token.startsWith('observation:')?token.slice(12):token.split('|')[0]);return tokenValue(token,packet,values)})
 const sources=[...new Set([...ids].flatMap(id=>sourceIds(id,values)))],refs=sources.map(id=>`<a href="#source-${escape(id)}" title="${escape(packet.sources.find(s=>s.id===id)?.title??id)}">[${packet.sources.findIndex(s=>s.id===id)+1}]</a>`).join(' · ')
 return `<p>${escape(text)}${refs?`<span class="citation">${refs}</span>`:''}</p>`
}
function researchChart(chart,packet,values){
 const colors=[EFUND.navy,EFUND.cyan,EFUND.blue,EFUND.yellow],series=chart.series.map(s=>({...s,name:tokenValueFree(s.name,packet,values)})),all=series.flatMap(s=>s.refs.map(id=>values.get(id))),unit=all[0].unit
 const max=all.reduce((a,v)=>{const d=decimal(v.value),abs=d.cmp('0')<0?d.mul('-1'):d;return abs.cmp(a)>0?abs:a},decimal('0'))
 if(max.cmp('0')===0)return ''
 const labels=series[0].refs.map(id=>values.get(id).period),negative=all.some(v=>decimal(v.value).cmp('0')<0),base=negative?125:210,height=negative?95:165,groupWidth=660/labels.length,barWidth=Math.min(65,(groupWidth-30)/series.length)
 const bars=series.flatMap((s,j)=>s.refs.map((id,i)=>{const v=values.get(id),n=Number(decimal(v.value).div(max).toString(12)),h=Math.abs(n)*height,x=20+i*groupWidth+(groupWidth-series.length*barWidth)/2+j*barWidth,y=n>=0?base-h:base
  return `<rect x="${x}" y="${y}" width="${barWidth-4}" height="${h}" fill="${colors[j]}"/><text x="${x+(barWidth-4)/2}" y="${n>=0?y-7:y+h+14}" text-anchor="middle">${escape(unit==='CNY'?formatDecimal(v.value,{scale:'100000000'}):formatted(v))}</text>`})).join('')
 const axis=labels.map((label,i)=>`<text x="${20+(i+.5)*groupWidth}" y="250" text-anchor="middle">${escape(label)}</text>`).join(''),sources=[...new Set(series.flatMap(s=>s.refs.flatMap(id=>sourceIds(id,values))))]
 return `<figure><figcaption>${escape(tokenValueFree(chart.title,packet,values))}<small>单位：${unit==='CNY'?'亿元':unit==='ratio'?'%':escape(unit)} · ${escape(all[0].scope)}</small></figcaption><div class="legend">${series.map((s,j)=>`<span style="border-left:10px solid ${colors[j]}">${escape(s.name)}</span>`).join('')}</div><svg viewBox="0 0 700 275" role="img" aria-label="${escape(tokenValueFree(chart.title,packet,values))}"><line x1="15" y1="${base}" x2="690" y2="${base}" stroke="${EFUND.line}"/>${bars}${axis}</svg><div class="small">来源：${sources.map(id=>`<a href="#source-${escape(id)}" title="${escape(packet.sources.find(s=>s.id===id)?.title??id)}">[${packet.sources.findIndex(s=>s.id===id)+1}]</a>`).join('、')}。${escape(labels.join(' / '))}，同口径可比期间。</div></figure>`
}
function historyChart(facts,packet,values){
 const groups=new Map()
 for(const f of facts.filter(f=>['revenue','netIncomeAttributableToParent'].includes(f.metric)&&f.normalizedUnit==='CNY')){const key=f.metric+'-'+f.period.replace(/20\d{2}/,'')+'-'+f.scope;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f)}
 return [...groups.values()].filter(fs=>fs.length>=2&&fs.length<=8).map(fs=>researchChart({title:LABELS[fs[0].metric]+' · '+(fs[0].period.startsWith('FY')?'年度比较':'同期间比较'),series:[{name:LABELS[fs[0].metric],refs:fs.sort((a,b)=>a.period.localeCompare(b.period)).map(f=>f.id)}]},packet,values)).join('')
}
function structuredSection(s,packet,values){
 const gap=s.gap?`<div class="note gap"><strong>资料缺口：</strong>${paragraph({text:s.gap.missing},packet,values)}<strong>结论影响：</strong>${paragraph({text:s.gap.impact},packet,values)}<strong>补充动作：</strong>${paragraph({text:s.gap.nextStep},packet,values)}</div>`:''
 const tables=(s.tables??[]).map(t=>`<h3>${escape(tokenValueFree(t.title,packet,values))}</h3>${table(t.columns.map(x=>tokenValueFree(x,packet,values)),t.rows.map(row=>'<tr>'+row.map(cell=>'<td>'+paragraph(cell,packet,values)+'</td>').join('')+'</tr>'))}`).join('')
 const charts=(s.charts??[]).map(c=>researchChart(c,packet,values)).join('')
 return `<section id="section-${escape(s.kind??'analysis')}"><h2>${escape(tokenValueFree(s.title,packet,values))}</h2>${s.status?`<div class="small">研究范围：${escape(RESEARCH_SECTIONS[s.kind]??s.kind)} · ${s.status==='supported'?'已有证据支持':s.status==='partial'?'部分资料已核验':'资料待补充'}</div>`:''}${(s.paragraphs??[]).map(p=>paragraph(p,packet,values)).join('')}${tables}${charts}${gap}</section>`
}
function thesisSection(report,packet,values){
 return (report.theses??[]).length?`<section><h2>核心论点与改变判断的条件</h2>${report.theses.map(t=>`<article class="thesis">${paragraph({text:t.statement,refs:t.evidenceRefs},packet,values)}<dl>${[['inference','推论'],['assumption','假设'],['falsifier','反证条件'],['monitoring','下次观察']].map(([key,label])=>`<dt>${label}</dt><dd>${paragraph({text:t[key],refs:key==='inference'?t.evidenceRefs:undefined},packet,values)}</dd>`).join('')}</dl></article>`).join('')}</section>`:''
}
const table=(headers,body)=>`<div class="table-wrap${body.length<=8?' compact':''}"><table><thead><tr>${headers.map(h=>`<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table></div>`
function dcfSection(dcf){
 if(!dcf)return '<div class="note">本次未运行估值模型。未提供经核对的现价时，不计算当前市值、市盈率或评级。</div>'
 const money=value=>value===undefined||value===null?'—':formatted({value,unit:'CNY'})
 const percent=value=>value===undefined||value===null?'—':formatted({value,unit:'ratio'})
 const perShare=value=>value===undefined||value===null?'—':formatted({value,unit:'CNY_per_share'})
 const scenarios=dcf.scenarios??[]
 const labels={bear:'保守',base:'基准',bull:'乐观'}
 const rs=scenarios.map(s=>`<tr><td>${escape(labels[s.id]??s.id)}</td><td>${escape(percent(s.wacc))}</td><td>${escape(percent(s.terminalGrowth))}</td><td>${escape(money(s.enterpriseValue))}</td><td>${escape(money(s.equityValue))}</td><td>${escape(perShare(s.perShareValue))}</td></tr>`)
 const assumptions=scenarios.map(s=>`<tr><td>${escape(labels[s.id]??s.id)}</td><td>${escape(s.assumption)}</td><td>${(s.fcff??[]).map((v,i)=>`第${i+1}期：${escape(money(v))}`).join('<br>')}</td></tr>`)
 const bridgeRows=Object.entries(dcf.bridge??{}).map(([key,item])=>`<tr><td>${escape(LABELS[key]??key)}</td><td>${escape(item.factId)}</td><td>${escape(formatted(item))}</td></tr>`)
 const returnRows=dcf.currentPrice?`<p>已登记价格：${escape(perShare(dcf.currentPrice.value))}，时点 ${escape(dcf.currentPrice.asOf)}。模型值相对该价格的差异：${scenarios.map(s=>`${escape(labels[s.id]??s.id)} ${escape(percent(s.priceReturn))}`).join('；')}。该差异为情景算术结果，不是收益承诺。</p>`:''
 return `<section><h2>情景估值</h2><p>${escape(dcf.timingNote??'FCFF 测算采用固定完整年期，不对应当前交易日目标价。')}假设、金融业务口径与股本仍需研究复核。</p>${table(['情景','WACC','永续增长','企业价值','股权价值','模型值'],rs)}${returnRows}<h3>手工预测假设</h3>${table(['情景','研究假设','未来完整年度FCFF'],assumptions)}<h3>企业价值到股权价值</h3><p class="small">股权价值 = 企业价值 + 货币资金 − 有息债务 + 非经营资产 − 少数股东权益；每股值再除以总股本。价值桥基期为 ${escape(dcf.financialAsOf)}，${escape(dcf.scope)}口径。</p>${table(['价值桥项目','已核对事实ID','数值'],bridgeRows)}<p class="small">各情景未舍入结果和公式保存在 calculations.json；没有自动投资评级。</p></section>`
}

export function renderReport(packet,validation,calculation){
 const errors=validateReport(packet,validation,calculation)
 if(errors.length)throw Object.assign(Error('报告校验未通过'),{diagnostics:errors})
 const values=items(validation,calculation),facts=(validation.facts??[]).filter(f=>f.status==='verified'),report=packet.report??{}
 const title=report.title?tokenValueFree(report.title,packet,values):`${packet.company.name}研究报告`
 const summary=(report.summary??[]).map(p=>paragraph(p,packet,values)).join('')||'<p>请结合下方事实与计算结果形成研究判断，补充支持证据、反证和下次观察条件。</p>'
 const sections=(report.sections??[]).map(s=>structuredSection(s,packet,values)).join(''),coverage=reportCoverage(report)
 const scopeLabel=coverage.profile==='full'?(coverage.hasGaps?'研究稿 · 存在资料缺口':'完整研究稿 · 需复核'):'财报简析 · 非完整研究'
 const observationRows=(validation.observations??[]).filter(o=>o.status==='verified').map((o,i)=>`<tr><td title="${escape(o.id)}">O${String(i+1).padStart(2,'0')}<small class="screen-only">${escape(o.id)}</small></td><td>${escape(o.quote)}</td><td><a href="#source-${escape(o.sourceId)}">[${packet.sources.findIndex(s=>s.id===o.sourceId)+1}]</a><small>${escape(o.locator.page?'PDF页 '+o.locator.page:'行 '+o.locator.lineStart)}</small></td></tr>`)
 const factRows=facts.map(f=>`<tr><td>${escape(LABELS[f.metric]??f.metric)}<small>${escape(f.id)}</small></td><td>${escape(f.period)}<small>${escape(f.scope)}</small></td><td class="number">${escape(formatted(values.get(f.id)))}</td><td><a href="#source-${escape(f.sourceId)}">${escape(f.sourceId)}</a><small>${escape(f.evidence?.locator?.page?'PDF页 '+f.evidence.locator.page:'行 '+f.evidence?.locator?.lineStart)}${f.evidence?.locator?.column?' / 列 '+escape(f.evidence.locator.column):''}</small></td></tr>`)
 const calcRows=(calculation.calculations??[]).map(c=>{const names=(c.inputs??[]).map(id=>{const v=values.get(id);return LABELS[v?.metric]??v?.label??id}),label=c.label??({yoy:names[0]+'同比',grossProfit:'毛利润',grossMargin:'毛利率',ratio:names.join(' / '),difference:names.join(' 减 '),sum:names.join(' + ')}[c.op]??c.id);return `<tr><td>${escape(label)}<small>${escape(c.period)} · ${escape(c.id)}</small></td><td>${escape({yoy:'同比',grossProfit:'收入减成本',grossMargin:'毛利 / 收入',ratio:'比例',difference:'差额',sum:'合计'}[c.op]??c.op)}</td><td>${escape((c.inputs??[]).join(' → '))}</td><td class="number">${escape(formatted(c))}</td></tr>`})
 const sourceRows=(packet.sources??[]).map((s,i)=>{const url=safeUrl(s.url);return `<tr id="source-${escape(s.id)}"><td>[${i+1}]<small>${escape(s.id)}</small></td><td>${escape(s.title)}<small>${escape(s.publisher??'')} · ${escape(s.kind)}</small>${url?`<a href="${escape(url)}" target="_blank" rel="noreferrer noopener">原始来源</a>`:''}</td><td>${escape(s.publishedAt??'未登记')}<small>访问：${escape(s.accessedAt??'未登记')}</small></td></tr>`})
 const diagnostics=[...new Set([...(validation.diagnostics??[]),...(calculation.diagnostics??[])].map(d=>d.message))].map(message=>`<li>${escape(message)}</li>`).join('')
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>${escape(title)}</title><style>
:root{--navy:${EFUND.navy};--blue:${EFUND.blue};--cyan:${EFUND.cyan};--title:${EFUND.title};--pale:${EFUND.pale};--ink:${EFUND.ink};--muted:${EFUND.muted};--line:${EFUND.line};--yellow:${EFUND.yellow}}*{box-sizing:border-box}body{margin:0;background:#f5f7f8;color:var(--ink);font:16px/1.85 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}main{max-width:1040px;margin:36px auto;padding:52px 60px;background:white;border-top:7px solid var(--navy)}h1,h2,h3{color:var(--navy);line-height:1.4}h1{font-size:34px;margin:20px 0}h2{font-size:23px;border-bottom:2px solid var(--cyan);padding-bottom:8px;margin:38px 0 16px}p{margin:12px 0}a{color:var(--blue);overflow-wrap:anywhere}.meta,.small,small{font-size:12px;color:#657985}small{display:block}.meta{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}.summary{border-left:4px solid var(--cyan);padding:6px 22px;background:#eef9fd}.summary p{margin:10px 0}.citation{font-size:11px;vertical-align:super;margin-left:7px;white-space:normal}.synthetic,.note{background:#fff8dc;border-left:4px solid var(--yellow);padding:12px 18px;margin:20px 0}.note{background:#eef9fd;border-left-color:var(--cyan);font-size:14px}table{border-collapse:collapse;width:100%;font-size:13px;line-height:1.65;margin:18px 0}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:11px 10px;overflow-wrap:anywhere}th{color:white;background:var(--navy)}tr:nth-child(even){background:#f6f9fb}.number{font-variant-numeric:tabular-nums;white-space:nowrap}.table-wrap{overflow-x:auto}figure{margin:26px 0;padding:18px 16px;border:1px solid #e0e8ed}figcaption{color:var(--navy);font-weight:600}svg{width:100%;height:auto}svg text{font:12px sans-serif;fill:var(--ink)}footer{margin-top:40px;border-top:1px solid var(--line);padding-top:18px;font-size:12px;color:#657985}li{margin:8px 0}.legend{display:flex;gap:16px;font-size:12px;margin:10px 0}.legend span{padding-left:6px}.thesis{border:1px solid #deebf2;padding:14px 20px;margin:14px 0}.thesis>p{font-weight:600;color:var(--navy)}dl{display:grid;grid-template-columns:5em 1fr;gap:7px 12px;font-size:14px}dt{color:var(--blue);font-weight:600}dd{margin:0}dd p,td p{margin:0}h3,figcaption{break-after:avoid}td{min-width:0}@media(max-width:700px){main{padding:26px 20px;margin:0}h1{font-size:27px}table{font-size:12px}.number{white-space:normal}}@page{size:A4;margin:16mm 15mm}@media print{body{background:white;font-size:11pt}main{margin:0;padding:0;max-width:none;border-top-width:4px}h1{font-size:24pt}h2{font-size:15pt;break-after:avoid}h3{font-size:12pt}.thesis{padding:8px 12px}dl{font-size:9pt}table p{font-size:inherit}figure{padding:10px 12px}figure svg{display:block;max-height:60mm}.section-heading{break-inside:avoid;break-after:avoid}h2+.small{break-after:avoid}.gap,.thesis,.compact{break-inside:avoid}.screen-only{display:none}table{border-collapse:separate;border-spacing:0}thead{break-inside:avoid;break-after:avoid}th{print-color-adjust:exact;-webkit-print-color-adjust:exact}.observations table{table-layout:fixed}.observations th:nth-child(1){width:12%}.observations th:nth-child(2){width:74%}.observations th:nth-child(3){width:14%}h1,h2,h3{break-inside:avoid}p{orphans:3;widows:3}thead{display:table-header-group}tr,figure{break-inside:avoid}.table-wrap{overflow:visible}table{font-size:8.5pt}a{text-decoration:none}.number{white-space:normal}footer{font-size:8pt}.summary{padding:4px 12px}}
</style></head><body><main><div class="meta"><span>EWork Odyssey · 研报写作</span><span>${scopeLabel}</span></div>${packet.synthetic?'<div class="synthetic"><strong>虚构数据演示</strong>：仅用于检查研究流程，不代表真实上市公司或行情。</div>':''}<h1>${escape(title)}</h1><div class="meta"><span>${escape(packet.company.name)} · ${escape(packet.company.ticker)}</span><span>研究截止 ${escape(packet.asOf)} / 财务基期 ${escape(packet.financialAsOf)}</span></div><section><h2>研究判断</h2><div class="summary">${summary}</div></section>${thesisSection(report,packet,values)}${coverage.profile==='brief'?historyChart(facts,packet,values):''}${sections}<section><h2>财务事实与证据</h2><p class="small">快照及字段核对通过；外部真实性未认证。PDF提取与关键行列仍应回到原件复核。</p>${table(['指标 / 事实ID','期间 / 范围','原始事实换算展示','来源 / 定位'],factRows)}</section>${calcRows.length?`<section><h2>确定性计算</h2>${table(['计算ID','运算','输入引用','结果'],calcRows)}<p class="small">金额、比例和同比由程序计算；展示舍入与未舍入结果分开保存。</p></section>`:''}${dcfSection(calculation.dcf)}${observationRows.length?`<section class="observations"><h2>披露原文与研究观察</h2><p class="small">逐字快照摘录；用于支持研究判断，不作为确定性数值事实或计算输入。</p>${table(['观察ID','原文摘录','来源 / 定位'],observationRows)}</section>`:''}<section><h2>来源台账</h2>${table(['来源编号','原始资料','发布日期 / 访问时点'],sourceRows)}</section><section><h2>假设、局限与待复核</h2><ul><li>快照一致性和字段匹配不能证明外部来源真实、完整或当前有效。</li><li>定量文字使用事实/计算引用；自然语言数量词和因果判断仍需人工复核。</li><li>未提供经核对的现价时，不生成现价估值或投资评级；历史数据不冒充当前数据。</li>${diagnostics}</ul><p class="small"><a href="evidence.json">证据台账</a> · <a href="calculations.json">计算结果</a> · <a href="validation.json">校验记录</a> · <a href="run.json">运行记录</a></p></section><footer>本报告供研究与复核使用，不构成投资建议。公司披露、程序推导和研究假设应分别理解；没有证券研究员专业签发。易方达配色仅为视觉规范，不能代表公司或原始来源认可报告结论。</footer></main></body></html>`.replace(/(<h2>[\s\S]*?<\/h2>)((?:<(?:p|div) class="small">[\s\S]*?<\/(?:p|div)>))?/g,'<div class="section-heading">$1$2</div>')
}
function tokenValueFree(text,packet,values){return text.replace(/\{\{([^{}]+)\}\}/g,(_all,token)=>tokenValue(token,packet,values))}
