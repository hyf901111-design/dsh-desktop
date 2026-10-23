import {decimal} from './numbers.mjs'
import {diagnostic,idValid,isDate,isObject,isText,isTimestamp} from './schema.mjs'
import {actualDays,discountActual365} from './discount.mjs'

const METHOD='driver-fcff-v2',ZERO=decimal('0'),ONE=decimal('1')
const s=value=>value.toString(24)
const unique=values=>[...new Set(values)]
const refs=rows=>unique(rows.flatMap(row=>row.sourceRefs??[]))
function fail(code,message,path='dcf'){throw Object.assign(Error(message),{code,path})}
function shape(value,allowed,code,path){if(!isObject(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail(code,'对象结构不受支持或包含未知字段。',path)}
function bound(value,min,max,code,path,{minOpen=false,maxOpen=false}={}){if(value.cmp(min)<0||minOpen&&value.cmp(min)===0||value.cmp(max)>0||maxOpen&&value.cmp(max)===0)fail(code,'参数超出该方法允许的经济范围。',path)}
function yearEnd(date,offset){
 const y=Number(date.slice(0,4))+offset,tail=date.slice(4),candidate=String(y)+tail
 return isDate(candidate)?candidate:tail==='-02-29'?String(y)+'-02-28':null
}
function endOfPeriod(period){
 if(isDate(period))return period
 if(/^FY\d{4}$/.test(period))return period.slice(2)+'-12-31'
 if(/^\d{4}(?:H[12]|Q[1-4])$/.test(period))return period.slice(0,4)+'-'+({H1:'06-30',H2:'12-31',Q1:'03-31',Q2:'06-30',Q3:'09-30',Q4:'12-31'}[period.slice(4)])
 return null
}

function referenceResolver(model,verifiedFacts,successfulCalculations,verifiedObservations){
 const originals=new Map(),parameters=new Map(),assumptions=[]
 for(const item of verifiedFacts.filter(f=>f.status==='verified')){
  if(originals.has(item.id))fail('DCF_REF','原始输入ID重复。')
  originals.set(item.id,{...item,value:decimal(item.normalizedValue),unit:item.normalizedUnit,kind:'reported',sourceRefs:[item.id],isParameter:false})
 }
 for(const item of successfulCalculations.filter(c=>c.status==='calculated')){
  if(originals.has(item.id))fail('DCF_REF','计算与事实ID重复。')
  originals.set(item.id,{...item,value:decimal(item.value),kind:'calculated',sourceRefs:[item.id],isParameter:false})
 }
 const evidenceIds=new Set([...originals.keys(),...verifiedObservations.filter(o=>o.status==='verified').map(o=>o.id)])
 if(!Array.isArray(model.parameters)||!model.parameters.length||model.parameters.length>500)fail('DCF_PARAMETER','需要有界的显式参数台账。','dcf.parameters')
 for(const [i,p]of model.parameters.entries()){
  const path=`dcf.parameters[${i}]`
  shape(p,['id','label','value','unit','kind','reason','refs','asOf'],'DCF_PARAMETER',path)
  if(!idValid(p.id)||evidenceIds.has(p.id)||parameters.has(p.id)||!['assumption','derived-proxy'].includes(p.kind)||!isText(p.reason)||p.reason.length>4000||!['ratio','CNY','shares','CNY_per_share'].includes(p.unit)||!Array.isArray(p.refs)||!p.refs.length||p.refs.length>80||p.refs.some(id=>!evidenceIds.has(id))||p.asOf!==undefined&&!isDate(p.asOf))fail('DCF_PARAMETER','参数须有唯一ID、十进制字符串、单位、假设性质、理由与真实证据引用。',path)
  let value;try{value=decimal(p.value)}catch{fail('DCF_PARAMETER','参数value必须为十进制字符串。',path)}
  const record={...p,value,sourceRefs:unique(p.refs),isParameter:true}
  parameters.set(p.id,record);assumptions.push({...p,refs:unique(p.refs)})
 }
 function get(id,unit,path,code='DCF_REF'){
  const item=originals.get(id)??parameters.get(id)
  if(!item||!(Array.isArray(unit)?unit.includes(item.unit):item.unit===unit))fail(code,'引用必须是已核验事实、成功计算或有证据的显式参数，且量纲正确。',path)
  return item
 }
 get.originals=originals
 return{get,assumptions,originals,evidenceIds,observationIds:new Set(verifiedObservations.filter(o=>o.status==='verified').map(o=>o.id))}
}

// A successful arithmetic operation is not a financial metric identity. Expand
// only bounded linear calculation DAGs and match their original fact meanings.
function checkCalculation(row,key,get,end,scope,code,path){
 if(row.kind!=='calculated')return
 const memo=new Map()
 const expand=(item,seen=new Set())=>{
  if(!item||seen.has(item.id))return null
  if(memo.has(item.id))return memo.get(item.id)
  if(item.kind==='reported')return new Map([[item.id,1n]])
  if(item.kind!=='calculated'||!['sum','difference','grossProfit'].includes(item.op)||!Array.isArray(item.inputs)||!item.inputs.length||item.inputs.length>32)return null
  const next=new Set(seen);next.add(item.id);const terms=new Map()
  for(const [i,id]of item.inputs.entries()){
   const leaves=expand(get.originals.get(id),next);if(!leaves)return null
   const sign=item.op==='sum'||i===0?1n:-1n
   for(const[leaf,coefficient]of leaves)terms.set(leaf,(terms.get(leaf)??0n)+coefficient*sign)
  }
  for(const[id,coefficient]of terms)if(coefficient===0n)terms.delete(id)
  memo.set(item.id,terms);return terms
 }
 const terms=expand(row)
 if(!terms?.size)fail(code,'派生输入不具备受控财务指标身份。',path)
 const leaves=[...terms].map(([id,coefficient])=>({row:get.originals.get(id),coefficient})),identities=new Set()
 if(leaves.some(({row:r,coefficient})=>!r||r.unit!=='CNY'||r.scope!==scope||endOfPeriod(r.period)!==end||coefficient!==1n&&coefficient!==-1n))fail(code,'派生指标的叶项须同日期、同口径且不能重复或任意缩放。',path)
 if(['revenue','ebit','da','capex'].includes(key)&&leaves.some(({row:r})=>r.period!==row.period||/Q[23]$/.test(r.period)&&r.periodBasis!=='cumulative'))fail(code,'损益与流量叶项必须与派生期间一致，且年内第二、三季度的每个原始叶项均须为累计，不能靠顶层标签覆盖单季。',path)
 for(const{row:r}of leaves){
  const locator=r.evidence?.locator
  if(locator){const identity=JSON.stringify([r.sourceId,r.metric,r.period,locator.valueLine??locator.lineStart,locator.column]);if(identities.has(identity))fail(code,'同一原始单元格不能重复计入派生指标。',path);identities.add(identity)}
 }
 const exact=signature=>leaves.length===Object.keys(signature).length&&Object.entries(signature).every(([metric,coefficient])=>leaves.filter(l=>l.row.metric===metric&&l.coefficient===coefficient).length===1)
 const only=metrics=>leaves.length===1&&leaves.every(l=>l.coefficient===1n&&metrics.includes(l.row.metric))
 const definitions={
  revenue:()=>only(['revenue']),
  ebit:()=>only(['operatingProfit'])||exact({revenue:1n,costOfRevenue:-1n,taxesAndSurcharges:-1n,sellingExpenses:-1n,administrativeExpenses:-1n,researchExpenses:-1n}),
  da:()=>only(['depreciationAmortization'])||exact({depreciation:1n,rightOfUseAmortization:1n,intangibleAmortization:1n,deferredExpenseAmortization:1n}),
  capex:()=>only(['capex','capitalExpenditure']),
  tradeNwc:()=>only(['tradeNwc'])||exact({inventory:1n,tradeReceivables:1n,receivablesFinancing:1n,prepayments:1n,tradePayables:-1n,contractLiabilities:-1n}),
  cash:()=>only(['cash']),debt:()=>only(['debt','leaseLiabilities','currentLeaseLiabilities'])||exact({leaseLiabilities:1n,currentLeaseLiabilities:1n}),assets:()=>only(['nonOperatingAssets']),
  nci:()=>only(['minorityInterest']),remainingNci:()=>exact({minorityInterest:1n,financialMinorityInterest:-1n}),
  nav:()=>only(['financialNetAssets'])||exact({assets:1n,liabilities:-1n}),
 }
 if(!definitions[key]?.())fail(code,'派生算式的原始指标与该财务用途不一致，不能把任意加减当收入、经营利润、现金或金融NAV。',path)
}
function usesMetric(row,metric,get,seen=new Set()){
 if(!row||seen.has(row.id))return false
 if(row.kind==='reported')return row.metric===metric
 seen.add(row.id);return(row.inputs??[]).some(id=>usesMetric(get.originals.get(id),metric,get,seen))
}

function historical(block,name,get){
 const path='dcf.'+name
 shape(block,['end','revenueRef','ebitRef','daRef','capexRef','tradeNwcRef'],'DCF_BASE',path)
 if(!isDate(block.end)||['revenueRef','ebitRef','daRef','capexRef','tradeNwcRef'].some(k=>typeof block[k]!=='string'))fail('DCF_BASE','基期需真实期末及收入、经营利润、D&A、资本开支、贸易营运资本引用。',path)
 if(name==='baseFY'&&!block.end.endsWith('-12-31'))fail('DCF_BASE_PERIOD','当前受控模型只支持十二月年末财政年度；非日历财年须另行建模并保留方法缺口。',path)
 const expected={revenue:['revenue'],ebit:['operatingProfit','ebit'],da:['depreciationAmortization','da'],capex:['capex','capitalExpenditure'],tradeNwc:['tradeNwc','tradeWorkingCapital']},result={end:block.end}
 let scope
 for(const [key,metrics]of Object.entries(expected)){
  const row=get(block[key+'Ref'],'CNY',path+'.'+key+'Ref')
  if(key!=='tradeNwc'){
   if(name==='baseFY'&&!/^FY\d{4}$/.test(row.period)||name==='interim'&&!/^\d{4}(?:H1|Q[1-3])$/.test(row.period))fail('DCF_BASE_PERIOD','损益与现金流输入必须明确全年或年内累计期间，不能把单季或时点ISO冒充累计流量。',path+'.'+key+'Ref')
   if(name==='interim'&&/Q[23]$/.test(row.period)&&row.periodBasis!=='cumulative')fail('DCF_BASE_PERIOD','第二、三季度输入必须显式标注cumulative，不能把单季误作累计。',path+'.'+key+'Ref')
  }
  if(row.isParameter||endOfPeriod(row.period)!==block.end||row.kind==='reported'&&!metrics.includes(row.metric))fail('DCF_BASE','历史基期须引用该期间正确指标的已核验事实或成功计算，不能用假设替代。',path+'.'+key+'Ref')
  checkCalculation(row,key,get,block.end,row.scope,'DCF_BASE_METRIC',path+'.'+key+'Ref')
  scope??=row.scope;if(!scope||row.scope!==scope)fail('DCF_BASE','历史模型输入报表范围必须一致。',path)
  result[key]=row.value;result[key+'Source']=row
 }
 if(result.revenue.cmp('0')<=0||result.da.cmp('0')<0||result.capex.cmp('0')<0)fail('DCF_BASE','历史收入须为正，D&A和资本开支不得为负。',path)
 result.scope=scope;result.sourceRefs=refs(Object.values(result).filter(v=>v&&Array.isArray(v.sourceRefs)))
 return result
}

function resolveWacc(model,get){
 const path='dcf.wacc',w=model.wacc
 shape(w,['riskFreeRef','betaRef','erpRef','erpIncludesCountryRisk','countryRiskRef','debtWeightRef','debtCostRef','taxRef'],'DCF_WACC',path)
 if(typeof w.erpIncludesCountryRisk!=='boolean'||w.erpIncludesCountryRisk&&w.countryRiskRef!==undefined||!w.erpIncludesCountryRisk&&w.countryRiskRef===undefined)fail('DCF_WACC','必须声明ERP的国家风险边界；已包含时禁止重复添加，未包含时须显式国家风险参数。',path)
 const rf=get(w.riskFreeRef,'ratio',path+'.riskFreeRef'),beta=get(w.betaRef,'ratio',path+'.betaRef'),erp=get(w.erpRef,'ratio',path+'.erpRef'),dw=get(w.debtWeightRef,'ratio',path+'.debtWeightRef'),kd=get(w.debtCostRef,'ratio',path+'.debtCostRef'),tax=get(w.taxRef,'ratio',path+'.taxRef')
 const crp=w.erpIncludesCountryRisk?null:get(w.countryRiskRef,'ratio',path+'.countryRiskRef')
 bound(rf.value,'0','1','DCF_WACC',path,{maxOpen:true});bound(beta.value,'0','5','DCF_WACC',path,{minOpen:true});bound(erp.value,'0','1','DCF_WACC',path,{minOpen:true,maxOpen:true});bound(dw.value,'0','1','DCF_WACC',path,{maxOpen:true});bound(kd.value,'0','1','DCF_WACC',path,{maxOpen:true});bound(tax.value,'0','1','DCF_WACC',path)
 if(crp)bound(crp.value,'0','1','DCF_WACC',path,{maxOpen:true})
 const compute=selectedBeta=>rf.value.add(selectedBeta.mul(erp.value)).add(crp?.value??ZERO).mul(ONE.sub(dw.value)).add(kd.value.mul(ONE.sub(tax.value)).mul(dw.value))
 const value=compute(beta.value);bound(value,'0','1','DCF_WACC',path,{minOpen:true,maxOpen:true})
 return{value,compute,output:{value:s(value),riskFree:s(rf.value),beta:s(beta.value),erp:s(erp.value),countryRisk:crp?s(crp.value):null,erpIncludesCountryRisk:w.erpIncludesCountryRisk,debtWeight:s(dw.value),debtCost:s(kd.value),tax:s(tax.value),formula:'WACC=(Rf+Beta×ERP+explicitCRP)×(1−D/V)+Kd×(1−tax)×D/V',sourceRefs:refs([rf,beta,erp,dw,kd,tax,...crp?[crp]:[]])}}
}

function rollShares(b,get,valuationAsOf,observationIds){
 const path='dcf.bridge.sharesRef',source=get(b.sharesRef,'shares',path,'DCF_SHARES'),sourceDate=endOfPeriod(source.period)
 if(source.isParameter||source.kind!=='reported'||source.metric!=='shares'||!isDate(sourceDate)||sourceDate>valuationAsOf||source.value.cmp('0')<=0||b.shareBasis!=='issued-at-valuation'||b.shareAsOf!==valuationAsOf||b.shareEventsReviewedThrough!==undefined&&b.shareEventsReviewedThrough!==valuationAsOf)fail('DCF_SHARES','估值股数须来自已核验发行股本与逐事件滚动，不能用参数或EPS加权股数冒充。',path)
 let value=source.value,sourceRefs=source.sourceRefs,events=[]
 if(sourceDate<valuationAsOf||b.shareRollForward!==undefined){
  const roll=b.shareRollForward
  shape(roll,['events','reviewRefs','reviewedThrough','reason'],'DCF_SHARES','dcf.bridge.shareRollForward')
  if(!Array.isArray(roll.events)||roll.events.length>100||!Array.isArray(roll.reviewRefs)||!roll.reviewRefs.length||roll.reviewRefs.length>80||roll.reviewRefs.some(id=>!observationIds.has(id))||roll.reviewedThrough!==valuationAsOf||!isText(roll.reason))fail('DCF_SHARES','历史股本须有明确事件数组、经核验原文的覆盖复核和估值日。','dcf.bridge.shareRollForward')
  const seen=new Set();let previous=sourceDate
  for(const event of roll.events){
   shape(event,['date','deltaRef'],'DCF_SHARES','dcf.bridge.shareRollForward.events')
   if(!isDate(event.date)||event.date<=sourceDate||event.date<previous||event.date>valuationAsOf||seen.has(event.deltaRef))fail('DCF_SHARES','股本事件须位于基期之后、估值日以内，按日排序且不可重复扣除。','dcf.bridge.shareRollForward.events')
   const delta=get(event.deltaRef,'shares','dcf.bridge.shareRollForward.events','DCF_SHARES')
   if(delta.isParameter||delta.kind!=='reported'||!['sharesChange','sharesCancelled','sharesIssued'].includes(delta.metric)||endOfPeriod(delta.period)!==event.date||delta.metric!=='sharesChange'&&delta.value.cmp('0')<0)fail('DCF_SHARES','股本变动须引用当日已核验的有符号变化，或原文正数注销/发行股数，不能用回购金额替代。','dcf.bridge.shareRollForward.events')
   const signed=delta.metric==='sharesCancelled'?ZERO.sub(delta.value):delta.value
   seen.add(event.deltaRef);previous=event.date;value=value.add(signed)
   if(value.cmp('0')<=0)fail('DCF_SHARES','逐事件滚动后的发行股数必须为正。','dcf.bridge.shareRollForward.events')
   events.push({date:event.date,metric:delta.metric,reportedValue:s(delta.value),delta:s(signed),sourceRefs:delta.sourceRefs});sourceRefs=unique([...sourceRefs,...delta.sourceRefs])
  }
  sourceRefs=unique([...sourceRefs,...roll.reviewRefs])
 }
 return{...source,value,sourceDate,period:valuationAsOf,kind:sourceDate===valuationAsOf?'reported':'rolled-forward-reported',sourceRefs,events,reviewedThrough:valuationAsOf,coverageNote:'原文快照与已列事件的覆盖声明不证明不存在未披露或尚未发现的股本变化。'}
}

function resolveBridge(model,get,valuationAsOf,financialAsOf,observationIds,ticker){
 const b=model.bridge,path='dcf.bridge'
 shape(b,['ownershipMode','ownershipRef','cashRef','cashBasis','cashExclusionReason','debtRef','debtBasis','nonOperatingAssetsRef','minorityInterestRef','minorityExclusionReason','sharesRef','shareAsOf','shareBasis','shareEventsReviewedThrough','shareRollForward','priceRef','postBalanceCashRef','operatingReserveRef','cashTransferRef','financialEntities'],'DCF_BRIDGE',path)
 if(!['enterprise-minus-nci','attributable'].includes(b.ownershipMode))fail('DCF_OWNERSHIP','必须显式声明企业价值减NCI或归属现金流方法。',path)
 if(['cashRef','postBalanceCashRef','operatingReserveRef','cashTransferRef'].some(k=>typeof b[k]!=='string'))fail('DCF_CASH','现金基础、估值日前其他现金变化、备用现金及现金转移假设均须显式提供。',path)
 if(!['parent-cash-subset','nonfinancial-consolidated'].includes(b.cashBasis))fail('DCF_CASH','需要母公司现金子集或已排除金融现金的非金融口径。',path)
 if(b.debtBasis!=='industrial-interest-bearing')fail('DCF_DEBT','只能扣除工业有息债务，金融客户存款不能充作工业债。',path)
 if(!Array.isArray(b.financialEntities)||b.financialEntities.length>8||model.businessType==='non-financial'&&b.financialEntities.length||model.businessType==='mixed'&&!b.financialEntities.length)fail('DCF_METHOD','混合金融业务必须显式列出金融股权价值；非金融公司不接受金融分部。',path)
 if(b.financialEntities.length&&b.cashBasis==='nonfinancial-consolidated'&&!isText(b.cashExclusionReason))fail('DCF_CASH','金融NAV单列时，非金融合并现金必须明确排除金融现金的范围及依据。',path)
 const financialDate=(row,name)=>{
  if(row.isParameter?row.asOf!==financialAsOf:endOfPeriod(row.period)!==financialAsOf)fail('DCF_BRIDGE','现金、债务和资产桥须对齐最近财务期；研究参数必须显式asOf。',path+'.'+name)
 }
 const cash=get(b.cashRef,'CNY',path+'.cashRef'),debt=get(b.debtRef,'CNY',path+'.debtRef'),assets=get(b.nonOperatingAssetsRef,'CNY',path+'.nonOperatingAssetsRef'),nci=get(b.minorityInterestRef,'CNY',path+'.minorityInterestRef')
 for(const[name,row,metrics]of [['cashRef',cash,['cash']],['debtRef',debt,['debt','leaseLiabilities']],['nonOperatingAssetsRef',assets,['nonOperatingAssets']],['minorityInterestRef',nci,['minorityInterest']]]){
  financialDate(row,name);if(row.value.cmp('0')<0||row.kind==='reported'&&!metrics.includes(row.metric))fail('DCF_BRIDGE','桥接项目必须是正确指标与非负金额。',path+'.'+name)
  const purpose={cashRef:'cash',debtRef:'debt',nonOperatingAssetsRef:'assets',minorityInterestRef:model.businessType==='mixed'&&row.value.cmp('0')!==0?'remainingNci':'nci'}[name]
  checkCalculation(row,purpose,get,financialAsOf,row.scope,'DCF_BRIDGE_METRIC',path+'.'+name)
 }
 if(b.cashBasis==='parent-cash-subset'&&!cash.isParameter&&cash.scope!=='母公司')fail('DCF_CASH','母公司现金子集必须来自母公司报表，不能用合并现金冒充。',path+'.cashRef')
 const owner=get(b.ownershipRef,'ratio',path+'.ownershipRef');bound(owner.value,'0','1','DCF_OWNERSHIP',path,{minOpen:true})
 if(b.ownershipMode==='attributable'&&nci.value.cmp('0')!==0||b.ownershipMode==='enterprise-minus-nci'&&owner.value.cmp('1')!==0)fail('DCF_OWNERSHIP','归属现金流不得再扣集团NCI；企业价值减NCI方法的归属比例须为一。',path)
 if(b.financialEntities.length&&nci.value.cmp('0')!==0&&(nci.kind==='reported'||nci.isParameter&&nci.kind!=='derived-proxy'||!isText(b.minorityExclusionReason)))fail('DCF_OWNERSHIP','金融NAV已按所有权单列，不能再扣原集团NCI；剩余工业NCI须有受控推导或明确代理及金融排除解释。',path)
 const shares=rollShares(b,get,valuationAsOf,observationIds),price=get(b.priceRef,'CNY_per_share',path+'.priceRef','DCF_PRICE')
 const priceQuote=price.evidence?.quote??'',securityTokens=priceQuote.match(/[A-Za-z0-9_.-]+/g)??[]
 if(price.isParameter||price.kind!=='reported'||price.metric!=='currentPrice'||price.period!==valuationAsOf||!isTimestamp(price.asOf)||price.asOf===valuationAsOf||price.asOf.slice(0,10)!==valuationAsOf||price.marketSession!=='close'||price.securityId!==ticker||!securityTokens.includes(ticker)||!/收盘|close/iu.test(priceQuote)||/(?:前|后)复权|复权收盘|adjusted\s*close|\b(?:qfq|hfq)\b|盘中|intraday/iu.test(priceQuote)||price.value.cmp('0')<=0)fail('DCF_PRICE','估值价格须在原文绑定同一证券、同一估值日完整未复权收盘，不能用元数据覆盖其他证券、复权或盘中价格。',path+'.priceRef')
 const other=get(b.postBalanceCashRef,'CNY',path+'.postBalanceCashRef','DCF_CASH'),reserve=get(b.operatingReserveRef,['CNY','ratio'],path+'.operatingReserveRef','DCF_CASH'),transfer=get(b.cashTransferRef,'ratio',path+'.cashTransferRef','DCF_CASH')
 for(const row of[other,reserve])if(row.isParameter?row.asOf!==valuationAsOf:endOfPeriod(row.period)!==valuationAsOf)fail('DCF_CASH','估值日现金变化和备用现金须明确日期；缺失不能自动补零。',path)
 if(other.value.cmp('0')===0&&(!other.isParameter||other.kind!=='assumption'))fail('DCF_CASH','披露后其他现金变化设零只能作为显式研究假设，不能冒称已核验未知事件为零。',path)
 if(reserve.value.cmp('0')<0)fail('DCF_CASH','经营备用现金不能为负。',path);bound(transfer.value,'0','1','DCF_CASH',path)
 if(reserve.unit==='ratio')bound(reserve.value,'0','1','DCF_CASH',path+'.operatingReserveRef')
 const ids=new Set(),navRefs=new Set(),finances=b.financialEntities.map((f,i)=>{
  shape(f,['id','navRef','ownershipRef','pbRef'],'DCF_FINANCIAL',path+`.financialEntities[${i}]`)
  if(!idValid(f.id)||ids.has(f.id)||navRefs.has(f.navRef))fail('DCF_FINANCIAL','金融分部及NAV引用不得重复。',path);ids.add(f.id);navRefs.add(f.navRef)
  const nav=get(f.navRef,'CNY',path+'.financialEntities.navRef'),ownership=get(f.ownershipRef,'ratio',path+'.financialEntities.ownershipRef'),pb=get(f.pbRef,'ratio',path+'.financialEntities.pbRef')
  financialDate(nav,'financialEntities.navRef')
  checkCalculation(nav,'nav',get,financialAsOf,nav.scope,'DCF_BRIDGE_METRIC',path+'.financialEntities.navRef')
  if(nav.value.cmp('0')<0||nav.kind==='reported'&&nav.metric!=='financialNetAssets')fail('DCF_FINANCIAL','金融价值需正确净资产指标，不能重复加金融现金。',path)
  bound(ownership.value,'0','1','DCF_FINANCIAL',path,{minOpen:true});bound(pb.value,'0','10','DCF_FINANCIAL',path)
  return{id:f.id,nav,ownership,pb}
 })
 return{cash,debt,assets,nci,owner,shares,price,other,reserve,transfer,finances,sourceRefs:refs([cash,debt,assets,nci,owner,shares,price,other,reserve,transfer,...finances.flatMap(f=>[f.nav,f.ownership,f.pb])])}
}

function forecasts(scenario,base,interim,get,valuationAsOf,{constantGrowth=null}={}){
 const path=`dcf.scenarios.${scenario.id}`
 shape(scenario,['id','reason','drivers','terminalGrowthRef','terminalROICRef'],'DCF_FORECAST',path)
 if(!isText(scenario.reason)||!Array.isArray(scenario.drivers)||scenario.drivers.length!==6)fail('DCF_FORECAST','每种情景都需要六个连续年度的完整经营驱动及解释。',path)
 let revenue=base.revenue,nwc=base.tradeNwc,rollingSources=base.sourceRefs
 const rows=scenario.drivers.map((driver,i)=>{
  const dpath=path+`.drivers[${i}]`
  const keys=['volumeGrowth','priceMixGrowth','ebitMargin','tax','daRatio','capexRatio','nwcRatio']
  shape(driver,['end',...keys.map(k=>k+'Ref')],'DCF_FORECAST',dpath)
  if(driver.end!==yearEnd(base.end,i+1))fail('DCF_FORECAST','预测日期必须是基期之后六个连续财政年末。',dpath)
  const parameters=Object.fromEntries(keys.map(k=>[k,get(driver[k+'Ref'],'ratio',dpath+'.'+k+'Ref')]))
  if(Object.values(parameters).some(p=>!p.isParameter))fail('DCF_FORECAST','未来经营驱动必须来自显式研究参数；历史比例不能未经假设说明直接冒充预测。',dpath)
  const v=Object.fromEntries(keys.map(k=>[k,parameters[k].value]))
  for(const key of['volumeGrowth','priceMixGrowth'])bound(v[key],'-1','10','DCF_FORECAST',dpath,{minOpen:true})
  bound(v.ebitMargin,'-1','1','DCF_FORECAST',dpath);bound(v.tax,'0','1','DCF_FORECAST',dpath);bound(v.daRatio,'0','1','DCF_FORECAST',dpath);bound(v.capexRatio,'0','2','DCF_FORECAST',dpath);bound(v.nwcRatio,'-2','2','DCF_FORECAST',dpath)
  const growth=constantGrowth!==null&&i>0?constantGrowth:ONE.add(v.volumeGrowth).mul(ONE.add(v.priceMixGrowth)).sub(ONE);revenue=revenue.mul(ONE.add(growth))
  const ebit=revenue.mul(v.ebitMargin),nopat=ebit.mul(ONE.sub(v.tax)),da=revenue.mul(v.daRatio),capex=revenue.mul(v.capexRatio),nextNwc=revenue.mul(v.nwcRatio),deltaNWC=nextNwc.sub(nwc),fcff=nopat.add(da).sub(capex).sub(deltaNWC)
  nwc=nextNwc
  rollingSources=unique([...rollingSources,...refs(Object.values(parameters))])
  return{id:scenario.id+'-forecast-'+driver.end.slice(0,4),period:driver.end.slice(0,4),end:driver.end,revenueGrowth:growth,revenue,ebit,nopat,da,capex,nwc,deltaNWC,fcff,...v,sourceRefs:rollingSources}
 })
 const first=rows[0]
 if(interim.end<base.end||interim.end>=first.end||valuationAsOf<interim.end||valuationAsOf>first.end)fail('DCF_DATE','最近累计期必须位于历史全年与首个预测年末之间，估值日须位于剩余期间。',path)
 const firstTax=get(scenario.drivers[0].taxRef,'ratio',path+'.drivers[0].taxRef')
 const h1NOPAT=interim.ebit.mul(ONE.sub(firstTax.value)),h1DeltaNwc=interim.tradeNwc.sub(base.tradeNwc),h1FCFF=h1NOPAT.add(interim.da).sub(interim.capex).sub(h1DeltaNwc)
 const h2={basis:interim.emptyInterval?'empty-year-to-date-interval':'forecast-less-disclosed-cumulative',revenue:first.revenue.sub(interim.revenue),nopat:first.nopat.sub(h1NOPAT),da:first.da.sub(interim.da),capex:first.capex.sub(interim.capex),deltaNWC:first.nwc.sub(interim.tradeNwc),h1FCFF}
 h2.fcff=h2.nopat.add(h2.da).sub(h2.capex).sub(h2.deltaNWC)
 if(h2.fcff.add(h1FCFF).cmp(first.fcff)!==0||h2.capex.cmp('0')<0||h2.da.cmp('0')<0||h2.revenue.cmp('0')<0)fail('DCF_FORECAST','全年预测与已披露累计及剩余期间无法勾稽，或出现负的剩余收入/D&A/资本开支。',path)
 h2.elapsedDays=actualDays(interim.end,valuationAsOf);h2.remainingDays=actualDays(valuationAsOf,first.end);h2.totalDays=actualDays(interim.end,first.end);h2.sourceRefs=unique([...first.sourceRefs,...interim.sourceRefs])
 return{rows,h2,sourceRefs:unique([...base.sourceRefs,...interim.sourceRefs,...rows.flatMap(r=>r.sourceRefs)])}
}

function valueScenario(scenario,forecast,rate,g,roic,bridge,valuationAsOf,waccRefs,{cashShift=ZERO,financePB=null}={}){
 const path=`dcf.scenarios.${scenario.id}`
 if(rate.cmp('0')<=0||rate.cmp('1')>=0||g.cmp('0')<0||g.cmp(rate)>=0||roic.cmp('0')<=0||g.cmp(roic)>=0)fail('DCF_TERMINAL','必须满足0<WACC<1、0<=g<WACC、0<ROIC且g<ROIC。',path)
 const{rows,h2}=forecast,owner=bridge.owner.value,discounts=[]
 const discount=(id,period,end,cashFlow,sourceRefs)=>{
  const days=actualDays(valuationAsOf,end),factor=discountActual365(rate,days),presentValue=cashFlow.mul(factor)
  discounts.push({id,period,end,cashFlow,days,timeYears:decimal(String(days)).div('365'),discountFactor:factor,presentValue,sourceRefs:unique([...sourceRefs,...waccRefs])})
 }
 discount(scenario.id+'-stub',rows[0].period+'-stub',rows[0].end,h2.fcff.mul(String(h2.remainingDays)).div(String(h2.totalDays)),h2.sourceRefs)
 for(const row of rows.slice(1))discount(scenario.id+'-discount-'+row.period,row.period,row.end,row.fcff,row.sourceRefs)
 const last=rows.at(-1),nextNOPAT=last.nopat.mul(ONE.add(g)),reinvestmentRate=g.div(roic),reinvestment=nextNOPAT.mul(reinvestmentRate),terminalFCFF=nextNOPAT.sub(reinvestment)
 if(terminalFCFF.cmp('0')<=0)fail('DCF_TERMINAL','终值现金流必须为正，负盈利阶段需另选适用模型。',path)
 const terminalUndiscounted=terminalFCFF.div(rate.sub(g)),terminalPV=terminalUndiscounted.mul(discounts.at(-1).discountFactor),presentFCFF=discounts.reduce((n,r)=>n.add(r.presentValue),ZERO),enterpriseValue=presentFCFF.add(terminalPV),ownersOperatingValue=enterpriseValue.mul(owner)
 if(enterpriseValue.cmp('0')<=0)fail('DCF_TERMINAL','经营价值非正，停止该模型的每股价值输出。',path)
 const cashRoll=h2.fcff.mul(owner).mul(String(h2.elapsedDays)).div(String(h2.totalDays)).mul(bridge.transfer.value)
 const bridgeRows=[]
 const push=(id,label,value,kind,sourceRefs,role='adjustment')=>bridgeRows.push({id:scenario.id+'-'+id,label,value,unit:'CNY',kind,sourceRefs,role})
 push('operating','归属经营价值',ownersOperatingValue,'derived-proxy',unique([...forecast.sourceRefs,...waccRefs,...bridge.owner.sourceRefs]),'operating-value')
 push('cash','最近财务期现金子集',bridge.cash.value,bridge.cash.kind,bridge.cash.sourceRefs)
 push('cash-roll','财务期至估值日估计现金积累',cashRoll,'assumption',unique([...h2.sourceRefs,...bridge.owner.sourceRefs,...bridge.transfer.sourceRefs]))
 const reserveAmount=bridge.reserve.unit==='ratio'?rows[0].revenue.mul(bridge.reserve.value):bridge.reserve.value
 push('reserve','扣除基期经营备用现金',ZERO.sub(reserveAmount),bridge.reserve.kind,bridge.reserve.unit==='ratio'?unique([...bridge.reserve.sourceRefs,...rows[0].sourceRefs]):bridge.reserve.sourceRefs)
 push('debt','扣除工业有息债务',ZERO.sub(bridge.debt.value),bridge.debt.kind,bridge.debt.sourceRefs)
 push('other-assets','非经营资产',bridge.assets.value,bridge.assets.kind,bridge.assets.sourceRefs)
 push('minority','扣除尚未归属的少数权益',ZERO.sub(bridge.nci.value),bridge.nci.kind,bridge.nci.sourceRefs)
 for(const f of bridge.finances)push('finance-'+f.id,'金融分部股权价值：'+f.id,f.nav.value.mul(f.ownership.value).mul(financePB??f.pb.value),'derived-proxy',refs([f.nav,f.ownership,f.pb]))
 push('post-balance-cash','其他现金净变化及压力',bridge.other.value.add(cashShift),bridge.other.kind,bridge.other.sourceRefs)
 const equityValue=bridgeRows.reduce((n,row)=>n.add(row.value),ZERO),perShareValue=equityValue.div(bridge.shares.value)
 const terminalRefs=unique([...last.sourceRefs,...waccRefs])
 return{enterpriseValue,ownersOperatingValue,presentFCFF,equityValue,perShareValue,priceReturn:perShareValue.cmp('0')>0?perShareValue.div(bridge.price.value).sub(ONE):null,discountRows:discounts,bridgeRows,terminal:{nextNOPAT,reinvestmentRate,reinvestment,fcff:terminalFCFF,undiscounted:terminalUndiscounted,presentValue:terminalPV,valueShare:terminalPV.div(enterpriseValue),sourceRefs:terminalRefs}}
}

function strings(value){
 if(value&&typeof value==='object'&&typeof value.n==='bigint'&&typeof value.d==='bigint')return s(value)
 if(Array.isArray(value))return value.map(strings)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,strings(v)]))
 return value
}

export function runForecastDCF(packet,verifiedFacts,successfulCalculations,diagnostics,verifiedObservations=[]){
 if(packet?.dcf?.method!==METHOD)return null
 const result={method:METHOD,status:'blocked',rating:null,scenarios:[],forecasts:[],discountRows:[],bridgeRows:[],assumptions:[],sensitivities:{},limitations:[]}
 try{
  const model=packet.dcf
  shape(model,['method','valuationAsOf','currency','businessType','operatingBoundary','baseFY','interim','parameters','wacc','scenarios','bridge','sensitivities','reverseGrowth'],'DCF_SCHEMA','dcf')
  if(!isDate(model.valuationAsOf)||model.valuationAsOf!==packet.valuationAsOf||model.valuationAsOf>packet.asOf||model.valuationAsOf<packet.financialAsOf)fail('DCF_DATE','估值日须与研究包估值日一致，且财务期<=估值日<=研究日。')
  if(model.currency!==packet.company.currency||model.currency!=='CNY')fail('DCF_SCHEMA','模型必须与报告使用同一支持币种。')
  if(!['non-financial','mixed'].includes(model.businessType))fail('DCF_METHOD','工业FCFF模型不适用于纯金融发行人；必须明确业务类型。')
  if(!Array.isArray(model.scenarios)||model.scenarios.length!==3||new Set(model.scenarios.map(s=>s?.id)).size!==3||model.scenarios.some(s=>!['bear','base','bull'].includes(s?.id)))fail('DCF_SCHEMA','必须恰有bear/base/bull三种情景。')
  const{get,assumptions,evidenceIds,observationIds}=referenceResolver(model,verifiedFacts,successfulCalculations,verifiedObservations)
  shape(model.operatingBoundary,['kind','reason','refs'],'DCF_BOUNDARY','dcf.operatingBoundary')
  const boundary=model.operatingBoundary
  if(!['non-financial','non-financial-proxy'].includes(boundary.kind)||model.businessType==='mixed'&&boundary.kind!=='non-financial-proxy'||!isText(boundary.reason)||!Array.isArray(boundary.refs)||!boundary.refs.length||boundary.refs.length>80||boundary.refs.some(id=>!evidenceIds.has(id)))fail('DCF_BOUNDARY','须有明确工业经营边界和证据；混合金融业务只能作为显式剥离代理，不自动认证为纯工业FCFF。','dcf.operatingBoundary')
  const base=historical(model.baseFY,'baseFY',get)
  const interim=model.interim===undefined&&packet.financialAsOf===base.end?{end:base.end,scope:base.scope,revenue:ZERO,ebit:ZERO,da:ZERO,capex:ZERO,tradeNwc:base.tradeNwc,sourceRefs:base.sourceRefs,emptyInterval:true}:historical(model.interim,'interim',get)
  if(base.scope!==interim.scope||interim.end!==packet.financialAsOf)fail('DCF_BASE','年度和累计基期须同范围，累计期末须等于financialAsOf。')
  const operatingProfitProxy=[base.ebitSource,interim.ebitSource].some(row=>usesMetric(row,'operatingProfit',get))
  if(operatingProfitProxy&&boundary.kind!=='non-financial-proxy')fail('DCF_BOUNDARY','报表营业利润不等于纯EBIT；使用营业利润须明确为研究代理，披露财务费用及投资收益等边界。','dcf.operatingBoundary')
  const wacc=resolveWacc(model,get),bridge=resolveBridge(model,get,model.valuationAsOf,interim.end,observationIds,packet.company.ticker)
  const all=[]
  for(const scenario of model.scenarios){
   const forecast=forecasts(scenario,base,interim,get,model.valuationAsOf),g=get(scenario.terminalGrowthRef,'ratio','dcf.scenarios.terminalGrowthRef'),roic=get(scenario.terminalROICRef,'ratio','dcf.scenarios.terminalROICRef')
   if(!g.isParameter||!roic.isParameter)fail('DCF_TERMINAL','终值增长和ROIC必须是显式研究假设。')
   const sourceRefs=unique([...forecast.sourceRefs,...boundary.refs,...wacc.output.sourceRefs,...bridge.sourceRefs,...g.sourceRefs,...roic.sourceRefs])
   const value=valueScenario(scenario,forecast,wacc.value,g.value,roic.value,bridge,model.valuationAsOf,unique([...wacc.output.sourceRefs,...g.sourceRefs,...roic.sourceRefs]))
   const output={id:scenario.id,reason:scenario.reason,status:'calculated',wacc:wacc.value,terminalGrowth:g.value,terminalROIC:roic.value,forecastRows:forecast.rows.map(row=>({...row,fcffOwners:row.fcff.mul(bridge.owner.value)})),h2:{...forecast.h2,period:forecast.rows[0].period+'-remaining',end:forecast.rows[0].end,fcffOwners:forecast.h2.fcff.mul(bridge.owner.value),elapsedCashAccumulation:value.bridgeRows.find(row=>row.id===scenario.id+'-cash-roll').value,remainingStubCashFlow:value.discountRows[0].cashFlow},...value,explicitPeriodPresentValue:value.presentFCFF,sourceRefs}
   all.push({scenario,forecast,g,roic,value,output})
  }
  const sensitivity=model.sensitivities
  shape(sensitivity,['waccRefs','growthRefs','betaRefs','cashShiftRefs','financialPBRefs'],'DCF_SENSITIVITY','dcf.sensitivities')
  const sensitivityRows={}
  for(const key of['waccRefs','growthRefs','betaRefs','cashShiftRefs','financialPBRefs']){
   const ids=sensitivity[key],minimum=key==='financialPBRefs'&&!bridge.finances.length?0:2
   if(!Array.isArray(ids)||ids.length<minimum||ids.length>9||new Set(ids).size!==ids.length)fail('DCF_SENSITIVITY','需要有界且唯一的WACC/g、Beta、现金及适用金融PB压力参数。','dcf.sensitivities.'+key)
   sensitivityRows[key]=ids.map(id=>get(id,key==='cashShiftRefs'?'CNY':'ratio','dcf.sensitivities.'+key))
  }
  const b=all.find(x=>x.scenario.id==='base'),priceAt=(rate,g,cashShift=ZERO,financePB=null)=>valueScenario(b.scenario,b.forecast,rate,g,b.roic.value,bridge,model.valuationAsOf,wacc.output.sourceRefs,{cashShift,financePB}).perShareValue
  const sensitivities={
   waccGrowth:{growthRates:sensitivityRows.growthRefs.map(r=>r.value),rows:sensitivityRows.waccRefs.map(r=>({wacc:r.value,perShareValues:sensitivityRows.growthRefs.map(g=>priceAt(r.value,g.value)),sourceRefs:unique([...b.output.sourceRefs,...r.sourceRefs,...refs(sensitivityRows.growthRefs)])}))},
   beta:sensitivityRows.betaRefs.map(r=>{bound(r.value,'0','5','DCF_SENSITIVITY','dcf.sensitivities.betaRefs',{minOpen:true});const rate=wacc.compute(r.value);return{beta:r.value,wacc:rate,perShareValue:priceAt(rate,b.g.value),sourceRefs:unique([...b.output.sourceRefs,...r.sourceRefs])}}),
   cash:sensitivityRows.cashShiftRefs.map(r=>{if(r.isParameter&&r.asOf!==model.valuationAsOf)fail('DCF_SENSITIVITY','现金压力参数须明确估值日。');return{cashShift:r.value,perShareValue:priceAt(wacc.value,b.g.value,r.value),sourceRefs:unique([...b.output.sourceRefs,...r.sourceRefs])}}),
   financialPB:sensitivityRows.financialPBRefs.map(r=>{bound(r.value,'0','10','DCF_SENSITIVITY','dcf.sensitivities.financialPBRefs');return{multiple:r.value,perShareValue:priceAt(wacc.value,b.g.value,ZERO,r.value),sourceRefs:unique([...b.output.sourceRefs,...r.sourceRefs])}}),
   reverseGrowth:{status:'not-requested',reason:'本次未请求受控反向增长求解。'}
  }
  if(model.reverseGrowth!==undefined){
   const reverse=model.reverseGrowth
   shape(reverse,['requested','lowerGrowthRef','upperGrowthRef'],'DCF_REVERSE','dcf.reverseGrowth')
   if(typeof reverse.requested!=='boolean')fail('DCF_REVERSE','反向增长需显式requested状态。','dcf.reverseGrowth')
   if(reverse.requested){
    const low=get(reverse.lowerGrowthRef,'ratio','dcf.reverseGrowth.lowerGrowthRef'),high=get(reverse.upperGrowthRef,'ratio','dcf.reverseGrowth.upperGrowthRef')
    bound(low.value,'-1','10','DCF_REVERSE','dcf.reverseGrowth',{minOpen:true});bound(high.value,'-1','10','DCF_REVERSE','dcf.reverseGrowth',{minOpen:true})
    if(low.value.cmp(high.value)>=0)fail('DCF_REVERSE','反解下界必须小于上界。','dcf.reverseGrowth')
    const reverseSources=unique([...b.output.sourceRefs,...low.sourceRefs,...high.sourceRefs])
    const unavailable=(code,reason)=>({status:'unavailable',code,reason,lowerGrowth:low.value,upperGrowth:high.value,isConsensus:false,sourceRefs:reverseSources})
    try{
     const evaluate=growth=>valueScenario(b.scenario,forecasts(b.scenario,base,interim,get,model.valuationAsOf,{constantGrowth:growth}),wacc.value,b.g.value,b.roic.value,bridge,model.valuationAsOf,wacc.output.sourceRefs).perShareValue
     let lo=low.value,hi=high.value,flo=evaluate(lo).sub(bridge.price.value),fhi=evaluate(hi).sub(bridge.price.value)
     if(flo.cmp('0')*fhi.cmp('0')>0)sensitivities.reverseGrowth=unavailable('NO_BRACKET','显式收入增长区间未夹住当前价格，未虚构根。')
     else{
      let mid=lo,value=evaluate(lo),residual=value.sub(bridge.price.value),iterations=0
      for(;iterations<160;iterations++){
       mid=lo.add(hi).div('2');value=evaluate(mid);residual=value.sub(bridge.price.value)
       if(residual.cmp('-0.000000000001')>=0&&residual.cmp('0.000000000001')<=0)break
       if(flo.cmp('0')*residual.cmp('0')<=0){hi=mid;fhi=residual}else{lo=mid;flo=residual}
      }
      sensitivities.reverseGrowth={status:'calculated',constantRevenueGrowth:mid,perShareValue:value,price:bridge.price.value,residualPerShare:residual,iterations:iterations+1,lowerGrowth:low.value,upperGrowth:high.value,isConsensus:false,fixedAssumptions:'首个预测年保持原情景；仅后续五年收入增长统一求根，利润率、税率、D&A、capex、NWC、WACC、g/ROIC及价值桥不变。',sourceRefs:reverseSources}
     }
    }catch(error){sensitivities.reverseGrowth=unavailable(error.code??'MODEL_DOMAIN','显式区间触及该估值模型不适用区域：'+error.message)}
   }
  }
  Object.assign(result,strings({status:'calculated',currency:model.currency,asOf:packet.asOf,valuationAsOf:model.valuationAsOf,financialAsOf:packet.financialAsOf,operatingBoundary:{...boundary,usesOperatingProfitProxy:operatingProfitProxy},wacc:wacc.output,assumptions,scenarios:all.map(x=>x.output),forecasts:all.flatMap(x=>x.output.forecastRows.map(row=>({...row,scenarioId:x.scenario.id}))),discountRows:all.flatMap(x=>x.output.discountRows.map(row=>({...row,scenarioId:x.scenario.id}))),bridgeRows:all.flatMap(x=>x.output.bridgeRows.map(row=>({...row,scenarioId:x.scenario.id}))),sensitivities,currentPrice:{value:bridge.price.value,asOf:model.valuationAsOf,kind:bridge.price.kind,sourceRefs:bridge.price.sourceRefs},shares:{value:bridge.shares.value,asOf:model.valuationAsOf,kind:bridge.shares.kind,sourceDate:bridge.shares.sourceDate,events:bridge.shares.events,reviewedThrough:bridge.shares.reviewedThrough,coverageNote:bridge.shares.coverageNote,sourceRefs:bridge.shares.sourceRefs},limitations:['未来经营驱动、现金滚动及终值为研究假设，不是公司指引或一致预期。','累计期至财政年末现金流按实际天数线性分割；季节性和未披露资本配置可能改变现金桥。','归属现金流与金融NAV按明确方法分开；参数可复算不代表专业签发。',...operatingProfitProxy?['报表营业利润含财务费用、投资收益等边界，本模型把它作为显式经营利润代理，不认证为纯EBIT。']:[],bridge.shares.coverageNote,...boundary.kind==='non-financial-proxy'?['工业经营现金流为显式剥离代理；金融费用分摊与真实逐实体现金流权利仍存在估计误差。']:[],'当前受控实现支持十二月年末财政年度；非日历财年不在本方法覆盖范围。'],numericPolicy:{ordinary:'exact-rational',fractionalDiscount:'72-decimal-fixed-point',outputDecimalPlaces:24,dayCount:'actual/365'}}))
 }catch(error){diagnostics.push(diagnostic(error.code??'DCF_MODEL',error.path??'dcf',error.message))}
 return result
}
