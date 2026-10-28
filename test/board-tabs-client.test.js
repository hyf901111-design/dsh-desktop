import {afterEach,it,expect,vi} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
let f
afterEach(async()=>{await f?.dispose();f=null})
const fixture=async()=>f=await financialClientFixture({}, {boardTabs:true,sourceTransform:source=>source.replace('exports.ResearchCanvas = ResearchCanvas;',"exports.__setBoardTabsPlanningIntent=value=>odysseyCreationIntents.set('financial-test',value);exports.ResearchCanvas = ResearchCanvas;")})
const nav=w=>w.getSnapshot().artifacts.find(n=>n.containerSpec?.type==='board-tabs')
async function settings(f){await f.event('click',f.document.querySelector('[data-board-tabs-more]'));await f.event('click',[...f.document.querySelectorAll('[role=menuitem]')].find(n=>n.textContent==='页签设置'))}
it('库中放置页签只作用于当前看板，重复放置复用；切页空白且新建归入当前页',async()=>{
 const f=await fixture();let original
 await f.act(()=>{original=f.workspace.createFinancialWidget('indices')})
 await f.event('click',f.document.querySelector('[data-financial-library]'))
 const entry=f.document.querySelector('[data-financial-place="board-tabs"]');expect(entry).not.toBeNull()
 await f.event('click',entry)
 expect(nav(f.workspace).containerSpec.tabs.map(t=>t.nodeIds)).toEqual([[original.id],[]])
 const n=nav(f.workspace);await f.act(()=>f.workspace.createBoardTabs());expect(f.workspace.getSnapshot().artifacts.filter(n=>n.containerSpec?.type==='board-tabs')).toHaveLength(1)
 await f.event('click',f.document.querySelectorAll('[data-board-tab]')[1])
 expect(f.host.querySelector('[data-research-node-id="'+original.id+'"]')?.hasAttribute('data-board-tab-hidden')).toBe(true)
 expect(f.document.querySelector('[data-board-tabs-nav]')).not.toBeNull()
 await f.act(()=>f.workspace.createFinancialWidget('watchlist'))
 expect(nav(f.workspace).containerSpec.tabs[1].nodeIds).toHaveLength(1)
 expect(f.registry.for('other').getSnapshot().artifacts).toHaveLength(0)
 expect(nav(f.workspace).id).toBe(n.id)
})

it('通过真实设置控件改名、新增多页、排序，保存前背景不变，空名重名阻止保存',async()=>{
 const f=await fixture();await f.act(()=>f.workspace.createBoardTabs());await settings(f)
 await f.input(f.document.querySelector('[aria-label="页签 1 名称"]'),'市场面')
 for(let i=0;i<10;i++)await f.event('click',f.document.querySelector('.ew-board-tabs-add'))
 expect(f.document.querySelectorAll('[data-tab-row]')).toHaveLength(12)
 expect(nav(f.workspace).containerSpec.tabs).toHaveLength(2)
 const rows=[...f.document.querySelectorAll('[data-tab-row]')],last=rows.at(-1).getAttribute('data-tab-row')
 await f.event('keydown',rows.at(-1).querySelector('.ew-board-tabs-grip'),{key:'ArrowUp'})
 expect(f.document.querySelectorAll('[data-tab-row]')[10].getAttribute('data-tab-row')).toBe(last)
 await f.event('click',f.document.querySelector('[data-board-tabs-save]'))
 expect(nav(f.workspace).containerSpec.tabs).toHaveLength(12)
 expect(nav(f.workspace).containerSpec.tabs[0].name).toBe('市场面')
 await settings(f)
 await f.input(f.document.querySelectorAll('[data-tab-name]')[1],'市场面')
 await f.event('click',f.document.querySelector('[data-board-tabs-save]'))
 expect(f.document.querySelector('[role=alert]').textContent).toContain('重复')
 expect(nav(f.workspace).containerSpec.tabs[1].name).toBe('页签 2')
 await f.event('keydown',f.document.body,{key:'Escape'})
 expect(f.document.querySelector('.ew-board-tabs-dialog')).toBeNull()
})

it('删除含内容页签确认可取消、草稿撤销，Escape只关闭最上层确认',async()=>{
 const f=await fixture();await f.act(()=>{f.workspace.createFinancialWidget('indices');f.workspace.createBoardTabs()});await settings(f)
 await f.event('click',f.document.querySelector('.ew-board-tabs-delete'))
 expect(f.document.querySelectorAll('[role=dialog]')).toHaveLength(2)
 expect(f.document.querySelectorAll('[role=dialog]')[1].textContent).toContain('其中 1 个组件')
 await f.event('keydown',f.document.body,{key:'Escape'})
 expect(f.document.querySelectorAll('[role=dialog]')).toHaveLength(1)
 await f.event('click',f.document.querySelector('.ew-board-tabs-delete'))
 await f.event('click',f.document.querySelector('.ew-board-tabs-danger'))
 expect(f.document.querySelectorAll('[data-tab-row]')).toHaveLength(1)
 expect(f.document.querySelector('.ew-board-tabs-delete').disabled).toBe(true)
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(2)
 await f.event('click',f.document.querySelector('.ew-board-tabs-undo button'))
 expect(f.document.querySelectorAll('[data-tab-row]')).toHaveLength(2)
 await f.event('click',f.document.querySelector('[data-board-tabs-cancel]'))
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(2)
})

it('真实pointer拖动提供接收提示与缩略，悬停不切页，释放移动且撤销，Escape恢复',async()=>{
 const f=await fixture();let a;await f.act(()=>{a=f.workspace.createFinancialWidget('indices');f.workspace.createBoardTabs()})
 const source=f.host.querySelector('[data-research-node-id="'+a.id+'"]'),handle=source.querySelector('[data-workbench-drag-handle]'),tabs=[...f.document.querySelectorAll('[data-board-tab]')],before=nav(f.workspace).containerSpec
 source.getBoundingClientRect=()=>({left:12,top:120,right:675,bottom:580,width:663,height:460})
 f.document.querySelector('[data-board-tabs-nav]').getBoundingClientRect=()=>({left:12,top:12,right:988,bottom:46,width:976,height:34})
 f.document.querySelector('.ew-board-tabs-list').getBoundingClientRect=()=>({left:16,top:16,right:960,bottom:42,width:944,height:26})
 tabs.forEach((tab,i)=>tab.getBoundingClientRect=()=>({left:16+i*68,top:16,right:80+i*68,bottom:42,width:64,height:26}))
 await f.event('pointerdown',handle,{button:0,pointerId:1,clientX:150,clientY:130})
 expect(tabs[1].hasAttribute('data-tab-accept')).toBe(false)
 await f.event('pointermove',f.win,{pointerId:1,clientX:170,clientY:130})
 expect(tabs[1].hasAttribute('data-tab-accept')).toBe(false)
 await f.event('pointermove',f.win,{pointerId:1,clientX:100,clientY:28})
 expect(tabs[1].hasAttribute('data-tab-accept')).toBe(true)
 expect(f.document.querySelector('.ew-board-tabs-live-preview').hasAttribute('data-thumbnail')).toBe(true)
 expect(f.document.querySelector('.ew-board-tabs-drag-tip').textContent).toBe('松开移至「页签 2」')
 expect(f.workspace.getActiveBoardTab()).toBe(before.tabs[0].id)
 await f.event('pointerup',f.win,{pointerId:1,clientX:100,clientY:28})
 expect(nav(f.workspace).containerSpec.tabs[1].nodeIds).toEqual([a.id])
 expect(f.document.querySelector('.ew-board-tabs-live-preview')).not.toBeNull()
 await vi.waitFor(()=>expect(f.document.querySelector('.ew-board-tabs-live-preview')).toBeNull())
 await f.event('click',f.document.querySelector('[data-board-tabs-notice] button'))
 expect(nav(f.workspace).containerSpec.tabs[0].nodeIds).toEqual([a.id])
 await f.event('pointerdown',handle,{button:0,pointerId:2,clientX:150,clientY:130})
 await f.event('pointermove',f.win,{pointerId:2,clientX:100,clientY:28})
 await f.event('keydown',f.win,{key:'Escape'})
 expect(nav(f.workspace).containerSpec.tabs[0].nodeIds).toEqual([a.id])
 await vi.waitFor(()=>expect(f.document.querySelector('.ew-board-tabs-live-preview')).toBeNull())
})

it('普通画布拖动保留原生实时布局、浮动卡片和落位占位，不创建独立拖影',async()=>{
 const f=await fixture();let a,b;await f.act(()=>{a=f.workspace.createFinancialWidget('indices');b=f.workspace.createFinancialWidget('watchlist');f.workspace.createBoardTabs()})
 const source=f.host.querySelector('[data-research-node-id="'+a.id+'"]'),handle=source.querySelector('[data-workbench-drag-handle]'),before=f.workspace.getWorkbenchCells()
 source.getBoundingClientRect=()=>({left:12,top:180,right:675,bottom:640,width:663,height:460})
 await f.event('pointerdown',handle,{button:0,pointerId:61,clientX:150,clientY:190})
 await f.event('pointermove',f.win,{pointerId:61,clientX:420,clientY:620})
 await vi.waitFor(()=>expect(f.workspace.getWorkbenchCells()).not.toEqual(before))
 expect(source.hasAttribute('data-grid-active')).toBe(true)
 expect(f.canvas.querySelector('.ew-grid-placeholder').hidden).toBe(false)
 expect(f.document.querySelector('.ew-board-tabs-live-preview')).toBeNull()
 expect(source.hasAttribute('data-board-tabs-drag-source')).toBe(false)
 await f.event('pointerup',f.win,{pointerId:61,clientX:420,clientY:620})
 expect(f.document.querySelector('[data-release-animation]')).toBeNull()
 await f.act(()=>f.workspace.undo());expect(f.workspace.getWorkbenchCells()).toEqual(before)
})

it('缩略只在页签栏的窄外沿或栏内触发，右侧空白和当前页上方也提示可接收页签',async()=>{
 const f=await fixture();let a;await f.act(()=>{a=f.workspace.createFinancialWidget('indices');f.workspace.createBoardTabs()})
 const source=f.host.querySelector('[data-research-node-id="'+a.id+'"]'),handle=source.querySelector('[data-workbench-drag-handle]'),tabs=f.document.querySelectorAll('[data-board-tab]'),first=nav(f.workspace).containerSpec.tabs[0].id
 source.getBoundingClientRect=()=>({left:12,top:180,right:675,bottom:640,width:663,height:460})
 f.document.querySelector('[data-board-tabs-nav]').getBoundingClientRect=()=>({left:12,top:12,right:988,bottom:46,width:976,height:34})
 f.document.querySelector('.ew-board-tabs-list').getBoundingClientRect=()=>({left:16,top:16,right:960,bottom:42,width:944,height:26})
 tabs[0].getBoundingClientRect=()=>({left:16,top:16,right:80,bottom:42,width:64,height:26})
 tabs[1].getBoundingClientRect=()=>({left:500,top:16,right:564,bottom:42,width:64,height:26})
 await f.event('pointerdown',handle,{button:0,pointerId:62,clientX:150,clientY:190})
 await f.event('pointermove',f.win,{pointerId:62,clientX:520,clientY:90});expect(f.document.querySelector('.ew-board-tabs-live-preview')).toBeNull()
 await f.event('pointermove',f.win,{pointerId:62,clientX:520,clientY:60});expect(f.document.querySelector('.ew-board-tabs-live-preview')).toBeNull()
 await f.event('pointermove',f.win,{pointerId:62,clientX:900,clientY:52});expect(f.document.querySelector('.ew-board-tabs-live-preview')?.hasAttribute('data-thumbnail')).toBe(true)
 for(const clientX of [900,30,978]){
  await f.event('pointermove',f.win,{pointerId:62,clientX,clientY:28})
  expect(f.document.querySelector('.ew-board-tabs-live-preview')?.hasAttribute('data-thumbnail')).toBe(true)
  expect(tabs[1].hasAttribute('data-tab-accept')).toBe(true)
  expect(tabs[0].hasAttribute('data-tab-accept')).toBe(false)
  expect(f.document.querySelector('[data-tab-target]')).toBeNull()
 }
 await f.event('pointermove',f.win,{pointerId:62,clientX:900,clientY:60});expect(f.document.querySelector('.ew-board-tabs-live-preview')?.hasAttribute('data-thumbnail')).toBe(true)
 await f.event('pointermove',f.win,{pointerId:62,clientX:900,clientY:64});expect(f.document.querySelector('.ew-board-tabs-live-preview')?.hasAttribute('data-thumbnail')).toBe(false)
 expect(source.hasAttribute('data-board-tabs-drag-source')).toBe(true)
 await f.event('pointermove',f.win,{pointerId:62,clientX:350,clientY:400})
 expect(f.document.querySelector('.ew-board-tabs-live-preview')?.hasAttribute('data-thumbnail')).toBe(false)
 await vi.waitFor(()=>expect(f.document.querySelector('.ew-board-tabs-live-preview')).toBeNull())
 expect(source.hasAttribute('data-board-tabs-drag-source')).toBe(false);expect(source.hasAttribute('data-grid-active')).toBe(true)
 await f.event('pointerup',f.win,{pointerId:62,clientX:350,clientY:400})
 expect(f.document.querySelector('[data-release-animation]')).toBeNull();expect(f.workspace.getActiveBoardTab()).toBe(first)
})

it('首排标题起手已靠近页签时，向画布内拖动仍保持原生，朝标签拖动才缩略',async()=>{
 const f=await fixture();let a;await f.act(()=>{a=f.workspace.createFinancialWidget('indices');f.workspace.createBoardTabs()})
 const source=f.host.querySelector('[data-research-node-id="'+a.id+'"]'),handle=source.querySelector('[data-workbench-drag-handle]')
 source.getBoundingClientRect=()=>({left:12,top:60,right:675,bottom:520,width:663,height:460})
 f.document.querySelector('[data-board-tabs-nav]').getBoundingClientRect=()=>({left:12,top:12,right:988,bottom:46,width:976,height:34})
 f.document.querySelector('.ew-board-tabs-list').getBoundingClientRect=()=>({left:16,top:16,right:960,bottom:42,width:944,height:26})
 f.document.querySelectorAll('[data-board-tab]')[1].getBoundingClientRect=()=>({left:84,top:16,right:148,bottom:42,width:64,height:26})
 await f.event('pointerdown',handle,{button:0,pointerId:67,clientX:100,clientY:80})
 await f.event('pointermove',f.win,{pointerId:67,clientX:100,clientY:100})
 expect(f.document.querySelector('.ew-board-tabs-live-preview')).toBeNull()
 await f.event('keydown',f.win,{key:'Escape'})
 await f.event('pointerdown',handle,{button:0,pointerId:68,clientX:100,clientY:80})
 await f.event('pointermove',f.win,{pointerId:68,clientX:100,clientY:70})
 expect(f.document.querySelector('.ew-board-tabs-live-preview')).toBeNull()
 await f.event('pointermove',f.win,{pointerId:68,clientX:100,clientY:50})
 expect(f.document.querySelector('.ew-board-tabs-live-preview')?.hasAttribute('data-thumbnail')).toBe(true)
 await f.event('keydown',f.win,{key:'Escape'})
})

it('长组件缩略受可见高度限制，缩略样式覆盖原生浮动定位与过渡',async()=>{
 const f=await fixture();let a;await f.act(()=>{a=f.workspace.createFinancialWidget('indices');f.workspace.createBoardTabs()})
 const source=f.host.querySelector('[data-research-node-id="'+a.id+'"]'),handle=source.querySelector('[data-workbench-drag-handle]')
 source.getBoundingClientRect=()=>({left:12,top:180,right:612,bottom:3180,width:600,height:3000})
 f.document.querySelector('[data-board-tabs-nav]').getBoundingClientRect=()=>({left:12,top:12,right:988,bottom:46,width:976,height:34})
 f.document.querySelector('.ew-board-tabs-list').getBoundingClientRect=()=>({left:16,top:16,right:960,bottom:42,width:944,height:26})
 f.document.querySelectorAll('[data-board-tab]')[1].getBoundingClientRect=()=>({left:84,top:16,right:148,bottom:42,width:64,height:26})
 await f.event('pointerdown',handle,{button:0,pointerId:69,clientX:150,clientY:190})
 await f.event('pointermove',f.win,{pointerId:69,clientX:100,clientY:28})
 const style=f.win.getComputedStyle(source),scale=parseFloat(source.style.getPropertyValue('--board-tabs-scale'))
 expect(style.left).toBe('0px');expect(style.top).toBe('0px');expect(style.zIndex).toBe('2147483645');expect(style.transition).toContain('160ms')
 expect(scale*600).toBeLessThanOrEqual(240);expect(scale*3000).toBeLessThanOrEqual(700-46-20)
 await f.event('keydown',f.win,{key:'Escape'});await vi.waitFor(()=>expect(source.hasAttribute('data-board-tabs-live-preview')).toBe(false))
 expect(source.isConnected).toBe(true)
})

it('添加页签前后，同一普通拖动的布局结果与浮动位置保持一致',async()=>{
 async function run(tabs){
  const fixture=await financialClientFixture({}, {boardTabs:true});f=fixture;let a,b
  await f.act(()=>{a=f.workspace.createFinancialWidget('indices');b=f.workspace.createFinancialWidget('watchlist');if(tabs)f.workspace.createBoardTabs()})
  Object.defineProperty(f.canvas,'clientHeight',{configurable:true,value:900});f.canvas.getBoundingClientRect=()=>({left:0,top:0,right:1000,bottom:900,width:1000,height:900})
  const source=f.host.querySelector('[data-research-node-id="'+a.id+'"]'),handle=source.querySelector('[data-workbench-drag-handle]'),offset=tabs?46:0
  source.getBoundingClientRect=()=>({left:12,top:180+offset,right:675,bottom:640+offset,width:663,height:460})
  await f.event('pointerdown',handle,{button:0,pointerId:63,clientX:150,clientY:190+offset})
  await f.event('pointermove',f.win,{pointerId:63,clientX:420,clientY:620+offset})
  const floating=parseFloat(source.style.getPropertyValue('--grid-float-top'))
  await f.event('pointerup',f.win,{pointerId:63,clientX:420,clientY:620+offset})
  const cells=[a.id,b.id].map(id=>{const {x,y,w,h}=f.workspace.getWorkbenchCells().find(c=>c.id===id);return {x,y,w,h}})
  await f.dispose();f=null;return {floating,cells}
 }
 const baseline=await run(false),tabbed=await run(true)
 expect(tabbed.cells).toEqual(baseline.cells);expect(tabbed.floating).toBe(baseline.floating+46)
})

it('合并的最后松手坐标仍能从普通拖动进入页签，或从缩略区恢复原生落位',async()=>{
 const f=await fixture();let a,b;await f.act(()=>{a=f.workspace.createFinancialWidget('indices');b=f.workspace.createFinancialWidget('watchlist');f.workspace.createBoardTabs()})
 const source=f.host.querySelector('[data-research-node-id="'+a.id+'"]'),handle=source.querySelector('[data-workbench-drag-handle]'),spec=nav(f.workspace).containerSpec
 source.getBoundingClientRect=()=>({left:12,top:180,right:675,bottom:640,width:663,height:460})
 f.document.querySelector('[data-board-tabs-nav]').getBoundingClientRect=()=>({left:12,top:12,right:988,bottom:46,width:976,height:34})
 f.document.querySelector('.ew-board-tabs-list').getBoundingClientRect=()=>({left:16,top:16,right:960,bottom:42,width:944,height:26})
 f.document.querySelectorAll('[data-board-tab]')[1].getBoundingClientRect=()=>({left:84,top:16,right:148,bottom:42,width:64,height:26})
 await f.event('pointerdown',handle,{button:0,pointerId:64,clientX:150,clientY:190})
 await f.event('pointerup',f.win,{pointerId:64,clientX:100,clientY:28})
 expect(nav(f.workspace).containerSpec.tabs[1].nodeIds).toContain(a.id)
 await vi.waitFor(()=>expect(f.document.querySelector('.ew-board-tabs-live-preview')).toBeNull())
 await f.act(()=>f.workspace.undo());const before=f.workspace.getWorkbenchCells()
 await f.event('pointerdown',handle,{button:0,pointerId:65,clientX:150,clientY:190})
 await f.event('pointermove',f.win,{pointerId:65,clientX:100,clientY:28})
 await f.event('pointerup',f.win,{pointerId:65,clientX:420,clientY:620})
 expect(f.workspace.getActiveBoardTab()).toBe(spec.tabs[0].id)
 expect(nav(f.workspace).containerSpec.tabs[1].nodeIds).toEqual([])
 expect(f.workspace.getWorkbenchCells()).not.toEqual(before)
 expect(f.document.querySelector('[data-release-animation]')).toBeNull()
})

it('缩略区收到新的布局后，松手或取消保留新布局并清理原生手势',async()=>{
 for(const action of ['pointerup','Escape','blur','pointermove']){
  f=await fixture();let a,b;await f.act(()=>{a=f.workspace.createFinancialWidget('indices');b=f.workspace.createFinancialWidget('watchlist');f.workspace.createBoardTabs()})
  const source=f.host.querySelector('[data-research-node-id="'+a.id+'"]'),handle=source.querySelector('[data-workbench-drag-handle]')
  source.getBoundingClientRect=()=>({left:12,top:180,right:675,bottom:640,width:663,height:460})
  f.document.querySelector('[data-board-tabs-nav]').getBoundingClientRect=()=>({left:12,top:12,right:988,bottom:46,width:976,height:34})
  f.document.querySelector('.ew-board-tabs-list').getBoundingClientRect=()=>({left:16,top:16,right:960,bottom:42,width:944,height:26})
  f.document.querySelectorAll('[data-board-tab]')[1].getBoundingClientRect=()=>({left:84,top:16,right:148,bottom:42,width:64,height:26})
  await f.event('pointerdown',handle,{button:0,pointerId:66,clientX:150,clientY:190})
  await f.event('pointermove',f.win,{pointerId:66,clientX:100,clientY:28})
  const changed=f.workspace.getWorkbenchCells().map(c=>c.id===b.id?{...c,y:c.y+30}:c)
  await f.act(()=>f.workspace.applyWorkbenchCells(changed,false))
  if(action==='Escape')await f.event('keydown',f.win,{key:'Escape'})
  else await f.event(action,f.win,{pointerId:66,clientX:100,clientY:28})
  expect(f.workspace.getWorkbenchCells()).toEqual(changed)
  expect(f.canvas.hasAttribute('data-grid-operation')).toBe(false)
  expect(nav(f.workspace).containerSpec.tabs[1].nodeIds).toEqual([])
  await vi.waitFor(()=>expect(f.document.querySelector('.ew-board-tabs-live-preview')).toBeNull())
  await f.dispose();f=null
 }
})
it('设置草稿取消、校验、删除确认撤销，保存和看板撤销恢复组件身份与连接',async()=>{
 const f=await fixture();let a,b
 await f.act(()=>{a=f.workspace.createFinancialWidget('watchlist');b=f.workspace.createFinancialWidget('quote');f.workspace.createBoardTabs()})
 await f.event('click',f.document.querySelector('[data-board-tabs-more]'))
 await f.event('click',[...f.document.querySelectorAll('[role=menuitem]')].find(n=>n.textContent==='页签设置'))
 await f.input(f.document.querySelector('[aria-label="页签 1 名称"]'),'市场面')
 await f.event('click',f.document.querySelector('[data-board-tabs-cancel]'))
 expect(nav(f.workspace).containerSpec.tabs[0].name).toBe('页签 1')
 const n=nav(f.workspace),spec=n.containerSpec
 await f.act(()=>{expect(f.workspace.saveBoardTabs(spec.revision,[{id:spec.tabs[0].id,name:'市场面'},{id:spec.tabs[1].id,name:'我司'}])).toBe(true)})
 const latest=nav(f.workspace).containerSpec
 await f.act(()=>{expect(f.workspace.saveBoardTabs(latest.revision,[latest.tabs[1]])).toBe(true)})
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(1)
 await f.act(()=>f.workspace.undo())
 expect(f.workspace.getSnapshot().artifacts.map(n=>n.id)).toEqual(expect.arrayContaining([a.id,b.id,n.id]))
 expect(nav(f.workspace).containerSpec.tabs).toHaveLength(2)
})
it('移动保留卡片身份尺寸内容、源页布局，撤销一次恢复原页，重载保留归属及活动页',async()=>{
 const f=await fixture();let a,b
 await f.act(()=>{a=f.workspace.createFinancialWidget('indices');b=f.workspace.createFinancialWidget('watchlist');f.workspace.createBoardTabs()})
 const before=f.workspace.getSnapshot(),spec=nav(f.workspace).containerSpec
 await f.act(()=>expect(f.workspace.moveToBoardTab([a.id],spec.tabs[1].id)).toBe(true))
 expect(f.workspace.getActiveBoardTab()).toBe(spec.tabs[1].id)
 expect(nav(f.workspace).containerSpec.tabs.map(t=>t.nodeIds)).toEqual([[b.id],[a.id]])
 const moved=f.workspace.getSnapshot().artifacts.find(n=>n.id===a.id)
 expect(moved.width).toBe(before.artifacts.find(n=>n.id===a.id).width)
 expect(moved.containerSpec).toEqual(a.containerSpec)
 const reloaded=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('financial-test')
 reloaded.setCanvasSize({width:1000,height:700,availableWidth:1000});reloaded.setWorkbenchWidth(1000)
 expect(nav(reloaded).containerSpec.tabs[1].nodeIds).toEqual([a.id])
 expect(reloaded.getActiveBoardTab()).toBe(spec.tabs[1].id)
 await f.act(()=>f.workspace.undo())
 expect(nav(f.workspace).containerSpec.tabs[0].nodeIds).toEqual([a.id,b.id])
 expect(f.workspace.getSnapshot().artifacts.find(n=>n.id===a.id)).toEqual(before.artifacts.find(n=>n.id===a.id))
})

it('文件和网格存储单次失败时删除不生效，重载仍保留所有组件与页签',async()=>{
 const f=await fixture();await f.act(()=>{f.workspace.createFinancialWidget('indices');f.workspace.createBoardTabs()})
 const initial=f.workspace.getSnapshot(),spec=nav(f.workspace).containerSpec,original=f.win.localStorage.setItem.bind(f.win.localStorage)
 for(const prefix of ['sherlock.research.canvas.artifacts.v1:','ework.research.grid.v1:']){
  let failed=false
  const spy=vi.spyOn(f.win.localStorage,'setItem').mockImplementation((key,value)=>{if(!failed&&key.startsWith(prefix)){failed=true;throw Error('模拟存储失败')}return original(key,value)})
  await f.act(()=>expect(f.workspace.saveBoardTabs(spec.revision,[spec.tabs[1]])).toBe(false))
  spy.mockRestore();expect(failed).toBe(true)
  expect(f.workspace.getSnapshot().artifacts).toEqual(initial.artifacts)
  const reloaded=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('financial-test')
  expect(reloaded.getSnapshot().artifacts.map(n=>n.id)).toEqual(initial.artifacts.map(n=>n.id))
  expect(nav(reloaded).containerSpec.tabs).toHaveLength(2)
 }
})

it('异步粘贴与计划生成在切页后仍落到操作开始时的页签',async()=>{
 const f=await fixture();await f.act(()=>f.workspace.createBoardTabs());const spec=nav(f.workspace).containerSpec
 let resolve
 f.win.dshDesktop.researchClipboard={read:()=>new Promise(r=>resolve=r)}
 const pending=f.workspace.pasteClipboardNodes({x:200,y:200});await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'))
 await f.act(()=>f.workspace.selectBoardTab(spec.tabs[1].id))
 let pasted;await f.act(async()=>{resolve({kind:'text',text:'跨页等待的剪贴板内容'});pasted=await pending})
 expect(nav(f.workspace).containerSpec.tabs[0].nodeIds).toEqual(pasted)
 expect(nav(f.workspace).containerSpec.tabs[1].nodeIds).toEqual([])
 expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual([])
 await f.act(()=>{f.workspace.selectBoardTab(spec.tabs[0].id);f.bundle.__setBoardTabsPlanningIntent({id:'planning-test',kind:'workbench',state:'planning',startedAt:1000});f.workspace.reserveWorkbenchPlanning({id:'planning-test',startedAt:1000},{x:100,y:200});f.workspace.selectBoardTab(spec.tabs[1].id)})
 const plan={id:'background-plan',createdAt:1000,panels:[{nodeId:'background-panel',title:'后台完成的组件',prompt:'测试',x:0,y:0,width:400,height:280,preparedOutput:JSON.stringify({version:1,type:'markdown',title:'后台完成的组件',content:'真实结果'})}]}
 await f.act(()=>expect(f.workspace.applyWorkbench(plan)).toBe(true))
 expect(nav(f.workspace).containerSpec.tabs[0].nodeIds).toContain('background-panel')
 expect(nav(f.workspace).containerSpec.tabs[1].nodeIds).toEqual([])
 expect(f.workspace.getActiveBoardTab()).toBe(spec.tabs[1].id)
 const reload=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('financial-test')
 expect(nav(reload).containerSpec.tabs[0].nodeIds).toContain('background-panel')
})

it('删除有连接来源的页签清理跨页金融连接，撤销恢复原连接',async()=>{
 const f=await fixture();let a,b,c
 await f.act(()=>{a=f.workspace.createFinancialWidget('watchlist');b=f.workspace.createFinancialWidget('quote');c=f.workspace.createFinancialWidget('news');f.workspace.setArtifacts(f.workspace.getSnapshot().artifacts.map(n=>n.id===b.id?{...n,containerSpec:{...n.containerSpec,linkedWatchlistId:a.id}}:n.id===c.id?{...n,containerSpec:{...n.containerSpec,linkedSourceId:a.id}}:n));f.workspace.createBoardTabs()})
 const spec=nav(f.workspace).containerSpec
 await f.act(()=>f.workspace.moveToBoardTab([b.id,c.id],spec.tabs[1].id))
 const before=f.workspace.getSnapshot().artifacts.find(n=>n.id===b.id).containerSpec
 await f.act(()=>{const live=nav(f.workspace).containerSpec;expect(f.workspace.saveBoardTabs(live.revision,[live.tabs[1]])).toBe(true)})
 expect(f.workspace.getSnapshot().artifacts.find(n=>n.id===b.id).containerSpec.linkedWatchlistId).toBeUndefined()
 expect(f.workspace.getSnapshot().artifacts.find(n=>n.id===c.id).containerSpec.linkedSourceId).toBeUndefined()
 await f.act(()=>f.workspace.undo())
 expect(f.workspace.getSnapshot().artifacts.find(n=>n.id===b.id).containerSpec).toEqual(before)
})

it('删除活动页恢复邻页视口，撤销回到原页和原视口',async()=>{
 const f=await fixture(),w=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('viewport-case')
 w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000);w.createBoardTabs()
 const spec=nav(w).containerSpec
 w.selectBoardTab(spec.tabs[1].id);w.setViewport({x:0,y:-200,scale:1});w.selectBoardTab(spec.tabs[0].id);w.setViewport({x:0,y:-600,scale:1})
 expect(w.saveBoardTabs(spec.revision,[spec.tabs[1]])).toBe(true)
 expect(w.getActiveBoardTab()).toBe(spec.tabs[1].id)
 expect(w.getSnapshot().viewport.y).toBe(-200)
 w.undo()
 expect(w.getActiveBoardTab()).toBe(spec.tabs[0].id)
 expect(w.getSnapshot().viewport.y).toBe(-600)
})

it('启用页签后标题栏仍支持修饰键多选，被占用组件阻止受影响布局移动',async()=>{
 const f=await fixture();let a,b
 await f.act(()=>{a=f.workspace.createFinancialWidget('indices');b=f.workspace.createFinancialWidget('watchlist');f.workspace.createBoardTabs();f.workspace.updateSelection([a.id],'replace')})
 const source=f.host.querySelector('[data-research-node-id="'+a.id+'"]'),other=f.host.querySelector('[data-research-node-id="'+b.id+'"]'),handle=source.querySelector('[data-workbench-drag-handle]')
 await f.event('pointerdown',other.querySelector('[data-workbench-drag-handle]'),{button:0,pointerId:21,shiftKey:true,clientX:200,clientY:500})
 expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual(expect.arrayContaining([a.id,b.id]))
 expect(f.document.querySelector('.ew-board-tabs-live-preview')).toBeNull()
 source.getBoundingClientRect=()=>({left:12,top:120,right:675,bottom:580,width:663,height:460})
 const cells=f.workspace.getWorkbenchCells()
 await f.event('pointerdown',handle,{button:0,pointerId:22,clientX:200,clientY:130})
 other.setAttribute('data-research-geometry-blocked','')
 await f.event('pointermove',f.win,{pointerId:22,clientX:200,clientY:680})
 await f.event('pointerup',f.win,{pointerId:22,clientX:200,clientY:680})
 expect(f.workspace.getWorkbenchCells()).toEqual(cells)
})

it('溢出并被裁剪的页签不接受板外释放',async()=>{
 const f=await fixture();let a;await f.act(()=>{a=f.workspace.createFinancialWidget('indices');f.workspace.createBoardTabs()})
 const source=f.host.querySelector('[data-research-node-id="'+a.id+'"]'),handle=source.querySelector('[data-workbench-drag-handle]'),tabs=[...f.document.querySelectorAll('[data-board-tab]')],before=nav(f.workspace).containerSpec
 source.getBoundingClientRect=()=>({left:12,top:120,right:675,bottom:580,width:663,height:460})
 f.document.querySelector('[data-board-tabs-nav]').getBoundingClientRect=()=>({left:12,top:12,right:988,bottom:46,width:976,height:34})
 f.document.querySelector('.ew-board-tabs-list').getBoundingClientRect=()=>({left:16,top:16,right:960,bottom:42,width:944,height:26})
 tabs[1].getBoundingClientRect=()=>({left:1090,top:16,right:1154,bottom:42,width:64,height:26})
 await f.event('pointerdown',handle,{button:0,pointerId:31,clientX:150,clientY:130})
 await f.event('pointermove',f.win,{pointerId:31,clientX:1100,clientY:28})
 expect(tabs[1].hasAttribute('data-tab-target')).toBe(false)
 await f.event('pointerup',f.win,{pointerId:31,clientX:1100,clientY:28})
 expect(nav(f.workspace).containerSpec).toEqual(before)
 await vi.waitFor(()=>expect(f.document.querySelector('.ew-board-tabs-live-preview')).toBeNull())
})

it('进入页签栏右侧空区缩略但空区松手不改变组件归属或布局',async()=>{
 const f=await fixture();let a;await f.act(()=>{a=f.workspace.createFinancialWidget('indices');f.workspace.createBoardTabs()})
 const source=f.host.querySelector('[data-research-node-id="'+a.id+'"]'),handle=source.querySelector('[data-workbench-drag-handle]'),before=nav(f.workspace).containerSpec,cells=f.workspace.getWorkbenchCells()
 source.getBoundingClientRect=()=>({left:12,top:180,right:675,bottom:640,width:663,height:460})
 f.document.querySelector('[data-board-tabs-nav]').getBoundingClientRect=()=>({left:12,top:12,right:988,bottom:46,width:976,height:34})
 f.document.querySelector('.ew-board-tabs-list').getBoundingClientRect=()=>({left:16,top:16,right:960,bottom:42,width:944,height:26})
 f.document.querySelectorAll('[data-board-tab]')[1].getBoundingClientRect=()=>({left:84,top:16,right:148,bottom:42,width:64,height:26})
 await f.event('pointerdown',handle,{button:0,pointerId:69,clientX:150,clientY:190})
 await f.event('pointermove',f.win,{pointerId:69,clientX:900,clientY:28})
 expect(f.document.querySelector('.ew-board-tabs-live-preview')?.hasAttribute('data-thumbnail')).toBe(true)
 expect(f.document.querySelectorAll('[data-tab-accept]')).toHaveLength(1)
 expect(f.document.querySelector('[data-tab-target]')).toBeNull()
 await f.event('pointerup',f.win,{pointerId:69,clientX:900,clientY:28})
 expect(nav(f.workspace).containerSpec).toEqual(before)
 expect(f.workspace.getWorkbenchCells()).toEqual(cells)
 expect(source.hasAttribute('data-grid-active')).toBe(false)
 await vi.waitFor(()=>expect(f.document.querySelector('.ew-board-tabs-live-preview')).toBeNull())
})

it('页签同数量改成长标题后立即显示翻页，名称缩短后恢复',async()=>{
 const f=await fixture();await f.act(()=>f.workspace.createBoardTabs())
 const list=f.document.querySelector('.ew-board-tabs-list');let contentWidth=136
 Object.defineProperties(list,{clientWidth:{configurable:true,get:()=>300},scrollWidth:{configurable:true,get:()=>contentWidth}})
 await f.event('resize',f.win)
 expect(f.document.querySelector('[data-board-tabs-paging]')).toBeNull()
 let spec=nav(f.workspace).containerSpec;contentWidth=600
 await f.act(()=>f.workspace.saveBoardTabs(spec.revision,spec.tabs.map((tab,i)=>({...tab,name:i?'新闻公告与每日市场事件跟踪':'我的自选跨市场重点股票研究'}))))
 expect(f.document.querySelector('[data-board-tabs-paging]')).not.toBeNull()
 expect([...list.querySelectorAll('[role=tab]')].map(el=>el.textContent)).toEqual(['我的自选跨市场重点股票研究','新闻公告与每日市场事件跟踪'])
 spec=nav(f.workspace).containerSpec;contentWidth=136
 await f.act(()=>f.workspace.saveBoardTabs(spec.revision,spec.tabs.map((tab,i)=>({...tab,name:'页签 '+(i+1)}))))
 expect(f.document.querySelector('[data-board-tabs-paging]')).toBeNull()
})

it('页签横向滚动不驱动画布，后台组件更新不抢回滚动位置',async()=>{
 const f=await fixture();await f.act(()=>f.workspace.createBoardTabs());const spec=nav(f.workspace).containerSpec
 await f.act(()=>f.workspace.saveBoardTabs(spec.revision,[...spec.tabs,...Array.from({length:10},(_,i)=>({id:'overflow-'+i,name:'更多 '+i}))]))
 const list=f.document.querySelector('.ew-board-tabs-list'),before=f.canvas.scrollTop
 await f.event('wheel',list,{deltaY:120,deltaX:0,deltaMode:0})
 expect(list.scrollLeft).toBe(120);expect(f.canvas.scrollTop).toBe(before)
 await f.act(()=>f.workspace.createFinancialWidget('indices'));expect(list.scrollLeft).toBe(120)
})

it('页签溢出时显示右侧双向翻页按钮，宽度恢复后隐藏',async()=>{
 const f=await fixture();await f.act(()=>f.workspace.createBoardTabs());const spec=nav(f.workspace).containerSpec
 await f.act(()=>f.workspace.saveBoardTabs(spec.revision,[...spec.tabs,...Array.from({length:10},(_,i)=>({id:'paging-'+i,name:'翻页 '+i}))]))
 const list=f.document.querySelector('.ew-board-tabs-list');let width=900
 Object.defineProperties(list,{clientWidth:{configurable:true,get:()=>width},scrollWidth:{configurable:true,get:()=>812}})
 list.scrollBy=({left})=>{list.scrollLeft=Math.max(0,Math.min(812-width,list.scrollLeft+left));list.dispatchEvent(new f.win.Event('scroll'))}
 await f.event('resize',f.win);expect(f.document.querySelector('[data-board-tabs-paging]')).toBeNull()
 width=300;await f.event('resize',f.win)
 const left=f.document.querySelector('[aria-label="向左翻页"]'),right=f.document.querySelector('[aria-label="向右翻页"]')
 expect(left?.disabled).toBe(true);expect(right?.disabled).toBe(false)
 await f.event('click',right);expect(list.scrollLeft).toBeGreaterThan(0);expect(left.disabled).toBe(false)
 await f.event('click',right);await f.event('click',right);expect(right.disabled).toBe(true)
 await f.event('click',left);expect(right.disabled).toBe(false)
 width=900;await f.event('resize',f.win);expect(f.document.querySelector('[data-board-tabs-paging]')).toBeNull()
})

it('重复添加只保留一个页签组件，工具栏上方提示两秒后消失',async()=>{
 const f=await fixture();await f.act(()=>f.workspace.createBoardTabs());const first=nav(f.workspace).id
 await f.act(()=>f.workspace.createBoardTabs())
 expect(f.workspace.getSnapshot().artifacts.filter(n=>n.containerSpec?.type==='board-tabs').map(n=>n.id)).toEqual([first])
 expect(f.document.querySelector('[data-board-tabs-notice]')?.textContent).toContain('每个看板只能添加一个页签组件')
 await f.act(async()=>{await new Promise(resolve=>setTimeout(resolve,2100))})
 expect(f.document.querySelector('[data-board-tabs-notice]')).toBeNull()
})

it('普通标题点击和微小抖动仅选择，不淡出源组件或播放释放动效',async()=>{
 const f=await fixture();let a;await f.act(()=>{a=f.workspace.createFinancialWidget('indices');f.workspace.createBoardTabs()})
 const source=f.host.querySelector('[data-research-node-id="'+a.id+'"]'),handle=source.querySelector('[data-workbench-drag-handle]')
 source.getBoundingClientRect=()=>({left:12,top:120,right:675,bottom:580,width:663,height:460})
 await f.event('pointerdown',handle,{button:0,pointerId:51,clientX:150,clientY:130})
 await f.event('pointermove',f.win,{pointerId:51,clientX:151,clientY:131})
 expect(f.document.querySelector('.ew-board-tabs-drag-position')).toBeNull()
 expect(source.hasAttribute('data-board-tabs-drag-source')).toBe(false)
 expect(f.canvas.getAttribute('data-grid-operation')).toBe('move')
 await f.event('pointerup',f.win,{pointerId:51,clientX:151,clientY:131})
 expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual([a.id])
 expect(f.document.querySelector('.ew-board-tabs-live-preview')).toBeNull()
 expect(source.hasAttribute('data-board-tabs-arriving')).toBe(false)
})

it('目标页删除后后台结果保留并明确提供重新放置，重载仍保留目标身份',async()=>{
 const f=await fixture();await f.act(()=>f.workspace.createBoardTabs());const spec=nav(f.workspace).containerSpec
 await f.act(()=>{f.bundle.__setBoardTabsPlanningIntent({id:'pending-deleted',kind:'workbench',state:'planning',startedAt:1000});f.workspace.reserveWorkbenchPlanning({id:'pending-deleted',startedAt:1000},{x:100,y:200});f.workspace.selectBoardTab(spec.tabs[1].id);f.workspace.saveBoardTabs(spec.revision,[spec.tabs[1]])})
 const plan={id:'deleted-target-plan',createdAt:1000,panels:[{nodeId:'retained-panel',title:'保留的结果',prompt:'测试',x:0,y:0,width:400,height:280,preparedOutput:JSON.stringify({version:1,type:'markdown',title:'保留的结果',content:'真实结果'})}]}
 await f.act(()=>expect(f.workspace.applyWorkbench(plan)).toBe(false))
 expect(f.document.querySelector('[data-board-tabs-recovery]').textContent).toContain('生成结果已保留')
 expect(f.workspace.getSnapshot().artifacts.some(n=>n.id==='retained-panel')).toBe(false)
 const reloaded=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('financial-test');reloaded.setCanvasSize({width:1000,height:700,availableWidth:1000});reloaded.setWorkbenchWidth(1000)
 expect(reloaded.applyWorkbench(plan)).toBe(false)
 expect(reloaded.retainedBoardTabPlanCount()).toBe(1)
 await f.event('click',f.document.querySelector('[data-board-tabs-recovery] button'))
 expect(nav(f.workspace).containerSpec.tabs[0].nodeIds).toEqual(['retained-panel'])
 expect(f.document.querySelector('[data-board-tabs-recovery]')).toBeNull()
})

it('无关联的新计划不复用旧规划目标，同一计划后续面板仍留在首次接收页',async()=>{
 const f=await fixture();await f.act(()=>f.workspace.createBoardTabs());const spec=nav(f.workspace).containerSpec
 await f.act(()=>{f.workspace.reserveWorkbenchPlanning({id:'old-intent',startedAt:1000},{x:100,y:200});f.workspace.releaseWorkbenchPlanning('old-intent');f.bundle.__setBoardTabsPlanningIntent({id:'old-intent',kind:'workbench',state:'failed',startedAt:1000});f.workspace.selectBoardTab(spec.tabs[1].id)})
 const panel=id=>({nodeId:id,title:id,prompt:'测试',x:0,y:0,width:400,height:280,preparedOutput:JSON.stringify({version:1,type:'markdown',title:id,content:'独立计划'})})
 await f.act(()=>f.workspace.applyWorkbench({id:'unrelated-plan',createdAt:5000,panels:[panel('new-a')]}))
 expect(nav(f.workspace).containerSpec.tabs[0].nodeIds).toEqual([])
 expect(nav(f.workspace).containerSpec.tabs[1].nodeIds).toEqual(['new-a'])
 await f.act(()=>{f.workspace.selectBoardTab(spec.tabs[0].id);f.workspace.applyWorkbench({id:'unrelated-plan',createdAt:5000,panels:[panel('new-a'),panel('new-b')]})})
 expect(nav(f.workspace).containerSpec.tabs[1].nodeIds).toEqual(['new-a','new-b'])
})

it('当前页规划进度卡保持可见，切页隐藏，返回恢复',async()=>{
 f=await financialClientFixture({}, {boardTabs:true,sourceTransform:source=>source.replace('exports.ResearchCanvas = ResearchCanvas;',"exports.__startPlanning=()=>{odysseyCreationIntents.set('financial-test',{id:'planning-visible',kind:'workbench',state:'planning',startedAt:Date.now(),prompt:'测试规划'});odysseyCreationEmit('financial-test')};exports.ResearchCanvas = ResearchCanvas;")})
 await f.act(()=>{f.workspace.createBoardTabs();f.bundle.__startPlanning()})
 const card=f.host.querySelector('[data-research-node-id="planning-visible"]');expect(card).not.toBeNull()
 expect(card.hasAttribute('data-board-tab-hidden')).toBe(false)
 const spec=nav(f.workspace).containerSpec
 await f.act(()=>f.workspace.selectBoardTab(spec.tabs[1].id));expect(card.hasAttribute('data-board-tab-hidden')).toBe(true)
 await f.act(()=>f.workspace.selectBoardTab(spec.tabs[0].id));expect(card.hasAttribute('data-board-tab-hidden')).toBe(false)
})

it('沙盒网页直接缩放原组件，拖放不复制或重载iframe',async()=>{
 const capture=vi.fn(async()=> 'data:image/jpeg;base64,/9j/2Q==')
 f=await financialClientFixture({researchLinkFrame:{captureCanvas:capture}}, {boardTabs:true})
 let node;await f.act(()=>{node=f.workspace.createContainerDraft();f.workspace.setArtifacts([{...node,generationStatus:'completed',containerSpec:{version:1,type:'html',title:'图表',html:'<main>实际图表</main>'}}]);f.workspace.createBoardTabs()})
 const source=f.host.querySelector('[data-research-node-id="'+node.id+'"]');source.getBoundingClientRect=()=>({left:12,top:120,right:675,bottom:580,width:663,height:460})
 await f.event('pointerdown',source.querySelector('[data-workbench-drag-handle]'),{button:0,pointerId:41,clientX:150,clientY:130})
 const frame=source.querySelector('iframe');expect(frame).not.toBeNull();expect(capture).not.toHaveBeenCalled()
 expect(f.document.querySelector('.ew-board-tabs-captured-image')).toBeNull()
 f.document.querySelector('[data-board-tabs-nav]').getBoundingClientRect=()=>({left:12,top:12,right:988,bottom:46,width:976,height:34})
 f.document.querySelector('.ew-board-tabs-list').getBoundingClientRect=()=>({left:16,top:16,right:960,bottom:42,width:944,height:26})
 f.document.querySelectorAll('[data-board-tab]')[1].getBoundingClientRect=()=>({left:84,top:16,right:148,bottom:42,width:64,height:26})
 await f.event('pointermove',f.win,{pointerId:41,clientX:100,clientY:28});expect(capture).not.toHaveBeenCalled()
 expect(f.document.querySelectorAll('[data-research-node-id="'+node.id+'"]')).toHaveLength(1);expect(source.querySelector('iframe')).toBe(frame);expect(source.hasAttribute('data-board-tabs-live-preview')).toBe(true)
 await f.event('keydown',f.win,{key:'Escape'});await vi.waitFor(()=>expect(f.document.querySelector('.ew-board-tabs-live-preview')).toBeNull())
})
