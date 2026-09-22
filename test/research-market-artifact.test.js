import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
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
it('validates real OHLC bounds instead of fabricating or accepting impossible candles',()=>{
 const candle={date:'2026-09-18',open:4493.21,high:4541.82,low:4480.46,close:4528.61,volume:128}
 expect(render({variant:'candlestick',candles:[candle]}).querySelector('canvas')).not.toBeNull()
 expect(acceptArtifactOutput(JSON.stringify({version:1,type:'market',variant:'candlestick',title:'走势',asOf:'2026-09-18',candles:[{...candle,high:4400}]}))).toBeUndefined()
})
it('retains heatmap weights and market breadth counts without synthetic replacements',()=>{
 expect(render({variant:'heatmap',items:[{label:'银行',weight:20.3,change:.42},{label:'食品饮料',weight:18.1,change:-.63}]}).querySelectorAll('.market-tile')).toHaveLength(2)
 const d=render({variant:'breadth',advancing:3182,flat:214,declining:1886,metrics:[{label:'主力净流入 / 亿',value:'+128.46'},{label:'成交额 / 万亿',value:'1.846'}]})
 for(const s of ['3,182','214','1,886','+128.46','1.846'])expect(d.body.textContent).toContain(s)
})
