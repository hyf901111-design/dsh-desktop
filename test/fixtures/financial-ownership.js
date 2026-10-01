export const insider={version:1,type:'market',variant:'insider-trading',title:'内幕交易（本地虚构）',asOf:'2026-10-01 · 本地虚构记录',period:'2026年来源披露记录',sharesUnit:'股',transactions:[
 {id:'buy',symbol:'DEMO.CNY',name:'虚构公司',person:'虚构人员甲',ownerId:'0001',issuerId:'0002',transactionDate:'2026-09-01',disclosureDate:'2026-09-04',code:'P',transactionType:'公开市场买入',direction:'buy',ownershipChange:'increase',shares:100,sharesHeld:200,price:12,amount:1200,currency:'CNY',securityType:'普通股',link:'https://example.com/filings/buy'},
 {id:'sale',symbol:'DEMO.CNY',name:'虚构公司',person:'虚构人员甲',ownerId:'0001',issuerId:'0002',transactionDate:'2026-09-03',disclosureDate:'2026-09-05',code:'S',transactionType:'公开市场卖出',direction:'sell',ownershipChange:'decrease',shares:50,sharesHeld:150,price:13,amount:650,currency:'CNY',securityType:'普通股'},
 {id:'grant',symbol:'DEMO.CNY',name:'虚构公司',person:'虚构人员乙',ownerId:null,issuerId:'0002',transactionDate:'2026-09-06',disclosureDate:null,code:'A',transactionType:'奖励授予',direction:'other',ownershipChange:'increase',shares:0,sharesHeld:0,price:null,amount:null,currency:'CNY',securityType:'限制性普通股',missing:'来源未提供持有人编码、披露日、价格和金额；数量明确为0'},
 {id:'option',symbol:'DEMO.CNY',name:'虚构公司',person:'虚构人员乙',ownerId:null,issuerId:'0002',transactionDate:'2026-09-08',disclosureDate:'2026-09-09',code:'M',transactionType:'豁免行权',direction:'other',ownershipChange:'unknown',shares:null,sharesHeld:null,price:null,amount:null,currency:'CNY',securityType:'期权',missing:'来源未返回数量、持股数、价格、金额和持有人编码'},
 {id:'other',symbol:'OTHER.USD',name:'第二家虚构公司',person:'虚构人员丙',ownerId:'0010',issuerId:'0020',transactionDate:'2026-09-02',disclosureDate:'2026-09-07',code:'P',transactionType:'买入',direction:'buy',ownershipChange:'increase',shares:10,sharesHeld:10,price:10,amount:100,currency:'USD',securityType:'普通股'}
]};
export const institutional={version:1,type:'market',variant:'institutional-ownership',title:'机构持仓（本地虚构）',asOf:'2026-10-01 · 本地虚构记录',companies:[
 {symbol:'DEMO.CNY',name:'虚构公司',snapshots:[
  {period:'2026-Q2',previousPeriod:'2026-Q1',disclosureDate:'2026-08-15',basis:'来源季度合并统计；不是实时持仓；单位逐行标记',metrics:[
   {id:'count',label:'持有机构数',unit:'家',current:3,previous:2,change:1,changePercent:50},
   {id:'shares',label:'持股数量',unit:'股',current:1200,previous:1500,change:-300,changePercent:-20},
   {id:'percent',label:'持股比例',unit:'%',current:12,previous:15,change:-3,changePercent:-20},
   {id:'new',label:'新增机构',unit:'家',current:0,previous:1,change:-1,changePercent:-100},
   {id:'calls',label:'看涨期权数量',unit:'份',current:null,previous:10,change:null,changePercent:null,missing:'来源未返回本季看涨期权数量和变化'},
   ...Array.from({length:7},(_,i)=>({id:'item-'+i,label:'来源指标'+i,unit:'股',current:i,previous:i,change:0,changePercent:i===0?null:0,...(i===0?{missing:'比较基数为0，来源未提供变化比例'}:{})}))
  ],holders:[
   {id:'a-common',institution:'虚构机构甲',institutionId:'a',shareClass:'普通股',shares:100,ownershipPercent:1,changeShares:-10,disclosureDate:'2026-08-15',link:'https://example.com/filings/a'},
   {id:'a-preferred',institution:'虚构机构甲',institutionId:'a',shareClass:'优先股',shares:50,ownershipPercent:null,changeShares:0,disclosureDate:'2026-08-15',missing:'来源未提供优先股持股占比'},
   {id:'b',institution:'虚构机构乙',institutionId:'b',shareClass:'普通股',shares:null,ownershipPercent:null,changeShares:null,disclosureDate:null,missing:'来源未返回持仓、变动和披露日'}
  ],holdersBasis:'仅三条部分明细，禁止推导机构总持仓'},
  {period:'2025-Q4',previousPeriod:'2025-Q3',disclosureDate:'2026-02-10',basis:'来源第四季度统计',metrics:[{id:'shares',label:'持股数量',unit:'股',current:1000,previous:800,change:200,changePercent:25}]}
 ]},
 {symbol:'OTHER.USD',name:'第二家虚构公司',snapshots:[{period:'2026-Q1',previousPeriod:'2025-Q4',disclosureDate:null,missing:'来源未提供披露日',basis:'来源季度统计，股数非金额',metrics:[{id:'shares',label:'持股数量',unit:'股',current:0,previous:0,change:0,changePercent:null,missing:'来源未提供零基数的变化比例'}]}]}
]};
export const ownershipFixtures=[insider,institutional];
