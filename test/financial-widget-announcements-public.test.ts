import {expect,it,vi} from 'vitest'
import {createPublicFinancialWidgetData} from '../src/main/financial/public-widget-data'

const stock={market:'SH',code:'600519',name:'贵州茅台'}
const notice=(extra:Record<string,any>={})=>({art_code:'AN202610091830270252',title:'贵州茅台:关于回购股份进展的公告',notice_date:'2026-10-10 00:00:00',codes:[{stock_code:'600519',ann_type:'A,SHA'}],columns:[{column_name:'回购进展情况'}],...extra})
function fixture(rows:any[]=[notice()]){
 let owner:string|null='one'
 const fetch=vi.fn(async(_url:string|URL)=>Response.json({success:1,data:{list:rows}}))
 return {fetch,service:createPublicFinancialWidgetData({identity:()=>owner,fetch}),setOwner:(value:string|null)=>owner=value}
}
it('公告按证券身份查询，保留发布日期、类别和原文，刷新绕过缓存',async()=>{
 const f=fixture(),q={action:'announcements',symbols:[stock]}
 const r=await f.service.query(q)
 expect(r).toMatchObject({source:'东方财富',announcements:[{id:'AN202610091830270252',title:'贵州茅台:关于回购股份进展的公告',date:'2026-10-10',category:'回购进展情况',url:'https://data.eastmoney.com/notices/detail/600519/AN202610091830270252.html'}]})
 expect(r.receivedAt).toBeTruthy()
 const url=new URL(f.fetch.mock.calls[0]![0] as string)
 expect(url.hostname).toBe('np-anotice-stock.eastmoney.com');expect(url.searchParams.get('stock_list')).toBe('600519')
 await f.service.query(q);expect(f.fetch).toHaveBeenCalledTimes(1)
 await f.service.query({...q,refresh:true});expect(f.fetch).toHaveBeenCalledTimes(2)
 f.setOwner('two');await f.service.query(q);expect(f.fetch).toHaveBeenCalledTimes(3)
})
it('沪深同码不能串主体，畸形日期、ID、空标题不伪装有效公告',async()=>{
 const f=fixture([notice(),notice(),notice({art_code:'AN202610091830270253',codes:[{stock_code:'600519',ann_type:'A,SZA'}]}),notice({art_code:'AN202610091830270254',notice_date:'2026-02-30 00:00:00'}),notice({art_code:'../malicious'}),notice({art_code:'AN202610091830270255',title:''})])
 expect((await f.service.query({action:'announcements',symbols:[stock]})).announcements).toHaveLength(1)
})
it('港股、美股和北交所各自使用正确市场和证券代码',async()=>{
 for(const [market,code,type,tag] of [['HK','00700','H','H'],['US','AAPL.OQ','U','U'],['BJ','920002','A','A,BJA']]){
  const providerCode=code==='AAPL.OQ'?'AAPL':code,f=fixture([notice({codes:[{stock_code:providerCode,ann_type:tag}]})])
  const result=await f.service.query({action:'announcements',symbols:[{market,code,name:'测试主体'}]})
  expect(result.announcements).toHaveLength(1)
  const url=new URL(f.fetch.mock.calls[0]![0] as string)
  expect(url.searchParams.get('ann_type')).toBe(type);expect(url.searchParams.get('stock_list')).toBe(providerCode)
 }
})
it('空公告与接口失败分开处理，失败可重试，拒绝额外请求地址',async()=>{
 const f=fixture([]),q={action:'announcements',symbols:[stock]}
 expect((await f.service.query(q)).announcements).toEqual([])
 f.fetch.mockResolvedValueOnce(Response.json({success:0,data:{list:[]}}))
 await expect(f.service.query({...q,refresh:true})).rejects.toThrow('暂不可用')
 f.fetch.mockResolvedValueOnce(Response.json({success:1,data:{list:[notice()]}}))
 expect((await f.service.query({...q,refresh:true})).announcements).toHaveLength(1)
 await expect(f.service.query({...q,url:'https://example.org'})).rejects.toThrow('参数')
 await expect(f.service.query({...q,symbols:[]})).rejects.toThrow('参数')
 await expect(f.service.query({...q,symbols:[stock,stock]})).rejects.toThrow('参数')
})
it('账户切换后的旧公告响应不得显示',async()=>{
 const f=fixture();let resolve!:(response:Response)=>void
 f.fetch.mockImplementation(()=>new Promise(done=>resolve=done))
 const pending=f.service.query({action:'announcements',symbols:[stock]})
 await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));f.setOwner('two')
 resolve(Response.json({success:1,data:{list:[notice()]}}))
 await expect(pending).rejects.toThrow('账户')
})

it('指数使用公司公告空态，同时保留同代码上市公司的公告', async () => {
 const f = fixture([notice({ codes: [{ stock_code: '000001', ann_type: 'A,SZA' }] })])
 for (const code of ['000001','000300']) for (const source of ['default','backup']) {
  const index = { market: 'SH', code, name: '指数' }
  expect((await f.service.query({action:'announcements', symbols:[index], source})).announcements).toEqual([])
 }
 expect(f.fetch).not.toHaveBeenCalled()
 const bank = {market:'SZ', code:'000001', name:'平安银行'}
 expect((await f.service.query({action:'announcements', symbols:[bank]})).announcements).toHaveLength(1)
 expect(f.fetch).toHaveBeenCalledTimes(1)
})
