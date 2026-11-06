import {expect,it,vi} from 'vitest'
import {buildEtfSnapshot,selectEtfSnapshot,validateEtfSnapshot} from '../services/fund-data/tushare-etf-snapshot.js'
const dates=['20261106','20261105','20261030','20261029']
const row=(code,day,shares,size,nav=2,close=2)=>({ts_code:code,trade_date:day,etf_name:code,total_share:shares,total_size:size,nav,close,exchange:'SSE'})
const end=[row('510300.SH','20261105',11000,22000),row('510500.SH','20261105',9000,27000,3,3),row('159999.SZ','20261105',null,4000),row('159001.SZ','20261105',200,200)]
const start=[row('510300.SH','20261029',10000,19000,1.9,1.9),row('510500.SH','20261029',10000,25000,2.5,2.5),row('159999.SZ','20261029',1000,null)]
function source(){return vi.fn(async({api_name,params,limit})=>({records:api_name==='trade_cal'?dates.map(cal_date=>({cal_date,is_open:1})):api_name==='etf_basic'?[{ts_code:'510300.SH',csname:'沪深300ETF',index_code:'000300.SH',index_name:'沪深300',mgr_name:'管理人甲'}]:params.trade_date==='20261105'?end:params.trade_date==='20261029'?start:[],pagination:{possiblyMore:false},receivedAt:'2026-11-07T00:00:00Z'}))}
it('uses actual available dates, joins by code, keeps missing values, and converts 万 to 亿 exactly',async()=>{
 const query=source(),s=await buildEtfSnapshot({end_date:'20261106',lookback_days:7},query,new AbortController().signal)
 expect(s.period).toEqual({requestedEnd:'20261106',start:'20261029',end:'20261105',lookbackDays:7})
 expect(s.products[0]).toMatchObject({code:'510300.SH',shareYi:1.1,sizeYi:2.2,shareChangeYi:0.1,flowEstimateYi:0.2})
 expect(s.products[0].returnPct).toBeCloseTo(5.26315789)
 expect(s.products[1].flowEstimateYi).toBe(-0.3)
 expect(s.products[2].shareChangeYi).toBeNull()
 expect(s.products[3].flowEstimateYi).toBeNull()
 expect(s.summary.matchedProducts).toBe(3)
 expect(s.summary.flowCoverage).toBe(2)
 expect(s.summary.flowEstimateYi).toBeCloseTo(-0.1)
 expect(s.summary.sizeChangeYi).toBeCloseTo(0.5)
 expect(s.summary.sizeChangeCoverage).toBe(2)
 expect(s.products[2].sizeChangeYi).toBeNull()
 expect(s.products[3].sizeChangeYi).toBeNull()
 expect(s.coverage.complete).toBe(true)
 expect(s.formula).toContain('期末净值')
 expect(query).toHaveBeenCalledTimes(5)
 const selection=selectEtfSnapshot(s,{view:'products',index_code:'000300.SH',limit:20,offset:0})
 expect(selection.records).toHaveLength(1)
 expect(selection.records[0].name).toBe('沪深300ETF')
 expect(selection.coverage.selectedProducts).toBe(1)
 const out=selectEtfSnapshot(s,{view:'outflows',limit:20,offset:0})
 expect(out.records.map(r=>r.code)).toEqual(['510500.SH'])
 expect(out.ranking).toEqual({field:'flowEstimateYi',unit:'亿元',direction:'ascending',meaning:'按期末净值估算的份额变动金额'});
 expect(selection.ranking.field).toBe('sizeYi');
})
it('does not publish partial aggregates when pagination or duplicate data are invalid',async()=>{
 const q=source();q.mockImplementation(async({api_name,params})=>api_name==='trade_cal'?{records:dates.map(cal_date=>({cal_date,is_open:1})),pagination:{possiblyMore:false}}:{records:end,pagination:{possiblyMore:true,nextOffset:(params.offset??0)+1000}})
 await expect(buildEtfSnapshot({end_date:'20261106',lookback_days:7},q,new AbortController().signal)).rejects.toThrow()
})
it('never substitutes old or wrong-date rows, and cancellation stops further queries',async()=>{
 const q=source();q.mockImplementation(async({api_name})=>api_name==='trade_cal'?{records:dates.map(cal_date=>({cal_date,is_open:1})),pagination:{possiblyMore:false}}:{records:end,pagination:{possiblyMore:false}})
 await expect(buildEtfSnapshot({end_date:'20261106',lookback_days:7},q,new AbortController().signal)).rejects.toThrow('日期')
 const abort=new AbortController();abort.abort();const query=source()
 await expect(buildEtfSnapshot({end_date:'20261106',lookback_days:7},query,abort.signal)).rejects.toThrow()
 expect(query).not.toHaveBeenCalled()
})
it('bounds query scope and rejects credentials, invalid dates and unexpected keys',()=>{
 expect(validateEtfSnapshot({},new Date('2026-11-06T16:01:00Z'))).toMatchObject({end_date:'20261107',lookback_days:7,limit:20,view:'overview'})
 for(const input of [{token:'secret'},{end_date:'20260231'},{lookback_days:500},{limit:101},{index_code:'https://bad'}, {sort:'arbitrary'}])expect(()=>validateEtfSnapshot(input)).toThrow()
})
