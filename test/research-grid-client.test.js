import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ResearchCanvasStorage} from '../src/main/state/research-canvas-storage'
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
 runInNewContext(source,{window:win,document,localStorage:win.localStorage,navigator:win.navigator,CSS:win.CSS,HTMLElement:win.HTMLElement,HTMLTextAreaElement:win.HTMLTextAreaElement,Text:win.Text,CustomEvent:win.CustomEvent,ResizeObserver:win.ResizeObserver,MutationObserver:win.MutationObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),structuredClone,AbortController,TextDecoder,TextEncoder,setTimeout,clearTimeout,setInterval,clearInterval,console})
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
it('选中正文后画布撤销重做有效，输入框保留文字撤销',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a'),text('b',740)]))
 const before=f.workspace.getWorkbenchCells();await act(async()=>f.workspace.applyWorkbenchCells(before.map(c=>({...c,x:c.id==='a'?20:0})),true))
 const moved=f.workspace.getWorkbenchCells(),card=f.host.querySelector('[data-research-node-id="a"]')
 await f.event('pointerdown',card,{button:0,pointerId:21});expect(f.document.activeElement).toBe(f.canvas)
 const body=f.document.createElement('div');body.setAttribute('data-research-preview-interactive','');card.append(body);body.tabIndex=0;body.focus()
 const undo=await f.event('keydown',body,{metaKey:true,key:'z',code:'KeyZ'});expect(undo.defaultPrevented).toBe(true);expect(f.workspace.getWorkbenchCells()).toEqual(before)
 await f.event('keydown',body,{metaKey:true,shiftKey:true,key:'Z',code:'KeyZ'});expect(f.workspace.getWorkbenchCells()).toEqual(moved)
 const input=f.document.createElement('textarea');body.append(input);input.focus()
 const editing=await f.event('keydown',input,{metaKey:true,key:'z',code:'KeyZ'});expect(editing.defaultPrevented).toBe(false);expect(f.workspace.getWorkbenchCells()).toEqual(moved)
})
it('嵌入正文撤销只接受当前选中组件的受限桥接消息',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a'),text('b',740)]))
 const before=f.workspace.getWorkbenchCells();await act(async()=>f.workspace.applyWorkbenchCells(before.map(c=>({...c,x:c.id==='a'?20:0})),true))
 const moved=f.workspace.getWorkbenchCells(),card=f.host.querySelector('[data-research-node-id="a"]'),frame=f.document.createElement('iframe');frame.setAttribute('data-research-html-artifact','');card.append(frame)
 await act(async()=>f.workspace.updateSelection(['a'],'replace'))
 const data={type:'sherlock-workbench-history',action:'undo'}
 await f.event('message',f.win,{source:{},data});await f.event('message',f.win,{source:frame.contentWindow,data:{...data,extra:1}});expect(f.workspace.getWorkbenchCells()).toEqual(moved)
 await f.event('message',f.win,{source:frame.contentWindow,data});expect(f.workspace.getWorkbenchCells()).toEqual(before)
 await act(async()=>f.workspace.updateSelection(['a'],'replace'));await f.event('message',f.win,{source:frame.contentWindow,data:{...data,action:'redo'}});expect(f.workspace.getWorkbenchCells()).toEqual(moved)
 await act(async()=>f.workspace.updateSelection([],'replace'));await f.event('message',f.win,{source:frame.contentWindow,data});expect(f.workspace.getWorkbenchCells()).toEqual(moved)
})
it('整理提示固定在可见画布底部工具栏上方，滚动保持位置',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 await f.event('contextmenu',f.canvas,{clientX:800,clientY:500,button:2});await f.event('click',f.document.querySelector('[data-research-context-arrange]'))
 const notice=f.document.querySelector('[data-research-arrange-feedback]'),bottom=Math.max(86,f.win.innerHeight-700+86)+'px';expect(notice).not.toBeNull();expect(f.canvas.contains(notice)).toBe(false);expect(notice.style.position).toBe('fixed');expect(notice.style.bottom).toBe(bottom);expect(notice.style.left).toBe('500px')
 f.canvas.scrollTop=300;await f.event('scroll',f.canvas);expect(notice.style.bottom).toBe(bottom);expect(notice.style.left).toBe('500px')
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
it('链接组件使用隔离网页容器，顶栏刷新复用当前网页',async()=>{
 const bridge={resolveEngine:vi.fn(async()=>({engine:'native'})),updateNative:vi.fn(async()=>({image:'',error:''})),hideNative:vi.fn(async()=>{}),releaseNative:vi.fn(async()=>{})}
 const f=await fixture(true,{researchLinkFrame:bridge})
 let node;await act(async()=>{node=f.workspace.createWebLink('https://www.baidu.com/')})
 expect(bridge.resolveEngine).toHaveBeenCalledWith({sessionId:'grid-test',nodeId:node.id,url:'https://www.baidu.com/',preferNative:true})
 const element=f.host.querySelector('[data-research-native-web]'),reload=vi.fn(element.__eworkReloadWeb)
 element.__eworkReloadWeb=reload
 await f.event('click',f.host.querySelector('[data-workbench-refresh="'+node.id+'"]'))
 expect(reload).toHaveBeenCalledTimes(1);expect(bridge.releaseNative).not.toHaveBeenCalled()
})
it('首次打开组件菜单不被右侧会话自动滚动关闭，画板滚动仍关闭',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const conversation=f.document.createElement('div');f.document.body.append(conversation)
 expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual([])
 await f.event('click',f.host.querySelector('[data-workbench-more="a"]'))
 expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual(['a'])
 await f.event('scroll',conversation)
 expect(f.document.querySelector('.ew-grid-menu')).not.toBeNull()
 await f.event('scroll',f.canvas)
 expect(f.document.querySelector('.ew-grid-menu')).toBeNull()
})

it('链接组件在网格拖动期间隐藏原生层并暂停捕获，松手后恢复',async()=>{
 const bridge={resolveEngine:vi.fn(async()=>({engine:'native'})),updateNative:vi.fn(async()=>({image:'data:image/png;base64,test',error:''})),hideNative:vi.fn(async()=>{}),releaseNative:vi.fn(async()=>{})}
 const f=await fixture(true,{researchLinkFrame:bridge});let node
 await act(async()=>{node=f.workspace.createWebLink('https://www.baidu.com/');f.workspace.updateSelection([node.id],'replace')})
 const el=f.host.querySelector('[data-research-native-web]')
 el.getBoundingClientRect=()=>({left:12,top:46,right:492,bottom:346,width:480,height:300})
 Object.defineProperties(el,{offsetWidth:{value:480},offsetHeight:{value:300}});f.document.elementFromPoint=()=>el
 await act(async()=>{await new Promise(r=>setTimeout(r,350))})
 expect(bridge.updateNative.mock.calls.some(([value])=>value.active)).toBe(true)
 const count=bridge.updateNative.mock.calls.length
 await act(async()=>{f.canvas.setAttribute('data-grid-operation','move');await new Promise(r=>setTimeout(r,250))})
 expect(bridge.hideNative).toHaveBeenCalled();expect(bridge.updateNative).toHaveBeenCalledTimes(count)
 await act(async()=>{f.canvas.removeAttribute('data-grid-operation');await new Promise(r=>setTimeout(r,350))})
 expect(bridge.updateNative.mock.calls.length).toBeGreaterThan(count)
 expect(bridge.updateNative.mock.lastCall[0].active).toBe(true)
 const restored=bridge.updateNative.mock.calls.length
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="'+node.id+'"]'),{button:0,pointerId:90,clientX:100,clientY:24})
 expect(f.canvas.getAttribute('data-grid-operation')).toBe('move')
 await f.event('blur',f.win)
 expect(f.canvas.hasAttribute('data-grid-operation')).toBe(false)
 await act(async()=>{await new Promise(r=>setTimeout(r,400))})
 expect(bridge.updateNative.mock.calls.length).toBeGreaterThan(restored)
 expect(bridge.updateNative.mock.lastCall[0].active).toBe(true)
 const afterBlur=bridge.updateNative.mock.calls.length
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="'+node.id+'"]'),{button:0,pointerId:94,clientX:100,clientY:24})
 await f.event('keydown',f.canvas,{key:'Escape',code:'Escape'})
 expect(f.canvas.hasAttribute('data-grid-operation')).toBe(false)
 await act(async()=>{await new Promise(r=>setTimeout(r,400))})
 expect(bridge.updateNative.mock.calls.length).toBeGreaterThan(afterBlur)
})

it('指针在同一吸附格内移动只更新浮卡，不反复提交整份画布',async()=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>{w.setArtifacts([text('a'),text('b',740)]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:8},{id:'b',x:20,y:0,w:20,h:8}],true)})
 const apply=vi.spyOn(w,'applyWorkbenchCells'),handle=f.host.querySelector('[data-workbench-drag-handle="a"]')
 await f.event('pointerdown',handle,{button:0,pointerId:91,clientX:200,clientY:24})
 const initial=apply.mock.calls.length
 for(let i=1;i<=5;i++)await f.event('pointermove',f.canvas,{pointerId:91,clientX:200+i,clientY:24+i})
 expect(apply.mock.calls.length).toBe(initial)
 expect(f.host.querySelector('[data-research-node-id="a"]').style.getPropertyValue('--grid-float-left')).not.toBe('')
 await f.event('pointercancel',f.canvas,{pointerId:91})
})

it('链接拖动前发出的迟到截图在松手后也不能覆盖当前快照',async()=>{
 let resolve
 const bridge={resolveEngine:vi.fn(async()=>({engine:'native'})),updateNative:vi.fn(()=>new Promise(r=>{resolve=r})),hideNative:vi.fn(async()=>{}),releaseNative:vi.fn(async()=>{})}
 const f=await fixture(true,{researchLinkFrame:bridge});let node
 await act(async()=>{node=f.workspace.createWebLink('https://www.baidu.com/');f.workspace.updateSelection([node.id],'replace')})
 const el=f.host.querySelector('[data-research-native-web]')
 el.getBoundingClientRect=()=>({left:12,top:46,right:492,bottom:346,width:480,height:300})
 Object.defineProperties(el,{offsetWidth:{value:480},offsetHeight:{value:300}});f.document.elementFromPoint=()=>el
 await act(async()=>{await new Promise(r=>setTimeout(r,150))})
 expect(resolve).toBeTypeOf('function')
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="'+node.id+'"]'),{button:0,pointerId:93,clientX:100,clientY:24})
 await f.event('pointerup',f.canvas,{pointerId:93,clientX:100,clientY:24})
 expect(f.canvas.hasAttribute('data-grid-operation')).toBe(false)
 await act(async()=>resolve({image:'data:image/png;base64,STALE',error:''}))
 expect(el.querySelector('img').getAttribute('src')).not.toBe('data:image/png;base64,STALE')
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

it('工作台和菜单图标统一16px视口与1.5px线宽，Figma路径离线打包',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const header=f.host.querySelector('.ew-grid-header')
 for(const name of ['refresh','ask','more','close']){
  const icon=header.querySelector('[data-workbench-icon="'+name+'"]')
  expect(icon).not.toBeNull();expect(icon.tagName).toBe('SPAN')
  const css=f.document.getElementById('ework-grid-workbench-style').textContent
  const encoded=css.match(new RegExp('\\.ew-grid-icon-'+name+'\\{mask-image:url\\("data:image/svg\\+xml;base64,([^"]+)'))[1]
  const svg=new f.win.DOMParser().parseFromString(Buffer.from(encoded,'base64').toString(),'image/svg+xml')
  expect(svg.documentElement.getAttribute('viewBox')).toBe('0 0 16 16')
  const group=svg.querySelector('[data-icon-family=workbench]')
  expect(group.getAttribute('stroke-width')).toBe('1.5')
  expect([...svg.querySelectorAll('path')].every(path=>!path.hasAttribute('stroke-width'))).toBe(true)
 }
 await f.event('click',header.querySelector('[data-workbench-more]'))
 for(const name of ['duplicate','expand','rename','download','branch','summary','plus','data','remove']){
  const icon=f.document.querySelector('.ew-grid-menu .ew-grid-icon-'+name)
  expect(icon,name).not.toBeNull()
 }
 const css=f.document.getElementById('ework-grid-workbench-style').textContent
 expect(css).not.toContain('figma.com/api/mcp/asset/')
})

it('真实桌面存储接受网格缓存，新增组件及格位在更换服务端口后仍恢复',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ework-grid-durable-')),store=new ResearchCanvasStorage(dir)
 disposals.push(()=>rm(dir,{recursive:true,force:true}))
 const f=await fixture(false,{researchCanvasStorage:{getItem:key=>store.getItem(key),setItem:(key,value)=>store.setItem(key,value)}})
 const native=new f.bundle.ResearchWorkspaceRegistry().for('native-durable')
 native.setCanvasSize({width:1000,height:700,availableWidth:1000});native.setWorkbenchWidth(1000)
 native.setArtifacts([text('source')])
 const draft=native.createContainerDraft(null),link=native.createContainerDraft(null,'link')
 native.applyWorkbenchCells(native.getWorkbenchCells(),true)
 expect(JSON.parse(new ResearchCanvasStorage(dir).getItem('sherlock.research.canvas.artifacts.v1:native-durable')).map(n=>n.id)).toEqual(['source',draft.id,link.id])
 const restored=new f.bundle.ResearchWorkspaceRegistry().for('native-durable')
 restored.setCanvasSize({width:824,height:700,availableWidth:824});restored.setWorkbenchWidth(824)
 expect(restored.getSnapshot().artifacts.map(n=>n.id)).toEqual(['source',draft.id,link.id])
 expect(restored.getWorkbenchCells()).toEqual(native.getWorkbenchCells())
})

it('连续正方形网格与吸附共用原点，拉框无尺寸文字且保留真实组件间距',async()=>{
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
 expect(preview.hasAttribute('data-grid-span')).toBe(false)
 expect(f.document.getElementById('ework-grid-workbench-style').textContent).not.toContain('attr(data-grid-span)')
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
it('更多菜单先就地插入关联草稿，提交调用原生成流程且保留同一节点与来源',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 await f.event('click',f.host.querySelector('[data-workbench-more="a"]'))
 const button=[...f.document.querySelectorAll('.ew-grid-menu button')].find(n=>n.textContent==='基于所选创建')
 await f.event('click',button)
 const draft=f.workspace.getSnapshot().artifacts.find(n=>n.creationMode==='selection'),cell=f.workspace.getWorkbenchCells().find(c=>c.id===draft.id)
 const card=f.host.querySelector('[data-research-node-id="'+draft.id+'"]')
 expect(draft).toMatchObject({generationStatus:'draft',sourceNodeIds:['a'],generationSources:[{id:'a',title:'a'}]})
 expect(card.closest('[data-research-content-layer]')).not.toBeNull()
 expect(f.host.querySelector('[data-research-create-popover]')).toBeNull()
 expect(card.querySelector('[data-workbench-selected-create-context]').textContent).toContain('基于：a')
 const input=f.host.querySelector('[aria-label="创建需求"]');expect(input).not.toBeNull()
 expect(f.document.activeElement).toBe(input)
 input.value='基于这些材料创建趋势分析';await f.event('input',input)
 await f.event('click',f.host.querySelector('[data-research-create-submit]'))
 expect(f.generation.generate).toHaveBeenCalledWith(expect.objectContaining({kind:'create',selectedNodeIds:['a'],targetNodeId:draft.id,prompt:'基于这些材料创建趋势分析'}))
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(2)
 const queued=f.workspace.getSnapshot().artifacts.find(n=>n.id===draft.id)
 expect(queued).toMatchObject({generationStatus:'queued',containerPrompt:'基于这些材料创建趋势分析',sourceNodeIds:['a']})
 expect(queued.generationSources[0].text).toBe('# 真实组件\n保留正文')
 expect(f.workspace.getWorkbenchCells().find(c=>c.id===draft.id)).toEqual(cell)
})
it('恢复录音胶囊不改变工具栏链接按钮的尺寸、图标或隐藏文字',async()=>{
 const f=await fixture(true),toolbar=f.document.querySelector('[data-ework-toolbar]')
 for(const name of ['select','container','link','voice']){
  const button=toolbar.querySelector('[data-research-global-'+name+']'),style=f.win.getComputedStyle(button)
  expect(style.width,name).toBe('44px');expect(style.height,name).toBe('40px')
  const icon=button.querySelector('svg,img,.odyssey-global-icon')
  expect(f.win.getComputedStyle(icon).width,name).toBe('22px')
  for(const label of button.querySelectorAll('span:not(.odyssey-global-icon)'))expect(f.win.getComputedStyle(label).display,name).toBe('none')
 }
})
it('语音先显示工具栏上方的原录音胶囊，识别完成才追加一次组件并执行',async()=>{
 let subscriber
 const bridge={subscribe:fn=>{subscriber=fn;return()=>{}},setActive:vi.fn(async()=>({ok:true})),start:vi.fn(async()=>({ok:true})),stop:vi.fn(async()=>({ok:true})),cancel:vi.fn(async()=>({ok:true}))}
 const f=await fixture(true,{researchVoice:bridge});await act(async()=>f.workspace.setArtifacts([text('a')]))
 await f.event('click',f.document.querySelector('[data-research-global-voice]'))
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(1)
 const feedback=f.document.querySelector('[data-research-voice-feedback]')
 expect(feedback.closest('[data-ework-toolbar]')).not.toBeNull()
 expect(feedback.closest('[data-research-node-id]')).toBeNull()
 expect(f.win.getComputedStyle(feedback).height).toBe('44px')
 expect(f.win.getComputedStyle(feedback.querySelector('[data-research-voice-cancel]')).width).toBe('32px')
 expect(f.win.getComputedStyle(feedback.querySelector('[data-research-voice-finish]')).borderRadius).toBe('50%')
 const request=bridge.start.mock.calls[0][0]
 await act(async()=>{subscriber({...request,type:'state',state:'listening'});subscriber({...request,type:'partial',text:'分析这些金融指标'});subscriber({...request,type:'level',level:.8})})
 expect(feedback.querySelector('[data-research-voice-wave]').getAttribute('data-level')).toBe('0.8')
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(1)
 await f.event('click',feedback.querySelector('[data-research-voice-finish]'))
 expect(bridge.stop).toHaveBeenCalledWith(request)
 expect(f.document.querySelector('[data-research-voice-feedback]').textContent).toContain('识别中')
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(1)
 await act(async()=>{subscriber({...request,type:'final',text:'分析这些金融指标'});subscriber({...request,type:'final',text:'分析这些金融指标'});await new Promise(r=>setTimeout(r,30))})
 const voice=f.workspace.getSnapshot().artifacts.find(n=>n.id!=='a')
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(2)
 expect(f.document.querySelector('[data-research-voice-feedback]')).toBeNull()
 expect(f.generation.generate).toHaveBeenCalledTimes(1)
 expect(f.generation.generate).toHaveBeenCalledWith(expect.objectContaining({kind:'container',targetNodeId:voice.id,prompt:'分析这些金融指标'}))
 const cells=f.workspace.getWorkbenchCells(),existing=cells.find(n=>n.id==='a')
 expect(cells.find(n=>n.id===voice.id).y).toBeGreaterThanOrEqual(existing.y+existing.h)
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
 // Crossing the midpoint may place the active card below the locked peer;
 // that is allowed when the peer's own geometry remains untouched.
 expect(f.workspace.getSnapshot().artifacts.find(n=>n.id==='b')).toEqual(before.find(n=>n.id==='b'))
 expect(f.workspace.getWorkbenchCells().find(n=>n.id==='a').y).toBeGreaterThanOrEqual(f.workspace.getWorkbenchCells().find(n=>n.id==='b').h)
})
it('语音取消、空识别和错误不创建草稿，重试拒绝迟到的旧识别',async()=>{
 let subscriber
 const bridge={subscribe:fn=>{subscriber=fn;return()=>{}},setActive:async()=>({ok:true}),start:vi.fn(async()=>({ok:true})),cancel:vi.fn(async()=>({ok:true}))}
 const f=await fixture(true,{researchVoice:bridge})
 await f.event('click',f.document.querySelector('[data-research-global-voice]'))
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(0)
 const first=bridge.start.mock.calls[0][0]
 await f.event('click',f.document.querySelector('[data-research-voice-cancel]'))
 expect(bridge.cancel).toHaveBeenCalledWith(first)
 await act(async()=>subscriber({...first,type:'final',text:'取消后不得创建'}))
 expect(f.document.querySelector('[data-research-voice-feedback]')).toBeNull()
 expect(f.generation.generate).not.toHaveBeenCalled()
 await f.event('click',f.document.querySelector('[data-research-global-voice]'))
 const second=bridge.start.mock.calls[1][0]
 await act(async()=>subscriber({...second,type:'final',text:'  '}))
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(0)
 expect(f.document.querySelector('[role=alert]').textContent).toContain('没有识别到语音')
 await f.event('click',f.document.querySelector('[data-research-voice-finish]'))
 const third=bridge.start.mock.calls[2][0]
 await act(async()=>{subscriber({...second,type:'final',text:'旧识别不得创建'});subscriber({...third,type:'error',message:'请允许麦克风访问'})})
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(0)
 expect(f.generation.generate).not.toHaveBeenCalled()
 expect(f.document.querySelector('[role=alert]').textContent).toContain('请允许麦克风访问')
})
it.each(['toggle','hold-start'])('语音 Fn %s 不提前创建，自动结束后只提交一次',async gesture=>{
 let subscriber
 const bridge={subscribe:fn=>{subscriber=fn;return()=>{}},setActive:async()=>({ok:true}),start:vi.fn(async()=>({ok:true})),stop:vi.fn(async()=>({ok:true})),cancel:async()=>({ok:true})}
 const f=await fixture(true,{researchVoice:bridge})
 await act(async()=>{subscriber({sessionId:'grid-test',type:gesture});await new Promise(r=>setTimeout(r,30))})
 const request=bridge.start.mock.calls[0][0]
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(0)
 await act(async()=>{subscriber({...request,type:'finish'});subscriber({...request,type:'finish'})})
 expect(bridge.stop).toHaveBeenCalledTimes(1)
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(0)
 await act(async()=>{subscriber({...request,type:'final',text:'创建营收趋势图'});subscriber({...request,type:'final',text:'创建营收趋势图'});await new Promise(r=>setTimeout(r,30))})
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(1)
 expect(f.generation.generate).toHaveBeenCalledTimes(1)
 expect(f.generation.generate).toHaveBeenCalledWith(expect.objectContaining({prompt:'创建营收趋势图'}))
})
it('失败完成时间不作为成功刷新时间',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([{...text('a'),generationStatus:'failed',generationCompletedAt:Date.now()}]))
 await f.event('mouseover',f.host.querySelector('.ew-grid-refresh'))
 expect(f.document.querySelector('[role=tooltip]')?.textContent).toBe('尚未刷新暂无成功刷新记录')
})
it('滚动后的框选覆盖层保留可见坐标，就地衍生卡使用稳定工作台格位与来源',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 f.canvas.scrollTop=600;await f.event('scroll',f.canvas)
 await f.event('pointerdown',f.canvas,{button:0,pointerId:9,clientX:0,clientY:100})
 await f.event('pointermove',f.canvas,{pointerId:9,clientX:900,clientY:250})
 expect(parseFloat(f.host.querySelector('[data-research-marquee]').style.top)).toBe(700)
 await f.event('pointerup',f.canvas,{pointerId:9,clientX:900,clientY:250})
 const baselineCell=f.workspace.getWorkbenchCells().find(c=>c.id==='a')
 const more=f.host.querySelector('[data-workbench-more="a"]');more.getBoundingClientRect=()=>({left:800,top:100,right:820,bottom:124,width:20,height:24})
 await f.event('click',more)
 await f.event('click',[...f.document.querySelectorAll('.ew-grid-menu button')].find(n=>n.textContent==='基于所选创建'))
 const draft=f.workspace.getSnapshot().artifacts.find(n=>n.creationMode==='selection'),cell=f.workspace.getWorkbenchCells().find(c=>c.id===draft.id),card=f.host.querySelector('[data-research-node-id="'+draft.id+'"]')
 expect(f.host.querySelector('[data-research-create-popover]')).toBeNull()
 expect(draft.sourceNodeIds).toEqual(['a'])
 expect(card.querySelector('[data-workbench-selected-create-context]').textContent).toContain('基于：a')
 expect(f.workspace.getWorkbenchCells().find(c=>c.id==='a')).toEqual(baselineCell)
 expect(cell).toMatchObject({x:baselineCell.x+baselineCell.w,y:baselineCell.y})
 const top=parseFloat(card.style.top),left=parseFloat(card.style.left)
 expect(top-draft.height/2).toBeCloseTo(12+cell.y*((1000-14)/40))
 f.canvas.scrollTop=200;await f.event('scroll',f.canvas)
 expect(parseFloat(card.style.top)).toBe(top);expect(parseFloat(card.style.left)).toBe(left)
 expect(f.workspace.getWorkbenchCells().find(c=>c.id===draft.id)).toEqual(cell)
 expect(f.workspace.getSnapshot().artifacts.find(n=>n.id===draft.id).sourceNodeIds).toEqual(['a'])
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

it('历史过小的普通组件显示补足最小尺寸并让位，规范布局不被被动改写',async()=>{
 const f=await fixture(true);await act(async()=>{f.workspace.setArtifacts([text('a'),text('b')]);f.workspace.setCanvasSize({width:500,height:700,availableWidth:500});f.workspace.setWorkbenchWidth(500);f.workspace.applyWorkbenchCells([{id:'a',x:0,y:0,w:4,h:7},{id:'b',x:4,y:0,w:4,h:7}],true)})
 const [a,b]=f.workspace.getSnapshot().artifacts
 expect(parseFloat(f.host.querySelector('[data-research-node-id="a"]').style.width)).toBeCloseTo(a.width,5)
 expect(parseFloat(f.host.querySelector('[data-research-node-id="b"]').style.width)).toBeCloseTo(b.width,5)
 expect(a.x-a.width/2).toBeGreaterThanOrEqual(12)
 expect(a.width).toBeGreaterThanOrEqual(280);expect(a.height).toBeGreaterThanOrEqual(160)
 expect(b.width).toBeGreaterThanOrEqual(280);expect(b.height).toBeGreaterThanOrEqual(160)
 expect(a.y+a.height/2).toBeLessThan(b.y-b.height/2)
 expect(f.workspace.getWorkbenchCells().map(c=>c.w)).toEqual([4,4])
})

it('普通组件单轴及多选缩小都限制280×160，整笔撤销恢复',async()=>{
 const f=await fixture(true),w=f.workspace,step=(1000-14)/40
 await act(async()=>{w.setArtifacts([text('a'),text('b')]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:12},{id:'b',x:20,y:0,w:20,h:12}],true);w.updateSelection(['a'],'replace')})
 const before=w.getWorkbenchCells(),handle=axis=>f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="'+axis+'"]')
 await f.event('pointerdown',handle('x'),{button:0,pointerId:120,clientX:480,clientY:150})
 await f.event('pointerup',f.canvas,{pointerId:120,clientX:480-step*30,clientY:150})
 expect(w.getSnapshot().artifacts.find(n=>n.id==='a').width).toBeGreaterThanOrEqual(280)
 expect(w.getSnapshot().artifacts.find(n=>n.id==='a').width).toBeLessThan(310)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
 await act(async()=>w.updateSelection(['a','b'],'replace'))
 await f.event('pointerdown',handle('y'),{button:0,pointerId:121,clientX:250,clientY:300})
 await f.event('pointerup',f.canvas,{pointerId:121,clientX:250,clientY:300-step*30})
 expect(w.getSnapshot().artifacts.every(n=>n.height>=160&&n.height<185)).toBe(true)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
})

it('滚动后的导出子菜单在可见区域打开',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 f.canvas.scrollTop=600;await f.event('scroll',f.canvas)
 await f.event('click',f.host.querySelector('[data-workbench-more="a"]'),{clientX:800,clientY:110})
 const parent=f.document.querySelector('.ew-grid-menu'),trigger=parent.querySelector('[aria-label="导出"]')
 parent.getBoundingClientRect=()=>({left:400,top:110,right:606,bottom:505,width:206,height:395})
 trigger.getBoundingClientRect=()=>({left:408,top:210,right:598,bottom:243,width:190,height:33})
 await f.event('click',trigger)
 const menu=f.document.querySelector('[aria-label="导出格式"]')
 expect(menu.parentElement).toBe(f.document.body);expect(parseFloat(menu.style.top)).toBe(210)
 expect(parseFloat(menu.style.left)).toBe(610)
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
 expect(f.workspace.getWorkbenchCells()[0]).toMatchObject({x:0,y:0,w:20,h:8})
 await f.event('pointerup',f.canvas,{pointerId:11,clientX:200,clientY:160})
 expect(f.workspace.getWorkbenchCells()[0]).toMatchObject({x:0,y:0,w:20,h:8})
})

it('浮卡按像素连续跟手，预览补位与松手完全一致，撤销恢复邻居',async()=>{
 const f=await fixture(true),w=f.workspace,step=(1000-14)/40
 await act(async()=>{w.setArtifacts([text('a'),text('b',260,500),text('c',740)]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:6},{id:'b',x:0,y:6,w:20,h:9},{id:'c',x:20,y:0,w:20,h:5}],true)})
 const before=w.getWorkbenchCells(),card=f.host.querySelector('[data-research-node-id="a"]'),handle=card.querySelector('[data-workbench-drag-handle]')
 await f.event('pointerdown',handle,{button:0,pointerId:81,clientX:200,clientY:24})
 await f.event('pointermove',f.canvas,{pointerId:81,clientX:207,clientY:24+step*12+7})
 const floatLeft=()=>parseFloat(card.style.getPropertyValue('--grid-float-left'))-parseFloat(card.style.width)/2
 const floatTop=()=>parseFloat(card.style.getPropertyValue('--grid-float-top'))-parseFloat(card.style.height)/2
 expect(floatLeft()).toBeCloseTo(19)
 expect(floatTop()).toBeCloseTo(12+step*12+7)
 // Float and resting nodes share centre coordinates, avoiding a half-card
 // offset while dragging and a coordinate-system jump when released.
 expect(f.win.getComputedStyle(card).transform).toBe('translate(-50%, -50%)')
 const neighbour=f.host.querySelector('[data-research-node-id="b"]')
 expect(f.win.getComputedStyle(neighbour).transition).toContain('top 180ms')
 const resolved=w.getWorkbenchCells(),preview=f.canvas.querySelector('.ew-grid-placeholder'),destination=resolved.find(c=>c.id==='a')
 expect(destination.y).toBe(9)
 expect(parseFloat(preview.style.top)).toBeCloseTo(12+destination.y*step)
 expect(parseFloat(preview.style.top)).not.toBeCloseTo(floatTop())
 expect(w.getWorkbenchCells().find(c=>c.id==='b').y).toBe(0)
 await f.event('pointerup',f.canvas,{pointerId:81,clientX:207,clientY:24+step*12+7})
 expect(w.getWorkbenchCells()).toEqual(resolved)
 expect(card.style.getPropertyValue('--grid-float-top')).toBe('')
 expect(f.win.getComputedStyle(card).transform).toBe('translate(-50%, -50%)')
 expect(preview.hidden).toBe(true)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
})

it('窄窗补高后的可见中线决定换位，不提前按保存高度换位',async()=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>{w.setArtifacts([text('a'),text('b')]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:5},{id:'b',x:0,y:5,w:20,h:5}],true);w.setCanvasSize({width:240,height:700,availableWidth:240});w.setWorkbenchWidth(240)})
 const before=w.getWorkbenchCells(),visible=w.getWorkbenchVisibleCells(),h=visible[0].h
 const cellStep=(240-24+(240-24-40*4)/39)/40
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="a"]'),{button:0,pointerId:82,clientX:40,clientY:24})
 await f.event('pointermove',f.canvas,{pointerId:82,clientX:40,clientY:24+cellStep*h/2})
 expect(w.getWorkbenchCells()).toEqual(before)
 await f.event('pointermove',f.canvas,{pointerId:82,clientX:40,clientY:24+cellStep*(h+1)})
 expect(w.getWorkbenchCells().find(c=>c.id==='a')).toMatchObject({y:5,h:5})
 const resolved=w.getWorkbenchCells()
 await f.event('pointerup',f.canvas,{pointerId:82,clientX:40,clientY:24+cellStep*(h+1)})
 expect(w.getWorkbenchCells()).toEqual(resolved)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
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
it('整理保留当前左右位置关系并紧凑补位，可撤销且再次整理结果稳定',async()=>{
 const f=await fixture();f.workspace.setCanvasSize({width:1000,height:700});f.workspace.setArtifacts([text('a',160,120),text('b',900,1000),text('c',250,2000)]);f.workspace.setWorkbenchWidth(1000)
 const before=f.workspace.getWorkbenchCells()
 expect(f.workspace.organizeCanvas()).toBe(true)
 const arranged=f.workspace.getWorkbenchCells(),a=arranged.find(c=>c.id==='a'),b=arranged.find(c=>c.id==='b'),c=arranged.find(c=>c.id==='c')
 expect(a.x).toBeLessThan(b.x);expect(c.x).toBeLessThan(b.x);expect(c.y).toBe(a.y+a.h)
 expect(Math.min(...arranged.map(c=>c.x))).toBe(0);expect(Math.max(...arranged.map(c=>c.x+c.w))).toBe(40)
 const grid=(await import('../packages/dsh-research-task-runtime/research-grid.js')).createResearchGrid()
 expect(arranged.every((a,i)=>arranged.every((b,j)=>i===j||!grid.overlap(a,b)))).toBe(true)
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

it('整理使用当前HTML的内容测量收紧尺寸，拒绝其他窗口的测量',async()=>{
 const f=await fixture(true),n={...text('html'),kind:'generated-container',containerPrompt:'图表',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'html',title:'图表',html:'<svg height="200"></svg>'}}
 await act(async()=>f.workspace.setArtifacts([n]))
 const frame=f.host.querySelector('iframe[data-research-html-artifact]'),source=frame.contentWindow
 const size={type:'sherlock-workbench-content-size',width:481,height:230}
 await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:{},data:size})))
 await f.event('contextmenu',f.canvas,{clientX:600,clientY:500,button:2})
 await f.event('click',[...f.document.querySelectorAll('button')].find(b=>b.textContent==='整理画布'))
 const fallbackHeight=f.workspace.getSnapshot().artifacts[0].height
 expect(fallbackHeight).toBeLessThan(280)
 await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source,data:size})))
 await f.event('contextmenu',f.canvas,{clientX:600,clientY:500,button:2})
 await f.event('click',[...f.document.querySelectorAll('button')].find(b=>b.textContent==='整理画布'))
 expect(f.workspace.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(288)
 expect(f.workspace.getSnapshot().artifacts[0].height).toBeLessThan(315)
 await act(async()=>f.workspace.undo())
 expect(f.workspace.getSnapshot().artifacts[0].height).toBe(fallbackHeight)
 await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source,data:{...size,height:900,html:'extra'}})))
 await f.event('contextmenu',f.canvas,{clientX:600,clientY:500,button:2})
 await f.event('click',[...f.document.querySelectorAll('button')].find(b=>b.textContent==='整理画布'))
 expect(f.workspace.getSnapshot().artifacts[0].height).toBeLessThan(315)
})

it('原生表格按完整行内容整理，不使用大号默认高度',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('table')]))
 const card=f.host.querySelector('[data-research-node-id="table"]'),body=card.querySelector('[data-research-preview-body]'),table=f.document.createElement('table')
 body.appendChild(table);card.getBoundingClientRect=()=>({left:12,top:12,width:483,height:700,right:495,bottom:712})
 table.getBoundingClientRect=()=>({left:22,top:74,width:463,height:182,right:485,bottom:256})
 await f.event('contextmenu',f.canvas,{clientX:600,clientY:500,button:2})
 await f.event('click',[...f.document.querySelectorAll('button')].find(b=>b.textContent==='整理画布'))
 const height=f.workspace.getSnapshot().artifacts[0].height
 expect(height).toBeGreaterThanOrEqual(252);expect(height).toBeLessThan(280)
})

it('一次整理等待改宽后的HTML自然高度，整次操作只撤销一步',async()=>{
 const f=await fixture(true),w=f.workspace,n=id=>({...text(id),kind:'generated-container',containerPrompt:'文章',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'html',title:id,html:'<p>文章 '+id+'</p>'}})
 await act(async()=>{w.setArtifacts([n('a'),n('b')]);w.applyWorkbenchCells([{id:'a',x:2,y:0,w:15,h:20},{id:'b',x:23,y:0,w:15,h:20}],true)})
 const before=w.getWorkbenchCells(),frames=['a','b'].map(id=>f.host.querySelector('[data-research-node-id="'+id+'"] iframe'))
 const send=async(frame,width,height)=>act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:frame.contentWindow,data:{type:'sherlock-workbench-content-size',width,height}})))
 for(const frame of frames)await send(frame,358,300)
 await f.event('contextmenu',f.canvas,{clientX:600,clientY:500,button:2})
 await f.event('click',[...f.document.querySelectorAll('button')].find(b=>b.textContent==='整理画布'))
 expect(w.getSnapshot().artifacts.every(n=>n.width<600)).toBe(true)
 for(const frame of frames)await send(frame,481,600)
 await act(async()=>new Promise(r=>setTimeout(r,450)))
 expect(w.getSnapshot().artifacts.every(n=>n.height>=658&&n.height<690)).toBe(true)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
 await send(frames[0],481,900)
 expect(w.getWorkbenchCells()).toEqual(before)
})
it('整理的二次测高保留智能草稿的规范最小尺寸',async()=>{
 const f=await fixture(true),w=f.workspace;let node
 await act(async()=>{node=w.createContainerDraft()})
 const before=w.getWorkbenchCells(),card=f.host.querySelector('[data-research-node-id="'+node.id+'"]')
 card.getBoundingClientRect=()=>({left:12,top:12,width:500,height:300,right:512,bottom:312})
 for(const element of card.querySelectorAll('textarea,input,p'))element.getBoundingClientRect=()=>({left:22,top:60,width:400,height:25,right:422,bottom:85})
 await f.event('contextmenu',f.canvas,{clientX:650,clientY:500,button:2})
 await f.event('click',[...f.document.querySelectorAll('button')].find(b=>b.textContent==='整理画布'))
 await act(async()=>new Promise(r=>setTimeout(r,700)))
 expect(w.getWorkbenchDocument().artifacts[0].height).toBeGreaterThanOrEqual(220)
 expect(f.canvas.__eworkContentFit).toBeUndefined()
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
})
it('整理自然高度回报后仍填通栏前的大空位，并把整次补位保存在一步撤销中',async()=>{
 const f=await fixture(true),w=f.workspace,grid=(await import('../packages/dsh-research-task-runtime/research-grid.js')).createResearchGrid(),m=grid.metrics(1000)
 const before=[{id:'gold',x:0,y:0,w:20,h:8},{id:'chart',x:20,y:0,w:20,h:15},{id:'derived',x:0,y:8,w:20,h:14},{id:'pharma',x:0,y:22,w:20,h:8},{id:'table',x:0,y:30,w:40,h:9}]
 await act(async()=>{w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setArtifacts(before.map(c=>({...text(c.id),kind:'generated-container',containerPrompt:'内容',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'html',title:c.id,html:'<p>'+c.id+'</p>'},...(c.id==='derived'?{creationMode:'selection',sourceNodeIds:['gold']}:{})})));w.applyWorkbenchCells(before,true)})
 const frames=new Map(before.map(c=>[c.id,f.host.querySelector('[data-research-node-id="'+c.id+'"] iframe')]))
 for(const c of before)await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:frames.get(c.id).contentWindow,data:{type:'sherlock-workbench-content-size',width:Math.round(c.w*m.step-m.gap-2),height:Math.floor(c.h*m.step-m.gap-58)}})))
 await f.event('contextmenu',f.canvas,{clientX:600,clientY:500,button:2});await f.event('click',[...f.document.querySelectorAll('button')].find(b=>b.textContent==='整理画布'))
 await act(async()=>new Promise(r=>setTimeout(r,700)))
 const packed=w.getWorkbenchCells(),at=id=>packed.find(c=>c.id===id)
 expect(at('pharma')).toMatchObject({x:20,y:15,h:8});expect(at('table')).toMatchObject({y:23,h:9})
 expect(at('chart').h).toBe(15);expect(at('derived').y+at('derived').h).toBe(23)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
})
it('导出向右展开仅三个格式，SVG按当前内容区比例并拒收非所属窗口回复',async()=>{
 const save=vi.fn(async()=>({status:'saved'})),f=await fixture(true,{researchCanvasExport:{save}})
 await act(async()=>f.workspace.setArtifacts([{...text('export'),kind:'generated-container',containerPrompt:'图表',refreshMinutes:0,generationStatus:'completed',containerSpec:{version:1,type:'html',title:'图表',html:'<svg></svg>'}}]))
 await f.event('click',f.host.querySelector('[data-workbench-more="export"]'))
 const menu=f.document.querySelector('.ew-grid-menu'),trigger=menu.querySelector('[aria-label="导出"]')
 expect(menu.textContent).not.toContain('编辑与导出')
 menu.getBoundingClientRect=()=>({left:210,top:80,right:416,bottom:475,width:206,height:395})
 trigger.getBoundingClientRect=()=>({left:218,top:170,right:408,bottom:203,width:190,height:33})
 await f.event('mouseover',trigger)
 const popup=f.document.querySelector('[aria-label="导出格式"]');expect(popup.textContent).toBe('SVGPNGJPG');expect(parseFloat(popup.style.left)).toBeGreaterThanOrEqual(420)
 const frame=f.host.querySelector('iframe[data-research-html-artifact]'),post=vi.spyOn(frame.contentWindow,'postMessage')
 await f.event('click',popup.querySelector('button'))
 const request=post.mock.calls.find(([d])=>d.type==='sherlock-workbench-export')[0],svg='<svg xmlns="http://www.w3.org/2000/svg" width="460" height="280" viewBox="0 0 460 280"><text x="1" y="10">当前筛选数据</text></svg>'
 await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:f.win,data:{type:'sherlock-workbench-export-result',id:request.id,svg}})))
 expect(save).not.toHaveBeenCalled()
 await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:frame.contentWindow,data:{type:'sherlock-workbench-export-result',id:request.id,svg}})))
 expect(save).toHaveBeenCalledWith({kind:'text',format:'svg',suggestedName:'export.svg',content:svg})
 expect(f.document.querySelector('.ew-grid-menu')).toBeNull()
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
 const paths=['重命名','导出','数据源与自动更新'].map(label=>{const button=[...menu.querySelectorAll('button')].find(n=>n.textContent===label||n.getAttribute('aria-label')===label);return button.querySelector('[data-workbench-icon]')?.getAttribute('data-workbench-icon')||button.querySelector('path')?.getAttribute('d')})
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
 const f=await fixture(true);await act(async()=>{f.workspace.setArtifacts([text('a'),text('b',740)]);f.workspace.updateSelection(['a'],'replace')})
 const card=f.host.querySelector('[data-research-node-id="a"]'),other=f.host.querySelector('[data-research-node-id="b"]'),ring=card.querySelector('.ew-grid-selection-ring'),preview=f.canvas.querySelector('.ew-grid-placeholder')
 const down=async id=>f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="x"]'),{button:0,pointerId:id,clientX:480,clientY:250})
 await down(29);await f.event('pointermove',f.canvas,{pointerId:29,clientX:620,clientY:320})
 expect(preview.hidden).toBe(false)
 expect(f.win.getComputedStyle(ring).display).toBe('none')
 expect(other.querySelector('.ew-grid-selection-ring')).toBeNull()
 expect(Number(f.win.getComputedStyle(preview).zIndex)).toBeGreaterThan(Number(f.win.getComputedStyle(card).zIndex))
 await f.event('pointerup',f.canvas,{pointerId:29,clientX:620,clientY:320})
 expect(preview.hidden).toBe(true);expect(f.win.getComputedStyle(ring).display).not.toBe('none')
 await down(30);await f.event('pointercancel',f.canvas,{pointerId:30})
 expect(preview.hidden).toBe(true);expect(f.win.getComputedStyle(ring).display).not.toBe('none')
})

it('多选拖动一个高度手柄时一起缩放、单步撤销、取消恢复整组',async()=>{
 const f=await fixture(true),w=f.workspace,step=(1000-14)/40
 await act(async()=>{w.setArtifacts([text('a'),text('b',740),text('c')]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:8},{id:'b',x:20,y:0,w:20,h:10},{id:'c',x:0,y:10,w:40,h:6}],true);w.updateSelection(['a','b'],'replace')})
 const before=w.getWorkbenchCells(),handle=()=>f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="y"]')
 const down=id=>f.event('pointerdown',handle(),{button:0,pointerId:id,clientX:200,clientY:200})
 await down(91);await f.event('pointermove',f.canvas,{pointerId:91,clientX:200,clientY:200+3*step})
 expect(w.getWorkbenchCells().find(c=>c.id==='a').h).toBe(11)
 expect(w.getWorkbenchCells().find(c=>c.id==='b').h).toBe(13)
 expect(w.getWorkbenchCells().find(c=>c.id==='c').y).toBe(13)
 expect([...f.canvas.querySelectorAll('.ew-grid-placeholder:not([hidden])')]).toHaveLength(2)
 for(const id of ['a','b'])expect(f.win.getComputedStyle(f.host.querySelector('[data-research-node-id="'+id+'"] .ew-grid-selection-ring')).display).toBe('none')
 await f.event('pointerup',f.canvas,{pointerId:91,clientX:200,clientY:200+3*step})
 expect(w.getSnapshot().selection.selectedNodeIds).toEqual(['a','b'])
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
 await down(92);await f.event('pointermove',f.canvas,{pointerId:92,clientX:200,clientY:200+4*step});await f.event('pointercancel',f.canvas,{pointerId:92})
 expect(w.getWorkbenchCells()).toEqual(before)
 expect(f.canvas.querySelectorAll('.ew-grid-placeholder:not([hidden])')).toHaveLength(0)
})

it('窄窗多选调高从实际显示高度同步增量，未操作宽度与取消仍保留规范值',async()=>{
 const f=await fixture(true),w=f.workspace,step=(500-14)/40
 await act(async()=>{w.setArtifacts([text('a'),text('b',740)]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:5},{id:'b',x:20,y:0,w:20,h:12}],true);w.setCanvasSize({width:500,height:700,availableWidth:500});w.setWorkbenchWidth(500);w.updateSelection(['a','b'],'replace')})
 const canonical=w.getWorkbenchCells(),visible=w.getWorkbenchVisibleCells(),a=visible.find(c=>c.id==='a'),b=visible.find(c=>c.id==='b')
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="y"]'),{button:0,pointerId:93,clientX:100,clientY:100})
 await f.event('pointermove',f.canvas,{pointerId:93,clientX:100,clientY:100+step})
 expect(w.getWorkbenchVisibleCells().find(c=>c.id==='a').h).toBe(a.h+1)
 expect(w.getWorkbenchVisibleCells().find(c=>c.id==='b').h).toBe(b.h+1)
 expect(w.getWorkbenchCells().map(c=>c.w)).toEqual(canonical.map(c=>c.w))
 await f.event('pointercancel',f.canvas,{pointerId:93})
 expect(w.getWorkbenchCells()).toEqual(canonical)
})

it('窄窗多选调宽从草稿实际宽度同步增量，边界限制不会反向缩小',async()=>{
 const f=await fixture(true),w=f.workspace,step=(500-14)/40;let draft
 await act(async()=>{w.setArtifacts([text('b')]);draft=w.createContainerDraft();w.applyWorkbenchCells([{id:draft.id,x:0,y:0,w:10,h:10},{id:'b',x:0,y:10,w:20,h:12}],true);w.setCanvasSize({width:500,height:700,availableWidth:500});w.setWorkbenchWidth(500);w.updateSelection([draft.id,'b'],'replace')})
 const canonical=w.getWorkbenchCells(),visible=w.getWorkbenchVisibleCells()
 const handle=()=>f.canvas.querySelector('[data-workbench-resize="'+draft.id+'"][data-workbench-resize-axis="x"]')
 await f.event('pointerdown',handle(),{button:0,pointerId:94,clientX:100,clientY:100})
 await f.event('pointermove',f.canvas,{pointerId:94,clientX:100+step,clientY:100})
 for(const id of [draft.id,'b'])expect(w.getWorkbenchVisibleCells().find(c=>c.id===id).w).toBe(visible.find(c=>c.id===id).w+1)
 expect(w.getWorkbenchCells().map(c=>c.h)).toEqual(canonical.map(c=>c.h))
 await f.event('pointercancel',f.canvas,{pointerId:94});expect(w.getWorkbenchCells()).toEqual(canonical)
 await act(async()=>w.applyWorkbenchCells(canonical.map(c=>c.id===draft.id?{...c,x:20}:c),true))
 const edge=w.getWorkbenchCells(),edgeVisible=w.getWorkbenchVisibleCells()
 await f.event('pointerdown',handle(),{button:0,pointerId:95,clientX:100,clientY:100})
 await f.event('pointermove',f.canvas,{pointerId:95,clientX:100+step,clientY:100})
 expect(w.getWorkbenchCells()).toEqual(edge)
 expect(w.getWorkbenchVisibleCells()).toEqual(edgeVisible)
 await f.event('pointercancel',f.canvas,{pointerId:95})
})

it('窄窗多选调宽不保存未选草稿的被动补宽，恢复宽窗及撤销取消不漂移',async()=>{
 const f=await fixture(true),w=f.workspace,step=(700-14)/40;let draft
 await act(async()=>{w.setArtifacts([text('a'),text('c')]);draft=w.createContainerDraft();w.applyWorkbenchCells([{id:'a',x:0,y:0,w:17,h:10},{id:draft.id,x:17,y:0,w:8,h:10},{id:'c',x:0,y:10,w:17,h:10}],true);w.updateSelection(['a','c'],'replace')})
 const canonical=w.getWorkbenchCells(),wideWidth=w.getSnapshot().artifacts.find(n=>n.id===draft.id).width
 await act(async()=>{w.setCanvasSize({width:700,height:700,availableWidth:700});w.setWorkbenchWidth(700)})
 expect(w.getWorkbenchVisibleCells().find(c=>c.id===draft.id).w).toBe(20)
 const handle=()=>f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="x"]')
 await f.event('pointerdown',handle(),{button:0,pointerId:96,clientX:100,clientY:100})
 await f.event('pointerup',f.canvas,{pointerId:96,clientX:100+step,clientY:100})
 expect(w.getWorkbenchCells().filter(c=>['a','c'].includes(c.id)).map(c=>c.w)).toEqual([18,18])
 expect(w.getWorkbenchCells().find(c=>c.id===draft.id)).toMatchObject({x:18,w:8,h:10})
 await act(async()=>{w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000)})
 expect(w.getSnapshot().artifacts.find(n=>n.id===draft.id).width).toBe(wideWidth)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(canonical)
 await act(async()=>{w.setCanvasSize({width:700,height:700,availableWidth:700});w.setWorkbenchWidth(700)})
 await f.event('pointerdown',handle(),{button:0,pointerId:97,clientX:100,clientY:100})
 await f.event('pointermove',f.canvas,{pointerId:97,clientX:100+step*2,clientY:100})
 await f.event('pointercancel',f.canvas,{pointerId:97});expect(w.getWorkbenchCells()).toEqual(canonical)
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
 expect(w.getWorkbenchCells().find(c=>c.id==='a').h).toBe(15)
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
 expect(w.getWorkbenchCells()[0]).toMatchObject({x:0,y:0,w:25,h:5})
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

it('调宽预览压缩同排组件，松手使用预览并一次撤销恢复双方',async()=>{
 const f=await fixture(true);await act(async()=>{f.workspace.setArtifacts([text('a'),text('b')]);f.workspace.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:10},{id:'b',x:20,y:0,w:20,h:10}],true);f.workspace.updateSelection(['a'],'replace')})
 const before=f.workspace.getWorkbenchCells(),step=(1000-14)/40,handle=f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="x"]')
 await f.event('pointerdown',handle,{button:0,pointerId:87,clientX:490,clientY:200})
 await f.event('pointermove',f.canvas,{pointerId:87,clientX:490+step*6,clientY:200})
 await act(async()=>new Promise(r=>setTimeout(r,40)))
 const preview=f.workspace.getWorkbenchCells()
 expect(preview.find(c=>c.id==='b')).toMatchObject({x:26,y:0,w:14,h:10})
 await f.event('pointerup',f.canvas,{pointerId:87,clientX:490+step*6,clientY:200})
 expect(f.workspace.getWorkbenchCells()).toEqual(preview)
 await act(async()=>f.workspace.undo());expect(f.workspace.getWorkbenchCells()).toEqual(before)
})

it('宿主组件滚动条仅选中时显示，覆盖旧规则且不改变可滚动尺寸',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const style=f.document.createElement('style');style.textContent='body [data-research-artifact-card]:not(:has(.rScV5Q_webFrame)) :is(.rScV5Q_previewBody,.rScV5Q_artifactBody,.odyssey-component-primary,.rScV5Q_containerMarkdown,.rScV5Q_containerTableScroll,.rScV5Q_mindMap,.odyssey-generation-records,textarea){scrollbar-width:none!important}';f.document.head.append(style)
 const scroller=f.host.querySelector('[data-research-preview-body]')
 expect(f.win.getComputedStyle(scroller).getPropertyValue('scrollbar-width')).toBe('thin')
 expect(f.win.getComputedStyle(scroller).overflow).toBe('auto')
 const card=scroller.closest('[data-research-node-id]'),thumb=()=>f.win.getComputedStyle(card).getPropertyValue('--grid-scroll-thumb')
 expect(thumb()).toBe('transparent')
 await act(async()=>f.workspace.updateSelection(['a'],'replace'))
 expect(thumb()).toBe('#74778055')
 await act(async()=>f.workspace.updateSelection([],'replace'))
 expect(thumb()).toBe('transparent')
 expect(f.win.getComputedStyle(scroller).getPropertyValue('scrollbar-width')).toBe('thin')
})
