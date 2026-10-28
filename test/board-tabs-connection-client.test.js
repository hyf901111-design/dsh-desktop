import {afterEach,it,expect,vi} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'

let f
afterEach(async()=>{await f?.dispose();f=null})
const first={market:'SH',code:'600519',name:'贵州茅台'},second={market:'SZ',code:'000858',name:'五粮液'}
const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height})
async function setup(){
 f=await financialClientFixture({financialWidget:{request:async q=>q.action==='history'?{bars:[]}:{quotes:(q.symbols||[]).map(s=>({...s,price:10,changePercent:1})),news:[],announcements:[],receivedAt:'2026-10-28T00:00:00Z',source:'测试'}}},{refreshState:true,creation:true,boardTabs:true})
 let watch,quote
 await f.act(()=>{
  watch=f.workspace.createFinancialWidget('watchlist');quote=f.workspace.createFinancialWidget('quote')
  f.workspace.setArtifacts(f.workspace.getSnapshot().artifacts.map(n=>({...n,containerSpec:{...n.containerSpec,symbols:n.id===watch.id?[first,second]:[first]}})))
 })
 const port=(id,side)=>f.host.querySelector(`[data-financial-port-node="${id}"][data-financial-port="${side}"]`)
 const connect=async(sourceId,targetId)=>{
  const output=port(sourceId,'output'),input=port(targetId,'input');f.document.elementFromPoint=()=>input
  await f.event('pointerdown',output,{button:0,pointerId:14,clientX:490,clientY:456})
  await f.event('pointermove',f.document.body,{pointerId:14,clientX:570,clientY:456})
  await f.event('pointerup',f.document.body,{pointerId:14,clientX:570,clientY:456})
 }
 await connect(watch.id,quote.id)
 let nav;await f.act(()=>{nav=f.workspace.createBoardTabs();f.workspace.saveBoardTabs(nav.containerSpec.revision,[{...nav.containerSpec.tabs[0],name:'市场行情'},{...nav.containerSpec.tabs[1],name:'新闻公告'}])})
 const tabs=()=>f.workspace.getSnapshot().artifacts.find(n=>n.id===nav.id).containerSpec.tabs
 const page1=tabs()[0].id,page2=tabs()[1].id
 const spec=id=>f.workspace.getSnapshot().artifacts.find(n=>n.id===id)?.containerSpec
 const line=id=>f.host.querySelector(`[data-financial-link="${id}"] .ew-financial-connection-line`)
 const select=async id=>f.act(()=>f.workspace.updateSelection([id],'replace'))
 const page=async id=>f.event('click',f.document.querySelector(`[data-board-tab="${id}"]`))
 const move=async(id,target)=>f.act(()=>f.workspace.moveToBoardTab([id],target))
 // Controlled browser rectangles are the layout boundary. Hidden, mounted cards
 // deliberately report zero rectangles, just as display:none does in Chromium.
 const layout={tab2Left:220,tab2Width:120,listWidth:700,outerLeft:100,watchLeft:112,watchWidth:400,quoteLeft:552,quoteWidth:400}
 const measure=()=>{
  const canvas=f.canvas,list=f.document.querySelector('[role=tablist]'),navEl=f.document.querySelector('[data-board-tabs-nav]')
  canvas.getBoundingClientRect=()=>rect(layout.outerLeft,50,1000,700)
  Object.defineProperty(canvas,'clientLeft',{configurable:true,value:2});Object.defineProperty(canvas,'clientTop',{configurable:true,value:3})
  const screen=(x,y,w,h)=>rect(x+layout.outerLeft-100-canvas.scrollLeft,y-canvas.scrollTop,w,h)
  navEl.getBoundingClientRect=()=>screen(112,62,976,34)
  list.getBoundingClientRect=()=>screen(116,66,layout.listWidth,26)
  for(const [i,tab] of [...list.querySelectorAll('[data-board-tab]')].entries())tab.getBoundingClientRect=()=>screen((i?layout.tab2Left:116)-list.scrollLeft,66,i?layout.tab2Width:100,26)
  for(const [i,button] of [...navEl.querySelectorAll('[data-board-tabs-paging] button')].entries())button.getBoundingClientRect=()=>screen(820+i*26,66,24,26)
  for(const card of f.host.querySelectorAll('[data-research-node-id]')){
   const source=card.getAttribute('data-research-node-id')===watch.id,left=source?layout.watchLeft:layout.quoteLeft,width=source?layout.watchWidth:layout.quoteWidth
   card.getBoundingClientRect=()=>f.workspace.isBoardNodeVisible(card.getAttribute('data-research-node-id'))?screen(left,150,width,330):rect(0,0,0,0)
   for(const p of card.querySelectorAll('[data-financial-port]'))p.getBoundingClientRect=()=>f.workspace.isBoardNodeVisible(p.dataset.financialPortNode)?screen(p.dataset.financialPort==='output'?left+width-32:left+8,446,20,20):rect(0,0,0,0)
  }
 }
 const scroll=async target=>f.act(async()=>{target.dispatchEvent(new f.win.Event('scroll'));await new Promise(resolve=>setTimeout(resolve,10))})
 const refresh=async()=>{measure();await scroll(f.canvas)}
 await refresh()
 return {watch,quote,nav,tabs,page1,page2,spec,line,select,page,move,port,connect,layout,measure,scroll,refresh}
}

it('接收组件移到别页后，从当前来源的真实输出端口连到对端页签，联动仍传递且回移恢复组件端点',async()=>{
 const s=await setup();await s.move(s.quote.id,s.page2);await s.page(s.page1);await s.select(s.watch.id);await s.refresh()
 expect(s.spec(s.quote.id).linkedWatchlistId).toBe(s.watch.id)
 expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/^M 388 403 /)
 expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/178 39$/)
 expect(f.host.querySelector(`[data-research-node-id="${s.quote.id}"]`).hasAttribute('data-board-tab-hidden')).toBe(true)
 await f.event('click',f.host.querySelector('[data-stock-code="000858"]'))
 expect(s.spec(s.quote.id).symbols).toEqual([second])
 await s.page(s.page2);await s.move(s.quote.id,s.page1);await s.select(s.watch.id);await s.refresh()
 expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/^M 388 403 /)
 expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/468 403$/)
},15000)

it('切到接收组件所在页后，从来源所属页签连入真实输入端口，解除关系后移除图形',async()=>{
 const s=await setup();await s.move(s.quote.id,s.page2);await s.select(s.quote.id);await s.refresh()
 expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/^M 64 39 /)
 expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/468 403$/)
 const hit=f.host.querySelector(`[data-financial-link="${s.quote.id}"] [role=button]`)
 expect(hit?.getAttribute('aria-label')).toContain('市场行情')
 expect(hit?.querySelector('title')?.textContent).toContain('输入')
 await f.event('contextmenu',hit)
 expect(s.spec(s.quote.id).linkedWatchlistId).toBeUndefined();expect(s.line(s.quote.id)).toBeNull()
})

it('来源移页仍保留输出到当前输入的方向，双端都不在当前页时没有无关线',async()=>{
 const s=await setup();await s.move(s.watch.id,s.page2);await s.page(s.page1);await s.select(s.quote.id);await s.refresh()
 expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/^M 178 39 /)
 expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/468 403$/)
 await s.move(s.quote.id,s.page2);await s.page(s.page1);await s.refresh()
 expect(s.line(s.quote.id)).toBeNull()
})

it('跨页关系沿用选择显隐，并在页签改名和目标删除后更新可访问名称与图形',async()=>{
 const s=await setup();await s.move(s.quote.id,s.page2);await s.page(s.page1);await s.select(s.watch.id);await s.refresh()
 expect(s.line(s.quote.id)).not.toBeNull()
 await f.act(()=>f.workspace.updateSelection([],'replace'));expect(s.line(s.quote.id)).toBeNull()
 await s.select(s.watch.id)
 s.layout.tab2Width=200
 let nav=f.workspace.getSnapshot().artifacts.find(n=>n.id===s.nav.id)
 await f.act(()=>f.workspace.saveBoardTabs(nav.containerSpec.revision,s.tabs().map(t=>({...t,name:t.id===s.page2?'新闻公告与监管动态':t.name}))))
 expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/218 39$/)
 expect(f.host.querySelector(`[data-financial-link="${s.quote.id}"] [role=button]`)?.getAttribute('aria-label')).toContain('新闻公告与监管动态')
 nav=f.workspace.getSnapshot().artifacts.find(n=>n.id===s.nav.id)
 await f.act(()=>f.workspace.saveBoardTabs(nav.containerSpec.revision,s.tabs().filter(t=>t.id!==s.page2)))
 expect(s.spec(s.quote.id)).toBeUndefined();expect(s.line(s.quote.id)).toBeNull()
})

it('目标标题在列表内横向滚动或被部分裁切时，端点随实际可见标签重算',async()=>{
 const s=await setup();await s.move(s.quote.id,s.page2);await s.page(s.page1);await s.select(s.watch.id);await s.refresh()
 expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/178 39$/)
 const list=f.document.querySelector('[role=tablist]');list.scrollLeft=50
 await s.scroll(list)
 expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/128 39$/)
 s.layout.tab2Left=790;s.layout.tab2Width=180;list.scrollLeft=0
 await s.scroll(list)
 expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/701 39$/)
 s.layout.outerLeft=160
 await f.event('resize',f.win)
 await vi.waitFor(()=>expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/701 39$/))
})

it('目标横向溢出时连到正确翻页箭头并标明目标，不拦截翻页和切页',async()=>{
 const s=await setup();await s.move(s.quote.id,s.page2);await s.page(s.page1)
 const list=f.document.querySelector('[role=tablist]')
 Object.defineProperty(list,'clientWidth',{configurable:true,value:700});Object.defineProperty(list,'scrollWidth',{configurable:true,value:1400})
 await f.event('resize',f.win)
 await vi.waitFor(()=>expect(f.document.querySelector('[data-board-tabs-paging]')).not.toBeNull())
 s.layout.tab2Left=1100;await s.select(s.watch.id);await s.refresh()
 expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/756 39$/)
 expect(f.document.querySelector('[data-board-tabs-paging] button:last-child').hasAttribute('data-financial-connection-target')).toBe(true)
 const hit=()=>f.host.querySelector(`[data-financial-link="${s.quote.id}"] [role=button]`)
 expect(hit()?.getAttribute('aria-label')).toContain('新闻公告');expect(hit()?.querySelector('title')?.textContent).toContain('向右翻页')
 s.layout.tab2Left=-200;await s.scroll(list)
 expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/730 39$/)
 expect(f.document.querySelector('[data-board-tabs-paging] button:first-child').hasAttribute('data-financial-connection-target')).toBe(true)
 expect(f.document.querySelector('[data-board-tabs-paging] button:last-child').hasAttribute('data-financial-connection-target')).toBe(false)
 expect(hit()?.querySelector('title')?.textContent).toContain('向左翻页')
 await s.page(s.page2)
 expect(f.workspace.getActiveBoardTab()).toBe(s.page2)
})

it('跨页创建基准关系也使用页签端点，隐藏卡片的零坐标不进入连线',async()=>{
 const s=await setup();let draft
 await f.act(()=>{draft=f.workspace.beginSelectedCreateDraft([s.quote.id]);f.workspace.updateSelectedCreateDraft(draft.id,'研究当前标的')})
 await s.move(draft.id,s.page2);await s.page(s.page1);await s.select(s.quote.id);await s.refresh()
 const line=f.host.querySelector(`[data-workbench-create-link="${draft.id}"] .ew-financial-connection-line`)
 expect(line?.getAttribute('d')).toMatch(/^M 828 403 /)
 expect(line?.getAttribute('d')).toMatch(/178 39$/)
 expect(f.workspace.getSnapshot().artifacts.find(n=>n.id===draft.id).sourceNodeIds).toEqual([s.quote.id])
})

it('导航竖向滚出视窗后仍使用真实内容坐标，不改动用户视口或选择',async()=>{
 const s=await setup();await s.move(s.quote.id,s.page2);await s.page(s.page1);await s.refresh()
 f.canvas.scrollTop=200
 await s.scroll(f.canvas)
 const before=f.canvas.scrollTop
 expect(before).toBeGreaterThan(92);expect(s.line(s.quote.id)).toBeNull()
 await s.select(s.watch.id);await s.scroll(f.canvas)
 expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/^M 388 403 /)
 expect(s.line(s.quote.id)?.getAttribute('d')).toMatch(/178 39$/)
 expect(f.canvas.scrollTop).toBe(before);expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual([s.watch.id])
})

const pathCommands=d=>[...d.matchAll(/([MLCQA])\s*([^MLCQA]+)/g)].map(([,type,args])=>({type,v:args.trim().split(/[ ,]+/).map(Number)}))
const pathXs=d=>pathCommands(d).flatMap(({type,v})=>type==='A'?[v[5]]:v.filter((_,i)=>i%2===0))
it('靠右12像素边距的来源连到异页标签时，真实输出端点和整条线路均留在SVG边界内',async()=>{
 const s=await setup();await s.move(s.quote.id,s.page2);await s.page(s.page1);await s.select(s.watch.id)
 s.layout.watchLeft=114;s.layout.watchWidth=976;await s.refresh()
 const d=s.line(s.quote.id).getAttribute('d')
 expect(d).toMatch(/^M 966 403 /);expect(d).toMatch(/178 39$/)
 expect(Math.max(...pathXs(d))).toBe(998);expect(Math.min(...pathXs(d))).toBeGreaterThanOrEqual(2)
 const hit=f.host.querySelector(`[data-financial-link="${s.quote.id}"] .ew-financial-connection-hit`).getAttribute('d')
 expect(Math.max(...pathXs(hit))).toBe(998)
},15000)

it('异页标签连到靠左12像素边距的接收组件时，真实输入端点和整条线路均留在SVG边界内',async()=>{
 const s=await setup();await s.move(s.watch.id,s.page2);await s.page(s.page1);await s.select(s.quote.id)
 s.layout.quoteLeft=114;await s.refresh()
 const d=s.line(s.quote.id).getAttribute('d')
 expect(d).toMatch(/^M 178 39 /);expect(d).toMatch(/30 403$/)
 expect(Math.min(...pathXs(d))).toBe(2);expect(Math.max(...pathXs(d))).toBeLessThanOrEqual(998)
 const hit=f.host.querySelector(`[data-financial-link="${s.quote.id}"] .ew-financial-connection-hit`).getAttribute('d')
 expect(Math.min(...pathXs(hit))).toBe(2)
},15000)

function expectRoundedOrthogonal(d){
 const commands=pathCommands(d)
 expect(commands[0].type).toBe('M');expect(commands.filter(c=>c.type==='A')).toHaveLength(3)
 expect(commands.every(c=>['M','L','A'].includes(c.type))).toBe(true)
 let current=commands[0].v,previous=null
 for(let i=1;i<commands.length;i++){
  const {type,v}=commands[i]
  if(type==='L'){
   expect(current[0]===v[0]||current[1]===v[1]).toBe(true)
   previous=[v[0]-current[0],v[1]-current[1]];current=v
  }else{
   const [rx,ry,rotation,large,sweep,x,y]=v
   expect(rx).toBeGreaterThan(0);expect(ry).toBe(rx);expect(rotation).toBe(0);expect(large).toBe(0)
   expect(Math.abs(x-current[0])).toBe(rx);expect(Math.abs(y-current[1])).toBe(ry)
   const ux=Math.sign(previous[0]),uy=Math.sign(previous[1]),turn=sweep?1:-1,normal=[-uy*turn,ux*turn],center=[current[0]+normal[0]*rx,current[1]+normal[1]*ry]
   // The real circular arc meets its incoming and outgoing straight segments
   // tangentially; round stroke caps cannot hide a sharp path junction here.
   expect(Math.hypot(x-center[0],y-center[1])).toBeCloseTo(rx)
   const next=commands[i+1];expect(next.type).toBe('L')
   expect([Math.sign(next.v[0]-x),Math.sign(next.v[1]-y)]).toEqual(normal.map(v=>v||0))
   current=[x,y]
  }
 }
}
it('组件输出到页签使用正交直线与相切圆弧，保留真实端点和数据关系',async()=>{
 const s=await setup();await s.move(s.quote.id,s.page2);await s.page(s.page1);await s.select(s.watch.id);await s.refresh()
 const before=JSON.stringify(f.workspace.getSnapshot().artifacts),d=s.line(s.quote.id).getAttribute('d')
 expectRoundedOrthogonal(d);expect(d).toMatch(/^M 388 403 /);expect(d).toMatch(/178 39$/)
 expect(JSON.stringify(f.workspace.getSnapshot().artifacts)).toBe(before)
},15000)
it('页签输入到组件同样使用正交直线与相切圆弧',async()=>{
 const s=await setup();await s.move(s.quote.id,s.page2);await s.select(s.quote.id);await s.refresh()
 const d=s.line(s.quote.id).getAttribute('d');expectRoundedOrthogonal(d)
 expect(d).toMatch(/^M 64 39 /);expect(d).toMatch(/468 403$/)
})
it('关联描边和可视末端随选择、切页、回移、断开、删除及卸载清理，保留原有拖入状态',async()=>{
 const s=await setup(),target=()=>f.document.querySelector(`[data-board-tab="${s.page2}"]`),marked=()=>f.document.querySelectorAll('[data-financial-connection-target]'),stems=()=>f.document.querySelectorAll('[data-financial-connection-stem]')
 await s.move(s.quote.id,s.page2);await s.page(s.page1);await s.select(s.watch.id);await s.refresh()
 expect(target().hasAttribute('data-financial-connection-target')).toBe(true);expect(stems()).toHaveLength(1)
 target().setAttribute('data-tab-accept','')
 await f.act(()=>f.workspace.updateSelection([],'replace'))
 expect(marked()).toHaveLength(0);expect(stems()).toHaveLength(0);expect(target().hasAttribute('data-tab-accept')).toBe(true)
 await s.select(s.watch.id);await s.page(s.page2);await s.select(s.quote.id);await s.refresh()
 expect(f.document.querySelector(`[data-board-tab="${s.page1}"]`).hasAttribute('data-financial-connection-target')).toBe(true)
 await s.move(s.quote.id,s.page1);await s.select(s.watch.id);await s.refresh();expect(marked()).toHaveLength(0);expect(stems()).toHaveLength(0)
 await s.move(s.quote.id,s.page2);await s.page(s.page1);await s.select(s.watch.id);await s.refresh()
 const hit=f.host.querySelector(`[data-financial-link="${s.quote.id}"] [role=button]`);await f.event('contextmenu',hit)
 expect(marked()).toHaveLength(0);expect(stems()).toHaveLength(0)
 await f.act(()=>f.workspace.undo());await s.select(s.watch.id);await s.refresh();expect(marked()).toHaveLength(1)
 const nav=f.workspace.getSnapshot().artifacts.find(n=>n.id===s.nav.id)
 await f.act(()=>f.workspace.saveBoardTabs(nav.containerSpec.revision,s.tabs().filter(t=>t.id!==s.page2)))
 expect(marked()).toHaveLength(0);expect(stems()).toHaveLength(0)
 await f.act(()=>f.workspace.undo());await s.select(s.watch.id);await s.refresh()
 const held=target(),stem=stems()[0];expect(held.hasAttribute('data-financial-connection-target')).toBe(true)
 await f.dispose();f=null
 expect(held.hasAttribute('data-financial-connection-target')).toBe(false);expect(stem.isConnected).toBe(false)
})
it('多个远端组件共享页签时只画一份关联状态，分到不同页签后分别标记且断开一个不移除另一个',async()=>{
 const s=await setup();let news
 await f.act(()=>{news=f.workspace.createFinancialWidget('news')});await s.connect(s.watch.id,news.id)
 await s.move(s.quote.id,s.page2);await s.page(s.page1);await s.move(news.id,s.page2);await s.page(s.page1);await s.select(s.watch.id);await s.refresh()
 const marked=()=>[...f.document.querySelectorAll('[data-financial-connection-target]')].map(el=>el.dataset.boardTab)
 expect(marked()).toEqual([s.page2]);expect(f.document.querySelectorAll('[data-financial-connection-stem]')).toHaveLength(1)
 expect(f.host.querySelectorAll('[data-financial-link]')).toHaveLength(2)
 const nav=f.workspace.getSnapshot().artifacts.find(n=>n.id===s.nav.id)
 await f.act(()=>f.workspace.saveBoardTabs(nav.containerSpec.revision,[...s.tabs(),{id:'third-related-page',name:'公告',nodeIds:[]}]))
 await s.page(s.page2);await s.move(news.id,'third-related-page');await s.page(s.page1);await s.select(s.watch.id);await s.refresh()
 expect(marked().sort()).toEqual([s.page2,'third-related-page'].sort());expect(f.document.querySelectorAll('[data-financial-connection-stem]')).toHaveLength(2)
 await f.event('contextmenu',f.host.querySelector(`[data-financial-link="${s.quote.id}"] [role=button]`))
 expect(marked()).toEqual(['third-related-page']);expect(s.line(news.id)).not.toBeNull();expect(s.spec(news.id).linkedSourceId).toBe(s.watch.id)
})
