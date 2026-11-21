import {afterEach,it,expect,vi} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
import {mountUiLocalization,translateUiCopy} from '../src/preload/ui-localization'
import {financialIndexCatalog} from '../packages/dsh-research-task-runtime/financial-index-catalog.js'

let current,disposeLocale
afterEach(async()=>{disposeLocale?.();disposeLocale=undefined;await current?.dispose();current=undefined})

it('finds every built-in index by its displayed English name',()=>{
 for(const row of financialIndexCatalog())expect((row.symbol.name+' '+row.symbol.code+' '+row.keywords).toLowerCase()).toContain(translateUiCopy(row.symbol.name).toLowerCase())
})

it('translates financial controls, timestamps, chart units and connection help',()=>{
 for(const [source,english] of [
  ['组件库','Component library'],['配置指数','Configure indices'],['刷新行情与资讯','Refresh market data'],
  ['我的自选 · 7','My watchlist · 7'],['已选 12','Selected 12'],['6 项','6 items'],
  ['腾讯财经 · 行情 10/09 16:14','Tencent Finance · Quotes 10/09 16:14'],
  ['腾讯财经 / Yahoo Finance · 行情 各市场时刻','Tencent Finance / Yahoo Finance · Quotes Local market times'],
  ['获取 20:11','Fetched 20:11'],['每60秒刷新','Refresh every 60 seconds'],
  ['开 1,255.42  高 1,282.00  低 1,255.42  收 1,263.00','O 1,255.42  H 1,282.00  L 1,255.42  C 1,263.00'],
  ['成交量 3.51 万手','Volume 35.10K lots'],['VOL(5,10)  3.51 万手','VOL(5,10)  35.10K lots'],
  ['3 个标的未取得行情','Quotes unavailable for 3 symbols'],
  ['数据与自动更新','Data and auto-refresh'],['每 5 分钟刷新','Refresh every 5 minutes'],['每 1 小时','Every 1 hour'],
  ['新浪财经 / Yahoo Finance · 备用','Sina Finance / Yahoo Finance · Backup'],['巨潮资讯 · 备用','CNInfo · Backup'],
  ['拖到右侧节点改接 · 拖到空白处断开','Drag to a right port to reconnect · Drag to empty space to disconnect'],
  ['上移沪深300','Move CSI 300 up']
 ])expect(translateUiCopy(source)).toBe(english)
})

it('localizes actual built-in widgets and new menus live without changing source content or custom titles',async()=>{
 const stock={market:'SH',code:'600519',name:'研究'},f=await financialClientFixture({financialWidget:{request:async q=>{
  if(q.action==='news')return {news:[{id:'news',title:'重试',summary:'市场指数',source:'研究'}],source:'腾讯财经',receivedAt:'2026-10-11T12:00:00Z'}
  if(q.action==='history')return {bars:[{date:'2026-10-09',open:10,high:12,low:9,close:11,volume:35100}],volumeUnit:'手'}
  return {quotes:q.symbols.map(s=>({...s,price:11,changePercent:1,series:[10,11],asOf:'2026-10-09'})),source:'腾讯财经',receivedAt:'2026-10-11T12:00:00Z'}
 }}},{refreshState:true});current=f
 let watch,quote,indices,news
 await f.act(async()=>{
  news=f.workspace.createFinancialWidget('news');watch=f.workspace.createFinancialWidget('watchlist');quote=f.workspace.createFinancialWidget('quote');indices=f.workspace.createFinancialWidget('indices')
  f.workspace.setArtifacts(f.workspace.getSnapshot().artifacts.map(n=>n.id===watch.id||n.id===quote.id?{...n,containerSpec:{...n.containerSpec,symbols:[stock]}}:n))
 })
 disposeLocale=mountUiLocalization(f.document)
 const card=id=>f.host.querySelector(`[data-research-node-id="${id}"]`)
 await f.act(async()=>{f.document.documentElement.dataset.odysseyLocale='en';await vi.waitFor(()=>expect(card(watch.id).querySelector('.ew-grid-title').textContent).toBe('Watchlist'))})
 expect(card(watch.id).querySelector('.ew-watch-meta').textContent).toContain('My watchlist · 1')
 expect(card(watch.id).querySelector('.ew-watch-columns').textContent).toBe('Name / CodeLastChange')
 expect(card(watch.id).querySelector('.ew-watch-name strong').textContent).toBe('研究')
 expect(card(quote.id).querySelector('.ew-quote-periods').textContent).toBe('IntradayDailyWeeklyMonthlyYearly')
 expect(card(quote.id).querySelector('input').getAttribute('placeholder')).toBe('Search code or name')
 expect(card(indices.id).querySelector('.ew-indices-grid').textContent).toContain('CSI 300')
 expect(card(news.id).querySelector('.ew-news-title').textContent).toBe('重试')
 expect(card(news.id).querySelector('.ew-news-summary').textContent).toBe('市场指数')
 expect(card(news.id).querySelector('.ew-news-source').textContent).toBe('研究')
 await f.act(async()=>{
  f.workspace.setArtifacts(f.workspace.getSnapshot().artifacts.map(n=>n.id===quote.id?{...n,containerSpec:{...n.containerSpec,linkedWatchlistId:watch.id}}:n))
  f.workspace.updateSelection([quote.id],'replace')
 })
 await f.act(async()=>{await vi.waitFor(()=>expect(f.host.querySelector('[data-financial-link] title').textContent).toBe('Right-click to disconnect'))})
 await f.event('click',card(indices.id).querySelector('[data-workbench-more]'))
 await f.act(async()=>{await vi.waitFor(()=>expect(f.document.querySelector('[role=menu]').textContent).toContain('Configure indices'))})
 const configure=[...f.document.querySelectorAll('[role=menuitem]')].find(el=>el.textContent==='Configure indices')
 await f.event('click',configure)
 await f.act(async()=>{await vi.waitFor(()=>expect(f.document.querySelector('.ew-financial-indices-settings').textContent).toContain('Restore defaults'))})
 expect(f.document.querySelector('.ew-financial-index-options').textContent).toContain('SSE Composite')
 expect(f.document.querySelector('.ew-financial-index-groups').textContent).toContain('Asia Pacific')
 const search=f.document.querySelector('.ew-financial-indices-settings input')
 for(const name of ['Dow Jones Industrial Average','Nikkei 225','TAIEX','S&P/ASX 200','S&P/TSX Composite']){
  await f.input(search,name)
  await f.act(async()=>{await vi.waitFor(()=>expect(f.document.querySelector('.ew-financial-index-options').textContent).toContain(name))})
  expect(f.document.querySelectorAll('.ew-financial-index-options [role=menuitemcheckbox]')).toHaveLength(1)
 }
 await f.event('keydown',f.document.body,{key:'Escape'})
 await f.event('click',f.document.querySelector('[data-financial-library]'))
 await f.act(async()=>{await vi.waitFor(()=>expect(f.document.querySelector('.ew-financial-library').textContent).toContain('Announcements'))})
 expect(f.document.querySelector('.ew-financial-library').textContent).toContain('Market panel')
 expect(f.document.querySelector('.ew-financial-library [aria-label="Close component library"]')).not.toBeNull()
 await f.event('pointerdown',f.host)
 await f.act(async()=>f.workspace.renameNode(watch.id,'研究'))
 expect(card(watch.id).querySelector('.ew-grid-title').textContent).toBe('研究')
 await f.act(async()=>{f.document.documentElement.dataset.odysseyLocale='zh';await vi.waitFor(()=>expect(card(quote.id).querySelector('.ew-quote-periods').textContent).toBe('分时日K周K月K年K'))})
 expect(card(indices.id).querySelector('.ew-indices-grid').textContent).toContain('沪深300')
 expect(card(quote.id).querySelector('input').value).toBe('600519 · 研究')
 expect(f.workspace.getSnapshot().artifacts.find(n=>n.id===indices.id).containerSpec.symbols[0].name).toBe('沪深300')
})

it('translates the news state before the source or publication time is known',()=>{
 expect(['未取得数据','来源未标注','资讯时点未确认'].map(value=>translateUiCopy(value))).toEqual(['No data yet','Source not specified','News time unconfirmed'])
})
