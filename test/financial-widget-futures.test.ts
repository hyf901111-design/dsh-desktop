import {expect,it,vi} from 'vitest'
import {createPublicFinancialWidgetData} from '../src/main/financial/public-widget-data'
import {parseShfeSettlements} from '../src/main/financial/shfe-futures-data'

const row=(month:string,price:number|string)=>({PRODUCTID:'rb_f',PRODUCTGROUPID:'rb',PRODUCTNAME:'螺纹钢',DELIVERYMONTH:month,SETTLEMENTPRICE:price,VOLUME:0,CLOSEPRICE:'',OPENINTEREST:12})
const report=(day:string,rows:object[])=>({report_date:day,o_code:'0000',o_curinstrument:rows})
it('保留同一交易日真实合约、空结算和零成交，排除小计、错日及盘中未定价报告',()=>{
 const raw=report('20261117',[row('2702',''),row('2701',2978),row('小计',900),row('2612',2993),{...row('2612',5),PRODUCTGROUPID:'sc_tas',PRODUCTID:'sc_tas'}])
 expect(parseShfeSettlements(raw,'20261118')).toBeNull()
 const product=parseShfeSettlements(raw,'20261117')!.products[0]!
 expect(product).toMatchObject({code:'rb',name:'螺纹钢',unit:'元/吨'})
 expect(product.contracts.map(r=>r.code)).toEqual(['RB2612','RB2701','RB2702'])
 expect(product.contracts[2]).toMatchObject({settlement:null,volume:0,close:null})
 expect(parseShfeSettlements(report('20261118',[row('2612','')]),'20261118')).toBeNull()
})
it('通过正式查询入口共享同批读取，未结算时展示上一交易日，手动刷新切换到新公布的完整日报',async()=>{
 let settled=false
 const fetch=vi.fn(async (url:URL|string)=>{
  const path=new URL(url).pathname
  expect(new URL(url).origin).toBe('https://www.shfe.com.cn')
  if(path.endsWith('currentTradingday.dat'))return Response.json({currentTradingday:'20261118',lastTradingday:'20261117'})
  const day=path.match(/kx(\d{8})\.dat$/)?.[1]
  if(!day)throw Error('unexpected URL')
  return Response.json(report(day,[row('2701',settled||day==='20261117'?3000:'')]))
 })
 const service=createPublicFinancialWidgetData({identity:()=>'account',fetch}),query={action:'futures',source:'shfe'}
 const [a,b]=await Promise.all([service.query(query),service.query(query)])
 expect(a).toEqual(b);expect(a.futuresReport.date).toBe('2026-11-17');expect(fetch).toHaveBeenCalledTimes(3)
 settled=true
 expect((await service.query({...query,refresh:true})).futuresReport.date).toBe('2026-11-18')
 await expect(service.query({...query,query:'https://example.com'})).rejects.toThrow()
 await expect(service.query({...query,source:'datapro'})).rejects.toThrow()
})
