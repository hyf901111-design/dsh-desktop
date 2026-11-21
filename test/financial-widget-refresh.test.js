import {afterEach,it,expect,vi} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'

const cleanups=[]
afterEach(async()=>{for(const cleanup of cleanups.splice(0))await cleanup();vi.useRealTimers()})
const symbols=[{code:'600519',name:'贵州茅台',market:'SH'},{code:'000001',name:'平安银行',market:'SZ'},{code:'00700',name:'腾讯控股',market:'HK'}]
const bars=Array.from({length:80},(_,i)=>({date:new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),open:100+i,high:105+i,low:98+i,close:102+i,volume:1000}))
function service(){return {request:vi.fn(async q=>q.action==='history'?{bars,source:'测试通联'}:q.action==='news'?{news:[{id:'news',title:'本人构造的测试新闻',time:'10:00',source:'测试来源'}]}:{quotes:q.symbols.map(s=>({...s,price:100,changePercent:0})),source:'测试通联'})}}
async function fixture(bridge){const f=await financialClientFixture({financialWidget:bridge});cleanups.push(f.dispose);return f}
async function create(f,k){await f.act(async()=>{const n=f.workspace.createFinancialWidget(k);if(['watchlist','quote'].includes(k))f.workspace.setArtifacts(f.workspace.getSnapshot().artifacts.map(x=>x.id===n.id?{...n,containerSpec:{...n.containerSpec,symbols:k==='watchlist'?symbols:[symbols[0]]}}:x))});return f.host.querySelector('[data-financial-widget='+k+']')}
async function refresh(f,card){await f.act(async()=>await card.__eworkRefreshFinancial())}
const directions=card=>[...card.querySelectorAll('.ew-financial-data-pulse')].map(el=>el.dataset.refreshDirection)

it('刷新按本次价格变化提示涨跌与不变，重复刷新重新提示后消退且保留行和配置',async()=>{
 const bridge=service(),f=await fixture(bridge),card=await create(f,'watchlist');expect(directions(card)).toEqual([])
 const rows=[...card.querySelectorAll('.ew-watch-row')],snapshot=f.workspace.getSnapshot().artifacts;rows[0].focus();card.querySelector('.ew-watch-rows').scrollTop=12
 bridge.request.mockResolvedValue({quotes:symbols.map((s,i)=>({...s,price:[101,99,100][i],changePercent:0}))});await refresh(f,card)
 expect(directions(card)).toEqual(['up','down','flat']);expect([...card.querySelectorAll('.ew-watch-row')]).toEqual(rows);expect(f.document.activeElement).toBe(rows[0]);expect(card.querySelector('.ew-watch-rows').scrollTop).toBe(12);expect(f.workspace.getSnapshot().artifacts).toEqual(snapshot)
 const previous=card.querySelector('.ew-financial-data-pulse');await refresh(f,card);expect(directions(card)).toEqual(['flat','flat','flat']);expect(card.querySelector('.ew-financial-data-pulse')).not.toBe(previous)
 await vi.waitFor(()=>expect(directions(card)).toEqual([]),{timeout:2000,interval:50})
})

it('部分成功只提示取得报价的行，失败与被后续请求取代的响应不提示成功',async()=>{
 const bridge=service(),f=await fixture(bridge),card=await create(f,'watchlist')
 bridge.request.mockResolvedValue({quotes:[{...symbols[0],price:101}],errors:[{code:symbols[1].code,error:'暂不可用'}]});await refresh(f,card)
 expect(directions(card)).toEqual(['up']);expect(card.querySelectorAll('.ew-financial-data-pulse')[0].closest('.ew-watch-row').dataset.stockCode).toBe('600519')
 bridge.request.mockResolvedValue({quotes:[],error:'暂不可用'});await refresh(f,card);expect(directions(card)).toEqual([]);expect(card.querySelector('.ew-watch-price').textContent).toBe('101.00');expect(card.querySelector('.ew-financial-footer').textContent).toContain('刷新失败')
 bridge.request.mockRejectedValueOnce(Error('网络异常'));await refresh(f,card);expect(directions(card)).toEqual([])
 let resolveOld;bridge.request.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve}));let pending;await f.act(async()=>{pending=card.__eworkRefreshFinancial()})
 bridge.request.mockResolvedValue({quotes:[{...symbols[0],price:102}]});await refresh(f,card);const marker=card.querySelector('.ew-financial-data-pulse')
 await f.act(async()=>{resolveOld({quotes:[{...symbols[0],price:999}]});await pending});expect(card.querySelector('.ew-watch-price').textContent).toBe('102.00');expect(card.querySelector('.ew-financial-data-pulse')).toBe(marker)
})

it('行情图、指数和新闻每次有效刷新都有数据提示，主图与原节点保持不变',async()=>{
 const f=await fixture(service()),quote=await create(f,'quote'),indices=await create(f,'indices'),news=await create(f,'news')
 expect(directions(quote)).toEqual([]);expect(directions(indices)).toEqual([]);expect(directions(news)).toEqual([])
 const svg=quote.querySelector('.ew-price-chart svg'),article=news.querySelector('article'),snapshot=f.workspace.getSnapshot().artifacts
 for(const card of [quote,indices,news])await refresh(f,card)
 expect(quote.querySelector('.ew-quote-price-line .ew-financial-data-pulse')).not.toBeNull();expect(quote.querySelector('.ew-price-chart>.ew-financial-data-pulse')).not.toBeNull();expect(directions(indices)).toHaveLength(6);expect(directions(news)).toEqual(['flat'])
 expect(quote.querySelector('.ew-price-chart svg')).toBe(svg);expect(news.querySelector('article')).toBe(article);expect(f.workspace.getSnapshot().artifacts).toEqual(snapshot)
})

it('一分钟自动刷新与手动刷新共用明显反馈，失败时不显示成功提示',async()=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval']});const bridge=service(),f=await fixture(bridge),card=await create(f,'watchlist');expect(directions(card)).toEqual([])
 await f.act(async()=>{await vi.advanceTimersByTimeAsync(60000)});expect(bridge.request.mock.calls.at(-1)[0].refresh).toBe(true);expect(directions(card)).toEqual(['flat','flat','flat'])
 bridge.request.mockResolvedValue({quotes:[],error:'暂不可用'});await f.act(async()=>{await vi.advanceTimersByTimeAsync(60000)});expect(directions(card)).toEqual([]);expect(card.querySelector('.ew-watch-price').textContent).toBe('100.00')
})

it('shows the actual fetch state and source of the news widget without rendering an undefined provider',async()=>{
 const story={id:'official',title:'2024年12月份全国彩票销售情况',url:'https://zhs.mof.gov.cn/zonghexinxi/202501/t20250124_3955089.htm'}
 const bridge={request:vi.fn(async()=>({news:[]}))}
 const f=await financialClientFixture({financialWidget:bridge},{refreshState:true});cleanups.push(f.dispose)
 const card=await create(f,'news')
 const tooltip=()=>card.querySelector('.ew-financial-provenance').title
 expect(tooltip()).toContain('未取得数据')
 expect(tooltip()).not.toMatch(/undefined|资讯时点未确认/)
 bridge.request.mockResolvedValueOnce({news:[story]});await refresh(f,card)
 expect(tooltip()).toContain('来源未标注')
 bridge.request.mockResolvedValueOnce({news:[story],source:'豆包搜索'});await refresh(f,card)
 expect(tooltip()).toContain('豆包搜索 · 资讯时点未确认')
 expect(tooltip()).toContain('每60秒刷新')
})
