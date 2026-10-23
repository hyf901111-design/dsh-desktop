import { decimal, formatDecimal } from './numbers.mjs'
import {renderResearchChart} from './charts.mjs'
import {publicationMetadata} from './publication.mjs'
import {createPublicationIndex,renderPublicationCover,renderFinancialStatements,publicationStyles,publicationTargetCount,MAX_PUBLICATION_NAVIGATION_TARGETS} from './publication-layout.mjs'
import {qualityDiagnostics,extraReportRows,visualDiagnostics,reportCoverage,RESEARCH_SECTIONS} from './quality.mjs'
import {renderResearchV5} from './research-v5-layout.mjs'
import {requirementsDiagnostics} from './requirements.mjs'
import {modelValues} from './model-values.mjs'

export const EFUND = Object.freeze({ navy:'#005096',blue:'#0078B4',cyan:'#1EB9E1',title:'#00BEE6',pale:'#B3EBFF',ink:'#3C3C3C',muted:'#969696',line:'#C1C6C8',yellow:'#FFC819' })
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const group = value => {const [a,b]=value.split('.');return a.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(b===undefined?'':'.'+b)}
const LABELS={revenue:'营业收入',totalRevenue:'营业总收入',costOfRevenue:'营业成本',netIncome:'净利润',netIncomeAttributableToParent:'归母净利润',operatingProfit:'营业利润',operatingCashFlow:'经营现金流',capex:'资本开支',fcff:'企业自由现金流',cash:'货币资金',debt:'有息债务',nonOperatingAssets:'非经营资产',minorityInterest:'少数股东权益',shares:'总股本',currentPrice:'经核对价格',grossProfit:'毛利润',grossMargin:'毛利率',assets:'总资产',liabilities:'负债',sellingExpenses:'销售费用',administrativeExpenses:'管理费用',taxesAndSurcharges:'税金及附加',inventory:'存货',contractLiabilities:'合同负债',researchExpenses:'研发费用',financeExpenses:'财务费用',basicEarningsPerShare:'基本每股收益',dilutedEarningsPerShare:'稀释每股收益',netAssetsPerShare:'每股净资产',returnOnEquity:'净资产收益率'}
const diagnostic=(code,path,message)=>({severity:'error',code,path,message})
const successfulCalculations=calculation=>(calculation?.calculations??[]).filter(c=>c?.status==='calculated')
const items=(validation,calculation)=>new Map([
 ...(validation?.facts??[]).filter(f=>f.status==='verified').map(f=>[f.id,{...f,value:f.normalizedValue,unit:f.normalizedUnit}]),
 ...(validation?.observations??[]).filter(o=>o.status==='verified').map(o=>[o.id,{...o,type:'observation'}]),
 ...successfulCalculations(calculation).map(c=>[c.id,c]),
 ...modelValues(calculation)
])
const rows=report=>[...(report?.summary??[]).map((p,i)=>[p,`report.summary[${i}]`]),...(report?.sections??[]).flatMap((s,i)=>[
 [{text:s.title},`report.sections[${i}].title`],...(s.paragraphs??[]).map((p,j)=>[p,`report.sections[${i}].paragraphs[${j}]`])])]
function formatted(item,format='auto') {
 const {value,unit}=item
 if(format==='yi'){if(unit!=='CNY')throw Error('亿元格式仅适用于人民币金额');return group(formatDecimal(value,{scale:'100000000'}))+' 亿元'}
 if(format==='pct'){if(unit!=='ratio')throw Error('百分比格式仅适用于比例');return group(decimal(value).mul('100').toString(2,true))+'%'}
 if(!['auto','raw'].includes(format))throw Error('不支持的展示格式')
 if(format==='raw')return group(decimal(value).toString())+' '+({CNY:'元',shares:'股',CNY_per_share:'元/股',ratio:'倍',percentage_points:'个百分点',index_points:'点'}[unit]??unit)
 if(unit==='CNY')return formatted(item,'yi')
 if(unit==='ratio')return formatted(item,'pct')
 return group(formatDecimal(value,{places:unit==='shares'?0:2}))+' '+({shares:'股',CNY_per_share:'元/股',percentage_points:'个百分点',index_points:'点'}[unit]??unit)
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
 for(const [i,c]of(calculation?.calculations??[]).entries())if(c?.status!=='calculated')ds.push(diagnostic('REPORT_CALCULATION_STATUS',`calculations[${i}]`,'仅成功计算可以进入报告，禁止展示失败或未确认的数值'))
 if(!validation?.ok||!calculation?.ok)ds.push(diagnostic('REPORT_VALIDATION','$','事实或计算校验未通过'))
 if(report.summary!==undefined&&!Array.isArray(report.summary)||report.sections!==undefined&&!Array.isArray(report.sections))return [...ds,diagnostic('REPORT_SCHEMA','report','summary/sections 必须是数组')]
 if((report.summary?.length??0)>30||(report.sections?.length??0)>30)return [...ds,diagnostic('REPORT_SCHEMA','report','报告章节或摘要超出范围')]
 try{publicationMetadata(packet)}catch(error){ds.push(diagnostic('REPORT_PUBLICATION','report.publication',error.message))}
 ds.push(...qualityDiagnostics(report,values),...requirementsDiagnostics(packet,calculation,values))
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
 if(!ds.length&&publicationTargetCount(packet,(validation.facts??[]).filter(f=>f.status==='verified'),values,calculation,(validation.observations??[]).filter(o=>o.status==='verified').length)>MAX_PUBLICATION_NAVIGATION_TARGETS)ds.push(diagnostic('REPORT_PUBLICATION_BUDGET','report','目录与图表总数超过安全排版上限；请拆分研究包或减少重复专题，内容不会被截断。'))
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
function researchChart(chart,packet,values,index,{narrow=false}={}){
 return renderResearchChart(chart,{packet,values,index,narrow,escape,formatted,tokenValueFree,sourceIds,numberedTable,colors:[EFUND.navy,EFUND.cyan,EFUND.blue,EFUND.yellow]})
}
function sourceNote(ids,packet,values,compact=false){
 const sources=[...new Set(ids.flatMap(id=>sourceIds(id,values)))];return sources.length?`<p class="small source-note">来源：${sources.map(id=>`<a href="#source-${escape(id)}" title="${escape(packet.sources.find(s=>s.id===id)?.title??id)}">[${packet.sources.findIndex(s=>s.id===id)+1}] ${compact?'':escape(packet.sources.find(s=>s.id===id)?.title??id)}</a>`).join('；')}${compact?'；快照核对。':'；本次核验快照与确定性换算。'}</p>`:''
}
function textIds(p){return [...(p.refs??[]),...[...(p.text??'').matchAll(/\{\{([^{}]+)\}\}/g)].map(m=>m[1].replace(/^(?:period:|observation:)/,'').split('|')[0])]}
function numberedTable(title,headers,body,index,meta='',source=''){
 const item=index.table(title);return `<div class="numbered-table"><h3 id="${item.id}" class="table-title" data-publication-kind="table">${escape(item.title)}</h3>${meta}${table(headers,body)}${source}</div>`
}
function structuredSection(s,packet,values,index,sectionNumber,anchor){
 const gap=s.gap?`<div class="note gap"><strong>资料缺口：</strong>${paragraph({text:s.gap.missing},packet,values)}<strong>结论影响：</strong>${paragraph({text:s.gap.impact},packet,values)}<strong>补充动作：</strong>${paragraph({text:s.gap.nextStep},packet,values)}</div>`:''
 const tables=(s.tables??[]).map(t=>numberedTable(tokenValueFree(t.title,packet,values),t.columns.map(x=>tokenValueFree(x,packet,values)),t.rows.map(row=>'<tr>'+row.map(cell=>'<td>'+paragraph(cell,packet,values)+'</td>').join('')+'</tr>'),index,`<div class="table-meta">单位、期间及口径以表头与各项目标注为准。</div>`,sourceNote(t.rows.flatMap(row=>row.flatMap(textIds)),packet,values))).join('')
 const charts=(s.charts??[]).map(c=>researchChart(c,packet,values,index)).join('')
 return `<section id="${escape(anchor)}" data-publication-kind="section"><div class="section-heading"><h2>${sectionNumber}. ${escape(tokenValueFree(s.title,packet,values))}</h2>${s.status?`<div class="scope-note">研究范围：${escape(Object.hasOwn(RESEARCH_SECTIONS,s.kind)?RESEARCH_SECTIONS[s.kind]:s.kind)} · ${s.status==='supported'?'已有证据支持':s.status==='partial'?'部分资料已核验':'资料待补充'}</div>`:''}</div>${(s.paragraphs??[]).map(p=>paragraph(p,packet,values)).join('')}${tables}${charts?`<div class="chart-grid${s.charts.length===1?' single':''}">${charts}</div>`:''}${gap}</section>`
}
function thesisSection(report,packet,values){
 return (report.theses??[]).length?`<section id="research-theses"><h2>核心论点与改变判断的条件</h2>${report.theses.map(t=>`<article class="thesis">${paragraph({text:t.statement,refs:t.evidenceRefs},packet,values)}<dl>${[['inference','推论'],['assumption','假设'],['falsifier','反证条件'],['monitoring','下次观察']].map(([key,label])=>`<dt>${label}</dt><dd>${paragraph({text:t[key],refs:key==='inference'?t.evidenceRefs:undefined},packet,values)}</dd>`).join('')}</dl></article>`).join('')}</section>`:''
}
const table=(headers,body)=>`<div class="table-wrap${body.length<=8?' compact':''}"><table><thead><tr>${headers.map(h=>`<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table></div>`
function dcfSection(dcf,index){
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
 return `<section><h2>情景估值</h2><p>${escape(dcf.timingNote??'FCFF 测算采用固定完整年期，不对应当前交易日目标价。')}假设、金融业务口径与股本仍需研究复核。</p>${numberedTable('情景估值结果',['情景','WACC','永续增长','企业价值','股权价值','模型值'],rs,index)}${returnRows}<h3>手工预测假设</h3>${numberedTable('未来现金流假设',['情景','研究假设','未来完整年度FCFF'],assumptions,index)}<h3>企业价值到股权价值</h3><p class="small">股权价值 = 企业价值 + 货币资金 − 有息债务 + 非经营资产 − 少数股东权益；每股值再除以总股本。价值桥基期为 ${escape(dcf.financialAsOf)}，${escape(dcf.scope)}口径。</p>${numberedTable('估值价值桥',['价值桥项目','已核对事实ID','数值'],bridgeRows,index)}<p class="small">各情景未舍入结果和公式保存在 calculations.json；没有自动投资评级。</p></section>`
}

export function renderReport(packet,validation,calculation){
 const errors=validateReport(packet,validation,calculation)
 if(errors.length)throw Object.assign(Error('报告校验未通过'),{diagnostics:errors})
 const values=items(validation,calculation),facts=(validation.facts??[]).filter(f=>f.status==='verified'&&f.scope!=='市场'),report=packet.report??{}
 const title=report.title?tokenValueFree(report.title,packet,values):`${packet.company.name}研究报告`
 const summary=(report.summary??[]).map(p=>{const html=paragraph({...p,refs:[...(p.refs??[]),...textIds({text:p.label??''})]},packet,values);return p.label?html.replace('<p>',`<p><strong class="summary-label">${escape(tokenValueFree(p.label,packet,values))}：</strong>`):html}).join('')||'<p>请结合下方事实与计算结果形成研究判断，补充支持证据、反证和下次观察条件。</p>'
 const coverage=reportCoverage(report,packet,calculation),metadata=publicationMetadata(packet),index=createPublicationIndex(escape)
 const scopeLabel=coverage.profile==='full'?(coverage.hasGaps?'研究稿 · 存在资料缺口':'完整研究稿 · 需复核'):'财报简析 · 非完整研究'
 const helpers={escape,formatted,values,table,financialAsOf:packet.financialAsOf,labels:LABELS,researchChart,sourceNote:(ids,compact)=>sourceNote(ids,packet,values,compact)}
 const cover=renderPublicationCover({packet,metadata,title,coverage,facts,summary,scopeLabel,calculation},helpers,index)
 const sectionEntries=(report.sections??[]).map((s,i,all)=>({...s,anchor:`section-${Object.hasOwn(RESEARCH_SECTIONS,s.kind)&&all.filter(x=>x.kind===s.kind).length===1?s.kind:`analysis-${i+1}`}`}))
 const sections=sectionEntries.map((s,i)=>structuredSection(s,packet,values,index,i+1,s.anchor)).join('')
 const v5=renderResearchV5(calculation,helpers,index,{startNumber:sectionEntries.length})
 const financialStatements=renderFinancialStatements(facts,helpers,index)
 const observationRows=(validation.observations??[]).filter(o=>o.status==='verified').map((o,i)=>`<tr><td title="${escape(o.id)}">O${String(i+1).padStart(2,'0')}<small class="screen-only">${escape(o.id)}</small></td><td>${escape(o.quote)}</td><td><a href="#source-${escape(o.sourceId)}">[${packet.sources.findIndex(s=>s.id===o.sourceId)+1}]</a><small>${escape(o.locator.page?'PDF页 '+o.locator.page:'行 '+o.locator.lineStart)}</small></td></tr>`)
 const factRows=facts.map(f=>`<tr><td>${escape(LABELS[f.metric]??f.metric)}<small>${escape(f.id)}</small></td><td>${escape(f.period)}<small>${escape(f.scope)}</small></td><td class="number">${escape(formatted(values.get(f.id)))}</td><td><a href="#source-${escape(f.sourceId)}">${escape(f.sourceId)}</a><small>${escape(f.evidence?.locator?.page?'PDF页 '+f.evidence.locator.page:'行 '+f.evidence?.locator?.lineStart)}${f.evidence?.locator?.column?' / 列 '+escape(f.evidence.locator.column):''}</small></td></tr>`)
 const calcRows=successfulCalculations(calculation).map(c=>{const names=(c.inputs??[]).map(id=>{const v=values.get(id);return LABELS[v?.metric]??v?.label??id}),label=c.label??({yoy:names[0]+'同比',periodDifference:names[0]+'跨期差额',grossProfit:'毛利润',grossMargin:'毛利率',ratio:names.join(' / '),difference:names.join(' 减 '),sum:names.join(' + ')}[c.op]??c.id);return `<tr><td>${escape(label)}<small>${escape(c.period)} · ${escape(c.id)}</small></td><td>${escape({yoy:'同比',periodDifference:'跨期差额',grossProfit:'收入减成本',grossMargin:'毛利 / 收入',ratio:'比例',difference:'差额',sum:'合计'}[c.op]??c.op)}</td><td>${escape((c.inputs??[]).join(' → '))}</td><td class="number">${escape(formatted(c))}</td></tr>`})
 const sourceRows=(packet.sources??[]).map((s,i)=>{const url=safeUrl(s.url);return `<tr id="source-${escape(s.id)}"><td title="${escape(s.id)}">[${i+1}]<small class="screen-only">${escape(s.id)}</small></td><td>${escape(s.title)}<small>${escape(s.publisher??'')} · ${escape(s.kind)}</small>${url?`<a href="${escape(url)}" target="_blank" rel="noreferrer noopener">原始来源</a>`:''}</td><td>${escape(s.publishedAt??'未登记')}<small>访问：${escape(s.accessedAt??'未登记')}</small></td></tr>`})
 const diagnostics=[...new Set([...(validation.diagnostics??[]),...(calculation.diagnostics??[])].map(d=>d.message))].map(message=>`<li>${escape(message)}</li>`).join('')
 const factTable=numberedTable('财务事实与原始定位',['指标 / 事实ID','期间 / 范围','原始事实换算展示','来源 / 定位'],factRows,index)
 const calculationTable=calcRows.length?numberedTable('确定性计算明细',['计算ID','运算','输入引用','结果'],calcRows,index):''
 const dcf=calculation.dcf?.method==='driver-fcff-v2'?'':dcfSection(calculation.dcf,index)
 const observationTable=observationRows.length?numberedTable('披露原文与研究观察',['观察ID','原文摘录','来源 / 定位'],observationRows,index):''
 const sourceTable=numberedTable('来源台账',['来源编号','原始资料','发布日期 / 访问时点'],sourceRows,index)
 const navigation=index.navigation([...sectionEntries.map(s=>({...s,title:tokenValueFree(s.title,packet,values)})),...v5.sections],!!report.theses?.length)
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="author" content="EWork Odyssey"><link rel="icon" href="data:,"><title>${escape(metadata.reportName)}</title><style>
:root{--navy:${EFUND.navy};--blue:${EFUND.blue};--cyan:${EFUND.cyan};--title:${EFUND.title};--pale:${EFUND.pale};--ink:${EFUND.ink};--muted:${EFUND.muted};--line:${EFUND.line};--yellow:${EFUND.yellow}}${publicationStyles}
</style></head><body><main data-publication-name="${escape(metadata.reportName)}">${cover}${navigation}<div class="body-content">${thesisSection(report,packet,values)}${sections}${v5.html}${financialStatements}<section id="fact-evidence"><div class="section-heading"><h2>附录：财务事实与证据</h2><p class="small">快照及字段核对通过；外部真实性未认证。PDF提取与关键行列仍应回到原件复核。</p></div>${factTable}</section><section id="calculation-evidence"><h2>附录：确定性计算</h2>${calculationTable||'<p>本稿未执行独立计算。</p>'}<p class="small">金额、比例和同比由程序计算；展示舍入与未舍入结果分开保存。</p></section>${dcf}${observationTable?`<section class="observations"><div class="section-heading"><h2>附录：披露原文与研究观察</h2><p class="small">逐字快照摘录；用于支持研究判断，不作为确定性数值事实或计算输入。</p></div>${observationTable}</section>`:''}<section id="source-ledger"><h2>来源台账</h2>${sourceTable}</section><div class="publication-disclosure"><section id="limitations"><h2>假设、局限与待复核</h2><p>本报告由 EWork Odyssey 辅助整理，数值按同次证据与确定性程序处理。研究判断仍需结合原始披露、业务背景与专业复核。</p><ul><li>快照一致性和字段匹配不能证明外部来源真实、完整或当前有效，阅读时应以所列研究截止日、财务期间及报表范围理解数据。</li><li>历史披露与情景假设分别列示；资料缺失和模型未完成的范围已明确说明，不以版式完整替代证据完整。</li><li>定量文字使用事实/计算引用；自然语言数量词和因果判断仍需人工复核。</li><li>未提供经核对的现价时，不生成现价估值或投资评级；历史数据不冒充当前数据。</li>${diagnostics}</ul><p class="small"><a href="evidence.json">证据台账</a> · <a href="calculations.json">计算结果</a> · <a href="validation.json">校验记录</a> · <a href="run.json">运行记录</a></p></section><footer>本报告供研究与复核使用，不构成投资建议。公司披露、程序推导和研究假设应分别理解；没有证券研究员专业签发。易方达配色仅为视觉规范，不能代表公司或原始来源认可报告结论。</footer></div></div></main></body></html>`
}
function tokenValueFree(text,packet,values){return text.replace(/\{\{([^{}]+)\}\}/g,(_all,token)=>tokenValue(token,packet,values))}
