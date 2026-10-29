import data from './assets/home-workbench/research-data.json' with {type:'json'}
import expansion from './assets/home-workbench/research-expansion.json' with {type:'json'}
import copy from './assets/home-workbench/professional-copy.json' with {type:'json'}
export const HOME_WORKBENCH_STUDY_DATA=data
export const HOME_WORKBENCH_STUDY_EXPANSION=expansion
export const HOME_WORKBENCH_STUDY_COPY=copy

// These pure functions are also serialized into the trusted native canvas.
export function parseHomeWorkbenchStudySpec(value){
 const codes=['600519','000858','000568'],roles=['disclosure','performance','peers','valuation','matrix','dividend','cashflow','directory','reader','analysis','news']
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['version','type','studyRole','title','security','reportKind','scenarios','performancePeriods','linkedSourceId'].includes(k)))return null
 if(value.version!==1||value.type!=='research-study'||!roles.includes(value.studyRole)||value.security!==null&&!codes.includes(value.security)||typeof value.title!=='string'||!value.title.trim()||value.title.length>160||/[\x00-\x1f]/.test(value.title)||!['annual','quarter','dividend'].includes(value.reportKind))return null
 if(value.linkedSourceId!==undefined&&(typeof value.linkedSourceId!=='string'||!/^[-\w:.]{1,200}$/.test(value.linkedSourceId)||['peers','news'].includes(value.studyRole)))return null
 const scenarios=value.scenarios,periods=value.performancePeriods
 if(!scenarios||typeof scenarios!=='object'||Array.isArray(scenarios)||Object.keys(scenarios).some(k=>!codes.includes(k))||!periods||typeof periods!=='object'||Array.isArray(periods)||Object.keys(periods).some(k=>!codes.includes(k)))return null
 for(const code of codes){const s=scenarios[code];if(!s||Object.keys(s).length!==2||!['snapshot',20,25].includes(s.pe)||![-5,0,5].includes(s.epsChange)||!['quarter','annual'].includes(periods[code]))return null}
 return {...value,scenarios:Object.fromEntries(codes.map(code=>[code,{...scenarios[code]}])),performancePeriods:{...periods}}
}
export function homeWorkbenchStudyTitle(role,security,reportKind='annual'){
 const name=({'600519':'贵州茅台','000858':'五粮液','000568':'泸州老窖'})[security]||'待选标的',report=({annual:'2025年报',quarter:'2026一季报',dividend:'2025分红预案'})[reportKind]
 return ({disclosure:name+' · 最新披露',performance:'业绩趋势 · '+name,peers:'同业比较 · 固定三家公司',valuation:'估值输入 · '+name,matrix:'PE × 盈利敏感性 · 测算',dividend:'分红方案 · '+name,cashflow:'盈利与现金回收 · '+name,directory:'公告资料 · '+name,reader:report+' · '+name,analysis:'财报解读 · '+report,news:'行业资讯 · 固定三家样本'})[role]||''
}
export function homeWorkbenchStudySpec(role,security='600519',options={}){
 const code=typeof security==='string'?security.replace(/^(SH|SZ):/,''):security
 return parseHomeWorkbenchStudySpec({version:1,type:'research-study',studyRole:role,security:code,reportKind:'annual',scenarios:{'600519':{pe:20,epsChange:0},'000858':{pe:20,epsChange:0},'000568':{pe:20,epsChange:0}},performancePeriods:{'600519':'quarter','000858':'quarter','000568':'quarter'},...options,title:options.title||homeWorkbenchStudyTitle(role,code,options.reportKind)})
}
export function homeWorkbenchStudyCanLink(source,target){
 if(target?.type!=='research-study'||['peers','news'].includes(target.studyRole))return false
 if(['reader','analysis'].includes(target.studyRole))return source?.type==='research-study'&&source.studyRole==='directory'
 if(target.studyRole==='matrix')return source?.type==='research-study'&&source.studyRole==='valuation'
 return source?.type==='financial-widget'&&source.widget==='watchlist'
}
export function homeWorkbenchStudyHasOutput(spec){return spec?.type==='research-study'&&['directory','valuation'].includes(spec.studyRole)}
export function synchronizeHomeWorkbenchStudies(artifacts,changedNodeId){
 if(!Array.isArray(artifacts))return artifacts
 const byId=new Map(artifacts.map(n=>[n.id,n])),studies=artifacts.filter(n=>parseHomeWorkbenchStudySpec(n.containerSpec))
 if(!studies.length)return artifacts
 const nativeParents=new Set(studies.flatMap(n=>{const p=byId.get(n.containerSpec.linkedSourceId);return p?.containerSpec?.type==='financial-widget'&&p.containerSpec.widget==='watchlist'?[p.id]:[]}))
 const changed=byId.get(changedNodeId),source=nativeParents.has(changedNodeId)?changed:null
 if(source){
  const s=source.containerSpec,symbols=Array.isArray(s.symbols)?s.symbols:[],selected=symbols.find(sy=>sy.market+':'+sy.code===s.selectedSymbol)??symbols[0],key=selected?selected.market+':'+selected.code:null
  for(const id of nativeParents){const n=byId.get(id),valid=key&&Array.isArray(n.containerSpec.symbols)&&n.containerSpec.symbols.some(sy=>sy.market+':'+sy.code===key);if(id!==source.id&&valid)byId.set(id,{...n,containerSpec:{...n.containerSpec,selectedSymbol:key}})}
 }
 const resolved=new Map(),visiting=new Set()
 const resolve=id=>{
  if(resolved.has(id))return resolved.get(id)
  const n=byId.get(id),s=parseHomeWorkbenchStudySpec(n?.containerSpec)
  if(!s||['peers','news'].includes(s.studyRole))return n
  if(visiting.has(id))return {...n,containerSpec:{...s,security:null}}
  visiting.add(id)
  let next=s
  if(s.linkedSourceId){
   const p=resolve(s.linkedSourceId),ps=p?.containerSpec
   if(!homeWorkbenchStudyCanLink(ps,s))next={...s,security:null}
   else if(ps.type==='financial-widget'){
    const symbols=Array.isArray(ps.symbols)?ps.symbols:[],selected=symbols.find(sy=>sy.market+':'+sy.code===ps.selectedSymbol)??symbols[0],valid=HOME_WORKBENCH_STUDY_DATA.companies.find(c=>c.id===selected?.code&&c.exchange===selected?.market)
    next={...s,security:valid?selected.code:null}
   }else next={...s,security:ps.security,...(['reader','analysis'].includes(s.studyRole)?{reportKind:ps.reportKind}:{}),...(s.studyRole==='matrix'?{scenarios:structuredClone(ps.scenarios)}:{})}
  }
  const title=homeWorkbenchStudyTitle(next.studyRole,next.security,next.reportKind);next={...next,title}
  visiting.delete(id)
  const result=JSON.stringify(next)===JSON.stringify(n.containerSpec)&&n.title===title?n:{...n,title,excerpt:title,containerSpec:next};resolved.set(id,result);return result
 }
 return artifacts.map(n=>studies.some(s=>s.id===n.id)?resolve(n.id):byId.get(n.id))
}
export function homeWorkbenchStudyModel(spec){
 const s=parseHomeWorkbenchStudySpec(spec),company=HOME_WORKBENCH_STUDY_DATA.companies.find(c=>c.id===s?.security),snapshot=HOME_WORKBENCH_STUDY_DATA.snapshot
 if(!s||!company)return {available:false,snapshot,company:null}
 const c=company,e=HOME_WORKBENCH_STUDY_EXPANSION[c.id],kind=s.reportKind,isQ=kind==='quarter',scenario=s.scenarios[c.id],pe=scenario.pe==='snapshot'?c.close/c.eps:scenario.pe,eps=c.eps*(1+scenario.epsChange/100),price=eps*pe,combined=c.interim+c.final
 const page=isQ?c.quarterPage:kind==='dividend'?2:c.annualPage,url=(isQ?c.quarter:c.annual)+'#page='+page
 const document={kind,title:isQ?'2026年第一季度报告':kind==='dividend'?'2025年度利润分配预案':'2025年年度报告',period:isQ?'2026Q1':'2025年度',date:isQ?c.quarterDate:c.reportDate,audit:isQ?'未经审计':kind==='dividend'?'预案 · 尚未实施':'已审计',page,url}
 const analysis=kind==='dividend'?[
  {dimension:'分红状态',fact:'中期每股'+c.interim.toFixed(3)+'元已实施；年度每股'+c.final.toFixed(3)+'元仍为预案。',researchMeaning:'中期已付不代表快照日买入后可取得；以实施公告和登记日为准。',source:{url:c.annual,pages:[2]}},
  {dimension:'分配强度',fact:'年度分配/股 '+combined.toFixed(3)+'元；年报基本EPS '+c.eps+'元。',researchMeaning:'每股分配/EPS = '+(combined/c.eps*100).toFixed(2)+'%；每股测算与官方总额口径存在差异。',source:{url:c.annual,pages:HOME_WORKBENCH_STUDY_COPY.dividends[c.id].sources[0].pages}},
  {dimension:'分配拆分',fact:'年度分配/快照价 '+(combined/c.close*100).toFixed(2)+'%；年度预案/快照价 '+(c.final/c.close*100).toFixed(2)+'%。',researchMeaning:'税前历史参考；不是当前可取得股息或承诺回报。',source:{url:c.annual,pages:[2]}}
 ]:HOME_WORKBENCH_STUDY_COPY.financialInterpretation[c.id][kind]
 const ratio=(v,p)=>p===0?null:(v/p-1)*100
 const reportRows=isQ?[
  ['营业收入 / 亿',c.quartersRevenue[4]/1e8,c.quartersRevenue[0]/1e8,c.revYoy,'percent'],['归母净利润 / 亿',c.quartersProfit[4]/1e8,c.quartersProfit[0]/1e8,c.profitYoy,'percent'],['扣非归母净利润 / 亿',e.deductQuarter[0]/1e8,e.deductQuarter[1]/1e8,ratio(e.deductQuarter[0],e.deductQuarter[1]),'percent'],['经营净现金流 / 亿',c.qCash/1e8,e.priorQCash/1e8,ratio(c.qCash,e.priorQCash),'percent'],['基本EPS / 元',e.quarterEps[0],e.quarterEps[1],ratio(e.quarterEps[0],e.quarterEps[1]),'percent'],['加权ROE',e.quarterRoe[0],e.quarterRoe[1],e.quarterRoe[0]-e.quarterRoe[1],'pct']
 ]:[['营业收入 / 亿',c.revenue[2]/1e8,c.revenue[1]/1e8,ratio(c.revenue[2],c.revenue[1]),'percent'],['归母净利润 / 亿',c.profit[2]/1e8,c.profit[1]/1e8,ratio(c.profit[2],c.profit[1]),'percent'],['扣非归母净利润 / 亿',e.deductAnnual[0]/1e8,e.deductAnnual[1]/1e8,ratio(e.deductAnnual[0],e.deductAnnual[1]),'percent'],['经营净现金流 / 亿',c.cash[2]/1e8,c.cash[1]/1e8,ratio(c.cash[2],c.cash[1]),'percent'],['基本EPS / 元',c.eps,e.annualEpsPrev,ratio(c.eps,e.annualEpsPrev),'percent'],['加权ROE',c.roe,e.annualRoePrev,c.roe-e.annualRoePrev,'pct']]
 return {available:true,snapshot,spec:s,company:c,expansion:e,document,analysis,reportRows,analysisNote:kind==='dividend'?'年度预案未实施；全部金额为税前，每股测算不替代官方总额口径。':HOME_WORKBENCH_STUDY_COPY.financialInterpretation[c.id].periodNotes[kind],valuation:{pe,eps,epsChange:scenario.epsChange,price,upside:(price/c.close-1)*100,columns:[pe-4,pe-2,pe,pe+2,pe+4],changes:[-10,-5,0,5,10]},dividend:{combined,annualYield:combined/c.close*100,pendingYield:c.final/c.close*100,payout:combined/c.eps*100},performance:{period:s.performancePeriods[c.id],labels:s.performancePeriods[c.id]==='quarter'?['25Q1','25Q2','25Q3','25Q4','26Q1']:['2023','2024','2025'],revenue:s.performancePeriods[c.id]==='quarter'?c.quartersRevenue:c.revenue,profit:s.performancePeriods[c.id]==='quarter'?c.quartersProfit:c.profit},peers:HOME_WORKBENCH_STUDY_DATA.companies,news:homeWorkbenchStudyNews()}
}
export function homeWorkbenchStudyNews(){
 const d=HOME_WORKBENCH_STUDY_DATA,c=d.companies
 return [...d.news,{date:'04-30 18:26',company:'五粮液',tag:'回购',title:'拟80亿—100亿元回购，用于注销',source:'人民财讯',url:'https://www.stcn.com/article/detail/3892550.html'},{date:'04-28 23:17',company:'五粮液',tag:'信披',title:'年报与一季报延至4月30日盘后披露',source:'证券时报',url:'https://www.stcn.com/article/detail/3854036.html'},{date:'04-29',company:'泸州老窖',tag:'季报',title:'2026Q1归母37.08亿元，同比−19.25%',source:'公司公告',url:c[2].quarter},{date:'04-25',company:'贵州茅台',tag:'季报',title:'2026Q1营收+6.54%，归母+1.47%',source:'公司公告',url:c[0].quarter}].sort((a,b)=>b.date.localeCompare(a.date))
}
