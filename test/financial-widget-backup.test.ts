import {expect,it,vi} from 'vitest'
import {createPublicFinancialWidgetData} from '../src/main/financial/public-widget-data'
import {financialWidgetDefaults,financialWidgetSpec} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'

const stock={code:'600519',market:'SH',name:'贵州茅台'}
function sina(code='sh600519',price='1263.00'){
 const f=Array(33).fill('');Object.assign(f,{0:'贵州茅台',1:'1255.42',2:'1255.79',3:price,30:'2026-10-09',31:'15:34:59'})
 return `var hq_str_${code}="${f.join(',')}";`
}
const bars=[{day:'2026-10-08',open:'1200',high:'1260',low:'1190',close:'1255.79',volume:'10000'},{day:'2026-10-09',open:'1255.42',high:'1282',low:'1255.42',close:'1263',volume:'20000'}]
function fixture(){
 let owner:string|null='owner'
 const fetch=vi.fn(async(input:string|URL,init?:RequestInit)=>{
  const u=new URL(input)
  if(u.hostname==='hq.sinajs.cn')return new Response(sina(),{headers:{'content-type':'text/plain; charset=utf-8'}})
  if(u.hostname==='quotes.sina.cn')return new Response('/*<script>location.href="//sina.com";</script>*/\nvar _=('+JSON.stringify(bars)+');')
  if(u.pathname==='/new/information/topSearch/query')return Response.json([{code:'600519',orgId:'gssh0600519',category:'A股',type:'shj',zwjc:'贵州茅台'}])
  if(u.pathname==='/new/hisAnnouncement/query')return Response.json({announcements:[{secCode:'600519',orgId:'gssh0600519',announcementId:'1225475868',announcementTitle:'<em>贵州茅台</em>2026年半年度报告',announcementTime:1786723200000,adjunctUrl:'finalpage/2026-08-15/1225475868.PDF'}]})
  if(u.hostname==='search-api-web.eastmoney.com')return new Response('ework({"code":0,"result":{"cmsArticle":[{"code":"202610093891385321","title":"市场动态","mediaName":"证券时报","date":"2026-10-10 08:45:00","content":"产业消息"}]}})')
  if(u.hostname==='feed.mix.sina.com.cn')return Response.json({result:{status:{code:0},data:[{docid:'one',title:'贵州茅台市场动态',media_name:'新浪财经',ctime:'1791623125',url:'https://finance.sina.com.cn/article.shtml',summary:'产业消息'}]}})
  throw Error('Unexpected request '+u.hostname)
 })
 return {fetch,service:createPublicFinancialWidgetData({identity:()=>owner,fetch}),owner:(next:string|null)=>owner=next}
}
it.each(['watchlist','quote','indices','news','announcements'])('persists source and refresh settings for library %s without altering its identity',widget=>{
 const original=financialWidgetDefaults(widget)!,next=financialWidgetSpec({...original,dataSource:'backup',refreshMinutes:5,refreshEnabled:false})
 expect(next).toMatchObject({...original,dataSource:'backup',refreshMinutes:5,refreshEnabled:false})
 expect(financialWidgetSpec(original)).toEqual(original)
 for(const extra of [{dataSource:'https://untrusted.test'}, {refreshMinutes:-1},{refreshMinutes:0.5},{refreshEnabled:'yes'}])expect(financialWidgetSpec({...original,...extra})).toBeNull()
})
it('explicitly selects the backup quote without querying the primary and isolates its cache',async()=>{
 const f=fixture(),q={action:'quotes',symbols:[stock],source:'backup'}
 expect((await f.service.query(q)).quotes[0]).toMatchObject({price:1263,source:'新浪财经',quotedAt:'2026-10-09T07:34:59.000Z'})
 expect(f.fetch.mock.calls.map(([u])=>new URL(u).hostname)).toEqual(['hq.sinajs.cn'])
 await f.service.query(q);expect(f.fetch).toHaveBeenCalledOnce()
 await f.service.query({...q,refresh:true});expect(f.fetch).toHaveBeenCalledTimes(2)
 f.owner('other');await f.service.query(q);expect(f.fetch).toHaveBeenCalledTimes(3)
})
it('parses Sina JSONP as data and retains exact OHLC and share volume for backup history',async()=>{
 const f=fixture(),q={action:'history',source:'backup',symbols:[stock],period:'1d',adjustment:'none'}
 const r=await f.service.query(q)
 expect(r).toMatchObject({source:'新浪财经',volumeUnit:'股',nativePeriod:false,bars:[{date:'2026-10-08',open:1200,high:1260,low:1190,close:1255.79,volume:10000},{date:'2026-10-09',close:1263,volume:20000}]})
 expect(new URL(f.fetch.mock.calls[0]![0]).searchParams.get('symbol')).toBe('sh600519')
 const unsupported=await f.service.query({...q,adjustment:'forward'})
 expect(unsupported.bars).toEqual([]);expect(unsupported.error).toMatch(/复权/)
})
it('keeps minute timestamps and ignores invalid minute bars instead of collapsing them into a daily candle',async()=>{
 const f=fixture();f.fetch.mockResolvedValue(new Response('var _=('+JSON.stringify([{...bars[0],day:'2026-10-19 10:27:00'},{...bars[1],day:'2026-10-19 10:28:00'},{...bars[0],day:'2026-10-19 25:99:00'}])+');'))
 const r=await f.service.query({action:'history',source:'backup',symbols:[stock],period:'1m',adjustment:'none'})
 expect(r.bars.map((b:any)=>b.date)).toEqual(['2026-10-19T10:27:00+08:00','2026-10-19T10:28:00+08:00'])
})
it('rejects executable or malformed history payloads without evaluating source code',async()=>{
 const f=fixture();f.fetch.mockResolvedValue(new Response('var _=(globalThis.__providerExecuted=true,[]);'))
 const r=await f.service.query({action:'history',source:'backup',symbols:[stock],period:'1d',adjustment:'none'})
 expect(r.bars).toEqual([]);expect(r.error).toBeTruthy();expect((globalThis as any).__providerExecuted).toBeUndefined()
})
it('loads a verified CNInfo security identity then returns its genuine announcement URL and date',async()=>{
 const f=fixture(),r=await f.service.query({action:'announcements',source:'backup',symbols:[stock]})
 expect(r).toMatchObject({source:'巨潮资讯',announcements:[{id:'1225475868',title:'贵州茅台2026年半年度报告',date:'2026-08-15',url:'https://static.cninfo.com.cn/finalpage/2026-08-15/1225475868.PDF'}]})
 const calls=f.fetch.mock.calls;expect(calls).toHaveLength(2)
 expect(new URLSearchParams(String(calls[1]![1]?.body)).get('stock')).toBe('600519,gssh0600519')
})
it('does not mix announcements from an identically numbered security or link to arbitrary hosts',async()=>{
 const f=fixture(),base=f.fetch.getMockImplementation()!
 f.fetch.mockImplementation(async(u,init)=>new URL(u).pathname==='/new/hisAnnouncement/query'?Response.json({announcements:[{secCode:'000001',orgId:'gssh0600519',announcementId:'1225475868',announcementTitle:'其他公司',announcementTime:1786723200000,adjunctUrl:'finalpage/2026-08-15/1225475868.PDF'},{secCode:'600519',orgId:'gssh0600519',announcementId:'1225475869',announcementTitle:'错误链接',announcementTime:1786723200000,adjunctUrl:'https://evil.test/a.PDF'}]}):base(u,init))
 expect((await f.service.query({action:'announcements',source:'backup',symbols:[stock]})).announcements).toEqual([])
})
it('offers the other publisher for a news feed and keeps search matched to the requested security',async()=>{
 const f=fixture()
 const feed=await f.service.query({action:'news',source:'backup'})
 expect(feed).toMatchObject({source:'东方财富',news:[{title:'市场动态'}]})
 const search=await f.service.query({action:'news',source:'backup',query:'贵州茅台 600519'})
 expect(search).toMatchObject({source:'新浪财经',news:[{title:'贵州茅台市场动态'}]})
 expect((await f.service.query({action:'news',source:'backup',query:'不相关公司'})).news).toEqual([])
})
it('rejects renderer-supplied source URLs and cancels a backup response after the account changes',async()=>{
 const f=fixture()
 await expect(f.service.query({action:'quotes',source:'https://evil.test',symbols:[stock]})).rejects.toThrow('请求参数')
 expect(f.fetch).not.toHaveBeenCalled()
 f.fetch.mockImplementation(async()=>{f.owner('other');return new Response(sina())})
 await expect(f.service.query({action:'quotes',source:'backup',symbols:[stock]})).rejects.toThrow('账户已变化')
})
it('keeps the Nasdaq Composite and Nasdaq 100 separate in the backup catalogue',async()=>{
 const f=fixture();f.fetch.mockImplementation(async u=>new URL(u).hostname==='push2.eastmoney.com'?Response.json({data:{diff:[{f12:'NDX',f13:100,f2:23000,f3:1.2,f4:272,f124:1792195200},{f12:'NDX100',f13:100,f2:25000,f3:1.5,f4:369,f124:1792195200}]}}):Promise.reject(Error('走势不可用')))
 const r=await f.service.query({action:'quotes',asset:'index',source:'backup',symbols:[{code:'^IXIC',market:'INDEX',name:'纳斯达克'},{code:'^NDX',market:'INDEX',name:'纳斯达克100'}]})
 expect(r.quotes.map((p:any)=>[p.code,p.price,p.source,p.timeZone])).toEqual([['^IXIC',23000,'东方财富','America/New_York'],['^NDX',25000,'东方财富','America/New_York']])
 expect(r.errors).toHaveLength(2);expect(r.errors[0].error).toContain('走势')
})
it('uses validated Yahoo identity and exchange timestamps for the alternate HK quote and history',async()=>{
 const f=fixture(),symbol={code:'00700',market:'HK',name:'腾讯控股'}
 f.fetch.mockImplementation(async()=>Response.json({chart:{result:[{meta:{symbol:'0700.HK',regularMarketPrice:600,regularMarketTime:1792195200,exchangeTimezoneName:'Asia/Hong_Kong',chartPreviousClose:590},timestamp:[1792195200],indicators:{quote:[{open:[595],high:[602],low:[593],close:[600],volume:[10000]}]}}],error:null}}))
 expect((await f.service.query({action:'quotes',source:'backup',symbols:[symbol]})).quotes[0]).toMatchObject({code:'00700',price:600,source:'Yahoo Finance'})
 expect((await f.service.query({action:'history',source:'backup',symbols:[symbol],period:'1d',adjustment:'none'})).bars[0]).toMatchObject({close:600,volume:10000})
 expect(f.fetch.mock.calls.every(([u])=>new URL(u).hostname==='query2.finance.yahoo.com')).toBe(true)
 f.fetch.mockResolvedValue(Response.json({chart:{result:[{meta:{symbol:'OTHER',regularMarketPrice:600,regularMarketTime:1792195200,exchangeTimezoneName:'Asia/Hong_Kong'}}]}}))
 expect((await f.service.query({action:'quotes',source:'backup',symbols:[symbol],refresh:true})).quotes).toEqual([])
})
it.each(['empty','invalid','unavailable'])('falls back to identified Yahoo index quotes when the global catalogue is %s',async mode=>{
 const f=fixture(),symbols=[{code:'^IXIC',market:'INDEX',name:'纳斯达克综合指数'},{code:'^NDX',market:'INDEX',name:'纳斯达克100'}]
 f.fetch.mockImplementation(async u=>{
  const url=new URL(u)
  if(url.hostname==='push2.eastmoney.com'){
   if(mode==='unavailable')throw Error('接口暂不可用')
   return Response.json({data:{diff:mode==='empty'?[]:[{f12:'NDX',f13:100,f2:'-',f124:1792195200},{f12:'NDX100',f13:100,f2:25000,f124:'-'}]}})
  }
  const code=decodeURIComponent(url.pathname.split('/').at(-1)!),price=code==='^IXIC'?23000:25000
  return Response.json({chart:{result:[{meta:{symbol:code,regularMarketPrice:price,regularMarketTime:1792195200,exchangeTimezoneName:'America/New_York',chartPreviousClose:price-100},timestamp:[1792108800,1792195200],indicators:{quote:[{close:[price-100,price]}]}}],error:null}})
 })
 const r=await f.service.query({action:'quotes',asset:'index',source:'backup',symbols})
 expect(r.quotes.map((p:any)=>[p.code,p.price,p.source,p.series])).toEqual([['^IXIC',23000,'Yahoo Finance',[22900,23000]],['^NDX',25000,'Yahoo Finance',[24900,25000]]])
 expect(r.errors).toEqual([])
 f.fetch.mockResolvedValue(Response.json({chart:{result:[{meta:{symbol:'OTHER',regularMarketPrice:600,regularMarketTime:1792195200,exchangeTimezoneName:'America/New_York'}}]}}))
 const invalid=await f.service.query({action:'quotes',asset:'index',source:'backup',symbols,refresh:true})
 expect(invalid.quotes).toEqual([]);expect(invalid.errors).toHaveLength(2)
})
