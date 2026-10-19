import {it,expect,vi} from 'vitest'
import {Window} from 'happy-dom'
import {runInNewContext} from 'node:vm'
import {createWorkbenchStyleState,workbenchFramePresentation} from '../scripts/lib/workbench-style-client.mjs'
import {workbenchStylePalette,validWorkbenchStyleMessage,installWorkbenchStyleMessages} from '../packages/dsh-research-task-runtime/workbench-style.js'
import {createResearchGrid} from '../packages/dsh-research-task-runtime/research-grid.js'
import {installWorkbenchPointer} from '../scripts/lib/research-grid-ui.mjs'

it('试用样式按看板保存并能切回原样式，不改变其他看板的默认偏好',()=>{
 const saved=new Map(),storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)}
 const a=createWorkbenchStyleState(storage,'trial')
 expect(a.get()).toBeNull();expect(a.set('openterminal')).toBe(true)
 expect(createWorkbenchStyleState(storage,'trial').get()).toBe('openterminal')
 expect(createWorkbenchStyleState(storage,'existing-board').get()).toBeNull()
 expect(a.set('dark')).toBe(true);expect(createWorkbenchStyleState(storage,'trial').get()).toBe('dark')
})

it('生成组件的父子展示桥接收试用模板并使用深色，不接收任意外部样式',()=>{
 const w=new Window(),doc=w.document
 doc.body.innerHTML='<main data-ework-grid data-workbench-style="openterminal"><iframe></iframe></main>'
 const message=workbenchFramePresentation(doc.querySelector('iframe'))
 expect(message).toMatchObject({mode:'openterminal',controlTheme:'light'})
 expect(validWorkbenchStyleMessage(message)).toBe(true)
 runInNewContext('('+installWorkbenchStyleMessages.toString()+')()',{
  addEventListener:w.addEventListener.bind(w),dispatchEvent:w.dispatchEvent.bind(w),document:doc,parent:w.parent,CustomEvent:w.CustomEvent,validWorkbenchStyleMessage,
 })
 w.dispatchEvent(new w.MessageEvent('message',{source:{},data:message}))
 expect(doc.documentElement.dataset.workbenchStyle).toBeUndefined()
 w.dispatchEvent(new w.MessageEvent('message',{source:w.parent,data:message}))
 expect(doc.documentElement.dataset.workbenchStyle).toBe('openterminal')
 expect(workbenchStylePalette('openterminal')).toMatchObject({bg:'#0a0a0a',text:'#d9d9d9','control-primary':'#ff9900'})
})

function pointerFixture(){
 const w=new Window(),doc=w.document,root=doc.createElement('main'),grid=createResearchGrid()
 const errors=[];w.addEventListener('error',e=>errors.push(e.error))
 root.dataset.eworkGrid='';root.dataset.workbenchStyle='openterminal';doc.body.append(root)
 Object.defineProperties(root,{clientWidth:{value:1000},clientHeight:{value:800}})
 root.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:800,right:1000,bottom:800})
 let cells=[{id:'card',x:0,y:0,w:20,h:20}],selected=['card']
 const nodes=grid.project([{id:'card',kind:'pasted-text'}],cells,1000)
 root.innerHTML='<article data-research-node-id="card"><header data-workbench-drag-handle="card">原有组件顶栏</header><footer>原有数据来源底栏</footer></article><button data-workbench-resize="card" data-workbench-resize-axis="xy"></button>'
 w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=()=>{}
 const workspace={getSnapshot:()=>({canvasSize:{availableWidth:1000},selection:{selectedNodeIds:selected},files:[],artifacts:nodes}),getWorkbenchPlanningNodes:()=>[],getWorkbenchCells:()=>cells,getWorkbenchVisibleCells:()=>cells,applyWorkbenchCells:next=>{cells=next},persist:vi.fn(),cancelPointerGeometry:vi.fn(),updateSelection:ids=>{selected=ids}}
 const install=runInNewContext('('+installWorkbenchPointer.toString()+')',{document:doc,createResearchGrid,CSS:{escape:value=>value},handleWorkbenchMultiSelect:()=>false})
 const stop=install(root,workspace,{current:'select'},()=>{},false)
 const fire=(target,type,x,y)=>{target.dispatchEvent(new w.PointerEvent(type,{bubbles:true,button:0,pointerId:1,clientX:x,clientY:y}));if(errors.length)throw errors[0]}
 return {w,root,workspace,fire,cells:()=>cells,stop}
}

it('右下角拖拽同时改变宽高并保存，原有顶栏和底栏节点保持不变',()=>{
 const f=pointerFixture(),header=f.root.querySelector('header'),footer=f.root.querySelector('footer')
 f.fire(f.root.querySelector('button'),'pointerdown',480,480)
 f.fire(f.w,'pointermove',550,560);f.fire(f.w,'pointerup',550,560)
 expect(f.cells()[0].w).toBeGreaterThan(20);expect(f.cells()[0].h).toBeGreaterThan(20)
 expect(f.workspace.persist).toHaveBeenCalledOnce()
 expect(f.root.querySelector('header')).toBe(header);expect(f.root.querySelector('footer')).toBe(footer)
 f.stop()
})

it('角落缩放按 Escape 取消并恢复原始尺寸，不写入布局',()=>{
 const f=pointerFixture()
 f.fire(f.root.querySelector('button'),'pointerdown',480,480);f.fire(f.w,'pointermove',550,560)
 f.w.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape'}))
 expect(f.cells()).toEqual([{id:'card',x:0,y:0,w:20,h:20}]);expect(f.workspace.persist).not.toHaveBeenCalled()
 expect(f.root.hasAttribute('data-grid-operation')).toBe(false);f.stop()
})
