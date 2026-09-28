import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import {Window} from 'happy-dom'
import {afterEach,it,expect,vi} from 'vitest'
import {patchResearchGridWorkbench,restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
import {workbenchRefreshTooltip} from '../scripts/lib/research-grid-ui.mjs'
const require=createRequire(import.meta.url),React=require('react'),{act,createElement}=React,{createRoot}=require('react-dom/client')
const disposals=[]
afterEach(async()=>{for(const dispose of disposals.splice(0).reverse())await dispose()})
const text=(id,x=260,y=160)=>({id,kind:'pasted-text',messageId:id,title:id,excerpt:'# 真实组件\n保留正文',x,y,width:480,height:280,sizeMode:'manual'})
async function fixture(mount=false,desktop={}){
 const win=new Window({url:'https://ework.local'}),document=win.document
 const keys=['window','document','navigator','IS_REACT_ACT_ENVIRONMENT'],original=keys.map(k=>Object.getOwnPropertyDescriptor(globalThis,k))
 keys.forEach((k,i)=>Object.defineProperty(globalThis,k,{configurable:true,value:[win,document,win.navigator,true][i]}))
 let descriptor
 win.dshDesktop=desktop;win.__ModuleLoader__={load:d=>descriptor=d};win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
 const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 runInNewContext(source,{window:win,document,localStorage:win.localStorage,navigator:win.navigator,CSS:win.CSS,HTMLElement:win.HTMLElement,HTMLTextAreaElement:win.HTMLTextAreaElement,Text:win.Text,ResizeObserver:win.ResizeObserver,MutationObserver:win.MutationObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),AbortController,TextDecoder,TextEncoder,setTimeout,clearTimeout,setInterval,clearInterval,console})
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
 const bundle=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?require(id):id==='react-dom'?require(id):id==='@deepseek-ai/dsh-client-ui-primitives'?new Proxy({MarkdownText:({text})=>createElement('div',null,text)},{get:(t,k)=>t[k]||(String(k).startsWith('Icon')?()=>null:fake)}):fake)
 const registry=new bundle.ResearchWorkspaceRegistry(win.localStorage),workspace=registry.for('grid-test'),host=document.createElement('div');document.body.append(host)
 let root,canvas
 const generation={disabled:false,generate:vi.fn(async()=>({ok:true,taskId:'t'}))},actions={setResearchRightTab:vi.fn()}
 const render=async({measure=true}={})=>{root??=createRoot(host);await act(async()=>root.render(createElement(bundle.ResearchCanvas,{sessionId:'grid-test',t:x=>x,researchWorkspaces:registry,selectionGeneration:generation,actions})));canvas=host.querySelector('[data-research-canvas]');canvas.getBoundingClientRect=()=>({left:0,top:0,right:1000,bottom:700,width:1000,height:700});Object.defineProperty(canvas,'clientWidth',{configurable:true,value:1000});Object.defineProperty(canvas,'clientHeight',{configurable:true,value:700});if(measure)await act(async()=>{workspace.setCanvasSize({width:1000,height:700,availableWidth:1000});workspace.setWorkbenchWidth(1000)})}
 const event=async(type,target,props={})=>{const e=new win.Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,Object.fromEntries(Object.entries(props).map(([k,v])=>[k,{value:v}])));await act(async()=>{target.dispatchEvent(e);await new Promise(r=>setTimeout(r,30))});return e}
 disposals.push(async()=>{if(root)await act(async()=>root.unmount());await win.happyDOM.abort();keys.forEach((k,i)=>original[i]?Object.defineProperty(globalThis,k,original[i]):delete globalThis[k])})
 if(mount)await render()
 return {source,win,document,bundle,workspace,registry,host,get canvas(){return canvas},event,render,actions,generation}
}
it('重复补丁恢复原始代码且不积累事件或样式',async()=>{
 const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),base=restoreResearchGridWorkbench(source),once=patchResearchGridWorkbench(base)
 expect(restoreResearchGridWorkbench(once).trim()).toBe(base.trim())
 expect(patchResearchGridWorkbench(once)).toBe(once)
})
it('拖动网格事务可撤销并恢复所有让位组件，重新打开保持格位',async()=>{
 const f=await fixture();f.workspace.setCanvasSize({width:1000,height:700});f.workspace.setArtifacts([text('a'),text('b',740)]);f.workspace.setWorkbenchWidth(1000)
 const before=structuredClone(f.workspace.getSnapshot().artifacts),cells=f.workspace.getWorkbenchCells()
 f.workspace.applyWorkbenchCells(cells.map(n=>({...n,x:n.id==='a'?20:0})),true)
 expect(f.workspace.getSnapshot().artifacts.find(n=>n.id==='a').x).not.toBe(before[0].x)
 expect(f.workspace.undo()).toBe(true)
 expect(f.workspace.getSnapshot().artifacts.map(n=>[n.id,n.x,n.y,n.width,n.height])).toEqual(before.map(n=>[n.id,n.x,n.y,n.width,n.height]))
 const restored=f.bundle.createResearchWorkspaceSession(f.win.localStorage,'grid-test');restored.setCanvasSize({width:1000,height:700});restored.setWorkbenchWidth(1000)
 expect(restored.getWorkbenchCells()).toEqual(f.workspace.getWorkbenchCells())
})
it('链接和语音草稿在末尾追加，保留不等大的已有组件',async()=>{
 const f=await fixture();f.workspace.setCanvasSize({width:1000,height:700});f.workspace.setArtifacts([text('a'),{...text('b',740),height:500}]);f.workspace.setWorkbenchWidth(1000)
 const bottom=Math.max(...f.workspace.getWorkbenchCells().map(n=>n.y+n.h))
 const link=f.workspace.createContainerDraft(null,'link'),voice=f.workspace.createContainerDraft(null,'voice'),cells=f.workspace.getWorkbenchCells()
 expect(cells.find(n=>n.id===link.id).y).toBe(bottom)
 expect(cells.find(n=>n.id===voice.id).y).toBeGreaterThan(cells.find(n=>n.id===link.id).y)
 expect(f.workspace.getSnapshot().artifacts.find(n=>n.id===voice.id).title).toBe('语音组件')
 f.workspace.updateSelection([link.id],'replace')
 expect(f.workspace.getWorkbenchCells().find(n=>n.id===link.id).y).toBe(bottom)
})
it('顶栏问答进入右侧会话，更多菜单包含三项原工具',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 expect(f.host.querySelector('[data-workbench-refresh="a"]')).not.toBeNull()
 await f.event('click',f.host.querySelector('[data-workbench-ask="a"]'))
 expect(f.actions.setResearchRightTab).toHaveBeenCalledWith('conversation');expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual(['a'])
 await f.event('click',f.host.querySelector('[data-workbench-more="a"]'))
 expect(f.document.querySelector('.ew-grid-menu').textContent).toContain('思维导图')
 expect(f.document.querySelector('.ew-grid-menu').textContent).toContain('总结提炼')
 expect(f.document.querySelector('.ew-grid-menu').textContent).toContain('基于所选创建')
})
it('组件工具在已有组件上拉框，取消恢复让位；选择工具仍框选',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const before=structuredClone(f.workspace.getSnapshot().artifacts)
 await f.event('click',f.document.querySelector('[data-research-global-container]'))
 await f.event('pointerdown',f.host.querySelector('[data-research-node-id="a"]'),{button:0,pointerId:1,clientX:20,clientY:20})
 await f.event('pointermove',f.canvas,{pointerId:1,clientX:470,clientY:280})
 expect(f.canvas.getAttribute('data-grid-operation')).toBe('draw')
 await f.event('pointercancel',f.canvas,{pointerId:1})
 expect(f.workspace.getSnapshot().artifacts).toEqual(before)
 await f.event('click',f.document.querySelector('[data-research-global-select]'))
 await f.event('pointerdown',f.canvas,{button:0,pointerId:2,clientX:0,clientY:0})
 await f.event('pointermove',f.canvas,{pointerId:2,clientX:950,clientY:650})
 await f.event('pointerup',f.canvas,{pointerId:2,clientX:950,clientY:650})
 expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual(['a'])
})
it('刷新提示基于真实成功时间，未刷新时不显示假日期',()=>{
 expect(workbenchRefreshTooltip(null)).toEqual({relative:'尚未刷新',absolute:'暂无成功刷新记录'})
 const at=new Date('2026-09-28T06:23:00Z').getTime()
 expect(workbenchRefreshTooltip(at,at+60000).relative).toBe('Last refresh 1 minute ago')
 expect(workbenchRefreshTooltip(at,at+60000).absolute).toContain('Sep 28, 2026')
})
it('更多菜单的基于所选创建调用原生成流程并保留来源',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 await f.event('click',f.host.querySelector('[data-workbench-more="a"]'))
 const button=[...f.document.querySelectorAll('.ew-grid-menu button')].find(n=>n.textContent==='基于所选创建')
 await f.event('click',button)
 const input=f.host.querySelector('[aria-label="创建需求"]');expect(input).not.toBeNull()
 input.value='基于这些材料创建趋势分析';await f.event('input',input)
 await f.event('click',f.host.querySelector('[data-research-create-submit]'))
 expect(f.generation.generate).toHaveBeenCalledWith(expect.objectContaining({kind:'create',selectedNodeIds:['a'],prompt:'基于这些材料创建趋势分析'}))
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(2)
})
it('语音开始立即追加组件，反馈在组件内部，最终文字在同一组件生成',async()=>{
 let subscriber
 const bridge={subscribe:fn=>{subscriber=fn;return()=>{}},setActive:vi.fn(async()=>({ok:true})),start:vi.fn(async()=>({ok:true})),stop:vi.fn(async()=>({ok:true})),cancel:vi.fn(async()=>({ok:true}))}
 const f=await fixture(true,{researchVoice:bridge});await act(async()=>f.workspace.setArtifacts([text('a')]))
 await f.event('click',f.document.querySelector('[data-research-global-voice]'))
 const voice=f.workspace.getSnapshot().artifacts.find(n=>n.title==='语音组件')
 expect(voice).toBeDefined();expect(f.workspace.getSnapshot().artifacts).toHaveLength(2)
 expect(f.host.querySelector('[data-research-node-id="'+voice.id+'"] [data-research-voice-feedback]')).not.toBeNull()
 const request=bridge.start.mock.calls[0][0]
 await act(async()=>{subscriber({...request,type:'final',text:'分析这些金融指标'});await new Promise(r=>setTimeout(r,30))})
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(2)
 expect(f.generation.generate).toHaveBeenCalledWith(expect.objectContaining({kind:'container',targetNodeId:voice.id,prompt:'分析这些金融指标'}))
})
it('拉框松手只创建一次并保持目标格位，缩放更新真实渲染尺寸',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 await f.event('click',f.document.querySelector('[data-research-global-container]'))
 await f.event('pointerdown',f.canvas,{button:0,pointerId:5,clientX:20,clientY:20})
 await f.event('pointermove',f.canvas,{pointerId:5,clientX:490,clientY:290})
 await f.event('pointerup',f.canvas,{pointerId:5,clientX:490,clientY:290})
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(2)
 const draft=f.workspace.getSnapshot().artifacts.find(n=>n.id!=='a'),beforeWidth=draft.width
 expect(f.workspace.getWorkbenchCells().find(n=>n.id===draft.id)).toMatchObject({x:0,y:0})
 await f.event('pointerdown',f.host.querySelector('[data-workbench-resize="'+draft.id+'"]'),{button:0,pointerId:6,clientX:490,clientY:290})
 await f.event('pointerup',f.canvas,{pointerId:6,clientX:735,clientY:395})
 const after=f.workspace.getSnapshot().artifacts.find(n=>n.id===draft.id),card=f.host.querySelector('[data-research-node-id="'+draft.id+'"]')
 expect(after.width).toBeGreaterThan(beforeWidth);expect(parseFloat(card.style.width)).toBe(after.width)
})
it('改变窗口宽度后撤销和重做保持列跨度',async()=>{
 const f=await fixture();f.workspace.setCanvasSize({width:1000,height:700});f.workspace.setArtifacts([text('a'),text('b',740)]);f.workspace.setWorkbenchWidth(1000)
 const before=f.workspace.getWorkbenchCells()
 f.workspace.applyWorkbenchCells(before.map(c=>({...c,x:c.id==='a'?20:0})),true)
 const moved=f.workspace.getWorkbenchCells()
 f.workspace.setCanvasSize({width:500,height:700});f.workspace.setWorkbenchWidth(500)
 f.workspace.undo();expect(f.workspace.getWorkbenchCells()).toEqual(before)
 f.workspace.redo();expect(f.workspace.getWorkbenchCells()).toEqual(moved)
})
it('共享固定逻辑布局在不同宽度 hydrate、选择与 resize 后不漂移',async()=>{
 const f=await fixture(false,{researchBoards:{isSharedSession:()=>true}});f.workspace.setCollaborationAccess(true)
 f.workspace.setCanvasSize({width:1000,height:700});f.workspace.setArtifacts([text('a'),text('b',740)]);f.workspace.setWorkbenchWidth(1000)
 const cells=f.workspace.getWorkbenchCells(),document=f.workspace.getWorkbenchDocument()
 f.workspace.setCanvasSize({width:500,height:700});f.workspace.setWorkbenchWidth(500)
 expect(f.workspace.getWorkbenchDocument()).toEqual(document)
 f.workspace.applyRemoteCanvas(document,{revision:1});f.workspace.updateSelection(['a'],'replace')
 expect(f.workspace.getWorkbenchCells()).toEqual(cells);expect(f.workspace.getWorkbenchDocument()).toEqual(document)
})
it('失焦取消拖动，受协作占用的让位组件不会移动',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a'),text('b',740)]))
 await act(async()=>f.workspace.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:9},{id:'b',x:20,y:0,w:20,h:9}],true))
 const before=structuredClone(f.workspace.getSnapshot().artifacts)
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="a"]'),{button:0,pointerId:7,clientX:200,clientY:24})
 await f.event('pointermove',f.canvas,{pointerId:7,clientX:400,clientY:120})
 await f.event('blur',f.win)
 expect(f.canvas.hasAttribute('data-grid-operation')).toBe(false);expect(f.workspace.getSnapshot().artifacts).toEqual(before)
 f.host.querySelector('[data-research-node-id="b"]').setAttribute('data-research-geometry-blocked','')
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="a"]'),{button:0,pointerId:8,clientX:200,clientY:24})
 f.host.querySelector('[data-research-node-id="b"]').setAttribute('data-research-geometry-blocked','')
 await f.event('pointerup',f.canvas,{pointerId:8,clientX:680,clientY:24})
 expect(f.workspace.getSnapshot().artifacts).toEqual(before)
})
it('语音取消恢复可编辑正文，重试复用未提交草稿',async()=>{
 const bridge={subscribe:()=>()=>{},setActive:async()=>({ok:true}),start:async()=>({ok:true}),cancel:async()=>({ok:true})}
 const f=await fixture(true,{researchVoice:bridge})
 await f.event('click',f.document.querySelector('[data-research-global-voice]'))
 const voice=f.workspace.getSnapshot().artifacts[0],card=f.host.querySelector('[data-research-node-id="'+voice.id+'"]')
 expect(card.hasAttribute('data-research-voice-target')).toBe(true)
 await f.event('click',card.querySelector('[data-research-voice-cancel]'))
 expect(card.hasAttribute('data-research-voice-target')).toBe(false)
 expect(card.querySelector('textarea')).not.toBeNull()
 await f.event('click',f.document.querySelector('[data-research-global-voice]'))
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(1)
})
it('失败完成时间不作为成功刷新时间',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([{...text('a'),generationStatus:'failed',generationCompletedAt:Date.now()}]))
 await f.event('mouseover',f.host.querySelector('.ew-grid-refresh'))
 expect(f.document.querySelector('[role=tooltip]')?.textContent).toBe('尚未刷新暂无成功刷新记录')
})
it('滚动后的框选覆盖层和选中创建浮层保留可见坐标',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 f.canvas.scrollTop=600;await f.event('scroll',f.canvas)
 await f.event('pointerdown',f.canvas,{button:0,pointerId:9,clientX:0,clientY:100})
 await f.event('pointermove',f.canvas,{pointerId:9,clientX:900,clientY:250})
 expect(parseFloat(f.host.querySelector('[data-research-marquee]').style.top)).toBe(700)
 await f.event('pointerup',f.canvas,{pointerId:9,clientX:900,clientY:250})
 const more=f.host.querySelector('[data-workbench-more="a"]');more.getBoundingClientRect=()=>({left:800,top:100,right:820,bottom:124,width:20,height:24})
 await f.event('click',more)
 await f.event('click',[...f.document.querySelectorAll('.ew-grid-menu button')].find(n=>n.textContent==='基于所选创建'))
 expect(parseFloat(f.host.querySelector('[data-research-create-popover]').style.top)).toBeGreaterThanOrEqual(600)
})

it('拖动期间窗口缩窄后失焦取消仍恢复原跨度',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const cells=f.workspace.getWorkbenchCells()
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="a"]'),{button:0,pointerId:10,clientX:200,clientY:24})
 await f.event('pointermove',f.canvas,{pointerId:10,clientX:400,clientY:140})
 await act(async()=>{f.workspace.setCanvasSize({width:500,height:700,availableWidth:500});f.workspace.setWorkbenchWidth(500)})
 await f.event('blur',f.win)
 expect(f.workspace.getWorkbenchCells()).toEqual(cells)
})

it('窄窗口的合法小跨度不会被渲染器放大而重叠',async()=>{
 const f=await fixture(true);await act(async()=>{f.workspace.setArtifacts([text('a'),text('b')]);f.workspace.setCanvasSize({width:500,height:700,availableWidth:500});f.workspace.setWorkbenchWidth(500);f.workspace.applyWorkbenchCells([{id:'a',x:0,y:0,w:4,h:7},{id:'b',x:4,y:0,w:4,h:7}],true)})
 const [a,b]=f.workspace.getSnapshot().artifacts
 expect(parseFloat(f.host.querySelector('[data-research-node-id="a"]').style.width)).toBe(a.width)
 expect(parseFloat(f.host.querySelector('[data-research-node-id="b"]').style.width)).toBe(b.width)
 expect(a.x-a.width/2).toBeGreaterThanOrEqual(12)
 expect(a.x+a.width/2).toBeLessThan(b.x-b.width/2)
})

it('滚动后的编辑与导出菜单在可见区域打开',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 f.canvas.scrollTop=600;await f.event('scroll',f.canvas)
 await f.event('click',f.host.querySelector('[data-workbench-more="a"]'),{clientX:800,clientY:110})
 await f.event('click',[...f.document.querySelectorAll('.ew-grid-menu button')].find(n=>n.textContent==='编辑与导出'))
 expect(parseFloat(f.host.querySelector('.rScV5Q_contextMenu').style.top)).toBe(710)
})

it('底部工具栏通过 React 挂载到页面，避开滚动容器的固定定位边界',async()=>{
 const f=await fixture(true),toolbar=f.document.querySelector('[data-ework-toolbar]')
 expect(toolbar.parentElement).toBe(f.document.body)
 f.canvas.getBoundingClientRect=()=>({left:88,top:68,right:988,bottom:828,width:900,height:760})
 await act(async()=>f.workspace.setCanvasSize({width:900,height:760,availableWidth:900}))
 expect(parseFloat(toolbar.style.left)).toBe(538)
 await f.event('click',toolbar.querySelector('[data-research-global-container]'))
 expect(f.canvas.getAttribute('data-canvas-tool')).toBe('component')
 f.canvas.focus();await f.event('keydown',f.win,{code:'KeyV',key:'v'})
 expect(f.canvas.getAttribute('data-canvas-tool')).toBe('select')
 await f.event('keydown',f.win,{code:'KeyF',key:'f'})
 expect(f.canvas.getAttribute('data-canvas-tool')).toBe('component')
})

it('缓存宽度与窗口一致的首次挂载仍量测并显示工具栏',async()=>{
 const f=await fixture()
 const cached={width:1000,height:700,availableWidth:1000,visibleHeight:700}
 f.workspace.setCanvasSize(cached)
 f.workspace.setWorkbenchWidth(1000)
 const bounds=f.win.HTMLElement.prototype.getBoundingClientRect
 f.win.HTMLElement.prototype.getBoundingClientRect=()=>({left:88,top:68,right:1088,bottom:768,width:1000,height:700})
 await f.render({measure:false})
 const toolbar=f.document.querySelector('[data-ework-toolbar]')
 expect(toolbar.style.visibility).toBe('visible')
 f.win.HTMLElement.prototype.getBoundingClientRect=bounds
})

it('工作台顶栏下的组件拖动使用滚动区域原点进行格位换算',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 f.canvas.getBoundingClientRect=()=>({left:88,top:68,right:1088,bottom:768,width:1000,height:700})
 await act(async()=>f.workspace.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:8}],true))
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="a"]'),{button:0,pointerId:11,clientX:200,clientY:90})
 await f.event('pointermove',f.canvas,{pointerId:11,clientX:200,clientY:160})
 expect(f.workspace.getWorkbenchCells()[0]).toMatchObject({x:0,y:2,w:20,h:8})
 await f.event('pointerup',f.canvas,{pointerId:11,clientX:200,clientY:160})
 expect(f.workspace.getWorkbenchCells()[0]).toMatchObject({x:0,y:0,w:20,h:8})
})
