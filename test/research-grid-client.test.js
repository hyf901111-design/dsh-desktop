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
 runInNewContext(source,{window:win,document,localStorage:win.localStorage,navigator:win.navigator,CSS:win.CSS,HTMLElement:win.HTMLElement,HTMLTextAreaElement:win.HTMLTextAreaElement,Text:win.Text,CustomEvent:win.CustomEvent,ResizeObserver:win.ResizeObserver,MutationObserver:win.MutationObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),AbortController,TextDecoder,TextEncoder,setTimeout,clearTimeout,setInterval,clearInterval,console})
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
 expect(workbenchRefreshTooltip(at,at+60000).relative).toBe('上次刷新：1 分钟前')
 expect(workbenchRefreshTooltip(at,at+60000).absolute).toMatch(/^2026年9月28日 \d{2}:23$/)
})

it('工作台和菜单图标使用打包的 Figma 矢量，离线不依赖临时资源地址',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const header=f.host.querySelector('.ew-grid-header')
 for(const name of ['refresh','ask','more','close']){
  const icon=header.querySelector('[data-workbench-icon="'+name+'"]')
  expect(icon).not.toBeNull();expect(icon.tagName).toBe('SPAN')
  const source=await readFile('build/figma-workbench-icons/'+name+'.svg','utf8')
  expect(f.document.getElementById('ework-grid-workbench-style').textContent).toContain(Buffer.from(source).toString('base64'))
 }
 await f.event('click',header.querySelector('[data-workbench-more]'))
 for(const name of ['duplicate','expand','rename','edit','branch','summary','plus']){
  const icon=f.document.querySelector('.ew-grid-menu .ew-grid-icon-'+name)
  expect(icon,name).not.toBeNull()
 }
 const css=f.document.getElementById('ework-grid-workbench-style').textContent
 expect(css).not.toContain('figma.com/api/mcp/asset/')
})

it('连续正方形网格与吸附共用原点，拉框显示占格和真实组件间距',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 await f.event('click',f.document.querySelector('[data-research-global-container]'))
 const layer=f.canvas.querySelector('[data-research-content-layer]'),step=(1000-14)/40,gap=10
 const pattern=layer.style.getPropertyValue('--grid-pattern')
 expect(pattern).toContain('data:image/svg+xml')
 const svg=new f.win.DOMParser().parseFromString(decodeURIComponent(pattern.match(/data:image\/svg\+xml,([^"']+)/)[1]),'image/svg+xml')
 const tile=svg.documentElement,lines=svg.querySelector('path')
 expect(Number(tile.getAttribute('width'))).toBeCloseTo(step)
 expect(Number(tile.getAttribute('height'))).toBeCloseTo(step)
 expect(svg.querySelector('rect')).toBeNull()
 expect(lines.getAttribute('d')).toBe('M '+step+' 0 H 0 V '+step)
 expect(layer.style.getPropertyValue('--grid-gap')).toBe(gap+'px')
 const start={x:12+step*4+(step-gap)*.9,y:12+step*20+(step-gap)*.9},end={x:12+step*20+2,y:12+step*31+2}
 f.canvas.scrollTop=step*18;await f.event('scroll',f.canvas)
 await f.event('pointerdown',f.canvas,{button:0,pointerId:68,clientX:start.x,clientY:start.y-f.canvas.scrollTop})
 await f.event('pointermove',f.canvas,{pointerId:68,clientX:end.x,clientY:end.y-f.canvas.scrollTop})
 const preview=f.canvas.querySelector('.ew-grid-placeholder'),left=parseFloat(preview.style.left),top=parseFloat(preview.style.top)
 expect(left).toBeCloseTo(12+step*4);expect(top).toBeCloseTo(12+step*20)
 expect(left+parseFloat(preview.style.width)).toBeCloseTo(12+step*21-gap)
 expect(top+parseFloat(preview.style.height)).toBeCloseTo(12+step*32-gap)
 expect(preview.getAttribute('data-grid-span')).toBe('17 × 12 格')
 expect(preview.style.getPropertyValue('--grid-gap')).toBe(gap+'px')
 await f.event('pointercancel',f.canvas,{pointerId:68})
})

it('工作台底部来源与时间只展示信息，点击空白或文字不打开数据设置',async()=>{
 const f=await fixture(true),node={...text('footer'),kind:'generated-container',containerPrompt:'资讯',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'html',title:'资讯',html:'<p>内容</p>'}}
 await act(async()=>f.workspace.setArtifacts([node]))
 const footer=f.host.querySelector('.odyssey-data-stamp')
 expect(footer.tagName).toBe('DIV');expect(footer.getAttribute('aria-label')).not.toContain('设置刷新频率')
 await f.event('pointerdown',footer,{button:0,pointerId:69})
 await f.event('click',footer)
 await f.event('click',footer.querySelector('.odyssey-data-frequency'))
 expect(f.document.querySelector('.odyssey-data-dialog')).toBeNull()
 expect(f.document.querySelector('[role=dialog]')).toBeNull()
 expect(footer.textContent).toContain('尚未刷新')
})

it('只给选中的组件显示外置调宽调高手柄，单轴拖动不触发底栏或更改另一尺寸',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const card=f.host.querySelector('[data-research-node-id="a"]')
 expect(f.canvas.querySelector('[data-workbench-resize]')).toBeNull()
 await act(async()=>f.workspace.updateSelection(['a'],'replace'))
 const handle=axis=>f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="'+axis+'"]')
 expect(card.contains(handle('x'))).toBe(false);expect(card.contains(handle('y'))).toBe(false)
 const before=f.workspace.getSnapshot().artifacts[0],step=(1000-14)/40
 expect(parseFloat(handle('x').style.left)).toBeCloseTo(before.x+before.width/2)
 expect(parseFloat(handle('y').style.top)).toBeCloseTo(before.y+before.height/2)
 await f.event('pointerdown',handle('x'),{button:0,pointerId:70,clientX:500,clientY:180})
 await f.event('pointerup',f.canvas,{pointerId:70,clientX:500+step*2,clientY:180+step*3})
 const wider=f.workspace.getSnapshot().artifacts[0]
 expect(wider.width).toBeCloseTo(before.width+step*2);expect(wider.height).toBe(before.height)
 await f.event('pointerdown',handle('y'),{button:0,pointerId:71,clientX:260,clientY:300})
 await f.event('pointerup',f.canvas,{pointerId:71,clientX:260+step*3,clientY:300+step*2})
 const taller=f.workspace.getSnapshot().artifacts[0]
 expect(taller.width).toBe(wider.width);expect(taller.height).toBeCloseTo(wider.height+step*2)
 await act(async()=>f.workspace.undo());expect(f.workspace.getSnapshot().artifacts[0].height).toBe(before.height)
 await act(async()=>f.workspace.undo());expect(f.workspace.getSnapshot().artifacts[0].width).toBe(before.width)
 await act(async()=>{f.workspace.setCanvasSize({width:240,height:700,availableWidth:240});f.workspace.setWorkbenchWidth(240)})
 expect(parseFloat(handle('x').style.width)).toBeLessThanOrEqual((240-24-40*4)/39)
 expect(parseFloat(handle('y').style.height)).toBeLessThanOrEqual((240-24-40*4)/39)
 expect(f.win.getComputedStyle(handle('x').querySelector('span')).pointerEvents).toBe('none')
 await act(async()=>{card.setAttribute('data-research-geometry-blocked','');await new Promise(r=>setTimeout(r,30))})
 expect(handle('x')).toBeNull();expect(handle('y')).toBeNull()
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
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="'+draft.id+'"][data-workbench-resize-axis="x"]'),{button:0,pointerId:6,clientX:490,clientY:290})
 await f.event('pointerup',f.canvas,{pointerId:6,clientX:735,clientY:395})
 const after=f.workspace.getSnapshot().artifacts.find(n=>n.id===draft.id),card=f.host.querySelector('[data-research-node-id="'+draft.id+'"]')
 expect(after.width).toBeGreaterThan(beforeWidth);expect(parseFloat(card.style.width)).toBe(after.width)
})
it('智能草稿短拉框也达到可编辑最小尺寸，缩放不能收小，窄窗和已有小草稿不污染规范布局',async()=>{
 const f=await fixture(true),w=f.workspace,step=(1000-14)/40
 await f.event('click',f.document.querySelector('[data-research-global-container]'))
 await f.event('pointerdown',f.canvas,{button:0,pointerId:71,clientX:910,clientY:50})
 await f.event('pointerup',f.canvas,{pointerId:71,clientX:915,clientY:55})
 const draft=w.getSnapshot().artifacts[0]
 expect(draft.width).toBeGreaterThanOrEqual(320);expect(draft.height).toBeGreaterThanOrEqual(220)
 expect(draft.x+draft.width/2).toBeLessThanOrEqual(988)
 const cells=w.getWorkbenchCells()
 for(const axis of ['x','y']){
  const handle=f.canvas.querySelector('[data-workbench-resize="'+draft.id+'"][data-workbench-resize-axis="'+axis+'"]')
  await f.event('pointerdown',handle,{button:0,pointerId:72,clientX:900,clientY:240})
  await f.event('pointerup',f.canvas,{pointerId:72,clientX:900-step*30,clientY:240-step*30})
 }
 expect(w.getWorkbenchCells()).toEqual(cells)
 let existing;await act(async()=>{existing=w.createContainerDraft()});await act(async()=>w.applyWorkbenchCells([{id:draft.id,x:0,y:0,w:20,h:10},{id:existing.id,x:32,y:10,w:4,h:3}],true))
 const canonical=w.getWorkbenchDocument(),saved=w.getWorkbenchCells()
 for(const width of [1000,500,240]){
  await act(async()=>{w.setCanvasSize({width,height:700,availableWidth:width});w.setWorkbenchWidth(width)})
  const shown=w.getSnapshot().artifacts.find(n=>n.id===existing.id)
  expect(shown.width).toBeGreaterThanOrEqual(Math.min(320,width-24)-.001)
  expect(shown.height).toBeGreaterThanOrEqual(220)
  expect(shown.x-shown.width/2).toBeGreaterThanOrEqual(12-.001)
  expect(shown.x+shown.width/2).toBeLessThanOrEqual(width-12+.001)
  expect(w.getWorkbenchDocument()).toEqual(canonical)
 }
 await act(async()=>{w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000)})
 expect(w.getWorkbenchCells()).toEqual(saved)
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
 expect(parseFloat(f.host.querySelector('[data-research-node-id="a"]').style.width)).toBeCloseTo(a.width,5)
 expect(parseFloat(f.host.querySelector('[data-research-node-id="b"]').style.width)).toBeCloseTo(b.width,5)
 expect(a.x-a.width/2).toBeGreaterThanOrEqual(12)
 expect(a.x+a.width/2).toBeLessThan(b.x-b.width/2)
})

it('滚动后的编辑与导出菜单在可见区域打开',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 f.canvas.scrollTop=600;await f.event('scroll',f.canvas)
 await f.event('click',f.host.querySelector('[data-workbench-more="a"]'),{clientX:800,clientY:110})
 await f.event('click',[...f.document.querySelectorAll('.ew-grid-menu button')].find(n=>n.textContent==='编辑与导出'))
 const menu=f.document.querySelector('.rScV5Q_contextMenu')
 expect(menu.parentElement).toBe(f.document.body)
 expect(parseFloat(menu.style.top)).toBe(110)
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
 f.workspace.setArtifacts([text('a')]);f.workspace.updateSelection(['a'],'replace')
 f.workspace.setWorkbenchWidth(1000)
 const bounds=f.win.HTMLElement.prototype.getBoundingClientRect
 f.win.HTMLElement.prototype.getBoundingClientRect=()=>({left:88,top:68,right:1088,bottom:768,width:1000,height:700})
 await f.render({measure:false})
 const toolbar=f.document.querySelector('[data-ework-toolbar]')
 expect(toolbar.style.visibility).toBe('visible')
 expect(f.host.querySelector('[data-workbench-drag-handle="a"]')).not.toBeNull()
 expect(f.host.querySelector('.ew-grid-selection-ring')).not.toBeNull()
 f.win.HTMLElement.prototype.getBoundingClientRect=bounds
})

it('工作台顶栏下的组件拖动使用滚动区域原点进行格位换算',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 f.canvas.getBoundingClientRect=()=>({left:88,top:68,right:1088,bottom:768,width:1000,height:700})
 await act(async()=>f.workspace.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:8}],true))
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="a"]'),{button:0,pointerId:11,clientX:200,clientY:90})
 await f.event('pointermove',f.canvas,{pointerId:11,clientX:200,clientY:160})
 expect(f.workspace.getWorkbenchCells()[0]).toMatchObject({x:0,y:3,w:20,h:8})
 await f.event('pointerup',f.canvas,{pointerId:11,clientX:200,clientY:160})
 expect(f.workspace.getWorkbenchCells()[0]).toMatchObject({x:0,y:0,w:20,h:8})
})

it('未选中时组件滚轮交给工作台，选中后仅在内部可滚时消费',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const preview=f.host.querySelector('[data-research-preview-body]');preview.style.overflowY='auto'
 Object.defineProperty(preview,'clientHeight',{configurable:true,value:100});Object.defineProperty(preview,'scrollHeight',{configurable:true,value:600})
 Object.defineProperty(f.canvas,'scrollHeight',{configurable:true,value:2500})
 preview.scrollTop=100
 const wheel=await f.event('wheel',preview,{deltaX:0,deltaY:3,deltaMode:1})
 expect(wheel.defaultPrevented).toBe(true);expect(f.canvas.scrollTop).toBe(48);expect(preview.scrollTop).toBe(100)
 await act(async()=>f.workspace.updateSelection(['a'],'replace'))
 const inner=await f.event('wheel',preview,{deltaX:0,deltaY:80,deltaMode:0})
 expect(inner.defaultPrevented).toBe(false);expect(f.canvas.scrollTop).toBe(48)
 preview.scrollTop=500
 const boundary=await f.event('wheel',preview,{deltaX:0,deltaY:80,deltaMode:0})
 expect(boundary.defaultPrevented).toBe(true);expect(f.canvas.scrollTop).toBe(128)
 const relayed=await f.event('wheel',preview,{deltaX:0,deltaY:80,deltaMode:0,__sherlockCanvasPan:true})
 expect(relayed.defaultPrevented).toBe(true);expect(f.canvas.scrollTop).toBe(208)
})
it('整理走网格铺满布局，可撤销且再次整理结果稳定',async()=>{
 const f=await fixture();f.workspace.setCanvasSize({width:1000,height:700});f.workspace.setArtifacts([text('a',160,120),text('b',900,1000),text('c',250,2000)]);f.workspace.setWorkbenchWidth(1000)
 const before=f.workspace.getWorkbenchCells()
 expect(f.workspace.organizeCanvas()).toBe(true)
 const arranged=f.workspace.getWorkbenchCells(),bottom=Math.max(...arranged.map(c=>c.y+c.h))
 for(let y=0;y<bottom;y++)for(let x=0;x<40;x++)expect(arranged.filter(c=>x>=c.x&&x<c.x+c.w&&y>=c.y&&y<c.y+c.h)).toHaveLength(1)
 f.workspace.organizeCanvas();expect(f.workspace.getWorkbenchCells()).toEqual(arranged)
 f.workspace.undo();expect(f.workspace.getWorkbenchCells()).toEqual(before)
})

it('延迟挂载的HTML预览收到真实选择状态，取消选择和载入同步恢复',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('html')]))
 const frame=f.document.createElement('iframe'),post=vi.fn();frame.setAttribute('data-research-html-artifact','')
 Object.defineProperty(frame,'contentWindow',{configurable:true,value:{postMessage:post}})
 await act(async()=>{f.host.querySelector('[data-research-preview-body]').appendChild(frame);await new Promise(r=>setTimeout(r,30))})
 await act(async()=>f.workspace.updateSelection(['html'],'replace'))
 expect(post).toHaveBeenCalledWith({type:'sherlock-workbench-selection',selected:true},'*')
 await act(async()=>f.workspace.updateSelection([],'replace'))
 expect(post).toHaveBeenLastCalledWith({type:'sherlock-workbench-selection',selected:false},'*')
 post.mockClear();await f.event('load',frame)
 expect(post).toHaveBeenLastCalledWith({type:'sherlock-workbench-selection',selected:false},'*')
 expect(f.host.querySelector('.ew-grid-selection-ring')).toBeNull()
 await act(async()=>f.workspace.updateSelection(['html'],'replace'))
 expect(f.host.querySelector('.ew-grid-selection-ring')).not.toBeNull()
})

it('整理保持行情指标的紧凑高度，不把视口余量灌入指标卡',async()=>{
 const f=await fixture();f.workspace.setCanvasSize({width:1000,height:700});
 const {renderMarketArtifact}=await import('../packages/dsh-research-task-runtime/market-artifact.js')
 const spec=renderMarketArtifact({version:1,type:'market',variant:'metrics',title:'行情',asOf:'模拟数据',items:[{label:'现价',value:'1478.60'},{label:'涨幅',value:'+0.45%'}]})
 f.workspace.setArtifacts([{...text('metrics'),kind:'generated-container',containerPrompt:'行情',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:spec}]);f.workspace.setWorkbenchWidth(1000)
 expect(f.workspace.organizeCanvas()).toBe(true)
 expect(f.workspace.getSnapshot().artifacts[0].height).toBeLessThanOrEqual(200)
 expect(f.workspace.getWorkbenchCells()[0]).toMatchObject({x:0,y:0,w:40})
})

it('思维导图在右侧独立展开二级菜单，菜单图标不再用列表图标代替',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 await f.event('click',f.host.querySelector('[data-workbench-more="a"]'))
 const menu=f.document.querySelector('.ew-grid-menu'),mind=menu.querySelector('[aria-label="思维导图"]')
 menu.getBoundingClientRect=()=>({left:210,top:80,right:416,bottom:475,width:206,height:395})
 mind.getBoundingClientRect=()=>({left:218,top:226,right:408,bottom:259,width:190,height:33})
 await f.event('mouseover',mind)
 const child=f.document.querySelector('[aria-label="思维导图详细度"]')
 expect(child).not.toBeNull();expect(menu.contains(child)).toBe(false)
 expect(parseFloat(child.style.left)).toBeGreaterThanOrEqual(416)
 expect([...child.querySelectorAll('button')].map(n=>n.textContent)).toEqual(['简要','常规','详细'])
 const paths=['重命名','编辑与导出','数据源与自动更新'].map(label=>{const button=[...menu.querySelectorAll('button')].find(n=>n.textContent===label);return button.querySelector('[data-workbench-icon]')?.getAttribute('data-workbench-icon')||button.querySelector('path')?.getAttribute('d')})
 expect(new Set(paths).size).toBe(3)
 expect(paths).not.toContain(menu.querySelector('[aria-label="思维导图"] [data-workbench-icon]').getAttribute('data-workbench-icon'))
})

it('原生窗口仍处于缩放过程中时实时使用新的可见宽度，保留格位和内容',async()=>{
 const f=await fixture(true);await act(async()=>{f.workspace.setArtifacts([text('a')]);f.workspace.applyWorkbenchCells([{id:'a',x:0,y:0,w:40,h:8}],true)})
 const cells=f.workspace.getWorkbenchCells(),excerpt=f.workspace.getSnapshot().artifacts[0].excerpt
 f.document.documentElement.setAttribute('data-odyssey-window-resizing','')
 Object.defineProperty(f.canvas,'clientWidth',{configurable:true,value:1500})
 f.canvas.getBoundingClientRect=()=>({left:0,top:0,right:1500,bottom:700,width:1500,height:700})
 await f.event('resize',f.win)
 const node=f.workspace.getSnapshot().artifacts[0]
 expect(f.workspace.getSnapshot().canvasSize).toMatchObject({width:1500,availableWidth:1500})
 expect(node.x+node.width/2).toBeCloseTo(1488)
 expect(parseFloat(f.host.querySelector('[data-research-node-id="a"]').style.width)).toBe(node.width)
 expect(f.workspace.getWorkbenchCells()).toEqual(cells);expect(node.excerpt).toBe(excerpt)
})

it('点击HTML控件的选择消息不改变层级或宿主DOM，避免关闭下拉框或重载内容',async()=>{
 const f=await fixture(true),html={...text('html'),kind:'generated-container',containerPrompt:'筛选新闻',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'html',title:'新闻',html:'<select><option>全部</option><option>行业</option></select><button>展开全部</button>'}}
 await act(async()=>f.workspace.setArtifacts([html,text('other')]))
 const card=f.host.querySelector('[data-research-node-id="html"]'),frame=card.querySelector('iframe')
 const stackOrder=f.workspace.getSnapshot().artifacts[0].stackOrder
 expect(frame).not.toBeNull()
 const moved=[];const observer=new f.win.MutationObserver(records=>{for(const record of records)for(const removed of record.removedNodes)if(removed===card||removed.contains?.(frame))moved.push(removed)})
 observer.observe(f.host,{childList:true,subtree:true})
 await act(async()=>f.workspace.updateSelection(['html'],'replace'))
 await f.event('sherlock-research-content-select',frame,{detail:{metaKey:false,shiftKey:false}})
 expect(f.workspace.getSnapshot().artifacts[0].stackOrder).toBe(stackOrder)
 expect(f.workspace.getSnapshot().artifacts.map(n=>n.id)).toEqual(['html','other'])
 expect(moved).toHaveLength(0);observer.disconnect()
 expect(card.querySelector('iframe')).toBe(frame)
})

it('Shift多选顶栏与正文只切换组件，阻止文本选区且不启动拖动',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a'),text('b')]))
 const a=f.host.querySelector('[data-research-node-id="a"]'),b=f.host.querySelector('[data-research-node-id="b"]')
 const range=f.document.createRange();range.selectNodeContents(a.querySelector('[data-research-preview-body]'));f.win.getSelection().addRange(range)
 await act(async()=>f.workspace.updateSelection(['a'],'replace'))
 const down=await f.event('pointerdown',b.querySelector('[data-workbench-drag-handle]'),{button:0,pointerId:17,shiftKey:true,clientX:300,clientY:30})
 expect(down.defaultPrevented).toBe(true)
 expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual(['a','b'])
 expect(f.canvas.hasAttribute('data-grid-operation')).toBe(false)
 expect(f.win.getSelection().toString()).toBe('')
 const remove=await f.event('pointerdown',a.querySelector('[data-research-preview-body]'),{button:0,pointerId:18,shiftKey:true})
 expect(remove.defaultPrevented).toBe(true);expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual(['b'])
 const ordinary=await f.event('pointerdown',b.querySelector('[data-research-preview-body]'),{button:0,pointerId:19})
 expect(ordinary.defaultPrevented).toBe(false)
})

it('内容底部保留一屏可创建留白，向下滚动后能拉框追加组件',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const before=f.workspace.getSnapshot().artifacts[0],bottom=before.y+before.height/2
 const layer=f.host.querySelector('[data-research-content-layer]')
 expect(parseFloat(layer.style.height)-bottom).toBeGreaterThanOrEqual(700)
 f.canvas.scrollTop=bottom;await f.event('scroll',f.canvas)
 await f.event('click',f.document.querySelector('[data-research-global-container]'))
 await f.event('pointerdown',f.canvas,{button:0,pointerId:20,clientX:12,clientY:100})
 await f.event('pointerup',f.canvas,{pointerId:20,clientX:490,clientY:390})
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(2)
 const added=f.workspace.getSnapshot().artifacts.find(n=>n.id!=='a')
 expect(added.y-added.height/2).toBeGreaterThan(bottom)
})


it('组件设置向右展开，复用原编辑和定时任务操作而不弹出旧菜单',async()=>{
 const f=await fixture(true),node={...text('settings'),kind:'generated-container',containerPrompt:'研究行情',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'markdown',title:'行情',content:'# 行情\n真实内容'}}
 await act(async()=>f.workspace.setArtifacts([node]))
 const open=async()=>{
  await f.event('click',f.host.querySelector('[data-workbench-more="settings"]'))
  const main=f.document.querySelector('[aria-label="组件更多操作"][role="menu"]'),trigger=[...main.querySelectorAll('button')].find(n=>n.textContent.includes('组件设置'))
  main.getBoundingClientRect=()=>({left:210,top:80,right:416,bottom:475,width:206,height:395})
  trigger.getBoundingClientRect=()=>({left:218,top:390,right:408,bottom:423,width:190,height:33})
  await f.event('click',trigger)
  const child=f.document.querySelector('[aria-label="组件设置"][role="menu"]')
  expect(child).not.toBeNull();expect(main.contains(child)).toBe(false);expect(parseFloat(child.style.left)).toBeGreaterThanOrEqual(416)
  expect(f.document.querySelector('[data-odyssey-container-menu]')).toBeNull()
  expect([...child.querySelectorAll('button')].map(n=>n.textContent)).toEqual(['编辑需求','刷新数据','设定定时任务','数据源与自动更新'])
  return child
 }
 let child=await open()
 await f.event('click',[...child.querySelectorAll('button')].find(n=>n.textContent==='编辑需求'))
 expect(f.host.querySelector('[role="dialog"][aria-label="编辑需求"]')).not.toBeNull()
 await f.event('keydown',f.host.querySelector('[role="dialog"][aria-label="编辑需求"]'),{key:'Escape'})
 child=await open();const schedule=vi.fn();f.win.addEventListener('sherlock:component-schedule-open',schedule)
 await f.event('click',[...child.querySelectorAll('button')].find(n=>n.textContent==='设定定时任务'))
 expect(schedule).toHaveBeenCalledOnce();expect(schedule.mock.calls[0][0].detail).toMatchObject({sessionId:'grid-test',nodeId:'settings'})
})

it('斜移经过相邻行再进入右侧子菜单时保持展开，离开后关闭',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 await f.event('click',f.host.querySelector('[data-workbench-more="a"]'))
 const main=f.document.querySelector('[role="menu"][aria-label="组件更多操作"]'),mind=main.querySelector('[aria-label="思维导图"]')
 main.getBoundingClientRect=()=>({left:210,top:80,right:416,bottom:475,width:206,height:395})
 mind.getBoundingClientRect=()=>({left:218,top:226,right:408,bottom:259,width:190,height:33})
 await f.event('mouseover',mind)
 await f.event('mouseover',[...main.querySelectorAll('button')].find(n=>n.textContent==='总结提炼'))
 const child=f.document.querySelector('[aria-label="思维导图详细度"]');expect(child).not.toBeNull()
 await f.event('mouseover',child)
 await act(async()=>new Promise(r=>setTimeout(r,200)))
 expect(f.document.querySelector('[aria-label="思维导图详细度"]')).not.toBeNull()
 await f.event('mouseout',child)
 await act(async()=>new Promise(r=>setTimeout(r,200)))
 expect(f.document.querySelector('[aria-label="思维导图详细度"]')).toBeNull()
})


it('共享只读组件的设置菜单仍允许浏览器阅读，禁止编辑和刷新',async()=>{
 let shared=false
 const f=await fixture(false,{researchBoards:{isSharedSession:()=>shared}})
 f.workspace.setArtifacts([{...text('link'),kind:'web-link',url:'https://example.com/',title:'只读链接'}])
 shared=true;await f.render()
 await f.event('click',f.host.querySelector('[data-workbench-more="link"]'))
 const main=f.document.querySelector('[role="menu"][aria-label="组件更多操作"]'),trigger=main.querySelector('[aria-label="组件设置"]')
 main.getBoundingClientRect=()=>({left:210,top:80,right:416,bottom:475,width:206,height:395})
 trigger.getBoundingClientRect=()=>({left:218,top:390,right:408,bottom:423,width:190,height:33})
 await f.event('click',trigger)
 const child=f.document.querySelector('[role="menu"][aria-label="组件设置"]'),buttons=[...child.querySelectorAll('button')]
 expect(buttons.find(n=>n.textContent==='浏览器打开').disabled).toBe(false)
 expect(buttons.find(n=>n.textContent==='刷新').disabled).toBe(true)
 expect(buttons.find(n=>n.textContent==='修改名称').disabled).toBe(true)
})


it('组件选择变化不重复发送相同的共享上下文，避免重绘正在使用的下拉框',async()=>{
 const f=await fixture(true),html={...text('html'),kind:'generated-container',containerPrompt:'新闻',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'html',title:'新闻',html:'<select><option>全部</option><option>行业</option></select>'}}
 await act(async()=>f.workspace.setArtifacts([html]))
 const frame=f.host.querySelector('iframe[data-research-html-artifact]'),post=vi.fn()
 Object.defineProperty(frame,'contentWindow',{configurable:true,value:{postMessage:post}})
 await act(async()=>f.workspace.updateSelection(['html'],'replace'))
 expect(post.mock.calls.filter(([m])=>m.type==='sherlock-component-context')).toHaveLength(0)
 await act(async()=>f.workspace.updateSelection([],'replace'))
 expect(post.mock.calls.filter(([m])=>m.type==='sherlock-component-context')).toHaveLength(0)
 f.win.dshDesktop.researchBoards={isSharedSession:()=>true}
 await act(async()=>f.workspace.updateSelection(['html'],'replace'))
 expect(post.mock.calls.filter(([m])=>m.type==='sherlock-component-context')).toEqual([[expect.objectContaining({readOnly:true,shared:true}),'*']])
})


it('改变组件大小时只显示吸附预览蓝框，松手或取消恢复单层选中描边',async()=>{
 const f=await fixture(true);await act(async()=>{f.workspace.setArtifacts([text('a'),text('b',740)]);f.workspace.updateSelection(['a','b'],'replace')})
 const card=f.host.querySelector('[data-research-node-id="a"]'),other=f.host.querySelector('[data-research-node-id="b"]'),ring=card.querySelector('.ew-grid-selection-ring'),preview=f.canvas.querySelector('.ew-grid-placeholder')
 const down=async id=>f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="x"]'),{button:0,pointerId:id,clientX:480,clientY:250})
 await down(29);await f.event('pointermove',f.canvas,{pointerId:29,clientX:620,clientY:320})
 expect(preview.hidden).toBe(false)
 expect(f.win.getComputedStyle(ring).display).toBe('none')
 expect(f.win.getComputedStyle(other.querySelector('.ew-grid-selection-ring')).display).not.toBe('none')
 expect(Number(f.win.getComputedStyle(preview).zIndex)).toBeGreaterThan(Number(f.win.getComputedStyle(card).zIndex))
 await f.event('pointerup',f.canvas,{pointerId:29,clientX:620,clientY:320})
 expect(preview.hidden).toBe(true);expect(f.win.getComputedStyle(ring).display).not.toBe('none')
 await down(30);await f.event('pointercancel',f.canvas,{pointerId:30})
 expect(preview.hidden).toBe(true);expect(f.win.getComputedStyle(ring).display).not.toBe('none')
})

it('滚动条占宽时缩放预览四边与实际组件使用同一可用宽度',async()=>{
 const f=await fixture(true)
 await act(async()=>{f.workspace.setArtifacts([text('a')]);f.workspace.applyWorkbenchCells([{id:'a',x:8,y:6,w:24,h:8}],true);f.workspace.updateSelection(['a'],'replace')})
 Object.defineProperty(f.canvas,'clientWidth',{configurable:true,value:984})
 await f.event('resize',f.win)
 const card=f.host.querySelector('[data-research-node-id="a"]'),preview=f.canvas.querySelector('.ew-grid-placeholder')
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="x"]'),{button:0,pointerId:67,clientX:780,clientY:320})
 await f.event('pointermove',f.canvas,{pointerId:67,clientX:850,clientY:365})
 const node=f.workspace.getSnapshot().artifacts[0]
 expect(preview.hidden).toBe(false)
 expect(parseFloat(preview.style.left)).toBeCloseTo(node.x-node.width/2)
 expect(parseFloat(preview.style.top)).toBeCloseTo(node.y-node.height/2)
 expect(parseFloat(preview.style.width)).toBeCloseTo(node.width)
 expect(parseFloat(preview.style.height)).toBeCloseTo(node.height)
 expect(f.workspace.getSnapshot().canvasSize).toMatchObject({width:1000,availableWidth:984})
 await f.event('pointerup',f.canvas,{pointerId:67,clientX:850,clientY:365})
 expect(preview.hidden).toBe(true)
 expect(parseFloat(card.style.width)).toBeCloseTo(f.workspace.getSnapshot().artifacts[0].width)
})

it('画板菜单挂到页面前景，靠近底部时完整避开全局工具栏',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const original=f.win.HTMLElement.prototype.getBoundingClientRect
 f.win.HTMLElement.prototype.getBoundingClientRect=function(){
  if(this.matches('.rScV5Q_contextMenu'))return {left:0,top:0,right:260,bottom:160,width:260,height:160}
  if(this.matches('[data-ework-toolbar]'))return {left:395,top:630,right:605,bottom:684,width:210,height:54}
  return original.call(this)
 }
 f.canvas.scrollTop=350;await f.event('scroll',f.canvas)
 await f.event('contextmenu',f.canvas,{clientX:450,clientY:650,button:2})
 const menu=f.document.querySelector('.rScV5Q_contextMenu')
 expect(menu.parentElement).toBe(f.document.body)
 expect(f.win.getComputedStyle(menu).position).toBe('fixed')
 expect(Number(f.win.getComputedStyle(menu).zIndex)).toBeGreaterThan(Number(f.win.getComputedStyle(f.document.querySelector('[data-ework-toolbar]')).zIndex))
 expect(parseFloat(menu.style.top)+160).toBeLessThanOrEqual(622)
 expect(menu.textContent).toContain('整理画布')
 await f.event('keydown',menu,{key:'Escape',code:'Escape'})
 expect(f.document.querySelector('.rScV5Q_contextMenu')).toBeNull()
 f.win.HTMLElement.prototype.getBoundingClientRect=original
})

it('创建背景网格与内容层共用吸附格距，滚动后绘制框仍对应真实格位',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const layer=f.canvas.querySelector('[data-research-content-layer]'),step=(1000-14)/40
 await f.event('click',f.document.querySelector('[data-research-global-container]'))
 expect(parseFloat(layer.style.getPropertyValue('--grid-step'))).toBe(step)
 expect(f.win.getComputedStyle(layer).backgroundSize).toBe(step+'px '+step+'px')
 f.canvas.scrollTop=step*18;await f.event('scroll',f.canvas)
 const start={x:12+step*4,y:12+step*20},end={x:12+step*21-10,y:12+step*32-10}
 await f.event('pointerdown',f.canvas,{button:0,pointerId:52,clientX:start.x,clientY:start.y-f.canvas.scrollTop})
 await f.event('pointermove',f.canvas,{pointerId:52,clientX:end.x,clientY:end.y-f.canvas.scrollTop})
 const preview=f.canvas.querySelector('.ew-grid-placeholder')
 expect(parseFloat(preview.style.left)).toBeCloseTo(start.x)
 expect(parseFloat(preview.style.top)).toBeCloseTo(start.y)
 expect((parseFloat(preview.style.width)+10)/step).toBeCloseTo(17)
 expect((parseFloat(preview.style.height)+10)/step).toBeCloseTo(12)
 await f.event('pointercancel',f.canvas,{pointerId:52})
 await act(async()=>{f.workspace.setCanvasSize({width:800,height:700,availableWidth:800});f.workspace.setWorkbenchWidth(800)})
 expect(parseFloat(layer.style.getPropertyValue('--grid-step'))).toBe((800-14)/40)
})

it('旧35px行布局一次换算到正方形格位，重新打开不重复迁移',async()=>{
 const f=await fixture(),id='legacy-square',key='ework.research.grid.v1:'+id
 f.win.localStorage.setItem(key,JSON.stringify({version:1,cells:[{id:'a',x:0,y:0,w:20,h:8},{id:'b',x:0,y:8,w:20,h:10}]}))
 const w=f.bundle.createResearchWorkspaceSession(f.win.localStorage,id)
 w.setArtifacts([text('a'),text('b')]);w.setCanvasSize({width:1000,height:700});w.setWorkbenchWidth(1000)
 const cells=w.getWorkbenchCells(),step=(1000-14)/40
 expect(cells[0]).toMatchObject({x:0,y:0,w:20})
 expect(cells[0].h*step).toBeGreaterThanOrEqual(8*35)
 expect(cells[0].h*step).toBeLessThan(8*35+step)
 expect(cells[1].y).toBeGreaterThanOrEqual(cells[0].h)
 expect(JSON.parse(f.win.localStorage.getItem(key)).version).toBe(2)
 const reopened=f.bundle.createResearchWorkspaceSession(f.win.localStorage,id);reopened.setCanvasSize({width:500,height:700});reopened.setWorkbenchWidth(500)
 expect(reopened.getWorkbenchCells()).toEqual(cells)
})

it('窄窗口保留组件最小可操作高度并让位，恢复宽度与只读规范文档不漂移',async()=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>{w.setCanvasSize({width:1000,height:700});w.setArtifacts([text('a'),text('b')]);w.setWorkbenchWidth(1000);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:5},{id:'b',x:0,y:5,w:20,h:5}],true)})
 const cells=w.getWorkbenchCells(),canonical=w.getWorkbenchDocument()
 for(const width of [500,240]){
  await act(async()=>{w.setCanvasSize({width,height:700,availableWidth:width});w.setWorkbenchWidth(width)})
  const [a,b]=w.getSnapshot().artifacts
  expect(a.height).toBeGreaterThanOrEqual(95)
  expect(a.y+a.height/2).toBeLessThan(b.y-b.height/2)
  expect(w.getWorkbenchDocument()).toEqual(canonical)
 }
 const card=f.host.querySelector('[data-research-node-id="a"]')
 await f.event('pointerdown',card.querySelector('[data-workbench-drag-handle]'),{button:0,pointerId:61,clientX:40,clientY:20})
 await f.event('pointermove',f.canvas,{pointerId:61,clientX:80,clientY:80})
 await f.event('pointercancel',f.canvas,{pointerId:61})
 expect(w.getWorkbenchDocument()).toEqual(canonical)
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="y"]'),{button:0,pointerId:62,clientX:110,clientY:100})
 await f.event('pointerup',f.canvas,{pointerId:62,clientX:110,clientY:100})
 expect(w.getWorkbenchDocument()).toEqual(canonical)
 await act(async()=>{w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000)})
 expect(w.getWorkbenchCells()).toEqual(cells)
 f.win.dshDesktop.researchBoards={isSharedSession:id=>id==='readonly-square'}
 const peer=f.bundle.createResearchWorkspaceSession(f.win.localStorage,'readonly-square')
 peer.applyRemoteCanvas(canonical,{revision:1});peer.setCanvasSize({width:240,height:700,availableWidth:240});peer.setWorkbenchWidth(240)
 expect(peer.getSnapshot().artifacts.every(n=>n.height>=95)).toBe(true)
 expect(peer.getWorkbenchDocument()).toEqual(canonical)
})

it('下载格式子菜单独立置于页面前景，跨越间隙与点击时主菜单保持打开',async()=>{
 const save=vi.fn(async()=>({ok:true})),f=await fixture(true,{researchCanvasExport:{save}})
 await act(async()=>f.workspace.setArtifacts([{...text('mind'),kind:'generated-mind-map',generationStatus:'completed',generationDetail:'standard',generationLastSeq:1,sourceNodeIds:['source']}]))
 const card=f.host.querySelector('[data-research-node-id="mind"]')
 await f.event('contextmenu',card,{button:2,clientX:450,clientY:610})
 const download=f.document.querySelector('[data-research-context-download]'),group=download.parentElement
 await f.event('click',download)
 const popup=f.document.querySelector('.rScV5Q_contextDownloadFormats')
 expect(popup.parentElement).toBe(f.document.body)
 expect(f.win.getComputedStyle(popup).position).toBe('fixed')
 expect(popup.textContent).toBe('SVGPNGJPG')
 await f.event('mouseout',group,{relatedTarget:f.document.body});await f.event('mouseover',popup,{relatedTarget:f.document.body})
 await act(async()=>new Promise(r=>setTimeout(r,240)))
 expect(f.document.querySelector('.rScV5Q_contextDownloadFormats')).toBe(popup)
 await f.event('pointerdown',popup.querySelector('button'),{button:0})
 expect(f.document.querySelector('.rScV5Q_contextMenu')).not.toBeNull()
})

it('窄窗口移动不写回本地补高，缩放仅改变目标尺寸且可撤销',async()=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>{w.setArtifacts([text('a'),text('b')]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:5},{id:'b',x:0,y:5,w:20,h:5}],true);w.setCanvasSize({width:500,height:700,availableWidth:500});w.setWorkbenchWidth(500)})
 const card=f.host.querySelector('[data-research-node-id="a"]'),step=(500-14)/40
 await f.event('pointerdown',card.querySelector('[data-workbench-drag-handle]'),{button:0,pointerId:65,clientX:40,clientY:20})
 await f.event('pointerup',f.canvas,{pointerId:65,clientX:40+step,clientY:20})
 expect(w.getWorkbenchCells().map(c=>c.h)).toEqual([5,5])
 const afterMove=w.getWorkbenchCells()
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="y"]'),{button:0,pointerId:66,clientX:230,clientY:100})
 await f.event('pointerup',f.canvas,{pointerId:66,clientX:230,clientY:100+step})
 expect(w.getWorkbenchCells().find(c=>c.id==='a').h).toBe(10)
 expect(w.getWorkbenchCells().find(c=>c.id==='b').h).toBe(5)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(afterMove)
 await act(async()=>{w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000)})
 expect(w.getWorkbenchCells().map(c=>c.h)).toEqual([5,5])
})

it('单轴缩放保留未操作轴的规范尺寸，窄窗补高和小草稿补宽不写回',async()=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>{w.setArtifacts([text('a')]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:5}],true);w.setCanvasSize({width:500,height:700,availableWidth:500});w.setWorkbenchWidth(500);w.updateSelection(['a'],'replace')})
 const step=parseFloat(f.canvas.querySelector('[data-research-content-layer]').style.getPropertyValue('--grid-step'))
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize-axis=x]'),{button:0,pointerId:74,clientX:230,clientY:100})
 await f.event('pointerup',f.canvas,{pointerId:74,clientX:230+step,clientY:100+step*3})
 expect(w.getWorkbenchCells()[0]).toMatchObject({x:0,y:0,w:21,h:5})
 await act(async()=>{w.undo();w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000)})
 let draft;await act(async()=>{draft=w.createContainerDraft();w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:5},{id:draft.id,x:32,y:10,w:4,h:3}],true);w.updateSelection([draft.id],'replace')})
 const wideStep=parseFloat(f.canvas.querySelector('[data-research-content-layer]').style.getPropertyValue('--grid-step'))
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize-axis=y]'),{button:0,pointerId:75,clientX:800,clientY:500})
 await f.event('pointerup',f.canvas,{pointerId:75,clientX:800+wideStep*3,clientY:500+wideStep})
 expect(w.getWorkbenchCells().find(c=>c.id===draft.id)).toMatchObject({x:32,w:4,h:11})
 await act(async()=>w.undo())
 expect(w.getWorkbenchCells().find(c=>c.id===draft.id)).toMatchObject({x:32,w:4,h:3})
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="'+draft.id+'"]'),{button:0,pointerId:76,clientX:800,clientY:500})
 await f.event('pointerup',f.canvas,{pointerId:76,clientX:800,clientY:500+wideStep*2})
 expect(w.getWorkbenchCells().find(c=>c.id===draft.id)).toMatchObject({x:32,w:4,h:3})
})
