import {runInNewContext} from 'node:vm'
import {createRequire} from 'node:module'
import {Window} from 'happy-dom'
import {describe,it,expect} from 'vitest'
import {createResearchGrid} from '../packages/dsh-research-task-runtime/research-grid.js'
import * as gridState from '../scripts/lib/research-grid-state.mjs'
// Load the same untransformed functions used by the patch script; Vite rewrites
// imported free symbols, which cannot be serialized into the page factory.
const {useWorkbenchGrid,workbenchGridPattern,handleWorkbenchWheel}=createRequire(import.meta.url)('../scripts/lib/research-grid-ui.mjs')

// The hook is serialized into the page factory in production. Capture its
// effects so this fixture can run the actual scroll-layer effect without the
// unrelated iframe, chart, ResizeObserver and pointer installation effect.
function scrollFixture({height=700,bottom=0,toolbar=true,planning=false,viewportY=0}={}) {
 const win=new Window(),root=win.document.createElement('div'),layer=win.document.createElement('div'),effects=[]
 root.setAttribute('data-research-canvas','');layer.setAttribute('data-research-content-layer','');root.appendChild(layer);win.document.body.appendChild(root)
 if(toolbar)root.setAttribute('data-workbench-toolbar-space','')
 Object.defineProperties(root,{clientWidth:{value:1000},clientHeight:{value:height},scrollHeight:{get:()=>Number.parseFloat(layer.style.height)||height}})
 const nodes=bottom?[Object.freeze({id:'last-card',kind:'pasted-text',x:300,y:bottom-100,width:560,height:200})]:[]
 let current={files:[],artifacts:planning?[]:nodes,canvasSize:{availableWidth:1000,height},viewport:{x:0,y:viewportY,scale:1},selection:{selectedNodeIds:[]}}
 const workspace={getWorkbenchPlanningNodes:()=>planning?nodes:[],getSnapshot:()=>current,setViewport:viewport=>{current={...current,viewport}}}
 const context={...gridState,createResearchGrid,CSS:win.CSS,ResizeObserver:win.ResizeObserver,MutationObserver:win.MutationObserver,react:{useLayoutEffect:effect=>effects.push(effect),useEffect:()=>{}}}
 context.workbenchGridPattern=runInNewContext('('+workbenchGridPattern.toString()+')',context)
 const hook=runInNewContext('('+useWorkbenchGrid.toString()+')',context)
 const layout=()=>{effects.length=0;hook({rootRef:{current:root},workspace,sessionId:'scroll-clearance',snapshot:current});effects[1]()}
 layout()
 return {root,layer,nodes,getSnapshot:()=>current,layout,wheel:deltaY=>handleWorkbenchWheel(root,workspace,{target:root,deltaY,deltaX:0,deltaMode:0,preventDefault(){},stopPropagation(){}})}
}

describe('研究看板底部滚动余量',()=>{
 it('最后组件仍在视口内接近底栏时，向下滚动能将底部完整移出遮挡区域且不改变组件',()=>{
  const f=scrollFixture({bottom:650}),before=structuredClone(f.nodes)
  f.wheel(500)
  expect(f.root.scrollTop).toBe(175)
  expect(f.getSnapshot().viewport.y).toBe(-175)
  expect(650-f.root.scrollTop).toBeLessThan(614) // 700px viewport minus the existing 86px toolbar zone.
  expect(f.nodes).toEqual(before)
  f.layout()
  expect(f.root.scrollTop).toBe(175)
 })
 it('未占满视口的规划占位同样留出滚动余量',()=>{
  const f=scrollFixture({bottom:650,planning:true})
  f.wheel(500)
  expect(f.root.scrollTop).toBe(175)
 })
 it('短窗口至少留160px组件底部空间',()=>{
  const f=scrollFixture({height:400,bottom:375})
  f.wheel(500)
  expect(f.root.scrollTop).toBe(160)
  expect(375-f.root.scrollTop).toBe(215)
 })
 it('恰到75%阈值时能够开始向下滑动',()=>{
  const f=scrollFixture({bottom:525})
  f.wheel(500)
  expect(f.root.scrollTop).toBe(175)
 })
 it.each([0,320,524])('空看板及仅占顶部空间的看板不新增滚动：内容底部%s',bottom=>{
  const f=scrollFixture({bottom})
  f.wheel(500)
  expect(f.root.scrollTop).toBe(0)
  expect(f.getSnapshot().viewport.y).toBe(0)
 })
 it('内容已超出视口时保留已有15格尾部余量',()=>{
  const f=scrollFixture({bottom:800})
  f.wheel(2000)
  expect(f.root.scrollTop).toBe(470) // ceil(800 + 15 * 24.65) - 700, from the existing 1000px grid.
 })
 it('可滚动尾部缩回少量顶部组件时，将旧viewport限制回可视范围',()=>{
  const f=scrollFixture({bottom:320,viewportY:-200})
  expect(f.root.scrollTop).toBe(0)
  expect(Math.abs(f.getSnapshot().viewport.y)).toBe(0)
 })
})
