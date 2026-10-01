import {performance} from './financial-series.js';
const {variant,symbol,market,timezone,adjustmentBasis,priceUnit,volumeUnit,period,candles,...common}=performance;
export const technical={...common,variant:'charting',datasets:[
 {id:'daily',symbol,market,timezone,adjustmentBasis,priceUnit,volumeUnit,period,candles,comparisons:[{symbol:'OTHER.CNY',priceUnit:'USD',closes:[{date:'2026-09-01',value:10},{date:'2026-09-02',value:null,missing:'来源未返回比较价'},{date:'2026-09-03',value:12}]}]},
 {id:'weekly',symbol,market,timezone,adjustmentBasis,priceUnit,volumeUnit,period:'周线',candles:[{date:'2026-09-01',open:10,high:15,low:8,close:12,volume:0},{date:'2026-09-08',open:12,high:16,low:10,close:11,volume:null,missing:'周成交量来源未提供'},{date:'2026-09-15',open:11,high:14,low:9,close:13,volume:1500}]}
],indicators:[{id:'ma',kind:'sma',period:3,enabled:true},{id:'strength',kind:'rsi',period:3,enabled:true}]};
