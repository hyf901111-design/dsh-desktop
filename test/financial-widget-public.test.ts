import {expect,it,vi} from 'vitest'
import {createPublicFinancialWidgetData} from '../src/main/financial/public-widget-data'

const stock={code:'600519',market:'SH',name:'贵州茅台'}
function quote(id='sh600519',code='600519',name='贵州茅台',time='20261009150000'){
 const fields=Array(90).fill('');Object.assign(fields,{1:name,2:code,3:'1263.00',4:'1255.79',5:'1255.42',30:time,31:'7.21',32:'0.57',33:'1282',34:'1255.42'})
 return `v_${id}="${fields.join('~')}";`
}
const history={code:0,data:{sh600519:{day:[['2026-10-08','1200','1255.79','1260','1190','100'],['2026-10-09','1255.42','1263','1282','1255.42','200']]}}}
function fixture(){
 let owner:string|null='one'
 const fetch=vi.fn(async(input:string|URL)=>{
  const u=new URL(input)
  if(u.hostname==='qt.gtimg.cn')return new Response(quote())
  if(u.hostname==='web.ifzq.gtimg.cn')return Response.json(history)
  if(u.hostname==='smartbox.gtimg.cn')return new Response('v_hint="sh~600519~\\u8d35\\u5dde\\u8305\\u53f0~gzmt~GP-A^hk~00700~\\u817e\\u8baf~tx~GP"')
  if(u.hostname==='feed.mix.sina.com.cn')return Response.json({result:{status:{code:0},data:[{docid:'news-one',title:'市场观察 &amp; 产业消息',media_name:'新浪财经',ctime:'1791623125',url:'https://finance.sina.com.cn/stock/2026-10-10/article.shtml',summary:'产业动态'}]}})
  if(u.hostname==='search-api-web.eastmoney.com')return new Response('ework({"code":0,"result":{"cmsArticle":[{"code":"202610093891385321","title":"茅台市场观察","mediaName":"证券时报","date":"2026-10-10 08:45:00","content":"<em>茅台</em>产业消息"}]}})')
  throw Error('Unexpected request')
 })
 const service=createPublicFinancialWidgetData({identity:()=>owner,fetch})
 return {fetch,service,setOwner:(next:string|null)=>owner=next}
}
it('公开行情解析真实价格、百分比和上游日期，刷新与账户缓存隔离',async()=>{
 const f=fixture(),q={action:'quotes',symbols:[stock]}
 const r=await f.service.query(q)
 expect(r.quotes[0]).toMatchObject({...stock,price:1263,priceChange:7.21,changePercent:.57,asOf:'2026-10-09',source:'腾讯财经'})
 await f.service.query(q);expect(f.fetch).toHaveBeenCalledTimes(1)
 await f.service.query({...q,refresh:true});expect(f.fetch).toHaveBeenCalledTimes(2)
 f.setOwner('two');await f.service.query(q);expect(f.fetch).toHaveBeenCalledTimes(3)
})
it('指数既有当前报价又有实际收盘走势；部分行情缺失不会变成零',async()=>{
 const f=fixture(),index={code:'000300',market:'SH',name:'沪深300'}
 f.fetch.mockImplementation(async(input)=>new URL(input).hostname==='qt.gtimg.cn'?new Response(quote('sh000300','000300','沪深300')):Response.json({code:0,data:{sh000300:{day:history.data.sh600519.day}}}))
 const r=await f.service.query({action:'quotes',asset:'index',symbols:[index,{...index,code:'000001'}]})
 expect(r.quotes).toHaveLength(1);expect(r.quotes[0].series).toEqual([1255.79,1263]);expect(r.errors).toHaveLength(1)
})
it('K线保留OHLC与实际周期，复权字段不得静默退回不复权',async()=>{
 const f=fixture(),q={action:'history',symbols:[stock],period:'1d',adjustment:'none'}
 const r=await f.service.query(q)
 expect(r.bars[1]).toMatchObject({date:'2026-10-09',open:1255.42,close:1263,high:1282,low:1255.42,volume:200})
 expect(r).toMatchObject({source:'腾讯财经',basis:'不复权',volumeUnit:'手',nativePeriod:true})
 const missing=await f.service.query({...q,adjustment:'forward'});expect(missing.bars).toEqual([]);expect(missing.error).toContain('复权')
})
it('港美股报价保留各自交易日期，美股K线使用报价确认的交易代码',async()=>{
 const f=fixture(),us={code:'AAPL',market:'US',name:'苹果'},hk={code:'00700',market:'HK',name:'腾讯控股'}
 f.fetch.mockImplementation(async(input)=>{
  const u=new URL(input)
  if(u.hostname==='qt.gtimg.cn')return new Response(quote('usAAPL','AAPL.OQ','苹果','2026-10-09 16:00:01')+'\n'+quote('hk00700','00700','腾讯控股','2026/10/09 16:08:14'))
  expect(u.searchParams.get('param')).toContain('usAAPL.OQ,day')
  if(u.searchParams.get('param')?.endsWith(',')){expect(u.pathname).toContain('/fqkline/');return Response.json({code:0,data:{'usAAPL.OQ':{day:history.data.sh600519.day}}})}
  return Response.json({code:0,data:{'usAAPL.OQ':{qfqday:history.data.sh600519.day}}})
 })
 const prices=await f.service.query({action:'quotes',symbols:[us,hk]});expect(prices.quotes.map((q:any)=>q.asOf)).toEqual(['2026-10-09','2026-10-09'])
 const qualified=await f.service.query({action:'quotes',symbols:[{...us,code:'AAPL.OQ'}]});expect(qualified.quotes[0]).toMatchObject({code:'AAPL.OQ',price:1263});expect(new URL(f.fetch.mock.calls.at(-1)![0]).searchParams.get('q')).toBe('usAAPL')
 expect((await f.service.query({action:'history',symbols:[us],period:'1d',adjustment:'forward'})).bars).toHaveLength(2)
 expect((await f.service.query({action:'history',symbols:[us],period:'1d',adjustment:'none'})).bars).toHaveLength(2)
})
it('联想按名称或代码返回证券身份，不执行远端脚本',async()=>{
 const f=fixture();expect((await f.service.query({action:'search',query:'茅台'})).symbols[0]).toEqual(stock)
 f.fetch.mockResolvedValueOnce(new Response('v_hint="us~AAPL.OQ~Apple~aapl~GP"'))
 expect((await f.service.query({action:'search',query:'AAPL'})).symbols[0]).toMatchObject({code:'AAPL',market:'US'})
 f.fetch.mockResolvedValueOnce(new Response('v_hint=""; globalThis.bad=true'))
 await expect(f.service.query({action:'search',query:'bad'})).rejects.toThrow('数据')
})
it('新闻读取发布时间、来源和原文；关键词搜索获取关联新闻',async()=>{
 const f=fixture(),r=await f.service.query({action:'news',query:''})
 expect(r.news[0]).toMatchObject({id:'news-one',title:'市场观察 & 产业消息',source:'新浪财经',time:new Date(1791623125*1000).toISOString(),url:'https://finance.sina.com.cn/stock/2026-10-10/article.shtml'})
 const search=await f.service.query({action:'news',query:'茅台'})
 expect(search).toMatchObject({source:'东方财富',news:[{title:'茅台市场观察',summary:'茅台产业消息',time:'2026-10-10T08:45:00+08:00',url:'https://finance.eastmoney.com/a/202610093891385321.html'}]})
})
it('业务失败、非法参数和旧账户响应不能显示成成功或空行情',async()=>{
 const f=fixture();f.fetch.mockResolvedValue(new Response('blocked',{status:503}))
 await expect(f.service.query({action:'news'})).rejects.toThrow('暂不可用')
 await expect(f.service.query({action:'quotes',symbols:[{...stock,code:'../private'}]})).rejects.toThrow('参数')
 expect(f.fetch).toHaveBeenCalledTimes(1)
 f.setOwner(null);await expect(f.service.query({action:'news'})).rejects.toThrow('登录')
 f.setOwner('one');let release!:(r:Response)=>void;f.fetch.mockImplementation(()=>new Promise(resolve=>release=resolve))
 const old=f.service.query({action:'news',refresh:true});await vi.waitFor(()=>expect(release).toBeTypeOf('function'));f.setOwner('two');release(Response.json({result:{status:{code:0},data:[]}}));await expect(old).rejects.toThrow('账户')
})
it('分时使用实际分钟价格与增量成交量，不拿日线替代',async()=>{
 const f=fixture();f.fetch.mockResolvedValue(Response.json({code:0,data:{sh600519:{data:{date:'20261009',data:['0930 1255.42 195 24480690','0931 1263.91 1595 201154584']}}}}))
 const r=await f.service.query({action:'history',symbols:[stock],period:'1m',adjustment:'none'})
 expect(r.bars[0]).toMatchObject({date:'2026-10-09T09:30:00+08:00',close:1255.42,volume:195});expect(r.bars[1].volume).toBe(1400);expect(r.nativePeriod).toBe(true)
})
