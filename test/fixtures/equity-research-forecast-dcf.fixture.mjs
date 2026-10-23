import {createHash} from 'node:crypto'

// Entirely synthetic; the source can be written into an isolated packet folder
// and passed through the real evidence validator by integration tests.
export function createForecastDcfFixture(){
 const sourceId='synthetic-v5-source',lines=[],facts=[]
 const metricLabels={revenue:'营业收入',operatingProfit:'营业利润',depreciationAmortization:'折旧摊销',capex:'资本开支',tradeNwc:'贸易营运资本',cash:'货币资金',debt:'有息债务',nonOperatingAssets:'非经营资产',minorityInterest:'少数股东权益',shares:'总股本',currentPrice:'收盘价',financialNetAssets:'金融子公司净资产'}
 const add=(id,metric,period,value,unit='CNY',scope='合并')=>{
  const unitText={CNY:'元',shares:'股',CNY_per_share:'元/股'}[unit],label=metricLabels[metric]
  const quote=`${metric==='currentPrice'?'证券代码：SYNTHETIC\n完整收盘\n':''}范围：${scope}\n单位：${unitText}\n指标\t${period}\n${label}\t${value}`
  const lineStart=lines.length+1;lines.push(...quote.split('\n'))
  facts.push({id,metric,period,value,unit,scope,sourceId,...metric==='currentPrice'?{asOf:period+'T15:00:00+08:00',securityId:'SYNTHETIC',marketSession:'close'}:{},evidence:{quote,locator:{lineStart,lineEnd:lines.length,valueLine:lines.length,column:2},metricText:label,periodText:period,scopeText:scope,unitText,valueText:value},status:'verified',normalizedValue:value,normalizedUnit:unit})
 }
 for(const [prefix,period,values]of [['base','FY2025',['1000','200','20','30','100']],['interim','2026H1',['500','100','10','15','110']]])for(const[metric,value]of ['revenue','operatingProfit','depreciationAmortization','capex','tradeNwc'].map((m,i)=>[m,values[i]]))add(prefix+'-'+metric,metric,period,value)
 for(const[id,metric,value]of [['cash','cash','50'],['debt','debt','20'],['assets','nonOperatingAssets','10'],['nci','minorityInterest','0']])add(id,metric,'2026-06-30',value,'CNY',metric==='cash'?'母公司':'合并')
 add('nav','financialNetAssets','2026-06-30','100','CNY','合并')
 add('shares','shares','2026-10-22','10','shares');add('price','currentPrice','2026-10-22','100','CNY_per_share','市场')
 const line=lines.length+1;lines.push('本虚构公司以工业经营为主，金融业务另行按股权价值估值。未来增长、利润率及资本投入均为研究情景假设。')
 const observation={id:'research-basis',sourceId,quote:lines.at(-1),locator:{lineStart:line,lineEnd:line},status:'verified',type:'observation'}
 const parameters=[]
 const p=(id,value,unit='ratio',asOf)=>{parameters.push({id,value,unit,kind:'assumption',reason:'虚构研究情景，非披露事实。',refs:['research-basis'],...asOf?{asOf}:{}});return id}
 const common={volumeGrowthRef:p('volume','0'),priceMixGrowthRef:p('mix','0'),ebitMarginRef:p('margin','0.2'),taxRef:p('tax','0.25'),daRatioRef:p('da-ratio','0.02'),capexRatioRef:p('capex-ratio','0.03'),nwcRatioRef:p('nwc-ratio','0.1')}
 const ownershipRef=p('owner','0.9'),riskFreeRef=p('rf','0.02'),betaRef=p('beta','1'),erpRef=p('erp','0.05'),debtWeightRef=p('debt-weight','0'),debtCostRef=p('debt-cost','0.03'),terminalGrowthRef=p('g','0.02'),terminalROICRef=p('roic','0.2')
 const postBalanceCashRef=p('other-cash','0','CNY','2026-10-22'),operatingReserveRef=p('reserve','0','CNY','2026-10-22'),cashTransferRef=p('cash-transfer','1')
 const financialOwnershipRef=p('finance-owner','0.6'),pbRef=p('finance-pb','1')
 const waccRefs=[p('wacc-low','0.06'),p('wacc-high','0.08')],growthRefs=[p('g-low','0.01'),p('g-high','0.03')],betaRefs=[p('beta-low','0.8'),p('beta-high','1.2')],cashShiftRefs=[p('cash-low','-10','CNY','2026-10-22'),p('cash-high','10','CNY','2026-10-22')],financialPBRefs=[p('pb-low','0.8'),p('pb-high','1.2')]
 const lowerGrowthRef=p('reverse-low','-0.3'),upperGrowthRef=p('reverse-high','0.3')
 const refs=prefix=>Object.fromEntries([['revenueRef','revenue'],['ebitRef','operatingProfit'],['daRef','depreciationAmortization'],['capexRef','capex'],['tradeNwcRef','tradeNwc']].map(([key,metric])=>[key,prefix+'-'+metric]))
 const packet={schemaVersion:2,synthetic:true,company:{name:'虚构工业公司',ticker:'SYNTHETIC',currency:'CNY'},asOf:'2026-10-23',valuationAsOf:'2026-10-22',financialAsOf:'2026-06-30',sources:[],facts:facts.map(({status,normalizedValue,normalizedUnit,...f})=>f),calculations:[],observations:[{...observation,status:undefined,type:undefined}],dcf:{method:'driver-fcff-v2',valuationAsOf:'2026-10-22',currency:'CNY',businessType:'mixed',operatingBoundary:{kind:'non-financial-proxy',reason:'合成资料的经营利润作为剥离金融业务后的工业代理，费用分摊仍为估计。',refs:['research-basis']},baseFY:{end:'2025-12-31',...refs('base')},interim:{end:'2026-06-30',...refs('interim')},parameters,wacc:{riskFreeRef,betaRef,erpRef,erpIncludesCountryRisk:true,debtWeightRef,debtCostRef,taxRef:common.taxRef},scenarios:['bear','base','bull'].map(id=>({id,reason:'虚构驱动预测情景。',drivers:Array.from({length:6},(_,i)=>({end:`${2026+i}-12-31`,...common})),terminalGrowthRef,terminalROICRef})),bridge:{ownershipMode:'attributable',ownershipRef,cashRef:'cash',cashBasis:'parent-cash-subset',debtRef:'debt',debtBasis:'industrial-interest-bearing',nonOperatingAssetsRef:'assets',minorityInterestRef:'nci',sharesRef:'shares',shareAsOf:'2026-10-22',shareBasis:'issued-at-valuation',shareEventsReviewedThrough:'2026-10-22',priceRef:'price',postBalanceCashRef,operatingReserveRef,cashTransferRef,financialEntities:[{id:'finance',navRef:'nav',ownershipRef:financialOwnershipRef,pbRef}]},sensitivities:{waccRefs,growthRefs,betaRefs,cashShiftRefs,financialPBRefs},reverseGrowth:{requested:true,lowerGrowthRef,upperGrowthRef}}}
 const sourceText=lines.join('\n')+'\n';packet.sources=[{id:sourceId,title:'虚构V5研究测试资料',publisher:'测试',kind:'text-snapshot',textFile:'v5-source.txt',sha256:createHash('sha256').update(sourceText).digest('hex'),publishedAt:'2026-10-22',accessedAt:'2026-10-23'}]
 return{packet,facts,calculations:[],observations:[observation],sourceText}
}
