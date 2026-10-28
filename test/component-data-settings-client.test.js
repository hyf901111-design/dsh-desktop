import {afterEach,it,expect,vi} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'

let f
afterEach(async()=>{if(f)await f.dispose();f=null;vi.useRealTimers()})
const stock={code:'600519',market:'SH',name:'贵州茅台'}
const bars=[{date:'2026-10-08',open:100,high:103,low:99,close:102,volume:1000},{date:'2026-10-09',open:102,high:105,low:101,close:104,volume:2000}]
function service(){return {request:vi.fn(async q=>q.action==='history'?{bars,source:'腾讯财经',basis:'不复权',volumeUnit:'手',receivedAt:'2026-10-19T02:00:00Z'}:{quotes:(q.symbols||[]).map(s=>({...s,price:q.source==='backup'?106:104,source:q.source==='backup'?'新浪财经':'腾讯财经',asOf:'2026-10-09',quotedAt:'2026-10-09T07:00:00Z'})),source:q.source==='backup'?'新浪财经':'腾讯财经',receivedAt:'2026-10-19T02:00:00Z'})}}
async function setup(widget='quote',bridge=service(),extra={}){
 f=await financialClientFixture({financialWidget:bridge,...extra})
 await f.act(async()=>{const n=f.workspace.createFinancialWidget(widget);f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[stock]}}])})
 return {bridge,card:f.host.querySelector('[data-financial-widget]')}
}
async function open(card){const entry=card.querySelector('button.ew-financial-provenance');expect(entry).not.toBeNull();await f.event('click',entry);return f.document.querySelector('[role=dialog][aria-label="组件数据与自动更新"]')}
const spec=()=>f.workspace.getSnapshot().artifacts[0].containerSpec

it('opens the owning quote settings from its source, switches provider and persists interval without refetching on timer edits',async()=>{
 const {card,bridge}=await setup(),dialog=await open(card)
 expect(dialog.querySelector('header p').textContent).toBe(financialWidgetDefaults('quote').title);expect(f.document.querySelectorAll('.odyssey-data-settings')).toHaveLength(1)
 expect(dialog.querySelector('dl').textContent).toContain('2026/10/19')
 const source=dialog.querySelector('select[aria-label="数据源"]'),frequency=dialog.querySelector('select[aria-label="更新频率"]')
 expect([...source.options].map(o=>o.value)).toEqual(['default','backup'])
 expect(source.textContent).not.toContain('备用')
 await f.event('change',Object.assign(source,{value:'backup'}))
 expect(spec().dataSource).toBe('backup');expect(bridge.request.mock.calls.at(-1)[0].source).toBe('backup')
 const count=bridge.request.mock.calls.length
 await f.event('change',Object.assign(frequency,{value:'5'}));expect(spec()).toMatchObject({refreshMinutes:5,refreshEnabled:true,dataSource:'backup'});expect(bridge.request).toHaveBeenCalledTimes(count)
 await f.event('keydown',dialog,{key:'Escape'});expect(f.document.querySelector('.odyssey-data-settings')).toBeNull();expect(f.document.activeElement).toBe(card.querySelector('.ew-financial-provenance'))
 const restored=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('financial-test').getSnapshot().artifacts[0].containerSpec
 expect(restored).toMatchObject({refreshMinutes:5,refreshEnabled:true,dataSource:'backup'})
})
it('pauses and uses the selected interval, with manual mode stopping periodic requests',async()=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval']})
 const {card,bridge}=await setup('watchlist'),dialog=await open(card),frequency=dialog.querySelector('select[aria-label="更新频率"]')
 await f.event('change',Object.assign(frequency,{value:'5'}));const initial=bridge.request.mock.calls.length
 await f.act(async()=>vi.advanceTimersByTimeAsync(60000));expect(bridge.request).toHaveBeenCalledTimes(initial)
 await f.act(async()=>vi.advanceTimersByTimeAsync(240000));expect(bridge.request).toHaveBeenCalledTimes(initial+1)
 const pause=[...dialog.querySelectorAll('button')].find(b=>b.textContent==='暂停更新');await f.event('click',pause);expect(spec().refreshEnabled).toBe(false)
 const paused=bridge.request.mock.calls.length;await f.act(async()=>vi.advanceTimersByTimeAsync(600000));expect(bridge.request).toHaveBeenCalledTimes(paused)
 await f.event('change',Object.assign(frequency,{value:'0'}));expect(spec().refreshMinutes).toBe(0)
 await f.act(async()=>vi.advanceTimersByTimeAsync(600000));expect(bridge.request).toHaveBeenCalledTimes(paused)
 await f.event('click',[...dialog.querySelectorAll('button')].find(b=>b.textContent==='立即更新'));expect(bridge.request).toHaveBeenCalledTimes(paused+1)
})
it('retains valid chart bars, units and provenance when the new source returns only a quote',async()=>{
 const {card,bridge}=await setup(),chart=card.querySelector('.ew-price-chart svg'),dialog=await open(card)
 bridge.request.mockImplementation(async q=>q.action==='history'?{bars:[],source:'新浪财经',error:'备用K线暂不可用'}:{quotes:[{...stock,price:106,source:'新浪财经'}],source:'新浪财经',receivedAt:2000})
 await f.event('change',Object.assign(dialog.querySelector('select[aria-label="数据源"]'),{value:'backup'}))
 expect(card.querySelector('.ew-price-chart svg')).toBe(chart)
 expect(card.querySelector('.ew-quote-price-line strong').textContent).toBe('106.00')
 expect(card.querySelector('.ew-quote-ohlc').textContent).toContain('手')
 expect(card.querySelector('.ew-financial-provenance').title).toContain('图表来源：腾讯财经')
 expect(dialog.textContent).toContain('备用K线暂不可用')
})
it('retains an index sparkline and its original source when backup prices succeed but trend data fails',async()=>{
 const bridge=service();bridge.request.mockImplementation(async q=>({quotes:q.symbols.map(s=>({...s,price:100,series:[98,99,100],source:'腾讯财经'})),source:'腾讯财经'}))
 f=await financialClientFixture({financialWidget:bridge});await f.act(async()=>f.workspace.createFinancialWidget('indices'))
 const card=f.host.querySelector('[data-financial-widget=indices]'),dialog=await open(card),chart=card.querySelector('.ew-indices-grid svg')
 bridge.request.mockImplementation(async q=>({quotes:q.symbols.map(s=>({...s,price:110,series:[],source:'东方财富',seriesError:'备用走势暂不可用'})),source:'东方财富',errors:[{code:q.symbols[0].code,error:'备用走势暂不可用'}]}))
 await f.event('change',Object.assign(dialog.querySelector('select[aria-label="数据源"]'),{value:'backup'}))
 expect(card.querySelector('.ew-indices-grid svg')).toBe(chart)
 expect(card.querySelector('.ew-indices-grid strong').textContent).toBe('110.00')
 expect(dialog.textContent).toContain('备用走势暂不可用')
 expect(card.querySelector('.ew-financial-provenance').title).toContain('走势来源：腾讯财经')
})
it('ignores a late primary response after switching to the backup',async()=>{
 const {card,bridge}=await setup('watchlist');let release,pending
 bridge.request.mockImplementationOnce(()=>new Promise(resolve=>release=resolve))
 await f.act(async()=>{pending=card.__eworkRefreshFinancial()})
 const dialog=await open(card);await f.event('change',Object.assign(dialog.querySelector('select[aria-label="数据源"]'),{value:'backup'}))
 await f.act(async()=>{release({quotes:[{...stock,price:999,source:'腾讯财经'}],source:'腾讯财经'});await pending})
 expect(card.querySelector('.ew-watch-price').textContent).toBe('106.00')
})
it('suspends timers while the document is hidden and resumes with the persisted provider and frequency',async()=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval']})
 const {card,bridge}=await setup('watchlist'),dialog=await open(card)
 await f.event('change',Object.assign(dialog.querySelector('select[aria-label="数据源"]'),{value:'backup'}))
 Object.defineProperty(f.document,'visibilityState',{value:'hidden',configurable:true});await f.event('visibilitychange',f.document)
 const count=bridge.request.mock.calls.length;await f.act(async()=>vi.advanceTimersByTimeAsync(120000));expect(bridge.request).toHaveBeenCalledTimes(count)
 expect(card.querySelector('.ew-watch-price').textContent).toBe('106.00')
 Object.defineProperty(f.document,'visibilityState',{value:'visible',configurable:true});await f.event('visibilitychange',f.document)
 expect(bridge.request).toHaveBeenCalledTimes(count+1);expect(bridge.request.mock.calls.at(-1)[0].source).toBe('backup')
 await f.event('click',[...dialog.querySelectorAll('button')].find(b=>b.textContent==='暂停更新'))
 const paused=bridge.request.mock.calls.length
 Object.defineProperty(f.document,'visibilityState',{value:'hidden',configurable:true});await f.event('visibilitychange',f.document)
 Object.defineProperty(f.document,'visibilityState',{value:'visible',configurable:true});await f.event('visibilitychange',f.document)
 expect(bridge.request).toHaveBeenCalledTimes(paused)
})
it('opens generated component bindings from their bottom status and selects complete registered source profiles',async()=>{
 let binding={nodeId:'',status:'error',error:'接口暂不可用',intervalMinutes:1,enabled:true,requests:[{sourceName:'通联 DataYes MCP / call_api'}],sourceId:'default',sources:[{id:'default',name:'通联 DataYes MCP'},{id:'backup',name:'已绑定的备用接口'}]}
 const bridge={setVisible:vi.fn(async()=>{}),request:vi.fn(async(_id,q)=>q.action==='list'?[binding]:q.action==='configure'?(binding={...binding,...q.settings}):binding)}
 f=await financialClientFixture({componentData:bridge})
 await f.act(async()=>{const n=f.workspace.createFinancialWidget('watchlist');binding.nodeId=n.id;f.workspace.setArtifacts([{...n,title:'沪深300行业配置',containerSpec:{version:1,type:'html',title:'沪深300行业配置',html:'<h2>沪深300行业配置</h2><script type="application/json" id="sherlock-template-data">{"templateId":"market.metrics","version":"1"}</script>'}}])})
 const footer=f.host.querySelector('button[data-component-data-status]');expect(footer).not.toBeNull();await f.event('click',footer)
 const dialog=f.document.querySelector('.odyssey-data-settings');expect(dialog.textContent).toContain('沪深300行业配置');expect(dialog.textContent).toContain('接口暂不可用')
 await f.event('change',Object.assign(dialog.querySelector('select[aria-label="数据源"]'),{value:'backup'}))
 expect(bridge.request).toHaveBeenCalledWith('financial-test',{action:'configure',nodeId:binding.nodeId,settings:{sourceId:'backup'}})
 expect(bridge.request).toHaveBeenCalledWith('financial-test',{action:'refresh',nodeId:binding.nodeId})
})
