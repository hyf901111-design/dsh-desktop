import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
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
it('validates real OHLC bounds instead of fabricating or accepting impossible candles',()=>{
 const candle={date:'2026-09-18',open:4493.21,high:4541.82,low:4480.46,close:4528.61,volume:128}
 expect(render({variant:'candlestick',candles:[candle]}).querySelector('canvas')).not.toBeNull()
 expect(acceptArtifactOutput(JSON.stringify({version:1,type:'market',variant:'candlestick',title:'走势',asOf:'2026-09-18',candles:[{...candle,high:4400}]}))).toBeUndefined()
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
