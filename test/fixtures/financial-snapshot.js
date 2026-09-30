const common={version:1,type:'market',title:'虚构金融快照验证',asOf:'2026-10-01 15:00 · 明确虚构模拟数据',note:'全部为虚构演示记录，未调用真实行情。',sources:[{label:'本地虚构验证记录'}]}
export const shares={...common,variant:'share-statistics',symbol:'DEMO',period:'2026-09-30 · 同一股本口径',shareUnit:'万股',totalShares:1200,floatShares:1000,freeFloatPercent:null,missing:'自由流通比例尚未披露'}
export const overview={...common,variant:'market-overview',indices:[
 {symbol:'INDEX.A',name:'模拟市场甲指数',market:'市场甲',unit:'点',price:1250,changePercent:.5,state:'closed',asOf:'2026-09-30 15:00',sparkline:{labels:['09-28','09-29','09-30'],values:[1200,null,1250]}},
 {symbol:'INDEX.B',name:'模拟市场乙指数',market:'市场乙',unit:'点',price:900,changePercent:-2,state:'delayed',asOf:'2026-10-01 10:00（延迟15分钟）',sparkline:{labels:['09-29','09-30'],values:[900,900]}},
 {symbol:'INDEX.C',name:'模拟市场丙指数',market:'市场丙',unit:'点',price:null,changePercent:null,state:'unavailable',asOf:'查询2026-10-01 10:00',sparklineMissing:'没有已取得的历史序列',missing:'当前来源未返回报价'}
]}
export const fx={...common,variant:'currency-snapshot',precision:6,pairs:[
 {base:'USD',quote:'CNY',rate:7.2,dayChangePercent:.5,high52:7.8,low52:7,weekChangePercent:-.2,month3ChangePercent:1.5,month6ChangePercent:null,asOf:'2026-09-30 16:00 UTC',missing:'来源没有6个月同口径报价'},
 {base:'USD',quote:'EUR',rate:.88,dayChangePercent:-.04,high52:.96,low52:.82,weekChangePercent:0,month3ChangePercent:1,month6ChangePercent:2,asOf:'2026-09-30 16:00 UTC'}
]}
export const watch={...common,variant:'watchlist',quotes:[
 {symbol:'DEMO.CNY.A',name:'模拟制造企业甲',currency:'CNY',price:12,dayChangePercent:.5,weekChangePercent:-2,monthChangePercent:3,yearChangePercent:8,pe:12,marketCap:2000000000,volume:1000000,state:'closed',asOf:'2026-09-30 15:00'},
 {symbol:'DEMO.USD',name:'模拟海外企业',currency:'USD',price:150,dayChangePercent:-1,weekChangePercent:.2,monthChangePercent:null,yearChangePercent:5,pe:null,marketCap:500000000,volume:30000,state:'delayed',asOf:'2026-09-30 14:00 UTC（延迟）',missing:'月度收益和市盈率未提供'},
 {symbol:'DEMO.CNY.B',name:'模拟企业乙',currency:'CNY',price:4,dayChangePercent:0,weekChangePercent:2,monthChangePercent:5,yearChangePercent:-1,pe:-2,marketCap:100000000,volume:0,state:'trading',asOf:'2026-09-30 14:55'}
]}
export const snapshotFixtures=[shares,overview,fx,watch]
