import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {acceptArtifactOutput, workbenchMarketVariantIssue} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {compactHostDashboardHtml,RESEARCH_COMPONENT_CONTROLS_CSS} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {marketVariant,workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js'
const render=spec=>{const out=acceptArtifactOutput(JSON.stringify({version:1,type:'market',title:'源稿行情',asOf:'09.21 15:00 · 情景模拟',...spec}));expect(out).toBeDefined();const w=new Window();w.document.write(JSON.parse(out).html);return w.document}
it('renders source metrics with exact data and typography rather than free-form cards',()=>{
 const d=render({variant:'metrics',items:[{label:'上证指数',value:'3,912.48',detail:'+0.64%'},{label:'深证成指',value:'12,648.32',detail:'+1.12%'}]})
 expect(d.querySelector('h1')).toBeNull();expect(d.querySelectorAll('.market-value')).toHaveLength(2)
 expect(d.querySelector('.market-value').textContent).toBe('3,912.48');expect(d.querySelector('style').textContent).toContain('font-size:21px')
})
it('retains every table column, decimal, time and neutral sorting control',()=>{
 const d=render({variant:'table',columns:['时间','成交价','量 / 手','金额 / 万','方向'],rows:[['14:59:58.124','4.521','128','5.79','主动卖']],tones:[['','','','','negative']]})
 expect([...d.querySelectorAll('tbody td')].map(x=>x.textContent)).toEqual(['14:59:58.124','4.521','128','5.79','主动卖'])
 expect(d.querySelectorAll('thead button')).toHaveLength(5);expect(d.querySelector('[data-tone=negative]').textContent).toBe('主动卖')
})
it('links verified market table rows to a detail page without accepting unsafe URLs',()=>{
 const data={variant:'table',columns:['标的','最新价'],rows:[['贵州茅台 600519.SH','1237.00']],rowLinks:['https://example.com/chart/600519']}
 const d=render(data)
 expect(d.querySelector('tbody a').href).toBe('https://example.com/chart/600519')
 expect(acceptArtifactOutput(JSON.stringify({version:1,type:'market',title:'行情',asOf:'2026-09-24',...data,rowLinks:['javascript:alert(1)']}))).toBeUndefined()
})
it('renders source-style financial trends with all values and a bounded legend',()=>{
 const d=render({variant:'trend',labels:['09:30','10:30','11:30'],series:[{name:'沪深300',values:[3821,3830,3827]},{name:'医药',values:[1220,1229,1236]}]})
 expect(d.querySelectorAll('.trend-line')).toHaveLength(2)
 expect(d.querySelectorAll('.trend-key')).toHaveLength(2)
 expect(d.querySelectorAll('.trend-grid:not(.trend-vertical)')).toHaveLength(5)
 expect(d.querySelectorAll('.trend-vertical')).toHaveLength(3)
 expect(d.querySelector('.trend-footer').textContent).toContain('样本：沪深300 / 医药')
 expect([...d.querySelectorAll('tbody tr')].map(row=>row.textContent)).toEqual(['09:3038211220','10:3038301229','11:3038271236'])
 expect(d.querySelector('[data-sherlock-market="trend"]')).not.toBeNull()
 expect(acceptArtifactOutput(JSON.stringify({version:1,type:'market',variant:'trend',title:'走势',asOf:'模拟',labels:['一','二'],series:[{name:'错位',values:[1]}]}))).toBeUndefined()
})
it('keeps a sourced full-year daily trend instead of rejecting 252 genuine observations',()=>{
 const labels=Array.from({length:252},(_,i)=>`2025-${String(Math.floor(i/21)+1).padStart(2,'0')}-${String(i%21+1).padStart(2,'0')}`)
 const values=labels.map((_,i)=>100+i/10)
 const d=render({variant:'trend',labels,series:[{name:'农林牧渔指数',values}],sources:[{label:'通联 DataYes',url:''}]})
 expect(d.querySelectorAll('tbody tr')).toHaveLength(252)
 expect(d.querySelector('.trend-line').getAttribute('points').split(' ')).toHaveLength(252)
 expect(d.querySelector('.market-footer').textContent).toContain('通联 DataYes')
 expect(d.querySelector('.market-footer a')).toBeNull()
})
it('lets a reader inspect every genuine trend point with keyboard controls',()=>{
 const d=render({variant:'trend',labels:['2026-01','2026-02','2026-03'],series:[{name:'CPI 同比',values:[0.2,0.5,0.8]}]})
 const chart=d.querySelector('.market-trend svg')
 expect(chart.getAttribute('tabindex')).toBe('0')
 expect(d.querySelector('.trend-readout').textContent).toContain('2026-03 · CPI 同比 0.8')
 expect(d.querySelectorAll('.trend-selected-dot')).toHaveLength(1)
 d.defaultView.eval(d.querySelector('script').textContent)
 chart.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))
 expect(d.querySelector('.trend-readout').textContent).toBe('2026-02  ·  CPI 同比 0.5')
 expect(chart.dataset.selectedIndex).toBe('1')
 chart.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Home',bubbles:true}))
 expect(d.querySelector('.trend-readout').textContent).toContain('2026-01')
})
it('renders a fixed price-volume template with linked readings, real range controls and missing volume',()=>{
 const labels=Array.from({length:65},(_,i)=>`第 ${i+1} 日`)
 const prices=labels.map((_,i)=>100+i*.5),volumes=labels.map((_,i)=>i===10?null:1000+i*20)
 const d=render({variant:'price-volume',labels,prices,volumes,priceUnit:'元',volumeUnit:'股'})
 expect(d.querySelectorAll('tbody tr')).toHaveLength(65)
 expect(d.querySelectorAll('[data-price-volume-range]')).toHaveLength(4)
 expect(d.querySelector('[data-price-volume-range="240"]').disabled).toBe(true)
 expect(d.querySelectorAll('tbody tr')[10].textContent).toContain('—')
 const chart=d.querySelector('.price-volume svg')
 d.defaultView.eval(d.querySelector('script').textContent)
 expect(d.querySelectorAll('.price-volume-bar')).toHaveLength(64)
 expect(d.querySelector('.price-volume-readout').textContent).toContain('132')
 chart.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))
 expect(d.querySelector('.price-volume-readout').textContent).toContain('131.5')
 d.querySelector('[data-price-volume-range="20"]').click()
 expect(d.querySelector('.price-volume-line').getAttribute('points').split(' ')).toHaveLength(20)
 expect(d.querySelector('[data-price-volume-range="20"]').getAttribute('aria-pressed')).toBe('true')
  expect(marketVariant({title:'贵州茅台量价走势图'})).toBe('price-volume')
  expect(marketVariant({title:'贵州茅台量价联动',prompt:'同时生成 market.price-volume 和 market.order-book'})).toBe('price-volume')
 expect(workbenchDesignTemplate({type:'market',title:'贵州茅台量价走势图'}).height).toBe(286)
})
it('rejects incomplete or fabricated price-volume data before creating a card',()=>{
 const base={version:1,type:'market',variant:'price-volume',title:'量价',asOf:'示例',labels:['一','二'],prices:[1,2],volumes:[10,null],priceUnit:'元',volumeUnit:'股'}
 expect(acceptArtifactOutput(JSON.stringify({...base,volumes:[10]}))).toBeUndefined()
 expect(acceptArtifactOutput(JSON.stringify({...base,volumes:[null,null]}))).toBeUndefined()
 expect(acceptArtifactOutput(JSON.stringify({...base,prices:[1,-2]}))).toBeUndefined()
 const output=acceptArtifactOutput(JSON.stringify(base))
 expect(workbenchMarketVariantIssue(output,'必须输出 market.price-volume 的结构化数据')).toBeNull()
})
it('renders both sides of a real order book and switches visible depth',()=>{
 const bids=Array.from({length:8},(_,i)=>({price:10-i*.01,size:100+i*10}))
 const asks=Array.from({length:8},(_,i)=>({price:10.01+i*.01,size:120+i*10}))
 const d=render({variant:'order-book',bids,asks,priceUnit:'元',sizeUnit:'手'})
 expect(d.querySelectorAll('.order-book-level')).toHaveLength(16)
 expect(d.querySelector('.order-book-toolbar strong').textContent).toBe('0.01 元')
 expect(d.querySelectorAll('.order-book-level:not([hidden])')).toHaveLength(10)
 d.defaultView.eval(d.querySelector('script').textContent)
 d.querySelector('[data-book-count="all"]').click()
 expect(d.querySelectorAll('.order-book-level:not([hidden])')).toHaveLength(16)
 const last=d.querySelectorAll('.order-book-level')[15]
 last.click()
 expect(d.querySelector('.order-book-readout').textContent).toContain('卖8 · 10.08 元 · 190 手')
  expect(marketVariant({title:'股票十档盘口'})).toBe('order-book')
  expect(marketVariant({title:'贵州茅台买卖盘口',prompt:'同时生成 market.price-volume 和 market.order-book'})).toBe('order-book')
 expect(workbenchDesignTemplate({type:'market',title:'股票十档盘口'}).width).toBe(536)
})
it('rejects invalid order book levels and zero-unit templates',()=>{
 const base={version:1,type:'market',variant:'order-book',title:'盘口',asOf:'示例',bids:[{price:10,size:100}],asks:[{price:10.01,size:120}],priceUnit:'元',sizeUnit:'手'}
 expect(acceptArtifactOutput(JSON.stringify({...base,bids:[{price:-1,size:100}]}))).toBeUndefined()
 expect(acceptArtifactOutput(JSON.stringify({...base,asks:[]}))).toBeUndefined()
 expect(acceptArtifactOutput(JSON.stringify({...base,sizeUnit:''}))).toBeUndefined()
 expect(workbenchMarketVariantIssue(acceptArtifactOutput(JSON.stringify(base)),'必须输出 market.order-book 的结构化数据')).toBeNull()
})
it('filters a fixed fund-flow chart by period and industry while keeping the full evidence table',()=>{
 const records=[
  {period:'本周',industry:'科技',inflow:20,outflow:10},
  {period:'上周',industry:'科技',inflow:5,outflow:12},
  {period:'本周',industry:'金融',inflow:3,outflow:8}
 ]
 const d=render({variant:'fund-flow',unit:'亿元',records})
 d.defaultView.eval(d.querySelector('script').textContent)
 expect(d.querySelector('.fund-flow-summary').textContent).toBe('3 项 · 净流入 -2 亿元')
 const period=d.querySelector('[data-flow-period]');period.value='本周';period.dispatchEvent(new d.defaultView.Event('change'))
 expect(d.querySelectorAll('.fund-flow-row:not([hidden])')).toHaveLength(2)
 const industry=d.querySelector('[data-flow-industry]');industry.value='科技';industry.dispatchEvent(new d.defaultView.Event('change'))
 expect(d.querySelector('.fund-flow-summary').textContent).toBe('1 项 · 净流入 10 亿元')
 d.querySelector('.fund-flow-row:not([hidden])').click()
 expect(d.querySelector('.fund-flow-readout').textContent).toContain('流入 20 亿元 · 流出 10 亿元 · 净额 10 亿元')
 expect(d.querySelectorAll('tbody tr')).toHaveLength(3)
 expect(marketVariant({title:'行业资金流向'})).toBe('fund-flow')
})
it('rejects unsupported fund-flow values rather than inventing a net amount',()=>{
 const base={version:1,type:'market',variant:'fund-flow',title:'流向',asOf:'模拟',unit:'亿元',records:[{period:'本周',industry:'科技',inflow:20,outflow:10}]}
 expect(acceptArtifactOutput(JSON.stringify({...base,records:[{period:'本周',industry:'科技',inflow:20,outflow:-1}]}))).toBeUndefined()
 expect(acceptArtifactOutput(JSON.stringify({...base,records:[]}))).toBeUndefined()
 expect(workbenchMarketVariantIssue(acceptArtifactOutput(JSON.stringify(base)),'必须输出 market.fund-flow 的结构化数据')).toBeNull()
})
it('shows a distinct valuation percentile band with range and keyboard readings',()=>{
 const labels=Array.from({length:65},(_,i)=>`第${i+1}日`),values=labels.map((_,i)=>20+i*.05)
 const bands={p10:17,p25:19,p50:21,p75:23,p90:25}
 const d=render({variant:'valuation-band',labels,values,bands,unit:'倍'})
 const chart=d.querySelector('.market-valuation-band svg')
 d.defaultView.eval(d.querySelector('script').textContent)
 expect(d.querySelectorAll('.valuation-band-middle')).toHaveLength(1)
 expect(d.querySelectorAll('.valuation-percentile')).toHaveLength(3)
 expect(d.querySelector('.valuation-readout').textContent).toContain('P75–P90')
 chart.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Home',bubbles:true}))
 expect(d.querySelector('.valuation-readout').textContent).toContain('第1日 · 当前 20 倍 · P25–P50')
 d.querySelector('[data-valuation-range="20"]').click()
 expect(d.querySelector('.valuation-line').getAttribute('points').split(' ')).toHaveLength(20)
 expect(d.querySelectorAll('tbody tr')).toHaveLength(65)
 expect(marketVariant({title:'白酒板块估值分位带'})).toBe('valuation-band')
})
it('rejects reversed quantile thresholds or missing valuation observations',()=>{
 const base={version:1,type:'market',variant:'valuation-band',title:'估值',asOf:'模拟',labels:['一','二'],values:[20,21],bands:{p10:17,p25:19,p50:21,p75:23,p90:25},unit:'倍'}
 expect(acceptArtifactOutput(JSON.stringify({...base,bands:{...base.bands,p75:18}}))).toBeUndefined()
 expect(acceptArtifactOutput(JSON.stringify({...base,values:[20]}))).toBeUndefined()
 expect(workbenchMarketVariantIssue(acceptArtifactOutput(JSON.stringify(base)),'必须输出 market.valuation-band 的结构化数据')).toBeNull()
})
it('computes fund drawdown from the historical peak and switches views without losing source rows',()=>{
 const d=render({variant:'equity-drawdown',labels:['第一日','第二日','第三日'],equity:[1,1.2,.9],benchmark:[1,1.1,1.2],unit:'元'})
 expect(d.querySelectorAll('tbody tr')).toHaveLength(3)
 expect(d.querySelectorAll('tbody tr')[2].textContent).toContain('-25%')
 const chart=d.querySelector('.market-equity-drawdown svg')
 d.defaultView.eval(d.querySelector('script').textContent)
 expect(d.querySelectorAll('.drawdown-benchmark')).toHaveLength(1)
 d.querySelector('[data-drawdown-view="drawdown"]').click()
 expect(d.querySelectorAll('.drawdown-area')).toHaveLength(1)
 expect(d.querySelectorAll('.drawdown-benchmark')).toHaveLength(0)
 expect(d.querySelector('.drawdown-readout').textContent).toContain('回撤 -25%')
 chart.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Home',bubbles:true}))
 expect(d.querySelector('.drawdown-readout').textContent).toContain('第一日 · 净值 1 元')
 expect(marketVariant({title:'基金净值与回撤'})).toBe('equity-drawdown')
})
it('rejects mismatched fund benchmark rather than drawing a false comparison',()=>{
 const base={version:1,type:'market',variant:'equity-drawdown',title:'净值',asOf:'模拟',labels:['一','二'],equity:[1,1.1],benchmark:[1,1.05],unit:'元'}
 expect(acceptArtifactOutput(JSON.stringify({...base,benchmark:[1]}))).toBeUndefined()
 expect(acceptArtifactOutput(JSON.stringify({...base,equity:[1,0]}))).toBeUndefined()
 expect(workbenchMarketVariantIssue(acceptArtifactOutput(JSON.stringify(base)),'必须输出 market.equity-drawdown 的结构化数据')).toBeNull()
})
it('preserves source names without URLs while rejecting unsafe source links',()=>{
 const d=render({variant:'heatmap',items:[{label:'农林牧渔',weight:16.35,change:-1.25}],sources:[{label:'通联 DataYes',url:''}]})
 expect(d.querySelector('.market-footer').textContent).toContain('通联 DataYes')
 expect(d.querySelector('.market-footer a')).toBeNull()
 expect(acceptArtifactOutput(JSON.stringify({version:1,type:'market',variant:'heatmap',title:'热力图',asOf:'2026-09-25',items:[{label:'农林牧渔',weight:16.35,change:-1.25}],sources:[{label:'危险链接',url:'javascript:alert(1)'}]}))).toBeUndefined()
})
it('validates real OHLC bounds instead of fabricating or accepting impossible candles',()=>{
 const candle={date:'2026-09-18',open:4493.21,high:4541.82,low:4480.46,close:4528.61,volume:128}
 expect(render({variant:'candlestick',candles:[candle]}).querySelector('canvas')).not.toBeNull()
 expect(acceptArtifactOutput(JSON.stringify({version:1,type:'market',variant:'candlestick',title:'走势',asOf:'2026-09-18',candles:[{...candle,high:4400}]}))).toBeUndefined()
})
it('keeps an OHLC candle when the source did not provide volume',()=>{
 const candle={date:'2026-09-18',open:4493.21,high:4541.82,low:4480.46,close:4528.61,volume:null}
 const d=render({variant:'candlestick',note:'历史成交量缺失',candles:[candle]})
 expect(d.querySelector('canvas')).not.toBeNull()
 expect(d.querySelector('tbody tr').textContent).toContain('—')
 expect(d.body.textContent).toContain('历史成交量缺失')
})
it('uses the host candlestick template for multiple stocks and available ranges',()=>{
 const candles=Array.from({length:65},(_,index)=>({date:`2026-09-${String(index+1).padStart(2,'0')}`,open:100+index,high:102+index,low:99+index,close:101+index,volume:index%2?null:1000+index}))
 const d=render({variant:'candlestick',datasets:[{symbol:'600519.SH',name:'贵州茅台',candles},{symbol:'000858.SZ',name:'五粮液',candles: candles.map(row=>({...row,open:row.open/2,high:row.high/2,low:row.low/2,close:row.close/2}))}]})
 expect(d.querySelectorAll('.market-candle-symbol option')).toHaveLength(2)
 expect(d.querySelectorAll('[data-candle-range]')).toHaveLength(4)
 expect(d.querySelector('script').textContent).toContain('60')
 expect(d.querySelectorAll('tbody tr')).toHaveLength(130)
})
it('shows a missing stock explicitly without inventing candles',()=>{
 const candle={date:'2026-09-18',open:100,high:102,low:99,close:101,volume:1000}
 const d=render({variant:'candlestick',datasets:[{symbol:'600519.SH',name:'贵州茅台',candles:[candle]},{symbol:'000858.SZ',name:'五粮液',candles:[],missing:'历史日线来源未返回'}]})
 expect(d.querySelectorAll('.market-candle-symbol option')).toHaveLength(2)
 expect(d.body.textContent).toContain('历史日线来源未返回')
 expect(d.querySelectorAll('tbody tr')).toHaveLength(1)
})
it('preserves sourced KPI details through the host metrics template',()=>{
 const output=acceptArtifactOutput(JSON.stringify({version:1,type:'kpi',title:'行业核心指标',items:[{label:'中证白酒',value:'6105.76 点',change:'-2.11%',detail:'2026-09-24 收盘 · 来源：行情接口'}]}))
 expect(output).toBeDefined()
 const w=new Window();w.document.write(JSON.parse(output).html)
 expect(w.document.querySelector('.market-detail').textContent).toContain('2026-09-24 收盘')
 expect(w.document.body.textContent).toContain('-2.11%')
 expect(acceptArtifactOutput(JSON.stringify({version:1,type:'kpi',title:'行业核心指标',items:[{label:'指标',value:{unexpected:true},detail:'来源'}]}))).toBeUndefined()
})
it('detects a model replacing the requested financial template with another one',()=>{
 const output=acceptArtifactOutput(JSON.stringify({version:1,type:'market',variant:'candlestick',title:'行情看板',asOf:'2026-09-24',candles:[{date:'2026-09-24',open:1,high:2,low:1,close:2,volume:null}]}))
 expect(workbenchMarketVariantIssue(output,'必须输出 market.table 的结构化数据')).toContain('market.table')
 expect(workbenchMarketVariantIssue(output,'必须输出 market.candlestick 的结构化数据')).toBeNull()
 expect(workbenchMarketVariantIssue(output,'本面板：贵州茅台 600519.SH、五粮液 000858.SZ；必须输出 market.candlestick 的结构化数据')).toContain('多标的')
})
it('shows only moving averages supported by the available candle count',()=>{
 const candle={date:'2026-09-18',open:4493.21,high:4541.82,low:4480.46,close:4528.61,volume:128}
 for(const [count,expected] of [[4,'下栏成交量'],[5,'MA5 · 下栏成交量'],[20,'MA5 · MA20 · 下栏成交量']]){
  const candles=Array.from({length:count},(_,i)=>({...candle,date:`2026-09-${String(i+1).padStart(2,'0')}`}))
  expect(render({variant:'candlestick',candles}).querySelector('.market-footer span').textContent).toBe(expected)
 }
})
it('uses one market surface and readable disclosure controls for new and saved charts',()=>{
 const candle={date:'2026-09-18',open:4493.21,high:4541.82,low:4480.46,close:4528.61,volume:128}
 const generated=render({variant:'candlestick',candles:[candle]}).documentElement.outerHTML
 expect(generated).toContain('ODYSSEY_MARKET_PRESENTATION_V2')
 expect(generated).toContain('background:var(--sherlock-surface)!important')
 expect(generated).toContain('min-height:32px')
 expect(compactHostDashboardHtml(generated)).toBe(generated)
 const legacy='<html><head><style>body{background:#292929}details{font-size:10px}</style></head><body data-sherlock-market="trend" data-sherlock-design="21m-20260923-v1"><details><summary>完整趋势数据</summary><table><tr><td>数据</td></tr></table></details></body></html>'
 const upgraded=compactHostDashboardHtml(legacy)
 expect(upgraded).toContain('ODYSSEY_MARKET_PRESENTATION_V2')
 expect(upgraded).toContain('min-height:32px')
 expect(upgraded).toContain('max-height:min(168px,calc(100vh - 72px))')
 expect(compactHostDashboardHtml(upgraded)).toBe(upgraded)
 expect(RESEARCH_COMPONENT_CONTROLS_CSS).toContain('body[data-sherlock-market] details>summary{background-color:var(--sherlock-surface)!important')
})
it('retains heatmap weights and market breadth counts without synthetic replacements',()=>{
 expect(render({variant:'heatmap',items:[{label:'银行',weight:20.3,change:.42},{label:'食品饮料',weight:18.1,change:-.63}]}).querySelectorAll('.market-tile')).toHaveLength(2)
 const d=render({variant:'breadth',advancing:3182,flat:214,declining:1886,metrics:[{label:'主力净流入 / 亿',value:'+128.46'},{label:'成交额 / 万亿',value:'1.846'}]})
 for(const s of ['3,182','214','1,886','+128.46','1.846'])expect(d.body.textContent).toContain(s)
 expect(d.querySelector('.market-participation').textContent).toBe('60.2%')
 expect(d.querySelector('style').textContent).toContain('grid-template-columns:minmax(220px,1fr) minmax(260px,1fr)')
 const old=d.documentElement.outerHTML.replace(' data-sherlock-breadth-refined=""','')
 expect(compactHostDashboardHtml(old)).toContain('data-sherlock-breadth-refined')
})
