import {describe,it,expect} from 'vitest'
import {financialWidgetSpec,changeWatchlist,financialIndicators,financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
const hk={code:'09988',name:'阿里巴巴-W',market:'HK'},us={code:'BABA',name:'阿里巴巴',market:'US'}
describe('固定金融组件持久化契约',()=>{
 it('仅四种组件；重复代码按市场区分，拒绝未知字段与非有限配置',()=>{
  expect(financialWidgetDefaults('watchlist').symbols).toEqual([])
  expect(financialWidgetSpec({...financialWidgetDefaults('watchlist'),symbols:[hk,us]})).not.toBeNull()
  expect(financialWidgetSpec({...financialWidgetDefaults('watchlist'),symbols:[hk,hk]})).toBeNull()
  expect(financialWidgetSpec({...financialWidgetDefaults('quote'),apiKey:'never'})).toBeNull()
  expect(financialWidgetDefaults('snapshot')).toBeNull()
 })
 it('重复添加不丢行，移动/删除保留其余配置；空列表合法',()=>{
  const s={...financialWidgetDefaults('watchlist'),symbols:[hk,us]}
  expect(changeWatchlist(s,{op:'add',symbol:hk})).toEqual(s)
  expect(changeWatchlist(s,{op:'move',from:0,to:1}).symbols).toEqual([us,hk])
  expect(changeWatchlist(s,{op:'remove',market:'HK',code:'09988'}).symbols).toEqual([us])
  expect(changeWatchlist(s,{op:'move',from:-1,to:1})).toEqual(s)
 })
 it('MA使用完整窗口、零成交量合法，MACD可复核且不填缺失蜡烛',()=>{
  const bars=Array.from({length:40},(_,i)=>({date:'2026-01-'+String(i+1).padStart(2,'0'),open:i+1,high:i+2,low:i+.5,close:i+1,volume:0}))
  const v=financialIndicators(bars);expect(v.ma5.slice(0,4)).toEqual([null,null,null,null]);expect(v.ma5[4]).toBe(3)
  expect(v.macd).toHaveLength(40);expect(v.macd[0].histogram).toBe(0)
  expect(financialIndicators([])).toMatchObject({ma5:[],macd:[]})
 })
})
