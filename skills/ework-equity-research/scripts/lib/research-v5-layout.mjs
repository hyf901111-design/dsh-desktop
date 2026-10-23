import {decimal,formatDecimal} from './numbers.mjs'

// This module consumes calculated results. Decimal operations below only scale
// labels and locate SVG geometry; no forecast or valuation is recalculated here.
const CASES={bear:'保守',base:'基准',bull:'乐观'}
const KINDS={reported:'公司披露',calculated:'程序计算',assumption:'研究假设','derived-proxy':'代理推导'}
const units={CNY:'亿元',CNY_per_share:'元/股',ratio:'%',shares:'股',index:'价格指数',number:'',multiple:'倍',days:'天',years:'年',percentage_points:'个百分点'}
const cell=(value,unit='number')=>({value,unit})
const refsOf=(...items)=>[...new Set(items.flat(Infinity).filter(Boolean))]
const note=(text,refs=[])=>({type:'note',text,refs})
const table=(title,headers,rows,refs=[],meta='')=>({type:'table',title,headers,rows,refs,meta})
const chart=(title,kind,series,labels,refs=[],meta='')=>({type:'chart',title,kind,series,labels,refs,meta})
const section=(anchor,title,nodes)=>({anchor,title,nodes:nodes.filter(Boolean)})
const chunks=(rows,size)=>Array.from({length:Math.ceil(rows.length/size)},(_,i)=>rows.slice(i*size,(i+1)*size))
const forecastGroups=rows=>{
 if(!rows.length)return []
 const count=Math.ceil(rows.length/3),size=Math.floor(rows.length/count),extra=rows.length%count;let offset=0
 return Array.from({length:count},(_,i)=>{const length=size+(i<extra?1:0),group=rows.slice(offset,offset+length);offset+=length;return group})
}
const bridgeKey=i=>'B'+String(i+1).padStart(2,'0')
const available=value=>typeof value==='string'
const modelOK=model=>model?.status==='calculated'
const amount=value=>cell(value,'CNY')
const ratio=value=>cell(value,'ratio')
const perShare=value=>cell(value,'CNY_per_share')
const scenarioName=scenario=>CASES[scenario.id]??scenario.id
const FORECAST_FIELDS=[['收入增长率','revenueGrowth','ratio'],['销量增长率','volumeGrowth','ratio'],['价格与结构增长率','priceMixGrowth','ratio'],['营业收入','revenue','CNY'],['EBIT利润率','ebitMargin','ratio'],['EBIT','ebit','CNY'],['税率','tax','ratio'],['税后经营利润NOPAT','nopat','CNY'],['折旧与摊销','da','CNY'],['折旧摊销率','daRatio','ratio'],['资本开支','capex','CNY'],['资本开支率','capexRatio','ratio'],['营运资本余额','nwc','CNY'],['营运资本率','nwcRatio','ratio'],['营运资本增量','deltaNWC','CNY'],['企业FCFF','fcff','CNY'],['归属FCFF','fcffOwners','CNY']]

function marketPlan(market){
 if(!modelOK(market)||!market.rows?.length)return []
 const rows=market.rows,monthly=market.monthly?.length?market.monthly:rows,refs=market.sourceRefs??[]
 const nodes=[note(`行情与估值基准日：${market.valuationAsOf}；一年窗口：${market.windowStart} 至 ${market.windowEnd}。起点 = 100，个股与${market.benchmark?.name??'登记基准'}使用共同交易日；未复权价格回报不等于含息总回报。`,refs),chart('一年股价与基准表现','line',[{name:'公司股价',unit:'index',values:rows.map(r=>r.stockNormalized100)},{name:market.benchmark?.name??'市场基准',unit:'index',values:rows.map(r=>r.benchmarkNormalized100)}],rows.map(r=>r.date),refs,'起点 = 100 · 共同交易日价格指数 · 纵轴范围见刻度'),table('一年市场表现与回报口径',['项目','程序结果'],[['个股价格回报',ratio(market.stockReturn)],['基准价格回报',ratio(market.benchmarkReturn)],['超额百分点',cell(market.excessPercentagePoints,'percentage_points')],['相对价格回报',ratio(market.relativeReturn)],['共同交易日',cell(String(market.coverage?.commonTradingDays??''),'days')],...Object.entries(market.statistics??{}).filter(([,value])=>available(value)).map(([name,value])=>[({beta:'Beta',rSquared:'R²'}[name]??name),cell(value)])],refs,'价格回报、百分点差与相对回报分别列示，不互相替代。'),table('一年走势月度核对明细',['日期','个股价格','基准点位','个股归一指数','基准归一指数'],monthly.map(r=>[r.date,perShare(r.stock),cell(r.benchmark),cell(r.stockNormalized100,'index'),cell(r.benchmarkNormalized100,'index')]),refsOf(refs,monthly.flatMap(r=>refsOf(r.stockRefs,r.benchmarkRefs))),'完整共同交易日数据保存在 calculations.json；本表列模型选定月度节点。')]
 if(market.dividends?.length)nodes.push(table('窗口内现金分红披露',['日期','每股现金金额'],market.dividends.map(r=>[r.date,perShare(r.amount)]),refsOf(market.dividends.flatMap(r=>r.sourceRefs)), '未将现金股息加回未复权价格指数。'))
 nodes.push(...(market.limitations??[]).map(text=>note(text,refs)))
 return [section('section-market-year','一年股价与基准表现',nodes)]
}
function quarterlyPlan(quarterly){
 if(!modelOK(quarterly)||!quarterly.quarters?.length)return []
 const rows=quarterly.quarters,refs=quarterly.sourceRefs??[],labels=rows.map(r=>r.period)
 return [section('section-quarterly-actuals','连续季度披露实绩',[
  note(`最新已披露季度：${quarterly.latest}。各期为独立季度实绩；累计披露拆分后的结果仍保留原始引用，不作年度预测。`,refs),
  note(`披露检索截至 ${quarterly.disclosureSearch?.asOf??'未登记'}：${quarterly.disclosureSearch?.note??'检索范围以证据台账为准。'}`,quarterly.disclosureSearch?.refs??[]),
  chart('季度营业收入与同比','combo',[{name:'营业收入',unit:'CNY',values:rows.map(r=>r.revenue)},{name:'营业收入同比',unit:'ratio',values:rows.map(r=>r.revenueYoY),right:true}],labels,refs,'左轴：亿元 · 右轴：同比% · 独立季度'),
  chart('季度归母净利润与同比','combo',[{name:'归母净利润',unit:'CNY',values:rows.map(r=>r.parentNetIncome)},{name:'归母净利润同比',unit:'ratio',values:rows.map(r=>r.parentNetIncomeYoY),right:true}],labels,refs,'左轴：亿元 · 右轴：同比% · 独立季度'),
  table('连续季度已披露实绩明细',['季度','营业收入','归母净利润','经营现金流','收入同比','归母同比'],rows.map(r=>[r.period,amount(r.revenue),amount(r.parentNetIncome),amount(r.operatingCashFlow),ratio(r.revenueYoY),ratio(r.parentNetIncomeYoY)]),refsOf(refs,rows.flatMap(r=>r.sourceRefs)),'“—”表示未提供经核验结果，不代表零；季度与半年度、年度累计口径分开。')
 ])]
}
function dcfPlan(dcf){
 if(dcf?.method!=='driver-fcff-v2'||!modelOK(dcf))return []
 const scenarios=(dcf.scenarios??[]).filter(modelOK),allRefs=refsOf(scenarios.flatMap(s=>s.sourceRefs),dcf.wacc?.sourceRefs,dcf.currentPrice?.sourceRefs,dcf.shares?.sourceRefs)
 const summary=[note(`财务披露基期：${dcf.financialAsOf}；估值基准日：${dcf.valuationAsOf}；研究截止日：${dcf.asOf}。经营预测、估值参数与已披露实绩分别列示。`,allRefs),table('情景估值结果',['情景','企业价值','归属经营价值','权益价值','每股模型值','相对登记价格'],scenarios.map(s=>[scenarioName(s),amount(s.enterpriseValue),amount(s.ownersOperatingValue),amount(s.equityValue),perShare(s.perShareValue),ratio(s.priceReturn)]),allRefs)]
 if(dcf.currentPrice)summary.push(note(`经核验价格：${displayValue(perShare(dcf.currentPrice.value))}，时点 ${dcf.currentPrice.asOf}。价格差异为模型情景算术结果，不是目标回报承诺；不自动生成评级。`,dcf.currentPrice.sourceRefs))
 if(dcf.shares)summary.push(note(`估值采用股本：${displayValue(cell(dcf.shares.value,'shares'))}；生效核对时点 ${dcf.shares.asOf}。股本时点与财务披露基期分别核对。`,dcf.shares.sourceRefs))
 summary.push(...(dcf.limitations??[]).map(text=>note(text,allRefs)))
 const reasons=[...new Set((dcf.assumptions??[]).map(a=>a.reason??''))],reasonKey=reason=>'R'+String(reasons.indexOf(reason)+1).padStart(2,'0')
 const assumptionRefs=refsOf((dcf.assumptions??[]).flatMap(a=>a.refs))
 const wacc=dcf.wacc??{},assumptions=[note('经营驱动、折现参数及价值调整按证据属性区分。代理推导与研究假设不冒充公司披露。相同理由以索引引用，下表保留全部研究依据原文。',allRefs),table('经营与估值研究假设',['参数','数值','属性','依据索引 / 时点'],(dcf.assumptions??[]).map(a=>[a.label??a.id,cell(a.value,a.unit),KINDS[a.kind]??a.kind,`${reasonKey(a.reason??'')}${a.asOf?' · '+a.asOf:''}`]),assumptionRefs),...(reasons.length?[table('研究依据全文索引',['索引','完整研究依据'],reasons.map(reason=>[reasonKey(reason),reason]),assumptionRefs,'同一理由仅完整列示一次，逐参数索引与时点见上表；不截断原文。')]:[]),table('WACC参数与折现口径',['参数','数值'],[['无风险利率',ratio(wacc.riskFree)],['Beta',cell(wacc.beta,'multiple')],['权益风险溢价',ratio(wacc.erp)],['债务权重',ratio(wacc.debtWeight)],['税前债务成本',ratio(wacc.debtCost)],['税率',ratio(wacc.tax)],['WACC',ratio(wacc.value)]],wacc.sourceRefs??[]),note(wacc.formula??'WACC公式以计算结果为准。',wacc.sourceRefs??[])]
 const forecasts=[],discounts=[],bridges=[]
 for(const s of scenarios){
  const name=scenarioName(s),rows=s.forecastRows??[],refs=refsOf(s.sourceRefs,rows.flatMap(r=>r.sourceRefs))
  forecasts.push(note(`${name}情景：${s.reason??''}`,refs))
  if(s.h2){const h=s.h2;forecasts.push(table(`${name}情景剩余披露区间与估值日拆分`,['项目','模型结果'],[['期间 / 期末',`${h.period??'财务期至年末未披露区间'} / ${h.end??'见模型年末'}`],['已披露累计FCFF',amount(h.h1FCFF)],['剩余披露区间FCFF',amount(h.fcff)],['剩余区间归属FCFF',amount(h.fcffOwners)],['已过区间天数',cell(String(h.elapsedDays),'days')],['未来余期天数',cell(String(h.remainingDays),'days')],['完整区间天数',cell(String(h.totalDays),'days')],['已过区间现金积累',amount(h.elapsedCashAccumulation)],['未来余期现金流',amount(h.remainingStubCashFlow)],['剩余区间收入',amount(h.revenue)],['剩余区间NOPAT',amount(h.nopat)],['剩余区间折旧摊销',amount(h.da)],['剩余区间资本开支',amount(h.capex)],['剩余区间营运资本增量',amount(h.deltaNWC)]],h.sourceRefs??refs,'已过区间进入现金桥，未来余期才折现；全年预测不与余期混为同频实绩。'))}
  if(rows.length)forecasts.push(chart(`${name}情景FCFF驱动结果`,'line',[{name:'企业FCFF',unit:'CNY',values:rows.map(r=>r.fcff)},{name:'归属FCFF',unit:'CNY',values:rows.map(r=>r.fcffOwners)}],rows.map(r=>r.period),refs,'单位：亿元 · 情景预测，非公司盈利指引'))
  for(const group of forecastGroups(rows))forecasts.push(table(`${name}情景经营与FCFF预测 · ${group.length===1?group[0].period:group[0].period+'—'+group.at(-1).period}`,['指标 / 单位',...group.map(r=>r.period)],FORECAST_FIELDS.map(([label,key,unit])=>[`${label}（${units[unit]??unit}）`,...group.map(r=>cell(r[key],unit))]),refs,'预测值为模型计算结果；规模、利润率、税率、再投资与归属口径逐项保留。'))
  const discount=s.discountRows??[]
  if(discount.length){discounts.push(chart(`${name}情景现金流与折现现值`,'bar',[{name:'未折现现金流',unit:'CNY',values:discount.map(r=>r.cashFlow)},{name:'现金流现值',unit:'CNY',values:discount.map(r=>r.presentValue)}],discount.map(r=>r.period),refsOf(s.sourceRefs,discount.flatMap(r=>r.sourceRefs)),'单位：亿元 · 估值日与现金流期末之间的实际折现时长'),table(`${name}情景折现明细`,['期间 / 期末','天数','折现年限','折现系数','现金流','现值'],discount.map(r=>[`${r.period} / ${r.end}`,cell(String(r.days),'days'),cell(r.timeYears,'years'),cell(r.discountFactor),amount(r.cashFlow),amount(r.presentValue)]),refsOf(s.sourceRefs,discount.flatMap(r=>r.sourceRefs)),'天数、年限、系数及现值直接取自同次计算；未按完整整数年重算。'))}
  const bridge=s.bridgeRows??[]
  if(bridge.length)bridges.push({...chart(`${name}情景归属权益价值桥`,'value-bridge',[],[],refsOf(s.sourceRefs,bridge.flatMap(r=>r.sourceRefs)),'金额桥从零原点开始；B序号对应下方完整明细，小额调整保留真实标记与金额。'),bridge,equityValue:s.equityValue},table(`${name}情景归属权益桥明细`,['序号 / 价值项目','有符号金额','属性'],[...bridge.map((r,i)=>[bridgeKey(i)+' · '+r.label,amount(r.value),KINDS[r.kind]??r.kind]),['合计 · 权益价值',amount(s.equityValue),'程序计算']],refsOf(s.sourceRefs,bridge.flatMap(r=>r.sourceRefs)),'各行按模型给定符号列示；最终端点直接取模型权益价值，不在展示层重新求值。'))
 }
 const terminals=[chart('显性期与终值现值构成','bar',[{name:'显性期FCFF现值',unit:'CNY',values:scenarios.map(s=>s.presentFCFF)},{name:'终值现值',unit:'CNY',values:scenarios.map(s=>s.terminal?.presentValue)}],scenarios.map(scenarioName),allRefs,'单位：亿元 · 两项均来自模型现值结果'),table('终值与企业价值构成',['项目',...scenarios.map(scenarioName)],[['WACC',...scenarios.map(s=>ratio(s.wacc))],['永续增长率',...scenarios.map(s=>ratio(s.terminalGrowth))],['终值ROIC',...scenarios.map(s=>ratio(s.terminalROIC))],['终值下期NOPAT',...scenarios.map(s=>amount(s.terminal?.nextNOPAT))],['终值再投资率',...scenarios.map(s=>ratio(s.terminal?.reinvestmentRate))],['终值再投资额',...scenarios.map(s=>amount(s.terminal?.reinvestment))],['终值自由现金流',...scenarios.map(s=>amount(s.terminal?.fcff))],['未折现终值',...scenarios.map(s=>amount(s.terminal?.undiscounted))],['显性期FCFF现值',...scenarios.map(s=>amount(s.presentFCFF))],['终值现值',...scenarios.map(s=>amount(s.terminal?.presentValue))],['企业价值',...scenarios.map(s=>amount(s.enterpriseValue))],['终值占企业价值',...scenarios.map(s=>ratio(s.terminal?.valueShare))]],refsOf(allRefs,scenarios.flatMap(s=>s.terminal?.sourceRefs??[])),'终值贡献较高意味着模型更依赖长期增长与资本回报假设，不能仅凭精细预测表降低不确定性。')]
 const sensitivities=[],sensitivity=dcf.sensitivities??{},wg=sensitivity.waccGrowth
 if(wg?.rows?.length&&wg.growthRates?.length){
  const refs=refsOf(wg.rows.flatMap(r=>r.sourceRefs))
  sensitivities.push({...chart('WACC与永续增长敏感性','heatmap',[],[],refs,'单元格：元/股 · 固定其余模型条件'),matrix:wg})
  for(const indices of chunks(wg.growthRates.map((_,i)=>i),5))sensitivities.push(table('WACC与永续增长敏感性明细',['WACC / 永续增长',...indices.map(i=>displayValue(ratio(wg.growthRates[i])))],wg.rows.map(r=>[ratio(r.wacc),...indices.map(i=>perShare(r.perShareValues[i]))]),refs,'每格为模型独立计算结果；WACC须高于永续增长率。'))
 }
 for(const[key,title,xField,xUnit]of[['beta','Beta敏感性','beta','multiple'],['cash','现金调整敏感性','cashShift','CNY'],['financialPB','金融资产PB敏感性','multiple','multiple']]){
  const rows=[...(sensitivity[key]??[])].sort((a,b)=>decimal(a[xField]).cmp(b[xField]));if(!rows.length)continue
  const refs=refsOf(rows.flatMap(r=>r.sourceRefs))
  sensitivities.push({...chart(title,'line',[{name:'每股模型值',unit:'CNY_per_share',values:rows.map(r=>r.perShareValue)}],rows.map(r=>displayValue(cell(r[xField],xUnit))),refs,'纵轴：元/股 · 横轴按真实参数间距 · 固定其余模型条件'),xValues:rows.map(r=>r[xField])},table(title+'明细',[title.replace('敏感性',''),...(key==='beta'?['对应WACC']:[]),'每股模型值'],rows.map(r=>[cell(r[xField],xUnit),...(key==='beta'?[ratio(r.wacc)]:[]),perShare(r.perShareValue)]),refs))
 }
 const reverse=sensitivity.reverseGrowth,reverseNodes=[]
 if(reverse?.status==='calculated'&&available(reverse.constantRevenueGrowth??reverse.value)){
  reverseNodes.push(note('现价隐含增长为固定其他条件后的受控反解，非一致预期；不证明市场实际采用该假设。',reverse.sourceRefs??[]),table('受控反向增长求解',['项目','结果'],[['现价隐含常量收入增长',ratio(reverse.constantRevenueGrowth??reverse.value)],['求解下界',ratio(reverse.lowerGrowth)],['求解上界',ratio(reverse.upperGrowth)],['模型每股值',perShare(reverse.perShareValue)],['已核验价格',perShare(reverse.price)],['单股估值残差',cell(reverse.residualPerShare,'exact_per_share')],['迭代次数',cell(String(reverse.iterations),'integer')]],reverse.sourceRefs??[]),note(reverse.fixedAssumptions??'其余固定假设见计算结果。',reverse.sourceRefs??[]))
 }else reverseNodes.push(note(reverse?.reason??'本次未提供受控反向增长求解结果，不推定当前价格隐含的增长率。',reverse?.sourceRefs??[]))
 return [section('section-dcf-summary','驱动式DCF情景估值',summary),section('section-dcf-assumptions','研究假设与WACC参数',assumptions),section('section-dcf-forecast','经营驱动与FCFF预测',forecasts),section('section-dcf-discount','实际年限折现与现值',discounts),section('section-dcf-terminal','终值与企业价值构成',terminals),section('section-dcf-owner-bridge','归属经营价值与权益桥',bridges),...(sensitivities.length?[section('section-dcf-sensitivity','估值敏感性与参数边界',sensitivities)]:[]),section('section-dcf-reverse','反向估值与价格隐含条件',reverseNodes)]
}
export function researchV5Plan(calculation={}){
 return [...marketPlan(calculation.market),...quarterlyPlan(calculation.quarterly),...dcfPlan(calculation.dcf)]
}
export function researchV5TargetCount(calculation){
 return researchV5Plan(calculation).reduce((count,s)=>count+1+s.nodes.filter(n=>n.type==='chart'||n.type==='table').length,0)
}
function displayValue(item){
 if(!item||!available(item.value)||item.value==='')return '—'
 const value=decimal(item.value),unit=item.unit??'number'
 if(unit==='CNY'){
  const absolute=value.cmp('0')<0?value.mul('-1'):value
  return absolute.cmp('0')>0&&absolute.cmp('1000000')<0?formatDecimal(item.value,{scale:'10000'})+' 万元':formatDecimal(item.value,{scale:'100000000'})+' 亿元'
 }
 if(unit==='ratio')return value.mul('100').toString(2,true)+'%'
 if(unit==='exact_per_share')return value.toString(24)+' 元/股'
 const places=['days','shares','integer'].includes(unit)?0:unit==='years'?4:2
 return value.toString(places,true)+(units[unit]?' '+units[unit]:'')
}
function axisText(value,unit){
 const text=unit==='CNY'?formatDecimal(value,{scale:'100000000'}):unit==='ratio'?decimal(value).mul('100').toString(1,true):decimal(value).toString(2,true)
 const sign=text.startsWith('-')?'-':'',whole=text.replace(/^-/,'').split('.')[0]
 return whole.length>10?sign+whole[0]+'.'+whole.slice(1,3)+'×10^'+(whole.length-1):text
}
function domain(values,{focus=false}={}){
 const valid=values.filter(available).map(decimal);let min=focus&&valid.length?valid[0]:decimal('0'),max=min
 for(const value of valid){if(value.cmp(min)<0)min=value;if(value.cmp(max)>0)max=value}
 if(max.cmp(min)===0)max=max.add('1')
 if(focus){const pad=max.sub(min).div('10');min=min.sub(pad);max=max.add(pad)}
 return {min,max}
}
const at=(value,d,top,bottom)=>bottom-Number(decimal(value).sub(d.min).div(d.max.sub(d.min)).toString(12))*(bottom-top)
function axes(d,{e,x0,x1,top,bottom,unit,right=false}){
 let html=''
 for(let i=0;i<=4;i++){
  const value=d.min.add(d.max.sub(d.min).mul(String(i)).div('4')),y=at(value,d,top,bottom)
  html+=`${right?'':`<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="#E1E9EE"/>`}<text x="${right?x1+9:x0-8}" y="${y+4}" text-anchor="${right?'start':'end'}" class="axis-tick">${e(axisText(value.toString(),unit))}</text>`
 }
 if(d.min.cmp('0')<=0&&d.max.cmp('0')>=0)html+=`<line class="zero-line" x1="${x0}" x2="${x1}" y1="${at('0',d,top,bottom)}" y2="${at('0',d,top,bottom)}" stroke="#839DAE"/>`
 return html
}
export function coverMarketAvailable(packet,calculation){
 const market=calculation?.market
 return packet.schemaVersion===2&&packet.report?.profile==='full'&&modelOK(market)&&market.coverage?.fullYear===true&&market.rows?.length>=2
}
export function renderMarketCoverThumbnail(market,helpers,index){
 const e=helpers.escape,rows=market.rows,entry=index.chart('一年股价与基准表现（封面）'),colors=['#005096','#1EB9E1']
 const series=[{name:'公司股价',values:rows.map(r=>r.stockNormalized100)},{name:market.benchmark?.name??'市场基准',values:rows.map(r=>r.benchmarkNormalized100)}]
 const d=domain(series.flatMap(s=>s.values),{focus:true}),x0=52,x1=269,top=18,bottom=119,x=i=>x0+i*(x1-x0)/(rows.length-1)
 let svg=axes(d,{e,x0,x1,top,bottom,unit:'index'})
 svg+=series.map((s,j)=>`<polyline points="${s.values.map((value,i)=>x(i)+','+at(value,d,top,bottom)).join(' ')}" fill="none" stroke="${colors[j]}" stroke-width="2"/>`).join('')
 svg+=[...new Set([0,Math.floor((rows.length-1)/2),rows.length-1])].map(i=>`<text x="${x(i)}" y="145" text-anchor="${i===0?'start':i===rows.length-1?'end':'middle'}">${e(rows[i].date.slice(2,7))}</text>`).join('')
 return `<figure class="cover-market-chart" id="${entry.id}" data-publication-kind="figure" data-chart-kind="market-thumbnail"><figcaption>${e(entry.title)}<small>起点 = 100 · 未复权价格</small></figcaption><div class="legend">${series.map((s,i)=>`<span style="border-left:7px solid ${colors[i]}">${e(s.name)}</span>`).join('')}</div><svg viewBox="0 0 280 170" role="img" aria-label="一年股价与基准归一化走势">${svg}</svg>${helpers.sourceNote(market.sourceRefs??[],true)}</figure>`
}
function seriesSvg(node,e){
 const width=760,x0=78,x1=node.kind==='combo'?678:730,top=36,bottom=220,labels=node.labels,left=node.series.filter(s=>!s.right),right=node.series.find(s=>s.right),d=domain(left.flatMap(s=>s.values),{focus:left[0]?.unit==='index'}),rd=right?domain(right.values):null,group=(x1-x0)/Math.max(1,labels.length),xd=node.xValues?domain(node.xValues,{focus:true}):null,x=i=>xd?at(node.xValues[i],xd,x1,x0):x0+(i+.5)*group,colors=['#005096','#1EB9E1','#0078B4','#FFC819']
 let svg=axes(d,{e,x0,x1,top,bottom,unit:left[0]?.unit??'number'});if(rd)svg+=axes(rd,{e,x0,x1,top,bottom,unit:right.unit,right:true})
 for(const[j,s]of node.series.entries()){
  const sd=s.right?rd:d,color=colors[j%colors.length],isLine=node.kind==='line'||s.right,points=s.values.map((v,i)=>available(v)?{v,x:x(i),y:at(v,sd,top,bottom)}:null)
  if(isLine){
   // Missing observations split paths instead of silently joining a data gap.
   let current=[];const paths=[];for(const point of points){if(point)current.push(point);else if(current.length){paths.push(current);current=[]}}if(current.length)paths.push(current)
   svg+=paths.map(path=>`<polyline points="${path.map(p=>p.x+','+p.y).join(' ')}" stroke="${color}" stroke-width="2.5" fill="none"/>`).join('')
   if(labels.length<=14)svg+=points.filter(Boolean).map(p=>`<circle cx="${p.x}" cy="${p.y}" r="3.6" fill="${color}" stroke="white"/><text class="point-value" data-series="${j}" x="${p.x}" y="${node.kind==='line'&&j%2?p.y+18:p.y-9}" text-anchor="middle">${e(axisText(p.v,s.unit))}</text>`).join('')
  }else{
   const bars=node.kind==='combo'?1:left.length,barWidth=Math.min(36,group*.75/bars),offset=node.kind==='combo'?0:(j-(bars-1)/2)*barWidth,zero=at('0',sd,top,bottom)
   svg+=points.filter(Boolean).map(p=>`<rect x="${p.x+offset-barWidth/2}" y="${Math.min(zero,p.y)}" width="${barWidth-2}" height="${Math.abs(zero-p.y)}" fill="${color}"/>${labels.length<=8?`<text x="${p.x+offset}" y="${p.y<=zero?p.y-8:p.y+16}" text-anchor="middle">${e(axisText(p.v,s.unit))}</text>`:''}`).join('')
  }
 }
 const step=Math.max(1,Math.ceil(labels.length/7))
 svg+=labels.map((label,i)=>i%step===0||i===labels.length-1?`<text x="${x(i)}" y="${bottom+27}" text-anchor="middle">${e(label)}</text>`:'').join('')
 return `<div class="legend">${node.series.map((s,i)=>`<span style="border-left:9px solid ${colors[i%colors.length]}">${e(s.name)}${node.kind==='combo'?(s.right?'（右轴）':'（左轴）'):''}</span>`).join('')}</div><svg viewBox="0 0 ${width} 275" role="img" aria-label="${e(node.title)}">${svg}</svg>`
}
function bridgeSvg(node,e){
 const rows=node.bridge??[],columns=[];let current=decimal('0')
 for(const [i,row]of rows.entries()){const before=current;current=current.add(row.value);columns.push({...row,key:bridgeKey(i),from:before.toString(),to:current.toString(),total:row.role==='operating-value'})}
 columns.push({key:'合计',label:'权益价值',value:node.equityValue,from:'0',to:node.equityValue,total:true})
 const d=domain(columns.flatMap(c=>[c.from,c.to])),x0=78,x1=732,top=52,bottom=236,group=(x1-x0)/columns.length,width=Math.min(42,group*.65)
 let svg=axes(d,{e,x0,x1,top,bottom,unit:'CNY'})
 svg+=columns.map((c,i)=>{const x=x0+(i+.5)*group,y1=at(c.total?'0':c.from,d,top,bottom),y2=at(c.to,d,top,bottom),labelY=Math.max(16,Math.min(y1,y2)-9-(i%2)*17),fill=c.total?'#005096':decimal(c.value).cmp('0')>=0?'#1EB9E1':'#FFC819'
  return `<g><title>${e(c.key+' · '+c.label)}</title>${i>0&&!c.total?`<line x1="${x-group+width/2}" x2="${x-width/2}" y1="${y1}" y2="${y1}" stroke="#96AAB6" stroke-dasharray="3 2"/>`:''}<rect x="${x-width/2}" y="${Math.min(y1,y2)}" width="${width}" height="${Math.abs(y2-y1)}" fill="${fill}"/>${Math.abs(y2-y1)<1?`<path class="small-value-marker" d="M${x-4},${y2} l4,-4 l4,4 l-4,4 z" fill="${fill}"/>`:''}<text data-value-key="${e(c.key)}" x="${x}" y="${labelY}" text-anchor="${i===0?'start':'middle'}">${e(displayValue(amount(c.value)))}</text><text data-bridge-key="${e(c.key)}" x="${x}" y="${bottom+24}" text-anchor="middle">${e(c.key)}</text></g>`
 }).join('')
 return `<svg viewBox="0 0 760 315" role="img" aria-label="${e(node.title)}" data-zero-origin="true">${svg}</svg>`
}
function heatmapSvg(node,e){
 const matrix=node.matrix,rows=matrix.rows,cols=matrix.growthRates,d=domain(rows.flatMap(r=>r.perShareValues)),x0=102,y0=54,width=620/cols.length,height=36
 let svg=cols.map((g,i)=>`<text x="${x0+(i+.5)*width}" y="36" text-anchor="middle">g ${e(displayValue(ratio(g)))}</text>`).join('')
 svg+=rows.map((r,i)=>`<text x="90" y="${y0+(i+.65)*height}" text-anchor="end">${e(displayValue(ratio(r.wacc)))}</text>`+r.perShareValues.map((v,j)=>{const opacity=.12+Number(decimal(v).sub(d.min).div(d.max.sub(d.min)).toString(12))*.42;return `<rect x="${x0+j*width}" y="${y0+i*height}" width="${width-2}" height="${height-2}" fill="#1EB9E1" fill-opacity="${opacity}"/><text x="${x0+(j+.5)*width}" y="${y0+(i+.65)*height}" text-anchor="middle">${e(decimal(v).toString(2,true))}</text>`}).join('')).join('')
 return `<svg viewBox="0 0 760 ${y0+rows.length*height+20}" role="img" aria-label="${e(node.title)}">${svg}</svg>`
}
export function renderResearchV5(calculation,helpers,index,{startNumber=0}={}){
 const plan=researchV5Plan(calculation),e=helpers.escape,sourceNote=refs=>helpers.sourceNote(refs,true)
 const renderNode=node=>{
  if(node.type==='note')return `<p class="small model-note">${e(node.text)}</p>${sourceNote(node.refs??[])}`
  if(node.type==='table'){
   const entry=index.table(node.title),body=node.rows.map(row=>'<tr>'+row.map(value=>`<td${value&&typeof value==='object'?' class="number"':''}>${e(value&&typeof value==='object'?displayValue(value):value)}</td>`).join('')+'</tr>')
   return `<div class="numbered-table model-table"><h3 id="${entry.id}" class="table-title" data-publication-kind="table">${e(entry.title)}</h3>${node.meta?`<div class="table-meta">${e(node.meta)}</div>`:''}${helpers.table(node.headers,body)}${sourceNote(node.refs??[])}</div>`
  }
  const entry=index.chart(node.title),svg=node.kind==='value-bridge'?bridgeSvg(node,e):node.kind==='heatmap'?heatmapSvg(node,e):seriesSvg(node,e)
  return `<figure class="wide model-chart" id="${entry.id}" data-publication-kind="figure" data-chart-kind="${node.kind}"><figcaption>${e(entry.title)}<small>${e(node.meta)}</small></figcaption>${svg}${sourceNote(node.refs??[])}</figure>`
 }
 return {sections:plan.map(({anchor,title})=>({anchor,title})),html:plan.map((s,i)=>`<section id="${s.anchor}" class="research-v5-section" data-publication-kind="section"><div class="section-heading"><h2>${startNumber+i+1}. ${e(s.title)}</h2></div>${s.nodes.map(renderNode).join('')}</section>`).join('')}
}
