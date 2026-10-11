import {describe,it,expect} from 'vitest'
import {financialWidgetSpec,changeWatchlist,financialIndicators,financialWidgetDefaults,synchronizeFinancialLinks} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
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
 it('选中项属于本自选列表，连接字段仅用于行情组件，旧配置继续合法',()=>{
  const watch={...financialWidgetDefaults('watchlist'),symbols:[hk,us]}
  const selected=changeWatchlist(watch,{op:'select',market:'US',code:'BABA'})
  expect(financialWidgetSpec(JSON.parse(JSON.stringify(selected))).selectedSymbol).toBe('US:BABA')
  expect(changeWatchlist(watch,{op:'select',market:'SH',code:'600519'})).toEqual(watch)
  expect(financialWidgetSpec({...watch,selectedSymbol:'SH:600519'})).toBeNull()
  expect(financialWidgetSpec({...watch,linkedWatchlistId:'watch-1'})).toBeNull()
  expect(financialWidgetSpec({...financialWidgetDefaults('quote'),linkedWatchlistId:'watch-1'})).not.toBeNull()
  expect(financialWidgetSpec({...financialWidgetDefaults('quote'),linkedWatchlistId:'\n'})).toBeNull()
 })
 it('MA使用完整窗口、零成交量合法，MACD可复核且不填缺失蜡烛',()=>{
  const bars=Array.from({length:40},(_,i)=>({date:'2026-01-'+String(i+1).padStart(2,'0'),open:i+1,high:i+2,low:i+.5,close:i+1,volume:0}))
  const v=financialIndicators(bars);expect(v.ma5.slice(0,4)).toEqual([null,null,null,null]);expect(v.ma5[4]).toBe(3)
  expect(v.macd).toHaveLength(40);expect(v.macd[0].histogram).toBe(0)
  expect(financialIndicators([])).toMatchObject({ma5:[],macd:[]})
 })
 it('新闻保存来源节点，串联同步与节点顺序无关，空来源清除旧股票',()=>{
  const node=(id,widget,extra={})=>({id,containerSpec:{...financialWidgetDefaults(widget),...extra}})
  const nodes=[node('news','news',{linkedSourceId:'quote',query:'原搜索'}),node('quote','quote',{linkedWatchlistId:'watch'}),node('watch','watchlist',{symbols:[hk,us],selectedSymbol:'US:BABA'})]
  expect(financialWidgetSpec(nodes[0].containerSpec)).not.toBeNull()
  expect(financialWidgetSpec({...nodes[1].containerSpec,linkedSourceId:'watch'})).toBeNull()
  expect(financialWidgetSpec({...nodes[0].containerSpec,linkedSourceId:'\n'})).toBeNull()
  const synced=synchronizeFinancialLinks(nodes)
  expect(synced[0].containerSpec).toMatchObject({linkedSourceId:'quote',symbols:[us],query:'原搜索'})
  expect(synced[1].containerSpec.symbols).toEqual([us])
  const emptied=synchronizeFinancialLinks(synced.map(n=>n.id==='watch'?node('watch','watchlist'):n))
  expect(emptied[0].containerSpec.symbols).toEqual([])
  expect(emptied[1].containerSpec.symbols).toEqual([])
  const removed=synchronizeFinancialLinks(synced.filter(n=>n.id!=='quote'))
  expect(removed[0].containerSpec.linkedSourceId).toBeUndefined()
  expect(removed[0].containerSpec.symbols).toEqual([us])
 })
 it('无效来源类型和自连接不会形成新闻链路',()=>{
  const nodes=['a','b'].map(id=>({id,containerSpec:{...financialWidgetDefaults('news'),linkedSourceId:id==='a'?'b':'a'}}))
  expect(synchronizeFinancialLinks(nodes).every(n=>!n.containerSpec.linkedSourceId)).toBe(true)
 })
})
