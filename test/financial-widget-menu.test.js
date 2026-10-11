import {afterEach,it,expect,vi} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'

let current
afterEach(async()=>{if(current)await current.dispose();current=null})
const symbol={code:'600519',name:'贵州茅台',market:'SH'}

async function menu(){
 const f=await financialClientFixture({financialWidget:{request:vi.fn(async()=>({quotes:[{...symbol,price:1263,changePercent:0.57}]}))}})
 current=f
 await f.act(async()=>{
  const n=f.workspace.createFinancialWidget('watchlist')
  f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[symbol]}}])
 })
 await f.event('contextmenu',f.host.querySelector('.ew-watch-row'),{clientX:200,clientY:100})
 expect(f.document.querySelector('.ew-financial-row-menu')).not.toBeNull()
 return f
}

it('自选右键菜单点击组件空白区域关闭且不移除标的',async()=>{
 const f=await menu()
 await f.event('pointerdown',f.host.querySelector('.ew-watch-meta'),{button:0})
 expect(f.document.querySelector('.ew-financial-row-menu')).toBeNull()
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec.symbols).toHaveLength(1)
})

it('自选右键菜单点击拦截冒泡的股票名称仍关闭',async()=>{
 const f=await menu()
 await f.event('pointerdown',f.host.querySelector('.ew-watch-name'),{button:0,pointerId:1,clientX:200,clientY:100})
 expect(f.document.querySelector('.ew-financial-row-menu')).toBeNull()
})

it('自选右键菜单Esc关闭并将焦点还给股票行',async()=>{
 const f=await menu()
 await f.event('keydown',f.document.body,{key:'Escape'})
 expect(f.document.querySelector('.ew-financial-row-menu')).toBeNull()
 expect(f.document.activeElement).toBe(f.host.querySelector('.ew-watch-row'))
})

it('自选菜单内部点击只移除当前标的且菜单随即关闭',async()=>{
 const f=await menu(),button=f.document.querySelector('.ew-financial-row-menu [role=menuitem]')
 await f.event('pointerdown',button,{button:0})
 expect(f.document.querySelector('.ew-financial-row-menu')).not.toBeNull()
 await f.event('click',button)
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec.symbols).toHaveLength(0)
 expect(f.document.querySelector('.ew-financial-row-menu')).toBeNull()
})
it('组件库菜单点击拦截冒泡的组件正文或搜索框仍自动关闭',async()=>{
 const f=await menu();await f.event('keydown',f.document.body,{key:'Escape'})
 await f.event('click',f.document.querySelector('[data-financial-library]'));expect(f.document.querySelector('.ew-financial-library')).not.toBeNull()
 await f.event('pointerdown',f.host.querySelector('.ew-watch-name'),{button:0,pointerId:1})
 expect(f.document.querySelector('.ew-financial-library')).toBeNull()
})
