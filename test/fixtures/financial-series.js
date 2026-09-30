const common={version:1,type:'market',title:'虚构金融序列验证',asOf:'2026-10-01 · 明确虚构模拟记录',note:'本地虚构记录，未调用真实行情。',sources:[{label:'本地虚构验收记录'}]}
export const performance={...common,variant:'price-performance',symbol:'DEMO.CNY',market:'模拟交易市场',timezone:'Asia/Shanghai',adjustmentBasis:'未复权',priceUnit:'CNY',volumeUnit:'股',period:'日线',candles:Array.from({length:24},(_,i)=>({date:new Date(Date.UTC(2026,8,i+1)).toISOString().slice(0,10),open:Number((10+i*.1).toFixed(2)),high:Number((10.5+i*.1).toFixed(2)),low:Number((9.5+i*.1).toFixed(2)),close:Number((10.2+i*.1).toFixed(2)),volume:i===1?null:i===0?0:1000+i,...(i===1?{missing:'该日成交量未返回'}:{})}))}
export const multiples={...common,variant:'valuation-multiples',symbol:'DEMO.CNY',basis:'模拟企业财年，收盘总市值 / 对应期间财务值',unit:'倍',datasets:[
 {periodType:'annual',periods:['2023','2024','2025'],series:[{metric:'pe',values:[12,-5,15]},{metric:'ps',values:[2,null,3],missing:'2024年营收口径未返回'}]},
 {periodType:'quarterly',periods:['2026-Q1','2026-Q2'],series:[{metric:'pe',values:[14,16]},{metric:'ps',values:[3,3.2]}]}
]}
export const target={...common,variant:'price-target',symbol:'DEMO.CNY',currency:'CNY',evaluationDate:'2026-10-01',currentPrice:12,currentAsOf:'2026-09-30 15:00 Asia/Shanghai',forecasts:[
 {institution:'模拟研究机构甲',targetPrice:15,issuedDate:'2026-09-20',validUntil:'2027-09-20'},
 {institution:'模拟研究机构乙',targetPrice:8,issuedDate:'2026-01-01',validUntil:'2026-09-01'},
 {institution:'模拟研究机构丙',targetPrice:null,issuedDate:'2026-09-25',missing:'机构仅提供评级，未返回目标价'}
],history:[{date:'2026-09-28',value:11},{date:'2026-09-29',value:null,missing:'当日收盘价未返回'},{date:'2026-09-30',value:12}]}
export const seriesFixtures=[performance,multiples,target]
