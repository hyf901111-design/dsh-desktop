import {afterEach,it,expect,vi} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
import {financialWidgetDefaults,financialWidgetSpec,financialCanLink,synchronizeFinancialLinks} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
import {createResearchGrid} from '../packages/dsh-research-task-runtime/research-grid.js'

let current
afterEach(async()=>{vi.useRealTimers();await current?.dispose();current=null})
const first={market:'SH',code:'600519',name:'贵州茅台'},second={market:'SZ',code:'000858',name:'五粮液'}
const item=s=>({id:s.code,title:s.name+'回购公告',date:'2026-10-10',category:'回购进展',url:'https://data.eastmoney.com/notices/detail/'+s.code+'/AN202610091830270252.html'})
async function setup(){
 const bridge={request:vi.fn(async q=>q.action==='announcements'?{announcements:q.symbols.map(item),source:'东方财富',receivedAt:new Date().toISOString()}:q.action==='search'?{symbols:[first]}:q.action==='history'?{bars:[]}:{quotes:[]})}
 const f=await financialClientFixture({financialWidget:bridge});current=f
 let watch,quote,announcement
 await f.act(async()=>{
  watch=f.workspace.createFinancialWidget('watchlist');quote=f.workspace.createFinancialWidget('quote');announcement=f.workspace.createFinancialWidget('announcements')
  expect(announcement).not.toBeNull()
  f.workspace.setArtifacts(f.workspace.getSnapshot().artifacts.map(n=>({...n,containerSpec:{...n.containerSpec,symbols:n.id===watch.id?[first,second]:n.id===quote.id?[first]:[]}})))
 })
 const card=()=>f.host.querySelector(`[data-research-node-id="${announcement.id}"]`),spec=id=>f.workspace.getSnapshot().artifacts.find(n=>n.id===id).containerSpec,port=(id,side)=>f.host.querySelector(`[data-financial-port-node="${id}"][data-financial-port="${side}"]`)
 const drag=async(from,to)=>{
  f.document.elementFromPoint=()=>to||f.host.querySelector('[data-ework-grid]')
  await f.event('pointerdown',from,{button:0,pointerId:10,clientX:200,clientY:200})
  await f.event('pointermove',f.document.body,{pointerId:10,clientX:500,clientY:500})
  await f.event('pointerup',f.document.body,{pointerId:10,clientX:500,clientY:500})
 }
 return {...f,bridge,watch,quote,announcement,card,spec,port,drag}
}
it('公告契约接受两类来源，拒绝多证券和非法源，并复用通用最小尺寸',()=>{
 const announcement=financialWidgetDefaults('announcements')
 expect(announcement?.title).toBe('公告列表')
 expect(financialWidgetSpec({...announcement,symbols:[first],linkedSourceId:'watch'})).not.toBeNull()
 expect(financialWidgetSpec({...announcement,symbols:[first,second]})).toBeNull()
 expect(financialWidgetSpec({...announcement,linkedSourceId:'\n'})).toBeNull()
 expect(financialCanLink(financialWidgetDefaults('watchlist'),announcement)).toBe(true)
 expect(financialCanLink(financialWidgetDefaults('quote'),announcement)).toBe(true)
 expect(financialCanLink(financialWidgetDefaults('news'),announcement)).toBe(false)
 const grid=createResearchGrid(),m=grid.metrics(900)
 expect(grid.minimum({kind:'generated-container',containerSpec:announcement},m)).toEqual(grid.minimum({kind:'generated-container',containerSpec:{type:'text'}},m))
})
it('串联按来源顺序同步公告，删除来源保留主体并解除关系',()=>{
 const n=(id,widget,extra={})=>({id,containerSpec:{...financialWidgetDefaults(widget),...extra}})
 const nodes=[n('announcement','announcements',{linkedSourceId:'quote'}),n('quote','quote',{linkedWatchlistId:'watch'}),n('watch','watchlist',{symbols:[first,second],selectedSymbol:'SZ:000858'})]
 const synced=synchronizeFinancialLinks(nodes)
 expect(synced[0].containerSpec).toMatchObject({linkedSourceId:'quote',symbols:[second]})
 const detached=synchronizeFinancialLinks(synced.filter(node=>node.id!=='quote'))
 expect(detached[0].containerSpec.symbols).toEqual([second]);expect(detached[0].containerSpec.linkedSourceId).toBeUndefined()
})
it('激活菜单直接放置公告，空组件提供标题栏搜索，不请求综合公告',async()=>{
 const f=await setup()
 expect(f.card().querySelector('input[role=combobox]')).not.toBeNull()
 expect(f.card().textContent).toContain('在标题栏搜索并选择个股')
 expect(f.bridge.request.mock.calls.some(([q])=>q.action==='announcements')).toBe(false)
 await f.event('click',f.document.querySelector('[data-financial-library]'))
 expect(f.document.querySelector('[data-financial-place=announcements]').textContent).toContain('公告列表')
})
it('拖拽连接自选股或行情后公告跟随选中公司，隐藏连线仍保持联动',async()=>{
 const f=await setup(),input=f.port(f.announcement.id,'input')
 expect(input.closest('footer')).not.toBeNull();expect(f.port(f.announcement.id,'output')).toBeNull()
 await f.drag(f.port(f.watch.id,'output'),input)
 await vi.waitFor(()=>expect(f.card().textContent).toContain('贵州茅台回购公告'))
 expect(f.card().textContent).toContain('2026');expect(f.card().textContent).toContain('10/10');expect(f.card().textContent).toContain('回购进展')
 await f.drag(f.port(f.watch.id,'output'),f.port(f.quote.id,'input'))
 await f.drag(f.port(f.quote.id,'output'),input)
 await f.event('click',f.host.querySelector('[data-stock-code="000858"]'))
 await vi.waitFor(()=>expect(f.card().textContent).toContain('五粮液回购公告'))
 expect(f.card().textContent).not.toContain('贵州茅台回购公告')
 expect(f.spec(f.announcement.id)).toMatchObject({linkedSourceId:f.quote.id,symbols:[second]})
 await f.act(async()=>f.workspace.updateSelection([],'replace'))
 expect(f.host.querySelector('[data-financial-link]')).toBeNull()
 await f.drag(f.port(f.announcement.id,'input'))
 expect(f.spec(f.announcement.id).linkedSourceId).toBeUndefined();expect(f.spec(f.announcement.id).symbols).toEqual([second])
 await f.act(async()=>f.workspace.undo())
 const restored=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('financial-test').getSnapshot().artifacts
 expect(restored.find(n=>n.id===f.announcement.id).containerSpec).toMatchObject({linkedSourceId:f.quote.id,symbols:[second]})
})
it('手动选择公司解除公告自身联动，空来源清除旧公告而不查询综合列表',async()=>{
 const f=await setup();await f.drag(f.port(f.watch.id,'output'),f.port(f.announcement.id,'input'))
 await f.event('click',f.host.querySelector('[data-stock-code="000858"]'))
 const search=f.card().querySelector('input[role=combobox]')
 await f.input(search,'茅台')
 await vi.waitFor(()=>expect(f.document.querySelector('.ew-financial-suggestions [role=option]')).not.toBeNull())
 await f.event('click',f.document.querySelector('.ew-financial-suggestions [role=option]'))
 expect(f.spec(f.announcement.id)).toMatchObject({symbols:[first]});expect(f.spec(f.announcement.id).linkedSourceId).toBeUndefined()
 expect(f.spec(f.announcement.id).selectedSymbol).toBeUndefined()
 expect(f.bridge.request.mock.calls.find(([q])=>q.action==='search')[0]).not.toHaveProperty('includeCrypto')
 await f.drag(f.port(f.watch.id,'output'),f.port(f.announcement.id,'input'))
 await f.event('keydown',f.host.querySelector('[data-stock-code="600519"]'),{key:'Delete'})
 await f.event('keydown',f.host.querySelector('[data-stock-code="000858"]'),{key:'Delete'})
 await vi.waitFor(()=>expect(f.card().querySelector('.ew-news-title')).toBeNull())
 expect(f.card().textContent).toContain('等待上游选择个股')
 expect(f.bridge.request.mock.calls.filter(([q])=>q.action==='announcements').every(([q])=>q.symbols.length===1)).toBe(true)
})
it('公告快速切换时晚返回的旧响应不覆盖新主体，刷新失败保留当前公告',async()=>{
 const f=await setup(),pending=[],normal=f.bridge.request.getMockImplementation()
 f.bridge.request.mockImplementation(q=>q.action==='announcements'?new Promise(resolve=>pending.push({resolve})):normal(q))
 await f.drag(f.port(f.watch.id,'output'),f.port(f.announcement.id,'input'))
 await vi.waitFor(()=>expect(pending).toHaveLength(1))
 await f.event('click',f.host.querySelector('[data-stock-code="000858"]'))
 await vi.waitFor(()=>expect(pending).toHaveLength(2))
 await f.act(async()=>pending[1].resolve({announcements:[item(second)],source:'东方财富'}))
 await f.act(async()=>pending[0].resolve({announcements:[item(first)],source:'东方财富'}))
 expect(f.card().textContent).toContain('五粮液回购公告');expect(f.card().textContent).not.toContain('贵州茅台回购公告')
 f.bridge.request.mockRejectedValue(new Error('公开源暂不可用'))
 await f.act(async()=>f.card().querySelector('[data-financial-widget]').__eworkRefreshFinancial())
 expect(f.card().textContent).toContain('五粮液回购公告');expect(f.card().textContent).toContain('刷新失败，保留上次数据')
 expect(f.card().querySelector('footer .ew-financial-retry')).not.toBeNull()
})
it('公告每分钟自动刷新并提示有效数据更新，失败不闪动成功背景',async()=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval']})
 const f=await setup();await f.drag(f.port(f.watch.id,'output'),f.port(f.announcement.id,'input'))
 await vi.waitFor(()=>expect(f.card().querySelector('.ew-news-title')).not.toBeNull())
 await f.act(async()=>{await vi.advanceTimersByTimeAsync(60000)})
 expect(f.card().querySelector('.ew-financial-data-pulse')).not.toBeNull()
 expect(f.bridge.request.mock.calls.filter(([q])=>q.action==='announcements').at(-1)[0]).toMatchObject({refresh:true,symbols:[first]})
 f.bridge.request.mockRejectedValue(new Error('公开源暂不可用'))
 await f.act(async()=>{await vi.advanceTimersByTimeAsync(60000)})
 expect(f.card().querySelector('.ew-financial-data-pulse')).toBeNull()
 expect(f.card().textContent).toContain('贵州茅台回购公告')
})
