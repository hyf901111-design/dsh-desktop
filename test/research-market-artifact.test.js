import {execFileSync} from 'node:child_process'
import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {getComponentSourceInfo} from '../scripts/lib/component-source-info.mjs'
import {acceptArtifactOutput, workbenchMarketVariantIssue, workbenchMarketRecencyIssue} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {compactHostDashboardHtml,RESEARCH_COMPONENT_CONTROLS_CSS} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {marketVariant,workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js'
const render=spec=>{const out=acceptArtifactOutput(JSON.stringify({version:1,type:'market',title:'源稿行情',asOf:'09.21 15:00 · 情景模拟',...spec}));expect(out).toBeDefined();const w=new Window();w.document.write(JSON.parse(out).html);return w.document}
it('keeps long trend methodology accessible without expanding the default card',()=>{
 const note='两期匹配产品，缺失不补零；收益不含分红。'.repeat(20);
 const d=render({variant:'trend',labels:['01','02'],series:[{name:'指标',values:[100,102]}],note});
 const details=d.querySelector('.market-methodology');
 expect(details).not.toBeNull();expect(details.open).toBe(false);
 expect(details.textContent).toContain(note);
 details.querySelector('summary').click();expect(details.open).toBe(true);
 expect(d.querySelectorAll('.trend-line')).toHaveLength(1);
})
it('retains trend axes and historical endpoints on refresh until the reader resets the range',()=>{
 const old=render({variant:'trend',labels:['01','02','03'],series:[{name:'指标',values:[1,2,3]}]});old.defaultView.eval(old.querySelector('script').textContent)
 const previous=JSON.parse(old.querySelector('svg').getAttribute('data-workbench-chart-view'))
 const fresh=render({variant:'trend',labels:['01','02','03','04'],series:[{name:'指标',values:[1,2,30,100]}]});fresh.defaultView.eval(fresh.querySelector('script').textContent)
 const chart=fresh.querySelector('svg');chart.dispatchEvent(new fresh.defaultView.CustomEvent('sherlock-chart-restore',{detail:previous}))
 expect(JSON.parse(chart.getAttribute('data-workbench-chart-view'))).toEqual(previous)
 expect(chart.querySelector('.trend-line').getAttribute('points').split(' ')).toHaveLength(3)
 const axis=[...chart.querySelectorAll('.trend-date-axis')]
 expect(axis.map(el=>el.firstChild.textContent)).toEqual(['01','02','03'])
 const middle=Number(axis[1].getAttribute('x'))
 expect(middle).toBe((Number(axis[0].getAttribute('x'))+Number(axis[2].getAttribute('x')))/2)
 chart.getBoundingClientRect=()=>({left:0,width:506});chart.dispatchEvent(new fresh.defaultView.PointerEvent('pointermove',{clientX:middle}))
 expect(chart.dataset.selectedIndex).toBe('1');expect(Number(chart.querySelector('.trend-crosshair').getAttribute('x1'))).toBe(middle)
 chart.dispatchEvent(new fresh.defaultView.MouseEvent('dblclick'))
 expect(JSON.parse(chart.getAttribute('data-workbench-chart-view')).max).toBeGreaterThan(100)
})
it.each(['price-volume','valuation-band'])('keeps %s axis and time range until a range button is clicked',variant=>{
 const labels=['01','02','03'],extra=variant==='price-volume'?{prices:[1,2,3],volumes:[5,10,15],priceUnit:'元',volumeUnit:'股'}:{values:[1,2,3],bands:{p10:1,p25:1.5,p50:2,p75:2.5,p90:3},unit:'倍'}
 const before=render({variant,labels,...extra});before.defaultView.eval(before.querySelector('script').textContent)
 const previous=JSON.parse(before.querySelector('svg').getAttribute('data-workbench-chart-view'))
 const fresh=render({variant,labels:[...labels,'04'],...extra,...(variant==='price-volume'?{prices:[1,2,30,100],volumes:[5,10,15,20]}:{values:[1,2,30,100]})});fresh.defaultView.eval(fresh.querySelector('script').textContent)
 const chart=fresh.querySelector('svg');chart.dispatchEvent(new fresh.defaultView.CustomEvent('sherlock-chart-restore',{detail:previous}))
 expect(JSON.parse(chart.getAttribute('data-workbench-chart-view'))).toEqual(previous)
 expect(chart.querySelector('polyline').getAttribute('points').split(' ')).toHaveLength(3)
 fresh.querySelector(variant==='price-volume'?'[data-price-volume-range="all"]':'[data-valuation-range="all"]').click()
 expect(JSON.parse(chart.getAttribute('data-workbench-chart-view')).max).toBeGreaterThan(100)
})
it('ignores a malformed neutral-only color matrix without losing any table data or inferring financial colors',()=>{
 const spec={version:1,type:'market',variant:'table',title:'一致预期',asOf:'2026-09-24',columns:['年度','净利润','EPS','PE'],rows:[['2026E','961.33','20.83','14.13']],tones:[['neutral','neutral','neutral']]}
 const d=render(spec)
 expect([...d.querySelectorAll('tbody td')].map(td=>td.textContent)).toEqual(spec.rows[0])
 expect(d.querySelectorAll('[data-tone=positive],[data-tone=negative]')).toHaveLength(0)
 expect(acceptArtifactOutput(JSON.stringify({...spec,tones:[['positive']]}))).toBeUndefined()
 expect(acceptArtifactOutput(JSON.stringify({...spec,rows:[['2026E','961.33']]}))).toBeUndefined()
 expect(spec.tones).toEqual([['neutral','neutral','neutral']])
})
it('renders source metrics with exact data and typography rather than free-form cards',()=>{
 const d=render({variant:'metrics',items:[{label:'上证指数',value:'3,912.48',detail:'+0.64%'},{label:'深证成指',value:'12,648.32',detail:'+1.12%'}]})
 expect(d.querySelector('h1')).toBeNull();expect(d.querySelectorAll('.market-value')).toHaveLength(2)
 expect(d.querySelector('.market-value').textContent).toBe('3,912.48');expect(d.querySelector('style').textContent).toContain('font-size:21px')
 expect(d.querySelector('.market-asof').textContent).toBe('09.21 15:00 · 情景模拟')
})
it('shows the actual quote date and unavailable-source disclosure in the metrics body',()=>{
 const asOf='2026-09-30 收盘 · 腾讯行情（通联本次不可用）'
 const d=render({variant:'metrics',asOf,items:[{label:'点位',value:'100 点'}],note:'已保留来源原始单位。',sources:[{label:'实际来源'}]})
 expect(d.body.querySelector('.market-footer').textContent).toContain(asOf)
 expect(d.body.querySelector('.market-footer').textContent).toContain('已保留来源原始单位')
 expect(d.body.querySelector('.market-footer').textContent).toContain('实际来源')
 expect(d.body.dataset.metricsFooterLines).toBe('3')
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
 const sourceInfo=getComponentSourceInfo({containerSpec:{html:d.documentElement.outerHTML}})
 expect(sourceInfo.records).toContainEqual(expect.objectContaining({label:'通联 DataYes',url:''}))
})
it('lets a reader inspect every genuine trend point with keyboard controls',()=>{
 const d=render({variant:'trend',labels:['2026-01','2026-02','2026-03'],series:[{name:'CPI 同比',values:[0.2,0.5,0.8]}]})
 const chart=d.querySelector('.market-trend svg')
 expect(chart.getAttribute('tabindex')).toBe('0')
 expect(d.querySelector('[data-trend-selected-date]').textContent).toBe('2026-03')
 expect(d.querySelector('[data-trend-point-value]').textContent).toBe('0.8')
 expect(d.querySelectorAll('.trend-selected-dot')).toHaveLength(1)
 d.defaultView.eval(d.querySelector('script').textContent)
 chart.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))
 expect(d.querySelector('[data-trend-selected-date]').textContent).toBe('2026-02')
 expect(d.querySelector('[data-trend-point-value]').textContent).toBe('0.5')
 expect(chart.dataset.selectedIndex).toBe('1')
 chart.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Home',bubbles:true}))
 expect(d.querySelector('.trend-readout').textContent).toContain('2026-01')
})
it('toggles trend series without hiding the final series or removing source rows',()=>{
 const d=render({variant:'trend',labels:['一月','二月'],series:[{name:'科技',values:[10,20]},{name:'医药',values:[30,40]}]})
 d.defaultView.eval(d.querySelector('script').textContent)
 const keys=[...d.querySelectorAll('[data-trend-series]')]
 expect(keys.map(key=>key.getAttribute('aria-pressed'))).toEqual(['true','true'])
 keys[0].click()
 expect(keys[0].getAttribute('aria-pressed')).toBe('false')
 expect(d.querySelectorAll('.trend-line')[0].style.display).toBe('none')
 expect(d.querySelectorAll('.trend-selected-dot')[0].style.display).toBe('none')
 expect(d.querySelector('[data-trend-readout-row="0"]').hidden).toBe(true)
 expect(d.querySelector('[data-trend-readout-row="1"] [data-trend-point-value]').textContent).toBe('40')
 expect(keys[1].disabled).toBe(true)
 keys[1].click()
 expect(d.querySelector('[data-trend-readout-row="1"]').hidden).toBe(false)
 keys[0].click()
 expect(d.querySelector('[data-trend-readout-row="0"]').hidden).toBe(false)
 expect(d.querySelector('[data-trend-readout-row="0"] [data-trend-point-value]').textContent).toBe('20')
 expect(keys[1].disabled).toBe(false)
 expect(d.querySelectorAll('tbody tr')).toHaveLength(2)
})
it('renders a fixed price-volume template with linked readings, real range controls and missing volume',()=>{
 const labels=Array.from({length:65},(_,i)=>`第 ${i+1} 日`)
 const prices=labels.map((_,i)=>100+i*.5),volumes=labels.map((_,i)=>i===10?null:1000+i*20)
 const d=render({variant:'price-volume',labels,prices,volumes,priceUnit:'元',volumeUnit:'股'})
 expect(d.querySelectorAll('tbody tr')).toHaveLength(65)
 expect(d.querySelectorAll('[data-price-volume-range]')).toHaveLength(3)
 expect(d.querySelector('[data-price-volume-range="240"]')).toBeNull()
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
 expect(workbenchDesignTemplate({type:'market',title:'贵州茅台量价走势图'}).height).toBe(310)
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
 expect(workbenchDesignTemplate({type:'market',title:'股票十档盘口'}).width).toBe(656)
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
 expect(d.querySelector('.fund-flow-summary').textContent).toBe('3 项 · 净流出 2 亿元')
 expect(d.querySelector('.fund-flow-readout').textContent).toContain('本周 · 科技 · 流入 20 亿元')
 const period=d.querySelector('[data-flow-period]');period.value='本周';period.dispatchEvent(new d.defaultView.Event('change'))
 expect(d.querySelectorAll('.fund-flow-row:not([hidden])')).toHaveLength(2)
 const industry=d.querySelector('[data-flow-industry]');industry.value='科技';industry.dispatchEvent(new d.defaultView.Event('change'))
 expect(d.querySelector('.fund-flow-summary').textContent).toBe('1 项 · 净流入 10 亿元')
 expect(d.querySelector('.fund-flow-row:not([hidden])').getAttribute('aria-pressed')).toBe('true')
 expect(d.querySelector('.fund-flow-readout').textContent).toContain('本周 · 科技 · 流入 20 亿元')
 d.querySelector('.fund-flow-row:not([hidden])').click()
 expect(d.querySelector('.fund-flow-readout').textContent).toContain('流入 20 亿元 · 流出 10 亿元 · 净额 10 亿元')
 period.value='上周';period.dispatchEvent(new d.defaultView.Event('change'))
 expect(d.querySelector('.fund-flow-summary').textContent).toBe('1 项 · 净流出 7 亿元')
 expect(d.querySelector('.fund-flow-readout').textContent).toContain('上周 · 科技 · 流入 5 亿元')
 industry.value='金融';industry.dispatchEvent(new d.defaultView.Event('change'))
 expect(d.querySelector('.fund-flow-summary').textContent).toBe('0 项 · 当前筛选无数据')
 expect(d.querySelector('.fund-flow-readout').textContent).toBe('当前筛选无数据')
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
it('calculates allocation shares and filters the fixed donut without changing evidence rows',()=>{
 const d=render({variant:'allocation-donut',items:[{label:'股票',value:50},{label:'债券',value:30},{label:'现金',value:20}],unit:'亿元'})
 d.defaultView.eval(d.querySelector('script').textContent)
 expect(d.querySelectorAll('.allocation-arc')).toHaveLength(3)
 expect(d.querySelector('.allocation-visible-total').textContent).toBe('当前显示合计 100 亿元')
 d.querySelector('[data-allocation-index="1"]').click()
 expect(d.querySelectorAll('.allocation-arc')).toHaveLength(2)
 expect(d.querySelector('.allocation-visible-total').textContent).toBe('当前显示合计 70 亿元')
 expect(d.querySelector('.allocation-readout').textContent).toContain('占当前显示 71.43%')
 expect(d.querySelectorAll('tbody tr')).toHaveLength(3)
 expect(marketVariant({title:'资产配置占比'})).toBe('allocation-donut')
})
it('rejects empty or nonpositive allocations',()=>{
 const base={version:1,type:'market',variant:'allocation-donut',title:'配置',asOf:'模拟',unit:'亿元',items:[{label:'股票',value:2},{label:'债券',value:1}]}
 expect(acceptArtifactOutput(JSON.stringify({...base,items:[{label:'股票',value:0},{label:'债券',value:1}]}))).toBeUndefined()
 expect(acceptArtifactOutput(JSON.stringify({...base,items:[{label:'股票',value:2}]}))).toBeUndefined()
 expect(workbenchMarketVariantIssue(acceptArtifactOutput(JSON.stringify(base)),'必须输出 market.allocation-donut 的结构化数据')).toBeNull()
})
it('derives every waterfall balance and exposes selectable change bars',()=>{
 const d=render({variant:'waterfall',start:100,changes:[{label:'收入',value:20},{label:'成本',value:-8}],unit:'亿元',startLabel:'期初',endLabel:'期末'})
 expect(d.querySelectorAll('tbody tr')).toHaveLength(4)
 expect(d.querySelectorAll('tbody tr')[3].textContent).toContain('112')
 d.defaultView.eval(d.querySelector('script').textContent)
 const bars=d.querySelectorAll('.waterfall-bar')
 expect(bars).toHaveLength(4)
 bars[2].dispatchEvent(new d.defaultView.Event('click'))
 expect(d.querySelector('.waterfall-readout').textContent).toContain('成本 -8 亿元 · 120 → 112 亿元')
 expect(marketVariant({title:'利润增减瀑布图'})).toBe('waterfall')
})
it('rejects nonnumeric waterfall adjustments',()=>{
 const base={version:1,type:'market',variant:'waterfall',title:'瀑布',asOf:'模拟',start:100,changes:[{label:'收入',value:20}],unit:'亿元'}
 expect(acceptArtifactOutput(JSON.stringify({...base,changes:[{label:'收入',value:'20'}]}))).toBeUndefined()
 expect(acceptArtifactOutput(JSON.stringify({...base,changes:[]}))).toBeUndefined()
 expect(workbenchMarketVariantIssue(acceptArtifactOutput(JSON.stringify(base)),'必须输出 market.waterfall 的结构化数据')).toBeNull()
})
it('computes funnel conversion and selects every stage without hiding evidence',()=>{
 const d=render({variant:'funnel',stages:[{label:'触达',count:1000},{label:'浏览',count:500},{label:'转化',count:125}],unit:'人'})
 expect(d.querySelectorAll('tbody tr')).toHaveLength(3)
 expect(d.querySelectorAll('tbody tr')[2].textContent).toContain('25%12.5%')
 d.defaultView.eval(d.querySelector('script').textContent)
 d.querySelectorAll('.funnel-stage')[2].click()
 expect(d.querySelector('.funnel-readout').textContent).toContain('转化 · 125 人 · 阶段转化 25% · 累计 12.5%')
 expect(marketVariant({title:'用户转化漏斗'})).toBe('funnel')
})
it('rejects increasing counts in a same-cohort funnel',()=>{
 const base={version:1,type:'market',variant:'funnel',title:'漏斗',asOf:'模拟',stages:[{label:'触达',count:100},{label:'转化',count:20}],unit:'人'}
 expect(acceptArtifactOutput(JSON.stringify({...base,stages:[{label:'触达',count:100},{label:'转化',count:120}]}))).toBeUndefined()
 expect(workbenchMarketVariantIssue(acceptArtifactOutput(JSON.stringify(base)),'必须输出 market.funnel 的结构化数据')).toBeNull()
})
it('filters the risk matrix by severity and cell, keeping every risk in its source table',()=>{
 const items=[{label:'供应链',probability:4,impact:4,detail:'模拟中断'},
  {label:'需求',probability:3,impact:5,detail:'模拟放缓'},
  {label:'维护',probability:2,impact:2,detail:'模拟维护'}]
 const d=render({variant:'risk-matrix',items})
 expect(d.querySelectorAll('.risk-cell')).toHaveLength(25)
 d.defaultView.eval(d.querySelector('script').textContent)
 d.querySelector('[data-risk-filter="high"]').click()
 expect(d.querySelectorAll('.risk-item:not([hidden])')).toHaveLength(2)
 d.querySelector('[data-risk-cell="4-4"]').click()
 expect(d.querySelectorAll('.risk-item:not([hidden])')).toHaveLength(1)
 expect(d.querySelector('.risk-readout').textContent).toContain('供应链 · 概率 4/5 · 影响 4/5 · 得分 16')
 d.querySelector('.risk-clear-cell').click()
 expect(d.querySelectorAll('.risk-item:not([hidden])')).toHaveLength(2)
 expect(d.querySelectorAll('tbody tr')).toHaveLength(3)
 expect(marketVariant({title:'项目风险矩阵'})).toBe('risk-matrix')
})
it('rejects risk scores outside the documented five-level inputs',()=>{
 const base={version:1,type:'market',variant:'risk-matrix',title:'风险',asOf:'模拟',items:[{label:'供应链',probability:4,impact:4}]}
 expect(acceptArtifactOutput(JSON.stringify({...base,items:[{label:'供应链',probability:6,impact:4}]}))).toBeUndefined()
 expect(acceptArtifactOutput(JSON.stringify({...base,items:[{label:'供应链',probability:2.5,impact:4}]}))).toBeUndefined()
 expect(workbenchMarketVariantIssue(acceptArtifactOutput(JSON.stringify(base)),'必须输出 market.risk-matrix 的结构化数据')).toBeNull()
})
it('keeps all nine new template types distinct when each panel repeats a shared workbench prompt',()=>{
 const cases=[['量价联动','price-volume'],['买卖盘口','order-book'],['行业资金流向','fund-flow'],['估值分位带','valuation-band'],['基金净值回撤','equity-drawdown'],['资产配置占比','allocation-donut'],['利润瀑布图','waterfall'],['客户转化漏斗','funnel'],['项目风险矩阵','risk-matrix']]
 const prompt=cases.map(([,variant])=>`market.${variant}`).join('、')
 for(const [title,variant] of cases)expect(marketVariant({title,prompt})).toBe(variant)
})
it('preserves source names without URLs while rejecting unsafe source links',()=>{
 const d=render({variant:'heatmap',items:[{label:'农林牧渔',weight:16.35,change:-1.25}],sources:[{label:'通联 DataYes',url:''}]})
 const sourceInfo=getComponentSourceInfo({containerSpec:{html:d.documentElement.outerHTML}})
 expect(sourceInfo.records).toContainEqual(expect.objectContaining({label:'通联 DataYes',url:''}))
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
 expect(d.querySelectorAll('[data-candle-range]:not([hidden])')).toHaveLength(5)
 expect(d.querySelector('script').textContent).toContain('60')
 expect(d.querySelectorAll('tbody tr')).toHaveLength(130)
})
it('offers only distinct usable candle ranges and updates their real coverage',()=>{
 const candles=Array.from({length:22},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,open:100,high:102,low:99,close:101,volume:null}));
 const d=render({variant:'candlestick',datasets:[{symbol:'A',name:'标的A',candles},{symbol:'B',name:'标的B',candles:candles.slice(-8)}]});
 const canvas=d.querySelector('canvas');
 canvas.getContext=()=>new Proxy({measureText:t=>({width:t.length*5})},{get:(o,k)=>k in o?o[k]:()=>{}});
 d.defaultView.ResizeObserver=class{observe(){}};
 d.defaultView.eval(d.querySelector('script').textContent);
 const usable=()=>[...d.querySelectorAll('[data-candle-range]')].filter(b=>!b.hidden);
 expect(usable().map(b=>b.textContent)).toEqual(['近5日','近10日','近20日','全部']);
 expect(usable().every(b=>!b.disabled)).toBe(true);
 expect(d.querySelector('.market-candle-coverage').textContent).toContain('20 个交易日');
 d.querySelector('[data-candle-range="5"]').click();
 expect(d.querySelector('.market-candle-coverage').textContent).toContain('5 个交易日');
 d.querySelector('[data-candle-range="all"]').click();
 expect(d.querySelector('.market-candle-coverage').textContent).toContain('22 个交易日');
 const symbol=d.querySelector('select');symbol.value='1';symbol.dispatchEvent(new d.defaultView.Event('change'));
 expect(usable().map(b=>b.textContent)).toEqual(['近5日','全部']);
 expect(d.querySelector('.market-candle-coverage').textContent).toContain('8 个交易日');
});
it('shows a missing stock explicitly without inventing candles',()=>{
 const candle={date:'2026-09-18',open:100,high:102,low:99,close:101,volume:1000}
 const d=render({variant:'candlestick',datasets:[{symbol:'600519.SH',name:'贵州茅台',candles:[candle]},{symbol:'000858.SZ',name:'五粮液',candles:[],missing:'历史日线来源未返回'}]})
 expect(d.querySelectorAll('.market-candle-symbol option')).toHaveLength(2)
 expect(d.body.textContent).toContain('历史日线来源未返回')
 expect(d.querySelectorAll('tbody tr')).toHaveLength(1)
})
it('preserves sourced KPI details through the dedicated KPI template',()=>{
 const output=acceptArtifactOutput(JSON.stringify({version:1,type:'kpi',title:'行业核心指标',items:[{label:'中证白酒',value:'6105.76 点',change:'-2.11%',detail:'2026-09-24 收盘 · 来源：行情接口'}]}))
 expect(output).toBeDefined()
 const w=new Window();w.document.write(JSON.parse(output).html)
 expect(w.document.querySelector('.indicator-fields').textContent).toContain('2026-09-24 收盘')
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
 expect(generated).toContain('ODYSSEY_MARKET_PRESENTATION_V3')
 expect(generated).toContain('background:var(--sherlock-surface)!important')
 expect(generated).toContain('min-height:32px')
 const normalized=compactHostDashboardHtml(generated)
 expect(normalized).toContain('data-workbench-default-open="component-details-v1"')
 expect(compactHostDashboardHtml(normalized)).toBe(normalized)
 const legacy='<html><head><style>body{background:#292929}details{font-size:10px}</style></head><body data-sherlock-market="trend" data-sherlock-design="21m-20260923-v1"><details><summary>完整趋势数据</summary><table><tr><td>数据</td></tr></table></details></body></html>'
 const upgraded=compactHostDashboardHtml(legacy)
 expect(upgraded).toContain('ODYSSEY_MARKET_PRESENTATION_V3')
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

it('lets a reader select every heatmap block with a keyboard and read the full data',()=>{
 const d=render({variant:'heatmap',items:[{label:'银行',weight:20.3,change:.42},{label:'食品饮料',weight:18.1,change:-.63},{label:'医药',weight:12,change:1.25}]})
 const tiles=[...d.querySelectorAll('.market-tile')]
 expect(tiles).toHaveLength(3)
 expect(tiles.every(tile=>tile.tagName==='BUTTON')).toBe(true)
 expect(d.querySelectorAll('.market-heat-data tbody tr')).toHaveLength(3)
 d.defaultView.eval(d.querySelector('script').textContent)
 tiles[1].dispatchEvent(new d.defaultView.MouseEvent('click',{bubbles:true}))
 expect(d.querySelector('.market-heat-readout').textContent).toContain('食品饮料 · 权重 18.1% · 涨跌 -0.63%')
 expect(tiles[1].getAttribute('aria-pressed')).toBe('true')
 tiles[1].dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))
 expect(d.querySelector('.market-heat-readout').textContent).toContain('医药 · 权重 12% · 涨跌 +1.25%')
 expect(tiles[2].getAttribute('aria-pressed')).toBe('true')
})

it('rejects an old index snapshot presented as the latest market data',()=>{
 const spec=asOf=>JSON.stringify({version:1,type:'market',variant:'metrics',title:'沪深300行情',asOf,items:[{label:'收盘点位',value:'3885.2459 点'}]})
 const request='沪深300指数最近交易日的行情指标组件'
 const now=new Date('2026-09-25T19:30:00Z')
 expect(workbenchMarketRecencyIssue(spec('2025-06-09 收盘'),request,now)).toContain('20260916 至 20260926')
 expect(workbenchMarketRecencyIssue(spec('2026-09-07 收盘'),request,now)).toContain('不能把旧年份或升序第一页写成“最近可得”')
 expect(workbenchMarketRecencyIssue(spec('2026-09-24 收盘'),request,now)).toBeNull()
 expect(workbenchMarketRecencyIssue(spec('历史资料：2025-06-09 收盘'),request,now)).toBeNull()
 expect(workbenchMarketRecencyIssue(spec('2025-06-09 收盘'),'沪深300指数模拟数据行情',now)).toBeNull()
 const trend=asOf=>JSON.stringify({version:1,type:'market',variant:'trend',title:'沪深300指数趋势',asOf,points:[{date:'2025-06-09',value:3885.25},{date:'2025-06-10',value:3890.5}]})
 expect(workbenchMarketRecencyIssue(trend('2025-06-09 至 2025-06-10'),request,now)).toContain('20260916 至 20260926')
 expect(workbenchMarketRecencyIssue(trend('2026-09-16 至 2026-09-24'),request,now)).toBeNull()
})

it('does not apply daily-quote recency rules to monthly and quarterly industry metrics',()=>{
 const spec=JSON.stringify({version:1,type:'market',variant:'metrics',title:'白酒行业核心指标',asOf:'2026年8月（月度）/ 2026Q2（季度）',items:[{label:'上市公司净利润',value:'749.55 亿元'},{label:'定基价格指数',value:'104.03'}]})
 const now=new Date('2026-09-26T01:00:00Z')
 expect(workbenchMarketRecencyIssue(spec,'本面板：白酒行业核心指标\n展示2026Q2利润和2026年8月价格指数\n仅生成本面板，优先使用 market 类型。来源、日期与单位就近标注；缺失数据明确说明，不伪造实时数据。',now)).toBeNull()
 expect(workbenchMarketRecencyIssue(spec,'最新白酒行业月度价格指数与季度利润',now)).toBeNull()
 const daily=JSON.stringify({version:1,type:'market',variant:'metrics',title:'季度观察：最新交易日行情',asOf:'2026-06-30',items:[{label:'收盘价',value:'1200 元'}]})
 expect(workbenchMarketRecencyIssue(daily,'季度观察：股票最新交易日行情',now)).not.toBeNull()
})

it('upgrades saved candle controls without replacing observations or unrelated HTML',()=>{
 const groups=[{name:'茅台',symbol:'600519.SH',candles:Array.from({length:22},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,open:100,high:102,low:99,close:101,volume:null}))}];
 const legacy=`<html><head></head><body data-sherlock-market="candlestick" data-sherlock-design="21m-20260923-v1"><div class="market-candle-controls"><div class="market-candle-ranges"><button disabled>近1年</button></div></div><canvas></canvas><script>(function candleRuntime(groups){return groups;} )(${JSON.stringify(groups)});</script></body></html>`.replace(';} )',';})');
 const upgraded=compactHostDashboardHtml(legacy);
 expect(upgraded).toContain('data-candle-controls-v2');
 expect(upgraded).toContain('data-candle-range="5"');
 expect(upgraded).toContain(JSON.stringify(groups));
 expect(upgraded).toContain('market-candle-coverage');
 expect(upgraded).not.toContain('<button disabled>');
 expect(compactHostDashboardHtml(upgraded)).toBe(upgraded);
 const custom=legacy.replace('data-sherlock-design="21m-20260923-v1"','');
 expect(compactHostDashboardHtml(custom)).toBe(custom);
});
it('keeps heatmap semantic colours and tile geometry out of generic button styling',()=>{
 const d=render({variant:'heatmap',items:[{label:'上涨',weight:50,change:1},{label:'下跌',weight:50,change:-1}]});
 const tile=d.querySelector('.market-tile');tile.setAttribute('aria-pressed','true');
 const rules=RESEARCH_COMPONENT_CONTROLS_CSS.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]+)\}/g);
 for(const [,selector,styles]of rules){
  if(!/background-color:|height:28px|padding:0/.test(styles))continue;
  expect(tile.matches(selector.trim())).toBe(false);
 }
 expect(tile.getAttribute('style')).toContain('market-positive');
});

it('executes the packaged preview upgrader with all candle dependencies present',()=>{
 const source="function buildResearchHtmlPreview(html, title = '') {\n  const theme = initialTheme === 'dark' ? 'dark' : 'light';\n return `<html><body>${html}</body></html>`; }";
 const groups=[{name:'<标的>',symbol:'A',candles:[{date:'2026-09-24',open:1,high:2,low:1,close:2,volume:null}]}];
 const saved=`<html><head></head><body data-sherlock-market="candlestick" data-sherlock-design="21m-20260923-v1"><div class="market-candle-controls"><div class="market-candle-ranges"><button disabled>近1年</button></div></div><script>(function candleRuntime(groups){} )(${JSON.stringify(groups)});</script></body></html>`.replace('{} )','{})');
 const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`
  import {patchLegacyDashboardPreview} from './scripts/lib/patch-research-board-client.mjs';
  import {runInNewContext} from 'node:vm';
  const patched=patchLegacyDashboardPreview(${JSON.stringify(source)}),context={initialTheme:'dark'};
  runInNewContext(patched,context);
  console.log(JSON.stringify({ordinary:context.buildResearchHtmlPreview('<main>test</main>'),saved:context.buildResearchHtmlPreview(${JSON.stringify(saved)}),idempotent:patchLegacyDashboardPreview(patched)===patched}));
 `],{encoding:'utf8'}));
 expect(result.ordinary).toContain('<main>test</main>');
 expect(result.saved).toContain('data-candle-controls-v2');
 expect(result.idempotent).toBe(true);
});
it('retains twelve allocation categories and allows selecting the tenth holding',()=>{
 const items=Array.from({length:12},(_,i)=>({label:'持仓'+(i+1),value:12-i}))
 const d=render({variant:'allocation-donut',items,unit:'%'})
 d.defaultView.eval(d.querySelector('script').textContent)
 expect(d.querySelectorAll('.allocation-arc')).toHaveLength(12)
 expect(d.querySelectorAll('tbody tr')).toHaveLength(12)
 d.querySelector('.allocation-color-10').dispatchEvent(new d.defaultView.Event('click'))
 expect(d.querySelector('.allocation-readout').textContent).toContain('持仓10 · 3 %')
 d.querySelector('[data-allocation-index="9"]').click()
 expect(d.querySelectorAll('.allocation-arc')).toHaveLength(11)
 expect(d.querySelector('.allocation-visible-total').textContent).toContain('75')
 expect(d.querySelector('style').textContent).toContain('.allocation-color-10')
 expect(d.querySelector('style').textContent).toContain('nth-child(10) i')
 expect(acceptArtifactOutput(JSON.stringify({version:1,type:'market',variant:'allocation-donut',title:'配置',asOf:'模拟',unit:'%',items:[...items,{label:'13',value:1}]}))).toBeUndefined()
})
