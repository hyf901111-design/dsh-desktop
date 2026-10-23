// Register only successful same-run results. Author prose cannot inject model outputs.
export function modelValues(calculation={}){
 const rows=[]
 const add=(id,value,unit,period,inputs=[],label)=>{if(typeof value==='string')rows.push([id,{id,value,unit,period,scope:'研究模型',metric:label??id,inputs,label,basis:'same-run-derived-result'}])}
 const d=calculation.dcf
 if(d?.method==='driver-fcff-v2'&&d.status==='calculated'){
  for(const scenario of d.scenarios){
   const prefix='dcf.'+scenario.id+'.',refs=scenario.sourceRefs??[]
   for(const key of ['perShareValue','equityValue','enterpriseValue','ownersOperatingValue','presentFCFF'])add(prefix+key,scenario[key],key==='perShareValue'?'CNY_per_share':'CNY',d.valuationAsOf,refs)
   for(const key of ['wacc','terminalGrowth','terminalROIC','priceReturn'])add(prefix+key,scenario[key],'ratio',d.valuationAsOf,refs)
   add(prefix+'terminalShare',scenario.terminal?.valueShare,'ratio',d.valuationAsOf,refs)
   for(const row of scenario.forecastRows??[]){const p=row.period+'E';for(const key of ['revenue','ebit','nopat','da','capex','nwc','deltaNWC','fcff','fcffOwners'])add(`forecast.${scenario.id}.${p}.${key}`,row[key],'CNY',p,row.sourceRefs??refs);for(const key of ['revenueGrowth','volumeGrowth','priceMixGrowth','ebitMargin','tax','daRatio','capexRatio','nwcRatio'])add(`forecast.${scenario.id}.${p}.${key}`,row[key],'ratio',p,row.sourceRefs??refs)}
  }
  for(const a of d.assumptions??[])add('assumption.'+a.id,a.value,a.unit,a.asOf??d.valuationAsOf,a.refs??[],a.label??a.id)
 }
 const m=calculation.market
 if(m?.status==='calculated'){
  for(const key of ['stockReturn','benchmarkReturn','relativeReturn'])add('market.'+key,m[key],'ratio',m.windowEnd,m.sourceRefs)
  add('market.excessPercentagePoints',m.excessPercentagePoints,'percentage_points',m.windowEnd,m.sourceRefs)
 }
 const q=calculation.quarterly
 if(q?.status==='calculated')for(const row of q.quarters){for(const key of ['revenue','parentNetIncome','operatingCashFlow'])add(`quarter.${row.period}.${key}`,row[key],'CNY',row.period,row.sourceRefs);for(const key of ['revenueYoY','parentNetIncomeYoY'])add(`quarter.${row.period}.${key}`,row[key],'ratio',row.period,row.sourceRefs)}
 return rows
}
