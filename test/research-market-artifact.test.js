import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {acceptArtifactOutput, workbenchMarketVariantIssue} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {compactHostDashboardHtml,RESEARCH_COMPONENT_CONTROLS_CSS} from '../packages/dsh-research-task-runtime/html-artifact.js'
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
