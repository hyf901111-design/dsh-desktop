import {expect,it,vi} from 'vitest'
import {createPublicFinancialWidgetData} from '../src/main/financial/public-widget-data'

const stock={code:'600519',market:'SH',name:'贵州茅台'}
it('全球指数使用交易所时区、前一交易日涨跌及真实走势，和国内指数按配置顺序返回',async()=>{
 const f=fixture(),nativeFetch=f.fetch.getMockImplementation()!,nikkei={code:'^N225',market:'INDEX',name:'日经225'},day=Date.parse('2026-10-09T06:00:00Z')/1000
 f.fetch.mockImplementation(async url=>new URL(url).hostname==='query1.finance.yahoo.com'?Response.json({chart:{result:[{meta:{symbol:'^N225',regularMarketPrice:110,regularMarketTime:day,exchangeTimezoneName:'Asia/Tokyo',chartPreviousClose:50,currentTradingPeriod:{regular:{start:day-21600,end:day}}},timestamp:[day-86400,day],indicators:{quote:[{close:[100,110]}]}}],error:null}}):nativeFetch(url))
 const result=await f.service.query({action:'quotes',asset:'index',symbols:[nikkei,stock]})
 expect(result.quotes.map((q:any)=>q.code)).toEqual(['^N225','600519'])
 expect(result.quotes[0]).toMatchObject({price:110,priceChange:10,changePercent:10,asOf:'2026-10-09',quotedAt:'2026-10-09T06:00:00.000Z',timeZone:'Asia/Tokyo',series:[100,110],source:'Yahoo Finance'})
})
it('海外源返回错误证券或无效报价时保留国内行情，不生成零值；刷新可以恢复',async()=>{
 const f=fixture(),nativeFetch=f.fetch.getMockImplementation()!,nikkei={code:'^N225',market:'INDEX',name:'日经225'},day=Date.parse('2026-10-09T06:00:00Z')/1000;let valid=false
 f.fetch.mockImplementation(async url=>new URL(url).hostname==='query1.finance.yahoo.com'?Response.json({chart:{result:[{meta:{symbol:valid?'^N225':'^DJI',regularMarketPrice:110,regularMarketTime:day,exchangeTimezoneName:'Asia/Tokyo'},timestamp:[day-86400,day],indicators:{quote:[{close:[100,110]}]}}]}}):nativeFetch(url))
 const q={action:'quotes',asset:'index',symbols:[stock,nikkei]},result=await f.service.query(q)
 expect(result.quotes.map((q:any)=>q.code)).toEqual(['600519']);expect(result.errors).toMatchObject([{code:'^N225'}])
 valid=true;expect((await f.service.query({...q,refresh:true})).quotes).toHaveLength(2)
})
it('海外指数只允许内置目录的指数报价，拒绝作为普通股票和任意外部地址请求',async()=>{
 const f=fixture(),nikkei={code:'^N225',market:'INDEX',name:'日经225'}
 await expect(f.service.query({action:'quotes',symbols:[nikkei]})).rejects.toThrow('指数请求参数无效')
 await expect(f.service.query({action:'quotes',asset:'index',symbols:[{...nikkei,code:'https://other.test'}]})).rejects.toThrow('证券参数无效')
 expect(f.fetch).not.toHaveBeenCalled()
})
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
it('报价保留完整上游时刻和市场时区，美股随夏令时换算',async()=>{
 const f=fixture()
 expect((await f.service.query({action:'quotes',symbols:[stock]})).quotes[0].quotedAt).toBe('2026-10-09T07:00:00.000Z')
 const us={code:'AAPL',market:'US',name:'苹果'}
 f.fetch.mockResolvedValue(new Response(quote('usAAPL','AAPL.OQ','苹果','2026-10-09 16:00:01')))
 expect((await f.service.query({action:'quotes',symbols:[us]})).quotes[0].quotedAt).toBe('2026-10-09T20:00:01.000Z')
 f.fetch.mockResolvedValue(new Response(quote('usAAPL','AAPL.OQ','苹果','2026-01-09 16:00:01')))
 expect((await f.service.query({action:'quotes',symbols:[us],refresh:true})).quotes[0].quotedAt).toBe('2026-01-09T21:00:01.000Z')
})
function sinaQuote(id='sh600519',price='1263.000'){
 const fields=Array(33).fill('');Object.assign(fields,{0:'贵州茅台',1:'1255.42',2:'1255.79',3:price,30:'2026-10-09',31:'15:34:59'})
 return `var hq_str_${id}="${fields.join(',')}";`
}
it('新浪批量查询保留原始逗号，避免HTTP200但返回空报价',async()=>{
 const f=fixture(),other={market:'SZ',code:'000858',name:'五粮液'}
 f.fetch.mockImplementation(async input=>{
  const u=new URL(input)
  return new Response(u.hostname!=='hq.sinajs.cn'||u.href.includes('%2C')?'':sinaQuote()+'\n'+sinaQuote('sz000858','70.56'))
 })
 const result=await f.service.query({action:'quotes',symbols:[stock,other]})
 expect(result.quotes).toHaveLength(2);expect(result.errors).toEqual([])
})
it('腾讯失败时新浪备用报价提供价格、涨跌和实际来源，刷新重新尝试主源',async()=>{
 const f=fixture(),q={action:'quotes',symbols:[stock]}
 f.fetch.mockImplementation(async input=>new URL(input).hostname==='hq.sinajs.cn'?new Response(sinaQuote()):new Response('unavailable',{status:503}))
 const result=await f.service.query(q)
 expect(result).toMatchObject({source:'新浪财经',errors:[],quotes:[{price:1263,priceChange:expect.closeTo(7.21),changePercent:expect.closeTo(.57414,4),asOf:'2026-10-09',quotedAt:'2026-10-09T07:34:59.000Z',source:'新浪财经'}]})
 expect(new URL(f.fetch.mock.calls[1]![0]).searchParams.get('list')).toBe('sh600519')
 f.fetch.mockResolvedValue(new Response(quote()))
 expect((await f.service.query({...q,refresh:true})).source).toBe('腾讯财经')
})
it('备用源仅补缺失的A股报价，混合来源不覆盖主源有效值或冒充港美股',async()=>{
 const f=fixture(),other={...stock,code:'000001',market:'SZ',name:'平安银行'},us={code:'AAPL',market:'US',name:'苹果'}
 f.fetch.mockImplementation(async input=>new URL(input).hostname==='hq.sinajs.cn'?new Response(sinaQuote('sz000001','13.1')):new Response(quote()))
 const result=await f.service.query({action:'quotes',symbols:[stock,other,us]})
 expect(result.source).toBe('腾讯财经 / 新浪财经');expect(result.quotes).toHaveLength(2);expect(result.quotes[0]).toMatchObject({price:1263,source:'腾讯财经'});expect(result.quotes[1]).toMatchObject({code:'000001',price:13.1,source:'新浪财经'});expect(result.errors).toHaveLength(1)
 expect(new URL(f.fetch.mock.calls[1]![0]).searchParams.get('list')).toBe('sz000001')
})
it('后续批量请求失败时保留之前有效的主源报价',async()=>{
 const f=fixture(),symbols=[stock,...Array.from({length:50},(_,i)=>({market:'US',code:'A'+i,name:'测试美股'}))]
 f.fetch.mockImplementation(async input=>{const u=new URL(input);if(u.hostname==='hq.sinajs.cn')return new Response(sinaQuote());if(u.searchParams.get('q')?.includes('sh600519'))return new Response(quote());throw Error('Second batch unavailable')})
 const r=await f.service.query({action:'quotes',symbols})
 expect(r.quotes[0]).toMatchObject({code:'600519',price:1263,source:'腾讯财经'})
 expect(f.fetch.mock.calls.some(([u])=>new URL(u).hostname==='hq.sinajs.cn')).toBe(false)
})
it('备用源空报价与畸形时间不生成假行情，两源失败可重新重试',async()=>{
 const f=fixture()
 f.fetch.mockImplementation(async input=>new URL(input).hostname==='hq.sinajs.cn'?new Response(sinaQuote().replace('2026-10-09','2026-02-30')):new Response(''))
 const result=await f.service.query({action:'quotes',symbols:[stock]});expect(result.quotes).toEqual([]);expect(result.errors).toHaveLength(1)
 f.fetch.mockImplementation(async input=>new URL(input).hostname==='hq.sinajs.cn'?new Response(sinaQuote()):new Response(''))
 expect((await f.service.query({action:'quotes',symbols:[stock]})).quotes[0].price).toBe(1263)
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

it('routes selected MCP prices through fixed account tools with exact symbols, date ranges and units',async()=>{
 const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),compact=date.replaceAll('-','')
 const dataProDay=new Date(Date.now()-86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})
 const record={ts_code:'600519.SH',trade_date:compact,open:100,high:105,low:98,close:102,change:2,pct_chg:2,vol:1000}
 const rpc=(result:unknown)=>Response.json({jsonrpc:'2.0',id:1,result})
 const tushare=vi.fn(async(_body:string)=>rpc({structuredContent:{source:'Tushare',api:'daily',records:[record,{...record,ts_code:'600519.SZ',close:200}]}}))
 const datapro=vi.fn(async(_body:string)=>rpc({content:[{type:'text',text:JSON.stringify({code:0,dataset_type:'stock_finance',items:[
  {证券代码:'600519.SH',records:[
   {证券代码:'600519.SH',日期:dataProDay,开盘价:100,最高价:105,最低价:98,收盘价:102,成交量:1234},
   {证券代码:'600519.SZ',日期:dataProDay,开盘价:1,最高价:2,最低价:1,收盘价:2,成交量:99}
  ]}
 ]})}]}))
 const fetch=vi.fn(async()=>{throw Error('Unexpected public request')})
 const service=createPublicFinancialWidgetData({identity:()=> 'one',fetch,accountSources:{tushare,datapro}})
 const input={action:'history',symbols:[stock],period:'1w',adjustment:'none'}
 const history=await service.query({...input,source:'tushare'})
 expect(history).toMatchObject({source:'Tushare',volumeUnit:'手',nativePeriod:false,bars:[{date,close:102,volume:1000}],quotes:[{price:102,priceChange:2,asOf:date,quotedAt:null}]})
 expect(JSON.parse(tushare.mock.calls[0]![0]).params).toMatchObject({name:'tushare_query',arguments:{api_name:'daily',params:{ts_code:'600519.SH',end_date:compact}}})
 expect(await service.query({...input,source:'datapro'})).toMatchObject({source:'火山方舟专业数据集',volumeUnit:'股',bars:[{date:dataProDay,close:102,volume:1234}],quotes:[{price:102,priceChange:null,quotedAt:null}]})
 expect(JSON.parse(datapro.mock.calls[0]![0]).params).toMatchObject({name:'dataPro_search',arguments:{query:expect.stringContaining('600519.SH')}})
 await expect(service.query({...input,source:'tushare',period:'1m'})).rejects.toThrow(/未复权日线/)
 expect(fetch).not.toHaveBeenCalled()
})

it('maps Doubao news source and optional publication time independently of retrieval time',async({onTestFinished})=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-18T20:00:00+08:00'))
 onTestFinished(()=>{vi.useRealTimers()})
 const doubao=vi.fn(async()=>({provider:'doubao' as const,truncated:false as const,sources:[
  {url:'https://example.com/btc',title:'比特币市场消息',siteName:'市场通讯',publishedAt:'2026-11-12T09:00:00+08:00',snippet:'市场动态'},
  {url:'https://example.net/btc',title:'交易所资讯'},
  {url:'https://example.org/undated',title:'未标注日期的报道',publishedAt:'1970-01-01T08:00:00+08:00'},
  {url:'https://example.net/zh/news',title:'今天的新闻头条'},
  {url:'https://example.net/search/AI',title:'热门工具搜索'},
  {url:'https://example.net/profile/123',title:'机构账号的微博'},
  {url:'https://example.com/btc?utm_source=api',title:'转载自市场通讯'},
  {url:'https://example.org/reprint',title:'比特币市场消息'},
  {url:'https://example.net/zh/news?utm_source=feed',title:'新闻栏目首页'},
  {url:'https://example.net/?q=今日市场',title:'搜索结果'},
  {url:'https://example.net/?locale=zh-CN',title:'行业资讯与动态'},
  {url:'https://example.net/zh/news?__nc=123',title:'AI 新闻快讯'},
  {url:'https://example.net/en/ai_news?page=3',title:'AI News - 最新人工智能行业资讯'},
  {url:'https://example.net/ja/artificial-intelligence/',title:'人工知能 Archives | eWeek'},
  {url:'https://www.stdaily.com/web/gjxw/node_388.html',title:'国际科技新闻'},
  {url:'https://www.news.cn/tech/kjkx/index.html',title:'科技快讯_新华科技_新华网'},
  {url:'https://kjj.hefei.gov.cn/kjzx/index.html',title:'科技资讯_合肥市科学技术局'},
  {url:'https://news.youth.cn/kj/index.htm',title:'科技_新闻频道_中国青年网'},
  {url:'https://zggxjs.cn/tech-news',title:'科技新闻 - 中国高新科技网'},
  {url:'https://www3.xinhuanet.com/tech/kjkx/',title:'科技快讯_新华科技_新华网'},
  {url:'https://tech.cnr.cn/gstj/',title:'广首推荐_央广网'},
  {url:'https://m.thepaper.cn/list_100743',title:'澎湃新闻'},
  {url:'https://cas.cn/cm/',title:'传媒扫描----中国科学院'},
  {url:'https://ncsti.gov.cn/kjdt/kjrd/qtrd_kjrd/',title:'其它热点'},
  {url:'https://news.cctv.com/2026/11/19/ARTIv8bwQQRiLCFI5TZTszPJ261119.shtml',title:'八省将开展6G创新发展试点_新闻频道_央视网'},
  {url:'https://cls.cn/detail/2538370',title:'微软与英特尔扩大合作_科技快讯'},
  {url:'https://ncsti.gov.cn/kjdt/kjrd/qtrd_kjrd/202606/t20260622_250075.html',title:'一周前沿科技盘点',publishedAt:'2026-06-22T00:00:00+08:00'},
  {url:'https://example.org/next',title:'未来日期的文章',publishedAt:'2026-11-21T08:00:00+08:00'},
  {url:'https://example.org/modern-chips/',title:'新型芯片发布 - 科技周报'},
  {url:'https://example.com/tech/index.html?article_id=561',title:'最新 科技 新闻',snippet:'国产 芯片 亮相 大会 ， 支持 RISC-V 指令集。'},
  {url:'https://example.com/2026/11/chip-news/index.html',title:'如何核实科技新闻'},
  {url:'https://example.com/?p=329',title:'编辑部报道'},
  {url:'https://example.org/story/326?q=finance',title:'市场收盘报道',publishedAt:'2026-11-13T17:30:00+08:00'},
  {url:'https://name:pass@example.net/private',title:'Invalid'}
 ]}))
 const service=createPublicFinancialWidgetData({identity:()=> 'one',accountSources:{doubao}})
 const result=await service.query({action:'news',query:'比特币',source:'doubao'})
 expect(doubao).toHaveBeenCalledWith('比特币 近一周新闻报道原文（截至2026-11-18）',8,expect.any(AbortSignal))
 expect(result).toMatchObject({source:'豆包搜索',receivedAt:expect.any(String),news:[
  {title:'市场收盘报道',source:'example.org',time:'2026-11-13T17:30:00+08:00'},
  {title:'比特币市场消息',source:'市场通讯',time:'2026-11-12T09:00:00+08:00'},
  {title:'交易所资讯',source:'example.net',time:null},
  {title:'未标注日期的报道',source:'example.org',time:null},
  {title:'八省将开展6G创新发展试点_新闻频道_央视网'},
  {title:'微软与英特尔扩大合作_科技快讯'},
  {title:'新型芯片发布 - 科技周报',time:null},
  {title:'最新科技新闻',summary:'国产芯片亮相大会，支持 RISC-V 指令集。'},
  {title:'如何核实科技新闻',source:'example.com'},
  {title:'编辑部报道',source:'example.com',time:null}
 ]})
 await service.query({action:'news',query:'上周市场',source:'doubao'})
 expect(doubao).toHaveBeenLastCalledWith('上周市场 新闻报道原文',8,expect.any(AbortSignal))
 const archive=await service.query({action:'news',query:'2026年6月科技新闻',source:'doubao'})
 expect(archive.news).toContainEqual(expect.objectContaining({title:'一周前沿科技盘点'}))
})
