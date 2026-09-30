const base={version:1,type:'market',asOf:'2026-10-01 · 本地虚构记录，未调用真实资料',note:'仅用于验收；全部字段来自本地虚构输入',sources:[]}
export const company={...base,variant:'company-profile',title:'虚构公司资料',companies:[
 {symbol:'DEMO.CNY',name:'虚构资料公司',period:'2026-09-30 披露快照',address:'虚构城市研发园路 88 号 12 楼',phone:null,website:'https://example.com/company',sector:'信息技术',industry:'工业软件',employeeCount:1234,exchange:'模拟交易所',ipoDate:'2020-03-02',registrations:[{label:'模拟登记号',value:'DEMO-001'}],description:['这是一家用于验证资料模板的虚构公司。保留资料原段落，不补写业务事实。','业务包括软件研究与开发。'.repeat(12)],missing:{phone:'原资料未提供电话'}},
 {symbol:'OTHER.CNY',name:'另一家虚构公司',period:'2026-09-29 披露快照',address:null,phone:null,website:null,sector:'制造业',industry:null,employeeCount:0,exchange:null,ipoDate:null,registrations:[],registrationsMissing:'原资料未提供登记号',description:[],descriptionMissing:'原资料未提供简介',missing:{address:'地址未提供',phone:'电话未提供',website:'网站未提供',industry:'行业未提供',exchange:'未提供交易所',ipoDate:'未提供上市日期'}}
]}
const periods=[{label:'2024',endDate:'2024-12-31',disclosedAt:'2025-03-01'},{label:'2025',endDate:'2025-12-31',disclosedAt:'2026-03-01'}]
export const statements={...base,variant:'financial-statements',title:'虚构财务报表',datasets:[
 {symbol:'DEMO.CNY',name:'虚构资料公司',periodType:'annual',statement:'income',currency:'CNY',unit:'百万元',basis:'合并报表，来源原值',periods,rows:[
  {id:'revenue',label:'营业收入',values:[1000,1200]},
  {id:'software',label:'其中：软件收入',parentId:'revenue',values:[700,900]},
  {id:'netIncome',label:'净利润',values:[-40,80]},
  {id:'margin',label:'净利率',unit:'%',values:[-4,6.6667]},
  {id:'eps',label:'每股收益',unit:'CNY / 股',values:[null,.08],missing:'2024年每股收益未返回'}]},
 {symbol:'DEMO.CNY',name:'虚构资料公司',periodType:'annual',statement:'balance',currency:'CNY',unit:'百万元',basis:'合并报表，来源原值',periods,rows:[{id:'assets',label:'总资产',values:[2000,2400]},{id:'liabilities',label:'总负债',values:[800,900]}]},
 {symbol:'DEMO.CNY',name:'虚构资料公司',periodType:'quarterly',statement:'cashflow',currency:'CNY',unit:'百万元',basis:'合并报表，本期金额非年初累计',periods:[{label:'2026-Q1',endDate:'2026-03-31',disclosedAt:'2026-04-25'},{label:'2026-Q2',endDate:'2026-06-30',disclosedAt:'2026-08-20'}],rows:[{id:'operating',label:'经营活动现金流净额',values:[0,-25]},{id:'investing',label:'投资活动现金流净额',values:[-12,null],missing:'Q2投资现金流未提供'}]},
 {symbol:'OTHER.CNY',name:'另一家虚构公司',periodType:'annual',statement:'income',currency:'USD',unit:'千美元',basis:'母公司报表，来源原值',periods,rows:[{id:'revenue',label:'营业收入',values:[70,85]}]}
]}
export const fundamentalFixtures=[company,statements]
