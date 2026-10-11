import {afterEach,it,expect,vi} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
let f
afterEach(async()=>{await f?.dispose();f=null})
const find=(root,text)=>[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===text)
async function setup(){
 f=await financialClientFixture({financialWidget:{request:vi.fn(async q=>({quotes:q.symbols.map(s=>({...s,price:100,changePercent:1,series:[98,99,100]})),source:'测试行情'}))}})
 await f.act(async()=>f.workspace.createFinancialWidget('indices'))
 await f.event('click',f.host.querySelector('[data-workbench-more]'))
 const entry=find(f.document.querySelector('[role=menu][aria-label="组件更多操作"]'),'配置指数');expect(entry).toBeDefined();await f.event('click',entry)
 return f.document.querySelector('[aria-label="配置指数"]')
}
it('更多菜单配置国内外指数，应用后按所选顺序展示并持久恢复',async()=>{
 const panel=await setup();expect(panel).not.toBeNull()
 const input=panel.querySelector('input[type=search]');await f.input(input,'日经')
 const nikkei=panel.querySelector('[role=menuitemcheckbox]');expect(nikkei.textContent).toContain('日经225');await f.event('click',nikkei)
 await f.input(input,'');await f.event('click',find(panel,'已选 7'))
 const selected=[...panel.querySelectorAll('[role=menuitemcheckbox]')];await f.event('click',selected[0])
 await f.event('click',panel.querySelector('[aria-label="上移日经225"]'))
 await f.event('click',find(panel,'应用'))
 expect(f.document.querySelector('[aria-label="配置指数"]')).toBeNull()
 const symbols=f.workspace.getSnapshot().artifacts[0].containerSpec.symbols
 expect(symbols.map(s=>s.name)).toEqual(['上证指数','深证成指','创业板指','科创50','日经225','上证50'])
 await vi.waitFor(()=>expect(f.host.querySelector('.ew-indices-grid').textContent).toContain('日经225'))
 const reopened=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('financial-test');expect(reopened.getSnapshot().artifacts[0].containerSpec.symbols).toEqual(symbols)
})
it('取消和点击外部不写入草稿，恢复默认仍须应用',async()=>{
 let panel=await setup();const initial=f.workspace.getSnapshot().artifacts[0].containerSpec.symbols
 await f.event('click',panel.querySelector('[role=menuitemcheckbox]'));await f.event('pointerdown',f.host.querySelector('.ew-indices-grid'))
 expect(f.document.querySelector('[aria-label="配置指数"]')).toBeNull();expect(f.workspace.getSnapshot().artifacts[0].containerSpec.symbols).toEqual(initial)
 await f.event('click',f.host.querySelector('[data-workbench-more]'));await f.event('click',find(f.document.querySelector('[role=menu][aria-label="组件更多操作"]'),'配置指数'));panel=f.document.querySelector('[aria-label="配置指数"]')
 await f.event('click',panel.querySelector('[role=menuitemcheckbox]'));await f.event('click',find(panel,'恢复默认'));await f.event('click',find(panel,'应用'))
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec.symbols).toEqual(initial)
})
