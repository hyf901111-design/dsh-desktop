import {afterEach,it,expect,vi} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'

let current
afterEach(async()=>{await current?.dispose();current=null})
const first={market:'SH',code:'600519',name:'贵州茅台'},second={market:'SZ',code:'000858',name:'五粮液'}
async function setup(desktop={}){
 const f=await financialClientFixture({financialWidget:{request:async q=>q.action==='history'?{bars:[{date:'2026-10-09',open:10,high:12,low:9,close:11,volume:100}]}:{quotes:q.symbols.map(s=>({...s,price:s.code==='600519'?1263:70.56,changePercent:.57})),receivedAt:'2026-10-10T12:00:00Z',source:'测试源'}},...desktop});current=f
 let watch,quote
 await f.act(async()=>{
  watch=f.workspace.createFinancialWidget('watchlist');quote=f.workspace.createFinancialWidget('quote')
  f.workspace.setArtifacts(f.workspace.getSnapshot().artifacts.map(n=>({...n,containerSpec:{...n.containerSpec,symbols:n.id===watch.id?[first,second]:[first]}})))
 })
 const spec=id=>f.workspace.getSnapshot().artifacts.find(n=>n.id===id)?.containerSpec
 const output=()=>f.host.querySelector('[data-financial-port=output]'),inlet=()=>f.host.querySelector('[data-financial-port=input]')
 const connect=async()=>{expect(output()).not.toBeNull();expect(inlet()).not.toBeNull();await f.event('click',output());await f.event('click',inlet())}
 return {...f,watch,quote,spec,output,inlet,connect}
}
it('底部节点连接后选中自选行原子切换行情，重开看板仍保存联动与选中项',async()=>{
 const f=await setup();await f.connect()
 expect(f.output().closest('footer')).not.toBeNull();expect(f.inlet().closest('footer')).not.toBeNull()
 await f.event('click',f.host.querySelector('[data-stock-code="000858"]'))
 expect(f.spec(f.watch.id).selectedSymbol).toBe('SZ:000858')
 expect(f.spec(f.quote.id)).toMatchObject({linkedWatchlistId:f.watch.id,symbols:[second]})
 expect(f.host.querySelector('[data-stock-code="000858"]').getAttribute('aria-selected')).toBe('true')
 await vi.waitFor(()=>expect(f.host.querySelector('.ew-quote-price-line').textContent).toContain('70.56'))
 const restored=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('financial-test').getSnapshot().artifacts
 expect(restored.find(n=>n.id===f.quote.id).containerSpec).toMatchObject({linkedWatchlistId:f.watch.id,symbols:[second]})
 expect(restored.find(n=>n.id===f.watch.id).containerSpec.selectedSymbol).toBe('SZ:000858')
})
it('未连接时选择不影响行情，连接时同步选中项，断开后保留行情并停止联动',async()=>{
 const f=await setup();await f.event('click',f.host.querySelector('[data-stock-code="000858"]'))
 expect(f.spec(f.quote.id).symbols).toEqual([first])
 await f.connect();expect(f.spec(f.quote.id).symbols).toEqual([second])
 await f.event('click',f.inlet());expect(f.spec(f.quote.id).linkedWatchlistId).toBeUndefined()
 await f.event('click',f.host.querySelector('[data-stock-code="600519"]'))
 expect(f.spec(f.quote.id).symbols).toEqual([second])
})
it('键盘选择与删除选中项同步行情，空列表清空行情而不残留已移除个股',async()=>{
 const f=await setup();await f.connect()
 await f.event('keydown',f.host.querySelector('[data-stock-code="600519"]'),{key:'ArrowDown'})
 expect(f.spec(f.quote.id).symbols).toEqual([second])
 await f.event('keydown',f.host.querySelector('[data-stock-code="000858"]'),{key:'Delete'})
 expect(f.spec(f.quote.id).symbols).toEqual([first])
 await f.event('keydown',f.host.querySelector('[data-stock-code="600519"]'),{key:'Delete'})
 expect(f.spec(f.quote.id).symbols).toEqual([])
 expect(f.spec(f.quote.id).linkedWatchlistId).toBe(f.watch.id)
})
it('连线取消不会更改行情，移除来源自动解除关系，撤销恢复联动',async()=>{
 const f=await setup();expect(f.output()).not.toBeNull();await f.event('click',f.output())
 await f.event('keydown',f.document.body,{key:'Escape'});await f.event('click',f.inlet())
 expect(f.spec(f.quote.id).linkedWatchlistId).toBeUndefined()
 await f.connect()
 await f.act(async()=>f.workspace.setArtifacts(f.workspace.getSnapshot().artifacts.filter(n=>n.id!==f.watch.id)))
 expect(f.spec(f.quote.id).linkedWatchlistId).toBeUndefined()
 expect(f.spec(f.quote.id).symbols).toEqual([first])
 await f.act(async()=>f.workspace.undo())
 expect(f.spec(f.quote.id).linkedWatchlistId).toBe(f.watch.id)
})
it('只读画布禁止建立联动与更改选中股票',async()=>{
 let shared=false;const f=await setup({researchBoards:{isSharedSession:()=>shared}})
 shared=true;await f.render();expect(f.output()).not.toBeNull();expect(f.output().disabled).toBe(true)
 await f.event('click',f.host.querySelector('[data-stock-code="000858"]'))
 expect(f.spec(f.watch.id).selectedSymbol).toBeUndefined();expect(f.spec(f.quote.id).symbols).toEqual([first])
})
it('拖动底部节点建立连接，行拖拽排序不误切换选中个股',async()=>{
 const f=await setup(),output=f.output(),input=f.inlet();expect(output).not.toBeNull()
 f.document.elementFromPoint=()=>input
 await f.event('pointerdown',output,{button:0,pointerId:10,clientX:300,clientY:240})
 await f.event('pointermove',f.document.body,{pointerId:10,clientX:550,clientY:580})
 await f.event('pointerup',f.document.body,{pointerId:10,clientX:550,clientY:580})
 expect(f.spec(f.quote.id).linkedWatchlistId).toBe(f.watch.id)
 const name=f.host.querySelector('[data-stock-code="000858"] .ew-watch-name')
 f.document.elementFromPoint=()=>f.host.querySelector('[data-stock-code="600519"]')
 await f.event('pointerdown',name,{button:0,pointerId:11,clientX:120,clientY:180})
 await f.event('pointermove',name,{pointerId:11,clientX:120,clientY:140})
 await f.event('pointerup',name,{pointerId:11,clientX:120,clientY:140})
 await f.event('click',name)
 expect(f.spec(f.watch.id).symbols).toEqual([second,first])
 expect(f.spec(f.quote.id).symbols).toEqual([first])
})
it('多个行情组件一起跟随，行情独立搜索新股票时解除自身联动',async()=>{
 const f=await setup();await f.connect();let another
 await f.act(async()=>{another=f.workspace.createFinancialWidget('quote')})
 await f.event('click',f.output());await f.event('click',f.host.querySelector(`[data-financial-port-node="${another.id}"]`))
 await f.event('click',f.host.querySelector('[data-stock-code="000858"]'))
 expect(f.spec(another.id).symbols).toEqual([second])
 const api=f.win.dshDesktop.financialWidget,request=api.request
 api.request=q=>q.action==='search'?Promise.resolve({symbols:[first]}):request(q)
 const search=f.host.querySelector(`[data-research-node-id="${f.quote.id}"] input[role=combobox]`)
 await f.input(search,'600519');await vi.waitFor(()=>expect(f.document.querySelector('.ew-financial-suggestions [role=option]')).not.toBeNull())
 await f.event('click',f.document.querySelector('.ew-financial-suggestions [role=option]'))
 expect(f.spec(f.quote.id).linkedWatchlistId).toBeUndefined()
 expect(f.spec(f.quote.id).symbols).toEqual([first])
 expect(f.spec(another.id).linkedWatchlistId).toBe(f.watch.id)
})
